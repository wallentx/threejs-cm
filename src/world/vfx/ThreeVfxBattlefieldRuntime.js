import * as THREE from 'three';
import { color, mix, texture, vec4 } from 'three/tsl';
import {
  Appearance,
  Blending,
  EmitterShape,
  Lighting,
  VFXParticles
} from 'vanilla-vfx';

const THREE_VFX_FIRE_TEXTURE_PATH = '/assets/vfx/three-vfx/fire.png';
const THREE_VFX_SMOKE_TEXTURE_PATH = '/assets/vfx/three-vfx/smoke.png';
const WEIGHTED_FRAGMENT_CAPACITY = 160;
const WEIGHTED_FRAGMENT_STEP_SECONDS = 1 / 60;
const WEIGHTED_FRAGMENT_SAMPLE_SECONDS = 1 / 30;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const SYSTEM_DEFINITIONS = Object.freeze({
  impact: Object.freeze({
    maxParticles: 3072,
    autoStart: false,
    size: [0.025, 0.085],
    colorStart: ['#fff4c2', '#ffdd55', '#ffb347'],
    colorEnd: ['#ff6b1a', '#7d1708'],
    fadeSize: [1, 0],
    fadeOpacity: [1, 0],
    gravity: [0, -7.5, 0],
    lifetime: [0.18, 0.58],
    speed: [2.4, 8.5],
    friction: { intensity: 0.08, easing: 'easeOut' },
    appearance: Appearance.GRADIENT,
    intensity: 7.4,
    blending: Blending.ADDITIVE,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.POINT,
    renderOrder: 34
  }),
  hitSpark: Object.freeze({
    maxParticles: 1536,
    autoStart: false,
    size: [0.72, 1.18],
    colorStart: ['#ffd166'],
    colorEnd: ['#ff6b00', '#8f1d00'],
    fadeSize: [1, 0.16],
    fadeOpacity: [1, 0],
    gravity: [0, -12, 0],
    lifetime: [0.1, 0.34],
    speed: [18, 44],
    friction: { intensity: 0.025, easing: 'easeOut' },
    appearance: Appearance.DEFAULT,
    intensity: 1,
    blending: Blending.ADDITIVE,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.POINT,
    orientToDirection: true,
    orientAxis: 'z',
    stretchBySpeed: { factor: 0.045, maxStretch: 2.8 },
    renderOrder: 35
  }),
  explosion: Object.freeze({
    maxParticles: 720,
    autoStart: false,
    size: [0.52, 1.44],
    colorStart: ['#fb8d2b'],
    colorEnd: ['#fb8d2b'],
    fadeSize: [0.61, 1],
    fadeOpacity: [1, 0],
    gravity: [0, 0, 0],
    lifetime: [1, 2],
    speed: [0.1, 0.82],
    friction: { intensity: 0, easing: 'linear' },
    appearance: Appearance.GRADIENT,
    intensity: 1,
    blending: Blending.NORMAL,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.SPHERE,
    emitterRadius: [0, 0.27],
    startPositionAsDirection: true,
    rotation: [[0, 0], [-6, 6], [0, 0]],
    rotationSpeed: [[0, 0], [0, 0], [0, 0]],
    renderOrder: 31
  }),
  muzzleFlash: Object.freeze({
    maxParticles: 384,
    autoStart: false,
    size: [0.08, 0.24],
    colorStart: ['#ffffff', '#fff4c2', '#ffd166'],
    colorEnd: ['#ff7b22', '#7d1708'],
    fadeSize: [1, 0],
    fadeOpacity: [1, 0],
    gravity: [0, 0, 0],
    lifetime: [0.035, 0.11],
    speed: [2.5, 7.5],
    friction: { intensity: 0.2, easing: 'easeOut' },
    appearance: Appearance.GRADIENT,
    intensity: 9,
    blending: Blending.ADDITIVE,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.POINT,
    renderOrder: 36
  }),
  smoke: Object.freeze({
    maxParticles: 900,
    autoStart: false,
    size: [0.32, 0.72],
    colorStart: ['#24231f', '#34332e', '#55534d'],
    colorEnd: ['#111211', '#262724'],
    fadeSize: [0.42, 1.65],
    fadeOpacity: [0.58, 0],
    gravity: [0, 0.52, 0],
    lifetime: [2.4, 4.8],
    speed: [0.18, 0.72],
    friction: { intensity: 0.025, easing: 'easeOut' },
    turbulence: { intensity: 1.15, frequency: 0.82, speed: 0.3 },
    appearance: Appearance.GRADIENT,
    intensity: 0.82,
    blending: Blending.NORMAL,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.SPHERE,
    emitterRadius: [0, 0.2],
    renderOrder: 24
  }),
  vehicleSmoke: Object.freeze({
    // A peak single-vehicle cookoff emits 200 sheets/second. Keep enough
    // slots for the full maximum lifetime so an opaque sheet is never
    // overwritten merely because the circular particle pool wrapped.
    maxParticles: 1536,
    autoStart: false,
    size: [0.48, 1.18],
    colorStart: ['#090a09', '#11120f', '#1b1b17'],
    colorEnd: ['#080908', '#141510'],
    fadeSize: [0.22, 2.1],
    fadeSizeCurve: {
      points: [
        { pos: [0, 0.18] },
        { pos: [0.02, 0.5] },
        { pos: [0.04, 0.88] },
        { pos: [0.1, 1.08] },
        { pos: [0.6, 1.45] },
        { pos: [0.78, 1.9] },
        { pos: [1, 2.1] }
      ]
    },
    fadeOpacity: [0.98, 0],
    fadeOpacityCurve: {
      points: [
        { pos: [0, 0.05] },
        { pos: [0.02, 0.5] },
        { pos: [0.05, 0.98] },
        { pos: [0.55, 0.9] },
        { pos: [0.68, 0.62] },
        { pos: [0.78, 0.28] },
        { pos: [0.9, 0.08] },
        { pos: [0.98, 0.005] },
        { pos: [1, 0] }
      ]
    },
    velocityCurve: {
      points: [
        { pos: [0, 1] },
        { pos: [0.06, 1] },
        { pos: [0.18, 0.68] },
        { pos: [0.32, 0.38] },
        { pos: [0.48, 0.18] },
        { pos: [0.62, 0.08] },
        { pos: [0.68, 0.05] },
        { pos: [0.78, 0.02] },
        { pos: [0.84, 0.008] },
        { pos: [1, 0] }
      ]
    },
    gravity: [0, 0.16, 0],
    lifetime: [3.6, 6.8],
    speed: [0.12, 0.38],
    friction: { intensity: 0.045, easing: 'easeOut' },
    turbulence: { intensity: 0.14, frequency: 0.46, speed: 0.12 },
    rotation: [[0, 0], [0, 0], [-Math.PI, Math.PI]],
    rotationSpeed: [[0, 0], [0, 0], [-0.34, 0.34]],
    appearance: Appearance.DEFAULT,
    intensity: 0.86,
    blending: Blending.NORMAL,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.SPHERE,
    emitterRadius: [0, 0.18],
    renderOrder: 24
  }),
  vehicleSmokeHaze: Object.freeze({
    maxParticles: 1536,
    autoStart: false,
    size: [0.7, 1.48],
    colorStart: ['#171814', '#24241e'],
    colorEnd: ['#0c0d0b', '#1b1c17'],
    fadeSize: [0.18, 2.5],
    fadeSizeCurve: {
      points: [
        { pos: [0, 0.14] },
        { pos: [0.02, 0.46] },
        { pos: [0.045, 0.84] },
        { pos: [0.11, 1.08] },
        { pos: [0.6, 1.55] },
        { pos: [0.78, 2.25] },
        { pos: [1, 2.5] }
      ]
    },
    fadeOpacity: [0.56, 0],
    fadeOpacityCurve: {
      points: [
        { pos: [0, 0.03] },
        { pos: [0.025, 0.38] },
        { pos: [0.06, 0.82] },
        { pos: [0.55, 0.72] },
        { pos: [0.68, 0.5] },
        { pos: [0.78, 0.22] },
        { pos: [0.9, 0.06] },
        { pos: [0.98, 0.004] },
        { pos: [1, 0] }
      ]
    },
    velocityCurve: {
      points: [
        { pos: [0, 1] },
        { pos: [0.06, 1] },
        { pos: [0.18, 0.68] },
        { pos: [0.32, 0.38] },
        { pos: [0.48, 0.18] },
        { pos: [0.62, 0.08] },
        { pos: [0.68, 0.05] },
        { pos: [0.78, 0.02] },
        { pos: [0.84, 0.008] },
        { pos: [1, 0] }
      ]
    },
    gravity: [0, 0.1, 0],
    lifetime: [4.2, 7.6],
    speed: [0.08, 0.3],
    friction: { intensity: 0.045, easing: 'easeOut' },
    turbulence: { intensity: 0.1, frequency: 0.38, speed: 0.1 },
    rotation: [[0, 0], [0, 0], [-Math.PI, Math.PI]],
    rotationSpeed: [[0, 0], [0, 0], [-0.2, 0.2]],
    appearance: Appearance.DEFAULT,
    intensity: 0.62,
    blending: Blending.NORMAL,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.SPHERE,
    emitterRadius: [0, 0.28],
    renderOrder: 23
  }),
  cookoffFlashSpark: Object.freeze({
    maxParticles: 1024,
    autoStart: false,
    size: [0.003, 0.012],
    colorStart: ['#ffffff', '#fff7c2', '#ffd447'],
    colorEnd: ['#ff8a00', '#d93600'],
    fadeSize: [1, 0.12],
    fadeOpacity: [1, 0],
    gravity: [0, -5.2, 0],
    lifetime: [0.08, 0.3],
    speed: [1.8, 5.6],
    friction: { intensity: 0.035, easing: 'easeOut' },
    appearance: Appearance.CIRCULAR,
    intensity: 14,
    blending: Blending.ADDITIVE,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.SPHERE,
    emitterRadius: [0, 0.018],
    renderOrder: 35
  }),
  engineFlame: Object.freeze({
    maxParticles: 720,
    autoStart: false,
    size: [0.22, 0.68],
    colorStart: ['#ffd76a'],
    colorEnd: ['#ff6b00', '#6b1004'],
    fadeSize: [0.58, 1.18],
    fadeOpacity: [1, 0],
    gravity: [0, 1.15, 0],
    lifetime: [0.38, 0.94],
    speed: [0.65, 3.2],
    friction: { intensity: 0.045, easing: 'easeOut' },
    turbulence: { intensity: 0.58, frequency: 1.35, speed: 0.82 },
    appearance: Appearance.DEFAULT,
    intensity: 1,
    blending: Blending.NORMAL,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.POINT,
    renderOrder: 33
  }),
  persistentFireCore: Object.freeze({
    maxParticles: 480,
    autoStart: false,
    size: [0.12, 0.42],
    colorStart: ['#fff4c2'],
    colorEnd: ['#ff5b00', '#7b1204'],
    fadeSize: [0.48, 0.94],
    fadeOpacity: [1, 0],
    gravity: [0, 1.3, 0],
    lifetime: [0.24, 0.68],
    speed: [0.85, 3.8],
    friction: { intensity: 0.035, easing: 'easeOut' },
    turbulence: { intensity: 0.42, frequency: 1.6, speed: 0.95 },
    appearance: Appearance.DEFAULT,
    intensity: 1,
    blending: Blending.ADDITIVE,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.POINT,
    stretchBySpeed: { factor: 0.055, maxStretch: 1.85 },
    renderOrder: 34
  }),
  fireEmber: Object.freeze({
    // Embers are intentionally pinprick-sized, so the stream needs enough
    // simultaneous points to read as a shower instead of occasional sparks.
    maxParticles: 1024,
    autoStart: false,
    size: [0.002, 0.012],
    colorStart: ['#ff2d08', '#ef1404', '#c90802'],
    colorEnd: ['#810702', '#310100'],
    fadeSize: [1, 0.18],
    fadeOpacity: [0.96, 0],
    gravity: [0, 0, 0],
    lifetime: [0.65, 1.55],
    speed: [0.45, 1.6],
    friction: { intensity: 0.08, easing: 'easeOut' },
    turbulence: { intensity: 0.22, frequency: 1.15, speed: 0.48 },
    appearance: Appearance.CIRCULAR,
    intensity: 20,
    blending: Blending.ADDITIVE,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.SPHERE,
    emitterRadius: [0, 0.025],
    renderOrder: 35
  }),
  debris: Object.freeze({
    maxParticles: 960,
    autoStart: false,
    size: [0.06, 0.22],
    colorStart: ['#a58f73', '#8c6f52', '#795333'],
    colorEnd: ['#625343', '#3f352d'],
    fadeSize: [1, 0.35],
    fadeOpacity: [1, 0],
    gravity: [0, -8.6, 0],
    lifetime: [0.55, 1.35],
    speed: [1.2, 5.8],
    friction: { intensity: 0.04, easing: 'easeOut' },
    rotation: [[-Math.PI, Math.PI], [-Math.PI, Math.PI], [-Math.PI, Math.PI]],
    rotationSpeed: [[-8, 8], [-8, 8], [-8, 8]],
    appearance: Appearance.DEFAULT,
    intensity: 1.15,
    blending: Blending.NORMAL,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.POINT,
    renderOrder: 26
  }),
  dust: Object.freeze({
    maxParticles: 720,
    autoStart: false,
    size: [0.35, 0.9],
    colorStart: ['#a89b86', '#887b68', '#6f6558'],
    colorEnd: ['#5f5a51', '#494640'],
    fadeSize: [0.4, 1.9],
    fadeOpacity: [0.52, 0],
    gravity: [0, 0.16, 0],
    lifetime: [0.8, 2.2],
    speed: [0.2, 1.8],
    friction: { intensity: 0.1, easing: 'easeOut' },
    turbulence: { intensity: 0.38, frequency: 0.72, speed: 0.22 },
    appearance: Appearance.GRADIENT,
    intensity: 0.78,
    blending: Blending.NORMAL,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.SPHERE,
    emitterRadius: [0, 0.25],
    renderOrder: 23
  })
});

