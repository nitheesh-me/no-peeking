#!/usr/bin/env node
// Designer: catch the notebook mid-open (cover swing + paw pat) in real time. node tools/nb/designer/shoot-midopen.mjs [w] [h] [delaysMs,...]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../video/capture/node_modules/playwright');
const [W, H] = [+(process.argv[2] ?? 1440), +(process.argv[3] ?? 900)];
const DELAYS = (process.argv[4] ?? '120,260,520').split(',').map(Number);
const OUT = new URL('.', import.meta.url).pathname;
const b = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const d of DELAYS) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.addInitScript(() => {
      const s = { v: 1, progress: {}, programs: {}, slots: {}, settings: { master: 0, music: 0, sfx: 0, voice: 0, nerd: true, reducedMotion: false, xrayDefault: true }, flags: { unlockAll: true, 'nerd:found': true }, endlessBest: {} };
      for (const k of ['a', 'b', 'c']) localStorage.setItem('np.save.' + k, JSON.stringify(s));
      localStorage.setItem('np.nb.open', '0'); localStorage.setItem('np.nb.page', 'circuit');
      localStorage.setItem('np.nb.seen', 'state,bloch,entangle,circuit,stabilizers,threshold,density,export');
    });
    await p.goto('http://127.0.0.1:4420/?qa#level/2-3'); await p.waitForTimeout(2500);
    for (let i = 0; i < 12; i++) { const dl = await p.$('.dialogue'); if (!dl) break; await dl.click({ force: true }).catch(() => {}); await p.waitForTimeout(150); }
    await p.click('.nb-spine'); await p.waitForTimeout(d);
    await p.screenshot({ path: `${OUT}midopen-${W}x${H}-${d}ms.png` });
    console.log('shot', d, await p.evaluate(() => ({ vt: document.documentElement.dataset.vt ?? null, opening: !!document.querySelector('.nb.nb-opening') })));
    await p.close();
  }
} finally { await b.close(); }
