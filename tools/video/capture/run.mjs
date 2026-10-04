#!/usr/bin/env node
/**
 * node tools/video/capture/run.mjs <shots.mjs> [more.mjs…] [options]
 *
 *   --only a,b        shots whose name equals (or, if none equals, contains) one of these
 *   --preview         1080p JPEG → H.264 mp4, quick look (no chunking)
 *   --chunk N         frames per chunk job (default 600; 0 = no chunking, single in-process run)
 *   --jobs N          shots captured concurrently in chunked mode (default/max 3 = the render slots, env CAP_JOBS); each chunk reserves CAP_MEM (5G)
 *   --out dir         output dir (default videos/capture)
 *   --codec ffv1|x264rgb|preview   --format png|jpeg   --quality 95   --scale 2 (≤ 2)
 *   --list            list the registered shots
 *
 * Chunked mode (the default for real captures; docs/VIDEO_RESOURCES.md rule 5): every chunk is a separate child
 * process run under `tools/video/safe-run.sh --mem 5G` (one of the 3 machine-wide render slots, shared npvideo.slice pool).
 * Each chunk replays the shot from the start in virtual time (deterministic) and only grabs frames [a, b); the
 * parts are then joined losslessly (ffv1 is intra-only, so concat -c copy is exact).
 *
 * Internal (child) flags: --range a:b --part k --result file.json
 */
import { Progress, contactSheet } from '../progress/progress.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { runShots, registered, ensureServer, ROOT } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAFE = path.join(ROOT, 'tools/video/safe-run.sh');
const args = process.argv.slice(2);
const files = [], o = {}, pass = [];
let chunk = 600, resultFile = null, expectHash = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const val = () => args[++i];
  const keep = (v) => pass.push(a, v);
  if (a === '--only') o.only = val().split(',');
  else if (a === '--jobs') o.jobs = +val();
  else if (a === '--preview') { o.preview = true; pass.push(a); }
  else if (a === '--out') { o.outDir = path.resolve(val()); keep(o.outDir); }
  else if (a === '--codec') keep(o.codec = val());
  else if (a === '--format') keep(o.format = val());
  else if (a === '--quality') { o.quality = +val(); keep(String(o.quality)); }
  else if (a === '--scale') { o.scale = +val(); keep(String(o.scale)); }
  else if (a === '--base') keep(o.base = val());
  else if (a === '--headed') o.headless = false;
  else if (a === '--list') o.list = true;
  else if (a === '--chunk') chunk = +val();
  else if (a === '--range') { const [x, y] = val().split(':').map(Number); o.range = [x, y]; }
  else if (a === '--part') o.part = +val();
  else if (a === '--result') resultFile = val();
  else if (a === '--expect-hash') expectHash = val();
  else files.push(path.resolve(a));
}
if (!files.length) { console.error('usage: run.mjs <shots.mjs> [--only names] [--preview] [--chunk 600]'); process.exit(2); }
// every chunk of a shot must replay the SAME choreography: hash the shot files + the capture code
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])).sort();
const HASH_FILES = [...files, path.join(HERE, 'lib.mjs'), path.join(HERE, 'shim.js'), path.join(HERE, 'shots/common.mjs'), path.join(HERE, 'shots/params.mjs'), ...walk(path.join(ROOT, 'src'))];
let codeHash = crypto.createHash('sha1').update(HASH_FILES.map((f) => { try { return fs.readFileSync(f); } catch { return ''; } }).join('\0')).digest('hex').slice(0, 12);
function currentHash() { return crypto.createHash('sha1').update(HASH_FILES.map((f) => { try { return fs.readFileSync(f); } catch { return ''; } }).join('\0')).digest('hex').slice(0, 12); }
if (expectHash && expectHash !== codeHash) { console.error(`capture code changed since this shot's first chunk (${expectHash} → ${codeHash}); refusing to mix chunks`); process.exit(3); }
for (const f of files) await import(pathToFileURL(f).href);
let defs = registered();
if (o.only) {
  const exact = defs.filter((d) => o.only.includes(d.name));
  defs = exact.length ? exact : defs.filter((d) => o.only.some((p) => d.name.includes(p)));
}
if (o.list) { for (const d of defs) console.log(d.name, JSON.stringify(d.opts)); process.exit(0); }
if (!defs.length) { console.error('no shots match'); process.exit(2); }

// ── child / unchunked: run in this process ──
if (o.range || o.preview || chunk <= 0) {
  const r = await runShots(defs, o);
  if (resultFile) fs.writeFileSync(resultFile, JSON.stringify(r.results));
  const failed = r.results.filter((x) => x.error);
  if (failed.length) { console.error(`FAILED: ${failed.map((f) => f.name).join(', ')}`); process.exit(1); }
  process.exit(0);
}

