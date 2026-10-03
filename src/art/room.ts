// Grounded daycare ROOM diorama (v0.2): iso floor + two cutaway back walls (dollhouse style).
// Static parts are cached per (geometry, dpr) as day+night offscreen layers and cross-faded by `night`.
import { PALETTE, type IsoFn } from '../core/contracts';
import { type Ctx, type RGB, TAU, INK, hex, mix, rgba, clamp, hash, circle, ellipse, starPath, roundRect, sceneState } from './util';
import { newCanvas, floorGeom, poly, renderFloor } from './world';

type P = { x: number; y: number };
/** Wall height (in iso z units, 1 = one tile height TH) and thickness (tiles). */
export const WALL_H = 2.6, WALL_T = 0.2;
const LW = (px: number) => px / 48; // line width (CSS px at s=1) in wall-local units

interface RoomCache { day: HTMLCanvasElement; night: HTMLCanvasElement; ox: number; oy: number; w: number; h: number }
const cache = new Map<string, RoomCache>();

function geom(cols: number, rows: number, iso: IsoFn) {
  const g = floorGeom(cols, rows, iso);
  const m = g.m, T = WALL_T, H = WALL_H;
  const o = iso(0, 0), ux = iso(1, 0), uy = iso(0, 1), uz = iso(0, 0, 1);
  const s = Math.hypot(uz.x - o.x, uz.y - o.y) / 48; // = scene scale s
  const D = 22 * s; // floor slab depth (front cut edge)
  return {
    ...g, m, T, H, s, D,
    U: { x: ux.x - o.x, y: ux.y - o.y }, Vy: { x: uy.x - o.x, y: uy.y - o.y }, Z: { x: uz.x - o.x, y: uz.y - o.y },
    Lr: cols + 2 * m, Ll: rows + 2 * m,
  };
}
type G = ReturnType<typeof geom>;

/** Set a transform so (u, v) draws on a wall: u along the wall from the back corner (tiles), v up (tiles of TH). */
function onWall(ctx: Ctx, iso: IsoFn, g: G, side: 'L' | 'R') {
  const o = iso(-g.m, -g.m, 0);
  const U = side === 'R' ? g.U : g.Vy;
  ctx.transform(U.x, U.y, g.Z.x, g.Z.y, o.x, o.y);
}

export function drawRoom(ctx: Ctx, cols: number, rows: number, iso: IsoFn, t: number, night: number) {
  const tr = ctx.getTransform();
  const scale = Math.max(0.25, Math.hypot(tr.a, tr.b));
  const o = iso(0, 0), ex = iso(1, 0), ey = iso(0, 1), ez = iso(0, 0, 1);
  const key = [cols, rows, o.x, o.y, ex.x, ex.y, ey.x, ey.y, ez.y, scale].map((v) => Math.round(v * 100) / 100).join(',');
  const g = geom(cols, rows, iso);
  let rc = cache.get(key);
  if (!rc) {
    const m = g.m, T = g.T, H = g.H;
    const pts = [iso(-m - T, -m - T, H + 0.2), iso(cols + m, -m - T, H + 0.2), iso(-m - T, rows + m, H + 0.2), iso(cols + m, rows + m), iso(cols + m, -m - T), iso(-m - T, rows + m)];
    const pad = 16;
    const ox = Math.min(...pts.map((p) => p.x)) - pad, oy = Math.min(...pts.map((p) => p.y)) - pad;
    const w = Math.max(...pts.map((p) => p.x)) + pad - ox, h = Math.max(...pts.map((p) => p.y)) + g.D + pad - oy;
    const mk = (n: number) => {
      const c = newCanvas(w * scale, h * scale);
      const cx = c.getContext('2d')!;
      cx.scale(scale, scale);
      cx.translate(-ox, -oy);
      renderRoom(cx, cols, rows, iso, g, n);
      return c;
    };
    rc = { day: mk(0), night: mk(1), ox, oy, w, h };
    if (cache.size > 6) cache.clear();
    cache.set(key, rc);
  }
  const n = clamp(night);
  sceneState.night = n;
  if (n < 0.999) ctx.drawImage(rc.day, rc.ox, rc.oy, rc.w, rc.h);
  if (n > 0.001) { ctx.save(); ctx.globalAlpha = n; ctx.drawImage(rc.night, rc.ox, rc.oy, rc.w, rc.h); ctx.restore(); }
  live(ctx, iso, g, t, n);
}

