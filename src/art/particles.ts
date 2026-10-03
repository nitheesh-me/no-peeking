// Juice particles. burst() spawns, drawParticles(ctx, t) advances (dt from t) and draws. Screen px.
import { PALETTE } from '../core/contracts';
import { type Ctx, TAU, INK, circle, ellipse, starPath } from './util';

export type BurstKind = 'highfive' | 'collapse' | 'flip' | 'phase' | 'wobble' | 'win' | 'reset';
type Shape = 'spark' | 'ring' | 'shard' | 'zap' | 'swirl' | 'ripple' | 'confetti' | 'puff' | 'dot';
interface Pt {
  shape: Shape; x: number; y: number; vx: number; vy: number; g: number; drag: number;
  age: number; life: number; size: number; rot: number; vr: number; color: string; ox: number; oy: number;
}
const pool: Pt[] = [];
const MAX = 600;
let lastT: number | null = null;
const R = Math.random;

function add(p: Partial<Pt> & { shape: Shape; x: number; y: number }) {
  if (pool.length >= MAX) pool.shift();
  pool.push({ vx: 0, vy: 0, g: 0, drag: 0, age: 0, life: 1, size: 4, rot: 0, vr: 0, color: '#fff', ox: p.x, oy: p.y, ...p });
}

export function burst(kind: BurstKind, x: number, y: number) {
  switch (kind) {
    case 'highfive':
      add({ shape: 'ring', x, y, life: 0.45, size: 26, color: PALETTE.sunny });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + R() * 0.3, sp = 120 + R() * 140;
        add({ shape: i % 3 ? 'spark' : 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 260, drag: 2.5, life: 0.5 + R() * 0.3, size: 4 + R() * 3, vr: (R() - 0.5) * 10, color: i % 2 ? PALETTE.sunny : '#fff3b0' });
      }
      break;
    case 'collapse':
      add({ shape: 'ring', x, y, life: 0.5, size: 50, color: '#ffffff' });
      add({ shape: 'ring', x, y, life: 0.75, size: 80, color: PALETTE.red });
      for (let i = 0; i < 14; i++) {
        const a = R() * TAU, sp = 140 + R() * 200;
        add({ shape: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, g: 500, drag: 1.5, life: 0.7 + R() * 0.4, size: 5 + R() * 5, rot: R() * TAU, vr: (R() - 0.5) * 16, color: [PALETTE.sunny, PALETTE.moony, '#ffffff'][i % 3] });
      }
      for (let i = 0; i < 6; i++) add({ shape: 'puff', x: x + (R() - 0.5) * 30, y: y + (R() - 0.5) * 16, vy: -30, drag: 1, life: 0.8, size: 8 + R() * 8, color: '#ffffff' });
      break;
    case 'flip':
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 0.7;
        add({ shape: 'zap', x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, drag: 4, life: 0.45, size: 12 + R() * 4, rot: a + Math.PI / 2, color: PALETTE.red });
      }
      for (let i = 0; i < 10; i++) {
        const a = R() * TAU, sp = 80 + R() * 120;
        add({ shape: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 200, drag: 3, life: 0.5, size: 3 + R() * 3, color: i % 2 ? PALETTE.red : '#fff36b' });
      }
      add({ shape: 'ring', x, y, life: 0.35, size: 34, color: PALETTE.red });
      break;
    case 'phase':
      for (let i = 0; i < 18; i++) {
        add({ shape: 'swirl', x, y, life: 1.1, size: 10 + i * 1.6, rot: (i / 18) * TAU, vr: 5, color: i % 2 ? PALETTE.phasey : '#e2c2ff' });
      }
      add({ shape: 'ring', x, y, life: 0.7, size: 40, color: PALETTE.phasey });
      break;
    case 'wobble':
      for (let i = 0; i < 3; i++) add({ shape: 'ripple', x, y, life: 0.9, age: -i * 0.15, size: 40 + i * 10, color: '#a5e05b' });
      for (let i = 0; i < 8; i++) {
        const a = R() * TAU;
        add({ shape: 'dot', x, y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 40 - 60, g: 220, drag: 1, life: 0.7, size: 3 + R() * 3, color: '#a5e05b' });
      }
      break;
    case 'win':
      for (let i = 0; i < 90; i++) {
        const a = -Math.PI / 2 + (R() - 0.5) * 2.2, sp = 260 + R() * 380;
        add({ shape: i % 7 ? 'confetti' : 'spark', x: x + (R() - 0.5) * 40, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 520, drag: 1.8, life: 1.6 + R() * 1.2, size: 5 + R() * 4, rot: R() * TAU, vr: (R() - 0.5) * 18, color: [PALETTE.red, PALETTE.sunny, PALETTE.moony, PALETTE.mint, PALETTE.phasey, '#ff8fb1'][i % 6] });
      }
      break;
    case 'reset':
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        add({ shape: 'puff', x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 4, vx: Math.cos(a) * 50, vy: Math.sin(a) * 25 - 20, drag: 2.5, life: 0.7, size: 6 + R() * 5, color: '#ffffff' });
      }
      add({ shape: 'ring', x, y, life: 0.4, size: 28, color: '#7fc8f8' });
      break;
  }
}

