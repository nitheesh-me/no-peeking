/**
 * Night Shift Lab: logical vs physical error rate across p (the threshold idea, unlocked by 2-5).
 * Points are REAL simulations: quantum.logicalErrorCurve if exported, else quantum.testLevel on a 'rate' level.
 */
import type { LevelDef, Program } from '../core/contracts';
import { quantum, getLevel, audio } from '../engine/deps';
import * as Q from '../quantum/index';
import { h, modal } from '../engine/util';

const LONE = '#d9480f', CODE = '#6c63ff'; // validated pair (dataviz validator: all checks pass)
const PS = [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8, 0.9];
const NIGHTS = 240;

type Pt = { p: number; logical: number };

function baseLevel(): { def: LevelDef; prog: { morning?: Program } } | null {
  const l = getLevel('2-5');
  if (!l) return null;
  return { def: l, prog: l.solution };
}

/** Logical error rate at one p, via the real VM. */
function simulate(p: number, seed: number): number {
  const b = baseLevel(); if (!b) return NaN;
  const def: LevelDef = { ...b.def, noise: { mode: 'random', p, kinds: ['flip'] }, goal: { ...(b.def.goal as Extract<LevelDef['goal'], { kind: 'rate' }>), nights: NIGHTS } };
  const r = quantum.testLevel(def, b.prog, seed);
  return 1 - r.passRate;
}

function curveFromModule(): ((ps: number[], nights: number, seed: number) => Pt[]) | null {
  const f = (Q as unknown as Record<string, unknown>).logicalErrorCurve;
  if (typeof f !== 'function') return null;
  return (ps, nights, seed) => {
    const out = (f as (a: number[], b: number, c: number) => unknown)(ps, nights, seed) as unknown[];
    return ps.map((p, i) => {
      const v = out[i] as number | { p?: number; logical?: number; logicalRate?: number; rate?: number };
      const logical = typeof v === 'number' ? v : v?.logical ?? v?.logicalRate ?? v?.rate ?? NaN;
      return { p, logical };
    });
  };
}

