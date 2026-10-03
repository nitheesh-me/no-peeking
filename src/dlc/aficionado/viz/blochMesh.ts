/** A luminous Bloch sphere (three.js). Convention: z up = |0⟩, +x = |+⟩, +y = |+i⟩ (see gl.blochToThree). */
import { THREE, col, glowSprite, blochToThree } from './gl';
import type { AfiTheme } from '../theme/theme';

export interface BlochMesh {
  group: THREE.Group;
  /** physics Bloch vector, |r| ≤ 1 */
  setVector(b: { x: number; y: number; z: number }): void;
  setOpacity(a: number): void;
  setHighlight(h: number): void;
}

export function fresnelMaterial(color: string, power = 2.6, base = 0.035, gain = 0.75): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { c: { value: col(color) }, p: { value: power }, base: { value: base }, gain: { value: gain }, alpha: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 c; uniform float p; uniform float base; uniform float gain; uniform float alpha; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(vN,vV)), p); gl_FragColor = vec4(c*(base+gain*f)*alpha, 1.0); }',
  });
}

export function createBlochMesh(th: AfiTheme, glow: THREE.Texture, radius = 1): BlochMesh {
  const group = new THREE.Group();
  const shellMat = fresnelMaterial(th.accent);
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), shellMat));
  const lineMat = new THREE.LineBasicMaterial({ color: col(th.accent), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = (rot: (o: THREE.Object3D) => void) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    rot(l); group.add(l);
  };
  ring(() => {});
  ring((o) => { o.rotation.x = Math.PI / 2; });
  ring((o) => { o.rotation.z = Math.PI / 2; });
  // axes: z (|0⟩–|1⟩) brighter, x and y faint
  const axMat = new THREE.LineBasicMaterial({ color: col(th.ink3), transparent: true, opacity: 0.55, depthWrite: false });
  const axis = (a: THREE.Vector3) => group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone().multiplyScalar(-1.12 * radius), a.clone().multiplyScalar(1.12 * radius)]), axMat));
  axis(new THREE.Vector3(0, 1, 0)); axis(new THREE.Vector3(1, 0, 0)); axis(new THREE.Vector3(0, 0, 1));
  // pole markers
  const pole = (y: number, c: string) => { const s = glowSprite(glow, c, 0.18 * radius, 0.9); s.position.set(0, y * radius, 0); group.add(s); };
  pole(1, th.accent); pole(-1, th.accent2);
  // state arrow
  const arrowMat = new THREE.MeshBasicMaterial({ color: col(th.accent2), transparent: true, opacity: 1 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * radius, 0.018 * radius, 1, 10, 1, true), arrowMat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.06 * radius, 0.16 * radius, 16), arrowMat);
  const arrow = new THREE.Group();
  arrow.add(shaft, head);
  group.add(arrow);
  const tip = glowSprite(glow, th.accent2, 0.5 * radius, 0.9);
  group.add(tip);
  // inner mist: brighter as the state becomes mixed (|r| < 1)
  const mist = glowSprite(glow, th.accent, 1.9 * radius, 0);
  group.add(mist);
  const up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
  let op = 1, len = 1;
  const api: BlochMesh = {
    group,
    setVector(b) {
      blochToThree(b, v);
      len = Math.min(1, v.length());
      const L = len * radius;
      arrow.visible = L > 0.02;
      if (arrow.visible) {
        arrow.quaternion.setFromUnitVectors(up, v.clone().normalize());
        const sl = Math.max(0.001, L - 0.16 * radius);
        shaft.scale.set(1, sl, 1); shaft.position.set(0, sl / 2, 0);
        head.position.set(0, sl + 0.08 * radius, 0);
      }
      tip.position.copy(v).multiplyScalar(radius);
      (tip.material as THREE.SpriteMaterial).opacity = 0.9 * op * (0.25 + 0.75 * len);
      (mist.material as THREE.SpriteMaterial).opacity = 0.16 * op * (1 - len);
    },
    setOpacity(a) {
      op = a;
      shellMat.uniforms.alpha.value = a;
      lineMat.opacity = 0.32 * a; axMat.opacity = 0.55 * a; arrowMat.opacity = a;
      group.traverse((o) => { if ((o as THREE.Sprite).isSprite && o !== tip && o !== mist) ((o as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.9 * a; });
      (tip.material as THREE.SpriteMaterial).opacity = 0.9 * a * (0.25 + 0.75 * len);
      (mist.material as THREE.SpriteMaterial).opacity = 0.16 * a * (1 - len);
    },
    setHighlight(h) { shellMat.uniforms.gain.value = 0.75 + 0.6 * h; },
  };
  return api;
}
