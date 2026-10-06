/**
 * Opt-in SEMANTIC check of the exporter: the exported Qiskit / OpenQASM 3 circuits are run on Qiskit Aer
 * (statevector, with mid-circuit measurement + feed-forward) and the final data-qubit state is compared with the
 * game's ideal target. Needs a python with qiskit + qiskit-aer (+ qiskit-qasm3-import):
 *   QISKIT_PYTHON=/path/to/python npx vitest run tests/quantum/export-aer.test.ts
 * Skipped otherwise.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore node types are not installed (tests run in node via vitest)
import { execFileSync } from 'node:child_process';
// @ts-ignore node types are not installed
import { mkdtempSync, writeFileSync } from 'node:fs';
// @ts-ignore node types are not installed
import { tmpdir } from 'node:os';
// @ts-ignore node types are not installed
import { join } from 'node:path';
import type { BotId, ErrorEvent, LevelDef, Program, QubbleId } from '../../src/core/contracts';
import { runNight, buildTarget } from '../../src/quantum/vm';
import { toQiskit, toOpenQASM3 } from '../../src/quantum/export';
import { transcribe } from '../../src/ui/nerd/qmath';
import * as R from '../../src/quantum/reference';
declare const process: { env: Record<string, string | undefined> };

function mkLevel(n: number, bots: number, encode: Program): LevelDef {
  const qs = Array.from({ length: n }, (_, i) => `q${i + 1}` as QubbleId);
  return {
    id: 'aer', chapter: 2, title: 'Aer',
    qubbles: qs.map((id, i) => ({ id, x: i, y: 0 })),
    bots: (['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as BotId[]).slice(0, bots).map((id, i) => ({ id, x: i, y: 1 })),
    toolbox: [], editable: ['morning'], fixedBedtime: encode,
    inputs: ['zero'], inputQubble: 'q1', noise: { mode: 'none' },
    goal: { kind: 'state', dataQubits: qs, targetCircuit: encode },
    intro: [], hints: [], winLine: [], reveal: '', solution: {},
  };
}

const PY = `
import sys, json
from qiskit import transpile
from qiskit.quantum_info import Statevector, partial_trace, state_fidelity
from qiskit_aer import AerSimulator
import qiskit.qasm3 as q3
sim = AerSimulator(method='statevector')
out = []
for c in json.load(open(sys.argv[1])):
    if c['lang'] == 'py':
        g = {'__name__': 'export'}; exec(c['code'], g); qc = g['qc']
    else:
        qc = q3.loads(c['code'])
    qc.save_statevector()
    t = transpile(qc, sim)
    fs = []
    for seed in c['seeds']:
        sv = sim.run(t, shots=1, seed_simulator=seed).result().get_statevector()
        rho = partial_trace(sv, list(range(c['nData'], qc.num_qubits)))
        tgt = Statevector([complex(a, b) for a, b in zip(c['re'], c['im'])])
        fs.append(state_fidelity(rho, tgt))
    out.append(min(fs))
print(json.dumps(out))
`;

const py = process.env.QISKIT_PYTHON ?? 'python3';
let hasAer = false;
try { execFileSync(py, ['-c', 'import qiskit, qiskit_aer, qiskit_qasm3_import'], { stdio: 'ignore' }); hasAer = true; } catch { /* skip */ }

describe.skipIf(!hasAer)('exporter semantics on Qiskit Aer', () => {
  it('executed path (Pauli errors) and dynamic circuit (any error, any outcome) restore the ideal state', () => {
    const ARB = { theta: 1.1, phi: 0.7 };
    const bit = mkLevel(3, 2, R.BITFLIP_ENCODE), ph = mkLevel(3, 2, R.PHASEFLIP_ENCODE), shor = mkLevel(9, 2, R.SHOR9_ENCODE);
    const cases: { lvl: LevelDef; prog: Program; errs: ErrorEvent[]; dynamicOnly?: boolean }[] = [
      ...[[], [{ kind: 'flip', t: 'q1' }], [{ kind: 'flip', t: 'q2' }], [{ kind: 'flip', t: 'q3' }]].map(errs => ({ lvl: bit, prog: R.BITFLIP_CORRECT, errs: errs as ErrorEvent[] })),
      { lvl: bit, prog: R.BITFLIP_CORRECT_ONE_BOT, errs: [{ kind: 'flip', t: 'q2' }] },
      { lvl: bit, prog: R.BITFLIP_CORRECT, errs: [{ kind: 'wobble', t: 'q2', axis: 'x', angle: 1.3 }], dynamicOnly: true },
      ...['q1', 'q2', 'q3'].map(t => ({ lvl: ph, prog: R.PHASEFLIP_CORRECT, errs: [{ kind: 'phase', t }] as ErrorEvent[] })),
      { lvl: shor, prog: R.SHOR9_CORRECT, errs: [{ kind: 'both', t: 'q5' }] },
      { lvl: shor, prog: R.SHOR9_CORRECT, errs: [{ kind: 'phase', t: 'q8' }] },
      { lvl: shor, prog: R.SHOR9_CORRECT, errs: [{ kind: 'wobble', t: 'q4', axis: 'x', angle: 0.9 }], dynamicOnly: true },
    ];
    const jobs: unknown[] = [];
    for (const c of cases) {
      const night = runNight(c.lvl, { morning: c.prog }, ARB, c.errs, 5, { snapshots: false });
      expect(night.pass).toBe(true);
      const t = buildTarget(c.lvl, c.lvl.goal.kind === 'classical' ? [] : c.lvl.goal.dataQubits, (c.lvl.goal as { targetCircuit: Program }).targetCircuit, ARB);
      if (t.kind !== 'pure') throw new Error('pure target expected');
      const base = { nData: c.lvl.qubbles.length, re: [...t.re], im: [...t.im] };
      for (const dynamic of c.dynamicOnly ? [true] : [false, true]) {
        const opts = { prog: { morning: c.prog }, dynamic };
        const seeds = dynamic ? [1, 2, 3, 4, 5, 6] : [1];
        jobs.push({ ...base, lang: 'py', code: toQiskit(c.lvl, night, opts), seeds });
        jobs.push({ ...base, lang: 'qasm', code: toOpenQASM3(c.lvl, night, opts), seeds });
      }
      if (!c.dynamicOnly) { // the notebook's fallback transcription (executed path, observed-value conditions)
        jobs.push({ ...base, lang: 'py', code: transcribe(night, c.lvl, 'qiskit', true, { morning: c.prog }).replace('print(qc.draw())', ''), seeds: [1] });
        jobs.push({ ...base, lang: 'qasm', code: transcribe(night, c.lvl, 'qasm3', true, { morning: c.prog }), seeds: [1] });
      }
    }
    const dir = mkdtempSync(join(tmpdir(), 'nopeek-aer-'));
    writeFileSync(join(dir, 'jobs.json'), JSON.stringify(jobs));
    writeFileSync(join(dir, 'run.py'), PY);
    const fids: number[] = JSON.parse(execFileSync(py, [join(dir, 'run.py'), join(dir, 'jobs.json')], { encoding: 'utf8' }));
    expect(fids.length).toBe(jobs.length);
    for (const f of fids) expect(f).toBeGreaterThan(1 - 1e-9);
  }, 240_000);
});
