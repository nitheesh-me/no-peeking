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
};
