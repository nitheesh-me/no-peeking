#!/usr/bin/env python3
"""NO PEEKING! assembler: EDL -> graded, captioned, encoded deliverables.

usage: render.py tools/video/edl/trailer.edl.json [--force] [--ignore-invalid] [--only-segments]

Resource rules (docs/VIDEO_RESOURCES.md) are built in: every 4K/1440p step is
its own `tools/video/safe-run.sh --mem 6G` job (reserve-and-wait in the shared
pool) of <= 600 frames, through the 3-slot --heavy queue (JOBS=1 of mine at a time), ffmpeg runs with -threads 6, frames
are streamed through pipes and never buffered, intermediates live on disk in
videos/final/work/.

Stage A (per clip, per <=600-frame chunk, cached): decode the lossless 4K
  source, apply the exact speed frame map, the camera (sub-pixel crop + resize
  in ONE lanczos pass via PIL box-resize: ffmpeg's crop/zoompan quantise the
  crop to whole source pixels and judder on slow push-ins), place it (cinema:
  full frame; strip: game at 88% top over a blurred extension), grade with the
  show LUT in 16-bit (gbrp16le + lut3d tetrahedral) -> FFV1 16-bit chunks.
Stage B/C (per <=600-frame timeline chunk; chunk edges never split a
  transition): trim the segments, transitions with maskedmerge (Motion
  Designer mattes or procedural placeholders), concat, then in yuv444p10:
  flashes, Motion overlays, the caption strip, captions (PNG from the HTML
  template, alpha fades); per output: lanczos scale, grain/dither (stronger
  on night shots), dithered 10->8-bit yuv420p, x264 High CRF 15.
Final (light): stream-copy concat of the chunks + AAC 320k 48 kHz from the
  Sound Designer's mix, +faststart. Also a 1080p pre-grain QA proxy.
"""
import argparse
import hashlib
import shlex
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
import edl as E  # noqa: E402
import validate as V  # noqa: E402

FPS = 60
CRF = 15
CHUNK = 600
THREADS = '6'
# ONE ffv1 configuration for every intermediate: the concat demuxer decodes all pieces with the first file's config
FFV1 = ['-c:v', 'ffv1', '-level', '3', '-slices', '16', '-g', '1', '-pix_fmt', 'gbrp10le']
JOBS = 1  # my concurrent heavy jobs: the wrapper has 3 slots machine-wide, shared with every agent
SAFE = os.path.join(E.ROOT, 'tools/video/safe-run.sh')
GRAIN = {'night': 6, 'day': 3, 'none': 2}  # noise c0s: ~1.9 / 1.0 / 0.6 LSB std (8-bit) temporal grain = dither
LUTS = os.path.join(HERE, 'luts')
TEMPLATE_CANDIDATES = ['videos/motion/caption_template.html', 'tools/video/motion/caption_template.html',
                       'tools/video/motion/captions.html']
