/** Gremlin Lab (sandbox, X-ray always on) and Night Shift (endless, procedurally generated rate levels). */
import type { TestReport, LevelDef, Program, OpName, ErrorEvent, InputState, QubbleId, Placement, BotId } from '../../core/contracts';
import { quantum } from '../../engine/deps';
import { makeRng } from '../../quantum/index';
import { save, persist } from '../../engine/store';
import { h, toast } from '../../engine/util';
import { levelScreen, type LevelApi } from './level';
import { openNightLab } from '../nightLab';
import type { Nav } from '../app';

const P = (s: string): Program => quantum.parseProgram(s.trim()).prog;
const ALL: OpName[] = ['BOOP', 'SHUSH', 'SPIN', 'HIGHFIVE', 'LISTEN', 'RESET', 'PEEK', 'IF', 'JUMP', 'END', 'NOTE'];

function layout(nq: number, nb: number): { qubbles: Placement[]; bots: Placement[] } {
  const qubbles: Placement[] = [], bots: Placement[] = [];
  for (let i = 0; i < nq; i++) qubbles.push({ id: `q${i + 1}` as QubbleId, x: 1 + i * 2, y: 1 });
  for (let i = 0; i < nb; i++) bots.push({ id: String.fromCharCode(97 + i) as BotId, x: 2 + i * 2, y: 3 });
  return { qubbles, bots };
}

// ───────────────────────── Gremlin Lab ─────────────────────────
function labLevel(nq: number, nb: number): LevelDef {
  return {
    id: 'lab', chapter: 5, title: 'Gremlin Lab', subtitle: 'Sandbox. X-ray always on. Break things on purpose.',
    ...layout(nq, nb), toolbox: ALL, editable: ['bedtime', 'morning'], inputs: ['random'], inputQubble: 'q1',
    noise: { mode: 'none' }, goal: { kind: 'state', dataQubits: ['q1'], targetCircuit: [] }, allowPeekData: true,
    intro: [], hints: [], winLine: [], reveal: 'Science!', solution: {},
  };
}

export function labScreen(root: HTMLElement, nav: Nav): () => void {
  let nq = 3, nb = 2;
  const sel = (opts: [string, string][], val: string) => {
    const s = h('select') as HTMLSelectElement;
    for (const [v, t] of opts) s.appendChild(h('option', { value: v }, t));
    s.value = val; return s;
  };
  return levelScreen(root, nav, {
    def: labLevel(nq, nb), kind: 'lab',
    extra: (api: LevelApi) => {
      const size = sel([['1,1', '1 Qubble + 1 bot'], ['3,2', '3 Qubbles + 2 bots'], ['5,4', '5 Qubbles + 4 bots']], '3,2');
      const input = sel([['zero', '☀ Sunny'], ['one', '🌙 Moony'], ['plus', '🌀 swirl +'], ['minus', '🌀 swirl −'], ['plusI', '🌀 swirl i'], ['random', '🎲 random']], 'plus');
      const grem = h('select') as HTMLSelectElement;
      const fillGrem = () => {
        grem.innerHTML = '';
        grem.appendChild(h('option', { value: 'none' }, 'no gremlin'));
        for (let i = 1; i <= nq; i++) for (const [k, t] of [['flip', '😈 flip'], ['phase', '👻 phase'], ['both', '😈👻 both'], ['wobble', '🫠 wobble']])
          grem.appendChild(h('option', { value: `${k}:q${i}` }, `${t} q${i}`));
      };
      fillGrem();
      size.addEventListener('change', () => { [nq, nb] = size.value.split(',').map(Number); fillGrem(); api.setLevel(labLevel(nq, nb)); });
      const go = h('button', { class: 'btn small primary', onclick: () => {
        const errors: ErrorEvent[] = [];
        if (grem.value !== 'none') {
          const [k, t] = grem.value.split(':') as [ErrorEvent['kind'], QubbleId];
          errors.push(k === 'wobble' ? { kind: 'wobble', t, axis: 'x', angle: Math.PI / 3 } : { kind: k, t } as ErrorEvent);
        }
        api.runNight(input.value as InputState, errors);
      } }, 'Run lab night');
      return h('div', { class: 'lab-bar' }, size, input, grem, go, h('button', { class: 'btn small sun', title: 'Logical vs physical error rate', onclick: () => openNightLab() }, 'Threshold chart'));
    },
  });
}

