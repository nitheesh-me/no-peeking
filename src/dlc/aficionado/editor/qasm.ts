/**
 * QASM-like text view of the editable circuit (two-way synced with the grid). Grammar, one statement per line,
 * `;` optional, case-insensitive, `//` comments ignored, `# text` = annotation (NOTE):
 *   // preparation · // noise channel · // extraction and recovery   section headers (localised stage names;
 *                                          `stage pre:` / `stage post:` are accepted too)
 *   x q · z q · h q · y q · s q · sdg q    single-qubit gates (sdg = S†)
 *   cx c, t · cz a, b · swap a, b          two-qubit gates (control, target)
 *   wait                                   one noise round (errors of round k strike at the k-th wait)
 *   measure q [-> c_q]                     projective Z measurement into classical bit c_q
 *   reset q                                ancilla reset to |0⟩
 *   if (c_a==1 && c_b==0) <gate>           classically controlled gate
 *   if (c_a==1) goto L · goto L · L: · end raw control flow (kept verbatim)
 */
import type { Cond, QubitId } from '../../../core/contracts';
import { isBot, isQubble } from '../../../core/contracts';
import { condKey, newId, type Column, type Ctrl, type Gate, type GateKind, type PhaseName, orderColumn, packItems } from './model';

export interface TextError { line: number; key: string; vars?: Record<string, string | number> }
type Item = { g?: Gate; c?: Ctrl };

const G1: Record<string, GateKind> = { x: 'X', z: 'Z', h: 'H', y: 'Y', s: 'S', sdg: 'SDG', measure: 'MEASURE', reset: 'RESET' };
const G2: Record<string, GateKind> = { cx: 'CNOT', cnot: 'CNOT', cz: 'CZ', swap: 'SWAP' };
const NAME: Record<GateKind, string> = { X: 'x', Z: 'z', H: 'h', Y: 'y', S: 's', SDG: 'sdg', CNOT: 'cx', CZ: 'cz', SWAP: 'swap', MEASURE: 'measure', RESET: 'reset' };

/** Section header names (the content pack's afi.stage.*); defaults are for tests and tooling. */
export interface StageLabels { bedtime: string; night: string; morning: string }
export const DEFAULT_LABELS: StageLabels = { bedtime: 'preparation', night: 'noise channel', morning: 'extraction and recovery' };
const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, ' ');

