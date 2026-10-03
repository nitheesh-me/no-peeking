/**
 * Technical Aficionado curriculum: modules M0–M9 (LevelDef + AfiModuleMeta).
 * Every user-facing field holds a content-pack KEY (resolve with t()); nothing here is displayed raw.
 * The physics is checked by tests/dlc/levels.test.ts: every solution passes, every trap fails.
 */
import type { BotId, InputState, LevelDef, NoiseSpec, OpName, AnyOpName, Placement, Program, QubbleId } from '../../../core/contracts';
import type { AfiModuleMeta } from '../contracts';
import { ENCODE3, DECODE3_BITFLIP } from '../../../levels/dsl';
import { P, cat } from './dsl';
import {
  FIVE_BOTS, FIVE_CORRECT, FIVE_ENCODE, FIVE_STABS, SURF_BOTS, SURF_CORRECT, SURF_ENCODE, SURF_LOGICALS, SURF_STABS, SURF_X, SURF_Z,
  extract, lookupDecoder, qs, resetAll,
} from './codes';

// ───────────────────────── helpers ─────────────────────────
const key = (m: string, l: string, f: string) => `afi.modules.${m}.ex.${l}.${f}`;
const row = (ids: string[], y: number): Placement[] => ids.map((id, i) => ({ id: id as Placement['id'], x: 1 + 2 * i, y }));
const grid3: Placement[] = qs(9).map((id, i) => ({ id, x: 1 + 2 * (i % 3), y: 1 + 2 * Math.floor(i / 3) }));
const RANDOMISH: InputState[] = ['zero', 'one', 'plus', 'minus', 'plusI', 'random', 'random'];
const CORE: OpName[] = ['BOOP', 'SHUSH', 'SPIN', 'HIGHFIVE', 'LISTEN', 'RESET', 'PEEK', 'IF', 'JUMP', 'END', 'NOTE'];
const FULL: AnyOpName[] = [...CORE, 'Y', 'S', 'SDG', 'CZ', 'SWAP'];

interface Ex {
  mod: string; id: string;
  data: QubbleId[]; bots?: BotId[]; layout?: Placement[];
  editable: ('bedtime' | 'morning')[];
  fixedBedtime?: Program;
  inputs: InputState[];
  noise: NoiseSpec;
  goal: LevelDef['goal'];
  toolbox?: AnyOpName[];
  allowPeekData?: boolean;
  readoutFlip?: number;
  hints?: number;
  solution: LevelDef['solution'];
  traps: { id: string; bedtime?: Program; morning?: Program }[];
  maxSteps?: number;
  /** code generators over `data` (NerdInfo labels exactly these) */
  stabilizers?: string[];
}

function ex(e: Ex): LevelDef {
  const bots = e.bots ?? [];
  return {
    id: e.id,
    chapter: 5,
    title: key(e.mod, e.id, 'title'),
    subtitle: key(e.mod, e.id, 'subtitle'),
    qubbles: e.layout ?? row(e.data, 1),
    bots: row(bots, 3),
    toolbox: e.toolbox ?? FULL,
    editable: e.editable,
    fixedBedtime: e.fixedBedtime,
    inputs: e.inputs,
    inputQubble: 'q1',
    noise: e.noise,
    goal: e.goal,
    allowPeekData: e.allowPeekData,
    readoutFlip: e.readoutFlip,
    maxSteps: e.maxSteps,
    stabilizers: e.stabilizers,
    intro: [],
    hints: Array.from({ length: e.hints ?? 2 }, (_, i) => key(e.mod, e.id, `hints.${i + 1}`)),
    winLine: [],
    reveal: key(e.mod, e.id, 'reveal'),
    proTerm: key(e.mod, e.id, 'term'),
    solution: e.solution,
    traps: e.traps.map((t) => ({ name: key(e.mod, e.id, `traps.${t.id}`), bedtime: t.bedtime, morning: t.morning })),
  };
}

const objectives = (m: string, n: number) => Array.from({ length: n }, (_, i) => `afi.modules.${m}.objectives.${i + 1}`);

