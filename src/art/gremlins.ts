// Gremlins: Flipper (X), Phasey (Z), Wobbles (partial rotation). Anchor = ground centre under the gremlin.
import { PALETTE } from '../core/contracts';
import { type Ctx, INK, circle, ellipse, roundRect, inkStroke, groundShadow, starPath } from './util';

export type GremlinKind = 'flipper' | 'phasey' | 'wobbles';
export type GremlinPose = 'sneak' | 'strike' | 'flee' | 'taunt';

export function drawGremlin(ctx: Ctx, x: number, y: number, s: number, kind: GremlinKind, pose: GremlinPose, t: number) {
  if (kind === 'flipper') flipper(ctx, x, y, s, pose, t);
  else if (kind === 'phasey') phasey(ctx, x, y, s, pose, t);
  else wobbles(ctx, x, y, s, pose, t);
}

function speedLines(ctx: Ctx, s: number, dir: number, y0: number, t: number) {
  ctx.strokeStyle = 'rgba(14,14,14,0.45)';
  ctx.lineWidth = 2 * s;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const yy = y0 - i * 8 * s, len = (10 + 5 * Math.sin(t * 25 + i)) * s;
    ctx.beginPath(); ctx.moveTo(-dir * 20 * s, yy); ctx.lineTo(-dir * (20 * s + len), yy); ctx.stroke();
  }
}

function sweat(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = '#8fd3ff';
  ctx.beginPath(); ctx.moveTo(x, y - 4 * s); ctx.quadraticCurveTo(x + 3 * s, y + 1 * s, x, y + 2.2 * s);
  ctx.quadraticCurveTo(x - 3 * s, y + 1 * s, x, y - 4 * s); ctx.fill(); inkStroke(ctx, s, 1.2);
}

