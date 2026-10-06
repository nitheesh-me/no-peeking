/** Lab notebook maths + trace → circuit model. Pure functions, no DOM. */
import type { LevelDef, NightResult, QubitId, TraceEvent, ErrorEvent, Program, Op, Phase } from '../../core/contracts';
import { phaseProgram, resolveInput } from '../../quantum/vm';

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
  return p.toFixed(2).replace('-', '−');
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
/** `cond` = the measured creatures whose bits decided whether this op ran (exact control dependence, see buildCircuit). */
export type Col =
  | { k: 'gate'; g: 'X' | 'Z' | 'H'; t: QubitId; step: number; card: string; cond?: QubitId[] }
  | { k: 'cnot'; c: QubitId; t: QubitId; step: number; card: string; cond?: QubitId[] }
  | { k: 'reset'; t: QubitId; step: number; card: string; cond?: QubitId[] }
  | { k: 'measure'; t: QubitId; bit: 0 | 1; step: number; card: string; cond?: QubitId[] }
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

/**
 * Control dependence of one phase's code (fixed part then the player's part, as the VM runs them).
 * Returns, per flattened op index, the set of IF op indices it is (transitively) control-dependent on:
 * x depends on IF y ⇔ x post-dominates one successor of y but does not strictly post-dominate y
 * (Ferrante–Ottenstein–Warren). Exact for any control flow, loops included. Also returns the flat op list
 * and each part's offset into it.
 */
export function controlDeps(parts: { ops: Program; part: 'fixed' | 'mine' }[]): { ops: Op[]; offset: Record<'fixed' | 'mine', number>; deps: Set<number>[] } {
  const ops: Op[] = [], offset = { fixed: 0, mine: 0 } as Record<'fixed' | 'mine', number>;
  const succ: number[][] = [];
  for (const p of parts) {
    const off = ops.length; offset[p.part] = off;
    const labels = new Map<string, number>();
    p.ops.forEach((o, i) => { if (o.op === 'LABEL') labels.set(o.name.toLowerCase(), off + i); });
    p.ops.forEach((o, i) => {
      const pc = off + i, next = pc + 1; // falls through into the next part; EXIT = total length
      ops.push(o);
      if (o.op === 'END') succ.push([-1]);
      else if (o.op === 'JUMP') succ.push([labels.get(o.label.toLowerCase()) ?? -1]);
      else if (o.op === 'IF') { const t = labels.get(o.label.toLowerCase()) ?? -1; succ.push(t === next ? [next] : [t, next]); }
      else succ.push([next]);
    });
  }
  const n = ops.length, EXIT = n;
  const sc = succ.map((ss) => ss.map((x) => (x < 0 || x > n ? EXIT : x)));
  // post-dominator sets as boolean rows (n ≤ a few hundred)
  const pd: Uint8Array[] = Array.from({ length: n + 1 }, (_, i) => { const r = new Uint8Array(n + 1); if (i === EXIT) r[EXIT] = 1; else r.fill(1); return r; });
  for (let changed = true; changed;) {
    changed = false;
    for (let i = n - 1; i >= 0; i--) {
      const r = new Uint8Array(n + 1).fill(1);
      for (const s of sc[i]) for (let k = 0; k <= n; k++) r[k] &= pd[s][k];
      r[i] = 1;
      for (let k = 0; k <= n; k++) if (r[k] !== pd[i][k]) { pd[i] = r; changed = true; break; }
    }
  }
  const deps: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let y = 0; y < n; y++) {
    if (ops[y].op !== 'IF' || sc[y].length < 2) continue;
    for (const s of sc[y]) for (let x = 0; x < n; x++) if (pd[s][x] && !(pd[y][x] && x !== y)) deps[x].add(y);
  }
  for (let changed = true; changed;) { // transitive closure: depending on an IF that itself depends on an IF
    changed = false;
    for (let x = 0; x < n; x++) for (const y of [...deps[x]]) for (const z of deps[y]) if (!deps[x].has(z)) { deps[x].add(z); changed = true; }
  }
  return { ops, offset, deps };
}

/** Does trace event `ev` belong to op `o`? (guards against a program edited after the night ran) */
function evMatches(ev: TraceEvent, o: Op | undefined): boolean {
  if (!o) return false;
  if (ev.k === 'gate') return o.op === ev.op && (o.op === 'HIGHFIVE' ? o.from === ev.from && o.to === ev.t : 't' in o && o.t === ev.t);
  if (ev.k === 'measure') return (o.op === 'LISTEN' || o.op === 'PEEK') && o.t === ev.t;
  if (ev.k === 'jump') return o.op === 'IF' || o.op === 'JUMP';
  return true;
}

