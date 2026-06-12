// NEXUS bootstrap — Operator-owned. Wires every module per the contracts in CLAUDE.md.
import { SceneManager } from './core/SceneManager.js';
import { Particles } from './fx/Particles.js';
import { Environment } from './fx/Environment.js';
import { PostFX } from './fx/PostFX.js';
import { CameraDirector } from './motion/CameraDirector.js';
import { initInteractions } from './ui/interactions.js';

// DOM interactions first: reveals must run even when WebGL is unavailable,
// or every [data-reveal] element would stay at opacity 0 on a blank page.
initInteractions();

try {
  const sm = new SceneManager(document.querySelector('#gl-canvas'));

  const particles = new Particles(sm);
  const environment = new Environment(sm);
  const director = new CameraDirector(sm);
  const postfx = new PostFX(sm);

  sm.register(particles);
  sm.register(environment);
  sm.register(director);
  sm.setPostFX(postfx);

  sm.start();
} catch (err) {
  // WebGL context refused (old GPU, headless, blocked): the DOM layer still
  // stands as a flat page over the CSS background.
  console.error('NEXUS: WebGL scene unavailable — continuing DOM-only.', err);
}
