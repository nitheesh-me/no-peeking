// Shared maths for the motion pieces. Everything here is a pure function of its inputs:
// no clocks, no Math.random. Scenes are drawn as f(frame), so any frame can be rendered in any order.
export const FPS = 60;
/** Logical canvas size. The renderer scales this ×2 to 3840×2160. */
export const W = 1920, H = 1080;
export const TAU = Math.PI * 2;

export type Ctx = CanvasRenderingContext2D;

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Normalised progress of frame f through [a, b]. */
export const prog = (f: number, a: number, b: number) => (b === a ? (f >= b ? 1 : 0) : clamp((f - a) / (b - a)));
export const smooth = (t: number) => t * t * (3 - 2 * t);

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outBack: (t: number, k = 1.70158) => 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2),
  inBack: (t: number, k = 1.70158) => (k + 1) * t * t * t - k * t * t,
  outElastic: (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
};

/** Damped oscillation that starts at amplitude 1 at frame 0 and decays: for squash/stretch wobbles. */
export function wobble(frames: number, freq = 0.09, decay = 0.11) {
  if (frames < 0) return 0;
  return Math.exp(-decay * frames) * Math.cos(TAU * freq * frames);
}

/** Deterministic integer hash → [0,1). */
export function hash1(n: number): number {
  let t = (n | 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** Seeded generator (mulberry32). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PAL = {
  paper: '#f2f0eb', paper2: '#e8e5de', ink: '#0e0e0e', ink2: '#55524b', ink3: '#8a867d',
  red: '#fe443d', redInk: '#c8241e', sunny: '#ffb72b', moony: '#6c63ff', phasey: '#b04dff',
  mint: '#3ddc97', night: '#1a1a2e', spin: '#3fb6ff', peek: '#ff7ab8', reset: '#9aa3b5', note: '#fff6c9',
} as const;

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(h: string, a: number) {
  const [r, g, b] = hexRgb(h);
  return `rgba(${r},${g},${b},${a})`;
}

/** Scene contract. `render` must draw frame f (0-based) from scratch, depending only on f and params. */
export interface Scene<P = any> {
  /** Fill in defaults; returns the resolved params (written to the metadata). */
  resolve(p: Partial<P>): P;
  frames(p: P): number;
  /** Named frames (impact, hits, …) for the metadata JSON. */
  markers?(p: P): Record<string, number | number[]>;
  /** Called once before rendering (load images, build caches). */
  prepare?(p: P): Promise<void>;
  render(ctx: Ctx, f: number, p: P): void;
}

/** Camera shake: deterministic, decaying from `at`. */
export function shake(f: number, at: number, amp: number, dur = 18, seed = 7) {
  const u = f - at;
  if (u < 0 || u > dur) return { x: 0, y: 0 };
  const k = Math.pow(1 - u / dur, 2) * amp;
  return { x: (hash1(seed * 977 + u * 13) - 0.5) * 2 * k, y: (hash1(seed * 613 + u * 29 + 5) - 0.5) * 2 * k };
}

/** Runtime: device pixels per logical px (2 at 4K). ctx.shadowBlur ignores the transform, so scale by this. */
export const RT = { dpr: 2 };
