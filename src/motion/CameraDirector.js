// NEXUS — Camera Director. Scroll-linked cinematic dolly with pointer parallax.
// Contract: new CameraDirector(sceneManager); update(dt, elapsed).
// This module is the ONLY writer of camera position / rotation.
import * as THREE from 'three';

const DAMP_SCROLL = 3; // lambda for scroll damping — slow, operator-like
const DAMP_POINTER = 4; // lambda for pointer parallax damping
const PARALLAX_X = 0.4;
const PARALLAX_Y = 0.25;
const LOOK_TILT = 0.6; // how far the lookAt target leans with the pointer
const BOB_AMP = 0.05; // idle breathing amplitude (y)
const BOB_SPEED = 0.6; // idle breathing frequency (rad/s)

// Keyframes for the four zones: hero -> modules -> network -> contact.
// Slight x/y drift between frames so the path reads as a crane/dolly move.
const KEYFRAMES = [
  { pos: new THREE.Vector3(0, 0, 8), look: new THREE.Vector3(0, 0, 0) }, // hero
  { pos: new THREE.Vector3(1.5, 0.3, -10), look: new THREE.Vector3(-0.5, 0, -16) }, // modules — drift right
  { pos: new THREE.Vector3(-0.8, 0.8, -20), look: new THREE.Vector3(0.4, 0.2, -26) }, // network — rise + cross left
  { pos: new THREE.Vector3(0, 0.2, -30), look: new THREE.Vector3(0, 0, -38) }, // contact — settle on axis
];

export class CameraDirector {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.camera = sceneManager.camera;

    this.targetProgress = 0; // raw scroll progress 0..1
    this.progress = 0; // damped progress driving the dolly
    this.parallax = new THREE.Vector2(0, 0); // damped pointer

    // Scratch vectors (no per-frame allocation).
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();

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
    // Damp scroll progress so the dolly trails the scrollbar like a camera operator.
    this.progress = THREE.MathUtils.damp(this.progress, this.targetProgress, DAMP_SCROLL, dt);

    // Damp pointer for the parallax layer.
    const ptr = this.sceneManager.pointer;
    this.parallax.x = THREE.MathUtils.damp(this.parallax.x, ptr.x, DAMP_POINTER, dt);
    this.parallax.y = THREE.MathUtils.damp(this.parallax.y, ptr.y, DAMP_POINTER, dt);

    // Map progress onto the keyframe segments with smoothstep easing per segment.
    const segments = KEYFRAMES.length - 1;
    const scaled = this.progress * segments;
    const i = Math.min(Math.floor(scaled), segments - 1);
    const t = THREE.MathUtils.smoothstep(scaled - i, 0, 1);
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[i + 1];

    this._pos.lerpVectors(a.pos, b.pos, t);
    this._look.lerpVectors(a.look, b.look, t);

    // Pointer parallax offset + gentle idle breathing.
    this._pos.x += this.parallax.x * PARALLAX_X;
    this._pos.y += this.parallax.y * PARALLAX_Y + Math.sin(elapsed * BOB_SPEED) * BOB_AMP;

    // Tilt the lookAt slightly with the pointer for layered depth.
    this._look.x += this.parallax.x * LOOK_TILT;
    this._look.y += this.parallax.y * LOOK_TILT * 0.6;

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
  }
}
