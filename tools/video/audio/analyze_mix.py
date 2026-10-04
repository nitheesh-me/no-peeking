#!/usr/bin/env python3
"""Mix analysis: where is the mix "all over the place", and why.

usage: analyze_mix.py [videos/final/work/trailer]   (a mix work dir: mix.wav, mixreport.json, stems/)

Measures, per cue-sheet section and over time (100 ms hop):
  - loudness (BS.1770 K-weighted): momentary 400 ms and short-term 3 s, for the mix and for every stem
    (stems scaled by the report's master gain so they compare with the mix)
  - the anticipation curve: section short-term medians against the order the trailer needs
  - spikes: momentary peaks far above the local music bed (jarring SFX), with the stem that caused them
  - jumps: sudden mix level changes (> 6 LU within 200 ms) that do NOT sit on a cut or a named hit
  - music automation: the music stem against the untouched song = ducking/automation gain curve; pumping
  - spectral balance per section (5 bands) and presence-band masking (SFX against music, 2-5 kHz)
  - the groove layer's beat alignment against the cue-sheet grid (onset autocorrelation)
  - stereo: L/R correlation and side/mid ratio per section; true peak (4x oversampled); clipping
Writes <work>/mix_analysis.json, videos/final/review/<video>_mix_analysis.md and
videos/review/<video>_mix_analysis.png (and registers them on the progress board).
"""
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / 'progress'))
from progress import Progress  # noqa: E402

FPS = 60
HOP = 0.1  # s
# Sound Designer: a centred 3 s short-term window cannot measure a section shorter than ~3.5 s (the 1.6 s silences
# would read their neighbours: half of every window is the build or the drop). Such sections use the median
# MOMENTARY loudness of their interior instead (column `level`; `level_metric` says which).
SHORT_SECTION_S = 3.5
# a jump detected on the 400 ms centred momentary curve (difference over 200 ms) sits up to 12 (half window)
# + 6 (half the difference span) frames from the edit that causes it
JUMP_MARK_TOLERANCE_F = 20
BANDS = [('sub', 20, 60), ('low', 60, 250), ('mid', 250, 2000), ('presence', 2000, 5000), ('air', 5000, 16000)]
# the trailer's intended energy order (from the cue-sheet mix notes and the Critic's anticipation rule)
EXPECT = [('cold_open', '<', 'build'), ('peek', '<', 'drop'), ('build', '<', 'drop'), ('silence', '<<', 'build'),
          ('proof', '<', 'drop'), ('lights_out', '<', 'payoff'), ('closing_musicbox', '<', 'payoff')]


def read(path):
    sr, x = wavfile.read(path)
    if x.dtype == np.int32:
        x = x.astype(np.float64) / 2 ** 31
    elif x.dtype == np.int16:
        x = x.astype(np.float64) / 2 ** 15
    else:
        x = x.astype(np.float64)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    return sr, x


