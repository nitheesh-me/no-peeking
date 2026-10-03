/**
 * Adaptive lo-fi lullaby: lookahead sequencer, scenes, physics-driven harmony and tension.
 *
 * Key F major, 84 BPM, swung 8ths (swing 0.62). 8-bar progression:
 *   | Fmaj9 | Bbmaj9 | Gm9 | C9sus C9 | Fmaj9 | Bbmaj9 | Am7 | Gm7  C9 |   (sunny I–IV–ii–V, AC daytime)
 * The theme ("No Peeking" motif) is an 8-bar music-box melody over that loop.
 */
import type { MusicScene } from '../core/contracts';
import { Kit, clamp, rand, mtof } from './core';
import * as I from './instruments';

export const BPM = 84;
export const BEAT = 60 / BPM;
export const SWING = 0.62; // fraction of the beat taken by the on-beat 8th
const STEPS = 8; // 8th-note steps per bar

// ───────────────────────── Harmony data ─────────────────────────
interface Chord {
  at: number; // step offset within the bar
  len: number; // steps
  bass: number; // midi of bass root
  third: number; // semitones (5 = sus)
  fifth: number;
  voicing: number[]; // EP voicing (midi)
}
const C = (at: number, len: number, bass: number, third: number, voicing: number[], fifth = 7): Chord => ({ at, len, bass, third, fifth, voicing });

export const PROGRESSION: Chord[][] = [
  [C(0, 8, 41, 4, [57, 60, 64, 67])], // Fmaj9   A3 C4 E4 G4
  [C(0, 8, 46, 4, [57, 60, 62, 65])], // Bbmaj9  A3 C4 D4 F4 (bright IV)
  [C(0, 8, 43, 3, [53, 57, 58, 62])], // Gm9     F3 A3 Bb3 D4
  [C(0, 4, 36, 5, [58, 62, 65, 67]), C(4, 4, 36, 4, [58, 62, 64, 67])], // C9sus4 → C9 (resolves sweetly)
  [C(0, 8, 41, 4, [57, 60, 64, 67])], // Fmaj9
  [C(0, 8, 46, 4, [57, 60, 62, 65])], // Bbmaj9  A3 C4 D4 F4
  [C(0, 8, 45, 3, [55, 60, 64, 69])], // Am7     G3 C4 E4 A4
  [C(0, 4, 43, 3, [53, 57, 58, 62]), C(4, 4, 36, 4, [58, 62, 64, 67])], // Gm7 | C9
];

/** The theme. [step, midi, lengthInSteps] per bar. Music-box register (C5–D6). */
export const THEME: [number, number, number][][] = [
  [[0, 72, 2], [2, 77, 1], [3, 79, 1], [4, 81, 3]], //          C  F G A~
  [[0, 84, 1], [1, 81, 1], [2, 77, 2], [4, 76, 2], [6, 74, 2]], // C' A F  E  D
  [[0, 74, 2], [2, 77, 1], [3, 79, 1], [4, 82, 3]], //          D  F G Bb~
  [[0, 81, 1], [1, 79, 1], [2, 77, 2], [4, 79, 4]], //          A G F  G~~
  [[0, 72, 2], [2, 77, 1], [3, 79, 1], [4, 81, 2], [6, 84, 2]], // C F G A C'
  [[0, 86, 3], [3, 84, 1], [4, 81, 2], [6, 77, 2]], //          D'~ C' A F
  [[0, 79, 2], [2, 81, 1], [3, 79, 1], [4, 76, 4]], //          G A G E~~
  [[0, 77, 1], [1, 76, 1], [2, 74, 2], [4, 79, 2], [6, 72, 2]], // F E D  G  C
];

// Win sting (2 bars): ii–V cadence then a big Fmaj9 with the theme tag landing on F.
const STING_CHORDS: Chord[][] = [
  [C(0, 4, 43, 3, [53, 57, 58, 62]), C(4, 4, 36, 4, [58, 62, 64, 67])],
  [C(0, 8, 41, 4, [57, 60, 64, 67])],
];
const STING_LEAD: [number, number, number][][] = [
  [[0, 81, 1], [1, 79, 1], [2, 77, 1], [3, 76, 1], [4, 79, 2], [6, 72, 2]],
  [[0, 77, 8], [2, 84, 1], [3, 88, 1], [4, 89, 4]],
];

// ───────────────────────── Scenes ─────────────────────────
export type Layer = 'pad' | 'ep' | 'bass' | 'drums' | 'lead' | 'crackle' | 'clock' | 'arp';
export const LAYERS: Layer[] = ['pad', 'ep', 'bass', 'drums', 'lead', 'crackle', 'clock', 'arp'];

