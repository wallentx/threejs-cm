import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  TerrainBuilder,
  createGroundConformingWallGeometry
} from '../src/world/TerrainBuilder.js';
import { TERRAIN_SCALE } from '../src/world/TerrainScale.js';

const EPSILON = 1e-5;

function assertNear(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function inspectClosedTriangleSoup(geometry) {
  const positions = geometry.attributes.position;
  const keys = [];
  const uniqueVertices = new Map();
  for (let index = 0; index < positions.count; index++) {
    const vertex = new THREE.Vector3().fromBufferAttribute(positions, index);
    const key = [vertex.x, vertex.y, vertex.z]
      .map(value => value.toFixed(5))
      .join(',');
    keys.push(key);
    if (!uniqueVertices.has(key)) uniqueVertices.set(key, vertex);
  }
  const center = [...uniqueVertices.values()]
    .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
    .multiplyScalar(1 / uniqueVertices.size);
  const edgeCounts = new Map();
  let signedVolume = 0;
  let minimumOutwardDot = Infinity;

  for (let index = 0; index < positions.count; index += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, index);
    const b = new THREE.Vector3().fromBufferAttribute(positions, index + 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, index + 2);
    signedVolume += a.dot(b.clone().cross(c)) / 6;
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const triangleCenter = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    minimumOutwardDot = Math.min(
      minimumOutwardDot,
      normal.dot(triangleCenter.sub(center))
    );

    for (const [from, to] of [
      [keys[index], keys[index + 1]],
      [keys[index + 1], keys[index + 2]],
      [keys[index + 2], keys[index]]
    ]) {
      const edgeKey = from < to ? `${from}|${to}` : `${to}|${from}`;
      edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1);
    }
  }
  return { signedVolume, minimumOutwardDot, edgeCounts };
}

test('terrain scale uses metres and plausible human-relative dimensions', () => {
  assert.ok(
    TERRAIN_SCALE.infantryReferenceHeight >= 1.7
      && TERRAIN_SCALE.infantryReferenceHeight <= 1.9
  );
  assert.ok(TERRAIN_SCALE.stoneWall.height >= 1);
  assert.ok(TERRAIN_SCALE.stoneWall.height <= 1.3);
  assert.ok(TERRAIN_SCALE.stoneWall.thickness >= 0.5);
  assert.ok(TERRAIN_SCALE.stoneWall.thickness <= 0.8);
  assert.ok(TERRAIN_SCALE.house.eavesHeight <= 7);
  assert.ok(TERRAIN_SCALE.bridge.roadwayWidth >= 5.5);
  assert.ok(TERRAIN_SCALE.bridge.roadwayWidth <= 7.5);
  assert.equal(
    TERRAIN_SCALE.river.cutWidth,
    TERRAIN_SCALE.river.waterWidth + TERRAIN_SCALE.river.bankWidth * 2
  );
  assert.ok(TERRAIN_SCALE.river.bedLevel < TERRAIN_SCALE.river.waterLevel);
  assert.ok(TERRAIN_SCALE.river.bridgeSpan > TERRAIN_SCALE.river.cutWidth);
});

test('wall geometry is grounded, manifold, and outward-wound', () => {
  const getHeightAt = (x, z) => x * 0.12 - z * 0.05;
  const geometry = createGroundConformingWallGeometry({
    start: { x: -2, z: 1 },
    end: { x: 3, z: 4 },
    height: TERRAIN_SCALE.stoneWall.height,
    thickness: TERRAIN_SCALE.stoneWall.thickness,
    getHeightAt
  });

  assert.equal(geometry.attributes.position.count, 36);
  assert.equal(geometry.attributes.normal.count, 36);
  assert.equal(geometry.attributes.uv.count, 36);
  assert.equal(geometry.userData.footprintCorners.length, 4);
  for (const [x, y, z] of geometry.userData.footprintCorners) {
    assertNear(y, getHeightAt(x, z), 'wall footprint must touch terrain');
  }
  assert.ok(geometry.boundingBox.max.y > geometry.boundingBox.min.y);
  const inspection = inspectClosedTriangleSoup(geometry);
  assert.ok(inspection.signedVolume > 0, 'wall must have positive signed volume');
  assert.ok(
    inspection.minimumOutwardDot > 0,
    'every wall triangle must face away from solid center'
  );
  assert.ok(
    [...inspection.edgeCounts.values()].every(count => count === 2),
    'every canonical wall edge must have exactly two incident triangles'
  );
});

