/**
 * d3 charts in the dreamscape style. Every chart: aria label (role=img), hover tooltips, and a data-table toggle.
 *  - createThresholdChart: logical vs physical error rate, log–log, 95 % Wilson bands, break-even diagonal
 *  - createHistogram: measured outcome counts with Born-rule expectations (and their binomial 95 % range)
 *  - createMIHeatmap: pairwise mutual information I(A:B) in bits
 *  - createSyndromeRaster: rounds × ancillas, lit cells = measured 1
 * Series identity never relies on colour alone: direct labels + dash patterns + legend.
 */
import * as d3 from 'd3';
import { frame, tv, resolveRM, resolveTheme, type VizBaseOpts, type VizHandle } from './common';
import { num, qubitName } from '../theme/math';
import { rgba, type AfiTheme } from '../theme/theme';
import type { NerdInfo } from '../../../core/contracts';

/** Wilson score interval (95 % by default). */
export function wilson(failures: number, trials: number, z = 1.959964): [number, number] {
  if (!trials) return [0, 1];
  const p = failures / trials, z2 = z * z, d = 1 + z2 / trials;
  const c = (p + z2 / (2 * trials)) / d, h = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

type Frame = ReturnType<typeof frame>;
function chartFrame(host: HTMLElement, cls: string, aria: string, opts: VizBaseOpts) {
  const th = resolveTheme(opts);
  const f = frame(host, 'afi-chart ' + cls, aria);
  f.root.style.background = `linear-gradient(180deg, ${th.bg[1]}, ${th.bg[0]})`;
  const svg = d3.select(f.root).append('svg').attr('class', 'afi-viz-svg').attr('aria-hidden', 'true');
  const table = d3.select(f.root).append('div').style('position', 'absolute').style('inset', '36px 12px 30px').style('overflow', 'auto').style('display', 'none');
  const btn = d3.select(f.root).append('button').attr('class', 'afi-viz-btn').style('position', 'absolute').style('right', '10px').style('top', '8px').style('z-index', '2')
    .text(tv('charts.table')).attr('aria-pressed', 'false');
  let showTable = false;
  btn.on('click', () => {
    showTable = !showTable;
    btn.text(showTable ? tv('charts.chart') : tv('charts.table')).attr('aria-pressed', String(showTable));
    svg.style('display', showTable ? 'none' : ''); table.style('display', showTable ? '' : 'none');
  });
  f.mountChrome();
  f.setCaption(opts.caption ?? '');
  const size = () => ({ w: Math.max(200, f.root.clientWidth), h: Math.max(140, f.root.clientHeight) });
  const setTable = (cols: string[], rows: (string | number)[][]) => {
    table.html('');
    const t = table.append('table').style('border-collapse', 'collapse').style('width', '100%').style('font-family', th.fonts.mono).style('font-size', '12px').style('color', th.ink);
    t.append('thead').append('tr').selectAll('th').data(cols).join('th').text((d) => d).style('text-align', 'right').style('padding', '4px 8px').style('color', th.ink2).style('border-bottom', `1px solid ${th.line}`);
    t.append('tbody').selectAll('tr').data(rows).join('tr').selectAll('td').data((r) => r).join('td').text((d) => String(d)).style('text-align', 'right').style('padding', '3px 8px');
  };
  return { f, th, svg, size, setTable };
}
const axisStyle = (g: d3.Selection<SVGGElement, unknown, null, undefined>, th: AfiTheme) => {
  g.selectAll('path,line').attr('stroke', rgba(th.ink3, 0.6));
  g.selectAll('text').attr('fill', th.ink2).style('font-family', th.fonts.mono).style('font-size', '10.5px');
};
const tipAt = (f: Frame, ev: MouseEvent, html: string) => { const r = f.root.getBoundingClientRect(); f.showTip(html, ev.clientX - r.left, ev.clientY - r.top); };

// ───────────── threshold ─────────────
export interface ThresholdPoint { p: number; trials: number; failures: number }
export interface ThresholdData { series: { name: string; points: ThresholdPoint[] }[] }
/** Also accepts the DLC Engineer's AfiChartInput series shape { label, points: { x, y, lo, hi, n } }. */
type EngSeries = { label: string; points: { x: number; y: number; lo: number; hi: number; n: number }[] };

export function createThresholdChart(host: HTMLElement, opts: VizBaseOpts & { xLabel?: string; yLabel?: string } = {}): VizHandle<ThresholdData | { series: EngSeries[] }> {
  const c = chartFrame(host, 'afi-threshold', tv('charts.threshold.aria'), opts);
  const { th, svg, f } = c, rm = resolveRM(opts);
  const colors = [th.accent, th.accent2, th.phaseAnchors[1], th.ok];
  const dashes = ['', '6 4', '2 3', '8 3 2 3'];
  let last: ThresholdData | null = null;
  const ro = new ResizeObserver(() => last && draw(last));
  ro.observe(f.root);
  function draw(data: ThresholdData) {
    const { w, h } = c.size(), m = { l: 58, r: 150, t: 44, b: 46 };
    svg.attr('viewBox', `0 0 ${w} ${h}`).selectAll('*').remove();
    const S = data.series.map((s) => ({ name: s.name, pts: s.points.filter((p) => p.trials > 0).map((p) => { const [lo, hi] = wilson(p.failures, p.trials); return { ...p, rate: p.failures / p.trials, lo, hi }; }) }));
    const all = S.flatMap((s) => s.pts);
    if (!all.length) return;
    const xmin = d3.min(all, (d) => d.p)!, xmax = d3.max(all, (d) => d.p)!;
    const ymin = Math.max(1e-5, Math.min(xmin, d3.min(all, (d) => (d.lo > 0 ? d.lo : d.hi / 4))!)), ymax = Math.min(1, Math.max(xmax, d3.max(all, (d) => d.hi)!));
    const x = d3.scaleLog().domain([xmin * 0.85, xmax * 1.15]).range([m.l, w - m.r]);
    const y = d3.scaleLog().domain([ymin * 0.7, ymax * 1.2]).range([h - m.b, m.t]).clamp(true);
    const gx = svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5, '~g').tickSizeOuter(0));
    const gy = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5, '~g').tickSizeOuter(0));
    axisStyle(gx, th); axisStyle(gy, th);
    svg.append('g').selectAll('line').data(y.ticks(5).filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9)).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).attr('stroke', rgba(th.ink3, 0.15));
    svg.append('text').attr('x', (m.l + w - m.r) / 2).attr('y', h - 10).attr('text-anchor', 'middle').attr('fill', th.ink2).style('font-family', th.fonts.mono).style('font-size', '11px').text(opts.xLabel ?? tv('charts.threshold.x'));
    svg.append('text').attr('transform', `translate(14,${(m.t + h - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').attr('fill', th.ink2).style('font-family', th.fonts.mono).style('font-size', '11px').text(opts.yLabel ?? tv('charts.threshold.y'));
    // break-even diagonal p_L = p
    const d0 = Math.max(x.domain()[0], y.domain()[0]), d1 = Math.min(x.domain()[1], y.domain()[1]);
    svg.append('line').attr('x1', x(d0)).attr('y1', y(d0)).attr('x2', x(d1)).attr('y2', y(d1)).attr('stroke', th.ink3).attr('stroke-dasharray', '3 4');
    const dm = Math.sqrt(d0 * d1);
    svg.append('text').attr('x', x(dm) + 6).attr('y', y(dm) + 16).attr('text-anchor', 'start').attr('fill', th.ink3).style('font-family', th.fonts.mono).style('font-size', '10px').text(tv('charts.threshold.breakeven'));
    const endLabels: { name: string; x: number; y: number }[] = [];
    S.forEach((s, i) => {
      const col = colors[i % colors.length];
      const area = d3.area<typeof s.pts[0]>().x((d) => x(d.p)).y0((d) => y(Math.max(d.lo, ymin * 0.7))).y1((d) => y(d.hi)).curve(d3.curveMonotoneX);
      svg.append('path').datum(s.pts).attr('d', area).attr('fill', col).attr('fill-opacity', 0.13);
      const line = d3.line<typeof s.pts[0]>().x((d) => x(d.p)).y((d) => y(Math.max(d.rate, ymin * 0.7))).curve(d3.curveMonotoneX);
      const path = svg.append('path').datum(s.pts).attr('d', line).attr('fill', 'none').attr('stroke', col).attr('stroke-width', 2).attr('stroke-dasharray', dashes[i % dashes.length]);
      if (!rm && !dashes[i % dashes.length]) { const L = (path.node() as SVGPathElement).getTotalLength(); path.attr('stroke-dasharray', `${L} ${L}`).attr('stroke-dashoffset', L).transition().duration(th.motion.slow).ease(d3.easeCubicInOut).attr('stroke-dashoffset', 0).on('end', () => path.attr('stroke-dasharray', null)); }
      svg.append('g').selectAll('circle').data(s.pts).join('circle').attr('cx', (d) => x(d.p)).attr('cy', (d) => y(Math.max(d.rate, ymin * 0.7))).attr('r', 4).attr('fill', th.bg[0]).attr('stroke', col).attr('stroke-width', 2)
        .on('mousemove', (ev, d) => tipAt(f, ev, `<b>${s.name}</b><br><span class="afi-mono">p = ${num(d.p, 3)} · p<sub>L</sub> = ${num(d.rate, 4)}<br>95% [${num(d.lo, 4)}, ${num(d.hi, 4)}] · ${d.failures}/${d.trials}</span>`))
        .on('mouseleave', () => f.hideTip());
      endLabels.push({ name: s.name, x: x(s.pts[s.pts.length - 1].p) + 10, y: y(Math.max(s.pts[s.pts.length - 1].rate, ymin * 0.7)) + 4 });
      // legend
      const lg = svg.append('g').attr('transform', `translate(${m.l + 8},${m.t - 22 + 0})`);
      lg.append('line').attr('x1', i * 170).attr('x2', i * 170 + 22).attr('y1', 0).attr('y2', 0).attr('stroke', col).attr('stroke-width', 2).attr('stroke-dasharray', dashes[i % dashes.length]);
      lg.append('text').attr('x', i * 170 + 28).attr('y', 4).attr('fill', th.ink2).style('font-family', th.fonts.mono).style('font-size', '10.5px').text(s.name);
    });
    endLabels.sort((a, b) => a.y - b.y).forEach((l, i, arr) => { if (i && l.y - arr[i - 1].y < 14) l.y = arr[i - 1].y + 14; });
    svg.append('g').selectAll('text').data(endLabels).join('text').attr('x', (l) => l.x).attr('y', (l) => l.y).attr('fill', th.ink).style('font-family', th.fonts.mono).style('font-size', '10.5px').text((l) => l.name);
    c.setTable([tv('charts.col.p'), tv('charts.col.series'), tv('charts.col.trials'), tv('charts.col.failures'), tv('charts.col.rate'), tv('charts.col.lo'), tv('charts.col.hi')],
      S.flatMap((s) => s.pts.map((d) => [num(d.p, 3), s.name, d.trials, d.failures, num(d.rate, 4), num(d.lo, 4), num(d.hi, 4)])));
  }
  return {
    update(d) {
      const series = (d.series as (ThresholdData['series'][number] | EngSeries)[]).map((s) => 'name' in s ? s : { name: s.label, points: s.points.map((p) => ({ p: p.x, trials: p.n, failures: Math.round(p.y * p.n) })) });
      last = { series }; draw(last);
    },
    destroy() { ro.disconnect(); f.destroy(); },
  };
}

// ───────────── histogram ─────────────
export interface HistogramData { counts: Record<string, number>; expected?: Record<string, number>; shots?: number; label?: string }
export function createHistogram(host: HTMLElement, opts: VizBaseOpts = {}): VizHandle<HistogramData> {
  const c = chartFrame(host, 'afi-hist', tv('charts.hist.aria'), opts);
  const { th, svg, f } = c, rm = resolveRM(opts);
  let last: HistogramData | null = null;
  const ro = new ResizeObserver(() => last && draw(last));
  ro.observe(f.root);
  function draw(d: HistogramData) {
    const { w, h } = c.size(), m = { l: 52, r: 20, t: 42, b: 50 };
    svg.attr('viewBox', `0 0 ${w} ${h}`).selectAll('*').remove();
    const shots = d.shots ?? d3.sum(Object.values(d.counts));
    const keys = [...new Set([...Object.keys(d.counts), ...Object.keys(d.expected ?? {})])].sort();
    const x = d3.scaleBand().domain(keys).range([m.l, w - m.r]).padding(0.28);
    const ymax = d3.max(keys, (k) => Math.max(d.counts[k] ?? 0, (d.expected?.[k] ?? 0) * shots + 2 * Math.sqrt(shots * (d.expected?.[k] ?? 0)))) ?? 1;
    const y = d3.scaleLinear().domain([0, ymax * 1.08]).nice().range([h - m.b, m.t]);
    const gx = svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickFormat((k) => `|${k}⟩`).tickSizeOuter(0));
    const gy = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
    axisStyle(gx, th); axisStyle(gy, th);
    gx.selectAll('text').attr('fill', th.accent);
    svg.append('g').selectAll('line').data(y.ticks(5).filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9)).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', (v) => y(v)).attr('y2', (v) => y(v)).attr('stroke', rgba(th.ink3, 0.15));
    svg.append('text').attr('x', (m.l + w - m.r) / 2).attr('y', h - 12).attr('text-anchor', 'middle').attr('fill', th.ink2).style('font-family', th.fonts.mono).style('font-size', '11px').text(`${tv('charts.hist.x')}${d.label ? ' ' + d.label : ''} · ${tv('charts.hist.shots', { n: shots })}`);
    const bw = x.bandwidth();
    const bars = svg.append('g').selectAll('path').data(keys).join('path').attr('fill', th.accent).attr('fill-opacity', 0.75);
    const barPath = (k: string, v: number) => { const x0 = x(k)!, y0 = y(0), y1 = y(v), r = Math.min(4, bw / 2, y0 - y1); return `M${x0},${y0}V${y1 + r}Q${x0},${y1} ${x0 + r},${y1}H${x0 + bw - r}Q${x0 + bw},${y1} ${x0 + bw},${y1 + r}V${y0}Z`; };
    if (rm) bars.attr('d', (k) => barPath(k, d.counts[k] ?? 0));
    else bars.attr('d', (k) => barPath(k, 0)).transition().duration(th.motion.base).ease(d3.easeCubicInOut).attrTween('d', (k) => (t) => barPath(k, (d.counts[k] ?? 0) * t));
    if (d.expected) {
      const g = svg.append('g');
      keys.forEach((k) => {
        const p = d.expected![k] ?? 0, mu = p * shots, sd = Math.sqrt(shots * p * (1 - p));
        const cx = x(k)! + bw / 2;
        g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(Math.max(0, mu - 1.96 * sd))).attr('y2', y(mu + 1.96 * sd)).attr('stroke', th.accent2).attr('stroke-width', 1.2).attr('stroke-opacity', 0.8);
        g.append('line').attr('x1', x(k)! - 3).attr('x2', x(k)! + bw + 3).attr('y1', y(mu)).attr('y2', y(mu)).attr('stroke', th.accent2).attr('stroke-width', 2).attr('stroke-dasharray', '5 3');
      });
      const lg = svg.append('g').attr('transform', `translate(${m.l + 6},${m.t - 22})`);
      lg.append('rect').attr('width', 14).attr('height', 9).attr('y', -6).attr('rx', 2).attr('fill', th.accent).attr('fill-opacity', 0.75);
      lg.append('text').attr('x', 20).attr('y', 2).attr('fill', th.ink2).style('font-family', th.fonts.mono).style('font-size', '10.5px').text(tv('charts.hist.y'));
      lg.append('line').attr('x1', 90).attr('x2', 112).attr('y1', -2).attr('y2', -2).attr('stroke', th.accent2).attr('stroke-width', 2).attr('stroke-dasharray', '5 3');
      lg.append('text').attr('x', 118).attr('y', 2).attr('fill', th.ink2).style('font-family', th.fonts.mono).style('font-size', '10.5px').text(tv('charts.hist.expected'));
    }
    svg.append('g').selectAll('rect').data(keys).join('rect').attr('x', (k) => x(k)!).attr('width', bw).attr('y', m.t).attr('height', h - m.b - m.t).attr('fill', 'transparent')
      .on('mousemove', (ev, k) => tipAt(f, ev, `<span class="afi-mono">|${k}⟩ · ${d.counts[k] ?? 0} / ${shots}${d.expected ? ` · Born ${num((d.expected[k] ?? 0) * shots, 1)}` : ''}</span>`))
      .on('mouseleave', () => f.hideTip());
    c.setTable([tv('charts.col.outcome'), tv('charts.col.count'), tv('charts.col.expected')], keys.map((k) => [`|${k}⟩`, d.counts[k] ?? 0, d.expected ? num((d.expected[k] ?? 0) * shots, 1) : '—']));
  }
  return { update(d) { last = d; draw(d); }, destroy() { ro.disconnect(); f.destroy(); } };
}

// ───────────── MI heatmap ─────────────
export function createMIHeatmap(host: HTMLElement, opts: VizBaseOpts = {}): VizHandle<Pick<NerdInfo, 'order' | 'mi'>> {
  const c = chartFrame(host, 'afi-mi', tv('charts.mi.aria'), opts);
  const { th, svg, f } = c;
  let last: Pick<NerdInfo, 'order' | 'mi'> | null = null;
  const ro = new ResizeObserver(() => last && draw(last));
  ro.observe(f.root);
  function draw(d: Pick<NerdInfo, 'order' | 'mi'>) {
    const { w, h } = c.size(), n = d.order.length, m = { l: 48, t: 48, r: 70, b: 30 };
    svg.attr('viewBox', `0 0 ${w} ${h}`).selectAll('*').remove();
    const s = Math.min((w - m.l - m.r) / n, (h - m.t - m.b) / n), x0 = m.l + (w - m.l - m.r - s * n) / 2;
    const cells = d.order.flatMap((a, i) => d.order.map((b, j) => ({ i, j, a, b, v: i === j ? NaN : d.mi[i]?.[j] ?? 0 })));
    svg.append('g').selectAll('rect').data(cells).join('rect')
      .attr('x', (q) => x0 + q.j * s + 1).attr('y', (q) => m.t + q.i * s + 1).attr('width', s - 2).attr('height', s - 2).attr('rx', 3)
      .attr('fill', (q) => (Number.isNaN(q.v) ? rgba(th.ink3, 0.08) : th.accent)).attr('fill-opacity', (q) => (Number.isNaN(q.v) ? 1 : 0.05 + 0.9 * Math.min(1, q.v / 2)))
      .on('mousemove', (ev, q) => tipAt(f, ev, Number.isNaN(q.v) ? `<span class="afi-mono">${qubitName(q.a)}</span>` : `<span class="afi-mono">I(${qubitName(q.a)} : ${qubitName(q.b)}) = ${num(q.v, 3)} ${tv('charts.mi.unit')}</span>`))
      .on('mouseleave', () => f.hideTip());
    if (s > 26) svg.append('g').selectAll('text').data(cells.filter((q) => !Number.isNaN(q.v) && q.v > 0.005)).join('text')
      .attr('x', (q) => x0 + q.j * s + s / 2).attr('y', (q) => m.t + q.i * s + s / 2 + 4).attr('text-anchor', 'middle').style('font-family', th.fonts.mono).style('font-size', '10px')
      .attr('fill', (q) => (q.v > 1 ? th.bg[0] : th.ink)).text((q) => num(q.v, 2));
    const lab = (sel: d3.Selection<SVGGElement, unknown, null, undefined>, vert: boolean) => sel.selectAll('text').data(d.order).join('text')
      .attr('x', (_q, i) => (vert ? x0 - 8 : x0 + i * s + s / 2)).attr('y', (_q, i) => (vert ? m.t + i * s + s / 2 + 4 : m.t - 10))
      .attr('text-anchor', vert ? 'end' : 'middle').attr('fill', th.ink2).style('font-family', th.fonts.mono).style('font-size', '11px').text((q) => qubitName(q));
    lab(svg.append('g'), true); lab(svg.append('g'), false);
    // scale legend 0..2 bits
    const lx = x0 + s * n + 18, lh = Math.min(140, s * n);
    const grad = svg.append('defs').append('linearGradient').attr('id', 'miGrad').attr('x1', 0).attr('x2', 0).attr('y1', 1).attr('y2', 0);
    grad.append('stop').attr('offset', '0%').attr('stop-color', th.accent).attr('stop-opacity', 0.05);
    grad.append('stop').attr('offset', '100%').attr('stop-color', th.accent).attr('stop-opacity', 0.95);
    svg.append('rect').attr('x', lx).attr('y', m.t).attr('width', 10).attr('height', lh).attr('rx', 2).attr('fill', 'url(#miGrad)');
    [0, 1, 2].forEach((v) => svg.append('text').attr('x', lx + 16).attr('y', m.t + lh - (v / 2) * lh + 4).attr('fill', th.ink2).style('font-family', th.fonts.mono).style('font-size', '10px').text(`${v}`));
    svg.append('text').attr('x', lx).attr('y', m.t + lh + 18).attr('fill', th.ink3).style('font-family', th.fonts.mono).style('font-size', '10px').text(tv('charts.mi.unit'));
    c.setTable([tv('charts.col.pair'), tv('charts.col.value')], cells.filter((q) => q.i < q.j).map((q) => [`I(${qubitName(q.a)} : ${qubitName(q.b)})`, num(q.v, 3)]));
  }
  return { update(d) { last = d; draw(d); }, destroy() { ro.disconnect(); f.destroy(); } };
}

// ───────────── syndrome raster ─────────────
export interface RasterData { ancillas: string[]; rounds: (0 | 1)[][] }
export function createSyndromeRaster(host: HTMLElement, opts: VizBaseOpts = {}): VizHandle<RasterData> {
  const c = chartFrame(host, 'afi-raster', tv('charts.raster.aria'), opts);
  const { th, svg, f } = c;
  let last: RasterData | null = null;
  const ro = new ResizeObserver(() => last && draw(last));
  ro.observe(f.root);
  function draw(d: RasterData) {
    const { w, h } = c.size(), R = d.rounds.length, A = d.ancillas.length, m = { l: 96, t: 44, r: 20, b: 44 };
    svg.attr('viewBox', `0 0 ${w} ${h}`).selectAll('*').remove();
    const cw = (w - m.l - m.r) / Math.max(1, R), ch = Math.min(34, (h - m.t - m.b) / Math.max(1, A));
    const cells = d.rounds.flatMap((row, r) => row.map((b, a) => ({ r, a, b })));
    svg.append('g').selectAll('rect').data(cells).join('rect')
      .attr('x', (q) => m.l + q.r * cw + 1).attr('y', (q) => m.t + q.a * ch + 1).attr('width', Math.max(1, cw - 2)).attr('height', ch - 2).attr('rx', 2)
      .attr('fill', (q) => (q.b ? th.accent2 : rgba(th.ink3, 0.12))).attr('fill-opacity', (q) => (q.b ? 0.9 : 1))
      .on('mousemove', (ev, q) => tipAt(f, ev, `<span class="afi-mono">${tv('charts.col.round')} ${q.r + 1} · ${d.ancillas[q.a]} = ${q.b}</span>`))
      .on('mouseleave', () => f.hideTip());
    svg.append('g').selectAll('text').data(d.ancillas).join('text').attr('x', m.l - 8).attr('y', (_q, i) => m.t + i * ch + ch / 2 + 4).attr('text-anchor', 'end')
      .attr('fill', th.ink2).style('font-family', th.fonts.mono).style('font-size', '11px').text((q) => q);
    const step = Math.max(1, Math.ceil(R / 12));
    svg.append('g').selectAll('text').data(d3.range(0, R, step)).join('text').attr('x', (r) => m.l + r * cw + cw / 2).attr('y', m.t + A * ch + 16).attr('text-anchor', 'middle')
      .attr('fill', th.ink3).style('font-family', th.fonts.mono).style('font-size', '10px').text((r) => r + 1);
    svg.append('text').attr('x', (m.l + w - m.r) / 2).attr('y', m.t + A * ch + 34).attr('text-anchor', 'middle').attr('fill', th.ink2).style('font-family', th.fonts.mono).style('font-size', '11px').text(tv('charts.raster.x'));
    c.setTable([tv('charts.col.round'), ...d.ancillas], d.rounds.map((row, r) => [r + 1, ...row]));
  }
  return { update(d) { last = d; draw(d); }, destroy() { ro.disconnect(); f.destroy(); } };
}

/** Engineer-facing adapter: AfiChartInput → threshold chart. */
export const mount = (host: HTMLElement, input: { series: EngSeries[]; reducedMotion?: boolean; xLabel?: string; yLabel?: string }) => {
  const v = createThresholdChart(host, { reducedMotion: input.reducedMotion, xLabel: input.xLabel, yLabel: input.yLabel });
  v.update({ series: input.series });
  return v;
};