interface SceneCfg {
  gain: Record<Layer, number>;
  bass: 'none' | 'pedal' | 'roots' | 'walk';
  drums: 'none' | 'hats' | 'soft' | 'full';
  lead: 'none' | 'theme' | 'half' | 'sparse' | 'credits';
  ep: 'none' | 'hold' | 'comp';
  verb: number; // music reverb send
  lpMax: number; // brightest harmony lowpass for this scene
}
const G = (pad: number, ep: number, bass: number, drums: number, lead: number, crackle: number, clock: number, arp: number): Record<Layer, number> => ({ pad, ep, bass, drums, lead, crackle, clock, arp });

export const SCENES: Record<MusicScene, SceneCfg> = {
  title: { gain: G(1, 0.45, 0, 0, 1, 0.8, 0, 0), bass: 'none', drums: 'none', lead: 'theme', ep: 'hold', verb: 0.32, lpMax: 7500 },
  map: { gain: G(0.55, 1, 1, 1, 0.9, 1, 0, 0), bass: 'roots', drums: 'full', lead: 'half', ep: 'comp', verb: 0.22, lpMax: 8000 },
  build: { gain: G(0.5, 0.85, 0.9, 0.7, 0.75, 1, 0, 0), bass: 'roots', drums: 'soft', lead: 'sparse', ep: 'comp', verb: 0.22, lpMax: 7500 },
  run: { gain: G(0.4, 0.8, 1, 0.85, 0, 0.8, 1, 0), bass: 'walk', drums: 'full', lead: 'none', ep: 'comp', verb: 0.25, lpMax: 7000 },
  win: { gain: G(0.7, 1, 1, 0.9, 1.1, 1, 0, 0), bass: 'roots', drums: 'soft', lead: 'theme', ep: 'comp', verb: 0.4, lpMax: 8000 },
  lightsout: { gain: G(0.75, 0.45, 0.45, 0, 0, 0.25, 0, 0), bass: 'pedal', drums: 'none', lead: 'none', ep: 'hold', verb: 0.6, lpMax: 2600 },
  lab: { gain: G(0.35, 0, 0.5, 0.5, 0, 0.7, 0, 1), bass: 'pedal', drums: 'hats', lead: 'none', ep: 'none', verb: 0.3, lpMax: 7500 },
  credits: { gain: G(0.6, 1, 1, 1, 1.15, 1, 0, 0), bass: 'roots', drums: 'full', lead: 'credits', ep: 'comp', verb: 0.4, lpMax: 8000 },
};

/** Music graph handed to the sequencer by the engine. */
export interface MusicBus {
  /** note inputs per layer */
  layer: Record<Layer, AudioNode>;
  /** scene-controlled layer level (cross-faded on scene change) */
  gains: Record<Layer, GainNode>;
  tension: GainNode; // tension layer level (setTension)
  droneGain: GainNode; // low drone (inside tension)
  harmonyLP: BiquadFilterNode;
  wobbleDepth: GainNode; // cents of pitch wobble
  verbSend: GainNode; // music → reverb
}

export class Sequencer {
  scene: MusicScene = 'title';
  private pending: MusicScene | null = null;
  private prevCfg: SceneCfg | null = null;
  private switchBar = -1;
  private bar = 0; // absolute bar count
  private prog = 0; // progression bar 0..7
  private step = 0;
  private nextT = 0;
  private sting = -1; // ≥0 while the win sting plays
  private winPending = false;
  harmony = 1; // EFFECTIVE value (1 outside run/lightsout)
  tension = 0; // EFFECTIVE value (0 outside run/lightsout)
  private rawHarmony = 1;
  private rawTension = 0;
  /** Physics-driven dissonance & gremlin tension only colour the night scenes; daytime is always cosy. */
  private get night(): boolean {
    return this.scene === 'run' || this.scene === 'lightsout';
  }
  running = false;

  constructor(private k: Kit, private bus: MusicBus) {}

  // ───────── public control ─────────
  start(at: number): void {
    this.running = true;
    this.nextT = at;
    this.step = 0;
    this.applySceneGains(SCENES[this.scene], at, 1.2, true);
  }

  setScene(s: MusicScene): void {
    if (!this.running) {
      if (s !== 'win') this.scene = s;
      return;
    }
    if (s === 'win') {
      this.winPending = true;
      return;
    }
    if (s === this.scene && this.pending === null) return;
    this.pending = s;
  }

