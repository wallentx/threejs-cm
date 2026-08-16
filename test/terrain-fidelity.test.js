import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  TerrainBuilder,
  createGroundConformingWallGeometry,
  createGroundConformingFenceCardGeometry,
  resolveSkyPanoramaSize
} from './helpers/France1940TestTerrain.js';
import { TERRAIN_SCALE } from '../src/world/TerrainScale.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { FR_FARMHOUSE_8X6_1F } from '../src/maps/france/FranceFarmhouse8x6_1F.js';
import {
  FRANCE_1940_BUILDING_DESCRIPTORS
} from '../src/maps/france/FranceBuildingDescriptors.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { defineMapDescriptor } from '../src/maps/MapDescriptor.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import {
  createFrenchHouseVisualAdapter
} from '../src/world/buildings/FrenchHouse.js';

const EPSILON = 1e-5;
const STONE_WALL_PROFILE = STONNE_1940_MAP.wallProfiles['stone-wall'];
const STRUCTURE_ADAPTERS = Object.freeze(Object.fromEntries(
  FRANCE_1940_BUILDING_DESCRIPTORS.map(descriptor => [
    descriptor.id,
    createFrenchHouseVisualAdapter(descriptor)
  ])
));

function createTerrain(scene) {
  const buildingSystem = new BuildingSystem();
  for (const descriptor of FRANCE_1940_BUILDING_DESCRIPTORS) {
    buildingSystem.registerDescriptor(descriptor);
  }
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
  assert.ok(STONE_WALL_PROFILE.height >= 1);
  assert.ok(STONE_WALL_PROFILE.height <= 1.3);
  assert.ok(STONE_WALL_PROFILE.thickness >= 0.5);
  assert.ok(STONE_WALL_PROFILE.thickness <= 0.8);
  assert.ok(TERRAIN_SCALE.house.eavesHeight <= 7);
  assert.ok(TERRAIN_SCALE.bridge.roadwayWidth >= 5.5);
  assert.ok(TERRAIN_SCALE.bridge.roadwayWidth <= 7.5);
  assert.ok(STONNE_1940_MAP.river.cutWidth > STONNE_1940_MAP.river.waterWidth);
  assert.ok(STONNE_1940_MAP.river.bedLevel < STONNE_1940_MAP.river.waterLevel);
  assert.ok(STONNE_1940_MAP.bridge.span > STONNE_1940_MAP.river.cutWidth);
});

test('generic terrain remains ungraded when a map omits shaping declarations', () => {
  const source = JSON.parse(JSON.stringify(STONNE_1940_MAP));
  delete source.river.floodplainRadius;
  for (const structure of source.structures) delete structure.terrainPad;
  const terrain = new TerrainBuilder(new THREE.Scene(), {
    mapDescriptor: defineMapDescriptor(source),
    structureAdapters: STRUCTURE_ADAPTERS
  });
  const structure = source.structures[0];
  const sampleX = structure.position[0] + 5;
  const sampleZ = structure.position[1] + 2;
  assertNear(
    terrain.getOpenGroundHeightAt(sampleX, sampleZ),
    terrain.getRawOpenGroundHeightAt(sampleX, sampleZ),
    'structure proximity alone must not reshape generic terrain'
  );
  assertNear(
    terrain.getRawOpenGroundHeightAt(0, source.river.centerZ + 20),
    source.elevation.waves.reduce((height, wave) => {
      const coordinate = wave.axis === 'x' ? 0 : source.river.centerZ + 20;
      const sample = wave.function === 'sin'
        ? Math.sin(coordinate * wave.frequency + (wave.phase ?? 0))
        : Math.cos(coordinate * wave.frequency + (wave.phase ?? 0));
      return height + sample * wave.amplitude;
    }, source.elevation.baseHeight ?? 0),
    'river proximity alone must not introduce a generic floodplain'
  );
});

