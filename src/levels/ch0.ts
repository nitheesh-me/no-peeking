import type { LevelDef } from '../core/contracts';
import { P, ENCODE3 } from './dsl';

/** Ch 0 — Day Shift. Classical bit-balls; peeking is allowed (and expected). */

const L01: LevelDef = {
  id: '0-1',
  chapter: 0,
  title: 'Good Morning',
  subtitle: 'One bit-ball. One gremlin. Maybe.',
  qubbles: [{ id: 'q1', x: 4, y: 3 }],
  bots: [],
  signs: [{ text: 'DAY SHIFT: PEEKING OK', x: 1, y: 0 }],
  classical: true,
  allowPeekData: true,
  toolbox: ['PEEK', 'IF', 'BOOP', 'END'],
  editable: ['morning'],
  inputs: ['zero'],
  inputQubble: 'q1',
  noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1, targets: ['q1'] },
  goal: { kind: 'state', dataQubits: ['q1'], targetCircuit: [] },
  challenges: { lines: 4, steps: 4 },
  intro: [
    { who: 'schrodi', text: 'Welcome to the Qubble Daycare. You are the new caretaker. I am the cat. I am in a box.', mood: 'deadpan' },
    { who: 'schrodi', text: 'This one is a Bit-ball. It should wake up Sunny. Sometimes a gremlin flips it at night.', mood: 'deadpan' },
    { who: 'flipper', text: 'skibidi FLIP 💀 or maybe not. guess. no cap.', mood: 'smug' },
    { who: 'schrodi', text: 'Day shift rules: you may PEEK. Enjoy it while it lasts.', mood: 'deadpan' },
  ],
  hints: [
    'Not every night has a gremlin. Find out before you fix anything.',
    'PEEK the Bit-ball. Its light tells you what it dreamt.',
    'PEEK q1, then IF q1 BEEP jump to a BOOP. Otherwise END.',
  ],
  winLine: [
    { who: 'schrodi', text: 'Sunny. Every time. Tremendous. I will tell nobody.', mood: 'deadpan' },
    { who: 'flipper', text: 'bro checked first 😭 ratio', mood: 'shock' },
  ],
  reveal: 'Look first, then fix only what is broken.',
  proTerm: 'Pros call this: measurement plus classical feedback (a conditional X gate).',
  meta: ['title-peek'],
  solution: {
    morning: P(`
PEEK q1
IF q1 BEEP -> fix
END
fix:
BOOP q1
`),
  },
  traps: [
    { name: 'Always BOOP (breaks the quiet nights)', morning: P(`BOOP q1`) },
    { name: 'Do nothing (Flipper wins)', morning: [] },
  ],
};

const L02: LevelDef = {
  id: '0-2',
  chapter: 0,
  title: 'Threes a Crowd',
  subtitle: 'Copy the important stuff. Take a vote.',
  qubbles: [
    { id: 'q1', x: 2, y: 3 },
    { id: 'q2', x: 4, y: 3 },
    { id: 'q3', x: 6, y: 3 },
  ],
  bots: [],
  signs: [{ text: 'MAJORITY RULES', x: 4, y: 0 }],
  classical: true,
  allowPeekData: true,
  toolbox: ['PEEK', 'IF', 'BOOP', 'END'],
  editable: ['morning'],
  fixedBedtime: ENCODE3,
  inputs: ['zero', 'one'],
  inputQubble: 'q1',
  noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1, targets: ['q1', 'q2', 'q3'] },
  goal: { kind: 'state', dataQubits: ['q1', 'q2', 'q3'], targetCircuit: ENCODE3 },
  challenges: { lines: 15 },
  intro: [
    { who: 'schrodi', text: 'Three Bit-balls. Same dream. Could be Sunny, could be Moony. Nobody told me.', mood: 'deadpan' },
    { who: 'flipper', text: 'i flip ONE. which one? its giving mystery 🕵️', mood: 'smug' },
    { who: 'schrodi', text: 'By morning all three should dream what they started with.', mood: 'deadpan' },
  ],
  hints: [
    'You do not know the right dream. But two of them still do.',
    'PEEK all three. The odd one out is the one Flipper got.',
    'q1 is the odd one if it is BEEP while q2 and q3 are QUIET, or QUIET while both are BEEP. Same idea for q2 and q3. Six IFs, three BOOPs, and an END after each BOOP.',
  ],
  winLine: [
    { who: 'schrodi', text: 'Easy. Copy the important stuff, take a vote. Remember this trick.', mood: 'deadpan' },
    { who: 'schrodi', text: 'It is about to stop working.', mood: 'smug' },
  ],
  reveal: 'Keep three copies. If one disagrees, the other two outvote it.',
  proTerm: 'Pros call this: the 3-bit repetition code with majority-vote decoding.',
  solution: {
    morning: P(`
PEEK q1
PEEK q2
PEEK q3
IF q1 BEEP and q2 QUIET and q3 QUIET -> fix1
IF q1 QUIET and q2 BEEP and q3 BEEP -> fix1
IF q2 BEEP and q1 QUIET and q3 QUIET -> fix2
IF q2 QUIET and q1 BEEP and q3 BEEP -> fix2
IF q3 BEEP and q1 QUIET and q2 QUIET -> fix3
IF q3 QUIET and q1 BEEP and q2 BEEP -> fix3
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
  traps: [
    {
      name: 'Fix whoever is Moony (forgets the dream might be Moony)',
      morning: P(`
PEEK q1
PEEK q2
PEEK q3
IF q1 BEEP -> fix1
IF q2 BEEP -> fix2
IF q3 BEEP -> fix3
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
    {
      name: 'Forgot the ENDs (fixes fall through)',
      morning: P(`
PEEK q1
PEEK q2
PEEK q3
IF q1 BEEP and q2 QUIET and q3 QUIET -> fix1
IF q1 QUIET and q2 BEEP and q3 BEEP -> fix1
IF q2 BEEP and q1 QUIET and q3 QUIET -> fix2
IF q2 QUIET and q1 BEEP and q3 BEEP -> fix2
IF q3 BEEP and q1 QUIET and q2 QUIET -> fix3
IF q3 QUIET and q1 BEEP and q2 BEEP -> fix3
END
fix1:
BOOP q1
fix2:
BOOP q2
fix3:
BOOP q3
`),
    },
  ],
};

export const CH0: LevelDef[] = [L01, L02];
