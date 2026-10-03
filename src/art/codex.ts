// Codex support (v0.5): silhouettes for locked entries, standalone props, element glyphs, card frames, showcase lists.
// See docs/ART_NOTES.md → "Codex kit".
import { PALETTE, type BotVisual, type CaretakerVisual, type QubbleVisual, type SchrodiActorVisual } from '../core/contracts';
import { type Ctx, TAU, INK, LINE, circle, ellipse, roundRect, inkStroke, starPath, clamp } from './util';
import { wallWindow, wallClock, wallDoor, clockHands } from './room';
import { drawBed, drawQuilt } from './qubble';
import { drawCatBox } from './schrodi';
import { drawLink, newCanvas } from './world';

// ═════════════════════════════ SILHOUETTE ═════════════════════════════
let silCanvas: HTMLCanvasElement | null = null;
/** Render anything as a flat ink silhouette (locked "???" entries). `draw` paints with the SAME ctx-space coordinates
 *  you would normally use; it is redirected to an offscreen buffer, flattened to one colour, and composited back.
 *  opts.color defaults to ink, opts.alpha to 1; opts.glow adds a soft paper rim so it reads on dark cards. */
export function drawSilhouette(ctx: Ctx, draw: (c: Ctx) => void, opts: { color?: string; alpha?: number; glow?: boolean } = {}) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  if (!silCanvas || silCanvas.width !== cw || silCanvas.height !== ch) silCanvas = newCanvas(cw, ch);
  const sc = silCanvas.getContext('2d')!;
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.clearRect(0, 0, cw, ch);
  sc.setTransform(ctx.getTransform());
  draw(sc);
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = opts.color ?? '#23213a';
  sc.fillRect(0, 0, cw, ch);
  sc.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (opts.glow) { ctx.shadowColor = 'rgba(242,240,235,0.55)'; ctx.shadowBlur = 8; }
  ctx.globalAlpha *= opts.alpha ?? 1;
  ctx.drawImage(silCanvas, 0, 0);
  ctx.restore();
}

// ═════════════════════════════ PROPS ═════════════════════════════
export type PropKind = 'window' | 'clock' | 'door' | 'bed' | 'blanket' | 'box' | 'flashlight' | 'bunting' | 'nightlight';
/** Standalone room props, drawn facing the camera. Anchor = bottom centre (floor contact / bottom of the frame).
 *  Approx sizes at s=1: window 118×130, clock 36×46, door 52×100, bed 75×45, blanket 60×46, box 70×50,
 *  flashlight 40×16, bunting 140×30, nightlight 20×26. night 0..1 picks the night palette. */
