import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpottingSystem } from '../src/game/SpottingSystem.js';

const IDENTIFICATION_FIELDS = [
  'identificationProgress',
  'identificationTier',
  'identificationApproximationLabel'
];

function makeTerrain(obstacles = []) {
  return {
    bocageObstacles: obstacles,
    getHeightAt: () => 0
  };
}

function makeUnit({
  id,
  faction,
  x,
  z,
  people = 1,
  rosterOrder = null
}) {
  const ids = rosterOrder ?? Array.from({ length: people }, (_, index) => index);
  return {
    id,
    faction,
    type: 'infantry_squad',
    experience: 'Regular',
    morale: 'OK',
    stance: 'STANDING',
    suppression: 0,
    isHiding: false,
    moveSpeed: 0,
    position: new THREE.Vector3(x, 0, z),
    roster: ids.map(personId => ({
      id: personId,
      role: 'RIFLEMAN',
      status: 'OK',
      health: 100,
      velocity: [0, 0, 0]
    }))
  };
}

function makeSpotting(terrain = makeTerrain()) {
  return new SpottingSystem(null, terrain, {
    settings: {
      baseAcquisitionSeconds: 0.5,
      terrainSampleMeters: 2.5
    }
  });
}

function acquire(spotting, units) {
  spotting.advance(units, 4);
}

function precisionMatrix(spotting, units) {
  return units.map(observer => units.map(target =>
    spotting.hasDirectObservation(observer.id, target.id)
  ));
}

function removeFields(record, fields) {
  for (const field of fields) delete record[field];
}

function toLegacyState(snapshot, version) {
  const legacy = structuredClone(snapshot);
  legacy.version = version;
  if (version === 5) return legacy;
  for (const observation of legacy.observations) {
    delete observation.visibilityGraceRemainingNanoseconds;
  }
  if (version === 4) return legacy;
  for (const observation of legacy.observations) {
    removeFields(observation, IDENTIFICATION_FIELDS);
  }
  for (const episode of legacy.directObservationEpisodes) {
    removeFields(episode, IDENTIFICATION_FIELDS);
  }
  for (const entry of legacy.contacts) {
    removeFields(entry.contact, IDENTIFICATION_FIELDS);
    delete entry.contact.identificationEvaluatedAt;
  }
  legacy.relayQueue.version = 1;
  for (const report of legacy.relayQueue.pendingReports) {
    removeFields(report, IDENTIFICATION_FIELDS);
  }
  if (version === 3) return legacy;
  return {
    version,
    time: legacy.time,
    observations: legacy.observations.map(observation => {
      const copy = { ...observation };
      delete copy.directEpisodeSequence;
      delete copy.directEpisodeActive;
      delete copy.directEpisodeAcquiredAt;
      delete copy.directEpisodeSnapshot;
      return copy;
    }),
    contacts: legacy.contacts
  };
}

test('direct precision index collapses people to exact raw unit pairs', () => {
  const observer = makeUnit({
    id: 7,
    faction: 'blue',
    x: 0,
    z: 0,
    people: 3
  });
  const target = makeUnit({ id: 11, faction: 'red', x: 0, z: 35, people: 2 });
  const otherTarget = makeUnit({ id: 12, faction: 'red', x: 200, z: 200 });
  const spotting = makeSpotting();
  acquire(spotting, [observer, target, otherTarget]);

  assert.equal(spotting.hasDirectObservation(observer, target), true);
  assert.equal(spotting.canPrecisionTarget(observer.id, target.id), true);
  assert.equal(spotting.hasDirectObservation(observer, otherTarget), false);
  assert.equal(spotting.hasDirectObservation('7', target.id), false);
  assert.equal(spotting.hasDirectObservation(observer.id, '11'), false);
  assert.deepEqual(spotting.getPrecisionDiagnostics(), {
    queries: 5,
    hits: 2,
    observerLookups: 5,
    targetMembershipLookups: 4,
    rebuilds: 1,
    advanceRebuilds: 1,
    restoreRebuilds: 0,
    restoreObservationRowsVisited: 0,
    indexedObserverUnitCount: 2,
    indexedPairCount: 2
  });
});

