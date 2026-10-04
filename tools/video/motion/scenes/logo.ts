// 1. LOGO REVEAL (the drop). The letters N O P E E K I N G ! fall in as real Qubbles on their beds (squash and
// stretch on landing), wind up, then on the IMPACT frame they all pop/collapse into the real wordmark with a
// white flash, a shockwave, collapse shards and confetti, then settle. Optional glitch tear at the head.
import { type Scene, type Ctx, W, H, FPS, PAL, TAU, clamp, lerp, ease, prog, wobble, shake, hash1 } from '../lib/core';
import { drawBg, prepareBg, type BgKind } from '../lib/bg';
import { drawParticles, collapseBurst, confetti, flash, grain, star4, type Particle } from '../lib/fx';
import { loadLogo, drawLogoLetter, logoLayout, LOGO_TEXT } from '../lib/logo';
import { drawUnit, unitLetterPos } from '../lib/units';
import { layer } from '../lib/layers';
import { glitchFrame } from '../lib/glitch';

export interface LogoParams {
  frames: number;
  bg: BgKind; bgImage?: string;
  /** Frames of glitch tear at the head (0 = none). The glitch tears from black into the scene. */
  glitchIn: number;
  /** Timeline frame at which the glitch starts (default 0). */
  glitchAt: number;
  /** First and last letter landing frames (letters land evenly in between, left to right). */
  landStart: number; landEnd: number;
  /** Frames a letter takes to fall. */
  fall: number;
  /** THE impact frame: flash + pop into the wordmark. */
  impact: number;
  /** Wind-up before the impact (squash + jitter + faster swirls). */
  anticip: number;
  width: number; y: number;
  grain: number;
  /** Explicit landing frames (overrides landStart/landEnd), e.g. on the cue sheet's 16ths. */
  lands?: number[];
  /** Clip frame f shows timeline frame f + offset (cut the reveal into a pre-roll + an impact-first clip). */
  offset: number;
}

const LETTERS = LOGO_TEXT.split(''); // N O P E E K I N G !
const SLOTS = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10]; // slot index per letter (slot 2 = the space)

function geo(p: LogoParams) {
  const slotW = Math.min(158, (W - 160) / 11);
  const S = slotW / 78 * 1.08;
  const x0 = W / 2 - (slotW * 11) / 2 + slotW / 2;
  const gy = p.y + 120;
  return { S, gy, xs: SLOTS.map((s) => x0 + s * slotW) };
}
function landFrame(p: LogoParams, i: number) {
  if (p.lands && p.lands[i] != null) return p.lands[i];
  return Math.round(lerp(p.landStart, p.landEnd, i / (LETTERS.length - 1)));
}

const burstCache = new Map<string, Particle[]>();
function cached(key: string, mk: () => Particle[]) {
  let v = burstCache.get(key); if (!v) { v = mk(); burstCache.set(key, v); } return v;
}

