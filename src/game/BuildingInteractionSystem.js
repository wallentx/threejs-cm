import {
  localToWorldPoint,
  worldToLocalPoint
} from '../simulation/buildings/index.js';
import {
  createRoomSlotIndex,
  getInvalidSupportSlotIds,
  isBuildingSlotInvalid,
  isSupportSlot
} from '../simulation/buildings/BuildingOccupancy.js';
import {
  OBSERVATION_EQUIPMENT,
  observerHasEquipment
} from '../simulation/observation/ObservationEquipment.js';

const APPROACH_DISTANCE_METERS = 3.25;
// Keep the entire four-man entry element outside the ground shell regardless
// of its incoming formation rotation. Door transit then owns the intentional
// crossing instead of ordinary formation movement steering one soldier into
// a facade corner.
const OUTSIDE_STANDOFF_METERS = 2.25;
const EPSILON = 1e-9;
const INTERIOR_PRESENCE_PHASES = new Set([
  'transit',
  'exiting',
  'exit-waiting',
  'occupied'
]);
const ESCAPE_OVERSHOOT_METERS = 0.82;
const APPROACH_EXTRACTION_EPSILON = 1e-4;

function compareId(left, right) {
  return String(left).localeCompare(String(right));
}

function stableLaneIndex(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 5 - 2;
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

function unavailableAgent(agent) {
  const health = Number(agent?.health);
  return agent?.isAlive === false
    || (Number.isFinite(health) && health <= 0)
    || ['KIA', 'INCAPACITATED', 'DEAD'].includes(agent?.status);
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

function distance2D(left, right) {
  return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

function segmentCrossesOpenBounds(start, end, bounds) {
  const interior = {
    minX: bounds.minX + EPSILON,
    maxX: bounds.maxX - EPSILON,
    minZ: bounds.minZ + EPSILON,
    maxZ: bounds.maxZ - EPSILON
  };
  let near = 0;
  let far = 1;
  for (const [origin, delta, minimum, maximum] of [
    [start[0], end[0] - start[0], interior.minX, interior.maxX],
    [start[1], end[1] - start[1], interior.minZ, interior.maxZ]
  ]) {
    if (Math.abs(delta) <= EPSILON) {
      if (origin <= minimum || origin >= maximum) return false;
      continue;
    }
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near >= far - EPSILON) return false;
  }
  return far > EPSILON && near < 1 - EPSILON;
}

function shortestRouteAroundBounds(start, target, bounds) {
  const nodes = [
    { id: 'start', point: start },
    { id: 'corner:left-front', point: [bounds.minX, bounds.maxZ] },
    { id: 'corner:left-rear', point: [bounds.minX, bounds.minZ] },
    { id: 'corner:right-front', point: [bounds.maxX, bounds.maxZ] },
    { id: 'corner:right-rear', point: [bounds.maxX, bounds.minZ] },
    { id: 'target', point: target }
  ];
  const startIndex = 0;
  const targetIndex = nodes.length - 1;
  const distances = Array(nodes.length).fill(Infinity);
  const pathKeys = Array(nodes.length).fill(null);
  const previous = Array(nodes.length).fill(-1);
  const visited = new Set();
  distances[startIndex] = 0;
  pathKeys[startIndex] = 'start';

  while (visited.size < nodes.length) {
    let current = -1;
    for (let index = 0; index < nodes.length; index++) {
      if (visited.has(index) || !Number.isFinite(distances[index])) continue;
      if (current < 0
          || distances[index] < distances[current] - EPSILON
          || (Math.abs(distances[index] - distances[current]) <= EPSILON
            && pathKeys[index] < pathKeys[current])) current = index;
    }
    if (current < 0 || current === targetIndex) break;
    visited.add(current);
    const neighbors = nodes
      .map((node, index) => ({ node, index }))
      .filter(({ index }) => index !== current && !visited.has(index))
      .sort((left, right) => compareId(left.node.id, right.node.id));
    for (const neighbor of neighbors) {
      if (segmentCrossesOpenBounds(
        nodes[current].point,
        neighbor.node.point,
        bounds
      )) continue;
      const candidateDistance = distances[current]
        + distance2D(nodes[current].point, neighbor.node.point);
      const candidateKey = `${pathKeys[current]}>${neighbor.node.id}`;
      if (candidateDistance < distances[neighbor.index] - EPSILON
          || (Math.abs(candidateDistance - distances[neighbor.index]) <= EPSILON
            && (pathKeys[neighbor.index] == null || candidateKey < pathKeys[neighbor.index]))) {
        distances[neighbor.index] = candidateDistance;
        pathKeys[neighbor.index] = candidateKey;
        previous[neighbor.index] = current;
      }
    }
  }

  if (!Number.isFinite(distances[targetIndex])) return [target];
  const route = [];
  for (let index = targetIndex; index !== startIndex && index >= 0; index = previous[index]) {
    route.push(nodes[index].point);
  }
  return route.reverse();
}

function pointInsideOpenBounds(point, bounds) {
  return point[0] > bounds.minX + EPSILON
    && point[0] < bounds.maxX - EPSILON
    && point[1] > bounds.minZ + EPSILON
    && point[1] < bounds.maxZ - EPSILON;
}

function nearestBoundsEscape(point, bounds) {
  return [
    {
      id: 'escape:left',
      distance: Math.abs(point[0] - bounds.minX),
      point: [bounds.minX - ESCAPE_OVERSHOOT_METERS, point[1]]
    },
    {
      id: 'escape:right',
      distance: Math.abs(bounds.maxX - point[0]),
      point: [bounds.maxX + ESCAPE_OVERSHOOT_METERS, point[1]]
    },
    {
      id: 'escape:rear',
      distance: Math.abs(point[1] - bounds.minZ),
      point: [point[0], bounds.minZ - ESCAPE_OVERSHOOT_METERS]
    },
    {
      id: 'escape:front',
      distance: Math.abs(bounds.maxZ - point[1]),
      point: [point[0], bounds.maxZ + ESCAPE_OVERSHOOT_METERS]
    }
  ].sort((left, right) =>
    left.distance - right.distance || compareId(left.id, right.id))[0].point;
}

function nearestFootprintFace(point, descriptorBounds) {
  return [
    {
      id: 'left',
      distance: Math.abs(point[0] - descriptorBounds.min[0])
    },
    {
      id: 'right',
      distance: Math.abs(descriptorBounds.max[0] - point[0])
    },
    {
      id: 'rear',
      distance: Math.abs(point[1] - descriptorBounds.min[2])
    },
    {
      id: 'front',
      distance: Math.abs(descriptorBounds.max[2] - point[1])
    }
  ].sort((left, right) =>
    left.distance - right.distance || compareId(left.id, right.id))[0].id;
}

function roomsOnFloor(descriptor, floorId) {
  const rooms = new Set(
    descriptor.floors.find(floor => floor.id === floorId)?.rooms ?? []
  );
  return descriptor.rooms.filter(room => rooms.has(room.id));
}

function slotsOnFloor(descriptor, floorId, index = createRoomSlotIndex(descriptor)) {
  const slots = [...index.values()].filter(slot => slot.floorId === floorId);
  return slots.sort((left, right) => {
    const leftSupport = isSupportSlot(left);
    const rightSupport = isSupportSlot(right);
    if (leftSupport !== rightSupport) return Number(leftSupport) - Number(rightSupport);
    if (Boolean(left.isGeneratedSupport) !== Boolean(right.isGeneratedSupport)) {
      return Number(Boolean(left.isGeneratedSupport))
        - Number(Boolean(right.isGeneratedSupport));
    }
    return compareId(left.id, right.id);
  });
}

function pendingTargetClaims(units, buildingId) {
  const claims = [];
  for (const unit of [...(units ?? [])]
    .sort((left, right) => compareId(left.id, right.id))) {
    for (const agent of [...(unit?.soldierAI?.agents ?? [])]
      .sort((left, right) => compareId(left.id, right.id))) {
      const location = agent?.buildingLocation;
      if (!location?.targetSlotId
          || location.phase === 'outside'
          || String(location.buildingId) !== String(buildingId)) continue;
      claims.push({
        targetSlotId: String(location.targetSlotId),
        unitId: String(location.unitId ?? unit.id),
        soldierId: String(location.soldierId ?? agent.id)
      });
    }
  }
  return claims.sort((left, right) =>
    compareId(left.targetSlotId, right.targetSlotId)
      || compareId(left.unitId, right.unitId)
      || compareId(left.soldierId, right.soldierId));
}

function claimableSlots(
  descriptor,
  slots,
  state,
  claimedTargetSlotIds = new Set()
) {
  const invalid = new Set((state.invalidSlots ?? []).map(String));
  const occupied = new Set(Object.keys(state.occupancy ?? {}));
  const reserved = new Set(Object.keys(state.reservations ?? {}));
  return slots.filter(slot => !invalid.has(String(slot.id))
    && !isBuildingSlotInvalid(descriptor, state, slot)
    && !occupied.has(String(slot.id))
    && !reserved.has(String(slot.id))
    && !claimedTargetSlotIds.has(String(slot.id)));
}

function firePortTargetCosine(port, target) {
  const directionX = target[0] - port.worldPosition[0];
  const directionZ = target[2] - port.worldPosition[2];
  const directionLength = Math.hypot(directionX, directionZ);
  const normalLength = Math.hypot(port.worldNormal[0], port.worldNormal[2]);
  if (directionLength <= EPSILON || normalLength <= EPSILON) return -1;
  return (directionX * port.worldNormal[0] + directionZ * port.worldNormal[2])
    / (directionLength * normalLength);
}

function portalIndex(descriptor) {
  return new Map(descriptor.portals.map(portal => [portal.id, portal]));
}

function entryPortal(descriptor, portalId = null) {
  const exteriorDoors = descriptor.portals.filter(portal => portal.kind === 'door'
    && (portal.from === 'outside' || portal.to === 'outside'));
  if (portalId != null) {
    return exteriorDoors.find(portal =>
      String(portal.id) === String(portalId)) ?? null;
  }
  return exteriorDoors[0] ?? null;
}

function validEntryPortals(descriptor, roomId, invalidPortalIds = []) {
  const invalid = new Set(invalidPortalIds.map(String));
  return descriptor.portals
    .filter(portal => portal.kind === 'door'
      && ((portal.from === 'outside' && portal.to === roomId)
        || (portal.to === 'outside' && portal.from === roomId))
      && !invalid.has(String(portal.id)))
    .sort((left, right) => compareId(left.id, right.id));
}

function routeDistanceXZ(worldStart, route) {
  const start = Array.isArray(worldStart)
    ? worldStart
    : [worldStart?.x ?? 0, worldStart?.y ?? 0, worldStart?.z ?? 0];
  let previous = start;
  let distance = 0;
  for (const point of route) {
    distance += Math.hypot(point[0] - previous[0], point[2] - previous[2]);
    previous = point;
  }
  return distance;
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
    this.faceBiases = new Map();
    this.managedDoorOpenings = new Map();
    this.slotIndexes = new WeakMap();
    this.supportInvalidationKeys = new Map();
  }

  findBuildingAt(worldPosition, paddingMeters = 1.5) {
    const point = Array.isArray(worldPosition)
      ? worldPosition
      : [worldPosition?.x ?? 0, worldPosition?.y ?? 0, worldPosition?.z ?? 0];
    const ids = this.buildingSystem.getBuildingIds().sort(compareId);
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

  getEntryApproachPosition(buildingId, portalId = null) {
    const state = this.buildingSystem.getBuildingSnapshot(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    const portal = entryPortal(descriptor, portalId);
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

  getEntryApproachRoute(buildingId, worldStart, portalId = null) {
    const state = this.buildingSystem.getBuildingSnapshot(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    const startWorld = Array.isArray(worldStart)
      ? worldStart
      : [worldStart?.x ?? 0, worldStart?.y ?? 0, worldStart?.z ?? 0];
    const targetWorld = this.getEntryApproachPosition(buildingId, portalId);
    const startLocal = worldToLocalPoint(startWorld, state.transform);
    const targetLocal = worldToLocalPoint(targetWorld, state.transform);
    const bounds = {
      minX: descriptor.bounds.min[0] - OUTSIDE_STANDOFF_METERS,
      maxX: descriptor.bounds.max[0] + OUTSIDE_STANDOFF_METERS,
      minZ: descriptor.bounds.min[2] - OUTSIDE_STANDOFF_METERS,
      maxZ: descriptor.bounds.max[2] + OUTSIDE_STANDOFF_METERS
    };
    const start2D = [startLocal[0], startLocal[2]];
    const routeStart = pointInsideOpenBounds(start2D, bounds)
      ? nearestBoundsEscape(start2D, bounds)
      : start2D;
    const route = shortestRouteAroundBounds(
      routeStart,
      [targetLocal[0], targetLocal[2]],
      bounds
    );
    if (routeStart !== start2D) route.unshift(routeStart);
    return route.map(([x, z]) => localToWorldPoint(
      [x, targetLocal[1], z],
      state.transform
    ));
  }

  issueEnter(unit, buildingId, floorId = null) {
    if (unit?.type !== 'infantry_squad') {
      return { accepted: false, reason: 'infantry_only', assigned: [] };
    }
    if (this.orders.get(String(unit.id))?.action === 'ENTER') {
      return { accepted: false, reason: 'enter_in_progress', assigned: [] };
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

    const claimedTargetSlotIds = new Set(
      pendingTargetClaims(this.getUnits(), buildingId)
        .map(claim => claim.targetSlotId)
    );
    const slots = this.#slotIndex(descriptor);
    const finalSlots = claimableSlots(
      descriptor,
      slotsOnFloor(descriptor, resolvedFloorId, slots),
      state,
      claimedTargetSlotIds
    );
    const entryFloorId = lowerFloorId(descriptor);
    const entrySlots = resolvedFloorId === entryFloorId
      ? finalSlots
      : claimableSlots(
        descriptor,
        slotsOnFloor(descriptor, entryFloorId, slots),
        state,
        claimedTargetSlotIds
      );
    if (finalSlots.length === 0 || entrySlots.length === 0) {
      return { accepted: false, reason: 'no_free_slots', assigned: [] };
    }
    const roomFloorIds = new Map(descriptor.rooms.map(room => [
      String(room.id),
      String(room.floorId)
    ]));
    const entrySlotIds = new Set(entrySlots.map(slot => String(slot.id)));
    const usedEntrySlotIds = new Set();
    const invalidPortalIds = new Set((state.invalidPortals ?? []).map(String));
    const exteriorEntriesByRoom = new Map();
    const exteriorEntriesForRoom = roomId => {
      const key = String(roomId);
      if (!exteriorEntriesByRoom.has(key)) {
        const entries = validEntryPortals(
          descriptor,
          key,
          state.invalidPortals
        ).map(portal => {
          const approachRoute = this.getEntryApproachRoute(
            buildingId,
            unit.position,
            portal.id
          );
          return {
            entryPortalId: String(portal.id),
            approachRoute,
            approachPosition: this.getEntryApproachPosition(
              buildingId,
              portal.id
            ),
            distance: routeDistanceXZ(unit.position, approachRoute)
          };
        }).sort((left, right) => {
          if (left.distance < right.distance - EPSILON) return -1;
          if (left.distance > right.distance + EPSILON) return 1;
          return compareId(left.entryPortalId, right.entryPortalId);
        });
        exteriorEntriesByRoom.set(key, entries);
      }
      return exteriorEntriesByRoom.get(key);
    };
    const entryPlans = [];
    for (const finalSlot of finalSlots) {
      const finalRoomId = String(finalSlot.roomId);
      const roomRoutes = [];
      if (String(resolvedFloorId) === String(entryFloorId)) {
        if (entrySlotIds.has(String(finalSlot.id))) {
          roomRoutes.push({
            entryRoomId: finalRoomId,
            entrySlot: finalSlot,
            stairPortalId: null
          });
        }
      } else {
        for (const stair of [...descriptor.portals]
          .filter(portal => portal.kind === 'stair'
            && !invalidPortalIds.has(String(portal.id)))
          .sort((left, right) => compareId(left.id, right.id))) {
          let entryRoomId = null;
          if (String(stair.from) === finalRoomId) {
            entryRoomId = String(stair.to);
          } else if (String(stair.to) === finalRoomId) {
            entryRoomId = String(stair.from);
          }
          if (!entryRoomId
              || roomFloorIds.get(entryRoomId) !== String(entryFloorId)) {
            continue;
          }
          const entrySlot = entrySlots.find(slot =>
            String(slot.roomId) === entryRoomId
              && !usedEntrySlotIds.has(String(slot.id)));
          if (entrySlot) {
            roomRoutes.push({
              entryRoomId,
              entrySlot,
              stairPortalId: String(stair.id)
            });
          }
        }
      }

      const candidates = [];
      for (const roomRoute of roomRoutes) {
        if (usedEntrySlotIds.has(String(roomRoute.entrySlot.id))) continue;
        for (const exteriorEntry of exteriorEntriesForRoom(
          roomRoute.entryRoomId
        )) {
          candidates.push({
            ...roomRoute,
            ...exteriorEntry,
            finalSlot
          });
        }
      }
      candidates.sort((left, right) => {
        if (left.distance < right.distance - EPSILON) return -1;
        if (left.distance > right.distance + EPSILON) return 1;
        return compareId(left.entryPortalId, right.entryPortalId)
          || compareId(left.stairPortalId ?? '', right.stairPortalId ?? '')
          || compareId(left.entrySlot.id, right.entrySlot.id);
      });
      const selected = candidates[0];
      if (!selected) continue;
      usedEntrySlotIds.add(String(selected.entrySlot.id));
      entryPlans.push(selected);
    }
    const plans = entryPlans.slice(0, agents.length);
    if (plans.length === 0) {
      return { accepted: false, reason: 'no_valid_entry_portal', assigned: [] };
    }
    const sequence = ++this.orderSequence;
    const requests = [];
    for (let index = 0; index < plans.length; index++) {
      requests.push({
        nodeId: plans[index].entrySlot.id,
        orderSequence: sequence,
        unitId: unit.id,
        soldierId: agents[index].id,
        soldierKey: soldierKey(unit.id, agents[index].id)
      });
    }
    const results = this.buildingSystem.resolveReservations(buildingId, requests);
    const resultByKey = new Map(results.map(result => [result.soldierKey, result]));
    const assigned = [];
    const acceptedPlans = [];
    for (let index = 0; index < plans.length; index++) {
      const agent = agents[index];
      const plan = plans[index];
      const key = soldierKey(unit.id, agent.id);
      if (!resultByKey.get(key)?.accepted) continue;
      agent.buildingLocation = {
        buildingId: String(buildingId),
        phase: 'approaching',
        nodeId: 'outside',
        fromNodeId: null,
        toNodeId: plan.entrySlot.id,
        portalId: null,
        transitElapsed: 0,
        reservedNodeId: plan.entrySlot.id,
        firePortId: null,
        soldierKey: key,
        unitId: String(unit.id),
        soldierId: String(agent.id),
        action: 'ENTER',
        routeStage: 'door',
        entryPortalId: plan.entryPortalId,
        stairPortalId: plan.stairPortalId,
        targetFloorId: resolvedFloorId,
        targetSlotId: plan.finalSlot.id,
        entrySlotId: plan.entrySlot.id,
        approachPosition: [...plan.approachPosition],
        approachRoute: plan.approachRoute.map(point => [...point]),
        approachRouteIndex: 0,
        approachGoal: [...(plan.approachRoute[0] ?? plan.approachPosition)]
      };
      syncAgent(agent);
      assigned.push(key);
      acceptedPlans.push({ ...plan, soldierKey: key });
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
    const pendingEntries = new Map();
    for (const plan of acceptedPlans) {
      if (!pendingEntries.has(plan.entryPortalId)) {
        pendingEntries.set(plan.entryPortalId, plan);
      }
    }
    const orderedEntries = [];
    let routeStart = unit.position;
    while (pendingEntries.size > 0) {
      const candidates = [...pendingEntries.values()].map(plan => {
        const approachRoute = this.getEntryApproachRoute(
          buildingId,
          routeStart,
          plan.entryPortalId
        );
        return {
          ...plan,
          approachRoute,
          distance: routeDistanceXZ(routeStart, approachRoute)
        };
      }).sort((left, right) => {
        if (left.distance < right.distance - EPSILON) return -1;
        if (left.distance > right.distance + EPSILON) return 1;
        return compareId(left.entryPortalId, right.entryPortalId);
      });
      const selected = candidates[0];
      orderedEntries.push(selected);
      pendingEntries.delete(selected.entryPortalId);
      routeStart = selected.approachPosition;
    }
    const approachRoute = orderedEntries.flatMap(entry => entry.approachRoute);
    const firstEntry = orderedEntries[0];
    const finalEntry = orderedEntries.at(-1);
    this.#recoverApproachOverlaps(
      unit,
      buildingId,
      assigned,
      firstEntry.entryPortalId
    );
    return {
      accepted: true,
      reason: null,
      assigned,
      unassigned: agents.length - assigned.length,
      entryPortalId: firstEntry.entryPortalId,
      entryPortalIds: orderedEntries.map(entry => entry.entryPortalId),
      approachPosition: finalEntry.approachPosition,
      approachRoute,
      approachAssignments: acceptedPlans.map(plan => ({
        soldierKey: plan.soldierKey,
        entryPortalId: plan.entryPortalId,
        stairPortalId: plan.stairPortalId,
        entrySlotId: plan.entrySlot.id,
        targetSlotId: plan.finalSlot.id,
        approachPosition: [...plan.approachPosition],
        approachRoute: plan.approachRoute.map(point => [...point])
      })),
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
    const assignments = [];

    // Ground-floor occupants start through the door first. Their released
    // slots then become deterministic landing slots for upstairs occupants.
    for (const agent of agents) {
      const location = agent.buildingLocation;
      const buildingId = String(location.buildingId);
      const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
      const groundSlots = slotsOnFloor(descriptor, lowerFloorId(descriptor));
      const slot = this.#slotIndex(descriptor).get(location.nodeId);
      const slotFloorId = descriptor.rooms
        .find(room => room.id === slot?.roomId)?.floorId ?? null;
      const key = String(location.soldierKey ?? soldierKey(unit.id, agent.id));
      assignments.push({
        soldierKey: key,
        soldierId: String(agent.id),
        buildingId,
        floorId: slotFloorId,
        slotId: location.nodeId ?? null,
        entryPortalId: location.entryPortalId ?? null
      });
      if (location.phase === 'approaching') {
        this.buildingSystem.releaseSoldier(buildingId, key);
        agent.buildingLocation = null;
        agent.state = 'OBSERVING';
        agent.stance = 'STANDING';
        syncAgent(agent);
        continue;
      }
      if (location.action === 'ENTER'
          && (location.phase === 'transit' || location.phase === 'exiting')) {
        this.#ejectOutside(agent, buildingId, descriptor);
        continue;
      }
      if (location.action === 'EXIT'
          && ['transit', 'exiting', 'exit-waiting'].includes(location.phase)) {
        continue;
      }
      location.action = 'EXIT';
      location.targetFloorId = null;
      location.targetSlotId = null;
      if (!isUpperFloor(descriptor, slotFloorId)) {
        if (!this.#startDoorExit(agent, buildingId, descriptor)) {
          this.#ejectOutside(agent, buildingId, descriptor);
        }
      } else {
        location.phase = 'exit-waiting';
        location.routeStage = 'stairs';
        location.exitGroundSlots = groundSlots.map(candidate => candidate.id);
        syncAgent(agent);
      }
    }
    // ENTER owns the approach path. EXIT supersedes that order as well as any
    // portal/occupancy state, so a cancelled squad cannot keep walking into
    // the now-blocking facade.
    unit.clearWaypoints?.();
    this.orders.set(String(unit.id), {
      unitId: String(unit.id),
      action: 'EXIT',
      floorId: null,
      sequence,
      assignments: assignments.map(clone)
    });
    const assigned = assignments.map(assignment => assignment.soldierKey);
    this.faceBiases.delete(String(unit.id));
    return { accepted: true, reason: null, assigned };
  }

  advance(deltaSeconds) {
    const delta = Math.max(0, Number(deltaSeconds) || 0);
    const knownUnits = [...(this.getUnits() ?? [])]
      .sort((left, right) => compareId(left.id, right.id));
    this.#reconcileInvalidSupportLocations(knownUnits);
    this.#cleanupUnavailableOccupants(knownUnits);
    this.#advanceOccupiedFacing(knownUnits);
    const units = new Map(knownUnits.map(unit => [String(unit.id), unit]));
    for (const order of [...this.orders.values()]
      .sort((left, right) => left.sequence - right.sequence || compareId(left.unitId, right.unitId))) {
      const unit = units.get(order.unitId);
      if (!unit) {
        this.orders.delete(order.unitId);
        continue;
      }
      const agentsByKey = new Map(
        (unit.soldierAI?.agents ?? []).map(agent => [
          soldierKey(unit.id, agent.id),
          agent
        ])
      );
      const assignments = this.#orderAssignments(order);
      for (const assignment of assignments) {
        const agent = agentsByKey.get(assignment.soldierKey);
        const location = agent?.buildingLocation;
        if (!location
            || String(location.buildingId) !== assignment.buildingId) continue;
        this.#advanceAgent(agent, location, delta);
      }
      const pending = assignments.some(assignment => {
        const agent = agentsByKey.get(assignment.soldierKey);
        const location = agent?.buildingLocation;
        if (!location
            || String(location.buildingId) !== assignment.buildingId) return false;
        if (order.action === 'ENTER') return !['occupied', 'outside'].includes(location.phase);
        return location.phase !== 'outside';
      });
      if (!pending) this.orders.delete(order.unitId);
      unit.soldierAI?.syncMeshes?.();
    }
    this.#synchronizeDoorOpenings(knownUnits);
  }

  issueFace(unit, targetPosition) {
    const result = this.#reassignOccupiedForDirection(unit, targetPosition);
    if (!result.accepted) return result;
    const target = Array.isArray(targetPosition)
      ? targetPosition
      : [targetPosition?.x ?? 0, targetPosition?.y ?? 0, targetPosition?.z ?? 0];
    this.faceBiases.set(String(unit.id), {
      unitId: String(unit.id),
      buildingId: result.buildingId,
      floorId: result.floorId,
      target: target.map(value => Number(value) || 0)
    });
    return result;
  }

  #reassignOccupiedForDirection(unit, targetPosition) {
    if (unit?.type !== 'infantry_squad') return { handled: false };
    const occupied = livingAgents(unit).filter(agent =>
      agent.buildingLocation?.phase === 'occupied');
    if (occupied.length === 0) return { handled: false };

    const locations = occupied.map(agent => agent.buildingLocation);
    const buildingIds = new Set(locations.map(location => String(location.buildingId)));
    if (buildingIds.size !== 1) {
      return { handled: true, accepted: false, reason: 'split_building_occupancy' };
    }
    const buildingId = [...buildingIds][0];
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    const slots = this.#slotIndex(descriptor);
    const floorIds = new Set(locations.map(location =>
      slots.get(location.nodeId)?.floorId ?? null));
    if (floorIds.size !== 1 || floorIds.has(null)) {
      return { handled: true, accepted: false, reason: 'split_floor_occupancy' };
    }

    const target = Array.isArray(targetPosition)
      ? targetPosition
      : [targetPosition?.x ?? 0, targetPosition?.y ?? 0, targetPosition?.z ?? 0];
    const floorId = [...floorIds][0];
    const state = this.buildingSystem.getBuildingSnapshot(buildingId);
    const movingSoldierKeys = new Set(locations.map(location =>
      String(location.soldierKey)));
    const candidateSlots = slotsOnFloor(descriptor, floorId, slots)
      .filter(slot => {
        const slotId = String(slot.id);
        if (isBuildingSlotInvalid(descriptor, state, slot)
            || state.reservations[slotId]) {
          return false;
        }
        const occupant = state.occupancy[slotId];
        return !occupant || movingSoldierKeys.has(String(occupant.soldierKey));
      });
    if (candidateSlots.length < occupied.length) {
      return { handled: true, accepted: false, reason: 'insufficient_floor_positions' };
    }
    const portsBySlot = new Map(
      this.buildingSystem.getFirePorts(buildingId)
        .filter(port => port.enabled)
        .map(port => [String(port.approachSlotId), port])
    );
    const rankedSlots = candidateSlots
      .map(slot => {
        const slotId = String(slot.id);
        const port = portsBySlot.get(slotId) ?? null;
        const score = port ? firePortTargetCosine(port, target) : -2;
        const requiredCosine = port
          ? Math.cos((port.horizontalArcDeg * Math.PI / 180) * 0.5)
          : 2;
        return {
          slotId,
          port,
          score,
          preferred: Boolean(port && score + EPSILON >= requiredCosine)
        };
      })
      .sort((left, right) => {
        const preferenceOrder = Number(right.preferred) - Number(left.preferred);
        if (preferenceOrder !== 0) return preferenceOrder;
        if (left.preferred && right.preferred) {
          return compareId(left.slotId, right.slotId);
        }
        return right.score - left.score || compareId(left.slotId, right.slotId);
      });
    const bestPort = rankedSlots[0]?.port;
    if (!bestPort) {
      return { handled: true, accepted: false, reason: 'no_window_position' };
    }
    if (!rankedSlots[0].preferred) {
      return { handled: true, accepted: false, reason: 'no_window_facing_target' };
    }

    const rankedAgents = [...occupied].sort((left, right) => {
      const leftBinoculars = observerHasEquipment(
        unit,
        left.record ?? left,
        OBSERVATION_EQUIPMENT.BINOCULARS
      );
      const rightBinoculars = observerHasEquipment(
        unit,
        right.record ?? right,
        OBSERVATION_EQUIPMENT.BINOCULARS
      );
      return Number(rightBinoculars) - Number(leftBinoculars)
        || compareId(left.id, right.id);
    });
    const assignments = rankedAgents.map((agent, index) => ({
      soldierKey: agent.buildingLocation.soldierKey,
      fromSlotId: agent.buildingLocation.nodeId,
      toSlotId: rankedSlots[index].slotId
    }));
    const changed = assignments.some(assignment =>
      String(assignment.fromSlotId) !== String(assignment.toSlotId));
    const result = changed
      ? this.buildingSystem.reassignOccupiedSlots(buildingId, assignments)
      : { accepted: true, reason: null, assignments };
    if (!result.accepted) return { handled: true, ...result };

    if (changed) {
      for (let index = 0; index < rankedAgents.length; index++) {
        const agent = rankedAgents[index];
        agent.buildingLocation = {
          ...agent.buildingLocation,
          nodeId: rankedSlots[index].slotId,
          firePortId: null
        };
        this.#setOccupiedPose(agent);
      }
      unit.soldierAI?.syncMeshes?.();
    }
    return {
      handled: true,
      accepted: true,
      reason: null,
      buildingId,
      floorId,
      observerSoldierKey: rankedAgents[0].buildingLocation.soldierKey,
      firePortId: rankedAgents[0].buildingLocation.firePortId,
      preferredSlotIds: rankedSlots
        .filter(slot => slot.preferred)
        .map(slot => slot.slotId),
      assignments: result.assignments
    };
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

  getInteriorPresenceCount(buildingId) {
    return this.getInteriorPresenceCounts()[String(buildingId)] ?? 0;
  }

  getInteriorPresenceCounts(unitIds = null) {
    const counts = {};
    const includedUnitIds = unitIds == null
      ? null
      : new Set([...unitIds].map(id => String(id)));
    const units = [...(this.getUnits() ?? [])]
      .sort((left, right) => compareId(left.id, right.id));
    for (const unit of units) {
      if (includedUnitIds && !includedUnitIds.has(String(unit.id))) continue;
      for (const agent of livingAgents(unit)) {
        const location = agent.buildingLocation;
        if (!location?.buildingId || !INTERIOR_PRESENCE_PHASES.has(location.phase)) continue;
        const buildingId = String(location.buildingId);
        counts[buildingId] = (counts[buildingId] ?? 0) + 1;
      }
    }
    return counts;
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
        const buildingId = agent.buildingLocation?.buildingId ?? consequence.buildingId;
        const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
        const state = this.buildingSystem.getBuildingSnapshot(buildingId);
        const invalidSlots = new Set(state.invalidSlots);
        const authoritativeNodeId = Object.entries(state.occupancy)
          .filter(([nodeId, occupant]) => occupant.soldierKey === consequence.soldierKey
            && !invalidSlots.has(nodeId))
          .sort(([left], [right]) => compareId(left, right))[0]?.[0] ?? null;
        if (!authoritativeNodeId) {
          this.#ejectOutside(agent, buildingId, descriptor);
          unit.soldierAI?.syncMeshes?.();
          continue;
        }
        agent.buildingLocation = {
          ...agent.buildingLocation,
          phase: 'occupied',
          nodeId: authoritativeNodeId,
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
          authoritativeNodeId
        ));
        this.#setOccupiedPose(agent);
      } else {
        const buildingId = agent.buildingLocation?.buildingId ?? consequence.buildingId;
        const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
        this.#ejectOutside(agent, buildingId, descriptor);
      }
      unit.soldierAI?.syncMeshes?.();
    }
  }

  captureState() {
    return {
      version: 3,
      orderSequence: this.orderSequence,
      orders: [...this.orders.values()]
        .sort((left, right) => compareId(left.unitId, right.unitId))
        .map(clone),
      faceBiases: [...this.faceBiases.values()]
        .sort((left, right) => compareId(left.unitId, right.unitId))
        .map(clone),
      managedDoorOpenings: [...this.managedDoorOpenings.values()]
        .sort((left, right) => compareId(left.buildingId, right.buildingId)
          || compareId(left.openingId, right.openingId))
        .map(clone)
    };
  }

  restoreState(state) {
    this.orderSequence = Math.max(0, Number(state?.orderSequence) || 0);
    this.orders = new Map(
      (state?.orders ?? []).map(order => [String(order.unitId), clone(order)])
    );
    this.faceBiases = new Map(
      (state?.faceBiases ?? []).map(bias => [String(bias.unitId), clone(bias)])
    );
    this.managedDoorOpenings = new Map(
      (state?.managedDoorOpenings ?? []).map(record => [
        JSON.stringify([String(record.buildingId), String(record.openingId)]),
        {
          buildingId: String(record.buildingId),
          openingId: String(record.openingId)
        }
      ])
    );
    this.slotIndexes = new WeakMap();
    this.supportInvalidationKeys = new Map();
  }

  #advanceOccupiedFacing(units) {
    const unitMap = new Map(units.map(unit => [String(unit.id), unit]));
    for (const bias of [...this.faceBiases.values()]
      .sort((left, right) => compareId(left.unitId, right.unitId))) {
      const unit = unitMap.get(String(bias.unitId));
      if (!unit) {
        this.faceBiases.delete(String(bias.unitId));
        continue;
      }
      const descriptor = this.buildingSystem.getDescriptorForBuilding(
        bias.buildingId
      );
      const slots = this.#slotIndex(descriptor);
      const occupants = livingAgents(unit).filter(agent => {
        const location = agent.buildingLocation;
        return location?.phase === 'occupied'
          && String(location.buildingId) === String(bias.buildingId)
          && String(slots.get(location.nodeId)?.floorId) === String(bias.floorId);
      });
      if (occupants.length === 0) {
        this.faceBiases.delete(String(bias.unitId));
        continue;
      }

      const tracked = new Map();
      for (const agent of occupants) {
        if (agent.targetUnitId == null) continue;
        const targetId = String(agent.targetUnitId);
        const targetUnit = unitMap.get(targetId);
        if (!targetUnit?.position || targetUnit.isCombatEffective?.() === false) continue;
        const record = tracked.get(targetId) ?? {
          count: 0,
          targetId,
          position: targetUnit.position
        };
        record.count++;
        tracked.set(targetId, record);
      }
      const trackedTarget = [...tracked.values()].sort((left, right) =>
        right.count - left.count || compareId(left.targetId, right.targetId))[0];
      this.#reassignOccupiedForDirection(
        unit,
        trackedTarget?.position ?? bias.target
      );
    }
  }

  #cleanupUnavailableOccupants(units) {
    for (const unit of units) {
      let cleaned = false;
      const agents = [...(unit.soldierAI?.agents ?? [])]
        .sort((left, right) => compareId(left.id, right.id));
      for (const agent of agents) {
        const location = agent.buildingLocation;
        if (!location?.buildingId || !unavailableAgent(agent)) continue;
        this.buildingSystem.handleCasualty(
          String(location.buildingId),
          String(location.soldierKey ?? soldierKey(unit.id, agent.id))
        );
        agent.buildingLocation = null;
        syncAgent(agent);
        cleaned = true;
      }
      if (cleaned) unit.soldierAI?.syncMeshes?.();
    }
  }

  #reconcileInvalidSupportLocations(units) {
    const buildingIds = new Set();
    for (const unit of units) {
      for (const agent of unit.soldierAI?.agents ?? []) {
        if (agent.buildingLocation?.buildingId != null) {
          buildingIds.add(String(agent.buildingLocation.buildingId));
        }
      }
    }

    for (const buildingId of [...buildingIds].sort(compareId)) {
      const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
      const state = this.buildingSystem.getBuildingSnapshot(buildingId);
      const collapsedSectionIds = descriptor.sections
        .filter(section => state.sections?.[section.id]?.collapsed)
        .map(section => String(section.id))
        .sort(compareId);
      const invalidationKey = JSON.stringify({
        eventVersion: Math.max(0, Number(state.eventVersion) || 0),
        collapsedSectionIds,
        invalidSlots: [...(state.invalidSlots ?? [])].map(String).sort(compareId)
      });
      if (this.supportInvalidationKeys.get(buildingId) === invalidationKey) {
        continue;
      }
      const slots = this.#slotIndex(descriptor);
      const invalidSupportIds = new Set(
        getInvalidSupportSlotIds(descriptor, state, slots)
      );
      if (invalidSupportIds.size === 0) {
        this.supportInvalidationKeys.set(buildingId, invalidationKey);
        continue;
      }
      const floors = new Map(descriptor.floors.map(floor => [
        String(floor.id),
        floor
      ]));
      const consequences = [];
      const invalidOccupants = Object.entries(state.occupancy)
        .filter(([slotId]) => invalidSupportIds.has(String(slotId)))
        .sort((left, right) =>
          compareId(left[1].soldierKey, right[1].soldierKey));

      for (const [sourceId, occupant] of invalidOccupants) {
        const source = slots.get(sourceId);
        const sourceElevation = floors.get(String(source?.floorId))?.elevation;
        this.buildingSystem.releaseSoldier(buildingId, occupant.soldierKey);
        delete state.occupancy[sourceId];
        const destination = Number.isFinite(sourceElevation)
          ? [...slots.values()]
            .filter(slot => {
              const destinationElevation = floors.get(String(slot.floorId))?.elevation;
              return Number.isFinite(destinationElevation)
                && destinationElevation < sourceElevation - EPSILON
                && !isBuildingSlotInvalid(descriptor, state, slot)
                && !state.occupancy[slot.id]
                && !state.reservations[slot.id];
            })
            .sort((left, right) => {
              const leftDistance = (left.localPosition[0] - source.localPosition[0]) ** 2
                + (left.localPosition[2] - source.localPosition[2]) ** 2;
              const rightDistance = (right.localPosition[0] - source.localPosition[0]) ** 2
                + (right.localPosition[2] - source.localPosition[2]) ** 2;
              return leftDistance - rightDistance || compareId(left.id, right.id);
            })[0] ?? null
          : null;
        let acceptedDestination = null;
        if (destination) {
          const occupied = this.buildingSystem.occupySlot(buildingId, {
            slotId: destination.id,
            soldierKey: occupant.soldierKey,
            unitId: occupant.unitId,
            soldierId: occupant.soldierId
          });
          if (occupied.accepted) {
            acceptedDestination = destination;
            state.occupancy[destination.id] = { ...occupant };
          }
        }
        consequences.push({
          buildingId,
          soldierKey: occupant.soldierKey,
          unitId: occupant.unitId,
          soldierId: occupant.soldierId,
          fromSlotId: sourceId,
          toNodeId: acceptedDestination?.id ?? `${buildingId}:exterior-rubble`,
          phase: acceptedDestination ? 'occupied' : 'outside',
          damage: acceptedDestination ? 35 : 70,
          ejected: !acceptedDestination
        });
      }
      if (consequences.length > 0) {
        this.handleOccupantConsequences(consequences);
      }

      for (const [nodeId, reservation] of Object.entries(state.reservations)
        .sort((left, right) => compareId(left[0], right[0]))) {
        if (!invalidSupportIds.has(String(nodeId))) continue;
        this.buildingSystem.releaseSoldier(buildingId, reservation.soldierKey);
      }

      for (const unit of units) {
        for (const agent of [...(unit.soldierAI?.agents ?? [])]
          .sort((left, right) => compareId(left.id, right.id))) {
          const location = agent.buildingLocation;
          if (String(location?.buildingId) !== buildingId) continue;
          const referencedIds = location.phase === 'occupied'
            ? [location.nodeId]
            : [
              location.nodeId,
              location.fromNodeId,
              location.toNodeId,
              location.targetSlotId,
              location.entrySlotId,
              location.reservedNodeId,
              ...(location.exitGroundSlots ?? [])
            ];
          if (!referencedIds.some(id => invalidSupportIds.has(String(id)))) {
            continue;
          }
          this.#ejectOutside(agent, buildingId, descriptor);
          unit.soldierAI?.syncMeshes?.();
        }
      }
      this.supportInvalidationKeys.set(buildingId, invalidationKey);
    }
  }

  #orderAssignments(order) {
    const assignments = Array.isArray(order.assignments)
      ? order.assignments
      : (order.assigned ?? []).map(key => ({
        soldierKey: key,
        buildingId: order.buildingId
      }));
    return assignments
      .map(assignment => ({
        ...assignment,
        soldierKey: String(assignment.soldierKey),
        buildingId: String(assignment.buildingId)
      }))
      .sort((left, right) => compareId(left.soldierKey, right.soldierKey));
  }

  #advanceAgent(agent, location, delta) {
    const buildingId = location.buildingId;
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    if (location.phase === 'approaching') {
      const portal = entryPortal(descriptor, location.entryPortalId);
      if (!portal) {
        this.#ejectOutside(agent, buildingId, descriptor);
        return;
      }
      const approach = this.getEntryApproachPosition(
        buildingId,
        location.entryPortalId
      );
      const route = Array.isArray(location.approachRoute)
        && location.approachRoute.length > 0
        ? location.approachRoute
        : [approach];
      let routeIndex = Math.min(
        route.length - 1,
        Math.max(0, Number(location.approachRouteIndex) || 0)
      );
      while (routeIndex < route.length - 1
          && distanceXZ(agent, route[routeIndex]) <= APPROACH_DISTANCE_METERS) {
        routeIndex++;
      }
      location.approachRouteIndex = routeIndex;
      location.approachGoal = [...route[routeIndex]];
      if (distanceXZ(agent, approach) > APPROACH_DISTANCE_METERS) return;
      const started = this.buildingSystem.startTransit(buildingId, {
        unitId: location.unitId,
        soldierId: location.soldierId,
        soldierKey: location.soldierKey,
        portalId: portal.id,
        fromNodeId: 'outside',
        toNodeId: location.entrySlotId
      });
      if (!started.accepted) {
        if (started.reason === 'invalid_portal' || started.reason === 'target_not_reserved') {
          this.#ejectOutside(agent, buildingId, descriptor);
        }
        return;
      }
      agent.buildingLocation = { ...started.location, ...this.#routeFields(location) };
      this.#openDoorForPortal(buildingId, descriptor, portal.id);
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
      if (result.interrupted) {
        this.#ejectOutside(agent, buildingId, descriptor);
        return;
      }
      this.#positionDuringTransit(agent, buildingId, descriptor, before, result.location);
      if (!result.complete) {
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
        if (!this.#startDoorExit(agent, buildingId, descriptor)) {
          this.#ejectOutside(agent, buildingId, descriptor);
        }
        return;
      }
      if (result.location.phase === 'outside') {
        agent.buildingLocation = null;
        agent.state = 'OBSERVING';
        agent.stance = 'STANDING';
        syncAgent(agent);
        return;
      }
      // Entering cover breaks any exposed outside firing solution. The
      // occupant may reacquire and attack through its assigned fire port.
      agent.targetUnitId = null;
      agent.targetSoldierId = null;
      this.#setOccupiedPose(agent);
      return;
    }
    if (location.phase === 'occupied') this.#setOccupiedPose(agent);
  }

  #recoverApproachOverlaps(
    unit,
    buildingId,
    assignedSoldierKeys,
    entryPortalId
  ) {
    const state = this.buildingSystem.getBuildingSnapshot(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    const unitLocal = worldToLocalPoint(
      [unit.position?.x ?? 0, unit.position?.y ?? 0, unit.position?.z ?? 0],
      state.transform
    );
    const exteriorFace = nearestFootprintFace(
      [unitLocal[0], unitLocal[2]],
      descriptor.bounds
    );
    const entrySectionId = entryPortal(descriptor, entryPortalId)?.sectionId;
    const entrySection = descriptor.sections
      .find(section => section.id === entrySectionId);
    const wallHalfThickness = Math.max(
      0,
      ...(entrySection?.colliderParts ?? []).map(part => Math.min(
        Math.abs(part.halfExtents?.[0] ?? 0),
        Math.abs(part.halfExtents?.[2] ?? 0)
      ))
    );
    const extractionClearance = wallHalfThickness
      + Math.max(0, Number(unit.collisionRadius) || 0)
      + APPROACH_EXTRACTION_EPSILON;
    const expandedBounds = {
      minX: descriptor.bounds.min[0] - extractionClearance,
      maxX: descriptor.bounds.max[0] + extractionClearance,
      minZ: descriptor.bounds.min[2] - extractionClearance,
      maxZ: descriptor.bounds.max[2] + extractionClearance
    };
    const assigned = new Set(assignedSoldierKeys);
    for (const agent of livingAgents(unit)) {
      const key = soldierKey(unit.id, agent.id);
      const location = agent.buildingLocation;
      const assignedApproacher = assigned.has(key) && location?.phase === 'approaching';
      const outsideFollower = !assigned.has(key)
        && (!location || location.phase === 'outside');
      if (!assignedApproacher && !outsideFollower) continue;
      const local = worldToLocalPoint(
        [agent.position?.x ?? 0, agent.position?.y ?? 0, agent.position?.z ?? 0],
        state.transform
      );
      const overlapsFootprint = local[0] > expandedBounds.minX
        && local[0] < expandedBounds.maxX
        && local[2] > expandedBounds.minZ
        && local[2] < expandedBounds.maxZ;
      if (!overlapsFootprint) continue;
      if (exteriorFace === 'left') {
        local[0] = expandedBounds.minX;
      } else if (exteriorFace === 'right') {
        local[0] = expandedBounds.maxX;
      } else if (exteriorFace === 'rear') {
        local[2] = expandedBounds.minZ;
      } else {
        local[2] = expandedBounds.maxZ;
      }
      setPosition(agent, localToWorldPoint(local, state.transform));
      agent.velocity?.set?.(0, 0, 0);
      syncAgent(agent);
    }
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
    const stair = location.stairPortalId == null
      ? descriptor.portals.find(portal => portal.kind === 'stair')
      : descriptor.portals.find(portal =>
        String(portal.id) === String(location.stairPortalId)
          && portal.kind === 'stair');
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
    const stair = location.stairPortalId == null
      ? descriptor.portals.find(portal => portal.kind === 'stair')
      : descriptor.portals.find(portal =>
        String(portal.id) === String(location.stairPortalId)
          && portal.kind === 'stair');
    const state = this.buildingSystem.getBuildingSnapshot(buildingId);
    const currentSlot = this.#slotIndex(descriptor).get(location.nodeId);
    if (!stair || state.invalidPortals.includes(stair.id)
        || isBuildingSlotInvalid(descriptor, state, currentSlot)) {
      this.#ejectOutside(agent, buildingId, descriptor);
      return;
    }
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
      if (!started.accepted) {
        this.#ejectOutside(agent, buildingId, descriptor);
        return;
      }
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
    const portal = entryPortal(descriptor, location.entryPortalId);
    if (!portal) return false;
    const started = this.buildingSystem.startTransit(buildingId, {
      unitId: location.unitId,
      soldierId: location.soldierId,
      soldierKey: location.soldierKey,
      portalId: portal.id,
      fromNodeId: location.nodeId,
      toNodeId: 'outside'
    });
    if (!started.accepted) return false;
    this.#openDoorForPortal(buildingId, descriptor, portal.id);
    agent.buildingLocation = {
      ...started.location,
      ...this.#routeFields(location),
      action: 'EXIT',
      routeStage: 'door'
    };
    syncAgent(agent);
    return true;
  }

  #openDoorForPortal(buildingId, descriptor, portalId) {
    const portal = descriptor.portals.find(candidate =>
      String(candidate.id) === String(portalId));
    if (portal?.kind !== 'door' || !portal.aperture?.id) return false;
    const record = {
      buildingId: String(buildingId),
      openingId: String(portal.aperture.id)
    };
    const key = JSON.stringify([record.buildingId, record.openingId]);
    if (!this.buildingSystem.setOpening(record.buildingId, record.openingId, true)) {
      return false;
    }
    this.managedDoorOpenings.set(key, record);
    return true;
  }

  #synchronizeDoorOpenings(units) {
    const active = new Set();
    for (const unit of units) {
      for (const agent of [...(unit.soldierAI?.agents ?? [])]
        .sort((left, right) => compareId(left.id, right.id))) {
        const location = agent.buildingLocation;
        if (!location?.buildingId
            || location.routeStage !== 'door'
            || !['transit', 'exiting'].includes(location.phase)
            || !location.portalId) {
          continue;
        }
        const descriptor = this.buildingSystem.getDescriptorForBuilding(
          location.buildingId
        );
        const portal = descriptor.portals.find(candidate =>
          String(candidate.id) === String(location.portalId));
        if (portal?.kind !== 'door' || !portal.aperture?.id) continue;
        active.add(JSON.stringify([
          String(location.buildingId),
          String(portal.aperture.id)
        ]));
      }
    }
    for (const [key, record] of [...this.managedDoorOpenings.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))) {
      if (active.has(key)) continue;
      this.buildingSystem.setOpening(record.buildingId, record.openingId, false);
      this.managedDoorOpenings.delete(key);
    }
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

  #ejectOutside(agent, buildingId, descriptor) {
    const location = agent.buildingLocation;
    if (location?.soldierKey) {
      this.buildingSystem.releaseSoldier(buildingId, location.soldierKey);
    }
    setPosition(agent, this.#exteriorWorldPosition(
      buildingId,
      descriptor,
      location?.soldierKey ?? agent.id,
      location?.entryPortalId
    ));
    agent.buildingLocation = null;
    agent.velocity?.set?.(0, 0, 0);
    if (agent.velocity && typeof agent.velocity.set !== 'function') {
      agent.velocity.x = 0;
      agent.velocity.y = 0;
      agent.velocity.z = 0;
    }
    agent.state = 'OBSERVING';
    agent.stance = 'STANDING';
    syncAgent(agent);
  }

  #exteriorWorldPosition(buildingId, descriptor, key, entryPortalId = null) {
    const state = this.buildingSystem.getBuildingSnapshot(buildingId);
    const portal = entryPortal(descriptor, entryPortalId);
    if (!portal?.aperture) return [...state.transform.position];
    const [x, , z] = portal.aperture.center;
    const length = Math.hypot(x, z) || 1;
    const outwardX = x / length;
    const outwardZ = z / length;
    const laneOffset = stableLaneIndex(key) * 0.55;
    const floorY = descriptor.floors
      .find(floor => floor.id === lowerFloorId(descriptor))?.elevation ?? 0;
    return localToWorldPoint([
      x + outwardX * OUTSIDE_STANDOFF_METERS - outwardZ * laneOffset,
      floorY + 0.15,
      z + outwardZ * OUTSIDE_STANDOFF_METERS + outwardX * laneOffset
    ], state.transform);
  }

  #positionDuringTransit(agent, buildingId, descriptor, before, after) {
    const portal = portalIndex(descriptor).get(before.portalId);
    const duration = portal?.transitSeconds ?? 1;
    const stillInTransit = after.phase === 'transit' || after.phase === 'exiting';
    const progress = stillInTransit
      ? Math.min(1, (after.transitElapsed ?? 0) / duration)
      : 1;
    const from = this.#nodeWorldPosition(
      buildingId,
      descriptor,
      before.fromNodeId,
      before.entryPortalId
    );
    const to = this.#nodeWorldPosition(
      buildingId,
      descriptor,
      before.toNodeId,
      before.entryPortalId
    );
    setPosition(agent, lerpPosition(from, to, progress));
    agent.velocity?.set?.(0, 0, 0);
    agent.state = before.routeStage === 'stairs' ? 'MOVING' : 'MOVING';
    agent.stance = 'STANDING';
  }

  #nodeWorldPosition(buildingId, descriptor, nodeId, entryPortalId = null) {
    if (nodeId === 'outside') {
      return this.getEntryApproachPosition(buildingId, entryPortalId);
    }
    return this.#slotWorldPosition(buildingId, descriptor, nodeId);
  }

  #slotWorldPosition(buildingId, descriptor, nodeId) {
    const state = this.buildingSystem.getBuildingSnapshot(buildingId);
    const slot = this.#slotIndex(descriptor).get(nodeId);
    return slot
      ? localToWorldPoint(slot.localPosition, state.transform)
      : [...state.transform.position];
  }

  #routeFields(location) {
    const fields = {
      action: location.action,
      routeStage: location.routeStage,
      targetFloorId: location.targetFloorId ?? null,
      targetSlotId: location.targetSlotId ?? null,
      entrySlotId: location.entrySlotId ?? null,
      stairPortalId: location.stairPortalId ?? null,
      approachPosition: location.approachPosition
        ? [...location.approachPosition]
        : null,
      approachRoute: location.approachRoute
        ? location.approachRoute.map(point => [...point])
        : null,
      approachRouteIndex: Math.max(
        0,
        Number(location.approachRouteIndex) || 0
      ),
      approachGoal: location.approachGoal
        ? [...location.approachGoal]
        : null,
      exitGroundSlots: location.exitGroundSlots ? [...location.exitGroundSlots] : null
    };
    if (Object.hasOwn(location, 'entryPortalId')) {
      fields.entryPortalId = location.entryPortalId;
    }
    return fields;
  }

  #slotIndex(descriptor) {
    let index = this.slotIndexes.get(descriptor);
    if (!index) {
      index = createRoomSlotIndex(descriptor);
      this.slotIndexes.set(descriptor, index);
    }
    return index;
  }
}
