/**
 * NO PEEKING! — Bot Code interpreter, goal evaluation and test-suite builder.
 * Exact semantics are documented in docs/QUANTUM_NOTES.md. Summary:
 *
 *  PHASES  bedtime → night → morning. For each of bedtime/morning the program that runs is
 *          level.fixed<Phase> (if any) FOLLOWED BY the player's program (if the phase is editable),
 *          as one phase (labels are local to each of the two pieces).
 *  LIGHTS  LISTEN/PEEK set lights[t] = result. RESET does not change the light (it is the bot's
 *          memory of its last LISTEN). IF cond: BEEP ⇔ light === 1; QUIET ⇔ light 0 or never measured.
 *  PEEK    on a qubble when !classical && !allowPeekData: the measurement really happens (collapse)
 *          and the qubble is marked woke ⇒ the night fails with 'woke'.
 *  ERRORS  LISTEN/RESET on a non-bot, unknown creature, unknown label, HIGHFIVE x -> x, gates in
 *          targetCircuit other than BOOP/SHUSH/SPIN/HIGHFIVE ⇒ 'error'.
 *  STEPS   every executed op except LABEL/NOTE counts; total over both phases > maxSteps ⇒ 'maxSteps'.
 */
import type {
  Bloch, BotId, ErrorEvent, GoalSpec, InputState, LevelDef, NightResult, Op, Phase, Program,
  QubbleId, QubitId, Snapshot, TestReport, TraceEvent, TraceStep,
} from '../core/contracts';
import { isBot, isQubble } from '../core/contracts';
import { QState, makeRng, mixSeed, haarAngles, type Rng } from './sim';
import { computeNerd, stabilizerSet, type NerdCtx } from './nerd';

export const DEFAULT_MIN_FIDELITY = 0.999;
export const DEFAULT_RATE_MIN_FIDELITY = 0.99;
export const DEFAULT_MAX_STEPS = 500;
export const DEFAULT_WOBBLE_ANGLES = [0.6, 1.3, 2.2];
/** Number of Haar-random states that one 'random' entry in level.inputs expands to in testLevel. */
export const RANDOM_INPUTS_PER_ENTRY = 4;
/** Number of random-noise nights per resolved input for noise.mode 'random' (non-rate goals). */
export const RANDOM_NOISE_NIGHTS_PER_INPUT = 8;
/** Bloch-vector length below which a qubit is considered entangled (used for link pruning). */
const MIXED_EPS = 1e-6;
/** Mutual information (bits) above which a link is drawn. */
export const LINK_THRESHOLD = 0.1;
const DEFINITE = 1e-9;

export interface RunOptions {
  /** Compute a full Snapshot after each event (default true). Off ⇒ every step shares EMPTY_SNAPSHOT. */
  snapshots?: boolean;
  /** Number of amplitudes in Snapshot.amps (default 8). */
  topAmps?: number;
  /** Debug: disable the incremental snapshot cache (used by tests to verify it). */
  noSnapCache?: boolean;
  /** Fill Snapshot.nerd (NerdInfo) on every snapshot (requires snapshots). Default false. */
  nerd?: boolean;
}

export const EMPTY_SNAPSHOT: Snapshot = Object.freeze({ bloch: {} as Record<QubitId, Bloch>, links: [], amps: [], lights: {} }) as Snapshot;

// ───────────────────────── inputs ─────────────────────────
export type Angles = { theta: number; phi: number };

const PRESETS: Record<string, Angles> = {
  zero: { theta: 0, phi: 0 },
  one: { theta: Math.PI, phi: 0 },
  plus: { theta: Math.PI / 2, phi: 0 },
  minus: { theta: Math.PI / 2, phi: Math.PI },
  plusI: { theta: Math.PI / 2, phi: Math.PI / 2 },
  minusI: { theta: Math.PI / 2, phi: -Math.PI / 2 },
};

/** Concrete Bloch angles for an InputState ('random' ⇒ Haar-random from rng). */
export function resolveInput(input: InputState, rng: Rng = Math.random): Angles {
  if (input === 'random') return haarAngles(rng);
  if (typeof input === 'string') {
    const p = PRESETS[input];
    if (!p) throw new Error(`unknown input state "${input}"`);
    return p;
  }
  return { theta: input.theta, phi: input.phi };
}