export function drawProp(ctx: Ctx, x: number, y: number, s: number, kind: PropKind, t: number, night = 0) {
  const N = night > 0.5 ? 1 : 0, ink = N ? '#0b0b16' : INK;
  const wall = (fn: () => void) => { ctx.save(); ctx.translate(x, y); ctx.scale(48 * s, -48 * s); fn(); ctx.restore(); };
  switch (kind) {
    case 'window': wall(() => { const w = { u0: -0.8, v0: 0.14, w: 1.6, h: 1.3 }; wallWindow(ctx, w, N, ink); }); break;
    case 'clock': wall(() => { const c = { u: 0, v: 0.36 }; wallClock(ctx, c, N, ink); clockHands(ctx, c, t, N); }); break;
    case 'door': wall(() => wallDoor(ctx, { u0: -0.475, w: 0.95, h: 1.95 }, N, ink)); break;
    case 'bed': drawBed(ctx, x, y - 14 * s, s, night); break;
    case 'blanket': drawQuilt(ctx, x, y, s, t); break;
    case 'box': drawCatBox(ctx, x, y, s); break;
    case 'flashlight': {
      ctx.save(); ctx.translate(x, y - 8 * s); ctx.rotate(-0.15);
      const on = Math.sin(t * 2) > -0.6;
      if (on) {
        const g = ctx.createRadialGradient(14 * s, 0, 2, 14 * s, 0, 60 * s);
        g.addColorStop(0, 'rgba(255,240,170,0.7)'); g.addColorStop(1, 'rgba(255,240,170,0)');
        ctx.beginPath(); ctx.moveTo(14 * s, 0); ctx.lineTo(70 * s, -22 * s); ctx.lineTo(70 * s, 22 * s); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      }
      roundRect(ctx, -20 * s, -5 * s, 30 * s, 10 * s, 3 * s); ctx.fillStyle = '#7fc8f8'; ctx.fill(); inkStroke(ctx, s, 2);
      roundRect(ctx, 8 * s, -7.5 * s, 7 * s, 15 * s, 2 * s); ctx.fillStyle = on ? '#fff3b0' : '#d9d5cc'; ctx.fill(); inkStroke(ctx, s, 2);
      ctx.fillStyle = PALETTE.red; circle(ctx, -6 * s, -5 * s, 2 * s); ctx.fill(); inkStroke(ctx, s, 1.2);
      ctx.restore(); break;
    }
    case 'bunting': {
      const cols = [PALETTE.sunny, PALETTE.moony, '#f7a8b8', PALETTE.mint, '#7fc8f8'];
      const L = 140 * s, y0 = y - 28 * s;
      const at = (u: number) => y0 + Math.sin((u / L) * Math.PI) * 10 * s + Math.sin(t * 1.5 + u * 0.05) * 1 * s;
      ctx.save(); ctx.beginPath();
      for (let i = 0; i <= 20; i++) { const u = (i / 20) * L; i ? ctx.lineTo(x - L / 2 + u, at(u)) : ctx.moveTo(x - L / 2 + u, at(u)); }
      ctx.lineWidth = 1.4 * s; ctx.strokeStyle = ink; ctx.stroke();
      for (let i = 0, u = 12 * s; u < L - 8 * s; u += 19 * s, i++) {
        const px = x - L / 2 + u, py = at(u);
        ctx.beginPath(); ctx.moveTo(px - 6 * s, py); ctx.lineTo(px + 6 * s, py); ctx.lineTo(px, py + 13 * s); ctx.closePath();
        ctx.fillStyle = cols[i % cols.length]; ctx.fill(); inkStroke(ctx, s, 1.4);
      }
      ctx.restore(); break;
    }
    case 'nightlight': {
      ctx.save();
      const g = ctx.createRadialGradient(x, y - 16 * s, 1, x, y - 16 * s, 34 * s);
      g.addColorStop(0, `rgba(255,214,120,${0.25 + 0.4 * night})`); g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = g; circle(ctx, x, y - 16 * s, 34 * s); ctx.fill();
      roundRect(ctx, x - 4 * s, y - 10 * s, 8 * s, 10 * s, 2 * s); ctx.fillStyle = N ? '#5a5d86' : '#fffdf8'; ctx.fill(); inkStroke(ctx, s, 1.6);
      starPath(ctx, x, y - 17 * s, 9 * s, Math.PI, 0.5); ctx.fillStyle = '#ffd36b'; ctx.fill(); inkStroke(ctx, s, 1.8);
      ctx.restore(); break;
    }
  }
}

