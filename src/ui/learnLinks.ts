/**
 * "Learn more" links: turns textbook phrases in the post-win "Pros call this…" lines into links to
 * Qiskit docs / IBM Quantum Learning. Every URL here was checked to resolve (HTTP 200) on 2026-10-03.
 */
import { h } from '../engine/util';

const DOCS = 'https://quantum.cloud.ibm.com/docs/en';
const LEARN = 'https://quantum.cloud.ibm.com/learning/en/courses';
const QEC = `${LEARN}/foundations-of-quantum-error-correction`;
const BASICS = `${LEARN}/basics-of-quantum-information`;

/** Ordered: the first matching phrase in a region wins (longer, more specific phrases first). */
const LINKS: [RegExp, string, string][] = [
  [/conditional X gate|classically-controlled correction \(feed-forward\)|classical control flow(?: \(a goto\))?/i, `${DOCS}/guides/classical-feedforward-and-control-flow`, 'Qiskit guide: classical feedforward and control flow'],
  [/Shor 9-qubit code/i, `${QEC}/correcting-quantum-errors/shor-code`, 'IBM Quantum Learning: the 9-qubit Shor code'],
  [/error discretization|discretiz\w+ of errors/i, `${QEC}/correcting-quantum-errors/discretization-of-errors`, 'IBM Quantum Learning: discretization of errors'],
  [/3-qubit (?:bit-flip|phase-flip) code|3-(?:qubit|bit) repetition code|repetition code|error syndrome|parity check/i, `${QEC}/correcting-quantum-errors/repetition-codes`, 'IBM Quantum Learning: repetition codes'],
  [/no-cloning theorem/i, `${BASICS}/quantum-circuits/limitations-on-quantum-information`, 'IBM Quantum Learning: limitations on quantum information (no-cloning)'],
  [/Bell pair|entanglement/i, `${BASICS}/multiple-systems/quantum-information`, 'IBM Quantum Learning: multiple systems and entanglement'],
  [/measurement collapse/i, `${BASICS}/single-systems/quantum-information`, 'IBM Quantum Learning: measuring a qubit'],
  [/CNOT(?: gate)?/, `${DOCS}/api/qiskit/qiskit.circuit.library.CXGate`, 'Qiskit docs: CXGate (CNOT)'],
  [/Hadamard gate(?: \(H\))?/i, `${DOCS}/api/qiskit/qiskit.circuit.library.HGate`, 'Qiskit docs: HGate'],
  [/Pauli-X(?: \(NOT\))? gate/i, `${DOCS}/api/qiskit/qiskit.circuit.library.XGate`, 'Qiskit docs: XGate'],
  [/Pauli-Z(?: \(phase flip\))? gate|Z \(phase-flip\) error/i, `${DOCS}/api/qiskit/qiskit.circuit.library.ZGate`, 'Qiskit docs: ZGate'],
  [/mid-circuit measurement and reset|resetting an ancilla qubit/i, `${DOCS}/guides/measure-qubits`, 'Qiskit guide: measure qubits (mid-circuit measurement)'],
  [/measuring an ancilla(?: \(reading the syndrome\))?|a measurement \(in the Z basis\)|measurement(?= plus)/i, `${DOCS}/guides/measure-qubits`, 'Qiskit guide: measure qubits'],
  [/threshold idea|fault-tolerant thinking|core loop of quantum error correction/i, QEC, 'IBM Quantum Learning: Foundations of quantum error correction'],
];

/** Split `text` into plain strings and <a> links for every known phrase. */
export function linkify(text: string): (string | HTMLElement)[] {
  const out: (string | HTMLElement)[] = [];
  let rest = text;
  while (rest) {
    let best: { i: number; len: number; url: string; title: string } | null = null;
    for (const [re, url, title] of LINKS) {
      const m = rest.match(re);
      if (m && m.index != null && (!best || m.index < best.i)) best = { i: m.index, len: m[0].length, url, title };
    }
    if (!best) { out.push(rest); break; }
    if (best.i) out.push(rest.slice(0, best.i));
    out.push(h('a', { class: 'learn-link', href: best.url, target: '_blank', rel: 'noopener noreferrer', title: `${best.title} ↗` }, rest.slice(best.i, best.i + best.len)));
    rest = rest.slice(best.i + best.len);
  }
  return out;
}

export const LEARN_MORE = { url: QEC, label: 'Want the real thing? IBM Quantum Learning: Foundations of quantum error correction ↗' };
