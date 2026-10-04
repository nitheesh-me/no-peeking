// Motion page. URL: index.html?scene=<name>&p=<json params>&scale=2&alpha=0[&preview=1]
// Exposes window.__motion = { ready, info, render(f) } for render.mjs. Every scene draws frame f from
// scratch (pure function of f + params), so frames can be rendered in any order, in parallel.
import { W, H, RT, type Scene } from './lib/core';
import { SCENES } from './scenes';

async function loadFonts() {
  const faces = [
    new FontFace('Quicksand', 'url(/fonts/Quicksand.woff2)', { weight: '300 700' }),
    new FontFace('Quantum', 'url(/fonts/Quantum.woff2)'),
  ];
  for (const f of faces) document.fonts.add(await f.load());
  await document.fonts.ready;
}

const q = new URLSearchParams(location.search);
const name = q.get('scene') ?? 'logo';
const scale = Number(q.get('scale') ?? 2);
const alpha = q.get('alpha') === '1';
const raw = JSON.parse(q.get('p') ?? '{}');
RT.dpr = scale;

const scene: Scene = SCENES[name];
if (!scene) throw new Error(`unknown scene ${name}; have ${Object.keys(SCENES).join(', ')}`);
const params = scene.resolve(alpha ? { ...raw, bg: 'none' } : raw);

const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
canvas.style.width = `${canvas.width}px`; canvas.style.height = `${canvas.height}px`;
if (!alpha) document.body.style.background = '#000';
const ctx = canvas.getContext('2d', { alpha: true })!;

function render(f: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!alpha) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.save();
  scene.render(ctx, f, params);
  ctx.restore();
  return true;
}

const ready = (async () => {
  await loadFonts();
  await scene.prepare?.(params);
  return true;
})();

(window as any).__motion = {
  ready,
  info: () => ({ scene: name, params, frames: scene.frames(params), markers: scene.markers?.(params) ?? {}, width: canvas.width, height: canvas.height }),
  render,
  /** Render frame f and return it as a lossless PNG (base64). ~8× faster than a CDP screenshot at 4K. */
  png: (f: number) => {
    render(f);
    return new Promise<string>((res) => canvas.toBlob((b) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).slice(String(r.result).indexOf(',') + 1));
      r.readAsDataURL(b!);
    }, 'image/png'));
  },
};

if (q.get('preview') === '1') {
  ready.then(() => {
    const ui = document.getElementById('ui')!; ui.style.display = 'flex';
    const sc = document.getElementById('scrub') as HTMLInputElement, fr = document.getElementById('fr')!;
    const n = scene.frames(params);
    sc.max = String(n - 1);
    canvas.style.width = '100vw'; canvas.style.height = 'auto';
    let playing = false, f = 0;
    const show = () => { render(f); sc.value = String(f); fr.textContent = `${f}/${n}`; };
    sc.oninput = () => { f = Number(sc.value); show(); };
    document.getElementById('play')!.onclick = () => { playing = !playing; };
    const tick = () => { if (playing) { f = (f + 1) % n; show(); } requestAnimationFrame(tick); };
    show(); tick();
  });
}
