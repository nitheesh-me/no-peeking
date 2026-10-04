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
shot('tr_gremlin_flipper', 'REAL Flipper (not a silhouette) strikes a blanket in the dark room; mark "strike" (cinema 4K)', 'night', ph=4,
     ev=[(0.4, 'sfx', 'gremlin_sneak'), (1.0, 'mark', 'strike'), (1.0, 'sfx', 'gremlin_flip')])
shot('tr_gremlin_wobbles', 'Wobbles silhouette (night)', 'night', ph=3, ev=[(0.4, 'sfx', 'wobble')])
shot('tr_gremlin_phasey', 'REAL Phasey drifts in and twists a dream (phase flip); mark "strike" (cinema 4K)', 'night', ph=5,
     ev=[(1.0, 'mark', 'strike'), (1.0, 'sfx', 'ghost_phase')])
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
# REVISED 2: the programming must be visible (requests to the Capture Engineer; marks are what the cut aligns on)
shot('mn_codex_wobbles', 'Codex hero insert: Wobbles (isolated, chrome cropped); mark "act"', 'day', ph=2, ev=[(0.1, 'mark', 'act'), (0.1, 'sfx', 'wobble')])
shot('mn_notebook_circuit', 'Lab Notebook circuit page full-frame (cinema 4K, no debug bar / STAGE)', 'day', ph=3)
shot('pg_split_23', 'SPLIT capture, one 4K frame: room left ~60%, Bot Code column right ~40%; current card lit in sync. Marks: '
     '"drop" (cursor drops BOOP into the column), "flip", "highfive", "listen-a" (BEEP), "listen-b" (quiet), "if-jump", "boop", "xray"',
     'night', ph=14, ev=[(1.0, 'mark', 'drop'), (1.0, 'sfx', 'card_drop'), (2.2, 'sfx', 'gremlin_flip'), (2.2, 'mark', 'flip'),
                         (3.4, 'mark', 'highfive'), (3.4, 'sfx', 'highfive'), (4.3, 'mark', 'listen-a'), (4.3, 'botNote', 'beep'),
                         (5.0, 'mark', 'listen-b'), (5.0, 'botNote', 'quiet'), (6.6, 'mark', 'if-jump'), (7.6, 'mark', 'boop'),
                         (7.6, 'sfx', 'boop'), (9.6, 'mark', 'xray'), (10.6, 'sfx', 'test_pass')])
shot('pg_drag_closeup', 'Editor close-up: cards picked from the tray and dropped into the column, twice. Marks "pick", "drop", "pick-2", "drop-2"', 'day', ph=8,
     ev=[(0.5, 'mark', 'pick'), (0.5, 'sfx', 'card_pick'), (1.3, 'mark', 'drop'), (1.3, 'sfx', 'card_drop'),
         (4.0, 'mark', 'pick-2'), (4.0, 'sfx', 'card_pick'), (4.8, 'mark', 'drop-2'), (4.8, 'sfx', 'card_drop')])
shot('pg_if_anatomy', 'Card Guide: the IF card anatomy opens; mark "open"', 'day', ph=4, ev=[(0.3, 'mark', 'open'), (0.3, 'sfx', 'ui_click')])
shot('pg_test_strip', 'Test all: the strip fills with checks (editor visible); mark "test"', 'day', ph=5,
     ev=[(0.3, 'mark', 'test'), (0.3, 'sfx', 'ui_click'), (1.0, 'sfx', 'test_pass')])
shot('pg_step_scrub', 'Step mode / timeline scrub, the one-way measurement snap; mark "snap"', 'day', ph=4,
     ev=[(1.0, 'mark', 'snap'), (1.0, 'sfx', 'snap_measure')])
shot('pg_snippets_doodle', 'Snippet library insert + a doodle comment on the program; mark "snippet"', 'day', ph=4,
     ev=[(0.5, 'mark', 'snippet'), (0.5, 'sfx', 'card_drop')])
shot('pg_export_qiskit', 'Text view -> "Export to Qiskit" (the code is shown, legible); mark "export"', 'day', ph=4,
     ev=[(0.5, 'mark', 'export'), (0.5, 'sfx', 'ui_click')])
shot('me_23_drag', 'Mechanic: the 2-3 decoder written by drag-and-drop (IF a BEEP and b QUIET -> BOOP q1 ...), normal layout, '
     'editor fully visible. Marks "pick", "drop" (last card), "done"', 'day', 'ui', ph=8,
     ev=[(0.6, 'mark', 'pick'), (0.6, 'sfx', 'card_pick'), (1.6, 'sfx', 'card_drop'), (3.2, 'sfx', 'card_drop'), (4.6, 'mark', 'drop'),
         (4.6, 'sfx', 'card_drop'), (5.4, 'mark', 'done')])
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
    """shot_sources.json (the registry: Capture Engineer + Director) first, then the legacy candidate names,
    then videos/{capture,motion}/<id>, the Editor's motion_ext and precomp dirs, else the placeholder."""
    al = _aliases().get(sid)
    if al and os.path.exists(E.rel(al)):
        return al, 'alias'
    for cand in REAL.get(sid, []) + [f'capture/{sid}', f'motion/{sid}', f'final/work/motion_ext/{sid}', f'final/work/precomp/{sid}']:
        for ext in ('.mkv', '.mov', '.mp4'):
            p = f'videos/{cand}{ext}'
            if os.path.exists(E.rel(p)):
                return p, cand.split('/')[0] if not cand.startswith('final') else cand.split('/')[2]
        fp = f'videos/{cand}_fill.mkv'
        if os.path.exists(E.rel(fp)):
            return fp, cand.split('/')[0]
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
             section=None, cues=(), beat_frame=None, grade=None, exempt=None, note=None, continuous=False, windows=None):
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
        if getattr(self, '_shot_cam', None):
            c['camera'] = self._shot_cam
            c['camera_from'] = 'capture camera.json (clamped to the push-in cap)'
            self._shot_cam = None
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
        if windows:
            c['windows'] = windows
            c['note'] = (c.get('note', '') + ' split screen: room + Bot Code windows (split_frame)').strip()
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
def motion_markers(name):
    for d in ('videos/motion', 'videos/final/work/motion_ext'):
        p = E.rel(f'{d}/{name}.json')
        if os.path.exists(p):
            return E.load_json(p).get('markers', {})
    return {}


