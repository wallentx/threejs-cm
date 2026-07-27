import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CommandSystem } from '../src/game/CommandSystem.js';
import { StaticCollisionWorld } from '../src/simulation/collision/StaticCollisionWorld.js';
import { Unit as TestUnit } from './helpers/France1940TestUnit.js';

function createUnit({
  position = new THREE.Vector3(0, 0, -8),
  waypoints = [],
  currentWaypointIndex = 0,
  collisionWorld = null,
  type = 'infantry_squad'
} = {}) {
  const unit = {
    faction: 'french',
    type,
    position,
    waypoints: [...waypoints],
    currentWaypointIndex,
    collisionRadius: 0.32,
    collisionWorld,
    soldierAI: {
      getLivingAgents: () => [{ index: 0 }, { index: 1 }],
      getFormationOffset: (index, orderType) => new THREE.Vector3(
        index ? 3 : 0,
        0,
        orderType === 'FAST' ? 4 : 2
      )
    },
    addWaypoint(positionValue, orderType) {
      if (this.currentWaypointIndex >= this.waypoints.length && this.waypoints.length > 0) {
        this.waypoints = [];
        this.currentWaypointIndex = 0;
      }
      this.waypoints.push({ position: positionValue.clone(), orderType });
    }
  };
  return unit;
}

function issueMove(commands, unit, point, mode = 'MOVE_QUICK') {
  commands.setActiveUnit(unit);
  commands.setCommandMode(mode);
  assert.equal(commands.handleMapClick(point), true);
}

test('ordinary infantry commands use the injected graph with formation clearance', () => {
  const scene = new THREE.Scene();
  let call = null;
  const unit = createUnit({
    collisionWorld: {
      getNavigationPath(...args) {
        call = args;
        return [{ x: 12, z: 8 }];
      }
    }
  });
  const commands = new CommandSystem(scene, {
    terrain: {
      getMovementHeightAt: () => 99,
      getHeightAt: () => 88
    },
    isSetupPhase: () => false
  });
  const click = new THREE.Vector3(12, 7, 8);

  issueMove(commands, unit, click, 'MOVE_FAST');

  assert.deepEqual(call, [
    { x: 0, z: -8 },
    { x: 12, z: 8 },
    0.32,
    'infantry',
    { waypointClearance: 5.8 }
  ]);
  assert.equal(unit.waypoints.length, 1, 'an unobstructed route remains one command waypoint');
  assert.deepEqual(unit.waypoints[0].position.toArray(), [12, 7, 8]);
  assert.equal(unit.waypoints[0].orderType, 'FAST');
});

test('wall detours are deterministic, terrain-grounded, and retain the clicked endpoint', () => {
  const scene = new THREE.Scene();
  const world = new StaticCollisionWorld([{
    id: 'wall:long',
    type: 'stonewall',
    centerX: 0,
    centerZ: 0,
    halfX: 20,
    halfZ: 0.3,
    blocks: ['infantry']
  }]);
  const terrain = {
    getMovementHeightAt: (x, z) => x * 0.1 + z * 0.01
  };
  const click = new THREE.Vector3(0, 13, 8);
  const first = createUnit({ collisionWorld: world });
  const second = createUnit({ collisionWorld: world });
  const firstCommands = new CommandSystem(scene, { terrain, isSetupPhase: () => false });
  const secondCommands = new CommandSystem(new THREE.Scene(), { terrain, isSetupPhase: () => false });

  issueMove(firstCommands, first, click);
  issueMove(secondCommands, second, click);

  const firstPoints = first.waypoints.map(waypoint => waypoint.position.toArray());
  assert.deepEqual(second.waypoints.map(waypoint => waypoint.position.toArray()), firstPoints);
  assert.ok(firstPoints.length >= 3, 'wall crossing requires corner waypoints');
  assert.ok(
    firstPoints.slice(0, -1).some(([x]) => Math.abs(x) > 23.9),
    JSON.stringify(firstPoints)
  );
  for (const waypoint of first.waypoints.slice(0, -1)) {
    assert.equal(waypoint.position.y, terrain.getMovementHeightAt(waypoint.position.x, waypoint.position.z));
    assert.equal(waypoint.orderType, 'QUICK');
  }
  assert.deepEqual(firstPoints.at(-1), click.toArray());
});

test('a live six-man formation remains clear of a wall at early waypoint acceptance', () => {
  const wall = {
    id: 'wall:formation-clearance',
    type: 'stonewall',
    centerX: 0,
    centerZ: 0,
    halfX: 20,
    halfZ: 0.3,
    blocks: ['infantry']
  };
  const unit = new TestUnit({
    id: 'navigation-six-man-squad',
    position: new THREE.Vector3(0, 0, -8),
    squadSize: 6
  });
  unit.bindCollisionWorld(new StaticCollisionWorld([wall]));
  const commands = new CommandSystem(new THREE.Scene(), {
    terrain: { getMovementHeightAt: () => 0 },
    isSetupPhase: () => false
  });

  issueMove(commands, unit, new THREE.Vector3(0, 0, 8));

  let priorAnchor = unit.position.clone();
  for (const waypoint of unit.waypoints.slice(0, -1)) {
    const direction = waypoint.position.clone().sub(priorAnchor).setY(0).normalize();
    const earlyAnchor = waypoint.position.clone().addScaledVector(direction, -0.8);
    const rotation = Math.atan2(direction.x, direction.z);
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    for (const agent of unit.soldierAI.getLivingAgents()) {
      const offset = unit.soldierAI.getFormationOffset(agent.index, 'QUICK');
      const goalX = earlyAnchor.x + cosine * offset.x + sine * offset.z;
      const goalZ = earlyAnchor.z - sine * offset.x + cosine * offset.z;
      assert.ok(
        Math.abs(goalX) > wall.halfX + unit.collisionRadius
          || Math.abs(goalZ) > wall.halfZ + unit.collisionRadius,
        `formation goal ${agent.id} enters the radius-expanded wall at ${goalX}, ${goalZ}`
      );
    }
    priorAnchor = waypoint.position.clone();
  }
});

