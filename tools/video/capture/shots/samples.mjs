/**
 * Self-test sample shots (capture tool acceptance): title hover-peek, 2-3 full night, Codex Bloch sphere spin,
 * plus the same beats in the cinema layout.   node tools/video/capture/run.mjs tools/video/capture/shots/samples.mjs
 */
import { shot } from '../lib.mjs';
import { P } from './params.mjs';

const JUDGE = { unlockAll: true };

// 1. Title: the cursor drifts in and sweeps the letters; each hover peeks a letter-Qubble, which collapses.
shot('sample-title-peek', { save: JUDGE }, async (s) => {
  await s.placeCursor({ x: 260, y: 900 });
  await s.goto('#title', { settle: 0.3 });
  await s.camera('full');
  await s.wait(P('sample-title-peek.lead', 1.0));
  await s.cursorTo({ x: 700, y: 640 }, { dur: 1.1, ease: 'out' });
  await s.wait(0.4);
  // sweep across "PEEKING" at letter height
  const xs = await s.eval(() => [...Array(11).keys()].map((i) => { const W = innerWidth, slot = Math.min(W / 12, 120); return W / 2 - (slot * 11) / 2 + slot * (i + 0.5); }));
  await s.cursorTo({ x: xs[3] - 40, y: 470 }, { dur: 0.6 });
  s.mark('sweep-start');
  await s.cursorTo({ x: xs[8] + 20, y: 455 }, { dur: 1.6, ease: 'inOutSine', arc: 0.02 });
  await s.camera([660, 250, 960, 540]);
  await s.cursorTo({ x: 1100, y: 800 }, { dur: 0.8 });
  await s.hold(P('sample-title-peek.tail', 1.5), 'collapsed-letters');
});

// 2. Level 2-3 (classic layout): load the solution through the Text modal, Run night through the gremlin's strike
//    and the bots' LISTEN, until the caretaker's fix.
shot('sample-23-night', { save: { ...JUDGE, progress: ['1-1', '1-2', '1-3', '2-1', '2-2'] } }, async (s) => {
  await s.placeCursor({ x: 980, y: 760 });
  await s.goto('#level/2-3', { settle: 0.2 });
  await s.offCamera(async () => { await s.wait(0.6); await s.skipDialogue(); await s.wait(0.3); });
  await s.wait(0.6);
  const sol = await s.solution('2-3');
  await s.loadProgram(sol, { onCamera: true });
  await s.wait(0.6);
  await s.click('.controls button:has-text("Run night")', { dur: 0.7 });
  s.mark('run');
  await s.cursorTo({ x: 1500, y: 980 }, { dur: 0.8 });
  const strike = await s.waitForEvent((e) => e.type === 'sfx' && /gremlin_flip|ghost_phase|wobble/.test(e.name), { timeout: 20 });
  s.mark('gremlin-strike', { atFrame: strike.frame });
  await s.waitForEvent((e) => e.type === 'botNote' || (e.type === 'sfx' && /listen/.test(e.name)), { timeout: 20 });
  s.mark('listen');
  await s.waitForEvent((e) => e.type === 'sfx' && e.name === 'boop', { timeout: 20, after: 1.2 }).catch(() => s.wait(2));
  await s.hold(1.0, 'tail');
});

// 3. Codex: open the Qubble entry and spin its 3D Bloch sphere by dragging; then measure.
shot('sample-codex-bloch', { save: JUDGE }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#codex', { settle: 0.3 });
  await s.click('.codex-entry[data-id="qubble"]', { dur: 0.9 });
  await s.waitFor('.codex-detail .cd-sphere canvas', { timeout: 3, after: 0.6 });
  const b = await s.box('.codex-detail .cd-sphere canvas');
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await s.camera('.codex-detail', { pad: 40 });
  await s.drag({ x: c.x - 60, y: c.y + 10 }, { x: c.x + 70, y: c.y - 30 }, { dur: 1.2, pre: 0.8 });
  await s.wait(0.4);
  await s.drag({ x: c.x + 40, y: c.y - 50 }, { x: c.x - 50, y: c.y + 40 }, { dur: 1.0, pre: 0.4 });
  await s.hold(P('sample-codex-bloch.tail', 1.2), 'sphere');
});

// 4. Cinema: the title letters alone, peeked by the cursor (trailer "peek" beat).
shot('sample-cinema-title', { save: JUDGE, cinema: true }, async (s) => {
  await s.placeCursor({ x: 300, y: 820 });
  await s.goto('#title', { settle: 0.3 });
  await s.wait(P('sample-cinema-title.lead', 0.8));
  await s.cursorTo({ x: 945, y: 470 }, { dur: 1.0, ease: 'inOut' });
  await s.hold(P('sample-cinema-title.tail', 1.5), 'collapse');
});

// 5. Cinema: 2-3 night in the full-frame room (no editor/dialogue), driven through the ?qa hooks.
shot('sample-cinema-23', { save: { ...JUDGE, progress: ['2-2'] }, cinema: { camera: 'room' }, cursor: false }, async (s) => {
  await s.goto('#level/2-3', { settle: 0.2 });
  await s.offCamera(async () => {
    await s.wait(0.5);
    await s.np((np) => { np.closeDialogue(); const L = np.LEVELS.find((l) => l.id === '2-3'); np.editor().setProgs({ bedtime: L.solution.bedtime, morning: L.solution.morning }); });
    await s.wait(0.5);
  });
  await s.wait(0.8);
  await s.np((np) => { const L = np.LEVELS.find((l) => l.id === '2-3'); np.runNight('zero', [{ kind: 'flip', t: 'q2' }]); });
  s.mark('run');
  await s.waitForEvent((e) => e.type === 'sfx' && e.name === 'boop', { timeout: 30, after: 1.5 });
  await s.hold(0.8, 'tail');
});

// 6. Cinema hero insert: the Qubble's Bloch sphere full-frame, spun.
shot('sample-cinema-sphere', { save: JUDGE, cinema: { insert: 'qubble', part: 'sphere' } }, async (s) => {
  await s.placeCursor({ x: 1500, y: 900 });
  await s.goto('#codex', { settle: 0.5 });
  await s.drag({ x: 760, y: 560 }, { x: 1160, y: 470 }, { dur: 1.4, pre: 0.8 });
  await s.hold(1.0, 'sphere');
});
