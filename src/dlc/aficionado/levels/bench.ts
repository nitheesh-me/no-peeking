/**
 * Bench tasks (sandbox labs). The Bench itself is the DLC Engineer's; these are the guided tasks it can offer.
 * Every number the task asks for comes from seeded Monte Carlo over the real simulator.
 */
export interface AfiBenchTask {
  id: string;
  /** content keys: afi.bench.tasks.<id>.title|brief|criterion|analysis */
  key: string;
  /** level whose program/code the sweep uses */
  levelId: string;
  noise: { kinds: ('flip' | 'phase' | 'both')[]; readoutFlip?: number };
  ps: number[];
  trials: number;
  seed: number;
  /** analytic reference curve for the code-capacity model, if one exists (p → p_L) */
  theory?: 'rep3' ;
  /** module that must be complete before the task is offered */
  requires: string[];
}

export const AFI_BENCH_TASKS: AfiBenchTask[] = [
  { id: 'pseudothreshold', key: 'afi.bench.tasks.pseudothreshold', levelId: 'M3-3', noise: { kinds: ['flip'] },
    ps: [0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], trials: 2000, seed: 1, theory: 'rep3', requires: ['M3'] },
  { id: 'readout', key: 'afi.bench.tasks.readout', levelId: 'M7-2', noise: { kinds: ['flip'], readoutFlip: 0.04 },
    ps: [0.01, 0.02, 0.05, 0.1], trials: 2000, seed: 1, requires: ['M7'] },
  { id: 'surface', key: 'afi.bench.tasks.surface', levelId: 'M9-2', noise: { kinds: ['flip', 'phase', 'both'] },
    ps: [0.005, 0.01, 0.02, 0.05, 0.1], trials: 2000, seed: 1, requires: ['M9'] },
];

/** 95% Wilson score interval for k failures in n trials. */
export function wilson(k: number, n: number, z = 1.959964): [number, number] {
  if (n === 0) return [0, 1];
  const ph = k / n, z2 = z * z, den = 1 + z2 / n;
  const c = (ph + z2 / (2 * n)) / den;
  const h = (z / den) * Math.sqrt((ph * (1 - ph)) / n + z2 / (4 * n * n));
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
