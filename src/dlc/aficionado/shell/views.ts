/** Shell views: orientation, module map, briefing, archive, settings. (Lab/Bench: lab.ts; analysis: analysis.ts) */
import type { GoalSpec, LevelDef, NoiseSpec } from '../../../core/contracts';
import { h } from '../../../engine/util';
import { gateHelp, gateName, stageName } from '../state/names';
import { t, has } from '../../../i18n/index';
import { runNight } from '../../../quantum/index';
import { paletteFor } from '../editor/model';
import { availableLocales } from '../state/content';
import { curriculum, moduleDone, moduleOpen } from '../state/levels';
import { wilson } from '../state/mc';
import { afiStore, type AfiRun } from '../state/store';
import type { AfiLevel } from '../contracts';
import type { View } from './api';
import { circuitText, copy, download, runsCsv } from './exporting';
import { orientation } from './vizHost';

const THEMES = Object.keys(import.meta.glob('../theme/*.css')).map((p) => p.replace(/^.*\/([\w-]+)\.css$/, '$1')).filter((n) => n !== 'tokens');

/** text for a key, or '' when the content pack doesn't have it (optional prose) */
const opt = (k: string, v?: Record<string, string | number>): string => (has(k) ? t(k, v) : '');

// ───────────── orientation (first entry) ─────────────
export const orientationView: View = (el, api) => {
  let dead = false, handle: { skip(): void; destroy(): void } | null = null;
  const stage = h('div', { class: 'afi-orient' });
  const skip = h('button', { class: 'afi-btn ghost afi-orient-skip' }, t('afi.orient.skip'));
  el.append(stage, skip);
  const finish = () => { if (dead) return; dead = true; afiStore.setFlag('oriented'); api.go('map'); };
  skip.addEventListener('click', () => { handle?.skip(); finish(); });
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') skip.click(); };
  window.addEventListener('keydown', onKey);
  skip.focus();
  void orientation().then((play) => {
    if (dead) return;
    if (play) {
      try {
        const o = play(stage, { reducedMotion: api.reduced(), webgl: api.webgl() });
        handle = o; o.done.then(finish, finish); return;
      } catch (e) { console.warn('[afi] orientation failed', e); }
    }
    // plain fallback: a static, captioned composition
    stage.append(
      h('div', { class: 'afi-orient-fb' },
        h('div', { class: 'afi-orient-ket mono' }, '|ψ⟩ ∈ ℂ²  →  ℂ^(2ⁿ)'),
        h('p', { class: 'afi-orient-line' }, t('afi.orient.line1')),
        h('p', { class: 'afi-orient-line' }, t('afi.orient.line2')),
        h('p', { class: 'afi-caption' }, t('afi.orient.metaphor')),
        h('button', { class: 'afi-btn', onclick: finish }, t('afi.orient.enter'))),
    );
  });
  return () => { dead = true; window.removeEventListener('keydown', onKey); handle?.destroy(); };
};

// ───────────── module map ─────────────
export const mapView: View = (el, api) => {
  const done = afiStore.completed();
  const judge = api.judge();
  const grid = h('div', { class: 'afi-map-grid', role: 'list' });
  for (const m of api.modules) {
    const open = moduleOpen(m, api.modules, done, judge);
    const complete = moduleDone(m, done);
    const nDone = m.levels.filter((l) => done[l.def.id]).length;
    const code = m.meta.code;
    const req = (m.meta.requires ?? []).map((r) => (has(`afi.map.prereq.${r}`) ? t(`afi.map.prereq.${r}`) : r)).join(t('afi.map.and'));
    const card = h('section', { class: `afi-mod ${open ? 'open' : 'locked'} ${complete ? 'done' : ''}`, role: 'listitem', 'aria-label': `${m.id} ${t(`afi.modules.${m.id}.title`)}` },
      h('div', { class: 'afi-mod-head' },
        h('span', { class: 'afi-mod-id mono' }, m.id),
        h('span', { class: 'afi-mod-state' }, complete ? t('afi.map.done') : open ? (nDone ? t('afi.map.inProgress', { done: nDone, total: m.levels.length }) : t('afi.map.open')) : t('afi.map.locked'))),
      h('h2', { class: 'afi-mod-title' }, t(`afi.modules.${m.id}.title`)),
      code && h('div', { class: 'afi-mod-code mono' }, `[[${code.n},${code.k},${code.d}]] ${code.name}`),
      h('p', { class: 'afi-mod-sum' }, open ? opt(`afi.modules.${m.id}.summary`) : opt(`afi.map.teasers.${m.id}`)),
      open ? h('div', { class: 'afi-mod-levels' }, m.levels.map((l) =>
        h('button', { class: `afi-lvl ${done[l.def.id] ? 'done' : ''}`, onclick: () => api.go('briefing', l.def.id) },
          h('span', { class: 'mono' }, l.def.id), ' ', t(l.def.title), done[l.def.id] ? ' ✓' : '')))
        : h('div', { class: 'afi-mod-req muted' }, t('afi.map.requires', { list: req })),
    );
    grid.appendChild(card);
  }
  const extra = (view: 'bench' | 'archive') => h('button', { class: 'afi-mod extra', onclick: () => api.go(view) },
    h('h2', { class: 'afi-mod-title' }, t(`afi.map.${view}`)), h('p', { class: 'afi-mod-sum' }, t(`afi.map.${view}Subtitle`)));
  grid.append(extra('bench'), extra('archive'));
  el.append(
    h('div', { class: 'afi-view-head' },
      h('h1', null, t('afi.map.title')),
      h('p', { class: 'muted' }, t('afi.map.sub')),
      judge && h('p', { class: 'afi-tag' }, t('afi.map.judge')),
      api.fallbackLevels && h('p', { class: 'afi-tag warn' }, t('afi.map.fallback'))),
    grid,
  );
  (grid.querySelector('button') as HTMLElement | null)?.focus();
};

