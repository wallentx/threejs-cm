import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import {
  evaluateInfantryCasualtyReaction,
  INFANTRY_CASUALTY_REACTION_POLICY,
  INFANTRY_CASUALTY_REACTION_APPROXIMATION
} from '../src/simulation/infantry/InfantryCasualtyReaction.js';

const flatTerrain = {
  getHeightAt: () => 0,
  bocageObstacles: []
};

function createSquad(id) {
  return new Unit({
    id,
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 0)
  });
}

function restoreUnit(unit, state) {
  unit.restoreState(state, new Map([[unit.id, unit]]));
}

function casualtyOwnedState(unit) {
  return unit.captureState().roster.map(soldier => ({
    id: soldier.id,
    suppression: soldier.suppression,
    lastCasualtyState: soldier.lastCasualtyState,
    casualtyEventVersion: soldier.casualtyEventVersion,
    casualtyEventEvidence: soldier.casualtyEventEvidence,
    processedCasualtyEvents: soldier.processedCasualtyEvents,
    casualtyResponseTicksRemaining: soldier.casualtyResponseTicksRemaining,
    casualtyResponseTickRemainder: soldier.casualtyResponseTickRemainder,
    casualtyResponseTimer: soldier.casualtyResponseTimer
  }));
}

function casualtyOwnedById(unit) {
  return Object.fromEntries(
    casualtyOwnedState(unit).map(state => [String(state.id), state])
  );
}

function setPositiveHealthStatus(agent, status) {
  agent.health = 100;
  agent.status = status;
  agent.state = status === 'OK' ? 'READY' : 'CASUALTY';
  agent.syncRecord();
}

test('evaluateInfantryCasualtyReaction validates inputs and returns expected policy fields', () => {
  assert.equal(INFANTRY_CASUALTY_REACTION_POLICY.maximumDistanceMeters, 18);
  assert.equal(INFANTRY_CASUALTY_REACTION_POLICY.baseSuppressionShock, 12);
  assert.equal(INFANTRY_CASUALTY_REACTION_POLICY.maxSuppressionShock, 28);
  assert.equal(INFANTRY_CASUALTY_REACTION_POLICY.maxProcessedCasualtyEvents, 16);
  assert.match(
    INFANTRY_CASUALTY_REACTION_APPROXIMATION,
    /building aperture integration is not yet modeled/
  );
  assert.equal(
    INFANTRY_CASUALTY_REACTION_POLICY.approximationLabel,
    INFANTRY_CASUALTY_REACTION_APPROXIMATION
  );

  const validResult = evaluateInfantryCasualtyReaction({
    soldierId: 's1',
    casualtyId: 's2',
    eventId: 'casualty:u1:s2:KIA',
    observerPosition: [0, 0],
    casualtyPosition: [5, 0],
    available: true,
    living: true,
    incapacitated: false,
    surrendered: false,
    sameUnit: true,
    awareOfCasualty: true,
    hasLOS: true,
    alreadyProcessed: false
  });

  assert.equal(validResult.active, true);
  assert.equal(validResult.reason, 'observed-casualty');
  assert.equal(validResult.eventId, 'casualty:u1:s2:KIA');
  assert.equal(validResult.casualtyId, 's2');
  assert.equal(validResult.distanceMeters, 5);
  assert.equal(validResult.shock, 23);
  assert.equal(validResult.timerSeconds, 4.5);
});

