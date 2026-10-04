#!/usr/bin/env python3
"""NO PEEKING! QA gates -> videos/final/review/<video>_qa.{json,md}. Exit 1 if any gate fails.

usage: tools/video/safe-run.sh --mem 4G -- python3 tools/video/qa/run.py tools/video/edl/trailer.edl.json [--skip reencode,clean]

Gates (docs/VIDEO_BIBLE.md §7 + REVISED #8, docs/VIDEO_CRITIQUE.md §7):
  edl          the EDL validator (structure, transitions allowed/once, push-in caps, upscale guard
               against the real source resolution, reading time, <= 7 trailer texts, >= 80% hard cuts on beats)
  cuts         scdet cuts on the pre-grain QA proxy vs EDL cuts (+-1 frame); intentional flashes, blacks,
               in-engine dissolves and relights are exempt; on_beat cuts vs the cue-sheet grid (+-1)
  av_sync      mixreport cue frames vs the EDL-mapped capture-event frames (+-1); design cues vs EDL cues
  every_event  every visible capture event on screen has a sound in the mix (inverse SFX gate)
  captions     caption rects vs the capture's layout.json UI boxes mapped through camera+placement (no overlap);
               reading time >= 1.6 s + 40 ms/char from full legibility; WCAG contrast >= 4.5:1 measured on the
               rendered frames (glyph mask from the template vs the pixels around the glyphs)
  picture      blackdetect / freezedetect vs the intentional marks; first 3 s not black
  sharpness    Laplacian variance vs the old cut (videos/mechanic.mp4)
  banding      night shots: flat-plateau fraction in smooth gradient blocks + unique luma levels
  clean        no STAGE watermark / judge-mode badge / debug bar (template match) + capture meta flags
  loudness     ebur128: -14 +-0.5 LUFS integrated, true peak <= -1 dBTP; featured cues >= 6 LU over the music
  reencode     ~8 Mbps YouTube-like 1080p re-encode: sharpness retained >= 85%, banding still passes
  human        fresh-eyes / muted / audio-only / phone-speaker passes: listed as PENDING (Critic as proxy)
"""
import argparse
import json
import os
import re
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
import edl as E  # noqa: E402
import validate as V  # noqa: E402

FPS = 60
T = '6'
REVIEW = E.rel('videos/final/review')
OLD_CUT = E.rel('videos/mechanic.mp4')


def ff(args, text=True):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-threads', T, *args], capture_output=True, text=text)


def grab(path, frames, w=1920, h=1080, gray=False):
    """Decode the given frame indices (streamed, select filter) -> {frame: ndarray}."""
    frames = sorted(set(int(f) for f in frames))
    out = {}
    for i in range(0, len(frames), 60):
        part = frames[i:i + 60]
        sel = '+'.join(f'eq(n,{f})' for f in part)
        pf = 'gray' if gray else 'rgb24'
        r = subprocess.run(['ffmpeg', '-v', 'error', '-threads', T, '-i', path, '-vf', f"select='{sel}',scale={w}:{h}",
                            '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', pf, '-'], capture_output=True)
        ch = 1 if gray else 3
        n = w * h * ch
        for k, f in enumerate(part):
            b = r.stdout[k * n:(k + 1) * n]
            if len(b) == n:
                out[f] = np.frombuffer(b, np.uint8).reshape(h, w) if gray else np.frombuffer(b, np.uint8).reshape(h, w, 3)
    return out


def gate(name, ok, details, summary, status=None):
    return {'gate': name, 'status': status or ('PASS' if ok else 'FAIL'), 'summary': summary, 'details': details}


# ───────────────────────── exemptions ─────────────────────────
def intentional(e, kinds):
    rs = [(m['start'], m['end']) for m in e['marks'] if m['type'] in kinds]
    for c in e['clips']:
        f = c['flags']
        if ('black' in kinds and f['intentional_black']) or ('hold' in kinds and f['intentional_hold']) or \
           ('flash' in kinds and f['intentional_flash']):
            rs.append((c['start'], c['start'] + c['dur']))
        if 'hold' in kinds:  # capture-declared holds (meta marks kind=hold), mapped to the timeline
            meta = os.path.splitext(E.rel(c['src']))[0] + '.meta.json' if not c['src'].startswith('@') else None
            if meta and os.path.exists(meta):
                for mk in json.load(open(meta)).get('marks', []):
                    if mk.get('kind') == 'hold':
                        a = E.local_to_timeline(c, max(c['in'], mk['from']))
                        if a is not None:
                            rs.append((a, c['start'] + c['dur']))
    for fx in e['fx']:
        if fx['type'] == 'flash' and 'flash' in kinds:
            rs.append((fx['start'], fx['start'] + fx['dur']))
    return rs


def inside(f, rs, tol=1):
    return any(a - tol <= f <= b + tol for a, b in rs)


