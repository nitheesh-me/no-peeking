#!/usr/bin/env node
// Designer: screenshot the current (v1) notebook at 4 viewports. node tools/nb/designer/shoot-current.mjs [base] [level] [page]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../video/capture/node_modules/playwright');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4420/';
const LVL = process.argv[3] ?? '2-3';
const PAGE = process.argv[4] ?? 'circuit';
const OUT = new URL('.', import.meta.url).pathname;
const sizes = [[1920, 1080], [1440, 900], [1280, 720], [1024, 768]];
const b = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [w, hgt] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.addInitScript(([pg]) => {
      const s = { v: 1, progress: {}, programs: {}, slots: {}, settings: { master: 0, music: 0, sfx: 0, voice: 0, nerd: true, reducedMotion: true, xrayDefault: true }, flags: { unlockAll: true, 'nerd:found': true }, endlessBest: {} };
      for (const k of ['a', 'b', 'c']) localStorage.setItem('np.save.' + k, JSON.stringify(s));
      localStorage.setItem('np.nb.open', '1'); localStorage.setItem('np.nb.page', pg);
      localStorage.setItem('np.nb.seen', 'state,bloch,entangle,circuit,stabilizers,threshold,density,export');
    }, [PAGE]);
    await p.goto(BASE + '?qa#level/' + LVL); await p.waitForTimeout(2500);
    for (let i = 0; i < 12; i++) { const d = await p.$('.dialogue'); if (!d) break; await d.click({ force: true }).catch(() => {}); await p.waitForTimeout(150); }
    const sol = await p.evaluate((id) => { const L = window.__np.LEVELS.find((l) => l.id === id), q = window.__np.quantum, o = {}; if (L.solution.bedtime) o.bedtime = q.printProgram(L.solution.bedtime); if (L.solution.morning) o.morning = q.printProgram(L.solution.morning); return o; }, LVL);
    await p.click('.editor-foot button:has-text("Text")'); await p.waitForTimeout(200);
    const heads = await p.$$eval('.modal .display', (els) => els.map((e) => e.textContent.toLowerCase()));
    const tas = await p.$$('.modal textarea');
    for (let i = 0; i < tas.length; i++) await tas[i].fill(sol[(heads[i] ?? 'morning').includes('bed') ? 'bedtime' : 'morning'] ?? '');
    await p.click('.modal button:has-text("Load")'); await p.waitForTimeout(300);
    await p.click('button:has-text("Run night")'); await p.waitForTimeout(2500);
    for (let i = 0; i < 6; i++) { const d = await p.$('.dialogue'); if (!d) break; await d.click({ force: true }).catch(() => {}); await p.waitForTimeout(150); }
    await p.screenshot({ path: `${OUT}current-${w}x${hgt}-${LVL}-${PAGE}.png` });
    await ctx.close();
  }
} finally { await b.close(); }
console.log('done');