/** Bloch vector of a (non-random) input state. */
export function blochOfInput(input: InputState, rng?: Rng): Bloch {
  const { theta, phi } = resolveInput(input, rng);
  return { x: Math.sin(theta) * Math.cos(phi), y: Math.sin(theta) * Math.sin(phi), z: Math.cos(theta) };
}

// ───────────────────────── noise ─────────────────────────
export function applyError(s: QState, e: ErrorEvent): void {
  switch (e.kind) {
    case 'flip': s.x(e.t); break;
    case 'phase': s.z(e.t); break;
    case 'both': s.y(e.t); break;
    case 'wobble': if (e.axis === 'z') s.rz(e.t, e.angle); else s.rx(e.t, e.angle); break;
  }
}

function wobbleAxes(noise: unknown): ('x' | 'z')[] {
  const n = noise as { wobbleAxis?: 'x' | 'z' | ('x' | 'z')[]; wobbleAxes?: ('x' | 'z')[] };
  const a = n.wobbleAxes ?? n.wobbleAxis;
  if (!a) return ['x'];
  return Array.isArray(a) ? a : [a];
}

/** All single error events of the given kinds on one target. */
export function eventsFor(t: QubbleId, kinds: string[], angles: number[], axes: ('x' | 'z')[]): ErrorEvent[] {
  const out: ErrorEvent[] = [];
  for (const k of kinds) {
    if (k === 'flip' || k === 'phase' || k === 'both') out.push({ kind: k, t });
    else if (k === 'wobble') for (const axis of axes) for (const angle of angles) out.push({ kind: 'wobble', t, axis, angle });
  }
  return out;
}

/** Noise cases for noise.mode 'enumerate' (none, every single event, every pair on distinct targets). */
export function enumerateErrors(level: LevelDef): ErrorEvent[][] {
  const noise = level.noise;
  if (noise.mode === 'none') return [[]];
  if (noise.mode === 'fixed') return [noise.errors];
  if (noise.mode !== 'enumerate') throw new Error('enumerateErrors: noise mode is random');
  const targets = noise.targets ?? level.qubbles.map(p => p.id as QubbleId).filter(isQubble);
  const angles = noise.wobbleAngles ?? DEFAULT_WOBBLE_ANGLES;
  const axes = wobbleAxes(noise);
  const per = targets.map(t => eventsFor(t, noise.kinds, angles, axes));
  const cases: ErrorEvent[][] = [[]];
  if (noise.maxErrors >= 1) for (const evs of per) for (const e of evs) cases.push([e]);
  if (noise.maxErrors >= 2)
    for (let i = 0; i < per.length; i++) for (let j = i + 1; j < per.length; j++)
      for (const e1 of per[i]) for (const e2 of per[j]) cases.push([e1, e2]);
  return cases;
}

/** One random night for noise.mode 'random': each target independently hit with probability p. */
export function randomErrors(level: LevelDef, rng: Rng): ErrorEvent[] {
  const noise = level.noise;
  if (noise.mode !== 'random') return [];
  const targets = ((noise as { targets?: QubbleId[] }).targets) ?? level.qubbles.map(p => p.id as QubbleId).filter(isQubble);
  const axes = wobbleAxes(noise);
  const out: ErrorEvent[] = [];
  for (const t of targets) {
    if (rng() >= noise.p) continue;
    const k = noise.kinds[Math.floor(rng() * noise.kinds.length)];
    if (k === 'wobble') out.push({ kind: 'wobble', t, axis: axes[Math.floor(rng() * axes.length)], angle: Math.PI * rng() });
    else out.push({ kind: k, t });
  }
  return out;
}

// ───────────────────────── targets ─────────────────────────
/** Target state on goal.dataQubits: pure vector (fidelity ⟨t|ρ|t⟩) or, for a 1-qubit mixed target, its Bloch vector. */
export type Target =
  | { kind: 'pure'; ids: string[]; re: Float64Array; im: Float64Array }
  | { kind: 'mixed1'; ids: string[]; bloch: Bloch };

function applyUnitaryOp(s: QState, o: Op, where: string): void {
  switch (o.op) {
    case 'BOOP': s.x(o.t); break;
    case 'SHUSH': s.z(o.t); break;
    case 'SPIN': s.h(o.t); break;
    case 'HIGHFIVE': s.cnot(o.from, o.to); break;
    case 'NOTE': case 'LABEL': break;
    default: throw new Error(`${where}: only BOOP/SHUSH/SPIN/HIGHFIVE allowed, got ${o.op}`);
  }
}

