import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';
import {
  ARMOR_RICOCHET_MODEL,
  resolveArmorRicochet
} from '../src/simulation/ballistics/ProjectileImpactPhysics.js';

function createRicochetBattle() {
  const attacker = new Unit({
    id: 'ricochet_attacker',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(10, 0, -10)
  });
  const target = new Unit({
    id: 'ricochet_target',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'SOMUA_S35',
    position: new THREE.Vector3()
  });
  const scene = new THREE.Scene();
  scene.add(attacker.mesh, target.mesh);
  const combat = new CombatSystem(scene, {}, () => 0.5, {
    getUnits: () => [attacker, target],
    vfxProvider: TEST_VFX_PROVIDER
  });
  const muzzle = new THREE.Vector3(1.1, 1.25, -2.5);
  assert.equal(combat.fireWeapon(attacker, target, target.position, {
    weapon: getWeapon('KWK36_AP'),
    muzzlePosition: muzzle,
    dispersionScale: 0
  }), true);
  const projectile = combat.projectiles[0];
  projectile.position.copy(muzzle);
  projectile.previousPosition.copy(muzzle);
  projectile.muzzlePosition.copy(muzzle);
  projectile.velocity
    .set(-0.8, 0, 8)
    .normalize()
    .multiplyScalar(projectile.weapon.muzzleVelocity);
  const unitMap = new Map([
    [attacker.id, attacker],
    [target.id, target]
  ]);
  return { attacker, target, combat, unitMap };
}

function createPenetrationBattle() {
  const attacker = new Unit({
    id: 'penetration_attacker',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'SOMUA_S35',
    position: new THREE.Vector3(0, 0, 0)
  });
  const firstTarget = new Unit({
    id: 'penetration_target_first',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(0, 0, 60)
  });
  const secondTarget = new Unit({
    id: 'penetration_target_second',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(0, 0, 68)
  });
  const scene = new THREE.Scene();
  scene.add(attacker.mesh, firstTarget.mesh, secondTarget.mesh);
  const combat = new CombatSystem(scene, {}, () => 0.5, {
    getUnits: () => [attacker, firstTarget, secondTarget],
    vfxProvider: TEST_VFX_PROVIDER
  });
  assert.equal(combat.fireWeapon(attacker, firstTarget, firstTarget.position, {
    weapon: getWeapon('SA35_AP'),
    muzzlePosition: new THREE.Vector3(0, 1.25, 54),
    dispersionScale: 0
  }), true);
  const projectile = combat.projectiles[0];
  projectile.previousPosition.set(0, 1.25, 54);
  projectile.position.set(0, 1.25, 64);
  projectile.muzzlePosition.copy(projectile.previousPosition);
  projectile.velocity.set(0, 0, projectile.weapon.muzzleVelocity);
  projectile.distanceTravelled = 10;
  const unitMap = new Map([
    [attacker.id, attacker],
    [firstTarget.id, firstTarget],
    [secondTarget.id, secondTarget]
  ]);
  return { attacker, firstTarget, secondTarget, combat, unitMap };
}

function componentHealth(unit) {
  return Object.fromEntries(Object.entries(unit.vehicleComponents).map(
    ([id, component]) => [id, component.health]
  ));
}

test('oblique stopped AP reflects with explicit deterministic energy loss', () => {
  const weapon = getWeapon('KWK36_AP');
  const speed = weapon.muzzleVelocity;
  const angle = THREE.MathUtils.degToRad(75);
  const result = resolveArmorRicochet({
    weapon,
    velocity: [-Math.cos(angle) * speed, 0, Math.sin(angle) * speed],
    impactNormal: [1, 0, 0],
    impactAngleDegrees: 75,
    penetrated: false,
    ricochetCount: 0
  });

  assert.equal(result.ricocheted, true);
  assert.equal(result.ricochetCount, 1);
  assert.equal(result.ricochetModelVersion, ARMOR_RICOCHET_MODEL.version);
  assert.ok(result.postImpactVelocity[0] > 0, 'reflected round must leave the struck face');
  assert.ok(result.postImpactSpeed < result.impactSpeed);
  assert.ok(result.outgoingEnergyJ < result.impactEnergyJ);
  assert.ok(result.retainedEnergyRatio >= ARMOR_RICOCHET_MODEL.minimumRetainedEnergyRatio);
  assert.ok(result.retainedEnergyRatio <= ARMOR_RICOCHET_MODEL.maximumRetainedEnergyRatio);
});

