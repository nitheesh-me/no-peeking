/**
 * Isometric scene renderer. Draws the daycare for one level from a "view" that the Playback
 * controller updates every frame (snapshot blend, the current event animation, x-ray, night).
 */
import type { LevelDef, Snapshot, QubitId, TraceEvent, Bloch, IsoFn, QubbleVisual, BotVisual, DialogueLine, ErrorEvent, CaretakerVisual, SchrodiActorVisual } from '../core/contracts';
import { isBot, isQubble } from '../core/contracts';
import { art, artExtra } from './deps';
import { clamp, lerp, smooth, hump } from './util';

export interface Pt { gx: number; gy: number }
export type Actor = 'caretaker' | 'schrodi';

export interface StepAnim {
  ev: TraceEvent;
  from: Snapshot;
  to: Snapshot;
  p: number;        // 0..1 progress of the ACTION (contact ≈ 0.5); stays 0 while the actor walks
  dir: 1 | -1;      // -1 when rewinding
  part?: 'fixed' | 'mine';
  /** 0..1 progress of the actor's walk to the target (1 = arrived / no walk) */
  walk: number;
  actor?: Actor;
  wFrom?: Pt;
  wTo?: Pt;
  /** fraction of the walk spent hopping out of the box (Schrödi) */
  hop: number;
}

type GremlinName = 'flipper' | 'phasey' | 'wobbles';
const gremlinOf = (e: ErrorEvent): GremlinName => (e.kind === 'phase' ? 'phasey' : e.kind === 'wobble' ? 'wobbles' : 'flipper');
const WALK = 2.2; // tiles/s (keep in sync with playback.WALK_SPEED)

export type CaptionKind = 'good' | 'bad' | 'beep' | 'quiet' | 'think' | 'speech' | 'info';
export type CaptionAt = QubitId | 'actor' | 'caretaker' | 'schrodi' | 'gremlin' | { x: number; y: number };
interface Caption { text: string; kind: CaptionKind; at: CaptionAt; t0: number; life: number }