// ═════════════════════════════ ELEMENT GLYPHS ═════════════════════════════
export type GlyphKind = 'sunny' | 'moony' | 'swirl' | 'silk' | 'beep' | 'quiet';
/** Round element badges for the codex (and anywhere else): centred at (x, y), ≈44·s across. */
export function drawGlyph(ctx: Ctx, x: number, y: number, s: number, kind: GlyphKind, t: number) {
  const R = 20 * s;
  ctx.save();
  const disc = (fill: string | CanvasGradient) => { circle(ctx, x, y, R); ctx.fillStyle = fill; ctx.fill(); };
  switch (kind) {
    case 'sunny': case 'moony': {
      const sun = kind === 'sunny', c = sun ? PALETTE.sunny : PALETTE.moony;
      const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.4, 1, x, y, R * 1.1);
      g.addColorStop(0, sun ? '#ffe3a3' : '#b3adff'); g.addColorStop(0.6, c); g.addColorStop(1, sun ? '#d98f00' : '#4a42c9');
      if (sun) {
        ctx.strokeStyle = INK; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 0.4; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * R * 1.12, y + Math.sin(a) * R * 1.12); ctx.lineTo(x + Math.cos(a) * R * 1.35, y + Math.sin(a) * R * 1.35); ctx.stroke(); }
      }
      disc(g); inkStroke(ctx, s);
      if (!sun) { ctx.beginPath(); ctx.arc(x + R * 0.2, y - R * 0.05, R * 0.55, 0, TAU); ctx.arc(x + R * 0.42, y - R * 0.2, R * 0.48, 0, TAU, true); ctx.fillStyle = '#fff1c4'; ctx.fill('evenodd'); }
      // sleepy face
      ctx.strokeStyle = INK; ctx.lineWidth = 1.8 * s; ctx.lineCap = 'round';
      const fx = sun ? x : x - R * 0.3;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(fx + d * 5 * s, y + 1 * s, 2.6 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ellipse(ctx, x - R * 0.45, y - R * 0.5, 3.5 * s, 2 * s, -0.6); ctx.fill();
      ctx.font = `${10 * s}px Quantum, Quicksand, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = sun ? INK : '#fff'; ctx.fillText(sun ? '0' : '1', x + (sun ? 0 : -R * 0.3), y + 10 * s);
      break;
    }
    case 'swirl': {
      disc(PALETTE.moony);
      ctx.save(); circle(ctx, x, y, R); ctx.clip();
      ctx.translate(x, y); ctx.rotate(t * 0.8);
      ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2); ctx.arc(0, R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true); ctx.arc(0, -R / 2, R / 2, Math.PI / 2, -Math.PI / 2, false); ctx.closePath();
      ctx.fillStyle = PALETTE.sunny; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5 * s; ctx.stroke();
      ctx.fillStyle = PALETTE.moony; circle(ctx, 0, -R / 2, R * 0.13); ctx.fill();
      ctx.fillStyle = PALETTE.sunny; circle(ctx, 0, R / 2, R * 0.13); ctx.fill();
      ctx.restore();
      circle(ctx, x, y, R); inkStroke(ctx, s);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ellipse(ctx, x - R * 0.45, y - R * 0.5, 3.5 * s, 2 * s, -0.6); ctx.fill();
      break;
    }
    case 'silk': {
      disc('#2a2850'); inkStroke(ctx, s);
      ctx.save(); circle(ctx, x, y, R - 1); ctx.clip();
      drawLink(ctx, x - R * 0.85, y - R * 0.25, x + R * 0.85, y - R * 0.25, 1, t);
      ctx.restore();
      for (const d of [-1, 1]) { circle(ctx, x + d * R * 0.62, y - R * 0.2, 4.5 * s); ctx.fillStyle = d < 0 ? PALETTE.sunny : PALETTE.moony; ctx.fill(); inkStroke(ctx, s, 1.6); }
      break;
    }
    case 'beep': case 'quiet': {
      const beep = kind === 'beep', on = beep ? Math.sin(t * 8) > -0.3 : true;
      disc(beep ? '#ffe9e7' : '#e9fbf2'); inkStroke(ctx, s);
      const bc = beep ? (on ? PALETTE.red : '#a8302c') : '#7ff0b8';
      if (on) { const g = ctx.createRadialGradient(x, y - 3 * s, 1, x, y - 3 * s, R); g.addColorStop(0, beep ? 'rgba(254,68,61,0.55)' : 'rgba(61,220,151,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; circle(ctx, x, y - 3 * s, R); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(x, y + 4 * s); ctx.lineTo(x, y + 13 * s); ctx.lineWidth = 2.2 * s; ctx.strokeStyle = INK; ctx.stroke();
      circle(ctx, x, y - 3 * s, 8 * s); ctx.fillStyle = bc; ctx.fill(); inkStroke(ctx, s, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; circle(ctx, x - 2.5 * s, y - 5.5 * s, 2.2 * s); ctx.fill();
      ctx.font = `700 ${7.5 * s}px Quicksand, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = beep ? PALETTE.redInk : '#1f9e66'; ctx.fillText(beep ? 'BEEP' : 'quiet', x, y + 15 * s - 1 * s);
      break;
    }
  }
  ctx.restore();
}

