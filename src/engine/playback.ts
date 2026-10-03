/**
 * Playback of a NightResult trace: play / pause / step / fast / rewind.
 * Gates rewind smoothly; measurements (LISTEN/PEEK) and RESET are a one-way door:
 * rewinding into one plays a 'snap' and stops (unitaries are reversible, measurement is not).
 */
import type { LevelDef, NightResult, Phase, TraceEvent, QubitId, Program } from '../core/contracts';
import { isBot, isQubble } from '../core/contracts';
import { audio } from './deps';
import type { Scene } from './scene';

export interface LineRef { phase: Phase; part: 'fixed' | 'mine'; pc: number }
export interface PlaybackHooks {
  onLine?(ref: LineRef | null): void;
  onEnd?(night: NightResult): void;
  onChange?(): void;
  onBlocked?(): void;
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
  private cur: { idx: number; dir: 1 | -1; p: number; fired: boolean } | null = null;
  readonly lineRefs: (LineRef | null)[];
  readonly peekedAt: Map<QubitId, number> = new Map();
  done = false;

  constructor(readonly scene: Scene, readonly level: LevelDef, readonly night: NightResult, readonly prog: { bedtime?: Program; morning?: Program }, readonly hooks: PlaybackHooks = {}) {
    this.lineRefs = this.mapLines();
    scene.peeked.clear(); scene.woke.clear(); scene.mood = null; scene.anim = null;
    scene.base = night.steps[0]?.snap ?? null;
    this.applyPhaseLighting(true);
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
    this.cur = { idx: this.i, dir: 1, p: 0, fired: false };
    this.scene.anim = { ev: st.ev, from: this.i > 0 ? this.night.steps[this.i - 1].snap : st.snap, to: st.snap, p: 0, dir: 1 };
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
    this.cur = { idx: this.i - 1, dir: -1, p: 1, fired: true };
    this.scene.anim = { ev: st.ev, from: this.i > 1 ? this.night.steps[this.i - 2].snap : st.snap, to: st.snap, p: 1, dir: -1 };
    return true;
  }

  private onStart(ev: TraceEvent, dir: 1 | -1): void {
    if (dir !== 1) return;
    if (ev.k === 'line') this.hooks.onLine?.(this.lineRefs[this.i]);
    if (ev.k === 'noise') audio.sfx('gremlin_sneak', { volume: 0.7 });
    if (ev.k === 'phase') this.applyPhaseLighting(false, ev.phase);
  }

  private impact(ev: TraceEvent): void {
    const sc = this.scene;
    switch (ev.k) {
      case 'gate': {
        const name = ({ BOOP: 'boop', SHUSH: 'shush', SPIN: 'spin', HIGHFIVE: 'highfive', RESET: 'reset' } as const)[ev.op];
        audio.sfx(name);
        sc.burstAt(ev.op === 'HIGHFIVE' ? 'highfive' : ev.op === 'RESET' ? 'reset' : ev.op === 'SHUSH' ? 'phase' : 'highfive', ev.t);
        break;
      }
      case 'measure': {
        if (isBot(ev.t)) {
          if (!(this.level.lightsOut || this.level.meta?.includes('lights-out'))) audio.sfx(ev.result ? 'listen_beep' : 'listen_quiet');
          audio.botNote(this.level.bots.findIndex((b) => b.id === ev.t), ev.result);
        } else {
          sc.peeked.add(ev.t);
          if (!this.peekedAt.has(ev.t)) this.peekedAt.set(ev.t, this.i);
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

  /** Skip straight to the end (used by X-ray replay "jump to end" and tests). */
  skipToEnd(): void {
    this.cur = null; this.scene.anim = null;
    for (; this.i < this.length; this.i++) {
      const ev = this.night.steps[this.i].ev;
      if (ev.k === 'measure' && isQubble(ev.t)) { this.scene.peeked.add(ev.t); if (ev.woke) this.scene.woke.add(ev.t); }
    }
    this.scene.base = this.night.steps[this.length - 1]?.snap ?? null;
    this.applyPhaseLighting(false);
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
    const d = DUR(ev);
    c.p += (c.dir * dt * sp) / d;
    if (c.dir === 1 && !c.fired && c.p >= (ev.k === 'gate' && ev.op === 'HIGHFIVE' ? 0.45 : 0.5)) { c.fired = true; this.impact(ev); }
    this.scene.anim!.p = Math.max(0, Math.min(1, c.p));
    if (c.dir === 1 && c.p >= 1) {
      this.cur = null; this.scene.anim = null; this.i = c.idx + 1;
      this.scene.base = this.night.steps[c.idx].snap;
      audio.setHarmony(this.scene.base.logicalFidelity ?? 1);
      if (this.stepMode && ev.k !== 'line' && ev.k !== 'phase') this.stepMode = false;
      if (this.i >= this.length) this.finish();
      else if (this.stepMode) this.startNext();
      this.hooks.onChange?.();
    } else if (c.dir === -1 && c.p <= 0) {
      this.cur = null; this.scene.anim = null; this.i = c.idx;
      this.done = false;
      this.scene.base = this.i > 0 ? this.night.steps[this.i - 1].snap : this.night.steps[0].snap;
      this.applyPhaseLighting(false);
      // keep the program cursor in sync while rewinding
      let ref: LineRef | null = null;
      for (let k = this.i - 1; k >= 0; k--) if (this.lineRefs[k]) { ref = this.lineRefs[k]; break; }
      this.hooks.onLine?.(ref);
      const evp = this.night.steps[c.idx].ev;
      if (!this.rewinding && (evp.k === 'line' || evp.k === 'phase') && this.i > 0) this.startPrev(); // a step back = one real op
      this.hooks.onChange?.();
    }
  }

  /** Fraction played, for the timeline. */
  progress(): number { return this.length ? (this.i + (this.cur ? (this.cur.dir === 1 ? this.cur.p : this.cur.p - 1) : 0)) / this.length : 0; }
}
