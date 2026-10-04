"""Mechanic and showcase music beds, rendered from the game's own adaptive score (src/audio/music.ts).

    tools/video/safe-run.sh --heavy --mem 6G -- python3 tools/video/audio/beds.py [mechanic|showcase|all]

The beds are deliberately calm (no trailer energy): the game's in-game SFX and Schrödi's Qubblese are
the foreground, placed by mix.py (--preset mechanic|showcase: music at -27/-25 LUFS, voices on,
2-5 kHz dips under every featured SFX and voice line). Scene plans follow the Critic's timing tables
(VIDEO_CRITIQUE §5 mechanic, §6 showcase "cosy → night → triumphant"); if an EDL exists, re-run with
--plan <json> [{"t": s, "scene": ..., "tension": ..., "harmony": ...}] to follow the real cut.
Outputs videos/audio2/beds/{mechanic,showcase}_bed.wav (-18 LUFS, -1 dBTP) + .json + .png.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dsp  # noqa: E402
from engine_render import render_jobs, ROOT  # noqa: E402

OUT = ROOT / 'videos/audio2/beds'
PLANS = {
    # mechanic (~2:30), Critic §5: cold open / rule / threat / can't copy / ask / repair / proof / twist / hood / close
    'mechanic': (150.0, [
        (0.0, 'title', 0.0, 1.0), (6.0, 'build', 0.0, 1.0), (24.0, 'run', 0.55, 0.7), (38.0, 'build', 0.0, 1.0),
        (50.0, 'lab', 0.0, 1.0), (75.0, 'run', 0.35, 0.85), (98.0, 'win', 0.0, 1.0), (100.0, 'build', 0.0, 1.0),
        (112.0, 'run', 0.6, 0.6), (128.0, 'lab', 0.0, 1.0), (142.0, 'credits', 0.0, 1.0)]),
    # showcase (~4:00), Critic §6: cosy → night → triumphant, energy change every 20-30 s
    'showcase': (245.0, [
        (0.0, 'map', 0.0, 1.0), (28.0, 'build', 0.0, 1.0), (52.0, 'run', 0.4, 0.8), (78.0, 'lab', 0.0, 1.0),
        (100.0, 'run', 0.7, 0.6), (122.0, 'lightsout', 0.5, 0.7), (138.0, 'map', 0.0, 1.0), (165.0, 'lab', 0.0, 1.0),
        (190.0, 'build', 0.0, 1.0), (212.0, 'win', 0.0, 1.0), (214.0, 'credits', 0.0, 1.0)]),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('which', nargs='?', default='all')
    ap.add_argument('--plan')
    a = ap.parse_args()
    todo = ['mechanic', 'showcase'] if a.which == 'all' else [a.which]
    for name in todo:
        dur, plan = PLANS[name]
        if a.plan:
            p = json.loads(Path(a.plan).read_text())
            plan = [(e['t'], e['scene'], e.get('tension', 0), e.get('harmony', 1)) for e in p]
        calls = []
        for t, scene, ten, har in plan:
            calls += [{'t': t, 'k': 'scene', 'v': scene}, {'t': t + 0.01, 'k': 'tension', 'v': ten}, {'t': t + 0.02, 'k': 'harmony', 'v': har}]
        x, = render_jobs([{'name': f'{name} bed', 'secs': dur + 2, 'music': True, 'master': 'raw', 'dry': False, 'seed': 42,
                           'scene0': plan[0][1], 'calls': calls}])
        x = dsp.fit(x, int(dur * dsp.SR))
        x = dsp.fade(dsp.highpass(x, 30, 2), 1.5, 3.0)
        x = dsp.limiter(x * dsp.undb(-18.0 - dsp.integrated(x)), -1.2)
        OUT.mkdir(parents=True, exist_ok=True)
        p = OUT / f'{name}_bed.wav'
        dsp.write_wav(p, x)
        rep = {'plan': plan, 'loudness': dsp.loudness_report(x), 'ffmpeg': dsp.ffmpeg_ebur128(p)}
        dsp.save_json(OUT / f'{name}_bed.json', rep)
        dsp.spectrogram_png(x, OUT / f'{name}_bed.png', f'{name} bed (game adaptive score)', marks=[(t, s) for t, s, _, _ in plan])
        print(name, rep['loudness'], rep['ffmpeg'])


if __name__ == '__main__':
    main()
