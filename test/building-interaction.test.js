import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { BuildingInteractionSystem } from '../src/game/BuildingInteractionSystem.js';
import { Unit } from '../src/game/Unit.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';

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
  for (const agent of agents.slice(0, 4)) {
    agent.position.fromArray(order.approachPosition);
  }

  interactions.advance(0);
  interactions.advance(1.2);
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
