#!/usr/bin/env node
/**
 * Lab Notebook v2 screenshot + layout harness (QA regression gate). Deterministic: uses the video capture shim
 * (virtual clock, seeded Math.random, CSS animations driven by virtual time), so two runs of the same build give the
 * same pixels (that is what `diff.mjs` relies on for the "nerd OFF is pixel-identical" proof).
 *
 *   node tools/nb/shoot.mjs --label=baseline                 # every viewport, nerd on + off, all scenarios
 *   node tools/nb/shoot.mjs --label=v2 --only=1366x768        # one viewport (comma list ok: --only=1366x768,390x844)
 *   node tools/nb/shoot.mjs --label=baseline-off --nerd=off   # nerd OFF only (the pixel-identity baseline)
 *   options: --base=http://127.0.0.1:4420/  --levels=2-3,3-1  --nerd=on|off|both  --tour=all|none|<vp,..>  --dpr=1
 *            --no-extras (skip the locked-pages / keyboard scenarios)
 *
 * Output: tools/nb/out/<label>/<viewport>/<nerd>-<level>-<state>.png + report.json (all shots) + summary.txt.
 * Exit code 0 always (it's a reporter); read summary.txt / report.json for the checks.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CAP = path.join(ROOT, 'tools/video/capture');
const { chromium } = createRequire(path.join(CAP, 'package.json'))('playwright');
const SHIM = fs.readFileSync(path.join(CAP, 'shim.js'), 'utf8').replace(/^[\s\S]*?(function __npCaptureShim)/, '$1');

// ───────── args ─────────
const A = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const LABEL = A.label || 'run-' + new Date().toISOString().replace(/[:.]/g, '-');
const BASE = A.base || 'http://127.0.0.1:4420/';
const DPR = Math.min(2, Number(A.dpr) || 1);
const VIEWPORTS = [
  { name: '2560x1440', width: 2560, height: 1440 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '820x1180', width: 820, height: 1180, touch: true },
  { name: '390x844', width: 390, height: 844, touch: true },
];
const only = A.only ? String(A.only).split(',') : null;
const vps = VIEWPORTS.filter((v) => !only || only.includes(v.name));
if (!vps.length) { console.error('no viewport matches --only=' + A.only + '; known: ' + VIEWPORTS.map((v) => v.name).join(',')); process.exit(2); }
const NERDS = A.nerd === 'on' ? [true] : A.nerd === 'off' ? [false] : [true, false];
const LEVELS = (A.levels || '2-3,3-1').split(','); // 2-3: fixed Bedtime + editable Morning; 3-1: both editable
const TOUR = A.tour === 'none' ? [] : A.tour === 'all' || A.tour == null ? null : String(A.tour).split(',');
const tourOn = (vp) => (TOUR === null ? true : TOUR.includes(vp));
const EXTRAS = !A['no-extras'];
const OUT = path.join(HERE, 'out', LABEL);
fs.mkdirSync(OUT, { recursive: true });

function storage(save, extra = {}) {
  const progress = {};
  for (const id of save.progress ?? []) progress[id] = { done: true, stars: [true, true, true] };
  const flags = { ...(save.flags ?? {}) };
  if (save.unlockAll) flags.unlockAll = true;
  const data = {
    v: 1, progress, programs: save.programs ?? {}, slots: {}, homes: {},
    settings: { master: 0, music: 0, sfx: 0, voice: 0, nerd: false, reducedMotion: false, xrayDefault: false, ...(save.settings ?? {}) },
    flags, endlessBest: {},
  };
  const out = { ...extra };
  for (const k of ['a', 'b', 'c']) out['np.save.' + k] = JSON.stringify(data);
  return out;
}

// ───────── in-page layout probe ─────────
function probe(opt = {}) {
  const vw = innerWidth, vh = innerHeight;
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible: vis(el) }; };
  const desc = (el) => { const c = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''; return el.tagName.toLowerCase() + c + (el.dataset?.id ? `[data-id=${el.dataset.id}]` : ''); };
  const txt = (el) => (el.textContent || el.getAttribute('aria-label') || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const SEL = {
    canvas: '.stage-canvas-wrap canvas', stage: '.stage', sceneArea: '.stage-canvas-wrap', nb: '.nb', nbBook: '.nb-book', nbSpine: '.nb-spine',
    nbTabs: '.nb-tabs', nbSheet: '.nb-sheet', nbGrip: '.nb-grip', editor: '.editor', toolbox: '.toolbox', editorBody: '.editor-body', editorFoot: '.editor-foot',
    controls: '.controls', timeline: '.timeline', tlRow: '.tl-row', topbar: '.topbar', hud: '.stage-hud', dialogue: '.dialogue', hints: '.hints-panel', levelMain: '.level-main',
  };
  const boxes = {};
  for (const [k, s] of Object.entries(SEL)) boxes[k] = box(document.querySelector(s));
  boxes.progCols = [...document.querySelectorAll('.prog-col')].map((el) => ({ ...box(el), head: txt(el.querySelector('.ttl') || el).slice(0, 20) }));
  const issues = [];
  const add = (kind, sev, msg, extra) => issues.push({ kind, sev, msg, ...(extra || {}) });

  // page scroll
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) add('hscroll', 'high', `horizontal page scroll: scrollWidth ${de.scrollWidth} > ${vw}`);
  if (de.scrollHeight > vh + 1) add('vscroll', 'med', `vertical page scroll: scrollHeight ${de.scrollHeight} > ${vh}`);

  // notebook overlaps
  const inter = (a, b) => { if (!a || !b || !a.visible || !b.visible) return 0; const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; };
  for (const nbk of ['nbBook', 'nbSpine']) {
    const a = boxes[nbk];
    if (!a?.visible) continue;
    for (const k of ['controls', 'timeline', 'tlRow', 'editor', 'editorFoot', 'topbar', 'hud', 'dialogue', 'hints']) {
      const o = inter(a, boxes[k]); if (o > 4) add('overlap', ['controls', 'timeline', 'tlRow', 'editor', 'editorFoot', 'topbar', 'hud'].includes(k) ? 'high' : 'med', `${nbk} overlaps ${k} (${o}px²)`);
    }
    if (boxes.canvas?.visible) { const o = inter(a, boxes.canvas); const pct = o / (boxes.canvas.w * boxes.canvas.h) * 100; if (pct > 1) add('covers-scene', pct > 25 ? 'high' : 'med', `${nbk} covers ${pct.toFixed(0)}% of the scene canvas`, { pct: +pct.toFixed(1) }); }
  }
  // key elements off-screen
  for (const k of ['canvas', 'nbBook', 'nbSpine', 'editor', 'controls', 'timeline', 'topbar', 'editorFoot', 'toolbox']) {
    const b = boxes[k]; if (!b?.visible) continue;
    if (b.x < -1 || b.y < -1 || b.x + b.w > vw + 1 || b.y + b.h > vh + 1) add('offscreen', 'high', `${k} extends outside viewport (${b.x},${b.y} ${b.w}x${b.h})`);
  }
  // every visible button: on-screen and actually clickable at its centre (catches overlaps + clipping by overflow:hidden)
  const scope = document.querySelector('.level-screen') || document.body;
  let covered = 0, offBtns = 0, tiny = 0;
  for (const b of scope.querySelectorAll('button, [role=tab], [role=separator], select, .card')) {
    if (!vis(b)) continue;
    const r = b.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    // skip things inside an inner scroller that are merely scrolled out of view
    let scrolledOut = false;
    for (let sc = b.parentElement; sc && sc !== scope && !scrolledOut; sc = sc.parentElement) { const cs = getComputedStyle(sc); if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) { const pr = sc.getBoundingClientRect(); if (cy < pr.top || cy > pr.bottom || cx < pr.left || cx > pr.right) scrolledOut = true; } }
    if (scrolledOut) continue;
    if (cx < 0 || cy < 0 || cx > vw || cy > vh) { offBtns++; if (offBtns <= 12) add('btn-offscreen', 'high', `${desc(b)} "${txt(b)}" centre off-screen (${Math.round(cx)},${Math.round(cy)})`); continue; }
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== b && !b.contains(top) && !top.closest?.('.dialogue') && !top.closest?.('.toast')) {
      covered++; if (covered <= 15) add('btn-covered', 'high', `${desc(b)} "${txt(b)}" is covered by ${desc(top)} "${txt(top)}"`);
    }
    if (opt.touch && (r.width < 24 || r.height < 24) && !b.classList.contains('card')) { tiny++; if (tiny <= 8) add('tiny-target', 'low', `${desc(b)} "${txt(b)}" hit area ${Math.round(r.width)}x${Math.round(r.height)} (< 24px)`); }
  }
  if (covered > 15) add('btn-covered', 'high', `… and ${covered - 15} more covered controls`);
  if (offBtns > 12) add('btn-offscreen', 'high', `… and ${offBtns - 12} more off-screen controls`);
  if (tiny > 8) add('tiny-target', 'low', `… and ${tiny - 8} more tiny targets`);

  // canvas
  const cv = document.querySelector('.stage-canvas-wrap canvas');
  if (cv && vis(cv)) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const ra = cv.width / cv.height, rb = r.width / r.height;
    if (Math.abs(ra / rb - 1) > 0.02) add('canvas-aspect', 'high', `canvas backing ${cv.width}x${cv.height} vs css ${Math.round(r.width)}x${Math.round(r.height)}: stretched ${((ra / rb - 1) * 100).toFixed(1)}%`);
    else if (Math.abs(cv.width - r.width * dpr) > 2) add('canvas-stale', 'med', `canvas backing ${cv.width}px vs css ${Math.round(r.width)}x${dpr}: not re-fit`);
    if (r.width < 240 || r.height < 160) add('canvas-small', 'high', `scene canvas only ${Math.round(r.width)}x${Math.round(r.height)}`);
  }

  // clipped / truncated text (labels with overflow hidden, ellipsis or line-clamp)
  const LBL = 'button, [role=tab], .nb-tab small, .ttl, .cnt, .title, .sub, h1, h2, h3, h4, h5, .nb-ptitle, .nb-plain, .nb-cap, .nb-title, label, .cname, .fp-head, .phase-pill, .lvl-badge, .chip, .nb-margin, .nb-big, .nb-sub, th, td';
  let clipped = 0;
  for (const el of scope.querySelectorAll(LBL)) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    const hid = (v) => v === 'hidden' || v === 'clip';
    const xs = el.scrollWidth > el.clientWidth + 1 && (hid(cs.overflowX) || cs.textOverflow === 'ellipsis');
    const ys = el.scrollHeight > el.clientHeight + 1 && (hid(cs.overflowY) || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp);
    if (xs || ys) { clipped++; if (clipped <= 20) add('text-clipped', 'med', `${desc(el)} "${txt(el)}" ${xs ? `w ${el.scrollWidth}>${el.clientWidth}` : ''}${ys ? ` h ${el.scrollHeight}>${el.clientHeight}` : ''}`); }
  }
  // text that spills out of its parent box visibly (overflow visible) inside notebook / editor heads / controls
  for (const el of scope.querySelectorAll('.nb-tab, .prog-col-head, .controls .btn, .nb-head, .fp-head, .topbar .title')) {
    if (!vis(el)) continue;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible') { clipped++; if (clipped <= 30) add('text-spill', 'med', `${desc(el)} "${txt(el)}" content ${el.scrollWidth}px in ${el.clientWidth}px box`); }
  }
  if (clipped > 30) add('text-clipped', 'med', `… and ${clipped - 30} more`);
  // inner horizontal scroll in the notebook sheet (wider-than-page content)
  for (const el of document.querySelectorAll('.nb-sheet, .nb-body, .nb-tabs, .editor-body, .prog-list, .toolbox')) {
    if (!vis(el)) continue;
    if (el.scrollWidth > el.clientWidth + 2) { const ox = getComputedStyle(el).overflowX; add(ox === 'visible' ? 'content-spill' : 'inner-hscroll', 'med', `${desc(el)} content ${el.scrollWidth}px wider than ${el.clientWidth}px (overflow-x: ${ox})`); }
  }
  // readability: font sizes inside the notebook
  const nbRoot = document.querySelector('.nb-book');
  let minFont = null, small = 0, total = 0;
  if (nbRoot && vis(nbRoot)) {
    const w = document.createTreeWalker(nbRoot, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement)) continue;
      const fs = parseFloat(getComputedStyle(n.parentElement).fontSize); total++;
      if (minFont == null || fs < minFont) minFont = fs; if (fs < 11) small++;
    }
    if (small) add('small-text', small > 10 ? 'med' : 'low', `${small}/${total} notebook text runs below 11px (min ${minFont}px)`);
  }
  // SVG text in notebook rendered tiny (svg scaled down)
  for (const t of document.querySelectorAll('.nb-book svg text')) {
    if (!vis(t)) continue;
    const r = t.getBoundingClientRect(); if (r.height && r.height < 8) { add('svg-text-tiny', 'med', `notebook SVG text "${t.textContent.slice(0, 16)}" renders ${r.height.toFixed(1)}px tall`); break; }
  }
  const nb = document.querySelector('.nb');
  const state = {
    nbOpen: !!nb?.classList.contains('nb-open'), page: document.querySelector('.nb-tab.on')?.dataset.id ?? null,
    hidden: !!document.querySelector('.nb-hidden'), nerdBtn: !!document.querySelector('.controls .btn:not(.hidden)[title^="Nerd"]'),
    focus: document.activeElement ? desc(document.activeElement) + ' "' + txt(document.activeElement) + '"' : null,
    scroll: { w: de.scrollWidth, h: de.scrollHeight }, minNbFont: minFont,
  };
  return { vw, vh, boxes, issues, state };
}

// ───────── run ─────────
const logs = [];
const all = [];
const t0 = Date.now();
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=2048', '--hide-scrollbars'] });

// Vite HMR would full-reload our page whenever another agent saves a file: stub its sockets (never open, never close).
const NO_HMR = `(() => { const RW = window.WebSocket; window.WebSocket = function (url, proto) {
  if (proto === 'vite-hmr' || proto === 'vite-ping') { const f = new EventTarget(); f.readyState = 0; f.send = () => {}; f.close = () => {}; f.url = String(url); return f; }
  return new RW(url, proto); }; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); })();`;

async function session(vp, saveSpec, lsExtra, fn, tries = 3) {
  const mark = all.length;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: DPR, hasTouch: !!vp.touch, isMobile: false });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  // CSS transitions off: button press/hover transitions otherwise land a frame apart between runs (1-2 px shadow jitter)
  const cfg = { seed: 7, cursor: false, cursorOverlay: false, storage: storage(saveSpec, lsExtra), extraCss: '*,*::before,*::after{transition:none!important}' };
  await p.addInitScript(NO_HMR);
  await p.addInitScript(`(${SHIM})(${JSON.stringify(cfg)});`);
  const step = async (s = 0.5) => { for (let i = 0; i < Math.round(s * 60); i++) await p.evaluate(() => __cap.step(16.667)); };
  try { await fn(p, step, errs); }
  catch (e) {
    if (tries > 1 && /context was destroyed|navigation|Target closed/i.test(String(e?.message))) {
      console.log('  (page reloaded under us: retrying session) ' + String(e.message).split('\n')[0]);
      all.length = mark; await ctx.close(); return session(vp, saveSpec, lsExtra, fn, tries - 1);
    }
    throw e;
  } finally { await ctx.close().catch(() => {}); }
}

async function loadLevel(p, step, id) {
  await p.goto(BASE + '?qa#level/' + id);
  for (let i = 0; i < 400 && !(await p.evaluate(() => document.fonts.status === 'loaded' && !!document.querySelector('.level-screen .editor'))); i++) { await p.evaluate(() => __cap.step(16.667)); await p.waitForTimeout(5); }
  await step(0.6);
  // close the opening dialogue
  for (let i = 0; i < 30; i++) { if (!(await p.$('.dialogue'))) break; await p.evaluate(() => document.querySelector('.dialogue')?.click()); await step(0.25); }
  await step(0.6);
}
const click = async (p, sel) => {
  // a real click when possible (so overlap breaks it), else a DOM click (logged)
  const el = await p.$(sel); if (!el) return 'missing';
  try { await el.click({ timeout: 800, noWaitAfter: true }); return 'ok'; } catch { await p.evaluate((s) => document.querySelector(s)?.click(), sel); return 'forced'; }
};

async function shoot(p, errs, vpDir, name, meta) {
  const file = path.join(vpDir, name + '.png');
  await p.mouse.move(0, 0); await p.evaluate(() => __cap.step(400)); // no hover/press state in the shot (transitions settle)
  await p.screenshot({ path: file });
  const r = await p.evaluate(probe, { touch: !!meta.touch });
  if (errs.length) r.issues.push(...errs.splice(0).map((e) => ({ kind: 'console', sev: 'high', msg: e })));
  const rec = { shot: path.relative(ROOT, file), ...meta, ...r };
  all.push(rec);
  const hi = r.issues.filter((i) => i.sev === 'high').length;
  console.log(`  ${name}: ${r.issues.length} issues (${hi} high)`);
  return rec;
}

// solutions (once): so the editor shows real cards and Run night has something to run
let SOL = null;
await session(VIEWPORTS[1], { unlockAll: true }, {}, async (p, step) => {
  await loadLevel(p, step, LEVELS[0]);
  SOL = await p.evaluate((ids) => Object.fromEntries(ids.map((id) => { const L = __np.LEVELS.find((l) => l.id === id); const o = {}; for (const ph of L.editable) if (L.solution[ph]) o[ph] = L.solution[ph]; return [id, o]; })), LEVELS);
});

const TOUR_PAGES = ['state', 'bloch', 'entangle', 'circuit', 'stabilizers', 'threshold', 'density', 'export'];
for (const vp of vps) {
  const vpDir = path.join(OUT, vp.name); fs.mkdirSync(vpDir, { recursive: true });
  for (const nerd of NERDS) {
    const tag = nerd ? 'on' : 'off';
    for (const lv of LEVELS) {
      console.log(`${vp.name} nerd ${tag} level ${lv}`);
      const meta = (state) => ({ viewport: vp.name, touch: !!vp.touch, nerd, level: lv, state });
      await session(vp, { unlockAll: true, programs: { [lv]: SOL[lv] }, settings: { nerd } }, { 'np.nb.open': '0', 'np.nb.page': 'state' }, async (p, step, errs) => {
        await loadLevel(p, step, lv);
        await shoot(p, errs, vpDir, `${tag}-${lv}-idle`, meta('idle'));
        if (nerd) {
          const how = await click(p, '.nb-spine'); await step(1.6);
          await shoot(p, errs, vpDir, `${tag}-${lv}-nbopen`, { ...meta('nbopen'), click: how });
        }
        // step through a night: Step mode, then 3 x "step ▶"
        await click(p, '.controls .btn[title^="Step mode"]'); await step(0.3);
        for (let i = 0; i < 3; i++) { await click(p, '.controls .step-btn.go'); await step(1.4); }
        await shoot(p, errs, vpDir, `${tag}-${lv}-step3`, meta('step3')); // nerd on: State page, X-ray off = 🙈 hidden
        await click(p, '.controls .btn[title^="X-ray"]'); await step(1.2);
        await shoot(p, errs, vpDir, `${tag}-${lv}-step3-xray`, meta('step3-xray'));
        if (nerd && tourOn(vp.name) && lv === LEVELS[0]) {
          for (const pg of TOUR_PAGES) {
            const how = await click(p, `.nb-tab[data-id=${pg}]`); await step(pg === 'circuit' ? 2.5 : 0.8);
            await shoot(p, errs, vpDir, `${tag}-${lv}-page-${pg}`, { ...meta('page-' + pg), click: how });
          }
          // narrow pin toggle (wide) if present
          if (await p.$('.nb-pin')) { await click(p, '.nb-pin'); await step(0.6); await shoot(p, errs, vpDir, `${tag}-${lv}-pinned-wide`, meta('pinned-wide')); }
        }
        // finish the night (play to end) and shoot the end state
        await click(p, '.controls .btn[title^="Step mode"]'); await step(0.2); await click(p, '.controls .btn[title^="Play"]'); await step(8);
        for (let i = 0; i < 10; i++) { if (!(await p.$('.dialogue'))) break; await p.evaluate(() => document.querySelector('.dialogue')?.click()); await step(0.3); }
        await shoot(p, errs, vpDir, `${tag}-${lv}-end`, meta('end'));
      });
    }
    // extras (nerd on only): locked pages + keyboard focus walk
    if (nerd && EXTRAS) {
      const lv = LEVELS[0];
      console.log(`${vp.name} extras`);
      await session(vp, { progress: ['0-1', '0-2', '0-3', '1-1', '1-2', '1-3', '1-4', '1-5', '2-1', '2-2'], programs: { [lv]: SOL[lv] }, settings: { nerd: true } }, { 'np.nb.open': '1', 'np.nb.page': 'circuit' }, async (p, step, errs) => {
        await loadLevel(p, step, lv);
        await shoot(p, errs, vpDir, `on-${lv}-locked`, { viewport: vp.name, touch: !!vp.touch, nerd, level: lv, state: 'locked' });
        await click(p, '.nb-tab[data-id=density]'); await step(0.4);
        await shoot(p, errs, vpDir, `on-${lv}-locked-click`, { viewport: vp.name, touch: !!vp.touch, nerd, level: lv, state: 'locked-click' });
      });
      await session(vp, { unlockAll: true, programs: { [lv]: SOL[lv] }, settings: { nerd: true } }, { 'np.nb.open': '0', 'np.nb.page': 'state' }, async (p, step, errs) => {
        await loadLevel(p, step, lv);
        const walk = [];
        await p.evaluate(() => document.querySelector('.nb-spine')?.focus()); await step(0.1);
        await p.keyboard.press('Enter'); await step(0.6);
        walk.push(await p.evaluate(() => { const a = document.activeElement; return 'after Enter on spine: ' + (a ? a.tagName + '.' + a.className + ' "' + (a.textContent || '').trim().slice(0, 30) + '"' : 'none') + ' open=' + document.querySelector('.nb')?.classList.contains('nb-open'); }));
        for (let i = 0; i < 6; i++) {
          await p.keyboard.press('Tab'); await step(0.1);
          walk.push(await p.evaluate(() => { const a = document.activeElement; if (!a) return 'none'; const cs = getComputedStyle(a); const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== 'none'; return `Tab → ${a.tagName.toLowerCase()}.${String(a.className).split(' ').join('.')} "${(a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 30)}" inNotebook=${!!a.closest('.nb')} ring=${ring}`; }));
        }
        await shoot(p, errs, vpDir, `on-${lv}-kbd-tab6`, { viewport: vp.name, touch: !!vp.touch, nerd, level: lv, state: 'kbd', walk });
        await p.keyboard.press('Escape'); await step(0.5);
        walk.push(await p.evaluate(() => 'after Escape: open=' + document.querySelector('.nb')?.classList.contains('nb-open') + ' focus=' + document.activeElement?.className));
        await p.keyboard.press(' '); await step(0.4); // Space: does it play the night or press the focused notebook button?
        walk.push(await p.evaluate(() => 'after Space: open=' + document.querySelector('.nb')?.classList.contains('nb-open') + ' playing=' + (document.querySelector('.controls .btn[title^="Play"]')?.textContent)));
        all[all.length - 1].walk = walk;
        console.log('  kbd: ' + walk.join(' | '));
      });
    }
  }
}
await browser.close();

// ───────── report ─────────
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ label: LABEL, base: BASE, dpr: DPR, at: new Date().toISOString(), shots: all }, null, 1));
const lines = [`label ${LABEL}  shots ${all.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`];
const byKind = {};
for (const s of all) for (const i of s.issues) (byKind[i.kind + ':' + i.sev] ??= []).push(s.shot);
lines.push('', 'issue counts (kind:severity → #shots):');
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) lines.push(`  ${k.padEnd(24)} ${v.length}`);
lines.push('', 'per shot:');
for (const s of all) {
  if (!s.issues.length) continue;
  lines.push(`${s.shot}`);
  for (const i of s.issues) lines.push(`   [${i.sev}] ${i.kind}: ${i.msg}`);
}
fs.writeFileSync(path.join(OUT, 'summary.txt'), lines.join('\n') + '\n');
console.log(lines.slice(0, 40).join('\n'));
console.log('\nwrote ' + path.relative(ROOT, OUT) + '/{report.json,summary.txt}');
