import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/levels/index';
import { testLevel } from '../../src/quantum/index';
import { fromProgram, toProgram, wiresOf } from '../../src/dlc/aficionado/editor/model';
import { parseText, printText } from '../../src/dlc/aficionado/editor/qasm';
import type { Program } from '../../src/core/contracts';

const phases = ['bedtime', 'morning'] as const;

describe('DLC circuit editor ⇄ Op[] mapping', () => {
  for (const L of LEVELS.filter((l) => !l.classical)) {
    it(`round-trips the reference solution of ${L.id} with identical VM results`, () => {
      const wires = wiresOf(L);
      const via: { bedtime?: Program; morning?: Program } = {};
      const viaText: { bedtime?: Program; morning?: Program } = {};
      const ed = phases.filter((p) => L.editable.includes(p));
      const stages = ed.map((p) => ({ phase: p, cols: fromProgram(L.solution[p] ?? [], wires) }));
      for (const s of stages) via[s.phase] = toProgram(s.cols, wires).prog;
      const parsed = parseText(printText(stages, wires), wires, [...ed]);
      expect(parsed.errors).toEqual([]);
      for (const p of ed) viaText[p] = toProgram(parsed.stages[p] ?? [], wires).prog;
      const a = testLevel(L, L.solution, 7), b = testLevel(L, via, 7), c = testLevel(L, viaText, 7);
      expect(b.passed).toBe(a.passed);
      expect(b.passRate).toBeCloseTo(a.passRate, 9);
      expect(c.passRate).toBeCloseTo(a.passRate, 9);
      for (const tr of L.traps ?? []) {
        const tw: { bedtime?: Program; morning?: Program } = {};
        for (const p of ed) tw[p] = toProgram(fromProgram(tr[p] ?? [], wires), wires).prog;
        expect(testLevel(L, tw, 7).passRate).toBeCloseTo(testLevel(L, tr, 7).passRate, 9);
      }
    });
  }
  it('lifts the classic tail-fix pattern into conditioned gates', () => {
    const L = LEVELS.find((l) => l.id === '2-3')!;
    const cols = fromProgram(L.solution.morning!, wiresOf(L));
    expect(cols.flatMap((c) => c.gates).some((g) => g.cond?.length)).toBe(true);
    expect(cols.every((c) => !c.ctrl || c.ctrl.kind === 'NOTE')).toBe(true);
  });
});

import { monteCarlo, mcEngine, withNoise } from '../../src/dlc/aficionado/state/mc';
describe('DLC Monte Carlo', () => {
  it('matches the engine helper exactly (same seed ⇒ same failures)', async () => {
    const L = LEVELS.find((l) => l.id === '2-5')!;
    for (const lvl of [L, withNoise(L, 0.15, ['flip']), LEVELS.find((l) => l.id === '2-4')!]) {
      const a = await monteCarlo(lvl, lvl.solution, 237, 99);
      const b = mcEngine(lvl, lvl.solution, { trials: 237, seed: 99 });
      expect(a.failures).toBe(b.failures);
      expect(a.ci95[0]).toBeCloseTo(b.ci95[0], 12);
    }
  });
});

import { MODULES } from '../../src/dlc/aficionado/levels/index';
describe('DLC editor mapping on the DLC curriculum', () => {
  for (const { def: L } of MODULES) {
    it(`${L.id}: reference solution round-trips with identical results`, () => {
      const wires = wiresOf(L);
      const ed = (['bedtime', 'morning'] as const).filter((p) => L.editable.includes(p));
      const via: { bedtime?: Program; morning?: Program } = {};
      const stages = ed.map((p) => ({ phase: p, cols: fromProgram(L.solution[p] ?? [], wires) }));
      for (const s of stages) via[s.phase] = toProgram(s.cols, wires).prog;
      const parsed = parseText(printText(stages, wires), wires, [...ed]);
      expect(parsed.errors).toEqual([]);
      const viaText: { bedtime?: Program; morning?: Program } = {};
      for (const p of ed) viaText[p] = toProgram(parsed.stages[p] ?? [], wires).prog;
      const a = testLevel(L, L.solution, 3);
      expect(testLevel(L, via, 3).passRate).toBeCloseTo(a.passRate, 9);
      expect(testLevel(L, viaText, 3).passRate).toBeCloseTo(a.passRate, 9);
    }, 60000);
  }
});
