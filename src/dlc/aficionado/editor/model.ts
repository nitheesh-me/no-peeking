/**
 * Circuit model ⇄ shared Bot Code `Op[]` (exact, documented mapping; see docs/AFICIONADO_NOTES.md § Editor mapping).
 *
 *   X q      ⇄ BOOP q            Z q  ⇄ SHUSH q        H q ⇄ SPIN q
 *   CNOT c→t ⇄ HIGHFIVE c -> t   MEASURE q ⇄ LISTEN q (ancilla) | PEEK q (data)   RESET q ⇄ RESET q
 *   Y / S / CZ ⇄ { op:'Y'|'S', t } / { op:'CZ', from, to } once the shared VM provides them (feature-detected)
 *
 * Classical bits are named after the measured qubit: c_a = the last MEASURE outcome of qubit a (the VM's
 * Cond semantics: an unmeasured bit reads 0). A classically controlled gate block
 *     if (c_a==1 && c_b==0) { X q2; Z q3 }
 * is emitted as a forward-only block (identical VM semantics, and exportable as a dynamic circuit):
 *     IF a BEEP and b QUIET -> _ifN
 *     JUMP _fiN
 *     _ifN:
 *     BOOP q2
 *     SHUSH q3
 *     _fiN:
 * Import recognises that pattern and the classic "tail fix" pattern (a chain of mutually exclusive IFs,
 * END, then `label: gates… END` blocks) and turns both back into conditioned gates. Anything else
 * (loops, shared labels, measurements inside blocks) is kept verbatim as control columns, so the
 * mapping is total: every Op[] round-trips to a program with the same behaviour.
 */
import type { Cond, LevelDef, Op, OpName, Program, QubitId } from '../../../core/contracts';
import { isBot } from '../../../core/contracts';

export type GateKind = 'X' | 'Z' | 'H' | 'Y' | 'S' | 'SDG' | 'CNOT' | 'CZ' | 'SWAP' | 'MEASURE' | 'RESET';
export interface Gate { id: number; kind: GateKind; q: QubitId; c?: QubitId; cond?: Cond[] }
export type Ctrl =
  | { kind: 'LABEL'; name: string }
  | { kind: 'JUMP'; label: string }
  | { kind: 'IFJ'; conds: Cond[]; label: string }
  | { kind: 'END' }
  | { kind: 'WAIT' }
  | { kind: 'NOTE'; text: string; drawing?: string };
export interface Column { id: number; gates: Gate[]; ctrl?: Ctrl }
export type PhaseName = 'bedtime' | 'morning';
export interface Segment { phase: PhaseName; locked: boolean; cols: Column[] }

let nextId = 1;
export const newId = (): number => nextId++;

export const TWO_Q: GateKind[] = ['CNOT', 'CZ', 'SWAP'];
export const isTwo = (k: GateKind): boolean => TWO_Q.includes(k);

/** Op name the VM uses for each gate kind (extra gates are only offered when the level toolbox lists them). */
const OPNAME: Record<GateKind, string> = { X: 'BOOP', Z: 'SHUSH', H: 'SPIN', Y: 'Y', S: 'S', SDG: 'SDG', CNOT: 'HIGHFIVE', CZ: 'CZ', SWAP: 'SWAP', MEASURE: 'LISTEN', RESET: 'RESET' };

/** Gate kinds offered by a level toolbox, in palette order. */
export type PaletteItem = GateKind | 'IF' | 'END' | 'WAIT';
export function paletteFor(level: LevelDef): PaletteItem[] {
  const tb = new Set<string>(level.toolbox as string[]);
  const out: PaletteItem[] = [];
  if (tb.has('BOOP')) out.push('X');
  if (tb.has('Y')) out.push('Y');
  if (tb.has('SHUSH')) out.push('Z');
  if (tb.has('SPIN')) out.push('H');
  if (tb.has('S')) out.push('S');
  if (tb.has('SDG')) out.push('SDG');
  if (tb.has('HIGHFIVE')) out.push('CNOT');
  if (tb.has('CZ')) out.push('CZ');
  if (tb.has('SWAP')) out.push('SWAP');
  if (tb.has('LISTEN') || tb.has('PEEK')) out.push('MEASURE');
  if (tb.has('RESET')) out.push('RESET');
  if (tb.has('IF')) out.push('IF');
  if (tb.has('END')) out.push('END');
  if (tb.has('WAIT')) out.push('WAIT');
  return out;
}
export function toolboxAllows(level: LevelDef, op: OpName | string): boolean { return (level.toolbox as string[]).includes(op); }

