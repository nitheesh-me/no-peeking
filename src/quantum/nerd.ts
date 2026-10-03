/**
 * NO PEEKING! — Nerd-mode info (Schrödi's Lab Notebook). Computed only when runNight is called
 * with { nerd: true }. Definitions, units and caps: docs/QUANTUM_NOTES.md § "Nerd info".
 */
import type { LevelDef, NerdInfo, QubitId } from '../core/contracts';
import { isQubble } from '../core/contracts';
import { QState, entropy1, popcount } from './sim';

/** Max amplitudes listed in NerdInfo.amps. */
export const NERD_MAX_AMPS = 256;
/** |amp|² below this is not listed. */
export const NERD_AMP_EPS = 1e-9;
/** Above this many live qubits the MI matrix is restricted to data-qubit pairs. */
export const NERD_MI_MAX_LIVE = 10;

/** NerdInfo plus fields not (yet) in the shared contract. `miScope: 'data'` ⇒ bot rows/cols of `mi` are 0 off the diagonal (not computed). */
export type NerdInfoX = NerdInfo & { miScope: 'all' | 'data'; liveQubits: number };

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (id: string) => id.replace(/^q/, '').replace(/\d/g, d => SUB[+d]);
export const pauliLabel = (P: 'X' | 'Z', ids: string[]) => ids.map(q => P + sub(q)).join('');

/**
 * ⟨ψ| X_{xs} Z_{zs} |ψ⟩ for disjoint qubit sets xs (X) and zs (Z). Exact, real.
 * A classical (detached) qubit in xs gives 0; in zs it gives the factor (−1)^bit.
 */
export function pauliExpectation(s: QState, xs: string[], zs: string[]): number {
  let xm = 0, zm = 0, sign = 1;
  for (const q of xs) { if (!s.isActive(q)) return 0; xm |= 1 << s.pos.get(q)!; }
  for (const q of zs) { const c = s.classical(q); if (c !== null) { if (c) sign = -sign; } else zm |= 1 << s.pos.get(q)!; }
  const re = s.re, im = s.im, N = re.length;
  let acc = 0;
  for (let i = 0; i < N; i++) {
    const j = i ^ xm;
    const v = re[j] * re[i] + im[j] * im[i]; // Re(conj(ψ_j) ψ_i)
    acc += popcount(i & zm) & 1 ? -v : v;
  }
  return sign * acc;
}

/**
 * ⟨ψ|P|ψ⟩ for a Pauli string over `ids` (char i ↔ ids[i], 'I'/'X'/'Y'/'Z'; Y = iXZ). Exact, real.
 * Classical (detached) qubits: X/Y give 0, Z gives (−1)^bit.
 */
export function expectPauliString(s: QState, str: string, ids: string[]): number {
  let xm = 0, zm = 0, ny = 0, sign = 1;
  for (let k = 0; k < str.length; k++) {
    const c = str[k], q = ids[k];
    if (c === 'I') continue;
    const cl = s.classical(q);
    if (cl !== null) { if (c !== 'Z') return 0; if (cl) sign = -sign; continue; }
    const m = 1 << s.pos.get(q)!;
    if (c === 'X' || c === 'Y') xm |= m;
    if (c === 'Z' || c === 'Y') zm |= m;
    if (c === 'Y') ny++;
  }
  // P|i⟩ = i^ny (−1)^{|i∧zm|} |i⊕xm⟩  ⇒  ⟨P⟩ = i^ny Σ_i (−1)^{|i∧zm|} conj(ψ_{i⊕xm}) ψ_i
  const re = s.re, im = s.im, N = re.length;
  let ar = 0, ai = 0;
  for (let i = 0; i < N; i++) {
    const j = i ^ xm, sg = popcount(i & zm) & 1 ? -1 : 1;
    ar += sg * (re[j] * re[i] + im[j] * im[i]);
    ai += sg * (re[j] * im[i] - im[j] * re[i]);
  }
  const ph = ny & 3; // i^ny · (ar + i·ai), real part
  return sign * (ph === 0 ? ar : ph === 1 ? -ai : ph === 2 ? -ar : ai);
}

/**
 * Stabilizer list for a level: ZZ then XX on neighbouring Qubbles (placement order), plus Shor-9 generators for 9-Qubble
 * levels. `custom` (DLC: the code's generators as I/X/Z strings in Qubble order, e.g. 'XZZXI') replaces all of that.
 */
