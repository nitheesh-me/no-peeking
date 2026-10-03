/** Level screen: isometric scene + playback controls + Bot Code editor + tests + win card. */
import type { LevelDef, NightResult, TestReport, QubitId, Phase, Snapshot, InputState, ErrorEvent } from '../../core/contracts';
import { quantum, audio, art, getLevel, LEVELS } from '../../engine/deps';
import { enumerateErrors, randomErrors, makeRng } from '../../quantum/index';
import { Scene } from '../../engine/scene';
import { Playback } from '../../engine/playback';
import { onFrame } from '../../engine/loop';
import { save, persist, setProgress } from '../../engine/store';
import { h, modal, toast, inputLabel, gremlinIcon } from '../../engine/util';
import { Editor, type Progs } from '../editor/editor';
import { Dialogue } from '../dialogue';
import { cloneGlitch, floodColor } from '../meta';
import { openNightLab } from '../nightLab';
import type { Nav } from '../app';

export interface LevelArg {
  def: LevelDef;
  kind: 'story' | 'endless' | 'lab';
  /** extra controls shown in the topbar (endless/lab) */
  extra?: (api: LevelApi) => HTMLElement;
  onReport?: (r: TestReport) => void;
  /** save programs under this key (story levels use their id) */
  progKey?: string;
}
export interface LevelApi { setLevel(def: LevelDef): void; runNight(input?: InputState, errors?: ErrorEvent[]): void; testAll(): void; root: HTMLElement }

type NightX = NightResult;

