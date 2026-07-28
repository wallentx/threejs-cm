import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  TerrainBuilder,
  createGroundConformingWallGeometry
} from './helpers/France1940TestTerrain.js';
import { TERRAIN_SCALE } from '../src/world/TerrainScale.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { FR_FARMHOUSE_8X6_1F } from '../src/maps/france/FranceFarmhouse8x6_1F.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import {
  createFrenchHouseVisualAdapter
} from '../src/world/buildings/FrenchHouse.js';

const EPSILON = 1e-5;
const STRUCTURE_ADAPTERS = Object.freeze({
  [FR_HOUSE_12X9_2F.id]: createFrenchHouseVisualAdapter(FR_HOUSE_12X9_2F),
  [FR_FARMHOUSE_8X6_1F.id]:
    createFrenchHouseVisualAdapter(FR_FARMHOUSE_8X6_1F)
});

function createTerrain(scene) {
  const buildingSystem = new BuildingSystem();
  buildingSystem.registerDescriptor(FR_HOUSE_12X9_2F);
  buildingSystem.registerDescriptor(FR_FARMHOUSE_8X6_1F);
  return new TerrainBuilder(scene, {
    mapDescriptor: STONNE_1940_MAP,
    buildingSystem,
    structureAdapters: STRUCTURE_ADAPTERS
  });
}

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
  assert.ok(STONNE_1940_MAP.river.cutWidth > STONNE_1940_MAP.river.waterWidth);
  assert.ok(STONNE_1940_MAP.river.bedLevel < STONNE_1940_MAP.river.waterLevel);
  assert.ok(STONNE_1940_MAP.bridge.span > STONNE_1940_MAP.river.cutWidth);
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
  const terrain = createTerrain(scene);
  terrain.buildStoneWalls();

  const expectedSegmentCount = STONNE_1940_MAP.wallRuns.reduce(
    (sum, run) => sum + Math.ceil(
      Math.hypot(run.end[0] - run.start[0], run.end[1] - run.start[1])
        / TERRAIN_SCALE.stoneWall.maximumSegmentLength
    ),
    0
  );
  assert.equal(terrain.stoneWallSegments.length, expectedSegmentCount);

  const wallObstacles = terrain.bocageObstacles.filter(
    obstacle => obstacle.type === 'stonewall'
  );
  assert.equal(wallObstacles.length, terrain.stoneWallSegments.length);

  const runs = new Map();
  for (const wall of terrain.stoneWallSegments) {
    const run = runs.get(wall.userData.runId) ?? [];
    run.push(wall);
    runs.set(wall.userData.runId, run);

    const sourceRun = STONNE_1940_MAP.wallRuns.find(
      candidate => candidate.id === wall.userData.runId
    );
    assert.equal(wall.userData.enclosureId, sourceRun.enclosureId);
    assert.equal(wall.userData.boundarySide, sourceRun.boundarySide);
    assert.equal(wall.userData.adjacentGateId, sourceRun.adjacentGateId ?? null);

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
    assert.equal(obstacle.enclosureId, sourceRun.enclosureId);
    assert.equal(obstacle.adjacentGateId, sourceRun.adjacentGateId ?? null);
    assertNear(obstacle.minX, wall.geometry.boundingBox.min.x, 'collision minX');
    assertNear(obstacle.maxX, wall.geometry.boundingBox.max.x, 'collision maxX');
    assertNear(obstacle.minY, wall.geometry.boundingBox.min.y, 'collision minY');
    assertNear(obstacle.maxY, wall.geometry.boundingBox.max.y, 'collision maxY');
    assertNear(obstacle.minZ, wall.geometry.boundingBox.min.z, 'collision minZ');
    assertNear(obstacle.maxZ, wall.geometry.boundingBox.max.z, 'collision maxZ');
  }

  assert.equal(runs.size, STONNE_1940_MAP.wallRuns.length);
  for (const sourceRun of STONNE_1940_MAP.wallRuns) {
    const segments = runs.get(sourceRun.id);
    const runLength = Math.hypot(
      sourceRun.end[0] - sourceRun.start[0],
      sourceRun.end[1] - sourceRun.start[1]
    );
    assert.equal(
      segments.length,
      Math.ceil(runLength / TERRAIN_SCALE.stoneWall.maximumSegmentLength)
    );
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

test('stone walls form gated lots around authored buildings instead of map-spanning barriers', () => {
  const descriptors = new Map([
    [FR_HOUSE_12X9_2F.id, FR_HOUSE_12X9_2F],
    [FR_FARMHOUSE_8X6_1F.id, FR_FARMHOUSE_8X6_1F]
  ]);
  const structures = new Map(
    STONNE_1940_MAP.structures.map(structure => [structure.id, structure])
  );
  const distance = (start, end) => Math.hypot(
    end[0] - start[0],
    end[1] - start[1]
  );
  const samePoint = (left, right) => (
    Math.abs(left[0] - right[0]) <= EPSILON
    && Math.abs(left[1] - right[1]) <= EPSILON
  );

  assert.ok(
    STONNE_1940_MAP.wallRuns.every(run => distance(run.start, run.end) <= 26),
    'no authored wall run may cross the battlefield as a giant barrier'
  );

  for (const enclosure of STONNE_1940_MAP.wallEnclosures) {
    const runs = STONNE_1940_MAP.wallRuns.filter(
      run => run.enclosureId === enclosure.id
    );
    assert.ok(runs.length >= 4, `${enclosure.id} needs a real perimeter`);
    assert.ok(
      runs.every(run => typeof run.boundarySide === 'string'),
      `${enclosure.id} wall sides stay inspectable`
    );

    const boundaryPoints = runs.flatMap(run => [run.start, run.end]);
    const minX = Math.min(...boundaryPoints.map(point => point[0]));
    const maxX = Math.max(...boundaryPoints.map(point => point[0]));
    const minZ = Math.min(...boundaryPoints.map(point => point[1]));
    const maxZ = Math.max(...boundaryPoints.map(point => point[1]));
    assert.ok(maxX - minX <= 30 && maxZ - minZ <= 30);

    const structure = structures.get(enclosure.structureId);
    const descriptor = descriptors.get(structure.descriptorId);
    assert.ok(structure && descriptor);
    const rotation = structure.rotationY ?? 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const localCorners = [
      [descriptor.bounds.min[0], descriptor.bounds.min[2]],
      [descriptor.bounds.min[0], descriptor.bounds.max[2]],
      [descriptor.bounds.max[0], descriptor.bounds.min[2]],
      [descriptor.bounds.max[0], descriptor.bounds.max[2]]
    ];
    for (const [localX, localZ] of localCorners) {
      const worldX = structure.position[0] + localX * cos + localZ * sin;
      const worldZ = structure.position[1] - localX * sin + localZ * cos;
      assert.ok(
        worldX > minX + TERRAIN_SCALE.stoneWall.thickness
          && worldX < maxX - TERRAIN_SCALE.stoneWall.thickness
          && worldZ > minZ + TERRAIN_SCALE.stoneWall.thickness
          && worldZ < maxZ - TERRAIN_SCALE.stoneWall.thickness,
        `${structure.id} footprint must sit inside, not on, its wall boundary`
      );
    }

    for (const gate of enclosure.gateOpenings) {
      assert.equal(distance(gate.start, gate.end), 6);
      const adjacentRuns = runs.filter(run => run.adjacentGateId === gate.id);
      assert.equal(adjacentRuns.length, 2, `${gate.id} must split one boundary side`);
      const endpoints = adjacentRuns.flatMap(run => [run.start, run.end]);
      assert.ok(endpoints.some(point => samePoint(point, gate.start)));
      assert.ok(endpoints.some(point => samePoint(point, gate.end)));
      assert.ok(
        adjacentRuns.every(run => (
          run.start[0] === run.end[0]
            ? gate.start[0] === gate.end[0] && gate.start[0] === run.start[0]
            : gate.start[1] === gate.end[1] && gate.start[1] === run.start[1]
        )),
        `${gate.id} must be collinear with its boundary`
      );
    }
  }

  const villageLot = STONNE_1940_MAP.wallRuns
    .filter(run => run.enclosureId === 'village-house-lot')
    .flatMap(run => [run.start, run.end]);
  const farmhouseLot = STONNE_1940_MAP.wallRuns
    .filter(run => run.enclosureId === 'farmhouse-lot')
    .flatMap(run => [run.start, run.end]);
  const insideBounds = (position, points) => (
    position[0] > Math.min(...points.map(point => point[0]))
    && position[0] < Math.max(...points.map(point => point[0]))
    && position[1] > Math.min(...points.map(point => point[1]))
    && position[1] < Math.max(...points.map(point => point[1]))
  );
  assert.equal(
    insideBounds(
      STONNE_1940_MAP.foliage.find(tree => tree.id === 'tree-northeast').position,
      villageLot
    ),
    true,
    'the village-house wall contains its yard tree'
  );
  assert.equal(
    insideBounds(
      STONNE_1940_MAP.foliage.find(tree => tree.id === 'tree-northwest').position,
      farmhouseLot
    ),
    true,
    'the farmhouse wall contains its yard tree'
  );
});

test('river bed remains below visible water and bridge reaches connected banks', () => {
  const scene = new THREE.Scene();
  const terrain = createTerrain(scene);
  const { river } = STONNE_1940_MAP;
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
    STONNE_1940_MAP.bridge.span * 0.5 > cutHalfWidth,
    'bridge deck ends must extend beyond both cut banks'
  );
  assert.equal(bridge.userData.dimensionsMeters.length, STONNE_1940_MAP.bridge.span);
});