export type HitKind = 'qubble' | 'bot' | 'caretaker' | 'schrodi' | 'gremlin' | 'window' | 'clock' | 'door' | 'sign' | 'bed';
export interface Hit { kind: HitKind; id?: QubitId; label: string }

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
  /** hint highlights (separate from pick-mode highlight) */
  hintHL = new Set<QubitId>();
  hoverPick: QubitId | null = null;
  hover: Hit | null = null;
  schrodiMood: DialogueLine['mood'] = 'deadpan';
  shake = 0;
  signShake = new Map<string, number>();
  showSchrodi = true;
  /** playback speed multiplier (fast ×4) for time-based walking */
  speed = 1;
  /** caretaker (player avatar) state */
  caretakerMood: 'cheer' | 'facepalm' | null = null;
  ctAt: Pt | null = null;              // where the caretaker rests (between events)
  private ctVis: Pt | null = null;     // where it is drawn
  private ctFacing: -1 | 1 = -1;
  private schRest: Pt | null = null;
  private schVis: Pt | null = null;
  private schFacing: -1 | 1 = 1;
  private schIn = true;
  private schHopIn = 1;
  private lastActor: Actor = 'caretaker';
  private captions: Caption[] = [];
  private pokes = new Map<string, number>(); // key → until (scene time)
  private ctPokeAction: CaretakerVisual['action'] = 'yawn';
  private gremlinPos: { x: number; y: number } | null = null;
  private ctScreen: { x: number; y: number } | null = null;
  private schScreen: { x: number; y: number } | null = null;
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

  // ───── wall objects (mirrors src/art/room.ts layout; u along the wall from the back corner, v up) ─────
  private wallPt(side: 'left' | 'right', u: number, v: number) {
    const m = 0.42;
    return side === 'right' ? this.iso(-m + u, -m, v) : this.iso(-m, -m + u, v);
  }
  private wallQuad(side: 'left' | 'right', u0: number, u1: number, v0: number, v1: number) {
    return [this.wallPt(side, u0, v0), this.wallPt(side, u1, v0), this.wallPt(side, u1, v1), this.wallPt(side, u0, v1)];
  }
  private objects(): { kind: 'window' | 'clock' | 'door'; quad: { x: number; y: number }[]; label: string }[] {
    if (!this.room) return [];
    const m = 0.42, Lr = this.cols + 2 * m, Ll = this.rows + 2 * m;
    return [
      { kind: 'window', quad: this.wallQuad('right', Lr - 2.9, Lr - 0.5, 0.85, 2.15), label: 'the window' },
      { kind: 'clock', quad: this.wallQuad('right', 0.4, 1.05, 1.4, 2.05), label: 'the clock' },
      { kind: 'door', quad: this.wallQuad('left', Ll - 1.63, Ll - 0.52, 0, 1.95), label: 'the door' },
    ];
  }
  objectCentre(kind: 'window' | 'clock' | 'door'): { x: number; y: number } | null {
    const o = this.objects().find((q) => q.kind === kind); if (!o) return null;
    return { x: o.quad.reduce((a, p) => a + p.x, 0) / 4, y: o.quad.reduce((a, p) => a + p.y, 0) / 4 };
  }

  /** Anything clickable under the pointer: creatures, the caretaker, Schrödi, a gremlin (x-ray), wall objects. */
  hitAny(px: number, py: number): Hit | null {
    const R = 30 * this.s;
    const near = (p: { x: number; y: number } | null, lift: number, r = R) => !!p && Math.hypot(px - p.x, py - (p.y - lift * this.s)) < r;
    if (this.gremlinPos && this.xray > 0.5 && near(this.gremlinPos, 24)) return { kind: 'gremlin', label: 'a gremlin!' };
    if (!this.level.classical) for (const q of this.level.qubbles) { // the foot of a bed (below the sleeper)
      const p = this.screenPos.get(q.id);
      if (p && Math.abs(px - p.x) < 30 * this.s && py > p.y - 3 * this.s && py < p.y + 13 * this.s) return { kind: 'bed', id: q.id, label: `${q.id}'s bed` };
    }
    const id = this.hitTest(px, py);
    if (id) return { kind: isBot(id) ? 'bot' : 'qubble', id, label: isBot(id) ? `bot ${id}` : id };
    if (near(this.ctScreen, 32, 26 * this.s)) return { kind: 'caretaker', label: 'you (the caretaker)' };
    if (this.showSchrodi && near(this.schScreen, 22, 30 * this.s)) return { kind: 'schrodi', label: 'Schrödi' };
    for (const o of this.objects()) if (inPoly(px, py, o.quad)) return { kind: o.kind, label: o.label };
    if (art.drawWallSign && this.room) for (const sl of this.signSlots()) { // signs: parallelogram in the wall plane
      const c = this.iso(sl.gx, sl.gy, sl.gz), dx = px - c.x, dy = py - c.y;
      const a = (sl.wall === 'right' ? dx : -dx) / (this.TW / 2), b = (a * this.TH / 2 - dy) / this.TH;
      if (Math.abs(a) < 1.1 && Math.abs(b) < 0.5) return { kind: 'sign', label: `sign: ${sl.text}` };
    }
    return null;
  }

  /** Short interaction timers (pokes). */
  poke(key: string, secs: number): void { this.pokes.set(key, this.lastT + secs); }
  poked(key: string): boolean { return (this.pokes.get(key) ?? 0) > this.lastT; }
  pokeCaretaker(action: CaretakerVisual['action']): void { this.ctPokeAction = action; this.poke('ct', 1.6); }

  /** Floating caption in the scene (peek results, think bubbles, quips). */
  say(text: string, at: CaptionAt, kind: CaptionKind = 'info', life = 1.6): void {
    if (typeof at === 'string') this.captions = this.captions.filter((c) => c.at !== at);
    this.captions.push({ text, kind, at, t0: this.lastT, life });
    if (this.captions.length > 8) this.captions.shift();
  }
  clearCaptions(): void { this.captions = []; }

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
    if (!a || a.p <= 0) {
      const waving = this.poked('bot:' + id);
      return { pt: home, action: this.mood === 'happy' ? 'celebrate' : waving ? 'wave' : 'idle', facing };
    }
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

  /** Where an actor stands to work on a creature: just in front of it. */
  private standAt(id: QubitId): Pt { return this.freeSpot(this.place(id), [[1.0, 0.05], [0.05, 1.0], [0.85, 0.85], [-0.3, 1.0], [1.0, -0.35]]); }
  /** first offset around `c` that doesn't stand on another creature (keeps actors from overlapping beds/bots) */
  private freeSpot(c: Pt, offs: [number, number][]): Pt {
    const all = [...this.level.qubbles, ...this.level.bots].map((q) => ({ gx: q.x + 0.5, gy: q.y + 0.5 }));
    let best: Pt | null = null, bestD = -1;
    for (const [dx, dy] of offs) {
      const p = this.clampPt({ gx: c.gx + dx, gy: c.gy + dy });
      const d = Math.min(...all.map((q) => Math.hypot(q.gx - p.gx, q.gy - p.gy)));
      if (d >= 0.85) return p;
      if (d > bestD) { bestD = d; best = p; }
    }
    return best ?? this.clampPt(c);
  }
  /** keep walkers off the walls */
  private clampPt(p: Pt): Pt { return { gx: clamp(p.gx, 0.3, this.cols + 0.2), gy: clamp(p.gy, 0.3, this.rows + 0.2) }; }

  /** The job an event needs an actor for (null = no walk, e.g. a bot rolls over on its own). */
  jobFor(ev: TraceEvent): { dest: Pt; target: Pt; action: CaretakerVisual['action']; flashlight?: boolean } | null {
    if (ev.k === 'gate') {
      if (ev.op === 'HIGHFIVE') {
        if (ev.from && !isBot(ev.from) && !isBot(ev.t)) {
          const a = this.place(ev.from), b = this.place(ev.t);
          const mid = { gx: (a.gx + b.gx) / 2, gy: (a.gy + b.gy) / 2 };
          return { dest: this.freeSpot(mid, [[0.45, 0.45], [0.6, 0.6], [0.85, 0.25], [0.25, 0.85], [0.85, 0.85], [-0.3, 0.8]]), target: mid, action: 'boop' };
        }
        return null; // the bot rolls over and slaps on its own
      }
      // a classical box gets flipped over with both hands (SPIN pose) instead of a nose-boop
      const action = this.level.classical && ev.op === 'BOOP' && !isBot(ev.t) ? 'spin' : ({ BOOP: 'boop', SHUSH: 'shush', SPIN: 'spin', RESET: 'press' } as const)[ev.op];
      return { dest: this.standAt(ev.t), target: this.place(ev.t), action };
    }
    if (ev.k === 'measure') return isBot(ev.t) ? { dest: this.standAt(ev.t), target: this.place(ev.t), action: 'listen' } : { dest: this.standAt(ev.t), target: this.place(ev.t), action: 'peek', flashlight: !this.level.classical }; // boxes are opened by hand, no torch
    return null;
  }
  /** player-chosen homes (drag & drop; cosmetic only, saved per level) */
  homes: { ct?: Pt; box?: Pt } = {};
  /** the thing being carried by the pointer (screen px) and the floor tile it would land on */
  carry: { kind: 'caretaker' | 'box'; x: number; y: number } | null = null;
  dropTile: Pt | null = null;
  private landT = -9;
  /** screen px → grid coords (on the floor) */
  toGrid(x: number, y: number): Pt { const dx = (x - this.ox) / (this.TW / 2), dy = (y - this.oy) / (this.TH / 2); return { gx: (dx + dy) / 2, gy: (dy - dx) / 2 }; }
  /** nearest free floor tile (centre) to a grid point; beds, bots, the box/caretaker and walls are not free */
  freeTile(p: Pt, kind: 'caretaker' | 'box'): Pt {
    const occ = new Set<string>([...this.level.qubbles, ...this.level.bots].map((q) => `${q.x},${q.y}`));
    const other = kind === 'caretaker' ? this.schHome() : this.ctAt ?? this.ctHome();
    if (kind === 'caretaker' && this.showSchrodi) occ.add(`${Math.floor(other.gx)},${Math.floor(other.gy)}`);
    if (kind === 'box') occ.add(`${Math.floor(other.gx)},${Math.floor(other.gy)}`);
    const tx0 = clamp(Math.floor(p.gx), 0, this.cols - 1), ty0 = clamp(Math.floor(p.gy), 0, this.rows - 1);
    let best: Pt | null = null, bd = 1e9;
    for (let tx = 0; tx < this.cols; tx++) for (let ty = 0; ty < this.rows; ty++) {
      if (occ.has(`${tx},${ty}`)) continue;
      const d = Math.hypot(tx - tx0, ty - ty0) + (tx === tx0 && ty === ty0 ? -1 : 0);
      if (d < bd) { bd = d; best = { gx: tx + 0.5, gy: ty + 0.5 }; }
    }
    return best ?? { gx: tx0 + 0.5, gy: ty0 + 0.5 };
  }
  /** the floor point under the carried thing (its shadow) */
  carryFloor(): number { const c = this.carry!; return c.y + (c.kind === 'caretaker' ? 76 : 46) * this.s; }
  /** drop the carried thing: it becomes the new home (cosmetic) */
  dropCarry(): Pt | null {
    const c = this.carry; if (!c) return null;
    const tile = this.freeTile(this.toGrid(c.x, this.carryFloor()), c.kind);
    this.carry = null; this.dropTile = null; this.landT = this.lastT;
    if (c.kind === 'caretaker') { this.homes.ct = tile; this.ctAt = tile; this.ctVis = tile; }
    else { this.homes.box = tile; this.schRest = tile; this.schVis = tile; this.schIn = true; }
    return tile;
  }
  ctHome(): Pt { if (this.homes.ct) return this.homes.ct; return this.freeSpot({ gx: this.cols / 2, gy: this.rows - 0.45 }, [[0, 0], [1, 0], [-1, 0.2], [1.6, -0.2], [-1.6, 0.3], [2.2, 0], [0.5, 0.4]]); }
  schHome(): Pt { if (this.homes.box) return this.homes.box; return this.room ? { gx: 0.4, gy: this.rows - 0.4 } : { gx: -0.35, gy: this.rows - 0.6 }; }
  /** where Schrödi lands after hopping out of the box (the actor art offsets him ~40px to the right) */
  schExit(): Pt { const h = this.schHome(); return { gx: h.gx + 0.38, gy: h.gy - 0.38 }; }
  get schrodiActs(): boolean { return this.showSchrodi && typeof art.drawSchrodiActor === 'function'; }
  /** Where the actors rest after the applied steps. snap = teleport (seek / rewind / new run). */
  setActorRest(ct: Pt, sch: Pt, snap: boolean): void {
    this.ctAt = ct; this.schRest = sch;
    if (snap || !this.ctVis) this.ctVis = ct;
    if (snap || !this.schVis) {
      this.schVis = sch;
      const home = this.schHome();
      this.schIn = Math.hypot(sch.gx - home.gx, sch.gy - home.gy) < 0.02; this.schHopIn = 1;
    }
  }
  private sdir(from: Pt, to: Pt): number { return (to.gx - to.gy) - (from.gx - from.gy); }
  private moveToward(p: Pt, q: Pt, dt: number): Pt {
    const d = Math.hypot(q.gx - p.gx, q.gy - p.gy), step = WALK * this.speed * dt;
    if (d <= step) return q;
    return { gx: p.gx + (q.gx - p.gx) * step / d, gy: p.gy + (q.gy - p.gy) * step / d };
  }

  /** 7BH-style choreography: walk to the target at a steady pace (anim.walk), then perform (contact at p≈0.5). */
  private caretakerPose(dt: number): { pt: Pt; v: CaretakerVisual } {
    const home = this.ctHome();
    if (!this.ctAt) this.ctAt = home;
    if (!this.ctVis) this.ctVis = this.ctAt;
    const a = this.anim, t = this.lastT;
    const job = a && a.actor === 'caretaker' && a.wTo ? this.jobFor(a.ev) : null;
    if (a && job && a.wTo) {
      this.lastActor = 'caretaker';
      const to = a.wTo, from = a.wFrom ?? to;
      if (a.dir === -1) { this.ctVis = to; return { pt: to, v: { action: 'idle', phase: 0, facing: this.ctFacing } }; }
      if (a.walk < 1) {
        const pt = { gx: lerp(from.gx, to.gx, a.walk), gy: lerp(from.gy, to.gy, a.walk) };
        const d = this.sdir(from, to); if (Math.abs(d) > 0.01) this.ctFacing = d >= 0 ? 1 : -1;
        this.ctVis = pt;
        return { pt, v: { action: 'tiptoe', phase: (t * 1.7) % 1, facing: this.ctFacing } };
      }
      this.ctVis = to;
      const d = this.sdir(to, job.target); if (Math.abs(d) > 0.01) this.ctFacing = d >= 0 ? 1 : -1;
      return { pt: to, v: { action: job.action, phase: a.p, facing: this.ctFacing, flashlight: job.flashlight } };
    }
    // resting: walk (time-based) to the rest spot if needed
    const rest = this.ctAt;
    if (Math.hypot(rest.gx - this.ctVis.gx, rest.gy - this.ctVis.gy) > 0.02) {
      const d = this.sdir(this.ctVis, rest); if (Math.abs(d) > 0.01) this.ctFacing = d >= 0 ? 1 : -1;
      this.ctVis = this.moveToward(this.ctVis, rest, dt);
      return { pt: this.ctVis, v: { action: 'tiptoe', phase: (t * 1.7) % 1, facing: this.ctFacing } };
    }
    // watching Schrödi work? face him
    if (a?.actor === 'schrodi' && this.schVis) { const d = this.sdir(this.ctVis, this.schVis); if (Math.abs(d) > 0.05) this.ctFacing = d >= 0 ? 1 : -1; }
    let action: CaretakerVisual['action'] = this.caretakerMood ?? (this.mood === 'happy' ? 'cheer' : a?.ev.k === 'noise' ? 'yawn' : 'idle');
    let phase = (t * 0.8) % 1;
    if (!this.caretakerMood && this.poked('ct')) { action = this.ctPokeAction; phase = clamp(1 - ((this.pokes.get('ct') ?? 0) - t) / 1.6); }
    return { pt: this.ctVis, v: { action, phase, facing: this.ctFacing } };
  }

  /** Schrödi out of his box doing his checklist (fixed cards). out=false → draw him in the box as usual. */
  private schrodiPose(dt: number): { pt: Pt; v: SchrodiActorVisual; out: boolean; hop?: boolean } {
    const home = this.schHome();
    if (!this.schRest) this.schRest = home;
    if (!this.schVis) this.schVis = this.schRest;
    const a = this.anim, t = this.lastT, mood = this.schrodiMood;
    const MAP: Record<string, SchrodiActorVisual['action']> = { boop: 'boop', shush: 'shush', spin: 'spin', peek: 'point', listen: 'listen', press: 'press' };
    const job = a && a.actor === 'schrodi' && a.wTo ? this.jobFor(a.ev) : null;
    if (a && job && a.wTo) {
      this.lastActor = 'schrodi'; this.schIn = false; this.schHopIn = 0;
      const to = a.wTo, from = a.wFrom ?? to;
      if (a.dir === -1) { this.schVis = to; return { pt: to, v: { action: 'sit', phase: 0, facing: this.schFacing, mood }, out: true }; }
      if (a.walk < 1) {
        if (a.hop > 0 && a.walk < a.hop) { this.schVis = from; this.schFacing = 1; return { pt: from, v: { action: 'hop-out', phase: a.walk / a.hop, facing: 1, mood }, out: true, hop: true }; }
        const k = a.hop > 0 ? (a.walk - a.hop) / (1 - a.hop) : a.walk;
        const f0 = a.hop > 0 ? this.schExit() : from;
        const pt = { gx: lerp(f0.gx, to.gx, k), gy: lerp(f0.gy, to.gy, k) };
        const d = this.sdir(f0, to); if (Math.abs(d) > 0.01) this.schFacing = d >= 0 ? 1 : -1;
        this.schVis = pt;
        return { pt, v: { action: 'walk', phase: (t * 1.9) % 1, facing: this.schFacing, mood }, out: true };
      }
      this.schVis = to;
      const d = this.sdir(to, job.target); if (Math.abs(d) > 0.01) this.schFacing = d >= 0 ? 1 : -1;
      return { pt: to, v: { action: MAP[job.action] ?? 'point', phase: a.p, facing: this.schFacing, mood }, out: true };
    }
    if (this.schIn) return { pt: home, v: { action: 'sit', phase: 0, facing: 1, mood }, out: false };
    const goingHome = Math.hypot(this.schRest.gx - home.gx, this.schRest.gy - home.gy) < 0.02;
    const rest = goingHome ? this.schExit() : this.schRest;
    if (Math.hypot(rest.gx - this.schVis.gx, rest.gy - this.schVis.gy) > 0.02 && !(goingHome && this.schHopIn > 0)) {
      const d = this.sdir(this.schVis, rest); if (Math.abs(d) > 0.01) this.schFacing = d >= 0 ? 1 : -1;
      this.schVis = this.moveToward(this.schVis, rest, dt);
      return { pt: this.schVis, v: { action: 'walk', phase: (t * 1.9) % 1, facing: this.schFacing, mood }, out: true };
    }
    if (goingHome) {
      this.schHopIn += dt * this.speed / 0.45;
      if (this.schHopIn >= 1) { this.schIn = true; this.schVis = home; return { pt: home, v: { action: 'sit', phase: 0, facing: 1, mood }, out: false }; }
      return { pt: home, v: { action: 'hop-in', phase: this.schHopIn, facing: 1, mood }, out: true, hop: true };
    }
    return { pt: this.schVis, v: { action: 'sit', phase: (t * 0.5) % 1, facing: this.schFacing, mood }, out: true };
  }

  /** a plain empty cardboard box while Schrödi is out */
  private drawEmptyBox(x: number, y: number): void {
    if (artExtra.drawCatBox) { artExtra.drawCatBox(this.ctx, x, y, this.s * 0.95); return; }
    const { ctx } = this, s = this.s * 0.95;
    ctx.save(); ctx.translate(x, y);
    ctx.lineWidth = 2.5 * s; ctx.strokeStyle = '#0e0e0e'; ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.ellipse(0, 2 * s, 34 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b07f3f'; ctx.beginPath(); ctx.moveTo(-30 * s, -22 * s); ctx.lineTo(0, -32 * s); ctx.lineTo(30 * s, -22 * s); ctx.lineTo(0, -12 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9a865'; ctx.beginPath(); ctx.moveTo(-30 * s, -22 * s); ctx.lineTo(0, -12 * s); ctx.lineTo(0, 6 * s); ctx.lineTo(-30 * s, -4 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ebc48b'; ctx.beginPath(); ctx.moveTo(30 * s, -22 * s); ctx.lineTo(0, -12 * s); ctx.lineTo(0, 6 * s); ctx.lineTo(30 * s, -4 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9a865'; ctx.beginPath(); ctx.moveTo(-30 * s, -22 * s); ctx.lineTo(-40 * s, -34 * s); ctx.lineTo(-10 * s, -44 * s); ctx.lineTo(0, -32 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  private drawSchrodiFallbackActor(x: number, y: number, v: SchrodiActorVisual, t: number): void {
    if (art.drawSchrodiActor) { art.drawSchrodiActor(this.ctx, x, y, this.s * 0.95, v, t); return; }
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

    // level signs live FLAT on the back walls, in the free spans the room art leaves for them.
    // No wall-sign art → no signs (never hang them over the floor / objects).
    if (art.drawWallSign && this.room) {
      for (const sl of this.signSlots()) {
        const sh = this.signShake.get(sl.text) ?? 0;
        if (sh > 0) this.signShake.set(sl.text, Math.max(0, sh - dt));
        const p = this.iso(sl.gx, sl.gy, sl.gz);
        art.drawWallSign(ctx, p.x, p.y, s, sl.text, sl.wall, t, sh);
      }
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
      if (this.poked('lid:' + q.id)) { const left = (this.pokes.get('lid:' + q.id) ?? 0) - this.lastT; blanket = Math.min(blanket, 1 - smooth(Math.min(1.3 - left, left) / 0.2)); } // click-peek (safe levels only)
      if (this.anim?.ev.k === 'measure' && this.anim.ev.t === q.id) blanket = Math.min(blanket, this.anim.p > 0.5 ? 0 : 1 - smooth((this.anim.p - 0.35) / 0.15));
      let state: QubbleVisual['state'] = this.woke.has(q.id) ? 'awake-grumpy' : this.mood ?? 'sleep';
      const mumbling = state === 'sleep' && this.poked('q:' + q.id);
      if (mumbling) state = 'mumble';
      const a = this.anim;
      if (a?.ev.k === 'noise' && a.ev.e.t === q.id && a.p > 0.45 && a.p < 0.9) state = 'scared';
      if (a?.ev.k === 'measure' && a.ev.t === q.id && a.p > 0.45) state = a.ev.woke ? 'awake-grumpy' : 'giggle';
      let squash = 1;
      let tumble: number | undefined;
      if (this.level.classical && a?.ev.k === 'gate' && a.ev.op === 'BOOP' && a.ev.t === q.id) tumble = clamp((a.p - 0.25) / 0.5);
      else if (a?.ev.k === 'gate' && (a.ev.t === q.id || a.ev.from === q.id)) squash = 1 + 0.12 * hump((a.p - 0.4) / 0.35);
      const hl = this.highlight.has(q.id) || this.hintHL.has(q.id) || this.hoverPick === q.id;
      let depth = pt.gx + pt.gy;
      // HIGHFIVE: a gooey arm pops out from under the blanket toward the partner
      let arm: QubbleVisual['arm'];
      if (a?.ev.k === 'gate' && a.ev.op === 'HIGHFIVE' && a.ev.from && (a.ev.t === q.id || a.ev.from === q.id)) {
        const other = a.ev.t === q.id ? a.ev.from : a.ev.t;
        const op = isBot(other) ? this.botPose(other).pt : this.place(other);
        const osp = this.iso(op.gx, op.gy);
        const reach = (isBot(other) ? 1 : 0.5) * (a.p < 0.5 ? smooth((a.p - 0.3) / 0.2) : a.p < 0.62 ? 1 : 1 - smooth((a.p - 0.62) / 0.18));
        if (reach > 0) { arm = { dx: osp.x - sp.x, dy: osp.y - sp.y, t: reach }; depth = Math.max(depth, op.gx + op.gy + 0.015); } // arm over the partner
      }
      const roll = mumbling ? Math.sin(t * 9) * 0.07 * clamp(((this.pokes.get('q:' + q.id) ?? 0) - t) / 0.4) : 0;
      ds.push({ depth, fn: () => {
        ctx.save();
        if (squash !== 1) { ctx.translate(sp.x, sp.y); ctx.scale(1 / squash, squash); ctx.translate(-sp.x, -sp.y); }
        if (roll) { ctx.translate(sp.x, sp.y); ctx.rotate(roll); ctx.translate(-sp.x, -sp.y); }
        art.drawQubble(ctx, sp.x, sp.y, s, { bloch, blanket, state, label: q.id, classical: this.level.classical, highlight: hl, arm, tumble }, t);
        ctx.restore();
      } });
    }
    for (const b of this.level.bots) {
      const pose = this.botPose(b.id);
      const sp = this.iso(pose.pt.gx, pose.pt.gy);
      this.screenPos.set(b.id, sp);
      const light = this.lightOf(b.id);
      const hl = this.highlight.has(b.id) || this.hintHL.has(b.id) || this.hoverPick === b.id;
      const hop = pose.action === 'wave' ? Math.abs(Math.sin(t * 10)) * 4 * s : 0;
      ds.push({ depth: pose.pt.gx + pose.pt.gy + 0.01, fn: () => {
        if (hl) {
          ctx.save(); ctx.setLineDash([6 * s, 5 * s]); ctx.lineDashOffset = -t * 20 * s;
          ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 26 * s, 12 * s, 0, 0, Math.PI * 2);
          ctx.lineWidth = 2.5 * s; ctx.strokeStyle = '#fe443d'; ctx.stroke(); ctx.restore();
        }
        art.drawBot(ctx, sp.x, sp.y - hop, s, { light, action: pose.action, facing: pose.facing, label: b.id }, t);
      } });
    }
    // gremlin
    const a = this.anim;
    let gremlin: { x: number; y: number; kind: GremlinName; pose: 'sneak' | 'strike' | 'flee' | 'taunt' } | null = null;
    this.gremlinPos = null;
    if (a?.ev.k === 'noise') {
      const tp = this.place(a.ev.e.t);
      const start = { gx: this.cols + 0.8, gy: tp.gy - 0.6 };
      const dest = { gx: tp.gx + 0.75, gy: tp.gy - 0.15 };
      const p = a.p;
      let pt: Pt, pose: 'sneak' | 'strike' | 'flee';
      if (p < 0.42) { const k = smooth(p / 0.42); pt = { gx: lerp(start.gx, dest.gx, k), gy: lerp(start.gy, dest.gy, k) }; pose = 'sneak'; }
      else if (p < 0.65) { pt = dest; pose = 'strike'; }
      else { const k = smooth((p - 0.65) / 0.35); pt = { gx: lerp(dest.gx, start.gx, k), gy: lerp(dest.gy, start.gy - 1, k) }; pose = 'flee'; }
      pt = { gx: pt.gx, gy: Math.max(0.3, pt.gy) }; // never into the back wall
      const sp = this.iso(pt.gx, pt.gy);
      const taunt = this.poked('gremlin') && pose !== 'strike';
      gremlin = { x: sp.x, y: sp.y, kind: gremlinOf(a.ev.e), pose: taunt ? 'taunt' : pose };
      this.gremlinPos = sp;
      const g = gremlin;
      if (xr > 0.02) ds.push({ depth: pt.gx + pt.gy, fn: () => {
        ctx.save(); ctx.globalAlpha = clamp(xr * 1.2); art.drawGremlin(ctx, g.x, g.y, s, g.kind, g.pose, t); ctx.restore();
      } });
      if (xr > 0.02 && a.ev.e.kind === 'both') { // flip + phase: Phasey tags along behind Flipper
        const p2 = this.iso(pt.gx + 0.35, Math.max(0.3, pt.gy - 0.35));
        ds.push({ depth: pt.gx + pt.gy - 0.01, fn: () => {
          ctx.save(); ctx.globalAlpha = clamp(xr * 1.1); art.drawGremlin(ctx, p2.x, p2.y, s * 0.9, 'phasey', g.pose, t); ctx.restore();
        } });
      }
    }
    {
      const ct = this.caretakerPose(dt);
      const land = this.lastT - this.landT < 0.45 ? Math.abs(Math.sin((this.lastT - this.landT) / 0.45 * Math.PI * 2)) * 10 * s * (1 - (this.lastT - this.landT) / 0.45) : 0;
      const sp0 = this.iso(ct.pt.gx, ct.pt.gy), sp = { x: sp0.x, y: sp0.y - land };
      this.ctScreen = sp0;
      if (this.carry?.kind !== 'caretaker') ds.push({ depth: ct.pt.gx + ct.pt.gy + 0.02, fn: () => this.drawCaretaker(sp.x, sp.y, ct.v, t) });
    }
    if (this.showSchrodi) {
      const home = this.schHome();
      const hp = this.iso(home.gx, home.gy);
      const sc = this.schrodiActs ? this.schrodiPose(dt) : null;
      if (sc?.out) {
        const sp = this.iso(sc.pt.gx, sc.pt.gy);
        this.schScreen = sp;
        if (!sc.hop) ds.push({ depth: home.gx + home.gy - 0.01, fn: () => this.drawEmptyBox(hp.x, hp.y) }); // the hop art draws its own box
        ds.push({ depth: sc.pt.gx + sc.pt.gy + (sc.v.action === 'hop-out' || sc.v.action === 'hop-in' ? 0.02 : 0.005), fn: () => this.drawSchrodiFallbackActor(sp.x, sp.y, sc.v, t) });
      } else {
        this.schScreen = hp;
        const mood = this.poked('sch') ? 'smug' : this.schrodiMood;
        if (this.carry?.kind !== 'box') ds.push({ depth: home.gx + home.gy, fn: () => art.drawSchrodi(ctx, hp.x, hp.y, s * 0.95, mood, t) });
      }
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
    // drag & drop: highlight the landing tile (under everything standing on the floor)
    if (this.carry) {
      const tile = this.freeTile(this.toGrid(this.carry.x, this.carryFloor()), this.carry.kind);
      this.dropTile = tile;
      const c = [this.iso(tile.gx - 0.5, tile.gy - 0.5), this.iso(tile.gx + 0.5, tile.gy - 0.5), this.iso(tile.gx + 0.5, tile.gy + 0.5), this.iso(tile.gx - 0.5, tile.gy + 0.5)];
      ctx.save(); ctx.beginPath(); c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
      ctx.fillStyle = 'rgba(61,220,151,0.35)'; ctx.fill(); ctx.setLineDash([6 * s, 4 * s]); ctx.lineDashOffset = -t * 20; ctx.lineWidth = 2.5 * s; ctx.strokeStyle = '#0e0e0e'; ctx.stroke(); ctx.restore();
    }
    ds.sort((x, y) => x.depth - y.depth);
    for (const d of ds) d.fn();

    // HIGHFIVE between two qubbles: a little spark travelling along an arc
    if (a?.ev.k === 'gate' && a.ev.op === 'HIGHFIVE' && a.ev.from && !isBot(a.ev.from) && !isBot(a.ev.t) && a.walk >= 1 && a.p > 0) {
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
    if (this.carry) this.drawCarried(t);

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

    this.drawCaptions(t);

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

  /** the carried caretaker (dangling + wiggling) or Schrödi's box, with a shadow on the floor below */
  private drawCarried(t: number): void {
    const c = this.carry!, { ctx, s } = this;
    const feet = c.y + (c.kind === 'caretaker' ? 50 : 22) * s, floor = this.carryFloor();
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(c.x, floor, 16 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save();
    ctx.translate(c.x, c.y); ctx.rotate(Math.sin(t * 9) * 0.16); ctx.translate(-c.x, -c.y); // dangle from the pointer
    if (c.kind === 'caretaker') this.drawCaretaker(c.x, feet, { action: 'cheer', phase: (t * 2) % 1, facing: this.ctFacing }, t);
    else art.drawSchrodi(ctx, c.x, feet, s * 0.95, 'shock', t);
    ctx.restore();
  }

  signSlots(): { text: string; wall: 'left' | 'right'; gx: number; gy: number; gz: number }[] {
    const signs = this.level.signs ?? [];
    const slots = artExtra.wallSignSlots?.(this.cols, this.rows) ?? [];
    const free = [...slots];
    const out: { text: string; wall: 'left' | 'right'; gx: number; gy: number; gz: number }[] = [];
    for (const sg of signs) {
      if (!free.length) break;
      const want: 'left' | 'right' = sg.x === 0 && sg.y !== 0 ? 'left' : 'right';
      let k = free.findIndex((f) => f.wall === want);
      if (k < 0) k = 0;
      const sl = free.splice(k, 1)[0];
      out.push({ text: sg.text, wall: sl.wall, gx: sl.gx, gy: sl.gy, gz: sl.gz });
    }
    return out;
  }

  private captionPos(at: CaptionAt): { x: number; y: number } | null {
    if (typeof at === 'object') return at;
    const s = this.s;
    if (at === 'actor') at = this.lastActor;
    if (at === 'caretaker') return this.ctScreen ? { x: this.ctScreen.x, y: this.ctScreen.y - 78 * s } : null;
    if (at === 'schrodi') return this.schScreen ? { x: this.schScreen.x, y: this.schScreen.y - 62 * s } : null;
    if (at === 'gremlin') return this.gremlinPos ? { x: this.gremlinPos.x, y: this.gremlinPos.y - 64 * s } : null;
    const p = this.screenPos.get(at);
    return p ? { x: p.x, y: p.y - (isBot(at) ? 80 : 66) * s } : null;
  }

  private drawCaptions(t: number): void {
    const { ctx } = this;
    this.captions = this.captions.filter((c) => t - c.t0 < c.life);
    const sz = Math.max(12, Math.min(17, 15 * this.s));
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const c of this.captions) {
      const p = this.captionPos(c.at); if (!p) continue;
      const age = (t - c.t0) / c.life;
      const a = age < 0.12 ? age / 0.12 : age > 0.8 ? (1 - age) / 0.2 : 1;
      const pop = age < 0.12 ? 0.8 + 0.2 * (age / 0.12) : 1;
      const y = Math.max(sz + 8, p.y - age * 14);
      ctx.save();
      ctx.globalAlpha = clamp(a);
      ctx.font = `700 ${sz}px Quicksand, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(c.text).width + 18, hh = sz + 12;
      const x = clamp(p.x, w / 2 + 6, this.w - w / 2 - 6); // keep bubbles on screen
      let yy = y; // stack instead of overlapping
      for (let guard = 0; guard < 6; guard++) {
        const hitR = placed.find((r) => x - w / 2 < r.x1 && x + w / 2 > r.x0 && yy - hh / 2 < r.y1 && yy + hh / 2 > r.y0);
        if (!hitR) break;
        yy = hitR.y0 - hh / 2 - 4;
      }
      placed.push({ x0: x - w / 2, x1: x + w / 2, y0: yy - hh / 2, y1: yy + hh / 2 });
      ctx.translate(x, yy); ctx.scale(pop, pop);
      const tail = clamp(p.x - x, -w / 2 + 12, w / 2 - 12);
      const fill = { good: '#d9f8ea', bad: '#fe443d', beep: '#fe443d', quiet: '#3ddc97', think: '#ffffff', speech: '#ffffff', info: '#f2f0eb' }[c.kind];
      const ink = c.kind === 'bad' || c.kind === 'beep' ? '#ffffff' : '#0e0e0e';
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#0e0e0e'; ctx.fillStyle = fill;
      ctx.beginPath(); ctx.roundRect(-w / 2, -hh / 2, w, hh, hh / 2); ctx.fill(); ctx.stroke();
      if (c.kind === 'think') { // thought bubbles trailing down
        for (const [dx, dy, r] of [[tail - 4, hh / 2 + 6, 4], [tail - 10, hh / 2 + 14, 2.5]]) { ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      } else if (c.kind === 'speech') {
        ctx.beginPath(); ctx.moveTo(tail - 6, hh / 2 - 1); ctx.lineTo(tail, hh / 2 + 9); ctx.lineTo(tail + 6, hh / 2 - 1); ctx.fill(); ctx.stroke();
        ctx.fillRect(tail - 5, hh / 2 - 3, 10, 3);
      }
      ctx.fillStyle = ink; ctx.fillText(c.text, 0, 1);
      ctx.restore();
    }
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

function inPoly(x: number, y: number, q: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    if ((q[i].y > y) !== (q[j].y > y) && x < ((q[j].x - q[i].x) * (y - q[i].y)) / (q[j].y - q[i].y) + q[i].x) inside = !inside;
  }
  return inside;
}

export { isQubble };