test('square impacts, penetrating shots, and exhausted rounds stop instead of ricocheting', () => {
  const weapon = getWeapon('KWK36_AP');
  const common = {
    weapon,
    velocity: [-weapon.muzzleVelocity, 0, 0],
    impactNormal: [1, 0, 0],
    impactAngleDegrees: 20,
    penetrated: false,
    ricochetCount: 0
  };
  assert.equal(resolveArmorRicochet(common).ricochetReason, 'impact_too_square');
  const penetrated = resolveArmorRicochet({ ...common, penetrated: true });
  assert.equal(penetrated.ricochetReason, 'penetrated');
  assert.equal(
    penetrated.outgoingEnergyJ,
    null,
    'the ricochet-only solver must not invent penetration energy'
  );
  assert.equal(resolveArmorRicochet({
    ...common,
    impactAngleDegrees: 80,
    ricochetCount: ARMOR_RICOCHET_MODEL.maximumRicochets
  }).ricochetReason, 'ricochet_limit');
  assert.equal(resolveArmorRicochet({
    ...common,
    impactAngleDegrees: 80,
    velocity: [-10, 0, 100]
  }).ricochetReason, 'speed_too_low');
});

test('square stopped AP terminates and is counted separately from a real ricochet', () => {
  const { combat } = createRicochetBattle();
  const projectile = combat.projectiles[0];
  projectile.position.set(0, 1.25, 5);
  projectile.previousPosition.copy(projectile.position);
  projectile.muzzlePosition.copy(projectile.position);
  projectile.velocity.set(0, 0, -projectile.weapon.muzzleVelocity);

  combat.update(1 / 120);

  assert.equal(combat.projectiles.length, 0);
  assert.equal(combat.telemetry.ricochets, 0);
  assert.equal(combat.telemetry.stops, 1);
  assert.equal(combat.telemetry.impacts[0].ricocheted, false);
  assert.equal(combat.telemetry.impacts[0].ricochetReason, 'impact_too_square');
  combat.reset();
});

test('vehicle-impact HE detonates once and never enters the intact-penetrator path', () => {
  const attacker = new Unit({
    id: 'explosive_attacker',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'SOMUA_S35',
    position: new THREE.Vector3()
  });
  const firstTarget = new Unit({
    id: 'explosive_target_first',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'OPEL_BLITZ',
    position: new THREE.Vector3(0, 0, 60)
  });
  const secondTarget = new Unit({
    id: 'explosive_target_second',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'OPEL_BLITZ',
    position: new THREE.Vector3(0, 0, 68)
  });
  const firstHealth = componentHealth(firstTarget);
  const secondHealth = componentHealth(secondTarget);
  const scene = new THREE.Scene();
  scene.add(attacker.mesh, firstTarget.mesh, secondTarget.mesh);
  const combat = new CombatSystem(scene, {}, () => 0.5, {
    getUnits: () => [attacker, firstTarget, secondTarget],
    vfxProvider: TEST_VFX_PROVIDER
  });
  const muzzle = new THREE.Vector3(0, 1, 54);
  assert.equal(combat.fireWeapon(attacker, firstTarget, firstTarget.position, {
    weapon: getWeapon('SA35_HE'),
    muzzlePosition: muzzle,
    dispersionScale: 0
  }), true);
  const projectile = combat.projectiles[0];
  projectile.position.copy(muzzle);
  projectile.previousPosition.copy(muzzle);
  projectile.muzzlePosition.copy(muzzle);
  projectile.velocity.set(0, 0, projectile.weapon.muzzleVelocity);

  combat.update(1 / 60);

  assert.equal(combat.projectiles.length, 0);
  assert.equal(combat.telemetry.impacts.length, 1);
  const impact = combat.telemetry.impacts[0];
  assert.equal(impact.targetId, firstTarget.id);
  assert.equal(impact.terminalEffect, 'detonated');
  assert.equal(impact.continuationKind, 'none');
  assert.equal(impact.continuationReason, 'explosive_detonation');
  assert.equal(impact.exitPosition, null);
  assert.equal(impact.exitResult, null);
  assert.deepEqual(impact.internalPathHits, []);
  assert.deepEqual(impact.crewResult.internalPathHits, []);
  const firstAfterHealth = componentHealth(firstTarget);
  assert.ok(
    firstAfterHealth.hull < firstHealth.hull,
    'a direct HE surface detonation must damage the struck vehicle hull'
  );
  for (const componentId of [
    'engine', 'transmission', 'tracks', 'fuel', 'optics', 'radio',
    'main_gun', 'breech', 'turret_traverse', 'coax', 'hull_mg', 'ammunition'
  ]) {
    assert.equal(
      firstAfterHealth[componentId],
      firstHealth[componentId],
      `surface detonation must not invent protected ${componentId} damage`
    );
  }
  assert.deepEqual(componentHealth(secondTarget), secondHealth);
  combat.reset();
});

