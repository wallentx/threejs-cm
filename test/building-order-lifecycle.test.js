import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingInteractionSystem } from '../src/game/BuildingInteractionSystem.js';
import { FR_FARMHOUSE_8X6_1F } from '../src/maps/france/FranceFarmhouse8x6_1F.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { createRoomSlotIndex } from '../src/simulation/buildings/BuildingOccupancy.js';

function createSparseAuthoredFarmhouse() {
  const descriptor = structuredClone(FR_FARMHOUSE_8X6_1F);
  descriptor.id = 'fr_farmhouse_8x6_1f_sparse_authored_positions';
  descriptor.rooms[0].slots = descriptor.rooms[0].slots.slice(0, 3);
  return descriptor;
}

function createAgent(id, position) {
  const record = { id, health: 100, status: 'OK' };
  return {
    id,
    record,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    facing: 0,
    state: 'READY',
    stance: 'STANDING',
    health: 100,
    status: 'OK',
    buildingLocation: null,
    get isAlive() {
      return this.health > 0 && this.status !== 'KIA';
    },
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
}

function createUnit(id = 'squad') {
  const position = new THREE.Vector3(0, 0, -18);
  const agents = Array.from(
    { length: 6 },
    (_, index) => createAgent(`soldier-${index}`, position)
  );
  return {
    id,
    type: 'infantry_squad',
    position,
    collisionRadius: 0.45,
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
      const agent = agents.find(candidate =>
        String(candidate.id) === String(soldierId));
      agent.health = Math.max(0, agent.health - Math.max(0, damage));
      if (agent.health === 0) {
        agent.status = 'KIA';
        agent.state = 'CASUALTY';
        agent.stance = 'PRONE';
        agent.velocity.set(0, 0, 0);
      }
      agent.syncRecord();
    }
  };
}

function createHarness() {
  const farmhouse = createSparseAuthoredFarmhouse();
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(farmhouse);
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'farmhouse',
    descriptorId: farmhouse.id,
    transform: { position: [-14, 0, 0], rotationY: 0 }
  });
  buildings.addBuilding({
    id: 'upper-house',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [14, 0, 0], rotationY: 0 }
  });
  const unit = createUnit();
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => [unit]
  });
  return { buildings, farmhouse, interactions, unit };
}

function agentKey(unit, agent) {
  return `${unit.id}:${agent.id}`;
}

function assignedAgents(unit, order) {
  const assigned = new Set(order.assigned);
  return unit.soldierAI.agents.filter(agent =>
    assigned.has(agentKey(unit, agent)));
}

function completeEnter(harness, order, { upper = false } = {}) {
  for (const agent of assignedAgents(harness.unit, order)) {
    agent.position.fromArray(order.approachPosition);
    agent.syncRecord();
  }
  harness.interactions.advance(0);
  harness.interactions.advance(1.2);
  if (upper) harness.interactions.advance(3.8);
}

function issueEnterWithLivingLimit(harness, count, buildingId, floorId) {
  const available = harness.unit.soldierAI.agents
    .filter(agent => !agent.buildingLocation)
    .sort((left, right) => left.id.localeCompare(right.id));
  const sidelined = available.slice(count).map(agent => ({
    agent,
    health: agent.health,
    status: agent.status,
    state: agent.state
  }));
  for (const saved of sidelined) {
    saved.agent.health = 0;
    saved.agent.status = 'KIA';
    saved.agent.state = 'CASUALTY';
    saved.agent.syncRecord();
  }
  const order = harness.interactions.issueEnter(
    harness.unit,
    buildingId,
    floorId
  );
  for (const saved of sidelined) {
    saved.agent.health = saved.health;
    saved.agent.status = saved.status;
    saved.agent.state = saved.state;
    saved.agent.syncRecord();
  }
  return order;
}

function occupyBothBuildings(harness) {
  const farmhouseOrder = issueEnterWithLivingLimit(
    harness,
    3,
    'farmhouse',
    'ground-floor'
  );
  assert.equal(farmhouseOrder.accepted, true);
  assert.equal(farmhouseOrder.assigned.length, 3);
  completeEnter(harness, farmhouseOrder);

  const upperOrder = harness.interactions.issueEnter(
    harness.unit,
    'upper-house',
    'upper-floor'
  );
  assert.equal(upperOrder.accepted, true);
  assert.equal(upperOrder.assigned.length, 3);
  completeEnter(harness, upperOrder, { upper: true });
  assert.deepEqual(harness.interactions.captureState().orders, []);
}

