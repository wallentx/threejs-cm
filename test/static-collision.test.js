import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  StaticCollisionWorld,
  createCapsuleOffsets
} from '../src/simulation/collision/StaticCollisionWorld.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { BuildingInteractionSystem } from '../src/game/BuildingInteractionSystem.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { TerrainBuilder } from './helpers/France1940TestTerrain.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { FR_FARMHOUSE_8X6_1F } from '../src/maps/france/FranceFarmhouse8x6_1F.js';
import {
  createFrenchHouseVisualAdapter
} from '../src/world/buildings/FrenchHouse.js';

const STRUCTURE_ADAPTERS = Object.freeze({
  [FR_HOUSE_12X9_2F.id]: createFrenchHouseVisualAdapter(FR_HOUSE_12X9_2F),
  [FR_FARMHOUSE_8X6_1F.id]:
    createFrenchHouseVisualAdapter(FR_FARMHOUSE_8X6_1F)
});

function createTerrain(buildingSystem = new BuildingSystem()) {
  buildingSystem.registerDescriptor(FR_HOUSE_12X9_2F);
  buildingSystem.registerDescriptor(FR_FARMHOUSE_8X6_1F);
  return new TerrainBuilder(new THREE.Scene(), {
    mapDescriptor: STONNE_1940_MAP,
    buildingSystem,
    structureAdapters: STRUCTURE_ADAPTERS
  });
}

const WALL = Object.freeze({
  id: 'wall',
  type: 'stonewall',
  centerX: 0,
  centerZ: 0,
  halfX: 6,
  halfZ: 0.3,
  rotation: 0,
  blocks: ['vehicle', 'infantry']
});

test('swept vehicle capsule cannot tunnel through a wall and slides along it', () => {
  const world = new StaticCollisionWorld([WALL]);
  const radius = 1.1;
  const offsets = createCapsuleOffsets(5, radius);
  const resolved = world.resolveFootprintMotion(
    { x: -4, z: -8 },
    { x: 8, z: 16 },
    { moverType: 'vehicle', radius, offsets, rotation: 0 }
  );

  assert.equal(resolved.blocked, true);
  assert.ok(resolved.z <= -(WALL.halfZ + radius));
  assert.ok(resolved.x > -1, 'remaining motion should slide along the wall face');
});

test('large accelerated movement and bounded frame steps resolve to the same wall contact', () => {
  const world = new StaticCollisionWorld([WALL]);
  const oneStep = world.resolveCircleMotion(
    { x: 0, z: -20 },
    { x: 0, z: 40 },
    0.4,
    { moverType: 'infantry' }
  );
  let many = { x: 0, z: -20 };
  for (let index = 0; index < 20; index++) {
    many = world.resolveCircleMotion(
      many,
      { x: 0, z: 2 },
      0.4,
      { moverType: 'infantry' }
    );
  }

  assert.ok(Math.abs(oneStep.x - many.x) < 1e-9);
  assert.ok(Math.abs(oneStep.z - many.z) < 2e-5);
  assert.ok(oneStep.z < 0);
});

test('building collision snapshots accept halfWidth and halfDepth aliases', () => {
  const world = new StaticCollisionWorld([{
    id: 'building:alias',
    type: 'building',
    centerX: 4,
    centerZ: -3,
    halfWidth: 2.5,
    halfDepth: 1.75,
    blocks: ['infantry', 'vehicle']
  }]);
  const record = world.getCollider('building:alias');

  assert.equal(record.halfX, 2.5);
  assert.equal(record.halfZ, 1.75);
  assert.equal(world.resolveCircleMotion(
    { x: 4, z: -8 },
    { x: 0, z: 10 },
    0.32,
    { moverType: 'infantry' }
  ).blocked, true);
});

test('static navigation keeps an obstacle-free route direct', () => {
  const world = new StaticCollisionWorld([WALL]);
  const path = world.getNavigationPath(
    { x: -10, z: -4 },
    { x: 10, z: -4 },
    0.32,
    'infantry'
  );

  assert.deepEqual(path, [{ x: 10, z: -4 }]);
});

