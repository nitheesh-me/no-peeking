/**
 * All 25 contract SFX, synthesized. Each takes (kit, dest, startTime, pitchMultiplier)
 * and returns its approximate duration. `dest` is already panned/volume-scaled by the engine.
 */
import type { SfxName } from '../core/contracts';
import { Kit, Voice, mtof, perc, rand, pick, crushCurve } from './core';

type Sfx = (k: Kit, d: AudioNode, t: number, p: number) => number;

/** quick sine/tri blip with pitch glide */
function blip(v: Voice, d: AudioNode, t: number, f0: number, f1: number, glide: number, peak: number, dec: number, type: OscillatorType = 'sine', a = 0.002): OscillatorNode {
  const g = v.gain(0, d);
  const end = perc(g.gain, t, a, peak, dec);
  const o = v.osc(type, f0, t, end, g);
  if (f1 !== f0) {
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + glide);
  }
  return o;
}

function noiseHit(v: Voice, d: AudioNode, t: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, a: number, dec: number): BiquadFilterNode {
  const g = v.gain(0, d);
  const end = perc(g.gain, t, a, peak, dec);
  const f = v.filter(type, f0, q, g);
  if (f1 !== f0) {
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + a + dec);
  }
  v.noise(t, end, f);
  return f;
}

const PENT_HI = [89, 91, 93, 96, 98, 101]; // F6 G6 A6 C7 D7 F7

function sparkle(v: Voice, d: AudioNode, t: number, n: number, p: number, peak = 0.08): void {
  for (let i = 0; i < n; i++) {
    const f = mtof(pick(PENT_HI)) * p;
    blip(v, d, t + i * 0.045 + rand(0, 0.01), f, f, 0, peak * rand(0.6, 1), 0.18);
  }
}

