// 6. "THE PROGRAM BECOMES A CIRCUIT". Hard cut (snap) to the kid's real 2-3 program as Bot Code cards
// (Schrödi's bedtime checklist, the gremlin's night flip, the morning decoder), then every card flies to
// its gate and morphs into it: HIGHFIVE → CNOT, LISTEN → measurement, IF … BOOP → classically controlled X,
// the gremlin → the red X error. Then the closing line sets in underneath. Optional "Exports to Qiskit" stamp.
import { type Scene, type Ctx, W, H, FPS, PAL, TAU, clamp, lerp, ease, prog, roundRect, RT, wobble } from '../lib/core';
import { drawBg, prepareBg, type BgKind } from '../lib/bg';
import { layoutText, drawCollapseText } from '../lib/text';
import { grain } from '../lib/fx';

export interface CircuitParams {
  frames: number; bg: BgKind; bgImage?: string;
  morphStart: number; stagger: number; morphDur: number;
  line: string; lineAt: number; lineReveal: number;
  stamp: number | null;
  grain: number;
}

type Kind = 'cnot' | 'x_err' | 'meas' | 'cx';
interface Card { label: string; color: string; fg: string; kind: Kind; x: number; c?: number; t?: number; cond?: [number, number]; dashed?: boolean }
// wires: 0 q1, 1 q2, 2 q3, 3 a, 4 b
const WIRE_Y = [230, 318, 406, 494, 582];
const WIRES = ['q1', 'q2', 'q3', 'a', 'b'];
const X0 = 300, X1 = 1780;
const CARDS: Card[] = [
  { label: 'HIGHFIVE q1 → q2', color: PAL.sunny, fg: PAL.ink, kind: 'cnot', x: 400, c: 0, t: 1 },
  { label: 'HIGHFIVE q1 → q3', color: PAL.sunny, fg: PAL.ink, kind: 'cnot', x: 490, c: 0, t: 2 },
  { label: 'Flipper flips q2', color: '#ffe1df', fg: PAL.redInk, kind: 'x_err', x: 620, t: 1, dashed: true },
  { label: 'HIGHFIVE q1 → a', color: PAL.sunny, fg: PAL.ink, kind: 'cnot', x: 750, c: 0, t: 3 },
  { label: 'HIGHFIVE q2 → a', color: PAL.sunny, fg: PAL.ink, kind: 'cnot', x: 835, c: 1, t: 3 },
  { label: 'HIGHFIVE q2 → b', color: PAL.sunny, fg: PAL.ink, kind: 'cnot', x: 920, c: 1, t: 4 },
  { label: 'HIGHFIVE q3 → b', color: PAL.sunny, fg: PAL.ink, kind: 'cnot', x: 1005, c: 2, t: 4 },
  { label: 'LISTEN a', color: PAL.mint, fg: PAL.ink, kind: 'meas', x: 1110, t: 3 },
  { label: 'LISTEN b', color: PAL.mint, fg: PAL.ink, kind: 'meas', x: 1190, t: 4 },
  { label: 'IF a BEEP, b QUIET → BOOP q1', color: PAL.moony, fg: '#fff', kind: 'cx', x: 1340, t: 0, cond: [1, 0] },
  { label: 'IF a BEEP, b BEEP → BOOP q2', color: PAL.moony, fg: '#fff', kind: 'cx', x: 1490, t: 1, cond: [1, 1] },
  { label: 'IF a QUIET, b BEEP → BOOP q3', color: PAL.moony, fg: '#fff', kind: 'cx', x: 1640, t: 2, cond: [0, 1] },
];
const MEAS_X = [1110, 1190];
const SECTIONS = [
  { name: 'BEDTIME', sub: 'encode', x0: 330, x1: 560 },
  { name: 'NIGHT', sub: 'error', x0: 560, x1: 690 },
  { name: 'MORNING', sub: 'syndrome', x0: 690, x1: 1250 },
  { name: 'FIX', sub: 'correct', x0: 1250, x1: 1730 },
];

/** Card stack position (three columns like the editor: bedtime | night | morning). */
function cardHome(i: number) {
  const colX = [330, 790, 1330], colTop = 290;
  const col = i < 2 ? 0 : i < 3 ? 1 : 2;
  const row = i < 2 ? i : i < 3 ? 0 : i - 3;
  return { x: colX[col], y: colTop + row * 76, w: col === 2 ? 640 : 420 };
}
const COL_TITLES = [{ t: "BEDTIME · Schrödi's checklist", x: 330 }, { t: 'NIGHT · the gremlin', x: 790 }, { t: 'MORNING · your program', x: 1330 }];

function gateCenter(c: Card) {
  if (c.kind === 'cnot') return { x: c.x, y: (WIRE_Y[c.c!] + WIRE_Y[c.t!]) / 2 };
  return { x: c.x, y: WIRE_Y[c.t!] };
}

