/**
 * Error discretisation, slowed down. The reduced density matrix ρ of the affected subsystem is shown across the
 * syndrome-extraction step. The freeze frame is chosen FROM THE DATA: the entangling gate with an ancilla after which
 * the off-diagonal weight reaches its floor (coherence between syndrome sectors has leaked into the ancillas). It is
 * never the measurement: the later measurement only selects a branch (ρ becomes the projected, pure branch state).
 * Between recorded gate steps the display interpolates linearly (said in the caption).
 */
import { frame, svgEl, tv, resolveRM, resolveTheme, type VizBaseOpts, type VizHandle } from './common';
import { phaseHex, rgba, type AfiTheme } from '../theme/theme';
import { num, qubitName, toSub } from '../theme/math';
import type { NerdInfo, QubitId, TraceEvent } from '../../../core/contracts';

type C = { re: number; im: number };
export interface FreezeStep { nerd: NerdInfo; ev?: TraceEvent }
export interface FreezeData {
  /** consecutive trace steps (e.g. NightResult.steps mapped to { nerd: snap.nerd, ev }); auto-cropped to noise → first measurements */
  steps: FreezeStep[];
  /** subsystem to trace down to (default: the data qubits q*) */
  subsystem?: QubitId[];
  /** override the detected freeze index (into the cropped steps) */
  freezeAt?: number;
}
export interface ProjectionFreeze extends VizHandle<FreezeData> { replay(): void }

/** reduced density matrix of the qubits at positions idx (in nerd.order) */
export function reducedRho(amps: { ket: string; re: number; im: number }[], idx: number[]): C[][] {
  const d = 1 << idx.length;
  const rho: C[][] = Array.from({ length: d }, () => Array.from({ length: d }, () => ({ re: 0, im: 0 })));
  const groups = new Map<string, { s: number; re: number; im: number }[]>();
  for (const a of amps) {
    let s = 0, rest = '';
    for (let i = 0; i < a.ket.length; i++) { const j = idx.indexOf(i); if (j >= 0) s |= (a.ket[i] === '1' ? 1 : 0) << (idx.length - 1 - j); else rest += a.ket[i]; }
    let g = groups.get(rest); if (!g) groups.set(rest, (g = []));
    g.push({ s, re: a.re, im: a.im });
  }
  for (const g of groups.values()) for (const u of g) for (const v of g) {
    rho[u.s][v.s].re += u.re * v.re + u.im * v.im;
    rho[u.s][v.s].im += u.im * v.re - u.re * v.im;
  }
  return rho;
}
const offWeight = (r: C[][]) => { let s = 0; for (let i = 0; i < r.length; i++) for (let j = 0; j < r.length; j++) if (i !== j) s += Math.hypot(r[i][j].re, r[i][j].im); return s; };
const purity = (r: C[][]) => { let s = 0; for (let i = 0; i < r.length; i++) for (let j = 0; j < r.length; j++) s += r[i][j].re ** 2 + r[i][j].im ** 2; return s; };
const gateName = (ev?: TraceEvent) => {
  if (!ev) return '';
  if (ev.k === 'gate') return ev.op === 'HIGHFIVE' ? `CNOT ${qubitName(ev.from ?? '')}→${qubitName(ev.t)}` : `${({ BOOP: 'X', SHUSH: 'Z', SPIN: 'H', RESET: 'reset' } as Record<string, string>)[ev.op] ?? ev.op} ${qubitName(ev.t)}`;
  if (ev.k === 'measure') return `M ${qubitName(ev.t)} = ${ev.result}`;
  if (ev.k === 'noise') return ev.e.kind === 'wobble' ? `R${ev.e.axis}(${num(ev.e.angle, 2)}) ${qubitName(ev.e.t)}` : `${ev.e.kind} ${qubitName(ev.e.t)}`;
  return '';
};

