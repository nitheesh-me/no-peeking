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
import validate as V  # noqa: E402

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
shot('me_23_decoder', 'CAPTURE BRIEF (Critic mechanic #4): 2-3 build view, one continuous take (~13 s): drop LISTEN b; drag a NEW IF '
     'card in; set its chips a -> BEEP, b -> QUIET; set its target fix1; drop BOOP q1 under fix1; drop END; hold 1.5 s. '
     'Marks: drop-LISTEN, drop-IF, cond-a, cond-b, target, drop-BOOP, drop-END, done', 'day', 'ui', ph=13.0)
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
shot('pg_win_links', "The win card's 'Pros call this…' links (Qiskit / IBM Quantum Learning), 4K, for the qol4 TR quadrant", 'day', 'ui', ph=10)
shot('sc_qol_grid', 'QoL quick-fire 2x2: snippets, doodle comments, help slot, step mode/timeline (precomposed)', 'none', 'pre', ph=16)
shot('sc_save_joke', 'Save data protected by a 3-qubit repetition code (1-2 s)', 'day', 'ui', ph=4)
shot('sc_curtain_call', 'Credits curtain call', 'day', 'ui', ph=16)
shot('sc_morning_still', 'Still morning daycare (closing)', 'day', 'ui', ph=8)
# showcase plan gaps (5 Oct): placeholders until the Capture Engineer / the Editor's precomps deliver them
shot('sc_map_flip_solve', 'Dream-map meta puzzle SOLVED on camera: "Flipper got into the map!", the map-bots blink, the cursor taps '
     'the node the syndrome points to, it flips back (1080p normal UI, quietBubbles)', 'day', 'ui', ph=10)
shot('sc_run_3-3', '3-3 Wobbles, ONE "Run night" at DSF 2 (4K), editor visible, quietBubbles: Wobbles half-flips a Qubble in the dark, '
     'morning LISTENs, the half-flip resolves to a full flip, the IF jumps, BOOP fixes it (for a room | Bot Code split)', 'night', 'ui', ph=14,
     ev=[(4.0, 'sfx', 'wobble'), (7.0, 'botNote', 'beep'), (10.0, 'sfx', 'boop')])
shot('sc_run_4-1', '4-1 Nesting Dolls (Shor-9), ONE "Run night" at DSF 2 (4K), editor visible, quietBubbles: a gremlin strikes one of nine, '
     'the bots LISTEN in rows, the IFs jump, BOOP/SHUSH fix it (for a room | Bot Code split)', 'night', 'ui', ph=16,
     ev=[(4.0, 'sfx', 'gremlin_flip'), (8.0, 'botNote', 'beep'), (12.0, 'sfx', 'boop')])
shot('sc_night_shift', 'Night Shift (endless): a generated night runs, the score ticks up (1080p normal UI, quietBubbles)', 'night', 'ui', ph=12)
shot('sc_qol4', '2x2 quick-fire precomp (Editor, precomp.py sc_qol4): snippets+doodle | step mode scrub | help slot | Export to Qiskit',
     'none', 'pre', ph=12)


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
             section=None, cues=(), beat_frame=None, grade=None, exempt=None, note=None, continuous=False, windows=None, card_focus=False):
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
        if card_focus:
            c['card_focus'] = True
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
        c['id'] = f'cap{sum(1 for x in B.e["captions"] if x["id"].startswith("cap")) + 1:02d}'
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
        if sid in ('tr_gremlin_flipper', 'tr_gremlin_phasey'):
            # the ink-blob heuristic flags the wall decor (clock, shelf, bunting) under these top-left cards at f773/f949;
            # Director confirmed no character/bot/label there (2026-10-05). layout.json sprite boxes are still enforced.
            B.e['captions'][-1]['decor_waiver'] = 'wall decor (clock, shelf, bunting), not characters: Director-reviewed 2026-10-05'
    # Honesty (Director): the gremlin beats are the game's X-ray replay with the HUD hidden; say so, small, top-right
    xm = motion_markers('tag_xray_alpha')
    x0, x1 = beat(24), S_['build'][1]                       # f818-1298, all three gremlin beats
    cap_motion('X-ray · simulator view', None, x0, x1, x0 + xm.get('text_legible', 14), position='top_third',
               overlay={'fill': 'videos/final/work/motion_ext/tag_xray_alpha_fill.mkv',
                        'matte': 'videos/final/work/motion_ext/tag_xray_alpha_matte.mkv', 'in': 0,
                        'frames': motion_frames('tag_xray_alpha', 96), 'hold': True, 'offset': [640, 0],
                        # same dark plate as the proof tag (tag_xray_proof): the soft sigma-12 glow let the light
                        # wall through 6-8 px from the glyphs (4.29:1); this plate measures like the proof tag
                        'shadow': {'dilate': 14, 'sigma': 6, 'gain': 4.0, 'opacity': 0.85}})
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
    # Critic re-review fix 3: the last beat of the proof is a separate X-ray take of the same night with q2 RESTORED
    # (pg_split_23_xray, from its 'q2-restored' mark, inside the 'xray-intact' hold: no confetti / win card).
    # Director decision (re-review): 48 frames, f2114-2162, cut at k64.5 (off the waltz grid) under an explicit
    # GRID WAIVER: X-ray room -> the same X-ray room, same framing and windows, so it is not perceived as a cut.
    # In-point = the 'q2-restored' mark (322): at 306 q2 still carries the BOOP sparkle (not fully restored), so the
    # clip runs source 322-370 inside the 'xray-intact' hold. The toast at src 341+ (css y 76-119) is above the
    # room crop (y >= 124); the bots' BEEP badges blink in the replay (the night's syndrome record, as in T018).
    XR = P1 - 48
    XR_WAIVER = {'rule': '3/4 beat grid', 'reason': 'hidden cut: X-ray room -> same X-ray room (same framing and '
                 'windows), not perceived as a cut; Director decision, trailer re-review', 'frame': XR}
    xr_in = find_event('videos/capture/pg_split_23_xray.mkv', 'q2-restored')
    for i, g in enumerate(segs):
        wins = [dict(name='room', src=n_(*room_css), dst=L_), dict(name='bot_code', src=n_(*code_css(code_ys[i])), dst=R_, anchor_y=0.0)]
        last = i == len(segs) - 1
        end = XR if (last and xr_in is not None) else g['start'] + g['dur']
        put('pg_split_23', g['start'], end, in_f=g['src_in'], grade='night', section='proof', windows=wins,
            transition='xray-dissolve' if last else 'cut', note=f'proof step {i + 1}/6: {names[i]}')
        B.e['clips'][-1]['punch_native'] = True  # code window 700 px -> 696 px at 1080p (native); the 1440p master upscales it
    B.exempt_event(B.e['clips'][-1], 'xray', before=4, after=72, why='in-engine X-ray dissolve')
    if xr_in is not None:
        wins = [dict(name='room', src=n_(*room_css), dst=L_), dict(name='bot_code', src=n_(*code_css(code_ys[-1])), dst=R_, anchor_y=0.0)]
        put('pg_split_23_xray', XR, P1, in_f=xr_in, grade='night', section='proof', windows=wins, on_beat=False,
            note='proof end: X-ray replay, q2 restored (Critic re-review fix 3)')
        B.e['clips'][-1]['punch_native'] = True
        B.e['clips'][-1]['grid_waiver'] = XR_WAIVER
        xm = motion_markers('tag_xray_alpha')
        # HONESTY (Critic sign-off): the label may sit ONLY on frames that visibly show X-ray. T018 (pg_split_23 from
        # its 'xray' mark) still shows solid blankets f2066-2113 (verified frame by frame, 05 Oct); see-through starts
        # exactly on the cut to pg_split_23_xray (XR = f2114). Enter 8 frames into the 14-frame reveal so the tag is
        # fully legible 6 frames after the cut (f2120). Same asset/size/style as the gremlin-beat tag (cap06).
        x_a = XR
        t_in = max(0, xm.get('text_legible', 14) - 6)
        cap_motion('X-ray · simulator view', None, x_a, P1, x_a + xm.get('text_legible', 14) - t_in, position='top_third',
                   overlay={'fill': 'videos/final/work/motion_ext/tag_xray_alpha_fill.mkv',
                            'matte': 'videos/final/work/motion_ext/tag_xray_alpha_matte.mkv', 'in': t_in,
                            'frames': motion_frames('tag_xray_alpha', 96), 'hold': True, 'offset': [-670, 935],
                            'shadow': {'dilate': 14, 'sigma': 6, 'gain': 4.0, 'opacity': 0.85}})
        # HUD tag on the empty floor, bottom-left of the room window (QA 04:16: on the pale day wall it measured 2.16:1
        # and crowded "Fix it. Never look."); a dark plate (dilated matte) carries it on any background
        B.e['captions'][-1]['label'] = True
        B.e['captions'][-1]['id'] = 'tag_xray_proof'  # stable id: does not renumber the cap01..capNN that others reference
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
    # ── lights_out (Critic re-review BLOCKER): ONE continuous dark stretch. The capture is dark (mean luma ~13.5)
    #    through src f1734 and the lights come up at f1735 (measured), so the 192-frame clip must start at <= 1543. Aligning
    #    the chord-1 mark (src 1672) to L0+129 gives src 1543..1734: dark on every frame, the chord at f2962 (k91). ──
    L0, L1 = S_['lights_out']
    put('mn_lights_out', L0, L1, align=('chord-1', L0 + 129), grade='night', flags=['intentional_black'], section='lights_out',
        note='one continuous dark stretch (src 1543-1734); chord-1 lands on k91 (f2962); lights come up at src 1735, never shown')
    lo_c = B.e['clips'][-1]
    assert lo_c['in'] + (L1 - L0) <= 1735, f'Lights Out would show the lights coming up (in {lo_c["in"]})'
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


