/** Test-only: a tiny exact state-vector sim that produces NightResults with full NerdInfo for notebook-test.html.
 *  (The real data comes from src/quantum runNight(..., { nerd: true }).) */
import type { LevelDef, NightResult, TraceStep, TraceEvent, NerdInfo, QubitId, Snapshot, Phase } from '../../core/contracts';
import { reducedRho } from './qmath';

type Op =
  | ['phase', Phase] | ['x' | 'z' | 'h', QubitId] | ['cx', QubitId, QubitId] | ['rx', QubitId, number, 'noise'?]
  | ['flip', QubitId] | ['m', QubitId] | ['reset', QubitId] | ['if', QubitId[], () => boolean];

export function mockLevel(): LevelDef {
  return {
    id: '2-3', chapter: 2, title: 'Who Got Flipped', qubbles: [{ id: 'q1', x: 1, y: 1 }, { id: 'q2', x: 3, y: 1 }, { id: 'q3', x: 5, y: 1 }],
    bots: [{ id: 'a', x: 2, y: 2 }, { id: 'b', x: 4, y: 2 }], toolbox: [], editable: ['morning'], inputs: ['random'], inputQubble: 'q1',
    noise: { mode: 'random', p: 0.1, kinds: ['flip'] }, goal: { kind: 'state', dataQubits: ['q1', 'q2', 'q3'], targetCircuit: [] },
    intro: [], hints: [], winLine: [], reveal: '', solution: {},
  } as LevelDef;
}

