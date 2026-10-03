/**
 * Bot Code editor (7 Billion Humans style). DOM-based.
 * Toolbox of chunky cards → program column per editable phase. Pointer-event drag & drop
 * (mouse + touch), arg chips with dropdowns or click-a-creature picking, IF rows, curvy SVG
 * arrows to labels, trash / ×, undo/redo, text import/export via quantum.parse/printProgram.
 */
import type { LevelDef, Op, OpName, Program, QubitId, Cond, BotId } from '../../core/contracts';
import { isBot } from '../../core/contracts';
import { quantum, audio } from '../../engine/deps';
import { reference as quantumReference } from '../../quantum/index';
import type { LineRef } from '../../engine/playback';
import { h, modal, toast } from '../../engine/util';
import { doodleSvg, openDoodle } from './doodle';
import { openCardGuide } from '../cardGuidePanel';

export type EdPhase = 'bedtime' | 'morning';
export type Progs = { bedtime?: Program; morning?: Program };
/** Three program slots (A/B/C) per editable phase; Run/Test use the active one. */
export interface SlotState { active: Record<EdPhase, number>; bedtime: Program[]; morning: Program[] }
export const SLOT_NAMES = ['A', 'B', 'C'];

export interface EditorOpts {
  onChange(progs: Progs, slots: SlotState): void;
  /** Ask the scene to let the player click a creature. Returns a cancel fn. */
  beginPick?(allowed: QubitId[], cb: (id: QubitId) => void): () => void;
  /** 'safe' = PEEK is allowed here (classical / allowPeekData); 'wakes' = PEEK wakes Qubbles (hazard tape). */
  peekMode?: 'safe' | 'wakes';
  slots?: SlotState;
  /** level ids already won (unlocks starter snippets) */
  isDone?(levelId: string): boolean;
  readonly?: boolean;
}

