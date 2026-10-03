/** What every shell view receives. */
import type { AfiLevel, AfiVizLayer, DlcContext } from '../contracts';
import type { AfiModule } from '../state/levels';
import type { AfiSettings } from '../state/store';

export type ViewName = 'orientation' | 'map' | 'briefing' | 'lab' | 'analysis' | 'bench' | 'archive' | 'settings';
export interface ShellApi {
  ctx: DlcContext;
  modules: AfiModule[];
  fallbackLevels: boolean;
  go(view: ViewName, arg?: unknown): void;
  settings(): AfiSettings;
  reduced(): boolean;
  webgl(): boolean;
  judge(): boolean;
  level(id: string): AfiLevel | undefined;
  /** visual layers earned (completed modules' unlocks), plus the current module's own layers */
  layers(current?: AfiLevel): AfiVizLayer[];
  /** re-apply settings classes (lecture, reduced motion) */
  applySettings(): void;
  toast(msg: string, kind?: 'ok' | 'err' | ''): void;
}
export type View = (el: HTMLElement, api: ShellApi, arg?: unknown) => (() => void) | void;
