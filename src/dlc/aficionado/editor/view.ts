/**
 * Circuit editor: wires (data qubits, then ancillas) × time columns, rendered as SVG.
 * Palette drag/click placement, two-click two-qubit gates, multi-select (click, shift-click, marquee),
 * move by drag or Alt+arrows, delete, undo/redo, condition editor (classically controlled gates),
 * and full keyboard operation (see KEYS in docs/AFICIONADO_NOTES.md § Editor).
 */
import type { Cond, LevelDef, QubitId } from '../../../core/contracts';
import { isBot } from '../../../core/contracts';
import { gateHelp, gateName, stageName } from '../state/names';
import { t } from '../../../i18n/index';
import { classicalBits, cloneCols, isTwo, newId, paletteFor, spanOf, wiresOf, type Column, type Gate, type GateKind, type PaletteItem, type Segment } from './model';

export interface EditorOpts {
  level: LevelDef;
  segments: Segment[];
  onChange(segs: Segment[]): void;
}
export interface EditorHandle {
  setSegments(segs: Segment[], record?: boolean): void;
  segments(): Segment[];
  /** highlight a column (by id) during playback; null clears */
  highlight(colId: number | null): void;
  /** lock editing (during a run) */
  setReadOnly(ro: boolean): void;
  undo(): void; redo(): void;
  focus(): void;
  destroy(): void;
}

const SVGNS = 'http://www.w3.org/2000/svg';
const CW = 48, RH = 42, GUT = 64, HEAD = 26, NOISE = 54, GATE = 30;
/** upper bound for scaling a small circuit up to the available space */
const MAX_SCALE = 1.8;
const LETTER: Record<GateKind, string> = { X: 'X', Z: 'Z', H: 'H', Y: 'Y', S: 'S', SDG: 'S†', CNOT: '⊕', CZ: '•', SWAP: '×', MEASURE: '', RESET: '|0⟩' };
const KEYGATE: Record<string, GateKind> = { x: 'X', z: 'Z', h: 'H', y: 'Y', s: 'S', d: 'SDG', m: 'MEASURE', r: 'RESET', c: 'CNOT', v: 'CZ', w: 'SWAP' };

type Tool = PaletteItem | null;
interface Cursor { seg: number; col: number; wire: number }
interface Hit { seg: number; col: number; wire: number }

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