# ───────────────────────── gates ─────────────────────────
def g_edl(e):
    err, warn = V.validate(e)
    return gate('edl', not err, {'errors': err, 'warnings': warn}, f'{len(err)} errors, {len(warn)} warnings')


def g_cuts(e, proxy, cs):
    r = ff(['-i', proxy, '-vf', 'scdet=threshold=10,metadata=print:file=-', '-an', '-f', 'null', '-'])
    det = sorted({int(round(float(m) * FPS)) for m in re.findall(r'lavfi\.scd\.time=([\d.]+)', r.stdout + r.stderr)})
    cuts = E.cut_list(e)
    exempt = intentional(e, {'flash', 'black', 'dissolve', 'exempt'})
    for c in e['clips']:
        exempt += [tuple(x) for x in c.get('scdet_exempt', [])]
    tr_ranges = [tuple(c['range']) for c in cuts if 'range' in c]
    expected = [c['frame'] for c in cuts if 'range' not in c]
    unexpected = [f for f in det if not any(abs(f - x) <= 1 for x in expected) and not inside(f, exempt) and not inside(f, tr_ranges)]
    missed = [c for c in cuts if 'range' not in c and not any(abs(f - c['frame']) <= 1 for f in det)
              and not inside(c['frame'], exempt, 2)]
    beat_err = []
    if cs:
        for c in cuts:
            if c['on_beat']:
                b = E.nearest(cs['beats'], c['beat_frame'])
                if b is None or abs(b - c['beat_frame']) > 1:
                    beat_err.append({'clip': c['clip'], 'frame': c['beat_frame'], 'nearest_beat': b})
                # and the *rendered* cut, if scdet saw it
                seen = [f for f in det if abs(f - c['frame']) <= 1]
                if seen and b is not None and abs(seen[0] - b) > 1 and 'range' not in c:
                    beat_err.append({'clip': c['clip'], 'rendered': seen[0], 'nearest_beat': b})
    hard = sum(1 for c in cuts if c['type'] in ('cut', 'xray-dissolve', 'relight') and c['on_beat'])
    ratio = hard / max(1, len(cuts))
    ok = not unexpected and not beat_err and (e['video'] != 'trailer' or ratio >= 0.8)
    # shot rhythm (Critic §7.8): no shot < 12 frames except flash/strobe
    short = [c['id'] for c in e['clips'] if c['dur'] < 12 and not c['flags']['intentional_flash']]
    return gate('cuts', ok, {'detected': det, 'edl_cuts': [c['frame'] for c in cuts], 'unexpected_cuts': unexpected,
                             'missed_cuts_warning': [(c['clip'], c['frame']) for c in missed], 'off_beat': beat_err,
                             'hard_on_beat_ratio': round(ratio, 3), 'shots_under_12_frames': short},
                f'{len(det)} detected / {len(cuts)} EDL edits; {len(unexpected)} unexpected, {len(missed)} missed (warn), '
                f'{len(beat_err)} off-beat; hard-on-beat {ratio:.0%}')


def load_mixreport(e, render_info):
    for p in (e['audio'].get('mixreport'), (render_info or {}).get('audio', '').replace('.wav', '_report.json')):
        if p and os.path.exists(E.rel(p)):
            d = E.load_json(p)
            return d, p
    return None, None


def g_av(e, rep):
    if not rep:
        return gate('av_sync', False, {}, 'no mixreport', status='BLOCKED')
    res = E.resolved(e)
    byclip = {(ev['clip'], ev['src_frame'], ev.get('name')): ev['frame'] for ev in res['timeline_events']}
    clips = {c['id']: c for c in e['clips']}
    bad, n = [], 0
    for q in rep.get('cues', []):
        if q.get('clip') and q.get('src_frame') is not None and q['clip'] in clips:
            c = clips[q['clip']]
            want = E.local_to_timeline(c, q['src_frame'])
            if want is None:
                m = c['_map']
                idx = next((i for i, s in enumerate(m) if s >= q['src_frame']), None)
                want = None if idx is None else c['start'] + idx
            if want is None:
                continue
            n += 1
            if abs(q['frame'] - want) > 1:
                bad.append({'cue': q.get('id', q['name']), 'name': q['name'], 'mix_frame': q['frame'], 'edl_frame': want})
    dbad, dn = [], 0
    names_frames = [(q['name'], q['frame']) for q in rep.get('cues', [])]
    names_frames += [('gate', g[0]) for g in (rep.get('summary') or {}).get('music_gates', []) if isinstance(g, (list, tuple))]
    for c in e['clips']:
        for cue in c['cues']:
            dn += 1
            if not any(abs(f - cue['frame']) <= 1 for nm, f in names_frames):
                dbad.append({'clip': c['id'], 'cue': cue['name'], 'frame': cue['frame']})
    ok = not bad and not dbad
    if rep.get('placeholder'):
        return gate('av_sync', ok, {'event_cues_checked': n, 'off_by_more_than_1': bad}, f'PLACEHOLDER mix ({n} cues, {len(bad)} off): plumbing only', status='BLOCKED')
    return gate('av_sync', ok, {'event_cues_checked': n, 'off_by_more_than_1': bad, 'design_cues_checked': dn, 'design_cues_missing': dbad,
                                'placeholder_mix': bool(rep.get('placeholder'))},
                f'{n} event cues, {len(bad)} off; {dn} design cues, {len(dbad)} missing' + (' (PLACEHOLDER mix)' if rep.get('placeholder') else ''))


