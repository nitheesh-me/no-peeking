/** Exports: download / copy, JSON / CSV / Qiskit / OpenQASM 3 (shared exporter in src/quantum). */
import type { LevelDef, NightResult, Program } from '../../../core/contracts';
import { toOpenQASM3, toQiskit } from '../../../quantum/index';
import type { AfiRun } from '../state/store';

export function download(name: string, text: string, type = 'text/plain'): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
export function circuitText(fmt: 'qiskit' | 'qasm3', level: LevelDef, night: NightResult, prog: { bedtime?: Program; morning?: Program }): string {
  const o = { prog, dynamic: true, includeErrors: true };
  return fmt === 'qiskit' ? toQiskit(level, night, o) : toOpenQASM3(level, night, o);
}
export function runsCsv(runs: AfiRun[]): string {
  const head = ['id', 'time', 'level', 'kind', 'seed', 'noise', 'pass', 'fidelity', 'trials', 'failures', 'rate', 'ci_lo', 'ci_hi', 'gates', 'depth', 'ancillas'];
  const rows = runs.flatMap((r) => {
    const base = (mc?: AfiRun['mc'], noise = r.noise ?? '') => [r.id, new Date(r.at).toISOString(), r.levelId, r.kind, mc?.seed ?? r.seed, noise, r.pass ?? '', r.fidelity ?? '', mc?.trials ?? '', mc?.failures ?? '', mc?.rate ?? '', mc?.ci95[0] ?? '', mc?.ci95[1] ?? '', r.gates, r.depth, r.ancillas];
    if (r.sweep) return r.sweep.map((s) => base(s.mc, `${r.noise ?? ''} p=${s.p}`));
    return [base(r.mc)];
  });
  return [head, ...rows].map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\n') + '\n';
}