test('riverbank strips conform to the existing height field without collision or navigation authority', () => {
  const scene = new THREE.Scene();
  const terrain = createTerrain(scene);
  const colliderCount = terrain.colliderRecords.length;
  const navigationCount = terrain.navigationRecords.length;
  terrain.buildRiverAndBridge();

  assert.equal(terrain.riverBankStrips.length, 2);
  assert.deepEqual(
    terrain.riverBankStrips.map(strip => strip.userData.side),
    ['south', 'north']
  );
  for (const strip of terrain.riverBankStrips) {
    const { side, mapFeatureId, materialRole, worldBounds, bankEdges, rendererApproximation } = strip.userData;
    const positions = strip.geometry.attributes.position;
    const normals = strip.geometry.attributes.normal;
    assert.equal(mapFeatureId, STONNE_1940_MAP.river.id);
    assert.equal(materialRole, 'riverBank');
    assert.equal(strip.material, terrain.getSurfaceAssets().materials.riverBank);
    assert.equal(strip.receiveShadow, true);
    assert.equal(strip.castShadow, false);
    assert.match(rendererApproximation.label, /renderer-only/);
    assert.ok(rendererApproximation.xSubdivisions > 1);
    assert.ok(rendererApproximation.crossSlopeSubdivisions > 1);
    assert.ok(rendererApproximation.surfaceOffset > 0);
    assert.equal(worldBounds.minX, -STONNE_1940_MAP.dimensions.width * 0.5);
    assert.equal(worldBounds.maxX, STONNE_1940_MAP.dimensions.width * 0.5);
    assert.equal(
      bankEdges.innerZ,
      STONNE_1940_MAP.river.centerZ
        + (side === 'north' ? 1 : -1) * STONNE_1940_MAP.river.waterWidth * 0.5
    );
    assert.equal(
      bankEdges.outerZ,
      STONNE_1940_MAP.river.centerZ
        + (side === 'north' ? 1 : -1) * STONNE_1940_MAP.river.cutWidth * 0.5
    );
    assert.ok(
      new Set(Array.from({ length: positions.count }, (_, index) => positions.getZ(index))).size
        > 2,
      'bounded cross-slope samples must retain the smooth bank'
    );
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
      assertNear(
        y,
        terrain.getHeightAt(x, z) + rendererApproximation.surfaceOffset,
        'riverbank vertex must follow authoritative terrain height'
      );
      assert.ok(Number.isFinite(normals.getX(index)));
      assert.ok(Number.isFinite(normals.getY(index)));
      assert.ok(Number.isFinite(normals.getZ(index)));
      assert.ok(normals.getY(index) > 0, 'riverbank normals must face upward');
    }
    strip.geometry.computeBoundingBox();
    assertNear(strip.geometry.boundingBox.min.x, worldBounds.minX, 'riverbank min X');
    assertNear(strip.geometry.boundingBox.max.x, worldBounds.maxX, 'riverbank max X');
    assertNear(strip.geometry.boundingBox.min.z, worldBounds.minZ, 'riverbank min Z');
    assertNear(strip.geometry.boundingBox.max.z, worldBounds.maxZ, 'riverbank max Z');
    assert.ok(strip.geometry.index.count > 0, 'riverbank requires indexed outward winding');
  }
  assert.equal(terrain.colliderRecords.length, colliderCount + 8);
  assert.equal(terrain.navigationRecords.length, navigationCount + 1);
  assert.equal(
    terrain.colliderRecords.some(record => record.type === 'river_bank'),
    false,
    'riverbank strips must not create collision records'
  );
});

