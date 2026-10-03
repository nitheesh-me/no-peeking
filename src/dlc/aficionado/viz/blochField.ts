/**
 * Reduced single-qubit states for every qubit: Bloch spheres (|r| < 1 ⇒ arrow inside, mixed by entanglement),
 * with purity Tr ρ² and entropy S labels. Entanglement filaments between spheres: thickness and brightness ∝
 * mutual information I(A:B) in bits (0..2). With opts.braid, a pair at I = 2 (maximal) braids into a double helix,
 * animated the first time it appears.
 */
import { veilable, frame, tv, resolveRM, resolveTheme, resolveGL, loop, dprCanvas, damp, clamp, type VizBaseOpts, type VizHandle } from './common';
import { THREE, createGL, col, glowTexture, skyDome, sea, LabelLayer, blochToThree } from './gl';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBlochMesh, type BlochMesh } from './blochMesh';
import { rgba, type AfiTheme } from '../theme/theme';
import { num, qubitName } from '../theme/math';
import type { NerdInfo, QubitId } from '../../../core/contracts';
import type { VizInputLike } from './types';

export interface BlochFieldOpts extends VizBaseOpts {
  /** enable the I = 2 braid (layer 'filaments'); default true */
  braid?: boolean;
  /** show filaments at all (layer 'filaments'); default true */
  filaments?: boolean;
  /** called once per pair the first time it braids */
  onBraid?(a: QubitId, b: QubitId): void;
  /** restrict / order the qubits shown (default: nerd.order) */
  qubits?: QubitId[];
}
export type BlochField = VizHandle<NerdInfo | VizInputLike>;

const SP = 3.1, MI_MIN = 0.02;
const layoutOf = (n: number) => {
  const cols = n <= 6 ? n : Math.ceil(Math.sqrt(n * 1.6));
  return (i: number) => { const r = Math.floor(i / cols), c = i % cols, rowN = Math.min(cols, n - r * cols); return { x: (c - (rowN - 1) / 2) * SP, z: r * SP * 1.05 }; };
};

export function createBlochField(host: HTMLElement, opts: BlochFieldOpts = {}): BlochField {
  const th = resolveTheme(opts), rm = resolveRM(opts), useGL = resolveGL(opts);
  const f = frame(host, 'afi-blochfield', tv('bloch.aria'));
  f.mountChrome();
  f.setCaption(opts.caption ?? tv('oracle'));
  const impl = useGL ? glImpl(f, th, rm, opts) : canvasImpl(f, th, opts);
  return {
    update(input) {
      const nerd = (input as VizInputLike).nerd ?? (input as NerdInfo);
      const ids = (opts.qubits ?? nerd.order).filter((q) => nerd.reduced[q]);
      impl.set(nerd, ids);
      f.root.setAttribute('aria-label', tv('bloch.aria') + '. ' + ids.map((q) => `${qubitName(q)}: ${tv('bloch.purity', { v: num(nerd.reduced[q].purity) })}`).join('; '));
    },
    destroy() { impl.destroy(); f.destroy(); },
  };
}

type Frame = ReturnType<typeof frame>;
interface Pair { a: number; b: number; I: number }
const pairsOf = (nerd: NerdInfo, ids: QubitId[]): Pair[] => {
  const idx = ids.map((q) => nerd.order.indexOf(q));
  const out: Pair[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const I = nerd.mi[idx[i]]?.[idx[j]] ?? 0;
    if (I > MI_MIN) out.push({ a: i, b: j, I: Math.min(2, I) });
  }
  return out;
};

