/*
 * NO PEEKING! capture shim. Installed with page.addInitScript BEFORE any game code runs.
 *
 * Replaces every clock the game can see with a virtual clock that only moves when the recorder
 * calls  window.__cap.step(dtMs). Nothing in the page advances in real time any more:
 *   performance.now, Date.now, new Date(), requestAnimationFrame / cancelAnimationFrame,
 *   setTimeout / setInterval / clear*, Math.random (seeded), CSS animations + transitions
 *   (Web Animations API: paused and seeked to virtual time every frame), smooth scrolling.
 * WebAudio is disabled (AudioContext = undefined): the game's audio engine then stays a no-op,
 * and we log every call to it instead (see __capHook, injected into /src/main.ts by the recorder).
 *
 * Also draws the custom cursor overlay, samples layout boxes and collects the event log.
 * Must be self-contained: Playwright serialises this whole function into the page.
 */
// eslint-disable-next-line no-unused-vars
function __npCaptureShim(cfg) {
  if (window.__cap) return;
  const W = window;
  const real = {
    setTimeout: W.setTimeout.bind(W), clearTimeout: W.clearTimeout.bind(W),
    perfNow: performance.now.bind(performance), Date: W.Date,
  };

  // ───────────── virtual clock ─────────────
  const PERF0 = 1000; // virtual performance.now() at install (ms)
  const DATE0 = cfg.date0 ?? Date.UTC(2026, 9, 3, 20, 30, 0); // a fixed evening
  let now = PERF0;
  const vnow = () => now;
  performance.now = vnow;
  const RealDate = real.Date;
  function VDate(...a) {
    if (!new.target) return new RealDate(DATE0 + (now - PERF0)).toString();
    return a.length ? new RealDate(...a) : new RealDate(DATE0 + (now - PERF0));
  }
  VDate.prototype = RealDate.prototype;
  VDate.now = () => Math.floor(DATE0 + (now - PERF0));
  VDate.parse = RealDate.parse; VDate.UTC = RealDate.UTC;
  W.Date = VDate;

  // seeded Math.random (mulberry32) so every take is identical
  let seed = (cfg.seed >>> 0) || 0x9e3779b9;
  Math.random = function () {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // timers
  const timers = new Map(); // id → { fn, args, at, every, seq, nest }
  let nextId = 1, seqN = 0, nesting = 0;
  function addTimer(fn, d, args, repeat) {
    const id = nextId++;
    let delay = Math.max(0, Number(d) || 0);
    if (nesting >= 5 && delay < 4) delay = 4; // HTML spec clamp: prevents setTimeout(0) storms locking a step
    if (repeat && delay < 1) delay = 1;
    timers.set(id, { fn, args, at: now + delay, every: repeat ? delay : 0, seq: seqN++, nest: nesting + 1 });
    return id;
  }
  W.setTimeout = function (fn, d, ...args) { return addTimer(fn, d, args, false); };
  W.setInterval = function (fn, d, ...args) { return addTimer(fn, d, args, true); };
  W.clearTimeout = W.clearInterval = function (id) { timers.delete(id); };

  // rAF
  let rafQ = new Map(), rafId = 1;
  W.requestAnimationFrame = function (cb) { const id = rafId++; rafQ.set(id, cb); return id; };
  W.cancelAnimationFrame = function (id) { rafQ.delete(id); };

  // macrotask hop (drains microtasks between callbacks, like a real event loop; MessageChannel = no 4 ms clamp)
  const mc = new MessageChannel(); const hopQ = [];
  mc.port1.onmessage = () => { const r = hopQ.shift(); r && r(); };
  const hop = () => new Promise((r) => { hopQ.push(r); mc.port2.postMessage(0); });

  function nextDue(limit) {
    let best = null, bid = 0;
    for (const [id, t] of timers) if (t.at <= limit && (!best || t.at < best.at || (t.at === best.at && t.seq < best.seq))) { best = t; bid = id; }
    return best ? [bid, best] : null;
  }
  function call(fn, args) {
    try { typeof fn === 'function' ? fn(...args) : (0, eval)(String(fn)); } catch (e) { console.error(e); }
  }

  // ───────────── smooth scrolling on the virtual clock ─────────────
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const scrollTweens = new Map(); // element → { fx, fy, tx, ty, t0, dur }
  function scrollerChain(el) {
    const out = []; let p = el.parentElement;
    while (p) { if (p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth) out.push(p); p = p.parentElement; }
    const se = document.scrollingElement; if (se && !out.includes(se)) out.push(se);
    return out;
  }
  const origSIV = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (arg) {
    if (!(arg && typeof arg === 'object' && arg.behavior === 'smooth')) return origSIV.call(this, arg);
    const chain = scrollerChain(this);
    const before = chain.map((s) => [s.scrollLeft, s.scrollTop]);
    origSIV.call(this, { ...arg, behavior: 'instant' });
    chain.forEach((s, i) => {
      const tx = s.scrollLeft, ty = s.scrollTop;
      if (tx === before[i][0] && ty === before[i][1]) return;
      s.scrollLeft = before[i][0]; s.scrollTop = before[i][1];
      scrollTweens.set(s, { fx: before[i][0], fy: before[i][1], tx, ty, t0: now, dur: 380 });
    });
  };
  for (const proto of [Element.prototype]) {
    for (const k of ['scrollTo', 'scroll', 'scrollBy']) {
      const orig = proto[k];
      proto[k] = function (a, b) {
        if (!(a && typeof a === 'object' && a.behavior === 'smooth')) return orig.call(this, a, b);
        const fx = this.scrollLeft, fy = this.scrollTop;
        orig.call(this, { ...a, behavior: 'instant' });
        const tx = this.scrollLeft, ty = this.scrollTop;
        this.scrollLeft = fx; this.scrollTop = fy;
        scrollTweens.set(this, { fx, fy, tx, ty, t0: now, dur: 380 });
      };
    }
  }
  function runScrollTweens() {
    for (const [el, tw] of scrollTweens) {
      const k = Math.min(1, (now - tw.t0) / tw.dur), e = ease(k);
      el.scrollLeft = tw.fx + (tw.tx - tw.fx) * e; el.scrollTop = tw.fy + (tw.ty - tw.fy) * e;
      if (k >= 1) scrollTweens.delete(el);
    }
  }

  // ───────────── CSS animations / transitions on the virtual clock ─────────────
  const animStart = new WeakMap();
  let animCount = 0;
  function driveAnimations() {
    let n = 0;
    for (const a of document.getAnimations()) {
      n++;
      let st = animStart.get(a);
      if (st === undefined) {
        // first sight (created by the step / input that just ran): its local time starts now
        st = now; animStart.set(a, st);
        try { a.pause(); } catch { /* ignore */ }
      }
      const rate = a.playbackRate || 1;
      try { a.currentTime = (now - st) * rate; } catch { /* ignore */ }
    }
    animCount = n;
  }

  // ───────────── WebAudio off (no stalls, no real-time scheduling) ─────────────
  if (cfg.muteAudio !== false) {
    try { W.AudioContext = undefined; W.webkitAudioContext = undefined; } catch { /* ignore */ }
  }

  // ───────────── event log ─────────────
  const events = [];
  const log = (type, data) => events.push({ type, vt: +(now / 1000).toFixed(6), ...data });
  W.__capHook = function (mods) {
    const a = mods && mods.audio;
    if (!a || a.__capWrapped) return;
    a.__capWrapped = true;
    const wrap = (name, toData) => {
      const orig = a[name]; if (typeof orig !== 'function') return;
      a[name] = function (...args) {
        try { log(name, toData(...args)); } catch { /* ignore */ }
        return orig.apply(this, args);
      };
    };
    wrap('sfx', (name, opts) => ({ name, opts: opts ? { ...opts } : {} }));
    wrap('botNote', (bot, result) => ({ bot, result }));
    wrap('syndromeChord', (bits) => ({ bits: [...bits] }));
    wrap('voice', (who, ch, i, line) => ({ who, ch, i, n: typeof line === 'string' ? line.length : 0 }));
    wrap('setScene', (scene) => ({ scene }));
    wrap('setTension', (v) => ({ value: v }));
    wrap('setHarmony', (v) => ({ value: v }));
    W.__capMods = mods;
  };
  W.addEventListener('hashchange', () => log('route', { hash: location.hash }));

  // dialogue lines + toasts, via DOM observation
  const dlgEls = new WeakMap(), toastEls = new WeakMap();
  let dlgSeq = 0;
  function scanAdded(node) {
    if (!(node instanceof Element)) return;
    const list = [];
    if (node.matches('.dialogue')) list.push(node);
    list.push(...node.querySelectorAll('.dialogue'));
    for (const d of list) {
      if (dlgEls.has(d)) continue;
      const who = [...d.classList].find((c) => c.startsWith('who-'))?.slice(4) ?? '';
      const id = ++dlgSeq; dlgEls.set(d, id);
      log('dialogue_show', { id, who, name: d.querySelector('.who')?.textContent ?? '' });
    }
    const ts = [];
    if (node.matches('.toast')) ts.push(node);
    ts.push(...node.querySelectorAll('.toast'));
    for (const t of ts) { if (!toastEls.has(t)) { toastEls.set(t, 1); log('toast_show', { text: t.textContent, cls: t.className }); } }
    if (node.matches('.win-card') || node.querySelector('.win-card')) log('win_card', {});
    if (node.matches('.modal-back')) log('modal_show', { text: (node.textContent || '').slice(0, 80) });
  }
  function scanRemoved(node) {
    if (!(node instanceof Element)) return;
    const ds = node.matches('.dialogue') ? [node] : [...node.querySelectorAll('.dialogue')];
    for (const d of ds) if (dlgEls.has(d)) log('dialogue_hide', { id: dlgEls.get(d), text: d.querySelector('.text')?.textContent ?? '' });
    const ts = node.matches('.toast') ? [node] : [...node.querySelectorAll('.toast')];
    for (const t of ts) if (toastEls.has(t)) log('toast_hide', { text: t.textContent });
  }
  // text completion of the dialogue typewriter: checked every step
  function checkTyping() {
    for (const d of document.querySelectorAll('.dialogue')) {
      const id = dlgEls.get(d); if (!id || d.__capTyped) continue;
      // typewriter = 1 char / 22 ms, so a step can add 0 chars: call it typed once the text is stable for 4 steps
      const t = d.querySelector('.text')?.textContent ?? '';
      if (d.__capLast !== t) { d.__capLast = t; d.__capStable = 0; d.__capChangedVt = now; continue; }
      if (t.length && ++d.__capStable >= 4) { d.__capTyped = true; log('dialogue_typed', { id, text: t, lagFrames: 4 }); }
    }
  }
  // program highlight: log every card that becomes .current (the line the caretaker / bots are executing)
  const cardInfo = (c) => {
    const op = [...c.classList].find((k) => k.startsWith('op-'))?.slice(3) ?? '';
    const list = c.closest('.prog-list');
    return { op, line: +(c.querySelector('.line-no')?.textContent ?? 0) || null, phase: list?.dataset.phase ?? null, text: (c.textContent || '').replace(/\s+/g, ' ').replace(/×$/, '').trim().slice(0, 60) };
  };
  const curSeen = new WeakSet();
  const checkCurrent = (el) => {
    if (!(el instanceof Element) || !el.classList.contains('card')) return;
    if (el.classList.contains('current')) { if (!curSeen.has(el)) { curSeen.add(el); log('card_current', cardInfo(el)); } }
    else curSeen.delete(el);
  };
  const mo = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'attributes') { checkCurrent(m.target); continue; }
      m.addedNodes.forEach(scanAdded); m.removedNodes.forEach(scanRemoved);
      m.addedNodes.forEach((n) => { if (n instanceof Element) { checkCurrent(n); n.querySelectorAll?.('.card.current').forEach(checkCurrent); } });
    }
  });
  const startObs = () => mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  if (document.documentElement) startObs(); else document.addEventListener('DOMContentLoaded', startObs);

  // ───────────── capture-only CSS ─────────────
  const css = document.createElement('style');
  css.id = 'cap-css';
  function setCss() {
    css.textContent = [
      '*{scroll-behavior:auto!important}',
      cfg.showCaret ? '' : '*{caret-color:transparent!important}', // the native caret blinks on a real-time clock
      cfg.hideDialogue ? '.dialogue{visibility:hidden!important}' : '',
      cfg.extraCss || '',
    ].join('\n');
  }
  setCss();
  const addCss = () => (document.head || document.documentElement).appendChild(css);
  if (document.documentElement) addCss(); else document.addEventListener('DOMContentLoaded', addCss);

  // ───────────── cursor overlay ─────────────
  const cur = { x: -100, y: -100, down: false, visible: cfg.cursor !== false, alpha: cfg.cursor !== false ? 1 : 0, scale: 1, ripples: [] };
  let curEl = null, curInner = null;
  const SVG = `<svg width="44" height="52" viewBox="0 0 44 52" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block">
    <defs><filter id="capsh" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.6"/><feOffset dx="1.5" dy="3.5"/><feComponentTransfer><feFuncA type="linear" slope="0.38"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g filter="url(#capsh)">
      <path d="M3 2.5 C3 1.4 4.2 0.8 5.1 1.5 L33.5 23.6 C34.5 24.4 34 26 32.7 26.1 L20.6 27.1 C20 27.15 19.5 27.45 19.15 27.95 L12.3 37.9 C11.6 38.9 10 38.5 9.9 37.3 Z"
        fill="#1d1a2b" stroke="#f7f4ec" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M7.2 7.5 L8.6 30" stroke="#6c63ff" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/>
    </g></svg>`;
  function ensureCursor() {
    if (curEl && curEl.isConnected) return;
    if (!document.documentElement) return;
    curEl = document.createElement('div');
    curEl.id = 'cap-cursor';
    curEl.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;will-change:transform';
    curInner = document.createElement('div');
    curInner.style.cssText = 'position:absolute;left:-3px;top:-1.5px;transform-origin:3px 2px';
    curInner.innerHTML = SVG;
    curEl.appendChild(curInner);
    document.documentElement.appendChild(curEl);
  }
  function drawCursor() {
    ensureCursor(); if (!curEl) return;
    const target = cur.visible ? 1 : 0;
    cur.alpha += (target - cur.alpha) * 0.25; if (Math.abs(target - cur.alpha) < 0.01) cur.alpha = target;
    const ts = cur.down ? 0.86 : 1;
    cur.scale += (ts - cur.scale) * 0.45;
    curEl.style.transform = `translate(${cur.x}px,${cur.y}px)`;
    curEl.style.opacity = String(cur.alpha);
    curInner.style.transform = `scale(${cur.scale.toFixed(4)})`;
    // ripples: two soft rings (ink + lilac), 520 ms, ease-out
    cur.ripples = cur.ripples.filter((r) => now - r.t0 < 560);
    for (const r of cur.ripples) {
      if (!r.el) {
        r.el = document.createElement('div');
        r.el.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none';
        r.el.innerHTML = '<div style="position:absolute;border-radius:50%;border:3px solid #6c63ff"></div><div style="position:absolute;border-radius:50%;background:rgba(108,99,255,0.22)"></div>';
        curEl.insertBefore(r.el, curInner);
      }
      const k = Math.min(1, (now - r.t0) / 520), e = 1 - Math.pow(1 - k, 3);
      const R1 = 8 + 30 * e, R2 = 6 + 18 * e;
      r.el.style.transform = `translate(${r.x - cur.x}px,${r.y - cur.y}px)`;
      const [ring, dot] = r.el.children;
      ring.style.cssText = `position:absolute;border-radius:50%;border:${(3 * (1 - k) + 0.6).toFixed(2)}px solid #6c63ff;left:${-R1}px;top:${-R1}px;width:${2 * R1}px;height:${2 * R1}px;opacity:${(1 - k).toFixed(3)};box-sizing:border-box`;
      dot.style.cssText = `position:absolute;border-radius:50%;background:rgba(108,99,255,0.25);left:${-R2}px;top:${-R2}px;width:${2 * R2}px;height:${2 * R2}px;opacity:${(1 - e).toFixed(3)}`;
    }
    for (const el of [...curEl.children]) if (el !== curInner && !cur.ripples.some((r) => r.el === el)) el.remove();
  }

  // ───────────── layout sampling ─────────────
  const LAYOUT = cfg.layoutSelectors || [];
  function sampleLayout() {
    const out = {};
    for (const sel of LAYOUT) {
      const els = document.querySelectorAll(sel);
      const rs = [];
      for (const el of els) {
        if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
        rs.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]);
      }
      if (rs.length) out[sel] = rs;
    }
    return out;
  }

  // ───────────── step ─────────────
  let stepping = false, frames = 0;
  // input sync: Chrome delivers mouse moves rAF-aligned on its REAL frame clock, so a CDP move may land after the
  // step that should see it. The recorder passes what it sent; we wait (real time) until the page has handled it.
  const inp = { x: NaN, y: NaN, downs: 0, ups: 0, keys: 0 };
  W.addEventListener('pointermove', (e) => { inp.x = e.clientX; inp.y = e.clientY; }, true);
  W.addEventListener('pointerdown', () => { inp.downs++; }, true);
  W.addEventListener('pointerup', () => { inp.ups++; }, true);
  W.addEventListener('keydown', () => { inp.keys++; }, true);
  async function syncInput(ex) {
    if (!ex) return true;
    const ok = () => (ex.x == null || (Math.abs(inp.x - ex.x) < 0.51 && Math.abs(inp.y - ex.y) < 0.51)) &&
      (ex.downs == null || inp.downs >= ex.downs) && (ex.ups == null || inp.ups >= ex.ups) && (ex.keys == null || inp.keys >= ex.keys);
    const t0 = real.perfNow();
    while (!ok()) { if (real.perfNow() - t0 > 500) return false; await new Promise((r) => real.setTimeout(r, 1)); }
    return true;
  }
  let inputLate = 0;
  // quietBubbles: drop the playback's idle/caretaker think bubbles ("nope, next ↓", "yes! jump ↪", "the end. zzz") and
  // idle speech quips from the scene captions. Scene.say() is pure (no RNG, no timers), so timing is unaffected;
  // gameplay captions on creatures (BEEP!/quiet, peek results) stay. Re-applied whenever the level screen makes a new scene.
  let bubblesDropped = 0;
  function quietBubbles() {
    const sc = W.__np && W.__np.scene;
    if (!sc || sc.__capQuiet || typeof sc.say !== 'function') return;
    const say = sc.say.bind(sc);
    sc.say = (text, at, kind, ...rest) => {
      // every scene caption is logged (type 'caption'), so bubbles can be audited from events.json
      const idle = at === 'actor' || at === 'caretaker' || kind === 'think' || kind === 'speech';
      const drop = !!cfg.quietBubbles && idle;
      try { log('caption', { text: String(text), at: typeof at === 'string' ? at : 'point', kind: kind ?? 'info', idle, dropped: drop }); } catch { /* ignore */ }
      if (drop) { bubblesDropped++; return; }
      return say(text, at, kind, ...rest);
    };
    sc.__capQuiet = true;
  }

  async function step(dtMs, opts = {}) {
    if (stepping) throw new Error('re-entrant step');
    stepping = true;
    try {
      if (!(await syncInput(opts.expect))) inputLate++;
      const target = now + dtMs;
      let guard = 0;
      for (;;) {
        const due = nextDue(target);
        if (!due) break;
        const [id, t] = due;
        if (t.at > now) now = t.at;
        if (t.every) t.at += t.every; else timers.delete(id);
        nesting = t.nest;
        call(t.fn, t.args);
        nesting = 0;
        await hop();
        if (++guard > 20000) { console.warn('[cap] timer storm, breaking step'); break; }
      }
      now = target;
      runScrollTweens();
      const q = rafQ; rafQ = new Map();
      for (const cb of q.values()) call(cb, [now]);
      await hop();
      checkTyping();
      quietBubbles(); // hooks scene.say: logs captions always, drops idle bubbles only with cfg.quietBubbles
      if (cfg.cursorOverlay !== false) drawCursor();
      driveAnimations();
      // make sure freshly set <img> sources (portraits are data URLs) are decoded before the screenshot
      const pend = [...document.images].filter((i) => i.src && !i.complete);
      if (pend.length) await Promise.race([Promise.all(pend.map((i) => i.decode().catch(() => {}))), new Promise((r) => real.setTimeout(r, 1500))]);
      frames++;
      const res = { vt: now / 1000, anims: animCount, timers: timers.size, inputLate };
      if (opts.events !== false) res.events = events.splice(0);
      if (opts.layout) res.layout = sampleLayout();
      return res;
    } finally { stepping = false; }
  }

  W.__cap = {
    step,
    now: () => now / 1000,
    cursor: {
      set(x, y, down) { cur.x = x; cur.y = y; if (down !== undefined) cur.down = down; },
      ripple(x, y) { cur.ripples.push({ x, y, t0: now }); },
      show(v) { cur.visible = !!v; },
      snapAlpha() { cur.alpha = cur.visible ? 1 : 0; },
    },
    mark(name, data) { log('mark', { name, ...(data || {}) }); },
    setHideDialogue(v) { cfg.hideDialogue = !!v; setCss(); },
    setExtraCss(s) { cfg.extraCss = s || ''; setCss(); },
    sampleLayout,
    input: () => ({ ...inp }),
    bubblesDropped: () => bubblesDropped,
    stats: () => ({ timers: timers.size, raf: rafQ.size, anims: animCount, frames }),
    real,
  };

  // ───────────── save / localStorage before the game reads it ─────────────
  try {
    if (cfg.storage && !sessionStorage.getItem('cap.init')) {
      sessionStorage.setItem('cap.init', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(cfg.storage)) localStorage.setItem(k, v);
    }
  } catch { /* ignore */ }
}
