/**
 * Showcase batch from videos/final/work/shot_todo.json. Normal UI (the Editor composites it at 88% over the caption
 * strip), DPR 1 = 1920×1080 (≥1:1 at 88%, and the footage is sped up), lossless FFV1. sc_grid16 is not captured: the
 * Editor tiles it from the sc_lv_* clips. sc_title_peek stays registered from the sample capture.
 */
import { shot } from '../lib.mjs';
import { judge, prepLevel, waitSfx, waitNightDone, ALL_DONE } from './common.mjs';

const S1 = { scale: 1 };
const TEST = '.controls button:has-text("Test all")';
const RUN = '.controls button:has-text("Run night")';
const before = (id) => ALL_DONE.slice(0, ALL_DONE.indexOf(id));
const pad = async (s, n, label = 'pad') => { await s.hold(Math.max(0.5, (n - s.frame) / 60 + 0.5), label); };
const CODEX_IDS = ['caretaker', 'schrodi', 'qubble', 'databox', 'bot', 'flipper', 'phasey', 'wobbles', 'sunny', 'moony', 'swirl', 'silk', 'lights', 'blanket', 'bed', 'sign', 'flashlight', 'box', 'window', 'clock', 'door',
  ...['BOOP', 'SHUSH', 'SPIN', 'HIGHFIVE', 'LISTEN', 'RESET', 'PEEK', 'IF', 'JUMP', 'LABEL', 'END', 'NOTE'].map((o) => 'card-' + o)];
const FULL_BOOK = { progress: Object.fromEntries(ALL_DONE.map((i) => [i, { done: true, stars: [true, true, true] }])), codex: CODEX_IDS };

// every level: load the solution through the Text modal (on camera), Test all, win card
const LV = { '0-1': 2076, '0-2': 2076, '1-1': 900, '1-2': 2076, '1-4': 2184, '2-1': 2076, '2-2': 2076, '2-3': 1020, '2-4': 2076, '2-5': 2184, '3-1': 900, '3-2': 2184, '3-3': 900, '4-1': 900 };
for (const [id, n] of Object.entries(LV)) {
  shot(`sc_lv_${id}`, { ...S1, save: judge(before(id)) }, async (s) => {
    await s.placeCursor({ x: 1180, y: 900 });
    await s.goto('#level/' + id, { settle: 0.3 });
    await s.waitForEvent((e) => e.type === 'dialogue_typed', { timeout: 10 }).catch(() => {});
    await s.wait(1.0);
    await s.offCamera(async () => { await s.skipDialogue(); });
    await s.loadProgram(await s.solution(id), { onCamera: true });
    await s.wait(0.5);
    await s.click(TEST, { dur: 0.6 }); s.mark('test-all');
    await waitSfx(s, 'level_win', { timeout: 240, mark: 'win' });
    for (let i = 0; i < 6 && (await s.exists('.dialogue')); i++) { await s.wait(1.4); await s.click('.dialogue .bubble', { dur: 0.3 }); }
    await s.waitFor('.win-card', { timeout: 10 }); s.mark('win-card');
    await s.hold(3, 'win-card'); // always ≥3 s of the card, even after long win dialogue
    await pad(s, n, 'win-card');
  });
}