const REQUIRED_SYSTEMS = Object.freeze(Object.keys(SYSTEM_DEFINITIONS));
const UP = new THREE.Vector3(0, 1, 0);
const scratchDirection = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchReflected = new THREE.Vector3();
const scratchTangent = new THREE.Vector3();
const scratchBitangent = new THREE.Vector3();
const scratchFragmentDirection = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);

function createLandingPageExplosionColorNode(fireTexture) {
  const fireColor = color('#fb8d2b').mul(30);
  return ({ progress }) => {
    return vec4(
      fireColor.mul(progress.oneMinus().smoothstep(0.6, 0.8)),
      texture(fireTexture).a.mul(progress.oneMinus())
    );
  };
}

function createLandingPageSparkColorNode() {
  const whiteHot = color('#fff4c2').mul(60);
  const ember = color('#fb8d2b').mul(30);
  return ({ progress }) => mix(whiteHot, ember, progress.smoothstep(0, 0.3));
}

function createHitSparkColorNode() {
  const hotMetal = color('#ffd166').mul(24);
  const orange = color('#ff7a00').mul(14);
  const cooling = color('#8f1d00').mul(3);
  return ({ progress }) => mix(
    mix(hotMetal, orange, progress.smoothstep(0, 0.24)),
    cooling,
    progress.smoothstep(0.58, 1)
  );
}

