// Designer: frames of the book opening (cover swing + paw pat). node tools/nb/designer/shoot-open.mjs [w] [h]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../video/capture/node_modules/playwright');
const [W, H] = [+(process.argv[2] ?? 1440), +(process.argv[3] ?? 900)];
const OUT = new URL('.', import.meta.url).pathname;
const b = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.addInitScript(() => {
    const s = { v: 1, progress: {}, programs: {}, slots: {}, settings: { master: 0, music: 0, sfx: 0, voice: 0, nerd: true, reducedMotion: false, xrayDefault: true }, flags: { unlockAll: true, 'nerd:found': true }, endlessBest: {} };
    for (const k of ['a', 'b', 'c']) localStorage.setItem('np.save.' + k, JSON.stringify(s));
    localStorage.setItem('np.nb.open', '0'); localStorage.setItem('np.nb.page', 'circuit');
  });
  await p.goto('http://127.0.0.1:4420/?qa#level/2-3'); await p.waitForTimeout(2500);
  for (let i = 0; i < 12; i++) { const d = await p.$('.dialogue'); if (!d) break; await d.click({ force: true }).catch(() => {}); await p.waitForTimeout(150); }
  await p.mouse.move(5, 5);
  // slow every animation 6x so the swiftshader screenshots land mid-flight
  const cdp = await p.context().newCDPSession(p); await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / 6 });
  await p.click('.nb-spine');
  for (const [i, t] of [[1, 250], [2, 900], [3, 1700], [4, 2600], [5, 4000]].entries()) {
    await p.waitForTimeout(t[1] - (i ? [250, 900, 1700, 2600, 4000][i - 1] : 0));
    await p.screenshot({ path: `${OUT}real-open-${W}-f${t[0]}.png`, clip: { x: 0, y: 60, width: W, height: H - 60 } });
  }
  console.log(await p.evaluate(() => [document.documentElement.dataset.vt ?? '-', document.querySelector('.nb')?.className]));
} finally { await b.close(); }
