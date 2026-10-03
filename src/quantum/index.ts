import type { QuantumAPI } from '../core/contracts';
import { runNight, testLevel } from './vm';
import { parseProgram, printProgram } from './text';

export const quantum: QuantumAPI = {
  runNight: (level, prog, input, errors, seed, opts) => runNight(level, prog, input, errors, seed, { snapshots: true, nerd: !!opts?.nerd }),
  testLevel: (level, prog, seed) => testLevel(level, prog, seed ?? 1, { snapshots: false }),
  parseProgram,
  printProgram,
};
export default quantum;
export { runNight, testLevel, resolveInput, blochOfInput, enumerateErrors, randomErrors, countLines, botsReferenced } from './vm';
export { parseProgram, printProgram, printOp } from './text';
export { QState, makeRng } from './sim';
export { DEFAULT_MIN_FIDELITY, DEFAULT_RATE_MIN_FIDELITY, EMPTY_SNAPSHOT, buildTarget, fidelityTo, snapshot, applyError } from './vm';
export type { RunOptions, NightResultX, Angles, Target } from './vm';
export * as reference from './reference';
export { computeNerd, pauliExpectation, stabilizerSet, NERD_MAX_AMPS, NERD_MI_MAX_LIVE } from './nerd';
export type { NerdInfoX } from './nerd';
export { toQiskit, toOpenQASM3 } from './export';
export type { ExportOptions } from './export';
export { logicalErrorCurve } from './reference';
