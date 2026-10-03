/**
 * Persistence. The save is written to THREE localStorage keys and read back by majority vote,
 * so "Save data protected by 3-qubit repetition code ✓" is literally true.
 */
import type { Program } from '../core/contracts';

export interface Settings {
  master: number; music: number; sfx: number; voice: number;
  nerd: boolean; reducedMotion: boolean; xrayDefault: boolean;
}
export interface LevelProgress { done: boolean; stars: [boolean, boolean, boolean]; bestLines?: number; bestSteps?: number; fails?: number }
export interface SaveData {
  v: 1;
  progress: Record<string, LevelProgress>;
  programs: Record<string, { bedtime?: Program; morning?: Program }>;
  /** player-chosen caretaker / Schrödi-box spots per level key (cosmetic, v0.4) */
  homes?: Record<string, { ct?: { gx: number; gy: number }; box?: { gx: number; gy: number } }>;
  /** A/B/C program slots per level key (v0.3) */
  slots?: Record<string, { active: { bedtime: number; morning: number }; bedtime: Program[]; morning: Program[] }>;
  settings: Settings;
  flags: Record<string, boolean>;
  endlessBest: Record<string, number>;
  /** level id where the map caretaker stands */
  mapAt?: string;
}

const KEYS = ['np.save.a', 'np.save.b', 'np.save.c'];
const defaults = (): SaveData => ({
  v: 1,
  progress: {},
  programs: {},
  slots: {},
  settings: { master: 0.8, music: 0.6, sfx: 0.8, voice: 0.5, nerd: false, reducedMotion: false, xrayDefault: false },
  flags: {},
  endlessBest: {},
});

export let lastRepair = false;

function load(): SaveData {
  const copies: (string | null)[] = KEYS.map((k) => {
    try { return localStorage.getItem(k); } catch { return null; }
  });
  // majority vote: any value appearing at least twice wins; else first parseable one
  let winner: string | null = null;
  for (let i = 0; i < 3 && !winner; i++) for (let j = i + 1; j < 3; j++) if (copies[i] && copies[i] === copies[j]) { winner = copies[i]; break; }
  if (!winner) winner = copies.find((c) => c) ?? null;
  lastRepair = !!winner && copies.some((c) => c !== winner);
  if (!winner) return defaults();
  try {
    const d = JSON.parse(winner) as SaveData;
    const base = defaults();
    return { ...base, ...d, settings: { ...base.settings, ...d.settings }, flags: { ...d.flags }, progress: { ...d.progress }, programs: { ...d.programs }, slots: { ...(d.slots ?? {}) }, homes: { ...(d.homes ?? {}) }, endlessBest: { ...d.endlessBest } };
  } catch {
    return defaults();
  }
}

export const save: SaveData = load();
if (lastRepair) persist();

let pending = 0;
export function persist(): void {
  clearTimeout(pending);
  pending = window.setTimeout(() => {
    const s = JSON.stringify(save);
    for (const k of KEYS) { try { localStorage.setItem(k, s); } catch { /* private mode etc. */ } }
  }, 150);
}

export function setProgress(id: string, p: Partial<LevelProgress>): void {
  const cur = save.progress[id] ?? { done: false, stars: [false, false, false] };
  const stars: [boolean, boolean, boolean] = [
    cur.stars[0] || !!p.stars?.[0], cur.stars[1] || !!p.stars?.[1], cur.stars[2] || !!p.stars?.[2],
  ];
  save.progress[id] = { ...cur, ...p, done: cur.done || !!p.done, stars };
  persist();
}

export function resetSave(): void {
  for (const k of KEYS) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  Object.assign(save, defaults());
}
