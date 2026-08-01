import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpottingSystem } from '../src/game/SpottingSystem.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import {
  deriveOrientedBoxWorldAabb3D,
  intersectSegmentOrientedBox3D,
  segmentIntersectsWorldAabb3D
} from '../src/simulation/geometry/OrientedBox.js';

function collider({
  id,
  buildingId,
  sectionId = id,
  centerX = 0,
  centerY = 1.5,
  centerZ = 0,
  halfWidth = 1,
  halfHeight = 1.5,
  halfDepth = 1,
  rotation = 0,
  orientation
}) {
  return {
    id,
    buildingId,
    sectionId,
    centerX,
    centerY,
    centerZ,
    halfWidth,
    halfHeight,
    halfDepth,
    rotation,
    ...(orientation ? { orientation } : {}),
    blocks: ['projectile']
  };
}

function fakeBuildingSystem(records, buildingIds = null) {
  const ids = buildingIds ?? [...new Set(records.map(record => record.buildingId))];
  return {
    getBuildingIds: () => [...ids],
    getCollisionSnapshot: buildingId => ({
      records: records.filter(record => record.buildingId === buildingId)
    })
  };
}

function makeSpotting(buildingSystem) {
  return new SpottingSystem(null, {
    bocageObstacles: [],
    getHeightAt: () => -100
  }, {
    buildingSystem,
    settings: { baseAcquisitionSeconds: 0.5 }
  });
}

function checkFlatLos(spotting, start, end) {
  return spotting.checkLOS(start, end, {
    fromEyeHeight: 0,
    toAimHeight: 0
  });
}

function makeRealBuilding(rotationY = 0) {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 30], rotationY }
  });
  return buildings;
}

function makeUnit(id, faction, x, z) {
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
    roster: [{
      id: 0,
      role: 'RIFLEMAN',
      status: 'OK',
      health: 100,
      velocity: [0, 0, 0]
    }]
  };
}

function advancePartitioned(spotting, units, seconds, frequency) {
  let previousTime = 0;
  const steps = Math.ceil(seconds * frequency);
  for (let index = 1; index <= steps; index++) {
    const nextTime = Math.round(
      Math.min(seconds, index / frequency) * 1e9
    ) / 1e9;
    spotting.advance(
      index % 2 === 0 ? units : [...units].reverse(),
      nextTime - previousTime
    );
    previousTime = nextTime;
  }
}

test('world AABB broadphase contains exact OBB normalized-tolerance contacts', () => {
  const box = collider({
    id: 'tolerance:box',
    buildingId: 'tolerance',
    centerY: 0,
    halfWidth: 1,
    halfHeight: 1,
    halfDepth: 1
  });
  const bounds = deriveOrientedBoxWorldAabb3D(box);
  const cases = [
    {
      start: { x: -2, y: 1.9999994, z: 0 },
      end: { x: 2, y: -10.0000006, z: 0 }
    },
    {
      start: { x: -2, y: 2_999_998.4, z: 0 },
      end: { x: 2, y: -9_000_001.6, z: 0 }
    },
    {
      start: { x: -2, y: 1, z: 1 },
      end: { x: 2, y: 1, z: 1 }
    }
  ];

  for (const { start, end } of cases) {
    assert.ok(
      intersectSegmentOrientedBox3D(start, end, box),
      'the unchanged exact primitive must accept the adversarial segment'
    );
    assert.equal(
      segmentIntersectsWorldAabb3D(start, end, bounds),
      true,
      'the broadphase must never reject a segment accepted by exact OBB math'
    );
  }
});

test('SpottingSystem checkLOS preserves exact near-corner tolerance hits', () => {
  const box = collider({
    id: 'tolerance:box',
    buildingId: 'tolerance',
    sectionId: 'near-corner',
    centerY: 0,
    halfWidth: 1,
    halfHeight: 1,
    halfDepth: 1
  });
  const cases = [
    {
      start: { x: -2, y: 1.9999994, z: 0 },
      end: { x: 2, y: -10.0000006, z: 0 }
    },
    {
      start: { x: -2, y: 2_999_998.4, z: 0 },
      end: { x: 2, y: -9_000_001.6, z: 0 }
    }
  ];

  for (const { start, end } of cases) {
    const spotting = makeSpotting(fakeBuildingSystem([box]));
    const hit = checkFlatLos(spotting, start, end);
    assert.equal(hit.clear, false);
    assert.equal(hit.buildingId, 'tolerance');
    assert.equal(hit.sectionId, 'near-corner');
    assert.deepEqual(spotting.getLosDiagnostics(), {
      buildingBroadphaseTests: 1,
      buildingBroadphaseRejects: 0,
      buildingExactObbTests: 1
    });
  }
});

