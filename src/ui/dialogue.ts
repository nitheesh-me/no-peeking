/** Bottom-left speech box: portrait, typewriter text, click to advance, per-speaker blips. */
import type { DialogueLine, Speaker } from '../core/contracts';
import { art, audio } from '../engine/deps';
import { h, portraitSrc, prefersReducedMotion } from '../engine/util';

const NAMES: Record<Speaker, string> = { schrodi: 'Schrodi', flipper: 'Flipper', phasey: 'Phasey', wobbles: 'Wobbles', qubble: 'Qubble', eye: 'The Eye', system: 'Daycare' };
const PITCH: Record<Speaker, number> = { schrodi: 0.75, flipper: 1.5, phasey: 1.25, wobbles: 0.6, qubble: 1.8, eye: 0.5, system: 1 };

export class Dialogue {
  private el: HTMLElement | null = null;
  private timer = 0;
  private queue: DialogueLine[] = [];
  private onDone: (() => void) | null = null;
  private full = '';
  private typing = false;
  onMood?: (m: DialogueLine['mood']) => void;

  constructor(private host: HTMLElement) {}

  get active(): boolean { return !!this.el; }

  play(lines: DialogueLine[], onDone?: () => void): void {
    this.close(false);
    this.queue = [...lines];
    this.onDone = onDone ?? null;
    this.next();
  }

  private next(): void {
    const line = this.queue.shift();
    if (!line) { this.close(true); return; }
    this.el?.remove();
    const text = h('div', { class: 'text' });
    this.el = h('div', { class: `dialogue who-${line.who}`, role: 'dialog', 'aria-live': 'polite' },
      h('div', { class: 'portrait' }, h('img', { src: portraitSrc(art.portrait(line.who, line.mood)), alt: NAMES[line.who] })),
      h('div', { class: 'bubble panel' }, h('div', { class: 'who' }, NAMES[line.who]), text, h('div', { class: 'next' }, this.queue.length ? 'click ▸' : 'click ✓')));
    this.el.addEventListener('click', (e) => { e.stopPropagation(); this.advance(); });
    this.host.appendChild(this.el);
    if (line.who === 'schrodi') this.onMood?.(line.mood);
    if (!audio.voice && line.who === 'schrodi' && Math.random() < 0.3) audio.sfx('schrodi_meow', { volume: 0.5 });
    this.full = line.text;
    if (prefersReducedMotion()) { text.textContent = line.text; this.typing = false; return; }
    this.typing = true;
    let i = 0;
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      i++;
      text.textContent = this.full.slice(0, i);
      const ch = this.full[i - 1] ?? '';
      if (audio.voice) audio.voice(line.who, ch, i - 1, line.text);
      else if (i % 3 === 1 && /\w/.test(ch)) audio.sfx('ui_click', { pitch: PITCH[line.who] * (0.9 + Math.random() * 0.2), volume: 0.25 });
      if (i >= this.full.length) { clearInterval(this.timer); this.typing = false; }
    }, 22);
  }

  advance(): void {
    if (!this.el) return;
    if (this.typing) {
      clearInterval(this.timer); this.typing = false;
      const t = this.el.querySelector('.text'); if (t) t.textContent = this.full;
      return;
    }
    this.next();
  }

  close(fire = true): void {
    clearInterval(this.timer);
    this.el?.remove(); this.el = null;
    const cb = this.onDone; this.onDone = null; this.queue = [];
    if (fire) cb?.();
  }
}
