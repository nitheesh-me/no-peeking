/**
 * Stabilizer generators as tiles over the data qubits, coloured by expectation value: +1 calm, −1 lit
 * (fractional values in between). Sign flips ripple. Layouts: 'chain' (lanes above a row of qubits, e.g. Z₁Z₂, Z₂Z₃),
 * 'grid' (3×3 hull tiles, e.g. Shor's 8) and 'surface' (rotated d = 3 plaquettes). Pure SVG (no WebGL needed).
 */
import { veilable, frame, svgEl, tv, resolveRM, resolveTheme, type VizBaseOpts, type VizHandle } from './common';
import { pauliLabel, parsePauliLabel, fromSub, num, expect as fmtExpect, toSub } from '../theme/math';
import { mix, type AfiTheme } from '../theme/theme';
import { SURFACE_D3, type PauliErr } from './codes';
import type { NerdInfo } from '../../../core/contracts';
import type { VizInputLike } from './types';

export interface TilingData {
  /** expectation values by label (e.g. NerdInfo.stabilizers) */
  stabilizers?: { label: string; value: number }[];
  /** generators as Pauli strings in data-qubit order (AfiModuleMeta.stabilizers); default: parsed from the labels */
  generators?: string[];
  /** values aligned with generators (overrides label lookup) */
  values?: number[];
  /** optional error markers (shown in the error colour) */
  errors?: PauliErr[];
}
export interface TilingOpts extends VizBaseOpts { layout?: 'auto' | 'chain' | 'grid' | 'surface' }
export type StabilizerTiling = VizHandle<TilingData | VizInputLike>;

const norm = (s: string) => fromSub(s).replace(/[\s·⊗]/g, '');

