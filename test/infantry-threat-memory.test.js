import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DEFAULT_THREAT_MEMORY_POLICY,
  THREAT_MEMORY_APPROXIMATION,
  THREAT_MEMORY_CLOCK_PRECISION_SECONDS,
  ThreatMemory
} from '../src/simulation/infantry/ThreatMemory.js';
import { Unit } from './helpers/France1940TestUnit.js';

const coverTerrain = {
  bocageObstacles: [{
    id: 'memory-test-wall',
    type: 'stonewall',
    minX: -3,
    maxX: 3,
    minY: 0,
    maxY: 1.1,
    minZ: 1.4,
    maxZ: 1.8,
    height: 1.1
  }],
  getHeightAt() {
    return 0;
  }
};

function observe(memory, eventId, {
  threatPosition = [0, 1.2, 12],
  impactPosition = [0, 0, 0],
  intensity = 1
} = {}) {
  return memory.record({
    eventId,
    threatPosition,
    impactPosition,
    intensity
  });
}

function makeSquad(id) {
  return new Unit({
    id,
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
}

test('threat memory rejects invalid policy, event, position, intensity, clock, and future state', () => {
  assert.throws(
    () => new ThreatMemory({ lifetimeSeconds: 0 }),
    /lifetimeSeconds/
  );
  assert.throws(
    () => new ThreatMemory({ capacity: 5 }),
    /capacity/
  );

  const memory = new ThreatMemory();
  assert.throws(
    () => observe(memory, ''),
    /eventId/
  );
  assert.throws(
    () => observe(memory, 'bad-threat', { threatPosition: [0, NaN, 1] }),
    /threatPosition/
  );
  assert.throws(
    () => observe(memory, 'bad-impact', { impactPosition: [0, 1] }),
    /impactPosition/
  );
  assert.throws(
    () => observe(memory, 'extra-impact', { impactPosition: [0, 1, 2, 3] }),
    /exactly three/
  );
  assert.throws(
    () => observe(memory, 'bad-intensity', { intensity: -1 }),
    /intensity/
  );
  assert.throws(
    () => memory.advance(Infinity),
    /deltaSeconds/
  );
  assert.throws(
    () => new ThreatMemory().restoreState({ version: 3 }),
    /unsupported threat-memory version/
  );
});

test('four stable observations coexist and a tied fifth evicts lexically independent of insertion order', () => {
  const forward = new ThreatMemory();
  const reverse = new ThreatMemory();
  for (const eventId of ['alpha', 'bravo', 'charlie', 'delta', 'echo']) {
    observe(forward, eventId);
  }
  for (const eventId of ['echo', 'delta', 'charlie', 'bravo', 'alpha']) {
    observe(reverse, eventId);
  }

  const expectedIds = ['bravo', 'charlie', 'delta', 'echo'];
  assert.deepEqual(
    forward.captureState().records.map(record => record.eventId),
    expectedIds
  );
  assert.deepEqual(reverse.captureState(), forward.captureState());
  assert.equal(forward.size, DEFAULT_THREAT_MEMORY_POLICY.capacity);
  assert.equal(forward.getStrongest().eventId, 'bravo');
});

test('eviction uses weakest score and strongest selection uses score, recency, then lexical ID', () => {
  const eviction = new ThreatMemory();
  observe(eviction, 'weak', { intensity: 0.1 });
  observe(eviction, 'strong-a', { intensity: 1 });
  observe(eviction, 'strong-b', { intensity: 1 });
  observe(eviction, 'strong-c', { intensity: 1 });
  observe(eviction, 'replacement', { intensity: 0.5 });
  assert.deepEqual(
    eviction.captureState().records.map(record => record.eventId),
    ['replacement', 'strong-a', 'strong-b', 'strong-c']
  );

  const recency = new ThreatMemory({ lifetimeSeconds: 10 });
  observe(recency, 'older', { intensity: 1 });
  recency.advance(2);
  observe(recency, 'newer-z', { intensity: 0.8 });
  observe(recency, 'newer-a', { intensity: 0.8 });
  assert.equal(recency.getStrongest().score, 0.8);
  assert.equal(recency.getStrongest().eventId, 'newer-a');
});

test('refresh replaces an immutable observation without growing state', () => {
  const memory = new ThreatMemory();
  const originalThreat = [1, 2, 3];
  observe(memory, 'projectile:7', {
    threatPosition: originalThreat,
    impactPosition: [4, 5, 6],
    intensity: 0.5
  });
  originalThreat[0] = 999;
  assert.deepEqual(memory.getStrongest().threatPosition, [1, 2, 3]);
  memory.advance(2);
  observe(memory, 'projectile:7', {
    threatPosition: [7, 8, 9],
    impactPosition: [10, 11, 12],
    intensity: 1.5
  });

  const state = memory.captureState();
  assert.equal(state.records.length, 1);
  assert.deepEqual(state.records[0], {
    eventId: 'projectile:7',
    threatPosition: [7, 8, 9],
    impactPosition: [10, 11, 12],
    intensity: 1.5,
    observedAtSeconds: 2,
    expiresAtSeconds: 14,
    observedClock: {
      clockWholeSeconds: 2,
      clockPicoseconds: 0,
      clockCompensationSeconds: 0
    },
    expiresClock: {
      clockWholeSeconds: 14,
      clockPicoseconds: 0,
      clockCompensationSeconds: 0
    }
  });
});

test('score decays linearly, zero delta is inert, expiry is exact, and snapshots are isolated', () => {
  const memory = new ThreatMemory({ lifetimeSeconds: 4 });
  observe(memory, 17, {
    threatPosition: [1, 2, 3],
    impactPosition: [4, 5, 6],
    intensity: 2
  });
  const beforeZero = memory.captureState();
  memory.advance(0);
  assert.deepEqual(memory.captureState(), beforeZero);

  memory.advance(2);
  const selected = memory.getStrongest();
  assert.equal(selected.ageSeconds, 2);
  assert.equal(selected.score, 1);
  selected.threatPosition[0] = 999;
  const publicSnapshot = memory.snapshot();
  publicSnapshot.records[0].impactPosition[0] = 999;
  publicSnapshot.strongest.threatPosition[1] = 999;
  assert.deepEqual(memory.getStrongest().threatPosition, [1, 2, 3]);
  assert.deepEqual(memory.getStrongest().impactPosition, [4, 5, 6]);

  memory.advance(2);
  assert.equal(memory.getStrongest(), null);
  assert.equal(memory.size, 0);
});

test('whole and partitioned advancement produce byte-identical state and selection', () => {
  const whole = new ThreatMemory();
  const partitioned = new ThreatMemory();
  for (const memory of [whole, partitioned]) {
    observe(memory, 'near', {
      threatPosition: [0, 1, 8],
      impactPosition: [0, 0, 1],
      intensity: 1.25
    });
    observe(memory, 'far', {
      threatPosition: [4, 1, 18],
      impactPosition: [1, 0, 2],
      intensity: 0.75
    });
  }

  whole.advance(6);
  for (let step = 0; step < 360; step++) {
    partitioned.advance(1 / 60);
  }

  assert.deepEqual(partitioned.captureState(), whole.captureState());
  assert.deepEqual(partitioned.getStrongest(), whole.getStrongest());

  const checkpointSource = new ThreatMemory();
  observe(checkpointSource, 'checkpoint');
  for (let step = 0; step < 7; step++) checkpointSource.advance(1 / 60);
  const checkpoint = checkpointSource.captureState();
  const checkpointRestored = new ThreatMemory().restoreState(checkpoint);
  for (let step = 0; step < 53; step++) {
    checkpointSource.advance(1 / 60);
    checkpointRestored.advance(1 / 60);
  }
  assert.deepEqual(
    checkpointRestored.captureState(),
    checkpointSource.captureState()
  );
});

test('non-tick partitions share one canonical exact-expiry boundary', () => {
  const lifetimeSeconds = 0.1234567894;
  const whole = new ThreatMemory({ lifetimeSeconds });
  const partitioned = new ThreatMemory({ lifetimeSeconds });
  for (const memory of [whole, partitioned]) {
    observe(memory, 'non-tick-boundary');
  }

  whole.advance(lifetimeSeconds);
  for (let step = 0; step < 3; step++) {
    partitioned.advance(lifetimeSeconds / 3);
  }

  assert.equal(whole.getStrongest(), null);
  assert.equal(partitioned.getStrongest(), null);
  assert.deepEqual(partitioned.captureState(), whole.captureState());

  const wholeBefore = new ThreatMemory({ lifetimeSeconds });
  const partitionedBefore = new ThreatMemory({ lifetimeSeconds });
  for (const memory of [wholeBefore, partitionedBefore]) {
    observe(memory, 'before-non-tick-boundary');
  }
  const beforeExpirySeconds = lifetimeSeconds - 1e-10;
  wholeBefore.advance(beforeExpirySeconds);
  for (let step = 0; step < 3; step++) {
    partitionedBefore.advance(beforeExpirySeconds / 3);
  }
  assert.equal(wholeBefore.getStrongest().eventId, 'before-non-tick-boundary');
  assert.deepEqual(
    partitionedBefore.captureState(),
    wholeBefore.captureState()
  );

  wholeBefore.advance(1e-10);
  partitionedBefore.advance(1e-10);
  assert.equal(wholeBefore.getStrongest(), null);
  assert.deepEqual(
    partitionedBefore.captureState(),
    wholeBefore.captureState()
  );
});

test('active non-tick partitions capture one canonical mid-clock state', () => {
  const whole = new ThreatMemory();
  const partitioned = new ThreatMemory();
  for (const memory of [whole, partitioned]) {
    observe(memory, 'active-non-tick');
  }

  const elapsedSeconds = 0.1234567894;
  whole.advance(elapsedSeconds);
  for (let step = 0; step < 3; step++) {
    partitioned.advance(elapsedSeconds / 3);
  }

  assert.equal(whole.getStrongest().eventId, 'active-non-tick');
  assert.deepEqual(partitioned.captureState(), whole.captureState());
});

test('half-picosecond ties have one byte-identical half-open representation', () => {
  const halfPicosecond = THREAT_MEMORY_CLOCK_PRECISION_SECONDS / 2;
  const whole = new ThreatMemory();
  const partitioned = new ThreatMemory();

  whole.advance(halfPicosecond);
  partitioned.advance(halfPicosecond / 2);
  partitioned.advance(halfPicosecond / 2);
  for (const memory of [whole, partitioned]) {
    observe(memory, 'half-picosecond-tie');
  }

  const canonicalState = whole.captureState();
  assert.deepEqual(partitioned.captureState(), canonicalState);
  assert.equal(canonicalState.clockPicoseconds, 1);
  assert.equal(
    canonicalState.clockCompensationSeconds,
    -halfPicosecond
  );
  assert.deepEqual(canonicalState.records[0].observedClock, {
    clockWholeSeconds: 0,
    clockPicoseconds: 1,
    clockCompensationSeconds: -halfPicosecond
  });
  assert.deepEqual(
    new ThreatMemory().restoreState(canonicalState).captureState(),
    canonicalState,
    'the inclusive negative half boundary must restore canonically'
  );

  const alternatePositiveHalf = structuredClone(canonicalState);
  alternatePositiveHalf.clockPicoseconds = 0;
  alternatePositiveHalf.clockCompensationSeconds = halfPicosecond;
  assert.equal(
    alternatePositiveHalf.clockSeconds,
    canonicalState.clockSeconds
  );
  assert.throws(
    () => new ThreatMemory().restoreState(alternatePositiveHalf),
    /canonical clock components are invalid/
  );
});

test('nonzero clocks retain a sub-nanosecond pre-expiry interval', () => {
  const memory = new ThreatMemory();
  memory.advance(100000);
  observe(memory, 'large-clock-boundary');

  memory.advance(DEFAULT_THREAT_MEMORY_POLICY.lifetimeSeconds - 1e-10);
  assert.equal(memory.getStrongest().eventId, 'large-clock-boundary');
  const beforeExpiry = memory.captureState();
  assert.deepEqual(
    new ThreatMemory().restoreState(beforeExpiry).captureState(),
    beforeExpiry
  );

  memory.advance(1e-10);
  assert.equal(memory.getStrongest(), null);
  assert.equal(memory.size, 0);
  assert.equal(
    memory.captureState().clockSeconds,
    100000 + DEFAULT_THREAT_MEMORY_POLICY.lifetimeSeconds
  );
});

test('canonical record clocks retain 100 picoseconds at ten million seconds', () => {
  const memory = new ThreatMemory();
  memory.advance(10_000_000);
  observe(memory, 'large-clock-canonical-boundary');

  memory.advance(DEFAULT_THREAT_MEMORY_POLICY.lifetimeSeconds - 1e-10);
  const beforeExpiry = memory.captureState();
  const record = beforeExpiry.records[0];
  assert.equal(
    beforeExpiry.clockSeconds,
    record.expiresAtSeconds,
    'projected doubles intentionally lose the remaining 100 picoseconds'
  );
  assert.deepEqual(record.observedClock, {
    clockWholeSeconds: 10_000_000,
    clockPicoseconds: 0,
    clockCompensationSeconds: 0
  });
  assert.deepEqual(record.expiresClock, {
    clockWholeSeconds: 10_000_012,
    clockPicoseconds: 0,
    clockCompensationSeconds: 0
  });
  const strongest = memory.getStrongest();
  assert.equal(strongest.eventId, 'large-clock-canonical-boundary');
  assert.equal(strongest.ageSeconds, 11.9999999999);
  assert.ok(strongest.score > 0);

  const restored = new ThreatMemory().restoreState(beforeExpiry);
  assert.deepEqual(restored.captureState(), beforeExpiry);
  assert.deepEqual(restored.getStrongest(), strongest);

  const tamperedExpiry = structuredClone(beforeExpiry);
  tamperedExpiry.records[0].expiresClock.clockPicoseconds = 1;
  assert.throws(
    () => new ThreatMemory().restoreState(tamperedExpiry),
    /expiresAtSeconds.*canonical|observation lifetime/
  );

  memory.advance(1e-10);
  restored.advance(1e-10);
  assert.equal(memory.getStrongest(), null);
  assert.deepEqual(restored.captureState(), memory.captureState());
});

test('finite clock, expiry, and score invariants keep every capture restorable', () => {
  const extremeClock = new ThreatMemory({
    lifetimeSeconds: Number.MAX_VALUE
  });
  const beforeRejectedOperations = extremeClock.captureState();
  assert.throws(
    () => observe(extremeClock, 'overflow-expiry'),
    /expiry.*finite.*representable/
  );
  assert.throws(
    () => extremeClock.advance(Number.MAX_VALUE),
    /clock.*finite.*representable/
  );
  assert.deepEqual(extremeClock.captureState(), beforeRejectedOperations);
  assert.deepEqual(
    new ThreatMemory().restoreState(beforeRejectedOperations).captureState(),
    beforeRejectedOperations
  );

  const boundedScore = new ThreatMemory({
    lifetimeSeconds: 1e-10
  });
  boundedScore.advance(100000);
  const observation = observe(boundedScore, 'bounded-score', {
    intensity: Number.MAX_VALUE
  });
  const boundedRecord = boundedScore.captureState().records[0];
  const unboundedFraction =
    (boundedRecord.expiresAtSeconds - boundedRecord.observedAtSeconds)
    / boundedScore.policy.lifetimeSeconds;
  assert.ok(unboundedFraction > 1);
  assert.equal(Number.MAX_VALUE * unboundedFraction, Infinity);
  assert.equal(observation.score, Number.MAX_VALUE);
  assert.ok(Number.isFinite(observation.score));
  const boundedState = boundedScore.captureState();
  assert.deepEqual(
    new ThreatMemory().restoreState(boundedState).captureState(),
    boundedState
  );
});

test('SoldierAI retains projectile and local event IDs past the immediate timer for cover use', () => {
  const squad = makeSquad('threat_memory_cover');
  const agent = squad.soldierAI.agents[0];
  const impact = agent.position.clone();
  const threat = new THREE.Vector3(0, 1.2, 12);

  squad.registerIncomingFire(threat, impact, {
    radius: 12,
    intensity: 0.1,
    projectileId: 42
  });
  squad.soldierAI.update(0, coverTerrain);
  assert.match(agent.record.tacticalDecision.reason, /^incoming-fire-/);

  squad.soldierAI.update(4, coverTerrain);
  assert.match(agent.record.tacticalDecision.reason, /^threat-memory-/);
  assert.equal(agent.record.tacticalDecision.threatMemoryEventId, 42);
  assert.equal(agent.record.tacticalDecision.threatMemoryAgeSeconds, 4);
  assert.deepEqual(
    agent.record.tacticalDecision.threatMemoryPosition,
    threat.toArray()
  );
  agent.suppression = 65;
  agent.record.lastSuppression = 65;
  agent.record.incomingFireTimer = 0;
  squad.soldierAI.update(0, coverTerrain);
  assert.match(
    agent.record.tacticalDecision.reason,
    /^threat-memory-/,
    'remembered geometry must supersede the old suppression-only threat fallback'
  );

  squad.soldierAI.update(8, coverTerrain);
  assert.doesNotMatch(agent.record.tacticalDecision.reason, /^threat-memory-/);
  assert.equal(agent.record.tacticalDecision.threatMemoryEventId, null);

  const local = makeSquad('threat_memory_local_id');
  const localAgent = local.soldierAI.agents[0];
  local.registerIncomingFire(
    threat,
    localAgent.position,
    { radius: 0.5, intensity: 0.1 }
  );
  assert.equal(
    localAgent.threatMemory.getStrongest().eventId,
    `local-incoming-fire:${local.id}:${localAgent.id}:1`
  );
});

test('mid-lifetime roster restore and replay preserve memory and tactical decision byte-for-byte', () => {
  const squad = makeSquad('threat_memory_replay');
  const agent = squad.soldierAI.agents[0];
  squad.registerIncomingFire(
    new THREE.Vector3(0, 1.2, 12),
    agent.position,
    { radius: 12, intensity: 0.1, projectileId: 'projectile:replay' }
  );
  squad.soldierAI.update(4, coverTerrain);
  const snapshot = squad.captureState();

  squad.soldierAI.update(1, coverTerrain);
  const expected = squad.captureState();
  squad.restoreState(snapshot, new Map([[squad.id, squad]]));
  assert.deepEqual(squad.captureState(), snapshot);
  squad.soldierAI.update(1, coverTerrain);
  assert.deepEqual(squad.captureState(), expected);

  const isolated = squad.captureState();
  isolated.roster[0].threatMemory.records[0].threatPosition[0] = 999;
  isolated.roster[0].tacticalDecision.threatMemoryPosition[0] = 999;
  assert.notEqual(
    squad.soldierAI.agents[0].threatMemory.getStrongest().threatPosition[0],
    999
  );
  assert.notEqual(
    squad.roster[0].tacticalDecision.threatMemoryPosition[0],
    999
  );
});

test('version-one compensated clocks preserve continuation when migrated', () => {
  const clockSeconds = 1000.1234567894002;
  const clockCompensationSeconds = 5.2007009809784677e-14;
  const deltaSeconds = 1e-13;
  const legacy = {
    version: 1,
    approximationLabel: THREAT_MEMORY_APPROXIMATION,
    capacity: 4,
    lifetimeSeconds: 12,
    scoreDecay: 'linear-to-zero',
    clockSeconds,
    clockCompensationSeconds,
    records: [{
      eventId: 'legacy-clock',
      threatPosition: [0, 1.2, 12],
      impactPosition: [0, 0, 0],
      intensity: 1,
      observedAtSeconds: 1000,
      expiresAtSeconds: 1012
    }]
  };

  const correctedDelta =
    deltaSeconds - legacy.clockCompensationSeconds;
  const legacyAdvancedClock =
    legacy.clockSeconds + correctedDelta;
  const legacyAdvancedCompensation =
    (legacyAdvancedClock - legacy.clockSeconds) - correctedDelta;
  const advanceAfterMigration = new ThreatMemory().restoreState(legacy);
  advanceAfterMigration.advance(deltaSeconds);
  const migrateAfterLegacyAdvance = new ThreatMemory().restoreState({
    ...legacy,
    clockSeconds: legacyAdvancedClock,
    clockCompensationSeconds: legacyAdvancedCompensation
  });

  assert.deepEqual(
    advanceAfterMigration.captureState(),
    migrateAfterLegacyAdvance.captureState()
  );
  assert.deepEqual(
    advanceAfterMigration.getStrongest(),
    migrateAfterLegacyAdvance.getStrongest()
  );
  assert.equal(advanceAfterMigration.captureState().version, 2);

  const target = new ThreatMemory();
  observe(target, 'preserved-on-rejection');
  const beforeRejectedRestore = target.captureState();
  assert.throws(
    () => target.restoreState({
      ...legacy,
      clockCompensationSeconds: Number.MAX_VALUE
    }),
    /clock compensation exceeds machine-epsilon drift/
  );
  assert.deepEqual(target.captureState(), beforeRejectedRestore);
});

test('legacy roster state restores empty memory while preserving immediate fire state', () => {
  const squad = makeSquad('threat_memory_legacy');
  const agent = squad.soldierAI.agents[0];
  squad.registerIncomingFire(
    new THREE.Vector3(0, 1.2, 12),
    agent.position,
    { radius: 12, intensity: 0.1, projectileId: 'legacy-projectile' }
  );
  const legacy = squad.captureState();
  const incomingTimer = legacy.roster[0].incomingFireTimer;
  for (const soldier of legacy.roster) delete soldier.threatMemory;

  squad.restoreState(legacy, new Map([[squad.id, squad]]));
  assert.equal(squad.roster[0].incomingFireTimer, incomingTimer);
  assert.deepEqual(
    squad.soldierAI.agents[0].threatMemory.captureState().records,
    []
  );

  const invalidFuture = squad.captureState();
  invalidFuture.roster[0].threatMemory.version = 3;
  assert.throws(
    () => squad.restoreState(invalidFuture, new Map([[squad.id, squad]])),
    /unsupported threat-memory version/
  );
});

test('dead and incapacitated soldiers do not record or consume threat memory', () => {
  for (const status of ['KIA', 'INCAPACITATED']) {
    const squad = makeSquad(`threat_memory_unavailable_${status}`);
    const agent = squad.soldierAI.agents[0];
    observe(agent.threatMemory, 'existing');
    agent.record.incomingFireTimer = 0;
    agent.suppression = 0;
    agent.status = status;
    if (status === 'KIA') agent.health = 0;
    agent.syncRecord();

    squad.soldierAI.update(1, coverTerrain);
    assert.doesNotMatch(
      agent.record.tacticalDecision.reason,
      /^threat-memory-/,
      status
    );
    const before = agent.threatMemory.captureState();
    assert.equal(
      before.clockSeconds,
      status === 'INCAPACITATED' ? 1 : 0,
      `${status} memory clock`
    );
    squad.registerIncomingFire(
      new THREE.Vector3(0, 1.2, 12),
      agent.position,
      { radius: 0.5, intensity: 1, projectileId: `${status}:new` }
    );
    assert.deepEqual(agent.threatMemory.captureState(), before);
  }
});

test('positive-health incapacitated soldiers passively expire memory without reacting', () => {
  const squad = makeSquad('threat_memory_incapacitated_expiry');
  const agent = squad.soldierAI.agents[0];
  observe(agent.threatMemory, 'existing');
  agent.status = 'INCAPACITATED';
  agent.health = 25;
  agent.record.incomingFireTimer = 0;
  agent.suppression = 0;
  agent.syncRecord();

  squad.soldierAI.update(DEFAULT_THREAT_MEMORY_POLICY.lifetimeSeconds, coverTerrain);

  assert.equal(agent.health, 25);
  assert.equal(agent.status, 'INCAPACITATED');
  assert.equal(agent.threatMemory.size, 0);
  assert.equal(
    agent.threatMemory.captureState().clockSeconds,
    DEFAULT_THREAT_MEMORY_POLICY.lifetimeSeconds
  );
  assert.doesNotMatch(
    agent.record.tacticalDecision.reason,
    /^threat-memory-/
  );
});

test('the policy remains explicitly labeled as a first-order gameplay approximation', () => {
  const state = new ThreatMemory().captureState();
  assert.equal(state.approximationLabel, THREAT_MEMORY_APPROXIMATION);
  assert.equal(state.lifetimeSeconds, 12);
  assert.equal(state.capacity, 4);
  assert.equal(state.scoreDecay, 'linear-to-zero');
});
