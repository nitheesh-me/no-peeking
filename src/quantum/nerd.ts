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

export type StabDef = { label: string; x: string[]; z: string[]; code: boolean };

/** Apply a unitary target circuit (BOOP/SHUSH/SPIN/HIGHFIVE) to a fresh state with `input` on the level's input Qubble. */
function idealState(level: LevelDef, theta: number): QState | null {
  const goal = level.goal;
  if (goal.kind === 'classical' || !goal.targetCircuit) return null;
  const s = new QState();
  s.prepare(level.inputQubble, theta, 0);
  for (const o of goal.targetCircuit) {
    switch (o.op) {
      case 'BOOP': s.x(o.t); break;
      case 'SHUSH': s.z(o.t); break;
      case 'SPIN': s.h(o.t); break;
      case 'HIGHFIVE': s.cnot(o.from, o.to); break;
      case 'NOTE': case 'LABEL': break;
      default: return null;
    }
  }
  return s;
}

/**
 * Pauli checks for a level, each flagged `code: true` iff it stabilizes the level's ideal target for EVERY input
 * (checked on inputs |0⟩ and |1⟩, which suffices by linearity): those are the code's stabilizers.
 * Shor-9 levels (9 Qubbles): the 8 standard generators only. Other levels: ZᵢZⱼ then XᵢXⱼ on neighbouring Qubbles
 * (placement order), code stabilizers first. Non-code checks stay as contrast (e.g. ⟨X₁X₂⟩ = 0 on the bit-flip code).
 */
export function stabilizerSet(level: LevelDef): StabDef[] {
  const qs = level.qubbles.map(p => p.id as string).filter(isQubble);
  const out: StabDef[] = [];
  const add = (P: 'X' | 'Z', ids: string[]) => {
    const label = pauliLabel(P, ids);
    if (!out.some(o => o.label === label)) out.push({ label, x: P === 'X' ? ids : [], z: P === 'Z' ? ids : [], code: false });
  };
  if (qs.length === 9) {
    for (const b of [0, 3, 6]) { add('Z', [qs[b], qs[b + 1]]); add('Z', [qs[b + 1], qs[b + 2]]); }
    add('X', qs.slice(0, 6)); add('X', qs.slice(3, 9));
  } else {
    for (let i = 0; i + 1 < qs.length; i++) add('Z', [qs[i], qs[i + 1]]);
    for (let i = 0; i + 1 < qs.length; i++) add('X', [qs[i], qs[i + 1]]);
  }
  let probes: QState[] = [];
  try { const a = idealState(level, 0), b = idealState(level, Math.PI); if (a && b) probes = [a, b]; } catch { probes = []; }
  for (const o of out) o.code = probes.length > 0 && probes.every(p => pauliExpectation(p, o.x, o.z) > 1 - 1e-9);
  return [...out.filter(o => o.code), ...out.filter(o => !o.code)];
}

// ───────────── ideal decoder (lookup table) ─────────────
export type DecoderRow = { syndrome: string; fix: string; x: string[]; z: string[] };
/**
 * Minimum-weight lookup decoder for the level's code: syndrome (one bit per code generator, in `gens` order;
 * bit 1 ⇔ the generator reads −1) → the weight-≤1 Pauli correction (X, then Z, then Y per Qubble; the first
 * error with a given syndrome wins, so degenerate errors like Z₁/Z₂ on Shor-9 share one row).
 * Null if the level has fewer than 2 code generators (nothing to correct: a distance-≤2 code only detects).
 */
