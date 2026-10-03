/** Fullscreen toggle: a small icon button for top bars / the title corner, plus helpers for Settings. */
import { h, toast } from '../engine/util';

const ENTER = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const EXIT = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const fsSupported = (): boolean => !!document.documentElement.requestFullscreen;
export const isFullscreen = (): boolean => !!document.fullscreenElement;

export async function setFullscreen(on: boolean): Promise<void> {
  try {
    if (on && !isFullscreen()) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    else if (!on && isFullscreen()) await document.exitFullscreen();
  } catch {
    toast('Fullscreen is blocked here. Try your browser menu (F11).', 'bad');
  }
}
export const toggleFullscreen = (): Promise<void> => setFullscreen(!isFullscreen());

/** Icon button that keeps its icon/label in sync with the real fullscreen state. */
export function fullscreenButton(cls = 'btn icon small'): HTMLElement {
  const b = h('button', { class: `${cls} fs-btn`, type: 'button' });
  const sync = () => {
    const on = isFullscreen();
    b.innerHTML = on ? EXIT : ENTER;
    b.title = on ? 'Exit fullscreen' : 'Fullscreen';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(on));
  };
  b.addEventListener('click', () => { void toggleFullscreen(); });
  document.addEventListener('fullscreenchange', sync);
  sync();
  if (!fsSupported()) b.classList.add('hidden');
  return b;
}
