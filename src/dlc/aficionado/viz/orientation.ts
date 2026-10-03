/**
 * First-entry orientation (≈18 s, skippable). A single Bloch sphere in fog; the camera pulls back to reveal it is
 * one point of a vast dim lattice: a captioned METAPHOR for the 2ⁿ growth of the state space. Dark reflective
 * sea, horizon glow. Reduced motion: one static composition + a continue button. No WebGL: 2D canvas version.
 */
import { frame, tv, resolveRM, resolveTheme, resolveGL, loop, dprCanvas, clamp, type VizBaseOpts } from './common';
import { THREE, createGL, col, glowTexture, skyDome, sea, mirrorOf, dust, glowSprite, LabelLayer } from './gl';
import { createBlochMesh } from './blochMesh';
import { rgba, type AfiTheme } from '../theme/theme';
import { toSup } from '../theme/math';

export interface OrientationOpts extends VizBaseOpts {
  /** total length in ms (default 18000) */
  durationMs?: number;
  /** caption beats; default afi.viz.orientation.c1..c3 */
  captions?: { at: number; text: string }[];
}
export interface Orientation { done: Promise<void>; skip(): void; destroy(): void; update(_?: unknown): void }

const SPACING = 3, NX = 15, NY0 = -1, NY1 = 5;

export function playOrientation(host: HTMLElement, opts: OrientationOpts = {}): Orientation {
  const th = resolveTheme(opts), rm = resolveRM(opts), useGL = resolveGL(opts);
  const dur = opts.durationMs ?? 18000;
  const caps = opts.captions ?? [
    { at: 0.04, text: tv('orientation.c1') },
    { at: 0.36, text: tv('orientation.c2') },
    { at: 0.66, text: tv('orientation.c3') },
  ];
  const f = frame(host, 'afi-orientation', tv('orientation.aria'));
  f.root.style.borderRadius = '0';
  // overlay: caption, counter, skip
  const capEl = document.createElement('div');
  capEl.style.cssText = `position:absolute;left:50%;bottom:12%;transform:translateX(-50%);max-width:min(760px,86%);text-align:center;font-family:${th.fonts.prose};font-size:calc(19px*var(--afi-scale,1));color:${th.ink};letter-spacing:.02em;opacity:0;transition:opacity ${th.motion.slow}ms ${th.motion.ease};text-shadow:0 0 18px ${th.bg[0]}`;
  const counter = document.createElement('div');
  counter.className = 'afi-mono';
  counter.style.cssText = `position:absolute;left:28px;top:24px;font-size:calc(13px*var(--afi-scale,1));color:${th.ink2};letter-spacing:.08em;opacity:0;transition:opacity ${th.motion.slow}ms`;
  const skipBtn = document.createElement('button');
  skipBtn.className = 'afi-viz-btn';
  skipBtn.textContent = rm ? tv('orientation.continue') : tv('orientation.skip');
  skipBtn.style.cssText = 'position:absolute;right:24px;top:20px;z-index:3';
  const fade = document.createElement('div');
  fade.style.cssText = `position:absolute;inset:0;background:${th.bg[0]};opacity:1;pointer-events:none;transition:opacity ${th.motion.slow}ms ${th.motion.ease}`;
  f.mountChrome();
  f.setCaption(opts.caption ?? tv('orientation.metaphor'));
  f.root.append(capEl, counter, skipBtn, fade);

  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  let finished = false, destroyed = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    fade.style.opacity = '1';
    window.setTimeout(resolveDone, rm ? 0 : th.motion.slow);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } };
  window.addEventListener('keydown', onKey);
  skipBtn.onclick = finish;
  requestAnimationFrame(() => { fade.style.opacity = '0'; });

  let capIdx = -1;
  const setBeat = (u: number) => {
    if (rm) return;
    let k = -1;
    caps.forEach((c, i) => { if (u >= c.at) k = i; });
    if (k !== capIdx) {
      capIdx = k;
      capEl.style.opacity = '0';
      window.setTimeout(() => { if (k >= 0) { capEl.textContent = caps[k].text; capEl.style.opacity = '1'; } }, capIdx === 0 ? 0 : 500);
    }
    const n = Math.max(1, Math.min(20, Math.round(1 + Math.pow(clamp((u - 0.3) / 0.6), 1.4) * 19)));
    counter.textContent = `n = ${n}    2${toSup('n')} = ${(2 ** n).toLocaleString('en-US')}`;
    counter.style.opacity = u > 0.3 ? '1' : '0';
  };

  // camera path (shared by GL and 2D): distance and height over normalised time u
  const ease = th.motion.easeFn;
  const camAt = (u: number) => {
    const p = ease(clamp((u - 0.12) / 0.8));
    const dist = 3.4 + p * 44, height = 0.35 + p * 13, ang = -0.25 + p * 0.9;
    return { x: Math.sin(ang) * dist, y: height, z: Math.cos(ang) * dist, look: p * 4.5 };
  };
  const latticeAlpha = (u: number) => clamp((u - 0.18) / 0.4);

  let teardown = () => {};
  if (useGL) teardown = glScene(f.root, th, rm, dur, camAt, latticeAlpha, setBeat, finish, () => finished);
  else teardown = canvasScene(f.root, th, rm, dur, camAt, latticeAlpha, setBeat, finish, () => finished);
  if (rm) { capEl.style.transition = 'none'; capEl.innerHTML = caps.map((c) => `<div style="margin:.35em 0">${c.text.replace(/[<>&]/g, '')}</div>`).join(''); capEl.style.opacity = '1'; counter.style.opacity = '1'; counter.textContent = `n = 20    2${toSup('n')} = ${(2 ** 20).toLocaleString('en-US')}`; }

  return {
    done,
    skip: finish,
    update() {},
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('keydown', onKey);
      teardown();
      f.destroy();
      resolveDone();
    },
  };
}