// ── orchestrator: one safe-run job per chunk ──
const base = o.base ?? process.env.CAP_BASE ?? 'http://127.0.0.1:4410/';
const server = await ensureServer(base); // reuses the shared server if it is up
const outDir = o.outDir ?? path.join(ROOT, 'videos/capture');
fs.mkdirSync(outDir, { recursive: true });
const run = (cmd, argv) => new Promise((res) => {
  const p = spawn(cmd, argv, { stdio: 'inherit', env: { ...process.env, CAP_BASE: base } });
  p.on('close', (c) => res(c));
});
const summary = [];
// lanes: shots run concurrently (each shot's chunks in order); memory admission is safe-run's job (--mem waits)
const lanes = Math.max(1, Math.min(3, o.jobs ?? +(process.env.CAP_JOBS ?? 3))); // 3 render slots machine-wide
const queue = [...defs];
await Promise.all(Array.from({ length: Math.min(lanes, queue.length) }, async () => { while (queue.length) await doShot(queue.shift()); }));
async function doShot(d) {
  const t0 = Date.now();
  const parts = [];
  let total = null, fail = null, restarts = 0;
  let shotHash = currentHash();
  for (let k = 0; total == null; k++) {
    const a = k * chunk, b = a + chunk;
    const rf = path.join(outDir, `.${d.name}.part${k}.result.json`);
    let code;
    for (let attempt = 0; attempt < 30; attempt++) {
      code = await run(SAFE, ['--heavy', '--mem', process.env.CAP_MEM ?? '5G', '--', process.execPath, path.join(HERE, 'run.mjs'), ...files, '--only', d.name, '--range', `${a}:${b}`, '--part', String(k), '--result', rf, '--expect-hash', shotHash, ...pass]);
      if (code !== 75) break; // 75 = not enough free memory right now: wait and retry
      new Progress(`capture:${d.name}`, { resume: true, title: `Capture ${d.name}`, unit: 'frames' }).queued('waiting for free memory (retry in 20 s)');
      console.log(`[${d.name}] waiting for memory (safe-run 75)…`); await new Promise((r) => setTimeout(r, 20000));
    }
    if (code === 3 && restarts++ < 3) { // the game or capture code changed mid-shot: start the shot over
      console.log(`[${d.name}] code changed during the shot; restarting from chunk 0`);
      for (const p of parts) fs.rmSync(p, { force: true }); parts.length = 0; shotHash = currentHash(); k = -1; continue;
    }
    if (code !== 0) { fail = `part ${k} exit ${code}${code === 137 ? ' (memory cap hit)' : ''}`; break; }
    const r = JSON.parse(fs.readFileSync(rf, 'utf8'))[0]; fs.rmSync(rf, { force: true });
    if (r.error) { fail = r.error; break; }
    parts.push(path.join(outDir, `${d.name}.part${String(k).padStart(3, '0')}.mkv`));
    if (r.complete) total = r.frames;
  }
  if (fail) { console.error(`[${d.name}] FAILED: ${fail}`); summary.push({ name: d.name, error: fail }); new Progress(`capture:${d.name}`, { resume: true, title: `Capture ${d.name}`, unit: 'frames' }).fail(fail); return; }
  const out = path.join(outDir, `${d.name}.mkv`);
  if (parts.length === 1) fs.renameSync(parts[0], out);
  else {
    const list = path.join(outDir, `.${d.name}.concat.txt`);
    fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    const c = await run(SAFE, ['--', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
    fs.rmSync(list, { force: true });
    if (c !== 0) { summary.push({ name: d.name, error: 'concat failed' }); return; }
    for (const p of parts) fs.rmSync(p, { force: true });
  }
  const secs = (Date.now() - t0) / 1000;
  console.log(`[${d.name}] ✔ ${total} frames in ${parts.length} chunk(s), ${secs.toFixed(0)} s → ${(total / secs).toFixed(2)} fps overall`);
  summary.push({ name: d.name, frames: total, chunks: parts.length, seconds: secs });
  const prog = new Progress(`capture:${d.name}`, { resume: true, title: `Capture ${d.name}`, unit: 'frames', total });
  prog.stage('contact sheet');
  const sheet = contactSheet(out, `capture_${d.name}`, total);
  if (sheet) prog.output(sheet, 'contact sheet');
  prog.done(`${total} frames, ${parts.length} chunk(s), ${(total / secs).toFixed(2)} fps`);
  // register for the Editor (tools/video/edl/shot_sources.json: id → path relative to the repo)
  if (!process.env.CAP_NO_REGISTER && outDir === path.join(ROOT, 'videos/capture')) {
    const reg = path.join(ROOT, 'tools/video/edl/shot_sources.json');
    let j = {}; try { j = JSON.parse(fs.readFileSync(reg, 'utf8')); } catch { /* new */ }
    j[d.name] = path.relative(ROOT, out);
    fs.writeFileSync(reg, JSON.stringify(j, null, 1) + '\n');
  }
}
if (server) server.kill();
console.log(JSON.stringify(summary));
process.exit(summary.some((s) => s.error) ? 1 : 0);
