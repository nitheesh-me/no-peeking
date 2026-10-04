// The collapse shatter: a frozen frame breaks along log-spiral cuts (the swirl's own spiral) around the
// impact point, shards rimmed in Sunny/Moony fly toward camera with motion blur, then black.
import { type Ctx, W, H, TAU, PAL, clamp, ease, hash1, lerp } from './core';
import { flash } from './fx';

interface Shard { pts: [number, number][]; cx: number; cy: number; dir: number; r: number; spin: number; speed: number; rim: string }
const cache = new Map<string, Shard[]>();

export function shards(cx: number, cy: number, seed = 1, sectors = 9, twist = 0.7): Shard[] {
  const key = `${cx}|${cy}|${seed}|${sectors}|${twist}`;
  const hit = cache.get(key); if (hit) return hit;
  const radii = [0, 110];
  while (radii[radii.length - 1] < 2400) radii.push(radii[radii.length - 1] * (1.75 + hash1(seed * 31 + radii.length) * 0.3));
  const th = (j: number, r: number) => (j / sectors) * TAU + (hash1(seed * 7 + j) - 0.5) * 0.25 + twist * Math.log(Math.max(1, r) / 110);
  const out: Shard[] = [];
  for (let k = 0; k < radii.length - 1; k++) {
    for (let j = 0; j < sectors; j++) {
      const r0 = radii[k], r1 = radii[k + 1];
      const pts: [number, number][] = [];
      const P = (j2: number, r: number) => { const a = th(j2, r); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); };
      const N = 5;
      for (let i = 0; i <= N; i++) P(j, lerp(r0, r1, i / N));              // up boundary j
      for (let i = 1; i <= N; i++) { const a0 = th(j, r1), a1 = th(j + 1, r1); const a = lerp(a0, a1, i / N); pts.push([cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]); }
      for (let i = N - 1; i >= 0; i--) P(j + 1, lerp(r0, r1, i / N));      // down boundary j+1
      if (r0 > 0) for (let i = N - 1; i > 0; i--) { const a0 = th(j, r0), a1 = th(j + 1, r0); const a = lerp(a0, a1, i / N); pts.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]); }
      let sx = 0, sy = 0; for (const [x, y] of pts) { sx += x; sy += y; }
      const scx = sx / pts.length, scy = sy / pts.length;
      const h = hash1(seed * 1000 + k * 53 + j);
      out.push({ pts, cx: scx, cy: scy, dir: Math.atan2(scy - cy, scx - cx) + (h - 0.5) * 0.4, r: Math.hypot(scx - cx, scy - cy), spin: (hash1(seed * 77 + k * 9 + j) - 0.5) * 2.4, speed: 0.7 + h * 0.8, rim: (j + k) % 2 ? PAL.sunny : PAL.moony });
    }
  }
  cache.set(key, out);
  return out;
}

export interface ShatterOpts { cx: number; cy: number; dur: number; flash: number; seed?: number; black?: boolean }

/** u = frames since the hit (0 = the white flash frame). Draws src frozen for u < 0. */
export function shatterFrame(ctx: Ctx, src: HTMLCanvasElement, u: number, o: ShatterOpts) {
  if (u < 0) { ctx.drawImage(src, 0, 0, W, H); return; }
  if (o.black !== false) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  const list = shards(o.cx, o.cy, o.seed ?? 1);
  const samples = [u - 0.66, u - 0.33, u];
  for (const sh of list) {
    for (let si = 0; si < samples.length; si++) {
      const uu = Math.max(0, samples[si]);
      const k = clamp(uu / o.dur);
      const e = ease.outQuad(k);
      const dist = (120 + sh.r * 0.9) * sh.speed * e * 1.6;
      const z = 1 + 0.9 * e * sh.speed;          // toward camera
      const alpha = (si === samples.length - 1 ? 1 : 0.22) * (1 - ease.inCubic(clamp((k - 0.55) / 0.45)));
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sh.cx + Math.cos(sh.dir) * dist, sh.cy + Math.sin(sh.dir) * dist);
      ctx.rotate(sh.spin * e); ctx.scale(z, z);
      ctx.translate(-sh.cx, -sh.cy);
      const p = new Path2D();
      sh.pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.closePath();
      ctx.save(); ctx.clip(p); ctx.drawImage(src, 0, 0, W, H); ctx.restore();
      if (si === samples.length - 1) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = 7; ctx.strokeStyle = PAL.ink; ctx.stroke(p);
        ctx.lineWidth = 3.5; ctx.strokeStyle = sh.rim; ctx.stroke(p);
      }
      ctx.restore();
    }
  }
  if (u < o.flash) flash(ctx, u === 0 ? 1 : 0.55);
}
