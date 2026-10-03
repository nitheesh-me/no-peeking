// Art preview harness: open /src/art/preview.html under `npx vite`.
// Query params: ?night=0..1  ?t=<seconds> (freeze time)  ?only=scene|qubbles|cast  ?scale=1
import { art } from './index';
import type { Bloch, BotVisual, IsoFn, QubbleVisual, Speaker, DialogueLine } from '../core/contracts';

const qs = new URLSearchParams(location.search);
const nightEl = document.getElementById('night') as HTMLInputElement;
const pauseEl = document.getElementById('pause') as HTMLInputElement;
if (qs.has('night')) nightEl.value = qs.get('night')!;
const frozenT = qs.has('t') ? parseFloat(qs.get('t')!) : null;
const only = qs.get('only');

// portraits
const pr = document.getElementById('portraits')!;
const who: Speaker[] = ['schrodi', 'flipper', 'phasey', 'wobbles', 'qubble', 'eye', 'system'];
const moods: DialogueLine['mood'][] = ['deadpan', 'smug', 'shock', 'happy', 'sleepy'];
for (const w of who) for (const m of moods) {
  if ((w === 'system') && m !== 'deadpan') continue;
  const f = document.createElement('figure');
  f.innerHTML = `<img src="${art.portrait(w, m)}"><figcaption>${w}<br>${m}</figcaption>`;
  pr.appendChild(f);
}
if (only) { (document.getElementById('logo') as HTMLElement).style.display = 'none'; pr.style.display = 'none'; }

const cv = document.getElementById('c') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
const W = 1400;
const H = only === 'closeup' ? 1000 : only === 'scene' ? 760 : only === 'qubbles' ? 1060 : only === 'cast' ? 900 : 2700;
const dpr = window.devicePixelRatio || 1;
cv.width = W * dpr; cv.height = H * dpr;
cv.style.width = W + 'px'; cv.style.height = H + 'px';

