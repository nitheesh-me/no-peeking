import type { LevelDef, Placement } from '../core/contracts';
import { P, ENCODE3, DECODE3_BITFLIP } from './dsl';

/** Ch 2 — Whisper Network. Parity checks: ask the bots, not the Qubbles. */

const ROW3: Placement[] = [
  { id: 'q1', x: 2, y: 2 },
  { id: 'q2', x: 4, y: 2 },
  { id: 'q3', x: 6, y: 2 },
];
const BOTS2: Placement[] = [
  { id: 'a', x: 3, y: 4 },
  { id: 'b', x: 5, y: 4 },
];

const L21: LevelDef = {
  id: '2-1',
  chapter: 2,
  title: 'Do You Match?',
  subtitle: 'Ask about the pair. Never about the Qubble.',
  qubbles: [
    { id: 'q1', x: 3, y: 2 },
    { id: 'q2', x: 5, y: 2 },
  ],
  bots: [{ id: 'a', x: 4, y: 4 }],
  signs: [
    { text: 'LOOKING = WAKING', x: 1, y: 0 },
    { text: 'BOTS MAY BE LOOKED AT', x: 6, y: 0 },
  ],
  toolbox: ['HIGHFIVE', 'LISTEN', 'IF', 'BOOP', 'END', 'SPIN', 'PEEK'],
  editable: ['morning'],
  fixedBedtime: P(`HIGHFIVE q1 -> q2`),
  inputs: ['zero', 'one', 'plus', 'random', 'random'],
  inputQubble: 'q1',
  // Flipper only ever reaches Qubble 2 (it sleeps by the window).
  noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1, targets: ['q2'] },
  goal: { kind: 'state', dataQubits: ['q1', 'q2'], targetCircuit: P(`HIGHFIVE q1 -> q2`) },
  challenges: { lines: 6, bots: 1 },
  intro: [
    { who: 'schrodi', text: 'These two share a dream. Twins. Flipper sometimes sneaks in the window and flips Qubble 2.', mood: 'deadpan' },
    { who: 'schrodi', text: 'Meet the Ancillabot. You CAN look at bots. Bots love being looked at.', mood: 'happy' },
    { who: 'flipper', text: 'did i flip it? did i not? u will never know bestie 👻', mood: 'smug' },
  ],
  hints: [
    'You cannot ask a Qubble what it dreams. But you can ask whether two Qubbles agree.',
    'A bot that high-fives BOTH Qubbles flips twice if they agree, and once if they do not.',
    'HIGHFIVE q1 -> a, HIGHFIVE q2 -> a, LISTEN a. IF a BEEP, BOOP q2.',
  ],
  winLine: [
    { who: 'schrodi', text: 'The bot knows they disagreed. It has no idea what either one dreams. Ideal employee.', mood: 'deadpan' },
    { who: 'flipper', text: 'snitch bot 😤 not the parity check 💀', mood: 'shock' },
  ],
  reveal: 'The bot learned whether they match, but not what they dream.',
  proTerm: 'Pros call this: a parity check (measuring Z1Z2 with an ancilla and two CNOTs).',
  solution: {
    morning: P(`
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
LISTEN a
IF a BEEP -> fix
END
fix:
BOOP q2
`),
  },
  traps: [
    {
      name: 'Ask Qubble 2 alone (that is just peeking with extra steps)',
      morning: P(`
HIGHFIVE q2 -> a
LISTEN a
IF a BEEP -> fix
END
fix:
BOOP q2
`),
    },
    {
      name: 'Peek and compare',
      morning: P(`
PEEK q1
PEEK q2
`),
    },
    { name: 'Always BOOP', morning: P(`BOOP q2`) },
  ],
};

