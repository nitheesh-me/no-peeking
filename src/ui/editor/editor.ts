/**
 * Bot Code editor (7 Billion Humans style). DOM-based.
 * Toolbox of chunky cards → program column per editable phase. Pointer-event drag & drop
 * (mouse + touch), arg chips with dropdowns or click-a-creature picking, IF rows, curvy SVG
 * arrows to labels, trash / ×, undo/redo, text import/export via quantum.parse/printProgram.
 */
import type { LevelDef, Op, OpName, Program, QubitId, Cond, BotId } from '../../core/contracts';
import { isBot } from '../../core/contracts';
import { quantum, audio } from '../../engine/deps';
import type { LineRef } from '../../engine/playback';
import { h, modal, toast } from '../../engine/util';

export type EdPhase = 'bedtime' | 'morning';
export type Progs = { bedtime?: Program; morning?: Program };

export interface EditorOpts {
  onChange(progs: Progs): void;
  /** Ask the scene to let the player click a creature. Returns a cancel fn. */
  beginPick?(allowed: QubitId[], cb: (id: QubitId) => void): () => void;
  hazardPeek?: boolean;
  readonly?: boolean;
}

const CARD_HELP: Record<OpName, string> = {
  BOOP: 'flip the dream', SHUSH: 'flip the swirl', SPIN: 'turn the dream sideways', HIGHFIVE: 'target flips if source is Moony',
  LISTEN: 'bot lights up: BEEP or QUIET', RESET: 'bot back to QUIET', PEEK: 'look at it (wakes Qubbles!)', IF: 'jump if lights match',
  JUMP: 'jump to a spot', LABEL: 'a spot to jump to', END: 'stop here', NOTE: 'a little note',
};

const TOOL_ORDER: OpName[] = ['BOOP', 'SHUSH', 'SPIN', 'HIGHFIVE', 'LISTEN', 'RESET', 'PEEK', 'IF', 'JUMP', 'LABEL', 'END', 'NOTE'];

export class Editor {
  readonly el: HTMLElement;
  progs: { bedtime: Program; morning: Program };
  private history: string[] = [];
  private future: string[] = [];
  private lists = new Map<EdPhase, HTMLElement>();
  private fixedBoxes = new Map<EdPhase, HTMLElement>();
  private activePhase: EdPhase;
  private current: LineRef | null = null;
  private popClose: (() => void) | null = null;
  private pickCancel: (() => void) | null = null;
  private trash!: HTMLElement;
  private statsEl!: HTMLElement;
  private columnsEl!: HTMLElement;
  private toolboxEl!: HTMLElement;
  private drag: null | {
    src: 'tool' | 'prog'; op: Op; phase?: EdPhase; index?: number; startX: number; startY: number;
    ghost?: HTMLElement; srcEl: HTMLElement; target?: { phase: EdPhase; index: number } | 'trash' | null; pointerId: number;
  } = null;

  constructor(readonly level: LevelDef, initial: Progs, readonly opts: EditorOpts) {
    this.progs = {
      bedtime: structuredClone(initial.bedtime ?? level.starterBedtime ?? []),
      morning: structuredClone(initial.morning ?? level.starterMorning ?? []),
    };
    this.activePhase = level.editable.includes('morning') ? 'morning' : 'bedtime';
    this.el = h('div', { class: 'editor' });
    this.build();
    this.render();
    window.addEventListener('resize', this.drawArrowsAll);
  }

  destroy(): void {
    window.removeEventListener('resize', this.drawArrowsAll);
    this.closePop();
  }

  get qubbles(): QubitId[] { return this.level.qubbles.map((q) => q.id); }
  get bots(): BotId[] { return this.level.bots.map((b) => b.id as BotId); }

