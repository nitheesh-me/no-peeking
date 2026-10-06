/**
 * Finds the designer's notebook factory (`createNerdNotebook`) in src/ui/nerd/ without hard-coding its file name,
 * so the level screen builds before/after the notebook lands. (Programmer-owned glue.)
 */
import type { LevelDef, NightResult, Snapshot, Program, Phase } from '../../core/contracts';
import type { NerdPageDef, NerdPageId } from './pages';

export interface NerdNotebookUpdate {
  night: NightResult | null; step: number; snap: Snapshot | null; xray: boolean; lightsOut: boolean;
  /** which night of the last test report is on screen (1-based), of how many (Director decision 4) */
  nightIndex?: number; nightCount?: number;
  /** the nights of the last Test all (Threshold page) */
  report?: NightResult[] | null;
}
/** a program line (same shape as Playback's LineRef) */
export interface NerdLineRef { phase: Phase; part: 'fixed' | 'mine'; pc: number }
/** column = docked in the nerd bench (lg/xl/md) · sheet = bottom-sheet swap (sm) · overlay = the old .nerd-host (cinema) */
export type NerdNotebookMode = 'column' | 'sheet' | 'overlay';
export interface NerdNotebook {
  update(u: NerdNotebookUpdate): void;
  pulseUnlock?(page: NerdPageId): void;
  /** optional: jump to a page (e.g. 'bloch') focused on a qubit */
  openPage?(page: NerdPageId, focus?: { qubit?: string }): void;
  setMode?(mode: NerdNotebookMode): void;
  isOpen?(): boolean;
  /** set the open state without firing onOpenChange */
  setOpen?(open: boolean): void;
  /** card ↔ gate link: highlight the circuit column(s) of this program line (null = clear) */
  highlightLine?(ref: NerdLineRef | null): void;
  destroy(): void;
}
export interface NerdNotebookOpts {
  level: LevelDef;
  isUnlocked(page: NerdPageDef | NerdPageId): boolean;
  onDump?(): void;
  /** the player's current program (Export page: dynamic circuit) */
  prog?(): { bedtime?: Program; morning?: Program } | undefined;
  mode?: NerdNotebookMode;
  /** open state when np.nb.open was never written */
  defaultOpen?: boolean;
  /** the player opened / closed the book (column), or asked to see it (sheet: open = true) */
  onOpenChange?(open: boolean): void;
  /** sheet mode: × / Esc = back to the code tab */
  onSheetClose?(): void;
  /** may Esc close the book now? (bench md/sm) */
  escCloses?(): boolean;
  /** card ↔ gate link: the pointer is over the gate(s) of this program line (null = left) */
  onGateHover?(ref: NerdLineRef | null): void;
  /** run a layout-changing DOM update inside the bench's transition */
  transition?(kind: string, mutate: () => void): void;
}
export type CreateNerdNotebook = (host: HTMLElement, opts: NerdNotebookOpts) => NerdNotebook;

const mods = import.meta.glob(['./*.ts', '!./loader.ts', '!./pages.ts'], { eager: true }) as Record<string, Record<string, unknown>>;

export function findCreateNotebook(): CreateNerdNotebook | null {
  for (const m of Object.values(mods)) if (typeof m.createNerdNotebook === 'function') return m.createNerdNotebook as CreateNerdNotebook;
  return null;
}