/**
 * Target = targetCircuit applied to (input on level.inputQubble, everything else |0>), optionally
 * followed by the night's errors, reduced to `dataQubits`.
 */
export function buildTarget(level: LevelDef, dataQubits: string[], circuit: Program, ang: Angles, errors?: ErrorEvent[]): Target {
  const s = new QState();
  s.prepare(level.inputQubble, ang.theta, ang.phi);
  for (const o of circuit) applyUnitaryOp(s, o, `level ${level.id} targetCircuit`);
  if (errors) for (const e of errors) applyError(s, e);
  const extras = s.order.filter(q => !dataQubits.includes(q));
  const all = [...dataQubits, ...extras];
  const dense = s.denseOver(all);
  const nd = dataQubits.length, D = 1 << nd, E = 1 << extras.length;
  if (E === 1) return { kind: 'pure', ids: dataQubits, re: dense.re, im: dense.im };
  // columns M[:, e]
  let best = 0, bestN = -1;
  for (let e = 0; e < E; e++) {
    let n = 0;
    for (let d = 0; d < D; d++) { const i = d | (e << nd); n += dense.re[i] ** 2 + dense.im[i] ** 2; }
    if (n > bestN) { bestN = n; best = e; }
  }
  const tr = new Float64Array(D), ti = new Float64Array(D), sc = 1 / Math.sqrt(bestN);
  for (let d = 0; d < D; d++) { const i = d | (best << nd); tr[d] = dense.re[i] * sc; ti[d] = dense.im[i] * sc; }
  let f = 0; // ⟨t|σ|t⟩ — equals 1 iff σ is pure (= |t><t|)
  for (let e = 0; e < E; e++) {
    let ar = 0, ai = 0;
    for (let d = 0; d < D; d++) { const i = d | (e << nd); ar += tr[d] * dense.re[i] + ti[d] * dense.im[i]; ai += tr[d] * dense.im[i] - ti[d] * dense.re[i]; }
    f += ar * ar + ai * ai;
  }
  if (f > 1 - 1e-9) return { kind: 'pure', ids: dataQubits, re: tr, im: ti };
  if (nd === 1) return { kind: 'mixed1', ids: dataQubits, bloch: s.bloch(dataQubits[0]) };
  throw new Error(`level ${level.id}: reduced target on [${dataQubits}] is mixed; only 1-qubit mixed targets are supported`);
}

