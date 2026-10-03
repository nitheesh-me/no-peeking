/** Metagame beats that live in the DOM: clone-glitch (1-3), lights-out colour flood (4-2). */
import { audio } from '../engine/deps';
import { h } from '../engine/util';

/** "The game tries to copy itself": a glitchy duplicate of the UI that is *entangled* with the pointer, then snaps back. */
export function cloneGlitch(canvas?: HTMLCanvasElement): void {
  const app = document.getElementById('app');
  if (!app) return;
  const reduced = document.documentElement.classList.contains('reduced');
  const clone = app.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.classList.add('clone-glitch');
  // copy the canvas pixels too (cloneNode doesn't)
  if (canvas) {
    const cc = clone.querySelector('canvas');
    if (cc) { const g = (cc as HTMLCanvasElement).getContext('2d'); try { g?.drawImage(canvas, 0, 0); } catch { /* ignore */ } }
  }
  document.body.appendChild(clone);
  app.classList.add('glitch-shake');
  audio.sfx('glitch');
  let ox = 0, oy = 0, lastX: number | null = null, lastY = 0;
  const move = (e: PointerEvent) => {
    if (lastX != null) { ox -= e.clientX - lastX; oy += e.clientY - lastY; } // mirrored: the twin moves the opposite way
    lastX = e.clientX; lastY = e.clientY;
    clone.style.transform = `translate(${ox + 14}px, ${oy - 6}px)`;
  };
  clone.style.transform = 'translate(14px,-6px)';
  window.addEventListener('pointermove', move);
  const banner = h('div', { class: 'toast panel bad', style: 'position:fixed;left:50%;top:40%;transform:translateX(-50%);z-index:2100;font-size:20px' }, 'ERROR: cannot copy a dream. Sharing it instead…');
  document.body.appendChild(banner);
  setTimeout(() => {
    window.removeEventListener('pointermove', move);
    clone.style.transition = 'transform 0.18s ease-in, opacity 0.18s';
    clone.style.transform = 'translate(0,0)';
    clone.style.opacity = '0';
    audio.sfx('glitch', { pitch: 0.7 });
    app.classList.remove('glitch-shake');
    setTimeout(() => { clone.remove(); banner.remove(); }, 220);
  }, reduced ? 900 : 1900);
}

export function floodColor(): void {
  const f = h('div', { class: 'flood' });
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 2400);
}