/** Wire order: data qubits, then ancillas (as the level lists them). */
export function wiresOf(level: LevelDef): QubitId[] {
  return [...level.qubbles.map((p) => p.id), ...level.bots.map((p) => p.id)];
}

// ───────────── gate ⇄ op ─────────────
function gateOp(g: Gate): Op {
  switch (g.kind) {
    case 'X': return { op: 'BOOP', t: g.q };
    case 'Z': return { op: 'SHUSH', t: g.q };
    case 'H': return { op: 'SPIN', t: g.q };
    case 'CNOT': return { op: 'HIGHFIVE', from: g.c!, to: g.q };
    case 'MEASURE': return isBot(g.q) ? { op: 'LISTEN', t: g.q } : { op: 'PEEK', t: g.q };
    case 'RESET': return { op: 'RESET', t: g.q as never };
    case 'CZ': case 'SWAP': return { op: g.kind, from: g.c!, to: g.q };
    default: return { op: OPNAME[g.kind] as 'Y' | 'S' | 'SDG', t: g.q };
  }
}
function opGate(o: Op): Gate | null {
  const a = o as unknown as { op: string; t?: QubitId; from?: QubitId; to?: QubitId };
  switch (a.op) {
    case 'BOOP': return { id: newId(), kind: 'X', q: a.t! };
    case 'SHUSH': return { id: newId(), kind: 'Z', q: a.t! };
    case 'SPIN': return { id: newId(), kind: 'H', q: a.t! };
    case 'Y': return { id: newId(), kind: 'Y', q: a.t! };
    case 'S': return { id: newId(), kind: 'S', q: a.t! };
    case 'SDG': return { id: newId(), kind: 'SDG', q: a.t! };
    case 'SWAP': return { id: newId(), kind: 'SWAP', c: a.from!, q: a.to! };
    case 'HIGHFIVE': return { id: newId(), kind: 'CNOT', c: a.from!, q: a.to! };
    case 'CZ': return { id: newId(), kind: 'CZ', c: a.from!, q: a.to! };
    case 'LISTEN': case 'PEEK': return { id: newId(), kind: 'MEASURE', q: a.t! };
    case 'RESET': return { id: newId(), kind: 'RESET', q: a.t! };
    default: return null;
  }
}
function ctrlOp(c: Ctrl): Op {
  switch (c.kind) {
    case 'LABEL': return { op: 'LABEL', name: c.name };
    case 'JUMP': return { op: 'JUMP', label: c.label };
    case 'IFJ': return { op: 'IF', conds: c.conds, label: c.label };
    case 'END': return { op: 'END' };
    case 'WAIT': return { op: 'WAIT' };
    case 'NOTE': return c.drawing ? { op: 'NOTE', text: c.text, drawing: c.drawing } : { op: 'NOTE', text: c.text };
  }
}
function opCtrl(o: Op): Ctrl | null {
  switch (o.op) {
    case 'LABEL': return { kind: 'LABEL', name: o.name };
    case 'JUMP': return { kind: 'JUMP', label: o.label };
    case 'IF': return { kind: 'IFJ', conds: o.conds, label: o.label };
    case 'END': return { kind: 'END' };
    case 'WAIT': return { kind: 'WAIT' };
    case 'NOTE': return { kind: 'NOTE', text: o.text, drawing: o.drawing };
    default: return null;
  }
}

export const condKey = (c?: Cond[]): string => (c && c.length ? [...c].sort((x, y) => x.who.localeCompare(y.who)).map((k) => `${k.who}=${k.is}`).join('&') : '');

/** The wires a gate occupies in its column (2-qubit gates block every wire between their ends). */
export function spanOf(g: Gate, wires: QubitId[]): QubitId[] {
  if (!g.c) return [g.q];
  const a = wires.indexOf(g.c), b = wires.indexOf(g.q);
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return wires.slice(lo, hi + 1);
}

// ───────────── circuit → Op[] ─────────────
export function orderColumn(gates: Gate[], wires: QubitId[]): Gate[] {
  const w = (g: Gate) => wires.indexOf(g.q) + (condKey(g.cond) ? 1000 : 0);
  return [...gates].sort((a, b) => w(a) - w(b));
}

export interface Linear { prog: Program; /** op index → column id (+ gate id) for trace highlighting */ at: { col: number; gate?: number }[] }