/** Uhlmann fidelity between the sim's reduced state on target.ids and the target. */
export function fidelityTo(s: QState, t: Target): number {
  if (t.kind === 'pure') return clamp01(s.fidelityPure(t.ids, t.re, t.im));
  const r = s.bloch(t.ids[0]), q = t.bloch;
  const dot = r.x * q.x + r.y * q.y + r.z * q.z;
  const dr = Math.max(0, 1 - (r.x ** 2 + r.y ** 2 + r.z ** 2)), dq = Math.max(0, 1 - (q.x ** 2 + q.y ** 2 + q.z ** 2));
  return clamp01((1 + dot) / 2 + Math.sqrt(dr * dq) / 2);
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ───────────────────────── snapshot ─────────────────────────
/**
 * Incremental cache for snapshots. Exact facts used:
 *  - a unitary on qubits G leaves the reduced state of any set disjoint from G unchanged;
 *  - a LOCAL unitary on one qubit leaves every mutual information unchanged.
 * So after a 1-qubit gate on q only bloch(q) is recomputed; after CNOT(c,t) only bloch(c), bloch(t)
 * and the MI of pairs containing c or t; measurements/resets invalidate everything.
 */
export class SnapCache {
  bloch = new Map<string, Bloch>();
  mi = new Map<string, number>();
  touch(t: 'all' | { local?: string[]; pair?: [string, string] }): void {
    if (t === 'all') { this.bloch.clear(); this.mi.clear(); return; }
    for (const q of t.local ?? []) this.bloch.delete(q);
    if (t.pair) {
      const [c, d] = t.pair;
      this.bloch.delete(c); this.bloch.delete(d);
      for (const k of [...this.mi.keys()]) { const [x, y] = k.split(','); if (x === c || y === c || x === d || y === d) this.mi.delete(k); }
    }
  }
}

export function snapshot(s: QState, ids: QubitId[], lights: Partial<Record<QubitId, 0 | 1 | null>>, target: Target | null, topAmps = 8, cache?: SnapCache): Snapshot {
  const bloch = {} as Record<QubitId, Bloch>;
  const mixed: QubitId[] = [];
  for (const q of ids) {
    let b = cache?.bloch.get(q);
    if (!b) { b = s.bloch(q); cache?.bloch.set(q, b); }
    bloch[q] = b;
    if (Math.hypot(b.x, b.y, b.z) < 1 - MIXED_EPS) mixed.push(q);
  }
  const links: Snapshot['links'] = [];
  for (let i = 0; i < mixed.length; i++) for (let j = i + 1; j < mixed.length; j++) {
    const key = mixed[i] + ',' + mixed[j];
    let mi = cache?.mi.get(key);
    if (mi === undefined) { mi = s.mutualInfo(mixed[i], mixed[j]); cache?.mi.set(key, mi); }
    if (mi > LINK_THRESHOLD) links.push({ a: mixed[i], b: mixed[j], strength: Math.min(1, mi / 2) });
  }
  return { bloch, links, amps: topAmplitudes(s, ids, topAmps), lights: { ...lights }, logicalFidelity: target ? fidelityTo(s, target) : undefined };
}

/** Largest-probability basis states; ket label = qubble bits in level order, then "|a=0,b=1" for bots. Global phase fixed so the top amplitude is real-positive. */
export function topAmplitudes(s: QState, ids: QubitId[], k = 8): Snapshot['amps'] {
  const re = s.re, im = s.im, N = re.length;
  // top-k selection (k small) without sorting the whole register
  const top: number[] = [], tp: number[] = [];
  for (let i = 0; i < N; i++) {
    const p = re[i] * re[i] + im[i] * im[i];
    if (p < 1e-10 || (top.length === k && p <= tp[k - 1])) continue;
    let j = top.length < k ? top.length : k - 1;
    while (j > 0 && tp[j - 1] < p) { if (j < k) { top[j] = top[j - 1]; tp[j] = tp[j - 1]; } j--; }
    top[j] = i; tp[j] = p;
  }
  if (!top.length) return [];
  const r0 = re[top[0]], i0 = im[top[0]], m0 = Math.hypot(r0, i0);
  const cr = r0 / m0, ci = -i0 / m0; // multiply by conj(phase)
  const qs = ids.filter(isQubble), bs = ids.filter(isBot);
  const bitOf = (q: string, i: number) => { const c = s.classical(q); return c !== null ? c : (i >> s.pos.get(q)!) & 1; };
  return top.map(i => {
    const ket = qs.map(q => bitOf(q, i)).join('') + (bs.length ? '|' + bs.map(b => `${b}=${bitOf(b, i)}`).join(',') : '');
    const a = re[i] * cr - im[i] * ci, b = re[i] * ci + im[i] * cr;
    return { ket, re: a, im: b, p: a * a + b * b };
  });
}

// ───────────────────────── interpreter ─────────────────────────
export type Part = { ops: Program; part: 'fixed' | 'mine' };
export function phaseProgram(level: LevelDef, prog: { bedtime?: Program; morning?: Program }, phase: 'bedtime' | 'morning'): Part[] {
  const fixed = phase === 'bedtime' ? level.fixedBedtime : level.fixedMorning;
  const parts: Part[] = [];
  if (fixed && fixed.length) parts.push({ ops: fixed, part: 'fixed' });
  if (level.editable.includes(phase)) { const p = prog[phase]; if (p && p.length) parts.push({ ops: p, part: 'mine' }); }
  return parts;
}

type ExitReason = 'done' | 'END' | 'maxSteps' | 'error';

export interface NightResultX extends NightResult {
  /** seed used (pass to runNight to replay with snapshots) */
  seed: number;
  /** concrete input angles */
  angles: Angles;
  /** for state+report: the parity the bot was expected to report (null if not definite) */
  expectedReport?: 0 | 1 | null;
  message?: string;
  /** largest number of live qubits in the state vector during this night (perf diagnostic) */
  maxLiveQubits: number;
}

export function runNight(
  level: LevelDef, prog: { bedtime?: Program; morning?: Program }, input: InputState,
  errors: ErrorEvent[], seed: number, opts: RunOptions = {},
): NightResultX {
  const wantSnaps = opts.snapshots !== false;
  const rng = makeRng(seed);
  const angles = resolveInput(input, rng);
  const concreteInput: InputState = input === 'random' ? { ...angles } : input;
  const goal = level.goal;
  const ids: QubitId[] = [...level.qubbles.map(p => p.id), ...level.bots.map(p => p.id)];
  const known = new Set<string>(ids);
  const peekOk = !!level.classical || !!level.allowPeekData;
  const maxSteps = level.maxSteps ?? DEFAULT_MAX_STEPS;

  const s = new QState();
  const steps: TraceStep[] = [];
  const lights: Partial<Record<QubitId, 0 | 1 | null>> = {};
  for (const q of ids) lights[q] = null;
  const woke: QubbleId[] = [];
  let stepCount = 0;
  let message: string | undefined;

  let idealTarget: Target | null = null;
  let configError: string | undefined;
  try {
    if (goal.kind !== 'classical') idealTarget = buildTarget(level, goal.dataQubits, goal.targetCircuit, angles);
  } catch (e) { configError = (e as Error).message; }

  let lastSnap: Snapshot = EMPTY_SNAPSHOT;
  const cache = new SnapCache();
  const record: { who: QubitId; bit: 0 | 1 }[] = [];
  const nerdStabs = wantSnaps && opts.nerd ? stabilizerSet(level) : null;
  const withNerd = (snap: Snapshot, useCache: boolean): Snapshot => {
    if (!nerdStabs) return snap;
    const ctx: NerdCtx = { ids, stabs: nerdStabs, record, fidelity: snap.logicalFidelity };
    if (useCache) { ctx.miCache = cache.mi; ctx.blochCache = cache.bloch; }
    snap.nerd = computeNerd(s, ctx);
    return snap;
  };
  const emit = (ev: TraceEvent, fresh = true) => {
    if (wantSnaps && fresh) {
      if (ev.k === 'gate') cache.touch(ev.op === 'HIGHFIVE' ? { pair: [ev.from!, ev.t] } : ev.op === 'RESET' ? 'all' : { local: [ev.t] });
      else if (ev.k === 'noise') cache.touch({ local: [ev.e.t] });
      else cache.touch('all');
      lastSnap = withNerd(snapshot(s, ids, lights, idealTarget, opts.topAmps, opts.noSnapCache ? undefined : cache), !opts.noSnapCache);
    }
    steps.push({ ev, snap: wantSnaps ? lastSnap : EMPTY_SNAPSHOT });
  };

  if (!known.has(level.inputQubble)) configError ??= `inputQubble ${level.inputQubble} is not in the level`;
  if (!configError) s.prepare(level.inputQubble, angles.theta, angles.phi);
  if (wantSnaps) lastSnap = withNerd(snapshot(s, ids, lights, idealTarget, opts.topAmps), false);

  const exec = (parts: Part[], phase: Phase): ExitReason => {
    for (const { ops, part } of parts) {
      const labels = new Map<string, number>();
      ops.forEach((o, i) => { if (o.op === 'LABEL') labels.set(o.name.toLowerCase(), i); });
      let pc = 0;
      while (pc < ops.length) {
        const o = ops[pc];
        emit({ k: 'line', phase, pc, part }, false);
        if (o.op === 'LABEL' || o.op === 'NOTE') { pc++; continue; }
        if (++stepCount > maxSteps) { stepCount--; message = `ran more than ${maxSteps} steps (endless loop?)`; return 'maxSteps'; }
        const fail = (m: string): ExitReason => { message = `${phase}${part === 'fixed' ? ' (fixed part)' : ''} line ${pc + 1}: ${m}`; return 'error'; };
        const chk = (q: string) => known.has(q) ? null : `there is no ${q} in this room`;
        switch (o.op) {
          case 'BOOP': case 'SHUSH': case 'SPIN': {
            const e = chk(o.t); if (e) return fail(e);
            if (o.op === 'BOOP') s.x(o.t); else if (o.op === 'SHUSH') s.z(o.t); else s.h(o.t);
            emit({ k: 'gate', op: o.op, t: o.t });
            break;
          }
          case 'HIGHFIVE': {
            const e = chk(o.from) ?? chk(o.to); if (e) return fail(e);
            if (o.from === o.to) return fail('HIGHFIVE needs two different creatures');
            s.cnot(o.from, o.to);
            emit({ k: 'gate', op: 'HIGHFIVE', t: o.to, from: o.from });
            break;
          }
          case 'RESET': {
            const e = chk(o.t); if (e) return fail(e);
            if (!isBot(o.t)) return fail(`RESET only works on bots, not ${o.t}`);
            s.reset(o.t, rng);
            emit({ k: 'gate', op: 'RESET', t: o.t });
            break;
          }
          case 'LISTEN': case 'PEEK': {
            const e = chk(o.t); if (e) return fail(e);
            if (o.op === 'LISTEN' && !isBot(o.t)) return fail(`LISTEN only works on bots; use PEEK for ${o.t}`);
            const r = s.measure(o.t, rng);
            lights[o.t] = r;
            record.push({ who: o.t, bit: r });
            const isWoke = isQubble(o.t) && !peekOk;
            if (isWoke && !woke.includes(o.t as QubbleId)) woke.push(o.t as QubbleId);
            emit({ k: 'measure', t: o.t, result: r, woke: isWoke });
            break;
          }
          case 'IF': case 'JUMP': {
            const to = labels.get(o.label.toLowerCase());
            if (to === undefined) return fail(`no label called "${o.label}"`);
            let taken = true;
            if (o.op === 'IF') for (const c of o.conds) {
              const e = chk(c.who); if (e) return fail(e);
              const lit = lights[c.who] === 1;
              if (lit !== (c.is === 'BEEP')) { taken = false; break; }
            }
            emit({ k: 'jump', to, taken }, false);
            if (taken) { pc = to; continue; }
            break;
          }
          case 'END': return 'END';
        }
        pc++;
      }
    }
    return 'done';
  };

  let reason: ExitReason = configError ? 'error' : 'done';
  if (configError) message = configError;
  let postNoiseParity: number | null = null;
  if (reason === 'done') {
    emit({ k: 'phase', phase: 'bedtime' }, false);
    reason = exec(phaseProgram(level, prog, 'bedtime'), 'bedtime');
    if (reason === 'END') reason = 'done';
    if (reason === 'done') {
      emit({ k: 'phase', phase: 'night' }, false);
      for (const e of errors) {
        if (!known.has(e.t)) { reason = 'error'; message = `noise targets unknown qubble ${e.t}`; break; }
        applyError(s, e);
        emit({ k: 'noise', e });
      }
    }
    if (reason === 'done' && goal.kind === 'state+report') postNoiseParity = s.parityProb1(goal.report.of);
    if (reason === 'done') {
      emit({ k: 'phase', phase: 'morning' }, false);
      reason = exec(phaseProgram(level, prog, 'morning'), 'morning');
    }
  }
  emit({ k: 'end', reason, message }, false);

  // ── evaluation ──
  let fidelity = 0;
  let reportOk: boolean | undefined;
  let expectedReport: 0 | 1 | null | undefined;
  let goalOk = false;
  if (reason !== 'error') {
    try {
      if (goal.kind === 'classical') {
        if (goal.expect === 'restore') throw new Error("classical goal 'restore' is not supported; use goal 'state' (see QUANTUM_NOTES)");
        fidelity = 1;
        for (const [q, v] of Object.entries(goal.expect)) { const p1 = s.prob1(q); fidelity *= v ? p1 : 1 - p1; }
        goalOk = fidelity >= DEFAULT_MIN_FIDELITY;
      } else {
        const target = goal.kind === 'state+report'
          ? buildTarget(level, goal.dataQubits, goal.targetCircuit, angles, errors)
          : idealTarget ?? buildTarget(level, goal.dataQubits, goal.targetCircuit, angles);
        fidelity = fidelityTo(s, target);
        const minF = goal.minFidelity ?? (goal.kind === 'rate' ? DEFAULT_RATE_MIN_FIDELITY : DEFAULT_MIN_FIDELITY);
        goalOk = fidelity >= minF;
        if (goal.kind === 'state+report') {
          const light = lights[goal.report.bot] ?? null;
          const p = postNoiseParity ?? 0.5;
          expectedReport = p < DEFINITE ? 0 : p > 1 - DEFINITE ? 1 : null;
          if (light === null) reportOk = false;
          else if (expectedReport !== null) reportOk = light === expectedReport;
          else {
            // post-noise parity was not definite (e.g. a wobble): the report must be a true
            // statement about the final state, i.e. the final parity must equal the light with certainty.
            const pf = s.parityProb1(goal.report.of);
            reportOk = light === 1 ? pf > 1 - DEFINITE : pf < DEFINITE;
          }
        }
      }
    } catch (e) { reason = 'error'; message = (e as Error).message; }
  }

  let failReason: NightResult['failReason'];
  if (reason === 'error') failReason = 'error';
  else if (reason === 'maxSteps') failReason = 'maxSteps';
  else if (woke.length) failReason = 'woke';
  else if (!goalOk) failReason = 'wrong-dream';
  else if (reportOk === false) failReason = 'wrong-report';

  return {
    input: concreteInput, errors, steps, fidelity, woke, reportOk, pass: !failReason, stepCount, failReason,
    seed, angles, expectedReport, message, maxLiveQubits: s.maxN,
  };
}

// ───────────────────────── test suite ─────────────────────────
export function programLines(level: LevelDef, prog: { bedtime?: Program; morning?: Program }): Program {
  return level.editable.flatMap(ph => prog[ph] ?? []);
}

export function countLines(p: Program): number { return p.filter(o => o.op !== 'LABEL' && o.op !== 'NOTE').length; }

export function botsReferenced(p: Program): BotId[] {
  const s = new Set<BotId>();
  const add = (q: string) => { if (isBot(q)) s.add(q); };
  for (const o of p) {
    if ('t' in o) add(o.t);
    if (o.op === 'HIGHFIVE') { add(o.from); add(o.to); }
    if (o.op === 'IF') o.conds.forEach(c => add(c.who));
  }
  return [...s].sort();
}

export interface TestOptions { snapshots?: boolean }
export type TestReportX = Omit<TestReport, 'nights'> & { nights: NightResultX[] };

export function testLevel(level: LevelDef, prog: { bedtime?: Program; morning?: Program }, seed = 1, opts: TestOptions = {}): TestReportX {
  const ropts: RunOptions = { snapshots: !!opts.snapshots };
  const nights: NightResultX[] = [];
  const goal = level.goal;
  let k = 0;
  const nextSeed = () => mixSeed(seed, k++);

  if (goal.kind === 'rate') {
    const enumCases = level.noise.mode === 'random' ? null : enumerateErrors(level);
    const N = enumCases ? Math.max(goal.nights, enumCases.length) : goal.nights;
    for (let i = 0; i < N; i++) {
      const sd = nextSeed();
      const nrng = makeRng(mixSeed(sd, 0xabc));
      const inp = level.inputs[i % level.inputs.length];
      const input: InputState = inp === 'random' ? { ...haarAngles(nrng) } : inp;
      const errs = enumCases ? enumCases[i % enumCases.length] : randomErrors(level, nrng);
      nights.push(runNight(level, prog, input, errs, sd, ropts));
    }
  } else {
    const inRng = makeRng(mixSeed(seed, 0x1a2b3c));
    const inputs: InputState[] = level.inputs.flatMap(inp =>
      inp === 'random' ? Array.from({ length: RANDOM_INPUTS_PER_ENTRY }, () => ({ ...haarAngles(inRng) })) : [inp]);
    const noiseRng = makeRng(mixSeed(seed, 0x5eed));
    for (const input of inputs) {
      const cases = level.noise.mode === 'random'
        ? Array.from({ length: RANDOM_NOISE_NIGHTS_PER_INPUT }, () => randomErrors(level, noiseRng))
        : enumerateErrors(level);
      for (const errs of cases) nights.push(runNight(level, prog, input, errs, nextSeed(), ropts));
    }
  }

  const passCount = nights.filter(n => n.pass).length;
  const passRate = nights.length ? passCount / nights.length : 0;
  const passed = goal.kind === 'rate' ? passRate >= goal.minRate : passCount === nights.length && nights.length > 0;
  const player = programLines(level, prog);
  return {
    levelId: level.id, nights, passed, passRate,
    lines: countLines(player),
    avgSteps: nights.length ? nights.reduce((a, n) => a + n.stepCount, 0) / nights.length : 0,
    botsUsed: botsReferenced(player).length,
  };
}
