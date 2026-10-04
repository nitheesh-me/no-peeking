// The real NO PEEKING! wordmark (public/art/logo.svg), parsed into one Path2D per letter so each letter
// can be animated on its own while looking exactly like the logo (ink drop shadow, 70-unit ink outline).
import { type Ctx, PAL } from './core';

export interface LogoLetter {
  ch: string; path: Path2D; color: string;
  /** Centre of the letter in logo units (the viewBox is -80 -40 7194 1060). */
  cx: number; cy: number; rot: number; w: number;
}
export const LOGO_TEXT = 'NOPEEKING!';
export const LOGO_VIEW = { x: -80, y: -40, w: 7194, h: 1060 };
/** Centre of the whole wordmark in logo units. */
export const LOGO_CENTER = { x: LOGO_VIEW.x + LOGO_VIEW.w / 2, y: 460 };
export let LOGO: LogoLetter[] = [];

export async function loadLogo() {
  if (LOGO.length) return LOGO;
  const txt = await (await fetch('/art/logo.svg')).text();
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
  const groups = [...doc.querySelectorAll('g')];
  const fillGroup = groups.find((g) => g.getAttribute('paint-order') === 'stroke')!;
  const paths = [...fillGroup.querySelectorAll('path')];
  LOGO = paths.map((p, i) => {
    const tr = p.getAttribute('transform')!;
    const m = /translate\(([-\d.]+),([-\d.]+)\) rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)/.exec(tr)!;
    const [tx, ty, r, rcx, rcy] = m.slice(1).map(Number);
    const mat = new DOMMatrix().translate(tx, ty).translate(rcx, rcy).rotate(r).translate(-rcx, -rcy).scale(1, -1);
    const path = new Path2D();
    path.addPath(new Path2D(p.getAttribute('d')!), mat);
    return { ch: LOGO_TEXT[i], path, color: p.getAttribute('fill')!, cx: tx + rcx, cy: ty + rcy, rot: r, w: rcx * 2 };
  });
  return LOGO;
}

export interface LetterDraw {
  /** Screen position of the letter centre, scale (px per logo unit), extra rotation (rad). */
  x: number; y: number; k: number; rot?: number; sx?: number; sy?: number; alpha?: number;
  fill?: string | CanvasGradient | CanvasPattern;
  /** 0..1 white tint over the fill (the pop flash). */
  tint?: number;
  shadow?: boolean;
  /** Draw only the fill (custom fills are drawn into it): callback in logo-space after the fill. */
  overFill?: (ctx: Ctx, L: LogoLetter) => void;
}

/** Draw logo letter i with its centre at (x, y). */
export function drawLogoLetter(ctx: Ctx, i: number, d: LetterDraw) {
  const L = LOGO[i];
  if (!L || (d.alpha ?? 1) <= 0) return;
  ctx.save();
  ctx.globalAlpha *= d.alpha ?? 1;
  ctx.translate(d.x, d.y);
  if (d.rot) ctx.rotate(d.rot);
  ctx.scale(d.k * (d.sx ?? 1), d.k * (d.sy ?? 1));
  ctx.translate(-L.cx, -L.cy);
  ctx.lineJoin = 'round';
  if (d.shadow !== false) {
    ctx.save(); ctx.translate(26, 34);
    ctx.fillStyle = PAL.ink; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 70;
    ctx.stroke(L.path); ctx.fill(L.path);
    ctx.restore();
  }
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 70;
  ctx.stroke(L.path);
  ctx.fillStyle = d.fill ?? L.color;
  ctx.fill(L.path);
  if (d.overFill) { ctx.save(); ctx.clip(L.path); d.overFill(ctx, L); ctx.restore(); }
  if (d.tint && d.tint > 0) { ctx.save(); ctx.globalAlpha *= Math.min(1, d.tint); ctx.fillStyle = '#ffffff'; ctx.fill(L.path); ctx.restore(); }
  ctx.restore();
}

/** Final screen layout of the wordmark: centre (x, y) and total width → per-letter centres and scale. */
export function logoLayout(x: number, y: number, width: number) {
  const k = width / LOGO_VIEW.w;
  return { k, letters: LOGO.map((L) => ({ x: x + (L.cx - LOGO_CENTER.x) * k, y: y + (L.cy - LOGO_CENTER.y) * k })) };
}
