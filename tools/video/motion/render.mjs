#!/usr/bin/env node
// Deterministic frame renderer for the motion pieces.
//   node tools/video/motion/render.mjs <job...>            render jobs from jobs.mjs (4K lossless FFV1 .mkv)
//   node tools/video/motion/render.mjs --list              list jobs
//   node tools/video/motion/render.mjs <job> --stills 0,48,96 [--scale 1]   PNG stills only
//   options: --scale 2 (3840×2160) · --workers 6 · --p '{"impact":90}' (param overrides) · --out videos/motion
// Each frame is drawn by the page as a pure function of the frame index (no clocks), screenshotted
// losslessly and piped into ffmpeg. Alpha jobs write <name>_fill.mkv (straight RGB) + <name>_matte.mkv (gray).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { JOBS } from './jobs.mjs';
import { Progress, contactSheet } from '../progress/progress.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const VALUED = new Set(['--scale', '--workers', '--p', '--out', '--stills', '--name']);
const names = [];
for (let i = 0; i < args.length; i++) { if (VALUED.has(args[i])) { i++; continue; } if (!args[i].startsWith('--')) names.push(args[i]); }

if (flag('list')) { for (const [n, j] of Object.entries(JOBS)) console.log(`${n.padEnd(28)} ${j.scene.padEnd(12)} ${j.alpha ? 'alpha' : 'full '}  ${j.note ?? ''}`); process.exit(0); }

const SCALE = Number(opt('scale', flag('stills') || opt('stills') ? 1 : 2));
const WORKERS = Number(opt('workers', 2)); // pages in the one browser (memory: see docs/VIDEO_RESOURCES.md)
const OUT = path.resolve(ROOT, opt('out', 'videos/motion'));
const OVERRIDE = JSON.parse(opt('p', '{}'));
const STILLS = opt('stills');
fs.mkdirSync(OUT, { recursive: true });

const jobs = flag('all') ? Object.keys(JOBS) : names;
if (!jobs.length) { console.error('no jobs; use --list'); process.exit(1); }
for (const j of jobs) if (!JOBS[j]) { console.error(`unknown job ${j}`); process.exit(1); }

// ── vite dev server on the project root (so pages can import src/art directly) ──
const req = createRequire(path.join(ROOT, 'package.json'));
const vite = await import(pathToFileURL(req.resolve('vite')).href);
// Reuse the shared dev server if one is up (VIDEO_RESOURCES rule 6), else start one and stop it at the end.
const SHARED = process.env.MOTION_BASE ?? 'http://127.0.0.1:4410';
let server = null, base = SHARED.replace(/\/$/, '');
try { const r = await fetch(`${base}/tools/video/motion/index.html`); if (!r.ok) throw 0; }
catch { server = await vite.createServer({ root: ROOT, logLevel: 'error', server: { port: 5310, strictPort: false, host: '127.0.0.1', fs: { strict: false }, hmr: false, watch: { ignored: ['**/*'] } } }); /* no HMR: an edit elsewhere must never reload a page mid-render */ await server.listen(); base = server.resolvedUrls.local[0].replace(/\/$/, ''); }
// docs/VIDEO_RESOURCES.md: software GL only, one browser per job, capped JS heap, DPR ≤ 2.
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--js-flags=--max-old-space-size=2048', '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text', '--mute-audio'] });

function pageUrl(job, params, alpha, scale) {
  const q = new URLSearchParams({ scene: job.scene, p: JSON.stringify(params), scale: String(scale), alpha: alpha ? '1' : '0' });
  return `${base}/tools/video/motion/index.html?${q}`;
}
async function openPage(url, scale) {
  if (scale > 2) throw new Error('scale > 2 is forbidden (docs/VIDEO_RESOURCES.md)');
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__motion);
  await page.evaluate(() => window.__motion.ready);
  return page;
}
async function shot(page, f) {
  const b64 = await page.evaluate((fr) => window.__motion.png(fr), f);
  return Buffer.from(b64, 'base64');
}
function ffmpegFor(outBase, alpha) {
  const enc = ['-c:v', 'ffv1', '-level', '3', '-g', '1', '-slices', '24', '-slicecrc', '0', '-threads', '2'];
  const a = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'png', '-i', '-'];
  if (alpha) {
    a.push('-filter_complex', '[0:v]split[a][b];[a]format=bgr0[f];[b]alphaextract,format=gray[m]',
      '-map', '[f]', ...enc, '-pix_fmt', 'bgr0', `${outBase}_fill.mkv`,
      '-map', '[m]', ...enc, '-pix_fmt', 'gray', `${outBase}_matte.mkv`);
  } else {
    a.push(...enc, '-pix_fmt', 'bgr0', `${outBase}.mkv`);
  }
  const p = spawn('ffmpeg', a, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)))));
  return { p, done };
}
const write = (stream, buf) => new Promise((res) => (stream.write(buf) ? res() : stream.once('drain', res)));

function concat(parts, out) {
  const list = `${out}.txt`;
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' });
    p.on('close', (c) => { fs.rmSync(list); for (const x of parts) fs.rmSync(x); c === 0 ? res() : rej(new Error('concat failed')); });
  });
}

