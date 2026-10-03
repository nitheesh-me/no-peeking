/**
 * NO PEEKING! — Technical Aficionado DLC codes: [[5,1,3]], Steane [[7,1,3]], distance-3 rotated surface code,
 * and repeated syndrome extraction with readout errors. Pure data + program generators; NOT imported by the
 * classic bundle (kept out of reference.ts on purpose: reference.ts ships with the classic game).
 *
 * Conventions: Pauli strings are written in data-qubit order, character i ↔ q(i+1). Every encoder below
 * maps |ψ⟩ on q1 (others |0⟩) to α|0_L⟩ + β|1_L⟩ with all stabilizers +1, ⟨X̄⟩ = ⟨X⟩_ψ, ⟨Z̄⟩ = ⟨Z⟩_ψ.
 * The encoders were synthesised and verified in Qiskit 1.4 (Clifford tableau / CSS pivot method) and are
 * re-verified by tests/quantum/qec.test.ts in our simulator.
 */
import type { BotId, LevelDef, NoiseSpec, Op, Program, QubbleId } from '../core/contracts';
import { P } from './reference';

export type Pauli = 'I' | 'X' | 'Y' | 'Z';
export interface CodeInfo {
  id: 'rep3' | 'five' | 'steane' | 'surface3';
  name: string;
  n: number; k: number; d: number;
  /** stabilizer generators (data-qubit order, char i ↔ q(i+1)) */
  stabilizers: string[];
  logicals: { X: string; Z: string };
  /** grid layout for lattice views (row, col) per data qubit, if meaningful */
  layout?: [number, number][];
  /** encoder: |ψ⟩ on q1 → encoded state (unitary; also the level's targetCircuit) */
  encoder: Program;
}

const qs = (n: number) => Array.from({ length: n }, (_, i) => `q${i + 1}` as QubbleId);

export const CODES: Record<CodeInfo['id'], CodeInfo> = {
  rep3: {
    id: 'rep3', name: '3-qubit bit-flip (repetition) code', n: 3, k: 1, d: 1, // [[3,1,1]]: distance 3 against X errors only, 1 against Z
    stabilizers: ['ZZI', 'IZZ'], logicals: { X: 'XXX', Z: 'ZII' },
    encoder: P('HIGHFIVE q1 -> q2\nHIGHFIVE q1 -> q3'),
  },
  five: {
    id: 'five', name: '[[5,1,3]] perfect code', n: 5, k: 1, d: 3,
    stabilizers: ['XZZXI', 'IXZZX', 'XIXZZ', 'ZXIXZ'], logicals: { X: 'XXXXX', Z: 'ZZZZZ' },
    encoder: P(`S q2
SPIN q2
S q4
SPIN q4
HIGHFIVE q1 -> q5
HIGHFIVE q2 -> q1
SPIN q2
S q2
HIGHFIVE q2 -> q5
HIGHFIVE q4 -> q1
S q4
SPIN q4
HIGHFIVE q4 -> q3
HIGHFIVE q5 -> q3
HIGHFIVE q3 -> q2
Y q3
SPIN q5
HIGHFIVE q5 -> q2
HIGHFIVE q4 -> q2
Y q2
S q4
SPIN q4
SPIN q5
SWAP q5, q4
HIGHFIVE q4 -> q5
BOOP q5`),
  },
  steane: {
    id: 'steane', name: 'Steane [[7,1,3]] code', n: 7, k: 1, d: 3,
    stabilizers: ['IIIXXXX', 'IXXIIXX', 'XIXIXIX', 'IIIZZZZ', 'IZZIIZZ', 'ZIZIZIZ'], logicals: { X: 'XXXXXXX', Z: 'ZZZZZZZ' },
    encoder: P(`HIGHFIVE q1 -> q2
HIGHFIVE q1 -> q3
SPIN q4
HIGHFIVE q4 -> q1
HIGHFIVE q4 -> q2
HIGHFIVE q4 -> q7
SPIN q6
HIGHFIVE q6 -> q2
HIGHFIVE q6 -> q3
HIGHFIVE q6 -> q7
SPIN q5
HIGHFIVE q5 -> q1
HIGHFIVE q5 -> q3
HIGHFIVE q5 -> q7`),
  },
  surface3: {
    // Same layout and generator order as src/dlc/aficionado/levels/codes.ts (SURF_STABS):
    // q1 q2 q3 / q4 q5 q6 / q7 q8 q9. Z plaquettes {2,3,5,6} {4,5,7,8}, Z boundaries {1,4} {6,9};
    // X plaquettes {1,2,4,5} {5,6,8,9}, X boundaries {2,3} {7,8}. X̄ = X₁X₄X₇ (column), Z̄ = Z₁Z₂Z₃ (row).
    id: 'surface3', name: 'distance-3 rotated surface code', n: 9, k: 1, d: 3,
    stabilizers: ['IZZIZZIII', 'IIIZZIZZI', 'ZIIZIIIII', 'IIIIIZIIZ', 'XXIXXIIII', 'IIIIXXIXX', 'IXXIIIIII', 'IIIIIIXXI'],
    logicals: { X: 'XIIXIIXII', Z: 'ZZZIIIIII' },
    layout: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
    encoder: P(`HIGHFIVE q1 -> q4
HIGHFIVE q1 -> q8
SPIN q6
HIGHFIVE q6 -> q1
HIGHFIVE q6 -> q3
HIGHFIVE q6 -> q4
HIGHFIVE q6 -> q8
HIGHFIVE q6 -> q9
SPIN q2
HIGHFIVE q2 -> q3
SPIN q5
HIGHFIVE q5 -> q1
HIGHFIVE q5 -> q3
HIGHFIVE q5 -> q4
SPIN q7
HIGHFIVE q7 -> q8`),
  },
};

