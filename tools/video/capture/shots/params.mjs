/**
 * Shot timing parameters. Every duration a shot script uses should come from P(key, default) so the edit can be
 * re-timed to the music without touching the choreography.
 *
 * Sources, later wins:
 *   1. the defaults written in the shot scripts
 *   2. videos/music/cue_sheet.json → its "capture" object, if present: { "<shot>.<key>": seconds, … }
 *      (sections with { name, start, end } are also exposed as  section.<name>.len)
 *   3. tools/video/capture/params.json (hand overrides)
 *   4. env CAP_PARAMS='{"trailer-peek.hold": 1.25}'
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib.mjs';

const table = {};
const load = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const cue = load(path.join(ROOT, 'videos/music/cue_sheet.json'));
if (cue) {
  for (const s of cue.sections ?? []) {
    const a = s.start_s ?? s.start, b = s.end_s ?? s.end;
    if (s.name != null && a != null && b != null) table[`section.${s.name}.len`] = b - a;
  }
  Object.assign(table, cue.capture ?? {});
}
Object.assign(table, load(path.join(ROOT, 'tools/video/capture/params.json')) ?? {});
if (process.env.CAP_PARAMS) Object.assign(table, JSON.parse(process.env.CAP_PARAMS));

export const BPM = cue?.bpm ?? 96;
export const BEAT = cue?.beat_frames ? cue.beat_frames / 60 : 60 / BPM;
export const BAR = cue?.bar_frames ? cue.bar_frames / 60 : BEAT * 4;
export const CUE = cue;
const used = {};
/** P('shot.key', default) → seconds (or any value). */
export function P(key, def) { const v = key in table ? table[key] : def; used[key] = v; return v; }
export const usedParams = () => ({ ...used });
