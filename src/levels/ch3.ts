import type { LevelDef, Placement } from '../core/contracts';
import { P, cat, ENCODE3, SPIN3, DECODE3_BITFLIP } from './dsl';

/** Ch 3 — Ghost Stories. Phase errors, sideways glasses, and the half-flip. */

const ROW3: Placement[] = [
  { id: 'q1', x: 2, y: 2 },
  { id: 'q2', x: 4, y: 2 },
  { id: 'q3', x: 6, y: 2 },
];
const BOTS2: Placement[] = [
  { id: 'a', x: 3, y: 4 },
  { id: 'b', x: 5, y: 4 },
];
const ALL_CARDS: LevelDef['toolbox'] = ['HIGHFIVE', 'LISTEN', 'RESET', 'IF', 'BOOP', 'SPIN', 'END', 'JUMP', 'PEEK'];

/** Phase-flip code: bit-flip encoding, then everyone turned sideways. */
export const ENCODE3_PHASE = cat(ENCODE3, SPIN3);

/** 3-2 reference: glasses on, ask the bots, glasses off, fix with SHUSH. */
export const DECODE3_PHASE = P(`
SPIN q1
SPIN q2
SPIN q3
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
HIGHFIVE q2 -> b
HIGHFIVE q3 -> b
SPIN q1
SPIN q2
SPIN q3
LISTEN a
LISTEN b
IF a BEEP and b QUIET -> fix1
IF a BEEP and b BEEP -> fix2
IF a QUIET and b BEEP -> fix3
END
fix1:
SHUSH q1
END
fix2:
SHUSH q2
END
fix3:
SHUSH q3
`);

const L31: LevelDef = {
  id: '3-1',
  chapter: 3,
  title: 'Somethings Off',
  subtitle: 'Every bot is quiet. So why is the dream wrong?',
  qubbles: ROW3,
  bots: BOTS2,
  signs: [
    { text: 'ASK THE BOTS', x: 1, y: 0 },
    { text: 'BEWARE OF GHOST', x: 6, y: 0 },
  ],
  toolbox: ALL_CARDS,
  // The 2-3 tuck-in stays bolted on; the player may ADD to bedtime (runs after the fixed part).
  editable: ['bedtime', 'morning'],
  fixedBedtime: ENCODE3,
  starterMorning: DECODE3_BITFLIP,
  // zero/one first: the old routine sails through those, then swirls break it.
  inputs: ['zero', 'one', 'plus', 'minus', 'random', 'random'],
  inputQubble: 'q1',
  noise: { mode: 'enumerate', kinds: ['phase'], maxErrors: 1, targets: ['q1', 'q2', 'q3'] },
  goal: { kind: 'state', dataQubits: ['q1', 'q2', 'q3'], targetCircuit: ENCODE3 },
  challenges: { lines: 21 },
  intro: [
    { who: 'schrodi', text: 'Your Who Got Flipped routine is loaded. It is very good. Press Run.', mood: 'smug' },
    { who: 'phasey', text: 'you cant see me fr fr 👻', mood: 'smug' },
    { who: 'schrodi', text: 'Hm. Did anyone else hear that?', mood: 'deadpan' },
  ],
  hints: [
    'The bots only ask Sunny or Moony questions. Phasey does not touch Sunny or Moony. Phasey twists the swirl.',
    'Remember Twirl? Turning a dream sideways changed which gremlin could hurt it. Turn it the other way round here.',
    'Add SPIN q1, q2, q3 to Bedtime. Put SPIN q1, q2, q3 at the top of Morning. Keep your old routine after that.',
  ],
  winLine: [
    { who: 'phasey', text: 'wait u can see me?? not fair fr fr 😭👻', mood: 'shock' },
    { who: 'schrodi', text: 'Sideways at bedtime, straight in the morning. The twist turned into a flip. You know how to fix flips.', mood: 'happy' },
  ],
  reveal: 'Some damage is invisible to the question you asked. So turn the dream until it becomes the damage you can see.',
  proTerm: 'Pros call this: a Z (phase-flip) error. H turns Z errors into X errors, so H-sandwiching the bit-flip code gives the phase-flip code.',
  solution: {
    bedtime: SPIN3,
    morning: cat(SPIN3, DECODE3_BITFLIP),
  },
  traps: [
    { name: 'The old routine, unchanged', morning: DECODE3_BITFLIP },
    { name: 'Glasses on at bedtime, never taken off', bedtime: SPIN3, morning: DECODE3_BITFLIP },
    { name: 'Glasses only in the morning', morning: cat(SPIN3, DECODE3_BITFLIP) },
  ],
};

