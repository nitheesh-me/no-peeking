// 3. CARDS set inside the game world. Text arrives letter by letter as tiny Qubbles that pop into Quantum
// glyphs. Each card has an optional "prop" vignette made from the real art (a dreaming Qubble, a gremlin
// flipping a bit, Phasey flipping a phase, blanketed beds). bg: night | day | dusk | notebook | image | none.
import art from '../../../../src/art';
import { type Scene, type Ctx, W, H, FPS, PAL, TAU, clamp, lerp, ease, prog, wobble, roundRect, RT } from '../lib/core';
import { drawBg, prepareBg, type BgKind } from '../lib/bg';
import { layoutText, drawCollapseText, drawPaperPlate, defaultReveal, legibleAt, type TextStyle } from '../lib/text';
import { drawParticles, collapseBurst, grain, sparkBurst, type Particle } from '../lib/fx';

export type Prop = 'none' | 'dream' | 'flip' | 'phase' | 'wobble' | 'blankets' | 'morning';
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
  /** 'center' (full card) or 'corner': lower-left overlay, left-aligned text with a small prop Qubble beside it, no gremlin sprite (the real gremlin is in the footage). */
  layout?: 'center' | 'corner' | 'topleft';
  /** Emphasise words (indices in the text's word list) in red. */
  redWords?: number[];
  /** Frame at which the prop's event happens (the flip/phase hit). */
  propHit: number;
  /** Second, smaller Quicksand line under the main text. */
  sub?: string; subY?: number; subSize?: number; subStart?: number;
  plate?: boolean;
  /** Optional second text block that arrives later (same style), e.g. a two-beat card. */
  text2?: string; y2?: number; start2?: number;
  grain: number;
  seed: number;
}

const cache = new Map<string, Particle[]>();
const cached = (k: string, mk: () => Particle[]) => { let v = cache.get(k); if (!v) { v = mk(); cache.set(k, v); } return v; };

