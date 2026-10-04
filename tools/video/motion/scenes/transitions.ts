// 4. TRANSITIONS: collapse shatter (once, at the peek), glitch tear (once, at the drop), blanket wipe
// (showcase chapter/level-title changes). Each renders as clips usable with ffmpeg maskedmerge/overlay.
import art from '../../../../src/art';
import { type Scene, type Ctx, W, H, FPS, PAL, TAU, clamp, lerp, ease, prog, hash1, rng, RT, roundRect } from '../lib/core';
import { sky, notebook } from '../lib/bg';
import { layer } from '../lib/layers';
import { shatterFrame } from '../lib/shatter';
import { glitchBands, glitchFrame } from '../lib/glitch';
import { grain } from '../lib/fx';

// ───────────────────────── collapse shatter ─────────────────────────
export interface ShatterParams {
  /** 'qubble' = a swirling Qubble close-up that snaps to a pole, then shatters; or an absolute image path. */
  src: string; pre: number; dur: number; tail: number; flash: number;
  cx: number; cy: number; pole: 0 | 1; seed: number; bg?: string;
}
const imgs = new Map<string, HTMLImageElement>();
function drawQubbleCloseup(g: Ctx, f: number, p: ShatterParams) {
  const t = 3 + f / FPS;
  sky(g, f, 1, 0, 1);
  g.fillStyle = 'rgba(8,8,30,0.35)'; g.fillRect(0, 0, W, H);
  const snap = p.pre - 4; // swirl → pole over the last 4 frames before the hit
  const k = ease.outBack(prog(f, snap, p.pre - 1), 2.5);
  const a = t * 2.4;
  const z = (p.pole ? -1 : 1) * clamp(k);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  const s = 15;
  g.save();
  const zoom = 1 + 0.04 * (f / Math.max(1, p.pre));
  g.translate(p.cx, p.cy); g.scale(zoom, zoom); g.translate(-p.cx, -p.cy);
  art.drawQubble(g, p.cx, p.cy + 23 * s, s, { bloch: { x: Math.cos(a) * r, y: Math.sin(a) * r, z }, blanket: 0, state: f >= snap ? 'awake-grumpy' : 'sleep' }, t);
  g.restore();
}
function shatterSrc(ctx: Ctx, f: number, p: ShatterParams) {
  const L = layer(ctx, 'shSrc');
  if (p.src === 'qubble') drawQubbleCloseup(L.g, Math.min(f, p.pre - 1), p);
  else { const im = imgs.get(p.src); if (im) L.g.drawImage(im, 0, 0, W, H); }
  return L.c;
}
export const shatter: Scene<ShatterParams> = {
  resolve: (p) => ({ src: 'qubble', pre: 16, dur: 13, tail: 7, flash: 2, cx: W / 2, cy: H / 2 - 10, pole: 1, seed: 4, ...p }),
  frames: (p) => p.pre + p.dur + p.tail,
  markers: (p) => ({ impact: p.pre, flash: [p.pre, p.pre + p.flash - 1], shards_gone: p.pre + p.dur, black: [p.pre + p.dur, p.pre + p.dur + p.tail] }),
  prepare: async (p) => {
    if (p.src !== 'qubble' && !imgs.has(p.src)) { const im = new Image(); im.src = `/@fs${p.src}`; await im.decode(); imgs.set(p.src, im); }
  },
  render(ctx, f, p) {
    const alpha = p.bg === 'none';
    const src = shatterSrc(ctx, f, p);
    shatterFrame(ctx, src, f - p.pre, { cx: p.cx, cy: p.cy, dur: p.dur, flash: p.flash, seed: p.seed, black: !alpha });
    if (!alpha && f < p.pre) grain(ctx, f, 0.04);
  },
};

// ───────────────────────── glitch tear ─────────────────────────
export interface GlitchParams { frames: number; out: 'matte' | 'fx' | 'demo'; seed: number; bg?: string }
export const glitch: Scene<GlitchParams> = {
  resolve: (p) => ({ frames: 6, out: 'matte', seed: 5, ...p }),
  frames: (p) => p.frames,
  markers: (p) => ({ start: 0, end: p.frames - 1 }),
  render(ctx, f, p) {
    if (p.out === 'matte') {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff';
      for (const b of glitchBands(f, p.frames, p.seed)) if (b.on) ctx.fillRect(0, b.y0, W, b.y1 - b.y0);
      return;
    }
    if (p.out === 'fx') {
      // the colour sparks / pixel blocks / band edges only (overlay with its matte)
      const cols = [PAL.sunny, PAL.moony, PAL.phasey, '#ffffff'];
      for (let i = 0; i < 14; i++) {
        const r = (m: number) => hash1(p.seed * 7000 + f * 211 + i * 17 + m);
        ctx.globalAlpha = 0.55 + r(5) * 0.4; ctx.fillStyle = cols[i % 4];
        ctx.fillRect(r(3) * W, r(1) * H, 40 + r(2) * 420, 2 + r(4) * (i % 3 === 0 ? 26 : 5));
      }
      ctx.globalAlpha = 0.8;
      for (const b of glitchBands(f, p.frames, p.seed)) if (b.on) { ctx.fillStyle = cols[(b.y0 | 0) % 3]; ctx.fillRect(0, b.y0, W, 3); }
      return;
    }
    // demo: day sky (A) tearing into night (B)
    const B = layer(ctx, 'gdB'); sky(B.g, f, 1, 0, 1);
    glitchFrame(ctx, f, p.frames, B.c, (g) => sky(g, f, 0.1, 0, 1), p.seed);
  },
};

