import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  THREE_VFX_BATTLEFIELD_SYSTEMS,
  ThreeVfxBattlefieldRuntime
} from '../src/world/vfx/ThreeVfxBattlefieldRuntime.js';

class FakeParticleSystem {
  constructor(options) {
    this.options = options;
    this.object3D = new THREE.Group();
    this.spawns = [];
    this.updates = [];
    this.clearCount = 0;
    this.disposeCount = 0;
    this.initialized = false;
    this.stopped = false;
  }

  async init() {
    this.initialized = true;
  }

  stop() {
    this.stopped = true;
  }

  spawn(x, y, z, count, overrides) {
    this.spawns.push({ position: [x, y, z], count, overrides });
  }

  update(delta, camera) {
    this.updates.push({ delta, camera });
  }

  clear() {
    this.clearCount++;
  }

  dispose() {
    this.disposeCount++;
  }
}

function createRuntimeHarness() {
  const scene = new THREE.Scene();
  const systems = [];
  const textures = [];
  const runtime = new ThreeVfxBattlefieldRuntime({
    renderer: {},
    scene,
    async loadTexture(path) {
      const texture = new THREE.Texture();
      texture.userData.path = path;
      texture.userData.disposeCount = 0;
      texture.dispose = () => { texture.userData.disposeCount++; };
      textures.push(texture);
      return texture;
    },
    createParticleSystem(_renderer, options) {
      const system = new FakeParticleSystem(options);
      systems.push(system);
      return system;
    }
  });
  return { runtime, scene, systems, textures };
}

test('Three-VFX battlefield runtime owns nine bounded shared particle systems', async () => {
  const { runtime, scene, systems, textures } = createRuntimeHarness();
  await runtime.initialize();

  assert.deepEqual(
    systems.map(system => system.object3D.userData.vfxRole),
    [
      'impact',
      'hitSpark',
      'explosion',
      'muzzleFlash',
      'smoke',
      'flame',
      'engineFlame',
      'debris',
      'dust'
    ]
  );
  assert.ok(systems.every(system => system.initialized && system.stopped));
  assert.ok(systems.every(system => system.options.autoStart === false));
  assert.equal(scene.children.length, systems.length);
  assert.equal(textures[0].userData.path, '/assets/vfx/three-vfx/fire.png');
  assert.equal(textures[0].minFilter, THREE.NearestFilter);
  assert.equal(textures[0].magFilter, THREE.NearestFilter);
  const explosion = systems.find(system =>
    system.object3D.userData.vfxRole === 'explosion');
  assert.equal(typeof explosion.options.colorNode, 'function');
  assert.deepEqual(explosion.options.size, [0.52, 1.44]);
  assert.deepEqual(explosion.options.speed, [0.1, 0.82]);
  const impact = systems.find(system =>
    system.object3D.userData.vfxRole === 'impact');
  assert.equal(typeof impact.options.colorNode, 'function');
  const hitSpark = systems.find(system =>
    system.object3D.userData.vfxRole === 'hitSpark');
  assert.equal(typeof hitSpark.options.colorNode, 'function');
  assert.ok(hitSpark.options.geometry?.isBufferGeometry);
  assert.deepEqual(hitSpark.options.speed, [18, 44]);
  assert.equal(hitSpark.options.orientToDirection, true);
  assert.deepEqual(hitSpark.options.stretchBySpeed, {
    factor: 0.045,
    maxStretch: 2.8
  });
  const engineFlame = systems.find(system =>
    system.object3D.userData.vfxRole === 'engineFlame');
  assert.equal(typeof engineFlame.options.colorNode, 'function');
  assert.equal(engineFlame.options.appearance, 'default');
  assert.deepEqual(
    runtime.getDiagnostics().capacities,
    Object.fromEntries(Object.entries(THREE_VFX_BATTLEFIELD_SYSTEMS).map(
      ([name, definition]) => [name, definition.maxParticles]
    ))
  );
  assert.ok(
    Object.values(runtime.getDiagnostics().capacities)
      .every(capacity => Number.isInteger(capacity) && capacity <= 3072)
  );

  let sparkGeometryDisposals = 0;
  hitSpark.options.geometry.addEventListener('dispose', () => {
    sparkGeometryDisposals++;
  });
  runtime.dispose();
  assert.equal(scene.children.length, 0);
  assert.ok(systems.every(system => system.disposeCount === 1));
  assert.equal(textures[0].userData.disposeCount, 1);
  assert.equal(sparkGeometryDisposals, 1);
  assert.equal(runtime.dispose(), false);
});