export function levelScreen(root: HTMLElement, nav: Nav, arg: unknown): () => void {
  const la: LevelArg = typeof arg === 'string' ? { def: getLevel(arg) ?? LEVELS[0], kind: 'story' } : (arg as LevelArg);
  let level = la.def;
  const story = la.kind === 'story';
  const lab = la.kind === 'lab';
  const progKey = la.progKey ?? (story ? level.id : null);
  const cleanups: (() => void)[] = [];

  // ───────── DOM ─────────
  const canvas = h('canvas', { 'aria-label': 'The daycare' });
  const wrap = h('div', { class: 'stage-canvas-wrap' }, canvas);
  const phasePill = h('div', { class: 'phase-pill' }, 'Build');
  const xrayPill = h('div', { class: 'phase-pill xray-pill hidden' }, 'X-RAY');
  const fidFill = h('i', { style: 'width:100%' });
  const fidText = h('span', null, '100%');
  const fidMeter = h('div', { class: 'fid-meter hidden', title: 'How close the dream is to what it should be (logical fidelity)' }, 'dream', h('div', { class: 'bar' }, fidFill), fidText);
  const stripHost = h('div', { style: 'flex:1;display:flex;justify-content:flex-end;min-width:0' });
  const hud = h('div', { class: 'stage-hud' }, phasePill, xrayPill, fidMeter, stripHost);
  const nerdPanel = h('div', { class: 'nerd-panel panel hidden' });
  const stage = h('div', { class: 'stage' });

  const btn = (label: string, title: string, on: () => void, cls = 'icon') => h('button', { class: `btn ${cls}`, title, 'aria-label': title, onclick: on }, label);
  const bRewind = btn('⏮', 'Rewind (hold ←). Gates rewind. Measurements do not.', () => {});
  const bBack = btn('◀', 'Step back (←)', () => pb?.back());
  const bPlay = btn('▶', 'Play / pause (Space)', () => togglePlay(), 'icon go');
  const bStep = btn('▸|', 'Step (→)', () => { if (!pb) startRun(); else pb.step(); });
  const bFast = btn('⏩', 'Fast ×4', () => { fast = !fast; pb?.setFast(fast); syncControls(); });
  const timeline = h('div', { class: 'timeline', title: 'Night timeline' }, h('div', { class: 'fill' }));
  const bXray = h('button', { class: 'btn small', title: 'X-ray: see the true dreams (X)', onclick: () => setXray(!xray) }, 'X-ray');
  const bNerd = h('button', { class: 'btn small', title: 'Nerd mode: amplitudes and numbers', onclick: () => { save.settings.nerd = !save.settings.nerd; persist(); syncNerd(); } }, 'Nerd');
  const bRun = h('button', { class: 'btn primary', onclick: () => startRun() }, 'Run night');
  const bTest = h('button', { class: 'btn go', onclick: () => testAll() }, 'Test all');
  const controls = h('div', { class: 'controls' }, bRewind, bBack, bPlay, bStep, bFast, timeline, h('div', { class: 'sep' }), bXray, bNerd, h('div', { class: 'sep' }), bRun, bTest);
  const sceneArea = h('div', { style: 'position:relative;flex:1;min-height:0;display:flex' }, wrap, hud, nerdPanel);
  stage.append(sceneArea, controls);

  const hintBtn = h('button', { class: 'btn small', onclick: () => hint() }, 'Hint');
  const topbar = h('div', { class: 'topbar' },
    h('button', { class: 'btn small', onclick: () => nav.go(lab || la.kind === 'endless' ? 'title' : 'map') }, '◂ ' + (story ? 'Map' : 'Back')),
    h('span', { class: 'lvl-badge' }, story ? level.id : la.kind === 'lab' ? 'LAB' : 'SHIFT'),
    h('div', { style: 'min-width:0' }, h('div', { class: 'title' }, level.title), h('div', { class: 'sub' }, level.subtitle ?? '')),
    h('div', { class: 'spacer' }),
    la.extra ? la.extra({ setLevel, runNight: (i, e) => startRun(i, e), testAll, root }) : null,
    story ? hintBtn : null,
    h('button', { class: 'btn icon small', title: 'Settings', onclick: () => nav.settings() }, '⚙'),
  );

  // ───────── scene / editor ─────────
  const scene = new Scene(canvas, level);
  const dialogue = new Dialogue(sceneArea);
  dialogue.onMood = (m) => { scene.schrodiMood = m; };
  let editor: Editor;
  let pb: Playback | null = null;
  let report: (TestReport & { nights: NightX[] }) | null = null;
  let xray = lab || save.settings.xrayDefault;
  let fast = false;
  let fails = save.progress[level.id]?.fails ?? 0;
  let hintIdx = 0;
  let runToken = 0;
  let pickState: { allowed: Set<QubitId>; cb: (id: QubitId) => void } | null = null;
  let won = false;

  function progs(): Progs { return editor.exportProgs(); }

  function makeEditor() {
    editor?.el.remove(); editor?.destroy();
    const hazard = !!save.progress['1-1']?.done && level.id !== '1-1';
    editor = new Editor(level, progKey ? save.programs[progKey] ?? {} : {}, {
      hazardPeek: hazard,
      onChange: (p) => {
        if (progKey) { save.programs[progKey] = p; persist(); }
        stopRun();
      },
      beginPick: (allowed, cb) => {
        pickState = { allowed: new Set(allowed), cb };
        scene.highlight = new Set(allowed);
        stage.classList.add('pick-mode');
        return () => { pickState = null; scene.highlight = new Set(); stage.classList.remove('pick-mode'); };
      },
    });
    main.appendChild(editor.el);
  }

  const main = h('div', { class: 'level-main' }, stage);
  root.append(topbar, main);
  makeEditor();

  function initialSnap(): Snapshot | null {
    try { return quantum.runNight(level, {}, level.inputs[0] ?? 'zero', [], 1).steps[0]?.snap ?? null; } catch { return null; }
  }
  scene.base = initialSnap();

  // ───────── x-ray / nerd ─────────
  function setXray(on: boolean) {
    xray = on; scene.xrayTarget = on ? 1 : 0;
    bXray.classList.toggle('on', on);
    xrayPill.classList.toggle('hidden', !on);
    fidMeter.classList.toggle('hidden', !on);
    audio.sfx('ui_click', { pitch: on ? 1.3 : 0.9 });
    syncNerd();
  }
  function syncNerd() {
    const on = save.settings.nerd;
    scene.nerd = on;
    bNerd.classList.toggle('on', on);
    nerdPanel.classList.toggle('hidden', !(on && xray));
  }
  setXray(xray); scene.xray = scene.xrayTarget;

  function currentSnap(): Snapshot | null {
    const a = scene.anim; return a ? (a.p >= 0.5 ? a.to : a.from) : scene.base;
  }
  let lastNerd = '';
  function updateHud() {
    const s = currentSnap();
    const f = s?.logicalFidelity;
    if (f != null) { fidFill.style.width = `${Math.round(f * 100)}%`; fidText.textContent = `${Math.round(f * 100)}%`; fidFill.style.background = f > 0.98 ? 'var(--mint)' : f > 0.6 ? 'var(--sunny)' : 'var(--red)'; }
    if (scene.nerd && xray && s) {
      const key = JSON.stringify(s.amps);
      if (key !== lastNerd) {
        lastNerd = key;
        const ids = [...level.qubbles.map((q) => q.id), ...level.bots.map((b) => b.id)];
        nerdPanel.innerHTML = '';
        nerdPanel.append(h('h4', null, 'Amplitudes'), h('div', { class: 'muted', style: 'font-size:10px;margin-bottom:4px' }, `|${ids.join(' ')}⟩`));
        for (const a of s.amps.slice(0, 12)) {
          const ph = Math.atan2(a.im, a.re);
          const hue = ((ph / (2 * Math.PI)) * 360 + 360) % 360;
          nerdPanel.appendChild(h('div', { class: 'amp-row', title: `${a.re.toFixed(3)} ${a.im >= 0 ? '+' : '−'} ${Math.abs(a.im).toFixed(3)}i` },
            h('span', { class: 'k' }, `|${a.ket}⟩ ${a.p.toFixed(2)}`),
            h('span', { class: 'b' }, h('i', { style: `width:${Math.round(a.p * 100)}%;background:hsl(${hue},80%,60%)` }))));
        }
        if (f != null) nerdPanel.appendChild(h('div', { style: 'margin-top:6px' }, `F = ${f.toFixed(4)}`));
      }
    }
  }

  // ───────── playback ─────────
  let curPhase: Phase | 'build' = 'build';
  function syncControls() {
    const has = !!pb;
    bPlay.textContent = pb?.playing ? '❚❚' : '▶';
    bFast.classList.toggle('on', fast);
    bBack.disabled = !has; bRewind.disabled = !has;
    let ph: Phase | 'build' = 'build';
    if (pb) { for (let k = Math.min(pb.i, pb.length) - 1; k >= 0; k--) { const e = pb.night.steps[k].ev; if (e.k === 'phase') { ph = e.phase; break; } } if (pb.done) ph = 'morning'; }
    if (ph !== curPhase) {
      curPhase = ph;
      phasePill.textContent = ph === 'build' ? 'Build' : ph === 'bedtime' ? 'Bedtime' : ph === 'night' ? 'Night' : pb?.done ? 'Morning check' : 'Morning';
      phasePill.classList.toggle('night', ph === 'night');
    }
  }
  function drawTicks(night: NightResult) {
    timeline.querySelectorAll('.tick').forEach((n) => n.remove());
    const N = night.steps.length;
    night.steps.forEach((st, k) => {
      const ev = st.ev;
      if (ev.k === 'measure' || ev.k === 'noise' || ev.k === 'phase') {
        if (ev.k === 'noise' && !xray) return; // gremlin moves are hidden unless x-ray
        timeline.appendChild(h('div', { class: `tick ${ev.k}`, style: `left:${(k / N) * 100}%`, title: ev.k === 'measure' ? 'measurement: one-way door' : ev.k }));
      }
    });
  }

  function stopRun() {
    runToken++;
    pb = null; scene.anim = null; scene.peeked.clear(); scene.woke.clear(); scene.mood = null; scene.caretakerMood = null;
    scene.base = initialSnap(); scene.nightTarget = 0; scene.dimTarget = 0;
    editor.setCurrent(null);
    if (!lab && xray !== save.settings.xrayDefault) setXray(save.settings.xrayDefault);
    audio.setTension(0); audio.setScene(lab ? 'lab' : 'build');
    syncControls();
  }

  function playNight(night: NightX, opts: { xray?: boolean; onEnd?: (n: NightX) => void } = {}) {
    const token = ++runToken;
    scene.caretakerMood = null;
    if (opts.xray != null) setXray(opts.xray);
    audio.setScene(level.lightsOut ? 'lightsout' : 'run');
    pb = new Playback(scene, level, night, progs(), {
      onLine: (ref) => editor.setCurrent(ref),
      onChange: syncControls,
      onBlocked: () => toast('Snap! Measurements are a one-way door. You can\'t un-look.', 'bad'),
      onEnd: (n) => { if (token === runToken) opts.onEnd?.(n as NightX); },
    });
    pb.setFast(fast);
    drawTicks(night);
    pb.play();
    syncControls();
  }

  function pickNight(): { input: InputState; errors: ErrorEvent[] } {
    const rng = makeRng((Math.random() * 2 ** 31) | 0);
    const input = level.inputs[Math.floor(rng() * level.inputs.length)] ?? 'zero';
    let errors: ErrorEvent[] = [];
    if (level.noise.mode === 'random') errors = randomErrors(level, rng);
    else { const all = enumerateErrors(level); errors = all[Math.floor(rng() * all.length)] ?? []; }
    return { input, errors };
  }

  function startRun(input?: InputState, errors?: ErrorEvent[]) {
    dialogue.close(false);
    const pick = input ? { input, errors: errors ?? [] } : pickNight();
    let night: NightX;
    try { night = quantum.runNight(level, progs(), pick.input, pick.errors, (Math.random() * 2 ** 31) | 0); }
    catch (e) { toast(String((e as Error).message ?? e), 'bad'); return; }
    playNight(night, { xray: lab ? true : undefined, onEnd: (n) => afterRun(n) });
  }

  function afterRun(n: NightX) {
    if (lab) return;
    if (!n.pass) {
      onFail(n);
      return;
    }
    audio.sfx('test_pass');
    toast('Night survived! Now the full test…', 'good', 1600);
    setTimeout(() => { if (pb?.night === n) testAll(); }, 900);
  }

  function failText(n: NightResult): string {
    const total = report ? `${report.nights.filter((x) => !x.pass).length} of ${report.nights.length} nights went wrong.` : '';
    if (level.goal.kind === 'rate' && report) {
      return `Only ${Math.round(report.passRate * 100)}% of nights survived. You need ${Math.round(level.goal.minRate * 100)}%. A lone, unprotected Qubble would manage about that.`;
    }
    switch (n.failReason) {
      case 'woke': return `You woke ${n.woke.join(', ')}. Its double-dream popped into one boring dream. The other half is gone forever.`;
      case 'wrong-report': return `The dream is fine, but the bot reported the wrong answer. ${total}`;
      case 'maxSteps': return 'Your bots got stuck in a loop and ran out of night.';
      case 'error': return 'Your bots got confused. Check your IF and JUMP spots.';
      default: return `Morning check: the dream doesn't match. ${total}`;
    }
  }

  function onFail(n: NightX) {
    fails++; if (story) setProgress(level.id, { fails });
    scene.caretakerMood = 'facepalm';
    audio.sfx('test_fail');
    if (level.meta?.includes('clone-glitch') && !save.flags['clone-glitch-' + level.id]) {
      save.flags['clone-glitch-' + level.id] = true; persist();
      cloneGlitch(canvas);
    }
    if (level.signs?.some((s) => /COP/.test(s.text))) for (const s of level.signs) if (/COP/.test(s.text)) scene.signShake.set(s.text, 1.2);
    dialogue.play([{ who: 'schrodi', text: failText(n), mood: n.failReason === 'woke' ? 'shock' : 'deadpan' }]);
    showXrayOffer(n);
  }

  function showXrayOffer(n: NightX) {
    stripHost.querySelector('.xray-offer')?.remove();
    const b = h('button', { class: 'btn small xray-offer', style: 'background:var(--moony);color:#fff', onclick: () => { b.remove(); replay(n); } }, 'X-ray replay');
    stripHost.prepend(b);
  }

  function replay(n: NightX) {
    let night: NightX = n;
    if (!n.steps.length || n.steps.some((s) => !s.snap.bloch || !Object.keys(s.snap.bloch).length)) {
      night = quantum.runNight(level, progs(), n.input, n.errors, n.seed ?? 1);
    }
    playNight(night, { xray: true });
  }

  // ───────── testing ─────────
  function testAll() {
    dialogue.close(false);
    let r: TestReport & { nights: NightX[] };
    try { r = quantum.testLevel(level, progs(), (Math.random() * 1e9) | 0) as TestReport & { nights: NightX[] }; }
    catch (e) { toast(String((e as Error).message ?? e), 'bad'); return; }
    report = r;
    la.onReport?.(r);
    renderStrip(r);
    if (lab) return;
    if (r.passed) { audio.sfx('test_pass'); win(r); }
    else {
      const bad = r.nights.find((x) => !x.pass)!;
      onFail(bad);
    }
  }

  function renderStrip(r: TestReport & { nights: NightX[] }) {
    stripHost.innerHTML = '';
    const pass = r.nights.filter((n) => n.pass).length;
    const strip = h('div', { class: 'test-strip' });
    const rate = level.goal.kind === 'rate' ? ` · need ${Math.round(level.goal.minRate * 100)}%` : '';
    strip.appendChild(h('span', { class: 'summary' }, `${pass}/${r.nights.length}${rate}`));
    let shown = 0;
    const MAX = 12;
    const order = [...r.nights.keys()].sort((a, b) => Number(r.nights[a].pass) - Number(r.nights[b].pass));
    const ordered = r.nights.length > MAX ? order : [...r.nights.keys()];
    for (const k of ordered) {
      if (shown++ >= MAX) break;
      const n = r.nights[k];
      const g = n.errors.map((e) => gremlinIcon(e.kind)).join('') || '—';
      const card = h('div', { class: `night-card ${n.pass ? 'pass' : 'fail'}`, title: `${n.pass ? 'passed' : 'failed'}: input ${inputLabel(n.input)}, gremlins: ${n.errors.map((e) => `${e.kind} ${e.t}`).join(', ') || 'none'} — click to X-ray` },
        h('span', { class: 'res' }, n.pass ? '✓' : '✗'), h('span', null, inputLabel(n.input)), h('span', { class: 'gi' }, g));
      card.addEventListener('click', () => { strip.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); card.classList.add('sel'); replay(n); });
      strip.appendChild(card);
    }
    if (r.nights.length > MAX) strip.appendChild(h('span', { class: 'more' }, `+${r.nights.length - MAX} more`));
    stripHost.appendChild(strip);
  }

  // ───────── win ─────────
  function win(r: TestReport) {
    won = true;
    const ch = level.challenges ?? {};
    const stars: [boolean, boolean, boolean] = [true, ch.lines == null || r.lines <= ch.lines, ch.steps == null || r.avgSteps <= ch.steps];
    if (story) setProgress(level.id, { done: true, stars, bestLines: Math.min(r.lines, save.progress[level.id]?.bestLines ?? 1e9), bestSteps: Math.min(r.avgSteps, save.progress[level.id]?.bestSteps ?? 1e9) });
    stopRun();
    scene.mood = 'happy'; scene.caretakerMood = 'cheer';
    audio.sfx('level_win'); audio.setScene('win'); audio.setHarmony(1);
    const c = scene.posOf(level.qubbles[0].id); if (c && art.burst) art.burst('win', c.x, c.y - 30);
    if (scene.lightsOut) { floodColor(); scene.revealColor = 1; }
    const show = () => showWinCard(r, stars);
    if (story && level.winLine.length) dialogue.play(level.winLine, show); else show();
  }

  function showWinCard(r: TestReport, stars: [boolean, boolean, boolean]) {
    const idx = LEVELS.findIndex((l) => l.id === level.id);
    const next = story ? LEVELS[idx + 1] : undefined;
    const ch = level.challenges ?? {};
    const sb = (got: boolean, label: string, sub: string, i: number) => h('div', { class: `sbig ${got ? 'got' : ''}`, style: `animation-delay:${0.15 + i * 0.2}s` }, h('div', { class: 's' }, got ? '★' : '☆'), h('div', null, label), h('div', { class: 'muted' }, sub));
    let close = () => {};
    const body = h('div', { class: 'win-card' },
      h('h2', null, level.goal.kind === 'rate' ? 'Shift survived!' : 'Morning check: perfect!'),
      h('div', { class: 'muted' }, `${r.nights.length} nights tested · ${Math.round(r.passRate * 100)}% survived`),
      h('div', { class: 'stars-big' },
        sb(stars[0], 'Solved', '', 0),
        sb(stars[1], 'Short', `${r.lines} lines${ch.lines != null ? ` (par ${ch.lines})` : ''}`, 1),
        sb(stars[2], 'Speedy', `${r.avgSteps.toFixed(1)} steps${ch.steps != null ? ` (par ${ch.steps})` : ''}`, 2)),
      h('div', { class: 'reveal-line' }, level.reveal),
      level.proTerm ? h('div', { class: 'pro-term' }, level.proTerm) : null,
      h('div', { class: 'row', style: 'justify-content:center;margin-top:18px' },
        h('button', { class: 'btn small', onclick: () => { close(); const n = report?.nights.find((x) => x.errors.length) ?? report?.nights[0]; if (n) replay(n); } }, 'X-ray replay'),
        story ? h('button', { class: 'btn small', onclick: () => { close(); nav.go('map'); } }, 'Map') : null,
        next ? h('button', { class: 'btn primary', onclick: () => { close(); nav.go('level', next.id); } }, 'Next ▸')
          : story ? h('button', { class: 'btn primary', onclick: () => { close(); nav.go('credits'); } }, 'Finale ▸') : null),
      level.meta?.includes('night-lab-unlock') ? h('div', { class: 'row', style: 'justify-content:center' },
        h('button', { class: 'btn sun', onclick: () => openNightLab() }, 'Night Shift Lab unlocked! Open it')) : null,
    );
    if (level.meta?.includes('night-lab-unlock') && !save.flags.nightLab) { save.flags.nightLab = true; persist(); }
    close = modal(body, { backdrop: false, onClose: () => { scene.revealColor = scene.lightsOut ? 1 : 0; } });
  }

  // ───────── hints ─────────
  function hint() {
    const hs = level.hints;
    if (hintIdx < hs.length) { dialogue.play([{ who: 'schrodi', text: hs[hintIdx++], mood: 'smug' }]); return; }
    if (fails >= 3 || hintIdx >= hs.length) {
      let close = () => {};
      close = modal(h('div', null, h('h2', null, 'Out of hints'), h('p', null, 'Schrodi can show you a working program. No judgement. (Some judgement.)'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { editor.setProgs(level.solution); close(); toast('Solution loaded. Press Run!'); } }, 'Show solution'),
          h('button', { class: 'btn small', onclick: () => { hintIdx = 0; close(); } }, 'Hints again'))));
    }
  }

  // ───────── input: canvas picking & keys ─────────
  const pos = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e); const id = scene.hitTest(p.x, p.y);
    scene.hoverPick = pickState && id && pickState.allowed.has(id) ? id : null;
  });
  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e); const id = scene.hitTest(p.x, p.y);
    if (pickState && id && pickState.allowed.has(id)) { const cb = pickState.cb; cb(id); audio.sfx('ui_click'); return; }
    if (dialogue.active) dialogue.advance();
    else if (id) audio.sfx(id.startsWith('q') ? 'qubble_snore' : 'ui_hover', { volume: 0.5 });
  });

  let holdTimer = 0;
  bRewind.addEventListener('pointerdown', () => { pb?.back(true); });
  const endHold = () => { clearTimeout(holdTimer); if (pb?.rewinding) pb.pause(); };
  bRewind.addEventListener('pointerup', endHold); bRewind.addEventListener('pointerleave', endHold);

  function togglePlay() {
    if (!pb) { startRun(); return; }
    if (pb.done && !pb.playing) { replay(pb.night as NightX); return; }
    pb.toggle();
  }

  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.modal-back')) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); editor.redo(); return; }
    if (e.key === ' ') { e.preventDefault(); if (dialogue.active) dialogue.advance(); else togglePlay(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (!pb) startRun(); else pb.step(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); pb?.back(e.repeat); }
    else if (e.key.toLowerCase() === 'x') setXray(!xray);
    else if (e.key === 'Enter' && dialogue.active) dialogue.advance();
  };
  const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft' && pb?.rewinding) pb.pause(); };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  // ───────── frame ─────────
  const fill = timeline.querySelector('.fill') as HTMLElement;
  cleanups.push(onFrame((t, dt) => {
    pb?.update(dt);
    scene.draw(t);
    fill.style.width = `${(pb?.progress() ?? 0) * 100}%`;
    updateHud();
  }));

  function setLevel(def: LevelDef) {
    level = def; scene.setLevel(def); report = null; stripHost.innerHTML = ''; won = false;
    (topbar.querySelector('.title') as HTMLElement).textContent = def.title;
    (topbar.querySelector('.sub') as HTMLElement).textContent = def.subtitle ?? '';
    makeEditor(); stopRun();
  }

  syncNerd(); syncControls();
  audio.setScene(lab ? 'lab' : level.lightsOut ? 'lightsout' : 'build');
  if (story && level.intro.length) setTimeout(() => dialogue.play(level.intro), 350);
  void won;

  return () => {
    for (const c of cleanups) c();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    dialogue.close(false); editor.destroy(); scene.destroy();
    runToken++;
  };
}