export function clearParticles() { pool.length = 0; }
export function particleCount() { return pool.length; }

export function drawParticles(ctx: Ctx, t: number) {
  const dt = lastT === null ? 0 : Math.max(0, Math.min(0.05, t - lastT));
  lastT = t;
  if (!pool.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let w = 0;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    p.age += dt;
    if (p.age >= p.life) continue;
    pool[w++] = p;
    if (p.age < 0) continue;
    const k = Math.exp(-p.drag * dt);
    p.vx *= k; p.vy = p.vy * k + p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const u = p.age / p.life;
    const fade = 1 - u * u;
    ctx.globalAlpha = Math.max(0, fade);
    switch (p.shape) {
      case 'spark':
        starPath(ctx, p.x, p.y, p.size * (1 - u * 0.5), p.rot, 0.45, 4);
        ctx.fillStyle = p.color; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke();
        break;
      case 'dot':
        circle(ctx, p.x, p.y, p.size * (1 - u * 0.6)); ctx.fillStyle = p.color; ctx.fill();
        break;
      case 'ring':
        ctx.globalAlpha = 1 - u;
        ellipse(ctx, p.x, p.y, p.size * (0.3 + u), p.size * (0.3 + u) * 0.55);
        ctx.lineWidth = 4 * (1 - u) + 0.5; ctx.strokeStyle = p.color; ctx.stroke();
        break;
      case 'shard':
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.6, p.size * 0.5); ctx.lineTo(-p.size * 0.5, p.size * 0.4); ctx.closePath();
        ctx.fillStyle = p.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
        ctx.restore();
        break;
      case 'zap': {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        const z = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -z); ctx.lineTo(z * 0.35, -z * 0.2); ctx.lineTo(-z * 0.1, 0); ctx.lineTo(z * 0.25, z);
        ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
        ctx.lineWidth = 2.5; ctx.strokeStyle = p.color; ctx.stroke();
        ctx.restore();
        break;
      }
      case 'swirl': {
        const a = p.rot + u * p.vr;
        const r = p.size * (0.4 + u * 1.2);
        const px = p.ox + Math.cos(a) * r, py = p.oy + Math.sin(a) * r * 0.6 - u * 20;
        circle(ctx, px, py, 2.6 * (1 - u) + 0.8); ctx.fillStyle = p.color; ctx.fill();
        break;
      }
      case 'ripple': {
        const wob = Math.sin(u * 30) * 3 * (1 - u);
        ellipse(ctx, p.x, p.y, p.size * u + wob, (p.size * u - wob) * 0.5);
        ctx.lineWidth = 3 * (1 - u) + 0.5; ctx.strokeStyle = p.color; ctx.stroke();
        break;
      }
      case 'confetti':
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.rot * 1.7));
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        ctx.restore();
        if (p.vy > 60) { p.vy = 60; p.vx += Math.sin(t * 6 + p.size) * 4; }
        break;
      case 'puff':
        circle(ctx, p.x, p.y, p.size * (0.6 + u * 0.8)); ctx.fillStyle = p.color; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(14,14,14,0.35)'; ctx.stroke();
        break;
    }
  }
  pool.length = w;
  ctx.restore();
}
