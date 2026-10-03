/**
 * Doodle comments (7 Billion Humans-style). A drawing is stored in NOTE.drawing as compact text:
 * strokes separated by "|", each "<colourIndex>:M x y L x y …" in a 0..100 × 0..40 box (integers).
 * It contains no "}" so it round-trips through the Bot Code text form `# note {draw:…}`.
 */
import { h, modal } from '../../engine/util';

export const DOODLE_W = 100, DOODLE_H = 40;
export const PENS = ['#0e0e0e', '#fe443d', '#ffb72b', '#6c63ff', '#3ddc97'];

interface Stroke { c: number; pts: [number, number][] }

export function parseDoodle(s: string | undefined): Stroke[] {
  if (!s) return [];
  const out: Stroke[] = [];
  for (const part of s.split('|')) {
    const m = part.match(/^(\d):(.*)$/);
    const body = m ? m[2] : part;
    const nums = body.replace(/[ML]/g, ' ').trim().split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    if (pts.length) out.push({ c: m ? Math.min(PENS.length - 1, +m[1]) : 0, pts });
  }
  return out;
}

export function serializeDoodle(strokes: Stroke[]): string {
  return strokes.filter((st) => st.pts.length).map((st) =>
    `${st.c}:` + st.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.round(x)} ${Math.round(y)}`).join('')).join('|');
}

/** Inline SVG preview of a doodle (for cards). */
export function doodleSvg(s: string | undefined, cls = 'doodle'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${DOODLE_W} ${DOODLE_H}`);
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  for (const st of parseDoodle(s)) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', st.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('') + (st.pts.length === 1 ? 'l0.1 0' : ''));
    p.setAttribute('stroke', PENS[st.c]);
    p.setAttribute('fill', 'none'); p.setAttribute('stroke-width', '2.2');
    p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
  }
  return svg;
}

/** Opens the doodle pad; calls done(drawing, text) on save. */
export function openDoodle(initial: string | undefined, text: string, done: (drawing: string | undefined, text: string) => void): void {
  const SCALE = 5;
  let strokes = parseDoodle(initial);
  const undoStack: Stroke[][] = [];
  let pen = 0, erasing = false, cur: Stroke | null = null;
  const cv = h('canvas', { class: 'doodle-pad', width: DOODLE_W * SCALE, height: DOODLE_H * SCALE }) as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const redraw = () => {
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#fffdf6'; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = '#e8e5de'; g.lineWidth = 1;
    for (let y = 40; y < cv.height; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(cv.width, y); g.stroke(); }
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 2.2 * SCALE;
    for (const st of strokes) {
      g.strokeStyle = PENS[st.c]; g.beginPath();
      st.pts.forEach(([x, y], i) => (i ? g.lineTo(x * SCALE, y * SCALE) : g.moveTo(x * SCALE, y * SCALE)));
      if (st.pts.length === 1) g.lineTo(st.pts[0][0] * SCALE + 0.5, st.pts[0][1] * SCALE);
      g.stroke();
    }
  };
  const at = (e: PointerEvent): [number, number] => {
    const r = cv.getBoundingClientRect();
    return [Math.max(0, Math.min(DOODLE_W, ((e.clientX - r.left) / r.width) * DOODLE_W)), Math.max(0, Math.min(DOODLE_H, ((e.clientY - r.top) / r.height) * DOODLE_H))];
  };
  const eraseAt = (p: [number, number]) => {
    const before = strokes.length;
    strokes = strokes.filter((st) => !st.pts.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 3));
    if (strokes.length !== before) redraw();
  };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    undoStack.push(strokes.map((s) => ({ c: s.c, pts: [...s.pts] })));
    const p = at(e);
    if (erasing) { eraseAt(p); return; }
    cur = { c: pen, pts: [p] }; strokes.push(cur); redraw();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!(e.buttons & 1)) return;
    const p = at(e);
    if (erasing) { eraseAt(p); return; }
    if (!cur) return;
    const last = cur.pts[cur.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1.2) { cur.pts.push(p); redraw(); }
  });
  cv.addEventListener('pointerup', () => { cur = null; });

  const penBtns = PENS.map((col, i) => {
    const b = h('button', { class: 'pen' + (i === pen ? ' on' : ''), title: 'Pen', style: `background:${col}`, type: 'button' });
    b.addEventListener('click', () => { pen = i; erasing = false; sync(); });
    return b;
  });
  const eraser = h('button', { class: 'btn small', type: 'button', title: 'Eraser: rub out whole strokes' }, '🧽 Eraser');
  eraser.addEventListener('click', () => { erasing = !erasing; sync(); });
  const sync = () => { penBtns.forEach((b, i) => b.classList.toggle('on', !erasing && i === pen)); eraser.classList.toggle('sun', erasing); cv.style.cursor = erasing ? 'cell' : 'crosshair'; };
  const textIn = h('input', { class: 'note-input', value: text, maxlength: 60, placeholder: 'note to self' }) as HTMLInputElement;

  let close = () => {};
  const body = h('div', { class: 'doodle-modal' },
    h('h2', null, '✏️ Doodle note'),
    textIn,
    cv,
    h('div', { class: 'row doodle-tools' }, ...penBtns, eraser,
      h('button', { class: 'btn small', type: 'button', title: 'Undo', onclick: () => { const s = undoStack.pop(); if (s) { strokes = s; redraw(); } } }, '↶ Undo'),
      h('button', { class: 'btn small', type: 'button', onclick: () => { undoStack.push(strokes); strokes = []; redraw(); } }, 'Clear')),
    h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:10px' },
      h('button', { class: 'btn small', type: 'button', onclick: () => close() }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => { const d = serializeDoodle(strokes); done(d || undefined, textIn.value); close(); } }, 'Done')),
  );
  close = modal(body, { cls: 'doodle-wrap' });
  sync(); redraw();
}
