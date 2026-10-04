// Letter-by-letter "collapse" type: each letter arrives as a tiny dreaming Qubble (a Sunny/Moony swirl
// gumdrop), squashes, and pops into its Quantum glyph with a ring and a few sparks.
// Night style = paper text, ink outline, soft dark glow. Day style = ink text on a torn paper note.
import { type Ctx, TAU, PAL, clamp, ease, rng, RT, lerp, hash1 } from './core';
import { drawParticles, type Particle } from './fx';

export interface Glyph { ch: string; x: number; y: number; w: number; line: number; word: number; idx: number }
export interface TextBlock {
  glyphs: Glyph[]; size: number; font: string; capH: number;
  box: { x: number; y: number; w: number; h: number };
}
export interface LayoutOpts { x: number; y: number; size: number; font?: string; maxW?: number; lh?: number; align?: 'center' | 'left'; letterSpacing?: number }

export function fontStr(size: number, font = 'Quantum') {
  return font === 'Quicksand' ? `700 ${size}px Quicksand` : `${size}px ${font}`;
}

/** Lay out text (wrapping at maxW, '\n' forces a break) centred on (x, y). */
export function layoutText(ctx: Ctx, text: string, o: LayoutOpts): TextBlock {
  const font = o.font ?? 'Quantum';
  ctx.save();
  ctx.font = fontStr(o.size, font);
  const ls = o.letterSpacing ?? 0;
  const meas = (s: string) => ctx.measureText(s).width + ls * s.length;
  const capH = ctx.measureText('H').actualBoundingBoxAscent;
  const maxW = o.maxW ?? 1600;
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (cur && meas(t) > maxW) { lines.push(cur); cur = word; } else cur = t;
    }
    lines.push(cur);
  }
  const lh = o.size * (o.lh ?? 1.22);
  const totalH = capH + (lines.length - 1) * lh;
  const glyphs: Glyph[] = [];
  let word = 0, idx = 0, minX = Infinity, maxX = -Infinity;
  lines.forEach((ln, li) => {
    const lw = meas(ln);
    const x0 = o.align === 'left' ? o.x : o.x - lw / 2;
    const base = o.y - totalH / 2 + capH + li * lh;
    minX = Math.min(minX, x0); maxX = Math.max(maxX, x0 + lw);
    for (let i = 0; i < ln.length; i++) {
      const ch = ln[i];
      const x = x0 + meas(ln.slice(0, i));
      const w = meas(ch);
      if (ch === ' ') { word++; continue; }
      glyphs.push({ ch, x, y: base, w, line: li, word, idx: idx++ });
    }
    word++;
  });
  ctx.restore();
  return { glyphs, size: o.size, font, capH, box: { x: minX, y: o.y - totalH / 2, w: maxX - minX, h: totalH } };
}

/** A tiny dreaming Qubble: gumdrop body, swirl split at angle `ang`, closed eyes. Centred at (x, y). */
export function drawOrb(ctx: Ctx, x: number, y: number, r: number, ang: number, sx = 1, sy = 1) {
  ctx.save();
  ctx.translate(x, y + r * 0.9);
  ctx.scale(sx, sy);
  const w = r, h = r * 1.85;
  const body = new Path2D();
  body.moveTo(-w * 0.86, 0);
  body.bezierCurveTo(-w * 1.08, -h * 0.04, -w * 1.06, -h * 0.6, -w * 0.62, -h * 0.9);
  body.bezierCurveTo(-w * 0.32, -h * 1.07, w * 0.32, -h * 1.07, w * 0.62, -h * 0.9);
  body.bezierCurveTo(w * 1.06, -h * 0.6, w * 1.08, -h * 0.04, w * 0.86, 0);
  body.quadraticCurveTo(0, h * 0.09, -w * 0.86, 0);
  body.closePath();
  ctx.fillStyle = PAL.moony; ctx.fill(body);
  ctx.save(); ctx.clip(body);
  ctx.translate(0, -h * 0.48); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(-h * 2, 0); ctx.lineTo(-h * 0.7, 0);
  ctx.bezierCurveTo(-h * 0.25, -h * 0.35, h * 0.25, h * 0.35, h * 0.7, 0);
  ctx.lineTo(h * 2, 0); ctx.lineTo(h * 2, -h * 2); ctx.lineTo(-h * 2, -h * 2); ctx.closePath();
  ctx.fillStyle = PAL.sunny; ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(-w * 0.38, -h * 0.72, w * 0.22, h * 0.1, -0.5, 0, TAU); ctx.fill();
  ctx.lineWidth = Math.max(1.4, r * 0.13); ctx.strokeStyle = PAL.ink; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke(body);
  // sleepy eyes
  ctx.lineWidth = Math.max(1.1, r * 0.09);
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * w * 0.34, -h * 0.42, w * 0.16, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  ctx.restore();
}