test('stone wall runs use contiguous grounded segments and matching collisions', () => {
  const scene = new THREE.Scene();
  const terrain = new TerrainBuilder(scene);
  terrain.buildStoneWalls();

  const expectedSegmentsPerRun = Math.ceil(
    70 / TERRAIN_SCALE.stoneWall.maximumSegmentLength
  );
  assert.equal(terrain.stoneWallSegments.length, expectedSegmentsPerRun * 4);

  const wallObstacles = terrain.bocageObstacles.filter(
    obstacle => obstacle.type === 'stonewall'
  );
  assert.equal(wallObstacles.length, terrain.stoneWallSegments.length);

  const runs = new Map();
  for (const wall of terrain.stoneWallSegments) {
    const run = runs.get(wall.userData.runId) ?? [];
    run.push(wall);
    runs.set(wall.userData.runId, run);

    const dimensions = wall.userData.dimensionsMeters;
    assert.ok(dimensions.length <= TERRAIN_SCALE.stoneWall.maximumSegmentLength);
    assert.equal(dimensions.height, TERRAIN_SCALE.stoneWall.height);
    assert.equal(dimensions.thickness, TERRAIN_SCALE.stoneWall.thickness);

    for (const [x, y, z] of wall.geometry.userData.footprintCorners) {
      assertNear(y, terrain.getHeightAt(x, z), 'rendered corner grounding');
    }

    const obstacle = wallObstacles.find(
      candidate => candidate.id
        === `${wall.userData.runId}_${wall.userData.segmentIndex}`
    );
    assert.ok(obstacle, 'wall segment must own a collision record');
    assertNear(obstacle.minX, wall.geometry.boundingBox.min.x, 'collision minX');
    assertNear(obstacle.maxX, wall.geometry.boundingBox.max.x, 'collision maxX');
    assertNear(obstacle.minY, wall.geometry.boundingBox.min.y, 'collision minY');
    assertNear(obstacle.maxY, wall.geometry.boundingBox.max.y, 'collision maxY');
    assertNear(obstacle.minZ, wall.geometry.boundingBox.min.z, 'collision minZ');
    assertNear(obstacle.maxZ, wall.geometry.boundingBox.max.z, 'collision maxZ');
  }

  assert.equal(runs.size, 4);
  for (const segments of runs.values()) {
    segments.sort((a, b) => a.userData.segmentIndex - b.userData.segmentIndex);
    for (let index = 1; index < segments.length; index++) {
      const previousEnd = new THREE.Vector3().fromArray(
        segments[index - 1].userData.end
      );
      const currentStart = new THREE.Vector3().fromArray(
        segments[index].userData.start
      );
      assert.ok(
        previousEnd.distanceTo(currentStart) <= EPSILON,
        'adjacent wall centerlines must not gap'
      );
    }
  }
});

test('river bed remains below visible water and bridge reaches connected banks', () => {
  const scene = new THREE.Scene();
  const terrain = new TerrainBuilder(scene);
  const { river } = TERRAIN_SCALE;
  const waterHalfWidth = river.waterWidth * 0.5;
  const cutHalfWidth = river.cutWidth * 0.5;

  for (const x of [-120, -60, 0, 60, 120]) {
    for (const z of [
      river.centerZ - waterHalfWidth,
      river.centerZ,
      river.centerZ + waterHalfWidth
    ]) {
      assertNear(terrain.getHeightAt(x, z), river.bedLevel, 'river bed level');
      assert.ok(
        terrain.getHeightAt(x, z) < river.waterLevel,
        'water surface must remain above bed across map width'
      );
    }
    for (const direction of [-1, 1]) {
      const bankEdge = river.centerZ + direction * cutHalfWidth;
      assertNear(
        terrain.getHeightAt(x, bankEdge),
        terrain.getOpenGroundHeightAt(x, bankEdge),
        'river cut must reconnect to open terrain'
      );
      assert.ok(
        Math.abs(
          terrain.getHeightAt(x, bankEdge - direction * 0.001)
            - terrain.getHeightAt(x, bankEdge + direction * 0.001)
        ) < 0.01,
        'river bank transition must remain continuous'
      );
    }
  }

  terrain.buildRiverAndBridge();
  const water = scene.getObjectByName('RiverWater');
  const bridge = scene.getObjectByName('StoneBridge');
  water.geometry.computeBoundingBox();
  assertNear(
    water.geometry.boundingBox.max.z - water.geometry.boundingBox.min.z,
    river.waterWidth,
    'rendered water width'
  );
  assert.equal(water.position.z, river.centerZ);
  assert.ok(
    river.bridgeSpan * 0.5 > cutHalfWidth,
    'bridge deck ends must extend beyond both cut banks'
  );
  assert.equal(bridge.userData.dimensionsMeters.length, river.bridgeSpan);
});

