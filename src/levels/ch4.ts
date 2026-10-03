import type { BotId, LevelDef, Placement, Program, QubbleId } from '../core/contracts';
import { P, cat, ENCODE3, SPIN3, DECODE3_BITFLIP } from './dsl';
import { ENCODE3_PHASE, DECODE3_PHASE } from './ch3';

/** Ch 4 — The Big Nine. Everything at once, then lights out. */

// ── Shor-9 building blocks ──
/** Outer layer: spread over the three block leaders, turn them sideways, then each leader fills its block. */
export const ENCODE9: Program = P(`
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

/** Find-and-fix one flip inside a block (the 2-3 routine, but it continues to `next` instead of ending). */
function blockFlipCheck(q: [QubbleId, QubbleId, QubbleId], x: BotId, y: BotId, tag: string, next: string): Program {
  const [q1, q2, q3] = q;
  return P(`
# block ${tag}: who got flipped?
HIGHFIVE ${q1} -> ${x}
HIGHFIVE ${q2} -> ${x}
HIGHFIVE ${q2} -> ${y}
HIGHFIVE ${q3} -> ${y}
LISTEN ${x}
LISTEN ${y}
IF ${x} BEEP and ${y} QUIET -> ${tag}f1
IF ${x} BEEP and ${y} BEEP -> ${tag}f2
IF ${x} QUIET and ${y} BEEP -> ${tag}f3
JUMP ${next}
${tag}f1:
BOOP ${q1}
JUMP ${next}
${tag}f2:
BOOP ${q2}
JUMP ${next}
${tag}f3:
BOOP ${q3}
${next}:
`);
}

const BLOCK_FLIPS: Program = cat(
  blockFlipCheck(['q1', 'q2', 'q3'], 'a', 'b', 'A', 'blockB'),
  blockFlipCheck(['q4', 'q5', 'q6'], 'c', 'd', 'B', 'blockC'),
  blockFlipCheck(['q7', 'q8', 'q9'], 'e', 'f', 'C', 'twists'),
);

/** Fold each block back into its leader, so a twist anywhere in a block lands on the leader. */
const UNFOLD_BLOCKS = P(`
# fold blocks into their leaders
HIGHFIVE q1 -> q2
HIGHFIVE q1 -> q3
HIGHFIVE q4 -> q5
HIGHFIVE q4 -> q6
HIGHFIVE q7 -> q8
HIGHFIVE q7 -> q9
`);
const REFOLD_BLOCKS = P(`
# tuck the blocks back in
HIGHFIVE q1 -> q2
HIGHFIVE q1 -> q3
HIGHFIVE q4 -> q5
HIGHFIVE q4 -> q6
HIGHFIVE q7 -> q8
HIGHFIVE q7 -> q9
`);
const LEADER_GLASSES = P(`
SPIN q1
SPIN q4
SPIN q7
`);
/** Twist check on the three leaders: glasses off turns twists into flips, then the 2-3 table. */
const LEADER_TWISTS = cat(
  LEADER_GLASSES,
  P(`
HIGHFIVE q1 -> g
HIGHFIVE q4 -> g
HIGHFIVE q4 -> h
HIGHFIVE q7 -> h
LISTEN g
LISTEN h
IF g BEEP and h QUIET -> L1
IF g BEEP and h BEEP -> L4
IF g QUIET and h BEEP -> L7
JUMP tuck
L1:
BOOP q1
JUMP tuck
L4:
BOOP q4
JUMP tuck
L7:
BOOP q7
tuck:
`),
  LEADER_GLASSES,
);

export const DECODE9: Program = cat(BLOCK_FLIPS, UNFOLD_BLOCKS, LEADER_TWISTS, REFOLD_BLOCKS);

const NINE: Placement[] = [
  { id: 'q1', x: 1, y: 1 }, { id: 'q2', x: 2, y: 1 }, { id: 'q3', x: 3, y: 1 },
  { id: 'q4', x: 1, y: 3 }, { id: 'q5', x: 2, y: 3 }, { id: 'q6', x: 3, y: 3 },
  { id: 'q7', x: 1, y: 5 }, { id: 'q8', x: 2, y: 5 }, { id: 'q9', x: 3, y: 5 },
];
const EIGHT_BOTS: Placement[] = [
  { id: 'a', x: 5, y: 1 }, { id: 'b', x: 6, y: 1 },
  { id: 'c', x: 5, y: 3 }, { id: 'd', x: 6, y: 3 },
  { id: 'e', x: 5, y: 5 }, { id: 'f', x: 6, y: 5 },
  { id: 'g', x: 7, y: 2 }, { id: 'h', x: 7, y: 4 },
];
const NINE_IDS = NINE.map((p) => p.id as QubbleId);

const L41: LevelDef = {
  id: '4-1',
  chapter: 4,
  title: 'Nesting Dolls',
  subtitle: 'Three little codes inside one big code.',
  qubbles: NINE,
  bots: EIGHT_BOTS,
  signs: [
    { text: 'NO COPIES BUT SHARING IS CARING', x: 4, y: 0 },
    { text: 'ALL GREMLINS WELCOME', x: 7, y: 0 },
  ],
  toolbox: ['HIGHFIVE', 'LISTEN', 'RESET', 'IF', 'BOOP', 'SHUSH', 'SPIN', 'END', 'JUMP', 'PEEK'],
  editable: ['morning'],
  fixedBedtime: ENCODE9,
  inputs: ['zero', 'one', 'plus', 'minus', 'random', 'random'],
  inputQubble: 'q1',
  noise: { mode: 'enumerate', kinds: ['flip', 'phase', 'both'], maxErrors: 1, targets: NINE_IDS },
  goal: { kind: 'state', dataQubits: NINE_IDS, targetCircuit: ENCODE9 },
  maxSteps: 1000,
  challenges: { lines: 78, bots: 8 },
  intro: [
    { who: 'schrodi', text: 'Nine Qubbles. Three rows of three. Each row is a Who Got Flipped. The rows together are sideways. Like a nesting doll. Or a lasagna.', mood: 'deadpan' },
    { who: 'flipper', text: 'flip gang 💀', mood: 'smug' },
    { who: 'phasey', text: 'twist gang 👻 fr fr', mood: 'smug' },
    { who: 'schrodi', text: 'One gremlin tonight. Any Qubble. Flip, twist, or both. You have eight bots. Go.', mood: 'deadpan' },
  ],
  hints: [
    'Fix flips first, one row at a time, with your 2-3 routine. Swap END for a JUMP to the next row.',
    'A twist anywhere in a row twists the whole row. Fold each row into its leader (q1, q4, q7) with the same high-fives you would use to tuck it in.',
    'After folding, the leaders are a sideways 3-code: SPIN q1 q4 q7, check them with bots g and h, BOOP the odd one, SPIN back, then unfold the rows again.',
  ],
  winLine: [
    { who: 'schrodi', text: 'Any gremlin, any Qubble, fixed blind. That is how a real quantum memory works, in miniature. I am getting a bigger box.', mood: 'happy' },
    { who: 'flipper', text: 'flip gang and twist gang both cooked 💀💀', mood: 'shock' },
    { who: 'phasey', text: 'gg 👻', mood: 'sleepy' },
  ],
  reveal: 'Protect against flips inside, and against twists outside. Then nothing small gets through.',
  proTerm: 'Pros call this: the Shor 9-qubit code, the first code that corrects any single-qubit error.',
  solution: { morning: DECODE9 },
  traps: [
    { name: 'Only fix flips', morning: BLOCK_FLIPS },
    { name: 'Only fix twists', morning: cat(UNFOLD_BLOCKS, LEADER_TWISTS, REFOLD_BLOCKS) },
    { name: 'Old 2-3 routine on the first row', morning: DECODE3_BITFLIP },
  ],
};

const L42: LevelDef = {
  id: '4-2',
  chapter: 4,
  title: 'Lights Out',
  subtitle: 'The Eye closes. Listen.',
  qubbles: [
    { id: 'q1', x: 2, y: 2 },
    { id: 'q2', x: 4, y: 2 },
    { id: 'q3', x: 6, y: 2 },
  ],
  bots: [
    { id: 'a', x: 3, y: 4 },
    { id: 'b', x: 5, y: 4 },
  ],
  signs: [{ text: 'LOOKING = WAKING', x: 4, y: 0 }],
  toolbox: ['HIGHFIVE', 'LISTEN', 'RESET', 'IF', 'BOOP', 'SHUSH', 'SPIN', 'END', 'JUMP', 'PEEK'],
  editable: ['morning'],
  fixedBedtime: ENCODE3_PHASE,
  inputs: ['zero', 'one', 'plus', 'minus', 'random', 'random'],
  inputQubble: 'q1',
  noise: {
    mode: 'enumerate',
    kinds: ['phase', 'wobble'],
    maxErrors: 1,
    targets: ['q1', 'q2', 'q3'],
    wobbleAxis: 'z',
    wobbleAngles: [Math.PI / 3],
  },
  goal: { kind: 'state', dataQubits: ['q1', 'q2', 'q3'], targetCircuit: ENCODE3_PHASE },
  challenges: { lines: 21, bots: 2 },
  lightsOut: true,
  intro: [
    { who: 'eye', text: '...', mood: 'sleepy' },
    { who: 'schrodi', text: 'The Eye is tired. It is closing. You will not see the Qubbles, the bots, or the gremlins tonight.', mood: 'deadpan' },
    { who: 'schrodi', text: 'Three sideways Qubbles. Phasey and Wobbles are out there. Bot a sings low, bot b sings high. Trust your routine.', mood: 'deadpan' },
  ],
  hints: [
    'You have done this before. The Qubbles are tucked in sideways, like Sideways Glasses.',
    'Low note alone is Qubble 1. Both notes together is Qubble 2. High note alone is Qubble 3. Silence is a good night.',
    'Glasses on, four high-fives, glasses off, LISTEN a and b, then SHUSH whoever the chord points to.',
  ],
  winLine: [
    { who: 'eye', text: '!', mood: 'shock' },
    { who: 'schrodi', text: 'You never saw a thing. Every dream survived. That is how the real machines do it, every night.', mood: 'happy' },
  ],
  reveal: 'While it protects its data, a real quantum computer never looks at it. It only hears the clues, and that is enough.',
  proTerm: 'Pros call this: blind syndrome extraction and decoding, the core loop of quantum error correction. (Full fault tolerance also survives faulty gates and faulty readouts.)',
  meta: ['lights-out', 'credits'],
  solution: { morning: DECODE3_PHASE },
  traps: [
    { name: 'Hoping for a quiet night', morning: [] },
    { name: 'Wrong glasses (bit-flip routine)', morning: DECODE3_BITFLIP },
    { name: 'Glasses on, never off', morning: cat(SPIN3, DECODE3_BITFLIP) },
  ],
};

void ENCODE3;

export const CH4: LevelDef[] = [L41, L42];