  setHarmony(f: number, now: number): void {
    this.rawHarmony = clamp(f, 0, 1);
    // dead zone: tiny fidelity loss (numerics, 0.97) stays fully consonant
    this.harmony = this.night ? clamp((this.rawHarmony - 0.05) / 0.9, 0, 1) : 1;
    const dis = 1 - this.harmony;
    const cfg = SCENES[this.scene];
    // lowpass closes as fidelity drops: lpMax → ~650 Hz (exponential)
    const cut = 1300 * Math.pow(cfg.lpMax / 1300, this.harmony);
    this.bus.harmonyLP.frequency.setTargetAtTime(cut, now, 0.25);
    this.bus.harmonyLP.Q.setTargetAtTime(0.7 + dis * 1.5, now, 0.25);
    // pitch wobble in cents (seasick but cute)
    this.bus.wobbleDepth.gain.setTargetAtTime(16 * Math.pow(dis, 1.5), now, 0.25);
  }

  setTension(v: number, now: number): void {
    this.rawTension = clamp(v, 0, 1);
    this.tension = this.night ? this.rawTension : 0;
    this.bus.tension.gain.setTargetAtTime(this.tension, now, 0.4);
    this.bus.droneGain.gain.setTargetAtTime(this.tension * 0.035, now, 0.8);
  }

  /** Schedule every step that starts before `until` (seconds, ctx time). */
  scheduleUntil(until: number, now: number): void {
    if (!this.running) return;
    if (this.nextT < now - 0.05) {
      // fell behind (tab throttled): resync to the next bar instead of machine-gunning notes
      this.nextT = now + 0.05;
      this.step = 0;
    }
    while (this.nextT < until) {
      this.doStep(this.nextT);
      const len = this.step % 2 === 0 ? BEAT * SWING : BEAT * (1 - SWING);
      this.nextT += len;
      this.step++;
      if (this.step >= STEPS) {
        this.step = 0;
        this.bar++;
        if (this.sting >= 0) {
          this.sting++;
          if (this.sting >= STING_CHORDS.length) {
            this.sting = -1;
            this.prog = 1; // Fmaj9 (sting) → Bbmaj9
            this.pending = this.pending ?? 'build';
          }
        } else {
          this.prog = (this.prog + 1) % PROGRESSION.length;
        }
      }
    }
  }

  // ───────── internals ─────────
  private applySceneGains(cfg: SceneCfg, t: number, tc: number, instant = false): void {
    for (const l of LAYERS) {
      const p = this.bus.gains[l].gain;
      p.cancelScheduledValues(t);
      if (instant) p.setValueAtTime(0, t);
      p.setTargetAtTime(cfg.gain[l], t, tc);
    }
    this.bus.verbSend.gain.setTargetAtTime(cfg.verb, t, tc);
    this.setHarmony(this.rawHarmony, t);
    this.setTension(this.rawTension, t);
  }

  private beginBar(t: number): void {
    if (this.pending && this.pending !== this.scene) {
      this.prevCfg = SCENES[this.scene];
      this.scene = this.pending;
      this.switchBar = this.bar;
      if (this.scene === 'credits' || this.scene === 'title') this.prog = 0;
      this.applySceneGains(SCENES[this.scene], t, 0.7);
    }
    this.pending = null;
  }

  /** Mode for a layer this bar: outgoing layers keep playing their old pattern for one bar while fading. */
  private cfgFor(l: Layer): SceneCfg {
    const cur = SCENES[this.scene];
    if (this.bar === this.switchBar && this.prevCfg && cur.gain[l] === 0) return this.prevCfg;
    return cur;
  }

