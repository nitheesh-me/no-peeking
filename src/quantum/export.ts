/**
 * NO PEEKING! — export one night as a Qiskit 1.x (Python) or OpenQASM 3 circuit.
 *
 *  - Default: the EXECUTED path of that night, as a straight-line circuit (the classical decisions the
 *    night took are comments; measurements still go into named classical bits).
 *  - `dynamic: true` (needs `prog`): a faithful dynamic circuit, the program's IF/JUMP turned into
 *    `with qc.if_test(...)` / `if (...) { }` blocks. Only possible when every jump goes forward and every
 *    LISTEN/PEEK runs unconditionally; otherwise falls back to the executed path (said in the header).
 * Limits: docs/QUANTUM_NOTES.md § "Nerd info" → Exporter.
 */
import type { ErrorEvent, LevelDef, NightResult, Op, Phase, Program, QubitId } from '../core/contracts';
import { isBot } from '../core/contracts';
import { phaseProgram, resolveInput } from './vm';
import { printOp } from './text';

export interface ExportOptions {
  /** Emit the night's gremlin errors as gates (default true). */
  includeErrors?: boolean;
  /** The player's program (needed for IF/JUMP comments and for `dynamic`). */
  prog?: { bedtime?: Program; morning?: Program };
  /** Emit a dynamic circuit (classically-controlled blocks) when the program allows it (default false). */
  dynamic?: boolean;
}

// ───────────── IR ─────────────
type Bit = { reg: string; idx: number };
type Lit = { bit: Bit; val: 0 | 1 };
/** Condition = OR over pairwise-disjoint minterms, each an AND of single-bit literals. */
type CondX = { terms: Lit[][] };
type Item =
  | { k: 'c'; text: string }
  | { k: 'g'; g: 'x' | 'y' | 'z' | 'h' | 'cx' | 'rx' | 'rz' | 'ry' | 'p'; q: number[]; param?: number }
  | { k: 'm'; q: number; bit: Bit }
  | { k: 'reset'; q: number }
  | { k: 'if'; cond: CondX; body: Item[] };

interface Circuit {
  header: string[];
  qubits: QubitId[];
  regs: { name: string; size: number }[];
  items: Item[];
}

const GREMLIN: Record<ErrorEvent['kind'], string> = { flip: 'Flipper (bit flip)', phase: 'Phasey (phase flip)', both: 'Flipper+Phasey (Y)', wobble: 'Wobbles (partial rotation)' };
const regName = (who: string) => `m_${who}`;
const clean = (s: string) => s.replace(/[\r\n]+/g, ' ');
const num = (x: number) => { const v = Number(x.toPrecision(15)); return Object.is(v, -0) ? '0' : String(v); };

function errorItems(e: ErrorEvent, qi: (id: string) => number, include: boolean): Item[] {
  const what = e.kind === 'wobble' ? `${GREMLIN.wobble}: exp(-i*${num(e.angle)}/2*${e.axis.toUpperCase()}) on ${e.t}` : `${GREMLIN[e.kind]} on ${e.t}`;
  if (!include) return [{ k: 'c', text: `gremlin error omitted: ${what}` }];
  const q = [qi(e.t)];
  const g: Item = e.kind === 'flip' ? { k: 'g', g: 'x', q } : e.kind === 'phase' ? { k: 'g', g: 'z', q } : e.kind === 'both' ? { k: 'g', g: 'y', q }
    : { k: 'g', g: e.axis === 'z' ? 'rz' : 'rx', q, param: e.angle };
  return [{ k: 'c', text: `gremlin: ${what}` }, g];
}

function inputItems(level: LevelDef, night: NightResult, qi: (id: string) => number): { items: Item[]; desc: string } {
  const { theta, phi } = resolveInput(night.input);
  const q = [qi(level.inputQubble)];
  const items: Item[] = [{ k: 'c', text: `input state on ${level.inputQubble}: cos(θ/2)|0> + e^(iφ) sin(θ/2)|1>, θ=${num(theta)}, φ=${num(phi)}` }];
  if (Math.abs(theta) > 1e-15) items.push({ k: 'g', g: 'ry', q, param: theta });
  if (Math.abs(theta) > 1e-15 && Math.abs(phi) > 1e-15) items.push({ k: 'g', g: 'p', q, param: phi });
  const desc = typeof night.input === 'string' ? night.input : `θ=${num(theta)} φ=${num(phi)}`;
  return { items, desc };
}