def g_every_event(e, rep):
    if not rep:
        return gate('every_event', False, {}, 'no mixreport', status='BLOCKED')
    evs = [ev for ev in E.resolved(e)['timeline_events'] if ev['visible']]
    cues = rep.get('cues', [])
    thinned = rep.get('thinned', [])

    def heard(ev):
        return any(abs(q['frame'] - ev['frame']) <= 1 and (q.get('clip') in (None, ev['clip'])) for q in cues)

    def thin(ev):
        return any(abs(t.get('frame', -99) - ev['frame']) <= 1 for t in thinned if isinstance(t, dict))
    silent = [{'frame': ev['frame'], 'name': ev['name'], 'clip': ev['clip']} for ev in evs if not heard(ev) and not thin(ev)]
    th = [ev['frame'] for ev in evs if not heard(ev) and thin(ev)]
    return gate('every_event', not silent, {'visible_events': len(evs), 'silent': silent, 'thinned_in_speedups': th},
                f'{len(evs)} visible events, {len(silent)} without sound, {len(th)} thinned in speed-ups')


def layout_boxes(e, c, out_size, tl_a, tl_b):
    """UI boxes (output px) of a clip's layout.json active between timeline frames [tl_a, tl_b)."""
    lj = c.get('layout_json')
    if not lj or not os.path.exists(E.rel(lj)):
        return []
    d = E.load_json(lj)
    m = re.search(r'multiply by ([\d.]+)', d.get('coords', ''))
    sc = float(m.group(1)) if m else 2.0
    sw, sh, _, _ = E.probe(c['src'])
    sc = sw / 1920 if sw else sc  # trust the real file over the meta
    ax, ay, aw, ah = E.game_area(e, out_size)
    out = []
    a, b = max(tl_a, c['start']), min(tl_b, c['start'] + c['dur'])
    if b <= a:
        return []
    m_ = c['_map']
    src_lo, src_hi = m_[a - c['start']], m_[b - 1 - c['start']]
    for seg in d.get('segments', []):
        if seg['to'] < src_lo or seg['from'] > src_hi:
            continue
        if seg['sel'] in ('.stage', '.scene', 'canvas', '#scene'):
            continue
        for x, y, w, hh in seg['rects']:
            for lf in (a - c['start'], b - 1 - c['start']):
                z, cx, cy = E.camera_at(c['camera'], lf)
                x0, y0, x1, y1 = E.view_box(sw, sh, aw, ah, z, cx, cy)
                k = aw / (x1 - x0)
                bx = ax + (x * sc - x0) * k
                by = ay + (y * sc - y0) * k
                # clip to the visible game area (UI outside the camera view or the placed picture is not on screen)
                cx0, cy0 = max(bx, ax), max(by, ay)
                cx1, cy1 = min(bx + w * sc * k, ax + aw), min(by + hh * sc * k, ay + ah)
                if cx1 - cx0 >= 1 and cy1 - cy0 >= 1:
                    out.append((seg['sel'], cx0, cy0, cx1 - cx0, cy1 - cy0))
    return out


def caption_rect(e, c, capmeta, size):
    W, H = e['work']
    s = size[0] / W
    if c['position'] == 'strip':
        x, y, w, h = E.strip_rect(e, size)
        return (x, y, w, h)
    r = (capmeta or {}).get('rect')
    if r:
        return tuple(v * s for v in r)
    return (0, size[1] * 0.12, size[0], size[1] * 0.2)