const Q3 = qs(3);
const BITFLIP_FIX = DECODE3_BITFLIP;
const SPIN3 = P('SPIN q1\nSPIN q2\nSPIN q3');
const PHASE_ENCODE = cat(ENCODE3, SPIN3);
const PHASE_FIX = cat(SPIN3, P(`
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
HIGHFIVE q2 -> b
HIGHFIVE q3 -> b
LISTEN a
LISTEN b
IF a BEEP and b QUIET -> fix1
IF a BEEP and b BEEP -> fix2
IF a QUIET and b BEEP -> fix3
JUMP done
fix1:
BOOP q1
JUMP done
fix2:
BOOP q2
JUMP done
fix3:
BOOP q3
done:
`), SPIN3);
/** Generic 3-qubit decoder with a configurable fix gate and target table (used for traps). */
const decode3 = (fix: 'BOOP' | 'SHUSH', t1: string, t2: string, t3: string) => P(`
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
HIGHFIVE q2 -> b
HIGHFIVE q3 -> b
LISTEN a
LISTEN b
IF a BEEP and b QUIET -> fix1
IF a BEEP and b BEEP -> fix2
IF a QUIET and b BEEP -> fix3
END
fix1:
${fix} ${t1}
END
fix2:
${fix} ${t2}
END
fix3:
${fix} ${t3}
`);
const PEEK_ALL = (n: number) => P(qs(n).map((q) => `PEEK ${q}`).join('\n'));

// ───────────────────────── M0 Calibration ─────────────────────────
const M0_1 = ex({
  mod: 'M0', id: 'M0-1', data: ['q1'], editable: ['bedtime'], inputs: ['zero'], noise: { mode: 'none' },
  toolbox: ['BOOP', 'SHUSH', 'SPIN', 'Y', 'S', 'SDG', 'NOTE'],
  goal: { kind: 'state', dataQubits: ['q1'], targetCircuit: P('BOOP q1\nSPIN q1') },
  solution: { bedtime: P('BOOP q1\nSPIN q1') },
  traps: [
    { id: 'order', bedtime: P('SPIN q1\nBOOP q1') },
    { id: 'phaseOnly', bedtime: P('SHUSH q1') },
  ],
});
const M0_2 = ex({
  mod: 'M0', id: 'M0-2', data: ['q1'], editable: ['morning'], inputs: ['plus', 'minus', 'random', 'random'], noise: { mode: 'none' },
  toolbox: ['BOOP', 'SHUSH', 'SPIN', 'Y', 'S', 'SDG', 'NOTE'],
  goal: { kind: 'state', dataQubits: ['q1'], targetCircuit: P('SPIN q1') },
  solution: { morning: P('SPIN q1') },
  traps: [
    { id: 'noRotation', morning: [] },
    { id: 'twice', morning: P('SPIN q1\nSPIN q1') },
  ],
});
const M0_3 = ex({
  mod: 'M0', id: 'M0-3', data: ['q1'], editable: ['morning'], inputs: ['plusI', 'minusI', 'random', 'random'], noise: { mode: 'none' },
  toolbox: ['BOOP', 'SHUSH', 'SPIN', 'Y', 'S', 'SDG', 'NOTE'],
  goal: { kind: 'state', dataQubits: ['q1'], targetCircuit: P('SDG q1\nSPIN q1') },
  solution: { morning: P('SDG q1\nSPIN q1') },
  traps: [
    { id: 'xBasis', morning: P('SPIN q1') },
    { id: 'wrongSign', morning: P('S q1\nSPIN q1') },
  ],
});

// ───────────────────────── M1 No-cloning & entanglement ─────────────────────────
const BELL = P('SPIN q1\nHIGHFIVE q1 -> q2');
const M1_1 = ex({
  mod: 'M1', id: 'M1-1', data: ['q1', 'q2'], editable: ['bedtime'], inputs: ['zero'], noise: { mode: 'none' },
  goal: { kind: 'state', dataQubits: ['q1', 'q2'], targetCircuit: BELL },
  solution: { bedtime: BELL },
  traps: [
    { id: 'order', bedtime: P('HIGHFIVE q1 -> q2\nSPIN q1') },
    { id: 'product', bedtime: P('SPIN q1\nSPIN q2') },
  ],
});
const M1_2 = ex({
  mod: 'M1', id: 'M1-2', data: ['q1', 'q2'], editable: ['bedtime'], inputs: RANDOMISH, noise: { mode: 'none' },
  allowPeekData: true,
  goal: { kind: 'state', dataQubits: ['q1', 'q2'], targetCircuit: P('HIGHFIVE q1 -> q2') },
  solution: { bedtime: P('HIGHFIVE q1 -> q2') },
  traps: [
    { id: 'measureCopy', bedtime: P('PEEK q1\nIF q1 BEEP -> one\nEND\none:\nBOOP q2') },
    { id: 'reversed', bedtime: P('HIGHFIVE q2 -> q1') },
  ],
});
const YY_ROT = P('SDG q1\nSPIN q1\nSDG q2\nSPIN q2');
const M1_3 = ex({
  mod: 'M1', id: 'M1-3', data: ['q1', 'q2'], editable: ['morning'], fixedBedtime: BELL, inputs: ['zero'], noise: { mode: 'none' },
  goal: { kind: 'state', dataQubits: ['q1', 'q2'], targetCircuit: cat(BELL, YY_ROT) },
  solution: { morning: YY_ROT },
  traps: [
    { id: 'xx', morning: P('SPIN q1\nSPIN q2') },
    { id: 'oneSided', morning: P('SDG q1\nSPIN q1') },
  ],
});