function baseHeader(level: LevelDef, night: NightResult, desc: string, include: boolean): string[] {
  return [
    `NO PEEKING! (quantum error-correction puzzle game) - level ${level.id} "${clean(level.title)}"`,
    `night: seed=${night.seed ?? '?'} input=${desc} errors=${night.errors.length ? night.errors.map(e => e.kind + ':' + e.t + (e.kind === 'wobble' ? `:${e.axis}${num(e.angle)}` : '')).join(',') : 'none'}${night.errors.length && !include ? ' (omitted)' : ''}`,
    `result: ${night.pass ? 'PASS' : 'FAIL ' + (night.failReason ?? '')} fidelity=${num(night.fidelity)}`,
  ];
}

// ───────────── executed path ─────────────
function executedCircuit(level: LevelDef, night: NightResult, o: ExportOptions, note?: string): Circuit {
  const qubits: QubitId[] = [...level.qubbles.map(p => p.id), ...level.bots.map(p => p.id)];
  const qi = (id: string) => qubits.indexOf(id as QubitId);
  const include = o.includeErrors !== false;
  const inp = inputItems(level, night, qi);
  const items: Item[] = [...inp.items];
  const counts = new Map<string, number>();
  const lights = new Map<string, 0 | 1>();
  const progs: Partial<Record<Phase, { ops: Program; part: 'fixed' | 'mine' }[]>> = o.prog
    ? { bedtime: phaseProgram(level, o.prog, 'bedtime'), morning: phaseProgram(level, o.prog, 'morning') } : {};
  let line: { phase: Phase; pc: number; part?: 'fixed' | 'mine' } | null = null;
  const opAt = (): Op | undefined => {
    if (!line) return undefined;
    const parts = progs[line.phase];
    const part = parts?.find(p => p.part === (line!.part ?? 'mine'));
    return part?.ops[line.pc];
  };
  for (const { ev } of night.steps) {
    switch (ev.k) {
      case 'phase': items.push({ k: 'c', text: `---- ${ev.phase} ----` }); break;
      case 'line': line = ev; break;
      case 'gate': {
        if (ev.op === 'RESET') items.push({ k: 'reset', q: qi(ev.t) });
        else if (ev.op === 'HIGHFIVE') items.push({ k: 'g', g: 'cx', q: [qi(ev.from!), qi(ev.t)] });
        else items.push({ k: 'g', g: ev.op === 'BOOP' ? 'x' : ev.op === 'SHUSH' ? 'z' : 'h', q: [qi(ev.t)] });
        break;
      }
      case 'measure': {
        const n = counts.get(ev.t) ?? 0; counts.set(ev.t, n + 1);
        lights.set(ev.t, ev.result);
        const verb = isBot(ev.t) ? 'LISTEN' : 'PEEK';
        items.push({ k: 'c', text: `${verb} ${ev.t} -> ${ev.result ? 'BEEP' : 'QUIET'} (${ev.result}) this night${ev.woke ? ' - WOKE a Qubble!' : ''}` });
        items.push({ k: 'm', q: qi(ev.t), bit: { reg: regName(ev.t), idx: n } });
        break;
      }
      case 'jump': {
        const op = opAt();
        const ls = [...lights].map(([w, v]) => `${w}=${v}`).join(' ');
        if (op && op.op === 'IF') items.push({ k: 'c', text: `${printOp(op)} (${ev.taken ? 'taken' : 'not taken'})${ls ? ` [lights: ${ls}]` : ''}` });
        else if (op && op.op === 'JUMP') items.push({ k: 'c', text: printOp(op) });
        else items.push({ k: 'c', text: `${line ? `${line.phase} line ${line.pc + 1}: ` : ''}jump (${ev.taken ? 'taken' : 'not taken'})` });
        break;
      }
      case 'noise': items.push(...errorItems(ev.e, qi, include)); break;
      case 'end': if (ev.reason === 'error' || ev.reason === 'maxSteps') items.push({ k: 'c', text: `night stopped: ${ev.reason}${ev.message ? ' - ' + clean(ev.message) : ''}` }); break;
    }
  }
  const header = [
    ...baseHeader(level, night, inp.desc, include),
    'EXECUTED PATH of this night as a straight-line circuit: every gate that ran, in order.',
    'The IF decisions this night took are baked in (see comments); on other measurement outcomes',
    'a real device would need the dynamic version.',
  ];
  if (!include && night.errors.length && items.some(it => it.k === 'g' && it.g !== 'ry' && it.g !== 'p'))
    header.push('WARNING: the gremlin errors are omitted but this path still contains the gates that ran BECAUSE of them',
      '(e.g. the fix). Run as-is it ends in a corrupted state: include the errors, or export the dynamic circuit.');
  if (note) header.push(note);
  return { header, qubits, regs: [...counts].map(([w, n]) => ({ name: regName(w), size: n })), items };
}