const L32: LevelDef = {
  id: '3-2',
  chapter: 3,
  title: 'Sideways Glasses',
  subtitle: 'Fix the twist. Leave them sideways.',
  qubbles: ROW3,
  bots: BOTS2,
  signs: [{ text: 'BEWARE OF GHOST', x: 6, y: 0 }],
  toolbox: ['HIGHFIVE', 'LISTEN', 'RESET', 'IF', 'BOOP', 'SHUSH', 'SPIN', 'END', 'JUMP', 'PEEK'],
  editable: ['morning'],
  fixedBedtime: ENCODE3_PHASE,
  inputs: ['zero', 'one', 'plus', 'minus', 'random', 'random'],
  inputQubble: 'q1',
  noise: { mode: 'enumerate', kinds: ['phase'], maxErrors: 1, targets: ['q1', 'q2', 'q3'] },
  goal: { kind: 'state', dataQubits: ['q1', 'q2', 'q3'], targetCircuit: ENCODE3_PHASE },
  challenges: { lines: 21, bots: 2 },
  intro: [
    { who: 'schrodi', text: 'The Qubbles now sleep sideways. All night. Morning too. Doctor says it is good for the spine.', mood: 'deadpan' },
    { who: 'schrodi', text: 'New card: SHUSH. It untwists a swirl. Phasey hates it.', mood: 'smug' },
    { who: 'phasey', text: 'shush?? who said that 👻 fr fr', mood: 'shock' },
  ],
  hints: [
    'Your bots can only hear flips. Put the glasses on so the twist looks like a flip.',
    'Glasses on, high-fives, glasses off. Then the damage is a twist again, and a twist is fixed with SHUSH, not BOOP.',
    'SPIN all three, the four high-fives, SPIN all three, LISTEN a and b, then the usual table but SHUSH instead of BOOP.',
  ],
  winLine: [
    { who: 'schrodi', text: 'You checked them sideways and put them back sideways. Nobody woke up. Phasey is filing a complaint.', mood: 'happy' },
    { who: 'phasey', text: 'caught in 4k 💀👻', mood: 'shock' },
  ],
  reveal: 'Flips and twists are the same problem seen from different sides.',
  proTerm: 'Pros call this: the 3-qubit phase-flip code. Its checks measure X1X2 and X2X3, and Z fixes the error.',
  solution: { morning: DECODE3_PHASE },
  traps: [
    { name: 'Bit-flip routine with no glasses', morning: DECODE3_BITFLIP },
    {
      name: 'Glasses on and off, but fix with BOOP',
      morning: P(`
SPIN q1
SPIN q2
SPIN q3
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
HIGHFIVE q2 -> b
HIGHFIVE q3 -> b
SPIN q1
SPIN q2
SPIN q3
LISTEN a
LISTEN b
IF a BEEP and b QUIET -> fix1
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
BOOP q3
`),
    },
    { name: 'Glasses on, never off', morning: cat(SPIN3, DECODE3_BITFLIP) },
  ],
};

const L33: LevelDef = {
  id: '3-3',
  chapter: 3,
  title: 'Wobbles',
  subtitle: 'Half a flip. Is that even a thing?',
  qubbles: ROW3,
  bots: BOTS2,
  signs: [{ text: 'NO HALF MEASURES', x: 4, y: 0 }],
  toolbox: ['HIGHFIVE', 'LISTEN', 'RESET', 'IF', 'BOOP', 'SHUSH', 'SPIN', 'END', 'JUMP', 'PEEK'],
  editable: ['morning'],
  fixedBedtime: ENCODE3,
  starterMorning: DECODE3_BITFLIP,
  inputs: ['zero', 'plus', 'random', 'random'],
  inputQubble: 'q1',
  noise: {
    mode: 'enumerate',
    kinds: ['wobble'],
    maxErrors: 1,
    targets: ['q1', 'q2', 'q3'],
    wobbleAxis: 'x',
    wobbleAngles: [Math.PI / 8, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3],
  },
  goal: { kind: 'state', dataQubits: ['q1', 'q2', 'q3'], targetCircuit: ENCODE3 },
  challenges: { lines: 15, bots: 2 },
  intro: [
    { who: 'wobbles', text: 'i only flip... a little... like... partway... is that...', mood: 'sleepy' },
    { who: 'schrodi', text: 'A gremlin that half-flips. Your routine only knows full flips. Run it anyway. I am curious.', mood: 'deadpan' },
  ],
  hints: [
    'Run your old Who Got Flipped routine first. Then watch the replay closely.',
    'Watch the Qubble right when the bot LISTENs. Is it still half flipped after that?',
    'Your 2-3 routine already works. Listening forces the half-flip to pick a side.',
  ],
  winLine: [
    { who: 'wobbles', text: 'i was... partway... and then... the bot listened... and i was... all the way...?', mood: 'shock' },
    { who: 'schrodi', text: 'Asking the question forced an answer. Full flip or no flip. Both of which you can fix.', mood: 'smug' },
  ],
  reveal: 'Listening forces a half-flip to become a full flip or no flip. Asking about the damage squashes a small error into one you can fix.',
  proTerm: 'Pros call this: error discretization. Syndrome measurement projects a continuous error onto a discrete Pauli error.',
  solution: { morning: DECODE3_BITFLIP },
  traps: [
    { name: 'Do nothing (half-flips add up)', morning: [] },
    {
      name: 'Only one bot',
      morning: P(`
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
LISTEN a
IF a BEEP -> fix1
END
fix1:
BOOP q1
`),
    },
  ],
};

export const CH3: LevelDef[] = [L31, L32, L33];