export function openNightLab(): void {
  audio.sfx('ui_click');
  const W = 560, H = 340, m = { l: 52, r: 16, t: 16, b: 46 };
  const X = (p: number) => m.l + p * (W - m.l - m.r);
  const Y = (v: number) => H - m.b - v * (H - m.t - m.b);
  const NS = 'http://www.w3.org/2000/svg';
  const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text != null) e.textContent = text;
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'Chance a dream is lost per night, lone Qubble vs 3-Qubble code, across gremlin chance p' });
  svg.style.maxWidth = '640px'; svg.style.display = 'block'; svg.style.font = '600 12px Quicksand, sans-serif';
  // region where the code wins (subtle) + crossover
  svg.appendChild(el('rect', { x: X(0), y: m.t, width: X(0.5) - X(0), height: H - m.t - m.b, fill: '#3ddc97', opacity: 0.08 }));
  // grid + axes (recessive)
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: '#e8e5de', 'stroke-width': 1 }));
    svg.appendChild(el('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end', fill: '#8a867d' }, `${Math.round(v * 100)}%`));
    svg.appendChild(el('text', { x: X(v), y: H - m.b + 18, 'text-anchor': 'middle', fill: '#8a867d' }, `${Math.round(v * 100)}%`));
  }
  svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: '#55524b', 'stroke-width': 1.5 }));
  svg.appendChild(el('text', { x: (m.l + W - m.r) / 2, y: H - 8, 'text-anchor': 'middle', fill: '#55524b' }, 'gremlin chance per Qubble per night (p)'));
  const yl = el('text', { x: 14, y: (m.t + H - m.b) / 2, 'text-anchor': 'middle', fill: '#55524b', transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})` }, 'dream lost');
  svg.appendChild(yl);
  svg.appendChild(el('line', { x1: X(0.5), x2: X(0.5), y1: m.t, y2: Y(0), stroke: '#0e0e0e', 'stroke-width': 1, 'stroke-dasharray': '3 4' }));
  svg.appendChild(el('text', { x: X(0.5) + 6, y: m.t + 12, fill: '#0e0e0e' }, 'crossover: p = 1/2'));
  svg.appendChild(el('text', { x: X(0.04), y: m.t + 12, fill: '#1f7a52' }, 'code wins here'));
  // lone qubble: y = p (dashed = secondary encoding)
  svg.appendChild(el('line', { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), stroke: LONE, 'stroke-width': 2, 'stroke-dasharray': '7 5' }));
  svg.appendChild(el('text', { x: X(0.8), y: Y(0.7), fill: '#0e0e0e', 'text-anchor': 'start' }, 'lone Qubble'));
  // theory curve for the code (thin)
  let d = '';
  for (let i = 0; i <= 50; i++) { const p = i / 50; d += `${i ? 'L' : 'M'}${X(p).toFixed(1)},${Y(3 * p * p - 2 * p ** 3).toFixed(1)}`; }
  svg.appendChild(el('path', { d, fill: 'none', stroke: CODE, 'stroke-width': 1, opacity: 0.45 }));
  const simPath = el('path', { d: '', fill: 'none', stroke: CODE, 'stroke-width': 2, 'stroke-linejoin': 'round' });
  svg.appendChild(simPath);
  const dots = el('g', {});
  svg.appendChild(dots);
  const codeLabel = el('text', { x: X(0.3) + 8, y: Y(3 * 0.09 - 2 * 0.027) + 18, fill: '#0e0e0e' }, '3-Qubble code');
  svg.appendChild(codeLabel);

  const tip = h('div', { class: 'panel', style: 'position:absolute;pointer-events:none;padding:6px 10px;font-size:12px;display:none;white-space:nowrap' });
  const wrap = h('div', { style: 'position:relative' }, svg as unknown as HTMLElement, tip);
  const tbody = h('tbody');
  const status = h('div', { class: 'muted', style: 'font-size:12px' }, 'Simulating nights…');
  const body = h('div', null,
    h('h2', null, 'Night Shift Lab'),
    h('p', { style: 'margin:0 0 10px;font-size:15px' }, 'Every dot is ', h('b', null, `${NIGHTS} real simulated nights`), ' with the 2-3 routine. The code wins while gremlins are rare. When gremlins are everywhere, two flips at once become common and the bots fix the wrong Qubble.'),
    h('div', { style: 'display:flex;gap:16px;font-size:13px;margin-bottom:6px;flex-wrap:wrap' },
      h('span', null, h('span', { style: `display:inline-block;width:22px;border-top:2px dashed ${LONE};vertical-align:middle;margin-right:6px` }), 'lone Qubble (lost with chance p)'),
      h('span', null, h('span', { style: `display:inline-block;width:10px;height:10px;border-radius:50%;background:${CODE};vertical-align:middle;margin-right:6px` }), '3-Qubble code (simulated; thin line = 3p² − 2p³)')),
    wrap, status,
    h('details', { style: 'margin-top:8px;font-size:13px' }, h('summary', null, 'Show the numbers'),
      h('table', { style: 'border-collapse:collapse;margin-top:6px' }, h('thead', null, h('tr', null, h('th', { style: 'text-align:left;padding-right:16px' }, 'p'), h('th', { style: 'text-align:left;padding-right:16px' }, 'lone Qubble lost'), h('th', { style: 'text-align:left' }, 'code lost'))), tbody)),
  );
  let alive = true;
  modal(body, { onClose: () => { alive = false; } });

  const pts: Pt[] = [];
  const draw = () => {
    simPath.setAttribute('d', pts.map((q, i) => `${i ? 'L' : 'M'}${X(q.p).toFixed(1)},${Y(q.logical).toFixed(1)}`).join(''));
    dots.innerHTML = ''; tbody.innerHTML = '';
    for (const q of pts) {
      dots.appendChild(el('circle', { cx: X(q.p), cy: Y(q.logical), r: 4.5, fill: CODE, stroke: '#fff', 'stroke-width': 2 }));
      const hit = el('circle', { cx: X(q.p), cy: Y(q.logical), r: 12, fill: 'transparent' });
      hit.style.cursor = 'default';
      hit.addEventListener('pointerenter', () => {
        tip.style.display = 'block';
        tip.innerHTML = `p = ${Math.round(q.p * 100)}%<br>lone Qubble lost: ${Math.round(q.p * 100)}%<br>code lost: ${(q.logical * 100).toFixed(1)}%`;
        const r = svg.getBoundingClientRect(), k = r.width / W;
        tip.style.left = `${Math.min(X(q.p) * k + 10, r.width - 160)}px`; tip.style.top = `${Y(q.logical) * k - 50}px`;
      });
      hit.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
      dots.appendChild(hit);
      tbody.appendChild(h('tr', null, h('td', null, `${Math.round(q.p * 100)}%`), h('td', null, `${Math.round(q.p * 100)}%`), h('td', null, `${(q.logical * 100).toFixed(1)}%`)));
    }
  };
  const seed = (Math.random() * 1e9) | 0;
  const fromModule = curveFromModule();
  if (fromModule) {
    try { pts.push(...fromModule(PS, NIGHTS, seed).filter((q) => Number.isFinite(q.logical))); } catch { /* fall back below */ }
  }
  if (pts.length) { draw(); status.textContent = `${PS.length} values of p × ${NIGHTS} nights each.`; return; }
  let i = 0;
  const stepFn = () => {
    if (!alive || i >= PS.length) { if (alive) status.textContent = `${PS.length} values of p × ${NIGHTS} nights each, simulated just now.`; return; }
    pts.push({ p: PS[i], logical: simulate(PS[i], seed + i) });
    i++; draw();
    setTimeout(stepFn, 0);
  };
  stepFn();
}