  // ───────────── structure ─────────────
  private build(): void {
    const lv = this.level;
    this.toolboxEl = h('div', { class: 'toolbox' }, h('h5', null, 'Cards'));
    const tools = TOOL_ORDER.filter((t) => lv.toolbox.includes(t));
    for (const name of tools) {
      const op = this.defaultOp(name, 'morning', true);
      const c = this.cardEl(op, { tool: true });
      c.title = CARD_HELP[name];
      c.addEventListener('pointerdown', (e) => this.pointerDown(e, { src: 'tool', op: name as unknown as Op, srcEl: c }));
      this.toolboxEl.appendChild(c);
    }
    if (!tools.length) this.toolboxEl.appendChild(h('div', { class: 'muted', style: 'font-size:12px' }, 'No cards! The best code is no code.'));

    this.columnsEl = h('div', { class: 'columns' });
    const phases: EdPhase[] = ['bedtime', 'morning'];
    for (const ph of phases) {
      const editable = lv.editable.includes(ph);
      const fixed = ph === 'bedtime' ? lv.fixedBedtime : lv.fixedMorning;
      if (!editable && !fixed?.length) continue;
      const col = h('div', { class: 'prog-col' });
      const title = ph === 'bedtime' ? 'Bedtime' : 'Morning';
      const cnt = h('span', { class: 'cnt' });
      col.appendChild(h('div', { class: 'prog-col-head' }, h('span', { class: 'ttl' }, title), cnt));
      if (fixed?.length) {
        const fp = h('div', { class: 'fixed-phase' },
          h('div', null, editable ? `▸ ${fixed.length} cards run first (Schrödi wrote these)` : `▸ ${fixed.length} cards by Schrödi (read only). Click to peek at the code.`));
        const list = h('div', { class: 'fp-list' });
        fixed.forEach((op) => list.appendChild(this.cardEl(op, { readonly: true })));
        fp.appendChild(list);
        fp.addEventListener('click', () => fp.classList.toggle('open'));
        this.fixedBoxes.set(ph, fp);
        col.appendChild(fp);
      }
      if (editable) {
        const list = h('div', { class: 'prog-list', 'data-phase': ph });
        list.addEventListener('pointerdown', () => { this.activePhase = ph; });
        this.lists.set(ph, list);
        col.appendChild(list);
        (col as HTMLElement & { _cnt?: HTMLElement })._cnt = cnt;
        list.addEventListener('scroll', () => this.drawArrows(ph));
      }
      if (!editable) col.classList.add('fixed-only');
      this.columnsEl.appendChild(col);
    }

    this.trash = h('div', { class: 'trash', title: 'Drag a card here to delete it' }, '🗑 trash');
    this.statsEl = h('div', { class: 'stats' });
    const foot = h('div', { class: 'editor-foot' },
      this.trash,
      h('button', { class: 'btn icon small', title: 'Undo (Ctrl+Z)', onclick: () => this.undo() }, '↶'),
      h('button', { class: 'btn icon small', title: 'Redo (Ctrl+Y)', onclick: () => this.redo() }, '↷'),
      h('button', { class: 'btn small', title: 'Copy / paste your program as text', onclick: () => this.openText() }, 'Text'),
      h('button', { class: 'btn small', title: 'Clear your program', onclick: () => this.clearAll() }, 'Clear'),
      this.statsEl,
    );
    this.el.append(h('div', { class: 'editor-body' }, this.toolboxEl, this.columnsEl), foot);
  }

  // ───────────── model helpers ─────────────
  private snapshot(): string { return JSON.stringify(this.progs); }
  private commit(mut: () => void, sfx: 'card_drop' | 'ui_click' | null = 'card_drop'): void {
    this.history.push(this.snapshot());
    if (this.history.length > 200) this.history.shift();
    this.future = [];
    mut();
    if (sfx) audio.sfx(sfx);
    this.render();
    this.opts.onChange(this.exportProgs());
  }
  undo(): void {
    const prev = this.history.pop(); if (!prev) return;
    this.future.push(this.snapshot()); this.progs = JSON.parse(prev);
    audio.sfx('ui_click', { pitch: 0.8 }); this.render(); this.opts.onChange(this.exportProgs());
  }
  redo(): void {
    const nx = this.future.pop(); if (!nx) return;
    this.history.push(this.snapshot()); this.progs = JSON.parse(nx);
    audio.sfx('ui_click', { pitch: 1.2 }); this.render(); this.opts.onChange(this.exportProgs());
  }
  exportProgs(): Progs {
    const out: Progs = {};
    if (this.level.editable.includes('bedtime')) out.bedtime = structuredClone(this.progs.bedtime);
    if (this.level.editable.includes('morning')) out.morning = structuredClone(this.progs.morning);
    return out;
  }
  setProgs(p: Progs, record = true): void {
    const mut = () => { if (p.bedtime) this.progs.bedtime = structuredClone(p.bedtime); if (p.morning) this.progs.morning = structuredClone(p.morning); };
    if (record) this.commit(mut, null); else { mut(); this.render(); }
  }

