// ============================================================================
// NEXUS — Interaction Lab (Agent 8)
// Custom cursor / magnetic hover / 3D tilt / scroll reveal.
// All motion runs through a single rAF loop using lerp — no instant snapping.
// Consumed by main.js as initInteractions(). Script is type=module, so the
// DOM (including Agent 7's section markup) is parsed before this runs.
//
// Adaptive input/motion:
//   - Touch-primary devices (pointer: coarse) get NO custom cursor and NO
//     tilt/magnetic hover. Instead a tap fires a short neon glow pulse so the
//     surface still feels alive and shared with the rest of the world.
//   - reduced-motion skips the reveal animation (immediate show) and stops the
//     always-running pulse, while staying consistent with the [data-reveal]
//     release logic below.
//   - Both media queries are followed live (change events) so a 2-in-1 that
//     swaps between touch and mouse re-wires itself without a reload.
// ============================================================================

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// --------------------------------------------------------------------------
// Scroll reveal — works for everyone.
// Normal motion: IntersectionObserver adds .is-revealed and the CSS transition
// plays. reduced-motion: elements are shown immediately with no transition.
// Either way the [data-reveal] attribute is released afterwards (see below).
// --------------------------------------------------------------------------
function initReveal(reducedMotion) {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  // After the entrance transition finishes, drop the inline stagger delay and
  // the [data-reveal] attribute itself. Its `transition` (incl. transform)
  // would otherwise capture every later inline transform write — the tilt
  // loop rewrites transform each frame, so each write restarts the (delayed)
  // transition and the tilt freezes — and it would also override
  // .glass-card's own hover transitions. The revealed end state equals the
  // natural styles, so releasing the attribute causes no visual jump.
  const release = (el, onEnd) => {
    el.removeEventListener('transitionend', onEnd);
    el.style.transitionDelay = '';
    el.removeAttribute('data-reveal');
  };

  // reduced-motion: show at once. We still add .is-revealed (end state) and
  // release the attribute on the next frame so the tilt loop is never trapped
  // by the [data-reveal] transition — same invariant the QA fix relies on.
  // The CSS reduced-motion query already strips movement/blur from the
  // transition, but releasing immediately keeps transform writes free even if
  // an opacity transition is still nominally attached.
  if (reducedMotion) {
    targets.forEach((el) => {
      el.style.transitionDelay = '';
      el.classList.add('is-revealed');
      requestAnimationFrame(() => {
        el.style.transitionDelay = '';
        el.removeAttribute('data-reveal');
      });
    });
    return;
  }

  const reveal = (el) => {
    const delay = el.getAttribute('data-reveal-delay');
    if (delay) {
      // Numeric values are treated as milliseconds; anything else
      // (e.g. "0.2s") is passed through verbatim.
      el.style.transitionDelay = /^[\d.]+$/.test(delay) ? `${delay}ms` : delay;
    }
    el.classList.add('is-revealed');
    const onEnd = (e) => {
      // transitionend bubbles — only the element's own transition counts.
      if (e.target === el) release(el, onEnd);
    };
    el.addEventListener('transitionend', onEnd);
    // Safety net: transitionend can be skipped (hidden tab, cancelled
    // transition). Max stagger (480ms) + reveal duration (900ms) < 2400ms.
    setTimeout(() => release(el, onEnd), 2400);
  };

  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => reveal(el));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target);
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
  );

  targets.forEach((el) => observer.observe(el));
}

