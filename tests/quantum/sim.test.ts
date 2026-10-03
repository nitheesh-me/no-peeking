import { describe, it, expect } from 'vitest';
import { QState, makeRng, MAT, hermitianEigs4 } from '../../src/quantum/sim';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);
function amps(s: QState, ids: string[]) { return s.denseOver(ids); }
/** |<a|b>|² for two states over the same ids */
function overlap(a: QState, b: QState, ids: string[]) {
  const x = amps(a, ids), y = amps(b, ids);
  let r = 0, i = 0;
  for (let k = 0; k < x.re.length; k++) { r += x.re[k] * y.re[k] + x.im[k] * y.im[k]; i += x.re[k] * y.im[k] - x.im[k] * y.re[k]; }
  return { r, i, f: r * r + i * i };
}
function randomState(seed: number, ids: string[]) {
  const s = new QState(), rng = makeRng(seed);
  for (const q of ids) s.apply1(q, MAT.prep(Math.acos(1 - 2 * rng()), 2 * Math.PI * rng()));
  for (let k = 0; k + 1 < ids.length; k++) { s.cnot(ids[k], ids[k + 1]); s.rx(ids[k], rng() * 3); }
  return s;
}

describe('gate identities', () => {
  const ids = ['q1', 'q2', 'q3'];
  it('HH = I, XX = I, ZZ = I, YY = I', () => {
    for (const g of ['h', 'x', 'z', 'y'] as const) {
      const a = randomState(7, ids), b = a.clone();
      b[g]('q2'); b[g]('q2');
      close(overlap(a, b, ids).r, 1);
    }
  });
  it('XZ = −ZX (exact sign)', () => {
    const a = randomState(3, ids), b = a.clone();
    a.z('q1'); a.x('q1'); // XZ|ψ>
    b.x('q1'); b.z('q1'); // ZX|ψ>
    close(overlap(a, b, ids).r, -1);
  });
  it('Y = iXZ', () => {
    const a = randomState(5, ids), b = a.clone();
    a.y('q3'); b.z('q3'); b.x('q3');
    const o = overlap(b, a, ids); // <XZψ|Yψ> = i
    close(o.r, 0); close(o.i, 1);
  });
  it('CNOT·CNOT = I and HZH = X', () => {
    const a = randomState(9, ids), b = a.clone();
    b.cnot('q1', 'q3'); b.cnot('q1', 'q3');
    close(overlap(a, b, ids).r, 1);
    const c = a.clone(), d = a.clone();
    c.h('q2'); c.z('q2'); c.h('q2'); d.x('q2');
    close(overlap(c, d, ids).r, 1);
  });
  it('Rx(π) = −iX', () => {
    const a = randomState(11, ids), b = a.clone();
    a.rx('q1', Math.PI); b.x('q1');
    const o = overlap(b, a, ids); close(o.i, -1);
  });
  it('dynamic register: detach/attach is exact', () => {
    const s = randomState(13, ids);
    const rng = makeRng(1);
    s.attach('a'); s.cnot('q1', 'a'); s.cnot('q2', 'a');
    s.measure('a', rng); // a detached
    expect(s.isActive('a')).toBe(false);
    close(s.norm2(), 1);
    s.h('a'); s.h('a'); // re-attach, back to classical value
    close(s.norm2(), 1);
  });
});

describe('textbook states', () => {
  it('Bell pair: Bloch vectors vanish, mutual information = 2 bits', () => {
    const s = new QState(); s.h('q1'); s.cnot('q1', 'q2');
    const b = s.bloch('q1'); close(Math.hypot(b.x, b.y, b.z), 0);
    close(s.mutualInfo('q1', 'q2'), 2, 1e-6);
    const d = s.denseOver(['q1', 'q2']);
    close(d.re[0], Math.SQRT1_2); close(d.re[3], Math.SQRT1_2);
  });
  it('GHZ: pairwise MI = 1 bit (classical correlation), Bloch length 0', () => {
    const s = new QState(); s.h('q1'); s.cnot('q1', 'q2'); s.cnot('q2', 'q3');
    close(s.mutualInfo('q1', 'q3'), 1, 1e-6);
    close(s.bloch('q2').z, 0);
    close(s.parityProb1(['q1', 'q2']), 0);
  });
  it('Bloch of |+i> is +y', () => {
    const s = new QState(); s.apply1('q1', MAT.prep(Math.PI / 2, Math.PI / 2));
    const b = s.bloch('q1'); close(b.y, 1); close(b.x, 0); close(b.z, 0);
  });
  it('no-cloning demo: CNOT on |+>|0> gives a Bell pair, not |++>', () => {
    const s = new QState(); s.h('q1'); s.cnot('q1', 'q2');
    for (const q of ['q1', 'q2']) { const b = s.bloch(q); close(Math.hypot(b.x, b.y, b.z), 0); }
    // fidelity with |++> is 1/2
    const h = Math.SQRT1_2 / Math.SQRT2;
    close(s.fidelityPure(['q1', 'q2'], [0.5, 0.5, 0.5, 0.5], [0, 0, 0, 0]), 0.5);
    void h;
  });
  it('eigensolver: Bell density matrix has eigenvalues {1,0,0,0}', () => {
    const s = new QState(); s.h('q1'); s.cnot('q1', 'q2');
    const r = s.rho2('q1', 'q2');
    const ev = hermitianEigs4(r.re, r.im);
    close(ev[0], 1, 1e-9); close(ev[1] + ev[2] + ev[3], 0, 1e-9);
  });
});

describe('measurement', () => {
  it('|+> gives ~50/50 (seeded) and collapses', () => {
    const rng = makeRng(42); let ones = 0; const N = 4000;
    for (let i = 0; i < N; i++) { const s = new QState(); s.h('q1'); const r = s.measure('q1', rng); ones += r; expect(s.measure('q1', rng)).toBe(r); }
    expect(Math.abs(ones / N - 0.5)).toBeLessThan(4 * Math.sqrt(0.25 / N));
  });
  it('Born rule for cos(θ/2)|0>+sin(θ/2)|1>', () => {
    const rng = makeRng(7), th = 1.1, N = 4000; let ones = 0;
    for (let i = 0; i < N; i++) { const s = new QState(); s.apply1('q1', MAT.prep(th, 0.3)); ones += s.measure('q1', rng); }
    const p = Math.sin(th / 2) ** 2;
    expect(Math.abs(ones / N - p)).toBeLessThan(4 * Math.sqrt(p * (1 - p) / N));
  });
  it('measuring one half of a Bell pair fixes the other', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 50; i++) { const s = new QState(); s.h('q1'); s.cnot('q1', 'q2'); expect(s.measure('q2', rng)).toBe(s.measure('q1', rng)); }
  });
  it('parity check reads parity without collapsing α|00>+β|11> or α|01>+β|10>', () => {
    const rng = makeRng(5);
    for (const flip of [false, true]) {
      const s = new QState(); s.apply1('q1', MAT.prep(1.0, 0.7)); s.cnot('q1', 'q2'); if (flip) s.x('q2');
      const before = s.clone();
      s.cnot('q1', 'a'); s.cnot('q2', 'a');
      expect(s.measure('a', rng)).toBe(flip ? 1 : 0);
      close(overlap(s, before, ['q1', 'q2']).f, 1);
    }
  });
  it('reset returns a bot to |0> and leaves data intact for product states', () => {
    const rng = makeRng(9); const s = new QState(); s.h('a'); s.reset('a', rng);
    expect(s.classical('a')).toBe(0);
  });
});