// ───────────────────────── M2 Parity measurement ─────────────────────────
const M2_1 = ex({
  mod: 'M2', id: 'M2-1', data: ['q1', 'q2'], bots: ['a'], editable: ['morning'], fixedBedtime: P('HIGHFIVE q1 -> q2'),
  inputs: RANDOMISH, noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1, targets: ['q1', 'q2'] },
  goal: { kind: 'state+report', dataQubits: ['q1', 'q2'], targetCircuit: P('HIGHFIVE q1 -> q2'), report: { bot: 'a', expect: 'parity', of: ['q1', 'q2'] } },
  solution: { morning: P('HIGHFIVE q1 -> a\nHIGHFIVE q2 -> a\nLISTEN a') },
  traps: [
    { id: 'peekData', morning: P('PEEK q1\nPEEK q2') },
    { id: 'singleQubit', morning: P('HIGHFIVE q2 -> a\nLISTEN a') },
  ],
});
const XX_ENC = P('HIGHFIVE q1 -> q2\nSPIN q1\nSPIN q2');
const M2_2 = ex({
  mod: 'M2', id: 'M2-2', data: ['q1', 'q2'], bots: ['a'], editable: ['morning'], fixedBedtime: XX_ENC,
  inputs: RANDOMISH, noise: { mode: 'enumerate', kinds: ['phase'], maxErrors: 1, targets: ['q2'] },
  goal: { kind: 'state', dataQubits: ['q1', 'q2'], targetCircuit: XX_ENC },
  solution: { morning: P('SPIN a\nHIGHFIVE a -> q1\nHIGHFIVE a -> q2\nSPIN a\nLISTEN a\nIF a BEEP -> fix\nEND\nfix:\nSHUSH q2') },
  traps: [
    { id: 'zCheck', morning: P('HIGHFIVE q1 -> a\nHIGHFIVE q2 -> a\nLISTEN a\nIF a BEEP -> fix\nEND\nfix:\nSHUSH q2') },
    { id: 'wrongFix', morning: P('SPIN a\nHIGHFIVE a -> q1\nHIGHFIVE a -> q2\nSPIN a\nLISTEN a\nIF a BEEP -> fix\nEND\nfix:\nBOOP q2') },
  ],
});

// ───────────────────────── M3 bit-flip code ─────────────────────────
const M3_1 = ex({
  mod: 'M3', id: 'M3-1', data: Q3, editable: ['bedtime'], inputs: RANDOMISH, noise: { mode: 'none' },
  goal: { kind: 'state', dataQubits: Q3, targetCircuit: ENCODE3 },
  solution: { bedtime: ENCODE3 },
  traps: [
    { id: 'partial', bedtime: P('HIGHFIVE q1 -> q2') },
    { id: 'measureCopy', bedtime: P('PEEK q1\nIF q1 BEEP -> one\nEND\none:\nBOOP q2\nBOOP q3') },
  ],
});
const M3_2 = ex({
  mod: 'M3', id: 'M3-2', data: Q3, bots: ['a', 'b'], editable: ['morning'], fixedBedtime: ENCODE3, inputs: RANDOMISH,
  noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1, targets: Q3 },
  goal: { kind: 'state', dataQubits: Q3, targetCircuit: ENCODE3 },
  solution: { morning: BITFLIP_FIX },
  traps: [
    { id: 'peekData', morning: PEEK_ALL(3) },
    { id: 'wrongQubit', morning: decode3('BOOP', 'q3', 'q2', 'q1') },
  ],
});
/** Monte Carlo: N=2000 nights at p=0.1. minRate 0.913 ⇔ the 95% Wilson upper bound on the logical error rate is < p. */
const M3_3 = ex({
  mod: 'M3', id: 'M3-3', data: Q3, bots: ['a', 'b'], editable: ['morning'], fixedBedtime: ENCODE3, inputs: ['zero', 'one', 'plus', 'random'],
  noise: { mode: 'random', p: 0.1, kinds: ['flip'] },
  goal: { kind: 'rate', dataQubits: Q3, targetCircuit: ENCODE3, nights: 2000, minRate: 0.913 },
  solution: { morning: BITFLIP_FIX },
  traps: [
    { id: 'noDecoder', morning: [] },
    { id: 'oneCheck', morning: P('HIGHFIVE q1 -> a\nHIGHFIVE q2 -> a\nLISTEN a\nIF a BEEP -> fix\nEND\nfix:\nBOOP q1') },
  ],
});

