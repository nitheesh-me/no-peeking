/**
 * Syndrome sonification. Each bot (a..h) has its own F-major-pentatonic pitch,
 * register, timbre AND rhythm figure, so a syndrome reads by ear even for non-musicians:
 *   00 → "tk  tk"            (two soft muted ticks = all quiet)
 *   10 → "DUM  tk"           (low wooden marimba)
 *   01 → "tk  ding-ding"     (high glassy bell, double tap)
 *   11 → "DUM  ding-ding"    (both)
 */
import { Kit, Voice, mtof, perc, rand } from './core';

type Timbre = 'marimba' | 'bell' | 'kalimba' | 'flute' | 'toy' | 'glock' | 'wood' | 'sparkle';
/** rhythm figure: [timeOffset s, semitone offset, velocity] */
interface BotVoice { midi: number; timbre: Timbre; fig: [number, number, number][]; pan: number }

export const BOT_VOICES: BotVoice[] = [
  { midi: 53, timbre: 'marimba', fig: [[0, 0, 1]], pan: -0.35 }, //                         a  F3  single "DUM"
  { midi: 84, timbre: 'bell', fig: [[0, 0, 0.9], [0.13, 0, 0.75]], pan: 0.35 }, //          b  C6  "ding-ding"
  { midi: 67, timbre: 'kalimba', fig: [[0, -2, 0.6], [0.075, 0, 1]], pan: -0.15 }, //       c  G4  grace "da-DUM"
  { midi: 77, timbre: 'flute', fig: [[0, 0, 1]], pan: 0.15 }, //                            d  F5  long whistle swell
  { midi: 60, timbre: 'toy', fig: [[0, 0, 0.8], [0.09, 0, 0.7], [0.18, 0, 0.95]], pan: -0.5 }, // e C4 triple
  { midi: 81, timbre: 'glock', fig: [[0, 0, 0.9], [0.06, 3, 0.7], [0.12, 0, 0.8], [0.18, 3, 0.7]], pan: 0.5 }, // f A5 trill
  { midi: 62, timbre: 'wood', fig: [[0, 0, 1]], pan: -0.25 }, //                            g  D4  sliding boing
  { midi: 86, timbre: 'sparkle', fig: [[0, 0, 0.8], [0.07, 12, 0.7]], pan: 0.25 }, //       h  D6  octave sparkle
];

function tone(k: Kit, dest: AudioNode, timbre: Timbre, t: number, f: number, vel: number, pan: number): void {
  const v = new Voice(k);
  const out = v.pan(pan, dest);
  const g = (peak: number, a: number, d: number, freq: number, type: OscillatorType = 'sine') => {
    const n = v.gain(0, out);
    const end = perc(n.gain, t, a, peak * vel, d);
    return v.osc(type, freq, t, end, n);
  };
  switch (timbre) {
    case 'marimba': {
      g(0.45, 0.002, 0.55, f);
      g(0.2, 0.001, 0.09, f * 4); // marimba's tuned 4th partial = audible on laptops
      g(0.06, 0.001, 0.025, f * 10);
      const n = v.gain(0, out);
      perc(n.gain, t, 0.001, 0.05 * vel, 0.015);
      v.noise(t, t + 0.03, v.filter('bandpass', 2500, 1.5, n));
      break;
    }
    case 'bell':
      g(0.22, 0.001, 0.9, f);
      g(0.09, 0.001, 0.45, f * 2.76);
      g(0.05, 0.001, 0.18, f * 5.4);
      break;
    case 'kalimba':
      g(0.32, 0.002, 0.5, f);
      g(0.08, 0.001, 0.05, f * 5.9);
      break;
    case 'flute': {
      const n = v.gain(0, out);
      n.gain.setValueAtTime(0, t);
      n.gain.linearRampToValueAtTime(0.2 * vel, t + 0.06);
      n.gain.setTargetAtTime(0, t + 0.38, 0.06);
      const o = v.osc('sine', f, t, t + 0.75, n);
      const lfo = v.osc('sine', 5.5, t, t + 0.75, v.gain(f * 0.012, o.frequency));
      void lfo;
      const h = v.gain(0.12, n);
      v.osc('triangle', f * 2, t, t + 0.75, h);
      break;
    }
    case 'toy':
      g(0.22, 0.001, 0.3, f, 'triangle');
      g(0.1, 0.001, 0.12, f * 2.98);
      break;
    case 'glock':
      g(0.2, 0.001, 0.35, f);
      g(0.05, 0.001, 0.06, f * 4.1);
      break;
    case 'wood': {
      const o = g(0.32, 0.002, 0.28, f, 'triangle');
      o.frequency.setValueAtTime(f * 1.25, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      g(0.06, 0.001, 0.03, f * 3);
      break;
    }
    case 'sparkle':
      g(0.18, 0.001, 0.5, f);
      g(0.06, 0.001, 0.2, f * 2.01);
      break;
  }
}

/** A BEEP: the bot's own bright figure. */
export function botBeep(k: Kit, dest: AudioNode, i: number, t: number, vel = 1): void {
  const bv = BOT_VOICES[((i % 8) + 8) % 8];
  for (const [dt, semi, v] of bv.fig) tone(k, dest, bv.timbre, t + dt, mtof(bv.midi + semi), v * vel * rand(0.95, 1.05), bv.pan);
}

/** A QUIET: muted, soft, short tick in the bot's register (clearly "nothing happened"). */
export function botQuiet(k: Kit, dest: AudioNode, i: number, t: number, vel = 1): void {
  const bv = BOT_VOICES[((i % 8) + 8) % 8];
  const v = new Voice(k);
  const out = v.pan(bv.pan, dest);
  const a = v.gain(0, out);
  const end = perc(a.gain, t, 0.002, 0.11 * vel, 0.045);
  const lp = v.filter('lowpass', 900, 0.7, a);
  // fold into a mid register so every tick sits in the same soft "tk" band
  let m = bv.midi;
  while (m > 64) m -= 12;
  v.osc('triangle', mtof(m), t, end, lp);
  const c = v.gain(0, out);
  perc(c.gain, t, 0.001, 0.025 * vel, 0.012);
  v.noise(t, t + 0.02, v.filter('bandpass', 1800, 2, c));
}

/** Gap between bots inside a syndrome chord (a strum, still heard as one chord). */
export const STRUM = 0.06;
