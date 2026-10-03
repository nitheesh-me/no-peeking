/**
 * Technical Aficionado curriculum entry (Curriculum Author).
 * - AFI_LEVELS: LevelDef[] (ids 'M0-1' … 'M9-2'); every text field is a content-pack key: resolve with t().
 * - AFI_MODULES: AfiModuleMeta[] (M0 … M9).
 * - MODULES: AfiLevel[] (def + meta pairs), the shape the shell's loader consumes.
 * - afiKeys(levelId) / criterionVars(level) for the briefing copy.
 */
import type { InputState, LevelDef, Program } from '../../../core/contracts';
import type { AfiLevel, AfiModuleMeta } from '../contracts';
import { enumerateErrors, listenSlots } from '../../../quantum/vm';
import { AFI_LEVELS, AFI_MODULES } from './modules';

export { AFI_LEVELS, AFI_MODULES };
export { AFI_BENCH_TASKS, wilson } from './bench';
export type { AfiBenchTask } from './bench';

export const MODULES: AfiLevel[] = AFI_MODULES.flatMap((meta) =>
  meta.levelIds.map((id) => ({ def: AFI_LEVELS.find((l) => l.id === id)!, meta })),
);
export default MODULES;

export const moduleOf = (levelId: string): AfiModuleMeta | undefined => AFI_MODULES.find((m) => m.levelIds.includes(levelId));

/** Content keys for one exercise (all under afi.modules.<M>.ex.<levelId>.*). */
export function afiKeys(levelId: string) {
  const m = levelId.split('-')[0];
  const b = `afi.modules.${m}.ex.${levelId}`;
  return {
    module: `afi.modules.${m}`,
    title: `${b}.title`, subtitle: `${b}.subtitle`, term: `${b}.term`, reveal: `${b}.reveal`,
    briefing: {
      objective: `${b}.briefing.objective`, context: `${b}.briefing.context`, code: `${b}.briefing.code`,
      noise: `${b}.briefing.noise`, gates: `${b}.briefing.gates`, criterion: `${b}.briefing.criterion`,
    },
    analysis: `${b}.analysis`,
  };
}

const expanded = (inputs: InputState[]) => inputs.reduce((n, i) => n + (i === 'random' ? 4 : 1), 0);

/**
 * Variables for the success-criterion sentence, computed from the level itself so the copy can never drift:
 * {trials} {inputs} {cases} {readout} {nights} {minRate} {p} {q} {minF}. `prog` (default: the reference solution)
 * matters only for readout-fault enumeration, which tests every LISTEN slot of the program.
 */
export function criterionVars(level: LevelDef, prog: { bedtime?: Program; morning?: Program } = level.solution): Record<string, string | number> {
  const g = level.goal;
  const minF = 'minFidelity' in g && g.minFidelity ? g.minFidelity : g.kind === 'rate' ? 0.99 : 0.999;
  const n = level.noise;
  if (g.kind === 'rate') {
    const p = n.mode === 'random' ? n.p : 0, q = n.mode === 'random' ? n.readoutFlip ?? 0 : 0;
    // bare: failure probability of an unencoded qubit stored (flip p) and read once (flip q)
    return { nights: g.nights, minRate: g.minRate, maxFail: +(1 - g.minRate).toFixed(3), p, q, bare: +(p + q - 2 * p * q).toFixed(4), minF };
  }
  const inputs = expanded(level.inputs);
  const cases = n.mode === 'enumerate' ? enumerateErrors(level).length : n.mode === 'random' ? 8 : 1;
  const readout = n.mode === 'enumerate' && n.readout ? listenSlots(level, prog).length : 0;
  return { trials: inputs * (cases + readout), inputs, cases, readout, minF };
}
