#!/usr/bin/env python3
"""Contact sheet of stills: sheet.py out.png cols a.png b.png … (each labelled with its file name)."""
import sys
from PIL import Image, ImageDraw
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
tw = 640
ims = []
for f in files:
    im = Image.open(f).convert('RGBA')
    bg = Image.new('RGBA', im.size, (40, 40, 40, 255))
    # checkerboard behind transparent stills
    d = ImageDraw.Draw(bg)
    s = max(8, im.size[0] // 60)
    for y in range(0, im.size[1], s):
        for x in range(0, im.size[0], s):
            if (x // s + y // s) % 2: d.rectangle([x, y, x + s - 1, y + s - 1], fill=(70, 70, 70, 255))
    bg.alpha_composite(im)
    th = bg.convert('RGB').resize((tw, int(im.size[1] * tw / im.size[0])), Image.LANCZOS)
    ImageDraw.Draw(th).text((6, 4), f.split('/')[-1], fill=(255, 0, 255))
    ims.append(th)
rows = (len(ims) + cols - 1) // cols
h = ims[0].size[1]
sheet = Image.new('RGB', (cols * tw, rows * h), (0, 0, 0))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * tw, (i // cols) * h))
sheet.save(out)
print(out)
