#!/usr/bin/env python3
"""Low-cost 1080p preview STILLS of chosen timeline frames, without a full render.

usage: tools/video/safe-run.sh --heavy -- python3 tools/video/qa/preview_frames.py tools/video/edl/trailer.edl.json 480 1450 1840 ...
       [--out videos/final/review/preview] [--tile]

Per frame: the clip's real Stage A path for that one frame (camera, split windows, grade LUT) via
render.render_chunk, then every overlay / caption alive at that frame (Motion fill+matte, `offset`, `hold`,
the editor drop shadow), composited at the work size and saved at 1920x1080. No grain, no encode.
Transitions (overlap frames) show the incoming clip only. Writes <out>/<video>_preview_fNNNNN.png (+ a tile).
"""
import argparse
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
sys.path.insert(0, os.path.join(HERE, '..', 'assemble'))
import edl as E  # noqa: E402
import render as R  # noqa: E402


def frame_of(path, idx, W, H, gray=False):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-threads', '6', '-i', E.rel(path), '-vf', f"select='eq(n\\,{idx})',scale={W}:{H}",
                        '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray' if gray else 'rgb24', '-'], capture_output=True)
    n = W * H * (1 if gray else 3)
    if len(r.stdout) < n:
        return None
    a = np.frombuffer(r.stdout[:n], np.uint8)
    return a.reshape(H, W) if gray else a.reshape(H, W, 3)


def composite(base, spec, idx, W, H):
    fill, matte = frame_of(spec['fill'], idx, W, H), frame_of(spec['matte'], idx, W, H, gray=True)
    if fill is None or matte is None:
        return base
    dx, dy = [round(v * s) for v, s in zip(spec.get('offset') or [0, 0], (W / 1920, H / 1080))]
    a = matte.astype(np.float32) / 255
    if spec.get('shadow'):
        sh = spec['shadow']
        m = Image.fromarray(matte).filter(ImageFilter.GaussianBlur(sh.get('sigma', 24) * W / 3840))
        sa = np.clip(np.asarray(m, np.float32) / 255 * sh.get('gain', 2.5), 0, 1) * sh.get('opacity', 0.8)
        base = blend(base, np.zeros_like(fill), sa, dx, dy)
    return blend(base, fill, a, dx, dy)


def blend(base, rgb, a, dx, dy):
    H, W = a.shape
    out = base.astype(np.float32)
    ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
    xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
    aa = a[ys, xs][..., None]
    out[yd, xd] = out[yd, xd] * (1 - aa) + rgb[ys, xs].astype(np.float32) * aa
    return out.astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('edl')
    ap.add_argument('frames', nargs='+', type=int)
    ap.add_argument('--out', default='videos/final/review/preview')
    ap.add_argument('--tile', action='store_true')
    a = ap.parse_args()
    e = E.load(a.edl)
    W, H = e['work']
    out = E.rel(a.out)
    os.makedirs(out, exist_ok=True)
    tmp = os.path.join(R.work_dir(e), 'preview')
    os.makedirs(tmp, exist_ok=True)
    saved = []
    for f in a.frames:
        c = next((x for x in reversed(e['clips']) if x['start'] <= f < x['start'] + x['dur']), None)
        if c is None:
            continue
        seg = os.path.join(tmp, f'{c["id"]}_{f:05d}.mkv')
        R.render_chunk(os.path.abspath(a.edl), c['id'], f - c['start'], f - c['start'] + 1, seg)
        img = frame_of(seg, 0, W, H)
        os.remove(seg)
        layers = [o for o in e['overlays'] if o['start'] <= f < o['start'] + o['dur'] and o.get('fill')]
        layers += [x['render'] for x in e['captions'] if x['start'] <= f < x['end'] and isinstance(x.get('render'), dict)
                   and x['render'].get('fill')]
        starts = {id(o): o['start'] for o in e['overlays']}
        starts.update({id(x['render']): x['start'] for x in e['captions'] if isinstance(x.get('render'), dict)})
        for spec in layers:
            idx = spec.get('in', 0) + f - starts[id(spec)]
            idx = min(idx, spec.get('frames', idx + 1) - 1)  # `hold`: the last frame
            img = composite(img, spec, idx, W, H)
        p = os.path.join(out, f'{e["video"]}_preview_f{f:05d}.png')
        Image.fromarray(img).resize((1920, 1080), Image.LANCZOS).save(p)
        saved.append(p)
        print(os.path.relpath(p, E.ROOT), c['id'], c['shot'], flush=True)
    if a.tile and saved:
        ims = [Image.open(p).resize((640, 360), Image.LANCZOS) for p in saved]
        cols = 3
        t = Image.new('RGB', (640 * cols, 360 * ((len(ims) + cols - 1) // cols)), (16, 16, 20))
        for k, im in enumerate(ims):
            t.paste(im, ((k % cols) * 640, (k // cols) * 360))
        tp = os.path.join(out, f'{e["video"]}_preview_tile.png')
        t.save(tp)
        print(os.path.relpath(tp, E.ROOT))


if __name__ == '__main__':
    main()
