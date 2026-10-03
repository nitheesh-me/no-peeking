/** Codex: every character, enemy, element, object and card. Entries unlock when clicked/met in the game. */
import '../../styles/codex.css';
import type { Bloch, CaretakerVisual, SchrodiActorVisual, BotVisual, QubbleVisual, IsoFn, Speaker } from '../../core/contracts';
import { art, artExtra, audio, LEVELS } from '../../engine/deps';
import { onFrame } from '../../engine/loop';
import { h, modal } from '../../engine/util';
import { CODEX, CODEX_CATS, type CodexEntry, type CodexCat } from '../codexData';
import { codexHas, codexFound, unlockAll } from '../unlocks';
import { linkify } from '../learnLinks';
import { demoCanvas } from '../cardGuidePanel';
import { CARD_GUIDE } from '../cardGuide';
import { createBloch3D, type Bloch3D } from '../bloch3d';
import type { Nav } from '../app';

type Extra = {
  drawSilhouette?: (ctx: CanvasRenderingContext2D, draw: (c: CanvasRenderingContext2D) => void, opts?: { color?: string; alpha?: number; glow?: boolean }) => void;
  drawProp?: (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, kind: string, t: number, night?: number) => void;
  drawGlyph?: (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, kind: string, t: number) => void;
  codexCardSVG?: (color: string, o?: { locked?: boolean; ribbon?: string }) => string;
  drawBed?: (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, night?: number) => void;
  wallSignSlots?: (cols: number, rows: number) => { wall: 'left' | 'right'; gx: number; gy: number; gz: number }[];
};
const X = artExtra as unknown as Extra;

// ───────── per-entry interactive state ─────────
interface ViewState {
  pose: number;           // index into the entry's pose list
  t0: number;             // time of the last click (for one-shot animations)
  blanket: number;
  bloch: Bloch;
  light: 0 | 1 | null;
  night: number;
  text: string;
  value: 0 | 1;
  swirlDir: 1 | -1;
  /** the 3D sphere has set the dream (detail panel) */
  touched: boolean;
  out: boolean;
}
const newState = (): ViewState => ({ pose: 0, t0: -9, blanket: 0.25, bloch: { x: 0, y: 0, z: 1 }, light: null, night: 0, text: 'NO PEEKING!', value: 0, swirlDir: 1, out: false, touched: false });

const CT_ACTIONS: CaretakerVisual['action'][] = ['idle', 'tiptoe', 'boop', 'shush', 'spin', 'peek', 'listen', 'press', 'cheer', 'facepalm', 'yawn'];
const SCH_ACTIONS: SchrodiActorVisual['action'][] = ['sit', 'walk', 'boop', 'shush', 'spin', 'point', 'listen', 'press', 'stretch', 'yawn', 'hop-out', 'hop-in'];
const Q_STATES: QubbleVisual['state'][] = ['sleep', 'mumble', 'giggle', 'happy', 'scared', 'awake-grumpy', 'collapsed'];
const BOT_ACTIONS: BotVisual['action'][] = ['idle', 'roll', 'highfive', 'listen', 'reset', 'wave', 'celebrate', 'confused'];
const G_POSES = ['sneak', 'strike', 'flee', 'taunt'] as const;

/** pose names shown under the live view */
function poseList(e: CodexEntry): string[] {
  switch (e.view) {
    case 'caretaker': return CT_ACTIONS;
    case 'schrodi': return art.drawSchrodiActor ? ['in the box', ...SCH_ACTIONS] : ['deadpan', 'smug', 'shock', 'happy', 'sleepy'];
    case 'qubble': case 'sunny': case 'moony': case 'swirl': case 'silk': return Q_STATES;
    case 'bot': return BOT_ACTIONS;
    case 'flipper': case 'phasey': case 'wobbles': return [...G_POSES];
    default: return [];
  }
}

const GLYPH: Partial<Record<CodexEntry['view'], string>> = { sunny: 'sunny', moony: 'moony', swirl: 'swirl', silk: 'silk', lights: 'beep' };
const CAT_COLOR: Record<CodexCat, string> = { characters: '#ffb72b', enemies: '#fe443d', elements: '#6c63ff', objects: '#3ddc97', cards: '#3fb6ff' };
const POLE: Record<string, Bloch> = { sunny: { x: 0, y: 0, z: 1 }, moony: { x: 0, y: 0, z: -1 } };

