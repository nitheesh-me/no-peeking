#!/usr/bin/env node
// Programmer's quick bench check: node tools/nb/prog/check.mjs [vp,...] [--nerd=off] [--level=2-3] [--page=circuit]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const { chromium } = createRequire(path.join(ROOT, 'tools/video/capture/package.json'))('playwright');
const A = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return [m[1], m[2] ?? true]; }));
const vps = (process.argv.slice(2).find((a) => !a.startsWith('--')) || '1920x1080,1440x900,1024x768,820x1180,390x844').split(',');
const nerd = A.nerd !== 'off', lv = A.level || '2-3', OUT = path.join(HERE, 'out'); fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
for (const vp of vps) {
  const [w, hh] = vp.split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const save = { v: 1, progress: {}, programs: {}, slots: {}, homes: {}, settings: { master: 0, music: 0, sfx: 0, voice: 0, nerd, reducedMotion: false, xrayDefault: false }, flags: { unlockAll: true, 'nerd:found': true }, endlessBest: {} };
  const ls = { 'np.nb.page': A.page || 'circuit', ...(A.open ? { 'np.nb.open': A.open } : {}) };
  await p.addInitScript(([s, ls]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.clear(); for (const k of ['a', 'b', 'c']) localStorage.setItem('np.save.' + k, JSON.stringify(s)); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); }, [save, ls]);
  await p.goto('http://127.0.0.1:4420/?qa#level/' + lv);
  await p.waitForSelector('.level-screen .editor');
  await p.waitForTimeout(800);
  for (let i = 0; i < 20 && await p.$('.dialogue'); i++) { await p.evaluate(() => window.__np?.closeDialogue?.()); await p.waitForTimeout(100); }
  // load the solution, run a night paused, step in
  await p.evaluate((id) => { const L = window.__np.LEVELS.find((l) => l.id === id); window.__np.editor().setProgs(L.solution); }, lv);
  await p.evaluate(() => { window.__np.runNight(undefined, undefined, true); });
  await p.waitForTimeout(200);
  await p.evaluate(() => { const pb = window.__np.pb(); if (pb) pb.seek(Math.floor(pb.length * 0.7)); });
  if (A.xray) await p.evaluate(() => window.__np.setXray(true));
  await p.waitForTimeout(+(A.wait || 3200));
  const extra = {};
  for (const act of String(A.act || '').split(',').filter(Boolean)) {
    if (act === 'spine') { await p.click('.nb-spine'); await p.waitForTimeout(120); extra.vtMid = await p.evaluate(() => document.documentElement.dataset.vt || null); await p.screenshot({ path: path.join(OUT, `mid-open-${vp}.png`) }); await p.waitForTimeout(1500); }
    if (act === 'nerdoff') { await p.click('.controls .btn[title^="Nerd"]'); await p.waitForTimeout(1500); extra.leftovers = await p.evaluate(() => [document.documentElement.dataset.vt ?? null, ...['.stage-scene', '.editor', '.controls', '.tl-row', '.level-main'].map((q) => document.querySelector(q).getAttribute('style'))]); }
    if (act === 'close') { await p.click('.nb-close'); await p.waitForTimeout(80); extra.midClose = await p.evaluate(() => document.querySelector('.level-main').dataset.nb); await p.waitForTimeout(600); }
    if (act === 'code') { await p.click('.bench-tab.code'); await p.waitForTimeout(600); }
    if (act === 'notes') { await p.click('.bench-tab.notes'); await p.waitForTimeout(1500); }
    if (act === 'drag') {
      const b = await p.$('.nb-binding'); const bb = await b.boundingBox();
      await p.mouse.move(bb.x + bb.width / 2, bb.y + 300); await p.mouse.down(); await p.mouse.move(bb.x - 60, bb.y + 300, { steps: 5 });
      extra.ghost = await p.evaluate(() => !!document.querySelector('.nb-resize-ghost'));
      extra.canvasMid = await p.evaluate(() => document.querySelector('.stage-canvas-wrap canvas').width);
      await p.mouse.move(bb.x - 120, bb.y + 300, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(600);
      extra.nbw = await p.evaluate(() => [document.querySelector('.level-main').style.getPropertyValue('--nb-w'), localStorage.getItem('np.nb.w2')]);
    }
    if (act === 'hover') {
      const c = await p.$('.prog-list > .card:nth-of-type(2)'); await c.hover(); await p.waitForTimeout(300);
      extra.hlFromCard = await p.evaluate(() => [document.querySelectorAll('.nb-g.gate-hl').length, document.querySelectorAll('.nb-hlband').length, document.querySelectorAll('.nb-clegend .gate-hl').length]);
      const g = await p.$('g.nb-g[data-line]'); if (g) { await g.hover({ force: true }); await p.waitForTimeout(300); }
      extra.hlFromGate = await p.evaluate(() => [document.querySelectorAll('.card.card-hl').length, document.querySelector('.card.card-hl')?.textContent?.slice(0, 30)]);
    }
    if (act === 'esc') { await p.focus('.nb-tab.on'); await p.keyboard.press('ArrowDown'); extra.focusAfterArrow = await p.evaluate(() => document.activeElement?.dataset.id); await p.keyboard.press('Escape'); await p.waitForTimeout(300); extra.afterEsc = await p.evaluate(() => [document.querySelector('.level-main').dataset.nb, document.querySelector('.level-main').dataset.sheet]); }
  }
  const r = await p.evaluate(() => {
    const de = document.documentElement, m = document.querySelector('.level-main'), cv = document.querySelector('.stage-canvas-wrap canvas');
    const rr = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
    const cr = cv.getBoundingClientRect();
    return { hscroll: de.scrollWidth > innerWidth, vscroll: de.scrollHeight > innerHeight, bench: m.dataset.bench, nb: m.dataset.nb, cls: m.className, spread: document.querySelector('.nb')?.dataset.spread,
      canvas: [cv.width, cv.height, Math.round(cr.width), Math.round(cr.height)], scene: rr('.stage-scene'), dock: rr('.nb-dock'), book: rr('.nb-book'), editor: rr('.editor'), controls: rr('.controls'), tl: rr('.tl-row'), foot: rr('.editor-foot'), hud: rr('.stage-hud') };
  });
  const f = path.join(OUT, `${nerd ? 'on' : 'off'}-${lv}-${vp}${A.act ? '-' + String(A.act).replace(/,/g, '_') : ''}${A.page ? '-' + A.page : ''}.png`);
  await p.screenshot({ path: f });
  console.log(vp, JSON.stringify(r), JSON.stringify(extra), errs.length ? 'ERRORS: ' + errs.join(' | ') : '');
  await ctx.close();
}
await browser.close();
