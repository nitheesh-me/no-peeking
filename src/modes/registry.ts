/**
 * Mode registry: the ONLY thing the classic game imports for extensions. Keep it tiny.
 * The DLC itself is code-split and loaded on demand.
 */
import type { DlcModule } from '../dlc/aficionado/contracts';

export interface ModeEntry {
  id: string;
  /** short glyph shown on the title screen once unlocked */
  glyph: string;
  /** whether the entry point should be visible yet */
  visible(classicDone: (id: string) => boolean, judgeMode: boolean): boolean;
  load(): Promise<DlcModule>;
}

export const MODES: ModeEntry[] = [
  {
    id: 'aficionado',
    glyph: '⟨ψ|',
    visible: (done, judge) => judge || ['1-1', '1-2', '1-3', '1-4'].every(done),
    load: () => import('../dlc/aficionado/manifest'),
  },
];