export type TextStyle = 'night' | 'day' | 'ink' | 'paper';
export interface CollapseOpts {
  start: number;
  /** Frames from the first letter starting to the last letter fully popped. */
  reveal?: number;
  style?: TextStyle;
  seed?: number;
  /** Letter exit: frame it starts and its length (letters shrink and float up, staggered). */
  exitStart?: number; exitDur?: number;
  /** Per-glyph colour override (e.g. a highlighted word). */
  colorOf?: (g: Glyph) => string | undefined;
  /** Disable the orb stage (plain pop). */
  noOrb?: boolean;
  particles?: boolean;
}
const ORB_IN = 6, POP = 8, GLYPH_IN = 7;
export const LETTER_FRAMES = POP + GLYPH_IN;

export function revealTiming(n: number, reveal: number) {
  const ld = Math.min(LETTER_FRAMES, reveal);
  const stagger = n > 1 ? Math.max(0, (reveal - ld) / (n - 1)) : 0;
  return { stagger };
}
/** Frame (relative to start) at which the whole text is fully legible. */
export function legibleAt(o: { reveal?: number }, n: number) { const r = o.reveal ?? defaultReveal(n); return r - Math.min(LETTER_FRAMES, r) + LETTER_FRAMES; }
export function defaultReveal(n: number) { return Math.round(clamp(LETTER_FRAMES + n * 0.55, 18, 34)); }

export function drawCollapseText(ctx: Ctx, b: TextBlock, f: number, o: CollapseOpts) {
  const n = b.glyphs.length;
  const reveal = o.reveal ?? defaultReveal(n);
  const { stagger } = revealTiming(n, reveal);
  const style = o.style ?? 'night';
  ctx.save();
  ctx.font = fontStr(b.size, b.font);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  const outline = Math.max(2, b.size * 0.028);
  const fx: { list: Particle[]; at: number }[] = [];
  for (const g of b.glyphs) {
    const s0 = o.start + g.idx * stagger;
    const u = f - s0;
    if (u < 0) continue;
    let exitK = 0;
    if (o.exitStart != null) {
      const ed = o.exitDur ?? 10;
      const es = o.exitStart + g.idx * Math.min(1, stagger) * 0.6;
      exitK = clamp((f - es) / ed);
      if (exitK >= 1) continue;
    }
    const cx = g.x + g.w / 2, cy = g.y - b.capH / 2;
    const orbR = b.capH * 0.36;
    if (!o.noOrb && u < POP) {
      // orb drops in, wobbles, squashes, pops
      const k = clamp(u / ORB_IN);
      const sc = ease.outBack(k, 2.2);
      const dropY = lerp(-b.capH * 0.55, 0, ease.outCubic(k));
      let sx = sc, sy = sc;
      if (u > ORB_IN) { const q = (u - ORB_IN) / (POP - ORB_IN); sx *= 1 + 0.4 * q; sy *= 1 - 0.38 * q; }
      const ang = (hash1(g.idx * 7 + (o.seed ?? 0)) * TAU) + u * 0.35;
      drawOrb(ctx, cx, cy + dropY - orbR * 0.2, orbR, ang, sx, sy);
      continue;
    }
    const v = o.noOrb ? u : u - POP;
    const gk = clamp(v / GLYPH_IN);
    let sc = lerp(0.55, 1, ease.outBack(gk, 2.6));
    let alpha = 1, dy = 0;
    if (exitK > 0) { const e = ease.inCubic(exitK); sc *= 1 - 0.5 * e; alpha = 1 - e; dy = -b.size * 0.35 * e; }
    const tint = clamp(1 - v / 6);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(cx, cy + dy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    const col = o.colorOf?.(g);
    if (style === 'night' || style === 'paper') {
      ctx.save();
      ctx.shadowColor = 'rgba(6,6,22,0.8)'; ctx.shadowBlur = 20 * RT.dpr;
      ctx.lineWidth = outline * 2; ctx.strokeStyle = PAL.ink;
      ctx.strokeText(g.ch, g.x, g.y);
      ctx.restore();
      ctx.lineWidth = outline * 2; ctx.strokeStyle = PAL.ink; ctx.strokeText(g.ch, g.x, g.y);
      ctx.fillStyle = col ?? PAL.paper; ctx.fillText(g.ch, g.x, g.y);
    } else if (style === 'ink') {
      ctx.lineWidth = outline * 2.4; ctx.strokeStyle = PAL.paper; ctx.strokeText(g.ch, g.x, g.y);
      ctx.fillStyle = col ?? PAL.ink; ctx.fillText(g.ch, g.x, g.y);
    } else {
      ctx.fillStyle = col ?? PAL.ink; ctx.fillText(g.ch, g.x, g.y);
    }
    if (tint > 0) { ctx.globalAlpha *= tint * 0.85; ctx.fillStyle = '#ffffff'; ctx.fillText(g.ch, g.x, g.y); }
    ctx.restore();
    if (o.particles !== false && !o.noOrb && v < 40) {
      const R = rng(g.idx * 131 + (o.seed ?? 0) * 7 + 3);
      const list: Particle[] = style !== 'day' ? [] : [{ shape: 'ring', x: cx, y: cy, vx: 0, vy: 0, g: 0, drag: 1, life: 0.22, size: orbR * 0.9, rot: 0, vr: 0, color: style === 'day' ? PAL.ink : '#ffffff', grow: Math.max(1.5, orbR * 0.12) }];
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 0.8 + (R() - 0.5) * 0.4, sp = 140 + R() * 120;
        list.push({ shape: 'spark', x: cx, y: cy, vx: Math.cos(a) * sp * (b.size / 110), vy: Math.sin(a) * sp * (b.size / 110), g: 200, drag: 5, life: 0.35, size: Math.max(1.5, b.size * 0.03), rot: 0, vr: 0, color: i % 2 ? PAL.sunny : PAL.moony });
      }
      fx.push({ list, at: s0 + POP });
    }
  }
  for (const p of fx) drawParticles(ctx, p.list, f, p.at);
  ctx.restore();
}

