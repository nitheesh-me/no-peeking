/**
 * "Qubblese" — Animalese-style speech babble derived from the actual letters.
 *
 * A line is parsed once into syllables (consonant cluster + vowel group). Each syllable fires on
 * the character where it starts, as the typewriter reveals it. Vowels pick formant pairs, consonant
 * classes pick the onset (plosive click / fricative hiss / nasal scoop). Pitch offsets are hashed
 * from the syllable's letters, so the same word always sounds the same. '?' rises, '!' punches,
 * '…'/'...' trails off. Each speaker has its own source, register, formant scale and quirks.
 */
import type { Speaker } from '../core/contracts';
import { Kit, Voice, perc, clamp } from './core';

// ───────── speaker voices ─────────
interface SpeakerVoice {
  f0: number; // base pitch Hz
  wave: OscillatorType;
  fmt: number; // formant scale (small creatures → higher)
  range: number; // semitone spread of the hashed melody
  len: number; // grain length s
  gap: number; // min seconds between grains
  gain: number;
  glide: number; // semitones of in-grain pitch glide (meow / coo)
  vib: [number, number]; // vibrato [Hz, semitones]
  breath: number; // noise mixed into the formants (airy)
  verb: number; // extra reverb send
  phaser?: boolean;
}
const V: Record<Speaker, SpeakerVoice> = {
  schrodi: { f0: 230, wave: 'triangle', fmt: 1.0, range: 3, len: 0.075, gap: 0.075, gain: 1, glide: 2.5, vib: [24, 0.25], breath: 0.05, verb: 0.1 }, // lazy purr-meow
  flipper: { f0: 620, wave: 'square', fmt: 1.35, range: 6, len: 0.048, gap: 0.05, gain: 0.45, glide: -1.5, vib: [0, 0], breath: 0, verb: 0 }, // bratty chipmunk
  phasey: { f0: 400, wave: 'sine', fmt: 1.15, range: 4, len: 0.08, gap: 0.075, gain: 0.7, glide: 1, vib: [6, 0.5], breath: 0.6, verb: 0.35, phaser: true }, // breathy ghost
  wobbles: { f0: 300, wave: 'triangle', fmt: 1.05, range: 4, len: 0.07, gap: 0.065, gain: 1, glide: -3, vib: [10, 1.4], breath: 0, verb: 0.08 }, // gloopy bubbles
  qubble: { f0: 880, wave: 'sine', fmt: 1.55, range: 4, len: 0.06, gap: 0.065, gain: 0.8, glide: 3, vib: [0, 0], breath: 0.05, verb: 0.12 }, // tiny coos
  eye: { f0: 98, wave: 'sawtooth', fmt: 0.8, range: 2, len: 0.15, gap: 0.13, gain: 0.8, glide: -0.5, vib: [3, 0.2], breath: 0.1, verb: 0.6 }, // deep slow hum
  system: { f0: 520, wave: 'sine', fmt: 1.2, range: 2, len: 0.04, gap: 0.06, gain: 0.55, glide: 0, vib: [0, 0], breath: 0, verb: 0 }, // neutral blip
};

// vowel → [F1, F2] (Hz, adult-ish; scaled per speaker)
const FORMANTS: Record<string, [number, number]> = {
  a: [800, 1250], e: [480, 1900], i: [320, 2400], o: [520, 880], u: [350, 700], y: [330, 2200],
};
const VOWELS = 'aeiouy';
type Onset = 'none' | 'plosive' | 'fric' | 'nasal' | 'h';
const onsetOf = (c: string): Onset => {
  if (!c) return 'none';
  if (/[pbtdkgcq]/.test(c)) return 'plosive';
  if (/[sz]|sh|ch|th|[fvxj]/.test(c)) return 'fric';
  if (c[0] === 'h') return 'h';
  return /[mnlrw]/.test(c) ? 'nasal' : 'plosive';
};
const PLOSIVE_HZ: Record<string, number> = { p: 900, b: 700, t: 3800, d: 3000, k: 2000, g: 1700, c: 2000, q: 1800 };