def lum(rgb):
    c = rgb.astype(np.float64) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def g_captions(e, final, wd):
    from PIL import Image
    from scipy import ndimage
    capsj = os.path.join(wd, 'captions.json')
    caps = json.load(open(capsj)) if os.path.exists(capsj) else {}
    size = (1920, 1080)
    overlaps, reading, contrast = [], [], []
    frames_needed = {}
    for c in e['captions']:
        need = V.reading_frames(c['text'])
        have = c['end'] - c['legible_from']
        if have < need:
            reading.append({'id': c['id'], 'text': c['text'], 'have_s': round(have / FPS, 2), 'need_s': round(need / FPS, 2)})
        rect = caption_rect(e, c, caps.get(c['id']), size)
        for cl in e['clips']:
            for sel, bx, by, bw, bh in layout_boxes(e, cl, size, c['start'], c['end']):
                if bx < rect[0] + rect[2] - 1 and rect[0] < bx + bw - 1 and by < rect[1] + rect[3] - 1 and rect[1] < by + bh - 1:
                    overlaps.append({'caption': c['id'], 'clip': cl['id'], 'ui': sel, 'box': [round(v) for v in (bx, by, bw, bh)]})
        span = max(1, c['end'] - 8 - c['legible_from'])
        frames_needed[c['id']] = [c['legible_from'] + int(span * u) for u in (0.05, 0.5, 0.95)]
    allf = sorted({f for fs in frames_needed.values() for f in fs})
    imgs = grab(final, allf) if os.path.exists(final) else {}
    for c in e['captions']:
        meta = caps.get(c['id'], {})
        mp = meta.get('mask')
        worst = None
        for f in frames_needed[c['id']]:
            im = imgs.get(f)
            if im is None:
                continue
            L = lum(im)
            if mp and os.path.exists(mp):
                mk = np.asarray(Image.open(mp).convert('RGBA').resize(size, Image.BILINEAR))[..., 3] > 200
                core = ndimage.binary_erosion(mk, iterations=1)
                ring = ndimage.binary_dilation(mk, iterations=10) & ~ndimage.binary_dilation(mk, iterations=2)
                if core.sum() < 20 or ring.sum() < 20:
                    continue
                lt = float(np.median(L[core]))
                bg = L[ring]
                lb = float(np.percentile(bg, 90 if lt < np.median(bg) else 10)) if False else \
                    float(np.percentile(bg, 10)) if lt > np.median(bg) else float(np.percentile(bg, 90))
                # the worst 10% of the surround (closest to the text luminance)
                lb = float(np.percentile(bg, 90)) if lt > np.median(bg) else float(np.percentile(bg, 10))
            else:  # pre-rendered card: Otsu split inside the rect
                x, y, w, h = [int(v) for v in caption_rect(e, c, meta, size)]
                reg = L[y:y + h, x:x + w].ravel()
                if reg.size < 100:
                    continue
                th = np.median(reg)
                hi, lo = reg[reg > th], reg[reg <= th]
                lt, lb = float(np.median(hi)), float(np.percentile(lo, 90))
            hi_, lo_ = max(lt, lb), min(lt, lb)
            ratio = (hi_ + 0.05) / (lo_ + 0.05)
            worst = ratio if worst is None else min(worst, ratio)
        contrast.append({'id': c['id'], 'text': c['text'][:40], 'min_contrast': None if worst is None else round(worst, 2),
                         'pass': worst is not None and worst >= 4.5})
    bad_c = [x for x in contrast if not x['pass']]
    ok = not overlaps and not reading and not bad_c
    return gate('captions', ok, {'overlaps': overlaps, 'reading_time_short': reading, 'contrast': contrast},
                f'{len(e["captions"])} captions; {len(overlaps)} UI overlaps, {len(reading)} too short, {len(bad_c)} below 4.5:1')


