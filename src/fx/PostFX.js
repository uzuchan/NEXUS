// NEXUS — PostFX. Cinematic post-processing pipeline.
// Contract: new PostFX(sceneManager) builds the composer; render(dt) replaces
// renderer.render; resize(w, h) keeps composer + bloom in sync.
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

export class PostFX {
  constructor(sceneManager) {
    const { renderer, scene, camera } = sceneManager;
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.setSize(w, h);

    this.composer.addPass(new RenderPass(scene, camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.9, // strength — soft neon glow without blowing out
      0.7, // radius — wide, dreamy falloff
      0.1 // threshold — near-black bg, so almost anything lit blooms gently
    );
    this.composer.addPass(this.bloomPass);

    this.finishingPass = new ShaderPass(FinishingShader);
    this.composer.addPass(this.finishingPass);

    this.composer.addPass(new OutputPass());
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
    // Follow renderer DPR changes; composer.setSize then resizes every pass
    // (UnrealBloomPass only reads its `resolution` ctor arg, so it needs no
    // extra bookkeeping here).
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }
}