test('oblique stopped HE detonates instead of ricocheting for a second explosion', () => {
  const { combat } = createRicochetBattle();
  const projectile = combat.projectiles[0];
  projectile.weapon = getWeapon('SA35_HE');
  projectile.ammoId = projectile.weapon.id;
  projectile.velocity
    .set(-0.8, 0, 8)
    .normalize()
    .multiplyScalar(projectile.weapon.muzzleVelocity);

  for (let step = 0; step < 8 && combat.telemetry.impacts.length === 0; step++) {
    combat.update(1 / 600);
  }

  assert.equal(combat.projectiles.length, 0);
  assert.equal(combat.telemetry.impacts.length, 1);
  const impact = combat.telemetry.impacts[0];
  assert.equal(impact.terminalEffect, 'detonated');
  assert.equal(impact.continuationKind, 'none');
  assert.equal(impact.continuationReason, 'explosive_detonation');
  assert.equal(impact.ricocheted, false);
  assert.equal(impact.ricochetReason, 'explosive_detonation');
  assert.equal(impact.postImpactVelocity, null);
  assert.equal(impact.postImpactSpeed, 0);
  assert.equal(impact.outgoingEnergyJ, 0);
  assert.equal(impact.exitResult, null);
  combat.reset();
});

test('intact perforation resumes at the real exit, survives rollback, and strikes a second vehicle', () => {
  const {
    attacker,
    combat,
    firstTarget,
    secondTarget,
    unitMap
  } = createPenetrationBattle();
  const projectile = combat.projectiles[0];
  const impact = combat.ballistics.detectImpact(projectile);
  assert.equal(impact?.unit, firstTarget);

  projectile.position.copy(impact.point);
  projectile.previousPosition.copy(impact.point);
  const entryDistance = projectile.distanceTravelled;
  assert.equal(combat.resolveImpact(projectile, impact), true);

  const firstImpact = combat.telemetry.impacts[0];
  assert.equal(firstImpact.penetrated, true);
  assert.equal(firstImpact.continuationKind, 'penetrator');
  assert.equal(firstImpact.penetrationCount, 1);
  assert.ok(firstImpact.residualEnergyJ > 0);
  assert.ok(firstImpact.residualEnergyJ < firstImpact.impactEnergyJ);
  assert.ok(firstImpact.internalTransitDistanceMeters > 0);
  assert.ok(firstImpact.internalTransitSeconds > 0);
  assert.equal(firstImpact.exitResult.penetrated, true);

  const outgoingDirection = new THREE.Vector3()
    .fromArray(firstImpact.postImpactVelocity)
    .normalize();
  const expectedOffset = Math.max(
    0.015,
    projectile.weapon.caliberMm / 1000 * 0.6
  );
  const expectedPosition = new THREE.Vector3()
    .fromArray(firstImpact.exitPosition)
    .addScaledVector(outgoingDirection, expectedOffset);
  assert.ok(projectile.position.distanceTo(expectedPosition) <= 1e-9);
  assert.equal(
    projectile.distanceTravelled,
    entryDistance + firstImpact.internalTransitDistanceMeters
  );
  assert.deepEqual(projectile.trajectoryPoints.at(-1), firstImpact.exitPosition);
  assert.equal(projectile.penetrationCount, 1);
  assert.equal(projectile.armorIgnore.unitId, firstTarget.id);
  assert.ok(projectile.armorIgnore.plateIds.includes(firstImpact.plateId));
  assert.ok(projectile.armorIgnore.plateIds.includes(firstImpact.exitResult.plateId));

  const fullTransitDelay = projectile.continuationDelaySeconds;
  const exitHoldPosition = projectile.position.clone();
  const exitHoldLifetime = projectile.lifetime;
  combat.update(fullTransitDelay * 0.5);
  assert.equal(
    combat.telemetry.impacts.length,
    1,
    'external collision must wait while in-vehicle transit time is consumed'
  );
  assert.ok(
    projectile.position.distanceTo(exitHoldPosition) <= 1e-12,
    'projectile must remain at its exit continuation point during transit delay'
  );
  assert.ok(
    Math.abs(projectile.continuationDelaySeconds - fullTransitDelay * 0.5) <= 1e-12
  );
  assert.ok(
    Math.abs(projectile.lifetime - (exitHoldLifetime + fullTransitDelay * 0.5)) <= 1e-12
  );

  const continuationUnits = [
    attacker.captureState(),
    firstTarget.captureState(),
    secondTarget.captureState()
  ];
  const continuationState = combat.captureState();
  assert.doesNotThrow(() => JSON.stringify(continuationState));
  assert.equal(
    continuationState.projectiles[0].continuationDelaySeconds,
    projectile.continuationDelaySeconds
  );

  for (let step = 0; step < 60 && combat.telemetry.impacts.length < 2; step++) {
    combat.update(1 / 240);
  }
  assert.equal(combat.telemetry.impacts.length, 2);
  assert.deepEqual(
    combat.telemetry.impacts.map(record => record.targetId),
    [firstTarget.id, secondTarget.id]
  );
  assert.notEqual(
    combat.telemetry.impacts[0].impactId,
    combat.telemetry.impacts[1].impactId
  );
  const replayOutcome = {
    combat: combat.captureState(),
    targets: [firstTarget.captureState(), secondTarget.captureState()]
  };

  for (const saved of continuationUnits) unitMap.get(saved.id).restoreState(saved, unitMap);
  combat.restoreState(continuationState, unitMap);
  assert.deepEqual(combat.captureState(), continuationState);
  for (let step = 0; step < 60 && combat.telemetry.impacts.length < 2; step++) {
    combat.update(1 / 240);
  }
  assert.deepEqual(combat.captureState(), replayOutcome.combat);
  assert.deepEqual(
    [firstTarget.captureState(), secondTarget.captureState()],
    replayOutcome.targets
  );
  combat.reset();
});