// --------------------------------------------------------------------------
// Pointer-driven systems (cursor / magnetic / tilt) — fine pointers only.
// Returns a teardown fn so the entry point can dismantle everything when the
// active input switches to touch (or reduced-motion turns on).
// --------------------------------------------------------------------------
function initPointerSystems() {
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, seen: false };
  const listeners = []; // [target, type, handler] for clean teardown
  const on = (target, type, handler, opts) => {
    target.addEventListener(type, handler, opts);
    listeners.push([target, type, handler]);
  };

  // ---- Custom cursor -------------------------------------------------------
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  dot.setAttribute('aria-hidden', 'true');
  ring.setAttribute('aria-hidden', 'true');
  document.body.append(ring, dot);

  const cursor = {
    dotX: pointer.x, dotY: pointer.y,
    ringX: pointer.x, ringY: pointer.y,
    ringScale: 1, ringScaleTarget: 1,
  };

  const HOVER_SELECTOR = 'a, button, [data-magnetic]';

  on(document, 'pointerover', (e) => {
    if (e.target instanceof Element && e.target.closest(HOVER_SELECTOR)) {
      ring.classList.add('is-hover');
      cursor.ringScaleTarget = 1.8;
    }
  });
  on(document, 'pointerout', (e) => {
    if (e.target instanceof Element && e.target.closest(HOVER_SELECTOR)) {
      ring.classList.remove('is-hover');
      cursor.ringScaleTarget = 1;
    }
  });

  const activateCursor = () => {
    if (pointer.seen) return;
    pointer.seen = true;
    cursor.dotX = cursor.ringX = pointer.x;
    cursor.dotY = cursor.ringY = pointer.y;
    document.documentElement.classList.add('has-custom-cursor');
    dot.classList.add('is-active');
    ring.classList.add('is-active');
  };
  const deactivateCursor = () => {
    pointer.seen = false;
    document.documentElement.classList.remove('has-custom-cursor');
    dot.classList.remove('is-active');
    ring.classList.remove('is-active');
  };

  on(document, 'pointermove', (e) => {
    // Coarse pointers can still emit pointermove during a tap/drag; ignore them
    // so a stray touch never resurrects the custom cursor on a touch device.
    if (e.pointerType === 'touch') return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    activateCursor();
  });
  // Hide custom cursor (and restore native) when the pointer leaves the page.
  on(document.documentElement, 'pointerleave', deactivateCursor);
  on(document, 'pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    dot.classList.add('is-down');
  });
  on(document, 'pointerup', () => dot.classList.remove('is-down'));

  // ---- Magnetic elements ---------------------------------------------------
  const MAGNET_RADIUS = 80;     // attraction range from element edge (px)
  const MAGNET_STRENGTH = 0.35; // pull factor toward cursor
  const magnets = Array.from(document.querySelectorAll('[data-magnetic]')).map((el) => ({
    el, x: 0, y: 0, tx: 0, ty: 0,
  }));

  // ---- 3D tilt ---------------------------------------------------------------
  const TILT_MAX = 8; // deg
  const tilts = Array.from(document.querySelectorAll('[data-tilt]')).map((el) => {
    const state = {
      el,
      rx: 0, ry: 0, trx: 0, try_: 0,
      gx: 50, gy: 50, tgx: 50, tgy: 50, // glare position (%)
      hovering: false,
    };
    on(el, 'pointerenter', () => { state.hovering = true; });
    on(el, 'pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      const px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      state.try_ = (px - 0.5) * 2 * TILT_MAX;        // rotateY follows horizontal
      state.trx = -(py - 0.5) * 2 * TILT_MAX;        // rotateX follows vertical
      state.tgx = px * 100;
      state.tgy = py * 100;
    });
    on(el, 'pointerleave', () => {
      state.hovering = false;
      state.trx = 0;
      state.try_ = 0;
      state.tgx = 50;
      state.tgy = 50;
    });
    return state;
  });

  // ---- Shared rAF loop -------------------------------------------------------
  let rafId = 0;
  const tick = () => {
    // Cursor: dot tracks tightly, ring trails behind.
    cursor.dotX = lerp(cursor.dotX, pointer.x, 0.55);
    cursor.dotY = lerp(cursor.dotY, pointer.y, 0.55);
    cursor.ringX = lerp(cursor.ringX, pointer.x, 0.15);
    cursor.ringY = lerp(cursor.ringY, pointer.y, 0.15);
    cursor.ringScale = lerp(cursor.ringScale, cursor.ringScaleTarget, 0.15);
    dot.style.transform = `translate3d(${cursor.dotX}px, ${cursor.dotY}px, 0) translate(-50%, -50%)`;
    ring.style.transform =
      `translate3d(${cursor.ringX}px, ${cursor.ringY}px, 0) translate(-50%, -50%) scale(${cursor.ringScale})`;

    // Magnetic: pull toward cursor when within range, spring back when not.
    if (pointer.seen) {
      for (const m of magnets) {
        const rect = m.el.getBoundingClientRect();
        // Distance from cursor to the nearest point on the element's box.
        const dx = pointer.x - clamp(pointer.x, rect.left, rect.right);
        const dy = pointer.y - clamp(pointer.y, rect.top, rect.bottom);
        if (Math.hypot(dx, dy) < MAGNET_RADIUS) {
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          m.tx = (pointer.x - cx) * MAGNET_STRENGTH;
          m.ty = (pointer.y - cy) * MAGNET_STRENGTH;
        } else {
          m.tx = 0;
          m.ty = 0;
        }
      }
    }
    for (const m of magnets) {
      m.x = lerp(m.x, m.tx, 0.18);
      m.y = lerp(m.y, m.ty, 0.18);
      if (Math.abs(m.x) > 0.01 || Math.abs(m.y) > 0.01) {
        m.el.style.transform = `translate3d(${m.x}px, ${m.y}px, 0)`;
      } else if (m.el.style.transform) {
        m.el.style.transform = '';
      }
    }

    // Tilt: lerp rotation + glare coordinates.
    for (const t of tilts) {
      t.rx = lerp(t.rx, t.trx, 0.12);
      t.ry = lerp(t.ry, t.try_, 0.12);
      t.gx = lerp(t.gx, t.tgx, 0.12);
      t.gy = lerp(t.gy, t.tgy, 0.12);
      const settled = !t.hovering && Math.abs(t.rx) < 0.02 && Math.abs(t.ry) < 0.02;
      if (settled) {
        if (t.el.style.transform) t.el.style.transform = '';
        continue;
      }
      t.el.style.transform =
        `perspective(900px) rotateX(${t.rx.toFixed(3)}deg) rotateY(${t.ry.toFixed(3)}deg)`;
      t.el.style.setProperty('--mx', `${t.gx.toFixed(2)}%`);
      t.el.style.setProperty('--my', `${t.gy.toFixed(2)}%`);
    }

    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  // ---- Teardown: stop the loop, drop listeners, remove the cursor, and clear
  // every inline transform/var we wrote so the DOM returns to its CSS baseline.
  return () => {
    cancelAnimationFrame(rafId);
    for (const [target, type, handler] of listeners) {
      target.removeEventListener(type, handler);
    }
    deactivateCursor();
    dot.remove();
    ring.remove();
    for (const m of magnets) m.el.style.transform = '';
    for (const t of tilts) {
      t.el.style.transform = '';
      t.el.style.removeProperty('--mx');
      t.el.style.removeProperty('--my');
    }
  };
}