test('evaluateInfantryCasualtyReaction is fail-closed for every eligibility input', () => {
  const base = {
    soldierId: 's1',
    casualtyId: 's2',
    eventId: 'casualty:u1:s2:KIA',
    observerPosition: [0, 0],
    casualtyPosition: [5, 0],
    available: true,
    living: true,
    incapacitated: false,
    surrendered: false,
    sameUnit: true,
    awareOfCasualty: true,
    hasLOS: true,
    alreadyProcessed: false
  };

  assert.equal(evaluateInfantryCasualtyReaction({ ...base, soldierId: 's2' }).reason, 'self-casualty');
  assert.equal(evaluateInfantryCasualtyReaction({ ...base, sameUnit: false }).reason, 'unrelated-unit');
  assert.equal(evaluateInfantryCasualtyReaction({ ...base, available: false }).reason, 'unavailable');
  assert.equal(evaluateInfantryCasualtyReaction({ ...base, living: false }).reason, 'casualty');
  assert.equal(evaluateInfantryCasualtyReaction({ ...base, incapacitated: true }).reason, 'incapacitated');
  assert.equal(evaluateInfantryCasualtyReaction({ ...base, surrendered: true }).reason, 'surrendered');
  assert.equal(evaluateInfantryCasualtyReaction({ ...base, awareOfCasualty: false }).reason, 'unaware');
  assert.equal(evaluateInfantryCasualtyReaction({ ...base, hasLOS: false }).reason, 'occluded');
  assert.equal(evaluateInfantryCasualtyReaction({ ...base, alreadyProcessed: true }).reason, 'already-processed');
  assert.equal(evaluateInfantryCasualtyReaction({ ...base, casualtyPosition: [25, 0] }).reason, 'out-of-range');
  for (const field of [
    'sameUnit',
    'available',
    'living',
    'incapacitated',
    'surrendered',
    'awareOfCasualty',
    'hasLOS'
  ]) {
    const input = { ...base };
    delete input[field];
    assert.equal(
      evaluateInfantryCasualtyReaction(input).active,
      false,
      `missing ${field}`
    );
  }
  assert.equal(
    evaluateInfantryCasualtyReaction({ ...base, observerStatus: 'WOUNDED' }).active,
    true
  );
});

test('live six-person casualty reaction leaves aggregate unit suppression unchanged', () => {
  const squad = createSquad('squad_six');

  assert.equal(squad.suppression, 0);
  assert.equal(squad.morale, 'OK');

  const victimId = squad.soldierAI.agents[1].id;
  squad.soldierAI.applyHit(victimId, 1.0, () => 0.1);

  assert.equal(squad.suppression, 0);
  assert.equal(squad.morale, 'OK');

  squad.update(1 / 30, flatTerrain);

  assert.equal(squad.suppression, 0);
  assert.equal(squad.morale, 'OK');

  const survivor = squad.soldierAI.agents[0];
  assert.ok(survivor.suppression > 0);
  assert.equal(survivor.record.casualtyResponseTimer, 4.466666667);
});

test('casualty-owned state is exactly invariant for 1x1.0 versus 30x1/30', () => {
  const whole = createSquad('squad_partition');
  const partitioned = createSquad('squad_partition');
  const victimId = whole.soldierAI.agents[1].id;

  whole.soldierAI.applyHit(victimId, 1, () => 0);
  partitioned.soldierAI.applyHit(victimId, 1, () => 0);
  whole.update(1, flatTerrain);
  for (let step = 0; step < 30; step++) {
    partitioned.update(1 / 30, flatTerrain);
  }

  assert.deepEqual(casualtyOwnedState(partitioned), casualtyOwnedState(whole));
  assert.deepEqual(
    partitioned.captureState().dangerMap,
    whole.captureState().dangerMap
  );
});

test('WOUNDED then KIA creates monotonic distinct stable transitions', () => {
  const squad = createSquad('squad_transitions');

  const victim = squad.soldierAI.agents[1];
  const survivor = squad.soldierAI.agents[0];

  squad.soldierAI.applyDamage(victim.id, 45, 10);
  squad.update(0, flatTerrain);

  const woundedEventId = victim.record.casualtyEventEvidence.eventId;
  assert.match(woundedEventId, /:v1:WOUNDED$/);
  const shock1 = survivor.suppression;

  squad.soldierAI.applyDamage(victim.id, 120, 10);
  squad.update(0, flatTerrain);

  const killedEventId = victim.record.casualtyEventEvidence.eventId;
  assert.match(killedEventId, /:v2:KIA$/);
  assert.deepEqual(survivor.record.processedCasualtyEvents, [
    woundedEventId,
    killedEventId
  ]);
  assert.ok(survivor.suppression > shock1);
});