function glImpl(f: Frame, th: AfiTheme, rm: boolean, opts: BlochFieldOpts) {
  const gl = createGL(f.root, th, undefined, 36);
  const { scene, camera, renderer } = gl;
  scene.fog = new THREE.FogExp2(col(th.fog), 0.018);
  const glow = glowTexture();
  scene.add(skyDome(th));
  scene.add(sea(th, -1.9, 60));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.5; controls.minDistance = 4; controls.maxDistance = 50;
  const labels = new LabelLayer(f.labels);
  let spheres: { q: QubitId; m: BlochMesh; cur: THREE.Vector3; tgt: THREE.Vector3; pos: THREE.Vector3 }[] = [];
  const filGrp = new THREE.Group();
  scene.add(filGrp);
  const braidSeen = new Set<string>();
  let fils: { key: string; mats: THREE.ShaderMaterial[]; I: number; braid: boolean; born: number }[] = [];
  let clock = 0;
  const filMat = (I: number) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { c1: { value: col(th.accent) }, c2: { value: col(th.accent2) }, I: { value: I }, t: { value: 0 }, flash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 c1; uniform vec3 c2; uniform float I; uniform float t; uniform float flash; varying vec2 vUv;
      void main(){ float k = I/2.0; float pulse = 0.65 + 0.35*sin(vUv.x*26.0 - t*1.6);
        float edge = smoothstep(0.0, 0.08, vUv.x)*smoothstep(1.0, 0.92, vUv.x);
        vec3 c = mix(c1, c2, 0.5 - 0.5*cos(vUv.x*6.2832)) * (0.18 + 0.95*k) * pulse * edge;
        gl_FragColor = vec4(c*(1.0+flash*2.0), 1.0); }`,
  });
  const curveBetween = (p: THREE.Vector3, q: THREE.Vector3) => {
    const mid = p.clone().add(q).multiplyScalar(0.5);
    mid.y += 1.25 + p.distanceTo(q) * 0.22;
    return new THREE.QuadraticBezierCurve3(p.clone().add(new THREE.Vector3(0, 1.0, 0)), mid, q.clone().add(new THREE.Vector3(0, 1.0, 0)));
  };
  class Helix extends THREE.Curve<THREE.Vector3> {
    constructor(private base: THREE.Curve<THREE.Vector3>, private turns: number, private phase: number, private r: number) { super(); }
    getPoint(u: number, out = new THREE.Vector3()) {
      const p = this.base.getPoint(u), tg = this.base.getTangent(u);
      const n = new THREE.Vector3(0, 1, 0).cross(tg).normalize(), b = tg.clone().cross(n).normalize();
      const a = u * this.turns * Math.PI * 2 + this.phase, env = Math.sin(Math.PI * u);
      return out.copy(p).addScaledVector(n, Math.cos(a) * this.r * env).addScaledVector(b, Math.sin(a) * this.r * env);
    }
  }
  const buildFils = (pairs: Pair[]) => {
    filGrp.children.slice().forEach((c) => { filGrp.remove(c); (c as THREE.Mesh).geometry.dispose(); ((c as THREE.Mesh).material as THREE.Material).dispose(); });
    const old = new Map(fils.map((x) => [x.key, x]));
    fils = [];
    if (opts.filaments === false) return;
    for (const pr of pairs) {
      const A = spheres[pr.a], B = spheres[pr.b];
      const key = A.q + '|' + B.q;
      const curve = curveBetween(A.pos, B.pos);
      const braid = (opts.braid ?? true) && pr.I >= 1.99;
      const mats: THREE.ShaderMaterial[] = [];
      const firstBraid = braid && !braidSeen.has(key);
      if (braid) {
        if (firstBraid) { braidSeen.add(key); opts.onBraid?.(A.q, B.q); }
        for (const ph of [0, Math.PI]) {
          const m = filMat(pr.I); mats.push(m);
          filGrp.add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(curve, 3, ph, 0.16), 120, 0.028, 8), m));
        }
      } else {
        const m = filMat(pr.I); mats.push(m);
        filGrp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.012 + 0.045 * (pr.I / 2), 8), m));
      }
      const prev = old.get(key);
      fils.push({ key, mats, I: pr.I, braid, born: firstBraid ? clock : prev?.born ?? -99 });
      if (pr.I >= 0.1) labels.add(tv('bloch.mi', { v: num(pr.I) }), curve.getPoint(0.5).add(new THREE.Vector3(0, 0.35, 0)), 'mi');
    }
  };
  const set = (nerd: NerdInfo, ids: QubitId[]) => {
    if (spheres.length !== ids.length || spheres.some((s, i) => s.q !== ids[i])) {
      spheres.forEach((s) => { scene.remove(s.m.group); });
      const lay = layoutOf(ids.length);
      spheres = ids.map((q, i) => {
        const m = createBlochMesh(th, glow, 1);
        const { x, z } = lay(i);
        m.group.position.set(x, 0, z);
        scene.add(m.group);
        const r0 = nerd.reduced[q];
        return { q, m, cur: new THREE.Vector3(r0.x, r0.y, r0.z), tgt: new THREE.Vector3(), pos: new THREE.Vector3(x, 0, z) };
      });
      const w = Math.max(...spheres.map((s) => Math.abs(s.pos.x))) + 1.5, d = Math.max(...spheres.map((s) => s.pos.z));
      const dist = Math.max(7.5, w * 1.95);
      camera.position.set(0, dist * 0.32 + 1.5, d / 2 + dist);
      controls.target.set(0, 0.4, d / 2);
      controls.update();
    }
    labels.clear();
    spheres.forEach((s) => {
      const r = nerd.reduced[s.q];
      s.tgt.set(r.x, r.y, r.z);
      labels.add(`<b>${qubitName(s.q)}</b>`, s.pos.clone().add(new THREE.Vector3(0, -1.32, 0)), 'strong');
      labels.add(`${tv('bloch.purity', { v: num(r.purity) })}<br>${tv('bloch.entropy', { v: num(r.entropy) })}`, s.pos.clone().add(new THREE.Vector3(0, -1.32, 0)), '', 30);
      if (rm) s.cur.copy(s.tgt);
    });
    buildFils(pairsOf(nerd, ids));
  };
  const lp = loop(f.root, (dt) => {
    clock += dt;
    for (const s of spheres) {
      s.cur.set(damp(s.cur.x, s.tgt.x, 3, dt), damp(s.cur.y, s.tgt.y, 3, dt), damp(s.cur.z, s.tgt.z, 3, dt));
      s.m.setVector(s.cur);
    }
    for (const fl of fils) {
      const age = clock - fl.born;
      const flash = fl.braid && age < 3 && !rm ? Math.max(0, 1 - age / 3) : 0;
      fl.mats.forEach((m) => { m.uniforms.t.value = rm ? 0 : clock; m.uniforms.flash.value = flash; });
    }
    controls.update();
    labels.update(camera, gl.w, gl.h);
    gl.render();
  });
  void blochToThree;
  return { set, destroy() { lp.stop(); controls.dispose(); labels.clear(); gl.destroy(); } };
}

function canvasImpl(f: Frame, th: AfiTheme, opts: BlochFieldOpts) {
  let nerd: NerdInfo | null = null, ids: QubitId[] = [];
  const cv = dprCanvas(f.root, () => draw());
  function draw() {
    const { g, w, h } = cv;
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, th.bg[0]); bg.addColorStop(1, th.bg[2]);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (!nerd) return;
    const n = ids.length, cols = n <= 6 ? n : Math.ceil(Math.sqrt(n * 1.6)), rows = Math.ceil(n / cols);
    const R = Math.min(w / (cols * 2.8), h / (rows * 3.2)) * 0.9;
    const P = ids.map((_, i) => ({ x: w / 2 + ((i % cols) - (Math.min(cols, n - Math.floor(i / cols) * cols) - 1) / 2) * R * 2.8, y: h * 0.18 + R * 1.6 + Math.floor(i / cols) * R * 3.2 }));
    if (opts.filaments !== false) for (const pr of pairsOf(nerd, ids)) {
      const a = P[pr.a], b = P[pr.b], my = Math.min(a.y, b.y) - R * 1.4 - Math.abs(a.x - b.x) * 0.15;
      g.strokeStyle = rgba(th.accent, 0.25 + 0.6 * (pr.I / 2)); g.lineWidth = 1 + 3 * (pr.I / 2);
      g.beginPath(); g.moveTo(a.x, a.y - R); g.quadraticCurveTo((a.x + b.x) / 2, my, b.x, b.y - R); g.stroke();
      g.fillStyle = th.ink2; g.font = `11px ${th.fonts.mono}`; g.textAlign = 'center';
      g.fillText(tv('bloch.mi', { v: num(pr.I) }), (a.x + b.x) / 2, (a.y + my) / 2 - R * 0.2);
    }
    ids.forEach((q, i) => {
      const p = P[i], r = nerd!.reduced[q];
      g.strokeStyle = rgba(th.accent, 0.5); g.lineWidth = 1;
      g.beginPath(); g.arc(p.x, p.y, R, 0, 6.283); g.stroke();
      g.strokeStyle = rgba(th.accent, 0.25); g.beginPath(); g.ellipse(p.x, p.y, R, R * 0.3, 0, 0, 6.283); g.stroke();
      // oblique projection: x right, y into the page (up-right), z up
      const ex = p.x + R * (r.x + r.y * 0.35), ey = p.y - R * (r.z + r.y * 0.25);
      g.strokeStyle = th.accent2; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(ex, ey); g.stroke();
      g.fillStyle = th.accent2; g.beginPath(); g.arc(ex, ey, 3, 0, 6.283); g.fill();
      g.fillStyle = th.ink; g.font = `13px ${th.fonts.mono}`; g.textAlign = 'center';
      g.fillText(qubitName(q), p.x, p.y + R + 16);
      g.fillStyle = th.ink2; g.font = `11px ${th.fonts.mono}`;
      g.fillText(tv('bloch.purity', { v: num(r.purity) }), p.x, p.y + R + 31);
      g.fillText(tv('bloch.entropy', { v: num(r.entropy) }), p.x, p.y + R + 45);
    });
  }
  return { set(n: NerdInfo, q: QubitId[]) { nerd = n; ids = q; draw(); }, destroy() { cv.destroy(); } };
}

export const mount = (host: HTMLElement, input: VizInputLike) => {
  const layers = input.layers ?? [];
  const v = veilable<VizInputLike>(host, createBlochField(host, { reducedMotion: input.reducedMotion, webgl: input.webgl, caption: '', filaments: !input.layers || layers.includes('filaments'), braid: !input.layers || layers.includes('filaments') }), resolveTheme({}));
  v.update(input);
  return v;
};
void clamp;
