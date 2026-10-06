#!/usr/bin/env python3
"""
Pixel diff between two shoot.mjs label dirs (the "nerd OFF is pixel-identical" gate).

  python3 tools/nb/diff.py baseline-off after-v2                 # compares every PNG present in both
  python3 tools/nb/diff.py baseline-off after-v2 --glob 'off-*'   # only nerd-off shots
  options: --tol N   per-channel tolerance (default 0 = exact)
           --allow N  allowed differing pixels per image (default 0)
           --no-img   don't write diff images
           --strict   no raster-noise allowance (by default an image with <= 64 changed px AND max delta <= 48 counts as
                      'noise': swiftshader anti-aliasing of fractional-width bars/curves jitters by a few px between two
                      runs of the SAME build; any real layout/text change is hundreds of px at delta > 100)

Labels are dirs under tools/nb/out/ (or any path). Diff images go to tools/nb/out/_diff/<a>__<b>/ (changed pixels in red
over a dimmed copy of B, plus the bounding box). Exit 1 if any image differs (beyond --tol/--allow), is missing, or
changed size.
"""
import argparse, fnmatch, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))

def resolve(label):
    return label if os.path.isdir(label) else os.path.join(HERE, 'out', label)

def pngs(root):
    out = {}
    for d, _, fs in os.walk(root):
        if '_diff' in d: continue
        for f in fs:
            if f.endswith('.png'): out[os.path.relpath(os.path.join(d, f), root)] = os.path.join(d, f)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('a'); ap.add_argument('b')
    ap.add_argument('--glob', default='*'); ap.add_argument('--tol', type=int, default=0); ap.add_argument('--allow', type=int, default=0)
    ap.add_argument('--no-img', action='store_true'); ap.add_argument('--strict', action='store_true')
    o = ap.parse_args()
    A, B = resolve(o.a), resolve(o.b)
    pa, pb = pngs(A), pngs(B)
    keep = lambda k: fnmatch.fnmatch(os.path.basename(k), o.glob if o.glob.endswith('.png') else o.glob + '.png') or fnmatch.fnmatch(k, o.glob)
    keys = sorted(k for k in set(pa) | set(pb) if keep(k))
    outdir = os.path.join(HERE, 'out', '_diff', os.path.basename(A.rstrip('/')) + '__' + os.path.basename(B.rstrip('/')))
    bad = same = noise = 0
    for k in keys:
        if k not in pa or k not in pb:
            print(f'MISSING  {k}  (only in {"A" if k in pa else "B"})'); bad += 1; continue
        ia = np.asarray(Image.open(pa[k]).convert('RGB'), dtype=np.int16)
        ib = np.asarray(Image.open(pb[k]).convert('RGB'), dtype=np.int16)
        if ia.shape != ib.shape:
            print(f'SIZE     {k}  {ia.shape[1]}x{ia.shape[0]} vs {ib.shape[1]}x{ib.shape[0]}'); bad += 1; continue
        d = np.abs(ia - ib).max(axis=2)
        mask = d > o.tol
        n = int(mask.sum())
        if n <= o.allow:
            same += 1
            if n: print(f'ok~      {k}  {n} px within --allow')
            continue
        if not o.strict and n <= 64 and int(d.max()) <= 48:
            same += 1; noise += 1
            print(f'noise    {k}  {n} px, max delta {int(d.max())}')
            continue
        bad += 1
        ys, xs = np.nonzero(mask)
        bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
        print(f'DIFF     {k}  {n} px ({n / mask.size * 100:.3f}%), max delta {int(d.max())}, bbox x{bbox[0]}-{bbox[2]} y{bbox[1]}-{bbox[3]}')
        if not o.no_img:
            os.makedirs(os.path.join(outdir, os.path.dirname(k)), exist_ok=True)
            vis = (ib * 0.35 + 160).astype(np.uint8)
            vis[mask] = [255, 0, 0]
            im = Image.fromarray(vis)
            from PIL import ImageDraw
            ImageDraw.Draw(im).rectangle(bbox, outline=(0, 90, 255), width=2)
            im.save(os.path.join(outdir, k))
    print(f'\n{same}/{len(keys)} identical{"" if o.tol == 0 else f" (tol {o.tol})"} ({noise} of them raster noise only); {bad} differ/missing' + ('' if o.no_img or not bad else f'; diff images in {os.path.relpath(outdir)}'))
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