def motion_frames(name, default):
    for d in ('videos/motion', 'videos/final/work/motion_ext'):
        p = E.rel(f'{d}/{name}.json')
        if os.path.exists(p):
            return E.load_json(p).get('frames', default)
    return default


SPLIT_FRAME_DEFAULT = {'left': [28, 28, 1124, 1024], 'right': [1196, 104, 696, 948]}


def split_windows(sid):
    """Split-screen windows for a full-UI capture: the ROOM (left of the editor, between the top bar and the
    controls) into split_frame's left window, the Bot Code column (.editor) into its right window, top-anchored.
    Rects come from the capture's own layout.json (CSS px of a 1920x1080 page); defaults are the normal layout's
    measured boxes (sample-23-night: topbar 0-64, editor x1300 w620, controls from y1026) until the capture lands."""
    m = motion_markers('split_frame')
    L = m.get('left_window_xywh_1080', SPLIT_FRAME_DEFAULT['left'])
    Rr = m.get('right_window_xywh_1080', SPLIT_FRAME_DEFAULT['right'])
    top, ctl, ed = 64, 1002, [1300, 64, 620, 1016]  # 1002 = the timeline strip's top
    src, _ = resolve(sid)
    lj = side(src, '.layout.json') if not src.startswith('@') else None
    if lj:
        segs = E.load_json(lj).get('segments', [])
        first = lambda sel: next((g['rects'][0] for g in segs if g['sel'] == sel and g.get('rects')), None)
        ed = first('.editor') or ed
        tb, ct, tl = first('.topbar'), first('.controls'), first('.timeline')
        top = tb[1] + tb[3] if tb else top
        ctl = ct[1] if ct else ctl
        if tl and top < tl[1] < ctl:  # keep the game's timeline strip out of the room window
            ctl = tl[1]
    n = lambda x, y, w, h: [x / 1920, y / 1080, w / 1920, h / 1080]
    return [dict(name='room', src=n(0, top, ed[0], ctl - top), dst=L),
            dict(name='bot_code', src=n(*ed), dst=Rr, anchor_y=0.0)]