export function toProgram(cols: Column[], wires: QubitId[]): Linear {
  const prog: Program = [], at: Linear['at'] = [];
  const used = new Set<string>();
  for (const c of cols) if (c.ctrl?.kind === 'LABEL') used.add(c.ctrl.name.toLowerCase());
  let n = 0;
  const fresh = (p: string) => { let s: string; do { s = `${p}${++n}`; } while (used.has(s)); used.add(s); return s; };
  type Item = { g?: Gate; c?: Ctrl; col: number };
  const items: Item[] = [];
  for (const col of cols) {
    if (col.ctrl) { items.push({ c: col.ctrl, col: col.id }); continue; }
    // within a time column: unconditioned gates first (wire order), then classically controlled ones
    orderColumn(col.gates, wires).forEach((g) => items.push({ g, col: col.id }));
  }
  for (let i = 0; i < items.length;) {
    const it = items[i];
    if (it.c) { prog.push(ctrlOp(it.c)); at.push({ col: it.col }); i++; continue; }
    const key = condKey(it.g!.cond);
    if (!key) { prog.push(gateOp(it.g!)); at.push({ col: it.col, gate: it.g!.id }); i++; continue; }
    let j = i;
    while (j < items.length && items[j].g && condKey(items[j].g!.cond) === key) j++;
    const L1 = fresh('_if'); n--; const L2 = fresh('_fi');
    prog.push({ op: 'IF', conds: it.g!.cond!, label: L1 }); at.push({ col: it.col, gate: it.g!.id });
    prog.push({ op: 'JUMP', label: L2 }); at.push({ col: it.col, gate: it.g!.id });
    prog.push({ op: 'LABEL', name: L1 }); at.push({ col: it.col });
    for (let k = i; k < j; k++) { prog.push(gateOp(items[k].g!)); at.push({ col: items[k].col, gate: items[k].g!.id }); }
    prog.push({ op: 'LABEL', name: L2 }); at.push({ col: items[j - 1].col });
    i = j;
  }
  return { prog, at };
}

// ───────────── Op[] → circuit ─────────────
/** src = op indices (into the source program) this item stands for; col = column id after packing */
export type Item = { g?: Gate; c?: Ctrl; src?: number[]; col?: number };
const isGateOp = (o: Op): boolean => opGate(o) !== null;
const isMeasure = (o: Op): boolean => o.op === 'LISTEN' || o.op === 'PEEK';
function refs(prog: Program): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of prog) if (o.op === 'IF' || o.op === 'JUMP') m.set(o.label.toLowerCase(), (m.get(o.label.toLowerCase()) ?? 0) + 1);
  return m;
}
const exclusive = (a: Cond[], b: Cond[]): boolean => a.some((x) => b.some((y) => y.who === x.who && y.is !== x.is));

/** Recognise conditioned-gate patterns; return items (gates with cond, or raw control). */
export function liftProgram(prog: Program): Item[] {
  const r = refs(prog);
  const labelAt = new Map<string, number>();
  prog.forEach((o, i) => { if (o.op === 'LABEL') labelAt.set(o.name.toLowerCase(), i); });
  const out: Item[] = [];
  // classic tail-fix pattern: first index i of a run of IFs that is followed by END and only fix blocks
  const tail = tailFix(prog, r);
  const stop = tail ? tail.start : prog.length;
  for (let i = 0; i < stop;) {
    const o = prog[i];
    // forward block: IF C -> L1; JUMP L2; L1: body; L2:
    if (o.op === 'IF' && prog[i + 1]?.op === 'JUMP' && prog[i + 2]?.op === 'LABEL') {
      const L1 = o.label.toLowerCase(), L2 = (prog[i + 1] as { label: string }).label.toLowerCase();
      if ((prog[i + 2] as { name: string }).name.toLowerCase() === L1 && r.get(L1) === 1 && r.get(L2) === 1 && L1 !== L2) {
        let k = i + 3;
        while (k < stop && isGateOp(prog[k]) && !isMeasure(prog[k])) k++;
        if (k < stop && prog[k].op === 'LABEL' && (prog[k] as { name: string }).name.toLowerCase() === L2 && k > i + 3) {
          for (let m = i + 3; m < k; m++) { const g = opGate(prog[m])!; g.cond = o.conds.map((c) => ({ ...c })); out.push({ g, src: m === i + 3 ? [i, i + 1, i + 2, m] : m === k - 1 ? [m, k] : [m] }); }
          i = k + 1; continue;
        }
      }
    }
    // mid-program fix blocks: IF C1 -> L1 … IF Ck -> Lk (pairwise exclusive); JUMP D; L1: gates (JUMP D)? … D:
    if (o.op === 'IF') { const m = midFix(prog, i, stop, r); if (m) { out.push(...m.items); i = m.next; continue; } }
    const g = opGate(o);
    out.push(g ? { g, src: [i] } : { c: opCtrl(o)!, src: [i] });
    i++;
  }
  if (tail) for (const b of tail.blocks) b.body.forEach((o, j) => { const g = opGate(o)!; g.cond = b.conds.map((c) => ({ ...c })); out.push({ g, src: j === 0 ? [b.ifAt, b.at + j] : [b.at + j] }); });
  return out;
}