// ───────────── dynamic circuit ─────────────
const MAX_VARS = 16;
class Guards {
  vars: Bit[] = [];
  size = 1;
  one(): Uint8Array { return new Uint8Array(this.size).fill(1); }
  zero(): Uint8Array { return new Uint8Array(this.size); }
  varIndex(b: Bit, live: Uint8Array[][]): number {
    const i = this.vars.findIndex(v => v.reg === b.reg && v.idx === b.idx);
    if (i >= 0) return i;
    if (this.vars.length >= MAX_VARS) throw new Error('too many classical conditions');
    this.vars.push(b);
    this.size *= 2;
    for (const h of live) for (let k = 0; k < h.length; k++) { const a = h[k], n = new Uint8Array(a.length * 2); n.set(a); n.set(a, a.length); h[k] = n; }
    return this.vars.length - 1;
  }
}
const isZero = (a: Uint8Array) => a.every(v => v === 0);
const isOne = (a: Uint8Array) => a.every(v => v === 1);
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

function guardToCond(g: Uint8Array, vars: Bit[]): CondX {
  const n = vars.length;
  const dep: number[] = [];
  for (let v = 0; v < n; v++) { const m = 1 << v; if (g.some((x, i) => x !== g[i ^ m])) dep.push(v); }
  const ones: number[][] = [];
  for (let a = 0; a < 1 << dep.length; a++) {
    let idx = 0; dep.forEach((v, k) => { if (a & (1 << k)) idx |= 1 << v; });
    if (g[idx]) ones.push(dep.map((_, k) => (a >> k) & 1));
  }
  // minterms are disjoint ⇒ "if (m1) body; if (m2) body; …" is exactly "if (m1 or m2 …) body",
  // and each minterm becomes nested single-bit ifs (the form every Qiskit/QASM3 tool accepts).
  return { terms: ones.map(t => t.map((val, k) => ({ bit: vars[dep[k]], val: val as 0 | 1 }))) };
}

