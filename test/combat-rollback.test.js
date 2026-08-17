import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';
import { VehicleDamageEffects } from '../src/world/VehicleDamageEffects.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

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

function createBattle({
  sound = {},
  onAuditoryEvent = null
} = {}) {
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
  const combat = new CombatSystem(scene, sound, () => random.next(), {
    getUnits: () => [attacker, target],
    onAuditoryEvent,
    vfxProvider: TEST_VFX_PROVIDER
  });
  const unitMap = new Map([
    [attacker.id, attacker],
    [target.id, target]
  ]);
  return { attacker, target, scene, random, combat, unitMap };
}

function advanceUntilResolved(combat) {
  // Ricochets and perforators remain authoritative after the first surface.
  // Allow enough time for a second mesh surface or eventual lifetime expiry.
  for (let step = 0; step < 1200 && combat.projectiles.length > 0; step++) {
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
  assert.equal(firstOutcome.combat.telemetry.impacts.length, 2);
  const ricochetImpact = firstOutcome.combat.telemetry.impacts[0];
  const terminalImpact = firstOutcome.combat.telemetry.impacts[1];
  assert.equal(terminalImpact.impactNormal.length, 3);
  assert.equal(terminalImpact.localImpactPoint.length, 3);
  assert.equal(ricochetImpact.continuationKind, 'ricochet');
  assert.equal(ricochetImpact.sourceMeshName, 'PzIII_EngineDeck');
  assert.equal(ricochetImpact.postImpactVelocity.length, 3);
  assert.equal(terminalImpact.continuationKind, 'none');
  assert.equal(terminalImpact.terminalEffect, 'perforated_stopped');
  assert.equal(terminalImpact.sourceMeshName, 'PanzerIIID_TurretBustle');
  assert.equal(terminalImpact.exitPosition.length, 3);
  assert.equal(terminalImpact.exitResult.point.length, 3);
  assert.equal(terminalImpact.residualVelocity, null);
  assert.equal(terminalImpact.residualEnergyJ, 0);
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
  const effects = new VehicleDamageEffects({ vfxProvider: TEST_VFX_PROVIDER });
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
  assert.equal(record.scorch.count, 2);
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
  assert.equal(record.scorch.count, 2);
  assert.equal(effects.processedImpacts.size, 2);

  for (const saved of afterUnits) unitMap.get(saved.id).restoreState(saved, unitMap);
  random.restore(afterRandom);
  combat.restoreState(afterImpact, unitMap);
  effects.resetTransient();
  effects.update(0, [target], combat.telemetry.impacts);
  assert.equal(combat.projectiles.length, 0);
  assert.deepEqual(combat.captureState(), afterImpact);
  assert.equal(record.scorch.count, 2, 'restored mesh impacts must each produce one mark');
  assert.equal(effects.processedImpacts.size, 2);

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
  const spallHit = {
    ...pathHit,
    id: 'crew-driver',
    kind: 'crew',
    componentId: null,
    crewRoles: ['DRIVER'],
    direction: [0.1, 0, -0.995],
    fragmentIndices: [1, 3],
    terminalEffectKind: 'behind_armor_spall'
  };
  const spallEffect = {
    modelVersion: 'behind-armor-spall-v1',
    rayCount: 24,
    representedFragmentCount: 96,
    hitRayCount: 2,
    hitVolumeIds: ['crew-driver']
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
    penetrationReferenceUrls: ['https://example.test/terminal-ballistics'],
    plateResidualVelocity: [0, 0, 300],
    residualVelocity: [0, 0, 240],
    exitPosition: [1, 2, 1],
    exitResult: {
      plateId: 'hull-positiveZ',
      point: [1, 2, 1],
      normal: [0, 0, 1]
    },
    internalPathHits: [pathHit],
    spallHits: [spallHit],
    spallEffect,
    crewResult: {
      penetrated: true,
      casualty,
      casualties: [casualty],
      components: [{ id: 'engine', health: 68 }],
      internalPathHits: [pathHit],
      spallHits: [spallHit],
      spallEffect
    }
  });

  const captured = combat.captureState();
  const capturedImpact = captured.telemetry.impacts[0];
  combat.telemetry.impacts[0].internalPathHits[0].entryPoint[0] = 999;
  combat.telemetry.impacts[0].crewResult.internalPathHits[0].exitPoint[2] = 999;
  combat.telemetry.impacts[0].spallHits[0].direction[0] = 999;
  combat.telemetry.impacts[0].spallEffect.hitVolumeIds[0] = 'mutated';
  combat.telemetry.impacts[0].crewResult.spallHits[0].fragmentIndices[0] = 999;
  combat.telemetry.impacts[0].crewResult.casualties[0].health = 999;
  combat.telemetry.impacts[0].penetrationReferenceUrls[0] = 'mutated';
  combat.telemetry.impacts[0].plateResidualVelocity[2] = 999;
  combat.telemetry.impacts[0].residualVelocity[2] = 999;
  combat.telemetry.impacts[0].exitPosition[2] = 999;
  combat.telemetry.impacts[0].exitResult.point[2] = 999;
  combat.telemetry.impacts[0].exitResult.normal[2] = 999;
  assert.deepEqual(capturedImpact.internalPathHits[0].entryPoint, [1, 2, 3]);
  assert.deepEqual(capturedImpact.crewResult.internalPathHits[0].exitPoint, [1, 2, 2]);
  assert.deepEqual(capturedImpact.spallHits[0].direction, [0.1, 0, -0.995]);
  assert.deepEqual(capturedImpact.spallEffect.hitVolumeIds, ['crew-driver']);
  assert.deepEqual(capturedImpact.crewResult.spallHits[0].fragmentIndices, [1, 3]);
  assert.equal(capturedImpact.crewResult.casualties[0].health, 35);
  assert.deepEqual(
    capturedImpact.penetrationReferenceUrls,
    ['https://example.test/terminal-ballistics']
  );
  assert.deepEqual(capturedImpact.plateResidualVelocity, [0, 0, 300]);
  assert.deepEqual(capturedImpact.residualVelocity, [0, 0, 240]);
  assert.deepEqual(capturedImpact.exitPosition, [1, 2, 1]);
  assert.deepEqual(capturedImpact.exitResult.point, [1, 2, 1]);
  assert.deepEqual(capturedImpact.exitResult.normal, [0, 0, 1]);

  combat.restoreState(captured, unitMap);
  capturedImpact.internalPathHits[0].entryPoint[0] = -999;
  capturedImpact.crewResult.internalPathHits[0].exitPoint[2] = -999;
  capturedImpact.spallHits[0].direction[0] = -999;
  capturedImpact.spallEffect.hitVolumeIds[0] = 'mutated-after-restore';
  capturedImpact.crewResult.spallHits[0].fragmentIndices[0] = -999;
  capturedImpact.crewResult.casualties[0].health = -999;
  capturedImpact.penetrationReferenceUrls[0] = 'mutated-after-restore';
  capturedImpact.plateResidualVelocity[2] = -999;
  capturedImpact.residualVelocity[2] = -999;
  capturedImpact.exitPosition[2] = -999;
  capturedImpact.exitResult.point[2] = -999;
  capturedImpact.exitResult.normal[2] = -999;
  assert.deepEqual(combat.telemetry.impacts[0].internalPathHits[0].entryPoint, [1, 2, 3]);
  assert.deepEqual(
    combat.telemetry.impacts[0].crewResult.internalPathHits[0].exitPoint,
    [1, 2, 2]
  );
  assert.deepEqual(combat.telemetry.impacts[0].spallHits[0].direction, [0.1, 0, -0.995]);
  assert.deepEqual(combat.telemetry.impacts[0].spallEffect.hitVolumeIds, ['crew-driver']);
  assert.deepEqual(
    combat.telemetry.impacts[0].crewResult.spallHits[0].fragmentIndices,
    [1, 3]
  );
  assert.equal(combat.telemetry.impacts[0].crewResult.casualties[0].health, 35);
  assert.deepEqual(
    combat.telemetry.impacts[0].penetrationReferenceUrls,
    ['https://example.test/terminal-ballistics']
  );
  assert.deepEqual(combat.telemetry.impacts[0].plateResidualVelocity, [0, 0, 300]);
  assert.deepEqual(combat.telemetry.impacts[0].residualVelocity, [0, 0, 240]);
  assert.deepEqual(combat.telemetry.impacts[0].exitPosition, [1, 2, 1]);
  assert.deepEqual(combat.telemetry.impacts[0].exitResult.point, [1, 2, 1]);
  assert.deepEqual(combat.telemetry.impacts[0].exitResult.normal, [0, 0, 1]);
  combat.reset();
});

