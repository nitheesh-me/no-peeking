/**
 * Post-run analysis: the veil lifts into the simulator-oracle view (amplitudes, reduced states,
 * stabilizer expectations, lattice), scrubbable over the night's trace. The noise events that were
 * hidden during execution are revealed here. Every oracle panel carries the honesty caption.
 */
import type { NerdInfo, TraceEvent } from '../../../core/contracts';
import { h } from '../../../engine/util';
import { has, t } from '../../../i18n/index';
import type { AfiVizHandle, AfiVizInput } from '../state/vizApi';
import type { View } from './api';
import { circuitText, copy, download } from './exporting';
import type { AnalysisArg } from './lab';
import { mountOracle, type OracleKind } from './vizHost';

function evText(ev: TraceEvent): string {
  switch (ev.k) {
    case 'phase': return t(`afi.record.phase.${ev.phase}`);
    case 'line': return '';
    case 'gate': case 'xgate': return t('afi.trace.gate', { g: t(`afi.op.${ev.op}`), q: ev.from ? `${ev.from} → ${ev.t}` : ev.t });
    case 'measure': return t('afi.record.measure', { q: ev.t, b: ev.result }) + (ev.flipped ? ` · ${t('afi.trace.readoutFlip')}` : '');
    case 'jump': return ev.taken ? t('afi.record.branch') : '';
    case 'noise': return t('afi.trace.noise', { e: ev.e.kind === 'wobble' ? `R${ev.e.axis}(${ev.e.angle.toFixed(2)})` : t(`afi.noise.kind.${ev.e.kind}`), q: ev.e.t });
    case 'end': return t(`afi.record.end.${ev.reason}`);
    default: return '';
  }
}

