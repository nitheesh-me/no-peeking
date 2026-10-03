/**
 * The loading bar IS a quantum circuit being assembled. Pure SVG, no three.js / d3 (it runs while they load).
 * Each real loading stage places one gate column on five wires; finish(outcomes) measures every wire and the
 * Born-sampled bits resolve into the wordmark. The drawn circuit is exactly loadingCircuitColumns(n): sample
 * it with sampleLoadingOutcomes() (exact 32-amplitude simulation) or run loadingCircuitProgram() through src/quantum.
 */
import { frame, svgEl, tv, resolveRM, resolveTheme, type VizBaseOpts } from './common';
import { bytes as fmtBytes, toSub } from '../theme/math';
import { rgba } from '../theme/theme';
import type { Op, Program } from '../../../core/contracts';

export type LoadOp = { g: 'H' | 'X' | 'Z'; q: number } | { g: 'CX'; c: number; t: number };
const PATTERN: LoadOp[][] = [
  [{ g: 'H', q: 0 }, { g: 'H', q: 2 }, { g: 'H', q: 4 }],
  [{ g: 'CX', c: 0, t: 1 }, { g: 'CX', c: 2, t: 3 }],
  [{ g: 'H', q: 1 }, { g: 'H', q: 3 }, { g: 'Z', q: 4 }],
  [{ g: 'CX', c: 1, t: 2 }, { g: 'CX', c: 4, t: 3 }],
  [{ g: 'H', q: 0 }, { g: 'X', q: 3 }],
  [{ g: 'CX', c: 3, t: 4 }, { g: 'H', q: 2 }],
  [{ g: 'CX', c: 0, t: 1 }, { g: 'H', q: 4 }],
];
export const WIRES = 5;
/** The circuit drawn for n stages (one column per stage). */
export function loadingCircuitColumns(n: number): LoadOp[][] {
  return Array.from({ length: n }, (_, i) => PATTERN[i % PATTERN.length]);
}
/** Same circuit in the shared Bot Code (SPIN = H, BOOP = X, SHUSH = Z, HIGHFIVE = CNOT) on q1..q5. */
export function loadingCircuitProgram(n: number): Program {
  const q = (i: number) => `q${i + 1}` as const;
  return loadingCircuitColumns(n).flat().map((o): Op =>
    o.g === 'CX' ? { op: 'HIGHFIVE', from: q(o.c), to: q(o.t) } : { op: o.g === 'H' ? 'SPIN' : o.g === 'X' ? 'BOOP' : 'SHUSH', t: q(o.q) });
}
/** Exact state-vector simulation of the drawn circuit, then one Born-rule sample of all five wires. */
export function sampleLoadingOutcomes(n: number, rand: () => number = Math.random): (0 | 1)[] {
  const N = 1 << WIRES;
  let re = new Float64Array(N), im = new Float64Array(N);
  re[0] = 1;
  const bit = (q: number) => 1 << (WIRES - 1 - q); // wire 0 = leftmost ket bit
  for (const col of loadingCircuitColumns(n)) for (const o of col) {
    if (o.g === 'H') {
      const m = bit(o.q), s = Math.SQRT1_2;
      for (let i = 0; i < N; i++) if (!(i & m)) {
        const j = i | m, ar = re[i], ai = im[i], br = re[j], bi = im[j];
        re[i] = s * (ar + br); im[i] = s * (ai + bi); re[j] = s * (ar - br); im[j] = s * (ai - bi);
      }
    } else if (o.g === 'Z') { const m = bit(o.q); for (let i = 0; i < N; i++) if (i & m) { re[i] = -re[i]; im[i] = -im[i]; } }
    else {
      const nr = new Float64Array(N), ni = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const j = o.g === 'X' ? i ^ bit(o.q) : o.g === 'CX' ? (i & bit(o.c) ? i ^ bit(o.t) : i) : i;
        nr[j] = re[i]; ni[j] = im[i];
      }
      re = nr; im = ni;
    }
  }
  let r = rand(), k = 0;
  for (; k < N - 1; k++) { r -= re[k] * re[k] + im[k] * im[k]; if (r < 0) break; }
  return Array.from({ length: WIRES }, (_, q) => ((k & bit(q)) ? 1 : 0) as 0 | 1);
}

