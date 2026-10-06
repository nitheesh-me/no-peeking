// reproduce shoot.mjs's keyboard scenario under the capture shim and probe the book
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CAP = path.join(ROOT, 'tools/video/capture');
const { chromium } = createRequire(path.join(CAP, 'package.json'))('playwright');
const SHIM = fs.readFileSync(path.join(CAP, 'shim.js'), 'utf8').replace(/^[\s\S]*?(function __npCaptureShim)/, '$1');
const W = +(process.argv[2] || 1920), H = +(process.argv[3] || 1080);
const b = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
const save = { v: 1, progress: {}, programs: {}, slots: {}, homes: {}, settings: { master: 0, music: 0, sfx: 0, voice: 0, nerd: true }, flags: { unlockAll: true, 'nerd:found': true }, endlessBest: {} };
const storage = { 'np.nb.open': '0', 'np.nb.page': 'state' }; for (const k of ['a', 'b', 'c']) storage['np.save.' + k] = JSON.stringify(save);
await p.addInitScript(`(${SHIM})(${JSON.stringify({ seed: 7, cursor: false, cursorOverlay: false, storage })});`);
const step = async (s) => { for (let i = 0; i < Math.round(s * 60); i++) await p.evaluate(() => __cap.step(16.667)); };
await p.goto('http://127.0.0.1:4420/?qa#level/2-3');
for (let i = 0; i < 300 && !(await p.evaluate(() => !!document.querySelector('.level-screen .editor'))); i++) { await p.evaluate(() => __cap.step(16.667)); await p.waitForTimeout(5); }
await step(1.2);
for (let i = 0; i < 30 && await p.$('.dialogue'); i++) { await p.evaluate(() => document.querySelector('.dialogue')?.click()); await step(0.25); }
await p.evaluate(() => document.querySelector('.nb-spine')?.focus()); await step(0.1);
await p.keyboard.press('Enter');
for (const t of [0.05, 0.3, 0.6, 1.5]) {
  await step(t);
  console.log(t, JSON.stringify(await p.evaluate(() => {
    const nb = document.querySelector('.nb'), bk = document.querySelector('.nb-book'), r = bk.getBoundingClientRect(), cs = getComputedStyle(bk);
    return { cls: nb.className, vt: document.documentElement.dataset.vt ?? null, book: [r.x | 0, r.y | 0, r.width | 0, r.height | 0], op: cs.opacity, tf: cs.transform.slice(0, 40), anims: document.getAnimations().map((a) => (a.animationName || a.constructor.name) + '@' + (a.playState) + ':' + Math.round(a.currentTime)), hit: document.elementFromPoint(1300, 1050)?.className };
  })));
}
await p.screenshot({ path: path.join(ROOT, 'tools/nb/prog/out/kbd-shim.png') });
await b.close();
