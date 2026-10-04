/**
 * Trailer batch from videos/final/work/shot_todo.json (ids = the Editor's shot ids; outputs videos/capture/<id>.mkv,
 * registered in tools/video/edl/shot_sources.json). All ?cinema=1 full-bleed at 3840×2160.
 * Every take is ≥ the frames the todo asks for (handles included); marks in <id>.meta.json give each moment's frame.
 */
import { shot } from '../lib.mjs';
import { BEAT } from './params.mjs';
import { judge, prepLevel, runNight, waitSfx, waitDark } from './common.mjs';

const C = (camera, extra = {}) => ({ camera, ...extra });
const NIGHT_LIGHTS = async (s) => { await s.np((np) => { np.scene.nightTarget = 1; }); };
const sec = (frames) => frames / 60;

// cold_open: a blanketed Qubble breathing in moonlight (lights down in the build phase: nothing runs, all asleep)
shot('tr_cold_blanket', { save: judge(['2-2']), cinema: C('on:q2,2.8,0.5,0.6'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: { bedtime: '', morning: '' } });
  await s.offCamera(async () => { await NIGHT_LIGHTS(s); await s.wait(3); });
  await s.hold(sec(428) + 1.5, 'moonlit-breathing');
});

// peek: the title letter-Qubbles (Critic Fix 7). The cursor is hidden until it makes ONE eased 40-frame glide onto
// the P, arriving exactly as the P collapses at clip frame 95 (the EDL's peek hit); the cursor then rests on the P
// for 30 frames (≥ 8 frames of the P collapsing before the shatter), then sweeps the remaining letters on 8ths
// (the "title plays the theme" gag, usable separately).
shot('tr_title_peek', { save: judge(), cinema: true, cursor: false }, async (s) => {
  await s.goto('#title', { settle: 0.3 });
  const letters = (await s.eval(() => {
    const W = innerWidth, Hh = innerHeight, text = 'NO PEEKING!', slot = Math.min(W / (text.length + 1), 400), k = slot / 78;
    return [...text].map((ch, i) => ({ ch, i, x: W / 2 - (slot * text.length) / 2 + slot * (i + 0.5), y: Hh * 0.46 + Math.sin(i * 1.3) * slot * 0.08 - 30 * k, r: slot * 0.5 }));
  })).filter((l) => l.ch !== ' ');
  const P = letters.find((l) => l.ch === 'P');
  // approach from lower-left; land just inside the P's hover radius so the collapse fires on the arrival frame
  const dir = { x: -0.55, y: 0.835 };
  const land = { x: P.x + dir.x * (P.r - 4), y: P.y + dir.y * (P.r - 4) };
  const start = { x: land.x + dir.x * 300, y: land.y + dir.y * 300 };
  await s.placeCursor(start);
  const GLIDE = 40, HIT = 95;
  await s.wait((HIT - GLIDE - s.frame) / 60);
  await s.showCursor(true);
  s.mark('glide-start');
  await s.cursorTo(land, { dur: GLIDE / 60, ease: 'inOut', arc: 0.06 });
  s.mark('hit-P');
  await s.hold(30 / 60, 'P-collapsing');
  // the rest of PEEKING! on 8ths, then N, O
  const yl = P.y;
  const hit = (l) => ({ x: l.x - Math.sqrt(Math.max(0, l.r * l.r - (l.y - yl) ** 2)) + 2, y: yl });
  for (const l of letters.filter((x) => x.i > P.i)) { await s.cursorTo(hit(l), { dur: BEAT / 2, ease: 'linear', arc: 0 }); s.mark('hit-' + l.ch + l.i); }
  await s.cursorTo({ x: letters.at(-1).x + 160, y: yl + 260 }, { dur: 0.8, ease: 'out' });
  await s.hold(2.0, 'collapsed');
});

