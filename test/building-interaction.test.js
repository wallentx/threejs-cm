import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BuildingSystem,
  localToWorldPoint,
  worldToLocalPoint
} from '../src/simulation/buildings/index.js';
import { BuildingInteractionSystem } from '../src/game/BuildingInteractionSystem.js';
import { Unit } from './helpers/France1940TestUnit.js';
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

function createCapacityUnit(id) {
  const agentIds = ['soldier-d', 'soldier-b', 'soldier-a', 'soldier-c'];
  const agents = agentIds.map(agentId => {
    const record = { id: agentId, health: 100, status: 'OK' };
    return {
      id: agentId,
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
    id,
    type: 'infantry_squad',
    position: new THREE.Vector3(),
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
    }
  };
  return { unit, agents };
}

function createCapacityHarness(unitIds = ['unit-a', 'unit-b']) {
  const descriptor = structuredClone(FR_HOUSE_12X9_2F);
  descriptor.id = 'fr_house_12x9_2f_two_upper_slots';
  const upperRoom = descriptor.rooms.find(room => room.id === 'upper-room');
  upperRoom.slots = upperRoom.slots.filter(slot =>
    slot.id === 'upper-front-left' || slot.id === 'upper-front-right');
  const retainedSlots = new Set(upperRoom.slots.map(slot => slot.id));
  const removedApertures = new Set(
    descriptor.firePorts
      .filter(port => port.roomId === upperRoom.id && !retainedSlots.has(port.approachSlotId))
      .map(port => port.aperture.id)
  );
  descriptor.firePorts = descriptor.firePorts.filter(
    port => port.roomId !== upperRoom.id || retainedSlots.has(port.approachSlotId)
  );
  for (const section of descriptor.sections) {
    for (const colliderPart of section.colliderParts) {
      if (removedApertures.has(colliderPart.openingId)) {
        delete colliderPart.openingId;
      }
    }
  }

  const buildings = new BuildingSystem();
  buildings.registerDescriptor(descriptor);
  buildings.addBuilding({
    id: 'house',
    descriptorId: descriptor.id,
    transform: { position: [10, 2, 20], rotationY: 0 }
  });
  const elements = unitIds.map(createCapacityUnit);
  const units = elements.map(element => element.unit);
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => [...units].reverse()
  });
  return {
    buildings,
    descriptor,
    interactions,
    units,
    agentsByUnit: new Map(
      elements.map(element => [element.unit.id, element.agents])
    )
  };
}

function captureCapacityHarness(harness) {
  return {
    building: harness.buildings.captureState(),
    interaction: harness.interactions.captureState(),
    units: [...harness.units]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(unit => ({
        id: unit.id,
        agents: [...unit.soldierAI.agents]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map(agent => ({
            id: agent.id,
            position: agent.position.toArray(),
            buildingLocation: structuredClone(agent.buildingLocation)
          }))
      }))
  };
}

function restoreCapacityHarness(harness, snapshot) {
  harness.buildings.restoreState(snapshot.building);
  harness.interactions.restoreState(snapshot.interaction);
  for (const savedUnit of snapshot.units) {
    const unit = harness.units.find(candidate => candidate.id === savedUnit.id);
    for (const savedAgent of savedUnit.agents) {
      const agent = unit.soldierAI.agents
        .find(candidate => candidate.id === savedAgent.id);
      agent.position.fromArray(savedAgent.position);
      agent.buildingLocation = structuredClone(savedAgent.buildingLocation);
      agent.syncRecord();
    }
  }
}

