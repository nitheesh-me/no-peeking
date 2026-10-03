/**
 * Playback of a NightResult trace: play / pause / step / fast / rewind.
 * Gates rewind smoothly; measurements (LISTEN/PEEK) and RESET are a one-way door:
 * rewinding into one plays a 'snap' and stops (unitaries are reversible, measurement is not).
 */
import type { LevelDef, NightResult, Phase, TraceEvent, QubitId, Program, Op } from '../core/contracts';
import { isBot, isQubble } from '../core/contracts';
import { audio } from './deps';
import type { Scene, Pt, Actor } from './scene';

/** Walking speed of the caretaker / Schrödi, in tiles per second (at 1×). */
export const WALK_SPEED = 2.2;
const HOP_OUT = 0.45; // s: Schrödi climbing out of his box

export interface LineRef { phase: Phase; part: 'fixed' | 'mine'; pc: number }
export interface PlaybackHooks {
  onLine?(ref: LineRef | null): void;
  onEnd?(night: NightResult): void;
  onChange?(): void;
  onBlocked?(): void;
  /** fired at each event's impact (forward only) */
  onImpact?(ev: TraceEvent, op: Op | null): void;
}

const DUR = (ev: TraceEvent): number => {
  switch (ev.k) {
    case 'line': return 0.14;
    case 'phase': return ev.phase === 'night' ? 1.0 : 0.7;
    case 'gate': return ev.op === 'HIGHFIVE' ? 1.15 : 1.0;
    case 'measure': return 1.05;
    case 'noise': return 1.7;
    case 'jump': return ev.taken ? 0.4 : 0.22;
    case 'end': return 0.3;
  }
};
const oneWay = (ev: TraceEvent) => ev.k === 'measure' || (ev.k === 'gate' && ev.op === 'RESET');

export class Playback {
  i = 0;                     // number of steps fully applied
  playing = false;
  fast = false;
  rewinding = false;
  stepMode = false;          // stop after the next non-line event
  private cur: { idx: number; dir: 1 | -1; p: number; t: number; fired: boolean } | null = null;
  /** per-step timing: walk seconds (actor walking to the target) + action seconds */
  readonly walkT: number[] = [];
  readonly actT: number[] = [];
  /** cumulative start time of each step (seconds at 1×), length+1 entries */
  readonly T: number[] = [];
  /** per-step walk plan */
  readonly plan: ({ actor: Actor; from: Pt; to: Pt; hop: number } | null)[] = [];
  /** actor positions after k steps applied (k = 0..length) */
  private ctPos: Pt[] = [];
  private schPos: Pt[] = [];
  readonly lineRefs: (LineRef | null)[];
  /** for every step: which part of the program it belongs to (null = night / no line yet) */
  readonly partAt: ('fixed' | 'mine' | null)[];
  /** for every step: the most recent line ref at or before it */
  readonly refAt: (LineRef | null)[];
  readonly peekedAt: Map<QubitId, number> = new Map();
  done = false;

  constructor(readonly scene: Scene, readonly level: LevelDef, readonly night: NightResult, readonly prog: { bedtime?: Program; morning?: Program }, readonly hooks: PlaybackHooks = {}) {
    this.lineRefs = this.mapLines();
    this.refAt = []; this.partAt = [];
    let last: LineRef | null = null;
    this.night.steps.forEach((st, k) => {
      if (st.ev.k === 'phase') last = null;
      if (this.lineRefs[k]) last = this.lineRefs[k];
      this.refAt.push(last);
      this.partAt.push(last && last.phase !== 'night' ? last.part : null);
    });
    this.planWalks();
    scene.peeked.clear(); scene.woke.clear(); scene.mood = null; scene.anim = null;
    scene.base = night.steps[0]?.snap ?? null;
    this.placeActors(true);
    this.applyPhaseLighting(true);
  }

