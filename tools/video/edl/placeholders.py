#!/usr/bin/env python3
"""Synthetic placeholder shots for every registry id that has no real asset.

Writes videos/capture_placeholder/<id>.mkv (3840x2160, 60 fps, lossless
libx264rgb) plus .events.json / .layout.json / .meta.json in the exact format
of tools/video/capture (so every downstream path is exercised). Night shots
use smooth dark-blue gradients on purpose: they are the banding stress test.

usage: placeholders.py [--only id,id] [--force]
Every encode runs through tools/video/safe-run.sh (shared pool, 6 threads), one shot at a time.
"""
import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edl as E  # noqa: E402
import plans as P  # noqa: E402

OUT = E.rel(P.PH_DIR)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
W, H, FPS = 3840, 2160, 60
PAL = {'night': ('0x070b22', '0x1a2756'), 'day': ('0xf4e6cc', '0xe2bf8e'), 'none': ('0x2b1d4a', '0x6c63ff')}


def hue(sid):
    h = sum(ord(ch) * (i + 1) for i, ch in enumerate(sid)) % 360
    import colorsys
    r, g, b = colorsys.hsv_to_rgb(h / 360, 0.65, 0.95)
    return '0x%02x%02x%02x' % (int(r * 255), int(g * 255), int(b * 255))


SAFE = os.path.join(E.ROOT, 'tools/video/safe-run.sh')


def needs():
    """Frames each shot must provide = max(out) over the current EDLs (+1 s margin)."""
    need = {}
    for v in ('trailer', 'mechanic', 'showcase'):
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'{v}.edl.json')
        if os.path.exists(p):
            for c in E.load(p)['clips']:
                if not c['shot'].startswith('@'):
                    need[c['shot']] = max(need.get(c['shot'], 0), c['out'] + FPS)
    return need


def gen(spec, force=False, need=None):
    sid = spec['id']
    dst = os.path.join(OUT, sid + '.mkv')
    if os.path.exists(dst) and not force:
        return sid, 'exists'
    n = int(round(spec['ph'] * FPS))
    if need and sid in need:
        n = min(n, need[sid])
    c0, c1 = PAL.get(spec['grade'], PAL['day'])
    black = sid in ('mn_lights_out',)
    acc = hue(sid)
    txtc = 'white' if spec['grade'] in ('night', 'none') else '0x1a1a1a'
    vf = []
    if black:
        src = f'color=c=black:s={W}x{H}:r={FPS}:d={spec["ph"]}'
        vf.append(f"drawtext=fontfile={FONT}:text='{sid}':fontsize=40:fontcolor=0x202020:x=60:y=60")
    else:
        src = f'gradients=s={W}x{H}:r={FPS}:d={spec["ph"]}:c0={c0}:c1={c1}:nb_colors=2:type=linear:speed=0.004:seed=7'
        # a 'Qubble' that breathes and drifts, a horizon band, accent bar = shot identity (makes cuts detectable)
        vf += [f"drawbox=x=0:y=ih*0.72:w=iw:h=ih*0.28:color={acc}@0.35:t=fill",
               f"drawbox=x='iw*0.42+iw*0.06*sin(t*0.9)':y='ih*0.40+ih*0.02*sin(t*2.1)':w='ih*0.22':h='ih*0.22':color={acc}@0.9:t=fill",
               f"drawtext=fontfile={FONT}:text='{sid}':fontsize=150:fontcolor={txtc}:x=(w-tw)/2:y=h*0.12",
               f"drawtext=fontfile={FONT}:text='PLACEHOLDER  %{{frame_num}}':fontsize=70:fontcolor={txtc}@0.8:x=(w-tw)/2:y=h*0.12+190"]
        for k, (t, typ, name) in enumerate(spec['ev']):
            f = int(round(t * FPS))
            vf.append(f"drawbox=x=iw*0.40:y=ih*0.36:w=ih*0.30:h=ih*0.30:color=white@0.85:t=24:enable='between(n,{f},{f + 8})'")
            vf.append(f"drawtext=fontfile={FONT}:text='{name}':fontsize=90:fontcolor={txtc}:x=(w-tw)/2:y=h*0.80:enable='between(n,{f},{f + 40})'")
        if spec['kind'] == 'ui':  # fake UI chrome so the layout gate has something to check
            vf.append("drawbox=x=iw*0.62:y=ih*0.06:w=iw*0.36:h=ih*0.62:color=0xf2f0eb@0.92:t=fill")
            vf.append("drawbox=x=iw*0.20:y=ih*0.80:w=iw*0.40:h=ih*0.16:color=0xffffff@0.92:t=fill")
    os.makedirs(OUT, exist_ok=True)
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', src, '-vf', ','.join(vf) if vf else 'null', '-frames:v', str(n),
           '-c:v', 'libx264rgb', '-threads', '6', '-qp', '0', '-preset', 'ultrafast', '-g', '60', '-pix_fmt', 'rgb24', dst + '.tmp.mkv']
    subprocess.run(cmd, check=True)
    os.replace(dst + '.tmp.mkv', dst)
    events = []
    for t, typ, name in spec['ev']:
        f = int(round(t * FPS))
        if typ == 'mark':
            continue
        e = {'frame': f, 'type': typ, 'vt': round(t + 1.0, 6)}
        if typ == 'sfx':
            e.update(name=name, opts={})
        elif typ == 'botNote':
            e.update(bot=0, result={'beep': 1, 'quiet': 0}.get(name, 1), name=name)
        elif typ == 'syndromeChord':
            e.update(bits=[1, 0], name=name)
        events.append(e)
    base = os.path.join(OUT, sid)
    marks = [{'name': name, 'frame': int(round(t * FPS))} for t, typ, name in spec['ev'] if typ == 'mark']
    json.dump({'shot': sid, 'fps': FPS, 'frames': n, 'placeholder': True, 'events': events, 'dialogue': [], 'toasts': [], 'voiceLines': []},
              open(base + '.events.json', 'w'), indent=1)
    segs = []
    if spec['kind'] == 'ui':
        segs = [{'sel': '.editor', 'from': 0, 'to': n - 1, 'rects': [[int(1920 * .62), int(1080 * .06), int(1920 * .36), int(1080 * .62)]]},
                {'sel': '.dialogue', 'from': 0, 'to': n - 1, 'rects': [[int(1920 * .20), int(1080 * .80), int(1920 * .40), int(1080 * .16)]]}]
    json.dump({'shot': sid, 'fps': FPS, 'frames': n, 'coords': 'CSS px in a 1920x1080 frame (multiply by 2 for the capture pixels)',
               'segments': segs}, open(base + '.layout.json', 'w'), indent=1)
    json.dump({'name': sid, 'fps': FPS, 'frames': n, 'size': [W, H], 'css': [1920, 1080], 'scale': 2, 'placeholder': True,
               'marks': marks, 'clean': True}, open(base + '.meta.json', 'w'), indent=1)
    return sid, f'{n} frames'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    ids = a.only.split(',') if a.only else [k for k in P.R if P.resolve(k)[1] == 'placeholder']
    need = None if a.only else needs()  # --only: full registry length (alignment moves in-points)
    ids = [k for k in ids if not need or k in need]  # only shots the cuts actually use
    for k in ids:  # sequential, streamed, 6 threads (docs/VIDEO_RESOURCES.md)
        sid, msg = gen(P.R[k], a.force, need)
        print(f'{sid}: {msg}', flush=True)


if __name__ == '__main__':
    main()