test('four individual soldiers enter upper floor, use window arcs, and exit', () => {
  const { buildings, interactions, unit, agents } = createHarness();
  for (const agent of agents) {
    agent.targetUnitId = 'outside-enemy';
    agent.targetSoldierId = 'outside-enemy:0';
  }
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
  assert.ok(occupied.every(agent =>
    agent.targetUnitId === null
    && agent.targetSoldierId === null
  ), 'entering cover clears exposed outside firing solutions');
  assert.deepEqual(
    Object.keys(buildings.getBuildingSnapshot('house').occupancy).sort(),
    [
      'upper-front-left',
      'upper-front-right',
      'upper-rear-left',
      'upper-rear-right'
    ]
  );

  const frontSoldier = occupied.find(
    agent => agent.buildingLocation.firePortId === 'upper-window-left'
  );
  const rearSoldier = occupied.find(
    agent => agent.buildingLocation.firePortId === 'upper-rear-window-left'
  );
  assert.equal(interactions.canFireAt(frontSoldier, [10, 4, 60]), true);
  assert.equal(interactions.canFireAt(frontSoldier, [10, 4, -20]), false);
  assert.equal(interactions.canFireAt(rearSoldier, [10, 4, -20]), true);
  assert.equal(interactions.canFireAt(rearSoldier, [10, 4, 60]), false);

  rearSoldier.record.equipment = ['BINOCULARS'];
  const face = interactions.issueFace(unit, [10, 4, 60]);
  assert.equal(face.accepted, true);
  assert.equal(face.observerSoldierKey, rearSoldier.buildingLocation.soldierKey);
  assert.equal(rearSoldier.buildingLocation.firePortId, 'upper-window-left');
  assert.equal(interactions.canFireAt(rearSoldier, [10, 4, 60]), true);
  assert.equal(interactions.canFireAt(rearSoldier, [10, 4, -20]), false);
  assert.deepEqual(
    Object.keys(buildings.getBuildingSnapshot('house').occupancy).sort(),
    [
      'upper-front-left',
      'upper-front-right',
      'upper-rear-left',
      'upper-rear-right'
    ]
  );

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

test('face fills every available window toward the requested direction before overflow', () => {
  const { buildings, interactions, unit, agents } = createHarness();
  for (const agent of agents.slice(3)) {
    agent.health = 0;
    agent.status = 'KIA';
  }
  agents[0].record.equipment = ['BINOCULARS'];
  const initialSlots = [
    'upper-rear-left',
    'upper-front-left',
    'upper-rear-right'
  ];
  for (let index = 0; index < initialSlots.length; index++) {
    const agent = agents[index];
    const key = `${unit.id}:${agent.id}`;
    agent.buildingLocation = {
      buildingId: 'house',
      phase: 'occupied',
      nodeId: initialSlots[index],
      soldierKey: key,
      unitId: unit.id,
      soldierId: agent.id,
      firePortId: null
    };
    const occupied = buildings.occupySlot('house', {
      slotId: initialSlots[index],
      soldierKey: key,
      unitId: unit.id,
      soldierId: agent.id
    });
    assert.equal(occupied.accepted, true);
  }

  const forward = interactions.issueFace(unit, [10, 4, 60]);
  assert.equal(forward.accepted, true);
  assert.deepEqual(forward.preferredSlotIds, [
    'upper-front-left',
    'upper-front-right'
  ]);
  assert.equal(agents[0].buildingLocation.firePortId, 'upper-window-left');
  let occupancy = buildings.getBuildingSnapshot('house').occupancy;
  assert.equal(occupancy['upper-front-left'].soldierKey, 'squad:soldier-0');
  assert.equal(occupancy['upper-front-right'].soldierKey, 'squad:soldier-1');
  assert.equal(
    ['upper-rear-left', 'upper-rear-right']
      .filter(slotId => occupancy[slotId]).length,
    1,
    'only the third soldier overflows to a rear window'
  );

  const savedBias = interactions.captureState();
  assert.equal(savedBias.version, 2);
  assert.deepEqual(savedBias.faceBiases, [{
    unitId: 'squad',
    buildingId: 'house',
    floorId: 'upper-floor',
    target: [10, 4, 60]
  }]);
  const enemy = {
    id: 'tracked-enemy',
    position: new THREE.Vector3(10, 4, -20),
    isCombatEffective: () => true
  };
  interactions.getUnits = () => [enemy, unit];
  agents[1].targetUnitId = enemy.id;
  interactions.advance(0);
  occupancy = buildings.getBuildingSnapshot('house').occupancy;
  assert.equal(occupancy['upper-rear-left'].soldierKey, 'squad:soldier-0');
  assert.equal(occupancy['upper-rear-right'].soldierKey, 'squad:soldier-1');

  agents[1].targetUnitId = null;
  interactions.advance(0);
  occupancy = buildings.getBuildingSnapshot('house').occupancy;
  assert.equal(occupancy['upper-front-left'].soldierKey, 'squad:soldier-0');
  assert.equal(occupancy['upper-front-right'].soldierKey, 'squad:soldier-1');
  assert.deepEqual(interactions.captureState(), savedBias);

  const rearward = interactions.issueFace(unit, [10, 4, -20]);
  assert.equal(rearward.accepted, true);
  assert.deepEqual(rearward.preferredSlotIds, [
    'upper-rear-left',
    'upper-rear-right'
  ]);
  assert.equal(
    agents[0].buildingLocation.firePortId,
    'upper-rear-window-left'
  );
  occupancy = buildings.getBuildingSnapshot('house').occupancy;
  assert.equal(occupancy['upper-rear-left'].soldierKey, 'squad:soldier-0');
  assert.equal(occupancy['upper-rear-right'].soldierKey, 'squad:soldier-1');
  assert.equal(
    ['upper-front-left', 'upper-front-right']
      .filter(slotId => occupancy[slotId]).length,
    1,
    'only the third soldier overflows after reversing the bias'
  );

  interactions.restoreState(savedBias);
  interactions.advance(0);
  occupancy = buildings.getBuildingSnapshot('house').occupancy;
  assert.equal(occupancy['upper-front-left'].soldierKey, 'squad:soldier-0');
  assert.equal(occupancy['upper-front-right'].soldierKey, 'squad:soldier-1');
  assert.deepEqual(interactions.captureState(), savedBias);
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

  let sawVisibleStairClimb = false;
  for (let step = 0; step < 900; step++) {
    unit.update(1 / 30, terrain);
    interactions.advance(1 / 30);
    const climbing = unit.soldierAI.getLivingAgents().find(agent =>
      agent.buildingLocation?.routeStage === 'stairs'
      && agent.buildingLocation?.phase === 'transit'
      && agent.position.y > 0.25
      && agent.position.y < 3.4);
    if (climbing) {
      unit.soldierAI.syncMeshes();
      const mesh = unit.mesh.userData.soldiers[climbing.index];
      assert.ok(
        Math.abs(
          mesh.position.y - (climbing.position.y - unit.position.y)
        ) < 1e-9
      );
      sawVisibleStairClimb = true;
    }
  }

  const assigned = unit.soldierAI.getLivingAgents().slice(0, 4);
  assert.equal(sawVisibleStairClimb, true);
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
  unit.soldierAI.syncMeshes();
  assert.ok(assigned.every(agent =>
    unit.mesh.userData.soldiers[agent.index].position.y > 2.5));
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

test('ENTER accepts only real claimable target slots on the requested floor', () => {
  const harness = createCapacityHarness(['unit-a']);
  const unit = harness.units[0];
  const agents = harness.agentsByUnit.get(unit.id);
  const order = harness.interactions.issueEnter(
    unit,
    'house',
    'upper-floor'
  );

  assert.equal(order.accepted, true);
  assert.deepEqual(order.assigned, [
    'unit-a:soldier-a',
    'unit-a:soldier-b'
  ]);
  assert.equal(order.unassigned, 2);
  const assigned = agents.filter(agent =>
    order.assigned.includes(`${unit.id}:${agent.id}`));
  const unassigned = agents.filter(agent =>
    !order.assigned.includes(`${unit.id}:${agent.id}`));
  const authoredTargets = new Set(
    harness.descriptor.rooms
      .find(room => room.id === 'upper-room')
      .slots
      .map(slot => slot.id)
  );
  assert.deepEqual(
    assigned.map(agent => agent.buildingLocation.targetSlotId).sort(),
    [...authoredTargets].sort()
  );
  assert.ok(assigned.every(agent =>
    authoredTargets.has(agent.buildingLocation.targetSlotId)));
  assert.ok(assigned.every(agent =>
    !agent.buildingLocation.targetSlotId.includes('interior-')));
  assert.ok(unassigned.every(agent => agent.buildingLocation === null));

  for (const agent of assigned) agent.position.fromArray(order.approachPosition);
  harness.interactions.advance(0);
  harness.interactions.advance(1.2);
  harness.interactions.advance(3.8);

  assert.ok(assigned.every(agent =>
    agent.buildingLocation.phase === 'occupied'
      && agent.buildingLocation.nodeId === agent.buildingLocation.targetSlotId
      && agent.buildingLocation.targetFloorId === 'upper-floor'));
  assert.deepEqual(
    Object.keys(harness.buildings.getBuildingSnapshot('house').occupancy)
      .sort(),
    [...authoredTargets].sort()
  );
});

test('ENTER excludes invalid, occupied, and reserved target or staging slots', () => {
  const unavailableTargets = createCapacityHarness(['unit-a']);
  unavailableTargets.buildings.resolveReservations('house', [{
    nodeId: 'upper-front-left',
    orderSequence: 1,
    unitId: 'occupancy-owner',
    soldierId: 'reserved',
    soldierKey: 'occupancy-owner:reserved'
  }]);
  unavailableTargets.buildings.occupySlot('house', {
    slotId: 'upper-front-right',
    unitId: 'occupancy-owner',
    soldierId: 'occupied',
    soldierKey: 'occupancy-owner:occupied'
  });
  assert.deepEqual(
    unavailableTargets.interactions.issueEnter(
      unavailableTargets.units[0],
      'house',
      'upper-floor'
    ),
    { accepted: false, reason: 'no_free_slots', assigned: [] }
  );

  const constrainedEntry = createCapacityHarness(['unit-a']);
  const groundSlots = constrainedEntry.descriptor.rooms
    .find(room => room.id === 'ground-room')
    .slots
    .map(slot => slot.id)
    .sort();
  constrainedEntry.buildings.resolveReservations(
    'house',
    groundSlots.slice(0, 3).map((nodeId, index) => ({
      nodeId,
      orderSequence: 1,
      unitId: 'staging-owner',
      soldierId: `soldier-${index}`,
      soldierKey: `staging-owner:soldier-${index}`
    }))
  );
  const partial = constrainedEntry.interactions.issueEnter(
    constrainedEntry.units[0],
    'house',
    'upper-floor'
  );
  assert.equal(partial.accepted, true);
  assert.equal(partial.assigned.length, 1);
  assert.equal(partial.unassigned, 3);

  const invalidTargets = createCapacityHarness(['unit-a']);
  invalidTargets.buildings.applyBlastDamage('house', {
    sectionDamages: [{ sectionId: 'roof', amount: 1000 }]
  });
  assert.deepEqual(
    invalidTargets.buildings.getBuildingSnapshot('house').invalidSlots,
    ['upper-front-left', 'upper-front-right']
  );
  assert.deepEqual(
    invalidTargets.interactions.issueEnter(
      invalidTargets.units[0],
      'house',
      'upper-floor'
    ),
    { accepted: false, reason: 'no_free_slots', assigned: [] }
  );
});

test('pending and occupied target claims block later ENTER until lifecycle release', () => {
  const harness = createCapacityHarness(['unit-a', 'unit-b', 'unit-c']);
  const [firstUnit, secondUnit, thirdUnit] = harness.units;
  const first = harness.interactions.issueEnter(
    firstUnit,
    'house',
    'upper-floor'
  );
  assert.equal(first.assigned.length, 2);
  assert.equal(
    Object.keys(
      harness.buildings.getBuildingSnapshot('house').reservations
    ).length,
    2,
    'two entry staging slots remain physically available'
  );

  assert.deepEqual(
    harness.interactions.issueEnter(secondUnit, 'house', 'upper-floor'),
    { accepted: false, reason: 'no_free_slots', assigned: [] }
  );

  assert.equal(harness.interactions.issueExit(firstUnit).accepted, true);
  const second = harness.interactions.issueEnter(
    secondUnit,
    'house',
    'upper-floor'
  );
  assert.equal(second.accepted, true);
  assert.equal(second.assigned.length, 2);
  const secondAssigned = harness.agentsByUnit.get(secondUnit.id)
    .filter(agent => second.assigned.includes(`${secondUnit.id}:${agent.id}`));
  for (const agent of secondAssigned) {
    agent.position.fromArray(second.approachPosition);
  }
  harness.interactions.advance(0);
  harness.interactions.advance(1.2);
  harness.interactions.advance(3.8);

  assert.ok(secondAssigned.every(agent =>
    agent.buildingLocation?.phase === 'occupied'));
  assert.deepEqual(
    harness.interactions.issueEnter(thirdUnit, 'house', 'upper-floor'),
    { accepted: false, reason: 'no_free_slots', assigned: [] }
  );

  assert.equal(harness.interactions.issueExit(secondUnit).accepted, true);
  harness.interactions.advance(0);
  const afterRelease = harness.interactions.issueEnter(
    thirdUnit,
    'house',
    'upper-floor'
  );
  assert.equal(afterRelease.accepted, true);
  assert.equal(afterRelease.assigned.length, 2);
});

test('pending target claims survive interaction and agent rollback', () => {
  const original = createCapacityHarness(['unit-a', 'unit-b']);
  const [firstUnit, secondUnit] = original.units;
  const order = original.interactions.issueEnter(
    firstUnit,
    'house',
    'upper-floor'
  );
  const assigned = original.agentsByUnit.get(firstUnit.id)
    .filter(agent => order.assigned.includes(`${firstUnit.id}:${agent.id}`));
  for (const agent of assigned) agent.position.fromArray(order.approachPosition);
  original.interactions.advance(0);
  original.interactions.advance(0.45);

  const pending = captureCapacityHarness(original);
  assert.equal(pending.interaction.version, 2);
  assert.ok(
    pending.units
      .find(unit => unit.id === firstUnit.id)
      .agents
      .filter(agent => agent.buildingLocation)
      .every(agent =>
        agent.buildingLocation.phase === 'transit'
          && agent.buildingLocation.targetSlotId.startsWith('upper-'))
  );
  assert.deepEqual(
    original.interactions.issueEnter(secondUnit, 'house', 'upper-floor'),
    { accepted: false, reason: 'no_free_slots', assigned: [] }
  );

  const restored = createCapacityHarness(['unit-a', 'unit-b']);
  restoreCapacityHarness(restored, pending);
  assert.deepEqual(captureCapacityHarness(restored), pending);
  assert.deepEqual(
    restored.interactions.issueEnter(
      restored.units[1],
      'house',
      'upper-floor'
    ),
    { accepted: false, reason: 'no_free_slots', assigned: [] }
  );

  original.interactions.advance(0.75);
  restored.interactions.advance(0.75);
  original.interactions.advance(3.8);
  restored.interactions.advance(3.8);

  assert.deepEqual(
    captureCapacityHarness(restored),
    captureCapacityHarness(original)
  );
  assert.deepEqual(original.interactions.captureState().orders, []);
  assert.deepEqual(
    Object.keys(original.buildings.getBuildingSnapshot('house').occupancy)
      .sort(),
    ['upper-front-left', 'upper-front-right']
  );
});