// ───────────────────────── blanket wipe ─────────────────────────
let quiltTile: HTMLCanvasElement | null = null;
function quiltTex() {
  if (quiltTile) return quiltTile;
  const N = 96, c = document.createElement('canvas'); c.width = c.height = N * 2;
  const g = c.getContext('2d')!;
  const cols = ['#f5a3b5', '#fff1dc', '#9fd8d0', '#fff1dc'];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = cols[(i + j * 2) % 4]; g.fillRect(i * N, j * N, N, N); }
  g.fillStyle = '#e5728c';
  const heart = (cx: number, cy: number, s: number) => { g.beginPath(); g.moveTo(cx, cy + 6 * s); g.bezierCurveTo(cx - 9 * s, cy - s, cx - 4 * s, cy - 8 * s, cx, cy - 3 * s); g.bezierCurveTo(cx + 4 * s, cy - 8 * s, cx + 9 * s, cy - s, cx, cy + 6 * s); g.fill(); };
  heart(N / 2, N / 2, 3);
  g.fillStyle = '#5fb3a8';
  for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75], [0.5, 0.5]]) { g.beginPath(); g.arc(N + x * N, N + y * N, 7, 0, TAU); g.fill(); }
  g.fillStyle = '#f2c9a0';
  for (const [x, y] of [[N * 1.5, N / 2], [N / 2, N * 1.5]]) { g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill(); }
  g.lineWidth = 1.2;
  for (let k = 0; k < 2 * N; k += 4) {
    g.strokeStyle = 'rgba(90,50,60,0.07)'; g.beginPath(); g.moveTo(k + 0.5, 0); g.lineTo(k + 0.5, 2 * N); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(0, k + 1.5); g.lineTo(2 * N, k + 1.5); g.stroke();
  }
  g.strokeStyle = 'rgba(120,70,80,0.55)'; g.setLineDash([12, 8]); g.lineWidth = 4;
  for (let k = 0; k <= 2; k++) {
    g.beginPath(); g.moveTo(k * N + 6, 0); g.lineTo(k * N + 6, 2 * N); g.stroke();
    g.beginPath(); g.moveTo(0, k * N + 6); g.lineTo(2 * N, k * N + 6); g.stroke();
  }
  quiltTile = c; return c;
}