// ───────────── generators ─────────────
const anticommutes = (a: string, b: string) => {
  let c = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== 'I' && b[i] !== 'I' && a[i] !== b[i]) c ^= 1;
  return c === 1;
};

/**
 * Measure one Pauli stabilizer onto ancilla `anc` (fresh |0⟩) and LISTEN it. Pure Z-type ⇒ the classic parity
 * gadget (HIGHFIVE qi -> anc). Otherwise H·(controlled-P)·H with CNOT for X, CZ for Z, S†·CNOT·S for Y.
 */
export function measureStabilizer(stab: string, anc: BotId): Program {
  const ops: Op[] = [];
  const q = (i: number) => `q${i + 1}` as QubbleId;
  if (/^[IZ]+$/.test(stab)) {
    for (let i = 0; i < stab.length; i++) if (stab[i] === 'Z') ops.push({ op: 'HIGHFIVE', from: q(i), to: anc });
  } else {
    ops.push({ op: 'SPIN', t: anc });
    for (let i = 0; i < stab.length; i++) {
      const c = stab[i];
      if (c === 'X') ops.push({ op: 'HIGHFIVE', from: anc, to: q(i) });
      else if (c === 'Z') ops.push({ op: 'CZ', from: anc, to: q(i) });
      else if (c === 'Y') ops.push({ op: 'SDG', t: q(i) }, { op: 'HIGHFIVE', from: anc, to: q(i) }, { op: 'S', t: q(i) });
    }
    ops.push({ op: 'SPIN', t: anc });
  }
  ops.push({ op: 'LISTEN', t: anc });
  return ops;
}

/** Single-qubit-error lookup table: syndrome (bit i = stabs[i] anticommutes) → correction, for the given error types. First (lowest-qubit) match wins; degenerate equivalents differ by a stabilizer. */
export function lookupTable(stabs: string[], n: number, types: ('X' | 'Y' | 'Z')[] = ['X', 'Y', 'Z']): Map<number, { q: number; p: 'X' | 'Y' | 'Z' }> {
  const t = new Map<number, { q: number; p: 'X' | 'Y' | 'Z' }>();
  for (const p of types) for (let q = 0; q < n; q++) {
    const e = 'I'.repeat(q) + p + 'I'.repeat(n - q - 1);
    let s = 0;
    stabs.forEach((g, i) => { if (anticommutes(g, e)) s |= 1 << i; });
    if (s && !t.has(s)) t.set(s, { q, p });
  }
  return t;
}

