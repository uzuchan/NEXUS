// NEXUS — Camera Director. Scroll-linked cinematic dolly with pointer parallax.
// Contract: new CameraDirector(sceneManager); update(dt, elapsed).
// This module is the ONLY writer of camera position / rotation.
//
// v1.1: portrait framing compensation + prefers-reduced-motion fallback.
//   - Portrait (aspect < 1) widens the vertical FOV so the SAME horizontal
//     content stays in frame on a tall viewport. The camera never moves, so
//     Environment's hero dissolve (distance smoothstep 2.6..4.4) is untouched.
//   - reduced-motion stops the dolly trail, parallax and idle bob, snapping to
//     each section's settled composition via a near-instant damp.
import * as THREE from 'three';

const DAMP_SCROLL = 3; // lambda for scroll damping — slow, operator-like
const DAMP_POINTER = 4; // lambda for pointer parallax damping
const PARALLAX_X = 0.4;
const PARALLAX_Y = 0.25;
const LOOK_TILT = 0.6; // how far the lookAt target leans with the pointer
const BOB_AMP = 0.05; // idle breathing amplitude (y)
const BOB_SPEED = 0.6; // idle breathing frequency (rad/s)

// Base vertical FOV authored for landscape framing (matches SceneManager's 60).
const BASE_FOV = 60;
// Aspect the keyframes were composed against. At or above this aspect the FOV is
// left at BASE_FOV (landscape changes nothing — not a single pixel moves). Below
// it (portrait / square) the vertical FOV widens to keep horizontal content in.
const REF_ASPECT = 16 / 9;
// Clamp so an extreme portrait can't blow the FOV out to a fisheye.
const MAX_FOV = 100;
// FOV follows aspect changes (resize / rotation) with this damp lambda so a
// rotation eases into the new framing instead of snapping. Honors the project's
// no-teleport rule for the camera frustum the same way position is damped.
const DAMP_FOV = 4;

// reduced-motion: near-instant damp toward the settled composition. Large enough
// to read as "static" within a frame or two, finite so an abrupt resize still
// resolves without a hard cut.
const DAMP_REDUCED = 30;

// Keyframes for the four zones: hero -> modules -> network -> contact.
// Slight x/y drift between frames so the path reads as a crane/dolly move.
const KEYFRAMES = [
  { pos: new THREE.Vector3(0, 0, 8), look: new THREE.Vector3(0, 0, 0) }, // hero
  { pos: new THREE.Vector3(1.5, 0.3, -10), look: new THREE.Vector3(-0.5, 0, -16) }, // modules — drift right
  { pos: new THREE.Vector3(-0.8, 0.8, -20), look: new THREE.Vector3(0.4, 0.2, -26) }, // network — rise + cross left
  { pos: new THREE.Vector3(0, 0.2, -30), look: new THREE.Vector3(0, 0, -38) }, // contact — settle on axis
];

// Vertical FOV that preserves the horizontal field of a BASE_FOV/REF_ASPECT
// camera at a narrower (portrait) aspect. Derivation:
//   tan(hFov/2) = aspect * tan(vFov/2)               (perspective relation)
// Hold the reference horizontal half-angle constant and solve for the new vFov:
//   tan(vFov/2) = (refAspect / aspect) * tan(BASE_FOV/2)
// Landscape (aspect >= REF_ASPECT) returns BASE_FOV exactly.
function fovForAspect(aspect) {
  if (!isFinite(aspect) || aspect <= 0 || aspect >= REF_ASPECT) return BASE_FOV;
  const refHalfTan = Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2);
  const halfTan = (REF_ASPECT / aspect) * refHalfTan;
  const fov = THREE.MathUtils.radToDeg(Math.atan(halfTan) * 2);
  return Math.min(fov, MAX_FOV);
}

export class CameraDirector {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.camera = sceneManager.camera;

    this.targetProgress = 0; // raw scroll progress 0..1
    this.progress = 0; // damped progress driving the dolly
    this.parallax = new THREE.Vector2(0, 0); // damped pointer

    // Damped vertical FOV (portrait compensation). Seeded to the current aspect
    // so the first frame is already correctly framed (no opening FOV sweep).
    this.fov = fovForAspect(this.camera.aspect);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    // Scratch vectors (no per-frame allocation).
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();

