/** DLC persistence: its own `np.afi.*` namespace, every access wrapped (private mode, quota, corrupt JSON). */
import type { ErrorEvent, InputState, NoiseSpec, Program } from '../../../core/contracts';
import type { McResult } from '../contracts';

export interface AfiSettings {
  locale: string;
  theme: string;
  lecture: boolean;
  reducedMotion: boolean | null; // null = follow the classic setting / OS
  webgl: boolean;
  skipLoader: boolean;
  /** Bench: last base level */
  benchLevel?: string;
}
export interface AfiRun {
  id: string;
  at: number;
  levelId: string;
  kind: 'single' | 'mc' | 'sweep';
  seed: number;
  program: { bedtime?: Program; morning?: Program };
  pass?: boolean;
  fidelity?: number;
  mc?: McResult;
  sweep?: { p: number; mc: McResult }[];
  /** human-readable noise summary */
  noise?: string;
  /** exact noise spec used (Bench overrides the level's) */
  noiseSpec?: NoiseSpec;
  /** single runs: exact input and error events (replayable with the seed) */
  input?: InputState;
  errors?: ErrorEvent[];
  gates: number;
  depth: number;
  ancillas: number;
}

const P = 'np.afi.';
function read<T>(k: string, d: T): T {
  try { const s = localStorage.getItem(P + k); return s == null ? d : (JSON.parse(s) as T); } catch { return d; }
}
function write(k: string, v: unknown): void {
  try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { /* private mode / quota */ }
}

const DEFAULT_SETTINGS: AfiSettings = { locale: 'en', theme: 'default', lecture: false, reducedMotion: null, webgl: true, skipLoader: false };

export const afiStore = {
  settings(): AfiSettings { return { ...DEFAULT_SETTINGS, ...read<Partial<AfiSettings>>('settings', {}) }; },
  setSettings(p: Partial<AfiSettings>): AfiSettings { const s = { ...afiStore.settings(), ...p }; write('settings', s); return s; },
  flag(k: string): boolean { return !!read<Record<string, boolean>>('flags', {})[k]; },
  setFlag(k: string, v = true): void { const f = read<Record<string, boolean>>('flags', {}); f[k] = v; write('flags', f); },
  completed(): Record<string, boolean> { return read<Record<string, boolean>>('done', {}); },
  complete(levelId: string): void { const d = afiStore.completed(); d[levelId] = true; write('done', d); },
  program(levelId: string): { bedtime?: Program; morning?: Program } | null { return read<Record<string, { bedtime?: Program; morning?: Program }>>('programs', {})[levelId] ?? null; },
  setProgram(levelId: string, p: { bedtime?: Program; morning?: Program }): void {
    const all = read<Record<string, { bedtime?: Program; morning?: Program }>>('programs', {}); all[levelId] = p; write('programs', all);
  },
  runs(): AfiRun[] { return read<AfiRun[]>('runs', []); },
  addRun(r: AfiRun): void { const rs = [r, ...afiStore.runs()].slice(0, 200); write('runs', rs); },
  clearRuns(): void { write('runs', []); },
};
