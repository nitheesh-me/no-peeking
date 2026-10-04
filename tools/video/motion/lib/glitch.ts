// The glitch tear: the game's clone-glitch look (stepped horizontal slices, a hue-rotated multiply twin
// offset by (14, -6), a little shake) plus an RGB-style split in Sunny / Moony / Phasey.
// Used once, at the drop. 6 frames by default.
import { type Ctx, W, H, hash1, PAL, clamp } from './core';
import { layer, blit, tinted } from './layers';

export interface Band { y0: number; y1: number; on: boolean; dx: number }

/** Band layout for glitch frame k of n: which slices already show B, and their horizontal tear. */
export function glitchBands(k: number, n: number, seed = 3): Band[] {
  const cover = n <= 1 ? 1 : [0.12, 0.3, 0.5, 0.68, 0.84, 0.95][Math.min(5, Math.round((k / (n - 1)) * 5))];
  const bands: Band[] = [];
  let y = 0, i = 0;
  while (y < H) {
    const h = 18 + Math.floor(hash1(seed * 1000 + k * 97 + i * 13) * 120);
    const r = hash1(seed * 3000 + k * 61 + i * 7);
    const dx = (hash1(seed * 5000 + k * 31 + i * 3) - 0.5) * 2 * 120 * (1 - 0.6 * (k / Math.max(1, n - 1)));
    bands.push({ y0: y, y1: Math.min(H, y + h), on: r < cover, dx });
    y += h; i++;
  }
  return bands;
}

/** Composite one glitch frame: A (drawn by drawA, or black) tearing into B (a full-frame layer canvas). */
export function glitchFrame(ctx: Ctx, k: number, n: number, B: HTMLCanvasElement, drawA: ((g: Ctx) => void) | null, seed = 3) {
  const bands = glitchBands(k, n, seed);
  const A = layer(ctx, 'glitchA');
  if (drawA) drawA(A.g); else { A.g.fillStyle = '#000'; A.g.fillRect(0, 0, W, H); }
  const sun = tinted(ctx, B, PAL.sunny, 'gSun');
  const moon = tinted(ctx, B, PAL.moony, 'gMoon');
  const sh = (k % 2 ? 3 : -3);
  ctx.save();
  ctx.translate(sh, k % 2 ? -2 : 2); // glitch-shake (steps(2))
  for (const b of bands) {
    ctx.save();
    ctx.beginPath(); ctx.rect(-20, b.y0, W + 40, b.y1 - b.y0); ctx.clip();
    if (b.on) {
      blit(ctx, B, b.dx, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.75; blit(ctx, sun, b.dx - 18, 0);
      ctx.globalAlpha = 0.75; blit(ctx, moon, b.dx + 18, 0);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      blit(ctx, A.c, -b.dx * 0.4, 0);
    }
    ctx.restore();
  }
  // the clone twin: hue-rotated, multiply, offset (14, -6), shown in 3 stepped slices
  const sl = [[0, 0.4], [0.3, 0.8], [0.7, 1]][k % 3];
  ctx.save();
  ctx.beginPath(); ctx.rect(0, sl[0] * H, W, (sl[1] - sl[0]) * H); ctx.clip();
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.75;
  ctx.filter = 'hue-rotate(160deg) saturate(1.6)';
  blit(ctx, B, 14, -6);
  ctx.filter = 'none';
  ctx.restore();
  // scanline sparks + pixel blocks in the three dream colours
  const cols = [PAL.sunny, PAL.moony, PAL.phasey, '#ffffff'];
  for (let i = 0; i < 14; i++) {
    const r = (m: number) => hash1(seed * 7000 + k * 211 + i * 17 + m);
    const y = r(1) * H, w = 40 + r(2) * 420, x = r(3) * W, h = 2 + r(4) * (i % 3 === 0 ? 26 : 5);
    ctx.globalAlpha = 0.55 + r(5) * 0.4;
    ctx.fillStyle = cols[i % 4];
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/** Matte for the generic glitch transition: white where B shows. */
export function glitchMatte(ctx: Ctx, k: number, n: number, seed = 3) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (const b of glitchBands(k, n, seed)) if (b.on) ctx.fillRect(0, b.y0, W, b.y1 - b.y0);
}
export { clamp };
