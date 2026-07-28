import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FR_FARMHOUSE_8X6_1F } from '../src/maps/france/FranceFarmhouse8x6_1F.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { STONNE_1940_SCENARIO } from '../src/scenarios/france1940/stonne1940.js';
import {
  FRANCE_1940_CATALOG_PORTS
} from '../src/content/france1940/catalogPorts.js';
import {
  FRANCE_1940_FORMATIONS
} from '../src/content/france1940/formations.js';
import {
  BuildingSystem,
  createPortalGraph,
  findPortalPath,
  validateBuildingDescriptor
} from '../src/simulation/buildings/index.js';
import { BuildingInteractionSystem } from '../src/game/BuildingInteractionSystem.js';
import {
  createFrenchHouseVisualAdapter,
  createFrenchHouseVisual,
  disposeFrenchHouseVisual
} from '../src/world/buildings/FrenchHouse.js';
import { TERRAIN_SCALE } from '../src/world/TerrainScale.js';
import { TerrainBuilder } from './helpers/France1940TestTerrain.js';
import { Unit } from './helpers/France1940TestUnit.js';

const FARMHOUSE_ID = 'french_farmhouse_outbuilding';
const DESCRIPTORS = Object.freeze([
  FR_HOUSE_12X9_2F,
  FR_FARMHOUSE_8X6_1F
]);
const ADAPTERS = Object.freeze(Object.fromEntries(
  DESCRIPTORS.map(descriptor => [
    descriptor.id,
    createFrenchHouseVisualAdapter(descriptor)
  ])
));

function assertDeepFrozen(value, path = 'descriptor', seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, `${path}.${key}`, seen);
  }
}

function assertPlainData(value, path = 'descriptor', seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    assert.notEqual(typeof value, 'function', `${path} must not contain functions`);
    return;
  }
  seen.add(value);
  assert.ok(
    Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype,
    `${path} must use plain arrays and objects`
  );
  for (const [key, child] of Object.entries(value)) {
    assertPlainData(child, `${path}.${key}`, seen);
  }
}

function request(nodeId, index) {
  return {
    nodeId,
    orderSequence: index,
    unitId: `unit-${index}`,
    soldierId: `soldier-${index}`,
    soldierKey: `unit-${index}:soldier-${index}`
  };
}

function rotatedFootprint(descriptor, placement) {
  const cosine = Math.cos(placement.rotationY ?? 0);
  const sine = Math.sin(placement.rotationY ?? 0);
  const [centerX, centerZ] = placement.position;
  const corners = [
    [descriptor.bounds.min[0], descriptor.bounds.min[2]],
    [descriptor.bounds.min[0], descriptor.bounds.max[2]],
    [descriptor.bounds.max[0], descriptor.bounds.max[2]],
    [descriptor.bounds.max[0], descriptor.bounds.min[2]]
  ].map(([localX, localZ]) => [
    centerX + localX * cosine + localZ * sine,
    centerZ - localX * sine + localZ * cosine
  ]);
  return {
    corners,
    minX: Math.min(...corners.map(([x]) => x)),
    maxX: Math.max(...corners.map(([x]) => x)),
    minZ: Math.min(...corners.map(([, z]) => z)),
    maxZ: Math.max(...corners.map(([, z]) => z))
  };
}

function aabbsOverlap(left, right) {
  return !(
    left.maxX <= right.minX
    || left.minX >= right.maxX
    || left.maxZ <= right.minZ
    || left.minZ >= right.maxZ
  );
}

function expandedSegmentBounds(start, end, thickness) {
  const halfThickness = thickness * 0.5;
  return {
    minX: Math.min(start[0], end[0]) - halfThickness,
    maxX: Math.max(start[0], end[0]) + halfThickness,
    minZ: Math.min(start[1], end[1]) - halfThickness,
    maxZ: Math.max(start[1], end[1]) + halfThickness
  };
}

function circleIntersectsAabb([centerX, centerZ], radius, bounds) {
  const nearestX = Math.max(bounds.minX, Math.min(centerX, bounds.maxX));
  const nearestZ = Math.max(bounds.minZ, Math.min(centerZ, bounds.maxZ));
  return (
    (centerX - nearestX) ** 2 + (centerZ - nearestZ) ** 2
    <= radius ** 2
  );
}