  private newLabel(): string {
    const used = new Set<string>();
    for (const p of [this.progs.bedtime, this.progs.morning]) for (const o of p) if (o.op === 'LABEL') used.add(o.name);
    for (let i = 0; i < 26; i++) { const n = String.fromCharCode(65 + i); if (!used.has(n)) return n; }
    return 'L' + used.size;
  }
  private labelsIn(ph: EdPhase): string[] { return this.progs[ph].filter((o): o is Extract<Op, { op: 'LABEL' }> => o.op === 'LABEL').map((o) => o.name); }
  private condWho(): QubitId[] {
    return this.level.classical || this.level.allowPeekData ? [...this.bots, ...this.qubbles] : this.bots.length ? [...this.bots] : [...this.qubbles];
  }

  private defaultOp(name: OpName, ph: EdPhase, preview = false): Op {
    const q = this.qubbles[0] ?? 'q1', b = this.bots[0] ?? q;
    switch (name) {
      case 'BOOP': case 'SHUSH': case 'SPIN': case 'PEEK': return { op: name, t: q } as Op;
      case 'HIGHFIVE': return { op: 'HIGHFIVE', from: q, to: this.bots[0] ?? this.qubbles[1] ?? q };
      case 'LISTEN': case 'RESET': return { op: name, t: b as BotId } as Op;
      case 'IF': return { op: 'IF', conds: [{ who: this.condWho()[0] ?? b, is: 'BEEP' }], label: preview ? '' : this.labelsIn(ph)[0] ?? '' };
      case 'JUMP': return { op: 'JUMP', label: preview ? '' : this.labelsIn(ph)[0] ?? '' };
      case 'LABEL': return { op: 'LABEL', name: preview ? '' : this.newLabel() };
      case 'END': return { op: 'END' };
      case 'NOTE': return { op: 'NOTE', text: preview ? '' : 'note to self' };
    }
  }

  /** Insert a fresh card; IF/JUMP without any label also get a fresh label placed after them. */
  private insertNew(name: OpName, ph: EdPhase, index: number): void {
    this.commit(() => {
      const op = this.defaultOp(name, ph);
      const list = this.progs[ph];
      list.splice(index, 0, op);
      if ((op.op === 'IF' || op.op === 'JUMP') && !op.label) {
        const lab = this.newLabel();
        op.label = lab;
        list.splice(index + 1, 0, { op: 'LABEL', name: lab });
      }
    });
  }

  // ───────────── rendering ─────────────
  render(): void {
    this.closePop();
    for (const [ph, list] of this.lists) {
      list.innerHTML = '';
      const prog = this.progs[ph];
      const labels = new Set(this.labelsIn(ph));
      if (!prog.length) list.appendChild(h('div', { class: 'empty-hint' }, 'Drag cards here', h('br'), h('span', { style: 'font-size:11px' }, '(an empty program is still a program)')));
      prog.forEach((op, i) => {
        const bad = (op.op === 'IF' || op.op === 'JUMP') && !labels.has(op.label);
        const c = this.cardEl(op, { phase: ph, index: i, error: bad });
        c.appendChild(h('span', { class: 'line-no' }, String(i + 1)));
        c.addEventListener('pointerdown', (e) => {
          if ((e.target as HTMLElement).closest('.chip,.x,input')) return;
          this.pointerDown(e, { src: 'prog', op, phase: ph, index: i, srcEl: c });
        });
        list.appendChild(c);
      });
    }
    const lines = (p: Program) => p.filter((o) => o.op !== 'LABEL' && o.op !== 'NOTE').length;
    const total = this.level.editable.reduce((s, ph) => s + lines(this.progs[ph]), 0);
    const par = this.level.challenges?.lines;
    this.statsEl.innerHTML = '';
    this.statsEl.append(`${total} line${total === 1 ? '' : 's'}`, par != null ? h('div', null, `par ${par}`) : '');
    for (const col of this.columnsEl.children) {
      const c = (col as HTMLElement & { _cnt?: HTMLElement })._cnt;
      const list = col.querySelector('.prog-list') as HTMLElement | null;
      if (c && list) c.textContent = `${lines(this.progs[list.dataset.phase as EdPhase])} lines`;
    }
    this.applyCurrent();
    requestAnimationFrame(this.drawArrowsAll);
  }

