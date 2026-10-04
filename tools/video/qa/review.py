#!/usr/bin/env python3
"""Contact sheet + 10 full-res stills for the Critic/Director review.

usage: tools/video/safe-run.sh --mem 3G -- python3 tools/video/qa/review.py tools/video/edl/trailer.edl.json
-> videos/final/review/<video>_contact.png      one labelled thumbnail per clip (mid-frame), in cut order
   videos/final/review/<video>_still_NN_fFFFF.png  10 stills at 1920x1080: every caption at full legibility
                                                   first, then the key cue/section moments
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
sys.path.insert(0, HERE)
import edl as E  # noqa: E402
from run import grab, REVIEW  # noqa: E402

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def main():
    e = E.load(sys.argv[1])
    final = E.rel(e['outputs'][0]['path'])
    os.makedirs(REVIEW, exist_ok=True)
    v = e['video']
    # contact sheet
    mids = [c['start'] + c['dur'] // 2 for c in e['clips']]
    tw, th = 384, 216
    imgs = grab(final, mids, w=tw, h=th)
    cols = 6
    rows = (len(mids) + cols - 1) // cols
    pad = 30
    sheet = Image.new('RGB', (cols * tw, rows * (th + pad) + 50), (18, 18, 24))
    d = ImageDraw.Draw(sheet)
    f1, f2 = ImageFont.truetype(FONT, 22), ImageFont.truetype(FONT, 14)
    ph = sum(1 for c in e['clips'] if c.get('src_kind') == 'placeholder')
    d.text((10, 12), f'{v}  {e["duration"] / 60:.2f}s  {len(e["clips"])} shots  ({ph} placeholder)', fill=(240, 240, 235), font=f1)
    for k, (c, f) in enumerate(zip(e['clips'], mids)):
        x, y = (k % cols) * tw, 50 + (k // cols) * (th + pad)
        if f in imgs:
            sheet.paste(Image.fromarray(imgs[f]), (x, y))
        tag = f'{c["id"]} {c["start"] / 60:5.2f}s {c["dur"]}f {c.get("section") or ""} {c["shot"][:18]}'
        col = (255, 160, 90) if c.get('src_kind') == 'placeholder' else (150, 230, 160)
        d.text((x + 4, y + th + 6), tag, fill=col, font=f2)
        if c['transition']['type'] != 'cut':
            d.text((x + 6, y + 6), c['transition']['type'].upper(), fill=(255, 230, 0), font=f2)
    cp = os.path.join(REVIEW, f'{v}_contact.png')
    sheet.save(cp)
    # stills: captions first (mid-legibility), then cues and section starts, spread out
    cand = [(c['legible_from'] + (c['end'] - c['legible_from']) // 2, f'caption {c["id"]}') for c in e['captions']]
    for c in e['clips']:
        for q in c['cues']:
            cand.append((min(q['frame'] + 6, c['start'] + c['dur'] - 1), f'cue {q["name"]}'))
    seen = set()
    for c in e['clips']:
        if c.get('section') and c['section'] not in seen:
            seen.add(c['section'])
            cand.append((c['start'] + c['dur'] // 2, f'section {c["section"]}'))
    chosen = []
    for f, why in sorted(cand, key=lambda t: (not t[1].startswith('caption'), t[0])):
        if all(abs(f - g) > 45 for g, _ in chosen) and 0 <= f < e['duration']:
            chosen.append((f, why))
        if len(chosen) == 10:
            break
    chosen.sort()
    full = grab(final, [f for f, _ in chosen])
    for old in os.listdir(REVIEW):
        if old.startswith(f'{v}_still_'):
            os.remove(os.path.join(REVIEW, old))
    out = []
    for n, (f, why) in enumerate(chosen, 1):
        if f in full:
            p = os.path.join(REVIEW, f'{v}_still_{n:02d}_f{f:05d}.png')
            Image.fromarray(full[f]).save(p)
            out.append(f'{os.path.relpath(p, E.ROOT)}  ({f / 60:.2f}s, {why})')
    with open(os.path.join(REVIEW, f'{v}_stills.txt'), 'w') as fh:
        fh.write('\n'.join(out) + '\n')
    print(os.path.relpath(cp, E.ROOT))
    print('\n'.join(out))


if __name__ == '__main__':
    main()