// --------------------------------------------------------------------------
// Touch-tap pulse — the touch-device stand-in for tilt/magnetic hover.
// A tap on a card or interactive target flashes a short neon glow using the
// shared token palette, then fades. No persistent motion, so it is also safe
// under reduced-motion (the .is-tapping class self-removes; the CSS keyframe
// is disabled under reduced-motion and the class change is a no-op there).
// Returns a teardown fn.
// --------------------------------------------------------------------------
function initTouchPulse() {
  const PULSE_SELECTOR = '[data-tilt], a, button, [data-magnetic]';
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return; // mouse handled by pointer systems
    if (!(e.target instanceof Element)) return;
    const el = e.target.closest(PULSE_SELECTOR);
    if (!el) return;
    // Restart the animation if the same element is tapped twice in a row.
    el.classList.remove('is-tapping');
    // Force reflow so removing + re-adding the class re-triggers the keyframe.
    void el.offsetWidth;
    el.classList.add('is-tapping');
    const clear = () => el.classList.remove('is-tapping');
    el.addEventListener('animationend', clear, { once: true });
    // Fallback in case animationend is missed (e.g. reduced-motion: no anim).
    setTimeout(clear, 700);
  };

  document.addEventListener('pointerdown', onPointerDown);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown);
    document
      .querySelectorAll('.is-tapping')
      .forEach((el) => el.classList.remove('is-tapping'));
  };
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------
export function initInteractions() {
  const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Touch-primary detection: a coarse primary pointer (finger/stylus). This is
  // the inverse of "fine" but coarse is the positive signal we act on, and it
  // tracks the active input on hybrid devices.
  const coarseMq = window.matchMedia('(pointer: coarse)');

  let teardownPointer = null; // active cursor/tilt/magnetic teardown
  let teardownTouch = null;   // active tap-pulse teardown

  // Reveal always runs. Under reduced motion it shows everything immediately;
  // otherwise the IntersectionObserver entrance plays. Re-evaluated whenever
  // the reduced-motion preference flips so late toggles still land correctly.
  let revealReduced = reducedMotionMq.matches;
  initReveal(revealReduced);

  // Pick the right input model for the current media-query state. Pointer
  // systems run only for fine pointers with motion allowed; touch-primary
  // devices (or reduced motion) get the tap pulse instead — never both.
  const sync = () => {
    const reducedMotion = reducedMotionMq.matches;
    const coarse = coarseMq.matches;

    // If reduced motion turned on after we already played the staggered
    // entrance, leftover [data-reveal] elements that never intersected are
    // re-released immediately. Already-revealed elements are a no-op.
    if (reducedMotion && !revealReduced) {
      revealReduced = true;
      initReveal(true);
    }

    const wantPointer = !reducedMotion && !coarse;
    // Tilt/magnetic hover is motion; suppress under reduced motion. The tap
    // pulse is a brief, self-clearing flash and the CSS disables its keyframe
    // under reduced motion, so the touch handler can stay attached either way
    // (a tap simply toggles an inert class).
    const wantTouch = coarse;

    if (wantPointer && !teardownPointer) {
      teardownPointer = initPointerSystems();
    } else if (!wantPointer && teardownPointer) {
      teardownPointer();
      teardownPointer = null;
    }

    if (wantTouch && !teardownTouch) {
      teardownTouch = initTouchPulse();
    } else if (!wantTouch && teardownTouch) {
      teardownTouch();
      teardownTouch = null;
    }
  };

  sync();

  // Follow live changes so touch<->mouse and motion-preference switches re-wire
  // without a reload. addEventListener('change') is supported on every browser
  // that ships matchMedia we target; no legacy addListener fallback needed.
  reducedMotionMq.addEventListener('change', sync);
  coarseMq.addEventListener('change', sync);
}