interface Syl {
  at: number; // char index where it fires
  v1: string;
  v2: string; // diphthong target (or same)
  onset: Onset;
  c0: string; // first consonant
  semi: number; // final pitch offset (semitones)
  gain: number;
  stretch: number; // grain length multiplier
  punch: boolean;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const MELODY = [0, 2, 4, 5, 7, -3, 2, 0]; // major-ish steps → friendly, never eerie

function parse(line: string): Map<number, Syl> {
  const out = new Map<number, Syl>();
  const lower = line.toLowerCase();
  // split into sentences so punctuation shapes the end of each
  const sentRe = /[^.?!…]+(\.\.\.|[.?!…]+)?/g;
  let m: RegExpExecArray | null;
  while ((m = sentRe.exec(lower))) {
    const sent = m[0];
    const base = m.index;
    const end = /\?/.test(sent) ? '?' : /!/.test(sent) ? '!' : /…|\.\.\./.test(sent) ? '…' : '.';
    const syls: Syl[] = [];
    let lastWordStart = -1;
    const wordRe = /[a-z0-9'À-ɏ]+/g;
    let w: RegExpExecArray | null;
    while ((w = wordRe.exec(sent))) {
      const word = w[0];
      const wStart = base + w.index;
      lastWordStart = syls.length;
      const hasVowel = /[aeiou]/.test(word);
      let i = 0;
      while (i < word.length) {
        const s0 = i;
        while (i < word.length && !(VOWELS.includes(word[i]) && (hasVowel ? word[i] !== 'y' || i > s0 : true))) i++;
        const cons = word.slice(s0, i);
        const vs = i;
        while (i < word.length && VOWELS.includes(word[i])) i++;
        let vow = word.slice(vs, i);
        if (!vow) {
          // trailing consonants: attach to previous syllable; vowel-less word ("hmm", "zzz", "42") gets a hashed vowel
          if (syls.length && syls[syls.length - 1].at >= wStart) break;
          vow = 'aeiou'[hash(word) % 5];
        }
        const key = cons + vow;
        const h = hash(key + word.length);
        syls.push({
          at: wStart + s0,
          v1: vow[0],
          v2: vow[vow.length - 1],
          onset: onsetOf(cons.slice(0, 2)),
          c0: cons[0] ?? '',
          semi: MELODY[h % MELODY.length],
          gain: 0.85 + ((h >>> 8) % 16) / 100,
          stretch: 1,
          punch: false,
        });
      }
    }
    // declination + end-of-sentence inflection
    syls.forEach((s, j) => {
      s.semi -= (j / Math.max(1, syls.length)) * 1.5;
      const inLast = j >= lastWordStart;
      const fromEnd = syls.length - 1 - j;
      if (end === '?' && inLast) s.semi += 3 + (fromEnd === 0 ? 4 : 0);
      if (end === '!') {
        s.gain *= 1.15;
        s.punch = true;
        if (inLast) s.semi += 2;
      }
      if (end === '…' && inLast) {
        s.semi -= 2 + (fromEnd === 0 ? 2 : 0);
        s.gain *= 0.7;
        s.stretch = 1.6;
      }
      if (fromEnd === 0 && end !== '…') s.stretch = 1.3;
      out.set(s.at, s);
    });
  }
  return out;
}

export class Babbler {
  private cache = new Map<string, Map<number, Syl>>();
  private last = new Map<Speaker, number>();
  private phaser: AudioNode | null = null;
  lastGrainEnd = 0;

  constructor(private k: Kit, private dest: AudioNode, private verb: AudioNode) {}

  /** Returns grain end time if a syllable fired, else 0. */
  speak(who: Speaker, index: number, line: string): number {
    const sp = V[who] ?? V.system;
    let map = this.cache.get(line);
    if (!map) {
      map = parse(line);
      if (this.cache.size > 24) this.cache.clear();
      this.cache.set(line, map);
    }
    const syl = map.get(index);
    if (!syl) return 0;
    const now = this.k.ctx.currentTime;
    if (now - (this.last.get(who) ?? -1) < sp.gap) return 0; // throttle (also tames "reveal all")
    if (this.k.active.n > 80) return 0;
    this.last.set(who, now);
    return this.grain(sp, syl, now + 0.005, who === 'phasey');
  }

  private getPhaser(): AudioNode {
    if (this.phaser) return this.phaser;
    const ctx = this.k.ctx;
    const input = ctx.createGain();
    const out = ctx.createGain();
    input.connect(out);
    let node: AudioNode = input;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const lg = ctx.createGain();
    lg.gain.value = 600;
    lfo.connect(lg);
    lfo.start();
    for (let i = 0; i < 4; i++) {
      const ap = ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = 1000;
      lg.connect(ap.frequency);
      node.connect(ap);
      node = ap;
    }
    node.connect(out);
    out.connect(this.dest);
    this.phaser = input;
    return input;
  }

  private grain(sp: SpeakerVoice, s: Syl, t: number, phased: boolean): number {
    const v = new Voice(this.k);
    const dur = sp.len * s.stretch;
    const f = sp.f0 * Math.pow(2, (s.semi * sp.range) / 5 / 12);
    const dest = phased ? this.getPhaser() : this.dest;
    const out = v.gain(0, dest);
    if (sp.verb > 0) out.connect(v.gain(sp.verb, this.verb));
    const peak = 0.3 * sp.gain * s.gain * (s.punch ? 1.1 : 1);
    const att = s.onset === 'nasal' || s.onset === 'h' ? 0.018 : s.punch ? 0.003 : 0.008;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(peak, t + att);
    out.gain.setValueAtTime(peak, t + dur * 0.6);
    out.gain.linearRampToValueAtTime(0, t + dur);
    const end = t + dur + 0.02;

    // source with glide + vibrato
    const srcOut = v.gain(1);
    const src = v.osc(sp.wave, f, t, end, srcOut);
    src.frequency.setValueAtTime(f * Math.pow(2, (s.onset === 'nasal' ? -1.5 : 0) / 12), t);
    src.frequency.linearRampToValueAtTime(f * Math.pow(2, sp.glide / 12), t + dur * 0.55);
    src.frequency.linearRampToValueAtTime(f * (s.stretch > 1.4 ? 0.85 : 1), t + dur);
    if (sp.vib[1] > 0) v.osc('sine', sp.vib[0], t, end, v.gain(f * (Math.pow(2, sp.vib[1] / 12) - 1), src.frequency));

    // two formant bandpasses (+ a little body), diphthongs glide between vowels
    const [a1, a2] = FORMANTS[s.v1] ?? FORMANTS.a;
    const [b1, b2] = FORMANTS[s.v2] ?? FORMANTS.a;
    const q = sp.wave === 'sine' ? 3 : 5;
    const comp = sp.wave === 'sine' ? 1.6 : 2.6; // narrow bands lose energy → make up
    for (const [fa, fb, g] of [[a1, b1, 1], [a2, b2, 0.55]] as const) {
      const bp = v.filter('bandpass', fa * sp.fmt, q, v.gain(g * comp, out));
      bp.frequency.setValueAtTime((s.onset === 'nasal' ? fa * 0.6 : fa) * sp.fmt, t);
      bp.frequency.linearRampToValueAtTime(fa * sp.fmt, t + 0.02);
      if (fb !== fa) bp.frequency.linearRampToValueAtTime(fb * sp.fmt, t + dur);
      srcOut.connect(bp);
    }
    srcOut.connect(v.filter('lowpass', 600, 0.7, v.gain(0.25, out)));
    if (sp.breath > 0) {
      const bf = v.filter('bandpass', a2 * sp.fmt, 1.5, v.gain(sp.breath * 0.8, out));
      v.noise(t, end, bf);
    }

    // consonant onset
    const c = s.c0;
    if (s.onset === 'plosive') {
      const g = v.gain(0, out);
      perc(g.gain, t, 0.001, 0.5 * (s.punch ? 1.3 : 1), 0.012);
      v.noise(t, t + 0.025, v.filter('bandpass', (PLOSIVE_HZ[c] ?? 2000) * sp.fmt, 2, g));
    } else if (s.onset === 'fric' || s.onset === 'h') {
      const g = v.gain(0, out);
      perc(g.gain, t, 0.006, s.onset === 'h' ? 0.15 : 0.32, 0.03);
      const hz = /[sz]/.test(c) ? 6500 : /[fv]/.test(c) ? 4000 : /[xj]|c/.test(c) ? 3200 : 1600;
      v.noise(t, t + 0.045, v.filter(s.onset === 'h' ? 'bandpass' : 'highpass', hz, 1, g));
    }
    this.lastGrainEnd = Math.max(this.lastGrainEnd, end);
    return end;
  }
}

export const VOICE_SPEAKERS = Object.keys(V) as Speaker[];
void clamp;