// ═════════════════════════════ CODEX CARD FRAME ═════════════════════════════
/** Paper card with a corner ribbon in the category colour (canvas). Top-left anchored; w×h in px. */
export function drawCodexCard(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, opts: { title?: string; ribbon?: string; locked?: boolean; s?: number } = {}) {
  const s = opts.s ?? 1;
  ctx.save();
  roundRect(ctx, x, y + 4 * s, w, h, 14 * s); ctx.fillStyle = INK; ctx.fill(); // chunky drop
  roundRect(ctx, x, y, w, h, 14 * s);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, opts.locked ? '#d9d5cc' : '#fbfaf6'); g.addColorStop(1, opts.locked ? '#c9c4b8' : '#ece8de');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  // paper dots
  ctx.fillStyle = 'rgba(14,14,14,0.05)';
  for (let yy = y + 10 * s; yy < y + h; yy += 14 * s) for (let xx = x + 10 * s + ((yy - y) / (14 * s) % 2) * 7 * s; xx < x + w; xx += 14 * s) { circle(ctx, xx, yy, 0.9 * s); ctx.fill(); }
  // corner ribbon (top-right, diagonal)
  const r = 46 * s;
  ctx.beginPath(); ctx.moveTo(x + w - r - 18 * s, y); ctx.lineTo(x + w - r + 6 * s, y); ctx.lineTo(x + w, y + r - 6 * s); ctx.lineTo(x + w, y + r + 18 * s); ctx.closePath();
  ctx.fillStyle = opts.locked ? '#8a867d' : color; ctx.fill(); inkStroke(ctx, s, 2);
  if (opts.ribbon) {
    ctx.save(); ctx.translate(x + w - r * 0.52, y + r * 0.52); ctx.rotate(Math.PI / 4);
    ctx.font = `700 ${9 * s}px Quicksand, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText(opts.ribbon.toUpperCase(), 0, 4 * s); ctx.restore();
  }
  ctx.restore();
  roundRect(ctx, x, y, w, h, 14 * s); ctx.lineWidth = LINE * s; ctx.strokeStyle = INK; ctx.stroke();
  if (opts.title) {
    ctx.font = `${15 * s}px Quantum, Quicksand, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = INK;
    ctx.fillText(opts.locked ? '???' : opts.title, x + 14 * s, y + h - 14 * s);
  }
  ctx.restore();
}
const cardCache = new Map<string, string>();
/** DOM-friendly version: an SVG data URL to use as a CSS background (`background: url(...) center/100% 100%`).
 *  It is drawn at 240×300 with preserveAspectRatio="none" on the body; keep the element roughly 4:5. */
