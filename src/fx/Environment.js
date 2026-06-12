// NEXUS — Environment. Abstract floating sci-fi structures along the camera path.
// Contract: constructor(sceneManager) adds meshes to sceneManager.scene;
// update(dt, elapsed) animates. Registration is done by main.js, not here.
import * as THREE from 'three';

const CYAN = 0x4cf2ff;
const MAGENTA = 0xff4cd8;
const VIOLET = 0x8b5cff;

// Per-tier level-of-detail. 'high' values reproduce the original look exactly
// (so quality stays bit-identical at high). 'mid'/'low' trim wireframe segment
// counts and structure counts progressively. Geometry is only rebuilt on a tier
// change (see setQuality), never per frame.
const LOD = {
  high: {
    icoOuterDetail: 1,   // IcosahedronGeometry(2.2, detail)
    icoInnerDetail: 0,
    ringTubular: 96,     // TorusGeometry tubular segments (rings A/B)
    ringRadial: 8,
    moduleCount: 8,      // loose constellation size (modules section)
    netCount: 60,        // network node count
    gateTubular: 120,    // gate torus tubular segments
    gateRadial: 10,
    gridSeg: 40,         // PlaneGeometry width/height segments
  },
  mid: {
    icoOuterDetail: 1,
    icoInnerDetail: 0,
    ringTubular: 64,
    ringRadial: 6,
    moduleCount: 6,
    netCount: 40,
    gateTubular: 80,
    gateRadial: 8,
    gridSeg: 28,
  },
  low: {
    icoOuterDetail: 0,
    icoInnerDetail: 0,
    ringTubular: 40,
    ringRadial: 5,
    moduleCount: 4,
    netCount: 26,
    gateTubular: 56,
    gateRadial: 6,
    gridSeg: 18,
  },
};

function neonMat(color, opacity, { wireframe = false, additive = true } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    wireframe,
    transparent: true,
    opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
  });
}

export class Environment {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.group = new THREE.Group();
    sceneManager.scene.add(this.group);

    // Adaptive quality tier. Build at the manager's current tier (default
    // 'high'); a late setQuality from register() re-applies if it differs.
    this.tier = sceneManager.quality || 'high';
    const lod = LOD[this.tier];