type CamFn = (u: number) => { x: number; y: number; z: number; look: number };

function latticePoints(): Float32Array {
  const pts: number[] = [];
  for (let i = -NX; i <= NX; i++) for (let j = NY0; j <= NY1; j++) for (let k = -NX; k <= NX; k++) {
    if (i === 0 && j === 0 && k === 0) continue;
    pts.push(i * SPACING, j * SPACING, k * SPACING);
  }
  return new Float32Array(pts);
}

function glScene(root: HTMLElement, th: AfiTheme, rm: boolean, dur: number, camAt: CamFn, latA: (u: number) => number, beat: (u: number) => void, finish: () => void, isDone: () => boolean): () => void {
  const gl = createGL(root, th, undefined, 45);
  const { scene, camera } = gl;
  scene.fog = new THREE.FogExp2(col(th.fog), 0.03);
  const glow = glowTexture();
  scene.add(skyDome(th));
  const SEA = -4.2;
  scene.add(sea(th, SEA));
  const bloch = createBlochMesh(th, glow, 1);
  bloch.setVector({ x: Math.sin(1.05) * Math.cos(0.8), y: Math.sin(1.05) * Math.sin(0.8), z: Math.cos(1.05) });
  scene.add(bloch.group);
  // lattice of points (decorative metaphor) + faint local edges
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(latticePoints(), 3));
  const pMat = new THREE.PointsMaterial({ map: glow, color: col(th.accent), size: 0.55, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(geo, pMat);
  scene.add(pts);
  const ptsMirror = mirrorOf(pts, SEA, 0.3);
  const blochMirror = mirrorOf(bloch.group, SEA, 0.25);
  scene.add(ptsMirror, blochMirror);
  const mirMat = ((ptsMirror.userData.mirror as THREE.Points).material as THREE.PointsMaterial);
  const edges: number[] = [];
  const R = 3;
  for (let i = -R; i <= R; i++) for (let j = 0; j <= 2; j++) for (let k = -R; k <= R; k++) {
    const a = [i * SPACING, j * SPACING, k * SPACING];
    if (i < R) edges.push(...a, (i + 1) * SPACING, a[1], a[2]);
    if (j < 2) edges.push(...a, a[0], (j + 1) * SPACING, a[2]);
    if (k < R) edges.push(...a, a[0], a[1], (k + 1) * SPACING);
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges), 3));
  const eMat = new THREE.LineBasicMaterial({ color: col(th.accent), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.LineSegments(eGeo, eMat));
  const halo = glowSprite(glow, th.accent, 3, 0);
  scene.add(halo);
  const d = dust(th, glow, 500, 60, 16);
  scene.add(d.points);
  const labels = new LabelLayer(root.querySelector('.afi-viz-labels') as HTMLElement);
  const l0 = labels.add('|0⟩', new THREE.Vector3(0, 1.28, 0), 'strong');
  const l1 = labels.add('|1⟩', new THREE.Vector3(0, -1.3, 0), 'strong');

  const look = new THREE.Vector3();
  const place = (u: number) => {
    const c = camAt(u);
    camera.position.set(c.x, c.y, c.z);
    look.set(0, c.look, 0);
    camera.lookAt(look);
    const a = latA(u);
    pMat.opacity = 0.85 * a;
    halo.scale.setScalar(2.5 + 0.12 * camera.position.length());
    (halo.material as THREE.SpriteMaterial).opacity = 0.5 * clamp((u - 0.3) / 0.3);
    mirMat.opacity = 0.14 * a;
    eMat.opacity = 0.14 * a * (1 - clamp((u - 0.7) / 0.3) * 0.6);
    (scene.fog as THREE.FogExp2).density = 0.07 - 0.05 * clamp(u / 0.8);
    const lab = String(1 - clamp((u - 0.15) / 0.1));
    l0.style.opacity = lab; l1.style.opacity = lab;
    labels.update(camera, gl.w, gl.h);
  };
  if (rm) { place(0.82); beat(0.99); gl.render(); return () => { labels.clear(); gl.destroy(); }; }
  let ended = false;
  const lp = loop(root, (dt, t) => {
    const u = clamp((t * 1000) / dur);
    bloch.group.rotation.y += dt * 0.12;
    (blochMirror.userData.mirror as THREE.Object3D).rotation.y = bloch.group.rotation.y;
    d.tick(dt);
    place(u);
    beat(u);
    gl.render();
    if (u >= 1 && !ended && !isDone()) { ended = true; finish(); }
  });
  return () => { lp.stop(); labels.clear(); gl.destroy(); };
}

