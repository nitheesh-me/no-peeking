#!/usr/bin/env python3
"""
Contact sheet for captured shots: one row per shot, 5 frames (10/30/50/70/90 %), labelled with id, frames and size.
  python3 tools/video/capture/contact_sheet.py out.png videos/capture/tr_*.mkv
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw

def frames_of(p):
    meta = os.path.splitext(p)[0] + '.meta.json'
    if os.path.exists(meta): return json.load(open(meta))['frames']
    out = subprocess.run(['ffprobe', '-v', 'error', '-count_packets', '-select_streams', 'v', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout
    return int(out.strip() or 0)

def grab(p, t, w):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', p, '-frames:v', '1', '-vf', f'scale={w}:-2:flags=area', '-f', 'image2pipe', '-c:v', 'png', '-'], capture_output=True).stdout
    from io import BytesIO
    return Image.open(BytesIO(raw)).convert('RGB') if raw else Image.new('RGB', (w, w * 9 // 16))

def main():
    out, clips = sys.argv[1], sys.argv[2:]
    W = 384; rows = []
    for c in clips:
        n = frames_of(c); st = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'json', c], capture_output=True, text=True).stdout)['streams'][0]
        ims = [grab(c, n / 60 * k, W) for k in (0.1, 0.3, 0.5, 0.7, 0.9)]
        row = Image.new('RGB', (W * 5, ims[0].height + 22), 'white')
        for i, im in enumerate(ims): row.paste(im, (i * W, 22))
        ImageDraw.Draw(row).text((6, 4), f"{os.path.basename(c)}   {n} f   {st['width']}x{st['height']}", fill='black')
        rows.append(row)
    sheet = Image.new('RGB', (W * 5, sum(r.height for r in rows)), 'white'); y = 0
    for r in rows: sheet.paste(r, (0, y)); y += r.height
    sheet.save(out); print('wrote', out, len(rows), 'rows')

if __name__ == '__main__':
    main()
