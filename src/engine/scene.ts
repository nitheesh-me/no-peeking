/**
 * Isometric scene renderer. Draws the daycare for one level from a "view" that the Playback
 * controller updates every frame (snapshot blend, the current event animation, x-ray, night).
 */
import type { LevelDef, Snapshot, QubitId, TraceEvent, Bloch, IsoFn, QubbleVisual, BotVisual, DialogueLine, ErrorEvent, CaretakerVisual } from '../core/contracts';
import { isBot, isQubble } from '../core/contracts';
import { art } from './deps';
import { clamp, lerp, smooth, hump } from './util';

export interface StepAnim {
  ev: TraceEvent;
  from: Snapshot;
  to: Snapshot;
  p: number;        // 0..1 progress
  dir: 1 | -1;      // -1 when rewinding
}

type GremlinName = 'flipper' | 'phasey' | 'wobbles';
const gremlinOf = (e: ErrorEvent): GremlinName => (e.kind === 'phase' ? 'phasey' : e.kind === 'wobble' ? 'wobbles' : 'flipper');

interface Pt { gx: number; gy: number }

export class Scene {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  level: LevelDef;
  w = 0; h = 0; dpr = 1;
  cols = 6; rows = 5; s = 1; ox = 0; oy = 0; TW = 96; TH = 48;
  iso: IsoFn = (gx, gy, gz = 0) => ({ x: this.ox + (gx - gy) * this.TW / 2, y: this.oy + (gx + gy) * this.TH / 2 - gz * this.TH });

  // view state (set by Playback / screens)
  base: Snapshot | null = null;          // snapshot displayed when no anim
  anim: StepAnim | null = null;
  xray = 0; xrayTarget = 0;
  night = 0; nightTarget = 0;
  dim = 0; dimTarget = 0;
  lightsOut = false;
  revealColor = 0;                       // lights-out win flood
  nerd = false;
  peeked = new Set<QubitId>();
  woke = new Set<QubitId>();
  mood: QubbleVisual['state'] | null = null;      // override (e.g. 'happy' on win)
  highlight = new Set<QubitId>();
  hoverPick: QubitId | null = null;
  schrodiMood: DialogueLine['mood'] = 'deadpan';
  shake = 0;
  signShake = new Map<string, number>();
  showSchrodi = true;
  /** caretaker (player avatar) state */
  caretakerMood: 'cheer' | 'facepalm' | null = null;
  private ctAt: Pt | null = null;
  private ctFrom: Pt | null = null;
  private ctAnim: StepAnim | null = null;
  get room(): boolean { return typeof art.drawRoom === 'function'; }
  private screenPos = new Map<QubitId, { x: number; y: number }>();
  private ro: ResizeObserver;
  private silCanvas = document.createElement('canvas');
  private lastT = 0;