/**
 * Build circuit columns from a night's trace. Errors only when xray.
 * Classical control (double lines): with `ctx.prog` (the program that ran), every gate / LISTEN / RESET gets
 * `cond` = the measured creatures named by the IFs it is control-dependent on (see controlDeps), i.e. exactly the
 * bits that decided whether it ran. Gates after a branch re-joins (e.g. the closing SPINs of the phase-flip code)
 * are NOT controlled. Without `prog`, or if the trace does not match it, no op is marked (`condKnown: false`).
 */
export function buildCircuit(night: NightResult, xray: boolean, ctx?: { level: LevelDef; prog?: { bedtime?: Program; morning?: Program } }): { cols: Col[]; stepToCol: number[]; condKnown: boolean } {
  const cols: Col[] = [];
  const stepToCol: number[] = [];
  const cd: Partial<Record<Phase, ReturnType<typeof controlDeps>>> = {};
  let condKnown = !!(ctx?.prog);
  if (ctx?.prog) for (const ph of ['bedtime', 'morning'] as const) cd[ph] = controlDeps(phaseProgram(ctx.level, ctx.prog, ph));
  let at = -1, atPhase: Phase | null = null;
  const measured = new Set<QubitId>();
  const condFor = (ev: TraceEvent): QubitId[] | undefined => {
    if (!condKnown || !atPhase) return undefined;
    const c = cd[atPhase];
    if (!c || !evMatches(ev, c.ops[at])) { condKnown = false; return undefined; }
    const who: QubitId[] = [];
    // only IFs that have actually been evaluated before this op (first pass of a loop body: none), with the
    // creatures that had a measured light at that evaluation (a never-measured light is a constant QUIET)
    for (const y of [...c.deps[at]].sort((p, q) => p - q)) for (const k of ifEval.get(y) ?? []) if (!who.includes(k)) who.push(k);
    return who.length ? who : undefined;
  };
  const ifEval = new Map<number, QubitId[]>();
  night.steps.forEach((s, i) => {
    const ev: TraceEvent = s.ev;
    switch (ev.k) {
      case 'phase':
        ifEval.clear();
        cols.push({ k: 'barrier', label: ev.phase, step: i });
        break;
      case 'line': {
        const c = cd[ev.phase];
        at = c ? c.offset[ev.part ?? 'mine'] + ev.pc : -1; atPhase = ev.phase;
        break;
      }
      case 'jump': {
        const o = atPhase ? cd[atPhase]?.ops[at] : undefined;
        if (condKnown && atPhase && !evMatches(ev, o)) condKnown = false;
        else if (o?.op === 'IF') ifEval.set(at, o.conds.map((k) => k.who).filter((w) => measured.has(w)));
        break;
      }
      case 'measure': {
        const cond = condFor(ev);
        cols.push({ k: 'measure', t: ev.t, bit: ev.result, step: i, card: (ev.t.startsWith('q') ? 'PEEK ' : 'LISTEN ') + ev.t, cond });
        measured.add(ev.t);
        break;
      }
      case 'gate': {
        const cond = condFor(ev);
        if (ev.op === 'HIGHFIVE') cols.push({ k: 'cnot', c: ev.from as QubitId, t: ev.t, step: i, card: `HIGHFIVE ${ev.from}→${ev.t}`, cond });
        else if (ev.op === 'RESET') cols.push({ k: 'reset', t: ev.t, step: i, card: `RESET ${ev.t}`, cond });
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
  if (!condKnown) for (const c of cols) if ('cond' in c) delete c.cond;
  return { cols, stepToCol, condKnown };
}

const SUBD = '₀₁₂₃₄₅₆₇₈₉';
const subq = (q: string) => (/^q\d+$/.test(q) ? q.slice(1).replace(/\d/g, (d) => SUBD[+d]) : `(${q})`);
// ───────────────────────── what correction did the player's code apply? ─────────────────────────
/**
 * The net correction the player's code applied this night (up to `upTo`), as a Pauli on the data qubits in the
 * DAWN frame, so it can be compared with the decoder's fix (which is defined on the state at dawn):
 * every classically controlled BOOP/SHUSH on a Qubble (that is what a correction is; unconditional gates are part of
 * the circuit, not of the decision) is back-propagated through all gates executed between dawn and it
 * (Heisenberg, P ← G†PG; bot factors are dropped: bots start fresh, end measured, and never reach the data).
 * Signs are dropped (global phase). Null if the classical controls are unknown (see buildCircuit) or a controlled
 * non-Pauli gate acts on a Qubble.
 */
export function appliedCorrection(night: NightResult, level: LevelDef, prog: { bedtime?: Program; morning?: Program } | undefined, upTo = Infinity): { label: string; x: QubitId[]; z: QubitId[] } | null {
  const { cols, condKnown } = buildCircuit(night, false, { level, prog });
  if (!condKnown) return null;
  const dawn = night.steps.findIndex((s) => s.ev.k === 'phase' && s.ev.phase === 'morning');
  if (dawn < 0) return { label: 'I', x: [], z: [] };
  const gates = cols.filter((c): c is Extract<Col, { k: 'gate' | 'cnot' }> => c.step > dawn && c.step <= upTo && (c.k === 'gate' || c.k === 'cnot'));
  const X = new Map<string, number>(), Z = new Map<string, number>();
  for (let gi = 0; gi < gates.length; gi++) {
    const c = gates[gi];
    if (!c.cond?.length || c.k !== 'gate' || !c.t.startsWith('q')) continue;
    if (c.g === 'H') return null;
    // P = this correction, conjugated back through every earlier gate since dawn
    const px = new Map<string, number>([[c.t, c.g === 'X' ? 1 : 0]]), pz = new Map<string, number>([[c.t, c.g === 'Z' ? 1 : 0]]);
    const gx = (q: string) => px.get(q) ?? 0, gz = (q: string) => pz.get(q) ?? 0;
    for (let j = gi - 1; j >= 0; j--) {
      const g = gates[j];
      if (g.k === 'gate' && g.g === 'H') { const a = gx(g.t); px.set(g.t, gz(g.t)); pz.set(g.t, a); }
      else if (g.k === 'cnot') { px.set(g.t, gx(g.t) ^ gx(g.c)); pz.set(g.c, gz(g.c) ^ gz(g.t)); }
    }
    for (const [q, v] of px) if (v && q.startsWith('q')) X.set(q, (X.get(q) ?? 0) ^ 1);
    for (const [q, v] of pz) if (v && q.startsWith('q')) Z.set(q, (Z.get(q) ?? 0) ^ 1);
  }
  const qs = [...new Set([...X.keys(), ...Z.keys()])].filter((q) => X.get(q) || Z.get(q)).sort((a, b) => +a.slice(1) - +b.slice(1)) as QubitId[];
  const label = qs.map((q) => (X.get(q) && Z.get(q) ? 'Y' : X.get(q) ? 'X' : 'Z') + subq(q)).join('') || 'I';
  return { label, x: qs.filter((q) => X.get(q)), z: qs.filter((q) => Z.get(q)) };
}

// ───────────────────────── what did each LISTEN really measure? ─────────────────────────
export interface MeasuredObs {
  /** the observable, as a Pauli string on the state at dawn / the bot's last RESET (e.g. 'Z₁Z₂', 'X₁X₂X₃X₄X₅X₆'); 'I' = nothing */
  label: string;
  /** −1 ⇔ the bot measured −P (BEEP ⇔ P = +1); usually +1 */
  sign: 1 | -1;
  /** the outcome is a fair coin regardless of the data (the bot itself was in superposition) */
  random: boolean;
}
/**
 * For every bot LISTEN in the trace: the Pauli observable it actually measured, by Heisenberg back-propagation of
 * Z_bot through the Clifford gates (X, Z, H, CNOT) back to a moment T0 when the bot was fresh: dawn if the bot was
 * untouched until then, else its last RESET (|0⟩) / previous LISTEN (|m⟩) / first interaction. Exact: the outcome bit b satisfies (−1)^b = sign·⟨P⟩
 * on the state at that moment. Uses the classical trace only, so it is fine to show under blankets.
 * Returns step index → observable; a LISTEN is skipped if the back-propagated string crosses a gremlin error, or
 * another qubit's measurement/reset with X/Y on it (no clean single-Pauli statement).
 */
export function measuredObservables(night: NightResult): Map<number, MeasuredObs> {
  const out = new Map<number, MeasuredObs>();
  const steps = night.steps;
  steps.forEach((st, mi) => {
    const ev0 = st.ev;
    if (ev0.k !== 'measure' || ev0.t.startsWith('q')) return;
    const bot = ev0.t;
    const x = new Map<string, number>(), z = new Map<string, number>([[bot, 1]]);
    let r = 0; // P = (−1)^r · Π (x,z) with x=z=1 meaning Y (Aaronson–Gottesman convention)
    const X = (q: string) => x.get(q) ?? 0, Z = (q: string) => z.get(q) ?? 0;
    let random = false, ok = true;
    // Reference moment T0: dawn (start of the morning) if the bot is still untouched then, else just before the bot's
    // first interaction after its last RESET / LISTEN / the start of the night. Walking back only to T0 keeps the
    // bedtime encoder out (it would turn Z₁Z₂ into Z₂) but folds in e.g. the phase code's opening SPINs (→ X₁X₂).
    const touches = (ev: TraceEvent) => (ev.k === 'gate' && (ev.t === bot || ev.from === bot)) || (ev.k === 'measure' && ev.t === bot);
    let e0 = mi, freshVal: 0 | 1 = 0, dawn = -1;
    for (let i = mi - 1; i >= 0; i--) {
      const ev = steps[i].ev;
      if ((ev.k === 'gate' && ev.op === 'RESET' && ev.t === bot) || (ev.k === 'measure' && ev.t === bot)) { freshVal = ev.k === 'measure' ? ev.result : 0; break; }
      if (ev.k === 'phase' && ev.phase === 'morning') dawn = i;
      if (touches(ev)) e0 = i;
    }
    if (dawn >= 0 && dawn < e0) e0 = dawn;
    const absorb = (q: string, val: 0 | 1): boolean => { // q is in a known basis state |val⟩ here
      if (X(q)) { random = true; return true; }
      if (Z(q) && val) r ^= 1;
      x.delete(q); z.delete(q);
      return true;
    };
    for (let i = mi - 1; i >= e0 && ok; i--) {
      const ev = steps[i].ev;
      if (ev.k === 'gate') {
        if (ev.op === 'RESET') { if (X(ev.t) || Z(ev.t)) absorb(ev.t, 0); continue; }
        const t = ev.t;
        if (ev.op === 'BOOP') r ^= Z(t);
        else if (ev.op === 'SHUSH') r ^= X(t);
        else if (ev.op === 'SPIN') { r ^= X(t) & Z(t); const a = X(t); x.set(t, Z(t)); z.set(t, a); }
        else { // CNOT c → t
          const c = ev.from!;
          r ^= X(c) & Z(t) & (X(t) ^ Z(c) ^ 1);
          x.set(t, X(t) ^ X(c)); z.set(c, Z(c) ^ Z(t));
        }
      } else if (ev.k === 'measure') {
        if (X(ev.t) || Z(ev.t)) absorb(ev.t, ev.result);
      } else if (ev.k === 'noise') {
        if (X(ev.e.t) || Z(ev.e.t)) ok = false;
      }
    }
    if (!ok) return;
    absorb(bot, freshVal); // |0⟩ at the start of the night / after RESET, |m⟩ after its previous LISTEN
    if (random) { out.set(mi, { label: '?', sign: 1, random: true }); return; }
    const qs = [...new Set([...x.keys(), ...z.keys()])].filter((q) => X(q) || Z(q))
      .sort((a, b) => (a.startsWith('q') === b.startsWith('q') ? (a.startsWith('q') ? +a.slice(1) - +b.slice(1) : a < b ? -1 : 1) : a.startsWith('q') ? -1 : 1));
    const label = qs.map((q) => (X(q) && Z(q) ? 'Y' : X(q) ? 'X' : 'Z') + subq(q)).join('') || 'I';
    out.set(mi, { label, sign: r ? -1 : 1, random: false });
  });
  return out;
}

/** Syndrome = every bot's measurement bits this night, in bot order, each bot's bits in time order
 *  ('a=1 b=0'; a reused bot shows its whole history: 'a=1,0'). */
export function syndromeOf(record: { who: QubitId; bit: 0 | 1 }[], bots: QubitId[]): string {
  const hist = new Map<QubitId, (0 | 1)[]>();
  for (const r of record) if (bots.includes(r.who)) { const h = hist.get(r.who) ?? []; h.push(r.bit); hist.set(r.who, h); }
  return bots.filter((b) => hist.has(b)).map((b) => `${b}=${hist.get(b)!.join(',')}`).join(' ');
}

// ───────────────────────── export fallback ─────────────────────────
/**
 * The notebook's own transcription of the executed path (only used if src/quantum/export.ts throws).
 * Includes the input-state preparation; ops that depended on measurements are wrapped in nested single-bit
 * conditions on the values this night actually saw (needs `prog` for that; without it the path is straight-line).
 * Valid Qiskit 1.x/2.x and OpenQASM 3 (`if (c[0] == true) { … }`).
 */
export function transcribe(night: NightResult, level: LevelDef, lang: 'qiskit' | 'qasm3', withErrors: boolean, prog?: { bedtime?: Program; morning?: Program }): string {
  const wires = wiresFor(level);
  const qi = (q: QubitId) => wires.indexOf(q);
  const n = wires.length;
  const cbits: QubitId[] = [];
  const cb = (q: QubitId) => { let i = cbits.indexOf(q); if (i < 0) { cbits.push(q); i = cbits.length - 1; } return i; };
  const out: string[] = [];
  const { cols } = buildCircuit(night, withErrors, { level, prog });
  for (const c of cols) if (c.k === 'measure') cb(c.t);
  const seen = new Map<QubitId, 0 | 1>();
  const condOf = (c: Col): [number, 0 | 1][] => ('cond' in c && c.cond?.length ? c.cond.map((m) => [cb(m), seen.get(m) ?? 0] as [number, 0 | 1]) : []);
  const nc = Math.max(1, cbits.length);
  let theta = 0, phi = 0;
  try { ({ theta, phi } = resolveInput(night.input)); } catch { /* 'random' never reaches a NightResult */ }
  const iq = qi(level.inputQubble);
  if (lang === 'qasm3') {
    out.push('OPENQASM 3.0;', 'include "stdgates.inc";', `// NO PEEKING! level ${level.id}: ${level.title}`, `// qubits: ${wires.join(', ')}`, `qubit[${n}] q;`, `bit[${nc}] c;`);
    if (theta) out.push(`ry(${theta}) q[${iq}];  // input state`); if (theta && phi) out.push(`p(${phi}) q[${iq}];`);
    for (const c of cols) {
      const cs = condOf(c);
      const op = (line: string) => { cs.forEach(([i, v], d) => out.push(`${'  '.repeat(d)}if (c[${i}] == ${v ? 'true' : 'false'}) {`)); out.push('  '.repeat(cs.length) + line); for (let d = cs.length - 1; d >= 0; d--) out.push(`${'  '.repeat(d)}}`); };
      if (c.k === 'barrier') out.push(`// ── ${c.label} ──`, 'barrier q;');
      else if (c.k === 'gate') op(`${c.g.toLowerCase()} q[${qi(c.t)}];`);
      else if (c.k === 'cnot') op(`cx q[${qi(c.c)}], q[${qi(c.t)}];`);
      else if (c.k === 'reset') op(`reset q[${qi(c.t)}];`);
      else if (c.k === 'measure') op(`c[${cb(c.t)}] = measure q[${qi(c.t)}];  // got ${c.bit}`);
      else if (c.k === 'error') out.push(`${errQasm(c.label, qi(c.t))}  // gremlin`);
      if (c.k === 'measure') seen.set(c.t, c.bit);
    }
    out.push('// note: classical conditions reflect the branch this night actually took');
  } else {
    out.push('from qiskit import QuantumCircuit', '', `# NO PEEKING! level ${level.id}: ${level.title}`, `# qubits: ${wires.join(', ')}`, `qc = QuantumCircuit(${n}, ${nc})`);
    if (theta) out.push(`qc.ry(${theta}, ${iq})  # input state`); if (theta && phi) out.push(`qc.p(${phi}, ${iq})`);
    for (const c of cols) {
      const cs = condOf(c);
      const wrap = (line: string) => [...cs.map(([i, v], d) => `${'    '.repeat(d)}with qc.if_test((qc.clbits[${i}], ${v})):`), `${'    '.repeat(cs.length)}${line}`];
      if (c.k === 'barrier') out.push(`qc.barrier()  # ${c.label}`);
      else if (c.k === 'gate') out.push(...wrap(`qc.${c.g.toLowerCase()}(${qi(c.t)})`));
      else if (c.k === 'cnot') out.push(...wrap(`qc.cx(${qi(c.c)}, ${qi(c.t)})`));
      else if (c.k === 'reset') out.push(...wrap(`qc.reset(${qi(c.t)})`));
      else if (c.k === 'measure') out.push(...wrap(`qc.measure(${qi(c.t)}, ${cb(c.t)})  # got ${c.bit}`));
      else if (c.k === 'error') out.push(`${errPy(c.label, qi(c.t))}  # gremlin`);
      if (c.k === 'measure') seen.set(c.t, c.bit);
    }
    out.push('', 'print(qc.draw())');
  }
  return out.join('\n');
}
// gremlin rotations: angle as rounded in the column label (2 decimals; fallback only, the real exporter is exact)
function errQasm(l: string, q: number) { const m = l.match(/^R([xz])\((.+)\)$/); return m ? `r${m[1]}(${m[2]}) q[${q}];` : `${l.toLowerCase()} q[${q}];`; }
function errPy(l: string, q: number) { const m = l.match(/^R([xz])\((.+)\)$/); return m ? `qc.r${m[1]}(${m[2]}, ${q})` : `qc.${l.toLowerCase()}(${q})`; }
