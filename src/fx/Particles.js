// NEXUS — Particle FX. GPU particle field: ~36k drifting motes + 200 ember
// sprites, all motion computed in the vertex shader (zero per-frame attribute
// uploads). Contract: class Particles { constructor(sceneManager); update(dt, t) }.
// Adds its own THREE.Points to sceneManager.scene; main.js handles register().
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
const FIELD_COUNT = 36000; // main mote field
const EMBER_COUNT = 200;   // large slow embers for depth

// Camera travels roughly z 8 -> z -30. Fill a box around that path:
// x,y in ±25, z in +15..-45. The group is parked at the field's z-center so
// the slow ambient rotation pivots around the middle of the journey.
const FIELD_CENTER_Z = -15;
const HALF_X = 25;
const HALF_Y = 25;
const HALF_Z = 30; // relative to FIELD_CENTER_Z -> world z in [-45, +15]

const CYAN = new THREE.Color(0.3, 0.95, 1.0);
const MAGENTA = new THREE.Color(1.0, 0.3, 0.85);

// ---------------------------------------------------------------------------
// Shaders (shared by both layers; behaviour differs via uniforms)
// ---------------------------------------------------------------------------
const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uAspect;
  uniform vec2  uPointer;        // smoothed pointer, NDC
  uniform float uPointerForce;   // signed: + repel, - attract
  uniform float uDriftSpeed;     // global drift time scale
  uniform float uDriftAmp;       // drift amplitude (world units)
  uniform float uSizeScale;      // perspective size factor

  attribute float aSeed;
  attribute float aSize;
  attribute float aColorMix;

  varying float vColorMix;
  varying float vSeed;
  varying float vFade;

  // Layered-sine pseudo-curl drift: three incommensurate frequency bands per
  // axis, cross-fed so the field appears to swirl rather than oscillate.
  vec3 drift(vec3 p, float seed, float t) {
    float s = seed * 6.2831853;
    vec3 d;
    d.x = sin(p.y * 0.21 + t * 0.50 + s)        * 0.9
        + sin(p.z * 0.14 - t * 0.31 + s * 2.0)  * 0.6
        + sin((p.y + p.z) * 0.07 + t * 0.17)    * 1.2;
    d.y = sin(p.z * 0.19 + t * 0.43 + s * 3.0)  * 0.9
        + sin(p.x * 0.16 - t * 0.27 + s)        * 0.6
        + sin((p.z + p.x) * 0.06 + t * 0.13)    * 1.2;
    d.z = sin(p.x * 0.23 + t * 0.47 + s * 5.0)  * 0.9
        + sin(p.y * 0.13 - t * 0.23 + s * 4.0)  * 0.6
        + sin((p.x + p.y) * 0.08 + t * 0.11)    * 1.2;
    return d;
  }

  void main() {
    vColorMix = aColorMix;
    vSeed = aSeed;

    float t = uTime * uDriftSpeed;
    vec3 pos = position + drift(position, aSeed, t) * uDriftAmp;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);

    // --- pointer reactivity (view/NDC space, dream-like nudge) -------------
    vec4 clip = projectionMatrix * mv;
    vec2 ndc = clip.xy / max(clip.w, 0.0001);
    vec2 toP = ndc - uPointer;
    toP.x *= uAspect; // circular falloff on screen
    float pd = length(toP);
    float influence = smoothstep(0.55, 0.0, pd);
    influence *= influence; // ease-in: only really near the pointer
    vec2 dir = pd > 0.0001 ? toP / pd : vec2(0.0, 1.0);
    // Gentle per-particle phase wobble so the response feels organic.
    float wobble = 0.85 + 0.15 * sin(uTime * 0.9 + aSeed * 12.566);
    mv.xy += dir * influence * uPointerForce * wobble;

    gl_Position = projectionMatrix * mv;

    // --- size attenuation by depth -----------------------------------------
    float depth = max(-mv.z, 0.1);
    gl_PointSize = aSize * uPixelRatio * (uSizeScale / depth);

    // Manual depth fade (additive material ignores scene fog).
    vFade = 1.0 - smoothstep(30.0, 60.0, depth);
    // Fade out particles that end up behind / hugging the camera.
    vFade *= smoothstep(0.3, 2.5, depth);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA; // cyan
  uniform vec3 uColorB; // magenta
  uniform float uOpacity;
  uniform float uTwinkleSpeed;

  varying float vColorMix;
  varying float vSeed;
  varying float vFade;

  void main() {
    // Soft round sprite.
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv) * 2.0;
    float core = 1.0 - smoothstep(0.0, 0.35, r);
    float halo = 1.0 - smoothstep(0.2, 1.0, r);
    float shape = core * 0.8 + halo * 0.5;
    if (shape < 0.003) discard;

    // Slight twinkle, desynchronised per particle via seed.
    float tw = 0.78 + 0.22 * sin(uTime * uTwinkleSpeed + vSeed * 43.7);

    vec3 color = mix(uColorA, uColorB, vColorMix);

    gl_FragColor = vec4(color, shape * tw * vFade * uOpacity);
  }