  constructor(canvas: HTMLCanvasElement, level: LevelDef) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.level = level;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.setLevel(level);
  }

  destroy(): void { this.ro.disconnect(); }

  setLevel(level: LevelDef): void {
    this.level = level;
    const all = [...level.qubbles, ...level.bots, ...(level.signs ?? [])];
    this.cols = Math.max(6, ...all.map((p) => p.x + 2));
    this.rows = Math.max(5, ...all.map((p) => p.y + 2));
    this.lightsOut = !!(level.lightsOut || level.meta?.includes('lights-out'));
    this.resize();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    const W = Math.round(this.w * this.dpr), H = Math.round(this.h * this.dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    if (this.room) {
      // grounded room: floor + back walls; fill the play area, anchored to the bottom
      const m = 0.3, c = this.cols, rw = this.rows, WALL = 150;
      const minX = -(rw + m) * 48, maxX = (c + m) * 48;
      const minY = -m * 24 - WALL, maxY = (c + rw + m) * 24 + 22;
      this.s = clamp(Math.min((this.w * 1.04) / (maxX - minX), (this.h - 6) / (maxY - minY)), 0.35, 1.8);
      this.TW = 96 * this.s; this.TH = 48 * this.s;
      this.ox = this.w / 2 - this.s * (minX + maxX) / 2;
      this.oy = this.h - 6 - this.s * maxY;
      this.ctAt = null;
      return;
    }
    // fallback: floating island (floor + border margin + Schrödi on the left + headroom for signs + underside)
    const m = 0.5, c = this.cols, rw = this.rows;
    const minX = -(rw + m) * 48 - (this.showSchrodi ? 46 : 12), maxX = (c + m) * 48 + 14;
    const minY = -m * 48 - 125, maxY = (c + rw + m) * 24 + 36 + 80;
    this.s = clamp(Math.min((this.w - 24) / (maxX - minX), (this.h - 12) / (maxY - minY)), 0.35, 1.6);
    this.TW = 96 * this.s; this.TH = 48 * this.s;
    this.ox = this.w / 2 - this.s * (minX + maxX) / 2;
    this.oy = this.h / 2 - this.s * (minY + maxY) / 2;
    this.ctAt = null;
  }

  /** Screen position (CSS px) of a creature's ground point. */
  posOf(id: QubitId): { x: number; y: number } | undefined { return this.screenPos.get(id); }

  hitTest(px: number, py: number): QubitId | null {
    let best: QubitId | null = null, bd = 40 * this.s;
    for (const [id, p] of this.screenPos) {
      const d = Math.hypot(px - p.x, py - (p.y - 22 * this.s));
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  private place(id: QubitId): Pt {
    const p = [...this.level.qubbles, ...this.level.bots].find((q) => q.id === id);
    return p ? { gx: p.x + 0.5, gy: p.y + 0.5 } : { gx: 0.5, gy: 0.5 };
  }

  /** Bloch vector to display for id, blending through the current animation. */
  private blochOf(id: QubitId): Bloch {
    const zero = { x: 0, y: 0, z: 1 };
    const a = this.anim;
    if (!a) return this.base?.bloch[id] ?? zero;
    const f = a.from.bloch[id] ?? zero, t = a.to.bloch[id] ?? zero;
    let k: number;
    const ev = a.ev;
    if (ev.k === 'measure' || (ev.k === 'gate' && ev.op === 'RESET')) k = a.p >= 0.5 ? 1 : 0;           // collapse is sudden, at contact
    else if (ev.k === 'gate' && ev.op === 'HIGHFIVE') k = smooth((a.p - 0.42) / 0.2);
    else if (ev.k === 'noise') k = smooth((a.p - 0.45) / 0.2);
    else k = smooth((a.p - 0.48) / 0.2);
    return { x: lerp(f.x, t.x, k), y: lerp(f.y, t.y, k), z: lerp(f.z, t.z, k) };
  }

  private lightOf(id: QubitId): 0 | 1 | null {
    const a = this.anim;
    if (a) {
      const pick = a.p >= 0.5 ? a.to : a.from;
      return pick.lights[id] ?? null;
    }
    return this.base?.lights[id] ?? null;
  }

  /** Current grid position + pose of a bot (rolling to a qubble for HIGHFIVE). */
  private botPose(id: QubitId): { pt: Pt; action: BotVisual['action']; facing: -1 | 1 } {
    const home = this.place(id);
    const a = this.anim;
    let action: BotVisual['action'] = 'idle', facing: -1 | 1 = 1;
    if (!a) return { pt: home, action: this.mood === 'happy' ? 'celebrate' : 'idle', facing };
    const ev = a.ev;
    if (ev.k === 'gate' && ev.op === 'HIGHFIVE') {
      const mover = isBot(ev.t) ? ev.t : ev.from && isBot(ev.from) ? ev.from : null;
      if (mover === id) {
        const other = mover === ev.t ? (ev.from as QubitId) : ev.t;
        const tp = this.place(other);
        const dx = home.gx - tp.gx, dy = home.gy - tp.gy, d = Math.hypot(dx, dy) || 1;
        const dest = { gx: tp.gx + (dx / d) * 0.62, gy: tp.gy + (dy / d) * 0.62 };
        const p = a.p;
        let k: number;
        if (p < 0.4) { k = smooth(p / 0.4); action = 'roll'; }
        else if (p < 0.62) { k = 1; action = 'highfive'; }
        else { k = 1 - smooth((p - 0.62) / 0.38); action = 'roll'; }
        const sx = this.iso(dest.gx, dest.gy).x - this.iso(home.gx, home.gy).x;
        facing = (p < 0.5 ? sx : -sx) >= 0 ? 1 : -1;
        if (action === 'highfive') facing = sx >= 0 ? 1 : -1;
        return { pt: { gx: lerp(home.gx, dest.gx, k), gy: lerp(home.gy, dest.gy, k) }, action, facing };
      }
    }
    if (ev.k === 'measure' && ev.t === id) action = 'listen';
    if (ev.k === 'gate' && ev.t === id && ev.op === 'RESET') action = 'reset';
    if (ev.k === 'gate' && ev.t === id && ev.op !== 'HIGHFIVE' && ev.op !== 'RESET') action = 'highfive';
    return { pt: home, action, facing };
  }

  /** Where the caretaker stands to work on a creature: just in front of it. */
  private standAt(id: QubitId): Pt { const p = this.place(id); return { gx: p.gx + 0.62, gy: p.gy + 0.18 }; }

  private jobFor(ev: TraceEvent): { dest: Pt; action: CaretakerVisual['action']; flashlight?: boolean } | null {
    if (ev.k === 'gate') {
      if (ev.op === 'HIGHFIVE') {
        if (ev.from && !isBot(ev.from) && !isBot(ev.t)) {
          const a = this.place(ev.from), b = this.place(ev.t);
          return { dest: { gx: (a.gx + b.gx) / 2 + 0.35, gy: (a.gy + b.gy) / 2 + 0.35 }, action: 'boop' };
        }
        return null; // the bot rolls over and slaps on its own
      }
      const action = ({ BOOP: 'boop', SHUSH: 'shush', SPIN: 'spin', RESET: 'press' } as const)[ev.op];
      return { dest: this.standAt(ev.t), action };
    }
    if (ev.k === 'measure') return isBot(ev.t) ? { dest: this.standAt(ev.t), action: 'listen' } : { dest: this.standAt(ev.t), action: 'peek', flashlight: true };
    return null;
  }

  /** 7BH-style choreography: tiptoe to the target (p 0→0.3), then perform (contact at p≈0.5). Rewind just snaps. */
  private caretakerPose(): { pt: Pt; v: CaretakerVisual } {
    const home = { gx: this.cols / 2, gy: this.rows - 0.45 };
    if (!this.ctAt) this.ctAt = home;
    const a = this.anim;
    if (a !== this.ctAnim) { this.ctAnim = a; this.ctFrom = this.ctAt; }
    const job = a ? this.jobFor(a.ev) : null;
    const facingTo = (from: Pt, to: Pt): -1 | 1 => ((to.gx - to.gy) - (from.gx - from.gy) >= 0 ? 1 : -1);
    if (!a || !job) {
      const action: CaretakerVisual['action'] = this.caretakerMood ?? (this.mood === 'happy' ? 'cheer' : a?.ev.k === 'noise' ? 'yawn' : 'idle');
      return { pt: this.ctAt, v: { action, phase: (this.lastT * 0.8) % 1, facing: -1 } };
    }
    if (a.dir === -1) { this.ctAt = job.dest; return { pt: job.dest, v: { action: 'idle', phase: 0, facing: -1 } }; }
    const from = this.ctFrom ?? this.ctAt, p = a.p;
    const far = Math.hypot(job.dest.gx - from.gx, job.dest.gy - from.gy) > 0.05;
    if (p < 0.3 && far) {
      const k = smooth(p / 0.3);
      return { pt: { gx: lerp(from.gx, job.dest.gx, k), gy: lerp(from.gy, job.dest.gy, k) }, v: { action: 'tiptoe', phase: (p / 0.3) % 1, facing: facingTo(from, job.dest) } };
    }
    this.ctAt = job.dest;
    return { pt: job.dest, v: { action: job.action, phase: clamp((p - 0.3) / 0.4), facing: -1, flashlight: job.flashlight } };
  }

  private drawCaretaker(x: number, y: number, v: CaretakerVisual, t: number): void {
    if (art.drawCaretaker) { art.drawCaretaker(this.ctx, x, y, this.s, v, t); return; }
    // fallback: a little pyjama kid with a nightcap + an action glyph
    const { ctx, s } = this, f = v.facing;
    const hop = v.action === 'tiptoe' ? Math.abs(Math.sin(v.phase * Math.PI * 2)) * 4 * s : v.action === 'cheer' ? Math.abs(Math.sin(t * 8)) * 8 * s : 0;
    ctx.save(); ctx.translate(x, y - hop);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, hop, 13 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.2 * s; ctx.strokeStyle = '#0e0e0e';
    ctx.fillStyle = '#9fb8ff'; ctx.beginPath(); ctx.roundRect(-10 * s, -34 * s, 20 * s, 32 * s, 9 * s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe2c6'; ctx.beginPath(); ctx.arc(0, -44 * s, 11 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fe443d'; ctx.beginPath(); ctx.moveTo(-11 * s, -48 * s); ctx.quadraticCurveTo(f * 4 * s, -70 * s, f * 16 * s, -60 * s); ctx.lineTo(11 * s, -49 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0e0e0e'; ctx.beginPath(); ctx.arc(f * 4 * s, -44 * s, 1.6 * s, 0, Math.PI * 2); ctx.arc(f * 9 * s, -44 * s, 1.6 * s, 0, Math.PI * 2); ctx.fill();
    const glyph = ({ boop: '👉', shush: '🤫', spin: '🌀', peek: '🔦', listen: '👂', press: '🔘', cheer: '🎉', facepalm: '🤦', yawn: '🥱' } as Record<string, string>)[v.action];
    if (glyph) { ctx.font = `${16 * s}px sans-serif`; ctx.textAlign = 'center'; ctx.globalAlpha = v.action === 'cheer' || v.action === 'facepalm' || v.action === 'yawn' ? 1 : hump(v.phase); ctx.fillText(glyph, f * 16 * s, -30 * s); }
    ctx.restore();
  }

  burstAt(kind: Parameters<NonNullable<typeof art.burst>>[0], id: QubitId): void {
    const p = this.screenPos.get(id);
    if (p && art.burst) art.burst(kind, p.x, p.y - 26 * this.s);
  }

  draw(t: number): void {
    const dt = Math.min(0.1, t - this.lastT || 0.016); this.lastT = t;
    const ease = 1 - Math.exp(-dt * 6);
    this.xray += (this.xrayTarget - this.xray) * ease;
    this.night += (this.nightTarget - this.night) * (1 - Math.exp(-dt * 2.5));
    this.dim += (this.dimTarget - this.dim) * ease;
    this.shake *= Math.exp(-dt * 8);
    const { ctx, s } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    if (this.shake > 0.3) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    if (art.drawRoom) art.drawRoom(ctx, this.cols, this.rows, this.iso, t, this.night);
    else {
      art.drawBackground(ctx, this.w, this.h, t, this.night);
      art.drawFloor(ctx, this.cols, this.rows, this.iso, t, this.night);
    }

    for (const sg of this.level.signs ?? []) {
      const p = this.iso(sg.x + 0.5, sg.y + 0.5);
      const sh = this.signShake.get(sg.text) ?? 0;
      if (sh > 0) this.signShake.set(sg.text, Math.max(0, sh - dt));
      art.drawSign(ctx, p.x, p.y, s, sg.text, t, sh);
    }

    // drawables, depth sorted
    type D = { depth: number; fn: () => void };
    const ds: D[] = [];
    const xr = this.xray;
    this.screenPos.clear();
    for (const q of this.level.qubbles) {
      const pt = { gx: q.x + 0.5, gy: q.y + 0.5 };
      const sp = this.iso(pt.gx, pt.gy);
      this.screenPos.set(q.id, sp);
      const bloch = this.blochOf(q.id);
      const peeked = this.peeked.has(q.id);
      let blanket = peeked ? 0 : lerp(1, 0.25, xr);
      if (this.anim?.ev.k === 'measure' && this.anim.ev.t === q.id) blanket = Math.min(blanket, this.anim.p > 0.5 ? 0 : 1 - smooth((this.anim.p - 0.35) / 0.15));
      let state: QubbleVisual['state'] = this.woke.has(q.id) ? 'awake-grumpy' : this.mood ?? 'sleep';
      const a = this.anim;
      if (a?.ev.k === 'noise' && a.ev.e.t === q.id && a.p > 0.45 && a.p < 0.9) state = 'scared';
      if (a?.ev.k === 'measure' && a.ev.t === q.id && a.p > 0.45) state = a.ev.woke ? 'awake-grumpy' : 'giggle';
      let squash = 1;
      if (a?.ev.k === 'gate' && (a.ev.t === q.id || a.ev.from === q.id)) squash = 1 + 0.12 * hump((a.p - 0.4) / 0.35);
      const hl = this.highlight.has(q.id) || this.hoverPick === q.id;
      // HIGHFIVE: a gooey arm pops out from under the blanket toward the partner
      let arm: QubbleVisual['arm'];
      if (a?.ev.k === 'gate' && a.ev.op === 'HIGHFIVE' && a.ev.from && (a.ev.t === q.id || a.ev.from === q.id)) {
        const other = a.ev.t === q.id ? a.ev.from : a.ev.t;
        const op = isBot(other) ? this.botPose(other).pt : this.place(other);
        const osp = this.iso(op.gx, op.gy);
        const reach = (isBot(other) ? 1 : 0.5) * (a.p < 0.5 ? smooth((a.p - 0.3) / 0.2) : a.p < 0.62 ? 1 : 1 - smooth((a.p - 0.62) / 0.18));
        if (reach > 0) arm = { dx: osp.x - sp.x, dy: osp.y - sp.y, t: reach };
      }
      ds.push({ depth: pt.gx + pt.gy, fn: () => {
        ctx.save();
        if (squash !== 1) { ctx.translate(sp.x, sp.y); ctx.scale(1 / squash, squash); ctx.translate(-sp.x, -sp.y); }
        art.drawQubble(ctx, sp.x, sp.y, s, { bloch, blanket, state, label: q.id, classical: this.level.classical, highlight: hl, arm }, t);
        ctx.restore();
      } });
    }
    for (const b of this.level.bots) {
      const pose = this.botPose(b.id);
      const sp = this.iso(pose.pt.gx, pose.pt.gy);
      this.screenPos.set(b.id, sp);
      const light = this.lightOf(b.id);
      const hl = this.highlight.has(b.id) || this.hoverPick === b.id;
      ds.push({ depth: pose.pt.gx + pose.pt.gy + 0.01, fn: () => {
        if (hl) {
          ctx.save(); ctx.setLineDash([6 * s, 5 * s]); ctx.lineDashOffset = -t * 20 * s;
          ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 26 * s, 12 * s, 0, 0, Math.PI * 2);
          ctx.lineWidth = 2.5 * s; ctx.strokeStyle = '#fe443d'; ctx.stroke(); ctx.restore();
        }
        art.drawBot(ctx, sp.x, sp.y, s, { light, action: pose.action, facing: pose.facing, label: b.id }, t);
      } });
    }
    // gremlin
    const a = this.anim;
    let gremlin: { x: number; y: number; kind: GremlinName; pose: 'sneak' | 'strike' | 'flee' | 'taunt' } | null = null;
    if (a?.ev.k === 'noise') {
      const tp = this.place(a.ev.e.t);
      const start = { gx: this.cols + 0.8, gy: tp.gy - 0.6 };
      const dest = { gx: tp.gx + 0.75, gy: tp.gy - 0.15 };
      const p = a.p;
      let pt: Pt, pose: 'sneak' | 'strike' | 'flee';
      if (p < 0.42) { const k = smooth(p / 0.42); pt = { gx: lerp(start.gx, dest.gx, k), gy: lerp(start.gy, dest.gy, k) }; pose = 'sneak'; }
      else if (p < 0.65) { pt = dest; pose = 'strike'; }
      else { const k = smooth((p - 0.65) / 0.35); pt = { gx: lerp(dest.gx, start.gx, k), gy: lerp(dest.gy, start.gy - 1, k) }; pose = 'flee'; }
      const sp = this.iso(pt.gx, pt.gy);
      gremlin = { x: sp.x, y: sp.y, kind: gremlinOf(a.ev.e), pose };
      const g = gremlin;
      if (xr > 0.02) ds.push({ depth: pt.gx + pt.gy, fn: () => {
        ctx.save(); ctx.globalAlpha = clamp(xr * 1.2); art.drawGremlin(ctx, g.x, g.y, s, g.kind, g.pose, t); ctx.restore();
      } });
    }
    {
      const ct = this.caretakerPose();
      const sp = this.iso(ct.pt.gx, ct.pt.gy);
      ds.push({ depth: ct.pt.gx + ct.pt.gy + 0.02, fn: () => this.drawCaretaker(sp.x, sp.y, ct.v, t) });
    }
    if (this.showSchrodi) {
      const sp = this.room ? this.iso(0.4, this.rows - 0.4) : this.iso(-0.35, this.rows - 0.6);
      ds.push({ depth: this.rows, fn: () => art.drawSchrodi(ctx, sp.x, sp.y, s * 0.95, this.schrodiMood, t) });
    }

    // x-ray silk threads under creatures
    const snapNow = a ? (a.p >= 0.5 ? a.to : a.from) : this.base;
    if (xr > 0.02 && snapNow) {
      ctx.save(); ctx.globalAlpha = clamp(xr);
      for (const l of snapNow.links) {
        const p1 = this.screenPos.get(l.a), p2 = this.screenPos.get(l.b);
        if (p1 && p2) art.drawLink(ctx, p1.x, p1.y - 24 * s, p2.x, p2.y - 24 * s, l.strength, t);
      }
      ctx.restore();
    }
    ds.sort((x, y) => x.depth - y.depth);
    for (const d of ds) d.fn();

    // HIGHFIVE between two qubbles: a little spark travelling along an arc
    if (a?.ev.k === 'gate' && a.ev.op === 'HIGHFIVE' && a.ev.from && !isBot(a.ev.from) && !isBot(a.ev.t)) {
      const p1 = this.screenPos.get(a.ev.from), p2 = this.screenPos.get(a.ev.t);
      if (p1 && p2) {
        const k = smooth(a.p / 0.6);
        const mx = (p1.x + p2.x) / 2, my = Math.min(p1.y, p2.y) - 70 * s;
        const u = 1 - k;
        const x = u * u * p1.x + 2 * u * k * mx + k * k * p2.x, y = u * u * (p1.y - 30 * s) + 2 * u * k * my + k * k * (p2.y - 30 * s);
        ctx.save(); ctx.strokeStyle = 'rgba(255,183,43,0.8)'; ctx.lineWidth = 3 * s; ctx.setLineDash([4 * s, 6 * s]);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y - 30 * s); ctx.quadraticCurveTo(mx, my, p2.x, p2.y - 30 * s); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = '#ffb72b'; ctx.beginPath(); ctx.arc(x, y, 7 * s, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0e0e0e'; ctx.lineWidth = 2 * s; ctx.stroke(); ctx.restore();
      }
    }

    art.drawParticles?.(ctx, t);

    // ── lights-out dimming overlay: gremlins are only silhouettes + sound ──
    const darkness = this.lightsOut ? 0.985 * (1 - this.revealColor) : this.dim * (1 - xr);
    if (darkness > 0.01) {
      ctx.fillStyle = `rgba(8,8,22,${darkness})`;
      ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
      if (gremlin && !this.lightsOut) this.drawSilhouette(gremlin, t, darkness);
      // bots' tiny lights glow through the dark
      for (const b of this.level.bots) {
        const p = this.screenPos.get(b.id); if (!p) continue;
        const L = this.lightOf(b.id);
        const col = L === 1 ? '254,68,61' : L === 0 ? '61,220,151' : '190,190,210';
        const r = (L === 1 ? 16 : 9) * s;
        const g = ctx.createRadialGradient(p.x, p.y - 52 * s, 0, p.x, p.y - 52 * s, r);
        g.addColorStop(0, `rgba(${col},${L === null ? 0.35 : 0.95})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y - 52 * s, r, 0, Math.PI * 2); ctx.fill();
      }
    }

    // x-ray tint + nerd numbers
    if (xr > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.10 * xr; ctx.fillStyle = '#6c63ff'; ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
      if (this.nerd) {
        ctx.save(); ctx.globalAlpha = xr; ctx.font = `700 ${Math.max(10, 12 * s)}px Quicksand, sans-serif`; ctx.textAlign = 'center';
        for (const q of this.level.qubbles) {
          const p = this.screenPos.get(q.id)!; const b = this.blochOf(q.id);
          const txt = `⟨Z⟩=${b.z.toFixed(2)}  r=${Math.hypot(b.x, b.y, b.z).toFixed(2)}`;
          const w = ctx.measureText(txt).width + 10;
          ctx.fillStyle = 'rgba(14,14,14,0.85)'; ctx.beginPath(); ctx.roundRect(p.x - w / 2, p.y + 16 * s, w, 18, 6); ctx.fill();
          ctx.fillStyle = '#f2f0eb'; ctx.fillText(txt, p.x, p.y + 16 * s + 13);
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  private drawSilhouette(g: { x: number; y: number; kind: GremlinName; pose: 'sneak' | 'strike' | 'flee' | 'taunt' }, t: number, dark: number): void {
    const c = this.silCanvas, S = 200 * this.s;
    const px = Math.ceil(S * this.dpr);
    if (c.width !== px) { c.width = px; c.height = px; }
    const g2 = c.getContext('2d')!;
    g2.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g2.clearRect(0, 0, S, S);
    g2.globalCompositeOperation = 'source-over';
    art.drawGremlin(g2, S / 2, S * 0.8, this.s, g.kind, g.pose, t);
    g2.globalCompositeOperation = 'source-in';
    g2.fillStyle = '#000';
    g2.fillRect(0, 0, S, S);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.9 * dark;
    ctx.shadowColor = 'rgba(160,150,255,0.55)'; ctx.shadowBlur = 10 * this.s;
    ctx.drawImage(c, g.x - S / 2, g.y - S * 0.8, S, S);
    ctx.restore();
    // two glinting eyes
    ctx.save(); ctx.fillStyle = `rgba(255,240,180,${0.8 * dark})`;
    const ey = g.y - 30 * this.s;
    ctx.beginPath(); ctx.arc(g.x - 5 * this.s, ey, 2.2 * this.s, 0, Math.PI * 2); ctx.arc(g.x + 5 * this.s, ey, 2.2 * this.s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

export { isQubble };
