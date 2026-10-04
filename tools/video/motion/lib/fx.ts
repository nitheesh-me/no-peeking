// Deterministic particles (closed form: each particle's state is computed from its age, so frames can be
// rendered in any order), film grain, vignette and flash helpers.
import { type Ctx, TAU, FPS, rng, PAL, clamp, W, H, hash1 } from './core';

export type Shape = 'spark' | 'dot' | 'ring' | 'shard' | 'puff' | 'star' | 'confetti' | 'zap' | 'swirl';
export interface Particle {
  shape: Shape; x: number; y: number; vx: number; vy: number; g: number; drag: number;
  life: number; size: number; rot: number; vr: number; color: string; delay?: number; grow?: number;
}

function posAt(p: Particle, a: number) {
  const k = Math.max(1e-4, p.drag);
  const e = (1 - Math.exp(-k * a)) / k;
  return { x: p.x + p.vx * e, y: p.y + p.vy * e + p.g * (a / k - e / k), vx: p.vx * Math.exp(-k * a), vy: p.vy * Math.exp(-k * a) + p.g * e };
}

/** Draw a particle list spawned at frame `at`, at frame f. Units: px and seconds. */
export function drawParticles(ctx: Ctx, list: Particle[], f: number, at: number) {
  for (const p of list) {
    const a = (f - at) / FPS - (p.delay ?? 0);
    if (a < 0 || a > p.life) continue;
    const u = a / p.life;
    const { x, y, vx, vy } = posAt(p, a);
    const fade = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
    ctx.save();
    ctx.globalAlpha *= fade;
    ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
    const rot = p.rot + p.vr * a;
    switch (p.shape) {
      case 'spark': {
        const sp = Math.hypot(vx, vy);
        const len = Math.min(40, p.size * 1.2 + sp * 0.035);
        const ang = Math.atan2(vy, vx);
        ctx.lineCap = 'round'; ctx.lineWidth = p.size * (1 - u * 0.6);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len); ctx.stroke();
        break;
      }
      case 'dot':
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.3, p.size * (1 - u * 0.5)), 0, TAU); ctx.fill(); break;
      case 'ring': {
        const r = p.size * (0.3 + 1.2 * (1 - Math.pow(1 - u, 3)));
        ctx.lineWidth = Math.max(0.5, (p.grow ?? 6) * (1 - u));
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); break;
      }
      case 'shard': {
        ctx.translate(x, y); ctx.rotate(rot);
        const s = p.size;
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.55, s * 0.4); ctx.lineTo(-s * 0.5, s * 0.6); ctx.closePath();
        ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = PAL.ink; ctx.stroke(); break;
      }
      case 'puff': {
        const r = p.size * (0.6 + u * 1.2);
        ctx.globalAlpha *= 0.85 * (1 - u);
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); break;
      }
      case 'star': {
        ctx.translate(x, y); ctx.rotate(rot);
        const s = p.size * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) * 0.5);
        star4(ctx, 0, 0, s); ctx.fill(); break;
      }
      case 'confetti': {
        ctx.translate(x, y); ctx.rotate(rot);
        ctx.scale(1, Math.cos(a * 9 + p.vr));
        ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9); break;
      }
      case 'zap': {
        ctx.translate(x, y); ctx.rotate(rot);
        const s = p.size;
        ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.3, -s * 0.1); ctx.lineTo(-s * 0.2, s * 0.1); ctx.lineTo(0, s); ctx.stroke(); break;
      }
      case 'swirl': {
        ctx.translate(x, y); ctx.rotate(rot);
        ctx.lineWidth = 3 * (1 - u); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, p.size * (0.6 + u), 0, 1.6); ctx.stroke(); break;
      }
    }
    ctx.restore();
  }
}