    // --- prefers-reduced-motion ---
    // When true: no dolly trail, no parallax, no idle bob — the camera holds
    // each section's settled composition. Tracked live via matchMedia so a
    // mid-session OS toggle is honored without reload.
    this.reducedMotion = false;
    this._mql = null;
    if (typeof window.matchMedia === 'function') {
      this._mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this._mql.matches;
      const onChange = (e) => { this.reducedMotion = e.matches; };
      // addEventListener is the modern API; fall back for older Safari.
      if (typeof this._mql.addEventListener === 'function') {
        this._mql.addEventListener('change', onChange);
      } else if (typeof this._mql.addListener === 'function') {
        this._mql.addListener(onChange);
      }
    }

    this._readScroll();
    window.addEventListener('scroll', () => this._readScroll(), { passive: true });
    window.addEventListener('resize', () => this._readScroll(), { passive: true });
  }

  _readScroll() {
    const range = document.documentElement.scrollHeight - window.innerHeight;
    this.targetProgress =
      range <= 0 ? 0 : THREE.MathUtils.clamp(window.scrollY / range, 0, 1);
  }

  update(dt, elapsed) {
    const reduced = this.reducedMotion;

    // Damp scroll progress so the dolly trails the scrollbar like a camera
    // operator. Under reduced-motion, snap so the dolly carries no cinematic
    // trail — the camera reads as static at each section's framing.
    const dampProgress = reduced ? DAMP_REDUCED : DAMP_SCROLL;
    this.progress = THREE.MathUtils.damp(this.progress, this.targetProgress, dampProgress, dt);

    // Pointer parallax: damp toward the live pointer normally, toward zero (no
    // parallax, no inertia) under reduced-motion.
    const ptr = this.sceneManager.pointer;
    const ptrTargetX = reduced ? 0 : ptr.x;
    const ptrTargetY = reduced ? 0 : ptr.y;
    const dampPointer = reduced ? DAMP_REDUCED : DAMP_POINTER;
    this.parallax.x = THREE.MathUtils.damp(this.parallax.x, ptrTargetX, dampPointer, dt);
    this.parallax.y = THREE.MathUtils.damp(this.parallax.y, ptrTargetY, dampPointer, dt);

    // Map progress onto the keyframe segments with smoothstep easing per segment.
    const segments = KEYFRAMES.length - 1;
    const scaled = this.progress * segments;
    const i = Math.min(Math.floor(scaled), segments - 1);
    const t = THREE.MathUtils.smoothstep(scaled - i, 0, 1);
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[i + 1];

    this._pos.lerpVectors(a.pos, b.pos, t);
    this._look.lerpVectors(a.look, b.look, t);

    if (!reduced) {
      // Pointer parallax offset + gentle idle breathing. Both are pure motion
      // flourishes, so reduced-motion drops them entirely (parallax is already
      // damped to 0 above; the bob is skipped here).
      this._pos.x += this.parallax.x * PARALLAX_X;
      this._pos.y += this.parallax.y * PARALLAX_Y + Math.sin(elapsed * BOB_SPEED) * BOB_AMP;

      // Tilt the lookAt slightly with the pointer for layered depth.
      this._look.x += this.parallax.x * LOOK_TILT;
      this._look.y += this.parallax.y * LOOK_TILT * 0.6;
    }

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);

    // Portrait framing: widen the vertical FOV so a tall viewport keeps the
    // same horizontal content. The camera POSITION is unchanged, so Environment's
    // hero dissolve — keyed on camera-to-core DISTANCE (smoothstep 2.6..4.4) —
    // stays bit-identical. Landscape (aspect >= REF_ASPECT) targets BASE_FOV, so
    // wide viewports are left exactly as before. Damp the FOV so a resize or
    // device rotation eases in (no frustum teleport).
    const targetFov = fovForAspect(this.camera.aspect);
    const dampFov = reduced ? DAMP_REDUCED : DAMP_FOV;
    this.fov = THREE.MathUtils.damp(this.fov, targetFov, dampFov, dt);
    // Only touch the projection matrix when the FOV actually moved, to avoid a
    // redundant recompute every frame once it has settled.
    if (Math.abs(this.camera.fov - this.fov) > 1e-4) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
