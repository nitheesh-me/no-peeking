"""Cue-sheet selection, the arrangement 'plan', and the Critic's loudness-curve gate.

pick(prefer_v2=True)  → path of the cue sheet to follow:
    videos/music/cue_sheet.json if it is v2 (proof ends at f2162 / version mentions v2),
    else videos/audio2/expected_cue_sheet_v2.json (stand-in from the Director's v2 frames).
plan(path)            → {bpm, bpb, beat_s, bar_s, beat0_s, t:{landmark: seconds}, sections:{name:(a,b)}}
energy_checks(x, plan)→ the Critic's gate (music-edit milestone, change 7), on 0.5 s RMS windows:
    build rises monotonically (per-bar RMS non-decreasing within ±1 dB),
    drop ≥ build average + 6 dB and ≥ build peak + 4 dB,
    payoff ≥ montage average + 2 dB,
    proof bed ≥ 6 dB under the montage.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
REAL = ROOT / 'videos/music/cue_sheet.json'
EXPECTED = ROOT / 'videos/audio2/expected_cue_sheet_v2.json'
FPS = 60


def _is_v2(d):
    if 'v2' in str(d.get('version', '')) or 'v2' in str(d.get('cue_sheet_version', '')):
        return True
    for s in d.get('sections', []):
        if s.get('name') == 'proof' and s.get('end_frame') == 2162:
            return True
    return False


def pick(prefer_v2=True) -> Path:
    if REAL.exists():
        d = json.loads(REAL.read_text())
        if not prefer_v2 or _is_v2(d):
            return REAL
    return EXPECTED if EXPECTED.exists() else REAL


def plan(path) -> dict:
    d = json.loads(Path(path).read_text())
    bpm = float(d.get('bpm', 96))
    bpb = int(str(d.get('meter', '4/4')).split('/')[0])
    beat = 60 / bpm
    secs = {}
    raw = d.get('sections', [])
    for i, s in enumerate(raw):
        a = s.get('start_frame', round(s.get('start_s', 0) * FPS))
        b = s.get('end_frame', raw[i + 1].get('start_frame') if i + 1 < len(raw) else d.get('duration_frames'))
        secs[s['name']] = (a / FPS, b / FPS)
    hits = {k: (v if isinstance(v, (int, float)) else v.get('frame')) / FPS for k, v in (d.get('named_hits') or {}).items()}

    def first(*keys, default=None):
        for k in keys:
            if k.startswith('s:'):
                n, _, edge = k[2:].partition('.')
                if n in secs:
                    return secs[n][1 if edge == 'end' else 0]
            elif k in hits:
                return hits[k]
        return default

    t = {
        'cold_open': 0.0,
        'peek': first('peek_collapse', 's:peek'),
        'build': first('s:build', 'build_start'),
        'silence': first('s:silence', 'silence_start'),
        'beep': first('bot_beep', 'beep'),
        'drop': first('drop', 's:drop'),
        'proof': first('s:proof', 'proof_start'),
        'montage': first('s:montage', 'montage_start'),
        'lights_out': first('s:lights_out', 'lights_out'),
        'revcym': first('lights_out_revcym', 'reverse_cymbal_start'),
        'payoff': first('payoff_slam', 's:payoff'),
        'closing': first('closing_musicbox', 's:closing_musicbox', 's:closing'),
        'closing_silence': first('s:closing_silence', 'closing_silence'),
        'snap': first('snap_circuit_reveal', 'snap', 's:circuit'),
        'end_card': first('s:end_card', 'end_card'),
        'end': first('music_end', default=d.get('duration_frames', 4240) / FPS),
    }
    if t['revcym'] is None and t['payoff'] is not None:
        t['revcym'] = t['payoff'] - bpb * beat
    beat0 = d.get('grid', {}).get('beat0_frame', 0) / FPS
    return {'path': str(path), 'version': d.get('version'), 'bpm': bpm, 'bpb': bpb, 'beat_s': beat, 'bar_s': beat * bpb,
            'beat0_s': beat0, 't': t, 'sections': secs, 'duration_s': t['end']}


# ───────────────────────── Critic's loudness-curve gate ─────────────────────────
def rms_db(x, a, b, win=0.5, sr=48000):
    seg = x[int(a * sr):int(b * sr)]
    m = seg.mean(1) if seg.ndim == 2 else seg
    n = int(win * sr)
    if len(m) < n:
        return np.array([10 * np.log10(np.mean(m ** 2) + 1e-12)])
    k = len(m) // n
    return 10 * np.log10(np.mean(m[:k * n].reshape(k, n) ** 2, axis=1) + 1e-12)


def energy_checks(x, p, sr=48000) -> dict:
    t = p['t']
    bar = p['bar_s']
    out = {'windows_s': 0.5}

    def avg(a, b):
        return float(10 * np.log10(np.mean(10 ** (rms_db(x, a, b) / 10))))

    b0, b1 = t['build'], t['silence']
    bars = []
    tt = b0
    while tt + bar <= b1 + 1e-6:
        bars.append(round(avg(tt, tt + bar), 2))
        tt += bar
    out['build_bar_rms_db'] = bars
    out['build_monotonic'] = all(bars[i + 1] >= bars[i] - 1.0 for i in range(len(bars) - 1))
    bw = rms_db(x, b0, b1)
    build_avg, build_peak = avg(b0, b1), float(np.max(bw))
    drop = avg(t['drop'], t['proof'])
    out.update({'build_avg_db': round(build_avg, 2), 'build_peak_db': round(build_peak, 2), 'drop_avg_db': round(drop, 2),
                'drop_minus_build_avg': round(drop - build_avg, 2), 'drop_minus_build_peak': round(drop - build_peak, 2)})
    out['drop_ok'] = drop - build_avg >= 6 and drop - build_peak >= 4
    mont_end = t['lights_out'] or t['payoff']
    mont = avg(t['montage'], mont_end)
    pay = avg(t['payoff'], t['closing'])
    proof = avg(t['proof'], t['montage'])
    out.update({'montage_avg_db': round(mont, 2), 'payoff_avg_db': round(pay, 2), 'proof_avg_db': round(proof, 2),
                'payoff_minus_montage': round(pay - mont, 2), 'montage_minus_proof': round(mont - proof, 2)})
    out['payoff_ok'] = pay - mont >= 2
    out['proof_ok'] = mont - proof >= 6
    out['pass'] = bool(out['build_monotonic'] and out['drop_ok'] and out['payoff_ok'] and out['proof_ok'])
    return out