const L22: LevelDef = {
  id: '2-2',
  chapter: 2,
  title: 'Tuck In',
  subtitle: 'One dream, three blankets.',
  qubbles: ROW3,
  bots: [],
  signs: [{ text: 'NO COPIES', x: 1, y: 0 }, { text: 'SHARING IS FINE', x: 6, y: 0 }],
  toolbox: ['HIGHFIVE', 'SPIN', 'BOOP', 'PEEK', 'IF', 'END'],
  editable: ['bedtime'],
  inputs: ['zero', 'one', 'plus', 'random', 'random'],
  inputQubble: 'q1',
  noise: { mode: 'none' },
  goal: { kind: 'state', dataQubits: ['q1', 'q2', 'q3'], targetCircuit: ENCODE3 },
  challenges: { lines: 2 },
  intro: [
    { who: 'schrodi', text: 'Remember the vote trick? Three copies, majority wins? We cannot copy anymore.', mood: 'deadpan' },
    { who: 'schrodi', text: 'So write the Bedtime routine: spread Qubble 1s dream across all three. Shared, not copied.', mood: 'deadpan' },
  ],
  hints: [
    'You already made twins once. Can you make triplets?',
    'Qubble 1 needs to share with Qubble 2 AND Qubble 3.',
    'HIGHFIVE q1 -> q2, then HIGHFIVE q1 -> q3.',
  ],
  winLine: [
    { who: 'schrodi', text: 'Three Qubbles, one dream. All Sunny together or all Moony together.', mood: 'happy' },
    { who: 'qubble', text: 'zzz... group chat... zzz', mood: 'sleepy' },
  ],
  reveal: 'You cannot make three copies, but three Qubbles can share one dream.',
  proTerm: 'Pros call this: encoding into the 3-qubit repetition code, a|000> + b|111>.',
  solution: { bedtime: ENCODE3 },
  traps: [
    { name: 'Only one high-five', bedtime: P(`HIGHFIVE q1 -> q2`) },
    {
      name: 'Peek and rebuild (the Day Shift way)',
      bedtime: P(`
PEEK q1
IF q1 BEEP -> one
END
one:
BOOP q2
BOOP q3
`),
    },
  ],
};

const L23: LevelDef = {
  id: '2-3',
  chapter: 2,
  title: 'Who Got Flipped?',
  subtitle: 'Two bots. Four answers.',
  qubbles: ROW3,
  bots: BOTS2,
  signs: [
    { text: 'LOOKING = WAKING', x: 1, y: 0 },
    { text: 'ASK THE BOTS', x: 6, y: 0 },
  ],
  toolbox: ['HIGHFIVE', 'LISTEN', 'IF', 'BOOP', 'END', 'JUMP', 'SPIN', 'PEEK'],
  editable: ['morning'],
  fixedBedtime: ENCODE3,
  inputs: ['zero', 'one', 'plus', 'random', 'random'],
  inputQubble: 'q1',
  noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1, targets: ['q1', 'q2', 'q3'] },
  goal: { kind: 'state', dataQubits: ['q1', 'q2', 'q3'], targetCircuit: ENCODE3 },
  challenges: { lines: 15, steps: 12, bots: 2 },
  intro: [
    { who: 'schrodi', text: 'Three Qubbles, one shared dream. Already tucked in. Flipper flips at most one of them.', mood: 'deadpan' },
    { who: 'flipper', text: 'eeny meeny skibidi FLIP 💀 good luck finding it lmao', mood: 'smug' },
    { who: 'schrodi', text: 'Find the flipped one. Fix it. Wake nobody.', mood: 'deadpan' },
  ],
  hints: [
    'One bot can tell you if two Qubbles match. You have two bots.',
    'Bot a checks Qubbles 1 and 2. Bot b checks Qubbles 2 and 3. Which Qubble makes BOTH bots beep?',
    'a BEEP + b QUIET means Qubble 1. Both BEEP means Qubble 2. a QUIET + b BEEP means Qubble 3. Put END after each fix.',
  ],
  winLine: [
    { who: 'schrodi', text: 'Two little beeps. You found the gremlin without looking at a single Qubble.', mood: 'happy' },
    { who: 'flipper', text: 'HOW 😭 u didnt even look. this is so ohio', mood: 'shock' },
  ],
  reveal: 'The beeps tell you where the damage is, and nothing about the dream itself.',
  proTerm: 'Pros call this: the 3-qubit bit-flip code. The beep pattern is the error syndrome.',
  solution: { morning: DECODE3_BITFLIP },
  traps: [
    {
      name: 'Peek and vote (the Day Shift way)',
      morning: P(`
PEEK q1
PEEK q2
PEEK q3
`),
    },
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
    {
      name: 'Forgot the ENDs (fixes fall through)',
      morning: P(`
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
BOOP q1
fix2:
BOOP q2
fix3:
BOOP q3
`),
    },
    {
      name: 'Ask each Qubble on its own',
      morning: P(`
HIGHFIVE q1 -> a
HIGHFIVE q2 -> b
LISTEN a
LISTEN b
`),
    },
  ],
};

