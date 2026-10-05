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
TRANS_FRAMES = {'shatter': (10, 14), 'glitch': (4, 8), 'blanket-wipe': (16, 20), 'blanket-title': (60, 84)}  # baked-in Motion transitions are clip content


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
            for kk in ('matte', 'overlay'):  # declared Motion files must exist before a render
                v = tr.get(kk)
                for pth in ([v] if isinstance(v, str) else list(v.values()) if isinstance(v, dict) else []):
                    if pth and not os.path.exists(E.rel(pth)):
                        (err if strict else warn).append(f'{cid}: {t} {kk} not on disk yet: {pth}')
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
                    for win in [dict(w0, src=k[1]) for w0 in (c.get('windows') or []) for k in (w0.get('keys') or [[0, w0['src']]])]:
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
            if c.get('card_focus'):  # a close-up ON a card's help page (Card Guide anatomy): the card is the subject
                continue
            if c.get('windows'):
                if not any(wn.get('name') == 'bot_code' for wn in c['windows']):
                    err.append(f'{c["id"]}: split screen without a bot_code window; REVISED 2 needs the program visible')
                continue
            worst, worst_w, worst_h = 1.0, 1.0, 1.0
            for f in range(0, c['dur'], 15):
                z, cx, cy = E.camera_at(c['camera'], f)
                x0, y0, x1, y1 = E.view_box(sw, sh, aw, ah, z, cx, cy)
                iw_, ih_ = max(0, min(x + w, x1) - max(x, x0)), max(0, min(y + hh, y1) - max(y, y0))
                worst = min(worst, iw_ * ih_ / (w * hh))
                worst_w, worst_h = min(worst_w, iw_ / w), min(worst_h, ih_ / hh)
            if c.get('focus'):
                # Critic mechanic #8: on a pushed normal-layout take the rule is "the lit card and the actor are both
                # in view" from the action frame to the clip's end (the boxes are capture CSS px)
                fo = c['focus']
                for f in range(fo['frame'], c['dur'], 6):
                    z, cx, cy = E.camera_at(c['camera'], f)
                    x0, y0, x1, y1 = E.view_box(sw, sh, aw, ah, z, cx, cy)
                    for nm, bb in fo['boxes'].items():
                        if not bb:
                            continue
                        bx0, by0, bx1, by1 = bb[0] * k, bb[1] * k, (bb[0] + bb[2]) * k, (bb[1] + bb[3]) * k
                        if bx0 < x0 - 1 or by0 < y0 - 1 or bx1 > x1 + 1 or by1 > y1 + 1:
                            err.append(f'{c["id"]}: focus box {nm} leaves the view at local f{f} ({c["shot"]})')
                            break
                    else:
                        continue
                    break
                if fo['z'] < 1.25:
                    warn.append(f'{c["id"]}: push-in {fo["z"]}x < 1.25 (the focus boxes only fit at {fo["zfit"]}x)')
                continue
            if c.get('program_focus'):
                # a close-up ON the program (e.g. the decoder being written): the editor's full width and at least
                # half its height (the part being edited) must stay in view
                if worst_w < 0.98 or worst_h < 0.5:
                    err.append(f'{c["id"]}: program_focus close-up shows the editor {worst_w:.0%} wide x {worst_h:.0%} tall '
                               f'({c["shot"]}); needs >= 98% x >= 50%')
            elif worst < 0.98:
                err.append(f'{c["id"]}: the editor is only {worst:.0%} in view ({c["shot"]}); REVISED 2 needs the program visible')
    if vid in ('mechanic', 'showcase'):
        # REVISED #5 / lesson: never two texts. While an in-game dialogue line is on screen (capture layout.json
        # '.dialogue', mapped through the edit; split windows only count if their crop contains the box) the strip
        # may carry only a '= real term' chip, not a sentence.
        talk = []
        for c in clips:
            lj = c.get('layout_json')
            if c['src'].startswith('@') or not lj or not os.path.exists(E.rel(lj)):
                continue
            boxes = [(g['from'], g['to'], g['rects'][0]) for g in E.load_json(lj).get('segments', []) if g['sel'] == '.dialogue' and g.get('rects')]
            for f0, f1, (bx, by, bw, bh) in boxes:
                if c.get('windows'):
                    room = next((wn for wn in c['windows'] if wn.get('name') == 'room'), None)
                    if not room:
                        continue
                    rx, ry, rw, rh = room['src'][0] * 1920, room['src'][1] * 1080, room['src'][2] * 1920, room['src'][3] * 1080
                    if bx + bw <= rx or bx >= rx + rw or by + bh <= ry or by >= ry + rh:
                        continue  # the box is cropped out of the room window
                # the whole on-screen interval of the line (not just its endpoints), clipped to the clip
                a_, b_ = max(f0, c['in']), min(f1, c['out'] - 1)
                if a_ > b_:
                    continue
                m = c['_map']
                shown = [c['start'] + i for i, sf in enumerate(m) if a_ <= sf <= b_]
                if shown:
                    talk.append((shown[0], shown[-1]))
        for cap in e['captions']:
            if cap.get('position') != 'strip' or not cap.get('line') or cap.get('label'):
                continue
            hit = [t0 for t0, t1 in talk if t0 < cap['end'] and t1 >= cap['legible_from']]
            if hit:
                err.append(f'{cap["id"]}: sentence "{cap["line"][:36]}" overlaps an in-game dialogue line at f{max(hit[0], cap["legible_from"])} '
                           f'(never two texts: use a "= term" chip there)')
        # no duplicate content inside one explainer: the same shot's source ranges must not overlap
        # (a deliberate reuse is marked on the later clip with reuse_ok: "why")
        by_src = {}
        for c in clips:
            if c['src'].startswith('@') or c.get('reuse_ok'):
                continue
            for d in by_src.get(c['src'], []):
                if c['in'] < d['out'] and d['in'] < c['out']:
                    err.append(f'{c["id"]}: shows {c["shot"]} src {c["in"]}-{c["out"]}, already shown by {d["id"]} '
                               f'({d["in"]}-{d["out"]}): duplicate content (mark reuse_ok if deliberate)')
            by_src.setdefault(c['src'], []).append(c)
    for dr in e.get('dark_ranges', []):  # night phases the QA dark gate must find dark on every rendered frame
        host = [c for c in clips if c['start'] <= dr['start'] and dr['end'] <= c['start'] + c['dur']]
        if not host:
            err.append(f'dark range {dr["start"]}-{dr["end"]} is not inside one clip')
        if not (0 < dr.get('ceiling', 0) < 255) or len(dr.get('region', [])) != 4:
            err.append(f'dark range {dr["start"]}-{dr["end"]}: needs a ceiling (0-255) and a region [x, y, w, h]')
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

    if e.get('strip_overlay'):  # the paper strip + strip captions come from motion_captions.py (mechanic QA, Oct 5:
        # a plans.py rebuild without that step rendered bare ink text on the dark extension, unreadable)
        bare = [c['id'] for c in e['captions'] if c.get('position') == 'strip' and not isinstance(c.get('render'), dict)]
        if bare or not any(o.get('id') == 'caption_strip' for o in e['overlays']):
            err.append(f'strip_overlay is set but {len(bare)} strip caption(s) are unconverted'
                       f'{"" if any(o.get("id") == "caption_strip" for o in e["overlays"]) else " and the caption_strip overlay is missing"}:'
                       f' run tools/video/assemble/motion_captions.py {e["video"]} EDL after plans.py')
    # captions
    caps = sorted(e['captions'], key=lambda c: c['start'])
    seen_ids = [c.get('id') for c in caps]
    for d in sorted({i for i in seen_ids if seen_ids.count(i) > 1}):
        err.append(f'caption id {d} is used {seen_ids.count(d)} times')
    labels = [c for c in caps if c.get('label')]  # HUD-style tags (e.g. "X-ray · simulator view"): exempt below
    caps = [c for c in caps if not c.get('label')]
    # Critic §4.3 set 7; the Critic's song-cut review (fix 3) added 3 rule-stating hook captions -> 10
    tmax = 7 + sum(1 for c in caps if c.get('hook'))
    if vid == 'trailer' and len(caps) > tmax:
        err.append(f'{len(caps)} text events in the trailer (max {tmax})')
    for lb in labels:
        if lb['end'] <= lb['start']:
            err.append(f'{lb.get("id")}: label end <= start')
    for cp in e['captions']:  # pre-rendered (Motion) captions/labels: their files must exist before a render
        r = cp.get('render')
        if isinstance(r, dict):
            for k in ('fill', 'matte', 'src'):
                if r.get(k) and not os.path.exists(E.rel(r[k])):
                    (err if strict else warn).append(f'{cp.get("id")}: {k} not on disk yet: {r[k]}')
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
