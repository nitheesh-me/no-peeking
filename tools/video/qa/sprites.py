"""In-scene obstacle check for captions (Critic re-review): sprites (q/a/b labels, characters, bots) are drawn on the
game canvas, so the capture's DOM layout.json does not contain them. Two sources:
  1. layout.json segments whose selector starts with 'sprite:' or 'actor:' (Capture Engineer contract; preferred);
  2. pixel fallback on the CAPTION-FREE frame (the Stage A segment: graded, camera-moved, windows applied): the
     game draws every sprite with a dark ink outline, so obstacle pixels = strong edges whose dark side is ink.
     Measured only under the caption's real footprint (glyph matte dilated by the outline/glow reach).
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
sys.path.insert(0, os.path.join(HERE, '..', 'assemble'))
import edl as E  # noqa: E402

INK_EDGE = 60      # min local contrast (0..255 luma) of an ink outline edge
INK_DARK = 70      # the dark side of the edge must be ink-dark (luma <= this) after the grade
FRAC_FAIL = 0.02   # share of footprint pixels on sprite outlines that fails the caption


def caption_free(e, f, size=(1920, 1080)):
    """Timeline frame f before captions/overlays: from the clip's Stage A chunk file."""
    import render as R
    from run import grab
    c = next((c for c in e['clips'] if c['start'] <= f < c['start'] + c['dur']), None)
    if c is None:
        return None, None
    if not c['src'].startswith('@') and not os.path.exists(E.rel(c['src'])):
        return None, c  # source being re-captured: no segment key
    key = R.seg_key(e, c)
    li = f - c['start']
    i0 = (li // R.CHUNK) * R.CHUNK
    p = os.path.join(R.work_dir(e), 'seg', f'{c["id"]}_{key}_{i0:05d}.mkv')
    if os.path.exists(p):
        return grab(p, [li - i0], w=size[0], h=size[1], gray=True).get(li - i0), c
    # disk-limited (--jit) renders delete consumed segments: rebuild just this frame through Stage A (cached, ~1 MB)
    q = os.path.join(R.work_dir(e), 'qa_capfree', f'{c["id"]}_{key}_{li:05d}.mkv')
    if not os.path.exists(q):
        os.makedirs(os.path.dirname(q), exist_ok=True)
        try:
            R.render_chunk(E.rel(e.get('_path', f'tools/video/edl/{e["video"]}.edl.json')), c['id'], li, li + 1, q)
        except Exception:
            return None, c
    return grab(q, [0], w=size[0], h=size[1], gray=True).get(0), c


MAX_SPRITE = 280  # px at 1080: sprites are compact; longer ink runs are room geometry (rug border, bed, floor edges)


def ink_mask(g, compact=True):
    """Ink-outline pixels; with compact=True only connected blobs no larger than MAX_SPRITE (characters, bots,
    q/a/b labels), dropping long scene lines."""
    from scipy import ndimage
    g = g.astype(np.int16)
    mx = ndimage.maximum_filter(g, 5)
    mn = ndimage.minimum_filter(g, 5)
    ink = ((mx - mn) >= INK_EDGE) & (mn <= INK_DARK)
    if not compact:
        return ink
    k = MAX_SPRITE * g.shape[0] / 1080
    lab, n = ndimage.label(ndimage.binary_dilation(ink, iterations=2))
    keep = np.zeros(n + 1, bool)
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is not None and max(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start) <= k:
            keep[i] = True
    return ink & keep[lab]


def footprint(matte, reach=14):
    from scipy import ndimage
    return ndimage.binary_dilation(matte > 0.25, iterations=reach)


def layout_sprites(e, c, size, f):
    """sprite:/actor: boxes from the clip's layout.json at timeline frame f (output px)."""
    from run import layout_boxes
    return [b for b in layout_boxes(e, c, size, f, f + 1) if b[0].split('@')[0].startswith(('sprite:', 'actor:'))]
