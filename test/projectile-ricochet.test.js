import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { Unit } from '../src/game/Unit.js';
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
    getUnits: () => [attacker, target]
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
  assert.equal(penetrated.outgoingEnergyJ, null, 'residual penetration energy is not modeled yet');
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
