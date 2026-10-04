/**
 * Trailer shots (docs/VIDEO_BIBLE.md REVISED §2 + videos/music/cue_sheet.json). All in the cinema layout
 * (?cinema=1: full-frame room, no chrome), 3840×2160. Takes are generous: every shot carries ≥1 s of handle on both
 * sides of the moment the edit needs, and marks (meta.json "marks", events.json) give the frame of each moment, so the
 * editor can sync the action to the cue's named hits.
 *
 *   tools/video/capture/run.mjs tools/video/capture/shots/trailer.mjs [--only tr-proof]
 */
import { shot } from '../lib.mjs';
import { P, BEAT } from './params.mjs';
import { judge, prepLevel, runNight, waitSfx, waitNightDone, waitDark } from './common.mjs';

const H = P('trailer.handle', 1.5); // seconds of handle around each moment
const C = (camera, extra = {}) => ({ camera, ...extra });

// ── cold_open (434 f = 7.2 s): a blanketed Qubble breathing in moonlight ──
for (const [name, cam] of [['tr-cold-open-close', 'on:q2,2.8,0.5,0.6'], ['tr-cold-open-medium', 'on:q2,1.7,0.5,0.58']]) {
  shot(name, { save: judge(['2-2']), cinema: C(cam), cursor: false }, async (s) => {
    await prepLevel(s, '2-3', { progs: { bedtime: '', morning: '' } });
    await s.offCamera(async () => { await s.np((np) => { np.scene.nightTarget = 1; }); await s.wait(3); }); // lights down in the build phase: nothing runs, everyone sleeps
    // frozen mid-night: the lights stay down, the Qubbles keep breathing and snoring
    await s.hold(P(`${name}.len`, 7.3 + 2 * H), 'moonlit-breathing');
  });
}

// ── peek (288 f): the cursor sweeps the title letters; each collapses on an 8th note (16 frames) ──
shot('tr-peek-title-8ths', { save: judge(), cinema: true }, async (s) => {
  await s.placeCursor({ x: 120, y: 760 });
  await s.goto('#title', { settle: 0.3 });
  const L = await s.eval(() => {
    const W = innerWidth, Hh = innerHeight, text = 'NO PEEKING!', slot = Math.min(W / (text.length + 1), 120), s = slot / 78;
    return [...text].map((ch, i) => ({ ch, x: W / 2 - (slot * text.length) / 2 + slot * (i + 0.5), y: Hh * 0.46 + Math.sin(i * 1.3) * slot * 0.08 - 30 * s, r: slot * 0.5 }));
  });
  const letters = L.filter((l) => l.ch !== ' ');
  await s.wait(H);
  // a horizontal sweep; each letter is entered (hover radius r around its centre) exactly at the end of a 16-frame
  // (8th-note) segment, so the collapses land on consecutive 8ths
  const yl = letters.reduce((a, l) => a + l.y, 0) / letters.length;
  const hit = (l) => ({ x: l.x - Math.sqrt(Math.max(0, l.r * l.r - (l.y - yl) ** 2)) + 2, y: yl });
  await s.cursorTo({ x: hit(letters[0]).x - 140, y: yl + 60 }, { dur: 1.2, ease: 'out' });
  await s.cursorTo({ x: hit(letters[0]).x - 60, y: yl }, { dur: 0.4, ease: 'linear', arc: 0 });
  s.mark('sweep-start');
  const eighth = BEAT / 2;
  for (const l of letters) { await s.cursorTo(hit(l), { dur: eighth, ease: 'linear', arc: 0 }); s.mark('hit-' + l.ch); }
  await s.cursorTo({ x: letters.at(-1).x + 160, y: letters.at(-1).y + 220 }, { dur: 0.8, ease: 'out' });
  await s.hold(P('tr-peek-title-8ths.tail', 2 + H), 'collapsed');
});

// ── peek, in the room: the flashlight PEEK collapses a sleeping Qubble (level 1-1) ──
shot('tr-peek-flashlight', { save: judge(), cinema: C('on:q1,2.2,0.5,0.56'), cursor: false }, async (s) => {
  await prepLevel(s, '1-1', { progs: { morning: 'PEEK q1' } });
  await s.wait(0.5);
  await runNight(s, 'plus', []);
  await waitSfx(s, 'peek_collapse', { timeout: 40, mark: 'collapse' });
  await s.hold(2.5 + H, 'after-collapse');
});