// ───────────────────────── Night Shift (endless) ─────────────────────────
type Family = 'bit3' | 'phase3' | 'bit5';
const FAM_NAME: Record<Family, string> = { bit3: '3-Qubble flip shift', phase3: '3-Qubble ghost shift', bit5: '5-Qubble flip shift' };

export function shiftLevel(seed: number): { def: LevelDef; family: Family; p: number } {
  const rng = makeRng(seed);
  const fams: Family[] = ['bit3', 'phase3', 'bit5'];
  const family = fams[Math.floor(rng() * fams.length)];
  const p = [0.05, 0.08, 0.1, 0.12, 0.15][Math.floor(rng() * 5)];
  const n = family === 'bit5' ? 5 : 3;
  const enc = Array.from({ length: n - 1 }, (_, i) => `HIGHFIVE q1 -> q${i + 2}`).join('\n');
  const spins = Array.from({ length: n }, (_, i) => `SPIN q${i + 1}`).join('\n');
  const encode = P(family === 'phase3' ? `${enc}\n${spins}` : enc);
  const toolbox: OpName[] = ['HIGHFIVE', 'LISTEN', 'RESET', 'IF', 'JUMP', 'END', 'BOOP', ...(family === 'phase3' ? ['SPIN', 'SHUSH'] as OpName[] : [])];
  const nights = 100;
  const minRate = Math.round((1 - p) * 100) / 100; // beat an unprotected Qubble
  const def: LevelDef = {
    id: `shift-${seed}`, chapter: 5, title: 'Night Shift',
    subtitle: `${FAM_NAME[family]} · each Qubble gets hit with chance ${Math.round(p * 100)}% · beat ${Math.round(minRate * 100)}%`,
    ...layout(n, n - 1), toolbox, editable: ['morning'], fixedBedtime: encode,
    inputs: ['random'], inputQubble: 'q1',
    noise: { mode: 'random', p, kinds: [family === 'phase3' ? 'phase' : 'flip'] },
    goal: { kind: 'rate', dataQubits: Array.from({ length: n }, (_, i) => `q${i + 1}` as QubbleId), targetCircuit: encode, nights, minRate },
    intro: [], hints: [], winLine: [], reveal: 'A code beats a lone Qubble as long as the gremlins are rare enough.',
    proTerm: 'Pros call this: below the threshold, logical error < physical error.', solution: {},
  };
  return { def, family, p };
}

export function endlessScreen(root: HTMLElement, nav: Nav, arg?: unknown): () => void {
  const d = new Date();
  const daily = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const seed = typeof arg === 'number' ? arg : daily;
  const { def, family } = shiftLevel(seed);
  const key = `shift-${family}`;
  const best = () => save.endlessBest[String(seed)] ?? 0;
  const score = h('span', { class: 'score-pill' }, `best ${Math.round(best() * 100)}%`);
  return levelScreen(root, nav, {
    def, kind: 'endless', progKey: key,
    extra: () => h('div', { class: 'lab-bar' },
      h('span', { class: 'tag' }, seed === daily ? 'daily shift' : `shift #${seed}`), score,
      h('button', { class: 'btn small', onclick: () => nav.go('endless', (Math.random() * 1e6) | 0) }, 'New shift')),
    onReport: (r: TestReport) => {
      if (r.passRate > best()) { save.endlessBest[String(seed)] = r.passRate; persist(); if (r.passed) toast(`New best: ${Math.round(r.passRate * 100)}% of nights survived`, 'good'); }
      score.textContent = `best ${Math.round(best() * 100)}% · now ${Math.round(r.passRate * 100)}%`;
    },
  });
}