function captureHarness(harness) {
  return {
    buildings: harness.buildings.captureState(),
    interactions: harness.interactions.captureState(),
    unit: {
      position: harness.unit.position.toArray(),
      waypoints: structuredClone(harness.unit.waypoints),
      currentWaypointIndex: harness.unit.currentWaypointIndex,
      agents: [...harness.unit.soldierAI.agents]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(agent => ({
          id: agent.id,
          position: agent.position.toArray(),
          velocity: agent.velocity.toArray(),
          facing: agent.facing,
          state: agent.state,
          stance: agent.stance,
          health: agent.health,
          status: agent.status,
          buildingLocation: structuredClone(agent.buildingLocation),
          record: structuredClone(agent.record)
        }))
    }
  };
}

function restoreHarness(harness, snapshot) {
  harness.buildings.restoreState(snapshot.buildings);
  harness.interactions.restoreState(snapshot.interactions);
  harness.unit.position.fromArray(snapshot.unit.position);
  harness.unit.waypoints = structuredClone(snapshot.unit.waypoints);
  harness.unit.currentWaypointIndex = snapshot.unit.currentWaypointIndex;
  for (const saved of snapshot.unit.agents) {
    const agent = harness.unit.soldierAI.agents.find(candidate =>
      candidate.id === saved.id);
    agent.position.fromArray(saved.position);
    agent.velocity.fromArray(saved.velocity);
    agent.facing = saved.facing;
    agent.state = saved.state;
    agent.stance = saved.stance;
    agent.health = saved.health;
    agent.status = saved.status;
    agent.buildingLocation = structuredClone(saved.buildingLocation);
    agent.record = structuredClone(saved.record);
  }
}

function occupancyKeys(buildings, buildingId) {
  return Object.values(buildings.getBuildingSnapshot(buildingId).occupancy)
    .map(occupant => occupant.soldierKey)
    .sort();
}

test('overlapping ENTER rejection is atomic and leaves the first order completable', () => {
  const harness = createHarness();
  const first = harness.interactions.issueEnter(
    harness.unit,
    'upper-house',
    'upper-floor'
  );
  assert.equal(first.accepted, true);
  assert.equal(first.assigned.length, 6);
  const upperSlots = createRoomSlotIndex(FR_HOUSE_12X9_2F);
  const assignedUpperSlots = assignedAgents(harness.unit, first).map(agent =>
    upperSlots.get(agent.buildingLocation.targetSlotId));
  assert.equal(
    assignedUpperSlots.filter(slot => !slot.isSupport).length,
    4,
    'the four authored fire-port positions remain finite and exclusive'
  );
  assert.equal(
    assignedUpperSlots.filter(slot => slot.isGeneratedSupport).length,
    2,
    'the remaining living soldiers use physical-policy support positions'
  );
  harness.unit.waypoints = [{
    orderType: 'QUICK',
    position: [...first.approachPosition]
  }];
  harness.unit.currentWaypointIndex = 0;
  const beforeOverlap = captureHarness(harness);

  assert.deepEqual(
    harness.interactions.issueEnter(
      harness.unit,
      'farmhouse',
      'ground-floor'
    ),
    { accepted: false, reason: 'enter_in_progress', assigned: [] }
  );
  assert.deepEqual(captureHarness(harness), beforeOverlap);

  completeEnter(harness, first, { upper: true });
  assert.equal(
    occupancyKeys(harness.buildings, 'upper-house').length,
    first.assigned.length
  );
  assert.deepEqual(
    harness.buildings.getBuildingSnapshot('upper-house').reservations,
    {}
  );
  assert.deepEqual(
    harness.buildings.getBuildingSnapshot('farmhouse').reservations,
    {}
  );
  assert.deepEqual(
    harness.buildings.getBuildingSnapshot('farmhouse').occupancy,
    {}
  );
  assert.deepEqual(harness.interactions.captureState().orders, []);
});

test('one EXIT order advances stable assignments from each occupied building', () => {
  const harness = createHarness();
  occupyBothBuildings(harness);

  const exit = harness.interactions.issueExit(harness.unit);
  assert.equal(exit.accepted, true);
  assert.equal(exit.assigned.length, 6);
  const capturedOrder = harness.interactions.captureState().orders[0];
  assert.deepEqual(
    capturedOrder.assignments
      .map(assignment => ({
        soldierKey: assignment.soldierKey,
        buildingId: assignment.buildingId
      })),
    harness.unit.soldierAI.agents.map(agent => ({
      soldierKey: agentKey(harness.unit, agent),
      buildingId: Number(agent.id.at(-1)) < 3 ? 'farmhouse' : 'upper-house'
    }))
  );

  harness.interactions.advance(0);
  harness.interactions.advance(3.8);
  harness.interactions.advance(1.2);

  assert.ok(harness.unit.soldierAI.agents.every(agent =>
    agent.buildingLocation === null));
  for (const buildingId of ['farmhouse', 'upper-house']) {
    const state = harness.buildings.getBuildingSnapshot(buildingId);
    assert.deepEqual(state.occupancy, {});
    assert.deepEqual(state.reservations, {});
  }
  assert.deepEqual(harness.interactions.captureState().orders, []);
});