test('bridge and house meshes expose calibrated metre dimensions', () => {
  const scene = new THREE.Scene();
  const terrain = new TerrainBuilder(scene);
  terrain.buildRiverAndBridge();
  terrain.buildFrenchVillage();

  const bridge = scene.getObjectByName('StoneBridge');
  const house = scene.getObjectByName('FrenchVillageHouse');
  assert.deepEqual(bridge.userData.dimensionsMeters, {
    width: TERRAIN_SCALE.bridge.roadwayWidth,
    length: TERRAIN_SCALE.river.bridgeSpan,
    deckTop: bridge.userData.dimensionsMeters.deckTop
  });
  assert.deepEqual(house.userData.dimensionsMeters, {
    width: TERRAIN_SCALE.house.width,
    depth: TERRAIN_SCALE.house.depth,
    height: TERRAIN_SCALE.house.eavesHeight + TERRAIN_SCALE.house.roofHeight
  });
  const roof = house.getObjectByName('HouseGabledRoof');
  assert.ok(roof, 'house must use a dimensioned gabled roof');
  const roofPositions = roof.geometry.attributes.position;
  for (let index = 0; index < roofPositions.count; index += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(roofPositions, index);
    const b = new THREE.Vector3().fromBufferAttribute(roofPositions, index + 1);
    const c = new THREE.Vector3().fromBufferAttribute(roofPositions, index + 2);
    const areaVector = b.clone().sub(a).cross(c.clone().sub(a));
    assert.ok(areaVector.lengthSq() > EPSILON, 'roof triangles must not degenerate');
  }
  const foundation = house.getObjectByName('HouseFoundation');
  assert.ok(foundation, 'house must have a terrain-conforming foundation');
  const foundationCorners = foundation.geometry.userData.worldFootprintCorners;
  assert.equal(foundationCorners.length, 4);
  for (const [x, y, z] of foundationCorners) {
    assertNear(y, terrain.getHeightAt(x, z), 'foundation corner grounding');
  }
  assert.equal(
    house.position.y,
    foundation.geometry.userData.topY,
    'house superstructure must sit on level foundation top'
  );

  const buildingObstacle = terrain.bocageObstacles.find(
    obstacle => obstacle.type === 'building'
  );
  assert.equal(
    buildingObstacle.maxX - buildingObstacle.minX,
    TERRAIN_SCALE.house.width
  );
  assert.equal(
    buildingObstacle.maxZ - buildingObstacle.minZ,
    TERRAIN_SCALE.house.depth
  );
  assertNear(
    buildingObstacle.minY,
    Math.min(...foundationCorners.map(([, y]) => y)),
    'building collision bottom'
  );
  assertNear(
    buildingObstacle.maxY,
    house.position.y + TERRAIN_SCALE.house.eavesHeight + TERRAIN_SCALE.house.roofHeight,
    'building collision top'
  );

  const parapet = bridge.getObjectByName('BridgeParapet');
  const parapetUvs = parapet.geometry.attributes.uv;
  let minimumUv = Infinity;
  let maximumUv = -Infinity;
  for (let index = 0; index < parapetUvs.count; index++) {
    minimumUv = Math.min(minimumUv, parapetUvs.getX(index), parapetUvs.getY(index));
    maximumUv = Math.max(maximumUv, parapetUvs.getX(index), parapetUvs.getY(index));
  }
  assert.equal(
    parapet.geometry.userData.metresPerUvRepeat,
    TERRAIN_SCALE.bridge.masonryRepeatMeters
  );
  assert.ok(
    maximumUv - minimumUv
      >= TERRAIN_SCALE.river.bridgeSpan / TERRAIN_SCALE.bridge.masonryRepeatMeters,
    'bridge masonry must repeat by metre scale along full span'
  );
});
