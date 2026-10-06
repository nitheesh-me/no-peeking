import { describe, it, expect } from 'vitest';
// @ts-ignore node types are not installed (tests run in node via vitest)
import { execFileSync } from 'node:child_process';
// @ts-ignore node types are not installed (tests run in node via vitest)
import { mkdtempSync, writeFileSync } from 'node:fs';
// @ts-ignore node types are not installed (tests run in node via vitest)
import { tmpdir } from 'node:os';
// @ts-ignore node types are not installed (tests run in node via vitest)
import { join } from 'node:path';
import type { BotId, ErrorEvent, GoalSpec, LevelDef, NerdInfo, NoiseSpec, Program, QubbleId } from '../../src/core/contracts';
import { runNight } from '../../src/quantum/vm';
import { quantum } from '../../src/quantum';
import { toQiskit, toOpenQASM3 } from '../../src/quantum/export';
import type { NerdInfoX } from '../../src/quantum/nerd';
import * as R from '../../src/quantum/reference';
declare const process: { env: Record<string, string | undefined> };

function mkLevel(o: { n: number; bots: number; encode: Program; noise?: NoiseSpec; goal?: GoalSpec }): LevelDef {
  const qs = Array.from({ length: o.n }, (_, i) => `q${i + 1}` as QubbleId);
  return {
    id: 'nerd-test', chapter: 2, title: 'Nerd',
    qubbles: qs.map((id, i) => ({ id, x: i, y: 0 })),
    bots: (['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as BotId[]).slice(0, o.bots).map((id, i) => ({ id, x: i, y: 1 })),
    toolbox: [], editable: ['morning'], fixedBedtime: o.encode,
    inputs: ['zero'], inputQubble: 'q1', noise: o.noise ?? { mode: 'none' },
    goal: o.goal ?? { kind: 'state', dataQubits: qs, targetCircuit: o.encode },
    intro: [], hints: [], winLine: [], reveal: '', solution: {},
  };
}
const nerdRun = (lvl: LevelDef, morning: Program, input: LevelDef['inputs'][number], errors: ErrorEvent[] = [], seed = 7) =>
  runNight(lvl, { morning }, input, errors, seed, { snapshots: true, nerd: true });
const lastNerd = (n: ReturnType<typeof nerdRun>): NerdInfo => n.steps[n.steps.length - 1].snap.nerd!;
const stab = (ni: NerdInfo, label: string) => { const s = ni.stabilizers.find(x => x.label === label); if (!s) throw new Error('no ' + label); return s.value; };
const ARB = { theta: 1.1, phi: 0.7 };

describe('NerdInfo', () => {
  it('Bell pair: MI = 2, S = 1, purity ½, Bloch length 0', () => {
    const lvl = mkLevel({ n: 2, bots: 0, encode: R.P('SPIN q1\nHIGHFIVE q1 -> q2') });
    const ni = lastNerd(nerdRun(lvl, [], 'zero'));
    expect(ni.order).toEqual(['q1', 'q2']);
    for (const q of ['q1', 'q2'] as const) {
      const r = ni.reduced[q];
      expect(r.entropy).toBeCloseTo(1, 9); expect(r.purity).toBeCloseTo(0.5, 9);
      expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(0, 9);
    }
    expect(ni.mi[0][1]).toBeCloseTo(2, 9); expect(ni.mi[1][0]).toBeCloseTo(2, 9);
    expect(ni.mi[0][0]).toBeCloseTo(2, 9);
    expect(ni.amps.map(a => a.ket).sort()).toEqual(['00', '11']);
    expect(ni.fidelity).toBeCloseTo(1, 9);
  });

  it('bit-flip encoded: ⟨Z₁Z₂⟩ = ⟨Z₂Z₃⟩ = 1; after X on q2 both −1', () => {
    const lvl = mkLevel({ n: 3, bots: 2, encode: R.BITFLIP_ENCODE });
    const ni = lastNerd(nerdRun(lvl, [], ARB));
    expect(stab(ni, 'Z₁Z₂')).toBeCloseTo(1, 9); expect(stab(ni, 'Z₂Z₃')).toBeCloseTo(1, 9);
    const hit = lastNerd(nerdRun(lvl, [], ARB, [{ kind: 'flip', t: 'q2' }]));
    expect(stab(hit, 'Z₁Z₂')).toBeCloseTo(-1, 9); expect(stab(hit, 'Z₂Z₃')).toBeCloseTo(-1, 9);
    expect(hit.fidelity).toBeLessThan(0.01);
  });

  it('phase-flip encoded: ⟨X₁X₂⟩ = ⟨X₂X₃⟩ = 1', () => {
    const lvl = mkLevel({ n: 3, bots: 2, encode: R.PHASEFLIP_ENCODE });
    const ni = lastNerd(nerdRun(lvl, [], ARB));
    expect(stab(ni, 'X₁X₂')).toBeCloseTo(1, 9); expect(stab(ni, 'X₂X₃')).toBeCloseTo(1, 9);
  });

  it('amplitudes normalised, kets in `order` incl. classical bots, record = measure events, on every step', () => {
    const lvl = mkLevel({ n: 3, bots: 2, encode: R.BITFLIP_ENCODE });
    const night = nerdRun(lvl, R.BITFLIP_CORRECT, ARB, [{ kind: 'flip', t: 'q3' }]);
    expect(night.pass).toBe(true);
    const meas: { who: string; bit: number }[] = [];
    for (const st of night.steps) {
      if (st.ev.k === 'measure') meas.push({ who: st.ev.t, bit: st.ev.result });
      const ni = st.snap.nerd!;
      expect(ni).toBeDefined();
      expect(ni.order).toEqual(['q1', 'q2', 'q3', 'a', 'b']);
      expect(ni.amps.reduce((s, a) => s + a.re ** 2 + a.im ** 2, 0)).toBeCloseTo(1, 9);
      expect(ni.truncated).toBe(false);
      for (const a of ni.amps) expect(a.ket).toMatch(/^[01]{5}$/);
      expect(ni.record).toEqual(meas);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) expect(ni.mi[i][j]).toBeCloseTo(ni.mi[j][i], 12);
    }
    // syndrome for X on q3: a = q1⊕q2 = 0, b = q2⊕q3 = 1; after LISTEN the bots are classical and show in the kets
    expect(meas).toEqual([{ who: 'a', bit: 0 }, { who: 'b', bit: 1 }]);
    const fin = lastNerd(night);
    for (const a of fin.amps) expect(a.ket.slice(3)).toBe('01');
    expect(fin.fidelity).toBeCloseTo(1, 9);
    // α|000⟩+β|111⟩: probabilities cos²(θ/2), sin²(θ/2)
    const p = Object.fromEntries(fin.amps.map(a => [a.ket, a.re ** 2 + a.im ** 2]));
    expect(p['00001']).toBeCloseTo(Math.cos(ARB.theta / 2) ** 2, 9);
    expect(p['11101']).toBeCloseTo(Math.sin(ARB.theta / 2) ** 2, 9);
  });

  it('Shor-9: all 8 generators +1 after encoding; Z-error flips the right X-check', () => {
    const lvl = mkLevel({ n: 9, bots: 2, encode: R.SHOR9_ENCODE });
    const ni = lastNerd(nerdRun(lvl, [], 'random'));
    const gens = ['Z₁Z₂', 'Z₂Z₃', 'Z₄Z₅', 'Z₅Z₆', 'Z₇Z₈', 'Z₈Z₉', 'X₁X₂X₃X₄X₅X₆', 'X₄X₅X₆X₇X₈X₉'];
    expect(ni.stabilizers.slice(0, 8).map(s => s.label)).toEqual(gens);
    for (const g of gens) expect(stab(ni, g)).toBeCloseTo(1, 9);
    const hit = lastNerd(nerdRun(lvl, [], 'random', [{ kind: 'phase', t: 'q8' }]));
    expect(stab(hit, 'X₁X₂X₃X₄X₅X₆')).toBeCloseTo(1, 9);
    expect(stab(hit, 'X₄X₅X₆X₇X₈X₉')).toBeCloseTo(-1, 9);
    // full correction run stays correct with nerd on
    const full = nerdRun(lvl, R.SHOR9_CORRECT, 'random', [{ kind: 'both', t: 'q5' }]);
    expect(full.pass).toBe(true);
    expect((lastNerd(full) as NerdInfoX).miScope).toBe('all');
  });

  it('>10 live qubits: MI restricted to data qubits', () => {
    const lvl = mkLevel({ n: 9, bots: 2, encode: R.SHOR9_ENCODE });
    const ni = lastNerd(nerdRun(lvl, R.P('HIGHFIVE q1 -> a\nSPIN b'), 'plus')) as NerdInfoX;
    expect(ni.liveQubits).toBe(11);
    expect(ni.miScope).toBe('data');
    expect(ni.mi[9][10]).toBe(0);
    expect(ni.mi[9][9]).toBeCloseTo(2, 9); // diagonal still 2·S (S(a) = 1)
  });

  it('nerd off ⇒ no nerd info; QuantumAPI forwards opts; snapshots unchanged', () => {
    const lvl = mkLevel({ n: 3, bots: 2, encode: R.BITFLIP_ENCODE });
    const off = quantum.runNight(lvl, { morning: R.BITFLIP_CORRECT }, ARB, [], 3);
    const on = quantum.runNight(lvl, { morning: R.BITFLIP_CORRECT }, ARB, [], 3, { nerd: true });
    expect(off.steps.every(s => s.snap.nerd === undefined)).toBe(true);
    expect(on.steps.every(s => s.snap.nerd !== undefined)).toBe(true);
    expect(on.steps.map(s => s.snap.bloch)).toEqual(off.steps.map(s => s.snap.bloch));
    expect(quantum.testLevel({ ...lvl, solution: { morning: R.BITFLIP_CORRECT } }, { morning: R.BITFLIP_CORRECT }).nights[0].steps[0].snap.nerd).toBeUndefined();
  });
});

// ───────────── exporter ─────────────
const bitLvl = mkLevel({ n: 3, bots: 2, encode: R.BITFLIP_ENCODE });
const bitNight = runNight(bitLvl, { morning: R.BITFLIP_CORRECT }, ARB, [{ kind: 'flip', t: 'q1' }], 11);
const shorLvl = mkLevel({ n: 9, bots: 2, encode: R.SHOR9_ENCODE, noise: { mode: 'none' } });
const shorNight = runNight(shorLvl, { morning: R.SHOR9_CORRECT }, 'random', [{ kind: 'wobble', t: 'q4', axis: 'x', angle: 0.9 }], 5);
const loopLvl = mkLevel({ n: 1, bots: 1, encode: [] });
const loopProg = R.P('top:\nSPIN a\nLISTEN a\nRESET a\nIF a BEEP -> top');
const loopNight = runNight(loopLvl, { morning: loopProg }, 'zero', [], 2);

describe('exporter', () => {
  it('Qiskit executed path: init, gates, named measurements, errors, decisions', () => {
    const py = toQiskit(bitLvl, bitNight, { prog: { morning: R.BITFLIP_CORRECT } });
    expect(py).toContain('from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister');
    expect(py).toContain('q = QuantumRegister(5, "q")  # q[0]=q1 q[1]=q2 q[2]=q3 q[3]=a q[4]=b');
    expect(py).toContain('qc.ry(1.1, q[0])'); expect(py).toContain('qc.p(0.7, q[0])');
    expect(py).toContain('qc.cx(q[0], q[1])');
    expect(py).toContain('# gremlin: Flipper (bit flip) on q1');
    expect(py).toContain('qc.measure(q[3], m_a[0])');
    expect(py).toContain('# IF a BEEP and b QUIET -> fix1 (taken) [lights: a=1 b=0]');
    expect(py).toMatch(/qc\.x\(q\[0\]\)\n(.*\n)*.*qc\.x\(q\[0\]\)/); // error then the fix
    expect(py).toContain('level nerd-test'); expect(py).toContain('seed=11');
    const noErr = toQiskit(bitLvl, bitNight, { includeErrors: false });
    expect(noErr).toContain('# gremlin error omitted');
    expect(noErr).toContain('# WARNING: the gremlin errors are omitted');
    expect(toQiskit(bitLvl, bitNight, { includeErrors: false, prog: { morning: R.BITFLIP_CORRECT }, dynamic: true })).not.toContain('WARNING');
  });

  it('OpenQASM 3 executed path', () => {
    const qasm = toOpenQASM3(shorLvl, shorNight, { prog: { morning: R.SHOR9_CORRECT } });
    expect(qasm).toMatch(/^\/\/ NO PEEKING!/);
    expect(qasm).toContain('OPENQASM 3.0;\ninclude "stdgates.inc";');
    expect(qasm).toContain('qubit[11] q;');
    expect(qasm).toContain('bit[4] m_a;');
    expect(qasm).toContain('rx(0.9) q[3];');
    expect(qasm).toContain('reset q[9];');
    expect(qasm).toContain('m_a[0] = measure q[9];');
  });

  it('dynamic circuit for forward-only programs', () => {
    const py = toQiskit(bitLvl, bitNight, { prog: { morning: R.BITFLIP_CORRECT }, dynamic: true });
    expect(py).toContain('DYNAMIC CIRCUIT');
    expect(py).toContain('with qc.if_test((m_a[0], 1)):\n    with qc.if_test((m_b[0], 0)):\n        qc.x(q[0])');
    expect(py).toContain('with qc.if_test((m_a[0], 1)):\n    with qc.if_test((m_b[0], 1)):\n        qc.x(q[1])');
    const qasm = toOpenQASM3(bitLvl, bitNight, { prog: { morning: R.BITFLIP_CORRECT }, dynamic: true });
    expect(qasm).toContain('if (m_a[0] == true) {\n  if (m_b[0] == false) {\n    x q[0];\n  }\n}');
    expect(qasm).toContain('if (m_a[0] == false) {\n  if (m_b[0] == true) {\n    x q[2];\n  }\n}');
    const shor = toOpenQASM3(shorLvl, shorNight, { prog: { morning: R.SHOR9_CORRECT }, dynamic: true });
    expect(shor).toContain('if (m_a[3] == true) {\n  if (m_b[3] == false) {\n    z q[0];\n  }\n}');
    expect(shor).not.toContain('fell back');
  });

  it('loops fall back to the executed path, and say so', () => {
    const py = toQiskit(loopLvl, loopNight, { prog: { morning: loopProg }, dynamic: true });
    expect(py).toContain('fell back to the executed path');
    expect(py).toContain('jumps backwards');
  });

  // Optional round trip: QISKIT_PYTHON=/path/to/python (or python3 with qiskit installed).
  const py = process.env.QISKIT_PYTHON ?? 'python3';
  let hasQiskit = false;
  try { execFileSync(py, ['-c', 'import qiskit'], { stdio: 'ignore' }); hasQiskit = true; } catch { /* skip */ }
  it.skipIf(!hasQiskit)('round trip through Qiskit (python) and qiskit.qasm3.loads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nopeek-'));
    const cases = [
      { lvl: bitLvl, night: bitNight, prog: { morning: R.BITFLIP_CORRECT } },
      { lvl: shorLvl, night: shorNight, prog: { morning: R.SHOR9_CORRECT } },
      { lvl: loopLvl, night: loopNight, prog: { morning: loopProg } },
    ];
    let k = 0;
    for (const c of cases) for (const dynamic of [false, true]) {
      const f = join(dir, `c${k++}.py`);
      writeFileSync(f, toQiskit(c.lvl, c.night, { prog: c.prog, dynamic }) + '\nassert qc.num_qubits > 0\n');
      execFileSync(py, [f], { stdio: 'pipe' });
      const qf = join(dir, `c${k++}.qasm`);
      writeFileSync(qf, toOpenQASM3(c.lvl, c.night, { prog: c.prog, dynamic }));
      execFileSync(py, ['-c', `import sys, qiskit.qasm3 as q3; c = q3.loads(open(sys.argv[1]).read()); assert c.num_qubits > 0`, qf], { stdio: 'pipe' });
    }
  }, 120_000);
});