function rotatedRectangleBounds({
  centerX,
  centerZ,
  width,
  depth,
  rotationY = 0
}) {
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const corners = [
    [-halfWidth, -halfDepth],
    [-halfWidth, halfDepth],
    [halfWidth, halfDepth],
    [halfWidth, -halfDepth]
  ].map(([localX, localZ]) => [
    centerX + localX * cosine + localZ * sine,
    centerZ - localX * sine + localZ * cosine
  ]);
  return {
    minX: Math.min(...corners.map(([x]) => x)),
    maxX: Math.max(...corners.map(([x]) => x)),
    minZ: Math.min(...corners.map(([, z]) => z)),
    maxZ: Math.max(...corners.map(([, z]) => z))
  };
}

function disposeUnitMesh(unit) {
  const geometries = new Set();
  const materials = new Set();
  unit.mesh?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const ownedMaterial of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (ownedMaterial) materials.add(ownedMaterial);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const ownedMaterial of materials) ownedMaterial.dispose();
}

function completeInitialUnitFootprints() {
  const footprints = [];
  const infantryUnits = [];

  for (const definition of STONNE_1940_SCENARIO.units) {
    const [centerX, , centerZ] = definition.position;
    if (definition.type === 'infantry_squad') {
      const formation = FRANCE_1940_FORMATIONS[definition.formationId];
      assert.ok(formation, `${definition.id} has a catalog formation`);
      const unit = new Unit({
        id: `placement-${definition.id}`,
        faction: definition.faction,
        type: definition.type,
        squadSize: formation.members.length,
        position: new THREE.Vector3().fromArray(definition.position),
        rotation: definition.rotation
      });
      infantryUnits.push(unit);
      const rotationY = definition.rotation ?? 0;
      const cosine = Math.cos(rotationY);
      const sine = Math.sin(rotationY);
      for (let index = 0; index < formation.members.length; index++) {
        const offset = unit.soldierAI.getFormationOffset(index, 'QUICK');
        const worldX = centerX + offset.x * cosine + offset.z * sine;
        const worldZ = centerZ - offset.x * sine + offset.z * cosine;
        footprints.push({
          unitId: definition.id,
          partId: formation.members[index].id,
          minX: worldX - unit.collisionRadius,
          maxX: worldX + unit.collisionRadius,
          minZ: worldZ - unit.collisionRadius,
          maxZ: worldZ + unit.collisionRadius
        });
      }
      assert.equal(
        footprints.filter(footprint => footprint.unitId === definition.id).length,
        formation.members.length,
        `${definition.id} footprint includes every catalog formation member`
      );
      continue;
    }

    const dimensions = definition.vehicleId
      ? FRANCE_1940_CATALOG_PORTS.vehicles.get(definition.vehicleId)
        ?.dimensionsMeters
      : FRANCE_1940_CATALOG_PORTS.structures.get(definition.structureId)
        ?.dimensionsMeters;
    assert.ok(dimensions, `${definition.id} has catalog footprint dimensions`);
    footprints.push({
      unitId: definition.id,
      partId: definition.vehicleId ?? definition.structureId,
      ...rotatedRectangleBounds({
        centerX,
        centerZ,
        width: dimensions.width,
        depth: dimensions.length ?? dimensions.depth,
        rotationY: definition.rotation
      })
    });
  }

  return { footprints, infantryUnits };
}

function foundationBottomWorldCorners(root) {
  root.updateMatrixWorld(true);
  const foundation = root.getObjectByName('HouseFoundation');
  const positions = foundation.geometry.getAttribute('position');
  const corners = new Map();
  for (let index = 0; index < positions.count; index++) {
    if (positions.getY(index) >= 0) continue;
    const localX = positions.getX(index);
    const localZ = positions.getZ(index);
    const key = `${localX},${localZ}`;
    if (corners.has(key)) continue;
    corners.set(
      key,
      new THREE.Vector3(
        localX,
        positions.getY(index),
        localZ
      ).applyMatrix4(foundation.matrixWorld)
    );
  }
  return [...corners.values()].sort(
    (left, right) => left.x - right.x || left.z - right.z
  );
}

function sortWorldCorners(corners) {
  return corners
    .map(corner => [...corner])
    .sort((left, right) => left[0] - right[0] || left[2] - right[2]);
}

function assertWorldCornersClose(actual, expected, tolerance = 1e-5) {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index++) {
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(
        Math.abs(actual[index][axis] - expected[index][axis]) <= tolerance,
        `corner ${index} axis ${axis}: ${actual[index][axis]} != ${expected[index][axis]}`
      );
    }
  }
}

function roundedTierBounds(object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  return [
    bounds.min.x,
    bounds.min.z,
    bounds.max.x,
    bounds.max.y,
    bounds.max.z
  ].map(value => Number(value.toFixed(6)));
}

