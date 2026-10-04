// 7. CAPTION STRIP (mechanic + showcase). The game sits at the top at 88% scale (1690×950, centred);
// a fixed paper strip fills the bottom 12% (y 950–1080) plus the side gutters. Captions are short
// Quicksand Bold lines with optional "= real term" gloss chips (Quantum on a Sunny pill), e.g.
//   { in: 60, out: 300, text: 'Looking changes it.', gloss: '= measurement' }
// Render with alpha (fill + matte): the game hole is transparent, so the Editor overlays it on the scaled game.
import { type Scene, type Ctx, W, H, PAL, clamp, lerp, ease, prog, roundRect, rng, RT } from '../lib/core';

export interface CaptionItem { in: number; out: number; text?: string; gloss?: string; gloss2?: string }
export interface CaptionParams {
  frames: number; items: CaptionItem[]; plate: boolean; bg?: string;
  /** strip geometry (1080p units) */
  gameScale: number;
}
export const GAME_RECT = { x: (W - W * 0.88) / 2, y: 0, w: W * 0.88, h: H * 0.88 }; // 115.2, 0, 1689.6, 950.4
const STRIP_Y = H * 0.88;

let plateCache: { c: HTMLCanvasElement; s: number } | null = null;
function plateTex(scale: number) {
  if (plateCache && plateCache.s === scale) return plateCache.c;
  const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
  const g = c.getContext('2d')!; g.scale(scale, scale);
  // warm paper
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#efe9dc'); bg.addColorStop(1, '#f6f2e8');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const R = rng(17);
  g.lineWidth = 0.6;
  for (let i = 0; i < 1600; i++) {
    const x = R() * W, y = R() * H, a = R() * Math.PI, l = 3 + R() * 8;
    g.strokeStyle = `rgba(120,100,70,${0.05 + R() * 0.05})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // stitched seam along the top of the strip
  g.strokeStyle = 'rgba(14,14,14,0.22)'; g.setLineDash([10, 8]); g.lineWidth = 2;
  g.beginPath(); g.moveTo(24, STRIP_Y + 12); g.lineTo(W - 24, STRIP_Y + 12); g.stroke(); g.setLineDash([]);
  // cut the game hole (with a soft drop shadow around it, like a framed photo)
  const r = GAME_RECT;
  g.save(); g.shadowColor = 'rgba(30,20,40,0.35)'; g.shadowBlur = 22 * scale; g.shadowOffsetY = 6 * scale;
  g.fillStyle = '#000'; roundRect(g, r.x, r.y - 30, r.w, r.h + 30, 18); g.fill(); g.restore();
  g.globalCompositeOperation = 'destination-out';
  roundRect(g, r.x, r.y - 30, r.w, r.h + 30, 18); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 3; g.strokeStyle = PAL.ink; roundRect(g, r.x, r.y - 30, r.w, r.h + 30, 18); g.stroke();
  plateCache = { c, s: scale };
  return c;
}

function glossChip(ctx: Ctx, x: number, y: number, text: string, k: number) {
  ctx.save();
  ctx.font = '36px Quantum';
  const w = ctx.measureText(text).width + 40, h = 58;
  const sc = lerp(0.6, 1, ease.outBack(clamp(k), 2.4));
  ctx.translate(x + w / 2, y); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(k * 2.5);
  roundRect(ctx, -w / 2, -h / 2 + 4, w, h, h / 2); ctx.fillStyle = PAL.ink; ctx.fill();
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = PAL.sunny; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.fillStyle = PAL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 3);
  ctx.restore();
  return w;
}

export const caption: Scene<CaptionParams> = {
  resolve: (p) => ({
    frames: 360, plate: true, gameScale: 0.88,
    items: [
      { in: 20, out: 170, text: 'Looking changes it.', gloss: '= measurement' },
      { in: 190, out: 340, text: 'A bot asks: do these two match?', gloss: '= parity check', gloss2: '= syndrome' },
    ], ...p,
  }),
  frames: (p) => p.frames,
  markers: (p) => ({ captions_in: p.items.map((i) => i.in), captions_out: p.items.map((i) => i.out) }),
  render(ctx, f, p) {
    if (p.plate) ctx.drawImage(plateTex(RT.dpr), 0, 0, W, H);
    const cy = STRIP_Y + (H - STRIP_Y) / 2 + 6;
    for (const it of p.items) {
      if (f < it.in || f >= it.out) continue;
      const kin = prog(f, it.in, it.in + 10);
      const kout = 1 - prog(f, it.out - 8, it.out);
      ctx.save();
      ctx.globalAlpha *= kout;
      // measure the row: text + chips, centred
      ctx.font = '700 44px Quicksand';
      const tw = it.text ? ctx.measureText(it.text).width : 0;
      ctx.font = '36px Quantum';
      const cw = (s?: string) => (s ? ctx.measureText(s).width + 40 : 0);
      const gap = 22;
      const total = tw + (it.gloss ? gap + cw(it.gloss) : 0) + (it.gloss2 ? gap + cw(it.gloss2) : 0);
      let x = W / 2 - total / 2;
      if (it.text) {
        ctx.save();
        ctx.globalAlpha *= ease.outCubic(kin);
        ctx.font = '700 44px Quicksand'; ctx.fillStyle = PAL.ink; ctx.textBaseline = 'middle';
        ctx.fillText(it.text, x, cy + (1 - ease.outCubic(kin)) * 14);
        ctx.restore();
        x += tw + gap;
      }
      if (it.gloss) { x += glossChip(ctx, x, cy, it.gloss, prog(f, it.in + 6, it.in + 18)) + gap; }
      if (it.gloss2) glossChip(ctx, x, cy, it.gloss2, prog(f, it.in + 12, it.in + 24));
      ctx.restore();
    }
  },
};