function dynamicCircuit(level: LevelDef, night: NightResult, o: ExportOptions): Circuit | string {
  if (!o.prog) return 'no program given';
  if (night.failReason === 'error' || night.failReason === 'maxSteps') return `the night ended with ${night.failReason}`;
  const qubits: QubitId[] = [...level.qubbles.map(p => p.id), ...level.bots.map(p => p.id)];
  const qi = (id: string) => qubits.indexOf(id as QubitId);
  const include = o.includeErrors !== false;
  const inp = inputItems(level, night, qi);
  const G = new Guards();
  const counts = new Map<string, number>();
  const lastMeas = new Map<string, Bit>();
  // flat list of (guard, item) — grouped into if-blocks at the end
  const flat: { g: Uint8Array | null; it: Item }[] = inp.items.map(it => ({ g: null, it }));

  for (const phase of ['bedtime', 'morning'] as const) {
    flat.push({ g: null, it: { k: 'c', text: `---- ${phase} ----` } });
    const holder: Uint8Array[] = [G.one()]; // [0] = current fall-through guard
    const live: Uint8Array[][] = [holder];
    for (const { ops, part } of phaseProgram(level, o.prog, phase)) {
      const labels = new Map<string, number>();
      ops.forEach((op, i) => { if (op.op === 'LABEL') labels.set(op.name.toLowerCase(), i); });
      const pending: Uint8Array[] = ops.map(() => G.zero());
      live.push(pending);
      for (let pc = 0; pc < ops.length; pc++) {
        const op = ops[pc];
        const g = holder[0].map((v, i) => v | pending[pc][i]);
        holder[0] = g;
        const where = `${phase}${part === 'fixed' ? ' (fixed)' : ''} line ${pc + 1}`;
        // gates carry their guard; comments are unconditional (but only for reachable lines)
        const push = (it: Item) => { if (isZero(holder[0])) return; flat.push({ g: it.k === 'c' || isOne(holder[0]) ? null : holder[0], it }); };
        switch (op.op) {
          case 'LABEL': push({ k: 'c', text: printOp(op) }); break;
          case 'NOTE': push({ k: 'c', text: clean(printOp(op)) }); break;
          case 'BOOP': case 'SHUSH': case 'SPIN':
            push({ k: 'g', g: op.op === 'BOOP' ? 'x' : op.op === 'SHUSH' ? 'z' : 'h', q: [qi(op.t)] }); break;
          case 'HIGHFIVE': push({ k: 'g', g: 'cx', q: [qi(op.from), qi(op.to)] }); break;
          case 'RESET': push({ k: 'reset', q: qi(op.t) }); break;
          case 'LISTEN': case 'PEEK': {
            if (isZero(g)) break;
            if (!isOne(g)) return `${where}: ${op.op} runs only on some paths`;
            const n = counts.get(op.t) ?? 0; counts.set(op.t, n + 1);
            const bit = { reg: regName(op.t), idx: n };
            lastMeas.set(op.t, bit);
            flat.push({ g: null, it: { k: 'c', text: printOp(op) } });
            flat.push({ g: null, it: { k: 'm', q: qi(op.t), bit } });
            break;
          }
          case 'IF': case 'JUMP': {
            const t = labels.get(op.label.toLowerCase());
            if (t === undefined) return `${where}: no label ${op.label}`;
            if (t <= pc) return `${where}: jumps backwards (loop)`;
            push({ k: 'c', text: printOp(op) });
            let cond = G.one();
            if (op.op === 'IF') for (const c of op.conds) {
              const b = lastMeas.get(c.who);
              const want = c.is === 'BEEP' ? 1 : 0;
              let lit: Uint8Array;
              if (!b) lit = want ? G.zero() : G.one(); // never measured ⇒ QUIET
              else {
                let v: number;
                try { v = G.varIndex(b, live); } catch (e) { return (e as Error).message; }
                cond = cond.length === G.size ? cond : (() => { const n2 = new Uint8Array(G.size); for (let i = 0; i < G.size; i++) n2[i] = cond[i % cond.length]; return n2; })();
                lit = new Uint8Array(G.size); for (let i = 0; i < G.size; i++) lit[i] = ((i >> v) & 1) === want ? 1 : 0;
              }
              cond = cond.map((x, i) => x & lit[i]);
            }
            const cur = holder[0];
            pending[t] = pending[t].map((x, i) => x | (cur[i] & cond[i]));
            holder[0] = cur.map((x, i) => x & (cond[i] ^ 1));
            break;
          }
          case 'END': push({ k: 'c', text: 'END' }); holder[0] = G.zero(); break;
        }
      }
      live.pop();
    }
    if (phase === 'bedtime') {
      flat.push({ g: null, it: { k: 'c', text: '---- night ----' } });
      for (const e of night.errors) for (const it of errorItems(e, qi, include)) flat.push({ g: null, it });
    }
  }
  // expand stale guards (created before later vars were added) and group equal consecutive guards
  const full = (a: Uint8Array) => { if (a.length === G.size) return a; const n = new Uint8Array(G.size); for (let i = 0; i < G.size; i++) n[i] = a[i % a.length]; return n; };
  const items: Item[] = [];
  let curG: Uint8Array | null = null, block: Item[] | null = null;
  for (const { g, it } of flat) {
    const fg = g ? full(g) : null;
    if (fg && curG && block && same(fg, curG)) { block.push(it); continue; }
    if (fg) { curG = fg; block = [it]; items.push({ k: 'if', cond: guardToCond(fg, G.vars), body: block }); continue; }
    curG = null; block = null; items.push(it);
  }
  return {
    header: [
      ...baseHeader(level, night, inp.desc, include),
      'DYNAMIC CIRCUIT: the program itself, with its IF blocks as classically-controlled gates',
      '(mid-circuit measurement + feed-forward). Each m_<bot>[k] is the k-th LISTEN of that bot.',
    ],
    qubits, regs: [...counts].map(([w, n]) => ({ name: regName(w), size: n })), items,
  };
}

