// PROOF OVERLAY (trailer f1586–2162, Critic fix 2): makes "card → action" unmissable on the split screen.
// Driven frame-exactly by the capture's own logs (videos/capture/pg_split_23.events.json + .layout.json):
//  - on each action frame the executing card (its .card.current rect from the layout log) pops: a halo frame in
//    the card's colour scales 1.0 → 1.12 → 1.06 with a glow and a white flash, for ~30 frames;
//  - on the SAME frame a ring of that colour pulses on the acting character/bot in the room window;
//  - for the first two actions, a thin animated connector runs from the card to the actor.
// The overlay is in trailer space: it maps capture CSS px through the two window crops (room / bot_code) that
// this file also defines, so the Editor must use exactly these crops (written to the JSON markers).
import { type Scene, type Ctx, W, H, FPS, PAL, TAU, clamp, lerp, ease, prog, roundRect, RT } from '../lib/core';

export interface Seg { start: number; dur: number; in: number; codeY: number }
export interface ProofParams {
  frames: number;
  events: string; layout: string;
  /** EDL segments in overlay-clip frames (0 = trailer f1586), each with its bot_code crop top (CSS px). */
  segs: Seg[];
  /** Capture CSS-px positions of the actor for each action (measured on the capture frames). */
  actors: { frame: number; x: number; y: number; who: string; x2?: number; y2?: number }[];
  connectors: number; bg?: string;
}
// window crops (capture CSS px, 1920×1080 frame) → trailer dst (split_frame windows)
export const ROOM_SRC = [240, 124, 838, 763], ROOM_DST = [28, 28, 1124, 1024];
export const CODE_W = 350, CODE_H = 350 * 948 / 696, CODE_X = 1570, CODE_DST = [1196, 104, 696, 948];
const OP_COLOR: Record<string, string> = { HIGHFIVE: PAL.sunny, LISTEN: PAL.mint, IF: PAL.moony, BOOP: PAL.red, END: '#555', LABEL: '#c9c3b5' };

let EV: any = null, LAY: any = null;
function cardRectAt(f: number): number[] | null {
  for (const s of LAY.segments) if (s.sel === '.card.current' && f >= s.from && f <= s.to) return s.rects[0];
  return null;
}
function cardOpAt(f: number): string {
  let op = 'HIGHFIVE';
  for (const c of EV.cardHighlights) if (c.frame <= f) op = c.op;
  return op;
}
const room = (x: number, y: number) => ({ x: ROOM_DST[0] + (x - ROOM_SRC[0]) * ROOM_DST[2] / ROOM_SRC[2], y: ROOM_DST[1] + (y - ROOM_SRC[1]) * ROOM_DST[3] / ROOM_SRC[3] });
const code = (x: number, y: number, y0: number) => { const s = CODE_DST[2] / CODE_W; return { x: CODE_DST[0] + (x - CODE_X) * s, y: CODE_DST[1] + (y - y0) * s, s }; };

/** Which segment / capture frame is shown at overlay frame f. */
function segAt(f: number, p: ProofParams) {
  for (const s of p.segs) if (f >= s.start && f < s.start + s.dur) return { s, cf: s.in + (f - s.start) };
  return null;
}

