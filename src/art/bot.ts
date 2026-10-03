// Ancillabot: one-wheeled round robot. Antenna bulb = last LISTEN result.
import { PALETTE, type BotVisual } from '../core/contracts';
import { type Ctx, TAU, INK, circle, ellipse, roundRect, inkStroke, groundShadow, nameTag, starPath, questionMark } from './util';

const BODY = '#fbfaf6', BODY_SH = '#d9d5cc', ACCENT = '#7fc8f8', SCREEN = '#22263f', EYE = '#9ff3ff';

export function drawBot(ctx: Ctx, x: number, y: number, s: number, v: BotVisual, t: number) {
  const f = v.facing || 1;
  const a = v.action;
  let lift = 0, lean = 0, spinX = 1, bob = Math.sin(t * 3) * 1.2;
  if (a === 'roll') { lean = 0.16 * f; bob = Math.abs(Math.sin(t * 14)) * 1.2; }
  if (a === 'celebrate') { lift = Math.abs(Math.sin(t * 6)) * 10; bob = 0; }
  if (a === 'reset') { spinX = Math.cos(t * 14); }
  if (a === 'confused') { lean = Math.sin(t * 2) * 0.12; }
  if (a === 'wave') { lean = -0.06 * f + Math.sin(t * 11) * 0.03; }
  if (a === 'listen') { lean = -0.08 * f; }
  const shrink = 1 - lift / 50;
  groundShadow(ctx, x, y, 16 * s * shrink, 6 * s * shrink, 0.3);

  ctx.save();
  ctx.translate(x, y - lift * s);

  // wheel (does not spin-flip)
  const wr = 6.5 * s;
  ctx.save();
  ctx.translate(0, -wr);
  circle(ctx, 0, 0, wr);
  ctx.fillStyle = '#3a3a48';
  ctx.fill();
  inkStroke(ctx, s);
  const wa = a === 'roll' ? t * 14 * f : 0;
  ctx.strokeStyle = '#9a98a8';
  ctx.lineWidth = 1.6 * s;
  for (let i = 0; i < 3; i++) {
    const aa = wa + (i * TAU) / 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(aa) * wr * 0.7, Math.sin(aa) * wr * 0.7); ctx.stroke();
  }
  circle(ctx, 0, 0, 1.8 * s); ctx.fillStyle = '#cfcbd8'; ctx.fill();
  ctx.restore();
  if (a === 'roll') {
    ctx.strokeStyle = 'rgba(14,14,14,0.45)';
    ctx.lineWidth = 2 * s;
    for (let i = 0; i < 3; i++) {
      const yy = -8 * s - i * 8 * s, len = (10 + 4 * Math.sin(t * 20 + i)) * s;
      ctx.beginPath(); ctx.moveTo(-f * (20 * s), yy); ctx.lineTo(-f * (20 * s + len), yy); ctx.stroke();
    }
  }

  // body
  const cy = -26 * s + bob * s;
  ctx.save();
  ctx.translate(0, cy);
  ctx.rotate(lean);
  ctx.scale(spinX * f, 1);
  const R = 14 * s;

  // arms (behind/side)
  const arm = (side: number, up: number, wag = 0) => {
    const sx = side * R * 0.92, sy = 3 * s;
    const ex = side * (R + 6 * s) + (up ? side * -2 * s : 0) + wag * 5 * s;
    const ey = up ? -R - 6 * s : sy + 8 * s + Math.sin(t * 3 + side) * 1.5 * s;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(side * (R + 7 * s), sy - (up ? 4 : -2) * s, ex, ey);
    ctx.lineWidth = 2.6 * s; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
    circle(ctx, ex, ey, 3.6 * s); ctx.fillStyle = ACCENT; ctx.fill(); inkStroke(ctx, s, 2);
    return [ex, ey];
  };
  const hf = a === 'highfive', cel = a === 'celebrate', wave = a === 'wave';
  const wag = wave ? Math.sin(t * 11) : 0;
  const [hx, hy] = arm(1, hf || cel || wave ? 1 : 0, wag);
  if (wave) {
    // little motion arcs beside the waving hand
    ctx.save(); ctx.strokeStyle = 'rgba(14,14,14,0.55)'; ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(hx, hy, 7.5 * s, -Math.PI / 2 + d * 0.5 - 0.3, -Math.PI / 2 + d * 0.5 + 0.3); ctx.stroke(); }
    ctx.restore();
  }
  arm(-1, cel ? 1 : 0);
  if (hf) {
    const p = (t * 3) % 1;
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const aa = (i * TAU) / 6;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(aa) * (5 + p * 6) * s, hy + Math.sin(aa) * (5 + p * 6) * s);
      ctx.lineTo(hx + Math.cos(aa) * (9 + p * 8) * s, hy + Math.sin(aa) * (9 + p * 8) * s);
      ctx.strokeStyle = PALETTE.sunny; ctx.lineWidth = 2.2 * s; ctx.globalAlpha = 1 - p; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    starPath(ctx, hx, hy - 1 * s, 5 * s, t * 3);
    ctx.fillStyle = '#fff3b0'; ctx.fill(); inkStroke(ctx, s, 1.4);
    ctx.restore();
  }

  // ear for listening
  if (a === 'listen') {
    ctx.beginPath();
    ctx.ellipse(-R - 2 * s, -2 * s, 4.5 * s, 6.5 * s, 0.2, 0, TAU);
    ctx.fillStyle = '#ffd1dc'; ctx.fill(); inkStroke(ctx, s, 2);
    ctx.beginPath(); ctx.ellipse(-R - 2 * s, -2 * s, 2 * s, 3.5 * s, 0.2, 0, TAU); ctx.fillStyle = '#f29bb0'; ctx.fill();
  }

  circle(ctx, 0, 0, R);
  const g = ctx.createRadialGradient(-R * 0.4, -R * 0.5, 2 * s, 0, 0, R * 1.05);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, BODY);
  g.addColorStop(1, BODY_SH);
  ctx.fillStyle = g;
  ctx.fill();
  // belly band
  ctx.save();
  circle(ctx, 0, 0, R); ctx.clip();
  ctx.fillStyle = ACCENT;
  ctx.fillRect(-R, R * 0.45, R * 2, R);
  ctx.strokeStyle = 'rgba(14,14,14,0.5)';
  ctx.lineWidth = 1.4 * s;
  ctx.beginPath(); ctx.moveTo(-R, R * 0.45); ctx.lineTo(R, R * 0.45); ctx.stroke();
  ctx.restore();
  // high-fidelity pass: bounce light from the floor, crisp rim light, specular glint
  ctx.save();
  circle(ctx, 0, 0, R); ctx.clip();
  const bounce = ctx.createLinearGradient(0, R * 0.3, 0, R);
  bounce.addColorStop(0, 'rgba(255,220,180,0)'); bounce.addColorStop(1, 'rgba(255,220,180,0.28)');
  ctx.fillStyle = bounce; ctx.fillRect(-R, 0, R * 2, R);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.6 * s;
  ctx.beginPath(); ctx.arc(0, 0, R - 2 * s, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke();
  ctx.strokeStyle = 'rgba(150,200,255,0.5)'; ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.arc(0, 0, R - 1.2 * s, Math.PI * 0.05, Math.PI * 0.4); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ellipse(ctx, -R * 0.45, -R * 0.55, 3 * s, 1.8 * s, -0.7); ctx.fill();
  circle(ctx, -R * 0.68, -R * 0.3, 0.9 * s); ctx.fill();
  circle(ctx, 0, 0, R);
  inkStroke(ctx, s);

  // face screen
  const sw = 18 * s, sh = 11 * s, sxo = 2.5 * s;
  roundRect(ctx, sxo - sw / 2, -sh / 2 - 2 * s, sw, sh, 4.5 * s);
  ctx.fillStyle = SCREEN; ctx.fill(); inkStroke(ctx, s, 1.8);
  ctx.save();
  ctx.translate(sxo, -2 * s);
  ctx.fillStyle = EYE;
  ctx.strokeStyle = EYE;
  ctx.lineWidth = 1.8 * s;
  ctx.lineCap = 'round';
  const blink = (t * 0.7 + 0.3) % 3 < 0.08;
  const lookUp = a === 'listen' ? -1.2 * s : 0;
  if (cel || hf || wave) {
    for (const ex of [-4 * s, 4 * s]) { ctx.beginPath(); ctx.arc(ex, 1.5 * s, 2.5 * s, 1.1 * Math.PI, 1.9 * Math.PI); ctx.stroke(); }
  } else if (a === 'reset') {
    for (const ex of [-4 * s, 4 * s]) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) { const aa = i * 0.7 + t * 10, rr = (i / 12) * 2.6 * s; ctx.lineTo(ex + Math.cos(aa) * rr, Math.sin(aa) * rr); }
      ctx.stroke();
    }
  } else if (a === 'confused') {
    roundRect(ctx, -6 * s, -2.5 * s, 3.4 * s, 4.6 * s, 1.5 * s); ctx.fill();
    roundRect(ctx, 3 * s, -1 * s, 2.4 * s, 2.4 * s, 1 * s); ctx.fill();
  } else if (blink) {
    for (const ex of [-4 * s, 4 * s]) { ctx.beginPath(); ctx.moveTo(ex - 1.8 * s, 0); ctx.lineTo(ex + 1.8 * s, 0); ctx.stroke(); }
  } else {
    for (const ex of [-4 * s, 4 * s]) { roundRect(ctx, ex - 1.6 * s, -2.6 * s + lookUp, 3.2 * s, 5 * s, 1.6 * s); ctx.fill(); }
  }
  ctx.restore();
  // cheek bolts
  ctx.fillStyle = '#ffb3c1';
  ellipse(ctx, sxo + 10 * s, 5 * s, 2.4 * s, 1.5 * s); ctx.fill();
  ctx.restore(); // body transform

  // antenna (always upright-ish, follows lean)
  ctx.save();
  ctx.translate(0, cy);
  ctx.rotate(lean);
  const ay = -R - 9 * s + Math.sin(t * 6) * (a === 'idle' ? 0.6 : 0) * s;
  const sway = Math.sin(t * 4) * 1.5 * s + (a === 'roll' ? -f * 3 * s : 0);
  ctx.beginPath(); ctx.moveTo(0, -R + 1 * s); ctx.quadraticCurveTo(sway * 0.3, -R - 5 * s, sway, ay);
  ctx.lineWidth = 2.2 * s; ctx.strokeStyle = INK; ctx.stroke();
  const light = v.light;
  const blinkOn = light === 1 ? (Math.sin(t * 14) > -0.2) : true;
  let bulb = '#bdb9b0', glow: string | null = null;
  if (light === 0) { bulb = '#7ff0b8'; glow = 'rgba(61,220,151,'; }
  if (light === 1) { bulb = blinkOn ? PALETTE.red : '#a8302c'; glow = blinkOn ? 'rgba(254,68,61,' : null; }
  if (a === 'listen') {
    const p = (t * 1.5) % 1;
    ctx.beginPath(); ctx.arc(sway, ay, (6 + p * 14) * s, 0, TAU);
    ctx.strokeStyle = `rgba(127,200,248,${1 - p})`; ctx.lineWidth = 2 * s; ctx.stroke();
    if (!glow) glow = 'rgba(127,200,248,';
  }
  if (glow) {
    const gr = (light === 1 ? 16 : 12) * s;
    const gg = ctx.createRadialGradient(sway, ay, 1, sway, ay, gr);
    gg.addColorStop(0, glow + '0.65)'); gg.addColorStop(1, glow + '0)');
    ctx.fillStyle = gg; circle(ctx, sway, ay, gr); ctx.fill();
  }
  circle(ctx, sway, ay, 4.4 * s);
  ctx.fillStyle = bulb; ctx.fill(); inkStroke(ctx, s, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  circle(ctx, sway - 1.3 * s, ay - 1.4 * s, 1.3 * s); ctx.fill();
  // tiny word tag
  if (light === 1 && blinkOn) wordPop(ctx, sway + 14 * s, ay - 9 * s, s, 'BEEP!', PALETTE.red, '#fff', t);
  if (light === 0) wordPop(ctx, sway + 14 * s, ay - 7 * s, s * 0.85, 'quiet', '#e9fbf2', '#1f9e66', t);
  ctx.restore();

  if (a === 'confused') questionMark(ctx, x - x + 0, -R * 2 - 34 * s, s, t);
  if (cel) {
    for (let i = 0; i < 4; i++) {
      const p = (t * 1.2 + i / 4) % 1;
      const aa = -Math.PI / 2 + (i - 1.5) * 0.6;
      starPath(ctx, Math.cos(aa) * (20 + p * 16) * s, -40 * s + Math.sin(aa) * (10 + p * 14) * s, 3.5 * s, p * 4);
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = [PALETTE.sunny, PALETTE.red, PALETTE.mint, PALETTE.moony][i]; ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  if (v.label) nameTag(ctx, x + 18 * s, y + 4 * s, s, v.label, '#dff1fd');
}

function wordPop(ctx: Ctx, x: number, y: number, s: number, text: string, bg: string, fg: string, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.08 + Math.sin(t * 9) * 0.03);
  ctx.font = `700 ${8.5 * s}px Quicksand, sans-serif`;
  const w = ctx.measureText(text).width + 8 * s, h = 12 * s;
  roundRect(ctx, -w / 2, -h / 2, w, h, 4 * s);
  ctx.fillStyle = bg; ctx.fill(); inkStroke(ctx, s, 1.5);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0.5 * s);
  ctx.restore();
}
