/**
 * Showcase captures from the Critic's showcase plan (docs/VIDEO_CRITIQUE.md, "Milestone: showcase plan").
 * All NEW ids, 4K (DPR 2), quietBubbles on (drops only the room's idle/caretaker think bubbles; dialogue stays).
 */
import { shot } from '../lib.mjs';
import { judge, prepLevel, waitSfx, waitNightDone, ALL_DONE } from './common.mjs';

const RUN = '.controls button:has-text("Run night")';
const TEST = '.controls button:has-text("Test all")';
const before = (id) => ALL_DONE.slice(0, ALL_DONE.indexOf(id));
const Q = { quietBubbles: true };
/** post-hoc marks at the exact frames of logged events since index `from` */
function markEvents(s, from, pick) {
  const n = {};
  for (const e of s.events.slice(from)) {
    const name = pick(e); if (!name || e.frame == null) continue;
    n[name] = (n[name] ?? 0) + 1; s.marks.push({ name: `${name}-${n[name]}`, frame: e.frame });
  }
}
const nightMarks = (e) => e.type === 'botNote' ? 'listen'
  : e.type === 'sfx' && /gremlin_flip|ghost_phase|wobble/.test(e.name) ? 'error'
  : e.type === 'sfx' && /^(boop|shush)$/.test(e.name) ? 'fix'
  : e.type === 'sfx' && e.name === 'spin' ? 'spin' : null;

// 1. 3-3 Wobbles: a half flip (partial rotation) that the LISTEN discretizes into a full flip or none
shot('sc_run_3-3', { ...Q, save: judge(before('3-3')) }, async (s) => {
  await s.placeCursor({ x: 1180, y: 860 });
  await prepLevel(s, '3-3', { progs: 'solution' });
  await s.wait(1.0);
  const err = await s.np((np) => { const n = np.LEVELS.find((l) => l.id === '3-3').noise; return [{ kind: 'wobble', t: 'q2', axis: n.wobbleAxis ?? 'x', angle: (n.wobbleAngles ?? [Math.PI / 2])[0] }]; });
  const from = s.events.length;
  await s.tap(RUN, (e) => window.__np.runNight('plus', e), { dur: 0.6, arg: err }); s.mark('run', { error: err[0] });
  await waitSfx(s, 'wobble', { timeout: 60 });
  await waitSfx(s, 'botNote', { timeout: 60 }); // the first LISTEN after the wobble = the discretization moment
  s.mark('discretize');
  await waitNightDone(s, { timeout: 90, after: 2.5 });
  markEvents(s, from, nightMarks);
});

// 2. 4-1 Shor-9: an error, the syndrome LISTENs, the fix
shot('sc_run_4-1', { ...Q, save: judge(before('4-1')) }, async (s) => {
  await s.placeCursor({ x: 1180, y: 860 });
  await prepLevel(s, '4-1', { progs: 'solution' });
  await s.wait(1.0);
  const from = s.events.length;
  await s.tap(RUN, () => window.__np.runNight('zero', [{ kind: 'both', t: 'q5' }]), { dur: 0.6 }); s.mark('run', { error: 'Y on q5' });
  await waitNightDone(s, { timeout: 150, after: 2.5 });
  markEvents(s, from, nightMarks);
});

// 3. the map-flip puzzle, actually solved: read the two map-bots, tap the odd node (1-2: both bots beep)
shot('sc_map_flip_solve', { ...Q, save: judge(['0-1', '0-2', '1-1', '1-2', '1-3', '1-4'], { unlockAll: false, flags: { mapFlipIdx0: false, mapFlipIdx1: true, mapFlipIdx2: false } }) }, async (s) => {
  await s.placeCursor({ x: 960, y: 980 });
  await s.goto('#map', { settle: 0.3 });
  await s.wait(1.0);
  await s.cursorTo('.mapflip-banner .mapflip-row', { dur: 1.0 }); s.mark('read-bots');
  await s.wait(2.5);
  await s.click('.map-node-btn[aria-label^="Level 1-2"]', { dur: 1.1 }); s.mark('tap');
  await s.waitForEvent((e) => e.type === 'sfx' && e.name === 'test_pass', { timeout: 3 }).then((e) => s.mark('solved', { eventFrame: e.frame })).catch(() => {});
  await s.hold(4, 'fixed');
});

