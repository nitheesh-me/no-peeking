// The Caretaker (player avatar): a sleepy kid in a onesie, floppy nightcap and bunny slippers.
// Anchor = feet on the floor. Height ≈ 64*s px (cap tip a bit higher). Faces +x when facing = 1.
import { PALETTE, type CaretakerVisual } from '../core/contracts';
import { type Ctx, TAU, INK, LINE, clamp, circle, ellipse, inkStroke, groundShadow, starPath, blush, roundRect } from './util';

const SKIN = '#ffd9b8', SKIN_SH = '#f0b48f', ONESIE = '#b8e6c9', ONESIE_SH = '#8fcfa9', DOT = '#f4fff7';
const CAP_A = '#f7a8b8', CAP_B = '#fff1dc', HAIR = '#6b4a3a', SLIPPER = '#fffdf8';

const bell = (p: number) => Math.sin(clamp(p) * Math.PI); // 0 → 1 (contact) → 0
const ease = (p: number) => { p = clamp(p); return p * p * (3 - 2 * p); };

type Face = 'sleepy' | 'closed' | 'wide' | 'happy' | 'yawn' | 'shush' | 'focus';

function limb(ctx: Ctx, s: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, w: number, col: string) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = (w + LINE * 2) * s; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = w * s; ctx.strokeStyle = col; ctx.stroke();
}
function hand(ctx: Ctx, s: number, x: number, y: number, finger = 0, fa = 0) {
  if (finger) {
    const fx = x + Math.cos(fa) * 5.5 * s * finger, fy = y + Math.sin(fa) * 5.5 * s * finger;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fx, fy);
    ctx.lineCap = 'round'; ctx.lineWidth = (2.6 + LINE * 2) * s; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 2.6 * s; ctx.strokeStyle = SKIN; ctx.stroke();
  }
  circle(ctx, x, y, 3.6 * s); ctx.fillStyle = SKIN; ctx.fill(); inkStroke(ctx, s, 2);
}