function createCookoffFlashSparkColorNode() {
  const whiteHot = color('#ffffff').mul(90);
  const gold = color('#ffd447').mul(54);
  const orange = color('#ff6a00').mul(28);
  return ({ progress }) => mix(
    mix(whiteHot, gold, progress.smoothstep(0, 0.2)),
    orange,
    progress.smoothstep(0.38, 1)
  );
}

function createEngineFlameColorNode(fireTexture) {
  const ignition = color('#fff0a6').mul(15);
  const body = color('#ff7100').mul(11);
  const cooling = color('#671004').mul(2.4);
  return ({ progress }) => {
    const burningColor = mix(
      mix(ignition, body, progress.smoothstep(0.04, 0.42)),
      cooling,
      progress.smoothstep(0.62, 0.98)
    );
    return vec4(
      burningColor,
      texture(fireTexture).a.mul(progress.oneMinus())
    );
  };
}

function createPersistentFireCoreColorNode(fireTexture) {
  const whiteHot = color('#fff4c2').mul(24);
  const orange = color('#ff7100').mul(16);
  const ember = color('#8f1704').mul(4);
  return ({ progress }) => {
    const burningColor = mix(
      mix(whiteHot, orange, progress.smoothstep(0.02, 0.34)),
      ember,
      progress.smoothstep(0.58, 0.96)
    );
    return vec4(
      burningColor,
      texture(fireTexture).a.mul(progress.oneMinus())
    );
  };
}

function createWeightedFragment() {
  return {
    active: false,
    kind: 'spark',
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    ageSeconds: 0,
    lifetimeSeconds: 0,
    sampleSeconds: 0,
    bounceCount: 0,
    maximumBounces: 0,
    bounce: 0,
    friction: 0,
    size: 1
  };
}

function finiteTriplet(value) {
  if (value?.isVector3) return [value.x, value.y, value.z];
  if (!Array.isArray(value) || value.length < 3) return null;
  const triplet = value.slice(0, 3).map(Number);
  return triplet.every(Number.isFinite) ? triplet : null;
}

function normalizedDirection(value, fallback = UP) {
  const triplet = finiteTriplet(value);
  scratchDirection.fromArray(triplet ?? fallback.toArray());
  if (scratchDirection.lengthSq() <= 1e-9) scratchDirection.copy(fallback);
  return scratchDirection.normalize();
}

function directionRange(direction, spread = 0.2) {
  const vector = normalizedDirection(direction);
  return [
    [vector.x - spread, vector.x + spread],
    [vector.y - spread, vector.y + spread],
    [vector.z - spread, vector.z + spread]
  ];
}

function buoyantSmokeDirection(direction, upwardBias = 0.78) {
  const vector = normalizedDirection(direction);
  const bias = THREE.MathUtils.clamp(upwardBias, 0, 1);
  const x = vector.x * (1 - bias);
  const y = vector.y * (1 - bias) + bias;
  const z = vector.z * (1 - bias);
  const magnitude = Math.hypot(x, y, z);
  if (magnitude <= 1e-8) return [0, 1, 0];
  return [x / magnitude, y / magnitude, z / magnitude];
}

function resolveImpactDirection({
  impactVelocity,
  postImpactVelocity,
  impactNormal,
  ricocheted
}) {
  const velocity = finiteTriplet(impactVelocity);
  const outgoingVelocity = finiteTriplet(postImpactVelocity);
  const normal = finiteTriplet(impactNormal);
  if (ricocheted && outgoingVelocity) {
    return scratchReflected.fromArray(outgoingVelocity).normalize().toArray();
  }
  if (velocity && normal) {
    scratchDirection.fromArray(velocity).normalize();
    scratchNormal.fromArray(normal).normalize();
    if (ricocheted) {
      return scratchReflected
        .copy(scratchDirection)
        .reflect(scratchNormal)
        .normalize()
        .toArray();
    }
    return scratchReflected
      .copy(scratchDirection)
      .addScaledVector(scratchNormal, 1.2)
      .normalize()
      .toArray();
  }
  if (normal) return scratchNormal.fromArray(normal).normalize().toArray();
  if (velocity) return scratchDirection.fromArray(velocity).normalize().toArray();
  return UP.toArray();
}

function particleCount(base, scale, maximum) {
  return THREE.MathUtils.clamp(Math.round(base * Math.max(0.2, scale)), 1, maximum);
}

