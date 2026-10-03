/**
 * Technical Aficionado DLC: shared contracts (Director-owned). See docs/AFICIONADO.md.
 * Everything here is type-only or tiny so the classic bundle never pays for the DLC.
 */
import type { BotId, LevelDef, NightResult, Program, QubitId } from '../../core/contracts';

/** Context the classic app hands to the DLC when mounting it. */
export interface DlcContext {
  /** go back to the classic title screen (unmounts the DLC) */
  exit(): void;
  /** read-only view of classic progress, for unlock gating */
  classicDone(levelId: string): boolean;
  judgeMode(): boolean;
  reducedMotion(): boolean;
  locale(): string;
}

/** The dynamically imported manifest's shape. */
export interface DlcModule {
  mount(root: HTMLElement, ctx: DlcContext): Promise<() => void>;
}

/** One real loading stage (the loading bar shows real stages, never fake percentages). */
export interface LoadStage {
  id: 'core' | 'three' | 'd3' | 'assets' | 'content' | 'levels' | string;
  label: string;           // content-pack key or literal
  run(): Promise<{ bytes?: number }>;
}

/** Extra metadata for a DLC module (side table next to its LevelDef). */
export interface AfiModuleMeta {
  id: string;              // 'M3'
  levelIds: string[];      // LevelDef ids that belong to this module
  code?: { n: number; k: number; d: number; name: string };
  stabilizers?: string[];  // e.g. ['ZZI', 'IZZ'] in data-qubit order
  logicals?: { X: string; Z: string };
  objectives: string[];    // content-pack keys
  unlocks?: AfiVizLayer[]; // visual layers revealed on completion
  requires?: string[];     // module ids that must be complete first
}

export type AfiVizLayer = 'bloch' | 'filaments' | 'stabilizer-tiling' | 'projection-freeze' | 'concatenation' | 'lattice' | 'threshold';

/** Monte Carlo result with an honest confidence interval. */
export interface McResult {
  trials: number;
  failures: number;
  rate: number;            // failures / trials
  ci95: [number, number];  // Wilson score interval
  seed: number;
}

/** A level as the DLC sees it. */
export interface AfiLevel { def: LevelDef; meta: AfiModuleMeta }

/** Program representation is the shared Bot Code Op[]; the DLC editor renders it as a circuit. */
export type AfiProgram = { bedtime?: Program; morning?: Program };
export type { BotId, NightResult, QubitId };
