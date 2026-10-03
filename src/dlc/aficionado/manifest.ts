/**
 * DLC entry, dynamically imported by src/modes/registry.ts. Runs the real staged loader, then the shell.
 * Theme CSS (Visual Director, theme/*.css) and the shell CSS are inlined into this chunk and injected on mount.
 */
import shellCss from './shell/shell.css?inline';
import type { DlcContext } from './contracts';
import { runLoader } from './loader/index';
import { afiStore } from './state/store';

// CSS is inlined and injected on mount (keeps the classic chunk free of Vite's CSS-preload helper)
const THEME = import.meta.glob<string>('./theme/*.css', { eager: true, query: '?inline', import: 'default' });

export async function mount(root: HTMLElement, ctx: DlcContext): Promise<() => void> {
  const style = document.createElement('style');
  style.dataset.afi = '';
  style.textContent = [...Object.values(THEME), shellCss].join('\n');
  document.head.appendChild(style);
  const host = document.createElement('div');
  host.className = 'afi-root';
  if (Object.keys(THEME).length) host.classList.add('afi-themed');
  host.setAttribute('lang', ctx.locale());
  root.appendChild(host);
  const s = afiStore.settings();
  const reduced = s.reducedMotion ?? ctx.reducedMotion();
  host.classList.toggle('afi-reduced', reduced);
  host.classList.toggle('afi-lecture', s.lecture);
  let destroyed = false;
  let shell: { destroy(): void } | null = null;
  const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !shell) ctx.exit(); };
  try {
    const seen = afiStore.flag('loaderSeen');
    const res = await runLoader(host, { locale: s.locale || ctx.locale(), reducedMotion: reduced, webgl: s.webgl, fast: seen && s.skipLoader, skippable: seen });
    afiStore.setFlag('loaderSeen');
    if (destroyed) return () => {};
    const { createShell } = await import('./shell/index');
    shell = createShell(host, ctx, res);
  } catch (e) {
    console.error('[afi] failed to start', e);
    host.textContent = '';
    const msg = document.createElement('div'); msg.className = 'afi-fatal'; msg.textContent = String((e as Error)?.message ?? e);
    const b = document.createElement('button'); b.className = 'afi-btn'; b.textContent = '⟵'; b.onclick = () => ctx.exit();
    host.append(msg, b);
    window.addEventListener('keydown', onEsc);
  }
  return () => { destroyed = true; window.removeEventListener('keydown', onEsc); shell?.destroy(); host.remove(); style.remove(); };
}
