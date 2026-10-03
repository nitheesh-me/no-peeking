// Schrödi: deadpan cat peeking out of a cardboard box. Anchor = ground centre under the box.
import { PALETTE, type DialogueLine } from '../core/contracts';
import { type Ctx, INK, circle, ellipse, inkStroke, groundShadow, zzz, starPath } from './util';

export const CAT = '#6b6f86', CAT_D = '#4c4f63', CAT_L = '#e9e6f2';
export const BOX = '#d9a865', BOX_D = '#b07f3f', BOX_L = '#ebc48b';

export function drawSchrodi(ctx: Ctx, x: number, y: number, s: number, mood: DialogueLine['mood'], t: number) {
  const m = mood ?? 'deadpan';
  const W = 26 * s, D = 12 * s, H = 26 * s; // box half-width, iso depth, height
  groundShadow(ctx, x + 4 * s, y, 36 * s, 11 * s, 0.3);
  ctx.save();
  ctx.translate(x, y);
  // box back rim (inside)
  const top = -H;
  ctx.beginPath();
  ctx.moveTo(-W, top); ctx.lineTo(-W + D, top - D); ctx.lineTo(W + D, top - D); ctx.lineTo(W, top); ctx.closePath();
  ctx.fillStyle = '#7a5428'; ctx.fill(); inkStroke(ctx, s, 2);
  // back flap
  ctx.beginPath();
  ctx.moveTo(-W + D, top - D); ctx.lineTo(-W + D + 4 * s, top - D - 12 * s); ctx.lineTo(W + D - 4 * s, top - D - 12 * s); ctx.lineTo(W + D, top - D); ctx.closePath();
  ctx.fillStyle = BOX_D; ctx.fill(); inkStroke(ctx, s, 2);

  // tail flick out the back-right
  const tw = Math.sin(t * 2.2) * (m === 'happy' ? 0.5 : 0.25);
  ctx.save();
  ctx.translate(W + 4 * s, top - 4 * s);
  ctx.rotate(tw);
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.bezierCurveTo(8 * s, -6 * s, 4 * s, -18 * s, 12 * s, -22 * s);
  ctx.lineWidth = 6 * s; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
  ctx.lineWidth = 3.4 * s; ctx.strokeStyle = CAT; ctx.stroke();
  ctx.restore();

  // cat head
  const pop = m === 'shock' ? 10 + Math.abs(Math.sin(t * 12)) * 2 : m === 'sleepy' ? -3 : 0;
  const bob = Math.sin(t * 1.4) * 0.8;
  const hx = 3 * s, hy = top - 12 * s - (pop + bob) * s;
  const HR = 16 * s;
  // ears
  const earUp = m === 'shock' ? 1.25 : m === 'sleepy' ? 0.8 : 1;
  for (const side of [-1, 1]) {
    const twitch = side > 0 && Math.sin(t * 0.9) > 0.97 ? 0.2 : 0;
    ctx.save(); ctx.translate(hx + side * 10 * s, hy - 10 * s); ctx.rotate(side * (0.35 + twitch));
    ctx.beginPath(); ctx.moveTo(-6 * s, 4 * s); ctx.lineTo(0, -10 * s * earUp); ctx.lineTo(6 * s, 4 * s); ctx.closePath();
    ctx.fillStyle = CAT; ctx.fill(); inkStroke(ctx, s);
    ctx.beginPath(); ctx.moveTo(-3 * s, 3 * s); ctx.lineTo(0, -6 * s * earUp); ctx.lineTo(3 * s, 3 * s); ctx.closePath();
    ctx.fillStyle = '#f2a7b8'; ctx.fill();
    ctx.restore();
  }
  ellipse(ctx, hx, hy, HR * 1.12, HR);
  const g = ctx.createRadialGradient(hx - 5 * s, hy - 7 * s, 2 * s, hx, hy, HR * 1.2);
  g.addColorStop(0, '#8a8ea6'); g.addColorStop(1, CAT_D);
  ctx.fillStyle = g; ctx.fill(); inkStroke(ctx, s);
  // forehead stripes
  ctx.strokeStyle = CAT_D; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
  for (const dx of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(hx + dx * s, hy - HR + 2 * s); ctx.lineTo(hx + dx * 0.8 * s, hy - HR + 7 * s); ctx.stroke(); }
  // muzzle
  ellipse(ctx, hx, hy + 6 * s, 8 * s, 5.5 * s); ctx.fillStyle = CAT_L; ctx.fill();
  // paws on rim
  for (const px of [-12, 14]) {
    ellipse(ctx, hx + px * s, top + 1 * s, 5.5 * s, 3.6 * s); ctx.fillStyle = CAT_L; ctx.fill(); inkStroke(ctx, s, 2);
  }
  catFace(ctx, hx, hy, s, m, t);
  ctx.restore();

  // front of box (drawn last so the cat sits inside)
  ctx.save();
  ctx.translate(x, y);
  // side face
  ctx.beginPath();
  ctx.moveTo(W, top); ctx.lineTo(W + D, top - D); ctx.lineTo(W + D, -D); ctx.lineTo(W, 0); ctx.closePath();
  ctx.fillStyle = BOX_D; ctx.fill(); inkStroke(ctx, s);
  // front face
  ctx.beginPath(); ctx.rect(-W, top, W * 2, H);
  const fg = ctx.createLinearGradient(0, top, 0, 0);
  fg.addColorStop(0, BOX_L); fg.addColorStop(1, BOX);
  ctx.fillStyle = fg; ctx.fill(); inkStroke(ctx, s);
  // tape strip + "fragile" glyph
  ctx.fillStyle = 'rgba(255,240,200,0.75)';
  ctx.fillRect(-4 * s, top, 8 * s, 9 * s);
  ctx.strokeStyle = 'rgba(14,14,14,0.55)'; ctx.lineWidth = 1.4 * s;
  ctx.beginPath(); ctx.moveTo(-14 * s, -8 * s); ctx.lineTo(-14 * s, -16 * s); ctx.moveTo(-17 * s, -16 * s); ctx.quadraticCurveTo(-14 * s, -10 * s, -11 * s, -16 * s); ctx.stroke();
  // up-arrows stamp ("this side up?")
  ctx.strokeStyle = 'rgba(14,14,14,0.5)';
  for (const ax of [6, 13]) {
    ctx.beginPath(); ctx.moveTo(ax * s, -7 * s); ctx.lineTo(ax * s, -16 * s);
    ctx.moveTo((ax - 2.5) * s, -13 * s); ctx.lineTo(ax * s, -16 * s); ctx.lineTo((ax + 2.5) * s, -13 * s); ctx.stroke();
  }
  ctx.font = `700 ${9 * s}px Quicksand, sans-serif`;
  ctx.fillStyle = 'rgba(200,36,30,0.75)';
  ctx.textAlign = 'center';
  ctx.fillText('?', 20 * s, -8 * s);
  // front flaps
  ctx.beginPath(); ctx.moveTo(-W, top); ctx.lineTo(-W - 8 * s, top + 8 * s); ctx.lineTo(-W - 2 * s, top + 10 * s); ctx.lineTo(-W, top + 4 * s); ctx.closePath();
  ctx.fillStyle = BOX_D; ctx.fill(); inkStroke(ctx, s, 2);
  ctx.beginPath(); ctx.moveTo(-W, top); ctx.lineTo(-W + 6 * s, top + 9 * s); ctx.lineTo(W - 2 * s, top + 9 * s); ctx.lineTo(W, top); ctx.closePath();
  ctx.fillStyle = BOX_L; ctx.fill(); inkStroke(ctx, s, 2);
  ctx.restore();

  if (m === 'sleepy') zzz(ctx, x + 22 * s, y - 50 * s, s, t);
  if (m === 'shock') {
    ctx.save();
    ctx.font = `700 ${16 * s}px Quicksand, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4 * s; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    ctx.strokeText('!', x - 22 * s, y - 60 * s); ctx.fillStyle = PALETTE.red; ctx.fillText('!', x - 22 * s, y - 60 * s);
    ctx.restore();
  }
  if (m === 'happy') {
    starPath(ctx, x - 26 * s, y - 56 * s + Math.sin(t * 4) * 2 * s, 4 * s, t);
    ctx.fillStyle = PALETTE.sunny; ctx.fill(); inkStroke(ctx, s, 1.3);
  }
}

function catFace(ctx: Ctx, hx: number, hy: number, s: number, m: string, t: number) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ey = hy - 1 * s;
  const blink = (t % 5) < 0.12;
  for (const side of [-1, 1]) {
    const ex = hx + side * 6.5 * s;
    if (m === 'happy') {
      ctx.beginPath(); ctx.arc(ex, ey + 1.5 * s, 3 * s, 1.15 * Math.PI, 1.85 * Math.PI); ctx.lineWidth = 2 * s; ctx.strokeStyle = INK; ctx.stroke();
      continue;
    }
    if (m === 'sleepy' || blink) {
      ctx.beginPath(); ctx.moveTo(ex - 3.5 * s, ey); ctx.lineTo(ex + 3.5 * s, ey); ctx.lineWidth = 2 * s; ctx.strokeStyle = INK; ctx.stroke();
      continue;
    }
    const big = m === 'shock';
    const rx = big ? 4.4 * s : 4 * s, ry = big ? 5 * s : 3.8 * s;
    ellipse(ctx, ex, ey, rx, ry);
    ctx.fillStyle = '#e8f27a'; ctx.fill(); ctx.lineWidth = 1.6 * s; ctx.strokeStyle = INK; ctx.stroke();
    // pupil
    ctx.fillStyle = INK;
    if (big) { circle(ctx, ex, ey, 1.3 * s); ctx.fill(); }
    else { ellipse(ctx, ex + side * 0.3 * s, ey + 0.6 * s, 1.2 * s, 3 * s); ctx.fill(); }
    // heavy lids (deadpan / smug)
    if (!big) {
      const lid = m === 'smug' ? (side > 0 ? 0.62 : 0.4) : 0.5;
      ctx.save();
      ellipse(ctx, ex, ey, rx + 0.5 * s, ry + 0.5 * s); ctx.clip();
      ctx.fillStyle = CAT;
      ctx.fillRect(ex - rx - 1 * s, ey - ry - 1 * s, rx * 2 + 2 * s, (ry * 2 + 2 * s) * lid);
      ctx.restore();
      ctx.beginPath();
      const ly = ey - ry + (ry * 2) * lid;
      ctx.moveTo(ex - rx, ly); ctx.lineTo(ex + rx, ly - (m === 'smug' ? side * 0.8 * s : 0));
      ctx.lineWidth = 1.8 * s; ctx.strokeStyle = INK; ctx.stroke();
    }
  }
  // nose + mouth
  ctx.fillStyle = '#f08aa3';
  ctx.beginPath(); ctx.moveTo(hx - 2 * s, hy + 3.5 * s); ctx.lineTo(hx + 2 * s, hy + 3.5 * s); ctx.lineTo(hx, hy + 5.5 * s); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  if (m === 'shock') { ellipse(ctx, hx, hy + 9 * s, 2.4 * s, 2.8 * s); ctx.fillStyle = INK; ctx.fill(); }
  else if (m === 'happy' || m === 'smug') {
    ctx.moveTo(hx - 4 * s, hy + 7 * s); ctx.quadraticCurveTo(hx - 2 * s, hy + 9.5 * s, hx, hy + 6 * s);
    ctx.quadraticCurveTo(hx + 2 * s, hy + 9.5 * s, hx + 4 * s, hy + 7 * s);
    if (m === 'smug') { ctx.moveTo(hx + 4 * s, hy + 7 * s); ctx.lineTo(hx + 6 * s, hy + 5.5 * s); }
    ctx.stroke();
  } else { ctx.moveTo(hx - 2.5 * s, hy + 7.5 * s); ctx.lineTo(hx + 2.5 * s, hy + 7.5 * s); ctx.stroke(); }
  // whiskers
  ctx.strokeStyle = 'rgba(14,14,14,0.55)'; ctx.lineWidth = 1 * s;
  for (const side of [-1, 1]) for (const k of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(hx + side * 8 * s, hy + 6 * s + k * 1.2 * s); ctx.lineTo(hx + side * 18 * s, hy + 5 * s + k * 3 * s); ctx.stroke();
  }
  ctx.restore();
}
