import {
  localToWorldPoint,
  worldToLocalPoint
} from '../simulation/buildings/index.js';

const APPROACH_DISTANCE_METERS = 3.25;
const OUTSIDE_STANDOFF_METERS = 0.85;
const EPSILON = 1e-9;

function compareId(left, right) {
  return String(left).localeCompare(String(right));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function soldierKey(unitId, soldierId) {
  return `${unitId}:${soldierId}`;
}

function livingAgents(unit) {
  return [...(unit?.soldierAI?.getLivingAgents?.() ?? [])]
    .sort((left, right) => compareId(left.id, right.id));
}

function setPosition(agent, position) {
  if (!agent?.position || !position) return;
  if (typeof agent.position.set === 'function') {
    agent.position.set(position[0], position[1], position[2]);
  } else {
    agent.position.x = position[0];
    agent.position.y = position[1];
    agent.position.z = position[2];
  }
}

function distanceXZ(agent, position) {
  return Math.hypot(
    (Number(agent?.position?.x) || 0) - position[0],
    (Number(agent?.position?.z) || 0) - position[2]
  );
}

function lerpPosition(from, to, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t
  ];
}

function roomsOnFloor(descriptor, floorId) {
  const rooms = new Set(
    descriptor.floors.find(floor => floor.id === floorId)?.rooms ?? []
  );
  return descriptor.rooms.filter(room => rooms.has(room.id));
}

function slotsOnFloor(descriptor, floorId) {
  return roomsOnFloor(descriptor, floorId)
    .flatMap(room => room.slots)
    .sort((left, right) => compareId(left.id, right.id));
}

function slotIndex(descriptor) {
  const index = new Map();
  for (const room of descriptor.rooms) {
    for (const slot of room.slots) index.set(slot.id, { ...slot, roomId: room.id });
  }
  return index;
}

function portalIndex(descriptor) {
  return new Map(descriptor.portals.map(portal => [portal.id, portal]));
}

function entryPortal(descriptor) {
  return descriptor.portals.find(portal => portal.kind === 'door'
    && (portal.from === 'outside' || portal.to === 'outside')) ?? null;
}

function lowerFloorId(descriptor) {
  return [...descriptor.floors]
    .sort((left, right) => left.elevation - right.elevation || compareId(left.id, right.id))[0]?.id;
}

function isUpperFloor(descriptor, floorId) {
  return floorId !== lowerFloorId(descriptor);
}

function syncAgent(agent) {
  if (!agent) return;
  agent.record.buildingLocation = clone(agent.buildingLocation);
  agent.syncRecord?.();
}

/**
 * Game-layer adapter between individual live soldiers and renderer-neutral
 * BuildingSystem state. It owns orders/transit only; topology, reservations,
 * damage, and collapse remain authoritative in BuildingSystem.
 */
export class BuildingInteractionSystem {
  constructor({ buildingSystem, getUnits = () => [] } = {}) {
    if (!buildingSystem) throw new Error('BuildingInteractionSystem requires BuildingSystem');
    this.buildingSystem = buildingSystem;
    this.getUnits = getUnits;
    this.orderSequence = 0;
    this.orders = new Map();
  }

  findBuildingAt(worldPosition, paddingMeters = 1.5) {
    const point = Array.isArray(worldPosition)
      ? worldPosition
      : [worldPosition?.x ?? 0, worldPosition?.y ?? 0, worldPosition?.z ?? 0];
    const ids = this.buildingSystem.captureState().buildings
      .map(record => record.id)
      .sort(compareId);
    for (const id of ids) {
      const state = this.buildingSystem.getBuildingSnapshot(id);
      const descriptor = this.buildingSystem.getDescriptorForBuilding(id);
      const local = worldToLocalPoint(point, state.transform);
      if (local[0] >= descriptor.bounds.min[0] - paddingMeters
          && local[0] <= descriptor.bounds.max[0] + paddingMeters
          && local[2] >= descriptor.bounds.min[2] - paddingMeters
          && local[2] <= descriptor.bounds.max[2] + paddingMeters) return id;
    }
    return null;
  }

