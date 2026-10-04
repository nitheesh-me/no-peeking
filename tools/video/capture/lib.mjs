/**
 * NO PEEKING! deterministic capture: virtual time, 4K frame grabs, input choreography, event + layout logs.
 *
 *   import { shot, runShots } from './lib.mjs';
 *   shot('title-peek', { save: { unlockAll: true } }, async (s) => {
 *     await s.goto('#title');
 *     await s.cursorTo({ x: 400, y: 700 }, { dur: 0.8 });
 *     await s.hold(1);
 *   });
 *   await runShots();            // or: node run.mjs shots/foo.mjs
 *
 * See docs/VIDEO_CAPTURE.md for the full DSL.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
export const FPS = 60;
const SHIM_SRC = fs.readFileSync(path.join(HERE, 'shim.js'), 'utf8');

export const DEFAULT_LAYOUT = [
  '.dialogue', '.editor', '.controls', '.toast', '.modal', '.win-card', '.popover', '.topbar',
  '.timeline', '.nb-drawer', '.inspector', '.cd-controls', '.title-menu', '#cap-caption',
];

// ───────────────────────── easing ─────────────────────────
export const EASE = {
  linear: (k) => k,
  in: (k) => k * k * k,
  out: (k) => 1 - Math.pow(1 - k, 3),
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  outBack: (k) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
};
const easeFn = (e) => (typeof e === 'function' ? e : EASE[e ?? 'inOut'] ?? EASE.inOut);

// ───────────────────────── registry ─────────────────────────
const REGISTRY = [];
/** Register a shot. shot(name, fn) or shot(name, opts, fn). Returns the definition. */
export function shot(name, opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const def = { name, opts: opts ?? {}, fn };
  REGISTRY.push(def);
  return def;
}
export const registered = () => [...REGISTRY];

// ───────────────────────── save helpers ─────────────────────────
/**
 * Build the localStorage map for a fresh profile.
 * save: { unlockAll?, progress?: string[] | Record<id, LevelProgress>, flags?, settings?, programs?, mapAt? }
 */
export function buildStorage(save, extra = {}) {
  const out = { ...extra };
  if (!save) return Object.keys(out).length ? out : null;
  const progress = {};
  if (Array.isArray(save.progress)) for (const id of save.progress) progress[id] = { done: true, stars: [true, true, true] };
  else Object.assign(progress, save.progress ?? {});
  const flags = { ...(save.flags ?? {}) };
  if (save.unlockAll) flags.unlockAll = true;
  for (const c of save.codex ?? []) flags['codex:' + c] = true;
  const data = {
    v: 1, progress, programs: save.programs ?? {}, slots: save.slots ?? {}, homes: save.homes ?? {},
    settings: { master: 0.8, music: 0.6, sfx: 0.8, voice: 0.5, nerd: false, reducedMotion: false, xrayDefault: false, ...(save.settings ?? {}) },
    flags, endlessBest: save.endlessBest ?? {}, ...(save.mapAt ? { mapAt: save.mapAt } : {}),
  };
  const s = JSON.stringify(data);
  for (const k of ['a', 'b', 'c']) out['np.save.' + k] = s;
  return out;
}

