// NEXUS — site copy (Agent 9 "Narrative")
// Canonical copy deck. No renderer consumes this yet: index.html mirrors it
// by hand, so when editing language here, update index.html too (and vice
// versa).

export default {
  brand: {
    name: 'NEXUS',
    tagline: 'A digital universe, rendered in real time.',
  },

  hero: {
    kicker: 'SIGNAL // 001',
    title: 'BEYOND THE\nEVENT HORIZON',
    subtitle:
      'NEXUS is a living system at the edge of the renderable — a constructed cosmos where light, data, and intent converge into one continuous signal.',
    cta: {
      primary: 'Initiate Sequence',
      secondary: 'Explore the System',
    },
  },

  modules: {
    kicker: 'SUBSYSTEMS // 002',
    title: 'THE ARCHITECTURE OF LIGHT',
    subtitle:
      'Four core subsystems sustain the NEXUS field. Each runs autonomously. Together they dream in real time.',
    cards: [
      {
        id: 'particle-engine',
        icon: '◬',
        title: 'Particle Engine',
        body:
          'Forty thousand points of light, computed every frame on the GPU. They drift like dust through a nebula — until you move, and the field remembers you.',
        meta: 'SYS.01 // ONLINE',
      },
      {
        id: 'neural-mesh',
        icon: '◈',
        title: 'Neural Mesh',
        body:
          'A lattice of signal pathways threading the deep structure. Every interaction propagates outward, rewriting the geometry it touches.',
        meta: 'SYS.02 // SYNCED',
      },
      {
        id: 'holo-layer',
        icon: '⬡',
        title: 'Holographic Interface',
        body:
          'The membrane between you and the machine. Glass panels suspended in depth, refracting data into form you can almost touch.',
        meta: 'SYS.03 // ACTIVE',
      },
      {
        id: 'temporal-sync',
        icon: '✦',
        title: 'Temporal Sync',
        body:
          'Time inside NEXUS is elastic. The sync core damps every motion into a single cinematic flow — no cuts, no seams, no waiting.',
        meta: 'SYS.04 // STABLE',
      },
    ],
  },

  network: {
    kicker: 'TELEMETRY // 003',
    title: 'A SYSTEM THAT NEVER SLEEPS',
    subtitle:
      'Live readings from the NEXUS core. The numbers shift, the field holds.',
    stats: [
      { value: '40K', label: 'Particles in Flight' },
      { value: '99.99%', label: 'Signal Integrity' },
      { value: '12.4K', label: 'Nodes in the Mesh' },
      { value: '0.016s', label: 'Frame Horizon' },
    ],
  },

  contact: {
    kicker: 'UPLINK // 004',
    title: 'OPEN A CHANNEL',
    subtitle:
      'The system is listening. Transmit your coordinates and step into the field.',
    cta: 'Establish Uplink',
    footer: {
      line1: 'NEXUS © 2026 — All frequencies reserved.',
      line2: 'Broadcast from somewhere past the horizon.',
    },
  },
};