/** Torn paper note behind day text, with two tape strips. `k` = appear progress 0..1. */
export function drawPaperPlate(ctx: Ctx, box: { x: number; y: number; w: number; h: number }, k: number, seed = 5, rot = -0.018) {
  if (k <= 0) return;
  const padX = 56, padY = 46;
  const x = box.x - padX, y = box.y - padY, w = box.w + padX * 2, h = box.h + padY * 2;
  const R = rng(seed);
  const pts: [number, number][] = [];
  const step = 16;
  for (let i = 0; i <= w; i += step) pts.push([x + i, y + (R() - 0.5) * 6]);
  for (let i = 0; i <= h; i += step) pts.push([x + w + (R() - 0.5) * 7, y + i]);
  for (let i = w; i >= 0; i -= step) pts.push([x + i, y + h + (R() - 0.5) * 9]);
  for (let i = h; i >= 0; i -= step) pts.push([x + (R() - 0.5) * 7, y + i]);
  const cx = x + w / 2, cy = y + h / 2;
  const sc = lerp(0.88, 1, ease.outBack(clamp(k), 2));
  ctx.save();
  ctx.globalAlpha *= clamp(k * 2);
  ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
  const p = new Path2D();
  pts.forEach(([px, py], i) => (i ? p.lineTo(px, py) : p.moveTo(px, py)));
  p.closePath();
  ctx.save();
  ctx.shadowColor = 'rgba(20,14,30,0.35)'; ctx.shadowBlur = 18 * RT.dpr; ctx.shadowOffsetY = 8 * RT.dpr;
  ctx.fillStyle = '#fbf8f1'; ctx.fill(p);
  ctx.restore();
  ctx.save(); ctx.clip(p);
  ctx.strokeStyle = 'rgba(92,140,200,0.22)'; ctx.lineWidth = 1.4;
  for (let yy = y + 30; yy < y + h; yy += 34) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
  ctx.restore();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(14,14,14,0.25)'; ctx.stroke(p);
  // tape
  for (const [tx, tr] of [[x + 40, -0.5], [x + w - 40, 0.45]] as const) {
    ctx.save(); ctx.translate(tx, y + 2); ctx.rotate(tr);
    ctx.fillStyle = 'rgba(255,241,200,0.82)'; ctx.fillRect(-46, -14, 92, 28);
    ctx.strokeStyle = 'rgba(160,130,80,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(-46, -14, 92, 28);
    ctx.restore();
  }
  ctx.restore();
}
