// Qubble: the gummy dreaming blob. Its colour IS its Bloch vector (see docs/ART_NOTES.md).
import { PALETTE, type QubbleVisual } from '../core/contracts';
import {
  type Ctx, type RGB, TAU, INK, LINE, hex, mix, rgba, lighten, darken, desat, hsl, clamp, ellipse, circle,
  inkStroke, groundShadow, zzz, nameTag, blush, starPath, hash,
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
  const W = w * 1.22, H = h * 1.12;
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

// ── bed under every qubble ───────────────────────────────────────────────────
export function drawBed(ctx: Ctx, x: number, y: number, s: number, night = 0) {
  const rx = 30 * s, ry = 13 * s, th = 5 * s;
  ctx.save();
  const top = mix(hex('#d9d3ff'), hex('#4a4f8e'), night);
  const side = darken(top, 0.25);
  // cushion side (thick, puffy)
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI);
  ctx.ellipse(x, y - th, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ellipse(ctx, x, y, rx, ry);
  ctx.fillStyle = rgba(side);
  ctx.fill();
  inkStroke(ctx, s, 2);
  // top
  ellipse(ctx, x, y - th, rx, ry);
  const g = ctx.createRadialGradient(x - rx * 0.3, y - th - ry * 0.4, 2, x, y - th, rx);
  g.addColorStop(0, rgba(lighten(top, 0.45)));
  g.addColorStop(1, rgba(top));
  ctx.fillStyle = g;
  ctx.fill();
  inkStroke(ctx, s, 2);
  // stitched ring + tufts
  ctx.setLineDash([3 * s, 3 * s]);
  ellipse(ctx, x, y - th, rx * 0.8, ry * 0.72);
  ctx.lineWidth = 1.2 * s;
  ctx.strokeStyle = rgba(darken(top, 0.4), 0.6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = rgba(darken(top, 0.3), 0.7);
  for (const [dx, dy] of [[-0.62, 0.3], [0.62, 0.3], [0, 0.62]]) {
    circle(ctx, x + dx * rx, y - th + dy * ry, 1.4 * s); ctx.fill();
  }
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
    ellipse(ctx, x, y, 36 * s + p * 3 * s, 17 * s + p * 1.5 * s);
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = PALETTE.red;
    ctx.stroke();
    ctx.restore();
  }
  drawBed(ctx, x, y + 2 * s, s);
  if (v.classical) drawBitBall(ctx, x, y, s, v, t, seed);
  else drawBlob(ctx, x, y, s, v, t, seed);
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
  if (st === 'scared') { jx = Math.sin(t * 50) * 1.1; sx = 0.92; sy = 1.08; }
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

  if (st === 'sleep' && blanket < 0.98) zzz(ctx, w * 0.7, -h * 1.05, s, t + seed, mist > 0.5 ? '#55524b' : INK);
  if (fullCover && st === 'sleep') zzz(ctx, w * 0.9, -h * 1.15, s, t + seed);
  if (st === 'giggle') giggleNotes(ctx, s, t, w, h);
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

/** Classical bit-ball (Ch0): plain flat Sunny/Moony, with a sleep mask. */
function drawBitBall(ctx: Ctx, x: number, y: number, s: number, v: QubbleVisual, t: number, seed: number) {
  const one = v.bloch.z < 0;
  const col = one ? MOONY : SUNNY;
  const st = v.state;
  const R = 17 * s;
  const breath = Math.sin(t * 1.8 + seed);
  let hop = 0;
  if (st === 'happy' || st === 'giggle') hop = Math.abs(Math.sin(t * 5 + seed)) * 6 * s;
  const sq = st === 'collapsed' ? 0.8 : 1 - 0.03 * breath;
  groundShadow(ctx, x, y, 20 * s, 8 * s, 0.28);
  ctx.save();
  ctx.translate(x, y - hop);
  ctx.scale(2 - sq, sq);
  circle(ctx, 0, -R, R);
  const g = ctx.createRadialGradient(-R * 0.35, -R * 1.4, 2 * s, 0, -R, R * 1.1);
  g.addColorStop(0, rgba(lighten(col, 0.35)));
  g.addColorStop(0.5, rgba(col));
  g.addColorStop(1, rgba(darken(col, 0.18)));
  ctx.fillStyle = g;
  ctx.fill();
  // bit-ball seam
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = rgba(darken(col, 0.3), 0.6);
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.ellipse(0, -R, R * 0.35, R * 1.05, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
  circle(ctx, 0, -R, R);
  inkStroke(ctx, s);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ellipse(ctx, -R * 0.45, -R * 1.5, 3.5 * s, 2.2 * s, -0.6); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y - hop);
  const faceY = -R * 1.05;
  const masked = st === 'sleep';
  const maskY = masked ? faceY - 1 * s : faceY - 12 * s;
  // sleep mask band
  ctx.beginPath();
  ctx.moveTo(-R * 0.98, maskY - 2 * s);
  ctx.bezierCurveTo(-R * 0.6, maskY - 7 * s, R * 0.6, maskY - 7 * s, R * 0.98, maskY - 2 * s);
  ctx.lineTo(R * 0.92, maskY + 4 * s);
  ctx.bezierCurveTo(R * 0.5, maskY + 7 * s, -R * 0.5, maskY + 7 * s, -R * 0.92, maskY + 4 * s);
  ctx.closePath();
  ctx.fillStyle = '#2b2d55';
  ctx.fill();
  inkStroke(ctx, s, 1.8);
  // emblem: 0 or 1 dream
  ctx.fillStyle = one ? '#c9c5ff' : '#ffd77a';
  ctx.font = `700 ${8 * s}px Quicksand, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (masked) {
    ctx.strokeStyle = '#c9c5ff';
    ctx.lineWidth = 1.4 * s;
    for (const ex of [-6 * s, 6 * s]) { ctx.beginPath(); ctx.arc(ex, maskY - 0.5 * s, 2.6 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    ctx.fillStyle = INK;
    circle(ctx, 0, faceY + 9 * s, 1.4 * s); ctx.fill();
    zzz(ctx, R * 0.8, -R * 2, s, t + seed);
  } else {
    ctx.fillText(one ? '1' : '0', 0, maskY + 0.5 * s);
    drawFace(ctx, st, s * 0.85, t, 0, faceY + 3 * s, 6);
  }
  ctx.restore();
}