// ── live layer: clock hands, window twinkles, nightlight + window light pools ──
function live(ctx: Ctx, iso: IsoFn, g: G, t: number, n: number) {
  // clock hands (right wall)
  ctx.save();
  onWall(ctx, iso, g, 'R');
  const c = clockPos(g);
  const hr = t * 0.02, mn = t * 0.25;
  ctx.lineCap = 'round';
  ctx.strokeStyle = n > 0.5 ? '#e8e4ff' : INK;
  ctx.lineWidth = LW(2.4);
  ctx.beginPath(); ctx.moveTo(c.u, c.v); ctx.lineTo(c.u + Math.sin(hr) * 0.16, c.v + Math.cos(hr) * 0.16); ctx.stroke();
  ctx.lineWidth = LW(1.6);
  ctx.beginPath(); ctx.moveTo(c.u, c.v); ctx.lineTo(c.u + Math.sin(mn) * 0.24, c.v + Math.cos(mn) * 0.24); ctx.stroke();
  // window twinkles at night
  if (n > 0.05) {
    const wd = windowRect(g);
    for (let i = 0; i < 7; i++) {
      const a = n * (0.4 + 0.6 * Math.sin(t * (1.5 + hash(i) * 2) + i * 2));
      if (a < 0.05) continue;
      ctx.globalAlpha = a;
      const u = wd.u0 + 0.15 + hash(i * 3.7) * (wd.w - 0.3), v = wd.v0 + 0.15 + hash(i * 5.1) * (wd.h - 0.5);
      starPath(ctx, u, v, 0.05 + hash(i * 1.3) * 0.03, 0, 0.4, 4);
      ctx.fillStyle = '#fff8dc'; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (n > 0.05) {
    // warm nightlight pool (left wall plug)
    const nl = nightlightPos(g);
    const p = iso(-g.m, -g.m + nl.u, nl.v);
    const pulse = 0.85 + 0.15 * Math.sin(t * 1.7);
    const r = 90 * g.s * pulse;
    const gr = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r);
    gr.addColorStop(0, `rgba(255,214,120,${0.55 * n})`);
    gr.addColorStop(0.4, `rgba(255,190,100,${0.18 * n})`);
    gr.addColorStop(1, 'rgba(255,190,100,0)');
    ctx.fillStyle = gr;
    circle(ctx, p.x, p.y, r); ctx.fill();
  }
}

// ── wall layout (u = tiles along the wall from the back corner, v = tile-heights up) ──
// Kept deliberately sparse so each wall has a clear SIGN span (see wallSignSlots + docs/ART_NOTES.md).
function clockPos(_g: G) { return { u: 0.72, v: 1.72 }; }
function windowRect(g: G) { const w = 1.6; return { u0: g.Lr - 2.5, v0: 0.85, w, h: 1.3 }; }
function nightlightPos(_g: G) { return { u: 1.0, v: 0.42 }; }
function doorRect(g: G) { return { u0: g.Ll - 1.55, w: 0.95, h: 1.95 }; }
const SHELF = { u0: 0.4, u1: 1.5 };
/** Sign band on both walls (tile-heights above the floor): keep signs inside it. */
export const SIGN_BAND = { z0: 0.98, z1: 1.95, zc: 1.45 };
/** Free wall spans in wall-local tiles (u from the back corner). */
function freeSpans(Lr: number, Ll: number) {
  const right: [number, number] = [1.2, Lr - 2.5 - 0.7];
  const left: [number, number] = [SHELF.u1 + 0.2, Ll - 1.55 - 0.23];
  return { right, left };
}
export interface WallSlot { wall: 'left' | 'right'; gx: number; gy: number; gz: number; span: [number, number]; spanTiles: [number, number] }
/** Where level signs go: centres (grid coords; pass iso(gx, gy, gz) to drawWallSign) of the free wall spans,
 *  right wall first. A span ≥ 4.6 tiles yields two slots. span = fractions 0..1 along the wall from the back corner. */
export function wallSignSlots(cols: number, rows: number): WallSlot[] {
  const m = 0.42, Lr = cols + 2 * m, Ll = rows + 2 * m;
  const fs = freeSpans(Lr, Ll);
  const out: WallSlot[] = [];
  const add = (wall: 'left' | 'right', a: number, b: number, L: number) => {
    const n = b - a >= 4.6 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const u0 = a + ((b - a) * i) / n, u1 = a + ((b - a) * (i + 1)) / n, u = (u0 + u1) / 2;
      out.push({
        wall, gz: SIGN_BAND.zc, span: [u0 / L, u1 / L], spanTiles: [u0, u1],
        gx: wall === 'right' ? -m + u : -m, gy: wall === 'right' ? -m : -m + u,
      });
    }
  };
  add('right', fs.right[0], fs.right[1], Lr);
  add('left', fs.left[0], fs.left[1], Ll);
  // interleave so the first two slots are on different walls
  return out.map((p) => [rank(p, out), p] as const).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}
function rank(p: WallSlot, all: WallSlot[]) { const same = all.filter((q) => q.wall === p.wall); return same.indexOf(p) * 2 + (p.wall === 'right' ? 0 : 1); }