test('wall geometry is grounded, manifold, and outward-wound', () => {
  const getHeightAt = (x, z) => x * 0.12 - z * 0.05;
  const geometry = createGroundConformingWallGeometry({
    start: { x: -2, z: 1 },
    end: { x: 3, z: 4 },
    height: STONE_WALL_PROFILE.height,
    thickness: STONE_WALL_PROFILE.thickness,
    textureRepeatMeters: STONE_WALL_PROFILE.textureRepeatMeters,
    textureRepeatHeightMeters: STONE_WALL_PROFILE.textureRepeatHeightMeters,
    getHeightAt
  });

  assert.equal(geometry.attributes.position.count, 36);
  assert.equal(geometry.attributes.normal.count, 36);
  assert.equal(geometry.attributes.uv.count, 36);
  assert.equal(geometry.userData.footprintCorners.length, 4);
  assert.deepEqual(geometry.userData.textureRepeatMeters, {
    horizontal: STONE_WALL_PROFILE.textureRepeatMeters,
    vertical: STONE_WALL_PROFILE.textureRepeatHeightMeters
  });
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
  const stoneRuns = STONNE_1940_MAP.wallRuns.filter(run => (
    STONNE_1940_MAP.wallProfiles[run.profileId].collisionType === 'stonewall'
  ));

  const expectedSegmentCount = stoneRuns.reduce(
    (sum, run) => sum + Math.ceil(
      Math.hypot(run.end[0] - run.start[0], run.end[1] - run.start[1])
        / STONNE_1940_MAP.wallProfiles[run.profileId].maximumSegmentLength
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
    const sourceProfile = STONNE_1940_MAP.wallProfiles[sourceRun.profileId];
    assert.equal(wall.userData.enclosureId, sourceRun.enclosureId ?? null);
    assert.equal(wall.userData.boundarySide, sourceRun.boundarySide ?? null);
    assert.equal(wall.userData.adjacentGateId, sourceRun.adjacentGateId ?? null);

    const dimensions = wall.userData.dimensionsMeters;
    assert.ok(dimensions.length <= sourceProfile.maximumSegmentLength);
    assert.equal(dimensions.height, sourceProfile.height);
    assert.equal(dimensions.thickness, sourceProfile.thickness);
    assert.deepEqual(wall.geometry.userData.textureRepeatMeters, {
      horizontal: sourceProfile.textureRepeatMeters,
      vertical: sourceProfile.textureRepeatHeightMeters
    });

    for (const [x, y, z] of wall.geometry.userData.footprintCorners) {
      assertNear(y, terrain.getHeightAt(x, z), 'rendered corner grounding');
    }

    const obstacle = wallObstacles.find(
      candidate => candidate.id
        === `${wall.userData.runId}_${wall.userData.segmentIndex}`
    );
    assert.ok(obstacle, 'wall segment must own a collision record');
    assert.equal(obstacle.enclosureId, sourceRun.enclosureId ?? null);
    assert.equal(obstacle.adjacentGateId, sourceRun.adjacentGateId ?? null);
    const collisionGeometry = createGroundConformingWallGeometry({
      start: { x: wall.userData.start[0], z: wall.userData.start[2] },
      end: { x: wall.userData.end[0], z: wall.userData.end[2] },
      height: dimensions.height,
      thickness: dimensions.thickness,
      getHeightAt: (x, z) => terrain.getHeightAt(x, z)
    });
    assertNear(obstacle.minX, collisionGeometry.boundingBox.min.x, 'collision minX');
    assertNear(obstacle.maxX, collisionGeometry.boundingBox.max.x, 'collision maxX');
    assertNear(obstacle.minY, collisionGeometry.boundingBox.min.y, 'collision minY');
    assertNear(obstacle.maxY, collisionGeometry.boundingBox.max.y, 'collision maxY');
    assertNear(obstacle.minZ, collisionGeometry.boundingBox.min.z, 'collision minZ');
    assertNear(obstacle.maxZ, collisionGeometry.boundingBox.max.z, 'collision maxZ');
    collisionGeometry.dispose();
  }

  assert.equal(runs.size, stoneRuns.length);
  for (const sourceRun of stoneRuns) {
    const segments = runs.get(sourceRun.id);
    const profile = STONNE_1940_MAP.wallProfiles[sourceRun.profileId];
    const runLength = Math.hypot(
      sourceRun.end[0] - sourceRun.start[0],
      sourceRun.end[1] - sourceRun.start[1]
    );
    assert.equal(
      segments.length,
      Math.ceil(runLength / profile.maximumSegmentLength)
    );
    segments.sort((a, b) => a.userData.segmentIndex - b.userData.segmentIndex);
    assert.equal(
      segments[0].geometry.userData.caps.start,
      !segments[0].userData.cornerJoin.start,
      'only an unjoined run start keeps its visible end cap'
    );
    assert.equal(
      segments.at(-1).geometry.userData.caps.end,
      !segments.at(-1).userData.cornerJoin.end,
      'only an unjoined run end keeps its visible end cap'
    );
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
      assert.equal(segments[index - 1].geometry.userData.caps.end, false);
      assert.equal(segments[index].geometry.userData.caps.start, false);
    }
  }

  const northEnd = runs.get('north_mill_north').at(-1);
  const eastStart = runs.get('north_mill_east')[0];
  const northCorners = northEnd.geometry.userData.footprintCorners;
  const eastCorners = eastStart.geometry.userData.footprintCorners;
  assert.equal(northEnd.userData.cornerJoin.end, true);
  assert.equal(eastStart.userData.cornerJoin.start, true);
  assert.equal(northEnd.geometry.userData.caps.end, false);
  assert.equal(eastStart.geometry.userData.caps.start, false);
  for (const [northIndex, eastIndex] of [[3, 0], [2, 1]]) {
    assertNear(northCorners[northIndex][0], eastCorners[eastIndex][0], 'mitre x');
    assertNear(northCorners[northIndex][1], eastCorners[eastIndex][1], 'mitre y');
    assertNear(northCorners[northIndex][2], eastCorners[eastIndex][2], 'mitre z');
  }
  const sandbagWall = terrain.boundaryMeshes.find(mesh => (
    mesh.userData.profileId === 'sandbag-wall'
  ));
  assert.ok(sandbagWall, 'remaining tactical sandbags still render away from the bridgehead');
  assert.deepEqual(sandbagWall.geometry.userData.textureRepeatMeters, {
    horizontal: 1.6,
    vertical: 0.64
  });
});