function createTerrain() {
  const buildingSystem = new BuildingSystem();
  for (const descriptor of DESCRIPTORS) {
    buildingSystem.registerDescriptor(descriptor);
  }
  const terrain = new TerrainBuilder(new THREE.Scene(), {
    mapDescriptor: STONNE_1940_MAP,
    buildingSystem,
    structureAdapters: ADAPTERS
  });
  terrain.buildStructures();
  return { buildingSystem, terrain };
}

test('compact farmhouse is frozen plain data with one exact tactical room', () => {
  const legacyBytes = JSON.stringify(FR_HOUSE_12X9_2F);
  assert.equal(validateBuildingDescriptor(FR_HOUSE_12X9_2F), FR_HOUSE_12X9_2F);
  assert.equal(JSON.stringify(FR_HOUSE_12X9_2F), legacyBytes);
  assert.equal(
    validateBuildingDescriptor(FR_FARMHOUSE_8X6_1F),
    FR_FARMHOUSE_8X6_1F
  );
  assertPlainData(FR_FARMHOUSE_8X6_1F);
  assertDeepFrozen(FR_FARMHOUSE_8X6_1F);

  assert.equal(
    FR_FARMHOUSE_8X6_1F.bounds.max[0] - FR_FARMHOUSE_8X6_1F.bounds.min[0],
    8
  );
  assert.equal(
    FR_FARMHOUSE_8X6_1F.bounds.max[2] - FR_FARMHOUSE_8X6_1F.bounds.min[2],
    6
  );
  assert.deepEqual(
    FR_FARMHOUSE_8X6_1F.floors.map(floor => [floor.id, floor.rooms]),
    [['ground-floor', ['ground-room']]]
  );
  assert.deepEqual(
    FR_FARMHOUSE_8X6_1F.rooms[0].slots.map(slot => [slot.id, slot.capacity]),
    [
      ['ground-front-left', 1],
      ['ground-front-right', 1],
      ['ground-rear-interior', 1],
      ['ground-middle-left', 1],
      ['ground-middle-right', 1],
      ['ground-rear-left', 1]
    ]
  );
  assert.ok(
    FR_FARMHOUSE_8X6_1F.rooms[0].slots.slice(3)
      .every(slot => slot.dataQuality?.includes('gameplay approximation'))
  );
  assert.deepEqual(
    FR_FARMHOUSE_8X6_1F.portals.map(portal => [
      portal.id,
      portal.kind,
      portal.from,
      portal.to
    ]),
    [['front-door', 'door', 'outside', 'ground-room']]
  );
  assert.equal(
    FR_FARMHOUSE_8X6_1F.portals.some(portal => portal.kind === 'stair'),
    false
  );
  assert.deepEqual(
    FR_FARMHOUSE_8X6_1F.firePorts.map(port => [
      port.id,
      port.approachSlotId,
      port.aperture.initiallyOpen,
      port.localNormal,
      port.capacity
    ]),
    [
      ['front-window-left', 'ground-front-left', true, [0, 0, 1], 1],
      ['front-window-right', 'ground-front-right', true, [0, 0, 1], 1]
    ]
  );
  assert.deepEqual(
    FR_FARMHOUSE_8X6_1F.sections.map(section => [
      section.id,
      section.kind,
      section.supports
    ]),
    [
      ['foundation', 'foundation', ['ground-floor-structure']],
      ['ground-floor-structure', 'floor', ['ground-shell']],
      ['ground-shell', 'wall', ['roof']],
      ['roof', 'roof', []]
    ]
  );
  assert.ok(
    Object.values(FR_FARMHOUSE_8X6_1F.dataQuality)
      .every(label => label.includes('approximation'))
  );
});