// ── build: in-place day→night relight; gremlins sneaking in (Flipper, Phasey, Wobbles) ──
shot('tr-build-relight', { save: judge(['2-2']), cinema: C('room'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.wait(H);
  await runNight(s, 'zero', [{ kind: 'flip', t: 'q3' }]); // a night with a visitor (with no error the night phase is skipped)
  await waitDark(s, { timeout: 40 });
  await s.hold(2 + H, 'night');
});
for (const [name, id, err, sfx] of [
  ['tr-build-flipper', '2-3', { kind: 'flip', t: 'q3' }, 'gremlin_flip'],
  ['tr-build-phasey', '3-1', { kind: 'phase', t: 'q2' }, 'ghost_phase'],
  ['tr-build-wobbles', '3-3', null, 'wobble'],
]) {
  shot(name, { save: judge(), cinema: C('tight'), cursor: false }, async (s) => {
    await prepLevel(s, id, { progs: 'solution' });
    const e = err ?? (await s.np((np) => { const L = np.LEVELS.find((l) => l.id === '3-3'); const n = L.noise; return { kind: 'wobble', t: 'q2', axis: n.wobbleAxis ?? 'x', angle: (n.wobbleAngles ?? [Math.PI / 2])[0] }; }));
    await s.wait(0.5);
    await runNight(s, 'plus', [e]);
    await waitSfx(s, 'gremlin_sneak', { timeout: 40, mark: 'sneak' }).catch(() => {});
    await waitSfx(s, sfx, { timeout: 40, mark: 'strike' });
    await s.hold(2 + H, 'after-strike');
  });
}
shot('tr-build-dark-wide', { save: judge(['2-2']), cinema: C('wide'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: { bedtime: '', morning: '' } });
  await s.offCamera(async () => { await s.np((np) => { np.scene.nightTarget = 1; }); await s.wait(3); }); // lights down in the build phase: nothing runs, everyone sleeps
  await s.hold(P('tr-build-dark-wide.len', 5 + 2 * H), 'dark-room');
});

