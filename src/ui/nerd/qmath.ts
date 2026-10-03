/** Lab notebook maths + trace → circuit model. Pure functions, no DOM. */
import type { LevelDef, NightResult, QubitId, TraceEvent, ErrorEvent } from '../../core/contracts';

export type C = { re: number; im: number };
export const cabs = (c: C) => Math.hypot(c.re, c.im);
export const carg = (c: C) => Math.atan2(c.im, c.re);

/** Phase as a nerd-friendly string: 0, π/4, −π/2, 0.70 … */
export function fmtPhase(p: number): string {
  const k = p / (Math.PI / 4);
  const r = Math.round(k);
  if (Math.abs(k - r) < 0.02) {
    const n = ((r % 8) + 8) % 8; // 0..7 quarter-π steps
    const names = ['0', 'π/4', 'π/2', '3π/4', 'π', '−3π/4', '−π/2', '−π/4'];
    return names[n];
  }
  return p.toFixed(2);
}

/** Typeset amplitude coefficient (HTML): 0.85 · −0.53 · 0.53i · 0.53e<sup>iπ/4</sup> */
export function fmtCoef(c: C, digits = 2): string {
  const r = cabs(c), p = carg(c);
  const m = r.toFixed(digits);
  const ph = fmtPhase(p);
  if (ph === '0') return m;
  if (ph === 'π') return '−' + m;
  if (ph === 'π/2') return m + '<i>i</i>';
  if (ph === '−π/2') return '−' + m + '<i>i</i>';
  return `${m}<i>e</i><sup><i>i</i>${ph}</sup>`;
}

/** hsl colour for a phase (matches the Qubble rim hue walk: 165° + φ). */
export const phaseHue = (p: number) => `hsl(${(((165 + (p * 180) / Math.PI) % 360) + 360) % 360} 75% 52%)`;

/** Reduced density matrix of the qubits at positions `idx` (in `order`) from a (possibly truncated) amplitude list. */
export function reducedRho(amps: { ket: string; re: number; im: number }[], idx: number[]): C[][] {
  const d = 1 << idx.length;
  const rho: C[][] = Array.from({ length: d }, () => Array.from({ length: d }, () => ({ re: 0, im: 0 })));
  // group amplitudes by the "rest" bits
  const groups = new Map<string, { sub: number; a: C }[]>();
  for (const a of amps) {
    let sub = 0, rest = '';
    for (let i = 0; i < a.ket.length; i++) {
      const j = idx.indexOf(i);
      if (j >= 0) sub |= (a.ket[i] === '1' ? 1 : 0) << (idx.length - 1 - j);
      else rest += a.ket[i];
    }
    let g = groups.get(rest);
    if (!g) groups.set(rest, (g = []));
    g.push({ sub, a: { re: a.re, im: a.im } });
  }
  for (const g of groups.values()) for (const u of g) for (const v of g) {
    // ρ[u][v] += ψ_u ψ_v*
    rho[u.sub][v.sub].re += u.a.re * v.a.re + u.a.im * v.a.im;
    rho[u.sub][v.sub].im += u.a.im * v.a.re - u.a.re * v.a.im;
  }
  return rho;
}
export function maxOffDiag(rho: C[][]): number {
  let m = 0;
  for (let i = 0; i < rho.length; i++) for (let j = 0; j < rho.length; j++) if (i !== j) m = Math.max(m, cabs(rho[i][j]));
  return m;
}

// ───────────────────────── circuit model ─────────────────────────
export type Col =
  | { k: 'gate'; g: 'X' | 'Z' | 'H'; t: QubitId; step: number; card: string; cond?: QubitId[] }
  | { k: 'cnot'; c: QubitId; t: QubitId; step: number; card: string; cond?: QubitId[] }
  | { k: 'reset'; t: QubitId; step: number; card: string }
  | { k: 'measure'; t: QubitId; bit: 0 | 1; step: number; card: string }
  | { k: 'error'; t: QubitId; label: string; step: number }
  | { k: 'barrier'; label: string; step: number };

