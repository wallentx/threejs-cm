import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainBuilder } from './helpers/France1940TestTerrain.js';
import { SpottingSystem } from '../src/game/SpottingSystem.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';

function createTerrain() {
  return new TerrainBuilder(new THREE.Scene(), {
    mapDescriptor: STONNE_1940_MAP
  });
}

test('Bridge publishes one stable immutable sight snapshot in authored order', () => {
  const terrain = createTerrain();
  terrain.buildStoneWalls();

  const snapshot = terrain.getSightOccluderSnapshot();
  const again = terrain.getSightOccluderSnapshot();
  const expected = terrain.bocageObstacles
    .filter(record => !record.buildingId && record.occludesSight !== false)
    .map(record => record.id);

  assert.equal(snapshot, again);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.records));
  assert.ok(snapshot.records.every(Object.isFrozen));
  assert.equal(snapshot.records.length, 25);
  assert.deepEqual(snapshot.records.map(record => record.id), expected);
  assert.deepEqual(
    [...new Set(snapshot.records.map(record => record.sightRunId))],
    [
      'village_house_rear',
      'village_house_west',
      'village_house_east',
      'village_house_front_west',
      'village_house_front_east'
    ]
  );
  assert.throws(() => snapshot.records.push({}), TypeError);
  assert.throws(() => {
    snapshot.records[0].type = 'mutated';
  }, TypeError);
  assert.equal(terrain.getSightOccluderSnapshot(), snapshot);
});

test('Spotting derives five stable runs from the real Bridge snapshot once', () => {
  const terrain = createTerrain();
  terrain.buildStoneWalls();
  const spotting = new SpottingSystem(null, terrain, {
    settings: { terrainSampleMeters: 1000 }
  });
  const start = { x: 500, y: 10, z: 500 };
  const end = { x: 500, y: 10, z: 550 };

  for (let query = 0; query < 4; query++) {
    assert.equal(spotting.checkLOS(start, end, {
      fromEyeHeight: 0,
      toAimHeight: 0
    }).clear, true);
  }

  const diagnostics = spotting.getTerrainLosDiagnostics();
  assert.equal(diagnostics.terrainRunCount, 5);
  assert.equal(diagnostics.terrainOccluderCount, 25);
  assert.equal(diagnostics.terrainSnapshotRevision, 1);
  assert.equal(diagnostics.terrainSnapshotRefreshes, 1);
});

test('routed additions, destruction, and batched restore publish one revision each', () => {
  const terrain = createTerrain();
  terrain.buildStoneWalls();
  const initial = terrain.getSightOccluderSnapshot();

  terrain.addBocageObstacle({
    id: 'editor:last',
    minX: -1,
    maxX: 1,
    minZ: -1,
    maxZ: 1,
    height: 3,
    type: 'bocage'
  });
  const edited = terrain.getSightOccluderSnapshot();
  assert.equal(edited.revision, initial.revision + 1);
  assert.equal(edited.records.at(-1).id, 'editor:last');

  const intact = terrain.captureDestructibleObstacleState();
  const fence = terrain.fenceCardRuns[0];
  const colliderId = `wall:${fence.userData.runId}:0`;
  terrain.applyVehicleImpactToLinearObstacle({
    colliderId,
    massTonnes: 10,
    speedMetersPerSecond: 0.5,
    vehicleId: 'test-tank'
  });
  const destroyed = terrain.getSightOccluderSnapshot();
  assert.equal(destroyed.revision, edited.revision + 1);

  terrain.restoreDestructibleObstacleState(intact);
  const restored = terrain.getSightOccluderSnapshot();
  assert.equal(restored.revision, destroyed.revision + 1);
  assert.equal(
    terrain.bocageObstacles.some(record => record.id === `${fence.userData.runId}_0`),
    true
  );
  assert.deepEqual(
    restored.records.map(record => record.id),
    terrain.bocageObstacles
      .filter(record => !record.buildingId && record.occludesSight !== false)
      .map(record => record.id)
  );
});

test('building-only collision replacement does not republish terrain sight', () => {
  const terrain = createTerrain();
  terrain.buildStoneWalls();
  const before = terrain.getSightOccluderSnapshot();

  terrain.replaceBuildingCollisionRecords('house', [{
    id: 'house:ground-shell',
    buildingId: 'house',
    sectionId: 'ground-shell',
    centerX: 0,
    centerZ: 0,
    halfX: 2,
    halfZ: 2,
    minY: 0,
    maxY: 3,
    rotation: 0,
    blocks: ['infantry', 'projectile']
  }], 0, 3);

  assert.equal(terrain.getSightOccluderSnapshot(), before);
});
