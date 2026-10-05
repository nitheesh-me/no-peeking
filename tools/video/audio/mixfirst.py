"""Music-first trailer mixing (the user: "the audio mixing is all over the place!!"; the Director's brief).

The music drives, the SFX punctuate:
  automate_music   ride the music bed (song + score segments) to a per-section SHORT-TERM target, measured
                   exactly like analyze_mix.py (centred 3 s windows, 100 ms hop); smooth curves only
                   (bar-wise ramps in ramp sections, a slow rider in 'ride' sections, >= 150 ms boundary
                   ramps that finish ON the downbeat when rising and start ON it when falling)
  level_cues       an SFX WINDOW instead of a floor: featured hits +3..+7 LU over the music's momentary level
                   at their moment (proof <= +5), the QUIET answer ~4 LU under its BEEP, non-featured layers
                   6-10 dB UNDER the music; hits in true silence get an absolute level
  bus_process      SFX/design bus: 3:1 compressor (10 ms / 120 ms, <= 4 dB GR) + transient limit 3 dB over the
                   bus's typical peak
  glue             full-mix 2:1 glue (30 ms attack, 150 ms release, ~1.5-2 dB GR in the loud sections)
  phone_sim        mono, HPF 250 Hz, LPF 7 kHz, a small-speaker resonance and a little saturation
"""
from __future__ import annotations

import numpy as np
from scipy import signal
from scipy.ndimage import uniform_filter1d

import dsp

SR = dsp.SR
FPS = 60
CR = 100  # control rate for the automation (Hz)
# the music-first stage runs 6 dB under its post-master targets (headroom on the float buses); the master gain
# restores the level, and every relation (music shape, SFX windows) is unchanged by a uniform offset
PRE_OFFSET_DB = -6.0
# momentary ceilings on the MUSIC (post-master LUFS-M): the song's own pre-drop riser must stay under the drop
CEILINGS = {'build': -13.5, 'peek': -14.0, 'cold_open': -16.0}

# per-section music targets (analyze_mix short-term median, LUFS, post-master); tuple = linear ramp start→end
TARGETS = {
    'cold_open': -24.0, 'peek': ('ride', -21.0), 'build': (-22.0, -17.0), 'silence': None, 'drop': -8.5,
    'proof': -15.0, 'montage': -12.0, 'lights_out': -20.0, 'payoff': -8.5, 'closing_musicbox': ('ride', -22.0),
    'closing_silence': None, 'snap_circuit_reveal': -13.0, 'end_card': (-15.0, -26.0),
}