test('appended routes start at the pending tail and retain existing waypoints', () => {
  const calls = [];
  const unit = createUnit({
    waypoints: [{ position: new THREE.Vector3(4, 3, 5), orderType: 'MOVE' }],
    collisionWorld: {
      getNavigationPath(start, goal) {
        calls.push({ start, goal });
        return [start, { x: 8, z: 6 }, goal];
      }
    }
  });
  const commands = new CommandSystem(new THREE.Scene(), {
    terrain: { getHeightAt: (x, z) => x + z },
    isSetupPhase: () => false
  });

  issueMove(commands, unit, new THREE.Vector3(10, 17, 7), 'MOVE_HUNT');

  assert.deepEqual(calls[0].start, { x: 4, z: 5 });
  assert.equal(unit.waypoints.length, 3);
  assert.deepEqual(unit.waypoints[0].position.toArray(), [4, 3, 5]);
  assert.deepEqual(unit.waypoints[1].position.toArray(), [8, 14, 6]);
  assert.deepEqual(unit.waypoints[2].position.toArray(), [10, 17, 7]);
  assert.deepEqual(unit.waypoints.slice(1).map(waypoint => waypoint.orderType), ['HUNT', 'HUNT']);
});

test('completed queues start from the live position and unsupported movers retain direct waypoints', () => {
  const calls = [];
  const completed = createUnit({
    position: new THREE.Vector3(2, 1, 3),
    waypoints: [{ position: new THREE.Vector3(9, 0, 9), orderType: 'MOVE' }],
    currentWaypointIndex: 1,
    collisionWorld: {
      getNavigationPath(start, goal) {
        calls.push(start);
        return [goal];
      }
    }
  });
  const commands = new CommandSystem(new THREE.Scene(), { isSetupPhase: () => false });

  issueMove(commands, completed, new THREE.Vector3(7, 4, 6));
  assert.deepEqual(calls, [{ x: 2, z: 3 }]);
  assert.equal(completed.waypoints.length, 1, 'Unit.addWaypoint cleanup remains authoritative');
  assert.deepEqual(completed.waypoints[0].position.toArray(), [7, 4, 6]);

  const vehicle = createUnit({ type: 'tank', collisionWorld: { getNavigationPath() { throw new Error('must not plan vehicles'); } } });
  issueMove(commands, vehicle, new THREE.Vector3(3, 2, 4), 'MOVE_REVERSE');
  assert.equal(vehicle.waypoints.length, 1);
  assert.deepEqual(vehicle.waypoints[0].position.toArray(), [3, 2, 4]);
  assert.equal(vehicle.waypoints[0].orderType, 'REVERSE');
});

test('an empty graph result falls back to the clicked waypoint and clears a completed queue', () => {
  const unit = createUnit({
    position: new THREE.Vector3(2, 1, 3),
    waypoints: [{ position: new THREE.Vector3(9, 0, 9), orderType: 'MOVE' }],
    currentWaypointIndex: 1,
    collisionWorld: new StaticCollisionWorld()
  });
  const commands = new CommandSystem(new THREE.Scene(), { isSetupPhase: () => false });
  const click = new THREE.Vector3(2, 7, 3);

  issueMove(commands, unit, click, 'MOVE_FAST');

  assert.equal(unit.waypoints.length, 1);
  assert.deepEqual(unit.waypoints[0].position.toArray(), click.toArray());
  assert.equal(unit.waypoints[0].orderType, 'FAST');
  assert.equal(unit.currentWaypointIndex, 0);
});

test('setup movement and infantry without a graph preserve their direct behaviors', () => {
  const setupUnit = createUnit({
    collisionWorld: { getNavigationPath() { throw new Error('setup must not plan'); } }
  });
  setupUnit.soldierAI.syncMeshes = () => {};
  setupUnit.clearWaypoints = function clearWaypoints() {
    this.waypoints = [];
    this.currentWaypointIndex = 0;
  };
  const setupCommands = new CommandSystem(new THREE.Scene(), {
    deploymentZones: { french: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 } },
    terrain: { getHeightAt: () => 6 },
    isSetupPhase: () => true
  });

  issueMove(setupCommands, setupUnit, new THREE.Vector3(4, 0, 5));
  assert.deepEqual(setupUnit.position.toArray(), [4, 6, 5]);
  assert.equal(setupUnit.waypoints.length, 0);

  const noGraphUnit = createUnit();
  const ordinaryCommands = new CommandSystem(new THREE.Scene(), { isSetupPhase: () => false });
  issueMove(ordinaryCommands, noGraphUnit, new THREE.Vector3(6, 4, 7));
  assert.deepEqual(noGraphUnit.waypoints[0].position.toArray(), [6, 4, 7]);
});
