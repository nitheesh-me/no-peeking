/** Card Guide content: what each Bot Code card does, a mini-demo recipe, the pro term (spoiler-gated), and tips. */
import type { OpName, LevelDef } from '../core/contracts';

export interface CardDemo {
  /** who performs: the caretaker on a creature, or a bot rolling over */
  actor: 'caretaker' | 'bot' | 'none';
  /** the caretaker's action pose */
  action?: 'boop' | 'shush' | 'spin' | 'peek' | 'listen' | 'press';
  /** what's being worked on */
  target: 'qubble' | 'bot' | 'two-qubbles' | 'none';
  /** dream before → after (z of the Bloch vector, or 'x' for sideways) */
  from?: 'sunny' | 'moony' | 'plus' | 'minus';
  to?: 'sunny' | 'moony' | 'plus' | 'minus';
  /** bot light after the action */
  light?: 0 | 1 | null;
  glyph?: string;
}

export interface CardGuide {
  name: string;
  what: string;
  demo: CardDemo;
  pro?: { term: string; unlockAfter: string };
  tips: string[];
}

export const CARD_GUIDE: Record<OpName, CardGuide> = {
  BOOP: {
    name: 'BOOP',
    what: 'Boop a Qubble on the nose and its dream flips: Sunny becomes Moony, Moony becomes Sunny.',
    demo: { actor: 'caretaker', action: 'boop', target: 'qubble', from: 'sunny', to: 'moony' },
    pro: { term: 'the Pauli-X (NOT) gate', unlockAfter: '0-1' },
    tips: [
      'BOOP twice and nothing changed. Handy for undoing a mistake.',
      'It is how you FIX a flip once your bots tell you who got flipped.',
      'Booping a sideways (|+⟩ or |−⟩) Qubble leaves it alone. It only swaps Sunny and Moony.',
    ],
  },
  SHUSH: {
    name: 'SHUSH',
    what: 'Shush a Qubble and its swirl turns the other way. Plain Sunny or Moony dreams do not notice.',
    demo: { actor: 'caretaker', action: 'shush', target: 'qubble', from: 'plus', to: 'minus' },
    pro: { term: 'the Pauli-Z (phase flip) gate', unlockAfter: '3-2' },
    tips: [
      'SHUSH is the fix for Phasey the ghost, the way BOOP is the fix for Flipper.',
      'SPIN, then BOOP, then SPIN does the same as SHUSH.',
      'You can not SEE a swirl direction with PEEK. That is the whole problem.',
    ],
  },
  SPIN: {
    name: 'SPIN',
    what: 'Spin a Qubble and its dream turns sideways: Sunny becomes a swirl, and a swirl becomes Sunny again.',
    demo: { actor: 'caretaker', action: 'spin', target: 'qubble', from: 'sunny', to: 'plus' },
    pro: { term: 'the Hadamard gate', unlockAfter: '1-2' },
    tips: [
      'SPIN twice and you are back where you started.',
      'SPIN everyone, fix flips, SPIN back: that turns a flip-fixer into a swirl-fixer.',
      'A swirly Qubble is both dreams at once. PEEKing it makes it pick one at random.',
    ],
  },
  HIGHFIVE: {
    name: 'HIGHFIVE',
    what: 'The first one high-fives the second. If the first is Moony, the second one flips. If it is Sunny, nothing happens.',
    demo: { actor: 'bot', target: 'qubble', from: 'moony', to: 'moony', light: 1 },
    pro: { term: 'the CNOT gate', unlockAfter: '1-3' },
    tips: [
      'A bot that high-fives two Qubbles learns whether they match, without learning what they dream.',
      'HIGHFIVE q1 → q2 shares q1\'s dream with q2. It is sharing, not copying (no copies of swirls!).',
      'Order matters: the arrow points from the one who decides to the one who flips.',
    ],
  },
  LISTEN: {
    name: 'LISTEN',
    what: 'Ask a bot what it heard. Its light comes on: BEEP (red) or QUIET (green).',
    demo: { actor: 'caretaker', action: 'listen', target: 'bot', light: 1 },
    pro: { term: 'measuring an ancilla (reading the syndrome)', unlockAfter: '2-1' },
    tips: [
      'Listening never wakes a Qubble by itself, but it is a real measurement. If the bot copied ONE Qubble, listening reads (and pops) that Qubble. Safe questions compare two Qubbles.',
      'LISTEN after the high-fives, not before. The bot needs something to tell you.',
      'Two bots give four answers. That is enough to point at any one of three Qubbles.',
    ],
  },
  RESET: {
    name: 'RESET',
    what: 'Press a bot\'s button and its qubit goes back to |0⟩, ready to help again. (Its light keeps showing the last LISTEN.)',
    demo: { actor: 'caretaker', action: 'press', target: 'bot', light: 0 },
    pro: { term: 'resetting an ancilla qubit', unlockAfter: '2-4' },
    tips: [
      'Reuse a bot instead of buying a new one: LISTEN, then RESET, then ask the next question.',
      'A bot\'s qubit still holds its last answer until you RESET it: high-fiving it again would add to it.',
      'IF still sees the last LISTEN result after a RESET, so you can decide first and reset later.',
    ],
  },
  PEEK: {
    name: 'PEEK',
    what: 'Look at it. You learn Sunny or Moony (0 or 1).',
    demo: { actor: 'caretaker', action: 'peek', target: 'qubble', from: 'plus', to: 'sunny' },
    pro: { term: 'a measurement (in the Z basis)', unlockAfter: '1-1' },
    tips: [], // filled per level by peekTips()
  },
  IF: {
    name: 'IF',
    what: 'Jump to a spot if the lights match. If they don\'t, just carry on with the next card.',
    demo: { actor: 'none', target: 'none', glyph: '🤔' },
    pro: { term: 'classically-controlled correction (feed-forward)', unlockAfter: '2-1' },
    tips: [
      'Combine conditions with + : the jump only happens when ALL of them hold.',
      'Put an END (or a JUMP) after each fix, or you will fall into the next fix too.',
      'A bot nobody has listened to counts as QUIET.',
    ],
  },
  JUMP: {
    name: 'JUMP',
    what: 'Always jump to a spot (a ⚑ LABEL).',
    demo: { actor: 'none', target: 'none', glyph: '↪' },
    pro: { term: 'classical control flow (a goto)', unlockAfter: '2-3' },
    tips: [
      'JUMP to a spot at the very end to skip the rest of your fixes.',
      'Jumping backwards makes a loop. The night is long, but not endless.',
    ],
  },
  LABEL: {
    name: 'LABEL',
    what: 'A spot (⚑) that IF and JUMP can jump to. It does nothing by itself.',
    demo: { actor: 'none', target: 'none', glyph: '⚑' },
    tips: ['Labels do not count as lines.', 'Pick "+ new spot" on an IF or JUMP to make one.'],
  },
  END: {
    name: 'END',
    what: 'Stop here. Everyone goes back to sleep.',
    demo: { actor: 'none', target: 'none', glyph: '💤' },
    pro: { term: 'halt', unlockAfter: '0-1' },
    tips: ['Put END after each fix so you only fix one Qubble.', 'Running off the bottom of your program also ends it.'],
  },
  NOTE: {
    name: 'COMMENT',
    what: 'A note to yourself, with a little drawing pad. The bots ignore it, and it does not count as a line.',
    demo: { actor: 'none', target: 'none', glyph: '✏️' },
    tips: [
      'Doodle your plan! Click the pad on the card to draw.',
      'Comments survive Text copy and paste, and snippets.',
      'Write down which bot checks which pair. Future you at 3am will thank you.',
    ],
  },
};

export function peekTips(level: LevelDef): string[] {
  if (level.classical) return ['Peeking is safe on the day shift: these are boxes with one bit inside.', 'PEEK first, then IF on what you saw.', 'Three boxes and a vote beat one box and a gremlin.'];
  if (level.allowPeekData) return ['Peeking is allowed here.', 'Peeking at a bot never wakes a Qubble (it works just like LISTEN).', 'A peeked Qubble stays peeked: it picks one dream for good.'];
  return [
    'PEEK (wakes it!): looking at a Qubble wakes it, and its double-dream pops into one boring dream.',
    'Ask a bot instead: HIGHFIVE the Qubbles into a bot, then LISTEN to the bot.',
    'There\'s no undo: you can\'t rewind past a peek.',
    'PEEK at a bot instead of a Qubble and no Qubble is marked awake. It works just like LISTEN: a real measurement, so a bot tangled up with ONE Qubble\'s dream still disturbs it.',
  ];
}