def centred_short_term(x, hop=1.0 / CR, win=3.0):
    """analyze_mix.loud_curve: K-weighted loudness of a CENTRED window, sampled every hop."""
    k = dsp.kweight(x)
    p = (k ** 2).sum(1)
    c = np.concatenate([[0.0], np.cumsum(p)])
    n, w, h = len(p), int(win * SR), int(hop * SR)
    t = np.arange(0, n, h)
    a = np.clip(t - w // 2, 0, n)
    b = np.clip(t + w // 2, 0, n)
    ms = (c[b] - c[a]) / np.maximum(1, b - a)
    return -0.691 + 10 * np.log10(np.maximum(ms, 1e-12))


def automate_music(music, sections, downbeats, targets=TARGETS, offset_db=PRE_OFFSET_DB, iters=4, ramp_s=0.2):
    """Returns (music * gain, gain_db at control rate, report). sections: [(name, a_frame, b_frame)]."""
    n = len(music)
    nc = n // (SR // CR) + 1
    t = np.arange(nc) / CR
    g = np.zeros(nc)
    rep = {}
    secs = [(nm, a / FPS, b / FPS) for nm, a, b in sections]
    for it in range(iters):
        y = music * dsp.undb(np.interp(np.arange(n) / SR, t, g))[:, None]
        S3 = centred_short_term(y)[:nc]
        S3 = np.pad(S3, (0, max(0, nc - len(S3))), mode='edge')
        M4 = centred_short_term(y, win=0.4)[:nc]
        M4 = np.pad(M4, (0, max(0, nc - len(M4))), mode='edge')
        for nm, a, b in secs:
            tg = targets.get(nm)
            short = (b - a) < 3.5  # same metric as analyze_mix: short sections = interior momentary median
            S = uniform_filter1d(M4, size=int(0.5 * CR), mode='nearest') if short else S3
            m = (t >= a + (0.2 if short else 0)) & (t < b - (0.2 if short else 0))
            if tg is None or not m.any():
                continue
            live = m & (S > -60)
            if not live.any():
                continue
            if isinstance(tg, tuple) and tg[0] == 'ride':
                d = tg[1] + offset_db - S[m]
                med = np.median(tg[1] + offset_db - S[live])
                d = np.clip(d, med - 6, med + 18)
                d = uniform_filter1d(d, size=int(1.0 * CR), mode='nearest')
                g[m] += 0.85 * d
            elif isinstance(tg, tuple):  # linear ramp of the TARGET across the section, bar by bar
                bars = [x / FPS for x in downbeats if a * FPS <= x <= b * FPS]
                bars = sorted(set([a] + bars + [b]))
                cen, dl = [], []
                for x0, x1 in zip(bars, bars[1:]):
                    mm = (t >= x0) & (t < x1) & (S > -60)
                    if not mm.any():
                        continue
                    u = ((x0 + x1) / 2 - a) / (b - a)
                    cen.append((x0 + x1) / 2)
                    dl.append(tg[0] + (tg[1] - tg[0]) * u + offset_db - np.median(S[mm]))
                if dl:
                    dd = np.interp(t[m], cen, dl)
                    g[m] += np.clip(dd, np.median(dd) - 6, np.median(dd) + 6)
            else:
                g[m] += tg + offset_db - np.median(S[live])
        g = np.clip(g, -24, 24)
        # boundary ramps: rising finishes ON the boundary, falling starts ON it (>= ramp_s, raised cosine)
        r = int(ramp_s * CR)
        for (_, _, b), (nm2, a2, _) in zip(secs, secs[1:]):
            i = int(round(a2 * CR))
            if i - r < 1 or i + r >= nc:
                continue
            gl, gr = g[i - r - 1], g[min(nc - 1, i + r)]
            if gr >= gl:
                seg = slice(i - r, i)
            else:
                seg = slice(i, i + r)
            L = seg.stop - seg.start
            w = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, L))
            g[seg] = gl + (gr - gl) * w
    # momentary ceilings (post-master): the build may swell, but never out-shout the drop
    for nm, a, b in secs:
        cl = CEILINGS.get(nm)
        if cl is None:
            continue
        y = music * dsp.undb(np.interp(np.arange(n) / SR, t, g))[:, None]
        M4 = centred_short_term(y, win=0.4)[:nc]
        M4 = np.pad(M4, (0, max(0, nc - len(M4))), mode='edge')
        m = (t >= a) & (t < b)
        over = np.where(m, np.maximum(0.0, M4 - (cl + offset_db)), 0.0)
        over = np.maximum.accumulate(over[::-1])[::-1] * 0 + over  # keep shape
        red = uniform_filter1d(over, size=int(0.3 * CR), mode='nearest')
        red = np.maximum(red, uniform_filter1d(over, size=int(0.1 * CR), mode='nearest'))
        g -= red
        rep.setdefault('ceilings', {})[nm] = {'ceiling_momentary': cl, 'max_reduction_db': round(float(red.max()), 1)}
    y = music * dsp.undb(np.interp(np.arange(n) / SR, t, g))[:, None]
    S3 = centred_short_term(y)[:nc]
    M4 = centred_short_term(y, win=0.4)[:nc]
    for nm, a, b in secs:
        short = (b - a) < 3.5
        S = M4 if short else S3
        m = (t[:len(S)] >= a + (0.2 if short else 0)) & (t[:len(S)] < b - (0.2 if short else 0))
        if m.any():
            tg = targets.get(nm)
            rep[nm] = {'target': tg if not isinstance(tg, tuple) else list(tg), 'music_short_median': round(float(np.median(S[m])), 1),
                       'gain_db_median': round(float(np.median(g[:len(S)][m])), 1),
                       'gain_db_range': [round(float(g[:len(S)][m].min()), 1), round(float(g[:len(S)][m].max()), 1)]}
    return y, g, rep


