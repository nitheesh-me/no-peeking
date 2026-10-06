#!/usr/bin/env node
// Quantum expert's phase-2 check of the Lab Notebook (circuit conds, card↔gate map, decoder, sparkline, wording).
// node tools/nb/quantum/verify.mjs [caseName,...]   → prints JSON per case, screenshots in tools/nb/quantum/out/
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const { chromium } = createRequire(path.join(ROOT, 'tools/video/capture/package.json'))('playwright');
const OUT = path.join(HERE, 'out'); fs.mkdirSync(OUT, { recursive: true });

const ARB = { theta: 1.1, phi: 0.7 };
const CASES = {
  '1-3': { lv: '1-3', input: 'plus', errors: [] },
  '2-3-q2': { lv: '2-3', input: ARB, errors: [{ kind: 'flip', t: 'q2' }] },
  '2-3-two': { lv: '2-3', input: ARB, errors: [{ kind: 'flip', t: 'q1' }, { kind: 'flip', t: 'q2' }] },
  '2-4-q1': { lv: '2-4', input: ARB, errors: [{ kind: 'flip', t: 'q1' }] },
  '2-4-q3': { lv: '2-4', input: ARB, errors: [{ kind: 'flip', t: 'q3' }] },
  '2-4-loop': { lv: '2-4', input: 'zero', errors: [], morning: 'top:\nSPIN a\nLISTEN a\nRESET a\nIF a BEEP -> top\nHIGHFIVE q1 -> a\nHIGHFIVE q2 -> a\nLISTEN a' },
  '3-2-q2': { lv: '3-2', input: ARB, errors: [{ kind: 'phase', t: 'q2' }] },
  '3-2-none': { lv: '3-2', input: ARB, errors: [] },
  '3-3-wob': { lv: '3-3', input: ARB, errors: [{ kind: 'wobble', t: 'q2', axis: 'x', angle: 1.3 }] },
  '4-1-y5': { lv: '4-1', input: ARB, errors: [{ kind: 'both', t: 'q5' }] },
  '4-1-z2': { lv: '4-1', input: ARB, errors: [{ kind: 'phase', t: 'q2' }] },
};
const pick = (process.argv[2] || Object.keys(CASES).join(',')).split(',');
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
for (const name of pick) {
  const C = CASES[name];
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const save = { v: 1, progress: {}, programs: {}, slots: {}, homes: {}, settings: { master: 0, music: 0, sfx: 0, voice: 0, nerd: true, reducedMotion: true, xrayDefault: false }, flags: { unlockAll: true, 'nerd:found': true }, endlessBest: {} };
  const ls = { 'np.nb.page': 'circuit', 'np.nb.open': '1', 'np.nb.morphed': '1' };
  await p.addInitScript(([s, ls]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.clear(); for (const k of ['a', 'b', 'c']) localStorage.setItem('np.save.' + k, JSON.stringify(s)); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); }, [save, ls]);
  await p.goto('http://127.0.0.1:4420/?qa#level/' + C.lv);
  await p.waitForSelector('.level-screen .editor');
  await p.waitForTimeout(800);
  for (let i = 0; i < 20 && await p.$('.dialogue'); i++) { await p.evaluate(() => window.__np?.closeDialogue?.()); await p.waitForTimeout(100); }
  await p.evaluate(([id, morning]) => {
    const L = window.__np.LEVELS.find((l) => l.id === id);
    const progs = { ...L.solution };
    if (morning) progs.morning = window.__np.quantum.parseProgram(morning).prog;
    window.__np.editor().setProgs(progs);
  }, [C.lv, C.morning ?? null]);
  await p.evaluate(([inp, e]) => window.__np.runNight(inp, e, true), [C.input, C.errors]);
  await p.waitForTimeout(300);
  await p.evaluate(() => { const pb = window.__np.pb(); pb.seek(pb.length - 1); window.__nbNight = pb.night; });
  await p.evaluate(() => window.__np.setXray(true));
  await p.waitForTimeout(1500);

  // ── (a) circuit columns ──
  const circ = await p.evaluate(() => {
    const night = window.__nbNight;
    // ground truth line ref per step straight from the trace
    let last = null; const refs = night.steps.map((s) => { if (s.ev.k === 'phase') last = null; if (s.ev.k === 'line') last = s.ev.phase === 'night' ? null : `${s.ev.phase}:${s.ev.part}:${s.ev.pc}`; return last; });
    const cols = [...document.querySelectorAll('.nb-circ g.nb-g[data-col]')].map((g) => ({
      col: +g.dataset.col, line: g.dataset.line ?? null, op: g.dataset.op ?? null,
      title: g.querySelector(':scope > .nb-gl > title, :scope .nb-gl title')?.textContent ?? '',
      cond: g.querySelectorAll('.nb-cl').length / 2,
      obs: g.querySelector('.nb-obs')?.textContent?.replace(/\s+/g, ' ') ?? null,
    }));
    return { cols, refs, pass: night.pass, fid: night.fidelity, cardsN: document.querySelectorAll('.editor .card').length,
      unknown: !!document.querySelector('.nb-condunk'), plain: document.querySelector('.nb-plain')?.textContent };
  });

  // ── (b) card → gate ──
  const cards = await p.$$('.editor .prog-list > .card, .editor .fp-list > .card');
  const fixedOpen = await p.$$eval('.editor .fp-list', (els) => els.length);
  const map = [];
  for (const c of cards) {
    const vis = await c.isVisible(); if (!vis) { map.push({ hidden: true, text: (await c.textContent()).trim().slice(0, 28) }); continue; }
    await c.hover({ force: true }); await p.waitForTimeout(120);
    map.push(await p.evaluate((el) => {
      const col = el.closest('.prog-col'), ph = col?.dataset.phase, par = el.parentElement;
      const part = par.classList.contains('fp-list') ? 'fixed' : 'mine';
      const pc = part === 'fixed' ? [...par.children].indexOf(el) : [...par.querySelectorAll(':scope > .card')].indexOf(el);
      const key = `${ph}:${part}:${pc}`;
      const hl = [...document.querySelectorAll('.nb-circ g.nb-g.gate-hl')].map((g) => +g.dataset.col).sort((a, b) => a - b);
      const want = [...document.querySelectorAll(`.nb-circ g.nb-g[data-line="${key}"]`)].map((g) => +g.dataset.col).sort((a, b) => a - b);
      return { key, text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30), hl, want };
    }, c));
  }
  // check every gate key against the trace-derived ref of its step (via stepToCol order)
  // ── gate → card ──
  const back = [];
  const gs = await p.$$('.nb-circ g.nb-g[data-line]');
  for (const g of gs.slice(0, 80)) {
    const box = (await g.$('.nb-gl rect.nb-box')) ?? (await g.$('.nb-gl circle[r="9"]')) ?? g;
    await box.hover({ force: true }); await p.waitForTimeout(60);
    back.push(await p.evaluate((el) => ({ line: el.dataset.line, title: el.querySelector('title')?.textContent ?? '', card: [...document.querySelectorAll('.card.card-hl')].map((c) => c.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)) }), g));
  }
  await p.mouse.move(5, 5);
  await p.screenshot({ path: path.join(OUT, `${name}-circuit.png`) });

  // ── (c,d) stabilizer page ──
  await p.evaluate(() => document.querySelector('.nb-tab[data-id="stabilizers"]')?.click());
  await p.waitForTimeout(900);
  const stab = await p.evaluate(() => ({
    plain: document.querySelector('.nb-plain')?.textContent,
    tables: [...document.querySelectorAll('.nb-sheet .nb-table')].map((t) => [...t.querySelectorAll('tr')].map((r) => (r.classList.contains('on') ? '► ' : '') + [...r.children].map((c) => c.textContent.trim()).join(' | '))),
    caps: [...document.querySelectorAll('.nb-sheet .nb-cap, .nb-sheet .nb-sub')].map((e) => e.textContent.trim()).filter(Boolean),
    spark: (() => { const f = document.querySelector('.nb-spark-f')?.getAttribute('points'), r = document.querySelector('.nb-spark-r')?.getAttribute('points'); return f ? { fN: f.split(' ').length, rN: r?.split(' ').length, rMinY: r ? Math.max(...r.split(' ').map((s) => +s.split(',')[1])) : null } : null; })(),
    stamps: [...document.querySelectorAll('.nb-survived, .nb-fooled')].map((e) => e.textContent),
  }));
  await p.screenshot({ path: path.join(OUT, `${name}-stab.png`) });
  // ── (e) wording on every page ──
  const words = [];
  for (const id of ['state', 'bloch', 'entangle', 'circuit', 'stabilizers', 'threshold', 'density', 'export']) {
    await p.evaluate((id) => document.querySelector(`.nb-tab[data-id="${id}"]`)?.click(), id);
    await p.waitForTimeout(350);
    words.push(await p.evaluate(() => ({ title: document.querySelector('.nb-ptitle')?.textContent, plain: document.querySelector('.nb-plain')?.textContent, margin: document.querySelector('.nb-margin')?.textContent?.trim(), caps: [...document.querySelectorAll('.nb-sheet .nb-cap')].map((e) => e.textContent.trim()).slice(0, 6) })));
  }
  const bad = map.filter((m) => !m.hidden && JSON.stringify(m.hl) !== JSON.stringify(m.want));
  console.log(JSON.stringify({ name, pass: circ.pass, unknown: circ.unknown, cols: circ.cols.map((c) => `${c.col}:${c.op ?? '-'}${c.cond ? `[c${c.cond}]` : ''}${c.obs ? `{${c.obs}}` : ''} ${c.line ?? ''} ${c.title}`), cardMapBad: bad, cards: map.map((m) => `${m.key ?? 'hidden'} ${m.text} → ${JSON.stringify(m.hl)}`), back: back.map((b) => `${b.line} ${b.title} → ${b.card.join('/')}`), stab, words, errs }, null, 1));
  await ctx.close();
}
await browser.close();
