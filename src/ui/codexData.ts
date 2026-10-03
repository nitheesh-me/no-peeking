/**
 * The Codex: every character, enemy, element, object and card in the daycare.
 * Entries unlock when the player clicks / meets them in the game (see unlocks.ts + level.ts interact()).
 * Flavor = the game voice (Schrödi deadpan, gremlins in brainrot). Real = accurate physics in plain words
 * (phrases that match src/ui/learnLinks.ts become "learn more" links).
 */
import type { OpName } from '../core/contracts';
import { CARD_GUIDE } from './cardGuide';

export type CodexCat = 'characters' | 'enemies' | 'elements' | 'objects' | 'cards';
export type CodexView =
  | 'caretaker' | 'schrodi' | 'qubble' | 'databox' | 'bot'
  | 'flipper' | 'phasey' | 'wobbles'
  | 'sunny' | 'moony' | 'swirl' | 'silk' | 'lights'
  | 'blanket' | 'bed' | 'sign' | 'flashlight' | 'box' | 'window' | 'clock' | 'door'
  | 'card';

export interface CodexEntry {
  id: string;
  cat: CodexCat;
  name: string;
  view: CodexView;
  op?: OpName;
  /** voice line in the game's voice (who says it) */
  flavor: string;
  by: 'schrodi' | 'flipper' | 'phasey' | 'wobbles' | 'qubble' | 'system';
  /** "In real life: …" */
  real: string;
  /** how to find it (shown on the locked card) */
  hint: string;
  /** what clicking the live view does */
  play: string;
}

export const CODEX_CATS: { id: CodexCat; name: string; icon: string }[] = [
  { id: 'characters', name: 'Characters', icon: '🧸' },
  { id: 'enemies', name: 'Enemies', icon: '😈' },
  { id: 'elements', name: 'Elements', icon: '✨' },
  { id: 'objects', name: 'Objects', icon: '🛏' },
  { id: 'cards', name: 'Cards', icon: '🃏' },
];

