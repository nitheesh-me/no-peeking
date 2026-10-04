/**
 * Schrödi's Lab Notebook: the Nerd-mode drawer (see docs/NERD_MODE.md). Owned by the Designer.
 * A spine tab docked to the stage's left edge that opens into a ruled-paper notebook with progressively unlocked pages.
 * Only the open page renders, and only when its inputs change.
 */
import { cinema } from '../../engine/cinema';
import '../../styles/nerd.css';
import type { LevelDef, NightResult, Snapshot, QubitId, NerdInfo, Program } from '../../core/contracts';
import { NERD_PAGES, type NerdPageId, type NerdPageDef } from './pages';
import { createBloch3D, type Bloch3D } from '../bloch3d';
import { toQiskit, toOpenQASM3 } from '../../quantum/export';
import { h, prefersReducedMotion } from '../../engine/util';
import {
  type C, cabs, carg, fmtCoef, phaseHue, reducedRho, maxOffDiag, buildCircuit, wiresFor, syndromeOf, transcribe, errLabel,
} from './qmath';

export interface NerdUpdate { night: NightResult | null; step: number; snap: Snapshot | null; xray: boolean; lightsOut: boolean }
export interface NerdNotebook {
  update(u: NerdUpdate): void;
  pulseUnlock(page: NerdPageId): void;
  /** open the drawer on `page` (if unlocked); on Bloch / density, highlight / select `focus.qubit` */
  openPage(page: NerdPageId, focus?: { qubit?: QubitId }): void;
  destroy(): void;
}
export interface NerdNotebookOpts {
  level: LevelDef; isUnlocked(page: NerdPageId): boolean; onDump?(): void;
  /** optional: the player's current program, so Export can offer the dynamic circuit + IF comments */
  prog?(): { bedtime?: Program; morning?: Program } | undefined;
}

const LS = { seen: 'np.nb.seen', w: 'np.nb.w', open: 'np.nb.open', page: 'np.nb.page', dump: 'np.nb.dump', morphed: 'np.nb.morphed', sticker: 'np.nb.sticker' };
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

let nightIds = new WeakMap<object, number>(), nightSeq = 0;
const idOf = (o: object | null) => { if (!o) return 0; let i = nightIds.get(o); if (!i) nightIds.set(o, (i = ++nightSeq)); return i; };

