#!/usr/bin/env python3
"""Editor precomps -> videos/final/work/precomp/<id>.mkv (4K FFV1, so they enter the EDL like any capture).

sc_grid16: the showcase opener, a 4x4 grid of all 16 level solves running at once (each tile: from 1 s before
its Test-all to its win card, 300 frames). One heavy job (16 x 1080p decodes, streamed).
usage: python3 tools/video/assemble/precomp.py sc_grid16
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
import edl as E  # noqa: E402
import plans as P  # noqa: E402

LEVELS = ['0-1', '0-2', '1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3', '4-1', '4-2']
N = 300


def grid16():
    out = E.rel('videos/final/work/precomp/sc_grid16.mkv')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    ins, fc, used = [], [], []
    for lv in LEVELS:
        src, kind = P.resolve(f'sc_lv_{lv}')
        if kind == 'placeholder':  # 1-3 and 4-2 have no solve capture: use the matching meta-beat captures
            src = {'1-3': 'videos/capture/sc_clone_glitch.mkv', '4-2': 'videos/capture/sc_lights_out_ear.mkv'}[lv]
            t0 = 0 if lv == '1-3' else 2100
        else:
            t0 = max(0, P.find_event(src, 'test-all') - 60)
        used.append((lv, src, t0))
        k = len(used) - 1
        ins += ['-ss', f'{t0 / 60:.4f}', '-i', E.rel(src)]
        fc.append(f'[{k}:v]trim=end_frame={N},setpts=N/60/TB,scale=960:540:flags=lanczos,'
                  f'pad=968:548:4:4:color=0x0e0e0e[t{k}]')
    layout = '|'.join(f'{(k % 4) * 968}_{(k // 4) * 548}' for k in range(16))
    fc.append(''.join(f'[t{k}]' for k in range(16)) + f'xstack=inputs=16:layout={layout}:fill=0x0e0e0e,scale=3840:2160:flags=lanczos,format=bgr0[v]')
    cmd = ['ffmpeg', '-v', 'error', '-y', '-threads', '6', *ins, '-filter_complex', ';'.join(fc), '-map', '[v]', '-frames:v', str(N),
           '-r', '60', '-c:v', 'ffv1', '-level', '3', '-g', '1', '-slices', '16', '-pix_fmt', 'bgr0', out + '.tmp.mkv']
    subprocess.run([E.rel('tools/video/safe-run.sh'), '--heavy', '--', *cmd], check=True)
    os.replace(out + '.tmp.mkv', out)
    json.dump({'name': 'sc_grid16', 'fps': 60, 'frames': N, 'size': [3840, 2160], 'tiles': used, 'marks': [], 'clean': True},
              open(out.replace('.mkv', '.meta.json'), 'w'), indent=1)
    print(out)


if __name__ == '__main__':
    {'sc_grid16': grid16}[sys.argv[1]]()
