/** Credits: the Qubbles finally wake up, all dreaming correctly. Schrödi steps out of the box. */
import { art, audio } from '../../engine/deps';
import { onFrame } from '../../engine/loop';
import { h } from '../../engine/util';
import type { Nav } from '../app';

export function creditsScreen(root: HTMLElement, nav: Nav): () => void {
  const canvas = h('canvas');
  const roll = h('div', { class: 'credits-roll' },
    h('h1', null, 'NO PEEKING!'),
    h('p', null, 'You fixed every dream without ever looking at one.'),
    h('h3', null, 'What you learned'),
    h('p', null, 'Looking changes things. Dreams cannot be copied, only shared.'),
    h('p', null, 'Parity checks ask "do you match?" without asking "what are you?"'),
    h('p', null, 'Some damage hides from the question you asked, so ask sideways too.'),
    h('p', null, 'Listening squashes a half-flip into a flip you can fix.'),
    h('p', null, 'Nine Qubbles can protect one dream from any single gremlin.'),
    h('h3', null, 'Pros call these'),
    h('p', null, 'measurement collapse · no-cloning · entanglement · stabilizer measurement'),
    h('p', null, 'bit-flip and phase-flip codes · error discretization · the Shor code'),
    h('h3', null, 'Made for quriosity'),
    h('p', null, 'ISAQC · Infinium 2026 · IIIT Hyderabad · Option 06: Error Syndromes and parity probes'),
    h('p', null, 'by a tiny team of humans and their very busy bots'),
    h('h3', null, 'Starring'),
    h('p', null, 'Schrodi (alive, obviously) · Flipper · Phasey · Wobbles · every Qubble · every Ancillabot'),
    h('h3', null, 'Thank you for not peeking'),
    h('p', { style: 'margin-top:40px' }, h('button', { class: 'btn sun', onclick: () => nav.go('title') }, 'Back to title')));
  root.append(canvas, roll, h('button', { class: 'btn small', style: 'position:absolute;right:16px;top:16px;z-index:3', onclick: () => nav.go('title') }, 'Skip'));
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, dpr = 1;
  const rs = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; };
  rs(); const ro = new ResizeObserver(rs); ro.observe(canvas);
  const t0 = performance.now() / 1000;
  const off = onFrame((t) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dawn = Math.min(1, (t - t0) / 12);
    art.drawBackground(ctx, W, H, t, 1 - dawn * 0.8);
    const n = 9, s = Math.min(1.1, W / 900);
    for (let i = 0; i < n; i++) {
      const x = W * (0.1 + 0.8 * (i / (n - 1))), y = H * 0.9 + Math.sin(i * 2.1) * 10;
      const awake = t - t0 > 3 + i * 0.6;
      const a = t * 1.2 + i;
      art.drawQubble(ctx, x, y, s, { bloch: { x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.9, z: 0.3 }, blanket: awake ? 0 : 1, state: awake ? 'happy' : 'sleep' }, t);
    }
    art.drawSchrodi(ctx, W * 0.86, H * 0.72, s * 1.4, t - t0 > 8 ? 'happy' : 'sleepy', t);
    art.drawParticles?.(ctx, t);
  });
  audio.setScene('credits');
  return () => { off(); ro.disconnect(); };
}