export const SFX: Record<SfxName, Sfx> = {
  // X gate: bouncy pluck — pitch pops up then settles
  boop(k, d, t, p) {
    const v = new Voice(k);
    const f = 520 * p;
    const o = blip(v, d, t, f * 0.7, f, 0.05, 0.32, 0.22, 'triangle');
    o.frequency.setValueAtTime(f * 0.7, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.04);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    blip(v, d, t, f * 2, f * 2, 0, 0.06, 0.08);
    return 0.3;
  },
  // Z gate: soft "shh"
  shush(k, d, t, p) {
    const v = new Voice(k);
    noiseHit(v, d, t, 'bandpass', 4200 * p, 3400 * p, 1.2, 0.22, 0.07, 0.35);
    noiseHit(v, d, t, 'highpass', 6500, 6500, 0.7, 0.05, 0.05, 0.25);
    return 0.45;
  },
  // H gate: rising whirl
  spin(k, d, t, p) {
    const v = new Voice(k);
    const g = v.gain(0, d);
    const end = perc(g.gain, t, 0.05, 0.16, 0.38);
    const bp = v.filter('bandpass', 800, 3, g);
    bp.frequency.setValueAtTime(500 * p, t);
    bp.frequency.exponentialRampToValueAtTime(3500 * p, t + 0.4);
    const o = v.osc('sawtooth', 300 * p, t, end, bp);
    o.frequency.setValueAtTime(280 * p, t);
    o.frequency.exponentialRampToValueAtTime(1150 * p, t + 0.4);
    // whirl: fast vibrato
    v.osc('sine', 22, t, end, v.gain(60 * p, o.frequency));
    blip(v, d, t + 0.36, 1400 * p, 1760 * p, 0.05, 0.08, 0.15);
    return 0.5;
  },
  // CNOT: slap + sparkle
  highfive(k, d, t, p) {
    const v = new Voice(k);
    noiseHit(v, d, t, 'bandpass', 1400 * p, 900 * p, 0.9, 0.5, 0.001, 0.06);
    blip(v, d, t, 220 * p, 120 * p, 0.05, 0.35, 0.07);
    sparkle(v, d, t + 0.05, 4, p);
    return 0.45;
  },
  // bot hears a 1: bright "bee-boop!" (brash square = red)
  listen_beep(k, d, t, p) {
    const v = new Voice(k);
    const lp = v.filter('lowpass', 3200, 1, d);
    blip(v, lp, t, 1318 * p, 1318 * p, 0, 0.14, 0.1, 'square');
    blip(v, lp, t + 0.11, 988 * p, 930 * p, 0.12, 0.15, 0.16, 'square');
    return 0.32;
  },
  listen_quiet(k, d, t, p) {
    const v = new Voice(k);
    blip(v, d, t, 330 * p, 290 * p, 0.06, 0.18, 0.08);
    return 0.12;
  },
  // bot reset: downward bloop + soft ding
  reset(k, d, t, p) {
    const v = new Voice(k);
    blip(v, d, t, 900 * p, 380 * p, 0.14, 0.2, 0.16, 'triangle');
    blip(v, d, t + 0.13, 698 * p, 698 * p, 0, 0.1, 0.3);
    return 0.45;
  },
  // FAIL: pop → cartoon slide-whistle down → glass tinkle shatter. Funny, not scary.
  peek_collapse(k, d, t, p) {
    const v = new Voice(k);
    // pop
    blip(v, d, t, 180 * p, 55 * p, 0.1, 0.55, 0.16);
    noiseHit(v, d, t, 'lowpass', 3000, 600, 0.7, 0.35, 0.001, 0.08);
    // slide whistle down with wobbly vibrato
    const g = v.gain(0, d);
    g.gain.setValueAtTime(0, t + 0.06);
    g.gain.linearRampToValueAtTime(0.2, t + 0.1);
    g.gain.setValueAtTime(0.2, t + 0.65);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
    const o = v.osc('triangle', 1400 * p, t + 0.06, t + 1, g);
    o.frequency.setValueAtTime(1500 * p, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(160 * p, t + 0.9);
    const vib = v.gain(0, o.frequency);
    vib.gain.setValueAtTime(10, t + 0.06);
    vib.gain.linearRampToValueAtTime(60, t + 0.9);
    v.osc('sine', 7, t + 0.06, t + 1, vib);
    // glass shatter: bright noise + random high pings
    noiseHit(v, d, t + 0.05, 'highpass', 5000, 5000, 0.8, 0.22, 0.002, 0.35);
    for (let i = 0; i < 9; i++) {
      const f = rand(2800, 7500);
      blip(v, d, t + 0.05 + rand(0, 0.32), f, f * 0.98, 0.1, rand(0.03, 0.08), rand(0.06, 0.2));
    }
    // final silly bonk
    blip(v, d, t + 0.95, 260 * p, 180 * p, 0.08, 0.3, 0.14, 'triangle');
    return 1.2;
  },
  // pink-panther tiptoe pizzicato
  gremlin_sneak(k, d, t, p) {
    const v = new Voice(k);
    [52, 53, 54, 55].forEach((m, i) => {
      const tt = t + i * 0.16;
      const lp = v.filter('lowpass', 1600, 4, d);
      lp.frequency.setValueAtTime(2400, tt);
      lp.frequency.exponentialRampToValueAtTime(350, tt + 0.12);
      const g = v.gain(0, lp);
      const end = perc(g.gain, tt, 0.002, 0.28, 0.12);
      v.osc('sawtooth', mtof(m) * p, tt, end, g);
    });
    return 0.75;
  },
  // cartoon zap
  gremlin_flip(k, d, t, p) {
    const v = new Voice(k);
    const g = v.gain(0, d);
    const end = perc(g.gain, t, 0.002, 0.18, 0.28);
    const lp = v.filter('lowpass', 4000, 2, g);
    const o = v.osc('square', 1600 * p, t, end, lp);
    o.frequency.setValueAtTime(1800 * p, t);
    o.frequency.exponentialRampToValueAtTime(180 * p, t + 0.25);
    v.osc('square', 45, t, end, v.gain(500 * p, o.frequency));
    noiseHit(v, d, t, 'bandpass', 3000, 1200, 2, 0.12, 0.001, 0.15);
    return 0.35;
  },
  // spooky "wooo" through a 4-stage phaser
  ghost_phase(k, d, t, p) {
    const v = new Voice(k);
    const g = v.gain(0, d);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.25);
    g.gain.setTargetAtTime(0, t + 0.9, 0.15);
    const end = t + 1.6;
    let node: AudioNode = g;
    const lfoG = v.gain(700);
    for (let i = 0; i < 4; i++) {
      const ap = v.filter('allpass', 900, 0.8);
      ap.connect(node);
      lfoG.connect(ap.frequency);
      node = ap;
    }
    v.osc('sine', 0.9, t, end, lfoG);
    const mix = v.gain(1, node);
    mix.connect(g); // dry + phased = notches
    const o = v.osc('sawtooth', 390 * p, t, end, v.filter('lowpass', 1400, 1, mix));
    o.frequency.setValueAtTime(330 * p, t);
    o.frequency.linearRampToValueAtTime(520 * p, t + 0.45);
    o.frequency.linearRampToValueAtTime(300 * p, t + 1.2);
    v.osc('sine', 5, t, end, v.gain(12 * p, o.frequency));
    return 1.5;
  },
  // jelly boing: decaying pitch wobble
  wobble(k, d, t, p) {
    const v = new Voice(k);
    const o = blip(v, d, t, 200 * p, 330 * p, 0.12, 0.32, 0.5, 'sine');
    const vib = v.gain(0, o.frequency);
    vib.gain.setValueAtTime(90 * p, t);
    vib.gain.exponentialRampToValueAtTime(3, t + 0.5);
    v.osc('sine', 11, t, t + 0.55, vib);
    blip(v, d, t, 400 * p, 660 * p, 0.12, 0.06, 0.3, 'triangle');
    return 0.55;
  },
  // two-note happy ding (F5 → C6), mint
  test_pass(k, d, t, p) {
    const v = new Voice(k);
    [[0, 77], [0.09, 84]].forEach(([dt, m]) => {
      const f = mtof(m) * p;
      blip(v, d, t + dt, f, f, 0, 0.2, 0.4);
      blip(v, d, t + dt, f * 4, f * 4, 0, 0.04, 0.08);
    });
    return 0.55;
  },
  // cute "bwomp-womp" (descending semitone)
  test_fail(k, d, t, p) {
    const v = new Voice(k);
    [[0, 57, 0.18], [0.22, 56, 0.4]].forEach(([dt, m, len]) => {
      const lp = v.filter('lowpass', 900, 3, d);
      const g = v.gain(0, lp);
      g.gain.setValueAtTime(0, t + dt);
      g.gain.linearRampToValueAtTime(0.22, t + dt + 0.03);
      g.gain.setTargetAtTime(0, t + dt + len, 0.05);
      const o = v.osc('sawtooth', mtof(m) * p, t + dt, t + dt + len + 0.3, g);
      o.frequency.setValueAtTime(mtof(m) * p, t + dt);
      o.frequency.exponentialRampToValueAtTime(mtof(m - 0.7) * p, t + dt + len);
      v.osc('sine', 6, t + dt, t + dt + len + 0.3, v.gain(4 * p, o.frequency));
    });
    return 0.9;
  },
  // fanfare in F: arpeggio up then a big Fmaj9 bloom + sparkle
  level_win(k, d, t, p) {
    const v = new Voice(k);
    [72, 77, 81, 84].forEach((m, i) => {
      const f = mtof(m) * p;
      blip(v, d, t + i * 0.09, f, f, 0, 0.16, 0.35, 'triangle');
    });
    const tt = t + 0.38;
    [65, 69, 72, 76, 79, 89].forEach((m, i) => {
      const f = mtof(m) * p;
      const g = v.gain(0, d);
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(0.065, tt + 0.02 + i * 0.01);
      g.gain.setTargetAtTime(0, tt + 0.5, 0.35);
      const lp = v.filter('lowpass', 2600, 0.8, g);
      v.osc('sawtooth', f, tt, tt + 2.2, lp).detune.value = rand(-6, 6);
      v.osc('sine', f, tt, tt + 2.2, g);
    });
    sparkle(v, d, tt + 0.1, 6, p, 0.07);
    return 2.2;
  },
  ui_click(k, d, t, p) {
    const v = new Voice(k);
    blip(v, d, t, 1800 * p, 1500 * p, 0.01, 0.16, 0.025);
    noiseHit(v, d, t, 'highpass', 4000, 4000, 0.7, 0.05, 0.001, 0.01);
    return 0.05;
  },
  ui_hover(k, d, t, p) {
    const v = new Voice(k);
    blip(v, d, t, 2400 * p, 2600 * p, 0.03, 0.04, 0.04);
    return 0.06;
  },
  // paper lift "fwip" up + tiny pluck
  card_pick(k, d, t, p) {
    const v = new Voice(k);
    noiseHit(v, d, t, 'bandpass', 1000 * p, 4200 * p, 1.5, 0.2, 0.02, 0.09);
    blip(v, d, t + 0.03, 700 * p, 1050 * p, 0.04, 0.1, 0.08, 'triangle');
    return 0.15;
  },
  // paper drop "thock"
  card_drop(k, d, t, p) {
    const v = new Voice(k);
    noiseHit(v, d, t, 'bandpass', 3000 * p, 900 * p, 1.2, 0.18, 0.005, 0.07);
    blip(v, d, t + 0.02, 320 * p, 170 * p, 0.05, 0.32, 0.09);
    return 0.15;
  },
  // tape rewind: descending chirps + warbly whoosh
  rewind(k, d, t, p) {
    const v = new Voice(k);
    for (let i = 0; i < 8; i++) {
      const f = 1600 * p * Math.pow(0.86, i);
      blip(v, d, t + i * 0.045, f * 1.15, f, 0.03, 0.08, 0.04, 'triangle');
    }
    noiseHit(v, d, t, 'bandpass', 3000, 600, 2, 0.08, 0.05, 0.35);
    return 0.45;
  },
  // camera-ish "ch-chk"
  snap_measure(k, d, t, p) {
    const v = new Voice(k);
    noiseHit(v, d, t, 'highpass', 3000 * p, 3000 * p, 0.7, 0.25, 0.001, 0.025);
    noiseHit(v, d, t + 0.07, 'bandpass', 2000 * p, 2000 * p, 1, 0.22, 0.001, 0.035);
    blip(v, d, t + 0.07, 1200 * p, 900 * p, 0.02, 0.08, 0.03);
    return 0.15;
  },
  // tiny snore: breathy inhale + whistle exhale
  qubble_snore(k, d, t, p) {
    const v = new Voice(k);
    const g = v.gain(0, d);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.5);
    g.gain.linearRampToValueAtTime(0, t + 0.65);
    const lp = v.filter('bandpass', 500, 2, g);
    lp.frequency.setValueAtTime(400 * p, t);
    lp.frequency.exponentialRampToValueAtTime(1000 * p, t + 0.6);
    v.noise(t, t + 0.7, lp);
    const wg = v.gain(0, d);
    wg.gain.setValueAtTime(0, t + 0.7);
    wg.gain.linearRampToValueAtTime(0.07, t + 0.8);
    wg.gain.linearRampToValueAtTime(0, t + 1.3);
    const o = v.osc('sine', 1400 * p, t + 0.7, t + 1.35, wg);
    o.frequency.setValueAtTime(1350 * p, t + 0.7);
    o.frequency.linearRampToValueAtTime(1800 * p, t + 1.25);
    v.osc('sine', 9, t + 0.7, t + 1.35, v.gain(25 * p, o.frequency));
    return 1.35;
  },
  // "hehehe": descending squeaky chirps
  qubble_giggle(k, d, t, p) {
    const v = new Voice(k);
    for (let i = 0; i < 5; i++) {
      const f = (1250 - i * 70) * p * rand(0.97, 1.03);
      const o = blip(v, d, t + i * 0.085, f, f, 0, 0.12, 0.06, 'triangle', 0.008);
      o.frequency.setValueAtTime(f * 0.85, t + i * 0.085);
      o.frequency.exponentialRampToValueAtTime(f * 1.15, t + i * 0.085 + 0.03);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + i * 0.085 + 0.07);
    }
    return 0.5;
  },
  // FM meow: index envelope gives "m" (dull) → "e" (bright) → "ow" (dull)
  schrodi_meow(k, d, t, p) {
    const v = new Voice(k);
    const g = v.gain(0, d);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.08);
    g.gain.setValueAtTime(0.2, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    const lp = v.filter('lowpass', 1200, 1, g);
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(3200, t + 0.2);
    lp.frequency.linearRampToValueAtTime(900, t + 0.65);
    const car = v.osc('sine', 600 * p, t, t + 0.72, lp);
    const f = car.frequency;
    f.setValueAtTime(520 * p, t);
    f.linearRampToValueAtTime(760 * p, t + 0.2);
    f.linearRampToValueAtTime(480 * p, t + 0.65);
    const idx = v.gain(0, f);
    idx.gain.setValueAtTime(150 * p, t);
    idx.gain.linearRampToValueAtTime(900 * p, t + 0.2);
    idx.gain.linearRampToValueAtTime(120 * p, t + 0.65);
    const mod = v.osc('sine', 600 * p, t, t + 0.72, idx);
    mod.frequency.setValueAtTime(520 * p, t);
    mod.frequency.linearRampToValueAtTime(760 * p, t + 0.2);
    mod.frequency.linearRampToValueAtTime(480 * p, t + 0.65);
    v.osc('sine', 6, t, t + 0.72, v.gain(10 * p, f)); // purr-ish vibrato
    return 0.75;
  },
  // bitcrushed stutter
  glitch(k, d, t, p) {
    const v = new Voice(k);
    const ws = v.node(k.ctx.createWaveShaper());
    ws.curve = crushCurve(5);
    const g = v.gain(0.9, d);
    ws.connect(g);
    let tt = t;
    for (let i = 0; i < 7; i++) {
      const len = pick([0.025, 0.035, 0.05]);
      const f = pick([220, 440, 660, 880, 1320]) * p;
      const sg = v.gain(0, ws);
      sg.gain.setValueAtTime(0, tt);
      sg.gain.linearRampToValueAtTime(0.2, tt + 0.002);
      sg.gain.setValueAtTime(0.2, tt + len - 0.004);
      sg.gain.linearRampToValueAtTime(0, tt + len);
      if (Math.random() < 0.35) v.noise(tt, tt + len, sg);
      else v.osc('square', f, tt, tt + len, sg);
      tt += len + pick([0, 0.012, 0.03]);
    }
    return tt - t;
  },
};

/** Default per-sfx gain trims (balance). */
export const SFX_GAIN: Partial<Record<SfxName, number>> = {
  ui_hover: 0.7,
  qubble_snore: 1.1,
  level_win: 1,
  peek_collapse: 1,
};
