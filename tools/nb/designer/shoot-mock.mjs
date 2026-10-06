#!/usr/bin/env node
// Designer: screenshot the static v2 mock. node tools/nb/designer/shoot-mock.mjs [base]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../video/capture/node_modules/playwright');
const BASE = (process.argv[2] ?? 'http://127.0.0.1:4420/') + 'tools/nb/designer/mock.html';
const OUT = new URL('.', import.meta.url).pathname;
const shots = [
  ['xl-1920x1080', 1920, 1080, ''],
  ['lg-1440x900', 1440, 900, ''],
  ['lg-1280x720-export', 1280, 720, '?page=export'],
  ['md-1024x768-open', 1024, 768, ''],
  ['md-1024x768-closed', 1024, 768, '?nb=closed&sealed=dump,density,export'],
  ['sm-820x1180-notes', 820, 1180, ''],
  ['sm-820x1180-code', 820, 1180, '?sheet=code'],
];
const b = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [name, w, hh, q] of shots.filter((s) => !process.argv[3] || s[0].includes(process.argv[3]))) {
    const p = await b.newPage({ viewport: { width: w, height: hh }, deviceScaleFactor: 1 });
    p.on('pageerror', (e) => console.log('ERR', e.message));
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.goto(BASE + q); await p.waitForTimeout(900);
    const sx = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await p.screenshot({ path: `${OUT}mock-${name}.png` });
    console.log(name, sx ? 'H-SCROLL!' : 'ok');
    await p.close();
  }
} finally { await b.close(); }
