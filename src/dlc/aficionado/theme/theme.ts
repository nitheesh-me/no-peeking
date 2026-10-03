/**
 * Technical Aficionado: theme for canvas / WebGL / SVG (Visual Director).
 * The single source of colour, type and motion values for code that cannot read CSS variables cheaply.
 * tokens.css mirrors these values for DOM styling; applyTheme() writes them as CSS variables so that a second
 * theme (another AfiTheme object passed to setTheme) is a drop-in replacement for both.
 * No three.js / d3 imports here: the loading circuit uses this before those libraries arrive.
 */

export interface AfiTheme {
  id: string;
  /** night gradient, darkest → lightest */
  bg: [string, string, string];
  panel: string; panel2: string; line: string;
  ink: string; ink2: string; ink3: string;
  accent: string;   // luminous cyan: primary data colour
  accent2: string;  // warm gold: secondary data colour
  err: string;      // red: errors ONLY
  ok: string;
  paper: string; paperInk: string; paperInk2: string;
  /** fog colour for 3D scenes, horizon glow, deep sea */
  fog: string; horizon: string; sea: string;
  /** phase wheel anchors at arg = 0, π/2, π, −π/2 (interpolated in OKLab) */
  phaseAnchors: [string, string, string, string];
  /** stabilizer tile tints */
  tileZ: string; tileX: string;
  fonts: { title: string; mono: string; prose: string };
  motion: { ease: string; easeFn: (t: number) => number; fast: number; base: number; slow: number; veil: number };
  /** multiplier applied to type in presentation/lecture mode */
  lectureScale: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const DREAMSCAPE: AfiTheme = {
  id: 'dreamscape',
  bg: ['#070a16', '#0a0f22', '#0e1430'],
  panel: 'rgba(14,20,48,0.72)', panel2: 'rgba(22,30,66,0.86)', line: 'rgba(110,242,255,0.18)',
  ink: '#e6ecff', ink2: '#9aa6cf', ink3: '#5b6694',
  accent: '#6ef2ff', accent2: '#ffcf6e', err: '#ff5a5f', ok: '#8ef5b4',
  paper: '#f2f0eb', paperInk: '#0e0e0e', paperInk2: '#55524b',
  fog: '#0b1128', horizon: '#2a3a7a', sea: '#04060f',
  phaseAnchors: ['#6ef2ff', '#b59cff', '#ffcf6e', '#8ef5b4'],
  tileZ: '#6ef2ff', tileX: '#ffcf6e',
  fonts: {
    title: "'Quantum', 'Quicksand', sans-serif",
    mono: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
    prose: "'Quicksand', system-ui, sans-serif",
  },
  motion: { ease: 'cubic-bezier(0.65, 0, 0.35, 1)', easeFn: easeInOut, fast: 600, base: 900, slow: 1200, veil: 2600 },
  lectureScale: 1.35,
};

let current: AfiTheme = DREAMSCAPE;
const listeners = new Set<(t: AfiTheme) => void>();
export function getTheme(): AfiTheme { return current; }
export function setTheme(t: AfiTheme): void { current = t; listeners.forEach((f) => f(t)); }
export function onThemeChange(f: (t: AfiTheme) => void): () => void { listeners.add(f); return () => listeners.delete(f); }

/** Write the theme as CSS variables onto an element (the DLC root). tokens.css holds the same defaults. */
export function applyTheme(el: HTMLElement, t: AfiTheme = current): void {
  const v: Record<string, string> = {
    '--afi-bg': t.bg[0], '--afi-bg1': t.bg[1], '--afi-bg2': t.bg[2],
    '--afi-panel': t.panel, '--afi-panel2': t.panel2, '--afi-line': t.line,
    '--afi-ink': t.ink, '--afi-ink2': t.ink2, '--afi-ink3': t.ink3,
    '--afi-accent': t.accent, '--afi-accent2': t.accent2, '--afi-err': t.err, '--afi-ok': t.ok,
    '--afi-paper': t.paper, '--afi-paper-ink': t.paperInk, '--afi-paper-ink2': t.paperInk2,
    '--afi-fog': t.fog, '--afi-horizon': t.horizon, '--afi-sea': t.sea,
    '--afi-tile-z': t.tileZ, '--afi-tile-x': t.tileX,
    '--afi-font-title': t.fonts.title, '--afi-font-mono': t.fonts.mono, '--afi-font-prose': t.fonts.prose,
    '--afi-ease': t.motion.ease, '--afi-dur-fast': t.motion.fast + 'ms', '--afi-dur': t.motion.base + 'ms', '--afi-dur-slow': t.motion.slow + 'ms',
    '--afi-lecture-scale': String(t.lectureScale),
  };
  for (const k in v) el.style.setProperty(k, v[k]);
}

let fontsRequested = false;
/** Lazily request the mono webfont (Google Fonts). Quantum + Quicksand are already served from /fonts by the site. */
export function ensureFonts(): void {
  if (fontsRequested || typeof document === 'undefined') return;
  fontsRequested = true;
  try {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600&display=swap';
    document.head.appendChild(l);
  } catch { /* offline: system mono fallback */ }
}

// ───────────── colour maths (no deps) ─────────────
export type RGB = [number, number, number]; // 0..1 linear-ish sRGB components

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(f, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHex(c: RGB): string {
  return '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
}
/** css colour string with alpha from a hex token */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function rgbToOklab([r, g, b]: RGB): RGB {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklabToRgb([L, a, b]: RGB): RGB {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
export function mix(a: string, b: string, t: number): string {
  const A = rgbToOklab(hexToRgb(a)), B = rgbToOklab(hexToRgb(b));
  return rgbToHex(oklabToRgb([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]));
}

const wheelCache = new Map<string, RGB[]>();
/** Phase wheel: arg(a) ∈ (−π, π] → sRGB (0..1). 0 → accent (cyan), π/2 → violet, π → gold, −π/2 → mint. */
export function phaseRgb(phi: number, t: AfiTheme = current): RGB {
  let lut = wheelCache.get(t.id);
  if (!lut) {
    const an = t.phaseAnchors.map((h) => rgbToOklab(hexToRgb(h)));
    lut = [];
    for (let i = 0; i < 360; i++) {
      const u = (i / 360) * 4, k = Math.floor(u), f = u - k;
      const A = an[k % 4], B = an[(k + 1) % 4];
      lut.push(oklabToRgb([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]).map((v) => Math.max(0, Math.min(1, v))) as RGB);
    }
    wheelCache.set(t.id, lut);
  }
  const turns = (((phi / (2 * Math.PI)) % 1) + 1) % 1;
  return lut[Math.round(turns * 360) % 360];
}
export const phaseHex = (phi: number, t: AfiTheme = current) => rgbToHex(phaseRgb(phi, t));

/** Prefers-reduced-motion helper (callers may override with opts.reducedMotion). */
export function prefersReducedMotion(): boolean {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
