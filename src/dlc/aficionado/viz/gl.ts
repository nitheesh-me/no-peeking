/**
 * Shared three.js helpers for the DLC scenes (only imported by DLC viz modules, never by the classic game).
 * Renderer with DPR-correct sizing, dreamscape set pieces (sky dome, sea, dust), glow sprites, labels, disposal.
 */
import * as THREE from 'three';
import type { AfiTheme } from '../theme/theme';

export { THREE };
export const col = (hex: string) => new THREE.Color(hex);

export interface GL {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  w: number; h: number;
  render(): void;
  destroy(): void;
}

export function createGL(parent: HTMLElement, th: AfiTheme, onResize?: (w: number, h: number) => void, fov = 42): GL {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(col(th.bg[0]));
  parent.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 400);
  const gl: GL = {
    renderer, scene, camera, w: 1, h: 1,
    render() { renderer.render(scene, camera); },
    destroy() { ro.disconnect(); disposeTree(scene); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); },
  };
  const fit = () => {
    gl.w = Math.max(1, parent.clientWidth); gl.h = Math.max(1, parent.clientHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(gl.w, gl.h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = gl.w / gl.h; camera.updateProjectionMatrix();
    onResize?.(gl.w, gl.h);
    gl.render();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(parent);
  fit();
  return gl;
}

/** Dispose geometries, materials and textures under an object. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const k in mat) { const v = (mat as unknown as Record<string, unknown>)[k]; if (v instanceof THREE.Texture) v.dispose(); }
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const k in u) if (u[k].value instanceof THREE.Texture) u[k].value.dispose();
      mat.dispose();
    }
  });
}

/** Soft radial glow texture (white; tint through the material colour). */
export function glowTexture(size = 128, falloff = 2.2): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
    const a = Math.max(0, 1 - d);
    const v = Math.pow(a, falloff);
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(v * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowSprite(tex: THREE.Texture, color: string | THREE.Color, scale: number, opacity = 1): THREE.Sprite {
  const m = new THREE.SpriteMaterial({ map: tex, color: color instanceof THREE.Color ? color : col(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(scale);
  return s;
}

/** Sky dome: night gradient with a horizon glow band (decoration). */
export function skyDome(th: AfiTheme, radius = 180): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: col(th.bg[0]) }, mid: { value: col(th.bg[2]) }, glow: { value: col(th.horizon) }, gold: { value: col(th.accent2) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 glow; uniform vec3 gold; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.0, 0.55, h));
        float band = exp(-pow(h*9.0, 2.0)); c += glow * band * 0.55 + gold * exp(-pow(h*28.0,2.0)) * 0.08;
        c = mix(c, top*0.6, smoothstep(0.0,-0.4,h)); gl_FragColor = vec4(c,1.); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.renderOrder = -10;
  return m;
}

/** Dark sea: a still, deep plane that fades into the horizon glow (decoration). Pair with mirrorOf() for reflections.
 *  Render order: mirrored clones −2, sea −1, everything else ≥ 0. */
export function sea(th: AfiTheme, y: number, radius = 170): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: true, fog: false,
    uniforms: { deep: { value: col(th.sea) }, glow: { value: col(th.horizon) }, R: { value: radius }, cam: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform vec3 deep; uniform vec3 glow; uniform float R; uniform vec3 cam; varying vec3 vW;
      void main(){ float d = length(vW.xz - cam.xz); float far = smoothstep(R*0.15, R*0.95, d);
        vec3 v = normalize(cam - vW); float fres = pow(1.0 - clamp(v.y, 0.0, 1.0), 4.0);
        vec3 c = mix(deep, glow*0.6, clamp(far*0.85 + fres*0.7, 0.0, 1.0));
        float a = mix(0.86, 1.0, far);
        gl_FragColor = vec4(c, a); }`,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = -1;
  m.onBeforeRender = (_r, _s, camera) => { mat.uniforms.cam.value.copy(camera.position); };
  return m;
}

/** A mirrored clone of obj about the plane y = seaY (shares geometry; materials cloned at reduced opacity). */
export function mirrorOf(obj: THREE.Object3D, seaY: number, opacity = 0.35): THREE.Object3D {
  const m = obj.clone(true);
  m.traverse((o) => {
    const mesh = o as THREE.Mesh;
    o.renderOrder = -2;
    if (mesh.material && !Array.isArray(mesh.material)) {
      const mat = mesh.material.clone() as THREE.Material & { opacity: number; uniforms?: Record<string, { value: unknown }> };
      mat.transparent = true;
      if (mat.uniforms?.alpha) mat.uniforms.alpha.value = (mat.uniforms.alpha.value as number) * opacity; else mat.opacity = (mat.opacity ?? 1) * opacity;
      mesh.material = mat;
    }
  });
  const wrap = new THREE.Group();
  wrap.add(m);
  wrap.scale.y = -1;
  wrap.position.y = 2 * seaY;
  wrap.userData.mirror = m;
  return wrap;
}

/** Drifting dust motes (decoration). Returns the Points and a tick(dt). */
export function dust(th: AfiTheme, tex: THREE.Texture, count = 600, spread = 30, height = 10): { points: THREE.Points; tick(dt: number): void } {
  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread; pos[i * 3 + 1] = Math.random() * height - 1; pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
    vel[i * 3] = (Math.random() - 0.5) * 0.05; vel[i * 3 + 1] = Math.random() * 0.04 + 0.01; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: tex, color: col(th.accent2), size: 0.09, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  return {
    points,
    tick(dt) {
      for (let i = 0; i < count; i++) {
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] > height - 1) pos[i * 3 + 1] = -1;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** HTML labels pinned to 3D positions. */
export class LabelLayer {
  items: { el: HTMLElement; pos: THREE.Vector3; offY: number }[] = [];
  private v = new THREE.Vector3();
  constructor(public host: HTMLElement) {}
  add(html: string, pos: THREE.Vector3, cls = '', offY = 0): HTMLElement {
    const el = document.createElement('div');
    el.className = 'afi-viz-label ' + cls;
    el.innerHTML = html;
    this.host.appendChild(el);
    this.items.push({ el, pos, offY });
    return el;
  }
  clear() { this.items.forEach((i) => i.el.remove()); this.items = []; }
  update(cam: THREE.Camera, w: number, h: number) {
    for (const it of this.items) {
      this.v.copy(it.pos).project(cam);
      const vis = this.v.z < 1 && this.v.z > -1;
      it.el.style.display = vis ? '' : 'none';
      it.el.style.left = ((this.v.x + 1) / 2) * w + 'px';
      it.el.style.top = ((1 - this.v.y) / 2) * h + it.offY + 'px';
    }
  }
}

/** Bloch vector (x,y,z) in physics convention (z up = |0⟩, +x = |+⟩, +y = |+i⟩) → three.js (Y up, right-handed). */
export const blochToThree = (b: { x: number; y: number; z: number }, out = new THREE.Vector3()) => out.set(b.x, b.z, -b.y);