def build_trailer(cue, music_key='song'):
    """The trailer on cue sheet v2 (112.5 BPM 3/4, beat k = 50 + 32k). Every frame below comes from the cue
    sheet's sections/named_hits/cut_rules, the Motion Designer's impact markers and the capture marks; the
    validator re-checks the grid, the waltz rules and the montage cut frames."""
    cs = E.load_cue_sheet(cue, FPS)
    H_ = cs['hits']
    S_ = cs['sections']
    B = Builder('trailer', 'cinema', (2560, 1440), [
        dict(name='trailer_1080p', size=[1920, 1080], path='videos/final/trailer.mp4', zoom_cap=1.8),
        dict(name='trailer_master_1440p', size=[2560, 1440], path='videos/final/trailer_master_1440p.mp4', zoom_cap=1.4)], cue)
    B.e['audio']['music'] = cs['raw'].get('file')
    B.e['sections'] = [dict(name=k, start=v[0], end=v[1]) for k, v in S_.items()]
    beat = lambda k: 50 + 32 * k

    def put(sid, a, b, align=None, in_f=0, **o):
        assert B.t == a, f'{sid}: timeline at {B.t}, wanted {a}'
        al = (align[0], align[1] - a) if align else None  # (mark/event, timeline frame it must land on)
        on = o.pop('on_beat', True)
        flags = set(o.pop('flags', [])) | ({'on_beat'} if on and B.e['clips'] else set())
        return B.clip(sid, b - a, align=al, in_s=in_f / FPS, flags=flags, beat_frame=o.pop('beat_frame', a) if B.e['clips'] else None, **o)

    def cap_motion(text, clip_or_src, start, end, legible, position='top_third', overlay=None, style='night'):
        c = dict(text=text, start=int(start), end=int(end), legible_from=int(legible), position=position, style=style)
        c['render'] = dict(overlay) if overlay else {'baked': clip_or_src}
        c['id'] = f'cap{len(B.e["captions"]) + 1:02d}'
        B.e['captions'].append(c)

    def hook_card(name, text, start, end, offset=None):
        """Critic fix 3: the rule in words. Motion 'card' scene (same letter-collapse look as the other cards),
        rendered by tools/video/assemble/hook_cards.sh into videos/final/work/motion_ext/<name>_{fill,matte}.mkv."""
        mk = motion_markers(name)
        ov = {'fill': f'videos/final/work/motion_ext/{name}_fill.mkv', 'matte': f'videos/final/work/motion_ext/{name}_matte.mkv',
              'in': 0, 'frames': motion_frames(name, end - start), 'hold': True, 'shadow': {'sigma': 24, 'gain': 2.5, 'opacity': 0.8}}
        if offset:
            ov['offset'] = offset
        cap_motion(text, None, start, end, start + mk.get('text_legible', 18), position='top_third', overlay=ov)
        B.e['captions'][-1]['hook'] = True

    push = lambda z0, z1, cx=.5, cy=.5: [(0, z0, cx, cy, 'linear'), (1, z1, cx, cy, 'inout')]
    hit = H_['peek_collapse']                       # 434
    tp_imp = motion_markers('title_peek').get('impact', 96)
    tp_a = hit - tp_imp                             # 338: title_peek placed so its shatter lands on the hit
    # ── cold_open: moonlit blanket + the dreams card (alpha) ──
    put('tr_cold_blanket', 0, tp_a, in_f=0, camera=push(1.0, 1.15), on_beat=False, section='cold_open')
    dm = motion_markers('card_dreams_alpha')
    d_a = 30
    cap_motion('Every Qubble dreams two dreams at once.', None, d_a, d_a + 288, d_a + dm.get('text_legible', 41),
               overlay={'fill': 'videos/motion/card_dreams_alpha_fill.mkv', 'matte': 'videos/motion/card_dreams_alpha_matte.mkv', 'in': 0})
    # ── peek: title_peek (Motion: cursor -> P collapses -> spiral shatter on the hit -> black) ──
    put('title_peek', tp_a, tp_a + 116, grade='none', section='peek',
        cues=[dict(name='peek_collapse_impact', frame=hit, kind='design', note='signature #1')])
    B.mark('flash', hit, hit + 2, 'shatter flash (baked in title_peek)')
    B.mark('exempt', hit, tp_a + 116, 'baked spiral shatter')
    sweep_a = beat(15)                              # 530: title letters collapse on 8ths (real capture)
    put('@black', tp_a + 116, sweep_a, flags=['intentional_black', 'intentional_hold'], on_beat=False, continuous=True, section='peek')
    B.mark('black', tp_a + 109, sweep_a, 'after the shatter: black + reverb tail')
    put('tr_title_peek', sweep_a, S_['peek'][1], align=('hit-E4', sweep_a + 16), grade='day', section='peek',
        cues=[dict(name='title_letters_pitched', frame=sweep_a + 16, kind='design', note='signature #2: one pitched peek per letter, every 16 f')])
    hook_card('hook_look_alpha', 'Look… and it\'s gone.', tp_a + 116, tp_a + 256)   # f454-594 (Critic fix 3)
    # ── build (REVISED 2): night falls (relight, 1 bar), then three gremlin beats, each the REAL gremlin with its alpha
    #    card over it: Flipper (k24) · Phasey (k27, 2 bars) · Wobbles (k33, 2 bars). All cuts on downbeats. ──
    put('tr_relight', S_['build'][0], beat(24), align=('relight', S_['build'][0] + 8), speed=2, grade='night', section='build',
        transition='relight', camera=push(1.0, 1.06))
    rl = B.e['clips'][-1]
    rl['scdet_exempt'] = [[rl['start'], rl['start'] + rl['dur']]]
    B.mark('dissolve', rl['start'], rl['start'] + rl['dur'], 'in-place day->night relight (in-engine)')
    # strike offsets: Flipper on beat 1 of its bar (+24 f lead-in); Phasey on beat 2; Wobbles on beat 2 (+63: the delivered
    # take is 213 f with the strike at f63, so the clip starts at its first frame)
    gremlins = (('tr_gremlin_flipper', 'card_gremlins_alpha', 'Gremlins flip bits.', beat(24), beat(27), S_['build'][0] + 16, 24),
                ('tr_gremlin_phasey', 'card_ghosts_alpha', 'Ghosts flip phases.', beat(27), beat(33), beat(27), 32),
                ('tr_gremlin_wobbles', 'card_wobbles_alpha', 'Wobbles flips… halfway.', beat(33), S_['build'][1], beat(33), 63))
    for sid, card, txt, a, b, cap_a, off in gremlins:
        put(sid, a, b, align=('strike', a + off), grade='night', section='build', camera=push(1.0, 1.08),
            note='REVISED 2: the real gremlin + its alpha card')
        mk = motion_markers(card) or motion_markers(card.replace('_alpha', ''))
        cap_motion(txt, None, cap_a, b, cap_a + mk.get('text_legible', 28),
                   overlay={'fill': f'videos/motion/{card}_fill.mkv', 'matte': f'videos/motion/{card}_matte.mkv', 'in': 0,
                            'frames': motion_frames(card, b - cap_a), 'shadow': {'sigma': 24, 'gain': 2.5, 'opacity': 0.8}})
    # Honesty (Director): the gremlin beats are the game's X-ray replay with the HUD hidden; say so, small, top-right
    xm = motion_markers('tag_xray_alpha')
    x0, x1 = beat(24), S_['build'][1]                       # f818-1298, all three gremlin beats
    cap_motion('X-ray · simulator view', None, x0, x1, x0 + xm.get('text_legible', 14), position='top_third',
               overlay={'fill': 'videos/final/work/motion_ext/tag_xray_alpha_fill.mkv',
                        'matte': 'videos/final/work/motion_ext/tag_xray_alpha_matte.mkv', 'in': 0,
                        'frames': motion_frames('tag_xray_alpha', 96), 'hold': True, 'offset': [640, 0],
                        'shadow': {'sigma': 12, 'gain': 2.5, 'opacity': 0.7}})
    B.e['captions'][-1]['label'] = True  # a HUD-style tag: not a competing caption (validator)
    beep = H_['bot_beep']
    # ── silence: true black (two beats of true silence) -> the antenna lights on the BEEP ──
    put('@black', S_['silence'][0], beep, flags=['intentional_black', 'intentional_hold'], section='silence',
        cues=[dict(name='silence', frame=S_['silence'][0], kind='design', note='music hard-stops; room tone -60 dBFS')])
    B.mark('black', S_['silence'][0], beep, 'true silence; the BEEP is the rescue')
    B.mark('hold', S_['silence'][0], beep, 'silence')
    lr = motion_markers('logo_reveal')
    drop = H_['drop']
    logo_a = drop - lr.get('impact', 6)             # 1388: the logo's own glitch tear runs into the impact on the drop
    put('tr_bot_antenna', beep, logo_a, align=('beep', beep), grade='night', section='silence',
        cues=[dict(name='bot_beep_dry', frame=beep, kind='design', note="single dry BEEP: the lead's first note")])
    # ── drop: logo_reveal (glitch tear baked in = the trailer's one glitch; impact on the drop), then on the next
    #    downbeat a HARD CUT to the editor (cards dragged into the column) under "You don't play it. You program it." ──
    D0, D1 = S_['drop']
    ed = beat(45)                                   # 1490: second downbeat of the drop
    put('logo_reveal', logo_a, ed, grade='none', section='drop', beat_frame=drop,
        cues=[dict(name='drop_impact', frame=drop, kind='design')])
    B.e['clips'][-1]['baked_transition'] = 'glitch'
    B.mark('exempt', logo_a, drop + 8, 'baked glitch tear + impact flash')
    B.mark('flash', drop, drop + 6, 'logo impact flash')
    put('pg_drag_closeup', ed, D1, align=('drop', ed + 64), grade='day', section='drop',
        note='REVISED 2: the editor, a card dragged into the Bot Code column (drop on the beat)')
    # Motion fix round 2 (Director): card_program_alpha_160 placed at f1426, fully gone by the proof (f1586).
    # Falls back to the _long cut until the 160 render is registered.
    pname = 'card_program_alpha_160' if os.path.exists(E.rel('videos/motion/card_program_alpha_160_fill.mkv')) else 'card_program_alpha_long'
    pm = motion_markers(pname)
    p_a = 1426 if pname.endswith('_160') else drop
    pf = motion_frames(pname, S_['proof'][0] - p_a)
    cap_motion("You don't play it. You program it.", None, p_a, S_['proof'][0], p_a + pm.get('text_legible', 18), position='card',
               overlay={'fill': f'videos/motion/{pname}_fill.mkv', 'matte': f'videos/motion/{pname}_matte.mkv',
                        # the _160 card is laid out in the lower third of its own frame (text y 790/920): no offset.
                        # (+360 was for the old centred _long card; on _160 it pushed the plate off-screen.)
                        'in': 0, 'frames': pf, 'offset': [0, 0] if pname.endswith('_160') else [0, 360],
                        'shadow': {'sigma': 24, 'gain': 2.5, 'opacity': 0.8}})
    B.e['captions'][-1]['motion_asset'] = pname
    # ── proof (REVISED 2): SPLIT SCREEN, room left ~60% / Bot Code column right ~40% (one 4K capture, pg_split_23),
    #    each card lit on its beat; steps 1/2/1/2 bars: the cursor drops BOOP into place (k48) -> HIGHFIVE, LISTEN a BEEP,
    #    LISTEN b quiet (k51) -> IF a BEEP and b QUIET -> BOOP q2 (k57) -> X-ray (k60). split_frame (Motion) frames it. ──
    P0, P1 = S_['proof']
    # Motion fix round 2 (Director): SIX 96-frame segments of pg_split_23 so every morning action is on screen
    # (BOOP drag · HIGHFIVE · LISTEN a · LISTEN b + IFs · BOOP q2 · X-ray intact). Crops in capture CSS px
    # (1920x1080 page): the room window leaves out the toast and Schrodi's box; the code window follows the lit card.
    po = {}
    for d in ('videos/motion', 'videos/final/work/motion_ext'):
        if os.path.exists(E.rel(f'{d}/proof_overlay.json')):
            po = E.load_json(f'{d}/proof_overlay.json')
            break
    segs = po.get('segs_trailer') or [dict(start=P0 + 96 * i, dur=96, src_in=x) for i, x in enumerate((124, 980, 1300, 1420, 1600, 1749))]
    segs = [dict(start=g.get('start', g.get('t')), dur=g.get('dur', 96), src_in=g.get('src_in', g.get('in'))) for g in segs]
    room_css = po.get('room_window_src_css', [240, 124, 838, 763])
    code_ys = [r[1] if isinstance(r, (list, tuple)) else r for r in (po.get('code_window_src_css_per_seg') or [565, 64, 160, 250, 565, 565])]
    code_css = lambda y: [1570, y, 350, 476.7]
    act = po.get('action_frames_trailer') or {}
    n_ = lambda x, y, w, h: [x / 1920, y / 1080, w / 1920, h / 1080]
    L_ = SPLIT_FRAME_DEFAULT['left']
    R_ = SPLIT_FRAME_DEFAULT['right']
    names = ('BOOP drag', 'HIGHFIVE', 'LISTEN a', 'LISTEN b + IFs', 'BOOP q2', 'X-ray, intact')
    assert segs[0]['start'] == P0 and segs[-1]['start'] + segs[-1]['dur'] == P1, 'proof segments must tile f1586-2162'
    for i, g in enumerate(segs):
        wins = [dict(name='room', src=n_(*room_css), dst=L_), dict(name='bot_code', src=n_(*code_css(code_ys[i])), dst=R_, anchor_y=0.0)]
        last = i == len(segs) - 1
        put('pg_split_23', g['start'], g['start'] + g['dur'], in_f=g['src_in'], grade='night', section='proof', windows=wins,
            transition='xray-dissolve' if last else 'cut', note=f'proof step {i + 1}/6: {names[i]}')
        B.e['clips'][-1]['punch_native'] = True  # code window 700 px -> 696 px at 1080p (native); the 1440p master upscales it
    B.exempt_event(B.e['clips'][-1], 'xray', before=4, after=72, why='in-engine X-ray dissolve')
    # captions on the real action frames (Director decision): "It's #2." on the LISTEN-b BEEP·BEEP result,
    # "Fix it. Never look." landing EXACTLY on the BOOP and held to the end of the proof. Never two texts at once:
    # "It's #2." ends on the BOOP frame. Trailer reading rule: max(1.2 s, 0.3 s/word + 0.4 s) from full legibility.
    beep_b = act.get('listen_b', 1913)
    boop_t = act.get('boop_q2', 2010)
    room_dx = -370  # centre the cards over split_frame's room window (x 28..1152 -> centre 590 vs frame centre 960)
    w_a = beep_b + 2
    hook_card('hook_its2_alpha', "It's #2.", w_a, boop_t, offset=[room_dx, 0])
    B.e['captions'][-1]['note'] = f'on the BEEP·BEEP result ({beep_b}); ends on the BOOP ({boop_t}) so the cards never overlap'
    hook_card('hook_fix_alpha', 'Fix it. Never look.', boop_t, P1 - 6, offset=[room_dx, 0])
    B.e['captions'][-1]['note'] = f'lands exactly on the BOOP ({boop_t}), held to {P1 - 6}'
    B.e['overlays'].append(dict(id='split_frame', fill='videos/motion/split_frame_fill.mkv', matte='videos/motion/split_frame_matte.mkv',
                                start=P0, dur=P1 - P0, frames=motion_frames('split_frame', P1 - P0), note='REVISED 2: split-screen frame'))
    B.e['overlays'].append(dict(id='proof_overlay', fill='videos/motion/proof_overlay_fill.mkv', matte='videos/motion/proof_overlay_matte.mkv',
                                start=P0, dur=P1 - P0, frames=motion_frames('proof_overlay', 576),
                                note='Motion fix round 2: card pop/glow/ring over the lit cards (above split_frame)'))
    # ── montage (REVISED 2): the cue sheet's 12 cut frames (96 -> 64 -> 32), alternating PROGRAMMING / WORLD ──
    cuts = (cs['raw'].get('cut_rules') or {}).get('montage_cut_frames') or [S_['montage'][0] + 96 * i for i in range(7)]
    cuts = list(cuts) + [S_['montage'][1]]
    # Critic fix 4: every programming cut punches in to 2.0x on its feature (native 1:1 from the 3840 capture for the
    # 1080p delivery; regions measured on the captures' frames, CSS units of the 1920x1080 page).
    punch = lambda z, cx, cy: [(0, z - 0.04, cx, cy, 'linear'), (1, z, cx, cy, 'linear')]
    plan = [('pg_drag_closeup', 'pick-2', 24, 'day', punch(2.0, .75, .25)),      # P: the card dragged into the column
            ('mn_schrodi_checklist', 'highfive-1', 32, 'day', None),             # W
            ('pg_if_anatomy', 'open', 8, 'day', punch(2.0, .484, .352)),         # P: the IF anatomy diagram + callouts 1-3
            ('mn_highfive', 'highfive', 8, 'day', None),                         # W
            ('pg_test_strip', 'test', 8, 'day', punch(2.0, .507, .25)),          # P: the test strip row of checks
            ('mn_dream_map', None, 90, 'day', None),                             # W
            ('pg_step_scrub', 'snap', 8, 'day', punch(1.6, .458, .313)),         # P: "Snap! Measurements are a one-way door" + the BEEP
            ('mn_codex_wobbles', 'act', 4, 'day', None),                         # W
            ('pg_snippets_doodle', 'doodle-smile', 8, 'day', punch(2.0, .5, .5)),  # P: the doodle note (smiley being drawn)
            ('mn_notebook_circuit', 'circuit', 4, 'day', punch(1.08, .5, .5)),   # W: the notebook's Circuit page (gates, red X)
            ('pg_export_qiskit', 'qiskit-code', 4, 'day', punch(2.0, .25, .40)),  # P: the Qiskit code panel
            ('mn_shor9', 'strike', 4, 'night', None)]                            # W
    for (sid, mk, off, gr, cam), a, b in zip(plan, cuts, cuts[1:]):
        kw = dict(grade=gr, section='montage')
        if cam:
            kw['camera'] = cam
        if mk:
            put(sid, a, b, align=(mk, a + off), **kw)
        else:
            put(sid, a, b, in_f=off, **kw)
        B.e['clips'][-1]['montage_kind'] = 'programming' if sid.startswith('pg_') else 'world'
        if cam and max(k[1] for k in cam) > 1.4:
            B.e['clips'][-1]['punch_native'] = True  # validator: native 1:1 allowed for the 1080p delivery (Critic fix 4)
    # ── audio (REVISED 2): the song carries the arc; the game's own coding groove is LAYERED under the split-screen proof
    #    and the whole montage (one span, so every music change sits on a downbeat: k48 in, k87 out). The card UI sounds
    #    (card_pick / card_drop / ui_click) come from each capture's events, frame-exact on the drags and drops. ──
    B.e['audio']['score_segments'] = [dict(
        name='coding_groove', src='videos/audio2/score_segments/coding_groove.wav', start=P0, end=S_['montage'][1], src_in=0,
        layer='under_song', gain_db=-4.0, fade_in=0, fade_out=32, downbeats=[P0, S_['montage'][1]],
        note='REVISED 2: the game build groove + card UI sounds under the programming; Sound Designer owns the asset and the levels')]
    # ── lights_out: black, the syndrome chord twice (the capture has it once: repeat the moment) ──
    L0, L1 = S_['lights_out']
    put('mn_lights_out', L0, L0 + 96, align=('chord-1', L0 + 16), grade='night', flags=['intentional_black'], section='lights_out')
    put('mn_lights_out', L0 + 96, L1, align=('chord-1', L0 + 112), grade='night', flags=['intentional_black'], section='lights_out',
        continuous=True, note='repeat: the chord a second time')
    B.mark('black', L0, L1, 'Lights Out: the montage breath')
    B.mark('hold', L0, L1, 'Lights Out')
    # ── payoff: stars on the slam (push into the small win card), then the curtain call ──
    Y0, Y1 = S_['payoff']
    put('tr_morning_check', Y0, Y0 + 192, align=('win', Y0), grade='day', section='payoff',
        camera=[(0, 1.2, .5, .5, 'linear'), (1, 1.4, .5, .48, 'out')])
    put('tr_curtain_call', Y0 + 192, Y1, in_f=120, grade='day', section='payoff', camera=[(0, 1.25, .5, .5, 'linear'), (1, 1.0, .5, .5, 'out')])
    # ── closing: "It's just a game…" held through the silence until the snap ──
    C0 = S_['closing_musicbox'][0] if 'closing_musicbox' in S_ else S_['closing'][0]
    snap = H_['snap_circuit_reveal']
    put('card_justagame_288', C0, snap, grade='none', section='closing')
    jm = motion_markers('card_justagame_288') or motion_markers('card_justagame')
    cap_motion("It's just a game…", 'card_justagame_288', C0, snap, C0 + jm.get('text_legible', 33), style='day')
    sil = H_.get('closing_silence', snap - 96)
    B.mark('hold', sil, snap, 'the held card in the silence before the snap')
    # ── snap: the program becomes the real circuit, the closing line ──
    E0 = S_['end_card'][0]
    cm = motion_markers('mo_circuit_morph')
    put('mo_circuit_morph', snap, E0, grade='none', section='snap_circuit_reveal',
        cues=[dict(name='snap', frame=snap, kind='design', note='signature #3: dry snap = snap_measure + paper whip + peek transient')])
    # Motion fix round 2: the morph is re-rendered 32 f earlier: the line starts ~3760, fully legible at 3790 (Director)
    cap_motion('…where you accidentally learned quantum error correction.', 'mo_circuit_morph', snap + 62, E0, snap + 92)
    B.e['captions'][-1]['note'] = 'start 3760 / legible 3790 per the Director (morph re-render 32 f earlier); recheck vs mo_circuit_morph.json'
    B.e['captions'][-1]['closing_line'] = True
    B.e['captions'][-1]['rect'] = [200, 745, 1520, 165]  # the line's band in mo_circuit_morph (1080p), measured from the render
    put('mo_end_card', E0, S_['end_card'][1], grade='none', section='end_card')
    return B.done()


