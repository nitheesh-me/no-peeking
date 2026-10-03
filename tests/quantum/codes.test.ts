import { describe, it, expect } from 'vitest';
import type { LevelDef, NoiseSpec, Program, QubbleId, BotId, GoalSpec } from '../../src/core/contracts';
import { testLevel, runNight, snapshot } from '../../src/quantum/vm';
import { QState, MAT, makeRng } from '../../src/quantum/sim';
import * as R from '../../src/quantum/reference';
import { logicalErrorCurve } from '../../src/quantum';

function mkLevel(o: { n: number; bots: number; encode: Program; noise: NoiseSpec; inputs?: LevelDef['inputs']; goal?: GoalSpec; classical?: boolean }): LevelDef {
  const qs = Array.from({ length: o.n }, (_, i) => `q${i + 1}` as QubbleId);
  return {
    id: 'test', chapter: 2, title: 'T',
    qubbles: qs.map((id, i) => ({ id, x: i, y: 0 })),
    bots: (['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as BotId[]).slice(0, o.bots).map((id, i) => ({ id, x: i, y: 1 })),
    toolbox: [], editable: ['morning'], fixedBedtime: o.encode,
    inputs: o.inputs ?? ['zero', 'one', 'plus', 'minus', 'plusI', 'random', 'random'],
    inputQubble: 'q1', noise: o.noise,
    goal: o.goal ?? { kind: 'state', dataQubits: qs, targetCircuit: o.encode },
    classical: o.classical,
    intro: [], hints: [], winLine: [], reveal: '', solution: {},
  };
}
const fails = (r: ReturnType<typeof testLevel>) => r.nights.filter(n => !n.pass).map(n => `${JSON.stringify(n.errors)} F=${n.fidelity.toFixed(4)} ${n.failReason} ${n.message ?? ''}`);

describe('3-qubit bit-flip code', () => {
  const lvl = mkLevel({ n: 3, bots: 2, encode: R.BITFLIP_ENCODE, noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1 } });
  it('corrects every single X for random states', () => {
    const r = testLevel(lvl, { morning: R.BITFLIP_CORRECT });
    expect(fails(r)).toEqual([]);
    expect(r.nights.length).toBe(13 * 4);
    expect(r.botsUsed).toBe(2);
  });
  it('one-bot RESET variant corrects every single X', () => {
    const r = testLevel(lvl, { morning: R.BITFLIP_CORRECT_ONE_BOT });
    expect(fails(r)).toEqual([]); expect(r.botsUsed).toBe(1);
  });
  it('doing nothing fails; phase errors are NOT corrected', () => {
    expect(testLevel(lvl, { morning: [] }).passed).toBe(false);
    const ph = mkLevel({ n: 3, bots: 2, encode: R.BITFLIP_ENCODE, noise: { mode: 'enumerate', kinds: ['phase'], maxErrors: 1 } });
    const r = testLevel(ph, { morning: R.BITFLIP_CORRECT });
    expect(r.passed).toBe(false);
    // ... but basis inputs |0>,|1> survive Z (it is only a phase)
    expect(r.nights.filter(n => n.input === 'zero' || n.input === 'one').every(n => n.pass)).toBe(true);
  });
  it('error discretization: x-wobbles of any angle are corrected with fidelity 1', () => {
    const w = mkLevel({ n: 3, bots: 2, encode: R.BITFLIP_ENCODE, noise: { mode: 'enumerate', kinds: ['wobble'], maxErrors: 1, wobbleAngles: [0.1, 0.6, 1.3, 2.2, 3.0] } });
    for (const seed of [1, 2, 3]) {
      const r = testLevel(w, { morning: R.BITFLIP_CORRECT }, seed);
      expect(fails(r)).toEqual([]);
      for (const n of r.nights) expect(n.fidelity).toBeGreaterThan(1 - 1e-9);
    }
  });
  it('without correction a wobble really damages the state', () => {
    const w = mkLevel({ n: 3, bots: 2, encode: R.BITFLIP_ENCODE, noise: { mode: 'fixed', errors: [{ kind: 'wobble', t: 'q2', axis: 'x', angle: 1.3 }] }, inputs: ['zero'] });
    const n = runNight(w, { morning: [] }, 'zero', [{ kind: 'wobble', t: 'q2', axis: 'x', angle: 1.3 }], 1);
    expect(n.fidelity).toBeCloseTo(Math.cos(0.65) ** 2, 9);
  });
  it('double errors defeat the code (logical flip)', () => {
    const d = mkLevel({ n: 3, bots: 2, encode: R.BITFLIP_ENCODE, noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 2 }, inputs: ['zero', 'one'] });
    const r = testLevel(d, { morning: R.BITFLIP_CORRECT });
    const doubles = r.nights.filter(n => n.errors.length === 2);
    expect(doubles.length).toBe(2 * 3);
    for (const n of doubles) { expect(n.pass).toBe(false); expect(n.fidelity).toBeLessThan(1e-9); }
    expect(r.nights.filter(n => n.errors.length < 2).every(n => n.pass)).toBe(true);
  });
  it('logical error rate ≈ 3p² − 2p³ (sampled)', () => {
    const N = 3000;
    for (const row of logicalErrorCurve([0.05, 0.2, 0.4], N, 77)) {
      const sd = Math.sqrt(row.theory * (1 - row.theory) / N);
      expect(Math.abs(row.logical - row.theory)).toBeLessThan(4.5 * sd + 1e-3);
    }
  });
});

