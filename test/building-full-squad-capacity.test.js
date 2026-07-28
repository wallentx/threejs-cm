import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingInteractionSystem } from '../src/game/BuildingInteractionSystem.js';
import { FR_FARMHOUSE_8X6_1F } from '../src/maps/france/FranceFarmhouse8x6_1F.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { BuildingSystem } from '../src/simulation/buildings/BuildingSystem.js';
import { Unit } from './helpers/France1940TestUnit.js';

const FARMHOUSE_ID = 'french_farmhouse_outbuilding';

function disposeUnit(unit) {
  const geometries = new Set();
  const materials = new Set();
  unit.mesh?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const owned = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of owned) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function projection(buildings, unit) {
  return {
    building: buildings.getBuildingSnapshot(FARMHOUSE_ID),
    roster: unit.soldierAI.agents.map(agent => ({
      id: agent.id,
      position: agent.position.toArray(),
      buildingLocation: structuredClone(agent.buildingLocation)
    }))
  };
}

test('the rotated Stonne farmhouse admits, restores, and exits one real six-man French squad', () => {
  const placement = STONNE_1940_MAP.structures.find(
    structure => structure.id === FARMHOUSE_ID
  );
  assert.ok(placement);
  assert.equal(placement.rotationY, Math.PI / 2);

  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_FARMHOUSE_8X6_1F);
  buildings.addBuilding({
    id: FARMHOUSE_ID,
    descriptorId: FR_FARMHOUSE_8X6_1F.id,
    transform: {
      position: [placement.position[0], placement.foundationClearance, placement.position[1]],
      rotationY: placement.rotationY
    }
  });
  const squad = new Unit({
    id: 'farmhouse-six',
    faction: 'french',
    squadSize: 6,
    position: new THREE.Vector3(-45, 0.12, 42)
  });
  const seventh = new Unit({
    id: 'farmhouse-seventh',
    faction: 'french',
    squadSize: 1,
    position: new THREE.Vector3(-45, 0.12, 42)
  });
  const units = [squad, seventh];
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => units
  });

  try {
    const enter = interactions.issueEnter(
      squad,
      FARMHOUSE_ID,
      'ground-floor'
    );
    assert.equal(enter.accepted, true);
    assert.equal(enter.assigned.length, 6);
    assert.equal(enter.unassigned, 0);
    for (const agent of squad.soldierAI.agents) {
      agent.position.fromArray(enter.approachPosition);
    }
    interactions.advance(0);
    interactions.advance(FR_FARMHOUSE_8X6_1F.portals[0].transitSeconds);

    assert.ok(
      squad.soldierAI.agents.every(
        agent => agent.buildingLocation?.phase === 'occupied'
      )
    );
    assert.equal(
      Object.keys(buildings.getBuildingSnapshot(FARMHOUSE_ID).occupancy).length,
      6
    );
    assert.deepEqual(
      [...new Set(
        squad.soldierAI.agents.map(agent => agent.buildingLocation.nodeId)
      )].sort(),
      FR_FARMHOUSE_8X6_1F.rooms[0].slots.map(slot => slot.id).sort()
    );

    const full = interactions.issueEnter(
      seventh,
      FARMHOUSE_ID,
      'ground-floor'
    );
    assert.deepEqual(full, {
      accepted: false,
      reason: 'no_free_slots',
      assigned: []
    });

    const occupiedSnapshot = {
      buildings: buildings.captureState(),
      interactions: interactions.captureState(),
      squad: squad.captureState()
    };
    assert.equal(interactions.issueExit(squad).accepted, true);
    interactions.advance(FR_FARMHOUSE_8X6_1F.portals[0].transitSeconds);
    const firstExit = projection(buildings, squad);
    assert.deepEqual(firstExit.building.occupancy, {});
    assert.ok(firstExit.roster.every(agent => agent.buildingLocation === null));

    buildings.restoreState(occupiedSnapshot.buildings);
    squad.restoreState(
      occupiedSnapshot.squad,
      new Map([[squad.id, squad], [seventh.id, seventh]])
    );
    interactions.restoreState(occupiedSnapshot.interactions);
    assert.equal(interactions.issueExit(squad).accepted, true);
    interactions.advance(FR_FARMHOUSE_8X6_1F.portals[0].transitSeconds);
    assert.deepEqual(projection(buildings, squad), firstExit);
  } finally {
    disposeUnit(squad);
    disposeUnit(seventh);
  }
});
