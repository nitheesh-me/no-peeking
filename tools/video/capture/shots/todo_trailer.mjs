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

// peek: the title letter-Qubbles; first collapse exactly at clip frame 95 (the EDL's peek hit), then the rest on 8ths
shot('tr_title_peek', { save: judge(), cinema: true }, async (s) => {
  await s.placeCursor({ x: 330, y: 760 });
  await s.goto('#title', { settle: 0.3 });
  const L = await s.eval(() => {
    const W = innerWidth, Hh = innerHeight, text = 'NO PEEKING!', slot = Math.min(W / (text.length + 1), 400), k = slot / 78;
    return [...text].map((ch, i) => ({ ch, x: W / 2 - (slot * text.length) / 2 + slot * (i + 0.5), y: Hh * 0.46 + Math.sin(i * 1.3) * slot * 0.08 - 30 * k, r: slot * 0.5 }));
  });
  const letters = L.filter((l) => l.ch !== ' ');
  const yl = letters.reduce((a, l) => a + l.y, 0) / letters.length;
  const hit = (l) => ({ x: l.x - Math.sqrt(Math.max(0, l.r * l.r - (l.y - yl) ** 2)) + 2, y: yl });
  await s.cursorTo({ x: hit(letters[0]).x - 70, y: yl + 6 }, { dur: 80 / 60, ease: 'out' });
  for (const l of letters) { await s.cursorTo(hit(l), { dur: BEAT / 2, ease: 'linear', arc: 0 }); s.mark('hit-' + l.ch); }
  await s.cursorTo({ x: letters.at(-1).x + 160, y: yl + 260 }, { dur: 0.8, ease: 'out' });
  await s.hold(2.5, 'collapsed');
});

// peek → build: in-place day→night relight, same framing
shot('tr_relight', { save: judge(['2-2']), cinema: C('room'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.wait(1.0);
  await NIGHT_LIGHTS(s); s.mark('relight');
  await s.hold(sec(252) + 0.5, 'relight');
});

// build: Wobbles strikes in the dark
shot('tr_gremlin_wobbles', { save: judge(), cinema: C('tight'), cursor: false }, async (s) => {
  await prepLevel(s, '3-3', { progs: 'solution' });
  const e = await s.np((np) => { const n = np.LEVELS.find((l) => l.id === '3-3').noise; return { kind: 'wobble', t: 'q2', axis: n.wobbleAxis ?? 'x', angle: (n.wobbleAngles ?? [Math.PI / 2])[0] }; });
  await runNight(s, 'plus', [e]);
  await s.offCamera(async () => { await waitDark(s, { timeout: 40 }); });
  await waitSfx(s, 'wobble', { timeout: 40, mark: 'strike' });
  await s.hold(2.5, 'after-strike');
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
