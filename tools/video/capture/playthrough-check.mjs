#!/usr/bin/env node
/**
 * Classic playthrough (no ?cinema): every level, solution loaded through the Text modal, Test all, win card expected.
 * Real time, normal game (no capture shim). Run under the wrapper:
 *   tools/video/safe-run.sh --heavy -- node tools/video/capture/playthrough-check.mjs [base=http://127.0.0.1:4410/]
 */
import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://127.0.0.1:4410/';
const b = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=2048'] });
let won = 0, total = 0, errs = [];
try {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => {
    if (sessionStorage.getItem('pt')) return; sessionStorage.setItem('pt', '1');
    const s = { v: 1, progress: {}, programs: {}, slots: {}, settings: { master: 0, music: 0, sfx: 0, voice: 0, nerd: false, reducedMotion: false, xrayDefault: false }, flags: { unlockAll: true }, endlessBest: {} };
    for (const k of ['a', 'b', 'c']) localStorage.setItem('np.save.' + k, JSON.stringify(s));
  });
  await p.goto(BASE + '?qa#map'); await p.waitForTimeout(2500);
  if (await p.evaluate(() => document.documentElement.classList.contains('cinema'))) throw new Error('cinema class present without the flag');
  const ids = await p.evaluate(() => window.__np.LEVELS.map((l) => l.id));
  const close = async () => { for (let i = 0; i < 12; i++) { const d = await p.$('.dialogue'); if (!d) return; await d.click({ force: true }).catch(() => {}); await p.waitForTimeout(120); } };
  for (const id of ids) {
    total++;
    await p.evaluate((id) => { location.hash = 'level/' + id; }, id); await p.waitForTimeout(1400); await close();
    const sol = await p.evaluate((id) => { const L = window.__np.LEVELS.find((l) => l.id === id), q = window.__np.quantum, o = {}; if (L.solution.bedtime) o.bedtime = q.printProgram(L.solution.bedtime); if (L.solution.morning) o.morning = q.printProgram(L.solution.morning); return o; }, id);
    await p.click('.editor-foot button:has-text("Text")'); await p.waitForTimeout(200);
    const heads = await p.$$eval('.modal .display', (els) => els.map((e) => e.textContent.toLowerCase()));
    const tas = await p.$$('.modal textarea');
    for (let i = 0; i < tas.length; i++) await tas[i].fill(sol[(heads[i] ?? 'morning').includes('bed') ? 'bedtime' : 'morning'] ?? '');
    await p.click('.modal button:has-text("Load")'); await p.waitForTimeout(200);
    await p.click('button:has-text("Test all")');
    let win = false;
    for (let i = 0; i < 40 && !win; i++) { await p.waitForTimeout(250); await close(); win = !!(await p.$('.win-card')); }
    won += win; console.log(id, win ? 'WIN' : 'NO WIN');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  }
} finally { await b.close(); }
console.log(`${won}/${total} levels won; page errors: ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}`);
process.exit(won === total && !errs.length ? 0 : 1);
