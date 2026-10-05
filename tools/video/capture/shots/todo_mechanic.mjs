/**
 * Mechanic video shots (docs/VIDEO_CRITIQUE.md §5 timing table, REVISED §5–6). Classic layout (the full game UI,
 * composited later at 88% over a fixed caption strip), 3840×2160, dialogue ON: Schrödi's lines are the narration.
 * The on-screen cursor performs every action. Cold open, threat close-ups, circuit reveal and closing reuse the
 * trailer's cinema takes (tr-cold-open-*, tr-build-flipper, tr-circuit-reveal, tr-closing-morning).
 */
import { shot } from '../lib.mjs';
import { P } from './params.mjs';
import { judge, waitSfx, waitNightDone, prepLevel } from './common.mjs';

const H = P('mechanic.handle', 1.0);
const RUN = '.controls button:has-text("Run night")';
const TEST = '.controls button:has-text("Test all")';
const XRAY = '.controls button:has-text("X-ray")';

/** Open a level with its intro dialogue playing on camera; click through it at a readable pace. */
async function intro(s, id, { read = 1.6, maxLines = 6 } = {}) {
  await s.goto('#level/' + id, { settle: 0.3 });
  for (let i = 0; i < maxLines; i++) {
    if (!(await s.exists('.dialogue'))) break;
    await s.waitForEvent((e) => e.type === 'dialogue_typed', { timeout: 12 }).catch(() => {});
    await s.wait(read);
    await s.click('.dialogue .bubble', { dur: i === 0 ? 0.7 : 0.25 });
  }
  await s.wait(0.4);
}
/** Hold until the clip has at least n frames (the todo's length incl. handles). */
async function pad(s, n, label = 'pad') { if (s.frame < n) await s.hold((n - s.frame) / 60 + 0.5, label); else await s.hold(0.5, label); }
/** Dialogue that pops up later (win lines etc.): read and click through. */
async function readDialogue(s, { read = 1.6, max = 6 } = {}) {
  for (let i = 0; i < max; i++) {
    if (!(await s.exists('.dialogue'))) return;
    await s.waitForEvent((e) => e.type === 'dialogue_typed', { timeout: 12 }).catch(() => {});
    await s.wait(read);
    await s.click('.dialogue .bubble', { dur: 0.35 });
  }
}

// 0:06–0:24  The rule: 1-1, PEEK → collapse → the X-ray replay shows the lost half
shot('me_11_peek', { save: judge(['0-1', '0-2']) }, async (s) => {
  await s.placeCursor({ x: 1100, y: 760 });
  await intro(s, '1-1');
  await s.loadProgram({ morning: 'PEEK q1' }, { onCamera: true, typing: true, cps: 12 });
  await s.wait(0.5);
  // Run night on a swirly dream: the PEEK wakes q1 and the swirl collapses
  await s.tap(RUN, () => window.__np.runNight('plus', []), { dur: 0.7 }); s.mark('run');
  await waitSfx(s, 'peek_collapse', { timeout: 40, mark: 'collapse' });
  await waitNightDone(s, { timeout: 40, after: 0.8 });
  await readDialogue(s);
  await s.click(TEST, { dur: 0.7 }); s.mark('test');
  await waitSfx(s, 'test_fail', { timeout: 60, mark: 'fail' }).catch(() => {});
  await s.wait(1.5);
  await readDialogue(s);
  if (await s.exists('.xray-offer')) { await s.click('.xray-offer', { dur: 0.7 }); s.mark('xray-replay'); }
  else { await s.click(XRAY, { dur: 0.7 }); s.mark('xray'); }
  await waitSfx(s, 'peek_collapse', { timeout: 40, mark: 'collapse-xray' }).catch(() => {});
  await s.hold(3 + H, 'lost-half');
  await pad(s, 1140);
});

