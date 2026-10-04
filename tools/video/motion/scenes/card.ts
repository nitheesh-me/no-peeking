// 3. CARDS set inside the game world. Text arrives letter by letter as tiny Qubbles that pop into Quantum
// glyphs. Each card has an optional "prop" vignette made from the real art (a dreaming Qubble, a gremlin
// flipping a bit, Phasey flipping a phase, blanketed beds). bg: night | day | dusk | notebook | image | none.
import art from '../../../../src/art';
import { type Scene, type Ctx, W, H, FPS, PAL, TAU, clamp, lerp, ease, prog, wobble } from '../lib/core';
import { drawBg, prepareBg, type BgKind } from '../lib/bg';
import { layoutText, drawCollapseText, drawPaperPlate, defaultReveal, type TextStyle } from '../lib/text';
import { drawParticles, collapseBurst, grain, sparkBurst, type Particle } from '../lib/fx';

export type Prop = 'none' | 'dream' | 'flip' | 'phase' | 'blankets' | 'morning';
export interface CardParams {
  text: string;
  frames: number;
  bg: BgKind; bgImage?: string; night?: number;
  style?: TextStyle;
  /** Text centre (y) and size (px at 1080). Quantum cap height ≥ 7% of the frame needs size ≥ ~104. */
  y: number; size: number; maxW: number; font: 'Quantum' | 'Quicksand';
  /** First text frame, and frames for the whole text to finish popping in. */
  start: number; reveal?: number;
  /** Optional exit (letters shrink and float off) — trailer cards default to a hard cut (no exit). */
  exitStart?: number; exitDur?: number;
  prop: Prop;
  /** Frame at which the prop's event happens (the flip/phase hit). */
  propHit: number;
  /** Second, smaller Quicksand line under the main text. */
  sub?: string; subY?: number; subSize?: number; subStart?: number;
  plate?: boolean;
  grain: number;
  seed: number;
}

const cache = new Map<string, Particle[]>();
const cached = (k: string, mk: () => Particle[]) => { let v = cache.get(k); if (!v) { v = mk(); cache.set(k, v); } return v; };