  private doStep(t0: number): void {
    // win: jump onto the beat grid immediately (≤ 1 beat latency), sting runs 2 bars
    if (this.winPending && this.step % 2 === 0) {
      this.winPending = false;
      this.step = 0;
      this.sting = 0;
      this.prevCfg = SCENES[this.scene];
      this.scene = 'win';
      this.switchBar = this.bar;
      this.applySceneGains(SCENES.win, t0, 0.25);
      I.swell(this.k, this.bus.layer.drums, t0 + BEAT * 6, BEAT * 6, 1);
    }
    if (this.step === 0 && this.sting < 0) this.beginBar(t0);

    const step = this.step;
    const hum = () => rand(-0.004, 0.004);
    const t = Math.max(t0 + hum(), t0);
    const chords = this.sting >= 0 ? STING_CHORDS[this.sting] : PROGRESSION[this.prog];
    const chord = chords.find((c) => step >= c.at && step < c.at + c.len)!;
    const segStart = step === chord.at;
    const stepDur = BEAT / 2;
    const L = this.bus.layer;
    const dis = 1 - this.harmony;

    // ── pad
    if (segStart && this.cfgFor('pad').gain.pad > 0) {
      const dur = chord.len * stepDur;
      for (const m of [chord.bass + 12, chord.voicing[0] + 12, chord.voicing[2] + 12]) {
        I.pad(this.k, L.pad, t, m, dur, 1, rand(-1, 1) * dis * 12);
      }
    }

    // ── electric piano
    const epMode = this.cfgFor('ep').ep;
    if (epMode !== 'none') {
      let hit: { vel: number; len: number } | null = null;
      if (segStart) hit = { vel: 0.9, len: epMode === 'hold' ? chord.len : chord.len === 8 ? 3 : chord.len };
      else if (epMode === 'comp' && chord.len === 8 && step === chord.at + 3) hit = { vel: 0.6, len: 5 };
      if (hit) this.epChord(chord, t, hit.len * stepDur, hit.vel, dis, epMode === 'hold');
    }

    // ── bass
    const bm = this.cfgFor('bass').bass;
    if (bm !== 'none') this.bassStep(bm, chord, step, t, stepDur);

    // ── drums
    const dm = this.cfgFor('drums').drums;
    if (dm !== 'none') this.drumStep(dm, step, t);

    // ── lead (music box theme)
    const lm = this.sting >= 0 ? 'theme' : this.cfgFor('lead').lead;
    if (lm !== 'none') this.leadStep(lm, step, t, stepDur);

    // ── lab arp
    if (this.cfgFor('arp').gain.arp > 0 && Math.random() > 0.22) {
      const pool = [...chord.voicing.map((m) => m + 12), chord.bass + 30 /* #11-ish colour */, chord.voicing[3] + 24];
      const idx = (step * 3 + (this.bar % 3)) % pool.length;
      const leap = Math.random() < 0.15 ? 12 : 0;
      I.pluck(this.k, L.arp, t, pool[idx] + leap, rand(0.6, 1), step % 2 ? 0.45 : -0.45);
    }

    // ── run clock (on the beat: straight, not swung)
    if (this.cfgFor('clock').gain.clock > 0 && step % 2 === 0) I.clock(this.k, L.clock, t0, (step / 2) % 2 === 0, step === 0 ? 1 : 0.8);

    // ── tension layer: heartbeat + sneaky pizzicato (only when gremlins are around)
    if (this.tension > 0.02) {
      const T = this.bus.tension;
      if (this.tension > 0.35 && step === 0) I.heartbeat(this.k, T, t0, 0.35 + 0.3 * this.tension);
      if (this.tension > 0.15) {
        const crawl = [60, 62, 63, 64, 65, 64, 63, 62]; // tiptoe C4–F4 (cartoon sneak, not horror)
        const pat = [1, 3, 6]; // offbeat tiptoes
        if (pat.includes(step) || (this.tension > 0.6 && step === 5)) {
          const m = crawl[(this.bar * 3 + step) % crawl.length] - (step === 6 ? 12 : 0);
          I.pizz(this.k, T, t, m, rand(0.7, 1), step % 2 ? 0.5 : -0.5);
        }
      }
    }
  }

  private epChord(chord: Chord, t: number, dur: number, vel: number, dis: number, soft: boolean): void {
    const L = this.bus.layer.ep;
    const v = vel * (soft ? 0.75 : 1);
    chord.voicing.forEach((m, i) => {
      // tiny strum + per-voice sour detune as fidelity drops
      const det = rand(-1, 1) * dis * 10;
      I.ep(this.k, L, t + i * 0.012, m, dur, v * rand(0.88, 1.05), (i - 1.5) * 0.25, det);
    });
    // lush shimmer at high fidelity
    if (this.harmony > 0.85) I.ep(this.k, L, t + 0.05, chord.voicing[3] + 12, dur, v * 0.35 * (this.harmony - 0.85) / 0.15, 0.4);
    // dissonance creeps in as fidelity drops: b9 first, then the tritone
    if (dis > 0.35) I.ep(this.k, L, t + 0.03, chord.bass + 25, dur, v * Math.min(1, (dis - 0.35) / 0.5) * 0.4, -0.3, rand(-8, 8) * dis);
    if (dis > 0.65) I.ep(this.k, L, t + 0.045, chord.bass + 18, dur, v * Math.min(1, (dis - 0.65) / 0.35) * 0.35, 0.3, rand(-10, 10) * dis);
  }