export function createEditor(host: HTMLElement, opts: EditorOpts): EditorHandle {
  const level = opts.level;
  const wires = wiresOf(level);
  const palette = paletteFor(level);
  let segs: Segment[] = opts.segments.map((s) => ({ ...s, cols: cloneCols(s.cols) }));
  let readOnly = false;
  let tool: Tool = null;
  let pending: { seg: number; colId: number; gateId: number } | null = null; // 2-qubit gate awaiting its target
  const sel = new Set<number>();
  let cursor: Cursor = { seg: Math.max(0, segs.findIndex((s) => !s.locked)), col: 0, wire: 0 };
  let hl: number | null = null;
  let scale = 1;
  const undoStack: string[] = [], redoStack: string[] = [];

  const root = document.createElement('div');
  root.className = 'afi-editor';
  const pal = document.createElement('div');
  pal.className = 'afi-palette';
  pal.setAttribute('role', 'toolbar');
  pal.setAttribute('aria-label', t('afi.editor.palette'));
  const scroller = document.createElement('div');
  scroller.className = 'afi-grid-scroll';
  const svg = el('svg', { class: 'afi-grid', tabindex: 0, role: 'grid', 'aria-label': t('afi.editor.gridLabel') });
  scroller.appendChild(svg);
  const status = document.createElement('div');
  status.className = 'afi-editor-status';
  status.setAttribute('aria-live', 'polite');
  root.append(pal, scroller, status);
  host.appendChild(root);

  // ───── palette ─────
  const palBtns = new Map<Tool, HTMLButtonElement>();
  for (const k of palette) {
    const b = document.createElement('button');
    b.className = 'afi-pal-btn';
    b.dataset.tool = k;
    const glyph: Record<string, string> = { MEASURE: '⟨Z⟩', IF: 'if', END: 'end', WAIT: '𝒩', CNOT: '•⊕', CZ: '•–•', SWAP: '×–×', RESET: '|0⟩', SDG: 'S†' };
    b.innerHTML = `<span class="g">${glyph[k] ?? k}</span><span class="n">${gateName(k)}</span>`;
    b.title = gateHelp(k);
    b.addEventListener('click', () => { setTool(tool === k ? null : k); svg.focus(); });
    b.addEventListener('pointerdown', (e) => startPaletteDrag(e, k));
    pal.appendChild(b); palBtns.set(k, b);
  }
  const sep = document.createElement('span'); sep.className = 'afi-pal-sep'; pal.appendChild(sep);
  const mkAct = (key: string, fn: () => void) => { const b = document.createElement('button'); b.className = 'afi-pal-btn act'; b.textContent = t(key); b.addEventListener('click', fn); pal.appendChild(b); return b; };
  const undoBtn = mkAct('afi.editor.undo', () => undo());
  const redoBtn = mkAct('afi.editor.redo', () => redo());
  const delBtn = mkAct('afi.editor.delete', () => deleteSelection());
  const condBtn = palette.includes('IF') ? mkAct('afi.editor.condition', () => openCondEditor()) : null;

  function setTool(k: Tool) {
    tool = k; pending = null;
    palBtns.forEach((b, kk) => b.classList.toggle('on', kk === k));
    say(k ? t('afi.editor.toolArmed', { gate: gateName(k) }) : '');
    render();
  }
  const say = (s: string) => { status.textContent = s; };

  // ───── geometry ─────
  const bits = () => classicalBits(segs.flatMap((s) => s.cols), wires);
  const colsShown = (s: Segment) => s.cols.length + (s.locked || readOnly ? 0 : 1); // +1 append column
  function segX(i: number): number {
    let x = GUT;
    for (let k = 0; k < i; k++) { x += colsShown(segs[k]) * CW + 8; if (segs[k].phase === 'bedtime' && segs[k + 1]?.phase === 'morning') x += NOISE; }
    return x;
  }
  const colX = (seg: number, col: number) => segX(seg) + col * CW + CW / 2;
  const wireY = (w: number) => HEAD + w * RH + RH / 2;
  const bitY = (b: number) => HEAD + wires.length * RH + 14 + b * 22;

  function hitAt(clientX: number, clientY: number): Hit | null {
    const r = svg.getBoundingClientRect();
    const x = (clientX - r.left) / scale, y = (clientY - r.top) / scale;
    const w = Math.floor((y - HEAD) / RH);
    if (w < 0 || w >= wires.length) return null;
    for (let s = 0; s < segs.length; s++) {
      const x0 = segX(s), n = colsShown(segs[s]);
      if (x >= x0 && x < x0 + n * CW) return { seg: s, col: Math.floor((x - x0) / CW), wire: w };
    }
    return null;
  }

  // ───── model helpers ─────
  const occupant = (s: Segment, col: number, wire: QubitId): Gate | undefined => s.cols[col]?.gates.find((g) => spanOf(g, wires).includes(wire));
  const editable = (si: number) => !!segs[si] && !segs[si].locked && !readOnly;
  function ensureCol(s: Segment, col: number): Column { while (s.cols.length <= col) s.cols.push({ id: newId(), gates: [] }); return s.cols[col]; }
  function trim(s: Segment) { while (s.cols.length && !s.cols[s.cols.length - 1].gates.length && !s.cols[s.cols.length - 1].ctrl) s.cols.pop(); }
  const snap = () => JSON.stringify(segs.map((s) => s.cols));
  function record() { undoStack.push(snap()); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0; }
  function commit() { segs.forEach(trim); render(); opts.onChange(segs.map((s) => ({ ...s, cols: cloneCols(s.cols) }))); }
  function restore(st: string) { const cs = JSON.parse(st) as Column[][]; segs = segs.map((s, i) => ({ ...s, cols: cs[i] ?? s.cols })); sel.clear(); pending = null; commit(); }
  function undo() { if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()!); say(t('afi.editor.undone')); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()!); say(t('afi.editor.redone')); }
  function findGate(id: number): { s: number; c: number; g: Gate } | null {
    for (let s = 0; s < segs.length; s++) for (let c = 0; c < segs[s].cols.length; c++) { const g = segs[s].cols[c].gates.find((x) => x.id === id); if (g) return { s, c, g }; }
    return null;
  }

  function place(kind: Tool, h: Hit): boolean {
    if (!kind || !editable(h.seg)) return false;
    const s = segs[h.seg];
    const q = wires[h.wire];
    if (kind === 'IF') { const g = occupant(s, h.col, q); if (g) { sel.clear(); sel.add(g.id); render(); openCondEditor(); } else say(t('afi.editor.ifNeedsGate')); return !!g; }
    if (kind === 'END' || kind === 'WAIT') {
      if (s.cols[h.col] && (s.cols[h.col].gates.length || s.cols[h.col].ctrl)) { say(t('afi.editor.occupied')); return false; }
      record(); ensureCol(s, h.col).ctrl = { kind }; commit(); return true;
    }
    if (s.cols[h.col]?.ctrl) { say(t('afi.editor.occupied')); return false; }
    if (occupant(s, h.col, q)) { say(t('afi.editor.occupied')); flash(h); return false; }
    if (kind === 'RESET' && !isBot(q)) { say(t('afi.editor.err.resetData', { q })); flash(h); return false; }
    if (isTwo(kind)) {
      // control at the drop wire; default target = nearest free wire below (or above)
      let tw = -1;
      for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8]) {
        const w = h.wire + d; if (w < 0 || w >= wires.length) continue;
        const g: Gate = { id: 0, kind, q: wires[w], c: q };
        if (!spanOf(g, wires).some((x) => occupant(s, h.col, x))) { tw = w; break; }
      }
      if (tw < 0) { say(t('afi.editor.occupied')); return false; }
      record();
      const g: Gate = { id: newId(), kind, c: q, q: wires[tw] };
      ensureCol(s, h.col).gates.push(g);
      pending = { seg: h.seg, colId: s.cols[h.col].id, gateId: g.id };
      cursor = { seg: h.seg, col: h.col, wire: tw };
      sel.clear(); sel.add(g.id);
      say(t('afi.editor.pickTarget'));
      commit(); return true;
    }
    record();
    const g: Gate = { id: newId(), kind, q };
    ensureCol(s, h.col).gates.push(g);
    sel.clear(); sel.add(g.id);
    cursor = { ...h };
    commit();
    say(t('afi.editor.placed', { gate: gateName(kind), q }));
    return true;
  }

  function retarget(w: number) {
    if (!pending) return;
    const f = findGate(pending.gateId); if (!f) { pending = null; return; }
    const q = wires[w];
    if (q === f.g.c) return;
    const trial: Gate = { ...f.g, q };
    const s = segs[f.s];
    if (spanOf(trial, wires).some((x) => { const o = occupant(s, f.c, x); return o && o.id !== f.g.id; })) { say(t('afi.editor.occupied')); return; }
    f.g.q = q; cursor.wire = w; commit();
  }

  function deleteSelection() {
    if (readOnly) return;
    const ids = sel.size ? [...sel] : (() => { const s = segs[cursor.seg]; const g = s && occupant(s, cursor.col, wires[cursor.wire]); return g ? [g.id] : []; })();
    const s = segs[cursor.seg];
    const ctrlHere = !ids.length && s && editable(cursor.seg) && s.cols[cursor.col]?.ctrl;
    if (!ids.length && !ctrlHere) return;
    record();
    if (ctrlHere) s.cols.splice(cursor.col, 1);
    for (const id of ids) { const f = findGate(id); if (f && editable(f.s)) segs[f.s].cols[f.c].gates = segs[f.s].cols[f.c].gates.filter((g) => g.id !== id); }
    sel.clear(); pending = null; commit();
    say(t('afi.editor.deleted', { n: ids.length || 1 }));
  }

  /** move the selection by (dc, dw); all-or-nothing */
  function moveSelection(dc: number, dw: number): boolean {
    if (!sel.size || readOnly) return false;
    const items = [...sel].map(findGate).filter(Boolean) as { s: number; c: number; g: Gate }[];
    if (!items.length || items.some((f) => f.s !== items[0].s) || !editable(items[0].s)) return false;
    const s = segs[items[0].s];
    const moved = items.map((f) => {
      const qi = wires.indexOf(f.g.q) + dw, ci = f.g.c ? wires.indexOf(f.g.c) + dw : 0;
      return { f, col: f.c + dc, q: wires[qi], c: f.g.c ? wires[ci] : undefined, ok: qi >= 0 && qi < wires.length && (!f.g.c || (ci >= 0 && ci < wires.length)) };
    });
    if (moved.some((m) => !m.ok || m.col < 0 || (m.f.g.kind === 'RESET' && !isBot(m.q)))) return false;
    const ids = new Set(items.map((f) => f.g.id));
    for (const m of moved) {
      const trial: Gate = { ...m.f.g, q: m.q, c: m.c };
      if (s.cols[m.col]?.ctrl) return false;
      if (spanOf(trial, wires).some((x) => { const o = occupant(s, m.col, x); return o && !ids.has(o.id); })) return false;
    }
    // no two moved gates may collide with each other
    const cells = new Set<string>();
    for (const m of moved) for (const x of spanOf({ ...m.f.g, q: m.q, c: m.c }, wires)) { const k = `${m.col}:${x}`; if (cells.has(k)) return false; cells.add(k); }
    record();
    for (const m of moved) s.cols[m.f.c].gates = s.cols[m.f.c].gates.filter((g) => g.id !== m.f.g.id);
    for (const m of moved) { m.f.g.q = m.q; m.f.g.c = m.c; ensureCol(s, m.col).gates.push(m.f.g); }
    commit();
    return true;
  }

  // ───── condition editor (classically controlled gates) ─────
  let condPop: HTMLElement | null = null;
  function closeCond() { condPop?.remove(); condPop = null; }
  function openCondEditor() {
    closeCond();
    if (readOnly) return;
    if (!palette.includes('IF')) { say(t('afi.editor.err.notInToolbox', { gate: 'IF' })); return; }
    const items = [...sel].map(findGate).filter((f): f is { s: number; c: number; g: Gate } => !!f && editable(f.s));
    if (!items.length) { say(t('afi.editor.ifNeedsGate')); return; }
    const avail = [...new Set([...bits(), ...wires.filter(isBot)])];
    const cur = new Map<QubitId, Cond['is'] | ''>(avail.map((b) => [b, (items[0].g.cond ?? []).find((c) => c.who === b)?.is ?? '']));
    const pop = document.createElement('div');
    pop.className = 'afi-cond-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', t('afi.editor.condTitle'));
    const title = document.createElement('div'); title.className = 'afi-cond-title'; title.textContent = t('afi.editor.condTitle'); pop.appendChild(title);
    for (const b of avail) {
      const row = document.createElement('div'); row.className = 'afi-cond-row';
      const lab = document.createElement('span'); lab.className = 'mono'; lab.textContent = `c_${b}`; row.appendChild(lab);
      for (const [v, txt] of [['', '–'], ['QUIET', '0'], ['BEEP', '1']] as const) {
        const btn = document.createElement('button'); btn.className = 'afi-seg'; btn.textContent = txt;
        btn.setAttribute('aria-pressed', String(cur.get(b) === v));
        btn.setAttribute('aria-label', `c_${b} ${txt === '–' ? t('afi.editor.condAny') : '= ' + txt}`);
        btn.addEventListener('click', () => { cur.set(b, v); row.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === btn))); });
        row.appendChild(btn);
      }
      pop.appendChild(row);
    }
    const acts = document.createElement('div'); acts.className = 'afi-cond-acts';
    const ok = document.createElement('button'); ok.className = 'afi-btn'; ok.textContent = t('afi.editor.condApply');
    const no = document.createElement('button'); no.className = 'afi-btn ghost'; no.textContent = t('afi.common.cancel');
    ok.addEventListener('click', () => {
      const conds: Cond[] = [...cur].filter(([, v]) => v).map(([who, v]) => ({ who, is: v as Cond['is'] }));
      record();
      for (const f of items) f.g.cond = conds.length ? conds.map((c) => ({ ...c })) : undefined;
      closeCond(); commit(); svg.focus();
    });
    no.addEventListener('click', () => { closeCond(); svg.focus(); });
    pop.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { closeCond(); svg.focus(); } });
    acts.append(no, ok); pop.appendChild(acts);
    root.appendChild(pop);
    (pop.querySelector('button') as HTMLButtonElement)?.focus();
  }

  // ───── pointer interaction ─────
  let drag: { kind: 'palette'; tool: Tool; ghost: HTMLElement; moved: boolean; x0: number; y0: number }
    | { kind: 'move'; start: Hit; x0: number; y0: number; moved: boolean }
    | { kind: 'marquee'; x0: number; y0: number; rect: SVGRectElement; additive: boolean }
    | null = null;
  let hover: Hit | null = null;

  function startPaletteDrag(e: PointerEvent, k: Tool) {
    if (readOnly || e.button !== 0) return;
    const ghost = document.createElement('div'); ghost.className = 'afi-drag-ghost'; ghost.textContent = (palBtns.get(k)?.querySelector('.g')?.textContent) ?? '';
    drag = { kind: 'palette', tool: k, ghost, moved: false, x0: e.clientX, y0: e.clientY };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }
  function onMove(e: PointerEvent) {
    if (!drag) return;
    if (drag.kind === 'palette') {
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5) { drag.moved = true; document.body.appendChild(drag.ghost); }
      if (drag.moved) { drag.ghost.style.left = `${e.clientX}px`; drag.ghost.style.top = `${e.clientY}px`; hover = hitAt(e.clientX, e.clientY); render(); }
    } else if (drag.kind === 'move') {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5) drag.moved = true;
      hover = drag.moved ? hitAt(e.clientX, e.clientY) : null; render();
    } else if (drag.kind === 'marquee') {
      const r = svg.getBoundingClientRect();
      const x = (Math.min(drag.x0, e.clientX) - r.left) / scale, y = (Math.min(drag.y0, e.clientY) - r.top) / scale;
      drag.rect.setAttribute('x', String(x)); drag.rect.setAttribute('y', String(y));
      drag.rect.setAttribute('width', String(Math.abs(e.clientX - drag.x0) / scale)); drag.rect.setAttribute('height', String(Math.abs(e.clientY - drag.y0) / scale));
    }
  }
  function onUp(e: PointerEvent) {
    window.removeEventListener('pointermove', onMove);
    const d = drag; drag = null;
    if (!d) return;
    if (d.kind === 'palette') {
      d.ghost.remove();
      if (d.moved) { const h = hitAt(e.clientX, e.clientY); hover = null; if (h) { place(d.tool, h); svg.focus(); } else render(); }
    } else if (d.kind === 'move') {
      const h = hitAt(e.clientX, e.clientY); hover = null;
      if (d.moved && h && h.seg === d.start.seg && !moveSelection(h.col - d.start.col, h.wire - d.start.wire)) say(t('afi.editor.cantMove'));
      render();
    } else if (d.kind === 'marquee') {
      const r = svg.getBoundingClientRect();
      const x0 = (Math.min(d.x0, e.clientX) - r.left) / scale, x1 = (Math.max(d.x0, e.clientX) - r.left) / scale;
      const y0 = (Math.min(d.y0, e.clientY) - r.top) / scale, y1 = (Math.max(d.y0, e.clientY) - r.top) / scale;
      if (!d.additive) sel.clear();
      segs.forEach((s, si) => s.cols.forEach((c, ci) => c.gates.forEach((g) => {
        const x = colX(si, ci); const ys = spanOf(g, wires).map((w) => wireY(wires.indexOf(w)));
        if (x >= x0 && x <= x1 && ys.some((y) => y >= y0 && y <= y1)) sel.add(g.id);
      })));
      d.rect.remove(); render();
      if (sel.size) say(t('afi.editor.selected', { n: sel.size }));
    }
  }
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    svg.focus();
    closeCond();
    const h = hitAt(e.clientX, e.clientY);
    if (!h) { if (!e.shiftKey) sel.clear(); render(); return; }
    if (pending && h.seg === pending.seg) {
      const f = findGate(pending.gateId);
      if (f && segs[f.s].cols[f.c].id === pending.colId && h.col === f.c) { retarget(h.wire); pending = null; say(t('afi.editor.targetSet')); render(); return; }
      pending = null;
    }
    cursor = { ...h };
    if (tool) { place(tool, h); return; }
    const g = occupant(segs[h.seg], h.col, wires[h.wire]);
    if (g) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) { if (sel.has(g.id)) sel.delete(g.id); else sel.add(g.id); }
      else if (!sel.has(g.id)) { sel.clear(); sel.add(g.id); }
      render();
      if (editable(h.seg)) {
        drag = { kind: 'move', start: h, x0: e.clientX, y0: e.clientY, moved: false };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
      }
      return;
    }
    const rect = el('rect', { class: 'afi-marquee', x: 0, y: 0, width: 0, height: 0 }, svg);
    drag = { kind: 'marquee', x0: e.clientX, y0: e.clientY, rect, additive: e.shiftKey };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    render(); svg.appendChild(rect);
  });
  svg.addEventListener('pointermove', (e) => { if (!drag && tool) { hover = hitAt(e.clientX, e.clientY); render(); } });
  svg.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; render(); } });
  svg.addEventListener('dblclick', (e) => { const h = hitAt(e.clientX, e.clientY); if (h && occupant(segs[h.seg], h.col, wires[h.wire]) && palette.includes('IF')) openCondEditor(); });

  // ───── keyboard ─────
  svg.addEventListener('keydown', (e) => {
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); sel.clear(); segs[cursor.seg]?.cols.forEach((c) => c.gates.forEach((g) => sel.add(g.id))); render(); say(t('afi.editor.selected', { n: sel.size })); return; }
    if (pending && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); retarget(Math.max(0, Math.min(wires.length - 1, cursor.wire + (k === 'ArrowUp' ? -1 : 1)))); return; }
    if (pending && (k === 'Enter' || k === 'Escape')) { e.preventDefault(); pending = null; say(t('afi.editor.targetSet')); render(); return; }
    if (e.altKey && k.startsWith('Arrow')) {
      e.preventDefault();
      const [dc, dw] = k === 'ArrowLeft' ? [-1, 0] : k === 'ArrowRight' ? [1, 0] : k === 'ArrowUp' ? [0, -1] : [0, 1];
      if (moveSelection(dc, dw)) { cursor.col = Math.max(0, cursor.col + dc); cursor.wire = Math.max(0, Math.min(wires.length - 1, cursor.wire + dw)); } else say(t('afi.editor.cantMove'));
      render(); return;
    }
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      if (k === 'ArrowUp') cursor.wire = Math.max(0, cursor.wire - 1);
      if (k === 'ArrowDown') cursor.wire = Math.min(wires.length - 1, cursor.wire + 1);
      if (k === 'ArrowLeft') { if (cursor.col > 0) cursor.col--; else if (cursor.seg > 0) { cursor.seg--; cursor.col = Math.max(0, colsShown(segs[cursor.seg]) - 1); } }
      if (k === 'ArrowRight') { if (cursor.col < colsShown(segs[cursor.seg]) - 1) cursor.col++; else if (cursor.seg < segs.length - 1) { cursor.seg++; cursor.col = 0; } }
      if (e.shiftKey) { const g = occupant(segs[cursor.seg], cursor.col, wires[cursor.wire]); if (g) sel.add(g.id); }
      announceCursor(); render(); return;
    }
    if (k === 'Escape') { setTool(null); sel.clear(); closeCond(); render(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (tool) { place(tool, cursor); return; }
      const g = occupant(segs[cursor.seg], cursor.col, wires[cursor.wire]);
      if (g) { if (sel.has(g.id)) sel.delete(g.id); else sel.add(g.id); render(); }
      return;
    }
    if (k === 'i' && !mod) { const g = occupant(segs[cursor.seg], cursor.col, wires[cursor.wire]); if (g && !sel.size) sel.add(g.id); openCondEditor(); return; }
    if (k === 'e' && !mod && palette.includes('END')) { place('END', cursor); return; }
    if (k === 'n' && !mod && palette.includes('WAIT')) { place('WAIT', cursor); return; }
    if (k === 'Insert' || (k === '+' && !mod)) { if (editable(cursor.seg)) { record(); segs[cursor.seg].cols.splice(cursor.col, 0, { id: newId(), gates: [] }); commit(); } return; }
    const kg = KEYGATE[k.toLowerCase()];
    if (kg && !mod && palette.includes(kg)) { e.preventDefault(); place(kg, cursor); }
  });
  function announceCursor() {
    const s = segs[cursor.seg]; const g = s && occupant(s, cursor.col, wires[cursor.wire]);
    say(t('afi.editor.cursor', { stage: stageName(s.phase), col: cursor.col + 1, q: wires[cursor.wire] }) + (g ? ` · ${gateName(g.kind)}` : ''));
  }
  function flash(h: Hit) { const r = el('rect', { class: 'afi-flash', x: colX(h.seg, h.col) - CW / 2, y: wireY(h.wire) - RH / 2, width: CW, height: RH }, svg); setTimeout(() => r.remove(), 400); }

  // ───── rendering ─────
  function render() {
    const bl = bits();
    const totalW = segX(segs.length) + 16;
    const totalH = (bl.length ? bitY(bl.length - 1) + 18 : HEAD + wires.length * RH) + 6;
    // fit: small circuits are scaled up (bounded) to the available space and centred by CSS; big ones scroll at 1×
    const aw = scroller.clientWidth - 12, ah = scroller.clientHeight - 16;
    scale = aw > 0 && ah > 0 ? Math.max(1, Math.min(MAX_SCALE, aw / totalW, ah / totalH)) : 1;
    svg.setAttribute('width', String(Math.round(totalW * scale))); svg.setAttribute('height', String(Math.round(totalH * scale)));
    svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
    svg.replaceChildren();
    const gW = el('g', { class: 'wires' }, svg);
    wires.forEach((w, i) => {
      el('line', { class: `wire ${isBot(w) ? 'anc' : 'data'}`, x1: GUT - 6, x2: totalW - 8, y1: wireY(i), y2: wireY(i) }, gW);
      const tx = el('text', { class: `wire-label ${isBot(w) ? 'anc' : 'data'}`, x: GUT - 12, y: wireY(i) + 4, 'text-anchor': 'end' }, gW); tx.textContent = w;
    });
    bl.forEach((b, i) => {
      el('line', { class: 'cbit', x1: GUT - 6, x2: totalW - 8, y1: bitY(i) - 1.5, y2: bitY(i) - 1.5 }, gW);
      el('line', { class: 'cbit', x1: GUT - 6, x2: totalW - 8, y1: bitY(i) + 1.5, y2: bitY(i) + 1.5 }, gW);
      const tx = el('text', { class: 'cbit-label', x: GUT - 12, y: bitY(i) + 4, 'text-anchor': 'end' }, gW); tx.textContent = `c_${b}`;
    });
    segs.forEach((s, si) => {
      const x0 = segX(si), n = colsShown(s);
      const g = el('g', { class: `seg ${s.locked ? 'locked' : 'open'}` }, svg);
      el('rect', { class: 'seg-bg', x: x0, y: HEAD - 4, width: n * CW, height: wires.length * RH + 8, rx: 6 }, g);
      const hd = el('text', { class: 'seg-head', x: x0 + 4, y: 16 }, g);
      hd.textContent = `${stageName(s.phase)}${s.locked ? ` · ${t('afi.editor.fixed')}` : ''}`;
      if (s.phase === 'bedtime' && segs[si + 1]?.phase === 'morning') {
        const nx = x0 + n * CW + 4;
        el('rect', { class: 'noise-band', x: nx + 6, y: HEAD - 4, width: NOISE - 12, height: wires.length * RH + 8, rx: 4 }, svg);
        const nt = el('text', { class: 'noise-label', x: nx + NOISE / 2, y: 16, 'text-anchor': 'middle' }, svg); nt.textContent = t('afi.editor.noise');
        level.qubbles.forEach((_, i) => { const tt = el('text', { class: 'noise-glyph', x: nx + NOISE / 2, y: wireY(i) + 5, 'text-anchor': 'middle' }, svg); tt.textContent = '𝒩'; });
      }
      s.cols.forEach((c, ci) => {
        const cx = colX(si, ci);
        if (hl != null && c.id === hl) el('rect', { class: 'col-hl', x: cx - CW / 2 + 2, y: HEAD - 4, width: CW - 4, height: wires.length * RH + 8, rx: 4 }, g);
        if (c.ctrl) { drawCtrl(g, c, cx, bl); return; }
        for (const gt of c.gates) drawGate(g, gt, cx, bl, s.locked);
      });
    });
    // ghost under pointer while placing
    if (hover && (tool || drag?.kind === 'palette') && editable(hover.seg)) {
      el('rect', { class: 'afi-hover', x: colX(hover.seg, hover.col) - GATE / 2 - 3, y: wireY(hover.wire) - GATE / 2 - 3, width: GATE + 6, height: GATE + 6, rx: 6 }, svg);
    } else if (hover && drag?.kind === 'move') {
      el('rect', { class: 'afi-hover', x: colX(hover.seg, hover.col) - GATE / 2 - 3, y: wireY(hover.wire) - GATE / 2 - 3, width: GATE + 6, height: GATE + 6, rx: 6 }, svg);
    }
    // keyboard cursor
    if (document.activeElement === svg && segs[cursor.seg]) {
      el('rect', { class: 'afi-cursor', x: colX(cursor.seg, cursor.col) - CW / 2 + 3, y: wireY(cursor.wire) - RH / 2 + 3, width: CW - 6, height: RH - 6, rx: 6 }, svg);
    }
    undoBtn.disabled = !undoStack.length || readOnly; redoBtn.disabled = !redoStack.length || readOnly; delBtn.disabled = readOnly;
    if (condBtn) condBtn.disabled = readOnly || !sel.size;
    palBtns.forEach((b) => (b.disabled = readOnly));
  }

  function drawCond(g: SVGGElement, gt: Gate, cx: number, bl: QubitId[]) {
    if (!gt.cond?.length) return;
    const y0 = wireY(wires.indexOf(gt.q)) + GATE / 2;
    const ys = gt.cond.map((c) => bitY(bl.indexOf(c.who)));
    const y1 = Math.max(...ys);
    el('line', { class: 'cline', x1: cx - 1.5, x2: cx - 1.5, y1: y0, y2: y1 }, g);
    el('line', { class: 'cline', x1: cx + 1.5, x2: cx + 1.5, y1: y0, y2: y1 }, g);
    gt.cond.forEach((c, i) => el('circle', { class: `cdot ${c.is === 'BEEP' ? 'one' : 'zero'}`, cx, cy: ys[i], r: 4.5 }, g));
  }
  function drawGate(g: SVGGElement, gt: Gate, cx: number, bl: QubitId[], locked: boolean) {
    const selected = sel.has(gt.id);
    const cls = `gate k-${gt.kind}${selected ? ' sel' : ''}${locked ? ' locked' : ''}${gt.cond?.length ? ' cond' : ''}`;
    const gg = el('g', { class: cls, 'data-id': gt.id }, g);
    const ty = wireY(wires.indexOf(gt.q));
    const ttl = el('title', {}, gg);
    ttl.textContent = `${gateName(gt.kind)} ${gt.c ? `${gt.c} → ${gt.q}` : gt.q}${gt.cond?.length ? ` if ${gt.cond.map((c) => `c_${c.who}=${c.is === 'BEEP' ? 1 : 0}`).join(' ∧ ')}` : ''}`;
    drawCond(gg, gt, cx, bl);
    if (gt.c) {
      const cy = wireY(wires.indexOf(gt.c));
      el('line', { class: 'qline', x1: cx, x2: cx, y1: cy, y2: ty }, gg);
      if (gt.kind !== 'SWAP') el('circle', { class: 'ctrl-dot', cx, cy, r: 5 }, gg);
      if (gt.kind === 'SWAP') {
        for (const y of [cy, ty]) { el('line', { class: 'targ-x', x1: cx - 7, x2: cx + 7, y1: y - 7, y2: y + 7 }, gg); el('line', { class: 'targ-x', x1: cx - 7, x2: cx + 7, y1: y + 7, y2: y - 7 }, gg); }
      } else if (gt.kind === 'CNOT') {
        el('circle', { class: 'targ', cx, cy: ty, r: 11 }, gg);
        el('line', { class: 'targ-x', x1: cx - 11, x2: cx + 11, y1: ty, y2: ty }, gg);
        el('line', { class: 'targ-x', x1: cx, x2: cx, y1: ty - 11, y2: ty + 11 }, gg);
      } else el('circle', { class: 'ctrl-dot', cx, cy: ty, r: 5 }, gg);
      if (selected) el('rect', { class: 'sel-ring', x: cx - 15, y: Math.min(cy, ty) - 15, width: 30, height: Math.abs(cy - ty) + 30, rx: 8 }, gg);
      if (pending?.gateId === gt.id) el('circle', { class: 'pending', cx, cy: ty, r: 15 }, gg);
      return;
    }
    el('rect', { class: 'box', x: cx - GATE / 2, y: ty - GATE / 2, width: GATE, height: GATE, rx: 5 }, gg);
    if (gt.kind === 'MEASURE') {
      el('path', { class: 'meter', d: `M ${cx - 9} ${ty + 5} A 9 9 0 0 1 ${cx + 9} ${ty + 5}` }, gg);
      el('line', { class: 'meter', x1: cx, y1: ty + 6, x2: cx + 7, y2: ty - 7 }, gg);
      const bi = bl.indexOf(gt.q);
      if (bi >= 0) {
        const by = bitY(bi);
        el('line', { class: 'cline', x1: cx - 1.5, x2: cx - 1.5, y1: ty + GATE / 2, y2: by - 4 }, gg);
        el('line', { class: 'cline', x1: cx + 1.5, x2: cx + 1.5, y1: ty + GATE / 2, y2: by - 4 }, gg);
        el('path', { class: 'carrow', d: `M ${cx - 4} ${by - 7} L ${cx} ${by - 1} L ${cx + 4} ${by - 7} Z` }, gg);
      }
    } else {
      const tx = el('text', { class: 'glabel', x: cx, y: ty + 5, 'text-anchor': 'middle' }, gg);
      tx.textContent = LETTER[gt.kind];
    }
  }
  function drawCtrl(g: SVGGElement, c: Column, cx: number, bl: QubitId[]) {
    const ct = c.ctrl!;
    const y0 = HEAD - 2, y1 = (bl.length ? bitY(bl.length - 1) : HEAD + wires.length * RH) + 4;
    el('line', { class: `ctrl-bar k-${ct.kind}`, x1: cx, x2: cx, y1: y0, y2: y1 }, g);
    const txt = ct.kind === 'LABEL' ? `${ct.name}:` : ct.kind === 'JUMP' ? `goto ${ct.label}` : ct.kind === 'IFJ' ? `if→${ct.label}` : ct.kind === 'END' ? 'end' : ct.kind === 'WAIT' ? '𝒩 wait' : '#';
    const tx = el('text', { class: 'ctrl-label', x: cx + 3, y: HEAD + 10, transform: `rotate(90 ${cx + 3} ${HEAD + 10})` }, g);
    tx.textContent = txt;
    const ttl = el('title', {}, g); ttl.textContent = ct.kind === 'NOTE' ? ct.text : ct.kind === 'IFJ' ? `if ${ct.conds.map((k) => `c_${k.who}=${k.is === 'BEEP' ? 1 : 0}`).join(' ∧ ')} goto ${ct.label}` : txt;
    if (ct.kind === 'IFJ') ct.conds.forEach((k) => { const i = bl.indexOf(k.who); if (i >= 0) el('circle', { class: `cdot ${k.is === 'BEEP' ? 'one' : 'zero'}`, cx, cy: bitY(i), r: 4.5 }, g); });
  }

  let lastSize = '';
  const ro = new ResizeObserver(() => { const k = `${scroller.clientWidth}x${scroller.clientHeight}`; if (k !== lastSize) { lastSize = k; render(); } });
  ro.observe(scroller);
  svg.addEventListener('focus', () => { render(); announceCursor(); });
  svg.addEventListener('blur', () => render());
  render();

  return {
    setSegments(next, rec = true) { if (rec) record(); segs = next.map((s) => ({ ...s, cols: cloneCols(s.cols) })); sel.clear(); pending = null; render(); },
    segments: () => segs.map((s) => ({ ...s, cols: cloneCols(s.cols) })),
    highlight(id) { hl = id; render(); if (id != null) { const r = svg.querySelector('.col-hl') as SVGRectElement | null; r?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } },
    setReadOnly(ro) { readOnly = ro; if (ro) { setTool(null); closeCond(); } root.classList.toggle('ro', ro); render(); },
    undo, redo,
    focus: () => svg.focus(),
    destroy() { ro.disconnect(); window.removeEventListener('pointermove', onMove); drag && 'ghost' in drag && drag.ghost.remove(); root.remove(); },
  };
}
