// Offscreen layers the size of the output canvas (device px), pre-scaled so scenes draw in 1920×1080 units.
import { type Ctx, W, H } from './core';

const pool = new Map<string, HTMLCanvasElement>();
export function layer(ctx: Ctx, name: string): { c: HTMLCanvasElement; g: Ctx } {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  let c = pool.get(name);
  if (!c || c.width !== cw || c.height !== ch) {
    c = document.createElement('canvas'); c.width = cw; c.height = ch;
    pool.set(name, c);
  }
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  g.clearRect(0, 0, cw, ch);
  g.setTransform(cw / W, 0, 0, ch / H, 0, 0);
  return { c, g };
}

/** Draw a full-frame layer back onto ctx (in logical units). */
export function blit(ctx: Ctx, c: HTMLCanvasElement, dx = 0, dy = 0) {
  ctx.drawImage(c, dx, dy, W, H);
}

/** A tinted copy of a layer (multiply by colour, keep alpha). */
export function tinted(ctx: Ctx, src: HTMLCanvasElement, color: string, name: string) {
  const { c, g } = layer(ctx, name);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
  return c;
}
