import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingInteractionSystem } from '../src/game/BuildingInteractionSystem.js';
import { FR_FARMHOUSE_8X6_1F } from '../src/maps/france/FranceFarmhouse8x6_1F.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { BuildingSystem } from '../src/simulation/buildings/BuildingSystem.js';
import { StaticCollisionWorld } from '../src/simulation/collision/StaticCollisionWorld.js';
import {
  createRoomSlotIndex,
  getFloorSupportSlots,
  INTERIOR_SUPPORT_POLICY
} from '../src/simulation/buildings/BuildingOccupancy.js';
import { Unit } from './helpers/France1940TestUnit.js';

const FARMHOUSE_ID = 'french_farmhouse_outbuilding';

function createSparseFarmhouseDescriptor() {
  const descriptor = structuredClone(FR_FARMHOUSE_8X6_1F);
  descriptor.id = 'fr_farmhouse_8x6_1f_sparse_authored_positions';
  const room = descriptor.rooms[0];
  const retainedSlotIds = new Set([
    'ground-front-left',
    'ground-front-right'
  ]);
  room.slots = room.slots.filter(slot => retainedSlotIds.has(slot.id));
  descriptor.firePorts = descriptor.firePorts.filter(port =>
    retainedSlotIds.has(port.approachSlotId));
  return descriptor;
}

function createMultiRoomPolicyDescriptor(descriptor) {
  const result = structuredClone(descriptor);
  result.id = 'fr_farmhouse_8x6_1f_two_room_partition';
  const [leftSlot, rightSlot] = result.rooms[0].slots;
  result.floors[0].rooms = ['left-room', 'right-room'];
  result.rooms = [
    {
      ...result.rooms[0],
      id: 'right-room',
      slots: [rightSlot]
    },
    {
      ...result.rooms[0],
      id: 'left-room',
      slots: [leftSlot]
    }
  ];
  result.firePorts = result.firePorts.map(port => ({
    ...port,
    roomId: port.approachSlotId === leftSlot.id ? 'left-room' : 'right-room'
  }));
  const originalDoor = result.portals[0];
  result.portals = [
    {
      ...originalDoor,
      id: 'left-door',
      to: 'left-room'
    },
    {
      ...originalDoor,
      id: 'right-door',
      to: 'right-room',
      aperture: {
        ...originalDoor.aperture,
        id: 'right-door-aperture',
        center: [1.4, originalDoor.aperture.center[1], originalDoor.aperture.center[2]]
      }
    }
  ];
  return result;
}

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