test('static navigation deterministically routes around a long wall', () => {
  const world = new StaticCollisionWorld([{
    ...WALL,
    id: 'wall:long',
    halfX: 20
  }]);
  const start = { x: 0, z: -8 };
  const goal = { x: 0, z: 8 };
  const first = world.getNavigationPath(start, goal, 0.5, 'infantry');
  const second = world.getNavigationPath(start, goal, 0.5, 'infantry');

  assert.deepEqual(second, first);
  assert.equal(first.at(-1).x, goal.x);
  assert.equal(first.at(-1).z, goal.z);
  assert.ok(first.length >= 3, 'wall detour should include both expanded end corners');
  assert.ok(
    first.some(point => Math.abs(point.x) > 20.5),
    'detour must clear an end of the mover-expanded wall'
  );

  let cursor = start;
  for (const point of first) {
    const resolved = world.resolveCircleMotion(
      cursor,
      { x: point.x - cursor.x, z: point.z - cursor.z },
      0.5,
      { moverType: 'infantry' }
    );
    assert.equal(resolved.blocked, false);
    cursor = point;
  }
});

test('authored house-lot gate lets a live squad occupy the upper floor', () => {
  const buildings = new BuildingSystem();
  const terrain = createTerrain(buildings);
  terrain.buildRiverAndBridge();
  terrain.buildStoneWalls();
  terrain.buildStructures();
  const unit = new Unit({
    id: 'authored_wall_route_squad',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(45, 0, 78)
  });
  unit.position.y = terrain.getMovementHeightAt(unit.position.x, unit.position.z);
  unit.mesh.position.copy(unit.position);
  terrain.registerUnitColliders([unit]);
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => [unit]
  });
  const order = interactions.issueEnter(
    unit,
    'french_village_house',
    'upper-floor'
  );
  assert.equal(order.accepted, true);
  const formationClearance = Math.max(
    ...unit.soldierAI.getLivingAgents().map(agent =>
      unit.soldierAI.getFormationOffset(agent.index, 'QUICK').length()
    )
  );
  const targetBuildingColliderIds = terrain.collisionWorld.getRecords()
    .filter(record => record.buildingId === 'french_village_house')
    .map(record => record.id);
  const path = [];
  let routeStart = { x: unit.position.x, z: unit.position.z };
  for (const routePoint of order.approachRoute) {
    const segment = terrain.collisionWorld.getNavigationPath(
      routeStart,
      { x: routePoint[0], z: routePoint[2] },
      unit.collisionRadius,
      'infantry',
      {
        ignoreColliderIds: targetBuildingColliderIds,
        waypointClearance: 0.8 + formationClearance
      }
    );
    path.push(...segment);
    routeStart = { x: routePoint[0], z: routePoint[2] };
  }
  const gate = STONNE_1940_MAP.wallEnclosures
    .find(enclosure => enclosure.id === 'village-house-lot')
    .gateOpenings[0];
  const routePoints = [
    { x: unit.position.x, z: unit.position.z },
    ...path
  ];
  const crossing = routePoints.slice(1).map((point, index) => {
    const previous = routePoints[index];
    if (
      (previous.z - gate.start[1]) * (point.z - gate.start[1]) > 0
      || previous.z === point.z
    ) {
      return null;
    }
    const t = (gate.start[1] - previous.z) / (point.z - previous.z);
    return previous.x + (point.x - previous.x) * t;
  }).find(value => value != null);
  assert.ok(crossing != null, 'the building route must cross the front boundary');
  const requiredClearance = unit.collisionRadius + 0.8 + formationClearance;
  assert.ok(
    crossing > gate.start[0] + requiredClearance
      && crossing < gate.end[0] - requiredClearance,
    'the route must cross through the authored gate with formation-safe clearance'
  );
  assert.ok(
    path.every(point => point.x > 32 && point.x < 58),
    'the squad should use the gate instead of detouring around the lot'
  );
  for (const point of path) {
    unit.addWaypoint(new THREE.Vector3(
      point.x,
      terrain.getMovementHeightAt(point.x, point.z),
      point.z
    ), 'QUICK');
  }
  for (let step = 0;
    step < 5000
      && unit.soldierAI.getLivingAgents().slice(0, 4)
        .some(agent => agent.buildingLocation?.phase !== 'occupied');
    step++) {
    unit.update(1 / 30, terrain);
    interactions.advance(1 / 30);
  }

  const assigned = unit.soldierAI.getLivingAgents().slice(0, 4);
  assert.deepEqual(
    assigned.map(agent => agent.buildingLocation?.phase),
    ['occupied', 'occupied', 'occupied', 'occupied'],
    JSON.stringify(assigned.map(agent => ({
      id: agent.id,
      phase: agent.buildingLocation?.phase,
      position: agent.position.toArray()
    })))
  );
  assert.ok(assigned.every(agent => agent.buildingLocation?.nodeId.startsWith('upper-')));
});

