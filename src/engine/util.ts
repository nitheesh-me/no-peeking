/** Small shared helpers: DOM builder, easing, math. */

type Attrs = Record<string, unknown> & { class?: string; style?: string };
type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}
function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeOutBack = (t: number) => { const c = 1.70158; t = clamp(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
export const easeInOut = (t: number) => { t = clamp(t); return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; };
/** 0 → 1 → 0 hump */
export const hump = (t: number) => Math.sin(Math.PI * clamp(t));

export function prefersReducedMotion(): boolean {
  return document.documentElement.classList.contains('reduced');
}

/** Convert art.portrait() output (data URL or raw SVG string) into an <img> src. */
export function portraitSrc(s: string): string {
  if (s.trim().startsWith('<')) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  return s;
}

export function toast(msg: string, kind: 'good' | 'bad' | '' = '', ms = 2600): void {
  let host = document.querySelector('.toasts');
  if (!host) { host = h('div', { class: 'toasts' }); document.body.appendChild(host); }
  for (const old of host.querySelectorAll('.toast')) if (old.textContent === msg) old.remove();
  const t = h('div', { class: `toast panel ${kind}` }, msg);
  host.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(content: HTMLElement, opts: { onClose?: () => void; closable?: boolean; cls?: string; backdrop?: boolean } = {}): () => void {
  const back = h('div', { class: 'modal-back' });
  const box = h('div', { class: `modal panel ${opts.cls ?? ''}` });
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); opts.onClose?.(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && opts.closable !== false) { e.stopPropagation(); close(); } };
  if (opts.closable !== false) {
    box.appendChild(h('button', { class: 'btn icon small close', 'aria-label': 'Close', onclick: close }, '×'));
    if (opts.backdrop !== false) back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  }
  box.appendChild(content);
  back.appendChild(box);
  document.body.appendChild(back);
  document.addEventListener('keydown', onKey, true);
  return close;
}

export function inputLabel(inp: unknown): string {
  if (typeof inp === 'string') return ({ zero: '☀', one: '🌙', plus: '🌀+', minus: '🌀−', plusI: '🌀i', minusI: '🌀−i', random: '🎲' } as Record<string, string>)[inp] ?? inp;
  const o = inp as { theta: number; phi: number };
  if (o && typeof o.theta === 'number') {
    if (o.theta < 0.05) return '☀';
    if (o.theta > Math.PI - 0.05) return '🌙';
    return '🌀';
  }
  return '?';
}

export function gremlinIcon(kind: string): string {
  return ({ flip: '😈', phase: '👻', both: '😈👻', wobble: '🫠' } as Record<string, string>)[kind] ?? '·';
}
