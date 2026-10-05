// HUD LABEL (showcase): a small dark-plate tag at the top-left of a 1920×1080 frame, in the X-ray tag's type
// (Quantum, paper text, ink outline). The Editor places it into the 88% game rect and holds the last frame.
// Pops in over ~10 frames; static after that.
import { type Scene, W, PAL, clamp, lerp, ease, prog, roundRect, RT } from '../lib/core';

export interface LabelParams { text: string; frames: number; x: number; y: number; size: number; bg?: string }

export const label: Scene<LabelParams> = {
  resolve: (p) => ({ text: 'Ch 1 · 1-1', frames: 30, x: 40, y: 40, size: 40, ...p }),
  frames: (p) => p.frames,
  markers: (p) => ({ legible: 10 } as any),
  render(ctx, f, p) {
    const k = prog(f, 0, 10);
    if (k <= 0) return;
    ctx.save();
    ctx.font = `${p.size}px Quantum`;
    const check = /\s*✓$/.test(p.text);
    const text = p.text.replace(/\s*✓$/, '');
    const cw = check ? p.size * 1.05 : 0;
    const tw = ctx.measureText(text).width + cw;
    const padX = p.size * 0.6, h = p.size * 1.55, w = tw + padX * 2;
    const sc = lerp(0.8, 1, ease.outBack(clamp(k), 2));
    ctx.translate(p.x, p.y + h / 2); ctx.scale(sc, sc); ctx.translate(-p.x, -(p.y + h / 2));
    ctx.globalAlpha *= clamp(k * 2);
    // dark plate (same 74 % ink-night as the caption plates), feathered
    ctx.save(); ctx.shadowColor = 'rgba(8,6,24,0.6)'; ctx.shadowBlur = 14 * RT.dpr;
    roundRect(ctx, p.x, p.y, w, h, h / 2); ctx.fillStyle = 'rgba(8,6,24,0.78)'; ctx.fill(); ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(242,240,235,0.35)'; roundRect(ctx, p.x + 1, p.y + 1, w - 2, h - 2, h / 2 - 1); ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, p.size * 0.06) * 2; ctx.strokeStyle = PAL.ink; ctx.strokeText(text, p.x + padX, p.y + h / 2 + 2);
    ctx.fillStyle = PAL.paper; ctx.fillText(text, p.x + padX, p.y + h / 2 + 2);
    if (check) {
      // the display font has no ✓: draw the game's mint check
      const cx = p.x + w - padX - cw * 0.45, cy = p.y + h / 2, s = p.size * 0.32;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(cx - s, cy); ctx.lineTo(cx - s * 0.3, cy + s * 0.75); ctx.lineTo(cx + s * 1.1, cy - s * 0.8);
      ctx.lineWidth = s * 0.75; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.lineWidth = s * 0.42; ctx.strokeStyle = PAL.mint; ctx.stroke();
    }
    ctx.restore();
    void W;
  },
};
