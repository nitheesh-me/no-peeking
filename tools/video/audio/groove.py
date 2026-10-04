"""Render the "coding groove" stems (game BUILD-scene groove in the song's 112.5 BPM 3/4 / F-minor context).

    tools/video/safe-run.sh --heavy -- python3 tools/video/audio/groove.py

Stems are timeline-aligned full-length WAVs (sample t = timeline time t), active from one bar before the
proof to the start of Lights Out, so mix.py can cut any section of them on downbeats:
  videos/audio2/groove/groove_perc.wav   soft kick (1, 2-and), brushes (2, 3), hats with off-beat accents
  videos/audio2/groove/groove_type.wav   the game's wood-block clock on the off-8ths ("typing")
  videos/audio2/groove/groove_bass.wav   F/C pedal (no 3rd: safe under the song's F-minor drop)
  videos/audio2/groove/groove_keys.wav   EP comp Fm9-Dbmaj7-Bbm9-C7 + sparse music-box head (for "replace")
  videos/audio2/groove/groove_light.wav  perc + type + bass   (the default "under the song" layer)
  videos/audio2/groove/groove_full.wav   all four            (for segments that briefly REPLACE the bed)
One shared gain puts groove_full at -16 LUFS over its active span (the same reference as the song bed,
-16.2 LUFS), so the relative stem levels are preserved and mix.py can treat every score source alike.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dsp  # noqa: E402
import sheet  # noqa: E402
from engine_render import render_jobs, ROOT  # noqa: E402

OUT = ROOT / 'videos/audio2/groove'


def main():
    path = sheet.pick()
    P = sheet.plan(path)
    T = P['t']
    t0, t1 = T['proof'] - P['bar_s'], T['lights_out']
    dur = P['duration_s']
    base = {'secs': dur + 2, 'script': '/tools/video/audio/score_groove.js', 'dry': False, 'master': 'raw', 'seed': 112,
            'plan': {k: P[k] for k in ('beat_s', 'bpb', 'bar_s', 'beat0_s')} | {'t': T}, 'span': [t0, t1]}
    names = ['perc', 'type', 'bass', 'keys']
    stems = dict(zip(names, render_jobs([{**base, 'name': f'groove {s}', 'stem': s} for s in names])))
    n = int(dur * dsp.SR)
    for k in stems:
        stems[k] = dsp.fit(dsp.highpass(stems[k], 30, 2), n)
    a, b = int(t0 * dsp.SR), int(t1 * dsp.SR)
    # stem balance (relative LUFS over the active span): percussion leads, typing ticks clearly audible,
    # bass and keys underneath — a groove for "someone is programming", not a second song
    TARGET = {'perc': -20.0, 'type': -25.0, 'bass': -23.0, 'keys': -22.0}
    for k in stems:
        stems[k] = stems[k] * dsp.undb(TARGET[k] - dsp.integrated(stems[k][a:b]))
    full = sum(stems.values())
    g = dsp.undb(-16.0 - dsp.integrated(full[a:b]))
    OUT.mkdir(parents=True, exist_ok=True)
    rep = {'cue_sheet': str(Path(path).relative_to(ROOT)), 'bpm': P['bpm'], 'meter': f"{P['bpb']}/4", 'key': 'F minor (bass: F/C pedal, no 3rd)',
           'active_s': [round(t0, 3), round(t1, 3)], 'active_frames': [round(t0 * 60), round(t1 * 60)], 'stems': {}}
    mixes = {'light': stems['perc'] + stems['type'] + stems['bass'], 'full': full}
    for k, v in list(stems.items()) + list(mixes.items()):
        y = v * g
        p = OUT / f'groove_{k}.wav'
        dsp.write_wav(p, y)
        rep['stems'][k] = {'path': str(p.relative_to(ROOT)), 'lufs_active': round(dsp.integrated(y[a:b]), 2),
                           'tp_db': round(dsp.true_peak_db(y[a:b]), 2)}
    dsp.save_json(OUT / 'groove.json', rep)
    dsp.spectrogram_png((mixes['full'] * g)[a - dsp.SR:b + dsp.SR], OUT / 'groove.png', 'coding groove (game build groove, 112.5 BPM 3/4, F minor)')
    for k, v in rep['stems'].items():
        print(k, v)


if __name__ == '__main__':
    main()
