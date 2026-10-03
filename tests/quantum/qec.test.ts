import { describe, it, expect } from 'vitest';
import type { LevelDef, Program } from '../../src/core/contracts';
import { QState, makeRng, MAT } from '../../src/quantum/sim';
import { runNight, testLevel } from '../../src/quantum/vm';
import { parseProgram, printProgram } from '../../src/quantum/text';
import { expectPauliString } from '../../src/quantum/nerd';
import { CODES, codeLevel, correction, lookupTable, repeatedExtractionLevel, REPEATED_EXTRACTION, SINGLE_ROUND_EXTRACTION, type CodeInfo } from '../../src/quantum/qec';
import { monteCarlo, sweep, wilson } from '../../src/quantum/montecarlo';
import { toQiskit, toOpenQASM3 } from '../../src/quantum/export';
import * as R from '../../src/quantum/reference';

const fails = (r: ReturnType<typeof testLevel>) => r.nights.filter(n => !n.pass).map(n => `${JSON.stringify(n.errors)} ro=${JSON.stringify(n.readoutFlips ?? [])} F=${n.fidelity.toFixed(4)} ${n.failReason} ${n.message ?? ''}`);
const data = (n: number) => Array.from({ length: n }, (_, i) => `q${i + 1}`);

function randomState(n: number, seed: number): QState {
  const s = new QState(), rng = makeRng(seed);
  for (let i = 0; i < n; i++) s.apply1(`q${i + 1}`, MAT.prep(Math.PI * rng(), 2 * Math.PI * rng()));
  for (let i = 0; i + 1 < n; i++) s.cnot(`q${i + 1}`, `q${i + 2}`);
  for (let i = 0; i < n; i++) s.rx(`q${i + 1}`, rng() * 3);
  return s;
}
const close = (a: QState, b: QState, ids: string[]) => {
  const da = a.denseOver(ids), db = b.denseOver(ids);
  for (let i = 0; i < da.re.length; i++) { expect(da.re[i]).toBeCloseTo(db.re[i], 12); expect(da.im[i]).toBeCloseTo(db.im[i], 12); }
};

describe('DLC gates (exact)', () => {
  it('S² = Z, S·S† = I, Y = iXZ, CZ symmetric, SWAP = 3 CNOTs', () => {
    const ids = data(3);
    const a = randomState(3, 1), b = a.clone();
    a.s('q2'); a.s('q2'); b.z('q2'); close(a, b, ids);
    a.s('q1'); a.s('q1', true); close(a, b, ids);
    const c = randomState(3, 2), d = c.clone();
    c.y('q3'); d.z('q3'); d.x('q3'); // XZ = −iY ⇒ Y = i·XZ: compare up to the global phase i
    const dc = c.denseOver(ids), dd = d.denseOver(ids);
    for (let i = 0; i < 8; i++) { expect(dc.re[i]).toBeCloseTo(-dd.im[i], 12); expect(dc.im[i]).toBeCloseTo(dd.re[i], 12); }
    const e = randomState(3, 3), f = e.clone();
    e.cz('q1', 'q3'); f.cz('q3', 'q1'); close(e, f, ids);
    f.h('q3'); f.cnot('q1', 'q3'); f.h('q3'); f.cz('q1', 'q3'); close(e, f, ids); // H·CX·H = CZ and CZ·CZ = I
    const g = randomState(3, 4), h = g.clone();
    g.swap('q1', 'q3'); h.cnot('q1', 'q3'); h.cnot('q3', 'q1'); h.cnot('q1', 'q3'); close(g, h, ids);
  });
  it('gates on classical (detached) qubits stay exact', () => {
    const s = new QState(); s.h('q1'); s.x('q2'); // q2 classical 1
    s.cz('q2', 'q1'); expect(s.bloch('q1').x).toBeCloseTo(-1, 12); // Z on |+> ⇒ |->
    s.swap('q1', 'q2'); expect(s.classical('q1')).toBe(1); expect(s.bloch('q2').x).toBeCloseTo(-1, 12);
    s.swap('q2', 'q3'); expect(s.classical('q2')).toBe(0); expect(s.bloch('q3').x).toBeCloseTo(-1, 12);
  });
  it('parser/printer round trip + circuit aliases', () => {
    const txt = 'Y q1\nS q2\nSDG q3\nCZ q1, q2\nSWAP q2, a\nWAIT';
    const r = parseProgram(txt);
    expect(r.errors).toEqual([]);
    expect(printProgram(r.prog)).toBe(txt);
    const al = parseProgram('X q1\nZ q2\nH q3\nCX q1 -> q2\nsdag q1\nCZ q1 q1');
    expect(al.prog.map(o => o.op)).toEqual(['BOOP', 'SHUSH', 'SPIN', 'HIGHFIVE', 'SDG']);
    expect(al.errors.length).toBe(1);
  });
  it('expectPauliString handles Y: ⟨Y⟩ of |+i⟩ = 1, ⟨Y⊗Y⟩ of a Bell pair = −1', () => {
    const s = new QState(); s.prepare('q1', Math.PI / 2, Math.PI / 2);
    expect(expectPauliString(s, 'Y', ['q1'])).toBeCloseTo(1, 12);
    const b = new QState(); b.h('q1'); b.cnot('q1', 'q2');
    expect(expectPauliString(b, 'YY', ['q1', 'q2'])).toBeCloseTo(-1, 12);
    expect(expectPauliString(b, 'XX', ['q1', 'q2'])).toBeCloseTo(1, 12);
  });
});