// ───────────────────────── dev server ─────────────────────────
export async function ensureServer(base) {
  const ok = async () => { try { const r = await fetch(base); return r.ok; } catch { return false; } };
  if (await ok()) return null;
  const port = new URL(base).port || '4410';
  const proc = spawn('npx', ['vite', '--port', port, '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
  proc.stdout.on('data', () => {}); proc.stderr.on('data', (d) => process.env.CAP_DEBUG && process.stderr.write(d));
  for (let i = 0; i < 100; i++) { if (await ok()) return proc; await new Promise((r) => setTimeout(r, 200)); }
  proc.kill();
  throw new Error('dev server did not start at ' + base);
}

// ───────────────────────── ffmpeg sink ─────────────────────────
function ffmpegArgs(out, { codec, inFmt, scale }) {
  const input = ['-f', 'image2pipe', '-c:v', inFmt === 'jpeg' ? 'mjpeg' : 'png', '-framerate', String(FPS), '-i', '-'];
  const vf = scale ? ['-vf', `scale=${scale}:flags=lanczos`] : [];
  const enc = {
    ffv1: ['-c:v', 'ffv1', '-level', '3', '-g', '1', '-slices', '12', '-slicecrc', '0', '-threads', '6', '-pix_fmt', 'bgr0'],
    x264rgb: ['-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast', '-pix_fmt', 'rgb24', '-threads', '6'],
    preview: ['-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-threads', '6'],
  }[codec];
  return ['-hide_banner', '-loglevel', 'error', '-y', ...input, ...vf, ...enc, '-r', String(FPS), out];
}
class FfmpegSink {
  constructor(out, opts) {
    this.out = out;
    this.proc = spawn('ffmpeg', ffmpegArgs(out, opts), { stdio: ['pipe', 'ignore', 'pipe'] });
    this.err = '';
    this.proc.stderr.on('data', (d) => { this.err += d; });
    this.done = new Promise((res, rej) => this.proc.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}: ${this.err}`)))));
    this.done.catch(() => {});
    this.bytes = 0;
  }
  async write(buf) {
    this.bytes += buf.length;
    if (!this.proc.stdin.write(buf)) await new Promise((r) => this.proc.stdin.once('drain', r));
  }
  async close() { this.proc.stdin.end(); await this.done; }
}

/** Thrown by tick() when a chunked capture has written its frame range (see run.mjs --chunk). */
export class ChunkDone extends Error { constructor(f) { super('chunk done at frame ' + f); this.chunkDone = true; } }

// ───────────────────────── the Shot (DSL) ─────────────────────────
export class Shot {
  constructor(def, env) {
    this.def = def; this.name = def.name; this.opts = def.opts; this.env = env;
    this.page = env.page; this.cdp = env.cdp;
    this.recording = this.opts.rec !== false; // record from the first goto on
    this.frame = 0;       // frames written to the clip
    this.ticks = 0;       // virtual frames stepped (recorded or not)
    this.events = []; this.layoutSegs = []; this.openLayout = new Map(); this.cameraKeys = []; this.marks = [];
    this.mouse = { x: env.width / 2, y: env.height * 0.62, down: false };
    this.expect = { downs: 0, ups: 0, keys: 0 };
    this.cursorPushed = false;
    this.loaded = false;
    this.t = { step: 0, shot: 0, write: 0 };
  }

  // ── core: advance exactly one virtual frame (1/60 s) and, if recording, grab it ──
  async tick() {
    const t0 = performance.now();
    const res = await this.page.evaluate(([dt, m, layout, expect]) => {
      window.__cap.cursor.set(m.x, m.y, m.down);
      return window.__cap.step(dt, { layout, expect });
    }, [1000 / FPS, this.mouse, this.loaded && this.opts.layout !== false, this.loaded ? this.expect : null]);
    if (res.inputLate > (this.inputLate ?? 0)) { this.inputLate = res.inputLate; this.warn(`input not delivered within 500 ms at frame ${this.frame}`); }
    const t1 = performance.now();
    this.t.step += t1 - t0;
    this.ticks++;
    const f = this.recording ? this.frame : null;
    for (const e of res.events ?? []) {
      const ev = { frame: f, ...e };
      if (ev.lagFrames) { if (ev.frame != null) ev.frame = Math.max(0, ev.frame - ev.lagFrames); ev.vt = +(ev.vt - ev.lagFrames / FPS).toFixed(6); delete ev.lagFrames; }
      this.events.push(ev);
    }
    // virtual clock audit: every tick must be exactly one 1/60 s frame
    if (this.lastVt != null) { const d = res.vt - this.lastVt; this.vtMin = Math.min(this.vtMin ?? d, d); this.vtMax = Math.max(this.vtMax ?? d, d); }
    this.lastVt = res.vt;
    if (this.recording) {
      if (res.layout) this.trackLayout(res.layout);
      const [ra, rb] = this.env.range ?? [0, Infinity];
      if (this.frame >= rb) throw new ChunkDone(this.frame);
      if (this.frame < ra) { this.frame++; return res; }
      const { data } = await this.cdp.send('Page.captureScreenshot', this.env.shotParams);
      const t2 = performance.now();
      this.t.shot += t2 - t1;
      await this.env.sink.write(Buffer.from(data, 'base64'));
      this.t.write += performance.now() - t2;
      this.frame++;
      if (this.env.onFrame) this.env.onFrame(this);
    }
    return res;
  }
  async ticks_(n) { for (let i = 0; i < n; i++) await this.tick(); }
  frames(sec) { return Math.max(0, Math.round(sec * FPS)); }

  trackLayout(lay) {
    const seen = new Set();
    for (const [sel, rects] of Object.entries(lay)) {
      seen.add(sel);
      const key = JSON.stringify(rects);
      const cur = this.openLayout.get(sel);
      if (cur && cur.key === key) { cur.seg.to = this.frame; continue; }
      const seg = { sel, from: this.frame, to: this.frame, rects };
      this.layoutSegs.push(seg); this.openLayout.set(sel, { key, seg });
    }
    for (const sel of [...this.openLayout.keys()]) if (!seen.has(sel)) this.openLayout.delete(sel);
  }

  // ── navigation ──
  /** First call loads the page (off camera until settled); later calls change the hash in-page. */
  async goto(hash, { settle = 0.5, timeout = 20 } = {}) {
    hash = hash.startsWith('#') ? hash : '#' + hash;
    if (!this.loaded) {
      const rec = this.recording; this.recording = false;
      await this.page.goto(this.env.base + '?qa' + queryString(this.opts) + hash, { waitUntil: 'load' });
      // let real async work (fonts, module graph) finish while virtual time ticks
      const t0 = Date.now();
      for (;;) {
        await this.tick();
        const ready = await this.page.evaluate(() => !!window.__capMods && document.fonts.status === 'loaded' && !!document.querySelector('#app *, body > div *'));
        if (ready) break;
        if (Date.now() - t0 > timeout * 1000) throw new Error(`[${this.name}] page did not become ready`);
        await new Promise((r) => setTimeout(r, 10));
      }
      await this.page.evaluate(() => document.fonts.ready);
      // the page now exists: deliver the current cursor position to it (a move sent before load went to about:blank)
      await this.page.mouse.move(this.mouse.x + 1, this.mouse.y);
      await this.page.mouse.move(this.mouse.x, this.mouse.y);
      this.expect = { x: this.mouse.x, y: this.mouse.y, downs: 0, ups: 0, keys: 0 };
      this.env.renderer = await this.page.evaluate(() => { try { const g = document.createElement('canvas').getContext('webgl'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; } catch { return 'unknown'; } });
      if (!this.env.hooked) this.warn('audio hook not installed: events.json will lack audio calls');
      this.loaded = true;
      await this.ticks_(this.frames(settle));
      this.recording = rec;
    } else {
      await this.page.evaluate((h) => { location.hash = h; }, hash);
      await this.ticks_(this.frames(settle));
    }
  }
  /** Hard reload with a new URL (rarely needed). */
  async reload(hash) { this.loaded = false; await this.goto(hash); }

  // ── time ──
  async wait(sec) { await this.ticks_(this.frames(sec)); }
  /** An intentional hold (logged so the freeze-detect QA gate knows it is on purpose). */
  async hold(sec, label = 'hold') { const from = this.frame; await this.wait(sec); this.marks.push({ name: label, kind: 'hold', from, to: this.frame }); }
  /** Step until predicate(page) is truthy. predicate: CSS selector string | () => boolean (runs in page). */
  async waitFor(pred, { timeout = 15, after = 0, poll = 1 } = {}) {
    const fn = typeof pred === 'string' ? (sel) => !!document.querySelector(sel) : pred;
    const arg = typeof pred === 'string' ? pred : undefined;
    const max = this.frames(timeout);
    for (let i = 0; i <= max; i++) {
      if (i % poll === 0 && (await this.page.evaluate(fn, arg))) { await this.wait(after); return i / FPS; }
      await this.tick();
    }
    throw new Error(`[${this.name}] waitFor timed out after ${timeout}s: ${String(pred).slice(0, 120)}`);
  }
  /** Same as waitFor but for events: waits for an audio/dialogue/toast event matching (e) => bool. */
  // Matches the next event after the previously matched one (so an event fired during the click that started
  // it, before this call, still counts).
  async waitForEvent(match, { timeout = 15, after = 0 } = {}) {
    const max = this.frames(timeout);
    for (let i = 0; i <= max; i++) {
      const k = this.events.findIndex((e, j) => j >= (this.evCursor ?? 0) && match(e));
      if (k >= 0) { this.evCursor = k + 1; await this.wait(after); return this.events[k]; }
      await this.tick();
    }
    throw new Error(`[${this.name}] waitForEvent timed out after ${timeout}s`);
  }

  // ── recording control ──
  rec(on = true) { this.recording = !!on; }
  /** Run fn with recording off (virtual time still runs). */
  async offCamera(fn) { const r = this.recording; this.recording = false; try { await fn(this); } finally { this.recording = r; } }
  mark(name, data = {}) { this.marks.push({ name, frame: this.frame, ...data }); }

  // ── cursor + input ──
  async resolvePoint(target, { dx = 0, dy = 0, ax = 0.5, ay = 0.5 } = {}) {
    if (target && typeof target === 'object' && 'x' in target) return { x: target.x + dx, y: target.y + dy };
    if (typeof target === 'function') { const p = await this.page.evaluate(target); return { x: p.x + dx, y: p.y + dy }; }
    const box = await this.box(target);
    if (!box) throw new Error(`[${this.name}] no element for ${target}`);
    return { x: box.x + box.width * ax + dx, y: box.y + box.height * ay + dy };
  }
  async box(sel) {
    const loc = this.page.locator(sel).first();
    if (!(await loc.count())) return null;
    return loc.boundingBox();
  }
  async exists(sel) { return (await this.page.locator(sel).count()) > 0; }
  async moveMouse(x, y) {
    this.mouse.x = x; this.mouse.y = y;
    await this.page.mouse.move(x, y);
    // the page sees integer-rounded-ish client coords; expect what CDP will deliver
    this.expect.x = x; this.expect.y = y;
  }
  /**
   * Glide the cursor to a selector / {x,y} / () => {x,y}. dur in virtual seconds.
   * opts: { dur=0.6, ease='inOut', arc=0.12 (curvature, fraction of distance), dx, dy, ax, ay }
   */
  async cursorTo(target, opts = {}) {
    const { dur = 0.6, arc = 0.12 } = opts;
    const e = easeFn(opts.ease);
    const to = await this.resolvePoint(target, opts);
    const from = { ...this.mouse };
    const n = Math.max(1, this.frames(dur));
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy);
    // a gentle, deterministic arc: control point offset perpendicular to the path
    const side = opts.side ?? (dx >= 0 ? -1 : 1);
    const cx = from.x + dx / 2 + (-dy / (dist || 1)) * dist * arc * side;
    const cy = from.y + dy / 2 + (dx / (dist || 1)) * dist * arc * side;
    for (let i = 1; i <= n; i++) {
      const k = e(i / n), u = 1 - k;
      const x = u * u * from.x + 2 * u * k * cx + k * k * to.x;
      const y = u * u * from.y + 2 * u * k * cy + k * k * to.y;
      await this.moveMouse(x, y);
      await this.tick();
    }
    return to;
  }
  /** Click at the current cursor position (or glide to target first). opts: { hold=0.09, after=0.12, button } */
  async click(target, opts = {}) {
    if (target && !(typeof target === 'object' && !('x' in target) && !target.nodeType && Object.keys(target).every((k) => ['hold', 'after', 'button', 'dur', 'ease'].includes(k)))) {
      await this.cursorTo(target, opts);
    } else if (target && typeof target === 'object') opts = target;
    const { hold = 0.09, after = 0.12, button = 'left' } = opts;
    await this.page.evaluate(([x, y]) => window.__cap.cursor.ripple(x, y), [this.mouse.x, this.mouse.y]);
    this.mouse.down = true;
    await this.page.mouse.down({ button }); this.expect.downs++;
    await this.ticks_(Math.max(1, this.frames(hold)));
    this.mouse.down = false;
    await this.page.mouse.up({ button }); this.expect.ups++;
    await this.wait(after);
  }
  /**
   * A visual click (glide + press animation + ripple) WITHOUT sending input; then action(page) runs in the page.
   * For forcing a specific outcome behind a real-looking click, e.g. tap(RUN, () => __np.runNight('zero', [...])).
   */
  async tap(target, action, opts = {}) {
    if (target) await this.cursorTo(target, opts);
    await this.page.evaluate(([x, y]) => window.__cap.cursor.ripple(x, y), [this.mouse.x, this.mouse.y]);
    this.mouse.down = true; await this.ticks_(Math.max(1, this.frames(opts.hold ?? 0.09)));
    this.mouse.down = false;
    const r = action ? await this.page.evaluate(action, opts.arg) : undefined;
    await this.wait(opts.after ?? 0.12);
    return r;
  }
  /** Press-move-release. a/b: selector | {x,y}. opts: { dur=0.8, ease, pre=0.5 (glide to a), hold=0.12 } */
  async drag(a, b, opts = {}) {
    const { dur = 0.8, pre = 0.5, hold = 0.12 } = opts;
    await this.cursorTo(a, { dur: pre });
    await this.page.evaluate(([x, y]) => window.__cap.cursor.ripple(x, y), [this.mouse.x, this.mouse.y]);
    this.mouse.down = true;
    await this.page.mouse.down(); this.expect.downs++;
    await this.wait(hold);
    await this.cursorTo(b, { dur, ease: opts.ease ?? 'inOut', arc: opts.arc ?? 0.06 });
    await this.wait(hold);
    this.mouse.down = false;
    await this.page.mouse.up(); this.expect.ups++;
    await this.wait(0.1);
  }
  /** Type text with a steady rhythm (cps chars per virtual second). Focus a field first (click it). */
  async type(text, { cps = 16, jitter = 0.35 } = {}) {
    let acc = 0;
    for (let i = 0; i < text.length; i++) {
      await this.page.keyboard.type(text[i]); this.expect.keys++;
      // deterministic rhythm: a fixed pseudo-random spread around 1/cps
      const r = Math.sin((i + 1) * 12.9898) * 43758.5453; const fr = r - Math.floor(r);
      acc += (1 / cps) * (1 + (fr - 0.5) * 2 * jitter);
      const n = Math.round(acc * FPS); acc -= n / FPS;
      await this.ticks_(n);
    }
  }
  async key(k, { after = 0.15 } = {}) { await this.page.keyboard.press(k); this.expect.keys++; await this.wait(after); }
  async scrollWheel(dy, { at, dur = 0.5 } = {}) {
    if (at) await this.cursorTo(at, { dur: 0.3 });
    const n = Math.max(1, this.frames(dur));
    for (let i = 0; i < n; i++) { await this.page.mouse.wheel(0, dy / n); await this.tick(); }
  }
  async showCursor(on = true, { snap = false } = {}) {
    await this.page.evaluate(([v, s]) => { window.__cap.cursor.show(v); if (s) window.__cap.cursor.snapAlpha(); }, [on, snap]);
  }
  /** Teleport the cursor (no glide), e.g. before the shot starts. */
  async placeCursor(target, opts) { const p = await this.resolvePoint(target, opts); await this.moveMouse(p.x, p.y); }

  // ── page helpers ──
  async eval(fn, arg) { return this.page.evaluate(fn, arg); }
  /** Run fn(window.__np, arg) in the page. */
  async np(fn, arg) { return this.page.evaluate(([src, a]) => (0, eval)(`(${src})`)(window.__np, a), [fn.toString(), arg]); }
  async hideDialogue(on = true) { await this.page.evaluate((v) => window.__cap.setHideDialogue(v), on); }
  async css(text) { await this.page.evaluate((t) => window.__cap.setExtraCss(t), text); }
  /** Click through any open dialogue without the on-screen cursor (DOM clicks). */
  async skipDialogue({ max = 40, gap = 0.05 } = {}) {
    for (let i = 0; i < max; i++) {
      const open = await this.page.evaluate(() => { const d = document.querySelector('.dialogue'); if (d) d.click(); return !!d; });
      if (!open) return;
      await this.wait(gap);
    }
  }
  /** Pause / resume the level's night playback via the ?qa freeze hook. */
  async freeze(on = true) { await this.page.evaluate((v) => { if (window.__np) window.__np.freeze = v; }, on); }
  /** The level's reference solution as text: { bedtime?, morning? } */
  async solution(id) {
    return this.page.evaluate((id) => {
      const L = window.__np.LEVELS.find((l) => l.id === id); const q = window.__np.quantum; const out = {};
      if (L.solution.bedtime) out.bedtime = q.printProgram(L.solution.bedtime);
      if (L.solution.morning) out.morning = q.printProgram(L.solution.morning);
      return out;
    }, id);
  }
  /**
   * Load programs through the Text modal. progs: { bedtime?, morning? } (text form).
   * onCamera: glide + click the buttons visibly; typing: type the text instead of pasting it.
   */
  async loadProgram(progs, { onCamera = true, typing = false, cps = 30 } = {}) {
    const open = '.editor-foot button:has-text("Text")';
    if (onCamera) await this.click(open, { dur: 0.6 }); else await this.page.evaluate((s) => { const b = [...document.querySelectorAll('.editor-foot button')].find((x) => x.textContent.includes('Text')); b?.click(); }, open);
    await this.waitFor('.modal textarea', { timeout: 3 });
    await this.wait(onCamera ? 0.3 : 0);
    const heads = await this.page.$$eval('.modal .display', (els) => els.map((e) => e.textContent.toLowerCase()));
    const n = await this.page.locator('.modal textarea').count();
    for (let i = 0; i < n; i++) {
      const ph = heads[i]?.includes('bed') ? 'bedtime' : heads[i]?.includes('morn') ? 'morning' : n === 1 ? (progs.morning !== undefined ? 'morning' : 'bedtime') : i === 0 ? 'bedtime' : 'morning';
      const txt = progs[ph] ?? '';
      const ta = this.page.locator('.modal textarea').nth(i);
      if (typing && onCamera) {
        await this.click(`.modal textarea >> nth=${i}`, { dur: 0.4 });
        await ta.fill('');
        await this.type(txt, { cps });
      } else {
        await ta.fill(txt);
      }
      if (onCamera) await this.wait(0.25);
    }
    if (onCamera) await this.click('.modal button:has-text("Load")', { dur: 0.5 });
    else await this.page.evaluate(() => [...document.querySelectorAll('.modal button')].find((x) => x.textContent.includes('Load'))?.click());
    await this.wait(0.2);
  }

  // ── camera metadata (for the editor's push-ins; nothing is cropped at capture time) ──
  /**
   * Add a camera keyframe at the current frame. rect: [x,y,w,h] in 1920×1080 CSS px | selector | 'full'.
   * opts: { pad=60, ease='inOutSine', at=<frame offset> }. Rects are widened to 16:9.
   */
  async camera(rect, opts = {}) {
    let r;
    if (rect === 'full') r = [0, 0, this.env.width, this.env.height];
    else if (Array.isArray(rect)) r = rect;
    else { const b = await this.box(rect); if (!b) throw new Error('camera: no element ' + rect); const p = opts.pad ?? 60; r = [b.x - p, b.y - p, b.width + 2 * p, b.height + 2 * p]; }
    // widen to 16:9 around the centre, clamp inside the frame
    let [x, y, w, h] = r; const A = this.env.width / this.env.height;
    if (w / h < A) { const nw = h * A; x -= (nw - w) / 2; w = nw; } else { const nh = w / A; y -= (nh - h) / 2; h = nh; }
    w = Math.min(w, this.env.width); h = Math.min(h, this.env.height);
    x = Math.max(0, Math.min(this.env.width - w, x)); y = Math.max(0, Math.min(this.env.height - h, y));
    this.cameraKeys.push({ frame: this.frame + (opts.at ?? 0), rect: [x, y, w, h].map((v) => +v.toFixed(1)), ease: opts.ease ?? 'inOutSine' });
  }

  warn(msg) { (this.env.warnings ??= []).push(msg); console.warn(`[${this.name}] ${msg}`); }
}

// ───────────────────────── post-processing ─────────────────────────
function summariseEvents(events) {
  const dialogue = new Map(), toasts = [];
  for (const e of events) {
    if (e.type === 'dialogue_show') dialogue.set(e.id, { id: e.id, who: e.who, name: e.name, show: e.frame, showVt: e.vt });
    else if (e.type === 'dialogue_typed') { const d = dialogue.get(e.id); if (d) { d.typed = e.frame; d.text = e.text; } }
    else if (e.type === 'dialogue_hide') { const d = dialogue.get(e.id); if (d) { d.hide = e.frame; d.text = d.text || e.text; } }
    else if (e.type === 'toast_show') toasts.push({ text: e.text, cls: e.cls, show: e.frame });
    else if (e.type === 'toast_hide') { const t = toasts.find((x) => x.text === e.text && x.hide === undefined); if (t) t.hide = e.frame; }
  }
  // collapse per-character voice calls into one entry per spoken line
  const voiceLines = []; let cur = null;
  for (const e of events) {
    if (e.type !== 'voice') continue;
    if (e.i === 0 || !cur || cur.who !== e.who) { cur = { who: e.who, first: e.frame, last: e.frame, chars: e.n, firstVt: e.vt }; voiceLines.push(cur); }
    cur.last = e.frame;
  }
  return { dialogue: [...dialogue.values()], toasts, voiceLines };
}

// ───────────────────────── runner ─────────────────────────
export async function runShots(defs = registered(), o = {}) {
  const opts = {
    outDir: o.outDir ?? path.join(ROOT, 'videos/capture'),
    base: o.base ?? process.env.CAP_BASE ?? 'http://127.0.0.1:4410/',
    // docs/VIDEO_RESOURCES.md: one browser per job, one heavy job at a time → serial by default
    jobs: 1, // one render per process (docs/VIDEO_RESOURCES.md); parallelism = run.mjs lanes, each its own --heavy job
    preview: o.preview ?? false,
    codec: o.codec ?? (o.preview ? 'preview' : 'ffv1'),
    format: o.format ?? (o.preview ? 'jpeg' : 'png'),
    quality: o.quality ?? 95,
    scale: o.scale ?? (o.preview ? 1 : 2),
    only: o.only,
    headless: o.headless ?? true,
    range: o.range ?? null,
    part: o.part ?? null,
  };
  if (opts.only) defs = defs.filter((d) => opts.only.some((p) => d.name === p || d.name.includes(p)));
  if (!defs.length) throw new Error('no shots to run');
  fs.mkdirSync(opts.outDir, { recursive: true });
  const server = await ensureServer(opts.base);
  const queue = [...defs];
  const results = [];
  const tStart = Date.now();
  const worker = async (wi) => {
    const browser = await chromium.launch({
      headless: opts.headless,
      args: [
        '--hide-scrollbars', '--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows', '--mute-audio', '--font-render-hinting=none', '--disable-lcd-text',
        // MANDATORY (docs/VIDEO_RESOURCES.md): software rendering only. The real iGPU shares system RAM and froze the machine.
        '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=2048',
      ],
    });
    try {
      while (queue.length) {
        const def = queue.shift();
        try { results.push(await runOne(browser, def, opts, wi)); }
        catch (e) { console.error(`[${def.name}] FAILED: ${e.stack || e}`); results.push({ name: def.name, error: String(e.message || e) }); }
      }
    } finally { await browser.close(); }
  };
  await Promise.all(Array.from({ length: Math.min(opts.jobs, defs.length) }, (_, i) => worker(i)));
  if (server) server.kill();
  const wall = (Date.now() - tStart) / 1000;
  const totalFrames = results.reduce((a, r) => a + (r.frames || 0), 0);
  console.log(`\n${results.length} shot(s), ${totalFrames} frames in ${wall.toFixed(1)} s wall → ${(totalFrames / wall).toFixed(2)} fps aggregate (jobs=${opts.jobs})`);
  return { results, wall, totalFrames, aggregateFps: totalFrames / wall };
}

async function runOne(browser, def, opts, wi) {
  const W = def.opts.width ?? 1920, H = def.opts.height ?? 1080;
  const scale = def.opts.scale ?? opts.scale;
  if (!(scale > 0 && scale <= 2)) throw new Error(`deviceScaleFactor ${scale} not allowed (docs/VIDEO_RESOURCES.md: ≤ 2)`);
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale, reducedMotion: 'no-preference', colorScheme: 'light', locale: 'en-US', timezoneId: 'Asia/Kolkata' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  const env = { page, base: opts.base, width: W, height: H, hooked: false };
  // cut the Vite HMR socket: an edit to the game's source must never hot-reload a page mid-capture
  await context.routeWebSocket(/.*/, () => { /* swallowed: no server connection, no HMR messages */ });
  // inject the audio hook into the dev-served main.ts (imports are hoisted, so this runs before any screen)
  await context.route(/\/src\/main\.ts(\?.*)?$/, async (route) => {
    const resp = await route.fetch();
    let body = await resp.text();
    if (/\baudio\b/.test(body)) { body = 'window.__capHook && window.__capHook({ audio, art, quantum, LEVELS, nav });\n' + body; env.hooked = true; }
    await route.fulfill({ response: resp, body });
  });
  const cfg = {
    seed: def.opts.seed ?? hashStr(def.name),
    hideDialogue: !!def.opts.hideDialogue,
    cursor: def.opts.cursor !== false,
    showCaret: !!def.opts.showCaret,
    layoutSelectors: def.opts.layoutSelectors ?? DEFAULT_LAYOUT,
    storage: buildStorage(def.opts.save, def.opts.localStorage) ?? {},
    extraCss: def.opts.css ?? '',
  };
  await page.addInitScript(`(${SHIM_SRC.replace(/^[\s\S]*?(function __npCaptureShim)/, '$1')})(${JSON.stringify(cfg)});`);
  const cdp = await context.newCDPSession(page);
  env.cdp = cdp;
  // Emulation overrides are per CDP session: without this, Page.captureScreenshot on our own session returns
  // CSS-pixel (1920×1080) frames even though the page renders at DPR 2. With it we get true 3840×2160 device pixels.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: scale, mobile: false });
  const ext = def.opts.codec ?? opts.codec;
  const fmt = def.opts.format ?? opts.format;
  env.shotParams = fmt === 'jpeg' ? { format: 'jpeg', quality: opts.quality, optimizeForSpeed: true, fromSurface: true } : { format: 'png', optimizeForSpeed: true, fromSurface: true };
  const file = path.join(opts.outDir, `${def.name}${opts.part != null ? `.part${String(opts.part).padStart(3, '0')}` : ''}.${ext === 'preview' ? 'mp4' : 'mkv'}`);
  env.range = opts.range;
  env.sink = new FfmpegSink(file, { codec: ext, inFmt: fmt });
  const s = new Shot(def, env);
  const t0 = Date.now();
  let lastLog = t0;
  env.onFrame = (sh) => {
    if (Date.now() - lastLog > 5000) { lastLog = Date.now(); console.log(`  [w${wi}] ${def.name}: ${sh.frame} frames, ${(sh.frame / ((Date.now() - t0) / 1000)).toFixed(2)} fps`); }
  };
  console.log(`[w${wi}] ▶ ${def.name}`);
  let chunkDone = false;
  try {
    await def.fn(s);
  } catch (e) {
    if (!e?.chunkDone) throw e;
    chunkDone = true; // this chunk's frame range is written; a later chunk runs the shot to its end
  } finally {
    await env.sink.close().catch((e) => s.warn(String(e)));
    await context.close();
  }
  const secs = (Date.now() - t0) / 1000;
  const base = path.join(opts.outDir, def.name);
  if (chunkDone) {
    const written = Math.min(s.frame, opts.range[1]) - opts.range[0];
    console.log(`[w${wi}] ✔ ${def.name} part ${opts.part}: frames ${opts.range[0]}–${opts.range[1] - 1} (${written}) in ${secs.toFixed(1)}s; per frame step ${(s.t.step / Math.max(1, s.ticks)).toFixed(1)} ms, screenshot ${(s.t.shot / Math.max(1, written)).toFixed(1)} ms, write ${(s.t.write / Math.max(1, written)).toFixed(1)} ms`);
    return { name: def.name, part: opts.part, range: opts.range, complete: false, written, frames: written, wallSeconds: secs };
  }
  const summary = summariseEvents(s.events);
  const meta = {
    name: def.name, file: opts.part != null ? `${def.name}.mkv` : path.basename(file), fps: FPS, frames: s.frame, complete: true, part: opts.part, range: opts.range, duration: +(s.frame / FPS).toFixed(4),
    size: [W * scale, H * scale], css: [W, H], scale, codec: ext, input: fmt, seed: cfg.seed,
    marks: s.marks, ticks: s.ticks, vtStep: { min: s.vtMin, max: s.vtMax }, wallSeconds: +secs.toFixed(2), fps_capture: +(s.frame / secs).toFixed(3),
    timing_ms_per_frame: { step: +(s.t.step / Math.max(1, s.ticks)).toFixed(2), screenshot: +(s.t.shot / Math.max(1, s.frame)).toFixed(2), write: +(s.t.write / Math.max(1, s.frame)).toFixed(2) },
    bytes: env.sink.bytes, audioHook: env.hooked, renderer: env.renderer, pageErrors: errors.slice(0, 50), warnings: env.warnings ?? [],
    options: { save: def.opts.save ?? null, hideDialogue: cfg.hideDialogue, cursor: cfg.cursor, url: '?qa' + queryString(def.opts) },
  };
  fs.writeFileSync(base + '.meta.json', JSON.stringify(meta, null, 1));
  fs.writeFileSync(base + '.events.json', JSON.stringify({ shot: def.name, fps: FPS, frames: s.frame, note: 'frame = index in the clip (null = off camera); vt = virtual seconds since page start', ...summary, events: s.events }, null, 1));
  fs.writeFileSync(base + '.layout.json', JSON.stringify({ shot: def.name, fps: FPS, frames: s.frame, coords: `CSS px in a ${W}x${H} frame (multiply by ${scale} for the capture pixels)`, segments: s.layoutSegs }, null, 1));
  if (s.cameraKeys.length) fs.writeFileSync(base + '.camera.json', JSON.stringify({ shot: def.name, fps: FPS, frame: [W, H], keyframes: s.cameraKeys }, null, 1));
  console.log(`[w${wi}] ✔ ${def.name}: ${s.frame} frames (${meta.duration}s) in ${secs.toFixed(1)}s → ${meta.fps_capture} fps; per frame step ${meta.timing_ms_per_frame.step} ms, screenshot ${meta.timing_ms_per_frame.screenshot} ms, write ${meta.timing_ms_per_frame.write} ms`);
  if (errors.length) console.log(`  page errors/warnings: ${errors.length} (see meta.json)`);
  return meta;
}

/** opts.cinema: true | { camera, hud, toasts, dialogue, insert, part }; opts.query: extra params (object or 'a=1&b=2'). */
export function queryString(o) {
  const q = new URLSearchParams();
  if (o.cinema) { q.set('cinema', '1'); if (typeof o.cinema === 'object') for (const [k, v] of Object.entries(o.cinema)) if (v != null && v !== false) q.set(k, v === true ? '1' : String(v)); }
  if (o.query) for (const [k, v] of Object.entries(typeof o.query === 'string' ? Object.fromEntries(new URLSearchParams(o.query)) : o.query)) q.set(k, String(v));
  const s = q.toString();
  return s ? '&' + s : '';
}

function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