test('terrain publishes bridge, abutment, river exclusion, wall, and building records', () => {
  const terrain = createTerrain();
  terrain.buildRiverAndBridge();
  terrain.buildStoneWalls();
  terrain.buildStructures();
  const types = new Set(terrain.colliderRecords.map(record => record.type));

  for (const type of [
    'bridge_parapet',
    'bridge_abutment',
    'river_exclusion',
    'stonewall',
    'building'
  ]) {
    assert.ok(types.has(type), `missing ${type} collider records`);
  }
  assert.equal(
    terrain.getMovementHeightAt(0, STONNE_1940_MAP.river.centerZ),
    terrain.bridgeSurface.deckTop
  );
  assert.equal(
    terrain.getMovementHeightAt(20, STONNE_1940_MAP.river.centerZ),
    STONNE_1940_MAP.river.bedLevel
  );
});

test('river exclusion blocks off-bridge travel while bridge roadway remains open', () => {
  const terrain = createTerrain();
  terrain.buildRiverAndBridge();
  const river = STONNE_1940_MAP.river;
  const offBridge = terrain.collisionWorld.resolveCircleMotion(
    { x: 20, z: river.centerZ - 30 },
    { x: 0, z: 60 },
    1,
    { moverType: 'vehicle' }
  );
  const onBridge = terrain.collisionWorld.resolveCircleMotion(
    { x: 0, z: river.centerZ - 30 },
    { x: 0, z: 60 },
    1,
    { moverType: 'vehicle' }
  );

  assert.equal(offBridge.blocked, true);
  assert.ok(offBridge.z < river.centerZ - river.cutWidth * 0.5);
  assert.equal(onBridge.blocked, false);
  assert.ok(onBridge.z > river.centerZ + river.cutWidth * 0.5);
});

test('vehicle orders deterministically route through the bridge opening', () => {
  const terrain = createTerrain();
  terrain.buildRiverAndBridge();
  const unit = new Unit({
    id: 'bridge_vehicle',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3(20, 0, -20)
  });
  terrain.registerUnitColliders([unit]);
  unit.addWaypoint(new THREE.Vector3(18, 0, 40), 'FAST');
  const halfSupportLength =
    unit.vehicleSpec.dimensionsMeters.length * 0.72 * 0.5;
  const fullDeckMinimumZ =
    terrain.bridgeSurface.centerZ
    - terrain.bridgeSurface.halfSpan
    + halfSupportLength;
  const fullDeckMaximumZ =
    terrain.bridgeSurface.centerZ
    + terrain.bridgeSurface.halfSpan
    - halfSupportLength;

  for (let step = 0; step < 600 && unit.currentWaypointIndex === 0; step++) {
    unit.update(0.05, terrain);
    if (unit.position.z > -2 && unit.position.z < 22) {
      assert.ok(
        Math.abs(unit.position.x) < terrain.bridgeSurface.halfRoadwayWidth,
        'vehicle must remain inside bridge roadway while crossing'
      );
      assert.ok(Number.isFinite(unit.position.y));
      if (
        unit.position.z >= fullDeckMinimumZ
        && unit.position.z <= fullDeckMaximumZ
      ) {
        assert.equal(
          unit.vehiclePhysics.hull.targetRideHeight,
          terrain.bridgeSurface.deckTop,
          'all four supports must target the flat bridge deck once fully aboard'
        );
      }
    }
  }

  assert.equal(unit.currentWaypointIndex, 1);
  assert.ok(unit.position.distanceTo(new THREE.Vector3(18, unit.position.y, 40)) < 1);
});

