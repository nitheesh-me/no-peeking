/**
 * Finds the designer's notebook factory (`createNerdNotebook`) in src/ui/nerd/ without hard-coding its file name,
 * so the level screen builds before/after the notebook lands. (Programmer-owned glue.)
 */
import type { LevelDef, NightResult, Snapshot } from '../../core/contracts';
import type { NerdPageDef, NerdPageId } from './pages';

export interface NerdNotebookUpdate { night: NightResult | null; step: number; snap: Snapshot | null; xray: boolean; lightsOut: boolean }
export interface NerdNotebook {
  update(u: NerdNotebookUpdate): void;
  pulseUnlock?(page: NerdPageId): void;
  /** optional: jump to a page (e.g. 'bloch') focused on a qubit */
  openPage?(page: NerdPageId, qubit?: string): void;
  destroy(): void;
}
export interface NerdNotebookOpts {
  level: LevelDef;
  isUnlocked(page: NerdPageDef | NerdPageId): boolean;
  onDump?(): void;
}
export type CreateNerdNotebook = (host: HTMLElement, opts: NerdNotebookOpts) => NerdNotebook;

const mods = import.meta.glob(['./*.ts', '!./loader.ts', '!./pages.ts'], { eager: true }) as Record<string, Record<string, unknown>>;

export function findCreateNotebook(): CreateNerdNotebook | null {
  for (const m of Object.values(mods)) if (typeof m.createNerdNotebook === 'function') return m.createNerdNotebook as CreateNerdNotebook;
  return null;
}