# ───────────────────────── mechanic (Critic §5 table, re-timed to the capture marks) ─────────────────────────
def S(x):
    return int(round(x * FPS))


def mark(sid, name, n=0):
    src, _ = resolve(sid)
    f = find_event(src, name, n)
    if f is None:
        raise SystemExit(f'{sid}: mark {name} not found')
    return f


BLANKET = dict(matte='videos/motion/blanket_wipe_reveal.mkv',
               overlay={'fill': 'videos/motion/blanket_wipe_fill.mkv', 'matte': 'videos/motion/blanket_wipe_matte.mkv'})


def strip_cap(B, text, start, end, gloss=None, gloss2=None):
    """A bottom-strip caption: Schrödi's in-game lines are the narration, so these are short lines and/or
    '= real term' gloss chips (Motion Designer caption scene; tools/video/assemble/motion_captions.py renders them)."""
    full = ' '.join(x for x in (text, gloss, gloss2) if x)
    B.cap(full, start, end, 'strip')
    B.e['captions'][-1].update(line=text, gloss=gloss, gloss2=gloss2, legible_from=int(start + 24))


def build_mechanic():
    B = Builder('mechanic', 'strip', (1920, 1080), [dict(name='mechanic_1080p', size=[1920, 1080], path='videos/final/mechanic.mp4', zoom_cap=1.8)])
    B.e['strip_overlay'] = True
    push = lambda z0, z1, cx=.5, cy=.5: [(0, z0, cx, cy, 'linear'), (1, z1, cx, cy, 'inout')]
    # REVISED 2: the program must stay visible whenever the room acts. The editor fills the right column at full height
    # (css 1300..1920 x 64..1080), so the only safe push anchors right/bottom, <= 1080/1016 = 1.063x (crops the top bar
    # and the room's left edge). The validator checks every program_visible clip against its layout.json .editor box.
    prog = lambda z1=1.06: [(0, 1.0, 1.0, 1.0, 'linear'), (1, z1, 1.0, 1.0, 'inout')]
    B.e['program_visible'] = True
    # 0:00 cold open
    B.clip('me_cold_blanket', S(6), in_s=0.5, camera=push(1.0, 1.12), section='cold_open', grade='night')
    strip_cap(B, 'Every Qubble dreams two dreams at once.', S(0.4), S(5.9))
    # 0:06 the rule: 1-1 PEEK -> collapse, then the X-ray replay shows the lost half
    a = B.t
    B.clip('me_11_peek', 625, in_s=230 / FPS, section='rule', camera=prog())
    col = a + mark('me_11_peek', 'collapse') - 230
    B.clip('me_11_peek', S(24) - B.t, in_s=1140 / FPS, section='rule', camera=prog())
    B.exempt_event(B.e['clips'][-1], 'collapse-xray', before=30, after=60, why='in-engine X-ray replay')
    strip_cap(B, 'Looking changes it.', col + 6, S(23.6), gloss='= measurement')
    # 0:24 the threat
    a = B.t
    B.clip('me_threat', S(14), in_s=90 / FPS, section='threat', camera=prog())
    fl = a + mark('me_threat', 'flip') - 90
    strip_cap(B, "One dream changed. Which one? You can't look.", fl + 10, S(37.8))
    # 0:38 can't copy: the checklist shares the dream across three Qubbles
    a = B.t
    B.clip('me_encode', S(12), in_s=90 / FPS, section='cant_copy', camera=prog())
    strip_cap(B, "You can't copy a dream. You can share it.", a + mark('me_encode', 'highfive-1') - 90, S(49.8), gloss='= encoding')
    # 0:50 ask, don't look: 2-1 in 10 s, then the 4-row syndrome table
    a = B.t
    B.clip('me_21_listen', S(10), in_s=340 / FPS, section='ask', camera=prog())
    strip_cap(B, 'A bot asks: do these two match?', a + mark('me_21_listen', 'highfive') - 340, S(59.8), gloss='= parity check')
    a = B.t
    B.clip('mo_syndrome_table', S(15), grade='none', section='ask')
    strip_cap(B, 'Two bots, four answers: each points at one Qubble.', a + 60, S(74.8), gloss='= syndrome')
    # 1:15 the repair: a full 2-3 night (flip, BEEP, the caretaker BOOPs q1), Test all fills the strip
    # REVISED 2: first the decoder is WRITTEN, card by card (drag-and-drop), then the night runs it
    a = B.t
    B.clip('me_23_drag', 300, align=('drop', 240), section='repair', camera=prog())
    strip_cap(B, 'Write the fix: IF a BEEP and b QUIET, BOOP #1.', a + 20, a + 296, gloss='= decoder')
    a = B.t
    B.clip('me_23_night', 960, in_s=640 / FPS, section='repair', camera=prog())
    B.clip('me_23_night', 260, in_s=1850 / FPS, section='repair', camera=prog())
    strip_cap(B, 'Fixed in the dark, without ever looking.', a + mark('me_23_night', 'boop') - 640, B.t - 12, gloss='= error correction')
    D = B.t - S(98)                                  # the drag beat lengthens the video by D frames from here on
    # 1:38 the proof: the X-ray replay + inspector
    a = B.t
    B.clip('me_23_xray', 540, in_s=100 / FPS, section='proof', camera=prog())
    B.exempt_event(B.e['clips'][-1], 'xray-replay', before=10, after=60, why='in-engine X-ray')
    B.clip('me_23_xray', S(112) + D - B.t, in_s=1290 / FPS, section='proof', camera=prog())
    strip_cap(B, 'The dream survived. The bots never learned it.', a + 30, S(111.8) + D)
    # 1:52 the twist: the phase ghost hides from bit checks; the SPIN sandwich
    a = B.t
    B.clip('me_31_phase', 400, in_s=0, section='twist', camera=prog())
    B.clip('me_31_phase', 240, in_s=1240 / FPS, section='twist', camera=prog())
    B.clip('me_31_phase', S(128) + D - B.t, in_s=2440 / FPS, section='twist', camera=prog())
    strip_cap(B, 'Every bot is quiet, yet the dream is wrong.', a + 20, a + 600)
    strip_cap(B, 'SPIN, fix, SPIN.', a + 620, S(127.8) + D, gloss='= phase-flip code')
    # 2:08 close: "It's just a game…" -> the program becomes the real circuit -> Qiskit stamp -> end card
    a = B.t
    B.clip('card_justagame', 192, grade='none', section='close')
    a = B.t
    B.clip('mo_circuit_morph', 420, grade='none', section='close', cues=[dict(name='snap', frame=a, kind='design')])
    B.clip('mo_qiskit_stamp', 300, grade='none', section='under_the_hood')
    B.clip('mo_end_card', 360, grade='none', section='end_card')
    # the Motion pieces' own texts, for the reading-time and contrast gates
    for c in B.e['clips']:
        if c['shot'] in ('card_justagame', 'mo_circuit_morph'):
            mk = motion_markers(c['shot'])
            lf = c['start'] + mk.get('text_legible', mk.get('line_legible', 30))
            txt = "It's just a game…" if c['shot'] == 'card_justagame' else '…where you accidentally learned quantum error correction.'
            B.e['captions'].append(dict(id=f'cap{len(B.e["captions"]) + 1:02d}', text=txt, start=c['start'] + (0 if 'card' in c['shot'] else 96),
                                        end=c['start'] + c['dur'] if 'card' in c['shot'] else c['start'] + c['dur'] + 300,
                                        legible_from=lf, position='baked', style='night', render={'baked': c['shot']}))
    return B.done()


