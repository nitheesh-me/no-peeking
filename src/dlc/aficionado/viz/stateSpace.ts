/**
 * Simulator-oracle view of the full state vector. Computational-basis states sit on a recursive hypercube
 * projection (bit i alternates x/z axes; higher bits get wider gaps). Each amplitude is a luminous pillar:
 * height = |a|², hue = arg a (theme phase wheel). Hover shows the exact amplitude. veiled = during execution:
 * fog only, no data in the scene or the DOM; setVeiled(false) lifts the veil slowly.
 */
import { frame, tv, resolveRM, resolveTheme, resolveGL, loop, dprCanvas, damp, clamp, type VizBaseOpts, type VizHandle } from './common';
import { THREE, createGL, col, glowTexture, glowSprite, skyDome, sea, LabelLayer } from './gl';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { phaseRgb, rgba, type AfiTheme } from '../theme/theme';
import { term, ket as ketHtml, num, amp, qubitName } from '../theme/math';
import type { NerdInfo } from '../../../core/contracts';
import type { VizInputLike } from './types';

export interface StateSpaceOpts extends VizBaseOpts { veiled?: boolean; autoRotate?: boolean }
export interface StateSpace extends VizHandle<NerdInfo | VizInputLike> { setVeiled(v: boolean, animate?: boolean): void }

const H = 5.2, G = 2.3, UNIT = 0.9;

/** position of basis state `bits` on the floor (x, z), centred */
export function basisPosition(bits: string): [number, number] {
  const n = bits.length, Lx = Math.ceil(n / 2), Lz = Math.floor(n / 2);
  let x = 0, z = 0, ex = 0, ez = 0;
  for (let i = 0; i < n; i++) {
    const lvl = i >> 1;
    if (i % 2 === 0) { const s = UNIT * Math.pow(G, Lx - 1 - lvl); ex += s; if (bits[i] === '1') x += s; }
    else { const s = UNIT * Math.pow(G, Lz - 1 - lvl); ez += s; if (bits[i] === '1') z += s; }
  }
  return [x - ex / 2, z - ez / 2];
}

interface Pillar { ket: string; x: number; z: number; h: number; th: number; c: THREE.Color; tc: THREE.Color; re: number; im: number }

export function createStateSpace(host: HTMLElement, opts: StateSpaceOpts = {}): StateSpace {
  const th = resolveTheme(opts), rm = resolveRM(opts), useGL = resolveGL(opts);
  const f = frame(host, 'afi-statespace', tv('stateSpace.aria'));
  f.mountChrome();
  const order = document.createElement('div');
  order.className = 'afi-caption';
  order.style.cssText = 'position:absolute;right:14px;top:10px;pointer-events:none';
  f.root.appendChild(order);
  let veiled = !!opts.veiled;
  let veil = veiled ? 1 : 0;        // displayed veil amount (0..1)
  let data: NerdInfo | null = null;
  const setCap = () => f.setCaption(opts.caption ?? (veiled ? tv('veiled') : tv('oracle')));
  setCap();
  const impl = useGL ? glImpl(f, th, rm, opts) : canvasImpl(f, th);
  const describe = () => {
    if (veiled || !data) { f.root.setAttribute('aria-label', tv('stateSpace.aria') + '. ' + tv('veiled')); order.textContent = ''; return; }
    const top = data.amps.slice(0, 4).map((a) => amp(a.re, a.im, false) + '|' + a.ket + '⟩').join(' + ');
    f.root.setAttribute('aria-label', tv('stateSpace.aria') + '. ' + top);
    order.textContent = tv('stateSpace.order', { order: data.order.map(qubitName).join(' ') });
  };
  const api: StateSpace = {
    update(input) {
      const nerd = (input as VizInputLike).nerd ?? (input as NerdInfo);
      if ((input as VizInputLike).veiled !== undefined && (input as VizInputLike).veiled !== veiled) api.setVeiled(!!(input as VizInputLike).veiled);
      data = nerd;
      impl.setStructure(nerd.order.length);
      if (!veiled) impl.setData(nerd);
      describe();
    },
    setVeiled(v, animate = true) {
      veiled = v; setCap();
      if (!v && data) impl.setData(data);
      if (v) impl.setData(null);
      impl.setVeil(v ? 1 : 0, animate && !rm);
      describe();
    },
    destroy() { impl.destroy(); f.destroy(); },
  };
  impl.setVeil(veil, false);
  void veil;
  return api;
}

type Frame = ReturnType<typeof frame>;
interface Impl { setStructure(n: number): void; setData(n: NerdInfo | null): void; setVeil(v: number, animate: boolean): void; destroy(): void }