// ── Flipper: red imp with horns, sunglasses, cheeky grin, arrow tail ─────────
function flipper(ctx: Ctx, x: number, y: number, s: number, pose: GremlinPose, t: number) {
  let dir = 1, lift = 0, lean = 0, sq = 1, alpha = 1;
  if (pose === 'sneak') { lean = -0.12; sq = 0.9 + 0.04 * Math.sin(t * 6); lift = Math.abs(Math.sin(t * 6)) * 2; alpha = 0.92; }
  if (pose === 'strike') { lean = 0.25; lift = 4 + Math.sin(t * 20) * 2; sq = 1.08; }
  if (pose === 'flee') { dir = -1; lean = -0.2; lift = Math.abs(Math.sin(t * 16)) * 5; }
  if (pose === 'taunt') { lift = Math.abs(Math.sin(t * 7)) * 6; sq = 1 + 0.06 * Math.sin(t * 14); }
  groundShadow(ctx, x, y, 15 * s, 6 * s, 0.28);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y - lift * s);
  if (pose === 'flee') speedLines(ctx, s, dir, -10 * s, t);
  ctx.scale(dir, 1);
  ctx.rotate(lean);
  ctx.scale(2 - sq, sq);
  const R = 13 * s, cy = -R - 5 * s;
  // feet
  const step = pose === 'sneak' || pose === 'flee' ? Math.sin(t * (pose === 'flee' ? 16 : 6)) : 0;
  for (const [fx, ph] of [[-5, 1], [5, -1]] as const) {
    ellipse(ctx, fx * s + step * ph * 3 * s, -2.5 * s - Math.max(0, step * ph) * 3 * s, 4.5 * s, 3 * s);
    ctx.fillStyle = '#b8231d'; ctx.fill(); inkStroke(ctx, s, 2);
  }
  // tail with arrow tip
  const tw = Math.sin(t * 5) * 4 * s;
  ctx.beginPath(); ctx.moveTo(-R * 0.8, cy + 6 * s);
  ctx.bezierCurveTo(-R * 1.6, cy + 10 * s, -R * 2, cy - 2 * s + tw, -R * 1.7, cy - 9 * s + tw);
  ctx.lineWidth = 2.6 * s; ctx.strokeStyle = INK; ctx.stroke();
  ctx.save(); ctx.translate(-R * 1.7, cy - 9 * s + tw); ctx.rotate(-0.5);
  ctx.beginPath(); ctx.moveTo(0, -5 * s); ctx.lineTo(4 * s, 2 * s); ctx.lineTo(-4 * s, 2 * s); ctx.closePath();
  ctx.fillStyle = PALETTE.red; ctx.fill(); inkStroke(ctx, s, 2); ctx.restore();
  // horns
  for (const hx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hx * 5 * s, cy - R * 0.8);
    ctx.quadraticCurveTo(hx * 9 * s, cy - R * 1.5, hx * 11 * s, cy - R * 1.55);
    ctx.quadraticCurveTo(hx * 10 * s, cy - R * 1.1, hx * 10 * s, cy - R * 0.6);
    ctx.closePath();
    ctx.fillStyle = '#fff3d6'; ctx.fill(); inkStroke(ctx, s, 2);
  }
  // body
  circle(ctx, 0, cy, R);
  const g = ctx.createRadialGradient(-R * 0.4, cy - R * 0.5, 2 * s, 0, cy, R * 1.1);
  g.addColorStop(0, '#ff8a7a'); g.addColorStop(0.55, PALETTE.red); g.addColorStop(1, PALETTE.redInk);
  ctx.fillStyle = g; ctx.fill(); inkStroke(ctx, s);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ellipse(ctx, -R * 0.45, cy - R * 0.55, 3.2 * s, 2 * s, -0.6); ctx.fill();
  // arms
  const armUp = pose === 'strike' || pose === 'taunt';
  for (const side of [-1, 1]) {
    const ex = side * (R + 5 * s) + (pose === 'strike' && side > 0 ? 5 * s : 0);
    const ey = armUp ? cy - (side > 0 ? 9 : (pose === 'taunt' ? 9 : 2)) * s + Math.sin(t * 14 + side) * 2 * s : cy + 7 * s;
    ctx.beginPath(); ctx.moveTo(side * R * 0.85, cy + 2 * s); ctx.quadraticCurveTo(side * (R + 4 * s), cy, ex, ey);
    ctx.lineWidth = 2.6 * s; ctx.strokeStyle = INK; ctx.stroke();
    circle(ctx, ex, ey, 3 * s); ctx.fillStyle = PALETTE.red; ctx.fill(); inkStroke(ctx, s, 1.8);
  }
  // sunglasses (pushed up when striking — eyes glint)
  const fy = cy - 1 * s;
  if (pose === 'flee') {
    // panicked eyes, shades flung
    for (const ex of [-4.5, 4.5]) {
      ellipse(ctx, ex * s + 2 * s, fy, 3.2 * s, 3.8 * s); ctx.fillStyle = '#fff'; ctx.fill(); inkStroke(ctx, s, 1.5);
      circle(ctx, ex * s + 3 * s, fy, 1.3 * s); ctx.fillStyle = INK; ctx.fill();
    }
    sweat(ctx, -R * 0.8, cy - R * 0.6, s);
  } else {
    ctx.fillStyle = INK;
    roundRect(ctx, -9 * s + 2 * s, fy - 3.5 * s, 7.5 * s, 6 * s, 2.5 * s); ctx.fill();
    roundRect(ctx, 1.5 * s + 2 * s, fy - 3.5 * s, 7.5 * s, 6 * s, 2.5 * s); ctx.fill();
    ctx.fillRect(-2 * s + 2 * s, fy - 2.5 * s, 4 * s, 1.5 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-7 * s + 2 * s, fy - 2.2 * s, 2 * s, 1.2 * s);
    ctx.fillRect(3.5 * s + 2 * s, fy - 2.2 * s, 2 * s, 1.2 * s);
  }
  // cheeky grin with a fang
  ctx.beginPath();
  if (pose === 'flee') {
    ellipse(ctx, 2 * s, cy + 7 * s, 3 * s, 2.5 * s); ctx.fillStyle = INK; ctx.fill();
  } else {
    ctx.moveTo(-5 * s + 2 * s, cy + 4.5 * s);
    ctx.quadraticCurveTo(2 * s, cy + 12 * s, 9 * s, cy + 3.5 * s);
    ctx.quadraticCurveTo(2 * s, cy + 7.5 * s, -5 * s + 2 * s, cy + 4.5 * s);
    ctx.fillStyle = INK; ctx.fill(); inkStroke(ctx, s, 1.5);
    ctx.beginPath(); ctx.moveTo(4 * s, cy + 6.3 * s); ctx.lineTo(5.5 * s, cy + 8.8 * s); ctx.lineTo(6.8 * s, cy + 5.8 * s);
    ctx.fillStyle = '#fff'; ctx.fill();
    if (pose === 'taunt') { // tongue
      ellipse(ctx, 1 * s, cy + 9 * s, 2.6 * s, 2 * s); ctx.fillStyle = '#ff9ab0'; ctx.fill(); inkStroke(ctx, s, 1.2);
    }
  }
  ctx.restore();
  if (pose === 'strike') zap(ctx, x + 26 * s * dir, y - 30 * s, s, t);
}