# ── mechanic (strip layout: the game at 88% on top, the caption strip below) ──
GAME_1080 = (115.2, 0.0, 1689.6, 950.4)   # the strip layout's game rect in 1080p units (E.game_area at 1920x1080)
ROOM_CSS_23 = (240, 124, 838, 763)         # the room crop the trailer proof used (same daycare room; excludes toast + dialogue box)
CODE_W, CODE_H = 350, 476.7                # the Bot Code window crop (css), the trailer's 2x Morning-column window


def mech_split(room_css, code_keys):
    """Split-screen windows inside the strip layout's game rect: split_frame's two windows scaled by 0.88 into
    GAME_1080. code_keys = [(local_f, css_x, css_y[, css_w]), ...]: the code window follows the lit card (eased
    moves); an optional width zooms the column (the height keeps the window's aspect; 4K sources stay native to w>=306)."""
    m = motion_markers('split_frame')
    L = m.get('left_window_xywh_1080', SPLIT_FRAME_DEFAULT['left'])
    Rr = m.get('right_window_xywh_1080', SPLIT_FRAME_DEFAULT['right'])
    gx, gy, gw, gh = GAME_1080
    k = gw / 1920
    to_game = lambda r: [round(gx + r[0] * k, 2), round(gy + r[1] * k, 2), round(r[2] * k, 2), round(r[3] * k, 2)]
    n = lambda x, y, w, h: [x / 1920, y / 1080, w / 1920, h / 1080]
    keys = [[k[0], n(k[1], k[2], k[3] if len(k) > 3 else CODE_W, (k[3] if len(k) > 3 else CODE_W) * CODE_H / CODE_W)]
            for k in code_keys]
    return [dict(name='room', src=n(*room_css), dst=to_game(L)),
            dict(name='bot_code', src=keys[0][1], keys=keys, dst=to_game(Rr), anchor_y=0.0)]


def focus_push(dur, act, boxes, Z=1.3, lead=60, margin=28):
    """Critic mechanic #8: a 1.25-1.4x push toward the action, landing ON the action frame (local `act`) and holding.
    boxes: {'card': [x,y,w,h] css or None, 'actor': [...], ...} in capture CSS px (1920x1080). The view (16:9, the
    game area's aspect) is centred on the boxes' union and clamped so every box stays inside; Z drops to fit if
    needed. Returns (camera keys for Builder.clip, focus dict for the validator)."""
    bx = [b for b in boxes.values() if b]
    ux0, uy0 = min(b[0] for b in bx) - margin, min(b[1] for b in bx) - margin
    ux1, uy1 = max(b[0] + b[2] for b in bx) + margin, max(b[1] + b[3] for b in bx) + margin
    zfit = min(1920 / max(1, ux1 - ux0), 1080 / max(1, uy1 - uy0))
    z = round(max(1.0, min(Z, zfit)), 3)
    w, h = 1920 / z, 1080 / z
    x0 = min(max((ux0 + ux1) / 2 - w / 2, max(0, ux1 - w)), min(ux0, 1920 - w))
    y0 = min(max((uy0 + uy1) / 2 - h / 2, max(0, uy1 - h)), min(uy0, 1080 - h))
    x0, y0 = min(max(0, x0), 1920 - w), min(max(0, y0), 1080 - h)
    cx, cy = round((x0 + w / 2) / 1920, 4), round((y0 + h / 2) / 1080, 4)
    a0 = max(0, act - lead)
    # never a dead-still hold (bible §4; mechanic QA found 3.7 s of freeze at a held 1.3x): drift slowly before the
    # push, and drift slowly back out 4% after it (zooming out about the same centre only adds margin, so the
    # 'card and actor in view' rule keeps holding).
    z_pre = round(min(z, 1.0 + 0.03 * min(1.0, a0 / 240)), 4) if a0 > 0 else 1.0
    z_end = round(max(1.0, z * 0.96), 4)  # drift OUT: a wider view about the same centre always keeps every box
    keys = [(0, 1.0, cx, cy, 'linear')]
    if a0 > 0:
        keys.append((a0 / dur, z_pre, cx, cy, 'linear'))
    keys += [(max(act, 1) / dur, z, cx, cy, 'inout'), (1, z_end, cx, cy, 'linear')]
    return keys, dict(frame=act, z=z, boxes=boxes, zfit=round(zfit, 3))