export function codeDecoder(stabs: StabDef[]): { gens: string[]; rows: DecoderRow[] } | null {
  const gens = stabs.filter(s => s.code);
  if (gens.length < 2) return null;
  const qs: string[] = [];
  for (const g of gens) for (const q of [...g.x, ...g.z]) if (!qs.includes(q)) qs.push(q);
  qs.sort((a, b) => +a.slice(1) - +b.slice(1));
  const synOf = (x: string[], z: string[]) => gens.map(g => {
    const n = x.filter(q => g.z.includes(q)).length + z.filter(q => g.x.includes(q)).length;
    return n & 1 ? '1' : '0';
  }).join('');
  const rows: DecoderRow[] = [{ syndrome: synOf([], []), fix: 'I', x: [], z: [] }];
  const cands: { fix: string; x: string[]; z: string[] }[] = [];
  for (const P of ['X', 'Z', 'Y'] as const) for (const q of qs)
    cands.push({ fix: P + sub(q), x: P === 'Z' ? [] : [q], z: P === 'X' ? [] : [q] });
  for (const c of cands) { const syn = synOf(c.x, c.z); if (!rows.some(r => r.syndrome === syn)) rows.push({ syndrome: syn, ...c }); }
  return { gens: gens.map(g => g.label), rows };
}

/**
 * How does the correction C the player's code applied compare with the decoder's fix F (both Paulis on Qubbles,
 * signs ignored)? With R = C·F:
 *  'same'       C = F;
 *  'equivalent' R is in the stabilizer group (e.g. Shor-9: Z₄X₅ vs Y₅ differ by Z₄Z₅): the same final state;
 *  'logical'    R commutes with every generator but is not in the group: a logical error relative to the decoder;
 *  'wrong'      R anticommutes with some generator: the code space is not restored.
 * Only the code generators (`code: true`) are used; null if there are none.
 */
export function fixVerdict(stabs: StabDef[], c: { x: string[]; z: string[] }, f: { x: string[]; z: string[] }): 'same' | 'equivalent' | 'logical' | 'wrong' | null {
  const gens = stabs.filter(s => s.code);
  if (!gens.length) return null;
  const qs: string[] = [];
  for (const p of [...gens.flatMap(g => [...g.x, ...g.z]), ...c.x, ...c.z, ...f.x, ...f.z]) if (!qs.includes(p)) qs.push(p);
  const m = (ids: string[]) => ids.reduce((a, q) => a ^ (1 << qs.indexOf(q)), 0);
  const rx = m(c.x) ^ m(f.x), rz = m(c.z) ^ m(f.z);
  if (rx === 0 && rz === 0) return 'same';
  const G = gens.map(g => ({ x: m(g.x), z: m(g.z) }));
  if (G.some(g => (popcount(rx & g.z) + popcount(rz & g.x)) & 1)) return 'wrong';
  for (let k = 1; k < 1 << G.length; k++) {
    let gx = 0, gz = 0;
    G.forEach((g, i) => { if (k & (1 << i)) { gx ^= g.x; gz ^= g.z; } });
    if (gx === rx && gz === rz) return 'equivalent';
  }
  return 'logical';
}

/** E|t⟩ for a Pauli E = X_{x} Z_{z} (global phase dropped), t indexed like Target (ids[k] ⇔ bit k). */
function applyPauliVec(ids: string[], re: Float64Array, im: Float64Array, x: string[], z: string[]): { re: Float64Array; im: Float64Array } | null {
  let xm = 0, zm = 0;
  for (const q of x) { const k = ids.indexOf(q); if (k < 0) return null; xm |= 1 << k; }
  for (const q of z) { const k = ids.indexOf(q); if (k < 0) return null; zm |= 1 << k; }
  const N = re.length, r2 = new Float64Array(N), i2 = new Float64Array(N);
  for (let i = 0; i < N; i++) { const sg = popcount(i & zm) & 1 ? -1 : 1; r2[i ^ xm] = sg * re[i]; i2[i ^ xm] = sg * im[i]; }
  return { re: r2, im: i2 };
}

/**
 * The decoder's "corrected-target images" E_s|t⟩, one per syndrome (mutually orthogonal), carried along the data
 * qubits' Clifford FRAME: every non-Pauli gate acting on data qubits only (SPIN on a Qubble,
 * HIGHFIVE Qubble→Qubble) after the night started is applied to the images too (`recoverFrame`). So the phase code's
 * morning SPIN layer or Shor-9's decode / re-encode don't make a perfectly recoverable state look lost.
 * Paulis are not tracked (a Pauli maps an image of the code to an image of the same code: still recoverable).
 * `active` is false during bedtime (the code isn't built yet: no `recoverable`).
 */
