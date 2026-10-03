/**
 * Level map: a canvas night-sky dream map. Chapter islands sit along a winding dream-trail, level nodes on each island,
 * parallax drift, the current node pulses, and a tiny caretaker stands on it (tiptoes to the next node on unlock).
 * DOM buttons sit over every node for keyboard focus / screen readers. Includes the 'map-flip' syndrome beat.
 */
import type { LevelDef, MapNodeVisual } from '../../core/contracts';
import { LEVELS, CHAPTERS, art, audio } from '../../engine/deps';
import { onFrame } from '../../engine/loop';
import { save, persist } from '../../engine/store';
import { h, toast, smooth, clamp, lerp } from '../../engine/util';
import type { Nav } from '../app';
import { openNightLab } from '../nightLab';

export function isUnlocked(id: string): boolean {
  const i = LEVELS.findIndex((l) => l.id === id);
  if (i <= 0) return true;
  if (save.flags.unlockAll) return true;
  return !!save.progress[LEVELS[i - 1].id]?.done || !!save.progress[id]?.done;
}

interface NodePos { lv: LevelDef; x: number; y: number; btn: HTMLButtonElement }
interface IslandPos { ch: (typeof CHAPTERS)[number]; x: number; y: number; card: HTMLElement; unlocked: boolean }

// deterministic star field for the fallback backdrop
const STARS = Array.from({ length: 140 }, (_, i) => ({ x: ((i * 7919) % 1000) / 1000, y: ((i * 104729) % 1000) / 1000, r: 0.6 + ((i * 31) % 10) / 8, ph: i * 1.7 }));