const CORNER = { qx: 190, qy: 1000, s: 2.6, tx: 330, ty: 905 };
/** Top-left wall area of the X-ray gremlin shots (clear of the rug, sprites, labels and the top-centre X-ray tag). */
const TOPLEFT = { qx: 104, qy: 296, s: 2.6, tx: 206 };
const KIND: Record<string, 'flipper' | 'phasey' | 'wobbles'> = { flip: 'flipper', phase: 'phasey', wobble: 'wobbles' };
const KCOL: Record<string, string[]> = { flip: [PAL.red, '#fff36b'], phase: [PAL.phasey, '#e2c2ff'], wobble: ['#a5e05b', '#e9ffc8'] };
/** Caption icon = the gremlin's own game sprite (drawGremlin), striking on the prop hit. */
function drawGremlinIcon(ctx: Ctx, f: number, p: CardParams) {
  const t = f / FPS, hit = p.propHit;
  const kind = KIND[p.prop];
  const pose = f < hit - 8 ? 'taunt' : f < hit + 26 ? 'strike' : 'taunt';
  const pop = ease.outBack(prog(f, p.start - 4, p.start + 10), 2.2);
  const jig = p.prop === 'wobble' && f >= hit ? Math.exp(-(f - hit) / 16) * Math.sin((f - hit) * 0.9) : 0;
  const L = p.layout === 'topleft' ? TOPLEFT : CORNER;
  const x = L.qx, y = L.qy;
  ctx.save();
  ctx.translate(x, y); ctx.scale(pop * (1 + 0.14 * jig), pop * (1 - 0.14 * jig)); ctx.translate(-x, -y);
  if (p.prop === 'phase') ctx.globalAlpha *= 0.8 + 0.2 * Math.sin(t * 3);
  // soft dark disc so the sprite reads over any footage
  const g = ctx.createRadialGradient(x, y - 60, 10, x, y - 60, 120);
  g.addColorStop(0, 'rgba(10,8,30,0.55)'); g.addColorStop(1, 'rgba(10,8,30,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 60, 120, 0, TAU); ctx.fill();
  art.drawGremlin(ctx, x, y, 3.2, kind, pose as any, t);
  ctx.restore();
  if (f >= hit) drawParticles(ctx, cached('gi' + p.prop, () => sparkBurst(x + 40, y - 90, 77, 1.2, 12, KCOL[p.prop])), f, hit);
}
function drawProp(ctx: Ctx, f: number, p: CardParams) {
  const corner = p.layout === 'corner' || p.layout === 'topleft';
  if (corner && KIND[p.prop]) { drawGremlinIcon(ctx, f, p); return; }
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
      const [qx, qy, s] = corner ? [CORNER.qx, CORNER.qy, CORNER.s] : [1140, 940, 3.8];
      const flipped = f >= hit;
      const st = flipped && f < hit + 40 ? 'scared' : 'sleep';
      art.drawQubble(ctx, qx, qy, s, { bloch: { x: 0, y: 0, z: flipped ? -1 : 1 }, blanket: 0, state: st }, t);
      const gx = lerp(520, 860, ease.outCubic(prog(f, 0, hit)));
      const pose = f < hit - 6 ? 'sneak' : f < hit + 20 ? 'strike' : 'taunt';
      if (!corner) art.drawGremlin(ctx, gx, 945, 3.8, 'flipper', pose, t);
      const k0 = s / 3.8;
      if (f >= hit) drawParticles(ctx, cached('flip' + corner, () => [...sparkBurst(qx, qy - 100 * k0, 41, 1.6 * k0, 14, [PAL.red, '#fff36b']), ...collapseBurst(qx, qy - 100 * k0, 42, 1.0 * k0, [PAL.red, '#fff36b', '#ffffff'])]), f, hit);
      break;
    }
    case 'phase': {
      // Phasey drifts past a swirl Qubble: the swirl mirrors (|+⟩ → |−⟩, a phase flip) with a purple swirl
      const [qx, qy, s] = corner ? [CORNER.qx, CORNER.qy, CORNER.s] : [780, 940, 3.8];
      const k0 = s / 3.8;
      const k = ease.inOutCubic(prog(f, hit, hit + 14));
      const phi = lerp(0, Math.PI, k);
      art.drawQubble(ctx, qx, qy, s, { bloch: { x: Math.cos(phi), y: Math.sin(phi) * 0.0001, z: 0 }, blanket: 0, state: f >= hit && f < hit + 40 ? 'mumble' : 'sleep' }, t);
      const gx = lerp(1460, 1120, ease.outCubic(prog(f, 0, hit + 10)));
      if (!corner) { ctx.save(); ctx.globalAlpha *= 0.72 + 0.25 * Math.sin(t * 3);
      art.drawGremlin(ctx, gx, 925, 3.8, 'phasey', f < hit ? 'sneak' : 'strike', t);
      ctx.restore(); }
      if (f >= hit) {
        const list = cached('phase' + corner, () => {
          const out: Particle[] = [];
          for (let i = 0; i < 18; i++) out.push({ shape: 'swirl', x: qx, y: qy - 100 * k0, vx: 0, vy: 0, g: 0, drag: 1, life: 1.0, size: (16 + i * 2.4) * k0, rot: (i / 18) * TAU, vr: 5, color: i % 2 ? PAL.phasey : '#e2c2ff' });
          out.push({ shape: 'ring', x: qx, y: qy - 100 * k0, vx: 0, vy: 0, g: 0, drag: 1, life: 0.7, size: 70 * k0, rot: 0, vr: 0, color: PAL.phasey, grow: 6 });
          return out;
        });
        drawParticles(ctx, list, f, hit);
      }
      break;
    }
    case 'wobble': {
      // Wobbles' jelly jiggle tilts a Sunny Qubble's dream only PART of the way toward Moony: a coherent partial
      // rotation (θ: 0 → 70°, the colour mixes, it doesn't fully flip) — honest picture of a small over-rotation.
      const [qx, qy, s] = corner ? [CORNER.qx, CORNER.qy, CORNER.s] : [W / 2 + 260, 940, 3.8];
      const k0 = s / 3.8;
      const th = lerp(0, 1.22, ease.outBack(prog(f, hit, hit + 22), 1.4));
      const jig = f >= hit ? Math.exp(-(f - hit) / 18) * Math.sin((f - hit) * 0.9) : 0;
      ctx.save();
      ctx.translate(qx, qy); ctx.scale(1 + 0.12 * jig, 1 - 0.12 * jig); ctx.translate(-qx, -qy);
      art.drawQubble(ctx, qx, qy, s, { bloch: { x: Math.sin(th), y: 0, z: Math.cos(th) }, blanket: 0, state: f >= hit && f < hit + 40 ? 'giggle' : 'sleep' }, t);
      ctx.restore();
      if (!corner) art.drawGremlin(ctx, lerp(W / 2 - 420, W / 2 - 180, ease.outCubic(prog(f, 0, hit))), 945, 3.8, 'wobbles', f < hit - 4 ? 'sneak' : f < hit + 24 ? 'strike' : 'taunt', t);
      if (f >= hit) {
        const list = cached('wob' + corner, () => {
          const out: Particle[] = [];
          for (let i = 0; i < 3; i++) out.push({ shape: 'ring', x: qx, y: qy - 70 * k0, vx: 0, vy: 0, g: 0, drag: 1, life: 0.9, size: (60 + i * 22) * k0, rot: 0, vr: 0, color: '#a5e05b', grow: 6, delay: i * 0.12 });
          for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; out.push({ shape: 'dot', x: qx, y: qy - 70 * k0, vx: Math.cos(a) * 160 * k0, vy: Math.sin(a) * 90 * k0 - 60 * k0, g: 260 * k0, drag: 1.5, life: 0.8, size: 5 * k0, rot: 0, vr: 0, color: '#a5e05b' }); }
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
    const n = (p.text + (p.text2 ?? '')).replace(/\s/g, '').length;
    const rev = legibleAt({ reveal: p.reveal }, n);
    return { text_start: p.start, text_legible: p.text2 ? p.start + legibleAt({ reveal: p.reveal }, p.text.replace(/\s/g, '').length) : p.start + rev, ...(p.text2 ? { text2_legible: (p.start2 ?? p.start + 40) + legibleAt({ reveal: 14 }, 1) } : {}), prop_hit: p.prop === 'flip' || p.prop === 'phase' || p.prop === 'wobble' ? p.propHit : [], ...(p.exitStart != null ? { exit: p.exitStart } : {}) };
  },
  prepare: async (p) => { await prepareBg({ bg: p.bg, bgImage: p.bgImage }); },
  render(ctx, f, p) {
    drawBg(ctx, f, { bg: p.bg, bgImage: p.bgImage, night: p.night, push: 0.05 }, p.frames);
    if (p.layout !== 'topleft') drawProp(ctx, f, p);
    const corner = p.layout === 'corner' || p.layout === 'topleft';
    const tx = p.layout === 'topleft' ? TOPLEFT.tx : CORNER.tx;
    const block = corner
      ? layoutText(ctx, p.text, { x: tx, y: p.y, size: p.size, maxW: p.maxW, font: p.font, align: 'left' })
      : layoutText(ctx, p.text, { x: W / 2, y: p.y, size: p.size, maxW: p.maxW, font: p.font });
    const block2 = p.text2 ? layoutText(ctx, p.text2, { x: W / 2, y: p.y2 ?? p.y + p.size * 1.25, size: p.size, maxW: p.maxW, font: p.font }) : null;
    if (p.layout === 'topleft') {
      // dark plate under the whole block (text + icon) so the paper text keeps ≥ 4.5:1 even over the light page
      // outside the room in wide shots: 74 % core, feathered edge.
      const k = prog(f, p.start - 4, p.start + 10) * (p.exitStart != null ? 1 - prog(f, p.exitStart, p.exitStart + 12) : 1);
      const bx = block.box, x0 = 26, y0 = bx.y - 34, x1 = bx.x + bx.w + 44, y1 = bx.y + bx.h + 40;
      ctx.save(); ctx.globalAlpha *= k;
      ctx.shadowColor = 'rgba(8,6,24,0.74)'; ctx.shadowBlur = 34 * RT.dpr;
      ctx.fillStyle = 'rgba(8,6,24,0.74)';
      roundRect(ctx, x0, y0, x1 - x0, y1 - y0, 36); ctx.fill();
      ctx.restore();
      drawProp(ctx, f, p); // the gremlin sprite sits on top of the plate
    }
    if (p.plate) {
      const bx = block2 ? { x: Math.min(block.box.x, block2.box.x), y: block.box.y, w: Math.max(block.box.x + block.box.w, block2.box.x + block2.box.w) - Math.min(block.box.x, block2.box.x), h: block2.box.y + block2.box.h - block.box.y } : block.box;
      const ex = p.exitStart != null ? 1 - ease.inOutCubic(prog(f, p.exitStart - 2, p.exitStart + (p.exitDur ?? 10) - 1)) : 1; // plate leaves with (slightly ahead of) the letters
      ctx.save(); ctx.globalAlpha *= ex; drawPaperPlate(ctx, bx, prog(f, p.start - 6, p.start + 8), p.seed + 4); ctx.restore();
    }
    if (block2) drawCollapseText(ctx, block2, f, { start: p.start2 ?? p.start + 40, reveal: 14, style: p.style, seed: p.seed + 3, exitStart: p.exitStart, exitDur: p.exitDur, colorOf: p.redWords ? (g) => (p.redWords!.includes(100 + g.word) ? PAL.red : undefined) : undefined });
    drawCollapseText(ctx, block, f, { start: p.start, reveal: p.reveal, style: p.style, seed: p.seed, exitStart: p.exitStart, exitDur: p.exitDur, colorOf: p.redWords ? (g) => (p.redWords!.includes(g.word) ? PAL.red : undefined) : undefined });
    if (p.sub) {
      const sb = layoutText(ctx, p.sub, { x: W / 2, y: p.subY ?? p.y + p.size * 1.6, size: p.subSize ?? 52, maxW: 1600, font: 'Quicksand' });
      drawCollapseText(ctx, sb, f, { start: p.subStart ?? p.start + 20, reveal: 16, style: p.style, seed: p.seed + 9, noOrb: true, particles: false });
    }
    if (p.grain > 0 && p.bg !== 'none') grain(ctx, f, p.grain);
  },
};
export { wobble };