// ───────────── briefing ─────────────
export function noiseText(n: NoiseSpec): string {
  const kinds = (ks: string[]) => ks.map((k) => t(`afi.noise.kind.${k}`)).join(', ');
  switch (n.mode) {
    case 'none': return t('afi.noise.none');
    case 'fixed': return t('afi.noise.fixed', { list: n.errors.map((e) => `${t(`afi.noise.kind.${e.kind}`)}(${e.t})`).join(', ') });
    case 'enumerate': return t('afi.noise.enumerate', { kinds: kinds(n.kinds), max: n.maxErrors, targets: (n.targets ?? []).join(' ') || t('afi.noise.allData') });
    case 'random': return t('afi.noise.random', { p: n.p, kinds: kinds(n.kinds) });
  }
}
export function goalText(g: GoalSpec, L: LevelDef): string {
  switch (g.kind) {
    case 'state': case 'state+report': return t('afi.goal.state', { f: g.minFidelity ?? 0.999, data: g.dataQubits.join(' ') }) + (g.kind === 'state+report' ? ' ' + t('afi.goal.report', { bot: g.report.bot, of: g.report.of.join(' ') }) : '');
    case 'rate': {
      const [lo, hi] = wilson(Math.round((1 - g.minRate) * g.nights), g.nights);
      return t('afi.goal.rate', { rate: g.minRate, n: g.nights, f: g.minFidelity ?? 0.99, lo: lo.toFixed(3), hi: hi.toFixed(3) });
    }
    case 'classical': return t('afi.goal.classical');
  }
  void L; return '';
}
function statText(L: LevelDef): string {
  if (L.goal.kind === 'rate') return t('afi.goal.statRate');
  return L.noise.mode === 'random' ? t('afi.goal.statRandom') : t('afi.goal.statExhaustive');
}

