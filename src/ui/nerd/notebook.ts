/**
 * Schrödi's Lab Notebook v2, "The Bench Book" (docs/NOTEBOOK_V2.md §6). Classes + CSS: Designer. DOM + logic: Programmer.
 * In the nerd bench the book is docked as a column between the room and the code (mode 'column'), or swaps with the
 * editor in a bottom sheet on narrow screens (mode 'sheet'). Under ?cinema it rides in the old overlay host ('overlay').
 * Only the visible page(s) render, and only when their inputs change.
 */
import { cinema } from '../../engine/cinema';
import '../../styles/nerd.css';
import type { LevelDef, NightResult, Snapshot, QubitId, NerdInfo, Program, Phase } from '../../core/contracts';
import { NERD_PAGES, type NerdPageId, type NerdPageDef } from './pages';
import { createBloch3D, type Bloch3D } from '../bloch3d';
import { toQiskit, toOpenQASM3 } from '../../quantum/export';
import { h, prefersReducedMotion, inputLabel } from '../../engine/util';
import {
  type C, type MeasuredObs, cabs, carg, fmtCoef, phaseHue, reducedRho, maxOffDiag, buildCircuit, wiresFor, syndromeOf, transcribe, errLabel, measuredObservables, appliedCorrection,
} from './qmath';
import { codeDecoder, stabilizerSet, fixVerdict, type StabDef } from '../../quantum/nerd';

/** a program line: `pc` indexes the fixed (Schrödi's) or the player's ('mine') part of that phase */
export interface NbLineRef { phase: Phase; part: 'fixed' | 'mine'; pc: number }
export type NbMode = 'column' | 'sheet' | 'overlay';
export interface NerdUpdate {
  night: NightResult | null; step: number; snap: Snapshot | null; xray: boolean; lightsOut: boolean;
  /** which night of the last test report is shown (1-based) and how many there were (decision 4) */
  nightIndex?: number; nightCount?: number;
  /** the nights of the last Test all (Threshold page: the player's measured logical error rate) */
  report?: NightResult[] | null;
}
export interface NerdNotebook {
  update(u: NerdUpdate): void;
  pulseUnlock(page: NerdPageId): void;
  /** open the book on `page` (if unlocked); on Bloch / density, highlight / select `focus.qubit` */
  openPage(page: NerdPageId, focus?: { qubit?: QubitId }): void;
  /** column (bench lg/xl/md) · sheet (bench sm) · overlay (cinema) */
  setMode(mode: NbMode): void;
  isOpen(): boolean;
  setOpen(open: boolean): void;
  /** card ↔ gate link: highlight the circuit column(s) that came from this program line (null = clear) */
  highlightLine(ref: NbLineRef | null): void;
  destroy(): void;
}
export interface NerdNotebookOpts {
  level: LevelDef; isUnlocked(page: NerdPageId): boolean; onDump?(): void;
  /** optional: the player's current program, so Export can offer the dynamic circuit + IF comments */
  prog?(): { bedtime?: Program; morning?: Program } | undefined;
  mode?: NbMode;
  /** open state when np.nb.open was never written (bench: xl/lg open, md closed) */
  defaultOpen?: boolean;
  /** the player opened/closed the book (column mode), or asked to see it (sheet mode: open=true) */
  onOpenChange?(open: boolean): void;
  /** sheet mode: × / Esc means "back to the code tab" */
  onSheetClose?(): void;
  /** may Esc close the book right now? (bench md/sm only; default: yes) */
  escCloses?(): boolean;
  /** card ↔ gate link: the pointer is over the gate(s) of this program line (null = left) */
  onGateHover?(ref: NbLineRef | null): void;
  /** run a layout-changing DOM update inside the bench's transition (View Transitions / fallback); default: run it now */
  transition?(kind: string, mutate: () => void): void;
}

const LS = { seen: 'np.nb.seen', open: 'np.nb.open', page: 'np.nb.page', pin: 'np.nb.pin', dump: 'np.nb.dump', morphed: 'np.nb.morphed', sticker: 'np.nb.sticker' };
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

const MARGIN: Record<NerdPageId, string> = {
  state: 'Amplitudes, not probabilities. Square them and the phases vanish. That is the whole trick.',
  bloch: 'A short arrow means the Qubble is sharing. Not sick. Sharing.',
  entangle: 'Two bits between two qubits is the maximum. Somebody tried to copy.',
  circuit: 'Same thing, different hat. Cards on the left, gates on the right.',
  stabilizers: 'Asking "do you match?" never tells you what they are. That is the point.',
  threshold: 'Below one half, three beats one. Above it, don\'t bother.',
  density: 'Diagonal: what you would see. Off-diagonal: what you would lose by looking.',
  export: 'Real hardware is noisier than my gremlins. Good luck.',
  dump: 'Fine. Everything. Happy now?',
};
const UNLOCK_NOTE: Partial<Record<NerdPageId, string>> = {
  state: 'Oh. You found my notes. Don\'t tell the Qubbles.',
  circuit: 'Your Bot Code is a quantum circuit. Surprise.',
  stabilizers: 'Now you know what the bots were humming.',
  density: 'Watch the corners of this one when Wobbles shows up.',
  export: 'Take it to a real quantum computer. I\'ll wait.',
};
/** index flags: glyph + short label (spec §6); colours live in the CSS, the spine ticks need them inline */
const TAB: Record<NerdPageId, [string, string, string]> = {
  state: ['ψ', 'State', '#ffd6e0'], bloch: ['◐', 'Bloch', '#fff0b8'], entangle: ['∞', 'Entangle', '#e6dcff'], circuit: ['⊕', 'Circuit', '#c7ecff'],
  stabilizers: ['ZZ', 'Checks', '#c9f5df'], threshold: ['p*', 'Threshold', '#ffdcc0'], density: ['ρ', 'ρ matrix', '#f3d9ff'], export: ['⇪', 'Export', '#dcf2d6'], dump: ['{ }', 'DUMP', '#2a2a2a'],
};
const LEGEND: [string, string, string][] = [['BOOP', 'BOOP', 'X'], ['SHUSH', 'SHUSH', 'Z'], ['SPIN', 'SPIN', 'H'], ['HIGHFIVE', 'HIGHFIVE', 'CNOT'], ['LISTEN', 'LISTEN', 'meter'], ['PEEK', 'PEEK', 'meter'], ['RESET', 'RESET', '|0⟩'], ['IF', 'IF BEEP', '═ control']];
const SPREAD_MIN = 640;
/** the night's input as readable text for the run head (decision: no emoji glyphs there) */
function inputKet(inp: unknown): string {
  if (typeof inp === 'string') return ({ zero: '|0⟩', one: '|1⟩', plus: '|+⟩', minus: '|−⟩', plusI: '|+i⟩', minusI: '|−i⟩', random: '🎲' } as Record<string, string>)[inp] ?? inp;
  const o = inp as { theta?: number; phi?: number } | null;
  return o && typeof o.theta === 'number' ? '|ψ⟩' : '?';
}

let nightIds = new WeakMap<object, number>(), nightSeq = 0;
const idOf = (o: object | null) => { if (!o) return 0; let i = nightIds.get(o); if (!i) nightIds.set(o, (i = ++nightSeq)); return i; };
const refKey = (r: NbLineRef) => `${r.phase}:${r.part}:${r.pc}`;
const parseKey = (k: string): NbLineRef | null => { const [phase, part, pc] = k.split(':'); return phase && part ? { phase: phase as Phase, part: part as 'fixed' | 'mine', pc: +pc } : null; };

/**
 * For every trace step: the program line it belongs to (the most recent 'line' event in its phase). Mirrors
 * Playback.mapLines: old traces without `part` on line events get fixed → mine inferred from the pc sequence.
 */
export function lineRefsOf(night: NightResult, level: LevelDef): (NbLineRef | null)[] {
  const out: (NbLineRef | null)[] = [];
  let phase: Phase = 'bedtime', part: 'fixed' | 'mine' = 'mine', prevPc = -1, lastTaken = false, last: NbLineRef | null = null;
  const fixedLen = (ph: Phase) => (ph === 'bedtime' ? level.fixedBedtime : ph === 'morning' ? level.fixedMorning : undefined)?.length ?? 0;
  const edits = (ph: Phase) => ph !== 'night' && level.editable.includes(ph);
  for (const st of night.steps) {
    const ev = st.ev;
    if (ev.k === 'phase') { phase = ev.phase; part = fixedLen(phase) > 0 ? 'fixed' : 'mine'; prevPc = -1; lastTaken = false; last = null; }
    else if (ev.k === 'line') {
      if (ev.part) part = ev.part;
      else if (part === 'fixed' && edits(ev.phase) && ev.pc === 0 && prevPc === fixedLen(ev.phase) - 1 && !lastTaken) part = 'mine';
      prevPc = ev.pc; lastTaken = false;
      last = ev.phase === 'night' ? null : { phase: ev.phase, part, pc: ev.pc };
    } else if (ev.k === 'jump') lastTaken = ev.taken;
    out.push(last);
  }
  void phase;
  return out;
}

interface Sheet {
  el: HTMLElement; title: HTMLElement; plain: HTMLElement; body: HTMLElement; margin: HTMLElement; foot: HTMLElement; pg: HTMLElement;
  pinBtn: HTMLElement | null; page: NerdPageId; key: string; morphUntil: number;
  bloch: Map<QubitId, { w: Bloch3D; nums: HTMLElement }>;
  /** circuit geometry + the card ↔ gate map (program line key → column indices) */
  circ: { svg: SVGSVGElement; scroller: HTMLElement; L: number; CW: number; T: number; H: number; lineCols: Map<string, number[]> } | null;
}

