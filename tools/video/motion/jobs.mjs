// Render jobs: name → { scene, params, alpha?, note }. All timings in frames @ 60 fps, keyed to
// videos/music/cue_sheet.json (beat = 32 frames, bar = 96, 3/4). Override any param per render with
// --p '{"impact":123}'. "alpha" jobs write <name>_fill.mkv + <name>_matte.mkv. See docs/VIDEO_MOTION.md.
const NIGHT_TXT = { bg: 'night', y: 300 };
export const JOBS = {
  // 1 ── logo reveal (drop section f1394–1586)
  // default: clip starts at f1388 (last 6 frames of the silence): glitch tear from black into the wound-up
  // letter-Qubbles, IMPACT on clip f6 = the drop f1394, then the wordmark settles through the drop section.
  logo_reveal: { scene: 'logo', params: { offset: 90, glitchAt: 90, frames: 198 }, note: 'place at f1388: glitch 0–5, IMPACT clip f6 = f1394 (drop), settle to f1586' },
  logo_reveal_alpha: { scene: 'logo', params: { offset: 90, glitchIn: 0, frames: 198 }, alpha: true, note: 'same timing, letters/wordmark/particles only (no sky, no glitch, no flash fill) + matte' },
  logo_reveal_long: { scene: 'logo', params: { frames: 192 }, note: 'alternate: starts on the drop with the glitch, letters land on 16ths, IMPACT clip f96 (= f1490)' },
  // 2 ── title-letter collapse (peek section: shatter hits f434)
  title_peek: { scene: 'titlecollapse', params: { frames: 116, hits: [null, null, 96, null, null, null, null, null, null, null], outcomes: '0010000000', shatterAt: 96, focus: 2, focusZoom: 1.9 }, note: 'start at f338: cursor drifts to P, P collapses + SHATTER on clip f96 (= f434), black tail' },
  title_sweep: { scene: 'titlecollapse', params: { frames: 192, hits: [0, 16, 32, 48, 64, 80, 96, 112, 128, 144], outcomes: '0110100110' }, note: 'letters collapse on 8ths (16 f) — each hit = a pitched peek SFX; e.g. start at f530' },
  // 3 ── cards
  card_dreams: { scene: 'card', params: { text: 'Every Qubble dreams\ntwo dreams at once.', frames: 288, prop: 'dream', size: 118, ...NIGHT_TXT, y: 330 }, note: 'cold open, night sky + dreaming Qubble with a sun and a moon dream' },
  card_dreams_alpha: { scene: 'card', params: { text: 'Every Qubble dreams\ntwo dreams at once.', frames: 288, size: 118, y: 250 }, alpha: true, note: 'text only, over the moonlit blanket footage (top third)' },
  card_gremlins: { scene: 'card', params: { text: 'Gremlins flip bits.', frames: 96, prop: 'flip', propHit: 44, start: 4, ...NIGHT_TXT }, note: 'Flipper zaps a Sunny Qubble → Moony (bit flip) on clip f44' },
  card_ghosts: { scene: 'card', params: { text: 'Ghosts flip phases.', frames: 96, prop: 'phase', propHit: 40, start: 4, ...NIGHT_TXT }, note: 'Phasey mirrors a Qubble swirl (|+⟩→|−⟩) on clip f40' },
  card_cantlook: { scene: 'card', params: { text: "You can't look.", frames: 96, prop: 'blankets', start: 4, ...NIGHT_TXT }, note: 'three tucked-in Qubbles in moonlight' },
  card_cantlook_alpha: { scene: 'card', params: { text: "You can't look.", frames: 96, start: 4, y: 240 }, alpha: true, note: 'text only, over the dark room' },
  card_justagame: { scene: 'card', params: { text: "It's just a game…", frames: 192, bg: 'day', prop: 'morning', y: 330, start: 10 }, note: 'closing f3410–3602: morning sky, ink on a torn paper note' },
  card_justagame_alpha: { scene: 'card', params: { text: "It's just a game…", frames: 192, bg: 'day', y: 240, start: 10, plate: true, style: 'day' }, alpha: true, note: 'paper note + text only, over the cosy morning capture' },
  card_learned: { scene: 'card', params: { text: '…where you accidentally learned quantum error correction.', frames: 192, bg: 'notebook', y: 500, size: 116, maxW: 1560 }, note: 'standalone notebook version (the trailer uses circuit_morph)' },
  end_card: { scene: 'endcard', params: { frames: 254 }, note: 'f3986–4240: swirling letters assemble, settle; credits line + URL' },
  // 4 ── transitions
  shatter: { scene: 'shatter', params: {}, note: 'Qubble close-up snaps to Moony, SHATTER on clip f16, black after' },
  shatter_alpha: { scene: 'shatter', params: {}, alpha: true, note: 'shards only + matte (put anything behind)' },
  glitch_tear_matte: { scene: 'glitch', params: { out: 'matte' }, note: '6 f; white = incoming shot (maskedmerge)' },
  glitch_tear_fx: { scene: 'glitch', params: { out: 'fx' }, alpha: true, note: '6 f colour slices/scan sparks overlay + matte' },
  glitch_tear_demo: { scene: 'glitch', params: { out: 'demo' }, note: 'reference: day tearing into night' },
  blanket_wipe: { scene: 'blanket', params: { mode: 'pass', out: 'overlay' }, alpha: true, note: '18 f quilt sweep overlay + matte' },
  blanket_wipe_reveal: { scene: 'blanket', params: { mode: 'pass', out: 'reveal' }, note: '18 f: white = incoming shot' },
  blanket_wipe_demo: { scene: 'blanket', params: { mode: 'pass', out: 'demo' }, note: 'reference composite' },
  blanket_title: { scene: 'blanket', params: { mode: 'title', out: 'overlay', title: 'Who Got Flipped?', code: '2-3' }, alpha: true, note: 'cover 18 / hold 36 / uncover 18 with a sewn-on level title' },
  blanket_title_reveal: { scene: 'blanket', params: { mode: 'title', out: 'reveal' }, note: 'matte for blanket_title (B from f18)' },
  // 5 ── syndrome graphic
  syndrome: { scene: 'syndrome', params: {}, note: '4 rows × 96 f (one bar each); markers give beep/quiet frames' },
  // 6 ── closing circuit
  circuit_morph: { scene: 'circuit', params: { frames: 288 }, note: 'trailer f3698–3986 (snap on clip f0): cards → gates, then the closing line' },
  circuit_morph_mech: { scene: 'circuit', params: { frames: 300, stamp: 200 }, note: 'mechanic video: + "Exports to Qiskit" stamp' },
  // 7 ── caption strip
  caption_strip_demo: { scene: 'caption', params: {}, alpha: true, note: 'template demo; render your own with --p {"frames":N,"items":[…]} --name …' },
  // ── edit slots (videos/final/work/shot_todo.json, kind: motion). The Editor trims these to their EDL windows.
  mo_circuit_morph: { scene: 'circuit', params: { frames: 660 }, note: 'EDL slot (all 3 videos): snap on f0 (trailer f3698), morph f18–77, line f96 (legible f126), long hold' },
  mo_end_card: { scene: 'endcard', params: { frames: 360 }, note: 'EDL slot: identical to end_card for f0–253 (trailer f3986–4240), then holds' },
  mo_syndrome_table: { scene: 'syndrome', params: { start: 60, rowFrames: 180, hold: 180 }, note: 'EDL slot (mechanic "ask"): 4 rows × 180 f from f60' },
  mo_qiskit_stamp: { scene: 'circuit', params: { frames: 300, morphStart: -400, lineAt: -200, stamp: 40 }, note: 'EDL slot (mechanic "under the hood"): finished circuit + line, EXPORTS TO QISKIT stamp slams on f40' },
  // ── REVISED 2 (build overlays, the programming card, the proof split screen)
  card_gremlins_alpha: { scene: 'card', params: { text: 'Gremlins flip\nbits.', frames: 192, layout: 'topleft', prop: 'flip', propHit: 40, start: 4, size: 92, y: 222, maxW: 900 }, alpha: true, note: 'build beat 1 overlay, top-left wall (text x 206–~860, y ≈ 150–290; sprite at x 104)' },
  card_ghosts_alpha: { scene: 'card', params: { text: 'Ghosts flip\nphases.', frames: 192, layout: 'topleft', prop: 'phase', propHit: 40, start: 4, size: 92, y: 222, maxW: 900 }, alpha: true, note: 'build beat 2 overlay, top-left wall' },
  card_wobbles_alpha: { scene: 'card', params: { text: 'Wobbles flips…\nhalfway.', frames: 192, layout: 'topleft', prop: 'wobble', propHit: 40, start: 4, size: 92, y: 222, maxW: 900 }, alpha: true, note: 'build beat 3 overlay, top-left wall' },
  card_program_alpha: { scene: 'card', params: { text: "You don't play it.\nYou program it.", frames: 144, start: 2, reveal: 16, size: 120, y: 470, bg: 'day', plate: true, style: 'day', redWords: [5] }, alpha: true, note: 'after the logo impact; legible f18, held 126 f (2.1 s; the 1.6 s + 40 ms/char rule wants 175 → use _long if the edit allows)' },
  card_program_alpha_long: { scene: 'card', params: { text: "You don't play it.\nYou program it.", frames: 192, start: 2, reveal: 16, size: 120, y: 470, bg: 'day', plate: true, style: 'day', redWords: [5] }, alpha: true, note: '2 bars: legible f18, held 174 f (meets the reading rule)' },
  split_frame: { scene: 'splitframe', params: { frames: 576 }, alpha: true, note: 'proof f1586–2162: paper frame, windows left 28,28 1124×1024 / right 1196,104 696×948 (1080p units)' },
  // ── Critic fix round (trailer song cut)
  proof_overlay: { scene: 'proof', params: {}, alpha: true, note: 'trailer f1586–2162 over split_frame: card pops + actor rings + 2 connectors, from pg_split_23 logs; uses the window crops in its JSON' },
  card_program_alpha_160: { scene: 'card', params: { text: "You don't play it.", text2: 'You program it.', frames: 160, start: -5, start2: 47, reveal: 10, size: 104, y: 790, y2: 920, bg: 'day', plate: true, style: 'day', redWords: [101], exitStart: 146, exitDur: 12 }, alpha: true, note: 'place at f1426 (under the settled wordmark); note + line 1 legible clip f10 (= f1436); line 2 legible f62 (= f1488); exit f146–158, gone by f160 (= f1586)' },
  // ── mechanic split-clip pops (place each at its EDL clip start; final-frame coords, game rect already applied)
  mo_pops_M009: { scene: 'split', alpha: true, note: 'M009 me_23_night (tl 4326, 900 f): 4 HIGHFIVEs (connectors on the first two), LISTEN a BEEP, LISTEN b QUIET, IF a BEEP·b QUIET → fix1 (TRUE, jump lands on ⚑ fix1), BOOP q1. Needs the code keys [[0,64],[660,64],[690,250],[705,250],[722,420]]',
    params: { frames: 900, in: 600, capture: 'me_23_night', codeKeys: [[0, 64], [660, 64], [690, 250], [705, 250], [722, 420]],
      actions: [
        { src: 817, line: 1, x: 557, y: 543, connector: true }, { src: 896, line: 2, x: 672, y: 607, connector: true },
        { src: 974, line: 3, x: 710, y: 632 }, { src: 1052, line: 4, x: 837, y: 670 },
        { src: 1153, line: 5, x: 481, y: 640 }, { src: 1264, line: 6, x: 646, y: 721 },
        { src: 1459, line: 12, x: 634, y: 568, x2: 557, y2: 492 }],
      ifs: [{ src: 1290, line: 7, taken: true, land: 11, landSrc: 1325 }] } },
  mo_pops_M012: { scene: 'split', alpha: true, note: 'M012 me_23_xray (tl 5709, 360 f): the inspector on q2 (moony ring)',
    params: { frames: 360, in: 540, capture: 'me_23_xray', codeKeys: [[0, 64]], actions: [{ src: 620, x: 697, y: 581, color: '#6c63ff' }], ifs: [] } },
  mo_pops_M013: { scene: 'split', alpha: true, note: 'M013 me_23_xray (tl 6069, 270 f): BOOP q1 (caretaker + q1 rings)',
    params: { frames: 270, in: 1290, capture: 'me_23_xray', codeKeys: [[0, 565]], actions: [{ src: 1337, line: 12, x: 634, y: 568, x2: 557, y2: 492 }], ifs: [] } },
  // ── showcase HUD labels (dark-plate, X-ray-tag type; placed into the game rect, hold the last frame)
  'level_tag_lv1-1': { scene: 'label', alpha: true, params: { text: "Ch 1 · 1-1", frames: 30 }, note: 'showcase tag_lv1-1' },
  'level_tag_lv1-3': { scene: 'label', alpha: true, params: { text: "1-3  The Photocopier", frames: 30 }, note: 'showcase tag_lv1-3' },
  'level_tag_lv0-1': { scene: 'label', alpha: true, params: { text: "0-1  Good Morning ✓", frames: 30 }, note: 'showcase tag_lv0-1' },
  'level_tag_lv0-2': { scene: 'label', alpha: true, params: { text: "0-2  Threes a Crowd ✓", frames: 30 }, note: 'showcase tag_lv0-2' },
  'level_tag_lv1-2': { scene: 'label', alpha: true, params: { text: "1-2  Twirl ✓", frames: 30 }, note: 'showcase tag_lv1-2' },
  'level_tag_lv1-4': { scene: 'label', alpha: true, params: { text: "1-4  Twin Dreams ✓", frames: 30 }, note: 'showcase tag_lv1-4' },
  'level_tag_lv2-3': { scene: 'label', alpha: true, params: { text: "Ch 2 · 2-3", frames: 30 }, note: 'showcase tag_lv2-3' },
  'level_tag_lv2-1': { scene: 'label', alpha: true, params: { text: "2-1  Do You Match? ✓", frames: 30 }, note: 'showcase tag_lv2-1' },
  'level_tag_lv2-2': { scene: 'label', alpha: true, params: { text: "2-2  Tuck In ✓", frames: 30 }, note: 'showcase tag_lv2-2' },
  'level_tag_lv2-4': { scene: 'label', alpha: true, params: { text: "2-4  Budget Cuts ✓", frames: 30 }, note: 'showcase tag_lv2-4' },
  'level_tag_lv2-5': { scene: 'label', alpha: true, params: { text: "2-5  Double Trouble ✓", frames: 30 }, note: 'showcase tag_lv2-5' },
  'level_tag_lv3-1': { scene: 'label', alpha: true, params: { text: "Ch 3 · 3-1", frames: 30 }, note: 'showcase tag_lv3-1' },
  'level_tag_lv3-3': { scene: 'label', alpha: true, params: { text: "Ch 3 · 3-3  Wobbles", frames: 30 }, note: 'showcase tag_lv3-3' },
  'level_tag_lv3-2': { scene: 'label', alpha: true, params: { text: "3-2  Sideways Glasses ✓", frames: 30 }, note: 'showcase tag_lv3-2' },
  'level_tag_lv4-1r': { scene: 'label', alpha: true, params: { text: "Ch 4 · 4-1", frames: 30 }, note: 'showcase tag_lv4-1r' },
  'level_tag_lv4-1': { scene: 'label', alpha: true, params: { text: "4-1  Nesting Dolls ✓", frames: 30 }, note: 'showcase tag_lv4-1' },
  'level_tag_lv4-2': { scene: 'label', alpha: true, params: { text: "4-2  Lights Out", frames: 30 }, note: 'showcase tag_lv4-2' },
  'level_tag_lab': { scene: 'label', alpha: true, params: { text: "Gremlin Lab", frames: 30 }, note: 'showcase tag_lab' },
  'level_tag_nightshift': { scene: 'label', alpha: true, params: { text: "Night Shift mode", frames: 30 }, note: 'showcase tag_nightshift' },
  'level_tag_nightlab': { scene: 'label', alpha: true, params: { text: "Night Shift Lab", frames: 30 }, note: 'showcase tag_nightlab' },
  'level_tag_codex': { scene: 'label', alpha: true, params: { text: "The Codex", frames: 30 }, note: 'showcase tag_codex' },
  'level_tag_guide': { scene: 'label', alpha: true, params: { text: "Card Guide", frames: 30 }, note: 'showcase tag_guide' },
  'level_tag_stepmode': { scene: 'label', alpha: true, params: { text: 'Step mode', frames: 30 }, note: 'showcase step-mode beat (Critic #3)' },
  'level_tag_notebook': { scene: 'label', alpha: true, params: { text: "Schrödi's Lab Notebook", frames: 30 }, note: 'showcase tag_notebook' },
  // ── showcase hero title wipes (72 f: cover 18 / hold 36 / uncover 18; the reveal matte is blanket_title_reveal)
  blanket_title_11: { scene: 'blanket', params: { mode: 'title', out: 'overlay', title: 'Dont Wake Them', code: '1-1' }, alpha: true, note: 'S004' },
  blanket_title_31: { scene: 'blanket', params: { mode: 'title', out: 'overlay', title: 'Somethings Off', code: '3-1' }, alpha: true, note: 'S016' },
  blanket_title_41: { scene: 'blanket', params: { mode: 'title', out: 'overlay', title: 'Nesting Dolls', code: '4-1' }, alpha: true, note: 'S019' },
  // ── mechanic 3-1 splits from me_31_phase_v2 (in-points = v1 + 30: the v2 take runs 30 frames later). Card rects
  //    measured on v2 frames (red ▶ marker + card borders); 3-1 has no .card.current log.
  mo_pops_M015: { scene: 'split', alpha: true, note: 'M015 me_31_phase_v2 in 930, 460 f: bedtime SPIN q1/q2/q3 (connectors on the first two), Phasey in the dark (phasey ring)',
    params: { frames: 460, in: 930, capture: 'me_31_phase_v2', codeX: 1440, codeKeys: [[0, [1400, 64, 312]], [290, [1400, 64, 312]], [340, [1570, 64, 350]]],
      actions: [
        { src: 979, op: 'SPIN', color: '#3fb6ff', x: 640, y: 520, x2: 560, y2: 500, connector: true, rect: [1460, 266, 186, 40] },
        { src: 1088, op: 'SPIN', color: '#3fb6ff', x: 808, y: 608, x2: 720, y2: 600, connector: true, rect: [1460, 312, 186, 40] },
        { src: 1197, op: 'SPIN', color: '#3fb6ff', x: 992, y: 720, x2: 900, y2: 680, rect: [1460, 358, 186, 40] },
        { src: 1330, color: '#b04dff', x: 980, y: 680 }],
      ifs: [] } },
  mo_pops_M016: { scene: 'split', alpha: true, note: 'M016 me_31_phase_v2 in 2210, 438 f: LISTEN a BEEP, LISTEN b BEEP, IF fix1 (false: grey sweep ✗), IF fix2 (TRUE: pop ✓ jump), BOOP q2. Needs code keys [[0,330],[185,330],[205,450],[255,450],[290,565]]',
    params: { frames: 438, in: 2210, capture: 'me_31_phase_v2', codeX: 1570, codeKeys: [[0, 330], [185, 330], [205, 450], [255, 450], [290, 565]],
      actions: [
        { src: 2251, op: 'LISTEN', x: 472, y: 640, rect: [1714, 560, 204, 40] },
        { src: 2363, op: 'LISTEN', x: 640, y: 740, rect: [1714, 606, 204, 40] },
        { src: 2545, op: 'BOOP', x: 800, y: 640, x2: 730, y2: 590, rect: [1720, 954, 193, 40] }],
      ifs: [{ src: 2387, rect: [1714, 652, 204, 118], taken: false }, { src: 2410, rect: [1714, 776, 204, 118], taken: true }] } },
  // ── showcase run splits (in-ranges PROPOSED to the Editor; place at the clip start)
  sc_pops_3_3: { scene: 'split', alpha: true, note: 'S017 sc_run_3-3, proposed in 540, 690 f (error → 4 HIGHFIVEs → LISTEN a (the discretization, big pop) → LISTEN b → 3 false IFs → END)',
    params: { frames: 690, in: 540, capture: 'sc_run_3-3', codeKeys: [[0, 64], [560, 64], [600, 300]],
      actions: [
        { src: 547, color: '#a5e05b', x: 750, y: 575 },
        { src: 682, line: 1, x: 557, y: 543, connector: true }, { src: 761, line: 2, x: 668, y: 595, connector: true },
        { src: 840, line: 3, x: 710, y: 632 }, { src: 918, line: 4, x: 837, y: 670 },
        { src: 1019, line: 5, x: 480, y: 632, big: true }, { src: 1130, line: 6, x: 645, y: 720 }],
      ifs: [{ src: 1154, line: 7, taken: false }, { src: 1177, line: 8, taken: false }, { src: 1200, line: 9, taken: false }] } },
  sc_pops_4_1: { scene: 'split', alpha: true, note: 'S019 sc_run_4-1, proposed in 2740, 460 f (block B: LISTEN c BEEP 2780, LISTEN d BEEP 2895, IF false 2920, IF true 2943 → BOOP 3154); pair it with ~140 f of the error strike from src 1480. Code window y 565 throughout (the column auto-scrolls the current card to y≈940–975)',
    params: { frames: 460, in: 2740, capture: 'sc_run_4-1', roomSrc: [150, 100, 1000, 910], codeKeys: [[0, 565]],
      actions: [
        { src: 2780, op: 'LISTEN', x: 727, y: 612, rect: [1648, 938, 262, 40], connector: true },
        { src: 2895, op: 'LISTEN', x: 805, y: 657, rect: [1648, 938, 262, 40], connector: true },
        { src: 3154, op: 'BOOP', x: 430, y: 535, x2: 495, y2: 500, rect: [1648, 938, 262, 40] }],
      // the column's auto-scroll lags ~30 f behind execution, so each IF pops when it is on screen
      ifs: [{ src: 2947, rect: [1650, 882, 262, 97], taken: false }, { src: 2978, rect: [1650, 878, 262, 97], taken: true }] } },
};