test('authored ballistic-cover runs publish finite 3D projectile colliders', () => {
  const terrain = createTerrain(new THREE.Scene());
  terrain.buildStoneWalls();
  const projectileColliders = terrain.getProjectileColliderRecords();
  const expectedRunIds = new Set(
    STONNE_1940_MAP.wallRuns
      .filter(run => STONNE_1940_MAP.wallProfiles[run.profileId].blocksProjectiles)
      .map(run => run.id)
  );
  assert.ok(projectileColliders.length > 0);
  assert.deepEqual(
    new Set(projectileColliders.map(collider => collider.mapFeatureId)),
    expectedRunIds
  );
  for (const collider of projectileColliders) {
    assert.equal(collider.blocksProjectiles, true);
    assert.ok(Number.isFinite(collider.centerY));
    assert.ok(collider.halfHeight > 0);
    assert.match(collider.projectileCoverDataQuality, /ballistic cover/);
  }
});

test('fence card geometry follows terrain with one indexed cutout ribbon', () => {
  const start = { x: -3, z: 2 };
  const end = { x: 5, z: 6 };
  const getHeightAt = (x, z) => x * 0.08 - z * 0.03;
  const geometry = createGroundConformingFenceCardGeometry({
    start,
    end,
    height: 1.1,
    thickness: 0.18,
    maximumSegmentLength: 2,
    textureRepeatMeters: 2,
    groundOffset: 0.015,
    getHeightAt
  });

  const expectedSegments = Math.ceil(Math.hypot(8, 4) / 2);
  assert.equal(geometry.userData.segmentCount, expectedSegments);
  assert.equal(geometry.attributes.position.count, expectedSegments * 12 + 8);
  assert.equal(geometry.index.count, expectedSegments * 18 + 12);
  assert.equal(geometry.userData.groundSamples.length, expectedSegments + 1);
  for (const [x, y, z] of geometry.userData.groundSamples) {
    assertNear(y, getHeightAt(x, z), 'fence ground sample');
  }
  assert.equal(geometry.userData.presentationKind, 'alpha-tested-card');
  assert.equal(geometry.userData.metresPerUvRepeat, 2);
  assert.equal(geometry.userData.thicknessMeters, 0.18);
  assert.deepEqual(geometry.userData.faceBands, ['front', 'back', 'top', 'ends']);
  assert.equal(
    geometry.userData.segmentVertexIndices.length,
    expectedSegments
  );
  assert.equal(
    geometry.userData.segmentVertexIndices
      .reduce((count, record) => count + record.length, 0),
    geometry.attributes.position.count
  );
  assert.equal(
    geometry.userData.originalPositions.length,
    geometry.attributes.position.count * 3
  );
  const topBandOffset = 8;
  assertNear(geometry.attributes.uv.getY(topBandOffset), 0.88, 'top UV lower band');
  assertNear(geometry.attributes.uv.getY(topBandOffset + 2), 0.98, 'top UV upper band');
  assert.ok(
    geometry.boundingBox.max.x - geometry.boundingBox.min.x > 8,
    'oriented ribbon must retain visible physical width'
  );
});

