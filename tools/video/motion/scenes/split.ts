// MECHANIC SPLIT POPS: the proof_overlay look (card pop in its colour + actor ring on the same frame, connectors
// on the first actions, true/false IF distinction with the jump landing) for any split clip of the mechanic EDL.
// One overlay per EDL clip, in final-frame coordinates (the clip's window dst values already include the 0.88
// game-rect scale), clip-local frames (place at the clip's start, no extra scaling).
//
// Card rects / IF outcomes come from the capture's own logs when it has them (card_current events and the
// .card.current layout boxes, as in pg_split_23); captures without them use `cards`: the 2-3 decoder's line
// table (identical layout across the 2-3 captures) or explicit rects.
import { type Scene, type Ctx, W, H, PAL } from '../lib/core';
import { setGeometry, G, drawCardPop, drawRing, drawConnector, drawIfFalse, drawIfTrue, drawLabelLand, room, OP_COLOR } from './proof';

export interface Action { big?: boolean; rect?: number[]; src: number; x?: number; y?: number; x2?: number; y2?: number; line?: number | string; op?: string; color?: string; connector?: boolean }
export interface IfEv { rect?: number[]; src: number; line?: number; taken: boolean; land?: number | string; landSrc?: number }
export interface SplitParams {
  frames: number; in: number;
  capture: string;
  roomSrc: number[]; roomDst: number[];
  codeX: number; codeW: number; codeDst: number[];
  /** [clip-local frame, crop top y (CSS px)] keys, smoothstep-eased between them (as edl.window_at). */
  codeKeys: [number, number | number[]][];
  actions: Action[]; ifs: IfEv[];
  bg?: string;
}
/** 2-3 decoder card rects (CSS px of the 1920×1080 capture), measured from pg_split_23's .card.current log. */
export const LINES_23: Record<string, number[]> = {
  b1: [1438, 148, 142, 62], b2: [1438, 214, 142, 62],
  1: [1648, 132, 262, 40], 2: [1648, 178, 262, 40], 3: [1648, 224, 262, 40], 4: [1648, 270, 262, 40],
  5: [1648, 316, 262, 40], 6: [1648, 362, 262, 40], 7: [1648, 408, 262, 92], 8: [1648, 506, 262, 92], 9: [1648, 604, 262, 92],
  10: [1648, 702, 262, 40], 11: [1648, 750, 262, 32], 12: [1648, 788, 262, 40], 13: [1648, 834, 262, 40], 14: [1648, 878, 262, 32],
  15: [1648, 916, 262, 40], 16: [1648, 962, 262, 40],
};
const OP_BY_LINE_23: Record<string, string> = { b1: 'HIGHFIVE', b2: 'HIGHFIVE', 1: 'HIGHFIVE', 2: 'HIGHFIVE', 3: 'HIGHFIVE', 4: 'HIGHFIVE', 5: 'LISTEN', 6: 'LISTEN', 7: 'IF', 8: 'IF', 9: 'IF', 10: 'END', 11: 'LABEL', 12: 'BOOP', 13: 'END', 14: 'LABEL', 15: 'BOOP', 16: 'END' };

const smooth = (u: number) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
/** Code-window crop at clip frame f: keys are [f, y] (x/w fixed by params) or [f, [x, y, w]] (top-anchored, the
 *  height follows the window aspect), smoothstep-eased between keys like edl.window_at. Returns [x, y, w]. */
function codeWin(keys: [number, number | number[]][], f: number, x0: number, w0: number): number[] {
  const k = [...keys].sort((a, b) => a[0] - b[0]).map(([t, v]) => [t, Array.isArray(v) ? v : [x0, v, w0]] as [number, number[]]);
  if (f <= k[0][0]) return k[0][1];
  if (f >= k[k.length - 1][0]) return k[k.length - 1][1];
  for (let i = 0; i < k.length - 1; i++) if (f >= k[i][0] && f <= k[i + 1][0]) {
    const u = smooth((f - k[i][0]) / Math.max(1e-9, k[i + 1][0] - k[i][0]));
    return k[i][1].map((v, j) => v + (k[i + 1][1][j] - v) * u);
  }
  return k[0][1];
}

let LOG: { hl: any[]; lay: any } | null = null;
function rectFor(line: number | string | undefined, src: number): number[] | null {
  if (LOG) {
    for (const s of LOG.lay.segments) if (s.sel === '.card.current' && src >= s.from && src <= s.to) return s.rects[0];
  }
  return line != null ? LINES_23[String(line)] ?? null : null;
}

