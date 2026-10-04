#!/usr/bin/env node
/**
 * Framing check: one deterministic still at DPR 1 (cheap). Run under safe-run:
 *   tools/video/safe-run.sh --heavy --mem 4G -- node tools/video/capture/still.mjs out.png '#level/2-3' 'cinema=1&camera=on:q2,2' [seconds=1.5] [js-in-page]
 * js-in-page runs after load with window.__np available (e.g. "__np.runNight('zero',[{kind:'flip',t:'q2'}])").
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStorage } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [out, hash = '#title', query = '', secs = '1.5', js = '', secs2 = '0'] = process.argv.slice(2);
const SHIM = fs.readFileSync(path.join(HERE, 'shim.js'), 'utf8');
const base = process.env.CAP_BASE ?? 'http://127.0.0.1:4410/';
const b = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=2048', '--hide-scrollbars'] });
try {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const cfg = { seed: 1, cursor: false, storage: buildStorage({ unlockAll: true, progress: [] }) };
  await p.addInitScript(`(${SHIM.replace(/^[\s\S]*?(function __npCaptureShim)/, '$1')})(${JSON.stringify(cfg)});`);
  await p.goto(base + '?qa' + (query ? '&' + query : '') + hash);
  for (let i = 0; i < 400 && !(await p.evaluate(() => document.fonts.status === 'loaded' && !!document.querySelector('#app *'))); i++) { await p.evaluate(() => __cap.step(16.667)); await p.waitForTimeout(10); }
  const step = async (s) => { for (let i = 0; i < Math.round(s * 60); i++) await p.evaluate(() => __cap.step(16.667)); };
  await step(+secs);
  if (js) { await p.evaluate(js); await step(+secs2); }
  await p.screenshot({ path: out });
  console.log('wrote', out);
} finally { await b.close(); }
