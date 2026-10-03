import { describe, it, expect } from 'vitest';
import { parseProgram, printProgram } from '../../src/quantum/text';
import * as R from '../../src/quantum/reference';

describe('Bot Code text form', () => {
  it('round-trips every reference program', () => {
    for (const [name, p] of Object.entries(R)) {
      if (!Array.isArray(p)) continue;
      const { prog, errors } = parseProgram(printProgram(p));
      expect(errors, name).toEqual([]);
      expect(prog, name).toEqual(p);
    }
  });
  it('is forgiving', () => {
    const { prog, errors } = parseProgram(`
      boop Q2
      highfive q1 → A
      HIGHFIVE   q2->a
      if a beep AND b quiet -> Fix1   # trailing comment
      If a -> fix1
      listen a
      Fix1:
      end`);
    expect(errors).toEqual([]);
    expect(prog[0]).toEqual({ op: 'BOOP', t: 'q2' });
    expect(prog[1]).toEqual({ op: 'HIGHFIVE', from: 'q1', to: 'a' });
    expect(prog[3]).toEqual({ op: 'IF', conds: [{ who: 'a', is: 'BEEP' }, { who: 'b', is: 'QUIET' }], label: 'Fix1' });
    expect(prog[4]).toEqual({ op: 'IF', conds: [{ who: 'a', is: 'BEEP' }], label: 'fix1' });
  });
  it('reports useful errors with line numbers', () => {
    const { errors } = parseProgram('LISTEN q1\nFLY a\nJUMP nowhere\nHIGHFIVE q1 -> q1');
    expect(errors.map(e => e.line)).toEqual([1, 2, 3, 4]);
  });
});