def build_mechanic():
    """Mechanic (~151 s), rebuilt with the trailer's lessons (docs/VIDEO_EDIT.md "Mechanic plan"):
    - REVISED 2: the program is on screen whenever the room acts. Explain beats keep the normal layout (the editor,
      the lit card AND Schrödi's dialogue, which is the narration); the program-run beats (the 2-3 night, the
      X-ray proof, the 3-1 twist) are split screens (room | Bot Code, the code window following the lit card).
    - Captions: never two texts. Where Schrödi's line is on screen the strip carries only a '= real term' chip;
      cause->effect sentences sit in the gaps between his lines.
    - The X-ray tag only on frames that visibly show X-ray. Dark phases are gated (dark_ranges).
    - Grade by the take's majority phase: in this game a night is bedtime (lit) -> ~2 s lights-out -> MORNING
      (the bots LISTEN, the caretaker BOOPs in daylight), so the mixed takes are graded day; the deep-blue night
      LUT is kept for the all-night cold open (no mid-take LUT pops)."""
    B = Builder('mechanic', 'strip', (1920, 1080), [dict(name='mechanic_1080p', size=[1920, 1080], path='videos/final/mechanic.mp4', zoom_cap=1.8)])
    B.e['strip_overlay'] = True
    B.e['program_visible'] = True
    B.e['dark_ranges'] = []
    push = lambda z0, z1, cx=.5, cy=.5: [(0, z0, cx, cy, 'linear'), (1, z1, cx, cy, 'inout')]
    prog = lambda z1=1.06: [(0, 1.0, 1.0, 1.0, 'linear'), (1, z1, 1.0, 1.0, 'inout')]   # keeps the editor fully in view
    ROOM_FULL_INNER = [230, 140, 915, 660]      # inner room region (1080 units) of a full-UI take at ~1.0-1.06x
    gx, gy, gw, gh = GAME_1080
    L_room = mech_split(ROOM_CSS_23, [(0, 1570, 64)])[0]['dst']
    ROOM_SPLIT_INNER = [round(L_room[0] + L_room[2] * .1), round(L_room[1] + L_room[3] * .1), round(L_room[2] * .8), round(L_room[3] * .8)]
    tag_split = [round(gx - 670 * gw / 1920, 1), round(gy + 935 * gw / 1920, 1), gw, gh]   # trailer proof tag spot, scaled into the room window
    tag_full = [-469.8, 777.7, gw, gh]                                                       # floor, bottom-left of the full-UI room

    def at(sid, src_f, clip):  # timeline frame of a source frame inside a clip
        return clip['start'] + (src_f - clip['in'])

    def take(sid, a, b, **o):
        c = B.clip(sid, b - a, in_s=a / FPS, **o)
        c['in'] = a
        return c

    def ftake(sid, a, b, act_src, boxes, Z=1.3, **o):  # normal-layout take with the Critic #8 push toward the action
        keys, fo = focus_push(b - a, act_src - a, boxes, Z)
        c = take(sid, a, b, camera=keys, **o)
        c['focus'] = fo
        return c

    def dark(c, sa, sb, region, why):
        B.e['dark_ranges'].append(dict(start=at(c['shot'], sa, c), end=at(c['shot'], sb, c) + 1, region=region, ceiling=75,
                                       clip=c['id'], why=why))

    def xray_tag(a, b, rect):
        xm = motion_markers('tag_xray_alpha')
        B.e['captions'].append(dict(id=f'tag_xray_{len([x for x in B.e["captions"] if x["id"].startswith("tag_xray")]) + 1}',
                                    text='X-ray · simulator view', start=a, end=b, legible_from=a + xm.get('text_legible', 14),
                                    position='baked', style='night', label=True,
                                    render={'fill': 'videos/final/work/motion_ext/tag_xray_alpha_fill.mkv',
                                            'matte': 'videos/final/work/motion_ext/tag_xray_alpha_matte.mkv', 'in': 0,
                                            'frames': motion_frames('tag_xray_alpha', 96), 'hold': True, 'rect': rect,
                                            'shadow': {'dilate': 14, 'sigma': 6, 'gain': 4.0, 'opacity': 0.85}}))

    def chip(gloss, start, end):  # '= real term' only (Schrödi's line is on screen)
        strip_cap(B, None, start, end, gloss=gloss)

    # ── 0:00 cold open: moonlit blanket (all night: the night LUT) ──
    take('me_cold_blanket', 30, 390, camera=push(1.0, 1.12), section='cold_open', grade='night')
    strip_cap(B, 'Every Qubble dreams two dreams at once.', 24, 340)

    # ── 0:06 the rule, 1-1 (normal layout: the PEEK card lit; Schrödi narrates) ──
    A = ftake('me_11_peek', 306, 700, 532, dict(card=[1460, 129, 460, 47], actor=[547, 640, 193, 127]), section='rule', grade='day')
    strip_cap(B, 'The PEEK card looks at q1…', at('', 313, A) - 20, at('', 532, A) - 2)
    Bc = ftake('me_11_peek', 1000, 1540, 1185, dict(card=[1460, 129, 460, 47], actor=[547, 640, 193, 127]), section='rule', grade='day',
              note='cut 700->1000 re-joins Schrödi\'s line ("You woke q1…") fully typed; X-ray replay from 1185')
    chip('= measurement', at('', 532, A), at('', 1124, Bc))
    strip_cap(B, 'The replay shows what the peek destroyed.', at('', 1150, Bc), Bc['start'] + Bc['dur'])
    B.exempt_event(Bc, 'xray-replay', before=10, after=60, why='in-engine X-ray replay')
    xray_tag(at('', 1190, Bc), Bc['start'] + Bc['dur'], tag_full)          # X-RAY chip + see-through dome from ~1185

    # ── 0:22 the threat (normal layout; dialogue hidden in this capture) ──
    T = ftake('me_threat', 280, 760, 553, dict(card=[1440, 213, 147, 67], actor=[673, 547, 180, 120]), Z=1.4, section='threat', grade='day')
    strip_cap(B, "One dream changed. Which one? You can't look.", at('', 553, T) - 24, T['start'] + T['dur'])
    dark(T, 472, 605, ROOM_FULL_INNER, 'lights-out: the gremlin strikes in the dark')

    # ── 0:30 can't copy: me_encode re-take (marks line-1-typed 108, line-2-typed 458, run 929, highfive-1/2 1030/1138,
    # win-line-typed 1434). Never two texts: Schrödi's lines carry chips only; the sentence sits in the dialogue-free run
    # (toasts "Program loaded" ends 969, "Night survived" starts 1286). Line 2 (the Bedtime instruction) is dropped:
    # the run itself shows the routine, and the mechanic's length budget is tight.
    def emark(k, dflt):
        f = find_event(resolve('me_encode')[0], k)
        return dflt if f is None else f
    l1, hf1, hf2, wl = emark('line-1-typed', 108), emark('highfive-1', 1030), emark('highfive-2', 1138), emark('win-line-typed', 1434)
    E1 = take('me_encode', max(0, l1 - 68), 335, camera=prog(), section='cant_copy', grade='day',
              note='Schrödi line 1: the vote trick fails, a dream cannot be copied (typed 108, on to 335)')
    chip('= no-cloning', at('', l1, E1), E1['start'] + E1['dur'])
    E2 = take('me_encode', hf1 - 35, min(hf2 + 112, 1280), camera=prog(), section='cant_copy', grade='day',
              note='the Bedtime routine runs: HIGHFIVE 1030, 1138 (no dialogue, no toast)')
    strip_cap(B, "You can't copy a dream. You can share it.", E2['start'] + 4, E2['start'] + E2['dur'], gloss='= encoding')
    E3 = take('me_encode', wl - 24, 1650, camera=prog(), section='cant_copy', grade='day',
              note='Schrödi: "Three Qubbles, one dream…" (typed 1434, read to the end of the take)')
    chip('= entanglement', at('', wl, E3), E3['start'] + E3['dur'])

    # ── 0:39 ask, don't look: 2-1 (normal layout) + the 4-row syndrome graphic ──
    Ls = ftake('me_21_listen', 340, 1060, 396, dict(card=[1653, 140, 267, 327], actor=[527, 607, 160, 166]), section='ask', grade='day')
    strip_cap(B, 'A bot HIGHFIVEs two Qubbles.', at('', 396, Ls) - 24, at('', 590, Ls) + 10, gloss='= parity check')
    # level 2-1 restricts the gremlin to q2 (src/levels/ch2.ts: noise.targets ['q2'], "Flipper only ever reaches
    # Qubble 2"), so its IF a BEEP -> BOOP q2 is correct for this warm-up: say so (Critic mechanic #1, case A)
    strip_cap(B, 'Here Flipper can only reach #2.', at('', 600, Ls), at('', 848, Ls))
    strip_cap(B, "LISTEN: BEEP = they don't match.", at('', 872, Ls) - 24, Ls['start'] + Ls['dur'])
    dark(Ls, 457, 590, ROOM_FULL_INNER, 'lights-out: Flipper flips one of the twins')
    Sy = take('mo_syndrome_table', 0, 840, section='ask', grade='none')
    B.mark('hold', Sy['start'] + 18, Sy['start'] + 62, 'syndrome table: designed title hold "Two bots. Four answers." until row 1 at f60')
    chip('= syndrome: two answers point at one Qubble', Sy['start'] + 60, Sy['start'] + Sy['dur'])

    # ── 1:05 write the fix: the 2-3 decoder, card by card (Critic #4: ~12 s, the IF's conditions being set) ──
    dec_src, dec_kind = resolve('me_23_decoder')
    DM = dict(pick=60, **{'drop-LISTEN': 120, 'drop-IF': 220, 'cond-a': 300, 'cond-b': 380, 'target': 450,
                          'drop-BOOP': 560, 'drop-END': 640, 'done': 680})   # planned marks until the take lands
    if dec_kind != 'placeholder':
        for k in list(DM):
            f = find_event(dec_src, k)
            if f is not None:
                DM[k] = f
    # the real take is slower than planned (987 f with the old handles): tighter handles + a constant 1.15x (Director:
    # card dragging must look natural; ~2 s longer than at 1.3x is accepted)
    # (Critic #4). Constant speed, so the camera's fractional keys and at_d() stay exact.
    DSP = 1.15
    d0, d1 = max(0, DM['drop-LISTEN'] - 40), DM['done'] + 40
    rows = lambda f: (f - d0) / (d1 - d0)
    Dg = B.clip('me_23_decoder', int(round((d1 - d0) / DSP)), in_s=d0 / FPS, speed=DSP, section='repair', grade='day',
                # right-anchored push on the editor (cx 1.0); cy follows the rows: LISTEN ~y340 css, IF ~y420, BOOP ~y800
                # Critic (mechanic render #3): at 1.8x the left ~40% was empty floor; keep easing onto the editor to the
                # end, up to 2.1x (4K source in the 1690 px game rect: native to 2.27x; punch_native lifts the 1.8 cap,
                # the 1080p upscale check stays a hard error). 2.1x is the most that keeps >= 50% of the editor's
                # height (program_focus rule); the floor drops from ~42% to ~32% of the view.
                camera=[(0, 1.0, 1.0, .5, 'linear'), (rows(DM['drop-LISTEN']), 1.6, 1.0, .32, 'inout'),
                        (rows(DM['drop-IF']), 1.9, 1.0, .40, 'inout'), (rows(DM['target']), 2.05, 1.0, .40, 'inout'),
                        (rows(DM['drop-BOOP']), 2.1, 1.0, .70, 'inout'), (1, 2.06, 1.0, .70, 'linear')],
                note=f'decoder re-take ({dec_kind}) at {DSP}x; marks {DM}')
    Dg['in'] = d0
    Dg['punch_native'] = 'Critic mechanic render #3: ease onto the editor up to 2.1x (native limit 2.27x for the 4K take)'
    at_d = lambda f: Dg['start'] + int(round((f - d0) / DSP))
    Dg['program_focus'] = True
    strip_cap(B, 'Write the fix, card by card.', Dg['start'] + 6, at_d(DM['cond-a']) - 26)
    strip_cap(B, 'IF a BEEPs and b is QUIET → BOOP #1.', at_d(DM['cond-a']) - 24, Dg['start'] + Dg['dur'], gloss='= decoder')

    # ── 1:12 the night runs it (split screen: room | Bot Code following the lit card) ──
    # me_23_night_v2 is frame-identical to v1 (20/20 events at offset 0). Motion's keys keep the IF (src 1290), the
    # ⚑ fix1 label (1325) and the lit BOOP q1 (1332-1459) inside the code window (the old path hid them 1325-1430)
    R = take('me_23_night_v2', 600, 1500, section='repair', grade='day',
             windows=mech_split(ROOM_CSS_23, [(0, 1570, 64), (660, 1570, 64), (690, 1570, 250), (705, 1570, 250), (722, 1570, 420)]))
    strip_cap(B, 'In the dark, Flipper flips one Qubble.', at('', 682, R) - 24, at('', 682, R) + 200)
    strip_cap(B, 'Morning: a BEEPs, b stays QUIET → it\'s #1.', at('', 1153, R) - 20, at('', 1153, R) + 210)
    strip_cap(B, 'The program runs it: BOOP #1.', at('', 1153, R) + 210, R['start'] + R['dur'] + 64)
    dark(R, 602, 734, ROOM_SPLIT_INNER, 'lights-out: the gremlin strikes')
    R2 = ftake('me_23_night_v2', 1500, 1906, 1563, dict(card=None, actor=[13, 887, 467, 97], room=[500, 450, 450, 320]), section='repair', grade='day',
              note='normal layout: Schrödi\'s "Two little beeps…" (1563-1777), then Flipper concedes (1777, typed 1831): kept per Critic Q2')
    chip('= error correction', at('', 1564, R2), R2['start'] + R2['dur'])
    Ts = take('pg_test_strip', 30, 236, section='repair', grade='day', camera=[(0, 1.0, 1.0, 0.0, 'linear'), (1, 1.3, 1.0, 0.0, 'inout')])
    Ts['program_focus'] = True
    chip('= tested against every single flip', Ts['start'], Ts['start'] + Ts['dur'])

    # ── 1:35 the proof: X-ray replay + inspector (split screen, the X-ray tag on every frame: X-ray throughout) ──
    P1 = take('me_23_xray_v2', 540, 900, section='proof', grade='day', windows=mech_split(ROOM_CSS_23, [(0, 1570, 64)]))
    P2 = take('me_23_xray_v2', 1290, 1560, section='proof', grade='day', windows=mech_split(ROOM_CSS_23, [(0, 1570, 565)]))
    strip_cap(B, 'The dream lives in all three Qubbles.', at('', 620, P1) - 24, P1['start'] + P1['dur'] - 9, gloss='= entangled, not copied')
    strip_cap(B, 'Fixed, and the bots never learned the dream.', at('', 1338, P2) - 24, P2['start'] + P2['dur'])
    xray_tag(P1['start'], P2['start'] + P2['dur'], tag_split)

    # ── 1:45 the twist, 3-1: Schrödi reports the failure (normal), then the SPIN sandwich runs (split) ──
    T1 = ftake('me_31_phase_v2', 71, 302, 159, dict(card=None, actor=[13, 887, 560, 97], test_strip=[660, 73, 627, 64]), section='twist', grade='day')
    chip('= bit checks miss phase flips', T1['start'], T1['start'] + T1['dur'])
    # me_31_phase_v2 runs exactly +30 f vs v1 from the night on (spins 979/1088/1197, phase 1330, bots 2251/2363,
    # BOOP 2545, Phasey's line 2650 typed 2701): in-points 930 / 2210 / 2650 match mo_pops_M015 / M016
    # Critic (mechanic render #4): x 1440 / w 350 cut BEDTIME's first letters and the Morning cards mid-word. The free
    # span between the palette (ends css ~1400) and Morning's first card (~1712) is 312 css, so the window zooms to
    # w 312 on Bedtime through the SPINs (979/1088/1197 = local 49/158/267), then eases to Morning (x 1570, w 350)
    # before the strike (1280 = local 350). 4K source: 624 px -> 612 px, native. mo_pops_M015 needs these keys.
    T2 = take('me_31_phase_v2', 930, 1390, section='twist', grade='day',
              windows=mech_split(ROOM_CSS_23, [(0, 1400, 64, 312), (290, 1400, 64, 312), (340, 1570, 64, 350)]))
    strip_cap(B, "SPIN turns the ghost's phase flip…", at('', 979, T2) - 24, at('', 1330, T2) - 30)
    strip_cap(B, '…into a plain flip the bots can hear.', at('', 1330, T2) - 30, at('', 1330, T2) + 204)
    dark(T2, 1261, 1381, ROOM_SPLIT_INNER, 'lights-out: Phasey strikes')
    # Motion's keys: the true IF (fix2, css y 776-894) is in view when it fires at 2410, then BOOP q2 (2545)
    T3 = take('me_31_phase_v2', 2210, 2648, section='twist', grade='day',
              windows=mech_split(ROOM_CSS_23, [(0, 1570, 330), (185, 1570, 330), (205, 1570, 450), (255, 1570, 450), (290, 1570, 565)]),
              note="ends before Phasey's line at 2650")
    strip_cap(B, 'SPIN · night · SPIN · then fix.', at('', 2363, T3) - 4, T3['start'] + T3['dur'] - 8, gloss='= phase-flip code (Hadamard basis)')
    T4 = ftake('me_31_phase_v2', 2650, 2755, 2701, dict(card=None, actor=[13, 887, 452, 97], room=[440, 450, 520, 320]), section='twist', grade='day',
              note="Phasey concedes (2650, typed 2701): the defeated ghost, 1.75 s (Critic Q2)")
    # no chip: a 2.4 s chip can't fit the Critic's 1.5-2 s tag; the line is Phasey's (never two texts)

    # ── 2:04 under the hood: the same program, exported (normal layout) ──
    Q = ftake('pg_export_qiskit', 340, 640, 400, dict(card=[80, 200, 215, 545], actor=None), Z=1.4, section='under_the_hood', grade='day')
    strip_cap(B, 'Every program is a real quantum circuit: Export to Qiskit.', Q['start'] + 12, Q['start'] + Q['dur'] - 8)

    # ── 2:09 close: "It's just a game…" -> snap -> the program becomes the real circuit -> Qiskit stamp -> end card ──
    J = take('card_justagame', 0, 192, grade='none', section='close')
    M = take('mo_circuit_morph', 0, 420, grade='none', section='close', cues=[dict(name='snap', frame=J['start'] + J['dur'], kind='design')])
    take('mo_end_card', 0, 360, grade='none', section='end_card')
    jm, mm = motion_markers('card_justagame'), motion_markers('mo_circuit_morph')
    n_cap = lambda: f'cap{sum(1 for x in B.e["captions"] if x["id"].startswith("cap")) + 1:02d}'
    B.e['captions'].append(dict(id=n_cap(), text="It's just a game…", start=J['start'] + jm.get('text_start', 10), end=J['start'] + J['dur'],
                                legible_from=J['start'] + jm.get('text_legible', 33), position='baked', style='day', render={'baked': 'card_justagame'}))
    B.e['captions'].append(dict(id=n_cap(), text='…where you accidentally learned quantum error correction.',
                                start=M['start'] + mm.get('line_start', 62), end=M['start'] + M['dur'],
                                legible_from=M['start'] + mm.get('line_legible', 92), position='baked', style='night',
                                render={'baked': 'mo_circuit_morph'}))
    # intentional holds (QA picture gate): reading holds and post-action beats, each with its reason
    B.mark('hold', M['start'] + mm.get('line_legible', 92), M['start'] + M['dur'], 'closing line held for reading on the finished circuit')
    B.mark('hold', Dg['start'] + Dg['dur'] - 60, Dg['start'] + Dg['dur'], 'beat after the last card lands: the finished program, read before the night runs')
    B.mark('hold', at('', 698, R), at('', 738, R), 'suspense: the dark, still room just before Flipper strikes (src 700-735)')
    B.mark('hold', Ls['start'] + Ls['dur'] - 45, Ls['start'] + Ls['dur'], 'beat on the BEEP result (cap: "BEEP = they do not match")')
    # stable, unique ids in timeline order (tags keep their tag_xray_N ids)
    n = 0
    for c in sorted(B.e['captions'], key=lambda c: c['start']):
        if not c.get('label'):
            n += 1
            c['id'] = f'cap{n:02d}'
    B.e['captions'].sort(key=lambda c: c['start'])
    # split-screen frame (Motion split_frame scaled into the game rect) over every split clip
    for c in B.e['clips']:
        if c.get('windows'):
            B.e['overlays'].append(dict(id=f'split_frame_{c["id"]}', fill='videos/motion/split_frame_fill.mkv',
                                        matte='videos/motion/split_frame_matte.mkv', start=c['start'], dur=c['dur'],
                                        frames=motion_frames('split_frame', c['dur']), hold=True, rect=list(GAME_1080),
                                        note='REVISED 2 split screen, scaled into the 88% game area'))
    # Motion's card pops + actor rings (proof_overlay look), final-frame coordinates (0.88 already applied): no rect,
    # at each split clip's start, above split_frame. Keyed by the clip's (shot, in) so renumbering can't misplace them.
    POPS = {('me_23_night_v2', 600): 'mo_pops_M009', ('me_23_xray_v2', 540): 'mo_pops_M012', ('me_23_xray_v2', 1290): 'mo_pops_M013',
            ('me_31_phase_v2', 930): 'mo_pops_M015', ('me_31_phase_v2', 2210): 'mo_pops_M016'}
    for c in B.e['clips']:
        nm = POPS.get((c['shot'], c['in']))
        if not nm:
            continue
        fr = motion_frames(nm, c['dur'])
        if fr != c['dur']:
            B.e['notes'].append(f'{nm}: {fr} f vs clip {c["id"]} {c["dur"]} f')
        B.e['overlays'].append(dict(id=f'{nm}', fill=f'videos/motion/{nm}_fill.mkv', matte=f'videos/motion/{nm}_matte.mkv',
                                    start=c['start'], dur=min(fr, c['dur']), frames=fr, clip=c['id'],
                                    note='card pops + actor rings (final-frame coords; place at clip start, no rect)'))
    return B.done()