  private drawArrowsAll = (): void => { for (const ph of this.lists.keys()) this.drawArrows(ph); };

  private drawArrows(ph: EdPhase): void {
    const list = this.lists.get(ph); if (!list) return;
    list.querySelectorAll(':scope > svg, :scope > .arrows').forEach((n) => n.remove());
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'arrows');
    svg.style.height = list.scrollHeight + 'px';
    const cards = [...list.querySelectorAll(':scope > .card')] as HTMLElement[];
    const prog = this.progs[ph];
    const lr = list.getBoundingClientRect();
    const yOf = (el: HTMLElement) => el.getBoundingClientRect().top - lr.top + list.scrollTop + el.offsetHeight / 2;
    let depth = 0;
    prog.forEach((op, i) => {
      if (op.op !== 'IF' && op.op !== 'JUMP') return;
      const j = prog.findIndex((o) => o.op === 'LABEL' && o.name === op.label);
      if (j < 0 || !cards[i] || !cards[j]) return;
      const y1 = yOf(cards[i]), y2 = yOf(cards[j]);
      const x = 42, bulge = 14 + (depth++ % 3) * 9;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M ${x} ${y1} C ${x - bulge * 2} ${y1}, ${x - bulge * 2} ${y2}, ${x - 2} ${y2}`);
      svg.appendChild(path);
      const tri = document.createElementNS(NS, 'polygon');
      tri.setAttribute('points', `${x + 2},${y2} ${x - 7},${y2 - 5} ${x - 7},${y2 + 5}`);
      svg.appendChild(tri);
    });
    list.prepend(svg);
  }

  private cardEl(op: Op, o: { tool?: boolean; readonly?: boolean; phase?: EdPhase; index?: number; error?: boolean }): HTMLElement {
    const c = h('div', { class: `card op-${op.op}${o.error ? ' error' : ''}`, tabindex: o.tool ? 0 : null });
    if (op.op === 'PEEK' && this.opts.hazardPeek) c.classList.add('hazard');
    const name = o.tool ? op.op : op.op === 'LABEL' ? '⚑' : op.op === 'NOTE' ? '✎' : op.op;
    c.appendChild(h('span', { class: 'cname' }, name));
    if (o.tool) return c;
    const live = !o.readonly && o.phase != null && o.index != null && !this.opts.readonly;
    const ph = o.phase!, idx = o.index!;
    const chip = (text: string, cls: string, onPick: ((el: HTMLElement) => void) | null) => {
      const el = h('button', { class: `chip ${cls}`, type: 'button' }, text);
      if (live && onPick) el.addEventListener('click', (e) => { e.stopPropagation(); onPick(el); });
      return el;
    };
    const targetChip = (val: QubitId, allowed: QubitId[], set: (v: QubitId) => void) =>
      chip(val, isBot(val) ? 'bot' : '', (el) => this.pickTarget(el, allowed, (v) => this.commit(() => set(v), 'ui_click')));
    const all = [...this.qubbles, ...this.bots];
    switch (op.op) {
      case 'BOOP': case 'SHUSH': case 'SPIN':
        c.appendChild(targetChip(op.t, all, (v) => { (this.progs[ph][idx] as typeof op).t = v; })); break;
      case 'PEEK':
        c.appendChild(targetChip(op.t, all, (v) => { (this.progs[ph][idx] as typeof op).t = v; })); break;
      case 'LISTEN': case 'RESET':
        c.appendChild(targetChip(op.t, this.bots, (v) => { (this.progs[ph][idx] as typeof op).t = v as BotId; })); break;
      case 'HIGHFIVE':
        c.appendChild(targetChip(op.from, all, (v) => { (this.progs[ph][idx] as typeof op).from = v; }));
        c.appendChild(h('span', { class: 'arrow' }, '→'));
        c.appendChild(targetChip(op.to, all, (v) => { (this.progs[ph][idx] as typeof op).to = v; }));
        break;
      case 'IF': {
        const who = this.condWho();
        const condBox = h('div', { class: 'conds' });
        op.conds.forEach((cd, k) => {
          const row = h('span', { class: 'cond-row' });
          if (k > 0) row.appendChild(h('span', { class: 'kw' }, 'and'));
          row.appendChild(targetChip(cd.who, who, (v) => { (this.progs[ph][idx] as typeof op).conds[k].who = v; }));
          row.appendChild(chip(cd.is, cd.is === 'BEEP' ? 'beep' : 'quiet', () => this.commit(() => {
            const cc = (this.progs[ph][idx] as typeof op).conds[k]; cc.is = cc.is === 'BEEP' ? 'QUIET' : 'BEEP';
          }, 'ui_click')));
          if (op.conds.length > 1 && live) row.appendChild(chip('−', 'add rm', () => this.commit(() => { (this.progs[ph][idx] as typeof op).conds.splice(k, 1); }, 'ui_click')));
          condBox.appendChild(row);
        });
        c.appendChild(condBox);
        if (live && op.conds.length < 4) condBox.appendChild(chip('+', 'add', () => this.commit(() => {
          const used = new Set(op.conds.map((x) => x.who));
          const nx: Cond = { who: who.find((w) => !used.has(w)) ?? who[0], is: 'BEEP' };
          (this.progs[ph][idx] as typeof op).conds.push(nx);
        }, 'ui_click')));
        c.appendChild(h('span', { class: 'arrow' }, '→'));
        c.appendChild(this.labelChip(op.label || '?', live, ph, (v) => { (this.progs[ph][idx] as typeof op).label = v; }));
        break;
      }
      case 'JUMP':
        c.appendChild(this.labelChip(op.label || '?', live, ph, (v) => { (this.progs[ph][idx] as typeof op).label = v; })); break;
      case 'LABEL':
        c.appendChild(h('span', null, `${op.name}`)); break;
      case 'NOTE': {
        if (live) {
          const inp = h('input', { class: 'note-input', value: op.text, maxlength: 60 }) as HTMLInputElement;
          inp.addEventListener('pointerdown', (e) => e.stopPropagation());
          inp.addEventListener('keydown', (e) => e.stopPropagation());
          inp.addEventListener('change', () => this.commit(() => { (this.progs[ph][idx] as typeof op).text = inp.value; }, null));
          c.appendChild(inp);
        } else c.appendChild(h('span', null, op.text));
        break;
      }
      case 'END': break;
    }
    if (live) {
      c.appendChild(h('button', { class: 'x', title: 'Delete', 'aria-label': 'Delete card', onclick: (e: Event) => { e.stopPropagation(); this.commit(() => this.progs[ph].splice(idx, 1)); } }, '×'));
    }
    return c;
  }

  private labelChip(text: string, live: boolean, ph: EdPhase, set: (v: string) => void): HTMLElement {
    const el = h('button', { class: 'chip', type: 'button' }, text);
    if (live) el.addEventListener('click', (e) => {
      e.stopPropagation();
      const opts = [...this.labelsIn(ph)];
      this.popover(el, opts.map((l) => ({ text: l, val: l })).concat([{ text: '+ new spot', val: '__new' }]), (v) => {
        if (v === '__new') {
          this.commit(() => { const n = this.newLabel(); set(n); this.progs[ph].push({ op: 'LABEL', name: n }); }, 'ui_click');
        } else this.commit(() => set(v), 'ui_click');
      }, 'Jump to which spot?');
    });
    return el;
  }

  private pickTarget(anchor: HTMLElement, allowed: QubitId[], cb: (v: QubitId) => void): void {
    this.popover(anchor, allowed.map((a) => ({ text: a, val: a })), (v) => cb(v as QubitId), this.opts.beginPick ? 'Pick one, or click it in the scene' : undefined);
    anchor.classList.add('active');
    if (this.opts.beginPick) this.pickCancel = this.opts.beginPick(allowed, (id) => { this.closePop(); cb(id); });
  }

  private popover(anchor: HTMLElement, items: { text: string; val: string }[], cb: (v: string) => void, hint?: string): void {
    this.closePop();
    audio.sfx('ui_click');
    const pop = h('div', { class: 'popover panel' });
    if (hint) pop.appendChild(h('div', { class: 'hint' }, hint));
    for (const it of items) pop.appendChild(h('button', { class: `chip ${isBot(it.val) ? 'bot' : ''}`, onclick: () => { this.closePop(); cb(it.val); } }, it.text));
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pr.width - 8, r.left)) + 'px';
    pop.style.top = (r.bottom + pr.height + 8 > window.innerHeight ? r.top - pr.height - 6 : r.bottom + 6) + 'px';
    const away = (e: PointerEvent) => { if (!pop.contains(e.target as Node) && e.target !== anchor && !(e.target as HTMLElement).closest?.('canvas')) this.closePop(); };
    setTimeout(() => document.addEventListener('pointerdown', away, true));
    this.popClose = () => { pop.remove(); anchor.classList.remove('active'); document.removeEventListener('pointerdown', away, true); };
  }
  private closePop(): void {
    this.popClose?.(); this.popClose = null;
    this.pickCancel?.(); this.pickCancel = null;
  }

  // ───────────── current line highlight ─────────────
  setCurrent(ref: LineRef | null): void { this.current = ref; this.applyCurrent(); }
  private applyCurrent(): void {
    this.el.querySelectorAll('.card.current').forEach((n) => n.classList.remove('current'));
    const ref = this.current;
    if (ref?.part !== 'fixed') for (const b of this.fixedBoxes.values()) if (b.parentElement?.classList.contains('fixed-only')) b.classList.remove('open');
    if (!ref || ref.phase === 'night') return;
    let cardEl: Element | undefined;
    if (ref.part === 'fixed') {
      const box = this.fixedBoxes.get(ref.phase);
      if (box) { box.classList.add('open'); cardEl = box.querySelectorAll('.card')[ref.pc]; }
    } else {
      const list = this.lists.get(ref.phase);
      cardEl = list?.querySelectorAll(':scope > .card')[ref.pc];
    }
    if (cardEl) { cardEl.classList.add('current'); (cardEl as HTMLElement).scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }
  }

  // ───────────── drag & drop ─────────────
  private pointerDown(e: PointerEvent, d: { src: 'tool' | 'prog'; op: Op; phase?: EdPhase; index?: number; srcEl: HTMLElement }): void {
    if (this.opts.readonly || e.button > 0) return;
    e.preventDefault();
    this.drag = { ...d, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
    const move = (ev: PointerEvent) => this.pointerMove(ev);
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      this.pointerUp(ev);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private pointerMove(e: PointerEvent): void {
    const d = this.drag; if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
      const r = d.srcEl.getBoundingClientRect();
      d.ghost = d.srcEl.cloneNode(true) as HTMLElement;
      d.ghost.classList.add('ghost'); d.ghost.classList.remove('current');
      d.ghost.style.width = r.width + 'px';
      document.body.appendChild(d.ghost);
      if (d.src === 'prog') d.srcEl.classList.add('dragging-src');
      audio.sfx('card_pick');
    }
    d.ghost.style.left = e.clientX - 30 + 'px';
    d.ghost.style.top = e.clientY - 18 + 'px';
    // find target
    this.el.querySelectorAll('.drop-marker').forEach((n) => n.remove());
    this.el.querySelectorAll('.prog-list.drop-active').forEach((n) => n.classList.remove('drop-active'));
    this.trash.classList.remove('hot');
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (under?.closest('.trash') || (d.src === 'prog' && under?.closest('.toolbox'))) {
      this.trash.classList.add('hot'); d.target = 'trash'; return;
    }
    // generous snapping: any point inside the column counts
    const col = under?.closest('.prog-col');
    const list = (col?.querySelector('.prog-list') ?? under?.closest('.prog-list')) as HTMLElement | null;
    if (!list) { d.target = null; return; }
    const ph = list.dataset.phase as EdPhase;
    const cards = [...list.querySelectorAll(':scope > .card')] as HTMLElement[];
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { index = i; break; }
    }
    d.target = { phase: ph, index };
    list.classList.add('drop-active');
    const marker = h('div', { class: 'drop-marker' });
    if (index < cards.length) list.insertBefore(marker, cards[index]); else list.appendChild(marker);
    // autoscroll
    const lr = list.getBoundingClientRect();
    if (e.clientY > lr.bottom - 30) list.scrollTop += 8; else if (e.clientY < lr.top + 30) list.scrollTop -= 8;
  }

  private pointerUp(_e: PointerEvent): void {
    const d = this.drag; this.drag = null; if (!d) return;
    this.el.querySelectorAll('.drop-marker').forEach((n) => n.remove());
    this.el.querySelectorAll('.prog-list.drop-active').forEach((n) => n.classList.remove('drop-active'));
    this.trash.classList.remove('hot');
    d.srcEl.classList.remove('dragging-src');
    if (!d.ghost) {
      // a click: toolbox card appends to the active column
      if (d.src === 'tool') {
        const ph = this.lists.has(this.activePhase) ? this.activePhase : [...this.lists.keys()][0];
        if (ph) this.insertNew(d.op as unknown as OpName, ph, this.progs[ph].length);
      }
      return;
    }
    d.ghost.remove();
    const tg = d.target;
    if (tg === 'trash') {
      if (d.src === 'prog') this.commit(() => this.progs[d.phase!].splice(d.index!, 1));
      return;
    }
    if (!tg) return;
    if (d.src === 'tool') { this.activePhase = tg.phase; this.insertNew(d.op as unknown as OpName, tg.phase, tg.index); return; }
    // move
    this.commit(() => {
      const [op] = this.progs[d.phase!].splice(d.index!, 1);
      let idx = tg.index;
      if (tg.phase === d.phase && d.index! < idx) idx--;
      this.progs[tg.phase].splice(idx, 0, op);
    });
  }

  // ───────────── text form / misc ─────────────
  private clearAll(): void {
    if (!this.level.editable.some((p) => this.progs[p].length)) return;
    this.commit(() => { for (const p of this.level.editable) this.progs[p] = []; });
    toast('Cleared. (Undo with Ctrl+Z)');
  }

  openText(): void {
    const areas = new Map<EdPhase, HTMLTextAreaElement>();
    const body = h('div', null, h('h2', null, 'Bot Code text'),
      h('p', { class: 'muted', style: 'margin:0 0 8px;font-size:14px' }, 'Copy it to share, or paste someone else\'s program and press Load.'));
    for (const ph of this.level.editable) {
      const ta = h('textarea', { spellcheck: 'false' }) as HTMLTextAreaElement;
      ta.value = quantum.printProgram(this.progs[ph]);
      areas.set(ph, ta);
      body.append(h('div', { class: 'display', style: 'margin:10px 0 4px' }, ph === 'bedtime' ? 'Bedtime' : 'Morning'), ta);
    }
    const err = h('div', { style: 'color:var(--redInk);font-size:13px;min-height:18px;margin-top:6px' });
    let close = () => {};
    body.append(err, h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: async () => {
        const txt = [...areas.entries()].map(([ph, ta]) => (this.level.editable.length > 1 ? `# ${ph}\n` : '') + ta.value).join('\n');
        try { await navigator.clipboard.writeText(txt); toast('Copied!', 'good'); } catch { toast('Select the text and copy it manually.'); }
      } }, 'Copy'),
      h('button', { class: 'btn small primary', onclick: () => {
        const next: Progs = {};
        for (const [ph, ta] of areas) {
          const r = quantum.parseProgram(ta.value);
          if (r.errors.length) { err.textContent = `${ph}: line ${r.errors[0].line}: ${r.errors[0].msg}`; return; }
          next[ph] = r.prog;
        }
        this.setProgs(next); close(); toast('Program loaded', 'good');
      } }, 'Load')));
    close = modal(body);
  }
}
