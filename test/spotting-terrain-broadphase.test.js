import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpottingSystem } from '../src/game/SpottingSystem.js';

function frozenSnapshot(revision, records) {
  return Object.freeze({
    revision,
    records: Object.freeze(records.map(record => Object.freeze({ ...record })))
  });
}

function snapshotTerrain(initialRecords) {
  let current = frozenSnapshot(1, initialRecords);
  return {
    bocageObstacles: initialRecords,
    getHeightAt: () => -100,
    getSightOccluderSnapshot: () => current,
    replace(revision, records) {
      current = frozenSnapshot(revision, records);
    }
  };
}

function box({
  id,
  sightRunId,
  minX,
  maxX,
  minZ,
  maxZ,
  type = id,
  minY = 0,
  maxY = 4
}) {
  return { id, sightRunId, minX, maxX, minZ, maxZ, minY, maxY, type };
}

function spottingFor(terrain) {
  return new SpottingSystem(null, terrain, {
    settings: { terrainSampleMeters: 1000 }
  });
}

function check(spotting, start = { x: 0, y: 1, z: 0 }, end = { x: 0, y: 1, z: 40 }) {
  return spotting.checkLOS(start, end, {
    fromEyeHeight: 0,
    toAimHeight: 0
  });
}

function unit(id, faction, z) {
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
    position: new THREE.Vector3(0, 0, z),
    roster: [{
      id: 0,
      role: 'RIFLEMAN',
      status: 'OK',
      health: 100,
      velocity: [0, 0, 0]
    }]
  };
}

function precisionMatrix(spotting, units) {
  return units.map(observer => units.map(target =>
    spotting.hasDirectObservation(observer.id, target.id)
  ));
}

test('definite run misses avoid exact tests while a run-union gap stays non-authoritative', () => {
  const terrain = snapshotTerrain([
    box({ id: 'left', sightRunId: 'gap', minX: -10, maxX: -8, minZ: 10, maxZ: 12 }),
    box({ id: 'right', sightRunId: 'gap', minX: 8, maxX: 10, minZ: 10, maxZ: 12 }),
    box({ id: 'far-a', sightRunId: 'far', minX: 50, maxX: 52, minZ: 10, maxZ: 12 }),
    box({ id: 'far-b', sightRunId: 'far', minX: 50, maxX: 52, minZ: 20, maxZ: 22 })
  ]);
  const spotting = spottingFor(terrain);

  assert.equal(check(spotting).clear, true);
  assert.deepEqual(spotting.getTerrainLosDiagnostics(), {
    terrainSnapshotRefreshes: 1,
    terrainBroadphaseTests: 2,
    terrainBroadphaseRejects: 1,
    terrainExactBoxTests: 2,
    terrainExactBoxTestsAvoided: 2,
    terrainLegacyQueries: 0,
    terrainSnapshotRevision: 1,
    terrainOccluderCount: 4,
    terrainRunCount: 2
  });
});

test('run traversal retains exact first insertion-order cover semantics', () => {
  const first = box({
    id: 'first', sightRunId: 'a', minX: -1, maxX: 1, minZ: 20, maxZ: 22,
    type: 'first-cover'
  });
  const nearer = box({
    id: 'nearer', sightRunId: 'b', minX: -1, maxX: 1, minZ: 5, maxZ: 7,
    type: 'nearer-cover'
  });
  const terrain = snapshotTerrain([first, nearer]);
  const spotting = spottingFor(terrain);

  assert.equal(check(spotting).coverType, 'first-cover');
  terrain.replace(2, [nearer, first]);
  assert.equal(check(spotting).coverType, 'nearer-cover');
  assert.equal(spotting.getTerrainLosDiagnostics().terrainSnapshotRefreshes, 2);
});

