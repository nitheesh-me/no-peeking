/** Level map: chapters as floating islands. Includes the 'map-flip' meta beat (syndrome decoding in the menu). */
import { LEVELS, CHAPTERS, audio } from '../../engine/deps';
import { save, persist } from '../../engine/store';
import { h, toast } from '../../engine/util';
import type { Nav } from '../app';
import { openNightLab } from '../nightLab';

export function isUnlocked(id: string): boolean {
  const i = LEVELS.findIndex((l) => l.id === id);
  if (i <= 0) return true;
  if (save.flags.unlockAll) return true;
  return !!save.progress[LEVELS[i - 1].id]?.done || !!save.progress[id]?.done;
}

export function mapScreen(root: HTMLElement, nav: Nav): () => void {
  const scroll = h('div', { class: 'map-scroll' });
  const done = LEVELS.filter((l) => save.progress[l.id]?.done).length;
  const stars = LEVELS.reduce((s, l) => s + (save.progress[l.id]?.stars.filter(Boolean).length ?? 0), 0);
  root.append(
    h('div', { class: 'topbar' },
      h('button', { class: 'btn small', onclick: () => nav.go('title') }, '◂ Title'),
      h('div', { class: 'title' }, 'The Qubble Daycare'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'tag' }, `${done}/${LEVELS.length} nights`), h('span', { class: 'tag' }, `★ ${stars}`),
      h('button', { class: 'btn icon small', title: 'Settings', onclick: () => nav.settings() }, '⚙')),
    scroll,
  );

  // map-flip beat: after Chapter 1 is finished, Flipper hits the map once.
  const ch1 = LEVELS.filter((l) => l.chapter === 1);
  const flipActive = ch1.length >= 3 && ch1.every((l) => save.progress[l.id]?.done) && !save.flags.mapFlipDone;
  const flipTiles = flipActive ? ch1.slice(0, 3).map((l) => l.id) : [];
  const flipped = flipActive ? (save.flags.mapFlipIdx1 ? 1 : save.flags.mapFlipIdx2 ? 2 : 0) : -1;
  if (flipActive && !('mapFlipIdx0' in save.flags)) {
    const r = Math.floor(Math.random() * 3);
    save.flags.mapFlipIdx0 = r === 0; save.flags.mapFlipIdx1 = r === 1; save.flags.mapFlipIdx2 = r === 2; persist();
    nav.go('map'); return () => {};
  }

  if (flipActive) {
    const s1 = flipped === 0 || flipped === 1, s2 = flipped === 1 || flipped === 2;
    scroll.appendChild(h('div', { class: 'mapflip-banner panel' },
      h('div', { style: 'font-size:34px' }, '😈'),
      h('div', null,
        h('div', { class: 'ttl' }, 'Flipper got into the map!'),
        h('div', { style: 'font-size:14px' }, 'One of the three blanketed tiles got flipped. Don\'t peek under the blankets: the two map-bots compare neighbours. Tap the tile the syndrome points to.'),
        h('div', { class: 'mapflip-row', style: 'margin-top:8px' },
          h('span', { class: 'tag' }, `${flipTiles[0]} vs ${flipTiles[1]}`), h('div', { class: `mapbot ${s1 ? 'beep' : ''}` }),
          h('span', { class: 'tag' }, `${flipTiles[1]} vs ${flipTiles[2]}`), h('div', { class: `mapbot ${s2 ? 'beep' : ''}` })))));
    setTimeout(() => audio.sfx('gremlin_flip'), 300);
  }

  const grid = h('div', { class: 'map-grid' });
  const firstOpen = LEVELS.find((l) => !save.progress[l.id]?.done && isUnlocked(l.id));
  for (const ch of CHAPTERS) {
    const lvls = LEVELS.filter((l) => l.chapter === ch.id);
    if (!lvls.length) continue;
    const locked = !isUnlocked(lvls[0].id);
    const island = h('div', { class: `island ${locked ? 'locked' : ''}`, style: locked ? '' : `background:linear-gradient(180deg,#fff 60%, ${ch.color}22)` },
      h('div', { class: 'island-num' }, `Chapter ${ch.id}`),
      h('div', { class: 'island-name' }, ch.title),
      h('div', { class: 'muted', style: 'font-size:13px;margin:-8px 0 12px' }, ch.blurb));
    const path = h('div', { class: 'island-path' });
    for (const l of lvls) {
      const p = save.progress[l.id];
      const un = isUnlocked(l.id);
      const fi = flipTiles.indexOf(l.id);
      const cls = ['tile', p?.done ? 'done' : '', un ? '' : 'locked', firstOpen?.id === l.id ? 'next' : '', fi >= 0 ? 'blanketed' : ''].join(' ');
      const tile = h('div', { class: cls, role: 'button', tabindex: un ? 0 : -1, 'aria-label': `Level ${l.id} ${l.title}` },
        h('div', { class: 'tid' }, l.id),
        h('div', { class: 'stars' }, ...[0, 1, 2].map((k) => h('span', { class: `star ${p?.stars[k] ? 'got' : ''}` }, '★'))),
        h('div', { class: 'tip' }, un ? l.title : 'Locked'));
      tile.addEventListener('mouseenter', () => un && audio.sfx('ui_hover', { volume: 0.4 }));
      const open = () => {
        if (fi >= 0) {
          if (fi === flipped) {
            audio.sfx('test_pass'); save.flags.mapFlipDone = true; persist();
            toast('Fixed it without looking. That was a syndrome measurement, by the way.', 'good', 3500);
            tile.classList.add('flipped'); setTimeout(() => nav.go('map'), 700);
          } else { audio.sfx('test_fail'); tile.classList.add('shake'); setTimeout(() => tile.classList.remove('shake'), 400); toast('Nope. Read the bots: which tile is the odd one out?', 'bad'); }
          return;
        }
        if (!un) { audio.sfx('test_fail', { volume: 0.4 }); return; }
        audio.sfx('ui_click'); nav.go('level', l.id);
      };
      tile.addEventListener('click', open);
      tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      path.appendChild(tile);
    }
    island.appendChild(path);
    grid.appendChild(island);
  }
  scroll.appendChild(grid);
  scroll.appendChild(h('div', { class: 'side-modes' },
    h('button', { class: 'btn', onclick: () => nav.go('endless') }, 'Night Shift (endless)'),
    h('button', { class: 'btn', onclick: () => nav.go('lab') }, 'Gremlin Lab'),
    save.flags.nightLab ? h('button', { class: 'btn sun', onclick: () => openNightLab() }, 'Night Shift Lab') : null));
  audio.setScene('map');
  return () => {};
}