test('precision queries are uncaptured O(1) membership checks', () => {
  const observers = Array.from({ length: 12 }, (_, index) => makeUnit({
    id: `blue-${index}`,
    faction: 'blue',
    x: index * 0.2,
    z: 0,
    people: 8
  }));
  const target = makeUnit({ id: 'red', faction: 'red', x: 0, z: 30 });
  const units = [...observers, target];
  const spotting = makeSpotting();
  acquire(spotting, units);
  const capturedBefore = spotting.captureState();
  const before = spotting.getPrecisionDiagnostics();

  for (let index = 0; index < 500; index++) {
    assert.equal(
      spotting.hasDirectObservation(observers[index % observers.length], target),
      true
    );
    assert.equal(
      spotting.hasDirectObservation(observers[index % observers.length], 'missing'),
      false
    );
  }

  const after = spotting.getPrecisionDiagnostics();
  assert.equal(after.queries - before.queries, 1000);
  assert.equal(after.observerLookups - before.observerLookups, 1000);
  assert.equal(after.targetMembershipLookups - before.targetMembershipLookups, 1000);
  assert.equal(after.hits - before.hits, 500);
  assert.equal(after.rebuilds, before.rebuilds);
  assert.equal(
    after.restoreObservationRowsVisited,
    before.restoreObservationRowsVisited
  );
  assert.deepEqual(spotting.captureState(), capturedBefore);

  after.queries = -1;
  after.indexedPairCount = -1;
  assert.notEqual(spotting.getPrecisionDiagnostics().queries, -1);
  assert.notEqual(spotting.getPrecisionDiagnostics().indexedPairCount, -1);
});

test('render grace and stale contacts never grant indexed precision', () => {
  const wall = {
    minX: -2,
    maxX: 2,
    minZ: 10,
    maxZ: 12,
    height: 4,
    type: 'wall'
  };
  const terrain = makeTerrain();
  const observer = makeUnit({ id: 'observer', faction: 'blue', x: 0, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 35 });
  const units = [observer, target];
  const spotting = makeSpotting(terrain);
  acquire(spotting, units);
  terrain.bocageObstacles.push(wall);
  spotting.advance(units, 1 / 60);

  assert.equal(spotting.hasDirectObservation(observer, target), false);
  assert.equal(spotting.canPrecisionTarget(observer, target), false);
  assert.equal(spotting.hasContact(observer, target), true);
  assert.equal(
    spotting.getVisibilityProjection(observer.faction, units)
      .visibleUnitIds.includes(target.id),
    true
  );
  assert.equal(spotting.getPrecisionDiagnostics().indexedPairCount, 0);
});

test('precision pair lifecycle changes only on authoritative advance', () => {
  const observer = makeUnit({
    id: 'observer',
    faction: 'blue',
    x: 0,
    z: 0,
    people: 2
  });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 35, people: 2 });
  const spotting = makeSpotting();
  acquire(spotting, [observer, target]);

  observer.roster[0].status = 'KIA';
  observer.roster[0].health = 0;
  assert.equal(spotting.hasDirectObservation(observer, target), true);
  spotting.advance([observer, target], 0);
  assert.equal(spotting.hasDirectObservation(observer, target), true);

  observer.roster[1].status = 'INCAPACITATED';
  observer.roster[1].health = 0;
  assert.equal(spotting.hasDirectObservation(observer, target), true);
  spotting.advance([observer, target], 0);
  assert.equal(spotting.hasDirectObservation(observer, target), false);

  observer.roster[1].status = 'OK';
  observer.roster[1].health = 100;
  acquire(spotting, [observer, target]);
  observer.morale = 'Broken';
  assert.equal(spotting.hasDirectObservation(observer, target), true);
  spotting.advance([observer, target], 0);
  assert.equal(spotting.hasDirectObservation(observer, target), false);

  observer.morale = 'OK';
  acquire(spotting, [observer, target]);
  assert.equal(spotting.hasDirectObservation(observer, target), true);
  spotting.advance([observer], 0);
  assert.equal(spotting.hasDirectObservation(observer, target), false);

  const splitSource = { ...observer, id: 'observer-split' };
  const splitTarget = { ...target, id: 'target-split' };
  assert.equal(spotting.hasDirectObservation(splitSource, target), false);
  assert.equal(spotting.hasDirectObservation(observer, splitTarget), false);
  acquire(spotting, [splitSource, splitTarget]);
  assert.equal(spotting.hasDirectObservation(splitSource, splitTarget), true);
  assert.equal(spotting.hasDirectObservation(observer, target), false);
});

