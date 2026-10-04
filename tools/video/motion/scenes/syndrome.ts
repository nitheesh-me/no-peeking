// 5. THE SYNDROME GRAPHIC (mechanic video). Two bots, four answers; each row points at one Qubble.
// Built from the real art: drawBot (antenna light + its own BEEP!/quiet word pop) and tucked-in Qubbles.
// Rows animate one by one; antennae light in sync (markers give the exact frames for the beep SFX).
import art from '../../../../src/art';
import { type Scene, type Ctx, W, H, FPS, PAL, clamp, lerp, ease, prog, roundRect, RT } from '../lib/core';
import { drawBg, prepareBg, type BgKind } from '../lib/bg';
import { layoutText, drawCollapseText } from '../lib/text';
import { grain, drawParticles, sparkBurst, type Particle } from '../lib/fx';

export interface SyndromeParams {
  frames?: number; bg: BgKind; bgImage?: string;
  start: number; rowFrames: number; hold: number;
  title: string; grain: number;
}
// a = HIGHFIVE q1,q2 → LISTEN a; b = HIGHFIVE q2,q3 → LISTEN b. 1 = BEEP, 0 = QUIET.
const ROWS: { a: 0 | 1; b: 0 | 1; target: number | null; result: string }[] = [
  { a: 0, b: 0, target: null, result: 'nobody flipped' },
  { a: 1, b: 0, target: 0, result: 'BOOP q1' },
  { a: 1, b: 1, target: 1, result: 'BOOP q2' },
  { a: 0, b: 1, target: 2, result: 'BOOP q3' },
];
const ROW_Y = [335, 500, 665, 830];
const BOT_A = 330, BOT_B = 720, Q0 = 1150, QD = 175, RES = 1690;
const A_ON = 10, B_ON = 24, ARROW = [34, 46], TARGET = 46, RESULT = 54;

function chip(ctx: Ctx, x: number, y: number, text: string, bg: string, fg: string, k: number, font = '800 30px Quicksand', h = 46) {
  if (k <= 0) return;
  ctx.save();
  ctx.font = font;
  const w = ctx.measureText(text).width + 34;
  const sc = lerp(0.6, 1, ease.outBack(clamp(k), 2.4));
  ctx.translate(x, y); ctx.scale(sc, sc);
  ctx.globalAlpha *= clamp(k * 2);
  roundRect(ctx, -w / 2, -h / 2 + 3, w, h, h / 2); ctx.fillStyle = PAL.ink; ctx.fill();
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 2);
  ctx.restore();
}
const pcache = new Map<number, Particle[]>();

