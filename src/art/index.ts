// NO PEEKING! art kit — procedural Canvas2D. See docs/ART_NOTES.md for sizes, anchors and the Bloch→colour rules.
import { PALETTE, type ArtAPI } from '../core/contracts';
import { drawQubble, drawBed } from './qubble';
import { drawBot } from './bot';
import { drawGremlin } from './gremlins';
import { drawSchrodi, drawSchrodiActor } from './schrodi';
import { drawFloor, drawBackground, drawLink, drawSign } from './world';
import { burst, drawParticles, clearParticles, particleCount } from './particles';
import { portrait, dataBoxPortrait } from './portraits';
import { drawRoom, drawWallSign, wallSignSlots, SIGN_BAND } from './room';
import { drawCaretaker } from './caretaker';
import { drawMapBackdrop, drawMapIsland, drawMapNode, drawMapPath } from './map';

async function loadFonts() {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    const base = (import.meta as any).env?.BASE_URL ?? './';
    const faces = [
      new FontFace('Quicksand', `url(${base}fonts/Quicksand.woff2)`, { weight: '300 700' }),
      new FontFace('Quantum', `url(${base}fonts/Quantum.woff2)`),
    ];
    await Promise.all(faces.map(async (f) => {
      const already = [...document.fonts].some((d) => d.family.replace(/"/g, '') === f.family && d.status === 'loaded');
      if (already) return;
      document.fonts.add(await f.load());
    }));
  } catch {
    /* fonts are a nicety; canvas falls back to sans-serif */
  }
}

export const art: ArtAPI = {
  ready: loadFonts,
  drawFloor,
  drawBackground,
  drawQubble,
  drawBot,
  drawGremlin,
  drawSchrodi,
  drawLink,
  drawSign,
  drawParticles,
  burst,
  portrait,
  palette: { ...PALETTE },
  drawRoom,
  drawCaretaker,
  drawMapBackdrop,
  drawMapIsland,
  drawMapNode,
  drawMapPath,
  drawWallSign,
  drawSchrodiActor,
};

/** Extras outside the contract (optional to use). */
export type { QubbleArm } from './qubble';
export { dataBoxPortrait };
export { drawSilhouette, drawProp, drawGlyph, drawCodexCard, codexCardSVG, SHOWCASE, showcasePhase } from './codex';
export type { PropKind, GlyphKind } from './codex';
export { drawQuilt } from './qubble';
export { drawCatBox } from './schrodi';
export { drawDataBox } from './qubble';
export { drawBed, clearParticles, particleCount, wallSignSlots, SIGN_BAND };
export type { WallSlot } from './room';
export const LOGO_URL = 'art/logo.svg';
export const FAVICON_URL = 'art/favicon.svg';
export default art;
