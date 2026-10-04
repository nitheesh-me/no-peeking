// SPLIT FRAME (trailer proof section, REVISED 2): a paper frame with two transparent windows — the room on the
// left (~60%) and the Bot Code column on the right (~40%) — a thin ink divider, soft paper edges and shadows,
// and a "your program" chip above the right window. Render with alpha: the Editor places two crops of the same
// capture under the holes (rects in the JSON markers) and overlays this fill + matte on top.
import { type Scene, type Ctx, W, H, PAL, clamp, lerp, ease, prog, roundRect, rng, RT } from '../lib/core';

export interface SplitParams { frames: number; intro: number; chip: string; bg?: string }
export const LEFT = { x: 28, y: 28, w: 1124, h: 1024 };
export const RIGHT = { x: 1196, y: 104, w: 696, h: 948 };
const R_ = 20;

let tex: { c: HTMLCanvasElement; s: number } | null = null;
function paper(scale: number) {
  if (tex && tex.s === scale) return tex.c;
  const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
  const g = c.getContext('2d')!; g.scale(scale, scale);
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#f4efe3'); bg.addColorStop(1, '#ece5d4');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const R = rng(23); g.lineWidth = 0.6;
  for (let i = 0; i < 1800; i++) {
    const x = R() * W, y = R() * H, a = R() * Math.PI, l = 3 + R() * 8;
    g.strokeStyle = `rgba(120,100,70,${0.05 + R() * 0.05})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // cut the windows, then a soft inner shadow so the paper reads as lying on top of the footage
  g.globalCompositeOperation = 'destination-out';
  for (const r of [LEFT, RIGHT]) { roundRect(g, r.x, r.y, r.w, r.h, R_); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  for (const r of [LEFT, RIGHT]) {
    g.save();
    roundRect(g, r.x, r.y, r.w, r.h, R_); g.clip();
    g.shadowColor = 'rgba(30,18,24,0.42)'; g.shadowBlur = 22 * scale; g.shadowOffsetY = 5 * scale;
    g.lineWidth = 60; g.strokeStyle = '#000'; roundRect(g, r.x - 30, r.y - 30, r.w + 60, r.h + 60, R_ + 30); g.stroke();
    g.restore();
  }
  // ink window outlines + a stitched inner line
  for (const r of [LEFT, RIGHT]) {
    g.lineWidth = 3; g.strokeStyle = PAL.ink; roundRect(g, r.x, r.y, r.w, r.h, R_); g.stroke();
    g.setLineDash([9, 7]); g.lineWidth = 1.6; g.strokeStyle = 'rgba(14,14,14,0.28)';
    roundRect(g, r.x - 10, r.y - 10, r.w + 20, r.h + 20, R_ + 10); g.stroke(); g.setLineDash([]);
  }
  // thin ink divider
  const dx = (LEFT.x + LEFT.w + RIGHT.x) / 2;
  g.lineWidth = 2.5; g.strokeStyle = PAL.ink; g.lineCap = 'round';
  g.beginPath(); g.moveTo(dx, 60); g.lineTo(dx, H - 60); g.stroke();
  tex = { c, s: scale };
  return c;
}

export const splitframe: Scene<SplitParams> = {
  resolve: (p) => ({ frames: 576, intro: 14, chip: 'your program', ...p }),
  frames: (p) => p.frames,
  markers: (p) => ({ chip_in: [0, p.intro], left_window_xywh_1080: [LEFT.x, LEFT.y, LEFT.w, LEFT.h], right_window_xywh_1080: [RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h] } as any),
  render(ctx, f, p) {
    ctx.drawImage(paper(RT.dpr), 0, 0, W, H);
    // the chip pops in
    const k = prog(f, 0, p.intro);
    ctx.save();
    ctx.font = '38px Quantum';
    const tw = ctx.measureText(p.chip).width;
    const cw = tw + 54, ch = 56, cx = RIGHT.x + 28 + cw / 2, cy = RIGHT.y - 46;
    const sc = lerp(0.6, 1, ease.outBack(clamp(k), 2.2));
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(k * 2);
    roundRect(ctx, -cw / 2, -ch / 2 + 4, cw, ch, ch / 2); ctx.fillStyle = PAL.ink; ctx.fill();
    roundRect(ctx, -cw / 2, -ch / 2, cw, ch, ch / 2); ctx.fillStyle = PAL.sunny; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = PAL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.chip, 0, 3);
    ctx.restore();
  },
};