test('building-run broadphase rejects definite misses without exact OBB tests', () => {
  const records = [
    collider({ id: 'a:wall', buildingId: 'a', centerX: 50, centerZ: 5 }),
    collider({ id: 'b:wall', buildingId: 'b', centerX: 70, centerZ: 5 }),
    collider({ id: 'c:wall', buildingId: 'c', centerX: 90, centerZ: 5 })
  ];
  const spotting = makeSpotting(fakeBuildingSystem(records));

  assert.equal(checkFlatLos(
    spotting,
    { x: 0, y: 1.5, z: 0 },
    { x: 0, y: 1.5, z: 10 }
  ).clear, true);
  assert.deepEqual(spotting.getLosDiagnostics(), {
    buildingBroadphaseTests: 3,
    buildingBroadphaseRejects: 3,
    buildingExactObbTests: 0
  });
});

test('AABB overlap remains non-authoritative across a rotated building-run gap', () => {
  const records = [
    collider({
      id: 'house:left',
      buildingId: 'house',
      centerX: -3,
      centerZ: 5,
      halfWidth: 1,
      halfDepth: 2,
      rotation: Math.PI / 4
    }),
    collider({
      id: 'house:right',
      buildingId: 'house',
      centerX: 3,
      centerZ: 5,
      halfWidth: 1,
      halfDepth: 2,
      rotation: -Math.PI / 4
    })
  ];
  const spotting = makeSpotting(fakeBuildingSystem(records));

  assert.equal(checkFlatLos(
    spotting,
    { x: 0, y: 1.5, z: 0 },
    { x: 0, y: 1.5, z: 10 }
  ).clear, true);
  assert.deepEqual(spotting.getLosDiagnostics(), {
    buildingBroadphaseTests: 1,
    buildingBroadphaseRejects: 0,
    buildingExactObbTests: 2
  });
});

test('axis-aligned and rotated exact boundary contacts survive broadphase filtering', () => {
  const axis = makeSpotting(fakeBuildingSystem([
    collider({ id: 'axis:wall', buildingId: 'axis', centerZ: 5 })
  ]));
  const axisHit = checkFlatLos(
    axis,
    { x: 1, y: 1.5, z: 0 },
    { x: 1, y: 1.5, z: 10 }
  );
  assert.equal(axisHit.clear, false);
  assert.equal(axisHit.buildingId, 'axis');
  assert.equal(axisHit.sectionId, 'axis:wall');

  const angle = Math.PI / 4;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const localX = 2;
  const localStartZ = -5;
  const localEndZ = 5;
  const rotated = makeSpotting(fakeBuildingSystem([
    collider({
      id: 'rotated:wall',
      buildingId: 'rotated',
      halfWidth: localX,
      halfDepth: 1,
      rotation: angle
    })
  ]));
  const rotatedHit = checkFlatLos(
    rotated,
    {
      x: cosine * localX + sine * localStartZ,
      y: 1.5,
      z: -sine * localX + cosine * localStartZ
    },
    {
      x: cosine * localX + sine * localEndZ,
      y: 1.5,
      z: -sine * localX + cosine * localEndZ
    }
  );
  assert.equal(rotatedHit.clear, false);
  assert.equal(rotatedHit.buildingId, 'rotated');
  assert.equal(rotatedHit.sectionId, 'rotated:wall');
});

test('stable global collider IDs keep first-hit policy instead of nearest-hit policy', () => {
  const records = [
    collider({
      id: 'house:z-near',
      buildingId: 'house',
      sectionId: 'near',
      centerZ: 2
    }),
    collider({
      id: 'house:a-far',
      buildingId: 'house',
      sectionId: 'far',
      centerZ: 8
    })
  ];
  const spotting = makeSpotting(fakeBuildingSystem(records));
  const hit = checkFlatLos(
    spotting,
    { x: 0, y: 1.5, z: 0 },
    { x: 0, y: 1.5, z: 10 }
  );

  assert.equal(hit.clear, false);
  assert.equal(hit.sectionId, 'far');
  assert.equal(spotting.getLosDiagnostics().buildingExactObbTests, 1);
});

test('non-contiguous same-building records remain separate stable traversal runs', () => {
  const records = [
    collider({
      id: '1',
      buildingId: 'a',
      sectionId: 'a-miss',
      centerX: 20,
      centerZ: 2
    }),
    collider({
      id: '2',
      buildingId: 'b',
      sectionId: 'b-first-hit',
      centerZ: 8
    }),
    collider({
      id: '3',
      buildingId: 'a',
      sectionId: 'a-later-hit',
      centerZ: 2
    })
  ];
  const spotting = makeSpotting(fakeBuildingSystem(records, ['a', 'b']));
  const hit = checkFlatLos(
    spotting,
    { x: 0, y: 1.5, z: 0 },
    { x: 0, y: 1.5, z: 10 }
  );

  assert.equal(hit.clear, false);
  assert.equal(hit.sectionId, 'b-first-hit');
  assert.deepEqual(spotting.getLosDiagnostics(), {
    buildingBroadphaseTests: 2,
    buildingBroadphaseRejects: 1,
    buildingExactObbTests: 1
  });
});