const CARD: Record<string, string> = { BOOP: 'BOOP', SHUSH: 'SHUSH', SPIN: 'SPIN', HIGHFIVE: 'HIGHFIVE', RESET: 'RESET' };
export function errLabel(e: ErrorEvent): string {
  if (e.kind === 'flip') return 'X';
  if (e.kind === 'phase') return 'Z';
  if (e.kind === 'both') return 'Y';
  return `R${e.axis}(${e.angle.toFixed(2)})`;
}

/** Wires: the level's qubbles then bots (or NerdInfo order when given). */
export function wiresFor(level: LevelDef, order?: QubitId[]): QubitId[] {
  if (order?.length) return order;
  return [...level.qubbles.map((p) => p.id), ...level.bots.map((p) => p.id)];
}

/** Build circuit columns from a night's trace. Gates executed after a TAKEN jump in the same phase are drawn as
 *  classically controlled (double line) by the bots measured most recently in that phase. Errors only when xray. */
export function buildCircuit(night: NightResult, xray: boolean): { cols: Col[]; stepToCol: number[] } {
  const cols: Col[] = [];
  const stepToCol: number[] = [];
  let branch = false, lastMeasured: QubitId[] = [];
  night.steps.forEach((s, i) => {
    const ev: TraceEvent = s.ev;
    switch (ev.k) {
      case 'phase':
        branch = false; lastMeasured = [];
        cols.push({ k: 'barrier', label: ev.phase, step: i });
        break;
      case 'jump':
        if (ev.taken && lastMeasured.length) branch = true;
        break;
      case 'measure':
        cols.push({ k: 'measure', t: ev.t, bit: ev.result, step: i, card: (ev.t.startsWith('q') ? 'PEEK ' : 'LISTEN ') + ev.t });
        if (!lastMeasured.includes(ev.t)) lastMeasured = [...lastMeasured.slice(-2), ev.t];
        break;
      case 'gate': {
        const cond = branch ? [...lastMeasured] : undefined;
        if (ev.op === 'HIGHFIVE') cols.push({ k: 'cnot', c: ev.from as QubitId, t: ev.t, step: i, card: `HIGHFIVE ${ev.from}→${ev.t}`, cond });
        else if (ev.op === 'RESET') cols.push({ k: 'reset', t: ev.t, step: i, card: `RESET ${ev.t}` });
        else cols.push({ k: 'gate', g: ev.op === 'BOOP' ? 'X' : ev.op === 'SHUSH' ? 'Z' : 'H', t: ev.t, step: i, card: `${CARD[ev.op]} ${ev.t}`, cond });
        break;
      }
      case 'noise':
        if (xray) cols.push({ k: 'error', t: ev.e.t, label: errLabel(ev.e), step: i });
        break;
      default: break;
    }
    stepToCol[i] = cols.length - 1;
  });
  return { cols, stepToCol };
}

/** Syndrome = the bots' measurement bits of this night (in record order, last value per bot). */
export function syndromeOf(record: { who: QubitId; bit: 0 | 1 }[], bots: QubitId[]): string {
  const last = new Map<QubitId, 0 | 1>();
  for (const r of record) if (bots.includes(r.who)) last.set(r.who, r.bit);
  return bots.filter((b) => last.has(b)).map((b) => `${b}=${last.get(b)}`).join(' ');
}