test('physical floor support admits, partitions, restores, and releases a full squad', () => {
  const placement = STONNE_1940_MAP.structures.find(
    structure => structure.id === FARMHOUSE_ID
  );
  assert.ok(placement);
  assert.equal(placement.rotationY, Math.PI / 2);

  const descriptor = createMultiRoomPolicyDescriptor(
    createSparseFarmhouseDescriptor()
  );
  const supportSlots = getFloorSupportSlots(descriptor, 'ground-floor');
  assert.ok(supportSlots.length >= 4);
  assert.ok(supportSlots.every(slot =>
    slot.localPosition[0] >= descriptor.bounds.min[0]
      + INTERIOR_SUPPORT_POLICY.wallInsetMeters
    && slot.localPosition[0] <= descriptor.bounds.max[0]
      - INTERIOR_SUPPORT_POLICY.wallInsetMeters
    && slot.localPosition[2] >= descriptor.bounds.min[2]
      + INTERIOR_SUPPORT_POLICY.wallInsetMeters
    && slot.localPosition[2] <= descriptor.bounds.max[2]
      - INTERIOR_SUPPORT_POLICY.wallInsetMeters
    && slot.localPosition[1] === 0.15
    && slot.placementDataQuality.startsWith('first-order')));
  for (let index = 0; index < supportSlots.length; index++) {
    for (let other = index + 1; other < supportSlots.length; other++) {
      assert.ok(Math.hypot(
        supportSlots[index].localPosition[0] - supportSlots[other].localPosition[0],
        supportSlots[index].localPosition[2] - supportSlots[other].localPosition[2]
      ) >= INTERIOR_SUPPORT_POLICY.spacingMeters - 1e-9);
    }
  }

  const partitioned = getFloorSupportSlots(descriptor, 'ground-floor');
  const reordered = structuredClone(descriptor);
  reordered.rooms.reverse();
  assert.deepEqual(
    getFloorSupportSlots(reordered, 'ground-floor'),
    partitioned,
    'room input order cannot change floor candidates or ownership'
  );
  assert.deepEqual(
    [...new Set(partitioned.map(slot => slot.id))].length,
    partitioned.length,
    'the floor lattice is generated once, not duplicated per room'
  );
  assert.deepEqual(
    [...new Set(partitioned.map(slot => slot.roomId))].sort(),
    ['left-room', 'right-room'],
    'nearest authored room-slot centroids partition the shared lattice'
  );

  const buildings = new BuildingSystem();
  buildings.registerDescriptor(descriptor);
  buildings.addBuilding({
    id: FARMHOUSE_ID,
    descriptorId: descriptor.id,
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
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => [squad]
  });
  const movementSnapshot = buildings.getMovementCollisionSnapshot(FARMHOUSE_ID);
  const collisionWorld = new StaticCollisionWorld(movementSnapshot.records);
  squad.collisionWorld = collisionWorld;

  try {
    const enter = interactions.issueEnter(
      squad,
      FARMHOUSE_ID,
      'ground-floor'
    );
    assert.equal(enter.accepted, true);
    assert.equal(enter.assigned.length, 6);
    assert.equal(enter.unassigned, 0);
    assert.deepEqual(enter.entryPortalIds, ['left-door', 'right-door']);
    const approachBySoldier = new Map(enter.approachAssignments.map(record => [
      record.soldierKey,
      record
    ]));
    const slotIndex = createRoomSlotIndex(descriptor);
    for (const agent of squad.soldierAI.agents) {
      const key = `${squad.id}:${agent.id}`;
      const approach = approachBySoldier.get(key);
      assert.ok(approach);
      const targetRoomId = slotIndex.get(approach.targetSlotId).roomId;
      const portal = descriptor.portals.find(candidate =>
        candidate.id === approach.entryPortalId);
      assert.equal(portal.to, targetRoomId);
    }
    const terrain = {
      collisionWorld,
      bocageObstacles: [],
      getHeightAt: () => placement.foundationClearance,
      getMovementHeightAt: () => placement.foundationClearance
    };
    assert.ok(
      movementSnapshot.records.some(record =>
        record.buildingId === FARMHOUSE_ID
          && record.blocks.includes('infantry')),
      'the live approach runs against the authoritative building collision records'
    );
    for (const waypoint of enter.approachRoute) {
      squad.addWaypoint(new THREE.Vector3().fromArray(waypoint), 'QUICK');
    }
    const initialPositions = new Map(squad.soldierAI.agents.map(agent => [
      agent.id,
      agent.position.clone()
    ]));
    const doorTransitBySoldier = new Map();
    for (let step = 0; step < 1200; step++) {
      squad.update(1 / 30, terrain);
      interactions.advance(1 / 30);
      for (const agent of squad.soldierAI.agents) {
        const location = agent.buildingLocation;
        if (location?.phase === 'transit' && location.routeStage === 'door') {
          doorTransitBySoldier.set(agent.id, location.entryPortalId);
        }
      }
      if (squad.soldierAI.agents.every(
        agent => agent.buildingLocation?.phase === 'occupied'
      )) break;
    }

    assert.ok(
      squad.soldierAI.agents.every(
        agent => agent.buildingLocation?.phase === 'occupied'
      )
    );
    assert.equal(doorTransitBySoldier.size, 6);
    for (const agent of squad.soldierAI.agents) {
      const assignment = approachBySoldier.get(`${squad.id}:${agent.id}`);
      assert.equal(
        doorTransitBySoldier.get(agent.id),
        assignment.entryPortalId,
        'each individual advances to and enters through its reserved door'
      );
      assert.ok(
        agent.position.distanceTo(initialPositions.get(agent.id)) > 1,
        'the live Unit movement path advances each soldier from outside'
      );
    }
    assert.equal(
      Object.keys(buildings.getBuildingSnapshot(FARMHOUSE_ID).occupancy).length,
      6
    );
    const occupiedIndex = createRoomSlotIndex(descriptor);
    const occupiedSupport = squad.soldierAI.agents.filter(agent =>
      occupiedIndex.get(agent.buildingLocation.nodeId)?.isGeneratedSupport);
    assert.equal(occupiedSupport.length, 4);
    assert.ok(occupiedSupport.every(agent =>
      agent.buildingLocation.firePortId == null
      && interactions.canFireAt(agent, [-45, 1, 80]) === false));

    const occupiedSnapshot = {
      buildings: buildings.captureState(),
      interactions: interactions.captureState(),
      squad: squad.captureState()
    };

    const casualty = occupiedSupport[0];
    const casualtySlotId = casualty.buildingLocation.nodeId;
    casualty.health = 0;
    casualty.status = 'KIA';
    casualty.syncRecord();
    interactions.advance(0);
    assert.equal(casualty.buildingLocation, null);
    assert.equal(
      buildings.getBuildingSnapshot(FARMHOUSE_ID).occupancy[casualtySlotId],
      undefined
    );

    buildings.restoreState(occupiedSnapshot.buildings);
    squad.restoreState(occupiedSnapshot.squad, new Map([[squad.id, squad]]));
    interactions.restoreState(occupiedSnapshot.interactions);
    assert.equal(interactions.issueExit(squad).accepted, true);
    interactions.advance(descriptor.portals[0].transitSeconds);
    const firstExit = projection(buildings, squad);
    assert.deepEqual(firstExit.building.occupancy, {});
    assert.ok(firstExit.roster.every(agent => agent.buildingLocation === null));

    buildings.restoreState(occupiedSnapshot.buildings);
    squad.restoreState(
      occupiedSnapshot.squad,
      new Map([[squad.id, squad]])
    );
    interactions.restoreState(occupiedSnapshot.interactions);
    assert.equal(interactions.issueExit(squad).accepted, true);
    interactions.advance(descriptor.portals[0].transitSeconds);
    assert.deepEqual(projection(buildings, squad), firstExit);
  } finally {
    disposeUnit(squad);
  }
});