export type RecoverImages = { ids: string[]; imgs: { re: Float64Array; im: Float64Array }[]; active: boolean };
/** Track one executed gate in the decoder frame (see RecoverImages). Returns true if the images changed. */
export function recoverFrame(r: RecoverImages, g: { op: string; t: string; from?: string }): boolean {
  if (!r.active) return false;
  if (g.op === 'SPIN') {
    const k = r.ids.indexOf(g.t); if (k < 0) return false;
    const m = 1 << k, S = Math.SQRT1_2;
    for (const v of r.imgs) for (let i = 0; i < v.re.length; i++) if (!(i & m)) {
      const j = i | m, ar = v.re[i], ai = v.im[i], br = v.re[j], bi = v.im[j];
      v.re[i] = S * (ar + br); v.im[i] = S * (ai + bi); v.re[j] = S * (ar - br); v.im[j] = S * (ai - bi);
    }
    return true;
  }
  if (g.op === 'HIGHFIVE' && g.from) {
    const kc = r.ids.indexOf(g.from), kt = r.ids.indexOf(g.t); if (kc < 0 || kt < 0) return false;
    const mc = 1 << kc, mt = 1 << kt;
    for (const v of r.imgs) for (let i = 0; i < v.re.length; i++) if ((i & mc) && !(i & mt)) {
      const j = i | mt; let x = v.re[i]; v.re[i] = v.re[j]; v.re[j] = x; x = v.im[i]; v.im[i] = v.im[j]; v.im[j] = x;
    }
    return true;
  }
  return false;
}
export function recoverImages(stabs: StabDef[], target: { ids: string[]; re: Float64Array; im: Float64Array }): RecoverImages | null {
  const dec = codeDecoder(stabs);
  if (!dec) return null;
  const imgs: RecoverImages['imgs'] = [];
  for (const r of dec.rows) { const v = applyPauliVec(target.ids, target.re, target.im, r.x, r.z); if (!v) return null; imgs.push(v); }
  return { ids: target.ids, imgs, active: false };
}
/** Above this many live qubits `recoverable` is not computed (cost = #syndromes × 2^live). */
export const NERD_RECOVER_MAX_LIVE = 14;
/**
 * Recoverable fidelity: the fidelity the data would have AFTER a perfect round of syndrome measurement + lookup
 * correction, F_rec = Σ_s ⟨t|E_s Π_s ρ Π_s E_s|t⟩ = Σ_s ⟨t_s|ρ_data|t_s⟩ with t_s = E_s|t⟩ (since Π_s E_s|t⟩ = E_s|t⟩).
 * 1 after any single correctable error (and after any wobble: error discretization), < 1 after two flips.
 */
export function recoverableFidelity(s: QState, r: RecoverImages): number | undefined {
  if (!r.active || s.n > NERD_RECOVER_MAX_LIVE) return undefined;
  let f = 0;
  for (const v of r.imgs) f += s.fidelityPure(r.ids, v.re, v.im);
  return Math.min(1, Math.max(0, f));
}

export interface NerdCtx {
  ids: QubitId[];
  stabs: StabDef[];
  record: { who: QubitId; bit: 0 | 1 }[];
  fidelity?: number;
  /** decoder images of the ideal target (see recoverableFidelity); absent ⇒ no `recoverable` */
  recover?: RecoverImages | null;
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

  const stabilizers = c.stabs.map(t => ({ label: t.label, value: pauliExpectation(s, t.x, t.z), code: t.code }));
  const recoverable = c.recover ? recoverableFidelity(s, c.recover) : undefined;
  return {
    order: [...ids], amps, truncated, reduced, mi, stabilizers,
    ...(c.fidelity !== undefined ? { fidelity: c.fidelity } : {}),
    ...(recoverable !== undefined ? { recoverable } : {}),
    record: c.record.slice(), miScope, liveQubits: live,
  };
}