/** a little iso camera so a mini-room is centred on a wall point */
function miniRoom(g: CanvasRenderingContext2D, W: number, H: number, k: number, focus: { gx: number; gy: number; gz: number }, t: number, night: number): IsoFn {
  const TW = 96 * k, TH = 48 * k;
  const ox = W / 2 - (focus.gx - focus.gy) * TW / 2, oy = H / 2 - (focus.gx + focus.gy) * TH / 2 + focus.gz * TH;
  const iso: IsoFn = (gx, gy, gz = 0) => ({ x: ox + (gx - gy) * TW / 2, y: oy + (gx + gy) * TH / 2 - gz * TH });
  if (art.drawRoom) art.drawRoom(g, 6, 5, iso, t, night);
  else { art.drawBackground(g, W, H, t, night); art.drawFloor(g, 6, 5, iso, t, night); }
  return iso;
}
const M = 0.42, LR = 6 + 2 * M, LL = 5 + 2 * M;
const FOCUS: Record<string, { gx: number; gy: number; gz: number }> = {
  window: { gx: -M + LR - 1.7, gy: -M, gz: 1.45 },
  clock: { gx: -M + 0.72, gy: -M, gz: 1.6 },
  door: { gx: -M, gy: -M + LL - 1.07, gz: 1.0 },
};

