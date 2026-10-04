// END CARD: under the night sky the wordmark letters drift in *uncollapsed* (each filled with a turning
// Sunny/Moony swirl, still dreaming), land in place, and settle into the logo colours. Then
// "quriosity 2026 · Option 06", "Play free in your browser" and the URL pill. A tucked-in Qubble snores.
import art from '../../../../src/art';
import { type Scene, type Ctx, W, H, FPS, PAL, TAU, clamp, lerp, ease, prog, wobble, hash1, roundRect, RT } from '../lib/core';
import { drawBg, prepareBg, type BgKind } from '../lib/bg';
import { grain, star4 } from '../lib/fx';
import { loadLogo, drawLogoLetter, logoLayout, LOGO } from '../lib/logo';
import { layoutText, drawCollapseText } from '../lib/text';

export interface EndParams {
  frames: number; bg: BgKind; bgImage?: string;
  /** letters fly in from `inStart`, staggered; all landed by `landed`; swirl→logo colours by `settled`. */
  inStart: number; landed: number; settled: number;
  line1: string; line2: string; url: string;
  line1At: number; line2At: number; urlAt: number;
  y: number; width: number; grain: number;
}

function swirlFill(ctx: Ctx, cx: number, cy: number, ang: number, a: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = PAL.moony; ctx.fillRect(cx - 900, cy - 900, 1800, 1800);
  ctx.translate(cx, cy); ctx.rotate(ang);
  const h = 700;
  ctx.beginPath();
  ctx.moveTo(-h * 2, 0); ctx.lineTo(-h * 0.7, 0);
  ctx.bezierCurveTo(-h * 0.25, -h * 0.4, h * 0.25, h * 0.4, h * 0.7, 0);
  ctx.lineTo(h * 2, 0); ctx.lineTo(h * 2, -h * 2); ctx.lineTo(-h * 2, -h * 2); ctx.closePath();
  ctx.fillStyle = PAL.sunny; ctx.fill();
  // sparkles along the seam
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 5; i++) { const u = ((i / 5 + ang * 0.05) % 1) * 2 - 1; star4(ctx, u * h * 0.6, Math.sin(u * 3) * h * 0.12, 40); ctx.fill(); }
  ctx.restore();
}

export const endcard: Scene<EndParams> = {
  resolve: (p) => ({
    frames: 300, bg: 'night', inStart: 0, landed: 54, settled: 110,
    line1: 'quriosity 2026 · Option 06', line2: 'Play free in your browser', url: 'nitheesh-me.github.io/no-peeking',
    line1At: 84, line2At: 104, urlAt: 120, y: 400, width: 1380, grain: 0.045, ...p,
  }),
  frames: (p) => p.frames,
  markers: (p) => ({ letters_landed: p.landed, logo_settled: p.settled, line1: p.line1At, line2: p.line2At, url: p.urlAt, url_legible: p.urlAt + 14 }),
  prepare: async (p) => { await loadLogo(); await prepareBg({ bg: p.bg, bgImage: p.bgImage }); },
  render(ctx, f, p) {
    const t = f / FPS;
    drawBg(ctx, f, { bg: p.bg, bgImage: p.bgImage, push: 0.03 }, p.frames);
    const lay = logoLayout(W / 2, p.y, p.width);
    const n = LOGO.length;
    const span = p.landed - p.inStart - 26;
    LOGO.forEach((L, i) => {
      const s0 = p.inStart + (i / (n - 1)) * span;
      const k = prog(f, s0, s0 + 26);
      if (k <= 0) return;
      const to = lay.letters[i];
      const ang0 = hash1(i * 5 + 1) * TAU;
      const from = { x: to.x + Math.cos(ang0) * 700, y: to.y + Math.sin(ang0) * 420 - 120 };
      const e = ease.outCubic(k);
      // arc in: a little loop so it reads as floating, not sliding
      const x = lerp(from.x, to.x, e) + Math.sin(k * Math.PI) * 60 * (i % 2 ? 1 : -1);
      const y = lerp(from.y, to.y, e) - Math.sin(k * Math.PI) * 50;
      const w = f > s0 + 26 ? wobble(f - s0 - 26, 0.07, 0.12) : 0;
      const bob = Math.sin(t * 2 + i * 0.7) * 4 * clamp((f - p.settled) / 30);
      const swirlA = 1 - ease.inOutCubic(prog(f, p.landed + (i / n) * 20, p.settled + (i / n) * 20));
      drawLogoLetter(ctx, i, {
        x, y: y + bob, k: lay.k * lerp(0.55, 1, ease.outBack(k, 1.6)), rot: (1 - e) * (hash1(i) - 0.5) * 1.2,
        sx: 1 + 0.08 * w, sy: 1 - 0.08 * w, alpha: clamp(k * 3),
        overFill: (c, LL) => swirlFill(c, LL.cx, LL.cy, t * 2.2 + i * 0.8, swirlA),
      });
    });
    // lines
    const l1 = layoutText(ctx, p.line1, { x: W / 2, y: p.y + 230, size: 50, font: 'Quicksand' });
    drawCollapseText(ctx, l1, f, { start: p.line1At, reveal: 16, style: 'night', noOrb: true, particles: false });
    const l2 = layoutText(ctx, p.line2, { x: W / 2, y: p.y + 320, size: 40, font: 'Quicksand' });
    drawCollapseText(ctx, l2, f, { start: p.line2At, reveal: 14, style: 'night', noOrb: true, particles: false });
    // URL pill (the game's button style: paper, ink outline, ink drop shadow)
    const k = prog(f, p.urlAt, p.urlAt + 14);
    if (k > 0) {
      ctx.save();
      ctx.font = '700 46px Quicksand';
      const tw = ctx.measureText(p.url).width;
      const pw = tw + 90, ph = 84, px = W / 2 - pw / 2, py = p.y + 380;
      const sc = lerp(0.7, 1, ease.outBack(k, 2.2));
      ctx.translate(W / 2, py + ph / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -(py + ph / 2));
      ctx.globalAlpha *= clamp(k * 2);
      roundRect(ctx, px, py + 6, pw, ph, ph / 2); ctx.fillStyle = PAL.ink; ctx.fill();
      roundRect(ctx, px, py, pw, ph, ph / 2); ctx.fillStyle = PAL.red; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.url, W / 2, py + ph / 2 + 2);
      ctx.restore();
    }
    // a tucked-in Qubble snoring in the corner
    const qk = ease.outBack(prog(f, p.urlAt + 30, p.urlAt + 54));
    if (prog(f, p.urlAt + 30, p.urlAt + 54) > 0) art.drawQubble(ctx, 180, H + 140 - 200 * qk, 2.4, { bloch: { x: 1, y: 0, z: 0 }, blanket: 1, state: 'sleep' }, t);
    if (p.grain > 0 && p.bg !== 'none') grain(ctx, f, p.grain);
  },
};
export { RT };
