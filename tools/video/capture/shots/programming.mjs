/**
 * REVISED 2 "programming" shots: the normal UI at DPR 2 (3840×2160) so the Bot Code editor is crisp.
 * Every card highlight is logged (events.json "cardHighlights" / events of type card_current, with frame, line, op),
 * every pick/drop is logged as sfx card_pick / card_drop, and layout.json carries the editor column, toolbox and stage
 * boxes per frame (for split screens). Named marks are in meta.json.
 *
 *   node tools/video/capture/run.mjs tools/video/capture/shots/programming.mjs --jobs 1
 */
import { shot } from '../lib.mjs';
import { judge, prepLevel, waitSfx, waitNightDone } from './common.mjs';

const RUN = '.controls button:has-text("Run night")';
const TEST = '.controls button:has-text("Test all")';
const XRAY = '.controls button:has-text("X-ray")';
const COL = '.prog-list[data-phase="morning"]';
const card = (i) => `${COL} > .card >> nth=${i}`;
const LAYOUT = ['.editor', '.prog-col', '.toolbox', '.editor-foot', '.stage-canvas-wrap', '.controls', '.topbar', '.card.current', '.toast', '.modal', '.popover', '.win-card', '.dialogue', '.test-strip', '.nb', '.snip-drawer'];
const BASE = { save: judge(['2-2']), layoutSelectors: LAYOUT };
/** mark the frame of the most recent logged sfx `name` (e.g. the card_pick inside a drag) */
const markEv = (s, mark, name) => { const e = [...s.events].reverse().find((x) => x.type === 'sfx' && x.name === name && x.frame != null); if (e) s.mark(mark, { frame: e.frame, eventFrame: e.frame }); };
const pad = async (s, n, label) => { if (s.frame < n) await s.hold((n - s.frame) / 60, label); };

// 2-3 decoder with the BOOP q2 fix missing (it is dragged in on camera)
const DECODER_NO_FIX2 = `HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
HIGHFIVE q2 -> b
HIGHFIVE q3 -> b
LISTEN a
LISTEN b
IF a BEEP and b QUIET -> fix1
IF a BEEP and b BEEP -> fix2
IF a QUIET and b BEEP -> fix3
END
fix1:
BOOP q1
END
fix2:
END
fix3:
BOOP q3`;

// ── pg_split_23: room + program; BOOP q2 dragged into the fix2 block, then the night runs with every card lit ──
shot('pg_split_23', BASE, async (s) => {
  await s.placeCursor({ x: 1500, y: 980 });
  await prepLevel(s, '2-3', { progs: { morning: DECODER_NO_FIX2 } });
  await s.camera('full');
  await s.wait(1.0);
  // the fix2 block's END is card 14 (0-based); dropping on its upper half inserts BOOP before it
  await s.drag('.toolbox .card.op-BOOP', card(14), { dur: 1.1, pre: 0.8, ay: 0.2 });
  markEv(s, 'pick', 'card_pick'); markEv(s, 'drop', 'card_drop');
  await s.wait(0.5);
  await s.click(`${card(14)} >> .chip`, { dur: 0.5 }); s.mark('target-chip');
  await s.wait(0.45);
  await s.click('.popover .chip:has-text("q2")', { dur: 0.45 }); s.mark('boop-q2');
  await s.wait(0.9);
  // q2 flipped → a BEEP + b BEEP → IF … -> fix2 → BOOP q2
  await s.tap(RUN, () => window.__np.runNight('plus', [{ kind: 'flip', t: 'q2' }]), { dur: 0.7 }); s.mark('run');
  await s.cursorTo({ x: 1240, y: 1000 }, { dur: 0.6 });
  await waitSfx(s, 'gremlin_flip', { timeout: 40, mark: 'flip' });
  await waitSfx(s, 'highfive', { timeout: 40, mark: 'highfive' });
  await waitSfx(s, 'botNote', { timeout: 40, mark: 'listen-a' });
  await waitSfx(s, 'botNote', { timeout: 40, mark: 'listen-b' });
  await s.waitForEvent((e) => e.type === 'card_current' && e.op === 'LABEL', { timeout: 20 }); s.mark('if-jump'); // the IF's jump lands on fix2
  await waitSfx(s, 'boop', { timeout: 40, mark: 'boop' });
  await s.wait(1.0);
  await s.click(XRAY, { dur: 0.6 }); s.mark('xray');
  await s.hold(3.0, 'xray-intact');
  await pad(s, 1100, 'tail');
});