test('Three-VFX battlefield runtime removes every attached system after partial initialization failure', async () => {
  const scene = new THREE.Scene();
  const systems = [];
  const runtime = new ThreeVfxBattlefieldRuntime({
    renderer: {},
    scene,
    loadTexture: async () => new THREE.Texture(),
    createParticleSystem(_renderer, options) {
      const system = new FakeParticleSystem(options);
      if (systems.length === 1) {
        system.init = async () => {
          throw new Error('synthetic GPU initialization failure');
        };
      }
      systems.push(system);
      return system;
    }
  });

  await assert.rejects(
    runtime.initialize(),
    /synthetic GPU initialization failure/
  );
  assert.equal(scene.children.length, 0);
  assert.ok(systems.every(system => system.disposeCount === 1));
  assert.equal(runtime.getDiagnostics().initialized, false);
});

test('Three-VFX battlefield runtime layers combat, building, smoke, and fire particles', async () => {
  const { runtime, systems } = createRuntimeHarness();
  await runtime.initialize();
  const byRole = Object.fromEntries(
    systems.map(system => [system.object3D.userData.vfxRole, system])
  );
  const position = new THREE.Vector3(2, 1, -4);

  runtime.emitImpact({
    position,
    impactVelocity: [0, 0, -300],
    postImpactVelocity: [0.4, 0.2, 0.8],
    impactNormal: [0, 0, 1],
    ricocheted: true,
    scale: 0.72
  });
  assert.equal(byRole.hitSpark.spawns.length, 1);
  assert.equal(byRole.impact.spawns.length, 0);
  assert.equal(byRole.muzzleFlash.spawns.length, 1);
  assert.ok(byRole.hitSpark.spawns[0].count >= 10);
  assert.deepEqual(byRole.hitSpark.spawns[0].position, position.toArray());
  assert.ok(byRole.hitSpark.spawns[0].overrides.direction[2][0] > 0);
  assert.ok(byRole.hitSpark.spawns[0].overrides.speed[0] >= 30);
  assert.ok(runtime.getDiagnostics().activeWeightedFragments > 0);

  runtime.emitExplosion({ position, scale: 1.4 });
  assert.equal(byRole.explosion.spawns.length, 1);
  assert.equal(byRole.impact.spawns.length, 1);

  runtime.emitMuzzleFlash({
    position,
    direction: [0, 0, -1],
    caliberMm: 75,
    automatic: false
  });
  assert.equal(byRole.muzzleFlash.spawns.length, 2);
  assert.equal(byRole.smoke.spawns.length, 1);
  assert.ok(byRole.muzzleFlash.spawns.at(-1).count > 8);

  assert.equal(runtime.emitBuildingDebris({
    position,
    severity: 'collapsed',
    style: { color: 0x8c6f52, initialScale: 1.2, maxLife: 1.4 }
  }), true);
  assert.equal(byRole.debris.spawns.length, 1);
  assert.equal(byRole.dust.spawns.length, 1);
  assert.ok(byRole.debris.spawns[0].count > byRole.dust.spawns[0].count);

  for (let step = 0; step < 10; step++) {
    runtime.emitVehicleDamageState({
      unitId: 'tank-1',
      position,
      dimensions: { length: 5, width: 2.4, height: 2.2 },
      delta: 0.1,
      shouldSmoke: true,
      burning: true,
      fireIntensity: 0.8,
      firePhase: 'SPREADING_FIRE',
      fireVentProgress: 0,
      firePostBlastProgress: 0,
      vents: [{ position: [2, 2.5, -4], direction: [0, 1, 0] }],
      lowDetail: false
    });
  }
  assert.ok(byRole.smoke.spawns.length > 1);
  assert.ok(byRole.engineFlame.spawns.length > 0);
  assert.equal(byRole.flame.spawns.length, 0);

  const priorExplosions = byRole.explosion.spawns.length;
  const detonation = {
    unitId: 'tank-1',
    position,
    dimensions: { length: 5, width: 2.4, height: 2.2 },
    delta: 0.1,
    shouldSmoke: true,
    burning: true,
    fireIntensity: 1,
    firePhase: 'DETONATED',
    fireVentProgress: 0,
    firePostBlastProgress: 0,
    blastPosition: [2, 2.8, -4],
    turretRingPosition: [2.15, 2.45, -4.2],
    vents: [{ position: [2, 2.5, -4], direction: [0, 1, 0] }],
    lowDetail: false,
    detonationTransition: true
  };
  runtime.emitVehicleDamageState(detonation);
  runtime.emitVehicleDamageState({ ...detonation, detonationTransition: false });
  assert.equal(byRole.explosion.spawns.length, priorExplosions + 1);
  assert.equal(byRole.explosion.spawns.at(-1).count, 100);
  assert.equal(byRole.impact.spawns.at(-1).count, 130);
  const earlyRingFlames = byRole.flame.spawns.filter(spawn =>
    spawn.position.every((value, index) => value === detonation.turretRingPosition[index]));
  assert.ok(earlyRingFlames.length > 0);
  const earlyRingMaximumSize = Math.max(
    ...earlyRingFlames.map(spawn => spawn.overrides.size[1])
  );

  const lateRingStart = byRole.flame.spawns.length;
  for (let step = 0; step < 10; step++) {
    runtime.emitVehicleDamageState({
      ...detonation,
      firePostBlastProgress: 0.99,
      detonationTransition: false
    });
  }
  const lateRingFlames = byRole.flame.spawns.slice(lateRingStart).filter(spawn =>
    spawn.position.every((value, index) => value === detonation.turretRingPosition[index]));
  assert.ok(lateRingFlames.length > 0, 'turret-ring flames must persist through 29.7 seconds');
  assert.ok(lateRingFlames.every(spawn =>
    spawn.overrides.size[1] < earlyRingMaximumSize));

  const camera = new THREE.PerspectiveCamera();
  runtime.update(0.5, camera);
  assert.ok(systems.every(system => system.updates.length === 1));
  assert.ok(systems.every(system => system.updates[0].delta === 0.1));
  assert.ok(systems.every(system => system.updates[0].camera === camera));

  runtime.clear();
  assert.ok(systems.every(system => system.clearCount === 1));
  assert.equal(runtime.getDiagnostics().trackedVehicles, 0);
  assert.equal(runtime.getDiagnostics().activeWeightedFragments, 0);
  runtime.dispose();
});

