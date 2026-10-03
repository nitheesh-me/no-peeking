/**
 * Music instruments. Each function schedules ONE note at absolute time `t`
 * into `dest` and cleans itself up afterwards. Levels are pre-balanced so that a
 * full groove mix sits around -12 dBFS RMS before the master chain.
 */
import { Kit, Voice, mtof, perc, asr, rand, MAX_VOICES } from './core';

const full = (k: Kit) => k.active.n > MAX_VOICES;

/** Warm FM electric piano (Rhodes-ish): ratio-1 FM bark that mellows + detuned sine chorus + tiny tine ding. */
export function ep(k: Kit, dest: AudioNode, t: number, midi: number, dur: number, vel = 1, pan = 0, detuneCents = 0): void {
  if (full(k)) return;
  const v = new Voice(k);
  const f = mtof(midi);
  const ctx = k.ctx;
  const out = v.pan(pan, dest);
  const amp = v.gain(0, out);
  // velocity- and register-scaled level (high notes a bit softer)
  const peak = 0.055 * vel * (midi > 72 ? 0.8 : 1);
  const end = asr(amp.gain, t, 0.006, peak, t + dur, 0.45, peak * 0.45, 0.7); // natural decay while held
  // carrier + modulator (ratio 1)
  const car = v.osc('sine', f, t, end, amp, true);
  car.detune.value = detuneCents;
  const modG = v.gain(0, car.frequency);
  const idx = f * (1.6 * vel);
  modG.gain.setValueAtTime(idx, t);
  modG.gain.setTargetAtTime(f * 0.25, t + 0.005, 0.18);
  const mod = v.osc('sine', f, t, end, modG, true);
  mod.detune.value = detuneCents;
  // chorus partner
  const ch = v.gain(0.45, amp);
  const c2 = v.osc('sine', f, t, end, ch, true);
  c2.detune.value = detuneCents + 7;
  // tine ding (very short, adds "Rhodes" attack)
  if (midi < 84) {
    const tg = v.gain(0, out);
    perc(tg.gain, t, 0.001, peak * 0.18 * vel, 0.06);
    v.osc('sine', Math.min(f * 7, 9000), t, t + 0.1, tg);
  }
  void ctx;
}

/** Soft analog pad: 2 detuned triangles per note, slow swell. */
export function pad(k: Kit, dest: AudioNode, t: number, midi: number, dur: number, vel = 1, detuneCents = 0): void {
  if (full(k)) return;
  const v = new Voice(k);
  const f = mtof(midi);
  const amp = v.gain(0, dest);
  const end = asr(amp.gain, t, 0.9, 0.05 * vel, t + dur, 1.4);
  const a = v.osc('triangle', f, t, end, amp, true);
  a.detune.value = -4 + detuneCents;
  const b = v.osc('triangle', f, t, end, amp, true);
  b.detune.value = 4 + detuneCents;
}

/** Round soft bass: sine + octave triangle (so laptops hear it) through a lowpass pluck. */
export function bass(k: Kit, dest: AudioNode, t: number, midi: number, dur: number, vel = 1): void {
  if (full(k)) return;
  const v = new Voice(k);
  const f = mtof(midi);
  const lp = v.filter('lowpass', 900, 0.8, dest);
  lp.frequency.setValueAtTime(1100 * vel, t);
  lp.frequency.setTargetAtTime(380, t, 0.12);
  const amp = v.gain(0, lp);
  const end = asr(amp.gain, t, 0.012, 0.32 * vel, t + dur * 0.92, 0.12, 0.2 * vel, 0.4);
  v.osc('sine', f, t, end, amp);
  const h = v.gain(0.35, amp);
  v.osc('triangle', f * 2, t, end, h);
}

/** Soft lo-fi kick: pitch-dropping sine + short click. */
export function kick(k: Kit, dest: AudioNode, t: number, vel = 1): void {
  if (full(k)) return;
  const v = new Voice(k);
  const amp = v.gain(0, dest);
  const end = perc(amp.gain, t, 0.003, 0.55 * vel, 0.32);
  const o = v.osc('sine', 110, t, end, amp);
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
  const cg = v.gain(0, dest);
  perc(cg.gain, t, 0.001, 0.08 * vel, 0.02);
  const hp = v.filter('bandpass', 1800, 1, cg);
  v.noise(t, t + 0.04, hp);
}

/** Brushed hat: short bright noise tick. */
export function hat(k: Kit, dest: AudioNode, t: number, vel = 1, open = false, pan = 0.25): void {
  if (full(k)) return;
  const v = new Voice(k);
  const out = v.pan(pan, dest);
  const amp = v.gain(0, out);
  const end = perc(amp.gain, t, open ? 0.02 : 0.002, 0.06 * vel, open ? 0.22 : 0.05);
  const bp = v.filter('bandpass', 8200, 0.9, amp);
  const hp = v.filter('highpass', 5500, 0.7, bp);
  v.noise(t, end, hp);
}

