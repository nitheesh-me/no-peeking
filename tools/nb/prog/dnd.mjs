// stacked editor: drag a toolbox card into Morning (with auto-scroll), click-to-add, move between phases, trash, fold.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { chromium } = createRequire(path.join(ROOT, 'tools/video/capture/package.json'))('playwright');
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const save = { v: 1, progress: {}, programs: {}, slots: {}, homes: {}, settings: { master: 0, music: 0, sfx: 0, voice: 0, nerd: true }, flags: { unlockAll: true, 'nerd:found': true }, endlessBest: {} };
await p.addInitScript((s) => { if (sessionStorage.getItem('x')) return; sessionStorage.setItem('x', '1'); localStorage.clear(); for (const k of ['a', 'b', 'c']) localStorage.setItem('np.save.' + k, JSON.stringify(s)); }, save);
await p.goto('http://127.0.0.1:4420/?qa#level/3-1'); await p.waitForSelector('.editor.stacked'); await p.waitForTimeout(800);
for (let i = 0; i < 20 && await p.$('.dialogue'); i++) { await p.evaluate(() => window.__np.closeDialogue()); await p.waitForTimeout(100); }
await p.evaluate(() => { const L = window.__np.LEVELS.find((l) => l.id === '3-1'); window.__np.editor().setProgs(L.solution); });
await p.waitForTimeout(300);
const len = () => p.evaluate(() => { const e = window.__np.editor().progs; return [e.bedtime.length, e.morning.length]; });
const out = { start: await len() };
// drag BOOP from the toolbox to the bottom of the scroller (Morning end), holding near the bottom edge to auto-scroll
const tool = await (await p.$('.toolbox .card.op-BOOP')).boundingBox();
const cols = await (await p.$('.editor .columns')).boundingBox();
await p.mouse.move(tool.x + 30, tool.y + 15); await p.mouse.down();
await p.mouse.move(cols.x + cols.width / 2, cols.y + cols.height - 20, { steps: 8 });
for (let i = 0; i < 80; i++) await p.mouse.move(cols.x + cols.width / 2 + (i % 2), cols.y + cols.height - 18);
out.scrollTop = await p.evaluate(() => document.querySelector('.editor .columns').scrollTop);
await p.mouse.up(); await p.waitForTimeout(300);
out.afterDrag = await len();
out.lastMorning = await p.evaluate(() => window.__np.editor().progs.morning.at(-1)?.op);
// click-to-add END (goes to the active phase = morning after the drop)
await p.click('.toolbox .card.op-END'); await p.waitForTimeout(200); out.afterClick = await len();
// fold Bedtime, then unfold
await p.evaluate(() => document.querySelector('.editor .columns').scrollTop = 0);
await p.click('.prog-col[data-phase=bedtime] .fold'); await p.waitForTimeout(200);
out.folded = await p.evaluate(() => [document.querySelector('.prog-col[data-phase=bedtime]').classList.contains('collapsed'), getComputedStyle(document.querySelector('.prog-list[data-phase=bedtime]')).display]);
await p.click('.prog-col[data-phase=bedtime] .fold'); await p.waitForTimeout(200);
// move the first Bedtime card into Morning top
const c0 = await (await p.$('.prog-list[data-phase=bedtime] > .card')).boundingBox();
const m0 = await (await p.$('.prog-list[data-phase=morning] > .card')).boundingBox();
await p.mouse.move(c0.x + 20, c0.y + c0.height / 2); await p.mouse.down(); await p.mouse.move(m0.x + 30, m0.y + 4, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(300);
out.afterMove = await len();
// trash the last morning card by dragging to the trash
await p.evaluate(() => [...document.querySelectorAll('.prog-list[data-phase=morning] > .card')].at(-1).scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
const last = await p.evaluate(() => { const r = [...document.querySelectorAll('.prog-list[data-phase=morning] > .card')].at(-1).getBoundingClientRect(); return { x: r.x, y: r.y, height: r.height }; });
const tr = await (await p.$('.editor-foot .trash')).boundingBox();
await p.mouse.move(last.x + 20, last.y + last.height / 2); await p.mouse.down(); await p.mouse.move(tr.x + 20, tr.y + 10, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(300);
out.afterTrash = await len();
out.arrows = await p.evaluate(() => [...document.querySelectorAll('.prog-list .arrows path')].length);
out.divider = await p.evaluate(() => !!document.querySelector('.night-divider'));
await p.screenshot({ path: path.join(ROOT, 'tools/nb/prog/out/dnd-3-1-1440.png') });
console.log(JSON.stringify(out), errs);
await browser.close();
