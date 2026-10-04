/**
 * Showcase shots (docs/VIDEO_CRITIQUE.md §6, REVISED §7): "one caretaker's whole career in 4 minutes".
 * Classic layout at DPR 1 (1920×1080): this footage is sped up, tiled (4×4 grid) or composited at 88%, never pushed
 * in, so 1080p sources are ≥1:1 and capture ~3× faster. Clean frames: the Codex is unlocked entry by entry (no
 * "judge mode" badge).
 */
import { shot } from '../lib.mjs';
import { judge, prepLevel, waitSfx, waitNightDone, ALL_DONE } from './common.mjs';

const S1 = { scale: 1 };
const TEST = '.controls button:has-text("Test all")';
const RUN = '.controls button:has-text("Run night")';
const before = (id) => ALL_DONE.slice(0, ALL_DONE.indexOf(id));
const CODEX_IDS = ['caretaker', 'schrodi', 'qubble', 'databox', 'bot', 'flipper', 'phasey', 'wobbles', 'sunny', 'moony', 'swirl', 'silk', 'lights', 'blanket', 'bed', 'sign', 'flashlight', 'box', 'window', 'clock', 'door',
  ...['BOOP', 'SHUSH', 'SPIN', 'HIGHFIVE', 'LISTEN', 'RESET', 'PEEK', 'IF', 'JUMP', 'LABEL', 'END', 'NOTE'].map((o) => 'card-' + o)];

// ── the 4×4 grid: every level solving (solution loaded, Test all → win card) ──
for (const id of ALL_DONE) {
  shot(`sc-grid-${id}`, { ...S1, save: judge(before(id)) }, async (s) => {
    await s.placeCursor({ x: 1180, y: 900 });
    await prepLevel(s, id, { progs: 'solution' });
    await s.wait(0.8);
    await s.click(TEST, { dur: 0.6 }); s.mark('test-all');
    await waitSfx(s, 'level_win', { timeout: 180, mark: 'win' });
    await s.offCamera(async () => { await s.skipDialogue(); });
    await s.waitFor('.win-card', { timeout: 10 });
    await s.hold(2, 'win-card');
  });
}

// ── 5 hero levels: intro line, load the program, one night, Test all, win ──
for (const [id, err] of [['1-1', []], ['2-3', [{ kind: 'flip', t: 'q2' }]], ['3-1', [{ kind: 'phase', t: 'q1' }]], ['3-3', null], ['4-1', [{ kind: 'flip', t: 'q4' }]]]) {
  shot(`sc-hero-${id}`, { ...S1, save: judge(before(id)) }, async (s) => {
    await s.placeCursor({ x: 1180, y: 860 });
    await s.goto('#level/' + id, { settle: 0.3 });
    await s.waitForEvent((e) => e.type === 'dialogue_typed', { timeout: 10 }).catch(() => {});
    await s.wait(1.2);
    await s.offCamera(async () => { await s.skipDialogue(); });
    await s.loadProgram(await s.solution(id), { onCamera: true });
    const errs = err ?? (await s.np((np) => { const L = np.LEVELS.find((l) => l.id === '3-3'); const n = L.noise; return [{ kind: 'wobble', t: 'q2', axis: n.wobbleAxis ?? 'x', angle: (n.wobbleAngles ?? [Math.PI / 2])[0] }]; }));
    await s.tap(RUN, (e) => window.__np.runNight('plus', e), { dur: 0.6, arg: errs }); s.mark('run');
    await waitNightDone(s, { timeout: 90, after: 0.6 });
    await s.click(TEST, { dur: 0.6 }); s.mark('test-all');
    await waitSfx(s, 'level_win', { timeout: 180, mark: 'win' });
    await s.offCamera(async () => { await s.skipDialogue(); });
    await s.waitFor('.win-card', { timeout: 10 });
    await s.hold(2, 'win-card');
  });
}

// ── meta beats ──
shot('sc-meta-clone-13', { ...S1, save: judge(before('1-3')) }, async (s) => {
  await prepLevel(s, '1-3', { progs: null });
  await s.click(TEST, { dur: 0.6 });
  await waitSfx(s, /glitch|test_fail/, { timeout: 60, mark: 'glitch' });
  await s.hold(5, 'glitch');
});
shot('sc-meta-mapflip', { ...S1, save: judge(['0-1', '0-2', '1-1', '1-2', '1-3', '1-4'], { unlockAll: false }) }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#map', { settle: 0.3 });
  await s.hold(6, 'map-flip');
});
shot('sc-meta-lightsout-42', { ...S1, save: judge(before('4-2')) }, async (s) => {
  await prepLevel(s, '4-2', { progs: 'solution' });
  await s.tap(RUN, () => window.__np.runNight('plus', [{ kind: 'phase', t: 'q2' }]), { dur: 0.6 });
  await waitSfx(s, 'syndromeChord', { timeout: 90, mark: 'chord' });
  await waitNightDone(s, { timeout: 90, after: 2 });
});

// ── modes: Gremlin Lab, Night Shift, the Night Lab threshold chart ──
shot('sc-lab', { ...S1, save: judge(ALL_DONE) }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#lab', { settle: 0.5 });
  await s.offCamera(async () => { await s.skipDialogue(); });
  await s.click('button:has-text("Run lab night")', { dur: 0.8 }); s.mark('run');
  await s.wait(10);
  await s.click('button:has-text("Threshold chart")', { dur: 0.8 }); s.mark('threshold');
  await s.hold(6, 'chart');
});
shot('sc-endless', { ...S1, save: judge(ALL_DONE) }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#endless', { settle: 0.5 });
  await s.offCamera(async () => { await s.skipDialogue(); });
  await s.hold(1.5, 'arrive');
  if (await s.exists(TEST)) { await s.click(TEST, { dur: 0.7 }); s.mark('test-all'); }
  await s.wait(8);
});

