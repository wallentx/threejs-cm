import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CommandSystem } from '../src/game/CommandSystem.js';
import { GameApp } from '../src/app/GameApp.js';
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
    {
      clearance: 5,
      waypointClearance: 0.8,
      lateralClearance: 3,
      longitudinalClearance: 5.8
    }
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

test('a live six-man formation deterministically detours around a two-metre wall gap and completes', () => {
  const wallHalfWidth = 8;
  const wallInnerEdge = 1;
  const wallCenter = wallHalfWidth + wallInnerEdge;
  const records = [
    {
      id: 'wall:gap:left',
      type: 'stonewall',
      centerX: -wallCenter,
      centerZ: 0,
      halfX: wallHalfWidth,
      halfZ: 0.3,
      blocks: ['infantry']
    },
    {
      id: 'wall:gap:right',
      type: 'stonewall',
      centerX: wallCenter,
      centerZ: 0,
      halfX: wallHalfWidth,
      halfZ: 0.3,
      blocks: ['infantry']
    }
  ];
  const terrain = {
    getHeightAt: () => 0,
    getMovementHeightAt: () => 0
  };
  const click = new THREE.Vector3(0, 4.25, 8);
  const issueDetour = (id) => {
    const unit = new TestUnit({
      id,
      position: new THREE.Vector3(0, 0, -8),
      squadSize: 6
    });
    unit.bindCollisionWorld(new StaticCollisionWorld(records));
    const commands = new CommandSystem(new THREE.Scene(), {
      terrain,
      isSetupPhase: () => false
    });
    issueMove(commands, unit, click);
    return unit;
  };

  const first = issueDetour('navigation-gap-first');
  const second = issueDetour('navigation-gap-second');
  const firstWaypointRecords = first.captureState().waypoints;
  const secondWaypointRecords = second.captureState().waypoints;

  assert.equal(
    JSON.stringify(secondWaypointRecords),
    JSON.stringify(firstWaypointRecords),
    'identical initial formations must receive byte-equal waypoint records'
  );
  assert.ok(first.waypoints.length >= 3, 'the full formation must not route through the narrow gap');
  assert.ok(
    first.waypoints.slice(0, -1).some(waypoint =>
      Math.abs(waypoint.position.x) > wallCenter + wallHalfWidth
    ),
    'the detour must pass an outer wall end'
  );
  assert.ok(first.waypoints.every(waypoint => waypoint.orderType === 'QUICK'));
  assert.deepEqual(first.waypoints.at(-1).position.toArray(), click.toArray());

  let completedSteps = 0;
  while (completedSteps < 2400 && first.currentWaypointIndex < first.waypoints.length) {
    first.update(1 / 30, terrain);
    completedSteps++;
  }

  assert.equal(
    first.currentWaypointIndex,
    first.waypoints.length,
    `all living agents must complete the route within 2400 fixed steps; positions: ${
      JSON.stringify(first.soldierAI.getLivingAgents().map(agent => agent.position.toArray()))
    }`
  );
  assert.ok(first.waypoints.every(waypoint => waypoint.reached));
  assert.equal(first.areLivingInfantryAtFormation('QUICK'), true);
});

test('the squad anchor cannot outrun its individual soldiers by more than the cohesion tether', () => {
  const terrain = {
    getHeightAt: () => 0,
    getMovementHeightAt: () => 0
  };
  const unit = new TestUnit({
    id: 'cohesion-tether-squad',
    position: new THREE.Vector3(),
    squadSize: 6
  });
  unit.addWaypoint(new THREE.Vector3(0, 0, 100), 'QUICK');
  let maximumLag = 0;
  for (let step = 0; step < 600; step++) {
    unit.update(1 / 30, terrain);
    const cosine = Math.cos(unit.rotation);
    const sine = Math.sin(unit.rotation);
    for (const agent of unit.soldierAI.getLivingAgents()) {
      const offset = unit.soldierAI.getFormationOffset(agent.index, 'QUICK');
      const goalX = unit.position.x + cosine * offset.x + sine * offset.z;
      const goalZ = unit.position.z - sine * offset.x + cosine * offset.z;
      maximumLag = Math.max(
        maximumLag,
        Math.hypot(agent.position.x - goalX, agent.position.z - goalZ)
      );
    }
  }
  assert.ok(maximumLag <= 4.05, `maximum formation lag was ${maximumLag}`);
  assert.ok(unit.position.z > 35, 'the tether must pace movement, not freeze it');
});

