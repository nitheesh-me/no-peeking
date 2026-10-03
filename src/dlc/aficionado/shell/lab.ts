/**
 * Lab (and Bench): circuit editor + QASM-like text pane + run loop.
 *  - Run: one seeded night, played back step by step. During execution only the classical record
 *    (measurement outcomes, syndrome history) is shown; the state is veiled. Noise events are not
 *    shown either (an experimenter can't see them): they are revealed in the post-run analysis.
 *  - Run N: Monte Carlo with a Wilson 95 % interval. Verify: the module's full test suite (completion).
 *  - Bench: any level as a register layout, full gate set, iid noise of chosen type/strength, p-sweeps.
 */
import type { GremlinKind, LevelDef, OpName, Program, TraceStep } from '../../../core/contracts';
import { h } from '../../../engine/util';
import { gateHelp, gateName, stageName } from '../state/names';
import { t } from '../../../i18n/index';
import quantum, { testLevel, type NightResultX } from '../../../quantum/index';
import { createEditor, type EditorHandle } from '../editor/view';
import { createTextPane, type TextPaneHandle } from '../editor/textPane';
import { fromProgramMapped, metrics, toProgram, validate, wiresOf, type Column, type Linear, type PhaseName, type Segment } from '../editor/model';
import { moduleOpen } from '../state/levels';
import { monteCarlo, trialCase, wilson, withNoise, type Prog } from '../state/mc';
import { afiStore } from '../state/store';
import type { McResult } from '../contracts';
import type { AfiChartPoint } from '../state/vizApi';
import type { View } from './api';
import { mountChart, mountOracle } from './vizHost';
import { circuitText, copy } from './exporting';
import { noiseText } from './views';

const BASE_OPS: OpName[] = ['BOOP', 'SHUSH', 'SPIN', 'HIGHFIVE', 'LISTEN', 'RESET', 'PEEK', 'IF', 'JUMP', 'END'];
/** extra gates the shared VM may provide (feature-detected through its parser) */
function extraOps(): string[] {
  const probe: [string, string][] = [['Y', 'Y q1'], ['S', 'S q1'], ['CZ', 'CZ q1 -> q2']];
  return probe.filter(([, src]) => { try { return quantum.parseProgram(src).errors.length === 0; } catch { return false; } }).map(([n]) => n);
}

export interface AnalysisArg { levelId: string; bench: boolean; night: NightResultX; prog: Prog; level: LevelDef; segs: Segment[]; pcMap: PcMap }
export type PcMap = { phase: PhaseName; part: 'fixed' | 'mine'; at: Map<number, number> }[];

const randSeed = () => (Math.random() * 0x7fffffff) >>> 0;

