/**
 * NO PEEKING! — seeded Monte Carlo over nights, with Wilson 95% intervals (Technical Aficionado Bench / threshold plots).
 * Not imported by the classic bundle. Every trial is one full runNight (exact state vector, Born-sampled measurements).
 */
import type { InputState, LevelDef, NoiseSpec, Program } from '../core/contracts';
import type { McResult } from '../dlc/aficionado/contracts';
import { enumerateErrors, randomErrors, runNight } from './vm';
import { haarAngles, makeRng, mixSeed } from './sim';

/** Wilson score interval for k failures in n trials (z = 1.959964 ⇒ 95%). n = 0 ⇒ [0, 1]. */
export function wilson(k: number, n: number, z = 1.959963984540054): [number, number] {
  if (n <= 0) return [0, 1];
  const p = k / n, z2 = z * z, den = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / den, h = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / den;
  return [k === 0 ? 0 : Math.max(0, c - h), k === n ? 1 : Math.min(1, c + h)];
}

export interface McOptions {
  trials: number;
  seed: number;
  /** noise model for the trials (default level.noise). 'random' samples iid errors; 'enumerate'/'fixed' cycle through their cases. */
  noise?: NoiseSpec;
  /** LISTEN readout-flip probability (default: level / noise setting, else 0) */
  readoutFlip?: number;
  /** inputs to cycle through (default level.inputs; 'random' = Haar, seeded) */
  inputs?: InputState[];
}

/** Logical failure rate of `prog` on `level`: a trial fails iff its night does not pass (fidelity < goal threshold, woke, wrong report, …). */
export function monteCarlo(level: LevelDef, prog: { bedtime?: Program; morning?: Program }, o: McOptions): McResult & { meanFidelity: number } {
  const lvl: LevelDef = o.noise ? { ...level, noise: o.noise } : level;
  const inputs = o.inputs ?? level.inputs;
  const cases = lvl.noise.mode === 'random' ? null : enumerateErrors(lvl);
  let failures = 0, fsum = 0;
  for (let i = 0; i < o.trials; i++) {
    const sd = mixSeed(o.seed, i);
    const nrng = makeRng(mixSeed(sd, 0xabc));
    const inp = inputs[i % inputs.length];
    const input: InputState = inp === 'random' ? { ...haarAngles(nrng) } : inp;
    const errs = cases ? cases[i % cases.length] : randomErrors(lvl, nrng);
    const n = runNight(lvl, prog, input, errs, sd, { snapshots: false, readoutFlip: o.readoutFlip });
    if (!n.pass) failures++;
    fsum += n.fidelity;
  }
  return { trials: o.trials, failures, rate: o.trials ? failures / o.trials : 0, ci95: wilson(failures, o.trials), seed: o.seed, meanFidelity: o.trials ? fsum / o.trials : 0 };
}

export interface SweepOptions {
  /** error kinds (default: level.noise.kinds if any, else ['flip']) */
  kinds?: NoiseSpec extends infer T ? T extends { kinds: infer K } ? K : never : never;
  /** also use p as the LISTEN readout-flip probability (default false) */
  readout?: boolean;
  /** noise rounds per night (default 1) */
  rounds?: number;
}

/** Threshold curve: for each physical p, a Monte Carlo with iid noise of probability p per data qubit (same seed for every p ⇒ common random numbers, smoother curves). */
export function sweep(level: LevelDef, prog: { bedtime?: Program; morning?: Program }, ps: number[], trials: number, seed: number, o: SweepOptions = {}): (McResult & { p: number; meanFidelity: number })[] {
  const kinds = o.kinds ?? ('kinds' in level.noise ? level.noise.kinds : ['flip']);
  return ps.map(p => ({ p, ...monteCarlo(level, prog, { trials, seed, noise: { mode: 'random', p, kinds, rounds: o.rounds }, readoutFlip: o.readout ? p : 0 }) }));
}