export interface LoadingCircuitOpts extends VizBaseOpts {
  /** wordmark the outcomes resolve into (default afi.viz.loading.wordmark) */
  wordmark?: string;
}
export interface LoadingCircuit {
  stageStart(i: number): void;
  stageDone(i: number, bytes?: number): void;
  finish(outcomes: (0 | 1)[]): Promise<void>;
  destroy(): void;
}

const VB_W = 1000, VB_H = 440;
const X0 = 130, X1 = 830, XM = 880; // wire start/end, meters
const yOf = (q: number) => 92 + q * 50;

export function createLoadingCircuit(host: HTMLElement, stages: { id?: string; label: string }[], opts: LoadingCircuitOpts = {}): LoadingCircuit {
  const th = resolveTheme(opts), rm = resolveRM(opts);
  const f = frame(host, 'afi-loading', tv('loading.aria'));
  f.root.setAttribute('role', 'progressbar');
  f.root.setAttribute('aria-valuemin', '0');
  f.root.setAttribute('aria-valuemax', String(stages.length));
  f.root.setAttribute('aria-valuenow', '0');
  const n = stages.length, cols = loadingCircuitColumns(n);
  const colX = (k: number) => (n === 1 ? (X0 + X1) / 2 : X0 + 70 + (k * (X1 - X0 - 120)) / (n - 1));

  const svg = svgEl('svg', { class: 'afi-viz-svg', viewBox: `0 0 ${VB_W} ${VB_H}`, preserveAspectRatio: 'xMidYMid meet' }, f.root);
  const style = svgEl('style', {}, svg);
  style.textContent = `
    .lc-mono{font-family:${th.fonts.mono};font-variant-numeric:tabular-nums}
    .lc-gate{transition:opacity ${th.motion.base}ms ${th.motion.ease},transform ${th.motion.base}ms ${th.motion.ease};transform-box:fill-box;transform-origin:center}
    .lc-pending{opacity:0;transform:scale(.6)}
    .lc-ghost{animation:lcBreathe 1.8s ${th.motion.ease} infinite alternate}
    .lc-lab{transition:fill ${th.motion.base}ms, opacity ${th.motion.base}ms}
    @keyframes lcBreathe{from{opacity:.25}to{opacity:.85}}
    .lc-fade{transition:opacity ${th.motion.slow}ms ${th.motion.ease}}
    ${rm ? '.lc-gate,.lc-fade,.lc-lab{transition:none!important}.lc-ghost{animation:none;opacity:.6}' : ''}`;
  const defs = svgEl('defs', {}, svg);
  const glow = svgEl('filter', { id: 'lcGlow', filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: VB_W, height: VB_H }, defs);
  svgEl('feGaussianBlur', { stdDeviation: 3.2, result: 'b' }, glow);
  const fm = svgEl('feMerge', {}, glow);
  svgEl('feMergeNode', { in: 'b' }, fm); svgEl('feMergeNode', { in: 'SourceGraphic' }, fm);
  const wg = svgEl('linearGradient', { id: 'lcWire', gradientUnits: 'userSpaceOnUse', x1: X0, x2: X1 + 20, y1: 0, y2: 0 }, defs);
  svgEl('stop', { offset: '0%', 'stop-color': th.accent, 'stop-opacity': 0.05 }, wg);
  svgEl('stop', { offset: '12%', 'stop-color': th.accent, 'stop-opacity': 0.9 }, wg);
  svgEl('stop', { offset: '100%', 'stop-color': th.accent, 'stop-opacity': 0.9 }, wg);

  const circuit = svgEl('g', { class: 'lc-fade' }, svg);
  // title line (status)
  const status = svgEl('text', { x: X0 - 70, y: 40, class: 'lc-mono', 'font-size': 13, fill: th.ink2, 'letter-spacing': '0.08em' }, circuit);
  // wires
  const lit: SVGLineElement[] = [];
  for (let q = 0; q < WIRES; q++) {
    const y = yOf(q);
    svgEl('text', { x: X0 - 70, y: y + 5, class: 'lc-mono', 'font-size': 15, fill: th.ink2 }, circuit).textContent = 'q' + toSub(String(q));
    svgEl('text', { x: X0 - 34, y: y + 5, class: 'lc-mono', 'font-size': 15, fill: th.ink3 }, circuit).textContent = '|0⟩';
    svgEl('line', { x1: X0, x2: X1 + 20, y1: y, y2: y, stroke: th.accent, 'stroke-opacity': 0.12, 'stroke-width': 1.2 }, circuit);
    const l = svgEl('line', { x1: X0, x2: X0, y1: y, y2: y, stroke: 'url(#lcWire)', 'stroke-width': 1.8, filter: 'url(#lcGlow)' }, circuit);
    lit.push(l);
  }
  // gate columns (drawn now, revealed per stage)
  const colG: SVGGElement[] = [], ghostG: SVGGElement[] = [], labs: { name: SVGTextElement; sub: SVGTextElement }[] = [];
  const drawGate = (g: SVGGElement, o: LoadOp, x: number, ghost: boolean) => {
    const stroke = ghost ? th.ink3 : o.g === 'CX' ? th.accent : th.accent2;
    const sw = ghost ? 1 : 1.6;
    const dash = ghost ? '3 3' : '';
    if (o.g === 'CX') {
      const yc = yOf(o.c), yt = yOf(o.t);
      svgEl('line', { x1: x, x2: x, y1: yc, y2: yt + (yt > yc ? 11 : -11), stroke, 'stroke-width': sw, 'stroke-dasharray': dash }, g);
      svgEl('circle', { cx: x, cy: yc, r: 5, fill: ghost ? 'none' : stroke, stroke, 'stroke-width': sw, 'stroke-dasharray': dash }, g);
      svgEl('circle', { cx: x, cy: yt, r: 11, fill: rgba(th.bg[0], 0.9), stroke, 'stroke-width': sw, 'stroke-dasharray': dash }, g);
      svgEl('path', { d: `M${x - 11} ${yt}H${x + 11}M${x} ${yt - 11}V${yt + 11}`, stroke, 'stroke-width': sw }, g);
    } else {
      const y = yOf(o.q);
      svgEl('rect', { x: x - 14, y: y - 14, width: 28, height: 28, rx: 5, fill: rgba(th.bg[0], 0.92), stroke, 'stroke-width': sw, 'stroke-dasharray': dash }, g);
      svgEl('text', { x, y: y + 5.5, 'text-anchor': 'middle', class: 'lc-mono', 'font-size': 15, fill: ghost ? th.ink3 : th.ink }, g).textContent = o.g;
    }
  };
  for (let k = 0; k < n; k++) {
    const x = colX(k);
    const gh = svgEl('g', { opacity: 0 }, circuit);
    cols[k].forEach((o) => drawGate(gh, o, x, true));
    ghostG.push(gh);
    const g = svgEl('g', { class: 'lc-gate lc-pending', filter: 'url(#lcGlow)' }, circuit);
    cols[k].forEach((o) => drawGate(g, o, x, false));
    colG.push(g);
    const ly = yOf(WIRES - 1) + 50 + (n > 5 && k % 2 ? 30 : 0);
    svgEl('line', { x1: x, x2: x, y1: yOf(WIRES - 1) + 20, y2: ly - 14, stroke: th.ink3, 'stroke-opacity': 0.35, 'stroke-dasharray': '1 3' }, circuit);
    const name = svgEl('text', { x, y: ly, 'text-anchor': 'middle', class: 'lc-mono lc-lab', 'font-size': 12, fill: th.ink3 }, circuit);
    name.textContent = stages[k].label;
    const sub = svgEl('text', { x, y: ly + 15, 'text-anchor': 'middle', class: 'lc-mono lc-lab', 'font-size': 11, fill: th.ink3, opacity: 0.8 }, circuit);
    labs.push({ name, sub });
  }
  // meters (hidden until finish)
  const meters = svgEl('g', { class: 'lc-fade', opacity: 0 }, svg);
  const needles: SVGLineElement[] = [], bitsT: SVGTextElement[] = [];
  for (let q = 0; q < WIRES; q++) {
    const y = yOf(q);
    svgEl('rect', { x: XM - 18, y: y - 15, width: 36, height: 30, rx: 5, fill: rgba(th.bg[0], 0.92), stroke: th.accent, 'stroke-width': 1.4 }, meters);
    svgEl('path', { d: `M${XM - 11} ${y + 7}A12 12 0 0 1 ${XM + 11} ${y + 7}`, fill: 'none', stroke: th.accent, 'stroke-width': 1.2 }, meters);
    const nd = svgEl('line', { x1: XM, y1: y + 8, x2: XM, y2: y - 7, stroke: th.accent2, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, meters);
    needles.push(nd);
    svgEl('line', { x1: XM + 18, x2: XM + 44, y1: y - 1.5, y2: y - 1.5, stroke: th.ink3, 'stroke-width': 1 }, meters);
    svgEl('line', { x1: XM + 18, x2: XM + 44, y1: y + 1.5, y2: y + 1.5, stroke: th.ink3, 'stroke-width': 1 }, meters);
    const bt = svgEl('text', { x: XM + 62, y: y + 7, 'text-anchor': 'middle', class: 'lc-mono', 'font-size': 20, fill: th.ink, filter: 'url(#lcGlow)', opacity: 0 }, meters);
    bitsT.push(bt);
  }
  const wordG = svgEl('g', { class: 'lc-fade', opacity: 0 }, svg);
  f.mountChrome();
  f.setCaption(opts.caption ?? tv('loading.caption'));

  let done = 0, active = -1, destroyed = false;
  const timers: number[] = [];
  const later = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, rm ? 0 : ms)));
  const setStatus = () => {
    status.textContent = tv('loading.status', { done, total: n, stage: active >= 0 && active < n ? stages[active].label : '' });
    f.root.setAttribute('aria-valuenow', String(done));
    f.root.setAttribute('aria-valuetext', status.textContent ?? '');
  };
  let wireX = X0, wireRaf = 0;
  const advanceWires = () => {
    const to = done >= n ? X1 + 20 : colX(Math.max(0, done - 1)) + (done ? 20 : 0);
    const from = wireX, t0 = performance.now(), dur = rm ? 0 : th.motion.slow;
    cancelAnimationFrame(wireRaf);
    const tick = (now: number) => {
      const u = dur ? Math.min(1, (now - t0) / dur) : 1;
      wireX = from + (to - from) * th.motion.easeFn(u);
      lit.forEach((l) => l.setAttribute('x2', String(wireX)));
      if (u < 1 && !destroyed) wireRaf = requestAnimationFrame(tick);
    };
    wireRaf = requestAnimationFrame(tick);
  };
  setStatus();

  let raf = 0;
  return {
    stageStart(i) {
      if (destroyed || i < 0 || i >= n) return;
      active = i;
      ghostG[i].setAttribute('opacity', '1');
      ghostG[i].classList.add('lc-ghost');
      labs[i].name.setAttribute('fill', th.ink2);
      labs[i].sub.textContent = '…';
      setStatus();
    },
    stageDone(i, b) {
      if (destroyed || i < 0 || i >= n) return;
      ghostG[i].classList.remove('lc-ghost');
      ghostG[i].setAttribute('opacity', '0');
      colG[i].classList.remove('lc-pending');
      labs[i].name.setAttribute('fill', th.ink);
      labs[i].sub.textContent = b != null ? fmtBytes(b) : tv('loading.done');
      labs[i].sub.setAttribute('fill', th.accent);
      done = Math.max(done, i + 1);
      if (active === i) active = -1;
      advanceWires();
      setStatus();
    },
    async finish(outcomes) {
      if (destroyed) return;
      done = n; advanceWires();
      status.textContent = tv('loading.measuring');
      meters.setAttribute('opacity', '1');
      await later(500);
      // needles swing, then settle on the sampled bit (−35° = 0, +35° = 1)
      await new Promise<void>((res) => {
        if (rm) { res(); return; }
        const t0 = performance.now();
        const tick = (now: number) => {
          const u = (now - t0) / 1400;
          needles.forEach((nd, q) => {
            const target = outcomes[q] ? 35 : -35;
            const sw = u < 1 ? Math.sin(u * 9 + q) * 45 * (1 - u) + target * u : target;
            nd.setAttribute('transform', `rotate(${sw} ${XM} ${yOf(q) + 8})`);
          });
          if (u < 1 && !destroyed) raf = requestAnimationFrame(tick); else res();
        };
        raf = requestAnimationFrame(tick);
      });
      needles.forEach((nd, q) => nd.setAttribute('transform', `rotate(${outcomes[q] ? 35 : -35} ${XM} ${yOf(q) + 8})`));
      for (let q = 0; q < WIRES; q++) { bitsT[q].textContent = String(outcomes[q] ?? 0); bitsT[q].setAttribute('opacity', '1'); bitsT[q].setAttribute('fill', outcomes[q] ? th.accent2 : th.accent); await later(110); }
      const ketStr = outcomes.join('');
      status.textContent = tv('loading.measured', { ket: `|${ketStr}⟩` });
      await later(700);
      if (destroyed) return;
      // resolve: circuit dims, the measured bits scramble into the wordmark letters
      circuit.setAttribute('opacity', '0.07');
      meters.setAttribute('opacity', '0.45');
      wordG.setAttribute('opacity', '1');
      const word = opts.wordmark ?? tv('loading.wordmark');
      try { await Promise.race([document.fonts.load(`40px ${th.fonts.title}`), later(800)]); } catch { /* ignore */ }
      const big = svgEl('text', { x: VB_W / 2, y: VB_H / 2 - 4, 'text-anchor': 'middle', 'font-size': 40, 'font-family': th.fonts.title, fill: th.ink, 'letter-spacing': '0.14em', filter: 'url(#lcGlow)' }, wordG);
      const ket = svgEl('text', { x: VB_W / 2, y: VB_H / 2 + 38, 'text-anchor': 'middle', class: 'lc-mono', 'font-size': 14, fill: th.ink2, 'letter-spacing': '0.1em' }, wordG);
      ket.textContent = tv('loading.sampled', { ket: `|${ketStr}⟩` });
      const letters = [...word];
      const spans = letters.map((ch) => { const s = svgEl('tspan', {}, big); s.textContent = ch === ' ' ? ' ' : String(outcomes[0] ?? 0); return s; });
      await new Promise<void>((res) => {
        if (rm) { spans.forEach((s, i) => { s.textContent = letters[i]; }); res(); return; }
        const t0 = performance.now(), dur = 1600;
        const tick = (now: number) => {
          const u = (now - t0) / dur;
          spans.forEach((s, i) => {
            const lockAt = (i + 1) / letters.length;
            if (letters[i] === ' ' || u >= lockAt) { s.textContent = letters[i]; s.setAttribute('fill', th.ink); s.setAttribute('font-family', th.fonts.title); }
            else { s.textContent = String(outcomes[(i + Math.floor(now / 70)) % outcomes.length] ?? 0); s.setAttribute('fill', th.accent); s.setAttribute('font-family', th.fonts.mono); }
          });
          if (u < 1 && !destroyed) raf = requestAnimationFrame(tick); else res();
        };
        raf = requestAnimationFrame(tick);
      });
      spans.forEach((s, i) => { s.textContent = letters[i]; s.setAttribute('fill', th.ink); s.setAttribute('font-family', th.fonts.title); });
      f.setCaption('');
      await later(900);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf); cancelAnimationFrame(wireRaf);
      timers.forEach(clearTimeout);
      f.destroy();
    },
  };
}
