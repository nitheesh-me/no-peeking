/**
 * Stabilizer-code building blocks for the DLC curriculum.
 * Pauli strings are written over an ordered list of data qubits, e.g. 'XZZXI' over [q1..q5].
 * Every program here uses only real gates of the shared engine (X, Z, H, CNOT, CZ, measure, reset).
 */
import type { BotId, Cond, Op, Program, QubbleId } from '../../../core/contracts';
import { P, cat } from './dsl';

export type Pauli = string;

export const qs = (n: number): QubbleId[] => Array.from({ length: n }, (_, i) => `q${i + 1}` as QubbleId);

/** True iff the two Pauli strings anticommute (odd number of positions with different non-identity letters). */
export function anticommutes(a: Pauli, b: Pauli): boolean {
  let odd = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== 'I' && b[i] !== 'I' && a[i] !== b[i]) odd ^= 1;
  return odd === 1;
}

/** Single-qubit Pauli error on position i of an n-qubit string. */
export const single = (n: number, i: number, k: 'X' | 'Y' | 'Z'): Pauli =>
  Array.from({ length: n }, (_, j) => (j === i ? k : 'I')).join('');

/** Syndrome bits of a Pauli error against a list of stabilizer generators (1 = anticommutes = ancilla reads 1). */
export const syndromeOf = (stabs: Pauli[], err: Pauli): (0 | 1)[] => stabs.map((s) => (anticommutes(s, err) ? 1 : 0));

/**
 * Measure one stabilizer generator with ancilla `bot` (assumed |0⟩).
 * Z-only strings: CNOT data → ancilla (parity accumulates), then measure.
 * Strings containing X: ancilla in |+⟩ controls X (CNOT) or Z (CZ) on each support qubit (phase kickback), H, measure.
 * Readout 1 ⇔ eigenvalue −1. Y letters are not used by any code in this curriculum.
 */
export function measureStab(bot: BotId, stab: Pauli, data: QubbleId[]): Program {
  const ops: string[] = [];
  if (!/[XY]/.test(stab)) {
    stab.split('').forEach((c, i) => { if (c === 'Z') ops.push(`HIGHFIVE ${data[i]} -> ${bot}`); });
  } else {
    if (/Y/.test(stab)) throw new Error('measureStab: Y letters not supported');
    ops.push(`SPIN ${bot}`);
    stab.split('').forEach((c, i) => {
      if (c === 'X') ops.push(`HIGHFIVE ${bot} -> ${data[i]}`);
      else if (c === 'Z') ops.push(`CZ ${bot} ${data[i]}`);
    });
    ops.push(`SPIN ${bot}`);
  }
  ops.push(`LISTEN ${bot}`);
  return P(ops.join('\n'));
}

/**
 * Lookup-table decoder: for every listed single-qubit error with a non-zero syndrome, the first error
 * producing that syndrome gets an IF line (all ancillas specified) and a fix. Falls through to `<tag>_done`.
 */
export function lookupDecoder(opts: {
  stabs: Pauli[]; bots: BotId[]; data: QubbleId[]; kinds: ('X' | 'Y' | 'Z')[]; tag: string;
}): Program {
  const { stabs, bots, data, kinds, tag } = opts;
  const n = data.length;
  const seen = new Set<string>();
  const ifs: Op[] = [];
  const fixes: Op[] = [];
  let k = 0;
  for (const kind of kinds) for (let i = 0; i < n; i++) {
    const syn = syndromeOf(stabs, single(n, i, kind));
    const key = syn.join('');
    if (!syn.includes(1) || seen.has(key)) continue;
    seen.add(key);
    const label = `${tag}_${kind.toLowerCase()}${i + 1}`;
    const conds: Cond[] = syn.map((b, j) => ({ who: bots[j], is: b ? 'BEEP' : 'QUIET' }));
    ifs.push({ op: 'IF', conds, label });
    fixes.push({ op: 'LABEL', name: label });
    if (kind !== 'Z') fixes.push({ op: 'BOOP', t: data[i] });
    if (kind !== 'X') fixes.push({ op: 'SHUSH', t: data[i] });
    fixes.push({ op: 'JUMP', label: `${tag}_done` });
    k++;
  }
  return [...ifs, { op: 'JUMP', label: `${tag}_done` }, ...fixes, { op: 'LABEL', name: `${tag}_done` }];
}

/** Full extraction round: measure each generator on its own ancilla (bots[i] ↔ stabs[i]). */
export const extract = (stabs: Pauli[], bots: BotId[], data: QubbleId[]): Program =>
  cat(...stabs.map((s, i) => measureStab(bots[i], s, data)));

