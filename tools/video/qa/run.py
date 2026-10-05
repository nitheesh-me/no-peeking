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
T = os.environ.get('NP_QA_THREADS', '15')  # pinned to the 8 E-cores by safe-run, so load stays <= 8 (crash #7); 2 left them idle
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
                lead_in = c['beat_frame'] - c['frame']  # e.g. logo_reveal placed 6 f early so its impact hits the downbeat
                if lead_in > 0 and seen and c['frame'] - 1 <= seen[0] <= c['beat_frame'] + 1:
                    continue
                if seen and b is not None and abs(seen[0] - b) > 1 and 'range' not in c:
                    beat_err.append({'clip': c['clip'], 'rendered': seen[0], 'nearest_beat': b})
    # systematic bias: +-1 tolerance per cut must not hide a constant offset (the 1-frame chunk shift, Oct 5)
    offs = []
    for x in expected:
        near = [f - x for f in det if abs(f - x) <= 1]
        if near:
            offs.append(min(near, key=abs))
    bias = float(np.median(offs)) if offs else 0.0
    biased = len(offs) >= 5 and abs(bias) >= 0.5 and sum(1 for o in offs if o == round(bias)) >= 0.6 * len(offs)
    if biased:
        beat_err.append({'systematic_offset_frames': bias, 'cuts_matched': len(offs)})
    hard = sum(1 for c in cuts if c['type'] in ('cut', 'xray-dissolve', 'relight') and c['on_beat'])
    ratio = hard / max(1, len(cuts))
    ok = not unexpected and not beat_err and (e['video'] != 'trailer' or ratio >= 0.8)
    # shot rhythm (Critic §7.8): no shot < 12 frames except flash/strobe
    short = [c['id'] for c in e['clips'] if c['dur'] < 12 and not c['flags']['intentional_flash']]
    return gate('cuts', ok, {'offset_median': bias, 'offsets': offs, 'detected': det, 'edl_cuts': [c['frame'] for c in cuts], 'unexpected_cuts': unexpected,
                             'missed_cuts_warning': [(c['clip'], c['frame']) for c in missed], 'off_beat': beat_err,
                             'hard_on_beat_ratio': round(ratio, 3), 'shots_under_12_frames': short,
                             'waived_off_grid_cuts': [{'clip': c['clip'], 'frame': c['frame'], **c['grid_waiver']}
                                                      for c in cuts if c.get('grid_waiver')]},
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
    ev_keys = {(ev['clip'], ev['src_frame']) for ev in res['timeline_events']}
    accents = 0
    for q in rep.get('cues', []):
        if q.get('clip') and (q.get('accent') or (q['clip'], q.get('src_frame')) not in ev_keys):
            accents += 1  # mixer-added accent on a cut (not a capture event): nothing to sync to
            continue
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
        return gate('av_sync', ok, {'mixer_accents_skipped': accents, 'event_cues_checked': n, 'off_by_more_than_1': bad}, f'PLACEHOLDER mix ({n} cues, {len(bad)} off): plumbing only', status='BLOCKED')
    return gate('av_sync', ok, {'mixer_accents_skipped': accents, 'event_cues_checked': n, 'off_by_more_than_1': bad, 'design_cues_checked': dn, 'design_cues_missing': dbad,
                                'placeholder_mix': bool(rep.get('placeholder'))},
                f'{n} event cues, {len(bad)} off; {dn} design cues, {len(dbad)} missing' + (' (PLACEHOLDER mix)' if rep.get('placeholder') else ''))


def g_every_event(e, rep):
    if not rep:
        return gate('every_event', False, {}, 'no mixreport', status='BLOCKED')
    evs = [ev for ev in E.resolved(e)['timeline_events'] if ev['visible']]
    cues = rep.get('cues', [])
    thinned = rep.get('thinned', [])

    def heard(ev):
        # card accents are quantised to the groove's 8ths when within 2 frames (docs/VIDEO_SOUND.md, `quantised_from`
        # kept in the report); the A/V rule allows those +-2 frames
        def at_ev(q):
            if q.get('clip') not in (None, ev['clip']):
                return False
            if abs(q['frame'] - ev['frame']) <= 1:
                return True
            qf = q.get('quantised_from')
            return qf is not None and abs(qf - ev['frame']) <= 1 and abs(q['frame'] - ev['frame']) <= 2
        return any(at_ev(q) for q in cues)

    def thin(ev):
        return any(abs(t.get('frame', -99) - ev['frame']) <= 1 for t in thinned if isinstance(t, dict))
    silent = [{'frame': ev['frame'], 'name': ev['name'], 'clip': ev['clip']} for ev in evs if not heard(ev) and not thin(ev)]
    th = [ev['frame'] for ev in evs if not heard(ev) and thin(ev)]
    return gate('every_event', not silent, {'visible_events': len(evs), 'silent': silent, 'thinned_in_speedups': th},
                f'{len(evs)} visible events, {len(silent)} without sound, {len(th)} thinned in speed-ups')


def layout_boxes(e, c, out_size, tl_a, tl_b):
    """UI boxes (output px) of a clip's layout.json active between timeline frames [tl_a, tl_b)."""
    lj = c.get('layout_json')
    if not lj or not os.path.exists(E.rel(lj)) or c['src'].startswith('@') or not os.path.exists(E.rel(c['src'])):
        return []  # no layout, or the source is being re-captured
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
        if seg['sel'] in ('.stage', '.scene', 'canvas', '#scene', '.stage-canvas-wrap'):  # the picture itself, not UI
            continue
        if c.get('windows'):  # split screen: only the cropped windows are on screen. Use the renderer's exact
            for x, y, w, hh in seg['rects']:  # cover-crop transform (E.window_boxes) for each window
                bx0s, by0s, bx1s, by1s = x * sc, y * sc, (x + w) * sc, (y + hh) * sc
                for win in [E.window_at(w0, lf) for w0 in c['windows'] for lf in sorted({a - c['start'], b - 1 - c['start']})]:
                    (x0, y0, x1, y1), (dx, dy, dw, dh) = E.window_boxes(win, sw, sh, out_size[0])
                    ix0, iy0, ix1, iy1 = max(bx0s, x0), max(by0s, y0), min(bx1s, x1), min(by1s, y1)
                    if ix1 - ix0 < 1 or iy1 - iy0 < 1:
                        continue
                    kx, ky = dw / (x1 - x0), dh / (y1 - y0)
                    out.append((f'{seg["sel"]}@{win["name"]}', dx + (ix0 - x0) * kx, dy + (iy0 - y0) * ky,
                                (ix1 - ix0) * kx, (iy1 - iy0) * ky))
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


def motion_text_rect(name):
    """(x, y, w, h) at 1920x1080 of a Motion piece's text, from its params (cards: y = line centre, size = font px)."""
    import glob
    base = os.path.basename(name).replace('_fill.mkv', '').replace('_matte.mkv', '').replace('.mkv', '')
    cands = [base] + [base.rsplit('_', 1)[0]] * ('_' in base)
    for n in cands:
        for d in ('videos/motion', 'videos/final/work/motion_ext'):
            for j in glob.glob(E.rel(f'{d}/{n}.json')):
                p = json.load(open(j)).get('params', {})
                if 'line' in p or 'circuit' in n:
                    return (180, 730, 1560, 190)
                if p.get('y') is not None:
                    size = p.get('size') or 120
                    lines = (p.get('text') or '').count('\n') + 1
                    return (140, p['y'] - 0.75 * size, 1640, lines * 1.25 * size + 0.3 * size)
    return None


def motion_meta_for(c):
    """The Motion Designer's <name>.json behind a pre-rendered caption (fill/matte or baked into a clip)."""
    import glob
    r = c.get('render')
    if not isinstance(r, dict):
        return None
    name = r.get('baked') or os.path.basename(r.get('fill') or r.get('src') or '')
    name = re.sub(r'(_fill)?\.(mkv|mov|mp4)$', '', name)
    for cand in (name, re.sub(r'_\d+$', '', name)):
        p = E.rel(f'videos/motion/{cand}.json')
        if os.path.exists(p):
            return json.load(open(p))
    return None


def place_alpha(a, r, size):
    """Place a full-frame overlay alpha (at `size`) exactly as render.alpha_src does: `rect` [x, y, w, h]
    (1080p units) scales the whole overlay frame into that rect; `offset` [dx, dy] shifts it."""
    from PIL import Image
    W_, H_ = size
    k = W_ / 1920
    rc = r.get('rect')
    if rc:
        x, y, w, h = [round(v * k) for v in rc]
        img = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((max(1, w), max(1, h)), Image.BILINEAR), np.float32) / 255
        out = np.zeros((H_, W_), np.float32)
        sx0, sy0 = max(0, -x), max(0, -y)
        dx0, dy0 = max(0, x), max(0, y)
        cw, ch = min(w - sx0, W_ - dx0), min(h - sy0, H_ - dy0)
        if cw > 0 and ch > 0:
            out[dy0:dy0 + ch, dx0:dx0 + cw] = img[sy0:sy0 + ch, sx0:sx0 + cw]
        return out
    off = r.get('offset')
    if off:
        dx, dy = round(off[0] * k), round(off[1] * H_ / 1080)
        sh = np.zeros_like(a)
        sh[max(0, dy):H_ + min(0, dy), max(0, dx):W_ + min(0, dx)] = a[max(0, -dy):H_ - max(0, dy), max(0, -dx):W_ - max(0, dx)]
        return sh
    return a