export function mockNight(kind: 'flip' | 'wobble' | 'copy', seed = 3): NightResult {
  const order: QubitId[] = ['q1', 'q2', 'q3', 'a', 'b'];
  const n = order.length, D = 1 << n;
  const re = new Float64Array(D), im = new Float64Array(D);
  const th = kind === 'flip' ? 1.2 : 0, ph = kind === 'flip' ? 0.7 : 0;
  const alpha = Math.cos(th / 2), beta = { re: Math.cos(ph) * Math.sin(th / 2), im: Math.sin(ph) * Math.sin(th / 2) };
  re[0] = alpha; re[1 << (n - 1)] = beta.re; im[1 << (n - 1)] = beta.im; // q1 = input
  let rnd = seed * 9301 + 49297;
  const rand = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };
  const bit = (q: QubitId) => n - 1 - order.indexOf(q);
  const app1 = (q: QubitId, m: [[number, number], [number, number]][]) => { // m = 2x2 complex as [[re,im],[re,im]] rows
    const b = 1 << bit(q);
    for (let i = 0; i < D; i++) if (!(i & b)) {
      const j = i | b, ar = re[i], ai = im[i], br = re[j], bi = im[j];
      const [[a, bb], [c, d]] = [[m[0][0], m[0][1]], [m[1][0], m[1][1]]];
      re[i] = a[0] * ar - a[1] * ai + bb[0] * br - bb[1] * bi; im[i] = a[0] * ai + a[1] * ar + bb[0] * bi + bb[1] * br;
      re[j] = c[0] * ar - c[1] * ai + d[0] * br - d[1] * bi; im[j] = c[0] * ai + c[1] * ar + d[0] * bi + d[1] * br;
    }
  };
  const s2 = Math.SQRT1_2;
  const X = (q: QubitId) => app1(q, [[[0, 0], [1, 0]], [[1, 0], [0, 0]]] as never);
  const Z = (q: QubitId) => app1(q, [[[1, 0], [0, 0]], [[0, 0], [-1, 0]]] as never);
  const H = (q: QubitId) => app1(q, [[[s2, 0], [s2, 0]], [[s2, 0], [-s2, 0]]] as never);
  const RX = (q: QubitId, a: number) => { const c = Math.cos(a / 2), s = Math.sin(a / 2); app1(q, [[[c, 0], [0, -s]], [[0, -s], [c, 0]]] as never); };
  const CX = (c: QubitId, t: QubitId) => { const bc = 1 << bit(c), bt = 1 << bit(t); for (let i = 0; i < D; i++) if (i & bc && !(i & bt)) { const j = i | bt; [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } };
  const M = (q: QubitId): 0 | 1 => {
    const b = 1 << bit(q); let p1 = 0;
    for (let i = 0; i < D; i++) if (i & b) p1 += re[i] * re[i] + im[i] * im[i];
    const r: 0 | 1 = rand() < p1 ? 1 : 0, keep = r ? p1 : 1 - p1, k = 1 / Math.sqrt(keep || 1);
    for (let i = 0; i < D; i++) { if (!!(i & b) !== !!r) { re[i] = 0; im[i] = 0; } else { re[i] *= k; im[i] *= k; } }
    return r;
  };
  const record: { who: QubitId; bit: 0 | 1 }[] = [];
  const steps: TraceStep[] = [];
  const nerd = (): NerdInfo => {
    const amps: NerdInfo['amps'] = [];
    for (let i = 0; i < D; i++) { const p = re[i] * re[i] + im[i] * im[i]; if (p > 1e-9) amps.push({ ket: i.toString(2).padStart(n, '0'), re: re[i], im: im[i] }); }
    amps.sort((a, b) => b.re * b.re + b.im * b.im - (a.re * a.re + a.im * a.im));
    const reduced: NerdInfo['reduced'] = {} as never;
    const S1: number[] = [];
    order.forEach((q, k) => {
      const r = reducedRho(amps, [k]);
      const x = 2 * r[0][1].re, y = -2 * r[0][1].im, z = r[0][0].re - r[1][1].re, L = Math.min(1, Math.hypot(x, y, z));
      const S = ent([(1 + L) / 2, (1 - L) / 2]);
      S1[k] = S;
      reduced[q] = { x, y, z, purity: (1 + L * L) / 2, entropy: S };
    });
    const mi = order.map((_, a) => order.map((__, b) => {
      if (a === b) return 2 * S1[a];
      const r = reducedRho(amps, [a, b]);
      return Math.max(0, S1[a] + S1[b] - ent(eigHerm(r)));
    }));
    const zz = (a: number, b: number) => amps.reduce((s, x) => s + (x.re * x.re + x.im * x.im) * (x.ket[a] === x.ket[b] ? 1 : -1), 0);
    let F = 0;
    for (const bb of ['00', '01', '10', '11']) {
      const i0 = parseInt('000' + bb, 2), i1 = parseInt('111' + bb, 2);
      const r0 = alpha * re[i0] + (beta.re * re[i1] + beta.im * im[i1]), i0v = alpha * im[i0] + (beta.re * im[i1] - beta.im * re[i1]);
      F += r0 * r0 + i0v * i0v;
    }
    return { order, amps, truncated: false, reduced, mi, stabilizers: [{ label: 'Z₁Z₂', value: zz(0, 1) }, { label: 'Z₂Z₃', value: zz(1, 2) }], fidelity: kind === 'copy' ? undefined : F, record: [...record] };
  };
  const push = (ev: TraceEvent) => {
    const nf = nerd();
    const snap: Snapshot = { bloch: Object.fromEntries(order.map((q) => [q, { x: nf.reduced[q].x, y: nf.reduced[q].y, z: nf.reduced[q].z }])) as never, links: [], amps: [], lights: {}, logicalFidelity: nf.fidelity, nerd: nf };
    steps.push({ ev, snap });
  };
  const prog: Op[] = kind === 'copy'
    ? [['phase', 'bedtime'], ['h', 'q1'], ['cx', 'q1', 'q2'], ['phase', 'morning'], ['m', 'q2']]
    : [
      ['phase', 'bedtime'], ['cx', 'q1', 'q2'], ['cx', 'q1', 'q3'],
      ['phase', 'night'], kind === 'flip' ? ['flip', 'q2'] : ['rx', 'q2', 1.0, 'noise'],
      ['phase', 'morning'], ['cx', 'q1', 'a'], ['cx', 'q2', 'a'], ['cx', 'q2', 'b'], ['cx', 'q3', 'b'], ['m', 'a'], ['m', 'b'],
      ['if', ['a', 'b'], () => last('a') === 1 && last('b') === 1],
    ];
  const last = (q: QubitId) => [...record].reverse().find((r) => r.who === q)?.bit;
  const errors: NightResult['errors'] = [];
  for (const op of prog) {
    switch (op[0]) {
      case 'phase': push({ k: 'phase', phase: op[1] }); break;
      case 'x': X(op[1]); push({ k: 'gate', op: 'BOOP', t: op[1] }); break;
      case 'z': Z(op[1]); push({ k: 'gate', op: 'SHUSH', t: op[1] }); break;
      case 'h': H(op[1]); push({ k: 'gate', op: 'SPIN', t: op[1] }); break;
      case 'cx': CX(op[1], op[2]); push({ k: 'gate', op: 'HIGHFIVE', t: op[2], from: op[1] }); break;
      case 'flip': X(op[1]); errors.push({ kind: 'flip', t: op[1] as never }); push({ k: 'noise', e: { kind: 'flip', t: op[1] as never } }); break;
      case 'rx': RX(op[1], op[2]); errors.push({ kind: 'wobble', t: op[1] as never, axis: 'x', angle: op[2] }); push({ k: 'noise', e: { kind: 'wobble', t: op[1] as never, axis: 'x', angle: op[2] } }); break;
      case 'm': { const r = M(op[1]); record.push({ who: op[1], bit: r }); push({ k: 'measure', t: op[1], result: r, woke: false }); break; }
      case 'reset': { const r = M(op[1]); if (r) X(op[1]); push({ k: 'gate', op: 'RESET', t: op[1] }); break; }
      case 'if': { const taken = op[2](); push({ k: 'jump', to: 0, taken }); if (taken) { X('q2'); push({ k: 'gate', op: 'BOOP', t: 'q2' }); } break; }
    }
  }
  push({ k: 'end', reason: 'done' });
  const fin = steps[steps.length - 1].snap.nerd!.fidelity ?? 1;
  return { input: { theta: th, phi: ph }, seed, errors, steps, fidelity: fin, woke: [], pass: fin > 0.99, stepCount: steps.length };
}
const ent = (ls: number[]) => ls.reduce((s, l) => (l > 1e-12 ? s - l * Math.log2(l) : s), 0);
/** Eigenvalues of a Hermitian matrix via the real-symmetric embedding [[Re,-Im],[Im,Re]] + Jacobi (each eigenvalue appears twice). */
function eigHerm(r: { re: number; im: number }[][]): number[] {
  const d = r.length, N = 2 * d;
  const A = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => {
    const a = r[i % d][j % d];
    if ((i < d) === (j < d)) return a.re;
    return i < d ? -a.im : a.im;
  }));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) off += A[p][q] * A[p][q];
    if (off < 1e-14) break;
    for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < N; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < N; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
    }
  }
  const ev = A.map((row, i) => row[i]).sort((a, b) => b - a);
  return ev.filter((_, i) => i % 2 === 0).map((v) => Math.max(0, v));
}