/** Draw an entry's view. W×H canvas (CSS px), scale k. */
function drawView(g: CanvasRenderingContext2D, W: number, H: number, e: CodexEntry, st: ViewState, t: number, k: number): void {
  const cx = W / 2, fy = H * 0.8, s = k;
  const since = t - st.t0;
  const phase = (t * 0.7) % 1;
  const poses = poseList(e);
  const pose = poses[st.pose % Math.max(1, poses.length)];
  const floor = () => { g.fillStyle = 'rgba(14,14,14,0.07)'; g.beginPath(); g.ellipse(cx, fy, 70 * s, 20 * s, 0, 0, Math.PI * 2); g.fill(); };
  switch (e.view) {
    case 'caretaker':
      floor();
      art.drawCaretaker?.(g, cx, fy, s * 1.3, { action: pose as CaretakerVisual['action'], phase, facing: Math.sin(t * 0.4) > 0 ? 1 : -1, flashlight: pose === 'peek' }, t);
      break;
    case 'schrodi':
      floor();
      if (art.drawSchrodiActor && st.pose % poses.length > 0) {
        const a = pose as SchrodiActorVisual['action'];
        const hp = a === 'hop-in' || a === 'hop-out';
        art.drawSchrodiActor(g, hp ? cx - 20 * s : cx, fy, s * 1.3, { action: a, phase: hp ? Math.min(1, since / 0.9) : phase, facing: 1, mood: 'deadpan' }, t);
      } else art.drawSchrodi(g, cx, fy, s * 1.3, (art.drawSchrodiActor ? 'deadpan' : pose) as 'deadpan', t);
      break;
    case 'qubble': case 'sunny': case 'moony': case 'swirl': {
      let bloch = st.bloch;
      if ((e.view === 'sunny' || e.view === 'moony') && !st.touched) bloch = POLE[e.view];
      if (e.view === 'swirl' && !st.touched) { const ph = t * 1.2 * st.swirlDir; bloch = { x: Math.cos(ph), y: Math.sin(ph), z: 0 }; }
      const blanket = e.view === 'qubble' ? st.blanket : 0;
      art.drawQubble(g, cx, fy, s * 1.5, { bloch, blanket, state: pose as QubbleVisual['state'], label: e.view === 'qubble' ? 'q1' : undefined }, t);
      break;
    }
    case 'silk': {
      const tug = Math.max(0, 1 - since / 0.8);
      const a = { x: cx - 70 * s, y: fy }, b = { x: cx + 70 * s, y: fy };
      art.drawLink(g, a.x, a.y - 30 * s, b.x, b.y - 30 * s, 0.6 + 0.4 * Math.sin(t * 2) * 0.5 + tug * 0.4, t);
      art.drawQubble(g, a.x, a.y, s * 1.1, { bloch: { x: 0, y: 0, z: 0 }, blanket: 0.25, state: pose as QubbleVisual['state'] }, t);
      art.drawQubble(g, b.x, b.y, s * 1.1, { bloch: { x: 0, y: 0, z: 0 }, blanket: 0.25, state: pose as QubbleVisual['state'] }, t + 0.7);
      break;
    }
    case 'databox': {
      const tum = since < 0.7 ? since / 0.7 : undefined;
      const z = (tum != null && tum < 0.5 ? 1 - st.value : st.value) ? -1 : 1;
      art.drawQubble(g, cx, fy, s * 1.6, { bloch: { x: 0, y: 0, z }, blanket: st.blanket >= 0.5 ? 1 : 0, state: 'giggle', classical: true, tumble: tum }, t);
      break;
    }
    case 'bot': case 'lights':
      floor();
      art.drawBot(g, cx, fy, s * 1.5, { light: st.light, action: e.view === 'bot' ? pose as BotVisual['action'] : st.light == null ? 'idle' : 'listen', facing: 1, label: 'a' }, t);
      break;
    case 'flipper': case 'phasey': case 'wobbles':
      floor();
      art.drawGremlin(g, cx, fy, s * 1.5, e.view, pose as typeof G_POSES[number], t);
      break;
    case 'blanket':
      if (X.drawProp && st.t0 < 0) { X.drawProp(g, cx, fy, s * 1.6, 'blanket', t); break; }
      art.drawQubble(g, cx, fy, s * 1.5, { bloch: { x: 0.7, y: 0.3, z: 0.5 }, blanket: st.blanket, state: 'sleep' }, t);
      break;
    case 'bed':
      if (X.drawProp) X.drawProp(g, cx, fy, s * 1.6, 'bed', t, st.night);
      else if (X.drawBed) X.drawBed(g, cx, fy, s * 1.6, st.night);
      else art.drawQubble(g, cx, fy, s * 1.5, { bloch: { x: 0, y: 0, z: 1 }, blanket: 1, state: 'sleep' }, t);
      break;
    case 'flashlight': {
      const p = Math.min(1, since / 1.2);
      art.drawQubble(g, cx + 50 * s, fy, s * 1.2, { bloch: p > 0.5 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }, blanket: p > 0.5 && p < 1 ? 0 : 1, state: p > 0.5 && p < 1 ? 'awake-grumpy' : 'sleep' }, t);
      art.drawCaretaker?.(g, cx - 40 * s, fy + 4 * s, s * 1.2, { action: since < 1.2 ? 'peek' : 'idle', phase: p, facing: 1, flashlight: since < 1.2 }, t);
      break;
    }
    case 'box':
      floor();
      if (art.drawSchrodiActor) {
        const p = Math.min(1, since / 0.9);
        if (since < 0.9) art.drawSchrodiActor(g, cx - 20 * s, fy, s * 1.3, { action: st.out ? 'hop-out' : 'hop-in', phase: p, facing: 1 }, t);
        else if (st.out) { if (X.drawProp) X.drawProp(g, cx - 20 * s, fy, s * 1.3, 'box', t); art.drawSchrodiActor(g, cx + 40 * s, fy, s * 1.3, { action: 'sit', phase: 0, facing: -1, mood: 'smug' }, t); }
        else art.drawSchrodi(g, cx - 20 * s, fy, s * 1.3, 'smug', t);
      } else art.drawSchrodi(g, cx, fy, s * 1.3, 'smug', t);
      break;
    case 'window': case 'clock': case 'door': {
      if (X.drawProp) { X.drawProp(g, cx, H * 0.9, s * (e.view === 'clock' ? 2.6 : e.view === 'door' ? 1.15 : 0.95) * Math.min(1, H / 200 / s), e.view, t, st.night); break; }
      miniRoom(g, W, H, s * 1.25, FOCUS[e.view], t, st.night);
      break;
    }
    case 'sign': {
      const sl = X.wallSignSlots?.(6, 5)[0] ?? { wall: 'right' as const, gx: 1.5, gy: -M, gz: 1.45 };
      const iso = miniRoom(g, W, H, s * 1.25, sl, t, 0);
      const p = iso(sl.gx, sl.gy, sl.gz);
      const shake = Math.max(0, 1 - since / 1.2);
      if (art.drawWallSign) art.drawWallSign(g, p.x, p.y, s * 1.25, st.text || ' ', sl.wall, t, shake);
      else art.drawSign(g, p.x, p.y, s * 1.25, st.text || ' ', t, shake);
      break;
    }
    case 'card': break; // DOM card + demo
  }
}