function smoothstepValue(edge0, edge1, value) {
  const progress = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function offsetAlongDirection(position, direction, distance) {
  const point = finiteTriplet(position);
  const vector = finiteTriplet(direction);
  if (!point) return null;
  if (!vector || !(distance > 0)) return point;
  const magnitude = Math.hypot(vector[0], vector[1], vector[2]);
  if (!(magnitude > 1e-8)) return point;
  const scale = distance / magnitude;
  return [
    point[0] + vector[0] * scale,
    point[1] + vector[1] * scale,
    point[2] + vector[2] * scale
  ];
}

function colorString(value, fallback = '#8c6f52') {
  if (typeof value === 'string' && value.length > 0) return value;
  if (!Number.isFinite(value)) return fallback;
  return `#${Math.max(0, Math.min(0xffffff, Math.round(value)))
    .toString(16)
    .padStart(6, '0')}`;
}

export class ThreeVfxBattlefieldRuntime {
  constructor({
    renderer,
    scene,
    getGroundHeightAt = () => 0,
    loadTexture = path => new THREE.TextureLoader().loadAsync(path),
    createParticleSystem = (graphicsRenderer, options) =>
      new VFXParticles(graphicsRenderer, options)
  } = {}) {
    if (!renderer) throw new TypeError('Three-VFX runtime requires a renderer');
    if (!scene?.isScene) throw new TypeError('Three-VFX runtime requires a scene');
    if (typeof createParticleSystem !== 'function') {
      throw new TypeError('Three-VFX runtime requires a particle-system factory');
    }
    if (typeof getGroundHeightAt !== 'function') {
      throw new TypeError('Three-VFX runtime ground-height query must be a function');
    }
    if (typeof loadTexture !== 'function') {
      throw new TypeError('Three-VFX runtime texture loader must be a function');
    }
    this.renderer = renderer;
    this.scene = scene;
    this.getGroundHeightAt = getGroundHeightAt;
    this.loadTexture = loadTexture;
    this.createParticleSystem = createParticleSystem;
    this.systems = new Map();
    this.vehicleEmission = new Map();
    this.weightedFragments = Array.from(
      { length: WEIGHTED_FRAGMENT_CAPACITY },
      createWeightedFragment
    );
    this.fragmentCursor = 0;
    this.fragmentSequence = 0;
    this.fragmentBounceCount = 0;
    this.explosionTexture = null;
    this.smokeTexture = null;
    this.hitSparkGeometry = new THREE.BoxGeometry(0.018, 0.018, 0.16);
    this.hitSparkGeometry.name = 'ThreeVfx_hitSparkGeometry';
    this.initialized = false;
    this.disposed = false;
    this.spawnCounts = Object.fromEntries(REQUIRED_SYSTEMS.map(name => [name, 0]));
  }

  async initialize() {
    if (this.initialized) return this;
    if (this.disposed) throw new Error('cannot initialize disposed Three-VFX runtime');
    try {
      this.explosionTexture = await this.loadTexture(THREE_VFX_FIRE_TEXTURE_PATH);
      if (!this.explosionTexture?.isTexture) {
        throw new TypeError('Three-VFX fire texture loader returned an invalid texture');
      }
      this.explosionTexture.minFilter = THREE.NearestFilter;
      this.explosionTexture.magFilter = THREE.NearestFilter;
      this.explosionTexture.generateMipmaps = false;
      this.smokeTexture = await this.loadTexture(THREE_VFX_SMOKE_TEXTURE_PATH);
      if (!this.smokeTexture?.isTexture) {
        throw new TypeError('Three-VFX smoke texture loader returned an invalid texture');
      }
      this.smokeTexture.minFilter = THREE.LinearMipmapLinearFilter;
      this.smokeTexture.magFilter = THREE.LinearFilter;
      this.smokeTexture.generateMipmaps = true;
      for (const name of REQUIRED_SYSTEMS) {
        const options = { ...SYSTEM_DEFINITIONS[name] };
        if (name === 'explosion') {
          options.colorNode = createLandingPageExplosionColorNode(
            this.explosionTexture
          );
        } else if (name === 'impact') {
          options.colorNode = createLandingPageSparkColorNode();
        } else if (name === 'hitSpark') {
          options.colorNode = createHitSparkColorNode();
          options.geometry = this.hitSparkGeometry;
        } else if (name === 'cookoffFlashSpark') {
          options.colorNode = createCookoffFlashSparkColorNode();
        } else if (name === 'engineFlame') {
          options.colorNode = createEngineFlameColorNode(
            this.explosionTexture
          );
        } else if (name === 'persistentFireCore') {
          options.colorNode = createPersistentFireCoreColorNode(
            this.explosionTexture
          );
        } else if (name === 'vehicleSmoke' || name === 'vehicleSmokeHaze') {
          options.alphaMap = this.smokeTexture;
          options.flipbook = { rows: 16, columns: 16 };
        }
        const system = this.createParticleSystem(
          this.renderer,
          options
        );
        if (!system?.object3D?.isObject3D || typeof system.init !== 'function') {
          throw new TypeError(`Three-VFX ${name} system is invalid`);
        }
        system.object3D.name = `ThreeVfx_${name}`;
        system.object3D.userData.presentationOnly = true;
        system.object3D.userData.vfxRole = name;
        this.systems.set(name, system);
        this.scene.add(system.object3D);
        await system.init();
        system.stop?.();
      }
      this.initialized = true;
      return this;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  spawn(name, position, count, overrides = null) {
    const point = finiteTriplet(position);
    const system = this.systems.get(name);
    if (!this.initialized || !point || !system || count <= 0) return false;
    const boundedCount = Math.max(1, Math.floor(count));
    system.spawn(point[0], point[1], point[2], boundedCount, overrides);
    this.spawnCounts[name] += boundedCount;
    return true;
  }

  queueWeightedFragments({
    position,
    direction = UP,
    count,
    kind = 'spark',
    speed = [2.5, 7.5],
    lifetime = [0.55, 1.15],
    size = 1,
    bounce = kind === 'debris' ? 0.34 : 0.48,
    friction = kind === 'debris' ? 0.62 : 0.72,
    maximumBounces = kind === 'debris' ? 2 : 3
  } = {}) {
    const point = finiteTriplet(position);
    if (!this.initialized || this.disposed || !point || !(count > 0)) return false;
    const baseDirection = scratchNormal.copy(normalizedDirection(direction));
    scratchTangent.crossVectors(baseDirection, UP);
    if (scratchTangent.lengthSq() <= 1e-8) {
      scratchTangent.crossVectors(baseDirection, X_AXIS);
    }
    scratchTangent.normalize();
    scratchBitangent.crossVectors(baseDirection, scratchTangent).normalize();
    const minimumSpeed = Math.max(0.1, Number(speed?.[0]) || 0.1);
    const maximumSpeed = Math.max(minimumSpeed, Number(speed?.[1]) || minimumSpeed);
    const minimumLifetime = Math.max(0.1, Number(lifetime?.[0]) || 0.1);
    const maximumLifetime = Math.max(
      minimumLifetime,
      Number(lifetime?.[1]) || minimumLifetime
    );
    const boundedCount = Math.min(Math.floor(count), WEIGHTED_FRAGMENT_CAPACITY);

    for (let index = 0; index < boundedCount; index++) {
      const sequence = this.fragmentSequence++;
      const fragment = this.weightedFragments[this.fragmentCursor];
      this.fragmentCursor = (this.fragmentCursor + 1) % this.weightedFragments.length;
      const phase = sequence * GOLDEN_ANGLE;
      const radial = 0.38 + ((sequence * 37) % 11) / 18;
      const speedProgress = ((sequence * 61) % 101) / 100;
      const lifetimeProgress = ((sequence * 43) % 97) / 96;
      if (kind === 'roundSpark') {
        scratchFragmentDirection
          .copy(baseDirection)
          .multiplyScalar(0.9)
          .addScaledVector(scratchTangent, Math.cos(phase) * radial * 0.34)
          .addScaledVector(UP, 0.06 + Math.sin(phase) * 0.18)
          .normalize();
      } else {
        scratchFragmentDirection
          .copy(baseDirection)
          .multiplyScalar(kind === 'debris' ? 0.34 : 0.52)
          .addScaledVector(scratchTangent, Math.cos(phase) * radial)
          .addScaledVector(scratchBitangent, Math.sin(phase) * radial)
          .addScaledVector(UP, kind === 'debris' ? 0.82 : 0.58)
          .normalize();
      }
      fragment.active = true;
      fragment.kind = kind;
      fragment.position.fromArray(point).addScaledVector(baseDirection, 0.025);
      fragment.velocity.copy(scratchFragmentDirection).multiplyScalar(
        THREE.MathUtils.lerp(minimumSpeed, maximumSpeed, speedProgress)
      );
      fragment.ageSeconds = 0;
      fragment.lifetimeSeconds = THREE.MathUtils.lerp(
        minimumLifetime,
        maximumLifetime,
        lifetimeProgress
      );
      fragment.sampleSeconds = kind === 'heroSpark'
        ? WEIGHTED_FRAGMENT_STEP_SECONDS
        : WEIGHTED_FRAGMENT_SAMPLE_SECONDS;
      fragment.bounceCount = 0;
      fragment.maximumBounces = Math.max(0, Math.floor(maximumBounces));
      fragment.bounce = THREE.MathUtils.clamp(bounce, 0, 1);
      fragment.friction = THREE.MathUtils.clamp(friction, 0, 1);
      fragment.size = Math.max(0.2, Number(size) || 1);
    }
    return true;
  }

  queueLandingPageArcs({ position, scale = 1, count = null } = {}) {
    const point = finiteTriplet(position);
    if (!this.initialized || this.disposed || !point) return false;
    const intensity = THREE.MathUtils.clamp(Number(scale) || 1, 0.25, 4);
    const trackCount = count == null
      ? 3 + ((this.fragmentSequence * 7 + 5) % 10)
      : THREE.MathUtils.clamp(Math.floor(count), 3, 12);
    const velocityScale = Math.sqrt(intensity);
    for (let index = 0; index < trackCount; index++) {
      const sequence = this.fragmentSequence++;
      const fragment = this.weightedFragments[this.fragmentCursor];
      this.fragmentCursor = (this.fragmentCursor + 1) % this.weightedFragments.length;
      const angle = sequence * GOLDEN_ANGLE;
      const horizontalProgress = ((sequence * 37 + 17) % 101) / 100;
      const verticalProgress = ((sequence * 61 + 29) % 101) / 100;
      const lifetimeProgress = ((sequence * 43 + 11) % 97) / 96;
      const horizontalSpeed = horizontalProgress * 8 * velocityScale;
      fragment.active = true;
      fragment.kind = 'heroSpark';
      fragment.position.fromArray(point);
      fragment.velocity.set(
        Math.cos(angle) * horizontalSpeed,
        THREE.MathUtils.lerp(0.1, 10, verticalProgress) * velocityScale,
        Math.sin(angle) * horizontalSpeed
      );
      fragment.ageSeconds = 0;
      fragment.lifetimeSeconds = THREE.MathUtils.lerp(1.6, 2.8, lifetimeProgress);
      fragment.sampleSeconds = WEIGHTED_FRAGMENT_STEP_SECONDS;
      fragment.bounceCount = 0;
      fragment.maximumBounces = 2;
      fragment.bounce = 0.34;
      fragment.friction = 0.62;
      fragment.size = Math.min(2.2, intensity);
    }
    return true;
  }

  emitWeightedFragmentSample(fragment) {
    const direction = scratchFragmentDirection.copy(fragment.velocity);
    const speed = direction.length();
    if (speed <= 1e-6) return false;
    direction.multiplyScalar(1 / speed);
    if (fragment.kind === 'heroSpark') {
      return this.spawn('impact', fragment.position, 6, {
        colorStart: ['#fff4c2', '#ffd166'],
        colorEnd: ['#fb8d2b', '#7d1708'],
        direction: directionRange(direction, 0.3),
        gravity: [0, -0.5, 0],
        speed: [0.1, 1],
        size: [0.0025 * fragment.size, 0.009 * fragment.size],
        lifetime: [1, 3.6]
      });
    }
    if (fragment.kind === 'roundSpark') {
      return this.spawn('hitSpark', fragment.position, 1, {
        direction: directionRange(direction, 0.035),
        gravity: [0, -12, 0],
        speed: [Math.max(9, speed * 0.52), Math.max(14, speed * 0.84)],
        size: [0.68 * fragment.size, 1.12 * fragment.size],
        lifetime: [0.08, 0.22]
      });
    }
    if (fragment.kind === 'debris') {
      return this.spawn('debris', fragment.position, 1, {
        colorStart: ['#fff0aa', '#dd8f43', '#6e5744'],
        colorEnd: ['#5b493d', '#2d2926'],
        direction: directionRange(direction, 0.025),
        gravity: [0, -9.81, 0],
        speed: [speed * 0.14, speed * 0.22],
        size: [0.035 * fragment.size, 0.075 * fragment.size],
        lifetime: [0.11, 0.2]
      });
    }
    return this.spawn('impact', fragment.position, 1, {
      direction: directionRange(direction, 0.018),
      gravity: [0, -9.81, 0],
      speed: [speed * 0.18, speed * 0.28],
      size: [0.012 * fragment.size, 0.038 * fragment.size],
      lifetime: [0.08, 0.16]
    });
  }

  advanceWeightedFragments(deltaSeconds) {
    let remaining = deltaSeconds;
    while (remaining > 1e-9) {
      const step = Math.min(WEIGHTED_FRAGMENT_STEP_SECONDS, remaining);
      for (const fragment of this.weightedFragments) {
        if (!fragment.active) continue;
        fragment.ageSeconds += step;
        if (fragment.ageSeconds >= fragment.lifetimeSeconds) {
          fragment.active = false;
          continue;
        }
        fragment.velocity.y -= 9.81 * step;
        fragment.position.addScaledVector(fragment.velocity, step);
        const sampledGround = Number(this.getGroundHeightAt(
          fragment.position.x,
          fragment.position.z
        ));
        const groundY = Number.isFinite(sampledGround) ? sampledGround + 0.012 : 0.012;
        if (fragment.position.y <= groundY && fragment.velocity.y < 0) {
          fragment.position.y = groundY;
          fragment.velocity.y = -fragment.velocity.y * fragment.bounce;
          fragment.velocity.x *= fragment.friction;
          fragment.velocity.z *= fragment.friction;
          fragment.bounceCount++;
          this.fragmentBounceCount++;
          if (
            fragment.bounceCount > fragment.maximumBounces
            || fragment.velocity.lengthSq() < 0.18
          ) {
            fragment.active = false;
            continue;
          }
        }
        const sampleInterval = fragment.kind === 'heroSpark'
          ? WEIGHTED_FRAGMENT_STEP_SECONDS
          : WEIGHTED_FRAGMENT_SAMPLE_SECONDS;
        fragment.sampleSeconds += step;
        if (fragment.sampleSeconds + 1e-9 >= sampleInterval) {
          fragment.sampleSeconds %= sampleInterval;
          this.emitWeightedFragmentSample(fragment);
        }
      }
      remaining -= step;
    }
  }

  emitImpact({
    position,
    impactVelocity = null,
    postImpactVelocity = null,
    impactNormal = null,
    ricocheted = false,
    penetrated = false,
    scale = 1
  } = {}) {
    const direction = resolveImpactDirection({
      impactVelocity,
      postImpactVelocity,
      impactNormal,
      ricocheted
    });
    const intensity = THREE.MathUtils.clamp(scale, 0.25, 2.5);
    const sparked = this.spawn(
      'hitSpark',
      position,
      particleCount(ricocheted ? 20 : (penetrated ? 16 : 12), intensity, 44),
      {
        direction: directionRange(direction, ricocheted ? 0.08 : 0.2),
        gravity: [0, -12, 0],
        speed: ricocheted
          ? [30, 58]
          : (penetrated ? [24, 50] : [18, 38]),
        lifetime: ricocheted ? [0.14, 0.34] : [0.1, 0.28],
        size: [0.68 * intensity, 1.18 * intensity]
      }
    );
    const weighted = this.queueWeightedFragments({
      position,
      direction,
      count: particleCount(ricocheted ? 6 : (penetrated ? 4 : 3), intensity, 12),
      kind: 'roundSpark',
      speed: ricocheted ? [22, 42] : (penetrated ? [18, 36] : [14, 30]),
      lifetime: ricocheted ? [0.36, 0.72] : [0.24, 0.58],
      size: intensity,
      bounce: ricocheted ? 0.54 : 0.46,
      friction: 0.74,
      maximumBounces: ricocheted ? 3 : 2
    });
    const flashed = this.spawn('muzzleFlash', position, particleCount(4, intensity, 12), {
      direction: directionRange(direction, 0.34),
      speed: [0.25, 1.2],
      size: [0.09 * intensity, 0.24 * intensity],
      lifetime: [0.03, 0.085]
    });
    return sparked || weighted || flashed;
  }

  emitExplosion({ position, scale = 1, profile = 'impact' } = {}) {
    const intensity = THREE.MathUtils.clamp(scale, 0.25, 4);
    const cookoff = profile === 'cookoff';
    const fireball = this.spawn('explosion', position, cookoff ? 100 : 64, {
      emitterShape: EmitterShape.SPHERE,
      emitterRadius: [0, (cookoff ? 0.27 : 0.16) * intensity],
      size: cookoff
        ? [0.52 * intensity, 1.44 * intensity]
        : [0.32 * intensity, 0.88 * intensity],
      speed: cookoff
        ? [0.1 * Math.sqrt(intensity), 0.82 * Math.sqrt(intensity)]
        : [5.5 * Math.sqrt(intensity), 15 * Math.sqrt(intensity)],
      lifetime: cookoff ? [1, 2] : [0.1, 0.3]
    });
    const sparks = this.spawn('impact', position, cookoff ? 130 : 52, {
      direction: [[-1, 1], [-1, 1], [-1, 1]],
      gravity: cookoff ? [0, -0.5, 0] : [0, -11, 0],
      speed: cookoff
        ? [0.1, 2]
        : [18 * Math.sqrt(intensity), 48 * Math.sqrt(intensity)],
      size: [0.0025 * intensity, 0.012 * intensity],
      lifetime: cookoff ? [1, 4.5] : [0.08, 0.38]
    });
    const weightedSparks = cookoff
      ? this.queueLandingPageArcs({ position, scale: intensity, count: 8 })
      : this.queueWeightedFragments({
          position,
          direction: [0, 1, 0],
          count: particleCount(12, Math.sqrt(intensity), 28),
          kind: 'spark',
          speed: [16, 38 * Math.sqrt(intensity)],
          lifetime: [0.18, 0.58],
          size: Math.min(1.3, intensity),
          bounce: 0.42,
          friction: 0.68,
          maximumBounces: 2
        });
    const weightedDebris = this.queueWeightedFragments({
      position,
      direction: [0, 1, 0],
      count: particleCount(cookoff ? 18 : 8, Math.sqrt(intensity), 42),
      kind: 'debris',
      speed: cookoff
        ? [3.6, 7.8 * Math.sqrt(intensity)]
        : [14, 32 * Math.sqrt(intensity)],
      lifetime: cookoff ? [1.1, 2.25] : [0.3, 0.82],
      size: Math.min(2.4, intensity),
      bounce: 0.32,
      friction: 0.58,
      maximumBounces: 2
    });
    return fireball || sparks || weightedSparks || weightedDebris;
  }

  emitMuzzleFlash({ position, direction, caliberMm = 7.5, automatic = false } = {}) {
    const caliberScale = THREE.MathUtils.clamp(caliberMm / 24, 0.28, 2.8);
    const count = automatic ? 5 : particleCount(8, caliberScale, 28);
    const flash = this.spawn('muzzleFlash', position, count, {
      direction: directionRange(direction, automatic ? 0.1 : 0.17),
      speed: [2.2, 6.8 + caliberScale * 1.4],
      size: [0.07 * caliberScale, 0.25 * caliberScale],
      lifetime: automatic ? [0.025, 0.065] : [0.035, 0.11]
    });
    const smoke = this.spawn('smoke', position, automatic ? 1 : particleCount(2, caliberScale, 6), {
      direction: directionRange(direction, 0.2),
      speed: [0.15, 0.65 + caliberScale * 0.25],
      size: [0.1 * caliberScale, 0.28 * caliberScale],
      lifetime: [0.35, 0.9],
      fadeSize: [0.35, 1.25],
      fadeOpacity: [0.28, 0]
    });
    return flash || smoke;
  }

  emitBuildingDebris({ position, style = null, severity = 'damaged' } = {}) {
    const point = finiteTriplet(position);
    if (!this.initialized || this.disposed || !point) return false;
    const severityScale = severity === 'collapsed'
      ? 1.55
      : (severity === 'breached' ? 1.12 : 0.72);
    const styleScale = Math.max(0.3, Number(style?.initialScale) || 0.8);
    const primaryColor = colorString(style?.color);
    const debris = this.spawn(
      'debris',
      point,
      particleCount(18, severityScale, 64),
      {
        colorStart: [primaryColor, '#a89b86', '#625343'],
        colorEnd: ['#51463b', '#302b27'],
        direction: [[-1, 1], [0.18, 1], [-1, 1]],
        speed: [0.9, 4.2 + severityScale * 1.8],
        size: [0.055 * styleScale, 0.24 * styleScale],
        lifetime: [0.5, Math.max(0.7, Number(style?.maxLife) || 1) * 1.3]
      }
    );
    const dust = this.spawn(
      'dust',
      point,
      particleCount(10, severityScale, 32),
      {
        colorStart: [primaryColor, '#a89b86', '#777067'],
        direction: [[-0.75, 0.75], [0.08, 0.72], [-0.75, 0.75]],
        emitterRadius: [0, 0.24 * severityScale],
        speed: [0.18, 1.25 + severityScale * 0.5],
        size: [0.26 * styleScale, 0.82 * styleScale * severityScale],
        lifetime: [0.75, 1.45 + severityScale * 0.55]
      }
    );
    return debris || dust;
  }

  emitVehicleDamageState({
    unitId,
    position,
    blastPosition = position,
    turretRingPosition = blastPosition,
    vents = null,
    dimensions,
    delta,
    shouldSmoke,
    burning,
    fireIntensity = 0,
    firePhase = null,
    fireVentProgress = 0,
    firePostBlastProgress = 0,
    lowDetail = false,
    ignitionTransition = false,
    destructionTransition = false,
    detonationTransition = false
  } = {}) {
    if (
      !this.initialized
      || this.disposed
      || typeof unitId !== 'string'
      || !finiteTriplet(position)
    ) return false;
    const boundedDelta = THREE.MathUtils.clamp(delta ?? 0, 0, 0.1);
    const width = Math.max(0.5, Number(dimensions?.width) || 2);
    const height = Math.max(0.5, Number(dimensions?.height) || 2);
    const length = Math.max(0.5, Number(dimensions?.length) || 4);
    const intensity = THREE.MathUtils.clamp(Number(fireIntensity) || 0, 0, 1);
    const ventBuild = firePhase === 'AMMUNITION_VENTING'
      ? smoothstepValue(0.67, 0.94, Number(fireVentProgress) || 0)
      : 0;
    const postBlastEnvelope = firePhase === 'DETONATED'
      ? 1 - smoothstepValue(0.18, 1, Number(firePostBlastProgress) || 0)
      : 1;
    const postBlastProgress = THREE.MathUtils.clamp(
      Number(firePostBlastProgress) || 0,
      0,
      1
    );
    const venting = firePhase === 'AMMUNITION_VENTING';
    const detonated = firePhase === 'DETONATED';
    const postBlastDecay = detonated
      ? 1 - smoothstepValue(0.05, 1, postBlastProgress)
      : 0;
    const postBlastStrength = detonated
      ? 0.18 + postBlastDecay * 0.82
      : 0;
    const turretRingPoint = finiteTriplet(turretRingPosition)
      ?? finiteTriplet(blastPosition)
      ?? finiteTriplet(position);
    const availableVents = Array.isArray(vents) ? vents : [];
    const ventCount = Math.max(1, availableVents.length);
    const ventAt = index => availableVents[index % ventCount] ?? null;
    const ventPosition = vent => finiteTriplet(vent?.position) ? vent.position : position;
    const ventDirection = vent => finiteTriplet(vent?.direction) ?? [0, 1, 0];
    const activeFireVentCount = venting
      ? ventCount
      : (firePhase === 'SPREADING_FIRE'
          ? Math.min(5, ventCount)
          : Math.min(detonated ? 2 : 3, ventCount));
    const ventFlameSpeed = venting
      ? [1.1 + ventBuild * 1.5, 2.3 + ventBuild * 2.2]
      : detonated
        ? [0.35, 1.8 + intensity * 0.6]
        : [0.45, 1.8 + intensity * 0.8];
    const ventFlameLifetime = venting
      ? [0.22, 0.62]
      : (detonated ? [0.32, 0.92] : [0.42, 1.02]);
    const ringFlameSpeed = [
      1.05 + postBlastStrength * 0.75,
      2.5 + postBlastStrength * 3.3
    ];
    const ringFlameLifetime = [
      0.42,
      0.66 + postBlastStrength * 0.59
    ];
    const state = this.vehicleEmission.get(unitId) ?? {
      smokeBudget: 0,
      flameBudget: 0,
      turretFlameBudget: 0,
      sparkBudget: 0,
      emberBudget: 0,
      smokeCursor: 0,
      flameCursor: 0,
      sparkCursor: 0,
      emberCursor: 0
    };
    state.turretFlameBudget ??= 0;
    state.emberBudget ??= 0;
    state.emberCursor ??= 0;
    state.cookoffFlashEmitted ??= false;

    if (shouldSmoke) {
      const fireSmoke = Boolean(burning);
      // The post-cookoff ring is a wide source, so keep three slots for its
      // plume while still cycling through every simultaneously burning vent.
      const turretRingSmokeWeight = fireSmoke && detonated ? 3 : 0;
      const smokeActiveSourceCount = activeFireVentCount + turretRingSmokeWeight;
      const baselineRate = fireSmoke
        ? (lowDetail ? 10 : 20) + intensity * (lowDetail ? 8 : 16)
        : (lowDetail ? 7 : 16);
      const rate = fireSmoke
        ? Math.max(
            baselineRate,
            smokeActiveSourceCount * (lowDetail ? 10 : 20)
          )
        : baselineRate;
      state.smokeBudget += boundedDelta * rate;
      const count = Math.min(
        Math.max(5, smokeActiveSourceCount),
        Math.floor(state.smokeBudget)
      );
      if (count > 0) {
        state.smokeBudget -= count;
        for (let index = 0; index < count; index++) {
          const smokeOrdinal = state.smokeCursor++;
          const smokeSourceIndex = smokeOrdinal % smokeActiveSourceCount;
          const smokeFromTurretRing = turretRingSmokeWeight > 0
            && smokeSourceIndex >= activeFireVentCount;
          const vent = ventAt(smokeSourceIndex % activeFireVentCount);
          const flameDirection = smokeFromTurretRing
            ? [0, 1, 0]
            : ventDirection(vent);
          const smokeDirection = fireSmoke
            ? buoyantSmokeDirection(flameDirection)
            : flameDirection;
          const flameBasePosition = smokeFromTurretRing
            ? turretRingPoint
            : ventPosition(vent);
          const flameSpeed = smokeFromTurretRing
            ? (venting ? ventFlameSpeed : ringFlameSpeed)
            : ventFlameSpeed;
          const flameLifetime = smokeFromTurretRing
            ? (venting ? ventFlameLifetime : ringFlameLifetime)
            : ventFlameLifetime;
          const meanFlameSpeed = (flameSpeed[0] + flameSpeed[1]) * 0.5;
          const meanFlameLifetime = (flameLifetime[0] + flameLifetime[1]) * 0.5;
          const attachmentTravelFraction = smokeFromTurretRing
            ? 0.42
            : (venting ? 0.14 : 0.28);
          const flameTopOffset = !fireSmoke
            ? 0
            : meanFlameSpeed * meanFlameLifetime * attachmentTravelFraction
              + width * (smokeFromTurretRing
                  ? 0.12 + postBlastStrength * 0.08
                  : venting
                    ? 0.02 + intensity * 0.01
                    : 0.04 + intensity * 0.025);
          const sourcePosition = offsetAlongDirection(
            flameBasePosition,
            flameDirection,
            flameTopOffset
          );
          const sheetCount = lowDetail ? 1 : 2;
          const smokeCoreColors = venting
            ? ['#71695e', '#5b554c', '#46433d']
            : intensity >= 0.4
              ? ['#51483e', '#37342e', '#24241f']
            : ['#343630', '#474942', '#5a5c55'];
          const smokeEdgeColors = venting
            ? ['#888076', '#6e6961']
            : intensity >= 0.4
              ? ['#675e52', '#4a4740']
            : ['#555750', '#686a62'];
          const streamDirection = fireSmoke
            ? directionRange(
              smokeDirection,
              smokeFromTurretRing ? 0.05 : 0.06
            )
            : directionRange(smokeDirection, 0.075);
          // One velocity per fire stream prevents faster cards from peeling
          // away into isolated puffs. Its value is the source flame's mean,
          // so the joined smoke column retains the flame's visible rise rate.
          const streamSpeed = fireSmoke
            ? [meanFlameSpeed, meanFlameSpeed]
            : [0.1, 0.28];
          const smokeLifetime = !fireSmoke
            ? [3.6, 5.4]
            : venting
              ? [0.8, 1.3]
              : smokeFromTurretRing
                ? [4.2, 6.6 + intensity * 0.5]
                : [3.6, 5.4 + intensity * 0.5];
          const hazeLifetime = !fireSmoke
            ? [4.2, 6]
            : venting
              ? [1, 1.5]
              : smokeFromTurretRing
                ? [4.6, 7 + intensity * 0.5]
                : [4, 5.8 + intensity * 0.5];
          this.spawn('vehicleSmoke', sourcePosition, sheetCount, {
            colorStart: smokeCoreColors,
            colorEnd: intensity >= 0.4 ? ['#080908', '#141510'] : ['#242621', '#363832'],
            direction: streamDirection,
            gravity: fireSmoke ? [0, 0, 0] : [0, 0.16, 0],
            emitterRadius: [0, width * (fireSmoke ? 0.018 : 0.04)],
            size: fireSmoke
              ? smokeFromTurretRing
                ? [width * 0.25, width * (0.5 + postBlastStrength * 0.08)]
                : [width * (0.16 + intensity * 0.025), width * (0.32 + intensity * 0.08)]
              : [width * 0.18, width * 0.4],
            lifetime: smokeLifetime,
            speed: streamSpeed
          });
          this.spawn('vehicleSmokeHaze', sourcePosition, sheetCount, {
            colorStart: smokeEdgeColors,
            colorEnd: intensity >= 0.4 ? ['#0c0d0b', '#1b1c17'] : ['#33352f', '#484a43'],
            direction: streamDirection,
            gravity: fireSmoke ? [0, 0, 0] : [0, 0.1, 0],
            emitterRadius: [0, width * (fireSmoke ? 0.026 : 0.05)],
            size: fireSmoke
              ? smokeFromTurretRing
                ? [width * 0.32, width * (0.62 + postBlastStrength * 0.1)]
                : [width * (0.2 + intensity * 0.025), width * (0.4 + intensity * 0.08)]
              : [width * 0.25, width * 0.48],
            lifetime: hazeLifetime,
            speed: fireSmoke ? streamSpeed : [0.08, 0.24]
          });
        }
      }
    } else {
      state.smokeBudget = 0;
    }

    if (burning) {
      const flameSystem = 'engineFlame';
      const rate = ((lowDetail ? 8 : 24) + intensity * (lowDetail ? 7 : 24))
        * postBlastEnvelope;
      state.flameBudget += boundedDelta * rate;
      const count = Math.min(lowDetail ? 5 : 10, Math.floor(state.flameBudget));
      if (count > 0) {
        state.flameBudget -= count;
        for (let index = 0; index < count; index++) {
          const vent = ventAt(state.flameCursor++ % activeFireVentCount);
          const direction = ventDirection(vent);
          const spread = venting ? 0.055 : 0.15;
          const size = venting
            ? [width * (0.045 + ventBuild * 0.025), width * (0.11 + ventBuild * 0.12)]
            : detonated
              ? [width * 0.052, width * (0.14 + intensity * 0.075)]
              : [width * 0.085, width * (0.24 + intensity * 0.12)];
          const speed = ventFlameSpeed;
          const lifetime = ventFlameLifetime;
          const sourcePosition = ventPosition(vent);
          const directionOverride = directionRange(direction, spread);
          this.spawn(flameSystem, sourcePosition, lowDetail ? 1 : 2, {
            direction: directionOverride,
            size,
            speed,
            lifetime
          });
          if (venting) {
            this.spawn('persistentFireCore', sourcePosition, 1, {
              direction: directionOverride,
              size: [size[0] * 0.48, size[1] * 0.62],
              speed: [speed[0] * 0.82, speed[1] * 0.86],
              lifetime: [lifetime[0] * 0.72, lifetime[1] * 0.82]
            });
            if (!lowDetail) {
              this.spawn('engineFlame', sourcePosition, 2, {
                direction: directionRange(direction, spread * 1.16),
                size: [size[0] * 0.9, size[1] * 0.95],
                speed: [speed[0] * 0.28, speed[1] * 0.34],
                lifetime: [lifetime[0] * 1.16, lifetime[1] * 1.48]
              });
            }
          } else {
            this.spawn('persistentFireCore', sourcePosition, 1, {
              direction: directionOverride,
              size: [size[0] * 0.52, size[1] * 0.68],
              speed: [speed[0] * 1.08, speed[1] * 1.12],
              lifetime: [lifetime[0] * 0.64, lifetime[1] * 0.72]
            });
            if (!lowDetail || state.flameCursor % 2 === 0) {
              this.spawn('engineFlame', sourcePosition, 1, {
                direction: directionRange(direction, spread * 1.24),
                size: [size[0] * 0.88, size[1] * 0.94],
                speed: [speed[0] * 0.3, speed[1] * 0.34],
                lifetime: [lifetime[0] * 1.12, lifetime[1] * 1.5]
              });
            }
            if (!lowDetail) {
              this.spawn('engineFlame', sourcePosition, 1, {
                direction: directionRange(direction, spread * 1.12),
                size: [size[0] * 0.84, size[1] * 0.91],
                speed: [speed[0] * 0.58, speed[1] * 0.62],
                lifetime: [lifetime[0], lifetime[1] * 1.26]
              });
            }
          }
        }
      }

      const emberRate = (
        (lowDetail ? 16 : 108) + intensity * (lowDetail ? 16 : 84)
      ) * postBlastEnvelope;
      state.emberBudget += boundedDelta * emberRate;
      const emberCount = Math.min(
        lowDetail ? 8 : 32,
        Math.floor(state.emberBudget)
      );
      if (emberCount > 0) {
        state.emberBudget -= emberCount;
        const emberSourceCount = activeFireVentCount + (detonated ? 1 : 0);
        for (let index = 0; index < emberCount; index++) {
          const sourceIndex = state.emberCursor++ % emberSourceCount;
          const fromTurretRing = detonated && sourceIndex >= activeFireVentCount;
          const vent = ventAt(sourceIndex % activeFireVentCount);
          this.spawn(
            'fireEmber',
            fromTurretRing ? turretRingPoint : ventPosition(vent),
            1,
            {
              direction: directionRange([0, 1, 0], 0.16),
              emitterRadius: [0, width * 0.012],
              size: [width * 0.001, width * 0.005],
              speed: [0.45, 1.25 + intensity * 0.8],
              lifetime: [0.65, 1.55]
            }
          );
        }
      }

      const sparkRate = venting
        ? (lowDetail ? 10 : 26) + ventBuild * (lowDetail ? 18 : 46)
        : (lowDetail ? 1.5 : 4) + intensity * 5;
      state.sparkBudget += boundedDelta * sparkRate;
      const sparkCount = Math.min(8, Math.floor(state.sparkBudget));
      if (sparkCount > 0) {
        state.sparkBudget -= sparkCount;
        for (let index = 0; index < sparkCount; index++) {
          const vent = ventAt(state.sparkCursor++);
          this.queueWeightedFragments({
            position: ventPosition(vent),
            direction: ventDirection(vent),
            count: 1,
            kind: 'spark',
            speed: venting ? [3.2 + ventBuild * 2.5, 7.5 + ventBuild * 5] : [1.8, 4.2],
            lifetime: venting ? [0.8, 1.45] : [0.45, 0.82],
            size: venting ? 1.1 : 0.72,
            bounce: 0.48,
            friction: 0.72,
            maximumBounces: 3
          });
        }
      }

      const ventProgress = THREE.MathUtils.clamp(
        Number(fireVentProgress) || 0,
        0,
        1
      );
      if (venting && ventProgress >= 0.93 && !state.cookoffFlashEmitted) {
        this.spawn(
          'cookoffFlashSpark',
          turretRingPoint,
          lowDetail ? 320 : 960,
          {
            direction: [[-1, 1], [0.08, 1], [-1, 1]],
            emitterRadius: [0, width * 0.012],
            size: [width * 0.0012, width * 0.0048],
            speed: [1.8, 4.8 + width * 0.3],
            lifetime: [0.08, 0.28]
          }
        );
        state.cookoffFlashEmitted = true;
      } else if (!venting && firePhase !== 'DETONATED') {
        state.cookoffFlashEmitted = false;
      }

      if (firePhase === 'DETONATED' && turretRingPoint) {
        // The exposed ring is a separate event layer: a dense central plume
        // survives the full authoritative post-blast interval while its rate,
        // scale, speed, and lifetime decay together. Existing engine-deck fire
        // remains independent around the hull.
        const strength = postBlastStrength;
        const rate = (lowDetail ? 7 : 22) * (0.35 + strength * 0.65);
        state.turretFlameBudget += boundedDelta * rate;
        const turretFlameCount = Math.min(
          lowDetail ? 3 : 7,
          Math.floor(state.turretFlameBudget)
        );
        if (turretFlameCount > 0) {
          state.turretFlameBudget -= turretFlameCount;
          for (let index = 0; index < turretFlameCount; index++) {
            const direction = directionRange(
              [0, 1, 0],
              0.12 + (1 - strength) * 0.12
            );
            const size = [
              width * (0.15 + strength * 0.12),
              width * (0.32 + strength * 0.42)
            ];
            const speed = ringFlameSpeed;
            const lifetime = ringFlameLifetime;
            this.spawn('engineFlame', turretRingPoint, lowDetail ? 1 : 2, {
              direction,
              size,
              speed,
              lifetime
            });
            this.spawn('persistentFireCore', turretRingPoint, 1, {
              direction,
              size: [size[0] * 0.55, size[1] * 0.72],
              speed: [speed[0] * 1.1, speed[1] * 1.12],
              lifetime: [lifetime[0] * 0.64, lifetime[1] * 0.74]
            });
          }
        }
      } else {
        state.turretFlameBudget = 0;
      }
    } else {
      state.flameBudget = 0;
      state.turretFlameBudget = 0;
      state.sparkBudget = 0;
      state.emberBudget = 0;
    }

    if (detonationTransition) {
      this.emitExplosion({
        position: finiteTriplet(blastPosition) ? blastPosition : position,
        scale: THREE.MathUtils.clamp(Math.max(width, height, length) / 2.25, 1.35, 3.8),
        profile: 'cookoff'
      });
    } else if (destructionTransition) {
      this.emitExplosion({ position, scale: 1.2 });
    } else if (ignitionTransition) {
      this.emitExplosion({ position, scale: 0.62 });
    }
    this.vehicleEmission.set(unitId, state);
    return true;
  }

  update(delta, camera = null) {
    if (!this.initialized || this.disposed) return false;
    const boundedDelta = THREE.MathUtils.clamp(delta ?? 0, 0, 0.1);
    this.advanceWeightedFragments(boundedDelta);
    for (const system of this.systems.values()) system.update(boundedDelta, camera);
    return true;
  }

  clear() {
    for (const system of this.systems.values()) system.clear?.();
    this.vehicleEmission.clear();
    for (const fragment of this.weightedFragments) fragment.active = false;
  }

  getDiagnostics() {
    return Object.freeze({
      implementationId: 'three-vfx-battlefield-experiment-v2',
      initialized: this.initialized,
      systemCount: this.systems.size,
      capacities: Object.freeze(Object.fromEntries(
        Object.entries(SYSTEM_DEFINITIONS).map(([name, definition]) => [
          name,
          definition.maxParticles
        ])
      )),
      spawnCounts: Object.freeze({ ...this.spawnCounts }),
      trackedVehicles: this.vehicleEmission.size,
      activeWeightedFragments: this.weightedFragments.reduce(
        (count, fragment) => count + Number(fragment.active),
        0
      ),
      weightedFragmentCapacity: this.weightedFragments.length,
      weightedFragmentBounces: this.fragmentBounceCount,
      explosionStyle: 'three-vfx-deployed-landing-fireball'
    });
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    for (const system of this.systems.values()) {
      if (system.object3D?.parent) system.object3D.parent.remove(system.object3D);
      system.dispose?.();
    }
    this.systems.clear();
    this.vehicleEmission.clear();
    for (const fragment of this.weightedFragments) fragment.active = false;
    this.explosionTexture?.dispose?.();
    this.explosionTexture = null;
    this.smokeTexture?.dispose?.();
    this.smokeTexture = null;
    this.hitSparkGeometry?.dispose?.();
    this.hitSparkGeometry = null;
    this.initialized = false;
    return true;
  }
}

export async function createThreeVfxBattlefieldRuntime(options) {
  const runtime = new ThreeVfxBattlefieldRuntime(options);
  await runtime.initialize();
  return runtime;
}

export { SYSTEM_DEFINITIONS as THREE_VFX_BATTLEFIELD_SYSTEMS };
