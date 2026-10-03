/**
 * 3D Bloch sphere widget (Codex + X-ray inspector). Owned by the Designer.
 * Physics: state |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩ ↔ Bloch vector (sinθcosφ, sinθsinφ, cosθ).
 * z is up (|0⟩ top, |1⟩ bottom), +x = |+⟩, −x = |−⟩, +y = |+i⟩, −y = |−i⟩.
 * A reduced (entangled/mixed) qubit has |r| < 1: the arrow ends INSIDE the sphere.
 * Rendering: orthographic camera (yaw about z, elevation), back-facing lines dashed and faded, all text drawn in screen
 * space so it never mirrors. Renders only while on screen; destroy() stops everything.
 */
import './../styles/bloch3d.css';
import type { Bloch } from '../core/contracts';
import { audio } from '../engine/deps';

export interface Bloch3DOpts {
  size?: number;                 // CSS px of the square canvas (default 260)
  interactive?: boolean;         // drag the state dot / arrow keys to move the state (default true)
  rotatable?: boolean;           // drag empty space to orbit the camera; slow idle spin (default true)
  measure?: boolean;             // show basis picker (Z / X / Y), Measure + Reset, probability bars, message (default false)
  labels?: 'kets' | 'game' | 'both'; // axis labels: |0⟩… vs ☀ Sunny / 🌙 Moony / swirl names (default 'both')
  initial?: Bloch;
  onChange?(b: Bloch): void;     // fires while dragging and after measuring
}
export interface Bloch3D {
  el: HTMLElement;
  set(b: Bloch, animate?: boolean): void;
  get(): Bloch;
  destroy(): void;
}

type V = [number, number, number];
type Basis = 'Z' | 'X' | 'Y';
const INK = '#0e0e0e', PAPER = '#f2f0eb';
const SUNNY: V = [255, 183, 43], MOONY: V = [108, 99, 255];
const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const len = (v: V) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mixc = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c: V, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;
const ease = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
const KET = { Z: ['|0⟩', '|1⟩'], X: ['|+⟩', '|−⟩'], Y: ['|+i⟩', '|−i⟩'] } as const;
const GAME = { Z: ['☀ Sunny', '🌙 Moony'], X: ['swirl +', 'swirl −'], Y: ['swirl +i', 'swirl −i'] } as const;
const AXIS: Record<Basis, V> = { Z: [0, 0, 1], X: [1, 0, 0], Y: [0, 1, 0] };