function zap(ctx: Ctx, x: number, y: number, s: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.3 + Math.sin(t * 30) * 0.08);
  const k = 0.9 + 0.2 * Math.abs(Math.sin(t * 25));
  ctx.scale(k * s, k * s);
  ctx.beginPath();
  ctx.moveTo(-3, -12); ctx.lineTo(5, -12); ctx.lineTo(1, -3); ctx.lineTo(7, -3); ctx.lineTo(-4, 13); ctx.lineTo(-1, 1); ctx.lineTo(-7, 1); ctx.closePath();
  ctx.fillStyle = '#fff36b'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.restore();
}

// ── Phasey: purple translucent ghost with a wavy tail ────────────────────────
function phasey(ctx: Ctx, x: number, y: number, s: number, pose: GremlinPose, t: number) {
  let dir = 1, float = 8 + Math.sin(t * 2.5) * 3, alpha = 0.78, lean = 0, sc = 1;
  if (pose === 'sneak') { alpha = 0.35 + 0.15 * Math.sin(t * 3); lean = -0.1; }
  if (pose === 'strike') { lean = 0.2; sc = 1.1 + 0.05 * Math.sin(t * 18); alpha = 0.88; }
  if (pose === 'flee') { dir = -1; lean = -0.25; float += 4; alpha = 0.6; }
  if (pose === 'taunt') { sc = 1 + 0.05 * Math.sin(t * 8); float += Math.sin(t * 6) * 3; }
  groundShadow(ctx, x, y, 13 * s, 5 * s, 0.18);
  ctx.save();
  ctx.translate(x, y - float * s);
  if (pose === 'flee') speedLines(ctx, s, dir, -16 * s, t);
  ctx.scale(dir * sc, sc);
  ctx.rotate(lean);
  const R = 14 * s, cy = -24 * s;
  // glow aura
  const ag = ctx.createRadialGradient(0, cy, 4 * s, 0, cy, 32 * s);
  ag.addColorStop(0, `rgba(176,77,255,${0.35 * alpha})`); ag.addColorStop(1, 'rgba(176,77,255,0)');
  ctx.fillStyle = ag; circle(ctx, 0, cy, 32 * s); ctx.fill();
  // body: dome + wavy tail
  ctx.beginPath();
  ctx.moveTo(-R, cy);
  ctx.arc(0, cy, R, Math.PI, 0);
  const n = 4, bottom = cy + 18 * s;
  ctx.lineTo(R, bottom - 4 * s);
  for (let i = 0; i < n; i++) {
    const x0 = R - (i * 2 * R) / n, x1 = R - ((i + 1) * 2 * R) / n;
    const wv = Math.sin(t * 6 + i * 1.7) * 3 * s;
    ctx.quadraticCurveTo((x0 + x1) / 2, bottom + 6 * s + wv - (i === n - 1 ? 0 : 0), x1, bottom - 4 * s + (i % 2 ? 0 : -1) * s);
  }
  // curly tail flick
  ctx.closePath();
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(0, cy - R, 0, bottom + 6 * s);
  g.addColorStop(0, '#e2c2ff'); g.addColorStop(0.5, PALETTE.phasey); g.addColorStop(1, 'rgba(176,77,255,0.25)');
  ctx.fillStyle = g; ctx.fill();
  ctx.globalAlpha = Math.min(1, alpha + 0.2);
  inkStroke(ctx, s);
  // wisp
  ctx.beginPath();
  ctx.moveTo(-R * 0.3, bottom + 2 * s);
  ctx.bezierCurveTo(-R * 0.6, bottom + 14 * s, R * 0.6, bottom + 10 * s + Math.sin(t * 5) * 3 * s, R * 0.1, bottom + 18 * s);
  ctx.lineWidth = 2 * s; ctx.strokeStyle = 'rgba(176,77,255,0.6)'; ctx.stroke();
  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ellipse(ctx, -R * 0.45, cy - R * 0.55, 3.4 * s, 2 * s, -0.6); ctx.fill();
  // arms (little nubs)
  const wave = pose === 'taunt' || pose === 'strike' ? Math.sin(t * 12) * 4 * s : 0;
  for (const side of [-1, 1]) {
    ellipse(ctx, side * (R + 2 * s), cy + 5 * s - (side > 0 ? wave + (pose === 'strike' ? 6 * s : 0) : 0), 4 * s, 3 * s, side * 0.5);
    ctx.fillStyle = '#c98bff'; ctx.fill(); inkStroke(ctx, s, 1.8);
  }
  // face
  ctx.fillStyle = INK;
  const ey = cy - 1 * s;
  if (pose === 'flee') {
    for (const ex of [-5, 5]) { ellipse(ctx, ex * s, ey, 2.6 * s, 3.6 * s); ctx.fillStyle = '#fff'; ctx.fill(); inkStroke(ctx, s, 1.4); circle(ctx, ex * s + 1 * s, ey, 1.1 * s); ctx.fillStyle = INK; ctx.fill(); }
    ellipse(ctx, 0, cy + 7 * s, 2.5 * s, 3 * s); ctx.fillStyle = INK; ctx.fill();
  } else {
    // sly half-moon eyes
    for (const ex of [-5, 5]) {
      ctx.beginPath(); ctx.ellipse(ex * s, ey, 2.8 * s, 3.4 * s, 0, 0, Math.PI); ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-4 * s, cy + 5 * s); ctx.quadraticCurveTo(0, cy + (pose === 'taunt' ? 11 : 9) * s, 5 * s, cy + 4 * s);
    ctx.lineWidth = 2 * s; ctx.strokeStyle = INK; ctx.stroke();
    if (pose === 'taunt') { ellipse(ctx, 0.5 * s, cy + 8.5 * s, 2 * s, 1.6 * s); ctx.fillStyle = '#ff9ab0'; ctx.fill(); }
    ctx.fillStyle = 'rgba(255,120,200,0.5)';
    ellipse(ctx, -9 * s, cy + 3 * s, 2.8 * s, 1.6 * s); ctx.fill();
    ellipse(ctx, 9 * s, cy + 3 * s, 2.8 * s, 1.6 * s); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (pose === 'strike') {
    // phase swirl in hand
    ctx.save(); ctx.translate(R + 12 * s, cy - 4 * s);
    ctx.strokeStyle = PALETTE.phasey; ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) { const a = i * 0.45 - t * 10, r = (i / 30) * 9 * s; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}

// ── Wobbles: a jelly cube that jiggles ──────────────────────────────────────
const JELLY = '#a5e05b', JELLY_D = '#6fb52c', JELLY_L = '#d8f7a8';
function wobbles(ctx: Ctx, x: number, y: number, s: number, pose: GremlinPose, t: number) {
  let dir = 1, jig = Math.sin(t * 9) * 0.06, lift = 0, lean = 0;
  if (pose === 'sneak') { jig = Math.sin(t * 5) * 0.08; lean = -0.06; }
  if (pose === 'strike') { jig = Math.sin(t * 24) * 0.14; lift = Math.abs(Math.sin(t * 8)) * 5; }
  if (pose === 'flee') { dir = -1; jig = Math.sin(t * 18) * 0.1; lift = Math.abs(Math.sin(t * 14)) * 6; lean = -0.15; }
  if (pose === 'taunt') { jig = Math.sin(t * 12) * 0.1; lift = Math.abs(Math.sin(t * 6)) * 4; }
  groundShadow(ctx, x, y, 17 * s, 7 * s, 0.28);
  ctx.save();
  ctx.translate(x, y - lift * s);
  if (pose === 'flee') speedLines(ctx, s, dir, -10 * s, t);
  ctx.scale(dir, 1);
  ctx.rotate(lean);
  // jelly shear: top shifts sideways, squash
  const shear = jig * 1.4;
  ctx.transform(1 + jig * 0.5, 0, -shear, 1 - jig * 0.6, 0, 0);
  const W = 14 * s, D = 7 * s, H = 24 * s;
  // iso cube: front face + top + side, rounded
  ctx.globalAlpha = 0.92;
  // front
  roundRect(ctx, -W, -H, W * 2 - 4 * s, H, 6 * s);
  const g = ctx.createLinearGradient(0, -H, 0, 0);
  g.addColorStop(0, JELLY_L); g.addColorStop(1, JELLY);
  ctx.fillStyle = g; ctx.fill();
  // side
  ctx.beginPath();
  ctx.moveTo(W - 4 * s, -H + 4 * s); ctx.lineTo(W + D - 4 * s, -H - D + 6 * s); ctx.lineTo(W + D - 4 * s, -D - 1 * s); ctx.lineTo(W - 4 * s, -2 * s); ctx.closePath();
  ctx.fillStyle = JELLY_D; ctx.fill(); inkStroke(ctx, s, 2);
  // top
  ctx.beginPath();
  ctx.moveTo(-W + 4 * s, -H); ctx.lineTo(-W + D + 2 * s, -H - D); ctx.lineTo(W + D - 6 * s, -H - D); ctx.lineTo(W - 4 * s, -H); ctx.closePath();
  ctx.fillStyle = JELLY_L; ctx.fill(); inkStroke(ctx, s, 2);
  roundRect(ctx, -W, -H, W * 2 - 4 * s, H, 6 * s);
  inkStroke(ctx, s);
  ctx.globalAlpha = 1;
  // bubbles inside
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  for (let i = 0; i < 4; i++) {
    const p = (t * 0.4 + i * 0.27) % 1;
    circle(ctx, -W * 0.6 + i * 6 * s, -2 * s - p * (H - 6 * s), (1 + i % 2) * s); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  roundRect(ctx, -W + 3 * s, -H + 3 * s, 4 * s, 9 * s, 2 * s); ctx.fill();
  // face: wobbly eyes
  const ey = -H * 0.6;
  for (const ex of [-5, 4]) {
    circle(ctx, ex * s, ey, 3.6 * s); ctx.fillStyle = '#fff'; ctx.fill(); inkStroke(ctx, s, 1.5);
    const pa = t * (pose === 'strike' ? 9 : 4) + ex;
    circle(ctx, ex * s + Math.cos(pa) * 1.3 * s, ey + Math.sin(pa) * 1.3 * s, 1.5 * s); ctx.fillStyle = INK; ctx.fill();
  }
  ctx.beginPath();
  ctx.lineWidth = 2 * s; ctx.strokeStyle = INK; ctx.lineCap = 'round';
  if (pose === 'flee') { ellipse(ctx, 0, -H * 0.28, 2.6 * s, 3 * s); ctx.fillStyle = INK; ctx.fill(); }
  else {
    for (let i = 0; i <= 8; i++) {
      const px = -6 * s + i * 1.5 * s, py = -H * 0.3 + Math.sin(i * 1.2 + t * 8) * 1.4 * s;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
  if (pose === 'strike' || pose === 'taunt') {
    // wobble wave lines
    ctx.save();
    ctx.strokeStyle = JELLY_D; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      const bx = x + side * (24 + k * 6) * s, by = y - 16 * s;
      for (let i = 0; i <= 6; i++) ctx.lineTo(bx + Math.sin(i + t * 14) * 2 * s, by - 8 * s + i * 2.6 * s);
      ctx.globalAlpha = 0.8 - k * 0.3; ctx.stroke();
    }
    ctx.restore();
  }
  if (pose === 'taunt') {
    ctx.save();
    starPath(ctx, x + 16 * s, y - 40 * s + Math.sin(t * 6) * 2 * s, 4 * s, t * 2);
    ctx.fillStyle = PALETTE.sunny; ctx.fill(); inkStroke(ctx, s, 1.3);
    ctx.restore();
  }
}