test('malformed derived bounds fail open to unchanged exact OBB behavior', () => {
  let halfWidthReads = 0;
  const stateful = collider({ id: 'stateful:wall', buildingId: 'stateful' });
  Object.defineProperty(stateful, 'halfWidth', {
    enumerable: true,
    get() {
      halfWidthReads++;
      return halfWidthReads === 1 ? Number.NaN : 1;
    }
  });
  const spotting = makeSpotting(fakeBuildingSystem([stateful]));
  const hit = checkFlatLos(
    spotting,
    { x: 0, y: 1.5, z: -5 },
    { x: 0, y: 1.5, z: 5 }
  );

  assert.equal(hit.clear, false);
  assert.equal(hit.buildingId, 'stateful');
  assert.equal(spotting.getLosDiagnostics().buildingExactObbTests, 1);

  const malformed = makeSpotting(fakeBuildingSystem([
    collider({
      id: 'malformed:wall',
      buildingId: 'malformed',
      halfHeight: -1
    })
  ]));
  assert.equal(checkFlatLos(
    malformed,
    { x: 0, y: 1.5, z: -5 },
    { x: 0, y: 1.5, z: 5 }
  ).clear, true);
  assert.equal(malformed.getLosDiagnostics().buildingExactObbTests, 1);

  const degenerateOrientation = makeSpotting(fakeBuildingSystem([
    collider({
      id: 'degenerate:wall',
      buildingId: 'degenerate',
      centerX: 50,
      orientation: [0, 0, 0, 0, 0, 0, 0, 0, 0]
    })
  ]));
  const exactLegacyHit = checkFlatLos(
    degenerateOrientation,
    { x: 0, y: 1.5, z: -5 },
    { x: 0, y: 1.5, z: 5 }
  );
  assert.equal(exactLegacyHit.clear, false);
  assert.equal(exactLegacyHit.buildingId, 'degenerate');
  assert.equal(
    degenerateOrientation.getLosDiagnostics().buildingExactObbTests,
    1
  );
});

test('breach and restore invalidation rebuild exact colliders and run bounds together', () => {
  const buildings = makeRealBuilding();
  const intactState = buildings.captureState();
  const spotting = makeSpotting(buildings);
  const start = { x: -1.45, y: 1.45, z: 40 };
  const end = { x: -1.45, y: 1.45, z: 30 };

  assert.equal(checkFlatLos(spotting, start, end).clear, false);
  buildings.applyProjectileDamage('house', {
    sectionId: 'ground-shell',
    colliderPartId: 'ground-left-inner',
    amount: 500,
    penetrationMm: 1000,
    createBreach: true
  });
  spotting.invalidateBuildingColliders();
  assert.equal(checkFlatLos(spotting, start, end).clear, true);

  buildings.restoreState(intactState);
  spotting.invalidateBuildingColliders();
  assert.equal(checkFlatLos(spotting, start, end).clear, false);
});

test('rotated-building spotting remains byte-identical across partitions and unit order', () => {
  const createRun = () => {
    const spotting = makeSpotting(makeRealBuilding(0.37));
    const units = [
      makeUnit('observer', 'blue', 0, 0),
      makeUnit('target', 'red', 0, 60)
    ];
    return { spotting, units };
  };
  const whole = createRun();
  const hz30 = createRun();
  const hz60 = createRun();

  whole.spotting.advance([...whole.units].reverse(), 4);
  advancePartitioned(hz30.spotting, hz30.units, 4, 30);
  advancePartitioned(hz60.spotting, hz60.units, 4, 60);

  assert.deepEqual(hz30.spotting.captureState(), whole.spotting.captureState());
  assert.deepEqual(hz60.spotting.captureState(), whole.spotting.captureState());
  assert.deepEqual(
    hz30.spotting.getVisibilityProjection('blue', hz30.units),
    whole.spotting.getVisibilityProjection('blue', whole.units)
  );
  assert.deepEqual(
    hz60.spotting.getVisibilityProjection('blue', hz60.units),
    whole.spotting.getVisibilityProjection('blue', whole.units)
  );
  assert.equal(
    hz30.spotting.canPrecisionTarget(hz30.units[0], hz30.units[1]),
    whole.spotting.canPrecisionTarget(whole.units[0], whole.units[1])
  );
  assert.equal(
    hz60.spotting.canPrecisionTarget(hz60.units[0], hz60.units[1]),
    whole.spotting.canPrecisionTarget(whole.units[0], whole.units[1])
  );
});

test('LOS diagnostics are mutation-safe and remain outside capture state', () => {
  const spotting = makeSpotting(fakeBuildingSystem([
    collider({ id: 'house:wall', buildingId: 'house', centerX: 50 })
  ]));
  const before = spotting.captureState();

  checkFlatLos(
    spotting,
    { x: 0, y: 1.5, z: 0 },
    { x: 0, y: 1.5, z: 10 }
  );
  const diagnostic = spotting.getLosDiagnostics();
  assert.deepEqual(spotting.captureState(), before);
  diagnostic.buildingBroadphaseTests = 999;
  diagnostic.buildingBroadphaseRejects = 999;
  diagnostic.buildingExactObbTests = 999;
  assert.deepEqual(spotting.getLosDiagnostics(), {
    buildingBroadphaseTests: 1,
    buildingBroadphaseRejects: 1,
    buildingExactObbTests: 0
  });
  assert.deepEqual(spotting.captureState(), before);
});