const L24: LevelDef = {
  id: '2-4',
  chapter: 2,
  title: 'Budget Cuts',
  subtitle: 'One bot. Same job.',
  qubbles: ROW3,
  bots: [{ id: 'a', x: 4, y: 4 }],
  signs: [{ text: 'ONE BOT PER ROOM', x: 4, y: 0 }],
  toolbox: ['HIGHFIVE', 'LISTEN', 'RESET', 'IF', 'BOOP', 'END', 'JUMP', 'SPIN', 'PEEK'],
  editable: ['morning'],
  fixedBedtime: ENCODE3,
  inputs: ['zero', 'one', 'plus', 'random', 'random'],
  inputQubble: 'q1',
  noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1, targets: ['q1', 'q2', 'q3'] },
  goal: { kind: 'state', dataQubits: ['q1', 'q2', 'q3'], targetCircuit: ENCODE3 },
  challenges: { lines: 19, bots: 1 },
  intro: [
    { who: 'schrodi', text: 'Management sold bot b. Do not ask.', mood: 'deadpan' },
    { who: 'schrodi', text: 'New card: RESET. It wipes a bot clean so it can ask a second question.', mood: 'deadpan' },
  ],
  hints: [
    'Ask the first question, decide what it means, then reuse the bot for the second one.',
    'After LISTEN, a BEEP bot is still holding its beep. RESET it before the next high-fives.',
    'Check q1 and q2. IF a BEEP jump to a branch that RESETs, checks q2 and q3, and fixes q2 on BEEP or q1 on QUIET. Otherwise check q2 and q3 and fix q3 on BEEP.',
  ],
  winLine: [
    { who: 'schrodi', text: 'One bot, two questions. The bot has asked for a raise.', mood: 'deadpan' },
    { who: 'flipper', text: 'one bot doing all that?? bro is cracked fr', mood: 'shock' },
  ],
  reveal: 'A bot can be wiped and asked again. Clues are cheap, Qubbles are precious.',
  proTerm: 'Pros call this: ancilla reuse with mid-circuit measurement and reset.',
  solution: {
    morning: P(`
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
LISTEN a
IF a BEEP -> left
HIGHFIVE q2 -> a
HIGHFIVE q3 -> a
LISTEN a
IF a BEEP -> fix3
END
left:
RESET a
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
`),
  },
  traps: [
    {
      name: 'Forgot to RESET (the bot remembers its last beep)',
      morning: P(`
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
LISTEN a
IF a BEEP -> left
HIGHFIVE q2 -> a
HIGHFIVE q3 -> a
LISTEN a
IF a BEEP -> fix3
END
left:
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
`),
    },
    {
      name: 'Only one question',
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

const L25: LevelDef = {
  id: '2-5',
  chapter: 2,
  title: 'Double Trouble',
  subtitle: 'Perfect is off the menu. Better is not.',
  qubbles: ROW3,
  bots: BOTS2,
  signs: [{ text: 'NIGHT SHIFT LAB', x: 6, y: 0 }],
  toolbox: ['HIGHFIVE', 'LISTEN', 'RESET', 'IF', 'BOOP', 'END', 'JUMP', 'SPIN', 'PEEK'],
  editable: ['morning'],
  fixedBedtime: ENCODE3,
  starterMorning: DECODE3_BITFLIP,
  inputs: ['random'],
  inputQubble: 'q1',
  // Every Qubble independently flipped with p = 0.1. Uncoded Qubble survives 90%.
  // Coded fails only on 2+ flips: 3p^2 - 2p^3 = 2.8%, so ~97.2% survive.
  noise: { mode: 'random', p: 0.1, kinds: ['flip'] },
  goal: { kind: 'rate', dataQubits: ['q1', 'q2', 'q3'], targetCircuit: ENCODE3, nights: 300, minRate: 0.93 },
  challenges: { lines: 15 },
  intro: [
    { who: 'flipper', text: 'new update: i brought my cousins 💀 sometimes we flip TWO. sometimes THREE. no cap', mood: 'smug' },
    { who: 'schrodi', text: 'Your old routine is loaded. A lone Qubble with no help survives 9 nights in 10. Beat that over 300 nights.', mood: 'deadpan' },
  ],
  hints: [
    'Just run it. Then open a failed night. What did Flipper do?',
    'When two get flipped, the bots point at the third. Nothing can fix that. But how often does it happen?',
    'Your 2-3 routine already wins this. Two flips in one night are much rarer than one.',
  ],
  winLine: [
    { who: 'schrodi', text: 'Some nights still go wrong. Far fewer than before. That is the whole business model.', mood: 'deadpan' },
    { who: 'flipper', text: 'we only win when we team up?? and we never team up?? 😭', mood: 'shock' },
  ],
  reveal: 'A code does not make errors impossible. It makes them rarer, as long as errors are rare to begin with.',
  proTerm: 'Pros call this: the threshold idea. Logical error rate 3p^2 - 2p^3 beats physical rate p whenever p < 1/2.',
  meta: ['night-lab-unlock'],
  solution: { morning: DECODE3_BITFLIP },
  traps: [
    { name: 'No decoder at all', morning: [] },
    {
      name: 'Only watch Qubble 1',
      morning: P(`
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
HIGHFIVE q2 -> b
HIGHFIVE q3 -> b
LISTEN a
LISTEN b
IF a BEEP and b QUIET -> fix1
END
fix1:
BOOP q1
`),
    },
  ],
};

export const CH2: LevelDef[] = [L21, L22, L23, L24, L25];