export function codexCardSVG(color: string, opts: { locked?: boolean; ribbon?: string } = {}): string {
  const key = color + '|' + !!opts.locked + '|' + (opts.ribbon ?? '');
  let url = cardCache.get(key);
  if (url) return url;
  const c = opts.locked ? '#8a867d' : color;
  const esc = (t: string) => t.replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" width="240" height="300">
<defs><pattern id="d" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="0.9" fill="#0e0e0e" fill-opacity="0.06"/><circle cx="11" cy="11" r="0.9" fill="#0e0e0e" fill-opacity="0.06"/></pattern>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${opts.locked ? '#d9d5cc' : '#fbfaf6'}"/><stop offset="1" stop-color="${opts.locked ? '#c9c4b8' : '#ece8de'}"/></linearGradient>
<clipPath id="k"><rect x="2" y="2" width="236" height="290" rx="14"/></clipPath></defs>
<rect x="2" y="7" width="236" height="290" rx="14" fill="#0e0e0e"/>
<rect x="2" y="2" width="236" height="290" rx="14" fill="url(#g)"/>
<g clip-path="url(#k)"><rect width="240" height="300" fill="url(#d)"/>
<path d="M174 2 L198 2 L238 42 L238 66 Z" fill="${c}" stroke="#0e0e0e" stroke-width="2.5" stroke-linejoin="round"/>
${opts.ribbon ? `<text x="0" y="0" transform="translate(214 30) rotate(45)" text-anchor="middle" font-family="Quicksand,sans-serif" font-weight="700" font-size="9" fill="#fff">${esc(opts.ribbon.toUpperCase())}</text>` : ''}</g>
<rect x="2" y="2" width="236" height="290" rx="14" fill="none" stroke="#0e0e0e" stroke-width="3"/></svg>`;
  url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  cardCache.set(key, url);
  return url;
}

// ═════════════════════════════ SHOWCASE LISTS ═════════════════════════════
/** Every pose / state / action the codex can showcase, so the Codex screen can iterate instead of hard-coding. */
export const SHOWCASE = {
  qubbleStates: ['sleep', 'awake-grumpy', 'happy', 'scared', 'giggle', 'mumble', 'collapsed'] as QubbleVisual['state'][],
  blanketLevels: [0, 0.25, 0.5, 1],
  dataBox: { values: [0, 1] as const, tumble: [0, 0.25, 0.5, 0.75, 1] }, // drawQubble(..., { classical: true, bloch: z=±1, tumble })
  botActions: ['idle', 'roll', 'highfive', 'listen', 'reset', 'celebrate', 'confused', 'wave'] as BotVisual['action'][],
  botLights: [null, 0, 1] as BotVisual['light'][],
  caretakerActions: ['idle', 'tiptoe', 'boop', 'shush', 'spin', 'peek', 'listen', 'press', 'cheer', 'facepalm', 'yawn'] as CaretakerVisual['action'][],
  schrodiActions: ['sit', 'walk', 'boop', 'shush', 'spin', 'point', 'listen', 'press', 'stretch', 'hop-in', 'hop-out', 'yawn'] as SchrodiActorVisual['action'][],
  schrodiMoods: ['deadpan', 'smug', 'shock', 'happy', 'sleepy'] as const,
  gremlins: ['flipper', 'phasey', 'wobbles'] as const,
  gremlinPoses: ['sneak', 'strike', 'flee', 'taunt'] as const,
  props: ['window', 'clock', 'door', 'bed', 'blanket', 'box', 'flashlight', 'bunting', 'nightlight'] as PropKind[],
  glyphs: ['sunny', 'moony', 'swirl', 'silk', 'beep', 'quiet'] as GlyphKind[],
  /** Suggested Bloch vectors for dream showcases. */
  dreams: { sunny: { x: 0, y: 0, z: 1 }, moony: { x: 0, y: 0, z: -1 }, plus: { x: 1, y: 0, z: 0 }, minus: { x: -1, y: 0, z: 0 }, plusI: { x: 0, y: 1, z: 0 }, mixed: { x: 0.2, y: 0, z: 0 } },
};
/** Convenience: an animated "phase" for one-shot actions so a showcase loops nicely (contact ≈ 0.5). */
export const showcasePhase = (t: number, period = 1.6) => clamp(((t % period) / period) * 1.15 - 0.05);