function build(level: LevelDef, night: NightResult, o: ExportOptions = {}): Circuit {
  if (!o.dynamic) return executedCircuit(level, night, o);
  const d = dynamicCircuit(level, night, o);
  if (typeof d !== 'string') return d;
  return executedCircuit(level, night, o, `NOTE: dynamic circuit not possible (${d}); fell back to the executed path.`);
}

// ───────────── printers ─────────────
export function toQiskit(level: LevelDef, night: NightResult, opts?: ExportOptions): string {
  const c = build(level, night, opts);
  const L: string[] = c.header.map(h => `# ${h}`);
  L.push('from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister');
  L.push('', `q = QuantumRegister(${c.qubits.length}, "q")  # ${c.qubits.map((id, i) => `q[${i}]=${id}`).join(' ')}`);
  for (const r of c.regs) L.push(`${r.name} = ClassicalRegister(${r.size}, "${r.name}")`);
  L.push(`qc = QuantumCircuit(${['q', ...c.regs.map(r => r.name)].join(', ')})`, '');
  const emit = (it: Item, ind: string) => {
    switch (it.k) {
      case 'c': L.push(`${ind}# ${clean(it.text)}`); break;
      case 'g': L.push(`${ind}qc.${it.g}(${it.param !== undefined ? num(it.param) + ', ' : ''}${it.q.map(i => `q[${i}]`).join(', ')})`); break;
      case 'm': L.push(`${ind}qc.measure(q[${it.q}], ${it.bit.reg}[${it.bit.idx}])`); break;
      case 'reset': L.push(`${ind}qc.reset(q[${it.q}])`); break;
      case 'if':
        for (const term of it.cond.terms) {
          let i2 = ind;
          for (const l of term) { L.push(`${i2}with qc.if_test((${l.bit.reg}[${l.bit.idx}], ${l.val})):`); i2 += '    '; }
          for (const b of it.body) emit(b, i2);
        }
        break;
    }
  };
  for (const it of c.items) emit(it, '');
  L.push('', 'if __name__ == "__main__":', '    print(qc)', '');
  return L.join('\n');
}

export function toOpenQASM3(level: LevelDef, night: NightResult, opts?: ExportOptions): string {
  const c = build(level, night, opts);
  const L: string[] = c.header.map(h => `// ${h}`);
  L.push('OPENQASM 3.0;', 'include "stdgates.inc";', '', `qubit[${c.qubits.length}] q;  // ${c.qubits.map((id, i) => `q[${i}]=${id}`).join(' ')}`);
  for (const r of c.regs) L.push(`bit[${r.size}] ${r.name};`);
  L.push('');
  const emit = (it: Item, ind: string) => {
    switch (it.k) {
      case 'c': L.push(`${ind}// ${clean(it.text)}`); break;
      case 'g': L.push(`${ind}${it.g}${it.param !== undefined ? `(${num(it.param)})` : ''} ${it.q.map(i => `q[${i}]`).join(', ')};`); break;
      case 'm': L.push(`${ind}${it.bit.reg}[${it.bit.idx}] = measure q[${it.q}];`); break;
      case 'reset': L.push(`${ind}reset q[${it.q}];`); break;
      case 'if':
        for (const term of it.cond.terms) {
          let i2 = ind;
          for (const l of term) { L.push(`${i2}if (${l.bit.reg}[${l.bit.idx}] == ${l.val ? 'true' : 'false'}) {`); i2 += '  '; }
          for (const b of it.body) emit(b, i2);
          for (let k = term.length - 1; k >= 0; k--) L.push(`${ind}${'  '.repeat(k)}}`);
        }
        break;
    }
  };
  for (const it of c.items) emit(it, '');
  L.push('');
  return L.join('\n');
}
