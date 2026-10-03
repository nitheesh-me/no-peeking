/**
 * Structural subset of the DLC Engineer's AfiVizInput (src/dlc/aficionado/state/vizApi.ts) that the viz modules read.
 * Kept structural so this folder compiles on its own; AfiVizInput is assignable to it.
 */
import type { NerdInfo, LevelDef } from '../../../core/contracts';
import type { AfiModuleMeta, AfiVizLayer } from '../contracts';

export interface VizInputLike {
  nerd: NerdInfo;
  steps?: NerdInfo[];
  stepIndex?: number;
  level?: LevelDef;
  meta?: AfiModuleMeta;
  layers?: AfiVizLayer[];
  webgl?: boolean;
  reducedMotion?: boolean;
  veiled?: boolean;
}
