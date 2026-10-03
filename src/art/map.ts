// Level-map primitives: dreamy night sky, chapter islands (mini daycare rooms), pillow nodes, star trail.
import { PALETTE, type MapNodeVisual } from '../core/contracts';
import { type Ctx, type RGB, TAU, INK, hex, mix, rgba, lighten, darken, clamp, hash, circle, ellipse, roundRect, inkStroke, starPath, zzz } from './util';
import { newCanvas } from './world';

// ═════════════ BACKDROP ═════════════
let bd: { c: HTMLCanvasElement; w: number; h: number; sc: number } | null = null;
const MSTARS = Array.from({ length: 120 }, (_, i) => ({ x: hash(i * 3.17 + 5), y: hash(i * 6.31 + 1), r: 0.6 + hash(i * 2.3) * 1.4, sp: 1 + hash(i * 7.7) * 2.5, ph: hash(i * 1.9) * TAU, big: i % 9 === 0 }));
const PUFFS = Array.from({ length: 6 }, (_, i) => ({ x: hash(i * 8.1), y: 0.15 + hash(i * 3.3) * 0.75, s: 0.6 + hash(i * 5.5) * 0.8, v: 3 + hash(i * 2.2) * 5 }));

function renderBackdrop(ctx: Ctx, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0f0f22'); g.addColorStop(0.55, PALETTE.night); g.addColorStop(1, '#33285a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // milky way: soft diagonal band with dust
  ctx.save();
  ctx.translate(w / 2, h / 2); ctx.rotate(-0.35);
  const mw = ctx.createLinearGradient(0, -h * 0.25, 0, h * 0.25);
  mw.addColorStop(0, 'rgba(150,130,230,0)'); mw.addColorStop(0.5, 'rgba(170,150,240,0.16)'); mw.addColorStop(1, 'rgba(150,130,230,0)');
  ctx.fillStyle = mw; ctx.fillRect(-w, -h * 0.25, w * 2, h * 0.5);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let i = 0; i < 500; i++) { const u = hash(i * 1.7) - 0.5, v = (hash(i * 4.3) + hash(i * 9.1) - 1) * 0.22; ctx.fillRect(u * w * 2, v * h, 1, 1); }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (let i = 0; i < 300; i++) ctx.fillRect(hash(i * 5.9 + 2) * w, hash(i * 8.7 + 3) * h, 1, 1);
}