function drawGate(ctx: Ctx, c: Card, a: number) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  ctx.strokeStyle = PAL.ink; ctx.fillStyle = PAL.ink; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  const yc = c.c != null ? WIRE_Y[c.c] : 0, yt = WIRE_Y[c.t!];
  if (c.kind === 'cnot') {
    ctx.beginPath(); ctx.moveTo(c.x, yc); ctx.lineTo(c.x, yt + (yt > yc ? 22 : -22)); ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x, yc, 10, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(c.x, yt, 22, 0, TAU); ctx.fillStyle = '#fffdf7'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.x - 22, yt); ctx.lineTo(c.x + 22, yt); ctx.moveTo(c.x, yt - 22); ctx.lineTo(c.x, yt + 22); ctx.stroke();
  } else if (c.kind === 'x_err') {
    ctx.setLineDash([9, 7]); ctx.strokeStyle = PAL.red; ctx.lineWidth = 4;
    roundRect(ctx, c.x - 30, yt - 30, 60, 60, 8); ctx.fillStyle = '#ffe9e7'; ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '38px Quantum'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = PAL.red; ctx.fillText('X', c.x, yt + 2);
  } else if (c.kind === 'meas') {
    roundRect(ctx, c.x - 32, yt - 30, 64, 60, 8); ctx.fillStyle = '#fffdf7'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x, yt + 14, 20, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.x, yt + 14); ctx.lineTo(c.x + 14, yt - 12); ctx.stroke();
  } else if (c.kind === 'cx') {
    // classical controls: double line down to a and b, filled dot = 1 (BEEP), open = 0 (QUIET)
    const yb = WIRE_Y[4];
    ctx.lineWidth = 2.5;
    for (const dx of [-3.5, 3.5]) { ctx.beginPath(); ctx.moveTo(c.x + dx, yt + 30); ctx.lineTo(c.x + dx, yb); ctx.stroke(); }
    c.cond!.forEach((v, k) => {
      const y = WIRE_Y[3 + k];
      ctx.beginPath(); ctx.arc(c.x, y, 11, 0, TAU);
      ctx.fillStyle = v ? PAL.ink : '#fffdf7'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    });
    ctx.lineWidth = 3.5;
    roundRect(ctx, c.x - 30, yt - 30, 60, 60, 8); ctx.fillStyle = '#fffdf7'; ctx.fill(); ctx.stroke();
    ctx.font = '38px Quantum'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = PAL.ink; ctx.fillText('X', c.x, yt + 2);
  }
  ctx.restore();
}

function drawCard(ctx: Ctx, c: Card, x: number, y: number, w: number, h: number, textA: number) {
  ctx.save();
  roundRect(ctx, x - w / 2, y - h / 2 + 3, w, h, 12); ctx.fillStyle = PAL.ink; ctx.fill();
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 12); ctx.fillStyle = c.color; ctx.fill();
  if (c.dashed) ctx.setLineDash([9, 6]);
  ctx.lineWidth = 3; ctx.strokeStyle = c.dashed ? PAL.red : PAL.ink; ctx.stroke(); ctx.setLineDash([]);
  if (textA > 0) {
    ctx.globalAlpha *= textA;
    const size = 34;
    ctx.font = `${size}px Quantum`; ctx.fillStyle = c.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(c.label).width;
    const sc = Math.min(1, (w - 30) / tw);
    ctx.translate(x - w / 2 + 16, y + 2); ctx.scale(sc, sc);
    ctx.fillText(c.label, 0, 0);
  }
  ctx.restore();
}

