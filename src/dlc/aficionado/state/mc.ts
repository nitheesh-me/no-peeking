/**
 * Monte Carlo over seeded nights with a Wilson 95 % interval. Trial i is generated exactly as the Quantum
 * Expert's engine helper does it (src/quantum/montecarlo.ts → monteCarlo(level, prog, { trials, seed })), so
 * the numbers are identical (tested); this version only yields to the UI between slices and reports progress.
 */
import type { GremlinKind, LevelDef, Program } from '../../../core/contracts';
import { monteCarlo as mcEngine, wilson as wilsonEngine } from '../../../quantum/montecarlo';
import * as Q from '../../../quantum/index';
import { haarAngles, makeRng, mixSeed } from '../../../quantum/sim';
import type { ErrorEvent, InputState } from '../../../core/contracts';
import type { McResult } from '../contracts';

export type Prog = { bedtime?: Program; morning?: Program };
export const SLICE = 50;
export const wilson = (failures: number, n: number): [number, number] => wilsonEngine(failures, n);

/** Level with its noise replaced by iid noise of strength p (Bench); readout flip q optional. */
export function withNoise(level: LevelDef, p: number, kinds: GremlinKind[], readoutFlip = 0): LevelDef {
  return { ...level, noise: { mode: 'random', p, kinds, ...(readoutFlip ? { readoutFlip } : {}) } };
}

/** One seeded trial's input and errors (Run: a single night). */
export function trialCase(level: LevelDef, seed: number, i: number): { seed: number; input: InputState; errors: ErrorEvent[] } {
  const sd = mixSeed(seed, i);
  const rng = makeRng(mixSeed(sd, 0xabc));
  const inp = level.inputs[i % level.inputs.length] ?? 'zero';
  const input: InputState = inp === 'random' ? { ...haarAngles(rng) } : inp;
  let errors: ErrorEvent[] = [];
  if (level.noise.mode === 'random') errors = Q.randomErrors(level, rng);
  else if (level.noise.mode === 'fixed') errors = level.noise.errors;
  else if (level.noise.mode === 'enumerate') { const cases = Q.enumerateErrors(level); errors = cases[Math.floor(rng() * cases.length)] ?? []; }
  return { seed: sd, input, errors };
}

export async function monteCarlo(level: LevelDef, prog: Prog, trials: number, seed: number,
  onProgress?: (done: number, failures: number) => void, signal?: { aborted: boolean }): Promise<McResult> {
  const cases = level.noise.mode === 'random' ? null : Q.enumerateErrors(level);
  let failures = 0, i = 0;
  while (i < trials && !signal?.aborted) {
    const end = Math.min(trials, i + SLICE);
    for (; i < end; i++) {
      const sd = mixSeed(seed, i);
      const nrng = makeRng(mixSeed(sd, 0xabc));
      const inp = level.inputs[i % level.inputs.length];
      const input: InputState = inp === 'random' ? { ...haarAngles(nrng) } : inp;
      const errs = cases ? cases[i % cases.length] : Q.randomErrors(level, nrng);
      if (!Q.runNight(level, prog, input, errs, sd, { snapshots: false }).pass) failures++;
    }
    onProgress?.(i, failures);
    await new Promise((res) => setTimeout(res, 0));
  }
  return { trials: i, failures, rate: i ? failures / i : 0, ci95: wilson(failures, i), seed };
}
/** the engine's synchronous helper, re-exported for tests and small runs */
export { mcEngine };
