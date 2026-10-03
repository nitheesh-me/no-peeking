/**
 * Reference Bot Code programs (verified by tests/quantum/codes.test.ts).
 * Qubbles q1..q9, bots a..h. The logical input always starts on q1.
 */
import type { BotId, LevelDef, Op, Program, QubbleId } from '../core/contracts';
import { parseProgram } from './text';
import { makeRng, mixSeed } from './sim';
import { runNight } from './vm';

/** Parse text form, throwing on errors (for constants). */
export function P(text: string): Program {
  const { prog, errors } = parseProgram(text);
  if (errors.length) throw new Error(`reference program: ${errors.map(e => `line ${e.line}: ${e.msg}`).join('; ')}`);
  return prog;
}

// ── 2-1 parity check: does q1 match q2? (bot a BEEPs ⇔ they differ) ──
export const PARITY_CHECK: Program = P(`
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
LISTEN a
`);

// ── 3-qubit bit-flip code ──
export const BITFLIP_ENCODE: Program = P(`
HIGHFIVE q1 -> q2
HIGHFIVE q1 -> q3
`);

/**
 * Bit-flip syndrome + fix for one block (x,y,z) using bots (s1,s2). Falls through to `<tag>done:`
 * (no END), so it can be embedded (phase-flip code, Shor-9).
 * Syndrome table: s1 = x⊕y, s2 = y⊕z.  (1,0)→x  (1,1)→y  (0,1)→z.
 */
export function bitflipFix(x: QubbleId, y: QubbleId, z: QubbleId, s1: BotId = 'a', s2: BotId = 'b', tag = ''): Program {
  return P(`
HIGHFIVE ${x} -> ${s1}
HIGHFIVE ${y} -> ${s1}
HIGHFIVE ${y} -> ${s2}
HIGHFIVE ${z} -> ${s2}
LISTEN ${s1}
LISTEN ${s2}
IF ${s1} BEEP and ${s2} QUIET -> ${tag}fix1
IF ${s1} BEEP and ${s2} BEEP -> ${tag}fix2
IF ${s1} QUIET and ${s2} BEEP -> ${tag}fix3
JUMP ${tag}done
${tag}fix1:
BOOP ${x}
JUMP ${tag}done
${tag}fix2:
BOOP ${y}
JUMP ${tag}done
${tag}fix3:
BOOP ${z}
${tag}done:
`);
}

export const BITFLIP_CORRECT: Program = bitflipFix('q1', 'q2', 'q3');

/** 2-4 'Budget Cuts': the bit-flip decoder with ONE bot, reused via RESET. */
export const BITFLIP_CORRECT_ONE_BOT: Program = P(`
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
LISTEN a
RESET a
IF a BEEP -> diff12
# q1 and q2 match: either all fine or q3 got flipped
HIGHFIVE q2 -> a
HIGHFIVE q3 -> a
LISTEN a
IF a BEEP -> fix3
END
diff12:
# q1 and q2 differ: q1 or q2 got flipped
HIGHFIVE q2 -> a
HIGHFIVE q3 -> a
LISTEN a
IF a BEEP -> fix2
BOOP q1
END
fix2:
BOOP q2
END
fix3:
BOOP q3
`);

// ── 3-qubit phase-flip code: |+++>/|−−−> ──
export const SPIN3: Program = P(`
SPIN q1
SPIN q2
SPIN q3
`);
export const PHASEFLIP_ENCODE: Program = [...BITFLIP_ENCODE, ...SPIN3];
export const PHASEFLIP_CORRECT: Program = [...SPIN3, ...bitflipFix('q1', 'q2', 'q3'), ...SPIN3];

// ── Shor 9-qubit code: blocks (q1,q2,q3) (q4,q5,q6) (q7,q8,q9) ──
export const SHOR9_ENCODE: Program = P(`
HIGHFIVE q1 -> q4
HIGHFIVE q1 -> q7
SPIN q1
SPIN q4
SPIN q7
HIGHFIVE q1 -> q2
HIGHFIVE q1 -> q3
HIGHFIVE q4 -> q5
HIGHFIVE q4 -> q6
HIGHFIVE q7 -> q8
HIGHFIVE q7 -> q9
`);

