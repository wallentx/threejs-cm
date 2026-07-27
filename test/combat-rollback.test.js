import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { Unit } from '../src/game/Unit.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';
import { VehicleDamageEffects } from '../src/world/VehicleDamageEffects.js';

function createDeterministicRandom(seed = 0x7f4a7c15) {
  let state = seed >>> 0;
  return {
    next() {
      let value = state;
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      state = value >>> 0;
      return state / 0x100000000;
    },
    capture() {
      return state;
    },
    restore(saved) {
      state = saved >>> 0;
    }
  };
}

function createBattle() {
  const attacker = new Unit({
    id: 'rollback_attacker',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3(0, 0, 0)
  });
  const target = new Unit({
    id: 'rollback_target',
    faction: 'german',
    type: 'tank',
    position: new THREE.Vector3(0, 0, 60)
  });
  const scene = new THREE.Scene();
  scene.add(attacker.mesh, target.mesh);
  const random = createDeterministicRandom();
  const combat = new CombatSystem(scene, {}, () => random.next(), {
    getUnits: () => [attacker, target]
  });
  const unitMap = new Map([
    [attacker.id, attacker],
    [target.id, target]
  ]);
  return { attacker, target, scene, random, combat, unitMap };
}

function advanceUntilResolved(combat) {
  for (let step = 0; step < 240 && combat.projectiles.length > 0; step++) {
    combat.update(1 / 240);
  }
  assert.equal(combat.projectiles.length, 0, 'projectile must resolve during test window');
}

test('in-flight projectile, sequence, references, and telemetry replay deterministically', () => {
  const battle = createBattle();
  const { attacker, target, combat, random, unitMap } = battle;
  assert.equal(combat.fireWeapon(attacker, target, target.position, {
    weapon: getWeapon('SA35_AP'),
    muzzlePosition: attacker.getMuzzleWorldPosition(),
    dispersionScale: 0
  }), true);

  combat.update(1 / 240);
  assert.equal(combat.projectiles.length, 1);
  const unitSnapshot = [attacker.captureState(), target.captureState()];
  const randomSnapshot = random.capture();
  const inFlight = combat.captureState();
  assert.doesNotThrow(() => JSON.stringify(inFlight));

  advanceUntilResolved(combat);
  const firstOutcome = {
    target: target.captureState(),
    combat: combat.captureState(),
    randomState: random.capture()
  };
  assert.equal(firstOutcome.combat.telemetry.impacts.length, 1);
  assert.equal(firstOutcome.combat.telemetry.impacts[0].impactNormal.length, 3);
  assert.equal(firstOutcome.combat.telemetry.impacts[0].localImpactPoint.length, 3);
  assert.notEqual(
    firstOutcome.combat.telemetry.impacts[0].impactNormal,
    combat.telemetry.impacts[0].impactNormal
  );
  assert.notEqual(
    firstOutcome.combat.telemetry.impacts[0].localImpactPoint,
    combat.telemetry.impacts[0].localImpactPoint
  );
  const capturedNormalX = firstOutcome.combat.telemetry.impacts[0].impactNormal[0];
  const capturedLocalX = firstOutcome.combat.telemetry.impacts[0].localImpactPoint[0];
  combat.telemetry.impacts[0].impactNormal[0] = 999;
  combat.telemetry.impacts[0].localImpactPoint[0] = 999;
  assert.equal(firstOutcome.combat.telemetry.impacts[0].impactNormal[0], capturedNormalX);
  assert.equal(firstOutcome.combat.telemetry.impacts[0].localImpactPoint[0], capturedLocalX);

  for (const saved of unitSnapshot) unitMap.get(saved.id).restoreState(saved, unitMap);
  random.restore(randomSnapshot);
  combat.restoreState(inFlight, unitMap);

  assert.equal(combat.projectiles.length, 1);
  assert.equal(combat.projectiles[0].attacker, attacker);
  assert.equal(combat.projectiles[0].targetUnit, target);
  assert.deepEqual(combat.captureState(), inFlight);
  assert.equal(combat.telemetry.impacts.length, 0, 'future impact telemetry must be removed');

  const rebuiltMesh = combat.projectiles[0].mesh;
  let geometryDisposed = false;
  let materialDisposed = false;
  rebuiltMesh.geometry.addEventListener('dispose', () => { geometryDisposed = true; });
  rebuiltMesh.material.addEventListener('dispose', () => { materialDisposed = true; });
  combat.restoreState(inFlight, unitMap);
  assert.equal(geometryDisposed, true);
  assert.equal(materialDisposed, true);
  assert.equal(rebuiltMesh.parent, null);
  assert.notEqual(combat.projectiles[0].mesh, rebuiltMesh);
  assert.deepEqual(combat.captureState(), inFlight);

  advanceUntilResolved(combat);
  assert.deepEqual(target.captureState(), firstOutcome.target);
  assert.deepEqual(combat.captureState(), firstOutcome.combat);
  assert.equal(random.capture(), firstOutcome.randomState);

  const restoredImpactState = combat.captureState();
  combat.restoreState(restoredImpactState, unitMap);
  assert.notEqual(
    combat.telemetry.impacts[0].impactNormal,
    restoredImpactState.telemetry.impacts[0].impactNormal
  );
  assert.notEqual(
    combat.telemetry.impacts[0].localImpactPoint,
    restoredImpactState.telemetry.impacts[0].localImpactPoint
  );
  restoredImpactState.telemetry.impacts[0].impactNormal[0] = 999;
  restoredImpactState.telemetry.impacts[0].localImpactPoint[0] = 999;
  assert.equal(combat.telemetry.impacts[0].impactNormal[0], capturedNormalX);
  assert.equal(combat.telemetry.impacts[0].localImpactPoint[0], capturedLocalX);

  const nextId = firstOutcome.combat.shotSequence + 1;
  assert.equal(combat.fireWeapon(attacker, target, target.position, {
    weapon: getWeapon('SA35_AP'),
    muzzlePosition: attacker.getMuzzleWorldPosition(),
    dispersionScale: 0
  }), true);
  assert.equal(combat.projectiles[0].id, nextId);
  combat.reset();
});

