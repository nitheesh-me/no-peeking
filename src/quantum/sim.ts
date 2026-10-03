/**
 * NO PEEKING! — state-vector simulator (Quantum Expert).
 *
 * CONVENTIONS (see docs/QUANTUM_NOTES.md):
 *  - Amplitudes are stored in two Float64Arrays (re, im) of length 2^n.
 *  - Each *active* qubit owns one bit of the basis index (little-endian: bit k ⇔ 1<<k).
 *    The mapping id → bit is dynamic (see below); callers only ever use string ids.
 *  - Single-qubit states: |ψ> = cos(θ/2)|0> + e^{iφ} sin(θ/2)|1>.
 *  - Bloch vector: ρ = (I + xX + yY + zZ)/2, so x = 2Re ρ01, y = −2Im ρ01, z = ρ00 − ρ11.
 *  - Gates: X, Y, Z, H, CNOT exactly; Rx(θ) = exp(−iθX/2), Rz(θ) = exp(−iθZ/2).
 *
 * DYNAMIC REGISTER (the main speed trick):
 *  A qubit that has never been touched is |0> and is NOT stored. A qubit that has just been
 *  measured (or reset) is in an exact product state |r> with everything else, so we DETACH it:
 *  the state vector halves and we remember the classical value r. Gates that keep a detached
 *  qubit classical (X, Y, Z, CNOT controlled by a detached qubit) never re-attach it; anything
 *  else re-attaches it as |r>. This is exact (no approximation) and keeps Shor-9 + ancillas
 *  at ≤ ~11 live qubits when ancillas are LISTENed after use.
 */

export type Rng = () => number;

/** mulberry32 — tiny, fast, deterministic PRNG in [0,1). */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix two integers into a new 32-bit seed (for per-night seeds). */
export function mixSeed(a: number, b: number): number {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}

export interface C { re: number; im: number }
/** 2×2 complex matrix [[a,b],[c,d]] as 8 numbers: are,aim,bre,bim,cre,cim,dre,dim */
export type Mat2 = [number, number, number, number, number, number, number, number];

const S2 = Math.SQRT1_2;
export const MAT = {
  X: [0, 0, 1, 0, 1, 0, 0, 0] as Mat2,
  Y: [0, 0, 0, -1, 0, 1, 0, 0] as Mat2,
  Z: [1, 0, 0, 0, 0, 0, -1, 0] as Mat2,
  H: [S2, 0, S2, 0, S2, 0, -S2, 0] as Mat2,
  rx(t: number): Mat2 { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, 0, 0, -s, 0, -s, c, 0]; },
  ry(t: number): Mat2 { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, 0, -s, 0, s, 0, c, 0]; },
  rz(t: number): Mat2 { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, -s, 0, 0, 0, 0, c, s]; },
  /** Unitary with U|0> = cos(θ/2)|0> + e^{iφ} sin(θ/2)|1>. */
  prep(theta: number, phi: number): Mat2 {
    const c = Math.cos(theta / 2), s = Math.sin(theta / 2), cp = Math.cos(phi), sp = Math.sin(phi);
    return [c, 0, -s * cp, s * sp, s * cp, s * sp, c, 0];
  },
};

export class QState {
  n = 0;
  re: Float64Array = new Float64Array([1]);
  im: Float64Array = new Float64Array([0]);
  /** id → bit position for active qubits */
  pos = new Map<string, number>();
  /** bit position → id */
  order: string[] = [];
  /** detached qubits with a definite classical value (absent everywhere ⇒ |0>) */
  cval = new Map<string, 0 | 1>();
  /** statistics: largest register seen (for perf diagnostics) */
  maxN = 0;

  clone(): QState {
    const s = new QState();
    s.n = this.n; s.re = this.re.slice(); s.im = this.im.slice();
    s.pos = new Map(this.pos); s.order = this.order.slice(); s.cval = new Map(this.cval); s.maxN = this.maxN;
    return s;
  }

