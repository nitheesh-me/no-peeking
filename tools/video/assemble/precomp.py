#!/usr/bin/env python3
"""Editor precomps -> videos/final/work/precomp/<id>.mkv (4K FFV1, so they enter the EDL like any capture).

usage: python3 tools/video/assemble/precomp.py sc_grid16|sc_qol4 [--dry-run]
Each is ONE heavy job (safe-run --heavy; the label PNGs are one short Chromium job before it). --dry-run prints
the plan (tiles, in-points, solve frames, crops) and the filtergraph without running anything.

sc_grid16 (v2, showcase plan 5 Oct): the opener. A 4x4 grid of all 16 levels in chapter order (row-major), each tile
  the level's own verified solve, timed so the solves CASCADE: tile k shows its "solved" moment (the win card popping,
  or for 1-3 the clone glitch and for 4-2 the bots' syndrome chord in the dark, since those two levels are covered
  by meta-beat captures) at grid frame 54 + 12k (f54 -> f234), then all 16 hold solved to f300. Each tile has its
  level chip (top-left, permanent) and a green check that pops (6-frame fade) 8 frames after its solve.
sc_qol4 (new): the QoL quick-fire, 2x2, 600 frames, each quadrant a 2x crop of the feature from its own take:
  TL snippets + doodle comment | TR step mode, scrubbed to the one-way measurement snap | BL the help slot | BR Export
  to Qiskit. Crops (normalised centres + zoom) come from the trailer's measured framings where they exist;
  VERIFY them on stills before the render (flagged in docs/VIDEO_EDIT.md "Showcase plan").
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
import edl as E  # noqa: E402
import plans as P  # noqa: E402

LEVELS = ['0-1', '0-2', '1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3', '4-1', '4-2']
SAFE = E.rel('tools/video/safe-run.sh')
OUT_DIR = E.rel('videos/final/work/precomp')
W4, H4 = 3840, 2160
INK = '0x0e0e0e'
PAPER = '0xf2f0eb'


def labels_png(job_name, W, H, items):
    """Render label PNGs with grid_labels.html via captions.mjs (one Chromium job, software GL, DPR 1)."""
    jp = os.path.join(OUT_DIR, f'{job_name}_labels_job.json')
    json.dump(dict(W=W, H=H, template=os.path.join(HERE, 'grid_labels.html'), items=items), open(jp, 'w'))
    subprocess.run([SAFE, '--heavy', '--', 'node', os.path.join(HERE, 'captions.mjs'), jp], check=True, capture_output=True)


# ───────────────────────── sc_grid16 ─────────────────────────
GRID_N = 300
GAP = 12
TH = (H4 - 5 * GAP) // 4                 # 525
TW = round(TH * 16 / 9)                  # 933
X0 = (W4 - (4 * TW + 3 * GAP)) // 2      # centred horizontally
Y0 = GAP


def grid_tiles():
    tiles = []
    for k, lv in enumerate(LEVELS):
        ev = 54 + 12 * k                                  # grid frame of this tile's solve
        src, kind = P.resolve(f'sc_lv_{lv}')
        if kind == 'placeholder':                         # no solve capture: the meta-beat capture IS that level
            src = {'1-3': 'videos/capture/sc_clone_glitch.mkv', '4-2': 'videos/capture/sc_lights_out_ear.mkv'}[lv]
            solve = P.find_event(src, 'glitch' if lv == '1-3' else 'chord')
            stop = 2436 if lv == '4-2' else None          # 4-2: end before the idle "the end. zzz" bubble (src 2440)
            what = 'clone glitch' if lv == '1-3' else 'syndrome chord in the dark'
        else:
            solve = P.find_event(src, 'win-card')
            stop, what = None, 'win card'
        n_src = E.probe(src)[2]
        t_in = solve - ev                                 # may be < 0: the head is padded with the first frame
        t_end = min(n_src, stop or n_src, t_in + GRID_N)
        x = X0 + (k % 4) * (TW + GAP)
        y = Y0 + (k // 4) * (TH + GAP)
        tiles.append(dict(level=lv, src=src, solve_src=solve, solve_grid=ev, t_in=t_in, t_end=t_end, what=what, x=x, y=y))
    return tiles


def grid16(dry=False):
    out = os.path.join(OUT_DIR, 'sc_grid16.mkv')
    os.makedirs(OUT_DIR, exist_ok=True)
    tiles = grid_tiles()
    lab = os.path.join(OUT_DIR, 'sc_grid16_labels.png')
    chk = os.path.join(OUT_DIR, 'check_badge.png')
    ins, fc = [], []
    for k, t in enumerate(tiles):
        a = max(0, t['t_in'])
        head = max(0, -t['t_in'])                         # frames to pad before the source starts
        n = t['t_end'] - a
        ins += ['-ss', f'{(a - 0.5) / 60:.6f}' if a > 0 else '0', '-i', E.rel(t['src'])]
        tail = GRID_N - head - n
        fc.append(f'[{k}:v]trim=end_frame={n},setpts=N/60/TB,'
                  + (f'tpad=start={head}:start_mode=clone,' if head else '')
                  + (f'tpad=stop={tail}:stop_mode=clone,' if tail > 0 else '')
                  + f'trim=end_frame={GRID_N},scale={TW}:{TH}:flags=lanczos,format=rgba[t{k}]')
    n_in = len(tiles)
    ins += ['-loop', '1', '-framerate', '60', '-t', f'{GRID_N / 60}', '-i', lab,
            '-loop', '1', '-framerate', '60', '-t', f'{GRID_N / 60}', '-i', chk]
    fc.append(f'color=c={PAPER}:s={W4}x{H4}:r=60:d={GRID_N / 60},format=rgba[bg0]')
    cur = 'bg0'
    for k, t in enumerate(tiles):  # ink keyline under each tile, then the tile
        fc.append(f'[{cur}]drawbox=x={t["x"] - 4}:y={t["y"] - 4}:w={TW + 8}:h={TH + 8}:color={INK}:t=fill[k{k}];'
                  f'[k{k}][t{k}]overlay=x={t["x"]}:y={t["y"]}[g{k}]')
        cur = f'g{k}'
    fc.append(f'[{n_in}:v]format=rgba[lab];[{cur}][lab]overlay=0:0[gl]')
    cur = 'gl'
    fc.append(f'[{n_in + 1}:v]format=rgba,split={len(tiles)}' + ''.join(f'[c{k}]' for k in range(len(tiles))))
    for k, t in enumerate(tiles):
        f0 = t['solve_grid'] + 8
        fc.append(f'[c{k}]fade=t=in:st={f0 / 60:.4f}:d={6 / 60:.4f}:alpha=1[cf{k}];'
                  f'[{cur}][cf{k}]overlay=x={t["x"] + TW - 168}:y={t["y"] + 8}:enable=\'gte(n,{f0})\'[h{k}]')
        cur = f'h{k}'
    fc.append(f'[{cur}]format=bgr0[v]')
    cmd = ['ffmpeg', '-v', 'error', '-y', '-threads', '4', '-filter_complex_threads', '4', *ins, '-filter_complex', ';'.join(fc),
           '-map', '[v]', '-frames:v', str(GRID_N), '-r', '60', '-c:v', 'ffv1', '-level', '3', '-g', '1', '-slices', '16',
           '-pix_fmt', 'bgr0', out + '.tmp.mkv']
    meta = {'name': 'sc_grid16', 'version': 2, 'fps': 60, 'frames': GRID_N, 'size': [W4, H4], 'tile': [TW, TH], 'tiles': tiles,
            'marks': [{'name': f'solved-{t["level"]}', 'frame': t['solve_grid']} for t in tiles] + [{'name': 'all-solved', 'frame': 234}],
            'clean': True}
    if dry:
        print(json.dumps({k: v for k, v in meta.items() if k != 'tiles'}, indent=1))
        for t in tiles:
            print(f'  {t["level"]}: {t["src"][15:]:32s} in {t["t_in"]:5d}  solve src {t["solve_src"]:5d} -> grid f{t["solve_grid"]}  ({t["what"]})')
        return
    items = [dict(id='labels', text=json.dumps({'tiles': [[t['level'], t['x'], t['y'], TW, TH] for t in tiles]}), style='grid_labels',
                  position='grid', out=lab)]
    labels_png('sc_grid16', W4, H4, items)
    labels_png('check', 160, 160, [dict(id='check', text='', style='check', position='grid', out=chk)])
    subprocess.run([SAFE, '--heavy', '--', *cmd], check=True)
    os.replace(out + '.tmp.mkv', out)
    json.dump(meta, open(out.replace('.mkv', '.meta.json'), 'w'), indent=1)
    print(out)


# ───────────────────────── sc_qol4 ─────────────────────────
QOL_N = 600
QG = 16
QW, QH = (W4 - 3 * QG) // 2, (H4 - 3 * QG) // 2      # 1896 x 1056
QOL = [  # (quadrant, shot, src in, src out, centre x, centre y, zoom, what)
    ('TL', 'pg_snippets_doodle', 174, 774, 0.62, 0.60, 1.6, 'save a snippet -> the snippet library -> a doodle comment (VERIFY crop)'),
    ('TR', 'pg_win_links', 0, 600, 0.5, 0.5, 1.6, "the win card's 'Pros call this…' links to Qiskit / IBM Quantum Learning (CAPTURE GAP; step mode is now its own beat)"),
    ('BL', 'sc_qol_grid', 300, 900, 0.47, 0.30, 1.8, 'the help slot on a card (VERIFY crop; 1080p source, still >= 1:1 at delivery)'),
    ('BR', 'pg_export_qiskit', 40, 640, 0.25, 0.40, 1.6, 'Text view -> Export to Qiskit -> the code (trailer framing)'),
]


def qol4(dry=False):
    out = os.path.join(OUT_DIR, 'sc_qol4.mkv')
    os.makedirs(OUT_DIR, exist_ok=True)
    ins, fc, plan = [], [], []
    for k, (q, sid, a, b, cx, cy, z, what) in enumerate(QOL):
        src, kind = P.resolve(sid)
        sw, sh, _, _ = E.probe(src)
        cw, ch = sw / z, sw / z * QH / QW                 # crop at the quadrant's aspect
        x = min(max(0, cx * sw - cw / 2), sw - cw)
        y = min(max(0, cy * sh - ch / 2), sh - ch)
        sp = (b - a) / QOL_N
        deliv = QW / W4 * 1689.6                           # the quadrant's width in the delivered 88% game area
        plan.append(dict(q=q, shot=sid, src=src, a=a, b=b, speed=round(sp, 3), crop=[round(x), round(y), round(cw), round(ch)],
                         px_per_delivered_px=round(cw / deliv, 2), what=what))
        ins += ['-ss', f'{(a - 0.5) / 60:.6f}', '-i', E.rel(src)]
        fc.append(f'[{k}:v]trim=end_frame={b - a},setpts=(N/60/TB)/{sp:.5f},fps=60,trim=end_frame={QOL_N},'
                  f'crop={round(cw)}:{round(ch)}:{round(x)}:{round(y)},scale={QW}:{QH}:flags=lanczos[q{k}]')
    pos = {'TL': (QG, QG), 'TR': (2 * QG + QW, QG), 'BL': (QG, 2 * QG + QH), 'BR': (2 * QG + QW, 2 * QG + QH)}
    fc.append(f'color=c={INK}:s={W4}x{H4}:r=60:d={QOL_N / 60}[b0]')
    cur = 'b0'
    for k, p in enumerate(plan):
        x, y = pos[p['q']]
        fc.append(f'[{cur}][q{k}]overlay=x={x}:y={y}[o{k}]')
        cur = f'o{k}'
    fc.append(f'[{cur}]format=bgr0[v]')
    cmd = ['ffmpeg', '-v', 'error', '-y', '-threads', '4', '-filter_complex_threads', '4', *ins, '-filter_complex', ';'.join(fc),
           '-map', '[v]', '-frames:v', str(QOL_N), '-r', '60', '-c:v', 'ffv1', '-level', '3', '-g', '1', '-slices', '16',
           '-pix_fmt', 'bgr0', out + '.tmp.mkv']
    meta = {'name': 'sc_qol4', 'fps': 60, 'frames': QOL_N, 'size': [W4, H4], 'quadrants': plan, 'marks': [], 'clean': True}
    if dry:
        print(json.dumps(meta, indent=1))
        return
    subprocess.run([SAFE, '--heavy', '--', *cmd], check=True)
    os.replace(out + '.tmp.mkv', out)
    json.dump(meta, open(out.replace('.mkv', '.meta.json'), 'w'), indent=1)
    print(out)


if __name__ == '__main__':
    {'sc_grid16': grid16, 'sc_qol4': qol4}[sys.argv[1]](dry='--dry-run' in sys.argv)