const BASE: CodexEntry[] = [
  // ───────── characters ─────────
  { id: 'caretaker', cat: 'characters', name: 'The Caretaker', view: 'caretaker', by: 'schrodi',
    flavor: 'That\'s you. Pyjamas, nightcap, zero qualifications. Perfect.',
    real: 'You play the control system of a quantum computer: the classical electronics that fire gates (microwave or laser pulses) at qubits, read out measurements, and decide what to do next.',
    hint: 'found by clicking the caretaker in the daycare', play: 'click to cycle actions' },
  { id: 'schrodi', cat: 'characters', name: 'Schrödi', view: 'schrodi', by: 'schrodi',
    flavor: 'I am in a box. I am out of a box. Please stop asking which.',
    real: 'Named after Schrödinger\'s famous thought experiment about a cat that is "both alive and dead" until someone looks. It was meant as a joke about how strange superposition sounds when you scale it up to everyday things.',
    hint: 'found by clicking Schrödi in the daycare', play: 'click to cycle his checklist moves' },
  { id: 'qubble', cat: 'characters', name: 'Qubble', view: 'qubble', by: 'qubble',
    flavor: '*mumble* …dreaming of Sunny… and Moony… both… zzz',
    real: 'A Qubble is a qubit: a two-level quantum system (an atom, an ion, a tiny superconducting circuit). Its state can be any mix of |0⟩ and |1⟩ with a phase, which the game draws as the dream colour and the swirl.',
    hint: 'found by gently poking a sleeping Qubble', play: 'click to change mood · drag the dial to change the dream' },
  { id: 'databox', cat: 'characters', name: 'Data box', view: 'databox', by: 'schrodi',
    flavor: 'A box with one bit inside. Peek all you like. It\'s the day shift.',
    real: 'A classical bit: always exactly 0 or 1. Looking at it changes nothing, and copying it is easy. That\'s why classical error correction can simply copy and vote (a repetition code).',
    hint: 'found by clicking a box on the day shift (chapter 0)', play: 'click to flip it over' },
  { id: 'bot', cat: 'characters', name: 'Ancillabot', view: 'bot', by: 'system',
    flavor: 'Beep boop. I high-five, I listen, I tell you who got flipped. Union rules: no peeking.',
    real: 'An ancilla qubit: a helper qubit. CNOT gates copy the parity of two data qubits onto it, and measuring it gives an error syndrome without measuring the data itself.',
    hint: 'found by clicking a bot in the daycare', play: 'click to cycle actions and lights' },

  // ───────── enemies ─────────
  { id: 'flipper', cat: 'enemies', name: 'Flipper', view: 'flipper', by: 'flipper',
    flavor: 'flip flip skibidi, ur Sunny is Moony now, no cap 💀',
    real: 'A bit-flip error (the Pauli-X gate applied by accident). Stray heat or crosstalk can kick a qubit from |0⟩ to |1⟩. The 3-qubit bit-flip code catches one of these per block.',
    hint: 'found by clicking Flipper in X-ray during a night', play: 'click to cycle poses' },
  { id: 'phasey', cat: 'enemies', name: 'Phasey', view: 'phasey', by: 'phasey',
    flavor: 'ur swirl? reversed. ur vibes? reversed. u can\'t even see me, it\'s giving ghost 👻',
    real: 'A phase-flip error, a Z (phase-flip) error. It reverses the swirl but leaves |0⟩ and |1⟩ alone, so you can\'t see it with a plain measurement. Classical bits have no such error at all.',
    hint: 'found by clicking Phasey in X-ray during a night', play: 'click to cycle poses' },
  { id: 'wobbles', cat: 'enemies', name: 'Wobbles', view: 'wobbles', by: 'wobbles',
    flavor: 'just a lil nudge bestie, a tiny rotation, totally not sus 🫠',
    real: 'A small, continuous over-rotation. The surprise of quantum error correction (error discretization): measuring the syndrome forces the wobble to become either "no error" or "a full flip", which the code can fix.',
    hint: 'found by clicking Wobbles in X-ray during a night', play: 'click to cycle poses' },

  // ───────── elements ─────────
  { id: 'sunny', cat: 'elements', name: 'Sunny dream |0⟩', view: 'sunny', by: 'schrodi',
    flavor: 'Warm. Yellow. Boring in the best way.',
    real: 'The |0⟩ state: the "north pole" of the Bloch sphere. Measuring it gives 0 every time.',
    hint: 'found by clicking a Sunny Qubble in X-ray (or peeking a 0 box)', play: 'click to change mood' },
  { id: 'moony', cat: 'elements', name: 'Moony dream |1⟩', view: 'moony', by: 'schrodi',
    flavor: 'Purple. Mysterious. Still just one bit.',
    real: 'The |1⟩ state: the "south pole" of the Bloch sphere. Measuring it gives 1 every time. A Pauli-X gate swaps it with |0⟩.',
    hint: 'found by clicking a Moony Qubble in X-ray (or peeking a 1 box)', play: 'click to change mood' },
  { id: 'swirl', cat: 'elements', name: 'The Swirl', view: 'swirl', by: 'qubble',
    flavor: 'Sunny AND Moony at once, spinning one way. *happy wiggle*',
    real: 'A superposition such as |+⟩ = (|0⟩+|1⟩)/√2, made by the Hadamard gate. The swirl direction is the relative phase: invisible to a plain measurement, but it changes what happens next. Measuring makes it pick 0 or 1 at random (measurement collapse).',
    hint: 'found by clicking a swirly Qubble in X-ray', play: 'click to reverse the swirl' },
  { id: 'silk', cat: 'elements', name: 'Silk thread', view: 'silk', by: 'schrodi',
    flavor: 'They share one dream between them. Neither has it alone. Very romantic. Very annoying.',
    real: 'Entanglement: two qubits in a joint state (like a Bell pair) where neither has a state of its own. Error-correcting codes spread one logical qubit across many entangled qubits so no single error can read or ruin it.',
    hint: 'found by clicking a Qubble with a silk thread showing in X-ray', play: 'click to tug the thread' },
  { id: 'lights', cat: 'elements', name: 'BEEP / QUIET', view: 'lights', by: 'system',
    flavor: 'Red means BEEP. Green means QUIET. Nobody knows what the off light means. (Not asked yet.)',
    real: 'Measurement results of the ancilla qubits: the error syndrome. Each bit says whether a pair of data qubits agrees. Together they point at the error without revealing the data.',
    hint: 'found by LISTENing to a bot (or clicking a lit bot)', play: 'click to cycle the light' },

  // ───────── objects ─────────
  { id: 'blanket', cat: 'objects', name: 'Blanket', view: 'blanket', by: 'schrodi',
    flavor: 'Hand-quilted. Opaque. The single most important piece of physics equipment in this room.',
    real: 'The blanket is the rule that you can\'t look at quantum data without disturbing it. Every look is a measurement. Hiding the state is the whole game: codes learn about errors, never about the data.',
    hint: 'found by poking a Qubble under its blanket', play: 'click to lift it (X-ray)' },
  { id: 'bed', cat: 'objects', name: 'Bed', view: 'bed', by: 'schrodi',
    flavor: 'Every Qubble gets one. Mattress, pillow, strict lights-out.',
    real: 'Real qubits need a very quiet "bed": superconducting qubits sit in fridges colder than outer space, ions float in vacuum traps. Less noise means fewer gremlins.',
    hint: 'found by clicking the foot of a Qubble\'s bed', play: 'click for day / night' },
  { id: 'sign', cat: 'objects', name: 'Wall signs', view: 'sign', by: 'schrodi',
    flavor: 'Daycare policy. Laminated. Legally binding (not really).',
    real: 'The signs state the rules of quantum mechanics the level teaches: looking is measuring, there\'s no copying (the no-cloning theorem), and sharing (entanglement) is how codes protect data.',
    hint: 'found by clicking a sign on the wall', play: 'type your own sign' },
  { id: 'flashlight', cat: 'objects', name: 'Flashlight', view: 'flashlight', by: 'schrodi',
    flavor: 'For peeking. Please don\'t.',
    real: 'Measurement. Reading a qubit in the Z basis gives 0 or 1 and destroys any superposition. On real hardware it\'s a resonator probe or a laser that makes the atom glow.',
    hint: 'found by watching the caretaker PEEK', play: 'click to peek' },
  { id: 'box', cat: 'objects', name: 'Schrödi\'s box', view: 'box', by: 'schrodi',
    flavor: 'Mine. Cardboard. Superior.',
    real: 'In the thought experiment the box hides the cat, which stands for keeping a system isolated. Isolation is exactly what qubits need: any leak of information to the outside world (decoherence) acts like a peek.',
    hint: 'found by moving Schrödi\'s box (drag it)', play: 'click to hop in and out' },
  { id: 'window', cat: 'objects', name: 'Window', view: 'window', by: 'schrodi',
    flavor: 'Day outside, night outside. Gremlins prefer night. So do I.',
    real: 'The world outside is the environment. Qubits interacting with it pick up noise and lose their quantum behaviour over time (their coherence time), which is why errors pile up during the night.',
    hint: 'found by clicking the window', play: 'click for day / night' },
  { id: 'clock', cat: 'objects', name: 'Clock', view: 'clock', by: 'schrodi',
    flavor: 'It says nap o\'clock. It always says nap o\'clock.',
    real: 'Time is the enemy: the longer a computation runs, the more errors creep in. Error correction has to find and fix errors faster than they appear (the threshold idea).',
    hint: 'found by clicking the clock', play: 'click for day / night' },
  { id: 'door', cat: 'objects', name: 'Door', view: 'door', by: 'schrodi',
    flavor: 'Locked. Gremlins come in anyway. Don\'t ask how.',
    real: 'No shielding is perfect. Cosmic rays, stray photons and tiny vibrations always get in, so instead of keeping every error out, quantum computers detect and correct the errors that do get in.',
    hint: 'found by clicking the door', play: 'click for day / night' },
];