describe('readout noise and noise rounds', () => {
  const lvl = codeLevel(CODES.rep3, { bots: 6, noise: { mode: 'none' } });
  const prog = { morning: R.BITFLIP_CORRECT };
  it('defaults unchanged: p = 0 draws no randomness (identical nights)', () => {
    const a = runNight(lvl, prog, 'random', [], 9, { snapshots: false });
    const b = runNight(lvl, prog, 'random', [], 9, { snapshots: false, readoutFlip: 0 });
    expect(b).toEqual(a);
  });
  it('a readout fault flips the record, not the state', () => {
    const n = runNight(lvl, prog, 'plus', [], 3, { snapshots: true, readoutFlips: [{ t: 'a', nth: 1 }] });
    const m = n.steps.filter(s => s.ev.k === 'measure').map(s => s.ev);
    expect(m[0]).toMatchObject({ t: 'a', result: 1, flipped: true });
    expect(n.readoutFlips).toEqual([{ t: 'a', nth: 1 }]);
    expect(n.pass).toBe(false); // the decoder trusted the wrong bit and "fixed" q1
    // state collapsed to the true outcome: a is |0> (bloch z = +1) even though the record says 1
    const before = n.steps.findIndex(s => s.ev.k === 'measure');
    expect(n.steps[before].snap.bloch.a.z).toBeCloseTo(1, 12);
  });
  it('readoutFlip = 1 flips every LISTEN; level / noise settings are honoured', () => {
    const n = runNight({ ...lvl, readoutFlip: 1 }, prog, 'zero', [], 3, { snapshots: false });
    expect(n.readoutFlips).toEqual([{ t: 'a', nth: 1 }, { t: 'b', nth: 1 }]);
  });
  it('WAIT applies round-k errors; rounds without a WAIT still happen after the program', () => {
    const p = { morning: [{ op: 'WAIT' }] as Program };
    const one = runNight(lvl, p, 'zero', [{ kind: 'flip', t: 'q2', round: 1 }], 1, { snapshots: true });
    expect(one.steps.map(s => s.ev.k)).toContain('noise');
    expect(one.fidelity).toBeLessThan(1e-9);
    const late = runNight(lvl, { morning: [] }, 'zero', [{ kind: 'flip', t: 'q2', round: 3 }], 1, { snapshots: false });
    expect(late.fidelity).toBeLessThan(1e-9);
  });
});

function checkEncoder(code: CodeInfo) {
  for (const seed of [1, 2, 3]) {
    const rng = makeRng(seed), th = Math.PI * rng(), ph = 2 * Math.PI * rng();
    const lvl = codeLevel(code, { noise: { mode: 'none' } });
    const n = runNight(lvl, { morning: [] }, { theta: th, phi: ph }, [], seed, { snapshots: false });
    expect(n.pass).toBe(true);
    // re-run the encoder on a fresh state to read expectation values
    const s = new QState(); s.prepare('q1', th, ph);
    for (const o of code.encoder) {
      if (o.op === 'SPIN') s.h(o.t); else if (o.op === 'BOOP') s.x(o.t); else if (o.op === 'SHUSH') s.z(o.t); else if (o.op === 'Y') s.y(o.t);
      else if (o.op === 'S' || o.op === 'SDG') s.s(o.t, o.op === 'SDG'); else if (o.op === 'HIGHFIVE') s.cnot(o.from, o.to);
      else if (o.op === 'CZ') s.cz(o.from, o.to); else if (o.op === 'SWAP') s.swap(o.from, o.to);
    }
    const ids = data(code.n);
    for (const g of code.stabilizers) expect(expectPauliString(s, g, ids)).toBeCloseTo(1, 10);
    expect(expectPauliString(s, code.logicals.Z, ids)).toBeCloseTo(Math.cos(th), 10);
    expect(expectPauliString(s, code.logicals.X, ids)).toBeCloseTo(Math.sin(th) * Math.cos(ph), 10);
  }
}