// 0:24–0:38  The threat: night falls, a gremlin strikes, one blanket twitches (classic framing; close-up = tr-build-flipper)
shot('me_threat', { save: judge(['2-2']), hideDialogue: true }, async (s) => {
  await s.placeCursor({ x: 980, y: 800 });
  await s.goto('#level/2-3', { settle: 0.3 });
  await s.offCamera(async () => { await s.wait(0.5); await s.np((np) => { np.closeDialogue(); np.editor().setProgs({ bedtime: [], morning: [] }); }); await s.wait(0.3); });
  await s.wait(H);
  await s.tap(RUN, () => window.__np.runNight('zero', [{ kind: 'flip', t: 'q2' }]), { dur: 0.7 });
  await waitSfx(s, 'gremlin_flip', { timeout: 40, mark: 'flip' });
  await s.hold(3 + H, 'twitch');
  await pad(s, 900);
});

// 0:38–0:50  Can't copy: 1-3 the photocopier fails (clone glitch) → 1-4 sharing with HIGHFIVE (silk threads in X-ray)
shot('me_encode', { save: judge(['2-1'], { flags: { 'nerd:found': true } }), quietBubbles: true }, async (s) => {
  // 2-2 "Tuck In": Schrödi's checklist HIGHFIVEs share one dream across three Qubbles (silk threads in X-ray).
  // Retake: both intro lines are read with nothing over them (the Text modal opens only after line 2 is
  // dismissed), and the win line gets a ≥ 3.5 s tail. Dialogue boxes stay on (they are the narration);
  // quietBubbles only drops the idle think-bubble quips in the room.
  await s.placeCursor({ x: 1100, y: 760 });
  await s.goto('#level/2-2', { settle: 0.3 });
  await s.waitFor('.dialogue', { timeout: 3 });
  for (let i = 1; i <= 2; i++) {
    const t = await s.waitForEvent((e) => e.type === 'dialogue_typed', { timeout: 12 });
    s.mark(`line-${i}-typed`, { eventFrame: t.frame, text: t.text });
    await s.wait(3.0); // Critic: ≥ 3 s after each line finishes typing
    await s.click('.dialogue .bubble', { dur: i === 1 ? 0.7 : 0.3 });
  }
  await s.waitFor(() => !document.querySelector('.dialogue'), { timeout: 3 });
  await s.wait(0.5);
  await s.loadProgram(await s.solution('2-2'), { onCamera: true });
  await s.click(XRAY, { dur: 0.6 });
  await s.click(RUN, { dur: 0.6 }); s.mark('run');
  await waitSfx(s, 'highfive', { timeout: 30, mark: 'highfive-1' });
  await waitSfx(s, 'highfive', { timeout: 30, mark: 'highfive-2' }).catch(() => {});
  const w = await s.waitForEvent((e) => e.type === 'dialogue_typed', { timeout: 60 });
  s.mark('win-line-typed', { eventFrame: w.frame, text: w.text });
  await s.hold(3.6, 'win-line-read');
});

// 0:50–1:15  Ask, don't look: 2-1 (~10 s used): a bot HIGHFIVEs two Qubbles, LISTEN → BEEP
shot('me_21_listen', { save: judge(['1-4']) }, async (s) => {
  await s.placeCursor({ x: 1100, y: 760 });
  await s.goto('#level/2-1', { settle: 0.3 });
  await s.offCamera(async () => { await s.wait(0.5); await s.skipDialogue(); });
  await s.loadProgram(await s.solution('2-1'), { onCamera: true });
  // force the interesting night (q2 flipped, so the bot beeps) behind a real-looking click on Run night
  await s.tap(RUN, () => window.__np.runNight('zero', [{ kind: 'flip', t: 'q2' }]), { dur: 0.6 });
  s.mark('run');
  await waitSfx(s, 'highfive', { timeout: 30, mark: 'highfive' });
  await waitSfx(s, 'botNote', { timeout: 30, mark: 'beep' });
  await s.hold(2 + H, 'beep');
  await pad(s, 660);
});