  isActive(id: string): boolean { return this.pos.has(id); }
  /** Classical value of a detached qubit (0 for never-touched), or null if active. */
  classical(id: string): 0 | 1 | null { return this.pos.has(id) ? null : (this.cval.get(id) ?? 0); }

  /** Make `id` a live qubit (appended as the new top bit) and return its bit position. */
  attach(id: string): number {
    const p = this.pos.get(id);
    if (p !== undefined) return p;
    const v = this.cval.get(id) ?? 0;
    const N = this.re.length;
    const re = new Float64Array(2 * N), im = new Float64Array(2 * N);
    const off = v ? N : 0;
    re.set(this.re, off); im.set(this.im, off);
    this.re = re; this.im = im;
    const k = this.n++;
    if (this.n > this.maxN) this.maxN = this.n;
    this.pos.set(id, k); this.order.push(id); this.cval.delete(id);
    return k;
  }

  /** Remove an active qubit that is known to be exactly |r> (after collapse). */
  private detach(id: string, r: 0 | 1): void {
    const k = this.pos.get(id)!;
    const N = this.re.length, half = N >> 1, m = 1 << k, low = m - 1;
    const re = new Float64Array(half), im = new Float64Array(half);
    const rb = r ? m : 0;
    for (let j = 0; j < half; j++) {
      const i = ((j & ~low) << 1) | rb | (j & low);
      re[j] = this.re[i]; im[j] = this.im[i];
    }
    this.re = re; this.im = im; this.n--;
    this.order.splice(k, 1);
    this.pos.clear();
    this.order.forEach((q, b) => this.pos.set(q, b));
    this.cval.set(id, r);
  }

  /** Apply an arbitrary 2×2 unitary to qubit `id`. */
  apply1(id: string, U: Mat2): void {
    const k = this.attach(id);
    const [ar, ai, br, bi, cr, ci, dr, di] = U;
    const re = this.re, im = this.im, N = re.length, m = 1 << k;
    for (let base = 0; base < N; base += m << 1) {
      for (let i = base; i < base + m; i++) {
        const j = i + m;
        const xr = re[i], xi = im[i], yr = re[j], yi = im[j];
        re[i] = ar * xr - ai * xi + br * yr - bi * yi;
        im[i] = ar * xi + ai * xr + br * yi + bi * yr;
        re[j] = cr * xr - ci * xi + dr * yr - di * yi;
        im[j] = cr * xi + ci * xr + dr * yi + di * yr;
      }
    }
  }

