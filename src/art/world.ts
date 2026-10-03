// World layers: floating-island daycare floor, sky, silk threads, wall signs.
import { PALETTE, type IsoFn } from '../core/contracts';
import { type Ctx, type RGB, TAU, INK, hex, mix, rgba, clamp, hash, circle, ellipse, roundRect, inkStroke, starPath, sceneState } from './util';

type P = { x: number; y: number };
const add = (a: P, dx: number, dy: number): P => ({ x: a.x + dx, y: a.y + dy });

// ═════════════════════════════ FLOOR ═════════════════════════════
interface FloorCache { day: HTMLCanvasElement; night: HTMLCanvasElement; ox: number; oy: number; w: number; h: number }
const floorCache = new Map<string, FloorCache>();

export function newCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function floorGeom(cols: number, rows: number, iso: IsoFn) {
  const o = iso(0, 0), ex = iso(1, 0), ey = iso(0, 1);
  const tile = Math.hypot(ex.x - o.x, ex.y - o.y);
  const tileH = Math.abs(ex.y - o.y) + Math.abs(ey.y - o.y); // full diamond height
  const depth = Math.max(18, tileH * 0.75);
  const m = 0.42; // border margin, in tiles
  const corners = [iso(-m, -m), iso(cols + m, -m), iso(cols + m, rows + m), iso(-m, rows + m)];
  return { tile, tileH, depth, m, corners };
}

export function drawFloor(ctx: Ctx, cols: number, rows: number, iso: IsoFn, t: number, night: number) {
  const tr = ctx.getTransform();
  const scale = Math.max(0.25, Math.hypot(tr.a, tr.b));
  const o = iso(0, 0), ex = iso(1, 0), ey = iso(0, 1);
  const key = [cols, rows, o.x, o.y, ex.x, ex.y, ey.x, ey.y, scale].map((v) => Math.round(v * 100) / 100).join(',');
  let fc = floorCache.get(key);
  if (!fc) {
    const g = floorGeom(cols, rows, iso);
    const xs = g.corners.map((c) => c.x), ys = g.corners.map((c) => c.y);
    const pad = 12;
    const ox = Math.min(...xs) - pad, oy = Math.min(...ys) - pad;
    const w = Math.max(...xs) - ox + pad, h = Math.max(...ys) + g.depth + g.tileH * 2.2 + pad - oy;
    const mk = (n: number) => {
      const c = newCanvas(w * scale, h * scale);
      const cx = c.getContext('2d')!;
      cx.scale(scale, scale);
      cx.translate(-ox, -oy);
      renderFloor(cx, cols, rows, iso, n);
      return c;
    };
    fc = { day: mk(0), night: mk(1), ox, oy, w, h };
    if (floorCache.size > 8) floorCache.clear();
    floorCache.set(key, fc);
  }
  const n = clamp(night);
  sceneState.night = n;
  if (n < 0.999) ctx.drawImage(fc.day, fc.ox, fc.oy, fc.w, fc.h);
  if (n > 0.001) {
    ctx.save();
    ctx.globalAlpha = n;
    ctx.drawImage(fc.night, fc.ox, fc.oy, fc.w, fc.h);
    ctx.restore();
  }
  // live: nightlight glow at the far corner
  if (n > 0.05) {
    const g = floorGeom(cols, rows, iso);
    const p = add(iso(cols + g.m * 0.5, -g.m * 0.5), 0, -14);
    const pulse = 0.8 + 0.2 * Math.sin(t * 1.7);
    const r = g.tile * 1.6 * pulse;
    const gr = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r);
    gr.addColorStop(0, `rgba(255,214,120,${0.45 * n})`);
    gr.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = gr;
    circle(ctx, p.x, p.y, r);
    ctx.fill();
  }
}

