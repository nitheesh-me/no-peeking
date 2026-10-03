/**
 * Finale: the distance-3 rotated surface code as a glowing tessellation floating over the dark sea.
 * 9 data qubits at the vertices, 4 X-type + 4 Z-type plaquettes (weight-2 half-discs on the boundaries),
 * logical operators as luminous strings from boundary to boundary. Errors (error colour) and syndromes (lit tiles)
 * come in through update(). Without WebGL it falls back to the SVG stabilizer tiling in 'surface' layout.
 */
import { veilable, frame, tv, resolveRM, resolveTheme, resolveGL, loop, damp, type VizBaseOpts, type VizHandle } from './common';
import { THREE, createGL, col, glowTexture, glowSprite, skyDome, sea, dust, LabelLayer } from './gl';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SURFACE_D3, syndromeOf, type PauliErr } from './codes';
import { createStabilizerTiling } from './stabilizerTiling';
import { fromSub, num, toSub } from '../theme/math';
import type { AfiTheme } from '../theme/theme';
import type { NerdInfo } from '../../../core/contracts';
import type { VizInputLike } from './types';

export { SURFACE_D3 };
export interface LatticeData {
  errors?: PauliErr[];
  /** expectation values by label (NerdInfo.stabilizers, labels like 'X₁X₂X₄X₅'); else values; else exact syndrome of `errors` */
  stabilizers?: { label: string; value: number }[];
  values?: number[];
  /** highlight a logical operator string (e.g. after a logical error) */
  logical?: 'X' | 'Z' | null;
  showLogicals?: boolean;
}
export type SurfaceLattice = VizHandle<LatticeData | VizInputLike>;

const S = 1.7, Y0 = 1.3;
const qpos = (q: number) => { const { r, c } = SURFACE_D3.pos(q); return new THREE.Vector3((c - 1) * S, Y0, (r - 1) * S); };
const norm = (s: string) => fromSub(s).replace(/\s/g, '');

export function createSurfaceLattice(host: HTMLElement, opts: VizBaseOpts = {}): SurfaceLattice {
  const th = resolveTheme(opts), rm = resolveRM(opts);
  if (!resolveGL(opts)) {
    const t = createStabilizerTiling(host, { ...opts, layout: 'surface', caption: opts.caption ?? tv('lattice.caption') });
    return { update: (d) => t.update(toTiling(d)), destroy: () => t.destroy() };
  }
  const f = frame(host, 'afi-lattice', tv('lattice.aria'));
  f.mountChrome();
  f.setCaption(opts.caption ?? tv('lattice.caption'));
  const impl = glImpl(f, th, rm);
  return {
    update(d) {
      const x = toTiling(d);
      impl.set(x.values, x.errors, (d as LatticeData).logical ?? null, (d as LatticeData).showLogicals ?? true);
      f.root.setAttribute('aria-label', tv('lattice.aria') + '. ' + SURFACE_D3.stabilizers.map((s, i) => `⟨${s.label}⟩ = ${num(x.values[i], 0, true)}`).join(', '));
    },
    destroy() { impl.destroy(); f.destroy(); },
  };
}

function toTiling(d: LatticeData | VizInputLike): { values: number[]; errors: PauliErr[]; generators: string[] } {
  const gens = SURFACE_D3.stabilizers.map((s) => s.pauli);
  const ld = d as LatticeData;
  const stabs = (d as VizInputLike).nerd ? (d as VizInputLike).nerd.stabilizers : ld.stabilizers;
  const errors = ld.errors ?? [];
  let values = ld.values;
  if (!values && stabs?.length) {
    const m = new Map(stabs.map((s) => [norm(s.label), s.value]));
    const v = SURFACE_D3.stabilizers.map((s) => m.get(norm(s.label)));
    if (v.every((x) => x !== undefined)) values = v as number[];
  }
  return { values: values ?? syndromeOf(gens, errors), errors, generators: gens };
}