export const syndrome: Scene<SyndromeParams> = {
  resolve: (p) => ({ bg: 'notebook', start: 30, rowFrames: 96, hold: 72, title: 'Two bots. Four answers.', grain: 0.03, ...p }),
  frames: (p) => p.frames ?? p.start + p.rowFrames * 4 + p.hold,
  markers: (p) => ({
    rows: ROWS.map((_, r) => p.start + r * p.rowFrames),
    bot_a_light: ROWS.map((_, r) => p.start + r * p.rowFrames + A_ON),
    bot_b_light: ROWS.map((_, r) => p.start + r * p.rowFrames + B_ON),
    beeps: ROWS.flatMap((row, r) => [row.a ? p.start + r * p.rowFrames + A_ON : -1, row.b ? p.start + r * p.rowFrames + B_ON : -1]).filter((x) => x >= 0),
    quiets: ROWS.flatMap((row, r) => [!row.a ? p.start + r * p.rowFrames + A_ON : -1, !row.b ? p.start + r * p.rowFrames + B_ON : -1]).filter((x) => x >= 0),
    target: ROWS.map((_, r) => p.start + r * p.rowFrames + TARGET),
    all_legible: p.start + 3 * p.rowFrames + RESULT + 14,
  }),
  prepare: async (p) => { await prepareBg({ bg: p.bg, bgImage: p.bgImage }); },
  render(ctx, f, p) {
    const t = f / FPS;
    drawBg(ctx, f, { bg: p.bg, bgImage: p.bgImage, push: 0.02 }, syndrome.frames(p));
    const dark = p.bg !== 'notebook' && p.bg !== 'day';
    const ink = dark ? PAL.paper : PAL.ink;
    // title + headers
    const tb = layoutText(ctx, p.title, { x: W / 2, y: 120, size: 72 });
    drawCollapseText(ctx, tb, f, { start: 0, reveal: 18, style: dark ? 'night' : 'day' });
    const hk = prog(f, 14, 26);
    ctx.save(); ctx.globalAlpha *= hk; ctx.font = '700 30px Quicksand'; ctx.textAlign = 'center'; ctx.fillStyle = dark ? '#cfcbe0' : PAL.ink2;
    ctx.fillText('bot a: q1 = q2?', BOT_A + 50, 225);
    ctx.fillText('bot b: q2 = q3?', BOT_B + 50, 225);
    ctx.fillText('who got flipped?', Q0 + QD, 225);
    ctx.fillText('the fix', RES, 225);
    ctx.strokeStyle = dark ? 'rgba(240,240,255,0.35)' : 'rgba(14,14,14,0.3)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(220, 250); ctx.lineTo(1840, 250); ctx.stroke();
    ctx.restore();
    ROWS.forEach((row, r) => {
      const s0 = p.start + r * p.rowFrames;
      const u = f - s0;
      if (u < 0) return;
      const y = ROW_Y[r];
      const k = ease.outCubic(prog(u, 0, 12));
      const active = f < s0 + p.rowFrames || r === 3;
      ctx.save();
      ctx.translate(0, (1 - k) * 24);
      ctx.globalAlpha *= k;
      // highlighter swipe behind the active row (fades to a faint band once the next row starts)
      const sw = ease.inOutCubic(prog(u, 0, 16));
      const bandA = active ? 0.55 : 0.18;
      ctx.save(); ctx.globalAlpha *= bandA;
      ctx.fillStyle = row.target == null ? 'rgba(61,220,151,0.55)' : 'rgba(255,183,43,0.55)';
      roundRect(ctx, 200, y - 74, 1680 * sw, 148, 34); ctx.fill();
      ctx.restore();
      // bots (light: null → answer)
      const la = u >= A_ON ? row.a : null, lb = u >= B_ON ? row.b : null;
      art.drawBot(ctx, BOT_A, y + 62, 2.05, { light: la, action: u >= A_ON - 6 && u < A_ON + 30 ? 'listen' : 'idle', facing: 1, label: 'a' }, t);
      art.drawBot(ctx, BOT_B, y + 62, 2.05, { light: lb, action: u >= B_ON - 6 && u < B_ON + 30 ? 'listen' : 'idle', facing: 1, label: 'b' }, t + 0.4);
      chip(ctx, BOT_A + 150, y + 6, row.a ? 'BEEP' : 'QUIET', row.a ? PAL.red : '#e9fbf2', row.a ? '#fff' : '#1f9e66', prog(u, A_ON, A_ON + 8));
      chip(ctx, BOT_B + 150, y + 6, row.b ? 'BEEP' : 'QUIET', row.b ? PAL.red : '#e9fbf2', row.b ? '#fff' : '#1f9e66', prog(u, B_ON, B_ON + 8));
      // arrow
      const ak = ease.inOutCubic(prog(u, ARROW[0], ARROW[1]));
      if (ak > 0) {
        const x0 = 940, x1 = lerp(x0, 1040, ak);
        ctx.save(); ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y + 6); ctx.lineTo(x1, y + 6); ctx.stroke();
        if (ak > 0.6) { ctx.beginPath(); ctx.moveTo(x1 + 12, y + 6); ctx.lineTo(x1 - 10, y - 8); ctx.lineTo(x1 - 10, y + 20); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      // three tucked-in Qubbles; the culprit is highlighted and trembles
      const hitOn = u >= TARGET;
      for (let q = 0; q < 3; q++) {
        const isT = hitOn && row.target === q;
        art.drawQubble(ctx, Q0 + q * QD, y + 46, 1.7, { bloch: { x: 1, y: 0, z: 0 }, blanket: 1, state: isT && u < TARGET + 50 ? 'scared' : 'sleep', label: `q${q + 1}`, highlight: isT }, t + q * 0.7 + r);
      }
      if (hitOn && row.target != null) {
        const qx = Q0 + row.target * QD;
        let pl = pcache.get(r); if (!pl) { pl = sparkBurst(qx, y - 20, 70 + r, 1.0, 10, [PAL.red, '#fff36b']); pcache.set(r, pl); }
        drawParticles(ctx, pl, f, s0 + TARGET);
        const ek = ease.outBack(prog(u, TARGET, TARGET + 10), 2.5);
        ctx.save(); ctx.translate(qx + 58, y - 20); ctx.rotate(0.15); ctx.scale(ek, ek);
        ctx.font = '56px Quantum'; ctx.textAlign = 'center'; ctx.lineWidth = 8; ctx.strokeStyle = PAL.ink; ctx.lineJoin = 'round';
        ctx.strokeText('!', 0, 0); ctx.fillStyle = PAL.red; ctx.fillText('!', 0, 0); ctx.restore();
      }
      if (hitOn && row.target == null) {
        const ek = ease.outBack(prog(u, TARGET, TARGET + 10), 2.5);
        ctx.save(); ctx.translate(Q0 + QD + 70, y - 30); ctx.scale(ek, ek);
        ctx.lineWidth = 9; ctx.strokeStyle = PAL.ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-4, 14); ctx.lineTo(22, -14); ctx.stroke();
        ctx.lineWidth = 5; ctx.strokeStyle = PAL.mint; ctx.stroke(); ctx.restore();
      }
      // the fix, as a Bot Code card
      const rk = prog(u, RESULT, RESULT + 10);
      if (row.target == null) chip(ctx, RES, y + 6, 'all good', PAL.mint, PAL.ink, rk, '40px Quantum', 70);
      else chip(ctx, RES, y + 6, row.result, PAL.red, '#ffffff', rk, '40px Quantum', 70);
      ctx.restore();
    });
    if (p.grain > 0 && p.bg !== 'none') grain(ctx, f, p.grain);
  },
};
export { RT };