export function stabilizerSet(level: LevelDef, custom?: string[]): { label: string; x: string[]; z: string[] }[] {
  const qs = level.qubbles.map(p => p.id as string).filter(isQubble);
  const at = (str: string, c: string) => qs.filter((_, i) => str[i] === c);
  if (custom) return custom.map(str => ({ label: [...str].map((c, i) => c === 'I' ? '' : c + sub(qs[i])).join(''), x: at(str, 'X'), z: at(str, 'Z') }));
  const out: { label: string; x: string[]; z: string[] }[] = [];
  const add = (P: 'X' | 'Z', ids: string[]) => {
    const label = pauliLabel(P, ids);
    if (!out.some(o => o.label === label)) out.push({ label, x: P === 'X' ? ids : [], z: P === 'Z' ? ids : [] });
  };
  if (qs.length === 9) {
    for (const b of [0, 3, 6]) { add('Z', [qs[b], qs[b + 1]]); add('Z', [qs[b + 1], qs[b + 2]]); }
    add('X', qs.slice(0, 6)); add('X', qs.slice(3, 9));
  }
  for (let i = 0; i + 1 < qs.length; i++) add('Z', [qs[i], qs[i + 1]]);
  for (let i = 0; i + 1 < qs.length; i++) add('X', [qs[i], qs[i + 1]]);
  return out;
}

export interface NerdCtx {
  ids: QubitId[];
  stabs: { label: string; x: string[]; z: string[] }[];
  record: { who: QubitId; bit: 0 | 1 }[];
  fidelity?: number;
  /** shared MI cache (keys 'a,b' in ids order), optional */
  miCache?: Map<string, number>;
  blochCache?: Map<string, { x: number; y: number; z: number }>;
}

export function computeNerd(s: QState, c: NerdCtx): NerdInfoX {
  const ids = c.ids, n = ids.length;
  // ── amplitudes ──
  const re = s.re, im = s.im, N = re.length;
  const idx: number[] = [];
  for (let i = 0; i < N; i++) if (re[i] * re[i] + im[i] * im[i] > NERD_AMP_EPS) idx.push(i);
  const p = (i: number) => re[i] * re[i] + im[i] * im[i];
  idx.sort((a, b) => p(b) - p(a) || a - b);
  const truncated = idx.length > NERD_MAX_AMPS;
  const top = truncated ? idx.slice(0, NERD_MAX_AMPS) : idx;
  let cr = 1, ci = 0; // global phase: largest amplitude real-positive
  if (top.length) { const m = Math.hypot(re[top[0]], im[top[0]]); cr = re[top[0]] / m; ci = -im[top[0]] / m; }
  const bitOf = (q: string, i: number) => { const v = s.classical(q); return v !== null ? v : (i >> s.pos.get(q)!) & 1; };
  const amps = top.map(i => ({
    ket: ids.map(q => bitOf(q, i)).join(''),
    re: re[i] * cr - im[i] * ci, im: re[i] * ci + im[i] * cr,
  }));

  // ── reduced states ──
  const reduced = {} as NerdInfo['reduced'];
  const S: number[] = [];
  for (const q of ids) {
    let b = c.blochCache?.get(q);
    if (!b) { b = s.bloch(q); c.blochCache?.set(q, b); }
    const r2 = Math.min(1, b.x * b.x + b.y * b.y + b.z * b.z);
    const e = entropy1(b);
    S.push(e);
    reduced[q] = { x: b.x, y: b.y, z: b.z, purity: (1 + r2) / 2, entropy: e };
  }

  // ── mutual information ──
  const live = s.n;
  const miScope: 'all' | 'data' = live > NERD_MI_MAX_LIVE ? 'data' : 'all';
  const mi = ids.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    mi[i][i] = 2 * S[i];
    for (let j = i + 1; j < n; j++) {
      if (miScope === 'data' && !(isQubble(ids[i]) && isQubble(ids[j]))) continue;
      if (S[i] < 1e-9 || S[j] < 1e-9) continue; // I(A:B) ≤ 2·min(S_A, S_B)
      const key = ids[i] + ',' + ids[j];
      let v = c.miCache?.get(key);
      if (v === undefined) { v = s.mutualInfo(ids[i], ids[j]); c.miCache?.set(key, v); }
      mi[i][j] = mi[j][i] = v;
    }
  }

  const stabilizers = c.stabs.map(t => ({ label: t.label, value: pauliExpectation(s, t.x, t.z) }));
  return {
    order: [...ids], amps, truncated, reduced, mi, stabilizers,
    ...(c.fidelity !== undefined ? { fidelity: c.fidelity } : {}),
    record: c.record.slice(), miScope, liveQubits: live,
  };
}