X264 = ['-c:v', 'libx264', '-threads', THREADS, '-profile:v', 'high', '-preset', 'slow', '-crf', str(CRF), '-pix_fmt', 'yuv420p',
        '-x264-params', 'aq-mode=3:aq-strength=0.9:deblock=-1,-1:psy-rd=1.0,0.15', '-g', '120', '-bf', '3',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']


def work_dir(e):
    d = E.rel(f'videos/final/work/{e.get("work_name", e["video"])}')
    os.makedirs(d, exist_ok=True)
    return d


def h(obj):
    return hashlib.sha1(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()[:12]


def safe(cmd, mem='6G', heavy=True):
    """Run inside the shared npvideo.slice pool (docs/VIDEO_RESOURCES.md). --heavy takes one of the 3 machine-wide
    render slots (queued by the wrapper); --mem reserves memory and WAITS for it."""
    full = [SAFE] + (['--heavy'] if heavy else []) + (['--mem', mem] if mem else []) + ['--'] + list(map(str, cmd))
    r = subprocess.run(full, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write(' '.join(map(str, cmd))[:2000] + '\n' + r.stderr[-4000:])
        raise SystemExit(f'command failed ({r.returncode}){" (killed: memory)" if r.returncode == 137 else ""}')
    return r


def parallel(fn, items, jobs=None):
    """Run fn over items JOBS at a time (each fn call is one safe-run job); re-raise the first failure."""
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(jobs or JOBS) as ex:
        return list(ex.map(fn, items))


# ───────────────────────── Stage A: segments ─────────────────────────
def seg_key(e, c):
    src = c['src']
    st = None
    if not src.startswith('@'):
        p = E.rel(src)
        st = [os.path.getmtime(p), os.path.getsize(p) if os.path.isfile(p) else 0]
    keep = {k: c[k] for k in ('src', 'in', 'dur', 'speed', 'camera', 'grade', 'shot')}
    return h([keep, st, e['work'], e['layout'], 'A5'])


def render_chunk(edl_path, cid, i0, i1, out):
    """Worker (runs inside a safe-run scope): local frames [i0, i1) of clip cid -> out (FFV1 16-bit)."""
    from PIL import Image, ImageFilter
    import numpy as np
    e = E.load(edl_path)
    c = next(x for x in e['clips'] if x['id'] == cid)
    W, H = e['work']
    ax, ay, aw, ah = E.game_area(e)
    m = c['_map'][i0:i1]
    src = c['src']
    lut = os.path.join(LUTS, f'{c.get("grade", "none")}.cube')
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-threads', THREADS, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                            '-r', str(FPS), '-i', '-', '-filter_threads', THREADS,
                            '-vf', f'format=gbrp16le,lut3d=file={lut}:interp=tetrahedral', '-threads', THREADS,
                            *FFV1, out + '.tmp.mkv'],
                           stdin=subprocess.PIPE)
    try:
        if src.startswith('@'):
            col = (0, 0, 0)
            if src.startswith('@color:'):
                hx = src.split(':', 1)[1].lstrip('#')
                col = tuple(int(hx[i:i + 2], 16) for i in (0, 2, 4))
            fr = np.zeros((H, W, 3), np.uint8)
            fr[:] = col
            b = fr.tobytes()
            for _ in m:
                enc.stdin.write(b)
        else:
            sw, sh, n, _ = E.probe(src)
            first, last = m[0], m[-1]
            p = E.rel(src)
            if os.path.isdir(p):
                pat, s0 = E.seq_pattern(src)
                inp = ['-framerate', str(FPS), '-start_number', str(s0 + first), '-i', pat]
            else:
                inp = (['-ss', f'{(first - 0.5) / FPS:.6f}'] if first > 0 else []) + ['-i', p]
            dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-threads', THREADS, *inp, '-frames:v', str(last - first + 1),
                                    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
            fsz = sw * sh * 3
            cur, buf = first - 1, None
            last_key, last_out = None, None
            for k, s in enumerate(m):
                while cur < s:
                    buf = dec.stdout.read(fsz)
                    if len(buf) < fsz:
                        raise RuntimeError(f'{cid}: source {src} ended at frame {cur + 1} (needed {s})')
                    cur += 1
                z, cx, cy = E.camera_at(c['camera'], i0 + k)
                box = E.view_box(sw, sh, aw, ah, z, cx, cy)
                key = (s, tuple(round(v, 4) for v in box))
                if key != last_key:
                    im = Image.frombuffer('RGB', (sw, sh), buf, 'raw', 'RGB', 0, 1)
                    g = im.resize((aw, ah), Image.LANCZOS, box=box)
                    if (aw, ah) != (W, H):
                        bg = g.resize((max(1, W // 24), max(1, H // 24)), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))
                        bg = bg.resize((W, H), Image.BILINEAR)
                        bg = Image.fromarray((np.asarray(bg, np.float32) * 0.42).astype(np.uint8))
                        bg.paste(g, (ax, ay))
                        g = bg
                    last_out = g.tobytes()
                    last_key = key
                enc.stdin.write(last_out)
            dec.stdout.close()
            dec.kill()
            dec.wait()
        enc.stdin.close()
        if enc.wait():
            raise RuntimeError(f'{cid}: encoder failed')
        os.replace(out + '.tmp.mkv', out)
    except BaseException:
        enc.kill()
        raise


def stage_a(e, edl_path, force):
    """-> {clip_id: [(chunk file, local i0, local i1), ...]} (chunked FFV1 segments). Pending chunks are packed into heavy jobs of
    <= CHUNK frames in total (short trailer shots share one job, so the shared lock is taken fewer times)."""
    wd = work_dir(e)
    sd = os.path.join(wd, 'seg')
    os.makedirs(sd, exist_ok=True)
    lists, tasks = {}, []
    for c in e['clips']:
        key = seg_key(e, c)
        files = []
        for i0 in range(0, c['dur'], CHUNK):
            i1 = min(c['dur'], i0 + CHUNK)
            p = os.path.join(sd, f'{c["id"]}_{key}_{i0:05d}.mkv')
            files.append(p)
            if force or not os.path.exists(p):
                tasks.append([c['id'], i0, i1, p])
        lists[c['id']] = [(p, i0, min(c['dur'], i0 + CHUNK)) for p, i0 in zip(files, range(0, c['dur'], CHUNK))]
    batches, cur, n = [], [], 0
    for t in tasks:
        if cur and n + (t[2] - t[1]) > CHUNK:
            batches.append(cur)
            cur, n = [], 0
        cur.append(t)
        n += t[2] - t[1]
    if cur:
        batches.append(cur)
    t0 = time.time()

    def run_batch(kb):
        k, bt = kb
        jp = os.path.join(sd, f'batch_{k:03d}.json')
        json.dump({'edl': edl_path, 'tasks': bt}, open(jp, 'w'))
        safe([sys.executable, os.path.abspath(__file__), '--chunks', jp])
        print(f'  A batch {k + 1}/{len(batches)}: ' + ', '.join(f'{t[0]}[{t[1]},{t[2]})' for t in bt) + f'  ({time.time() - t0:.0f}s)', flush=True)
    parallel(run_batch, list(enumerate(batches)))
    print(f'stage A: {len(tasks)} chunk(s) in {len(batches)} job(s), {time.time() - t0:.0f}s', flush=True)
    return lists


# ───────────────────────── captions ─────────────────────────
def template_path():
    for t in TEMPLATE_CANDIDATES:
        if os.path.exists(E.rel(t)):
            return E.rel(t), t
    return os.path.join(HERE, 'caption_template.html'), 'tools/video/assemble/caption_template.html (fallback)'


def render_captions(e):
    wd = work_dir(e)
    W, H = e['work']
    tpl, tname = template_path()
    items, out = [], {}
    tkey = h([open(tpl).read(), W, H])
    for c in e['captions']:
        if isinstance(c.get('render'), dict):
            continue  # pre-rendered Motion Designer card (overlay with alpha)
        k = h([c['text'], c.get('style'), c['position'], tkey])
        png, mask = os.path.join(wd, 'cap', f'{k}.png'), os.path.join(wd, 'cap', f'{k}_mask.png')
        out[c['id']] = {'png': png, 'mask': mask}
        if not os.path.exists(png):
            items.append(dict(id=c['id'], text=c['text'], style=c.get('style', 'night'), position=c['position'], out=png, mask=mask))
    strip = os.path.join(wd, 'cap', f'strip_{tkey}.png') if e['layout'] == 'strip' else None
    job = dict(W=W, H=H, template=tpl, items=items)
    if strip and not os.path.exists(strip):
        job['strip'] = {'out': strip}
    meta_p = os.path.join(wd, 'cap', 'meta.json')
    meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
    if items or job.get('strip'):
        os.makedirs(os.path.join(wd, 'cap'), exist_ok=True)
        jp = os.path.join(wd, 'cap', 'job.json')
        json.dump(job, open(jp, 'w'))
        r = safe(['node', os.path.join(HERE, 'captions.mjs'), jp])
        info = json.loads(r.stdout or '{}')
        for it in items:
            meta[os.path.basename(it['out'])] = info.get(it['id'], {})
        json.dump(meta, open(meta_p, 'w'), indent=1)
    for cid, d in out.items():
        d.update(meta.get(os.path.basename(d['png']), {}))
    return out, strip, tname


# ───────────────────────── transitions (procedural placeholders) ─────────────────────────
def proc_matte(t, n, W, H):
    """lavfi source for a white=incoming matte of n frames when no Motion matte exists."""
    if t == 'blanket-wipe':  # curved soft leading edge, in-out cubic, left -> right
        u = f'(N/{n - 1})'
        pos = f"(-0.15+1.3*if(lt({u},0.5),4*pow({u},3),1-pow(-2*{u}+2,3)/2))"
        expr = f"255*clip(({pos}*W-X+0.06*W*sin(Y/H*3.14159))/(0.04*W),0,1)"
    elif t == 'shatter':  # shards (cells) drop out to the incoming (black) clip
        expr = (f"255*gt(N/{n}*1.15,mod(abs(sin(floor(X/(W/9))*12.9898+floor(Y/(H/5))*78.233)*43758.5453),1)"
                f"+0.08*sin(X/W*20+Y/H*13))")
    else:  # glitch: horizontal tear bands switching to B
        expr = f"255*gt(N/{n}*1.2,mod(abs(sin(floor(Y/(H/27))*91.7+N*0.37)*43758.5453),1))"
    return f"nullsrc=s={W}x{H}:r={FPS}:d={n / FPS + 1},format=gray,geq=lum='{expr}',trim=end_frame={n},format=gbrp16le"


def tr_frames(c):
    return c['transition']['frames'] if E.TRANSITIONS[c['transition']['type']][0] else 0


def chunk_bounds(e):
    """Timeline chunks of <= CHUNK frames whose edges never fall inside a transition."""
    busy = [(c['start'], c['start'] + tr_frames(c)) for c in e['clips'] if tr_frames(c)]
    D = e['duration']
    out, a = [], 0
    while a < D:
        b = min(D, a + CHUNK)
        for s, t in busy:
            if s < b < t:
                b = s if s > a else t
        out.append((a, b))
        a = b
    return out


def piece_entries(chunks, x, y):
    """concat-demuxer entries covering clip-local frames [x, y) of a chunked segment (intra-only FFV1:
    inpoint/outpoint are frame-exact; half-frame offsets avoid float edge cases)."""
    out = []
    for p, i0, i1 in chunks:
        s_, t_ = max(x, i0), min(y, i1)
        if t_ > s_:
            e_ = f"file '{p}'\n"
            if s_ > i0:
                e_ += f'inpoint {(s_ - i0 - 0.5) / FPS:.6f}\n'
            if t_ < i1:
                e_ += f'outpoint {(t_ - i0 - 0.5) / FPS:.6f}\n'
            out.append(e_)
    return out


def write_list(path, entries):
    with open(path, 'w') as f:
        f.write('ffconcat version 1.0\n' + ''.join(entries))
    return path


def stage_t(e, segs, force):
    """Pre-render every overlapping transition (<= 20 frames each) into its own small FFV1 file:
    maskedmerge(A tail, B head, matte) [+ glitch RGB tear] [+ Motion overlay]. One heavy job for all."""
    W, H = e['work']
    td = os.path.join(work_dir(e), 'trans')
    os.makedirs(td, exist_ok=True)
    out, jobs = {}, []
    clips = e['clips']
    for i, c in enumerate(clips):
        k = tr_frames(c)
        if not k:
            continue
        prev = clips[i - 1]
        tr = c['transition']
        key = h([tr, prev['id'], c['id'], [x[0] for x in segs[prev['id']]], [x[0] for x in segs[c['id']]], W, H, 'T3'])
        dst = os.path.join(td, f'{c["id"]}_{key}.mkv')
        out[c['id']] = dst
        if os.path.exists(dst) and not force:
            continue
        la = write_list(dst + '.a.txt', piece_entries(segs[prev['id']], prev['dur'] - k, prev['dur']))
        lb = write_list(dst + '.b.txt', piece_entries(segs[c['id']], 0, k))
        ins = ['-f', 'concat', '-safe', '0', '-i', la, '-f', 'concat', '-safe', '0', '-i', lb]
        fc = [f'[0:v]trim=end_frame={k},setpts=N/{FPS}/TB,format=gbrp16le[a]', f'[1:v]trim=end_frame={k},setpts=N/{FPS}/TB,format=gbrp16le[b]']
        if tr.get('matte'):
            ins += ['-i', E.rel(tr['matte'])]
            fc.append(f'[2:v]scale={W}:{H}:flags=bicubic,format=gray,trim=end_frame={k},setpts=N/{FPS}/TB,format=gbrp16le[m]')
        else:
            fc.append(f'{proc_matte(tr["type"], k, W, H)},setpts=N/{FPS}/TB[m]')
        fc.append(f'[a][b][m]maskedmerge,trim=end_frame={k},setpts=N/{FPS}/TB[x]')
        last = 'x'
        if tr['type'] == 'glitch':
            fc.append(f'[x]format=gbrp,rgbashift=rh=-{W // 90}:bh={W // 90}:gv={H // 200},format=gbrp16le[xg]')
            last = 'xg'
        if tr.get('overlay'):
            oi = sum(1 for z in ins if z == '-i')
            ins += ['-i', E.rel(tr['overlay'])]
            fc.append(f'[{last}]format=yuv444p10le[xb];[{oi}:v]scale={W}:{H},scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le,trim=end_frame={k},setpts=N/{FPS}/TB[xo];'
                      f'[xb][xo]overlay=format=yuv444p10:eof_action=pass,format=gbrp16le[xx]')
            last = 'xx'
        fc.append(f'[{last}]format=gbrp10le[out]')
        jobs.append(['ffmpeg', '-v', 'error', '-y', '-threads', THREADS, *ins, '-filter_complex', ';'.join(fc), '-map', '[out]',
                     '-frames:v', str(k), *FFV1, dst + '.tmp.mkv'])
    if jobs:
        sh = os.path.join(td, 'jobs.sh')
        with open(sh, 'w') as f:
            f.write('set -e\n' + ''.join(' '.join(shlex.quote(str(x)) for x in j) + '\n' for j in jobs))
        safe(['bash', sh])
        for d in out.values():
            if os.path.exists(d + '.tmp.mkv'):
                os.replace(d + '.tmp.mkv', d)
        print(f'  transitions: {len(jobs)} rendered', flush=True)
    return out


# ───────────────────────── Stage B + C: one timeline chunk ─────────────────────────
def build_chunk_graph(e, segs, caps, strip, outputs, proxy, a, b, trans=None, list_dir=None):
    W, H = e['work']
    n = b - a
    inputs, fc = [], []

    def add_input(args):
        inputs.extend(args)
        return sum(1 for x in inputs if x == '-i') - 1

    clips = e['clips']
    entries = []  # the base timeline of this chunk as ONE sequential concat input (one decoder at a time)
    for i, c in enumerate(clips):
        cs, ce = c['start'], c['start'] + c['dur']
        if ce <= a or cs >= b:
            continue
        tin = tr_frames(c)
        nxt = clips[i + 1] if i + 1 < len(clips) else None
        tout = tr_frames(nxt) if nxt else 0
        if tin and a <= cs < b:
            entries.append(f"file '{trans[c['id']]}'\n")
        bs, be = max(a, cs + tin), min(b, ce - tout)
        if be > bs:
            entries += piece_entries(segs[c['id']], bs - cs, be - cs)
    lp = write_list(os.path.join(list_dir or work_dir(e), f'base_{a:06d}.txt'), entries)
    bi = add_input(['-f', 'concat', '-safe', '0', '-i', lp])
    fc.append(f'[{bi}:v]trim=end_frame={n},setpts=N/{FPS}/TB,format=gbrp16le,'
              f'scale=out_color_matrix=bt709:out_range=tv,format=yuv444p10le[base]')
    cur = 'base'
    k = 0

    def over(src_label):
        nonlocal cur, k
        k += 1
        fc.append(f'[{cur}][{src_label}]overlay=format=yuv444p10:eof_action=pass[o{k}]')
        cur = f'o{k}'

    def place(s, e_, chain_in, label):
        """time-shift a stream that covers timeline [s, e_) into the chunk."""
        if s >= a:  # pad the front with transparent frames: every overlay stream starts at chunk frame 0
            pad = f',tpad=start={s - a}:color=black@0' if s > a else ''
            fc.append(f'{chain_in},setpts=PTS-STARTPTS{pad},setpts=N/{FPS}/TB[{label}]')
        else:
            fc.append(f'{chain_in},trim=start_frame={a - s},setpts=N/{FPS}/TB[{label}]')

    for j, fx in enumerate(e['fx']):
        if fx['type'] == 'flash' and fx['start'] < b and fx['start'] + fx['dur'] > a:
            place(fx['start'], fx['start'] + fx['dur'],
                  f'color=c={fx.get("color", "#ffffff").replace("#", "0x")}:s={W}x{H}:r={FPS}:d={fx["dur"] / FPS},scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le', f'fx{j}')
            over(f'fx{j}')
    def alpha_src(spec, start, n_frames, label, src_in=0):
        """RGBA stream for timeline [start, start+n_frames): {fill, matte} pair (Motion Designer) or one RGBA file;
        `hold` pads with the last frame (cards whose text must stay up longer than the clip)."""
        if spec.get('fill'):
            fi = add_input(['-i', E.rel(spec['fill'])])
            mi = add_input(['-i', E.rel(spec['matte'])])
            fc.append(f'[{fi}:v]format=gbrp[{label}f];[{mi}:v]format=gray,scale=in_range=pc:out_range=pc[{label}m];'
                      f'[{label}f][{label}m]alphamerge[{label}a]')
            src = f'[{label}a]'
        else:
            oi = add_input(['-i', E.rel(spec['src'])])
            src = f'[{oi}:v]'
        avail = spec.get('frames', n_frames) - src_in
        pad = max(0, n_frames - avail)
        chain = (f'{src}trim=start_frame={src_in}:end_frame={src_in + min(avail, n_frames)},setpts=N/{FPS}/TB,scale={W}:{H},scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le'
                 + (f',tpad=stop_mode=clone:stop={pad}' if pad else ''))
        place(start, start + n_frames, chain, label)

    for j, o in enumerate(e['overlays']):
        if o['start'] < b and o['start'] + o['dur'] > a:
            alpha_src(o, o['start'], o['dur'], f'ov{j}', o.get('in', 0))
            over(f'ov{j}')
    if strip:
        si = add_input(['-thread_queue_size', '4', '-loop', '1', '-framerate', str(FPS), '-t', f'{n / FPS:.4f}', '-i', strip])
        fc.append(f'[{si}:v]scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le[strip]')
        over('strip')
    for c in e['captions']:
        if not (c['start'] < b and c['end'] > a):
            continue
        if isinstance(c.get('render'), dict) and c['render'].get('baked'):
            continue
        if isinstance(c.get('render'), dict):
            if c['render'].get('baked'):
                continue  # the text is part of a clip's picture (Motion card); listed for the gates only
            alpha_src(c['render'], c['start'], c['end'] - c['start'], f'c_{c["id"]}', c['render'].get('in', 0))
        else:
            dur = (c['end'] - c['start']) / FPS
            fin = (c['legible_from'] - c['start']) / FPS
            fout = min(8, c['end'] - c['legible_from'] - 1) / FPS
            ci = add_input(['-thread_queue_size', '4', '-loop', '1', '-framerate', str(FPS), '-t', f'{dur:.4f}', '-i', caps[c['id']]['png']])
            place(c['start'], c['end'], f'[{ci}:v]scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le,fade=t=in:st=0:d={fin:.4f}:alpha=1,'
                  f'fade=t=out:st={dur - fout:.4f}:d={fout:.4f}:alpha=1', f'c_{c["id"]}')
        over(f'c_{c["id"]}')
    nout = len(outputs) + (1 if proxy else 0)
    fc.append(f'[{cur}]trim=end_frame={n},split={nout}' + ''.join(f'[out{j}]' for j in range(nout)))
    ranges = {}
    for c in clips:
        s, t = max(a, c['start']), min(b, c['start'] + c['dur'])
        if t > s:
            ranges.setdefault(c.get('grade', 'none'), []).append((s - a, t - a - 1))
    en = lambda rs: '+'.join(f'between(n,{x},{y})' for x, y in rs)
    maps = []
    for j, o in enumerate(outputs):
        ow, oh = o['size']
        chain = f'[out{j}]' + (f'scale={ow}:{oh}:flags=lanczos+accurate_rnd+full_chroma_int,' if [ow, oh] != [W, H] else '')
        for g, rs in ranges.items():
            s1 = max(1, GRAIN.get(g, 2) // 3)
            chain += f"noise=c0s={GRAIN.get(g, 2)}:c0f=t+u:c1s={s1}:c1f=t+u:c2s={s1}:c2f=t+u:enable='{en(rs)}',"
        chain += f'scale=sws_dither=ed,format=yuv420p[enc{j}]'
        fc.append(chain)
        maps.append(f'enc{j}')
    if proxy:
        fc.append(f'[out{len(outputs)}]scale=1920:1080:flags=lanczos,format=yuv420p[encp]')
        maps.append('encp')
    return inputs, ';\n'.join(fc), maps


def stage_bc(e, segs, caps, strip, force, proxy=True, trans=None):
    wd = work_dir(e)
    cd = os.path.join(wd, 'chunks')
    os.makedirs(cd, exist_ok=True)
    outs = e['outputs']
    files = {o['name']: [] for o in outs}
    files['proxy'] = []
    t0 = time.time()
    todo = []
    for a, b in chunk_bounds(e):
        inputs, graph, maps = build_chunk_graph(e, segs, caps, strip, outs, proxy, a, b, trans, cd)
        key = h([graph, open(os.path.join(cd, f'base_{a:06d}.txt')).read(), CRF, X264])
        names = [o['name'] for o in outs] + (['proxy'] if proxy else [])
        paths = {nm: os.path.join(cd, f'{nm}_{a:06d}_{key}.mp4') for nm in names}
        for nm in names:
            files[nm].append(paths[nm])
        if force or not all(os.path.exists(p) for p in paths.values()):
            todo.append((a, b, inputs, graph, maps, paths))

    def run_chunk(t):
        a, b, inputs, graph, maps, paths = t
        gp = os.path.join(cd, f'graph_{a:06d}.txt')
        open(gp, 'w').write(graph)
        cmd = ['ffmpeg', '-v', 'error', '-y', '-threads', THREADS, '-filter_complex_threads', THREADS, *inputs, '-filter_complex_script', gp]
        for j, o in enumerate(outs):
            cmd += ['-map', f'[{maps[j]}]', *X264, '-r', str(FPS), '-frames:v', str(b - a), paths[o['name']] + '.tmp.mp4']
        if proxy:
            cmd += ['-map', f'[{maps[-1]}]', '-c:v', 'libx264', '-threads', THREADS, '-preset', 'veryfast', '-crf', '10', '-r', str(FPS),
                    '-frames:v', str(b - a), paths['proxy'] + '.tmp.mp4']
        safe(cmd)
        for p in paths.values():
            os.replace(p + '.tmp.mp4', p)
        print(f'  B/C chunk [{a},{b})  ({time.time() - t0:.0f}s)', flush=True)
    parallel(run_chunk, todo)
    return files


def concat_mux(chunks, audio, out, frames):
    lp = out + '.list.txt'
    with open(lp, 'w') as f:
        f.write(''.join(f"file '{os.path.abspath(c)}'\n" for c in chunks))
    cmd = ['ffmpeg', '-v', 'error', '-y', '-threads', THREADS, '-f', 'concat', '-safe', '0', '-i', lp]
    if audio:
        cmd += ['-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2']
    cmd += ['-c:v', 'copy', '-frames:v', str(frames), '-shortest', '-movflags', '+faststart', out + '.tmp.mp4']
    safe(cmd, mem=None, heavy=False)
    os.replace(out + '.tmp.mp4', out)
    os.remove(lp)


def placeholder_mix(e, path):
    """Until the Sound Designer's mix exists: a quiet tone bed with a click on every
    visible timeline event (lets the A/V and loudness gates run). Clearly flagged."""
    import numpy as np
    import wave
    sr = 48000
    n = int(e['duration'] / FPS * sr)
    t = np.arange(n) / sr
    a = 0.02 * np.sin(2 * np.pi * 110 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.5 * t))
    cues = []
    for ev in E.resolved(e)['timeline_events']:
        if not ev['visible']:
            continue
        s = int(ev['frame'] / FPS * sr)
        L = int(0.12 * sr)
        if s + L >= n:
            continue
        a[s:s + L] += 0.5 * np.exp(-np.arange(L) / (0.03 * sr)) * np.sin(2 * np.pi * 1200 * np.arange(L) / sr)
        cues.append({'name': ev['name'], 'frame': ev['frame'], 'clip': ev['clip'], 'src_frame': ev['src_frame'], 'featured': True})
    raw = path + '.raw.wav'
    with wave.open(raw, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(np.stack([a, a], 1), -1, 1) * 32767).astype('<i2').tobytes())
    safe(['ffmpeg', '-v', 'error', '-y', '-threads', THREADS, '-i', raw, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', path], mem=None, heavy=False)
    os.remove(raw)
    json.dump({'placeholder': True, 'cues': sorted(cues, key=lambda c: c['frame'])}, open(path.replace('.wav', '_report.json'), 'w'), indent=1)


def find_mix(e, edl_path):
    mix = E.rel(e['audio']['mix'])
    if os.path.exists(mix) and os.path.getmtime(mix) >= os.path.getmtime(E.rel(edl_path)):
        return mix, False
    if os.path.exists(mix):
        print('  WARNING: the mix is older than the EDL: re-run tools/video/audio/mix.py', flush=True)
        return mix, False
    ph = os.path.join(work_dir(e), 'placeholder_mix.wav')
    if not os.path.exists(ph) or os.path.getmtime(ph) < os.path.getmtime(E.rel(edl_path)):
        placeholder_mix(e, ph)
    return ph, True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('edl', nargs='?')
    ap.add_argument('--force', action='store_true', help='re-render cached segments and chunks')
    ap.add_argument('--ignore-invalid', action='store_true')
    ap.add_argument('--only-segments', action='store_true')
    ap.add_argument('--no-proxy', action='store_true')
    ap.add_argument('--chunk', nargs=5, metavar=('EDL', 'CLIP', 'I0', 'I1', 'OUT'), help=argparse.SUPPRESS)
    ap.add_argument('--chunks', help=argparse.SUPPRESS)
    a = ap.parse_args()
    if a.chunk:
        p, cid, i0, i1, out = a.chunk
        render_chunk(p, cid, int(i0), int(i1), out)
        return
    if a.chunks:
        job = json.load(open(a.chunks))
        for cid, i0, i1, out in job['tasks']:
            render_chunk(job['edl'], cid, int(i0), int(i1), out)
        return
    e = E.load(a.edl)
    err, warn = V.validate(e)
    for x in err:
        print('EDL ERROR:', x)
    if err and not a.ignore_invalid:
        raise SystemExit('EDL invalid; fix it or pass --ignore-invalid')
    wd = work_dir(e)
    json.dump(E.resolved(e), open(os.path.join(wd, 'edl.resolved.json'), 'w'), indent=1)
    t0 = time.time()
    segs = stage_a(e, os.path.abspath(a.edl), a.force)
    if a.only_segments:
        return
    caps, strip, tname = render_captions(e)
    json.dump(caps, open(os.path.join(wd, 'captions.json'), 'w'), indent=1)
    audio, ph_audio = find_mix(e, a.edl)
    trans = stage_t(e, segs, a.force)
    files = stage_bc(e, segs, caps, strip, a.force, proxy=not a.no_proxy, trans=trans)
    for o in e['outputs']:
        os.makedirs(os.path.dirname(E.rel(o['path'])), exist_ok=True)
        concat_mux(files[o['name']], audio, E.rel(o['path']), e['duration'])
    if files['proxy']:
        concat_mux(files['proxy'], None, os.path.join(wd, 'qa_proxy.mp4'), e['duration'])
    info = dict(video=e['video'], edl=a.edl, outputs=[o['path'] for o in e['outputs']], audio=os.path.relpath(audio, E.ROOT),
                audio_placeholder=ph_audio, caption_template=tname, seconds=round(time.time() - t0, 1),
                placeholder_clips=[c['id'] for c in e['clips'] if c.get('src_kind') == 'placeholder'], edl_warnings=warn)
    json.dump(info, open(os.path.join(wd, 'render.json'), 'w'), indent=1)
    print(json.dumps({k: v for k, v in info.items() if k != 'edl_warnings'}, indent=1))


if __name__ == '__main__':
    main()
