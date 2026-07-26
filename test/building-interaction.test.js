import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BuildingSystem,
  localToWorldPoint,
  worldToLocalPoint
} from '../src/simulation/buildings/index.js';
import { BuildingInteractionSystem } from '../src/game/BuildingInteractionSystem.js';
import { Unit } from '../src/game/Unit.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { StaticCollisionWorld } from '../src/simulation/collision/StaticCollisionWorld.js';

function createHarness() {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [10, 2, 20], rotationY: 0 }
  });
  const agents = Array.from({ length: 6 }, (_, index) => {
    const record = { id: `soldier-${index}`, health: 100, status: 'OK' };
    return {
      id: record.id,
      record,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      facing: 0,
      state: 'READY',
      stance: 'STANDING',
      health: 100,
      status: 'OK',
      buildingLocation: null,
      get isAlive() { return this.health > 0 && this.status !== 'KIA'; },
      syncRecord() {
        Object.assign(this.record, {
          health: this.health,
          status: this.status,
          worldPosition: this.position.toArray(),
          buildingLocation: this.buildingLocation
            ? structuredClone(this.buildingLocation)
            : null
        });
      }
    };
  });
  const unit = {
    id: 'squad',
    type: 'infantry_squad',
    waypoints: [],
    currentWaypointIndex: 0,
    clearWaypoints() {
      this.waypoints = [];
      this.currentWaypointIndex = 0;
    },
    soldierAI: {
      agents,
      getLivingAgents: () => agents.filter(agent => agent.isAlive),
      syncMeshes() {}
    },
    applySoldierDamage(soldierId, damage) {
      const agent = agents.find(candidate => candidate.id === soldierId);
      agent.health = Math.max(0, agent.health - damage);
      if (agent.health === 0) agent.status = 'KIA';
      agent.syncRecord();
    }
  };
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => [unit]
  });
  return { buildings, interactions, unit, agents };
}

test('four individual soldiers enter upper floor, use window arcs, and exit', () => {
  const { buildings, interactions, unit, agents } = createHarness();
  const order = interactions.issueEnter(unit, 'house', 'upper-floor');
  assert.equal(order.accepted, true);
  assert.equal(order.assigned.length, 4);
  assert.equal(order.unassigned, 2);
  assert.equal(interactions.getInteriorPresenceCount('house'), 0);
  assert.deepEqual(interactions.getInteriorPresenceCounts(), {});
  for (const agent of agents.slice(0, 4)) {
    agent.position.fromArray(order.approachPosition);
  }

  interactions.advance(0);
  assert.equal(interactions.getInteriorPresenceCount('house'), 4);
  interactions.advance(1.2);
  assert.deepEqual(buildings.getBuildingSnapshot('house').occupancy, {});
  assert.equal(
    interactions.getInteriorPresenceCount('house'),
    4,
    'stair transit remains interior while ground occupancy is temporarily empty'
  );
  interactions.advance(3.8);

  const occupied = agents.filter(agent => agent.buildingLocation?.phase === 'occupied');
  assert.equal(occupied.length, 4);
  assert.deepEqual(
    Object.keys(buildings.getBuildingSnapshot('house').occupancy).sort(),
    [
      'upper-front-left',
      'upper-front-right',
      'upper-rear-left',
      'upper-rear-right'
    ]
  );

  const windowSoldier = occupied.find(agent => agent.buildingLocation.firePortId);
  const rearSoldier = occupied.find(agent => !agent.buildingLocation.firePortId);
  assert.equal(interactions.canFireAt(windowSoldier, [10, 4, 60]), true);
  assert.equal(interactions.canFireAt(windowSoldier, [10, 4, -20]), false);
  assert.equal(interactions.canFireAt(rearSoldier, [10, 4, 60]), false);

  assert.equal(interactions.issueExit(unit).accepted, true);
  interactions.advance(0);
  interactions.advance(3.8);
  interactions.advance(1.2);
  assert.equal(
    agents.filter(agent => agent.buildingLocation).length,
    0
  );
  assert.deepEqual(buildings.getBuildingSnapshot('house').occupancy, {});
});