export function createProjectionFreeze(host: HTMLElement, opts: VizBaseOpts = {}): ProjectionFreeze {
  const th = resolveTheme(opts), rm = resolveRM(opts);
  const f = frame(host, 'afi-freeze', tv('freeze.aria'));
  const svg = svgEl('svg', { class: 'afi-viz-svg', viewBox: '0 0 1000 560', preserveAspectRatio: 'xMidYMid meet' }, f.root);
  const style = svgEl('style', {}, svg);
  style.textContent = `.pf-t{font-family:${th.fonts.mono};font-variant-numeric:tabular-nums}.pf-p{font-family:${th.fonts.prose}}`;
  const defs = svgEl('defs', {}, svg);
  const gf = svgEl('filter', { id: 'pfGlow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  svgEl('feGaussianBlur', { stdDeviation: 2.5, result: 'b' }, gf);
  const fm = svgEl('feMerge', {}, gf); svgEl('feMergeNode', { in: 'b' }, fm); svgEl('feMergeNode', { in: 'SourceGraphic' }, fm);
  const gMat = svgEl('g', {}, svg), gLine = svgEl('g', {}, svg);
  const note = document.createElement('div');
  note.className = 'afi-prose';
  note.style.cssText = `position:absolute;left:58%;right:24px;top:62%;font-size:calc(14px*var(--afi-scale,1));color:${th.ink};line-height:1.5;opacity:0;transition:opacity ${th.motion.slow}ms ${th.motion.ease}`;
  const replayBtn = document.createElement('button');
  replayBtn.className = 'afi-viz-btn'; replayBtn.textContent = tv('freeze.replay');
  replayBtn.style.cssText = 'position:absolute;right:12px;top:10px;z-index:2';
  f.mountChrome();
  f.root.append(note, replayBtn);
  f.setCaption(opts.caption ?? tv('freeze.caption'));

  let labels: string[] = [];
  let frames: { rho: C[][]; w: number; p: number; label: string; kind: string }[] = [];
  let freezeIdx = 0, measIdx = -1, dim = 0;
  let cells: SVGCircleElement[] = [];
  let raf = 0, destroyed = false, playT0 = 0;
  let marker: SVGCircleElement | null = null, purityT: SVGTextElement | null = null, stepT: SVGTextElement | null = null;
  let tlX: (i: number) => number = () => 0, tlY: (w: number) => number = () => 0;

  const build = () => {
    gMat.innerHTML = ''; gLine.innerHTML = '';
    const N = dim, size = Math.min(470 / N, 64), x0 = 70, y0 = 70;
    svgEl('text', { x: x0, y: 40, class: 'pf-t', 'font-size': 13, fill: th.ink2 }, gMat).textContent = `ρ (${labels.map(qubitName).join(' ')})`;
    cells = [];
    for (let i = 0; i < N; i++) {
      const k = i.toString(2).padStart(Math.log2(N), '0');
      svgEl('text', { x: x0 - 8, y: y0 + i * size + size / 2 + 4, 'text-anchor': 'end', class: 'pf-t', 'font-size': 10, fill: th.ink3 }, gMat).textContent = `|${k}⟩`;
      svgEl('text', { x: x0 + i * size + size / 2, y: y0 - 8, 'text-anchor': 'middle', class: 'pf-t', 'font-size': 10, fill: th.ink3 }, gMat).textContent = `⟨${k}|`;
      for (let j = 0; j < N; j++) {
        svgEl('rect', { x: x0 + j * size + 1, y: y0 + i * size + 1, width: size - 2, height: size - 2, rx: 3, fill: i === j ? rgba(th.accent, 0.06) : rgba(th.ink3, 0.06), stroke: i === j ? rgba(th.accent, 0.25) : 'none' }, gMat);
        cells.push(svgEl('circle', { cx: x0 + j * size + size / 2, cy: y0 + i * size + size / 2, r: 0, fill: th.accent, filter: 'url(#pfGlow)' }, gMat));
      }
    }
    // timeline of off-diagonal weight, one tick per recorded step
    const L = 580, R = 960, T = 90, B = 300, wmax = Math.max(0.05, ...frames.map((q) => q.w));
    tlX = (i) => L + (i * (R - L)) / Math.max(1, frames.length - 1);
    tlY = (w) => B - (w / wmax) * (B - T);
    svgEl('text', { x: L, y: T - 34, class: 'pf-t', 'font-size': 12, fill: th.ink2 }, gLine).textContent = tv('freeze.offdiag');
    svgEl('line', { x1: L, x2: R, y1: B, y2: B, stroke: rgba(th.ink3, 0.6) }, gLine);
    const d = frames.map((q, i) => `${i ? 'L' : 'M'}${tlX(i)} ${tlY(q.w)}`).join('');
    svgEl('path', { d, fill: 'none', stroke: th.accent, 'stroke-width': 2 }, gLine);
    frames.forEach((q, i) => {
      const isF = i === freezeIdx, isM = q.kind === 'measure';
      svgEl('circle', { cx: tlX(i), cy: tlY(q.w), r: isF ? 6 : 3.5, fill: isF ? th.accent2 : th.bg[0], stroke: isM ? th.ink2 : th.accent, 'stroke-width': 1.5 }, gLine);
      const t = svgEl('text', { x: tlX(i), y: B + 14, class: 'pf-t', 'font-size': 10, fill: isF ? th.accent2 : th.ink3, 'text-anchor': 'end', transform: `rotate(-40 ${tlX(i)} ${B + 14})` }, gLine);
      t.textContent = q.label;
    });
    marker = svgEl('circle', { cx: tlX(0), cy: tlY(frames[0]?.w ?? 0), r: 9, fill: 'none', stroke: th.ink, 'stroke-width': 1.5 }, gLine);
    stepT = svgEl('text', { x: L, y: T - 14, class: 'pf-t', 'font-size': 13, fill: th.ink }, gLine);
    purityT = svgEl('text', { x: R, y: T - 14, 'text-anchor': 'end', class: 'pf-t', 'font-size': 12, fill: th.ink2 }, gLine);
  };

  const show = (pos: number) => {
    const i = Math.max(0, Math.min(frames.length - 1, Math.floor(pos))), j = Math.min(frames.length - 1, i + 1), u = pos - i;
    const A = frames[i].rho, B = frames[j].rho;
    const N = dim, size = Math.min(470 / N, 64);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const re = A[r][c].re + (B[r][c].re - A[r][c].re) * u, im = A[r][c].im + (B[r][c].im - A[r][c].im) * u;
      const m = Math.hypot(re, im), el = cells[r * N + c];
      el.setAttribute('r', String(Math.sqrt(Math.min(1, m)) * size * 0.46));
      el.setAttribute('fill', r === c ? th.accent : phaseHex(Math.atan2(im, re), th));
      el.setAttribute('opacity', String(m < 1e-4 ? 0 : 0.35 + 0.65 * Math.min(1, m * 2)));
    }
    const w = frames[i].w + (frames[j].w - frames[i].w) * u;
    marker?.setAttribute('cx', String(tlX(pos))); marker?.setAttribute('cy', String(tlY(w)));
    if (stepT) stepT.textContent = frames[Math.round(pos)]?.label ?? '';
    if (purityT) purityT.textContent = `Tr ρ² = ${num(frames[i].p + (frames[j].p - frames[i].p) * u, 3)}`;
    const atF = Math.abs(pos - freezeIdx) < 0.02, afterM = measIdx >= 0 && pos >= measIdx;
    note.style.opacity = atF || afterM ? '1' : '0';
    if (atF) note.textContent = tv('freeze.frozen', { gate: frames[freezeIdx].label });
    else if (afterM) note.textContent = tv('freeze.measured');
  };

  const play = () => {
    cancelAnimationFrame(raf);
    if (!frames.length) return;
    if (rm) { show(freezeIdx); return; }
    // schedule: 1.1 s per step, hold 3.2 s on the freeze frame, 2 s at the end
    const seg: { from: number; to: number; dur: number }[] = [];
    for (let k = 0; k < frames.length - 1; k++) {
      seg.push({ from: k, to: k + 1, dur: 1100 });
      if (k + 1 === freezeIdx) seg.push({ from: freezeIdx, to: freezeIdx, dur: 3200 });
    }
    seg.push({ from: frames.length - 1, to: frames.length - 1, dur: 2000 });
    const total = seg.reduce((a, s) => a + s.dur, 0);
    playT0 = performance.now();
    const tick = (now: number) => {
      let t = now - playT0;
      if (t >= total) { show(frames.length - 1); return; }
      let k = 0; while (t > seg[k].dur) { t -= seg[k].dur; k++; }
      const s = seg[k], e = th.motion.easeFn(t / s.dur);
      show(s.from + (s.to - s.from) * e);
      if (!destroyed) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };
  replayBtn.onclick = play;

  return {
    update(d) {
      let st = d.steps.filter((s) => !s.ev || s.ev.k === 'gate' || s.ev.k === 'noise' || s.ev.k === 'measure');
      const ni = st.findIndex((s) => s.ev?.k === 'noise');
      const start = ni >= 0 ? ni : 0;
      const mi = st.findIndex((s, i) => i > start && s.ev?.k === 'measure');
      let end = mi >= 0 ? mi : st.length - 1;
      while (end + 1 < st.length && st[end + 1].ev?.k === 'measure') end++;
      // include one step before the first ancilla gate after the noise (context)
      st = st.slice(start, end + 1);
      const first = st[0].nerd;
      labels = (d.subsystem ?? first.order.filter((q) => q.startsWith('q'))).filter((q) => first.order.includes(q as QubitId));
      dim = 1 << labels.length;
      frames = st.map((s) => {
        const idx = labels.map((q) => s.nerd.order.indexOf(q as QubitId));
        const rho = reducedRho(s.nerd.amps, idx);
        return { rho, w: offWeight(rho), p: purity(rho), label: gateName(s.ev) || '·', kind: s.ev?.k ?? '' };
      });
      measIdx = frames.findIndex((q) => q.kind === 'measure');
      // freeze: the entangling gate after which (until the first measurement) the off-diagonal weight sits at its floor
      const pre = frames.slice(0, measIdx >= 0 ? measIdx : frames.length);
      const floor = Math.min(...pre.map((q) => q.w));
      let fi = pre.findIndex((q, i) => i > 0 && q.kind === 'gate' && pre.slice(i).every((r) => r.w <= floor + 1e-3) && pre[i - 1].w > floor + 1e-3);
      if (fi < 0) fi = pre.findIndex((q) => q.w <= floor + 1e-3);
      freezeIdx = d.freezeAt ?? Math.max(0, fi);
      build();
      play();
      f.root.setAttribute('aria-label', `${tv('freeze.aria')}. ${tv('freeze.frozen', { gate: frames[freezeIdx]?.label ?? '' })}`);
      void start;
    },
    replay: play,
    destroy() { destroyed = true; cancelAnimationFrame(raf); f.destroy(); },
  };
}
void toSub;
export type { AfiTheme };
