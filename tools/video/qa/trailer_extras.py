#!/usr/bin/env python3
"""Trailer-specific review evidence (after run.py), written to videos/final/review/:

  trailer_lightsout_luma.csv / _strip_x4.png   per-frame mean + max luma of the DELIVERED render over the
                                               Lights Out clip (every intentional_black clip), dark-gate verdict
  trailer_proof_pops.json                      proof_overlay pop frames (action_frames_trailer) vs the
                                               pg_split_23 events mapped through the EDL (+-1 frame)
  trailer_audio_match.json                     the mp4's audio == the current mix.wav (gain-matched residual),
                                               and mix.wav / mixreport newer than the EDL

usage: tools/video/safe-run.sh --heavy -- python3 tools/video/qa/trailer_extras.py tools/video/edl/trailer.edl.json
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
sys.path.insert(0, HERE)
import edl as E  # noqa: E402
from run import REVIEW, T  # noqa: E402

DARK = 40


def luma_rows(path, a, b):
    """mean/max luma (8-bit Y) for frames [a, b) of path, streamed."""
    w, h = 480, 270
    r = subprocess.run(['ffmpeg', '-v', 'error', '-threads', T, '-i', path, '-vf',
                        f"select='between(n,{a},{b - 1})',scale={w}:{h}:flags=area,format=gray",
                        '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], capture_output=True)
    n = len(r.stdout) // (w * h)
    fr = np.frombuffer(r.stdout[:n * w * h], np.uint8).reshape(n, h, w)
    # max over a 4x4-pooled frame, so single grain pixels don't count as "light"
    pooled = fr.reshape(n, h // 2, 2, w // 2, 2).mean((2, 4))
    return [(a + i, float(fr[i].mean()), float(pooled[i].max())) for i in range(n)], fr


def main():
    e = E.load(sys.argv[1])
    final = E.rel(e['outputs'][0]['path'])
    os.makedirs(REVIEW, exist_ok=True)
    out = {}
    # 1. Lights Out luma
    rows_all, strips = [], []
    for c in e['clips']:
        if not c['flags']['intentional_black'] or c['src'].startswith('@'):
            continue
        rows, fr = luma_rows(final, c['start'], c['start'] + c['dur'])
        rows_all += [(c['id'],) + r for r in rows]
        strips.append(Image.fromarray(np.concatenate([fr[k] for k in range(0, len(fr), max(1, len(fr) // 8))][:8], 1)))
    with open(os.path.join(REVIEW, 'trailer_lightsout_luma.csv'), 'w') as f:
        f.write('clip,frame,mean_luma,max_luma_pooled\n' + ''.join(f'{c},{fn},{m:.2f},{x:.1f}\n' for c, fn, m, x in rows_all))
    if strips:
        s = strips[0]
        s = s.point(lambda v: min(255, v * 4))  # x4 so the near-black detail is visible in review
        s.save(os.path.join(REVIEW, 'trailer_lightsout_strip_x4.png'))
    over = [(c, fn, m) for c, fn, m, x in rows_all if m >= DARK]
    out['lights_out'] = {'frames': len(rows_all), 'max_mean_luma': max((m for _, _, m, _ in rows_all), default=None),
                         'max_pooled_luma': max((x for *_, x in rows_all), default=None),
                         'frames_mean_ge_40': len(over), 'pass': not over}
    # 2. proof overlay pop frames vs the new events
    pj = E.rel('videos/motion/proof_overlay.json')
    if os.path.exists(pj):
        d = json.load(open(pj))
        mk = d.get('markers', {})
        want = mk.get('action_frames_trailer') or d.get('params', {}).get('action_frames_trailer') or []
        if isinstance(want, dict):
            want = list(want.values())
        flat = []
        for v in want:
            flat += v if isinstance(v, list) else [v]
        evs = [ev for ev in E.resolved(e)['timeline_events'] if ev.get('shot') == 'pg_split_23']
        act = sorted({ev['frame'] for ev in evs if ev['type'] in ('sfx', 'botNote')})
        res = []
        for f in sorted(set(int(x) for x in flat if isinstance(x, (int, float)))):
            near = min(act, key=lambda g: abs(g - f)) if act else None
            res.append({'pop': f, 'nearest_event': near, 'delta': None if near is None else near - f,
                        'ok': near is not None and abs(near - f) <= 1})
        out['proof_pops'] = {'checked': len(res), 'all_within_1': all(r['ok'] for r in res), 'pops': res}
        json.dump(out['proof_pops'], open(os.path.join(REVIEW, 'trailer_proof_pops.json'), 'w'), indent=1)
    # 3. delivered audio == current mix
    mix = E.rel(e['audio']['mix'])
    rep = E.rel(e['audio']['mixreport'])
    edl_t = os.path.getmtime(E.rel(sys.argv[1]))

    def pcm(p):
        r = subprocess.run(['ffmpeg', '-v', 'error', '-threads', T, '-i', p, '-vn', '-ac', '1', '-ar', '12000', '-f', 'f32le', '-'],
                           capture_output=True)
        return np.frombuffer(r.stdout, np.float32)
    a, b = pcm(final), pcm(mix)
    n = min(len(a), len(b))
    # AAC has a small priming delay: find the best lag within +-30 ms, sample by sample (a step of 4
    # missed the real lag of 6 samples and reported 0.83 for an identical mix)
    best = None
    for lag in range(-360, 361):
        x, y = (a[lag:n], b[:n - lag]) if lag >= 0 else (a[:n + lag], b[-lag:n])
        c = float(np.dot(x[::7], y[::7]) / (np.linalg.norm(x[::7]) * np.linalg.norm(y[::7]) + 1e-9))
        if best is None or c > best[1]:
            best = (lag, c)
    out['audio_match'] = {'mix': os.path.relpath(mix, E.ROOT), 'mix_mtime_after_edl': os.path.getmtime(mix) > edl_t,
                          'mixreport_mtime_after_edl': os.path.exists(rep) and os.path.getmtime(rep) > edl_t,
                          'mux_after_mix': os.path.getmtime(final) > os.path.getmtime(mix),
                          'correlation': round(best[1], 5), 'lag_samples_12k': best[0]}
    # fresh = newer than the EDL, OR built for the current timeline (an EDL re-save for caption-only edits must
    # not force a remix): same duration and every mix cue tied to a clip lands on its EDL-mapped frame +-1
    tl_ok = False
    if os.path.exists(rep):
        mr = json.load(open(rep))
        clips = {c['id']: c for c in e['clips']}
        chk = [(q, clips.get(q.get('clip'))) for q in mr.get('cues', []) if q.get('clip') and q.get('src_frame') is not None]
        tl_ok = mr.get('duration_frames') == e['duration'] and all(
            c is not None and E.local_to_timeline(c, q['src_frame']) is not None and abs(E.local_to_timeline(c, q['src_frame']) - q['frame']) <= 1
            for q, c in chk if c is None or c['in'] <= q['src_frame'] < c['out'])
    out['audio_match']['mix_matches_current_timeline'] = tl_ok
    out['audio_match']['pass'] = best[1] > 0.995 and (os.path.getmtime(mix) > edl_t or tl_ok)
    json.dump(out['audio_match'], open(os.path.join(REVIEW, 'trailer_audio_match.json'), 'w'), indent=1)
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