  /** Who walks where for each step; durations = distance-based walk + action. */
  private planWalks(): void {
    const sc = this.scene;
    const ctHome = sc.ctHome(), schHome = sc.schHome();
    let ct = sc.ctAt ?? ctHome, sch = schHome;
    this.ctPos = [ct]; this.schPos = [sch];
    let t = 0;
    const dist = (a: Pt, b: Pt) => Math.hypot(a.gx - b.gx, a.gy - b.gy);
    this.night.steps.forEach((st, k) => {
      const ev = st.ev;
      const job = sc.jobFor(ev);
      let walk = 0, act = DUR(ev), pl: (typeof this.plan)[number] = null;
      if (job) {
        const actor: Actor = this.partAt[k] === 'fixed' && sc.schrodiActs ? 'schrodi' : 'caretaker';
        const from = actor === 'schrodi' ? sch : ct;
        const hop = actor === 'schrodi' && dist(sch, schHome) < 0.01 ? HOP_OUT : 0;
        walk = dist(hop ? sc.schExit() : from, job.dest) / WALK_SPEED + hop;
        if (walk < 0.12) walk = 0;
        act = DUR(ev) * 0.75;
        pl = { actor, from, to: job.dest, hop };
        if (actor === 'schrodi') sch = job.dest; else ct = job.dest;
      }
      // Schrödi goes home (in his own time) once his checklist run is over
      if (sch !== schHome && (ev.k === 'gate' || ev.k === 'measure' || ev.k === 'phase') && this.nextPart(k) !== 'fixed') sch = schHome;
      this.plan.push(pl); this.walkT.push(walk); this.actT.push(act);
      this.T.push(t); t += walk + act;
      this.ctPos.push(ct); this.schPos.push(sch);
    });
    this.T.push(t);
  }
  /** Put the idle actors where they stand after i steps (snap = seek / rewind). */
  private placeActors(snap: boolean): void {
    this.scene.setActorRest(this.ctPos[this.i] ?? this.scene.ctHome(), this.schPos[this.i] ?? this.scene.schHome(), snap);
  }
  get totalTime(): number { return this.T[this.length] ?? 0; }
  /** Step index whose time span contains time t (seconds at 1×). */
  indexAtTime(t: number): number {
    let lo = 0, hi = this.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.T[m] <= t) lo = m; else hi = m - 1; }
    return lo;
  }

  get length(): number { return this.night.steps.length; }
  get busy(): boolean { return !!this.cur; }

  /** Work out whether each 'line' event belongs to the fixed or the player's part of its phase. */
  private mapLines(): (LineRef | null)[] {
    const out: (LineRef | null)[] = [];
    let phase: Phase = 'bedtime', part: 'fixed' | 'mine' = 'mine', prevPc = -1, lastTaken = false;
    const fixedLen = (ph: Phase) => (ph === 'bedtime' ? this.level.fixedBedtime : ph === 'morning' ? this.level.fixedMorning : undefined)?.length ?? 0;
    const edits = (ph: Phase) => ph !== 'night' && this.level.editable.includes(ph);
    for (const st of this.night.steps) {
      const ev = st.ev;
      if (ev.k === 'phase') { phase = ev.phase; part = fixedLen(phase) > 0 ? 'fixed' : 'mine'; prevPc = -1; lastTaken = false; out.push(null); continue; }
      if (ev.k === 'line') {
        if (ev.part) { part = ev.part; prevPc = ev.pc; lastTaken = false; out.push({ phase: ev.phase, part, pc: ev.pc }); continue; }
        if (part === 'fixed' && edits(ev.phase) && ev.pc === 0 && prevPc === fixedLen(ev.phase) - 1 && !lastTaken) part = 'mine';
        prevPc = ev.pc; lastTaken = false;
        out.push({ phase: ev.phase, part, pc: ev.pc });
        continue;
      }
      if (ev.k === 'jump') lastTaken = ev.taken;
      out.push(null);
    }
    return out;
  }

  play(): void { if (this.i >= this.length && !this.cur) return; this.playing = true; this.rewinding = false; this.stepMode = false; this.hooks.onChange?.(); }
  pause(): void { this.playing = false; this.rewinding = false; this.hooks.onChange?.(); }
  toggle(): void { this.playing ? this.pause() : this.play(); }
  setFast(f: boolean): void { this.fast = f; this.hooks.onChange?.(); }
  step(): void {
    if (this.cur) return;
    this.playing = false; this.rewinding = false; this.stepMode = true;
    this.startNext();
  }
  /** Step back once (or continuously when hold=true). */
  back(hold = false): void {
    if (this.cur) return;
    this.playing = false; this.rewinding = hold;
    this.startPrev();
    this.hooks.onChange?.();
  }

  private startNext(): boolean {
    if (this.i >= this.length) { this.finish(); return false; }
    const st = this.night.steps[this.i];
    this.cur = { idx: this.i, dir: 1, p: 0, t: 0, fired: false };
    const pl = this.plan[this.i];
    this.scene.anim = { ev: st.ev, from: this.i > 0 ? this.night.steps[this.i - 1].snap : st.snap, to: st.snap, p: 0, dir: 1, part: this.partAt[this.i] ?? undefined,
      walk: this.walkT[this.i] > 0 ? 0 : 1, actor: pl?.actor, wFrom: pl?.from, wTo: pl?.to, hop: pl && this.walkT[this.i] > 0 ? pl.hop / this.walkT[this.i] : 0 };
    this.onStart(st.ev, 1);
    return true;
  }

  private startPrev(): boolean {
    if (this.i <= 0) { this.rewinding = false; return false; }
    const st = this.night.steps[this.i - 1];
    if (oneWay(st.ev)) {
      // the one-way door
      audio.sfx('snap_measure');
      this.scene.shake = 8;
      this.rewinding = false;
      this.hooks.onBlocked?.();
      return false;
    }
    if (st.ev.k === 'line' || st.ev.k === 'jump' || st.ev.k === 'end') {
      // instant-ish
    } else audio.sfx('rewind', { volume: 0.5 });
    this.cur = { idx: this.i - 1, dir: -1, p: 1, t: 0, fired: true };
    const pl = this.plan[this.i - 1];
    this.scene.anim = { ev: st.ev, from: this.i > 1 ? this.night.steps[this.i - 2].snap : st.snap, to: st.snap, p: 1, dir: -1, part: this.partAt[this.i - 1] ?? undefined,
      walk: 1, actor: pl?.actor, wFrom: pl?.from, wTo: pl?.to, hop: 0 };
    return true;
  }

  private onStart(ev: TraceEvent, dir: 1 | -1): void {
    if (dir !== 1) return;
    if (ev.k === 'line') this.hooks.onLine?.(this.lineRefs[this.i]);
    if (ev.k === 'noise') audio.sfx('gremlin_sneak', { volume: 0.7 });
    if (ev.k === 'phase') this.applyPhaseLighting(false, ev.phase);
  }

  /** The op behind a step (from its line ref), if any. */
  opAt(k: number): Op | null {
    const r = this.refAt[k]; if (!r || r.phase === 'night') return null;
    const prog = r.part === 'fixed' ? (r.phase === 'bedtime' ? this.level.fixedBedtime : this.level.fixedMorning) : this.prog[r.phase];
    return prog?.[r.pc] ?? null;
  }
  phaseAt(k: number): Phase {
    for (let j = Math.min(k, this.length - 1); j >= 0; j--) { const e = this.night.steps[j].ev; if (e.k === 'phase') return e.phase; }
    return 'bedtime';
  }
  /** part of the next real (non-line) event after step k, to know if Schrödi should stay out of his box */
  private nextPart(k: number): 'fixed' | 'mine' | null {
    for (let j = k + 1; j < this.length; j++) {
      const e = this.night.steps[j].ev;
      if (e.k === 'phase') return null;
      if (e.k === 'gate' || e.k === 'measure') return this.partAt[j];
    }
    return null;
  }

  private impact(ev: TraceEvent): void {
    const sc = this.scene;
    const op = this.opAt(this.cur?.idx ?? this.i);
    this.hooks.onImpact?.(ev, op);
    const peekSafe = !!(this.level.classical || this.level.allowPeekData);
    switch (ev.k) {
      case 'jump': {
        const isIf = op?.op === 'IF';
        sc.say(isIf ? (ev.taken ? 'yes! jump ↪' : 'nope, next ↓') : 'jump ↪', 'actor', 'think');
        break;
      }
      case 'gate': {
        const name = ({ BOOP: 'boop', SHUSH: 'shush', SPIN: 'spin', HIGHFIVE: 'highfive', RESET: 'reset' } as const)[ev.op];
        audio.sfx(name);
        if (ev.op === 'RESET') sc.say('reset → quiet', ev.t, 'quiet');
        sc.burstAt(ev.op === 'HIGHFIVE' ? 'highfive' : ev.op === 'RESET' ? 'reset' : ev.op === 'SHUSH' ? 'phase' : 'highfive', ev.t);
        break;
      }
      case 'measure': {
        if (isBot(ev.t)) {
          if (!(this.level.lightsOut || this.level.meta?.includes('lights-out'))) audio.sfx(ev.result ? 'listen_beep' : 'listen_quiet');
          audio.botNote(this.level.bots.findIndex((b) => b.id === ev.t), ev.result);
          if (!sc.lightsOut) sc.say(ev.result ? 'BEEP!' : 'quiet', ev.t, ev.result ? 'beep' : 'quiet');
        } else {
          sc.peeked.add(ev.t);
          if (!this.peekedAt.has(ev.t)) this.peekedAt.set(ev.t, this.i);
          if (ev.woke || !peekSafe) sc.say(`woke ${ev.t}!`, ev.t, 'bad');
          else sc.say(`peeked: ${this.level.classical ? ev.result : ev.result ? '🌙' : '☀'}`, ev.t, 'good');
          if (ev.woke) {
            sc.woke.add(ev.t);
            audio.sfx('peek_collapse');
            sc.shake = 14;
            sc.burstAt('collapse', ev.t);
          } else audio.sfx('snap_measure');
        }
        break;
      }
      case 'noise': {
        const k = ev.e.kind;
        audio.sfx(k === 'phase' ? 'ghost_phase' : k === 'wobble' ? 'wobble' : 'gremlin_flip');
        if (sc.xray > 0.5) sc.burstAt(k === 'phase' ? 'phase' : k === 'wobble' ? 'wobble' : 'flip', ev.e.t);
        break;
      }
      case 'end': {
        if (ev.reason === 'END') sc.say('the end. zzz', 'actor', 'think');
        if (ev.reason === 'maxSteps') sc.say('…out of night!', 'actor', 'bad');
        if (this.level.lightsOut || this.level.meta?.includes('lights-out')) {
          const bits = this.level.bots.map((b) => (this.night.steps[this.i]?.snap.lights[b.id] ?? 0) as 0 | 1);
          audio.syndromeChord(bits);
        }
        break;
      }
    }
  }

  /** Lighting & tension from the most recent phase event before step i. */
  private applyPhaseLighting(instant: boolean, ph?: Phase): void {
    if (!ph) {
      ph = 'bedtime';
      for (let k = Math.min(this.i, this.length) - 1; k >= 0; k--) { const e = this.night.steps[k].ev; if (e.k === 'phase') { ph = e.phase; break; } }
    }
    const sc = this.scene;
    sc.nightTarget = ph === 'night' ? 1 : ph === 'bedtime' ? 0.45 : 0.1;
    sc.dimTarget = ph === 'night' ? 0.62 : 0;
    if (instant) { sc.night = sc.nightTarget; sc.dim = sc.dimTarget; }
    audio.setTension(ph === 'night' ? 0.7 : 0);
  }

  private finish(): void {
    this.playing = false; this.stepMode = false;
    if (!this.done) {
      this.done = true;
      audio.setTension(0);
      this.hooks.onLine?.(null);
      this.hooks.onEnd?.(this.night);
    }
    this.hooks.onChange?.();
  }

  /** First step index we may rewind to from i (can't cross a measurement / RESET). */
  minBack(): number {
    for (let k = this.i - 1; k >= 0; k--) if (oneWay(this.night.steps[k].ev)) return k + 1;
    return 0;
  }

  /** Jump to "target steps applied". Forward: applies instantly. Backward: refuses to cross a measurement
   *  (snap + onBlocked) and clamps to just after it. Returns the index actually reached. */
  seek(target: number): number {
    target = Math.max(0, Math.min(this.length, Math.round(target)));
    if (this.cur) { // settle the running animation first
      const c = this.cur; this.cur = null; this.scene.anim = null;
      if (c.dir === 1) { if (!c.fired) this.applySilent(c.idx); this.i = c.idx + 1; } else this.i = c.idx;
    }
    this.playing = false; this.rewinding = false; this.stepMode = false;
    if (target < this.i) {
      const lo = this.minBack();
      if (target < lo) {
        audio.sfx('snap_measure'); this.scene.shake = 8; this.hooks.onBlocked?.();
        target = lo;
      } else if (target < this.i) audio.sfx('rewind', { volume: 0.4 });
      this.i = target;
    } else {
      for (; this.i < target; this.i++) this.applySilent(this.i);
    }
    this.done = this.i >= this.length && this.done;
    this.scene.base = this.i > 0 ? this.night.steps[this.i - 1].snap : this.night.steps[0]?.snap ?? null;
    this.applyPhaseLighting(false);
    this.placeActors(true);
    let ref: LineRef | null = null;
    for (let k = this.i - 1; k >= 0; k--) if (this.lineRefs[k]) { ref = this.lineRefs[k]; break; }
    this.hooks.onLine?.(ref);
    if (this.i >= this.length) this.finish();
    audio.setHarmony(this.scene.base?.logicalFidelity ?? 1);
    this.hooks.onChange?.();
    return this.i;
  }
  /** Persistent effects of a step without animation/sound (peeked / woke). */
  private applySilent(k: number): void {
    const ev = this.night.steps[k].ev;
    if (ev.k === 'measure' && isQubble(ev.t)) { this.scene.peeked.add(ev.t); if (!this.peekedAt.has(ev.t)) this.peekedAt.set(ev.t, k); if (ev.woke) this.scene.woke.add(ev.t); }
  }

  /** Skip straight to the end (used by X-ray replay "jump to end" and tests). */
  skipToEnd(): void {
    this.cur = null; this.scene.anim = null;
    for (; this.i < this.length; this.i++) {
      const ev = this.night.steps[this.i].ev;
      if (ev.k === 'measure' && isQubble(ev.t)) { this.scene.peeked.add(ev.t); if (ev.woke) this.scene.woke.add(ev.t); }
    }
    this.scene.base = this.night.steps[this.length - 1]?.snap ?? null;
    this.applyPhaseLighting(false);
    this.placeActors(true);
    this.finish();
  }

  update(dt: number): void {
    const sp = (this.fast ? 4 : 1) * (this.rewinding ? 2.2 : 1);
    if (!this.cur) {
      if (this.playing) this.startNext();
      else if (this.rewinding) this.startPrev();
      if (!this.cur) return;
    }
    const c = this.cur!;
    const ev = this.night.steps[c.idx].ev;
    const walk = this.walkT[c.idx], act = this.actT[c.idx];
    const an = this.scene.anim!;
    if (c.dir === 1) {
      c.t += dt * sp;
      if (c.t < walk) { an.walk = c.t / walk; c.p = 0; }
      else { an.walk = 1; c.p = (c.t - walk) / act; }
    } else c.p -= (dt * sp) / act;
    if (c.dir === 1 && !c.fired && c.p >= (ev.k === 'gate' && ev.op === 'HIGHFIVE' ? 0.45 : 0.5)) { c.fired = true; this.impact(ev); }
    an.p = Math.max(0, Math.min(1, c.p));
    if (c.dir === 1 && c.p >= 1) {
      this.cur = null; this.scene.anim = null; this.i = c.idx + 1;
      this.scene.base = this.night.steps[c.idx].snap;
      this.placeActors(false);
      audio.setHarmony(this.scene.base.logicalFidelity ?? 1);
      if (this.stepMode && ev.k !== 'line' && ev.k !== 'phase') this.stepMode = false;
      if (this.i >= this.length) this.finish();
      else if (this.stepMode) this.startNext();
      this.hooks.onChange?.();
    } else if (c.dir === -1 && c.p <= 0) {
      this.cur = null; this.scene.anim = null; this.i = c.idx;
      this.done = false;
      this.scene.base = this.i > 0 ? this.night.steps[this.i - 1].snap : this.night.steps[0].snap;
      this.placeActors(true);
      this.applyPhaseLighting(false);
      // keep the program cursor in sync while rewinding
      let ref: LineRef | null = null;
      for (let k = this.i - 1; k >= 0; k--) if (this.lineRefs[k]) { ref = this.lineRefs[k]; break; }
      this.hooks.onLine?.(ref);
      const evp = this.night.steps[c.idx].ev;
      if (!this.rewinding && (evp.k === 'line' || evp.k === 'phase' || evp.k === 'jump') && this.i > 0) this.startPrev(); // a step back = one real op
      this.hooks.onChange?.();
    }
  }

  /** Current playback time in seconds (at 1×). */
  time(): number {
    const c = this.cur;
    if (!c) return this.T[this.i] ?? 0;
    if (c.dir === 1) return this.T[c.idx] + c.t;
    return this.T[c.idx] + this.walkT[c.idx] + Math.max(0, c.p) * this.actT[c.idx];
  }
  /** Fraction played, for the timeline. */
  progress(): number { return this.totalTime ? Math.min(1, this.time() / this.totalTime) : 0; }
}
