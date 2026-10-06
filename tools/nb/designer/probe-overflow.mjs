// Designer: list elements that stick out of the notebook sheet's content box. node tools/nb/designer/probe-overflow.mjs [w] [h] [page]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../video/capture/node_modules/playwright');
const [W, H, PAGE] = [+(process.argv[2] ?? 1024), +(process.argv[3] ?? 768), process.argv[4] ?? 'state'];
const b = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.addInitScript((pg) => {
    const s = { v: 1, progress: {}, programs: {}, slots: {}, settings: { master: 0, music: 0, sfx: 0, voice: 0, nerd: true, reducedMotion: true, xrayDefault: true }, flags: { unlockAll: true, 'nerd:found': true }, endlessBest: {} };
    for (const k of ['a', 'b', 'c']) localStorage.setItem('np.save.' + k, JSON.stringify(s));
    localStorage.setItem('np.nb.open', '1'); localStorage.setItem('np.nb.page', pg);
  }, PAGE);
  await p.goto('http://127.0.0.1:4420/?qa#level/2-3'); await p.waitForTimeout(2500);
  for (let i = 0; i < 12; i++) { const d = await p.$('.dialogue'); if (!d) break; await d.click({ force: true }).catch(() => {}); await p.waitForTimeout(150); }
  await p.click('button:has-text("Run night")').catch(() => {}); await p.waitForTimeout(2500);
  if (process.argv[5]) console.log(await p.evaluate((sel) => { const e = document.querySelector(sel); let s = ""; for (let n = e; n && !n.classList?.contains("nb-sheet"); n = n.parentElement) { const cs = getComputedStyle(n); s += `${n.tagName}.${String(n.className.baseVal ?? n.className)} w=${n.getBoundingClientRect().width.toFixed(0)} disp=${cs.display} flex=${cs.flex} minw=${cs.minWidth} ov=${cs.overflowX} tf=${cs.transform}\n`; } return s; }, process.argv[5]));
  const out = await p.evaluate(() => {
    const r = [];
    for (const sh of document.querySelectorAll('.nb-sheet')) {
      const box = sh.getBoundingClientRect(); const right = box.left + sh.clientWidth;
      r.push(`sheet ${sh.dataset.page} client ${sh.clientWidth} scroll ${sh.scrollWidth}`);
      for (const el of sh.querySelectorAll('*')) { const e = el.getBoundingClientRect(); if (e.width && e.right > right + 0.5) r.push(`  ${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(' ').join('.')} right+${(e.right - right).toFixed(1)}`); }
    }
    return r.slice(0, 30);
  });
  console.log(out.join('\n'));
} finally { await b.close(); }