export interface BlanketParams {
  mode: 'pass' | 'title'; dur: number; hold: number;
  out: 'overlay' | 'reveal' | 'demo';
  title?: string; code?: string; seed: number; bg?: string;
}
/** Quilt edges at frame f: leading xl(y) and trailing xt(y); plus "covering" flag for title mode. */
function edges(f: number, p: BlanketParams) {
  const bulge = 90, fold = 12;
  const wav = (y: number, ph: number) => bulge * Math.sin(Math.PI * y / H) + fold * Math.sin(y * 0.018 + ph);
  if (p.mode === 'pass') {
    const BW = W * 1.1;
    const k = ease.inOutCubic(prog(f, 0, p.dur - 1));
    const lead = lerp(-bulge - 20, W + BW + bulge + 40, k);
    return { xl: (y: number) => lead + wav(y, f * 0.6), xt: (y: number) => lead - BW + wav(y, f * 0.6 + 1.3) };
  }
  // title: cover (dur) → hold → uncover to the right (dur)
  const kin = ease.inOutCubic(prog(f, 0, p.dur - 1));
  const kout = ease.inOutCubic(prog(f, p.dur + p.hold, p.dur * 2 + p.hold - 1));
  const lead = lerp(-bulge - 20, W + bulge + 60, kin);
  const trail = kout > 0 ? lerp(-bulge - 60, W + bulge + 60, kout) : -1e5;
  return { xl: (y: number) => lead + wav(y, f * 0.6), xt: (y: number) => trail + wav(y, f * 0.6 + 1.3) };
}
function edgePath(fx: (y: number) => number, right: boolean) {
  const p = new Path2D();
  const xOuter = right ? 1e4 : -1e4;
  p.moveTo(xOuter, -20);
  for (let y = -20; y <= H + 20; y += 12) p.lineTo(fx(y), y);
  p.lineTo(xOuter, H + 20); p.closePath();
  return p;
}
function quiltRegion(e: ReturnType<typeof edges>) {
  const p = new Path2D();
  for (let y = -20; y <= H + 20; y += 12) p.lineTo(e.xl(y), y);
  for (let y = H + 20; y >= -20; y -= 12) p.lineTo(Math.max(-1e4, e.xt(y)), y);
  p.closePath();
  return p;
}
function drawQuilt(ctx: Ctx, f: number, p: BlanketParams) {
  const e = edges(f, p);
  const region = quiltRegion(e);
  // cast shadow ahead of the leading edge
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const off = 10 + i * 12;
    ctx.globalAlpha = 0.07;
    const sp = new Path2D();
    for (let y = -20; y <= H + 20; y += 12) sp.lineTo(e.xl(y) + off, y + off * 0.3);
    for (let y = H + 20; y >= -20; y -= 12) sp.lineTo(Math.max(-1e4, e.xt(y)), y);
    sp.closePath();
    ctx.fillStyle = '#1a1030'; ctx.fill(sp);
  }
  ctx.restore();
  ctx.save();
  ctx.clip(region);
  const pat = ctx.createPattern(quiltTex(), 'repeat')!;
  const drift = e.xl(H / 2);
  pat.setTransform(new DOMMatrix().translate(drift * 0.15, 0).rotate(45).scale(0.75));
  ctx.fillStyle = pat; ctx.fillRect(-50, -50, W + 100, H + 100);
  // soft folds: vertical light/dark bands that ride with the quilt
  const lead = e.xl(H / 2);
  const g = ctx.createLinearGradient(lead - 2200, 0, lead, 0);
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    g.addColorStop(u, i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(70,30,60,0.14)');
  }
  ctx.fillStyle = g; ctx.fillRect(-50, -50, W + 100, H + 100);
  // rolled hem along the leading edge
  ctx.lineWidth = 46; ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  const hem = new Path2D(); for (let y = -20; y <= H + 20; y += 12) hem.lineTo(e.xl(y) - 26, y);
  ctx.stroke(hem);
  ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(70,30,60,0.18)';
  const hem2 = new Path2D(); for (let y = -20; y <= H + 20; y += 12) hem2.lineTo(e.xl(y) - 6, y);
  ctx.stroke(hem2);
  ctx.restore();
  // ink edges (the game's outline)
  ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.lineJoin = 'round';
  const le = new Path2D(); for (let y = -20; y <= H + 20; y += 12) le.lineTo(e.xl(y), y); ctx.stroke(le);
  if (e.xt(H / 2) > -2000) { const te = new Path2D(); for (let y = -20; y <= H + 20; y += 12) te.lineTo(e.xt(y), y); ctx.stroke(te); }
  // sewn-on title patch (title mode)
  if (p.mode === 'title' && p.title) {
    const k = prog(f, p.dur - 6, p.dur + 6);
    const cx = Math.min(W / 2, e.xl(H / 2) - 520) + 0, cy = H / 2;
    if (k > 0) {
      ctx.save();
      ctx.font = '96px Quantum';
      const tw = ctx.measureText(p.title).width;
      const w = tw + 160, h = 250;
      ctx.translate(cx, cy); ctx.rotate(-0.02);
      roundRect(ctx, -w / 2 + 8, -h / 2 + 12, w, h, 26); ctx.fillStyle = 'rgba(40,20,40,0.35)'; ctx.fill();
      roundRect(ctx, -w / 2, -h / 2, w, h, 26); ctx.fillStyle = '#fbf8f1'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.setLineDash([14, 10]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(200,90,120,0.8)';
      roundRect(ctx, -w / 2 + 14, -h / 2 + 14, w - 28, h - 28, 18); ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = PAL.ink;
      ctx.fillText(p.title, 0, 50);
      if (p.code) {
        ctx.font = '44px Quantum';
        const cw = ctx.measureText(p.code).width + 44;
        roundRect(ctx, -cw / 2, -h / 2 - 30, cw, 64, 32); ctx.fillStyle = PAL.ink; ctx.fill();
        ctx.fillStyle = PAL.paper; ctx.fillText(p.code, 0, -h / 2 + 17);
      }
      ctx.restore();
    }
  }
}
export const blanket: Scene<BlanketParams> = {
  resolve: (p) => ({ mode: 'pass', dur: 18, hold: 36, out: 'overlay', seed: 1, ...p }),
  frames: (p) => (p.mode === 'pass' ? p.dur : p.dur * 2 + p.hold),
  markers: (p) => p.mode === 'pass' ? { start: 0, end: p.dur - 1 } : { covered: p.dur - 1, hold: [p.dur, p.dur + p.hold - 1], end: p.dur * 2 + p.hold - 1 },
  render(ctx, f, p) {
    if (p.out === 'reveal') {
      // white where B (the incoming shot) shows: left of the trailing edge (pass) / after the cover (title)
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const e = edges(f, p);
      ctx.fillStyle = '#fff';
      if (p.mode === 'pass') ctx.fill(edgePath(e.xt, false));
      else if (f >= p.dur) { ctx.fillRect(0, 0, W, H); }
      return;
    }
    if (p.out === 'demo') {
      const e = edges(f, p);
      sky(ctx, f, 0.1, 0, 1);
      ctx.save(); ctx.clip(p.mode === 'pass' ? edgePath(e.xt, false) : new Path2D(f >= p.dur ? `M0 0H${W}V${H}H0Z` : 'M0 0Z'));
      notebook(ctx, f); ctx.restore();
    }
    drawQuilt(ctx, f, p);
  },
};
export { rng, RT };
