/**
 * The DLC app shell: header navigation + view routing (orientation, module map, briefing, lab,
 * post-run analysis, bench, archive, settings). Views render into one main region.
 */
import { t } from '../../../i18n/index';
import type { AfiLevel, AfiVizLayer, DlcContext } from '../contracts';
import type { LoadResult } from '../loader/index';
import { moduleDone } from '../state/levels';
import { afiStore } from '../state/store';
import type { ShellApi, View, ViewName } from './api';
import { archiveView, briefingView, mapView, orientationView, settingsView } from './views';
import { labView } from './lab';
import { analysisView } from './analysis';

const VIEWS: Record<ViewName, View> = {
  orientation: orientationView, map: mapView, briefing: briefingView, lab: labView,
  analysis: analysisView, bench: (el, api) => labView(el, api, { bench: true }), archive: archiveView, settings: settingsView,
};
const NAV: ViewName[] = ['map', 'bench', 'archive', 'settings'];
const ALL_LAYERS: AfiVizLayer[] = ['bloch', 'filaments', 'stabilizer-tiling', 'projection-freeze', 'concatenation', 'lattice', 'threshold'];

export function createShell(host: HTMLElement, ctx: DlcContext, load: LoadResult): { destroy(): void } {
  const shell = document.createElement('div'); shell.className = 'afi-shell';
  const header = document.createElement('header'); header.className = 'afi-header';
  const main = document.createElement('main'); main.className = 'afi-main'; main.tabIndex = -1;
  const toasts = document.createElement('div'); toasts.className = 'afi-toasts'; toasts.setAttribute('aria-live', 'polite');
  shell.append(header, main, toasts);
  host.appendChild(shell);

  const mark = document.createElement('div'); mark.className = 'afi-wordmark'; mark.textContent = t('afi.loader.wordmark');
  const nav = document.createElement('nav'); nav.className = 'afi-nav'; nav.setAttribute('aria-label', t('afi.shell.navLabel'));
  const navBtns = new Map<ViewName, HTMLButtonElement>();
  for (const v of NAV) {
    const b = document.createElement('button'); b.className = 'afi-nav-btn'; b.textContent = t(`afi.shell.nav.${v}`);
    b.addEventListener('click', () => api.go(v)); nav.appendChild(b); navBtns.set(v, b);
  }
  const exit = document.createElement('button'); exit.className = 'afi-nav-btn exit'; exit.textContent = t('afi.shell.exit'); exit.title = t('afi.shell.exitHelp');
  exit.addEventListener('click', () => ctx.exit());
  header.append(mark, nav, exit);

  let cleanup: (() => void) | void;
  const api: ShellApi = {
    ctx, modules: load.modules, fallbackLevels: load.fallbackLevels,
    go(view, arg) {
      try { cleanup?.(); } catch (e) { console.error(e); }
      cleanup = undefined;
      main.replaceChildren();
      main.className = `afi-main v-${view}`;
      header.hidden = view === 'orientation';
      navBtns.forEach((b, v) => { b.classList.toggle('on', v === view || (v === 'map' && (view === 'briefing' || view === 'lab' || view === 'analysis'))); b.setAttribute('aria-current', String(v === view)); });
      cleanup = VIEWS[view](main, api, arg);
      main.focus({ preventScroll: true });
    },
    settings: () => afiStore.settings(),
    reduced: () => { const s = afiStore.settings(); return s.reducedMotion ?? ctx.reducedMotion(); },
    webgl: () => load.webgl && afiStore.settings().webgl,
    judge: () => ctx.judgeMode(),
    level: (id) => { for (const m of load.modules) { const l = m.levels.find((x) => x.def.id === id); if (l) return l; } return undefined; },
    layers(current?: AfiLevel) {
      if (ctx.judgeMode()) return [...ALL_LAYERS];
      const done = afiStore.completed();
      const s = new Set<AfiVizLayer>();
      for (const m of load.modules) if (moduleDone(m, done)) (m.meta.unlocks ?? []).forEach((l) => s.add(l));
      (current?.meta.unlocks ?? []).forEach((l) => s.add(l));
      return [...s];
    },
    applySettings() {
      const s = afiStore.settings();
      host.classList.toggle('afi-lecture', s.lecture);
      host.classList.toggle('afi-reduced', api.reduced());
      host.dataset.theme = s.theme;
    },
    toast(msg, kind = '') {
      const d = document.createElement('div'); d.className = `afi-toast ${kind}`; d.textContent = msg;
      toasts.appendChild(d); setTimeout(() => d.remove(), 3200);
    },
  };
  api.applySettings();
  api.go(afiStore.flag('oriented') ? 'map' : 'orientation');
  return { destroy() { try { cleanup?.(); } catch (e) { console.error(e); } shell.remove(); } };
}