def _mmax_series(x, hop=0.01):
    return dsp.momentary(dsp.fit(x, max(len(x), int(0.4 * SR))), hop)


def cue_vs_music(q, music, gain_db=0.0):
    """(cue max momentary, music momentary in the SAME 400 ms window, window start s) — like mix.measure."""
    x = q['x'] * dsp.undb(gain_db)
    cm = _mmax_series(x)
    k = int(np.argmax(cm))
    w0 = q['start'] + int(k * 0.01 * SR)
    seg = music[w0:w0 + int(0.4 * SR)]
    mm = float(dsp.momentary(dsp.fit(seg, int(0.4 * SR)), 0.4)[0]) if len(seg) else -120.0
    return float(cm[k]), mm, w0 / SR


def level_cues(cues, music, sections, P):
    """Set every cue's gain_db by the window rules. Returns a list of per-cue decisions."""
    W = P.get('window', {'hit': (3.0, 7.0, 5.0), 'proof': (3.0, 5.0, 4.0), 'cohit': (0.0, 4.0, 1.5), 'pre': (3.0, 7.0, 3.5), 'pocket': (-3.0, 2.0, -1.0), 'cohit_song': (0.0, 4.0, 2.5), 'under': -8.0,
                         'phrase': (0.0, 3.0, 1.0), 'accent': (-6.0, 4.0, 0.0),
                         'silent_abs': -21.0 + PRE_OFFSET_DB, 'quiet_below_beep': 4.5})
    sec_of = lambda f: next((nm for nm, a, b in sections if a <= f < b), None)
    out = []
    # groups: cues starting within 3 frames sound as one event
    for q in cues:  # held breath: room tone always stays at its asset level (-60 dBFS RMS), never grouped
        if str(q['name']).startswith('room_tone'):
            out.append({'id': q['id'], 'rule': 'room tone: asset level', 'delta_db': 0.0})
    order = sorted((q for q in cues if not str(q['name']).startswith('room_tone')), key=lambda q: q['start'])
    beds = [q for q in order if not q['featured'] and (q.get('bed') or q.get('riser') or len(q['x']) > 2.0 * SR)]
    order = [q for q in order if q not in beds]  # beds are levelled on their own, never inside a hit's group
    groups, cur = [], []
    for q in order:
        if cur and q['frame'] - cur[0]['frame'] > 3:
            groups.append(cur)
            cur = []
        cur.append(q)
    if cur:
        groups.append(cur)
    beeps = {}
    groups = [[b] for b in beds] + groups
    for grp in groups:
        feat = [q for q in grp if q['featured']]
        lead = feat or grp
        # combined cue level of the group at gain 0 and the music at its moment
        cms = []
        for q in lead:
            c, m, ws = cue_vs_music(q, music, q['gain_db'])
            cms.append((c, m, ws, q))
        comb = 10 * np.log10(sum(10 ** (c / 10) for c, _, _, _ in cms))
        mus = max(m for _, m, _, _ in cms)
        sec = sec_of(lead[0]['frame'])
        is_quiet = any('_quiet' in str(q['src']) for q in lead)
        if all(str(q['name']).startswith('room_tone') for q in grp):  # held breath: always the asset level (-60 dBFS)
            for q in grp:
                out.append({'id': q['id'], 'rule': 'room tone: asset level', 'delta_db': 0.0})
            continue
        long_bed = all(len(q['x']) > 2.0 * SR or q.get('bed') or q.get('riser') for q in grp) and not feat
        if long_bed:  # beds/risers/ambience: integrated over the span vs the music over the span, 8 dB under
            for q in grp:
                a, b = q['start'], q['start'] + len(q['x'])
                if q.get('riser'):  # risers peak at their END: level the peak, 6 dB under the music at that moment
                    c, m, _ = cue_vs_music(q, music, q['gain_db'])
                    d = (m + q.get('under_db', -8.0)) - c if m > -50 else 0.0
                    q['gain_db'] += d
                    out.append({'id': q['id'], 'rule': 'riser: peak 8 dB under the music', 'delta_db': round(d, 2)})
                    continue
                mi = dsp.integrated(music[a:b]) if b - a > SR // 2 else -70
                ci = dsp.integrated(q['x']) + q['gain_db']
                if mi < -50:  # the music is silent here (room tone in the silences): leave the asset level
                    out.append({'id': q['id'], 'rule': 'bed in silence: asset level', 'delta_db': 0.0})
                    continue
                d = (mi + q.get('under_db', W['under'])) - ci
                q['gain_db'] += d
                out.append({'id': q['id'], 'rule': f"bed {W['under']} dB under the music", 'delta_db': round(d, 2)})
            continue
        win = None
        if mus < -45:  # true silence (BEEP, snap after the closing silence): absolute level
            tgt, rule = W['silent_abs'], 'hit in silence: absolute'
        elif not feat:
            tgt, rule = mus + W['under'], f"non-featured {W['under']} dB under the music"
            win = (-99.0, W['under'] + 2.0)
        elif any(q.get('phrase') or str(q['name']).startswith('sig_b') for q in feat):
            lo, hi, aim = W['phrase']  # a dense pitched phrase IS music (the motif in key): sits just over the bed
            tgt, rule, win = mus + aim, 'phrase window (pitched letters)', (lo, hi)
        elif all(q.get('accent') for q in feat):
            lo, hi, aim = W['accent']  # 60 ms card clicks: readable, never a spike
            tgt, rule, win = mus + aim, 'card accent window', (lo, hi)
        elif any(q.get('no_duck') for q in feat):
            lo, hi, aim = W['cohit']
            tgt, rule, win = mus + aim, 'drop co-hit (no ducking)', (lo, hi)
        elif sec in ('payoff', 'snap_circuit_reveal'):
            lo, hi, aim = W['cohit_song']  # ON the song's own biggest hits (payoff slam, final chord): the music is the hero
            tgt, rule, win = mus + aim, f'{sec} co-hit window', (lo, hi)
        elif sec == 'lights_out':
            lo, hi, aim = W['pocket']  # the chord IS the picture here, but never above the pocket's music
            tgt, rule, win = mus + aim, 'Lights Out pocket window (SFX at most equal to the music)', (lo, hi)
        elif sec == 'proof':
            lo, hi, aim = W['proof']
            tgt, rule, win = mus + aim, 'proof cue window', (lo, hi)
        elif sec in ('cold_open', 'peek', 'build'):
            lo, hi, aim = W['pre']  # before the silence: hits stay low in the window so the drop is the peak
            tgt, rule, win = mus + aim, 'featured hit window (pre-drop)', (lo, hi)
        else:
            lo, hi, aim = W['hit']
            tgt, rule, win = mus + aim, 'featured hit window', (lo, hi)
        if is_quiet and beeps:  # the QUIET answer: readable, ~4.5 LU under the BEEP it answers
            near = [lv for f, lv in beeps.items() if abs(f - lead[0]['frame']) <= 240]
            if near:
                tgt = min(tgt, max(near) - W['quiet_below_beep'])
                rule = 'quiet answer: under its BEEP'
                win = (-6.0, win[1] if win else 7.0)
        d = tgt - comb
        gid = len(out)
        for q in grp:
            q['gain_db'] += d
            q['window_rule'] = rule
            q['window'] = win
            q['grp'] = gid
            q['aim_margin'] = None if mus < -45 else tgt - mus
            q['aim_abs'] = tgt if mus < -45 else None
        if any('_beep' in str(q['src']) or q['name'] == 'listen_beep' for q in lead):
            beeps[lead[0]['frame']] = tgt
        out.append({'ids': [q['id'] for q in grp], 'rule': rule, 'music_m': round(mus, 1), 'target_m': round(tgt, 1), 'delta_db': round(d, 2)})
    return out