const CARD_ORDER: OpName[] = ['BOOP', 'SHUSH', 'SPIN', 'HIGHFIVE', 'LISTEN', 'RESET', 'PEEK', 'IF', 'JUMP', 'LABEL', 'END', 'NOTE'];
const CARD_REAL: Record<OpName, string> = {
  BOOP: 'BOOP is the Pauli-X (NOT) gate: it swaps |0⟩ and |1⟩.',
  SHUSH: 'SHUSH is the Pauli-Z (phase flip) gate: it flips the sign of |1⟩, reversing the swirl.',
  SPIN: 'SPIN is the Hadamard gate (H): it turns |0⟩ into an equal superposition and back.',
  HIGHFIVE: 'HIGHFIVE is the CNOT gate: it flips the target if the control is |1⟩. On a superposition it creates entanglement instead of a copy.',
  LISTEN: 'LISTEN is measuring an ancilla (reading the syndrome): safe, because the ancilla only holds parity information.',
  RESET: 'RESET is mid-circuit measurement and reset: it puts a used ancilla back to |0⟩ so it can be reused.',
  PEEK: 'PEEK is a measurement (in the Z basis). On a data qubit it destroys the superposition you were trying to protect.',
  IF: 'IF is classically-controlled correction (feed-forward): later gates depend on earlier measurement results.',
  JUMP: 'JUMP is classical control flow (a goto) in the control computer.',
  LABEL: 'LABEL marks a place in the classical program. It does nothing to the qubits.',
  END: 'END stops the program. The qubits keep their state for the morning check.',
  NOTE: 'Comments are for humans. Real quantum programs have them too (they are very much needed).',
};

export const CODEX: CodexEntry[] = [
  ...BASE,
  ...CARD_ORDER.map((op): CodexEntry => ({
    id: 'card-' + op, cat: 'cards', name: op === 'NOTE' ? 'COMMENT card' : `${op} card`, view: 'card', op, by: 'schrodi',
    flavor: CARD_GUIDE[op].what,
    real: CARD_REAL[op],
    hint: op === 'LABEL' ? 'found by placing a LABEL (or an IF/JUMP) in a program' : `found by placing a ${op === 'NOTE' ? 'COMMENT' : op} card in a program`,
    play: 'click to replay the demo',
  })),
];