const B = (theta: number, phi: number, r = 1): Bloch => ({ x: r * Math.sin(theta) * Math.cos(phi), y: r * Math.sin(theta) * Math.sin(phi), z: r * Math.cos(theta) });
const PI = Math.PI;
const label = (t: string, x: number, y: number, size = 14, color = '#0e0e0e') => {
  ctx.font = `700 ${size}px Quicksand, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(t, x, y);
};
const heading = (t: string, y: number) => {
  ctx.font = `28px Quantum, sans-serif`; ctx.fillStyle = '#0e0e0e'; ctx.textAlign = 'left';
  ctx.fillText(t, 24, y);
};

function makeIso(ox: number, oy: number, tw = 96, th = 48): IsoFn {
  return (gx, gy, gz = 0) => ({ x: ox + (gx - gy) * tw / 2, y: oy + (gx + gy) * th / 2 - gz * th });
}

function scene(y0: number, t: number, night: number) {
  ctx.save();
  ctx.beginPath(); ctx.rect(0, y0, W, 760); ctx.clip();
  ctx.translate(0, y0);
  art.drawBackground(ctx, W, 760, t, night);
  const iso = makeIso(W / 2, 170);
  const cols = 6, rows = 5;
  art.drawFloor(ctx, cols, rows, iso, t, night);
  const c = (gx: number, gy: number) => iso(gx + 0.5, gy + 0.5);
  const xray = night > 0.5 ? 0.25 : 0;
  // signs on the "wall" (above back edges)
  const s1 = iso(1.5, 0), s2 = iso(0, 2.5);
  art.drawSign(ctx, s1.x + 30, s1.y - 120, 1, 'LOOKING = WAKING', t);
  art.drawSign(ctx, s2.x - 60, s2.y - 120, 1, 'NO COPIES', t, Math.max(0, Math.sin(t * 0.8)));
  const qs: [number, number, QubbleVisual][] = [
    [1, 1, { bloch: B(0, 0), blanket: xray || 0, state: 'sleep', label: 'q1' }],
    [3, 1, { bloch: B(PI / 2, 0, 0.3), blanket: xray, state: 'sleep', label: 'q2' }],
    [5, 1, { bloch: B(PI / 2, 0, 0.3), blanket: 1, state: 'sleep', label: 'q3' }],
    [1, 3, { bloch: B(PI / 2, PI), blanket: 0, state: 'happy', label: 'q4' }],
    [3, 3, { bloch: B(PI, 0), blanket: 0, state: 'collapsed', label: 'q5', highlight: true }],
  ];
  const ents: { y: number; draw: () => void }[] = [];
  for (const [gx, gy, v] of qs) { const p = c(gx, gy); ents.push({ y: p.y, draw: () => art.drawQubble(ctx, p.x, p.y, 1, v, t) }); }
  const bots: [number, number, BotVisual][] = [
    [2, 2, { light: 0, action: 'listen', facing: 1, label: 'a' }],
    [4, 2, { light: 1, action: 'highfive', facing: -1, label: 'b' }],
    [5, 3, { light: null, action: 'roll', facing: 1, label: 'c' }],
  ];
  for (const [gx, gy, v] of bots) { const p = c(gx, gy); ents.push({ y: p.y, draw: () => art.drawBot(ctx, p.x, p.y, 1, v, t) }); }
  const g1 = c(0, 4), g2 = c(2, 4), g3 = c(4, 4);
  ents.push({ y: g1.y, draw: () => art.drawGremlin(ctx, g1.x, g1.y, 1, 'flipper', 'sneak', t) });
  ents.push({ y: g2.y, draw: () => art.drawGremlin(ctx, g2.x, g2.y, 1, 'phasey', 'taunt', t) });
  ents.push({ y: g3.y, draw: () => art.drawGremlin(ctx, g3.x, g3.y, 1, 'wobbles', 'strike', t) });
  ents.sort((a, b) => a.y - b.y).forEach((e) => e.draw());
  const a = c(3, 1), b = c(5, 1), d = c(2, 2);
  art.drawLink(ctx, a.x, a.y - 20, b.x, b.y - 20, 0.9, t);
  art.drawLink(ctx, a.x, a.y - 20, d.x, d.y - 26, 0.4, t);
  art.drawSchrodi(ctx, 150, 640, 1.4, 'deadpan', t);
  art.drawParticles?.(ctx, t);
  label(`night = ${night.toFixed(2)}  (at night q1/q2 show X-ray blanket 0.25)`, W / 2, 745, 13, night > 0.5 ? '#f2f0eb' : '#0e0e0e');
  ctx.restore();
}

function qubbleSheet(y0: number, t: number) {
  ctx.save(); ctx.translate(0, y0);
  ctx.fillStyle = '#f2f0eb'; ctx.fillRect(0, 0, W, 1060);
  heading('Qubble states', 40);
  const states: QubbleVisual['state'][] = ['sleep', 'awake-grumpy', 'happy', 'scared', 'giggle', 'collapsed'];
  const dreams: [string, Bloch][] = [['Sunny |0>', B(0, 0)], ['Moony |1>', B(PI, 0)], ['plus', B(PI / 2, 0)], ['minus', B(PI / 2, PI)], ['+i', B(PI / 2, PI / 2)], ['mixed r=.2', B(PI / 2, 0, 0.2)]];
  states.forEach((st, i) => label(st, 200 + i * 190, 75, 13));
  dreams.forEach(([name, bl], j) => {
    label(name, 60, 140 + j * 90, 12);
    states.forEach((st, i) => art.drawQubble(ctx, 200 + i * 190, 150 + j * 90, 1, { bloch: bl, blanket: 0, state: st }, t + i * 0.3));
  });
  // Bloch sweep: theta 0→π at φ=0, then equator φ 0→2π
  heading('Bloch sweep', 720);
  for (let i = 0; i < 12; i++) {
    const th = (i / 11) * PI;
    art.drawQubble(ctx, 70 + i * 112, 800, 0.9, { bloch: B(th, 0), blanket: 0, state: 'sleep' }, t);
    label(`θ=${Math.round((th * 180) / PI)}°`, 70 + i * 112, 828, 11);
  }
  for (let i = 0; i < 12; i++) {
    const ph = (i / 12) * 2 * PI;
    art.drawQubble(ctx, 70 + i * 112, 900, 0.9, { bloch: B(PI / 2, ph), blanket: 0, state: 'sleep' }, t);
    label(`φ=${Math.round((ph * 180) / PI)}°`, 70 + i * 112, 928, 11);
  }
  // blanket + mixedness + classical
  const bl = [0, 0.25, 0.5, 0.75, 1];
  bl.forEach((b, i) => { art.drawQubble(ctx, 80 + i * 110, 1010, 0.9, { bloch: B(PI / 2, 0), blanket: b, state: 'sleep' }, t); label(`blanket ${b}`, 80 + i * 110, 1040, 11); });
  [1, 0.7, 0.4, 0].forEach((r, i) => { art.drawQubble(ctx, 680 + i * 100, 1010, 0.9, { bloch: B(0.3, 0, r), blanket: 0, state: 'sleep' }, t); label(`r=${r}`, 680 + i * 100, 1040, 11); });
  ([['sleep', 0], ['sleep', PI], ['happy', 0], ['awake-grumpy', PI]] as const).forEach(([st, th], i) => {
    art.drawQubble(ctx, 1100 + i * 75, 1010, 0.9, { bloch: B(th, 0), blanket: 0, state: st, classical: true, label: 'q' + (i + 1) }, t);
  });
  label('classical bit-balls', 1210, 1045, 11);
  ctx.restore();
}

function castSheet(y0: number, t: number) {
  ctx.save(); ctx.translate(0, y0);
  ctx.fillStyle = '#ebe8e1'; ctx.fillRect(0, 0, W, 900);
  heading('Ancillabots', 40);
  const acts: BotVisual['action'][] = ['idle', 'roll', 'highfive', 'listen', 'reset', 'celebrate', 'confused'];
  const lights: (0 | 1 | null)[] = [null, 0, 1];
  acts.forEach((a, i) => {
    label(a, 110 + i * 170, 70, 13);
    lights.forEach((l, j) => art.drawBot(ctx, 110 + i * 170, 150 + j * 95, 1, { light: l, action: a, facing: 1, label: 'a' }, t));
  });
  heading('Gremlins', 470);
  const poses = ['sneak', 'strike', 'flee', 'taunt'] as const;
  (['flipper', 'phasey', 'wobbles'] as const).forEach((k, j) => {
    poses.forEach((p, i) => {
      art.drawGremlin(ctx, 120 + i * 140, 560 + j * 105, 1, k, p, t);
      if (j === 0) label(p, 120 + i * 140, 495, 13);
    });
  });
  ctx.font = '28px Quantum, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Schrodi', 700, 470);
  (['deadpan', 'smug', 'shock', 'happy', 'sleepy'] as const).forEach((m, i) => {
    art.drawSchrodi(ctx, 740 + i * 130, 590, 1, m, t);
    label(m, 740 + i * 130, 620, 12);
  });
  // links & signs
  for (let i = 0; i < 4; i++) {
    const st = [0.15, 0.4, 0.7, 1][i];
    art.drawLink(ctx, 700 + i * 170, 700, 820 + i * 170, 740, st, t);
    label(`link ${st}`, 760 + i * 170, 780, 11);
  }
  art.drawSign(ctx, 780, 800, 1, 'GREMLINS ONLY AT NIGHT', t);
  art.drawSign(ctx, 1100, 800, 1, 'NO COPIES', t, 1);
  ctx.restore();
}

function closeup(t: number) {
  ctx.fillStyle = '#f2f0eb'; ctx.fillRect(0, 0, W, 1000);
  const S = 2.4;
  const row: [string, Bloch][] = [['|0>', B(0, 0)], ['|1>', B(PI, 0)], ['plus', B(PI / 2, 0)], ['minus', B(PI / 2, PI)], ['+i', B(PI / 2, PI / 2)], ['-i', B(PI / 2, -PI / 2)], ['θ=60', B(PI / 3, 0)], ['mixed .3', B(PI / 2, 0, 0.3)]];
  row.forEach(([n, b], i) => { art.drawQubble(ctx, 90 + i * 170, 190, S, { bloch: b, blanket: 0, state: 'sleep' }, t); label(n, 90 + i * 170, 240, 16); });
  [0.25, 0.6, 1].forEach((b, i) => { art.drawQubble(ctx, 100 + i * 170, 420, S, { bloch: B(PI / 2, 0), blanket: b, state: 'sleep' }, t); label('blanket ' + b, 100 + i * 170, 470, 16); });
  art.drawBot(ctx, 640, 420, S, { light: 1, action: 'highfive', facing: 1, label: 'a' }, t);
  art.drawBot(ctx, 800, 420, S, { light: 0, action: 'listen', facing: -1 }, t);
  art.drawQubble(ctx, 980, 420, S, { bloch: B(PI, 0), blanket: 0, state: 'collapsed', label: 'q2' }, t);
  art.drawQubble(ctx, 1180, 420, S, { bloch: B(0, 0), blanket: 0, state: 'sleep', classical: true }, t);
  art.drawGremlin(ctx, 120, 700, S, 'flipper', 'taunt', t);
  art.drawGremlin(ctx, 330, 700, S, 'phasey', 'sneak', t);
  art.drawGremlin(ctx, 540, 700, S, 'wobbles', 'taunt', t);
  art.drawSchrodi(ctx, 800, 700, S, 'deadpan', t);
  art.drawSchrodi(ctx, 1100, 700, S, 'smug', t);
  art.drawLink(ctx, 100, 850, 600, 900, 1, t);
  art.drawSign(ctx, 900, 800, 2, 'NO COPIES', t);
}

let last = performance.now(), frames = 0, fpsT = 0, tAcc = 0, nextBurst = 0;
const fpsEl = document.getElementById('fps')!;
const kinds = ['highfive', 'collapse', 'flip', 'phase', 'wobble', 'win', 'reset'] as const;
document.getElementById('burst')!.onclick = () => kinds.forEach((k, i) => art.burst?.(k, 140 + i * 180, 500));

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!pauseEl.checked) tAcc += dt;
  const t = frozenT ?? tAcc;
  frames++; fpsT += dt; if (fpsT > 0.5) { fpsEl.textContent = `${Math.round(frames / fpsT)} fps`; frames = 0; fpsT = 0; }
  if (frozenT === null && tAcc > nextBurst) { art.burst?.(kinds[Math.floor(Math.random() * kinds.length)], 300 + Math.random() * 800, 380 + Math.random() * 200); nextBurst = tAcc + 1.2; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const night = parseFloat(nightEl.value);
  if (!only || only === 'scene') scene(0, t, night);
  if (!only) { qubbleSheet(760, t); castSheet(1820, t); }
  if (only === 'qubbles') qubbleSheet(0, t);
  if (only === 'cast') castSheet(0, t);
  if (only === 'closeup') closeup(t);
  (window as any).__frameDone = true;
  requestAnimationFrame(frame);
}
art.ready().then(() => {
  if (frozenT !== null) {
    // prime particle demo for screenshots
    kinds.forEach((k, i) => art.burst?.(k, 140 + i * 190, 520));
    art.drawParticles?.(ctx, frozenT - 0.2);
  }
  requestAnimationFrame(frame);
});
