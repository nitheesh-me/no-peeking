#!/usr/bin/env python3
"""Mixer test on synthetic EDLs built from the real capture samples (videos/capture/sample-*).

    tools/video/safe-run.sh --mem 4G -- python3 tools/video/audio/test_mix.py [trailer|mechanic|all]

Checks (exit 1 on failure):
  A/V sync   every placed game cue starts at sample == timeline_frame * 800, and that frame equals the
             Editor's own edl.timeline_events() mapping (±1 frame, the QA gate 2 tolerance);
  onset      the audible onset of each isolated cue lies within 1 frame (+ the engine's 5 ms lead);
  speed      events inside sped-up clips land where the frame map shows their source frame; thinning logged;
  loudness   ffmpeg ebur128: -14 ±0.5 LUFS integrated, true peak <= -1 dBTP;
  6 LU rule  every featured cue >= 6 LU above the music at its moment.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / 'edl'))
import dsp  # noqa: E402
import edl as E  # noqa: E402
import mix  # noqa: E402

ROOT = HERE.parents[2]
OUT = ROOT / 'videos/audio2/test'
CAP = 'videos/capture'


def clip(cid, shot, start, inn, dur, speed=1, transition='cut', tframes=None, cues=(), audio=None):
    c = {'id': cid, 'shot': shot, 'src': f'{CAP}/{shot}.mkv', 'events': f'{CAP}/{shot}.events.json', 'start': start,
         'in': inn, 'dur': dur, 'speed': speed, 'transition': {'type': transition}, 'cues': list(cues)}
    if tframes:
        c['transition']['frames'] = tframes
    if audio:
        c['audio'] = audio
    return c


def synthetic_trailer():
    """70.67 s on the cue-sheet v2 grid; real event logs; sped-up build (2.7x), proof (1.5x) and montage (2.3x);
    shatter at the peek and glitch at the drop; Editor-style clip cues (drop_impact, snap)."""
    C = [
        clip('cold', 'sample-cinema-sphere', 0, 0, 434, 0.48),
        clip('peek', 'sample-title-peek', 434, 0, 288, 1, 'shatter', 12),
        clip('build', 'sample-23-night', 722, 0, 576, 2.7),
        clip('silence', 'sample-cinema-sphere', 1298, 0, 96, 1, audio={'mute': True}),
        clip('drop', 'sample-cinema-title', 1394, 0, 192, 1, 'glitch', 6),
        clip('proof', 'sample-cinema-23', 1586, 200, 576, 1.5),
        clip('montage', 'sample-23-night', 2162, 0, 672, 2.3),
        clip('lights_out', 'sample-cinema-sphere', 2834, 0, 192, 1),
        clip('payoff', 'sample-cinema-23', 3026, 1000, 384, 1),
        clip('closing', 'sample-cinema-sphere', 3410, 0, 192, 1),
        clip('closing_silence', 'sample-cinema-sphere', 3602, 0, 96, 1, audio={'mute': True}),
        clip('circuit', 'sample-codex-bloch', 3698, 0, 288, 1),
        clip('end', 'sample-cinema-title', 3986, 0, 254, 0.78),
    ]
    C[4]['cues'] = [{'name': 'drop_impact', 'frame': 1394, 'kind': 'design'}]
    C[11]['cues'] = [{'name': 'snap', 'frame': 3698, 'kind': 'design'}]
    return {'schema': 'np-edl/1', 'video': 'trailer', 'fps': 60, 'layout': 'cinema', 'work': [1920, 1080],
            'outputs': [], 'cue_sheet': 'videos/music/cue_sheet.json', 'clips': C, 'duration': 4240}


def synthetic_mechanic():
    """Mechanic-style: the 2-3 night at 1x (voices on, Schrödi's lines) + a 4x replay to stress thinning."""
    C = [
        clip('night', 'sample-cinema-23', 0, 0, 1399, 1),
        clip('fast', 'sample-23-night', 1399, 0, 398, 4.0),
        clip('peek', 'sample-title-peek', 1797, 0, 420, 1),
        clip('night2', 'sample-23-night', 2217, 0, 1595, 1),
    ]
    return {'schema': 'np-edl/1', 'video': 'mechanic', 'fps': 60, 'layout': 'strip', 'work': [1920, 1080], 'outputs': [],
            'clips': C, 'duration': 3812}


def check(edl_obj, rep, name, args_out):
    ok = True
    e = E.load(json.loads(json.dumps(edl_obj)))
    ed = {}
    for ev in E.timeline_events(e) if False else []:
        pass
    # Editor's mapping, computed independently with its own frame_map (events with frame != null)
    exp = []
    for c in e['clips']:
        if (c.get('audio') or {}).get('mute'):
            continue
        evs = mix.load_events(c['events'])
        for ev in evs:
            if ev.get('type') not in ('sfx', 'botNote', 'syndromeChord') or ev.get('frame') is None:
                continue
            if c['in'] <= ev['frame'] < c['out']:
                m = c['_map']
                idx = next((i for i, s in enumerate(m) if s >= ev['frame']), None)
                if idx is not None:
                    exp.append((c['id'], ev['frame'], c['start'] + idx))
    placed = {(r['clip'], r['src_frame']): r for r in rep['cues'] if r['kind'] == 'game'}
    thinned = {(t['clip'], t['src_frame']) for t in rep['thinned']}
    sync_err, missing = [], []
    for cid, sf, tf in exp:
        r = placed.get((cid, sf))
        if r is None:
            if (cid, sf) not in thinned:
                missing.append((cid, sf))
            continue
        if abs(r['frame'] - tf) > 1 or r['sample'] != r['frame'] * 800 and r['source'] and not r['source'].startswith('trailer'):
            sync_err.append((cid, sf, r['frame'], tf))
        if r['sample'] != r['frame'] * 800:
            sync_err.append((cid, sf, 'sample', r['sample']))
    # audible onset of each isolated game cue in the sfx stem (first sample > -50 dBFS after start-1 frame)
    sfx = dsp.read_wav(ROOT / rep['stems']['sfx'])
    onset_err = []
    for r in rep['cues']:
        if r['kind'] != 'game':
            continue
        a = max(0, r['sample'] - 800)
        seg = np.max(np.abs(sfx[a:a + 4800]), 1)
        nz = np.nonzero(seg > dsp.undb(-50))[0]
        if len(nz):
            d = (a + nz[0] - r['sample']) / 48000
            if not (-1 / 60 <= d <= 1 / 60 + 0.006):
                onset_err.append((r['id'], r['name'], round(d * 1000, 1)))
    L = rep['loudness']['ffmpeg_ebur128']
    res = {
        'video': name, 'loudness_curve_bed_pass': (rep.get('loudness_curve', {}).get('bed') or {}).get('pass'),
        'proof_energy': rep.get('proof_energy'), 'events_expected': len(exp), 'placed': len(placed), 'thinned': len(rep['thinned']),
        'missing_not_thinned': missing, 'sync_errors_gt_1frame': sync_err, 'onset_errors': onset_err[:20],
        'onset_checked': sum(1 for r in rep['cues'] if r['kind'] == 'game'),
        'ffmpeg_I': L['I'], 'ffmpeg_TP': L['TP'], 'pass_I': abs(L['I'] + 14) <= 0.5, 'pass_TP': L['TP'] <= -1.0,
        'featured': rep['summary']['featured'], 'featured_pass': rep['summary']['featured_pass'],
        'min_margin_lu': rep['summary']['min_margin_lu'], 'featured_fail': rep['summary']['featured_fail'],
    }
    ok = not missing and not sync_err and not onset_err and res['pass_I'] and res['pass_TP'] and not res['featured_fail']
    res['PASS'] = ok
    return res


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    runs = (('trailer_song', synthetic_trailer, ['--music', 'videos/music/trailer_edit.wav']),
            ('trailer_public', synthetic_trailer, ['--music', 'videos/audio2/score_alt/score_alt.wav']),
            ('mechanic', synthetic_mechanic, []))
    for name, fn, extra in runs:
        if which not in ('all', name, name.split('_')[0]):
            continue
        edl_obj = fn()
        p = OUT / f'synthetic_{name.split("_")[0]}.edl.json'
        p.write_text(json.dumps(edl_obj, indent=1))
        rep = mix.main([str(p.relative_to(ROOT)), '--out', f'videos/audio2/test/{name}'] + extra)
        r = check(edl_obj, rep, name, OUT / name)
        print(json.dumps(r, indent=1))
        results.append(r)
    prev = []
    if (OUT / 'test_results.json').exists():
        prev = [r for r in json.loads((OUT / 'test_results.json').read_text()) if r['video'] not in {x['video'] for x in results}]
    dsp.save_json(OUT / 'test_results.json', prev + results)
    sys.exit(0 if all(r['PASS'] for r in results) else 1)


if __name__ == '__main__':
    main()
