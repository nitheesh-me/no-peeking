/** Card Guide: drop a card on the "?" help slot (or click ⓘ) to learn what it does, see a tiny demo, and get tips. */
import type { Bloch, LevelDef, OpName } from '../core/contracts';
import { art, audio } from '../engine/deps';
import { onFrame } from '../engine/loop';
import { save } from '../engine/store';
import { h, modal } from '../engine/util';
import { CARD_GUIDE, peekTips, type CardDemo } from './cardGuide';
import { linkify } from './learnLinks';
import { cardAnatomy } from './cardAnatomy';
import { levelDone } from './unlocks';

const BLOCH: Record<NonNullable<CardDemo['from']>, Bloch> = {
  sunny: { x: 0, y: 0, z: 1 }, moony: { x: 0, y: 0, z: -1 }, plus: { x: 1, y: 0, z: 0 }, minus: { x: -1, y: 0, z: 0 },
};

export function demoCanvas(d: CardDemo, level: LevelDef, name: OpName): { el: HTMLElement; stop: () => void } {
  const W = 300, H = 150, dpr = Math.min(2, devicePixelRatio || 1);
  const cv = h('canvas', { class: 'guide-demo', width: W * dpr, height: H * dpr, style: `width:${W}px;height:${H}px` }) as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const LOOP = 3.2;
  const stop = onFrame((t) => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ebe6da'; g.beginPath(); g.ellipse(W / 2, H - 26, 130, 22, 0, 0, Math.PI * 2); g.fill();
    const p = (t % LOOP) / LOOP;              // 0..1 through one demo loop
    const act = Math.min(1, Math.max(0, (p - 0.2) / 0.5)); // action phase, contact at ~0.45 of the loop
    const after = act >= 0.5;
    const classical = !!level.classical && (name === 'PEEK' || name === 'BOOP');
    const s = 1.15;
    if (d.target === 'none') {
      g.font = '54px Quicksand, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.translate(W / 2, H / 2 - 6); g.scale(1 + 0.08 * Math.sin(t * 4), 1 + 0.08 * Math.sin(t * 4)); g.fillText(d.glyph ?? '?', 0, 0); g.restore();
      return;
    }
    const qx = W / 2 + 40, qy = H - 30;
    if (d.target === 'qubble' || d.target === 'two-qubbles') {
      const bl = after && d.to ? BLOCH[d.to] : BLOCH[d.from ?? 'sunny'];
      const peeking = d.action === 'peek';
      const blanket = classical ? (peeking && !after ? 1 : 0) : peeking ? (after ? 0 : 1) : 0.25;
      const state = peeking && after && !classical && !level.allowPeekData ? 'awake-grumpy' : after ? 'giggle' : 'sleep';
      if (d.target === 'two-qubbles') {
        art.drawQubble(g, qx - 70, qy, s * 0.9, { bloch: BLOCH[d.from ?? 'sunny'], blanket: 0.25, state: 'sleep', classical: false }, t);
        const reach = d.actor === 'none' ? 0 : Math.sin(Math.PI * act);
        art.drawQubble(g, qx + 10, qy, s * 0.9, { bloch: bl, blanket: 0.25, state, classical: false, arm: reach > 0.05 ? { dx: -80, dy: 0, t: reach } : undefined }, t);
      } else {
        const tumble = classical && name === 'BOOP' ? Math.min(1, Math.max(0, (act - 0.25) / 0.5)) : undefined;
        art.drawQubble(g, qx, qy, s, { bloch: bl, blanket, state, classical, tumble: tumble && tumble < 1 ? tumble : undefined }, t);
      }
    }
    if (d.target === 'bot') {
      const light = after ? (d.light ?? null) : null;
      art.drawBot(g, qx, qy, s, { light, action: after ? 'listen' : 'idle', facing: -1 }, t);
    }
    if (d.actor === 'caretaker' && art.drawCaretaker) {
      const walkIn = Math.min(1, p / 0.2);
      art.drawCaretaker(g, W / 2 - 90 + 40 * walkIn, H - 28, s, { action: p < 0.2 ? 'tiptoe' : classical && name === 'BOOP' ? 'spin' : (d.action ?? 'boop'), phase: act, facing: 1, flashlight: d.action === 'peek' && !classical }, t);
    } else if (d.actor === 'bot') {
      const k = Math.sin(Math.PI * Math.min(1, p / 0.8));
      art.drawBot(g, W / 2 - 80 + 60 * k, H - 30, s, { light: after ? (d.light ?? null) : null, action: act > 0.3 && act < 0.7 ? 'highfive' : 'roll', facing: 1 }, t);
    }
  });
  return { el: cv, stop };
}

export function openCardGuide(name: OpName, level: LevelDef): void {
  const g = CARD_GUIDE[name];
  if (!g) return;
  audio.sfx('ui_click', { pitch: 1.2 });
  const demo = demoCanvas(g.demo, level, name);
  const anatomy = cardAnatomy(name, level);
  const flow = g.demo.target === 'none'; // IF / JUMP / LABEL / END / COMMENT: the anatomy walkthrough replaces the glyph
  const proOpen = g.pro && levelDone(g.pro.unlockAfter);
  const peekWakes = !(level.classical || level.allowPeekData);
  const title = name === 'PEEK' ? (peekWakes ? 'PEEK (wakes it!)' : level.classical ? 'PEEK: look in the box' : 'PEEK (allowed here)') : g.name;
  const what = level.classical && name === 'PEEK' ? 'Open the box and read the number inside. On the day shift this is totally fine.'
    : level.classical && name === 'BOOP' ? 'Flip the bit in the box: a 0 becomes a 1, a 1 becomes a 0.' : g.what;
  const tips = name === 'PEEK' ? peekTips(level) : level.classical && name === 'BOOP' ? ['BOOP twice and nothing changed. Handy for undoing a mistake.', 'PEEK first, so you only BOOP the boxes that need it.'] : g.tips;
  const body = h('div', { class: 'guide' },
    h('div', { class: `guide-head card op-${name}${name === 'PEEK' && peekWakes ? ' hazard' : ''}` }, h('span', { class: 'cname' }, title)),
    h('p', { class: 'guide-what' }, what),
    flow ? null : demo.el,
    anatomy.el,
    h('h4', null, 'Tips & tricks'),
    h('ul', { class: 'guide-tips' }, ...tips.map((t) => h('li', null, t))),
    g.pro ? h('div', { class: 'guide-pro' }, ...(proOpen ? ['Pros call this: ', ...linkify(g.pro.term)] : [`🔒 The pro name unlocks after level ${g.pro.unlockAfter}`])) : null,
  );
  modal(body, { cls: 'guide-wrap', onClose: () => { demo.stop(); anatomy.destroy(); } });
}
