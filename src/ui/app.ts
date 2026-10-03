/**
 * Screen router. A screen is a function that renders into a root element and returns a cleanup fn.
 * Add a screen: write `src/ui/screens/foo.ts` exporting `(root, nav, arg) => cleanup`, then register it below.
 */
import { audio } from '../engine/deps';
import { save, persist } from '../engine/store';

export type ScreenName = 'title' | 'map' | 'level' | 'credits' | 'lab' | 'endless';
export interface Nav { go(name: ScreenName, arg?: unknown): void; settings(): void }
export type ScreenFn = (root: HTMLElement, nav: Nav, arg?: unknown) => (() => void) | void;

const registry = new Map<ScreenName, ScreenFn>();
export function registerScreen(name: ScreenName, fn: ScreenFn): void { registry.set(name, fn); }

let cleanup: (() => void) | void;
let settingsFn: () => void = () => {};
export function setSettingsOpener(f: () => void): void { settingsFn = f; }

export const nav: Nav = {
  go(name, arg) {
    try { cleanup?.(); } catch (e) { console.error(e); }
    cleanup = undefined;
    const app = document.getElementById('app')!;
    app.innerHTML = '';
    document.querySelectorAll('.popover, .modal-back, .card.ghost, .toast, .clone-glitch').forEach((n) => n.remove());
    const fn = registry.get(name);
    if (!fn) throw new Error(`no screen ${name}`);
    const root = document.createElement('div');
    root.className = `screen ${name}-screen`;
    app.appendChild(root);
    cleanup = fn(root, nav, arg);
    const hash = name === 'level' && typeof arg === 'string' ? `#level/${arg}` : `#${name}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  },
  settings() { settingsFn(); },
};

export function applySettings(): void {
  const s = save.settings;
  audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
  document.documentElement.classList.toggle('reduced', s.reducedMotion);
  persist();
}
