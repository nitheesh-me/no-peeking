// Qubble: the gummy dreaming blob. Its colour IS its Bloch vector (see docs/ART_NOTES.md).
import { PALETTE, type QubbleVisual } from '../core/contracts';
import {
  type Ctx, type RGB, TAU, INK, LINE, hex, mix, rgba, lighten, darken, desat, hsl, clamp, ellipse, circle,
  inkStroke, groundShadow, zzz, nameTag, blush, starPath, hash, sceneState,
} from './util';

const SUNNY = hex(PALETTE.sunny);
const MOONY = hex(PALETTE.moony);
const MIST: RGB = [196, 192, 214];

/** Body half-width / height at s=1. */
export const QW = 21, QH = 38;

// ── blanket pattern (cozy quilt) ─────────────────────────────────────────────
let quiltTile: HTMLCanvasElement | null = null;
function quilt(): HTMLCanvasElement {
  if (quiltTile) return quiltTile;
  const c = document.createElement('canvas');
  const N = 32;
  c.width = c.height = N * 2;
  const g = c.getContext('2d')!;
  const cols = ['#f5a3b5', '#fff1dc', '#9fd8d0', '#fff1dc'];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = cols[(i + j * 2) % 4];
    g.fillRect(i * N, j * N, N, N);
  }
  // little motifs: hearts on pink, dots on teal
  g.fillStyle = '#e5728c';
  for (const [cx, cy] of [[16, 16]]) {
    g.beginPath();
    g.moveTo(cx, cy + 6);
    g.bezierCurveTo(cx - 9, cy - 1, cx - 4, cy - 8, cx, cy - 3);
    g.bezierCurveTo(cx + 4, cy - 8, cx + 9, cy - 1, cx, cy + 6);
    g.fill();
  }
  g.fillStyle = '#5fb3a8';
  for (const [cx, cy] of [[N + 8, N + 8], [N + 24, N + 8], [N + 8, N + 24], [N + 24, N + 24], [N + 16, N + 16]]) {
    g.beginPath(); g.arc(cx, cy, 2.6, 0, TAU); g.fill();
  }
  g.fillStyle = '#f2c9a0';
  for (const [cx, cy] of [[N + 16, 16], [16, N + 16]]) {
    g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.fill();
  }
  // fabric weave
  g.lineWidth = 0.6;
  for (let k = 0; k < 2 * N; k += 2) {
    g.strokeStyle = 'rgba(90,50,60,0.08)'; g.beginPath(); g.moveTo(k + 0.5, 0); g.lineTo(k + 0.5, 2 * N); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(0, k + 1.5); g.lineTo(2 * N, k + 1.5); g.stroke();
  }
  // stitching
  g.strokeStyle = 'rgba(120,70,80,0.55)';
  g.setLineDash([4, 3]);
  g.lineWidth = 1.6;
  for (let k = 0; k <= 2; k++) {
    g.beginPath(); g.moveTo(k * N + 2, 0); g.lineTo(k * N + 2, 2 * N); g.stroke();
    g.beginPath(); g.moveTo(0, k * N + 2); g.lineTo(2 * N, k * N + 2); g.stroke();
  }
  quiltTile = c;
  return c;
}
const patCache = new WeakMap<Ctx, CanvasPattern>();
function quiltPattern(ctx: Ctx): CanvasPattern | null {
  let p = patCache.get(ctx);
  if (!p) {
    p = ctx.createPattern(quilt(), 'repeat') ?? undefined;
    if (p) patCache.set(ctx, p);
  }
  return p ?? null;
}

// ── shapes ───────────────────────────────────────────────────────────────────
/** Gumdrop body path in local space (origin = ground centre). */
function bodyPath(ctx: Ctx, w: number, h: number, wob: number) {
  const t = wob;
  ctx.beginPath();
  ctx.moveTo(-w * 0.86, 0);
  ctx.bezierCurveTo(-w * 1.08, -h * 0.04, -w * (1.06 + t), -h * 0.6, -w * 0.62, -h * 0.9);
  ctx.bezierCurveTo(-w * 0.32, -h * (1.07 + t * 0.5), w * 0.32, -h * (1.07 - t * 0.5), w * 0.62, -h * 0.9);
  ctx.bezierCurveTo(w * (1.06 - t), -h * 0.6, w * 1.08, -h * 0.04, w * 0.86, 0);
  ctx.quadraticCurveTo(0, h * 0.09, -w * 0.86, 0);
  ctx.closePath();
}
function blanketPath(ctx: Ctx, w: number, h: number, t: number) {
  const W = w * 1.12, H = h * 1.12;
  ctx.beginPath();
  ctx.moveTo(-W * 1.18, h * 0.06);
  ctx.bezierCurveTo(-W * 1.2, -H * 0.12, -W * 0.98, -H * 0.66, -W * 0.6, -H * 0.9);
  ctx.bezierCurveTo(-W * 0.28, -H * 1.06, W * 0.28, -H * 1.06, W * 0.6, -H * 0.9);
  ctx.bezierCurveTo(W * 0.98, -H * 0.66, W * 1.2, -H * 0.12, W * 1.18, h * 0.06);
  // scalloped hem
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x0 = W * 1.18 - (i * 2 * W * 1.18) / n;
    const x1 = W * 1.18 - ((i + 1) * 2 * W * 1.18) / n;
    const dip = h * (0.16 + 0.03 * Math.sin(t * 2 + i));
    ctx.quadraticCurveTo((x0 + x1) / 2, h * 0.06 + dip, x1, h * 0.06);
  }
  ctx.closePath();
}