test('second entry order never depenetrates existing upper-floor occupants', () => {
  const { interactions, unit, agents } = createHarness();
  const first = interactions.issueEnter(unit, 'house', 'upper-floor');
  for (const agent of agents.slice(0, 4)) agent.position.fromArray(first.approachPosition);
  interactions.advance(0);
  interactions.advance(1.2);
  interactions.advance(3.8);
  const existing = agents.slice(0, 4).map(agent => ({
    position: agent.position.toArray(),
    location: structuredClone(agent.buildingLocation)
  }));

  const second = interactions.issueEnter(unit, 'house', 'ground-floor');

  assert.equal(second.accepted, true);
  assert.equal(second.assigned.length, 2);
  agents.slice(0, 4).forEach((agent, index) => {
    assert.deepEqual(agent.position.toArray(), existing[index].position);
    assert.deepEqual(agent.buildingLocation, existing[index].location);
    assert.equal(agent.buildingLocation.phase, 'occupied');
    assert.ok(agent.buildingLocation.nodeId.startsWith('upper-'));
  });
});

test('interaction orders and individual transit state replay after capture/restore', () => {
  const original = createHarness();
  const order = original.interactions.issueEnter(original.unit, 'house', 'ground-floor');
  for (const agent of original.agents.slice(0, 4)) agent.position.fromArray(order.approachPosition);
  original.interactions.advance(0);
  original.interactions.advance(0.45);

  const buildingState = original.buildings.captureState();
  const interactionState = original.interactions.captureState();
  const agentState = original.agents.map(agent => ({
    position: agent.position.toArray(),
    buildingLocation: structuredClone(agent.buildingLocation)
  }));

  original.interactions.advance(0.75);
  const expected = {
    building: original.buildings.captureState(),
    interaction: original.interactions.captureState(),
    agents: original.agents.map(agent => ({
      position: agent.position.toArray(),
      buildingLocation: structuredClone(agent.buildingLocation)
    }))
  };

  const restored = createHarness();
  restored.buildings.restoreState(buildingState);
  restored.interactions.restoreState(interactionState);
  restored.agents.forEach((agent, index) => {
    agent.position.fromArray(agentState[index].position);
    agent.buildingLocation = structuredClone(agentState[index].buildingLocation);
    agent.syncRecord();
  });
  restored.interactions.advance(0.75);
  assert.deepEqual({
    building: restored.buildings.captureState(),
    interaction: restored.interactions.captureState(),
    agents: restored.agents.map(agent => ({
      position: agent.position.toArray(),
      buildingLocation: structuredClone(agent.buildingLocation)
    }))
  }, expected);
});

test('collapse consequences damage and relocate occupants deterministically', () => {
  const { buildings, interactions, unit, agents } = createHarness();
  const agent = agents[0];
  buildings.occupySlot('house', {
    slotId: 'upper-front-left',
    unitId: unit.id,
    soldierId: agent.id,
    soldierKey: `${unit.id}:${agent.id}`
  });
  agent.buildingLocation = {
    buildingId: 'house',
    phase: 'occupied',
    nodeId: 'upper-front-left',
    soldierKey: `${unit.id}:${agent.id}`,
    unitId: unit.id,
    soldierId: agent.id
  };
  const collapse = buildings.applyBlastDamage('house', {
    sectionDamages: [{ sectionId: 'roof', amount: 1000 }]
  });
  interactions.handleOccupantConsequences(collapse.occupantConsequences);
  assert.equal(agent.health, 65);
  assert.equal(agent.buildingLocation.nodeId, 'ground-front-left');
  assert.equal(agent.position.y, 2.15);
});

