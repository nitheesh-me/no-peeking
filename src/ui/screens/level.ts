/** Level screen: isometric scene + playback controls + Bot Code editor + tests + win card. */
import type { LevelDef, NightResult, TestReport, QubitId, Phase, Snapshot, InputState, ErrorEvent } from '../../core/contracts';
import { quantum, audio, art, getLevel, LEVELS } from '../../engine/deps';
import { enumerateErrors, randomErrors, makeRng } from '../../quantum/index';
import { Scene } from '../../engine/scene';
import { Playback } from '../../engine/playback';
import { onFrame } from '../../engine/loop';
import { save, persist, setProgress } from '../../engine/store';
import { h, modal, toast, inputLabel, gremlinIcon, portraitSrc } from '../../engine/util';
import type { OpName, TraceEvent } from '../../core/contracts';
import { isBot } from '../../core/contracts';
import { Editor, type Progs } from '../editor/editor';
import { Dialogue } from '../dialogue';
import { cloneGlitch, floodColor } from '../meta';
import { openNightLab } from '../nightLab';
import type { Nav } from '../app';
import { fullscreenButton } from '../fullscreen';
import { linkify } from '../learnLinks';

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
  const hintsPanel = h('div', { class: 'hints-panel panel hidden', role: 'complementary', 'aria-label': 'Hints' });
  const sceneTip = h('div', { class: 'scene-tip hidden' });
  const stage = h('div', { class: 'stage' });

  const btn = (label: string, title: string, on: () => void, cls = 'icon') => h('button', { class: `btn ${cls}`, title, 'aria-label': title, onclick: on }, label);
  const bRewind = btn('⏮', 'Rewind (hold ←). Gates rewind. Measurements do not.', () => {});
  const bBack = btn('◀ step', 'Step back one event (←). You can\'t step back across a measurement.', () => pb?.back(), 'small step-btn');
  const bPlay = btn('▶', 'Play / pause (Space)', () => togglePlay(), 'icon go');
  const bStep = btn('step ▶', 'Step forward one event (→)', () => stepFwd(), 'small step-btn go');
  const bFast = btn('⏩', 'Fast ×4', () => { fast = !fast; pb?.setFast(fast); scene.speed = fast ? 4 : 1; syncControls(); });
  const bStepMode = h('button', { class: 'btn small', title: 'Step mode: go one event at a time', 'aria-pressed': 'false', onclick: () => setStepMode(!stepMode) }, 'Step mode');
  const tlTip = h('div', { class: 'tl-tip hidden' });
  const timeline = h('div', { class: 'timeline', role: 'slider', 'aria-label': 'Night timeline: click to jump' }, h('div', { class: 'segs' }), h('div', { class: 'fill' }), tlTip);
  const bXray = h('button', { class: 'btn small', title: 'X-ray: see the true dreams (X)', onclick: () => setXray(!xray) }, 'X-ray');
  const bNerd = h('button', { class: 'btn small', title: 'Nerd mode: amplitudes and numbers', onclick: () => { save.settings.nerd = !save.settings.nerd; persist(); syncNerd(); } }, 'Nerd');
  const bRun = h('button', { class: 'btn primary', onclick: () => startRun() }, 'Run night');
  const bTest = h('button', { class: 'btn go', onclick: () => testAll() }, 'Test all');
  const controls = h('div', { class: 'controls' }, bStepMode, bRewind, bBack, bPlay, bStep, bFast, h('div', { class: 'spacer' }), bXray, bNerd, h('div', { class: 'sep' }), bRun, bTest);
  const sceneArea = h('div', { style: 'position:relative;flex:1;min-height:0;display:flex' }, wrap, hud, nerdPanel, hintsPanel, sceneTip);
  const tlRow = h('div', { class: 'tl-row' }, timeline);
  stage.append(sceneArea, tlRow, controls);

  const hintBtn = h('button', { class: 'btn small', title: 'Schrödi\'s hints', onclick: () => toggleHints() }, '💡 Hints');
  const topbar = h('div', { class: 'topbar' },
    h('button', { class: 'btn small', onclick: () => nav.go(lab || la.kind === 'endless' ? 'title' : 'map') }, '◂ ' + (story ? 'Map' : 'Back')),
    h('span', { class: 'lvl-badge' }, story ? level.id : la.kind === 'lab' ? 'LAB' : 'SHIFT'),
    h('div', { style: 'min-width:0' }, h('div', { class: 'title' }, level.title), h('div', { class: 'sub' }, level.subtitle ?? '')),
    h('div', { class: 'spacer' }),
    la.extra ? la.extra({ setLevel, runNight: (i, e) => startRun(i, e), testAll, root }) : null,
    story ? hintBtn : null,
    h('button', { class: 'btn icon small', title: 'Settings', onclick: () => nav.settings() }, '⚙'),
    fullscreenButton(),
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
  let stepMode = false;
  let runToken = 0;
  let pickState: { allowed: Set<QubitId>; cb: (id: QubitId) => void } | null = null;
  let won = false;

  function progs(): Progs { return editor.exportProgs(); }

  function makeEditor() {
    editor?.el.remove(); editor?.destroy();
    editor = new Editor(level, progKey ? save.programs[progKey] ?? {} : {}, {
      peekMode: level.classical || level.allowPeekData ? 'safe' : 'wakes',
      slots: progKey ? save.slots?.[progKey] : undefined,
      isDone: (id) => !!save.progress[id]?.done,
      onChange: (p, slots) => {
        if (progKey) { save.programs[progKey] = p; (save.slots ??= {})[progKey] = slots; persist(); }
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
    if (pb) drawTimeline();
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
    bRewind.classList.toggle('hidden', stepMode); bPlay.classList.toggle('hidden', stepMode);
    bBack.classList.toggle('hidden', !stepMode); bStep.classList.toggle('hidden', !stepMode);
    bStepMode.classList.toggle('on', stepMode); bStepMode.setAttribute('aria-pressed', String(stepMode));
    let ph: Phase | 'build' = 'build';
    if (pb) { for (let k = Math.min(pb.i, pb.length) - 1; k >= 0; k--) { const e = pb.night.steps[k].ev; if (e.k === 'phase') { ph = e.phase; break; } } if (pb.done) ph = 'morning'; }
    if (ph !== curPhase) {
      curPhase = ph;
      phasePill.textContent = ph === 'build' ? 'Build' : ph === 'bedtime' ? 'Bedtime' : ph === 'night' ? 'Night' : pb?.done ? 'Morning check' : 'Morning';
      phasePill.classList.toggle('night', ph === 'night');
    }
  }
  /** Event markers on the timebar, placed by REAL time (walks included), with phase segments. */
  type Mark = { k: number; at: number; cls: string; label: string };
  let marks: Mark[] = [];
  const evLabel = (ev: TraceEvent): string => {
    switch (ev.k) {
      case 'gate': return ev.op === 'HIGHFIVE' ? `HIGHFIVE ${ev.from} → ${ev.t}` : `${ev.op} ${ev.t}`;
      case 'measure': return isBot(ev.t) ? `LISTEN ${ev.t}: ${ev.result ? 'BEEP' : 'QUIET'} (one-way door)` : ev.woke ? `PEEK ${ev.t}: woke it! (one-way door)` : `PEEK ${ev.t}: ${level.classical ? ev.result : ev.result ? '🌙' : '☀'}`;
      case 'jump': return ev.taken ? 'jump taken ↪' : 'IF: no jump';
      case 'noise': return `gremlin: ${ev.e.kind} on ${ev.e.t}`;
      case 'end': return ev.reason === 'END' ? 'END' : ev.reason === 'maxSteps' ? 'out of night' : 'end';
      default: return '';
    }
  };
  function drawTimeline() {
    timeline.querySelectorAll('.tick').forEach((n) => n.remove());
    const segs = timeline.querySelector('.segs') as HTMLElement; segs.innerHTML = '';
    marks = [];
    if (!pb) return;
    const P = pb, night = P.night, total = P.totalTime || 1;
    let segStart = 0, segPh: Phase | null = null;
    const closeSeg = (end: number) => {
      if (segPh == null || end <= segStart) return;
      const nm = segPh === 'bedtime' ? 'Bedtime' : segPh === 'night' ? 'Night' : 'Morning';
      segs.appendChild(h('div', { class: `seg ${segPh}`, style: `left:${(segStart / total) * 100}%;width:${((end - segStart) / total) * 100}%`, title: nm }, h('span', null, nm)));
    };
    night.steps.forEach((st, k) => {
      const ev = st.ev;
      const at = P.T[k] + P.walkT[k] + P.actT[k] * 0.5;
      if (ev.k === 'phase') { closeSeg(P.T[k]); segStart = P.T[k]; segPh = ev.phase; return; }
      let cls = '';
      if (ev.k === 'gate') cls = `gate g-${ev.op}`;
      else if (ev.k === 'measure') cls = `measure ${ev.result ? 'beep' : 'quiet'}${isBot(ev.t) ? '' : ev.woke ? ' woke' : ' peek'}`;
      else if (ev.k === 'jump') { if (!ev.taken) return; cls = 'jump'; }
      else if (ev.k === 'noise') { if (!xray) return; cls = 'noise'; } // gremlin moves are hidden unless x-ray
      else return;
      marks.push({ k, at, cls, label: evLabel(ev) });
    });
    closeSeg(total);
    for (const m of marks) timeline.appendChild(h('div', { class: `tick ${m.cls}`, style: `left:${(m.at / total) * 100}%` }));
  }
  const tlFrac = (e: PointerEvent | MouseEvent) => { const r = timeline.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  timeline.addEventListener('pointermove', (e) => {
    if (!pb || !pb.totalTime) { tlTip.classList.add('hidden'); return; }
    const r = timeline.getBoundingClientRect(), total = pb.totalTime;
    const x = e.clientX - r.left;
    let best: Mark | null = null, bd = 9;
    for (const m of marks) { const d = Math.abs((m.at / total) * r.width - x); if (d < bd) { bd = d; best = m; } }
    if (!best) {
      const seg = (e.target as HTMLElement).closest('.seg') as HTMLElement | null;
      if (!seg) { tlTip.classList.add('hidden'); return; }
      tlTip.textContent = (seg.title || '') + ' · click to jump here';
    } else tlTip.textContent = best.label + ' · click to jump';
    tlTip.classList.remove('hidden');
    tlTip.style.left = `${Math.max(0, Math.min(r.width, x))}px`;
  });
  timeline.addEventListener('pointerleave', () => tlTip.classList.add('hidden'));
  timeline.addEventListener('click', (e) => {
    if (!pb) return;
    const total = pb.totalTime || 1, t = tlFrac(e) * total;
    const r = timeline.getBoundingClientRect();
    let target = pb.indexAtTime(t);
    for (const m of marks) if (Math.abs(((m.at - t) / total) * r.width) < 9) { target = m.k + 1; break; }
    pb.seek(target);
    syncControls();
  });

  function stopRun() {
    runToken++;
    pb = null; scene.anim = null; scene.peeked.clear(); scene.woke.clear(); scene.mood = null; scene.caretakerMood = null;
    scene.base = initialSnap(); scene.nightTarget = 0; scene.dimTarget = 0;
    editor.setCurrent(null);
    if (!lab && xray !== save.settings.xrayDefault) setXray(save.settings.xrayDefault);
    audio.setTension(0); audio.setScene(lab ? 'lab' : 'build');
    syncControls();
  }

  function playNight(night: NightX, opts: { xray?: boolean; onEnd?: (n: NightX) => void; paused?: boolean } = {}) {
    const token = ++runToken;
    scene.caretakerMood = null;
    if (opts.xray != null) setXray(opts.xray);
    audio.setScene(level.lightsOut ? 'lightsout' : 'run');
    pb = new Playback(scene, level, night, progs(), {
      onLine: (ref) => editor.setCurrent(ref),
      onChange: syncControls,
      onBlocked: () => toast('Snap! Measurements are a one-way door. You can\'t un-look.', 'bad'),
      onImpact: (ev) => { if (ev.k === 'jump') editor.pulseJump(ev.taken); },
      onEnd: (n) => { if (token === runToken) opts.onEnd?.(n as NightX); },
    });
    pb.setFast(fast); scene.speed = fast ? 4 : 1;
    drawTimeline();
    if (opts.paused || stepMode) pb.pause(); else pb.play();
    syncControls();
  }
  function stepFwd() {
    if (!pb) { startRun(undefined, undefined, true); (pb as Playback | null)?.step(); }
    else if (pb.done && !pb.busy) { replay(pb.night as NightX, true); (pb as Playback | null)?.step(); }
    else pb.step();
    syncControls();
  }
  function setStepMode(on: boolean) {
    stepMode = on;
    if (on && pb?.playing) pb.pause();
    audio.sfx('ui_click', { pitch: on ? 1.2 : 0.9 });
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

  function startRun(input?: InputState, errors?: ErrorEvent[], paused = false) {
    dialogue.close(false);
    const pick = input ? { input, errors: errors ?? [] } : pickNight();
    let night: NightX;
    try { night = quantum.runNight(level, progs(), pick.input, pick.errors, (Math.random() * 2 ** 31) | 0); }
    catch (e) { toast(String((e as Error).message ?? e), 'bad'); return; }
    playNight(night, { xray: lab ? true : undefined, onEnd: (n) => afterRun(n), paused });
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
    if (story && fails === 3) { hintBtn.classList.add('pulse'); toast('Schrödi has an offer for you in 💡 Hints', '', 3200); }
    if (!hintsPanel.classList.contains('hidden')) renderHints();
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

  function replay(n: NightX, paused = false) {
    let night: NightX = n;
    if (!n.steps.length || n.steps.some((s) => !s.snap.bloch || !Object.keys(s.snap.bloch).length)) {
      night = quantum.runNight(level, progs(), n.input, n.errors, n.seed ?? 1);
    }
    playNight(night, { xray: true, paused });
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
      level.proTerm ? h('div', { class: 'pro-term' }, ...linkify(level.proTerm)) : null,
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

  // ───────── hints: a friendly Schrödi-led panel with escalating cards ─────────
  const OPS: OpName[] = ['BOOP', 'SHUSH', 'SPIN', 'HIGHFIVE', 'LISTEN', 'RESET', 'PEEK', 'IF', 'JUMP', 'END'];
  /** creatures + card kinds a hint talks about (for "show me") */
  function hintTargets(text: string): { ids: QubitId[]; ops: OpName[] } {
    const ids = new Set<QubitId>();
    const have = new Set<string>([...level.qubbles.map((q) => q.id), ...level.bots.map((b) => b.id)]);
    for (const m of text.matchAll(/\bq(\d)\b/g)) ids.add(`q${m[1]}` as QubitId);
    for (const m of text.matchAll(/\bQubbles?\s+(\d)(?:\s*(?:,|and)\s*(\d))?(?:\s*(?:,|and)\s*(\d))?/gi)) for (const d of m.slice(1)) if (d) ids.add(`q${d}` as QubitId);
    for (const re of [/\bbots?\s+([a-h])\b/gi, /->\s*([a-h])\b/g, /\b([a-h])\s+(?:BEEP|QUIET)\b/g, /\b(?:LISTEN|RESET)\s+([a-h])\b/g, /\b([a-h])\s+(?:checks|listens)\b/g]) {
      for (const m of text.matchAll(re)) ids.add(m[1].toLowerCase() as QubitId);
    }
    if (/\bbots?\b/i.test(text) && ![...ids].some((i) => isBot(i))) for (const b of level.bots) ids.add(b.id);
    const ops = OPS.filter((o) => new RegExp(`\\b${o}\\b`).test(text) && level.toolbox.includes(o));
    return { ids: [...ids].filter((i) => have.has(i)), ops };
  }
  let hlTimer = 0;
  function showMe(text: string) {
    const tg = hintTargets(text);
    scene.hintHL = new Set(tg.ids);
    if (tg.ops.length) editor.flashOps(tg.ops);
    audio.sfx('ui_click', { pitch: 1.3 });
    clearTimeout(hlTimer);
    hlTimer = window.setTimeout(() => { scene.hintHL = new Set(); }, 4000);
  }
  function renderHints() {
    const hs = level.hints;
    hintsPanel.innerHTML = '';
    const close = h('button', { class: 'btn icon small close', 'aria-label': 'Close hints', title: 'Close (the hints stay where you left them)', onclick: () => toggleHints(false) }, '×');
    hintsPanel.append(h('div', { class: 'hints-head' },
      h('img', { class: 'hp-portrait', src: portraitSrc(art.portrait('schrodi', hintIdx >= hs.length ? 'smug' : 'deadpan')), alt: '' }),
      h('div', null, h('div', { class: 'display hp-title' }, "Schrödi's hints"), h('div', { class: 'muted hp-sub' }, hintIdx ? `${hintIdx} of ${hs.length} nudges` : 'No spoilers until you ask.')),
      close));
    const body = h('div', { class: 'hints-body' });
    for (let k = 0; k < Math.min(hintIdx, hs.length); k++) {
      const tg = hintTargets(hs[k]);
      const can = tg.ids.length || tg.ops.length;
      body.appendChild(h('div', { class: `hint-card${k === hintIdx - 1 ? ' fresh' : ''}` },
        h('div', { class: 'hint-num display' }, k === hs.length - 1 && hs.length > 1 ? 'Big nudge' : `Nudge ${k + 1}`),
        h('div', { class: 'hint-text' }, hs[k]),
        can ? h('button', { class: 'chip show-me', title: 'Highlight what this hint is about', onclick: () => showMe(hs[k]) }, '👀 show me') : null));
    }
    if (hintIdx < hs.length) {
      body.appendChild(h('button', { class: 'btn small sun nudge', onclick: () => { hintIdx++; renderHints(); showMe(hs[hintIdx - 1]); body.lastElementChild?.scrollIntoView?.({ block: 'nearest' }); } },
        hintIdx === 0 ? 'Give me a nudge' : 'need another nudge?'));
    } else if (fails < 3) {
      body.appendChild(h('div', { class: 'muted hint-foot' }, `That's all my nudges. Fail ${3 - fails} more test${3 - fails === 1 ? '' : 's'} and I'll just show you. (No judgement. Some judgement.)`));
    }
    if (story && fails >= 3) {
      let armed = false;
      const b = h('button', { class: 'btn small primary' }, 'Show solution');
      b.addEventListener('click', () => {
        if (!armed) { armed = true; b.textContent = 'Sure? It replaces this slot'; return; }
        editor.setProgs(level.solution); hintBtn.classList.remove('pulse'); toast('Solution loaded into this slot. Press Run! (Undo with Ctrl+Z)', 'good');
      });
      body.appendChild(h('div', { class: 'hint-card solution' },
        h('div', { class: 'hint-num display' }, 'Stuck?'),
        h('div', { class: 'hint-text' }, `${fails} tests didn't go your way. I can load a working program. You can try another slot (A/B/C) first.`), b));
    }
    hintsPanel.appendChild(body);
  }
  function toggleHints(on = hintsPanel.classList.contains('hidden')) {
    hintsPanel.classList.toggle('hidden', !on);
    hintBtn.classList.toggle('on', on);
    if (on) { if (hintIdx === 0 && fails === 0) { /* wait for the player to ask */ } renderHints(); audio.sfx('ui_click', { pitch: 1.2 }); }
    else { scene.hintHL = new Set(); }
  }

  // ───────── input: canvas picking, poking & tooltips ─────────
  const pos = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
  const peekSafe = !!(level.classical || level.allowPeekData);
  const BOXLINES = ['peek-a-boo!', 'yep, still a bit', 'looking is fine on day shift', 'ta-da!', 'one bit, zero drama'];
  const SLEEPY = ['mmh… five more minutes…', 'zzz… not telling…', '*mumble* …the blanket stays…', 'snrk… go \'way…', 'mmf… dreaming… of… nope.', '*rolls over*'];
  const QUIPS = ['I am both bored and not bored.', 'I contain multitudes. Mostly naps.', 'Meow. That\'s all you get.', 'Don\'t look at me. Literally.', 'I sit in boxes. It\'s a whole thing.', 'Your code. My box. Same energy.', 'Poke the bots, not the cat.'];
  const TAUNTS: Record<string, string[]> = { flipper: ['nyeh! flip flip!', 'can\'t catch me!', 'upside down, baby!'], phasey: ['wooOOoo… swirl!', 'you can\'t see meee', 'phase happens~'], wobbles: ['wibble wobble!', 'just a little nudge…', 'whoopsie~'] };
  const pokeCount = new Map<string, { n: number; t: number }>();
  function tipFor(hit: NonNullable<ReturnType<Scene['hitAny']>>): string {
    switch (hit.kind) {
      case 'qubble': return level.classical ? `${hit.id}: a box with one bit inside (peeking is fine here: click!)` : peekSafe ? `${hit.id}: peeking is allowed here` : scene.woke.has(hit.id!) ? `${hit.id}: awake and grumpy` : `${hit.id}: fast asleep under the blanket (poke gently)`;
      case 'bot': return `bot ${hit.id}: says hi when clicked`;
      case 'caretaker': return busy() ? 'You, the caretaker (busy!)' : 'You, the caretaker: click or drag to move me';
      case 'schrodi': return busy() ? 'Schrödi: supervisor. Cat. Possibly both.' : 'Schrödi: drag his box somewhere comfier';
      case 'gremlin': return 'A gremlin! Click to shoo';
      case 'window': return 'The window';
      case 'clock': return 'The clock';
      case 'door': return 'The door';
    }
  }
  function interact(hit: NonNullable<ReturnType<Scene['hitAny']>>) {
    const now = performance.now() / 1000;
    switch (hit.kind) {
      case 'qubble': {
        const id = hit.id!;
        if (peekSafe) { // peeking is allowed here: pop the lid and show the value (no warnings)
          const z = currentSnap()?.bloch[id]?.z ?? 1;
          const v = level.classical ? (z >= 0 ? 0 : 1) : null;
          scene.poke('lid:' + id, 1.3);
          audio.sfx('ui_click', { pitch: 1.5 });
          scene.say(v == null ? pick(['peek! (allowed here)', 'just a quick look…']) : `${v === 0 ? '0 ☀' : '1 🌙'} · ${pick(BOXLINES)}`, id, 'good', 1.8);
          break;
        }
        scene.poke('q:' + id, 1.1);
        audio.sfx('qubble_snore', { volume: 0.6, pitch: 0.9 + Math.random() * 0.3 });
        if (!scene.woke.has(id)) scene.say(pick(SLEEPY), id, 'speech', 1.8);
        else scene.say('hmph.', id, 'speech');
        const c = pokeCount.get(id);
        const n = c && now - c.t < 6 ? c.n + 1 : 1;
        pokeCount.set(id, { n, t: now });
        if (n >= 3) {
          pokeCount.set(id, { n: 0, t: now });
          scene.say('No peeking!', 'schrodi', 'bad', 2);
          audio.sfx('schrodi_meow', { volume: 0.6 });
          if (!dialogue.active && story) dialogue.play([{ who: 'schrodi', text: pick(['No peeking! Poking is how peeking starts.', 'Hands off the blanket. That Qubble is mid-dream.', 'If it wakes up, it forgets half its dream. Forever. No pressure.']), mood: 'shock' }]);
        }
        break;
      }
      case 'bot': {
        const id = hit.id!;
        scene.poke('bot:' + id, 1.2);
        const idx = level.bots.findIndex((b) => b.id === id);
        const snap = currentSnap();
        audio.botNote(Math.max(0, idx), (snap?.lights[id] ?? 0) === 1 ? 1 : 0);
        scene.say(pick(['beep boop!', 'bip!', 'hi! 👋', 'boop?']), id, 'speech', 1.3);
        break;
      }
      case 'schrodi':
        audio.sfx('schrodi_meow', { volume: 0.7 });
        scene.poke('sch', 2);
        scene.say(pick(QUIPS), 'schrodi', 'speech', 2.4);
        break;
      case 'caretaker': {
        const yawn = Math.random() < 0.5;
        scene.pokeCaretaker(yawn ? 'yawn' : 'cheer');
        scene.say(yawn ? '*yaaawn*' : 'hi! 👋', 'caretaker', 'speech', 1.4);
        break;
      }
      case 'gremlin': {
        scene.poke('gremlin', 1.2);
        const a = scene.anim; const k = a?.ev.k === 'noise' ? (a.ev.e.kind === 'phase' ? 'phasey' : a.ev.e.kind === 'wobble' ? 'wobbles' : 'flipper') : 'flipper';
        scene.say(pick(TAUNTS[k]), 'gremlin', 'speech', 1.4);
        audio.sfx('glitch', { volume: 0.4 });
        break;
      }
      case 'window': {
        const c = scene.objectCentre('window');
        if (c) { scene.say(scene.night > 0.5 ? pick(['🌙 the moon is napping too', '🌠 a shooting star!', '✨ twinkle twinkle']) : pick(['☁ a cloud shaped like a cat', '🐦 tweet', '☀ nice day for a nap']), c, 'info', 2); if (art.burst) art.burst('reset', c.x, c.y); }
        audio.sfx('ui_hover', { pitch: 1.5 });
        break;
      }
      case 'clock': {
        const c = scene.objectCentre('clock');
        const hr = scene.night > 0.5 ? `${1 + Math.floor(Math.random() * 4)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')} am` : 'nap o\'clock';
        if (c) scene.say(`tick… tock… ${hr}`, c, 'info', 2);
        audio.sfx('ui_click', { pitch: 0.6 }); setTimeout(() => audio.sfx('ui_click', { pitch: 1.1 }), 260);
        break;
      }
      case 'door': {
        const c = scene.objectCentre('door');
        if (c) scene.say(pick(['knock knock… nobody. (a gremlin?)', 'locked. for your own good.', '*creak*… nope, still night']), c, 'info', 2.2);
        scene.shake = 3; audio.sfx('reset', { volume: 0.4, pitch: 0.6 });
        break;
      }
    }
  }
  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e); const id = scene.hitTest(p.x, p.y);
    scene.hoverPick = pickState && id && pickState.allowed.has(id) ? id : null;
    const hit = pickState ? null : scene.hitAny(p.x, p.y);
    scene.hover = hit;
    canvas.style.cursor = pickState ? (scene.hoverPick ? 'pointer' : 'crosshair') : hit ? 'pointer' : '';
    if (hit && !dialogue.active) {
      sceneTip.textContent = tipFor(hit);
      sceneTip.classList.remove('hidden');
      const r = canvas.getBoundingClientRect(), sr = sceneArea.getBoundingClientRect();
      sceneTip.style.left = `${e.clientX - sr.left + 14}px`; sceneTip.style.top = `${e.clientY - sr.top + 16}px`;
      void r;
    } else sceneTip.classList.add('hidden');
  });
  canvas.addEventListener('pointerleave', () => { sceneTip.classList.add('hidden'); scene.hover = null; });
  // ── pick up & drop the caretaker / Schrödi's box (cosmetic only: never touches physics or the trace) ──
  const homeKey = progKey ?? level.id;
  scene.homes = structuredClone(save.homes?.[homeKey] ?? {});
  let grab: { kind: 'caretaker' | 'box'; x0: number; y0: number; held: boolean; hit: NonNullable<ReturnType<Scene['hitAny']>> } | null = null;
  const busy = () => !!pb && !pb.done;
  function drop() {
    const tile = scene.dropCarry(); if (!tile) return;
    (save.homes ??= {})[homeKey] = structuredClone(scene.homes); persist();
    audio.sfx('boop', { pitch: 1.8, volume: 0.7 }); setTimeout(() => audio.sfx('boop', { pitch: 2.3, volume: 0.4 }), 110);
    scene.say('boing!', grabKindLast === 'box' ? 'schrodi' : 'caretaker', 'speech', 1);
    canvas.style.cursor = '';
  }
  let grabKindLast: 'caretaker' | 'box' = 'caretaker';
  window.addEventListener('pointermove', onCarryMove);
  window.addEventListener('pointerup', onCarryUp);
  cleanups.push(() => { window.removeEventListener('pointermove', onCarryMove); window.removeEventListener('pointerup', onCarryUp); });
  function onCarryMove(e: PointerEvent) {
    if (!grab && !scene.carry) return;
    const p = pos(e);
    if (grab && !scene.carry && Math.hypot(p.x - grab.x0, p.y - grab.y0) > 6) { scene.carry = { kind: grab.kind, x: p.x, y: p.y }; grabKindLast = grab.kind; audio.sfx('card_pick'); }
    if (scene.carry) { scene.carry.x = p.x; scene.carry.y = p.y; canvas.style.cursor = 'grabbing'; sceneTip.classList.add('hidden'); }
  }
  function onCarryUp(e: PointerEvent) {
    if (!grab) return;
    const g = grab; grab = null;
    if (scene.carry && g.held) { drop(); return; }      // drag & drop
    if (!scene.carry) {
      if (g.kind === 'caretaker') { const p = pos(e); scene.carry = { kind: 'caretaker', x: p.x, y: p.y }; grabKindLast = 'caretaker'; audio.sfx('card_pick'); scene.say('wheee!', 'caretaker', 'speech', 1); } // click = pick up, next click drops
      else interact(g.hit);                              // a click on Schrödi = meow + quip
    }
  }
  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e); const id = scene.hitTest(p.x, p.y);
    if (scene.carry) { drop(); return; }               // carrying after a click: this click drops
    if (pickState && id && pickState.allowed.has(id)) { const cb = pickState.cb; cb(id); audio.sfx('ui_click'); return; }
    if (pickState) return;
    if (dialogue.active) { dialogue.advance(); return; }
    const hit = scene.hitAny(p.x, p.y);
    if (hit && (hit.kind === 'caretaker' || hit.kind === 'schrodi')) {
      if (busy()) { scene.say('busy!', hit.kind === 'schrodi' ? 'schrodi' : 'caretaker', 'speech', 1); if (hit.kind === 'schrodi') interact(hit); return; }
      grab = { kind: hit.kind === 'caretaker' ? 'caretaker' : 'box', x0: p.x, y0: p.y, held: true, hit };
      return;
    }
    if (hit) interact(hit);
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
    if (e.key === ' ') { e.preventDefault(); if (dialogue.active) dialogue.advance(); else if (stepMode) stepFwd(); else togglePlay(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepFwd(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); pb?.back(e.repeat); }
    else if (e.key.toLowerCase() === 'x') setXray(!xray);
    else if (e.key === 'Enter' && dialogue.active) dialogue.advance();
  };
  const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft' && pb?.rewinding) pb.pause(); };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  const np = (window as unknown as { __np?: Record<string, unknown> }).__np;
  // ───────── frame ─────────
  const fill = timeline.querySelector('.fill') as HTMLElement;
  cleanups.push(onFrame((t, dt) => {
    if (!np?.freeze) pb?.update(dt);
    scene.draw(t);
    fill.style.width = `${(pb?.progress() ?? 0) * 100}%`;
    updateHud();
  }));

  function setLevel(def: LevelDef) {
    level = def; scene.setLevel(def); scene.homes = {}; report = null; stripHost.innerHTML = ''; won = false;
    (topbar.querySelector('.title') as HTMLElement).textContent = def.title;
    (topbar.querySelector('.sub') as HTMLElement).textContent = def.subtitle ?? '';
    makeEditor(); stopRun();
  }

  // QA hook: live scene + playback for automated checks (?qa)
  if (np) {
    np.scene = scene; np.pb = () => pb; np.editor = () => editor;
    np.screenPos = (id: QubitId) => { const p = scene.posOf(id); const r = canvas.getBoundingClientRect(); return p ? { x: r.left + p.x, y: r.top + p.y } : null; };
    np.runNight = (input?: InputState, errors?: ErrorEvent[], paused?: boolean) => startRun(input, errors, paused);
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