def env_db(x, attack, release):
    """RMS envelope (dB) with attack/release time constants, on 1 ms blocks."""
    m = np.mean(x ** 2, axis=1) if x.ndim == 2 else x ** 2
    blk = SR // 1000
    nb = len(m) // blk + 1
    mb = dsp.fit(m[:, None], nb * blk)[:, 0].reshape(nb, blk).mean(1)
    aa, ra = np.exp(-1.0 / (attack * 1000)), np.exp(-1.0 / (release * 1000))
    e = np.empty(nb)
    cur = 0.0
    for i in range(nb):
        v = mb[i]
        cur = v + (cur - v) * (aa if v > cur else ra)
        e[i] = cur
    return 10 * np.log10(np.maximum(np.repeat(e, blk)[:len(m)], 1e-14))


def compress(x, ratio, attack, release, thr_db, max_gr=None):
    e = env_db(x, attack, release)
    gr = np.maximum(0.0, (e - thr_db) * (1 - 1 / ratio))
    if max_gr is not None:
        gr = np.minimum(gr, max_gr)
    return x * dsp.undb(-gr)[:, None], gr


def bus_process(x):
    """SFX/design bus: 3:1 (10/120 ms) with <= 4 dB GR, then a transient limit 3 dB over the typical peak."""
    e = env_db(x, 0.010, 0.120)
    act = e > -50
    if not act.any():
        return x, np.ones(len(x)), {'gr_max_db': 0.0}
    thr = float(np.percentile(e[act], 95)) - 3.0  # 3:1 → 2 dB GR at the bus's p95 level (max 4 dB)
    y, gr = compress(x, 3.0, 0.010, 0.120, thr, 4.0)
    blk = SR // 20
    nb = len(y) // blk
    pk = 20 * np.log10(np.max(np.abs(y[:nb * blk]).reshape(nb, blk, 2), axis=(1, 2)) + 1e-12)
    typ = float(np.percentile(pk[pk > -45], 99.5)) if (pk > -45).any() else 0.0
    ceil = typ + 4.0
    y = dsp.limiter(y, ceil, 0.002, 0.05)  # float pipeline: the master limiter owns the final peak
    blk = SR // 200
    nb = len(x) // blk
    ex = np.mean(x[:nb * blk].reshape(nb, blk, 2) ** 2, axis=(1, 2))
    ey = np.mean(y[:nb * blk].reshape(nb, blk, 2) ** 2, axis=(1, 2))
    geff = np.sqrt(np.where(ex > 1e-12, ey / np.maximum(ex, 1e-20), 1.0))
    gcurve = np.ones(len(x))
    gcurve[:nb * blk] = np.repeat(np.clip(geff, 0, 1.0), blk)
    return y, gcurve, {'threshold_db': round(thr, 1), 'gr_max_db': round(float(gr.max()), 2), 'gr_p95_db': round(float(np.percentile(gr[act], 95)), 2),
               'transient_ceiling_dbfs': round(ceil, 1)}