test('near-bank destinations route from actual river exclusion edges', () => {
  const terrain = createTerrain();
  terrain.buildRiverAndBridge();
  const river = STONNE_1940_MAP.river;
  const goal = new THREE.Vector3(
    18,
    0,
    river.centerZ + river.cutWidth * 0.5 + 1.5
  );
  const navigationTarget = terrain.collisionWorld.getNavigationTarget(
    { x: 18, z: river.centerZ - river.cutWidth * 0.5 - 8 },
    goal,
    1,
    'vehicle'
  );

  assert.equal(navigationTarget.routed, true);
  assert.equal(navigationTarget.x, terrain.bridgeSurface.centerX);

  const unit = new Unit({
    id: 'near_bank_vehicle',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3(18, 0, river.centerZ - river.cutWidth * 0.5 - 8)
  });
  terrain.registerUnitColliders([unit]);
  unit.addWaypoint(goal, 'FAST');
  for (let step = 0; step < 800 && unit.currentWaypointIndex === 0; step++) {
    unit.update(1 / 30, terrain);
  }

  assert.equal(unit.currentWaypointIndex, 1);
  assert.ok(Math.hypot(unit.position.x - goal.x, unit.position.z - goal.z) < 1);
});

test('static navigation path preserves bridge crossing stages', () => {
  const terrain = createTerrain();
  terrain.buildRiverAndBridge();
  const river = STONNE_1940_MAP.river;
  const start = { x: 18, z: river.centerZ - river.cutWidth * 0.5 - 8 };
  const goal = { x: 18, z: river.centerZ + river.cutWidth * 0.5 + 8 };
  const path = terrain.collisionWorld.getNavigationPath(
    start,
    goal,
    0.5,
    'infantry'
  );

  assert.ok(path.length >= 3);
  assert.ok(
    path.some(point =>
      point.x === terrain.bridgeSurface.centerX
      && point.z < river.centerZ
    ),
    'path should stage at the bridge entrance'
  );
  assert.ok(
    path.some(point =>
      point.x === terrain.bridgeSurface.centerX
      && point.z > river.centerZ
    ),
    'path should remain centered through the bridge exit'
  );
  assert.deepEqual(path.at(-1), goal);
});

test('soldier stages at wall stand-off and uses tangential space without clipping', () => {
  const terrain = createTerrain();
  terrain.addColliderRecord(WALL);
  const unit = new Unit({
    id: 'wall_staging_squad',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(-4, 0, -4)
  });
  const agent = unit.soldierAI.agents[0];
  agent.position.set(-4, 0, -4);
  agent.velocity.set(0, 0, 0);
  agent.reactionDelay = 0;
  const goal = new THREE.Vector3(4, 0, 4);

  for (let step = 0; step < 120; step++) {
    agent.updateMovement(1 / 30, terrain, {
      anchorMoving: true,
      orderType: 'QUICK',
      goal,
      neighbors: [agent],
      squadPinned: false,
      waypointIndex: 0
    });
  }

  assert.ok(agent.position.z <= -0.62, 'soldier center must retain wall stand-off');
  assert.ok(agent.position.x > 1.5, 'soldier should slide into useful space along the wall');
});

