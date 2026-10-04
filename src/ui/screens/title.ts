/** Title screen: "NO PEEKING!" letters drawn on Qubbles. Hovering a letter *peeks* it → it collapses. */
import type { Bloch } from '../../core/contracts';
import { art, audio } from '../../engine/deps';
import { onFrame } from '../../engine/loop';
import { save } from '../../engine/store';
import { h, easeOutBack, clamp } from '../../engine/util';
import type { Nav } from '../app';
import { fullscreenButton } from '../fullscreen';
import { cinema } from '../../engine/cinema';

interface Letter { ch: string; x: number; y: number; collapsed: 0 | 1 | null; at: number; phase: number }

export function titleScreen(root: HTMLElement, nav: Nav): () => void {
  const canvas = h('canvas');
  const anyProgress = Object.values(save.progress).some((p) => p.done);
  root.append(
    canvas,
    h('div', { class: 'title-corner' }, fullscreenButton('btn icon')),
    h('div', { class: 'title-tagline' }, 'The Qubble Daycare needs a night-shift caretaker. One rule.'),
    h('div', { class: 'title-menu' },
      h('button', { class: 'btn primary', onclick: () => { audio.sfx('ui_click'); nav.go('map'); } }, anyProgress ? 'Continue' : 'Play'),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => nav.go('endless') }, 'Night Shift'),
        h('button', { class: 'btn small', onclick: () => nav.go('lab') }, 'Gremlin Lab'),
        h('button', { class: 'btn small', title: 'Everything you have met in the daycare', onclick: () => nav.go('codex') }, '📖 Codex'),
        h('button', { class: 'btn small', onclick: () => nav.settings() }, 'Settings'),
        h('button', { class: 'btn small', onclick: () => nav.go('credits') }, 'Credits')),
      h('div', { class: 'title-hint' }, 'psst… don\'t hover over the letters'),
    ),
  );
  const ctx = canvas.getContext('2d')!;
  const text = 'NO PEEKING!';
  const letters: Letter[] = [];
  let W = 0, H = 0, dpr = 1, slot = 80;
  const layout = () => {
    const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr;
    slot = Math.min(W / (text.length + 1), cinema.on ? 400 : 120);
    const total = slot * text.length;
    letters.length === 0 && [...text].forEach((ch, i) => letters.push({ ch, x: 0, y: 0, collapsed: null, at: 0, phase: i * 0.7 }));
    letters.forEach((l, i) => { l.x = W / 2 - total / 2 + slot * (i + 0.5); l.y = H * 0.46 + Math.sin(i * 1.3) * slot * 0.08; });
  };
  layout();
  const ro = new ResizeObserver(layout); ro.observe(canvas);
  let mx = -1, my = -1;
  const peek = (l: Letter, t: number) => {
    if (l.ch === ' ' || l.collapsed != null) return;
    l.collapsed = Math.random() < 0.5 ? 0 : 1; l.at = t;
    audio.sfx('peek_collapse', { pitch: 0.8 + Math.random() * 0.5, volume: 0.6 });
    art.burst?.('collapse', l.x, l.y - slot * 0.35);
  };
  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; });
  canvas.addEventListener('pointerdown', (e) => { const r = canvas.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; });
  canvas.addEventListener('pointerleave', () => { mx = my = -1; });
  let titleTold = false;

  const off = onFrame((t) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    art.drawBackground(ctx, W, H, t, 0.15);
    const s = slot / 78;
    for (const l of letters) {
      if (l.ch === ' ') continue;
      if (mx >= 0 && Math.hypot(mx - l.x, my - (l.y - 30 * s)) < slot * 0.5) peek(l, t);
      let bloch: Bloch;
      let state: 'sleep' | 'awake-grumpy' | 'collapsed' = 'sleep';
      if (l.collapsed == null) {
        const a = t * 1.3 + l.phase;
        bloch = { x: Math.cos(a), y: Math.sin(a), z: Math.sin(t * 0.7 + l.phase) * 0.25 };
      } else {
        bloch = { x: 0, y: 0, z: l.collapsed ? -1 : 1 };
        state = t - l.at < 1.5 ? 'awake-grumpy' : 'collapsed';
      }
      const pop = l.collapsed != null ? easeOutBack(clamp((t - l.at) / 0.4)) : 1;
      const bob = Math.sin(t * 2 + l.phase) * 3 * s;
      ctx.save();
      ctx.translate(l.x, l.y + bob); ctx.scale(pop, pop); ctx.translate(-l.x, -(l.y + bob));
      art.drawQubble(ctx, l.x, l.y + bob, s * 1.1, { bloch, blanket: 0, state }, t);
      ctx.restore();
      // the letter rides on top of the qubble
      const col = l.collapsed == null ? '#0e0e0e' : l.collapsed ? '#6c63ff' : '#ff9a00';
      ctx.font = `${Math.round(slot * 0.62)}px Quantum, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 6 * s; ctx.strokeStyle = '#f2f0eb'; ctx.lineJoin = 'round';
      const ly = l.y - 58 * s + bob;
      ctx.strokeText(l.ch, l.x, ly); ctx.fillStyle = col; ctx.fillText(l.ch, l.x, ly);
    }
    art.drawParticles?.(ctx, t);
    if (!titleTold && letters.filter((l) => l.collapsed != null).length >= 3) {
      titleTold = true;
      const hint = root.querySelector('.title-hint'); if (hint) hint.textContent = 'You peeked. They collapsed. That is the whole game, really.';
    }
  });
  audio.setScene('title');
  return () => { off(); ro.disconnect(); };
}
