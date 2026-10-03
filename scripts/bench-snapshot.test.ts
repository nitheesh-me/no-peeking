// Quick profiler for 17-qubit snapshot cost: npx vitest run scripts/bench-snapshot.test.ts
import { it } from 'vitest';
import { QState, makeRng, MAT } from '../src/quantum/sim';
import { topAmplitudes } from '../src/quantum/vm';
it('bench', () => {
  const s = new QState(), rng = makeRng(1);
  const ids = [...Array.from({ length: 9 }, (_, i) => `q${i + 1}`), ...'abcdefgh'.split('')];
  for (const q of ids) s.apply1(q, MAT.prep(rng() * 3, rng() * 6));
  for (let i = 0; i + 1 < ids.length; i++) s.cnot(ids[i], ids[i + 1]);
  const T = (name: string, f: () => void) => { const t = performance.now(); f(); console.log(name, (performance.now() - t).toFixed(1), 'ms'); };
  T('bloch x17', () => ids.forEach(q => s.bloch(q)));
  T('rho2 x136', () => { for (let i = 0; i < 17; i++) for (let j = i + 1; j < 17; j++) s.rho2(ids[i], ids[j]); });
  T('MI x136', () => { for (let i = 0; i < 17; i++) for (let j = i + 1; j < 17; j++) s.mutualInfo(ids[i], ids[j]); });
  T('topAmps', () => topAmplitudes(s, ids as never, 8));
  T('fidelityPure 9', () => s.fidelityPure(ids.slice(0, 9), new Float64Array(512).fill(1 / Math.sqrt(512)), new Float64Array(512)));
  T('gate h', () => s.h('q5'));
});