test('infantry anchor cannot complete through a wall', () => {
  const terrain = createTerrain();
  terrain.addColliderRecord({
    ...WALL,
    id: 'wall:impassable',
    halfX: 100
  });
  const unit = new Unit({
    id: 'blocked_squad',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, -4)
  });
  terrain.registerUnitColliders([unit]);
  unit.addWaypoint(new THREE.Vector3(0, 0, 4), 'QUICK');

  for (let step = 0; step < 240; step++) unit.update(1 / 30, terrain);

  assert.ok(unit.position.z <= -(WALL.halfZ + unit.collisionRadius));
  assert.equal(unit.currentWaypointIndex, 0);
  assert.equal(unit.waypoints[0].reached, false);
});

test('infantry waypoint completion waits for every living soldier to arrive', () => {
  const terrain = createTerrain();
  const unit = new Unit({
    id: 'catchup_squad',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 0)
  });
  terrain.registerUnitColliders([unit]);
  const delayedAgent = unit.soldierAI.getLivingAgents()[0];
  delayedAgent.position.set(0, 0, -10);
  delayedAgent.reactionDelay = 0;
  unit.addWaypoint(unit.position.clone(), 'QUICK');

  unit.update(1 / 30, terrain);
  assert.equal(unit.currentWaypointIndex, 0);
  assert.equal(unit.waypoints[0].reached, false);

  for (let step = 0; step < 300 && unit.currentWaypointIndex === 0; step++) {
    unit.update(1 / 30, terrain);
  }
  assert.equal(unit.currentWaypointIndex, 1);
});

test('collision continuation is identical after unit capture and restore', () => {
  const terrain = createTerrain();
  terrain.addColliderRecord(WALL);
  const unit = new Unit({
    id: 'rollback_vehicle',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3(-4, 0, -8)
  });
  terrain.registerUnitColliders([unit]);
  unit.addWaypoint(new THREE.Vector3(4, 0, 8), 'FAST');
  for (let step = 0; step < 10; step++) unit.update(0.05, terrain);
  const snapshot = unit.captureState();

  for (let step = 0; step < 30; step++) unit.update(0.05, terrain);
  const expected = unit.captureState();
  unit.restoreState(snapshot, new Map([[unit.id, unit]]));
  for (let step = 0; step < 30; step++) unit.update(0.05, terrain);
  const replayed = unit.captureState();

  assert.deepEqual(replayed.position, expected.position);
  assert.equal(replayed.rotation, expected.rotation);
  assert.equal(replayed.currentWaypointIndex, expected.currentWaypointIndex);
});

test('destroyed bunker rubble admits infantry but continues to block vehicles', () => {
  const terrain = createTerrain();
  const bunker = new Unit({
    id: 'collision_bunker',
    faction: 'german',
    type: 'bunker',
    position: new THREE.Vector3(0, 0, 0)
  });
  terrain.registerUnitColliders([bunker]);
  const intact = terrain.collisionWorld.getCollider('structure:collision_bunker');
  assert.deepEqual(intact.blocks, ['infantry', 'vehicle']);

  bunker.structureState.health = 0;
  bunker.structureState.destroyed = true;
  bunker.syncStructureVisuals();
  const rubble = terrain.collisionWorld.getCollider('structure:collision_bunker');
  assert.deepEqual(rubble.blocks, ['vehicle']);

  const infantry = terrain.collisionWorld.resolveCircleMotion(
    { x: 0, z: -8 },
    { x: 0, z: 16 },
    0.32,
    { moverType: 'infantry' }
  );
  const vehicle = terrain.collisionWorld.resolveCircleMotion(
    { x: 0, z: -8 },
    { x: 0, z: 16 },
    1,
    { moverType: 'vehicle' }
  );
  assert.equal(infantry.blocked, false);
  assert.equal(vehicle.blocked, true);
});