/** silhouette of the entry (locked): draw, then fill with ink */
function drawLocked(g: CanvasRenderingContext2D, W: number, H: number, e: CodexEntry, dpr: number): void {
  const off = document.createElement('canvas'); off.width = W * dpr; off.height = H * dpr;
  const o = off.getContext('2d')!; o.setTransform(dpr, 0, 0, dpr, 0, 0);
  const paint = (c: CanvasRenderingContext2D) => {
    if (e.view === 'card') { c.fillStyle = '#000'; c.beginPath(); c.roundRect(W / 2 - 46, H / 2 - 18, 92, 36, 10); c.fill(); }
    else drawView(c, W, H, e, newState(), 1.3, Math.min(W, H) / 150);
  };
  if (X.drawSilhouette) X.drawSilhouette(o, paint, { alpha: 0.9 });
  else { paint(o); o.globalCompositeOperation = 'source-in'; o.fillStyle = '#2b2a33'; o.fillRect(0, 0, W, H); }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.85; g.drawImage(off, 0, 0); g.restore();
}

// ───────── voice ─────────
const VOICE: Partial<Record<CodexEntry['view'], Speaker>> = { caretaker: 'system', schrodi: 'schrodi', qubble: 'qubble', databox: 'qubble', bot: 'system', flipper: 'flipper', phasey: 'phasey', wobbles: 'wobbles', box: 'schrodi' };
let voiceTimers: number[] = [];
function speak(e: CodexEntry): void {
  const who = VOICE[e.view];
  if (!who) return;
  if (e.view === 'schrodi' || e.view === 'box') audio.sfx('schrodi_meow', { volume: 0.5 });
  if (e.view === 'bot') audio.botNote(0, Math.random() < 0.5 ? 0 : 1);
  if (!audio.voice) return;
  voiceTimers.forEach(clearTimeout); voiceTimers = [];
  const line = e.flavor.slice(0, 60);
  [...line].forEach((c, i) => voiceTimers.push(window.setTimeout(() => audio.voice?.(who, c, i, line), i * 28)));
}

