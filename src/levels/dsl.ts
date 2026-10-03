/**
 * Tiny text-form helper so level programs read like the in-game cards (7BH style).
 *   BOOP q2 · SHUSH q2 · SPIN q2 · HIGHFIVE q1 -> a · LISTEN a · RESET a · PEEK q1
 *   IF a BEEP and b QUIET -> fix1 · JUMP fix1 · fix1: · END · # note
 * Kept local to src/levels so levels don't depend on the quantum module's parser.
 */
import type { BotId, Cond, Op, Program, QubitId } from '../core/contracts';

function bad(line: string): never {
  throw new Error(`levels/dsl: cannot parse "${line}"`);
}

export function parseLine(raw: string): Op | null {
  const line = raw.trim();
  if (!line) return null;
  if (line.startsWith('#')) return { op: 'NOTE', text: line.slice(1).trim() };
  const lab = /^([A-Za-z_][\w]*):$/.exec(line);
  if (lab) return { op: 'LABEL', name: lab[1] };
  const [head, ...rest] = line.split(/\s+/);
  const cmd = head.toUpperCase();
  switch (cmd) {
    case 'BOOP':
    case 'SHUSH':
    case 'SPIN':
      if (rest.length !== 1) bad(line);
      return { op: cmd, t: rest[0] as QubitId } as Op;
    case 'LISTEN':
    case 'RESET':
      if (rest.length !== 1) bad(line);
      return { op: cmd, t: rest[0] as BotId } as Op;
    case 'PEEK':
      if (rest.length !== 1) bad(line);
      return { op: 'PEEK', t: rest[0] as QubitId };
    case 'HIGHFIVE': {
      const m = /^HIGHFIVE\s+(\w+)\s*->\s*(\w+)$/i.exec(line);
      if (!m) bad(line);
      return { op: 'HIGHFIVE', from: m[1] as QubitId, to: m[2] as QubitId };
    }
    case 'JUMP':
      if (rest.length !== 1) bad(line);
      return { op: 'JUMP', label: rest[0] };
    case 'END':
      return { op: 'END' };
    case 'IF': {
      const m = /^IF\s+(.+?)\s*->\s*(\w+)$/i.exec(line);
      if (!m) bad(line);
      const conds: Cond[] = m[1].split(/\s+and\s+/i).map((c) => {
        const cm = /^(\w+)\s+(BEEP|QUIET)$/i.exec(c.trim());
        if (!cm) bad(line);
        return { who: cm[1] as QubitId, is: cm[2].toUpperCase() as 'BEEP' | 'QUIET' };
      });
      return { op: 'IF', conds, label: m[2] };
    }
    default:
      return bad(line);
  }
}

/** Parse a multi-line program. Usage: P(`HIGHFIVE q1 -> a\nLISTEN a`) */
export function P(text: string): Program {
  return text
    .split('\n')
    .map(parseLine)
    .filter((o): o is Op => o !== null);
}

/** Concatenate programs. */
export const cat = (...ps: Program[]): Program => ps.flat();

// ── Shared building blocks (reused across chapters; reuse is the point) ──

/** Spread q1's dream over q1,q2,q3 (bit-flip repetition encoding). */
export const ENCODE3 = P(`
HIGHFIVE q1 -> q2
HIGHFIVE q1 -> q3
`);

/** Sideways glasses on/off for three qubbles. */
export const SPIN3 = P(`
SPIN q1
SPIN q2
SPIN q3
`);

/** The 2-3 reference decoder (two bots, syndrome table, fixes). */
export const DECODE3_BITFLIP = P(`
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
HIGHFIVE q2 -> b
HIGHFIVE q3 -> b
LISTEN a
LISTEN b
IF a BEEP and b QUIET -> fix1
IF a BEEP and b BEEP -> fix2
IF a QUIET and b BEEP -> fix3
END
fix1:
BOOP q1
END
fix2:
BOOP q2
END
fix3:
BOOP q3
`);