test('restore before and after impact removes future scorch then rehydrates restored telemetry once', () => {
  const battle = createBattle();
  const { attacker, target, combat, random, unitMap } = battle;
  const effects = new VehicleDamageEffects();
  effects.update(0, [target], []);
  const record = effects.records.get(target.id);

  combat.fireWeapon(attacker, target, target.position, {
    weapon: getWeapon('SA35_AP'),
    muzzlePosition: attacker.getMuzzleWorldPosition(),
    dispersionScale: 0
  });
  combat.update(1 / 240);
  const beforeUnits = [attacker.captureState(), target.captureState()];
  const beforeRandom = random.capture();
  const beforeImpact = combat.captureState();

  advanceUntilResolved(combat);
  effects.update(0, [target], combat.telemetry.impacts);
  assert.equal(record.scorch.count, 1);
  const afterImpact = combat.captureState();
  const afterUnits = [attacker.captureState(), target.captureState()];
  const afterRandom = random.capture();

  for (const saved of beforeUnits) unitMap.get(saved.id).restoreState(saved, unitMap);
  random.restore(beforeRandom);
  combat.restoreState(beforeImpact, unitMap);
  effects.resetTransient();
  effects.update(0, [target], combat.telemetry.impacts);
  assert.equal(combat.telemetry.impacts.length, 0);
  assert.equal(record.scorch.count, 0, 'scorch from future timeline must not survive rewind');

  advanceUntilResolved(combat);
  effects.update(0, [target], combat.telemetry.impacts);
  assert.equal(record.scorch.count, 1);
  assert.equal(effects.processedImpacts.size, 1);

  for (const saved of afterUnits) unitMap.get(saved.id).restoreState(saved, unitMap);
  random.restore(afterRandom);
  combat.restoreState(afterImpact, unitMap);
  effects.resetTransient();
  effects.update(0, [target], combat.telemetry.impacts);
  assert.equal(combat.projectiles.length, 0);
  assert.deepEqual(combat.captureState(), afterImpact);
  assert.equal(record.scorch.count, 1, 'restored past impact must produce one scorch');
  assert.equal(effects.processedImpacts.size, 1);

  effects.dispose();
  combat.reset();
});

test('internal penetration paths and multiple crew results deep-copy through telemetry restore', () => {
  const battle = createBattle();
  const { attacker, target, combat, unitMap } = battle;
  combat.fireWeapon(attacker, target, target.position, {
    weapon: getWeapon('SA35_AP'),
    muzzlePosition: attacker.getMuzzleWorldPosition(),
    dispersionScale: 0
  });
  const pathHit = {
    id: 'module-engine',
    kind: 'component',
    componentId: 'engine',
    crewRoles: [],
    entryPoint: [1, 2, 3],
    exitPoint: [1, 2, 2],
    entryDistanceMeters: 0.5,
    exitDistanceMeters: 1.5,
    pathLengthMeters: 1,
    layoutVersion: 'model-local-obb-path-v1',
    dataQuality: 'gameplay approximation'
  };
  const casualty = {
    id: 'crew-driver',
    name: 'Driver',
    role: 'DRIVER',
    status: 'WOUNDED',
    health: 35
  };
  combat.recordImpact(combat.projectiles[0], {
    kind: 'vehicle',
    unit: target,
    point: target.position.clone()
  }, {
    penetrated: true,
    internalPathHits: [pathHit],
    crewResult: {
      penetrated: true,
      casualty,
      casualties: [casualty],
      components: [{ id: 'engine', health: 68 }],
      internalPathHits: [pathHit]
    }
  });

  const captured = combat.captureState();
  const capturedImpact = captured.telemetry.impacts[0];
  combat.telemetry.impacts[0].internalPathHits[0].entryPoint[0] = 999;
  combat.telemetry.impacts[0].crewResult.internalPathHits[0].exitPoint[2] = 999;
  combat.telemetry.impacts[0].crewResult.casualties[0].health = 999;
  assert.deepEqual(capturedImpact.internalPathHits[0].entryPoint, [1, 2, 3]);
  assert.deepEqual(capturedImpact.crewResult.internalPathHits[0].exitPoint, [1, 2, 2]);
  assert.equal(capturedImpact.crewResult.casualties[0].health, 35);

  combat.restoreState(captured, unitMap);
  capturedImpact.internalPathHits[0].entryPoint[0] = -999;
  capturedImpact.crewResult.internalPathHits[0].exitPoint[2] = -999;
  capturedImpact.crewResult.casualties[0].health = -999;
  assert.deepEqual(combat.telemetry.impacts[0].internalPathHits[0].entryPoint, [1, 2, 3]);
  assert.deepEqual(
    combat.telemetry.impacts[0].crewResult.internalPathHits[0].exitPoint,
    [1, 2, 2]
  );
  assert.equal(combat.telemetry.impacts[0].crewResult.casualties[0].health, 35);
  combat.reset();
});