export function poly(ctx: Ctx, pts: P[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}
export function tileQuad(iso: IsoFn, gx: number, gy: number, w = 1, h = 1): P[] {
  return [iso(gx, gy), iso(gx + w, gy), iso(gx + w, gy + h), iso(gx, gy + h)];
}

export function renderFloor(ctx: Ctx, cols: number, rows: number, iso: IsoFn, night: number, island = true) {
  const g = floorGeom(cols, rows, iso);
  const N = night;
  const k = Math.max(0.6, g.tile / 64); // stroke scale relative to a ~64px tile edge
  const c = g.corners;
  const D = g.depth;
  const ink = N ? '#0b0b16' : INK;

  if (island) {
  // ── island underside (rocky taper) ──
  const lo = c.map((p) => add(p, 0, D));
  const sorted = [...lo].sort((a, b) => b.y - a.y);
  const front = sorted[0];
  const minX = Math.min(...lo.map((p) => p.x)), maxX = Math.max(...lo.map((p) => p.x));
  const leftC = lo.reduce((a, b) => (b.x < a.x ? b : a)), rightC = lo.reduce((a, b) => (b.x > a.x ? b : a));
  const tipY = front.y + g.tileH * 1.9;
  const under: P[] = [leftC];
  const steps = 9;
  for (let i = 1; i < steps; i++) {
    const u = i / steps;
    const x = minX + (maxX - minX) * u;
    const edgeY = x < front.x ? leftC.y + (front.y - leftC.y) * ((x - leftC.x) / (front.x - leftC.x || 1)) : front.y + (rightC.y - front.y) * ((x - front.x) / (rightC.x - front.x || 1));
    const taper = Math.sin(u * Math.PI);
    const jag = (hash(i * 3.1) - 0.5) * g.tileH * 0.5;
    under.push({ x, y: edgeY + (tipY - front.y) * Math.pow(taper, 1.3) + jag * taper });
  }
  under.push(rightC);
  ctx.beginPath();
  ctx.moveTo(leftC.x, leftC.y);
  for (const p of under) ctx.lineTo(p.x, p.y);
  ctx.lineTo(front.x, front.y);
  ctx.closePath();
  if (N) { ctx.lineWidth = 8 * k; ctx.strokeStyle = 'rgba(170,160,255,0.35)'; ctx.lineJoin = 'round'; ctx.stroke(); }
  ctx.fillStyle = N ? '#3b3058' : '#8a6248';
  ctx.fill();
  ctx.lineWidth = 2.5 * k; ctx.strokeStyle = ink; ctx.lineJoin = 'round'; ctx.stroke();
  // little hanging roots & crystals
  for (let i = 1; i < steps; i += 2) {
    const p = under[i];
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 4);
    ctx.quadraticCurveTo(p.x + 5, p.y + 10, p.x - 2, p.y + 18 + hash(i) * 10);
    ctx.lineWidth = 1.6 * k; ctx.strokeStyle = N ? '#4a3f5e' : '#5b3f2c'; ctx.stroke();
  }
  for (const i of [2, 6]) {
    const p = under[i];
    ctx.beginPath(); ctx.moveTo(p.x - 5, p.y - 8); ctx.lineTo(p.x, p.y + 6); ctx.lineTo(p.x + 5, p.y - 8); ctx.closePath();
    ctx.fillStyle = i === 2 ? (N ? '#8f86ff' : PALETTE.moony) : (N ? '#ffd27a' : PALETTE.sunny);
    ctx.fill(); ctx.lineWidth = 1.6 * k; ctx.strokeStyle = ink; ctx.stroke();
  }

  // ── side faces (earth with strata) ──
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4];
    const quad = [a, b, add(b, 0, D), add(a, 0, D)];
    // visibility: edges whose outward normal faces the viewer (downwards). centre test:
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const cx = (c[0].x + c[2].x) / 2, cy = (c[0].y + c[2].y) / 2;
    if (my < cy) continue; // back faces are hidden by the top anyway
    const left = mx < cx;
    poly(ctx, quad);
    const base: RGB = N ? (left ? [70, 62, 104] : [56, 50, 88]) : left ? [176, 128, 88] : [146, 102, 68];
    ctx.fillStyle = rgba(base);
    ctx.fill();
    // floor slab band (top lip)
    const lip = Math.min(8, D * 0.3);
    poly(ctx, [a, b, add(b, 0, lip), add(a, 0, lip)]);
    ctx.fillStyle = N ? (left ? '#5a5d86' : '#474a70') : left ? '#efe2c8' : '#d9c8a6';
    ctx.fill();
    // strata wiggles
    ctx.save();
    poly(ctx, quad); ctx.clip();
    ctx.strokeStyle = rgba(mix(base, [0, 0, 0], 0.25));
    ctx.lineWidth = 1.4 * k;
    for (let L = 1; L <= 2; L++) {
      const off = lip + (D - lip) * (L / 3);
      ctx.beginPath();
      const n = 16;
      for (let j = 0; j <= n; j++) {
        const u = j / n;
        const px = a.x + (b.x - a.x) * u, py = a.y + (b.y - a.y) * u + off + Math.sin(u * 20 + L * 2) * 1.6;
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    // pebbles
    ctx.fillStyle = rgba(mix(base, [255, 255, 255], 0.18));
    for (let j = 0; j < 5; j++) {
      const u = hash(i * 13 + j * 7.7), v = hash(i * 5 + j * 3.3);
      ellipse(ctx, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + lip + 3 + v * (D - lip - 6), 2.4 * k, 1.5 * k);
      ctx.fill();
    }
    ctx.restore();
    poly(ctx, quad);
    ctx.lineWidth = 2.5 * k; ctx.strokeStyle = ink; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x, a.y + lip); ctx.lineTo(b.x, b.y + lip); ctx.lineWidth = 1.3 * k; ctx.stroke();
  }

  }
  // ── top: wooden border trim ──
  poly(ctx, c);
  ctx.fillStyle = N ? '#3b3d63' : '#e3c79a';
  ctx.fill();
  // plank lines on trim
  ctx.save();
  poly(ctx, c); ctx.clip();
  ctx.strokeStyle = N ? 'rgba(10,10,30,0.35)' : 'rgba(120,80,40,0.25)';
  ctx.lineWidth = 1.2 * k;
  for (let i = -1; i <= cols + 1; i++) { const p = iso(i, -g.m), q = iso(i, rows + g.m); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
  ctx.restore();
  poly(ctx, c);
  ctx.lineWidth = 2.5 * k; ctx.strokeStyle = ink; ctx.stroke();

  // ── tiles: soft checker ──
  const A: RGB = N ? [42, 44, 74] : hex(PALETTE.paper);
  const B: RGB = N ? [34, 36, 62] : [232, 226, 214];
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const q = tileQuad(iso, gx, gy);
    poly(ctx, q);
    const jitter = (hash(gx * 31 + gy * 17) - 0.5) * 6;
    const col = (gx + gy) % 2 ? A : B;
    ctx.fillStyle = rgba([col[0] + jitter, col[1] + jitter, col[2] + jitter]);
    ctx.fill();
  }
  // subtle per-tile bevel highlight
  ctx.lineWidth = 1 * k;
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const q = tileQuad(iso, gx, gy);
    ctx.beginPath(); ctx.moveTo(q[3].x, q[3].y); ctx.lineTo(q[0].x, q[0].y); ctx.lineTo(q[1].x, q[1].y);
    ctx.strokeStyle = N ? 'rgba(140,150,255,0.10)' : 'rgba(255,255,255,0.7)';
    ctx.stroke();
  }
  // grout
  ctx.strokeStyle = N ? 'rgba(0,0,0,0.35)' : 'rgba(85,82,75,0.22)';
  ctx.lineWidth = 1.2 * k;
  for (let i = 0; i <= cols; i++) { const p = iso(i, 0), q = iso(i, rows); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
  for (let j = 0; j <= rows; j++) { const p = iso(0, j), q = iso(cols, j); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }

  // ── grid-aligned rug (exact tile edges, rounded corners, woven border) ──
  drawRug(ctx, cols, rows, iso, N, k, ink);

  // ── props on the trim (island only; the room places its own props in front of the walls) ──
  if (!island) return;
  const prop = (gx: number, gy: number, draw: (p: P) => void) => draw(iso(gx, gy));
  // toy blocks at the left corner
  prop(-g.m * 0.5, rows * 0.5, (p) => {
    const sz = 7 * k;
    for (const [dx, dy, col] of [[-6, 0, PALETTE.red], [6, 2, PALETTE.moony], [0, -9, PALETTE.sunny]] as const) {
      const q = { x: p.x + dx * k, y: p.y + dy * k };
      poly(ctx, [{ x: q.x - sz, y: q.y - sz }, { x: q.x + sz, y: q.y - sz }, { x: q.x + sz, y: q.y + sz * 0.6 }, { x: q.x - sz, y: q.y + sz * 0.6 }]);
      ctx.fillStyle = N ? rgba(mix(hex(col), [30, 30, 60], 0.55)) : col; ctx.fill();
      ctx.lineWidth = 1.8 * k; ctx.strokeStyle = ink; ctx.stroke();
    }
  });
  // ball near the right side
  prop(cols * 0.55, -g.m * 0.5, (p) => {
    circle(ctx, p.x, p.y - 6 * k, 6.5 * k);
    ctx.fillStyle = N ? '#7a5aa0' : '#ff8fb1'; ctx.fill();
    ctx.lineWidth = 1.8 * k; ctx.strokeStyle = ink; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 6.5 * k, p.y - 6 * k); ctx.quadraticCurveTo(p.x, p.y - 2 * k, p.x + 6.5 * k, p.y - 6 * k); ctx.stroke();
  });
  // star nightlight at far corner
  prop(cols + g.m * 0.5, -g.m * 0.5, (p) => {
    ctx.fillStyle = N ? '#5a5d86' : '#efe2c8';
    roundRect(ctx, p.x - 4 * k, p.y - 6 * k, 8 * k, 6 * k, 2 * k); ctx.fill(); ctx.lineWidth = 1.6 * k; ctx.strokeStyle = ink; ctx.stroke();
    starPath(ctx, p.x, p.y - 14 * k, 8 * k, 0, 0.5);
    ctx.fillStyle = N ? '#ffe08a' : '#ffd36b'; ctx.fill(); ctx.lineWidth = 1.8 * k; ctx.stroke();
  });
}