describe('3-qubit phase-flip code', () => {
  const lvl = mkLevel({ n: 3, bots: 2, encode: R.PHASEFLIP_ENCODE, noise: { mode: 'enumerate', kinds: ['phase'], maxErrors: 1 } });
  it('corrects every single Z for random states', () => expect(fails(testLevel(lvl, { morning: R.PHASEFLIP_CORRECT }))).toEqual([]));
  it('encodes |+++>/|−−−>', () => {
    const z = runNight(lvl, { morning: [] }, 'zero', [], 1);
    expect(z.pass).toBe(true);
  });
  it('the bit-flip decoder alone misses phase errors', () => expect(testLevel(lvl, { morning: R.BITFLIP_CORRECT }).passed).toBe(false));
  it('z-wobbles are discretized and corrected', () => {
    const w = mkLevel({ n: 3, bots: 2, encode: R.PHASEFLIP_ENCODE, noise: { mode: 'enumerate', kinds: ['wobble'], maxErrors: 1, wobbleAxis: 'z' } as NoiseSpec });
    const r = testLevel(w, { morning: R.PHASEFLIP_CORRECT });
    expect(r.nights.some(n => n.errors.some(e => e.kind === 'wobble' && e.axis === 'z'))).toBe(true);
    expect(fails(r)).toEqual([]);
  });
});