# ── showcase (strip layout; the bed is the game's own score at 84 BPM 4/4, first downbeat 0.08 s) ──
SC_BPM, SC_DOWN0 = 84, 4.8                      # beds.py explainer grid (frames)
SC_BEAT = 60 / SC_BPM * FPS                      # 42.857 frames
LEVEL_NAMES = {'0-1': 'Good Morning', '0-2': 'Threes a Crowd', '1-1': 'Dont Wake Them', '1-2': 'Twirl', '1-3': 'The Photocopier',
               '1-4': 'Twin Dreams', '2-1': 'Do You Match?', '2-2': 'Tuck In', '2-3': 'Who Got Flipped?', '2-4': 'Budget Cuts',
               '2-5': 'Double Trouble', '3-1': 'Somethings Off', '3-2': 'Sideways Glasses', '3-3': 'Wobbles', '4-1': 'Nesting Dolls',
               '4-2': 'Lights Out'}
CHAPTERS = {'ch0': 'Day Shift', 'ch1': 'Night Shift', 'ch2': 'Whisper Network', 'ch3': 'Ghost Stories', 'ch4': 'The Big Nine'}
ROOM_CSS_41 = (150, 100, 1000, 910)              # the 9-Qubble room (aspect of split_frame's left window); re-measure on capture
ROOM_DARK_1080 = [132.8, 70.4, 1100.0, 792.0]    # the room of a full-UI take inside the 88% game rect (css [20,80,1250,900])