export const briefingView: View = (el, api, arg) => {
  const lv = api.level(String(arg));
  if (!lv) { api.go('map'); return; }
  const L = lv.def, meta = lv.meta;
  const ex = `afi.modules.${meta.id}.ex.${L.id}`;
  const authored = has(`${ex}.briefing.objective`);
  let vars: Record<string, string | number> = {};
  try { vars = curriculum()?.criterionVars?.(L) ?? {}; } catch { /* fallback copy below */ }
  const row = (k: string, v: Node | string | false | null | undefined) => v ? h('div', { class: 'afi-brief-row' }, h('dt', null, t(k)), h('dd', null, v)) : null;
  const authoredRow = (label: string, field: string) => (has(`${ex}.briefing.${field}`) ? row(label, t(`${ex}.briefing.${field}`, vars)) : null);
  el.append(
    h('article', { class: 'afi-brief paper' },
      h('header', null,
        h('div', { class: 'mono afi-brief-id' }, `${meta.id} · ${L.id}`),
        h('h1', null, t(L.title)),
        L.subtitle && h('p', { class: 'afi-brief-lead' }, t(L.subtitle))),
      h('dl', null,
        authored ? authoredRow('afi.ui.briefing.objective', 'objective') : row('afi.ui.briefing.objective', opt(`afi.modules.${meta.id}.summary`)),
        authored && authoredRow('afi.ui.briefing.context', 'context'),
        authored ? authoredRow('afi.brief.code', 'code') : row('afi.brief.code', meta.code ? h('span', { class: 'mono' }, `[[${meta.code.n},${meta.code.k},${meta.code.d}]] ${meta.code.name}`) : null),
        !authored && row('afi.brief.stabilizers', meta.stabilizers?.length ? h('span', { class: 'mono' }, meta.stabilizers.join(' · ')) : null),
        row('afi.brief.registers', h('span', { class: 'mono' }, `${t('afi.brief.data')}: ${L.qubbles.map((q) => q.id).join(' ')}${L.bots.length ? ` · ${t('afi.brief.ancilla')}: ${L.bots.map((b) => b.id).join(' ')}` : ''}`)),
        row('afi.brief.input', h('span', { class: 'mono' }, `${L.inputQubble} ← ${L.inputs.map((i) => (typeof i === 'string' ? t(`afi.input.${i}`) : `θ=${i.theta.toFixed(2)}, φ=${i.phi.toFixed(2)}`)).join(', ')}`)),
        row('afi.brief.stages', [L.fixedBedtime?.length ? `${stageName('bedtime')} (${t('afi.editor.fixed')})` : '', L.editable.includes('bedtime') ? stageName('bedtime') : '', L.editable.includes('morning') ? stageName('morning') : ''].filter(Boolean).join(' → ')),
        authored ? authoredRow('afi.brief.noise', 'noise') : row('afi.brief.noise', noiseText(L.noise)),
        authored ? authoredRow('afi.brief.gates', 'gates') : row('afi.brief.gates', h('span', { class: 'mono' }, paletteFor(L).map((g) => gateName(g)).join(' · '))),
        authored ? authoredRow('afi.brief.success', 'criterion') : row('afi.brief.success', goalText(L.goal, L)),
        row('afi.brief.stats', statText(L)),
        row('afi.ui.briefing.objectives', meta.objectives.length ? h('ul', null, meta.objectives.map((o) => h('li', null, t(o)))) : null),
      ),
      h('footer', null,
        h('button', { class: 'afi-btn', onclick: () => api.go('lab', L.id) }, t('afi.brief.openLab')),
        h('button', { class: 'afi-btn ghost', onclick: () => window.print() }, t('afi.ui.print')),
        h('button', { class: 'afi-btn ghost', onclick: () => api.go('map') }, t('afi.common.back'))),
    ),
  );
  (el.querySelector('footer .afi-btn') as HTMLElement)?.focus();
};

// ───────────── archive ─────────────
export const archiveView: View = (el, api) => {
  const runs = afiStore.runs();
  const exportsFor = (r: AfiRun) => {
    const lv = api.level(r.levelId);
    const out: HTMLElement[] = [h('button', { class: 'afi-btn small ghost', onclick: () => download(`afi-run-${r.id}.json`, JSON.stringify(r, null, 2), 'application/json') }, 'JSON')];
    if (lv && r.kind === 'single' && r.input) {
      const night = () => runNight(r.noiseSpec ? { ...lv.def, noise: r.noiseSpec } : lv.def, r.program, r.input!, r.errors ?? [], r.seed);
      for (const fmt of ['qiskit', 'qasm3'] as const) {
        out.push(h('button', { class: 'afi-btn small ghost', onclick: () => download(`afi-run-${r.id}.${fmt === 'qiskit' ? 'py' : 'qasm'}`, circuitText(fmt, lv.def, night(), r.program)) }, t(`afi.export.${fmt}`)));
      }
    }
    return out;
  };
  const table = h('table', { class: 'afi-table' },
    h('thead', null, h('tr', null, ['time', 'level', 'kind', 'seed', 'result', 'gates', 'depth', 'ancillas', 'export'].map((k) => h('th', null, t(`afi.archive.col.${k}`))))),
    h('tbody', null, runs.map((r) => h('tr', null,
      h('td', null, new Date(r.at).toLocaleString()),
      h('td', { class: 'mono' }, r.levelId),
      h('td', null, t(`afi.archive.kind.${r.kind}`)),
      h('td', { class: 'mono' }, String(r.seed)),
      h('td', { class: 'mono' }, r.mc ? `${r.mc.rate.toFixed(4)} [${r.mc.ci95[0].toFixed(4)}, ${r.mc.ci95[1].toFixed(4)}] n=${r.mc.trials}` : r.sweep ? t('afi.archive.sweepPts', { n: r.sweep.length }) : r.pass != null ? `${r.pass ? t('afi.lab.pass') : t('afi.lab.fail')} F=${(r.fidelity ?? 0).toFixed(4)}` : ''),
      h('td', { class: 'mono' }, String(r.gates)), h('td', { class: 'mono' }, String(r.depth)), h('td', { class: 'mono' }, String(r.ancillas)),
      h('td', { class: 'afi-row-acts' }, exportsFor(r))))));
  el.append(
    h('div', { class: 'afi-view-head' },
      h('h1', null, t('afi.archive.title')),
      h('p', { class: 'muted' }, t('afi.archive.sub')),
      h('div', { class: 'afi-row-acts' },
        h('button', { class: 'afi-btn small', disabled: !runs.length, onclick: () => download('afi-runs.csv', runsCsv(runs), 'text/csv') }, t('afi.export.csv')),
        h('button', { class: 'afi-btn small ghost', disabled: !runs.length, onclick: () => download('afi-runs.json', JSON.stringify(runs, null, 2), 'application/json') }, t('afi.export.json')),
        h('button', { class: 'afi-btn small ghost', disabled: !runs.length, onclick: async () => { api.toast((await copy(runsCsv(runs))) ? t('afi.common.copied') : t('afi.common.copyFailed')); } }, t('afi.export.copyCsv')),
        h('button', { class: 'afi-btn small ghost danger', disabled: !runs.length, onclick: () => { if (confirm(t('afi.archive.clearConfirm'))) { afiStore.clearRuns(); api.go('archive'); } } }, t('afi.archive.clear')))),
    runs.length ? h('div', { class: 'afi-table-wrap' }, table) : h('p', { class: 'muted afi-empty' }, t('afi.archive.empty')),
  );
};

