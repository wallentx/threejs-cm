import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';

function createBattle({
  attackerVehicleId,
  attackerFaction,
  targetVehicleId,
  targetFaction,
  targetPosition = [0, 0, 60]
}) {
  const attacker = new Unit({
    id: `he_${attackerVehicleId.toLowerCase()}_attacker`,
    faction: attackerFaction,
    type: 'vehicle',
    vehicleId: attackerVehicleId,
    position: new THREE.Vector3(0, 0, 80)
  });
  const target = new Unit({
    id: `he_${targetVehicleId.toLowerCase()}_target`,
    faction: targetFaction,
    type: 'vehicle',
    vehicleId: targetVehicleId,
    position: new THREE.Vector3(...targetPosition)
  });
  const scene = new THREE.Scene();
  scene.add(attacker.mesh, target.mesh);
  const combat = new CombatSystem(scene, {}, () => 0.5, {
    getUnits: () => [attacker, target]
  });
  const unitMap = new Map([
    [attacker.id, attacker],
    [target.id, target]
  ]);
  return { attacker, target, combat, unitMap };
}

function launchStraightProjectile(combat, attacker, target, weaponId, start, direction) {
  const weapon = getWeapon(weaponId);
  const muzzle = new THREE.Vector3(...start);
  assert.equal(combat.fireWeapon(attacker, target, target.position, {
    weapon,
    muzzlePosition: muzzle,
    dispersionScale: 0
  }), true);
  const projectile = combat.projectiles[0];
  projectile.position.copy(muzzle);
  projectile.previousPosition.copy(muzzle);
  projectile.muzzlePosition.copy(muzzle);
  projectile.velocity.copy(new THREE.Vector3(...direction).normalize().multiplyScalar(
    projectile.weapon.muzzleVelocity
  ));
  return projectile;
}

function vehicleDamageSnapshot(unit) {
  return {
    crew: unit.roster.map(crewman => ({
      id: crewman.id,
      health: crewman.health,
      status: crewman.status
    })),
    components: Object.fromEntries(Object.entries(unit.vehicleComponents).map(
      ([id, component]) => [id, {
        installed: component.installed,
        health: component.health,
        status: component.status
      }]
    ))
  };
}

function changedCrew(before, after) {
  return after.crew.filter(crewman => {
    const original = before.crew.find(candidate => candidate.id === crewman.id);
    return original.health !== crewman.health || original.status !== crewman.status;
  });
}

function changedComponents(before, after) {
  return Object.keys(after.components).filter(id => {
    const original = before.components[id];
    const component = after.components[id];
    return original.health !== component.health || original.status !== component.status;
  });
}

function assertExplosiveTerminalNoContinuation(impact) {
  assert.equal(impact.terminalEffect, 'detonated');
  assert.equal(impact.continuationKind, 'none');
  assert.equal(impact.continuationReason, 'explosive_detonation');
  assert.equal(impact.ricocheted, false);
  assert.equal(impact.exitPosition, null);
  assert.equal(impact.exitResult, null);
  assert.equal(impact.residualVelocity, null);
  assert.equal(impact.postImpactVelocity, null);
  assert.deepEqual(impact.internalPathHits, []);
  assert.deepEqual(impact.crewResult.internalPathHits, []);
}

test('an HE shell detonating through an unarmored Opel cab damages real crew and components without an intact penetrator path', () => {
  const { attacker, target, combat } = createBattle({
    attackerVehicleId: 'SOMUA_S35',
    attackerFaction: 'french',
    targetVehicleId: 'OPEL_BLITZ',
    targetFaction: 'german'
  });
  // The Opel bonnet and cab are on its +Z/front end: engine z=+2.02,
  // driver/passenger z=+0.93. Enter from +Z to exercise the exposed cab.
  launchStraightProjectile(combat, attacker, target, 'SA35_HE', [0, 1.38, 66], [0, 0, -1]);
  const before = vehicleDamageSnapshot(target);

  combat.update(1 / 60);

  assert.equal(combat.projectiles.length, 0);
  assert.equal(combat.telemetry.impacts.length, 1);
  const impact = combat.telemetry.impacts[0];
  assert.equal(impact.targetId, target.id);
  assert.equal(impact.penetrated, true);
  assertExplosiveTerminalNoContinuation(impact);
  assert.equal(impact.explosiveEffect.kind, 'vehicle_explosive_direct');
  assert.equal(impact.explosiveEffect.interiorExposed, true);
  assert.equal(impact.explosiveEffect.protectionResult, 'unarmored_compartment');

  const after = vehicleDamageSnapshot(target);
  assert.ok(changedCrew(before, after).length >= 1, 'direct unarmored HE must damage crew');
  assert.ok(
    changedComponents(before, after).length >= 1,
    'direct unarmored HE must damage an installed vehicle component'
  );
  combat.reset();
});