  private bassStep(mode: SceneCfg['bass'], chord: Chord, step: number, t: number, sd: number): void {
    const L = this.bus.layer.bass;
    const rel = step - chord.at;
    const r = chord.bass;
    if (mode === 'pedal') {
      if (rel === 0) I.bass(this.k, L, t, r, chord.len * sd, 0.7);
      return;
    }
    if (mode === 'roots') {
      if (rel === 0) I.bass(this.k, L, t, r, (chord.len === 8 ? 3 : 3) * sd, 1);
      else if (chord.len === 8 && rel === 3) I.bass(this.k, L, t, r, 0.8 * sd, 0.6);
      else if (chord.len === 8 && rel === 4) I.bass(this.k, L, t, r + chord.fifth, 2 * sd, 0.85);
      else if (chord.len === 8 && rel === 7) I.bass(this.k, L, t, r + 12, 0.9 * sd, 0.55);
      return;
    }
    // walk: quarter notes, last one chromatic approach into the next chord
    if (rel % 2 !== 0) return;
    const q = rel / 2;
    const nextBass = this.peekNextBass(chord);
    let m: number;
    if (chord.len === 8) m = [r, r + chord.third, r + chord.fifth, nextBass + (nextBass > r + chord.fifth ? -1 : 1)][q];
    else m = [r, nextBass + 1][q] ?? r;
    // keep the walk in a comfy register
    while (m > 50) m -= 12;
    while (m < 34) m += 12;
    I.bass(this.k, L, t, m, 1.85 * sd, q === 0 ? 1 : 0.8);
  }

  private peekNextBass(cur: Chord): number {
    const chords = this.sting >= 0 ? STING_CHORDS[this.sting] : PROGRESSION[this.prog];
    const i = chords.indexOf(cur);
    if (i >= 0 && i < chords.length - 1) return chords[i + 1].bass;
    const nb = PROGRESSION[(this.prog + 1) % PROGRESSION.length][0].bass;
    return nb;
  }

  private drumStep(mode: SceneCfg['drums'], step: number, t: number): void {
    const L = this.bus.layer.drums;
    if (mode === 'hats') {
      if (step % 2 === 1) I.hat(this.k, L, t, rand(0.4, 0.7));
      return;
    }
    const soft = mode === 'soft';
    if (step === 0) I.kick(this.k, L, t, soft ? 0.7 : 1);
    if (step === 5 && !soft) I.kick(this.k, L, t, 0.55);
    if (step === 4 && soft) I.kick(this.k, L, t, 0.5);
    if (step === 2 || step === 6) I.brush(this.k, L, t, soft ? 0.6 : 1);
    // swung hats, accent on the offbeat
    const hv = (step % 2 ? 1 : 0.55) * (soft ? 0.6 : 1) * rand(0.8, 1.1);
    if (!(soft && step % 2 === 0 && Math.random() < 0.5)) I.hat(this.k, L, t, hv, step === 7 && !soft && this.bar % 2 === 1);
  }

  private leadStep(mode: SceneCfg['lead'], step: number, t: number, sd: number): void {
    const L = this.bus.layer.lead;
    const cyc = this.bar % 16;
    let notes: [number, number, number][] | undefined;
    if (this.sting >= 0) notes = STING_LEAD[this.sting];
    else if (mode === 'theme' || mode === 'credits') notes = THEME[this.prog];
    else if (mode === 'half') notes = cyc < 8 ? THEME[this.prog] : undefined;
    else if (mode === 'sparse') notes = this.prog === 0 || this.prog === 4 ? THEME[this.prog].slice(0, 3) : undefined;
    if (!notes) return;
    const oct = mode === 'credits' && cyc >= 8 ? 12 : 0;
    for (const [s, m, len] of notes) {
      if (s !== step) continue;
      const v = rand(0.85, 1);
      I.musicBox(this.k, L, t, m + oct, v, rand(-0.15, 0.15), Math.max(0.9, len * sd * 2.2));
      // credits: EP doubles the theme an octave down for warmth
      if (mode === 'credits') I.ep(this.k, this.bus.layer.ep, t, m - 12 + oct, len * sd * 0.9, 0.55, 0.2);
    }
  }
}

/** Persistent tension drone: soft open fifth C2/G2/C3 through a breathing lowpass (mysterious, not scary). */
export function buildDrone(ctx: BaseAudioContext, dest: AudioNode): void {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  lp.Q.value = 2;
  lp.connect(dest);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.18;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 140;
  lfo.connect(lfoG).connect(lp.frequency);
  lfo.start();
  for (const m of [36, 43, 48]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    o.detune.value = m === 48 ? 5 : 0;
    const g = ctx.createGain();
    g.gain.value = m === 48 ? 0.4 : 1;
    o.connect(g).connect(lp);
    o.start();
  }
}