test('six authored slots reserve, occupy, release, and reject a seventh claim', () => {
  const system = new BuildingSystem();
  system.registerDescriptor(FR_FARMHOUSE_8X6_1F);
  system.addBuilding({
    id: 'farmhouse-test',
    descriptorId: FR_FARMHOUSE_8X6_1F.id
  });
  assert.deepEqual(
    findPortalPath(
      createPortalGraph(FR_FARMHOUSE_8X6_1F),
      'outside',
      'ground-room'
    ),
    ['front-door']
  );

  const slotIds = FR_FARMHOUSE_8X6_1F.rooms[0].slots.map(slot => slot.id);
  const reservations = system.resolveReservations(
    'farmhouse-test',
    slotIds.map((slotId, index) => request(slotId, index + 1))
  );
  assert.deepEqual(
    reservations.map(result => result.accepted),
    [true, true, true, true, true, true]
  );
  for (let index = 0; index < reservations.length; index++) {
    assert.deepEqual(
      system.occupySlot('farmhouse-test', {
        ...reservations[index],
        slotId: slotIds[index]
      }),
      {
        accepted: true,
        slotId: slotIds[index],
        soldierKey: reservations[index].soldierKey
      }
    );
  }

  const seventh = request(slotIds[5], 7);
  assert.deepEqual(
    system.occupySlot('farmhouse-test', { ...seventh, slotId: slotIds[5] }),
    { accepted: false, reason: 'occupied' }
  );
  const released = system.releaseSoldier(
    'farmhouse-test',
    reservations[0].soldierKey
  );
  assert.deepEqual(released.releasedSlots, [slotIds[0]]);
  assert.deepEqual(
    Object.keys(system.getBuildingSnapshot('farmhouse-test').occupancy).sort(),
    slotIds.slice(1).sort()
  );

  const transitIdentity = request(slotIds[0], 5);
  assert.equal(
    system.resolveReservations('farmhouse-test', [transitIdentity])[0].accepted,
    true
  );
  const transit = system.startTransit('farmhouse-test', {
    ...transitIdentity,
    portalId: 'front-door',
    fromNodeId: 'outside',
    toNodeId: slotIds[0]
  });
  assert.equal(transit.accepted, true);
  const arrived = system.advanceTransit(
    'farmhouse-test',
    transit.location,
    FR_FARMHOUSE_8X6_1F.portals[0].transitSeconds
  );
  assert.equal(arrived.complete, true);
  assert.equal(arrived.location.nodeId, slotIds[0]);
});

test('generic building interaction admits six individuals and leaves the seventh outside', () => {
  const buildingSystem = new BuildingSystem();
  buildingSystem.registerDescriptor(FR_FARMHOUSE_8X6_1F);
  buildingSystem.addBuilding({
    id: 'farmhouse-interaction',
    descriptorId: FR_FARMHOUSE_8X6_1F.id
  });
  const agents = Array.from({ length: 7 }, (_, index) => ({
    id: `soldier-${index}`,
    record: {},
    position: new THREE.Vector3(0, 0, 7),
    velocity: new THREE.Vector3(),
    buildingLocation: null,
    get isAlive() {
      return true;
    },
    syncRecord() {
      this.record.buildingLocation = this.buildingLocation
        ? structuredClone(this.buildingLocation)
        : null;
    }
  }));
  const unit = {
    id: 'farmhouse-squad',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 7),
    collisionRadius: 0.32,
    soldierAI: {
      agents,
      getLivingAgents: () => agents,
      syncMeshes() {}
    }
  };
  const interactions = new BuildingInteractionSystem({
    buildingSystem,
    getUnits: () => [unit]
  });

  const order = interactions.issueEnter(
    unit,
    'farmhouse-interaction',
    'ground-floor'
  );
  assert.equal(order.accepted, true);
  assert.equal(order.assigned.length, 6);
  assert.equal(order.unassigned, 1);
  for (const agent of agents.slice(0, 6)) {
    agent.position.fromArray(order.approachPosition);
  }
  interactions.advance(0);
  assert.ok(
    agents.slice(0, 6).every(
      agent => agent.buildingLocation?.phase === 'transit'
    )
  );
  interactions.advance(FR_FARMHOUSE_8X6_1F.portals[0].transitSeconds);
  assert.ok(
    agents.slice(0, 6).every(
      agent => agent.buildingLocation?.phase === 'occupied'
    )
  );
  assert.equal(agents[6].buildingLocation, null);
  assert.deepEqual(
    Object.keys(
      buildingSystem.getBuildingSnapshot('farmhouse-interaction').occupancy
    ).sort(),
    [
      'ground-front-left',
      'ground-front-right',
      'ground-middle-left',
      'ground-middle-right',
      'ground-rear-interior',
      'ground-rear-left'
    ]
  );
});