export function createNerdNotebook(host: HTMLElement, o: NerdNotebookOpts): NerdNotebook {
  const reduced = prefersReducedMotion() || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let mode: NbMode = o.mode ?? 'overlay';
  const storedOpen = lsGet(LS.open);
  let open = storedOpen != null ? storedOpen === '1' : !!o.defaultOpen;
  let dumpOn = lsGet(LS.dump) === '1';
  let page: NerdPageId = (lsGet(LS.page) as NerdPageId) || 'state';
  let pin: NerdPageId = (lsGet(LS.pin) as NerdPageId) || 'circuit';
  let u: NerdUpdate = { night: null, step: -1, snap: null, xray: false, lightsOut: false };
  let raf = 0, dead = false, wide = false, spread = false, hlKey = '';
  const fresh = new Set<NerdPageId>(); // unlocked but not viewed yet (★ on the flag)
  const seen = new Set<NerdPageId>((lsGet(LS.seen) ?? '').split(',').filter(Boolean) as NerdPageId[]);
  const markSeen = (id: NerdPageId) => { fresh.delete(id); if (!seen.has(id)) { seen.add(id); lsSet(LS.seen, [...seen].join(',')); } };
  const pendingNote = new Map<NerdPageId, string>();
  const shown = () => mode === 'sheet' || open;

  // ── DOM (spec §6) ──
  const root = h('div', { class: 'nb nb-v2' + (reduced ? ' nb-reduced' : ''), lang: 'en', 'data-mode': mode, 'data-spread': '0' });
  const ticks = h('span', { class: 'ticks', 'aria-hidden': 'true' });
  const spine = h('button', { class: 'nb-spine', 'aria-expanded': 'false', title: 'Open Schrödi\'s lab notebook' }, h('span', { class: 'lbl' }, '📓 Lab notebook'), ticks);
  const binding = h('div', { class: 'nb-binding', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize notebook (arrow keys, double-click to reset)', tabindex: '0', title: 'Drag to resize the notebook' });
  const titleEl = h('h2', { class: 'nb-title' }, 'Schrödi\'s Lab Notebook');
  const fStep = h('span', { class: 'nb-field' }), fNight = h('span', { class: 'nb-field' }), fExp = h('span', { class: 'nb-field' });
  const runhead = h('div', { class: 'nb-runhead' }, fStep, fNight, fExp);
  const closeBtn = h('button', { class: 'nb-close', 'aria-label': 'Close notebook', title: 'Close' }, '×');
  const head = h('header', { class: 'nb-head' }, titleEl, runhead, closeBtn);
  const mkSheet = (pinned: boolean): Sheet => {
    const title = h('h3', { class: 'nb-ptitle' }), plain = h('p', { class: 'nb-plain' });
    const body = h('div', { class: 'nb-body', role: 'tabpanel', tabindex: '0' }), margin = h('aside', { class: 'nb-margin' });
    const pg = h('span', { class: 'pg' });
    const foot = h('footer', { class: 'nb-foot' }, pg, h('span', { class: 'wit' }, 'witnessed & understood by'));
    const pinBtn = pinned ? null : h('button', { class: 'nb-pinbtn hidden', type: 'button', title: 'Pin this page to the right-hand page', 'aria-label': 'Pin this page to the right-hand page' }, '📌');
    const el = h('section', { class: 'nb-sheet' + (pinned ? ' nb-pinned' : '') }, pinBtn, title, plain, body, margin, foot);
    if (!pinned) { const ear = h('button', { class: 'nb-dogear', type: 'button', 'aria-label': 'Next page', title: 'Next page' }); ear.onclick = () => nextPage(); el.append(ear); }
    return { el, title, plain, body, margin, foot, pg, pinBtn, page: 'state', key: '', morphUntil: 0, bloch: new Map(), circ: null };
  };
  const SL = mkSheet(false), SR = mkSheet(true);
  if (SL.pinBtn) SL.pinBtn.onclick = () => pinPage(page);
  const gutter = h('div', { class: 'nb-gutter', 'aria-hidden': 'true' });
  const turn = h('div', { class: 'nb-turn', 'aria-hidden': 'true' });
  const spreadEl = h('div', { class: 'nb-spread' }, SL.el, turn);
  const tabs = h('nav', { class: 'nb-tabs', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': 'Notebook pages' });
  const book = h('div', { class: 'nb-book', role: 'region', 'aria-label': 'Schrödi\'s lab notebook' }, binding, head, spreadEl, tabs);
  root.append(spine, book);
  host.append(root);

  const pages = () => NERD_PAGES.filter((p) => p.id !== 'dump' || dumpOn);
  const def = (id: NerdPageId) => NERD_PAGES.find((p) => p.id === id)!;
  const unlocked = (p: NerdPageDef) => (p.id === 'dump' ? dumpOn : o.isUnlocked(p.id));
  const pageNo = (id: NerdPageId) => String(NERD_PAGES.findIndex((p) => p.id === id) + 1).padStart(2, '0');

  // ── spread (two facing pages): dock ≥ 640px, column mode, pinned page unlocked and not the left page ──
  function syncSpread() {
    const pinOk = unlocked(def(pin)) && pin !== page;
    const want = wide && mode === 'column' && shown() && pinOk;
    if (SL.pinBtn) SL.pinBtn.classList.toggle('hidden', !(wide && mode === 'column' && page !== pin && page !== 'dump'));
    if (want === spread) return;
    spread = want;
    root.dataset.spread = spread ? '1' : '0';
    if (spread) { SL.el.after(gutter, SR.el); SR.key = ''; } else { gutter.remove(); SR.el.remove(); disposeSheet(SR); }
    buildTabs();
  }
  const ro = new ResizeObserver(() => {
    const w = host.clientWidth >= SPREAD_MIN;
    if (w !== wide) { wide = w; syncSpread(); }
    if (shown()) { if (SL.page === 'circuit') SL.key = ''; if (spread && SR.page === 'circuit') SR.key = ''; schedule(); }
  });
  ro.observe(host);

  function buildTabs() {
    tabs.innerHTML = '';
    ticks.innerHTML = '';
    for (const p of pages()) {
      const ok = unlocked(p);
      const [g, t, c] = TAB[p.id];
      const on = p.id === page;
      const b = h('button', {
        class: 'nb-tab' + (on ? ' on' : '') + (spread && p.id === pin ? ' pinned' : '') + (ok ? '' : ' sealed') + (fresh.has(p.id) ? ' fresh' : ''),
        type: 'button', role: 'tab', 'aria-selected': String(on), 'aria-disabled': ok ? null : 'true', 'data-id': p.id, tabindex: on ? '0' : '-1',
        'aria-label': ok ? def(p.id).title : `Sealed page: unlocks after ${p.unlockAfter}`,
        title: ok ? `${def(p.id).title}: ${p.plain}${mode === 'column' && wide ? ' (shift-click: pin to the right page)' : ''}` : `Sealed: unlocks after ${p.unlockAfter}`,
      }, h('span', { class: 'g', 'aria-hidden': 'true' }, ok ? g : ''), h('span', { class: 't', 'aria-hidden': 'true' }, ok ? t : ''));
      let longT = 0, longFired = false;
      b.addEventListener('pointerdown', (e) => {
        longFired = false;
        if (!ok || e.pointerType === 'mouse') return;
        longT = window.setTimeout(() => { longFired = true; pinPage(p.id); }, 550); // long-press = pin (touch)
      });
      const cancel = () => clearTimeout(longT);
      b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel); b.addEventListener('pointercancel', cancel);
      b.onclick = (e) => {
        if (longFired) { longFired = false; return; }
        if (!ok) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); return; }
        if (e.shiftKey) pinPage(p.id); else go(p.id);
      };
      tabs.append(b);
      if (ok) ticks.append(h('i', { style: `--c:${c}` }));
    }
  }
  function nextPage() {
    const list = pages().filter(unlocked);
    const i = list.findIndex((p) => p.id === page);
    if (list.length > 1) go(list[(i + 1) % list.length].id);
  }
  function pinPage(id: NerdPageId) {
    if (!unlocked(def(id))) return;
    pin = id; lsSet(LS.pin, id);
    if (page === id) { // the left page moves right: show the next page on the left
      const list = pages().filter(unlocked);
      const nx = list.find((p) => p.id !== id);
      if (nx) { page = nx.id; lsSet(LS.page, page); }
    }
    SL.key = ''; SR.key = '';
    syncSpread(); buildTabs(); render(true);
  }
  function playTurn(from: NerdPageId, to: NerdPageId) {
    if (reduced || !shown()) return;
    const ids = NERD_PAGES.map((p) => p.id);
    turn.classList.remove('fwd', 'back'); void turn.offsetWidth;
    turn.classList.add(ids.indexOf(to) >= ids.indexOf(from) ? 'fwd' : 'back');
    const done = () => { turn.classList.remove('fwd', 'back'); clearTimeout(t); turn.removeEventListener('animationend', done); };
    const t = window.setTimeout(done, 700); // fallback when the CSS has no animation (reduced motion, cinema)
    turn.addEventListener('animationend', done);
  }
  function go(id: NerdPageId) {
    const from = page;
    if (page !== id) disposeSheet(SL);
    page = id; lsSet(LS.page, id);
    const tear = fresh.has(id);
    markSeen(id);
    syncSpread();
    buildTabs();
    SL.key = '';
    render(true);
    if (from !== id) playTurn(from, id);
    if (tear && !reduced) { SL.el.classList.remove('nb-tear'); void SL.el.offsetWidth; SL.el.classList.add('nb-tear'); }
  }
  function applyShown() {
    const s = shown();
    root.classList.toggle('nb-open', s);
    spine.setAttribute('aria-expanded', String(s));
    if (s) {
      if (!unlocked(def(page))) page = pages().find(unlocked)?.id ?? 'state';
      markSeen(page); syncSpread(); buildTabs(); SL.key = ''; SR.key = ''; render(true);
    } else { syncSpread(); disposeSheet(SL); disposeSheet(SR); }
  }
  let closingT = 0;
  /** book open: the cover swings open on the binding, then a paw pats the page (designer keyframes under .nb-opening: the lid on .nb-book::after, the paw on .nb-spread::after) */
  // .nb-opening stays on while the book is open: the cover and paw animations end invisible (fill: both), and removing
  // the class mid-open would restart the book's plain entrance animation (.nb-open .nb-book). It goes when the book shuts.
  function playOpening() {
    if (reduced) return;
    root.classList.remove('nb-opening'); void root.offsetWidth; root.classList.add('nb-opening');
  }
  function setOpen(v: boolean, notify = true) {
    if (mode === 'sheet') { if (!v) o.onSheetClose?.(); return; }
    if (v === open) { if (v) { clearTimeout(closingT); root.classList.remove('nb-closing'); } return; } // re-opened mid-close
    const commit = () => {
      if (v === open) return; // a second click while the transition was starting
      open = v; lsSet(LS.open, v ? '1' : '0');
      applyShown();
      if (!v) root.classList.remove('nb-opening');
      if (notify) o.onOpenChange?.(v);
      if (v) playOpening();
    };
    // the layout change (column width, the room) morphs in ONE transition with the bench attributes set by onOpenChange
    const go = () => { if (notify && mode === 'column' && o.transition) o.transition(v ? 'nb-open' : 'nb-close', commit); else commit(); };
    clearTimeout(closingT); root.classList.remove('nb-closing');
    // close: the cardboard lid swings shut first (.nb-closing, 420ms), then the column collapses
    if (!v && notify && !reduced && mode === 'column' && shown()) { root.classList.add('nb-closing'); closingT = window.setTimeout(() => { root.classList.remove('nb-closing'); go(); }, 420); return; }
    go();
  }
  spine.onclick = () => { setOpen(true); requestAnimationFrame(() => (tabs.querySelector('.nb-tab.on') as HTMLElement | null)?.focus({ preventScroll: true })); };
  closeBtn.onclick = () => { setOpen(false); if (mode !== 'sheet') spine.focus(); };

  // easter egg: 5 clicks on the title, or type |ψ⟩ (also "|psi>") while open
  let clicks: number[] = [], typed = '';
  const reveal = () => {
    if (!dumpOn) { dumpOn = true; lsSet(LS.dump, '1'); fresh.add('dump'); pendingNote.set('dump', 'Fine. Everything. Happy now?'); }
    o.onDump?.(); go('dump');
  };
  titleEl.onclick = () => { const t = performance.now(); clicks = [...clicks.filter((c) => t - c < 2500), t]; titleEl.classList.remove('wob'); void titleEl.offsetWidth; titleEl.classList.add('wob'); if (clicks.length >= 5) { clicks = []; reveal(); } };
  const onKey = (e: KeyboardEvent) => {
    if (!shown()) return;
    const inside = root.contains(document.activeElement);
    if (e.key === 'Escape' && inside && (o.escCloses?.() ?? true)) { e.stopPropagation(); setOpen(false); if (mode !== 'sheet') spine.focus(); return; }
    if (e.key.length === 1) { typed = (typed + e.key).slice(-6); if (typed.endsWith('|ψ⟩') || typed.toLowerCase().endsWith('|psi>')) reveal(); }
    const tab = (e.target as HTMLElement)?.closest?.('.nb-tab');
    if (tab && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation(); // keep the level's ←/→ (step) shortcuts out of the tab strip
      const all = [...tabs.querySelectorAll<HTMLButtonElement>('.nb-tab')];
      const i = all.indexOf(tab as HTMLButtonElement);
      const n = e.key === 'Home' ? all[0] : e.key === 'End' ? all[all.length - 1] : all[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      all.forEach((b) => b.setAttribute('tabindex', b === n ? '0' : '-1'));
      n.focus();
    }
  };
  addEventListener('keydown', onKey, true);

  // ── card ↔ gate link (decision 5) ──
  function applyHL(S: Sheet, scroll = false) {
    const c = S.circ; if (!c || !c.svg.isConnected) return;
    c.svg.querySelectorAll('.gate-hl').forEach((n) => n.classList.remove('gate-hl'));
    c.svg.querySelectorAll('.nb-hlband').forEach((n) => n.remove());
    S.body.querySelectorAll('.nb-clegend .gate-hl').forEach((n) => n.classList.remove('gate-hl'));
    const cols = hlKey ? c.lineCols.get(hlKey) : undefined;
    if (!cols?.length) return;
    const NS = 'http://www.w3.org/2000/svg';
    for (const i of cols) {
      const g = c.svg.querySelector(`g.nb-g[data-col="${i}"]`);
      g?.classList.add('gate-hl');
      const band = document.createElementNS(NS, 'rect');
      band.setAttribute('class', 'nb-hlband');
      band.setAttribute('x', String(c.L + i * c.CW + 1)); band.setAttribute('y', String(c.T - 14));
      band.setAttribute('width', String(c.CW - 2)); band.setAttribute('height', String(c.H - c.T + 10)); band.setAttribute('rx', '4');
      c.svg.insertBefore(band, c.svg.firstChild);
      const op = g?.getAttribute('data-op'); if (op) S.body.querySelector(`.nb-clegend [data-op="${op}"]`)?.classList.add('gate-hl');
    }
    if (!scroll) return; // re-renders and gate-side hovers never move the circuit under the pointer
    // bring the first linked column into view inside the circuit card
    const x = c.L + cols[0] * c.CW, sc = c.scroller;
    if (sc.scrollWidth > sc.clientWidth && (x < sc.scrollLeft || x + c.CW > sc.scrollLeft + sc.clientWidth)) sc.scrollTo({ left: Math.max(0, x - sc.clientWidth * 0.4), behavior: reduced ? 'auto' : 'smooth' });
  }
  function setHL(key: string, scroll = false) { if (key === hlKey) return; hlKey = key; applyHL(SL, scroll); if (spread) applyHL(SR, scroll); }
  const onGateOver = (e: PointerEvent) => {
    const g = (e.target as Element).closest?.('g.nb-g[data-line]');
    const key = g?.getAttribute('data-line') ?? '';
    if (key === hlKey) return;
    setHL(key); o.onGateHover?.(key ? parseKey(key) : null);
  };
  const onGateOut = () => { if (hlKey) { setHL(''); o.onGateHover?.(null); } };

  // ── running head: step / input · night / exp. (fields that don't fit hide themselves via CSS) ──
  function updateHead() {
    const night = u.night;
    let step = '—';
    if (night) {
      const vis = (k: string) => k !== 'line' && k !== 'phase';
      let total = 0, done = 0;
      night.steps.forEach((s, i) => { if (vis(s.ev.k)) { total++; if (i <= u.step) done++; } });
      step = `${Math.min(done, total)}/${total}`;
    }
    fStep.innerHTML = `<i>step</i><b>${step}</b>`;
    const idx = night ? (u.nightIndex && u.nightCount ? `${u.nightIndex} of ${u.nightCount}` : '1') : '—';
    fNight.innerHTML = `<i>night</i><b>${esc(idx)}</b>${night ? `<span class="nb-in">${esc(inputKet(night.input))}</span>` : ''}`;
    fNight.title = night ? `input ${inputLabel(night.input)}` : '';
    fExp.innerHTML = `<i>exp.</i><b>${esc(o.level.id)}</b>`;
  }

  // ── rendering ──
  function schedule() { if (!raf && !dead) raf = requestAnimationFrame(() => { raf = 0; render(false); }); }
  let densSel = 0, focusQ: QubitId | null = null;
  /** the sheet being rendered (the page views below draw into it) */
  let S: Sheet = SL;
  function disposeSheet(s: Sheet) { for (const v of s.bloch.values()) v.w.destroy(); s.bloch = new Map(); s.circ = null; }

  function render(force: boolean) {
    if (!shown() || dead) return;
    updateHead();
    renderSheet(SL, page, force);
    if (spread) renderSheet(SR, pin, force);
  }
  function renderSheet(sheet: Sheet, id: NerdPageId, force: boolean) {
    S = sheet;
    if (sheet.page !== id) { disposeSheet(sheet); sheet.page = id; sheet.key = ''; }
    sheet.el.dataset.page = id;
    const d = def(id);
    const n = u.snap?.nerd;
    const hidden = d.needsXray && !u.xray;
    const night = u.night;
    sheet.pg.textContent = `p. ${pageNo(id)}`;
    sheet.foot.classList.toggle('signed', !!night && night.pass && u.step >= night.steps.length - 1);
    const key = [id, idOf(u.night), u.step, u.xray, u.lightsOut, densSel, !!n, dumpOn, idOf(u.report ?? null)].join('|');
    if (!force && key === sheet.key) return;
    if (id === 'circuit' && performance.now() < sheet.morphUntil && !force) return; // let the reveal play out
    sheet.key = key;
    if (sheet === SR) markSeen(id);
    sheet.title.textContent = d.title; sheet.plain.textContent = d.plain;
    const note = pendingNote.get(id); pendingNote.delete(id);
    sheet.margin.textContent = note ?? MARGIN[id];
    sheet.margin.classList.toggle('nb-new-note', !!note && !reduced);
    const body = sheet.body;
    if (id !== 'circuit') sheet.circ = null;
    if (u.lightsOut) { disposeSheet(sheet); body.replaceChildren(lightsOutView()); return; }
    if (hidden) { disposeSheet(sheet); body.replaceChildren(hiddenView()); return; }
    if (!u.night && id !== 'threshold') { disposeSheet(sheet); body.replaceChildren(h('p', { class: 'nb-empty' }, 'Run a night (or step through one) and I\'ll take notes.')); return; }
    switch (id) {
      case 'state': body.replaceChildren(n ? stateView(n) : noData()); break;
      case 'bloch': if (n) blochView(n); else body.replaceChildren(noData()); break;
      case 'entangle': body.replaceChildren(n ? entangleView(n) : noData()); break;
      case 'circuit': body.replaceChildren(circuitView()); applyHL(sheet); break;
      case 'stabilizers': body.replaceChildren(stabView(n)); break;
      case 'threshold': body.replaceChildren(thresholdView()); break;
      case 'density': body.replaceChildren(n ? densityView(n) : noData()); break;
      case 'export': body.replaceChildren(exportView()); break;
      case 'dump': body.replaceChildren(dumpView()); break;
    }
    if (n && (id === 'state' || id === 'entangle' || id === 'density')) body.append(simNote());
  }
  /** These pages show the simulator's hidden state: say so, once per page. */
  const simNote = () => h('p', { class: 'nb-cap nb-simnote' }, 'Simulator notes: a real lab only gets the bots\' beeps.');
  const noData = () => h('p', { class: 'nb-empty' }, 'No notes for this step. (The simulator only writes them in Nerd mode: re-run the night.)');
  const hiddenView = () => h('div', { class: 'nb-hidden' }, h('div', { class: 'nb-stamp' }, '🙈'), h('p', null, 'State hidden: the Qubbles are asleep. Turn on X-ray to read my notes.'));


  // split ket bits at the Qubble | bot boundary
  const splitAt = (order: QubitId[]) => order.filter((q) => q.startsWith('q')).length;
  const ketHTML = (bits: string, cut: number) => cut > 0 && cut < bits.length ? `|${bits.slice(0, cut)}⟩|${bits.slice(cut)}⟩` : `|${bits}⟩`;

  // ── state vector ──
  function stateView(n: NerdInfo): HTMLElement {
    const cut = splitAt(n.order);
    const amps = [...n.amps].sort((a, b) => cabs(b) - cabs(a));
    const top = amps.slice(0, 12);
    const norm = Math.sqrt(n.amps.reduce((s, a) => s + a.re * a.re + a.im * a.im, 0));
    const terms = top.map((a, i) => {
      let c = fmtCoef(a);
      let sign = i ? ' + ' : '';
      if (c.startsWith('−')) { c = c.slice(1); sign = i ? ' − ' : '−'; }
      return `${sign}<span class="nb-term">${c}<span class="nb-ket">${ketHTML(a.ket, cut)}</span></span>`;
    }).join('') + (amps.length > top.length ? ` <span class="nb-more">+ … ${amps.length - top.length} more</span>` : '');
    const legend = `|${n.order.slice(0, cut).join(' ')}${cut < n.order.length ? ' · ' + n.order.slice(cut).join(' ') : ''}⟩`;
    const rows = top.map((a) => {
      const r = cabs(a), p = carg(a), pr = r * r;
      return `<div class="nb-amp"><span class="nb-ket">${ketHTML(a.ket, cut)}</span>
        <span class="nb-abar"><i style="width:${(r * 100).toFixed(1)}%;background:${phaseHue(p)}"></i></span>
        ${wheel(p, r)}<span class="nb-num">${(pr * 100).toFixed(1)}%</span></div>`;
    }).join('');
    // histogram in computational-basis order
    const hist = [...top].sort((a, b) => (a.ket < b.ket ? -1 : 1));
    const W = 300, H = 90, bw = Math.min(26, (W - 10) / Math.max(1, hist.length));
    const bars = hist.map((a, i) => {
      const p = a.re * a.re + a.im * a.im, x = 6 + i * bw, bh = p * (H - 24);
      return `<rect x="${x + 2}" y="${H - 14 - bh}" width="${bw - 4}" height="${bh}" rx="2" fill="${phaseHue(carg(a))}" stroke="#0e0e0e" stroke-width="1.5"/>
        <text x="${x + bw / 2}" y="${H - 3}" text-anchor="middle" class="nb-svgt" font-size="${hist.length > 8 ? 6.5 : 8}">${a.ket}</text>`;
    }).join('');
    return h('div', { class: 'nb-state' },
      h('div', { class: 'nb-legend' }, 'ket order ', h('b', null, legend)),
      h('div', { class: 'nb-dirac', html: `|ψ⟩ = ${terms}` }),
      h('div', { class: 'nb-cap nb-ampcap' }, 'bar = |amplitude|, colour = phase, number = probability'),
      h('div', { class: 'nb-amps', html: rows }),
      h('div', { class: 'nb-cap' }, 'probabilities |a|² (colour = phase)'),
      h('div', { class: 'nb-taped', html: `<svg viewBox="0 0 ${W} ${H}" class="nb-hist" role="img" aria-label="probability histogram">${bars}<line x1="4" x2="${W - 4}" y1="${H - 14}" y2="${H - 14}" stroke="#0e0e0e" stroke-width="1.5"/></svg>` }),
      h('div', { class: 'nb-norm' + (Math.abs(norm - 1) < 1e-6 ? ' ok' : '') }, `‖ψ‖ = ${norm.toFixed(6)} ${Math.abs(norm - 1) < 1e-6 ? '✓' : ''}${n.truncated ? ' (showing the 256 biggest terms)' : ''}`));
  }
  const wheel = (p: number, r: number) => {
    const x = 9 + Math.cos(-p) * 7 * Math.max(0.35, r), y = 9 + Math.sin(-p) * 7 * Math.max(0.35, r);
    return `<svg class="nb-wheel" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="#fff" stroke="#0e0e0e" stroke-width="1.4"/><line x1="9" y1="9" x2="16.5" y2="9" stroke="#bbb" stroke-width="1"/><line x1="9" y1="9" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${phaseHue(p)}" stroke-width="2.6" stroke-linecap="round"/><circle cx="9" cy="9" r="1.4" fill="#0e0e0e"/></svg>`;
  };

  // ── Bloch spheres ──
  function blochView(n: NerdInfo) {
    const ids = n.order.filter((q) => n.reduced[q]);
    const data = ids.filter((q) => q.startsWith('q')).slice(0, 9);
    const show = [...data, ...ids.filter((q) => !q.startsWith('q')).slice(0, Math.max(0, 12 - data.length))]; // P6: all data qubits (q9!) first
    const body = S.body;
    if ([...S.bloch.keys()].join() !== show.join()) {
      disposeSheet(S);
      const grid = h('div', { class: 'nb-bgrid' });
      for (const q of show) {
        const r = n.reduced[q];
        const w = createBloch3D({ size: 124, interactive: false, rotatable: false, labels: 'kets', initial: r });
        const nums = h('div', { class: 'nb-bnums' });
        grid.append(h('figure', { class: 'nb-bcard' }, h('figcaption', null, q), w.el, nums));
        S.bloch.set(q, { w, nums });
      }
      const extra = ids.length > show.length ? h('p', { class: 'nb-cap' }, `${ids.length} qubits: showing the first ${show.length}. The rest are in the dump.`) : null;
      body.replaceChildren(grid, ...(extra ? [extra] : []), simNote());
    }
    if (focusQ && S.bloch.has(focusQ)) {
      const card = S.bloch.get(focusQ)!.w.el.closest('.nb-bcard') as HTMLElement | null;
      body.querySelectorAll('.nb-bcard.focus').forEach((c) => c.classList.remove('focus'));
      if (card) { card.classList.add('focus'); requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })); }
      focusQ = null;
    }
    for (const q of show) {
      const r = n.reduced[q], v = S.bloch.get(q)!;
      v.w.set({ x: r.x, y: r.y, z: r.z });
      v.nums.innerHTML = `⟨X⟩ ${f2(r.x)} · ⟨Y⟩ ${f2(r.y)} · ⟨Z⟩ ${f2(r.z)}<br>Tr ρ² ${r.purity.toFixed(3)} · S ${r.entropy.toFixed(3)} bit`;
    }
  }
  const f2 = (v: number) => (v < -0.0005 ? '−' : '+') + Math.abs(v).toFixed(2);

  // ── entanglement ──
  let stickerShown = lsGet(LS.sticker) === '1';
  function entangleView(n: NerdInfo): HTMLElement {
    let ids = n.order, idx = ids.map((_, i) => i);
    let capNote = '';
    if (n.miScope === 'data') { idx = idx.filter((i) => ids[i].startsWith('q')); capNote = `${n.liveQubits ?? ids.length} live qubits: showing data qubits only.`; }
    ids = idx.map((i) => n.order[i]);
    const N = ids.length, cell = Math.min(32, 260 / Math.max(1, N)), pad = 26;
    let maxOff = 0;
    const cells: string[] = [];
    idx.forEach((ri, r) => idx.forEach((ci, c) => {
      const v = n.mi[ri]?.[ci] ?? 0, x = pad + c * cell, y = pad + r * cell;
      if (r === c) { cells.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="url(#nbhatch)" stroke="#0e0e0e" stroke-width="0.8"><title>${ids[r]}: 2S = ${v.toFixed(2)} bits</title></rect>`); return; }
      maxOff = Math.max(maxOff, v);
      const k = Math.min(1, v / 2);
      const col = miColor(k);
      cells.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${col}" stroke="#0e0e0e" stroke-width="0.8"><title>I(${ids[r]}:${ids[c]}) = ${v.toFixed(3)} bits</title></rect>`);
      if (N <= 8 && v > 0.005) cells.push(`<text x="${x + cell / 2}" y="${y + cell / 2 + 3}" text-anchor="middle" font-size="${cell > 26 ? 9 : 7}" class="nb-svgt" fill="${k > 0.55 ? '#fff' : '#0e0e0e'}">${v.toFixed(v >= 1.995 ? 0 : 2)}</text>`);
    }));
    const lab = ids.map((q, i) => `<text x="${pad + i * cell + cell / 2}" y="${pad - 6}" text-anchor="middle" class="nb-svgt" font-size="9">${q}</text><text x="${pad - 5}" y="${pad + i * cell + cell / 2 + 3}" text-anchor="end" class="nb-svgt" font-size="9">${q}</text>`).join('');
    const S = pad + N * cell + 4;
    const svg = `<svg viewBox="0 0 ${S + 4} ${S + 4}" class="nb-mi" role="img" aria-label="mutual information heatmap"><defs><pattern id="nbhatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#ece8de"/><line x1="0" y1="0" x2="0" y2="5" stroke="#b9b3a6" stroke-width="2"/></pattern></defs>${lab}${cells.join('')}</svg>`;
    const scale = h('div', { class: 'nb-scale' }, h('span', null, '0'), h('i', { style: `background:linear-gradient(90deg,${miColor(0)},${miColor(0.5)},${miColor(1)})` }), h('span', null, '2 bits'));
    const ent = h('div', { class: 'nb-ent' }, ...ids.map((q) => {
      const s = n.reduced[q]?.entropy ?? 0;
      return h('div', { class: 'nb-erow' }, h('b', null, q), h('span', { class: 'nb-abar' }, h('i', { style: `width:${(s * 100).toFixed(1)}%;background:${miColor(s / 1)}` })), h('span', { class: 'nb-num' }, s.toFixed(2)));
    }));
    const wrap = h('div', { class: 'nb-entangle' },
      h('div', { class: 'nb-row2' }, h('div', { class: 'nb-taped', html: svg }), h('div', null, h('div', { class: 'nb-cap' }, 'entropy S(ρ) per qubit (bits)'), ent)),
      scale, h('p', { class: 'nb-cap' }, 'I(A:B) = S(A) + S(B) − S(AB). Silk threads in the room are drawn where I > 0.1.'),
      ...(capNote ? [h('p', { class: 'nb-cap' }, capNote)] : []));
    if (maxOff >= 1.9) {
      const first = !stickerShown;
      stickerShown = true; lsSet(LS.sticker, '1');
      wrap.insertBefore(h('div', { class: 'nb-sticker' + (first && !reduced ? ' slap' : '') }, 'NOT A COPY.', h('br'), 'ENTANGLED.'), wrap.children[1] ?? null);
    }
    return wrap;
  }
  const miColor = (k: number) => { // paper → lilac → deep phasey ink (checked on paper: readable stroke + text contrast)
    k = Math.max(0, Math.min(1, k));
    const a = [242, 240, 235], b = [200, 160, 240], c = [74, 30, 130];
    const m = k < 0.5 ? a.map((v, i) => v + (b[i] - v) * k * 2) : b.map((v, i) => v + (c[i] - v) * (k - 0.5) * 2);
    return `rgb(${m.map((v) => v | 0).join(',')})`;
  };

  // ── circuit ──
  function circuitView(): HTMLElement {
    const night = u.night!;
    const sheet = S;
    const wires = wiresFor(o.level, u.snap?.nerd?.order);
    const prog = o.prog?.();
    const { cols, stepToCol, condKnown } = buildCircuit(night, u.xray, { level: o.level, prog });
    const obs = obsOf(night);
    const refAt = lineRefsOf(night, o.level);
    const cur = u.step >= 0 ? stepToCol[Math.min(u.step, stepToCol.length - 1)] ?? -1 : -1;
    // wire spacing scales to the sheet height (legend + headings + margin note need ~250px)
    const avail = Math.max(160, sheet.el.clientHeight - 250);
    const WY = Math.max(26, Math.min(40, (avail - 32) / Math.max(1, wires.length))), CW = Math.max(31, Math.min(40, WY * 0.95)), L = 8, T = 24;
    // the observable rows under the wires: only for LISTEN columns that have a label (1 row, or 2 staggered rows)
    const nObsCols = cols.filter((c) => c.k === 'measure' && !c.t.startsWith('q') && (obs.get(c.step)?.label ?? 'I') !== 'I').length;
    const hasObs = nObsCols > 0;
    const W = L + Math.max(1, cols.length) * CW + 20, HW = T + wires.length * WY + 8, H = HW + (nObsCols > 1 ? 30 : nObsCols ? 17 : 0);
    const y = (q: QubitId) => T + wires.indexOf(q) * WY + WY / 2;
    const parts: string[] = [];
    const lineCols = new Map<string, number[]>();
    let nObs = 0;
    // wires
    wires.forEach((q) => { const yy = y(q); parts.push(`<line x1="0" x2="${W - 8}" y1="${yy}" y2="${yy}" class="nb-wire${q.startsWith('q') ? '' : ' bot'}"/>`); });
    const labels = wires.map((q) => `<line x1="24" x2="34" y1="${y(q)}" y2="${y(q)}" class="nb-wire${q.startsWith('q') ? '' : ' bot'}"/><text x="21" y="${y(q) + 4}" text-anchor="end" class="nb-svgt nb-wl">${q}</text>`).join('');
    if (cur >= 0) parts.push(`<rect x="${L + cur * CW + 2}" y="${T - 14}" width="${CW - 4}" height="${H - T + 10}" rx="6" class="nb-cursor"/><path d="M${L + cur * CW + CW / 2 - 5} ${T - 18} l5 6 l5 -6z" fill="#0e0e0e"/>`);
    const morph = !lsGet(LS.morphed) && !reduced;
    cols.forEach((c, i) => {
      const x = L + i * CW + CW / 2, future = cur >= 0 && i > cur ? ' future' : '';
      // card ↔ gate link: which program line produced this column
      const ref = 'step' in c ? refAt[c.step] : null;
      const lk = ref && c.k !== 'barrier' && c.k !== 'error' ? refKey(ref) : '';
      if (lk) { const a = lineCols.get(lk); if (a) a.push(i); else lineCols.set(lk, [i]); }
      const op = c.k === 'cnot' ? 'HIGHFIVE' : c.k === 'reset' ? 'RESET' : c.k === 'measure' ? (c.t.startsWith('q') ? 'PEEK' : 'LISTEN') : c.k === 'gate' ? (c.g === 'X' ? 'BOOP' : c.g === 'Z' ? 'SHUSH' : 'SPIN') : '';
      const g = (glyph: string, card?: string, wireY?: number) => parts.push(`<g class="nb-g${future}" data-col="${i}"${lk ? ` data-line="${lk}"` : ''}${op ? ` data-op="${op}"` : ''} style="--d:${i * 45}ms">${morph && card ? `<g class="nb-card"><rect x="${x - 18}" y="${(wireY ?? T) - 10}" width="36" height="20" rx="5"/><text x="${x}" y="${(wireY ?? T) + 3}" text-anchor="middle">${esc(card.split(' ')[0])}</text></g>` : ''}<g class="nb-gl">${glyph}</g></g>`);
      if (c.k === 'barrier') { parts.push(`<line x1="${x}" x2="${x}" y1="${T - 6}" y2="${HW - 4}" class="nb-barrier"/><text x="${x}" y="${T - 10}" text-anchor="middle" class="nb-svgt nb-phase">${c.label}</text>`); return; }
      if (c.k === 'error') { const yy = y(c.t); parts.push(`<g class="nb-g${future}" data-col="${i}"><rect x="${x - 12}" y="${yy - 12}" width="24" height="24" rx="4" class="nb-err"/><text x="${x}" y="${yy + 4}" text-anchor="middle" class="nb-svgt nb-errt" font-size="${c.label.length > 2 ? 6 : 11}">${esc(c.label)}</text><title>gremlin: ${esc(c.label)} on ${c.t}</title></g>`); return; }
      if (c.k === 'gate') {
        const yy = y(c.t);
        const cond = c.cond?.length ? condLines(x, yy, c.cond, y) : '';
        g(`${cond}<rect x="${x - 12}" y="${yy - 12}" width="24" height="24" rx="4" class="nb-box g${c.g}"/><text x="${x}" y="${yy + 5}" text-anchor="middle" class="nb-gt">${c.g}</text><title>${esc(c.card)}</title>`, c.card, yy);
      } else if (c.k === 'cnot') {
        const yc = y(c.c), yt = y(c.t);
        const cond = c.cond?.length ? condLines(x, yt, c.cond.filter((q) => q !== c.c), y) : '';
        g(`${cond}<line x1="${x}" x2="${x}" y1="${yc}" y2="${yt}" stroke="#0e0e0e" stroke-width="2"/><circle cx="${x}" cy="${yc}" r="4.5" fill="#0e0e0e"/><circle cx="${x}" cy="${yt}" r="9" fill="#fff" stroke="#0e0e0e" stroke-width="2"/><path d="M${x - 9} ${yt}h18M${x} ${yt - 9}v18" stroke="#0e0e0e" stroke-width="2"/><title>${esc(c.card)}</title>`, c.card, (yc + yt) / 2);
      } else if (c.k === 'reset') {
        const yy = y(c.t);
        const cond = c.cond?.length ? condLines(x, yy, c.cond, y) : '';
        g(`${cond}<rect x="${x - 13}" y="${yy - 12}" width="26" height="24" rx="4" class="nb-box gR"/><text x="${x}" y="${yy + 4}" text-anchor="middle" class="nb-svgt" font-size="9.5">|0⟩</text><title>${esc(c.card)}</title>`, c.card, yy);
      } else if (c.k === 'measure') {
        const yy = y(c.t);
        const cond = c.cond?.length ? condLines(x, yy, c.cond, y) : '';
        // ★ W2a: what the bot really measured (classical trace only: fine under blankets)
        const ob = !c.t.startsWith('q') ? obs.get(c.step) : undefined;
        const obsTxt = ob && ob.label !== 'I' ? `<text x="${x}" y="${HW + 10 + (nObs++ % 2) * 13}" text-anchor="middle" class="nb-svgt nb-obs">${ob.random ? '🎲' : (ob.sign < 0 ? '−' : '') + esc(ob.label)}<title>${ob.random ? `${c.t} was in superposition: a fair coin` : `${c.t} measured ${ob.sign < 0 ? '−' : ''}${ob.label}: "are you the same${/X|Y/.test(ob.label) ? ' in the ± basis' : ''}?", never the Qubbles themselves`}</title></text>` : '';
        g(`${cond}${obsTxt}<rect x="${x - 13}" y="${yy - 12}" width="26" height="24" rx="4" class="nb-box gM"/><path d="M${x - 8} ${yy + 5} a8 8 0 0 1 16 0" fill="none" stroke="#0e0e0e" stroke-width="1.6"/><line x1="${x}" y1="${yy + 5}" x2="${x + 6}" y2="${yy - 5}" stroke="#0e0e0e" stroke-width="1.6"/><text x="${x + 13}" y="${yy + 20}" text-anchor="end" class="nb-svgt nb-bit b${c.bit}">${c.bit}</text><title>${esc(c.card)} → ${c.bit}</title>`, c.card, yy);
      }
    });
    // decision 6: never below 0.8×. Shrink-to-fit (.fit, labels inside the same SVG) only when the natural width is
    // at most 1.25× the room; otherwise the circuit scrolls sideways inside its card under fixed wire labels.
    const LW = 34;
    const room = sheet.body.clientWidth - 24; // the taped card's padding + border
    const overlay = cinema.on && cinema.nb;
    const fit = !overlay && room > 0 && W + LW > room && W + LW <= room * 1.25;
    const cls = `nb-circ${morph ? ' nb-morph' : ''}${fit ? ' fit' : ''}`;
    const svg = fit
      ? `<svg viewBox="0 0 ${W + LW} ${H}" width="${W + LW}" height="${H}" class="${cls}" role="img" aria-label="circuit diagram of this night"><g class="nb-clabels" aria-hidden="true">${labels}</g><g class="nb-layer" transform="translate(${LW} 0)">${parts.join('')}</g></svg>`
      : `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="${cls}" role="img" aria-label="circuit diagram of this night"><g class="nb-layer">${parts.join('')}</g></svg>`;
    if (morph) { lsSet(LS.morphed, '1'); sheet.morphUntil = performance.now() + 900 + cols.length * 45 + 600; setTimeout(() => { sheet.key = ''; schedule(); }, sheet.morphUntil - performance.now() + 30); }
    const prevScroll = sheet.circ?.scroller.scrollLeft ?? (sheet.body.querySelector('.nb-cscroll') as HTMLElement | null)?.scrollLeft ?? 0;
    const scroller = h('div', { class: 'nb-cscroll', html: svg });
    const svgEl = scroller.querySelector('svg') as SVGSVGElement;
    scroller.addEventListener('pointerover', onGateOver);
    scroller.addEventListener('pointerleave', onGateOut);
    // keep the scroll position across re-renders (instantly), then follow the step cursor (smooth; reduced motion = jump)
    requestAnimationFrame(() => {
      scroller.scrollTo({ left: prevScroll, behavior: 'instant' as ScrollBehavior });
      // a card ↔ gate link is showing: the player is looking at that column, don't yank the circuit to the cursor
      const linked = hlKey && lineCols.has(hlKey);
      if (!linked && cur >= 0 && scroller.scrollWidth > scroller.clientWidth) {
        const cx = L + cur * CW + CW / 2;
        if (cx < scroller.scrollLeft + 24 || cx > scroller.scrollLeft + scroller.clientWidth - 24) scroller.scrollTo({ left: Math.max(0, cx - scroller.clientWidth * 0.6), behavior: reduced ? 'auto' : 'smooth' });
      }
    });
    const layer = svgEl.querySelector('.nb-layer') as SVGGElement;
    sheet.circ = { svg: layer as unknown as SVGSVGElement, scroller, L, CW, T, H, lineCols };
    const wrap = h('div', { class: 'nb-cwrap' }, scroller);
    if (!fit) {
      const labBox = h('div', { html: `<svg viewBox="0 0 ${LW} ${H}" width="${LW}" height="${H}" class="nb-clabels" aria-hidden="true">${labels}</svg>` });
      wrap.prepend(labBox);
      // ?cinema=1&nb=1: the circuit SVG is stretched to the drawer width; scale the wire-label column to match
      if (overlay) {
        const fitLab = (k: number) => requestAnimationFrame(() => { const sv = scroller.querySelector('svg'), lab = labBox.querySelector('svg'); if (sv && lab) { lab.style.height = sv.getBoundingClientRect().height + 'px'; lab.style.width = 'auto'; } if (k > 0) fitLab(k - 1); });
        fitLab(4);
      }
    }
    const legend = h('div', { class: 'nb-clegend' }, ...LEGEND.map(([op, a, b]) => h('span', { 'data-op': op }, h('b', { class: `nb-cchip op-${op}` }, a), ' = ', b)),
      ...(u.xray ? [h('span', { class: 'err' }, h('b', null, 'red'), ' = gremlin (X-ray)')] : []));
    const unknown = prog && !condKnown ? [h('p', { class: 'nb-cap nb-condunk' }, 'classical controls unknown (program changed since this night)')] : [];
    return h('div', null, h('p', { class: 'nb-big' }, 'Your Bot Code is a quantum circuit.'), h('div', { class: 'nb-taped nb-circcard' }, wrap), ...unknown, legend,
      ...(hasObs ? [h('p', { class: 'nb-cap nb-obscap' }, 'Under each meter: what that bot really measured. Bots never look at a Qubble, only at products like Z₁Z₂.')] : []));
  }
  const condLines = (x: number, yg: number, cond: QubitId[], y: (q: QubitId) => number) => cond.map((q) => {
    const yb = y(q);
    return `<line x1="${x - 2}" x2="${x - 2}" y1="${yb}" y2="${yg}" class="nb-cl"/><line x1="${x + 2}" x2="${x + 2}" y1="${yb}" y2="${yg}" class="nb-cl"/><circle cx="${x}" cy="${yb}" r="4" fill="#fff" stroke="#0e0e0e" stroke-width="1.6"/><circle cx="${x}" cy="${yb}" r="1.8" fill="#0e0e0e"/>`;
  }).join('');

  // ── stabilizers & syndrome ──
  const synTable = new Map<string, { errs: Set<string>; pass: number; fail: number }>();
  const seenNights = new WeakSet<object>();
  function stabView(n: NerdInfo | undefined): HTMLElement {
    const night = u.night!;
    const rec = n?.record ?? recordFromTrace(night, u.step);
    const show = u.xray;
    const row = (st: { label: string; value: number }) => {
      const v = st.value;
      const badge = !show ? '<span class="nb-badge q">?</span>' : Math.abs(v - 1) < 0.02 ? '<span class="nb-badge p">+1</span>' : Math.abs(v + 1) < 0.02 ? '<span class="nb-badge m">−1</span>' : `<span class="nb-badge z">${v.toFixed(2)}</span>`;
      return `<tr><td>⟨${st.label}⟩</td><td class="nb-num">${show ? v.toFixed(3) : '🙈'}</td><td>${badge}</td></tr>`;
    };
    const all = n?.stabilizers ?? [];
    const codeRows = all.filter((s) => s.code !== false).map(row).join('');
    const otherRows = all.filter((s) => s.code === false).map(row).join('');
    const head = '<thead><tr><th>check</th><th>value</th><th></th></tr></thead>';
    const chips = rec.length ? rec.map((r) => `<span class="nb-chip b${r.bit}">${r.who}:${r.bit ? 'BEEP' : 'quiet'}</span>`).join('') : '<span class="nb-cap">nothing heard yet</span>';
    const syn = [...synTable.entries()].map(([s, r]) => `<tr><td><code>${s}</code></td><td>${u.xray ? [...r.errs].join(', ') : '🙈'}</td><td>${r.pass ? `<span class="nb-badge p">${r.pass}✓</span>` : ''}${r.fail ? `<span class="nb-badge m">${r.fail}✗</span>` : ''}</td></tr>`).join('');
    const wrap = h('div', { class: 'nb-stab' });
    if (codeRows) wrap.append(h('div', { class: 'nb-sub' }, 'Stabilizers of this code'), h('table', { class: 'nb-table nb-stabs', html: head + `<tbody>${codeRows}</tbody>` }));
    else if (!otherRows) wrap.append(h('p', { class: 'nb-cap' }, 'No parity checks in this room.'));
    if (otherRows) wrap.append(h('details', { class: 'nb-other' }, h('summary', null, 'Other checks (not stabilizers here: watch them sit at 0)'), h('table', { class: 'nb-table', html: head + `<tbody>${otherRows}</tbody>` })));
    wrap.append(h('div', { class: 'nb-sub' }, 'Measurement record'), h('div', { class: 'nb-chips', html: chips }));
    const dec = decoderView(night, rec.length);
    if (dec) wrap.append(dec);
    wrap.append(h('div', { class: 'nb-sub' }, 'Syndrome table (built from your runs)'),
      syn ? h('table', { class: 'nb-table', html: `<thead><tr><th>bots heard</th><th>gremlin</th><th>result</th></tr></thead><tbody>${syn}</tbody>` }) : h('p', { class: 'nb-cap' }, 'Finish a night and I\'ll start the table.'));
    const fid = u.xray ? (n?.fidelity ?? u.snap?.logicalFidelity) : undefined;
    if (fid != null) {
      const bar = (v: number) => h('div', { class: 'nb-fid' }, h('span', { class: 'nb-abar' }, h('i', { style: `width:${(v * 100).toFixed(1)}%;background:${v > 0.999 ? '#3ddc97' : v > 0.5 ? '#ffb72b' : '#fe443d'}` })), h('span', { class: 'nb-num' }, v.toFixed(4)));
      wrap.append(h('div', { class: 'nb-sub' }, n?.stabilizers.some((x) => x.code) ? 'Fidelity with the perfect code state' : 'Fidelity with the target state'), bar(fid));
      if (n?.recoverable != null) wrap.append(h('div', { class: 'nb-sub nb-recov' }, 'Recoverable (after a perfect correction)'), bar(n.recoverable));
      const sp = sparkView(night);
      if (sp) wrap.append(sp);
      if (survived(night, u.step)) wrap.append(h('div', { class: 'nb-survived' + (reduced ? '' : ' slap') }, 'LOGICAL QUBIT', h('br'), 'SURVIVED ✓'));
      else if (u.step >= night.steps.length - 1 && !night.pass && n?.recoverable != null && n.recoverable < 0.5 && night.errors.length > 1) wrap.append(h('div', { class: 'nb-stampx nb-fooled' + (reduced ? '' : ' slap') }, 'FOOLED'));
    }
    return wrap;
  }
  /** ★ W1 "hidden, not lost": fidelity vs recoverable fidelity over the whole night, cursor at this step (X-ray only) */
  const sparkMemo = new WeakMap<object, { f: (number | null)[]; r: (number | null)[] } | null>();
  function sparkView(night: NightResult): HTMLElement | null {
    let d = sparkMemo.get(night);
    if (d === undefined) {
      const f = night.steps.map((s) => s.snap.nerd?.fidelity ?? s.snap.logicalFidelity ?? null);
      const r = night.steps.map((s) => s.snap.nerd?.recoverable ?? null);
      d = r.some((v) => v != null) ? { f, r } : null;
      sparkMemo.set(night, d);
    }
    if (!d) return null;
    const N = night.steps.length, W = 300, H = 64, P = 6;
    const X = (i: number) => P + (i / Math.max(1, N - 1)) * (W - 2 * P), Y = (v: number) => P + (1 - v) * (H - 2 * P);
    const line = (a: (number | null)[]) => a.map((v, i) => (v == null ? '' : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean).join(' ');
    const cx = X(Math.min(u.step, N - 1));
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="nb-spark" role="img" aria-label="fidelity and recoverable fidelity across the night">
      <line x1="${P}" x2="${W - P}" y1="${Y(1)}" y2="${Y(1)}" class="nb-spark-grid"/><line x1="${P}" x2="${W - P}" y1="${Y(0)}" y2="${Y(0)}" class="nb-spark-grid"/>
      <polyline points="${line(d.f)}" class="nb-spark-f" fill="none" stroke="#0e0e0e" stroke-width="1.8"/>
      <polyline points="${line(d.r)}" class="nb-spark-r" fill="none" stroke="#17834f" stroke-width="2.4"/>
      <line x1="${cx}" x2="${cx}" y1="2" y2="${H - 2}" class="nb-spark-cur" stroke="#ffb72b" stroke-width="3" opacity=".8"/></svg>`;
    return h('figure', { class: 'nb-sparkfig nb-taped b' }, h('div', { html: svg }),
      h('figcaption', { class: 'nb-cap' }, h('b', { class: 'nb-key-f' }, 'ink'), ' = fidelity with the perfect code state · ', h('b', { class: 'nb-key-r' }, 'green'), ' = recoverable. A gremlin knocks the ink down; the green stays up: hidden, not lost. (The green blinks down only while a bot is half-way through a check: for that moment it holds a Qubble\'s own value. The ink also sags while SPINs turn the code inside out: bookkeeping, not damage.)'));
  }
  /** ★ W2b: the code's decoder lookup table, this night's row highlighted next to what the player's code did */
  let decoder: ReturnType<typeof codeDecoder> | undefined, stabDefs: StabDef[] | undefined;
  const obsMemo = new WeakMap<object, Map<number, MeasuredObs>>();
  function obsOf(night: NightResult): Map<number, MeasuredObs> {
    let m = obsMemo.get(night);
    if (!m) { try { m = measuredObservables(night); } catch { m = new Map(); } obsMemo.set(night, m); }
    return m;
  }
  function decoderView(night: NightResult, heard: number): HTMLElement | null {
    if (decoder === undefined) { try { stabDefs = stabilizerSet(o.level); decoder = codeDecoder(stabDefs); } catch { decoder = null; } }
    if (!decoder) return null;
    // this night's syndrome: per generator, the latest LISTEN (up to this step) that measured it
    const obs = obsOf(night);
    const bits: (string | null)[] = decoder.gens.map(() => null);
    // only the LISTENs the shown snapshot has already heard (same as the measurement record above)
    const heardSteps = new Set<number>();
    for (let i = 0, k = 0; i < night.steps.length && k < heard; i++) if (night.steps[i].ev.k === 'measure') { heardSteps.add(i); k++; }
    obs.forEach((ob, i) => {
      if (!heardSteps.has(i) || ob.random) return;
      const g = decoder!.gens.indexOf(ob.label); if (g < 0) return;
      const ev = night.steps[i].ev; if (ev.k !== 'measure') return;
      bits[g] = String(ev.result ^ (ob.sign < 0 ? 1 : 0));
    });
    const syn = bits.every((b) => b != null) ? bits.join('') : null;
    // what the player's code applied: its classically controlled BOOP/SHUSH on Qubbles, as one Pauli in the dawn frame
    // (qmath.appliedCorrection), compared with the table's fix up to the stabilizer group (nerd.fixVerdict)
    let applied: ReturnType<typeof appliedCorrection> = null;
    try { applied = appliedCorrection(night, o.level, o.prog?.(), u.step); } catch { applied = null; }
    const done = u.step >= night.steps.length - 1;
    const VERDICT = { same: ['✓', 'exactly the table\'s fix'], equivalent: ['≡', 'differs from the table\'s fix by a stabilizer: same final state'], logical: ['✗', 'a logical error: the code space is back, the secret is flipped'], wrong: ['✗', 'doesn\'t bring the Qubbles back into the code'] } as const;
    const rows = decoder.rows.map((r) => {
      const on = syn != null && r.syndrome === syn;
      let mine = '';
      if (on) {
        const v = applied && done ? fixVerdict(stabDefs!, applied, r) : null;
        const [mark, why] = !applied ? ['?', 'classical controls unknown'] : !done ? ['…', 'night not finished'] : v ? VERDICT[v] : ['?', ''];
        const dv = !applied || !done || !v ? 'unk' : v === 'same' ? 'ok' : v === 'equivalent' ? 'eq' : 'bad';
        mine = `<td class="nb-mine">${applied?.label ?? '?'} <b class="nb-verdict" data-v="${dv}" title="${why}">${mark}</b></td>`;
      } else mine = '<td></td>';
      const gr = on && u.xray ? `<td>${night.errors.map((e) => `${errLabel(e)}·${e.t}`).join(', ') || 'none'}</td>` : u.xray ? '<td></td>' : '';
      return `<tr${on ? ' class="on"' : ''}><td><code>${r.syndrome}</code></td><td>${r.fix}</td>${mine}${gr}</tr>`;
    }).join('');
    const headRow = `<thead><tr><th>bits (${decoder.gens.join(' ')})</th><th>fix</th><th>your code</th>${u.xray ? '<th>gremlin</th>' : ''}</tr></thead>`;
    return h('div', { class: 'nb-decoder' }, h('div', { class: 'nb-sub' }, 'Decoder: what each answer means'),
      h('table', { class: 'nb-table nb-dectable', html: headRow + `<tbody>${rows}</tbody>` }),
      h('p', { class: 'nb-cap' }, syn != null ? `This night the bots said ${syn}.${'' }` : 'Waiting for the bots to answer every check…'));
  }
  /** P5: the syndrome table grows from every finished night, whatever page is open */
  function accumulate(night: NightResult | null, step: number) {
    if (!night || step < night.steps.length - 1 || seenNights.has(night)) return;
    seenNights.add(night);
    const bots = o.level.bots.map((b) => b.id);
    const full = night.steps[night.steps.length - 1]?.snap.nerd?.record ?? recordFromTrace(night, night.steps.length - 1);
    const s = syndromeOf(full, bots) || '(no bot listened)';
    let row = synTable.get(s); if (!row) synTable.set(s, (row = { errs: new Set(), pass: 0, fail: 0 }));
    night.errors.forEach((e) => row!.errs.add(`${errLabel(e)}·${e.t}`)); if (!night.errors.length) row.errs.add('none');
    if (night.pass) row.pass++; else row.fail++;
    myNights.n++; if (!night.pass) myNights.k++;
  }
  const myNights = { n: 0, k: 0 };
  function recordFromTrace(night: NightResult, step: number) {
    const out: { who: QubitId; bit: 0 | 1 }[] = [];
    for (let i = 0; i <= Math.min(step, night.steps.length - 1); i++) { const ev = night.steps[i].ev; if (ev.k === 'measure') out.push({ who: ev.t, bit: ev.result }); }
    return out;
  }
  function survived(night: NightResult, step: number) {
    let hit = false, dipped = false;
    for (let i = 0; i <= Math.min(step, night.steps.length - 1); i++) {
      const s = night.steps[i];
      if (s.ev.k === 'noise') hit = true;
      const f = s.snap.nerd?.fidelity ?? s.snap.logicalFidelity;
      if (hit && f != null && f < 0.98) dipped = true;
      if (i === step) return hit && dipped && f != null && f > 0.999;
    }
    return false;
  }

  // ── threshold ──
  function thresholdView(): HTMLElement {
    const W = 250, H = 175, L = 30, B = 26, pw = W - L - 10, ph = H - B - 10;
    const X = (p: number) => L + (p / 0.5) * pw, Y = (v: number) => 10 + ph - (v / 0.5) * ph;
    const pts = (f: (p: number) => number) => Array.from({ length: 51 }, (_, i) => { const p = (i / 50) * 0.5; return `${X(p).toFixed(1)},${Y(Math.min(0.5, f(p))).toFixed(1)}`; }).join(' ');
    const logical = (p: number) => 3 * p * p - 2 * p * p * p;
    const noise = o.level.noise;
    const p0 = noise.mode === 'random' ? noise.p : null;
    // P10: the theory dot only where the 3-qubit bit-flip model applies (code Z₁Z₂, Z₂Z₃; flips only)
    if (decoder === undefined) { try { stabDefs = stabilizerSet(o.level); decoder = codeDecoder(stabDefs); } catch { decoder = null; } }
    const bitflipModel = noise.mode === 'random' && noise.kinds.length === 1 && noise.kinds[0] === 'flip' && decoder?.gens.join(',') === 'Z₁Z₂,Z₂Z₃';
    // … and the player's own measured point: failed / total nights, Wilson 95% interval
    let measured = '', measuredCap = '';
    if (p0 != null && p0 <= 0.5) {
      const rep = u.report?.length ? { n: u.report.length, k: u.report.filter((x) => !x.pass).length } : myNights;
      if (rep.n > 0) {
        const z = 1.96, n = rep.n, k = rep.k, z2 = z * z;
        const c = (k + z2 / 2) / (n + z2), hw = (z * Math.sqrt((k * (n - k)) / n + z2 / 4)) / (n + z2);
        const cy = (v: number) => Y(Math.max(0, Math.min(0.5, v)));
        measured = `<g class="nb-thr-mine"><line x1="${X(p0)}" x2="${X(p0)}" y1="${cy(c - hw)}" y2="${cy(c + hw)}" stroke="#17834f" stroke-width="2"/><line x1="${X(p0) - 4}" x2="${X(p0) + 4}" y1="${cy(c - hw)}" y2="${cy(c - hw)}" stroke="#17834f" stroke-width="2"/><line x1="${X(p0) - 4}" x2="${X(p0) + 4}" y1="${cy(c + hw)}" y2="${cy(c + hw)}" stroke="#17834f" stroke-width="2"/><rect x="${X(p0) - 4}" y="${cy(k / n) - 4}" width="8" height="8" fill="#3ddc97" stroke="#0e0e0e" stroke-width="1.5"/><text x="${X(p0) - 7}" y="${cy(k / n) + 14}" text-anchor="end" class="nb-svgt" font-size="9">your nights: ${k}/${n}</text></g>`;
        measuredCap = ` Green square: your own nights here, ${k} of ${n} failed (bar = 95% interval).`;
      }
    }
    const mark = bitflipModel && p0 != null && p0 <= 0.5 ? `<circle cx="${X(p0)}" cy="${Y(logical(p0))}" r="5" fill="#fe443d" stroke="#0e0e0e" stroke-width="1.8"/><text x="${X(p0) + 8}" y="${Y(logical(p0)) - 6}" class="nb-svgt" font-size="9">this room: p=${p0}</text>` : '';
    const ticks = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => `<text x="${X(t)}" y="${H - 10}" text-anchor="middle" class="nb-svgt" font-size="8">${t}</text><text x="${L - 4}" y="${Y(t) + 3}" text-anchor="end" class="nb-svgt" font-size="8">${t}</text>`).join('');
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="nb-thr" role="img" aria-label="logical versus physical error rate">
      <polygon points="${X(0)},${Y(0)} ${pts(logical)} ${X(0.5)},${Y(0.5)} ${pts((p) => p).split(' ').reverse().join(' ')}" fill="rgba(61,220,151,0.25)"/>
      <line x1="${L}" y1="${10 + ph}" x2="${W - 10}" y2="${10 + ph}" stroke="#0e0e0e" stroke-width="1.6"/><line x1="${L}" y1="10" x2="${L}" y2="${10 + ph}" stroke="#0e0e0e" stroke-width="1.6"/>
      <polyline points="${pts((p) => p)}" fill="none" stroke="#8a867d" stroke-width="2" stroke-dasharray="4 3"/>
      <polyline points="${pts(logical)}" fill="none" stroke="#6c63ff" stroke-width="2.6"/>
      ${ticks}${mark}${measured}
      <text x="${X(0.31)}" y="${Y(0.36)}" class="nb-svgt" font-size="9" fill="#55524b">one Qubble: p</text>
      <text x="${X(0.06)}" y="${Y(0.05) - 10}" class="nb-svgt" font-size="9" fill="#4b43d6">three: 3p² − 2p³</text>
      <text x="${X(0.25)}" y="${H - 1}" text-anchor="middle" class="nb-svgt" font-size="8.5">physical error p</text></svg>`;
    return h('div', null, h('div', { class: 'nb-taped', html: svg }), h('p', { class: 'nb-cap' }, 'The green gap is where the 3-qubit code helps. The curves cross at p = 1/2: past that, majority vote makes things worse. This crossing is a pseudo-threshold. The real threshold is where bigger codes start beating smaller ones.' + measuredCap));
  }

  // ── density matrix ──
  let prevDens: { night: number; step: number; sel: number; rho: C[][] } | null = null, densInit = false;
  function densityView(n: NerdInfo): HTMLElement {
    const ids = n.order;
    const opts: { label: string; idx: number[] }[] = ids.map((q, i) => ({ label: q, idx: [i] }));
    const qb = ids.map((q, i) => [q, i] as const).filter(([q]) => q.startsWith('q'));
    for (let i = 0; i + 1 < qb.length && i < 4; i++) opts.push({ label: `${qb[i][0]} ${qb[i + 1][0]}`, idx: [qb[i][1], qb[i + 1][1]] });
    // data ⊗ bot pairs: where the coherence lives right before a LISTEN (watch it snap away)
    const bt = ids.map((q, i) => [q, i] as const).filter(([q]) => !q.startsWith('q'));
    for (const [q, i] of qb.slice(0, 5)) for (const [b, j] of bt.slice(0, 3)) opts.push({ label: `${q} ${b}`, idx: [i, j] });
    if (focusQ) { const fi = ids.indexOf(focusQ); if (fi >= 0) { densSel = fi; prevDens = null; } focusQ = null; }
    if (!densInit) { // P9: on wobble levels start on the q1 a pair, where the snap is always visible
      densInit = true;
      const nz = o.level.noise as { kinds?: string[] };
      if (nz.kinds?.includes('wobble')) { const k = opts.findIndex((op) => op.idx.length === 2 && op.label === `${qb[0]?.[0]} ${bt[0]?.[0]}`); if (k >= 0) densSel = k; }
    }
    if (densSel >= opts.length) densSel = 0;
    const sel = opts[densSel];
    const rho = reducedRho(n.amps, sel.idx);
    const off = maxOffDiag(rho);
    const nid = idOf(u.night);
    let caught = false, was: C[][] | null = null;
    if (prevDens && prevDens.night === nid && prevDens.sel === densSel && u.step === prevDens.step + 1) {
      const ev = u.night?.steps[u.step]?.ev;
      // the coherence leaves this subsystem the moment a bot touches it (the syndrome extraction) or a LISTEN lands
      if (maxOffDiag(prevDens.rho) > 0.12 && off < 0.02 && (ev?.k === 'measure' || ev?.k === 'gate')) { caught = true; was = prevDens.rho; }
    }
    prevDens = { night: nid, step: u.step, sel: densSel, rho };
    const select = h('select', { class: 'nb-select', 'aria-label': 'Which qubit(s)' }, ...opts.map((op, i) => h('option', { value: String(i), selected: i === densSel }, op.label)));
    select.onchange = () => { densSel = +select.value; prevDens = null; SL.key = ''; SR.key = ''; schedule(); };
    const k = sel.idx.length, dim = 1 << k;
    const basis = Array.from({ length: dim }, (_, i) => i.toString(2).padStart(k, '0'));
    const grid = (part: 're' | 'im') => {
      const cs = dim === 2 ? 46 : 34;
      const cells = rho.flatMap((row, i) => row.map((c, j) => {
        const v = c[part], wv = was?.[i][j][part] ?? v;
        const snap = caught && i !== j && Math.abs(wv) > 0.05;
        return `<div class="nb-cell${i === j ? ' diag' : ''}${snap ? ' snap' : ''}" style="background:${cellColor(v)};${snap ? `--was:${cellColor(wv)}` : ''}" title="ρ[${basis[i]},${basis[j]}] = ${c.re.toFixed(3)} ${c.im >= 0 ? '+' : '−'} ${Math.abs(c.im).toFixed(3)}i">${Math.abs(v) > 0.005 ? v.toFixed(2) : '·'}</div>`;
      })).join('');
      return h('div', { class: 'nb-rho' }, h('div', { class: 'nb-sub' }, part === 're' ? 'Re ρ' : 'Im ρ'),
        h('div', { class: 'nb-rgrid', style: `grid-template-columns:repeat(${dim},${cs}px)`, html: cells }),
        h('div', { class: 'nb-rlab' }, basis.map((b) => `|${b}⟩`).join(' ')));
    };
    const wrap = h('div', { class: 'nb-dens' + (caught ? ' caught' : '') },
      h('label', { class: 'nb-cap' }, 'qubit(s): ', select),
      h('div', { class: 'nb-row2 nb-taped b' }, grid('re'), grid('im')),
      h('p', { class: 'nb-cap' }, `largest off-diagonal |ρᵢⱼ| = ${off.toFixed(3)}${off < 0.01 ? ' (classical: nothing left to lose)' : ' (coherence)'}${n.truncated ? ' · from the 256 biggest amplitudes' : ''}`));
    if (caught) wrap.append(h('div', { class: 'nb-caught' + (reduced ? '' : ' slap') }, 'error discretization,', h('br'), 'caught in the act'), h('p', { class: 'nb-cap' }, 'The coherence just moved into the bot. Once the bot holds the parity and LISTENs, the half-flip becomes either no flip or a full flip: a plain X the code can fix.'));
    return wrap;
  }
  const cellColor = (v: number) => { const a = Math.min(1, Math.abs(v) * 1.6); return v >= 0 ? `rgba(255,183,43,${(0.08 + 0.85 * a).toFixed(3)})` : `rgba(108,99,255,${(0.08 + 0.85 * a).toFixed(3)})`; };

  // ── export ──
  let exportLang: 'qiskit' | 'qasm3' = 'qiskit', exportErr = false, exportDyn: boolean | null = null; // null = dynamic by default when the program is known and X-ray is off (P2)
  function exportView(): HTMLElement {
    const night = u.night!;
    const code = h('pre', { class: 'nb-code' }, h('code', null, '…'));
    const status = h('span', { class: 'nb-cap' });
    const prog = o.prog?.();
    const dyn = (exportDyn ?? !u.xray) && !!prog;
    const fill = () => {
      const includeErrors = exportErr && u.xray;
      let text = '', own = false;
      try {
        const opts = { includeErrors, prog, dynamic: dyn };
        text = exportLang === 'qiskit' ? toQiskit(o.level, night, opts) : toOpenQASM3(o.level, night, opts);
      } catch { /* fall back to the notebook's own transcription */ }
      if (!text) { text = transcribe(night, o.level, exportLang, includeErrors, prog); own = true; }
      code.firstChild!.textContent = text;
      status.textContent = own ? 'transcribed by the notebook (exporter unavailable)' : dyn ? 'dynamic circuit (falls back to the executed path if the program can\'t be expressed; see the header)' : includeErrors || !night.errors.length ? 'the exact path this night executed' : 'the executed path: fix gates included, errors not (see the header)';
    };
    const pill = (on: boolean, label: string, act: () => void) => { const b = h('button', { class: 'btn small' + (on ? ' sun' : '') }, label); b.onclick = () => { act(); SL.key = ''; SR.key = ''; render(true); }; return b; };
    const errBox = h('input', { type: 'checkbox', checked: exportErr && u.xray, disabled: !u.xray });
    errBox.onchange = () => { exportErr = (errBox as HTMLInputElement).checked; fill(); };
    const copy = h('button', { class: 'btn small' }, 'Copy');
    copy.onclick = async () => { try { await navigator.clipboard.writeText(code.textContent ?? ''); copy.textContent = 'Copied ✓'; } catch { copy.textContent = 'Select + Ctrl-C'; } setTimeout(() => (copy.textContent = 'Copy'), 1400); };
    fill();
    return h('div', { class: 'nb-export' },
      h('div', { class: 'nb-row' }, pill(exportLang === 'qiskit', 'Qiskit (Python)', () => (exportLang = 'qiskit')), pill(exportLang === 'qasm3', 'OpenQASM 3', () => (exportLang = 'qasm3')), copy),
      h('div', { class: 'nb-row' }, pill(!dyn, 'executed path', () => (exportDyn = false)), prog ? pill(dyn, 'dynamic circuit', () => (exportDyn = true)) : h('span', { class: 'nb-cap' }, '(dynamic circuit needs your program)')),
      h('label', { class: 'nb-cap' }, errBox, u.xray ? ' include gremlin errors' : ' include gremlin errors (needs X-ray)'),
      h('div', { class: 'nb-printout' }, h('div', { class: 'nb-clip', 'aria-hidden': 'true' }), code), status);
  }

  // ── raw dump ──
  function dumpView(): HTMLElement {
    const night = u.night!;
    const data = { level: o.level.id, input: night.input, seed: night.seed, errors: night.errors, pass: night.pass, fidelity: night.fidelity, stepCount: night.stepCount, steps: night.steps };
    const dl = h('button', { class: 'btn small sun' }, 'Download .json');
    dl.onclick = () => {
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `no-peeking-${o.level.id}-night.json` });
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    };
    return h('div', { class: 'nb-dump' }, h('div', { class: 'nb-row' }, dl, h('span', { class: 'nb-cap' }, `${night.steps.length} trace steps · current step ${u.step}`)), tree('night', data, true));
  }
  function tree(k: string, v: unknown, openIt = false): HTMLElement {
    if (v === null || typeof v !== 'object') {
      const cls = typeof v === 'number' ? 'n' : typeof v === 'string' ? 's' : 'b';
      return h('div', { class: 'nb-leaf' }, h('span', { class: 'k' }, k + ': '), h('span', { class: cls }, typeof v === 'string' ? `"${v}"` : String(v)));
    }
    const arr = Array.isArray(v), entries = arr ? (v as unknown[]).map((x, i) => [String(i), x] as const) : Object.entries(v as object);
    const d = h('details', { class: 'nb-node' }, h('summary', null, h('span', { class: 'k' }, k), h('span', { class: 'nb-cap' }, arr ? ` [${entries.length}]` : ` {${entries.length}}`)));
    let built = false;
    const build = () => { if (built) return; built = true; const lim = 300; entries.slice(0, lim).forEach(([kk, vv]) => d.append(tree(kk, vv))); if (entries.length > lim) d.append(h('div', { class: 'nb-cap' }, `… ${entries.length - lim} more (in the download)`)); };
    d.addEventListener('toggle', build);
    if (openIt) { d.open = true; build(); }
    return d;
  }

  // ── lights out: syndrome bits as a beep waveform ──
  function lightsOutView(): HTMLElement {
    const night = u.night;
    const rec = night ? recordFromTrace(night, u.step).filter((r) => !r.who.startsWith('q')) : [];
    const W = 300, H = 76, mid = 34, seg = Math.min(56, (W - 20) / Math.max(1, rec.length));
    // BEEP = a bright burst of wiggles, quiet = a flat hum with one tiny blip
    let d = `M4 ${mid}`;
    rec.forEach((r, i) => {
      const x0 = 10 + i * seg;
      d += ` L${x0} ${mid}`;
      const N = 18;
      for (let k = 0; k <= N; k++) {
        const x = x0 + (k / N) * (seg - 6), env = Math.sin((k / N) * Math.PI);
        const yy = r.bit ? mid - Math.sin(k * 2.3) * 22 * env : mid - (k === N / 2 ? 3 : 0);
        d += ` L${x.toFixed(1)} ${yy.toFixed(1)}`;
      }
    });
    d += ` L${W - 4} ${mid}`;
    const labels = rec.map((r, i) => `<text x="${10 + i * seg + (seg - 6) / 2}" y="${H - 4}" text-anchor="middle" class="nb-svgt" font-size="9">${r.who}${r.bit ? ' BEEP' : ' quiet'}</text>`).join('');
    return h('div', { class: 'nb-dark nb-taped b' },
      h('p', null, 'Lights out. The notebook can\'t see in the dark either. All I have is what the bots hum:'),
      h('div', { html: `<svg viewBox="0 0 ${W} ${H}" class="nb-wave" role="img" aria-label="syndrome bits"><line x1="4" x2="${W - 4}" y1="${mid}" y2="${mid}" stroke="#3a3a66" stroke-width="1"/><path d="${d}" fill="none" stroke="#7ff0b8" stroke-width="2.2" stroke-linejoin="round"/>${labels}</svg>` }),
      h('p', { class: 'nb-cap' }, rec.length ? rec.map((r) => `${r.who}=${r.bit}`).join('  ') : 'silence so far'));
  }

  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

  buildTabs();
  applyShown();

  return {
    update(nu: NerdUpdate) { u = nu; accumulate(u.night, u.step); if (shown()) schedule(); },
    pulseUnlock(id: NerdPageId) {
      if (seen.has(id)) return; // already read: no badge, no wiggle (judge mode re-pulses everything)
      fresh.add(id);
      const note = UNLOCK_NOTE[id]; if (note) pendingNote.set(id, note);
      if (!shown()) { spine.classList.remove('wiggle'); void spine.offsetWidth; spine.classList.add('wiggle'); }
      buildTabs(); // open: the fresh flag "sticks on" (.fresh)
    },
    openPage(id: NerdPageId, focus?: { qubit?: QubitId }) {
      if (!unlocked(def(id))) return;
      focusQ = focus?.qubit ?? null;
      if (!shown()) { page = id; lsSet(LS.page, id); setOpen(true); } else go(id);
      if (mode === 'sheet') o.onOpenChange?.(true); // ask the bench to show the notes tab
      SL.key = ''; render(true);
    },
    setMode(m: NbMode) {
      if (m === mode) return;
      const was = shown();
      mode = m; root.dataset.mode = m;
      if (shown() !== was) applyShown(); else { syncSpread(); buildTabs(); SL.key = ''; SR.key = ''; schedule(); }
    },
    isOpen: () => open,
    setOpen: (v: boolean) => setOpen(v, false),
    highlightLine(ref: NbLineRef | null) { setHL(ref ? refKey(ref) : '', true); },
    destroy() { dead = true; ro.disconnect(); if (raf) cancelAnimationFrame(raf); disposeSheet(SL); disposeSheet(SR); removeEventListener('keydown', onKey, true); root.remove(); nightIds = new WeakMap(); },
  };
}