def caption_rect(e, c, capmeta, size):
    """Output-pixel rect of the caption's text band."""
    W, H = e['work']
    s = size[0] / W
    if c.get('rect'):
        return tuple(c['rect'])
    if c['position'] == 'strip':
        return tuple(E.strip_rect(e, size))
    r = (capmeta or {}).get('rect')
    if r:
        return tuple(v * s for v in r)
    rd = c.get('render') if isinstance(c.get('render'), dict) else None
    if rd and rd.get('matte') and os.path.exists(E.rel(rd['matte'])):
        # pre-rendered overlay: measure where its alpha actually is (bbox at full legibility) + render.offset
        k = size[0] / 1920  # offsets are 1080p units
        f = int(rd.get('in', 0)) + max(0, c.get('legible_from', c['start']) - c['start'])
        try:
            fr = grab(E.rel(rd['matte']), [f], w=size[0], h=size[1], gray=True)
        except Exception:
            fr = {}
        if f in fr:
            ys, xs = np.nonzero(place_alpha(fr[f].astype(np.float32) / 255, rd, size) > 0.5)
            if len(xs):
                return (xs.min(), ys.min(), xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)
    m = motion_meta_for(c)
    if m and 'params' in m and 'y' in m['params']:
        pr = m['params']
        k = size[0] / 1920  # motion params are CSS px of a 1920-wide frame
        lines = max(1, str(pr.get('text', '')).count('\n') + 1)
        fs = pr.get('size', 120)
        mw = pr.get('maxW', 1640)
        top = pr['y'] - 0.95 * fs  # y is the first baseline (cap height ~0.7 em above it)
        x0, y0 = (1920 - mw) / 2 * k, top * k
        off = (c.get('render') or {}).get('offset') if isinstance(c.get('render'), dict) else None
        if off:  # the overlay is placed shifted by render.offset (work px): measure where it actually is
            x0 += off[0] * s
            y0 += off[1] * s
        return (x0, y0, mw * k, (lines * 1.15 * fs + 0.35 * fs) * k)
    return (0, size[1] * 0.12, size[0], size[1] * 0.2)


