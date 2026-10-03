/**
 * Credits: a curtain call in the daycare at dawn. The Qubbles finally wake (blankets off, true dreams revealed), the bots
 * wave a little syndrome tune, the gremlins take a cheeky bow, Schrödi steps out of his box (alive, obviously) and the
 * caretaker finally goes to bed. Chunky cards roll over the stage, each section synced to its stage moment.
 * Post-credits: lights out, one Qubble peeks at the camera… "...".
 */
import '../../styles/credits.css';
import { art, audio, CHAPTERS } from '../../engine/deps';
import { onFrame } from '../../engine/loop';
import { h, clamp, lerp, smooth, prefersReducedMotion, portraitSrc } from '../../engine/util';
import { linkify, LEARN_MORE } from '../learnLinks';
import { dataBoxPortrait, drawCatBox, drawBed, drawQuilt, clearParticles } from '../../art/index';
import type { Bloch, IsoFn, QubbleVisual } from '../../core/contracts';
import type { Nav } from '../app';

// ── timeline (stage seconds at 1×) ──
const BEAT = { title: 2, learned: 10, starring: 18.5, made: 26.5, built: 33.5, insp: 40.5, fonts: 46, thanks: 52 };
const WAKE0 = 4, WAKE_DT = 1.7;          // qubble i wakes at WAKE0 + i·WAKE_DT
const BOTS0 = 14, BOTS1 = 22;            // waving + syndrome tune
const GREM0 = 22;                        // gremlins enter, then bow
const CAT0 = 30;                         // Schrödi hops out
const YAWN0 = 40;                        // caretaker yawns → tiptoes to bed
const END = 56;                          // lights out → post-credits stinger
const STING = END + 1.6, BUTTONS = END + 5.2;

const DREAMS: Bloch[] = [
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
];
const Q_POS: [number, number][] = [[1.5, 1.0], [2.5, 1.7], [3.5, 1.0], [4.5, 1.7], [5.5, 1.0]];
const BOT_POS: [number, number][] = [[0.55, 0.6], [6.4, 0.6]];
const GREM: { kind: 'flipper' | 'phasey' | 'wobbles'; gx: number; gy: number }[] = [
  { kind: 'flipper', gx: 2.3, gy: 2.75 }, { kind: 'phasey', gx: 3.6, gy: 2.85 }, { kind: 'wobbles', gx: 4.9, gy: 2.75 },
];
const BOX = { gx: 6.4, gy: 3.5 }, CAT_STAGE = { gx: 5.4, gy: 3.75 };
const KID = { gx: 1.4, gy: 3.3 }, KID_BED = { gx: 0.55, gy: 3.55 };
const SYNDROME: [0 | 1, 0 | 1][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0], [1, 1], [0, 1], [1, 0]];
const COLS = 7, ROWS = 4;

const CHAPTER_LINES = [
  'Peek, then fix: a measurement plus a conditional X gate, and the repetition code’s majority vote.',
  'Looking changes things (measurement collapse). Dreams can’t be copied (the no-cloning theorem), only shared (entanglement).',
  'Ask “do you match?”, never “what are you?”: a parity check, read out as an error syndrome.',
  'Some damage hides from the question you asked, so ask sideways too: the 3-qubit phase-flip code and error discretization.',
  'Nine Qubbles guard one dream from any single gremlin: the Shor 9-qubit code.',
];