  getEntryApproachPosition(buildingId) {
    const state = this.buildingSystem.getBuildingSnapshot(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    const portal = entryPortal(descriptor);
    if (!portal?.aperture) return [...state.transform.position];
    const [x, , z] = portal.aperture.center;
    const length = Math.hypot(x, z) || 1;
    const floorY = descriptor.floors
      .find(floor => floor.id === lowerFloorId(descriptor))?.elevation ?? 0;
    return localToWorldPoint([
      x + x / length * OUTSIDE_STANDOFF_METERS,
      floorY + 0.15,
      z + z / length * OUTSIDE_STANDOFF_METERS
    ], state.transform);
  }

  issueEnter(unit, buildingId, floorId = null) {
    if (unit?.type !== 'infantry_squad') {
      return { accepted: false, reason: 'infantry_only', assigned: [] };
    }
    const state = this.buildingSystem.getBuildingSnapshot(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    const resolvedFloorId = floorId ?? lowerFloorId(descriptor);
    if (!descriptor.floors.some(floor => floor.id === resolvedFloorId)) {
      return { accepted: false, reason: 'unknown_floor', assigned: [] };
    }
    const agents = livingAgents(unit).filter(agent => !agent.buildingLocation
      || agent.buildingLocation.phase === 'outside');
    if (agents.length === 0) {
      return { accepted: false, reason: 'no_available_soldiers', assigned: [] };
    }

    const entrySlots = slotsOnFloor(descriptor, lowerFloorId(descriptor));
    const finalSlots = slotsOnFloor(descriptor, resolvedFloorId);
    const count = Math.min(agents.length, entrySlots.length, finalSlots.length);
    const sequence = ++this.orderSequence;
    const requests = [];
    for (let index = 0; index < count; index++) {
      requests.push({
        nodeId: entrySlots[index].id,
        orderSequence: sequence,
        unitId: unit.id,
        soldierId: agents[index].id,
        soldierKey: soldierKey(unit.id, agents[index].id)
      });
    }
    const results = this.buildingSystem.resolveReservations(buildingId, requests);
    const resultByKey = new Map(results.map(result => [result.soldierKey, result]));
    const assigned = [];
    for (let index = 0; index < count; index++) {
      const agent = agents[index];
      const key = soldierKey(unit.id, agent.id);
      if (!resultByKey.get(key)?.accepted) continue;
      agent.buildingLocation = {
        buildingId: String(buildingId),
        phase: 'approaching',
        nodeId: 'outside',
        fromNodeId: null,
        toNodeId: entrySlots[index].id,
        portalId: null,
        transitElapsed: 0,
        reservedNodeId: entrySlots[index].id,
        firePortId: null,
        soldierKey: key,
        unitId: String(unit.id),
        soldierId: String(agent.id),
        action: 'ENTER',
        routeStage: 'door',
        targetFloorId: resolvedFloorId,
        targetSlotId: finalSlots[index].id,
        entrySlotId: entrySlots[index].id
      };
      syncAgent(agent);
      assigned.push(key);
    }
    if (assigned.length === 0) {
      return { accepted: false, reason: 'no_free_slots', assigned: [] };
    }
    this.orders.set(String(unit.id), {
      unitId: String(unit.id),
      buildingId: String(buildingId),
      action: 'ENTER',
      floorId: resolvedFloorId,
      sequence,
      assigned: [...assigned]
    });
    return {
      accepted: true,
      reason: null,
      assigned,
      unassigned: agents.length - assigned.length,
      approachPosition: this.getEntryApproachPosition(buildingId),
      stateVersion: state.eventVersion
    };
  }

  issueExit(unit) {
    if (unit?.type !== 'infantry_squad') {
      return { accepted: false, reason: 'infantry_only', assigned: [] };
    }
    const agents = livingAgents(unit)
      .filter(agent => agent.buildingLocation?.buildingId
        && agent.buildingLocation.phase !== 'outside');
    if (agents.length === 0) {
      return { accepted: false, reason: 'not_inside', assigned: [] };
    }
    const sequence = ++this.orderSequence;
    const buildingId = String(agents[0].buildingLocation.buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    const groundSlots = slotsOnFloor(descriptor, lowerFloorId(descriptor));
    const assigned = [];

    // Ground-floor occupants start through the door first. Their released
    // slots then become deterministic landing slots for upstairs occupants.
    for (const agent of agents) {
      const location = agent.buildingLocation;
      const slot = slotIndex(descriptor).get(location.nodeId);
      const slotFloorId = descriptor.rooms.find(room => room.id === slot?.roomId)?.floorId;
      location.action = 'EXIT';
      location.targetFloorId = null;
      location.targetSlotId = null;
      if (!isUpperFloor(descriptor, slotFloorId)) {
        this.#startDoorExit(agent, buildingId, descriptor);
      } else {
        location.phase = 'exit-waiting';
        location.routeStage = 'stairs';
        location.exitGroundSlots = groundSlots.map(candidate => candidate.id);
        syncAgent(agent);
      }
      assigned.push(soldierKey(unit.id, agent.id));
    }
    this.orders.set(String(unit.id), {
      unitId: String(unit.id),
      buildingId,
      action: 'EXIT',
      floorId: null,
      sequence,
      assigned: [...assigned]
    });
    return { accepted: true, reason: null, assigned };
  }

  advance(deltaSeconds) {
    const delta = Math.max(0, Number(deltaSeconds) || 0);
    const units = new Map((this.getUnits() ?? []).map(unit => [String(unit.id), unit]));
    for (const order of [...this.orders.values()]
      .sort((left, right) => left.sequence - right.sequence || compareId(left.unitId, right.unitId))) {
      const unit = units.get(order.unitId);
      if (!unit) {
        this.orders.delete(order.unitId);
        continue;
      }
      for (const agent of livingAgents(unit)) {
        const location = agent.buildingLocation;
        if (!location || location.buildingId !== order.buildingId) continue;
        this.#advanceAgent(agent, location, delta);
      }
      for (const agent of unit.soldierAI?.agents ?? []) {
        if (agent.isAlive || !agent.buildingLocation?.buildingId) continue;
        this.buildingSystem.handleCasualty(
          agent.buildingLocation.buildingId,
          soldierKey(unit.id, agent.id)
        );
        agent.buildingLocation = null;
        syncAgent(agent);
      }
      const pending = (unit.soldierAI?.agents ?? []).some(agent => {
        const location = agent.buildingLocation;
        if (!location || location.buildingId !== order.buildingId) return false;
        if (order.action === 'ENTER') return !['occupied', 'outside'].includes(location.phase);
        return location.phase !== 'outside';
      });
      if (!pending) this.orders.delete(order.unitId);
      unit.soldierAI?.syncMeshes?.();
    }
  }

  getFirePort(agent) {
    const location = agent?.buildingLocation;
    if (!location?.buildingId || location.phase !== 'occupied') return null;
    return this.buildingSystem.getFirePorts(location.buildingId)
      .find(port => port.occupiedBy === location.soldierKey && port.enabled) ?? null;
  }

  canFireAt(agent, targetPosition) {
    const location = agent?.buildingLocation;
    if (!location?.buildingId || location.phase !== 'occupied') return true;
    const port = this.getFirePort(agent);
    if (!port || !targetPosition) return false;
    const target = Array.isArray(targetPosition)
      ? targetPosition
      : [targetPosition.x, targetPosition.y, targetPosition.z];
    const directionX = target[0] - port.worldPosition[0];
    const directionZ = target[2] - port.worldPosition[2];
    const length = Math.hypot(directionX, directionZ);
    if (length <= EPSILON) return false;
    const normalLength = Math.hypot(port.worldNormal[0], port.worldNormal[2]) || 1;
    const cosine = (directionX * port.worldNormal[0] + directionZ * port.worldNormal[2])
      / (length * normalLength);
    return cosine + EPSILON >= Math.cos((port.horizontalArcDeg * Math.PI / 180) * 0.5);
  }

  handleOccupantConsequences(consequences) {
    const unitMap = new Map((this.getUnits() ?? []).map(unit => [String(unit.id), unit]));
    for (const consequence of [...(consequences ?? [])]
      .sort((left, right) => compareId(left.soldierKey, right.soldierKey))) {
      const unit = unitMap.get(String(consequence.unitId));
      const agent = unit?.soldierAI?.agents?.find(candidate =>
        String(candidate.id) === String(consequence.soldierId));
      if (!unit || !agent) continue;
      unit.applySoldierDamage?.(agent.id, consequence.damage, 55);
      if (!agent.isAlive) {
        this.buildingSystem.handleCasualty(
          agent.buildingLocation?.buildingId ?? consequence.buildingId,
          consequence.soldierKey
        );
        agent.buildingLocation = null;
        syncAgent(agent);
        continue;
      }
      if (consequence.phase === 'occupied') {
        const buildingId = agent.buildingLocation?.buildingId;
        const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
        agent.buildingLocation = {
          ...agent.buildingLocation,
          phase: 'occupied',
          nodeId: consequence.toNodeId,
          fromNodeId: null,
          toNodeId: null,
          portalId: null,
          transitElapsed: 0,
          reservedNodeId: null,
          routeStage: null
        };
        setPosition(agent, this.#slotWorldPosition(
          buildingId,
          descriptor,
          consequence.toNodeId
        ));
        this.#setOccupiedPose(agent);
      } else {
        const buildingId = agent.buildingLocation?.buildingId;
        const state = this.buildingSystem.getBuildingSnapshot(buildingId);
        const offset = (String(agent.id).charCodeAt(0) % 3 - 1) * 0.7;
        setPosition(agent, [
          state.transform.position[0] + offset,
          state.transform.position[1] + 0.2,
          state.transform.position[2]
        ]);
        agent.buildingLocation = null;
        syncAgent(agent);
      }
      unit.soldierAI?.syncMeshes?.();
    }
  }

  captureState() {
    return {
      version: 1,
      orderSequence: this.orderSequence,
      orders: [...this.orders.values()]
        .sort((left, right) => compareId(left.unitId, right.unitId))
        .map(clone)
    };
  }

  restoreState(state) {
    this.orderSequence = Math.max(0, Number(state?.orderSequence) || 0);
    this.orders = new Map(
      (state?.orders ?? []).map(order => [String(order.unitId), clone(order)])
    );
  }

  #advanceAgent(agent, location, delta) {
    const buildingId = location.buildingId;
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    if (location.phase === 'approaching') {
      const approach = this.getEntryApproachPosition(buildingId);
      if (distanceXZ(agent, approach) > APPROACH_DISTANCE_METERS) return;
      const portal = entryPortal(descriptor);
      const started = this.buildingSystem.startTransit(buildingId, {
        unitId: location.unitId,
        soldierId: location.soldierId,
        soldierKey: location.soldierKey,
        portalId: portal.id,
        fromNodeId: 'outside',
        toNodeId: location.entrySlotId
      });
      if (!started.accepted) return;
      agent.buildingLocation = { ...started.location, ...this.#routeFields(location) };
      syncAgent(agent);
      return;
    }
    if (location.phase === 'exit-waiting') {
      this.#tryStartStairExit(agent, buildingId, descriptor);
      return;
    }
    if (location.phase === 'transit' || location.phase === 'exiting') {
      const before = clone(location);
      const result = this.buildingSystem.advanceTransit(buildingId, location, delta);
      agent.buildingLocation = { ...result.location, ...this.#routeFields(location) };
      this.#positionDuringTransit(agent, buildingId, descriptor, before, result.location);
      if (!result.complete) {
        syncAgent(agent);
        return;
      }
      if (result.interrupted) {
        agent.buildingLocation = null;
        syncAgent(agent);
        return;
      }
      if (location.action === 'ENTER'
          && isUpperFloor(descriptor, location.targetFloorId)
          && location.routeStage === 'door') {
        this.#startStairEntry(agent, buildingId, descriptor);
        return;
      }
      if (location.action === 'EXIT' && location.routeStage === 'stairs') {
        this.#startDoorExit(agent, buildingId, descriptor);
        return;
      }
      if (result.location.phase === 'outside') {
        agent.buildingLocation = null;
        agent.state = 'OBSERVING';
        agent.stance = 'STANDING';
        syncAgent(agent);
        return;
      }
      this.#setOccupiedPose(agent);
      return;
    }
    if (location.phase === 'occupied') this.#setOccupiedPose(agent);
  }

  #startStairEntry(agent, buildingId, descriptor) {
    const location = agent.buildingLocation;
    const reservation = this.buildingSystem.resolveReservations(buildingId, [{
      nodeId: location.targetSlotId,
      orderSequence: this.orderSequence,
      unitId: location.unitId,
      soldierId: location.soldierId,
      soldierKey: location.soldierKey
    }])[0];
    const stair = descriptor.portals.find(portal => portal.kind === 'stair');
    if (!reservation?.accepted || !stair) {
      this.#setOccupiedPose(agent);
      return;
    }
    const started = this.buildingSystem.startTransit(buildingId, {
      unitId: location.unitId,
      soldierId: location.soldierId,
      soldierKey: location.soldierKey,
      portalId: stair.id,
      fromNodeId: location.entrySlotId,
      toNodeId: location.targetSlotId
    });
    if (!started.accepted) {
      this.#setOccupiedPose(agent);
      return;
    }
    agent.buildingLocation = {
      ...started.location,
      ...this.#routeFields(location),
      routeStage: 'stairs'
    };
    syncAgent(agent);
  }

  #tryStartStairExit(agent, buildingId, descriptor) {
    const location = agent.buildingLocation;
    const stair = descriptor.portals.find(portal => portal.kind === 'stair');
    for (const nodeId of location.exitGroundSlots ?? []) {
      const reservation = this.buildingSystem.resolveReservations(buildingId, [{
        nodeId,
        orderSequence: this.orderSequence,
        unitId: location.unitId,
        soldierId: location.soldierId,
        soldierKey: location.soldierKey
      }])[0];
      if (!reservation?.accepted) continue;
      const started = this.buildingSystem.startTransit(buildingId, {
        unitId: location.unitId,
        soldierId: location.soldierId,
        soldierKey: location.soldierKey,
        portalId: stair.id,
        fromNodeId: location.nodeId,
        toNodeId: nodeId
      });
      if (!started.accepted) continue;
      agent.buildingLocation = {
        ...started.location,
        ...this.#routeFields(location),
        routeStage: 'stairs',
        entrySlotId: nodeId
      };
      syncAgent(agent);
      return;
    }
  }

  #startDoorExit(agent, buildingId, descriptor) {
    const location = agent.buildingLocation;
    const portal = entryPortal(descriptor);
    const started = this.buildingSystem.startTransit(buildingId, {
      unitId: location.unitId,
      soldierId: location.soldierId,
      soldierKey: location.soldierKey,
      portalId: portal.id,
      fromNodeId: location.nodeId,
      toNodeId: 'outside'
    });
    if (!started.accepted) return false;
    agent.buildingLocation = {
      ...started.location,
      ...this.#routeFields(location),
      action: 'EXIT',
      routeStage: 'door'
    };
    syncAgent(agent);
    return true;
  }