def glue(x):
    """2:1 glue, 30 ms attack, 150 ms release; threshold so the loud parts see ~1.5-2 dB GR."""
    e = env_db(x, 0.030, 0.150)
    act = e > -45
    thr = float(np.percentile(e[act], 90)) - 3.5
    y, gr = compress(x, 2.0, 0.030, 0.150, thr, 4.0)
    loud = act & (e > np.percentile(e[act], 75))
    return y, {'threshold_db': round(thr, 1), 'gr_mean_loud_db': round(float(gr[loud].mean()), 2), 'gr_max_db': round(float(gr.max()), 2)}


def phone_sim(x):
    """Phone-speaker proxy: mono, HPF 250 Hz (4th), LPF 7 kHz, +5 dB resonance at 1.1 kHz, light saturation."""
    m = x.mean(1, keepdims=True)
    y = dsp.highpass(m, 250, 4)
    y = dsp.lowpass(y, 7000, 4)
    y = dsp.eq(y, 'peak', 1100, 5.0, 1.4)
    y = np.tanh(y * 1.5) / 1.5
    y = np.repeat(y, 2, axis=1)
    return y * dsp.undb(dsp.integrated(x) - 4 - dsp.integrated(y))  # phones play ~4 dB down


def place_and_correct(cues, stems, music, iters=8, tol=0.25):
    """Rebuild the SFX/design stems from the cues, run the bus, measure every GROUP (cues within 3 frames,
    combined) AFTER the bus against the music, and correct its gain toward its aim. Returns bus reports."""
    groups = {}
    for q in cues:
        groups.setdefault(q.get('grp', 'g' + q['id']), []).append(q)
    reps = {}
    for it in range(iters):
        for k in ('sfx', 'design'):
            stems[k][:] = 0.0
        for q in cues:
            dsp.place(stems[q['stem']], q['x'], q['start'], dsp.undb(q['gain_db']))
        bus, gc = {}, {}
        for k in ('sfx', 'design'):
            bus[k], gc[k], reps[k] = bus_process(stems[k])
        worst = 0.0
        for gid, grp in groups.items():
            if not any(q['featured'] for q in grp) and grp[0].get('aim_margin') is None:
                continue
            a = min(q['start'] for q in grp)
            b = max(q['start'] + len(q['x']) for q in grp)
            iso = np.zeros((b - a, 2))
            for q in grp:
                seg = q['x'] * dsp.undb(q['gain_db']) * gc[q['stem']][q['start']:q['start'] + len(q['x'])][:, None]
                iso[q['start'] - a:q['start'] - a + len(seg)] += seg
            cm = _mmax_series(iso)
            kk = int(np.argmax(cm))
            w0 = a + int(kk * 0.01 * SR)
            mseg = music[w0:w0 + int(0.4 * SR)]
            mm = float(dsp.momentary(dsp.fit(mseg, int(0.4 * SR)), 0.4)[0]) if len(mseg) else -120.0
            c = float(cm[kk])
            margin = c - max(mm, -70.0)
            for q in grp:
                q.update({'cue_lufs_m': c, 'music_lufs_m': mm, 'margin_lu': margin, 'group_size': len(grp)})
            aim_m, aim_a = grp[0].get('aim_margin'), grp[0].get('aim_abs')
            err = (aim_a - c) if aim_a is not None else ((aim_m - margin) if aim_m is not None else 0.0)
            if abs(err) > tol and it < iters - 1:
                done = grp[0].get('corr_db', 0.0)
                cap = 15.0 if any(q['featured'] for q in grp) else 9.0
                step = float(np.clip(err, -cap - done, cap - done))  # never chase an unreachable target
                for q in grp:
                    q['gain_db'] += step
                    q['corr_db'] = done + step
            worst = max(worst, abs(err))
        if worst <= tol:
            break
    for k in ('sfx', 'design'):
        stems[k][:] = bus[k]
    return reps


