// NEXUS — site copy (Agent 9 "Narrative")
// Canonical copy deck. No renderer consumes this yet: index.html mirrors it
// by hand, so when editing language here, update index.html too (and vice
// versa).
//
// Tone: deadpan. Every line opens like a sci-fi epic and quietly admits the
// truth. The joke is always on the website itself, never on anyone else.

export default {
  brand: {
    name: 'NEXUS',
    tagline: 'A digital universe, rendered in real time.',
  },

  hero: {
    kicker: 'SIGNAL // 001',
    title: 'BEYOND THE\nEVENT HORIZON',
    subtitle:
      'NEXUS is a living system at the edge of the renderable — a constructed cosmos where light, data, and intent converge into one continuous signal. It is also, technically, a website.',
    cta: {
      primary: 'Initiate Sequence',
      secondary: 'Explore the System',
    },
  },

  modules: {
    kicker: 'SUBSYSTEMS // 002',
    title: 'THE ARCHITECTURE OF LIGHT',
    subtitle:
      'Four core subsystems sustain the NEXUS field. Each runs autonomously. None of them are strictly necessary.',
    cards: [
      {
        id: 'particle-engine',
        icon: '◬',
        title: 'Particle Engine',
        body:
          'Forty thousand points of light, computed every frame on the GPU. What do they do? Nothing. But they do it sixty times a second, beautifully.',
        meta: 'SYS.01 // ONLINE',
      },
      {
        id: 'neural-mesh',
        icon: '◈',
        title: 'Neural Mesh',
        body:
          'A lattice of signal pathways threading the deep structure. It is not connected to anything. It has never been connected to anything. It simply loves to glow.',
        meta: 'SYS.02 // SYNCED',
      },
      {
        id: 'holo-layer',
        icon: '⬡',
        title: 'Holographic Interface',
        body:
          'The membrane between you and the machine — glass panels suspended in depth. In a meeting, we agreed to call the blur holographic. The blur did not object.',
        meta: 'SYS.03 // ACTIVE',
      },
      {
        id: 'temporal-sync',
        icon: '✦',
        title: 'Temporal Sync',
        body:
          'Time inside NEXUS is elastic. The sync core damps every motion into a single cinematic flow — meaning everything takes slightly longer than necessary, on purpose, for drama.',
        meta: 'SYS.04 // STABLE',
      },
    ],
  },

  network: {
    kicker: 'TELEMETRY // 003',
    title: 'A SYSTEM THAT NEVER SLEEPS',
    subtitle:
      'Live readings from the NEXUS core. The numbers are not live. They were chosen because they looked confident.',
    stats: [
      { value: '40K', label: 'Particles, Zero Responsibilities' },
      { value: '99.99%', label: 'Vibe Integrity' },
      { value: '12.4K', label: 'Nodes, Estimated by Feel' },
      { value: '0.016s', label: 'Frame Horizon (Just 60fps)' },
    ],
  },

  contact: {
    kicker: 'UPLINK // 004',
    title: 'OPEN A CHANNEL',
    subtitle:
      'The system is listening. It has no backend, so it cannot reply — but it is listening, decoratively.',
    cta: 'Establish Uplink',
    footer: {
      line1: 'The Establish Uplink button scrolls you back to the top. That is the uplink.',
      line2: 'NEXUS © 2026 — All frequencies reserved. None currently in use.',
      line3: 'Broadcast live from a laptop, somewhere past the horizon.',
    },
  },

  // Manual mirror of the OGP meta tags in index.html's <head> (Agent 7).
  // Keep these strings identical to the og:/twitter: tags there. No runtime
  // reads this; it is the canonical copy deck, edited in lockstep with the HTML.
  ogp: {
    title: 'NEXUS — Immersive Sci-Fi Web Experience',
    description:
      'An immersive sci-fi web experience: 40,000 GPU particles, cinematic scroll-driven camera, and a website that is completely honest about being one.',
  },
};