// ───────────────────────── export fallback ─────────────────────────
/** The notebook's own transcription of the executed path (used when src/quantum/export.ts is not available). */
export function transcribe(night: NightResult, level: LevelDef, lang: 'qiskit' | 'qasm3', withErrors: boolean): string {
  const wires = wiresFor(level);
  const qi = (q: QubitId) => wires.indexOf(q);
  const n = wires.length;
  const cbits: QubitId[] = [];
  const cb = (q: QubitId) => { let i = cbits.indexOf(q); if (i < 0) { cbits.push(q); i = cbits.length - 1; } return i; };
  const out: string[] = [];
  const { cols } = buildCircuit(night, withErrors);
  for (const c of cols) if (c.k === 'measure') cb(c.t);
  // classical conditions = the bits this night actually observed (the branch that really ran)
  const seen = new Map<QubitId, 0 | 1>();
  const condOf = (c: Col): [number, 0 | 1][] => ('cond' in c && c.cond?.length ? c.cond.map((m) => [cb(m), seen.get(m) ?? 1] as [number, 0 | 1]) : []);
  const nc = Math.max(1, cbits.length);
  if (lang === 'qasm3') {
    out.push('OPENQASM 3.0;', 'include "stdgates.inc";', `// NO PEEKING! level ${level.id}: ${level.title}`, `// qubits: ${wires.join(', ')}`, `qubit[${n}] q;`, `bit[${nc}] c;`);
    for (const c of cols) {
      if (c.k === 'measure') seen.set(c.t, c.bit);
      const cs = condOf(c);
      const ctl = cs.length ? `if (${cs.map(([i, v]) => `c[${i}] == ${v}`).join(' && ')}) ` : '';
      if (c.k === 'barrier') out.push(`// ── ${c.label} ──`, 'barrier q;');
      else if (c.k === 'gate') out.push(`${ctl}${c.g.toLowerCase()} q[${qi(c.t)}];`);
      else if (c.k === 'cnot') out.push(`${ctl}cx q[${qi(c.c)}], q[${qi(c.t)}];`);
      else if (c.k === 'reset') out.push(`reset q[${qi(c.t)}];`);
      else if (c.k === 'measure') out.push(`c[${cb(c.t)}] = measure q[${qi(c.t)}];  // got ${c.bit}`);
      else if (c.k === 'error') out.push(`${errQasm(c.label, qi(c.t))}  // gremlin`);
    }
    out.push('// note: classical conditions reflect the branch this night actually took');
  } else {
    out.push('from qiskit import QuantumCircuit', '', `# NO PEEKING! level ${level.id}: ${level.title}`, `# qubits: ${wires.join(', ')}`, `qc = QuantumCircuit(${n}, ${nc})`);
    for (const c of cols) {
      if (c.k === 'measure') seen.set(c.t, c.bit);
      const cs = condOf(c);
      const wrap = (line: string) => [...cs.map(([i, v], d) => `${'    '.repeat(d)}with qc.if_test((qc.clbits[${i}], ${v})):`), `${'    '.repeat(cs.length)}${line}`];
      if (c.k === 'barrier') out.push(`qc.barrier()  # ${c.label}`);
      else if (c.k === 'gate') out.push(...wrap(`qc.${c.g.toLowerCase()}(${qi(c.t)})`));
      else if (c.k === 'cnot') out.push(...wrap(`qc.cx(${qi(c.c)}, ${qi(c.t)})`));
      else if (c.k === 'reset') out.push(`qc.reset(${qi(c.t)})`);
      else if (c.k === 'measure') out.push(`qc.measure(${qi(c.t)}, ${cb(c.t)})  # got ${c.bit}`);
      else if (c.k === 'error') out.push(`${errPy(c.label, qi(c.t))}  # gremlin`);
    }
    out.push('', 'print(qc.draw())');
  }
  return out.join('\n');
}
function errQasm(l: string, q: number) { const m = l.match(/^R([xz])\((.+)\)$/); return m ? `r${m[1]}(${m[2]}) q[${q}];` : `${l.toLowerCase()} q[${q}];`; }
function errPy(l: string, q: number) { const m = l.match(/^R([xz])\((.+)\)$/); return m ? `qc.r${m[1]}(${m[2]}, ${q})` : `qc.${l.toLowerCase()}(${q})`; }