// ── static render ──
function renderRoom(ctx: Ctx, cols: number, rows: number, iso: IsoFn, g: G, N: number) {
  const ink = N ? '#0b0b16' : INK;
  const m = g.m, T = g.T, H = g.H, s = g.s;
  const k = s;

  // wall outer shells (thickness) + caps, then faces
  const wallFace = (side: 'L' | 'R') => {
    ctx.save();
    onWall(ctx, iso, g, side);
    const L = side === 'R' ? g.Lr : g.Ll;
    // wallpaper
    const base: RGB = N ? (side === 'R' ? [44, 46, 82] : [38, 40, 72]) : side === 'R' ? [246, 233, 214] : [236, 221, 200];
    ctx.fillStyle = rgba(base);
    ctx.fillRect(0, 0, L, H);
    // pattern: soft vertical stripes + tiny star/dot sprigs
    ctx.fillStyle = rgba(mix(base, N ? [90, 90, 150] : [255, 200, 170], 0.22));
    for (let u = 0.1; u < L; u += 0.42) ctx.fillRect(u, 0.2, 0.16, H - 0.2);
    ctx.fillStyle = rgba(mix(base, N ? [150, 150, 220] : [200, 140, 120], 0.35));
    for (let u = 0.31; u < L; u += 0.42) for (let v = 0.55; v < H - 0.1; v += 0.42) {
      const odd = Math.round(v / 0.42) % 2;
      if (odd) { starPath(ctx, u, v, 0.045, 0, 0.45, 4); ctx.fill(); }
      else { circle(ctx, u, v + 0.2, 0.025); ctx.fill(); }
    }
    // dado rail
    ctx.fillStyle = N ? '#3a3d6a' : '#e7cfa8';
    ctx.fillRect(0, 0.78, L, 0.08);
    ctx.strokeStyle = rgba(N ? [10, 10, 30] : [120, 80, 40], 0.45);
    ctx.lineWidth = LW(1.2);
    ctx.beginPath(); ctx.moveTo(0, 0.78); ctx.lineTo(L, 0.78); ctx.moveTo(0, 0.86); ctx.lineTo(L, 0.86); ctx.stroke();
    // baseboard
    ctx.fillStyle = N ? '#4a3f6e' : '#c99a6b';
    ctx.fillRect(0, 0, L, 0.2);
    ctx.fillStyle = N ? '#5b4f86' : '#ddb487';
    ctx.fillRect(0, 0.16, L, 0.05);
    ctx.lineWidth = LW(1.6); ctx.strokeStyle = ink;
    ctx.beginPath(); ctx.moveTo(0, 0.2); ctx.lineTo(L, 0.2); ctx.stroke();
    // shade toward the back corner (ambient occlusion) + top
    const sh = ctx.createLinearGradient(0, 0, 0.9, 0);
    sh.addColorStop(0, `rgba(30,20,40,${N ? 0.35 : 0.16})`); sh.addColorStop(1, 'rgba(30,20,40,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, 0.9, H);
    if (side === 'L') { ctx.fillStyle = `rgba(30,20,40,${N ? 0.12 : 0.06})`; ctx.fillRect(0, 0, L, H); }
    // soft vertical falloff: darker near the floor (contact AO), a touch of light near the top
    const vg = ctx.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, `rgba(40,24,40,${N ? 0.3 : 0.16})`); vg.addColorStop(0.18, 'rgba(40,24,40,0)');
    vg.addColorStop(0.75, 'rgba(255,255,255,0)'); vg.addColorStop(1, `rgba(255,250,240,${N ? 0.04 : 0.12})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, L, H);
    if (side === 'R') rightWallProps(ctx, g, N, ink);
    else leftWallProps(ctx, g, N, ink);
    // outline
    ctx.lineWidth = LW(2.5); ctx.strokeStyle = ink; ctx.lineJoin = 'round';
    ctx.strokeRect(0, 0, L, H);
    ctx.restore();
  };

  // caps (cut top of walls) and front end faces
  const cap = N ? '#5a5d86' : '#fffaf0';
  const endF = N ? '#3b3d63' : '#e9d9bf';
  // floor slab front faces (cut edge)
  const fr = iso(cols + m, -m - T), fb = iso(cols + m, rows + m), fl = iso(-m - T, rows + m);
  const D = g.D;
  const slab = (a: P, b: P, col: string) => {
    poly(ctx, [a, b, { x: b.x, y: b.y + D }, { x: a.x, y: a.y + D }]);
    ctx.fillStyle = col; ctx.fill();
    // floorboard layers
    ctx.lineWidth = 1.2 * k; ctx.strokeStyle = N ? 'rgba(0,0,0,0.35)' : 'rgba(110,70,40,0.35)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y + D * 0.35); ctx.lineTo(b.x, b.y + D * 0.35); ctx.stroke();
    const n = Math.round(Math.hypot(b.x - a.x, b.y - a.y) / (34 * k));
    for (let i = 1; i < n; i++) {
      const u = i / n + (hash(i) - 0.5) * 0.02, px = a.x + (b.x - a.x) * u, py = a.y + (b.y - a.y) * u;
      ctx.beginPath(); ctx.moveTo(px, py + D * 0.35); ctx.lineTo(px, py + D); ctx.stroke();
    }
    // wood grain streaks + top highlight / bottom shade (multi-stop)
    ctx.save();
    poly(ctx, [a, b, { x: b.x, y: b.y + D }, { x: a.x, y: a.y + D }]); ctx.clip();
    const sg = ctx.createLinearGradient(0, Math.min(a.y, b.y), 0, Math.max(a.y, b.y) + D);
    sg.addColorStop(0, 'rgba(255,255,255,0.18)'); sg.addColorStop(0.25, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(30,10,0,0.22)');
    ctx.fillStyle = sg; ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y) - 2, Math.abs(b.x - a.x), Math.abs(b.y - a.y) + D + 4);
    ctx.strokeStyle = N ? 'rgba(0,0,0,0.18)' : 'rgba(110,60,25,0.2)'; ctx.lineWidth = 0.8 * k;
    for (let i = 0; i < 9; i++) {
      const v = 0.42 + hash(i * 3.3) * 0.5, u0 = hash(i * 7.1) * 0.8, len = 0.08 + hash(i * 1.7) * 0.18;
      const p0 = { x: a.x + (b.x - a.x) * u0, y: a.y + (b.y - a.y) * u0 + D * v };
      const p1 = { x: a.x + (b.x - a.x) * (u0 + len), y: a.y + (b.y - a.y) * (u0 + len) + D * v };
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2 + 1.5 * k, p1.x, p1.y); ctx.stroke();
    }
    ctx.restore();
    poly(ctx, [a, b, { x: b.x, y: b.y + D }, { x: a.x, y: a.y + D }]);
    ctx.lineWidth = 3 * k; ctx.strokeStyle = ink; ctx.lineJoin = 'round'; ctx.stroke();
  };
  // soft ground shadow under the diorama
  ctx.save();
  ctx.fillStyle = N ? 'rgba(0,0,10,0.35)' : 'rgba(60,40,20,0.12)';
  poly(ctx, [{ x: fr.x + 10 * k, y: fr.y + D + 4 * k }, { x: fb.x, y: fb.y + D + 12 * k }, { x: fl.x - 10 * k, y: fl.y + D + 4 * k }, { x: fb.x, y: fb.y + D - 4 * k }]);
  ctx.fill();
  ctx.restore();
  slab(fl, fb, N ? '#33355a' : '#c08a5c');
  slab(fb, fr, N ? '#2a2c4c' : '#a8744a');

  // floor strip under the walls' thickness
  poly(ctx, [iso(-m - T, -m - T), iso(cols + m, -m - T), iso(cols + m, -m), iso(-m, -m), iso(-m, rows + m), iso(-m - T, rows + m)]);
  ctx.fillStyle = N ? '#3b3d63' : '#e3c79a'; ctx.fill();

  renderFloor(ctx, cols, rows, iso, N, false);
  floorAO(ctx, iso, g, N);

  // walls: left first (both are behind the floor, never overlap it)
  wallFace('L');
  wallFace('R');
  // wall caps
  poly(ctx, [iso(-m, -m, H), iso(cols + m, -m, H), iso(cols + m, -m - T, H), iso(-m - T, -m - T, H)]);
  ctx.fillStyle = cap; ctx.fill(); ctx.lineWidth = 2.5 * k; ctx.strokeStyle = ink; ctx.lineJoin = 'round'; ctx.stroke();
  poly(ctx, [iso(-m, -m, H), iso(-m, rows + m, H), iso(-m - T, rows + m, H), iso(-m - T, -m - T, H)]);
  ctx.fillStyle = cap; ctx.fill(); ctx.stroke();
  // end faces (the cut)
  poly(ctx, [iso(cols + m, -m, 0), iso(cols + m, -m, H), iso(cols + m, -m - T, H), iso(cols + m, -m - T, 0)]);
  ctx.fillStyle = endF; ctx.fill(); ctx.lineWidth = 3 * k; ctx.stroke();
  poly(ctx, [iso(-m, rows + m, 0), iso(-m, rows + m, H), iso(-m - T, rows + m, H), iso(-m - T, rows + m, 0)]);
  ctx.fillStyle = endF; ctx.fill(); ctx.stroke();

  // moonbeam / sunbeam on the floor through the window
  const wd = windowRect(g);
  const beam = (u: number, v: number) => iso(-m + u + v * 0.55, -m + v * 0.85);
  ctx.save();
  poly(ctx, [beam(wd.u0, 0.15), beam(wd.u0 + wd.w, 0.15), beam(wd.u0 + wd.w, 2.2), beam(wd.u0, 2.2)]);
  const bg = ctx.createLinearGradient(beam(wd.u0, 0).x, beam(wd.u0, 0).y, beam(wd.u0, 2.2).x, beam(wd.u0, 2.2).y);
  bg.addColorStop(0, N ? 'rgba(180,190,255,0.22)' : 'rgba(255,240,190,0.35)');
  bg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bg; ctx.fill();
  ctx.restore();

  // bunting across both walls' tops (draped)
  bunting(ctx, iso, g, N, ink);
  // floor props: drawn AFTER the walls, footprints fully inside the back trim (never touching a wall or a tile)
  trimProps(ctx, cols, rows, iso, g, N, ink);
}

/** Ambient occlusion where the floor meets the walls (a soft dark band on the floor, fading into the room). */
function floorAO(ctx: Ctx, iso: IsoFn, g: G, N: number) {
  const m = g.m, cols = g.Lr - 2 * m, rows = g.Ll - 2 * m, w = 0.55;
  const a = N ? 0.45 : 0.28;
  const band = (pts: P[], from: P, to: P) => {
    const gr = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    gr.addColorStop(0, `rgba(40,24,40,${a})`); gr.addColorStop(0.35, `rgba(40,24,40,${a * 0.4})`); gr.addColorStop(1, 'rgba(40,24,40,0)');
    poly(ctx, pts); ctx.fillStyle = gr; ctx.fill();
  };
  // along the right wall (gy = -m), fading toward +gy
  band([iso(-m, -m), iso(cols + m, -m), iso(cols + m, -m + w), iso(-m, -m + w)], iso(0, -m), iso(0, -m + w));
  // along the left wall (gx = -m), fading toward +gx
  band([iso(-m, -m), iso(-m + w, -m), iso(-m + w, rows + m), iso(-m, rows + m)], iso(-m, 0), iso(-m + w, 0));
  // deeper pocket in the back corner
  const c = iso(-m, -m), rr = 70 * g.s;
  const cg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rr);
  cg.addColorStop(0, `rgba(40,24,40,${a * 0.8})`); cg.addColorStop(1, 'rgba(40,24,40,0)');
  ctx.save(); poly(ctx, [iso(-m, -m), iso(-m + 1.2, -m), iso(-m + 1.2, -m + 1.2), iso(-m, -m + 1.2)]); ctx.clip();
  ctx.fillStyle = cg; ctx.fillRect(c.x - rr, c.y - rr, rr * 2, rr * 2); ctx.restore();
}

/** Small toys on the back trim. Each footprint is a box (gx/gy extents) that stays ≥0.06 tiles from the wall and
 *  ≥0.04 tiles from the playable tiles, drawn back-to-front with contact shadows. */
function trimProps(ctx: Ctx, cols: number, rows: number, iso: IsoFn, g: G, N: number, ink: string) {
  const m = g.m, k = g.s;
  /** iso box with gx∈[x0,x1], gy∈[y0,y1], height h (TH units), soft AO + ink outline. */
  const box = (x0: number, y0: number, x1: number, y1: number, h: number, col: string, letter?: string) => {
    const base = N ? mix(hex(col), [40, 40, 80], 0.5) : hex(col);
    // contact shadow
    ctx.save();
    poly(ctx, [iso(x0 - 0.03, y0 - 0.03), iso(x1 + 0.06, y0 - 0.03), iso(x1 + 0.06, y1 + 0.06), iso(x0 - 0.03, y1 + 0.06)]);
    ctx.fillStyle = N ? 'rgba(0,0,10,0.4)' : 'rgba(60,30,20,0.22)'; ctx.fill();
    ctx.restore();
    const top = [iso(x0, y0, h), iso(x1, y0, h), iso(x1, y1, h), iso(x0, y1, h)];
    const fl = [iso(x0, y1, h), iso(x1, y1, h), iso(x1, y1, 0), iso(x0, y1, 0)]; // +gy face (lower-left on screen)
    const fr = [iso(x1, y0, h), iso(x1, y1, h), iso(x1, y1, 0), iso(x1, y0, 0)]; // +gx face (lower-right)
    poly(ctx, fl); ctx.fillStyle = rgba(mix(base, [20, 16, 30], 0.12)); ctx.fill();
    poly(ctx, fr); ctx.fillStyle = rgba(mix(base, [20, 16, 30], 0.3)); ctx.fill();
    poly(ctx, top); const tg = ctx.createLinearGradient(top[0].x, top[0].y, top[2].x, top[2].y);
    tg.addColorStop(0, rgba(mix(base, [255, 255, 255], 0.35))); tg.addColorStop(1, rgba(base)); ctx.fillStyle = tg; ctx.fill();
    if (letter) {
      const c = iso((x0 + x1) / 2, y1, h / 2);
      ctx.save(); ctx.translate(c.x, c.y); ctx.transform(1, -0.5, 0, 1, 0, 0);
      ctx.font = `700 ${7 * k}px Quicksand, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(letter, 0, 0.5 * k); ctx.restore();
    }
    ctx.lineJoin = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = 1.6 * k;
    poly(ctx, [top[0], top[1], fr[3], fr[2], fl[3], top[3]]); ctx.stroke();
    ctx.lineWidth = 1 * k; ctx.beginPath(); ctx.moveTo(top[2].x, top[2].y); ctx.lineTo(fr[2].x, fr[2].y);
    ctx.moveTo(top[3].x, top[3].y); ctx.lineTo(top[2].x, top[2].y); ctx.lineTo(top[1].x, top[1].y); ctx.stroke();
  };
  // trim band runs gx∈[-m, 0) on the left, gy∈[-m, 0) on the right. Keep props inside [-m+0.06, -0.04].
  const lo = -m + 0.07, hi = -0.05, sz = hi - lo; // ≈0.3 tiles
  // toy blocks on the left trim (under the free sign span, well before the door)
  const by = Math.min(rows * 0.45, rows - 2.2);
  box(lo, by, lo + sz * 0.62, by + sz * 0.62, 0.36, PALETTE.red, 'A');
  box(lo, by + sz * 0.75, lo + sz * 0.62, by + sz * 1.37, 0.36, '#7fc8f8', 'B');
  // stacked block on top
  const sb = (x0: number, y0: number, s0: number, h0: number, h1: number, col: string, l: string) => {
    const lift: IsoFn = (gx, gy, gz = 0) => iso(gx, gy, gz + h0);
    const top = [lift(x0, y0, h1), lift(x0 + s0, y0, h1), lift(x0 + s0, y0 + s0, h1), lift(x0, y0 + s0, h1)];
    const fl = [lift(x0, y0 + s0, h1), lift(x0 + s0, y0 + s0, h1), lift(x0 + s0, y0 + s0, 0), lift(x0, y0 + s0, 0)];
    const fr = [lift(x0 + s0, y0, h1), lift(x0 + s0, y0 + s0, h1), lift(x0 + s0, y0 + s0, 0), lift(x0 + s0, y0, 0)];
    const base = N ? mix(hex(col), [40, 40, 80], 0.5) : hex(col);
    poly(ctx, fl); ctx.fillStyle = rgba(mix(base, [20, 16, 30], 0.12)); ctx.fill();
    poly(ctx, fr); ctx.fillStyle = rgba(mix(base, [20, 16, 30], 0.3)); ctx.fill();
    poly(ctx, top); ctx.fillStyle = rgba(mix(base, [255, 255, 255], 0.3)); ctx.fill();
    const c = lift(x0 + s0 / 2, y0 + s0, h1 / 2);
    ctx.save(); ctx.translate(c.x, c.y); ctx.transform(1, -0.5, 0, 1, 0, 0);
    ctx.font = `700 ${7 * k}px Quicksand, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(l, 0, 0.5 * k); ctx.restore();
    ctx.lineJoin = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = 1.6 * k;
    poly(ctx, [top[0], top[1], fr[3], fr[2], fl[3], top[3]]); ctx.stroke();
    ctx.lineWidth = 1 * k; ctx.beginPath(); ctx.moveTo(top[3].x, top[3].y); ctx.lineTo(top[2].x, top[2].y); ctx.lineTo(top[1].x, top[1].y);
    ctx.moveTo(top[2].x, top[2].y); ctx.lineTo(fr[2].x, fr[2].y); ctx.stroke();
  };
  sb(lo + 0.02, by + sz * 0.3, sz * 0.58, 0.36, 0.34, PALETTE.sunny, 'C');
  // ball on the right trim (left of the window, under the free sign span)
  const bx = Math.min(2.0, cols * 0.33), bz = (lo + hi) / 2;
  const bp = iso(bx, bz), br = 6.8 * k;
  groundShadowIso(ctx, bp.x, bp.y, br * 1.25, N);
  const bc = { x: bp.x, y: bp.y - br };
  const ballG = ctx.createRadialGradient(bc.x - br * 0.4, bc.y - br * 0.45, br * 0.1, bc.x, bc.y, br * 1.05);
  ballG.addColorStop(0, N ? '#b496d6' : '#ffd0de'); ballG.addColorStop(0.5, N ? '#7a5aa0' : '#ff8fb1'); ballG.addColorStop(1, N ? '#4a3468' : '#d9577f');
  circle(ctx, bc.x, bc.y, br); ctx.fillStyle = ballG; ctx.fill();
  ctx.save(); circle(ctx, bc.x, bc.y, br); ctx.clip();
  ctx.fillStyle = N ? 'rgba(255,224,138,0.8)' : '#fff1dc';
  ctx.beginPath(); ctx.ellipse(bc.x, bc.y, br * 0.38, br * 1.1, 0.5, 0, TAU); ctx.fill();
  ctx.restore();
  circle(ctx, bc.x, bc.y, br); ctx.lineWidth = 1.7 * k; ctx.strokeStyle = ink; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ellipse(ctx, bc.x - br * 0.4, bc.y - br * 0.45, br * 0.22, br * 0.14, -0.6); ctx.fill();
}
function groundShadowIso(ctx: Ctx, x: number, y: number, r: number, N: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5);
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, N ? 'rgba(0,0,10,0.5)' : 'rgba(60,30,20,0.32)'); gr.addColorStop(1, 'rgba(60,30,20,0)');
  ctx.fillStyle = gr; circle(ctx, 0, 0, r); ctx.fill(); ctx.restore();
}

function rightWallProps(ctx: Ctx, g: G, N: number, ink: string) {
  // window
  const w = windowRect(g);
  const { u0, v0 } = w;
  const top = v0 + w.h;
  const arch = (inset: number) => {
    ctx.beginPath();
    ctx.moveTo(u0 + inset, v0 + inset);
    ctx.lineTo(u0 + w.w - inset, v0 + inset);
    ctx.lineTo(u0 + w.w - inset, top - w.w / 2);
    ctx.ellipse(u0 + w.w / 2, top - w.w / 2, w.w / 2 - inset, w.w / 2 * 0.7 - inset * 0.7, 0, 0, Math.PI);
    ctx.closePath();
  };
  // frame
  arch(-0.09); ctx.fillStyle = N ? '#6b6fa0' : '#fffdf8'; ctx.fill(); ctx.lineWidth = LW(2.5); ctx.strokeStyle = ink; ctx.stroke();
  // sky
  arch(0.03);
  const sky = ctx.createLinearGradient(0, top, 0, v0);
  if (N) { sky.addColorStop(0, '#0f0f22'); sky.addColorStop(1, '#2d2a5a'); }
  else { sky.addColorStop(0, '#9fd3ef'); sky.addColorStop(1, '#fbe9cf'); }
  ctx.fillStyle = sky; ctx.fill();
  ctx.save();
  arch(0.03); ctx.clip();
  if (N) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 26; i++) circle(ctx, u0 + hash(i * 2.3) * w.w, v0 + hash(i * 4.1) * w.h, 0.012 + hash(i) * 0.012), ctx.fill();
    // crescent moon
    const mu = u0 + w.w * 0.68, mv = v0 + w.h * 0.68, r = 0.22;
    ctx.beginPath(); ctx.arc(mu, mv, r, 0, TAU); ctx.arc(mu + 0.1, mv + 0.06, r * 0.85, 0, TAU, true);
    ctx.fillStyle = '#fff1c4'; ctx.fill('evenodd');
    ctx.fillStyle = 'rgba(255,240,200,0.12)'; circle(ctx, mu, mv, 0.5); ctx.fill();
  } else {
    // sun + cloud
    ctx.fillStyle = '#ffd36b'; circle(ctx, u0 + w.w * 0.72, v0 + w.h * 0.72, 0.2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (const [du, dv, r] of [[0.25, 0.35, 0.16], [0.42, 0.42, 0.2], [0.6, 0.34, 0.14]]) { circle(ctx, u0 + w.w * du, v0 + w.h * dv, r); ctx.fill(); }
  }
  // distant hills
  ctx.fillStyle = N ? '#262650' : '#bfe0b0';
  ctx.beginPath(); ctx.moveTo(u0, v0);
  for (let i = 0; i <= 10; i++) ctx.lineTo(u0 + (i / 10) * w.w, v0 + 0.18 + Math.sin(i * 1.3) * 0.07);
  ctx.lineTo(u0 + w.w, v0); ctx.closePath(); ctx.fill();
  ctx.restore();
  // mullions
  ctx.strokeStyle = N ? '#6b6fa0' : '#fffdf8'; ctx.lineWidth = LW(5);
  ctx.beginPath(); ctx.moveTo(u0 + w.w / 2, v0); ctx.lineTo(u0 + w.w / 2, top); ctx.moveTo(u0, v0 + w.h * 0.5); ctx.lineTo(u0 + w.w, v0 + w.h * 0.5); ctx.stroke();
  ctx.strokeStyle = ink; ctx.lineWidth = LW(1.2);
  ctx.beginPath(); ctx.moveTo(u0 + w.w / 2, v0); ctx.lineTo(u0 + w.w / 2, top); ctx.stroke();
  arch(0.03); ctx.lineWidth = LW(2); ctx.stroke();
  // sill
  ctx.fillStyle = N ? '#5a5d86' : '#f2e2c4';
  ctx.fillRect(u0 - 0.18, v0 - 0.12, w.w + 0.36, 0.12);
  ctx.lineWidth = LW(2); ctx.strokeRect(u0 - 0.18, v0 - 0.12, w.w + 0.36, 0.12);
  // curtains (tied back)
  for (const side of [-1, 1]) {
    const cu = side < 0 ? u0 - 0.12 : u0 + w.w + 0.12;
    ctx.beginPath();
    ctx.moveTo(cu, top + 0.12);
    ctx.lineTo(cu - side * 0.42, top + 0.12);
    ctx.quadraticCurveTo(cu - side * 0.12, v0 + 0.6, cu - side * 0.3, v0 - 0.05);
    ctx.lineTo(cu + side * 0.05, v0 - 0.05);
    ctx.quadraticCurveTo(cu + side * 0.08, v0 + 0.55, cu, top + 0.12);
    ctx.closePath();
    ctx.fillStyle = N ? '#7a4a78' : '#f7a8b8'; ctx.fill();
    ctx.lineWidth = LW(2); ctx.strokeStyle = ink; ctx.stroke();
    ctx.fillStyle = N ? '#b07ab0' : '#fff1dc';
    circle(ctx, cu - side * 0.12, v0 + 0.5, 0.06); ctx.fill(); ctx.stroke();
  }
  // curtain rod
  ctx.lineWidth = LW(3); ctx.strokeStyle = ink;
  ctx.beginPath(); ctx.moveTo(u0 - 0.6, top + 0.14); ctx.lineTo(u0 + w.w + 0.6, top + 0.14); ctx.stroke();

  // clock
  const c = clockPos(g);
  circle(ctx, c.u, c.v, 0.34); ctx.fillStyle = N ? '#e98a5a' : PALETTE.red; ctx.fill(); ctx.lineWidth = LW(2.5); ctx.stroke();
  circle(ctx, c.u, c.v, 0.27); ctx.fillStyle = N ? '#3a3d6a' : '#fffdf8'; ctx.fill(); ctx.lineWidth = LW(1.5); ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, r0 = i % 3 ? 0.22 : 0.19;
    ctx.beginPath(); ctx.moveTo(c.u + Math.sin(a) * r0, c.v + Math.cos(a) * r0); ctx.lineTo(c.u + Math.sin(a) * 0.245, c.v + Math.cos(a) * 0.245);
    ctx.strokeStyle = N ? '#c9c5ff' : INK; ctx.lineWidth = LW(1.3); ctx.stroke();
  }
  // bells on top
  ctx.strokeStyle = ink; ctx.lineWidth = LW(2);
  for (const d of [-1, 1]) { circle(ctx, c.u + d * 0.2, c.v + 0.34, 0.09); ctx.fillStyle = N ? '#c9a24a' : PALETTE.sunny; ctx.fill(); ctx.stroke(); }

}

function leftWallProps(ctx: Ctx, g: G, N: number, ink: string) {
  // door
  const d = doorRect(g);
  if (d.u0 > 0.3) {
    const u0 = d.u0;
    ctx.beginPath();
    ctx.moveTo(u0 - 0.08, 0); ctx.lineTo(u0 - 0.08, d.h - 0.3);
    ctx.quadraticCurveTo(u0 - 0.08, d.h + 0.08, u0 + d.w / 2, d.h + 0.08);
    ctx.quadraticCurveTo(u0 + d.w + 0.08, d.h + 0.08, u0 + d.w + 0.08, d.h - 0.3);
    ctx.lineTo(u0 + d.w + 0.08, 0); ctx.closePath();
    ctx.fillStyle = N ? '#5a5d86' : '#fffaf0'; ctx.fill(); ctx.lineWidth = LW(2.5); ctx.strokeStyle = ink; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(u0, 0); ctx.lineTo(u0, d.h - 0.3);
    ctx.quadraticCurveTo(u0, d.h, u0 + d.w / 2, d.h);
    ctx.quadraticCurveTo(u0 + d.w, d.h, u0 + d.w, d.h - 0.3);
    ctx.lineTo(u0 + d.w, 0); ctx.closePath();
    ctx.fillStyle = N ? '#4b3f6e' : '#9fd8d0'; ctx.fill(); ctx.stroke();
    // panels
    ctx.lineWidth = LW(1.5); ctx.strokeStyle = rgba(N ? [10, 10, 30] : [40, 90, 80], 0.5);
    ctx.strokeRect(u0 + 0.14, 0.2, d.w - 0.28, 0.65);
    ctx.strokeRect(u0 + 0.14, 1.0, d.w - 0.28, 0.6);
    // knob
    circle(ctx, u0 + 0.16, 0.95, 0.06); ctx.fillStyle = N ? '#c9a24a' : PALETTE.sunny; ctx.fill(); ctx.lineWidth = LW(1.6); ctx.strokeStyle = ink; ctx.stroke();
    // little hanging moon tag
    ctx.beginPath(); ctx.arc(u0 + d.w / 2, 1.62, 0.13, 0, TAU); ctx.arc(u0 + d.w / 2 + 0.06, 1.66, 0.11, 0, TAU, true);
    ctx.fillStyle = N ? '#ffe08a' : '#ffd36b'; ctx.fill('evenodd');
    // light leaking under the door at night
    if (N) { ctx.fillStyle = 'rgba(255,214,120,0.6)'; ctx.fillRect(u0 + 0.05, 0, d.w - 0.1, 0.04); }
  }
  // shelves with toys
  const s0 = SHELF.u0, s1 = SHELF.u1;
  for (const v of [1.15, 1.75]) {
    ctx.fillStyle = N ? '#5a4a7a' : '#d9a066';
    ctx.fillRect(s0, v - 0.08, s1 - s0, 0.08);
    ctx.lineWidth = LW(2); ctx.strokeStyle = ink; ctx.strokeRect(s0, v - 0.08, s1 - s0, 0.08);
    // brackets
    for (const u of [s0 + 0.15, s1 - 0.15]) { ctx.beginPath(); ctx.moveTo(u, v - 0.08); ctx.lineTo(u, v - 0.22); ctx.lineTo(u + 0.1, v - 0.08); ctx.stroke(); }
  }
  const toyCol = (c: string) => (N ? rgba(mix(hex(c), [40, 40, 80], 0.5)) : c);
  // lower shelf: blocks, books
  let u = s0 + 0.1;
  for (const [c, h] of [[PALETTE.red, 0.3], [PALETTE.mint, 0.36], ['#7fc8f8', 0.28], [PALETTE.sunny, 0.33]] as const) {
    ctx.fillStyle = toyCol(c); ctx.fillRect(u, 1.15, 0.1, h); ctx.lineWidth = LW(1.5); ctx.strokeRect(u, 1.15, 0.1, h); u += 0.11;
  }
  u += 0.08;
  for (const [c, du, dv] of [[PALETTE.moony, 0, 0], [PALETTE.sunny, 0.22, 0], [PALETTE.red, 0.11, 0.2]] as const) {
    if (u + du + 0.2 > s1) break;
    ctx.fillStyle = toyCol(c); ctx.fillRect(u + du, 1.15 + dv, 0.2, 0.2); ctx.lineWidth = LW(1.6); ctx.strokeRect(u + du, 1.15 + dv, 0.2, 0.2);
  }
  // upper shelf: teddy + ducky
  const tu = s0 + 0.35;
  ctx.fillStyle = N ? '#7a6250' : '#c9935f'; ctx.lineWidth = LW(1.8);
  ellipse(ctx, tu, 1.92, 0.17, 0.17); ctx.fill(); ctx.stroke();
  circle(ctx, tu, 2.17, 0.13); ctx.fill(); ctx.stroke();
  for (const d2 of [-1, 1]) { circle(ctx, tu + d2 * 0.11, 2.28, 0.05); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = ink; circle(ctx, tu - 0.05, 2.18, 0.018); ctx.fill(); circle(ctx, tu + 0.05, 2.18, 0.018); ctx.fill();
  if (s1 - s0 > 0.9) {
    const du = s0 + 0.8;
    ctx.fillStyle = toyCol('#ffe066');
    ellipse(ctx, du, 1.86, 0.16, 0.1); ctx.fill(); ctx.stroke();
    circle(ctx, du + 0.1, 2.0, 0.08); ctx.fill(); ctx.stroke();
    ctx.fillStyle = toyCol('#ff9a3c'); ctx.beginPath(); ctx.moveTo(du + 0.16, 2.0); ctx.lineTo(du + 0.26, 1.98); ctx.lineTo(du + 0.16, 1.95); ctx.fill();
  }
  // plug-in nightlight (a little sleeping star)
  const nl = nightlightPos(g);
  ctx.fillStyle = N ? '#5a5d86' : '#fffdf8';
  ctx.fillRect(nl.u - 0.08, nl.v - 0.1, 0.16, 0.2); ctx.lineWidth = LW(1.6); ctx.strokeStyle = ink; ctx.strokeRect(nl.u - 0.08, nl.v - 0.1, 0.16, 0.2);
  starPath(ctx, nl.u, nl.v + 0.14, 0.17, Math.PI, 0.5);
  ctx.fillStyle = N ? '#ffe08a' : '#ffd36b'; ctx.fill(); ctx.lineWidth = LW(1.8); ctx.stroke();
}

function bunting(ctx: Ctx, iso: IsoFn, g: G, N: number, ink: string) {
  const cols = [PALETTE.sunny, PALETTE.moony, '#f7a8b8', PALETTE.mint, '#7fc8f8'];
  const run = (side: 'L' | 'R', L: number) => {
    ctx.save();
    onWall(ctx, iso, g, side);
    const v0 = g.H - 0.16, sag = 0.12;
    const at = (u: number) => v0 - sag * Math.sin((u / L) * Math.PI);
    ctx.lineWidth = LW(1.4); ctx.strokeStyle = ink;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const u = 0.05 + (i / 24) * (L - 0.1); i ? ctx.lineTo(u, at(u)) : ctx.moveTo(u, at(u)); }
    ctx.stroke();
    let i = side === 'L' ? 2 : 0;
    for (let u = 0.3; u < L - 0.15; u += 0.38, i++) {
      const v = at(u), c = cols[i % cols.length];
      ctx.beginPath(); ctx.moveTo(u - 0.12, v); ctx.lineTo(u + 0.12, v); ctx.lineTo(u, v - 0.26); ctx.closePath();
      ctx.fillStyle = N ? rgba(mix(hex(c), [40, 40, 80], 0.45)) : c; ctx.fill();
      ctx.lineWidth = LW(1.4); ctx.stroke();
    }
    ctx.restore();
  };
  run('L', g.Ll);
  run('R', g.Lr);
}

// ═════════════════════════════ WALL SIGNS (v0.3) ═════════════════════════════
const wsLayout = new Map<string, { lines: string[]; font: number; tw: number }>();
function signLayout(ctx: Ctx, text: string, s: number) {
  const key = text + '|' + s.toFixed(3);
  let L = wsLayout.get(key);
  if (L) return L;
  const maxW = 84 * s;
  let font = 11 * s;
  ctx.font = `700 ${font}px Quicksand, sans-serif`;
  let lines = [text];
  if (ctx.measureText(text).width > maxW && text.includes(' ')) {
    // split at the space nearest the middle
    let best = -1, bd = 1e9;
    // break cost: distance from the middle, plus a penalty for starting a line with a lone symbol ("= WAKING")
    const cost = (i: number) => Math.abs(i - text.length / 2) + (/^\S(\s|$)/.test(text.slice(i + 1)) ? 100 : 0);
    for (let i = 0; i < text.length; i++) if (text[i] === ' ' && cost(i) < bd) { bd = cost(i); best = i; }
    lines = [text.slice(0, best), text.slice(best + 1)];
  }
  let tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (tw > maxW) { font = Math.max(8 * s, font * maxW / tw); ctx.font = `700 ${font}px Quicksand, sans-serif`; tw = Math.max(...lines.map((l) => ctx.measureText(l).width)); }
  L = { lines, font, tw };
  wsLayout.set(key, L);
  return L;
}
const SIGN_STYLES = [
  { frame: ['#e9c08a', '#b9844e'], paper: '#fffaf0', accent: '#f7a8b8' },
  { frame: ['#a6e3cf', '#5fae95'], paper: '#fffdf6', accent: '#ffd36b' },
  { frame: ['#f7b9c6', '#d47a90'], paper: '#fffaf3', accent: '#9fd8d0' },
];

/** A framed poster mounted FLAT on a back wall. Anchor (x, y) = centre of the sign on the wall surface.
 *  'right' = the wall along +gx (text runs down-right), 'left' = the wall along +gy (text runs up-right, read from the front).
 *  Text wraps to 2 lines and shrinks so the sign is ≤ ~106·s px wide (≤ 2.2 tiles along a wall) and ≤ ~44·s tall. */
export function drawWallSign(ctx: Ctx, x: number, y: number, s: number, text: string, wall: 'left' | 'right', t: number, shake = 0) {
  ctx.save();
  const L = signLayout(ctx, text, s);
  const lh = L.font * 1.18;
  const w = L.tw + 22 * s, h = L.lines.length * lh + 15 * s;
  const k = wall === 'right' ? 0.5 : -0.5;
  // wall normal on screen (points into the room): right wall faces +gy (down-left), left wall faces +gx (down-right)
  const nx = wall === 'right' ? -0.89 : 0.89, ny = 0.45;
  const sh = clamp(shake);
  const hsh = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const st = SIGN_STYLES[hsh % SIGN_STYLES.length];
  ctx.translate(x, y);
  ctx.transform(1, k, 0, 1, 0, 0); // local x runs along the wall, local y is straight down the wall
  if (sh > 0) {
    ctx.translate(0, -h / 2);
    ctx.rotate(Math.sin(t * 38) * 0.1 * sh);
    ctx.translate(Math.sin(t * 47) * 2 * s * sh, h / 2);
  }
  // screen offset (dx, dy) → local (dx, dy − k·dx)
  const off = (d: number) => ({ x: nx * d, y: ny * d - k * nx * d });
  // soft drop shadow on the wall (down + away from the light)
  ctx.fillStyle = 'rgba(40,24,40,0.09)';
  for (const g of [3.5, 2, 0.8]) { roundRect(ctx, -w / 2 + 2 * s - g * s, -h / 2 + 4 * s - g * s, w + 2 * g * s, h + 2 * g * s, (5 + g) * s); ctx.fill(); }
  // frame thickness (edge toward the viewer)
  const e = off(3.2 * s);
  roundRect(ctx, -w / 2 + e.x, -h / 2 + e.y, w, h, 5 * s);
  ctx.fillStyle = st.frame[1]; ctx.fill();
  ctx.lineWidth = 2 * s; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  // frame face
  roundRect(ctx, -w / 2, -h / 2, w, h, 5 * s);
  const fg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  fg.addColorStop(0, rgba(mix(hex(st.frame[0]), [255, 255, 255], 0.25))); fg.addColorStop(0.5, st.frame[0]); fg.addColorStop(1, st.frame[1]);
  ctx.fillStyle = fg; ctx.fill();
  // wood grain on the frame
  ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(120,70,30,0.18)'; ctx.lineWidth = 0.8 * s;
  for (let i = 0; i < 4; i++) { const gy = -h / 2 + 2 * s + i * 1.6 * s; ctx.beginPath(); ctx.moveTo(-w / 2, gy); ctx.bezierCurveTo(-w / 4, gy - 1 * s, w / 4, gy + 1 * s, w / 2, gy); ctx.stroke(); }
  ctx.restore();
  roundRect(ctx, -w / 2, -h / 2, w, h, 5 * s);
  ctx.lineWidth = 2.5 * s; ctx.strokeStyle = INK; ctx.stroke();
  // paper inset (recessed: inner shadow along top/left)
  const ins = 4.5 * s;
  roundRect(ctx, -w / 2 + ins, -h / 2 + ins, w - 2 * ins, h - 2 * ins, 2.5 * s);
  ctx.fillStyle = st.paper; ctx.fill();
  ctx.save(); ctx.clip();
  const ig = ctx.createLinearGradient(0, -h / 2 + ins, 0, -h / 2 + ins + 5 * s);
  ig.addColorStop(0, 'rgba(60,40,30,0.22)'); ig.addColorStop(1, 'rgba(60,40,30,0)');
  ctx.fillStyle = ig; ctx.fillRect(-w / 2, -h / 2, w, 10 * s);
  // tiny corner doodles
  ctx.fillStyle = st.accent;
  starPath(ctx, w / 2 - ins - 4.5 * s, -h / 2 + ins + 4.5 * s, 3 * s, 0, 0.5); ctx.fill();
  circle(ctx, -w / 2 + ins + 3.5 * s, h / 2 - ins - 3.5 * s, 1.6 * s); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.2 * s; ctx.strokeStyle = 'rgba(14,14,14,0.55)';
  roundRect(ctx, -w / 2 + ins, -h / 2 + ins, w - 2 * ins, h - 2 * ins, 2.5 * s); ctx.stroke();
  // text (sheared with the wall)
  ctx.fillStyle = INK;
  ctx.font = `700 ${L.font}px Quicksand, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const y0 = -((L.lines.length - 1) * lh) / 2 + 0.6 * s;
  L.lines.forEach((ln, i) => ctx.fillText(ln, 0, y0 + i * lh));
  // glass sheen
  ctx.save();
  roundRect(ctx, -w / 2 + ins, -h / 2 + ins, w - 2 * ins, h - 2 * ins, 2.5 * s); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.moveTo(-w / 2 + w * 0.15, -h / 2); ctx.lineTo(-w / 2 + w * 0.3, -h / 2); ctx.lineTo(-w / 2 + w * 0.12, h / 2); ctx.lineTo(-w / 2 - w * 0.03, h / 2); ctx.closePath(); ctx.fill();
  ctx.restore();
  // night: tint the whole sign toward the room's moonlit blue (keeps the text readable)
  const nn = sceneState.night;
  if (nn > 0.01) {
    ctx.fillStyle = `rgba(28,26,70,${0.42 * nn})`;
    roundRect(ctx, -w / 2 + e.x, -h / 2 + e.y, w, h, 5 * s); ctx.fill();
    roundRect(ctx, -w / 2, -h / 2, w, h, 5 * s); ctx.fill();
  }
  // brass pin
  circle(ctx, 0, -h / 2 + 2.2 * s, 1.8 * s); ctx.fillStyle = '#d8b25a'; ctx.fill(); ctx.lineWidth = 1 * s; ctx.strokeStyle = INK; ctx.stroke();
  if (sh > 0.3) {
    ctx.strokeStyle = PALETTE.red; ctx.lineWidth = 2 * s; ctx.globalAlpha = sh; ctx.lineCap = 'round';
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * (w / 2 + 4 * s), -h / 2 + 4 * s); ctx.lineTo(sd * (w / 2 + 9 * s), -h / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sd * (w / 2 + 4 * s), h / 2 - 4 * s); ctx.lineTo(sd * (w / 2 + 9 * s), h / 2); ctx.stroke();
    }
  }
  ctx.restore();
}
