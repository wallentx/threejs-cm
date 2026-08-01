import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import {
  advanceInfantryUnitSuppression,
  classifyIndividualMorale,
  INFANTRY_SUPPRESSION_MODEL
} from '../src/simulation/infantry/InfantrySuppression.js';

const flatTerrain = {
  getHeightAt() {
    return 0;
  }
};

function createSquad(id) {
  return new Unit({
    id,
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
}

test('infantry requires materially greater suppression before pinning', () => {
  const squad = createSquad('harder-to-pin');

  squad.applySuppression(64);
  assert.equal(squad.morale, 'Shaken');
  squad.applySuppression(1);
  assert.equal(squad.morale, 'Pinned');

  assert.equal(classifyIndividualMorale(81.999), 'TAKING_COVER');
  assert.equal(classifyIndividualMorale(82), 'PINNED');
  assert.equal(classifyIndividualMorale(96), 'PINNED');
  assert.equal(classifyIndividualMorale(96.001), 'ROUTED');
});

test('quiet infantry leaves pinned state sooner than sustained-fire infantry', () => {
  const quiet = createSquad('quiet-recovery');
  quiet.applySuppression(70);
  quiet.update(1.6, flatTerrain);
  assert.equal(quiet.morale, 'Shaken');
  assert.ok(quiet.suppression < 48);

  const sustained = createSquad('sustained-recovery');
  sustained.applySuppression(70);
  for (const agent of sustained.soldierAI.agents) {
    agent.record.incomingFireTimer = 3;
  }
  sustained.update(1.6, flatTerrain);
  assert.equal(sustained.morale, 'Pinned');
  assert.ok(sustained.suppression > 60);
});

test('recent-fire and quiet recovery split is frame-partition invariant', () => {
  const initial = { suppression: 76, morale: 'Pinned' };
  const whole = advanceInfantryUnitSuppression(initial, 2, 0.6);
  const recentA = advanceInfantryUnitSuppression(initial, 0.25, 0.25);
  const recentB = advanceInfantryUnitSuppression(recentA, 0.35, 0.35);
  const partitioned = advanceInfantryUnitSuppression(recentB, 1.4, 0);

  assert.deepEqual(partitioned, whole);
  assert.equal(INFANTRY_SUPPRESSION_MODEL, 'first-order-recent-fire-recovery-v1');
});

test('suppression recovery and existing recent-fire timers replay after restore', () => {
  const squad = createSquad('suppression-replay');
  squad.applySuppression(70);
  for (const agent of squad.soldierAI.agents) {
    agent.record.incomingFireTimer = 1.25;
  }
  squad.update(0, flatTerrain);
  const snapshot = squad.captureState();

  squad.update(1.5, flatTerrain);
  const expected = squad.captureState();
  squad.restoreState(snapshot, new Map([[squad.id, squad]]));
  assert.deepEqual(squad.captureState(), snapshot);
  squad.update(1.5, flatTerrain);
  assert.deepEqual(squad.captureState(), expected);
});

test('live SoldierAI recovers an individual faster with a nearby living leader', () => {
  const leaderNearby = createSquad('leader-nearby-recovery');
  const leaderFar = createSquad('leader-far-recovery');
  const nearbyObserver = leaderNearby.soldierAI.agents[2];
  const farObserver = leaderFar.soldierAI.agents[2];

  for (const observer of [nearbyObserver, farObserver]) {
    observer.suppression = 50;
    observer.syncRecord();
    observer.record.lastSuppression = 50;
    observer.record.incomingFireTimer = 0;
  }
  const distantLeader = leaderFar.soldierAI.agents[0];
  distantLeader.position.set(100, 0, 100);
  distantLeader.syncRecord();

  leaderNearby.update(0.1, flatTerrain);
  leaderFar.update(0.1, flatTerrain);

  assert.equal(nearbyObserver.suppression, 47.6);
  assert.equal(farObserver.suppression, 48.2);
  assert.ok(nearbyObserver.suppression < farObserver.suppression);
});
