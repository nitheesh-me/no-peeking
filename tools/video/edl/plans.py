#!/usr/bin/env python3
"""Cut plans for the three videos -> np-edl/1 EDLs.

usage: plans.py [trailer|mechanic|showcase|all] [--cue videos/music/cue_sheet.json]

* The trailer is laid out in BEATS per cue-sheet section (REVISED #2); its
  timing comes entirely from the Music Supervisor's cue sheet, so a new cue
  sheet re-cuts it with no code change. Items with fill=True absorb any
  difference between the plan's beat count and the song's section length.
* Mechanic and showcase are laid out in SECONDS (the Critic's tables).
* Shots resolve in order: tools/video/edl/shot_sources.json (manual alias ->
  real file), videos/capture/<id>.*, videos/motion/<id>.*, then the synthetic
  placeholder videos/capture_placeholder/<id>.mkv.
* Key events align to beats: align=("peek_collapse", 0) puts the first
  peek_collapse event of the shot exactly on the clip's beat 0.
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edl as E  # noqa: E402

FPS = 60
HERE = os.path.dirname(os.path.abspath(__file__))
PH_DIR = 'videos/capture_placeholder'
SYN_CUE = 'videos/final/work/synthetic_cue_sheet.json'

# ───────────────────────── shot registry ─────────────────────────
# id: (description for the Capture Engineer / Motion Designer, grade, kind,
#      placeholder seconds, placeholder events [(sec, type, name)])
# kind: cap = cinema capture, ui = full-UI capture (strip videos), mo = Motion Designer piece, pre = precomposed by me
R = {}


def shot(id, desc, grade='day', kind='cap', ph=8.0, ev=()):
    R[id] = dict(id=id, desc=desc, grade=grade, kind=kind, ph=ph, ev=list(ev))


# trailer (cinema=1)
shot('tr_cold_blanket', 'Extreme close-up: a blanketed Qubble breathing in moonlight (night, cinema)', 'night', ph=8)
shot('tr_peek_beam', 'Flashlight (PEEK) beam creeps across the floor to the blanket; the swirl collapses to one pole', 'night', ph=8,
     ev=[(5.0, 'sfx', 'peek_collapse')])
shot('tr_title_peek', 'Title screen: the cursor sweeps the letter-Qubbles, each collapses (pitched peek on 8ths)', 'day', ph=6,
     ev=[(0.5 + i * 0.3125, 'sfx', 'peek_collapse') for i in range(8)])
shot('tr_relight', 'Daycare wide, same framing: in-place relight day -> night, the moon rises', 'night', ph=6)
shot('tr_gremlin_flipper', 'Flipper as a silhouette in the doorway (night)', 'night', ph=3, ev=[(0.4, 'sfx', 'gremlin_sneak')])
shot('tr_gremlin_wobbles', 'Wobbles silhouette (night)', 'night', ph=3, ev=[(0.4, 'sfx', 'wobble')])
shot('tr_gremlin_phasey', 'Phasey silhouette, ghost shimmer (night)', 'night', ph=3, ev=[(0.4, 'sfx', 'ghost_phase')])
shot('tr_door_empty', 'The empty doorway (night)', 'night', ph=3)
shot('tr_dark_room', 'The dark room, blankets only, nothing moves but breathing (night)', 'night', ph=8)
shot('tr_bot_antenna', 'Bot antenna flashes red, full frame (the BEEP)', 'night', ph=3, ev=[(0.3, 'botNote', 'beep')])
shot('tr_proof', 'ONE continuous room, q2 in focus: gremlin flips q2 (only its blanket twitches) -> bots HIGHFIVE+LISTEN, '
     'one BEEP one quiet -> caretaker walks to q2 and BOOPs it, blanket untouched -> in-engine X-ray dissolve, dream intact, meter fills',
     'night', ph=14, ev=[(1.0, 'sfx', 'gremlin_flip'), (4.0, 'sfx', 'highfive'), (4.6, 'botNote', 'beep'), (5.0, 'botNote', 'quiet'),
                         (8.0, 'sfx', 'boop'), (10.5, 'mark', 'xray_start'), (11.5, 'sfx', 'test_pass')])
shot('mn_schrodi_checklist', 'Schrodi hops out of his box with the checklist', 'day', ph=4, ev=[(0.3, 'sfx', 'schrodi_meow')])
shot('mn_test_strip', 'Test strip filling check-check-check, filling the frame', 'day', ph=4, ev=[(0.2, 'sfx', 'test_pass')])
shot('mn_dream_map', 'Dream map: Flipper hits a tile, the map bots blink', 'day', ph=4, ev=[(0.2, 'sfx', 'gremlin_flip')])
shot('mn_highfive', 'HIGHFIVE sparks, close', 'day', ph=3, ev=[(0.2, 'sfx', 'highfive')])
shot('mn_listen', 'LISTEN: the bot beeps', 'day', ph=3, ev=[(0.2, 'botNote', 'beep')])
shot('mn_bloch', '3D Bloch inspector, full-frame sphere in the swirl colours', 'day', ph=3, ev=[(0.2, 'sfx', 'snap_measure')])
shot('mn_codex_hero', 'Codex hero insert: an isolated animation (bot high-five), panel chrome cropped', 'day', ph=3,
     ev=[(0.2, 'sfx', 'highfive')])
shot('mn_codex_flipper', 'Codex hero insert: Flipper pose (isolated, chrome cropped)', 'day', ph=2, ev=[(0.1, 'sfx', 'gremlin_flip')])
shot('mn_codex_schrodi', 'Codex hero insert: the Schrodi actor (isolated)', 'day', ph=2, ev=[(0.1, 'sfx', 'schrodi_meow')])
shot('mn_codex_qubble', 'Codex hero insert: a Qubble collapses (isolated)', 'day', ph=2, ev=[(0.1, 'sfx', 'peek_collapse')])
shot('mn_clone_glitch', 'The 1-3 clone glitch (photocopier), cinema', 'day', ph=2, ev=[(0.1, 'sfx', 'glitch')])
shot('mn_shor9', 'The Shor-9 room (4-1), nine Qubbles, cinema wide', 'night', ph=2)
shot('mn_lights_out', 'Lights Out: black screen, only the syndrome chord (played twice)', 'night', ph=4,
     ev=[(0.2, 'syndromeChord', 'chord'), (1.45, 'syndromeChord', 'chord')])
shot('tr_test_all', 'Snap back to light: the Test strip runs all nights', 'day', ph=5, ev=[(0.5, 'sfx', 'test_pass')])
shot('tr_morning_check', '"Morning check: perfect!" stars burst', 'day', ph=5, ev=[(0.5, 'sfx', 'level_win')])
shot('tr_curtain_call', 'Credits curtain call: Qubbles wake, gremlins bow, Schrodi steps out (stage only, no panels)', 'day', ph=6)
shot('tr_morning_still', 'Cosy, nearly still morning daycare; Qubbles snoring, Schrodi blinks once', 'day', ph=7,
     ev=[(1.0, 'sfx', 'qubble_snore')])
# motion (Motion Designer)
shot('mo_logo_reveal', 'Logo reveal: letters land as Qubbles and pop into the wordmark (the drop)', 'none', 'mo', ph=4)
shot('mo_circuit_morph', 'Bespoke: the player\'s cards morph into the real circuit (CNOTs, red X, syndrome)', 'none', 'mo', ph=12)
shot('mo_end_card', 'End card: logo assembles uncollapsed, quriosity 2026 - Option 06, the play URL', 'none', 'mo', ph=6)
shot('mo_syndrome_table', '4-row syndrome graphic: two bots, four answers, each pointing at one Qubble', 'none', 'mo', ph=16)
shot('mo_qiskit_stamp', '"Exports to Qiskit" stamp over the circuit', 'none', 'mo', ph=4)
# mechanic (full UI; the game sits at 88% above the caption strip)
shot('me_cold_blanket', 'Moonlit blanket, breathing (full UI hidden or cinema; framing for the strip layout)', 'night', 'ui', ph=8)
shot('me_11_peek', '1-1: PEEK -> collapse -> X-ray reveal of what was lost', 'day', 'ui', ph=20,
     ev=[(6.0, 'sfx', 'peek_collapse'), (11.0, 'mark', 'xray_start')])
shot('me_threat', 'Lights out, a gremlin strikes, one blanket twitches', 'night', 'ui', ph=16, ev=[(5.0, 'sfx', 'gremlin_flip')])
shot('me_encode', 'Schrodi\'s checklist: HIGHFIVEs share the dream across 3 Qubbles (silk threads in X-ray)', 'day', 'ui', ph=14,
     ev=[(3.0, 'sfx', 'highfive'), (6.0, 'sfx', 'highfive')])
shot('me_21_listen', '2-1 compressed: bot HIGHFIVEs two Qubbles, LISTEN -> BEEP', 'day', 'ui', ph=12,
     ev=[(3.0, 'sfx', 'highfive'), (6.0, 'botNote', 'beep')])
shot('me_23_night', '2-3 full night: IF a BEEP and b QUIET -> BOOP q1, the caretaker walks to it; then Test all, strip fills', 'night',
     'ui', ph=26, ev=[(4.0, 'sfx', 'gremlin_flip'), (8.0, 'botNote', 'beep'), (9.0, 'botNote', 'quiet'), (13.0, 'sfx', 'boop'),
                      (18.0, 'sfx', 'test_pass'), (20.0, 'sfx', 'test_pass'), (22.0, 'sfx', 'test_pass')])
shot('me_23_xray', 'X-ray replay of one night (clicked), inspector Bloch sphere shows the shared dream', 'night', 'ui', ph=16,
     ev=[(2.0, 'mark', 'xray_start')])
shot('me_31_phase', '3-1: Phasey\'s swirl flip, all bots quiet but the dream is wrong; the SPIN sandwich fix', 'night', 'ui', ph=18,
     ev=[(3.0, 'sfx', 'ghost_phase'), (11.0, 'sfx', 'test_pass')])
# showcase
LEVELS = ['0-1', '0-2', '1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3', '4-1', '4-2']
for lv in LEVELS:
    shot(f'sc_lv_{lv}', f'Level {lv} solved (full UI, verified solution, dialogue fast-forwarded)', 'night' if lv[0] != '0' else 'day', 'ui',
         ph=60, ev=[(10.0 + 8 * k, 'sfx', 'test_pass') for k in range(5)] + [(55.0, 'sfx', 'level_win')])
shot('sc_grid16', '4x4 grid: all 16 level solves at once (precomposed from sc_lv_*)', 'none', 'pre', ph=6)
shot('sc_title_peek', 'Title peek beat', 'day', 'ui', ph=8, ev=[(2.0, 'sfx', 'peek_collapse')])
shot('sc_dream_map', 'Dream map fly-over with the Flipper tile hit', 'day', 'ui', ph=10, ev=[(4.0, 'sfx', 'gremlin_flip')])
shot('sc_clone_glitch', '1-3 meta beat: the clone glitch', 'day', 'ui', ph=10, ev=[(3.0, 'sfx', 'glitch')])
shot('sc_map_flip', 'Meta beat: the map flip', 'day', 'ui', ph=10, ev=[(3.0, 'sfx', 'gremlin_flip')])
shot('sc_lights_out_ear', '4-2 Lights Out solved by ear', 'night', 'ui', ph=12, ev=[(3.0, 'syndromeChord', 'chord')])
shot('sc_gremlin_lab', 'Gremlin Lab and Night Shift', 'night', 'ui', ph=16)
shot('sc_threshold', 'Night Lab threshold chart, animated curve draw', 'day', 'ui', ph=14)
shot('sc_codex_tour', 'Codex: silhouettes -> unlock toast -> interactive entries', 'day', 'ui', ph=20, ev=[(6.0, 'sfx', 'ui_click')])
shot('sc_card_guide', 'Card Guide anatomy for IF', 'day', 'ui', ph=10)
shot('sc_notebook', 'Lab Notebook pages in X-ray', 'day', 'ui', ph=18)
shot('sc_qol_grid', 'QoL quick-fire 2x2: snippets, doodle comments, help slot, step mode/timeline (precomposed)', 'none', 'pre', ph=16)
shot('sc_save_joke', 'Save data protected by a 3-qubit repetition code (1-2 s)', 'day', 'ui', ph=4)
shot('sc_curtain_call', 'Credits curtain call', 'day', 'ui', ph=16)
shot('sc_morning_still', 'Still morning daycare (closing)', 'day', 'ui', ph=8)


# ───────────────────────── source resolution ─────────────────────────
def _aliases():
    p = os.path.join(HERE, 'shot_sources.json')
    return json.load(open(p)) if os.path.exists(p) else {}


# my shot id -> the Capture Engineer's / Motion Designer's asset names (first existing file wins)
REAL = {
    'tr_cold_blanket': ['capture/tr-peek-flashlight'], 'tr_peek_beam': ['capture/tr-peek-flashlight'],
    'tr_title_peek': ['motion/title_peek'], 'tr_title_sweep': ['motion/title_sweep', 'capture/tr-peek-title-8ths'],
    'tr_relight': ['capture/tr-build-relight'], 'tr_dark_room': ['capture/tr-build-dark-wide'],
    'tr_bot_antenna': ['capture/tr-drop-bot-beep'], 'tr_proof': ['capture/tr-proof-room'],
    'tr_proof_q2': ['capture/tr-proof-q2'], 'tr_proof_bots': ['capture/tr-proof-bots'],
    'mn_schrodi_checklist': ['capture/tr-m-checklist'], 'mn_highfive': ['capture/tr-m-highfive'], 'mn_listen': ['capture/tr-m-listen'],
    'mn_test_strip': ['capture/tr-m-teststrip'], 'mn_phasey_spin': ['capture/tr-m-phasey-spin'],
    'mn_clone_glitch': ['capture/tr-m-clone-glitch'], 'mn_dream_map': ['capture/tr-m-map-flip'], 'mn_shor9': ['capture/tr-m-shor9'],
    'mn_bloch': ['capture/tr-m-inspector'], 'mn_lights_out': ['capture/tr-lights-out'], 'mn_codex_hero': ['capture/tr-m-codex-sphere'],
    'tr_morning_check': ['capture/tr-payoff-win'], 'tr_curtain_call': ['capture/tr-credits-curtain'],
    'tr_morning_still': ['capture/tr-closing-morning'],
    'mo_logo_reveal': ['motion/logo_reveal'], 'mo_circuit_morph': ['motion/circuit_morph', 'capture/tr-circuit-reveal'],
    'mo_end_card': ['motion/end_card'], 'mo_syndrome_table': ['motion/syndrome'],
    'mo_card_gremlins': ['motion/card_gremlins_192', 'motion/card_gremlins'], 'mo_card_ghosts': ['motion/card_ghosts_192', 'motion/card_ghosts'],
    'me_11_peek': ['capture/me-rule-11'], 'me_threat': ['capture/me-threat-23'], 'me_cantcopy': ['capture/me-cantcopy-13'],
    'me_encode': ['capture/me-share-14'], 'me_21_listen': ['capture/me-ask-21'], 'me_23_night': ['capture/me-repair-23'],
    'me_23_xray': ['capture/me-proof-xray-23'], 'me_31_phase': ['capture/me-twist-31'], 'mo_qiskit_stamp': ['capture/me-qiskit-23'],
    'sc_clone_glitch': ['capture/sc-meta-clone-13'], 'sc_map_flip': ['capture/sc-meta-mapflip'],
    'sc_lights_out_ear': ['capture/sc-meta-lightsout-42'], 'sc_gremlin_lab': ['capture/sc-lab'], 'sc_codex_tour': ['capture/sc-codex-tour'],
    'sc_notebook': ['capture/sc-notebook'], 'sc_curtain_call': ['capture/sc-credits'],
}
for _lv in ('0-1', '0-2', '1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3', '4-1', '4-2'):
    REAL[f'sc_lv_{_lv}'] = [f'capture/sc-hero-{_lv}', f'capture/sc-grid-{_lv}']


def resolve(sid):
    for cand in REAL.get(sid, []) + [f'capture/{sid}', f'motion/{sid}', f'final/work/precomp/{sid}']:
        for ext in ('.mkv', '.mov', '.mp4'):
            p = f'videos/{cand}{ext}'
            if os.path.exists(E.rel(p)):
                return p, cand.split('/')[0]
        fp = f'videos/{cand}_fill.mkv'
        if os.path.exists(E.rel(fp)):
            return fp, cand.split('/')[0]
    al = _aliases().get(sid)  # manual stand-ins (e.g. capture samples) until the real shot lands
    if al and os.path.exists(E.rel(al)):
        return al, 'alias'
    return f'{PH_DIR}/{sid}.mkv', 'placeholder'


def motion_card(name):
    """A Motion Designer alpha card -> ({fill, matte}, frames, text_legible) or None."""
    for n in (name,):
        j = E.rel(f'videos/motion/{n}.json')
        if os.path.exists(j):
            d = json.load(open(j))
            f = d.get('files', {})
            if f.get('fill'):
                return ({'fill': f'videos/motion/{f["fill"]}', 'matte': f'videos/motion/{f["matte"]}'}, d['frames'],
                        d.get('markers', {}).get('text_legible', 12))
    return None


def side(src, suffix):
    base = os.path.splitext(src)[0] if not os.path.isdir(E.rel(src)) else src
    if base.endswith('_fill'):
        base = base[:-5]
    p = base + suffix
    return p if os.path.exists(E.rel(p)) else None


ALIASES = {  # plan vocabulary -> predicates over capture events
    'beep': lambda e: (e.get('type') == 'sfx' and e.get('name') == 'listen_beep') or (e.get('type') == 'botNote' and e.get('result') in (1, 'beep')),
    'quiet': lambda e: e.get('type') == 'botNote' and e.get('result') in (0, 'quiet'),
    'chord': lambda e: e.get('type') == 'syndromeChord',
}


def find_event(src, name, n=0):
    evs = E.load_events(side(src, '.events.json'))
    pred = ALIASES.get(name, lambda e: e.get('name') == name or e.get('type') == name)
    hits, seen = [], set()
    for e in evs:
        if e.get('frame') is not None and pred(e) and e['frame'] not in seen:
            seen.add(e['frame'])
            hits.append({'frame': e['frame']})
    meta = side(src, '.meta.json')
    if meta:  # Capture Engineer marks (point marks or ranges)
        for m in E.load_json(meta).get('marks', []):
            if m.get('name') == name or m.get('label') == name:
                hits.append({'frame': m.get('frame', m.get('from'))})
    mj = side(src, '.json')
    if mj and src.startswith('videos/motion'):
        mk = E.load_json(mj).get('markers', {})
        v = mk.get(name)
        if isinstance(v, int):
            hits.append({'frame': v})
        elif isinstance(v, list):
            hits += [{'frame': x} for x in v if isinstance(x, int) and x >= 0]
    hits.sort(key=lambda e: e['frame'])
    return hits[n]['frame'] if len(hits) > n else None


# ───────────────────────── builder ─────────────────────────
class Builder:
    def __init__(self, video, layout, work, outputs, cue=None):
        self.e = dict(schema=E.SCHEMA, video=video, fps=FPS, layout=layout, work=list(work), outputs=outputs,
                      zoom_cap=1.8, cue_sheet=cue, clips=[], captions=[], overlays=[], fx=[], marks=[],
                      audio={'mix': f'videos/final/work/{video}/mix.wav', 'mixreport': f'videos/final/work/{video}/mixreport.json',
                             'stems': f'videos/final/work/{video}/stems'},
                      notes=[])
        self.t = 0
        self.n = 0

    def clip(self, sid, dur, align=None, in_s=0.0, speed=1, camera=None, transition='cut', tframes=None, flags=None,
             section=None, cues=(), beat_frame=None, grade=None, exempt=None, note=None, continuous=False):
        """Append a clip of `dur` timeline frames. align=(event, offset_frames_in_clip)."""
        self.n += 1
        if sid.startswith('@'):
            src, tag = sid, 'generator'
        else:
            src, tag = resolve(sid)
        tr = {'type': transition}
        ov = 0
        if E.TRANSITIONS[transition][0]:
            tr['frames'] = tframes or E.TRANSITIONS[transition][1]
            for k in ('matte', 'overlay'):
                for cand in (f'videos/motion/{transition}_{k}', f'videos/motion/transitions/{transition}_{k}'):
                    for ext in ('.mov', '.mkv', ''):
                        if k not in tr and os.path.exists(E.rel(cand + ext)):
                            tr[k] = cand + ext
            ov = tr['frames']
            # the effect starts ON the edit point: the outgoing clip runs `ov` frames longer underneath it
            self.e['clips'][-1]['dur'] += ov
        start = self.t
        sp = speed
        vmax = sp if isinstance(sp, (int, float)) else max(k[1] for k in sp['keys'])
        if align and src[0] != '@':
            ef = find_event(src, align[0], align[2] if len(align) > 2 else 0)
            if ef is None:
                self.e['notes'].append(f'{sid}: align event {align[0]} not found; using in_s')
                i0 = int(round(in_s * FPS))
            else:
                i0 = int(round(ef - align[1] * (sp if isinstance(sp, (int, float)) else 1)))
        else:
            i0 = int(round(in_s * FPS))
        if i0 < 0:
            self.e['notes'].append(f'{sid}: in-point {i0} < 0 clamped (shot needs {-i0} more head frames)')
            i0 = 0
        c = dict(id=f'{self.e["video"][0].upper()}{self.n:03d}', shot=sid, src=src, src_kind=tag, start=start, dur=dur, **{'in': i0},
                 speed=sp, grade=grade or R.get(sid, {}).get('grade', 'none'), transition=tr,
                 flags={k: True for k in (flags or [])}, section=section, cues=list(cues))
        if getattr(self, '_shot_cam', None):
            c['camera'] = self._shot_cam
            c['camera_from'] = 'capture camera.json (clamped to the push-in cap)'
            self._shot_cam = None
        if camera == 'shot':
            camera = None
            cj = side(src, '.camera.json') if src[0] != '@' else None
            if cj:
                d = E.load_json(cj)
                FW, FH = d.get('frame', [1920, 1080])
                cap = min(o.get('zoom_cap', 1.8) for o in self.e['outputs'])
                v = sp if isinstance(sp, (int, float)) else 1
                keys = []
                for k in d['keyframes']:
                    x, y, w, hh = k['rect']
                    z = min(cap, FW / w)
                    keys.append(dict(f=int(round((k['frame'] - i0) / v)), z=round(z, 4), cx=(x + w / 2) / FW, cy=(y + hh / 2) / FH,
                                     ease='inout'))
                inside = [k for k in keys if 0 <= k['f'] < dur] or keys[-1:]
                c_keys = sorted(inside, key=lambda k: k['f'])
                if c_keys and c_keys[0]['f'] > 0:  # carry the state at the clip's first frame
                    z0, cx0, cy0 = E.camera_at(keys, 0)
                    c_keys.insert(0, dict(f=0, z=round(z0, 4), cx=cx0, cy=cy0, ease='linear'))
                if c_keys and c_keys[0]['f'] < 0:
                    c_keys = [dict(c_keys[0], f=0)]
                self._shot_cam = c_keys
        if camera:
            c['camera'] = [dict(f=int(round(u * dur)), z=z, cx=cx, cy=cy, ease=es) for u, z, cx, cy, es in camera]
        if beat_frame is not None:
            c['beat_frame'] = beat_frame
        if exempt:
            c['scdet_exempt'] = exempt
        if note:
            c['note'] = note
        if continuous:
            c['continuous'] = True
        if src[0] != '@':
            ev, lay = side(src, '.events.json'), side(src, '.layout.json')
            if ev:
                c['events'] = ev
            if lay:
                c['layout_json'] = lay
            if vmax > 1.01:
                c['note'] = (c.get('note', '') + f' sped up {vmax}x').strip()
        # `dur` given: out derives from the frame map
        if beat_frame is not None:
            c['beat_frame'] = beat_frame
        cc = dict(c)
        self.e['clips'].append(cc)
        self.t = start + dur
        return cc

    def ev_frame(self, c, name):
        f = find_event(c['src'], name) if c['src'][0] != '@' else None
        return None if f is None else c['start'] + int(round((f - c['in']) / (c['speed'] if isinstance(c['speed'], (int, float)) else 1)))

    def exempt_event(self, c, name, before=6, after=60, why='in-engine dissolve'):
        f = self.ev_frame(c, name)
        if f is not None and c['start'] <= f < c['start'] + c['dur']:
            c.setdefault('scdet_exempt', []).append([max(c['start'], f - before), min(c['start'] + c['dur'], f + after)])
            self.mark('dissolve', max(c['start'], f - before), min(c['start'] + c['dur'], f + after), why)


    def cap(self, text, start, end, position, legible=10, style=None, render='template', **kw):
        i = len(self.e['captions']) + 1
        cid = f'cap{i:02d}'
        c = dict(id=cid, text=text, start=int(start), end=int(end), legible_from=int(start + legible), position=position,
                 style=style or ('strip' if position == 'strip' else 'night'), render=render, **kw)
        for d in ('videos/motion/cards', 'videos/motion/captions'):
            for ext in ('.mov', '.mkv'):
                p = f'{d}/{self.e["video"]}_{cid}{ext}'
                if os.path.exists(E.rel(p)):
                    c['render'] = {'src': p}
        self.e['captions'].append(c)

    def mark(self, typ, a, b, why):
        self.e['marks'].append(dict(type=typ, start=int(a), end=int(b), why=why))

    def done(self):
        self.e['duration'] = self.t
        return self.e


# ───────────────────────── synthetic cue sheet ─────────────────────────
SYN_SECTIONS = [('cold_open', 2), ('peek', 3), ('build', 4), ('silence', 1), ('drop', 1), ('proof', 4), ('montage', 4),
                ('payoff', 3), ('closing', 4), ('end_card', 2)]


def synthetic_cue_sheet(bpm=96):
    beat = 60 / bpm * FPS
    nb = sum(b for _, b in SYN_SECTIONS) * 4
    beats = [int(round(i * beat)) for i in range(nb + 1)]
    secs, b0 = [], 0
    for name, bars in SYN_SECTIONS:
        secs.append(dict(name=name, start_frame=beats[b0], end_frame=beats[b0 + bars * 4]))
        b0 += bars * 4
    d = dict(synthetic=True, note='SYNTHETIC placeholder (Critic 2.5 grid, 96 BPM) until videos/music/cue_sheet.json lands',
             fps=FPS, bpm=bpm, beats=beats[:-1], downbeats=beats[:-1:4], sections=secs, duration_frames=beats[-1])
    os.makedirs(os.path.dirname(E.rel(SYN_CUE)), exist_ok=True)
    json.dump(d, open(E.rel(SYN_CUE), 'w'), indent=1)
    return SYN_CUE


# ───────────────────────── trailer ─────────────────────────
def build_trailer(cue):
    """Cut to the song's cue sheet (REVISED #2). Section edges are the cue sheet's exact
    frames; every interior cut sits on a grid beat. Beat counts below are for the
    delivered edit (112.5 BPM 3/4, 32-frame beats); a fill item absorbs any change."""
    cs = E.load_cue_sheet(cue, FPS)
    beats = cs['beats']
    hits = cs['hits'] if isinstance(cs['hits'], dict) else {}
    B = Builder('trailer', 'cinema', (2560, 1440), [
        dict(name='trailer_1080p', size=[1920, 1080], path='videos/final/trailer.mp4', zoom_cap=1.8),
        dict(name='trailer_master_1440p', size=[2560, 1440], path='videos/final/trailer_master_1440p.mp4', zoom_cap=1.4)], cue)
    B.e['audio']['music'] = cs['raw'].get('file')
    bi = lambda f: min(range(len(beats)), key=lambda i: abs(beats[i] - f))

    def bf(i):
        k = int(i)
        if k + 1 >= len(beats):
            return beats[-1] + int(round((i - len(beats) + 1) * (beats[-1] - beats[-2])))
        return beats[k] if i == k else int(round(beats[k] + (beats[k + 1] - beats[k]) * (i - k)))

    def section(name, items, through=None):
        a, _ = cs['sections'][name]
        _, b = cs['sections'][through or name]
        assert B.t == a, f'{name}: timeline at {B.t}, section starts {a}'
        B.e.setdefault('sections', []).append(dict(name=name, start=a, end=b))
        ia = bi(a) if abs(beats[bi(a)] - a) <= 1 else None  # None: section starts off-grid (cold open)
        ib = bi(b) if abs(beats[bi(b)] - b) <= 1 else None
        # beat positions of the inner cut points
        if ia is None:
            ia = bi(a) - (1 if beats[bi(a)] > a else 0)  # virtual beat index before the first beat
        end_beats = (ib if ib is not None else bi(b) + (1 if beats[bi(b)] < b else 0)) - ia
        total = sum(it[1] for it in items)
        if total != end_beats:
            fi = next((k for k, it in enumerate(items) if it[2].get('fill')), len(items) - 1)
            items[fi] = (items[fi][0], items[fi][1] + end_beats - total, items[fi][2])
            B.e['notes'].append(f'{name}: song gives {end_beats} beats, plan had {total}; "{items[fi][0]}" absorbs {end_beats - total:+d}')
        pos = ia
        for j, (sid, nb, o) in enumerate(items):
            o = dict(o)
            o.pop('fill', None)
            tr = o.pop('transition', 'cut')
            a_f = a if j == 0 else bf(pos)
            z_f = b if j == len(items) - 1 else bf(pos + nb)
            flags = set(o.pop('flags', []))
            on_grid = any(abs(x - a_f) <= 1 for x in beats)
            if B.e['clips'] and on_grid:
                flags.add('on_beat')
            al = o.pop('align', None)
            if al:  # (event, beat offset within the clip)
                al = (al[0], bf(pos + al[1]) - a_f if j or al[1] else 0) + tuple(al[2:])
            bfr = o.pop('beat_frame', a_f if B.e['clips'] else None)
            if bfr is not None and bfr != a_f and any(abs(x - bfr) <= 1 for x in beats):
                flags.add('on_beat')
            B.clip(sid, z_f - a_f, align=al, transition=tr, flags=flags, section=name, beat_frame=bfr, **o)
            pos += nb
        return ia

    push = lambda z0, z1, cy0=0.5, cy1=0.5: [(0, z0, 0.5, cy0, 'linear'), (1, z1, 0.5, cy1, 'inout')]
    S_ = cs['sections']

    def card_caption(text, clip, name, position='top_third', style='night', hold_to=None):
        """Caption entry for a Motion card: baked into a clip (opaque card) or an alpha overlay (fill+matte)."""
        mc = motion_card(name)
        if clip is not None:  # opaque card clip: the text is in the picture
            j = E.rel(f'videos/motion/{os.path.basename(os.path.splitext(clip["src"])[0])}.json')
            mk = json.load(open(j)).get('markers', {}) if os.path.exists(j) else {}
            st = clip['start'] + mk.get('text_start', 4) - clip['in']
            B.cap(text, max(clip['start'], st), clip['start'] + clip['dur'], position, style=style,
                  legible=max(1, mk.get('text_legible', 28) - mk.get('text_start', 4)), render={'baked': clip['id'], 'motion': name})
            return
        start, end = hold_to
        if mc:
            spec, frames, leg = mc
            B.cap(text, start, end, position, style=style, legible=leg, render=dict(spec, frames=frames, motion=name))
        else:
            B.cap(text, start, end, position, style=style)

    # cold_open (off-grid start): the moonlit blanket breathing; then the Motion title peek from k9 (f338), whose
    # P-collapse + shatter lands on the peek hit (clip f96 = f434) and runs out to black by f454
    tp_hit = find_event(resolve('tr_title_peek')[0], 'impact') or 96
    pre = int(round(tp_hit / 32))  # beats of title_peek before the hit
    ia = section('cold_open', [('tr_cold_blanket', 13 - pre, dict(camera=push(1.0, 1.15), fill=True, in_s=0.5)),
                               ('tr_title_peek', pre, dict(grade='none', in_s=(tp_hit - pre * 32) / FPS))])
    card_caption('Every Qubble dreams two dreams at once.', None, 'card_dreams_alpha', hold_to=(30, B.e['clips'][-1]['start'] - 2))
    hit = hits.get('peek_collapse', S_['peek'][0])
    tp_len = E.probe(resolve('tr_title_peek')[0])[2] if resolve('tr_title_peek')[1] != 'placeholder' else tp_hit + 20
    tail = max(0, tp_len - tp_hit)  # shards + black after the hit, inside the Motion clip
    B.e['clips'][-1]['cues'] = [dict(name='peek_collapse_impact', frame=hit, kind='design',
                                     note='signature #1: sub drop + noise burst + layered peek_collapse, 1.25 s tail')]
    B.e['clips'][-1]['scdet_exempt'] = [[hit - 2, hit + tail]]
    # peek: the title clip runs out its shards (continuous), true black under the reverb tail, then the in-place relight
    ia = section('peek', [('tr_title_peek', tail / 32, dict(grade='none', in_s=tp_hit / FPS, continuous=True)),
                          ('@black', 3 - tail / 32, dict(flags=['intentional_black', 'intentional_hold'], continuous=True)),
                          ('tr_relight', 6, dict(transition='relight', camera=push(1.0, 1.06), fill=True))])
    B.mark('flash', hit, hit + 2, 'collapse white flash (in the Motion clip)')
    B.mark('black', hit + tail - 8, bf(ia + 3), 'post-shatter black')
    B.mark('hold', hit + tail - 8, bf(ia + 3), 'black under the reverb tail')
    rl = B.e['clips'][-1]
    rl['scdet_exempt'] = [[rl['start'] + 4, rl['start'] + rl['dur']]]
    B.mark('dissolve', rl['start'] + 4, rl['start'] + rl['dur'], 'in-place day->night relight')
    # build: the Motion gremlin / ghost cards (each a real bit flip / phase flip), then the dark room under "You can't look."
    gl = motion_card('card_gremlins')
    g_frames = E.probe(resolve('mo_card_gremlins')[0])[2] if resolve('mo_card_gremlins')[1] != 'placeholder' else 192
    h_frames = E.probe(resolve('mo_card_ghosts')[0])[2] if resolve('mo_card_ghosts')[1] != 'placeholder' else 192
    gb, hb = min(6, g_frames // 32), min(6, h_frames // 32)
    items = [('mo_card_gremlins', gb, dict(grade='none'))]
    if gb < 6:
        items.append(('tr_gremlin_wobbles', 6 - gb, dict(align=('wobble', 0.25))))
    items.append(('mo_card_ghosts', hb, dict(grade='none')))
    if hb < 6:
        items.append(('tr_door_empty', 6 - hb, {}))
    items.append(('tr_dark_room', 6, dict(camera=push(1.0, 1.08), fill=True)))
    ia = section('build', items)
    cl = {c['shot']: c for c in B.e['clips'] if c.get('section') == 'build'}
    card_caption('Gremlins flip bits.', cl['mo_card_gremlins'], 'card_gremlins')
    card_caption('Ghosts flip phases.', cl['mo_card_ghosts'], 'card_ghosts')
    dr = cl['tr_dark_room']
    card_caption("You can't look.", None, 'card_cantlook_alpha', hold_to=(dr['start'], dr['start'] + dr['dur']))
    # silence: 2 beats of true black; the antenna lights on the single dry BEEP (f1362); the Motion logo reveal's
    # own glitch tear starts 6 frames before the drop so that its impact (clip f6) lands on f1394
    beep = hits.get('bot_beep', S_['silence'][0] + 64)
    lg = find_event(resolve('mo_logo_reveal')[0], 'impact') or 6
    ia = section('silence', [('@black', (beep - S_['silence'][0]) / 32, dict(flags=['intentional_black', 'intentional_hold'])),
                             ('tr_bot_antenna', (S_['silence'][1] - lg - beep) / 32, dict(align=('beep', 0))),
                             ('mo_logo_reveal', lg / 32, dict(grade='none', beat_frame=S_['drop'][0]))])
    a, b = S_['silence'][0], beep
    B.mark('black', a, b, 'true silence; the BEEP is the rescue')
    B.mark('hold', a, b, 'silence')
    B.e['clips'][-3]['cues'] = [dict(name='silence', frame=a, kind='design', note='music hard-stops; room tone -60 dBFS')]
    B.e['clips'][-2]['cues'] = [dict(name='bot_beep_dry', frame=beep, kind='design', note="single dry BEEP: becomes the lead's first note")]
    lgc = B.e['clips'][-1]
    lgc['scdet_exempt'] = [[lgc['start'] - 1, lgc['start'] + lg + 12]]
    lgc['note'] = 'glitch tear (its one use) is inside the Motion logo_reveal clip f0-5; impact clip f6 = the drop'
    B.mark('flash', S_['drop'][0], S_['drop'][0] + 6, 'logo impact flash (Motion)')
    section('drop', [('mo_logo_reveal', 6, dict(grade='none', in_s=lg / FPS, continuous=True, fill=True,
                                                cues=[dict(name='drop_impact', frame=S_['drop'][0], kind='design')]))])
    # proof (v2: 6 bars, steps of 1/2/1/2 bars): flip -> bots ask (BEEP / quiet) -> BOOP -> X-ray reveal + meter
    section('proof', [
        ('tr_proof', 3, dict(align=('gremlin_flip', 1))),
        ('tr_proof', 6, dict(align=('beep', 2))),
        ('tr_proof', 3, dict(align=('boop', 1))),
        ('tr_proof', 6, dict(align=('xray_start', 0), transition='xray-dissolve', fill=True)),
    ])
    B.exempt_event(B.e['clips'][-1], 'xray_start', why='in-engine X-ray dissolve')
    # montage (3/4 ladder, Critic): 3 downbeat cuts (96 f), 2 hemiola bars = 3 cuts every 2 beats (64 f), 2 bars of beat cuts (32 f)
    has_lo = 'lights_out' in S_
    ladder = [
        ('mn_schrodi_checklist', 3, dict(align=('schrodi_meow', 0))),
        ('mn_test_strip', 3, dict(align=('test_pass', 0))),
        ('mn_dream_map', 3, dict(align=('gremlin_flip', 0))),
        ('mn_highfive', 2, dict(align=('highfive', 0))),
        ('mn_listen', 2, dict(align=('beep', 0))),
        ('mn_bloch', 2, dict(in_s=0.5)),
        ('mn_codex_hero', 1, dict(align=('card_pick', 0), camera='shot')),
        ('mn_codex_flipper', 1, {}), ('mn_codex_schrodi', 1, {}), ('mn_codex_qubble', 1, {}),
        ('mn_clone_glitch', 1, dict(align=('glitch', 0))), ('mn_shor9', 1, dict(fill=True)),
    ]
    if has_lo:
        section('montage', ladder)
        section('lights_out', [('mn_lights_out', 6, dict(align=('chord', 0), flags=['intentional_black'], fill=True))])
    else:  # v1 cue sheet: Lights Out is the montage's last pocket
        lo_a = hits.get('lights_out', S_['montage'][1] - 96)
        section('montage', ladder + [('mn_lights_out', (S_['montage'][1] - lo_a) // 32, dict(align=('chord', 0), flags=['intentional_black']))])
    lo = B.e['clips'][-1]
    B.mark('black', lo['start'], lo['start'] + lo['dur'], 'Lights Out: the montage breath')
    B.mark('hold', lo['start'], lo['start'] + lo['dur'], 'Lights Out')
    # payoff: stars on the slam, then the curtain call
    section('payoff', [('tr_morning_check', 6, dict(align=('level_win', 0))),
                       ('tr_curtain_call', 6, dict(camera=[(0, 1.25, .5, .5, 'linear'), (1, 1.0, .5, .5, 'out')], fill=True))])
    # closing: still morning under the music box, held through the silence; SNAP (signature #3) to the real
    # circuit under the line; end card. One section span so the circuit can borrow end-card beats if needed.
    cl_name = 'closing_musicbox' if 'closing_musicbox' in S_ else 'closing'
    snap = hits.get('snap_circuit_reveal', S_[cl_name][1] - 192)
    ec = S_['end_card'][0]
    circ = max(9, (ec - snap) // 32)  # the line needs >= 3.9 s of reading time + its fade
    ia = section(cl_name, [('tr_morning_still', (snap - S_[cl_name][0]) // 32, dict(in_s=0.5, camera=push(1.05, 1.1))),
                           ('mo_circuit_morph', circ, dict(grade='none')),
                           ('mo_end_card', 6, dict(grade='none', fill=True))], through='end_card')
    sil = hits.get('closing_silence', snap - 96)
    # Director: the card stays up continuously through the silence until the snap (no empty frame)
    card_caption("It's just a game…", None, 'card_justagame_alpha', style='day', hold_to=(bf(ia), snap))
    cm = B.e['clips'][-2]
    B.cap('…where you accidentally learned quantum error correction.', snap + 6, cm['start'] + cm['dur'] - 6, 'top_third',
          style='night', closing_line=True)
    cm['cues'] = [dict(name='snap', frame=snap, kind='design', note='signature #3: dry snap = snap_measure + paper whip + peek transient')]
    B.mark('hold', sil, snap, 'near-silent still morning before the snap')
    return B.done()


# ───────────────────────── mechanic (Critic §5 table) ─────────────────────────
def S(x):
    return int(round(x * FPS))


def build_mechanic():
    B = Builder('mechanic', 'strip', (1920, 1080), [dict(name='mechanic_1080p', size=[1920, 1080], path='videos/final/mechanic.mp4', zoom_cap=1.8)])
    push = lambda z0, z1, cx=.5, cy=.5: [(0, z0, cx, cy, 'linear'), (1, z1, cx, cy, 'inout')]
    B.clip('me_cold_blanket', S(6), in_s=0.5, camera=push(1.0, 1.12), section='cold_open')
    B.cap('Every Qubble dreams two dreams at once.', S(0.4), S(5.9), 'strip')
    B.clip('me_11_peek', S(18), align=('peek_collapse', S(6)), camera=push(1.0, 1.15), section='rule')
    B.exempt_event(B.e['clips'][-1], 'xray_start', why='in-engine X-ray reveal')
    B.cap('= measurement collapses a superposition', S(13), S(23), 'strip')
    B.clip('me_threat', S(14), align=('gremlin_flip', S(5)), camera=push(1.0, 1.2, .5, .55), section='threat')
    B.cap('One dream changed. Which one? You can\'t look.', S(25.5), S(37.5), 'strip')
    B.clip('me_encode', S(12), align=('highfive', S(2.5)), section='cant_copy')
    B.cap('= encoding (no copies allowed)', S(40), S(49.5), 'strip')
    B.clip('me_21_listen', S(10), align=('highfive', S(2.5)), camera=push(1.0, 1.1), section='ask')
    B.cap('= parity check', S(53), S(59.5), 'strip')
    B.clip('mo_syndrome_table', S(15), grade='none', section='ask')
    B.cap('= syndrome: two answers point at one Qubble', S(61), S(74.5), 'strip')
    B.clip('me_23_night', S(23), align=('gremlin_flip', S(2.5)), section='repair')
    B.cap('= error correction, without ever measuring the dream', S(77), S(97.5), 'strip')
    B.clip('me_23_xray', S(14), align=('xray_start', S(1)), section='proof')
    B.exempt_event(B.e['clips'][-1], 'xray_start', why='in-engine X-ray replay')
    B.cap('= the bots never learned the dream', S(100), S(111.5), 'strip')
    B.clip('me_31_phase', S(16), align=('ghost_phase', S(2)), section='twist')
    B.cap('= phase-flip code (Hadamard basis)', S(114), S(127.5), 'strip')
    B.clip('mo_circuit_morph', S(10), grade='none', section='under_the_hood')
    B.clip('mo_qiskit_stamp', S(4), grade='none', section='under_the_hood')
    B.cap('= a real state-vector simulator, real gates', S(129), S(141.5), 'strip')
    B.clip('sc_morning_still', S(4.5), in_s=0.5, section='close')
    B.cap("It's just a game…", S(142.3), S(146.4), 'strip')
    B.clip('mo_circuit_morph', S(5.5), grade='none', section='close', in_s=0.5,
           cues=[dict(name='snap', frame=S(146.5), kind='design')])
    B.cap('…where you accidentally learned quantum error correction.', S(146.6), S(151.9), 'strip')
    B.clip('mo_end_card', S(5), grade='none', section='end_card')
    return B.done()


# ───────────────────────── showcase (Critic §6) ─────────────────────────
def build_showcase():
    B = Builder('showcase', 'strip', (1920, 1080), [dict(name='showcase_1080p', size=[1920, 1080], path='videos/final/showcase.mp4', zoom_cap=1.8)])
    W = 'blanket-wipe'
    B.clip('sc_grid16', S(5), grade='none', section='open', note='4x4 money shot')
    B.cap('16 levels. Every one verified.', S(0.4), S(4.9), 'strip')
    B.clip('sc_title_peek', S(6), align=('peek_collapse', S(2)), section='open')
    B.clip('sc_dream_map', S(6), align=('gremlin_flip', S(3)), section='open', camera=[(0, 1.0, .5, .5, 'linear'), (1, 1.2, .55, .5, 'inout')])
    B.cap('The dream map', S(11.5), S(16), 'strip')
    strobe = lambda lv, ch: B.clip(f'sc_lv_{lv}', 36, in_s=30.0, speed=6, section=ch, note='1-beat strobe')

    def hero(lv, ch, secs, label, tr=W):
        B.clip(f'sc_lv_{lv}', S(secs), in_s=2.0, speed={'keys': [[0, 1.0], [60, 4.0], [S(secs) - 90, 4.0], [S(secs) - 30, 1.0]]},
               transition=tr, section=ch, note='hero level')
        c = B.e['clips'][-1]
        B.cap(label, c['start'] + 30, c['start'] + c['dur'] - 12, 'strip')

    hero('1-1', 'ch1', 12, '1-1  Dont Wake Them  ·  = measurement')
    B.clip('sc_clone_glitch', S(8), align=('glitch', S(2.5)), section='ch1')
    B.cap('= you can\'t copy a dream (no-cloning)', B.t - S(8) + 20, B.t - 10, 'strip')
    for lv in ('0-1', '0-2', '1-2', '1-4'):
        strobe(lv, 'ch1')
    hero('2-3', 'ch2', 14, '2-3  Who Got Flipped?  ·  = syndrome decoding')
    B.clip('sc_map_flip', S(8), align=('gremlin_flip', S(2.5)), section='ch2')
    B.cap('The map flips', B.t - S(8) + 20, B.t - S(3), 'strip')
    for lv in ('2-1', '2-2', '2-4', '2-5'):
        strobe(lv, 'ch2')
    hero('3-1', 'ch3', 12, '3-1  Somethings Off  ·  = phase flips')
    hero('3-3', 'ch3', 12, '3-3  Wobbles  ·  = small rotations get caught too', tr='cut')
    strobe('3-2', 'ch3')
    hero('4-1', 'ch4', 12, '4-1  Nesting Dolls  ·  = the Shor 9-qubit code')
    B.clip('sc_lights_out_ear', S(10), align=('chord', S(2)), section='ch4')
    B.cap('4-2  Lights Out: solve it by ear', B.t - S(10) + 20, B.t - 10, 'strip')
    B.clip('sc_gremlin_lab', S(14), transition=W, section='labs')
    B.cap('Gremlin Lab & Night Shift: your code vs random gremlins', B.t - S(14) + 30, B.t - 10, 'strip')
    B.clip('sc_threshold', S(12), section='labs')
    B.cap('Codes only help when noise is rare: below p = ½', B.t - S(12) + 30, B.t - 10, 'strip')
    B.clip('sc_codex_tour', S(18), transition=W, section='codex')
    B.cap('The Codex: everything you meet, collected', B.t - S(18) + 30, B.t - S(9), 'strip')
    B.clip('sc_card_guide', S(8), section='codex')
    B.cap('Card Guide: every card explained', B.t - S(8) + 20, B.t - 10, 'strip')
    B.clip('sc_notebook', S(16), section='notebook')
    B.cap("Schrödi's Lab Notebook: the real maths behind each night", B.t - S(16) + 30, B.t - 10, 'strip')
    B.clip('sc_qol_grid', S(15), grade='none', transition=W, section='qol')
    B.cap('Snippets · doodle comments · help slot · step mode', B.t - S(15) + 30, B.t - 10, 'strip')
    B.clip('sc_save_joke', S(3), section='qol')
    B.clip('sc_curtain_call', S(14), transition=W, section='credits')
    B.clip('sc_morning_still', S(5), section='close')
    B.cap("It's just a game…", B.t - S(5) + 20, B.t - 10, 'strip')
    B.clip('mo_circuit_morph', S(6), grade='none', section='close', cues=[dict(name='snap', frame=B.t, kind='design')])
    B.cap('…where you accidentally learned quantum error correction.', B.t - S(6) + 6, B.t - 6, 'strip')
    B.clip('mo_end_card', S(5), grade='none', section='end_card')
    return B.done()


def cue_path(arg):
    if arg:
        return arg
    if os.path.exists(E.rel('videos/music/cue_sheet.json')):
        return 'videos/music/cue_sheet.json'
    return synthetic_cue_sheet()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('which', nargs='?', default='all')
    ap.add_argument('--cue')
    ap.add_argument('--registry', action='store_true', help='print the shot registry as JSON')
    a = ap.parse_args()
    if a.registry:
        print(json.dumps(R, indent=1))
        return
    todo = ['trailer', 'mechanic', 'showcase'] if a.which == 'all' else [a.which]
    for v in todo:
        e = build_trailer(cue_path(a.cue)) if v == 'trailer' else build_mechanic() if v == 'mechanic' else build_showcase()
        p = os.path.join(HERE, f'{v}.edl.json')
        json.dump(e, open(p, 'w'), indent=1)
        kinds = {}
        for c in e['clips']:
            kinds[c['src_kind']] = kinds.get(c['src_kind'], 0) + 1
        print(f'{v}: {len(e["clips"])} clips, {e["duration"]} frames ({e["duration"]/FPS:.2f}s), sources {kinds} -> {os.path.relpath(p, E.ROOT)}')
        for n in e['notes']:
            print('  note:', n)


if __name__ == '__main__':
    main()
