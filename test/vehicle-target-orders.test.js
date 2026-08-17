import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameApp } from '../src/app/GameApp.js';
import { Unit } from './helpers/France1940TestUnit.js';
import {
  createVehicleLocalAimPoint,
  resolveVehicleLocalAimPoint
} from '../src/simulation/combat/VehicleTargeting.js';

function makeVehicle(id, faction, vehicleId, position) {
  return new Unit({
    id,
    faction,
    type: 'vehicle',
    vehicleId,
    position: position.clone()
  });
}

function poisonTargetChannel(state, targetId) {
  state.targetUnitId = targetId;
  state.targetSoldierId = 'stale-soldier';
  state.targetPos = [99, 99, 99];
  state.targetMode = 'TARGET_HE';
  state.isFiring = true;
  Object.assign(state.fireControl, {
    targetKey: `unit:${targetId}:soldier:-`,
    phase: 'READY',
    aimProgressSeconds: 4,
    aimRequiredSeconds: 1,
    estimatedRangeMeters: 99,
    rangeErrorMeters: 2
  });
}

function assertClearedChannel(state, phase) {
  assert.equal(state.targetUnitId, null);
  assert.equal(state.targetSoldierId, null);
  assert.equal(state.targetPos, null);
  assert.equal(state.targetMode, null);
  assert.equal(state.isFiring, false);
  assert.equal(state.fireState, phase);
  assert.equal(state.fireControl.targetKey, null);
  assert.equal(state.fireControl.phase, phase);
  assert.equal(state.fireControl.aimProgressSeconds, 0);
  assert.equal(state.fireControl.aimRequiredSeconds, 0);
  assert.equal(state.fireControl.estimatedRangeMeters, null);
  assert.equal(state.fireControl.rangeErrorMeters, null);
}

test('direct vehicle retarget atomically clears every old weapon owner and engagement evidence', () => {
  const attacker = makeVehicle(
    'char',
    'french',
    'CHAR_B1_BIS',
    new THREE.Vector3()
  );
  const oldTarget = makeVehicle(
    'old-target',
    'german',
    'PANZER_III_D',
    new THREE.Vector3(0, 0, 30)
  );
  const newTarget = makeVehicle(
    'new-target',
    'german',
    'PANZER_IV_D',
    new THREE.Vector3(8, 0, 42)
  );
  poisonTargetChannel(attacker.vehicleWeapon, oldTarget.id);
  for (const state of Object.values(attacker.vehicleMounts)) {
    poisonTargetChannel(state, oldTarget.id);
  }
  attacker.vehicleEngagementLearning.targetUnitId = oldTarget.id;
  attacker.vehicleEngagementLearning.ineffectiveHits = 4;
  attacker.vehicleEngagementLearning.aimStep = 2;
  attacker.vehicleEngagementLearning.ammoTrialRequested = true;
  attacker.vehicleEngagementLearning.retargetRequested = true;

  const clicked = newTarget.position.clone().add(new THREE.Vector3(0.6, 1.7, -0.4));
  const intent = createVehicleLocalAimPoint(newTarget, clicked);
  assert.equal(attacker.setTargetOrder({
    targetUnit: newTarget,
    targetPos: clicked,
    targetAimIntent: intent,
    targetMode: 'TARGET_AP'
  }), true);

  assertClearedChannel(attacker.vehicleWeapon, 'TARGET_CHANGED');
  for (const state of Object.values(attacker.vehicleMounts)) {
    assertClearedChannel(state, 'TARGET_CHANGED');
  }
  assert.equal(attacker.targetUnit, newTarget);
  assert.deepEqual(attacker.targetPos.toArray(), clicked.toArray());
  assert.equal(attacker.targetMode, 'TARGET_AP');
  assert.equal(attacker.vehicleEngagementLearning.targetUnitId, newTarget.id);
  assert.equal(attacker.vehicleEngagementLearning.ineffectiveHits, 0);
  assert.equal(attacker.vehicleEngagementLearning.aimStep, 0);
  assert.equal(attacker.vehicleEngagementLearning.ammoTrialRequested, false);
  assert.equal(attacker.vehicleEngagementLearning.retargetRequested, false);

  newTarget.position.add(new THREE.Vector3(3, 0, 2));
  newTarget.rotation = Math.PI / 3;
  const resolved = resolveVehicleLocalAimPoint(newTarget, attacker.targetAimIntent);
  assert.equal(resolved.length, 3);
  assert.equal(resolved.every(Number.isFinite), true);
  const channelTarget = attacker.resolveVehicleChannelTarget(
    newTarget,
    attacker.vehicleWeapon,
    'main'
  );
  assert.deepEqual(channelTarget.explicitAimPoint, resolved);
  assert.equal(channelTarget.position.toArray().every(Number.isFinite), true);
});

test('precision dropout retains only the ordered spatial aim until Clear Target releases every owner', () => {
  const attacker = makeVehicle(
    'attacker',
    'german',
    'PANZER_III_D',
    new THREE.Vector3()
  );
  const ordered = makeVehicle(
    'ordered',
    'french',
    'SOMUA_S35',
    new THREE.Vector3(0, 0, 40)
  );
  const automatic = makeVehicle(
    'automatic',
    'french',
    'RENAULT_R35',
    new THREE.Vector3(5, 0, 30)
  );
  const aim = ordered.position.clone().add(new THREE.Vector3(0.2, 1.4, 0));
  attacker.setTargetOrder({
    targetUnit: ordered,
    targetPos: aim,
    targetAimIntent: createVehicleLocalAimPoint(ordered, aim),
    targetMode: 'TARGET_AP'
  });
  const game = Object.assign(Object.create(GameApp.prototype), {
    random: () => 0,
    spotting: {
      canPrecisionTarget: (_observer, target) => target !== ordered,
      checkLOS: () => ({ clear: true, dist: 30 })
    }
  });

  assert.equal(game.chooseTarget(attacker, [ordered, automatic]), null);
  assert.equal(attacker.targetUnit, ordered);
  assert.deepEqual(attacker.targetPos.toArray(), aim.toArray());
  assert.equal(attacker.vehicleWeapon.targetUnitId, null);

  poisonTargetChannel(attacker.vehicleWeapon, ordered.id);
  for (const state of Object.values(attacker.vehicleMounts)) {
    poisonTargetChannel(state, ordered.id);
  }
  assert.equal(attacker.clearTargetOrder('PLAYER_CLEAR_TARGET'), true);
  assert.equal(attacker.targetUnit, null);
  assert.equal(attacker.targetPos, null);
  assert.equal(attacker.targetAimIntent, null);
  assert.equal(attacker.targetMode, null);
  assertClearedChannel(attacker.vehicleWeapon, 'PLAYER_CLEAR_TARGET');
  for (const state of Object.values(attacker.vehicleMounts)) {
    assertClearedChannel(state, 'PLAYER_CLEAR_TARGET');
  }
  assert.equal(game.chooseTarget(attacker, [automatic]), automatic);
});
