/** Lab notebook pages and when they unlock (Director-owned; see docs/NERD_MODE.md). */
export type NerdPageId = 'state' | 'bloch' | 'entangle' | 'circuit' | 'stabilizers' | 'threshold' | 'density' | 'export' | 'dump';

export interface NerdPageDef {
  id: NerdPageId;
  title: string;
  plain: string;          // one plain-words line under the title
  unlockAfter: string | null; // level id; null = hidden easter egg
  needsXray: boolean;     // drawn blank with 🙈 under blankets
}

export const NOTEBOOK_UNLOCK = '1-1';

export const NERD_PAGES: NerdPageDef[] = [
  { id: 'state', title: 'State vector', plain: 'Every possible dream at once, with how much of each.', unlockAfter: '1-1', needsXray: true },
  { id: 'bloch', title: 'Bloch spheres', plain: 'Each Qubble on its own: where its arrow points, and how sure it is.', unlockAfter: '1-2', needsXray: true },
  { id: 'entangle', title: 'Entanglement', plain: 'Who is sharing a dream with whom, measured in bits.', unlockAfter: '1-3', needsXray: true },
  { id: 'circuit', title: 'Circuit', plain: 'Your Bot Code is a quantum circuit. Here it is.', unlockAfter: '2-1', needsXray: false },
  { id: 'stabilizers', title: 'Stabilizers & syndrome', plain: 'The "do you match?" questions, and what the bots heard.', unlockAfter: '2-3', needsXray: false },
  { id: 'threshold', title: 'Threshold', plain: 'When a code helps, and when it hurts.', unlockAfter: '2-5', needsXray: false },
  { id: 'density', title: 'Density matrix', plain: 'The full picture of one Qubble, including how blurry it is.', unlockAfter: '3-3', needsXray: true },
  { id: 'export', title: 'Export', plain: 'Take this night to a real quantum computer.', unlockAfter: '4-1', needsXray: false },
  { id: 'dump', title: 'RAW DUMP', plain: 'Everything. Happy now?', unlockAfter: null, needsXray: true },
];
