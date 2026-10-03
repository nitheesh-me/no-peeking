// Schrödi: deadpan cat peeking out of a cardboard box. Anchor = ground centre under the box.
import { PALETTE, type DialogueLine, type SchrodiActorVisual } from '../core/contracts';
import { type Ctx, INK, TAU, LINE, clamp, circle, ellipse, inkStroke, groundShadow, zzz, starPath } from './util';

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

// ═════════════════════════════ SCHRÖDI ACTOR (v0.3): out of the box, full body ═════════════════════════════
// Anchor = feet (ground contact). Sitting height ≈ 60·s to the ear tips (caretaker-sized). Faces +x for facing = 1:
// the WHOLE figure (head, face offset, ears, tail, paws, box) is mirrored; only text stays unmirrored.
// hop-in / hop-out: the box sits AT the anchor; outside the box the cat stands 40·s toward `facing`.
const bellA = (p: number) => Math.sin(clamp(p) * Math.PI);
const easeA = (p: number) => { p = clamp(p); return p * p * (3 - 2 * p); };
const swing = (p: number) => easeA(p < 0.5 ? p * 2 : 2 - p * 2); // 0 → 1 at contact → 0

function catLimb(ctx: Ctx, s: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, w: number, col: string) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = (w + LINE * 2) * s; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = w * s; ctx.strokeStyle = col; ctx.stroke();
}
function paw(ctx: Ctx, s: number, x: number, y: number, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ellipse(ctx, 0, 0, 4.4 * s, 3.2 * s); ctx.fillStyle = CAT_L; ctx.fill(); inkStroke(ctx, s, 1.8);
  ctx.strokeStyle = 'rgba(14,14,14,0.45)'; ctx.lineWidth = 0.9 * s;
  for (const d of [-1.4, 1.4]) { ctx.beginPath(); ctx.moveTo(d * s + 1.5 * s, -1.6 * s); ctx.lineTo(d * s + 2.2 * s, 0.6 * s); ctx.stroke(); }
  ctx.restore();
}
function boxPart(ctx: Ctx, s: number, part: 'back' | 'front') {
  const W = 24 * s, D = 11 * s, H = 24 * s, top = -H;
  if (part === 'back') {
    ctx.beginPath(); ctx.moveTo(-W, top); ctx.lineTo(-W + D, top - D); ctx.lineTo(W + D, top - D); ctx.lineTo(W, top); ctx.closePath();
    ctx.fillStyle = '#7a5428'; ctx.fill(); inkStroke(ctx, s, 2);
    ctx.beginPath(); ctx.moveTo(-W + D, top - D); ctx.lineTo(-W + D + 4 * s, top - D - 11 * s); ctx.lineTo(W + D - 4 * s, top - D - 11 * s); ctx.lineTo(W + D, top - D); ctx.closePath();
    ctx.fillStyle = BOX_D; ctx.fill(); inkStroke(ctx, s, 2);
    return;
  }
  ctx.beginPath(); ctx.moveTo(W, top); ctx.lineTo(W + D, top - D); ctx.lineTo(W + D, -D); ctx.lineTo(W, 0); ctx.closePath();
  ctx.fillStyle = BOX_D; ctx.fill(); inkStroke(ctx, s);
  ctx.beginPath(); ctx.rect(-W, top, W * 2, H);
  const fg = ctx.createLinearGradient(0, top, 0, 0); fg.addColorStop(0, BOX_L); fg.addColorStop(1, BOX);
  ctx.fillStyle = fg; ctx.fill(); inkStroke(ctx, s);
  ctx.fillStyle = 'rgba(255,240,200,0.75)'; ctx.fillRect(-4 * s, top, 8 * s, 8 * s);
  ctx.beginPath(); ctx.moveTo(-W, top); ctx.lineTo(-W - 8 * s, top + 8 * s); ctx.lineTo(-W - 2 * s, top + 10 * s); ctx.lineTo(-W, top + 4 * s); ctx.closePath();
  ctx.fillStyle = BOX_D; ctx.fill(); inkStroke(ctx, s, 2);
}