def music_polish(music, sections):
    """Fade in from black (0.5 s), reverb-fill the sparse sections (cold open, Lights Out pocket, closing music box) so
    their gaps don't read as level jumps, and fade the end card's last 4 s."""
    y = music.copy()
    n = len(y)
    fi = int(0.5 * SR)
    y[:fi] *= (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, fi)))[:, None]
    ir = dsp.make_ir(2.6, 1.8, 0.025, 4500, seed=31, width=0.35)  # narrow: mono-safe (phones)
    sec = {nm: (a / FPS, b / FPS) for nm, a, b in sections}
    for nm in ('cold_open', 'lights_out', 'closing_musicbox'):
        if nm not in sec:
            continue
        a, b = sec[nm]
        i0, i1 = int(a * SR), int(b * SR)
        wet = signal.fftconvolve(y[i0:i1], ir, axes=0)[: i1 - i0 + int(1.5 * SR)] * (0.6 if nm == 'cold_open' else 0.45)
        env = np.ones(len(wet))
        r = int(0.15 * SR)
        env[:r] = np.linspace(0, 1, r)
        env[i1 - i0:] = np.linspace(1, 0, len(env) - (i1 - i0)) ** 2  # the tail dies out after the section
        dsp.place(y, wet * env[:, None], i0)
    if 'cold_open' in sec:  # gentle 2:1 on the cold-open music: the music-box swells don't jump out of the hush
        a, b = sec['cold_open']
        i0, i1 = int(a * SR), int(b * SR)
        seg = y[i0:i1]
        e = env_db(seg, 0.030, 0.300)
        act = e > -70
        if act.any():
            thr = float(np.percentile(e[act], 60))
            comp, _ = compress(seg, 2.0, 0.030, 0.300, thr, 4.0)
            mk = dsp.undb(float(np.median(np.maximum(0.0, (e[act] - thr) * 0.5))))  # make-up for the median GR
            r = int(0.2 * SR)
            w = np.ones(i1 - i0)
            w[-r:] = np.linspace(1, 0, r)
            y[i0:i1] = seg * (1 - w[:, None]) + comp * mk * w[:, None]
    fo = int(4.0 * SR)
    y[n - fo:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo)))[:, None]
    return y


