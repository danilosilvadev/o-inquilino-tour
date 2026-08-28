import * as THREE from 'three';

/**
 * CutoutFigure — the drawing itself, moving.
 *
 * Three pieces of the original charcoal, each rotated about a real joint and
 * never scaled or warped, because stretching charcoal turns grain into rubber.
 * This is old cutout animation: the parts move, the drawing does not deform, so
 * every stroke on screen is the stroke that was drawn.
 *
 * Seen from behind, a walk reads as bob, sway and the legs turning at the hip —
 * not as stride, which is foreshortened away from this angle.
 */
export class CutoutFigure {
  constructor(manifest, cfg, palette) {
    this.cfg = cfg;
    this.manifest = manifest;
    this.root = new THREE.Group();
    this.parts = new Map();

    const [W, H] = manifest.source;
    this.scale = cfg.height / H;
    this.figW = W * this.scale;
    this.figH = cfg.height;
    this.loaded = false;
  }

  async load() {
    const loader = new THREE.TextureLoader();
    const jobs = this.manifest.parts.map((p) => new Promise((res, rej) => {
      loader.load(p.file, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        res({ p, tex });
      }, undefined, rej);
    }));

    for (const { p, tex } of await Promise.all(jobs)) {
      const [pw, ph] = p.size;
      const wW = pw * this.scale;
      const hW = ph * this.scale;

      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          tMap:     { value: tex },
          uLight:   { value: 1 },
          uOpacity: { value: 0 },
          uInk:     { value: new THREE.Color(this.cfg.tint) }
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          uniform sampler2D tMap;
          uniform float uLight, uOpacity;
          uniform vec3 uInk;
          varying vec2 vUv;
          void main() {
            vec4 t = texture2D(tMap, vUv);
            if (t.a < 0.01) discard;
            // the drawing, lit — paper catches the lamp, ink stays ink
            vec3 col = t.rgb * uInk * uLight;
            gl_FragColor = vec4(col, t.a * uOpacity);
          }
        `
      });

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wW, hW), mat);
      // slide the plane so its joint sits on the group's origin; rotating the
      // group is then a true rotation about that joint
      const [fx, fy] = p.pivot;
      mesh.position.set((0.5 - fx) * wW, (fy - 0.5) * hW, 0);

      const group = new THREE.Group();
      const [px, py] = p.pivotFigure;
      group.position.set((px - 0.5) * this.figW, (1 - py) * this.figH, 0);
      group.add(mesh);
      this.root.add(group);

      this.parts.set(p.name, { group, mesh, mat });
    }

    // draw order: legs behind the body
    this.parts.get('upper').mesh.renderOrder = 2;
    this.parts.get('legL').mesh.renderOrder = 1;
    this.parts.get('legR').mesh.renderOrder = 1;
    this.loaded = true;
  }

  /**
   * He does not perform. He stands, and barely.
   *
   * The poem's speaker is a tenant — things happen to him. So the only motion
   * that belongs to his body is breath and a slight inability to hold still;
   * everything else in the scene moves around him.
   *
   * @param {number} time seconds
   * @param {number} unrest 0 = almost gone, 1 = shivering
   * @param {number} weight 0 = upright, 1 = the body giving under something
   */
  pose(time, unrest, weight) {
    if (!this.loaded) return;
    const C = this.cfg;

    // breath, and the small sway nobody can suppress
    const breath = Math.sin(time * C.breathRate) * C.breath;
    const drift = Math.sin(time * 0.23) * C.drift + Math.sin(time * 0.41) * C.drift * 0.5;

    this.root.position.y = breath - weight * C.weightSink;
    this.root.rotation.z = drift * unrest;

    const upper = this.parts.get('upper');
    upper.group.rotation.z = -drift * 0.5 * unrest;
    upper.group.position.y = breath * 0.6;

    // the legs only register the weight; they never stride
    this.parts.get('legL').group.rotation.z = weight * C.weightSplay;
    this.parts.get('legR').group.rotation.z = -weight * C.weightSplay;
  }

  dispose() {
    for (const { mesh, mat } of this.parts.values()) {
      mesh.geometry.dispose();
      mat.uniforms.tMap.value?.dispose();
      mat.dispose();
    }
    this.parts.clear();
    this.loaded = false;
  }

  setLight(v) {
    for (const { mat } of this.parts.values()) mat.uniforms.uLight.value = v;
  }

  setOpacity(v) {
    for (const { mat } of this.parts.values()) mat.uniforms.uOpacity.value = v;
  }

  /** where the load sits on him, in world space */
  shoulderWorld(out) {
    return out.set(
      this.root.position.x,
      this.root.position.y + this.figH * this.cfg.shoulderY,
      this.root.position.z
    );
  }
}
