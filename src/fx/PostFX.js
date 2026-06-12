// NEXUS — PostFX. Cinematic post-processing pipeline.
// Contract: new PostFX(sceneManager) builds the composer; render(dt) replaces
// renderer.render; resize(w, h) keeps composer + bloom in sync.
//
// v1.1 adaptive quality: setQuality(tier) ('high'|'mid'|'low') downscales the
// bloom's internal render targets on weaker devices. UnrealBloomPass only reads
// its render-target sizes at construction / setSize time and ignores any later
// resolution.set (see Session Handoff), so a tier change that needs a different
// scale rebuilds the bloom pass and swaps it into the composer chain, disposing
// the old one. 'high' is the baseline and is visually unchanged.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Finishing pass: vignette + edge chromatic aberration + animated film grain.
const FinishingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float dist = length(centered);

      // Chromatic aberration: tiny channel offsets growing toward the edges.
      vec2 dir = dist > 0.0001 ? centered / dist : vec2(0.0);
      float aberration = 0.0035 * dist * dist;
      float r = texture2D(tDiffuse, vUv + dir * aberration).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * aberration).b;
      vec3 color = vec3(r, g, b);

      // Soft vignette, keeps the neon center clean and darkens corners.
      float vignette = smoothstep(0.85, 0.35, dist);
      color *= mix(0.72, 1.0, vignette);

      // Faint animated film grain.
      float grain = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 61.7);
      color += (grain - 0.5) * 0.03;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// Baseline (high-tier) bloom look. Used verbatim at 'high'; lower tiers shrink
// the internal resolution (see BLOOM_TIER) and, at 'low', also trim strength a
// touch since a coarse downscale tends to spread the glow.
const BLOOM_STRENGTH = 0.9; // soft neon glow without blowing out
const BLOOM_RADIUS = 0.7; // wide, dreamy falloff
const BLOOM_THRESHOLD = 0.1; // near-black bg, so almost anything lit blooms gently

// Per-tier bloom render-target scale (fraction of the full DPR-effective size)
// and an optional strength multiplier. 'high' is the untouched baseline.
const BLOOM_TIER = {
  high: { scale: 1.0, strength: 1.0 },
  mid: { scale: 0.6, strength: 1.0 },
  low: { scale: 0.4, strength: 0.9 },
};

export class PostFX {
  constructor(sceneManager) {
    const { renderer, scene, camera } = sceneManager;
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.setSize(w, h);

    // Current adaptive-quality tier. SceneManager may call setQuality() at any
    // time after construction; default to the 'high' baseline.
    this._tier = 'high';

    this.composer.addPass(new RenderPass(scene, camera));

    // Build the bloom pass at the current tier's scale and remember its slot in
    // the composer chain so a later tier change can splice a rebuilt pass in.
    this._bloomIndex = this.composer.passes.length;
    this.bloomPass = this._makeBloomPass();
    this.composer.addPass(this.bloomPass);
    // addPass already sized the pass at full DPR-effective dimensions; re-apply
    // the tier scale so the downscale actually takes effect.
    this._sizeBloom();

    this.finishingPass = new ShaderPass(FinishingShader);
    this.composer.addPass(this.finishingPass);

    this.composer.addPass(new OutputPass());
  }

  // Effective (DPR-multiplied) drawing-buffer dimensions the composer renders
  // at. The bloom's render targets are a fraction of this per the active tier.
  _effectiveSize() {
    const pr = this.renderer.getPixelRatio();
    return { w: window.innerWidth * pr, h: window.innerHeight * pr };
  }

  // Construct a fresh UnrealBloomPass sized for the current tier. The ctor
  // resolution sets the initial render-target chain; _sizeBloom() then locks in
  // the exact scaled dimensions (and survives composer resizes).
  _makeBloomPass() {
    const cfg = BLOOM_TIER[this._tier];
    const { w, h } = this._effectiveSize();
    const pass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, Math.round(w * cfg.scale)), Math.max(1, Math.round(h * cfg.scale))),
      BLOOM_STRENGTH * cfg.strength,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD
    );
    return pass;
  }

  // Resize the bloom's render targets to the tier-scaled effective size. Called
  // after every composer.setSize, which otherwise resets the bloom to full
  // resolution (EffectComposer.setSize sizes every pass at full DPR size).
  _sizeBloom() {
    const cfg = BLOOM_TIER[this._tier];
    const { w, h } = this._effectiveSize();
    this.bloomPass.setSize(
      Math.max(1, Math.round(w * cfg.scale)),
      Math.max(1, Math.round(h * cfg.scale))
    );
  }

  render(dt) {
    // Wrap so fract(uTime) in the grain shader keeps float32 precision over
    // long sessions; grain is uncorrelated frame to frame, so the wrap is
    // invisible.
    const u = this.finishingPass.uniforms.uTime;
    u.value = (u.value + dt) % 100;
    this.composer.render(dt);
  }

  resize(w, h) {
    // Follow renderer DPR changes. composer.setSize resizes every pass at the
    // full DPR-effective size, which clobbers the bloom's tier downscale, so we
    // re-apply it immediately afterward via _sizeBloom().
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this._sizeBloom();
  }

  // Adaptive quality. SceneManager calls this on tier changes (and on register
  // if already below 'high'). 'high' is the visual baseline; 'mid'/'low' shrink
  // the bloom's internal resolution. UnrealBloomPass ignores a post-build
  // resolution change, so when the scale differs we rebuild the pass and swap it
  // into the composer chain, disposing the old one. resize() and this method
  // agree because both derive the bloom size from the same tier + DPR via
  // _sizeBloom(), so they cannot double-apply or fight each other.
  setQuality(tier) {
    const cfg = BLOOM_TIER[tier];
    if (!cfg || tier === this._tier) return;

    const prev = BLOOM_TIER[this._tier];
    const scaleChanged = cfg.scale !== prev.scale;
    this._tier = tier;

    if (scaleChanged) {
      // Rebuild at the new scale and swap in place; dispose the old pass so its
      // render targets / materials free their GPU memory.
      const old = this.bloomPass;
      this.bloomPass = this._makeBloomPass();
      this.composer.passes[this._bloomIndex] = this.bloomPass;
      old.dispose();
    } else {
      // Same resolution, only strength differs: cheap in-place tweak.
      this.bloomPass.strength = BLOOM_STRENGTH * cfg.strength;
    }

    // Lock the render-target sizes to the (possibly new) tier scale.
    this._sizeBloom();
  }
}
