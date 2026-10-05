#!/usr/bin/env python3
"""Full-res stills of the DELIVERED render at chosen frames, with a label each.
usage: stills_at.py <edl> <tag> f1:label f2:label ...  -> videos/final/review/<video>_<tag>_fNNNNN.png + <video>_<tag>.txt"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
sys.path.insert(0, HERE)
import edl as E  # noqa: E402
from run import grab, REVIEW  # noqa: E402

e = E.load(sys.argv[1])
tag = sys.argv[2]
req = [(int(a.split(':', 1)[0]), a.split(':', 1)[1] if ':' in a else '') for a in sys.argv[3:]]
imgs = grab(E.rel(e['outputs'][0]['path']), [f for f, _ in req])
os.makedirs(REVIEW, exist_ok=True)
lines = []
for f, why in req:
    if f in imgs:
        p = os.path.join(REVIEW, f'{e["video"]}_{tag}_f{f:05d}.png')
        Image.fromarray(imgs[f]).save(p)
        clip = next((c['id'] for c in e['clips'] if c['start'] <= f < c['start'] + c['dur']), '?')
        lines.append(f'{os.path.relpath(p, E.ROOT)}  ({f / 60:.2f}s, {clip}, {why})')
open(os.path.join(REVIEW, f'{e["video"]}_{tag}.txt'), 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