test('farmhouse fences use one alpha-tested mesh per run and separate collision', () => {
  const scene = new THREE.Scene();
  const terrain = createTerrain(scene);
  terrain.buildStoneWalls();
  const fenceRuns = STONNE_1940_MAP.wallRuns.filter(run => (
    STONNE_1940_MAP.wallProfiles[run.profileId].presentationKind
      === 'alpha-tested-card'
  ));

  assert.equal(terrain.fenceCardRuns.length, fenceRuns.length);
  assert.ok(
    terrain.fenceCardRuns.length
      < terrain.fenceCardRuns.reduce(
        (sum, fence) => sum + fence.geometry.userData.segmentCount,
        0
      ),
    'terrain tessellation must stay inside one submitted mesh per authored run'
  );
  for (const fence of terrain.fenceCardRuns) {
    const sourceRun = fenceRuns.find(run => run.id === fence.userData.runId);
    const profile = STONNE_1940_MAP.wallProfiles[sourceRun.profileId];
    assert.equal(fence.userData.profileId, profile.id);
    assert.equal(fence.material, terrain.getSurfaceAssets().materials.fenceCard);
    assert.equal(fence.material.transparent, false);
    assert.equal(fence.material.depthWrite, true);
    assert.ok(fence.material.alphaTest > 0);
    assert.equal(fence.material.side, THREE.FrontSide);
    assert.equal(fence.castShadow, false);
    assert.equal(fence.receiveShadow, true);
    assert.equal(fence.userData.rendererApproximation.blendedTransparency, false);
    for (const [x, y, z] of fence.geometry.userData.groundSamples) {
      assertNear(y, terrain.getHeightAt(x, z), 'fence terrain sample');
    }

    for (
      let segmentIndex = 0;
      segmentIndex < fence.geometry.userData.segmentCount;
      segmentIndex++
    ) {
      const obstacle = terrain.bocageObstacles.find(
        candidate => candidate.id === `${sourceRun.id}_${segmentIndex}`
      );
      assert.ok(obstacle);
      assert.equal(obstacle.type, 'fence');
      assert.equal(obstacle.occludesSight, false);
      const collider = terrain.colliderRecords.find(
        candidate => candidate.id
          === `wall:${sourceRun.id}:${segmentIndex}`
      );
      assert.ok(collider);
      assert.equal(collider.type, 'fence');
      assert.deepEqual(collider.blocks, ['infantry', 'vehicle']);
    }
  }
  assert.equal(
    terrain.stoneWallSegments.every(
      wall => STONNE_1940_MAP.wallProfiles[wall.userData.profileId]
        .presentationKind === 'solid-prism'
    ),
    true,
    'masonry runs must retain solid geometry'
  );
});

test('fence panels own independent visual, collision, and rollback state', () => {
  const terrain = createTerrain(new THREE.Scene());
  terrain.buildStoneWalls();
  const fence = terrain.fenceCardRuns[0];
  const runId = fence.userData.runId;
  const segmentId = `fence:${runId}:0`;
  const colliderId = `wall:${runId}:0`;
  const neighborColliderId = `wall:${runId}:1`;
  const original = Float32Array.from(
    fence.geometry.attributes.position.array
  );
  const intact = structuredClone(
    terrain.captureDestructibleObstacleState()
  );

  const result = terrain.applyVehicleImpactToLinearObstacle({
    colliderId,
    massTonnes: 10,
    speedMetersPerSecond: 0.5,
    vehicleId: 'test-tank'
  });

  assert.equal(result.id, segmentId);
  assert.equal(result.destroyed, true);
  assert.equal(terrain.collisionWorld.getCollider(colliderId), null);
  assert.ok(terrain.collisionWorld.getCollider(neighborColliderId));
  assert.equal(
    terrain.bocageObstacles.some(record => record.id === `${runId}_0`),
    false
  );
  assert.equal(
    terrain.bocageObstacles.some(record => record.id === `${runId}_1`),
    true
  );
  const position = fence.geometry.attributes.position;
  for (const vertexIndex of fence.geometry.userData.segmentVertexIndices[0]) {
    assertNear(
      position.getY(vertexIndex),
      terrain.getHeightAt(position.getX(vertexIndex), position.getZ(vertexIndex))
        + fence.userData.groundOffset,
      'destroyed panel must collapse to terrain'
    );
  }
  for (const vertexIndex of fence.geometry.userData.segmentVertexIndices[1]) {
    assertNear(
      position.getY(vertexIndex),
      original[vertexIndex * 3 + 1],
      'neighboring panel must retain original geometry'
    );
  }

  terrain.restoreDestructibleObstacleState(intact);
  assert.deepEqual(
    Array.from(fence.geometry.attributes.position.array),
    Array.from(original)
  );
  assert.ok(terrain.collisionWorld.getCollider(colliderId));
  assert.deepEqual(terrain.captureDestructibleObstacleState(), intact);
});