    this._buildHero(lod);
    this._buildModules(lod);
    this._buildNetwork(lod);
    this._buildContact(lod);
  }

  // ---------------------------------------------------------------- hero ~z 0
  _buildHero(lod) {
    const hero = new THREE.Group();
    hero.position.set(0, 0.4, -1.5);

    // Outer wireframe icosahedron + inner solid counterpart, counter-rotating.
    this.icoOuter = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.2, lod.icoOuterDetail),
      neonMat(CYAN, 0.35, { wireframe: true })
    );
    this.icoInner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.55, lod.icoInnerDetail),
      neonMat(CYAN, 0.12)
    );
    hero.add(this.icoOuter, this.icoInner);

    // Two thin glowing rings tilted at different angles, orbiting the core.
    this.ringA = new THREE.Mesh(
      new THREE.TorusGeometry(3.1, 0.015, lod.ringRadial, lod.ringTubular),
      neonMat(MAGENTA, 0.5)
    );
    this.ringA.rotation.set(Math.PI * 0.42, 0.3, 0);

    this.ringB = new THREE.Mesh(
      new THREE.TorusGeometry(3.7, 0.012, lod.ringRadial, lod.ringTubular),
      neonMat(VIOLET, 0.45)
    );
    this.ringB.rotation.set(Math.PI * 0.58, -0.5, 0.4);

    hero.add(this.ringA, this.ringB);

    this.hero = hero;
    this.group.add(hero);
  }

  // ------------------------------------------------------------ modules ~z -10
  _buildModules(lod) {
    const modules = new THREE.Group();
    modules.position.set(0, 0, -10);

    const octa = new THREE.OctahedronGeometry(0.45, 0);
    const tetra = new THREE.TetrahedronGeometry(0.5, 0);
    const colors = [CYAN, MAGENTA, VIOLET];

    // Deterministic loose constellation of up to 8 small wireframe solids.
    // Order is chosen so the first N (lower tiers) stay spatially balanced.
    const offsets = [
      [-3.2, 1.4, 0.5], [2.8, 1.9, -0.8], [-1.6, -1.2, 1.2], [3.4, -0.6, 0.9],
      [-3.8, -0.4, -1.4], [1.2, 2.4, 1.6], [-0.6, 1.0, -1.8], [2.0, -1.8, -0.4],
    ];
    const count = Math.min(lod.moduleCount, offsets.length);

    // These small solids share two geometries; keep refs to dispose on rebuild.
    this._moduleGeos = [octa, tetra];

    this.modules = [];
    for (let i = 0; i < count; i++) {
      const [x, y, z] = offsets[i];
      const mesh = new THREE.Mesh(
        i % 2 === 0 ? octa : tetra,
        neonMat(colors[i % 3], 0.4, { wireframe: true })
      );
      mesh.position.set(x, y, z);
      mesh.rotation.set(i * 0.7, i * 1.3, i * 0.4);
      mesh.userData = {
        baseY: y,
        bobSpeed: 0.6 + (i % 4) * 0.18,
        bobPhase: i * 0.85,
        spin: 0.15 + (i % 3) * 0.08,
        spinAxis: i % 2 === 0 ? 'y' : 'x',
      };
      this.modules.push(mesh);
      modules.add(mesh);
    }

    this.modulesGroup = modules;
    this.group.add(modules);
  }

  // ------------------------------------------------------------ network ~z -20
  _buildNetwork(lod) {
    const network = new THREE.Group();
    network.position.set(0, 0.5, -20);

    // Nodes scattered in a flattened ellipsoid; deterministic pseudo-random.
    // Count is LOD-driven (60/40/26); the same seed keeps the cloud stable.
    const COUNT = lod.netCount;
    const nodes = [];
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647) * 2 - 1;
    };
    for (let i = 0; i < COUNT; i++) {
      nodes.push(new THREE.Vector3(rand() * 5.5, rand() * 2.8, rand() * 3.5));
    }

    // Points cloud.
    const ptsGeo = new THREE.BufferGeometry().setFromPoints(nodes);
    this.netPoints = new THREE.Points(
      ptsGeo,
      new THREE.PointsMaterial({
        color: MAGENTA,
        size: 0.07,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    network.add(this.netPoints);

    // Connect nearby neighbors once at construct time (distance threshold).
    const THRESHOLD = 2.0;
    const linePositions = [];
    for (let i = 0; i < COUNT; i++) {
      for (let j = i + 1; j < COUNT; j++) {
        if (nodes[i].distanceTo(nodes[j]) < THRESHOLD) {
          linePositions.push(
            nodes[i].x, nodes[i].y, nodes[i].z,
            nodes[j].x, nodes[j].y, nodes[j].z
          );
        }
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3)
    );
    this.netLines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: VIOLET,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    network.add(this.netLines);

    this.network = network;
    this.group.add(network);
  }

  // ------------------------------------------------------------ contact ~z -30
  _buildContact(lod) {
    const contact = new THREE.Group();
    contact.position.set(0, 0, -30);

    // Vast wireframe grid floor below the path; fog fades it into the dark.
    this.gridFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60, lod.gridSeg, lod.gridSeg),
      neonMat(VIOLET, 0.18, { wireframe: true })
    );
    this.gridFloor.rotation.x = -Math.PI / 2;
    this.gridFloor.position.set(0, -4, -8);
    contact.add(this.gridFloor);

    // Large distant torus "gate" the camera approaches.
    this.gate = new THREE.Mesh(
      new THREE.TorusGeometry(5, 0.06, lod.gateRadial, lod.gateTubular),
      neonMat(CYAN, 0.5)
    );
    this.gate.position.set(0, 0.5, -10);
    contact.add(this.gate);

    this.contact = contact;
    this.group.add(contact);
  }

  // ------------------------------------------------------------- setQuality
  // Adaptive LOD entry point (v1.1 quality contract). Rebuilds the geometry of
  // every section at the new tier and disposes the old GPU resources. Called by
  // SceneManager only on a committed tier change (hysteresis-gated), never per
  // frame, so the rebuild cost is rare. At 'high' the result is identical to the
  // original build, so no visual change occurs there.
  //
  // The camera-distance dissolve in update() keeps working untouched: it reads
  // this.hero.position and writes this.icoOuter/icoInner opacity, and those refs
  // are re-created here every rebuild with the same base opacities (0.35 / 0.12).
  setQuality(tier) {
    if (!LOD[tier] || tier === this.tier) return;
    this.tier = tier;
    const lod = LOD[tier];

    this._teardownSections();

    this._buildHero(lod);
    this._buildModules(lod);
    this._buildNetwork(lod);
    this._buildContact(lod);
  }

  // Remove all section sub-groups from the scene graph and free their geometry
  // and material so a rebuild at a new tier does not leak GPU memory. Materials
  // are per-mesh (no sharing) and the two module geometries are tracked
  // explicitly because several meshes share them.
  _teardownSections() {
    const disposeMesh = (mesh, { skipGeometry = false } = {}) => {
      if (!mesh) return;
      if (!skipGeometry && mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    };

    // Hero: icosahedra + rings (each has its own geometry + material).
    disposeMesh(this.icoOuter);
    disposeMesh(this.icoInner);
    disposeMesh(this.ringA);
    disposeMesh(this.ringB);
    this.group.remove(this.hero);

    // Modules: meshes share two geometries; dispose materials per mesh, then the
    // shared geometries once.
    for (const m of this.modules) disposeMesh(m, { skipGeometry: true });
    if (this._moduleGeos) for (const g of this._moduleGeos) g.dispose();
    this.group.remove(this.modulesGroup);

    // Network: points + line segments.
    disposeMesh(this.netPoints);
    disposeMesh(this.netLines);
    this.group.remove(this.network);

    // Contact: grid floor + gate.
    disposeMesh(this.gridFloor);
    disposeMesh(this.gate);
    this.group.remove(this.contact);
  }

  // ------------------------------------------------------------------- update
  update(dt, elapsed) {
    // Hero core: slow counter-rotation, gentle breathing drift.
    this.icoOuter.rotation.y += dt * 0.12;
    this.icoOuter.rotation.x += dt * 0.04;
    this.icoInner.rotation.y -= dt * 0.2;
    this.icoInner.rotation.z -= dt * 0.07;
    this.hero.position.y = 0.4 + Math.sin(elapsed * 0.5) * 0.15;

    // The hero->modules dolly passes through the core (closest approach
    // ~0.8 from its center). Dissolve both icosahedra around the flyby so
    // the additive shell never washes the frame or slices the near plane.
    // Reading the camera is fine — only CameraDirector may write it.
    const coreDist = this.sceneManager.camera.position.distanceTo(this.hero.position);
    const coreFade = THREE.MathUtils.smoothstep(coreDist, 2.6, 4.4);
    this.icoOuter.material.opacity = 0.35 * coreFade;
    this.icoInner.material.opacity = 0.12 * coreFade;

    // Rings orbit on their local axes at different rates.
    this.ringA.rotation.z += dt * 0.25;
    this.ringB.rotation.z -= dt * 0.18;

    // Modules: per-mesh bob + spin, whole group drifts almost imperceptibly.
    for (const m of this.modules) {
      const u = m.userData;
      m.position.y = u.baseY + Math.sin(elapsed * u.bobSpeed + u.bobPhase) * 0.35;
      m.rotation[u.spinAxis] += dt * u.spin;
    }
    this.modulesGroup.rotation.y = Math.sin(elapsed * 0.08) * 0.1;

    // Network: gentle slow rotation, soft vertical sway.
    this.network.rotation.y += dt * 0.05;
    this.network.position.y = 0.5 + Math.sin(elapsed * 0.3) * 0.2;

    // Contact: gate slowly turns; grid pulses opacity ever so slightly.
    this.gate.rotation.z += dt * 0.1;
    this.gate.rotation.y = Math.sin(elapsed * 0.2) * 0.12;
    this.gridFloor.material.opacity = 0.18 + Math.sin(elapsed * 0.6) * 0.04;
  }
}
