/** Plain DOM stand-in for viz/loadingCircuit.ts (used until / unless the Visual Director's module is present). */
import type { CreateLoadingCircuit } from '../state/vizApi';

export const fallbackLoadingCircuit: CreateLoadingCircuit = (host, stages) => {
  const el = document.createElement('div');
  el.className = 'afi-lc-fallback';
  const wires = Array.from({ length: 5 }, (_, w) => {
    const row = document.createElement('div');
    row.className = 'afi-lc-wire';
    row.innerHTML = `<span class="afi-lc-ket">q${w}</span>`;
    el.appendChild(row);
    return row;
  });
  host.appendChild(el);
  const cells: HTMLElement[][] = stages.map((_, i) => wires.map((row, w) => {
    const c = document.createElement('span');
    c.className = 'afi-lc-gate';
    c.textContent = (i + w) % 3 === 0 ? 'H' : (i + w) % 3 === 1 ? '•' : '⊕';
    row.appendChild(c);
    return c;
  }));
  const meters = wires.map((row) => { const m = document.createElement('span'); m.className = 'afi-lc-meter'; m.textContent = '⟨Z⟩'; row.appendChild(m); return m; });
  return {
    stageStart(i) { cells[i]?.forEach((c) => c.classList.add('placing')); },
    stageDone(i) { cells[i]?.forEach((c) => { c.classList.remove('placing'); c.classList.add('placed'); }); },
    finish(out) { meters.forEach((m, w) => { m.textContent = String(out[w] ?? 0); m.classList.add('measured'); }); },
    destroy() { el.remove(); },
  };
};