export const resetAll = (bots: BotId[]): Program => P(bots.map((b) => `RESET ${b}`).join('\n'));

// ───────────────────────── [[5,1,3]] perfect code ─────────────────────────
/** Generators: cyclic shifts of XZZXI. */
export const FIVE_STABS: Pauli[] = ['XZZXI', 'IXZZX', 'XIXZZ', 'ZXIXZ'];
/**
 * Encoder (graph-state construction on the 5-cycle). |0⟩ ↦ |C₅⟩, |1⟩ ↦ Z⊗5|C₅⟩.
 * |C₅⟩ is stabilized by Kᵢ = Zᵢ₋₁XᵢZᵢ₊₁; the code stabilizers are the products KᵢKᵢ₊₂ (= cyclic shifts of XZZXI),
 * so both branches lie in the code space. In this basis the input's Z maps to X⊗5 and its X maps to Z⊗5.
 */
export const FIVE_ENCODE: Program = P(`
HIGHFIVE q1 -> q2
HIGHFIVE q1 -> q3
HIGHFIVE q1 -> q4
HIGHFIVE q1 -> q5
SPIN q1
SPIN q2
SPIN q3
SPIN q4
SPIN q5
CZ q1 q2
CZ q2 q3
CZ q3 q4
CZ q4 q5
CZ q5 q1
`);
export const FIVE_BOTS: BotId[] = ['a', 'b', 'c', 'd'];
export const FIVE_CORRECT: Program = cat(
  extract(FIVE_STABS, FIVE_BOTS, qs(5)),
  lookupDecoder({ stabs: FIVE_STABS, bots: FIVE_BOTS, data: qs(5), kinds: ['X', 'Z', 'Y'], tag: 'f' }),
);

// ───────────────────────── Distance-3 rotated surface code ─────────────────────────
/*
 * Data qubits on a 3×3 grid:      q1 q2 q3
 *                                  q4 q5 q6
 *                                  q7 q8 q9
 * X plaquettes: {1,2,4,5} {5,6,8,9}, X boundary pairs {2,3} (top) {7,8} (bottom).
 * Z plaquettes: {2,3,5,6} {4,5,7,8}, Z boundary pairs {1,4} (left) {6,9} (right).
 * Logical X̄ = X₁X₄X₇ (a column: string from top to bottom boundary), Z̄ = Z₁Z₂Z₃ (a row: left to right).
 */
export const SURF_Z: Pauli[] = ['IZZIZZIII', 'IIIZZIZZI', 'ZIIZIIIII', 'IIIIIZIIZ'];
export const SURF_X: Pauli[] = ['XXIXXIIII', 'IIIIXXIXX', 'IXXIIIIII', 'IIIIIIXXI'];
export const SURF_STABS: Pauli[] = [...SURF_Z, ...SURF_X];
export const SURF_LOGICALS = { X: 'XIIXIIXII', Z: 'ZZZIIIIII' };
/**
 * Encoder for an arbitrary input on q1: fan out X̄ = X₁X₄X₇ conditioned on q1, then apply (I + Sₓ) for each X generator
 * via a pivot qubit that is |0⟩ in both branches (H on the pivot, CNOT pivot → rest of the support).
 * Pivots: {1,2,4,5}→q2, {2,3}→q3, {7,8}→q8, {5,6,8,9}→q6 (in that order).
 */
export const SURF_ENCODE: Program = P(`
HIGHFIVE q1 -> q4
HIGHFIVE q1 -> q7
SPIN q2
HIGHFIVE q2 -> q1
HIGHFIVE q2 -> q4
HIGHFIVE q2 -> q5
SPIN q3
HIGHFIVE q3 -> q2
SPIN q8
HIGHFIVE q8 -> q7
SPIN q6
HIGHFIVE q6 -> q5
HIGHFIVE q6 -> q8
HIGHFIVE q6 -> q9
`);
export const SURF_BOTS: BotId[] = ['a', 'b', 'c', 'd'];
/** One full round with four reused ancillas: Z checks → fix X errors → reset → X checks → fix Z errors. */
export const SURF_CORRECT: Program = cat(
  P('# Z-type checks: detect bit flips'),
  extract(SURF_Z, SURF_BOTS, qs(9)),
  lookupDecoder({ stabs: SURF_Z, bots: SURF_BOTS, data: qs(9), kinds: ['X'], tag: 'zx' }),
  resetAll(SURF_BOTS),
  P('# X-type checks: detect phase flips'),
  extract(SURF_X, SURF_BOTS, qs(9)),
  lookupDecoder({ stabs: SURF_X, bots: SURF_BOTS, data: qs(9), kinds: ['Z'], tag: 'xz' }),
);
