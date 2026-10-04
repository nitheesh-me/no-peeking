// "Letter units": a real Qubble (drawQubble, on its bed) with a Quantum letter riding on top, exactly
// like the game's title screen, plus squash/stretch about the bed.
import art from '../../../../src/art';
import type { Bloch, QubbleVisual } from '../../../../src/core/contracts';
import { type Ctx, PAL } from './core';

export interface UnitOpts {
  t: number; phase: number;
  /** null = dreaming (swirl); 0 = collapsed Sunny; 1 = collapsed Moony */
  collapsed?: 0 | 1 | null;
  state?: QubbleVisual['state'];
  sx?: number; sy?: number; jx?: number;
  letterColor?: string; letterScale?: number; letterAlpha?: number; alpha?: number;
  /** extra swirl spin speed multiplier */
  spin?: number;
  blanket?: number;
  bloch?: Bloch;
}

export function swirlBloch(t: number, phase: number, spin = 1): Bloch {
  const a = t * 1.3 * spin + phase;
  return { x: Math.cos(a), y: Math.sin(a), z: Math.sin(t * 0.7 + phase) * 0.25 };
}

/** Draw a unit with its bed centre at (x, gy). S = qubble scale. */
export function drawUnit(ctx: Ctx, x: number, gy: number, S: number, ch: string, o: UnitOpts) {
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.translate(x + (o.jx ?? 0), gy);
  ctx.scale(o.sx ?? 1, o.sy ?? 1);
  ctx.translate(-x, -gy);
  const bloch = o.bloch ?? (o.collapsed == null ? swirlBloch(o.t, o.phase, o.spin) : { x: 0, y: 0, z: o.collapsed ? -1 : 1 });
  const state = o.state ?? (o.collapsed == null ? 'sleep' : 'collapsed');
  art.drawQubble(ctx, x, gy, S, { bloch, blanket: o.blanket ?? 0, state }, o.t);
  if (ch && ch !== ' ') {
    const ls = o.letterScale ?? 1;
    const size = 44 * S * ls;
    const ly = gy - 52.7 * S;
    ctx.save();
    ctx.globalAlpha *= o.letterAlpha ?? 1;
    ctx.font = `${Math.round(size)}px Quantum`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.lineWidth = 5.45 * S * ls; ctx.strokeStyle = PAL.paper;
    ctx.strokeText(ch, x, ly);
    ctx.fillStyle = o.letterColor ?? (o.collapsed == null ? PAL.ink : o.collapsed ? PAL.moony : '#ff9a00');
    ctx.fillText(ch, x, ly);
    ctx.restore();
  }
  ctx.restore();
}

/** Where the unit's letter sits (for handing it over to the wordmark). */
export function unitLetterPos(x: number, gy: number, S: number) {
  return { x, y: gy - 52.7 * S - 44 * S * 0.36, size: 44 * S };
}