for (const jobName of jobs) {
  const job = JOBS[jobName];
  const name = opt('name') ?? jobName; // --name: output name (e.g. a caption track rendered from the caption template)
  const params = { ...job.params, ...OVERRIDE };
  const alpha = !!job.alpha;
  const url = pageUrl(job, params, alpha, SCALE);
  const probe = await openPage(url, SCALE);
  const info = await probe.evaluate(() => window.__motion.info());
  const t0 = Date.now();
  if (STILLS) {
    const dir = path.join(OUT, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const frames = STILLS === 'markers' ? Object.values(info.markers).flat().filter((x) => typeof x === 'number') : STILLS.split(',').map(Number);
    for (const f of frames) {
      const buf = await shot(probe, Math.min(info.frames - 1, f));
      const file = path.join(dir, `${name}_f${String(f).padStart(4, '0')}.png`);
      fs.writeFileSync(file, buf);
      console.log(file);
    }
    await probe.close();
    continue;
  }
  await probe.close();
  const n = info.frames;
  const prog = new Progress(`motion:${name}`, { title: `Motion ${name}`, total: n, unit: 'frames', agent: process.env.NP_AGENT ?? 'motion' });
  // Chunk rule (docs/VIDEO_RESOURCES.md): long clips render as ≤ 300-frame segments; each finished segment is
  // kept (with a .done marker) so a killed run resumes where it stopped. Segments are concatenated losslessly.
  const SEG = 300;
  const tmp = path.join(OUT, `.tmp_${name}`);
  fs.mkdirSync(tmp, { recursive: true });
  let doneFrames = 0;
  for (let s0 = 0; s0 < n; s0 += SEG) {
    const s1 = Math.min(n, s0 + SEG);
    const segTag = `seg${String(s0).padStart(5, '0')}`;
    if (fs.existsSync(path.join(tmp, `${segTag}.done`))) { doneFrames += s1 - s0; prog.tick(doneFrames); console.log(`${name}: ${segTag} already rendered, skipping`); continue; }
    for (const f of fs.readdirSync(tmp)) if (f.startsWith(segTag)) fs.rmSync(path.join(tmp, f));
    const len = s1 - s0;
    const W = Math.min(WORKERS, Math.max(1, Math.ceil(len / 20)));
    const chunk = Math.ceil(len / W);
    await Promise.all(Array.from({ length: W }, async (_, w) => {
      const a = s0 + w * chunk, b = Math.min(s1, a + chunk);
      if (a >= b) return;
      let page = await openPage(url, SCALE);
      const ff = ffmpegFor(path.join(tmp, `${segTag}_part${String(w).padStart(2, '0')}`), alpha);
      try {
        for (let f = a; f < b; f++) {
          let buf;
          for (let attempt = 0; ; attempt++) {
            try { buf = await shot(page, f); break; }
            catch (e) { // a page reload destroyed the context: reopen and redraw (frames are pure functions of f)
              if (attempt >= 3) throw e;
              console.error(`\n[${name}] frame ${f}: ${String(e.message).split('\n')[0]} → reopening page`);
              await page.close().catch(() => {}); page = await openPage(url, SCALE);
            }
          }
          await write(ff.p.stdin, buf);
          doneFrames++;
          prog.tick(doneFrames, { stage: `segment ${segTag}` });
          if (doneFrames % 30 === 0) process.stdout.write(`\r${name}: ${doneFrames}/${n} frames (${((Date.now() - t0) / doneFrames).toFixed(0)} ms/frame)   `);
        }
      } finally {
        ff.p.stdin.end();
        await page.close().catch(() => {});
      }
      await ff.done;
    }));
    fs.writeFileSync(path.join(tmp, `${segTag}.done`), '');
  }
  const parts = fs.readdirSync(tmp).filter((p) => p.endsWith('.mkv')).sort();
  const outBase = path.join(OUT, name);
  if (alpha) {
    await concat(parts.filter((p) => p.endsWith('_fill.mkv')).map((p) => path.join(tmp, p)), `${outBase}_fill.mkv`);
    await concat(parts.filter((p) => p.endsWith('_matte.mkv')).map((p) => path.join(tmp, p)), `${outBase}_matte.mkv`);
  } else {
    await concat(parts.map((p) => path.join(tmp, p)), `${outBase}.mkv`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const meta = {
    name, scene: job.scene, note: job.note ?? '', fps: 60, frames: n, duration_s: +(n / 60).toFixed(4),
    width: info.width, height: info.height, alpha,
    files: alpha ? { fill: `${name}_fill.mkv`, matte: `${name}_matte.mkv` } : { video: `${name}.mkv` },
    markers: info.markers, params: info.params, rendered: new Date().toISOString(),
  };
  fs.writeFileSync(`${outBase}.json`, JSON.stringify(meta, null, 2));
  prog.stage('contact sheet');
  const sheet = contactSheet(alpha ? `${outBase}_fill.mkv` : `${outBase}.mkv`, `motion_${name}`, n);
  if (sheet) prog.output(sheet, 'contact sheet');
  prog.done(`${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`\n${name}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${outBase}${alpha ? '_fill/_matte' : ''}.mkv`);
}
await browser.close();
if (server) await server.close();
