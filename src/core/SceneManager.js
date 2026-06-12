// NEXUS — Scene Core. Owns renderer / scene / camera / animation loop / resize.
// Contract: exposes { scene, camera, renderer, register(obj), start() }.
// Registered objects implement update(dt, elapsed). If a PostFX is attached via
// setPostFX(), the loop calls postfx.render(dt) instead of renderer.render().
//
// v1.1 adaptive quality: a rolling ~2s FPS average picks a tier
//   <28 fps -> 'low', <45 fps -> 'mid', else 'high'
// with a ~3s hysteresis so a momentary spike can't thrash the tier. The tier
// drives DPR (high = min(dpr,2) / mid = 1.5 / low = 1) and is broadcast to any
// registered object exposing setQuality(tier). sceneManager.quality reads it.
import * as THREE from 'three';

const BG_COLOR = 0x030308;
const MAX_DT = 0.05; // clamp dt so a tab-switch doesn't produce a huge step

// Adaptive-quality tuning.
const FPS_WINDOW = 2.0; // rolling average window in seconds
const TIER_HYSTERESIS = 3.0; // a new tier must persist this long before it applies
const TIER_LOW_BELOW = 28; // fps under this -> 'low'
const TIER_MID_BELOW = 45; // fps under this -> 'mid'

// DPR cap per tier. 'high' re-reads devicePixelRatio (capped at 2) at apply time.
const DPR_BY_TIER = { high: null, mid: 1.5, low: 1 };

function dprForTier(tier) {
  const cap = DPR_BY_TIER[tier];
  return cap === null ? Math.min(window.devicePixelRatio, 2) : cap;
}

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

    // --- Adaptive quality state ---
    this._quality = 'high'; // current applied tier
    this._fpsAccumTime = 0; // time accumulated in the current FPS window
    this._fpsFrames = 0; // frames counted in the current FPS window
    this._fps = 60; // last measured rolling FPS (seeded optimistic)
    this._candidateTier = 'high'; // tier the measured FPS currently suggests
    this._candidateHeld = 0; // how long the candidate has differed from applied

    window.addEventListener('resize', () => this.onResize());
    // Some mobile browsers fire orientationchange without a paired resize, or
    // fire it after a stale-size resize; handle both signals.
    window.addEventListener('orientationchange', () => this.onResize());
    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener('change', () => this.onResize());
    }
    window.addEventListener('mousemove', (e) => {
      this.pointer.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
    });
  }

  // Current adaptive-quality tier: 'high' | 'mid' | 'low'.
  get quality() {
    return this._quality;
  }

  // Register an object implementing update(dt, elapsed); called every frame.
  // If the object also implements setQuality(tier) and we are already below the
  // default 'high' tier, notify it immediately so late-registered modules match
  // the current quality level.
  register(obj) {
    this.updatables.push(obj);
    if (this._quality !== 'high' && typeof obj.setQuality === 'function') {
      obj.setQuality(this._quality);
    }
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

      this._sampleQuality(dt);

      for (const obj of this.updatables) obj.update(dt, elapsed);

      if (this.postfx) {
        this.postfx.render(dt);
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    });
  }

  // Accumulate frame timing into a rolling FPS window, derive the suggested
  // tier, and only commit a change once it has held for TIER_HYSTERESIS seconds.
  _sampleQuality(dt) {
    // Ignore the clamped dt for FPS math: a clamped (tab-switch) frame would
    // read as ~20fps and falsely demote. Use raw frame count over real time.
    this._fpsAccumTime += dt;
    this._fpsFrames += 1;

    if (this._fpsAccumTime >= FPS_WINDOW) {
      this._fps = this._fpsFrames / this._fpsAccumTime;
      this._fpsAccumTime = 0;
      this._fpsFrames = 0;
    }

    const suggested = this._tierForFps(this._fps);

    if (suggested === this._quality) {
      // Measurement agrees with what's applied: reset any pending change.
      this._candidateTier = this._quality;
      this._candidateHeld = 0;
      return;
    }

    if (suggested !== this._candidateTier) {
      // The suggestion moved; restart the hysteresis timer for the new target.
      this._candidateTier = suggested;
      this._candidateHeld = 0;
    }

    this._candidateHeld += dt;
    if (this._candidateHeld >= TIER_HYSTERESIS) {
      this._applyTier(suggested);
      this._candidateHeld = 0;
    }
  }

  _tierForFps(fps) {
    if (fps < TIER_LOW_BELOW) return 'low';
    if (fps < TIER_MID_BELOW) return 'mid';
    return 'high';
  }

  // Commit a new tier: update DPR (which resizes the renderer + PostFX) and
  // broadcast to registered objects that opt in via setQuality(tier).
  _applyTier(tier) {
    if (tier === this._quality) return;
    this._quality = tier;

    this._applyPixelRatio();

    for (const obj of this.updatables) {
      if (typeof obj.setQuality === 'function') obj.setQuality(tier);
    }
  }

  // Apply the tier's DPR and keep size-dependent consumers (PostFX) in sync.
  // setPixelRatio alone does not resize the drawing buffer, so re-run setSize
  // and notify PostFX exactly as onResize does.
  _applyPixelRatio() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(dprForTier(this._quality));
    this.renderer.setSize(w, h);
    if (this.postfx && typeof this.postfx.resize === 'function') {
      this.postfx.resize(w, h);
    }
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Re-read DPR: the window may have moved to a monitor with a different
    // pixel density, the browser zoom changed, or the device rotated. Honor the
    // active quality tier's cap rather than always using min(dpr, 2).
    this.renderer.setPixelRatio(dprForTier(this._quality));
    this.renderer.setSize(w, h);
    if (this.postfx && typeof this.postfx.resize === 'function') {
      this.postfx.resize(w, h);
    }
  }
}