// 4. Night Shift (endless): load a decoder, a couple of nights, then the 100-night test
shot('sc_night_shift', { ...Q, save: judge(ALL_DONE) }, async (s) => {
  await s.placeCursor({ x: 1180, y: 900 });
  await s.goto('#endless', { settle: 0.5 });
  await s.offCamera(async () => {
    await s.skipDialogue();
    // re-roll (seeded) until a 3-Qubble shift, which the 2-3 / 3-1 decoders solve
    for (let i = 0; i < 12 && (await s.np((np) => np.editor().level.qubbles.length)) !== 3; i++) {
      await s.eval(() => [...document.querySelectorAll('.lab-bar button')].find((b) => b.textContent.includes('New shift'))?.click());
      await s.wait(0.8); await s.skipDialogue();
    }
  });
  await s.wait(1.2);
  const ref = await s.np((np) => (np.editor().level.toolbox.includes('SPIN') ? '3-1' : '2-3'));
  const sol = await s.solution(ref);
  await s.loadProgram({ morning: sol.morning }, { onCamera: true }); s.mark('loaded', { decoder: ref });
  for (let k = 0; k < 2; k++) {
    await s.click(RUN, { dur: 0.6 }); s.mark(`night-${k + 1}`);
    await waitNightDone(s, { timeout: 90, after: 1.0 });
  }
  await s.click(TEST, { dur: 0.6 }); s.mark('test-all');
  await s.waitForEvent((e) => e.type === 'toast_show' || (e.type === 'sfx' && /test_pass|test_fail|level_win/.test(e.name)), { timeout: 120 }).catch(() => {});
  await s.hold(4, 'result');
});

// 5. the Lab Notebook in 4K, a wide drawer so the active page can be pushed in ~1.6×
shot('sc_notebook_4k', { ...Q, save: judge(['2-2'], { settings: { nerd: true } }), localStorage: { 'np.nb.open': '1', 'np.nb.page': 'state', 'np.nb.w': '760' } }, async (s) => {
  await s.placeCursor({ x: 1000, y: 900 });
  await prepLevel(s, '2-3', { progs: 'solution', xray: true });
  await s.tap(RUN, () => window.__np.runNight('plus', [{ kind: 'flip', t: 'q2' }]), { dur: 0.6 }); s.mark('run');
  await s.wait(4);
  for (const t of ['state', 'bloch', 'circuit', 'stabilizers']) {
    if (!(await s.exists(`.nb-tab[data-id="${t}"]:not(.sealed)`))) continue;
    await s.click(`.nb-tab[data-id="${t}"]`, { dur: 0.5 }); s.mark('page-' + t);
    await s.cursorTo({ x: 1150, y: 980 }, { dur: 0.5 });
    await s.wait(t === 'circuit' ? 4.5 : 3.5);
  }
  await s.hold(1.5, 'notebook');
});

// 6. the threshold chart in 4K, p = ½ crossover pointed at
shot('sc_threshold_4k', { ...Q, save: judge(ALL_DONE) }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#lab', { settle: 0.5 });
  await s.offCamera(async () => { await s.skipDialogue(); });
  await s.click('button:has-text("Threshold chart")', { dur: 0.9 }); s.mark('chart-open');
  await s.wait(2.5);
  // the dashed crossover line is the svg <line> with stroke-dasharray "3 4"
  const p = await s.eval(() => { const l = [...document.querySelectorAll('.modal svg line')].find((x) => x.getAttribute('stroke-dasharray') === '3 4'); if (!l) return null; const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2 + 10, y: r.top + r.height * 0.55 }; });
  if (p) { await s.cursorTo(p, { dur: 1.2 }); s.mark('p-half', p); }
  await s.hold(8, 'chart');
});

// 7. Lights Out by ear, re-take: the old sc_lights_out_ear's seed + choreography, quietBubbles drop the
//    "nope / yes! jump / the end. zzz" think bubbles in the dark. Timing must diff frame-identical (bubbles aside).
const seedOf = (n) => { let h = 2166136261; for (const c of n) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const padTo = async (s, n, label = 'pad') => { await s.hold(Math.max(0.5, (n - s.frame) / 60 + 0.5), label); };
shot('sc_lights_out_ear_v2', { ...Q, scale: 1, seed: seedOf('sc_lights_out_ear'), save: judge(before('4-2')) }, async (s) => {
  await s.placeCursor({ x: 1180, y: 900 });
  await prepLevel(s, '4-2', { progs: 'solution' });
  await s.tap(RUN, () => window.__np.runNight('plus', [{ kind: 'phase', t: 'q2' }]), { dur: 0.6 });
  await waitSfx(s, 'syndromeChord', { timeout: 90, mark: 'chord' });
  await padTo(s, 678, 'lights-out');
});

// 8. pg_win_links: 0-1 win card, "Pros call this: measurement ↗ … conditional X gate ↗" legible; cursor still
shot('pg_win_links', { ...Q, save: judge([]) }, async (s) => {
  await s.placeCursor({ x: 1500, y: 960 });
  await prepLevel(s, '0-1', { progs: 'solution' });
  await s.offCamera(async () => {
    await s.np((np) => np.testAll());
    await s.waitFor('.win-card, .dialogue', { timeout: 120 });
    for (let i = 0; i < 20 && !(await s.exists('.win-card')); i++) { await s.skipDialogue(); await s.wait(0.3); }
    await s.waitFor('.win-card', { timeout: 10, after: 1.5 }); // stars pop-in finished
  });
  const b = await s.box('.win-card .pro-term');
  if (b) { await s.camera('.win-card .pro-term', { pad: 120 }); s.mark('pro-term', { rect: [b.x, b.y, b.width, b.height].map(Math.round) }); }
  await s.hold(10, 'links');
});