def presence_match(sfx, music, sections, limit_db=4.5, max_cut=9.0, passes=2):
    """Tone: per section, if the SFX sit more than `limit_db` over the music in 2-5 kHz, cut the SFX's
    2-5 kHz (broad peak at 3.2 kHz) by the excess, with 100 ms crossfades. Returns (sfx, report)."""
    def band(x):  # same as analyze_mix: mono, 4th-order 2-5 kHz band
        y = dsp.bandpass(x.mean(1, keepdims=True), 2000, 5000, 4)
        return 10 * np.log10(np.mean(y ** 2) + 1e-14)
    out = sfx.copy()
    rep = {}
    r = int(0.1 * SR)
    for _ in range(passes):
        out, rep = _presence_pass(out, music, sections, limit_db, max_cut, band, r, rep)
    return out, rep


def _presence_pass(sfx, music, sections, limit_db, max_cut, band, r, rep):
    out = sfx.copy()
    for nm, a, b in sections:
        i0, i1 = int(a / FPS * SR), int(b / FPS * SR)
        if i1 - i0 < SR // 4:
            continue
        mb, sb = band(music[i0:i1]), band(sfx[i0:i1])
        if mb < -80 or sb < -80:
            continue
        ex = (sb - mb) - limit_db
        if ex <= 0:
            continue
        cut = min(ex + 0.5, max_cut)
        a0, a1 = max(0, i0 - r), min(len(sfx), i1 + r)
        seg = sfx[a0:a1]
        lo = dsp.eq(seg, 'peak', 3200, -cut, 0.7)
        w = np.ones(a1 - a0)
        w[:i0 - a0] = np.linspace(0, 1, i0 - a0)
        w[i1 - a0:] = np.linspace(1, 0, a1 - i1)
        out[a0:a1] = seg * (1 - w[:, None]) + lo * w[:, None]
        prev = rep.get(nm, {})
        rep[nm] = {'sfx_minus_music_before_db': prev.get('sfx_minus_music_before_db', round(sb - mb, 1)),
                   'presence_cut_db': round(prev.get('presence_cut_db', 0.0) + cut, 1)}
    return out, rep


