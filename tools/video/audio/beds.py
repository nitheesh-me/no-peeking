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


# EDL section → game music scene (scene, tension, harmony). The sequencer switches scenes on the next BAR
# (src/audio/music.ts), so a section change never cuts the bed mid-phrase.
SCENE_OF = {
    'cold_open': ('title', 0, 1), 'rule': ('build', 0, 1), 'threat': ('run', 0.5, 0.7), 'cant_copy': ('build', 0, 1),
    'ask': ('lab', 0, 1), 'repair': ('run', 0.35, 0.85), 'proof': ('build', 0, 1), 'twist': ('run', 0.6, 0.6),
    'close': ('title', 0, 1), 'under_the_hood': ('lab', 0, 1), 'end_card': ('credits', 0, 1),
    'open': ('map', 0, 1), 'ch1': ('build', 0, 1), 'ch2': ('lab', 0, 1), 'ch3': ('run', 0.4, 0.8), 'ch4': ('run', 0.6, 0.7),
    'labs': ('lab', 0, 1), 'codex': ('map', 0, 1), 'notebook': ('lab', 0, 1), 'qol': ('build', 0, 1), 'credits': ('credits', 0, 1),
}


def plan_from_edl(edl_path):
    """(duration_s, plan) from an EDL: one scene per section (clip `section`), plus the engine's win sting
    on every level_win event shown in the cut (a gentle lift on level wins)."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'edl'))
    import edl as E
    import mix as MX
    e = E.load(str(edl_path))
    secs = []
    for c in e['clips']:
        nm = c.get('section') or 'build'
        if secs and secs[-1][0] == nm:
            continue
        secs.append((nm, c['start']))
    plan = [(f / 60.0, *SCENE_OF.get(nm, ('build', 0, 1))) for nm, f in secs]
    wins = []
    for c in e['clips']:
        for ev in MX.load_events(c.get('events')):
            if ev.get('type') == 'sfx' and ev.get('name') == 'level_win' and ev.get('frame') is not None and c['in'] <= ev['frame'] < c['out']:
                m = c['_map']
                idx = next((i for i, s in enumerate(m) if s >= ev['frame']), None)
                if idx is not None:
                    wins.append((c['start'] + idx) / 60.0)
    return e['duration'] / 60.0, plan, sorted(set(round(w, 3) for w in wins))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('which', nargs='?', default='all')
    ap.add_argument('--plan')
    ap.add_argument('--edl', action='store_true', help='plan from tools/video/edl/<which>.edl.json (sections + level wins)')
    a = ap.parse_args()
    todo = ['mechanic', 'showcase'] if a.which == 'all' else [a.which]
    for name in todo:
        dur, plan = PLANS[name]
        wins = []
        if a.edl:
            dur, plan, wins = plan_from_edl(ROOT / f'tools/video/edl/{name}.edl.json')
        if a.plan:
            p = json.loads(Path(a.plan).read_text())
            plan = [(e['t'], e['scene'], e.get('tension', 0), e.get('harmony', 1)) for e in p]
        calls = []
        for t, scene, ten, har in plan:
            calls += [{'t': t, 'k': 'scene', 'v': scene}, {'t': t + 0.01, 'k': 'tension', 'v': ten}, {'t': t + 0.02, 'k': 'harmony', 'v': har}]
        for w in wins:  # the engine's 2-bar win sting, then it returns to the section's scene by itself
            calls.append({'t': max(0.0, w - 0.05), 'k': 'scene', 'v': 'win'})
        x, = render_jobs([{'name': f'{name} bed', 'secs': dur + 2, 'music': True, 'master': 'raw', 'dry': False, 'seed': 42,
                           'scene0': plan[0][1], 'calls': calls}])
        x = dsp.fit(x, int(dur * dsp.SR))
        x = dsp.fade(dsp.highpass(x, 30, 2), 1.5, 3.0)
        x = dsp.limiter(x * dsp.undb(-18.0 - dsp.integrated(x)), -1.2)
        OUT.mkdir(parents=True, exist_ok=True)
        p = OUT / f'{name}_bed.wav'
        dsp.write_wav(p, x)
        rep = {'plan': plan, 'level_wins_s': wins, 'bpm': 84, 'meter': '4/4 (swung 8ths 0.62)', 'beat0_s': 0.08,
               'loudness': dsp.loudness_report(x), 'ffmpeg': dsp.ffmpeg_ebur128(p)}
        dsp.save_json(OUT / f'{name}_bed.json', rep)
        dsp.spectrogram_png(x, OUT / f'{name}_bed.png', f'{name} bed (game adaptive score)', marks=[(t, s) for t, s, _, _ in plan])
        print(name, rep['loudness'], rep['ffmpeg'])


if __name__ == '__main__':
    main()
