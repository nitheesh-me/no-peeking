"""Full-mix anticipation-arc gate (Critic, "Milestone: trailer song cut", fix 5) + per-second loudness.

    tools/video/safe-run.sh -- python3 tools/video/audio/arc_gate.py MIX.wav [--json OUT] [--from 0 --to 30]

EBU convention: short-term S(t) = loudness of [t-3 s, t]; momentary M(t) = [t-0.4 s, t].
  gate A: max S(t) for t in [f1394, f1646]  >=  max S(t) for t <= f1298 (windows wholly before the silence) + 2 LU
  gate B: max M(t) for t in [f1394, f1646]  is the highest M before the payoff (f3026)
Frames come from the cue sheet (drop, silence start, payoff), with these defaults.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dsp  # noqa: E402

SR = dsp.SR


def series(x, win, hop=0.05):
    """Loudness of the window ENDING at each t = k*hop (t >= win)."""
    k = dsp.kweight(x)
    p = np.sum(k * k, axis=1)
    c = np.concatenate([[0.0], np.cumsum(p)])
    w, h = int(win * SR), int(hop * SR)
    ends = np.arange(w, len(p) + 1, h)
    ms = (c[ends] - c[ends - w]) / w
    return ends / SR, dsp.lufs_from_ms(ms)


def arc(x, drop_f=1394, drop_end_f=1646, silence_f=1298, payoff_f=3026):
    ts, S = series(x, 3.0)
    tm, M = series(x, 0.4)
    d0, d1, s0, p0 = drop_f / 60, drop_end_f / 60, silence_f / 60, payoff_f / 60
    s_drop = float(S[(ts >= d0) & (ts <= d1)].max())
    s_pre = float(S[ts <= s0].max())
    t_pre = float(ts[ts <= s0][np.argmax(S[ts <= s0])])
    m_drop = float(M[(tm >= d0) & (tm <= d1)].max())
    other = (tm < p0) & ~((tm >= d0) & (tm <= d1))
    m_other = float(M[other].max())
    t_other = float(tm[other][np.argmax(M[other])])
    return {'rule_A': 'max S over f1394-1646 >= max S before f1298 + 2 LU',
            'S_drop_max': round(s_drop, 2), 'S_pre_silence_max': round(s_pre, 2), 'S_pre_at_s': round(t_pre, 2),
            'A_margin_lu': round(s_drop - s_pre, 2), 'A_pass': bool(s_drop - s_pre >= 2.0),
            'rule_B': "the drop's momentary peak is the highest before the payoff",
            'M_drop_max': round(m_drop, 2), 'M_other_max_before_payoff': round(m_other, 2), 'M_other_at_s': round(t_other, 2),
            'B_margin_lu': round(m_drop - m_other, 2), 'B_pass': bool(m_drop >= m_other),
            'pass': bool(s_drop - s_pre >= 2.0 and m_drop >= m_other)}


def per_second(x, t0=0, t1=30):
    ts, S = series(x, 3.0, 0.05)
    tm, M = series(x, 0.4, 0.05)
    out = []
    for s in range(t0, t1 + 1):
        iS = np.argmin(np.abs(ts - s)) if s >= 3 else None
        iM = (tm >= s - 0.5) & (tm < s + 0.5)
        out.append({'t': s, 'S': round(float(S[iS]), 1) if iS is not None else None,
                    'M_max': round(float(M[iM].max()), 1) if iM.any() else None})
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('wav')
    ap.add_argument('--json')
    ap.add_argument('--from', dest='t0', type=int, default=0)
    ap.add_argument('--to', dest='t1', type=int, default=30)
    a = ap.parse_args()
    x = dsp.read_wav(a.wav)
    res = {'arc_gate': arc(x), 'per_second': per_second(x, a.t0, a.t1)}
    if a.json:
        Path(a.json).write_text(json.dumps(res, indent=1))
    print(json.dumps(res['arc_gate']))
    print(' '.join(f"{r['t']}s:{r['S']}/{r['M_max']}" for r in res['per_second']))