export const analysisView: View = (el, api, arg) => {
  const a = arg as AnalysisArg | undefined;
  const lv = a && api.level(a.levelId);
  if (!a || !lv) { api.go('map'); return; }
  const n = a.night;
  const steps = n.steps.filter((s) => s.snap.nerd);
  const nerds: NerdInfo[] = steps.map((s) => s.snap.nerd!);
  if (!nerds.length) { api.go('lab', a.levelId); return; }
  let idx = nerds.length - 1;
  const layers = api.layers(lv);
  const kinds: OracleKind[] = ['stateSpace'];
  if (layers.includes('bloch')) kinds.push('blochField');
  if (layers.includes('stabilizer-tiling')) kinds.push('stabilizerTiling');
  // the lattice is the surface-code finale view: only for a lattice code, once earned
  if (layers.includes('lattice') && (lv.meta.unlocks?.includes('lattice') || /surface/i.test(lv.meta.code?.name ?? ''))) kinds.push('lattice');
  const input = (veiled = false): AfiVizInput => ({ nerd: nerds[idx], steps: nerds, stepIndex: idx, level: a.level, meta: lv.meta, layers, webgl: api.webgl(), reducedMotion: api.reduced(), veiled });

  const back = h('button', { class: 'afi-btn small ghost', onclick: () => api.go(a.bench ? 'bench' : 'lab', a.levelId) }, t('afi.analysis.back'));
  const exp = (fmt: 'qiskit' | 'qasm3') => h('button', { class: 'afi-btn small ghost', onclick: () => download(`afi-${a.levelId}-${n.seed}.${fmt === 'qiskit' ? 'py' : 'qasm'}`, circuitText(fmt, a.level, n, a.prog)) }, t(`afi.export.${fmt}`));
  const cp = (fmt: 'qiskit' | 'qasm3') => h('button', { class: 'afi-btn small ghost', onclick: async () => api.toast((await copy(circuitText(fmt, a.level, n, a.prog))) ? t('afi.common.copied') : t('afi.common.copyFailed')) }, t(fmt === 'qiskit' ? 'afi.export.copyQiskit' : 'afi.export.copyQasm3'));
  const json = h('button', { class: 'afi-btn small ghost', onclick: () => download(`afi-${a.levelId}-${n.seed}.json`, JSON.stringify({ level: a.levelId, seed: n.seed, input: n.input, errors: n.errors, pass: n.pass, fidelity: n.fidelity, failReason: n.failReason, program: a.prog, record: nerds[nerds.length - 1].record }, null, 2), 'application/json') }, t('afi.export.json'));
  const scrub = h('input', { type: 'range', min: 0, max: nerds.length - 1, value: idx, class: 'afi-scrub', 'aria-label': t('afi.analysis.scrub') }) as HTMLInputElement;
  const stepLbl = h('span', { class: 'mono afi-step' });
  const events = h('ol', { class: 'afi-trace mono' });
  const panels = h('div', { class: `afi-oracle-grid n${kinds.length}` });
  const summary = h('div', { class: 'afi-analysis-sum mono' },
    h('span', { class: `afi-result ${n.pass ? 'ok' : 'err'}` }, n.pass ? t('afi.lab.pass') : t('afi.lab.fail')),
    h('span', null, `F = ${n.fidelity.toFixed(6)}`),
    h('span', null, `${t('afi.score.nightSeed')} ${n.seed}`),
    h('span', null, `${t('afi.analysis.input')} ${typeof n.input === 'string' ? t(`afi.input.${n.input}`) : `θ=${n.input.theta.toFixed(3)} φ=${n.input.phi.toFixed(3)}`}`),
    h('span', null, `${t('afi.analysis.errors')} ${n.errors.length ? n.errors.map((e) => `${t(`afi.noise.kind.${e.kind}`)}(${e.t})`).join(', ') : t('afi.analysis.noErrors')}`));
  const root = h('div', { class: 'afi-analysis veiled' },
    h('div', { class: 'afi-lab-bar' }, back, h('div', { class: 'afi-lab-title' }, h('span', { class: 'mono' }, `${lv.meta.id} · ${a.levelId}`), ' ', t('afi.analysis.title')),
      h('div', { class: 'afi-row-acts' }, exp('qiskit'), exp('qasm3'), cp('qiskit'), cp('qasm3'), json)),
    summary,
    h('p', { class: 'afi-analysis-note' }, [`afi.modules.${lv.meta.id}.analysis.oracle`, 'afi.oracle.explain'].filter(has).map((k) => t(k)).slice(0, 2).join(' ')),
    h('div', { class: 'afi-analysis-body' },
      h('aside', { class: 'afi-analysis-trace' }, h('div', { class: 'afi-panel-head' }, h('span', null, t('afi.analysis.trace')), h('span', { class: 'afi-tag' }, t('afi.analysis.noiseRevealed'))), events),
      h('div', { class: 'afi-analysis-main' }, h('div', { class: 'afi-scrub-row' }, scrub, stepLbl), panels)));
  el.appendChild(root);

  const handles: AfiVizHandle[] = [];
  let dead = false;
  for (const kd of kinds) {
    const host = h('div', { class: 'afi-oracle-host' });
    const name = { stateSpace: 'afi.oracle.stateSpace', blochField: 'afi.viz.layers.bloch', stabilizerTiling: 'afi.viz.layers.stabilizer-tiling', lattice: 'afi.viz.layers.lattice' }[kd];
    const legend = { stateSpace: 'afi.viz.legend.pillars', blochField: 'afi.viz.legend.bloch', stabilizerTiling: 'afi.viz.legend.tiling', lattice: 'afi.viz.legend.lattice' }[kd];
    panels.appendChild(h('figure', { class: `afi-oracle-panel k-${kd}` },
      h('figcaption', null, h('span', { class: 'afi-oracle-name' }, t(name)), h('span', { class: 'afi-caption afi-oracle' }, t('afi.oracle.caption'))),
      host,
      has(legend) && h('p', { class: 'afi-legend' }, t(legend))));
    void mountOracle(kd, host, input()).then((hd) => { if (dead) hd.destroy(); else handles.push(hd); });
  }
  const render = () => {
    stepLbl.textContent = t('afi.lab.stepOf', { k: idx + 1, n: nerds.length });
    const ev = steps[idx].ev;
    events.querySelectorAll('li').forEach((li) => li.classList.toggle('cur', Number(li.dataset.i) === idx));
    void ev;
    handles.forEach((hd) => hd.update(input()));
  };
  steps.forEach((s, i) => {
    const txt = evText(s.ev); if (!txt) return;
    const li = h('li', { class: `ev k-${s.ev.k}`, 'data-i': i, tabindex: 0 }, txt);
    li.addEventListener('click', () => { idx = i; scrub.value = String(i); render(); });
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') li.click(); });
    events.appendChild(li);
  });
  scrub.addEventListener('input', () => { idx = Number(scrub.value); render(); });
  render();
  // the veil lifts (slow fade; instant under reduced motion)
  requestAnimationFrame(() => setTimeout(() => root.classList.remove('veiled'), api.reduced() ? 0 : 60));
  scrub.focus();
  return () => { dead = true; handles.forEach((hd) => hd.destroy()); };
};