test('rotated foundation samples and records its actual non-flat world corners', () => {
  const centerX = 17;
  const centerZ = -11;
  const foundationTopY = 20;
  const rotationY = Math.PI / 3;
  const getHeightAt = (worldX, worldZ) => (
    1.5 + worldX * 0.07 - worldZ * 0.04 + worldX * worldZ * 0.002
  );
  const system = new BuildingSystem();
  system.registerDescriptor(FR_FARMHOUSE_8X6_1F);
  const runtime = system.addBuilding({
    id: 'rotated-foundation',
    descriptorId: FR_FARMHOUSE_8X6_1F.id,
    transform: {
      position: [centerX, 0, centerZ],
      rotationY
    }
  });
  const rotated = createFrenchHouseVisual({
    descriptor: FR_FARMHOUSE_8X6_1F,
    runtime,
    centerX,
    centerZ,
    foundationTopY,
    getHeightAt
  });
  const unrotated = createFrenchHouseVisual({
    descriptor: FR_FARMHOUSE_8X6_1F,
    centerX,
    centerZ,
    foundationTopY,
    getHeightAt
  });

  try {
    const halfWidth = (8 + 0.36) * 0.5;
    const halfDepth = (6 + 0.36) * 0.5;
    const localCorners = [
      [-halfWidth, halfDepth],
      [halfWidth, halfDepth],
      [halfWidth, -halfDepth],
      [-halfWidth, -halfDepth]
    ];
    const cosine = Math.cos(rotationY);
    const sine = Math.sin(rotationY);
    const expectedRotated = localCorners.map(([localX, localZ]) => {
      const worldX = centerX + localX * cosine + localZ * sine;
      const worldZ = centerZ - localX * sine + localZ * cosine;
      return [worldX, getHeightAt(worldX, worldZ), worldZ];
    });
    const renderedRotated = foundationBottomWorldCorners(rotated);
    assert.equal(renderedRotated.length, 4);
    for (const corner of renderedRotated) {
      assert.ok(
        Math.abs(corner.y - getHeightAt(corner.x, corner.z)) <= 1e-5,
        `rendered rotated bottom at ${corner.x},${corner.z} follows terrain`
      );
    }
    assertWorldCornersClose(
      sortWorldCorners(rotated.userData.foundation.footprintCorners),
      sortWorldCorners(expectedRotated),
      1e-12
    );
    assertWorldCornersClose(
      renderedRotated.map(corner => corner.toArray()),
      sortWorldCorners(rotated.userData.foundation.footprintCorners)
    );

    const expectedUnrotated = localCorners.map(([localX, localZ]) => {
      const worldX = centerX + localX;
      const worldZ = centerZ + localZ;
      const localBottomY = getHeightAt(worldX, worldZ) - foundationTopY;
      return [worldX, localBottomY + foundationTopY, worldZ];
    });
    assert.deepEqual(
      unrotated.userData.foundation.footprintCorners,
      expectedUnrotated,
      'rotation-zero foundation metadata preserves the prior corner order'
    );
    const renderedUnrotated = foundationBottomWorldCorners(unrotated);
    assert.equal(renderedUnrotated.length, 4);
    for (const corner of renderedUnrotated) {
      assert.ok(
        Math.abs(corner.y - getHeightAt(corner.x, corner.z)) <= 1e-5,
        `rendered unrotated bottom at ${corner.x},${corner.z} follows terrain`
      );
    }
  } finally {
    disposeFrenchHouseVisual(rotated);
    disposeFrenchHouseVisual(unrotated);
  }
});