export function createStabilizerTiling(host: HTMLElement, opts: TilingOpts = {}): StabilizerTiling {
  const th = resolveTheme(opts), rm = resolveRM(opts);
  const f = frame(host, 'afi-tiling', tv('tiling.aria'));
  const svg = svgEl('svg', { class: 'afi-viz-svg', preserveAspectRatio: 'xMidYMid meet' }, f.root);
  const style = svgEl('style', {}, svg);
  style.textContent = `
    .st-tile{transition:opacity ${th.motion.base}ms ${th.motion.ease}}
    .st-tile path{transition:fill-opacity ${th.motion.base}ms ${th.motion.ease},stroke-opacity ${th.motion.base}ms}
    .st-lit{filter:url(#stGlow);animation:stPulse 2.4s ${th.motion.ease} infinite alternate}
    @keyframes stPulse{from{opacity:.82}to{opacity:1}}
    .st-ripple{transition:r 1.1s ${th.motion.ease},opacity 1.1s ${th.motion.ease}}
    .st-t{font-family:${th.fonts.mono};font-variant-numeric:tabular-nums}
    ${rm ? '.st-lit{animation:none}.st-tile,.st-tile path,.st-ripple{transition:none}' : ''}`;
  const defs = svgEl('defs', {}, svg);
  const gf = svgEl('filter', { id: 'stGlow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
  svgEl('feGaussianBlur', { stdDeviation: 4, result: 'b' }, gf);
  const fm = svgEl('feMerge', {}, gf); svgEl('feMergeNode', { in: 'b' }, fm); svgEl('feMergeNode', { in: 'SourceGraphic' }, fm);
  const gTiles = svgEl('g', {}, svg), gNodes = svgEl('g', {}, svg), gFx = svgEl('g', {}, svg);
  f.mountChrome();
  f.setCaption(opts.caption ?? tv('oracle'));
  let key = '';
  let tiles: { g: SVGGElement; fill: SVGPathElement; text: SVGTextElement; val: SVGTextElement; cx: number; cy: number; v: number; color: string }[] = [];
  let nodes: { c: SVGCircleElement; mark: SVGTextElement; x: number; y: number }[] = [];

  const build = (gens: string[], layout: 'chain' | 'grid' | 'surface') => {
    gTiles.innerHTML = ''; gNodes.innerHTML = ''; gFx.innerHTML = '';
    const n = gens[0].length;
    const S = 90; // grid unit
    let P: { x: number; y: number }[] = [];
    let vb: [number, number, number, number];
    const shapes: { pts: { x: number; y: number }[]; r: number; tx: number; ty: number; rot?: boolean }[] = [];
    if (layout === 'chain') {
      // lanes: greedy interval packing above the qubit row
      const iv = gens.map((g) => { const ix = [...g].map((c, i) => (c !== 'I' ? i : -1)).filter((i) => i >= 0); return { lo: Math.min(...ix), hi: Math.max(...ix), ix }; });
      const laneEnd: number[] = [], lane: number[] = [];
      iv.forEach((it) => { let l = laneEnd.findIndex((e) => e < it.lo); if (l < 0) { l = laneEnd.length; laneEnd.push(-1); } laneEnd[l] = it.hi; lane.push(l); });
      const L = laneEnd.length, rowY = 70 + L * 64;
      P = Array.from({ length: n }, (_, i) => ({ x: 60 + i * S, y: rowY }));
      iv.forEach((it, k) => {
        const y = 52 + lane[k] * 64;
        shapes.push({ pts: [{ x: P[it.lo].x, y }, { x: P[it.hi].x, y }], r: 20, tx: (P[it.lo].x + P[it.hi].x) / 2, ty: y });
        it.ix.forEach((i) => svgEl('line', { x1: P[i].x, x2: P[i].x, y1: y + 6, y2: rowY - 14, stroke: th.ink3, 'stroke-opacity': 0.5, 'stroke-dasharray': '2 3' }, gTiles));
      });
      vb = [0, 0, 120 + (n - 1) * S, rowY + 56];
    } else {
      const side = Math.round(Math.sqrt(n)), M = 100;
      P = Array.from({ length: n }, (_, i) => ({ x: M + (i % side) * S, y: M + Math.floor(i / side) * S }));
      const ctr = { x: M + ((side - 1) * S) / 2, y: M + ((side - 1) * S) / 2 };
      const right = M + (side - 1) * S;
      let lanes = 0;
      gens.forEach((g) => {
        const ix = [...g].map((c, i) => (c !== 'I' ? i : -1)).filter((i) => i >= 0);
        let pts = ix.map((i) => ({ ...P[i] }));
        let tx = pts.reduce((a, p) => a + p.x, 0) / pts.length, ty = pts.reduce((a, p) => a + p.y, 0) / pts.length;
        let r = 20, rot = false;
        if (layout === 'surface' && ix.length === 2) {
          // boundary plaquette: a half-disc on the outside edge
          const ox = tx - ctr.x, oy = ty - ctr.y, d = Math.hypot(ox, oy) || 1, ux = ox / d, uy = oy / d;
          const a0 = Math.atan2(pts[0].y - ty, pts[0].x - tx), R = S / 2;
          const am = a0 - Math.PI / 2, sgn = Math.cos(am) * ux + Math.sin(am) * uy > 0 ? 1 : -1;
          pts = Array.from({ length: 13 }, (_, k) => { const a = a0 - sgn * (k / 12) * Math.PI; return { x: tx + Math.cos(a) * R, y: ty + Math.sin(a) * R }; });
          tx += ux * S * 0.24; ty += uy * S * 0.24; r = 4;
        } else if (layout === 'surface') {
          r = 6;
        } else if (ix.length > 4) {
          // high-weight generator (e.g. Shor X-type): a vertical lane to the right, spanning its rows
          const ys = ix.map((i) => P[i].y), y0 = Math.min(...ys), y1 = Math.max(...ys), x = right + 70 + lanes++ * 60;
          pts = [{ x, y: y0 }, { x, y: y1 }];
          tx = x; ty = (y0 + y1) / 2; r = 22; rot = true;
          [...new Set(ys)].forEach((y) => svgEl('line', { x1: right + 16, x2: x - 14, y1: y, y2: y, stroke: th.ink3, 'stroke-opacity': 0.45, 'stroke-dasharray': '2 3' }, gTiles));
        }
        shapes.push({ pts, r, tx, ty, rot });
      });
      vb = [0, 0, 2 * M + (side - 1) * S + lanes * 60 + (lanes ? 40 : 0), 2 * M + (side - 1) * S];
    }
    svg.setAttribute('viewBox', vb.join(' '));
    // big tiles first so small ones stay readable on top
    const orderIdx = gens.map((_, i) => i).sort((a, b) => shapes[b].pts.length - shapes[a].pts.length);
    tiles = new Array(gens.length);
    for (const k of orderIdx) {
      const g = gens[k], sh = shapes[k];
      const types = new Set([...g].filter((c) => c !== 'I'));
      const color = types.size === 1 && types.has('Z') ? th.tileZ : types.size === 1 && types.has('X') ? th.tileX : mix(th.tileZ, th.tileX, 0.5);
      const hull = convexHull(sh.pts);
      const d = 'M' + hull.map((p) => `${p.x} ${p.y}`).join('L') + 'Z';
      const tg = svgEl('g', { class: 'st-tile' }, gTiles);
      const fill = svgEl('path', { d, fill: color, stroke: color, 'stroke-width': sh.r * 2, 'stroke-linejoin': 'round', 'fill-opacity': 0.1, 'stroke-opacity': 0.1 }, tg);
      const label = pauliLabel(g);
      const text = svgEl('text', { x: sh.tx, y: sh.ty - 1, 'text-anchor': 'middle', class: 'st-t', 'font-size': layout === 'chain' ? 13 : 11, fill: th.ink }, tg);
      text.textContent = label;
      const val = svgEl('text', { x: sh.tx, y: sh.ty + 13, 'text-anchor': 'middle', class: 'st-t', 'font-size': 10, fill: th.ink2 }, tg);
      tiles[k] = { g: tg, fill, text, val, cx: sh.tx, cy: sh.ty, v: NaN, color };
      if (layout !== 'chain') { text.setAttribute('font-size', '10'); text.setAttribute('opacity', '0.9'); }
      if (sh.rot) { text.setAttribute('transform', `rotate(-90 ${sh.tx} ${sh.ty})`); text.setAttribute('y', String(sh.ty + 4)); val.setAttribute('y', String(sh.pts[1].y + sh.r + 16)); }
    }
    nodes = P.map((p, i) => {
      svgEl('circle', { cx: p.x, cy: p.y, r: 13, fill: th.bg[0], stroke: th.ink2, 'stroke-width': 1.2 }, gNodes);
      const c = svgEl('circle', { cx: p.x, cy: p.y, r: 4.5, fill: th.ink }, gNodes);
      svgEl('text', { x: p.x, y: p.y + (layout === 'chain' ? 32 : 28), 'text-anchor': 'middle', class: 'st-t', 'font-size': 11, fill: th.ink2 }, gNodes).textContent = 'q' + toSub(String(i + 1));
      const mark = svgEl('text', { x: p.x + 14, y: p.y - 12, class: 'st-t', 'font-size': 12, fill: th.err }, gNodes);
      return { c, mark, x: p.x, y: p.y };
    });
  };

  const apply = (vals: number[], errors: PauliErr[] = []) => {
    tiles.forEach((t, k) => {
      const v = vals[k];
      const known = Number.isFinite(v);
      const lit = known ? (1 - Math.max(-1, Math.min(1, v))) / 2 : 0;
      t.fill.setAttribute('fill-opacity', String(known ? 0.1 + 0.42 * lit : 0.03));
      t.fill.setAttribute('stroke-opacity', String(known ? 0.1 + 0.42 * lit : 0.03));
      t.g.classList.toggle('st-lit', lit > 0.5);
      t.val.textContent = known ? num(v, 2, true) : '—';
      t.val.setAttribute('fill', lit > 0.5 ? th.bg[0] : th.ink2);
      t.text.setAttribute('fill', lit > 0.5 ? th.bg[0] : th.ink);
      if (known && Number.isFinite(t.v) && Math.sign(t.v) !== Math.sign(v) && Math.abs(v) > 0.5) ripple(t.cx, t.cy, t.color);
      t.v = v;
    });
    nodes.forEach((nd, i) => {
      const e = errors.filter((x) => x.q === i + 1).map((x) => x.kind).join('');
      nd.mark.textContent = e;
      nd.c.setAttribute('fill', e ? th.err : th.ink);
    });
  };
  const ripple = (x: number, y: number, color: string) => {
    if (rm) return;
    const c = svgEl('circle', { cx: x, cy: y, r: 6, fill: 'none', stroke: color, 'stroke-width': 2, opacity: 0.9, class: 'st-ripple' }, gFx);
    requestAnimationFrame(() => requestAnimationFrame(() => { c.setAttribute('r', '70'); c.setAttribute('opacity', '0'); c.style.r = '70px'; }));
    window.setTimeout(() => c.remove(), 1300);
  };

  return {
    update(input) {
      const d: TilingData = (input as VizInputLike).nerd ? fromVizInput(input as VizInputLike) : (input as TilingData);
      let gens = d.generators;
      if (!gens?.length) {
        const parsed = (d.stabilizers ?? []).map((s) => parsePauliLabel(s.label)).filter((p) => p.length);
        const n = Math.max(1, ...parsed.flat().map((p) => p.q));
        gens = parsed.map((ps) => Array.from({ length: n }, (_, i) => ps.find((p) => p.q === i + 1)?.p ?? 'I').join(''));
      }
      if (!gens.length) return;
      const layout = opts.layout && opts.layout !== 'auto' ? opts.layout : gens[0].length === 9 && gens.length === 8 && gens.some((g) => (g.match(/[XYZ]/g) ?? []).length === 6) ? 'grid' : gens[0].length === 9 ? 'surface' : 'chain';
      const k = layout + ':' + gens.join(',');
      if (k !== key) { key = k; build(gens, layout); }
      const byLabel = new Map((d.stabilizers ?? []).map((s) => [norm(s.label), s.value]));
      const vals = gens.map((g, i) => d.values?.[i] ?? byLabel.get(norm(pauliLabel(g))) ?? NaN);
      apply(vals, d.errors);
      f.root.setAttribute('aria-label', tv('tiling.aria') + '. ' + gens.map((g, i) => `${fmtExpect(pauliLabel(g), false)} = ${Number.isFinite(vals[i]) ? num(vals[i], 2, true) : '?'}`).join(', '));
    },
    destroy() { f.destroy(); },
  };
}

function fromVizInput(v: VizInputLike): TilingData {
  const gens = v.meta?.stabilizers;
  return { stabilizers: v.nerd.stabilizers, generators: gens };
}

function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return pts;
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: typeof p[0], a: typeof p[0], b: typeof p[0]) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: typeof p = [], up: typeof p = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export const mount = (host: HTMLElement, input: VizInputLike) => {
  const v = veilable<VizInputLike>(host, createStabilizerTiling(host, { reducedMotion: input.reducedMotion, caption: '' }), resolveTheme({}));
  v.update(input);
  return v;
};
export { SURFACE_D3 };
export type { NerdInfo };