/**
 * Measure X⊗X⊗X⊗X⊗X⊗X on `qs` with bot `s` (SPIN s; HIGHFIVE s -> each; SPIN s; LISTEN s).
 * BEEP ⇔ eigenvalue −1 ⇔ an odd number of phase flips among `qs`.
 */
function xCheck(s: BotId, qs: QubbleId[]): Op[] {
  return P([`SPIN ${s}`, ...qs.map(q => `HIGHFIVE ${s} -> ${q}`), `SPIN ${s}`, `LISTEN ${s}`].join('\n'));
}

/** Shor-9 correction with only TWO bots (a, b), reused via RESET. Fixes any single X, Y or Z. */
export const SHOR9_CORRECT: Program = [
  ...P('# bit flips, block by block'),
  ...bitflipFix('q1', 'q2', 'q3', 'a', 'b', 'b1'), ...P('RESET a\nRESET b'),
  ...bitflipFix('q4', 'q5', 'q6', 'a', 'b', 'b2'), ...P('RESET a\nRESET b'),
  ...bitflipFix('q7', 'q8', 'q9', 'a', 'b', 'b3'), ...P('RESET a\nRESET b'),
  ...P('# phase flips: compare the signs of the blocks'),
  ...xCheck('a', ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']),
  ...xCheck('b', ['q4', 'q5', 'q6', 'q7', 'q8', 'q9']),
  ...P(`
IF a BEEP and b QUIET -> ph1
IF a BEEP and b BEEP -> ph2
IF a QUIET and b BEEP -> ph3
END
ph1:
SHUSH q1
END
ph2:
SHUSH q4
END
ph3:
SHUSH q7
`),
];

// ───────────────────────── Night Shift Lab (level 2-5 chart) ─────────────────────────
const BITFLIP_LAB_LEVEL: LevelDef = {
  id: 'lab-bitflip', chapter: 2, title: 'Lab',
  qubbles: [1, 2, 3].map(i => ({ id: `q${i}` as QubbleId, x: i, y: 0 })),
  bots: [{ id: 'a', x: 1, y: 1 }, { id: 'b', x: 2, y: 1 }],
  toolbox: [], editable: ['morning'], fixedBedtime: BITFLIP_ENCODE,
  inputs: ['zero'], inputQubble: 'q1', noise: { mode: 'none' },
  goal: { kind: 'state', dataQubits: ['q1', 'q2', 'q3'], targetCircuit: BITFLIP_ENCODE },
  intro: [], hints: [], winLine: [], reveal: '', solution: { morning: BITFLIP_CORRECT },
};

/**
 * Logical vs physical error rate of the 3-qubit bit-flip code under iid X noise.
 * For each p: `nights` simulated nights, each qubble flipped independently with probability p,
 * input |0>, decoded with BITFLIP_CORRECT. A night is a logical error if fidelity < 0.5.
 * Returns physical = p (an unprotected qubble fails w.p. p), logical = measured rate,
 * theory = 3p² − 2p³.
 */
export function logicalErrorCurve(ps: number[], nights: number, seed: number): { p: number; physical: number; logical: number; theory: number }[] {
  return ps.map((p, pi) => {
    const rng = makeRng(mixSeed(seed, pi));
    let fails = 0;
    for (let n = 0; n < nights; n++) {
      const errs = (['q1', 'q2', 'q3'] as QubbleId[]).filter(() => rng() < p).map(t => ({ kind: 'flip' as const, t }));
      const r = runNight(BITFLIP_LAB_LEVEL, { morning: BITFLIP_CORRECT }, 'zero', errs, mixSeed(seed, n), { snapshots: false });
      if (r.fidelity < 0.5) fails++;
    }
    return { p, physical: p, logical: nights ? fails / nights : 0, theory: 3 * p * p - 2 * p * p * p };
  });
}