test('impact and cookoff fragments follow bounded weighted arcs and bounce on terrain', async () => {
  const { runtime, systems } = createRuntimeHarness();
  runtime.getGroundHeightAt = () => 0;
  await runtime.initialize();
  const byRole = Object.fromEntries(
    systems.map(system => [system.object3D.userData.vfxRole, system])
  );

  runtime.emitImpact({
    position: [0, 0.08, 0],
    impactVelocity: [0, 0, -300],
    impactNormal: [0, 0, 1],
    ricocheted: true,
    scale: 1
  });
  runtime.emitExplosion({
    position: [0, 0.15, 0],
    scale: 1.6,
    profile: 'cookoff'
  });
  for (let step = 0; step < 18; step++) runtime.update(0.1);

  const diagnostics = runtime.getDiagnostics();
  assert.ok(diagnostics.weightedFragmentBounces > 0);
  assert.ok(diagnostics.activeWeightedFragments <= diagnostics.weightedFragmentCapacity);
  assert.ok(byRole.impact.spawns.length > 10);
  assert.ok(byRole.hitSpark.spawns.length > 10);
  assert.ok(byRole.debris.spawns.length > 0);
  assert.ok(byRole.impact.spawns.some(spawn => spawn.position[1] <= 0.02));
  assert.ok(byRole.hitSpark.spawns.some(spawn => spawn.position[1] <= 0.02));
  runtime.dispose();
});