test('mixed-building EXIT assignments restore and replay from mid-transit', () => {
  const original = createHarness();
  occupyBothBuildings(original);
  assert.equal(original.interactions.issueExit(original.unit).accepted, true);
  original.interactions.advance(0);
  original.interactions.advance(0.45);

  const midExit = captureHarness(original);
  const assignmentBuildings = midExit.interactions.orders[0].assignments
    .map(assignment => assignment.buildingId);
  assert.deepEqual(
    assignmentBuildings,
    ['farmhouse', 'farmhouse', 'farmhouse',
      'upper-house', 'upper-house', 'upper-house']
  );

  const restored = createHarness();
  restoreHarness(restored, midExit);
  assert.deepEqual(captureHarness(restored), midExit);

  for (const delta of [0.55, 3.25, 1.2]) {
    original.interactions.advance(delta);
    restored.interactions.advance(delta);
    assert.deepEqual(captureHarness(restored), captureHarness(original));
  }
  assert.ok(original.unit.soldierAI.agents.every(agent =>
    agent.buildingLocation === null));
  assert.deepEqual(original.interactions.captureState().orders, []);
});

test('orderless lethal casualty releases one slot once and stable entrants reuse it', () => {
  const original = createHarness();
  const enter = issueEnterWithLivingLimit(
    original,
    3,
    'farmhouse',
    'ground-floor'
  );
  assert.equal(enter.accepted, true);
  completeEnter(original, enter);
  assert.deepEqual(original.interactions.captureState().orders, []);

  const casualty = assignedAgents(original.unit, enter)[0];
  const releasedSlotId = casualty.buildingLocation.nodeId;
  const casualtyKey = agentKey(original.unit, casualty);
  original.unit.applySoldierDamage(casualty.id, 200);
  original.interactions.advance(0);

  assert.equal(casualty.buildingLocation, null);
  assert.ok(!occupancyKeys(original.buildings, 'farmhouse').includes(casualtyKey));
  const afterCleanup = original.buildings.getBuildingSnapshot('farmhouse');
  assert.equal(
    afterCleanup.events.filter(event =>
      event.type === 'occupant_released'
        && event.reason === 'casualty'
        && event.soldierKey === casualtyKey).length,
    1
  );

  const cleanupVersion = afterCleanup.eventVersion;
  original.interactions.advance(0);
  original.interactions.advance(1);
  assert.equal(
    original.buildings.getBuildingSnapshot('farmhouse').eventVersion,
    cleanupVersion
  );

  const cleaned = captureHarness(original);
  const restored = createHarness();
  restoreHarness(restored, cleaned);
  restored.interactions.advance(0);
  assert.deepEqual(captureHarness(restored), cleaned);

  const replacement = restored.interactions.issueEnter(
    restored.unit,
    'farmhouse',
    'ground-floor'
  );
  assert.equal(replacement.accepted, true);
  assert.equal(replacement.assigned.length, 3);
  const replacementAgent = assignedAgents(restored.unit, replacement)[0];
  assert.equal(replacementAgent.buildingLocation.targetSlotId, releasedSlotId);
  completeEnter(restored, replacement);
  assert.equal(
    restored.buildings.getBuildingSnapshot('farmhouse')
      .occupancy[releasedSlotId].soldierKey,
    agentKey(restored.unit, replacementAgent)
  );
});

test('positive-health unavailable occupants release their slots once', () => {
  for (const status of ['INCAPACITATED', 'DEAD']) {
    const harness = createHarness();
    const enter = harness.interactions.issueEnter(
      harness.unit,
      'farmhouse',
      'ground-floor'
    );
    assert.equal(enter.accepted, true);
    completeEnter(harness, enter);

    const unavailable = assignedAgents(harness.unit, enter)[0];
    const key = agentKey(harness.unit, unavailable);
    unavailable.status = status;
    unavailable.syncRecord();
    harness.interactions.advance(0);

    assert.equal(unavailable.health, 100);
    assert.equal(unavailable.status, status);
    assert.equal(unavailable.buildingLocation, null);
    const afterCleanup = harness.buildings.getBuildingSnapshot('farmhouse');
    assert.ok(!occupancyKeys(harness.buildings, 'farmhouse').includes(key));
    assert.equal(
      afterCleanup.events.filter(event =>
        event.type === 'occupant_released'
          && event.reason === 'casualty'
          && event.soldierKey === key).length,
      1
    );

    harness.interactions.advance(0);
    assert.equal(
      harness.buildings.getBuildingSnapshot('farmhouse').eventVersion,
      afterCleanup.eventVersion
    );
  }
});
