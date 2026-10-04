#!/usr/bin/env python3
"""Strip captions through the Motion Designer's caption scene (tools/video/motion, scene `caption`).

usage: python3 tools/video/assemble/motion_captions.py tools/video/edl/mechanic.edl.json   (edits the EDL in place)

Every strip caption of the EDL gets a 40-frame slot in one alpha track (<= 14 captions = <= 600 frames per
render job): the item animates in over its first 24 frames (line slide-up, gloss chips pop), the assembler
holds the fully-in frame for the caption's duration and fades it out over 8 frames. The track's last frame
(no items) is the empty paper strip, held under the whole video. Renders are cached by content.
Each render is one heavy job: tools/video/safe-run.sh --heavy (docs/VIDEO_RESOURCES.md).
"""
import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
import edl as E  # noqa: E402

SLOT, IN_DONE, PER_TRACK = 40, 30, 14
OUT = 'videos/final/work/motion_ext'


def main():
    p = sys.argv[1]
    e = json.load(open(E.rel(p)))
    caps = [c for c in e['captions'] if c['position'] == 'strip']
    tracks = [caps[i:i + PER_TRACK] for i in range(0, len(caps), PER_TRACK)] or [[]]
    base = None
    for t, group in enumerate(tracks):
        items = []
        for k, c in enumerate(group):
            it = {'in': k * SLOT, 'out': k * SLOT + SLOT}
            line, gloss, gloss2 = c.get('line'), c.get('gloss'), c.get('gloss2')
            if line is None and gloss is None:
                if c['text'].startswith('='):
                    gloss = c['text']
                else:
                    line = c['text']
            if line:
                it['text'] = line
            if gloss:
                it['gloss'] = gloss
            if gloss2:
                it['gloss2'] = gloss2
            items.append(it)
        frames = len(group) * SLOT + 1
        params = {'frames': frames, 'items': items}
        key = hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()[:10]
        name = f'captions_{e["video"]}_{t}_{key}'
        fill, matte = f'{OUT}/{name}_fill.mkv', f'{OUT}/{name}_matte.mkv'
        if not os.path.exists(E.rel(matte)):
            subprocess.run([E.rel('tools/video/safe-run.sh'), '--heavy', '--', 'node', E.rel('tools/video/motion/render.mjs'),
                            'caption_strip_demo', '--p', json.dumps(params), '--name', name, '--out', E.rel(OUT)], check=True)
        for k, c in enumerate(group):
            c['render'] = {'fill': fill, 'matte': matte, 'in': k * SLOT, 'frames': k * SLOT + IN_DONE, 'fade_out': 8}
            c['legible_from'] = max(c['legible_from'], c['start'] + 24)
        if base is None:
            base = {'fill': fill, 'matte': matte, 'in': frames - 1, 'frames': frames}
    e['overlays'] = [o for o in e.get('overlays', []) if o.get('id') != 'caption_strip']
    e['overlays'].insert(0, dict(id='caption_strip', start=0, dur=e['duration'], **base))
    e['strip_overlay'] = True
    json.dump(e, open(E.rel(p), 'w'), indent=1)
    print(f'{p}: {len(caps)} strip captions in {len(tracks)} track(s); strip base from {base["fill"]}')


if __name__ == '__main__':
    main()