test('real snapshot-shaped occlusion blocks a live casualty reaction', () => {
  const wall = Object.freeze({
    id: 'stone_wall_1',
    minX: 1,
    maxX: 3,
    minY: 0,
    maxY: 4,
    minZ: -5,
    maxZ: 5,
    occludesSight: true
  });
  const snapshot = Object.freeze({
    revision: 1,
    records: Object.freeze([wall])
  });
  let snapshotReads = 0;
  const terrainWithWall = {
    getHeightAt: () => 0,
    bocageObstacles: [],
    getSightOccluderSnapshot() {
      snapshotReads++;
      return snapshot;
    }
  };

  const squad = createSquad('squad_occlusion');

  squad.soldierAI.agents[0].position.set(-2, 0, 0);
  squad.soldierAI.agents[1].position.set(5, 0, 0);

  const victimId = squad.soldierAI.agents[1].id;
  squad.soldierAI.applyHit(victimId, 1.0, () => 0.1);

  squad.update(0, terrainWithWall);

  const occludedObserver = squad.soldierAI.agents[0];
  assert.ok(snapshotReads > 0);
  assert.equal(occludedObserver.suppression, 0);
});

test('reordered live victim candidates preserve per-ID outcomes and roster order', () => {
  const forward = createSquad('squad_reorder');
  const reordered = createSquad('squad_reorder');
  const victimIds = forward.soldierAI.agents.slice(1, 3).map(agent => agent.id);
  reordered.soldierAI.agents.reverse();

  for (const squad of [forward, reordered]) {
    setPositiveHealthStatus(
      squad.soldierAI.agents.find(agent => agent.id === victimIds[0]),
      'WOUNDED'
    );
    setPositiveHealthStatus(
      squad.soldierAI.agents.find(agent => agent.id === victimIds[1]),
      'INCAPACITATED'
    );
    squad.update(0, flatTerrain);
  }

  assert.deepEqual(casualtyOwnedById(reordered), casualtyOwnedById(forward));
  assert.notDeepEqual(
    reordered.captureState().roster.map(soldier => soldier.id),
    forward.captureState().roster.map(soldier => soldier.id)
  );
});

test('runtime processed-event ledger applies deterministic capacity eviction', () => {
  const squad = createSquad('squad_bounded');
  const observer = squad.soldierAI.agents[0];
  const victim = squad.soldierAI.agents[1];
  for (let version = 1; version <= 20; version++) {
    setPositiveHealthStatus(
      victim,
      version % 2 === 0 ? 'WOUNDED' : 'INCAPACITATED'
    );
    squad.update(0, flatTerrain);
  }

  assert.equal(victim.record.casualtyEventVersion, 20);
  assert.equal(
    observer.record.processedCasualtyEvents.length,
    INFANTRY_CASUALTY_REACTION_POLICY.maxProcessedCasualtyEvents
  );
  assert.match(observer.record.processedCasualtyEvents[0], /:v5:INCAPACITATED$/);
  assert.match(observer.record.processedCasualtyEvents.at(-1), /:v20:WOUNDED$/);
});

test('an observed casualty event is processed once without duplicate shock', () => {
  const squad = createSquad('no_duplicate');
  const observer = squad.soldierAI.agents[0];
  const victim = squad.soldierAI.agents[1];
  squad.soldierAI.applyHit(victim.id, 1, () => 0);

  squad.update(0.1, flatTerrain);
  const eventId = observer.record.processedCasualtyEvents[0];
  const firstSuppression = observer.suppression;
  squad.update(0.1, flatTerrain);

  assert.deepEqual(observer.record.processedCasualtyEvents, [eventId]);
  assert.ok(observer.suppression < firstSuppression);
  assert.equal(victim.record.casualtyEventVersion, 1);
});

test('an observer beyond 18 metres does not react', () => {
  const squad = createSquad('out_of_range');
  const observer = squad.soldierAI.agents[0];
  const victim = squad.soldierAI.agents[1];
  observer.position.set(0, 0, 0);
  victim.position.set(19, 0, 0);
  observer.syncRecord();
  victim.syncRecord();

  squad.soldierAI.applyHit(victim.id, 1, () => 0);
  squad.update(0, flatTerrain);

  assert.equal(observer.suppression, 0);
  assert.deepEqual(observer.record.processedCasualtyEvents, []);
});

