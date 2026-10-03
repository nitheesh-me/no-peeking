/**
 * Curriculum wiring. The Curriculum Author's `levels/index.ts` (export const MODULES: AfiLevel[]) is
 * discovered at build time; until it lands, a fallback curriculum is assembled from classic levels
 * (same physics, the DLC shows none of the classic dialogue).
 */
import { LEVELS } from '../../../levels/index';
import type { AfiLevel, AfiModuleMeta } from '../contracts';

export interface CurriculumApi {
  MODULES?: AfiLevel[];
  default?: AfiLevel[];
  /** variables for the success-criterion sentence (Curriculum Author) */
  criterionVars?: (level: AfiLevel['def'], prog?: AfiLevel['def']['solution']) => Record<string, string | number>;
}
const SRC = import.meta.glob<CurriculumApi>('../levels/index.ts');
let api: CurriculumApi | null = null;
/** the loaded curriculum module (null for the fallback curriculum) */
export const curriculum = (): CurriculumApi | null => api;

export interface AfiModule { id: string; meta: AfiModuleMeta; levels: AfiLevel[] }

const FALLBACK: [string, string[], Partial<AfiModuleMeta>][] = [
  ['M0', ['1-1', '1-2'], { unlocks: ['bloch'] }],
  ['M1', ['1-3', '1-4'], { unlocks: ['filaments'] }],
  ['M2', ['2-1'], {}],
  ['M3', ['2-3', '2-4', '2-5'], { code: { n: 3, k: 1, d: 1, name: 'bit-flip' }, stabilizers: ['ZZI', 'IZZ'], logicals: { X: 'XXX', Z: 'ZII' }, unlocks: ['stabilizer-tiling'] }],
  ['M4', ['3-1', '3-2'], { stabilizers: ['XXI', 'IXX'] }],
  ['M5', ['3-3'], { unlocks: ['projection-freeze'] }],
  ['M6', ['4-1'], { code: { n: 9, k: 1, d: 3, name: 'Shor' }, unlocks: ['concatenation'] }],
];

function fallback(): AfiLevel[] {
  const out: AfiLevel[] = [];
  FALLBACK.forEach(([id, ids, extra], i) => {
    const meta: AfiModuleMeta = { id, levelIds: ids, objectives: [], requires: i ? [FALLBACK[i - 1][0]] : [], ...extra };
    for (const lid of ids) { const def = LEVELS.find((l) => l.id === lid); if (def) out.push({ def, meta }); }
  });
  return out;
}

export function groupModules(levels: AfiLevel[]): AfiModule[] {
  const by = new Map<string, AfiModule>();
  for (const l of levels) {
    const m = by.get(l.meta.id) ?? { id: l.meta.id, meta: l.meta, levels: [] };
    m.levels.push(l); by.set(l.meta.id, m);
  }
  return [...by.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Loads the curriculum (real dynamic import). Returns modules + approximate byte size + whether it is the fallback. */
export async function loadLevels(): Promise<{ modules: AfiModule[]; bytes: number; fallback: boolean }> {
  const f = SRC['../levels/index.ts'];
  if (f) {
    try {
      const m = await f();
      const list = m.MODULES ?? m.default;
      api = m;
      if (Array.isArray(list) && list.length) return { modules: groupModules(list), bytes: JSON.stringify(list).length, fallback: false };
    } catch (e) { console.warn('[afi] levels/index.ts failed to load, using fallback curriculum', e); }
  }
  const list = fallback();
  return { modules: groupModules(list), bytes: JSON.stringify(list).length, fallback: true };
}

/** Module completion / gating. Judge mode unlocks everything. */
export function moduleDone(m: AfiModule, done: Record<string, boolean>): boolean {
  return m.levels.length > 0 && m.levels.every((l) => done[l.def.id]);
}
export function moduleOpen(m: AfiModule, all: AfiModule[], done: Record<string, boolean>, judge: boolean): boolean {
  if (judge) return true;
  return (m.meta.requires ?? []).every((rid) => { const r = all.find((x) => x.id === rid); return !r || moduleDone(r, done); });
}
