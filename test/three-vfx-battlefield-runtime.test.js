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

test('Three-VFX battlefield runtime owns bounded shared and layered damage systems', async () => {
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
      'vehicleSmoke',
      'vehicleSmokeHaze',
      'cookoffFlashSpark',
      'engineFlame',
      'persistentFireCore',
      'fireEmber',
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
  assert.equal(textures[1].userData.path, '/assets/vfx/three-vfx/smoke.png');
  assert.equal(textures[1].minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(textures[1].magFilter, THREE.LinearFilter);
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
  const cookoffFlashSpark = systems.find(system =>
    system.object3D.userData.vfxRole === 'cookoffFlashSpark');
  assert.equal(typeof cookoffFlashSpark.options.colorNode, 'function');
  assert.deepEqual(cookoffFlashSpark.options.size, [0.003, 0.012]);
  const engineFlame = systems.find(system =>
    system.object3D.userData.vfxRole === 'engineFlame');
  assert.equal(typeof engineFlame.options.colorNode, 'function');
  assert.equal(engineFlame.options.appearance, 'default');
  const persistentFireCore = systems.find(system =>
    system.object3D.userData.vfxRole === 'persistentFireCore');
  assert.equal(typeof persistentFireCore.options.colorNode, 'function');
  assert.deepEqual(persistentFireCore.options.stretchBySpeed, {
    factor: 0.055,
    maxStretch: 1.85
  });
  const fireEmber = systems.find(system =>
    system.object3D.userData.vfxRole === 'fireEmber');
  assert.ok(fireEmber.options.size[1] <= 0.012,
    'drafting embers must remain pinprick-scale points');
  assert.deepEqual(fireEmber.options.fadeOpacity, [0.96, 0]);
  assert.equal(fireEmber.options.maxParticles, 1024,
    'the dense pinprick ember shower needs enough capacity to remain visible');
  assert.ok(fireEmber.options.colorStart.every(value => /^#(?:ff|ef|c9)/i.test(value)),
    'drafting embers must remain in the red-hot color range');
  for (const role of ['vehicleSmoke', 'vehicleSmokeHaze']) {
    const smokeLayer = systems.find(system =>
      system.object3D.userData.vfxRole === role);
    assert.equal(smokeLayer.options.alphaMap, textures[1]);
    assert.deepEqual(smokeLayer.options.flipbook, { rows: 16, columns: 16 });
    assert.ok(smokeLayer.options.fadeSizeCurve);
    assert.ok(smokeLayer.options.fadeOpacityCurve);
    assert.equal(smokeLayer.options.velocityCurve.points[0].pos[1], 1);
    assert.equal(smokeLayer.options.velocityCurve.points[1].pos[1], 1,
      'smoke must retain flame speed while its lower plume is forming');
    const lingerVelocity = smokeLayer.options.velocityCurve.points.find(
      point => point.pos[0] === 0.68
    );
    const lingerOpacity = smokeLayer.options.fadeOpacityCurve.points.find(
      point => point.pos[0] === 0.68
    );
    assert.ok(lingerVelocity.pos[1] <= 0.05 && lingerOpacity.pos[1] >= 0.5,
      'formed smoke must nearly stop while it remains visibly dense');
    assert.equal(smokeLayer.options.velocityCurve.points.at(-1).pos[1], 0,
      'spent smoke must exhaust its upward impulse before disappearing');
    assert.ok(
      smokeLayer.options.fadeOpacityCurve.points[0].pos[1]
        < smokeLayer.options.fadeOpacityCurve.points[2].pos[1],
      'fire smoke must begin as a thin translucent continuation before it billows'
    );
    assert.ok(smokeLayer.options.fadeSizeCurve.points[2].pos[0] <= 0.045,
      'flame-speed smoke must expand soon enough for adjacent sheets to remain joined');
    assert.ok(smokeLayer.options.fadeSizeCurve.points.at(-1).pos[1] >= 1.7,
      'upper smoke must broaden as it slows and fades');
    const opacityPoints = smokeLayer.options.fadeOpacityCurve.points;
    assert.ok(opacityPoints.slice(0, -1).every(point => point.pos[1] > 0),
      'a smoke sheet must fade continuously instead of becoming a dead card early');
    assert.ok(opacityPoints.at(-2).pos[1] <= 0.005,
      'a smoke sheet must be effectively invisible immediately before retirement');
    assert.deepEqual(opacityPoints.at(-1).pos, [1, 0],
      'a smoke sheet must reach pure zero opacity at the end of its lifetime');
    assert.ok(smokeLayer.options.maxParticles >= 1536,
      'the peak single-vehicle smoke stream must not recycle a visible sheet');
  }
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
  assert.equal(textures[1].userData.disposeCount, 1);
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
  assert.ok(byRole.explosion.spawns[0].overrides.lifetime[1] <= 0.3,
    'ordinary HE fireballs must finish inside a fast sub-second burst');
  assert.ok(byRole.explosion.spawns[0].overrides.speed[0] > 5,
    'ordinary HE fireball cards must expand rapidly away from the burst');
  assert.ok(byRole.impact.spawns[0].overrides.speed[0] >= 18,
    'ordinary HE ejecta must leave the burst at high speed');

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
  assert.ok(byRole.vehicleSmoke.spawns.length > 1);
  assert.ok(byRole.vehicleSmokeHaze.spawns.length > 0);
  assert.equal(byRole.vehicleSmokeHaze.spawns.length, byRole.vehicleSmoke.spawns.length,
    'dense vehicle smoke must pair every dark core sheet with a broad haze sheet');
  assert.ok(byRole.vehicleSmoke.spawns.every(spawn => spawn.count === 2));
  assert.ok(byRole.vehicleSmokeHaze.spawns.every(spawn => spawn.count === 2));
  assert.ok(byRole.vehicleSmoke.spawns.every(spawn => spawn.position[1] > 2.5),
    'burning smoke must begin above its flame vent instead of at the deck');
  assert.ok(byRole.engineFlame.spawns.length > 0);
  const firstFlameSpeed = byRole.engineFlame.spawns[0].overrides.speed;
  const firstFlameMeanSpeed = (firstFlameSpeed[0] + firstFlameSpeed[1]) * 0.5;
  assert.deepEqual(byRole.vehicleSmoke.spawns[0].overrides.speed,
    [firstFlameMeanSpeed, firstFlameMeanSpeed],
    'joined smoke sheets must share the source flame mean speed without divergence');
  assert.deepEqual(byRole.vehicleSmoke.spawns[0].overrides.gravity, [0, 0, 0]);
  assert.deepEqual(byRole.vehicleSmokeHaze.spawns[0].overrides.speed,
    [firstFlameMeanSpeed, firstFlameMeanSpeed]);
  assert.deepEqual(byRole.vehicleSmokeHaze.spawns[0].overrides.gravity, [0, 0, 0]);
  assert.ok(byRole.persistentFireCore.spawns.length > 0);
  assert.ok(byRole.fireEmber.spawns.length >= 18,
    'a tenth-second high-detail fire update must emit a dense ember shower');
  assert.ok(byRole.fireEmber.spawns.every(spawn =>
    spawn.count === 1
      && spawn.overrides.size[1] <= 0.012
      && spawn.overrides.direction[1][0] > 0
  ), 'every active fire source must loft tiny upward red embers');
  assert.ok(byRole.engineFlame.spawns.length > byRole.persistentFireCore.spawns.length,
    'ordinary fire must add slower texture sheets between its hot core layers');
  assert.equal(byRole.cookoffFlashSpark.spawns.length, 0);

  const angledSmokeStart = byRole.vehicleSmoke.spawns.length;
  const angledFlameStart = byRole.engineFlame.spawns.length;
  const angledVents = [
    { position: [10, 2, 10], direction: [1, 0.25, 0] },
    { position: [-10, 2, -10], direction: [-1, 0.25, 0] }
  ];
  for (let step = 0; step < 4; step++) {
    runtime.emitVehicleDamageState({
      unitId: 'tank-angled-fire',
      position,
      dimensions: { length: 5, width: 2.4, height: 2.2 },
      delta: 0.1,
      shouldSmoke: true,
      burning: true,
      fireIntensity: 1,
      firePhase: 'FUEL_FIRE',
      vents: angledVents,
      lowDetail: false
    });
  }
  const angledSmoke = byRole.vehicleSmoke.spawns.slice(angledSmokeStart);
  const angledFlames = byRole.engineFlame.spawns.slice(angledFlameStart);
  const positiveVentSmoke = angledSmoke.find(spawn => spawn.position[0] > 10);
  const negativeVentSmoke = angledSmoke.find(spawn => spawn.position[0] < -10);
  assert.ok(positiveVentSmoke && negativeVentSmoke,
    'every simultaneously burning vent must receive attached smoke');
  assert.ok(angledSmoke.length >= angledVents.length * 4,
    'bounded smoke cadence must repeatedly cover every active fire source');
  assert.ok(angledFlames.some(spawn => spawn.position[0] === 10));
  assert.ok(angledFlames.some(spawn => spawn.position[0] === -10));
  for (const spawn of [positiveVentSmoke, negativeVentSmoke]) {
    const centerX = (spawn.overrides.direction[0][0]
      + spawn.overrides.direction[0][1]) * 0.5;
    const centerY = (spawn.overrides.direction[1][0]
      + spawn.overrides.direction[1][1]) * 0.5;
    assert.ok(centerY > 0.9 && Math.abs(centerX) < 0.35,
      'smoke attached to an angled flame must turn buoyantly upward');
    assert.ok(spawn.overrides.direction[0][1] - spawn.overrides.direction[0][0] <= 0.120001,
      'attached smoke dispersion must remain bounded while the plume spreads');
  }

  const preVentEngineFlameCount = byRole.engineFlame.spawns.length;
  const preVentSmokeCount = byRole.vehicleSmoke.spawns.length;
  const turretRingPosition = [2.1, 2.35, -4.1];
  runtime.emitVehicleDamageState({
    unitId: 'tank-1',
    position,
    dimensions: { length: 5, width: 2.4, height: 2.2 },
    delta: 0.1,
    shouldSmoke: true,
    burning: true,
    fireIntensity: 1,
    firePhase: 'AMMUNITION_VENTING',
    fireVentProgress: 0.96,
    firePostBlastProgress: 0,
    turretRingPosition,
    vents: [{ position: [2, 2.5, -4], direction: [0, 1, 0] }],
    lowDetail: false
  });
  assert.ok(byRole.engineFlame.spawns.length > preVentEngineFlameCount,
    'ammunition-vent jets must use the texture-masked flame pool');
  const ventSmoke = byRole.vehicleSmoke.spawns.slice(preVentSmokeCount);
  const ventFlames = byRole.engineFlame.spawns.slice(preVentEngineFlameCount);
  assert.ok(ventSmoke.length > 0);
  assert.ok(ventSmoke.every(spawn =>
    spawn.position[0] === 2
      && spawn.position[1] > 2.5
      && spawn.position[2] === -4
  ), 'pre-cookoff smoke must remain joined to every active flame vent');
  assert.ok(ventSmoke.every(spawn =>
    spawn.overrides.lifetime[1] <= 1.3
  ), 'pre-cookoff transition smoke must not outlive its brief flame jet');
  const ventFlameSpeed = ventFlames[0].overrides.speed;
  const ventFlameMeanSpeed = (ventFlameSpeed[0] + ventFlameSpeed[1]) * 0.5;
  assert.deepEqual(ventSmoke[0].overrides.speed,
    [ventFlameMeanSpeed, ventFlameMeanSpeed]);
  assert.equal(byRole.cookoffFlashSpark.spawns.length, 1);
  assert.equal(byRole.cookoffFlashSpark.spawns[0].count, 960);
  assert.ok(byRole.cookoffFlashSpark.spawns[0].overrides.size[0] < 0.003);
  assert.ok(byRole.cookoffFlashSpark.spawns[0].overrides.size[1] < 0.012);
  assert.deepEqual(byRole.cookoffFlashSpark.spawns[0].position, turretRingPosition);
  runtime.emitVehicleDamageState({
    unitId: 'tank-1',
    position,
    dimensions: { length: 5, width: 2.4, height: 2.2 },
    delta: 0.1,
    shouldSmoke: true,
    burning: true,
    fireIntensity: 1,
    firePhase: 'AMMUNITION_VENTING',
    fireVentProgress: 0.99,
    firePostBlastProgress: 0,
    turretRingPosition,
    vents: [{ position: [2, 2.5, -4], direction: [0, 1, 0] }],
    lowDetail: false
  });
  assert.equal(byRole.cookoffFlashSpark.spawns.length, 1,
    'the final-threshold spark flash must fire once per cookoff');
  const preDetonationFlashCount = byRole.cookoffFlashSpark.spawns.length;

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
  const detonationSmokeStart = byRole.vehicleSmoke.spawns.length;
  runtime.emitVehicleDamageState(detonation);
  runtime.emitVehicleDamageState({ ...detonation, detonationTransition: false });
  assert.equal(byRole.explosion.spawns.length, priorExplosions + 1);
  assert.equal(byRole.explosion.spawns.at(-1).count, 100);
  assert.equal(byRole.impact.spawns.at(-1).count, 130);
  assert.deepEqual(byRole.explosion.spawns.at(-1).overrides.lifetime, [1, 2],
    'the accepted cookoff fireball timing must remain unchanged');
  assert.deepEqual(byRole.explosion.spawns.at(-1).overrides.speed,
    [0.1 * Math.sqrt(5 / 2.25), 0.82 * Math.sqrt(5 / 2.25)],
    'the accepted cookoff fireball expansion must remain unchanged');
  assert.deepEqual(byRole.impact.spawns.at(-1).overrides.lifetime, [1, 4.5],
    'the accepted cookoff spark timing must remain unchanged');
  assert.equal(byRole.cookoffFlashSpark.spawns.length, preDetonationFlashCount,
    'the detonation transition must not replay the pre-cookoff spark flash');
  const earlyRingFlames = byRole.engineFlame.spawns.filter(spawn =>
    spawn.position.every((value, index) => value === detonation.turretRingPosition[index]));
  assert.ok(earlyRingFlames.length > 0);
  assert.ok(earlyRingFlames.every(spawn => spawn.count === 2),
    'turret-ring flame emissions must contain overlapping texture sheets');
  const postDetonationSmoke = byRole.vehicleSmoke.spawns.slice(detonationSmokeStart);
  assert.ok(postDetonationSmoke.some(spawn =>
    spawn.position[0] === detonation.turretRingPosition[0]
    && spawn.position[1] > detonation.turretRingPosition[1]
    && spawn.position[2] === detonation.turretRingPosition[2]
  ), 'post-cookoff smoke must rise from the top of the exposed turret-ring flame');
  const earlyRingSmoke = postDetonationSmoke.find(spawn =>
    spawn.position[0] === detonation.turretRingPosition[0]
      && spawn.position[2] === detonation.turretRingPosition[2]);
  const earlyRingFlameSpeed = earlyRingFlames[0].overrides.speed;
  const earlyRingFlameMeanSpeed = (earlyRingFlameSpeed[0]
    + earlyRingFlameSpeed[1]) * 0.5;
  assert.deepEqual(earlyRingSmoke.overrides.speed,
    [earlyRingFlameMeanSpeed, earlyRingFlameMeanSpeed],
    'turret-ring smoke sheets must share one central plume velocity');
  const earlyRingMaximumSize = Math.max(
    ...earlyRingFlames.map(spawn => spawn.overrides.size[1])
  );

  const lateRingStart = byRole.engineFlame.spawns.length;
  for (let step = 0; step < 10; step++) {
    runtime.emitVehicleDamageState({
      ...detonation,
      firePostBlastProgress: 0.99,
      detonationTransition: false
    });
  }
  const lateRingFlames = byRole.engineFlame.spawns.slice(lateRingStart).filter(spawn =>
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
