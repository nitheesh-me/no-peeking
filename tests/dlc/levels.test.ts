import { describe, expect, test } from 'vitest';
import { AFI_LEVELS, AFI_MODULES, MODULES, criterionVars, wilson } from '../../src/dlc/aficionado/levels/index';
import {
  FIVE_ENCODE, FIVE_STABS, SURF_ENCODE, SURF_LOGICALS, SURF_STABS, anticommutes, qs, single, syndromeOf,
} from '../../src/dlc/aficionado/levels/codes';
import { quantum } from '../../src/quantum/index';
import { runNight, testLevel } from '../../src/quantum/vm';
import { QState, makeRng } from '../../src/quantum/sim';
import { pauliExpectation } from '../../src/quantum/nerd';
import type { LevelDef, Program } from '../../src/core/contracts';
import en from '../../src/dlc/aficionado/content/en.json';

// Feature guards: DLC exercises written against the Quantum Expert's additions stay skipped until they exist.
const probe: LevelDef = {
  id: 'probe', chapter: 5, title: '', qubbles: [{ id: 'q1', x: 0, y: 0 }], bots: [{ id: 'a', x: 0, y: 1 }], toolbox: [], editable: ['morning'],
  inputs: ['zero'], inputQubble: 'q1', noise: { mode: 'none' }, goal: { kind: 'state', dataQubits: ['q1'], targetCircuit: [] },
  intro: [], hints: [], winLine: [], reveal: '', solution: {},
};
const works = (morning: Program, opts = {}) => {
  try { return runNight(probe, { morning }, 'zero', [], 1, { snapshots: false, ...opts }).failReason !== 'error'; } catch { return false; }
};
const HAS = {
  dlcGates: works([{ op: 'S', t: 'q1' }, { op: 'SDG', t: 'q1' }, { op: 'CZ', from: 'q1', to: 'a' }]),
  readout: (() => {
    try { return runNight(probe, { morning: [{ op: 'LISTEN', t: 'a' }] }, 'zero', [], 1, { snapshots: false, readoutFlips: [{ t: 'a', nth: 1 }] } as never).steps.some(s => s.ev.k === 'measure' && s.ev.result === 1); } catch { return false; }
  })(),
};
const usesDlcGates = (L: LevelDef) => [L.fixedBedtime, L.goal.kind !== 'classical' ? L.goal.targetCircuit : [], L.solution.bedtime, L.solution.morning, ...(L.traps ?? []).flatMap(t => [t.bedtime, t.morning])]
  .some(p => p?.some(o => ['Y', 'S', 'SDG', 'CZ', 'SWAP', 'WAIT'].includes(o.op)));
const usesReadout = (L: LevelDef) => !!L.readoutFlip || (L.noise.mode === 'enumerate' && !!L.noise.readout) || (L.noise.mode === 'random' && !!L.noise.readoutFlip);
const ready = (L: LevelDef) => (!usesDlcGates(L) || HAS.dlcGates) && (!usesReadout(L) || HAS.readout);

const SEEDS = [1, 2, 3];
const why = (r: ReturnType<typeof testLevel>) => {
  const bad = r.nights.find(n => !n.pass);
  return bad && `night input=${JSON.stringify(bad.input)} errors=${JSON.stringify(bad.errors)} → ${bad.failReason} F=${bad.fidelity.toFixed(5)} ${bad.message ?? ''} (passRate ${r.passRate.toFixed(3)})`;
};

type Node = string | { [k: string]: Node };
const lookup = (k: string): string | undefined => {
  let n: Node | undefined = en as unknown as Node;
  for (const p of k.split('.')) { if (n == null || typeof n === 'string') return undefined; n = n[p]; }
  return typeof n === 'string' ? n : undefined;
};

describe('DLC curriculum: structure', () => {
  test('modules M0..M9 and their levels', () => {
    expect(AFI_MODULES.map(m => m.id)).toEqual(['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9']);
    expect(MODULES.length).toBe(AFI_LEVELS.length);
    for (const m of AFI_MODULES) {
      expect(m.levelIds.length).toBeGreaterThan(0);
      for (const r of m.requires ?? []) expect(AFI_MODULES.some(x => x.id === r)).toBe(true);
    }
  });
  test('every key a level or module references exists in en.json', () => {
    const missing: string[] = [];
    const need = (k: string) => { if (!lookup(k)) missing.push(k); };
    for (const L of AFI_LEVELS) {
      [L.title, L.subtitle!, L.reveal, L.proTerm!, ...L.hints, ...(L.traps ?? []).map(t => t.name)].forEach(need);
      const b = `afi.modules.${L.id.split('-')[0]}.ex.${L.id}`;
      ['objective', 'context', 'code', 'noise', 'gates', 'criterion'].forEach(f => need(`${b}.briefing.${f}`));
      need(`${b}.analysis`);
    }
    for (const m of AFI_MODULES) {
      [`afi.modules.${m.id}.title`, `afi.modules.${m.id}.summary`, `afi.map.teasers.${m.id}`, `afi.map.prereq.${m.id}`, ...m.objectives].forEach(need);
      need(`afi.modules.${m.id}.analysis.oracle`);
    }
    expect(missing).toEqual([]);
  });
  test('criterion copy only uses variables criterionVars provides', () => {
    for (const L of AFI_LEVELS) {
      const s = ['objective', 'context', 'code', 'noise', 'gates', 'criterion'].map(f => lookup(`afi.modules.${L.id.split('-')[0]}.ex.${L.id}.briefing.${f}`) ?? '').join(' ');
      const vars = criterionVars(L);
      for (const m of s.matchAll(/\{(\w+)\}/g)) expect(vars, `${L.id} uses {${m[1]}}`).toHaveProperty(m[1]);
    }
  });
  test('rate goals: minRate means "logical error rate below p with 95% confidence"', () => {
    for (const L of AFI_LEVELS) {
      if (L.goal.kind !== 'rate' || L.noise.mode !== 'random') continue;
      const n = L.goal.nights, k = Math.floor((1 - L.goal.minRate) * n);
      const q = L.noise.readoutFlip ?? 0;
      // an unprotected qubit stored with flip probability p and read once with flip probability q fails w.p. p + q − 2pq
      expect(wilson(k, n)[1], L.id).toBeLessThan(L.noise.p + q - 2 * L.noise.p * q);
    }
  });
});

