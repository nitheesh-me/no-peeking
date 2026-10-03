// Shared drawing helpers for the NO PEEKING! art kit. Pure Canvas2D, no allocations in hot paths where avoidable.
import { PALETTE } from '../core/contracts';

export type Ctx = CanvasRenderingContext2D;
export type RGB = [number, number, number];

export const TAU = Math.PI * 2;
export const INK = PALETTE.ink;
/** Outline weight at s=1 (CSS px). */
export const LINE = 2.5;

const hexCache = new Map<string, RGB>();
export function hex(h: string): RGB {
  let c = hexCache.get(h);
  if (!c) {
    const n = parseInt(h.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache.set(h, c);
  }
  return c;
}
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function rgba(c: RGB, a = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
export const lighten = (c: RGB, t: number): RGB => mix(c, [255, 255, 255], t);
export const darken = (c: RGB, t: number): RGB => mix(c, [20, 16, 30], t);
/** Pull a colour toward its own luminance grey by t (0 = untouched, 1 = fully grey). */
export function desat(c: RGB, t: number): RGB {
  const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return mix(c, [l, l, l], t);
}
export function hsl(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Deterministic hash → [0,1). */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}
export function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
}
export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function inkStroke(ctx: Ctx, s: number, w = LINE, color: string = INK) {
  ctx.lineWidth = w * s;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}
export function fillInk(ctx: Ctx, fill: string | CanvasGradient, s: number, w = LINE) {
  ctx.fillStyle = fill;
  ctx.fill();
  inkStroke(ctx, s, w);
}
/** Soft contact shadow on the floor. */
export function groundShadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.22) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(14,14,30,${a})`);
  g.addColorStop(0.65, `rgba(14,14,30,${a * 0.6})`);
  g.addColorStop(1, 'rgba(14,14,30,0)');
  ctx.fillStyle = g;
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.translate(-x, -y);
  ctx.fill();
  ctx.restore();
}
/** Five-point star path. */
export function starPath(ctx: Ctx, x: number, y: number, r: number, rot = 0, inner = 0.45, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + (i * Math.PI) / points - Math.PI / 2;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
/** Little "Z" letters drifting up (sleep). */
export function zzz(ctx: Ctx, x: number, y: number, s: number, t: number, color: string = INK, alpha = 1) {
  ctx.save();
  ctx.lineWidth = 1.8 * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.45 + i / 3) % 1;
    const a = Math.sin(p * Math.PI) * alpha;
    const zx = x + p * 14 * s + Math.sin(p * 6 + i) * 3 * s;
    const zy = y - p * 26 * s;
    const z = (4 + p * 5) * s;
    ctx.globalAlpha = a;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(zx - z / 2, zy - z / 2);
    ctx.lineTo(zx + z / 2, zy - z / 2);
    ctx.lineTo(zx - z / 2, zy + z / 2);
    ctx.lineTo(zx + z / 2, zy + z / 2);
    ctx.stroke();
  }
  ctx.restore();
}
/** Small rounded name tag ('q1', 'a'). Anchor = tag center. */
export function nameTag(ctx: Ctx, x: number, y: number, s: number, text: string, bg: string = PALETTE.paper, fg: string = INK) {
  ctx.save();
  ctx.font = `700 ${10 * s}px Quicksand, sans-serif`;
  const w = Math.max(16 * s, ctx.measureText(text).width + 9 * s), h = 13 * s;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  inkStroke(ctx, s, 1.6);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5 * s);
  ctx.restore();
}
/** Blush ellipses. */
export function blush(ctx: Ctx, x: number, y: number, s: number, gap: number, a = 0.55) {
  ctx.fillStyle = `rgba(255,110,130,${a})`;
  ellipse(ctx, x - gap, y, 3.6 * s, 2.1 * s);
  ctx.fill();
  ellipse(ctx, x + gap, y, 3.6 * s, 2.1 * s);
  ctx.fill();
}
/** Question mark bubble. */
export function questionMark(ctx: Ctx, x: number, y: number, s: number, t: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 5) * 2 * s);
  ctx.rotate(Math.sin(t * 3) * 0.15);
  ctx.font = `700 ${18 * s}px Quicksand, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.strokeText('?', 0, 0);
  ctx.fillStyle = PALETTE.paper;
  ctx.fillText('?', 0, 0);
  ctx.restore();
}
/** Per-frame scene state shared across art modules (set by drawRoom/drawFloor; read by signs and beds). */
export const sceneState = { night: 0 };