test('target-person changes preserve the unit-pair gate when another person is visible', () => {
  const observer = makeUnit({ id: 'observer', faction: 'blue', x: 0, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 35, people: 2 });
  const spotting = makeSpotting();
  acquire(spotting, [observer, target]);
  const observedPersonId = spotting
    .getObservation(observer.id, observer.roster[0].id, target.id)
    .lastSeenTargetSoldierId;
  const observedPerson = target.roster.find(person => person.id === observedPersonId);
  observedPerson.status = 'KIA';
  observedPerson.health = 0;
  spotting.advance([observer, target], 4);

  assert.equal(spotting.hasDirectObservation(observer, target), true);
  assert.notEqual(
    spotting.getObservation(observer.id, observer.roster[0].id, target.id)
      .lastSeenTargetSoldierId,
    observedPersonId
  );
});

test('restore rebuilds v1-v5 precision immediately without capturing the index', () => {
  const observer = makeUnit({ id: 'observer', faction: 'blue', x: 0, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 35 });
  const source = makeSpotting();
  acquire(source, [observer, target]);
  const snapshot = source.captureState();
  assert.equal('precisionIndex' in snapshot, false);
  assert.equal('precisionDiagnostics' in snapshot, false);

  for (const version of [1, 2, 3, 4, 5]) {
    const restored = makeSpotting();
    restored.restoreState(toLegacyState(snapshot, version));
    assert.equal(
      restored.hasDirectObservation(observer, target),
      true,
      `version ${version} must rebuild a visible pair before advance`
    );
    const diagnostics = restored.getPrecisionDiagnostics();
    assert.equal(diagnostics.rebuilds, 1);
    assert.equal(diagnostics.restoreRebuilds, 1);
    assert.equal(
      diagnostics.restoreObservationRowsVisited,
      restored.captureState().observations.length
    );
    assert.equal('precisionIndex' in restored.captureState(), false);
    assert.equal('precisionDiagnostics' in restored.captureState(), false);
  }
});

test('step partitions and input order keep capture, projection, and precision identical', () => {
  const createFixture = rosterOrder => {
    const observer = makeUnit({
      id: 'observer',
      faction: 'blue',
      x: 0,
      z: 0,
      people: 3,
      rosterOrder
    });
    const target = makeUnit({
      id: 'target',
      faction: 'red',
      x: 0,
      z: 35,
      people: 3,
      rosterOrder
    });
    return { spotting: makeSpotting(), units: [observer, target] };
  };
  const whole = createFixture([0, 1, 2]);
  const thirty = createFixture([2, 1, 0]);
  const sixty = createFixture([2, 1, 0]);
  whole.spotting.advance(whole.units, 4);
  for (let index = 0; index < 120; index++) {
    thirty.spotting.advance(
      index % 2 ? thirty.units : [...thirty.units].reverse(),
      1 / 30
    );
  }
  for (let index = 0; index < 240; index++) {
    sixty.spotting.advance(
      index % 2 ? sixty.units : [...sixty.units].reverse(),
      1 / 60
    );
  }

  for (const fixture of [thirty, sixty]) {
    assert.deepEqual(fixture.spotting.captureState(), whole.spotting.captureState());
    assert.deepEqual(
      fixture.spotting.getVisibilityProjection('blue', fixture.units),
      whole.spotting.getVisibilityProjection('blue', whole.units)
    );
    assert.deepEqual(
      precisionMatrix(fixture.spotting, fixture.units),
      precisionMatrix(whole.spotting, whole.units)
    );
  }
});