describe('Shor 9-qubit code', () => {
  const lvl = mkLevel({ n: 9, bots: 2, encode: R.SHOR9_ENCODE, noise: { mode: 'enumerate', kinds: ['flip', 'phase', 'both'], maxErrors: 1 } });
  it('corrects every single X, Y, Z on any of the 9 qubbles (random states)', () => {
    const t0 = performance.now();
    const r = testLevel(lvl, { morning: R.SHOR9_CORRECT });
    const ms = performance.now() - t0;
    expect(fails(r)).toEqual([]);
    expect(r.nights.length).toBe(13 * 28);
    console.log(`[perf] Shor-9: ${r.nights.length} nights, avg ${r.avgSteps.toFixed(1)} steps, ${ms.toFixed(0)} ms, max live qubits ${Math.max(...r.nights.map(n => n.maxLiveQubits))}`);
  });
  it('Shor-9 night with full snapshots is fast enough for the UI', () => {
    const t = performance.now();
    const n = runNight(lvl, { morning: R.SHOR9_CORRECT }, 'random', [{ kind: 'both', t: 'q5' }], 4);
    const ms = performance.now() - t;
    expect(n.pass).toBe(true);
    console.log(`[perf] Shor-9 night with snapshots: ${n.steps.length} steps in ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1500);
  });
  it('incremental snapshot cache equals a from-scratch snapshot at every step', () => {
    for (const errs of [[{ kind: 'wobble' as const, t: 'q2' as QubbleId, axis: 'x' as const, angle: 1.1 }], [{ kind: 'both' as const, t: 'q7' as QubbleId }]]) {
      const A = runNight(lvl, { morning: R.SHOR9_CORRECT }, 'random', errs, 9);
      const B = runNight(lvl, { morning: R.SHOR9_CORRECT }, 'random', errs, 9, { noSnapCache: true });
      expect(A.steps.length).toBe(B.steps.length);
      A.steps.forEach((st, i) => {
        const b = B.steps[i].snap;
        for (const q of Object.keys(b.bloch)) for (const c of ['x', 'y', 'z'] as const)
          expect(Math.abs((st.snap.bloch as any)[q][c] - (b.bloch as any)[q][c])).toBeLessThan(1e-9);
        expect(st.snap.links.map(l => l.a + l.b + l.strength.toFixed(6))).toEqual(b.links.map(l => l.a + l.b + l.strength.toFixed(6)));
      });
      expect(A.steps[A.steps.length - 1].snap.logicalFidelity!).toBeGreaterThan(1 - 1e-9);
    }
  });
  it('corrects x-wobbles too', () => {
    const w = mkLevel({ n: 9, bots: 2, encode: R.SHOR9_ENCODE, noise: { mode: 'enumerate', kinds: ['wobble'], maxErrors: 1 }, inputs: ['random', 'plusI'] });
    expect(fails(testLevel(w, { morning: R.SHOR9_CORRECT }))).toEqual([]);
  });
  it('worst case: 17 live qubits (8 bots never measured until the end) still fast', () => {
    const bots: BotId[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const prog: Program = [
      ...bots.map((b, i) => ({ op: 'HIGHFIVE' as const, from: `q${i + 1}` as QubbleId, to: b })),
      ...bots.map(b => ({ op: 'SPIN' as const, t: b })),
      ...bots.map((b, i) => ({ op: 'HIGHFIVE' as const, from: b, to: `q${i + 2}` as QubbleId })),
      ...bots.map(b => ({ op: 'LISTEN' as const, t: b })),
    ];
    const big = mkLevel({ n: 9, bots: 8, encode: R.SHOR9_ENCODE, noise: { mode: 'none' } });
    const t0 = performance.now();
    let maxN = 0;
    for (let i = 0; i < 20; i++) maxN = Math.max(maxN, runNight(big, { morning: prog }, 'random', [], i, { snapshots: false }).maxLiveQubits);
    const ms = performance.now() - t0;
    expect(maxN).toBe(17);
    console.log(`[perf] 17-qubit worst case: 20 nights × ${prog.length} ops in ${ms.toFixed(0)} ms`);
    const t1 = performance.now();
    const n = runNight(big, { morning: prog }, 'plus', [], 1, { snapshots: true });
    console.log(`[perf] 17-qubit night WITH snapshots: ${n.steps.length} steps in ${(performance.now() - t1).toFixed(0)} ms`);
  });
});

describe('VM semantics', () => {
  const lvl = mkLevel({ n: 1, bots: 1, encode: [], noise: { mode: 'none' }, inputs: ['plus'] });
  it('PEEK on a qubble in a no-peek level wakes it (night fails, collapse is real)', () => {
    const n = runNight(lvl, { morning: [{ op: 'PEEK', t: 'q1' }] }, 'plus', [], 3);
    expect(n.failReason).toBe('woke'); expect(n.woke).toEqual(['q1']);
    expect(n.fidelity).toBeCloseTo(0.5, 9);
  });
  it('empty program keeps the dream', () => expect(runNight(lvl, {}, 'plus', [], 1).pass).toBe(true));
  it('LISTEN on a qubble is an error; maxSteps guard', () => {
    expect(runNight(lvl, { morning: [{ op: 'LISTEN', t: 'q1' as never }] }, 'plus', [], 1).failReason).toBe('error');
    const loop = runNight(lvl, { morning: [{ op: 'LABEL', name: 'x' }, { op: 'JUMP', label: 'x' }] }, 'plus', [], 1);
    expect(loop.failReason).toBe('maxSteps'); expect(loop.stepCount).toBe(500);
  });
  it('trace has phase/line/gate events with snapshots; line events carry part', () => {
    const n = runNight(lvl, { morning: [{ op: 'HIGHFIVE', from: 'q1', to: 'a' }] }, 'plus', [], 1);
    const g = n.steps.find(s => s.ev.k === 'gate')!;
    expect(g.snap.links.length).toBe(1);
    expect(g.snap.links[0].strength).toBeCloseTo(1, 6);
    expect(n.steps.find(s => s.ev.k === 'line')!.ev).toMatchObject({ part: 'mine' });
    expect(n.seed).toBe(1);
  });
  it('state+report: parity check reports post-noise parity and leaves the state alone', () => {
    const l = mkLevel({ n: 2, bots: 1, encode: [{ op: 'HIGHFIVE', from: 'q1', to: 'q2' }], noise: { mode: 'enumerate', kinds: ['flip'], maxErrors: 1 },
      goal: { kind: 'state+report', dataQubits: ['q1', 'q2'], targetCircuit: [{ op: 'HIGHFIVE', from: 'q1', to: 'q2' }], report: { bot: 'a', expect: 'parity', of: ['q1', 'q2'] } } });
    const r = testLevel(l, { morning: R.PARITY_CHECK });
    expect(fails(r)).toEqual([]);
    expect(r.nights.some(n => n.expectedReport === 1)).toBe(true);
    // trap: listening without high-fiving reports QUIET always
    expect(testLevel(l, { morning: [{ op: 'LISTEN', t: 'a' }] }).nights.some(n => n.failReason === 'wrong-report')).toBe(true);
    // trap: peeking
    expect(testLevel(l, { morning: [{ op: 'PEEK', t: 'q1' }] }).passed).toBe(false);
  });
});