test('exact rotated Stonne placement avoids authored obstacles and initial units', () => {
  const farmhousePlacement = STONNE_1940_MAP.structures.find(
    structure => structure.id === FARMHOUSE_ID
  );
  assert.deepEqual(farmhousePlacement, {
    id: FARMHOUSE_ID,
    descriptorId: FR_FARMHOUSE_8X6_1F.id,
    visualAdapterId: FR_FARMHOUSE_8X6_1F.id,
    position: [-45, 34],
    rotationY: Math.PI / 2,
    foundationClearance: 0.12,
    destructionThresholds: {
      approximation: 'gameplay approximation; not historical survey evidence',
      sectionCollapse: [
        { sectionId: 'ground-shell', atOrBelowHealthFraction: 0.12 },
        { sectionId: 'roof', atOrBelowHealthFraction: 0.18 }
      ]
    }
  });
  const farmhouse = rotatedFootprint(
    FR_FARMHOUSE_8X6_1F,
    farmhousePlacement
  );
  assert.deepEqual(
    {
      minX: farmhouse.minX,
      maxX: farmhouse.maxX,
      minZ: farmhouse.minZ,
      maxZ: farmhouse.maxZ
    },
    { minX: -48, maxX: -42, minZ: 30, maxZ: 38 }
  );

  const originalPlacement = STONNE_1940_MAP.structures[0];
  const original = rotatedFootprint(FR_HOUSE_12X9_2F, originalPlacement);
  assert.equal(aabbsOverlap(farmhouse, original), false);
  const riverCut = {
    minX: -STONNE_1940_MAP.dimensions.width * 0.5,
    maxX: STONNE_1940_MAP.dimensions.width * 0.5,
    minZ: STONNE_1940_MAP.river.centerZ
      - STONNE_1940_MAP.river.cutWidth * 0.5,
    maxZ: STONNE_1940_MAP.river.centerZ
      + STONNE_1940_MAP.river.cutWidth * 0.5
  };
  assert.equal(aabbsOverlap(farmhouse, riverCut), false);
  const bridgeFootprint = {
    minX: STONNE_1940_MAP.bridge.centerX
      - TERRAIN_SCALE.bridge.roadwayWidth * 0.5,
    maxX: STONNE_1940_MAP.bridge.centerX
      + TERRAIN_SCALE.bridge.roadwayWidth * 0.5,
    minZ: STONNE_1940_MAP.bridge.centerZ
      - STONNE_1940_MAP.bridge.span * 0.5,
    maxZ: STONNE_1940_MAP.bridge.centerZ
      + STONNE_1940_MAP.bridge.span * 0.5
  };
  assert.equal(aabbsOverlap(farmhouse, bridgeFootprint), false);
  assert.ok(
    STONNE_1940_MAP.wallRuns.every(
      run => !aabbsOverlap(
        expandedSegmentBounds(
          run.start,
          run.end,
          TERRAIN_SCALE.stoneWall.thickness
        ),
        farmhouse
      )
    )
  );
  assert.equal(TERRAIN_SCALE.matureTree.canopyRadius, 3.2);
  assert.ok(
    STONNE_1940_MAP.foliage.every(
      entry => !circleIntersectsAabb(
        entry.position,
        TERRAIN_SCALE.matureTree.canopyRadius,
        farmhouse
      )
    )
  );
  const { footprints, infantryUnits } = completeInitialUnitFootprints();
  try {
    assert.deepEqual(
      [...new Set(footprints.map(footprint => footprint.unitId))].sort(),
      STONNE_1940_SCENARIO.units.map(unit => unit.id).sort(),
      'every initial scenario unit contributes its complete footprint'
    );
    assert.ok(
      footprints.every(footprint => !aabbsOverlap(footprint, farmhouse)),
      'no catalog-sized vehicle/structure or individual infantry footprint overlaps'
    );
  } finally {
    for (const unit of infantryUnits) disposeUnitMesh(unit);
  }
});