/** Rug footprint in tiles: exactly tile-aligned, one tile in from every edge. */
export function rugRect(cols: number, rows: number) {
  if (cols < 3 || rows < 3) return null;
  return { x0: 1, y0: 1, x1: cols - 1, y1: rows - 1 };
}
/** Rounded rectangle in GRID space (corner radius r in tiles), mapped through iso. */
export function gridRoundRect(ctx: Ctx, iso: IsoFn, x0: number, y0: number, x1: number, y1: number, r: number) {
  ctx.beginPath();
  const corners: [number, number, number][] = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
  let first = true;
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      const p = iso(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
    }
  }
  ctx.closePath();
}
function gridLine(ctx: Ctx, iso: IsoFn, ax: number, ay: number, bx: number, by: number) {
  const a = iso(ax, ay), b = iso(bx, by);
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
}
function drawRug(ctx: Ctx, cols: number, rows: number, iso: IsoFn, N: number, k: number, ink: string) {
  const R = rugRect(cols, rows);
  if (!R) return;
  const { x0, y0, x1, y1 } = R;
  const r = 0.22, bw = 0.2; // corner radius, border width (tiles)
  // contact shadow (rug has a little thickness)
  ctx.save();
  ctx.translate(0, 2 * k);
  gridRoundRect(ctx, iso, x0, y0, x1, y1, r);
  ctx.fillStyle = N ? 'rgba(0,0,10,0.35)' : 'rgba(90,60,40,0.22)';
  ctx.fill();
  ctx.restore();
  // border band
  const bord: RGB = N ? [86, 70, 128] : [226, 128, 120];
  const field: RGB = N ? [70, 66, 118] : [251, 226, 200];
  gridRoundRect(ctx, iso, x0, y0, x1, y1, r);
  const bg = ctx.createLinearGradient(iso(x0, y0).x, iso(x0, y0).y, iso(x1, y1).x, iso(x1, y1).y);
  bg.addColorStop(0, rgba(mix(bord, [255, 255, 255], 0.12))); bg.addColorStop(1, rgba(mix(bord, [40, 20, 40], 0.1)));
  ctx.fillStyle = bg; ctx.fill();
  // field
  gridRoundRect(ctx, iso, x0 + bw, y0 + bw, x1 - bw, y1 - bw, r * 0.6);
  const fg = ctx.createLinearGradient(iso(x0, y0).x, iso(x0, y0).y, iso(x1, y1).x, iso(x1, y1).y);
  fg.addColorStop(0, rgba(mix(field, [255, 255, 255], 0.25))); fg.addColorStop(0.55, rgba(field)); fg.addColorStop(1, rgba(mix(field, [120, 80, 70], 0.12)));
  ctx.fillStyle = fg; ctx.fill();
  // fabric weave on the field (fine lines along both grid axes)
  ctx.save();
  ctx.clip();
  ctx.lineWidth = 0.8 * k;
  ctx.strokeStyle = N ? 'rgba(200,190,255,0.08)' : 'rgba(150,90,60,0.10)';
  ctx.beginPath();
  for (let u = x0; u <= x1; u += 0.08) gridLine(ctx, iso, u, y0, u, y1);
  ctx.stroke();
  ctx.strokeStyle = N ? 'rgba(0,0,20,0.12)' : 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  for (let v = y0; v <= y1; v += 0.08) gridLine(ctx, iso, x0, v, x1, v);
  ctx.stroke();
  // inner stitched line
  ctx.restore();
  ctx.setLineDash([5 * k, 4 * k]);
  gridRoundRect(ctx, iso, x0 + bw + 0.1, y0 + bw + 0.1, x1 - bw - 0.1, y1 - bw - 0.1, r * 0.4);
  ctx.lineWidth = 1.3 * k; ctx.strokeStyle = N ? 'rgba(200,190,255,0.45)' : 'rgba(200,100,90,0.55)'; ctx.stroke();
  ctx.setLineDash([]);
  // border pattern: little diamonds marching along the band centre
  ctx.fillStyle = N ? 'rgba(255,214,120,0.55)' : 'rgba(255,246,228,0.9)';
  const c = bw / 2;
  const diamond = (gx: number, gy: number) => {
    const d = 0.055;
    const p = [iso(gx, gy - d), iso(gx + d, gy), iso(gx, gy + d), iso(gx - d, gy)];
    ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(p[i].x, p[i].y); ctx.closePath(); ctx.fill();
  };
  const step = 0.25;
  for (let u = x0 + r + step / 2; u < x1 - r; u += step) { diamond(u, y0 + c); diamond(u, y1 - c); }
  for (let v = y0 + r + step / 2; v < y1 - r; v += step) { diamond(x0 + c, v); diamond(x1 - c, v); }
  // field edge + outline
  gridRoundRect(ctx, iso, x0 + bw, y0 + bw, x1 - bw, y1 - bw, r * 0.6);
  ctx.lineWidth = 1.2 * k; ctx.strokeStyle = N ? 'rgba(10,10,30,0.5)' : 'rgba(140,60,60,0.45)'; ctx.stroke();
  gridRoundRect(ctx, iso, x0, y0, x1, y1, r);
  ctx.lineWidth = 2 * k; ctx.strokeStyle = ink; ctx.lineJoin = 'round'; ctx.stroke();
  // fringe tassels on the two front ends (short, so they never leave the rug tiles' footprint much)
  ctx.lineWidth = 1.2 * k; ctx.strokeStyle = N ? 'rgba(200,190,255,0.5)' : 'rgba(170,90,80,0.7)';
  ctx.beginPath();
  for (let v = y0 + r; v <= y1 - r + 1e-6; v += 0.1) gridLine(ctx, iso, x1, v, x1 + 0.05, v);
  for (let u = x0 + r; u <= x1 - r + 1e-6; u += 0.1) gridLine(ctx, iso, u, y1, u, y1 + 0.05);
  ctx.stroke();
}