function midFix(prog: Program, i: number, stop: number, r: Map<string, number>): { items: Item[]; next: number } | null {
  let j = i;
  while (j < stop && prog[j].op === 'IF') j++;
  const ifs = prog.slice(i, j) as Extract<Op, { op: 'IF' }>[];
  const jd = prog[j];
  if (jd?.op !== 'JUMP') return null;
  const D = jd.label.toLowerCase();
  for (let a = 0; a < ifs.length; a++) for (let b = a + 1; b < ifs.length; b++) if (!exclusive(ifs[a].conds, ifs[b].conds)) return null;
  const blocks = new Map<string, { at: number; body: Program }>();
  let k = j + 1, jumps = 1;
  while (k < stop) {
    const o = prog[k];
    if (o.op !== 'LABEL') return null;
    const lab = o.name.toLowerCase();
    if (lab === D) break;
    if (!ifs.some((x) => x.label.toLowerCase() === lab) || r.get(lab) !== 1 || blocks.has(lab)) return null;
    let e = k + 1;
    while (e < stop && isGateOp(prog[e]) && !isMeasure(prog[e])) e++;
    blocks.set(lab, { at: k + 1, body: prog.slice(k + 1, e) });
    if (prog[e]?.op === 'JUMP') { if ((prog[e] as { label: string }).label.toLowerCase() !== D) return null; jumps++; e++; }
    else if (prog[e]?.op !== 'LABEL') return null;
    k = e;
  }
  if (k >= stop || blocks.size !== ifs.length || r.get(D) !== jumps) return null;
  const items: Item[] = [];
  ifs.forEach((x, n) => {
    const bl = blocks.get(x.label.toLowerCase())!;
    bl.body.forEach((o, m) => { const g = opGate(o)!; g.cond = x.conds.map((c) => ({ ...c })); items.push({ g, src: m === 0 ? [i + n, bl.at - 1, bl.at] : [bl.at + m] }); });
  });
  return { items, next: k + 1 };
}

function tailFix(prog: Program, r: Map<string, number>): { start: number; blocks: { conds: Cond[]; body: Program; at: number; ifAt: number }[] } | null {
  const end = prog.findIndex((o) => o.op === 'END');
  if (end <= 0) return null;
  let start = end;
  while (start > 0 && prog[start - 1].op === 'IF') start--;
  if (start === end) return null;
  const ifs = prog.slice(start, end) as Extract<Op, { op: 'IF' }>[];
  // pairwise exclusive conditions, distinct labels each referenced exactly once
  for (let a = 0; a < ifs.length; a++) for (let b = a + 1; b < ifs.length; b++) if (!exclusive(ifs[a].conds, ifs[b].conds)) return null;
  // earlier code must not jump into the tail
  for (let i = 0; i < start; i++) { const o = prog[i]; if (o.op === 'JUMP' || o.op === 'IF') return null; }
  const blocks: { conds: Cond[]; body: Program; label: string; at: number; ifAt: number }[] = [];
  let i = end + 1;
  while (i < prog.length) {
    const o = prog[i];
    if (o.op !== 'LABEL') return null;
    const lab = o.name.toLowerCase();
    const src = ifs.find((x) => x.label.toLowerCase() === lab);
    if (!src || r.get(lab) !== 1) return null;
    let k = i + 1;
    while (k < prog.length && isGateOp(prog[k]) && !isMeasure(prog[k])) k++;
    if (k < prog.length && prog[k].op !== 'END') return null;
    blocks.push({ conds: src.conds, body: prog.slice(i + 1, k), label: lab, at: i + 1, ifAt: start + ifs.indexOf(src) });
    i = k + 1;
  }
  if (blocks.length !== ifs.length) return null;
  // keep IF order
  return { start, blocks: ifs.map((x) => blocks.find((b) => b.label === x.label.toLowerCase())!) };
}

