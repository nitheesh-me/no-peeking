/** Route that mounts an optional extension (code-split; nothing here but the lazy import call). */
import { MODES } from '../../modes/registry';
import { save } from '../../engine/store';
import { levelDone, unlockAll } from '../unlocks';
import type { Nav } from '../app';

export function afiScreen(root: HTMLElement, nav: Nav): () => void {
  let unmount: (() => void) | undefined, dead = false;
  const mode = MODES[0];
  if (!mode.visible(levelDone, unlockAll())) { setTimeout(() => nav.go('title')); return () => {}; }
  root.style.background = '#070a16';
  mode.load()
    .then((m) => m.mount(root, {
      exit: () => nav.go('title'),
      classicDone: (id) => !!save.progress[id]?.done,
      judgeMode: unlockAll,
      reducedMotion: () => save.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches,
      locale: () => document.documentElement.lang || 'en',
    }))
    .then((u) => { if (dead) u(); else unmount = u; })
    .catch((e) => { console.error(e); if (!dead) nav.go('title'); });
  return () => { dead = true; try { unmount?.(); } catch (e) { console.error(e); } };
}