// ── silence → drop: a single bot BEEP, antenna full frame ──
shot('tr-drop-bot-beep', { save: judge(['2-2']), cinema: C('on:a,3.2,0.5,0.6'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await runNight(s, 'zero', [{ kind: 'flip', t: 'q1' }]); // bot a (q1·q2) beeps, bot b stays quiet
  await s.offCamera(async () => { await waitSfx(s, 'gremlin_flip', { timeout: 40 }); await s.wait(4); });
  await waitSfx(s, 'botNote', { timeout: 30, mark: 'beep' });
  await s.hold(2 + H, 'after-beep');
});

// ── proof (6 bars, 1/2/1/2): gremlin flips q2 → bots BEEP/quiet → caretaker BOOPs q2 → X-ray dissolve, dream intact ──
// One room, one continuous night; three framings of the SAME deterministic night so the editor can cut between them.
for (const [name, cam] of [['tr-proof-room', 'room'], ['tr-proof-q2', 'on:q2,1.9,0.5,0.58'], ['tr-proof-bots', 'on:b,1.8,0.45,0.55']]) {
  shot(name, { save: judge(['2-2']), cinema: C(cam), cursor: false }, async (s) => {
    await prepLevel(s, '2-3', { progs: 'solution' });
    await s.wait(H);
    await runNight(s, 'plus', [{ kind: 'flip', t: 'q2' }]); // q2 flipped → both bots BEEP (q1≠q2, q2≠q3)
    await waitSfx(s, 'gremlin_flip', { timeout: 40, mark: 'flip' });
    await waitSfx(s, 'botNote', { timeout: 40, mark: 'beep-a' });
    await waitSfx(s, 'botNote', { timeout: 40, mark: 'beep-b' });
    await waitSfx(s, 'boop', { timeout: 40, mark: 'boop' });
    await s.wait(1.2);
    await s.np((np) => np.setXray(true)); // in-engine X-ray dissolve: blankets go translucent, the shared dream is intact
    s.mark('xray');
    await s.hold(4 + H, 'xray-intact');
  });
}

// ── montage (12 cuts: 96·96·96·64·64·64·32×6 frames) ──
shot('tr-m-checklist', { save: judge(['2-2']), cinema: C('tight'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution', xray: true });
  await s.wait(H);
  await runNight(s, 'zero', []); // bedtime = Schrödi's checklist: HIGHFIVEs share the dream (silk threads in X-ray)
  await waitSfx(s, 'highfive', { timeout: 30, mark: 'highfive-1' });
  await waitSfx(s, 'highfive', { timeout: 30, mark: 'highfive-2' });
  await s.hold(1.5 + H, 'encoded');
});
shot('tr-m-highfive', { save: judge(['2-2']), cinema: C('on:a,2.4,0.5,0.6'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await runNight(s, 'zero', [{ kind: 'flip', t: 'q1' }]);
  await s.offCamera(async () => { await waitSfx(s, 'gremlin_flip', { timeout: 40 }); await s.wait(0.6); });
  await s.wait(H);
  await waitSfx(s, 'highfive', { timeout: 30, mark: 'highfive' });
  await s.hold(1.2 + H, 'sparks');
});
shot('tr-m-listen', { save: judge(['2-2']), cinema: C('on:b,2.4,0.5,0.6'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await runNight(s, 'zero', [{ kind: 'flip', t: 'q3' }]); // bot b beeps
  await s.offCamera(async () => { await waitSfx(s, 'botNote', { timeout: 60 }); });
  await s.wait(H);
  await waitSfx(s, 'botNote', { timeout: 30, mark: 'listen-beep' });
  await s.hold(1.5 + H, 'after');
});
shot('tr-m-teststrip', { save: judge(['2-2']), cinema: C('wide', { hud: 1 }), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.wait(H);
  await s.np((np) => np.testAll()); s.mark('test-all');
  await waitSfx(s, 'level_win', { timeout: 120, mark: 'win' });
  await s.hold(1 + H, 'strip-full');
});
shot('tr-m-phasey-spin', { save: judge(), cinema: C('room'), cursor: false }, async (s) => {
  await prepLevel(s, '3-1', { progs: 'solution' });
  await s.wait(H);
  await runNight(s, 'plus', [{ kind: 'phase', t: 'q1' }]);
  await waitSfx(s, 'spin', { timeout: 40, mark: 'spin' });
  await waitSfx(s, 'ghost_phase', { timeout: 40, mark: 'phase' });
  await s.hold(2 + H, 'after');
});
shot('tr-m-clone-glitch', { save: judge(['1-2']), cinema: C('room', { toasts: 1 }), cursor: false }, async (s) => {
  // 1-3 "The Photocopier": the naive copy fails its test → the clone glitch tears the screen (first time only)
  await prepLevel(s, '1-3', { progs: null });
  await s.wait(H);
  await s.np((np) => np.testAll()); s.mark('test-all');
  await waitSfx(s, /glitch|test_fail/, { timeout: 60, mark: 'glitch' });
  await s.hold(3 + H, 'glitch');
});
shot('tr-m-map-flip', { save: judge(['0-1', '0-2', '1-1', '1-2', '1-3', '1-4'], { unlockAll: false }), cinema: true, cursor: false }, async (s) => {
  await s.goto('#map', { settle: 0.3 });
  await s.hold(P('tr-m-map-flip.len', 6 + 2 * H), 'map-flip'); // Flipper hits the map once after chapter 1 (banner + flipped tile + blinking map bots)
});
shot('tr-m-shor9', { save: judge(), cinema: C('wide'), cursor: false }, async (s) => {
  await prepLevel(s, '4-1', { progs: 'solution' });
  await s.wait(H);
  await runNight(s, 'zero', [{ kind: 'both', t: 'q5' }]);
  await s.offCamera(async () => { await waitSfx(s, 'gremlin_sneak', { timeout: 60 }); });
  await waitSfx(s, /gremlin_flip|ghost_phase/, { timeout: 60, mark: 'strike' });
  await s.hold(3 + H, 'after');
});
shot('tr-m-inspector', { save: judge(['2-2']), cinema: C('room'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution', xray: true });
  await runNight(s, 'plus', []);
  await s.offCamera(async () => { await waitSfx(s, 'highfive', { timeout: 30 }); await waitSfx(s, 'highfive', { timeout: 30, after: 1 }); });
  await s.np((np) => np.openInspector('q2')); s.mark('inspector');
  await s.hold(P('tr-m-inspector.len', 4 + 2 * H), 'bloch-3d');
});
shot('tr-lights-out', { save: judge(), cinema: C('wide'), cursor: false }, async (s) => {
  // 4-2 Lights Out: black screen, only the bots' syndrome chord (2 bars = 3.2 s; hear it twice)
  await prepLevel(s, '4-2', { progs: 'solution' });
  await s.wait(H);
  await runNight(s, 'plus', [{ kind: 'phase', t: 'q2' }]);
  await waitSfx(s, 'syndromeChord', { timeout: 90, mark: 'chord-1' });
  await waitSfx(s, 'syndromeChord', { timeout: 60, mark: 'chord-2' }).catch(() => {});
  await s.hold(1.5 + H, 'after');
});
// Codex hero inserts: one entry's live animation full-frame, no chrome; acted on with (hidden) clicks
for (const id of ['flipper', 'phasey', 'wobbles', 'box', 'silk', 'swirl', 'flashlight', 'bot']) {
  shot(`tr-m-codex-${id}`, { save: judge(), cinema: { insert: id }, cursor: false }, async (s) => {
    await s.placeCursor({ x: 960, y: 540 });
    await s.goto('#codex', { settle: 0.5 });
    await s.wait(H);
    for (let i = 0; i < 2; i++) { await s.click({ x: 960, y: 540 }, { dur: 0.05 }); s.mark('act'); await s.wait(1.6); }
    await s.hold(H, 'tail');
  });
}
shot('tr-m-codex-sphere', { save: judge(), cinema: { insert: 'qubble', part: 'sphere' }, cursor: false }, async (s) => {
  await s.placeCursor({ x: 700, y: 600 });
  await s.goto('#codex', { settle: 0.5 });
  await s.wait(H);
  await s.drag({ x: 700, y: 600 }, { x: 1220, y: 470 }, { dur: 1.6, pre: 0.1 });
  await s.hold(3 + H, 'spin');
});

// ── payoff: "Morning check: perfect!" stars; then the curtain call ──
shot('tr-payoff-win', { save: judge(['2-2']), cinema: C('wide', { hud: 1 }), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.np((np) => np.testAll());
  await s.offCamera(async () => { await s.waitFor(() => (window.__np?.pb?.()?.progress?.() ?? 0) > 0.5, { timeout: 120 }).catch(() => {}); });
  await waitSfx(s, 'level_win', { timeout: 120, mark: 'win' });
  await s.offCamera(async () => { await s.skipDialogue(); });
  await s.waitFor('.win-card', { timeout: 10 }); s.mark('win-card');
  await s.hold(4 + H, 'stars');
});
shot('tr-credits-curtain', { save: judge(), cinema: true, cursor: false }, async (s) => {
  await s.goto('#credits', { settle: 0.2 });
  await s.hold(P('tr-credits-curtain.len', 58), 'curtain-call'); // the whole stage show; the editor picks the bow
});

// ── closing: a still, cosy morning; then the circuit reveal (Lab Notebook, full width) ──
shot('tr-closing-morning', { save: judge(['2-2']), cinema: C('room'), cursor: false }, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.hold(P('tr-closing-morning.len', 4.8 + 2 * H + 3), 'cosy');
});
shot('tr-circuit-reveal', {
  save: judge(['2-2'], { settings: { nerd: true }, programs: {} }), cinema: C('wide', { nb: 1 }), cursor: false,
  localStorage: { 'np.nb.open': '1', 'np.nb.page': 'circuit', 'np.nb.w': '1920' },
}, async (s) => {
  await prepLevel(s, '2-3', { progs: 'solution' });
  await s.offCamera(async () => { await runNight(s, 'plus', [{ kind: 'flip', t: 'q2' }]); await waitNightDone(s, { timeout: 90 }); });
  // re-open the circuit page fresh so the cards → gates morph plays on camera
  await s.eval(() => localStorage.removeItem('np.nb.morphed'));
  await s.np((np) => np.replay?.());
  await s.wait(H);
  s.mark('morph');
  await s.hold(P('tr-circuit-reveal.len', 4.8 + 2 * H + 2), 'circuit');
});