/** ASAP packing into columns, preserving every quantum and classical dependency. */
export function packItems(items: Item[], wires: QubitId[]): Column[] {
  const cols: Column[] = [];
  const wireFree = new Map<QubitId, number>();
  const bitWrite = new Map<QubitId, number>(), bitRead = new Map<QubitId, number>();
  let barrier = 0;
  const ensure = (i: number) => { while (cols.length <= i) cols.push({ id: newId(), gates: [] }); };
  for (const it of items) {
    if (it.c) {
      const at = Math.max(barrier, cols.length);
      ensure(at); cols[at].ctrl = it.c; it.col = cols[at].id; barrier = at + 1; continue;
    }
    const g = it.g!;
    const span = spanOf(g, wires);
    let at = barrier;
    for (const w of span) at = Math.max(at, wireFree.get(w) ?? 0);
    for (const c of g.cond ?? []) at = Math.max(at, (bitWrite.get(c.who) ?? -1) + 1);
    if (g.kind === 'MEASURE') at = Math.max(at, (bitRead.get(g.q) ?? -1) + 1, (bitWrite.get(g.q) ?? -1) + 1);
    ensure(at);
    cols[at].gates.push(g); it.col = cols[at].id;
    for (const w of span) wireFree.set(w, at + 1);
    for (const c of g.cond ?? []) bitRead.set(c.who, Math.max(bitRead.get(c.who) ?? -1, at));
    if (g.kind === 'MEASURE') bitWrite.set(g.q, at);
  }
  return cols;
}

export function fromProgram(prog: Program, wires: QubitId[]): Column[] { return packItems(liftProgram(prog), wires); }
/** As fromProgram, plus a map from source op index (trace pc) to column id. */
export function fromProgramMapped(prog: Program, wires: QubitId[]): { cols: Column[]; pcCol: Map<number, number> } {
  const items = liftProgram(prog);
  const cols = packItems(items, wires);
  const pcCol = new Map<number, number>();
  for (const it of items) for (const i of it.src ?? []) if (it.col != null && !pcCol.has(i)) pcCol.set(i, it.col);
  return { cols, pcCol };
}

// ───────────── metrics ─────────────
export interface Metrics { gates: number; depth: number; ancillas: number; measurements: number }
export function metrics(cols: Column[], wires: QubitId[]): Metrics {
  const all = cols.flatMap((c) => c.gates);
  const repacked = packItems(all.map((g) => ({ g })), wires);
  const anc = new Set<string>();
  for (const g of all) for (const q of [g.q, g.c]) if (q && isBot(q)) anc.add(q);
  return { gates: all.length, depth: repacked.filter((c) => c.gates.length).length, ancillas: anc.size, measurements: all.filter((g) => g.kind === 'MEASURE').length };
}

/** Classical bits referenced (measured or read) in these columns, in wire order. */
export function classicalBits(cols: Column[], wires: QubitId[]): QubitId[] {
  const s = new Set<QubitId>();
  for (const c of cols) {
    for (const g of c.gates) { if (g.kind === 'MEASURE') s.add(g.q); for (const k of g.cond ?? []) s.add(k.who); }
    if (c.ctrl?.kind === 'IFJ') for (const k of c.ctrl.conds) s.add(k.who);
  }
  return wires.filter((w) => s.has(w));
}

/** Validate against the level: toolbox, wire existence, RESET only on ancillas. Returns problems (content keys + vars). */
export function validate(cols: Column[], level: LevelDef): { key: string; vars?: Record<string, string> }[] {
  const wires = wiresOf(level), out: { key: string; vars?: Record<string, string> }[] = [];
  const pal = paletteFor(level);
  for (const c of cols) for (const g of c.gates) {
    if (!pal.includes(g.kind)) out.push({ key: 'afi.editor.err.notInToolbox', vars: { gate: g.kind } });
    if (!wires.includes(g.q) || (g.c && !wires.includes(g.c))) out.push({ key: 'afi.editor.err.noWire', vars: { gate: g.kind } });
    if (g.kind === 'RESET' && !isBot(g.q)) out.push({ key: 'afi.editor.err.resetData', vars: { q: g.q } });
    if (g.cond?.length && !pal.includes('IF')) out.push({ key: 'afi.editor.err.notInToolbox', vars: { gate: 'IF' } });
  }
  return out;
}

export function cloneCols(cols: Column[]): Column[] {
  return cols.map((c) => ({ id: c.id, ctrl: c.ctrl ? JSON.parse(JSON.stringify(c.ctrl)) : undefined, gates: c.gates.map((g) => ({ ...g, cond: g.cond?.map((k) => ({ ...k })) })) }));
}