test('bridge and house meshes expose calibrated metre dimensions', () => {
  const scene = new THREE.Scene();
  const terrain = createTerrain(scene);
  terrain.buildRiverAndBridge();
  terrain.buildStructures();

  const bridge = scene.getObjectByName('StoneBridge');
  const house = scene.getObjectByName('FrenchVillageHouse');
  assert.deepEqual(bridge.userData.dimensionsMeters, {
    width: TERRAIN_SCALE.bridge.roadwayWidth,
    length: STONNE_1940_MAP.bridge.span,
    deckTop: bridge.userData.dimensionsMeters.deckTop
  });
  assert.deepEqual(house.userData.dimensionsMeters, {
    width: TERRAIN_SCALE.house.width,
    depth: TERRAIN_SCALE.house.depth,
    height: FR_HOUSE_12X9_2F.bounds.max[1] - FR_HOUSE_12X9_2F.bounds.min[1]
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

  const buildingObstacles = terrain.bocageObstacles.filter(
    obstacle => (
      obstacle.type === 'building'
      && obstacle.buildingId === 'french_village_house'
    )
  );
  assert.ok(buildingObstacles.length > 4, 'house collision follows wall sections, not a solid box');
  assert.ok(buildingObstacles.every(obstacle => obstacle.sectionId === 'ground-shell'));
  assert.ok(buildingObstacles.every(obstacle => obstacle.minY >= Math.min(...foundationCorners.map(([, y]) => y))));

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
      >= STONNE_1940_MAP.bridge.span / TERRAIN_SCALE.bridge.masonryRepeatMeters,
    'bridge masonry must repeat by metre scale along full span'
  );
});