/** IF-chain decoder: for each syndrome in `table` jump to a fix block; falls through to `<tag>done:`. */
export function lookupDecoder(bots: BotId[], table: Map<number, { q: number; p: 'X' | 'Y' | 'Z' }>, tag = ''): Program {
  const ifs: Op[] = [], blocks: Op[] = [];
  let k = 0;
  for (const [s, fix] of [...table].sort((a, b) => a[0] - b[0])) {
    const label = `${tag}fix${++k}`;
    ifs.push({ op: 'IF', conds: bots.map((b, i) => ({ who: b, is: (s >> i) & 1 ? 'BEEP' : 'QUIET' })), label });
    const t = `q${fix.q + 1}` as QubbleId;
    blocks.push({ op: 'LABEL', name: label }, fix.p === 'X' ? { op: 'BOOP', t } : fix.p === 'Z' ? { op: 'SHUSH', t } : { op: 'Y', t }, { op: 'JUMP', label: `${tag}done` });
  }
  return [...ifs, { op: 'JUMP', label: `${tag}done` }, ...blocks, { op: 'LABEL', name: `${tag}done` }];
}

export const isCss = (code: CodeInfo) => code.stabilizers.every(s => /^[IX]+$/.test(s) || /^[IZ]+$/.test(s));
const BOTS: BotId[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Full single-round correction for a code (morning program). Non-CSS: one bot per generator. CSS: Z-checks → fix X, RESET, X-checks on the SAME bots → fix Z (ancilla reuse). */
export function correction(code: CodeInfo): Program {
  const st = code.stabilizers;
  if (!isCss(code)) {
    const bots = BOTS.slice(0, st.length);
    return [...st.flatMap((s, i) => measureStabilizer(s, bots[i])), ...lookupDecoder(bots, lookupTable(st, code.n))];
  }
  const zs = st.filter(s => s.includes('Z')), xs = st.filter(s => s.includes('X'));
  const zb = BOTS.slice(0, zs.length), xb = BOTS.slice(0, xs.length);
  return [
    { op: 'NOTE', text: 'Z-type checks: find X errors' },
    ...zs.flatMap((s, i) => measureStabilizer(s, zb[i])), ...lookupDecoder(zb, lookupTable(zs, code.n, ['X']), 'x'),
    ...zb.map(b => ({ op: 'RESET', t: b }) as Op),
    { op: 'NOTE', text: 'X-type checks (same ancillas, reset): find Z errors' },
    ...xs.flatMap((s, i) => measureStabilizer(s, xb[i])), ...lookupDecoder(xb, lookupTable(xs, code.n, ['Z']), 'z'),
  ];
}

/** A test level for a code: encoder as fixed bedtime, editable morning, every single-qubit Pauli (and optional wobbles). */
export function codeLevel(code: CodeInfo, o: { noise?: NoiseSpec; bots?: number; id?: string } = {}): LevelDef {
  const data = qs(code.n);
  const st = code.stabilizers, css = isCss(code);
  const nb = o.bots ?? (css ? Math.max(st.filter(x => x.includes('X')).length, st.filter(x => x.includes('Z')).length) : st.length);
  return {
    id: o.id ?? `qec-${code.id}`, chapter: 4, title: code.name,
    qubbles: data.map((id, i) => ({ id, x: code.layout ? code.layout[i][1] : i, y: code.layout ? code.layout[i][0] : 0 })),
    bots: BOTS.slice(0, nb).map((id, i) => ({ id, x: i, y: 4 })),
    toolbox: ['BOOP', 'SHUSH', 'SPIN', 'HIGHFIVE', 'LISTEN', 'RESET', 'IF', 'JUMP', 'END', 'Y', 'S', 'SDG', 'CZ'],
    editable: ['morning'], fixedBedtime: code.encoder,
    inputs: ['zero', 'one', 'plus', 'minus', 'plusI', 'random'], inputQubble: 'q1',
    noise: o.noise ?? { mode: 'enumerate', kinds: ['flip', 'phase', 'both'], maxErrors: 1 },
    goal: { kind: 'state', dataQubits: data, targetCircuit: code.encoder }, stabilizers: code.stabilizers,
    intro: [], hints: [], winLine: [], reveal: '', solution: { morning: correction(code) },
  };
}

// ───────────── repeated syndrome extraction (bit-flip code, readout errors) ─────────────
/** One bit-flip syndrome round onto (s1, s2): s1 = q1⊕q2, s2 = q2⊕q3. */
const parityRound = (s1: BotId, s2: BotId): Program =>
  P(`HIGHFIVE q1 -> ${s1}\nHIGHFIVE q2 -> ${s1}\nHIGHFIVE q2 -> ${s2}\nHIGHFIVE q3 -> ${s2}\nLISTEN ${s1}\nLISTEN ${s2}`);

/** Majority-of-3 implicants: maj(x,y,z)=1 ⇔ some pair is 1; =0 ⇔ some pair is 0. */
const PAIRS: [number, number][] = [[0, 1], [0, 2], [1, 2]];

/**
 * Three syndrome rounds (fresh bots a,b | c,d | e,f; WAIT = a noise round between rounds), then correct on the
 * per-bit MAJORITY of the three rounds. Survives any single readout error, or one data X before round 1 or
 * between rounds 1 and 2. (An X between rounds 2 and 3 is seen by one round only: in a real memory it is caught
 * by the next cycle; with a single cycle it is a logical failure, which tests document.)
 */
export const REPEATED_EXTRACTION: Program = (() => {
  const r1: BotId[] = ['a', 'c', 'e'], r2: BotId[] = ['b', 'd', 'f'];
  const ops: Op[] = [...parityRound('a', 'b'), { op: 'WAIT' }, ...parityRound('c', 'd'), { op: 'WAIT' }, ...parityRound('e', 'f')];
  const want: [0 | 1, 0 | 1, string][] = [[1, 0, 'q1'], [1, 1, 'q2'], [0, 1, 'q3']];
  const blocks: Op[] = [];
  want.forEach(([v1, v2, q], k) => {
    for (const [i, j] of PAIRS) for (const [u, w] of PAIRS)
      ops.push({ op: 'IF', conds: [
        { who: r1[i], is: v1 ? 'BEEP' : 'QUIET' }, { who: r1[j], is: v1 ? 'BEEP' : 'QUIET' },
        { who: r2[u], is: v2 ? 'BEEP' : 'QUIET' }, { who: r2[w], is: v2 ? 'BEEP' : 'QUIET' }], label: `fix${k + 1}` });
    blocks.push({ op: 'LABEL', name: `fix${k + 1}` }, { op: 'BOOP', t: q as QubbleId }, { op: 'END' });
  });
  return [...ops, { op: 'END' }, ...blocks];
})();

/** The same with a single round (the trap: one readout error ⇒ wrong correction). */
export const SINGLE_ROUND_EXTRACTION: Program = [...parityRound('a', 'b'), ...P(`IF a BEEP and b QUIET -> fix1
IF a BEEP and b BEEP -> fix2
IF a QUIET and b BEEP -> fix3
END
fix1:
BOOP q1
END
fix2:
BOOP q2
END
fix3:
BOOP q3`)];

/** Level for repeated extraction: data X in round 0 or 1, and every single readout fault. */
export function repeatedExtractionLevel(): LevelDef {
  const data = qs(3);
  return {
    id: 'qec-repeated', chapter: 4, title: 'Repeated syndrome extraction',
    qubbles: data.map((id, i) => ({ id, x: i, y: 0 })),
    bots: BOTS.slice(0, 6).map((id, i) => ({ id, x: i, y: 2 })),
    toolbox: ['HIGHFIVE', 'LISTEN', 'RESET', 'IF', 'JUMP', 'END', 'BOOP', 'WAIT'],
    editable: ['morning'], fixedBedtime: CODES.rep3.encoder,
    inputs: ['zero', 'one', 'plus', 'random'], inputQubble: 'q1',
    noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1, rounds: 2, readout: true },
    goal: { kind: 'state', dataQubits: data, targetCircuit: CODES.rep3.encoder },
    intro: [], hints: [], winLine: [], reveal: '', solution: { morning: REPEATED_EXTRACTION },
    traps: [{ name: 'single round', morning: SINGLE_ROUND_EXTRACTION }],
  };
}