  x(id: string): void {
    const c = this.classical(id);
    if (c !== null) { this.cval.set(id, (c ^ 1) as 0 | 1); return; }
    const k = this.pos.get(id)!, re = this.re, im = this.im, N = re.length, m = 1 << k;
    for (let base = 0; base < N; base += m << 1)
      for (let i = base; i < base + m; i++) {
        const j = i + m;
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
  }

  z(id: string): void {
    if (!this.pos.has(id)) return; // Z on a classical bit is only a global phase
    const k = this.pos.get(id)!, re = this.re, im = this.im, N = re.length, m = 1 << k;
    for (let base = m; base < N; base += m << 1)
      for (let i = base; i < base + m; i++) { re[i] = -re[i]; im[i] = -im[i]; }
  }

  /** Y = [[0,−i],[i,0]] exactly (= iXZ). */
  y(id: string): void {
    if (!this.pos.has(id)) { this.x(id); return; } // global phase only
    this.apply1(id, MAT.Y);
  }

  h(id: string): void {
    const k = this.attach(id), re = this.re, im = this.im, N = re.length, m = 1 << k;
    for (let base = 0; base < N; base += m << 1)
      for (let i = base; i < base + m; i++) {
        const j = i + m;
        const xr = re[i], xi = im[i], yr = re[j], yi = im[j];
        re[i] = S2 * (xr + yr); im[i] = S2 * (xi + yi);
        re[j] = S2 * (xr - yr); im[j] = S2 * (xi - yi);
      }
  }

  /** S = diag(1, i) (S† if dagger); on a classical bit only a global phase. */
  s(id: string, dagger = false): void { if (this.pos.has(id)) this.apply1(id, [1, 0, 0, 0, 0, 0, 0, dagger ? -1 : 1]); }

  /** Controlled-Z (symmetric, exact; keeps classical qubits classical). */
  cz(a: string, b: string): void {
    const ca = this.classical(a), cb = this.classical(b);
    if (ca !== null || cb !== null) { if (ca) this.z(b); if (cb) this.z(a); return; }
    const m = (1 << this.pos.get(a)!) | (1 << this.pos.get(b)!), re = this.re, im = this.im;
    for (let i = 0; i < re.length; i++) if ((i & m) === m) { re[i] = -re[i]; im[i] = -im[i]; }
  }

  /** SWAP = exact relabelling (no amplitudes move). */
  swap(a: string, b: string): void {
    const { pos, cval, order } = this, pa = pos.get(a), pb = pos.get(b), ca = cval.get(a), cb = cval.get(b);
    for (const q of [a, b]) { pos.delete(q); cval.delete(q); }
    if (pa !== undefined) { pos.set(b, pa); order[pa] = b; }
    if (pb !== undefined) { pos.set(a, pb); order[pb] = a; }
    if (ca !== undefined) cval.set(b, ca);
    if (cb !== undefined) cval.set(a, cb);
  }

  rx(id: string, t: number): void { this.apply1(id, MAT.rx(t)); }
  rz(id: string, t: number): void { this.apply1(id, MAT.rz(t)); }

  cnot(ctrl: string, targ: string): void {
    if (ctrl === targ) throw new Error('CNOT needs two different qubits');
    const c = this.classical(ctrl);
    if (c !== null) { if (c) this.x(targ); return; }
    const tc = this.classical(targ);
    if (tc !== null) this.attach(targ);
    const kc = this.pos.get(ctrl)!, kt = this.pos.get(targ)!;
    const mc = 1 << kc, mt = 1 << kt, re = this.re, im = this.im, N = re.length;
    for (let i = 0; i < N; i++) {
      if ((i & mc) && !(i & mt)) {
        const j = i | mt;
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
  }

  /** Probability that qubit `id` is |1>. */
  prob1(id: string): number {
    const c = this.classical(id);
    if (c !== null) return c;
    const k = this.pos.get(id)!, re = this.re, im = this.im, N = re.length, m = 1 << k;
    let p = 0;
    for (let base = m; base < N; base += m << 1)
      for (let i = base; i < base + m; i++) p += re[i] * re[i] + im[i] * im[i];
    return p;
  }

  /** Projective Z measurement with Born-rule sampling; collapses, renormalises and detaches. */
  measure(id: string, rng: Rng): 0 | 1 {
    const c = this.classical(id);
    if (c !== null) return c;
    const p1 = this.prob1(id);
    // Exact outcomes never consume randomness ambiguity: p1≈0 or ≈1 ⇒ deterministic.
    const r: 0 | 1 = p1 < 1e-12 ? 0 : p1 > 1 - 1e-12 ? 1 : (rng() < p1 ? 1 : 0);
    const k = this.pos.get(id)!, m = 1 << k, re = this.re, im = this.im, N = re.length;
    const norm = 1 / Math.sqrt(r ? p1 : 1 - p1);
    for (let i = 0; i < N; i++) {
      if (((i & m) !== 0) === (r === 1)) { re[i] *= norm; im[i] *= norm; } else { re[i] = 0; im[i] = 0; }
    }
    this.detach(id, r);
    return r;
  }

  /** Reset to |0> (measure-and-flip trajectory; averaged over runs this is the reset channel). */
  reset(id: string, rng: Rng): 0 | 1 {
    const r = this.measure(id, rng);
    this.cval.set(id, 0);
    return r;
  }

  /** Load a single-qubit pure state into a qubit that is currently |0> (fresh). */
  prepare(id: string, theta: number, phi: number): void {
    if (this.classical(id) !== 0) throw new Error(`prepare(${id}): qubit is not fresh |0>`);
    if (Math.abs(theta) < 1e-15) return;
    if (Math.abs(theta - Math.PI) < 1e-15 && Math.abs(phi) < 1e-15) { this.x(id); return; }
    this.apply1(id, MAT.prep(theta, phi));
  }

  norm2(): number { let s = 0; for (let i = 0; i < this.re.length; i++) s += this.re[i] ** 2 + this.im[i] ** 2; return s; }

  /** Reduced single-qubit Bloch vector. */
  bloch(id: string): { x: number; y: number; z: number } {
    const c = this.classical(id);
    if (c !== null) return { x: 0, y: 0, z: c ? -1 : 1 };
    const k = this.pos.get(id)!, m = 1 << k, re = this.re, im = this.im, N = re.length;
    let p0 = 0, p1 = 0, r01 = 0, i01 = 0;
    for (let base = 0; base < N; base += m << 1)
      for (let i = base; i < base + m; i++) {
        const j = i + m;
        const ar = re[i], ai = im[i], br = re[j], bi = im[j];
        p0 += ar * ar + ai * ai; p1 += br * br + bi * bi;
        // ρ01 += a · conj(b)
        r01 += ar * br + ai * bi; i01 += ai * br - ar * bi;
      }
    return { x: 2 * r01, y: -2 * i01, z: p0 - p1 };
  }

  /** Reduced 2-qubit density matrix as {re,im} 4×4 (row-major, index = 2·bit(a)+bit(b)). */
  rho2(a: string, b: string): { re: Float64Array; im: Float64Array } {
    const R = new Float64Array(16), I = new Float64Array(16);
    const ca = this.classical(a), cb = this.classical(b);
    if (ca !== null || cb !== null) {
      // at least one is classical ⇒ product; build ρa⊗ρb
      const ra = this.rho1(a), rb = this.rho1(b);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) for (let l = 0; l < 2; l++) {
        const x = ra.re[i * 2 + j], xi = ra.im[i * 2 + j], y = rb.re[k * 2 + l], yi = rb.im[k * 2 + l];
        R[(2 * i + k) * 4 + 2 * j + l] = x * y - xi * yi;
        I[(2 * i + k) * 4 + 2 * j + l] = x * yi + xi * y;
      }
      return { re: R, im: I };
    }
    const ka = this.pos.get(a)!, kb = this.pos.get(b)!;
    const ma = 1 << ka, mb = 1 << kb, lo = Math.min(ka, kb), hi = Math.max(ka, kb);
    const mLo = (1 << lo) - 1, mHi = (1 << hi) - 1;
    const re = this.re, im = this.im, Q = re.length >> 2;
    const o1 = mb, o2 = ma, o3 = ma | mb;
    let r00 = 0, r11 = 0, r22 = 0, r33 = 0;
    let x01 = 0, y01 = 0, x02 = 0, y02 = 0, x03 = 0, y03 = 0, x12 = 0, y12 = 0, x13 = 0, y13 = 0, x23 = 0, y23 = 0;
    for (let j = 0; j < Q; j++) {
      // insert zero bits at positions lo and hi
      let base = ((j & ~mLo) << 1) | (j & mLo);
      base = ((base & ~mHi) << 1) | (base & mHi);
      const a0 = re[base], b0 = im[base], a1 = re[base | o1], b1 = im[base | o1];
      const a2 = re[base | o2], b2 = im[base | o2], a3 = re[base | o3], b3 = im[base | o3];
      r00 += a0 * a0 + b0 * b0; r11 += a1 * a1 + b1 * b1; r22 += a2 * a2 + b2 * b2; r33 += a3 * a3 + b3 * b3;
      // ρ[r][c] += ψr · conj(ψc)
      x01 += a0 * a1 + b0 * b1; y01 += b0 * a1 - a0 * b1;
      x02 += a0 * a2 + b0 * b2; y02 += b0 * a2 - a0 * b2;
      x03 += a0 * a3 + b0 * b3; y03 += b0 * a3 - a0 * b3;
      x12 += a1 * a2 + b1 * b2; y12 += b1 * a2 - a1 * b2;
      x13 += a1 * a3 + b1 * b3; y13 += b1 * a3 - a1 * b3;
      x23 += a2 * a3 + b2 * b3; y23 += b2 * a3 - a2 * b3;
    }
    const set = (r: number, c: number, x: number, y: number) => { R[r * 4 + c] = x; I[r * 4 + c] = y; R[c * 4 + r] = x; I[c * 4 + r] = -y; };
    R[0] = r00; R[5] = r11; R[10] = r22; R[15] = r33;
    set(0, 1, x01, y01); set(0, 2, x02, y02); set(0, 3, x03, y03); set(1, 2, x12, y12); set(1, 3, x13, y13); set(2, 3, x23, y23);
    return { re: R, im: I };
  }

  private rho1(id: string): { re: number[]; im: number[] } {
    const b = this.bloch(id);
    return { re: [(1 + b.z) / 2, b.x / 2, b.x / 2, (1 - b.z) / 2], im: [0, -b.y / 2, b.y / 2, 0] };
  }

  /** Von Neumann mutual information I(a:b) in bits (0..2). */
  mutualInfo(a: string, b: string): number {
    if (!this.pos.has(a) || !this.pos.has(b)) return 0;
    const sa = entropy1(this.bloch(a)), sb = entropy1(this.bloch(b));
    if (sa < 1e-9 || sb < 1e-9) return 0;
    const r = this.rho2(a, b);
    const sab = entropyFromEigs(hermitianEigs4(r.re, r.im));
    return Math.max(0, sa + sb - sab);
  }

  /**
   * ⟨t|ρ_D|t⟩ where ρ_D is the reduced state of qubits `ids` (everything else traced out) and
   * `t` is a pure state given in `ids` order (ids[k] ⇔ bit k of t's index).
   */
  fidelityPure(ids: string[], tRe: Float64Array | number[], tIm: Float64Array | number[]): number {
    const n = this.n, re = this.re, im = this.im, N = re.length;
    // per active bit: target bit (>=0) or env bit (encoded as -1-envIndex)
    const map = new Int32Array(n);
    let envCount = 0;
    const idxOf = new Map(ids.map((q, i) => [q, i] as const));
    for (let b = 0; b < n; b++) {
      const t = idxOf.get(this.order[b]);
      map[b] = t !== undefined ? t : -1 - envCount++;
    }
    let fixed = 0; // target-index bits contributed by classical (detached) data qubits
    ids.forEach((q, i) => { if (!this.pos.has(q) && this.classical(q) === 1) fixed |= 1 << i; });
    const accR = new Float64Array(1 << envCount), accI = new Float64Array(1 << envCount);
    // split-index lookup tables: index → (target bits, env bits) for low and high halves
    const L = Math.min(n, 9), H = n - L;
    const dLo = new Int32Array(1 << L), eLo = new Int32Array(1 << L), dHi = new Int32Array(1 << H), eHi = new Int32Array(1 << H);
    const fill = (dT: Int32Array, eT: Int32Array, off: number, cnt: number) => {
      for (let x = 0; x < (1 << cnt); x++) {
        let d = 0, e = 0;
        for (let b = 0; b < cnt; b++) if (x & (1 << b)) { const m = map[b + off]; if (m >= 0) d |= 1 << m; else e |= 1 << (-1 - m); }
        dT[x] = d; eT[x] = e;
      }
    };
    fill(dLo, eLo, 0, L); fill(dHi, eHi, L, H);
    const lmask = (1 << L) - 1;
    for (let i = 0; i < N; i++) {
      const xr = re[i], xi = im[i];
      if (xr === 0 && xi === 0) continue;
      const lo = i & lmask, hi = i >>> L;
      const d = fixed | dLo[lo] | dHi[hi], e = eLo[lo] | eHi[hi];
      const tr = tRe[d], ti = tIm[d];
      // conj(t) · ψ
      accR[e] += tr * xr + ti * xi;
      accI[e] += tr * xi - ti * xr;
    }
    let f = 0;
    for (let e = 0; e < accR.length; e++) f += accR[e] * accR[e] + accI[e] * accI[e];
    return f;
  }

  /** Probability that the XOR of the computational values of `ids` is 1. */
  parityProb1(ids: string[]): number {
    let cl = 0, mask = 0;
    for (const q of ids) { const c = this.classical(q); if (c === null) mask |= 1 << this.pos.get(q)!; else cl ^= c; }
    if (!mask) return cl;
    let p = 0;
    const re = this.re, im = this.im;
    for (let i = 0; i < re.length; i++) if (popcount(i & mask) & 1) p += re[i] * re[i] + im[i] * im[i];
    return cl ? 1 - p : p;
  }

  /** Dense amplitude vector over `ids` (ids[k] ⇔ bit k). Requires that every active qubit is in `ids`. */
  denseOver(ids: string[]): { re: Float64Array; im: Float64Array } {
    for (const q of this.order) if (!ids.includes(q)) throw new Error(`denseOver: active qubit ${q} not listed`);
    const N = 1 << ids.length, R = new Float64Array(N), I = new Float64Array(N);
    let fixed = 0;
    ids.forEach((q, i) => { if (this.classical(q) === 1) fixed |= 1 << i; });
    const map = this.order.map(q => ids.indexOf(q));
    for (let i = 0; i < this.re.length; i++) {
      let d = fixed;
      for (let b = 0; b < this.n; b++) if (i & (1 << b)) d |= 1 << map[b];
      R[d] = this.re[i]; I[d] = this.im[i];
    }
    return { re: R, im: I };
  }
}

export function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function h2(p: number): number { return p <= 1e-12 ? 0 : -p * Math.log2(p); }
export function entropy1(b: { x: number; y: number; z: number }): number {
  const r = Math.min(1, Math.hypot(b.x, b.y, b.z));
  return h2((1 + r) / 2) + h2((1 - r) / 2);
}
export function entropyFromEigs(ev: number[]): number { let s = 0; for (const l of ev) s += h2(Math.max(0, l)); return s; }

/**
 * Eigenvalues of a 4×4 complex Hermitian matrix H = R + iI, via the real-symmetric 8×8
 * embedding [[R, −I],[I, R]] (each eigenvalue appears twice) and cyclic Jacobi.
 */
export function hermitianEigs4(R: Float64Array, I: Float64Array): number[] {
  const n = 8, A = new Float64Array(64);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const r = R[i * 4 + j], im = I[i * 4 + j];
    A[i * n + j] = r; A[(i + 4) * n + j + 4] = r;
    A[i * n + j + 4] = -im; A[(i + 4) * n + j] = im;
  }
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q];
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k * n + p], akq = A[k * n + q];
        A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p * n + k], aqk = A[q * n + k];
        A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
      }
    }
  }
  const d = Array.from({ length: n }, (_, i) => A[i * n + i]).sort((a, b) => b - a);
  return [d[0], d[2], d[4], d[6]];
}

/** Haar-random single-qubit state angles. */
export function haarAngles(rng: Rng): { theta: number; phi: number } {
  return { theta: Math.acos(1 - 2 * rng()), phi: 2 * Math.PI * rng() };
}
