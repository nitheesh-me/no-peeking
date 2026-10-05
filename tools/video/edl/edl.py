"""NO PEEKING! EDL library (schema np-edl/1).

Shared by the validator, the assembler, the QA gates and (read-only) the Sound
Designer's mix.py. Everything is in integer frames at the EDL's fps (60).

Timeline model
--------------
* `clips` are placed explicitly by `start` (timeline frame). A clip occupies
  [start, start+dur). Clips are sorted by start; consecutive clips must abut
  exactly (hard cut) unless the incoming clip declares an overlapping
  transition of `frames` length (blanket-wipe, glitch, shatter): then it starts
  `frames` before the previous clip ends.
* Source frames: `in` (inclusive) .. `out` (exclusive) of the shot file.
  `speed` is a number or {"keys": [[local_frame, speed], ...]} (piecewise
  linear in clip-local timeline frames; quantised into constant 6-frame chunks
  so the renderer and the frame map agree exactly). `dur` is derived from
  in/out/speed, or `out` is derived from in/dur/speed: give one of them.
* `camera`: [{"f": local_frame, "z": zoom, "cx": 0..1, "cy": 0..1,
  "ease": "linear|inout|in|out|hold"}]. z=1 shows the full source frame (or
  the full placed game area). cx/cy is the view centre in normalised source
  coordinates. The view is clamped inside the source (never shows outside).
"""
from __future__ import annotations

import json
import math
import os
import re
import subprocess
from functools import lru_cache

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SCHEMA = 'np-edl/1'
CHUNK = 6  # frames per constant-speed chunk for ramps

TRANSITIONS = {
    # type: (overlap?, default frames)
    'cut': (False, 0),
    'shatter': (True, 12),        # A shatters (Motion overlay) to black/B. Trailer only, once.
    'glitch': (True, 6),          # RGB tear A->B. Trailer only, once (the drop).
    'blanket-wipe': (True, 18),   # quilt sweeps A->B. Showcase only.
    'blanket-title': (True, 72),  # Motion blanket_title: cover 18 / hold 36 with a sewn-on level title / uncover 18. Showcase only.
    'xray-dissolve': (False, 0),  # in-engine, inside the incoming clip: a hard edit + exempt range
    'relight': (False, 0),        # in-engine day->night inside the clip: hard edit + exempt range
}
ALLOWED = {
    'trailer': {'cut', 'shatter', 'glitch', 'xray-dissolve', 'relight'},
    'mechanic': {'cut', 'xray-dissolve', 'relight'},
    'showcase': {'cut', 'xray-dissolve', 'relight', 'blanket-wipe', 'blanket-title'},
}
ONCE = {'trailer': {'shatter': 1, 'glitch': 1}}
FLAGS = ('on_beat', 'intentional_black', 'intentional_flash', 'intentional_hold')


def rel(p):
    return None if p is None else (p if os.path.isabs(p) else os.path.join(ROOT, p))


def load_json(p):
    with open(rel(p)) as f:
        return json.load(f)


# ───────────────────────── speed / frame map ─────────────────────────

def speed_at(speed, t):
    if isinstance(speed, (int, float)):
        return float(speed)
    keys = sorted(speed['keys'])
    if t <= keys[0][0]:
        return float(keys[0][1])
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * (t - t0) / max(1e-9, (t1 - t0))
    return float(keys[-1][1])


def speed_chunks(speed, max_frames=10 ** 7, n_src=None, dur=None):
    """Yield (local_start, length, v) constant-speed chunks covering the clip."""
    if isinstance(speed, (int, float)):
        return [(0, None, float(speed))]
    out = []
    t = 0
    while t < max_frames:
        v = speed_at(speed, t + CHUNK / 2)
        out.append((t, CHUNK, v))
        t += CHUNK
        if dur is not None and t >= dur:
            break
        if n_src is not None and sum(c[1] * c[2] for c in out) >= n_src:
            break
    return out