export function star4(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * 0.32 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** The game's collapse pop (white ring, red ring, Sunny/Moony/white shards, puffs), seeded. */
export function collapseBurst(x: number, y: number, seed: number, scale = 1, colors: string[] = [PAL.sunny, PAL.moony, '#ffffff']): Particle[] {
  const R = rng(seed);
  const out: Particle[] = [];
  out.push({ shape: 'ring', x, y, vx: 0, vy: 0, g: 0, drag: 1, life: 0.42, size: 46 * scale, rot: 0, vr: 0, color: '#ffffff', grow: 7 * scale });
  out.push({ shape: 'ring', x, y, vx: 0, vy: 0, g: 0, drag: 1, life: 0.6, size: 72 * scale, rot: 0, vr: 0, color: PAL.red, grow: 5 * scale });
  for (let i = 0; i < 16; i++) {
    const a = R() * TAU, sp = (160 + R() * 260) * scale;
    out.push({ shape: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90 * scale, g: 620 * scale, drag: 1.6, life: 0.7 + R() * 0.45, size: (5 + R() * 6) * scale, rot: R() * TAU, vr: (R() - 0.5) * 16, color: colors[i % colors.length] });
  }
  for (let i = 0; i < 6; i++) out.push({ shape: 'puff', x: x + (R() - 0.5) * 36 * scale, y: y + (R() - 0.5) * 18 * scale, vx: 0, vy: -36 * scale, g: 0, drag: 1, life: 0.75, size: (9 + R() * 9) * scale, rot: 0, vr: 0, color: '#ffffff' });
  return out;
}

export function sparkBurst(x: number, y: number, seed: number, scale = 1, n = 12, colors: string[] = [PAL.sunny, '#fff3b0']): Particle[] {
  const R = rng(seed);
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.4, sp = (140 + R() * 180) * scale;
    out.push({ shape: i % 3 ? 'spark' : 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40 * scale, g: 300 * scale, drag: 2.8, life: 0.5 + R() * 0.3, size: (3 + R() * 3) * scale, rot: 0, vr: 0, color: colors[i % colors.length] });
  }
  return out;
}

export function confetti(x0: number, x1: number, y: number, seed: number, n = 90): Particle[] {
  const R = rng(seed);
  const cols = [PAL.sunny, PAL.moony, PAL.red, PAL.mint, PAL.phasey, '#ffffff'];
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0);
    out.push({ shape: i % 5 === 0 ? 'star' : 'confetti', x, y: y + R() * 60, vx: (R() - 0.5) * 520, vy: -(380 + R() * 620), g: 900, drag: 1.8, life: 1.6 + R() * 1.2, size: 6 + R() * 7, rot: R() * TAU, vr: (R() - 0.5) * 12, color: cols[i % cols.length], delay: R() * 0.12 });
  }
  return out;
}

// ── film grain: four seeded noise tiles, offset per frame ──
let grainTiles: HTMLCanvasElement[] | null = null;
function tiles() {
  if (grainTiles) return grainTiles;
  grainTiles = [];
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const id = g.createImageData(256, 256);
    const R = rng(1234 + k * 77);
    for (let i = 0; i < 256 * 256; i++) {
      const v = (R() + R() + R()) / 3 * 255;
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    grainTiles.push(c);
  }
  return grainTiles;
}
/** Subtle luma grain (also dithers the night gradients so they survive 8-bit yuv420p). Draw in device px. */
export function grain(ctx: Ctx, f: number, amount = 0.05) {
  const t = tiles()[f & 3];
  const ox = Math.floor(hash1(f * 31 + 1) * 256), oy = Math.floor(hash1(f * 17 + 9) * 256);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amount;
  const pat = ctx.createPattern(t, 'repeat')!;
  pat.setTransform(new DOMMatrix().translate(-ox, -oy));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
}

export function vignette(ctx: Ctx, strength = 0.35, color = '14,14,30') {
  const v = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.38, W / 2, H * 0.5, Math.hypot(W, H) * 0.6);
  v.addColorStop(0, `rgba(${color},0)`);
  v.addColorStop(1, `rgba(${color},${strength})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

export function flash(ctx: Ctx, a: number, color = '#ffffff') {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = clamp(a); ctx.fillStyle = color; ctx.fillRect(-50, -50, W + 100, H + 100); ctx.restore();
}