export function drawCaretaker(ctx: Ctx, x: number, y: number, s: number, v: CaretakerVisual, t: number) {
  const f = v.facing === -1 ? -1 : 1;
  const a = v.action;
  const p = clamp(v.phase ?? 0);
  const e = bell(p);

  // ── pose parameters (local, facing +x) ──
  let hop = 0, lean = Math.sin(t * 1.4) * 0.025, bodyY = 0, squash = 1 + Math.sin(t * 2.2) * 0.015;
  let face: Face = 'sleepy';
  let footL = 0, footR = 0, tiptoe = 0, headTilt = 0;
  // hands relative to body: [x, y], shoulders at (±7, -27)
  let hb: [number, number] = [-9, -16], hf: [number, number] = [9, -16];
  let fingerF = 0, fingerA = 0, fingerB = 0, fingerBA = 0;
  let yawnCycle = 0;

  switch (a) {
    case 'idle': {
      const c = (t % 7) / 7; // yawn every ~7s
      if (c > 0.82) { yawnCycle = bell((c - 0.82) / 0.18); face = yawnCycle > 0.3 ? 'yawn' : 'sleepy'; hf = [5 + 2 * yawnCycle, -16 - 18 * yawnCycle]; }
      break;
    }
    case 'yawn': {
      yawnCycle = e;
      face = e > 0.25 ? 'yawn' : 'sleepy';
      hb = [-12 - 2 * e, -16 - 32 * e]; hf = [12 + 2 * e, -16 - 32 * e];
      squash = 1 + 0.06 * e; lean = -0.05 * e;
      break;
    }
    case 'tiptoe': {
      const c = t * 7;
      tiptoe = 1;
      footL = Math.max(0, Math.sin(c)) * 5; footR = Math.max(0, -Math.sin(c)) * 5;
      bodyY = -3 - Math.abs(Math.sin(c)) * 2.5;
      lean = 0.12;
      hb = [3, -26 + Math.sin(c) * 1.5]; hf = [13, -25 - Math.sin(c) * 1.5]; // sneaky hands up front
      fingerF = 0.6; fingerA = -0.6;
      face = 'focus';
      break;
    }
    case 'boop': {
      const reach = ease(p < 0.5 ? p * 2 : 2 - p * 2);
      hf = [10 + 16 * reach, -21 - 2 * reach]; fingerF = 1; fingerA = 0;
      lean = 0.14 * reach;
      face = 'focus';
      break;
    }
    case 'shush': {
      hf = [7 * (1 - ease(p * 3)) + 5 * ease(p * 3), -16 - 21 * ease(p * 3)]; fingerF = ease(p * 3); fingerA = -Math.PI / 2;
      face = 'shush';
      break;
    }
    case 'spin': {
      const ang = p * TAU * 2;
      const cx = 14, cy = -27;
      hf = [cx + Math.cos(ang) * 6, cy + Math.sin(ang) * 6];
      hb = [cx - 6 + Math.cos(ang + Math.PI) * 6, cy + Math.sin(ang + Math.PI) * 6];
      lean = 0.06; face = 'focus';
      break;
    }
    case 'peek': {
      tiptoe = 1; bodyY = -4 * e; lean = 0.1 * e;
      hf = [16, -22]; face = 'wide';
      hb = [9, -20];
      break;
    }
    case 'listen': {
      hf = [5, -44]; lean = 0.16 * ease(p * 2); headTilt = 0.18 * ease(p * 2);
      face = 'closed';
      break;
    }
    case 'press': {
      const push = ease(p < 0.5 ? p * 2 : 2 - p * 2);
      hf = [20, -24 + 6 * push]; lean = 0.1 * push; face = 'focus';
      break;
    }
    case 'cheer': {
      hop = Math.abs(Math.sin(p * Math.PI * 2)) * 12;
      hb = [-13, -48]; hf = [13, -48];
      squash = 1 + 0.05 * Math.sin(p * Math.PI * 4);
      face = 'happy';
      break;
    }
    case 'facepalm': {
      hf = [4, -40]; headTilt = 0.22; lean = 0.08; face = 'closed';
      break;
    }
  }

  ctx.save();
  groundShadow(ctx, x, y + 1 * s, 19 * s * (1 - hop / 40), 6.5 * s, 0.28);

  // flashlight beam goes behind the kid's arm but over the floor
  if (a === 'peek' && v.flashlight) {
    const hx = x + f * 22 * s, hy = y - 22 * s - hop * s;
    const len = 110 * s, spread = 0.32;
    const g = ctx.createRadialGradient(hx, hy, 2, hx, hy, len);
    g.addColorStop(0, `rgba(255,240,170,${0.75 * (0.4 + 0.6 * e)})`);
    g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.beginPath(); ctx.moveTo(hx, hy);
    ctx.lineTo(hx + f * Math.cos(-spread + 0.35) * len, hy + Math.sin(-spread + 0.35) * len);
    ctx.lineTo(hx + f * Math.cos(spread + 0.35) * len, hy + Math.sin(spread + 0.35) * len);
    ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  }

  ctx.translate(x, y - hop * s);
  ctx.scale(f, 1);

  // ── slippers (bunny) ──
  const slipper = (sx: number, lift: number) => {
    const sy = -lift * s;
    // ears
    for (const d of [-1.5, 1.8]) {
      ctx.beginPath(); ctx.ellipse(sx + 2 * s + d * s, sy - 5.5 * s, 1.6 * s, 3.8 * s, d * 0.12, 0, TAU);
      ctx.fillStyle = SLIPPER; ctx.fill(); inkStroke(ctx, s, 1.6);
      ctx.beginPath(); ctx.ellipse(sx + 2 * s + d * s, sy - 5.5 * s, 0.6 * s, 2.4 * s, d * 0.12, 0, TAU); ctx.fillStyle = '#ffb6c8'; ctx.fill();
    }
    ellipse(ctx, sx + 1.5 * s, sy - 1.8 * s, 6.5 * s, 3.4 * s);
    ctx.fillStyle = SLIPPER; ctx.fill(); inkStroke(ctx, s, 2);
    ctx.fillStyle = INK; circle(ctx, sx + 5.2 * s, sy - 2.3 * s, 0.8 * s); ctx.fill();
    ctx.fillStyle = '#ff8fa8'; circle(ctx, sx + 7.6 * s, sy - 1.6 * s, 1 * s); ctx.fill();
  };

  ctx.rotate(lean);
  const by = bodyY * s;
  // legs (short stubs inside onesie)
  for (const [lx, lift] of [[-5, footL], [5, footR]] as const) {
    ctx.beginPath(); roundRect(ctx, (lx - 3.6) * s, by - 12 * s - lift * s, 7.2 * s, 11 * s + (tiptoe ? 2 : 0) * s, 3 * s);
    ctx.fillStyle = ONESIE_SH; ctx.fill(); inkStroke(ctx, s, 2);
  }
  slipper(-6 * s, footL + (tiptoe ? 2 : 0) - bodyY);
  slipper(4 * s, footR + (tiptoe ? 2 : 0) - bodyY);

  // back arm
  const shB: [number, number] = [-6, -27], shF: [number, number] = [6, -27];
  limb(ctx, s, shB[0] * s, by + shB[1] * s, (shB[0] + hb[0]) / 2 * s - 2 * s, by + (shB[1] + hb[1]) / 2 * s, hb[0] * s, by + hb[1] * s, 5.2, ONESIE_SH);
  hand(ctx, s, hb[0] * s, by + hb[1] * s, fingerB, fingerBA);

  // body (onesie bean)
  ctx.save();
  ctx.translate(0, by);
  ctx.scale(2 - squash, squash);
  ctx.beginPath();
  ctx.moveTo(-10 * s, -9 * s);
  ctx.bezierCurveTo(-12.5 * s, -20 * s, -9 * s, -31 * s, 0, -31 * s);
  ctx.bezierCurveTo(9 * s, -31 * s, 12.5 * s, -20 * s, 10 * s, -9 * s);
  ctx.quadraticCurveTo(0, -5 * s, -10 * s, -9 * s);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, -31 * s, 0, -6 * s);
  bg.addColorStop(0, ONESIE); bg.addColorStop(1, ONESIE_SH);
  ctx.fillStyle = bg; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = DOT;
  for (const [dx, dy] of [[-6, -25], [3, -22], [-3, -15], [6, -13], [-8, -10], [7, -28]]) { starPath(ctx, dx * s, dy * s, 1.6 * s, 0, 0.5); ctx.fill(); }
  ctx.restore();
  inkStroke(ctx, s);
  // zipper + pocket with a tiny moon
  ctx.beginPath(); ctx.moveTo(0, -30 * s); ctx.lineTo(0, -9 * s); ctx.lineWidth = 1.2 * s; ctx.strokeStyle = 'rgba(14,14,14,0.45)'; ctx.stroke();
  ctx.restore();

  // ── head ──
  ctx.save();
  ctx.translate(0, by - 41 * s);
  ctx.rotate(headTilt);
  // cap tail (behind head): floppy cone drooping toward the back, pompom bobbing
  const flop = Math.sin(t * 2.3) * 0.1 + (hop ? 0.2 : 0);
  const tipX = -25 * s, tipY = (3 + flop * 20) * s;
  const tail = () => {
    ctx.beginPath();
    ctx.moveTo(-7 * s, -20 * s);
    ctx.quadraticCurveTo(-22 * s, -22 * s, tipX, tipY);
    ctx.quadraticCurveTo(-17 * s, -9 * s, 4 * s, -14 * s);
    ctx.closePath();
  };
  tail(); ctx.fillStyle = CAP_A; ctx.fill();
  ctx.save(); tail(); ctx.clip();
  ctx.strokeStyle = CAP_B; ctx.lineWidth = 3 * s;
  for (let i = 0; i < 4; i++) { const u = -9 - i * 5; ctx.beginPath(); ctx.moveTo(u * s, -26 * s); ctx.lineTo((u - 6) * s, 0); ctx.stroke(); }
  ctx.restore();
  tail(); inkStroke(ctx, s);
  circle(ctx, tipX, tipY + 1 * s, 4 * s); ctx.fillStyle = '#fffdf8'; ctx.fill(); inkStroke(ctx, s, 2);
  // face
  circle(ctx, 0, 0, 13 * s);
  const hg = ctx.createRadialGradient(-4 * s, -5 * s, 2 * s, 0, 0, 14 * s);
  hg.addColorStop(0, '#ffe8d4'); hg.addColorStop(1, SKIN);
  ctx.fillStyle = hg; ctx.fill(); inkStroke(ctx, s);
  // ear (facing side)
  if (a !== 'listen') {
    ellipse(ctx, -9 * s, 2 * s, 3 * s, 3.6 * s); ctx.fillStyle = SKIN; ctx.fill(); inkStroke(ctx, s, 2);
    ellipse(ctx, -9 * s, 2 * s, 1.2 * s, 1.8 * s); ctx.fillStyle = SKIN_SH; ctx.fill();
  }
  // hair tuft
  ctx.beginPath(); ctx.moveTo(5 * s, -8 * s); ctx.quadraticCurveTo(9 * s, -6 * s, 11 * s, -2 * s); ctx.quadraticCurveTo(7 * s, -4 * s, 3 * s, -5 * s); ctx.closePath();
  ctx.fillStyle = HAIR; ctx.fill(); inkStroke(ctx, s, 1.6);
  // cap dome over the top of the head + cream band
  const dome = () => {
    ctx.beginPath();
    ctx.moveTo(-13.6 * s, -3 * s);
    ctx.bezierCurveTo(-15 * s, -22 * s, 12 * s, -25 * s, 12.8 * s, -7 * s);
    ctx.quadraticCurveTo(0, -12 * s, -13.6 * s, -3 * s);
    ctx.closePath();
  };
  dome(); ctx.fillStyle = CAP_A; ctx.fill();
  ctx.save(); dome(); ctx.clip();
  ctx.strokeStyle = CAP_B; ctx.lineWidth = 3 * s;
  for (let i = -3; i < 4; i++) { ctx.beginPath(); ctx.moveTo((i * 6 - 3) * s, -26 * s); ctx.lineTo((i * 6 + 3) * s, 0); ctx.stroke(); }
  ctx.restore();
  dome(); inkStroke(ctx, s);
  ctx.beginPath(); ctx.moveTo(-13.8 * s, -2 * s); ctx.quadraticCurveTo(0, -11.5 * s, 13 * s, -6 * s);
  ctx.quadraticCurveTo(13.4 * s, -9.5 * s, 12.4 * s, -10.5 * s); ctx.quadraticCurveTo(-1 * s, -15.5 * s, -13.6 * s, -6.5 * s); ctx.closePath();
  ctx.fillStyle = CAP_B; ctx.fill(); inkStroke(ctx, s, 2);
  drawKidFace(ctx, s, t, face, yawnCycle);
  ctx.restore();

  // ── front arm (over body) ──
  if (a === 'peek') {
    // flashlight in front hand
    ctx.save();
    ctx.translate(hf[0] * s, by + hf[1] * s);
    ctx.rotate(0.35);
    roundRect(ctx, -2 * s, -3 * s, 11 * s, 6 * s, 2 * s); ctx.fillStyle = '#7fc8f8'; ctx.fill(); inkStroke(ctx, s, 2);
    roundRect(ctx, 8 * s, -4.2 * s, 4 * s, 8.4 * s, 1.5 * s); ctx.fillStyle = v.flashlight ? '#fff3b0' : '#d9d5cc'; ctx.fill(); inkStroke(ctx, s, 2);
    ctx.restore();
  }
  if (a === 'press') {
    // floating button
    const push = ease(p < 0.5 ? p * 2 : 2 - p * 2);
    ellipse(ctx, 22 * s, -16 * s, 7 * s, 3 * s); ctx.fillStyle = '#d9d5cc'; ctx.fill(); inkStroke(ctx, s, 2);
    ctx.beginPath(); ctx.ellipse(22 * s, by - 18.5 * s + push * 2.5 * s, 5 * s, 2.3 * s, 0, 0, TAU);
    ctx.fillStyle = PALETTE.red; ctx.fill(); inkStroke(ctx, s, 2);
  }
  limb(ctx, s, shF[0] * s, by + shF[1] * s, (shF[0] + hf[0]) / 2 * s + 2 * s, by + (shF[1] + hf[1]) / 2 * s + 2 * s, hf[0] * s, by + hf[1] * s, 5.2, ONESIE);
  hand(ctx, s, hf[0] * s, by + hf[1] * s, fingerF, fingerA);

  // ── effects ──
  if (a === 'boop' && e > 0.8) {
    const fx = (hf[0] + 6) * s, fy = by + hf[1] * s;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6 * s;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(fx + 3 * s, fy + i * 4 * s); ctx.lineTo(fx + 7 * s, fy + i * 6 * s); ctx.stroke(); }
  }
  if (a === 'shush' && p > 0.3) {
    const q = clamp((p - 0.3) / 0.7);
    ctx.save();
    ctx.globalAlpha = Math.sin(q * Math.PI);
    const px = (22 + q * 12) * s, py = by - 50 * s - q * 8 * s;
    ctx.beginPath();
    for (const [dx, dy, r] of [[0, 0, 7], [6, -2, 6], [-5, 1, 5]]) { ctx.moveTo(px + (dx + r) * s, py + dy * s); ctx.arc(px + dx * s, py + dy * s, r * s, 0, TAU); }
    ctx.lineWidth = 2.8 * s; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = '#fffdf8'; ctx.fill();
    ctx.scale(f, 1);
    ctx.fillStyle = INK; ctx.font = `700 ${8 * s}px Quicksand, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('shh', f * (px + 1 * s), py);
    ctx.restore();
  }
  if (a === 'spin') {
    ctx.save();
    ctx.strokeStyle = PALETTE.phasey; ctx.lineWidth = 1.8 * s; ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const a0 = p * TAU * 2 + i * Math.PI;
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(11 * s, by - 27 * s, (10 + i * 3) * s, a0, a0 + 2); ctx.stroke();
    }
    ctx.restore();
  }
  if (a === 'listen') {
    ctx.save();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const q = (t * 1.2 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(q * Math.PI) * 0.8;
      ctx.beginPath(); ctx.arc(8 * s, by - 44 * s, (8 + (1 - q) * 14) * s, -0.5, 0.5); ctx.stroke();
    }
    ctx.restore();
  }
  if (a === 'cheer') {
    for (let i = 0; i < 3; i++) {
      const ang = t * 3 + i * 2.1;
      starPath(ctx, Math.cos(ang) * 22 * s, by - 52 * s + Math.sin(ang) * 6 * s, 3.4 * s, t * 3);
      ctx.fillStyle = [PALETTE.sunny, PALETTE.mint, '#f7a8b8'][i]; ctx.fill(); inkStroke(ctx, s, 1.2);
    }
  }
  if (a === 'facepalm') {
    ctx.strokeStyle = 'rgba(14,14,14,0.6)'; ctx.lineWidth = 1.4 * s;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo((-8 + i * 5) * s, by - 60 * s); ctx.lineTo((-8 + i * 5) * s, by - 54 * s); ctx.stroke(); }
  }
  ctx.restore();
}

function drawKidFace(ctx: Ctx, s: number, t: number, face: Face, yawn: number) {
  ctx.save();
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineCap = 'round'; ctx.lineWidth = 1.9 * s;
  const ex = [1, 8.5], ey = 0;
  const blink = (t % 4.3) < 0.12;
  for (const x of ex) {
    const X = x * s, Y = ey * s;
    if (face === 'closed' || face === 'yawn' || blink) {
      ctx.beginPath(); ctx.arc(X, Y - 1 * s, 2.6 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else if (face === 'happy') {
      ctx.beginPath(); ctx.arc(X, Y + 1.5 * s, 2.6 * s, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    } else if (face === 'wide') {
      ctx.fillStyle = '#fff'; ellipse(ctx, X, Y, 2.6 * s, 3.1 * s); ctx.fill(); ctx.lineWidth = 1.4 * s; ctx.stroke();
      ctx.fillStyle = INK; circle(ctx, X + 0.8 * s, Y, 1.3 * s); ctx.fill(); ctx.lineWidth = 1.9 * s;
    } else {
      // sleepy half-lidded
      ctx.beginPath(); ctx.ellipse(X, Y + 0.3 * s, 1.9 * s, 2.1 * s, 0, 0, Math.PI); ctx.fill();
      ctx.beginPath(); ctx.moveTo(X - 2.6 * s, Y + 0.2 * s); ctx.lineTo(X + 2.6 * s, Y + 0.2 * s); ctx.stroke();
      if (face === 'focus') { ctx.beginPath(); ctx.moveTo(X - 2.4 * s, Y - 4.4 * s); ctx.lineTo(X + 2.4 * s, Y - 3.4 * s); ctx.stroke(); }
    }
  }
  blush(ctx, 4.8 * s, 4.5 * s, s, 6 * s, 0.5);
  // mouth
  const mx = 5 * s, my = 7 * s;
  if (face === 'yawn') {
    ellipse(ctx, mx, my, 2.6 * s, (1.5 + 2.6 * yawn) * s); ctx.fillStyle = '#7a2e3a'; ctx.fill(); ctx.stroke();
  } else if (face === 'happy') {
    ctx.beginPath(); ctx.moveTo(mx - 3 * s, my - 1 * s); ctx.quadraticCurveTo(mx, my + 5 * s, mx + 3 * s, my - 1 * s); ctx.closePath(); ctx.fillStyle = '#7a2e3a'; ctx.fill(); ctx.stroke();
  } else if (face === 'wide') {
    circle(ctx, mx, my, 1.5 * s); ctx.stroke();
  } else if (face === 'shush') {
    ctx.beginPath(); ctx.moveTo(mx - 2 * s, my); ctx.quadraticCurveTo(mx, my - 1.2 * s, mx + 2 * s, my); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(mx, my - 1.5 * s, 1.8 * s, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  }
  ctx.restore();
}