test('portal collapse interrupts transit at deterministic exterior instead of invalid destination', () => {
  const { buildings, interactions, unit, agents } = createHarness();
  const order = interactions.issueEnter(unit, 'house', 'ground-floor');
  const agent = agents[0];
  agent.position.fromArray(order.approachPosition);
  interactions.advance(0);
  assert.equal(agent.buildingLocation.phase, 'transit');

  buildings.applyBlastDamage('house', {
    sectionDamages: [{ sectionId: 'ground-shell', amount: 1000 }]
  });
  interactions.advance(0.1);

  assert.equal(agent.buildingLocation, null);
  assert.ok(agent.position.z > 24.5);
  assert.notDeepEqual(agent.position.toArray(), [6.8, 2.15, 23.65]);
  const snapshot = buildings.getBuildingSnapshot('house');
  assert.deepEqual(snapshot.occupancy, {});
  assert.equal(
    Object.values(snapshot.reservations)
      .some(reservation => reservation.soldierKey === `${unit.id}:${agent.id}`),
    false
  );
});

test('stale collapse destination resolves to current surviving node or exterior', () => {
  const { buildings, interactions, unit, agents } = createHarness();
  const agent = agents[0];
  buildings.occupySlot('house', {
    slotId: 'upper-front-left',
    unitId: unit.id,
    soldierId: agent.id,
    soldierKey: `${unit.id}:${agent.id}`
  });
  agent.buildingLocation = {
    buildingId: 'house',
    phase: 'occupied',
    nodeId: 'upper-front-left',
    soldierKey: `${unit.id}:${agent.id}`,
    unitId: unit.id,
    soldierId: agent.id
  };
  const upperCollapse = buildings.applyBlastDamage('house', {
    sectionDamages: [{ sectionId: 'roof', amount: 1000 }]
  });
  buildings.applyBlastDamage('house', {
    sectionDamages: [{ sectionId: 'ground-floor-structure', amount: 1000 }]
  });

  interactions.handleOccupantConsequences(upperCollapse.occupantConsequences);

  assert.equal(agent.health, 65);
  assert.equal(agent.buildingLocation, null);
  assert.ok(agent.position.z > 24.5);
  assert.deepEqual(buildings.getBuildingSnapshot('house').occupancy, {});
});

test('exit while approaching entry cancels reservation without stair-wait deadlock', () => {
  const { buildings, interactions, unit, agents } = createHarness();
  const enter = interactions.issueEnter(unit, 'house', 'upper-floor');
  assert.equal(enter.accepted, true);
  assert.equal(Object.keys(buildings.getBuildingSnapshot('house').reservations).length, 4);
  unit.waypoints.push({ orderType: 'QUICK', position: enter.approachPosition });
  unit.currentWaypointIndex = 0;

  const exit = interactions.issueExit(unit);
  assert.equal(exit.accepted, true);
  assert.equal(exit.assigned.length, 4);
  assert.deepEqual(unit.waypoints, []);
  assert.equal(unit.currentWaypointIndex, 0);
  for (const agent of agents.slice(0, 4)) {
    assert.equal(agent.buildingLocation, null);
  }
  assert.deepEqual(buildings.getBuildingSnapshot('house').reservations, {});

  interactions.advance(1);
  assert.deepEqual(interactions.captureState().orders, []);
});

test('live Unit soldiers hold occupied slots and restore building locations', () => {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const unit = new Unit({
    id: 'live-squad',
    name: 'Live squad',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 7)
  });
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => [unit]
  });
  const order = interactions.issueEnter(unit, 'house', 'ground-floor');
  for (const agent of unit.soldierAI.getLivingAgents().slice(0, 4)) {
    agent.position.fromArray(order.approachPosition);
  }
  interactions.advance(0);
  interactions.advance(1.2);
  const occupied = unit.soldierAI.getLivingAgents()
    .find(agent => agent.buildingLocation?.phase === 'occupied');
  const heldPosition = occupied.position.clone();
  const saved = unit.captureState();
  const terrain = {
    collisionWorld: null,
    bocageObstacles: [],
    getHeightAt: () => 0,
    getMovementHeightAt: () => 0
  };
  unit.update(1 / 30, terrain);
  assert.ok(occupied.position.distanceTo(heldPosition) < 1e-12);

  occupied.buildingLocation = null;
  occupied.syncRecord();
  unit.restoreState(saved, new Map([[unit.id, unit]]));
  assert.equal(
    unit.soldierAI.getLivingAgents()
      .find(agent => agent.id === occupied.id).buildingLocation.phase,
    'occupied'
  );
});

