/**
 * Code layouts shared by the tiling and the lattice (pure data, no three.js).
 * Qubit numbering is 1-based (q1..q9), row-major on the 3×3 grid; Pauli strings are in data-qubit order.
 */
import { pauliLabel } from '../theme/math';
import { CODES } from '../../../quantum/qec';

export interface StabDef { type: 'X' | 'Z'; qubits: number[]; pauli: string; label: string; boundary: 'top' | 'bottom' | 'left' | 'right' | null }

/** Distance-3 rotated surface code [[9,1,3]], taken from the engine (src/quantum/qec.ts CODES.surface3) so the
 *  generator order matches NerdInfo.stabilizers. Layout row-major: q1 q2 q3 / q4 q5 q6 / q7 q8 q9. */
const S3 = CODES.surface3;
const support = (p: string) => [...p].map((c, i) => (c !== 'I' ? i + 1 : 0)).filter(Boolean);
const posOf = (q: number) => { const l = S3.layout?.[q - 1] ?? [Math.floor((q - 1) / 3), (q - 1) % 3]; return { r: l[0], c: l[1] }; };
const boundaryOf = (qs: number[]): StabDef['boundary'] => {
  if (qs.length !== 2) return null;
  const [a, b] = qs.map(posOf);
  if (a.r === b.r) return a.r === 0 ? 'top' : 'bottom';
  return a.c === 0 ? 'left' : 'right';
};
export const SURFACE_D3 = {
  n: S3.n,
  pos: posOf,
  stabilizers: S3.stabilizers.map((p): StabDef => { const qs = support(p); return { type: p.includes('X') ? 'X' : 'Z', qubits: qs, pauli: p, label: pauliLabel(p), boundary: boundaryOf(qs) }; }),
  logicals: { X: { type: 'X' as const, qubits: support(S3.logicals.X) }, Z: { type: 'Z' as const, qubits: support(S3.logicals.Z) } },
};

/** Shor [[9,1,3]] generators in data-qubit order. */
export const SHOR_GENERATORS = ['ZZIIIIIII', 'IZZIIIIII', 'IIIZZIIII', 'IIIIZZIII', 'IIIIIIZZI', 'IIIIIIIZZ', 'XXXXXXIII', 'IIIXXXXXX'];
export const BITFLIP3_GENERATORS = ['ZZI', 'IZZ'];
export const PHASEFLIP3_GENERATORS = ['XXI', 'IXX'];

export type PauliErr = { q: number; kind: 'X' | 'Y' | 'Z' };
/** Exact syndrome of a Pauli error pattern on a stabilizer list: −1 where the error anticommutes with the generator. */
export function syndromeOf(gens: string[], errors: PauliErr[]): number[] {
  return gens.map((g) => {
    let anti = 0;
    for (const e of errors) {
      const p = g[e.q - 1];
      if (p && p !== 'I' && p !== e.kind) anti ^= 1; // distinct non-identity Paulis anticommute
    }
    return anti ? -1 : 1;
  });
}
