// Live progress for every video job: writes videos/progress/jobs/<id>.json and rebuilds videos/progress/status.js,
// which videos/status.html shows as progress bars with the job's reviewable outputs (stills, contact sheets, previews).
//   import { Progress } from '../progress/progress.mjs';
//   const p = new Progress('capture:pg_drag_closeup', { title: 'Capture pg_drag_closeup', total: 420, unit: 'frames' });
//   p.tick(frame);  p.output('videos/final/review/x.png');  p.done();  / p.fail(err)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'videos/progress');
const JOBS = path.join(DIR, 'jobs');

const normOuts = (a) => (a ?? []).map((o) => (typeof o === 'string' ? { path: o, label: '' } : o)); // tolerate bare-path outputs

export class Progress {
  /** resume: continue a job another process started (e.g. one capture chunk of a multi-chunk shot): keeps its start time and outputs. */
  constructor(id, { title = id, total = null, unit = 'steps', stage = '', agent = process.env.NP_AGENT ?? '', resume = false } = {}) {
    fs.mkdirSync(JOBS, { recursive: true });
    this.file = path.join(JOBS, id.replace(/[^\w.:-]/g, '_').replace(/:/g, '__') + '.json');
    const now = Date.now();
    let prev = null;
    if (resume) { try { prev = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* first */ } }
    this.s = { id, title, agent, state: 'running', stage, done: prev?.done ?? 0, total: total ?? prev?.total ?? null, unit, note: '',
      outputs: normOuts(prev?.outputs), pid: process.pid, startedAt: prev?.startedAt ?? now, updatedAt: now };
    this.last = 0;
    this.write(true);
  }
  set(fields, force = false) { Object.assign(this.s, fields); this.write(force); return this; }
  tick(done, fields = {}) { return this.set({ done, ...fields }); }
  stage(stage, fields = {}) { return this.set({ stage, ...fields }, true); }
  queued(note) { return this.set({ state: 'queued', note }, true); }
  output(file, label = '') {
    const rel = path.relative(ROOT, path.resolve(ROOT, file));
    if (!this.s.outputs.some((o) => o.path === rel)) this.s.outputs.push({ path: rel, label });
    return this.write(true);
  }
  done(note = '') { this.set({ state: 'done', note, done: this.s.total ?? this.s.done }, true); history(this.s); }
  fail(err) { this.set({ state: 'failed', note: String(err?.message ?? err) }, true); history(this.s); }
  write(force) {
    const now = Date.now();
    if (!force && now - this.last < 1000) return this;
    this.last = now; this.s.updatedAt = now;
    atomic(this.file, JSON.stringify(this.s, null, 1));
    rebuild();
    return this;
  }
}

function atomic(file, text) { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }
function history(s) { fs.appendFileSync(path.join(DIR, 'history.jsonl'), JSON.stringify({ ...s, finishedAt: Date.now() }) + '\n'); }

/** Gather every job file into status.js (a <script> the dashboard loads, so it works from file://). */
export function rebuild() {
  fs.mkdirSync(JOBS, { recursive: true });
  const jobs = [];
  for (const f of fs.readdirSync(JOBS)) {
    if (!f.endsWith('.json')) continue;
    try { jobs.push(JSON.parse(fs.readFileSync(path.join(JOBS, f), 'utf8'))); } catch { /* mid-write */ }
  }
  for (const j of jobs) if (j.state === 'running' || j.state === 'queued') { try { process.kill(j.pid, 0); } catch { j.state = 'dead'; } }
  for (const j of jobs) j.outputs = normOuts(j.outputs);
  for (const j of jobs) for (const o of j.outputs) { try { o.v = Math.round(fs.statSync(path.join(ROOT, o.path)).mtimeMs); } catch { /* not written yet */ } }
  let pageVersion = 0; // the dashboard compares this with its own PAGE_VERSION and asks for a reload when they differ
  try { pageVersion = +(/PAGE_VERSION = (\d+)/.exec(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'status.html'), 'utf8'))?.[1] ?? 0); } catch { /* */ }
  atomic(path.join(DIR, 'status.js'), `window.NP_STATUS = ${JSON.stringify({ builtAt: Date.now(), pageVersion, jobs })};\n`);
  return jobs;
}

/** A 4×3 contact sheet (12 evenly spaced frames, 480 px wide each) of a finished clip, for review.
 *  Writes videos/review/<name>_sheet.png and returns its path (or null if ffmpeg fails). */
export function contactSheet(input, name, frames) {
  const out = path.join(ROOT, 'videos/review', `${name}_sheet.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const step = Math.max(1, Math.floor((frames ?? 120) / 12));
  const r = spawnSync('nice', ['-n', '10', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-threads', '4', '-i', input,
    '-vf', `select=not(mod(n\\,${step})),scale=480:-2,tile=4x3`, '-frames:v', '1', '-fps_mode', 'vfr', out], { stdio: 'inherit' });
  return r.status === 0 ? out : null;
}