test('live Unit movement completes door and stair transit to upper-floor slots', () => {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const movementRecords = buildings.getMovementCollisionSnapshot('house').records
    .filter(record => record.sectionId === 'ground-shell');
  const collisionWorld = new StaticCollisionWorld(movementRecords);
  const unit = new Unit({
    id: 'live-upper-squad',
    name: 'Live upper squad',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(-45, 0, 10)
  });
  unit.collisionWorld = collisionWorld;
  const terrain = {
    collisionWorld,
    bocageObstacles: [],
    getHeightAt: () => 0,
    getMovementHeightAt: () => 0
  };
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => [unit]
  });
  const order = interactions.issueEnter(unit, 'house', 'upper-floor');
  assert.equal(order.accepted, true);
  for (const waypoint of order.approachRoute) {
    unit.addWaypoint(new THREE.Vector3().fromArray(waypoint), 'QUICK');
  }

  for (let step = 0; step < 900; step++) {
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
  assert.deepEqual(
    assigned.map(agent => agent.buildingLocation?.nodeId).sort(),
    [
      'upper-front-left',
      'upper-front-right',
      'upper-rear-left',
      'upper-rear-right'
    ]
  );
  assert.ok(assigned.every(agent => agent.position.y > 3));
});

test('rear entry route deterministically clears footprint and reaches upper-floor slots', () => {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const movementRecords = buildings.getMovementCollisionSnapshot('house').records
    .filter(record => record.sectionId === 'ground-shell');
  const collisionWorld = new StaticCollisionWorld(movementRecords);
  const unit = new Unit({
    id: 'live-rear-upper-squad',
    name: 'Live rear upper squad',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, -12)
  });
  unit.collisionWorld = collisionWorld;
  const terrain = {
    collisionWorld,
    bocageObstacles: [],
    getHeightAt: () => 0,
    getMovementHeightAt: () => 0
  };
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => [unit]
  });
  const order = interactions.issueEnter(unit, 'house', 'upper-floor');
  assert.equal(order.accepted, true);
  assert.ok(order.approachRoute.length >= 3);
  assert.ok(order.approachRoute[0][0] < 0, 'equal rear routes choose stable left side');
  assert.deepEqual(order.approachRoute.at(-1), order.approachPosition);
  for (const waypoint of order.approachRoute) {
    unit.addWaypoint(new THREE.Vector3().fromArray(waypoint), 'QUICK');
  }

  for (let step = 0; step < 900; step++) {
    unit.update(1 / 30, terrain);
    interactions.advance(1 / 30);
  }

  const assigned = unit.soldierAI.getLivingAgents().slice(0, 4);
  assert.deepEqual(
    assigned.map(agent => agent.buildingLocation?.nodeId).sort(),
    [
      'upper-front-left',
      'upper-front-right',
      'upper-rear-left',
      'upper-rear-right'
    ]
  );
  assert.ok(assigned.every(agent => agent.position.y > 3));
});

