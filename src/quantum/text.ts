/**
 * Bot Code text form (DESIGN_BIBLE §4). Forgiving parser + canonical printer.
 *   BOOP q2 · SHUSH q2 · SPIN q2 · HIGHFIVE q1 -> a · LISTEN a · RESET a · PEEK q1
 *   IF a BEEP and b QUIET -> fix1 · JUMP fix1 · fix1: · END · # note
 * Forgiving: case-insensitive keywords and ids, `->` / `→` / `=>`, extra spaces, `,`/`&&`/`&`
 * between IF conditions, optional `IS` ("IF a IS BEEP"), `IF a -> x` means `IF a BEEP -> x`,
 * `HIGHFIVE q1 a` / `HIGHFIVE q1, a` without arrow, trailing `# comment` after a command.
 */
import { isBot, isQubble, type Cond, type Op, type Program, type QubitId } from '../core/contracts';

export interface ParseError { line: number; msg: string }

const ARROW = /\s*(?:->|→|=>|-->)\s*/;

function normId(s: string): string { return s.trim().toLowerCase(); }

export function parseProgram(text: string): { prog: Program; errors: ParseError[] } {
  const prog: Program = [];
  const errors: ParseError[] = [];
  const lineOf: number[] = [];
  const lines = text.replace(/\r/g, '').split('\n');

  lines.forEach((raw, idx) => {
    const ln = idx + 1;
    let line = raw.trim();
    if (!line) return;
    if (line.startsWith('#') || line.startsWith('//')) {
      prog.push({ op: 'NOTE', text: line.replace(/^(#|\/\/)\s?/, '').trim() }); lineOf.push(ln); return;
    }
    // strip trailing comment
    const hash = line.indexOf('#');
    if (hash > 0) line = line.slice(0, hash).trim();
    const lab = /^([A-Za-z_][\w-]*)\s*:$/.exec(line);
    if (lab) { prog.push({ op: 'LABEL', name: lab[1] }); lineOf.push(ln); return; }

    const err = (msg: string) => errors.push({ line: ln, msg });
    const m = /^(\w+)\s*(.*)$/.exec(line);
    if (!m) { err(`can't read "${raw.trim()}"`); return; }
    const cmd = m[1].toUpperCase();
    const rest = m[2].trim();
    const qubit = (s: string, what = 'a Qubble or bot'): QubitId | null => {
      const id = normId(s);
      if (isBot(id) || isQubble(id)) return id as QubitId;
      err(`"${s}" is not ${what}`); return null;
    };
    const one = (): string | null => {
      const parts = rest.split(/[\s,]+/).filter(Boolean);
      if (parts.length !== 1) { err(`${cmd} needs exactly one target`); return null; }
      return parts[0];
    };
    let op: Op | null = null;
    switch (cmd) {
      case 'BOOP': case 'SHUSH': case 'SPIN': case 'PEEK': {
        const a = one(); if (a === null) break;
        const t = qubit(a); if (t) op = { op: cmd, t } as Op;
        break;
      }
      case 'LISTEN': case 'RESET': {
        const a = one(); if (a === null) break;
        const id = normId(a);
        if (!isBot(id)) { err(`${cmd} only works on bots (a..h), not "${a}"`); break; }
        op = { op: cmd, t: id };
        break;
      }
      case 'HIGHFIVE': case 'CNOT': {
        const parts = rest.split(ARROW).length === 2 ? rest.split(ARROW) : rest.split(/[\s,]+/).filter(Boolean);
        if (parts.length !== 2) { err('HIGHFIVE needs two names: HIGHFIVE q1 -> a'); break; }
        const from = qubit(parts[0]), to = qubit(parts[1]);
        if (from && to) {
          if (from === to) err('HIGHFIVE needs two different creatures');
          else op = { op: 'HIGHFIVE', from, to };
        }
        break;
      }
      case 'JUMP': case 'GOTO': {
        const a = one(); if (a !== null) op = { op: 'JUMP', label: a };
        break;
      }
      case 'END': if (rest) err('END takes nothing after it'); else op = { op: 'END' }; break;
      case 'IF': {
        const parts = rest.split(ARROW);
        if (parts.length !== 2 || !parts[1].trim()) { err('IF needs "-> label" at the end'); break; }
        const label = parts[1].trim();
        const conds: Cond[] = [];
        let ok = true;
        for (const c of parts[0].split(/\s*(?:\band\b|&&|&|,)\s*/i).filter(Boolean)) {
          const cm = /^(\w+)(?:\s+is)?(?:\s+(beep|quiet|1|0|on|off))?$/i.exec(c.trim());
          if (!cm) { err(`can't read condition "${c}"`); ok = false; continue; }
          const who = qubit(cm[1]); if (!who) { ok = false; continue; }
          const w = (cm[2] ?? 'beep').toLowerCase();
          conds.push({ who, is: w === 'beep' || w === '1' || w === 'on' ? 'BEEP' : 'QUIET' });
        }
        if (ok && conds.length) op = { op: 'IF', conds, label };
        else if (ok) err('IF needs at least one condition');
        break;
      }
      case 'NOTE': op = { op: 'NOTE', text: rest }; break;
      default: err(`unknown command "${m[1]}"`);
    }
    if (op) { prog.push(op); lineOf.push(ln); }
  });

  // label checks
  const labels = new Map<string, number>();
  prog.forEach((o, i) => {
    if (o.op !== 'LABEL') return;
    const k = o.name.toLowerCase();
    if (labels.has(k)) errors.push({ line: lineOf[i], msg: `label "${o.name}" is defined twice` });
    labels.set(k, i);
  });
  prog.forEach((o, i) => {
    if ((o.op === 'IF' || o.op === 'JUMP') && !labels.has(o.label.toLowerCase()))
      errors.push({ line: lineOf[i], msg: `no label called "${o.label}"` });
  });
  errors.sort((a, b) => a.line - b.line);
  return { prog, errors };
}

export function printOp(o: Op): string {
  switch (o.op) {
    case 'BOOP': case 'SHUSH': case 'SPIN': case 'PEEK': case 'LISTEN': case 'RESET': return `${o.op} ${o.t}`;
    case 'HIGHFIVE': return `HIGHFIVE ${o.from} -> ${o.to}`;
    case 'IF': return `IF ${o.conds.map(c => `${c.who} ${c.is}`).join(' and ')} -> ${o.label}`;
    case 'JUMP': return `JUMP ${o.label}`;
    case 'LABEL': return `${o.name}:`;
    case 'END': return 'END';
    case 'NOTE': return `# ${o.text}`;
  }
}

export function printProgram(prog: Program): string {
  return prog.map(printOp).join('\n');
}
