/**
 * Discovers the Visual Director's viz modules (import.meta.glob, so a missing file never breaks the build)
 * and falls back to plain, honest DOM/SVG renderers. Every oracle panel is captioned by the shell.
 */
import { t } from '../../../i18n/index';
import type { AfiChartInput, AfiChartMount, AfiVizHandle, AfiVizInput, AfiVizMount, PlayOrientation } from '../state/vizApi';

const ORACLE = import.meta.glob<{ mount?: AfiVizMount }>('../viz/{stateSpace,blochField,stabilizerTiling,lattice}.ts');
const CHARTS = import.meta.glob<{ mount?: AfiChartMount }>('../viz/charts.ts');
const ORIENT = import.meta.glob<{ playOrientation?: PlayOrientation }>('../viz/orientation.ts');

export type OracleKind = 'stateSpace' | 'blochField' | 'stabilizerTiling' | 'lattice';

async function load<T>(table: Record<string, () => Promise<T>>, path: string): Promise<T | null> {
  const f = table[path];
  if (!f) return null;
  try { return await f(); } catch (e) { console.warn('[afi] viz module failed to load', path, e); return null; }
}

export async function mountOracle(kind: OracleKind, host: HTMLElement, input: AfiVizInput): Promise<AfiVizHandle> {
  const m = await load(ORACLE, `../viz/${kind}.ts`);
  if (m?.mount) { try { return m.mount(host, input); } catch (e) { console.warn('[afi] viz mount threw, using fallback', kind, e); } }
  return fallbackOracle(kind, host, input);
}
export async function mountChart(host: HTMLElement, input: AfiChartInput): Promise<{ update(i: AfiChartInput): void; destroy(): void }> {
  const m = await load(CHARTS, '../viz/charts.ts');
  if (m?.mount) { try { return m.mount(host, input); } catch (e) { console.warn('[afi] chart mount threw, using fallback', e); } }
  return fallbackChart(host, input);
}
export async function orientation(): Promise<PlayOrientation | null> {
  const m = await load(ORIENT, '../viz/orientation.ts');
  return m?.playOrientation ?? null;
}

// ───────────── fallbacks ─────────────
const f3 = (x: number) => (Math.abs(x) < 5e-4 ? '0' : x.toFixed(3));
function fallbackOracle(kind: OracleKind, host: HTMLElement, input0: AfiVizInput): AfiVizHandle {
  const box = document.createElement('div'); box.className = `afi-fb afi-fb-${kind}`;
  host.appendChild(box);
  const draw = (inp: AfiVizInput) => {
    if (inp.veiled) { box.innerHTML = `<div class="afi-veil-fog"></div>`; return; }
    const n = inp.nerd;
    if (kind === 'stateSpace') {
      const rows = n.amps.slice(0, 32).map((a) => {
        const p = a.re * a.re + a.im * a.im, ph = Math.atan2(a.im, a.re);
        return `<div class="amp"><span class="mono ket">|${a.ket}⟩</span><span class="bar" style="--p:${p.toFixed(4)};--ph:${((ph / (2 * Math.PI)) * 360).toFixed(0)}"></span><span class="mono v">${f3(p)}</span><span class="mono ph">${(ph / Math.PI).toFixed(2)}π</span></div>`;
      }).join('');
      box.innerHTML = `<div class="mono order">${n.order.join(' ')}</div>${rows}${n.truncated ? `<div class="muted">${t('afi.oracle.truncated')}</div>` : ''}`;
    } else if (kind === 'blochField') {
      box.innerHTML = `<table class="mono"><tr><th></th><th>x</th><th>y</th><th>z</th><th>Tr ρ²</th><th>S</th></tr>${n.order.map((q) => { const r = n.reduced[q]; return r ? `<tr><th>${q}</th><td>${f3(r.x)}</td><td>${f3(r.y)}</td><td>${f3(r.z)}</td><td>${f3(r.purity)}</td><td>${f3(r.entropy)}</td></tr>` : ''; }).join('')}</table>`;
    } else if (kind === 'stabilizerTiling') {
      box.innerHTML = n.stabilizers.map((s) => `<span class="tile ${s.value > 0.5 ? 'plus' : s.value < -0.5 ? 'minus' : 'mixed'}"><span class="mono">⟨${s.label}⟩</span> ${f3(s.value)}</span>`).join('');
    } else {
      box.innerHTML = `<div class="muted">${t('afi.oracle.latticeFallback')}</div>`;
    }
  };
  draw(input0);
  return { update: draw, destroy: () => box.remove() };
}

function fallbackChart(host: HTMLElement, input0: AfiChartInput) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'afi-fb-chart'); svg.setAttribute('viewBox', '0 0 420 220');
  host.appendChild(svg);
  const draw = (inp: AfiChartInput) => {
    const pts = inp.series.flatMap((s) => s.points);
    if (!pts.length) { svg.innerHTML = ''; return; }
    const xmax = Math.max(...pts.map((p) => p.x)) || 1, ymax = Math.max(0.05, ...pts.map((p) => p.hi));
    const X = (x: number) => 44 + (x / xmax) * 360, Y = (y: number) => 190 - (y / ymax) * 170;
    let s = `<line class="axis" x1="44" y1="190" x2="410" y2="190"/><line class="axis" x1="44" y1="20" x2="44" y2="190"/>`;
    s += `<text class="tick" x="40" y="24" text-anchor="end">${ymax.toFixed(2)}</text><text class="tick" x="40" y="194" text-anchor="end">0</text><text class="tick" x="410" y="206" text-anchor="end">${xmax}</text>`;
    s += `<text class="axis-label" x="227" y="216" text-anchor="middle">${inp.xLabel}</text><text class="axis-label" x="12" y="105" transform="rotate(-90 12 105)" text-anchor="middle">${inp.yLabel}</text>`;
    if (inp.kind === 'sweep') s += `<line class="ref" x1="${X(0)}" y1="${Y(0)}" x2="${X(Math.min(xmax, ymax))}" y2="${Y(Math.min(xmax, ymax))}"/>`;
    inp.series.forEach((ser, si) => {
      s += `<polyline class="series s${si}" points="${ser.points.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}"/>`;
      for (const p of ser.points) s += `<line class="ci s${si}" x1="${X(p.x)}" x2="${X(p.x)}" y1="${Y(p.lo)}" y2="${Y(p.hi)}"/><circle class="pt s${si}" cx="${X(p.x)}" cy="${Y(p.y)}" r="2.5"/>`;
    });
    svg.innerHTML = s;
  };
  draw(input0);
  return { update: draw, destroy: () => svg.remove() };
}
