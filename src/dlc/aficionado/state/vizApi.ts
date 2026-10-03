/**
 * DLC Engineer ↔ Visual Director interface (type-only). The shell discovers viz modules with
 * import.meta.glob and falls back to plain local renderers when a module is missing.
 */
import type { LevelDef, NerdInfo } from '../../../core/contracts';
import type { AfiModuleMeta, AfiVizLayer } from '../contracts';

export interface LoadingCircuit {
  stageStart(i: number): void;
  stageDone(i: number, bytes?: number): void;
  /** real Born samples, one per wire */
  finish(outcomes: (0 | 1)[]): Promise<void> | void;
  destroy(): void;
}
export type CreateLoadingCircuit = (host: HTMLElement, stages: { id: string; label: string }[], opts: { reducedMotion: boolean }) => LoadingCircuit;

export interface Orientation { done: Promise<void>; skip(): void; destroy(): void }
export type PlayOrientation = (host: HTMLElement, opts: { reducedMotion: boolean; webgl: boolean }) => Orientation;

export interface AfiVizInput {
  nerd: NerdInfo;
  /** NerdInfo per trace step (same night), for scrubbing */
  steps: NerdInfo[];
  stepIndex: number;
  level: LevelDef;
  meta: AfiModuleMeta;
  /** visual layers the learner has earned */
  layers: AfiVizLayer[];
  webgl: boolean;
  reducedMotion: boolean;
  /** true during execution: draw the veil (no state data) */
  veiled: boolean;
}
export interface AfiVizHandle { update(input: AfiVizInput): void; destroy(): void }
export type AfiVizMount = (host: HTMLElement, input: AfiVizInput) => AfiVizHandle;

export interface AfiChartPoint { x: number; y: number; lo: number; hi: number; n: number }
export interface AfiChartInput {
  kind: 'mc' | 'sweep';
  series: { label: string; points: AfiChartPoint[] }[];
  xLabel: string;
  yLabel: string;
  reducedMotion: boolean;
}
export interface AfiChartHandle { update(input: AfiChartInput): void; destroy(): void }
export type AfiChartMount = (host: HTMLElement, input: AfiChartInput) => AfiChartHandle;
