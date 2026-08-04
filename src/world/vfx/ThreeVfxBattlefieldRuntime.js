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
  flame: Object.freeze({
    maxParticles: 720,
    autoStart: false,
    size: [0.16, 0.52],
    colorStart: ['#ffffff', '#fff4c2', '#ffcc00', '#ff6600'],
    colorEnd: ['#ff3300', '#531208'],
    fadeSize: [0.72, 0.08],
    fadeOpacity: [1, 0],
    gravity: [0, 1.25, 0],
    lifetime: [0.24, 0.78],
    speed: [0.45, 2.35],
    friction: { intensity: 0.04, easing: 'easeOut' },
    turbulence: { intensity: 0.42, frequency: 1.2, speed: 0.75 },
    appearance: Appearance.GRADIENT,
    intensity: 6,
    blending: Blending.ADDITIVE,
    lighting: Lighting.BASIC,
    emitterShape: EmitterShape.POINT,
    renderOrder: 33
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
        } else if (name === 'engineFlame') {
          options.colorNode = createEngineFlameColorNode(
            this.explosionTexture
          );
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
      emitterRadius: [0, 0.27 * intensity],
      size: [0.52 * intensity, 1.44 * intensity],
      speed: [0.1 * Math.sqrt(intensity), 0.82 * Math.sqrt(intensity)],
      lifetime: [1, 2]
    });
    const sparks = this.spawn('impact', position, cookoff ? 130 : 52, {
      direction: [[-1, 1], [-1, 1], [-1, 1]],
      gravity: [0, -0.5, 0],
      speed: [0.1, 2],
      size: [0.0025 * intensity, 0.012 * intensity],
      lifetime: [1, cookoff ? 4.5 : 2.8]
    });
    const weightedSparks = this.queueLandingPageArcs({
      position,
      scale: intensity,
      count: cookoff ? 8 : 4
    });
    const weightedDebris = this.queueWeightedFragments({
      position,
      direction: [0, 1, 0],
      count: particleCount(cookoff ? 18 : 8, Math.sqrt(intensity), 42),
      kind: 'debris',
      speed: [3.6, 7.8 * Math.sqrt(intensity)],
      lifetime: [1.1, cookoff ? 2.25 : 1.65],
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
    const availableVents = Array.isArray(vents) ? vents : [];
    const ventCount = Math.max(1, availableVents.length);
    const ventAt = index => availableVents[index % ventCount] ?? null;
    const ventPosition = vent => finiteTriplet(vent?.position) ? vent.position : position;
    const ventDirection = vent => finiteTriplet(vent?.direction) ?? [0, 1, 0];
    const state = this.vehicleEmission.get(unitId) ?? {
      smokeBudget: 0,
      flameBudget: 0,
      sparkBudget: 0,
      smokeCursor: 0,
      flameCursor: 0,
      sparkCursor: 0
    };

    if (shouldSmoke) {
      const rate = (lowDetail ? 5 : 12) + intensity * (lowDetail ? 4 : 12);
      state.smokeBudget += boundedDelta * rate;
      const count = Math.min(5, Math.floor(state.smokeBudget));
      if (count > 0) {
        state.smokeBudget -= count;
        for (let index = 0; index < count; index++) {
          const vent = ventAt(state.smokeCursor++ % Math.min(3, ventCount));
          const direction = ventDirection(vent);
          this.spawn('smoke', ventPosition(vent), 1, {
            direction: [
              [direction[0] * 0.22 - 0.12, direction[0] * 0.22 + 0.12],
              [Math.max(0.55, direction[1] * 0.55), 1],
              [direction[2] * 0.22 - 0.12, direction[2] * 0.22 + 0.12]
            ],
            emitterRadius: [0, width * 0.055],
            size: [width * 0.09, width * (0.2 + intensity * 0.11)],
            lifetime: [2.5, 4.2 + intensity * 1.6],
            speed: [0.35, 0.8 + intensity * 0.72]
          });
        }
      }
    } else {
      state.smokeBudget = 0;
    }

    if (burning) {
      const venting = firePhase === 'AMMUNITION_VENTING';
      const cookoffFlame = venting || firePhase === 'DETONATED';
      const flameSystem = cookoffFlame ? 'flame' : 'engineFlame';
      const rate = ((lowDetail ? 8 : 24) + intensity * (lowDetail ? 7 : 24))
        * postBlastEnvelope;
      state.flameBudget += boundedDelta * rate;
      const count = Math.min(lowDetail ? 5 : 10, Math.floor(state.flameBudget));
      if (count > 0) {
        state.flameBudget -= count;
        const activeVentCount = venting
          ? ventCount
          : (firePhase === 'SPREADING_FIRE' ? Math.min(5, ventCount) : Math.min(3, ventCount));
        for (let index = 0; index < count; index++) {
          const vent = ventAt(state.flameCursor++ % activeVentCount);
          const direction = ventDirection(vent);
          const spread = venting ? 0.055 : 0.15;
          this.spawn(flameSystem, ventPosition(vent), 1, {
            direction: directionRange(direction, spread),
            size: venting
              ? [width * (0.045 + ventBuild * 0.025), width * (0.11 + ventBuild * 0.12)]
              : cookoffFlame
                ? [width * 0.052, width * (0.14 + intensity * 0.075)]
                : [width * 0.085, width * (0.24 + intensity * 0.12)],
            speed: venting
              ? [1.4 + ventBuild * 2.4, 3.2 + ventBuild * 5.6]
              : cookoffFlame
                ? [0.8, 2.8 + intensity * 1.8]
                : [0.9, 3.1 + intensity * 1.7],
            lifetime: venting
              ? [0.22, 0.62]
              : (cookoffFlame ? [0.32, 0.92] : [0.42, 1.02])
          });
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
    } else {
      state.flameBudget = 0;
      state.sparkBudget = 0;
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
