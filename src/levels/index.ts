import type { LevelDef } from '../core/contracts';
import { CH0 } from './ch0';
import { CH1 } from './ch1';
import { CH2 } from './ch2';
import { CH3 } from './ch3';
import { CH4 } from './ch4';

export const CHAPTERS: { id: number; title: string; blurb: string; color: string }[] = [
  { id: 0, title: 'Day Shift', blurb: 'Plain boxes with 0s and 1s. Peeking is allowed. Enjoy it.', color: '#ffb72b' },
  { id: 1, title: 'Night Shift', blurb: 'Real Qubbles. Two dreams at once. No peeking.', color: '#6c63ff' },
  { id: 2, title: 'Whisper Network', blurb: 'Ask the bots, not the Qubbles.', color: '#fe443d' },
  { id: 3, title: 'Ghost Stories', blurb: 'Some damage hides from the question you ask.', color: '#b04dff' },
  { id: 4, title: 'The Big Nine', blurb: 'Nine Qubbles. Every gremlin. Lights out.', color: '#3ddc97' },
];

export const LEVELS: LevelDef[] = [...CH0, ...CH1, ...CH2, ...CH3, ...CH4];

export function getLevel(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