// ── the Codex: unlock toast in a fresh save → silhouettes → a full book (no judge badge) ──
shot('sc-codex-unlock', { ...S1, save: { progress: { '0-1': { done: true, stars: [true, false, false] } } } }, async (s) => {
  await s.placeCursor({ x: 900, y: 700 });
  await s.goto('#level/1-1', { settle: 0.3 });
  await s.offCamera(async () => { await s.wait(0.5); await s.skipDialogue(); });
  const c = await s.np((np) => { const p = np.scene.objectCentre('clock'); const r = document.querySelector('.stage-canvas-wrap canvas').getBoundingClientRect(); return p ? { x: r.left + p.x, y: r.top + p.y } : null; });
  if (c) { await s.click(c, { dur: 0.9 }); s.mark('click-clock'); }
  await s.waitForEvent((e) => e.type === 'toast_show', { timeout: 4 }).catch(() => {});
  await s.wait(2.5);
  await s.goto('#codex', { settle: 1.5 });
  await s.cursorTo({ x: 700, y: 520 }, { dur: 1.2 });
  await s.hold(2, 'silhouettes');
});
shot('sc-codex-tour', { ...S1, save: { progress: Object.fromEntries(ALL_DONE.map((i) => [i, { done: true, stars: [true, true, true] }])), codex: CODEX_IDS } }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#codex', { settle: 0.6 });
  await s.cursorTo({ x: 600, y: 420 }, { dur: 1.0 });
  await s.click('.codex-entry[data-id="flipper"]', { dur: 0.8 });
  await s.wait(1); await s.click('.codex-detail canvas', { dur: 0.5 }); await s.wait(2.5);
  await s.key('Escape', { after: 0.6 });
  await s.click('.codex-entry[data-id="card-IF"]', { dur: 1.0 });
  await s.wait(6);
  await s.key('Escape', { after: 0.6 });
  await s.click('.codex-entry[data-id="qubble"]', { dur: 1.0 });
  await s.waitFor('.codex-detail .cd-sphere canvas', { timeout: 3, after: 0.5 });
  const b = await s.box('.codex-detail .cd-sphere canvas');
  await s.drag({ x: b.x + b.width * 0.3, y: b.y + b.height * 0.55 }, { x: b.x + b.width * 0.75, y: b.y + b.height * 0.35 }, { dur: 1.2 });
  await s.hold(2, 'sphere');
});

// ── Lab Notebook pages in X-ray (nerd mode) ──
shot('sc-notebook', { ...S1, save: judge(['2-2'], { settings: { nerd: true } }), localStorage: { 'np.nb.open': '1', 'np.nb.page': 'circuit', 'np.nb.w': '560' } }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await prepLevel(s, '2-3', { progs: 'solution', xray: true });
  await s.tap(RUN, () => window.__np.runNight('plus', [{ kind: 'flip', t: 'q2' }]), { dur: 0.6 });
  await s.wait(6);
  const tabs = await s.eval(() => [...document.querySelectorAll('.nb-tab:not(.sealed)')].map((b) => b.dataset.id));
  for (const t of tabs.slice(0, 6)) { await s.click(`.nb-tab[data-id="${t}"]`, { dur: 0.5 }); s.mark('page-' + t); await s.wait(2.2); }
  await s.hold(1, 'tail');
});

// ── QoL quick-fire: snippets, help slot, step mode + timeline, doodle comment ──
shot('sc-qol-snippets', { ...S1, save: judge(['2-2']) }, async (s) => {
  await s.placeCursor({ x: 1300, y: 900 });
  await prepLevel(s, '2-3', { progs: null });
  await s.click('.editor-foot button:has-text("Snippets")', { dur: 0.7 });
  await s.hold(3, 'snippets');
});
shot('sc-qol-help', { ...S1, save: judge(['2-2']) }, async (s) => {
  await s.placeCursor({ x: 1300, y: 900 });
  await prepLevel(s, '2-3', { progs: null });
  const card = '.editor .card.op-HIGHFIVE >> nth=0';
  await s.drag(card, '.help-slot', { dur: 1.0, pre: 0.7 }); s.mark('help');
  await s.hold(4, 'help');
});
shot('sc-qol-stepmode', { ...S1, save: judge(['2-2']) }, async (s) => {
  await s.placeCursor({ x: 700, y: 900 });
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.click('.controls button:has-text("Step mode")', { dur: 0.7 });
  await s.tap(null, () => window.__np.runNight('zero', [{ kind: 'flip', t: 'q1' }], true));
  for (let i = 0; i < 6; i++) { await s.click('.controls button:has-text("step ▶")', { dur: i ? 0.25 : 0.6 }); await s.wait(0.6); }
  await s.click('.timeline', { dur: 0.6, ax: 0.7 }); s.mark('scrub');
  await s.hold(2, 'timeline');
});

// ── credits with the roll (showcase keeps the cards) ──
shot('sc-credits', { ...S1, save: judge(ALL_DONE), cursor: false }, async (s) => {
  await s.goto('#credits', { settle: 0.2 });
  await s.hold(60, 'credits');
});