NB_FOCUS = (0.20, 0.45)     # sc_notebook_4k: the notebook panel is the left ~15% (y 0.07-0.92); at 1.6x the view clamps left: page + half the room
CHART_BOX = [682, 267, 556, 551]   # sc_threshold_4k chart panel (css px), measured at f300
NB_BOX = [0, 70, 300, 600]         # sc_notebook_4k: the page header + content (css px); full page is y 70-990
CHART_FOCUS = (0.508, 0.52)  # sc_threshold_4k: the p = 1/2 crossover (dashed line) at (0.508, 0.54); panel x 0.36-0.64, y 0.25-0.76


def src_width(sid):
    src, kind = resolve(sid)
    try:
        return E.probe(src)[0] or 0
    except Exception:
        return 0


def build_showcase():
    """Showcase (~3:50): "one caretaker's whole career", chapters in order, every level and every feature where the
    player first meets it (Critic §6, REVISED 2, and the trailer/mechanic lessons; docs/VIDEO_EDIT.md "Showcase plan").
    - Every level appears: 5 heroes (1-1, 2-3, 3-1 as verified Test-all solves; 3-3 Wobbles and 4-1 Shor-9 as 4K
      Run-night split screens, room | Bot Code, plus 4-1's verification), 1-3 and 4-2 as their meta beats (the clone
      glitch, Lights Out by ear), the other 9 as beat-locked 1-beat strobes on their win cards.
    - Programming visible: full-UI takes keep the editor in view (right/bottom-anchored drift, the 1080p cap is
      1.136x); program runs are split screens; the QoL features are a 2x2 of 2x crops (precomp sc_qol4).
    - Never two texts: strip sentences only where no in-game line is up (validator, interval check); level and
      chapter names are persistent HUD labels (Motion level tags), not strip text.
    - X-ray tag only on X-ray frames (Gremlin Lab: always on; the Lab Notebook's room). Dark gate on Lights Out.
    - No duplicate content (validator: no overlapping source ranges of one shot)."""
    B = Builder('showcase', 'strip', (1920, 1080), [dict(name='showcase_1080p', size=[1920, 1080], path='videos/final/showcase.mp4', zoom_cap=1.8)])
    B.e['strip_overlay'] = True
    B.e['program_visible'] = True
    B.e['dark_ranges'] = []
    B.e['beat_grid'] = dict(bpm=SC_BPM, first_downbeat_frame=SC_DOWN0, source='beds.py explainer grid (84 BPM 4/4, 0.08 s)')
    gx, gy, gw, gh = GAME_1080
    WIPE = 'blanket-wipe'
    tag_full = [-469.8, 777.7, gw, gh]           # the X-ray tag on the floor, bottom-left of a full-UI room (mechanic)
    drift = [(0, 1.0, 1.0, 1.0, 'linear'), (1, 1.05, 1.0, 1.0, 'inout')]   # right/bottom-anchored: the editor stays in view

    def take(sid, a, b, wipe=False, **o):
        """wipe=True: the 18 f blanket wipe; wipe='<code>': Motion's 72 f blanket_title (cover 18 / hold 36 with the sewn-on
        level title / uncover 18). Its reveal matte is title-independent; the title patch is a per-level render
        (videos/motion/blanket_title_<code>_{fill,matte}.mkv; the existing blanket_title_* render is 2-3)."""
        if isinstance(wipe, str):
            c = B.clip(sid, b - a, in_s=a / FPS, transition='blanket-title', tframes=72, **o)
            nm = 'blanket_title' if wipe == '2-3' else f'blanket_title_{wipe.replace("-", "")}'
            c['transition'].update(matte='videos/motion/blanket_title_reveal.mkv',
                                   overlay={'fill': f'videos/motion/{nm}_fill.mkv', 'matte': f'videos/motion/{nm}_matte.mkv'},
                                   title=f'{wipe} · {LEVEL_NAMES.get(wipe, "")}')
        else:
            c = B.clip(sid, b - a, in_s=a / FPS, transition=WIPE if wipe else 'cut', **o)
            if wipe:
                c['transition'].update(BLANKET)
        c['in'] = a
        return c

    def end(c):
        return c['start'] + c['dur']

    def at(c, src_f):
        return c['start'] + int(round((src_f - c['in']) / (c['speed'] if isinstance(c['speed'], (int, float)) else 1)))

    def label(key, text, c0, c1, rect=None):
        """A persistent HUD label (Motion level/chapter tag, the trailer's tag style; exempt from the reading rule).
        The text is taken from the rendered asset (level_tag_<key>.json params.text), as Quantum draws it (no ö), so
        the EDL string always matches the pixels; a mismatch with the plan's string is noted."""
        j = E.rel(f'videos/motion/level_tag_{key}.json')
        if os.path.exists(j):
            mt = (E.load_json(j).get('params') or {}).get('text')
            if mt:
                mt = mt.replace('ö', 'o')
                if mt != text.replace('ö', 'o'):
                    B.e['notes'].append(f'tag_{key}: plan "{text}" -> asset "{mt}"')
                text = mt
        B.e['captions'].append(dict(id=f'tag_{key}', text=text, start=c0, end=c1, legible_from=c0 + 12, position='baked', style='night',
                                    label=True, render={'fill': f'videos/motion/level_tag_{key}_fill.mkv',
                                                        'matte': f'videos/motion/level_tag_{key}_matte.mkv', 'in': 0, 'hold': True,
                                                        'rect': rect or [gx, gy, gw, gh],
                                                        'shadow': {'dilate': 14, 'sigma': 6, 'gain': 4.0, 'opacity': 0.85}}))

    def xray_tag(c0, c1, rect):
        xm = motion_markers('tag_xray_alpha')
        B.e['captions'].append(dict(id=f'tag_xray_{sum(1 for x in B.e["captions"] if x["id"].startswith("tag_xray")) + 1}',
                                    text='X-ray · simulator view', start=c0, end=c1, legible_from=c0 + xm.get('text_legible', 14),
                                    position='baked', style='night', label=True,
                                    render={'fill': 'videos/final/work/motion_ext/tag_xray_alpha_fill.mkv',
                                            'matte': 'videos/final/work/motion_ext/tag_xray_alpha_matte.mkv', 'in': 0,
                                            'frames': motion_frames('tag_xray_alpha', 96), 'hold': True, 'rect': rect,
                                            'shadow': {'dilate': 14, 'sigma': 6, 'gain': 4.0, 'opacity': 0.85}}))

    def chip(gloss, c0, c1):
        strip_cap(B, None, c0, c1, gloss=gloss)

    def next_beat(t):
        import math
        return int(round(SC_DOWN0 + math.ceil((t - SC_DOWN0) / SC_BEAT - 1e-6) * SC_BEAT))

    def to_beat():
        """Extend the previous clip (<= 1 beat) so the next cut lands on the bed's beat grid."""
        nb = next_beat(B.t)
        d = nb - B.t
        if d:
            B.e['clips'][-1]['dur'] += d
            B.t = nb

    def fit_to_beat(c, src_max):
        """Trim clip c back to the last beat at or before its clean-source limit (src_max, exclusive of any
        in-game bubble/toast after it), so the strobe run's beat lock never stretches it into that text."""
        import math
        lim = c['start'] + (src_max - c['in'])
        pb = int(round(SC_DOWN0 + math.floor((min(lim, end(c)) - SC_DOWN0) / SC_BEAT + 1e-6) * SC_BEAT))
        if pb < end(c):
            c['dur'] = pb - c['start']
            B.t = pb

    def strobes(levels, ch):
        """1-beat strobes on the win cards, cut on the bed's beats, one HUD label per level."""
        to_beat()
        for lv in levels:
            wc = mark(f'sc_lv_{lv}', 'win-card')
            n = next_beat(B.t + 1) - B.t
            c = take(f'sc_lv_{lv}', wc - 6, wc - 6 + n, section=ch, note=f'1-beat strobe on the bed beat: {lv} solved')
            label(f'lv{lv}', f'{lv}  {LEVEL_NAMES[lv]} ✓', c['start'], end(c))

    def hero(lv, ch, chapter=None, tail=180, wipe=True):
        # Critic showcase #7: the test is the programming moment: the program column is in view ~1 s before the click,
        # counted from the end of the 72 f blanket_title (cover 18 / hold 36 / uncover 18). Q4: after the wipe the HUD
        # shows only the small code chip ("Ch 1 · 1-1"); the blanket title carries the name.
        """A verified solve, normal layout: the loaded program (visible from the title wipe's uncover, ~1.5 s), Test all
        (every night passes at once, the strip fills), the win lines, the win card. In-game lines run from Test all to
        the card, so the strip carries a chip. Opens with the blanket_title wipe carrying the level title."""
        ta, wc = mark(f'sc_lv_{lv}', 'test-all'), mark(f'sc_lv_{lv}', 'win-card')
        c = take(f'sc_lv_{lv}', ta - (72 if wipe else 0) - 60, wc + tail, wipe=lv if wipe else False, camera=drift, section=ch,
                 note=f'hero {lv}: verified solve (Test all), program column in view 1 s before the click')
        label(f'lv{lv}', f'{chapter} · {lv}' if chapter else f'{lv}  {LEVEL_NAMES[lv]}', c['start'] + (54 if wipe else 0), end(c))
        return c, at(c, ta), at(c, wc)

    # ── 0:00 open ──
    G = take('sc_grid16', 0, 300, grade='none', section='open', note='precomp v2: 16 verified solves cascade (tools/video/assemble/precomp.py)')
    strip_cap(B, "Sixteen levels, from a majority vote to Shor's 9-qubit code.", 12, end(G) - 8)
    T = take('tr_title_peek', 40, 340, section='open', grade='day',
             note='meta beat: the 4K one-glide take from before the glide (src 40-340; the trailer uses 125-317 from the P hit)')
    strip_cap(B, 'Even the title collapses if you look at it.', T['start'] + 12, end(T) - 8)
    M = take('sc_dream_map', 60, 396, section='open', camera=[(0, 1.0, .5, .5, 'linear'), (1, 1.1, .5, .45, 'inout')])
    strip_cap(B, 'The dream map: five chapters, Day Shift to The Big Nine.', M['start'] + 12, end(M) - 8)

    # ── chapter 1 Night Shift (with Day Shift's warm-ups in its strobes) ──
    H, ta, wc = hero('1-1', 'ch1', 'Ch 1', tail=245)
    c1 = '= your program, tested against every single flip'
    RL = 24 + 3                                            # strip_cap: legible 24 f after its start, + a small margin
    chip(c1, ta, ta + V.reading_frames(c1) + RL)           # Critic #7: the click -> the ✓ strip reads as "run my code"
    chip('= measurement collapses a superposition', ta + V.reading_frames(c1) + RL + 2, end(H) - 8)
    C = take('sc_clone_glitch', 0, 420, section='ch1', note='1-3 The Photocopier: the copy fails and the clone glitch tears the screen')
    label('lv1-3', '1-3  The Photocopier', C['start'], end(C))
    chip("= no-cloning: a dream can't be copied", C['start'] + 30, end(C) - 8)
    strobes(['0-1', '0-2', '1-2', '1-4'], 'ch1')

    # ── chapter 2 Whisper Network ──
    H, ta, wc = hero('2-3', 'ch2', 'Ch 2')
    chip('= syndrome decoding', ta, wc)
    F = take('sc_map_flip_solve', 40, 460, section='ch2', note='meta beat (4K): the map-bots read at 120, the tap solves it at 348, 112 f of aftermath')
    # the game's own toast "Fixed it without looking…" at src 341 carries the payoff: the strip sentence ends before it
    strip_cap(B, 'Flipper got into the dream map. Its own bots point to the room.', F['start'] + 12, at(F, 341) - 6)
    strobes(['2-1', '2-2', '2-4', '2-5'], 'ch2')

    # ── chapter 3 Ghost Stories ──
    H, ta, wc = hero('3-1', 'ch3', 'Ch 3')
    chip('= phase-flip code (Hadamard basis)', ta, wc)
    # 4K run split (Director): src 540-1230. Wobbles' half-flip at 547; LISTEN a at 1019 resolves it, and this night it
    # snapped to NO error, so all three IFs are false (grey ✗). The strip says so honestly.
    R3 = take('sc_run_3-3', 540, 1230, section='ch3', grade='day',
              windows=mech_split(ROOM_CSS_23, [(0, 1570, 64), (560, 1570, 64), (600, 1570, 300)]),
              note='3-3 Wobbles run, 4K split: half-flip 547, LISTEN a 1019 snaps it to no error, IFs all false')
    fit_to_beat(R3, 1238)   # 'the end. zzz' at 1240: the beat lock may not stretch the take into it
    label('lv3-3', 'Ch 3 · 3-3  Wobbles', R3['start'], end(R3))
    # the honest line needs ~4.9 s; the take ends at 1230 (an idle bubble at 1240), so the sentence continues ~2 s before
    # LISTEN a (1019) and the snap happens while it is read
    l1 = at(R3, mark('sc_run_3-3', 'listen-1')) - 135
    strip_cap(B, 'Wobbles only half-flips a Qubble…', R3['start'] + 12, l1 - 4)
    strip_cap(B, '…LISTEN snaps it to all-or-nothing. Tonight: nothing to fix.', l1, end(R3) - 8,
              gloss='= error discretization')
    strobes(['3-2'], 'ch3')

    # ── chapter 4 The Big Nine ──
    # 4K run split (Director): the strike (error-1 at 1511, prepended so it lands ~70 f in, after the 72 f title wipe
    # uncovers), then src 2740-3200: LISTEN c/d BEEP 2780/2895, IF Bf2 true 2978, BOOP 3154. Code window fixed at y 565.
    win41 = mech_split(ROOM_CSS_41, [(0, 1570, 565)])
    R4s = take('sc_run_4-1', 1426, 1620, wipe='4-1', section='ch4', grade='day', windows=win41,
               note='4-1 the strike (error-1 1511), visible after the title wipe')
    R4 = take('sc_run_4-1', 2740, 3196, section='ch4', grade='day', windows=win41,
              note='4-1 LISTEN c/d BEEP 2780/2895 -> IF Bf2 2978 -> BOOP 3154 (pops sc_pops_4_1)')
    label('lv4-1r', 'Ch 4 · 4-1', R4s['start'] + 54, end(R4))
    strip_cap(B, 'Nine Qubbles, eight bots: any single error, found and fixed blind.', R4s['start'] + 60, end(R4) - 8,
              gloss='= Shor code')
    ta41, wc41 = mark('sc_lv_4-1', 'test-all'), mark('sc_lv_4-1', 'win-card')
    V4 = take('sc_lv_4-1', ta41 - 60, wc41 + 150, wipe=False, camera=drift, section='ch4',
              note='4-1 verified: Test all (program in view 1 s before the click) + the win card')
    label('lv4-1', '4-1  Nesting Dolls ✓', V4['start'], end(V4))
    chip("= Shor's 9-qubit code: any single-Qubble error, fixed blind", at(V4, ta41), at(V4, wc41))
    lo_a, lo_b = 1836, 2418                     # dark throughout (room mean luma <= 14.4); ends before the idle bubble at 2440
    L = take('sc_lights_out_ear_v2', lo_a, lo_b, section='ch4', grade='night', note='4-2 Lights Out: the program runs in the dark; solved by ear')
    label('lv4-2', '4-2  Lights Out', L['start'], end(L))
    strip_cap(B, 'Lights Out: the last level is solved by ear.', L['start'] + 12, at(L, mark('sc_lights_out_ear_v2', 'chord')) - 30)
    B.e['dark_ranges'].append(dict(start=L['start'], end=end(L), region=ROOM_DARK_1080, ceiling=40, clip=L['id'],
                                   why='4-2 Lights Out: the room stays dark (source room mean luma <= 14.4); the program column stays lit'))

    # ── labs ──
    GL = take('sc_gremlin_lab', 60, 840, section='labs', camera=drift,
              note='Gremlin Lab: sandbox, X-ray always on (hard cut in: a wipe would need 18 more Lights Out frames, into the idle bubble at src 2440)')
    label('lab', 'Gremlin Lab', GL['start'], end(GL))
    xray_tag(GL['start'], end(GL), tag_full)
    strip_cap(B, 'Gremlin Lab: a sandbox with X-ray always on. Break things on purpose.', GL['start'] + 24, end(GL) - 8)
    NS = take('sc_night_shift', 230, 710, section='labs', camera=drift, note='Night Shift endless mode (4K): night-1 starts 255')
    label('nightshift', 'Night Shift mode', NS['start'], end(NS))
    strip_cap(B, 'Night Shift mode: endless, randomly generated nights.', NS['start'] + 12, end(NS) - 8)
    TH = take('sc_threshold_4k', 60, 660, section='labs', note='Night Shift Lab (4K): chart opens 66, the curve reaches p = 1/2 at 288')
    if src_width('sc_threshold_4k') >= 3840:   # Critic #4: 4K re-take -> ~1.6x on the chart, landing as the curve reaches p = 1/2
        keys, fo = focus_push(TH['dur'], mark('sc_threshold_4k', 'p-half') - 60, dict(chart=CHART_BOX), Z=1.6, lead=160)
        TH['camera'] = [dict(f=int(round(u * TH['dur'])), z=z, cx=x, cy=y, ease=es) for u, z, x, y, es in keys]
        TH['focus'] = fo   # the chart is the subject: the validator checks the chart box, not the editor
    else:
        B.e['notes'].append('sc_threshold is still the 1080p take: no push (the 4K re-take gets ~1.6x on the curve)')
    label('nightlab', 'Night Shift Lab', TH['start'], end(TH))
    strip_cap(B, 'A code only helps when gremlins are rare: three Qubbles beat one only below p = ½.', TH['start'] + 30, end(TH) - 8)

    # ── the Codex and the Card Guide ──
    # Critic showcase #2: 17.7 s -> 12 s: the collection (2 s), Flipper (2 s), the Qubble's 3D Bloch drag + Measure (8 s)
    CX = take('sc_codex_tour', 0, 120, wipe=True, section='codex', note='Codex: the collection')
    CF = take('sc_codex_tour', 150, 270, section='codex', note='Codex: Flipper')
    CB = take('sc_codex_tour', 500, 980, section='codex', note='Codex: the Qubble, its 3D Bloch sphere dragged, then Measure (770)')
    keys, fo = focus_push(CB['dur'], 770 - 500, dict(card=[580, 140, 760, 560]), Z=1.12, lead=90)
    CB['camera'] = [dict(f=int(round(u * CB['dur'])), z=z, cx=x, cy=y, ease=es) for u, z, x, y, es in keys]
    CB['focus'] = fo
    label('codex', 'The Codex', CX['start'] + 18, end(CB))
    t1 = 'The Codex: every character, gremlin and card, and what it means in real life.'
    strip_cap(B, t1, CX['start'] + 24, CX['start'] + 24 + V.reading_frames(t1) + RL)
    chip('= Bloch sphere: move the dream, then measure it', CX['start'] + 24 + V.reading_frames(t1) + RL + 2, end(CB) - 8)
    CG = take('sc_card_guide', 0, 170, section='codex', note='the Card Guide overview (all 12 cards); its IF page is NOT used (pg_if_anatomy is)')
    label('guide', 'Card Guide', CG['start'], end(CG) + 420)
    IA = take('pg_if_anatomy', 76, 402, section='codex', card_focus=True, camera=[(0, 1.6, .484, .352, 'linear'), (1, 1.75, .484, .352, 'inout')],
              note='4K: the IF card anatomy (the trailer used src 76-172 for 1 beat; here the whole page)')
    strip_cap(B, "Every card has a guide. IF reads the bots' answers and jumps: real classical feed-forward.", CG['start'] + 12, end(IA) - 8)

    # ── the Lab Notebook (Nerd mode) ──
    NB = take('sc_notebook_4k', 318, 1274, wipe=True, section='notebook', camera=drift,
              note="Schrödi's Lab Notebook (4K): state vector 330, Bloch 612, circuit 894, stabilizers 1236; ends before the toast at 1302; the room is in X-ray")
    if src_width('sc_notebook_4k') >= 3840:   # Critic #4: 4K re-take -> ~1.6x on the active page (state -> Bloch -> circuit -> stabilizers)
        keys, fo = focus_push(NB['dur'], 120, dict(page=NB_BOX), Z=1.6, lead=110)
        NB['camera'] = [dict(f=int(round(u * NB['dur'])), z=z, cx=x, cy=y, ease=es) for u, z, x, y, es in keys]
        NB['focus'] = fo   # the notebook page is the subject (the editor is off-frame by design)
    else:
        B.e['notes'].append('sc_notebook is still the 1080p take: no push (the 4K re-take gets ~1.6x on the active page)')
    label('notebook', "Schrodi's Lab Notebook", NB['start'] + 18, end(NB))
    xray_tag(NB['start'] + 18, end(NB), [tag_full[0] + 264, tag_full[1], gw, gh])
    chip('= Nerd mode: state vector · Bloch spheres · circuit · stabilizers', NB['start'] + 24, end(NB) - 8)  # Schrödi talks over the notebook

    # ── write it like code (QoL quick-fire) + the save joke ──
    # Critic showcase #3: step mode is its own full-frame beat (4K pg_step_scrub, ~1.6x): stepping through the gates, the
    # LISTENs (BEEP 1204, quiet 1324), then the one-way measurement "snap" (toast at 1381). The trailer used src 1373-1405.
    SM = take('pg_step_scrub', 1110, 1442, wipe=True, section='qol', note='step mode: through the gates to the measurement snap (4K)')
    keys, fo = focus_push(SM['dur'], 1381 - 1110, dict(card=[1648, 316, 262, 40], toast=[739, 77, 443, 41]), Z=1.6, lead=200)
    SM['camera'] = [dict(f=int(round(u * SM['dur'])), z=z, cx=x, cy=y, ease=es) for u, z, x, y, es in keys]
    SM['focus'] = fo
    label('stepmode', 'Step mode', SM['start'] + 18, end(SM))
    strip_cap(B, 'Rewind the night: gates run backwards, a measurement is a one-way door.', SM['start'] + 16, end(SM) - 8)
    Q = take('sc_qol4', 0, 600, grade='none', section='qol',
             note='precomp sc_qol4: snippets | win-card links (Qiskit / IBM Quantum Learning) | help slot | Export to Qiskit')
    strip_cap(B, 'Write it like real code: snippets, comments, help, Export to Qiskit.', Q['start'] + 24, end(Q) - 8)
    # 270 f + 18 f under the credits' blanket wipe = the whole 288 f take
    SJ = take('sc_save_joke', 0, 270, section='qol', camera=[(0, 1.0, .62, .62, 'linear'), (1, 1.12, .62, .62, 'inout')])
    t1 = 'Even your save file is error-corrected: three copies, majority vote.'
    strip_cap(B, t1, SJ['start'] + 6, SJ['start'] + 6 + V.reading_frames(t1) + RL)
    t2 = 'Judges: Settings → Unlock all content.'                   # Critic showcase #8 (runs into the credits: no strip text there)
    t2a = SJ['start'] + 8 + V.reading_frames(t1) + RL
    strip_cap(B, t2, t2a, t2a + V.reading_frames(t2) + RL)

    # ── credits + close ──
    take('sc_curtain_call', 0, 480, wipe=True, section='credits', camera=[(0, 1.0, .35, .55, 'linear'), (1, 1.1, .35, .55, 'inout')])  # Critic #1: 8 s
    J = take('card_justagame', 0, 192, grade='none', section='close')
    MC = take('mo_circuit_morph', 0, 420, grade='none', section='close', cues=[dict(name='snap', frame=end(J), kind='design')])
    take('mo_end_card', 0, 360, grade='none', section='end_card')
    jm, mm = motion_markers('card_justagame'), motion_markers('mo_circuit_morph')
    B.e['captions'].append(dict(id='capJ', text="It's just a game…", start=J['start'] + jm.get('text_start', 10), end=end(J),
                                legible_from=J['start'] + jm.get('text_legible', 33), position='baked', style='day', render={'baked': 'card_justagame'}))
    B.e['captions'].append(dict(id='capM', text='…where you accidentally learned quantum error correction.', start=MC['start'] + mm.get('line_start', 62),
                                end=end(MC), legible_from=MC['start'] + mm.get('line_legible', 92), position='baked', style='night',
                                render={'baked': 'mo_circuit_morph'}))
    n = 0
    for c in sorted(B.e['captions'], key=lambda c: c['start']):
        if not c.get('label'):
            n += 1
            c['id'] = f'cap{n:02d}'
    B.e['captions'].sort(key=lambda c: c['start'])
    for c in B.e['clips']:
        if c.get('windows'):
            B.e['overlays'].append(dict(id=f'split_frame_{c["id"]}', fill='videos/motion/split_frame_fill.mkv',
                                        matte='videos/motion/split_frame_matte.mkv', start=c['start'], dur=c['dur'],
                                        frames=motion_frames('split_frame', c['dur']), hold=True, rect=list(GAME_1080),
                                        note='REVISED 2 split screen, scaled into the 88% game area'))
    # Motion's card pops + actor rings (proof_overlay look), final-frame coordinates (0.88 already applied): no rect,
    # at each split clip's start, above split_frame. Keyed by the clip's (shot, in) so renumbering can't misplace them.
    POPS = {('sc_run_3-3', 540): 'sc_pops_3_3', ('sc_run_4-1', 2740): 'sc_pops_4_1'}  # Motion run-split pops
    for c in B.e['clips']:
        nm = POPS.get((c['shot'], c['in']))
        if not nm:
            continue
        fr = motion_frames(nm, c['dur'])
        if fr != c['dur']:
            B.e['notes'].append(f'{nm}: {fr} f vs clip {c["id"]} {c["dur"]} f')
        B.e['overlays'].append(dict(id=f'{nm}', fill=f'videos/motion/{nm}_fill.mkv', matte=f'videos/motion/{nm}_matte.mkv',
                                    start=c['start'], dur=min(fr, c['dur']), frames=fr, clip=c['id'],
                                    note='card pops + actor rings (final-frame coords; place at clip start, no rect)'))
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
