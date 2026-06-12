// NEXUS — Scene Core. Owns renderer / scene / camera / animation loop / resize.
// Contract: exposes { scene, camera, renderer, register(obj), start() }.
// Registered objects implement update(dt, elapsed). If a PostFX is attached via
// setPostFX(), the loop calls postfx.render(dt) instead of renderer.render().
import * as THREE from 'three';

const BG_COLOR = 0x030308;
const MAX_DT = 0.05; // clamp dt so a tab-switch doesn't produce a huge step

export class SceneManager {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLOR);
    this.scene.fog = new THREE.FogExp2(BG_COLOR, 0.035);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 8);

    // Normalized pointer in NDC space (-1..1, y up). FX modules may read
    // sceneManager.pointer each frame for mouse-reactive effects.
    this.pointer = new THREE.Vector2(0, 0);

    this.updatables = [];
    this.postfx = null;
    this.timer = new THREE.Timer(); // Clock is deprecated as of three 0.184

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('mousemove', (e) => {
      this.pointer.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
    });
  }

  // Register an object implementing update(dt, elapsed); called every frame.
  register(obj) {
    this.updatables.push(obj);
  }

  // PostFX contract: new PostFX(sceneManager) exposing render(dt) and
  // optionally resize(w, h). Once set, it replaces the direct renderer.render.
  setPostFX(postfx) {
    this.postfx = postfx;
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      this.timer.update();
      const dt = Math.min(this.timer.getDelta(), MAX_DT);
      const elapsed = this.timer.getElapsed();

      for (const obj of this.updatables) obj.update(dt, elapsed);

      if (this.postfx) {
        this.postfx.render(dt);
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    });
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Re-read DPR: the window may have moved to a monitor with a different
    // pixel density, or the browser zoom changed.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    if (this.postfx && typeof this.postfx.resize === 'function') {
      this.postfx.resize(w, h);
    }
  }
}