  #setOccupiedPose(agent) {
    const location = agent.buildingLocation;
    if (!location?.buildingId || location.phase !== 'occupied') return;
    const descriptor = this.buildingSystem.getDescriptorForBuilding(location.buildingId);
    setPosition(agent, this.#slotWorldPosition(location.buildingId, descriptor, location.nodeId));
    const port = this.getFirePort(agent);
    location.firePortId = port?.id ?? null;
    agent.velocity?.set?.(0, 0, 0);
    if (agent.velocity && typeof agent.velocity.set !== 'function') {
      agent.velocity.x = 0;
      agent.velocity.y = 0;
      agent.velocity.z = 0;
    }
    agent.state = 'OBSERVING';
    agent.stance = port ? 'KNEELING' : 'CROUCHED';
    if (port) agent.facing = Math.atan2(port.worldNormal[0], port.worldNormal[2]);
    syncAgent(agent);
  }

  #positionDuringTransit(agent, buildingId, descriptor, before, after) {
    const portal = portalIndex(descriptor).get(before.portalId);
    const duration = portal?.transitSeconds ?? 1;
    const stillInTransit = after.phase === 'transit' || after.phase === 'exiting';
    const progress = stillInTransit
      ? Math.min(1, (after.transitElapsed ?? 0) / duration)
      : 1;
    const from = this.#nodeWorldPosition(buildingId, descriptor, before.fromNodeId);
    const to = this.#nodeWorldPosition(buildingId, descriptor, before.toNodeId);
    setPosition(agent, lerpPosition(from, to, progress));
    agent.velocity?.set?.(0, 0, 0);
    agent.state = before.routeStage === 'stairs' ? 'MOVING' : 'MOVING';
    agent.stance = 'STANDING';
  }

  #nodeWorldPosition(buildingId, descriptor, nodeId) {
    if (nodeId === 'outside') return this.getEntryApproachPosition(buildingId);
    return this.#slotWorldPosition(buildingId, descriptor, nodeId);
  }

  #slotWorldPosition(buildingId, descriptor, nodeId) {
    const state = this.buildingSystem.getBuildingSnapshot(buildingId);
    const slot = slotIndex(descriptor).get(nodeId);
    return slot
      ? localToWorldPoint(slot.localPosition, state.transform)
      : [...state.transform.position];
  }

  #routeFields(location) {
    return {
      action: location.action,
      routeStage: location.routeStage,
      targetFloorId: location.targetFloorId ?? null,
      targetSlotId: location.targetSlotId ?? null,
      entrySlotId: location.entrySlotId ?? null,
      exitGroundSlots: location.exitGroundSlots ? [...location.exitGroundSlots] : null
    };
  }
}
