#!/usr/bin/env node
// Print the video-job board once (progress bars, ETA, outputs). Browser view: tools/video/progress/status.html
import { rebuild } from './progress.mjs';
const jobs = rebuild().sort((a, b) => b.updatedAt - a.updatedAt);
const now = Date.now();
const dur = (ms) => { const s = Math.round(ms / 1000); return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`; };
const recent = jobs.filter((j) => j.state !== 'done' || now - j.updatedAt < 6 * 3600e3);
if (!recent.length) console.log('no active or recent jobs');
for (const j of recent) {
  const frac = j.total ? Math.min(1, j.done / j.total) : null;
  const bar = frac == null ? '·'.repeat(24) : '█'.repeat(Math.round(frac * 24)).padEnd(24, '░');
  const el = (j.state === 'running' ? now : j.updatedAt) - j.startedAt;
  const rate = j.done && el ? j.done / (el / 1000) : 0;
  const eta = frac != null && rate && j.state === 'running' ? ` ETA ${dur((j.total - j.done) / rate * 1000)}` : '';
  const stale = j.state === 'running' && now - j.updatedAt > 60000 ? `  ⚠ no update ${dur(now - j.updatedAt)}` : '';
  console.log(`${j.state.padEnd(7)} ${bar} ${String(j.done).padStart(5)}${j.total ? '/' + j.total : ''} ${j.unit}  ${j.title}${j.stage ? ' · ' + j.stage : ''}  ${dur(el)}${eta}${stale}`);
  if (j.note) console.log(`        ${j.note}`);
  for (const o of j.outputs) console.log(`        → ${o.path}${o.label ? '  (' + o.label + ')' : ''}`);
}
