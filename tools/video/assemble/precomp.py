#!/usr/bin/env python3
"""Precomposed showcase shots -> videos/final/work/precomp/<id>.mkv (FFV1, 3840x2160 canvas so the
showcase's upscale guard holds at 1080p).

  python3 tools/video/assemble/precomp.py grid16   # 4x4: all 16 levels solving at once (sc-grid-<id>), each
                                                   # time-scaled to finish together in --secs (default 5 s)
  python3 tools/video/assemble/precomp.py qol      # 2x2 quick-fire: snippets / notebook / help slot / step mode

Runs as one `safe-run --heavy` job (streamed, -threads 6). Missing inputs are listed and the job is skipped.
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
import edl as E  # noqa: E402

LEVELS = ['0-1', '0-2', '1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3', '4-1', '4-2']
SAFE = os.path.join(E.ROOT, 'tools/video/safe-run.sh')
OUT = E.rel('videos/final/work/precomp')


def build(name, srcs, cols, rows, secs, labels):
    miss = [s for s in srcs if not os.path.exists(E.rel(s))]
    if miss:
        print(f'{name}: waiting for {len(miss)} capture(s): ' + ', '.join(os.path.basename(m) for m in miss))
        return False
    W, H = 3840, 2160
    cw, ch = W // cols, H // rows
    gap = 12
    ins, fc = [], []
    n_out = int(secs * 60)
    for k, s in enumerate(srcs):
        n = E.probe(s)[2]
        f = n / n_out  # speed factor so every tile finishes together
        ins += ['-i', E.rel(s)]
        fc.append(f'[{k}:v]setpts=PTS/{f:.6f},fps=60,trim=end_frame={n_out},setpts=N/60/TB,'
                  f'scale={cw - gap}:{ch - gap}:flags=lanczos,pad={cw}:{ch}:{gap // 2}:{gap // 2}:color=0x0e0e0e,format=gbrp[t{k}]')
    layout = '|'.join(f'{(k % cols) * cw}_{(k // cols) * ch}' for k in range(len(srcs)))
    fc.append(''.join(f'[t{k}]' for k in range(len(srcs))) + f'xstack=inputs={len(srcs)}:layout={layout}[out]')
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, f'{name}.mkv')
    cmd = [SAFE, '--heavy', '--', 'ffmpeg', '-v', 'error', '-y', '-threads', '6', *ins, '-filter_complex', ';'.join(fc),
           '-map', '[out]', '-frames:v', str(n_out), '-c:v', 'ffv1', '-level', '3', '-g', '1', '-pix_fmt', 'gbrp', dst + '.tmp.mkv']
    subprocess.run(cmd, check=True)
    os.replace(dst + '.tmp.mkv', dst)
    print(f'{name}: {os.path.relpath(dst, E.ROOT)} ({n_out} frames)')
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('which', choices=['grid16', 'qol', 'all'])
    ap.add_argument('--secs', type=float, default=5.0)
    a = ap.parse_args()
    if a.which in ('grid16', 'all'):
        build('sc_grid16', [f'videos/capture/sc-grid-{lv}.mkv' for lv in LEVELS], 4, 4, a.secs, LEVELS)
    if a.which in ('qol', 'all'):
        build('sc_qol_grid', [f'videos/capture/{n}.mkv' for n in ('sc-qol-snippets', 'sc-notebook', 'sc-qol-help', 'sc-qol-stepmode')],
              2, 2, 15.0, None)


if __name__ == '__main__':
    main()