function drawProp(ctx: Ctx, f: number, p: CardParams) {
  const t = f / FPS;
  const hit = p.propHit;
  const night = p.bg === 'day' || p.bg === 'notebook' ? 0 : 1;
  switch (p.prop) {
    case 'dream': {
      // one Qubble on its bed, swirling (two dreams), with a Sunny and a Moony dream bubble rising
      const x = W / 2, y = 930, s = 4.2;
      const a = t * 1.1;
      art.drawQubble(ctx, x, y, s, { bloch: { x: Math.cos(a), y: Math.sin(a), z: 0 }, blanket: 0, state: 'sleep' }, t);
      for (const side of [-1, 1]) {
        const k = clamp((f - 10) / 40);
        const bob = Math.sin(t * 1.6 + side) * 6;
        const bx = x + side * 270, by = y - 300 + bob;
        ctx.save(); ctx.globalAlpha *= ease.outCubic(k);
        // thought dots
        for (let i = 0; i < 3; i++) {
          const u = (i + 1) / 4;
          ctx.fillStyle = 'rgba(242,240,235,0.9)'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(lerp(x + side * 50, bx, u), lerp(y - 150, by + 50, u), 6 + i * 4, 0, TAU); ctx.fill(); ctx.stroke();
        }
        ctx.translate(bx, by); ctx.scale(ease.outBack(k) * 1.3, ease.outBack(k) * 1.3);
        ctx.fillStyle = 'rgba(242,240,235,0.95)'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 9; i++) { const aa = (i / 9) * TAU; ctx.arc(Math.cos(aa) * 52, Math.sin(aa) * 40, 26, aa - 1.2, aa + 1.2); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if (side < 0) {
          // a little sun
          ctx.fillStyle = PAL.sunny; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.lineWidth = 3; ctx.lineCap = 'round';
          for (let i = 0; i < 8; i++) { const aa = (i / 8) * TAU + t * 0.5; ctx.beginPath(); ctx.moveTo(Math.cos(aa) * 29, Math.sin(aa) * 29); ctx.lineTo(Math.cos(aa) * 38, Math.sin(aa) * 38); ctx.stroke(); }
        } else {
          // a little moon
          ctx.fillStyle = PAL.moony; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.arc(10, -8, 20, 0, TAU, true); ctx.fill('evenodd');
          ctx.beginPath(); ctx.arc(0, 0, 24, 0.3, TAU - 0.9); ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }
    case 'flip': {
      // Flipper sneaks in and zaps an exposed Sunny Qubble: it flips to Moony (a bit flip, |0⟩ → |1⟩)
      const qx = 1140, qy = 940, s = 3.8;
      const flipped = f >= hit;
      const st = flipped && f < hit + 40 ? 'scared' : 'sleep';
      art.drawQubble(ctx, qx, qy, s, { bloch: { x: 0, y: 0, z: flipped ? -1 : 1 }, blanket: 0, state: st }, t);
      const gx = lerp(520, 860, ease.outCubic(prog(f, 0, hit)));
      const pose = f < hit - 6 ? 'sneak' : f < hit + 20 ? 'strike' : 'taunt';
      art.drawGremlin(ctx, gx, 945, 3.8, 'flipper', pose, t);
      if (f >= hit) drawParticles(ctx, cached('flip', () => [...sparkBurst(qx, qy - 100, 41, 1.6, 14, [PAL.red, '#fff36b']), ...collapseBurst(qx, qy - 100, 42, 1.0, [PAL.red, '#fff36b', '#ffffff'])]), f, hit);
      break;
    }
    case 'phase': {
      // Phasey drifts past a swirl Qubble: the swirl mirrors (|+⟩ → |−⟩, a phase flip) with a purple swirl
      const qx = 780, qy = 940, s = 3.8;
      const k = ease.inOutCubic(prog(f, hit, hit + 14));
      const phi = lerp(0, Math.PI, k);
      art.drawQubble(ctx, qx, qy, s, { bloch: { x: Math.cos(phi), y: Math.sin(phi) * 0.0001, z: 0 }, blanket: 0, state: f >= hit && f < hit + 40 ? 'mumble' : 'sleep' }, t);
      const gx = lerp(1460, 1120, ease.outCubic(prog(f, 0, hit + 10)));
      ctx.save(); ctx.globalAlpha *= 0.72 + 0.25 * Math.sin(t * 3);
      art.drawGremlin(ctx, gx, 925, 3.8, 'phasey', f < hit ? 'sneak' : 'strike', t);
      ctx.restore();
      if (f >= hit) {
        const list = cached('phase', () => {
          const out: Particle[] = [];
          for (let i = 0; i < 18; i++) out.push({ shape: 'swirl', x: qx, y: qy - 100, vx: 0, vy: 0, g: 0, drag: 1, life: 1.0, size: 16 + i * 2.4, rot: (i / 18) * TAU, vr: 5, color: i % 2 ? PAL.phasey : '#e2c2ff' });
          out.push({ shape: 'ring', x: qx, y: qy - 100, vx: 0, vy: 0, g: 0, drag: 1, life: 0.7, size: 70, rot: 0, vr: 0, color: PAL.phasey, grow: 6 });
          return out;
        });
        drawParticles(ctx, list, f, hit);
      }
      break;
    }
    case 'blankets': {
      // three tucked-in Qubbles in the moonlight: you can't see their dreams
      for (let i = 0; i < 3; i++) {
        const x = W / 2 + (i - 1) * 380, y = 930 + (i === 1 ? 14 : 0);
        art.drawQubble(ctx, x, y, 3.5, { bloch: { x: 1, y: 0, z: 0 }, blanket: 1, state: 'sleep' }, t + i * 0.9);
      }
      break;
    }
    case 'morning': {
      for (let i = 0; i < 3; i++) {
        const x = W / 2 + (i - 1) * 380, y = 940;
        art.drawQubble(ctx, x, y, 3.3, { bloch: { x: 1, y: 0, z: 0 }, blanket: 1, state: 'sleep' }, t + i * 0.9);
      }
      break;
    }
  }
}

export const card: Scene<CardParams> = {
  resolve: (p) => {
    const r: CardParams = {
      text: 'Every Qubble dreams two dreams at once.', frames: 180, bg: 'night', y: 300, size: 150, maxW: 1640, font: 'Quantum',
      start: 8, prop: 'none', propHit: 60, grain: 0.045, seed: 1, ...p,
    } as CardParams;
    r.style ??= r.bg === 'day' || r.bg === 'notebook' ? 'day' : 'night';
    r.plate ??= r.bg === 'day';
    return r;
  },
  frames: (p) => p.frames,
  markers: (p) => {
    const n = p.text.replace(/\s/g, '').length;
    const rev = p.reveal ?? defaultReveal(n);
    return { text_start: p.start, text_legible: p.start + rev, prop_hit: p.prop === 'flip' || p.prop === 'phase' ? p.propHit : [], ...(p.exitStart != null ? { exit: p.exitStart } : {}) };
  },
  prepare: async (p) => { await prepareBg({ bg: p.bg, bgImage: p.bgImage }); },
  render(ctx, f, p) {
    drawBg(ctx, f, { bg: p.bg, bgImage: p.bgImage, night: p.night, push: 0.05 }, p.frames);
    drawProp(ctx, f, p);
    const block = layoutText(ctx, p.text, { x: W / 2, y: p.y, size: p.size, maxW: p.maxW, font: p.font });
    if (p.plate) drawPaperPlate(ctx, block.box, prog(f, p.start - 6, p.start + 8), p.seed + 4);
    drawCollapseText(ctx, block, f, { start: p.start, reveal: p.reveal, style: p.style, seed: p.seed, exitStart: p.exitStart, exitDur: p.exitDur });
    if (p.sub) {
      const sb = layoutText(ctx, p.sub, { x: W / 2, y: p.subY ?? p.y + p.size * 1.6, size: p.subSize ?? 52, maxW: 1600, font: 'Quicksand' });
      drawCollapseText(ctx, sb, f, { start: p.subStart ?? p.start + 20, reveal: 16, style: p.style, seed: p.seed + 9, noOrb: true, particles: false });
    }
    if (p.grain > 0 && p.bg !== 'none') grain(ctx, f, p.grain);
  },
};
export { wobble };