test('entry approach route is authored in building-local space for rotated buildings', () => {
  const transform = { position: [10, 2, 20], rotationY: Math.PI / 2 };
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'rotated-house',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform
  });
  const start = localToWorldPoint([0, 0, -12], transform);
  const unit = new Unit({
    id: 'rotated-route-squad',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3().fromArray(start)
  });
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => [unit]
  });

  const order = interactions.issueEnter(unit, 'rotated-house', 'upper-floor');
  const routeLocal = order.approachRoute.map(point => worldToLocalPoint(point, transform));
  assert.ok(routeLocal.length >= 3);
  assert.ok(routeLocal[0][0] < FR_HOUSE_12X9_2F.bounds.min[0]);
  assert.ok(routeLocal[0][2] < FR_HOUSE_12X9_2F.bounds.min[2]);
  assert.deepEqual(order.approachRoute.at(-1), order.approachPosition);
  assert.ok(Math.abs(routeLocal.at(-1)[0]) < 1e-9);
  assert.ok(routeLocal.at(-1)[2] > FR_HOUSE_12X9_2F.bounds.max[2]);
});

test('exact near-wall starts overshoot full-clearance bounds before upper entry', () => {
  for (const entryCase of [
    {
      id: 'near-rear',
      start: [0, 0, -5.00001],
      expectedEscape: [0, 0.15, -7.57]
    },
    {
      id: 'near-right',
      start: [6.50001, 0, 0],
      expectedEscape: [9.07, 0.15, 0]
    },
    {
      id: 'near-left',
      start: [-6.50001, 0, 0],
      expectedEscape: [-9.07, 0.15, 0]
    }
  ]) {
    const buildings = new BuildingSystem();
    buildings.registerDescriptor(FR_HOUSE_12X9_2F);
    buildings.addBuilding({
      id: 'house',
      descriptorId: FR_HOUSE_12X9_2F.id,
      transform: { position: [0, 0, 0], rotationY: 0 }
    });
    const movementRecords = buildings.getMovementCollisionSnapshot('house').records
      .filter(record => record.sectionId === 'ground-shell');
    const collisionWorld = new StaticCollisionWorld(movementRecords);
    const unit = new Unit({
      id: `${entryCase.id}-upper-squad`,
      faction: 'french',
      type: 'infantry_squad',
      position: new THREE.Vector3().fromArray(entryCase.start)
    });
    unit.collisionWorld = collisionWorld;
    const terrain = {
      collisionWorld,
      bocageObstacles: [],
      getHeightAt: () => 0,
      getMovementHeightAt: () => 0
    };
    const interactions = new BuildingInteractionSystem({
      buildingSystem: buildings,
      getUnits: () => [unit]
    });
    const order = interactions.issueEnter(unit, 'house', 'upper-floor');
    assert.deepEqual(order.approachRoute[0], entryCase.expectedEscape);
    assert.ok(unit.soldierAI.getLivingAgents().every(agent => {
      const [x, , z] = agent.position.toArray();
      return x <= FR_HOUSE_12X9_2F.bounds.min[0]
        || x >= FR_HOUSE_12X9_2F.bounds.max[0]
        || z <= FR_HOUSE_12X9_2F.bounds.min[2]
        || z >= FR_HOUSE_12X9_2F.bounds.max[2];
    }), `${entryCase.id}: approach order extracts every overlapping formation member`);
    for (const waypoint of order.approachRoute) {
      unit.addWaypoint(new THREE.Vector3().fromArray(waypoint), 'QUICK');
    }

    for (let step = 0; step < 900; step++) {
      unit.update(1 / 30, terrain);
      interactions.advance(1 / 30);
    }

    const assigned = unit.soldierAI.getLivingAgents().slice(0, 4);
    assert.deepEqual(
      assigned.map(agent => agent.buildingLocation?.nodeId).sort(),
      [
        'upper-front-left',
        'upper-front-right',
        'upper-rear-left',
        'upper-rear-right'
      ],
      `${entryCase.id}: ${JSON.stringify({
        unitPosition: unit.position.toArray(),
        waypointIndex: unit.currentWaypointIndex,
        waypoints: unit.waypoints.map(waypoint => waypoint.position.toArray()),
        agents: assigned.map(agent => ({
          position: agent.position.toArray(),
          location: agent.buildingLocation
        }))
      })}`
    );
  }
});