shot('sc_dream_map', { ...S1, save: judge(ALL_DONE.slice(0, 11), { unlockAll: false, flags: { mapFlipDone: true } }) }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#map', { settle: 0.4 });
  await s.cursorTo({ x: 520, y: 520 }, { dur: 1.4 });
  await s.cursorTo({ x: 1400, y: 480 }, { dur: 2.4, ease: 'inOutSine' });
  await pad(s, 438, 'map');
});
shot('sc_clone_glitch', { ...S1, save: judge(before('1-3')) }, async (s) => {
  await s.placeCursor({ x: 1180, y: 900 });
  await prepLevel(s, '1-3', { progs: null });
  await s.click(TEST, { dur: 0.6 });
  await waitSfx(s, /glitch|test_fail/, { timeout: 60, mark: 'glitch' });
  await pad(s, 540, 'glitch');
});
shot('sc_map_flip', { ...S1, save: judge(['0-1', '0-2', '1-1', '1-2', '1-3', '1-4'], { unlockAll: false }) }, async (s) => {
  await s.placeCursor({ x: 960, y: 950 });
  await s.goto('#map', { settle: 0.3 });
  await pad(s, 540, 'map-flip');
});
shot('sc_lights_out_ear', { ...S1, save: judge(before('4-2')) }, async (s) => {
  await s.placeCursor({ x: 1180, y: 900 });
  await prepLevel(s, '4-2', { progs: 'solution' });
  await s.tap(RUN, () => window.__np.runNight('plus', [{ kind: 'phase', t: 'q2' }]), { dur: 0.6 });
  await waitSfx(s, 'syndromeChord', { timeout: 90, mark: 'chord' });
  await pad(s, 678, 'lights-out');
});
shot('sc_gremlin_lab', { ...S1, save: judge(ALL_DONE) }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#lab', { settle: 0.5 });
  await s.offCamera(async () => { await s.skipDialogue(); });
  await s.click('button:has-text("Run lab night")', { dur: 0.8 }); s.mark('run');
  await pad(s, 900, 'lab');
});
shot('sc_threshold', { ...S1, save: judge(ALL_DONE) }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#lab', { settle: 0.5 });
  await s.offCamera(async () => { await s.skipDialogue(); });
  await s.click('button:has-text("Threshold chart")', { dur: 0.9 }); s.mark('threshold');
  await s.wait(2);
  await s.cursorTo({ x: 1100, y: 600 }, { dur: 1.5 });
  await pad(s, 798, 'chart');
});
shot('sc_codex_tour', { ...S1, save: FULL_BOOK }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#codex', { settle: 0.6 });
  await s.cursorTo({ x: 600, y: 420 }, { dur: 1.0 });
  await s.click('.codex-entry[data-id="flipper"]', { dur: 0.8 });
  await s.wait(1); await s.click('.codex-detail canvas', { dur: 0.5 }); await s.wait(2.5);
  await s.key('Escape', { after: 0.6 });
  await s.click('.codex-entry[data-id="qubble"]', { dur: 1.0 });
  await s.waitFor('.codex-detail .cd-sphere canvas', { timeout: 3, after: 0.5 });
  const b = await s.box('.codex-detail .cd-sphere canvas');
  await s.drag({ x: b.x + b.width * 0.3, y: b.y + b.height * 0.55 }, { x: b.x + b.width * 0.75, y: b.y + b.height * 0.35 }, { dur: 1.2 });
  await s.wait(1.5);
  if (await s.exists('.codex-detail button:has-text("Measure")')) { await s.click('.codex-detail button:has-text("Measure")', { dur: 0.6 }); s.mark('measure'); }
  await pad(s, 1140, 'sphere');
});
shot('sc_card_guide', { ...S1, save: FULL_BOOK }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#codex', { settle: 0.6 });
  await s.click('.codex-tab:has-text("Cards")', { dur: 0.9 }); // the cards row is below the fold in "All"
  await s.wait(0.6);
  await s.click('.codex-entry[data-id="card-IF"]', { dur: 1.0 }); s.mark('card-IF');
  await pad(s, 540, 'anatomy');
});
shot('sc_notebook', { ...S1, save: judge(['2-2'], { settings: { nerd: true } }), localStorage: { 'np.nb.open': '1', 'np.nb.page': 'circuit', 'np.nb.w': '560' } }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await prepLevel(s, '2-3', { progs: 'solution', xray: true });
  await s.tap(RUN, () => window.__np.runNight('plus', [{ kind: 'flip', t: 'q2' }]), { dur: 0.6 });
  await s.wait(5);
  const tabs = await s.eval(() => [...document.querySelectorAll('.nb-tab:not(.sealed)')].map((b) => b.dataset.id));
  for (const t of tabs.slice(0, 6)) { await s.click(`.nb-tab[data-id="${t}"]`, { dur: 0.5 }); s.mark('page-' + t); await s.wait(2.2); }
  await pad(s, 1038, 'notebook');
});
shot('sc_qol_grid', { ...S1, save: judge(['2-2']) }, async (s) => {
  // four QoL beats in one take (the Editor splits them into the 4-panel quick-fire): snippets, help slot, step mode, timeline
  await s.placeCursor({ x: 1300, y: 900 });
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.click('.editor-foot button:has-text("Snippets")', { dur: 0.7 }); s.mark('snippets');
  await s.wait(2.5);
  await s.click('.editor-foot button:has-text("Snippets")', { dur: 0.4 });
  await s.drag('.editor .card.op-HIGHFIVE >> nth=0', '.help-slot', { dur: 1.0, pre: 0.6 }); s.mark('help');
  await s.wait(3);
  await s.key('Escape', { after: 0.4 });
  await s.click('.controls button:has-text("Step mode")', { dur: 0.7 }); s.mark('step-mode');
  await s.tap(null, () => window.__np.runNight('zero', [{ kind: 'flip', t: 'q1' }], true));
  for (let i = 0; i < 5; i++) { await s.click('.controls button:has-text("step ▶")', { dur: i ? 0.25 : 0.6 }); await s.wait(0.5); }
  await s.click('.timeline', { dur: 0.6, ax: 0.7 }); s.mark('timeline');
  await pad(s, 960, 'qol');
});
shot('sc_save_joke', { ...S1, save: judge(['2-2']) }, async (s) => {
  await s.placeCursor({ x: 960, y: 900 });
  await s.goto('#title', { settle: 0.4 });
  await s.click('.title-menu button:has-text("Settings")', { dur: 0.8 });
  await s.waitFor('.save-joke', { timeout: 3 });
  await s.cursorTo('.save-joke', { dur: 0.8 }); s.mark('joke');
  await pad(s, 258, 'joke');
});
shot('sc_curtain_call', { ...S1, save: judge(ALL_DONE), cursor: false }, async (s) => {
  await s.goto('#credits', { settle: 0.2 });
  await s.offCamera(async () => { await s.wait(10); });
  await pad(s, 900, 'credits');
});