// ───────── screen ─────────
export function codexScreen(root: HTMLElement, nav: Nav): () => void {
  let cat: CodexCat | 'all' = 'all';
  const thumbs: { cv: HTMLCanvasElement; e: CodexEntry; st: ViewState }[] = [];
  const count = h('span', { class: 'tag codex-count' });
  const grid = h('div', { class: 'codex-grid', role: 'list' });
  const tabs = h('div', { class: 'codex-tabs', role: 'tablist', 'aria-label': 'Codex categories' });
  root.append(
    h('div', { class: 'topbar' },
      h('button', { class: 'btn small', onclick: () => nav.go('title') }, '◂ Title'),
      h('div', { style: 'min-width:0' }, h('div', { class: 'title' }, '📖 The Codex'), h('div', { class: 'sub' }, 'Everything you have met in the daycare. Click things in the game to find more.')),
      h('div', { class: 'spacer' }), count,
      h('button', { class: 'btn small', onclick: () => nav.go('map') }, 'Map'),
      h('button', { class: 'btn icon small', title: 'Settings', 'aria-label': 'Settings', onclick: () => nav.settings() }, '⚙')),
    h('div', { class: 'codex-body' }, tabs, grid),
  );

  function renderTabs() {
    tabs.innerHTML = '';
    const mk = (id: CodexCat | 'all', label: string) => {
      const list = id === 'all' ? CODEX : CODEX.filter((e) => e.cat === id);
      const n = list.filter((e) => codexHas(e.id)).length;
      tabs.appendChild(h('button', { class: `codex-tab${cat === id ? ' on' : ''}`, role: 'tab', 'aria-selected': String(cat === id), onclick: () => { cat = id; renderTabs(); renderGrid(); } },
        label, h('span', { class: 'n' }, `${n}/${list.length}`)));
    };
    mk('all', '✦ All');
    for (const c of CODEX_CATS) mk(c.id, `${c.icon} ${c.name}`);
  }

  function renderGrid() {
    grid.innerHTML = ''; thumbs.length = 0;
    count.textContent = `${codexFound()}/${CODEX.length} found${unlockAll() ? ' · judge mode' : ''}`;
    for (const c of CODEX_CATS) {
      if (cat !== 'all' && cat !== c.id) continue;
      grid.appendChild(h('h3', { class: 'codex-cat display' }, `${c.icon} ${c.name}`));
      const row = h('div', { class: 'codex-row' });
      for (const e of CODEX.filter((x) => x.cat === c.id)) {
        const open = codexHas(e.id);
        const W = 132, H = 100, dpr = Math.min(2, devicePixelRatio || 1);
        let pic: HTMLElement;
        if (e.view === 'card' && open) {
          pic = h('div', { class: 'codex-cardpic' }, h('div', { class: `card op-${e.op}` }, h('span', { class: 'cname' }, e.op === 'NOTE' ? 'COMMENT' : e.op!)));
        } else {
          const cv = h('canvas', { width: W * dpr, height: H * dpr, style: `width:${W}px;height:${H}px`, 'aria-hidden': 'true' }) as HTMLCanvasElement;
          pic = cv;
          if (open) thumbs.push({ cv, e, st: newState() });
          else drawLocked(cv.getContext('2d')!, W, H, e, dpr);
        }
        const el = h('button', { class: `codex-entry cat-${e.cat}${open ? '' : ' locked'}`, role: 'listitem', 'data-id': e.id,
          'aria-label': open ? `${e.name}: open` : `Locked: ${e.hint}`, title: open ? e.name : `???: ${e.hint}` },
          pic, h('div', { class: 'ce-name' }, open ? e.name : '???'),
          open ? null : h('div', { class: 'ce-hint' }, e.hint));
        if (X.codexCardSVG) { el.style.backgroundImage = `url("${X.codexCardSVG(CAT_COLOR[e.cat], { locked: !open, ribbon: open ? c.name.replace(/s$/, '') : undefined })}")`; el.classList.add('framed'); }
        el.addEventListener('click', () => { if (open) openDetail(e); else { audio.sfx('ui_click', { pitch: 0.7 }); el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); } });
        row.appendChild(el);
      }
      grid.appendChild(row);
    }
  }

  // thumbnails animate gently (~12 fps)
  let acc = 0;
  const stopThumbs = onFrame((t, dt) => {
    acc += dt; if (acc < 0.08) return; acc = 0;
    for (const th of thumbs) {
      const g = th.cv.getContext('2d')!, dpr = th.cv.width / 132;
      if (th.e.view === 'sign') { if (th.cv.dataset.drawn) continue; th.cv.dataset.drawn = '1'; } // the mini room is heavy: draw once
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, 132, 100);
      drawView(g, 132, 100, th.e, th.st, t, 0.62);
      const glyph = GLYPH[th.e.view];
      if (glyph && X.drawGlyph) X.drawGlyph(g, 112, 18, 0.38, glyph, t);
    }
  });

  renderTabs(); renderGrid();
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal-back')) nav.go('title'); };
  window.addEventListener('keydown', onKey);
  return () => { stopThumbs(); window.removeEventListener('keydown', onKey); voiceTimers.forEach(clearTimeout); };
}

