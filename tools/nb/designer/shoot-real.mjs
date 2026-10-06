// Designer: real-app shots of the Bench Book (no capture shim; real clock). node tools/nb/designer/shoot-real.mjs [base]
// Writes tools/nb/designer/real-*.png. One browser, DPR 1, software GL.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../video/capture/node_modules/playwright');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4420/';
const OUT = new URL('.', import.meta.url).pathname;
const only = process.argv[3];
const SHOTS = [
  // name, w, h, ls overrides, page, action
  ['1920-spread-stabilizers', 1920, 1080, { 'np.nb.open': '1', 'np.nb.pin': 'circuit' }, 'stabilizers', 'run'],
  ['1920-spread-threshold', 1920, 1080, { 'np.nb.open': '1', 'np.nb.pin': 'circuit' }, 'threshold', 'run'],
  ['1440-circuit', 1440, 900, { 'np.nb.open': '1' }, 'circuit', 'run'],
  ['1440-export', 1440, 900, { 'np.nb.open': '1' }, 'export', 'run'],
  ['1440-entangle', 1440, 900, { 'np.nb.open': '1' }, 'entangle', 'run'],
  ['1440-midopen', 1440, 900, { 'np.nb.open': '0' }, 'state', 'midopen'],
  ['1024-open-circuit', 1024, 768, { 'np.nb.open': '1' }, 'circuit', 'run'],
  ['1024-closed', 1024, 768, { 'np.nb.open': '0' }, 'state', 'run'],
  ['820-notes-bloch', 820, 1180, { 'np.nb.sheet': 'notes' }, 'bloch', 'run'],
  ['820-code', 820, 1180, { 'np.nb.sheet': 'code' }, 'state', 'run'],
  ['390-notes-stabilizers', 390, 844, { 'np.nb.sheet': 'notes' }, 'stabilizers', 'run'],
  ['390-code', 390, 844, { 'np.nb.sheet': 'code' }, 'state', 'run'],
];
const b = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [name, w, hh, ls, page, act] of SHOTS.filter((s) => !only || s[0].includes(only))) {
    const ctx = await b.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 1, hasTouch: w < 900 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  pageerror', e.message));
    await p.addInitScript(([ls, pg, red]) => {
      if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
      const s = { v: 1, progress: {}, programs: {}, slots: {}, settings: { master: 0, music: 0, sfx: 0, voice: 0, nerd: true, reducedMotion: red, xrayDefault: true }, flags: { unlockAll: true, 'nerd:found': true }, endlessBest: {} };
      for (const k of ['a', 'b', 'c']) localStorage.setItem('np.save.' + k, JSON.stringify(s));
      localStorage.setItem('np.nb.page', pg); localStorage.setItem('np.nb.seen', 'state,bloch,entangle,circuit,stabilizers,threshold,density,export');
      for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    }, [ls, page, act !== 'midopen']);
    await p.goto(BASE + '?qa#level/2-3'); await p.waitForTimeout(2200);
    for (let i = 0; i < 12; i++) { const d = await p.$('.dialogue'); if (!d) break; await d.click({ force: true }).catch(() => {}); await p.waitForTimeout(150); }
    const sol = await p.evaluate(() => { const L = window.__np.LEVELS.find((l) => l.id === '2-3'), q = window.__np.quantum; return L.solution.morning ? q.printProgram(L.solution.morning) : ''; });
    await p.click('.editor-foot button:has-text("Text")').catch(() => {}); await p.waitForTimeout(200);
    const tas = await p.$$('.modal textarea'); if (tas.length) { await tas[tas.length - 1].fill(sol); await p.click('.modal button:has-text("Load")'); await p.waitForTimeout(200); }
    if (act === 'midopen') {
      await p.mouse.move(5, 5);
      await p.click('.nb-spine'); await p.waitForTimeout(230);
      await p.screenshot({ path: `${OUT}real-${name}.png` });
      await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}real-${name}-after.png` });
    } else {
      await p.click('button:has-text("Run night")'); await p.waitForTimeout(3500);
      for (let i = 0; i < 8; i++) { const d = await p.$('.dialogue'); if (!d) break; await d.click({ force: true }).catch(() => {}); await p.waitForTimeout(150); }
      await p.mouse.move(5, 5); await p.waitForTimeout(400);
      await p.screenshot({ path: `${OUT}real-${name}.png` });
    }
    const chk = await p.evaluate(() => ({ hs: document.documentElement.scrollWidth > innerWidth, sheet: [...document.querySelectorAll('.nb-sheet')].map((s) => s.scrollWidth - s.clientWidth), vt: document.documentElement.dataset.vt ?? '' }));
    console.log(name, 'pageHScroll', chk.hs, 'sheetOverflow', chk.sheet.join(','), chk.vt ? 'data-vt=' + chk.vt : '');
    await ctx.close();
  }
} finally { await b.close(); }