export function mapScreen(root: HTMLElement, nav: Nav): () => void {
  const done = LEVELS.filter((l) => save.progress[l.id]?.done).length;
  const starsTotal = LEVELS.reduce((s, l) => s + (save.progress[l.id]?.stars.filter(Boolean).length ?? 0), 0);
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const layer = h('div', { class: 'map-layer' });
  const area = h('div', { class: 'map-area' }, canvas, layer);
  root.append(
    h('div', { class: 'topbar' },
      h('button', { class: 'btn small', onclick: () => nav.go('title') }, '◂ Title'),
      h('div', { class: 'title' }, 'The Dream Map'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'tag' }, `${done}/${LEVELS.length} nights`), h('span', { class: 'tag' }, `★ ${starsTotal}`),
      h('button', { class: 'btn icon small', title: 'Settings', onclick: () => nav.settings() }, '⚙')),
    area,
  );

  // ── map-flip beat: after Chapter 1 is finished, Flipper hits the map once ──
  const ch1 = LEVELS.filter((l) => l.chapter === 1);
  const flipActive = ch1.length >= 3 && ch1.every((l) => save.progress[l.id]?.done) && !save.flags.mapFlipDone;
  if (flipActive && !('mapFlipIdx0' in save.flags)) {
    const r = Math.floor(Math.random() * 3);
    save.flags.mapFlipIdx0 = r === 0; save.flags.mapFlipIdx1 = r === 1; save.flags.mapFlipIdx2 = r === 2; persist();
  }
  const flipTiles = flipActive ? ch1.slice(0, 3).map((l) => l.id) : [];
  const flipped = flipActive ? (save.flags.mapFlipIdx1 ? 1 : save.flags.mapFlipIdx2 ? 2 : 0) : -1;
  if (flipActive) {
    const s1 = flipped === 0 || flipped === 1, s2 = flipped === 1 || flipped === 2;
    area.appendChild(h('div', { class: 'mapflip-banner panel map-banner' },
      h('div', { style: 'font-size:30px' }, '😈'),
      h('div', null,
        h('div', { class: 'ttl' }, 'Flipper got into the map!'),
        h('div', { style: 'font-size:13px' }, 'One of the three blanketed nodes got flipped. No peeking under the blankets: the map-bots compare neighbours. Tap the node the syndrome points to.'),
        h('div', { class: 'mapflip-row', style: 'margin-top:6px' },
          h('span', { class: 'tag' }, `${flipTiles[0]} vs ${flipTiles[1]}`), h('div', { class: `mapbot ${s1 ? 'beep' : ''}` }),
          h('span', { class: 'tag' }, `${flipTiles[1]} vs ${flipTiles[2]}`), h('div', { class: `mapbot ${s2 ? 'beep' : ''}` })))));
    setTimeout(() => audio.sfx('gremlin_flip'), 300);
  }

  area.appendChild(h('div', { class: 'map-modes' },
    h('button', { class: 'btn small', onclick: () => nav.go('endless') }, 'Night Shift (endless)'),
    h('button', { class: 'btn small', onclick: () => nav.go('lab') }, 'Gremlin Lab'),
    save.flags.nightLab ? h('button', { class: 'btn small sun', onclick: () => openNightLab() }, 'Night Shift Lab') : null));

  // ── nodes / islands ──
  const current = LEVELS.find((l) => !save.progress[l.id]?.done && isUnlocked(l.id)) ?? LEVELS[LEVELS.length - 1];
  let hoverId: string | null = null;
  const islands: IslandPos[] = [];
  const nodes: NodePos[] = [];
  const chapters = CHAPTERS.filter((c) => LEVELS.some((l) => l.chapter === c.id));
  for (const ch of chapters) {
    const lvls = LEVELS.filter((l) => l.chapter === ch.id);
    const unlocked = isUnlocked(lvls[0].id);
    const card = h('div', { class: `map-card ${unlocked ? '' : 'locked'}` },
      h('div', { class: 'num' }, `Chapter ${ch.id}`), h('div', { class: 'name' }, ch.title), h('div', { class: 'blurb' }, unlocked ? ch.blurb : 'Locked'));
    layer.appendChild(card);
    islands.push({ ch, x: 0, y: 0, card, unlocked });
    for (const lv of lvls) {
      const un = isUnlocked(lv.id);
      const p = save.progress[lv.id];
      const fi = flipTiles.indexOf(lv.id);
      const btn = h('button', {
        class: 'map-node-btn', 'aria-label': `Level ${lv.id}: ${lv.title}${un ? '' : ' (locked)'}${p?.done ? `, ${p.stars.filter(Boolean).length} stars` : ''}`,
        'aria-disabled': un ? null : 'true',
      }, h('span', { class: 'tip' }, fi >= 0 ? 'Blanketed by Flipper' : un ? `${lv.id} ${lv.title}` : 'Locked')) as HTMLButtonElement;
      btn.addEventListener('mouseenter', () => { hoverId = lv.id; if (un) audio.sfx('ui_hover', { volume: 0.35 }); });
      btn.addEventListener('mouseleave', () => { if (hoverId === lv.id) hoverId = null; });
      btn.addEventListener('focus', () => { hoverId = lv.id; });
      btn.addEventListener('blur', () => { if (hoverId === lv.id) hoverId = null; });
      btn.addEventListener('click', () => {
        if (fi >= 0) {
          if (fi === flipped) {
            audio.sfx('test_pass'); save.flags.mapFlipDone = true; persist();
            toast('Fixed it without looking. That was a syndrome measurement, by the way.', 'good', 3500);
            setTimeout(() => nav.go('map'), 700);
          } else { audio.sfx('test_fail'); toast('Nope. Read the bots: which node is the odd one out?', 'bad'); }
          return;
        }
        if (!un) { audio.sfx('test_fail', { volume: 0.4 }); return; }
        audio.sfx('ui_click'); nav.go('level', lv.id);
      });
      layer.appendChild(btn);
      nodes.push({ lv, x: 0, y: 0, btn });
    }
  }

  // ── layout ──
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, dpr = 1, S = 1, vertical = false;
  const layout = () => {
    const r = area.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    vertical = W / H < 1.05;
    const n = islands.length;
    S = clamp(vertical ? Math.min(W / 520, H / (n * 170)) : Math.min(W / (n * 250), H / 560), 0.5, 1.4);
    islands.forEach((isl, k) => {
      if (vertical) { isl.x = W * (k % 2 ? 0.66 : 0.34); isl.y = H * ((k + 0.65) / (n + 0.3)); }
      else { isl.x = W * (0.5 + (k - (n - 1) / 2) / n * 0.98); isl.y = H * (0.56 + 0.13 * Math.sin(k * 1.9 + 0.4)); }
      isl.card.style.left = `${isl.x}px`; isl.card.style.top = `${isl.y - 92 * S}px`;
      isl.card.style.setProperty('--s', String(S));
      const lv = nodes.filter((nd) => nd.lv.chapter === isl.ch.id);
      const m = lv.length, gap = Math.min(46, 200 / Math.max(1, m - 1)) * S;
      lv.forEach((nd, i) => {
        nd.x = isl.x + (i - (m - 1) / 2) * gap;
        nd.y = isl.y + (i % 2 ? 12 : -8) * S;
        nd.btn.style.left = `${nd.x}px`; nd.btn.style.top = `${nd.y}px`;
        nd.btn.style.width = nd.btn.style.height = `${36 * S}px`;
      });
    });
  };
  const ro = new ResizeObserver(layout); ro.observe(area); layout();

  // caretaker avatar: tiptoe from the last node we stood on to the current one
  const fromId = save.mapAt && save.mapAt !== current.id ? save.mapAt : current.id;
  let walkT0 = -1;
  if (save.mapAt !== current.id) { save.mapAt = current.id; persist(); }

  // parallax
  let mx = 0, my = 0, tx = 0, ty = 0;
  area.addEventListener('pointermove', (e) => { const r = area.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5; });

  const nodePos = (id: string) => nodes.find((n) => n.lv.id === id);
  const off = onFrame((t, dt) => {
    mx += (tx - mx) * Math.min(1, dt * 3); my += (ty - my) * Math.min(1, dt * 3);
    const ox = -mx * 18 + Math.sin(t * 0.21) * 5, oy = -my * 12 + Math.cos(t * 0.17) * 4;
    layer.style.transform = `translate(${ox}px, ${oy}px)`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // backdrop (moves less → depth)
    ctx.save(); ctx.translate(ox * 0.35, oy * 0.35);
    if (art.drawMapBackdrop) art.drawMapBackdrop(ctx, W + 40, H + 40, t);
    else {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#141432'); g.addColorStop(1, '#2b2350');
      ctx.fillStyle = g; ctx.fillRect(-30, -30, W + 60, H + 60);
      for (const st of STARS) { ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * 1.3 + st.ph); ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.save(); ctx.translate(ox, oy);
    // islands
    for (const isl of islands) {
      const bob = Math.sin(t * 0.9 + isl.ch.id) * 3 * S;
      if (art.drawMapIsland) art.drawMapIsland(ctx, isl.x, isl.y + 26 * S + bob, S, isl.ch.id, isl.ch.color, isl.unlocked, t);
      else fallbackIsland(isl.x, isl.y + 26 * S + bob, isl.ch.color, isl.unlocked);
    }
    // dream-trail through all nodes
    const pts = nodes.map((n) => ({ x: n.x, y: n.y }));
    const prog = nodes.length > 1 ? Math.max(0, nodes.findIndex((n) => n.lv.id === current.id)) / (nodes.length - 1) : 0;
    if (art.drawMapPath) art.drawMapPath(ctx, pts, prog, t); else fallbackPath(pts, prog, t);
    // nodes
    for (const n of nodes) {
      const p = save.progress[n.lv.id];
      const un = isUnlocked(n.lv.id);
      const v: MapNodeVisual = {
        id: n.lv.id, title: n.lv.title, color: CHAPTERS.find((c) => c.id === n.lv.chapter)?.color ?? '#ffb72b',
        state: n.lv.id === current.id && !p?.done ? 'current' : p?.done ? 'done' : un ? 'open' : 'locked',
        stars: p?.stars.filter(Boolean).length ?? 0, hover: hoverId === n.lv.id,
      };
      if (art.drawMapNode) art.drawMapNode(ctx, n.x, n.y, S, v, t); else fallbackNode(n.x, n.y, v, t);
      if (flipTiles.includes(n.lv.id)) blanket(n.x, n.y, t);
    }
    // caretaker
    const a = nodePos(fromId), b = nodePos(current.id);
    if (a && b) {
      if (walkT0 < 0) walkT0 = t + 0.5;
      const k = fromId === current.id ? 1 : smooth((t - walkT0) / 1.4);
      const x = lerp(a.x, b.x, k), y = lerp(a.y, b.y, k) - 22 * S - (k > 0 && k < 1 ? Math.abs(Math.sin(k * Math.PI * 6)) * 5 * S : 0);
      const action = k > 0 && k < 1 ? 'tiptoe' : 'idle';
      if (art.drawCaretaker) art.drawCaretaker(ctx, x + 16 * S, y + 22 * S, S * 0.7, { action, phase: (t * 1.5) % 1, facing: b.x >= a.x ? 1 : -1 }, t);
      else { ctx.font = `${22 * S}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🧒', x + 16 * S, y + 14 * S); }
    }
    ctx.restore();
  });

  function fallbackIsland(x: number, y: number, color: string, unlocked: boolean) {
    const w = 120 * S, hh = 30 * S;
    ctx.save();
    ctx.fillStyle = unlocked ? '#6b4a3a' : '#4a4658';
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y + 110 * S, x + w, y); ctx.fill();
    ctx.fillStyle = unlocked ? color : '#77738a'; ctx.strokeStyle = '#0e0e0e'; ctx.lineWidth = 2.5 * S;
    ctx.beginPath(); ctx.ellipse(x, y, w, hh, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function fallbackPath(pts: { x: number; y: number }[], prog: number, t: number) {
    if (pts.length < 2) return;
    const cut = prog * (pts.length - 1);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 4 * S;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      ctx.setLineDash(i < cut ? [] : [2 * S, 9 * S]); ctx.lineDashOffset = -t * 10;
      ctx.strokeStyle = i < cut ? 'rgba(255,214,120,0.95)' : 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - 26 * S, b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }
  function fallbackNode(x: number, y: number, v: MapNodeVisual, t: number) {
    const r = (v.state === 'current' ? 17 + Math.sin(t * 4) * 2 : 15) * S * (v.hover ? 1.15 : 1);
    ctx.save();
    if (v.state === 'current') { ctx.fillStyle = 'rgba(255,183,43,0.3)'; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = v.state === 'locked' ? '#8a867d' : v.state === 'done' ? '#3ddc97' : v.state === 'current' ? '#ffb72b' : '#f2f0eb';
    ctx.strokeStyle = '#0e0e0e'; ctx.lineWidth = 2.5 * S;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0e0e0e'; ctx.font = `${11 * S}px Quantum, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(v.state === 'locked' ? '🔒' : v.id, x, y + 1);
    if (v.state === 'done') { ctx.font = `${10 * S}px sans-serif`; ctx.fillStyle = '#ffd34d'; ctx.fillText('★'.repeat(v.stars) + '☆'.repeat(3 - v.stars), x, y + r + 9 * S); }
    ctx.restore();
  }
  function blanket(x: number, y: number, t: number) {
    const r = 19 * S;
    ctx.save(); ctx.fillStyle = '#b9b1ff'; ctx.strokeStyle = '#0e0e0e'; ctx.lineWidth = 2.5 * S;
    ctx.beginPath(); ctx.arc(x, y + Math.sin(t * 3) * S, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0e0e0e'; ctx.font = `${16 * S}px Quantum, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', x, y + 1);
    ctx.restore();
  }

  audio.setScene('map');
  // focus the current node for keyboard players
  setTimeout(() => nodes.find((n) => n.lv.id === current.id)?.btn.focus({ preventScroll: true }), 50);
  return () => { off(); ro.disconnect(); };
}