// peek → build: in-place day→night relight, same framing
shot('tr_relight', { save: judge(['2-2']), cinema: C('room'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.wait(1.0);
  await NIGHT_LIGHTS(s); s.mark('relight');
  await s.hold(sec(252) + 0.5, 'relight');
});

// build: the empty door in the dark (a beat of nobody there)
shot('tr_door_empty', { save: judge(['2-2']), cinema: C('on:door,2.0,0.32,0.45'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: { bedtime: '', morning: '' } });
  await s.offCamera(async () => { await NIGHT_LIGHTS(s); await s.wait(3); });
  await s.hold(sec(156) + 1, 'door');
});

// build: the dark room, blankets only
shot('tr_dark_room', { save: judge(['2-2']), cinema: C('wide'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: { bedtime: '', morning: '' } });
  await s.offCamera(async () => { await NIGHT_LIGHTS(s); await s.wait(3); });
  await s.hold(sec(252) + 1, 'dark-room');
});

// silence: a single bot BEEP, antenna close (beep ≈ 1 s into the clip)
shot('tr_bot_antenna', { save: judge(['2-2']), cinema: C('on:a,3.2,0.5,0.6'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await runNight(s, 'zero', [{ kind: 'flip', t: 'q1' }]); // bot a (q1·q2) beeps
  await s.offCamera(async () => { await waitSfx(s, 'gremlin_flip', { timeout: 40 }); await s.wait(4 + 2.9); });
  await waitSfx(s, 'botNote', { timeout: 30, mark: 'beep' });
  await s.hold(2, 'after-beep');
});

// proof: gremlin flips q2 → both bots BEEP → caretaker BOOPs q2 → in-engine X-ray: the dream is intact
shot('tr_proof', { save: judge(['2-2']), cinema: C('room'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await runNight(s, 'plus', [{ kind: 'flip', t: 'q2' }]);
  await s.offCamera(async () => { await waitSfx(s, 'gremlin_sneak', { timeout: 40 }); });
  await waitSfx(s, 'gremlin_flip', { timeout: 40, mark: 'flip' });
  await waitSfx(s, 'botNote', { timeout: 40, mark: 'beep-a' });
  await waitSfx(s, 'botNote', { timeout: 40, mark: 'beep-b' });
  await waitSfx(s, 'boop', { timeout: 40, mark: 'boop' });
  await s.wait(1.2);
  await s.np((np) => np.setXray(true)); s.mark('xray');
  await s.hold(5, 'xray-intact');
});

// montage
shot('mn_schrodi_checklist', { save: judge(['2-2']), cinema: C('tight'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution', xray: true });
  await s.wait(0.5);
  await runNight(s, 'zero', []);
  await waitSfx(s, 'highfive', { timeout: 30, mark: 'highfive-1' });
  await waitSfx(s, 'highfive', { timeout: 30, mark: 'highfive-2' });
  await s.hold(2, 'encoded');
});
shot('mn_test_strip', { save: judge(['2-2']), cinema: C('wide', { hud: 1 }), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.wait(0.5);
  await s.np((np) => np.testAll()); s.mark('test-all');
  await waitSfx(s, 'level_win', { timeout: 120, mark: 'win' });
  await s.hold(Math.max(2, (200 - s.frame) / 60), 'strip-full');
});
shot('mn_dream_map', { save: judge(['0-1', '0-2', '1-1', '1-2', '1-3', '1-4'], { unlockAll: false }), cinema: true, cursor: false }, async (s) => {
  await s.goto('#map', { settle: 0.3 });
  await s.hold(sec(168) + 2, 'map-flip');
});
shot('mn_highfive', { save: judge(['2-2']), cinema: C('on:a,2.4,0.5,0.6'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await runNight(s, 'zero', [{ kind: 'flip', t: 'q1' }]);
  await s.offCamera(async () => { await waitSfx(s, 'gremlin_flip', { timeout: 40 }); await s.wait(0.6); });
  await waitSfx(s, 'highfive', { timeout: 30, mark: 'highfive' });
  await s.hold(1.8, 'sparks');
});
shot('mn_listen', { save: judge(['2-2']), cinema: C('on:b,2.4,0.5,0.6'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await runNight(s, 'zero', [{ kind: 'flip', t: 'q3' }]); // a quiet, b beeps
  await s.offCamera(async () => { await waitSfx(s, 'botNote', { timeout: 60 }); });
  await s.wait(0.4);
  await waitSfx(s, 'botNote', { timeout: 30, mark: 'listen-beep' });
  await s.hold(2, 'after');
});
for (const [id, entry, izoom] of [['mn_codex_flipper', 'flipper', 1.8], ['mn_codex_schrodi', 'schrodi', 1.75], ['mn_codex_qubble', 'qubble', 1.7]]) {
  shot(id, { save: judge(), cinema: { insert: entry, izoom }, cursor: false }, async (s) => {
    await s.placeCursor({ x: 960, y: 540 });
    await s.goto('#codex', { settle: 0.4 });
    await s.wait(0.6);
    await s.click({ x: 960, y: 540 }, { dur: 0.05 }); s.mark('act');
    await s.hold(2.4, 'insert');
  });
}
shot('mn_bloch', { save: judge(), cinema: { insert: 'qubble', part: 'sphere' }, cursor: false }, async (s) => {
  await s.placeCursor({ x: 700, y: 600 });
  await s.goto('#codex', { settle: 0.5 });
  await s.wait(0.5);
  await s.drag({ x: 700, y: 600 }, { x: 1220, y: 470 }, { dur: 1.4, pre: 0.1 });
  await s.hold(2.5, 'spin');
});
shot('mn_clone_glitch', { save: judge(['1-2']), cinema: C('room', { toasts: 1 }), cursor: false }, async (s) => {
  await prepLevel(s, '1-3', { progs: null });
  await s.wait(1.2);
  await s.np((np) => np.testAll()); s.mark('test-all'); // the naive copy fails at once → the clone glitch
  await waitSfx(s, /glitch|test_fail/, { timeout: 60, mark: 'glitch' });
  await s.hold(3, 'glitch');
});
shot('mn_shor9', { save: judge(), cinema: C('wide'), cursor: false }, async (s) => {
  await prepLevel(s, '4-1', { progs: 'solution' });
  await runNight(s, 'zero', [{ kind: 'both', t: 'q5' }]);
  await s.offCamera(async () => { await waitDark(s, { timeout: 40 }); });
  await waitSfx(s, /gremlin_flip|ghost_phase/, { timeout: 60, mark: 'strike' });
  await s.hold(2.5, 'after');
});
shot('mn_lights_out', { save: judge(), cinema: C('wide'), cursor: false }, async (s) => {
  await prepLevel(s, '4-2', { progs: 'solution' });
  // Critic Fix 6: the caretaker's "the end. zzz" think bubble reads as THE END in the black; drop only that caption
  await s.np((np) => { const sc = np.scene, say = sc.say.bind(sc); sc.say = (text, ...a) => (/the end/i.test(String(text)) ? undefined : say(text, ...a)); });
  await runNight(s, 'plus', [{ kind: 'phase', t: 'q2' }]);
  await s.offCamera(async () => { await waitDark(s, { timeout: 60 }).catch(() => {}); });
  await waitSfx(s, 'syndromeChord', { timeout: 90, mark: 'chord-1' });
  await s.hold(4, 'after'); // (the level plays the chord once per night; the edit repeats it for the second hearing)
});

// payoff
shot('tr_morning_check', { save: judge(['2-2']), cinema: C('wide', { hud: 1 }), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.offCamera(async () => { await s.np((np) => np.testAll()); });
  await waitSfx(s, 'level_win', { timeout: 120, mark: 'win' });
  await s.offCamera(async () => { await s.skipDialogue(); });
  await s.waitFor('.win-card', { timeout: 10 }); s.mark('win-card');
  await s.hold(sec(282) + 0.5, 'stars');
});
shot('tr_curtain_call', { save: judge(), cinema: true, cursor: false }, async (s) => {
  await s.goto('#credits', { settle: 0.2 });
  await s.offCamera(async () => { await s.wait(12); });
  await s.hold(22, 'curtain-call'); // stage time 12–34 s: wake-up, the bots' tune, the gremlins' bow, Schrödi steps out
});

// closing: a still, cosy morning (day, everyone asleep, Schrödi idling)
shot('tr_morning_still', { save: judge(['2-2']), cinema: C('room'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.hold(sec(378) + 1.5, 'cosy');
});

// build: the three gremlins ON SCREEN (Critic, trailer song cut, Fix 1). X-ray view (the game's simulator-only view;
// its "X-RAY" pill is part of the hidden HUD) so the gremlin and the dream are visible at night; a ~1.5× punch-in on the
// struck Qubble; on camera only after lights-out (the room snaps to full night off camera), so all three beats share
// the same night look. Flipper: bit flip (Sunny→Moony). Phasey: phase flip of a swirl. Wobbles: a π/2 tip about x,
// i.e. HALF of a flip (|0⟩ → the equator), physically a partial rotation. Mark 'strike' at the hit; ≥ 4.5 s.
for (const [id, lvl, input, err, sfx] of [
  ['tr_gremlin_flipper', '2-3', 'zero', { kind: 'flip', t: 'q2' }, 'gremlin_flip'],
  ['tr_gremlin_phasey', '3-1', 'plus', { kind: 'phase', t: 'q2' }, 'ghost_phase'],
  ['tr_gremlin_wobbles', '3-3', 'zero', { kind: 'wobble', t: 'q2', axis: 'x', angle: Math.PI / 2 }, 'wobble'],
]) {
  shot(id, { save: judge(), cinema: C('on:q2,1.5,0.42,0.6'), cursor: false }, async (s) => {
    await prepLevel(s, lvl, { progs: 'solution', xray: true });
    await runNight(s, input, [err]);
    await s.offCamera(async () => {
      await s.waitFor(() => window.__np?.scene?.nightTarget === 1, { timeout: 60 });
      // lights already out when the clip starts, and they STAY out for the whole clip (the morning relight would
      // otherwise start ~1.3 s after the strike): pin the scene's night level at 1
      await s.np((np) => { np.scene.night = 1; Object.defineProperty(np.scene, 'nightTarget', { get: () => 1, set() {}, configurable: true }); });
      await s.wait(0.05);
    });
    s.mark('on-camera');
    await waitSfx(s, 'gremlin_sneak', { timeout: 40, mark: 'sneak' }).catch(() => {});
    await waitSfx(s, sfx, { timeout: 40, mark: 'strike' });
    await s.hold(3.0, 'after-strike');
    if (s.frame < 270) await s.hold((270 - s.frame) / 60, 'tail');
  });
}

// Codex insert: Wobbles alone on paper (jiggle idle, then a click → strike pose + wobble sfx), ~150+ frames
shot('mn_codex_wobbles', { save: judge(), cinema: { insert: 'wobbles', izoom: 1.8 }, cursor: false }, async (s) => {
  await s.placeCursor({ x: 960, y: 540 });
  await s.goto('#codex', { settle: 0.4 });
  await s.wait(0.8);
  await s.click({ x: 960, y: 540 }, { dur: 0.05 }); s.mark('act');
  await s.hold(2.0, 'insert');
});

// Lab Notebook circuit page full-frame (cinema, nb=1), X-ray on, during a 2-3 night: the cards → gates morph, then the
// playback cursor walking the circuit
shot('mn_notebook_circuit', {
  save: judge(['2-2'], { settings: { nerd: true } }), cinema: C('wide', { nb: 1 }), cursor: false,
  localStorage: { 'np.nb.open': '1', 'np.nb.page': 'circuit', 'np.nb.w': '1920' },
}, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution', xray: true });
  await s.eval(() => localStorage.removeItem('np.nb.morphed'));
  await s.wait(0.5);
  await runNight(s, 'plus', [{ kind: 'flip', t: 'q2' }]); s.mark('morph');
  await waitSfx(s, 'highfive', { timeout: 30, mark: 'playback' });
  await s.hold(3.5, 'circuit');
});