/** Brush "swish" snare on 2 & 4. */
export function brush(k: Kit, dest: AudioNode, t: number, vel = 1): void {
  if (full(k)) return;
  const v = new Voice(k);
  const out = v.pan(-0.15, dest);
  const amp = v.gain(0, out);
  const end = perc(amp.gain, t, 0.025, 0.09 * vel, 0.2);
  const bp = v.filter('bandpass', 2600, 0.7, amp);
  bp.frequency.setValueAtTime(3600, t);
  bp.frequency.exponentialRampToValueAtTime(1800, t + 0.2);
  v.noise(t, end, bp);
  // tiny body
  const bg = v.gain(0, out);
  perc(bg.gain, t, 0.002, 0.05 * vel, 0.08);
  v.osc('triangle', 190, t, t + 0.12, bg);
}

/** Music box tine: pure sine + inharmonic bell partials, gentle decay. The theme's voice. */
export function musicBox(k: Kit, dest: AudioNode, t: number, midi: number, vel = 1, pan = 0, len = 1.6): void {
  if (full(k)) return;
  const v = new Voice(k);
  const f = mtof(midi);
  const out = v.pan(pan, dest);
  const a = v.gain(0, out);
  const end = perc(a.gain, t, 0.002, 0.13 * vel, len);
  v.osc('sine', f, t, end, a, true);
  const b = v.gain(0, out);
  perc(b.gain, t, 0.001, 0.035 * vel, 0.35);
  v.osc('sine', f * 3.01, t, t + 0.4, b, true);
  const c = v.gain(0, out);
  perc(c.gain, t, 0.001, 0.02 * vel, 0.09);
  v.osc('sine', Math.min(f * 5.43, 12000), t, t + 0.12, c);
}

/** Curious triangle pluck for the lab arps. */
export function pluck(k: Kit, dest: AudioNode, t: number, midi: number, vel = 1, pan = 0): void {
  if (full(k)) return;
  const v = new Voice(k);
  const f = mtof(midi);
  const out = v.pan(pan, dest);
  const lp = v.filter('lowpass', 3000, 2, out);
  lp.frequency.setValueAtTime(4200, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
  const a = v.gain(0, lp);
  const end = perc(a.gain, t, 0.003, 0.09 * vel, 0.38);
  v.osc('triangle', f, t, end, a, true);
  const b = v.gain(0.3, a);
  const s = v.osc('square', f * 2, t, end, b, true);
  s.detune.value = 4;
}

/** Wood-block clock: tick (high) / tock (low). */
export function clock(k: Kit, dest: AudioNode, t: number, tick: boolean, vel = 1): void {
  if (full(k)) return;
  const v = new Voice(k);
  const out = v.pan(tick ? 0.35 : -0.35, dest);
  const a = v.gain(0, out);
  const f = tick ? 1900 : 1350;
  const end = perc(a.gain, t, 0.001, 0.09 * vel, 0.045);
  v.osc('sine', f, t, end, a);
  const b = v.gain(0, out);
  perc(b.gain, t, 0.001, 0.03 * vel, 0.012);
  const bp = v.filter('bandpass', f * 1.6, 3, b);
  v.noise(t, t + 0.03, bp);
}

/** Sneaky pizzicato for the tension layer. */
export function pizz(k: Kit, dest: AudioNode, t: number, midi: number, vel = 1, pan = 0): void {
  if (full(k)) return;
  const v = new Voice(k);
  const f = mtof(midi);
  const out = v.pan(pan, dest);
  const lp = v.filter('lowpass', 1400, 4, out);
  lp.frequency.setValueAtTime(2200, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 0.14);
  const a = v.gain(0, lp);
  const end = perc(a.gain, t, 0.002, 0.2 * vel, 0.16);
  v.osc('sawtooth', f, t, end, a);
}

/** Heartbeat "lub-dub" (with an audible 2nd harmonic for small speakers). */
export function heartbeat(k: Kit, dest: AudioNode, t: number, vel = 1): void {
  if (full(k)) return;
  const v = new Voice(k);
  const a = v.gain(0, dest);
  for (const [dt, pk] of [[0, 1], [0.17, 0.7]] as const) {
    const g = v.gain(0, a);
    perc(g.gain, t + dt, 0.006, 0.4 * vel * pk, 0.14);
    const o = v.osc('sine', 80, t + dt, t + dt + 0.2, g);
    o.frequency.setValueAtTime(95, t + dt);
    o.frequency.exponentialRampToValueAtTime(50, t + dt + 0.12);
    const h = v.gain(0, a);
    perc(h.gain, t + dt, 0.004, 0.07 * vel * pk, 0.08);
    v.osc('triangle', 160, t + dt, t + dt + 0.12, h);
  }
  a.gain.value = 1;
}

/** Soft swelling cymbal for the win sting. */
export function swell(k: Kit, dest: AudioNode, t: number, len: number, vel = 1): void {
  if (full(k)) return;
  const v = new Voice(k);
  const a = v.gain(0, dest);
  a.gain.setValueAtTime(0, t);
  a.gain.linearRampToValueAtTime(0.035 * vel, t + 0.05);
  a.gain.exponentialRampToValueAtTime(0.0005, t + len);
  const hp = v.filter('highpass', 6000, 0.6, a);
  v.noise(t, t + len + 0.05, hp);
  void rand;
}
