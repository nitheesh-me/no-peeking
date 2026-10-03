/** Single import point for teammate modules (engine/ui import quantum/art/audio/levels from here). */
export { quantum } from '../quantum/index';
export { art } from '../art/index';
export { audio } from '../audio/index';
export { LEVELS, CHAPTERS, getLevel } from '../levels/index';
/** Art extras outside the contract (feature-detected; may be absent). */
import * as artIndex from '../art/index';
export const artExtra = artIndex as unknown as {
  drawCatBox?(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void;
  wallSignSlots?(cols: number, rows: number): { wall: 'left' | 'right'; gx: number; gy: number; gz: number; spanTiles: [number, number] }[];
};