test('vehicle move orders route around static blockers instead of silently stalling', () => {
  const wall = {
    id: 'wall:vehicle-route',
    type: 'stonewall',
    centerX: 0,
    centerZ: 0,
    halfX: 6,
    halfZ: 0.35,
    blocks: ['vehicle']
  };
  const collisionWorld = new StaticCollisionWorld([wall]);
  const terrain = {
    collisionWorld,
    getHeightAt: () => 0,
    getMovementHeightAt: () => 0
  };
  const vehicle = new TestUnit({
    id: 'routed-panzer',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(0, 0, -12)
  });
  vehicle.bindCollisionWorld(collisionWorld);
  const commands = new CommandSystem(new THREE.Scene(), {
    terrain,
    isSetupPhase: () => false
  });
  issueMove(commands, vehicle, new THREE.Vector3(0, 0, 12), 'MOVE_FAST');

  assert.ok(vehicle.waypoints.length >= 3);
  assert.ok(vehicle.waypoints.slice(0, -1).some(waypoint =>
    Math.abs(waypoint.position.x) > wall.halfX));

  for (let step = 0;
    step < 1800 && vehicle.currentWaypointIndex < vehicle.waypoints.length;
    step++) {
    vehicle.update(1 / 30, terrain);
  }
  assert.equal(vehicle.currentWaypointIndex, vehicle.waypoints.length);
  assert.ok(vehicle.position.z > 11);
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

test('infantry-only movement orders survive route planning and are rejected for vehicles', () => {
  for (const orderType of ['SNEAK', 'CRAWL', 'ASSAULT']) {
    const unit = createUnit({
      collisionWorld: {
        getNavigationPath(start, goal) {
          return [start, { x: 3, z: 1 }, goal];
        }
      }
    });
    const commands = new CommandSystem(new THREE.Scene(), {
      terrain: { getMovementHeightAt: () => 0 },
      isSetupPhase: () => false
    });

    issueMove(
      commands,
      unit,
      new THREE.Vector3(6, 0, 4),
      `MOVE_${orderType}`
    );
    assert.deepEqual(
      unit.waypoints.map(waypoint => waypoint.orderType),
      [orderType, orderType]
    );

    const vehicle = createUnit({ type: 'tank' });
    commands.setActiveUnit(vehicle);
    commands.setCommandMode(`MOVE_${orderType}`);
    assert.equal(
      commands.handleMapClick(new THREE.Vector3(4, 0, 4)),
      false
    );
    assert.deepEqual(vehicle.waypoints, []);
  }
});

test('target-order integration may accept or reject a handled command without mutating fallback target state', () => {
  const calls = [];
  let accepted = false;
  const commands = new CommandSystem(new THREE.Scene(), {
    onTargetOrder(unit, point, targetUnit, mode) {
      calls.push({
        unit,
        point: point.toArray(),
        targetUnit,
        mode
      });
      return { handled: true, accepted };
    }
  });
  const unit = createUnit();
  const target = { id: 'target-unit' };
  const point = new THREE.Vector3(6, 0, 4);
  commands.setActiveUnit(unit);
  commands.setCommandMode('TARGET');

  assert.equal(commands.handleMapClick(point, target), false);
  assert.equal(commands.activeMode, 'TARGET');
  assert.equal(unit.targetPos, undefined);
  assert.equal(unit.targetUnit, undefined);

  accepted = true;
  assert.equal(commands.handleMapClick(point, target), true);
  assert.equal(commands.activeMode, null);
  assert.equal(unit.targetPos, undefined);
  assert.equal(unit.targetUnit, undefined);
  assert.deepEqual(
    calls.map(call => ({
      point: call.point,
      targetUnit: call.targetUnit,
      mode: call.mode
    })),
    [
      { point: [6, 0, 4], targetUnit: target, mode: 'TARGET' },
      { point: [6, 0, 4], targetUnit: target, mode: 'TARGET' }
    ]
  );
  assert.equal(calls[0].unit, unit);
});

test('mortar area target forwards the authored radius and closes the command tool', () => {
  const calls = [];
  const commands = new CommandSystem(new THREE.Scene(), {
    onTargetOrder(unit, point, targetUnit, mode, context) {
      calls.push({
        unit,
        point: point.toArray(),
        targetUnit,
        mode,
        radiusMeters: context.areaRadiusMeters
      });
      return { handled: true, accepted: true };
    }
  });
  const unit = createUnit();
  unit.mortarTeamConfig = { weaponId: 'test-mortar' };
  commands.setActiveUnit(unit);
  commands.setCommandMode('MORTAR_HE');

  assert.equal(
    commands.handleMapClick(
      new THREE.Vector3(10, 0, 12),
      null,
      { areaRadiusMeters: 7.5 }
    ),
    true
  );
  assert.equal(commands.activeMode, null);
  assert.deepEqual(calls, [{
    unit,
    point: [10, 0, 12],
    targetUnit: null,
    mode: 'MORTAR_HE',
    radiusMeters: 7.5
  }]);
});

test('AP, HE, and MG target tools persist their explicit mode on the order', () => {
  const commands = new CommandSystem(new THREE.Scene());
  const target = { id: 'target' };
  for (const mode of ['TARGET_AP', 'TARGET_HE', 'TARGET_MG']) {
    const unit = createUnit();
    commands.setActiveUnit(unit);
    commands.setCommandMode(mode);
    assert.equal(
      commands.handleMapClick(new THREE.Vector3(4, 0, 6), target),
      true
    );
    assert.equal(unit.targetMode, mode);
    assert.equal(unit.targetUnit, target);
    assert.deepEqual(unit.targetPos.toArray(), [4, 0, 6]);
  }
});

test('vehicle target overlay runs from the selected weapon muzzle to the exact armor point', () => {
  const commands = new CommandSystem(new THREE.Scene());
  const unit = createUnit({ position: new THREE.Vector3(1, 0, 2) });
  const muzzlePositions = {
    main: new THREE.Vector3(2.5, 2.125, 3.25),
    hull_75mm: new THREE.Vector3(1.5, 1.125, 3)
  };
  unit.vehicleSpec = {
    mainGun: { ap: 'main_ap', he: 'main_he' },
    weaponMounts: [{
      id: 'hull_75mm',
      kind: 'cannon',
      targetModes: ['TARGET_HULL_HE'],
      weapons: { he: 'hull_he' }
    }]
  };
  unit.getVehicleMountMuzzleWorldPosition = mountId =>
    muzzlePositions[mountId]?.clone() ?? null;
  unit.targetPos = new THREE.Vector3(4.25, 1.75, 6.5);
  unit.targetAimIntent = {
    modelVersion: 'vehicle-local-aim-v1',
    point: [0.25, 1.75, 0.5]
  };
  unit.targetMode = 'TARGET_AP';

  commands.setActiveUnit(unit);

  const line = commands.targetLinesGroup.getObjectByName('TargetOrderLine');
  const marker = commands.targetLinesGroup.getObjectByName('VehicleTargetAimPoint');
  assert.ok(line);
  assert.ok(marker);
  assert.deepEqual(
    Array.from(line.geometry.attributes.position.array.slice(0, 3)),
    muzzlePositions.main.toArray(),
    'Target AP must begin at the main-gun muzzle'
  );
  assert.equal(line.userData.originMountId, 'main');
  assert.deepEqual(
    Array.from(line.geometry.attributes.position.array.slice(-3)),
    unit.targetPos.toArray(),
    'the command line must not add a presentation offset to the selected point'
  );
  assert.deepEqual(marker.position.toArray(), unit.targetPos.toArray());

  muzzlePositions.main.set(3, 2.5, 4);
  commands.updateTargetOverlays();
  assert.deepEqual(
    Array.from(line.geometry.attributes.position.array.slice(0, 3)),
    muzzlePositions.main.toArray(),
    'the overlay must follow the muzzle as the gun traverses'
  );

  unit.targetMode = 'TARGET_HULL_HE';
  commands.renderOverlays();
  const hullLine = commands.targetLinesGroup.getObjectByName('TargetOrderLine');
  assert.deepEqual(
    Array.from(hullLine.geometry.attributes.position.array.slice(0, 3)),
    muzzlePositions.hull_75mm.toArray(),
    'Target Hull HE must begin at the hull-gun muzzle'
  );
  assert.equal(hullLine.userData.originMountId, 'hull_75mm');
});

test('multi-selection preserves move formation offsets and shares target orders', () => {
  const first = createUnit({
    position: new THREE.Vector3(0, 0, 0)
  });
  const second = createUnit({
    position: new THREE.Vector3(4, 0, -2)
  });
  const commands = new CommandSystem(new THREE.Scene(), {
    terrain: {
      getMovementHeightAt: () => 3
    },
    isSetupPhase: () => false
  });
  commands.setActiveUnits([first, second], first);
  commands.setCommandMode('MOVE_QUICK');

  assert.equal(
    commands.handleMapClick(new THREE.Vector3(10, 1, 12)),
    true
  );
  assert.deepEqual(first.waypoints[0].position.toArray(), [10, 3, 12]);
  assert.deepEqual(second.waypoints[0].position.toArray(), [14, 3, 10]);
  assert.equal(commands.activeUnit, first);
  assert.deepEqual(commands.activeUnits, [first, second]);
  assert.equal(commands.activeMode, 'MOVE_QUICK');

  const target = { id: 'enemy' };
  commands.setCommandMode('TARGET');
  assert.equal(
    commands.handleMapClick(new THREE.Vector3(20, 2, 25), target),
    true
  );
  for (const selected of [first, second]) {
    assert.equal(selected.targetUnit, target);
    assert.equal(selected.targetMode, 'TARGET');
    assert.deepEqual(selected.targetPos.toArray(), [20, 2, 25]);
  }
  assert.equal(commands.activeMode, null);
  assert.equal(commands.activeUnit, first);
});

test('multi-selection applies face orders to every unit and closes the tool', () => {
  const first = createUnit({ position: new THREE.Vector3(0, 0, 0) });
  const second = createUnit({ position: new THREE.Vector3(4, 0, -2) });
  for (const unit of [first, second]) {
    unit.rotation = 0;
    unit.mesh = { rotation: { y: 0 } };
  }
  const commands = new CommandSystem(new THREE.Scene());
  commands.setActiveUnits([first, second], first);
  commands.setCommandMode('FACE');

  assert.equal(
    commands.handleMapClick(new THREE.Vector3(10, 0, 12)),
    true
  );
  assert.equal(first.rotation, Math.atan2(10, 12));
  assert.equal(second.rotation, Math.atan2(6, 14));
  assert.equal(first.mesh.rotation.y, first.rotation);
  assert.equal(second.mesh.rotation.y, second.rotation);
  assert.equal(commands.activeMode, null);
  assert.equal(commands.activeUnit, first);
});

test('face orders let the building interaction own occupied soldier direction', () => {
  const unit = createUnit();
  unit.rotation = 0;
  unit.mesh = { rotation: { y: 0 } };
  let request = null;
  const commands = new CommandSystem(new THREE.Scene(), {
    buildingInteraction: {
      issueFace(selected, point) {
        request = [selected, point.clone()];
        return { handled: true, accepted: true };
      }
    }
  });
  commands.setActiveUnit(unit);
  commands.setCommandMode('FACE');
  const point = new THREE.Vector3(12, 3, 20);

  assert.equal(commands.handleMapClick(point), true);
  assert.equal(request[0], unit);
  assert.deepEqual(request[1].toArray(), point.toArray());
  assert.equal(unit.rotation, 0, 'building-owned face must not rotate the squad root');
  assert.equal(commands.activeMode, null);
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

  const vehicle = new TestUnit({
    id: 'reverse-panzer',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(0, 0, 0)
  });
  issueMove(commands, vehicle, new THREE.Vector3(3, 2, 4), 'MOVE_REVERSE');
  assert.equal(vehicle.waypoints.length, 1);
  assert.deepEqual(vehicle.waypoints[0].position.toArray(), [3, 2, 4]);
  assert.equal(vehicle.waypoints[0].orderType, 'REVERSE');
});

test('mixed selection dispatches REVERSE only to vehicles', () => {
  const infantry = createUnit({ position: new THREE.Vector3(0, 0, 0) });
  const vehicle = new TestUnit({
    id: 'mixed-reverse-panzer',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(2, 0, 0)
  });
  const commands = new CommandSystem(new THREE.Scene(), {
    isSetupPhase: () => false
  });
  commands.setActiveUnits([infantry, vehicle], vehicle);
  commands.setCommandMode('MOVE_REVERSE');

  assert.equal(commands.handleMapClick(new THREE.Vector3(2, 0, -8)), true);
  assert.deepEqual(infantry.waypoints, []);
  assert.equal(vehicle.waypoints.length, 1);
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

test('consumed waypoints are omitted from CommandSystem overlay rendering', () => {
  const scene = new THREE.Scene();
  const commands = new CommandSystem(scene);
  const unit = createUnit({
    position: new THREE.Vector3(0, 0, 0),
    waypoints: [
      { position: new THREE.Vector3(10, 0, 0), orderType: 'QUICK' },
      { position: new THREE.Vector3(20, 0, 0), orderType: 'QUICK' }
    ],
    currentWaypointIndex: 0
  });

  commands.setActiveUnit(unit);
  assert.equal(commands.pathLinesGroup.children.length, 3); // 1 Line + 2 Node Spheres

  // Advance to waypoint index 1: waypoint 0 is reached, only 1 remaining waypoint rendered
  unit.currentWaypointIndex = 1;
  commands.renderOverlays();
  assert.equal(commands.pathLinesGroup.children.length, 2); // 1 Line + 1 Node Sphere

  // Final waypoint reached: currentWaypointIndex = 2 >= 2
  unit.currentWaypointIndex = 2;
  commands.renderOverlays();
  assert.equal(commands.pathLinesGroup.children.length, 0); // No overlay line or sphere nodes
});

test('realtime simulation refreshes selected path overlays only when waypoint progress changes', () => {
  const selected = {
    id: 'selected',
    faction: 'blue',
    type: 'bunker',
    position: new THREE.Vector3(),
    waypoints: [{ position: new THREE.Vector3(1, 0, 0), orderType: 'MOVE' }],
    currentWaypointIndex: 0,
    update() {
      this.currentWaypointIndex++;
    },
    isCombatEffective: () => false
  };
  let overlayRefreshes = 0;
  const app = Object.create(GameApp.prototype);
  Object.assign(app, {
    units: [selected],
    movedUnitIds: new Set(),
    selectedUnits: [],
    selectedUnit: null,
    commands: {
      activeUnits: [selected],
      activeUnit: selected,
      renderOverlays() { overlayRefreshes++; }
    },
    factionRoster: {
      opposingUnitsFor: () => [],
      unitsFor: () => [selected]
    },
    factionOrder: ['blue'],
    spotting: {
      canPrecisionTarget: () => false,
      advance() {}
    },
    spottingStepper: { advance: () => ({ steps: 0 }) },
    terrain: {},
    buildingInteraction: { advance() {} },
    syncBuildingInteriorPresentation() {},
    combat: { update() {} },
    support: { update() {} }
  });

  app.simulateStep(1 / 30);
  assert.equal(selected.currentWaypointIndex, 1);
  assert.equal(overlayRefreshes, 1);

  selected.update = () => {};
  app.simulateStep(1 / 30);
  assert.equal(overlayRefreshes, 1);
});