function drawScene(ctx: Ctx, f: number, p: LogoParams) {
  const t = f / FPS;
  const { S, gy, xs } = geo(p);
  const lay = logoLayout(W / 2, p.y, p.width);
  const I = p.impact;
  drawBg(ctx, f, { bg: p.bg, bgImage: p.bgImage, push: 0.03 }, p.frames);

  // camera: tiny push during the wind-up, kick on impact
  const sh = shake(f, I, 16, 22, 11);
  const push = 1 + 0.025 * ease.inCubic(prog(f, I - p.anticip, I)) - 0.025 * ease.outCubic(prog(f, I, I + 30));
  ctx.save();
  ctx.translate(W / 2 + sh.x, H / 2 + sh.y); ctx.scale(push, push); ctx.translate(-W / 2, -H / 2);

  // warm sunburst behind the title (grows on the impact)
  {
    const g0 = f < I ? 0.35 * prog(f, I - p.anticip - 20, I) : 1;
    const kick = f >= I ? 1 + 0.25 * Math.exp(-(f - I) / 10) : 1;
    ctx.save(); ctx.globalAlpha = g0;
    const rg = ctx.createRadialGradient(W / 2, p.y, 40, W / 2, p.y, 900 * kick);
    rg.addColorStop(0, 'rgba(255,214,120,0.55)'); rg.addColorStop(0.5, 'rgba(255,200,110,0.18)'); rg.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, p.y); ctx.rotate(f * 0.0035); ctx.scale(kick, kick);
    for (let k = 0; k < 16; k++) {
      ctx.rotate(TAU / 16);
      ctx.fillStyle = k % 2 ? 'rgba(255,236,190,0.22)' : 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1400, -110); ctx.lineTo(1400, 110); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  if (f < I) {
    // ── letter units falling in ──
    const wind = ease.inCubic(prog(f, I - p.anticip, I));
    LETTERS.forEach((ch, i) => {
      const L = landFrame(p, i);
      const u = f - (L - p.fall);
      if (u < 0) return;
      let y = gy, sx = 1, sy = 1;
      if (f < L) {
        const k = u / p.fall;
        y = gy - (gy + 260) * (1 - k * k);
        sy = 1 + 0.22 * k; sx = 1 / Math.sqrt(sy);
      } else {
        const w = wobble(f - L, 0.075, 0.13);
        sy = 1 - 0.3 * w; sx = 1 + 0.24 * w;
      }
      // wind-up: everyone squashes and trembles
      sy *= 1 - 0.16 * wind; sx *= 1 + 0.1 * wind;
      const jx = wind > 0 ? Math.sin(f * 2.7 + i * 1.9) * 3.2 * wind : 0;
      const state = 'sleep';
      drawUnit(ctx, xs[i], y, S, ch, { t, phase: i * 0.7, sx, sy, jx, spin: 1 + 5 * wind, state });
      // landing dust
      if (f >= L && f < L + 40) {
        const dust = cached(`d${i}`, () => {
          const out: Particle[] = [];
          for (let k = 0; k < 6; k++) {
            const side = k % 2 ? 1 : -1;
            out.push({ shape: 'puff', x: xs[i] + side * 34 * S, y: gy + 6 * S, vx: side * (90 + hash1(i * 9 + k) * 90), vy: -20 - hash1(i * 5 + k) * 30, g: 0, drag: 4, life: 0.5, size: 7 * S, rot: 0, vr: 0, color: 'rgba(255,255,255,0.9)' });
          }
          return out;
        });
        drawParticles(ctx, dust, f, L);
      }
    });
  } else {
    // ── wordmark ──
    const settle = f - I;
    LETTERS.forEach((_, i) => {
      const d = Math.round(Math.abs(i - 4.5) * 0.9); // pop from the centre outward
      const u = settle - d;
      const from = unitLetterPos(xs[i], gy, S);
      const to = lay.letters[i];
      if (u < 0) {
        // not popped yet: its unit's letter is still flying
        return;
      }
      const k = clamp(u / 12);
      const e = ease.outBack(k, 1.9);
      const x = lerp(from.x, to.x, ease.outCubic(k));
      const y = lerp(from.y, to.y, ease.outCubic(k));
      const kk = lerp(from.size / 700 * 0.9, lay.k, e);
      const w = u > 12 ? wobble(u - 12, 0.06, 0.09) : 0;
      const bob = settle > 30 ? Math.sin((f - I - 30) / FPS * 2.2 + i * 0.7) * 3 * clamp((settle - 30) / 30) : 0;
      drawLogoLetter(ctx, i, { x, y: y + bob, k: kk, sx: 1 + 0.06 * w, sy: 1 - 0.07 * w, rot: (1 - k) * (hash1(i) - 0.5) * 0.6 + w * 0.03, tint: clamp(1 - u / 8) });
    });
  }
  // impact shockwave + collapse pops + confetti
  if (f >= I) {
    const u = f - I;
    if (u < 26) {
      const r = lerp(60, 1300, ease.outCubic(u / 26));
      ctx.save();
      ctx.globalAlpha = (1 - u / 26) * 0.9;
      ctx.lineWidth = lerp(46, 2, u / 26); ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(W / 2, p.y, r, r * 0.62, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    LETTERS.forEach((_, i) => drawParticles(ctx, cached(`c${i}`, () => collapseBurst(xs[i], gy - 22 * S, 500 + i * 17, 1.05)), f, I));
    drawParticles(ctx, cached('conf', () => confetti(80, W - 80, H + 40, 77, 120)), f, I + 2);
    // twinkles around the settled wordmark
    if (u > 24) {
      for (let k = 0; k < 9; k++) {
        const ph = ((f - I) / FPS * 1.3 + hash1(k * 3) ) % 1;
        const a = Math.sin(ph * Math.PI);
        const sx = W / 2 + (hash1(k * 11 + 1) - 0.5) * p.width * 1.05;
        const sy = p.y + (hash1(k * 7 + 2) - 0.5) * 300;
        ctx.save(); ctx.globalAlpha = a * clamp((u - 24) / 20); ctx.fillStyle = k % 2 ? '#fff6d8' : '#ffffff';
        star4(ctx, sx, sy, 6 + 10 * a); ctx.fill(); ctx.restore();
      }
    }
  }
  ctx.restore();
  // flash: full white on the impact frame, then decays
  if (f >= I) flash(ctx, [1, 0.75, 0.45, 0.25, 0.12, 0.05][f - I] ?? 0);
  if (p.grain > 0 && p.bg !== 'none') grain(ctx, f, p.grain);
}

export const logo: Scene<LogoParams> = {
  resolve: (p) => ({
    // defaults follow videos/music/cue_sheet.json: clip starts on the drop (f1394), beat = 32 frames;
    // glitch on the drop hit, letters land on 16ths (every 8 frames), wordmark IMPACT on the next downbeat
    // (clip f96 = trailer f1490, the strongest detected hit). offset shifts the clip window on the timeline.
    frames: 192, offset: 0, bg: 'day', glitchIn: 6, glitchAt: 0, landStart: 8, landEnd: 80, fall: 12, impact: 96, anticip: 14,
    width: 1640, y: 500, grain: 0.04, ...p,
  }),
  frames: (p) => p.frames,
  markers: (p) => ({ impact: p.impact - p.offset, timeline_offset: p.offset, flash: [p.impact - p.offset, p.impact + 5 - p.offset], glitch: [p.glitchAt - p.offset, p.glitchAt + p.glitchIn - 1 - p.offset], lands: LETTERS.map((_, i) => landFrame(p, i) - p.offset) }),
  prepare: async (p) => { await loadLogo(); await prepareBg({ bg: p.bg, bgImage: p.bgImage }); },
  render(ctx, f0, p) {
    const f = f0 + p.offset;
    if (f >= p.glitchAt && f < p.glitchAt + p.glitchIn) {
      const B = layer(ctx, 'logoB');
      drawScene(B.g, f, p);
      glitchFrame(ctx, f - p.glitchAt, p.glitchIn, B.c, p.bg === 'none' ? () => {} : null, 5);
      return;
    }
    drawScene(ctx, f, p);
  },
};
