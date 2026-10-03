import './styles/main.css';
import { art, audio, quantum, LEVELS } from './engine/deps';
import { registerScreen, nav, applySettings, setSettingsOpener, type ScreenName } from './ui/app';
import { titleScreen } from './ui/screens/title';
import { mapScreen } from './ui/screens/map';
import { levelScreen } from './ui/screens/level';
import { creditsScreen } from './ui/screens/credits';
import { labScreen, endlessScreen } from './ui/screens/modes';
import { openSettings } from './ui/settings';
import { afiScreen } from './ui/screens/afi';

registerScreen('title', titleScreen);
registerScreen('map', mapScreen);
registerScreen('level', levelScreen);
registerScreen('credits', creditsScreen);
registerScreen('lab', labScreen);
registerScreen('endless', endlessScreen);
// the Codex is a route-level chunk (with its 3D Bloch widget), fetched on first visit
registerScreen('codex', (root, n) => {
  let off: (() => void) | void, dead = false;
  import('./ui/screens/codex').then((m) => { if (!dead) off = m.codexScreen(root, n); }, (e) => { console.error(e); if (!dead) n.go('title'); });
  return () => { dead = true; off?.(); };
});
registerScreen('afi', afiScreen);
setSettingsOpener(openSettings);

// audio must be unlocked by a user gesture
const unlock = () => { void audio.unlock(); };
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });
// tiny UI click sound on every button
document.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest?.('.btn')) audio.sfx('ui_click', { volume: 0.5 }); }, true);

function route() {
  const m = /^#(\w+)(?:\/(.+))?$/.exec(location.hash);
  const name = (m?.[1] ?? 'title') as ScreenName;
  const ok: ScreenName[] = ['title', 'map', 'level', 'credits', 'lab', 'endless', 'codex', 'afi'];
  nav.go(ok.includes(name) ? name : 'title', name === 'level' ? m?.[2] : undefined);
}

// QA hook for automated playthroughs (?qa)
if (import.meta.env.DEV || location.search.includes('qa')) (window as unknown as Record<string, unknown>).__np = { LEVELS, quantum };
window.addEventListener('hashchange', route);
applySettings();
art.ready().catch(() => {}).finally(route);