test('non-contiguous equal run IDs stay separate and malformed bounds fail open', () => {
  const malformed = box({
    id: 'malformed', sightRunId: 'same', minX: Number.NaN, maxX: 1,
    minZ: 10, maxZ: 12, type: 'malformed-cover'
  });
  const terrain = snapshotTerrain([
    box({ id: 'same-a', sightRunId: 'same', minX: 20, maxX: 22, minZ: 2, maxZ: 4 }),
    box({ id: 'middle', minX: 20, maxX: 22, minZ: 5, maxZ: 7 }),
    malformed
  ]);
  const spotting = spottingFor(terrain);

  assert.equal(check(spotting).coverType, 'malformed-cover');
  const diagnostics = spotting.getTerrainLosDiagnostics();
  assert.equal(diagnostics.terrainRunCount, 3);
  assert.equal(diagnostics.terrainBroadphaseRejects, 2);
  assert.equal(diagnostics.terrainExactBoxTests, 1);
});

test('legacy mutable terrain observes push, pop, replacement, and clear immediately', () => {
  const obstacles = [];
  const terrain = { bocageObstacles: obstacles, getHeightAt: () => -100 };
  const spotting = spottingFor(terrain);
  const first = box({ id: 'first', minX: -1, maxX: 1, minZ: 15, maxZ: 17, type: 'first' });
  const second = box({ id: 'second', minX: -1, maxX: 1, minZ: 5, maxZ: 7, type: 'second' });
  const replacement = box({
    id: 'replacement', minX: -1, maxX: 1, minZ: 10, maxZ: 12,
    type: 'replacement'
  });
  const miss = box({ id: 'miss', minX: 20, maxX: 22, minZ: 5, maxZ: 7 });

  obstacles.push(miss, second);
  assert.equal(check(spotting).coverType, 'second');
  assert.equal(obstacles.pop(), second);
  assert.equal(check(spotting).clear, true);
  obstacles.push(first, second);
  assert.equal(check(spotting).coverType, 'first');
  obstacles.shift();
  assert.equal(check(spotting).coverType, 'first');
  obstacles[0] = replacement;
  assert.equal(check(spotting).coverType, 'replacement');
  obstacles.length = 0;
  assert.equal(check(spotting).clear, true);
  assert.equal(spotting.getTerrainLosDiagnostics().terrainLegacyQueries, 6);
});

test('optimized terrain preserves capture, projection, and precision across partitions and input order', () => {
  const records = [
    box({ id: 'miss-a', sightRunId: 'miss', minX: 20, maxX: 22, minZ: 5, maxZ: 7 }),
    box({ id: 'miss-b', sightRunId: 'miss', minX: 20, maxX: 22, minZ: 8, maxZ: 10 })
  ];
  const make = optimized => {
    const terrain = optimized
      ? snapshotTerrain(records)
      : { bocageObstacles: records, getHeightAt: () => -100 };
    const spotting = spottingFor(terrain);
    const units = [unit('observer', 'blue', 0), unit('target', 'red', 35)];
    return { spotting, units };
  };
  const run = ({ optimized = true, frequency = 1, reorder = () => false }) => {
    const fixture = make(optimized);
    for (let index = 0; index < frequency; index++) {
      const input = reorder(index)
        ? [...fixture.units].reverse()
        : fixture.units;
      fixture.spotting.advance(input, 1 / frequency);
    }
    return {
      fixture,
      observable: {
        capture: fixture.spotting.captureState(),
        projection: fixture.spotting.getVisibilityProjection(
          'blue',
          fixture.units
        ),
        precision: precisionMatrix(fixture.spotting, fixture.units)
      }
    };
  };
  const whole = run({});
  const variants = [
    run({ frequency: 30 }),
    run({ frequency: 60 }),
    run({ reorder: () => true }),
    run({ frequency: 30, reorder: index => index % 2 === 0 }),
    run({ frequency: 60, reorder: () => true }),
    run({ optimized: false })
  ];

  for (const variant of variants) {
    assert.deepEqual(variant.observable, whole.observable);
  }

  const capture = whole.observable.capture;
  assert.equal('terrainSnapshotRevision' in capture, false);
  const diagnostics = whole.fixture.spotting.getTerrainLosDiagnostics();
  diagnostics.terrainRunCount = 999;
  assert.notEqual(
    whole.fixture.spotting.getTerrainLosDiagnostics().terrainRunCount,
    999
  );
});