# ───────────────────────── showcase (Critic §6; captures are 1080p normal layout) ─────────────────────────
HEROES = {'1-1': 'Dont Wake Them', '2-3': 'Who Got Flipped?', '3-1': 'Somethings Off', '3-3': 'Wobbles', '4-1': 'Nesting Dolls'}


def build_showcase():
    B = Builder('showcase', 'strip', (1920, 1080), [dict(name='showcase_1080p', size=[1920, 1080], path='videos/final/showcase.mp4', zoom_cap=1.8)])
    B.e['strip_overlay'] = True
    W = 'blanket-wipe'

    def wipe_clip(*a, **k):
        c = B.clip(*a, transition=W, **k)
        c['transition'].update(BLANKET)
        return c
    B.clip('sc_grid16', S(5), grade='none', section='open', note='4x4: all 16 levels solving at once (precomposed)')
    strip_cap(B, 'Sixteen levels. Every solution verified.', S(0.3), S(4.9))
    B.clip('sc_title_peek', S(6), in_s=50 / FPS, section='open')
    a = B.t
    B.clip('sc_dream_map', S(6), in_s=88 / FPS, section='open')
    strip_cap(B, 'The dream map', a + 30, B.t - 10)

    def hero(lv, ch, secs, gloss, first=True, in_f=20):
        n = S(secs)
        src_n = E.probe(resolve(f'sc_lv_{lv}')[0])[2] if os.path.exists(E.rel(resolve(f'sc_lv_{lv}')[0])) else 900
        v = round(min(4.0, max(1.0, (src_n - in_f - 40) / n)), 3)
        fn = wipe_clip if first else B.clip
        c = fn(f'sc_lv_{lv}', n, in_s=in_f / FPS, speed=v, section=ch, note=f'hero level at {v}x')
        strip_cap(B, f'{lv}  {HEROES[lv]}', c['start'] + 20, c['start'] + n - 12, gloss=gloss)

    def strobe(lv, ch):
        wc = mark(f'sc_lv_{lv}', 'win-card')
        B.clip(f'sc_lv_{lv}', 36, in_s=(wc - 6) / FPS, section=ch, note='1-beat strobe: solved')

    def wow(sid, secs, in_f, ch, text, gloss=None):
        a = B.t
        B.clip(sid, S(secs), in_s=in_f / FPS, section=ch)
        strip_cap(B, text, a + 20, B.t - 10, gloss=gloss)
    hero('1-1', 'ch1', 12, '= measurement')
    wow('sc_clone_glitch', 8, 0, 'ch1', "You can't copy a dream.", '= no-cloning')
    for lv in ('0-1', '0-2', '1-2', '1-4'):
        strobe(lv, 'ch1')
    hero('2-3', 'ch2', 14, '= syndrome decoding', in_f=30)
    wow('sc_map_flip', 8, 60, 'ch2', 'The map flips')
    for lv in ('2-1', '2-2', '2-4', '2-5'):
        strobe(lv, 'ch2')
    hero('3-1', 'ch3', 12, '= phase flips')
    hero('3-3', 'ch3', 12, '= small rotations get caught too', first=False)
    strobe('3-2', 'ch3')
    hero('4-1', 'ch4', 12, '= the Shor 9-qubit code', in_f=40)
    wow('sc_lights_out_ear', 10, 1830, 'ch4', 'Lights Out: solve it by ear')
    a = B.t
    wipe_clip('sc_gremlin_lab', S(14), in_s=60 / FPS, section='labs')
    strip_cap(B, 'Gremlin Lab and Night Shift: your code against random gremlins', a + 30, B.t - 10)
    wow('sc_threshold', 12, 90, 'labs', 'Codes only help when noise is rare: below p = ½', '= threshold')
    a = B.t
    wipe_clip('sc_codex_tour', S(18), in_s=80 / FPS, section='codex')
    strip_cap(B, 'The Codex: everything you meet, collected', a + 30, B.t - 10)
    wow('sc_card_guide', 8, 70, 'codex', 'Card Guide: every card explained')
    a = B.t
    wipe_clip('sc_notebook', S(16), in_s=380 / FPS, section='notebook')
    strip_cap(B, "Schrödi's Lab Notebook: the real maths behind each night", a + 30, B.t - 10)
    wow('sc_qol_grid', 15, 80, 'qol', 'Snippets · help slot · step mode · timeline')
    wow('sc_save_joke', 4.5, 0, 'qol', 'Your save data has a 3-qubit repetition code ✓')
    wipe_clip('sc_curtain_call', S(14), in_s=40 / FPS, section='credits')
    B.clip('card_justagame', 192, grade='none', section='close')
    a = B.t
    B.clip('mo_circuit_morph', 372, grade='none', section='close', cues=[dict(name='snap', frame=a, kind='design')])
    B.clip('mo_end_card', 300, grade='none', section='end_card')
    for c in B.e['clips']:
        if c['shot'] in ('card_justagame', 'mo_circuit_morph'):
            mk = motion_markers(c['shot'])
            lf = c['start'] + mk.get('text_legible', mk.get('line_legible', 30))
            txt = "It's just a game…" if c['shot'] == 'card_justagame' else '…where you accidentally learned quantum error correction.'
            B.e['captions'].append(dict(id=f'cap{len(B.e["captions"]) + 1:02d}', text=txt, start=c['start'] + (0 if 'card' in c['shot'] else 96),
                                        end=c['start'] + c['dur'], legible_from=lf, position='baked', style='night', render={'baked': c['shot']}))
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