// ── faces ────────────────────────────────────────────────────────────────────
type FaceState = QubbleVisual['state'];
export function drawFace(ctx: Ctx, state: FaceState, s: number, t: number, cx: number, cy: number, gap: number, ink = INK) {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.1 * s;
  const ex = gap * s, er = 3.6 * s;
  const L = cx - ex, R = cx + ex;
  switch (state) {
    case 'sleep': {
      for (const x of [L, R]) { ctx.beginPath(); ctx.arc(x, cy - er * 0.4, er, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
      const m = 1.4 + 0.7 * (0.5 + 0.5 * Math.sin(t * 1.6));
      ellipse(ctx, cx, cy + 5.5 * s, m * s, m * 1.15 * s); ctx.fill();
      blush(ctx, cx, cy + 3.5 * s, s, ex + 3.5 * s, 0.5);
      break;
    }
    case 'mumble': {
      // squeezed-shut eyes + wobbly squiggle mouth
      for (const [x, d] of [[L, 1], [R, -1]] as const) {
        ctx.beginPath(); ctx.moveTo(x - 3 * s * d, cy - 1.5 * s); ctx.lineTo(x + 2.5 * s * d, cy); ctx.lineTo(x - 3 * s * d, cy + 0.8 * s); ctx.stroke();
      }
      ctx.lineWidth = 1.7 * s;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) { const px = cx - 4 * s + i * s, py = cy + 6 * s + Math.sin(i * 1.6 + t * 6) * 1.1 * s; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
      blush(ctx, cx, cy + 3.5 * s, s, ex + 3.5 * s, 0.6);
      break;
    }
    case 'awake-grumpy': {
      for (const [x, d] of [[L, 1], [R, -1]] as const) {
        ctx.beginPath(); ctx.ellipse(x, cy + 0.5 * s, 2.6 * s, 2.9 * s, 0, 0, Math.PI); ctx.fill(); // lower half eye (heavy lid)
        ctx.beginPath(); ctx.moveTo(x - 3.6 * s, cy - 0.3 * s); ctx.lineTo(x + 3.6 * s, cy - 0.3 * s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 4 * s * d, cy - 6.5 * s); ctx.lineTo(x + 3 * s * d, cy - 3.6 * s); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(cx - 4 * s, cy + 7 * s);
      ctx.quadraticCurveTo(cx - 2 * s, cy + 4.6 * s, cx, cy + 6.2 * s);
      ctx.quadraticCurveTo(cx + 2 * s, cy + 4.6 * s, cx + 4 * s, cy + 7 * s); ctx.stroke();
      // grumpy steam puff
      const p = (t * 0.8) % 1;
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      circle(ctx, cx + 14 * s + p * 6 * s, cy - 14 * s - p * 10 * s, (2 + p * 3) * s); ctx.fill();
      inkStroke(ctx, s, 1.2);
      break;
    }
    case 'happy': {
      for (const x of [L, R]) { ctx.beginPath(); ctx.arc(x, cy + er * 0.5, er, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(cx - 4.5 * s, cy + 3.5 * s);
      ctx.quadraticCurveTo(cx, cy + 11 * s, cx + 4.5 * s, cy + 3.5 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff7d93';
      ellipse(ctx, cx, cy + 7.2 * s, 2.2 * s, 1.3 * s); ctx.fill();
      blush(ctx, cx, cy + 3 * s, s, ex + 3.5 * s, 0.7);
      break;
    }
    case 'giggle': {
      for (const [x, d] of [[L, 1], [R, -1]] as const) {
        ctx.beginPath(); ctx.moveTo(x - 3 * s * d, cy - 3 * s); ctx.lineTo(x + 2.5 * s * d, cy - 0.5 * s); ctx.lineTo(x - 3 * s * d, cy + 2 * s); ctx.stroke();
      }
      const o = 0.6 + 0.4 * Math.abs(Math.sin(t * 14));
      ellipse(ctx, cx, cy + 6.5 * s, 3.6 * s, 3 * s * o); ctx.fill();
      blush(ctx, cx, cy + 3 * s, s, ex + 3.5 * s, 0.8);
      break;
    }
    case 'scared': {
      for (const x of [L, R]) {
        ctx.fillStyle = '#fff';
        ellipse(ctx, x, cy - 0.5 * s, 4 * s, 4.6 * s); ctx.fill(); ctx.lineWidth = 1.6 * s; ctx.stroke();
        ctx.fillStyle = ink;
        circle(ctx, x + Math.sin(t * 30) * 0.6 * s, cy, 1.5 * s); ctx.fill();
      }
      ctx.lineWidth = 1.8 * s;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const px = cx - 4.5 * s + (i * 9 * s) / 6, py = cy + 7 * s + (i % 2 ? -1.3 : 1.3) * s;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      // sweat drop
      ctx.fillStyle = '#8fd3ff';
      const sx = cx + 13 * s, sy = cy - 7 * s + ((t * 1.5) % 1) * 4 * s;
      ctx.beginPath(); ctx.moveTo(sx, sy - 4 * s); ctx.quadraticCurveTo(sx + 3.2 * s, sy + 1 * s, sx, sy + 2.2 * s);
      ctx.quadraticCurveTo(sx - 3.2 * s, sy + 1 * s, sx, sy - 4 * s); ctx.fill(); inkStroke(ctx, s, 1.2);
      break;
    }
    case 'collapsed': {
      ctx.lineWidth = 1.5 * s;
      for (const [x, d] of [[L, 1], [R, -1]] as const) {
        ctx.beginPath();
        for (let i = 0; i <= 22; i++) {
          const a = i * 0.55 * d + t * 6 * d, r = (i / 22) * 4.2 * s;
          const px = x + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1.8 * s;
      ctx.beginPath(); ctx.moveTo(cx - 3.5 * s, cy + 7 * s);
      ctx.bezierCurveTo(cx - 1 * s, cy + 4.5 * s, cx + 1 * s, cy + 9 * s, cx + 3.5 * s, cy + 6 * s); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function dizzyStars(ctx: Ctx, cx: number, cy: number, s: number, t: number) {
  for (let i = 0; i < 3; i++) {
    const a = t * 3 + (i * TAU) / 3;
    const px = cx + Math.cos(a) * 16 * s, py = cy + Math.sin(a) * 4.5 * s;
    starPath(ctx, px, py, 4 * s, t * 4);
    ctx.fillStyle = PALETTE.sunny;
    ctx.fill();
    inkStroke(ctx, s, 1.3);
  }
}

// ── bed under every qubble: a small iso mattress + pillow, aligned to the tile ──
/** Iso point in bed-local space: (u along +gx, v along +gy, z up), in tiles of the 96×48 grid at s. */
function bp(x: number, y: number, s: number, u: number, v: number, z = 0) {
  return { x: x + (u - v) * 48 * s, y: y + (u + v) * 24 * s - z * 48 * s };
}
function isoRound(ctx: Ctx, x: number, y: number, s: number, h: number, z: number, r: number) {
  // rounded square of half-size h (tiles) at height z, corner radius r (tiles), centred on the tile
  ctx.beginPath();
  const cs: [number, number, number][] = [[h - r, -h + r, -Math.PI / 2], [h - r, h - r, 0], [-h + r, h - r, Math.PI / 2], [-h + r, -h + r, Math.PI]];
  let first = true;
  for (const [cu, cv, a0] of cs) for (let i = 0; i <= 5; i++) {
    const a = a0 + (i / 5) * (Math.PI / 2);
    const p = bp(x, y, s, cu + Math.cos(a) * r, cv + Math.sin(a) * r, z);
    if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}
/** Mattress footprint: 0.78×0.78 tile (≈75×37 px at s=1) centred on (x, y), 7·s thick, pillow at the back corner.
 *  Draw it before the qubble (drawQubble already does). */
export function drawBed(ctx: Ctx, x: number, y: number, s: number, night = 0) {
  const h = 0.39, r = 0.1, th = 7 / 48;
  ctx.save();
  const top = mix(hex('#dcd6ff'), hex('#4a4f8e'), night);
  const sheet = mix(hex('#fffaf3'), hex('#6a6fa8'), night);
  // contact shadow / AO under the bed
  ctx.save();
  ctx.translate(0, 2.5 * s);
  isoRound(ctx, x, y, s, h + 0.03, 0, r + 0.03);
  ctx.fillStyle = 'rgba(30,20,50,0.22)'; ctx.fill();
  ctx.restore();
  // sides (extrude the base outline up by th)
  isoRound(ctx, x, y, s, h, 0, r);
  ctx.fillStyle = rgba(darken(top, 0.32)); ctx.fill();
  const sg = ctx.createLinearGradient(x - 40 * s, 0, x + 40 * s, 0);
  sg.addColorStop(0, rgba(darken(top, 0.12))); sg.addColorStop(0.5, rgba(darken(top, 0.22))); sg.addColorStop(1, rgba(darken(top, 0.38)));
  // fill the band between base and top outline
  ctx.beginPath();
  const L = bp(x, y, s, -h, h), R = bp(x, y, s, h, -h), F = bp(x, y, s, h, h);
  ctx.moveTo(L.x, L.y - th * 48 * s); ctx.lineTo(L.x, L.y); ctx.lineTo(F.x, F.y); ctx.lineTo(R.x, R.y); ctx.lineTo(R.x, R.y - th * 48 * s); ctx.lineTo(F.x, F.y - th * 48 * s); ctx.closePath();
  ctx.fillStyle = sg; ctx.fill();
  isoRound(ctx, x, y, s, h, 0, r); ctx.fillStyle = sg; ctx.fill();
  inkStroke(ctx, s, 2);
  // piping seam on the side
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    const p = k < 0.5 ? bp(x, y, s, -h + 2 * h * (k * 2), h, th * 0.45) : bp(x, y, s, h, h - 2 * h * ((k - 0.5) * 2), th * 0.45);
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  }
  ctx.setLineDash([2.5 * s, 2.5 * s]); ctx.lineWidth = 1 * s; ctx.strokeStyle = rgba(lighten(top, 0.5), 0.8); ctx.stroke(); ctx.setLineDash([]);
  // top (sheet)
  isoRound(ctx, x, y, s, h, th, r);
  const tg = ctx.createLinearGradient(bp(x, y, s, -h, -h, th).x, bp(x, y, s, -h, -h, th).y, bp(x, y, s, h, h, th).x, bp(x, y, s, h, h, th).y);
  tg.addColorStop(0, rgba(lighten(sheet, 0.3))); tg.addColorStop(0.6, rgba(sheet)); tg.addColorStop(1, rgba(mix(sheet, top, 0.45)));
  ctx.fillStyle = tg; ctx.fill();
  // fabric weave
  ctx.save(); ctx.clip();
  ctx.lineWidth = 0.7 * s; ctx.strokeStyle = rgba(darken(top, 0.2), 0.12);
  ctx.beginPath();
  for (let u = -h; u <= h; u += 0.06) { const a1 = bp(x, y, s, u, -h, th), b1 = bp(x, y, s, u, h, th); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); }
  ctx.stroke();
  // turned-down sheet band at the front
  ctx.beginPath();
  const q = [bp(x, y, s, -h, 0.12, th), bp(x, y, s, h, 0.12, th), bp(x, y, s, h, h, th), bp(x, y, s, -h, h, th)];
  ctx.moveTo(q[0].x, q[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y); ctx.closePath();
  ctx.fillStyle = rgba(top, 0.55); ctx.fill();
  ctx.restore();
  isoRound(ctx, x, y, s, h, th, r);
  inkStroke(ctx, s, 2);
  // pillow at the back corner (puffy iso cushion)
  const pc = bp(x, y, s, -0.21, -0.21, th);
  const pw = 21 * s, ph = 9 * s;
  ctx.beginPath();
  ctx.moveTo(pc.x - pw, pc.y);
  ctx.bezierCurveTo(pc.x - pw * 1.05, pc.y - ph * 1.3, pc.x - pw * 0.2, pc.y - ph * 1.25, pc.x, pc.y - ph * 1.05);
  ctx.bezierCurveTo(pc.x + pw * 0.2, pc.y - ph * 1.25, pc.x + pw * 1.05, pc.y - ph * 1.3, pc.x + pw, pc.y);
  ctx.bezierCurveTo(pc.x + pw * 1.05, pc.y + ph * 0.9, pc.x + pw * 0.2, pc.y + ph * 0.9, pc.x, pc.y + ph * 0.75);
  ctx.bezierCurveTo(pc.x - pw * 0.2, pc.y + ph * 0.9, pc.x - pw * 1.05, pc.y + ph * 0.9, pc.x - pw, pc.y);
  ctx.closePath();
  const pg = ctx.createRadialGradient(pc.x - pw * 0.35, pc.y - ph * 0.6, 1, pc.x, pc.y, pw * 1.1);
  pg.addColorStop(0, rgba(lighten(sheet, 0.6))); pg.addColorStop(0.7, rgba(sheet)); pg.addColorStop(1, rgba(mix(sheet, top, 0.6)));
  ctx.fillStyle = pg; ctx.fill(); inkStroke(ctx, s, 1.8);
  ctx.beginPath(); ctx.moveTo(pc.x - pw * 0.25, pc.y - ph * 0.2); ctx.quadraticCurveTo(pc.x, pc.y + ph * 0.15, pc.x + pw * 0.25, pc.y - ph * 0.2);
  ctx.lineWidth = 1 * s; ctx.strokeStyle = rgba(darken(top, 0.3), 0.5); ctx.stroke();
  ctx.restore();
}

// ── main ─────────────────────────────────────────────────────────────────────
export function drawQubble(ctx: Ctx, x: number, y: number, s: number, v: QubbleVisual, t: number) {
  const seed = v.label ? hash(v.label.charCodeAt(v.label.length - 1) * 7.3) * 10 : 0;
  ctx.save();
  if (v.highlight) {
    const p = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.save();
    ctx.setLineDash([6 * s, 5 * s]);
    ctx.lineDashOffset = -t * 20 * s;
    const hh = 0.44 + p * 0.03;
    ctx.beginPath();
    for (const [u, v] of [[-hh, -hh], [hh, -hh], [hh, hh], [-hh, hh]]) { const q = bp(x, y, s, u, v); ctx.lineTo(q.x, q.y); }
    ctx.closePath();
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = PALETTE.red;
    ctx.stroke();
    ctx.restore();
  }
  if (v.classical) drawDataBox(ctx, x, y, s, v, t, seed); // 7 Billion Humans homage: a data crate on the floor tile
  else { drawBed(ctx, x, y, s, sceneState.night); drawBlob(ctx, x, y - 5 * s, s, v, t, seed); }
  if (v.label) nameTag(ctx, x + 24 * s, y + 9 * s, s, v.label);
  ctx.restore();
}

function drawBlob(ctx: Ctx, x: number, y: number, s: number, v: QubbleVisual, t: number, seed: number) {
  const { x: bx, y: by, z: bz } = v.bloch;
  const r = clamp(Math.hypot(bx, by, bz));
  const mist = 1 - r;
  const eq = Math.hypot(bx, by); // equatorial (superposition) strength, 0..1
  const phi = Math.atan2(by, bx);
  const blanket = clamp(v.blanket);
  const st = v.state;
  const collapsed = st === 'collapsed';

  // squash & stretch per state
  const sleepy = st === 'sleep';
  const breath = Math.sin(t * (sleepy ? 1.6 : 2.6) + seed);
  let sx = 1 + 0.035 * breath, sy = 1 - 0.045 * breath, hop = 0, rot = 0, jx = 0;
  if (st === 'happy') { const b = Math.abs(Math.sin(t * 5 + seed)); hop = b * 7; sy = 1 + 0.08 * b - 0.06 * (1 - b); sx = 2 - sy; }
  if (st === 'giggle') { rot = Math.sin(t * 16) * 0.07; sy = 1 + 0.05 * Math.sin(t * 20); sx = 2 - sy; hop = Math.abs(Math.sin(t * 8)) * 2; }
  if (st === 'scared') { jx = Math.sin(t * 50) * (blanket >= 0.5 ? 1.8 : 1.1); sx = 0.92; sy = 1.08; }
  if (st === 'mumble') {
    // rolls over: a slow lopsided heave to one side and back
    const r = Math.sin(t * 2.4 + seed);
    rot = r * 0.2; jx = r * 3; sx = 1.06 - 0.04 * Math.abs(r); sy = 0.95 + 0.04 * Math.abs(r);
  }
  if (st === 'giggle' && blanket >= 0.5) { rot = Math.sin(t * 22) * 0.09; hop = Math.abs(Math.sin(t * 11)) * 3; }
  if (st === 'awake-grumpy') { sx = 1.06 + 0.02 * breath; sy = 0.95 - 0.02 * breath; }
  if (collapsed) { const k = Math.sin(t * 9) * 0.04; sx = 1.32 + k; sy = 0.66 - k; }

  const w = QW * s, h = QH * s;
  const shW = (collapsed ? 30 : 23) * s * (1 - hop / 40);
  groundShadow(ctx, x, y, shW, shW * 0.42, 0.28);

  // ── colour from the Bloch vector ──
  let sun = SUNNY, moon = MOONY;
  const wSun = clamp((1 + bz) / 2);
  let base: RGB;
  if (collapsed) {
    base = bz >= 0 ? SUNNY : MOONY;
  } else {
    // Mix is applied to the "visible z": near the poles nearly pure.
    base = mix(MOONY, SUNNY, wSun);
    const d = mist * 0.8;
    base = mix(desat(base, d), MIST, d * 0.6);
    sun = mix(desat(SUNNY, d), MIST, d * 0.5);
    moon = mix(desat(MOONY, d), MIST, d * 0.5);
  }

  const bodyAlpha = collapsed ? 1 : 1 - 0.42 * mist;
  const fullCover = blanket >= 0.98;

  ctx.save();
  ctx.translate(x + jx * s, y - hop * s);
  ctx.rotate(rot);

  if (!fullCover) {
    // fog halo for mixed / entangled
    if (mist > 0.04 && !collapsed) {
      const fr = 36 * s;
      const fg = ctx.createRadialGradient(0, -h * 0.5, 4 * s, 0, -h * 0.5, fr);
      fg.addColorStop(0, `rgba(225,222,245,${0.5 * mist})`);
      fg.addColorStop(1, 'rgba(225,222,245,0)');
      ctx.fillStyle = fg;
      circle(ctx, 0, -h * 0.5, fr); ctx.fill();
      ctx.fillStyle = `rgba(235,233,250,${0.35 * mist})`;
      for (let i = 0; i < 5; i++) {
        const a = t * 0.4 + i * 1.3 + seed;
        circle(ctx, Math.cos(a) * 24 * s, -h * 0.5 + Math.sin(a * 1.3) * 14 * s, (6 + 2 * Math.sin(t + i)) * s); ctx.fill();
      }
    }
    // dream glow
    if (!collapsed) {
      const gr = 34 * s;
      const gg = ctx.createRadialGradient(0, -h * 0.45, 6 * s, 0, -h * 0.45, gr);
      gg.addColorStop(0, rgba(base, 0.35 * r));
      gg.addColorStop(1, rgba(base, 0));
      ctx.fillStyle = gg;
      circle(ctx, 0, -h * 0.45, gr); ctx.fill();
    }

    ctx.save();
    ctx.scale(sx, sy);
    ctx.globalAlpha = bodyAlpha;
    const wob = collapsed ? 0 : 0.03 * Math.sin(t * 2.1 + seed);
    bodyPath(ctx, w, h, wob);
    ctx.save();
    ctx.clip();
    // base gradient
    const bg = ctx.createLinearGradient(0, -h, 0, 0);
    bg.addColorStop(0, rgba(lighten(base, collapsed ? 0.12 : 0.28)));
    bg.addColorStop(0.55, rgba(base));
    bg.addColorStop(1, rgba(darken(base, collapsed ? 0.12 : 0.22)));
    ctx.fillStyle = bg;
    ctx.fillRect(-w * 1.3, -h * 1.2, w * 2.6, h * 1.4);

    // Two-tone swirl (superposition). Sunny share of the body = P(0) = (1+z)/2.
    // Sunny lobe points along φ (CCW from +x on screen); chirality = cos φ, so a phase flip
    // (φ→φ+π, e.g. + ↔ −) shows the mirror-image swirl pointing the other way.
    const rel = r > 1e-3 ? eq / r : 0;
    if (!collapsed && rel > 0.02) {
      const cy = -h * 0.52;
      const R = w * 1.8;
      const wobA = 0.1 * Math.sin(t * 1.3 + seed);
      const a0 = -phi + wobA; // canvas y is down → negate for CCW
      const curl = (Math.PI * 0.85 / w) * Math.cos(phi);
      const alpha = 1; // fraction (not opacity) carries P(0); mist handles mixedness
      const half = Math.PI * wSun;
      ctx.globalAlpha = bodyAlpha * alpha;
      const mg = ctx.createRadialGradient(-w * 0.3, cy - h * 0.35, 2, 0, cy, R * 0.8);
      mg.addColorStop(0, rgba(lighten(moon, 0.35)));
      mg.addColorStop(1, rgba(darken(moon, 0.12)));
      ctx.fillStyle = mg;
      ctx.fillRect(-w * 1.3, -h * 1.2, w * 2.6, h * 1.4);
      ctx.beginPath();
      ctx.moveTo(0, cy);
      const N = 24;
      for (let i = 1; i <= N; i++) {
        const rr = (i / N) * R;
        const a = a0 - half + curl * rr;
        ctx.lineTo(Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.arc(0, cy, R, a0 - half + curl * R, a0 + half + curl * R);
      for (let i = N; i >= 1; i--) {
        const rr = (i / N) * R;
        const a = a0 + half + curl * rr;
        ctx.lineTo(Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
      const sg = ctx.createRadialGradient(-w * 0.3, cy - h * 0.35, 2, 0, cy, R * 0.8);
      sg.addColorStop(0, rgba(lighten(sun, 0.35)));
      sg.addColorStop(1, rgba(darken(sun, 0.08)));
      ctx.fillStyle = sg;
      ctx.fill();
      // soft seam highlight so the swirl reads as glossy candy
      ctx.lineWidth = 1.6 * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.stroke();
      // flowing sparkles riding the seams: direction follows the chirality
      const dir = Math.cos(phi) >= 0 ? 1 : -1;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 4; i++) {
        const p = (((t * 0.3 * dir + i / 4) % 1) + 1) % 1;
        const rr = (0.15 + p * 0.75) * w;
        const a = a0 + (i % 2 ? half : -half) + curl * rr;
        circle(ctx, Math.cos(a) * rr, cy + Math.sin(a) * rr, (0.8 + Math.sin(p * Math.PI) * 1.3) * s);
        ctx.fill();
      }
      ctx.globalAlpha = bodyAlpha;
      // 3D shading over the swirl
      const sh = ctx.createLinearGradient(0, -h, 0, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0.18)');
      sh.addColorStop(0.5, 'rgba(255,255,255,0)');
      sh.addColorStop(1, 'rgba(20,16,40,0.22)');
      ctx.fillStyle = sh;
      ctx.fillRect(-w * 1.3, -h * 1.2, w * 2.6, h * 1.4);
    }

    // phase rim tint (lower-right back light), hue walks with φ
    if (!collapsed && eq > 0.05) {
      const rimC = hsl(165 + (phi * 180) / Math.PI, 85, 66);
      const rg = ctx.createRadialGradient(w * 0.55, -h * 0.25, w * 0.4, w * 0.2, -h * 0.4, w * 1.25);
      rg.addColorStop(0, rgba(rimC, 0));
      rg.addColorStop(0.75, rgba(rimC, 0));
      rg.addColorStop(1, rgba(rimC, 0.85 * eq));
      ctx.fillStyle = rg;
      ctx.fillRect(-w * 1.3, -h * 1.2, w * 2.6, h * 1.4);
    }
    // soft top-left rim light
    ctx.lineWidth = 5 * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(w * 0.06, -h * 0.5, w * 0.82, h * 0.42, 0, Math.PI * 1.05, Math.PI * 1.55);
    ctx.stroke();
    // ambient occlusion where the body meets the mattress
    const ao = ctx.createLinearGradient(0, -h * 0.3, 0, h * 0.05);
    ao.addColorStop(0, 'rgba(30,16,50,0)'); ao.addColorStop(1, `rgba(30,16,50,${collapsed ? 0.18 : 0.3})`);
    ctx.fillStyle = ao; ctx.fillRect(-w * 1.3, -h * 0.3, w * 2.6, h * 0.4);
    // crisp rim light on the right edge (cool back light)
    ctx.lineWidth = 1.6 * s;
    ctx.strokeStyle = 'rgba(235,245,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.04, -h * 0.47, w * 0.92, h * 0.47, 0, -Math.PI * 0.32, Math.PI * 0.12);
    ctx.stroke();
    // specular gummy shine
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ellipse(ctx, -w * 0.42, -h * 0.74, 4.2 * s, 2.6 * s, -0.6); ctx.fill();
    circle(ctx, -w * 0.62, -h * 0.58, 1.4 * s); ctx.fill();
    ctx.restore(); // clip

    bodyPath(ctx, w, h, wob);
    ctx.lineWidth = LINE * s / Math.sqrt(sx * sy);
    ctx.strokeStyle = mist > 0.3 && !collapsed ? `rgba(14,14,14,${1 - mist * 0.55})` : INK;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore(); // scale

    // face (unscaled so lines stay crisp)
    const faceY = -h * sy * (collapsed ? 0.48 : 0.44);
    ctx.globalAlpha = blanket > 0 ? 1 - blanket * 0.6 : 1;
    drawFace(ctx, st, s, t, 0, faceY, collapsed ? 7.5 : 6.5);
    if (collapsed) dizzyStars(ctx, 0, -h * sy - 4 * s, s, t);
    ctx.globalAlpha = 1;
  }

  // ── blanket ──
  if (blanket > 0.01) {
    const snore = fullCover ? Math.sin(t * 1.6 + seed) : breath;
    ctx.save();
    ctx.scale(1 + 0.03 * snore, 1 - 0.05 * snore);
    blanketPath(ctx, w, h, t);
    const pat = quiltPattern(ctx);
    const a = blanket >= 0.98 ? 1 : Math.min(0.92, 0.08 + blanket * 0.95);
    ctx.globalAlpha = a;
    if (pat) {
      pat.setTransform(new DOMMatrix().scale(s * 0.5, s * 0.5).rotate(0, 0, 45));
      ctx.fillStyle = pat;
    } else ctx.fillStyle = '#f5a3b5';
    ctx.fill();
    // fold shading
    const fg = ctx.createLinearGradient(-w, -h, w, 0);
    fg.addColorStop(0, 'rgba(255,255,255,0.35)');
    fg.addColorStop(0.6, 'rgba(255,255,255,0)');
    fg.addColorStop(1, 'rgba(60,30,60,0.25)');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.globalAlpha = blanket >= 0.98 ? 1 : 0.45 + blanket * 0.5;
    if (blanket < 0.5) { ctx.setLineDash([6 * s, 4 * s]); }
    ctx.lineWidth = (blanket < 0.5 ? 1.7 : LINE) * s;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
    // folded top edge (pillow-ish trim)
    ctx.globalAlpha = blanket >= 0.98 ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(-w * 1.05, -h * 0.25);
    ctx.quadraticCurveTo(0, -h * 0.05, w * 1.05, -h * 0.25);
    ctx.lineWidth = 1.6 * s;
    ctx.strokeStyle = 'rgba(14,14,14,0.6)';
    ctx.stroke();
    ctx.restore();
  }

  const arm = (v as QubbleVisual & { arm?: QubbleArm }).arm;
  if (arm && arm.t > 0.01) gooArm(ctx, s, w, h, arm, blanket >= 0.5 ? null : base, t);
  if (st === 'sleep' && blanket < 0.98) zzz(ctx, w * 0.7, -h * 1.05, s, t + seed, mist > 0.5 ? '#55524b' : INK);
  if (fullCover && st === 'sleep') zzz(ctx, w * 0.9, -h * 1.15, s, t + seed);
  if (st === 'giggle') giggleNotes(ctx, s, t, w, h);
  if (st === 'mumble') mumbleSquiggle(ctx, s, t, w, h);
  if (st === 'scared' && blanket >= 0.5) blanketFright(ctx, s, t, w, h);
  ctx.restore();
}

/** "mmh" + a wavy squiggle drifting up (sleep-talk). Neutral ink: never hints at the dream colour. */
function mumbleSquiggle(ctx: Ctx, s: number, t: number, w: number, h: number) {
  ctx.save();
  const p = (t * 0.6) % 1;
  ctx.globalAlpha = Math.sin(p * Math.PI);
  const x0 = w * 0.75, y0 = -h * 1.05 - p * 12 * s;
  ctx.font = `700 ${10 * s}px Quicksand, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3 * s; ctx.strokeStyle = PALETTE.paper; ctx.lineJoin = 'round';
  ctx.strokeText('mmh', x0, y0);
  ctx.fillStyle = INK; ctx.fillText('mmh', x0, y0);
  ctx.beginPath();
  for (let i = 0; i <= 14; i++) { const px = x0 + 2 * s + i * 1.6 * s, py = y0 - 8 * s + Math.sin(i * 0.9 - t * 5) * 2 * s; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.lineWidth = 1.5 * s; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}
/** Under a blanket the face is hidden, so fright reads from the quilt: shiver lines, flying sweat drops and "!!". */
function blanketFright(ctx: Ctx, s: number, t: number, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = side * (w * 1.55 + i * 0.5 * s), y = -h * (0.25 + i * 0.25);
    const j = Math.sin(t * 40 + i) * 1.2 * s;
    ctx.beginPath(); ctx.moveTo(x + j, y - 3 * s); ctx.lineTo(x + side * 3 * s + j, y); ctx.lineTo(x + j, y + 3 * s); ctx.stroke();
  }
  for (let i = 0; i < 2; i++) {
    const p = (t * 1.4 + i * 0.5) % 1, side = i ? -1 : 1;
    ctx.globalAlpha = 1 - p;
    const sx = side * (w * 0.9 + p * 10 * s), sy = -h * 1.0 - Math.sin(p * Math.PI) * 8 * s + p * 6 * s;
    ctx.fillStyle = '#8fd3ff';
    ctx.beginPath(); ctx.moveTo(sx, sy - 4 * s); ctx.quadraticCurveTo(sx + 3 * s, sy + 1 * s, sx, sy + 2.2 * s);
    ctx.quadraticCurveTo(sx - 3 * s, sy + 1 * s, sx, sy - 4 * s); ctx.fill(); inkStroke(ctx, s, 1.2);
  }
  ctx.globalAlpha = 1;
  ctx.font = `700 ${13 * s}px Quicksand, sans-serif`; ctx.textAlign = 'center';
  ctx.lineWidth = 3.5 * s; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  const bx = Math.sin(t * 30) * 0.8 * s;
  ctx.strokeText('!!', bx, -h * 1.45); ctx.fillStyle = PALETTE.paper; ctx.fillText('!!', bx, -h * 1.45);
  ctx.restore();
}

function giggleNotes(ctx: Ctx, s: number, t: number, w: number, h: number) {
  ctx.save();
  ctx.font = `700 ${11 * s}px Quicksand, sans-serif`;
  ctx.fillStyle = INK;
  for (let i = 0; i < 2; i++) {
    const p = (t * 0.9 + i * 0.5) % 1;
    ctx.globalAlpha = Math.sin(p * Math.PI);
    ctx.fillText(i ? 'hi' : 'hee', (i ? -w * 1.3 : w * 0.8) + Math.sin(p * 8) * 2 * s, -h * 0.9 - p * 16 * s);
  }
  ctx.restore();
}

/** Optional HIGHFIVE arm (pending contract field `QubbleVisual.arm`). dx,dy = screen-px direction toward the partner. */
export interface QubbleArm { dx: number; dy: number; t: number }
/** Gooey arm popping out from under the blanket. When the qubble is hidden (blanket ≥ 0.5) the arm wears a neutral
 *  mitten-sleeve so it never leaks the dream colour. */
function gooArm(ctx: Ctx, s: number, w: number, h: number, arm: QubbleArm, col: RGB | null, t: number) {
  const k = clamp(arm.t);
  const e = k * k * (3 - 2 * k);
  const d = Math.hypot(arm.dx, arm.dy) || 1;
  const ux = arm.dx / d, uy = arm.dy / d;
  const side = ux >= 0 ? 1 : -1;
  const x0 = side * w * 0.78, y0 = -h * 0.32;
  const len = Math.min(d * 0.55, 34 * s) * e;
  const x1 = x0 + ux * len, y1 = y0 + uy * len - Math.sin(e * Math.PI) * 8 * s;
  const cx = (x0 + x1) / 2 + side * 2 * s, cy = Math.min(y0, y1) - 6 * s * e;
  const fill = col ? rgba(col) : '#d8d3ea';
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.lineWidth = (7 + LINE * 2) * s; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 7 * s; ctx.strokeStyle = fill; ctx.stroke();
  // goo blob hand / mitten
  const hr = 5.5 * s * (0.8 + 0.2 * e);
  circle(ctx, x1, y1, hr);
  ctx.fillStyle = col ? rgba(lighten(col, 0.15)) : '#f7a8b8';
  ctx.fill(); inkStroke(ctx, s, 2);
  if (!col) { ctx.fillStyle = '#fff1dc'; ctx.fillRect(x1 - hr * 0.9, y1 + hr * 0.2, hr * 1.8, hr * 0.45); }
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; circle(ctx, x1 - hr * 0.35, y1 - hr * 0.35, hr * 0.28); ctx.fill();
  if (k > 0.85) {
    ctx.strokeStyle = PALETTE.sunny; ctx.lineWidth = 2 * s;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + t * 2;
      ctx.beginPath(); ctx.moveTo(x1 + Math.cos(a) * hr * 1.4, y1 + Math.sin(a) * hr * 1.4); ctx.lineTo(x1 + Math.cos(a) * hr * 2.1, y1 + Math.sin(a) * hr * 2.1); ctx.stroke();
    }
  }
  ctx.restore();
}

// ═════════════════════════════ DATA BOX (classical, v0.4) ═════════════════════════════
// Homage to 7 Billion Humans: a chunky cardboard crate on the tile with its value stencilled big on the lid.
// Anchor = tile centre (same as the qubble). Footprint 0.56×0.56 tile (≈54×27 px at s=1), body 26·s tall.
// blanket ≥ 0.5 = lid closed (value hidden behind a "?" stencil); < 0.5 = flaps open, value showing.
const CB: RGB = [222, 176, 112], CB_D: RGB = [178, 128, 70], CB_L: RGB = [240, 206, 150];
export function drawDataBox(ctx: Ctx, x: number, y: number, s: number, v: QubbleVisual, t: number, seed: number) {
  const one = v.bloch.z < 0;
  const st = v.state;
  const open = clamp(1 - v.blanket * 2); // 0 closed … 1 fully open (blanket 0)
  const closed = v.blanket >= 0.5;
  const tint: RGB = one ? MOONY : SUNNY;
  const nN = sceneState.night;
  const col = (c: RGB, k = 0) => rgba(mix(mix(c, tint, 0.12), [40, 40, 80], nN * 0.45 + k));
  const h = 0.28, H = 26 / 48; // half-size (tiles), height (tile-heights)
  // reactions
  let hop = 0, rot = 0, jx = 0, flipK = 1;
  if (st === 'happy' || st === 'giggle') hop = Math.abs(Math.sin(t * 6 + seed)) * (st === 'giggle' ? 3 : 7);
  if (st === 'scared') { jx = Math.sin(t * 48) * 1.6; flipK = Math.cos(t * 9); } // shake + digit spinning over
  if (st === 'mumble') rot = Math.sin(t * 2.6 + seed) * 0.07;
  if (st === 'giggle') rot = Math.sin(t * 18) * 0.05;
  const breath = st === 'sleep' ? Math.sin(t * 1.6 + seed) * 0.6 : 0;
  // floor contact shadow (stays put while hopping)
  groundShadow(ctx, x, y + 1 * s, 34 * s * (1 - hop / 40), 15 * s * (1 - hop / 40), 0.3);
  ctx.save();
  ctx.translate(x + jx * s, y - hop * s);
  ctx.rotate(rot);
  const P = (u: number, vv: number, z = 0) => bp(0, 0, s, u, vv, z);
  const Hz = H + breath / 48;
  const top = [P(-h, -h, Hz), P(h, -h, Hz), P(h, h, Hz), P(-h, h, Hz)];
  const fl = [P(-h, h, Hz), P(h, h, Hz), P(h, h, 0), P(-h, h, 0)]; // +gy face (lower-left)
  const fr = [P(h, -h, Hz), P(h, h, Hz), P(h, h, 0), P(h, -h, 0)]; // +gx face (lower-right)
  const quad = (q: { x: number; y: number }[]) => { ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y); ctx.closePath(); };
  // back flaps (open): hinge on the two back top edges, fold outward/up
  if (open > 0.01) {
    const lift = open * 0.32;
    for (const [a, b, d] of [[top[0], top[1], { x: 0.6, y: -1 }], [top[3], top[0], { x: -0.6, y: -1 }]] as const) {
      quad([a, b, { x: b.x + d.x * lift * 48 * s * 0.5, y: b.y + d.y * lift * 48 * s }, { x: a.x + d.x * lift * 48 * s * 0.5, y: a.y + d.y * lift * 48 * s }]);
      ctx.fillStyle = col(CB_D, 0.05); ctx.fill(); inkStroke(ctx, s, 1.8);
    }
  }
  // side faces with multi-stop shading + corrugation lines
  quad(fl);
  const gl = ctx.createLinearGradient(fl[0].x, fl[0].y, fl[3].x, fl[3].y);
  gl.addColorStop(0, col(CB_L)); gl.addColorStop(0.5, col(CB)); gl.addColorStop(1, col(CB, 0.08));
  ctx.fillStyle = gl; ctx.fill();
  quad(fr);
  const gr = ctx.createLinearGradient(fr[0].x, fr[0].y, fr[3].x, fr[3].y);
  gr.addColorStop(0, col(CB)); gr.addColorStop(1, col(CB_D, 0.05));
  ctx.fillStyle = gr; ctx.fill();
  ctx.save(); quad([fl[3], fl[0], fr[0], fr[1], fr[2], fl[2]]); ctx.clip();
  ctx.strokeStyle = 'rgba(110,70,30,0.16)'; ctx.lineWidth = 0.8 * s;
  for (let k = 1; k < 8; k++) {
    const u = -h + (2 * h * k) / 8;
    let a = P(u, h, Hz), b = P(u, h, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    a = P(h, u, Hz); b = P(h, u, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // AO at the floor
  const ao = ctx.createLinearGradient(0, -8 * s, 0, 2 * s);
  ao.addColorStop(0, 'rgba(40,20,10,0)'); ao.addColorStop(1, 'rgba(40,20,10,0.3)');
  ctx.fillStyle = ao; ctx.fillRect(-40 * s, -10 * s, 80 * s, 14 * s);
  ctx.restore();
  // little stencil on the front-left face: "this side up" arrows
  ctx.save();
  const fc = P(0, h, Hz * 0.42);
  ctx.translate(fc.x, fc.y); ctx.transform(1, -0.5, 0, 1, 0, 0);
  ctx.strokeStyle = 'rgba(14,14,14,0.45)'; ctx.lineWidth = 1.3 * s; ctx.lineCap = 'round';
  for (const ax of [-5, 5]) { ctx.beginPath(); ctx.moveTo(ax * s, 4 * s); ctx.lineTo(ax * s, -4 * s); ctx.moveTo((ax - 2.5) * s, -1.5 * s); ctx.lineTo(ax * s, -4 * s); ctx.lineTo((ax + 2.5) * s, -1.5 * s); ctx.stroke(); }
  ctx.restore();
  // edges
  ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LINE * s;
  quad([top[0], top[1], fr[3], fr[2], fl[3], top[3]]); ctx.stroke();
  ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(top[2].x, top[2].y); ctx.lineTo(fr[2].x, fr[2].y); ctx.stroke();
  // top / lid
  quad(top);
  if (closed) {
    const tg = ctx.createLinearGradient(top[0].x, top[0].y, top[2].x, top[2].y);
    tg.addColorStop(0, col(CB_L, -0.05)); tg.addColorStop(1, col(CB));
    ctx.fillStyle = tg; ctx.fill(); inkStroke(ctx, s, 2);
    // flap seam + tape strip along +gx
    const a = P(-h, 0, Hz), b = P(h, 0, Hz);
    const tw = 0.06;
    quad([P(-h, -tw, Hz), P(h, -tw, Hz), P(h, tw, Hz), P(-h, tw, Hz)]);
    ctx.fillStyle = nN > 0.5 ? 'rgba(200,190,160,0.6)' : 'rgba(255,240,200,0.75)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = 1 * s; ctx.strokeStyle = 'rgba(14,14,14,0.5)'; ctx.stroke();
    topText('?', 'rgba(14,14,14,0.55)', null, 1);
  } else {
    // open: dark interior, value tile sitting inside
    ctx.fillStyle = rgba(mix([90, 60, 30], [20, 20, 40], nN * 0.5)); ctx.fill(); inkStroke(ctx, s, 2);
    const ih = h - 0.05, iz = Hz - 0.05 * (1 - open);
    quad([P(-ih, -ih, iz), P(ih, -ih, iz), P(ih, ih, iz), P(-ih, ih, iz)]);
    const panel = mix(tint, [255, 255, 255], one ? 0.08 : 0.15);
    const pg = ctx.createLinearGradient(P(-ih, -ih, iz).x, P(-ih, -ih, iz).y, P(ih, ih, iz).x, P(ih, ih, iz).y);
    pg.addColorStop(0, rgba(lighten(panel, 0.35))); pg.addColorStop(0.6, rgba(panel)); pg.addColorStop(1, rgba(darken(panel, 0.12)));
    ctx.fillStyle = pg; ctx.fill(); inkStroke(ctx, s, 1.6);
    topText(one ? '1' : '0', one ? '#ffffff' : INK, one ? 'rgba(20,10,60,0.5)' : 'rgba(255,255,255,0.6)', flipK);
    // front flaps folded down outside
    if (open > 0.3) {
      for (const [a, b, d] of [[top[3], top[2], { x: -0.55, y: 0.5 }], [top[2], top[1], { x: 0.55, y: 0.5 }]] as const) {
        const L = 9 * s * open;
        quad([a, b, { x: b.x + d.x * L, y: b.y + d.y * L + L * 0.4 }, { x: a.x + d.x * L, y: a.y + d.y * L + L * 0.4 }]);
        ctx.fillStyle = col(CB_L); ctx.fill(); inkStroke(ctx, s, 1.6);
      }
    }
    // specular glint on the panel
    const gp = P(-0.12, -0.14, iz);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ellipse(ctx, gp.x, gp.y, 3.5 * s, 1.5 * s, 0.45); ctx.fill();
  }
  // rim light along the top front edges
  ctx.strokeStyle = 'rgba(255,250,235,0.55)'; ctx.lineWidth = 1.2 * s;
  ctx.beginPath(); ctx.moveTo(top[3].x, top[3].y + 1.5 * s); ctx.lineTo(top[2].x, top[2].y + 1.5 * s); ctx.lineTo(top[1].x - 1 * s, top[1].y + 1.5 * s); ctx.stroke();
  // state accents
  if (st === 'sleep' && closed) zzz(ctx, 18 * s, -40 * s, s, t + seed);
  if (st === 'mumble') {
    ctx.save(); ctx.font = `700 ${9 * s}px Quicksand, sans-serif`; ctx.fillStyle = INK; ctx.globalAlpha = Math.sin(((t * 0.6) % 1) * Math.PI);
    ctx.fillText('mmh', 16 * s, -40 * s - ((t * 0.6) % 1) * 10 * s); ctx.restore();
  }
  if (st === 'scared') {
    ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
    for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) { const xx = sd * (32 + i * 4) * s, yy = (-14 - i * 9) * s; ctx.beginPath(); ctx.moveTo(xx, yy - 3 * s); ctx.lineTo(xx + sd * 3 * s, yy); ctx.lineTo(xx, yy + 3 * s); ctx.stroke(); }
    ctx.restore();
  }
  if (st === 'happy') { starPath(ctx, -26 * s, -42 * s + Math.sin(t * 4) * 2 * s, 3.5 * s, t * 2); ctx.fillStyle = PALETTE.sunny; ctx.fill(); inkStroke(ctx, s, 1.2); }
  if (st === 'awake-grumpy') {
    const p2 = (t * 0.8) % 1; ctx.globalAlpha = 1 - p2; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    circle(ctx, 20 * s + p2 * 6 * s, -38 * s - p2 * 10 * s, (2 + p2 * 3) * s); ctx.fill(); inkStroke(ctx, s, 1.2); ctx.globalAlpha = 1;
  }
  const arm = (v as QubbleVisual & { arm?: QubbleArm }).arm;
  if (arm && arm.t > 0.01) { ctx.save(); ctx.translate(0, -6 * s); gooArm(ctx, s, 22 * s, 30 * s, arm, null, t); ctx.restore(); }
  ctx.restore();

  /** Big stencil value on the lid plane (iso top-face text: reads along +gx). flip = cos of the spin (scared). */
  function topText(txt: string, fill: string, shadow: string | null, flip: number) {
    const c = P(0, 0, Hz);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.transform(1, 0.5, -1, 0.5, 0, 0); // local x → +gx edge, local y → +gy edge (top-face plane)
    ctx.scale(1, Math.abs(flip) < 0.08 ? 0.08 : flip);
    ctx.font = `${22 * s}px Quantum, Quicksand, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (shadow) { ctx.fillStyle = shadow; ctx.fillText(txt, 1.2 * s, 2.2 * s); }
    ctx.lineWidth = 2.2 * s; ctx.strokeStyle = fill === '#ffffff' ? INK : 'rgba(255,255,255,0.0)';
    if (fill === '#ffffff') ctx.strokeText(txt, 0, 1 * s);
    ctx.fillStyle = fill; ctx.fillText(txt, 0, 1 * s);
    ctx.restore();
  }
}