test('SOMUA sloped plate continues a swept projectile and replay restores rebound state', () => {
  const { combat, unitMap } = createRicochetBattle();
  combat.update(1 / 600);

  assert.equal(combat.projectiles.length, 1, 'ricochet must remain an authoritative projectile');
  assert.equal(combat.telemetry.vehicleHits, 1);
  assert.equal(combat.telemetry.ricochets, 1);
  assert.equal(combat.telemetry.stops, 0);
  assert.equal(combat.telemetry.impacts.length, 1);
  const impact = combat.telemetry.impacts[0];
  assert.equal(impact.ricocheted, true);
  assert.equal(impact.zone, 'hull_side');
  assert.match(impact.plateId, /left-side-casting/);
  assert.ok(impact.impactAngleDegrees > 80);
  assert.ok(impact.postImpactVelocity[0] > 0);
  assert.deepEqual(impact.trajectoryPoints[0], impact.muzzlePosition);
  assert.deepEqual(
    impact.trajectoryPoints[impact.trajectoryPoints.length - 1],
    impact.impactPosition
  );
  assert.ok(combat.projectiles[0].velocity.x > 0);
  assert.equal(combat.projectiles[0].ricochetCount, 1);
  assert.deepEqual(
    combat.projectiles[0].armorIgnore,
    {
      unitId: 'ricochet_target',
      plateId: impact.plateId,
      untilDistance: combat.projectiles[0].armorIgnore.untilDistance
    }
  );

  const rebound = combat.captureState();
  assert.doesNotThrow(() => JSON.stringify(rebound));
  const capturedPostVelocityX = rebound.telemetry.impacts[0].postImpactVelocity[0];
  rebound.telemetry.impacts[0].postImpactVelocity[0] = 999;
  assert.equal(combat.telemetry.impacts[0].postImpactVelocity[0], capturedPostVelocityX);
  rebound.telemetry.impacts[0].postImpactVelocity[0] = capturedPostVelocityX;

  combat.update(1 / 600);
  const firstContinuation = combat.captureState();
  assert.equal(firstContinuation.telemetry.impacts.length, 1, 'same plate must not re-hit after rebound');

  combat.restoreState(rebound, unitMap);
  assert.deepEqual(combat.captureState(), rebound);
  combat.update(1 / 600);
  assert.deepEqual(combat.captureState(), firstContinuation);
  combat.reset();
});
