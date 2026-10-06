/** Lab-notebook maths (src/ui/nerd/qmath.ts) and the nerd decoder / recoverable fidelity (src/quantum/nerd.ts). */
import { describe, it, expect } from 'vitest';
import type { BotId, ErrorEvent, LevelDef, NerdInfo, Program, QubbleId } from '../../src/core/contracts';
import { runNight } from '../../src/quantum/vm';
import { stabilizerSet, codeDecoder } from '../../src/quantum/nerd';
import * as R from '../../src/quantum/reference';
import { buildCircuit, controlDeps, measuredObservables, syndromeOf, transcribe, fmtPhase, type Col } from '../../src/ui/nerd/qmath';

function mkLevel(n: number, bots: number, encode: Program): LevelDef {
  const qs = Array.from({ length: n }, (_, i) => `q${i + 1}` as QubbleId);
  return {
    id: 'qm', chapter: 2, title: 'QM',
    qubbles: qs.map((id, i) => ({ id, x: i, y: 0 })),
    bots: (['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as BotId[]).slice(0, bots).map((id, i) => ({ id, x: i, y: 1 })),
    toolbox: [], editable: ['morning'], fixedBedtime: encode,
    inputs: ['zero'], inputQubble: 'q1', noise: { mode: 'none' },
    goal: { kind: 'state', dataQubits: qs, targetCircuit: encode },
    intro: [], hints: [], winLine: [], reveal: '', solution: {},
  };
}
const ARB = { theta: 1.1, phi: 0.7 };
const bit = mkLevel(3, 2, R.BITFLIP_ENCODE), ph = mkLevel(3, 2, R.PHASEFLIP_ENCODE), shor = mkLevel(9, 2, R.SHOR9_ENCODE);
const run = (lvl: LevelDef, morning: Program, errs: ErrorEvent[] = [], seed = 3) =>
  runNight(lvl, { morning }, ARB, errs, seed, { snapshots: true, nerd: true });
const morningCols = (cols: Col[]) => cols.slice(cols.findIndex(c => c.k === 'barrier' && c.label === 'morning') + 1);
const nerdAt = (night: ReturnType<typeof run>, i: number): NerdInfo => night.steps[i].snap.nerd!;

describe('circuit model: classical control = exact control dependence', () => {
  it('phase-flip correction: closing SPINs are NOT controlled; only the fix is', () => {
    for (const errs of [[], [{ kind: 'phase', t: 'q2' }]] as ErrorEvent[][]) {
      const night = run(ph, R.PHASEFLIP_CORRECT, errs);
      const { cols, condKnown } = buildCircuit(night, true, { level: ph, prog: { morning: R.PHASEFLIP_CORRECT } });
      expect(condKnown).toBe(true);
      const m = morningCols(cols);
      const last3 = m.slice(-3);
      expect(last3.map(c => c.k === 'gate' && c.g)).toEqual(['H', 'H', 'H']);
      for (const c of last3) expect('cond' in c ? c.cond : undefined).toBeUndefined();
      for (const c of m) if (c.k === 'cnot' || c.k === 'measure') expect(c.cond).toBeUndefined();
      const fixes = m.filter(c => c.k === 'gate' && c.g === 'X');
      expect(fixes.length).toBe(errs.length);
      for (const f of fixes) expect((f as { cond?: string[] }).cond).toEqual(['a', 'b']);
    }
  });

  it('one-bot program (2-4): ops after a taken IF depend on a, and a loop-free fall-through does not', () => {
    const night = run(bit, R.BITFLIP_CORRECT_ONE_BOT, [{ kind: 'flip', t: 'q1' }]);
    expect(night.pass).toBe(true);
    const { cols } = buildCircuit(night, false, { level: bit, prog: { morning: R.BITFLIP_CORRECT_ONE_BOT } });
    const m = morningCols(cols);
    // first two CNOTs + LISTEN + RESET: unconditional
    expect(m.slice(0, 4).every(c => !('cond' in c) || c.cond === undefined)).toBe(true);
    // diff12 branch: CNOTs, second LISTEN, BOOP q1 all hinge on a's bits
    const rest = m.slice(4);
    expect(rest.length).toBeGreaterThan(0);
    for (const c of rest) expect((c as { cond?: string[] }).cond).toEqual(['a']);
  });

  it('Shor-9: block 2 syndrome extraction is not controlled by block 1 decisions', () => {
    const night = run(shor, R.SHOR9_CORRECT, [{ kind: 'flip', t: 'q2' }]);
    const { cols } = buildCircuit(night, false, { level: shor, prog: { morning: R.SHOR9_CORRECT } });
    for (const c of cols) if (c.k === 'cnot' || c.k === 'measure' || c.k === 'reset' || (c.k === 'gate' && c.g === 'H')) expect(c.cond).toBeUndefined();
    const xs = cols.filter(c => c.k === 'gate' && c.g === 'X');
    expect(xs.length).toBe(1);
    expect((xs[0] as { cond?: string[] }).cond).toEqual(['a', 'b']);
  });

  it('without the program, or with a program that does not match the trace: no controls, condKnown false', () => {
    const night = run(bit, R.BITFLIP_CORRECT, [{ kind: 'flip', t: 'q1' }]);
    const a = buildCircuit(night, false);
    expect(a.condKnown).toBe(false);
    expect(a.cols.some(c => 'cond' in c && c.cond)).toBe(false);
    const b = buildCircuit(night, false, { level: bit, prog: { morning: R.BITFLIP_CORRECT_ONE_BOT } });
    expect(b.condKnown).toBe(false);
    expect(b.cols.some(c => 'cond' in c && c.cond)).toBe(false);
  });

  it('controlDeps handles loops (an IF jumping back depends on itself)', () => {
    const prog = R.P('top:\nSPIN a\nLISTEN a\nRESET a\nIF a BEEP -> top\nBOOP q1');
    const { deps } = controlDeps([{ ops: prog, part: 'mine' }]);
    expect([...deps[1]]).toEqual([4]); // SPIN a runs again iff the IF loops
    expect([...deps[4]]).toEqual([4]);
    expect(deps[5].size).toBe(0);      // after the loop: always runs (if the loop ends)
  });
});

describe('what each LISTEN really measured (Heisenberg back-propagation)', () => {
  const obsLabels = (night: ReturnType<typeof run>) => [...measuredObservables(night).entries()].map(([i, o]) => {
    const ev = night.steps[i].ev as { t: string; result: 0 | 1 };
    return { who: ev.t, ...o, bit: ev.result, i };
  });
  const dawn = (night: ReturnType<typeof run>) => night.steps.findIndex(s => s.ev.k === 'phase' && s.ev.phase === 'morning');

  it('bit-flip: a ↔ Z₁Z₂, b ↔ Z₂Z₃; phase-flip: X₁X₂, X₂X₃ (the SPINs are folded in)', () => {
    expect(obsLabels(run(bit, R.BITFLIP_CORRECT)).map(o => o.label)).toEqual(['Z₁Z₂', 'Z₂Z₃']);
    expect(obsLabels(run(ph, R.PHASEFLIP_CORRECT)).map(o => o.label)).toEqual(['X₁X₂', 'X₂X₃']);
    expect(obsLabels(run(bit, R.BITFLIP_CORRECT_ONE_BOT)).map(o => o.label)).toEqual(['Z₁Z₂', 'Z₂Z₃']);
  });

  it('Shor-9: the eight generators, each bit = the generator value at dawn', () => {
    for (const errs of [[], [{ kind: 'flip', t: 'q5' }], [{ kind: 'phase', t: 'q8' }], [{ kind: 'both', t: 'q1' }]] as ErrorEvent[][]) {
      const night = run(shor, R.SHOR9_CORRECT, errs);
      const obs = obsLabels(night);
      expect(obs.map(o => o.label)).toEqual(['Z₁Z₂', 'Z₂Z₃', 'Z₄Z₅', 'Z₅Z₆', 'Z₇Z₈', 'Z₈Z₉', 'X₁X₂X₃X₄X₅X₆', 'X₄X₅X₆X₇X₈X₉']);
      const at = nerdAt(night, dawn(night));
      for (const o of obs) {
        const v = at.stabilizers.find(s => s.label === o.label)!.value;
        expect(o.random).toBe(false);
        expect((-1) ** o.bit).toBeCloseTo(o.sign * v, 9);
      }
    }
  });

  it('a bot in superposition gives a random bit; an untouched bot measures nothing', () => {
    const o1 = obsLabels(run(bit, R.P('SPIN a\nLISTEN a')));
    expect(o1[0].random).toBe(true);
    const o2 = obsLabels(run(bit, R.P('LISTEN b')));
    expect(o2[0]).toMatchObject({ label: 'I', sign: 1, random: false, bit: 0 });
    // BOOP on the bot before the CNOTs: it measures −Z₁Z₂ (BEEP when they match)
    const o3 = obsLabels(run(bit, R.P('BOOP a\nHIGHFIVE q1 -> a\nHIGHFIVE q2 -> a\nLISTEN a')));
    expect(o3[0]).toMatchObject({ label: 'Z₁Z₂', sign: -1, bit: 1 });
  });
});

describe('code stabilizers, decoder, recoverable fidelity', () => {
  it('stabilizerSet flags the code stabilizers (input-independent) and lists them first', () => {
    const fl = (l: LevelDef) => stabilizerSet(l).map(s => `${s.label}${s.code ? '+' : ''}`);
    expect(fl(bit)).toEqual(['Z₁Z₂+', 'Z₂Z₃+', 'X₁X₂', 'X₂X₃']);
    expect(fl(ph)).toEqual(['X₁X₂+', 'X₂X₃+', 'Z₁Z₂', 'Z₂Z₃']);
    expect(fl(shor)).toEqual(['Z₁Z₂+', 'Z₂Z₃+', 'Z₄Z₅+', 'Z₅Z₆+', 'Z₇Z₈+', 'Z₈Z₉+', 'X₁X₂X₃X₄X₅X₆+', 'X₄X₅X₆X₇X₈X₉+']);
    expect(stabilizerSet(mkLevel(1, 0, [])).length).toBe(0);
    // nerd snapshots carry the flag
    const ni = run(bit, []).steps.at(-1)!.snap.nerd!;
    expect(ni.stabilizers.map(s => s.code)).toEqual([true, true, false, false]);
  });

  it('lookup decoder: bit-flip table, Shor-9 has 22 distinct syndromes (degenerate Z errors share a row)', () => {
    const d = codeDecoder(stabilizerSet(bit))!;
    expect(d.gens).toEqual(['Z₁Z₂', 'Z₂Z₃']);
    expect(d.rows.map(r => `${r.syndrome}:${r.fix}`)).toEqual(['00:I', '10:X₁', '11:X₂', '01:X₃']);
    const s = codeDecoder(stabilizerSet(shor))!;
    expect(s.rows.length).toBe(22);
    expect(s.rows.find(r => r.fix === 'Z₁')!.syndrome).toBe('00000010');
    expect(s.rows.some(r => r.fix === 'Z₂')).toBe(false);
    expect(codeDecoder(stabilizerSet(mkLevel(2, 0, R.P('HIGHFIVE q1 -> q2'))))).toBeNull();
  });

  it('recoverable fidelity: 1 after any single correctable error or a wobble, < 1 after two flips; raw fidelity drops', () => {
    const afterNight = (night: ReturnType<typeof run>) => nerdAt(night, night.steps.findIndex(s => s.ev.k === 'phase' && s.ev.phase === 'morning'));
    const one = afterNight(run(bit, [], [{ kind: 'flip', t: 'q2' }]));
    expect(one.fidelity!).toBeLessThan(0.5);
    expect(one.recoverable!).toBeCloseTo(1, 9);
    const wob = afterNight(run(bit, [], [{ kind: 'wobble', t: 'q3', axis: 'x', angle: 1.3 }]));
    expect(wob.fidelity!).toBeLessThan(0.9);
    expect(wob.recoverable!).toBeCloseTo(1, 9);
    const two = afterNight(run(bit, [], [{ kind: 'flip', t: 'q1' }, { kind: 'flip', t: 'q2' }]));
    expect(two.recoverable!).toBeLessThan(0.99);
    const y = afterNight(run(shor, [], [{ kind: 'both', t: 'q5' }]));
    expect(y.recoverable!).toBeCloseTo(1, 9);
    // during the correction: 1 at dawn, after every LISTEN and at the end, and the raw fidelity climbs back to 1 ...
    const night = run(bit, R.BITFLIP_CORRECT, [{ kind: 'flip', t: 'q1' }]);
    const m = night.steps.findIndex(s => s.ev.k === 'phase' && s.ev.phase === 'morning');
    expect(nerdAt(night, m).recoverable!).toBeCloseTo(1, 9);
    night.steps.forEach((st, i) => { if (st.ev.k === 'measure') expect(nerdAt(night, i).recoverable!).toBeCloseTo(1, 9); });
    expect(night.steps.at(-1)!.snap.nerd!.recoverable!).toBeCloseTo(1, 9);
    expect(night.steps.at(-1)!.snap.nerd!.fidelity!).toBeCloseTo(1, 9);
    // ... but after only the FIRST syndrome HIGHFIVE (q1 → a) the bot holds q1's value, i.e. the logical bit:
    // the data alone is dephased, F_rec = |α|⁴ + |β|⁴. The second HIGHFIVE leaves only the parity in the bot.
    const firstCx = night.steps.findIndex((st, i) => i > m && st.ev.k === 'gate');
    const c2 = Math.cos(ARB.theta / 2) ** 2, s2 = 1 - c2;
    expect(nerdAt(night, firstCx).recoverable!).toBeCloseTo(c2 * c2 + s2 * s2, 9);
    expect(nerdAt(night, firstCx + 2).recoverable!).toBeCloseTo(1, 9);
    // no code (1 Qubble): no recoverable
    expect(run(mkLevel(1, 0, []), []).steps.at(-1)!.snap.nerd!.recoverable).toBeUndefined();
  });
});

describe('small helpers', () => {
  it('syndromeOf keeps a reused bot\'s whole history', () => {
    expect(syndromeOf([{ who: 'a', bit: 1 }, { who: 'b', bit: 0 }], ['a', 'b'])).toBe('a=1 b=0');
    expect(syndromeOf([{ who: 'a', bit: 1 }, { who: 'q1', bit: 1 }, { who: 'a', bit: 0 }], ['a', 'b'])).toBe('a=1,0');
  });
  it('fmtPhase uses a real minus sign', () => {
    expect(fmtPhase(-0.7)).toBe('−0.70');
    expect(fmtPhase(-Math.PI / 2)).toBe('−π/2');
  });
  it('transcribe fallback: input prep, nested single-bit conditions, valid syntax shapes', () => {
    const night = run(bit, R.BITFLIP_CORRECT, [{ kind: 'flip', t: 'q1' }]);
    const qasm = transcribe(night, bit, 'qasm3', true, { morning: R.BITFLIP_CORRECT });
    expect(qasm).toContain('ry(1.1) q[0];');
    expect(qasm).toContain('p(0.7) q[0];');
    expect(qasm).toContain('if (c[0] == true) {\n  if (c[1] == false) {\n    x q[0];\n  }\n}');
    const py = transcribe(night, bit, 'qiskit', true, { morning: R.BITFLIP_CORRECT });
    expect(py).toContain('with qc.if_test((qc.clbits[0], 1)):\n    with qc.if_test((qc.clbits[1], 0)):\n        qc.x(0)');
  });
});

// ───────────── phase 2 (live verification follow-ups) ─────────────
import { LEVELS } from '../../src/levels';
import { fixVerdict } from '../../src/quantum/nerd';
import { appliedCorrection } from '../../src/ui/nerd/qmath';

describe('phase 2: verdict, applied correction, loops, recoverable frame', () => {
  const L = (id: string) => LEVELS.find(l => l.id === id)!;
  const runL = (id: string, errs: ErrorEvent[], seed = 3) => runNight(L(id), L(id).solution, ARB, errs, seed, { snapshots: true, nerd: true });

  it('fixVerdict: same / equivalent (differs by a stabilizer) / logical / wrong', () => {
    const sh = stabilizerSet(shor), bf = stabilizerSet(bit);
    expect(fixVerdict(sh, { x: ['q5'], z: ['q4'] }, { x: ['q5'], z: ['q5'] })).toBe('equivalent'); // Z₄X₅ vs Y₅
    expect(fixVerdict(sh, { x: [], z: ['q2'] }, { x: [], z: ['q1'] })).toBe('equivalent');          // Z₂ vs Z₁
    expect(fixVerdict(bf, { x: ['q1'], z: [] }, { x: ['q1'], z: [] })).toBe('same');
    expect(fixVerdict(bf, { x: ['q2'], z: [] }, { x: ['q1'], z: [] })).toBe('wrong');
    expect(fixVerdict(bf, { x: ['q1', 'q2'], z: [] }, { x: ['q3'], z: [] })).toBe('logical');        // X₁X₂X₃ = X̄
    expect(fixVerdict(sh, { x: [], z: ['q1', 'q4', 'q7'] }, { x: [], z: [] })).toBe('logical');      // Z₁Z₄Z₇ ~ X̄ of Shor
  });

  it('appliedCorrection in the dawn frame: 2-3, phase code (BOOP between SPINs = Z), Shor-9 4-1 (decode frame)', () => {
    const a = runL('2-3', [{ kind: 'flip', t: 'q2' }]);
    expect(appliedCorrection(a, L('2-3'), L('2-3').solution)!.label).toBe('X₂');
    const p = runL('3-2', [{ kind: 'phase', t: 'q3' }]);
    expect(appliedCorrection(p, L('3-2'), L('3-2').solution)!.label).toBe('Z₃');
    const s = runL('4-1', [{ kind: 'both', t: 'q5' }]);
    const c = appliedCorrection(s, L('4-1'), L('4-1').solution)!;
    expect(c.label).toBe('Z₄X₅');
    expect(fixVerdict(stabilizerSet(L('4-1')), c, { x: ['q5'], z: ['q5'] })).toBe('equivalent');
    const clean = runL('4-1', []);
    expect(appliedCorrection(clean, L('4-1'), L('4-1').solution)!.label).toBe('I');
    expect(appliedCorrection(a, L('2-3'), undefined)).toBeNull();
  });

  it('loops: the first pass of a loop body is not drawn as controlled; later passes are', () => {
    const prog = R.P('top:\nSPIN a\nLISTEN a\nRESET a\nIF a BEEP -> top\nHIGHFIVE q1 -> a');
    let seen = false;
    for (let seed = 1; seed < 40 && !seen; seed++) {
      const night = runNight(bit, { morning: prog }, 'zero', [], seed, { snapshots: true });
      const m = morningCols(buildCircuit(night, false, { level: bit, prog: { morning: prog } }).cols);
      const resets = m.filter(c => c.k === 'reset');
      expect(resets[0].cond).toBeUndefined();
      for (const r of resets.slice(1)) expect(r.cond).toEqual(['a']);
      const cx = m.filter(c => c.k === 'cnot');
      expect(cx.length).toBe(1); expect(cx[0].cond).toBeUndefined(); // after the loop: always runs
      if (resets.length > 1) seen = true;
    }
    expect(seen).toBe(true);
  });

  it('recoverable follows the data frame: phase code morning SPINs and Shor-9 decode/re-encode stay recoverable', () => {
    const p = runL('3-2', [{ kind: 'phase', t: 'q2' }]);
    const dawnP = p.steps.findIndex(s => s.ev.k === 'phase' && s.ev.phase === 'morning');
    p.steps.forEach((st, i) => {
      if (i > dawnP && st.ev.k === 'gate' && st.ev.op === 'SPIN') expect(nerdAt(p, i).recoverable!).toBeCloseTo(1, 9);
      if (st.ev.k === 'measure') expect(nerdAt(p, i).recoverable!).toBeCloseTo(1, 9);
    });
    const bed = p.steps.findIndex(s => s.ev.k === 'gate');
    expect(nerdAt(p, bed).recoverable).toBeUndefined(); // bedtime: code not built yet
    const s = runL('4-1', [{ kind: 'both', t: 'q5' }]);
    s.steps.forEach((st, i) => {
      if ((st.ev.k === 'gate' && (st.ev.op === 'SPIN' || st.ev.op === 'BOOP')) || st.ev.k === 'measure') {
        const r = nerdAt(s, i).recoverable; if (r !== undefined) expect(r).toBeCloseTo(1, 9);
      }
    });
    expect(s.steps.at(-1)!.snap.nerd!.recoverable!).toBeCloseTo(1, 9);
  });
});