def card_matte(c, f, size):
    """Alpha (0..1) of a Motion fill+matte overlay caption at timeline frame f, at `size`, or None."""
    r = c.get('render')
    if not isinstance(r, dict) or not r.get('matte') or not os.path.exists(E.rel(r['matte'])):
        return None
    k = r.get('in', 0) + (f - c['start'])
    n = r.get('frames')
    if n and k >= n:
        k = n - 1 if r.get('hold') else k
    g = grab(E.rel(r['matte']), [k], w=size[0], h=size[1], gray=True).get(k)
    if g is None:
        return None
    return place_alpha(g.astype(np.float32) / 255, r, size)  # rect / offset exactly as the assembler places it


def lum(rgb):
    c = rgb.astype(np.float64) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def strip_contrast(e, L, size):
    """WCAG contrast of a strip caption on the delivered pixels: ink glyphs (L < 0.12, eroded) vs the darkest 20% of
    the 2-6 px ring of non-ink pixels around them (paper, an amber gloss chip, or a chip's shadow). The track's alpha
    is the whole paper strip, so it can't serve as a glyph mask. None if no ink is in the text band."""
    from scipy import ndimage
    x, y, w, h = [int(round(v)) for v in E.strip_rect(e, size)]
    band = L[y + 25:y + h - 8, x:x + w]          # below the strip's dashed rule, above the bottom edge
    ink = band < 0.12
    core = ndimage.binary_erosion(ink, iterations=1)
    if core.sum() < 100:
        return None
    ring = ndimage.binary_dilation(ink, iterations=6) & ~ndimage.binary_dilation(ink, iterations=2) & ~ink
    if ring.sum() < 100:
        return None
    lt, lb = float(np.median(band[core])), float(np.percentile(band[ring], 20))
    return round((max(lt, lb) + 0.05) / (min(lt, lb) + 0.05), 2)


