/**
 * Mechanic re-takes from the Critic's plan review (docs/VIDEO_CRITIQUE.md, "Milestone: mechanic plan").
 * New ids (the v1 takes stay untouched for anything already cut against them). Each v2 replays its v1 with the
 * SAME seed (seed = the v1 shot-name hash), so nights, tests and timing match v1 up to the changed beats.
 * quietBubbles: drops only the room's idle/caretaker think bubbles ("yes! jump ↪", "the end. zzz"); Schrödi's
 * dialogue boxes (the narration) stay.
 */
import { shot } from '../lib.mjs';
import { judge, waitSfx, waitNightDone, prepLevel } from './common.mjs';

const H = 1.0;
const RUN = '.controls button:has-text("Run night")';
const TEST = '.controls button:has-text("Test all")';
// same FNV-1a as lib.mjs hashStr: reuse the v1 seed
const seedOf = (n) => { let h = 2166136261; for (const c of n) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

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
async function pad(s, n, label = 'pad') { if (s.frame < n) await s.hold((n - s.frame) / 60 + 0.5, label); else await s.hold(0.5, label); }
/** read: seconds to hold each line after it finishes typing (array = per line, last value repeats). */
async function readDialogue(s, { read = [1.6], max = 6, markAs = 'line' } = {}) {
  for (let i = 0; i < max; i++) {
    if (!(await s.exists('.dialogue'))) return;
    const t = await s.waitForEvent((e) => e.type === 'dialogue_typed', { timeout: 12 }).catch(() => null);
    if (t) s.mark(`${markAs}-${i + 1}-typed`, { eventFrame: t.frame, text: t.text });
    await s.wait(read[Math.min(i, read.length - 1)]);
    await s.click('.dialogue .bubble', { dur: 0.35 });
  }
}
/** Marks at the frames of logged events since index `from` (post hoc, exact frames). */
function markEvents(s, from, pick) {
  const counts = {};
  for (const e of s.events.slice(from)) {
    const name = pick(e); if (!name || e.frame == null) continue;
    counts[name] = (counts[name] ?? 0) + 1;
    s.marks.push({ name: `${name}-${counts[name]}`, frame: e.frame });
  }
}

// gap 2 (me_23_night_v2) CANCELLED by the Director: me_23_night already holds "Two little beeps…" 3.6 s.

// change 9: the same X-ray replay as me_23_xray, without the idle think bubbles in the room.
shot('me_23_xray_v2', { save: judge(['2-2']), seed: seedOf('me_23_xray'), quietBubbles: true }, async (s) => {
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

// changes 3: the fail demo as before, then the strip and the X-ray state are cleared (strip fades out while the
// Text modal opens) and the correct SPIN program runs in NORMAL view. Marks at every SPIN / night / LISTEN / fix.
// M014 (source 71–302 of v1): the honest ✗ strip stays, but the purple "X-ray replay" offer chip (and any X-RAY pill)
// is hidden for the whole take so nothing reads as X-ray footage; the room is in normal view throughout.
shot('me_31_phase_v2', { save: judge(['2-5']), seed: seedOf('me_31_phase'), quietBubbles: true,
  css: '.stage-hud .xray-offer, .stage-hud .xray-pill { display: none !important; }' }, async (s) => {
  await s.placeCursor({ x: 1100, y: 760 });
  await intro(s, '3-1', { read: 1.3 });
  await s.click(TEST, { dur: 0.7 }); s.mark('test-fail');
  await waitSfx(s, 'test_fail', { timeout: 120, mark: 'fail' }).catch(() => {});
  await s.wait(2);
  await readDialogue(s, { read: [1.3] });
  // clean slate before the fix: leave X-ray, fade the red test strip and the replay offer out
  await s.np((np) => {
    np.setXray(false);
    for (const el of document.querySelectorAll('.stage-hud .test-strip, .stage-hud .xray-offer')) {
      el.style.transition = 'opacity 0.35s ease'; el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }
  });
  s.mark('strip-cleared');
  await s.wait(0.5);
  await s.loadProgram(await s.solution('3-1'), { onCamera: true });
  const from = s.events.length;
  await s.tap(RUN, () => window.__np.runNight('plus', [{ kind: 'phase', t: 'q2' }]), { dur: 0.6 });
  s.mark('run-fixed');
  await waitSfx(s, 'ghost_phase', { timeout: 40, mark: 'phase' });
  await waitSfx(s, 'boop', { timeout: 60, mark: 'fix' }).catch(() => {});
  await waitNightDone(s, { timeout: 30, after: 1 });
  markEvents(s, from, (e) => (e.type === 'sfx' && e.name === 'spin' ? 'spin'
    : e.type === 'setScene' && e.scene === 'run' ? 'night-scene'
      : e.type === 'sfx' && e.name === 'gremlin_sneak' ? 'night-sneak'
        : e.type === 'botNote' ? 'listen'
          : e.type === 'sfx' && e.name === 'boop' ? 'boop' : null));
  // the replay strip must not come back in the normal-view run
  if (await s.exists('.stage-hud .xray-offer')) s.warn('xray offer visible after the fixed run');
  await s.hold(1 + H, 'fixed');
  await pad(s, 1020);
});

// ── me_23_decoder (Critic change 4): the fix1 decoder line written on camera, same view as me_23_drag ──
// start: HIGHFIVE ×4, LISTEN a, the fix2/fix3 IFs, END, empty fix1 block. Then LISTEN b, a new IF
// (a BEEP and b QUIET → fix1), BOOP q1 under fix1, END. Physics: a = q1⊕q2 BEEP, b = q2⊕q3 QUIET → q1 flipped → BOOP q1.
const COL = '.prog-list[data-phase="morning"]';
const card = (i) => `${COL} > .card >> nth=${i}`;
const LAYOUT = ['.editor', '.prog-col', '.toolbox', '.editor-foot', '.stage-canvas-wrap', '.controls', '.topbar', '.card.current', '.toast', '.modal', '.popover', '.win-card', '.dialogue', '.test-strip', '.nb', '.snip-drawer'];
const lastEv = (s, name) => [...s.events].reverse().find((x) => x.type === 'sfx' && x.name === name && x.frame != null);
const DECODER_START = `HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
HIGHFIVE q2 -> b
HIGHFIVE q3 -> b
LISTEN a
IF a BEEP and b BEEP -> fix2
IF a QUIET and b BEEP -> fix3
END
fix1:
fix2:
BOOP q2
END
fix3:
BOOP q3`;
shot('me_23_decoder', { save: judge(['2-2']), layoutSelectors: LAYOUT, quietBubbles: true }, async (s) => {
  await s.placeCursor({ x: 1500, y: 950 });
  await prepLevel(s, '2-3', { progs: { morning: DECODER_START } });
  await s.camera('full');
  await s.wait(1.0);
  // 1. LISTEN dropped under LISTEN a (lands as LISTEN a by default) → its chip set to b
  await s.drag('.toolbox .card.op-LISTEN', card(5), { dur: 0.8, pre: 0.6, ay: 0.2 });
  s.mark('drop-LISTEN', { frame: lastEv(s, 'card_drop')?.frame ?? s.frame });
  await s.wait(0.25);
  await s.click(`${card(5)} >> .chip`, { dur: 0.4 });
  await s.wait(0.3);
  await s.click('.popover .chip:text-is("b")', { dur: 0.35 }); s.mark('listen-b');
  await s.wait(0.4);
  // 2. a new IF dropped above the fix2 IF (index 6): defaults to one condition and the first spot (fix1)
  await s.drag('.toolbox .card.op-IF', card(6), { dur: 0.8, pre: 0.5, ay: 0.2 });
  s.mark('drop-IF', { frame: lastEv(s, 'card_drop')?.frame ?? s.frame });
  await s.wait(0.4);
  const IFC = card(6);
  // 3. first condition: a → BEEP (pick a in the bot chip; BEEP is the default)
  await s.click(`${IFC} >> .cond-row >> nth=0 >> .chip >> nth=0`, { dur: 0.45 });
  await s.wait(0.3);
  await s.click('.popover .chip:text-is("a")', { dur: 0.3 }); s.mark('cond-a');
  await s.wait(0.4);
  // 4. second condition: + adds the next unused bot (b, BEEP) → toggle to QUIET
  await s.click(`${IFC} >> .chip.add:not(.rm)`, { dur: 0.4 });
  await s.wait(0.35);
  await s.click(`${IFC} >> .cond-row >> nth=1 >> .chip.beep`, { dur: 0.35 }); s.mark('cond-b');
  await s.wait(0.4);
  // 5. target: the jump spot → fix1
  await s.click(`${IFC} >> .chip:text-is("fix1")`, { dur: 0.4 });
  await s.wait(0.3);
  await s.click('.popover .chip:text-is("fix1")', { dur: 0.3 }); s.mark('target');
  await s.wait(0.5);
  // 6. BOOP dropped on fix2's label (index 11 now) → lands at the end of the fix1 block (BOOP q1 by default)
  await s.drag('.toolbox .card.op-BOOP', card(11), { dur: 0.8, pre: 0.5, ay: 0.2 });
  s.mark('drop-BOOP', { frame: lastEv(s, 'card_drop')?.frame ?? s.frame });
  await s.wait(0.4);
  // 7. END dropped on fix2's label (index 12 now) → closes the fix1 block
  await s.drag('.toolbox .card.op-END', card(12), { dur: 0.8, pre: 0.5, ay: 0.2 });
  s.mark('drop-END', { frame: lastEv(s, 'card_drop')?.frame ?? s.frame });
  await s.wait(0.4); s.mark('done');
  // verify the program the cursor wrote is the reference decoder line
  const txt = await s.np((np) => np.quantum.printProgram(np.editor().exportProgs().morning));
  if (!/IF a BEEP and b QUIET -> fix1/.test(txt) || !/fix1:\nBOOP q1\nEND/.test(txt) || !/LISTEN a\nLISTEN b/.test(txt)) s.warn('decoder program not as intended:\n' + txt);
  await s.hold(1.5, 'program');
});

// ── me_23_night_v2 (reinstated after the bubble scan): me_23_night verbatim (same seed, program, choreography and
// the v1 readDialogue pacing), with quietBubbles so the caretaker's "yes! jump ↪" / "the end. zzz" think bubbles are
// gone. Schrödi's boxes ("Two little beeps…", 3.6 s as in v1) and Flipper's line stay. Must diff frame-identical
// against me_23_night apart from bubble entries (tools/video/capture/difftake.py).
async function readDialogueV1(s, { read = 1.6, max = 6 } = {}) {
  for (let i = 0; i < max; i++) {
    if (!(await s.exists('.dialogue'))) return;
    await s.waitForEvent((e) => e.type === 'dialogue_typed', { timeout: 12 }).catch(() => {});
    await s.wait(read);
    await s.click('.dialogue .bubble', { dur: 0.35 });
  }
}
shot('me_23_night_v2', { save: judge(['2-2']), seed: seedOf('me_23_night'), quietBubbles: true }, async (s) => {
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
  await waitSfx(s, 'level_win', { timeout: 120, mark: 'win' });
  await readDialogueV1(s, { read: 1.4 });
  await s.waitFor('.win-card', { timeout: 8 });
  await s.hold(2 + H, 'win-card');
  await pad(s, 1440);
});
