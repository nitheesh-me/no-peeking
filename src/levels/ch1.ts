import type { LevelDef } from '../core/contracts';
import { P } from './dsl';

/** Ch 1 — Night Shift. Real Qubbles: two dreams at once. No peeking. */

const L11: LevelDef = {
  id: '1-1',
  chapter: 1,
  title: 'Dont Wake Them',
  subtitle: 'The hardest job is doing nothing.',
  qubbles: [{ id: 'q1', x: 4, y: 3 }],
  bots: [],
  signs: [
    { text: 'LOOKING = WAKING', x: 1, y: 0 },
    { text: 'GREMLINS ONLY AT NIGHT', x: 6, y: 0 },
  ],
  toolbox: ['PEEK', 'BOOP'],
  editable: ['morning'],
  inputs: ['plus', 'random', 'plusI', 'random'],
  inputQubble: 'q1',
  noise: { mode: 'none' },
  goal: { kind: 'state', dataQubits: ['q1'], targetCircuit: [] },
  challenges: { lines: 0 },
  intro: [
    { who: 'schrodi', text: 'Night shift. This is a real Qubble. It dreams two dreams at once.', mood: 'sleepy' },
    { who: 'schrodi', text: 'No gremlins tonight. Keep its dream safe until morning.', mood: 'deadpan' },
    { who: 'schrodi', text: 'You still have the PEEK card. No reason. Just saying.', mood: 'smug' },
  ],
  hints: [
    'Is anything actually going wrong tonight?',
    'Every card you add does something to the Qubble. Do you want something done to it?',
    'The empty program is a program. Press Run.',
  ],
  winLine: [
    { who: 'schrodi', text: 'You did nothing. Perfectly. I have never been prouder.', mood: 'happy' },
    { who: 'qubble', text: 'zzz... mmm both dreams... zzz', mood: 'sleepy' },
  ],
  reveal: 'Looking at a quantum thing changes it.',
  proTerm: 'Pros call this: measurement collapse (a measured superposition becomes a single outcome).',
  meta: ['peek-hazard-tape'],
  solution: { morning: [] },
  traps: [
    { name: 'Just a little peek', morning: P(`PEEK q1`) },
    { name: 'Boop it for luck', morning: P(`BOOP q1`) },
  ],
};

const L12: LevelDef = {
  id: '1-2',
  chapter: 1,
  title: 'Twirl',
  subtitle: 'Flipper only knows one trick.',
  qubbles: [{ id: 'q1', x: 4, y: 3 }],
  bots: [],
  signs: [{ text: 'LOOKING = WAKING', x: 1, y: 0 }],
  toolbox: ['SPIN', 'BOOP', 'PEEK'],
  editable: ['bedtime', 'morning'],
  inputs: ['zero', 'one'],
  inputQubble: 'q1',
  noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1, targets: ['q1'] },
  goal: { kind: 'state', dataQubits: ['q1'], targetCircuit: [] },
  challenges: { lines: 2 },
  intro: [
    { who: 'schrodi', text: 'New card: SPIN. It turns a dream sideways. Spin it again and it turns back.', mood: 'deadpan' },
    { who: 'flipper', text: 'i flip sunny to moony. moony to sunny. thats the whole bit. no cap 💀', mood: 'smug' },
    { who: 'schrodi', text: 'Some nights he comes. Some nights he forgets. It should wake up dreaming what it went to bed with.', mood: 'deadpan' },
  ],
  hints: [
    'Flipper turns Sunny into Moony and back. What does he do to a dream that is neither?',
    'Turn the dream sideways before Flipper gets there.',
    'SPIN at Bedtime. SPIN again in the Morning.',
  ],
  winLine: [
    { who: 'flipper', text: 'wait i flipped it and nothing happened?? ohio ahh dream 😭', mood: 'shock' },
    { who: 'schrodi', text: 'Spin, sleep, spin back. Nothing lost. Remember that.', mood: 'smug' },
  ],
  reveal: 'Turn a dream sideways and back, and nothing is lost. Flipper cannot flip a sideways dream.',
  proTerm: 'Pros call this: the Hadamard gate (H). H·H = identity, and X does nothing to the |+> state.',
  solution: { bedtime: P(`SPIN q1`), morning: P(`SPIN q1`) },
  traps: [
    { name: 'Do nothing (Flipper wins)', bedtime: [], morning: [] },
    { name: 'Always BOOP back (but Flipper sometimes forgets)', morning: P(`BOOP q1`) },
    { name: 'Spin once and forget to spin back', bedtime: P(`SPIN q1`), morning: [] },
  ],
};

