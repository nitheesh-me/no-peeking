/**
 * Shared, dependency-free viz plumbing: host frame, captions, tooltips, DPR-correct canvases, render loop,
 * reduced motion and WebGL detection. No three.js / d3 here (the loading circuit uses it before they load).
 */
import { t } from '../../../i18n';
import { getTheme, prefersReducedMotion, ensureFonts, type AfiTheme } from '../theme/theme';
import '../theme/tokens.css';

/** Options every viz module accepts. */
export interface VizBaseOpts {
  theme?: AfiTheme;
  /** default: prefers-reduced-motion */
  reducedMotion?: boolean;
  /** force the 2D fallback (default: auto-detect WebGL) */
  webgl?: boolean;
  /** caption text; default comes from the content pack. Pass '' to hide. */
  caption?: string;
}
export interface VizHandle<D> { update(data: D): void; destroy(): void }

/** content-pack lookup for viz strings: key under afi.viz.* */
export const tv = (key: string, vars?: Record<string, string | number>) => t('afi.viz.' + key, vars);

let glOk: boolean | null = null;
export function webglAvailable(): boolean {
  if (glOk !== null) return glOk;
  try {
    const c = document.createElement('canvas');
    glOk = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { glOk = false; }
  return glOk;
}
export const resolveRM = (o?: VizBaseOpts) => o?.reducedMotion ?? prefersReducedMotion();
export const resolveTheme = (o?: VizBaseOpts) => o?.theme ?? getTheme();
export const resolveGL = (o?: VizBaseOpts) => (o?.webgl ?? true) && webglAvailable();

/** Creates the module frame inside host. */
export function frame(host: HTMLElement, cls: string, ariaLabel: string) {
  ensureFonts();
  const root = document.createElement('div');
  root.className = 'afi-viz ' + cls;
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', ariaLabel);
  host.appendChild(root);
  const labels = document.createElement('div');
  labels.className = 'afi-viz-labels';
  const cap = document.createElement('div');
  cap.className = 'afi-viz-cap';
  const tip = document.createElement('div');
  tip.className = 'afi-viz-tip';
  return {
    root, labels, cap, tip,
    mountChrome() { root.append(labels, cap, tip); },
    setCaption(s: string) { cap.textContent = s; cap.style.display = s ? '' : 'none'; },
    showTip(html: string, x: number, y: number) {
      tip.innerHTML = html; tip.classList.add('on');
      const w = root.clientWidth, tw = tip.offsetWidth;
      tip.style.left = Math.min(w - tw - 8, Math.max(8, x + 14)) + 'px';
      tip.style.top = Math.max(8, y - 36) + 'px';
    },
    hideTip() { tip.classList.remove('on'); },
    destroy() { root.remove(); },
  };
}

/** A 2D canvas that tracks its CSS size × devicePixelRatio. draw() receives CSS-pixel coordinates. */
export function dprCanvas(parent: HTMLElement, onResize?: (w: number, h: number) => void) {
  const c = document.createElement('canvas');
  parent.prepend(c);
  const g = c.getContext('2d')!;
  let w = 1, h = 1, dpr = 1;
  const fit = (notify = true) => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, parent.clientWidth); h = Math.max(1, parent.clientHeight);
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (notify) onResize?.(w, h);
  };
  const ro = new ResizeObserver(() => fit());
  ro.observe(parent);
  fit(false); // the ResizeObserver's first callback notifies (after the caller has its handle)
  return { canvas: c, g, get w() { return w; }, get h() { return h; }, get dpr() { return dpr; }, fit, destroy() { ro.disconnect(); c.remove(); } };
}

/** rAF loop that pauses when the tab is hidden or the element is off-screen. tick(dtSeconds, tSeconds). */
export function loop(el: HTMLElement, tick: (dt: number, t: number) => void) {
  let raf = 0, last = 0, t0 = 0, visible = true, running = true;
  const io = new IntersectionObserver((e) => { visible = e[0]?.isIntersecting ?? true; if (visible) kick(); });
  io.observe(el);
  const step = (now: number) => {
    raf = 0;
    if (!running || !visible || document.hidden) return;
    if (!t0) t0 = now;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    tick(dt, (now - t0) / 1000);
    raf = requestAnimationFrame(step);
  };
  const kick = () => { if (!raf && running) { last = 0; raf = requestAnimationFrame(step); } };
  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);
  kick();
  return {
    kick,
    stop() { running = false; if (raf) cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); },
  };
}

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** frame-rate independent exponential approach */
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const SVGNS = 'http://www.w3.org/2000/svg';
export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent?.appendChild(e);
  return e;
}

/** Wrap an oracle-view handle so that input.veiled hides all state data behind a fog (during execution). */
export function veilable<I extends { veiled?: boolean }>(host: HTMLElement, h: VizHandle<I>, th: AfiTheme): VizHandle<I> {
  const fog = document.createElement('div');
  fog.className = 'afi-viz-veil';
  fog.style.cssText = `position:absolute;inset:0;z-index:3;display:none;align-items:flex-end;padding:10px 14px;box-sizing:border-box;border-radius:var(--afi-radius,10px);background:radial-gradient(ellipse at 50% 60%, ${th.horizon}, ${th.fog} 70%, ${th.bg[0]});font-family:${th.fonts.mono};font-size:11px;color:${th.ink2};letter-spacing:.04em`;
  fog.textContent = '◇ ' + tv('veiled');
  host.style.position = host.style.position || 'relative';
  host.appendChild(fog);
  return {
    update(i) { if (i.veiled) { fog.style.display = 'flex'; return; } fog.style.display = 'none'; h.update(i); },
    destroy() { fog.remove(); h.destroy(); },
  };
}