describe('DLC curriculum: codes', () => {
  const expect1 = (prog: Program, n: number, stabs: string[]) => {
    const rng = makeRng(7);
    for (let t = 0; t < 4; t++) {
      // run the encoder in a fresh state and check every generator has <S> = +1
      const s = new QState();
      s.prepare('q1', Math.acos(1 - 2 * rng()), 2 * Math.PI * rng());
      for (const o of prog) {
        if (o.op === 'HIGHFIVE') s.cnot(o.from, o.to);
        else if (o.op === 'SPIN') s.h(o.t);
        else if (o.op === 'CZ') s.cz(o.from, o.to);
        else if (o.op === 'BOOP') s.x(o.t);
      }
      for (const st of stabs) {
        const xs: string[] = [], zs: string[] = [];
        st.split('').forEach((c, i) => { if (c === 'X') xs.push(`q${i + 1}`); if (c === 'Z') zs.push(`q${i + 1}`); });
        expect(pauliExpectation(s, xs, zs), st).toBeCloseTo(1, 9);
      }
    }
  };
  test('stabilizer groups commute and logicals anticommute', () => {
    for (const set of [FIVE_STABS, SURF_STABS]) for (const a of set) for (const b of set) expect(anticommutes(a, b)).toBe(false);
    for (const s of SURF_STABS) { expect(anticommutes(s, SURF_LOGICALS.X)).toBe(false); expect(anticommutes(s, SURF_LOGICALS.Z)).toBe(false); }
    expect(anticommutes(SURF_LOGICALS.X, SURF_LOGICALS.Z)).toBe(true);
  });
  test('[[5,1,3]]: 15 single-qubit errors have 15 distinct non-zero syndromes (perfect code)', () => {
    const syn = new Set<string>();
    for (const k of ['X', 'Y', 'Z'] as const) for (let i = 0; i < 5; i++) syn.add(syndromeOf(FIVE_STABS, single(5, i, k)).join(''));
    expect(syn.size).toBe(15);
    expect(syn.has('0000')).toBe(false);
  });
  test.skipIf(!HAS.dlcGates)('[[5,1,3]] encoder output is a +1 eigenstate of every generator', () => expect1(FIVE_ENCODE, 5, FIVE_STABS));
  test('M8/M9 levels carry their own generators; the oracle labels them (all +1 on the encoded state)', () => {
    for (const L of AFI_LEVELS.filter(l => /^M[89]-/.test(l.id))) {
      expect(L.stabilizers, L.id).toEqual(L.id.startsWith('M8') ? FIVE_STABS : SURF_STABS);
      if (!HAS.dlcGates) continue;
      const night = quantum.runNight(L, L.solution, 'plus', [], 1, { nerd: true });
      const st = night.steps[night.steps.length - 1].snap.nerd!.stabilizers;
      expect(st.length, L.id).toBeGreaterThanOrEqual(L.stabilizers!.length);
      if (L.id === 'M8-2' || L.id === 'M9-2') for (const x of st.slice(0, L.stabilizers!.length)) expect(x.value, `${L.id} ${x.label}`).toBeCloseTo(1, 6);
    }
  });
  test('surface-code encoder output is a +1 eigenstate of all 8 generators', () => expect1(SURF_ENCODE, 9, SURF_STABS));
});

describe('DLC curriculum: every reference solution passes, every trap fails', () => {
  for (const L of AFI_LEVELS) {
    const t = ready(L) ? test : test.skip;
    t(`${L.id}: solution passes`, () => {
      expect(quantum.testLevel(L, L.solution).passed).toBe(true);
      for (const seed of SEEDS) {
        const r = testLevel(L, L.solution, seed);
        expect(r.passed, why(r)).toBe(true);
        expect(r.nights.every(n => n.failReason !== 'error'), why(r)).toBe(true);
      }
    });
    for (const tr of L.traps ?? []) {
      t(`${L.id}: trap ${tr.name.split('.').pop()} fails`, () => {
        for (const seed of SEEDS) {
          const r = testLevel(L, { bedtime: tr.bedtime, morning: tr.morning }, seed);
          expect(r.passed, `trap passed with seed ${seed}`).toBe(false);
          expect(r.nights.some(n => n.failReason === 'error'), why(r)).toBe(false);
        }
      });
    }
  }
});