def kweight(x, sr):
    assert sr == 48000, 'K-weighting coefficients are for 48 kHz'
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def loud_curve(x, sr, win):
    """K-weighted loudness (LUFS) of a sliding window `win` s, sampled every HOP s (centred)."""
    k = kweight(x, sr)
    p = (k ** 2).sum(1)
    c = np.concatenate([[0.0], np.cumsum(p)])
    n, w, h = len(p), int(win * sr), int(HOP * sr)
    t = np.arange(0, n, h)
    a = np.clip(t - w // 2, 0, n)
    b = np.clip(t + w // 2, 0, n)
    ms = (c[b] - c[a]) / np.maximum(1, b - a)
    return t / sr, -0.691 + 10 * np.log10(np.maximum(ms, 1e-12))


def band_db(x, sr, lo, hi):
    sos = signal.butter(4, [lo, min(hi, sr / 2 - 100)], btype='band', fs=sr, output='sos')
    y = signal.sosfilt(sos, x.mean(1))
    return 10 * np.log10(np.mean(y ** 2) + 1e-14)


def true_peak(x, sr):
    up = signal.resample_poly(x, 4, 1, axis=0)
    return 20 * np.log10(np.max(np.abs(up)) + 1e-12)


def onset_env(x, sr):
    mono = x.mean(1)
    sos = signal.butter(2, 150, btype='high', fs=sr, output='sos')
    e = np.abs(signal.sosfilt(sos, mono))
    h = sr // 200  # 5 ms
    e = e[: len(e) // h * h].reshape(-1, h).mean(1)
    d = np.maximum(0, np.diff(np.log(e + 1e-6)))
    return d, 200.0


def grid_alignment(x, sr, bpm, beat0_s):
    """How well the layer's onsets sit on the beat grid: mean onset strength at grid beats vs off-grid."""
    d, rate = onset_env(x, sr)
    beat = 60 / bpm
    if d.sum() < 1e-6:
        return None
    best = None
    for off_ms in range(-60, 61, 5):  # search the phase offset that best explains the onsets
        idx = []
        t = beat0_s + off_ms / 1000
        while t < len(d) / rate:
            if t > 0:
                idx.append(int(t * rate))
            t += beat / 2  # eighths
        idx = np.array([i for i in idx if i < len(d)])
        s = d[idx].mean() / (d.mean() + 1e-9)
        if best is None or s > best[1]:
            best = (off_ms, s)
    return {'best_offset_ms': best[0], 'on_grid_strength_ratio': round(float(best[1]), 2)}


def nearest(t_frame, frames):
    if not frames:
        return None, None
    i = int(np.argmin([abs(f - t_frame) for f in frames]))
    return frames[i], t_frame - frames[i]


def edl_cut_frames(work):
    p = work / 'edl.resolved.json'
    if not p.exists():
        return []
    e = json.load(open(p))
    out = set()
    for c in e.get('clips', []):
        for k in ('start', 'at', 'timeline_start', 't0'):
            if isinstance(c.get(k), (int, float)):
                out.add(int(c[k]))
    return sorted(out)


def main():
    work = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'videos/final/work/trailer').resolve()
    rep = json.load(open(work / 'mixreport.json'))
    video = rep.get('video', work.name)
    prog = Progress(f'mix-analysis:{video}', title=f'Mix analysis: {video}', total=9, unit='steps', agent=os.environ.get('NP_AGENT', 'sound'))
    cue = json.load(open(ROOT / rep['cue_sheet']))
    sections = [(s['name'], s['start_frame'], s['end_frame']) for s in cue['sections']]
    hits = cue.get('named_hits', {})
    hit_frames = sorted(set(int(v) for v in hits.values()))
    cuts = edl_cut_frames(work)
    bpm = rep.get('bpm', cue['bpm'])
    beat0 = cue['beats'][0]['frame'] / FPS if cue.get('beats') and isinstance(cue['beats'][0], dict) else 50 / FPS
    # stems written by mix.py already include the master gain (mixreport.stems_scaled_by_master_gain); scaling them
    # again inflated every per-stem level by the master gain (~+5 dB). Only scale stems that are pre-master.
    g = 1.0 if rep.get('stems_scaled_by_master_gain') else 10 ** (rep.get('master_gain_db', 0) / 20)

    sr, mix = read(ROOT / rep['mix'])
    stems = {}
    for name, p in rep['stems'].items():
        if (ROOT / p).exists():
            _, s = read(ROOT / p)
            n = min(len(s), len(mix))
            stems[name] = s[:n] * g
    song_path = ROOT / rep['music']['path']
    _, song = read(song_path) if song_path.exists() else (None, None)
    prog.tick(1, stage='loudness curves')

    t, mix_m = loud_curve(mix, sr, 0.4)
    _, mix_s = loud_curve(mix, sr, 3.0)
    st_m, st_s = {}, {}
    for k, s in stems.items():
        _, st_m[k] = loud_curve(s, sr, 0.4)
        _, st_s[k] = loud_curve(s, sr, 3.0)
        st_m[k], st_s[k] = st_m[k][: len(t)], st_s[k][: len(t)]
    song_s = None
    if song is not None:
        _, song_s = loud_curve(song[: len(mix)], sr, 3.0)
        _, song_m = loud_curve(song[: len(mix)], sr, 0.4)
        song_s, song_m = song_s[: len(t)], song_m[: len(t)]
    fr = t * FPS
    prog.tick(2, stage='sections')

    def sel(a, b):
        return (fr >= a) & (fr < b)

    sec = []
    for name, a, b in sections:
        m = sel(a, b)
        if not m.any():
            continue
        short = (b - a) / FPS < SHORT_SECTION_S
        mi = sel(a + 12, b - 12) if (b - a) > 30 else m  # interior: skip the momentary window's smear at the cuts
        row = {'section': name, 'frames': [a, b], 'seconds': [round(a / FPS, 2), round(b / FPS, 2)],
               'mix_short_median': round(float(np.median(mix_s[m])), 1), 'mix_short_max': round(float(mix_s[m].max()), 1),
               'mix_momentary_median': round(float(np.median(mix_m[mi])), 1),
               'level_metric': 'momentary median (interior)' if short else 'short-term median',
               'level': round(float(np.median(mix_m[mi])), 1) if short else round(float(np.median(mix_s[m])), 1),
               'mix_momentary_max': round(float(mix_m[m].max()), 1),
               'spread_LU (p95-p10 momentary)': round(float(np.percentile(mix_m[m], 95) - np.percentile(mix_m[m], 10)), 1)}
        for k in st_s:
            row[f'{k}_short_median'] = round(float(np.median(st_s[k][m])), 1)
            row[f'{k}_level'] = round(float(np.median(st_m[k][mi])), 1) if short else row[f'{k}_short_median']
        if song_s is not None:
            gain = st_s['music'][m] - song_s[m] if 'music' in st_s else None
            if gain is not None:
                row['music_automation_dB (median, min, max)'] = [round(float(np.median(gain)), 1), round(float(gain.min()), 1), round(float(gain.max()), 1)]
        dom = max(st_s, key=lambda k: row[f'{k}_level']) if st_s else None
        row['dominant_stem'] = dom
        sec.append(row)
    prog.tick(3, stage='anticipation curve')

    med = {r['section']: r['level'] for r in sec}
    curve = []
    for a, op, b in EXPECT:
        if a in med and b in med:
            need = 6 if op == '<<' else 1
            ok = med[b] - med[a] >= need
            curve.append({'rule': f'{a} {op} {b}', 'values': [med[a], med[b]], 'diff_LU': round(med[b] - med[a], 1), 'need_LU': need, 'pass': bool(ok)})
    peak_pre_silence = float(mix_m[fr < 1298].max()) if (fr < 1298).any() else None
    post_drop = sel(1394, 1394 + 2 * FPS)
    peak_post_drop = float(mix_m[post_drop].max()) if post_drop.any() else None
    drop_rule = None
    if peak_pre_silence is not None and peak_post_drop is not None:
        drop_rule = {'rule': 'loudest momentary in the 2 s after the drop >= loudest before the silence + 2 LU',
                     'pre_silence_max': round(peak_pre_silence, 1), 'post_drop_max': round(peak_post_drop, 1),
                     'pass': peak_post_drop >= peak_pre_silence + 2}
    prog.tick(4, stage='spikes and jumps')

    # spikes: momentary mix far above the music bed at that moment
    bed = st_s.get('music', song_s if song_s is not None else mix_s)
    spikes = []
    over = mix_m - bed
    i = 0
    while i < len(t):
        if over[i] > 10 and mix_m[i] > -30:
            j = i
            while j + 1 < len(t) and over[j + 1] > 10:
                j += 1
            k = i + int(np.argmax(mix_m[i:j + 1]))
            cause = max(st_m, key=lambda s: st_m[s][k]) if st_m else None
            spikes.append({'t': round(float(t[k]), 2), 'frame': int(fr[k]), 'mix_momentary': round(float(mix_m[k]), 1),
                           'above_music_LU': round(float(over[k]), 1), 'cause': cause})
            i = j + 1
        i += 1
    # jumps: > 6 LU change within 200 ms (momentary), off any cut/hit (±4 frames)
    jumps = []
    dm = mix_m[2:] - mix_m[:-2]
    marks = sorted(set(hit_frames + cuts))
    for i in np.where(np.abs(dm) > 6)[0]:
        if mix_m[i + 2] < -40 and mix_m[i] < -40:
            continue
        f = int(fr[i + 1])
        nf, off = nearest(f, marks)
        if nf is None or abs(off) > JUMP_MARK_TOLERANCE_F:
            if jumps and f - jumps[-1]['frame'] < 12:
                continue
            jumps.append({'t': round(float(t[i + 1]), 2), 'frame': f, 'change_LU': round(float(dm[i]), 1),
                          'nearest_mark': nf, 'off_frames': off})
    prog.tick(5, stage='music automation / pumping')

    pumping = None
    if song_s is not None and 'music' in st_m:
        gm = st_m['music'] - song_m
        gm = signal.medfilt(gm, 3)
        dips = []
        i = 0
        while i < len(gm):
            if gm[i] < np.median(gm) - 4:
                j = i
                while j + 1 < len(gm) and gm[j + 1] < np.median(gm) - 4:
                    j += 1
                if (j - i + 1) * HOP < 1.0 and song_m[i] > -35:
                    dips.append({'t': round(float(t[i]), 2), 'len_s': round((j - i + 1) * HOP, 1), 'depth_dB': round(float(np.median(gm) - gm[i:j + 1].min()), 1)})
                i = j + 1
            i += 1
        pumping = {'short_dips_over_4dB': len(dips), 'per_minute': round(len(dips) / (len(gm) * HOP / 60), 1), 'examples': dips[:15]}
    prog.tick(6, stage='spectrum + masking')

    spec = []
    for name, a, b in sections:
        sa, sb = int(a / FPS * sr), int(b / FPS * sr)
        if sb - sa < sr // 4:
            continue
        row = {'section': name}
        for bn, lo, hi in BANDS:
            row[f'mix_{bn}'] = round(band_db(mix[sa:sb], sr, lo, hi), 1)
        if 'sfx' in stems and 'music' in stems:
            row['presence_sfx_minus_music_dB'] = round(band_db(stems['sfx'][sa:sb], sr, 2000, 5000) - band_db(stems['music'][sa:sb], sr, 2000, 5000), 1)
            row['low_sfx_minus_music_dB'] = round(band_db(stems['sfx'][sa:sb], sr, 60, 250) - band_db(stems['music'][sa:sb], sr, 60, 250), 1)
        # stereo
        L, R = mix[sa:sb, 0], mix[sa:sb, 1]
        row['LR_correlation'] = round(float(np.corrcoef(L, R)[0, 1]) if L.std() > 1e-6 and R.std() > 1e-6 else 1.0, 2)
        mid, side = (L + R) / 2, (L - R) / 2
        row['side_minus_mid_dB'] = round(10 * np.log10((side ** 2).mean() + 1e-14) - 10 * np.log10((mid ** 2).mean() + 1e-14), 1)
        spec.append(row)
    prog.tick(7, stage='groove alignment + peaks')

    groove = {}
    for sg in rep.get('score_segments', []):
        src = ROOT / 'videos/audio2/groove' / f"{sg['source']}.wav"
        if sg['source'] in groove or not src.exists():
            continue
        _, gx = read(src)
        groove[sg['source']] = grid_alignment(gx, sr, bpm, beat0)
    song_align = grid_alignment(song[: len(mix)], sr, bpm, beat0) if song is not None else None
    peaks = {'true_peak_dbtp_mix': round(true_peak(mix, sr), 2), 'samples_over_-0.1dBFS': int((np.abs(mix) > 10 ** (-0.1 / 20)).sum()),
             'dc_offset': [round(float(mix[:, 0].mean()), 5), round(float(mix[:, 1].mean()), 5)]}
    prog.tick(8, stage='report + plot')

    findings = []
    for c in curve:
        if not c['pass']:
            findings.append(f"Anticipation: `{c['rule']}` fails ({c['values'][0]} vs {c['values'][1]} LUFS short-term median, needs +{c['need_LU']} LU).")
    if drop_rule and not drop_rule['pass']:
        findings.append(f"Drop is not the peak: loudest before the silence {drop_rule['pre_silence_max']} vs after the drop {drop_rule['post_drop_max']} LUFS momentary.")
    for r in sec:
        if r['spread_LU (p95-p10 momentary)'] > 12 and r['section'] not in ('silence', 'closing_silence'):
            findings.append(f"`{r['section']}` swings {r['spread_LU (p95-p10 momentary)']} LU inside the section (p95-p10 momentary): level is jumpy.")
    if len(spikes) > 6:
        causes = {}
        for s in spikes:
            causes[s['cause']] = causes.get(s['cause'], 0) + 1
        findings.append(f"{len(spikes)} spikes > 10 LU above the music bed (causes: {causes}). They read as jarring pops, not hits.")
    if len(jumps) > 3:
        findings.append(f"{len(jumps)} sudden level jumps (> 6 LU in 200 ms) that sit on no cut or named hit, e.g. " + ', '.join(f"{j['t']} s" for j in jumps[:6]) + '.')
    if pumping and pumping['per_minute'] > 6:
        findings.append(f"Music pumps: {pumping['short_dips_over_4dB']} short ducking dips > 4 dB ({pumping['per_minute']}/min). The bed audibly breathes under every SFX.")
    for r in spec:
        if r.get('presence_sfx_minus_music_dB', -99) > 6:
            findings.append(f"`{r['section']}`: SFX sit {r['presence_sfx_minus_music_dB']} dB above the music in 2-5 kHz: harsh/forward.")
        if r['LR_correlation'] < 0.2 and r['section'] not in ('silence', 'closing_silence'):
            findings.append(f"`{r['section']}`: L/R correlation {r['LR_correlation']}: phasey/wide, may collapse in mono (phone).")
    for k, v in groove.items():
        if v and abs(v['best_offset_ms']) > 15:
            findings.append(f"Groove layer `{k}` sits {v['best_offset_ms']} ms off the song's beat grid: flams against the song.")
    if song_align and groove:
        for k, v in groove.items():
            if v and song_align and abs(v['best_offset_ms'] - song_align['best_offset_ms']) > 15:
                findings.append(f"`{k}` and the song disagree on beat phase by {v['best_offset_ms'] - song_align['best_offset_ms']} ms.")
    if peaks['true_peak_dbtp_mix'] > -1.0:
        findings.append(f"True peak {peaks['true_peak_dbtp_mix']} dBTP (> -1.0).")

    out = {'video': video, 'mix': rep['mix'], 'integrated_lufs': rep['loudness'].get('integrated_lufs'), 'lra': rep['loudness'].get('lra_lu'),
           'sections': sec, 'anticipation': curve, 'drop_rule': drop_rule, 'spikes': spikes, 'jumps': jumps, 'pumping': pumping,
           'spectrum_stereo': spec, 'groove_alignment': groove, 'song_alignment': song_align, 'peaks': peaks, 'findings': findings}
    jp = work / 'mix_analysis.json'
    json.dump(out, open(jp, 'w'), indent=1)

    # plot
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(3, 1, figsize=(18, 11), sharex=True, gridspec_kw={'height_ratios': [3, 1.3, 1]})
    cols = {'music': '#7a5af8', 'sfx': '#e0702a', 'design': '#1f9d6b', 'voices': '#c43c8a'}
    for i, (name, a, b) in enumerate(sections):
        for x in ax:
            x.axvspan(a / FPS, b / FPS, color='#000' if i % 2 else '#fff', alpha=0.04)
        ax[0].text((a + b) / 2 / FPS, -4, name, ha='center', fontsize=8, rotation=0, color='#555')
    ax[0].plot(t, mix_m, color='#999', lw=0.6, label='mix momentary')
    ax[0].plot(t, mix_s, color='#111', lw=2, label='mix short-term')
    for k in st_s:
        ax[0].plot(t, st_s[k], color=cols.get(k, '#888'), lw=1.2, label=f'{k} short-term')
    if song_s is not None:
        ax[0].plot(t, song_s, color='#7a5af8', lw=1, ls=':', label='song (untouched) short-term')
    for s in spikes:
        ax[0].plot(s['t'], s['mix_momentary'], 'v', color='#d64545', ms=6)
    for j in jumps:
        ax[0].axvline(j['t'], color='#d64545', lw=0.6, ls='--')
    for f in hit_frames:
        ax[0].axvline(f / FPS, color='#aaa', lw=0.5)
    ax[0].set_ylim(-50, -2)
    ax[0].set_ylabel('LUFS')
    ax[0].legend(loc='lower left', fontsize=8, ncol=4)
    ax[0].set_title(f'{video} mix: loudness by stem (▼ spike > 10 LU over music, red dashes = jump off any cut/hit, grey = named hits)')
    if song_s is not None and 'music' in st_m:
        ax[1].plot(t, signal.medfilt(st_m['music'] - song_m, 3), color='#7a5af8', lw=1)
        ax[1].axhline(0, color='#888', lw=0.5)
        ax[1].set_ylim(-24, 12)
        ax[1].set_ylabel('music automation\n(stem − song, dB)')
    corr = []
    for name, a, b in sections:
        r = next((r for r in spec if r['section'] == name), None)
        if r:
            ax[2].bar((a + b) / 2 / FPS, r.get('presence_sfx_minus_music_dB', 0), width=(b - a) / FPS * 0.9, color='#e0702a', alpha=0.6)
    ax[2].axhline(0, color='#888', lw=0.5)
    ax[2].axhline(6, color='#d64545', lw=0.5, ls='--')
    ax[2].set_ylabel('SFX − music\n2–5 kHz (dB)')
    ax[2].set_xlabel('seconds')
    fig.tight_layout()
    png = ROOT / 'videos/review' / f'{video}_mix_analysis.png'
    png.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(png, dpi=110)

    md = [f'# Mix analysis: {video}', '', f"`{rep['mix']}` · integrated {out['integrated_lufs']} LUFS · LRA {out['lra']} LU · true peak {peaks['true_peak_dbtp_mix']} dBTP", '',
          f'Plot: `{png.relative_to(ROOT)}` · data: `{jp.relative_to(ROOT)}`', '', '## Findings', '']
    md += [f'- {f}' for f in findings] or ['- none']
    md += ['', '## Sections (level = short-term median LUFS; sections < 3.5 s: interior momentary median, marked *)', '',
           '| section | mix | max M | spread | ' + ' | '.join(st_s) + ' | music automation (med/min/max dB) | dominant |',
           '|---' * (6 + len(st_s)) + '|']
    for r in sec:
        star = '*' if r['level_metric'].startswith('momentary') else ''
        md.append(f"| {r['section']}{star} | {r['level']} | {r['mix_momentary_max']} | {r['spread_LU (p95-p10 momentary)']} | " +
                  ' | '.join(str(r.get(f'{k}_level')) for k in st_s) + f" | {r.get('music_automation_dB (median, min, max)')} | {r['dominant_stem']} |")
    md += ['', '## Anticipation curve', ''] + [f"- {'PASS' if c['pass'] else 'FAIL'} `{c['rule']}`: {c['values'][0]} → {c['values'][1]} ({c['diff_LU']:+} LU, need +{c['need_LU']})" for c in curve]
    if drop_rule:
        md.append(f"- {'PASS' if drop_rule['pass'] else 'FAIL'} drop is the peak: before silence {drop_rule['pre_silence_max']}, after drop {drop_rule['post_drop_max']}")
    md += ['', f'## Spikes > 10 LU over the music ({len(spikes)})', ''] + [f"- {s['t']} s (f{s['frame']}): {s['mix_momentary']} LUFS M, +{s['above_music_LU']} LU, cause {s['cause']}" for s in spikes[:30]]
    md += ['', f'## Jumps off any cut/hit ({len(jumps)})', ''] + [f"- {j['t']} s (f{j['frame']}): {j['change_LU']:+} LU; nearest mark f{j['nearest_mark']} ({j['off_frames']:+} fr)" for j in jumps[:30]]
    if pumping:
        md += ['', f"## Music pumping: {pumping['short_dips_over_4dB']} dips > 4 dB shorter than 1 s ({pumping['per_minute']}/min)", ''] + [f"- {d['t']} s: −{d['depth_dB']} dB for {d['len_s']} s" for d in pumping['examples']]
    md += ['', '## Spectrum and stereo per section (dB, relative)', '', '| section | ' + ' | '.join(b[0] for b in BANDS) + ' | SFX−music 2–5k | SFX−music low | L/R corr | side−mid |', '|---' * (5 + len(BANDS)) + '|']
    for r in spec:
        md.append(f"| {r['section']} | " + ' | '.join(str(r[f'mix_{b[0]}']) for b in BANDS) + f" | {r.get('presence_sfx_minus_music_dB')} | {r.get('low_sfx_minus_music_dB')} | {r['LR_correlation']} | {r['side_minus_mid_dB']} |")
    md += ['', '## Beat alignment (onset strength on the 8th-note grid; offset that fits best)', '', f'- song: {song_align}'] + [f'- {k}: {v}' for k, v in groove.items()]
    md += ['', f"## Peaks: {peaks}"]
    mp = ROOT / 'videos/final/review' / f'{video}_mix_analysis.md'
    mp.parent.mkdir(parents=True, exist_ok=True)
    mp.write_text('\n'.join(md) + '\n')
    prog.output(png, 'mix analysis plot')
    prog.output(mp, 'mix analysis report')
    prog.done(f'{len(findings)} finding(s)')
    print('\n'.join(md[:12 + len(findings)]))
    print('report:', mp.relative_to(ROOT))


if __name__ == '__main__':
    main()