// ───────── detail panel ─────────
function openDetail(e: CodexEntry): void {
  audio.sfx('card_pick');
  const st = newState();
  if (e.view === 'blanket') st.blanket = 1;
  if (e.view === 'lights') st.light = 1;
  const poses = poseList(e);
  const W = 420, H = 280, dpr = Math.min(2, devicePixelRatio || 1);
  let stop = () => {};
  // 3D Bloch sphere (designer widget): drives the live Qubble render for the qubble + dream elements
  let sphere: Bloch3D | null = null;
  const sphereCap = h('div', { class: 'cd-sphere-cap' });
  if (e.view === 'qubble' || e.view === 'sunny' || e.view === 'moony' || e.view === 'swirl' || e.view === 'silk') {
    const init: Bloch = e.view === 'qubble' ? { x: 0.6, y: 0.2, z: 0.77 } : e.view === 'moony' ? { x: 0, y: 0, z: -1 } : e.view === 'swirl' ? { x: 1, y: 0, z: 0 } : e.view === 'silk' ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    st.bloch = init;
    const capFor = (b: Bloch) => {
      const r = Math.hypot(b.x, b.y, b.z);
      return r < 0.3 ? 'entangled: the arrow shrinks to the centre (no dream of its own)' : Math.abs(b.z) < 0.35 ? 'on the equator: a swirl (superposition)' : Math.hypot(b.x, b.y) > 0.3 ? (b.z > 0 ? 'mostly Sunny, a bit swirly' : 'mostly Moony, a bit swirly') : b.z > 0 ? 'near the top: Sunny |0⟩' : 'near the bottom: Moony |1⟩';
    };
    sphere = createBloch3D({
      size: 240, rotatable: true, labels: 'both', initial: init,
      interactive: e.view !== 'silk', measure: e.view === 'qubble',
      onChange: (b) => {
        if (e.view === 'swirl') { // keep it on the equator
          const r = Math.hypot(b.x, b.y) || 1;
          if (Math.abs(b.z) > 0.01) { b = { x: b.x / r, y: b.y / r, z: 0 }; sphere?.set(b); }
        }
        st.bloch = b; st.touched = true; sphereCap.textContent = capFor(b);
      },
    });
    sphereCap.textContent = e.view === 'silk' ? 'entangled: each Qubble alone is r ≈ 0, a dot in the middle' : capFor(init);
  }
  let live: HTMLElement;
  const poseTag = h('div', { class: 'cd-pose', 'aria-live': 'polite' });
  const syncPose = () => {
    if (poses.length) poseTag.textContent = `${poses[st.pose % poses.length]} · ${e.play}`;
    else if (e.view === 'lights') poseTag.textContent = `${st.light == null ? 'off (not asked yet)' : st.light ? 'BEEP' : 'QUIET'} · ${e.play}`;
    else if (e.view === 'databox') poseTag.textContent = `value ${st.value} · lid ${st.blanket >= 0.5 ? 'closed' : 'open'} · ${e.play}`;
    else poseTag.textContent = e.play;
  };
  const act = () => {
    st.t0 = performance.now() / 1000;
    if (poses.length) st.pose = (st.pose + 1) % poses.length;
    switch (e.view) {
      case 'databox': st.value = st.value ? 0 : 1; audio.sfx('boop', { pitch: 1.3 }); break;
      case 'lights': st.light = st.light == null ? 0 : st.light === 0 ? 1 : null; if (st.light != null) audio.botNote(0, st.light); break;
      case 'swirl': st.swirlDir = st.swirlDir === 1 ? -1 : 1; if (st.touched) { st.bloch = { x: -st.bloch.x, y: st.bloch.y, z: 0 }; sphere?.set(st.bloch, true); } audio.sfx('shush'); break;
      case 'blanket': st.blanket = st.blanket >= 1 ? 0.25 : st.blanket > 0 ? 0 : 1; audio.sfx('ui_click'); break;
      case 'bed': case 'window': case 'clock': case 'door': st.night = st.night ? 0 : 1; audio.sfx('ui_hover', { pitch: st.night ? 0.7 : 1.4 }); break;
      case 'box': st.out = !st.out; audio.sfx('schrodi_meow', { volume: 0.5 }); break;
      case 'flashlight': setTimeout(() => audio.sfx('peek_collapse', { volume: 0.5 }), 600); break;
      case 'silk': audio.sfx('highfive', { volume: 0.5 }); break;
      case 'sign': audio.sfx('reset', { volume: 0.4 }); break;
      case 'flipper': audio.sfx('gremlin_flip', { volume: 0.5 }); break;
      case 'phasey': audio.sfx('ghost_phase', { volume: 0.5 }); break;
      case 'wobbles': audio.sfx('wobble', { volume: 0.5 }); break;
      case 'qubble': case 'sunny': case 'moony': audio.sfx('qubble_giggle', { volume: 0.5 }); break;
      default: break;
    }
    speak(e);
    syncPose();
  };

  const controls = h('div', { class: 'cd-controls' });
  if (e.view === 'card') {
    const lvl = LEVELS.find((l) => l.id === '2-3') ?? LEVELS[0];
    const d = demoCanvas(CARD_GUIDE[e.op!].demo, lvl, e.op!);
    stop = d.stop;
    live = h('div', { class: 'cd-live cd-card', tabindex: 0, role: 'button', 'aria-label': 'Card demo' },
      h('div', { class: `card op-${e.op}` }, h('span', { class: 'cname' }, e.op === 'NOTE' ? 'COMMENT' : e.op!)), d.el);
    controls.append(h('ul', { class: 'guide-tips' }, ...CARD_GUIDE[e.op!].tips.slice(0, 3).map((x) => h('li', null, x))));
  } else {
    const cv = h('canvas', { class: 'cd-canvas', width: W * dpr, height: H * dpr, style: `width:${W}px;height:${H}px`, tabindex: 0, role: 'button', 'aria-label': `${e.name}: ${e.play} (Enter or Space)` }) as HTMLCanvasElement;
    live = h('div', { class: `cd-live${sphere ? ' with-sphere' : ''}` }, cv, sphere ? h('div', { class: 'cd-sphere' }, sphere.el, sphereCap) : null);
    const g = cv.getContext('2d')!;
    stop = onFrame((t) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      g.fillStyle = st.night && (e.view === 'bed') ? '#2a2b4a' : '#f7f4ec'; g.fillRect(0, 0, W, H);
      drawView(g, W, H, e, st, t, 1.15);
    });
    cv.addEventListener('click', act);
    cv.addEventListener('keydown', (k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); act(); } });
    // extra controls
    if (e.view === 'qubble') {
      const blBtn = h('button', { class: 'btn small', 'aria-pressed': 'false' }, '🩻 X-ray: blanket see-through');
      blBtn.addEventListener('click', () => { st.blanket = st.blanket >= 1 ? 0.25 : st.blanket > 0 ? 0 : 1; blBtn.textContent = st.blanket >= 1 ? '🛏 Blanket on (can\'t see)' : st.blanket > 0 ? '🩻 X-ray: blanket see-through' : '👀 No blanket'; audio.sfx('ui_click'); });
      st.blanket = 0.25;
      controls.append(blBtn);
    }
    if (e.view === 'databox') controls.append(h('button', { class: 'btn small', onclick: () => { st.blanket = st.blanket >= 0.5 ? 0 : 1; audio.sfx('ui_click'); syncPose(); } }, '📦 Open / close the lid'));
    if (e.view === 'bot') controls.append(h('button', { class: 'btn small', onclick: () => { st.light = st.light == null ? 0 : st.light === 0 ? 1 : null; if (st.light != null) audio.botNote(0, st.light); } }, '💡 Light: off → QUIET → BEEP'));
    if (e.view === 'sign') {
      const inp = h('input', { class: 'text-input', maxlength: 24, value: st.text, 'aria-label': 'Sign text' }) as HTMLInputElement;
      inp.addEventListener('input', () => { st.text = inp.value.toUpperCase(); });
      inp.addEventListener('keydown', (k) => k.stopPropagation());
      controls.append(h('label', { class: 'cd-label' }, 'Write your own sign:', inp));
    }
  }

  const body = h('div', { class: `codex-detail cat-${e.cat}${sphere ? ' wide' : ''}` },
    h('div', { class: 'cd-head' }, h('span', { class: 'cd-cat' }, CODEX_CATS.find((c) => c.id === e.cat)?.icon ?? ''), h('h2', null, e.name)),
    live, poseTag, controls,
    h('blockquote', { class: `cd-flavor by-${e.by}` }, `“${e.flavor}”`),
    h('div', { class: 'cd-real' }, h('b', null, 'In real life: '), ...linkify(e.real)),
  );
  syncPose();
  modal(body, { cls: `codex-modal${sphere ? ' wide' : ''}`, onClose: () => { stop(); sphere?.destroy(); voiceTimers.forEach(clearTimeout); } });
  setTimeout(() => (live.querySelector('canvas,[tabindex]') as HTMLElement | null ?? live).focus?.(), 50);
}
