import { describe, expect, test } from 'vitest';
import { LEVELS } from '../../src/levels/index';
import { quantum } from '../../src/quantum/index';
import { testLevel } from '../../src/quantum/vm';

// Physics gatekeeper: every level's reference solution must pass (for several test-suite seeds,
// so random inputs / random noise / measurement outcomes differ), and every trap must fail.
const SEEDS = [1, 2, 3];
const why = (r: ReturnType<typeof testLevel>) => {
  const bad = r.nights.find(n => !n.pass);
  return bad && `night input=${JSON.stringify(bad.input)} errors=${JSON.stringify(bad.errors)} → ${bad.failReason} F=${bad.fidelity.toFixed(5)} ${bad.message ?? ''} (passRate ${r.passRate.toFixed(3)})`;
};

describe('levels', () => {
  test('there are levels', () => expect(LEVELS.length).toBeGreaterThan(0));
  for (const L of LEVELS) {
    test(`${L.id} ${L.title}: solution passes`, () => {
      expect(quantum.testLevel(L, L.solution).passed).toBe(true);
      for (const seed of SEEDS) {
        const r = testLevel(L, L.solution, seed);
        expect(r.passed, why(r)).toBe(true);
        expect(r.nights.every(n => n.failReason !== 'error'), why(r)).toBe(true);
      }
    });
    for (const tr of L.traps ?? []) {
      test(`${L.id}: trap "${tr.name}" fails`, () => {
        for (const seed of SEEDS) {
          const r = testLevel(L, { bedtime: tr.bedtime, morning: tr.morning }, seed);
          expect(r.passed, `trap passed with seed ${seed}`).toBe(false);
          // a trap must fail for a physics reason, not because the program is malformed
          expect(r.nights.some(n => n.failReason === 'error'), why(r)).toBe(false);
        }
      });
    }
  }
});