test('weapon-report events replay from shot sequence and ignore presentation-audio failure', () => {
  const events = [];
  const battle = createBattle({
    sound: {
      playWeapon() {
        throw new Error('presentation audio unavailable');
      }
    },
    onAuditoryEvent(event) {
      events.push(JSON.parse(JSON.stringify(event)));
    }
  });
  const { attacker, target, combat, random, unitMap } = battle;
  const beforeShot = combat.captureState();
  const beforeRandom = random.capture();
  const options = {
    weapon: getWeapon('SA35_AP'),
    muzzlePosition: attacker.getMuzzleWorldPosition(),
    dispersionScale: 0
  };

  assert.equal(combat.fireWeapon(attacker, target, target.position, options), true);
  assert.equal(combat.projectiles.length, 1);
  assert.equal(combat.telemetry.shotsFired, 1);
  assert.equal(events.length, 1);
  const firstEvent = events[0];
  assert.equal(firstEvent.id, 'weapon-report:000000000001');
  assert.equal(firstEvent.shotSequence, 1);
  assert.equal(firstEvent.sourceUnitId, attacker.id);
  assert.equal(firstEvent.sourceFaction, attacker.faction);
  assert.deepEqual(firstEvent.origin, options.muzzlePosition.toArray());
  const afterShot = combat.captureState();

  combat.restoreState(beforeShot, unitMap);
  random.restore(beforeRandom);
  events.length = 0;
  assert.equal(combat.fireWeapon(attacker, target, target.position, options), true);
  assert.deepEqual(events, [firstEvent]);
  assert.deepEqual(combat.captureState(), afterShot);

  combat.restoreState(afterShot, unitMap);
  events.length = 0;
  assert.equal(combat.fireWeapon(attacker, target, target.position, options), true);
  assert.equal(events[0].id, 'weapon-report:000000000002');
  assert.equal(events[0].shotSequence, 2);

  const eventCount = events.length;
  assert.equal(combat.fireWeapon(null, target, target.position, options), false);
  assert.equal(events.length, eventCount, 'rejected fire must emit no weapon report');
  combat.reset();
});