test('a building-transit observer is unavailable for casualty reaction', () => {
  const squad = createSquad('transit_observer');
  const observer = squad.soldierAI.agents[0];
  const victim = squad.soldierAI.agents[1];
  observer.buildingLocation = {
    buildingId: 'house-1',
    phase: 'transit',
    transitElapsed: 0.2
  };
  observer.syncRecord();

  squad.soldierAI.applyHit(victim.id, 1, () => 0);
  squad.update(0, flatTerrain);

  assert.equal(observer.suppression, 0);
  assert.deepEqual(observer.record.processedCasualtyEvents, []);
});

test('positive-health incapacitation emits an explicit versioned victim transition', () => {
  const squad = createSquad('positive_health_incap');
  const observer = squad.soldierAI.agents[0];
  const victim = squad.soldierAI.agents[1];
  setPositiveHealthStatus(victim, 'INCAPACITATED');

  squad.update(0, flatTerrain);

  assert.equal(victim.health, 100);
  assert.equal(victim.record.casualtyEventVersion, 1);
  assert.equal(victim.record.casualtyEventEvidence.state, 'INCAPACITATED');
  assert.match(victim.record.casualtyEventEvidence.eventId, /:v1:INCAPACITATED$/);
  assert.deepEqual(observer.record.processedCasualtyEvents, [
    victim.record.casualtyEventEvidence.eventId
  ]);
});

test('legacy building-shaped sight occluders are not skipped', () => {
  const squad = createSquad('legacy_building_occlusion');
  const observer = squad.soldierAI.agents[0];
  const victim = squad.soldierAI.agents[1];
  observer.position.set(-5, 0, 0);
  victim.position.set(5, 0, 0);
  squad.soldierAI.applyHit(victim.id, 1, () => 0);

  squad.update(0, {
    getHeightAt: () => 0,
    bocageObstacles: [{
      id: 'legacy-house',
      buildingId: 'house-1',
      minX: -1,
      maxX: 1,
      minY: 0,
      maxY: 4,
      minZ: -2,
      maxZ: 2,
      occludesSight: true
    }]
  });

  assert.equal(observer.suppression, 0);
  assert.deepEqual(observer.record.processedCasualtyEvents, []);
});

test('Unit rollback removes a future event and restores a processed event without duplication', () => {
  const squad = createSquad('unit_rollback');
  const observerId = squad.soldierAI.agents[0].id;
  const victimId = squad.soldierAI.agents[1].id;
  const beforeCasualty = squad.captureState();

  squad.soldierAI.applyHit(victimId, 1, () => 0);
  squad.update(0.1, flatTerrain);
  assert.equal(
    squad.soldierAI.agents.find(agent => agent.id === observerId)
      .record.processedCasualtyEvents.length,
    1
  );

  restoreUnit(squad, beforeCasualty);
  assert.deepEqual(squad.captureState(), beforeCasualty);
  squad.update(0.1, flatTerrain);
  const restoredObserver = squad.soldierAI.agents.find(
    agent => agent.id === observerId
  );
  const restoredVictim = squad.soldierAI.agents.find(
    agent => agent.id === victimId
  );
  assert.equal(restoredVictim.record.casualtyEventEvidence, null);
  assert.deepEqual(restoredObserver.record.processedCasualtyEvents, []);
  assert.equal(restoredObserver.suppression, 0);

  squad.soldierAI.applyHit(victimId, 1, () => 0);
  squad.update(0.1, flatTerrain);
  const afterProcessedEvent = squad.captureState();
  const capturedEvidence = afterProcessedEvent.roster.find(
    soldier => soldier.id === victimId
  ).casualtyEventEvidence;
  const liveVictim = squad.soldierAI.agents.find(agent => agent.id === victimId);
  liveVictim.record.casualtyEventEvidence.position[0] += 99;
  assert.notEqual(
    liveVictim.record.casualtyEventEvidence.position[0],
    capturedEvidence.position[0]
  );

  restoreUnit(squad, afterProcessedEvent);
  const suppressionAfterRestore = squad.soldierAI.agents.find(
    agent => agent.id === observerId
  ).suppression;
  squad.update(0.1, flatTerrain);
  const replayedObserver = squad.soldierAI.agents.find(
    agent => agent.id === observerId
  );
  assert.equal(replayedObserver.record.processedCasualtyEvents.length, 1);
  assert.ok(replayedObserver.suppression < suppressionAfterRestore);
});
