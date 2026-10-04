#!/usr/bin/env node
/**
 * Render caption PNGs (full-frame RGBA) from an HTML template.
 * node captions.mjs job.json
 * job: { W, H, template, items: [{ id, text, style, position, out, mask }], strip?: { out } }
 * Writes <out> (composited caption), <mask> (glyph fill only) and prints JSON {id: {rect, fontPx}}.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../capture/package.json'));
const { chromium } = require('playwright');

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
// docs/VIDEO_RESOURCES.md: software rendering only, DPR 1 here (<= 2), capped JS heap, one browser, closed in finally
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb',
  '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=2048'] });
try {
const page = await browser.newPage({ viewport: { width: job.W, height: job.H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.resolve(job.template)).href);
await page.waitForFunction(() => typeof window.renderCaption === 'function');
var info = {};
const shot = async (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); await page.screenshot({ path: file, omitBackground: true }); };
if (job.strip) {
  await page.evaluate((a) => window.renderCaption(a), { text: '', mode: 'strip', position: 'strip', W: job.W, H: job.H });
  await shot(job.strip.out);
}
for (const it of job.items) {
  const a = { text: it.text, style: it.style, position: it.position, W: job.W, H: job.H };
  info[it.id] = await page.evaluate((x) => window.renderCaption({ ...x, mode: 'full' }), a);
  await shot(it.out);
  if (it.mask) { await page.evaluate((x) => window.renderCaption({ ...x, mode: 'mask' }), a); await shot(it.mask); }
}
process.stdout.write(JSON.stringify(info));
} finally { await browser.close(); }