describe('[[5,1,3]] perfect code', () => {
  it('encoder: all 4 generators +1, logicals carry the input', () => checkEncoder(CODES.five));
  it('15 single-qubit Paulis ↔ 15 distinct non-zero syndromes', () => expect(lookupTable(CODES.five.stabilizers, 5).size).toBe(15));
  it('corrects every single X, Y, Z (random inputs), with wobbles too', () => {
    const lvl = codeLevel(CODES.five);
    const r = testLevel(lvl, lvl.solution);
    expect(fails(r)).toEqual([]);
    expect(r.nights.length).toBe(9 * 16); // (5 fixed + 4 random inputs) × (no error + 15 single Paulis)
    const wob = codeLevel(CODES.five, { noise: { mode: 'enumerate', kinds: ['wobble'], maxErrors: 1, wobbleAngles: [0.4, 1.9], wobbleAxis: 'x' } });
    expect(fails(testLevel(wob, wob.solution))).toEqual([]);
  });
  it('two errors defeat it; doing nothing fails', () => {
    const two = codeLevel(CODES.five, { noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 2 } });
    expect(testLevel(two, two.solution).passed).toBe(false);
    expect(testLevel(codeLevel(CODES.five), { morning: [] }).passed).toBe(false);
  });
});

describe('Steane [[7,1,3]] code', () => {
  it('encoder: 6 generators +1, logicals carry the input', () => checkEncoder(CODES.steane));
  it('corrects every single X, Y, Z with 3 reused ancillas', () => {
    const lvl = codeLevel(CODES.steane);
    expect(lvl.bots.length).toBe(3);
    const r = testLevel(lvl, lvl.solution);
    expect(fails(r)).toEqual([]);
    expect(Math.max(...r.nights.map(n => (n as { maxLiveQubits: number }).maxLiveQubits))).toBeLessThanOrEqual(10);
  });
});

describe('distance-3 rotated surface code (memory)', () => {
  it('encoder: 8 generators +1, X̄ = X₁X₄X₇ and Z̄ = Z₁Z₂Z₃ carry the input', () => checkEncoder(CODES.surface3));
  it('one round with 4 reused ancillas corrects every single X, Y, Z; live state ≤ 13 qubits', () => {
    const lvl = codeLevel(CODES.surface3);
    expect(lvl.bots.length).toBe(4);
    const r = testLevel(lvl, lvl.solution);
    expect(fails(r)).toEqual([]);
    expect(Math.max(...r.nights.map(n => (n as { maxLiveQubits: number }).maxLiveQubits))).toBeLessThanOrEqual(13);
  });
  it('a logical X̄ (string X₁X₄X₇) is invisible to every check and is a logical failure', () => {
    const lvl = codeLevel(CODES.surface3, { noise: { mode: 'none' } });
    const errs = (['q1', 'q4', 'q7'] as const).map(t => ({ kind: 'flip' as const, t }));
    const n = runNight(lvl, lvl.solution, 'zero', errs, 1, { snapshots: false });
    expect(n.pass).toBe(false);
    expect(n.fidelity).toBeLessThan(1e-9);
  });
  it('correction() program round-trips through the text form', () => {
    const p = correction(CODES.surface3);
    expect(parseProgram(printProgram(p)).prog).toEqual(p);
  });
});

describe('repeated syndrome extraction with readout errors', () => {
  const lvl = repeatedExtractionLevel();
  it('majority over 3 rounds survives any single readout fault or data X in round 0/1', () => {
    const r = testLevel(lvl, { morning: REPEATED_EXTRACTION });
    expect(fails(r)).toEqual([]);
    expect(r.nights.some(n => n.readoutFlips?.length)).toBe(true);
  });
  it('trap: a single round is fooled by one readout fault', () => {
    expect(testLevel(lvl, { morning: SINGLE_ROUND_EXTRACTION }).passed).toBe(false);
  });
  it('documented limit: an X between rounds 2 and 3 is seen once and not corrected in this cycle', () => {
    const n = runNight(lvl, lvl.solution, 'zero', [{ kind: 'flip', t: 'q2', round: 2 }], 1, { snapshots: false });
    expect(n.pass).toBe(false);
  });
});