def frame_map(clip):
    """List src_frame for every local timeline frame (len == dur)."""
    i0 = int(clip['in'])
    sp = clip.get('speed', 1)
    dur = clip.get('dur')
    n_src = clip['out'] - i0 if clip.get('out') is not None else None
    if dur is None and n_src is None:
        raise ValueError(f"clip {clip.get('id')}: needs out or dur")
    res = []
    pos = 0.0
    t = 0
    limit = dur if dur is not None else 10 ** 7
    while t < limit:
        if dur is None and pos >= n_src - 1e-9:
            break
        v = speed_at(sp, (t // CHUNK) * CHUNK + CHUNK / 2) if not isinstance(sp, (int, float)) else float(sp)
        s = i0 + int(math.floor(pos + 1e-9))
        if n_src is not None:
            s = min(s, i0 + n_src - 1)
        res.append(s)
        pos += v
        t += 1
    return res


def normalize_clip(c):
    c = dict(c)
    c.setdefault('speed', 1)
    c.setdefault('camera', [{'f': 0, 'z': 1.0, 'cx': 0.5, 'cy': 0.5}])
    c.setdefault('transition', {'type': 'cut'})
    tr = c['transition']
    if isinstance(tr, str):
        tr = {'type': tr}
    tr.setdefault('frames', TRANSITIONS.get(tr['type'], (False, 0))[1] if TRANSITIONS.get(tr['type'], (False,))[0] else 0)
    c['transition'] = tr
    c['flags'] = {k: bool(c.get('flags', {}).get(k, False)) for k in FLAGS}
    fm = frame_map(c)
    c['_map'] = fm
    c['dur'] = len(fm)
    if c.get('out') is None:
        c['out'] = (fm[-1] + 1) if fm else c['in']
    c['end'] = c['start'] + c['dur']
    c.setdefault('grade', 'day')
    c.setdefault('cues', [])
    c.setdefault('scdet_exempt', [])
    return c


def load(path_or_obj):
    e = load_json(path_or_obj) if isinstance(path_or_obj, str) else json.loads(json.dumps(path_or_obj))
    e['clips'] = sorted((normalize_clip(c) for c in e['clips']), key=lambda c: c['start'])
    e.setdefault('captions', [])
    e.setdefault('overlays', [])
    e.setdefault('fx', [])
    e.setdefault('marks', [])
    e.setdefault('fps', 60)
    if 'duration' not in e:
        e['duration'] = max([c['end'] for c in e['clips']] + [o['start'] + o['dur'] for o in e['overlays']] + [0])
    return e


# ───────────────────────── camera ─────────────────────────

def _ease(name, u):
    u = min(1.0, max(0.0, u))
    if name == 'inout':
        return u * u * (3 - 2 * u)
    if name == 'in':
        return u * u
    if name == 'out':
        return 1 - (1 - u) * (1 - u)
    if name == 'hold':
        return 0.0
    return u


def camera_at(cam, t):
    """(z, cx, cy) at clip-local frame t. Ease belongs to the destination key."""
    keys = sorted(cam, key=lambda k: k['f'])
    if t <= keys[0]['f']:
        k = keys[0]
        return k.get('z', 1.0), k.get('cx', 0.5), k.get('cy', 0.5)
    for a, b in zip(keys, keys[1:]):
        if t <= b['f']:
            u = _ease(b.get('ease', 'inout'), (t - a['f']) / max(1e-9, b['f'] - a['f']))
            lerp = lambda x, y: x + (y - x) * u
            return (lerp(a.get('z', 1.0), b.get('z', 1.0)), lerp(a.get('cx', .5), b.get('cx', .5)),
                    lerp(a.get('cy', .5), b.get('cy', .5)))
    k = keys[-1]
    return k.get('z', 1.0), k.get('cx', 0.5), k.get('cy', 0.5)


def view_box(src_w, src_h, area_w, area_h, z, cx, cy):
    """Float source-pixel box (x0, y0, x1, y1) shown in an output area of
    area_w x area_h at zoom z (z=1: the largest box of the area's aspect that
    fits the source)."""
    ar = area_w / area_h
    bw, bh = (src_w, src_w / ar) if src_w / src_h <= ar else (src_h * ar, src_h)
    w, h = bw / z, bh / z
    x0 = min(max(cx * src_w - w / 2, 0), src_w - w)
    y0 = min(max(cy * src_h - h / 2, 0), src_h - h)
    return x0, y0, x0 + w, y0 + h


def max_zoom(clip):
    return max(k.get('z', 1.0) for k in clip['camera'])


# ───────────────────────── placement (layout modes) ─────────────────────────

def game_area(edl, size=None):
    """Output rect (x, y, w, h) where the game picture goes, at `size`
    (default the work size). cinema: full frame. strip: 88% at the top,
    centred, with a fixed bottom 12% caption strip."""
    W, H = size or edl['work']
    if edl.get('layout', 'cinema') == 'strip':
        gh = round(H * 0.88)
        gw = round(W * 0.88)
        return ((W - gw) // 2, 0, gw, gh)
    return (0, 0, W, H)


def window_at(win, t):
    """A split-screen window at clip-local frame t. Optional win['keys'] = [[f, [x, y, w, h]], ...] (normalised
    source rects) move the source crop over time (e.g. the code window following the lit card); each move eases
    in-out between consecutive keys. Without keys the window is static (win['src'])."""
    keys = win.get('keys')
    if not keys:
        return win
    keys = sorted(keys, key=lambda k: k[0])
    if t <= keys[0][0]:
        src = keys[0][1]
    elif t >= keys[-1][0]:
        src = keys[-1][1]
    else:
        for (f0, a), (f1, b) in zip(keys, keys[1:]):
            if f0 <= t <= f1:
                u = _ease('inout', (t - f0) / max(1e-9, f1 - f0))
                src = [x + (y - x) * u for x, y in zip(a, b)]
                break
    w = dict(win)
    w['src'] = list(src)
    return w


def window_boxes(win, src_w, src_h, size_w):
    """One split-screen window: (source box (x0, y0, x1, y1) in source px, cover-cropped to the destination
    aspect and centred in the source rect; destination rect (x, y, w, h) in output px at width size_w).
    win = {"src": [x, y, w, h] normalised 0..1, "dst": [x, y, w, h] in 1080p units}."""
    k = size_w / 1920
    dx, dy, dw, dh = [round(v * k) for v in win['dst']]
    sx, sy, sw_, sh_ = win['src']
    sx, sy, sw_, sh_ = sx * src_w, sy * src_h, sw_ * src_w, sh_ * src_h
    ar = dw / dh
    if sw_ / sh_ > ar:  # source rect too wide: crop width
        w = sh_ * ar
        x0, y0, x1, y1 = sx + (sw_ - w) / 2, sy, sx + (sw_ + w) / 2, sy + sh_
    else:
        hh = sw_ / ar
        ay = win.get('anchor_y', 0.5)  # 0 = keep the top (the Bot Code column starts at its top)
        x0, y0, x1, y1 = sx, sy + (sh_ - hh) * ay, sx + sw_, sy + (sh_ - hh) * ay + hh
    return (x0, y0, x1, y1), (dx, dy, dw, dh)


def strip_rect(edl, size=None):
    W, H = size or edl['work']
    gh = round(H * 0.88)
    return (0, gh, W, H - gh)


# ───────────────────────── sources ─────────────────────────

@lru_cache(maxsize=None)
def probe(src):
    """(w, h, nframes, fps) for a video file or image-sequence directory."""
    p = rel(src)
    if src.startswith('@'):
        return (None, None, 10 ** 9, 60)
    if os.path.isdir(p):
        files = sorted(f for f in os.listdir(p) if re.search(r'\.(png|jpg|tif|tiff|exr)$', f, re.I))
        from PIL import Image
        with Image.open(os.path.join(p, files[0])) as im:
            w, h = im.size
        return (w, h, len(files), 60)
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets',
                          '-show_entries', 'stream=width,height,nb_read_packets,r_frame_rate',
                          '-of', 'json', p], capture_output=True, text=True, check=True).stdout
    s = json.loads(out)['streams'][0]
    num, den = s['r_frame_rate'].split('/')
    return (int(s['width']), int(s['height']), int(s['nb_read_packets']), float(num) / float(den))


def seq_pattern(d):
    """ffmpeg image2 args for a directory of numbered frames."""
    p = rel(d)
    files = sorted(f for f in os.listdir(p) if re.search(r'\.(png|jpg|tif|tiff)$', f, re.I))
    m = re.match(r'^(.*?)(\d+)(\.\w+)$', files[0])
    pre, num, ext = m.groups()
    return os.path.join(p, f'{pre}%0{len(num)}d{ext}'), int(num)


# ───────────────────────── derived timeline data ─────────────────────────

def cut_list(edl):
    """Every edit point: list of dicts {frame, type, on_beat, clip}. For an
    overlapping transition the 'frame' is the transition's midpoint (where
    scdet would fire) and 'range' its extent."""
    cuts = []
    for prev, c in zip(edl['clips'], edl['clips'][1:]):
        if c.get('continuous'):  # same shot continues across a section boundary: not a visible edit
            continue
        tr = c['transition']
        if TRANSITIONS[tr['type']][0] and tr.get('frames', 0) > 0:
            cuts.append({'frame': c['start'] + tr['frames'] // 2, 'type': tr['type'],
                         'range': [c['start'], c['start'] + tr['frames']],
                         'on_beat': c['flags']['on_beat'], 'clip': c['id'],
                         'beat_frame': c.get('beat_frame', c['start'])})
        else:
            cuts.append({'frame': c['start'], 'type': tr['type'], 'on_beat': c['flags']['on_beat'],
                         'clip': c['id'], 'beat_frame': c.get('beat_frame', c['start'])})
        if c.get('grid_waiver'):
            cuts[-1]['grid_waiver'] = c['grid_waiver']
    return cuts


def local_to_timeline(clip, src_frame):
    """First timeline frame at which source frame `src_frame` is shown, or None."""
    m = clip['_map']
    for i, s in enumerate(m):
        if s >= src_frame:
            return clip['start'] + i if s == src_frame or (i > 0 and m[i - 1] < src_frame) else None
    return None


def load_events(path):
    """Normalise a Capture Engineer *.events.json into a list of
    {frame, type, name, ...}. Accepts a list or {"events": [...]} with either
    `frame` or `vt` (virtual seconds; frame = round(vt*fps - first))."""
    if not path or not os.path.exists(rel(path)):
        return []
    d = load_json(path)
    fps = 60
    first = 0.0
    evs = d
    if isinstance(d, dict):
        fps = d.get('fps', 60)
        first = d.get('t0', 0.0)
        evs = d.get('events', [])
    out = []
    for e in evs:
        e = dict(e)
        if 'frame' in e and e['frame'] is None:  # off camera (not recording)
            continue
        if 'frame' not in e:
            e['frame'] = int(round((e.get('vt', 0) - first) * fps))
        e.setdefault('name', e.get('type'))
        out.append(e)
    return out


VISIBLE_TYPES = {'sfx', 'botNote', 'syndromeChord', 'win_card'}


def timeline_events(edl):
    """Every capture event that is on screen in the cut, mapped to timeline
    frames (the contract for the Sound Designer and the A/V gates)."""
    out = []
    for c in edl['clips']:
        evs = load_events(c.get('events'))
        for e in evs:
            f = e['frame']
            if not (c['in'] <= f < c['out']):
                continue
            tf = local_to_timeline(c, f)
            if tf is None:  # skipped by a speed-up: the event's frame is never shown
                m = c['_map']
                idx = next((i for i, s in enumerate(m) if s >= f), None)
                if idx is None:
                    continue
                tf = c['start'] + idx
            # an overlapping outgoing transition hides the tail; keep it, flagged
            ev = {k: v for k, v in e.items() if not k.startswith('_')}
            ev.update({'clip': c['id'], 'shot': c.get('shot'), 'src_frame': f, 'frame': tf,
                       'speed': speed_at(c['speed'], tf - c['start']),
                       'visible': bool(e.get('visual', e.get('type') in VISIBLE_TYPES))})
            out.append(ev)
    return sorted(out, key=lambda e: e['frame'])


def resolved(edl):
    """JSON-safe resolved EDL (explicit dur/out/end, per-clip frame-map
    segments, timeline events, cut list)."""
    r = {k: v for k, v in edl.items() if k != 'clips'}
    r['clips'] = []
    for c in edl['clips']:
        cc = {k: v for k, v in c.items() if not k.startswith('_')}
        cc['src_frames'] = list(c['_map'])  # src frame shown at timeline frame start+i
        r['clips'].append(cc)
    r['timeline_events'] = timeline_events(edl)
    r['cuts'] = cut_list(edl)
    return r


# ───────────────────────── cue sheet ─────────────────────────

def load_cue_sheet(path, fps=60):
    """Normalise the Music Supervisor's cue_sheet.json: returns
    {bpm, beats[], downbeats[], sections{name: (start, end)}} in frames.
    Accepts *_frames or *_s / seconds variants."""
    d = load_json(path)

    def fr(lst_key):
        v = d.get(lst_key)
        if v and isinstance(v[0], dict):  # [{k, frame, downbeat, ...}]
            return [int(x['frame']) for x in v]
        for k in (lst_key + '_frames', lst_key):
            if k in d and d[k] and isinstance(d[k][0], int):
                return list(d[k])
        for k in (lst_key + '_s', lst_key + '_sec', lst_key):
            if k in d and d[k]:
                return [int(round(x * fps)) for x in d[k]]
        return []

    beats = fr('beats') or fr('beat')
    downs = fr('downbeats') or fr('downbeat')
    secs = {}
    raw = d.get('sections', [])
    for i, s in enumerate(raw):
        a = s.get('start_frame', None)
        if a is None:
            a = int(round(s.get('start_s', s.get('start', 0)) * fps))
        b = s.get('end_frame', None)
        if b is None:
            if 'end_s' in s or 'end' in s:
                b = int(round(s.get('end_s', s.get('end')) * fps))
            elif i + 1 < len(raw):
                nx = raw[i + 1]
                b = nx.get('start_frame', int(round(nx.get('start_s', nx.get('start', 0)) * fps)))
            else:
                b = int(round(d.get('duration_s', 0) * fps)) or d.get('duration_frames', a)
        secs[s['name']] = (a, b)
    hits = d.get('hits', [])
    if 'named_hits' in d:
        hits = d['named_hits']
    grid = d.get('grid') or {}
    if 'beat0_frame' in grid and d.get('beat_frames'):  # extend the grid to the end of the piece
        end = d.get('duration_frames', beats[-1] if beats else 0)
        k = len(beats)
        while grid['beat0_frame'] + d['beat_frames'] * k <= end:
            beats.append(grid['beat0_frame'] + d['beat_frames'] * k)
            k += 1
    return {'bpm': d.get('bpm'), 'duration': d.get('duration_frames'), 'beats': beats, 'downbeats': downs, 'sections': secs, 'hits': hits,
            'raw': d}


def nearest(lst, f):
    if not lst:
        return None
    return min(lst, key=lambda b: abs(b - f))