function glImpl(f: Frame, th: AfiTheme, rm: boolean, opts: StateSpaceOpts): Impl {
  const gl = createGL(f.root, th, undefined, 38);
  const { scene, camera, renderer } = gl;
  scene.fog = new THREE.FogExp2(col(th.fog), 0.02);
  const glow = glowTexture();
  scene.add(skyDome(th));
  const SEA = -0.9;
  scene.add(sea(th, SEA, 60));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.autoRotate = !rm && (opts.autoRotate ?? true); controls.autoRotateSpeed = 0.35;
  controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 4; controls.maxDistance = 60;

  // basis lattice: points + hypercube edges (structure of the space, not data)
  const latticeGrp = new THREE.Group();
  scene.add(latticeGrp);
  let latticeN = -1;
  const buildLattice = (n: number) => {
    if (n === latticeN) return;
    latticeN = n;
    latticeGrp.children.slice().forEach((c) => { latticeGrp.remove(c); (c as THREE.Mesh).geometry.dispose(); ((c as THREE.Mesh).material as THREE.Material).dispose(); });
    if (n > 12) return;
    const N = 1 << n, pos = new Float32Array(N * 3), edges: number[] = [];
    const bitsOf = (i: number) => i.toString(2).padStart(n, '0');
    for (let i = 0; i < N; i++) { const [x, z] = basisPosition(bitsOf(i)); pos.set([x, 0, z], i * 3); }
    if (n <= 9) for (let i = 0; i < N; i++) for (let b = 0; b < n; b++) { const j = i ^ (1 << b); if (j > i) edges.push(...pos.subarray(i * 3, i * 3 + 3), ...pos.subarray(j * 3, j * 3 + 3)); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    latticeGrp.add(new THREE.Points(pg, new THREE.PointsMaterial({ map: glow, color: col(th.ink3), size: 0.45, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })));
    if (edges.length) {
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges), 3));
      latticeGrp.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: col(th.accent), transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending })));
    }
    // frame the camera on the lattice extent
    let ext = 1; for (let i = 0; i < N; i++) ext = Math.max(ext, Math.abs(pos[i * 3]), Math.abs(pos[i * 3 + 2]));
    const d = Math.max(13, ext * 3.4);
    camera.position.set(d * 0.5, d * 0.42, d * 0.78);
    controls.target.set(0, H * 0.16, 0);
    controls.update();
  };

  // pillars: instanced hex prisms, base at y = 0, unit height; colour per instance
  const MAX = 256;
  const geo = new THREE.CylinderGeometry(0.17, 0.17, 1, 6, 1).translate(0, 0.5, 0);
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: true,
    uniforms: { lift: { value: 1 } },
    vertexShader: `varying float vY; varying vec3 vC; varying vec3 vN; varying vec3 vV;
      void main(){ vY = position.y; vC = instanceColor; vec4 w = modelMatrix*instanceMatrix*vec4(position,1.);
        vN = normalize(mat3(modelMatrix*instanceMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float lift; varying float vY; varying vec3 vC; varying vec3 vN; varying vec3 vV;
      void main(){ float rim = pow(1.0-abs(dot(vN,vV)),2.0); vec3 c = vC*(0.28+1.05*pow(vY,1.6)) + vC*rim*0.5;
        gl_FragColor = vec4(c, (0.55+0.45*vY)*lift); }`,
  });
  const pillars = new THREE.InstancedMesh(geo, pMat, MAX);
  pillars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  pillars.count = 0;
  pillars.frustumCulled = false;
  scene.add(pillars);
  const mMat = pMat.clone(); mMat.uniforms.lift.value = 0.22;
  const mirror = new THREE.InstancedMesh(geo, mMat, MAX);
  mirror.instanceMatrix = pillars.instanceMatrix; mirror.instanceColor = pillars.instanceColor;
  mirror.scale.y = -1; mirror.position.y = 2 * SEA; mirror.renderOrder = -2; mirror.frustumCulled = false;
  scene.add(mirror);
  // glowing caps
  const capPos = new Float32Array(MAX * 3), capCol = new Float32Array(MAX * 3);
  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.BufferAttribute(capPos, 3));
  capGeo.setAttribute('color', new THREE.BufferAttribute(capCol, 3));
  const caps = new THREE.Points(capGeo, new THREE.PointsMaterial({ map: glow, vertexColors: true, size: 1.1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  caps.frustumCulled = false;
  scene.add(caps);

  // veil: drifting fog banks (decoration that hides, never data)
  const veilGrp = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const s = glowSprite(glow, i % 3 ? th.horizon : th.ink3, 7 + Math.random() * 7, 0);
    s.position.set((Math.random() - 0.5) * 14, Math.random() * 4, (Math.random() - 0.5) * 14);
    s.userData.base = s.position.clone(); s.userData.ph = Math.random() * 6.28;
    veilGrp.add(s);
  }
  scene.add(veilGrp);

  const labels = new LabelLayer(f.labels);
  const pill = new Map<string, Pillar>();
  let list: Pillar[] = [];
  let veilAmt = 0, veilTarget = 0, veilAnim = true;
  const m4 = new THREE.Matrix4(), tmpC = new THREE.Color();
  const applyLabels = () => {
    labels.clear();
    list.filter((p) => p.th > 0.002).sort((a, b) => b.th - a.th).slice(0, 8).forEach((p) => {
      p.c && labels.add(ketHtml(p.ket), new THREE.Vector3(p.x, 0, p.z), '', 0);
    });
  };
  const sync = () => {
    let k = 0, maxH = 0;
    const rise = 1 - veilAmt;
    for (const p of list) {
      const h = Math.max(0.0001, p.h * H * th.motion.easeFn(clamp(rise * 1.3 - Math.hypot(p.x, p.z) * 0.04)));
      m4.makeScale(1, h, 1).setPosition(p.x, 0, p.z);
      pillars.setMatrixAt(k, m4);
      pillars.setColorAt(k, p.c);
      capPos.set([p.x, h + 0.02, p.z], k * 3);
      tmpC.copy(p.c).multiplyScalar(Math.min(1, 0.25 + p.h * 3) * rise);
      capCol.set([tmpC.r, tmpC.g, tmpC.b], k * 3);
      maxH = Math.max(maxH, h);
      k++;
    }
    pillars.count = mirror.count = k;
    capGeo.setDrawRange(0, k);
    pillars.instanceMatrix.needsUpdate = true;
    if (pillars.instanceColor) pillars.instanceColor.needsUpdate = true;
    capGeo.attributes.position.needsUpdate = true; capGeo.attributes.color.needsUpdate = true;
    labels.items.forEach((it) => { const p = list.find((q) => it.el.textContent === `|${q.ket}⟩`); if (p) it.pos.set(p.x, Math.max(0.0001, p.h * H * rise) + 0.45, p.z); it.el.style.opacity = String(rise); });
  };
  let animating = true;
  const lp = loop(f.root, (dt, t) => {
    let moving = false;
    for (const p of list) {
      const nh = rm ? p.th : damp(p.h, p.th, 3.2, dt);
      if (Math.abs(nh - p.h) > 1e-4) moving = true;
      p.h = nh;
      if (rm) p.c.copy(p.tc); else p.c.lerp(p.tc, 1 - Math.exp(-4 * dt));
    }
    list = list.filter((p) => p.th > 0 || p.h > 1e-3 || (pill.delete(p.ket) && false));
    const nv = veilAnim ? damp(veilAmt, veilTarget, veilTarget < veilAmt ? 1.4 : 2.5, dt) : veilTarget;
    if (Math.abs(nv - veilAmt) > 1e-4) moving = true;
    veilAmt = Math.abs(nv - veilTarget) < 1e-3 ? veilTarget : nv;
    (scene.fog as THREE.FogExp2).density = 0.02 + 0.09 * veilAmt;
    veilGrp.children.forEach((s, i) => {
      const sp = s as THREE.Sprite;
      (sp.material as THREE.SpriteMaterial).opacity = 0.22 * veilAmt;
      if (!rm) sp.position.set(sp.userData.base.x + Math.sin(t * 0.07 + sp.userData.ph) * 1.5, sp.userData.base.y + Math.sin(t * 0.11 + i) * 0.3, sp.userData.base.z + Math.cos(t * 0.05 + sp.userData.ph) * 1.5);
    });
    latticeGrp.visible = true;
    sync();
    controls.update();
    labels.update(camera, gl.w, gl.h);
    gl.render();
    animating = moving;
  });
  void animating;

  // hover
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const onMove = (e: PointerEvent) => {
    if (veilTarget > 0) { f.hideTip(); return; }
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObject(pillars)[0];
    const p = hit?.instanceId != null ? list[hit.instanceId] : undefined;
    if (p && p.th > 0) f.showTip(`${term(p.re, p.im, p.ket)} <span class="afi-caption">${tv('stateSpace.tip', { p: num(p.re * p.re + p.im * p.im, 3) })}</span>`, e.clientX - r.left, e.clientY - r.top);
    else f.hideTip();
  };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerleave', () => f.hideTip());

  camera.position.set(9, 7, 13); controls.target.set(0, 1, 0); controls.update();
  return {
    setStructure: buildLattice,
    setData(n) {
      if (!n) { for (const p of list) p.th = 0; labels.clear(); return; }
      buildLattice(n.order.length);
      const seen = new Set<string>();
      for (const a of n.amps.slice(0, MAX)) {
        seen.add(a.ket);
        let p = pill.get(a.ket);
        const [x, z] = basisPosition(a.ket);
        const rgb = phaseRgb(Math.atan2(a.im, a.re), th);
        if (!p) { p = { ket: a.ket, x, z, h: 0, th: 0, c: new THREE.Color(rgb[0], rgb[1], rgb[2]), tc: new THREE.Color(), re: 0, im: 0 }; pill.set(a.ket, p); list.push(p); }
        p.x = x; p.z = z; p.th = a.re * a.re + a.im * a.im; p.re = a.re; p.im = a.im;
        p.tc.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      }
      for (const p of list) if (!seen.has(p.ket)) p.th = 0;
      applyLabels();
    },
    setVeil(v, animate) { veilTarget = v; veilAnim = animate; if (!animate) veilAmt = v; },
    destroy() { lp.stop(); controls.dispose(); labels.clear(); renderer.domElement.removeEventListener('pointermove', onMove); geo.dispose(); mMat.dispose(); gl.destroy(); },
  };
}

/** 2D fallback: isometric canvas with the same layout and encodings. */
function canvasImpl(f: Frame, th: AfiTheme): Impl {
  let data: NerdInfo | null = null, veil = 0;
  let hits: { x: number; y: number; w: number; h: number; a: NerdInfo['amps'][number] }[] = [];
  const cv = dprCanvas(f.root, () => draw());
  function draw() {
    const { g, w, h } = cv;
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, th.bg[0]); bg.addColorStop(1, th.bg[2]);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    hits = [];
    if (data) {
      const n = data.order.length;
      const N = n <= 10 ? 1 << n : 0;
      let ext = 1;
      for (let i = 0; i < N; i++) { const [x, z] = basisPosition(i.toString(2).padStart(n, '0')); ext = Math.max(ext, Math.abs(x), Math.abs(z)); }
      const s = Math.min(w / (ext * 4), h / (ext * 1.6 + H * 1.1));
      const iso = (x: number, y: number, z: number) => ({ x: w / 2 + (x - z) * s * 0.87, y: h * 0.58 + (x + z) * s * 0.5 - y * s });
      g.fillStyle = rgba(th.ink2, 0.9);
      for (let i = 0; i < N; i++) { const [x, z] = basisPosition(i.toString(2).padStart(n, '0')); const p = iso(x, 0, z); g.beginPath(); g.arc(p.x, p.y, 1.8, 0, 6.283); g.fill(); }
      if (veil < 0.5) {
        const amps = [...data.amps].sort((a, b) => { const [ax, az] = basisPosition(a.ket), [bx, bz] = basisPosition(b.ket); return ax + az - (bx + bz); });
        for (const a of amps) {
          const [x, z] = basisPosition(a.ket);
          const p2 = a.re * a.re + a.im * a.im;
          const b0 = iso(x, 0, z), b1 = iso(x, p2 * H, z);
          const [r, gg, bb] = phaseRgb(Math.atan2(a.im, a.re), th);
          const c = `rgb(${r * 255 | 0},${gg * 255 | 0},${bb * 255 | 0})`;
          const grd = g.createLinearGradient(0, b0.y, 0, b1.y);
          grd.addColorStop(0, rgba(th.bg[0], 0)); grd.addColorStop(1, c);
          g.fillStyle = grd; g.fillRect(b1.x - 4, b1.y, 8, b0.y - b1.y);
          g.fillStyle = c; g.beginPath(); g.arc(b1.x, b1.y, 4, 0, 6.283); g.fill();
          hits.push({ x: b1.x - 6, y: b1.y - 6, w: 12, h: b0.y - b1.y + 12, a });
        }
      }
    }
    if (veil > 0) {
      const fg = g.createRadialGradient(w / 2, h * 0.6, 10, w / 2, h * 0.6, Math.max(w, h) * 0.7);
      fg.addColorStop(0, rgba(th.horizon, 0.45 * veil)); fg.addColorStop(1, rgba(th.fog, 0.85 * veil));
      g.fillStyle = fg; g.fillRect(0, 0, w, h);
    }
  }
  const onMove = (e: PointerEvent) => {
    const r = cv.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = hits.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    if (hit) f.showTip(`${term(hit.a.re, hit.a.im, hit.a.ket)} <span class="afi-caption">${tv('stateSpace.tip', { p: num(hit.a.re ** 2 + hit.a.im ** 2, 3) })}</span>`, x, y); else f.hideTip();
  };
  cv.canvas.addEventListener('pointermove', onMove);
  return {
    setStructure() {},
    setData(n) { if (n) data = n; draw(); },
    setVeil(v) { veil = v; draw(); },
    destroy() { cv.canvas.removeEventListener('pointermove', onMove); cv.destroy(); },
  };
}

export const mount = (host: HTMLElement, input: VizInputLike) => {
  const v = createStateSpace(host, { reducedMotion: input.reducedMotion, webgl: input.webgl, veiled: input.veiled, caption: '' });
  v.update(input);
  return v;
};