describe('Monte Carlo + Wilson', () => {
  it('Wilson interval reference values', () => {
    const [lo, hi] = wilson(10, 100);
    expect(lo).toBeCloseTo(0.0552, 4); expect(hi).toBeCloseTo(0.1744, 4);
    expect(wilson(0, 50)[0]).toBe(0); expect(wilson(0, 50)[1]).toBeCloseTo(0.0713, 4);
  });
  const bit = codeLevel(CODES.rep3, { noise: { mode: 'random', p: 0.1, kinds: ['flip'] } });
  it('seeded and reproducible', () => {
    const a = monteCarlo(bit, { morning: R.BITFLIP_CORRECT }, { trials: 300, seed: 42 });
    const b = monteCarlo(bit, { morning: R.BITFLIP_CORRECT }, { trials: 300, seed: 42 });
    expect(b).toEqual(a);
    expect(a.ci95[0]).toBeLessThanOrEqual(a.rate); expect(a.ci95[1]).toBeGreaterThanOrEqual(a.rate);
  });
  it('sweep: bit-flip code logical rate matches 3p² − 2p³ within the 95% interval (widened ×1.5)', () => {
    // inputs |0>,|1> only: a logical X is harmless on |±> so other inputs would undercount
    const pts = sweep({ ...bit, inputs: ['zero', 'one'] }, { morning: R.BITFLIP_CORRECT }, [0.05, 0.15, 0.3], 1500, 7);
    for (const pt of pts) {
      const th = 3 * pt.p ** 2 - 2 * pt.p ** 3, half = (pt.ci95[1] - pt.ci95[0]) / 2;
      expect(Math.abs(pt.rate - th)).toBeLessThan(1.5 * half + 1e-3);
    }
    expect(pts[0].rate).toBeLessThan(pts[2].rate);
  });
  it('readout noise in a sweep hurts the single-round decoder more than the 3-round one', () => {
    const lv = repeatedExtractionLevel();
    const one = sweep(lv, { morning: SINGLE_ROUND_EXTRACTION }, [0.05], 800, 3, { readout: true, kinds: ['flip'] })[0];
    const three = sweep(lv, { morning: REPEATED_EXTRACTION }, [0.05], 800, 3, { readout: true, kinds: ['flip'] })[0];
    expect(three.rate).toBeLessThan(one.rate);
  });
});

describe('exporter with DLC gates', () => {
  it('emits y/s/sdg/cz/swap in Qiskit and QASM3', () => {
    const lvl = codeLevel(CODES.five, { noise: { mode: 'none' } });
    const n = runNight(lvl, lvl.solution, 'plus', [{ kind: 'both', t: 'q3' }], 1);
    const py = toQiskit(lvl, n, { prog: lvl.solution });
    for (const g of ['qc.s(q[1])', 'qc.y(q[2])', 'qc.swap(q[4], q[3])', 'qc.cz(q[5], q[1])']) expect(py).toContain(g);
    const qasm = toOpenQASM3(lvl, n, { prog: lvl.solution, dynamic: true });
    expect(qasm).toContain('swap q[4], q[3];'); expect(qasm).toContain('cz q[5], q[1];');
    expect(qasm).not.toContain('fell back');
  });
});

export type { LevelDef };

describe('NerdInfo with a code\'s own generators', () => {
  it('surface-code generators are reported (not the Shor set) and are all +1 after encoding', () => {
    const lvl = codeLevel(CODES.surface3, { noise: { mode: 'none' } });
    const n = runNight(lvl, { morning: [] }, 'random', [], 2, { nerd: true, stabilizers: CODES.surface3.stabilizers });
    const st = n.steps[n.steps.length - 1].snap.nerd!.stabilizers;
    expect(st.map(x => x.label)[0]).toBe('Z₂Z₃Z₅Z₆');
    expect(st.length).toBe(8);
    for (const x of st) expect(x.value).toBeCloseTo(1, 10);
  });
  it('LevelDef.stabilizers is used ahead of the 9-qubit Shor auto-detection; a Z error lights the right checks', () => {
    const lvl = { ...codeLevel(CODES.surface3, { noise: { mode: 'none' } }), stabilizers: CODES.surface3.stabilizers };
    const n = runNight(lvl, { morning: [] }, 'zero', [{ kind: 'phase', t: 'q5' }], 2, { nerd: true });
    const st = n.steps[n.steps.length - 1].snap.nerd!.stabilizers;
    expect(st.map(x => x.label)).toEqual(['Z₂Z₃Z₅Z₆', 'Z₄Z₅Z₇Z₈', 'Z₁Z₄', 'Z₆Z₉', 'X₁X₂X₄X₅', 'X₅X₆X₈X₉', 'X₂X₃', 'X₇X₈']);
    expect(st.map(x => Math.round(x.value))).toEqual([1, 1, 1, 1, -1, -1, 1, 1]);
    const five = { ...codeLevel(CODES.five, { noise: { mode: 'none' } }), stabilizers: CODES.five.stabilizers };
    const f = runNight(five, { morning: [] }, 'plus', [], 1, { nerd: true }).steps.at(-1)!.snap.nerd!.stabilizers;
    expect(f.map(x => x.label)).toEqual(['X₁Z₂Z₃X₄', 'X₂Z₃Z₄X₅', 'X₁X₃Z₄Z₅', 'Z₁X₂X₄Z₅']);
    for (const x of f) expect(x.value).toBeCloseTo(1, 10);
  });
});