export function parseText(text: string, wires: QubitId[], phases: PhaseName[], labels: StageLabels = DEFAULT_LABELS): { stages: Partial<Record<PhaseName, Column[]>>; errors: TextError[] } {
  const errors: TextError[] = [];
  const items: Partial<Record<PhaseName, Item[]>> = {};
  let cur: PhaseName = phases[0] ?? 'morning';
  for (const p of phases) items[p] = [];
  const wire = (s: string, ln: number): QubitId | null => {
    const id = s.trim().toLowerCase();
    if ((isBot(id) || isQubble(id)) && wires.includes(id as QubitId)) return id as QubitId;
    errors.push({ line: ln, key: 'afi.editor.err.unknownWire', vars: { w: s.trim() } }); return null;
  };
  const gate = (stmt: string, ln: number, cond?: Cond[]): Gate | null => {
    const m = /^(\w+)\s+(.+)$/.exec(stmt);
    if (!m) { errors.push({ line: ln, key: 'afi.editor.err.syntax', vars: { s: stmt } }); return null; }
    const name = m[1].toLowerCase();
    if (G2[name]) {
      const parts = m[2].split(/\s*,\s*|\s+/).filter(Boolean);
      if (parts.length !== 2) { errors.push({ line: ln, key: 'afi.editor.err.twoArgs', vars: { g: name } }); return null; }
      const c = wire(parts[0], ln), t = wire(parts[1], ln);
      if (!c || !t) return null;
      if (c === t) { errors.push({ line: ln, key: 'afi.editor.err.sameWire' }); return null; }
      return { id: newId(), kind: G2[name], c, q: t, cond };
    }
    if (G1[name]) {
      let arg = m[2];
      if (name === 'measure') {
        const mm = /^(\w+)\s*(?:->\s*(\w+))?$/.exec(arg.trim());
        if (!mm) { errors.push({ line: ln, key: 'afi.editor.err.syntax', vars: { s: stmt } }); return null; }
        if (mm[2] && mm[2].toLowerCase() !== `c_${mm[1].toLowerCase()}`) { errors.push({ line: ln, key: 'afi.editor.err.bitName', vars: { q: mm[1], b: mm[2] } }); return null; }
        arg = mm[1];
      }
      const t = wire(arg, ln); if (!t) return null;
      if (name === 'reset' && !isBot(t)) { errors.push({ line: ln, key: 'afi.editor.err.resetData', vars: { q: t } }); return null; }
      return { id: newId(), kind: G1[name], q: t, cond };
    }
    errors.push({ line: ln, key: 'afi.editor.err.unknownGate', vars: { g: m[1] } }); return null;
  };
  const conds = (s: string, ln: number): Cond[] | null => {
    const out: Cond[] = [];
    for (const part of s.split(/\s*&&\s*/)) {
      const m = /^c_(\w+)\s*==\s*([01])$/i.exec(part.trim());
      if (!m) { errors.push({ line: ln, key: 'afi.editor.err.cond', vars: { s: part.trim() } }); return null; }
      const w = wire(m[1], ln); if (!w) return null;
      out.push({ who: w, is: m[2] === '1' ? 'BEEP' : 'QUIET' });
    }
    return out;
  };
  text.replace(/\r/g, '').split('\n').forEach((raw, idx) => {
    const ln = idx + 1;
    let line = raw.trim();
    if (line.startsWith('#')) { items[cur]?.push({ c: { kind: 'NOTE', text: line.slice(1).trim() } }); return; }
    const cm = line.indexOf('//');
    if (cm === 0) {
      // a section header comment selects the stage; any other comment is ignored
      const hd = norm(line.slice(2));
      const p: PhaseName | null = hd === norm(labels.bedtime) ? 'bedtime' : hd === norm(labels.morning) ? 'morning' : null;
      if (p) { if (!phases.includes(p)) errors.push({ line: ln, key: 'afi.editor.err.stageLocked', vars: { s: labels[p] } }); else cur = p; }
      return;
    }
    if (cm > 0) line = line.slice(0, cm).trim();
    for (let stmt of line.split(';')) {
      stmt = stmt.trim();
      if (!stmt) continue;
      const st = /^stage\s+(pre|post)\s*:?$/i.exec(stmt);
      if (st) {
        const p: PhaseName = st[1].toLowerCase() === 'pre' ? 'bedtime' : 'morning';
        if (!phases.includes(p)) errors.push({ line: ln, key: 'afi.editor.err.stageLocked', vars: { s: st[1] } }); else cur = p;
        continue;
      }
      const list = items[cur]!;
      const lab = /^([A-Za-z_][\w-]*)\s*:$/.exec(stmt);
      if (lab) { list.push({ c: { kind: 'LABEL', name: lab[1] } }); continue; }
      if (/^end$/i.test(stmt)) { list.push({ c: { kind: 'END' } }); continue; }
      if (/^wait$/i.test(stmt)) { list.push({ c: { kind: 'WAIT' } }); continue; }
      const gt = /^goto\s+([A-Za-z_][\w-]*)$/i.exec(stmt);
      if (gt) { list.push({ c: { kind: 'JUMP', label: gt[1] } }); continue; }
      const iff = /^if\s*\((.+)\)\s*(.+)$/i.exec(stmt);
      if (iff) {
        const cs = conds(iff[1], ln); if (!cs) continue;
        const g2 = /^goto\s+([A-Za-z_][\w-]*)$/i.exec(iff[2].trim());
        if (g2) { list.push({ c: { kind: 'IFJ', conds: cs, label: g2[1] } }); continue; }
        const g = gate(iff[2].trim(), ln, cs); if (g) list.push({ g });
        continue;
      }
      const g = gate(stmt, ln); if (g) list.push({ g });
    }
  });
  // label checks per stage
  const stages: Partial<Record<PhaseName, Column[]>> = {};
  for (const p of phases) {
    const its = items[p]!;
    const labels = new Set(its.flatMap((i) => (i.c?.kind === 'LABEL' ? [i.c.name.toLowerCase()] : [])));
    for (const i of its) if ((i.c?.kind === 'JUMP' || i.c?.kind === 'IFJ') && !labels.has(i.c.label.toLowerCase())) errors.push({ line: 0, key: 'afi.editor.err.noLabel', vars: { l: i.c.label } });
    stages[p] = packItems(its, wires);
  }
  errors.sort((a, b) => a.line - b.line);
  return { stages, errors };
}

const condText = (c: Cond[]): string => c.map((k) => `c_${k.who}==${k.is === 'BEEP' ? 1 : 0}`).join(' && ');
function gateText(g: Gate): string {
  const body = g.c ? `${NAME[g.kind]} ${g.c}, ${g.q}` : g.kind === 'MEASURE' ? `measure ${g.q} -> c_${g.q}` : `${NAME[g.kind]} ${g.q}`;
  return g.cond?.length ? `if (${condText(g.cond)}) ${body};` : `${body};`;
}
function ctrlText(c: Ctrl): string {
  switch (c.kind) {
    case 'LABEL': return `${c.name}:`;
    case 'JUMP': return `goto ${c.label};`;
    case 'IFJ': return `if (${condText(c.conds)}) goto ${c.label};`;
    case 'END': return 'end;';
    case 'WAIT': return 'wait;';
    case 'NOTE': return `# ${c.text}`;
  }
}

export function printText(stages: { phase: PhaseName; cols: Column[] }[], wires: QubitId[], labels: StageLabels = DEFAULT_LABELS): string {
  const out: string[] = [];
  for (const s of stages) {
    if (s.phase === 'morning' && out.length) out.push(`// ${labels.night}`, '');
    out.push(`// ${labels[s.phase]}`);
    for (const c of s.cols) {
      if (c.ctrl) { out.push(ctrlText(c.ctrl)); continue; }
      const gs = orderColumn(c.gates, wires);
      // one line per column (a time step); conditioned gates on their own line
      const plain = gs.filter((g) => !condKey(g.cond)).map(gateText);
      if (plain.length) out.push(plain.join(' '));
      for (const g of gs.filter((g) => condKey(g.cond))) out.push(gateText(g));
    }
    out.push('');
  }
  return out.join('\n').trimEnd() + '\n';
}