// ───────────── settings ─────────────
export const settingsView: View = (el, api) => {
  const s = afiStore.settings();
  const set = (p: Parameters<typeof afiStore.setSettings>[0]) => { afiStore.setSettings(p); api.applySettings(); };
  const toggle = (key: 'lecture' | 'webgl' | 'skipLoader', label: string, help: string) => {
    const id = `afi-set-${key}`;
    const inp = h('input', { type: 'checkbox', id, checked: !!s[key] }) as HTMLInputElement;
    inp.addEventListener('change', () => set({ [key]: inp.checked }));
    return h('div', { class: 'afi-set-row' }, inp, h('label', { for: id }, t(label)), h('p', { class: 'muted' }, t(help)));
  };
  const select = (id: string, label: string, options: [string, string][], value: string, on: (v: string) => void) => {
    const sel = h('select', { id }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l))) as HTMLSelectElement;
    sel.addEventListener('change', () => on(sel.value));
    return h('div', { class: 'afi-set-row' }, h('label', { for: id }, t(label)), sel);
  };
  const locales = availableLocales();
  el.append(
    h('div', { class: 'afi-view-head' }, h('h1', null, t('afi.settings.title'))),
    h('form', { class: 'afi-settings', onsubmit: (e: Event) => e.preventDefault() },
      select('afi-set-locale', 'afi.settings.locale', (locales.length ? locales : ['en']).map((l) => [l, l]), s.locale, (v) => { set({ locale: v }); api.toast(t('afi.settings.reloadNote')); }),
      select('afi-set-theme', 'afi.settings.theme', [['default', t('afi.settings.themeDefault')], ...THEMES.map((n) => [n, n] as [string, string])], s.theme, (v) => set({ theme: v })),
      toggle('lecture', 'afi.settings.lecture', 'afi.settings.lectureHelp'),
      select('afi-set-motion', 'afi.settings.motion', [['auto', t('afi.settings.motionAuto')], ['on', t('afi.settings.motionReduced')], ['off', t('afi.settings.motionFull')]],
        s.reducedMotion == null ? 'auto' : s.reducedMotion ? 'on' : 'off', (v) => set({ reducedMotion: v === 'auto' ? null : v === 'on' })),
      toggle('webgl', 'afi.settings.webgl', 'afi.settings.webglHelp'),
      toggle('skipLoader', 'afi.settings.skipLoader', 'afi.settings.skipLoaderHelp'),
      h('div', { class: 'afi-set-row' },
        h('button', { class: 'afi-btn ghost', type: 'button', onclick: () => api.go('orientation') }, t('afi.settings.replayOrientation')),
        h('button', { class: 'afi-btn ghost danger', type: 'button', onclick: () => { if (confirm(t('afi.settings.resetConfirm'))) { try { Object.keys(localStorage).filter((k) => k.startsWith('np.afi.')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } api.applySettings(); api.go('map'); } } }, t('afi.settings.reset'))),
    ),
  );
};

export type { AfiLevel };