test('generic systems build two distinct structures and enforce farmhouse apertures', () => {
  const { buildingSystem, terrain } = createTerrain();
  assert.deepEqual(
    buildingSystem.getBuildingIds(),
    ['french_farmhouse_outbuilding', 'french_village_house']
  );
  assert.deepEqual(
    terrain.buildings.map(building => [building.id, building.descriptorId]),
    [
      ['french_village_house', FR_HOUSE_12X9_2F.id],
      [FARMHOUSE_ID, FR_FARMHOUSE_8X6_1F.id]
    ]
  );
  const farmhouse = terrain.buildings.find(building => building.id === FARMHOUSE_ID);
  const original = terrain.buildings.find(
    building => building.id === 'french_village_house'
  );
  assert.notEqual(farmhouse.object, original.object);
  assert.notEqual(
    farmhouse.object.getObjectByName('HouseFoundation'),
    original.object.getObjectByName('HouseFoundation')
  );
  assert.equal(farmhouse.object.userData.descriptorId, FR_FARMHOUSE_8X6_1F.id);
  assert.deepEqual(farmhouse.object.userData.dimensionsMeters, {
    width: 8,
    depth: 6,
    height: 4.82
  });
  assert.equal(
    farmhouse.object.getObjectByName('HouseStairs').children.length,
    0
  );

  const ballistic = buildingSystem.getCollisionSnapshot(FARMHOUSE_ID).records;
  const movement = buildingSystem
    .getMovementCollisionSnapshot(FARMHOUSE_ID)
    .records;
  const authoredShell = terrain.colliderRecords.filter(
    record => record.buildingId === FARMHOUSE_ID
  );
  const shellBounds = authoredShell.map(record => {
    const cosine = Math.abs(Math.cos(record.rotation ?? 0));
    const sine = Math.abs(Math.sin(record.rotation ?? 0));
    const extentX = cosine * record.halfX + sine * record.halfZ;
    const extentZ = sine * record.halfX + cosine * record.halfZ;
    return {
      minX: record.centerX - extentX,
      maxX: record.centerX + extentX,
      minZ: record.centerZ - extentZ,
      maxZ: record.centerZ + extentZ
    };
  });
  assert.deepEqual(
    {
      minX: Number(Math.min(...shellBounds.map(bounds => bounds.minX)).toFixed(6)),
      maxX: Number(Math.max(...shellBounds.map(bounds => bounds.maxX)).toFixed(6)),
      minZ: Number(Math.min(...shellBounds.map(bounds => bounds.minZ)).toFixed(6)),
      maxZ: Number(Math.max(...shellBounds.map(bounds => bounds.maxZ)).toFixed(6))
    },
    { minX: -48, maxX: -42, minZ: 30, maxZ: 38 },
    'rotated movement shell retains the exact authored 8 m by 6 m footprint'
  );
  for (const partId of [
    'front-door',
    'front-left-window',
    'front-right-window'
  ]) {
    assert.equal(
      ballistic.some(record => record.partId === partId),
      false,
      `${partId} is an open ballistic/LOS aperture`
    );
    assert.equal(
      movement.some(record => record.partId === partId),
      true,
      `${partId} remains in the ordinary movement shell`
    );
  }
  assert.deepEqual(
    movement
      .filter(record => [
        'front-door',
        'front-left-window',
        'front-right-window'
      ].includes(record.partId))
      .map(record => [record.partId, record.movementPolicy]),
    [
      ['front-door', 'portal_transit_required'],
      ['front-left-window', 'fire_port_blocks_movement'],
      ['front-right-window', 'fire_port_blocks_movement']
    ],
    'the public movement snapshot exposes all three exact opening policies'
  );
  assert.equal(
    terrain.collisionWorld.resolveCircleMotion(
      { x: -40, z: 34 },
      { x: -6, z: 0 },
      0.25,
      { moverType: 'infantry' }
    ).blocked,
    true,
    'ordinary movement cannot use the open front door'
  );
  assert.equal(
    terrain.collisionWorld.resolveCircleMotion(
      { x: -40, z: 36.4 },
      { x: -6, z: 0 },
      0.25,
      { moverType: 'infantry' }
    ).blocked,
    true,
    'ordinary movement cannot use a front firing aperture'
  );

  const tierBounds = farmhouse.object.userData.lodTiers.map(
    tier => roundedTierBounds(tier.group)
  );
  assert.ok(
    tierBounds.every(bounds => (
      JSON.stringify(bounds) === JSON.stringify(tierBounds[0])
    ))
  );
  const semanticExpectations = {
    high: [
      {
        name: 'HouseOpening:front-door-aperture',
        semantic: 'opening',
        sectionId: null,
        openingId: 'front-door-aperture',
        kind: 'door',
        lod: null
      },
      {
        name: 'HouseFrame:front-left-window-aperture',
        semantic: 'opening-frame',
        sectionId: null,
        openingId: 'front-left-window-aperture',
        kind: 'window',
        lod: null
      },
      {
        name: 'HouseFrame:front-right-window-aperture',
        semantic: 'opening-frame',
        sectionId: null,
        openingId: 'front-right-window-aperture',
        kind: 'window',
        lod: null
      },
      {
        name: 'HouseGabledRoof',
        semantic: 'roof-silhouette',
        sectionId: 'roof',
        openingId: null,
        kind: null,
        lod: null
      }
    ],
    medium: [
      {
        name: 'HouseCheapOpening:medium:front-door-aperture',
        semantic: 'opening',
        sectionId: null,
        openingId: 'front-door-aperture',
        kind: 'door',
        lod: 'medium'
      },
      {
        name: 'HouseCheapOpening:medium:front-left-window-aperture',
        semantic: 'opening',
        sectionId: null,
        openingId: 'front-left-window-aperture',
        kind: 'window',
        lod: 'medium'
      },
      {
        name: 'HouseCheapOpening:medium:front-right-window-aperture',
        semantic: 'opening',
        sectionId: null,
        openingId: 'front-right-window-aperture',
        kind: 'window',
        lod: 'medium'
      },
      {
        name: 'HouseCheapRoof',
        semantic: 'roof-silhouette',
        sectionId: 'roof',
        openingId: null,
        kind: null,
        lod: 'medium'
      }
    ],
    core: [
      {
        name: 'HouseCheapOpening:core:front-door-aperture',
        semantic: 'opening',
        sectionId: null,
        openingId: 'front-door-aperture',
        kind: 'door',
        lod: 'core'
      },
      {
        name: 'HouseCheapOpening:core:front-left-window-aperture',
        semantic: 'opening',
        sectionId: null,
        openingId: 'front-left-window-aperture',
        kind: 'window',
        lod: 'core'
      },
      {
        name: 'HouseCheapOpening:core:front-right-window-aperture',
        semantic: 'opening',
        sectionId: null,
        openingId: 'front-right-window-aperture',
        kind: 'window',
        lod: 'core'
      },
      {
        name: 'HouseCheapRoof',
        semantic: 'roof-silhouette',
        sectionId: 'roof',
        openingId: null,
        kind: null,
        lod: 'core'
      }
    ],
    proxy: [
      {
        name: 'HouseCheapOpening:proxy:front-door-aperture',
        semantic: 'opening',
        sectionId: null,
        openingId: 'front-door-aperture',
        kind: 'door',
        lod: 'proxy'
      },
      {
        name: 'HouseCheapOpening:proxy:front-left-window-aperture',
        semantic: 'opening',
        sectionId: null,
        openingId: 'front-left-window-aperture',
        kind: 'window',
        lod: 'proxy'
      },
      {
        name: 'HouseCheapOpening:proxy:front-right-window-aperture',
        semantic: 'opening',
        sectionId: null,
        openingId: 'front-right-window-aperture',
        kind: 'window',
        lod: 'proxy'
      },
      {
        name: 'HouseCheapRoof',
        semantic: 'roof-silhouette',
        sectionId: 'roof',
        openingId: null,
        kind: null,
        lod: 'proxy'
      }
    ]
  };
  for (const tier of farmhouse.object.userData.lodTiers) {
    for (const expected of semanticExpectations[tier.lod]) {
      const object = tier.group.getObjectByName(expected.name);
      assert.ok(object, `${tier.lod} retains ${expected.name}`);
      assert.deepEqual(
        {
          name: object.name,
          semantic: object.userData.semantic ?? null,
          sectionId: object.userData.sectionId ?? null,
          openingId: object.userData.openingId ?? null,
          kind: object.userData.kind ?? null,
          lod: object.userData.lod ?? null
        },
        expected
      );
    }
  }

  for (const building of terrain.buildings) {
    disposeFrenchHouseVisual(building.object);
  }
});

