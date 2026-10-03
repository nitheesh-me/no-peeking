/**
 * DLC program DSL: the classic card text (src/levels/dsl.ts) plus the DLC gates
 *   Y q1 · S q1 · SDG q1 · CZ a q2 · SWAP q1 q2 · WAIT
 * Comments (# ...) become NOTE ops. Kept local so DLC levels never change the classic parser.
 */
import type { Op, Program, QubitId } from '../../../core/contracts';
import { parseLine } from '../../../levels/dsl';

export function parseDlcLine(raw: string): Op | null {
  const line = raw.trim();
  if (!line) return null;
  const [head, ...rest] = line.split(/\s+/);
  const cmd = head.toUpperCase();
  if (cmd === 'Y' || cmd === 'S' || cmd === 'SDG') {
    if (rest.length !== 1) throw new Error(`afi/dsl: cannot parse "${line}"`);
    return { op: cmd, t: rest[0] as QubitId };
  }
  if (cmd === 'CZ' || cmd === 'SWAP') {
    if (rest.length !== 2) throw new Error(`afi/dsl: cannot parse "${line}"`);
    return { op: cmd, from: rest[0] as QubitId, to: rest[1] as QubitId };
  }
  if (cmd === 'WAIT') return { op: 'WAIT' };
  return parseLine(line);
}

/** Parse a multi-line program. */
export function P(text: string): Program {
  return text.split('\n').map(parseDlcLine).filter((o): o is Op => o !== null);
}

export const cat = (...ps: Program[]): Program => ps.flat();