const L13: LevelDef = {
  id: '1-3',
  chapter: 1,
  title: 'The Photocopier',
  subtitle: 'Backups are important. Right?',
  qubbles: [
    { id: 'q1', x: 3, y: 3 },
    { id: 'q2', x: 5, y: 3 },
  ],
  bots: [],
  signs: [
    { text: 'NO COPIES', x: 4, y: 0 },
    { text: 'LOOKING = WAKING', x: 1, y: 0 },
  ],
  toolbox: ['HIGHFIVE', 'SPIN', 'BOOP', 'PEEK'],
  editable: ['bedtime'],
  // zero/one first so the "copy" looks like it works, then swirls break it.
  inputs: ['zero', 'one', 'plus', 'random'],
  inputQubble: 'q1',
  noise: { mode: 'none' },
  goal: {
    kind: 'state',
    dataQubits: ['q2'],
    targetCircuit: P(`
HIGHFIVE q1 -> q2
HIGHFIVE q2 -> q1
`),
  },
  challenges: { lines: 2 },
  intro: [
    { who: 'schrodi', text: 'Qubble 1 is going home early. Qubble 2 has to keep its dream.', mood: 'deadpan' },
    { who: 'schrodi', text: 'New card: HIGHFIVE. The second one flips if the first one is Moony. Get the dream into Qubble 2.', mood: 'deadpan' },
    { who: 'flipper', text: 'just copy it lol. ctrl c ctrl v. ez 💅', mood: 'smug' },
  ],
  hints: [
    'Watch the swirly nights in the replay. Is Qubble 2 really dreaming the dream? Or just holding hands?',
    'One high-five makes them twins. Twins share a dream, nobody owns it. Can Qubble 2 take it back from Qubble 1?',
    'HIGHFIVE q1 -> q2, then HIGHFIVE q2 -> q1.',
  ],
  winLine: [
    { who: 'schrodi', text: 'Qubble 2 has the dream. Qubble 1 has nothing. That is not a copy. That is a move.', mood: 'deadpan' },
    { who: 'flipper', text: 'copy paste got patched?? its giving nerf 💀', mood: 'shock' },
  ],
  reveal: 'You cannot copy a dream. You can only share it, or move it.',
  proTerm: 'Pros call this: the no-cloning theorem. The CNOT gate makes entanglement, not copies.',
  meta: ['clone-glitch'],
  solution: {
    bedtime: P(`
HIGHFIVE q1 -> q2
HIGHFIVE q2 -> q1
`),
  },
  traps: [
    { name: 'Photocopy (works on Sunny and Moony, breaks on swirls)', bedtime: P(`HIGHFIVE q1 -> q2`) },
    {
      name: 'Peek and rebuild',
      bedtime: P(`
PEEK q1
IF q1 BEEP -> one
END
one:
BOOP q2
`),
    },
  ],
};

const L14: LevelDef = {
  id: '1-4',
  chapter: 1,
  title: 'Twin Dreams',
  subtitle: 'Not a copy. A share.',
  qubbles: [
    { id: 'q1', x: 3, y: 3 },
    { id: 'q2', x: 5, y: 3 },
  ],
  bots: [],
  signs: [{ text: 'NO COPIES', x: 4, y: 0 }],
  toolbox: ['HIGHFIVE', 'SPIN', 'BOOP', 'PEEK'],
  editable: ['bedtime'],
  inputs: ['zero'],
  inputQubble: 'q1',
  noise: { mode: 'none' },
  goal: {
    kind: 'state',
    dataQubits: ['q1', 'q2'],
    targetCircuit: P(`
SPIN q1
HIGHFIVE q1 -> q2
`),
  },
  challenges: { lines: 2 },
  intro: [
    { who: 'schrodi', text: 'Two Sunny Qubbles. Tonight they should share one double-dream.', mood: 'deadpan' },
    { who: 'schrodi', text: 'Both Sunny and both Moony at once. Never one of each.', mood: 'deadpan' },
  ],
  hints: [
    'A high-five only spreads a dream if there is something double to spread.',
    'Make Qubble 1 dream two dreams first.',
    'SPIN q1, then HIGHFIVE q1 -> q2.',
  ],
  winLine: [
    { who: 'schrodi', text: 'Twins. Wake one and the other always agrees. Spooky. I love it.', mood: 'happy' },
    { who: 'flipper', text: 'they matching fits?? lowkey cute ngl', mood: 'happy' },
  ],
  reveal: 'Two Qubbles can share one dream. Neither has it alone, but they always agree.',
  proTerm: 'Pros call this: a Bell pair (entanglement), made with H then CNOT.',
  solution: {
    bedtime: P(`
SPIN q1
HIGHFIVE q1 -> q2
`),
  },
  traps: [
    { name: 'High-five without a double-dream', bedtime: P(`HIGHFIVE q1 -> q2`) },
    {
      name: 'Spin both separately',
      bedtime: P(`
SPIN q1
SPIN q2
`),
    },
  ],
};

export const CH1: LevelDef[] = [L11, L12, L13, L14];