// ───────── snippet library (localStorage, try/catch) ─────────
export interface Snippet { id: string; name: string; ops: Program; starter?: boolean; unlockAfter?: string }
const SNIP_KEY = 'np.snippets';
function loadSnippets(): Snippet[] {
  try { const v = JSON.parse(localStorage.getItem(SNIP_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function storeSnippets(list: Snippet[]): void {
  try { localStorage.setItem(SNIP_KEY, JSON.stringify(list.filter((s) => !s.starter))); } catch { /* private mode */ }
}
function starterSnippets(): Snippet[] {
  const R = quantumReference;
  return [
    { id: 'st-parity', name: 'Parity check (q1 vs q2)', ops: R.PARITY_CHECK, starter: true, unlockAfter: '2-1' },
    { id: 'st-encode', name: 'Make triplets (encode)', ops: R.BITFLIP_ENCODE, starter: true, unlockAfter: '2-2' },
    { id: 'st-bitflip', name: 'Bit-flip correct (2 bots)', ops: R.BITFLIP_CORRECT, starter: true, unlockAfter: '2-3' },
  ];
}

const CARD_HELP: Record<OpName, string> = {
  BOOP: 'flip the dream', SHUSH: 'flip the swirl', SPIN: 'turn the dream sideways', HIGHFIVE: 'target flips if source is Moony',
  LISTEN: 'bot lights up: BEEP or QUIET', RESET: 'bot back to QUIET', PEEK: 'PEEK (wakes it!): looking at a Qubble wakes it and pops its double-dream', IF: 'jump if lights match',
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
  private help!: HTMLElement;
  private statsEl!: HTMLElement;
  private columnsEl!: HTMLElement;
  private toolboxEl!: HTMLElement;
  private drag: null | {
    src: 'tool' | 'prog' | 'snip'; op: Op; phase?: EdPhase; index?: number; startX: number; startY: number; snip?: Snippet;
    ghost?: HTMLElement; srcEl: HTMLElement; target?: { phase: EdPhase; index: number } | 'trash' | 'help' | { snipBefore: string } | null; pointerId: number; down: PointerEvent;
  } = null;

  slots: SlotState;
  private sel = new Set<number>();           // selected card indices in the active phase
  private selPhase: EdPhase | null = null;
  private selAnchor = -1;
  private snippets: Snippet[] = loadSnippets();
  private drawer!: HTMLElement;
  private snipBtn!: HTMLElement;
  private saveSnipBtn!: HTMLElement;
  private tabBars = new Map<EdPhase, HTMLElement>();

  constructor(readonly level: LevelDef, initial: Progs, readonly opts: EditorOpts) {
    const ph0: EdPhase[] = ['bedtime', 'morning'];
    const st = opts.slots;
    const start = (ph: EdPhase) => structuredClone(initial[ph] ?? (ph === 'bedtime' ? level.starterBedtime : level.starterMorning) ?? []);
    this.slots = {
      active: { bedtime: st?.active?.bedtime ?? 0, morning: st?.active?.morning ?? 0 },
      bedtime: [0, 1, 2].map((k) => structuredClone(st?.bedtime?.[k] ?? (k === 0 ? start('bedtime') : []))),
      morning: [0, 1, 2].map((k) => structuredClone(st?.morning?.[k] ?? (k === 0 ? start('morning') : []))),
    };
    for (const ph of ph0) this.slots.active[ph] = Math.max(0, Math.min(2, this.slots.active[ph] | 0));
    this.progs = {
      bedtime: this.slots.bedtime[this.slots.active.bedtime],
      morning: this.slots.morning[this.slots.active.morning],
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
    const tools = TOOL_ORDER.filter((t) => lv.toolbox.includes(t) || (t === 'NOTE' && !this.opts.readonly));
    for (const name of tools) {
      const op = this.defaultOp(name, 'morning', true);
      const c = this.cardEl(op, { tool: true });
      c.title = this.helpFor(name);
      if (name === 'PEEK' && this.peekWakes) c.appendChild(h('small', { class: 'wakes' }, 'wakes it!'));
      const info = h('button', { class: 'info', type: 'button', title: `About ${name === 'NOTE' ? 'COMMENT' : name}`, 'aria-label': `About ${name === 'NOTE' ? 'COMMENT' : name}` }, 'i');
      info.addEventListener('pointerdown', (e) => e.stopPropagation());
      info.addEventListener('click', (e) => { e.stopPropagation(); openCardGuide(name, this.level); });
      c.appendChild(info);
      c.addEventListener('pointerdown', (e) => this.pointerDown(e, { src: 'tool', op: name as unknown as Op, srcEl: c }));
      this.toolboxEl.appendChild(c);
    }
    if (!tools.some((t) => t !== 'NOTE')) this.toolboxEl.appendChild(h('div', { class: 'muted', style: 'font-size:12px' }, 'No cards! The best code is no code.'));

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
      if (editable && !this.opts.readonly) {
        const bar = h('div', { class: 'slot-tabs', role: 'tablist', 'aria-label': `${title} program slots` });
        this.tabBars.set(ph, bar);
        col.appendChild(bar);
      }
      if (fixed?.length) {
        const fp = h('div', { class: 'fixed-phase' + (fixed.length <= 10 ? ' open' : '') },
          h('div', { class: 'fp-head', title: 'Schrödi hops out of his box and does these cards himself' + (editable ? ', before yours' : '') }, `🐾 Schrödi's checklist${editable ? ' (runs first)' : ''} · ${fixed.length} cards`));
        const list = h('div', { class: 'fp-list' });
        fixed.forEach((op) => list.appendChild(this.cardEl(op, { readonly: true })));
        fp.appendChild(list);
        fp.firstElementChild!.addEventListener('click', () => fp.classList.toggle('open'));
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
    this.help = h('div', { class: 'help-slot', title: 'Drag a card here to learn about it' }, '❓ help');
    this.statsEl = h('div', { class: 'stats' });
    this.snipBtn = h('button', { class: 'btn small', title: 'Snippet library: saved bits of Bot Code', onclick: () => this.toggleDrawer() }, '📚 Snippets');
    this.saveSnipBtn = h('button', { class: 'btn small sun hidden', title: 'Save the selected cards as a snippet', onclick: () => this.saveSnippet() }, '＋ Save as snippet');
    const foot = h('div', { class: 'editor-foot' },
      this.trash,
      this.help,
      h('button', { class: 'btn icon small', title: 'Undo (Ctrl+Z)', onclick: () => this.undo() }, '↶'),
      h('button', { class: 'btn icon small', title: 'Redo (Ctrl+Y)', onclick: () => this.redo() }, '↷'),
      h('button', { class: 'btn small', title: 'Copy / paste your program as text', onclick: () => this.openText() }, 'Text'),
      h('button', { class: 'btn small', title: 'Clear your program', onclick: () => this.clearAll() }, 'Clear'),
      this.opts.readonly ? null : this.snipBtn,
      this.saveSnipBtn,
      this.statsEl,
    );
    this.drawer = h('div', { class: 'snip-drawer hidden' });
    this.el.append(h('div', { class: 'editor-body' }, this.toolboxEl, this.columnsEl), this.drawer, foot);
  }

  // ───────────── model helpers ─────────────
  get peekWakes(): boolean { return this.opts.peekMode ? this.opts.peekMode === 'wakes' : !(this.level.classical || this.level.allowPeekData); }
  private helpFor(name: OpName): string {
    if (name === 'PEEK') return this.peekWakes ? 'PEEK: on a Qubble it WAKES it (pops its double-dream). On a bot it never wakes anyone (same as LISTEN).' : this.level.classical ? 'Peek: look in the box' : 'Peek: look at it (allowed here)';
    return CARD_HELP[name];
  }
  /** write the live programs back into their active slots */
  private syncSlots(): void {
    for (const ph of ['bedtime', 'morning'] as EdPhase[]) this.slots[ph][this.slots.active[ph]] = this.progs[ph];
  }
  private snapshot(): string { this.syncSlots(); return JSON.stringify(this.slots); }
  private restore(js: string): void {
    this.slots = JSON.parse(js);
    this.progs = { bedtime: this.slots.bedtime[this.slots.active.bedtime], morning: this.slots.morning[this.slots.active.morning] };
  }
  private emit(): void { this.syncSlots(); this.opts.onChange(this.exportProgs(), structuredClone(this.slots)); }
  private commit(mut: () => void, sfx: 'card_drop' | 'ui_click' | null = 'card_drop'): void {
    this.history.push(this.snapshot());
    if (this.history.length > 200) this.history.shift();
    this.future = [];
    mut();
    if (sfx) audio.sfx(sfx);
    this.clearSel();
    this.render();
    this.emit();
  }
  undo(): void {
    const prev = this.history.pop(); if (!prev) return;
    this.future.push(this.snapshot()); this.restore(prev);
    audio.sfx('ui_click', { pitch: 0.8 }); this.clearSel(); this.render(); this.emit();
  }
  redo(): void {
    const nx = this.future.pop(); if (!nx) return;
    this.history.push(this.snapshot()); this.restore(nx);
    audio.sfx('ui_click', { pitch: 1.2 }); this.clearSel(); this.render(); this.emit();
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

  // ───────────── program slots (A/B/C) ─────────────
  switchSlot(ph: EdPhase, k: number): void {
    if (this.slots.active[ph] === k) return;
    this.commit(() => {
      this.syncSlots();
      this.slots.active[ph] = k;
      this.progs[ph] = this.slots[ph][k];
    }, 'ui_click');
    toast(`${ph === 'bedtime' ? 'Bedtime' : 'Morning'} slot ${SLOT_NAMES[k]}: Run and Test use this one`, '', 1600);
  }
  private copySlot(ph: EdPhase, from: number, to: number): void {
    this.commit(() => {
      this.syncSlots();
      this.slots[ph][to] = structuredClone(this.slots[ph][from]);
      if (this.slots.active[ph] === to) this.progs[ph] = this.slots[ph][to];
    }, 'card_drop');
    toast(`Copied slot ${SLOT_NAMES[from]} → ${SLOT_NAMES[to]}`, 'good', 1600);
  }
  private renderTabs(): void {
    for (const [ph, bar] of this.tabBars) {
      bar.innerHTML = '';
      const act = this.slots.active[ph];
      SLOT_NAMES.forEach((nm, k) => {
        const n = (k === act ? this.progs[ph] : this.slots[ph][k]).filter((o) => o.op !== 'LABEL' && o.op !== 'NOTE').length;
        bar.appendChild(h('button', { class: `slot-tab${k === act ? ' on' : ''}`, role: 'tab', 'aria-selected': k === act ? 'true' : 'false', title: `Program slot ${nm} (${n} lines)`, onclick: () => this.switchSlot(ph, k) },
          nm, h('span', { class: 'n' }, n ? String(n) : '·')));
      });
      const cp = h('button', { class: 'slot-tab copy', title: 'Copy this slot into another slot' }, '⧉');
      cp.addEventListener('click', (e) => {
        e.stopPropagation();
        const others = [0, 1, 2].filter((k) => k !== act);
        this.popover(cp, others.map((k) => ({ text: `${SLOT_NAMES[act]} → ${SLOT_NAMES[k]}`, val: String(k) })), (v) => this.copySlot(ph, act, +v), 'Copy this slot to…');
      });
      bar.appendChild(cp);
    }
  }

  // ───────────── selection + snippets ─────────────
  private clearSel(): void { this.sel.clear(); this.selPhase = null; this.selAnchor = -1; }
  private clickCard(ph: EdPhase, i: number, e: PointerEvent): void {
    if (e.shiftKey && this.selPhase === ph && this.selAnchor >= 0) {
      const [a, b] = [Math.min(this.selAnchor, i), Math.max(this.selAnchor, i)];
      this.sel.clear(); for (let k = a; k <= b; k++) this.sel.add(k);
    } else if ((e.ctrlKey || e.metaKey) && this.selPhase === ph) {
      this.sel.has(i) ? this.sel.delete(i) : this.sel.add(i); this.selAnchor = i;
    } else if (this.selPhase === ph && this.sel.size === 1 && this.sel.has(i)) {
      this.clearSel();
    } else { this.sel.clear(); this.sel.add(i); this.selPhase = ph; this.selAnchor = i; }
    this.selPhase = this.sel.size ? ph : null;
    this.activePhase = ph;
    audio.sfx('ui_click', { pitch: 1.4, volume: 0.4 });
    this.applySel();
  }
  private applySel(): void {
    for (const [ph, list] of this.lists) {
      list.querySelectorAll(':scope > .card').forEach((c, k) => c.classList.toggle('sel', ph === this.selPhase && this.sel.has(k)));
    }
    this.saveSnipBtn.classList.toggle('hidden', !this.sel.size);
    this.saveSnipBtn.textContent = this.sel.size ? `＋ Save ${this.sel.size} card${this.sel.size > 1 ? 's' : ''} as snippet` : '';
  }
  /** insertion point: after the last selected card, else the end of the active column */
  private cursor(): { phase: EdPhase; index: number } | null {
    const ph = this.selPhase ?? (this.lists.has(this.activePhase) ? this.activePhase : [...this.lists.keys()][0]);
    if (!ph) return null;
    const idx = this.selPhase && this.sel.size ? Math.max(...this.sel) + 1 : this.progs[ph].length;
    return { phase: ph, index: idx };
  }
  private saveSnippet(): void {
    const ph = this.selPhase; if (!ph || !this.sel.size) return;
    const ops = [...this.sel].sort((a, b) => a - b).map((k) => structuredClone(this.progs[ph][k]));
    const inp = h('input', { class: 'text-input', maxlength: 40, value: this.guessName(ops), 'aria-label': 'Snippet name' }) as HTMLInputElement;
    let close = () => {};
    const ok = () => {
      const name = inp.value.trim() || 'my snippet';
      this.snippets = [{ id: 'u' + Date.now().toString(36), name, ops }, ...this.snippets];
      storeSnippets(this.snippets);
      close(); this.clearSel(); this.applySel();
      toast(`Saved snippet "${name}"`, 'good');
      this.renderDrawer(); this.drawer.classList.remove('hidden'); this.snipBtn.classList.add('on');
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); });
    close = modal(h('div', null, h('h2', null, 'Save as snippet'),
      h('p', { class: 'muted', style: 'margin:0 0 8px' }, `${ops.length} card${ops.length > 1 ? 's' : ''}. Give it a name you will recognise at 3am.`),
      inp, h('div', { class: 'row' }, h('button', { class: 'btn primary small', onclick: ok }, 'Save'))));
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  }
  private guessName(ops: Program): string {
    if (ops.some((o) => o.op === 'IF')) return 'check and fix';
    if (ops.every((o) => o.op === 'HIGHFIVE')) return 'high-five chain';
    return `${ops[0]?.op.toLowerCase() ?? 'my'} snippet`;
  }
  private allSnippets(): Snippet[] { return [...this.snippets, ...starterSnippets()]; }
  private snippetIssue(sn: Snippet): string | null {
    if (sn.unlockAfter && !this.opts.isDone?.(sn.unlockAfter)) return `unlocks after level ${sn.unlockAfter}`;
    const ids = new Set<string>([...this.qubbles, ...this.bots]);
    for (const o of sn.ops) {
      if (o.op !== 'LABEL' && o.op !== 'NOTE' && !this.level.toolbox.includes(o.op)) return `needs ${o.op}, not in this toolbox`;
      const who = 't' in o ? [o.t] : o.op === 'HIGHFIVE' ? [o.from, o.to] : o.op === 'IF' ? o.conds.map((c) => c.who) : [];
      const miss = who.find((w) => !ids.has(w));
      if (miss) return `uses ${miss}, who isn't here`;
    }
    return null;
  }
  private toggleDrawer(): void {
    const open = this.drawer.classList.toggle('hidden') === false;
    this.snipBtn.classList.toggle('on', open);
    audio.sfx('ui_click');
    if (open) this.renderDrawer();
    requestAnimationFrame(this.drawArrowsAll);
  }
  private renderDrawer(): void {
    const d = this.drawer; d.innerHTML = '';
    d.appendChild(h('div', { class: 'snip-head' }, h('span', { class: 'display' }, 'Snippets'),
      h('span', { class: 'muted' }, 'click to insert at the cursor, or drag into a column · select cards (shift-click a range) to save new ones'),
      h('button', { class: 'btn icon small close', 'aria-label': 'Close snippets', onclick: () => this.toggleDrawer() }, '×')));
    const row = h('div', { class: 'snip-row' });
    const list = this.allSnippets();
    if (!list.length) row.appendChild(h('div', { class: 'muted' }, 'No snippets yet.'));
    for (const sn of list) {
      const issue = this.snippetIssue(sn);
      const locked = !!sn.unlockAfter && !this.opts.isDone?.(sn.unlockAfter);
      const lines = sn.ops.filter((o) => o.op !== 'LABEL' && o.op !== 'NOTE');
      const ops = h('div', { class: 'snip-ops' }, ...lines.slice(0, 8).map((o) => h('i', { class: `op-${o.op}`, title: quantum.printProgram([o]).trim() })), lines.length > 8 ? h('span', null, '…') : null);
      const el = h('div', { class: `snip${issue ? ' off' : ''}${sn.starter ? ' starter' : ''}`, tabindex: issue ? null : 0,
        title: issue ? `${sn.name}: ${issue}` : `${sn.name}\n${quantum.printProgram(sn.ops)}` },
        h('div', { class: 'snip-name' }, locked ? '🔒 ' : sn.starter ? '⭐ ' : '', locked ? '???' : sn.name),
        locked ? h('div', { class: 'muted snip-sub' }, issue) : ops,
        h('div', { class: 'muted snip-sub' }, locked ? '' : issue ?? `${lines.length} card${lines.length === 1 ? '' : 's'}`));
      el.dataset.snip = sn.id;
      if (!sn.starter) {
        const mine = this.snippets.findIndex((x) => x.id === sn.id);
        const mv = (dir: -1 | 1) => (e: Event) => { e.stopPropagation(); this.moveSnippet(sn.id, mine + dir); };
        el.appendChild(h('div', { class: 'snip-move' },
          mine > 0 ? h('button', { type: 'button', title: 'Move left', 'aria-label': 'Move snippet left', onclick: mv(-1) }, '‹') : null,
          mine < this.snippets.length - 1 ? h('button', { type: 'button', title: 'Move right', 'aria-label': 'Move snippet right', onclick: mv(1) }, '›') : null));
        el.appendChild(h('button', { class: 'x', title: 'Delete snippet', 'aria-label': 'Delete snippet', onclick: (e: Event) => {
          e.stopPropagation(); this.snippets = this.snippets.filter((x) => x.id !== sn.id); storeSnippets(this.snippets); this.renderDrawer();
        } }, '×'));
      }
      if (!issue) {
        el.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('.x, .snip-move')) return; this.pointerDown(e, { src: 'snip', op: { op: 'NOTE', text: sn.id }, srcEl: el, snip: sn }); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const c = this.cursor(); if (c) this.insertSnippet(sn, c.phase, c.index); } });
      }
      row.appendChild(el);
    }
    d.appendChild(row);
  }
  /** Insert a snippet's ops, renaming its labels so they don't clash with existing spots. */
  /** Reorder the player's own snippets (starters always stay at the end). */
  private moveSnippet(id: string, to: number): void {
    const from = this.snippets.findIndex((x) => x.id === id);
    if (from < 0) return;
    to = Math.max(0, Math.min(this.snippets.length - 1, to));
    if (to === from) return;
    const [sn] = this.snippets.splice(from, 1);
    this.snippets.splice(to, 0, sn);
    storeSnippets(this.snippets); this.renderDrawer(); audio.sfx('card_drop');
  }
  private insertSnippet(sn: Snippet, ph: EdPhase, index: number): void {
    this.commit(() => {
      const used = new Set<string>();
      for (const p of [this.progs.bedtime, this.progs.morning]) for (const o of p) if (o.op === 'LABEL') used.add(o.name);
      const map = new Map<string, string>();
      const fresh = (old: string) => {
        if (map.has(old)) return map.get(old)!;
        let n = old; let k = 2;
        while (used.has(n)) n = `${old}${k++}`;
        used.add(n); map.set(old, n); return n;
      };
      const ops = structuredClone(sn.ops);
      for (const o of ops) if (o.op === 'LABEL') o.name = fresh(o.name);
      for (const o of ops) if ((o.op === 'IF' || o.op === 'JUMP') && map.has(o.label)) o.label = map.get(o.label)!;
      this.progs[ph].splice(index, 0, ...ops);
    });
    toast(`Inserted "${sn.name}"`, 'good', 1400);
  }
  /** Flash cards of these op kinds (hint highlights) in the toolbox and the programs. */
  flashOps(names: OpName[], ms = 4000): void {
    const set = new Set(names);
    this.el.querySelectorAll('.card').forEach((c) => {
      const m = /op-([A-Z]+)/.exec(c.className); if (m && set.has(m[1] as OpName)) { c.classList.remove('hint-hl'); void (c as HTMLElement).offsetWidth; c.classList.add('hint-hl'); }
    });
    clearTimeout(this.flashT);
    this.flashT = window.setTimeout(() => this.el.querySelectorAll('.hint-hl').forEach((c) => c.classList.remove('hint-hl')), ms);
  }
  private flashT = 0;
  /** Pulse the IF/JUMP arrow for a jump event of the current card. */
  pulseJump(taken: boolean): void {
    const cur = this.el.querySelector('.card.current');
    if (!cur) return;
    cur.classList.remove('jump-yes', 'jump-no'); void (cur as HTMLElement).offsetWidth;
    cur.classList.add(taken ? 'jump-yes' : 'jump-no');
    setTimeout(() => cur.classList.remove('jump-yes', 'jump-no'), 700);
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
    this.renderTabs();
    this.applySel();
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
    if (op.op === 'PEEK') {
      // PEEK only wakes a *Qubble* in a no-peek level; peeking at a bot is always safe (it's an ancilla, like LISTEN)
      const onBot = !o.tool && isBot(op.t);
      if (this.peekWakes && !onBot) c.classList.add('hazard');
      if (!o.tool) {
        c.title = onBot ? `PEEK ${op.t}: look at a bot. Wakes no Qubble (same as LISTEN)` : this.helpFor('PEEK');
        c.appendChild(h('small', { class: 'peek-tag' + (this.peekWakes && !onBot ? ' wakes' : ' safe') }, this.peekWakes && !onBot ? 'wakes it!' : 'safe'));
      }
    }
    const name = o.tool ? (op.op === 'NOTE' ? 'COMMENT' : op.op) : op.op === 'LABEL' ? '⚑' : op.op === 'NOTE' ? '✎' : op.op;
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
        const pad = h('div', { class: 'doodle-box' + (op.drawing ? '' : ' empty'), title: live ? 'Click to doodle' : '' }, doodleSvg(op.drawing));
        if (!op.drawing && live) pad.appendChild(h('span', { class: 'doodle-hint' }, '✏️ doodle'));
        if (live) {
          pad.addEventListener('pointerdown', (e) => e.stopPropagation());
          pad.addEventListener('click', (e) => {
            e.stopPropagation();
            openDoodle(op.drawing, op.text, (drawing, text) => this.commit(() => {
              const o2 = this.progs[ph][idx] as typeof op;
              o2.text = text; if (drawing) o2.drawing = drawing; else delete o2.drawing;
            }, 'ui_click'));
          });
        }
        if (op.drawing || live) c.appendChild(pad);
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
    // fixed routines stay open so players can watch them run
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
  private pointerDown(e: PointerEvent, d: { src: 'tool' | 'prog' | 'snip'; op: Op; phase?: EdPhase; index?: number; srcEl: HTMLElement; snip?: Snippet }): void {
    if (this.opts.readonly || e.button > 0) return;
    e.preventDefault();
    this.drag = { ...d, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, down: e };
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
      d.ghost.classList.add('ghost'); d.ghost.classList.remove('current', 'sel');
      if (d.src === 'snip') d.ghost.classList.add('card', 'op-NOTE');
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
    this.trash.classList.remove('hot'); this.help.classList.remove('hot');
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    this.drawer.querySelectorAll('.snip.drop-before').forEach((n) => n.classList.remove('drop-before'));
    const overSnip = d.src === 'snip' && d.snip && !d.snip.starter ? (under?.closest('.snip') as HTMLElement | null) : null;
    if (overSnip && overSnip.dataset.snip && overSnip.dataset.snip !== d.snip!.id && this.snippets.some((x) => x.id === overSnip.dataset.snip)) {
      overSnip.classList.add('drop-before'); d.target = { snipBefore: overSnip.dataset.snip }; return;
    }
    if (d.src !== 'snip' && under?.closest('.help-slot')) { this.help.classList.add('hot'); d.target = 'help'; return; }
    if (d.src !== 'snip' && (under?.closest('.trash') || (d.src === 'prog' && under?.closest('.toolbox')))) {
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
    this.trash.classList.remove('hot'); this.help.classList.remove('hot');
    d.srcEl.classList.remove('dragging-src');
    if (!d.ghost) {
      // a click: toolbox card appends to the active column
      if (d.src === 'tool') {
        const c = this.cursor();
        if (c) this.insertNew(d.op as unknown as OpName, c.phase, c.index);
      } else if (d.src === 'snip' && d.snip) {
        const c = this.cursor();
        if (c) this.insertSnippet(d.snip, c.phase, c.index);
      } else if (d.src === 'prog') this.clickCard(d.phase!, d.index!, d.down);
      return;
    }
    d.ghost.remove();
    const tg = d.target;
    this.drawer.querySelectorAll('.snip.drop-before').forEach((n) => n.classList.remove('drop-before'));
    if (tg && typeof tg === 'object' && 'snipBefore' in tg) {
      if (d.snip) { const from = this.snippets.findIndex((x) => x.id === d.snip!.id); let to = this.snippets.findIndex((x) => x.id === tg.snipBefore); if (from < to) to--; this.moveSnippet(d.snip.id, to); }
      return;
    }
    if (tg === 'help') {
      const nm = (d.src === 'tool' ? (d.op as unknown as OpName) : d.op.op) as OpName;
      openCardGuide(nm, this.level); // the card stays where it was
      return;
    }
    if (tg === 'trash') {
      if (d.src === 'prog') this.commit(() => this.progs[d.phase!].splice(d.index!, 1));
      return;
    }
    if (!tg) return;
    if (d.src === 'snip') { if (d.snip) this.insertSnippet(d.snip, tg.phase, tg.index); return; }
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
