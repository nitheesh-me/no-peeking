/** DLC entry (stub; the DLC Engineer replaces this). Dynamically imported by src/modes/registry.ts. */
import type { DlcContext } from './contracts';

export async function mount(root: HTMLElement, ctx: DlcContext): Promise<() => void> {
  const el = document.createElement('div');
  el.textContent = 'Technical Aficionado: under construction';
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#070a16;color:#6ef2ff;font:16px monospace';
  el.onclick = () => ctx.exit();
  root.appendChild(el);
  return () => el.remove();
}