export function createBloch3D(opts: Bloch3DOpts = {}): Bloch3D {
  const size = opts.size ?? 260;
  const interactive = opts.interactive ?? true, rotatable = opts.rotatable ?? true;
  const labels = opts.labels ?? 'both';
  const init: V = opts.initial ? [opts.initial.x, opts.initial.y, opts.initial.z] : [0, 0, 1];
  let st: V = [...init];
  let anim: { from: V; to: V; t0: number; dur: number } | null = null;
  let yaw = 0.42, elev = 0.32, lastInteract = -1e9;
  let pop: { t0: number; v: V } | null = null;

  // ── DOM ──
  const el = document.createElement('div');
  el.className = 'bloch3d' + (opts.measure ? ' b3-measure' : '');
  el.style.setProperty('--b3', size + 'px');
  const canvas = document.createElement('canvas');
  canvas.className = 'b3-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.style.width = canvas.style.height = size + 'px';
  const cap = document.createElement('div');
  cap.className = 'b3-cap';
  el.append(canvas, cap);

  let basis: Basis = 'Z';
  let msg: HTMLElement | null = null, bars: { fill: HTMLElement; pct: HTMLElement; lab: HTMLElement }[] = [];
  let lastMeas: { basis: Basis; out: 0 | 1; v: V } | null = null;
  if (opts.measure) {
    const panel = document.createElement('div');
    panel.className = 'b3-panel';
    const radios = document.createElement('div');
    radios.className = 'b3-basis'; radios.setAttribute('role', 'radiogroup'); radios.setAttribute('aria-label', 'Measurement basis');
    const name = 'b3b' + Math.random().toString(36).slice(2, 7);
    for (const B of ['Z', 'X', 'Y'] as Basis[]) {
      const lab = document.createElement('label');
      const inp = document.createElement('input');
      inp.type = 'radio'; inp.name = name; inp.value = B; inp.checked = B === basis;
      inp.onchange = () => { basis = B; refreshBars(); };
      lab.append(inp, document.createTextNode(B));
      radios.append(lab);
    }
    const mBtn = document.createElement('button'); mBtn.className = 'btn small sun'; mBtn.textContent = 'Measure'; mBtn.onclick = () => measure();
    const rBtn = document.createElement('button'); rBtn.className = 'btn small'; rBtn.textContent = 'Reset'; rBtn.onclick = () => reset();
    const row = document.createElement('div'); row.className = 'b3-row';
    const bl = document.createElement('span'); bl.className = 'b3-k'; bl.textContent = 'Basis';
    row.append(bl, radios, mBtn, rBtn);
    const barBox = document.createElement('div'); barBox.className = 'b3-bars';
    bars = [0, 1].map((i) => {
      const r = document.createElement('div'); r.className = 'b3-bar';
      const lab = document.createElement('span'); lab.className = 'b3-bl';
      const track = document.createElement('span'); track.className = 'b3-track';
      const fill = document.createElement('span'); fill.className = 'b3-fill b3-f' + i;
      track.append(fill);
      const pct = document.createElement('span'); pct.className = 'b3-pct';
      r.append(lab, track, pct); barBox.append(r);
      return { fill, pct, lab };
    });
    msg = document.createElement('p'); msg.className = 'b3-msg'; msg.setAttribute('aria-live', 'polite');
    msg.textContent = 'Drag the dot to set a dream, pick a basis, then Measure.';
    panel.append(row, barBox, msg);
    el.append(panel);
  }

  // ── geometry ──
  const ctx = canvas.getContext('2d')!;
  let dpr = 1;
  const resize = () => { dpr = Math.min(3, window.devicePixelRatio || 1); canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr); };
  resize();
  const R = size * 0.32, cx = size / 2, cy = size * 0.5;
  const fs = Math.max(10, size / 24); // label font size
  let rgt: V = [0, 1, 0], up: V = [0, 0, 1], fwd: V = [1, 0, 0];
  const camera = () => {
    const ca = Math.cos(yaw), sa = Math.sin(yaw), ce = Math.cos(elev), se = Math.sin(elev);
    fwd = [ce * ca, ce * sa, se];      // toward the viewer
    rgt = [-sa, ca, 0];
    up = [-se * ca, -se * sa, ce];
  };
  const proj = (p: V) => ({ x: cx + R * dot(p, rgt), y: cy - R * dot(p, up), d: dot(p, fwd) });

  const cur = (): V => st;
  const toBloch = (v: V): Bloch => ({ x: v[0], y: v[1], z: v[2] });

  // ── drawing helpers ──
  const curve = (pts: V[], width: number, front: boolean, alpha: number, color = INK) => {
    // draw only the segments on the requested side (front: depth ≥ 0)
    ctx.lineWidth = width; ctx.strokeStyle = color; ctx.globalAlpha = alpha;
    ctx.setLineDash(front ? [] : [3, 4]);
    ctx.beginPath();
    let pen = false;
    for (const p of pts) {
      const q = proj(p);
      const vis = front ? q.d >= -0.01 : q.d <= 0.01;
      if (vis) { if (pen) ctx.lineTo(q.x, q.y); else { ctx.moveTo(q.x, q.y); pen = true; } } else pen = false;
    }
    ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  };
  const circlePts = (f: (a: number) => V, n = 96) => Array.from({ length: n + 1 }, (_, i) => f((i / n) * TAU));
  const EQUATOR = circlePts((a) => [Math.cos(a), Math.sin(a), 0]);
  const MER_XZ = circlePts((a) => [Math.sin(a), 0, Math.cos(a)]);
  const MER_YZ = circlePts((a) => [0, Math.sin(a), Math.cos(a)]);
  const WIRE: V[][] = [
    ...[-0.5, 0.5].map((z) => circlePts((a) => [Math.cos(a) * Math.sqrt(1 - z * z), Math.sin(a) * Math.sqrt(1 - z * z), z])),
    ...[Math.PI / 4, (3 * Math.PI) / 4].map((ph) => circlePts((a) => [Math.sin(a) * Math.cos(ph), Math.sin(a) * Math.sin(ph), Math.cos(a)])),
  ];
  const arrowHead = (from: { x: number; y: number }, to: { x: number; y: number }, sz: number, fill: string) => {
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - Math.cos(a - 0.45) * sz, to.y - Math.sin(a - 0.45) * sz);
    ctx.lineTo(to.x - Math.cos(a + 0.45) * sz, to.y - Math.sin(a + 0.45) * sz);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };
  const text = (s: string, x: number, y: number, size: number, opt: { color?: string; weight?: number; font?: string; alpha?: number; halo?: boolean } = {}) => {
    ctx.save();
    ctx.globalAlpha = opt.alpha ?? 1;
    ctx.font = `${opt.weight ?? 700} ${size}px ${opt.font ?? 'Quicksand, system-ui, sans-serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (opt.halo !== false) { ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(242,240,235,0.92)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = opt.color ?? INK; ctx.fillText(s, x, y);
    ctx.restore();
  };
  const dreamColor = (v: V) => {
    const r = len(v) || 1;
    const base = mixc(MOONY, SUNNY, clamp((1 + v[2] / r) / 2));
    const eq = Math.hypot(v[0], v[1]) / r;
    const rim = hsl(165 + (Math.atan2(v[1], v[0]) * 180) / Math.PI, 85, 62);
    return { base, eq, rim };
  };

  // ── frame ──
  let raf = 0, visible = true, dead = false, lastT = performance.now();
  const frame = (now: number) => {
    raf = 0;
    if (dead) return;
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (rotatable && !drag && now - lastInteract > 2500) yaw += dt * 0.18;
    if (anim) {
      const k = ease((now - anim.t0) / anim.dur);
      const v = mixc(anim.from, anim.to, k);
      // keep it on the sphere if both ends are pure
      const L0 = len(anim.from), L1 = len(anim.to), Lw = L0 + (L1 - L0) * k, l = len(v);
      st = l > 1e-4 ? [v[0] / l * Lw, v[1] / l * Lw, v[2] / l * Lw] : v;
      if (k >= 1) { st = anim.to; anim = null; refreshBars(); }
    }
    draw(now / 1000);
    if (visible) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && !dead && visible) { lastT = performance.now(); raf = requestAnimationFrame(frame); } };

  function draw(t: number) {
    camera();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // sphere body: soft paper glass with a contact shadow
    const sh = ctx.createRadialGradient(cx, cy + R * 1.18, 2, cx, cy + R * 1.18, R * 0.95);
    sh.addColorStop(0, 'rgba(14,14,30,0.18)'); sh.addColorStop(1, 'rgba(14,14,30,0)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(cx, cy + R * 1.18, R * 0.95, R * 0.2, 0, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.05, cx, cy, R * 1.05);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f6f3ec'); g.addColorStop(1, '#ddd8cc');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    // back half: wireframe, great circles, axes
    WIRE.forEach((w) => curve(w, 0.8, false, 0.16));
    [EQUATOR, MER_XZ, MER_YZ].forEach((c) => curve(c, 1.1, false, 0.32));
    drawAxes(false);
    const v = cur(), tip = proj(v);
    if (tip.d < 0) drawState(t, v, false);
    // front half
    WIRE.forEach((w) => curve(w, 0.8, true, 0.22));
    curve(EQUATOR, 1.6, true, 0.75);
    [MER_XZ, MER_YZ].forEach((c) => curve(c, 1.1, true, 0.5));
    // rim
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R - 3, Math.PI * 1.08, Math.PI * 1.42); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    drawAxes(true);
    if (tip.d >= 0) drawState(t, v, true);
    drawLabels();
    if (pop) {
      const k = (performance.now() - pop.t0) / 450;
      if (k >= 1) pop = null;
      else { const q = proj(pop.v); ctx.beginPath(); ctx.arc(q.x, q.y, 6 + k * 22, 0, TAU); ctx.lineWidth = 3 * (1 - k); ctx.strokeStyle = INK; ctx.globalAlpha = 1 - k; ctx.stroke(); ctx.globalAlpha = 1; }
    }
  }

  function drawAxes(front: boolean) {
    for (const [ax, name] of [[[1, 0, 0], 'x'], [[0, 1, 0], 'y'], [[0, 0, 1], 'z']] as [V, string][]) {
      const pos = proj([ax[0] * 1.3, ax[1] * 1.3, ax[2] * 1.3]), neg = proj([-ax[0] * 1.15, -ax[1] * 1.15, -ax[2] * 1.15]), o = proj([0, 0, 0]);
      // positive half
      if ((pos.d >= 0) === front) {
        ctx.globalAlpha = front ? 1 : 0.4; ctx.setLineDash(front ? [] : [3, 4]);
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(pos.x, pos.y); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
        ctx.setLineDash([]);
        arrowHead(o, pos, 9, INK);
        ctx.globalAlpha = 1;
      }
      if ((neg.d >= 0) === front) {
        ctx.globalAlpha = front ? 0.7 : 0.3; ctx.setLineDash(front ? [] : [3, 4]);
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(neg.x, neg.y); ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      void name;
    }
  }

  function drawLabels() {
    // axis letters at the arrow tips (italic, Quantum-ish weight), ket labels at the six poles
    const insideBack = (q: { x: number; y: number; d: number }) => q.d < 0 && Math.hypot(q.x - cx, q.y - cy) < R + 4;
    for (const [ax, name] of [[[1, 0, 0], 'x'], [[0, 1, 0], 'y'], [[0, 0, 1], 'z']] as [V, string][]) {
      // axis letter just past the arrow tip, nudged sideways (perpendicular to the axis on screen) so it never sits on a ket
      const o = proj([0, 0, 0]), q = proj([ax[0] * 1.3, ax[1] * 1.3, ax[2] * 1.3]);
      let dx = q.x - o.x, dy = q.y - o.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const side = name === 'z' ? 1 : dx >= 0 ? -1 : 1;
      const lx = q.x + dx * 8 + -dy * side * 10, ly = q.y + dy * 8 + dx * side * 10;
      text(name, lx, ly, fs * 1.1, { font: 'Quantum, Quicksand, sans-serif', weight: 400, alpha: q.d < -0.3 ? 0.55 : 1, color: '#c8241e' });
    }
    const poles: [V, string, string][] = [
      [[0, 0, 1], KET.Z[0], GAME.Z[0]], [[0, 0, -1], KET.Z[1], GAME.Z[1]],
      [[1, 0, 0], KET.X[0], GAME.X[0]], [[-1, 0, 0], KET.X[1], GAME.X[1]],
      [[0, 1, 0], KET.Y[0], GAME.Y[0]], [[0, -1, 0], KET.Y[1], GAME.Y[1]],
    ];
    for (const [p, ket, game] of poles) {
      const q = proj(p);
      const a = insideBack(q) ? 0.45 : 1;
      ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(q.x, q.y, 2.6, 0, TAU); ctx.fillStyle = INK; ctx.fill(); ctx.globalAlpha = 1;
      // z poles: label to the upper/lower LEFT of the axis; equator poles: label just below the point
      const zp = p[2] !== 0;
      const both = labels === 'both';
      const lx = zp ? q.x - fs * 2.1 : q.x;
      const ly = zp ? q.y + (p[2] > 0 ? -fs * 0.55 : fs * 0.55) : q.y + fs * 0.95;
      const la = zp ? 1 : a; // the z-pole labels sit outside the disc, keep them crisp
      const col = p[2] === 1 ? '#b37400' : p[2] === -1 ? '#4b43d6' : '#7a3fb8';
      if (labels !== 'game') text(ket, lx, ly, fs, { alpha: la });
      if (labels !== 'kets') {
        const gy = !both ? ly : zp ? ly + (p[2] > 0 ? -fs * 1.05 : fs * 1.05) : ly + fs * 0.95;
        text(game, lx, gy, fs * 0.8, { alpha: la * 0.95, color: col });
      }
    }
  }

  function drawState(t: number, v: V, front: boolean) {
    const r = len(v);
    const o = proj([0, 0, 0]), tip = proj(v);
    const { base, eq, rim } = dreamColor(v);
    const fade = front ? 1 : 0.55;
    // projection guides (dotted): tip → equator plane, origin → foot, θ and φ arcs
    if (r > 0.05 && Math.hypot(v[0], v[1]) > 0.04) {
      const foot = proj([v[0], v[1], 0]);
      ctx.save(); ctx.globalAlpha = 0.75 * fade; ctx.setLineDash([2, 3]); ctx.lineWidth = 1.3; ctx.strokeStyle = '#55524b';
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(foot.x, foot.y); ctx.moveTo(o.x, o.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      ctx.setLineDash([]);
      // φ arc in the equator plane from +x
      const ph = Math.atan2(v[1], v[0]), ar = 0.3;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const a = (ph * i) / 24, q = proj([Math.cos(a) * ar, Math.sin(a) * ar, 0]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
      ctx.strokeStyle = '#b04dff'; ctx.lineWidth = 1.6; ctx.stroke();
      const mph = proj([Math.cos(ph / 2) * (ar + 0.14), Math.sin(ph / 2) * (ar + 0.14), 0]);
      text('φ', mph.x, mph.y, fs * 0.9, { color: '#7a2fc0' });
      // θ arc from +z toward the state, in their common plane
      const th = Math.acos(clamp(v[2] / r, -1, 1)), cp = Math.cos(ph), sp = Math.sin(ph), at = 0.38;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const a = (th * i) / 24, q = proj([Math.sin(a) * cp * at, Math.sin(a) * sp * at, Math.cos(a) * at]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
      ctx.strokeStyle = '#d98f00'; ctx.stroke();
      const mth = proj([Math.sin(th / 2) * cp * (at + 0.14), Math.sin(th / 2) * sp * (at + 0.14), Math.cos(th / 2) * (at + 0.14)]);
      text('θ', mth.x, mth.y, fs * 0.9, { color: '#9a6400' });
      ctx.restore();
    }
    // arrow shaft: ink outline + dream-colour core
    ctx.save();
    ctx.globalAlpha = fade;
    const shaftEnd = { x: tip.x - (tip.x - o.x) * Math.min(0.5, 7 / (Math.hypot(tip.x - o.x, tip.y - o.y) || 1)), y: tip.y - (tip.y - o.y) * Math.min(0.5, 7 / (Math.hypot(tip.x - o.x, tip.y - o.y) || 1)) };
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(shaftEnd.x, shaftEnd.y);
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = rgba(base); ctx.stroke();
    // tip dot
    const mist = 1 - clamp(r);
    const dr = 8.5;
    if (mist > 0.04) {
      const fg = ctx.createRadialGradient(tip.x, tip.y, 2, tip.x, tip.y, 24);
      fg.addColorStop(0, `rgba(225,222,245,${0.7 * mist})`); fg.addColorStop(1, 'rgba(225,222,245,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(tip.x, tip.y, 24, 0, TAU); ctx.fill();
      for (let i = 0; i < 4; i++) { const a = t * 0.7 + i * 1.6; ctx.fillStyle = `rgba(235,233,250,${0.45 * mist})`; ctx.beginPath(); ctx.arc(tip.x + Math.cos(a) * 12, tip.y + Math.sin(a * 1.3) * 8, 4, 0, TAU); ctx.fill(); }
    }
    const pulse = 1 + 0.06 * Math.sin(t * 3);
    ctx.globalAlpha = fade * (1 - 0.35 * mist);
    const dg = ctx.createRadialGradient(tip.x - 3, tip.y - 3, 1, tip.x, tip.y, dr * pulse);
    dg.addColorStop(0, rgba(mixc(base, [255, 255, 255], 0.5))); dg.addColorStop(1, rgba(base));
    ctx.beginPath(); ctx.arc(tip.x, tip.y, dr * pulse, 0, TAU); ctx.fillStyle = dg; ctx.fill();
    if (eq > 0.05) { ctx.lineWidth = 2.5; ctx.strokeStyle = rim; ctx.globalAlpha = fade * eq; ctx.beginPath(); ctx.arc(tip.x, tip.y, dr * pulse - 1.5, 0, TAU); ctx.stroke(); ctx.globalAlpha = fade; }
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(tip.x, tip.y, dr * pulse, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(tip.x - 2.8, tip.y - 2.8, 2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ── captions, bars, aria ──
  const deg = (r: number) => Math.round((r * 180) / Math.PI);
  function stateName(v: V): string {
    const r = len(v);
    if (r < 0.98) return '';
    const cands: [V, string][] = [[[0, 0, 1], '|0⟩ ☀ Sunny'], [[0, 0, -1], '|1⟩ 🌙 Moony'], [[1, 0, 0], '|+⟩ swirl +'], [[-1, 0, 0], '|−⟩ swirl −'], [[0, 1, 0], '|+i⟩'], [[0, -1, 0], '|−i⟩']];
    for (const [c, n] of cands) if (dot(c, v) > 0.995) return n;
    return '';
  }
  function refreshCaption() {
    const v = cur(), r = len(v);
    const th = r > 1e-6 ? Math.acos(clamp(v[2] / r, -1, 1)) : 0;
    const ph = ((Math.atan2(v[1], v[0]) % TAU) + TAU) % TAU;
    const p0 = Math.round(((1 + v[2]) / 2) * 100);
    if (r < 0.98) cap.innerHTML = `<b>|r| = ${r.toFixed(2)}</b> · shared with another Qubble (entangled)`;
    else { const n = stateName(v); cap.innerHTML = `${n ? `<b>${n}</b> · ` : ''}θ = ${deg(th)}°, φ = ${deg(ph)}° · P(0) = ${p0}%`; }
    canvas.setAttribute('aria-label', `Bloch sphere. Bloch vector x ${v[0].toFixed(2)}, y ${v[1].toFixed(2)}, z ${v[2].toFixed(2)}. ` +
      (r < 0.98 ? `Length ${r.toFixed(2)}: entangled with another qubit. ` : `theta ${deg(th)} degrees, phi ${deg(ph)} degrees. `) +
      (interactive ? 'Arrow keys change the state; shift plus arrows turn the view.' : ''));
  }
  function refreshBars() {
    refreshCaption();
    if (!bars.length) return;
    const c = dot(cur(), AXIS[basis]);
    const p = [(1 + c) / 2, (1 - c) / 2];
    bars.forEach((b, i) => {
      b.fill.style.width = (p[i] * 100).toFixed(1) + '%';
      b.pct.textContent = Math.round(p[i] * 100) + '%';
      b.lab.textContent = labels === 'kets' ? KET[basis][i] : `${KET[basis][i]}${labels === 'both' ? ' ' + GAME[basis][i] : ''}`;
      if (labels === 'game') b.lab.textContent = GAME[basis][i];
    });
    el.dataset.basis = basis;
  }

  // ── measurement ──
  let movedSinceMeas = false;
  function measure() {
    const v = cur(), ax = AXIS[basis];
    const p0 = clamp((1 + dot(v, ax)) / 2);
    const out: 0 | 1 = Math.random() < p0 ? 0 : 1;
    const target: V = out === 0 ? [...ax] : [-ax[0], -ax[1], -ax[2]];
    const ket = KET[basis][out], game = GAME[basis][out];
    let line: string;
    const other = basis === 'Z' ? 'X' : 'Z';
    if (!lastMeas || movedSinceMeas) line = `It collapsed to ${ket}${labels !== 'kets' ? ` (${game})` : ''}. Measure in ${basis} again and you'll get ${ket} every single time. Now try the other basis (${other}).`;
    else if (lastMeas.basis === basis) line = `${ket} again. Same basis, same answer: once it's collapsed, it stays put.`;
    else line = `Switching bases scrambled it: it's ${ket} now, and the previous answer (${KET[lastMeas.basis][lastMeas.out]}) is gone for good.`;
    lastMeas = { basis, out, v: target }; movedSinceMeas = false;
    if (msg) msg.textContent = line;
    try { audio.sfx('peek_collapse'); } catch { /* audio optional */ }
    tween(target, 420);
    setTimeout(() => { if (!dead) { pop = { t0: performance.now(), v: target }; opts.onChange?.(toBloch(target)); kick(); } }, 420);
    el.classList.add('b3-flash'); setTimeout(() => el.classList.remove('b3-flash'), 450);
  }
  function reset() {
    tween([...init], 380);
    lastMeas = null; movedSinceMeas = false;
    if (msg) msg.textContent = 'Fresh qubit. Drag the dot, then measure.';
    setTimeout(() => opts.onChange?.(toBloch(init)), 380);
  }
  function tween(to: V, dur: number) { anim = { from: [...cur()], to, t0: performance.now(), dur }; kick(); }

  // ── interaction ──
  let drag: 'state' | 'orbit' | null = null, px0 = 0, py0 = 0;
  const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * size, y: ((e.clientY - r.top) / r.height) * size }; };
  canvas.addEventListener('pointerdown', (e) => {
    const p = local(e); camera();
    const tip = proj(cur());
    lastInteract = performance.now();
    if (interactive && Math.hypot(p.x - tip.x, p.y - tip.y) < 16) drag = 'state';
    else if (rotatable) drag = 'orbit';
    else return;
    px0 = p.x; py0 = p.y; canvas.setPointerCapture(e.pointerId); canvas.classList.add('b3-drag'); e.preventDefault(); kick();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!drag) {
      if (interactive) { camera(); const tip = proj(cur()); canvas.style.cursor = Math.hypot(p.x - tip.x, p.y - tip.y) < 16 ? 'grab' : rotatable ? 'move' : 'default'; }
      return;
    }
    lastInteract = performance.now();
    if (drag === 'orbit') {
      yaw -= (p.x - px0) * 0.012; elev = clamp(elev + (p.y - py0) * 0.012, -1.25, 1.25);
      px0 = p.x; py0 = p.y;
    } else {
      camera();
      let u = (p.x - cx) / R, w = (cy - p.y) / R;
      const q = u * u + w * w;
      const back = proj(cur()).d < -0.05;
      let d = 0;
      if (q > 1) { const L = Math.sqrt(q); u /= L; w /= L; } else d = Math.sqrt(1 - q) * (back ? -1 : 1);
      const v: V = [u * rgt[0] + w * up[0] + d * fwd[0], u * rgt[1] + w * up[1] + d * fwd[1], u * rgt[2] + w * up[2] + d * fwd[2]];
      const l = len(v) || 1;
      st = [v[0] / l, v[1] / l, v[2] / l]; anim = null; movedSinceMeas = true;
      refreshBars(); opts.onChange?.(toBloch(st));
    }
    kick();
  });
  const endDrag = (e: PointerEvent) => { if (!drag) return; drag = null; canvas.classList.remove('b3-drag'); try { canvas.releasePointerCapture(e.pointerId); } catch { /* */ } };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return;
    e.preventDefault(); lastInteract = performance.now();
    if (e.shiftKey || !interactive) {
      if (!rotatable) return;
      if (k === 'ArrowLeft') yaw += 0.15; if (k === 'ArrowRight') yaw -= 0.15;
      if (k === 'ArrowUp') elev = clamp(elev + 0.12, -1.25, 1.25); if (k === 'ArrowDown') elev = clamp(elev - 0.12, -1.25, 1.25);
    } else {
      const v = cur(), r = len(v) || 1;
      let th = Math.acos(clamp(v[2] / r, -1, 1)), ph = Math.atan2(v[1], v[0]);
      const step = Math.PI / 36;
      if (k === 'ArrowUp') th = Math.max(0, th - step); if (k === 'ArrowDown') th = Math.min(Math.PI, th + step);
      if (k === 'ArrowLeft') ph -= step; if (k === 'ArrowRight') ph += step;
      st = [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)]; anim = null; movedSinceMeas = true;
      refreshBars(); opts.onChange?.(toBloch(st));
    }
    kick();
  });

  // ── lifecycle: render only while on screen ──
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => { visible = es.some((x) => x.isIntersecting); if (visible) kick(); }) : null;
  io?.observe(el);
  const onDpr = () => { resize(); kick(); };
  window.addEventListener('resize', onDpr);
  refreshBars();
  kick();
  // draw one frame immediately (useful before layout / for thumbnails)
  draw(performance.now() / 1000);

  return {
    el,
    set(nb: Bloch, animate = false) {
      const v: V = [nb.x, nb.y, nb.z];
      movedSinceMeas = true;
      if (animate) tween(v, 380); else { st = v; anim = null; refreshBars(); kick(); }
    },
    get: () => toBloch(cur()),
    destroy() { dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; io?.disconnect(); window.removeEventListener('resize', onDpr); el.remove(); },
  };
}