function aurora(ctx: Ctx, w: number, h: number, t: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const bands: [RGB, number, number][] = [[[61, 220, 151], 0.18, 0], [[108, 99, 255], 0.24, 1.7], [[176, 77, 255], 0.3, 3.1]];
  for (const [c, y0, ph] of bands) {
    ctx.beginPath();
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const u = i / N, x = u * w;
      const y = h * y0 + Math.sin(u * 5 + t * 0.25 + ph) * h * 0.04 + Math.sin(u * 11 - t * 0.4 + ph) * h * 0.012;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    for (let i = N; i >= 0; i--) {
      const u = i / N, x = u * w;
      const y = h * y0 + Math.sin(u * 5 + t * 0.25 + ph) * h * 0.04 + h * (0.07 + 0.03 * Math.sin(u * 7 + t * 0.3 + ph));
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, h * (y0 - 0.05), 0, h * (y0 + 0.12));
    g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.45, rgba(c, 0.13)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.restore();
}

function sleepyMoon(ctx: Ctx, x: number, y: number, r: number, t: number) {
  const gl = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3);
  gl.addColorStop(0, 'rgba(255,240,200,0.3)'); gl.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = gl; circle(ctx, x, y, r * 3); ctx.fill();
  const bob = Math.sin(t * 0.8) * 3;
  ctx.save();
  ctx.translate(x, y + bob);
  circle(ctx, 0, 0, r); ctx.fillStyle = '#fff1c4'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = 'rgba(220,200,140,0.5)';
  for (const [cx, cy, cr] of [[-0.35, 0.35, 0.14], [0.4, 0.2, 0.1], [0.1, 0.55, 0.08]]) { circle(ctx, cx * r, cy * r, cr * r); ctx.fill(); }
  // face
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (const ex of [-0.32, 0.22]) { ctx.beginPath(); ctx.arc(ex * r, 0.02 * r, 0.14 * r, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(-0.05 * r, 0.3 * r, 0.09 * r, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
  ctx.fillStyle = 'rgba(255,120,140,0.5)'; ellipse(ctx, -0.5 * r, 0.25 * r, 0.12 * r, 0.07 * r); ctx.fill(); ellipse(ctx, 0.42 * r, 0.25 * r, 0.12 * r, 0.07 * r); ctx.fill();
  // nightcap
  const cap = () => {
    ctx.beginPath();
    ctx.moveTo(-0.85 * r, -0.45 * r);
    ctx.quadraticCurveTo(-0.2 * r, -1.5 * r, 0.75 * r, -1.25 * r);
    ctx.quadraticCurveTo(1.35 * r, -0.95 * r, 1.3 * r, -0.2 * r);
    ctx.quadraticCurveTo(1.0 * r, -0.85 * r, 0.65 * r, -0.62 * r);
    ctx.quadraticCurveTo(0, -0.95 * r, -0.85 * r, -0.45 * r);
    ctx.closePath();
  };
  cap(); ctx.fillStyle = '#6c63ff'; ctx.fill();
  ctx.save(); cap(); ctx.clip(); ctx.strokeStyle = '#8f88ff'; ctx.lineWidth = r * 0.12;
  for (let i = -3; i < 5; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.35, -1.6 * r); ctx.lineTo(i * r * 0.35 + r * 0.5, 0); ctx.stroke(); }
  ctx.restore();
  cap(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
  circle(ctx, 1.3 * r, -0.12 * r, 0.16 * r); ctx.fillStyle = '#fffdf8'; ctx.fill(); ctx.stroke();
  ctx.restore();
  zzz(ctx, x - r * 1.2, y - r * 0.6, Math.max(1, r / 30), t, '#e8e4ff');
}

function puff(ctx: Ctx, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.arc(x - 20 * s, y, 11 * s, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x - 4 * s, y - 10 * s, 13 * s, Math.PI * 1.05, Math.PI * 1.9);
  ctx.arc(x + 14 * s, y - 4 * s, 10 * s, Math.PI * 1.2, Math.PI * 1.95);
  ctx.arc(x + 22 * s, y, 11 * s, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(90,86,150,0.45)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(180,170,255,0.3)'; ctx.stroke();
}

export function drawMapBackdrop(ctx: Ctx, w: number, h: number, t: number) {
  const tr = ctx.getTransform();
  const sc = Math.max(0.25, Math.hypot(tr.a, tr.b));
  if (!bd || bd.w !== w || bd.h !== h || bd.sc !== sc) {
    const c = newCanvas(w * sc, h * sc);
    const cx = c.getContext('2d')!; cx.scale(sc, sc);
    renderBackdrop(cx, w, h);
    bd = { c, w, h, sc };
  }
  ctx.save();
  ctx.drawImage(bd.c, 0, 0, w, h);
  aurora(ctx, w, h, t);
  for (const st of MSTARS) {
    const a = 0.35 + 0.65 * Math.abs(Math.sin(t * st.sp * 0.6 + st.ph));
    ctx.globalAlpha = a;
    if (st.big) { starPath(ctx, st.x * w, st.y * h, 3 + st.r * 1.5, t * 0.15, 0.35, 4); ctx.fillStyle = '#fff6d8'; ctx.fill(); }
    else { ctx.fillStyle = '#fff'; circle(ctx, st.x * w, st.y * h, st.r); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  sleepyMoon(ctx, w * 0.88, h * 0.14, Math.min(46, Math.max(26, Math.min(w, h) * 0.06)), t);
  for (const p of PUFFS) {
    const span = w + 160;
    puff(ctx, ((p.x * span + t * p.v) % span) - 80, p.y * h, p.s * Math.max(0.8, w / 1300));
  }
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  v.addColorStop(0, 'rgba(5,5,15,0)'); v.addColorStop(1, 'rgba(5,5,15,0.45)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ═════════════ ISLANDS ═════════════
/** Anchor = centre of the island's floor. Floor diamond ≈ 180×90·s; walls rise ~60·s; underside hangs ~70·s. */
export function drawMapIsland(ctx: Ctx, x: number, y: number, s: number, chapter: number, color: string, unlocked: boolean, t: number) {
  const bob = Math.sin(t * 0.9 + chapter * 1.3) * 3 * s;
  y += bob;
  const C = hex(color || PALETTE.sunny);
  const R = 2.5; // half-extent in mini tiles
  const iso = (gx: number, gy: number, gz = 0) => ({ x: x + (gx - gy) * 18 * s, y: y + (gx + gy) * 9 * s - gz * 18 * s });
  const P = (pts: { x: number; y: number }[]) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };
  ctx.save();
  // glow halo
  const gl = ctx.createRadialGradient(x, y, 10 * s, x, y, 130 * s);
  gl.addColorStop(0, rgba(C, unlocked ? 0.28 : 0.08)); gl.addColorStop(1, rgba(C, 0));
  ctx.fillStyle = gl; circle(ctx, x, y, 130 * s); ctx.fill();

  // underside: rounded rocky cone
  const l = iso(-R, R), r = iso(R, -R), f = iso(R, R);
  ctx.beginPath();
  ctx.moveTo(l.x, l.y);
  ctx.lineTo(l.x, l.y + 14 * s);
  ctx.bezierCurveTo(l.x + 20 * s, f.y + 50 * s, x - 10 * s, f.y + 75 * s, x, f.y + 78 * s);
  ctx.bezierCurveTo(x + 10 * s, f.y + 75 * s, r.x - 20 * s, f.y + 50 * s, r.x, r.y + 14 * s);
  ctx.lineTo(r.x, r.y); ctx.lineTo(f.x, f.y); ctx.closePath();
  const ug = ctx.createLinearGradient(0, f.y, 0, f.y + 78 * s);
  ug.addColorStop(0, '#5b4a7e'); ug.addColorStop(1, '#2a2346');
  ctx.fillStyle = ug; ctx.fill(); inkStroke(ctx, s);
  ctx.fillStyle = rgba(C, 0.85);
  for (const [dx, dy] of [[-30, 30], [24, 42], [-4, 58]]) { ctx.beginPath(); ctx.moveTo(x + (dx - 5) * s, f.y + dy * s); ctx.lineTo(x + dx * s, f.y + (dy + 11) * s); ctx.lineTo(x + (dx + 5) * s, f.y + dy * s); ctx.closePath(); ctx.fill(); inkStroke(ctx, s, 1.6); }
  // slab front faces
  for (const [a, b, c] of [[l, f, '#c08a5c'], [f, r, '#a8744a']] as const) {
    P([a, b, { x: b.x, y: b.y + 14 * s }, { x: a.x, y: a.y + 14 * s }]); ctx.fillStyle = c; ctx.fill(); inkStroke(ctx, s);
  }
  // floor
  P([iso(-R, -R), iso(R, -R), iso(R, R), iso(-R, R)]);
  ctx.fillStyle = chapter === 0 ? '#f6ecd9' : '#e8ddf0'; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = -3; i < 3; i++) for (let j = -3; j < 3; j++) if ((i + j) % 2 === 0) { P([iso(i, j), iso(i + 1, j), iso(i + 1, j + 1), iso(i, j + 1)]); ctx.fill(); }
  // rug in chapter colour
  ctx.fillStyle = rgba(lighten(C, 0.45), 0.9);
  ellipse(ctx, x, y + 4 * s, 52 * s, 24 * s); ctx.fill();
  ctx.restore();
  P([iso(-R, -R), iso(R, -R), iso(R, R), iso(-R, R)]); inkStroke(ctx, s);
  // walls
  const H = 3.2;
  const wallCol = chapter === 0 ? '#fbeedd' : rgba(mix(lighten(C, 0.55), [60, 60, 110], chapter === 3 ? 0.35 : 0.1));
  P([iso(-R, -R), iso(R, -R), iso(R, -R, H), iso(-R, -R, H)]); ctx.fillStyle = wallCol; ctx.fill(); inkStroke(ctx, s);
  P([iso(-R, -R), iso(-R, R), iso(-R, R, H), iso(-R, -R, H)]); ctx.fillStyle = rgba(darken(hex(chapter === 0 ? '#fbeedd' : '#e6dcf2'), 0.08)); ctx.fill();
  ctx.fillStyle = rgba(mix(lighten(C, 0.55), [60, 60, 110], 0.2), 0.5); ctx.fill(); inkStroke(ctx, s);
  // window on right wall
  const wc = iso(0.6, -R, 1.9);
  ctx.save();
  ctx.translate(wc.x, wc.y); ctx.transform(1, 0.5, 0, 1, 0, 0);
  roundRect(ctx, -14 * s, -12 * s, 28 * s, 22 * s, 9 * s);
  ctx.fillStyle = chapter === 0 ? '#9fd3ef' : '#1b1b38'; ctx.fill(); inkStroke(ctx, s, 2);
  if (chapter === 0) { ctx.fillStyle = PALETTE.sunny; circle(ctx, 4 * s, -3 * s, 5 * s); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(4 * s, -3 * s, 5 * s, 0, TAU); ctx.arc(6.5 * s, -4.5 * s, 4.2 * s, 0, TAU, true); ctx.fillStyle = '#fff1c4'; ctx.fill('evenodd'); }
  ctx.restore();
  // bunting along the right wall top
  ctx.lineWidth = 1.2 * s; ctx.strokeStyle = INK;
  const b0 = iso(-R, -R, H - 0.25), b1 = iso(R, -R, H - 0.25);
  ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.quadraticCurveTo((b0.x + b1.x) / 2, (b0.y + b1.y) / 2 + 8 * s, b1.x, b1.y); ctx.stroke();
  const flagC = [PALETTE.sunny, PALETTE.moony, '#f7a8b8', PALETTE.mint];
  for (let i = 1; i < 6; i++) {
    const u = i / 6, px = b0.x + (b1.x - b0.x) * u, py = b0.y + (b1.y - b0.y) * u + Math.sin(u * Math.PI) * 4 * s;
    ctx.beginPath(); ctx.moveTo(px - 4 * s, py); ctx.lineTo(px + 4 * s, py + 2 * s); ctx.lineTo(px, py + 9 * s); ctx.closePath();
    ctx.fillStyle = flagC[i % 4]; ctx.fill(); inkStroke(ctx, s, 1.2);
  }
  // wall caps
  P([iso(-R, -R, H), iso(R, -R, H), iso(R, -R - 0.25, H), iso(-R - 0.25, -R - 0.25, H)]); ctx.fillStyle = '#fffaf0'; ctx.fill(); inkStroke(ctx, s, 2);
  P([iso(-R, -R, H), iso(-R, R, H), iso(-R - 0.25, R, H), iso(-R - 0.25, -R - 0.25, H)]); ctx.fill(); inkStroke(ctx, s, 2);

  if (unlocked) islandProps(ctx, iso, s, chapter, C, t);
  else lockedQuilt(ctx, x, y, s, t);
  ctx.restore();
}

type IsoM = (gx: number, gy: number, gz?: number) => { x: number; y: number };
function miniBlob(ctx: Ctx, x: number, y: number, s: number, col: string, quilt = false) {
  ctx.beginPath();
  ctx.moveTo(-9 * s + x, y);
  ctx.bezierCurveTo(-11 * s + x, -12 * s + y, 11 * s + x, -12 * s + y, 9 * s + x, y);
  ctx.quadraticCurveTo(x, y + 2 * s, -9 * s + x, y);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); inkStroke(ctx, s, 2);
  if (quilt) { ctx.strokeStyle = '#fff1dc'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 4 * s); ctx.lineTo(x + 6 * s, y - 4 * s); ctx.moveTo(x, y - 9 * s); ctx.lineTo(x, y); ctx.stroke(); }
}
function islandProps(ctx: Ctx, iso: IsoM, s: number, ch: number, C: RGB, t: number) {
  if (ch === 0) {
    // sunny bit-balls
    for (const [gx, gy, c] of [[-0.8, 0.4, PALETTE.sunny], [0.7, 0.9, PALETTE.moony], [0.2, -0.6, PALETTE.sunny]] as const) {
      const p = iso(gx, gy);
      const hop = Math.abs(Math.sin(t * 3 + gx * 2)) * 3 * s;
      circle(ctx, p.x, p.y - 7 * s - hop, 7 * s); ctx.fillStyle = c; ctx.fill(); inkStroke(ctx, s, 2);
      ctx.fillStyle = '#2b2d55'; ctx.fillRect(p.x - 7 * s, p.y - 9 * s - hop, 14 * s, 3 * s);
    }
  } else if (ch === 1) {
    for (const [gx, gy] of [[-1, 0.2], [0.4, 0.9], [0.6, -0.8]]) {
      const p = iso(gx, gy);
      ctx.fillStyle = '#cfe0ff'; ellipse(ctx, p.x, p.y, 13 * s, 6 * s); ctx.fill(); inkStroke(ctx, s, 1.6);
      miniBlob(ctx, p.x, p.y, s, '#f5a3b5', true);
    }
    zzz(ctx, iso(0.6, -0.8).x + 6 * s, iso(0.6, -0.8).y - 14 * s, s * 0.8, t, '#e8e4ff');
  } else if (ch === 2) {
    for (const [gx, gy, i] of [[-0.9, 0.5, 0], [0.8, 0.2, 1]]) {
      const p = iso(gx, gy);
      const on = Math.sin(t * 4 + i * 2) > 0;
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(p.x, p.y - 16 * s); ctx.lineTo(p.x, p.y - 24 * s); ctx.stroke();
      circle(ctx, p.x, p.y - 26 * s, 3 * s); ctx.fillStyle = on && i ? PALETTE.red : PALETTE.mint; ctx.fill(); inkStroke(ctx, s, 1.4);
      circle(ctx, p.x, p.y - 4 * s, 3.5 * s); ctx.fillStyle = '#3a3a48'; ctx.fill(); inkStroke(ctx, s, 1.6);
      circle(ctx, p.x, p.y - 11 * s, 7 * s); ctx.fillStyle = '#fbfaf6'; ctx.fill(); inkStroke(ctx, s, 2);
      roundRect(ctx, p.x - 4.5 * s, p.y - 14 * s, 9 * s, 5 * s, 2 * s); ctx.fillStyle = '#22263f'; ctx.fill();
      if (on && i) { ctx.strokeStyle = PALETTE.red; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.arc(p.x, p.y - 26 * s, 6 * s, -2.4, -0.7); ctx.stroke(); }
    }
    const q = iso(0, -0.8); miniBlob(ctx, q.x, q.y, s, '#f5a3b5', true);
  } else if (ch === 3) {
    for (let i = 0; i < 3; i++) {
      const p = iso(-1 + i, -0.4 + (i % 2) * 1.1);
      const fy = p.y - 16 * s + Math.sin(t * 2 + i) * 4 * s;
      ctx.save(); ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(p.x, fy, 6 * s, Math.PI, 0);
      for (let k = 0; k <= 4; k++) ctx.lineTo(p.x + 6 * s - k * 3 * s, fy + 7 * s + (k % 2 ? -2 : 1.5) * s + Math.sin(t * 5 + k) * s);
      ctx.closePath(); ctx.fillStyle = '#cfa3ff'; ctx.fill(); inkStroke(ctx, s, 1.5);
      ctx.fillStyle = INK; circle(ctx, p.x - 2 * s, fy, 0.9 * s); ctx.fill(); circle(ctx, p.x + 2 * s, fy, 0.9 * s); ctx.fill();
      ctx.restore();
    }
    const q = iso(0.2, 0.3); miniBlob(ctx, q.x, q.y, s, '#f5a3b5', true);
  } else {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const p = iso(-1.4 + i * 1.3, -1.4 + j * 1.3);
      ctx.fillStyle = '#cfe0ff'; ellipse(ctx, p.x, p.y, 9 * s, 4.5 * s); ctx.fill(); inkStroke(ctx, s, 1.3);
      miniBlob(ctx, p.x, p.y, s * 0.7, (i + j) % 2 ? '#f5a3b5' : '#9fd8d0', true);
    }
    starPath(ctx, iso(0, 0, 3.6).x, iso(0, 0, 3.6).y - 6 * s, 7 * s, t * 0.5); ctx.fillStyle = rgba(lighten(C, 0.3)); ctx.fill(); inkStroke(ctx, s, 1.6);
  }
}
function lockedQuilt(ctx: Ctx, x: number, y: number, s: number, t: number) {
  const breath = Math.sin(t * 1.4) * 0.02;
  ctx.save();
  ctx.translate(x, y + 30 * s);
  ctx.scale(1 + breath, 1 - breath);
  const q = () => {
    ctx.beginPath();
    ctx.moveTo(-98 * s, 0);
    ctx.bezierCurveTo(-104 * s, -80 * s, -70 * s, -128 * s, 0, -128 * s);
    ctx.bezierCurveTo(70 * s, -128 * s, 104 * s, -80 * s, 98 * s, 0);
    for (let i = 0; i < 8; i++) { const x0 = 98 - i * 24.5, x1 = x0 - 24.5; ctx.quadraticCurveTo((x0 + x1) / 2 * s, 12 * s, x1 * s, 0); }
    ctx.closePath();
  };
  q();
  ctx.fillStyle = '#e7a0b2'; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = '#f7c9d4';
  for (let i = -5; i < 5; i++) for (let j = -7; j < 1; j++) if ((i + j) % 2 === 0) ctx.fillRect(i * 20 * s, j * 20 * s, 20 * s, 20 * s);
  ctx.strokeStyle = 'rgba(120,60,80,0.5)'; ctx.setLineDash([3 * s, 3 * s]); ctx.lineWidth = 1.2 * s;
  for (let i = -5; i < 5; i++) { ctx.beginPath(); ctx.moveTo(i * 20 * s, -140 * s); ctx.lineTo(i * 20 * s, 10 * s); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.restore();
  q(); inkStroke(ctx, s);
  // padlock
  const py = -62 * s;
  ctx.beginPath(); ctx.arc(0, py - 6 * s, 9 * s, Math.PI, 0); ctx.lineWidth = 7 * s; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 3.5 * s; ctx.strokeStyle = '#c9c5d8'; ctx.stroke();
  roundRect(ctx, -14 * s, py - 6 * s, 28 * s, 24 * s, 5 * s); ctx.fillStyle = PALETTE.sunny; ctx.fill(); inkStroke(ctx, s);
  circle(ctx, 0, py + 3 * s, 3.2 * s); ctx.fillStyle = INK; ctx.fill(); ctx.fillRect(-1.3 * s, py + 3 * s, 2.6 * s, 8 * s);
  ctx.restore();
}

// ═════════════ NODES ═════════════
/** Anchor = pillow centre. Pillow ≈ 64×44·s. */
export function drawMapNode(ctx: Ctx, x: number, y: number, s: number, v: MapNodeVisual, t: number) {
  const C = hex(v.color || PALETTE.sunny);
  const locked = v.state === 'locked';
  const cur = v.state === 'current';
  const hov = !!v.hover && !locked;
  const lift = (hov ? 4 : 0) + (cur ? Math.abs(Math.sin(t * 2.2)) * 2 : 0);
  const sc = hov ? 1.07 : 1;
  ctx.save();
  // shadow
  ctx.fillStyle = 'rgba(0,0,10,0.3)'; ellipse(ctx, x, y + 22 * s, 28 * s, 6 * s); ctx.fill();
  ctx.translate(x, y - lift * s);
  ctx.scale(sc, sc);
  if (cur) {
    const p = 0.6 + 0.4 * Math.sin(t * 3);
    const g = ctx.createRadialGradient(0, 0, 14 * s, 0, 0, 52 * s);
    g.addColorStop(0, rgba(lighten(C, 0.3), 0.55 * p)); g.addColorStop(1, rgba(C, 0));
    ctx.fillStyle = g; circle(ctx, 0, 0, 52 * s); ctx.fill();
  }
  const pillow = () => {
    const w = 32 * s, h = 21 * s, p = 6 * s;
    ctx.beginPath();
    ctx.moveTo(-w, -h);
    ctx.quadraticCurveTo(0, -h + p, w, -h);
    ctx.quadraticCurveTo(w - p, 0, w, h);
    ctx.quadraticCurveTo(0, h - p, -w, h);
    ctx.quadraticCurveTo(-w + p, 0, -w, -h);
    ctx.closePath();
  };
  const base: RGB = locked ? [120, 116, 140] : v.state === 'done' ? C : lighten(C, 0.55);
  pillow();
  const g = ctx.createLinearGradient(0, -21 * s, 0, 21 * s);
  g.addColorStop(0, rgba(lighten(base, 0.3))); g.addColorStop(1, rgba(darken(base, 0.08)));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); pillow(); ctx.clip();
  ctx.setLineDash([3 * s, 3 * s]); ctx.strokeStyle = 'rgba(14,14,14,0.3)'; ctx.lineWidth = 1.2 * s;
  roundRect(ctx, -25 * s, -15 * s, 50 * s, 30 * s, 8 * s); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  pillow(); inkStroke(ctx, s, cur ? 3.2 : 2.5);
  // tassels
  ctx.fillStyle = locked ? '#8a867d' : rgba(darken(C, 0.1));
  for (const [cx, cy] of [[-32, -21], [32, -21], [32, 21], [-32, 21]]) { circle(ctx, cx * s, cy * s, 3 * s); ctx.fill(); inkStroke(ctx, s, 1.4); }
  // id label
  ctx.font = `${15 * s}px Quantum, Quicksand, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5 * s; ctx.strokeStyle = locked ? '#55524b' : INK; ctx.lineJoin = 'round';
  ctx.fillStyle = locked ? '#c9c5d8' : '#fffdf8';
  ctx.strokeText(v.id, 0, 1 * s); ctx.fillText(v.id, 0, 1 * s);
  if (locked) {
    // tiny blanket corner + padlock
    ctx.beginPath(); ctx.moveTo(-32 * s, 4 * s); ctx.quadraticCurveTo(0, -4 * s, 32 * s, 6 * s); ctx.lineTo(32 * s, 21 * s); ctx.quadraticCurveTo(0, 17 * s, -32 * s, 21 * s); ctx.closePath();
    ctx.fillStyle = 'rgba(231,160,178,0.92)'; ctx.fill(); inkStroke(ctx, s, 2);
    ctx.beginPath(); ctx.arc(0, 8 * s, 4.5 * s, Math.PI, 0); ctx.lineWidth = 2.4 * s; ctx.strokeStyle = INK; ctx.stroke();
    roundRect(ctx, -6.5 * s, 8 * s, 13 * s, 10 * s, 2.5 * s); ctx.fillStyle = PALETTE.sunny; ctx.fill(); inkStroke(ctx, s, 1.8);
  }
  if (v.state === 'done' || cur || v.state === 'open') {
    // moons for stars
    for (let i = 0; i < 3; i++) {
      const mx = (i - 1) * 13 * s, my = 30 * s - (i === 1 ? 3 * s : 0);
      const got = i < (v.stars | 0);
      ctx.beginPath(); ctx.arc(mx, my, 5 * s, 0, TAU); ctx.arc(mx + 2.5 * s, my - 1.5 * s, 4.2 * s, 0, TAU, true);
      ctx.fillStyle = got ? '#ffe08a' : 'rgba(255,255,255,0.18)'; ctx.fill('evenodd');
      ctx.lineWidth = 1.4 * s; ctx.strokeStyle = got ? INK : 'rgba(255,255,255,0.4)'; ctx.stroke();
    }
  }
  if (cur) zzz(ctx, 24 * s, -24 * s, s, t, '#fffdf8');
  if (hov && v.title) {
    ctx.font = `700 ${12 * s}px Quicksand, sans-serif`;
    const tw = ctx.measureText(v.title).width + 16 * s;
    roundRect(ctx, -tw / 2, -50 * s, tw, 20 * s, 10 * s); ctx.fillStyle = '#fffdf8'; ctx.fill(); inkStroke(ctx, s, 2);
    ctx.fillStyle = INK; ctx.fillText(v.title, 0, -39.5 * s);
  }
  ctx.restore();
}

// ═════════════ PATH ═════════════
/** Dotted dream-trail through pts (Catmull-Rom). progress 0..1 = how much is "walked" (bright). */
export function drawMapPath(ctx: Ctx, pts: { x: number; y: number }[], progress: number, t: number) {
  if (pts.length < 2) return;
  // sample the spline
  const samples: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 20; k++) {
      const u = k / 20, u2 = u * u, u3 = u2 * u;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      samples.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  samples.push(pts[pts.length - 1]);
  const cum = [0];
  for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
  const L = cum[cum.length - 1];
  const at = (d: number) => {
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const a = samples[i - 1], b = samples[i], u = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  const done = clamp(progress) * L;
  ctx.save();
  const step = 15;
  for (let d = 0, i = 0; d <= L; d += step, i++) {
    const p = at(d);
    if (d <= done) {
      const tw = 0.6 + 0.4 * Math.sin(t * 3 - i * 0.6);
      if (i % 3 === 0) { starPath(ctx, p.x, p.y, 4.5 * tw + 1.5, t * 0.5 + i, 0.45); ctx.fillStyle = '#ffe08a'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke(); }
      else { ctx.fillStyle = `rgba(255,246,216,${0.6 + 0.4 * tw})`; circle(ctx, p.x, p.y, 2.2); ctx.fill(); }
    } else {
      ctx.fillStyle = 'rgba(200,195,255,0.28)'; circle(ctx, p.x, p.y, 1.8); ctx.fill();
    }
  }
  // sparkle at the head of the trail
  if (progress > 0 && progress < 1) {
    const p = at(done);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
    g.addColorStop(0, 'rgba(255,240,180,0.8)'); g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g; circle(ctx, p.x, p.y, 16); ctx.fill();
    starPath(ctx, p.x, p.y, 7, t * 2, 0.3, 4); ctx.fillStyle = '#fffdf8'; ctx.fill();
  }
  ctx.restore();
}