function glImpl(f: ReturnType<typeof frame>, th: AfiTheme, rm: boolean) {
  const gl = createGL(f.root, th, undefined, 40);
  const { scene, camera, renderer } = gl;
  scene.fog = new THREE.FogExp2(col(th.fog), 0.03);
  const glow = glowTexture();
  scene.add(skyDome(th));
  const SEA = -0.6;
  scene.add(sea(th, SEA, 70));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false; controls.autoRotate = !rm; controls.autoRotateSpeed = 0.25;
  controls.minDistance = 4; controls.maxDistance = 30; controls.maxPolarAngle = Math.PI * 0.46;
  camera.position.set(3.6, 4.1, 7.2); controls.target.set(0, Y0 - 0.1, 0.3); controls.update();
  const world = new THREE.Group();
  scene.add(world);
  const motes = dust(th, glow, 260, 24, 6);
  scene.add(motes.points);
  const mirror = new THREE.Group(); mirror.scale.y = -1; mirror.position.y = 2 * SEA;
  scene.add(mirror);
  const labels = new LabelLayer(f.labels);

  // plaquettes
  const tiles = SURFACE_D3.stabilizers.map((st, i) => {
    const ps = st.qubits.map(qpos);
    const shape = new THREE.Shape();
    let centre: THREE.Vector3;
    if (st.qubits.length === 4) {
      const c = ps.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(0.25);
      const k = 0.94, sq = [ps[0], ps[1], ps[3], ps[2]].map((p) => p.clone().sub(c).multiplyScalar(k).add(c));
      shape.moveTo(sq[0].x, sq[0].z); sq.slice(1).forEach((p) => shape.lineTo(p.x, p.z)); shape.closePath();
      centre = c;
    } else {
      const m = ps[0].clone().add(ps[1]).multiplyScalar(0.5);
      const out = m.clone().setY(0).normalize();
      const a0 = Math.atan2(ps[0].z - m.z, ps[0].x - m.x), R = S / 2 * 0.94;
      const am = a0 - Math.PI / 2, sgn = Math.cos(am) * out.x + Math.sin(am) * out.z > 0 ? 1 : -1;
      for (let k = 0; k <= 24; k++) { const a = a0 - sgn * (k / 24) * Math.PI; const x = m.x + Math.cos(a) * R, z = m.z + Math.sin(a) * R; if (k) shape.lineTo(x, z); else shape.moveTo(x, z); }
      shape.closePath();
      centre = m.clone().addScaledVector(out, S * 0.22);
    }
    const geo = new THREE.ShapeGeometry(shape, 24);
    geo.rotateX(Math.PI / 2); // shape XY → world XZ (y = 0)
    const color = col(st.type === 'X' ? th.tileX : th.tileZ);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = Y0 - 0.002 * i;
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(24).map((p) => new THREE.Vector3(p.x, 0, p.y))), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    edge.position.y = Y0;
    const halo = glowSprite(glow, color, 2.4, 0);
    halo.position.copy(centre).setY(Y0 + 0.05);
    mesh.renderOrder = 2; edge.renderOrder = 3; halo.renderOrder = 3;
    world.add(mesh, edge, halo);
    const mm = new THREE.Mesh(geo, mat.clone()); mm.position.copy(mesh.position); (mm.material as THREE.MeshBasicMaterial).opacity = 0.03;
    mirror.add(mm);
    labels.add(st.label, centre.clone().setY(Y0 + 0.02), 'tile');
    return { mesh, edge, halo, mat, mirMat: mm.material as THREE.MeshBasicMaterial, lit: 0, target: 0, born: i * 0.18 };
  });

  // data qubits
  const qGeo = new THREE.IcosahedronGeometry(0.085, 2);
  const qubits = Array.from({ length: 9 }, (_, i) => {
    const q = i + 1, p = qpos(q);
    const mat = new THREE.MeshBasicMaterial({ color: col(th.ink) });
    const m = new THREE.Mesh(qGeo, mat); m.position.copy(p);
    const halo = glowSprite(glow, th.accent, 0.8, 0.55); halo.position.copy(p);
    world.add(m, halo);
    const mq = new THREE.Mesh(qGeo, new THREE.MeshBasicMaterial({ color: col(th.ink), transparent: true, opacity: 0.25 })); mq.position.copy(p); mirror.add(mq);
    labels.add('q' + toSub(String(q)), p.clone().add(new THREE.Vector3(0.28, 0, 0.28)), '');
    const errEl = labels.add('', p.clone().add(new THREE.Vector3(0, 0.42, 0)), 'err');
    errEl.style.color = th.err; errEl.style.fontSize = '14px';
    return { mat, halo, errEl };
  });

  // logical strings: boundary → boundary
  const strMat = (c: string) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: col(c) }, a: { value: 0.25 }, t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 c; uniform float a; uniform float t; varying vec2 vUv; void main(){ float p = 0.6+0.4*sin(vUv.x*30.0 - t*3.0); float e = smoothstep(0.0,0.06,vUv.x)*smoothstep(1.0,0.94,vUv.x); gl_FragColor = vec4(c*a*p*e*1.6,1.0); }',
  });
  const mkString = (qs: number[], dir: THREE.Vector3, c: string, label: string) => {
    const pts = qs.map(qpos).map((p) => p.clone().setY(Y0 + 0.16));
    const a = pts[0].clone().addScaledVector(dir, -S * 0.75), b = pts[pts.length - 1].clone().addScaledVector(dir, S * 0.75);
    const curve = new THREE.CatmullRomCurve3([a, ...pts, b]);
    const mat = strMat(c);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.035, 8), mat);
    world.add(mesh);
    const el = labels.add(label, b.clone().addScaledVector(dir, 0.35), 'strong');
    return { mat, el, mesh };
  };
  const LX = mkString(SURFACE_D3.logicals.X.qubits, new THREE.Vector3(0, 0, 1), th.tileX, tv('lattice.logicalX'));
  const LZ = mkString(SURFACE_D3.logicals.Z.qubits, new THREE.Vector3(1, 0, 0), th.tileZ, tv('lattice.logicalZ'));
  let logical: 'X' | 'Z' | null = null, showL = true;
  let clock = 0;

  const lp = loop(f.root, (dt) => {
    clock += dt;
    if (!rm) motes.tick(dt);
    tiles.forEach((t) => {
      t.lit = rm ? t.target : damp(t.lit, t.target, 3, dt);
      const appear = rm ? 1 : th.motion.easeFn(Math.min(1, Math.max(0, (clock - t.born) / 1.2)));
      const pulse = rm ? 1 : 0.85 + 0.15 * Math.sin(clock * 2.2);
      t.mat.opacity = (0.16 + 0.5 * t.lit * pulse) * appear;
      (t.edge.material as THREE.LineBasicMaterial).opacity = (0.55 + 0.45 * t.lit) * appear;
      (t.halo.material as THREE.SpriteMaterial).opacity = 0.7 * t.lit * pulse * appear;
      t.mirMat.opacity = t.mat.opacity * 0.3;
      t.mesh.scale.setScalar(0.6 + 0.4 * appear);
    });
    for (const [L, k] of [[LX, 'X'], [LZ, 'Z']] as const) {
      const on = logical === k;
      L.mesh.visible = showL || on;
      L.mat.uniforms.a.value = damp(L.mat.uniforms.a.value, on ? 1.6 : 0.22, 2.5, dt);
      L.mat.uniforms.t.value = rm ? 0 : clock;
      L.el.style.display = L.mesh.visible ? '' : 'none';
      L.el.style.opacity = on ? '1' : '0.6';
    }
    world.position.y = rm ? 0 : Math.sin(clock * 0.4) * 0.06;
    mirror.position.y = 2 * SEA - world.position.y;
    controls.update();
    labels.items.forEach((it) => it.el.style.transform = `translate(-50%,-50%) translateY(${-world.position.y * 30}px)`);
    labels.update(camera, gl.w, gl.h);
    gl.render();
  });

  return {
    set(values: number[], errors: PauliErr[], lg: 'X' | 'Z' | null, show: boolean) {
      values.forEach((v, i) => { tiles[i].target = (1 - Math.max(-1, Math.min(1, v))) / 2; });
      qubits.forEach((q, i) => {
        const e = errors.filter((x) => x.q === i + 1).map((x) => x.kind).join('');
        q.errEl.textContent = e;
        q.mat.color.set(e ? th.err : th.ink);
        (q.halo.material as THREE.SpriteMaterial).color.set(e ? th.err : th.accent);
      });
      logical = lg; showL = show;
    },
    destroy() { lp.stop(); controls.dispose(); labels.clear(); gl.destroy(); },
  };
}

export const mount = (host: HTMLElement, input: VizInputLike) => {
  const v = veilable<VizInputLike>(host, createSurfaceLattice(host, { reducedMotion: input.reducedMotion, webgl: input.webgl, caption: '' }), resolveTheme({}));
  v.update(input);
  return v;
};
export type { NerdInfo };