// ── pg_drag_closeup: cards dragged into an empty column; IF conditions toggled ──
shot('pg_drag_closeup', BASE, async (s) => {
  await s.placeCursor({ x: 1500, y: 900 });
  await prepLevel(s, '2-3', { progs: { morning: '' } });
  await s.camera('.editor', { pad: 20 });
  await s.wait(0.5);
  await s.drag('.toolbox .card.op-HIGHFIVE', COL, { dur: 0.8, pre: 0.6, ay: 0.08 }); markEv(s, 'pick', 'card_pick'); markEv(s, 'drop', 'card_drop');
  await s.drag('.toolbox .card.op-HIGHFIVE', COL, { dur: 0.7, pre: 0.4, ay: 0.3 }); markEv(s, 'pick-2', 'card_pick'); markEv(s, 'drop-2', 'card_drop');
  await s.drag('.toolbox .card.op-LISTEN', COL, { dur: 0.7, pre: 0.4, ay: 0.5 }); s.mark('drop-LISTEN');
  await s.drag('.toolbox .card.op-IF', COL, { dur: 0.7, pre: 0.4, ay: 0.7 }); s.mark('drop-IF');
  await s.wait(0.3);
  const ifc = `${COL} > .card.op-IF`;
  await s.click(`${ifc} .chip.beep, ${ifc} .chip.quiet`, { dur: 0.5 }); s.mark('cond-QUIET');
  await s.wait(0.5);
  await s.click(`${ifc} .chip.beep, ${ifc} .chip.quiet`, { dur: 0.2 }); s.mark('cond-BEEP');
  await s.hold(1.0, 'program');
  await pad(s, 360, 'tail');
});

// ── pg_if_anatomy: the Card Guide for IF (annotated callouts + walkthrough with the jump taken) ──
shot('pg_if_anatomy', BASE, async (s) => {
  await s.placeCursor({ x: 1500, y: 900 });
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.wait(0.4);
  await s.click('.toolbox .card.op-IF .info', { dur: 0.8 }); s.mark('open');
  await s.cursorTo({ x: 1700, y: 1000 }, { dur: 0.6 });
  await s.hold(5.0, 'anatomy');
  await pad(s, 300, 'tail');
});

// ── pg_test_strip: Test all, the strip filling ✓ ──
shot('pg_test_strip', BASE, async (s) => {
  await s.placeCursor({ x: 1400, y: 900 });
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.wait(0.5);
  await s.click(TEST, { dur: 0.6 }); s.mark('test');
  await waitSfx(s, 'level_win', { timeout: 180, mark: 'win' });
  await s.hold(1.0, 'strip-full');
  await pad(s, 240, 'tail');
});

// ── pg_step_scrub: step mode forward through a LISTEN, then back: the one-way snap + toast ──
shot('pg_step_scrub', BASE, async (s) => {
  await s.placeCursor({ x: 700, y: 900 });
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.wait(0.4);
  await s.click('.controls button:has-text("Step mode")', { dur: 0.6 }); s.mark('step-mode');
  await s.tap(RUN, () => window.__np.runNight('zero', [{ kind: 'flip', t: 'q1' }], true), { dur: 0.5 });
  const fwd = '.controls button:has-text("step ▶")', back = '.controls button:has-text("◀ step")';
  for (let i = 0; i < 40; i++) {
    await s.click(fwd, { dur: i ? 0.2 : 0.5, after: 0.25 });
    // stop two steps after the first LISTEN result
    const seen = s.events.filter((e) => e.type === 'botNote').length;
    if (seen >= 1) { s.mark('listen-reached'); await s.click(fwd, { dur: 0.2, after: 0.35 }); break; }
  }
  for (let i = 0; i < 4; i++) {
    await s.click(back, { dur: i ? 0.2 : 0.5, after: 0.3 });
    if (s.events.some((e) => e.type === 'sfx' && e.name === 'snap_measure')) { s.mark('snap'); break; }
  }
  await s.hold(2.0, 'toast');
  await pad(s, 300, 'tail');
});