`;

// ---------------------------------------------------------------------------
export class Particles {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.smoothedPointer = new THREE.Vector2(0, 0);

    this.group = new THREE.Group();
    this.group.position.z = FIELD_CENTER_Z;

    // --- layer 1: main mote field ------------------------------------------
    this.fieldMaterial = this._makeMaterial({
      pointerForce: 1.1,
      driftSpeed: 1.0,
      driftAmp: 1.6,
      // Keep motes at ~1-8px: 36k additive sprites any larger stack up and
      // wash the whole frame to white once bloom amplifies them.
      sizeScale: 36.0,
      opacity: 0.6,
      twinkleSpeed: 2.3,
    });
    this.field = new THREE.Points(
      this._makeGeometry(FIELD_COUNT, { minSize: 0.6, maxSize: 2.2 }),
      this.fieldMaterial
    );
    this.field.frustumCulled = false; // shader displaces verts; keep visible
    this.group.add(this.field);

    // --- layer 2: large slow embers -----------------------------------------
    this.emberMaterial = this._makeMaterial({
      pointerForce: 0.45,
      driftSpeed: 0.35,
      driftAmp: 2.4,
      // Soft out-of-focus orbs (~60-150px) at very low alpha for depth;
      // they sit on top of everything, so brightness here is the first
      // thing to blow out the dark background.
      sizeScale: 100.0,
      opacity: 0.15,
      twinkleSpeed: 0.9,
    });
    this.embers = new THREE.Points(
      this._makeGeometry(EMBER_COUNT, { minSize: 8.0, maxSize: 20.0 }),
      this.emberMaterial
    );
    this.embers.frustumCulled = false;
    this.group.add(this.embers);

    sceneManager.scene.add(this.group);
  }

  _makeMaterial({ pointerForce, driftSpeed, driftAmp, sizeScale, opacity, twinkleSpeed }) {
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uAspect: { value: window.innerWidth / window.innerHeight },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uPointerForce: { value: pointerForce },
        uDriftSpeed: { value: driftSpeed },
        uDriftAmp: { value: driftAmp },
        uSizeScale: { value: sizeScale },
        uColorA: { value: CYAN.clone() },
        uColorB: { value: MAGENTA.clone() },
        uOpacity: { value: opacity },
        uTwinkleSpeed: { value: twinkleSpeed },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
  }

  _makeGeometry(count, { minSize, maxSize }) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const sizes = new Float32Array(count);
    const colorMix = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Box volume around the camera path, biased slightly toward the axis
      // (cube-root-free trick: average two randoms pulls toward center).
      const bias = () => (Math.random() + Math.random()) - 1; // [-1, 1], triangular
      positions[i * 3 + 0] = bias() * HALF_X;
      positions[i * 3 + 1] = bias() * HALF_Y;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * HALF_Z; // uniform along path

      seeds[i] = Math.random();
      sizes[i] = minSize + Math.pow(Math.random(), 2.0) * (maxSize - minSize);
      // Push colorMix toward the poles so most particles read clearly
      // cyan or magenta, with a thin violet band between.
      const m = Math.random();
      colorMix[i] = m < 0.5 ? Math.pow(m * 2, 1.6) * 0.35 : 1 - Math.pow((1 - m) * 2, 1.6) * 0.35;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aColorMix', new THREE.BufferAttribute(colorMix, 1));
    return geo;
  }

  update(dt, elapsed) {
    // Smooth the raw pointer (frame-rate-independent damp).
    const target = this.sceneManager.pointer;
    const k = 1 - Math.exp(-dt * 3.5);
    this.smoothedPointer.x += (target.x - this.smoothedPointer.x) * k;
    this.smoothedPointer.y += (target.y - this.smoothedPointer.y) * k;

    // Constant ambient rotation of the whole field.
    this.group.rotation.y += dt * 0.01;

    const aspect = window.innerWidth / window.innerHeight;
    const pixelRatio = this.sceneManager.renderer.getPixelRatio(); // follows DPR changes
    for (const mat of [this.fieldMaterial, this.emberMaterial]) {
      const u = mat.uniforms;
      u.uTime.value = elapsed;
      u.uAspect.value = aspect;
      u.uPixelRatio.value = pixelRatio;
      u.uPointer.value.copy(this.smoothedPointer);
    }
  }
}
