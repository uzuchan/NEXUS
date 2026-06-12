// ============================================================================
// NEXUS — Interaction Lab (Agent 8)
// Custom cursor / magnetic hover / 3D tilt / scroll reveal.
// All motion runs through a single rAF loop using lerp — no instant snapping.
// Consumed by main.js as initInteractions(). Script is type=module, so the
// DOM (including Agent 7's section markup) is parsed before this runs.
// ============================================================================

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// --------------------------------------------------------------------------
// Scroll reveal — works for everyone (reduced-motion gets opacity-only in CSS)
// --------------------------------------------------------------------------
function initReveal() {
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
// Pointer-driven systems (cursor / magnetic / tilt) — fine pointers only
// --------------------------------------------------------------------------
function initPointerSystems() {
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, seen: false };

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

  document.addEventListener('pointerover', (e) => {
    if (e.target instanceof Element && e.target.closest(HOVER_SELECTOR)) {
      ring.classList.add('is-hover');
      cursor.ringScaleTarget = 1.8;
    }
  });
  document.addEventListener('pointerout', (e) => {
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

  document.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    activateCursor();
  });
  // Hide custom cursor (and restore native) when the pointer leaves the page.
  document.documentElement.addEventListener('pointerleave', deactivateCursor);
  document.addEventListener('pointerdown', () => dot.classList.add('is-down'));
  document.addEventListener('pointerup', () => dot.classList.remove('is-down'));

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
    el.addEventListener('pointerenter', () => { state.hovering = true; });
    el.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      const px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      state.try_ = (px - 0.5) * 2 * TILT_MAX;        // rotateY follows horizontal
      state.trx = -(py - 0.5) * 2 * TILT_MAX;        // rotateX follows vertical
      state.tgx = px * 100;
      state.tgy = py * 100;
    });
    el.addEventListener('pointerleave', () => {
      state.hovering = false;
      state.trx = 0;
      state.try_ = 0;
      state.tgx = 50;
      state.tgy = 50;
    });
    return state;
  });

  // ---- Shared rAF loop -------------------------------------------------------
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

    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------
export function initInteractions() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  // Reveal always runs; CSS downgrades it to opacity-only under reduced motion.
  initReveal();

  // Cursor / magnetic / tilt: desktop pointers only, and never when the user
  // asked for reduced motion.
  if (!reducedMotion && finePointer) {
    initPointerSystems();
  }
}