def bar_rms_db(x, a, b):
    """music_gate's metric: mean-square of the mono mix over [a, b) samples, dB."""
    m = x[a:b].mean(1)
    return float(10 * np.log10(np.mean(m ** 2) + 1e-12))


def monotonic_build(stems, downbeats, sec, step_db=0.1, max_lift=4.0, ramp_s=0.2, iters=4):
    """Make the build rise bar by bar ON THE FULL MIX (music + SFX + design): any bar quieter than the bar
    before it gets a music lift (smooth raised-cosine ramps that complete on its downbeat) up to prev+step.
    Returns a report with the per-bar levels before and after."""
    if not sec:
        return {}
    a, b = sec
    bars = [d for d in downbeats if a <= d <= b]
    if bars[0] != a:
        bars = [a] + bars
    if bars[-1] != b:
        bars.append(b)
    spans = [(x0 * (SR // FPS), x1 * (SR // FPS)) for x0, x1 in zip(bars, bars[1:])]
    total = lambda: sum(stems.values())
    before = [round(bar_rms_db(total(), s0, s1), 2) for s0, s1 in spans]
    A0, B0 = spans[0][0], spans[-1][1]
    music0 = stems['music'].copy()
    M0 = centred_short_term(total()[A0:B0], hop=0.01, win=0.4)
    peak0 = float(M0.max())
    lifts = [0.0] * len(spans)
    for _ in range(iters):
        mix = total()
        lv = [bar_rms_db(mix, s0, s1) for s0, s1 in spans]
        changed = False
        for i in range(1, len(spans)):
            need = (lv[i - 1] + step_db) - lv[i]
            if need > 0.1 and lifts[i] < max_lift:
                d = min(need, max_lift - lifts[i])
                s0, s1 = spans[i]
                r = int(ramp_s * SR)
                g = np.ones(len(stems['music']))
                g[s0:s1] = dsp.undb(d)
                g[max(0, s0 - r):s0] = 1 + (dsp.undb(d) - 1) * (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, min(r, s0))))
                g[s1:s1 + r] = dsp.undb(d) + (1 - dsp.undb(d)) * (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, len(g[s1:s1 + r]))))
                stems['music'] *= g[:, None]
                lifts[i] += d
                changed = True
                lv = [bar_rms_db(total(), s0, s1) for s0, s1 in spans]
        if not changed:
            break
    # the lift may fill the bars, never raise the build's momentary peak (the drop must stay the peak)
    for _ in range(3):
        M1 = centred_short_term(total()[A0:B0], hop=0.01, win=0.4)
        ex = np.maximum(0.0, M1 - peak0)
        if ex.max() < 0.1:
            break
        ex = np.maximum.reduce([np.roll(ex, k) for k in range(-20, 21, 5)])  # widen ±200 ms
        ex = uniform_filter1d(ex, size=20, mode='nearest')
        gx = np.interp(np.arange(B0 - A0) / SR, np.arange(len(ex)) * 0.01, ex)
        lift_now = stems['music'][A0:B0]
        stems['music'][A0:B0] = music0[A0:B0] + (lift_now - music0[A0:B0]) * np.clip(1 - (1 - dsp.undb(-gx)) / np.maximum(
            1e-9, 1 - np.abs(music0[A0:B0]).mean(1, keepdims=True)[:, 0] * 0 + 1e-9), 0, 1)[:, None] if False else lift_now * dsp.undb(-gx)[:, None]
    after = [round(bar_rms_db(total(), s0, s1), 2) for s0, s1 in spans]
    peak1 = float(centred_short_term(total()[A0:B0], hop=0.01, win=0.4).max())
    return {'bars_frames': bars, 'before_db': before, 'after_db': after, 'music_lift_db': [round(x, 2) for x in lifts],
            'build_momentary_peak_before': round(peak0, 2), 'build_momentary_peak_after': round(peak1, 2)}