// 1:15–1:38  The repair: 2-3 full night (IF a BEEP and b QUIET → BOOP q1), caretaker walks; then Test all ✓
shot('me_23_night', { save: judge(['2-2']) }, async (s) => {
  await s.placeCursor({ x: 1100, y: 760 });
  await s.goto('#level/2-3', { settle: 0.3 });
  await s.offCamera(async () => { await s.wait(0.5); await s.skipDialogue(); });
  await s.wait(H);
  await s.loadProgram(await s.solution('2-3'), { onCamera: true });
  await s.tap(RUN, () => window.__np.runNight('zero', [{ kind: 'flip', t: 'q1' }]), { dur: 0.6 }); // a BEEP, b QUIET → BOOP q1
  s.mark('run');
  await waitSfx(s, 'gremlin_flip', { timeout: 40, mark: 'flip' });
  await waitSfx(s, 'botNote', { timeout: 40, mark: 'beep' });
  await waitSfx(s, 'boop', { timeout: 40, mark: 'boop' });
  // a survived night makes the game run the full test by itself ("Night survived! Now the full test…") → win
  await waitSfx(s, 'level_win', { timeout: 120, mark: 'win' });
  await readDialogue(s, { read: 1.4 });
  await s.waitFor('.win-card', { timeout: 8 });
  await s.hold(2 + H, 'win-card');
  await pad(s, 1440);
});

// 1:38–1:52  The proof: X-ray replay of one night, the inspector's 3D Bloch sphere shows the shared dream survived
shot('me_23_xray', { save: judge(['2-2']) }, async (s) => {
  await s.placeCursor({ x: 1100, y: 760 });
  await s.goto('#level/2-3', { settle: 0.3 });
  await s.offCamera(async () => {
    await s.wait(0.5); await s.skipDialogue();
    await s.np((np) => { const L = np.LEVELS.find((l) => l.id === '2-3'); np.editor().setProgs({ bedtime: L.solution.bedtime, morning: L.solution.morning }); np.testAll(); });
    await s.waitFor('.win-card, .dialogue', { timeout: 120 }); await s.skipDialogue(); await s.waitFor('.win-card', { timeout: 10 });
  });
  await s.wait(H);
  await s.click('.win-card button:has-text("X-ray replay")', { dur: 0.8 }); s.mark('xray-replay');
  await waitSfx(s, /gremlin_flip/, { timeout: 40, mark: 'flip' });
  const p = await s.np((np) => np.screenPos('q2'));
  await s.click({ x: p.x, y: p.y - 40 }, { dur: 0.8 }); s.mark('inspector');
  await waitSfx(s, 'boop', { timeout: 40, mark: 'boop' }).catch(() => {});
  await s.hold(3 + H, 'survived');
  await pad(s, 900);
});

// 1:52–2:08  The twist: 3-1 Phasey; bots all quiet but the dream is wrong → the SPIN sandwich catches it
shot('me_31_phase', { save: judge(['2-5']) }, async (s) => {
  await s.placeCursor({ x: 1100, y: 760 });
  await intro(s, '3-1', { read: 1.3 });
  await s.click(TEST, { dur: 0.7 }); s.mark('test-fail');
  await waitSfx(s, 'test_fail', { timeout: 120, mark: 'fail' }).catch(() => {});
  await s.wait(2);
  await readDialogue(s, { read: 1.3 });
  await s.loadProgram(await s.solution('3-1'), { onCamera: true });
  await s.tap(RUN, () => window.__np.runNight('plus', [{ kind: 'phase', t: 'q2' }]), { dur: 0.6 });
  s.mark('run-fixed');
  await waitSfx(s, 'ghost_phase', { timeout: 40, mark: 'phase' });
  await waitSfx(s, 'boop', { timeout: 60, mark: 'fix' }).catch(() => {});
  await waitNightDone(s, { timeout: 30, after: 1 });
  await s.hold(1 + H, 'fixed');
  await pad(s, 1020);
});


// cold open + closing (cinema, reused framing of the trailer)
shot('me_cold_blanket', { save: judge(['2-2']), cinema: { camera: 'on:q2,2.4,0.5,0.6' }, cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: { bedtime: '', morning: '' } });
  await s.offCamera(async () => { await s.np((np) => { np.scene.nightTarget = 1; }); await s.wait(3); });
  await s.hold(450 / 60 + 1, 'moonlit-breathing');
});
shot('sc_morning_still', { save: judge(['2-2']), cinema: { camera: 'room' }, cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.hold(360 / 60 + 1.5, 'cosy');
});