function drawCardPop(ctx: Ctx, r: number[], y0: number, u: number, color: string) {
  const a = code(r[0], r[1], y0), b = code(r[0] + r[2], r[1] + r[3], y0);
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, w = b.x - a.x, h = b.y - a.y;
  const sc = u < 6 ? lerp(1, 1.12, ease.outBack(u / 6, 2)) : lerp(1.12, 1.06, ease.outCubic(clamp((u - 6) / 10)));
  const fade = 1 - clamp((u - 22) / 10);
  if (fade <= 0) return;
  ctx.save();
  ctx.globalAlpha *= fade;
  ctx.translate(cx, cy); ctx.scale(sc, sc);
  // glow
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 34 * RT.dpr;
  ctx.lineWidth = 10; ctx.strokeStyle = color; roundRect(ctx, -w / 2 - 8, -h / 2 - 8, w + 16, h + 16, 18); ctx.stroke();
  ctx.restore();
  ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; roundRect(ctx, -w / 2 - 13, -h / 2 - 13, w + 26, h + 26, 22); ctx.stroke();
  ctx.lineWidth = 7; ctx.strokeStyle = color; roundRect(ctx, -w / 2 - 8, -h / 2 - 8, w + 16, h + 16, 18); ctx.stroke();
  // flash on the card itself
  const fl = clamp(1 - u / 8) * 0.45;
  if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl})`; roundRect(ctx, -w / 2, -h / 2, w, h, 12); ctx.fill(); }
  // a ▶ "running" marker
  ctx.fillStyle = color; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-w / 2 - 44, -14); ctx.lineTo(-w / 2 - 20, 0); ctx.lineTo(-w / 2 - 44, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  return { x: a.x - 30, y: cy };
}
function drawRing(ctx: Ctx, x: number, y: number, u: number, color: string) {
  for (const d of [0, 7]) {
    const v = u - d;
    if (v < 0 || v > 30) continue;
    const k = v / 30;
    const r = lerp(46, 120, ease.outCubic(k));
    ctx.save();
    ctx.globalAlpha *= 1 - k;
    ctx.lineWidth = lerp(14, 3, k);
    ctx.strokeStyle = PAL.ink; ctx.beginPath(); ctx.ellipse(x, y, r + 3, (r + 3) * 0.72, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = lerp(10, 2, k);
    ctx.strokeStyle = color; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.72, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // soft glow under the actor for the first 20 frames
  if (u < 24) {
    ctx.save(); ctx.globalAlpha *= 0.5 * (1 - u / 24);
    const g = ctx.createRadialGradient(x, y, 10, x, y, 110);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 110, 80, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
}
function drawConnector(ctx: Ctx, from: { x: number; y: number }, to: { x: number; y: number }, u: number, color: string) {
  const draw = ease.inOutCubic(clamp(u / 12));
  const fade = 1 - clamp((u - 44) / 12);
  if (fade <= 0 || draw <= 0) return;
  const c1 = { x: lerp(from.x, to.x, 0.35), y: from.y - 120 }, c2 = { x: lerp(from.x, to.x, 0.75), y: to.y - 160 };
  const pts: { x: number; y: number }[] = [];
  const N = 60;
  for (let i = 0; i <= N * draw; i++) {
    const t = i / N, m = 1 - t;
    pts.push({ x: m * m * m * from.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * to.x, y: m * m * m * from.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * to.y });
  }
  ctx.save(); ctx.globalAlpha *= fade; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = () => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); };
  path(); ctx.lineWidth = 8; ctx.strokeStyle = PAL.ink; ctx.stroke();
  path(); ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.stroke();
  // travelling spark + arrowhead
  const tip = pts[pts.length - 1];
  ctx.fillStyle = '#fff'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(tip.x, tip.y, 7, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
}


/** A false IF: a dim grey outline sweeps once around the card (8–10 f), with a small ✗. No glow, no ▶. */
function drawIfFalse(ctx: Ctx, r: number[], y0: number, u: number) {
  const a = code(r[0], r[1], y0), b = code(r[0] + r[2], r[1] + r[3], y0);
  const w = b.x - a.x, h = b.y - a.y;
  const k = clamp(u / 9), fade = 1 - clamp((u - 12) / 8);
  if (fade <= 0) return;
  const per = 2 * (w + h);
  ctx.save(); ctx.globalAlpha *= 0.85 * fade;
  ctx.setLineDash([per * k, per]); ctx.lineWidth = 5; ctx.strokeStyle = '#d3d8e2';
  roundRect(ctx, a.x - 5, a.y - 5, w + 10, h + 10, 14); ctx.stroke(); ctx.setLineDash([]);
  if (u >= 6) {
    const x = b.x - 34, y = (a.y + b.y) / 2, s = 14;
    ctx.lineCap = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = PAL.ink;
    ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = '#c9cfdb'; ctx.stroke();
  }
  ctx.restore();
}
/** A true IF: ✓ badge + an arrow down the left gutter and out of the window ("jump to fix2"). */
function drawIfTrue(ctx: Ctx, r: number[], y0: number, u: number) {
  const a = code(r[0], r[1], y0), b = code(r[0] + r[2], r[1] + r[3], y0);
  const fade = 1 - clamp((u - 30) / 10);
  if (fade <= 0) return;
  ctx.save(); ctx.globalAlpha *= fade;
  const ck = ease.outBack(clamp((u - 2) / 8), 2.5);
  if (ck > 0) {
    const x = b.x - 30, y = a.y + 24;
    ctx.save(); ctx.translate(x, y); ctx.scale(ck, ck);
    ctx.fillStyle = PAL.mint; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-2, 8); ctx.lineTo(10, -8); ctx.stroke();
    ctx.restore();
  }
  // jump arrow: from the card's left edge down the gutter to the bottom of the window
  const d = ease.inOutCubic(clamp((u - 2) / 7));
  if (d > 0) {
    const x0 = a.x - 6, ya = (a.y + b.y) / 2, gx = CODE_DST[0] + 30, yb = CODE_DST[1] + CODE_DST[3] - 16;
    const pts: [number, number][] = [];
    const N = 40;
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push(t < 0.25 ? [lerp(x0, gx, t / 0.25), ya] : [gx, lerp(ya, yb, (t - 0.25) / 0.75)]); }
    const n = Math.max(2, Math.round(pts.length * d));
    const path = () => { ctx.beginPath(); for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i][0], pts[i][1]); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(); ctx.lineWidth = 11; ctx.strokeStyle = PAL.ink; ctx.stroke();
    path(); ctx.lineWidth = 6; ctx.strokeStyle = PAL.moony; ctx.stroke();
    const [tx, ty] = pts[n - 1];
    if (d > 0.3) {
      const down = n > N * 0.25;
      ctx.fillStyle = PAL.moony; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3;
      ctx.beginPath();
      if (down) { ctx.moveTo(tx, ty + 16); ctx.lineTo(tx - 13, ty - 4); ctx.lineTo(tx + 13, ty - 4); }
      else { ctx.moveTo(tx - 16, ty); ctx.lineTo(tx + 4, ty - 13); ctx.lineTo(tx + 4, ty + 13); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}
/** The jump target label lights as the next segment opens: arrow in from the top of the window, then a pop. */
function drawLabelLand(ctx: Ctx, r: number[], y0: number, u: number, text: string) {
  const a = code(r[0], r[1], y0), b = code(r[0] + r[2], r[1] + r[3], y0);
  const gx = CODE_DST[0] + 30, top = CODE_DST[1] + 10, ya = (a.y + b.y) / 2;
  const d = ease.inOutCubic(clamp(u / 10));
  const fade = 1 - clamp((u - 26) / 8);
  if (fade <= 0) return;
  ctx.save(); ctx.globalAlpha *= fade; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pts: [number, number][] = [[gx, top], [gx, ya], [a.x - 8, ya]];
  const segLen = [ya - top, a.x - 8 - gx], tot = segLen[0] + segLen[1];
  let rem = tot * d;
  const draw = () => {
    ctx.beginPath(); ctx.moveTo(gx, top);
    const l1 = Math.min(rem, segLen[0]); ctx.lineTo(gx, top + l1);
    if (rem > segLen[0]) ctx.lineTo(gx + Math.min(rem - segLen[0], segLen[1]), ya);
  };
  draw(); ctx.lineWidth = 11; ctx.strokeStyle = PAL.ink; ctx.stroke();
  draw(); ctx.lineWidth = 6; ctx.strokeStyle = PAL.moony; ctx.stroke();
  if (d >= 1) { ctx.fillStyle = PAL.moony; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x - 2, ya); ctx.lineTo(a.x - 22, ya - 13); ctx.lineTo(a.x - 22, ya + 13); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.restore();
  if (u >= 8) drawCardPop(ctx, r, y0, u - 8, PAL.moony);
  void pts; void text;
}

export const proof: Scene<ProofParams> = {
  resolve: (p) => ({
    frames: 576,
    events: '/home/nitheesh/AI_things/HACKTHONS/QURIOSITY-WORK/videos/capture/pg_split_23.events.json',
    layout: '/home/nitheesh/AI_things/HACKTHONS/QURIOSITY-WORK/videos/capture/pg_split_23.layout.json',
    segs: [
      { start: 0, dur: 96, in: 124, codeY: 565 },    // the cursor drags BOOP q2 into place (pick 122, drop 188)
      { start: 96, dur: 96, in: 980, codeY: 64 },    // HIGHFIVE q1 → a: bot a high-fives q1 at 1013
      { start: 192, dur: 96, in: 1300, codeY: 160 }, // LISTEN a: bot a BEEPs at 1348
      { start: 288, dur: 96, in: 1420, codeY: 250 }, // LISTEN b: bot b BEEPs at 1459; the IFs light 1483 / 1506
      { start: 384, dur: 96, in: 1600, codeY: 565 }, // BOOP q2: the caretaker boops q2 at 1640
      { start: 480, dur: 96, in: 1749, codeY: 565 }, // X-ray: the dreams are intact
    ],
    actors: [
      { frame: 1013, x: 540, y: 552, who: 'bot a + q1' },
      { frame: 1348, x: 478, y: 622, who: 'bot a' },
      { frame: 1459, x: 646, y: 702, who: 'bot b' },
      { frame: 1640, x: 812, y: 636, who: 'caretaker', x2: 734, y2: 600 },
    ],
    connectors: 2, ...p,
  }),
  frames: (p) => p.frames,
  markers: (p) => ({
    room_window_src_css: ROOM_SRC, room_window_dst: ROOM_DST,
    code_window_src_css_per_seg: p.segs.map((s) => [CODE_X, s.codeY, CODE_W, +CODE_H.toFixed(2)]) as any, code_window_dst: CODE_DST,
    segs_trailer: p.segs.map((s) => [1586 + s.start, s.dur, s.in]) as any,
    action_frames_clip: p.actors.map((a) => { const s = p.segs.find((s) => a.frame >= s.in && a.frame < s.in + s.dur); return s ? s.start + a.frame - s.in : -1; }),
    action_frames_trailer: p.actors.map((a) => { const s = p.segs.find((s) => a.frame >= s.in && a.frame < s.in + s.dur); return s ? 1586 + s.start + a.frame - s.in : -1; }),
  } as any),
  prepare: async (p) => {
    EV = await (await fetch(`/@fs${p.events}`)).json();
    LAY = await (await fetch(`/@fs${p.layout}`)).json();
  },
  render(ctx, f, p) {
    const at = segAt(f, p);
    if (!at) return;
    const { s, cf } = at;
    // keep the card pops inside the bot_code window (plus a 10 px bleed into the frame margin)
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, CODE_DST[0] - 40, H); roundRect(ctx, CODE_DST[0] - 10, CODE_DST[1] - 10, CODE_DST[2] + 20, CODE_DST[3] + 20, 26); ctx.clip();
    // IF lines: evaluated from the log — an IF is TRUE when the next executed card is not the next line (it jumped).
    const hl = EV.cardHighlights;
    for (let k = 0; k < hl.length; k++) {
      const c = hl[k];
      if (c.op !== 'IF' || c.frame < s.in || c.frame >= s.in + s.dur) continue;
      const next = hl[k + 1];
      const taken = !!next && next.line !== c.line + 1;
      const u = cf - c.frame;
      if (u < 0 || u > 40) continue;
      const r = cardRectAt(c.frame + 6) ?? cardRectAt(c.frame);
      if (!r) continue;
      if (!taken) drawIfFalse(ctx, r, s.codeY, u);
      else {
        const from = drawCardPop(ctx, r, s.codeY, u, OP_COLOR.IF);
        drawIfTrue(ctx, r, s.codeY, u);
        void from;
      }
    }
    // the jump lands: the target label (first card after a taken IF) pops at the head of the next segment,
    // with an arrow coming in from the top of the window, before the BOOP action
    for (let k = 0; k < hl.length - 1; k++) {
      const c = hl[k], nx = hl[k + 1];
      if (c.op !== 'IF' || nx.line === c.line + 1) continue;
      const segIf = p.segs.find((q) => c.frame >= q.in && c.frame < q.in + q.dur);
      const segNext = p.segs.find((q) => segIf && q.start === segIf.start + segIf.dur);
      if (!segNext || s !== segNext) continue;
      const u = f - s.start;
      if (u > 34) continue;
      const r = cardRectAt(nx.frame + 6) ?? cardRectAt(nx.frame);
      if (r) drawLabelLand(ctx, r, s.codeY, u, nx.text.replace(/×\d+$/, ''));
    }
    p.actors.forEach((a, i) => {
      if (a.frame < s.in || a.frame >= s.in + s.dur) return;
      const u = cf - a.frame;
      if (u < 0 || u > 60) return;
      const op = cardOpAt(a.frame);
      const color = OP_COLOR[op] ?? PAL.sunny;
      const r = cardRectAt(a.frame);
      const pos = room(a.x, a.y);
      let from = null;
      if (r) from = drawCardPop(ctx, r, s.codeY, u, color);
      drawRing(ctx, pos.x, pos.y, u, color);
      if (a.x2 != null) { const q = room(a.x2, a.y2!); drawRing(ctx, q.x, q.y, u - 4, color); }
      if (i < p.connectors && r && from) drawConnector(ctx, from, { x: pos.x + 60, y: pos.y - 40 }, u, color);
    });
    ctx.restore();
  },
};