def g_picture(e, proxy):
    r = ff(['-i', proxy, '-vf', 'blackdetect=d=0.03:pic_th=0.98:pix_th=0.06,freezedetect=n=-60dB:d=0.5', '-an', '-f', 'null', '-'])
    log = r.stderr
    blacks = [(int(round(float(a) * FPS)), int(round(float(b) * FPS))) for a, b in re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', log)]
    fs = [int(round(float(x) * FPS)) for x in re.findall(r'freeze_start: ([\d.]+)', log)]
    fe = [int(round(float(x) * FPS)) for x in re.findall(r'freeze_end: ([\d.]+)', log)]
    freezes = list(zip(fs, fe + [e['duration']] * (len(fs) - len(fe))))
    okb = intentional(e, {'black'})
    okh = intentional(e, {'hold', 'black'})
    covered = lambda a, b, rs: any(x - 2 <= a and b <= y + 2 for x, y in rs)
    bad_b = [r_ for r_ in blacks if not covered(*r_, okb)]
    bad_f = [r_ for r_ in freezes if not covered(*r_, okh)]
    first_black = any(a <= 0 and b >= 180 for a, b in blacks)
    ok = not bad_b and not bad_f and not first_black
    return gate('picture', ok, {'black': blacks, 'unintended_black': bad_b, 'freeze': freezes, 'unintended_freeze': bad_f,
                                'first_3s_black': first_black},
                f'{len(blacks)} black ranges ({len(bad_b)} unintended), {len(freezes)} freezes ({len(bad_f)} unintended)')


def lap_var(g):
    g = g.astype(np.float32)
    l = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    return float(l.var())


def sample_frames(e, n=10, kind=None):
    cl = [c for c in e['clips'] if not c['src'].startswith('@') and (kind is None or c.get('grade') == kind)
          and not c['flags']['intentional_black']]
    if not cl:
        return []
    out = []
    for k in range(n):
        c = cl[k % len(cl)]
        out.append(c['start'] + int(c['dur'] * (0.25 + 0.5 * ((k // len(cl)) % 2))))
    return sorted(set(out))


def sharpness(path, frames):
    imgs = grab(path, frames, gray=True)
    return {f: lap_var(g) for f, g in imgs.items()}


def g_sharpness(e, final, frames):
    new = sharpness(final, frames)
    od = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OLD_CUT],
                              capture_output=True, text=True).stdout or 0)
    old_frames = [int(od * 30 * (k + 0.5) / 10) for k in range(10)]  # the old cut is 30 fps
    old = sharpness(OLD_CUT, old_frames)
    mn, mo = float(np.median(list(new.values()) or [0])), float(np.median(list(old.values()) or [1]))
    return gate('sharpness', mn >= mo, {'new_median_lapvar': round(mn, 1), 'old_cut_median_lapvar': round(mo, 1),
                                        'per_frame_new': {k: round(v, 1) for k, v in new.items()}},
                f'Laplacian variance {mn:.1f} vs old cut {mo:.1f} ({mn / max(mo, 1e-9):.2f}x)'), new


def banding_metric(g):
    """Fraction of pixels in smooth gradient blocks that sit on a perfectly flat 5x5 plateau
    (banded gradients: high; dithered/grained: low) + mean unique luma levels per block."""
    g = g.astype(np.int16)
    B = 48
    flat_tot = n_tot = 0
    uniq = []
    for y in range(0, g.shape[0] - B, B):
        for x in range(0, g.shape[1] - B, B):
            blk = g[y:y + B, x:x + B]
            sm = blk.astype(np.float32)
            # smooth = low-pass of the block varies slowly, and spans a few levels (a real gradient, not flat)
            lp = (sm[::8, ::8])
            rng = int(lp.max() - lp.min())
            grad = np.abs(np.diff(lp, axis=0)).mean() + np.abs(np.diff(lp, axis=1)).mean()
            if not (2 <= rng <= 24 and grad < 4) or blk.mean() > 200:
                continue
            c = blk[2:-2, 2:-2]
            eq = np.ones_like(c, bool)
            for dy in (-2, -1, 0, 1, 2):
                for dx in (-2, -1, 0, 1, 2):
                    eq &= blk[2 + dy:B - 2 + dy, 2 + dx:B - 2 + dx] == c
            flat_tot += int(eq.sum())
            n_tot += eq.size
            uniq.append(len(np.unique(blk)))
    return (flat_tot / n_tot if n_tot else None), (float(np.mean(uniq)) if uniq else None), len(uniq)


def g_banding(e, final, frames, label='banding'):
    if not frames:
        return gate(label, True, {}, 'no night shots', status='N/A'), {}
    imgs = grab(final, frames, gray=True)
    per = {}
    for f, g in imgs.items():
        fl, un, nb = banding_metric(g)
        per[f] = {'flat_fraction': None if fl is None else round(fl, 4), 'unique_levels_per_block': un and round(un, 1), 'blocks': nb}
    fls = [v['flat_fraction'] for v in per.values() if v['flat_fraction'] is not None]
    worst = max(fls) if fls else None
    ok = worst is None or worst < 0.25
    return gate(label, ok, {'per_frame': per, 'threshold_flat_fraction': 0.25},
                f'worst flat-plateau fraction {worst} over {len(fls)} night frames' if fls else 'no smooth gradient blocks found'), per


def g_clean(e, final):
    from PIL import Image
    from scipy.signal import fftconvolve
    tdir = os.path.join(HERE, 'templates')
    temps = {}
    for fn in sorted(os.listdir(tdir)):
        if fn.endswith('.png'):
            temps[fn[:-4]] = np.asarray(Image.open(os.path.join(tdir, fn)).convert('L'), np.float32)
    frames = list(range(30, e['duration'], 30))
    imgs = grab(final, frames, w=960, h=540, gray=True)
    ax, ay, aw, ah = E.game_area(e, (960, 540))
    hits = []
    for f, g in imgs.items():
        c = next((c for c in e['clips'] if c['start'] <= f < c['start'] + c['dur']), None)
        if c is None or c['src'].startswith('@'):
            continue
        z = E.camera_at(c['camera'], f - c['start'])[0]
        s0 = aw / 1920 * z  # template css px -> analysis px (game footage is laid out in 1920 css px)
        G = g.astype(np.float32)
        for name, t0 in temps.items():
            best = None
            for s in (s0 * 0.9, s0, s0 * 1.1):
                th, tw = max(4, int(round(t0.shape[0] * s))), max(4, int(round(t0.shape[1] * s)))
                if th >= G.shape[0] or tw >= G.shape[1]:
                    continue
                t = np.asarray(Image.fromarray(t0).resize((tw, th), Image.BILINEAR), np.float32)
                t = t - t.mean()
                tn = np.sqrt((t ** 2).sum())
                if tn < 1e-3:
                    continue
                num = fftconvolve(G, t[::-1, ::-1], mode='valid')
                ones = np.ones_like(t)
                s1 = fftconvolve(G, ones, mode='valid')
                s2 = fftconvolve(G * G, ones, mode='valid')
                var = s2 - s1 * s1 / t.size
                ok_px = var > (3.0 ** 2) * t.size  # textured windows only: flat areas make NCC numerically meaningless
                ncc = np.where(ok_px, num / (np.sqrt(np.maximum(var, 1e-6)) * tn), 0)
                k = float(np.clip(ncc, -1, 1).max())
                if best is None or k > best[0]:
                    yx = np.unravel_index(int(ncc.argmax()), ncc.shape)
                    best = (k, s, yx)
            if best and best[0] > 0.85:
                k, s, yx = best
                hits.append({'frame': f, 'clip': c['id'], 'template': name, 'scale': round(s, 3), 'ncc': round(k, 3),
                             'at_px_1080': [int(yx[1] * 2), int(yx[0] * 2)]})
    flags = []
    for c in e['clips']:
        if c['src'].startswith('@'):
            continue
        mp = os.path.splitext(E.rel(c['src']))[0] + '.meta.json'
        if os.path.exists(mp):
            m = json.load(open(mp))
            url = (m.get('options') or {}).get('url', '')
            if e['video'] == 'trailer' and 'cinema=1' not in url and not m.get('placeholder'):
                flags.append({'clip': c['id'], 'shot': c['shot'], 'issue': f'trailer footage not captured in ?cinema=1 ({url})'})
            if m.get('options', {}).get('cursor') and e['video'] == 'trailer' and c['shot'] not in ('tr_title_peek', 'tr_peek_beam'):
                flags.append({'clip': c['id'], 'shot': c['shot'], 'issue': 'cursor visible (unscripted?)', 'severity': 'warn'})
    seen = {}
    for x in hits:
        seen.setdefault((x['template']), []).append(x['frame'])
    hard = [f for f in flags if f.get('severity') != 'warn']
    return gate('clean', not hits and not hard, {'template_hits': hits, 'capture_flags': flags},
                f'{len(hits)} watermark/badge/debug hits {dict((k, len(v)) for k, v in seen.items())}; {len(hard)} capture-mode issues')


def g_loudness(final, rep):
    r = ff(['-i', final, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    s = r.stderr[r.stderr.rfind('Summary:'):]
    I = re.search(r'I:\s+(-?[\d.]+) LUFS', s)
    TP = re.search(r'Peak:\s+(-?[\d.]+) dBFS', s)
    I = float(I.group(1)) if I else None
    TP = float(TP.group(1)) if TP else None
    feat = [q for q in (rep or {}).get('cues', []) if q.get('featured') and 'margin_lu' in q]
    weak = [{'cue': q.get('id'), 'name': q['name'], 'margin_lu': q['margin_lu']} for q in feat if q['margin_lu'] < 6]
    ok = I is not None and abs(I + 14) <= 0.5 and TP is not None and TP <= -1.0 and not weak
    if (rep or {}).get('placeholder'):
        return gate('loudness', ok, {'integrated_lufs': I, 'true_peak_dbtp': TP}, f'PLACEHOLDER mix (I={I}, TP={TP}): not judged', status='BLOCKED')
    return gate('loudness', ok, {'integrated_lufs': I, 'true_peak_dbtp': TP, 'featured_cues': len(feat), 'cues_under_6LU': weak},
                f'I={I} LUFS, TP={TP} dBTP, {len(weak)}/{len(feat)} featured cues under 6 LU')


def g_loudness_curve(e, rep, cs):
    """Critic (music review, change 7): on the music bed: the build rises monotonically (per-bar RMS
    non-decreasing within 1 dB); drop >= build average + 6 dB and >= build peak + 4 dB; payoff >= montage
    average + 2 dB; proof bed >= 6 dB under the montage."""
    if e['video'] != 'trailer':
        return gate('loudness_curve', True, {}, 'trailer only', status='N/A')
    src = ((rep or {}).get('stems') or {}).get('music') or e['audio'].get('music')
    if not cs or not src or not os.path.exists(E.rel(src)):
        return gate('loudness_curve', False, {}, 'no music bed / cue sheet', status='BLOCKED')
    sr = 12000
    r = subprocess.run(['ffmpeg', '-v', 'error', '-threads', T, '-i', E.rel(src), '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
                       capture_output=True)
    x = np.frombuffer(r.stdout, np.float32)
    spf = sr / FPS
    db = lambda a, b: float(10 * np.log10(np.mean(x[int(a * spf):int(b * spf)] ** 2) + 1e-12))
    downs = [b for b in cs['beats'] if (b - cs['beats'][0]) % (3 * (cs['raw'].get('beat_frames', 32))) == 0] or cs['downbeats']
    S = cs['sections']

    def bars(name):
        if name not in S:
            return []
        a, b = S[name]
        edges = [a] + [d for d in downs if a < d < b] + [b]
        return [round(db(p, q), 2) for p, q in zip(edges, edges[1:]) if q - p >= 48]
    bb, dr, mo, pa, pr = bars('build'), bars('drop'), bars('montage'), bars('payoff'), bars('proof')
    av = lambda v: float(10 * np.log10(np.mean([10 ** (z / 10) for z in v]))) if v else None
    res, fails = {}, []
    if bb:
        drops = [(i, bb[i] - bb[i + 1]) for i in range(len(bb) - 1) if bb[i + 1] < bb[i] - 1.0]
        res['build_per_bar_db'] = bb
        if drops:
            fails.append(f'build falls between bars {[(i + 1, round(d, 1)) for i, d in drops]} (must rise, +-1 dB)')
    if bb and dr:
        res.update(build_avg=round(av(bb), 2), build_peak=max(bb), drop_avg=round(av(dr), 2))
        if av(dr) < av(bb) + 6:
            fails.append(f'drop {av(dr):.1f} dB < build avg {av(bb):.1f} + 6')
        if av(dr) < max(bb) + 4:
            fails.append(f'drop {av(dr):.1f} dB < build peak {max(bb):.1f} + 4')
    if pa and mo:
        res.update(montage_avg=round(av(mo), 2), payoff_avg=round(av(pa), 2))
        if av(pa) < av(mo) + 2:
            fails.append(f'payoff {av(pa):.1f} dB < montage avg {av(mo):.1f} + 2')
    if pr and mo:
        res['proof_avg'] = round(av(pr), 2)
        if av(pr) > av(mo) - 6:
            fails.append(f'proof bed {av(pr):.1f} dB not >= 6 dB under the montage ({av(mo):.1f})')
    res['source'] = src
    res['failures'] = fails
    return gate('loudness_curve', not fails, res, '; '.join(fails) if fails else 'energy curve shaped as required')


def g_music_gate(e):
    """The Music Supervisor's tools/video/audio/music_gate.py on the bed (exit 0 = pass)."""
    if e['video'] != 'trailer':
        return gate('music_gate', True, {}, 'trailer only', status='N/A')
    mg = E.rel('tools/video/audio/music_gate.py')
    music = E.rel(e['audio'].get('music') or 'videos/music/trailer_edit.wav')
    if not os.path.exists(mg) or not os.path.exists(music):
        return gate('music_gate', False, {}, 'music_gate.py or the bed missing', status='BLOCKED')
    env = dict(os.environ)
    try:
        import soundfile  # noqa: F401
    except ImportError:
        env['PYTHONPATH'] = os.path.join(HERE, 'shims') + os.pathsep + env.get('PYTHONPATH', '')
    r = subprocess.run([sys.executable, mg, music, E.rel(e['cue_sheet'])], capture_output=True, text=True, env=env)
    try:
        d = json.loads(r.stdout[r.stdout.find('{'):])
    except Exception:
        d = {'stdout': r.stdout[-1500:], 'stderr': r.stderr[-800:]}
    return gate('music_gate', r.returncode == 0, d, 'music_gate.py ' + ('PASS' if r.returncode == 0 else f'FAIL (exit {r.returncode})'))


def g_proof_sfx(e, rep):
    """Director: the proof-section SFX (flip, BEEP/quiet, BOOP, X-ray shimmer) must peak around -14 LUFS
    short-term (accept -16..-12), so energy holds after the drop over the submerged bed."""
    if e['video'] != 'trailer':
        return gate('proof_sfx', True, {}, 'trailer only', status='N/A')
    stem = ((rep or {}).get('stems') or {}).get('sfx')
    secs = {s['name']: (s['start'], s['end']) for s in e.get('sections', [])}
    if not stem or not os.path.exists(E.rel(stem)) or 'proof' not in secs:
        return gate('proof_sfx', False, {}, 'no sfx stem from the mix yet', status='BLOCKED')
    a, b = secs['proof']
    r = subprocess.run(['ffmpeg', '-v', 'error', '-threads', T, '-i', E.rel(stem), '-af',
                        f'atrim={a / FPS}:{b / FPS},ebur128=metadata=1,ametadata=print:key=lavfi.r128.S:file=-', '-f', 'null', '-'],
                       capture_output=True, text=True)
    vals = [float(x) for x in re.findall(r'lavfi\.r128\.S=(-?[\d.]+)', r.stdout)]
    pk = max(vals) if vals else None
    ok = pk is not None and -16 <= pk <= -12
    return gate('proof_sfx', ok, {'short_term_peak_lufs': pk, 'window': [a, b], 'stem': stem},
                f'proof SFX short-term peak {pk} LUFS (target -14, accept -16..-12)')


def g_reencode(e, final, wd, sharp_frames, night_frames, base_sharp):
    yt = os.path.join(wd, 'qa_youtube_8mbps.mp4')
    r = ff(['-y', '-v', 'error', '-i', final, '-c:v', 'libx264', '-threads', T, '-preset', 'medium', '-b:v', '8M', '-maxrate', '8M',
            '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-an', yt])
    if r.returncode:
        return gate('reencode', False, {'error': r.stderr[-500:]}, 're-encode failed')
    s2 = sharpness(yt, sharp_frames)
    ratios = [s2[f] / base_sharp[f] for f in s2 if base_sharp.get(f)]
    keep = float(np.median(ratios)) if ratios else None
    bg, _ = g_banding(e, yt, night_frames, 'banding_after_reencode')
    ok = keep is not None and keep >= 0.85 and bg['status'] != 'FAIL'
    return gate('reencode', ok, {'sharpness_retained_median': keep and round(keep, 3), 'banding': bg, 'file': os.path.relpath(yt, E.ROOT)},
                f'sharpness retained {keep and round(keep * 100)}%, banding {bg["status"]} ({bg["summary"]})')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('edl')
    ap.add_argument('--skip', default='')
    a = ap.parse_args()
    skip = set(filter(None, a.skip.split(',')))
    e = E.load(a.edl)
    wd = E.rel(f'videos/final/work/{e.get("work_name", e["video"])}')
    final = E.rel(e['outputs'][0]['path'])
    proxy = os.path.join(wd, 'qa_proxy.mp4')
    ri = json.load(open(os.path.join(wd, 'render.json'))) if os.path.exists(os.path.join(wd, 'render.json')) else {}
    cs = E.load_cue_sheet(e['cue_sheet']) if e.get('cue_sheet') and os.path.exists(E.rel(e['cue_sheet'])) else None
    rep, rep_p = load_mixreport(e, ri)
    gates = [g_edl(e), g_music_gate(e)]
    if not (os.path.exists(final) and os.path.exists(proxy)):
        gates.append(g_loudness_curve(e, rep, cs))  # the bed can be checked before any render
    have = os.path.exists(final) and os.path.exists(proxy)
    if not have:
        gates.append(gate('render', False, {}, 'no render yet', status='BLOCKED'))
    else:
        if 'cuts' not in skip:
            gates.append(g_cuts(e, proxy, cs))
        gates += [g_av(e, rep), g_every_event(e, rep)]
        gates.append(g_captions(e, final, wd))
        gates.append(g_picture(e, proxy))
        sf = sample_frames(e, 10)
        gs, base = g_sharpness(e, final, sf)
        gates.append(gs)
        nf = sample_frames(e, 8, 'night')
        gb, _ = g_banding(e, final, nf)
        gates.append(gb)
        if 'clean' not in skip:
            gates.append(g_clean(e, final))
        gates.append(g_loudness(final, rep))
        gates.append(g_loudness_curve(e, rep, cs))
        gates.append(g_proof_sfx(e, rep))
        if 'reencode' not in skip:
            gates.append(g_reencode(e, final, wd, sf, nf, base))
    gates.append(gate('human', False, {'pending': ['fresh-eyes "what do you do in this game?" (blocking; Critic as proxy)',
                                                    'muted pass', 'audio-only pass', 'phone/laptop speaker + mono fold-down']},
                      '4 human checks pending the Critic', status='PENDING'))
    ph = [c['id'] for c in e['clips'] if c.get('src_kind') == 'placeholder']
    report = {'video': e['video'], 'edl': a.edl, 'final': os.path.relpath(final, E.ROOT), 'mixreport': rep_p,
              'audio_placeholder': bool((rep or {}).get('placeholder')), 'placeholder_clips': ph,
              'overall': 'FAIL' if any(g['status'] in ('FAIL', 'BLOCKED') for g in gates) else 'PASS (human checks pending)',
              'gates': gates}
    os.makedirs(REVIEW, exist_ok=True)
    tag = e.get('work_name', e['video'])
    jp = os.path.join(REVIEW, f'{tag}_qa.json')
    json.dump(report, open(jp, 'w'), indent=1, default=str)
    md = [f'# QA: {e["video"]}  ->  {report["overall"]}', '',
          f'final: `{report["final"]}` · placeholder clips: {len(ph)}/{len(e["clips"])} · mix: {"PLACEHOLDER" if report["audio_placeholder"] else rep_p}', '',
          '| gate | status | summary |', '|---|---|---|']
    md += [f'| {g["gate"]} | {g["status"]} | {g["summary"]} |' for g in gates]
    open(os.path.join(REVIEW, f'{tag}_qa.md'), 'w').write('\n'.join(md) + '\n')
    print('\n'.join(md))
    sys.exit(0 if report['overall'].startswith('PASS') else 1)


if __name__ == '__main__':
    main()