test('farmhouse damage, collapse, events, and restore stay descriptor-authoritative', () => {
  const { buildingSystem, terrain } = createTerrain();
  const baseline = buildingSystem.captureState();
  const originalBaseline = buildingSystem.getBuildingSnapshot(
    'french_village_house'
  );
  const breach = buildingSystem.applyProjectileDamage(FARMHOUSE_ID, {
    sectionId: 'ground-shell',
    colliderPartId: 'rear-wall',
    amount: 400,
    penetrationMm: 300
  });
  assert.equal(breach.result.penetrated, true);
  assert.equal(breach.result.breached, true);
  terrain.syncBuildingRuntime(FARMHOUSE_ID);
  const farmhouseVisual = terrain.buildings.find(
    building => building.id === FARMHOUSE_ID
  ).object;
  for (const tier of farmhouseVisual.userData.lodTiers) {
    const part = tier.group.getObjectByName(
      tier.lod === 'high'
        ? 'SectionPart:ground-shell:rear-wall'
        : `SectionPart:${tier.lod}:ground-shell:rear-wall`
    );
    assert.equal(part.visible, false, `${tier.lod} projects the exact breach`);
  }

  const collapse = buildingSystem.applyBlastDamage(FARMHOUSE_ID, {
    sectionDamages: [{ sectionId: 'roof', amount: 1000 }]
  });
  assert.equal(collapse.results[0].collapsed, true);
  terrain.syncBuildingRuntime(FARMHOUSE_ID);
  const damaged = buildingSystem.getBuildingSnapshot(FARMHOUSE_ID);
  assert.equal(damaged.rubbleActive, true);
  assert.ok(damaged.events.some(event => (
    event.type === 'section_breached' && event.sectionId === 'ground-shell'
  )));
  assert.ok(damaged.events.some(event => (
    event.type === 'section_collapsed' && event.sectionId === 'roof'
  )));
  assert.ok(
    buildingSystem
      .getMovementCollisionSnapshot(FARMHOUSE_ID)
      .records.some(record => record.sectionId === 'rubble')
  );
  assert.equal(farmhouseVisual.getObjectByName('HouseGabledRoof').visible, false);
  assert.equal(farmhouseVisual.getObjectByName('HouseRubble').visible, true);
  assert.deepEqual(
    buildingSystem.getBuildingSnapshot('french_village_house'),
    originalBaseline
  );

  buildingSystem.restoreState(baseline);
  terrain.syncBuildingRuntime(FARMHOUSE_ID);
  assert.deepEqual(buildingSystem.captureState(), baseline);
  assert.equal(
    farmhouseVisual
      .getObjectByName('SectionPart:ground-shell:rear-wall')
      .visible,
    true
  );
  assert.equal(farmhouseVisual.getObjectByName('HouseGabledRoof').visible, true);
  assert.equal(farmhouseVisual.getObjectByName('HouseRubble').visible, false);

  for (const building of terrain.buildings) {
    disposeFrenchHouseVisual(building.object);
  }
});