export const split: Scene<SplitParams> = {
  resolve: (p) => ({ frames: 360, in: 0, capture: 'me_23_xray', roomSrc: [240, 124, 838, 763], roomDst: [139.84, 24.64, 989.12, 901.12], codeX: 1570, codeW: 350, codeDst: [1167.68, 91.52, 612.48, 834.24], codeKeys: [[0, 64]], actions: [], ifs: [], ...p } as SplitParams),
  frames: (p) => p.frames,
  markers: (p) => ({
    actions_clip: p.actions.map((a) => a.src - p.in), ifs_clip: p.ifs.map((i) => i.src - p.in),
    code_keys_css: p.codeKeys as any, room_src_css: p.roomSrc, room_dst: p.roomDst, code_dst: p.codeDst,
  } as any),
  prepare: async (p) => {
    setGeometry({ roomSrc: p.roomSrc, roomDst: p.roomDst, codeX: p.codeX, codeW: p.codeW, codeDst: p.codeDst });
    try {
      const base = '/@fs/home/nitheesh/AI_things/HACKTHONS/QURIOSITY-WORK/videos/capture/';
      const ev = await (await fetch(`${base}${p.capture}.events.json`)).json();
      const lay = await (await fetch(`${base}${p.capture}.layout.json`)).json();
      const hl = ev.cardHighlights ?? [];
      if (hl.length && lay.segments.some((s: any) => s.sel === '.card.current')) LOG = { hl, lay };
    } catch { LOG = null; }
  },
  render(ctx, f, p) {
    const src = p.in + f;
    const [cx, y0, cw] = codeWin(p.codeKeys, f, p.codeX, p.codeW);
    G.codeX = cx; G.codeW = cw;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, G.codeDst[0] - 40, H);
    ctx.rect(G.codeDst[0] - 10, G.codeDst[1] - 10, G.codeDst[2] + 20, G.codeDst[3] + 20); ctx.clip();
    for (const iv of p.ifs) {
      const u = src - iv.src;
      if (u < 0 || u > 40) continue;
      const r = iv.rect ?? rectFor(iv.line, iv.src);
      if (!r) continue;
      if (!iv.taken) drawIfFalse(ctx, r, y0, u);
      else { drawCardPop(ctx, r, y0, u, OP_COLOR.IF); drawIfTrue(ctx, r, y0, u); }
      if (iv.taken && iv.land != null && iv.landSrc != null) {
        const v = src - iv.landSrc;
        const lr = rectFor(iv.land, iv.landSrc);
        if (lr && v >= 0 && v <= 34) drawLabelLand(ctx, lr, y0, v, '');
      }
    }
    for (const iv of p.ifs) {
      if (!iv.taken || iv.land == null || iv.landSrc == null) continue;
      const v = src - iv.landSrc;
      if (src - iv.src <= 40) continue; // drawn above
      const lr = rectFor(iv.land, iv.landSrc);
      if (lr && v >= 0 && v <= 34) drawLabelLand(ctx, lr, y0, v, '');
    }
    const conns: (() => void)[] = [];
    p.actions.forEach((a) => {
      const u = src - a.src;
      const isConn = a.connector ?? false;
      if (u < 0 || u > 60) return;
      const op = a.op ?? OP_BY_LINE_23[String(a.line)] ?? 'HIGHFIVE';
      const color = a.color ?? OP_COLOR[op] ?? PAL.sunny;
      const r = a.rect ?? (a.line != null || LOG ? rectFor(a.line, a.src) : null);
      let from: { x: number; y: number } | undefined | null = null;
      if (r) from = drawCardPop(ctx, r, y0, u, color);
      if (a.x != null && a.y != null) {
        const pos = room(a.x, a.y);
        drawRing(ctx, pos.x, pos.y, u, color);
        if (a.big) { // the key moment: a larger, triple pulse
          const k0 = G.k; G.k = k0 * 1.6;
          drawRing(ctx, pos.x, pos.y, u - 3, color); drawRing(ctx, pos.x, pos.y, u - 16, color);
          G.k = k0;
        }
        if (a.x2 != null) { const q = room(a.x2, a.y2!); drawRing(ctx, q.x, q.y, u - 4, color); }
        if (isConn && r && from) { const fr = from; conns.push(() => drawConnector(ctx, fr, { x: pos.x + 50 * G.k, y: pos.y - 34 * G.k }, u, color)); }
      }
    });
    ctx.restore();
    for (const c of conns) c(); // connectors cross the gap between the windows, so they are drawn unclipped
    void W;
  },
};