export const labView: View = (el, api, arg) => {
  const bench = typeof arg === 'object' && arg !== null && (arg as { bench?: boolean }).bench === true;
  const done = afiStore.completed();
  const openLevels = api.modules.filter((m) => moduleOpen(m, api.modules, done, api.judge())).flatMap((m) => m.levels);
  let levelId = bench ? afiStore.settings().benchLevel ?? '' : String(arg);
  if (bench && !openLevels.some((l) => l.def.id === levelId)) levelId = openLevels[openLevels.length - 1]?.def.id ?? '';
  const lv = api.level(levelId);
  if (!lv) { api.go('map'); return; }
  const def: LevelDef = bench ? { ...lv.def, toolbox: [...BASE_OPS, ...extraOps()] as OpName[], editable: ['bedtime', 'morning'], fixedBedtime: undefined, fixedMorning: undefined } : lv.def;
  if (bench && lv.def.fixedBedtime?.length && !lv.def.editable.includes('bedtime')) def.starterBedtime = lv.def.fixedBedtime;
  const progKey = bench ? `bench:${levelId}` : levelId;
  const wires = wiresOf(def);
  const benchNoise = { kinds: ['flip'] as GremlinKind[], p: 0.05, ps: '0.01, 0.02, 0.05, 0.1, 0.15, 0.2', trials: 400 };

  // ───── segments (fixed parts locked; editable parts from the saved program or the starter) ─────
  const saved = afiStore.program(progKey);
  const segs: Segment[] = [];
  const fixedMaps: PcMap = [];
  for (const phase of ['bedtime', 'morning'] as PhaseName[]) {
    const fixed = phase === 'bedtime' ? def.fixedBedtime : def.fixedMorning;
    if (fixed?.length) { const m = fromProgramMapped(fixed, wires); segs.push({ phase, locked: true, cols: m.cols }); fixedMaps.push({ phase, part: 'fixed', at: m.pcCol }); }
    if (def.editable.includes(phase)) {
      const start = saved?.[phase] ?? (phase === 'bedtime' ? def.starterBedtime : def.starterMorning) ?? [];
      segs.push({ phase, locked: false, cols: fromProgramMapped(start, wires).cols });
    }
  }
  const editPhases = segs.filter((s) => !s.locked).map((s) => s.phase);

  // ───── layout ─────
  const title = h('div', { class: 'afi-lab-title' },
    h('span', { class: 'mono' }, bench ? t('afi.bench.title') : `${lv.meta.id} · ${def.id}`), ' ',
    h('span', null, t(def.title)));
  const seedIn = h('input', { class: 'afi-seed mono', type: 'number', min: 0, value: randSeed(), 'aria-label': t('afi.lab.seed') }) as HTMLInputElement;
  const nIn = h('input', { class: 'afi-n mono', type: 'number', min: 10, max: 100000, step: 10, value: def.goal.kind === 'rate' ? def.goal.nights : 500, 'aria-label': t('afi.lab.trials') }) as HTMLInputElement;
  const btn = (k: string, fn: () => void, cls = 'afi-btn small') => h('button', { class: cls, onclick: fn }, t(k)) as HTMLButtonElement;
  const runBtn = btn('afi.lab.run', () => void runOnce());
  const mcBtn = btn('afi.lab.runN', () => void runMany(), 'afi-btn small ghost');
  const verifyBtn = btn('afi.lab.verify', () => void verify(), 'afi-btn small ghost'); verifyBtn.hidden = bench;
  const stopBtn = btn('afi.lab.stop', () => { abort.aborted = true; }, 'afi-btn small danger'); stopBtn.hidden = true;
  const pb = {
    first: btn('afi.lab.pb.first', () => seek(0), 'afi-icon'), prev: btn('afi.lab.pb.prev', () => seek(k - 1), 'afi-icon'),
    play: btn('afi.lab.pb.play', () => togglePlay(), 'afi-icon'), next: btn('afi.lab.pb.next', () => seek(k + 1), 'afi-icon'),
    last: btn('afi.lab.pb.last', () => seek(steps.length - 1), 'afi-icon'),
  };
  const stepLbl = h('span', { class: 'afi-step mono', 'aria-live': 'off' }, '');
  const analysisBtn = btn('afi.lab.analysis', () => openAnalysis(), 'afi-btn small accent'); analysisBtn.disabled = true;
  const refBtn = api.judge() && !bench ? btn('afi.lab.reference', () => loadReference(), 'afi-btn small ghost') : null;
  const bar = h('div', { class: 'afi-lab-bar', role: 'toolbar', 'aria-label': t('afi.lab.controls') },
    title,
    h('div', { class: 'afi-lab-run' }, runBtn, mcBtn, h('label', { class: 'afi-inline' }, 'N', nIn), verifyBtn, stopBtn,
      h('label', { class: 'afi-inline' }, t('afi.lab.seed'), seedIn), (() => { const b = btn('afi.lab.newSeed', () => { seedIn.value = String(randSeed()); }, 'afi-icon'); b.title = b.textContent ?? ''; b.setAttribute('aria-label', b.title); b.textContent = '⟳'; return b; })(), refBtn),
    h('div', { class: 'afi-lab-pb' }, pb.first, pb.prev, pb.play, pb.next, pb.last, stepLbl),
    analysisBtn);
  Object.entries(pb).forEach(([k2, b]) => { b.title = t(`afi.lab.pb.${k2}`); b.setAttribute('aria-label', t(`afi.lab.pb.${k2}`)); b.textContent = { first: '⏮', prev: '◀', play: '▶', next: '▶|', last: '⏭' }[k2]!; });

  const editorHost = h('div', { class: 'afi-lab-editor' });
  const textHost = h('section', { class: 'afi-lab-text', 'aria-label': t('afi.lab.textPane') },
    h('div', { class: 'afi-panel-head' }, h('span', null, t('afi.lab.textPane')),
      h('span', { class: 'afi-row-acts' }, btn('afi.export.copyQiskit', () => void copyCircuit('qiskit'), 'afi-btn tiny ghost'), btn('afi.export.copyQasm3', () => void copyCircuit('qasm3'), 'afi-btn tiny ghost'))));
  const recordList = h('ol', { class: 'afi-record mono' });
  const syndrome = h('div', { class: 'afi-syndrome mono' });
  const recordHost = h('section', { class: 'afi-lab-record', 'aria-label': t('afi.lab.record') },
    h('div', { class: 'afi-panel-head' }, h('span', null, t('afi.lab.record')), h('span', { class: 'afi-tag' }, t('afi.lab.observable'))),
    syndrome, recordList);
  const veilHost = h('div', { class: 'afi-veil-host' });
  const veil = h('section', { class: 'afi-lab-veil', 'aria-label': t('afi.lab.veilCaption') }, veilHost, h('p', { class: 'afi-caption' }, t('afi.lab.veilCaption')));
  const outcome = h('div', { class: 'afi-outcome', 'aria-live': 'polite' });
  const scoreBox = h('dl', { class: 'afi-score mono' });
  const chartHost = h('div', { class: 'afi-mc-chart' });
  const score = h('section', { class: 'afi-lab-score', 'aria-label': t('afi.lab.score') }, h('div', { class: 'afi-panel-head' }, h('span', null, t('afi.lab.score'))), outcome, scoreBox, chartHost);
  const errorsBox = h('div', { class: 'afi-lab-errors', 'aria-live': 'polite' });
  el.append(h('div', { class: `afi-lab ${bench ? 'bench' : ''}` },
    bar,
    h('div', { class: 'afi-lab-body' }, h('div', { class: 'afi-lab-left' }, editorHost, errorsBox), h('div', { class: 'afi-lab-side' }, textHost, recordHost)),
    h('div', { class: 'afi-lab-foot' }, veil, score, bench ? benchPanel() : null)));

  // ───── editor ⇄ text ─────
  let current = segs;
  const lin = (): Partial<Record<PhaseName, Linear>> => {
    const out: Partial<Record<PhaseName, Linear>> = {};
    for (const s of current) if (!s.locked) out[s.phase] = toProgram(s.cols, wires);
    return out;
  };
  const prog = (): Prog => { const l = lin(); return { bedtime: l.bedtime?.prog, morning: l.morning?.prog }; };
  const editable = () => current.filter((s) => !s.locked);
  let editor: EditorHandle;
  let text: TextPaneHandle;
  const changed = (next: Segment[], fromText = false) => {
    current = next;
    const p = prog();
    afiStore.setProgram(progKey, p);
    if (!fromText) text.show(editable());
    const probs = validate(editable().flatMap((s) => s.cols), def);
    errorsBox.replaceChildren(...[...new Set(probs.map((e) => t(e.key, e.vars)))].map((m) => h('div', { class: 'afi-err-line' }, m)));
    analysisBtn.disabled = true; lastNight = null;
    renderScore();
  };
  editor = createEditor(editorHost, { level: def, segments: segs, onChange: (s) => changed(s) });
  text = createTextPane(textHost, {
    wires, phases: editPhases,
    onParsed: (stages) => {
      const next = current.map((s) => (s.locked ? s : { ...s, cols: (stages[s.phase] ?? []) as Column[] }));
      editor.setSegments(next); changed(next, true);
    },
  });
  text.show(editable());

  // ───── veil (state not observable during execution) ─────
  let veilHandle: { update(i: never): void; destroy(): void } | null = null;
  const firstNerd = quantum.runNight(def, { }, def.inputs[0] === 'random' ? 'zero' : def.inputs[0] ?? 'zero', [], 1, { nerd: true }).steps[0]?.snap.nerd;
  if (firstNerd) void mountOracle('stateSpace', veilHost, { nerd: firstNerd, steps: [firstNerd], stepIndex: 0, level: def, meta: lv.meta, layers: api.layers(lv), webgl: api.webgl(), reducedMotion: api.reduced(), veiled: true })
    .then((hd) => { if (dead) hd.destroy(); else veilHandle = hd as never; });

  // ───── run state ─────
  let dead = false, running = false;
  let steps: TraceStep[] = [], k = 0, timer = 0;
  let lastNight: NightResultX | null = null, lastProg: Prog | null = null, lastMc: McResult | null = null;
  let pcMap: PcMap = [];
  const abort = { aborted: false };
  const setBusy = (b: boolean) => {
    running = b;
    [runBtn, mcBtn, verifyBtn].forEach((x) => (x.disabled = b)); stopBtn.hidden = !b;
    editor.setReadOnly(b); text.setReadOnly(b);
  };
  const updatePb = () => {
    const has = steps.length > 0;
    Object.values(pb).forEach((b) => (b.disabled = !has));
    stepLbl.textContent = has ? t('afi.lab.stepOf', { k: k + 1, n: steps.length }) : '';
    pb.play.textContent = timer ? '❚❚' : '▶';
  };
  updatePb();

  function renderScore() {
    const m = metrics(editable().flatMap((s) => s.cols), wires);
    const rows: [string, string][] = [
      [t('afi.score.gates'), String(m.gates)], [t('afi.score.depth'), String(m.depth)], [t('afi.score.ancillas'), String(m.ancillas)], [t('afi.score.measurements'), String(m.measurements)],
    ];
    if (lastMc) rows.push([t('afi.score.ler'), `${lastMc.rate.toFixed(4)}  [${lastMc.ci95[0].toFixed(4)}, ${lastMc.ci95[1].toFixed(4)}]`], [t('afi.score.trials'), `${lastMc.trials} · ${t('afi.score.seed')} ${lastMc.seed}`]);
    if (lastNight) rows.push([t('afi.score.nightSeed'), String(lastNight.seed)]);
    rows.push([t('afi.score.noise'), noiseText(runLevel().noise)]);
    scoreBox.replaceChildren(...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)]));
  }
  function runLevel(p = benchNoise.p): LevelDef { return bench ? withNoise(def, p, benchNoise.kinds) : def; }
  const seedVal = () => { const v = Number(seedIn.value); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : randSeed(); };
  const blockers = () => validate(editable().flatMap((s) => s.cols), def);

  function colFor(ev: Extract<TraceStep['ev'], { k: 'line' }>): number | null {
    if (ev.phase === 'night') return null;
    if (ev.part === 'fixed') return fixedMaps.find((m) => m.phase === ev.phase)?.at.get(ev.pc) ?? null;
    return lin()[ev.phase]?.at[ev.pc]?.col ?? null;
  }
  function seek(i: number) {
    if (!steps.length) return;
    k = Math.max(0, Math.min(steps.length - 1, i));
    // highlight the most recent line event
    let col: number | null = null;
    for (let j = k; j >= 0; j--) { const ev = steps[j].ev; if (ev.k === 'line') { col = colFor(ev); break; } if (ev.k === 'phase' && ev.phase === 'night') break; }
    editor.highlight(col);
    renderRecord();
    updatePb();
    if (k === steps.length - 1) finishPlayback();
  }
  function togglePlay() {
    if (timer) { clearInterval(timer); timer = 0; updatePb(); return; }
    if (k >= steps.length - 1) k = 0;
    timer = window.setInterval(() => { if (k >= steps.length - 1) { clearInterval(timer); timer = 0; updatePb(); return; } seek(k + 1); }, api.settings().lecture ? 520 : 260);
    updatePb();
  }
  function renderRecord() {
    const items: HTMLElement[] = [];
    const bits: Record<string, 0 | 1> = {};
    let round = 0;
    for (let j = 0; j <= k && j < steps.length; j++) {
      const ev = steps[j].ev;
      if (ev.k === 'phase') { items.push(h('li', { class: 'ph' }, t(`afi.record.phase.${ev.phase}`))); if (ev.phase === 'morning') round++; }
      else if (ev.k === 'measure') { bits[ev.t] = ev.result; items.push(h('li', { class: `m b${ev.result}` }, t('afi.record.measure', { q: ev.t, b: ev.result }))); }
      else if (ev.k === 'jump' && ev.taken) items.push(h('li', { class: 'j' }, t('afi.record.branch')));
      else if (ev.k === 'end') items.push(h('li', { class: 'end' }, t(`afi.record.end.${ev.reason}`)));
    }
    void round;
    recordList.replaceChildren(...items);
    recordList.scrollTop = recordList.scrollHeight;
    const anc = wires.filter((w) => w in bits);
    syndrome.textContent = anc.length ? `${t('afi.record.syndrome')}: ${anc.map((w) => `c_${w}=${bits[w]}`).join('  ')}` : t('afi.record.none');
  }
  function finishPlayback() {
    if (!lastNight) return;
    analysisBtn.disabled = false;
    const n = lastNight;
    outcome.replaceChildren(
      h('div', { class: `afi-result ${n.pass ? 'ok' : 'err'}` }, n.pass ? t('afi.lab.pass') : t('afi.lab.fail'), n.failReason ? ` · ${t(`afi.errors.${n.failReason}`, { fidelity: n.fidelity.toFixed(4), minF: 'minFidelity' in def.goal ? def.goal.minFidelity ?? (def.goal.kind === 'rate' ? 0.99 : 0.999) : 0.999, max: def.maxSteps ?? 500, message: n.message ?? '' })}` : ''),
      h('div', { class: 'afi-caption' }, t('afi.lab.judgedByOracle')));
  }

  async function runOnce() {
    if (running) return;
    const bl = blockers(); if (bl.length) { api.toast(t(bl[0].key, bl[0].vars), 'err'); return; }
    stopPlayback();
    const L = runLevel(), p = prog();
    const c = trialCase(L, seedVal(), 0);
    let night: NightResultX;
    try { night = quantum.runNight(L, p, c.input, c.errors, c.seed, { nerd: true }) as NightResultX; }
    catch (e) { console.error(e); api.toast(String((e as Error).message), 'err'); return; }
    lastNight = night; lastProg = p; steps = night.steps; k = 0;
    pcMap = [...fixedMaps, ...editPhases.map((ph) => ({ phase: ph, part: 'mine' as const, at: new Map((lin()[ph]?.at ?? []).map((a, i) => [i, a.col])) }))];
    outcome.replaceChildren(h('div', { class: 'afi-result' }, t('afi.lab.running')));
    analysisBtn.disabled = true;
    const m = metrics(editable().flatMap((s) => s.cols), wires);
    afiStore.addRun({ id: Date.now().toString(36), at: Date.now(), levelId: def.id, kind: 'single', seed: night.seed, program: p, pass: night.pass, fidelity: night.fidelity, noise: noiseText(L.noise), noiseSpec: bench ? L.noise : undefined, input: night.input, errors: night.errors, ...m });
    renderScore();
    seek(0);
    if (api.reduced()) seek(steps.length - 1); else togglePlay();
  }
  function stopPlayback() { if (timer) { clearInterval(timer); timer = 0; } }

  let chart: { update(i: never): void; destroy(): void } | null = null;
  async function runMany() {
    if (running) return;
    const bl = blockers(); if (bl.length) { api.toast(t(bl[0].key, bl[0].vars), 'err'); return; }
    const N = Math.max(10, Math.min(100000, Math.floor(Number(nIn.value) || 500)));
    const seed = seedVal(), L = runLevel(), p = prog();
    abort.aborted = false; setBusy(true);
    const pts: AfiChartPoint[] = [];
    const input = (series: AfiChartPoint[]) => ({ kind: 'mc' as const, series: [{ label: t('afi.chart.ler'), points: series }], xLabel: t('afi.chart.trials'), yLabel: t('afi.chart.ler'), reducedMotion: api.reduced() });
    chart?.destroy(); chart = null;
    const ch = await mountChart(chartHost, input(pts)); chart = ch as never;
    let lastAt = 0;
    const r = await monteCarlo(L, p, N, seed, (d, f) => {
      outcome.replaceChildren(h('div', { class: 'afi-result' }, t('afi.lab.mcProgress', { d, n: N, f })));
      if (d - lastAt >= Math.max(25, N / 40) || d === N) { lastAt = d; const ci = wilson(f, d); pts.push({ x: d, y: f / d, lo: ci[0], hi: ci[1], n: d }); ch.update(input([...pts])); }
    }, abort);
    setBusy(false);
    if (dead) return;
    lastMc = r;
    outcome.replaceChildren(
      h('div', { class: 'afi-result' }, t('afi.lab.mcResult', { rate: r.rate.toFixed(4), lo: r.ci95[0].toFixed(4), hi: r.ci95[1].toFixed(4), n: r.trials, f: r.failures })),
      h('div', { class: 'afi-caption' }, t('afi.lab.mcCaption', { seed: r.seed })));
    afiStore.addRun({ id: Date.now().toString(36), at: Date.now(), levelId: def.id, kind: 'mc', seed, program: p, mc: r, noise: noiseText(L.noise), noiseSpec: bench ? L.noise : undefined, ...metrics(editable().flatMap((s) => s.cols), wires) });
    renderScore();
  }
  async function verify() {
    if (running || bench) return;
    const bl = blockers(); if (bl.length) { api.toast(t(bl[0].key, bl[0].vars), 'err'); return; }
    setBusy(true);
    outcome.replaceChildren(h('div', { class: 'afi-result' }, t('afi.lab.verifying')));
    await new Promise((r) => setTimeout(r, 30));
    const rep = testLevel(def, prog(), seedVal());
    setBusy(false);
    if (dead) return;
    const nPass = rep.nights.filter((n) => n.pass).length;
    outcome.replaceChildren(
      h('div', { class: `afi-result ${rep.passed ? 'ok' : 'err'}` }, rep.passed ? t('afi.lab.verified') : t('afi.lab.notVerified'), ` · ${nPass}/${rep.nights.length}`),
      h('div', { class: 'afi-caption' }, def.goal.kind === 'rate' ? t('afi.goal.statRate') : t('afi.goal.statExhaustive')));
    if (rep.passed && !afiStore.completed()[def.id]) { afiStore.complete(def.id); api.toast(t('afi.lab.completed', { id: def.id }), 'ok'); }
    if (rep.passed) {
      const all = api.modules.flatMap((m) => m.levels); const i = all.findIndex((l) => l.def.id === def.id);
      const nx = all[i + 1];
      if (nx) outcome.appendChild(h('button', { class: 'afi-btn small', onclick: () => api.go('briefing', nx.def.id) }, t('afi.lab.next', { id: nx.def.id })));
    }
  }
  function loadReference() {
    const next = current.map((s) => (s.locked ? s : { ...s, cols: fromProgramMapped(def.solution[s.phase] ?? [], wires).cols }));
    editor.setSegments(next); changed(next);
  }
  async function copyCircuit(fmt: 'qiskit' | 'qasm3') {
    const L = runLevel(), p = prog();
    const night = lastNight && lastProg && JSON.stringify(lastProg) === JSON.stringify(p) ? lastNight : (() => { const c = trialCase(L, seedVal(), 0); return quantum.runNight(L, p, c.input, c.errors, c.seed); })();
    api.toast((await copy(circuitText(fmt, L, night, p))) ? t('afi.common.copied') : t('afi.common.copyFailed'));
  }
  function openAnalysis() {
    if (!lastNight || !lastProg) return;
    const a: AnalysisArg = { levelId: def.id, bench, night: lastNight, prog: lastProg, level: runLevel(), segs: current, pcMap };
    api.go('analysis', a);
  }

  // ───── bench panel ─────
  function benchPanel(): HTMLElement {
    const sel = h('select', { 'aria-label': t('afi.bench.base') }, openLevels.map((l) => h('option', { value: l.def.id, selected: l.def.id === levelId }, `${l.meta.id} · ${l.def.id} ${t(l.def.title)}`))) as HTMLSelectElement;
    sel.addEventListener('change', () => { afiStore.setSettings({ benchLevel: sel.value }); api.go('bench'); });
    const kinds = (['flip', 'phase', 'both'] as GremlinKind[]).map((kd) => {
      const id = `afi-bk-${kd}`;
      const cb = h('input', { type: 'checkbox', id, checked: benchNoise.kinds.includes(kd) }) as HTMLInputElement;
      cb.addEventListener('change', () => { benchNoise.kinds = (['flip', 'phase', 'both'] as GremlinKind[]).filter((x) => (document.getElementById(`afi-bk-${x}`) as HTMLInputElement)?.checked); if (!benchNoise.kinds.length) { benchNoise.kinds = [kd]; cb.checked = true; } renderScore(); });
      return h('span', { class: 'afi-inline' }, cb, h('label', { for: id }, t(`afi.noise.kind.${kd}`)));
    });
    const pIn = h('input', { type: 'number', step: 0.01, min: 0, max: 1, value: benchNoise.p, class: 'mono afi-n', 'aria-label': t('afi.bench.p') }) as HTMLInputElement;
    pIn.addEventListener('change', () => { benchNoise.p = Math.max(0, Math.min(1, Number(pIn.value) || 0)); renderScore(); });
    const psIn = h('input', { type: 'text', value: benchNoise.ps, class: 'mono afi-ps', 'aria-label': t('afi.bench.sweep') }) as HTMLInputElement;
    const trIn = h('input', { type: 'number', min: 20, step: 20, value: benchNoise.trials, class: 'mono afi-n', 'aria-label': t('afi.bench.trialsPer') }) as HTMLInputElement;
    const sweepHost = h('div', { class: 'afi-sweep-chart' });
    const sweepBtn = h('button', { class: 'afi-btn small', onclick: () => void sweep() }, t('afi.bench.runSweep')) as HTMLButtonElement;
    async function sweep() {
      if (running) return;
      const bl = blockers(); if (bl.length) { api.toast(t(bl[0].key, bl[0].vars), 'err'); return; }
      const ps = psIn.value.split(/[\s,;]+/).map(Number).filter((x) => Number.isFinite(x) && x >= 0 && x <= 1).sort((a, b) => a - b);
      const trials = Math.max(20, Math.floor(Number(trIn.value) || 400));
      if (!ps.length) return;
      const seed = seedVal(), p0 = prog();
      abort.aborted = false; setBusy(true); sweepBtn.disabled = true;
      const pts: AfiChartPoint[] = [];
      const inp = () => ({ kind: 'sweep' as const, series: [{ label: t('afi.chart.ler'), points: [...pts] }], xLabel: t('afi.chart.p'), yLabel: t('afi.chart.ler'), reducedMotion: api.reduced() });
      sweepHost.replaceChildren();
      const ch = await mountChart(sweepHost, inp());
      const out: { p: number; mc: McResult }[] = [];
      for (const p of ps) {
        if (abort.aborted || dead) break;
        outcome.replaceChildren(h('div', { class: 'afi-result' }, t('afi.bench.sweeping', { p })));
        const r = await monteCarlo(withNoise(def, p, benchNoise.kinds), p0, trials, seed, undefined, abort);
        out.push({ p, mc: r }); pts.push({ x: p, y: r.rate, lo: r.ci95[0], hi: r.ci95[1], n: r.trials }); ch.update(inp());
      }
      setBusy(false); sweepBtn.disabled = false;
      if (dead) return;
      outcome.replaceChildren(h('div', { class: 'afi-result' }, t('afi.bench.sweepDone', { n: out.length })), h('div', { class: 'afi-caption' }, t('afi.bench.sweepCaption')));
      afiStore.addRun({ id: Date.now().toString(36), at: Date.now(), levelId: def.id, kind: 'sweep', seed, program: p0, sweep: out, noise: benchNoise.kinds.join('+'), ...metrics(editable().flatMap((s) => s.cols), wires) });
    }
    return h('section', { class: 'afi-bench', 'aria-label': t('afi.bench.title') },
      h('div', { class: 'afi-panel-head' }, h('span', null, t('afi.bench.title'))),
      h('div', { class: 'afi-bench-row' }, h('label', null, t('afi.bench.base')), sel),
      h('div', { class: 'afi-bench-row' }, h('span', null, t('afi.bench.noise')), ...kinds),
      h('div', { class: 'afi-bench-row' }, h('label', null, t('afi.bench.p')), pIn),
      h('div', { class: 'afi-bench-row' }, h('label', null, t('afi.bench.sweep')), psIn, h('label', null, t('afi.bench.trialsPer')), trIn, sweepBtn),
      sweepHost,
      h('p', { class: 'afi-caption' }, t('afi.bench.locked')));
  }

  renderScore();
  changed(current);
  // keyboard: R = run, Shift+R = run N (when focus is not in a text field)
  const onKey = (e: KeyboardEvent) => {
    const tg = e.target as HTMLElement;
    if (tg.closest('textarea, input, select')) return;
    if (e.key === 'F5' || (e.key.toLowerCase() === 'r' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); void (e.shiftKey ? runMany() : runOnce()); }
    if (steps.length && (e.key === '.' || e.key === ',')) { seek(k + (e.key === '.' ? 1 : -1)); }
  };
  window.addEventListener('keydown', onKey);
  return () => { dead = true; abort.aborted = true; stopPlayback(); window.removeEventListener('keydown', onKey); editor.destroy(); text.destroy(); veilHandle?.destroy(); chart?.destroy(); };
};

export type { Program };