export function createNerdNotebook(host: HTMLElement, o: NerdNotebookOpts): NerdNotebook {
  const reduced = prefersReducedMotion();
  let open = lsGet(LS.open) === '1';
  let dumpOn = lsGet(LS.dump) === '1';
  let page: NerdPageId = (lsGet(LS.page) as NerdPageId) || 'state';
  let u: NerdUpdate = { night: null, step: -1, snap: null, xray: false, lightsOut: false };
  let lastKey = '', raf = 0, dead = false;
  const fresh = new Set<NerdPageId>(); // unlocked but not viewed yet (NEW badge)
  const seen = new Set<NerdPageId>((lsGet(LS.seen) ?? '').split(',').filter(Boolean) as NerdPageId[]);
  const markSeen = (id: NerdPageId) => { fresh.delete(id); if (!seen.has(id)) { seen.add(id); lsSet(LS.seen, [...seen].join(',')); } };
  const pendingNote = new Map<NerdPageId, string>();

  // ── DOM ──
  const root = h('div', { class: 'nb' + (reduced ? ' nb-reduced' : '') + (open ? ' nb-open' : ''), lang: 'en' });
  const spine = h('button', { class: 'nb-spine', 'aria-expanded': String(open), title: 'Schrödi\'s lab notebook (Nerd mode)' }, h('span', null, '📓 Lab notebook'));
  const titleEl = h('h2', { class: 'nb-title', title: '' }, 'Schrödi\'s Lab Notebook');
  const closeBtn = h('button', { class: 'nb-close', 'aria-label': 'Close notebook' }, '×');
  const tabs = h('div', { class: 'nb-tabs', role: 'tablist', 'aria-orientation': 'vertical' });
  const pTitle = h('h3', { class: 'nb-ptitle' });
  const pPlain = h('p', { class: 'nb-plain' });
  const body = h('div', { class: 'nb-body', role: 'tabpanel', tabindex: '0' });
  const margin = h('aside', { class: 'nb-margin' });
  const sheet = h('section', { class: 'nb-sheet' }, pTitle, pPlain, body, margin);
  const book = h('div', { class: 'nb-book', role: 'dialog', 'aria-label': 'Schrödi\'s lab notebook' },
    h('header', { class: 'nb-head' }, titleEl, h('span', { id: 'nb-pin-slot' }), closeBtn), h('div', { class: 'nb-main' }, tabs, sheet));
  const grip = h('div', { class: 'nb-grip', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize notebook', tabindex: '0', title: 'Drag to resize' });
  const pin = h('button', { class: 'nb-pin', title: 'Pin wide / narrow', 'aria-pressed': 'false' }, '📌');
  root.append(book, grip, spine);
  const maxW = () => Math.max(300, cinema.on && cinema.nb ? window.innerWidth : host.clientWidth * 0.6);
  let width = Math.max(300, Number(lsGet(LS.w)) || 360);
  const applyW = (w: number, save = true) => { width = Math.max(300, Math.min(maxW(), w)); book.style.width = width + 'px'; pin.setAttribute('aria-pressed', String(width > 420)); if (save) lsSet(LS.w, String(Math.round(width))); };
  applyW(width, false);
  pin.onclick = () => applyW(width > 420 ? 360 : maxW());
  grip.onpointerdown = (e) => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId); root.classList.add('nb-resizing');
    const x0 = e.clientX, w0 = width;
    const mv = (ev: PointerEvent) => applyW(w0 + ev.clientX - x0, false);
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); root.classList.remove('nb-resizing'); applyW(width); lastKey = ''; schedule(); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
  };
  grip.onkeydown = (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); applyW(width + (e.key === 'ArrowRight' ? 24 : -24)); lastKey = ''; schedule(); } };
  const ro = new ResizeObserver(() => { if (width > maxW()) applyW(maxW(), false); if (open && page === 'circuit') { lastKey = ''; schedule(); } });
  ro.observe(host);
  host.append(root);

  book.querySelector('#nb-pin-slot')!.replaceWith(pin);
  const pages = () => NERD_PAGES.filter((p) => p.id !== 'dump' || dumpOn);
  const def = (id: NerdPageId) => NERD_PAGES.find((p) => p.id === id)!;
  const unlocked = (p: NerdPageDef) => (p.id === 'dump' ? dumpOn : o.isUnlocked(p.id));

  function buildTabs() {
    tabs.innerHTML = '';
    for (const p of pages()) {
      const ok = unlocked(p);
      const b = h('button', {
        class: 'nb-tab' + (p.id === page ? ' on' : '') + (ok ? '' : ' sealed') + (fresh.has(p.id) ? ' fresh' : ''),
        role: 'tab', 'aria-selected': String(p.id === page), 'aria-disabled': String(!ok), 'data-id': p.id,
        title: ok ? p.plain : `Sealed: unlocks after ${p.unlockAfter}`,
      }, ok ? p.title : `🔒 ${p.title}`, h('small', null, ok ? p.plain : `unlocks after ${p.unlockAfter}`));
      b.onclick = () => { if (ok) go(p.id); else { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); } };
      tabs.append(b);
    }
  }
  function go(id: NerdPageId) {
    if (page !== id) disposePage();
    page = id; lsSet(LS.page, id);
    const tear = fresh.has(id);
    markSeen(id);
    buildTabs();
    lastKey = '';
    render(true);
    if (tear && !reduced) { sheet.classList.remove('nb-tear'); void sheet.offsetWidth; sheet.classList.add('nb-tear'); }
  }
  function setOpen(v: boolean) {
    open = v; lsSet(LS.open, v ? '1' : '0');
    root.classList.toggle('nb-open', v); spine.setAttribute('aria-expanded', String(v));
    if (v) { if (!unlocked(def(page))) page = pages().find(unlocked)?.id ?? 'state'; markSeen(page); buildTabs(); lastKey = ''; render(true); }
    else disposePage();
  }
  spine.onclick = () => setOpen(!open);
  closeBtn.onclick = () => { setOpen(false); spine.focus(); };

  // easter egg: 5 clicks on the title, or type |ψ⟩ (also "|psi>") while open
  let clicks: number[] = [], typed = '';
  const reveal = () => {
    if (!dumpOn) { dumpOn = true; lsSet(LS.dump, '1'); fresh.add('dump'); pendingNote.set('dump', 'Fine. Everything. Happy now?'); }
    o.onDump?.(); go('dump');
  };
  titleEl.onclick = () => { const t = performance.now(); clicks = [...clicks.filter((c) => t - c < 2500), t]; titleEl.classList.remove('wob'); void titleEl.offsetWidth; titleEl.classList.add('wob'); if (clicks.length >= 5) { clicks = []; reveal(); } };
  const onKey = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape' && root.contains(document.activeElement)) { setOpen(false); spine.focus(); return; }
    if (e.key.length === 1) { typed = (typed + e.key).slice(-6); if (typed.endsWith('|ψ⟩') || typed.toLowerCase().endsWith('|psi>')) reveal(); }
    const tab = (e.target as HTMLElement)?.closest?.('.nb-tab');
    if (tab && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const all = [...tabs.querySelectorAll<HTMLButtonElement>('.nb-tab')];
      const i = all.indexOf(tab as HTMLButtonElement), n = all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length];
      n.focus();
    }
  };
  addEventListener('keydown', onKey);

  // ── rendering ──
  function schedule() { if (!raf && !dead) raf = requestAnimationFrame(() => { raf = 0; render(false); }); }
  let morphUntil = 0, densSel = 0, focusQ: QubitId | null = null;
  let blochW = new Map<QubitId, { w: Bloch3D; nums: HTMLElement }>();
  function disposePage() { for (const v of blochW.values()) v.w.destroy(); blochW = new Map(); }

  function render(force: boolean) {
    if (!open || dead) return;
    const d = def(page);
    const n = u.snap?.nerd;
    const hidden = d.needsXray && !u.xray;
    const key = [page, idOf(u.night), u.step, u.xray, u.lightsOut, densSel, !!n, dumpOn].join('|');
    if (!force && key === lastKey) return;
    if (page === 'circuit' && performance.now() < morphUntil && !force) return; // let the reveal play out
    lastKey = key;
    pTitle.textContent = d.title; pPlain.textContent = d.plain;
    const note = pendingNote.get(page); pendingNote.delete(page);
    margin.textContent = note ?? MARGIN[page];
    margin.classList.toggle('nb-new-note', !!note);
    if (u.lightsOut) { disposePage(); body.replaceChildren(lightsOutView()); return; }
    if (hidden) { disposePage(); body.replaceChildren(hiddenView()); return; }
    if (!u.night && page !== 'threshold') { disposePage(); body.replaceChildren(h('p', { class: 'nb-empty' }, 'Run a night (or step through one) and I\'ll take notes.')); return; }
    switch (page) {
      case 'state': body.replaceChildren(n ? stateView(n) : noData()); break;
      case 'bloch': if (n) blochView(n); else body.replaceChildren(noData()); break;
      case 'entangle': body.replaceChildren(n ? entangleView(n) : noData()); break;
      case 'circuit': body.replaceChildren(circuitView()); break;
      case 'stabilizers': body.replaceChildren(stabView(n)); break;
      case 'threshold': body.replaceChildren(thresholdView()); break;
      case 'density': body.replaceChildren(n ? densityView(n) : noData()); break;
      case 'export': body.replaceChildren(exportView()); break;
      case 'dump': body.replaceChildren(dumpView()); break;
    }
    if (n && (page === 'state' || page === 'entangle' || page === 'density')) body.append(simNote());
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
      h('div', { class: 'nb-amps', html: rows }),
      h('div', { class: 'nb-cap' }, 'probabilities |a|² (colour = phase)'),
      h('div', { html: `<svg viewBox="0 0 ${W} ${H}" class="nb-hist" role="img" aria-label="probability histogram">${bars}<line x1="4" x2="${W - 4}" y1="${H - 14}" y2="${H - 14}" stroke="#0e0e0e" stroke-width="1.5"/></svg>` }),
      h('div', { class: 'nb-norm' + (Math.abs(norm - 1) < 1e-6 ? ' ok' : '') }, `‖ψ‖ = ${norm.toFixed(6)} ${Math.abs(norm - 1) < 1e-6 ? '✓' : ''}${n.truncated ? ' (showing the 256 biggest terms)' : ''}`));
  }
  const wheel = (p: number, r: number) => {
    const x = 9 + Math.cos(-p) * 7 * Math.max(0.35, r), y = 9 + Math.sin(-p) * 7 * Math.max(0.35, r);
    return `<svg class="nb-wheel" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="#fff" stroke="#0e0e0e" stroke-width="1.4"/><line x1="9" y1="9" x2="16.5" y2="9" stroke="#bbb" stroke-width="1"/><line x1="9" y1="9" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${phaseHue(p)}" stroke-width="2.6" stroke-linecap="round"/><circle cx="9" cy="9" r="1.4" fill="#0e0e0e"/></svg>`;
  };

  // ── Bloch spheres ──
  function blochView(n: NerdInfo) {
    const ids = n.order.filter((q) => n.reduced[q]);
    const show = ids.slice(0, 8);
    if ([...blochW.keys()].join() !== show.join()) {
      disposePage();
      const grid = h('div', { class: 'nb-bgrid' });
      for (const q of show) {
        const r = n.reduced[q];
        const w = createBloch3D({ size: 124, interactive: false, rotatable: false, labels: 'kets', initial: r });
        const nums = h('div', { class: 'nb-bnums' });
        grid.append(h('figure', { class: 'nb-bcard' }, h('figcaption', null, q), w.el, nums));
        blochW.set(q, { w, nums });
      }
      const extra = ids.length > show.length ? h('p', { class: 'nb-cap' }, `${ids.length} qubits: showing the first ${show.length}. The rest are in the dump.`) : null;
      body.replaceChildren(grid, ...(extra ? [extra] : []), simNote());
    }
    if (focusQ && blochW.has(focusQ)) {
      const card = blochW.get(focusQ)!.w.el.closest('.nb-bcard') as HTMLElement | null;
      body.querySelectorAll('.nb-bcard.focus').forEach((c) => c.classList.remove('focus'));
      if (card) { card.classList.add('focus'); requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })); }
      focusQ = null;
    }
    for (const q of show) {
      const r = n.reduced[q], v = blochW.get(q)!;
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
    if (n.miScope === 'data' || ids.length > 10) { idx = idx.filter((i) => ids[i].startsWith('q')); capNote = `${n.liveQubits ?? ids.length} qubits: showing data qubits only.`; }
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
      h('div', { class: 'nb-row2' }, h('div', { html: svg }), h('div', null, h('div', { class: 'nb-cap' }, 'entropy S(ρ) per qubit (bits)'), ent)),
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
    const wires = wiresFor(o.level, u.snap?.nerd?.order);
    const { cols, stepToCol } = buildCircuit(night, u.xray);
    const cur = u.step >= 0 ? stepToCol[Math.min(u.step, stepToCol.length - 1)] ?? -1 : -1;
    // wire spacing scales to the sheet height (legend + headings + margin note need ~250px)
    const avail = Math.max(160, sheet.clientHeight - 250);
    const WY = Math.max(26, Math.min(48, (avail - 32) / Math.max(1, wires.length))), CW = Math.max(31, Math.min(40, WY * 0.95)), L = 8, T = 24;
    const W = L + Math.max(1, cols.length) * CW + 20, H = T + wires.length * WY + 8;
    const y = (q: QubitId) => T + wires.indexOf(q) * WY + WY / 2;
    const parts: string[] = [];
    // wires
    wires.forEach((q) => { const yy = y(q); parts.push(`<line x1="0" x2="${W - 8}" y1="${yy}" y2="${yy}" class="nb-wire${q.startsWith('q') ? '' : ' bot'}"/>`); });
    const labSvg = `<svg viewBox="0 0 34 ${H}" width="34" height="${H}" class="nb-clabels" aria-hidden="true">${wires.map((q) => `<line x1="24" x2="34" y1="${y(q)}" y2="${y(q)}" class="nb-wire${q.startsWith('q') ? '' : ' bot'}"/><text x="21" y="${y(q) + 4}" text-anchor="end" class="nb-svgt nb-wl">${q}</text>`).join('')}</svg>`;
    if (cur >= 0) parts.push(`<rect x="${L + cur * CW + 2}" y="${T - 14}" width="${CW - 4}" height="${H - T + 10}" rx="6" class="nb-cursor"/><path d="M${L + cur * CW + CW / 2 - 5} ${T - 18} l5 6 l5 -6z" fill="#0e0e0e"/>`);
    const morph = !lsGet(LS.morphed) && !reduced;
    cols.forEach((c, i) => {
      const x = L + i * CW + CW / 2, future = cur >= 0 && i > cur ? ' future' : '';
      const g = (glyph: string, card?: string, wireY?: number) => parts.push(`<g class="nb-g${future}" style="--d:${i * 45}ms">${morph && card ? `<g class="nb-card"><rect x="${x - 18}" y="${(wireY ?? T) - 10}" width="36" height="20" rx="5"/><text x="${x}" y="${(wireY ?? T) + 3}" text-anchor="middle">${esc(card.split(' ')[0])}</text></g>` : ''}<g class="nb-gl">${glyph}</g></g>`);
      if (c.k === 'barrier') { parts.push(`<line x1="${x}" x2="${x}" y1="${T - 6}" y2="${H - 4}" class="nb-barrier"/><text x="${x}" y="${T - 10}" text-anchor="middle" class="nb-svgt nb-phase">${c.label}</text>`); return; }
      if (c.k === 'error') { const yy = y(c.t); parts.push(`<g class="nb-g${future}"><rect x="${x - 12}" y="${yy - 12}" width="24" height="24" rx="4" class="nb-err"/><text x="${x}" y="${yy + 4}" text-anchor="middle" class="nb-svgt nb-errt" font-size="${c.label.length > 2 ? 6 : 11}">${esc(c.label)}</text><title>gremlin: ${esc(c.label)} on ${c.t}</title></g>`); return; }
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
        g(`<rect x="${x - 13}" y="${yy - 12}" width="26" height="24" rx="4" class="nb-box gR"/><text x="${x}" y="${yy + 4}" text-anchor="middle" class="nb-svgt" font-size="9.5">|0⟩</text><title>${esc(c.card)}</title>`, c.card, yy);
      } else if (c.k === 'measure') {
        const yy = y(c.t);
        g(`<rect x="${x - 13}" y="${yy - 12}" width="26" height="24" rx="4" class="nb-box gM"/><path d="M${x - 8} ${yy + 5} a8 8 0 0 1 16 0" fill="none" stroke="#0e0e0e" stroke-width="1.6"/><line x1="${x}" y1="${yy + 5}" x2="${x + 6}" y2="${yy - 5}" stroke="#0e0e0e" stroke-width="1.6"/><text x="${x + 13}" y="${yy + 20}" text-anchor="end" class="nb-svgt nb-bit b${c.bit}">${c.bit}</text><title>${esc(c.card)} → ${c.bit}</title>`, c.card, yy);
      }
    });
    const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="nb-circ${morph ? ' nb-morph' : ''}" role="img" aria-label="circuit diagram of this night">${parts.join('')}</svg>`;
    if (morph) { lsSet(LS.morphed, '1'); morphUntil = performance.now() + 900 + cols.length * 45 + 600; setTimeout(() => { lastKey = ''; schedule(); }, morphUntil - performance.now() + 30); }
    const prevScroll = (body.querySelector('.nb-cscroll') as HTMLElement | null)?.scrollLeft ?? 0;
    const scroller = h('div', { class: 'nb-cscroll', html: svg });
    requestAnimationFrame(() => { scroller.scrollLeft = prevScroll; });
    requestAnimationFrame(() => { if (cur >= 0 && scroller.scrollWidth > scroller.clientWidth) { const cx = L + cur * CW + CW / 2; if (cx < scroller.scrollLeft + 20 || cx > scroller.scrollLeft + scroller.clientWidth - 20) scroller.scrollLeft = Math.max(0, cx - scroller.clientWidth * 0.6); } });
    const labBox = h('div', { html: labSvg });
    // ?cinema=1&nb=1: the circuit SVG is stretched to the drawer width; scale the wire-label column to match
    if (cinema.on && cinema.nb) {
      // iterate: widening the label column narrows (and so shortens) the stretched circuit; converges in a few frames
      const fit = (k: number) => requestAnimationFrame(() => { const sv = scroller.querySelector('svg'), lab = labBox.querySelector('svg'); if (sv && lab) { lab.style.height = sv.getBoundingClientRect().height + 'px'; lab.style.width = 'auto'; } if (k > 0) fit(k - 1); });
      fit(4);
    }
    const legend = h('div', { class: 'nb-clegend' }, ...[['BOOP', 'X'], ['SHUSH', 'Z'], ['SPIN', 'H'], ['HIGHFIVE', 'CNOT'], ['LISTEN', 'meter'], ['PEEK', 'meter'], ['RESET', '|0⟩'], ['IF BEEP', '═ control']].map(([a, b]) => h('span', null, h('b', null, a), ' = ', b)),
      ...(u.xray ? [h('span', { class: 'err' }, h('b', null, 'red'), ' = gremlin (X-ray)')] : []));
    return h('div', null, h('p', { class: 'nb-big' }, 'Your Bot Code is a quantum circuit.'), h('div', { class: 'nb-cwrap' }, labBox, scroller), legend);
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
    const bots = o.level.bots.map((b) => b.id);
    const rec = n?.record ?? recordFromTrace(night, u.step);
    // accumulate the syndrome table at the end of each night
    if (u.step >= night.steps.length - 1 && !seenNights.has(night)) {
      seenNights.add(night);
      const full = night.steps[night.steps.length - 1]?.snap.nerd?.record ?? recordFromTrace(night, night.steps.length - 1);
      const s = syndromeOf(full, bots) || '(no bot listened)';
      let row = synTable.get(s); if (!row) synTable.set(s, (row = { errs: new Set(), pass: 0, fail: 0 }));
      night.errors.forEach((e) => row!.errs.add(`${errLabel(e)}·${e.t}`)); if (!night.errors.length) row.errs.add('none');
      if (night.pass) row.pass++; else row.fail++;
    }
    const stabRows = (n?.stabilizers ?? []).map((st) => {
      const v = st.value, show = u.xray;
      const badge = !show ? '<span class="nb-badge q">?</span>' : Math.abs(v - 1) < 0.02 ? '<span class="nb-badge p">+1</span>' : Math.abs(v + 1) < 0.02 ? '<span class="nb-badge m">−1</span>' : `<span class="nb-badge z">${v.toFixed(2)}</span>`;
      return `<tr><td>⟨${st.label}⟩</td><td class="nb-num">${show ? v.toFixed(3) : '🙈'}</td><td>${badge}</td></tr>`;
    }).join('');
    const chips = rec.length ? rec.map((r) => `<span class="nb-chip b${r.bit}">${r.who}:${r.bit ? 'BEEP' : 'quiet'}</span>`).join('') : '<span class="nb-cap">nothing heard yet</span>';
    const syn = [...synTable.entries()].map(([s, r]) => `<tr><td><code>${s}</code></td><td>${u.xray ? [...r.errs].join(', ') : '🙈'}</td><td>${r.pass ? `<span class="nb-badge p">${r.pass}✓</span>` : ''}${r.fail ? `<span class="nb-badge m">${r.fail}✗</span>` : ''}</td></tr>`).join('');
    const fid = u.xray ? (n?.fidelity ?? u.snap?.logicalFidelity) : undefined;
    const wrap = h('div', { class: 'nb-stab' },
      stabRows ? h('table', { class: 'nb-table', html: `<thead><tr><th>check</th><th>value</th><th></th></tr></thead><tbody>${stabRows}</tbody>` }) : h('p', { class: 'nb-cap' }, 'No parity checks in this room.'),
      h('div', { class: 'nb-sub' }, 'Measurement record'), h('div', { class: 'nb-chips', html: chips }),
      h('div', { class: 'nb-sub' }, 'Syndrome table (built from your runs)'),
      syn ? h('table', { class: 'nb-table', html: `<thead><tr><th>bots heard</th><th>gremlin</th><th>result</th></tr></thead><tbody>${syn}</tbody>` }) : h('p', { class: 'nb-cap' }, 'Finish a night and I\'ll start the table.'));
    if (fid != null) {
      wrap.append(h('div', { class: 'nb-sub' }, 'Logical fidelity'), h('div', { class: 'nb-fid' }, h('span', { class: 'nb-abar' }, h('i', { style: `width:${(fid * 100).toFixed(1)}%;background:${fid > 0.999 ? '#3ddc97' : fid > 0.5 ? '#ffb72b' : '#fe443d'}` })), h('span', { class: 'nb-num' }, fid.toFixed(4))));
      if (survived(night, u.step)) wrap.append(h('div', { class: 'nb-survived' + (reduced ? '' : ' slap') }, 'LOGICAL QUBIT', h('br'), 'SURVIVED ✓'));
    }
    return wrap;
  }
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
    const mark = p0 != null && p0 <= 0.5 ? `<circle cx="${X(p0)}" cy="${Y(logical(p0))}" r="5" fill="#fe443d" stroke="#0e0e0e" stroke-width="1.8"/><text x="${X(p0) + 8}" y="${Y(logical(p0)) - 6}" class="nb-svgt" font-size="9">this room: p=${p0}</text>` : '';
    const ticks = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => `<text x="${X(t)}" y="${H - 10}" text-anchor="middle" class="nb-svgt" font-size="8">${t}</text><text x="${L - 4}" y="${Y(t) + 3}" text-anchor="end" class="nb-svgt" font-size="8">${t}</text>`).join('');
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="nb-thr" role="img" aria-label="logical versus physical error rate">
      <polygon points="${X(0)},${Y(0)} ${pts(logical)} ${X(0.5)},${Y(0.5)} ${pts((p) => p).split(' ').reverse().join(' ')}" fill="rgba(61,220,151,0.25)"/>
      <line x1="${L}" y1="${10 + ph}" x2="${W - 10}" y2="${10 + ph}" stroke="#0e0e0e" stroke-width="1.6"/><line x1="${L}" y1="10" x2="${L}" y2="${10 + ph}" stroke="#0e0e0e" stroke-width="1.6"/>
      <polyline points="${pts((p) => p)}" fill="none" stroke="#8a867d" stroke-width="2" stroke-dasharray="4 3"/>
      <polyline points="${pts(logical)}" fill="none" stroke="#6c63ff" stroke-width="2.6"/>
      ${ticks}${mark}
      <text x="${X(0.31)}" y="${Y(0.36)}" class="nb-svgt" font-size="9" fill="#55524b">one Qubble: p</text>
      <text x="${X(0.06)}" y="${Y(0.05) - 10}" class="nb-svgt" font-size="9" fill="#4b43d6">three: 3p² − 2p³</text>
      <text x="${X(0.25)}" y="${H - 1}" text-anchor="middle" class="nb-svgt" font-size="8.5">physical error p</text></svg>`;
    return h('div', null, h('div', { html: svg }), h('p', { class: 'nb-cap' }, 'The green gap is where the 3-qubit code helps. The curves cross at p = 1/2: past that, majority vote makes things worse. This crossing is a pseudo-threshold. The real threshold is where bigger codes start beating smaller ones.'));
  }

  // ── density matrix ──
  let prevDens: { night: number; step: number; sel: number; rho: C[][] } | null = null;
  function densityView(n: NerdInfo): HTMLElement {
    const ids = n.order;
    const opts: { label: string; idx: number[] }[] = ids.map((q, i) => ({ label: q, idx: [i] }));
    const qb = ids.map((q, i) => [q, i] as const).filter(([q]) => q.startsWith('q'));
    for (let i = 0; i + 1 < qb.length && i < 4; i++) opts.push({ label: `${qb[i][0]} ${qb[i + 1][0]}`, idx: [qb[i][1], qb[i + 1][1]] });
    // data ⊗ bot pairs: where the coherence lives right before a LISTEN (watch it snap away)
    const bt = ids.map((q, i) => [q, i] as const).filter(([q]) => !q.startsWith('q'));
    for (const [q, i] of qb.slice(0, 5)) for (const [b, j] of bt.slice(0, 3)) opts.push({ label: `${q} ${b}`, idx: [i, j] });
    if (focusQ) { const fi = ids.indexOf(focusQ); if (fi >= 0) { densSel = fi; prevDens = null; } focusQ = null; }
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
    select.onchange = () => { densSel = +select.value; prevDens = null; lastKey = ''; schedule(); };
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
      h('div', { class: 'nb-row2' }, grid('re'), grid('im')),
      h('p', { class: 'nb-cap' }, `largest off-diagonal |ρᵢⱼ| = ${off.toFixed(3)}${off < 0.01 ? ' (classical: nothing left to lose)' : ' (coherence)'}${n.truncated ? ' · from the 256 biggest amplitudes' : ''}`));
    if (caught) wrap.append(h('div', { class: 'nb-caught' + (reduced ? '' : ' slap') }, 'error discretization,', h('br'), 'caught in the act'), h('p', { class: 'nb-cap' }, 'The half-flip\'s coherence just leaked into the bot. From here on it is either flipped or not: a plain X error the code can fix, and the LISTEN will say which.'));
    return wrap;
  }
  const cellColor = (v: number) => { const a = Math.min(1, Math.abs(v) * 1.6); return v >= 0 ? `rgba(255,183,43,${(0.08 + 0.85 * a).toFixed(3)})` : `rgba(108,99,255,${(0.08 + 0.85 * a).toFixed(3)})`; };

  // ── export ──
  let exportLang: 'qiskit' | 'qasm3' = 'qiskit', exportErr = false, exportDyn = false;
  function exportView(): HTMLElement {
    const night = u.night!;
    const code = h('pre', { class: 'nb-code' }, h('code', null, '…'));
    const status = h('span', { class: 'nb-cap' });
    const prog = o.prog?.();
    const fill = () => {
      const includeErrors = exportErr && u.xray;
      let text = '', own = false;
      try {
        const opts = { includeErrors, prog, dynamic: exportDyn && !!prog };
        text = exportLang === 'qiskit' ? toQiskit(o.level, night, opts) : toOpenQASM3(o.level, night, opts);
      } catch { /* fall back to the notebook's own transcription */ }
      if (!text) { text = transcribe(night, o.level, exportLang, includeErrors); own = true; }
      code.firstChild!.textContent = text;
      status.textContent = own ? 'transcribed by the notebook (exporter unavailable)' : exportDyn && prog ? 'dynamic circuit (falls back to the executed path if the program can\'t be expressed; see the header)' : 'the exact path this night executed';
    };
    const pill = (on: boolean, label: string, act: () => void) => { const b = h('button', { class: 'btn small' + (on ? ' sun' : '') }, label); b.onclick = () => { act(); lastKey = ''; render(true); }; return b; };
    const errBox = h('input', { type: 'checkbox', checked: exportErr && u.xray, disabled: !u.xray });
    errBox.onchange = () => { exportErr = (errBox as HTMLInputElement).checked; fill(); };
    const copy = h('button', { class: 'btn small' }, 'Copy');
    copy.onclick = async () => { try { await navigator.clipboard.writeText(code.textContent ?? ''); copy.textContent = 'Copied ✓'; } catch { copy.textContent = 'Select + Ctrl-C'; } setTimeout(() => (copy.textContent = 'Copy'), 1400); };
    fill();
    return h('div', { class: 'nb-export' },
      h('div', { class: 'nb-row' }, pill(exportLang === 'qiskit', 'Qiskit (Python)', () => (exportLang = 'qiskit')), pill(exportLang === 'qasm3', 'OpenQASM 3', () => (exportLang = 'qasm3')), copy),
      h('div', { class: 'nb-row' }, pill(!exportDyn, 'executed path', () => (exportDyn = false)), prog ? pill(exportDyn, 'dynamic circuit', () => (exportDyn = true)) : h('span', { class: 'nb-cap' }, '(dynamic circuit needs your program)')),
      h('label', { class: 'nb-cap' }, errBox, u.xray ? ' include gremlin errors' : ' include gremlin errors (needs X-ray)'),
      code, status);
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
    return h('div', { class: 'nb-dark' },
      h('p', null, 'Lights out. The notebook can\'t see in the dark either. All I have is what the bots hum:'),
      h('div', { html: `<svg viewBox="0 0 ${W} ${H}" class="nb-wave" role="img" aria-label="syndrome bits"><line x1="4" x2="${W - 4}" y1="${mid}" y2="${mid}" stroke="#3a3a66" stroke-width="1"/><path d="${d}" fill="none" stroke="#7ff0b8" stroke-width="2.2" stroke-linejoin="round"/>${labels}</svg>` }),
      h('p', { class: 'nb-cap' }, rec.length ? rec.map((r) => `${r.who}=${r.bit}`).join('  ') : 'silence so far'));
  }

  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

  buildTabs();
  if (open) render(true);

  return {
    update(nu: NerdUpdate) { u = nu; if (open) schedule(); },
    pulseUnlock(id: NerdPageId) {
      if (seen.has(id)) return; // already read: no badge, no wiggle (judge mode re-pulses everything)
      fresh.add(id);
      const note = UNLOCK_NOTE[id]; if (note) pendingNote.set(id, note);
      spine.classList.remove('wiggle'); void spine.offsetWidth; spine.classList.add('wiggle');
      if (open) buildTabs();
    },
    openPage(id: NerdPageId, focus?: { qubit?: QubitId }) {
      if (!unlocked(def(id))) return;
      focusQ = focus?.qubit ?? null;
      if (!open) { page = id; lsSet(LS.page, id); setOpen(true); } else go(id);
      lastKey = ''; render(true);
    },
    destroy() { dead = true; ro.disconnect(); if (raf) cancelAnimationFrame(raf); disposePage(); removeEventListener('keydown', onKey); root.remove(); nightIds = new WeakMap(); },
  };
}