export function drawSchrodiActor(ctx: Ctx, x: number, y: number, s: number, v: SchrodiActorVisual, t: number) {
  const f = v.facing === -1 ? -1 : 1;
  const a = v.action, p = clamp(v.phase ?? 0), e = bellA(p);
  let mood: string = v.mood ?? 'deadpan';

  // ── pose (local, facing +x, feet at 0) ──
  let ox = 0, oy = 0;                        // whole-cat offset (hops)
  let bx = 0, by = -15, brx = 11.5, bry = 14, brot = 0; // body
  let hx = 3, hy = -36, htilt = 0;           // head
  let earSw = 0;                              // front-ear swivel (listen)
  let tailA = Math.sin(t * 1.8) * 0.25, tailUp = 0;
  // front paws: [x, y] in local; shoulders at (4, -22) near / (-1, -22) far
  let pn: [number, number] = [6, -2], pf: [number, number] = [-1, -2], pnRot = 0;
  let legs = 'sit' as 'sit' | 'walk' | 'stretch';
  let walkC = 0, yawnK = 0, showBox = false, boxFirst = false, inBox = 0;

  switch (a) {
    case 'walk': {
      legs = 'walk'; walkC = t * 6;
      bx = 0; by = -16 - Math.abs(Math.sin(walkC)) * 1.2; brx = 16; bry = 10;
      hx = 15; hy = -30 - Math.abs(Math.sin(walkC)) * 1.2; tailUp = 0.6; tailA = Math.sin(t * 3) * 0.2;
      break;
    }
    case 'boop': {
      const r = swing(p); pn = [6 + 15 * r, -2 - 18 * r]; pnRot = -0.6 * r; hx += 1.5 * r; brot = 0.06 * r; break;
    }
    case 'shush': {
      const r = easeA(p * 2.5); pn = [6 + (hx + 1 - 6) * r, -2 + (hy + 8 + 2) * r]; pnRot = -1.2 * r; mood = 'deadpan'; break;
    }
    case 'spin': {
      const ang = p * TAU * 2; pn = [17 + Math.cos(ang) * 5, -24 + Math.sin(ang) * 5]; pnRot = ang; break;
    }
    case 'point': {
      const r = easeA(p * 2.2); pn = [6 + 18 * r, -2 - 24 * r]; pnRot = -0.9 * r; hx += 1 * r; break;
    }
    case 'listen': {
      earSw = easeA(p * 2) ; htilt = 0.14 * earSw; mood = 'sleepy'; break;
    }
    case 'press': {
      const r = swing(p); pn = [18, -20 + 6 * r]; pnRot = 0.2; brot = 0.05 * r; break;
    }
    case 'stretch': {
      legs = 'stretch';
      const r = swing(p);
      bx = -2; by = -15 + 4 * r; brx = 12 + 6 * r; bry = 14 - 4 * r; brot = 0.5 * r; // rump up, chest down
      hx = 3 + 12 * r; hy = -36 + 16 * r; htilt = 0.25 * r;
      pn = [6 + 16 * r, -2]; pf = [-1 + 14 * r, -2];
      tailUp = 0.9 * r; mood = r > 0.4 ? 'sleepy' : mood;
      break;
    }
    case 'yawn': {
      yawnK = e; htilt = -0.18 * e; mood = e > 0.2 ? 'sleepy' : mood; break;
    }
    case 'hop-in':
    case 'hop-out': {
      showBox = true;
      const k = a === 'hop-out' ? p : 1 - p;  // k: 0 = in the box, 1 = outside
      const kk = easeA(k);
      ox = 40 * kk; oy = -Math.sin(k * Math.PI) * 30 + (1 - kk) * 8; // sink into the box when inside
      inBox = 1 - kk;
      boxFirst = k > 0.55; // once past the apex the cat is in front of the box
      legs = Math.sin(k * Math.PI) > 0.4 ? 'stretch' : 'sit';
      if (legs === 'stretch') { pn = [14, -6]; pf = [10, -4]; brot = (a === 'hop-out' ? 0.25 : -0.25); }
      tailUp = 0.5;
      break;
    }
    default: break; // sit
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f, 1);
  if (showBox) { groundShadow(ctx, 4 * s, 0, 34 * s, 10 * s, 0.28); boxPart(ctx, s, 'back'); if (boxFirst) boxPart(ctx, s, 'front'); }
  // contact shadow (shrinks while airborne)
  const air = clamp(-oy / 30);
  if (!(showBox && inBox > 0.5)) groundShadow(ctx, ox * s + (legs === 'walk' ? 2 : 0) * s, 0, (legs === 'walk' ? 22 : 17) * s * (1 - air * 0.5), 6 * s * (1 - air * 0.5), 0.3 * (1 - air * 0.6));
  ctx.translate(ox * s, oy * s);

  const S = (n: number) => n * s;
  // ── tail (behind) ──
  {
    const rx = bx - brx * 0.8, ry = by + bry * 0.6;
    ctx.save(); ctx.translate(S(rx), S(ry)); ctx.rotate(tailA - tailUp * 0.6);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(S(-14), S(2), S(-18), S(-14 - tailUp * 6), S(-10), S(-24 - tailUp * 6));
    ctx.lineCap = 'round'; ctx.lineWidth = S(7 + LINE * 2 - 2); ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = S(5.5); ctx.strokeStyle = CAT; ctx.stroke();
    // striped tip
    ctx.beginPath(); ctx.moveTo(S(-15.5), S(-16 - tailUp * 6)); ctx.bezierCurveTo(S(-14), S(-21 - tailUp * 6), S(-12), S(-23 - tailUp * 6), S(-10), S(-24 - tailUp * 6));
    ctx.lineWidth = S(5.5); ctx.strokeStyle = CAT_D; ctx.stroke();
    ctx.restore();
  }
  // ── far legs ──
  if (legs === 'walk') {
    const c = walkC;
    catLimb(ctx, s, S(-9), S(by + 4), S(-9 + Math.sin(c + Math.PI) * 3), S(-5), S(-9 + Math.sin(c + Math.PI) * 5), S(-2 - Math.max(0, Math.sin(c)) * 3), 5.5, CAT_D);
    catLimb(ctx, s, S(9), S(by + 4), S(9 + Math.sin(c) * 3), S(-5), S(9 + Math.sin(c) * 5), S(-2 - Math.max(0, -Math.sin(c)) * 3), 5.5, CAT_D);
  } else {
    catLimb(ctx, s, S(0), S(-15), S(pf[0] * 0.5 - 1), S((pf[1] - 15) / 2), S(pf[0]), S(pf[1]), 5.5, CAT_D);
    paw(ctx, s, S(pf[0]), S(pf[1]));
  }
  // ── body ──
  ctx.save();
  ctx.translate(S(bx), S(by)); ctx.rotate(brot);
  ctx.beginPath();
  if (legs === 'walk') ctx.ellipse(0, 0, S(brx), S(bry), 0, 0, TAU);
  else { // pear: wider at the bottom
    ctx.moveTo(0, S(-bry));
    ctx.bezierCurveTo(S(brx * 0.8), S(-bry), S(brx * 1.05), S(bry * 0.3), S(brx * 0.9), S(bry * 0.85));
    ctx.quadraticCurveTo(0, S(bry * 1.12), S(-brx * 0.95), S(bry * 0.85));
    ctx.bezierCurveTo(S(-brx * 1.15), S(bry * 0.3), S(-brx * 0.8), S(-bry), 0, S(-bry));
    ctx.closePath();
  }
  const bg = ctx.createRadialGradient(S(-brx * 0.3), S(-bry * 0.5), S(1), 0, 0, S(Math.max(brx, bry) * 1.25));
  bg.addColorStop(0, '#8d91a9'); bg.addColorStop(0.55, CAT); bg.addColorStop(1, CAT_D);
  ctx.fillStyle = bg; ctx.fill();
  ctx.save(); ctx.clip();
  // belly patch + back stripes + rim light
  ellipse(ctx, S(brx * 0.35), S(bry * 0.25), S(brx * 0.5), S(bry * 0.62)); ctx.fillStyle = CAT_L; ctx.fill();
  ctx.strokeStyle = CAT_D; ctx.lineWidth = S(2); ctx.lineCap = 'round';
  for (const k of [-0.5, -0.1, 0.3]) { ctx.beginPath(); ctx.moveTo(S(-brx * 0.95), S(bry * k)); ctx.lineTo(S(-brx * 0.55), S(bry * k + 1)); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = S(2.5);
  ctx.beginPath(); ctx.ellipse(0, 0, S(brx * 0.92), S(bry * 0.92), 0, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
  ctx.restore();
  inkStroke(ctx, s);
  ctx.restore();
  // ── near legs ──
  if (legs === 'walk') {
    const c = walkC + Math.PI / 2;
    catLimb(ctx, s, S(-6), S(by + 5), S(-6 + Math.sin(c) * 3), S(-5), S(-6 + Math.sin(c) * 5), S(-2 - Math.max(0, -Math.sin(c)) * 3), 6, CAT);
    paw(ctx, s, S(-6 + Math.sin(c) * 5 + 1), S(-2 - Math.max(0, -Math.sin(c)) * 3));
    catLimb(ctx, s, S(11), S(by + 5), S(11 + Math.sin(c + Math.PI) * 3), S(-5), S(11 + Math.sin(c + Math.PI) * 5), S(-2 - Math.max(0, Math.sin(c)) * 3), 6, CAT);
    paw(ctx, s, S(11 + Math.sin(c + Math.PI) * 5 + 1), S(-2 - Math.max(0, Math.sin(c)) * 3));
  } else {
    // haunch (sitting thigh) + back foot
    if (legs === 'sit') {
      ellipse(ctx, S(-4), S(-7), S(7.5), S(6.5)); ctx.fillStyle = CAT; ctx.fill(); inkStroke(ctx, s, 2);
      paw(ctx, s, S(-1), S(-1.5));
    } else {
      catLimb(ctx, s, S(-6), S(by + 6), S(-8), S(-6), S(-8), S(-2), 6, CAT); paw(ctx, s, S(-7), S(-2));
    }
  }
  // ── head ──
  ctx.save();
  ctx.translate(S(hx), S(hy)); ctx.rotate(htilt);
  {
    const HR = S(13);
    const earUp = mood === 'shock' ? 1.2 : 1;
    for (const side of [-1, 1]) {
      const twitch = side > 0 && Math.sin(t * 0.9) > 0.97 ? 0.2 : 0;
      const sw = side > 0 ? earSw : 0;
      ctx.save(); ctx.translate(side * S(8), S(-8)); ctx.rotate(side * (0.35 + twitch) + sw * 0.9);
      ctx.scale(1 - sw * 0.35, 1);
      ctx.beginPath(); ctx.moveTo(S(-5), S(3)); ctx.lineTo(0, S(-8.5) * earUp); ctx.lineTo(S(5), S(3)); ctx.closePath();
      ctx.fillStyle = CAT; ctx.fill(); inkStroke(ctx, s);
      ctx.beginPath(); ctx.moveTo(S(-2.5), S(2.5)); ctx.lineTo(0, S(-5) * earUp); ctx.lineTo(S(2.5), S(2.5)); ctx.closePath();
      ctx.fillStyle = '#f2a7b8'; ctx.fill();
      ctx.restore();
    }
    ellipse(ctx, 0, 0, HR * 1.12, HR);
    const g = ctx.createRadialGradient(S(-4), S(-6), S(1.5), 0, 0, HR * 1.25);
    g.addColorStop(0, '#9599b0'); g.addColorStop(0.6, CAT); g.addColorStop(1, CAT_D);
    ctx.fillStyle = g; ctx.fill(); inkStroke(ctx, s);
    ctx.strokeStyle = CAT_D; ctx.lineWidth = S(1.8); ctx.lineCap = 'round';
    for (const dx of [-3.5, 0, 3.5]) { ctx.beginPath(); ctx.moveTo(S(dx), -HR + S(2)); ctx.lineTo(S(dx * 0.8), -HR + S(6)); ctx.stroke(); }
    ellipse(ctx, S(1), S(5), S(6.8), S(4.6)); ctx.fillStyle = CAT_L; ctx.fill();
    // specular sheen on the crown
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ellipse(ctx, S(-5), S(-7), S(3.4), S(1.8), -0.5); ctx.fill();
    ctx.save(); ctx.translate(S(1), 0); ctx.scale(0.82, 0.82);
    catFace(ctx, 0, 0, s, mood, t);
    if (yawnK > 0.2) { ellipse(ctx, 0, S(8.5), S(3.2), S((1.5 + 3.5 * yawnK))); ctx.fillStyle = '#7a2e3a'; ctx.fill(); ctx.lineWidth = S(1.5); ctx.strokeStyle = INK; ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
  // ── near front leg (the acting paw) ──
  if (legs !== 'walk') {
    const sx = 5, sy = legs === 'stretch' ? by - 2 : (Math.abs(pn[1]) < 6 ? -15 : -20);
    catLimb(ctx, s, S(sx), S(sy), S((sx + pn[0]) / 2 + 1), S((sy + pn[1]) / 2 + 1), S(pn[0]), S(pn[1]), 6, CAT);
    paw(ctx, s, S(pn[0]), S(pn[1]), pnRot);
  }
  if (a === 'press') {
    const r = swing(p);
    ellipse(ctx, S(19), S(-12), S(7), S(3)); ctx.fillStyle = '#d9d5cc'; ctx.fill(); inkStroke(ctx, s, 2);
    ctx.beginPath(); ctx.ellipse(S(19), S(-14.5 + r * 2.5), S(5), S(2.3), 0, 0, TAU); ctx.fillStyle = PALETTE.red; ctx.fill(); inkStroke(ctx, s, 2);
  }
  // ── effects ──
  ctx.lineCap = 'round';
  if (a === 'boop' && e > 0.8) {
    ctx.strokeStyle = INK; ctx.lineWidth = S(1.6);
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(S(pn[0] + 6), S(pn[1] + i * 4)); ctx.lineTo(S(pn[0] + 10), S(pn[1] + i * 6)); ctx.stroke(); }
  }
  if (a === 'spin') {
    ctx.strokeStyle = PALETTE.phasey; ctx.lineWidth = S(1.8); ctx.globalAlpha = 0.75;
    for (let i = 0; i < 2; i++) { const a0 = p * TAU * 2 + i * Math.PI; ctx.beginPath(); ctx.arc(S(17), S(-24), S(9 + i * 3), a0, a0 + 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  if (a === 'point' && p > 0.4) {
    ctx.strokeStyle = 'rgba(14,14,14,0.6)'; ctx.lineWidth = S(1.4); ctx.globalAlpha = bellA((p - 0.4) / 0.6);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(S(pn[0] + 8 + i * 5), S(pn[1] - 3 - i * 2)); ctx.lineTo(S(pn[0] + 11 + i * 5), S(pn[1] - 4.5 - i * 2)); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  if (a === 'listen') {
    ctx.strokeStyle = INK; ctx.lineWidth = S(1.5);
    for (let i = 0; i < 3; i++) {
      const q = (t * 1.2 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(q * Math.PI) * 0.8 * earSw;
      ctx.beginPath(); ctx.arc(S(hx + 10), S(hy - 8), S(6 + (1 - q) * 12), -0.6, 0.6); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (showBox && !boxFirst) { ctx.translate(-ox * s, -oy * s); boxPart(ctx, s, 'front'); ctx.translate(ox * s, oy * s); }
  ctx.restore();

  // unmirrored overlays (text)
  if (a === 'shush' && p > 0.3) {
    const q = clamp((p - 0.3) / 0.7);
    const px = x + f * (20 + q * 10) * s, py = y + (hy - 10 - q * 8) * s;
    ctx.save(); ctx.globalAlpha = Math.sin(q * Math.PI);
    ctx.beginPath();
    for (const [dx, dy, r] of [[0, 0, 7], [6, -2, 6], [-5, 1, 5]]) { ctx.moveTo(px + (dx + r) * s, py + dy * s); ctx.arc(px + dx * s, py + dy * s, r * s, 0, TAU); }
    ctx.lineWidth = 2.8 * s; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = '#fffdf8'; ctx.fill();
    ctx.fillStyle = INK; ctx.font = `700 ${8 * s}px Quicksand, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('shh', px + 1 * s, py);
    ctx.restore();
  }
  if (a === 'yawn' && yawnK > 0.5) zzz(ctx, x + f * 14 * s, y + (hy - 14) * s, s * 0.8, t);
  if (mood === 'shock') {
    ctx.save(); ctx.font = `700 ${14 * s}px Quicksand, sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 4 * s; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    const qx = x + (ox * f - f * 16) * s, qy = y + (oy + hy - 20) * s;
    ctx.strokeText('!', qx, qy); ctx.fillStyle = PALETTE.red; ctx.fillText('!', qx, qy); ctx.restore();
  }
}