export function creditsScreen(root: HTMLElement, nav: Nav): () => void {
  const reduced = prefersReducedMotion();
  if (reduced) root.classList.add('cr-reduced');

  // ── DOM ──
  const canvas = h('canvas', { class: 'cr-stage' });
  const card = (cls: string, rib: string, tilt: number, ...kids: (string | HTMLElement)[]) =>
    h('section', { class: 'cr-card ' + cls, style: `--rib:${rib};--tilt:${reduced ? 0 : tilt}deg` }, ...kids);
  const castFig = (src: string, name: string, note: string) => h('figure', null, h('img', { src, alt: '' }), name, h('small', null, note));

  const sections: { el: HTMLElement; beat: number }[] = [
    { beat: BEAT.title, el: card('', '#ffb72b', -1.2, h('h1', null, 'NO PEEKING!'), h('p', { class: 'cr-sub' }, 'You fixed every dream without ever looking at one.')) },
    { beat: BEAT.learned, el: card('', '#6c63ff', 0.8, h('h2', null, 'What you learned'),
      ...CHAPTERS.map((c, i) => h('div', { class: 'cr-ch', style: `--c:${c.color}` }, h('i'), h('div', null, h('b', null, c.title), h('span', null, ...linkify(CHAPTER_LINES[i] ?? c.blurb)))))) },
    { beat: BEAT.starring, el: card('', '#fe443d', -0.6, h('h2', null, 'Starring'), h('div', { class: 'cr-cast' },
      castFig(portraitSrc(art.portrait('schrodi', 'smug')), 'Schrödi', 'alive, obviously'),
      castFig(portraitSrc(art.portrait('qubble', 'happy')), 'The Qubbles', 'finally peeking'),
      castFig(portraitSrc(art.portrait('system', 'deadpan')), 'Ancillabots', 'beep / quiet'),
      castFig(portraitSrc(art.portrait('flipper', 'smug')), 'Flipper', 'bit-flip gremlin'),
      castFig(portraitSrc(art.portrait('phasey', 'smug')), 'Phasey', 'phase ghost'),
      castFig(portraitSrc(art.portrait('wobbles', 'smug')), 'Wobbles', 'the in-betweener'),
      castFig(portraitSrc(dataBoxPortrait(1)), 'Data boxes', 'day shift'),
      castFig(portraitSrc(art.portrait('eye', 'sleepy')), 'The Eye', 'not looking'),
      castFig(portraitSrc(art.portrait('qubble', 'sleepy')), 'You', 'the caretaker'))) },
    { beat: BEAT.made, el: card('', '#3ddc97', 1, h('h2', null, 'Made for quriosity'),
      h('p', null, 'ISAQC · Infinium 2026 · IIIT Hyderabad'),
      h('p', { class: 'cr-sub' }, 'Option 06: Error Syndromes and Parity Probes')) },
    { beat: BEAT.built, el: card('', '#b04dff', -0.9, h('h2', null, 'Built with'),
      h('p', null, 'Nitheesh Chandra, with a crew of AI agents: director, quantum expert, programmer, art designer and audio designer.'),
      h('div', { class: 'cr-tags' }, ...['a hand-rolled state-vector sim', 'Vite', 'TypeScript', 'procedural Canvas2D art', 'procedural Web Audio music', 'Qubblese voices'].map((t) => h('span', null, t)))) },
    { beat: BEAT.insp, el: card('', '#7fc8f8', 0.7, h('h2', null, 'Inspirations'),
      h('div', { class: 'cr-tags' }, ...['7 Billion Humans', 'Baba Is You', 'GMTK'].map((t) => h('span', null, t))),
      h('p', { class: 'cr-sub', style: 'margin-top:12px' }, 'Want the real thing? ', h('a', { class: 'learn-link', href: LEARN_MORE.url, target: '_blank', rel: 'noopener noreferrer' }, 'IBM Quantum Learning'))) },
    { beat: BEAT.fonts, el: card('', '#f7a8b8', -0.5, h('h2', null, 'Fonts'),
      h('p', null, h('span', { style: 'font-family:var(--display)' }, 'Quantum'), ' (from the quriosity site)'),
      h('p', null, 'Quicksand')) },
    { beat: BEAT.thanks, el: card('cr-thanks', '#ffb72b', 0, h('h1', null, 'Thank you for not peeking.'), h('p', { class: 'cr-sub' }, 'The Qubbles say: mmh.')) },
  ];
  const track = h('div', { class: 'cr-track' }, ...sections.map((s) => s.el));
  const roll = h('div', { class: 'cr-roll' }, track);

  const pausedTag = h('div', { class: 'cr-paused' }, 'PAUSED');
  const playBtn = h('button', { class: 'btn small', title: 'Pause / resume (space)' }, 'Pause');
  const fastBtn = h('button', { class: 'btn small cr-fast', title: 'Hold to fast-forward (F)' }, 'Hold: 4×');
  const replayBtn = h('button', { class: 'btn small', title: 'Replay' }, 'Replay');
  const skipBtn = h('button', { class: 'btn small', title: 'Skip to the end' }, 'Skip');
  const ctl = h('div', { class: 'cr-ctl' }, playBtn, fastBtn, replayBtn, h('span', { class: 'cr-hint' }, 'click the stage to pause'));
  const top = h('div', { class: 'cr-top' }, skipBtn);
  const endBox = h('div', { class: 'cr-end' },
    h('button', { class: 'btn sun', onclick: () => nav.go('title') }, 'Back to title'),
    h('button', { class: 'btn', onclick: () => restart() }, 'Replay'));
  root.append(canvas, roll, pausedTag, ctl, top, endBox);

  // ── state ──
  let T = 0, paused = false, speed = 1, lastLights: (0 | 1 | null)[] = [null, null];
  const woke = new Set<number>();
  let meowed = false, stingSaid = false;
  const setPaused = (p: boolean) => { paused = p; playBtn.textContent = p ? 'Play' : 'Pause'; pausedTag.classList.toggle('show', p && T < END); };
  const restart = () => { T = 0; woke.clear(); meowed = false; stingSaid = false; lastLights = [null, null]; endBox.classList.remove('show'); setPaused(false); clearParticles(); };
  playBtn.onclick = () => setPaused(!paused);
  replayBtn.onclick = restart;
  skipBtn.onclick = () => { T = Math.max(T, END); setPaused(false); };
  canvas.onclick = () => { if (T < END) setPaused(!paused); };
  const fastOn = () => { speed = 4; fastBtn.classList.add('on'); }, fastOff = () => { speed = 1; fastBtn.classList.remove('on'); };
  fastBtn.onpointerdown = (e) => { e.preventDefault(); fastOn(); };
  fastBtn.onpointerup = fastOff; fastBtn.onpointerleave = fastOff; fastBtn.onpointercancel = fastOff;
  const onKey = (e: KeyboardEvent) => {
    if (e.type === 'keydown') {
      if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
      else if (e.code === 'KeyF') fastOn();
      else if (e.code === 'Escape') nav.go('title');
    } else if (e.code === 'KeyF') fastOff();
  };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);

  // ── canvas + layout ──
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, dpr = 1, centers: number[] = [], rollH = 0;
  const measure = () => {
    rollH = roll.clientHeight;
    centers = sections.map((s) => s.el.offsetTop + s.el.offsetHeight / 2 - rollH / 2);
  };
  const rs = () => {
    const r = root.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    measure();
  };
  rs();
  const ro = new ResizeObserver(rs); ro.observe(root);
  document.fonts?.ready.then(measure);

  /** Card scroll (px) at stage time t: section i is centred exactly at its beat; linear in between. */
  const scrollAt = (t: number) => {
    if (!centers.length) return 0;
    const first = -rollH * 0.75;
    if (t <= sections[0].beat) return lerp(first, centers[0], smooth(t / sections[0].beat));
    for (let i = 0; i < sections.length - 1; i++) {
      const a = sections[i].beat, b = sections[i + 1].beat;
      if (t <= b) { const k = (t - a) / (b - a); return lerp(centers[i], centers[i + 1], k < 0.25 ? 0 : (k - 0.25) / 0.75); } // dwell, then glide
    }
    return centers[centers.length - 1] + (t > END ? (t - END) * 120 : 0);
  };

  /** Stage geometry: the room fits the area left of the roll (or above it on narrow screens). */
  const stage = () => {
    const narrow = W < 900 || W / H < 1;
    const rollW = narrow ? 0 : roll.offsetWidth + 40;
    const aw = W - rollW - 24, ah = narrow ? H * 0.52 : H - 90;
    // room bounds in tile-width units (TW=1): x ∈ [-(ROWS+0.84)/2, (COLS+0.84)/2], y ∈ [-0.21-1.4, (COLS+ROWS+0.84)/4 + 0.25]
    const bw = (COLS + ROWS + 2.08) / 2 + 0.25, top = 0.21 + 1.42, bot = (COLS + ROWS + 0.84) / 4 + 0.3;
    const TW = Math.min(aw / bw, ah / (top + bot), 150);
    const ox = 12 + aw / 2 + ((ROWS + 1.04) - (COLS + 1.04)) / 4 * TW;
    const oy = (narrow ? 20 : 40) + (ah - (top + bot) * TW) / 2 + top * TW;
    return { TW, ox, oy, s: TW / 96 };
  };

  const t0 = performance.now() / 1000;
  let prevReal = t0;
  audio.setScene('credits');

  const off = onFrame((tReal) => {
    const dt = Math.min(0.1, tReal - prevReal); prevReal = tReal;
    if (!paused) T += dt * speed;
    const t = tReal; // animation clock for idle motion (keeps breathing while paused)
    const scroll = scrollAt(T);

    // DOM roll
    if (reduced) {
      let cur = 0; sections.forEach((s, i) => { if (T >= s.beat - 3) cur = i; });
      sections.forEach((s, i) => s.el.classList.toggle('on', i === cur && T < END + 0.5));
    } else track.style.transform = `translateY(${-scroll}px)`;
    roll.style.opacity = String(1 - clamp((T - END) / 1.2));
    ctl.style.opacity = top.style.opacity = String(1 - clamp((T - END) / 1.2));
    pausedTag.classList.toggle('show', paused && T < END);

    // ── stage ──
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const night = 1 - 0.85 * smooth(T / 18);
    art.drawBackground(ctx, W, H, t, night);
    const g = stage();
    const drift = reduced ? 0 : -scroll * 0.025; // parallax: the stage drifts slowly against the roll
    const iso: IsoFn = (gx, gy, gz = 0) => ({ x: g.ox + (gx - gy) * g.TW / 2, y: g.oy + drift + (gx + gy) * g.TW / 4 - gz * g.TW / 2 });
    const s = g.s;
    if (art.drawRoom) art.drawRoom(ctx, COLS, ROWS, iso, t, night);
    else art.drawFloor(ctx, COLS, ROWS, iso, t, night);
    // the wall sign for the occasion
    if (art.drawWallSign) { const p = iso(-0.42 + 2.4, -0.42, 1.45); art.drawWallSign(ctx, p.x, p.y, s, T < WAKE0 ? 'NO PEEKING' : 'PEEKING OK!', 'right', t, T > WAKE0 && T < WAKE0 + 0.8 ? 1 : 0); }

    const ents: { d: number; fn: () => void }[] = [];
    // Qubbles: wake one by one → true dreams revealed
    Q_POS.forEach(([gx, gy], i) => {
      const p = iso(gx, gy), tw = WAKE0 + i * WAKE_DT, k = clamp((T - tw) / 0.9);
      if (k > 0 && !woke.has(i)) { woke.add(i); audio.sfx('qubble_giggle', { pitch: 0.9 + i * 0.06, volume: 0.6 }); }
      if (k >= 1 && woke.has(i) && !woke.has(100 + i)) { woke.add(100 + i); art.burst?.('highfive', p.x, p.y - 30 * s); }
      let state: QubbleVisual['state'] = 'sleep';
      if (k > 0 && k < 1) state = 'mumble';
      else if (k >= 1) state = T > END - 6 ? 'giggle' : (Math.floor((T - tw) / 2.2 + i) % 3 === 2 ? 'giggle' : 'happy');
      ents.push({ d: gx + gy, fn: () => art.drawQubble(ctx, p.x, p.y, s, { bloch: DREAMS[i], blanket: 1 - smooth(k), state }, t + i) });
    });
    // Bots: wave with a blinking syndrome tune
    BOT_POS.forEach(([gx, gy], i) => {
      const p = iso(gx, gy);
      let light: 0 | 1 | null = null, action: 'idle' | 'wave' | 'celebrate' = 'idle';
      if (T >= BOTS0 && T < BOTS1) {
        action = 'wave';
        const step = Math.floor((T - BOTS0) / 0.5) % SYNDROME.length;
        light = SYNDROME[step][i];
      } else if (T >= BOTS1) { action = Math.floor(T / 3 + i) % 4 === 0 ? 'celebrate' : 'idle'; light = (Math.floor(T * 1.5) + i) % 2 as 0 | 1; }
      if (light !== lastLights[i] && T >= BOTS0 && T < BOTS1 && light !== null) audio.botNote(i, light);
      lastLights[i] = light;
      ents.push({ d: gx + gy, fn: () => art.drawBot(ctx, p.x, p.y, s, { light, action, facing: i ? -1 : 1, label: 'ab'[i] }, t) });
    });
    // Gremlins: scurry in from the right, then a cheeky bow (Flipper dabs, Phasey fades, Wobbles jiggles)
    if (T > GREM0) GREM.forEach((gr, i) => {
      const k = smooth((T - GREM0 - i * 0.6) / 1.6);
      if (k <= 0) return;
      const gx = lerp(COLS + 1.5, gr.gx, k), gy = gr.gy, p = iso(gx, gy);
      const bowing = k >= 1;
      const bt = (T - GREM0 - 2.4 - i * 0.5);
      ents.push({ d: gx + gy, fn: () => {
        ctx.save();
        ctx.translate(p.x, p.y);
        let pose: 'sneak' | 'strike' | 'flee' | 'taunt' = bowing ? 'taunt' : 'sneak';
        if (bowing && !reduced) {
          if (gr.kind === 'flipper') { const dab = Math.sin(bt * 1.6) > 0.3; if (dab) { ctx.rotate(-0.28); pose = 'strike'; } }
          if (gr.kind === 'phasey') ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(bt * 2.4));
          if (gr.kind === 'wobbles') { const j = Math.sin(bt * 14) * 0.08; ctx.scale(1 + j, 1 - j); }
          const bow = Math.max(0, Math.sin(bt * 1.2)) ** 3; ctx.rotate(bow * 0.25 * (i === 1 ? -1 : 1)); ctx.translate(0, bow * 3 * s);
        }
        art.drawGremlin(ctx, 0, 0, s, gr.kind, pose, t);
        ctx.restore();
      } });
    });
    // Schrödi: hops out of the box, walks to centre stage, bows, sits
    {
      const bp = iso(BOX.gx, BOX.gy);
      const draw = art.drawSchrodiActor;
      if (!draw || T < CAT0) ents.push({ d: BOX.gx + BOX.gy, fn: () => art.drawSchrodi(ctx, bp.x, bp.y, s, T > CAT0 - 4 ? 'smug' : 'sleepy', t) });
      else {
        const hopEnd = CAT0 + 1.3, walkEnd = hopEnd + 2.8, bowEnd = walkEnd + 2.6;
        const land = { x: bp.x - 40 * s, y: bp.y };
        const cs = iso(CAT_STAGE.gx, CAT_STAGE.gy);
        if (T < hopEnd) {
          // box stays put; the actor draws its own box during the hop
          ents.push({ d: BOX.gx + BOX.gy, fn: () => draw(ctx, bp.x, bp.y, s, { action: 'hop-out', phase: (T - CAT0) / 1.3, facing: -1 }, t) });
        } else {
          if (!meowed) { meowed = true; audio.sfx('schrodi_meow'); }
          ents.push({ d: BOX.gx + BOX.gy - 0.01, fn: () => drawCatBox(ctx, bp.x, bp.y, s) });
          let x = cs.x, y = cs.y, action: Parameters<typeof draw>[4]['action'] = 'sit', phase = 0.5, mood: 'deadpan' | 'smug' | 'happy' = 'deadpan';
          if (T < walkEnd) { const k = smooth((T - hopEnd) / 2.8); x = lerp(land.x, cs.x, k); y = lerp(land.y, cs.y, k); action = 'walk'; }
          else if (T < bowEnd) { action = 'stretch'; phase = (T - walkEnd) / 2.6; mood = 'smug'; }
          else { action = T > END - 5 ? 'point' : 'sit'; phase = 0.8; mood = 'happy'; }
          const depth = CAT_STAGE.gx + CAT_STAGE.gy;
          ents.push({ d: depth, fn: () => draw(ctx, x, y, s * 1.1, { action, phase, facing: -1, mood }, t) });
        }
      }
    }
    // Caretaker: watches, cheers each wake-up, yawns, tiptoes to bed and conks out
    {
      const bedP = iso(KID_BED.gx, KID_BED.gy);
      const walkEnd = YAWN0 + 2.2 + 2.6;
      if (T < walkEnd) ents.push({ d: KID_BED.gx + KID_BED.gy - 0.05, fn: () => drawKidBed(bedP.x, bedP.y, s, false) });
      if (art.drawCaretaker && T < walkEnd) {
        let p = iso(KID.gx, KID.gy), action: 'idle' | 'cheer' | 'yawn' | 'tiptoe' = 'idle', phase = (t * 0.8) % 1, facing: -1 | 1 = 1;
        const since = T - WAKE0;
        if (since > 0 && T < BOTS0 && (since % WAKE_DT) > 0.9 && (since % WAKE_DT) < 1.6) { action = 'cheer'; phase = ((since % WAKE_DT) - 0.9) / 0.7; }
        if (T >= YAWN0 && T < YAWN0 + 2.2) { action = 'yawn'; phase = (T - YAWN0) / 2.2; }
        else if (T >= YAWN0 + 2.2) {
          const k = smooth((T - YAWN0 - 2.2) / 2.6);
          const a = iso(KID.gx, KID.gy); p = { x: lerp(a.x, bedP.x, k), y: lerp(a.y, bedP.y - 6 * s, k) };
          action = 'tiptoe'; facing = bedP.x < a.x ? -1 : 1;
        }
        const pp = p;
        ents.push({ d: KID.gx + KID.gy, fn: () => art.drawCaretaker!(ctx, pp.x, pp.y, s, { action, phase, facing }, t) });
      } else ents.push({ d: KID_BED.gx + KID_BED.gy, fn: () => drawKidBed(bedP.x, bedP.y, s, true) });
    }
    ents.sort((a, b) => a.d - b.d).forEach((e) => e.fn());
    art.drawParticles?.(ctx, t);

    // floating dawn motes at a faster parallax layer
    if (!reduced) {
      ctx.save();
      for (let i = 0; i < 26; i++) {
        const hx = ((i * 0.6180339) % 1) * W, hy = (((i * 0.4142) % 1) * H * 1.6 - scroll * 0.35) % (H * 1.6);
        const y = hy < -20 ? hy + H * 1.6 : hy;
        ctx.globalAlpha = (0.25 + 0.25 * Math.sin(t * 1.3 + i)) * (1 - night * 0.5);
        ctx.fillStyle = i % 3 ? '#fff6d8' : '#ffd36b';
        ctx.beginPath(); ctx.arc(hx + Math.sin(t * 0.5 + i) * 10, y, 1.5 + (i % 3), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ── post-credits: lights out, one Qubble peeks… ──
    if (T > END) {
      const k = clamp((T - END) / 1.4);
      ctx.fillStyle = `rgba(6,6,14,${smooth(k)})`; ctx.fillRect(0, 0, W, H);
      if (T > STING) {
        const q = clamp((T - STING) / 1.1), rise = (reduced ? 1 : smooth(q)) * 0.55;
        const S = Math.min(W, H) / 150;
        const x = W / 2, y = H + 30 * S - (rise / 0.55) * 22 * S;
        ctx.save();
        const lk = T - STING > 2.6 ? 'awake-grumpy' : T - STING > 1.2 ? 'scared' : 'sleep';
        art.drawQubble(ctx, x, y, S, { bloch: { x: 0.6, y: 0.6, z: 0.53 }, blanket: 0, state: lk }, t);
        ctx.restore();
        if (T - STING > 1.5) {
          if (!stingSaid) { stingSaid = true; audio.voice?.('qubble', '.', 0, '...'); }
          const bx = x + 26 * S, by = y - 46 * S;
          ctx.save();
          ctx.globalAlpha = clamp((T - STING - 1.5) / 0.4);
          ctx.fillStyle = '#f2f0eb'; ctx.strokeStyle = '#0e0e0e'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(bx, by, 11 * S, 7 * S, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(bx - 6 * S, by + 5 * S); ctx.lineTo(bx - 10 * S, by + 11 * S); ctx.lineTo(bx - 1 * S, by + 6.4 * S); ctx.fill();
          const n = Math.min(3, Math.floor((T - STING - 1.5) / 0.35) + 1);
          ctx.fillStyle = '#0e0e0e';
          for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(bx + (i - 1) * 4.5 * S, by, 1.3 * S, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
        }
      }
      if (T > BUTTONS) endBox.classList.add('show');
    }
  });

  function drawKidBed(x: number, y: number, s: number, occupied: boolean) {
    // a bigger iso bed for the caretaker; once occupied a quilt lump + nightcap pompom + Zzz
    ctx.save(); ctx.translate(x, y); ctx.scale(1.35, 1.35); ctx.translate(-x, -y);
    drawBed(ctx, x, y, s, 0);
    ctx.restore();
    if (occupied) {
      const breathe = 1 + Math.sin(performance.now() / 700) * 0.03;
      ctx.save(); ctx.translate(x, y - 5 * s); ctx.scale(1.25, 0.8 * breathe); ctx.translate(-x, -(y - 5 * s));
      drawQuilt(ctx, x, y - 5 * s, s, performance.now() / 1000);
      ctx.restore();
      ctx.fillStyle = '#f7a8b8'; ctx.strokeStyle = '#0e0e0e'; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.arc(x - 26 * s, y - 24 * s, 7 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // nightcap
      ctx.fillStyle = '#fffdf8'; ctx.beginPath(); ctx.arc(x - 34 * s, y - 20 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // pompom
      ctx.font = `700 ${12 * s}px Quicksand, sans-serif`; ctx.fillStyle = '#f2f0eb';
      const z = (performance.now() / 1000) % 2;
      ctx.globalAlpha = Math.sin((z / 2) * Math.PI); ctx.fillText('z', x + 18 * s + z * 6 * s, y - 40 * s - z * 12 * s); ctx.globalAlpha = 1;
    }
  }

  return () => { off(); ro.disconnect(); removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); };
}