// ───────────────────────── M4 phase-flip code ─────────────────────────
const M4_1 = ex({
  mod: 'M4', id: 'M4-1', data: Q3, editable: ['bedtime'], inputs: RANDOMISH, noise: { mode: 'none' },
  goal: { kind: 'state', dataQubits: Q3, targetCircuit: PHASE_ENCODE },
  solution: { bedtime: PHASE_ENCODE },
  traps: [
    { id: 'bitflipOnly', bedtime: ENCODE3 },
    { id: 'hFirst', bedtime: cat(P('SPIN q1'), ENCODE3) },
  ],
});
const M4_2 = ex({
  mod: 'M4', id: 'M4-2', data: Q3, bots: ['a', 'b'], editable: ['morning'], fixedBedtime: PHASE_ENCODE, inputs: RANDOMISH,
  noise: { mode: 'enumerate', kinds: ['phase'], maxErrors: 1, targets: Q3 },
  goal: { kind: 'state', dataQubits: Q3, targetCircuit: PHASE_ENCODE },
  solution: { morning: PHASE_FIX },
  traps: [
    { id: 'ignorePhase', morning: BITFLIP_FIX },
    { id: 'frameNotRestored', morning: cat(SPIN3, BITFLIP_FIX) },
  ],
});

// ───────────────────────── M5 error discretisation ─────────────────────────
const ANGLES = [0.3, 0.9, 1.6, 2.5];
const M5_1 = ex({
  mod: 'M5', id: 'M5-1', data: Q3, bots: ['a', 'b'], editable: ['morning'], fixedBedtime: ENCODE3, inputs: RANDOMISH,
  noise: { mode: 'enumerate', kinds: ['wobble'], maxErrors: 1, targets: Q3, wobbleAngles: ANGLES, wobbleAxis: 'x' },
  goal: { kind: 'state', dataQubits: Q3, targetCircuit: ENCODE3 },
  solution: { morning: BITFLIP_FIX },
  traps: [
    { id: 'noDecoder', morning: [] },
    { id: 'oneCheck', morning: P('HIGHFIVE q1 -> a\nHIGHFIVE q2 -> a\nLISTEN a\nIF a BEEP -> fix\nEND\nfix:\nBOOP q1') },
  ],
});
const M5_2 = ex({
  mod: 'M5', id: 'M5-2', data: Q3, bots: ['a', 'b'], editable: ['morning'], fixedBedtime: PHASE_ENCODE, inputs: RANDOMISH,
  noise: { mode: 'enumerate', kinds: ['wobble'], maxErrors: 1, targets: Q3, wobbleAngles: ANGLES, wobbleAxis: 'z' },
  goal: { kind: 'state', dataQubits: Q3, targetCircuit: PHASE_ENCODE },
  solution: { morning: PHASE_FIX },
  traps: [
    { id: 'ignorePhase', morning: BITFLIP_FIX },
    { id: 'noDecoder', morning: [] },
  ],
});