// ── pg_snippets_doodle: save a snippet, insert it, then draw a doodle comment ──
shot('pg_snippets_doodle', BASE, async (s) => {
  await s.placeCursor({ x: 1500, y: 900 });
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.wait(0.4);
  await s.click(card(0), { dur: 0.6, ax: 0.25 }); s.mark('select-1');
  await s.withKey('Shift', async () => { await s.click(card(3), { dur: 0.5, ax: 0.25 }); }); s.mark('select-4');
  await s.wait(0.3);
  await s.click('.editor-foot button.sun', { dur: 0.5 }); s.mark('save-snippet');
  await s.waitFor('.modal input', { timeout: 3, after: 0.4 });
  await s.click('.modal button:has-text("Save")', { dur: 0.5 }); s.mark('saved');
  await s.wait(0.8);
  await s.drag('.snip >> nth=0', `${COL}`, { dur: 0.9, pre: 0.5, ay: 0.95 }); markEv(s, 'snippet', 'card_drop');
  await s.wait(1.0);
  await s.eval((sel) => document.querySelector(sel)?.scrollTo({ top: 0, behavior: 'smooth' }), COL); // back to the top (virtual-time smooth scroll)
  await s.wait(0.7);
  // a COMMENT card with a doodle
  await s.drag('.toolbox .card.op-NOTE', card(0), { dur: 0.9, pre: 0.5, ay: 0.15 }); s.mark('comment-dropped');
  await s.wait(0.4);
  await s.click(`${card(0)} >> .doodle-box`, { dur: 0.5 }); s.mark('doodle-open');
  await s.waitFor('.doodle-modal canvas', { timeout: 3, after: 0.3 });
  const b = await s.box('.doodle-modal canvas');
  const P = (u, v) => ({ x: b.x + b.width * u, y: b.y + b.height * v });
  const circ = (cx, cy, r, n = 24) => Array.from({ length: n + 1 }, (_, i) => P(cx + r * Math.cos((i / n) * 2 * Math.PI) * 0.6, cy + r * Math.sin((i / n) * 2 * Math.PI)));
  await s.stroke(circ(0.5, 0.5, 0.36), { dur: 1.0 }); s.mark('doodle-face');
  await s.stroke([P(0.42, 0.42), P(0.42, 0.46)], { dur: 0.15, pre: 0.25 });
  await s.stroke([P(0.58, 0.42), P(0.58, 0.46)], { dur: 0.15, pre: 0.2 });
  await s.stroke([P(0.4, 0.6), P(0.45, 0.66), P(0.5, 0.68), P(0.55, 0.66), P(0.6, 0.6)], { dur: 0.45, pre: 0.25 }); s.mark('doodle-smile');
  await s.wait(0.4);
  await s.click('.doodle-modal button:has-text("Done")', { dur: 0.5 }); s.mark('doodle-done');
  await s.hold(1.5, 'doodle-card');
  await pad(s, 360, 'tail');
});

// ── pg_export_qiskit: the Text view, then the Lab Notebook's Export page with the Qiskit code ──
shot('pg_export_qiskit', {
  ...BASE, save: judge(['2-2'], { settings: { nerd: true } }),
  localStorage: { 'np.nb.open': '1', 'np.nb.page': 'circuit', 'np.nb.morphed': '1', 'np.nb.w': '760' },
}, async (s) => {
  await s.placeCursor({ x: 1400, y: 900 });
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.click('.editor-foot button:has-text("Text")', { dur: 0.7 }); s.mark('text-view');
  await s.waitFor('.modal textarea', { timeout: 3 });
  await s.hold(2.0, 'text');
  await s.click('.modal button:has-text("Load")', { dur: 0.6 }); // same program back in; closes the modal
  // load the night paused (a finished passing night auto-starts Test all, whose win dialogue would cover the notebook)
  await s.tap(RUN, () => window.__np.runNight('zero', [{ kind: 'flip', t: 'q2' }], true), { dur: 0.6 }); s.mark('run');
  await s.wait(0.8);
  await s.click('.nb-tab[data-id="export"]', { dur: 0.7 }); s.mark('export');
  await s.waitFor('.nb-code', { timeout: 3, after: 0.3 });
  if (await s.exists('.nb-export button:has-text("Qiskit")')) await s.click('.nb-export button:has-text("Qiskit")', { dur: 0.4 });
  s.mark('qiskit');
  await s.cursorTo('.nb-code', { dur: 0.6, ay: 0.7 });
  await s.hold(3.0, 'qiskit-code');
  await pad(s, 300, 'tail');
});

// ── me_23_drag (mechanic): the last three decoder cards dragged in (LISTEN a, then BOOP q1 + END into the fix1 block) ──
const DECODER_MISSING = `HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
HIGHFIVE q2 -> b
HIGHFIVE q3 -> b
LISTEN b
IF a BEEP and b QUIET -> fix1
IF a BEEP and b BEEP -> fix2
IF a QUIET and b BEEP -> fix3
END
fix1:
fix2:
BOOP q2
END
fix3:
BOOP q3`;
shot('me_23_drag', BASE, async (s) => {
  await s.placeCursor({ x: 1500, y: 950 });
  await prepLevel(s, '2-3', { progs: { morning: DECODER_MISSING } });
  await s.camera('full');
  await s.wait(0.5);
  await s.drag('.toolbox .card.op-LISTEN', card(4), { dur: 0.8, pre: 0.5, ay: 0.2 }); markEv(s, 'pick', 'card_pick'); s.mark('drop-LISTEN');
  await s.wait(0.3);
  // after the insert, fix2's label is card 11: drop BOOP on its upper half → it lands in the fix1 block
  await s.drag('.toolbox .card.op-BOOP', card(11), { dur: 0.8, pre: 0.45, ay: 0.2 }); s.mark('drop-BOOP');
  await s.wait(0.3);
  await s.drag('.toolbox .card.op-END', card(12), { dur: 0.8, pre: 0.45, ay: 0.2 }); markEv(s, 'drop', 'card_drop');
  await s.wait(0.6); s.mark('done');
  await s.hold(1.5, 'program');
});