test('detached farm compounds retain bounded gates while the dense village uses open alleys', () => {
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
    STONNE_1940_MAP.wallRuns.every(run => (
      run.profileId === 'cobblestone-bank-wall'
      || distance(run.start, run.end) <= 26
    )),
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
        worldX > minX + STONE_WALL_PROFILE.thickness
          && worldX < maxX - STONE_WALL_PROFILE.thickness
          && worldZ > minZ + STONE_WALL_PROFILE.thickness
          && worldZ < maxZ - STONE_WALL_PROFILE.thickness,
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

  assert.ok(!STONNE_1940_MAP.wallEnclosures.some(enclosure => (
    enclosure.id.startsWith('village-')
  )));
  assert.ok(!STONNE_1940_MAP.wallRuns.some(run => (
    run.enclosureId?.startsWith('village-')
  )));
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
    river.cutWidth,
    'rendered water width'
  );
  assert.ok(
    water.geometry.boundingBox.max.x - water.geometry.boundingBox.min.x >= terrain.width,
    'rendered water length must cover playable width'
  );
  assert.equal(water.position.z, river.centerZ);
  assert.ok(
    STONNE_1940_MAP.bridge.span * 0.5 > cutHalfWidth,
    'bridge deck ends must extend beyond both cut banks'
  );
  assert.equal(bridge.userData.dimensionsMeters.length, STONNE_1940_MAP.bridge.span);
});