function canvasScene(root: HTMLElement, th: AfiTheme, rm: boolean, dur: number, camAt: CamFn, latA: (u: number) => number, beat: (u: number) => void, finish: () => void, isDone: () => boolean): () => void {
  const cv = dprCanvas(root);
  const pts = latticePoints();
  void pts; void camAt;
  // 2D version: the same story as a zoom-out on a flat lattice of points (one of which is the sphere)
  const draw = (u: number) => {
    const { g, w, h } = cv;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, th.bg[0]); sky.addColorStop(0.7, th.bg[2]); sky.addColorStop(0.74, th.horizon); sky.addColorStop(0.78, th.sea); sky.addColorStop(1, th.bg[0]);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const p = th.motion.easeFn(clamp((u - 0.12) / 0.8));
    const R = Math.min(w, h) * 0.3 * Math.pow(0.04, p), cx = w / 2, cy = h * 0.42;
    const sp = R * 3.2, a = latA(u);
    if (a > 0 && sp > 2) {
      const nx = Math.ceil(w / sp / 2) + 1, ny = Math.ceil(h / sp / 2) + 1;
      for (let i = -nx; i <= nx; i++) for (let j = -ny; j <= ny; j++) {
        if (!i && !j) continue;
        const x = cx + i * sp, y = cy + j * sp, d = Math.hypot(i, j);
        g.fillStyle = rgba(th.accent, a * 0.75 * Math.exp(-d * 0.05));
        g.beginPath(); g.arc(x, y, Math.max(0.8, R * 0.18), 0, 6.283); g.fill();
      }
    }
    const grd = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    grd.addColorStop(0, rgba(th.accent, 0.03)); grd.addColorStop(1, rgba(th.accent, 0.4));
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, R, 0, 6.283); g.fill();
    g.strokeStyle = rgba(th.accent, 0.5); g.lineWidth = 1;
    g.beginPath(); g.ellipse(cx, cy, R, R * 0.28, 0, 0, 6.283); g.stroke();
    g.strokeStyle = th.accent2; g.lineWidth = Math.max(1, R * 0.02);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * 0.5, cy - R * 0.6); g.stroke();
  };
  if (rm) { draw(0.82); beat(0.99); return () => cv.destroy(); }
  let ended = false;
  const lp = loop(root, (_dt, t) => {
    const u = clamp((t * 1000) / dur);
    draw(u); beat(u);
    if (u >= 1 && !ended && !isDone()) { ended = true; finish(); }
  });
  return () => { lp.stop(); cv.destroy(); };
}

export const createOrientation = playOrientation;
