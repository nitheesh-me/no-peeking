// Backgrounds set inside the game world: the game's own sky (night with the sleeping moon and drifting
// clouds, or the soft day sky of the title screen), a paper notebook page, or a blurred gameplay still.
import art from '../../../../src/art';
import { type Ctx, W, H, FPS, rng, PAL, clamp } from './core';
import { vignette } from './fx';

export type BgKind = 'night' | 'day' | 'dusk' | 'notebook' | 'image' | 'black' | 'none';

/** Sky with a slow push-in (zoom 1 → 1+push over the clip) so cards are never static. */
export function sky(ctx: Ctx, f: number, night: number, push = 0, total = 180) {
  const t = 2 + f / FPS; // clouds drift on t; offset so frame 0 already has a pleasant cloud layout
  const z = 1 + push * (f / Math.max(1, total));
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
  art.drawBackground(ctx, W, H, t, night);
  ctx.restore();
}

// ── notebook paper ──
let paperCache: { c: HTMLCanvasElement; scale: number } | null = null;
function paperTex(scale: number) {
  if (paperCache && paperCache.scale === scale) return paperCache.c;
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  // warm paper with a soft light falloff
  const bg = g.createRadialGradient(W * 0.45, H * 0.4, 100, W * 0.5, H * 0.5, W * 0.75);
  bg.addColorStop(0, '#fcf9f1'); bg.addColorStop(1, '#efe9db');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // fibres
  const R = rng(99);
  g.lineWidth = 0.6;
  for (let i = 0; i < 2600; i++) {
    const x = R() * W, y = R() * H, a = R() * Math.PI, l = 3 + R() * 9;
    g.strokeStyle = `rgba(${120 + R() * 60},${100 + R() * 40},${70},${0.05 + R() * 0.06})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // blue rules + red margin (like the Lab Notebook)
  g.strokeStyle = 'rgba(92,140,200,0.32)'; g.lineWidth = 1.6;
  for (let y = 120; y < H; y += 46) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = 'rgba(230,90,90,0.55)'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(170, 0); g.lineTo(170, H); g.stroke();
  g.beginPath(); g.moveTo(176, 0); g.lineTo(176, H); g.stroke();
  // binder holes
  for (const y of [H * 0.18, H * 0.5, H * 0.82]) {
    const hg = g.createRadialGradient(70, y - 3, 4, 70, y, 26);
    hg.addColorStop(0, '#cfc6b2'); hg.addColorStop(0.7, '#ddd5c3'); hg.addColorStop(1, 'rgba(221,213,195,0)');
    g.fillStyle = hg; g.beginPath(); g.arc(70, y, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a2622'; g.beginPath(); g.arc(70, y, 15, 0, Math.PI * 2); g.fill();
  }
  // a faint coffee ring, because it's Schrödi's notebook
  g.strokeStyle = 'rgba(150,100,50,0.10)'; g.lineWidth = 9;
  g.beginPath(); g.arc(W - 210, H - 170, 92, 0.3, Math.PI * 1.85); g.stroke();
  g.strokeStyle = 'rgba(150,100,50,0.06)'; g.lineWidth = 3;
  g.beginPath(); g.arc(W - 206, H - 166, 102, 0, Math.PI * 2); g.stroke();
  paperCache = { c, scale };
  return c;
}
export function notebook(ctx: Ctx, f: number, push = 0, total = 180) {
  const scale = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
  const z = 1 + push * (f / Math.max(1, total));
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(paperTex(scale), 0, 0, W, H);
  ctx.restore();
  vignette(ctx, 0.22, '60,40,20');
}

// ── blurred gameplay still ──
const imgCache = new Map<string, HTMLCanvasElement>();
export async function loadBlurred(src: string, blur = 18, darken = 0.25) {
  const key = `${src}|${blur}|${darken}`;
  if (imgCache.has(key)) return;
  const img = new Image();
  img.src = src.startsWith('/') && !src.startsWith('/@fs') && !src.startsWith('/art') ? `/@fs${src}` : src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 1920; c.height = 1080;
  const g = c.getContext('2d')!;
  // cover-fit, oversized so the blur has no dark edges
  const s = Math.max(c.width / img.width, c.height / img.height) * 1.08;
  g.filter = `blur(${blur}px) saturate(1.1)`;
  g.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s);
  g.filter = 'none';
  g.fillStyle = `rgba(10,10,28,${darken})`; g.fillRect(0, 0, c.width, c.height);
  imgCache.set(key, c);
}
export function blurredImage(ctx: Ctx, src: string, f: number, blur = 18, darken = 0.25, push = 0.04, total = 180) {
  const c = imgCache.get(`${src}|${blur}|${darken}`);
  if (!c) return;
  const z = 1 + push * (f / Math.max(1, total));
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(c, 0, 0, W, H);
  ctx.restore();
  vignette(ctx, 0.5);
}

export interface BgOpts { bg: BgKind; bgImage?: string; push?: number; night?: number }
export async function prepareBg(o: BgOpts) {
  if (o.bg === 'image' && o.bgImage) await loadBlurred(o.bgImage);
}
export function drawBg(ctx: Ctx, f: number, o: BgOpts, total: number) {
  const push = o.push ?? 0.05;
  switch (o.bg) {
    case 'night': sky(ctx, f, o.night ?? 1, push, total); break;
    case 'dusk': sky(ctx, f, o.night ?? 0.6, push, total); break;
    case 'day': sky(ctx, f, o.night ?? 0.12, push, total); break;
    case 'notebook': notebook(ctx, f, push * 0.5, total); break;
    case 'image': if (o.bgImage) blurredImage(ctx, o.bgImage, f, 18, 0.25, push, total); break;
    case 'black': ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); break;
    case 'none': break;
  }
}
export const isDark = (o: BgOpts) => o.bg === 'night' || o.bg === 'dusk' || o.bg === 'image' || o.bg === 'black' || o.bg === 'none';
export { PAL, clamp };
