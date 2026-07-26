import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  StaticCollisionWorld,
  createCapsuleOffsets
} from '../src/simulation/collision/StaticCollisionWorld.js';
import { Unit } from '../src/game/Unit.js';
import { TerrainBuilder } from '../src/world/TerrainBuilder.js';
import { TERRAIN_SCALE } from '../src/world/TerrainScale.js';

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

test('terrain publishes bridge, abutment, river exclusion, wall, and building records', () => {
  const terrain = new TerrainBuilder(new THREE.Scene());
  terrain.buildRiverAndBridge();
  terrain.buildStoneWalls();
  terrain.buildFrenchVillage();
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
    terrain.getMovementHeightAt(0, TERRAIN_SCALE.river.centerZ),
    terrain.bridgeSurface.deckTop
  );
  assert.equal(
    terrain.getMovementHeightAt(20, TERRAIN_SCALE.river.centerZ),
    TERRAIN_SCALE.river.bedLevel
  );
});

test('river exclusion blocks off-bridge travel while bridge roadway remains open', () => {
  const terrain = new TerrainBuilder(new THREE.Scene());
  terrain.buildRiverAndBridge();
  const river = TERRAIN_SCALE.river;
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
  const terrain = new TerrainBuilder(new THREE.Scene());
  terrain.buildRiverAndBridge();
  const unit = new Unit({
    id: 'bridge_vehicle',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3(20, 0, -20)
  });
  terrain.registerUnitColliders([unit]);
  unit.addWaypoint(new THREE.Vector3(18, 0, 40), 'FAST');

  for (let step = 0; step < 600 && unit.currentWaypointIndex === 0; step++) {
    unit.update(0.05, terrain);
    if (unit.position.z > -2 && unit.position.z < 22) {
      assert.ok(
        Math.abs(unit.position.x) < terrain.bridgeSurface.halfRoadwayWidth,
        'vehicle must remain inside bridge roadway while crossing'
      );
      assert.equal(unit.position.y, terrain.bridgeSurface.deckTop);
    }
  }

  assert.equal(unit.currentWaypointIndex, 1);
  assert.ok(unit.position.distanceTo(new THREE.Vector3(18, unit.position.y, 40)) < 1);
});

test('near-bank destinations route from actual river exclusion edges', () => {
  const terrain = new TerrainBuilder(new THREE.Scene());
  terrain.buildRiverAndBridge();
  const river = TERRAIN_SCALE.river;
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

test('soldier stages at wall stand-off and uses tangential space without clipping', () => {
  const terrain = new TerrainBuilder(new THREE.Scene());
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
  const terrain = new TerrainBuilder(new THREE.Scene());
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
  const terrain = new TerrainBuilder(new THREE.Scene());
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
  const terrain = new TerrainBuilder(new THREE.Scene());
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
  const terrain = new TerrainBuilder(new THREE.Scene());
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
