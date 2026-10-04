// 2. TITLE-LETTER COLLAPSE (the peek). A frame-filling, UI-free version of the game's title screen: the
// NO PEEKING! letter-Qubbles dream (swirls); the cursor sweeps in and each hovered letter collapses on its
// hit frame (pop, recolour to Sunny/Moony, collapse burst), exactly like the real title. Modes:
//   hits = [f…] per letter (null = never peeked) → e.g. one letter at the peek, or all on 8th notes.
//   shatterAt = frame → the frame freezes and breaks into Sunny/Moony shards (the single shatter use).
import { type Scene, type Ctx, W, H, FPS, PAL, clamp, lerp, ease, prog, hash1 } from '../lib/core';
import { drawBg, prepareBg, type BgKind } from '../lib/bg';
import { drawParticles, collapseBurst, grain, type Particle } from '../lib/fx';
import { drawUnit } from '../lib/units';
import { layer } from '../lib/layers';
import { shatterFrame } from '../lib/shatter';

export interface TitleParams {
  frames: number; bg: BgKind; bgImage?: string;
  /** Hit frame per letter (10 letters, N O P E E K I N G !), null = not peeked. */
  hits: (number | null)[];
  /** Collapse outcome per letter: '0' Sunny, '1' Moony. */
  outcomes: string;
  cursor: boolean;
  shatterAt: number | null; shatterDur: number; shatterTail: number;
  zoom: number; grain: number;
  /** Push in on one letter (index) so the peek fills the frame: zoom reaches focusZoom at its hit. */
  focus: number | null; focusZoom: number;
}
const LETTERS = 'NOPEEKING!'.split('');
const SLOTS = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10];
function geo() {
  const slotW = (W - 120) / 11;
  const S = slotW / 78 * 1.1;
  const x0 = W / 2 - (slotW * 11) / 2 + slotW / 2;
  return { S, xs: SLOTS.map((s) => x0 + s * slotW), gy: (i: number) => H * 0.6 + Math.sin(i * 1.3) * slotW * 0.08 };
}
const cache = new Map<string, Particle[]>();
const cached = (k: string, mk: () => Particle[]) => { let v = cache.get(k); if (!v) { v = mk(); cache.set(k, v); } return v; };

function cursorPos(f: number, p: TitleParams) {
  const { xs, gy, S } = geo();
  const keys: { f: number; x: number; y: number }[] = [{ f: 0, x: W * 0.12, y: H * 0.95 }];
  p.hits.forEach((h, i) => { if (h != null) keys.push({ f: h, x: xs[i], y: gy(i) - 40 * S }); });
  keys.sort((a, b) => a.f - b.f);
  const last = keys[keys.length - 1];
  keys.push({ f: last.f + 60, x: last.x + 140, y: last.y + 80 });
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (f <= b.f) {
      const k = ease.inOutCubic(prog(f, a.f, b.f));
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) - Math.sin(k * Math.PI) * 30 };
    }
  }
  return last;
}
function drawCursor(ctx: Ctx, x: number, y: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1.6, 1.6);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 26); ctx.lineTo(7, 20); ctx.lineTo(12, 31); ctx.lineTo(17, 29); ctx.lineTo(12, 18); ctx.lineTo(21, 18); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.restore();
}

function camera(f: number, p: TitleParams) {
  const base = { x: W / 2, y: H / 2, z: 1 + (p.zoom - 1) * (f / p.frames) };
  if (p.focus == null) return base;
  const { xs, gy, S } = geo();
  const hit = p.hits[p.focus] ?? p.frames;
  const k = ease.inOutCubic(prog(f, 0, hit));
  return { x: lerp(W / 2, xs[p.focus], k), y: lerp(H / 2, gy(p.focus) - 40 * S, k), z: lerp(1, p.focusZoom, k) };
}
export function toScreen(f: number, p: TitleParams, x: number, y: number) {
  const c = camera(f, p);
  return { x: W / 2 + (x - c.x) * c.z, y: H / 2 + (y - c.y) * c.z };
}

function drawTitle(ctx: Ctx, f: number, p: TitleParams) {
  const t = 4 + f / FPS;
  const { S, xs, gy } = geo();
  drawBg(ctx, f, { bg: p.bg, bgImage: p.bgImage, push: 0.02 }, p.frames);
  ctx.save();
  const cam = camera(f, p);
  ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
  LETTERS.forEach((ch, i) => {
    const h = p.hits[i];
    const col = h != null && f >= h ? (p.outcomes[i] === '1' ? 1 : 0) : null;
    const u = h != null ? f - h : -1;
    const pop = col != null ? ease.outBack(clamp(u / 24), 2.2) : 1;
    const bob = Math.sin(t * 2 + i * 0.7) * 3 * S;
    const y = gy(i) + bob;
    const state = col == null ? 'sleep' : u < 90 ? 'awake-grumpy' : 'collapsed';
    drawUnit(ctx, xs[i], y, S, ch, { t, phase: i * 0.7, collapsed: col, state, sx: pop, sy: pop });
    if (col != null) drawParticles(ctx, cached(`c${i}`, () => collapseBurst(xs[i], gy(i) - 35 * S, 900 + i * 7, 1.3)), f, h!);
  });
  ctx.restore();
  if (p.cursor) { const c0 = cursorPos(f, p); const c = toScreen(f, p, c0.x, c0.y); drawCursor(ctx, c.x, c.y); }
  if (p.grain > 0 && p.bg !== 'none') grain(ctx, f, p.grain);
}

export const titlecollapse: Scene<TitleParams> = {
  resolve: (p) => ({
    frames: 150, bg: 'day', hits: [null, null, null, null, null, null, null, null, null, null], outcomes: '0110100110',
    cursor: true, focus: null, focusZoom: 1.8, shatterAt: null, shatterDur: 13, shatterTail: 7, zoom: 1.04, grain: 0.035, ...p,
  }),
  frames: (p) => (p.shatterAt != null ? Math.max(p.frames, p.shatterAt + p.shatterDur + p.shatterTail) : p.frames),
  markers: (p) => ({ hits: p.hits.filter((h): h is number => h != null), ...(p.shatterAt != null ? { impact: p.shatterAt, flash: [p.shatterAt, p.shatterAt + 1] } : {}) }),
  prepare: async (p) => { await prepareBg({ bg: p.bg, bgImage: p.bgImage }); },
  render(ctx, f, p) {
    if (p.shatterAt != null && f >= p.shatterAt) {
      const L = layer(ctx, 'frozen');
      drawTitle(L.g, p.shatterAt + 5, p); // frozen on the collapse pop (the hit letter already collapsed)
      const hitIdx = p.hits.findIndex((h) => h === p.shatterAt || (h != null && h <= p.shatterAt && h > p.shatterAt - 30));
      const { xs, gy, S } = geo();
      const sc = toScreen(p.shatterAt + 5, p, hitIdx >= 0 ? xs[hitIdx] : W / 2, hitIdx >= 0 ? gy(hitIdx) - 30 * S : H / 2);
      const cx = Math.round(sc.x), cy = Math.round(sc.y);
      shatterFrame(ctx, L.c, f - p.shatterAt, { cx, cy, dur: p.shatterDur, flash: 2, seed: 9, black: p.bg !== 'none' });
      return;
    }
    drawTitle(ctx, f, p);
  },
};
export { hash1 };