// ═════════════════════════════ BACKGROUND ═════════════════════════════
interface BgCache { day: HTMLCanvasElement; night: HTMLCanvasElement; w: number; h: number; scale: number }
let bgCache: BgCache | null = null;

const STARS = Array.from({ length: 140 }, (_, i) => ({
  x: hash(i * 1.37), y: hash(i * 7.91), r: 0.5 + hash(i * 3.3) * 1.3, tw: hash(i * 9.1) * TAU, sp: 1 + hash(i * 2.2) * 2.5, big: i % 11 === 0,
}));
const CLOUDS = Array.from({ length: 5 }, (_, i) => ({ x: hash(i * 4.4 + 1), y: 0.08 + hash(i * 2.9) * 0.4, s: 0.7 + hash(i * 6.1) * 0.7, v: 4 + hash(i) * 6 }));

function renderSky(ctx: Ctx, w: number, h: number, night: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (night) {
    g.addColorStop(0, '#12121f'); g.addColorStop(0.6, PALETTE.night); g.addColorStop(1, '#2b2850');
  } else {
    g.addColorStop(0, '#f7f5f0'); g.addColorStop(0.7, PALETTE.paper); g.addColorStop(1, '#efe3d2');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (!night) {
    // paper grain + halftone dot grid (the hackathon-site look)
    ctx.fillStyle = 'rgba(14,14,14,0.05)';
    const step = 22;
    for (let y = step / 2; y < h; y += step) for (let x = ((y / step) % 2) * step / 2; x < w; x += step) {
      ctx.beginPath(); ctx.arc(x, y, 1.1, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(85,82,75,0.05)';
    for (let i = 0; i < 400; i++) ctx.fillRect(hash(i * 1.1) * w, hash(i * 2.7) * h, 1.5, 1.5);
    // far sun-glow
    const sg = ctx.createRadialGradient(w * 0.8, h * 0.18, 4, w * 0.8, h * 0.18, h * 0.5);
    sg.addColorStop(0, 'rgba(255,200,110,0.35)'); sg.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
  } else {
    // faint milky way band + dim static stars
    const mw = ctx.createLinearGradient(0, h * 0.7, w, h * 0.1);
    mw.addColorStop(0, 'rgba(120,100,200,0)'); mw.addColorStop(0.5, 'rgba(150,130,230,0.13)'); mw.addColorStop(1, 'rgba(120,100,200,0)');
    ctx.fillStyle = mw; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 260; i++) ctx.fillRect(hash(i * 5.3 + 2) * w, hash(i * 8.1 + 3) * h, 1, 1);
  }
}

function cloud(ctx: Ctx, x: number, y: number, s: number, night: number) {
  ctx.beginPath();
  ctx.arc(x - 22 * s, y, 13 * s, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x - 6 * s, y - 12 * s, 15 * s, Math.PI * 1.05, Math.PI * 1.9);
  ctx.arc(x + 14 * s, y - 6 * s, 12 * s, Math.PI * 1.2, Math.PI * 1.95);
  ctx.arc(x + 24 * s, y, 13 * s, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath();
  ctx.fillStyle = night ? 'rgba(60,58,100,0.55)' : 'rgba(255,255,255,0.85)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = night ? 'rgba(140,140,200,0.25)' : 'rgba(14,14,14,0.18)';
  ctx.stroke();
}

export function drawBackground(ctx: Ctx, w: number, h: number, t: number, night: number) {
  const tr = ctx.getTransform();
  const scale = Math.max(0.25, Math.hypot(tr.a, tr.b));
  if (!bgCache || bgCache.w !== w || bgCache.h !== h || bgCache.scale !== scale) {
    const mk = (n: number) => {
      const c = newCanvas(w * scale, h * scale);
      const cx = c.getContext('2d')!;
      cx.scale(scale, scale);
      renderSky(cx, w, h, n);
      return c;
    };
    bgCache = { day: mk(0), night: mk(1), w, h, scale };
  }
  const n = clamp(night);
  ctx.save();
  if (n < 0.999) ctx.drawImage(bgCache.day, 0, 0, w, h);
  if (n > 0.001) { ctx.globalAlpha = n; ctx.drawImage(bgCache.night, 0, 0, w, h); ctx.globalAlpha = 1; }

  // twinkling stars
  if (n > 0.02) {
    for (const st of STARS) {
      const a = n * (0.45 + 0.55 * Math.sin(t * st.sp + st.tw));
      if (a <= 0.03) continue;
      const sx = st.x * w, sy = st.y * h * 0.85;
      ctx.globalAlpha = a;
      if (st.big) {
        starPath(ctx, sx, sy, 3.5 + st.r, t * 0.2, 0.35, 4);
        ctx.fillStyle = '#fff6d8'; ctx.fill();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(sx, sy, st.r, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // moon (sleepy crescent with a face)
    const mx = w * 0.84, my = h * 0.16, mr = Math.min(w, h) * 0.055 + 14;
    ctx.globalAlpha = n;
    const mg = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3);
    mg.addColorStop(0, 'rgba(255,240,200,0.35)'); mg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = mg; circle(ctx, mx, my, mr * 3); ctx.fill();
    // crescent = outer disk minus an offset disk (built from the two intersection points)
    {
      const ox = mx + mr * 0.5, oy = my - mr * 0.3, r2 = mr * 0.88;
      const d = Math.hypot(ox - mx, oy - my);
      const a = (mr * mr - r2 * r2 + d * d) / (2 * d);
      const hh = Math.sqrt(Math.max(0, mr * mr - a * a));
      const ux = (ox - mx) / d, uy = (oy - my) / d;
      const px = mx + ux * a, py = my + uy * a;
      const p1 = { x: px - uy * hh, y: py + ux * hh }, p2 = { x: px + uy * hh, y: py - ux * hh };
      const a1 = Math.atan2(p1.y - my, p1.x - mx), a2 = Math.atan2(p2.y - my, p2.x - mx);
      const b1 = Math.atan2(p1.y - oy, p1.x - ox), b2 = Math.atan2(p2.y - oy, p2.x - ox);
      ctx.beginPath();
      ctx.arc(mx, my, mr, a1, a2, false);
      ctx.arc(ox, oy, r2, b2, b1, true);
      ctx.closePath();
    }
    ctx.fillStyle = '#fff1c4';
    ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    // closed eye + smile on the crescent
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(mx - mr * 0.55, my - mr * 0.05, mr * 0.16, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(mx - mr * 0.45, my + mr * 0.35, mr * 0.12, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // drifting clouds
  for (const c of CLOUDS) {
    const span = w + 200;
    const cx = ((c.x * span + t * c.v) % span) - 100;
    ctx.globalAlpha = n > 0.5 ? 0.9 : 0.95;
    cloud(ctx, cx, c.y * h, c.s * Math.max(0.8, w / 1200), n > 0.5 ? 1 : 0);
  }
  ctx.globalAlpha = 1;
  // vignette
  const v = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.hypot(w, h) * 0.62);
  v.addColorStop(0, 'rgba(14,14,30,0)');
  v.addColorStop(1, `rgba(14,14,30,${0.16 + 0.3 * n})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ═════════════════════════════ SILK THREAD ═════════════════════════════
export function drawLink(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, strength: number, t: number) {
  const st = clamp(strength);
  if (st < 0.02) return;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const sag = Math.min(40, len * 0.18);
  const N = Math.max(12, Math.min(48, Math.round(len / 8)));
  const pts: P[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const env = Math.sin(u * Math.PI);
    const wave = Math.sin(u * 10 - t * 4) * 3.2 * env;
    const sg = sag * env; // droop downward
    pts.push({ x: x1 + dx * u + nx * wave, y: y1 + dy * u + ny * wave + sg });
  }
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path();
  ctx.strokeStyle = `rgba(190,120,255,${0.18 * st})`;
  ctx.lineWidth = 4 + 10 * st;
  ctx.stroke();
  ctx.strokeStyle = `rgba(214,170,255,${0.35 + 0.45 * st})`;
  ctx.lineWidth = 1.5 + 2.5 * st;
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * st})`;
  ctx.lineWidth = 0.8 + 0.8 * st;
  ctx.stroke();
  // shimmer beads travelling both ways (sharing goes both ways)
  for (let k = 0; k < 4; k++) {
    const u = ((t * 0.25 + k / 4) % 1);
    const uu = k % 2 ? 1 - u : u;
    const p = pts[Math.round(uu * N)];
    const a = Math.sin(uu * Math.PI) * st;
    ctx.globalAlpha = a;
    starPath(ctx, p.x, p.y, 3 + 2 * st, t * 2 + k, 0.4, 4);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  ctx.restore();
}

// ═════════════════════════════ SIGNS ═════════════════════════════
const signW = new Map<string, number>();
export function drawSign(ctx: Ctx, x: number, y: number, s: number, text: string, t: number, shake = 0) {
  ctx.save();
  ctx.font = `700 ${13 * s}px Quicksand, sans-serif`;
  const key = text + '|' + s;
  let tw = signW.get(key);
  if (tw === undefined) { tw = ctx.measureText(text).width; signW.set(key, tw); }
  const w = tw + 26 * s, h = 26 * s, drop = 12 * s;
  ctx.translate(x, y);
  const sh = clamp(shake);
  ctx.rotate(Math.sin(t * 1.2 + x * 0.01) * 0.025 + Math.sin(t * 38) * 0.14 * sh);
  ctx.translate(Math.sin(t * 47) * 2 * s * sh, 0);
  // strings
  ctx.beginPath();
  ctx.moveTo(-w * 0.32, drop + 2 * s); ctx.lineTo(0, 0); ctx.lineTo(w * 0.32, drop + 2 * s);
  ctx.lineWidth = 1.6 * s; ctx.strokeStyle = INK; ctx.stroke();
  // nail
  circle(ctx, 0, 0, 2.6 * s); ctx.fillStyle = '#9a98a8'; ctx.fill(); inkStroke(ctx, s, 1.5);
  // shadow
  roundRect(ctx, -w / 2 + 3 * s, drop + 4 * s, w, h, 6 * s);
  ctx.fillStyle = 'rgba(14,14,30,0.18)'; ctx.fill();
  // plank
  roundRect(ctx, -w / 2, drop, w, h, 6 * s);
  const g = ctx.createLinearGradient(0, drop, 0, drop + h);
  g.addColorStop(0, '#f0cf98'); g.addColorStop(1, '#d7a866');
  ctx.fillStyle = g; ctx.fill();
  // grain
  ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(140,90,40,0.28)'; ctx.lineWidth = 1 * s;
  for (let i = 0; i < 3; i++) {
    const gy = drop + h * (0.25 + i * 0.25);
    ctx.beginPath(); ctx.moveTo(-w / 2, gy);
    ctx.bezierCurveTo(-w / 4, gy - 2 * s, w / 4, gy + 2 * s, w / 2, gy - 1 * s); ctx.stroke();
  }
  ellipse(ctx, w * 0.36, drop + h * 0.62, 3 * s, 1.6 * s); ctx.stroke();
  ctx.restore();
  roundRect(ctx, -w / 2, drop, w, h, 6 * s);
  inkStroke(ctx, s);
  // pegs
  ctx.fillStyle = '#8a5a2b';
  circle(ctx, -w * 0.32, drop + 3.5 * s, 1.6 * s); ctx.fill();
  circle(ctx, w * 0.32, drop + 3.5 * s, 1.6 * s); ctx.fill();
  // ink text
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, drop + h / 2 + 1 * s);
  if (sh > 0.3) {
    ctx.strokeStyle = PALETTE.red; ctx.lineWidth = 2 * s; ctx.globalAlpha = sh;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * (w / 2 + 4 * s), drop + 4 * s); ctx.lineTo(side * (w / 2 + 9 * s), drop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(side * (w / 2 + 4 * s), drop + h - 4 * s); ctx.lineTo(side * (w / 2 + 9 * s), drop + h); ctx.stroke();
    }
  }
  ctx.restore();
}