export const circuit: Scene<CircuitParams> = {
  resolve: (p) => ({
    // trailer (cue sheet v2): starts on the snap (f3698), 288 frames to the end card (f3986). beat = 32.
    frames: 192, bg: 'notebook', morphStart: 6, stagger: 2, morphDur: 26,
    line: '…where you accidentally learned quantum error correction.', lineAt: 62, lineReveal: 30, stamp: null, grain: 0.03, ...p,
  }),
  frames: (p) => p.frames,
  markers: (p) => ({ snap: 0, morph_start: p.morphStart, morph_end: p.morphStart + p.stagger * (CARDS.length - 1) + p.morphDur, line_start: p.lineAt, line_legible: p.lineAt + p.lineReveal, ...(p.stamp != null ? { stamp: p.stamp } : {}) }),
  prepare: async (p) => { await prepareBg({ bg: p.bg, bgImage: p.bgImage }); },
  render(ctx, f, p) {
    const t = f / FPS;
    drawBg(ctx, f, { bg: p.bg, bgImage: p.bgImage, push: 0.03 }, p.frames);
    // snap: the frame slams in (tiny overscale settle)
    const slam = 1 + 0.035 * wobble(f, 0.08, 0.3);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(slam, slam); ctx.translate(-W / 2, -H / 2);
    const mEnd = p.morphStart + p.stagger * (CARDS.length - 1) + p.morphDur;
    // column titles (fade out as the morph starts)
    const colA = 1 - prog(f, p.morphStart, p.morphStart + 14);
    if (colA > 0) {
      ctx.save(); ctx.globalAlpha *= colA; ctx.font = '700 32px Quicksand'; ctx.fillStyle = PAL.ink2; ctx.textAlign = 'center';
      for (const c of COL_TITLES) ctx.fillText(c.t, c.x, 236);
      ctx.restore();
    }
    // wires draw on (left → right), ancillas become classical (double) after measurement
    const wk = ease.inOutCubic(prog(f, p.morphStart - 4, p.morphStart + 30));
    if (wk > 0) {
      ctx.save();
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.font = '40px Quantum'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = PAL.ink;
      WIRE_Y.forEach((y, i) => {
        const xe = lerp(X0, X1, wk);
        ctx.globalAlpha = clamp(wk * 3);
        ctx.fillText(WIRES[i], X0 - 26, y + 2);
        if (i >= 3) {
          const xm = MEAS_X[i - 3];
          ctx.beginPath(); ctx.moveTo(X0, y); ctx.lineTo(Math.min(xe, xm), y); ctx.stroke();
          if (xe > xm) { ctx.lineWidth = 2.2; for (const d of [-3.5, 3.5]) { ctx.beginPath(); ctx.moveTo(xm, y + d); ctx.lineTo(xe, y + d); ctx.stroke(); } ctx.lineWidth = 3; }
        } else { ctx.beginPath(); ctx.moveTo(X0, y); ctx.lineTo(xe, y); ctx.stroke(); }
      });
      ctx.restore();
    }
    // section labels + dividers after the morph
    const sk = prog(f, mEnd - 10, mEnd + 8);
    if (sk > 0) {
      ctx.save(); ctx.globalAlpha *= sk;
      SECTIONS.forEach((s, i) => {
        const cx = (s.x0 + s.x1) / 2;
        ctx.font = '34px Quantum'; ctx.textAlign = 'center'; ctx.fillStyle = PAL.ink; ctx.fillText(s.name, cx, 140);
        ctx.font = '700 26px Quicksand'; ctx.fillStyle = PAL.ink2; ctx.fillText(s.sub, cx, 172);
        if (i > 0) { ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(14,14,14,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x0, 190); ctx.lineTo(s.x0, 630); ctx.stroke(); ctx.setLineDash([]); }
      });
      ctx.restore();
    }
    // cards → gates
    const order = CARDS.map((_, i) => i);
    // draw gates already landed first, flying cards on top
    for (const pass of [0, 1]) {
      order.forEach((i) => {
        const c = CARDS[i];
        const s0 = p.morphStart + i * p.stagger;
        const k = prog(f, s0, s0 + p.morphDur);
        const home = cardHome(i);
        const g = gateCenter(c);
        if (pass === 0) { drawGate(ctx, c, ease.outCubic(prog(k, 0.72, 1))); return; }
        if (k >= 1) {
          // a coloured halo remembers which card it was
          const hk = 1 - prog(f, s0 + p.morphDur, s0 + p.morphDur + 30) * 0.6;
          ctx.save(); ctx.globalAlpha *= 0.35 * hk; ctx.fillStyle = c.color;
          ctx.beginPath(); ctx.arc(g.x, WIRE_Y[c.t!], 40, 0, TAU); ctx.fill(); ctx.restore();
          return;
        }
        const e = ease.inOutCubic(k);
        const x = lerp(home.x, g.x, e), y = lerp(home.y, g.y, e) - Math.sin(e * Math.PI) * 70;
        const gw = 62, gh = 62;
        const w = lerp(home.w, gw, ease.inCubic(clamp(k * 1.15))), h = lerp(62, gh, e);
        const a = 1 - prog(k, 0.75, 1);
        ctx.save(); ctx.globalAlpha *= a;
        // slight rotation in flight
        ctx.translate(x, y); ctx.rotate(Math.sin(e * Math.PI) * (i % 2 ? 0.12 : -0.12)); ctx.translate(-x, -y);
        drawCard(ctx, c, x, y, w, h, 1 - prog(k, 0.1, 0.4));
        ctx.restore();
      });
    }
    ctx.restore();
    // closing line
    const lb = layoutText(ctx, p.line, { x: W / 2, y: 820, size: 70, maxW: 1640 });
    drawCollapseText(ctx, lb, f, { start: p.lineAt, reveal: p.lineReveal, style: 'day', seed: 26 });
    // "Exports to Qiskit" rubber stamp
    if (p.stamp != null && f >= p.stamp) {
      const k = prog(f, p.stamp, p.stamp + 8);
      const sc = lerp(1.8, 1, ease.outCubic(k));
      ctx.save(); ctx.translate(1600, 690); ctx.rotate(-0.12); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(k * 1.5) * 0.9;
      ctx.font = '40px Quantum'; const tw = ctx.measureText('EXPORTS TO QISKIT').width;
      ctx.strokeStyle = PAL.red; ctx.lineWidth = 5; roundRect(ctx, -tw / 2 - 22, -36, tw + 44, 72, 10); ctx.stroke();
      ctx.fillStyle = PAL.red; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('EXPORTS TO QISKIT', 0, 3);
      ctx.restore();
    }
    if (p.grain > 0 && p.bg !== 'none') grain(ctx, f, p.grain);
    void t; void RT;
  },
};
