/**
 * Every content gate in one place. "Unlock all content!" (Settings, judge mode) sets save.flags.unlockAll,
 * which opens: all levels (map), all Codex entries, card-guide pro terms, and starter snippets.
 */
import { audio } from '../engine/deps';
import { save, persist } from '../engine/store';
import { toast } from '../engine/util';
import { CODEX, type CodexEntry } from './codexData';

export const unlockAll = (): boolean => !!save.flags.unlockAll;
/** level won (or judge mode): gates pro terms, starter snippets, … */
export const levelDone = (id: string): boolean => unlockAll() || !!save.progress[id]?.done;

export const codexHas = (id: string): boolean => unlockAll() || !!save.flags['codex:' + id];
export const codexFound = (): number => CODEX.filter((e) => codexHas(e.id)).length;

let lastToast = 0;
/** Unlock a Codex entry (no-op if already found). Shows a sparkly toast + sfx the first time. */
export function unlockCodex(id: string): boolean {
  if (save.flags['codex:' + id]) return false;
  const e: CodexEntry | undefined = CODEX.find((x) => x.id === id);
  if (!e) return false;
  save.flags['codex:' + id] = true;
  persist();
  if (unlockAll()) return true; // judge mode: everything is already visible, stay quiet
  const now = performance.now();
  const gap = Math.max(0, 500 - (now - lastToast)); lastToast = now + gap;
  setTimeout(() => {
    toast(`📖 New Codex entry: ${e.name}!`, 'good codex-toast', 3000);
    audio.sfx('qubble_giggle', { pitch: 1.4, volume: 0.6 });
    setTimeout(() => audio.sfx('ui_hover', { pitch: 2, volume: 0.5 }), 120);
  }, gap);
  return true;
}

export function setUnlockAll(on: boolean): void {
  save.flags.unlockAll = on; persist();
  toast(on ? 'Everything unlocked (judge mode)' : 'Normal unlocks', on ? 'good' : '');
}
