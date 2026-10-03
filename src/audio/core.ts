/**
 * NO PEEKING! audio — low-level helpers shared by music, sfx and bot voices.
 * Everything is procedural WebAudio. Works on any BaseAudioContext (live or offline).
 */

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Shared resources handed to every instrument. */
export interface Kit {
  ctx: BaseAudioContext;
  /** 2 s mono white noise, reused by every noise voice. */
  noise: AudioBuffer;
  /** Pitch wobble source in cents (driven by setHarmony). Connected to music osc.detune. */
  wobble: AudioNode;
  /** Live voice counter for the polyphony cap. */
  active: { n: number };
}

/** Hard cap on simultaneously sounding voices (music + sfx). */
export const MAX_VOICES = 72;

/**
 * A Voice groups the nodes of one note/sfx and disconnects all of them once every
 * scheduled source has ended — no leaks, no timers (so it also works offline).
 */
export class Voice {
  private nodes: AudioNode[] = [];
  private ext: [AudioNode, AudioParam][] = [];
  private pending = 0;
  private done = false;
  constructor(public k: Kit) {
    k.active.n++;
  }
  get ctx(): BaseAudioContext {
    return this.k.ctx;
  }

  gain(v = 0, dest?: AudioNode | AudioParam): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest as AudioNode);
    this.nodes.push(g);
    return g;
  }

  pan(p: number, dest: AudioNode): StereoPannerNode {
    const n = this.ctx.createStereoPanner();
    n.pan.value = clamp(p, -1, 1);
    n.connect(dest);
    this.nodes.push(n);
    return n;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.707, dest?: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (dest) f.connect(dest);
    this.nodes.push(f);
    return f;
  }

  node<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  osc(type: OscillatorType, freq: number, t0: number, t1: number, dest: AudioNode | AudioParam, wobble = false): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(dest as AudioNode);
    if (wobble) {
      this.k.wobble.connect(o.detune);
      this.ext.push([this.k.wobble, o.detune]);
    }
    this.src(o, t0, t1);
    return o;
  }

  noise(t0: number, t1: number, dest: AudioNode, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.k.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(dest);
    // random offset so repeated hits never sound identical
    this.src(s, t0, t1, Math.random() * 1.5);
    return s;
  }

  src(s: AudioScheduledSourceNode, t0: number, t1: number, offset?: number): void {
    this.nodes.push(s);
    this.pending++;
    s.onended = () => {
      if (--this.pending <= 0) this.free();
    };
    if (offset !== undefined && s instanceof AudioBufferSourceNode) s.start(t0, offset);
    else s.start(t0);
    s.stop(Math.max(t1, t0 + 0.01));
  }

  private free(): void {
    if (this.done) return;
    this.done = true;
    this.k.active.n--;
    for (const [a, p] of this.ext) {
      try {
        a.disconnect(p);
      } catch {
        /* already gone */
      }
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.nodes.length = 0;
  }
}

/** Percussive envelope: 0 → peak (linear, a seconds) → ~0 (exponential, d seconds). Returns end time. */
export function perc(p: AudioParam, t: number, a: number, peak: number, d: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(Math.max(peak * 0.0005, 1e-5), t + a + d);
  p.setValueAtTime(0, t + a + d + 0.001);
  return t + a + d + 0.01;
}

/**
 * Sustained envelope: attack → (optional decay toward `sustain`) → release at `off`.
 * No value jumps between stages, so no clicks. Returns the end time.
 */
export function asr(p: AudioParam, t: number, a: number, peak: number, off: number, r: number, sustain = peak, decayTc = 0.5): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  const holdEnd = Math.max(off, t + a + 0.001);
  if (sustain !== peak) p.setTargetAtTime(sustain, t + a, decayTc);
  p.setTargetAtTime(0, holdEnd, r / 5);
  p.setValueAtTime(0, holdEnd + r + 0.02);
  return holdEnd + r + 0.03;
}

// ───────────────────────── Buffers ─────────────────────────

export function makeNoise(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Warm, slightly dark stereo room/plate impulse with a little pre-delay. */
export function makeImpulse(ctx: BaseAudioContext, seconds = 2.6, decay = 3.2): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.018);
  const b = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      // one-pole lowpass that closes over time → darker tail
      const k = 0.55 - 0.45 * x;
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - x, decay) * 0.9;
    }
    // soft early reflections
    for (let e = 0; e < 6; e++) {
      const idx = pre + Math.floor(sr * (0.007 + e * 0.011 + ch * 0.003));
      if (idx < len) d[idx] += (e % 2 ? -1 : 1) * 0.35 * Math.pow(0.7, e);
    }
  }
  return b;
}

/** Loopable vinyl crackle: soft hiss + sparse clicks + rare pops (mono, 6 s). */
export function makeCrackle(ctx: BaseAudioContext, seconds = 6): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const b = ctx.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    lp += 0.08 * (Math.random() * 2 - 1 - lp);
    d[i] = lp * 0.12;
  }
  const clicks = Math.floor(seconds * 9);
  for (let c = 0; c < clicks; c++) {
    const at = Math.floor(Math.random() * (len - 200));
    const big = Math.random() < 0.08;
    const amp = (big ? rand(0.5, 0.9) : rand(0.08, 0.35)) * (Math.random() < 0.5 ? -1 : 1);
    const width = big ? 60 : Math.floor(rand(3, 14));
    for (let j = 0; j < width; j++) d[at + j] += amp * Math.exp(-j / (width / 3)) * (j % 2 ? -0.6 : 1);
  }
  // fade loop seam
  const f = Math.floor(sr * 0.01);
  for (let i = 0; i < f; i++) {
    d[i] *= i / f;
    d[len - 1 - i] *= i / f;
  }
  return b;
}

/** Staircase curve for the bitcrusher in 'glitch'. */
export function crushCurve(levels = 6): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(x * levels) / levels;
  }
  return c;
}