def g_captions(e, final, wd):
    from PIL import Image
    from scipy import ndimage
    capsj = os.path.join(wd, 'captions.json')
    caps = json.load(open(capsj)) if os.path.exists(capsj) else {}
    size = (1920, 1080)
    import sprites as SP
    overlaps, reading, contrast, sprites, sprite_px = [], [], [], [], []
    frames_needed = {}
    for c in e['captions']:
        need = 0 if c.get('label') else V.reading_frames(c['text'], FPS, e['video'])  # labels: persistent HUD tags, exempt
        have = c['end'] - c['legible_from']
        if have < need:
            reading.append({'id': c['id'], 'text': c['text'], 'have_s': round(have / FPS, 2), 'need_s': round(need / FPS, 2)})
        rect = caption_rect(e, c, caps.get(c['id']), size)
        # strip captions: the obstacle footprint is the strip band itself. Motion's caption-track alpha covers the
        # whole paper strip plus its drop shadow above y=950, so its bbox would flag every UI box touching the strip.
        mm = None if c.get('position') == 'strip' else card_matte(c, c['legible_from'] + (c['end'] - c['legible_from']) // 2, size)
        if mm is not None and (mm > 0.5).any():
            ys, xs = np.nonzero(mm > 0.5)
            rect = (xs.min(), ys.min(), xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)
        span = max(1, c['end'] - 8 - c['legible_from'])
        frames_needed[c['id']] = [c['legible_from'] + int(span * u) for u in (0.05, 0.5, 0.95)]
        if c.get('position') == 'card':  # a full card moment covers the picture on purpose (Critic §4.4)
            continue
        for cl in e['clips']:
            for sel, bx, by, bw, bh in layout_boxes(e, cl, size, c['start'], c['end']):
                if bx < rect[0] + rect[2] - 1 and rect[0] < bx + bw - 1 and by < rect[1] + rect[3] - 1 and rect[1] < by + bh - 1:
                    overlaps.append({'caption': c['id'], 'clip': cl['id'], 'ui': sel, 'box': [round(v) for v in (bx, by, bw, bh)]})
        span = max(1, c['end'] - 8 - c['legible_from'])
        frames_needed[c['id']] = [c['legible_from'] + int(span * u) for u in (0.05, 0.5, 0.95)]
        # in-scene sprites as obstacles (Critic re-review): layout.json sprite:/actor: boxes, else ink-outline blobs
        # on the caption-free frame under the caption's real footprint
        worst_sp, src_sp = None, None
        for f in frames_needed[c['id']]:
            cl = next((x for x in e['clips'] if x['start'] <= f < x['start'] + x['dur']), None)
            boxes = SP.layout_sprites(e, cl, size, f) if cl else []
            for sel, bx, by, bw, bh in boxes:
                if bx < rect[0] + rect[2] and rect[0] < bx + bw and by < rect[1] + rect[3] and rect[1] < by + bh:
                    sprites.append({'caption': c['id'], 'frame': f, 'sprite': sel, 'source': 'layout.json',
                                    'box': [round(v) for v in (bx, by, bw, bh)]})
            mmf = card_matte(c, f, size)
            g, _ = SP.caption_free(e, f, size)
            if mmf is None or g is None:
                continue
            fp = SP.footprint(mmf)
            frac = float((SP.ink_mask(g) & fp).sum() / max(1, fp.sum()))
            if worst_sp is None or frac > worst_sp:
                worst_sp, src_sp = frac, f
        sprite_px.append({'id': c['id'], 'text': c['text'][:40], 'ink_on_footprint': None if worst_sp is None else round(worst_sp, 4),
                          'frame': src_sp, 'status': 'unchecked' if worst_sp is None else ('FAIL' if worst_sp > SP.FRAC_FAIL else 'ok')})
        dw = c.get('decor_waiver')  # pixel heuristic can't tell wall decor from characters: Director-reviewed waiver
        if dw and sprite_px[-1]['status'] == 'FAIL':
            sprite_px[-1].update(status='waived', waiver=dw)
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
            if c.get('position') == 'strip':
                r_ = strip_contrast(e, L, size)
                if r_ is not None:
                    worst = r_ if worst is None else min(worst, r_)
                elif worst is None:
                    worst = 0.0  # no ink found in the strip: the caption is not on screen
                continue
            mm = card_matte(c, f, size)
            if mm is not None and (mm > 0.9).sum() > 200:
                # the card's own opaque pixels (glyph fill + ink outline / paper plate): 2-class split on the RENDERED
                # pixels; contrast = text class median vs the worst 10% of the other class
                core = ndimage.binary_erosion(mm > 0.9, iterations=1)
                v = L[core]
                th = float(np.median(v))
                for _ in range(8):  # Otsu-like iterative threshold
                    a_, b_ = v[v > th], v[v <= th]
                    if not len(a_) or not len(b_):
                        break
                    th = (a_.mean() + b_.mean()) / 2
                hi_c, lo_c = v[v > th], v[v <= th]
                if len(hi_c) < 50 or len(lo_c) < 50:
                    continue
                # Both polarities are evaluated and the better one is kept. A mis-picked polarity measures the
                # ink outline against the fill/plate (tag_xray_proof read 1.55:1 that way, while it is ~14:1), and
                # text that is really illegible scores low in both. Background = the 2-8 px ring around the glyphs
                # (what each letter is read against); for plate cards it is limited to the card's own pixels so the
                # card's icon sprite (not behind any letter) is ignored; for bare-glyph overlays (low bbox fill) the
                # plate is the shadow pass outside the matte, so the ring may extend there.
                ys_, xs_ = np.nonzero(mm > 0.9)
                fill = len(xs_) / max(1, (xs_.max() - xs_.min() + 1) * (ys_.max() - ys_.min() + 1))
                glyph_only = fill < 0.5
                best = None
                for text_is_light in (True, False):
                    glyph = core & ((L > th) if text_is_light else (L <= th))
                    if glyph.sum() < 30:
                        continue
                    ring = ndimage.binary_dilation(glyph, iterations=8) & ~ndimage.binary_dilation(glyph, iterations=2)
                    if not glyph_only:
                        ring &= (mm > 0.5)
                    rv = L[ring] if ring.sum() >= 50 else (lo_c if text_is_light else hi_c)
                    lt_ = float(np.median(L[glyph]))
                    lb_ = float(np.percentile(rv, 90)) if text_is_light else float(np.percentile(rv, 10))
                    r_ = (max(lt_, lb_) + 0.05) / (min(lt_, lb_) + 0.05)
                    if best is None or r_ > best[0]:
                        best = (r_, lt_, lb_)
                if best is None:
                    continue
                lt, lb = best[1], best[2]
            elif mp and os.path.exists(mp):
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
            else:  # pre-rendered card: key the glyphs inside the text band
                x, y, w, h = [int(v) for v in caption_rect(e, c, meta, size)]
                x, y = max(0, x), max(0, y)
                reg = L[y:y + h, x:x + w]
                if reg.size < 100:
                    continue
                bright, dark = reg >= 0.55, reg <= 0.03
                pb, pd = bright.mean(), dark.mean()
                # text = the minority extreme (light paper text over night footage, or dark ink on a paper plate)
                use_bright = (pb < pd and pb > 0.004) or pd <= 0.004
                mk = bright if use_bright else dark
                core = ndimage.binary_erosion(mk, iterations=1)
                ring = ndimage.binary_dilation(mk, iterations=9) & ~ndimage.binary_dilation(mk, iterations=3)
                if core.sum() < 40 or ring.sum() < 40:
                    continue
                lt = float(np.median(reg[core]))
                bg = reg[ring]
                lb = float(np.percentile(bg, 90)) if use_bright else float(np.percentile(bg, 10))
            hi_, lo_ = max(lt, lb), min(lt, lb)
            ratio = (hi_ + 0.05) / (lo_ + 0.05)
            worst = ratio if worst is None else min(worst, ratio)
        contrast.append({'id': c['id'], 'text': c['text'][:40], 'min_contrast': None if worst is None else round(worst, 2),
                         'pass': worst is not None and worst >= 4.5})
    bad_c = [x for x in contrast if not x['pass']]
    bad_sp = [x for x in sprite_px if x['status'] == 'FAIL']
    unchk = [x['id'] for x in sprite_px if x['status'] == 'unchecked']
    ok = not overlaps and not reading and not bad_c and not sprites and not bad_sp
    return gate('captions', ok, {'overlaps': overlaps, 'reading_time_short': reading, 'contrast': contrast,
                                 'sprite_boxes_layout': sprites, 'sprite_ink_pixels': sprite_px,
                                 'sprite_rule': f'ink-outline sprite blobs (<= {SP.MAX_SPRITE}px) under the glyph footprint <= {SP.FRAC_FAIL:.0%}'},
                f'{len(e["captions"])} captions; {len(overlaps)} UI overlaps, {len(sprites) + len(bad_sp)} on sprites'
                f'{" (" + ", ".join(x["id"] for x in bad_sp) + ")" if bad_sp else ""}, {len(reading)} too short, {len(bad_c)} below 4.5:1'
                + (f'; sprite check skipped for {unchk}' if unchk else ''))


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


def g_dark(e, final):
    """Critic re-review: every intentional_black / lights-out clip stays under luma 40 on EVERY frame of the
    delivered render (mean frame luma, 8-bit full-range Y; also reports the 99.5th percentile)."""
    rs = [(c['start'], c['start'] + c['dur'], c['id'], c['shot']) for c in e['clips']
          if c['flags']['intentional_black'] or 'lights_out' in (c.get('section') or '') or 'lights_out' in c['shot']]
    drs = e.get('dark_ranges', [])
    if not rs and not drs:
        return gate('dark', True, {}, 'no dark clips', status='N/A')
    W, H = 192, 108
    bad, per = [], {}
    # night phases inside day takes (mechanic/showcase): the given region (1080p units: the room, not the UI)
    # must stay under its ceiling on every frame (catches a mis-seek into the lit bedtime/morning, as in the trailer)
    for dr in drs:
        a, b = dr['start'], dr['end']
        x, y, w, h = [round(v / 1920 * 1920) for v in dr['region']]
        r = subprocess.run(['ffmpeg', '-v', 'error', '-threads', T, '-i', final, '-vf',
                            f"select='between(n,{a},{b - 1})',crop={w}:{h}:{x}:{y},scale=96:54:flags=area,format=gray",
                            '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], capture_output=True)
        fr = np.frombuffer(r.stdout, np.uint8).reshape(-1, 54, 96)
        means = [float(v.mean()) for v in fr]
        over = [a + i for i, m in enumerate(means) if m >= dr['ceiling']]
        key = f'{dr.get("clip", "?")}@{a}'
        per[key] = {'range': [a, b], 'region': dr['region'], 'ceiling': dr['ceiling'], 'why': dr.get('why'), 'frames_checked': len(fr),
                    'max_mean_luma': round(max(means or [0]), 1), 'frames_over': over[:50], 'n_over': len(over)}
        if len(fr) < b - a or over:
            bad.append(key)
    for a, b, cid, shot in rs:
        # frame-exact: select by decoded frame index (no -ss: long-GOP seeks can land a frame off)
        r = subprocess.run(['ffmpeg', '-v', 'error', '-threads', T, '-i', final, '-vf',
                            f"select='between(n,{a},{b - 1})',scale={W}:{H}:flags=area,format=gray", '-fps_mode', 'passthrough',
                            '-f', 'rawvideo', '-'], capture_output=True)
        fr = np.frombuffer(r.stdout, np.uint8).reshape(-1, H, W)
        means = [float(x.mean()) for x in fr]
        p995 = [float(np.percentile(x, 99.5)) for x in fr]
        over = [a + i for i, m in enumerate(means) if m >= 40]
        per[cid] = {'shot': shot, 'range': [a, b], 'frames_checked': len(fr), 'max_mean_luma': round(max(means or [0]), 1),
                    'max_p995_luma': round(max(p995 or [0]), 1), 'frames_over_40': over[:50], 'n_over_40': len(over)}
        if len(fr) < b - a or over:
            bad.append(cid)
    return gate('dark', not bad, per, f'{len(rs)} dark clip(s), {len(drs)} night range(s); ' + (f'FAIL in {bad}' if bad else
                'every frame under its ceiling (max mean ' + str(max(v['max_mean_luma'] for v in per.values())) + ')'))


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


def ideal_frame(e, f, size=(1920, 1080)):
    """What frame f should look like with zero pipeline loss: the exact source frame, cropped by the
    same camera box and lanczos-downscaled once to the delivery size (no grade, no grain, no codec)."""
    from PIL import Image
    c = next((c for c in e['clips'] if c['start'] <= f < c['start'] + c['dur']), None)
    if c is None or c['src'].startswith('@') or c['transition']['type'] != 'cut' and f < c['start'] + c['transition'].get('frames', 0):
        return None
    sw, sh, _, _ = E.probe(c['src'])
    s = c['_map'][f - c['start']]
    r = subprocess.run(['ffmpeg', '-v', 'error', '-threads', T, '-ss', f'{(s - 0.5) / FPS:.6f}', '-i', E.rel(c['src']), '-frames:v', '1',
                        '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True)
    if len(r.stdout) < sw * sh:
        return None
    im = Image.frombuffer('L', (sw, sh), r.stdout[:sw * sh], 'raw', 'L', 0, 1)
    ax, ay, aw, ah = E.game_area(e, size)
    z, cx, cy = E.camera_at(c['camera'], f - c['start'])
    box = E.view_box(sw, sh, aw, ah, z, cx, cy)
    g = im.resize((aw, ah), Image.LANCZOS, box=box)
    return np.asarray(g), (ax, ay, aw, ah)


def g_sharpness(e, final, frames, proxy=None):
    """PASS/FAIL = fidelity: Laplacian variance of the delivered frame (game area) vs the ideal single
    lanczos downscale of its exact source frame (>= 0.90 median). The old-cut ratio is reported for
    information only: it compares different content (full-UI text vs full-bleed scenes)."""
    new = sharpness(final, frames)
    imgs = grab(proxy or final, frames, gray=True)  # pre-grain proxy: grain would inflate the Laplacian
    fid = {}
    for f in frames:
        ref = ideal_frame(e, f)
        if ref is None or f not in imgs:
            continue
        g, (ax, ay, aw, ah) = ref
        got = imgs[f][ay:ay + ah, ax:ax + aw]
        lr = lap_var(g)
        if lr > 5:
            fid[f] = lap_var(got) / lr
    od = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OLD_CUT],
                              capture_output=True, text=True).stdout or 0)
    old = sharpness(OLD_CUT, [int(od * 30 * (k + 0.5) / 10) for k in range(10)])  # the old cut is 30 fps
    mn, mo = float(np.median(list(new.values()) or [0])), float(np.median(list(old.values()) or [1]))
    fm = float(np.median(list(fid.values()))) if fid else None
    ok = fm is not None and fm >= 0.90
    return gate('sharpness', ok, {'fidelity_median': fm and round(fm, 3), 'fidelity_per_frame': {k: round(v, 3) for k, v in fid.items()},
                                  'new_median_lapvar': round(mn, 1), 'old_cut_median_lapvar_info': round(mo, 1)},
                f'fidelity {fm and round(fm, 2)} of the ideal downscale (need >= 0.90); info: Laplacian {mn:.0f} vs old cut {mo:.0f}'), new


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
                flags.append({'clip': c['id'], 'shot': c['shot'], 'issue': f'trailer footage not captured in ?cinema=1 ({url}): relies on the camera crop; the pixel scan decides', 'severity': 'warn'})
            if m.get('options', {}).get('cursor') and e['video'] == 'trailer' and c['shot'] not in ('tr_title_peek', 'tr_peek_beam'):
                flags.append({'clip': c['id'], 'shot': c['shot'], 'issue': 'cursor visible (unscripted?)', 'severity': 'warn'})
    seen = {}
    for x in hits:
        seen.setdefault((x['template']), []).append(x['frame'])
    hard = [f for f in flags if f.get('severity') != 'warn']
    return gate('clean', not hits and not hard, {'template_hits': hits, 'capture_flags': flags},
                f'{len(hits)} watermark/badge/debug hits {dict((k, len(v)) for k, v in seen.items())}; {len(hard)} capture-mode issues')


WIN_TOL = 0.5  # LU of measurement tolerance on each side of a cue's window


def cue_window_check(q):
    """(ok, reason) for one featured cue against its own window in the mixreport
    (window_lu = [lo, hi] LU over the music at the cue's loudest 400 ms; margin_lu = achieved).
    Cues without a numeric window (quiet answer, hit in true silence) are judged by the mixer's own rule
    (`pass`), and listed as documented exceptions."""
    w, m = q.get('window_lu'), q.get('margin_lu')
    if w is None or m is None:
        return bool(q.get('pass', False)), f'exception: {q.get("window_rule", "no window")}'
    lo, hi = w
    if m < lo - WIN_TOL:
        return False, f'{m:+.1f} LU below its window {lo:+g}..{hi:+g}'
    if m > hi + WIN_TOL:
        return False, f'{m:+.1f} LU above its window {lo:+g}..{hi:+g}'
    return True, f'{m:+.1f} in {lo:+g}..{hi:+g}'


def g_loudness(final, rep):
    """Integrated -14 +-0.5 LUFS and true peak <= the mix's ceiling (-1.5 dBTP after the Critic's sound fix 9;
    -1.0 if the report has none), measured on the DELIVERED file. Featured cues: each inside its own
    window from the mixreport (music-first trailer mix, docs/VIDEO_SOUND.md); the old blanket >= 6 LU rule
    applies only to the ducking presets (mechanic/showcase), whose rows carry no window."""
    r = ff(['-i', final, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    s = r.stderr[r.stderr.rfind('Summary:'):]
    I = re.search(r'I:\s+(-?[\d.]+) LUFS', s)
    TP = re.search(r'Peak:\s+(-?[\d.]+) dBFS', s)
    I = float(I.group(1)) if I else None
    TP = float(TP.group(1)) if TP else None
    lz = (rep or {}).get('loudness') or {}
    tp_ceiling = -1.5 if (rep or {}).get('mode') == 'music_first' else lz.get('tp_ceiling_dbtp', -1.0)
    feat = [q for q in (rep or {}).get('cues', []) if q.get('featured') and 'margin_lu' in q]
    windowed = any(q.get('window_lu') is not None for q in feat)
    bad, exc = [], []
    for q in feat:
        if windowed:
            ok_q, why = cue_window_check(q)
            if why.startswith('exception'):
                exc.append({'cue': q.get('id'), 'name': q['name'], 'frame': q['frame'], 'rule': q.get('window_rule'), 'pass': ok_q})
        else:
            ok_q, why = q['margin_lu'] >= 6, f'{q["margin_lu"]:+.1f} LU (need >= 6)'
        if not ok_q:
            bad.append({'cue': q.get('id'), 'name': q['name'], 'frame': q['frame'], 'rule': q.get('window_rule'), 'why': why})
    # target: the mix's own documented preset target (trailer -14; the explainer presets -16, docs/VIDEO_SOUND.md §13),
    # the same rule mix_gates.py applies; -14 (the Bible) when the report has none
    target = lz.get('target_lufs', -14.0)
    ok = I is not None and abs(I - target) <= 0.5 and TP is not None and TP <= tp_ceiling and not bad
    if (rep or {}).get('placeholder'):
        return gate('loudness', ok, {'integrated_lufs': I, 'true_peak_dbtp': TP}, f'PLACEHOLDER mix (I={I}, TP={TP}): not judged', status='BLOCKED')
    rule = 'per-cue windows' if windowed else '>= 6 LU'
    return gate('loudness', ok, {'integrated_lufs': I, 'target_lufs': target, 'true_peak_dbtp': TP, 'tp_ceiling': tp_ceiling, 'rule': rule,
                                 'featured_cues': len(feat), 'outside_window': bad, 'documented_exceptions': exc},
                f'I={I} LUFS (target {target}), TP={TP} dBTP (ceiling {tp_ceiling}); {len(feat) - len(bad)}/{len(feat)} featured cues pass ({rule}), '
                f'{len(exc)} documented exceptions')


def g_loudness_curve(e, rep, cs):
    """Critic (music review, change 7): on the music bed: the build rises monotonically (per-bar RMS
    non-decreasing within 1 dB); drop >= build average + 6 dB and >= build peak + 4 dB; payoff >= montage
    average + 2 dB; proof bed >= 6 dB under the montage."""
    if e['video'] != 'trailer':
        return gate('loudness_curve', True, {}, 'trailer only', status='N/A')
    # the Critic's curve is gated on the music BED (agreed in docs/VIDEO_SOUND.md: the ducked stem and the full mix
    # fail by design because the SFX fill the proof); the mix's own curve numbers are attached as information
    src = e['audio'].get('music') or ((rep or {}).get('stems') or {}).get('music')
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
    res['info_mix_curves'] = {k: v.get('pass') for k, v in ((rep or {}).get('loudness_curve') or {}).items() if isinstance(v, dict)}
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
    """Proof-section SFX (Director ruling, music-first mix): every featured cue in the proof section is inside its
    own window (proof cues +3..+5 LU over the music) AND audible: >= +3 LU over the music at its moment, or its
    window's own floor when that is lower (card accents -6). The QUIET answer must sit under its BEEP (mixer
    rule). The old absolute -16 LUFS-M floor is retired. The mix's short-term peak is reported for information."""
    if e['video'] != 'trailer':
        return gate('proof_sfx', True, {}, 'trailer only', status='N/A')
    secs = {s_['name']: (s_['start'], s_['end']) for s_ in e.get('sections', [])}
    if 'proof' not in secs or not rep:
        return gate('proof_sfx', False, {}, 'no proof section / mixreport', status='BLOCKED')
    a, b = secs['proof']
    cues = [q for q in rep.get('cues', []) if q.get('featured') and a <= q['frame'] < b]
    rows, bad = [], []
    for q in cues:
        ok_w, why = cue_window_check(q)
        w, m = q.get('window_lu'), q.get('margin_lu')
        floor = min(3.0, w[0]) if w else None
        audible = True if (w is None or m is None) else m >= floor - WIN_TOL
        rows.append({'frame': q['frame'], 'name': q['name'], 'rule': q.get('window_rule'), 'margin_lu': m, 'window_lu': w,
                     'audible_floor': floor, 'in_window': ok_w, 'audible': audible})
        if not (ok_w and audible):
            bad.append({'frame': q['frame'], 'name': q['name'], 'why': why if not ok_w else f'{m:+.1f} LU under the audible floor {floor:+g}'})
    st = None
    mix = rep.get('mix')
    if mix and os.path.exists(E.rel(mix)):
        r = subprocess.run(['ffmpeg', '-v', 'error', '-threads', T, '-i', E.rel(mix), '-af',
                            f'atrim={a / FPS}:{b / FPS},ebur128=metadata=1,ametadata=print:key=lavfi.r128.S:file=-', '-f', 'null', '-'],
                           capture_output=True, text=True)
        vals = [float(x) for x in re.findall(r'lavfi\.r128\.S=(-?[\d.]+)', r.stdout)]
        st = max(vals) if vals else None
    ok = bool(cues) and not bad
    ms = [r_['margin_lu'] for r_ in rows if r_['margin_lu'] is not None and r_['rule'] == 'proof cue window']
    return gate('proof_sfx', ok, {'cues': rows, 'failing': bad, 'info_mix_short_term_peak': st},
                f'{len(cues)} proof cues, {len(bad)} outside window/inaudible; proof-cue margins '
                f'{min(ms) if ms else None:+}..{max(ms) if ms else None:+} LU (window +3..+5); info: mix short-term peak {st and round(st, 1)} LUFS')


def g_mix_analysis(e, wd, rep=None, sync_ok=False):
    """The Sound Designer's tools/video/audio/mix_gates.py (9 gates on the delivered mix) + freshness:
    the mixreport must be newer than the EDL, and the delivered mp4's audio must be the current mix.wav."""
    mg = E.rel('tools/video/audio/mix_gates.py')
    if not os.path.exists(mg):
        return gate('mix_analysis', False, {}, 'mix_gates.py missing', status='BLOCKED')
    r = subprocess.run([sys.executable, mg, wd], capture_output=True, text=True)
    d = {}
    jp = os.path.join(wd, 'mix_gates.json')
    if os.path.exists(jp):
        d = json.load(open(jp))
    mix, rep_p = E.rel(e['audio']['mix']), E.rel(e['audio'].get('mixreport') or '')
    edl_t = os.path.getmtime(E.rel(e.get('_path', f'tools/video/edl/{e["video"]}.edl.json')))
    fresh = {'mixreport_newer_than_edl': bool(rep_p and os.path.exists(rep_p) and os.path.getmtime(rep_p) >= edl_t)}
    final = E.rel(e['outputs'][0]['path'])
    if os.path.exists(final) and os.path.exists(mix):
        fresh['final_muxed_after_mix'] = os.path.getmtime(final) >= os.path.getmtime(mix)
        ri = os.path.join(wd, 'render.json')
        if os.path.exists(ri):
            fresh['render_audio'] = json.load(open(ri)).get('audio')
    # content-based freshness: an EDL saved after the mix (e.g. a caption-only edit) is fine as long as the mix
    # still matches the current timeline: same duration, and every cue lands on the EDL-mapped frame (av_sync +
    # every_event both PASS on the current EDL). Only a timing change makes the mix stale.
    fresh['mix_matches_current_timeline'] = bool(rep and rep.get('duration_frames') == e['duration'] and sync_ok)
    stale = not fresh['mixreport_newer_than_edl'] and not fresh['mix_matches_current_timeline']
    ok = r.returncode == 0 and not stale and fresh.get('final_muxed_after_mix', False)
    fails = [k for k, v in (d.get('gates') or d).items() if isinstance(v, dict) and v.get('pass') is False] if isinstance(d, dict) else []
    return gate('mix_analysis', ok, {'mix_gates': d, 'freshness': fresh, 'stdout': r.stdout[-600:]},
                f'mix_gates.py {"PASS" if r.returncode == 0 else "FAIL " + str(fails)}; freshness {fresh}')


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


def audio_gates(e, a, wd, final, proxy, rep, cs, gates, P):
    """Audio-swap QA: the picture is byte-identical to a QA'd render, so only the audio gates run."""
    tag = e.get('work_name', e['video'])
    vstream = lambda p: subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames,codec_name,width,height',
                                        '-of', 'csv=p=0', p], capture_output=True, text=True).stdout.strip()
    fresh = {'final': os.path.relpath(final, E.ROOT), 'video_stream': vstream(final) if os.path.exists(final) else None}
    gates.append(gate('freshness', os.path.exists(final), fresh, f'{fresh["final"]}: {fresh["video_stream"]}'))
    gates.append(g_music_gate(e))
    gates += [g_av(e, rep), g_every_event(e, rep)]
    gates.append(g_loudness(final, rep))
    gates.append(g_loudness_curve(e, rep, cs))
    gates.append(g_proof_sfx(e, rep))
    sync_ok = all(g['status'] == 'PASS' for g in gates if g['gate'] in ('av_sync', 'every_event'))
    gates.append(g_mix_analysis(e, wd, rep, sync_ok))
    if 'reencode' not in set(filter(None, a.skip.split(','))):
        sf = sample_frames(e, 10)
        nf = sample_frames(e, 8, 'night')
        base = sharpness(final, sf)
        gates.append(g_reencode(e, final, wd, sf, nf, base))
    bad = [g['gate'] for g in gates if g['status'] in ('FAIL', 'BLOCKED')]
    overall = 'FAIL' if bad else 'PASS'
    report = {'video': e['video'], 'variant': tag, 'mode': 'audio-only', 'edl': a.edl, 'final': os.path.relpath(final, E.ROOT),
              'mixreport': e['audio'].get('mixreport'), 'overall': overall, 'gates': list(gates)}
    os.makedirs(REVIEW, exist_ok=True)
    jp = os.path.join(REVIEW, f'{tag}_audio_qa.json')
    json.dump(report, open(jp, 'w'), indent=1, default=str)
    md = [f'# Audio QA: {tag}  ->  {overall}', '', f'final: `{report["final"]}` · mix: `{e["audio"]["mix"]}` · picture gates carry over from the signed-off render', '',
          '| gate | status | summary |', '|---|---|---|'] + [f'| {g["gate"]} | {g["status"]} | {g["summary"]} |' for g in gates]
    open(os.path.join(REVIEW, f'{tag}_audio_qa.md'), 'w').write('\n'.join(md) + '\n')
    print('\n'.join(md))
    P.output(os.path.join(REVIEW, f'{tag}_audio_qa.md'), 'audio QA table')
    P.done(overall + (f' ({", ".join(bad)})' if bad else ''))
    sys.exit(0 if overall == 'PASS' else 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('edl')
    ap.add_argument('--skip', default='')
    ap.add_argument('--audio-only', action='store_true', help='audio swap: only the audio gates (+ freshness); picture gates carry over')
    ap.add_argument('--variant', help='derived EDL tag, e.g. trailer_public: work dir, mix, mixreport, music bed and final from videos/final/work/<tag>/')
    ap.add_argument('--music', help='with --variant: the music bed (for music_gate / loudness_curve)')
    a = ap.parse_args()
    skip = set(filter(None, a.skip.split(',')))
    e = E.load(a.edl)
    e['_path'] = a.edl
    if a.variant:  # same picture/EDL, different mix (e.g. the public-domain score cut)
        v = a.variant
        e['work_name'] = v
        e['audio'] = dict(e['audio'], mix=f'videos/final/work/{v}/mix.wav', mixreport=f'videos/final/work/{v}/mixreport.json',
                          stems=f'videos/final/work/{v}/stems')
        if a.music:
            e['audio']['music'] = a.music
        for o in e['outputs']:
            d, b = os.path.split(o['path'])
            o['path'] = os.path.join(d, b.replace(e['video'], v, 1))
    wd = E.rel(f'videos/final/work/{e.get("work_name", e["video"])}')
    final = E.rel(e['outputs'][0]['path'])
    proxy = os.path.join(wd, 'qa_proxy.mp4')
    ri = json.load(open(os.path.join(wd, 'render.json'))) if os.path.exists(os.path.join(wd, 'render.json')) else {}
    cs = E.load_cue_sheet(e['cue_sheet']) if e.get('cue_sheet') and os.path.exists(E.rel(e['cue_sheet'])) else None
    rep, rep_p = load_mixreport(e, ri)
    sys.path.insert(0, os.path.join(HERE, '..', 'progress'))
    from progress import Progress
    tag = e.get('work_name', e['video'])
    P = Progress(f'qa:{tag}', title=f'QA gates: {tag}', total=16, unit='gates')

    class Gates(list):  # every appended gate ticks the progress board
        def append(self, g):
            super().append(g)
            P.tick(len(self), stage=f'{g["gate"]}: {g["status"]}', force=True)

        def __iadd__(self, gs):
            for g in gs:
                self.append(g)
            return self
    gates = Gates()
    if a.audio_only:
        audio_gates(e, a, wd, final, proxy, rep, cs, gates, P)
        return
    gates += [g_edl(e), g_music_gate(e)]
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
        gates.append(g_dark(e, final))
        sf = sample_frames(e, 10)
        gs, base = g_sharpness(e, final, sf, proxy)
        gates.append(gs)
        nf = sample_frames(e, 8, 'night')
        gb, _ = g_banding(e, final, nf)
        gates.append(gb)
        if 'clean' not in skip:
            gates.append(g_clean(e, final))
        gates.append(g_loudness(final, rep))
        gates.append(g_loudness_curve(e, rep, cs))
        gates.append(g_proof_sfx(e, rep))
        sync_ok = all(g['status'] == 'PASS' for g in gates if g['gate'] in ('av_sync', 'every_event'))
        gates.append(g_mix_analysis(e, wd, rep, sync_ok))  # every video (Director)
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
    P.output(os.path.join(REVIEW, f'{tag}_qa.md'), 'QA table')
    P.output(jp, 'QA details (json)')
    bad = [g['gate'] for g in gates if g['status'] in ('FAIL', 'BLOCKED')]
    P.done(report['overall'] + (f' ({", ".join(bad)})' if bad else ''))
    sys.exit(0 if report['overall'].startswith('PASS') else 1)


if __name__ == '__main__':
    main()