test('foliage presentation excludes building canopies and road-centered trunks', () => {
  const scene = new THREE.Scene();
  const terrain = createTerrain(scene);
  terrain.buildScenarioMap();

  assert.deepEqual(terrain.foliageExcludedFeatureIds, [
    'tree-northeast',
    'tree-north-mill-orchard',
    'tree-north-roadside'
  ]);
  assert.deepEqual(
    terrain.renderedFoliageEntries.map(entry => entry.id),
    STONNE_1940_MAP.foliage
      .filter(entry => !terrain.foliageExcludedFeatureIds.includes(entry.id))
      .map(entry => entry.id)
  );
  for (const name of [
    'MatureTreeTrunks',
    'MatureTreeCrownsPrimary',
    'MatureTreeCrownsWest',
    'MatureTreeCrownsEast'
  ]) {
    assert.equal(
      scene.getObjectByName(name).count,
      terrain.renderedFoliageEntries.length,
      `${name} renders only clear placements`
    );
  }
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
    assert.equal(strip.material.polygonOffset, true);
    assert.ok(strip.material.polygonOffsetFactor < 0);
    assert.ok(strip.material.polygonOffsetUnits < 0);
    assert.equal(strip.receiveShadow, true);
    assert.equal(strip.castShadow, false);
    assert.match(rendererApproximation.label, /renderer-only/);
    assert.deepEqual(rendererApproximation.depthBias, {
      factor: strip.material.polygonOffsetFactor,
      units: strip.material.polygonOffsetUnits
    });
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

test('bridge approaches continuously join deck, movement surface, and land', () => {
  const scene = new THREE.Scene();
  const terrain = createTerrain(scene);
  terrain.buildRiverAndBridge();
  const bridge = scene.getObjectByName('StoneBridge');
  const approaches = bridge.children.filter(
    child => child.name === 'BridgeApproach'
  );

  assert.equal(approaches.length, 2);
  assert.deepEqual(
    approaches.map(approach => approach.userData.side).sort(),
    ['north', 'south']
  );
  for (const direction of [-1, 1]) {
    const approach = approaches.find(candidate =>
      candidate.userData.side === (direction < 0 ? 'south' : 'north')
    );
    const innerZ = terrain.bridgeSurface.centerZ
      + direction * terrain.bridgeSurface.halfSpan;
    const outerZ = innerZ
      + direction * terrain.bridgeSurface.approachLength;
    assert.equal(
      terrain.getMovementHeightAt(0, innerZ),
      terrain.bridgeSurface.deckTop
    );
    assertNear(
      terrain.getMovementHeightAt(0, outerZ),
      terrain.getHeightAt(0, outerZ),
      'approach outer edge must meet land'
    );
    const midpointZ = (innerZ + outerZ) * 0.5;
    const midpointHeight = terrain.getMovementHeightAt(0, midpointZ);
    assert.ok(midpointHeight < terrain.bridgeSurface.deckTop);
    assert.ok(midpointHeight > terrain.getHeightAt(0, midpointZ));
    approach.geometry.computeBoundingBox();
    assertNear(
      direction < 0
        ? approach.geometry.boundingBox.max.z
        : approach.geometry.boundingBox.min.z,
      direction * terrain.bridgeSurface.halfSpan,
      'approach inner edge must meet deck'
    );
    assertNear(
      direction < 0
        ? approach.geometry.boundingBox.min.z
        : approach.geometry.boundingBox.max.z,
      direction * (
        terrain.bridgeSurface.halfSpan
          + terrain.bridgeSurface.approachLength
      ),
      'approach outer edge must reach land'
    );
  }
});

test('bridge and house meshes expose calibrated metre dimensions', () => {
  const scene = new THREE.Scene();
  const terrain = createTerrain(scene);
  terrain.buildRiverAndBridge();
  terrain.buildStructures();

  const bridge = scene.getObjectByName('StoneBridge');
  const house = scene.getObjectByName('FrenchVillageHouse');
  const houseDescriptor = FRANCE_1940_BUILDING_DESCRIPTORS.find(
    descriptor => descriptor.id === house.userData.descriptorId
  );
  assert.deepEqual(bridge.userData.dimensionsMeters, {
    width: TERRAIN_SCALE.bridge.roadwayWidth,
    length: STONNE_1940_MAP.bridge.span,
    approachLength: STONNE_1940_MAP.bridge.approachLength,
    deckTop: bridge.userData.dimensionsMeters.deckTop
  });
  assert.deepEqual(house.userData.dimensionsMeters, {
    width: houseDescriptor.bounds.max[0] - houseDescriptor.bounds.min[0],
    depth: houseDescriptor.bounds.max[2] - houseDescriptor.bounds.min[2],
    height: houseDescriptor.bounds.max[1] - houseDescriptor.bounds.min[1]
  });
  const roof = house.userData.detailedRoof;
  assert.equal(roof.name, 'HouseGabledRoof');
  assert.equal(house.userData.roofStyleId, 'gabled');
  assert.ok(roof, 'house must use its authored dimensioned roof');
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

test('attached rows share level terrain pads and keep exterior doors at grade', () => {
  const terrain = createTerrain(new THREE.Scene());
  terrain.buildStructures();
  const placementById = new Map(
    STONNE_1940_MAP.structures.map(structure => [structure.id, structure])
  );
  const rowTopHeights = new Map();

  for (const building of terrain.buildings) {
    const placement = placementById.get(building.id);
    if (!placement?.attachedRowId) continue;
    const descriptor = FRANCE_1940_BUILDING_DESCRIPTORS.find(
      candidate => candidate.id === building.descriptorId
    );
    const topY = building.object.userData.foundation.topY;
    const heights = rowTopHeights.get(placement.attachedRowId) ?? [];
    heights.push(topY);
    rowTopHeights.set(placement.attachedRowId, heights);

    for (const portal of descriptor.portals.filter(record => record.kind === 'door')) {
      const [localX, localY, localZ] = portal.aperture.center;
      const cosine = Math.cos(placement.rotationY);
      const sine = Math.sin(placement.rotationY);
      const worldX = placement.position[0] + localX * cosine + localZ * sine;
      const worldZ = placement.position[1] - localX * sine + localZ * cosine;
      const sillY = topY + localY - portal.aperture.size[1] * 0.5;
      const groundY = terrain.getHeightAt(worldX, worldZ);
      assert.ok(
        Math.abs((sillY - groundY) - placement.foundationClearance) <= 1e-6,
        `${building.id}:${portal.id} must meet its graded foundation`
      );
    }
  }

  assert.equal(rowTopHeights.size, 2);
  for (const heights of rowTopHeights.values()) {
    assert.ok(heights.every(height => Math.abs(height - heights[0]) <= 1e-6));
  }
});

test('TerrainBuilder creates an out-of-bounds surrounding terrain skirt that connects to the map edge', () => {
  const scene = new THREE.Scene();
  const terrain = createTerrain(scene);
  terrain.buildScenarioMap();

  assert.ok(terrain.surroundingTerrainMesh, 'surrounding terrain mesh must be built');
  assert.equal(terrain.surroundingTerrainMesh.name, 'SurroundingTerrainMesh');
  assert.equal(terrain.surroundingTerrainMesh.userData.renderShadowPolicy.castShadow, false);
  assert.equal(terrain.surroundingTerrainMesh.userData.renderShadowPolicy.receiveShadow, true);

  assert.ok(terrain.mapBoundaryRibbonMesh, 'map boundary ribbon mesh must be built');
  assert.equal(terrain.mapBoundaryRibbonMesh.name, 'MapBoundaryRibbonMesh');
  assert.equal(terrain.mapBoundaryRibbonMesh.material.transparent, true);
  assert.equal(terrain.mapBoundaryRibbonMesh.userData.renderShadowPolicy.castShadow, false);

  assert.ok(terrain.skyDomeMesh, 'sky dome mesh must be built');
  assert.equal(terrain.skyDomeMesh.name, 'AtmosphericSkyDome');
  assert.equal(terrain.skyDomeMesh.userData.renderShadowPolicy.castShadow, false);
  assert.equal(terrain.skyDomeMesh.material.side, THREE.BackSide);

  const geometry = terrain.surroundingTerrainMesh.geometry;
  const positions = geometry.attributes.position;
  const colors = geometry.attributes.color;

  assert.ok(positions.count > 0, 'surrounding terrain must contain vertices');
  assert.ok(colors.count === positions.count, 'surrounding terrain must have vertex colors');

  let hasOutOfBoundsVertex = false;
  let hasRiverWaterColor = false;
  const halfWidth = STONNE_1940_MAP.dimensions.width * 0.5;
  const halfDepth = STONNE_1940_MAP.dimensions.depth * 0.5;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    const dx = Math.max(0, Math.abs(x) - halfWidth);
    const dz = Math.max(0, Math.abs(z) - halfDepth);
    const dist = Math.hypot(dx, dz);

    if (dist > 1) {
      hasOutOfBoundsVertex = true;
    }

    if (Math.abs(z - STONNE_1940_MAP.river.centerZ) < 3 && dist < 30) {
      const r = colors.getX(i);
      const b = colors.getZ(i);
      if (b > 0.20 && b > r) hasRiverWaterColor = true;
    }

    if (dist < 0.01) {
      assert.equal(colors.getW(i), 1.0, 'boundary vertex alpha must be 1.0');
    } else if (dist > 400) {
      assert.ok(colors.getW(i) < 0.5, 'distant perimeter vertex alpha must fade towards 0');
    }

    assertNear(y, terrain.getHeightAt(x, z), 'surrounding terrain elevation must match terrain height function');
  }

  assert.equal(hasOutOfBoundsVertex, true, 'surrounding terrain must extend beyond playable map bounds');
  assert.equal(hasRiverWaterColor, true, 'river channel color must continue across surrounding terrain');
  assert.equal(terrain.surroundingTerrainMesh.material.transparent, true, 'surrounding terrain material must be transparent');
  assert.equal(
    terrain.surroundingTerrainMesh.material.depthWrite,
    false,
    'fading out-of-bounds terrain must not occlude DoF-composited battlefield VFX'
  );

  const normals = geometry.getAttribute('normal');
  assert.ok(normals && normals.count > 0, 'surrounding terrain must have computed normals');
  for (let i = 0; i < normals.count; i++) {
    assert.ok(normals.getY(i) > 0, `surrounding terrain vertex normal ${i} must point upward (+Y), got ${normals.getY(i)}`);
  }
});

test('sky panorama allocation scales with render quality while preserving ultra opt-in', () => {
  assert.deepEqual(resolveSkyPanoramaSize('low'), { width: 1024, height: 512 });
  assert.deepEqual(resolveSkyPanoramaSize('high'), { width: 2048, height: 1024 });
  assert.deepEqual(resolveSkyPanoramaSize('ultra'), { width: 4096, height: 2048 });
});
