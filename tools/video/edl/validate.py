#!/usr/bin/env python3
"""Validate an np-edl/1 EDL. Exit 1 on any error.

usage: validate.py tools/video/edl/trailer.edl.json [--strict]
  --strict  missing source files are errors (default: warnings while upstream
            assets are pending; placeholders are reported as such).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edl as E  # noqa: E402

TARGET_S = {'trailer': (60, 80), 'mechanic': (140, 160), 'showcase': (225, 255)}
READ_BASE_S, READ_PER_CHAR_S = 1.6, 0.040
CAPTION_POS = {'trailer': {'top_third', 'center', 'card', 'baked'}, 'mechanic': {'strip', 'baked'}, 'showcase': {'strip', 'baked'}}
TRANS_FRAMES = {'shatter': (10, 14), 'glitch': (4, 8), 'blanket-wipe': (16, 20)}  # baked-in Motion transitions are clip content


def reading_frames(text, fps=60, video=None):
    """Strip captions (mechanic/showcase): 1.6 s + 40 ms/char (bible). Trailer cards: the Critic's
    max(1.2 s, 0.3 s/word + 0.4 s) (docs/VIDEO_CRITIQUE.md §7.5, which the music/motion timings were built on).
    Both counted from full legibility."""
    if video == 'trailer':
        return int(round(max(1.2, 0.3 * len(text.split()) + 0.4) * fps))
    return int(round((READ_BASE_S + READ_PER_CHAR_S * len(text)) * fps))


def validate(e, strict=False, check_sources=True):
    err, warn = [], []
    vid = e.get('video')
    fps = e.get('fps', 60)
    if e.get('schema') != E.SCHEMA:
        err.append(f"schema must be {E.SCHEMA}")
    if vid not in E.ALLOWED:
        err.append(f"video must be one of {sorted(E.ALLOWED)}")
        return err, warn
    if fps != 60:
        err.append('fps must be 60')
    if not e.get('work') or not e.get('outputs'):
        err.append('work size and outputs are required')
    if e.get('layout') not in ('cinema', 'strip'):
        err.append('layout must be cinema|strip')
    if vid == 'trailer' and e.get('layout') != 'cinema':
        err.append('trailer uses the cinema layout (REVISED #1)')
    if vid != 'trailer' and e.get('layout') != 'strip':
        err.append(f'{vid} uses the fixed bottom-12% caption strip (REVISED #5)')
    lo, hi = TARGET_S[vid]
    dur_s = e['duration'] / fps
    if not (lo <= dur_s <= hi):
        warn.append(f'duration {dur_s:.2f}s outside the {lo}-{hi}s target')

    clips = e['clips']
    ids = set()
    once = {}
    for i, c in enumerate(clips):
        cid = c.get('id', f'#{i}')
        if cid in ids:
            err.append(f'{cid}: duplicate id')
        ids.add(cid)
        for k in ('shot', 'src', 'start', 'in'):
            if k not in c:
                err.append(f'{cid}: missing {k}')
        if c['dur'] <= 0:
            err.append(f'{cid}: zero duration')
        if c['in'] < 0 or c['out'] <= c['in']:
            err.append(f'{cid}: bad in/out {c["in"]}..{c["out"]}')
        sp = c['speed']
        vals = [sp] if isinstance(sp, (int, float)) else [k[1] for k in sp['keys']]
        if any(v <= 0 for v in vals):
            err.append(f'{cid}: speed must be > 0 (use intentional_hold + a still for freezes)')
        tr = c['transition']
        t = tr['type']
        if t not in E.TRANSITIONS:
            err.append(f'{cid}: unknown transition {t}')
            continue
        if t not in E.ALLOWED[vid]:
            err.append(f'{cid}: transition {t} not allowed in the {vid} (REVISED #3)')
        once[t] = once.get(t, 0) + 1
        if t in TRANS_FRAMES:
            a, b = TRANS_FRAMES[t]
            if not (a <= tr['frames'] <= b):
                err.append(f'{cid}: {t} must be {a}-{b} frames (got {tr["frames"]})')
            if t != 'glitch' and not tr.get('matte') and not tr.get('overlay'):
                warn.append(f'{cid}: {t} has no Motion Designer matte/overlay yet (procedural placeholder)')
        if t in ('xray-dissolve', 'relight') and not c.get('scdet_exempt'):
            warn.append(f'{cid}: in-engine {t} should declare scdet_exempt over the dissolve')
        if i == 0:
            if c['start'] != 0:
                err.append(f'{cid}: first clip must start at 0')
            if t != 'cut':
                err.append(f'{cid}: first clip cannot have a transition')
        else:
            p = clips[i - 1]
            ov = tr['frames'] if E.TRANSITIONS[t][0] else 0
            want = p['end'] - ov
            if c['start'] != want:
                err.append(f'{cid}: starts at {c["start"]}, expected {want} (prev {p["id"]} ends {p["end"]}, overlap {ov})'
                           + (' GAP' if c['start'] > want else ' OVERLAP'))
            if ov and min(p['dur'], c['dur']) < ov:
                err.append(f'{cid}: clips shorter than the {t} overlap')
        # sources and the upscale guard
        src = c.get('src', '')
        if not src.startswith('@'):
            p_src = E.rel(src)
            if not os.path.exists(p_src):
                (err if strict else warn).append(f'{cid}: source missing: {src}')
            elif check_sources:
                w, h, n, sfps = E.probe(src)
                if c['out'] > n:
                    (warn if 'capture_placeholder' in src else err).append(
                        f'{cid}: out {c["out"]} beyond source length {n} ({src})' + (' [stale placeholder]' if 'capture_placeholder' in src else ''))
                if abs(sfps - fps) > 0.01:
                    err.append(f'{cid}: source fps {sfps} != {fps}')
                for out in e['outputs']:
                    cap = out.get('zoom_cap', e.get('zoom_cap', 1.8))
                    aw, ah = E.game_area(e, out['size'])[2:]
                    master = out is not e['outputs'][0]
                    waived = c.get('punch_native') and master
                    for k in c['camera']:
                        z = k.get('z', 1.0)
                        x0, y0, x1, y1 = E.view_box(w, h, aw, ah, z, k.get('cx', .5), k.get('cy', .5))
                        eff = (x1 - x0) / aw
                        if eff < 0.999:
                            (warn if waived else err).append(f'{cid}: UPSCALE at f{k["f"]} z={z} for {out["name"]}: {x1-x0:.0f}px source -> {aw}px ({eff:.2f}x)'
                                                             + (' [punch_native waiver: master only]' if waived else ''))
                    for win in c.get('windows') or []:
                        box, (dx, dy, dw, dh) = E.window_boxes(win, w, h, out['size'][0])
                        eff = (box[2] - box[0]) / dw
                        if eff < 0.999:  # same master-only waiver as the punch-ins: the 1080p delivery must stay native
                            (warn if waived else err).append(f'{cid}: UPSCALE in split window dst {win["dst"]} for {out["name"]}: {box[2]-box[0]:.0f}px source -> {dw}px ({eff:.2f}x)'
                                                             + (' [punch_native waiver: master only]' if waived else ''))
                    if c.get('windows'):
                        continue
                    if E.max_zoom(c) > cap + 1e-6 and not c.get('punch_native'):
                        err.append(f'{cid}: push-in {E.max_zoom(c)}x exceeds the {cap}x cap for {out["name"]}')
                    elif E.max_zoom(c) > cap + 1e-6:
                        warn.append(f'{cid}: punch_native {E.max_zoom(c)}x over the {cap}x cap for {out["name"]} (Critic fix 4; 1080p stays native)')
                if 'placeholder' in src:
                    warn.append(f'{cid}: PLACEHOLDER source {src}')
        if any(k.get('z', 1) < 1 for k in c['camera']):
            err.append(f'{cid}: zoom < 1 is not allowed (would show outside the frame)')
        if c['flags']['on_beat'] and not e.get('cue_sheet'):
            err.append(f'{cid}: on_beat needs a cue_sheet')
        for cue in c['cues']:
            if not (c['start'] <= cue.get('frame', -1) < c['end'] + 30):
                warn.append(f'{cid}: cue {cue.get("name")} at {cue.get("frame")} outside the clip')

    if e.get('program_visible'):
        # REVISED 2: whenever the room acts, the program is on screen: the capture's .editor box must stay inside the view
        for c in clips:
            lj = c.get('layout_json')
            if c['src'].startswith('@') or not lj or not os.path.exists(E.rel(lj)) or not os.path.exists(E.rel(c['src'])):
                continue
            segs = [g for g in E.load_json(lj).get('segments', []) if g['sel'] == '.editor']
            if not segs:
                continue
            sw, sh, _, _ = E.probe(c['src'])
            k = sw / 1920
            aw, ah = E.game_area(e)[2:]
            x, y, w, hh = [v * k for v in segs[0]['rects'][0]]
            worst = 1.0
            for f in range(0, c['dur'], 15):
                z, cx, cy = E.camera_at(c['camera'], f)
                x0, y0, x1, y1 = E.view_box(sw, sh, aw, ah, z, cx, cy)
                ix = max(0, min(x + w, x1) - max(x, x0)) * max(0, min(y + hh, y1) - max(y, y0))
                worst = min(worst, ix / (w * hh))
            if worst < 0.98:
                err.append(f'{c["id"]}: the editor is only {worst:.0%} in view ({c["shot"]}); REVISED 2 needs the program visible')
    for t, n in ONCE_LIMITS(vid).items():
        if once.get(t, 0) > n:
            err.append(f'{t} used {once[t]}x; allowed {n}x (REVISED #3)')
    if e['clips'] and e['clips'][-1]['end'] != e['duration']:
        err.append(f'last clip ends at {e["clips"][-1]["end"]}, duration is {e["duration"]}')

    # cuts and the cue sheet
    cuts = E.cut_list(e)
    cs = None
    if e.get('cue_sheet'):
        if os.path.exists(E.rel(e['cue_sheet'])):
            cs = E.load_cue_sheet(e['cue_sheet'], fps)
        else:
            (err if strict else warn).append(f'cue sheet missing: {e["cue_sheet"]}')
    if cs:
        for cut in cuts:
            if cut['on_beat']:
                b = E.nearest(cs['beats'], cut['beat_frame'])
                if b is None or abs(b - cut['beat_frame']) > 1:
                    err.append(f'{cut["clip"]}: on_beat cut at {cut["beat_frame"]} is {cut["beat_frame"]-(b or 0):+d} frames off the nearest beat {b}')
    if cs and vid == 'trailer' and str(cs['raw'].get('meter', '')).startswith('3/'):
        # waltz rules (Critic, music review): cuts on the grid only (no half-bar cuts); never cut on beat 2 alone:
        # a beat-2 cut must sit inside a regular 1- or 2-beat run (hemiola / beat strobe)
        g = cs['raw'].get('grid', {})
        b0, bl = g.get('beat0_frame', cs['beats'][0]), cs['raw'].get('beat_frames', 32)
        ks = []
        for cut in cuts:
            f = cut['beat_frame']
            k = (f - b0) / bl
            if abs(k - round(k)) * bl > 1:
                if cut.get('grid_waiver'):
                    warn.append(f'{cut["clip"]}: cut at f{f} off the beat grid: WAIVED ({cut["grid_waiver"].get("reason", "")})')
                else:
                    err.append(f'{cut["clip"]}: cut at f{f} is off the beat grid (no half-bar / off-beat cuts in 3/4)')
                continue
            ks.append((int(round(k)), cut['clip']))
        kset = [k for k, _ in ks]
        for k, cid in ks:
            if k % 3 == 1:
                prev = [x for x in kset if x < k]
                nxt = [x for x in kset if x > k]
                p_ok = prev and k - prev[-1] in (1, 2)
                n_ok = nxt and nxt[0] - k in (1, 2)
                if not (p_ok and n_ok):
                    err.append(f'{cid}: isolated cut on beat 2 (k={k}); only allowed inside a hemiola/beat run')
    want = ((cs or {}).get('raw', {}).get('cut_rules') or {}).get('montage_cut_frames') if cs and vid == 'trailer' else None
    if want and 'montage' in cs['sections']:
        a, b = cs['sections']['montage']
        have = sorted({c['start'] for c in e['clips'] if a <= c['start'] < b})
        if have != sorted(want):
            err.append(f'montage cuts {have} != cue sheet montage_cut_frames {sorted(want)}')
    if vid == 'trailer' and cuts:
        hard = sum(1 for c in cuts if c['type'] in ('cut', 'xray-dissolve', 'relight') and c['on_beat'])
        ratio = hard / len(cuts)
        if ratio < 0.8:
            err.append(f'only {ratio:.0%} of trailer cuts are hard cuts on the beat (need >= 80%)')

    # captions
    caps = sorted(e['captions'], key=lambda c: c['start'])
    labels = [c for c in caps if c.get('label')]  # HUD-style tags (e.g. "X-ray · simulator view"): exempt below
    caps = [c for c in caps if not c.get('label')]
    # Critic §4.3 set 7; the Critic's song-cut review (fix 3) added 3 rule-stating hook captions -> 10
    tmax = 7 + sum(1 for c in caps if c.get('hook'))
    if vid == 'trailer' and len(caps) > tmax:
        err.append(f'{len(caps)} text events in the trailer (max {tmax})')
    for lb in labels:
        if lb['end'] <= lb['start']:
            err.append(f'{lb.get("id")}: label end <= start')
    for k, cap in enumerate(caps):
        cid = cap.get('id', f'cap{k}')
        if cap['end'] <= cap['start']:
            err.append(f'{cid}: end <= start')
        lf = cap.get('legible_from', cap['start'])
        if not (cap['start'] <= lf < cap['end']):
            err.append(f'{cid}: legible_from outside the caption')
        need = reading_frames(cap['text'], fps, vid)
        have = cap['end'] - lf
        if vid == 'trailer' and have < reading_frames(cap['text'], fps):
            warn.append(f'{cid}: "{cap["text"][:30]}" readable {have/fps:.2f}s: meets the Critic trailer rule, not the bible 1.6 s + 40 ms/char ({reading_frames(cap["text"], fps)/fps:.2f}s)')
        if cap.get('label'):  # persistent HUD label (e.g. 'X-ray · simulator view'), not a caption to read once: exempt
            need = 0
        if have < need:
            err.append(f'{cid}: "{cap["text"][:40]}" readable for {have/fps:.2f}s, needs {need/fps:.2f}s (from full legibility)')
        if cap.get('position') not in CAPTION_POS[vid]:
            err.append(f'{cid}: position {cap.get("position")} not allowed in the {vid}')
        if vid == 'trailer' and len(cap['text'].split()) > 7 and k != len(caps) - 1 and not cap.get('closing_line'):
            warn.append(f'{cid}: more than 7 words')
        if k and caps[k - 1]['end'] > cap['start']:
            err.append(f'{cid}: overlaps {caps[k-1].get("id")}: never two texts at once (REVISED #5)')
        if cap['end'] > e['duration']:
            err.append(f'{cid}: runs past the end')
    for o in e['overlays']:
        for k in ('src', 'fill', 'matte'):
            if o.get(k) and not o[k].startswith('@') and not os.path.exists(E.rel(o[k])):
                (err if strict else warn).append(f'overlay {o.get("id")}: {k} missing: {o[k]}')
        if o['start'] + o['dur'] > e['duration']:
            err.append(f'overlay {o.get("id")}: runs past the end')
    for m in e['marks']:
        if m.get('type') not in ('black', 'flash', 'hold', 'dissolve', 'exempt'):
            err.append(f'mark {m}: bad type')
        if m['end'] <= m['start']:
            err.append(f'mark {m}: empty')
    return err, warn


def ONCE_LIMITS(vid):
    return E.ONCE.get(vid, {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('edl', nargs='+')
    ap.add_argument('--strict', action='store_true')
    a = ap.parse_args()
    bad = 0
    for p in a.edl:
        e = E.load(p)
        err, warn = validate(e, a.strict)
        print(f'== {p}: {e["video"]} {e["duration"]} frames ({e["duration"]/60:.2f}s), {len(e["clips"])} clips, '
              f'{len(e["captions"])} captions')
        for w in warn:
            print('  warn:', w)
        for x in err:
            print('  ERROR:', x)
        print('  ->', 'FAIL' if err else 'PASS')
        bad += bool(err)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