// ───────────────────────── M6 Shor [[9,1,3]] ─────────────────────────
const SHOR_ENCODE = P(`
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
const SHOR_Z = ['ZZIIIIIII', 'IZZIIIIII', 'IIIZZIIII', 'IIIIZZIII', 'IIIIIIZZI', 'IIIIIIIZZ'];
const SHOR_X = ['XXXXXXIII', 'IIIXXXXXX'];
const blockFix = (b: number, tag: string) => {
  const d = qs(9).slice(3 * b, 3 * b + 3);
  const st = [SHOR_Z[2 * b].slice(3 * b, 3 * b + 3), SHOR_Z[2 * b + 1].slice(3 * b, 3 * b + 3)];
  return cat(extract(st, ['a', 'b'], d), lookupDecoder({ stabs: st, bots: ['a', 'b'], data: d, kinds: ['X'], tag }), resetAll(['a', 'b']));
};
const SHOR_BIT_LAYER = cat(blockFix(0, 'b1'), blockFix(1, 'b2'), blockFix(2, 'b3'));
const SHOR_PHASE_LAYER = cat(
  extract(SHOR_X, ['a', 'b'], qs(9)),
  P('IF a BEEP and b QUIET -> ph1\nIF a BEEP and b BEEP -> ph2\nIF a QUIET and b BEEP -> ph3\nJUMP ph_done\nph1:\nSHUSH q1\nJUMP ph_done\nph2:\nSHUSH q4\nJUMP ph_done\nph3:\nSHUSH q7\nph_done:'),
);
const SHOR_CORRECT = cat(SHOR_BIT_LAYER, SHOR_PHASE_LAYER);
const M6_1 = ex({
  mod: 'M6', id: 'M6-1', data: qs(9), layout: grid3, editable: ['bedtime'], inputs: RANDOMISH, noise: { mode: 'none' },
  goal: { kind: 'state', dataQubits: qs(9), targetCircuit: SHOR_ENCODE },
  solution: { bedtime: SHOR_ENCODE },
  traps: [
    { id: 'noOuterH', bedtime: SHOR_ENCODE.filter((o) => o.op !== 'SPIN') },
    { id: 'innerOnly', bedtime: SHOR_ENCODE.slice(5) },
  ],
});
const M6_2 = ex({
  mod: 'M6', id: 'M6-2', data: qs(9), layout: grid3, bots: ['a', 'b'], editable: ['morning'], fixedBedtime: SHOR_ENCODE,
  inputs: ['zero', 'one', 'plus', 'minus', 'random'],
  noise: { mode: 'enumerate', kinds: ['flip', 'phase', 'both'], maxErrors: 1 },
  goal: { kind: 'state', dataQubits: qs(9), targetCircuit: SHOR_ENCODE },
  solution: { morning: SHOR_CORRECT },
  traps: [
    { id: 'ignorePhase', morning: SHOR_BIT_LAYER },
    { id: 'phaseOnly', morning: SHOR_PHASE_LAYER },
  ],
});

// ───────────────────────── M7 repeated syndrome extraction ─────────────────────────
/** Syndrome bits (s1 = q1⊕q2, s2 = q2⊕q3) into a given ancilla pair. */
const round3 = (s1: BotId, s2: BotId) => P(`
HIGHFIVE q1 -> ${s1}
HIGHFIVE q2 -> ${s1}
HIGHFIVE q2 -> ${s2}
HIGHFIVE q3 -> ${s2}
LISTEN ${s1}
LISTEN ${s2}
`);
const fixTable = (s1: BotId, s2: BotId, tag: string) =>
  P(`IF ${s1} BEEP and ${s2} QUIET -> ${tag}1\nIF ${s1} BEEP and ${s2} BEEP -> ${tag}2\nIF ${s1} QUIET and ${s2} BEEP -> ${tag}3\nEND`);
const FIXES = P('fx1:\nBOOP q1\nEND\nfx2:\nBOOP q2\nEND\nfx3:\nBOOP q3\nEND');
/** Two rounds; if they agree, act on them; otherwise a third round breaks the tie. Tolerates any one fault. */
const REPEATED = cat(
  round3('a', 'b'), round3('c', 'd'),
  P(`IF a QUIET and b QUIET and c QUIET and d QUIET -> ok
IF a BEEP and b QUIET and c BEEP and d QUIET -> fx1
IF a BEEP and b BEEP and c BEEP and d BEEP -> fx2
IF a QUIET and b BEEP and c QUIET and d BEEP -> fx3`),
  round3('e', 'f'),
  P(`IF e BEEP and f QUIET -> fx1
IF e BEEP and f BEEP -> fx2
IF e QUIET and f BEEP -> fx3
ok:
END`),
  FIXES,
);
const SINGLE_ROUND = cat(round3('a', 'b'), fixTable('a', 'b', 'fx'), FIXES);
const TRUST_SECOND = cat(round3('a', 'b'), round3('c', 'd'), fixTable('c', 'd', 'fx'), FIXES);
const BOTS6: BotId[] = ['a', 'b', 'c', 'd', 'e', 'f'];
const M7_1 = ex({
  mod: 'M7', id: 'M7-1', data: Q3, bots: BOTS6, editable: ['morning'], fixedBedtime: ENCODE3, inputs: RANDOMISH,
  noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1, targets: Q3, readout: true },
  goal: { kind: 'state', dataQubits: Q3, targetCircuit: ENCODE3 },
  solution: { morning: REPEATED },
  traps: [
    { id: 'singleRound', morning: SINGLE_ROUND },
    { id: 'trustLast', morning: TRUST_SECOND },
  ],
});
/** Monte Carlo: data X with p=0.03 per qubit, each readout wrong with q=0.04. N=1000, minRate 0.95. */
const M7_2 = ex({
  mod: 'M7', id: 'M7-2', data: Q3, bots: BOTS6, editable: ['morning'], fixedBedtime: ENCODE3, inputs: ['zero', 'one', 'plus', 'random'],
  noise: { mode: 'random', p: 0.03, kinds: ['flip'], readoutFlip: 0.04 },
  goal: { kind: 'rate', dataQubits: Q3, targetCircuit: ENCODE3, nights: 1000, minRate: 0.95 },
  solution: { morning: REPEATED },
  traps: [{ id: 'singleRound', morning: SINGLE_ROUND }],
});

// ───────────────────────── M8 [[5,1,3]] ─────────────────────────
const Q5 = qs(5);
const M8_1 = ex({
  mod: 'M8', id: 'M8-1', data: Q5, stabilizers: FIVE_STABS, editable: ['bedtime'], inputs: RANDOMISH, noise: { mode: 'none' },
  goal: { kind: 'state', dataQubits: Q5, targetCircuit: FIVE_ENCODE },
  solution: { bedtime: FIVE_ENCODE },
  traps: [
    { id: 'openChain', bedtime: FIVE_ENCODE.slice(0, -1) },
    { id: 'noFanout', bedtime: FIVE_ENCODE.slice(4) },
  ],
});
const M8_2 = ex({
  mod: 'M8', id: 'M8-2', data: Q5, stabilizers: FIVE_STABS, bots: FIVE_BOTS, editable: ['morning'], fixedBedtime: FIVE_ENCODE, inputs: RANDOMISH,
  noise: { mode: 'enumerate', kinds: ['flip', 'phase', 'both'], maxErrors: 1 },
  goal: { kind: 'state', dataQubits: Q5, targetCircuit: FIVE_ENCODE },
  solution: { morning: FIVE_CORRECT },
  traps: [
    { id: 'ignorePhase', morning: cat(extract(FIVE_STABS, FIVE_BOTS, Q5), lookupDecoder({ stabs: FIVE_STABS, bots: FIVE_BOTS, data: Q5, kinds: ['X'], tag: 'f' })) },
    { id: 'threeGenerators', morning: cat(extract(FIVE_STABS.slice(0, 3), FIVE_BOTS, Q5), lookupDecoder({ stabs: FIVE_STABS.slice(0, 3), bots: FIVE_BOTS, data: Q5, kinds: ['X', 'Z', 'Y'], tag: 'f' })) },
  ],
});

// ───────────────────────── M9 rotated surface code d=3 (finale) ─────────────────────────
const Q9 = qs(9);
const M9_1 = ex({
  mod: 'M9', id: 'M9-1', data: Q9, stabilizers: SURF_STABS, layout: grid3, editable: ['morning'], fixedBedtime: SURF_ENCODE, inputs: RANDOMISH, noise: { mode: 'none' },
  goal: { kind: 'state', dataQubits: Q9, targetCircuit: cat(P('BOOP q1'), SURF_ENCODE) },
  solution: { morning: P('BOOP q1\nBOOP q4\nBOOP q7') },
  traps: [
    { id: 'singleX', morning: P('BOOP q1') },
    { id: 'wrongDirection', morning: P('BOOP q1\nBOOP q2\nBOOP q3') },
  ],
});
const M9_2 = ex({
  mod: 'M9', id: 'M9-2', data: Q9, stabilizers: SURF_STABS, layout: grid3, bots: SURF_BOTS, editable: ['morning'], fixedBedtime: SURF_ENCODE,
  inputs: ['zero', 'one', 'plus', 'minus', 'random'],
  noise: { mode: 'enumerate', kinds: ['flip', 'phase', 'both'], maxErrors: 1 },
  goal: { kind: 'state', dataQubits: Q9, targetCircuit: SURF_ENCODE },
  solution: { morning: SURF_CORRECT },
  traps: [
    { id: 'peekData', morning: PEEK_ALL(9) },
    { id: 'ignorePhase', morning: cat(extract(SURF_Z, SURF_BOTS, Q9), lookupDecoder({ stabs: SURF_Z, bots: SURF_BOTS, data: Q9, kinds: ['X'], tag: 'zx' })) },
  ],
});

// ───────────────────────── module metadata ─────────────────────────
export const AFI_LEVELS: LevelDef[] = [
  M0_1, M0_2, M0_3, M1_1, M1_2, M1_3, M2_1, M2_2, M3_1, M3_2, M3_3, M4_1, M4_2,
  M5_1, M5_2, M6_1, M6_2, M7_1, M7_2, M8_1, M8_2, M9_1, M9_2,
];

const ids = (m: string) => AFI_LEVELS.filter((l) => l.id.startsWith(`${m}-`)).map((l) => l.id);

export const AFI_MODULES: AfiModuleMeta[] = [
  { id: 'M0', levelIds: ids('M0'), objectives: objectives('M0', 3), unlocks: ['bloch'], requires: [] },
  { id: 'M1', levelIds: ids('M1'), objectives: objectives('M1', 3), unlocks: ['filaments'], requires: ['M0'] },
  { id: 'M2', levelIds: ids('M2'), objectives: objectives('M2', 3), requires: ['M1'], stabilizers: ['ZZ', 'XX'] },
  { id: 'M3', levelIds: ids('M3'), objectives: objectives('M3', 4), unlocks: ['stabilizer-tiling', 'threshold'], requires: ['M2'],
    code: { n: 3, k: 1, d: 1, name: 'bit-flip repetition code' }, stabilizers: ['ZZI', 'IZZ'], logicals: { X: 'XXX', Z: 'ZII' } },
  { id: 'M4', levelIds: ids('M4'), objectives: objectives('M4', 3), requires: ['M3'],
    code: { n: 3, k: 1, d: 1, name: 'phase-flip repetition code' }, stabilizers: ['XXI', 'IXX'], logicals: { X: 'ZZZ', Z: 'XII' } },
  { id: 'M5', levelIds: ids('M5'), objectives: objectives('M5', 3), unlocks: ['projection-freeze'], requires: ['M4'],
    code: { n: 3, k: 1, d: 1, name: 'repetition codes under coherent noise' }, stabilizers: ['ZZI', 'IZZ'], logicals: { X: 'XXX', Z: 'ZII' } },
  { id: 'M6', levelIds: ids('M6'), objectives: objectives('M6', 3), unlocks: ['concatenation'], requires: ['M5'],
    code: { n: 9, k: 1, d: 3, name: 'Shor code' }, stabilizers: [...SHOR_Z, ...SHOR_X], logicals: { X: 'ZZZZZZZZZ', Z: 'XXXXXXXXX' } },
  { id: 'M7', levelIds: ids('M7'), objectives: objectives('M7', 3), requires: ['M3'],
    code: { n: 3, k: 1, d: 1, name: 'bit-flip code with noisy readout' }, stabilizers: ['ZZI', 'IZZ'], logicals: { X: 'XXX', Z: 'ZII' } },
  { id: 'M8', levelIds: ids('M8'), objectives: objectives('M8', 3), requires: ['M6'],
    code: { n: 5, k: 1, d: 3, name: 'five-qubit perfect code' }, stabilizers: FIVE_STABS, logicals: { X: 'ZZZZZ', Z: 'XXXXX' } },
  { id: 'M9', levelIds: ids('M9'), objectives: objectives('M9', 4), unlocks: ['lattice'], requires: ['M7', 'M8'],
    code: { n: 9, k: 1, d: 3, name: 'rotated surface code' }, stabilizers: SURF_STABS, logicals: SURF_LOGICALS },
];