test('an HE shell detonating in an open Laffly compartment uses the open-coupling effect', () => {
  const { attacker, target, combat } = createBattle({
    attackerVehicleId: 'PANZER_III_D',
    attackerFaction: 'german',
    targetVehicleId: 'LAFFLY_S20TL',
    targetFaction: 'french'
  });
  // Strike the cab side, adjacent to both modeled seats; a frontal bonnet hit
  // intentionally reaches only the engine through the same radial query.
  launchStraightProjectile(combat, attacker, target, 'KWK36_HE', [4, 1.37, 60.68], [-1, 0, 0]);
  const before = vehicleDamageSnapshot(target);

  combat.update(1 / 60);

  assert.equal(combat.projectiles.length, 0);
  const impact = combat.telemetry.impacts[0];
  assert.equal(impact.targetId, target.id);
  assert.equal(impact.penetrated, true);
  assertExplosiveTerminalNoContinuation(impact);
  assert.equal(impact.explosiveEffect.protection.class, 'open');
  assert.equal(impact.explosiveEffect.interiorExposed, true);
  assert.equal(impact.explosiveEffect.protectionResult, 'open_compartment');

  const after = vehicleDamageSnapshot(target);
  assert.ok(changedCrew(before, after).length >= 1, 'open compartment must expose crew');
  assert.ok(changedComponents(before, after).length >= 1, 'open compartment must expose modules');
  combat.reset();
});

test('stopped HE against an armored S35 preserves crew and interior modules while still terminating', () => {
  const { attacker, target, combat } = createBattle({
    attackerVehicleId: 'PANZER_III_D',
    attackerFaction: 'german',
    targetVehicleId: 'SOMUA_S35',
    targetFaction: 'french'
  });
  launchStraightProjectile(combat, attacker, target, 'KWK36_HE', [0, 1.25, 66], [0, 0, -1]);
  const before = vehicleDamageSnapshot(target);

  combat.update(1 / 60);

  assert.equal(combat.projectiles.length, 0);
  assert.equal(combat.telemetry.impacts.length, 1);
  const impact = combat.telemetry.impacts[0];
  assert.equal(impact.targetId, target.id);
  assert.equal(impact.penetrated, false);
  assertExplosiveTerminalNoContinuation(impact);
  assert.equal(impact.explosiveEffect.interiorExposed, false);
  assert.equal(impact.explosiveEffect.protectionResult, 'external_armor');

  const after = vehicleDamageSnapshot(target);
  assert.deepEqual(after.crew, before.crew, 'stopped HE must not invent compartment casualties');
  for (const componentId of [
    'engine', 'transmission', 'fuel', 'ammunition', 'breech', 'optics', 'radio'
  ]) {
    assert.deepEqual(
      after.components[componentId],
      before.components[componentId],
      `stopped HE must not damage protected ${componentId}`
    );
  }
  combat.reset();
});

test('stopped HE on an S35 track damages the exposed track only', () => {
  const { attacker, target, combat } = createBattle({
    attackerVehicleId: 'PANZER_III_D',
    attackerFaction: 'german',
    targetVehicleId: 'SOMUA_S35',
    targetFaction: 'french'
  });
  launchStraightProjectile(combat, attacker, target, 'KWK36_HE', [5, 0.55, 60], [-1, 0, 0]);
  const before = vehicleDamageSnapshot(target);

  combat.update(1 / 60);

  assert.equal(combat.projectiles.length, 0);
  const impact = combat.telemetry.impacts[0];
  assert.equal(impact.armorPart, 'track');
  assert.equal(impact.penetrated, false);
  assertExplosiveTerminalNoContinuation(impact);
  assert.equal(impact.explosiveEffect.interiorExposed, false);
  assert.equal(impact.explosiveEffect.protectionResult, 'external_component');
  assert.equal(impact.explosiveEffect.externalIntent.componentId, 'tracks');

  const after = vehicleDamageSnapshot(target);
  assert.deepEqual(after.crew, before.crew);
  assert.deepEqual(changedComponents(before, after), ['tracks']);
  combat.reset();
});

test('stopped HE on an S35 mantlet damages the exposed main gun only', () => {
  const { attacker, target, combat } = createBattle({
    attackerVehicleId: 'PANZER_III_D',
    attackerFaction: 'german',
    targetVehicleId: 'SOMUA_S35',
    targetFaction: 'french'
  });
  launchStraightProjectile(combat, attacker, target, 'KWK36_HE', [0.04, 2.03, 70], [0, 0, -1]);
  const before = vehicleDamageSnapshot(target);

  combat.update(1 / 60);

  assert.equal(combat.projectiles.length, 0);
  const impact = combat.telemetry.impacts[0];
  assert.equal(impact.armorPart, 'mantlet');
  assert.equal(impact.penetrated, false);
  assertExplosiveTerminalNoContinuation(impact);
  assert.equal(impact.explosiveEffect.interiorExposed, false);
  assert.equal(impact.explosiveEffect.protectionResult, 'external_component');
  assert.equal(impact.explosiveEffect.externalIntent.componentId, 'main_gun');

  const after = vehicleDamageSnapshot(target);
  assert.deepEqual(after.crew, before.crew);
  assert.deepEqual(changedComponents(before, after), ['main_gun']);
  combat.reset();
});

test('an explosive vehicle terminal effect replays exactly from a pre-impact capture', () => {
  const { attacker, target, combat, unitMap } = createBattle({
    attackerVehicleId: 'SOMUA_S35',
    attackerFaction: 'french',
    targetVehicleId: 'OPEL_BLITZ',
    targetFaction: 'german'
  });
  launchStraightProjectile(combat, attacker, target, 'SA35_HE', [0, 1.38, 66], [0, 0, -1]);
  const beforeUnits = [attacker.captureState(), target.captureState()];
  const beforeCombat = combat.captureState();

  combat.update(1 / 60);
  const firstOutcome = {
    target: target.captureState(),
    combat: combat.captureState()
  };
  assert.equal(firstOutcome.combat.telemetry.impacts.length, 1);
  assert.equal(
    firstOutcome.combat.telemetry.impacts[0].explosiveEffect.kind,
    'vehicle_explosive_direct'
  );

  const isolatedCapture = target.captureState();
  const isolatedEvent = isolatedCapture.vehicleDamageState.events.find(
    event => event.type === 'explosive_detonation'
  );
  const liveEvent = target.vehicleDamageState.events.find(
    event => event.type === 'explosive_detonation'
  );
  assert.ok(isolatedEvent?.detonationPoint);
  assert.ok(liveEvent?.detonationPoint);
  const liveDetonationPoint = [...liveEvent.detonationPoint];
  isolatedEvent.detonationPoint[0] = 999;
  assert.deepEqual(
    liveEvent.detonationPoint,
    liveDetonationPoint,
    'post-impact capture must not alias nested event coordinates'
  );

  const restoreSource = target.captureState();
  const beforeTarget = beforeUnits.find(saved => saved.id === target.id);
  target.restoreState(beforeTarget, unitMap);
  target.restoreState(restoreSource, unitMap);
  assert.deepEqual(target.captureState(), restoreSource);
  restoreSource.vehicleDamageState.events.find(
    event => event.type === 'explosive_detonation'
  ).detonationPoint[0] = 777;
  assert.deepEqual(
    target.vehicleDamageState.events.find(
      event => event.type === 'explosive_detonation'
    ).detonationPoint,
    liveDetonationPoint,
    'restore must take ownership of nested event coordinates'
  );

  for (const saved of beforeUnits) unitMap.get(saved.id).restoreState(saved, unitMap);
  combat.restoreState(beforeCombat, unitMap);
  assert.deepEqual(combat.captureState(), beforeCombat);

  combat.update(1 / 60);
  assert.deepEqual(target.captureState(), firstOutcome.target);
  assert.deepEqual(combat.captureState(), firstOutcome.combat);
  combat.reset();
});
