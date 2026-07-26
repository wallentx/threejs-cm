import { validateBuildingDescriptor } from './BuildingDescriptor.js';
import {
  captureBuildingState,
  createBuildingState,
  restoreBuildingState,
  sectionStage
} from './BuildingState.js';
import { createPortalGraph, findPortalPath } from './BuildingPortalGraph.js';
import { localToWorldPoint, transformColliderPart } from './BuildingTransforms.js';

const EVENT_LIMIT = 64;
const COLLISION_CHANGE_LIMIT = 64;
const EPSILON = 1e-9;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function compareText(a, b) {
  return String(a).localeCompare(String(b));
}

function compareReservation(a, b) {
  return (a.orderSequence - b.orderSequence)
    || compareText(a.unitId, b.unitId)
    || compareText(a.soldierId, b.soldierId)
    || compareText(a.nodeId, b.nodeId);
}

function soldierKey(request) {
  return String(request.soldierKey ?? `${request.unitId}:${request.soldierId}`);
}

function normalizeReservation(request) {
  if (!Number.isFinite(request.orderSequence)) throw new Error('Reservation orderSequence must be finite');
  if (request.unitId == null || request.soldierId == null) {
    throw new Error('Reservation unitId and soldierId are required');
  }
  return {
    nodeId: String(request.nodeId),
    soldierKey: soldierKey(request),
    orderSequence: request.orderSequence,
    unitId: String(request.unitId),
    soldierId: String(request.soldierId)
  };
}

function setDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter(id => !rightSet.has(id));
}

function sectionColliderIds(state, descriptor) {
  const ids = [];
  const breached = new Set(state.breachedColliderPartIds);
  for (const section of descriptor.sections) {
    if (state.sections[section.id].collapsed) continue;
    for (const part of section.colliderParts) {
      const opening = part.openingId ? state.openings[part.openingId] : null;
      if (breached.has(`${section.id}:${part.id}`) || opening?.open || opening?.breached || opening?.enabled === false) continue;
      ids.push(`${state.id}:${section.id}:${part.id}`);
    }
  }
  if (state.rubbleActive) {
    for (const part of descriptor.rubble.colliderParts) ids.push(`${state.id}:rubble:${part.id}`);
  }
  return ids.sort(compareText);
}

function roomSlotIndex(descriptor) {
  const index = new Map();
  for (const room of descriptor.rooms) {
    for (const slot of room.slots) {
      index.set(slot.id, { ...slot, roomId: room.id, floorId: room.floorId });
    }
  }
  return index;
}

function roomById(descriptor) {
  return new Map(descriptor.rooms.map(room => [room.id, room]));
}

function floorById(descriptor) {
  return new Map(descriptor.floors.map(floor => [floor.id, floor]));
}

function portalById(descriptor) {
  return new Map(descriptor.portals.map(portal => [portal.id, portal]));
}

function sectionById(descriptor) {
  return new Map(descriptor.sections.map(section => [section.id, section]));
}

function nodeRoom(nodeId, slots) {
  if (nodeId === 'outside') return 'outside';
  return slots.get(nodeId)?.roomId ?? nodeId;
}

function isPortalDirectionValid(portal, fromRoom, toRoom) {
  return (portal.from === fromRoom && portal.to === toRoom)
    || (portal.to === fromRoom && portal.from === toRoom);
}

export class BuildingSystem {
  constructor({ random = null } = {}) {
    this.random = random;
    this.descriptors = new Map();
    this.buildings = new Map();
  }

  registerDescriptor(descriptor) {
    validateBuildingDescriptor(descriptor);
    if (this.descriptors.has(descriptor.id)) {
      throw new Error(`Building descriptor ${descriptor.id} is already registered`);
    }
    this.descriptors.set(descriptor.id, descriptor);
    return descriptor;
  }

  addBuilding({ id, descriptorId, descriptor, transform = {} }) {
    const resolved = descriptor ?? this.descriptors.get(descriptorId);
    if (!resolved) throw new Error(`Unknown building descriptor ${descriptorId}`);
    if (!this.descriptors.has(resolved.id)) this.registerDescriptor(resolved);
    const buildingId = String(id);
    if (this.buildings.has(buildingId)) throw new Error(`Building ${buildingId} already exists`);
    const state = createBuildingState({ id: buildingId, descriptor: resolved, transform });
    this.buildings.set(buildingId, state);
    return this.getBuildingSnapshot(buildingId);
  }

  removeBuilding(id) {
    return this.buildings.delete(String(id));
  }

  getBuildingSnapshot(id) {
    return captureBuildingState(this.#state(id));
  }

  getDescriptorForBuilding(id) {
    const state = this.#state(id);
    return this.descriptors.get(state.descriptorId);
  }

  captureState() {
    return {
      buildings: [...this.buildings.values()]
        .sort((a, b) => compareText(a.id, b.id))
        .map(captureBuildingState)
    };
  }

  restoreState(saved) {
    const restored = new Map();
    for (const record of saved?.buildings ?? []) {
      if (!this.descriptors.has(record.descriptorId)) {
        throw new Error(`Cannot restore building ${record.id}: descriptor ${record.descriptorId} is not registered`);
      }
      restored.set(String(record.id), restoreBuildingState(record));
    }
    this.buildings = restored;
  }

  resolveReservations(id, requests) {
    const state = this.#state(id);
    const descriptor = this.#descriptor(state);
    const slots = roomSlotIndex(descriptor);
    const invalidSlots = new Set(state.invalidSlots);
    const normalized = requests.map(normalizeReservation).sort(compareReservation);
    const seenSoldiers = new Set();
    const results = [];

    for (const request of normalized) {
      let reason = null;
      if (!slots.has(request.nodeId)) reason = 'unknown_node';
      else if (invalidSlots.has(request.nodeId)) reason = 'invalid_node';
      else if (seenSoldiers.has(request.soldierKey)) reason = 'duplicate_request';
      else if (state.occupancy[request.nodeId]) reason = 'occupied';
      else if (state.reservations[request.nodeId]
        && state.reservations[request.nodeId].soldierKey !== request.soldierKey) reason = 'reserved';
      else {
        const existing = Object.values(state.reservations)
          .find(reservation => reservation.soldierKey === request.soldierKey);
        if (existing && existing.nodeId !== request.nodeId) reason = 'soldier_already_reserved';
      }

      seenSoldiers.add(request.soldierKey);
      if (reason) {
        results.push({ ...request, accepted: false, reason });
        continue;
      }
      state.reservations[request.nodeId] = { ...request };
      results.push({ ...request, accepted: true, reason: null });
    }
    return results;
  }

  releaseSoldier(id, key) {
    const state = this.#state(id);
    const normalizedKey = String(key);
    const releasedSlots = [];
    const releasedReservations = [];
    for (const [slotId, occupant] of Object.entries(state.occupancy)) {
      if (occupant.soldierKey !== normalizedKey) continue;
      delete state.occupancy[slotId];
      releasedSlots.push(slotId);
    }
    for (const [nodeId, reservation] of Object.entries(state.reservations)) {
      if (reservation.soldierKey !== normalizedKey) continue;
      delete state.reservations[nodeId];
      releasedReservations.push(nodeId);
    }
    return {
      soldierKey: normalizedKey,
      releasedSlots: releasedSlots.sort(compareText),
      releasedReservations: releasedReservations.sort(compareText)
    };
  }

  handleCasualty(id, key) {
    const released = this.releaseSoldier(id, key);
    this.#event(this.#state(id), {
      type: 'occupant_released',
      soldierKey: released.soldierKey,
      reason: 'casualty'
    });
    return released;
  }

  occupySlot(id, request) {
    const state = this.#state(id);
    const descriptor = this.#descriptor(state);
    const slots = roomSlotIndex(descriptor);
    const slotId = String(request.slotId);
    const key = soldierKey(request);
    if (!slots.has(slotId)) return { accepted: false, reason: 'unknown_slot' };
    if (state.invalidSlots.includes(slotId)) return { accepted: false, reason: 'invalid_slot' };
    if (state.occupancy[slotId]?.soldierKey !== key && state.occupancy[slotId]) {
      return { accepted: false, reason: 'occupied' };
    }
    const reservation = state.reservations[slotId];
    if (reservation && reservation.soldierKey !== key) return { accepted: false, reason: 'reserved' };
    this.releaseSoldier(id, key);
    state.occupancy[slotId] = {
      soldierKey: key,
      unitId: String(request.unitId),
      soldierId: String(request.soldierId)
    };
    return { accepted: true, slotId, soldierKey: key };
  }

  startTransit(id, request) {
    const state = this.#state(id);
    const descriptor = this.#descriptor(state);
    const slots = roomSlotIndex(descriptor);
    const portals = portalById(descriptor);
    const portal = portals.get(String(request.portalId));
    const key = soldierKey(request);
    const fromNodeId = String(request.fromNodeId);
    const toNodeId = String(request.toNodeId);
    if (!portal || state.invalidPortals.includes(portal.id)) {
      return { accepted: false, reason: 'invalid_portal' };
    }
    const fromRoom = nodeRoom(fromNodeId, slots);
    const toRoom = nodeRoom(toNodeId, slots);
    if (!isPortalDirectionValid(portal, fromRoom, toRoom)) {
      return { accepted: false, reason: 'portal_does_not_connect_nodes' };
    }
    if (toNodeId !== 'outside') {
      const reservation = state.reservations[toNodeId];
      if (!reservation || reservation.soldierKey !== key) {
        return { accepted: false, reason: 'target_not_reserved' };
      }
    }
    if (fromNodeId !== 'outside' && state.occupancy[fromNodeId]?.soldierKey !== key) {
      return { accepted: false, reason: 'source_not_occupied' };
    }

    if (fromNodeId !== 'outside') delete state.occupancy[fromNodeId];
    const phase = toNodeId === 'outside' ? 'exiting' : 'transit';
    return {
      accepted: true,
      location: {
        buildingId: state.id,
        phase,
        nodeId: portal.id,
        fromNodeId,
        toNodeId,
        portalId: portal.id,
        transitElapsed: 0,
        reservedNodeId: toNodeId === 'outside' ? null : toNodeId,
        firePortId: null,
        soldierKey: key,
        unitId: String(request.unitId),
        soldierId: String(request.soldierId)
      }
    };
  }

  advanceTransit(id, location, deltaSeconds) {
    const state = this.#state(id);
    const descriptor = this.#descriptor(state);
    const portal = portalById(descriptor).get(location.portalId);
    if (!portal || state.invalidPortals.includes(portal.id)) {
      this.releaseSoldier(id, location.soldierKey);
      return {
        complete: true,
        interrupted: true,
        location: this.#exteriorLocation(state.id, location, 'portal_invalidated')
      };
    }
    const elapsed = Math.min(
      portal.transitSeconds,
      Math.max(0, location.transitElapsed) + Math.max(0, Number(deltaSeconds) || 0)
    );
    if (elapsed + EPSILON < portal.transitSeconds) {
      return { complete: false, interrupted: false, location: { ...location, transitElapsed: elapsed } };
    }
    if (location.toNodeId === 'outside') {
      this.releaseSoldier(id, location.soldierKey);
      return { complete: true, interrupted: false, location: this.#exteriorLocation(state.id, location) };
    }
    const occupied = this.occupySlot(id, {
      slotId: location.toNodeId,
      soldierKey: location.soldierKey,
      unitId: location.unitId,
      soldierId: location.soldierId
    });
    if (!occupied.accepted) {
      this.releaseSoldier(id, location.soldierKey);
      return {
        complete: true,
        interrupted: true,
        location: this.#exteriorLocation(state.id, location, occupied.reason)
      };
    }
    return {
      complete: true,
      interrupted: false,
      location: {
        buildingId: state.id,
        phase: 'occupied',
        nodeId: location.toNodeId,
        fromNodeId: null,
        toNodeId: null,
        portalId: null,
        transitElapsed: 0,
        reservedNodeId: null,
        firePortId: null,
        soldierKey: location.soldierKey,
        unitId: location.unitId,
        soldierId: location.soldierId
      }
    };
  }

  getPortalPath(id, fromNodeId, toNodeId) {
    const state = this.#state(id);
    const descriptor = this.#descriptor(state);
    const slots = roomSlotIndex(descriptor);
    return findPortalPath(
      createPortalGraph(descriptor, state.invalidPortals),
      nodeRoom(String(fromNodeId), slots),
      nodeRoom(String(toNodeId), slots)
    );
  }

  setOpening(id, openingId, open) {
    const state = this.#state(id);
    const opening = state.openings[String(openingId)];
    if (!opening || !opening.enabled) return false;
    return this.#withCollisionChange(state, `opening:${openingId}`, () => {
      opening.open = Boolean(open);
      this.#event(state, { type: 'opening_changed', openingId: opening.id, open: opening.open });
      return true;
    });
  }

  applyProjectileDamage(id, input) {
    return this.#applyDamage(id, { ...input, kind: 'projectile' });
  }

  applyBlastDamage(id, input) {
    const state = this.#state(id);
    const descriptor = this.#descriptor(state);
    const sectionMap = sectionById(descriptor);
    const damages = input.sectionDamages
      ? input.sectionDamages.map(record => ({ ...record }))
      : descriptor.sections.map(section => {
          const distance = this.#distanceToSection(input.centerLocal, section);
          const falloff = Math.max(0, 1 - distance / Math.max(EPSILON, input.radius));
          return { sectionId: section.id, amount: Math.max(0, input.amount) * falloff };
        });
    damages.sort((a, b) => compareText(a.sectionId, b.sectionId));
    const results = [];
    return this.#withCollisionChange(state, 'blast_damage', () => {
      for (const damage of damages) {
        if (!sectionMap.has(damage.sectionId) || damage.amount <= 0) continue;
        results.push(this.#damageSection(state, descriptor, {
          ...damage,
          kind: 'blast',
          penetrationMm: Number.POSITIVE_INFINITY
        }));
      }
      const collapse = this.#processCollapseQueue(state, descriptor);
      return { results, ...collapse };
    });
  }

  processCollapseQueue(id) {
    const state = this.#state(id);
    const descriptor = this.#descriptor(state);
    return this.#withCollisionChange(state, 'collapse_queue', () => (
      this.#processCollapseQueue(state, descriptor)
    ));
  }

  getCollisionSnapshot(id, sinceVersion = 0) {
    const state = this.#state(id);
    const descriptor = this.#descriptor(state);
    const breached = new Set(state.breachedColliderPartIds);
    const records = [];
    for (const section of descriptor.sections) {
      if (state.sections[section.id].collapsed) continue;
      for (const part of section.colliderParts) {
        const opening = part.openingId ? state.openings[part.openingId] : null;
        if (breached.has(`${section.id}:${part.id}`) || opening?.open || opening?.breached || opening?.enabled === false) continue;
        records.push(transformColliderPart(part, state.transform, {
          id: `${state.id}:${section.id}:${part.id}`,
          buildingId: state.id,
          sectionId: section.id,
          kind: 'building'
        }));
      }
    }
    if (state.rubbleActive) {
      for (const part of descriptor.rubble.colliderParts) {
        records.push(transformColliderPart(part, state.transform, {
          id: `${state.id}:rubble:${part.id}`,
          buildingId: state.id,
          sectionId: 'rubble',
          kind: 'rubble'
        }));
      }
    }
    records.sort((a, b) => compareText(a.id, b.id));
    return {
      buildingId: state.id,
      version: state.collisionVersion,
      records,
      changes: state.collisionChanges
        .filter(change => change.version > sinceVersion)
        .map(clone)
    };
  }

  getFirePorts(id) {
    const state = this.#state(id);
    const descriptor = this.#descriptor(state);
    const invalid = new Set(state.invalidFirePorts);
    const slots = roomSlotIndex(descriptor);
    return descriptor.firePorts
      .map(port => {
        const opening = state.openings[port.aperture.id];
        const normalEnd = localToWorldPoint(port.localNormal, {
          position: [0, 0, 0],
          rotationY: state.transform.rotationY
        });
        return {
          ...clone(port),
          worldPosition: localToWorldPoint(port.aperture.center, state.transform),
          worldNormal: normalEnd,
          enabled: !invalid.has(port.id)
            && !state.invalidSlots.includes(port.approachSlotId)
            && !state.sections[port.sectionId].collapsed,
          occupiedBy: state.occupancy[port.approachSlotId]?.soldierKey ?? null,
          cover: opening?.breached ? port.cover * 0.35 : port.cover,
          floorId: slots.get(port.approachSlotId)?.floorId ?? null
        };
      })
      .sort((a, b) => compareText(a.id, b.id));
  }

  #applyDamage(id, input) {
    const state = this.#state(id);
    const descriptor = this.#descriptor(state);
    return this.#withCollisionChange(state, `${input.kind}_damage`, () => {
      const result = this.#damageSection(state, descriptor, input);
      return { result, ...this.#processCollapseQueue(state, descriptor) };
    });
  }

  #damageSection(state, descriptor, input) {
    const section = sectionById(descriptor).get(String(input.sectionId));
    if (!section) throw new Error(`Unknown section ${input.sectionId}`);
    const runtime = state.sections[section.id];
    if (runtime.collapsed || input.amount <= 0) {
      return { sectionId: section.id, applied: 0, penetrated: false, collapsed: runtime.collapsed };
    }
    const penetrationMm = Number.isFinite(input.penetrationMm) ? Math.max(0, input.penetrationMm) : 0;
    const penetrated = input.kind === 'blast' || penetrationMm + EPSILON >= section.resistanceMm;
    const resistanceScale = section.resistanceMm <= EPSILON
      ? 1
      : Math.min(0.35, penetrationMm / section.resistanceMm * 0.35);
    const requested = Math.max(0, input.amount) * (penetrated ? 1 : resistanceScale);
    const applied = Math.min(runtime.health, requested);
    runtime.health = Math.max(0, runtime.health - requested);
    runtime.stage = sectionStage(section, runtime.health);

    const part = section.colliderParts.find(candidate => candidate.id === input.colliderPartId);
    const breachThreshold = section.breachHealthFraction ?? 0.5;
    const breached = Boolean(part)
      && !part.openingId
      && penetrated
      && (input.createBreach === true || runtime.health / runtime.maxHealth <= breachThreshold);
    if (breached) {
      const partKey = `${section.id}:${part.id}`;
      if (!state.breachedColliderPartIds.includes(partKey)) {
        state.breachedColliderPartIds.push(partKey);
        state.breachedColliderPartIds.sort(compareText);
        state.openings[`breach:${partKey}`] = {
          id: `breach:${partKey}`,
          kind: 'breach',
          ownerId: part.id,
          sectionId: section.id,
          colliderPartId: part.id,
          open: true,
          breached: true,
          enabled: true
        };
      }
    }
    this.#event(state, {
      type: breached ? 'section_breached' : 'section_damaged',
      sectionId: section.id,
      kind: input.kind,
      applied,
      penetrated,
      colliderPartId: input.colliderPartId ?? null
    });
    if (runtime.health <= EPSILON) this.#collapseSection(state, descriptor, section.id, 'health_depleted');
    return {
      sectionId: section.id,
      applied,
      penetrated,
      breached,
      health: runtime.health,
      stage: runtime.stage,
      collapsed: runtime.collapsed
    };
  }

  #collapseSection(state, descriptor, sectionId, reason) {
    const section = sectionById(descriptor).get(sectionId);
    const runtime = state.sections[sectionId];
    if (!section || runtime.collapsed) return false;
    runtime.health = 0;
    runtime.collapsed = true;
    runtime.stage = sectionStage(section, 0);
    for (const opening of Object.values(state.openings)) {
      if (opening.sectionId !== sectionId) continue;
      opening.enabled = false;
      opening.open = true;
    }
    for (const portal of descriptor.portals) {
      if (portal.sectionId === sectionId && !state.invalidPortals.includes(portal.id)) {
        state.invalidPortals.push(portal.id);
      }
    }
    for (const port of descriptor.firePorts) {
      if (port.sectionId === sectionId && !state.invalidFirePorts.includes(port.id)) {
        state.invalidFirePorts.push(port.id);
      }
    }
    for (const slotId of this.#slotsInvalidatedBySection(descriptor, section)) {
      if (!state.invalidSlots.includes(slotId)) state.invalidSlots.push(slotId);
    }
    state.invalidSlots.sort(compareText);
    state.invalidPortals.sort(compareText);
    state.invalidFirePorts.sort(compareText);
    if (section.kind === 'foundation' || section.kind === 'floor' || section.kind === 'roof') {
      state.rubbleActive = true;
    }
    for (const supportedId of section.supports) {
      if (!state.collapseQueue.includes(supportedId)) state.collapseQueue.push(supportedId);
    }
    state.collapseQueue.sort(compareText);
    this.#event(state, { type: 'section_collapsed', sectionId, reason });
    return true;
  }

  #processCollapseQueue(state, descriptor) {
    const sectionMap = sectionById(descriptor);
    const supporters = new Map(descriptor.sections.map(section => [section.id, []]));
    for (const section of descriptor.sections) {
      for (const supportedId of section.supports) supporters.get(supportedId).push(section.id);
    }
    for (const ids of supporters.values()) ids.sort(compareText);
    const collapsed = [];
    while (state.collapseQueue.length > 0) {
      state.collapseQueue.sort(compareText);
      const sectionId = state.collapseQueue.shift();
      const runtime = state.sections[sectionId];
      if (!runtime || runtime.collapsed) continue;
      const providerIds = supporters.get(sectionId) ?? [];
      if (providerIds.length === 0) continue;
      const intact = providerIds.filter(providerId => !state.sections[providerId].collapsed).length;
      const intactFraction = intact / providerIds.length;
      const threshold = sectionMap.get(sectionId).supportThreshold ?? 0.5;
      if (intactFraction + EPSILON >= threshold) continue;
      if (this.#collapseSection(state, descriptor, sectionId, 'support_lost')) collapsed.push(sectionId);
    }
    const occupantConsequences = this.#resolveInvalidOccupants(state, descriptor);
    return { collapsedSections: collapsed, occupantConsequences };
  }

  #slotsInvalidatedBySection(descriptor, section) {
    const explicitFloors = new Set(section.affectedFloorIds ?? []);
    const floorMap = floorById(descriptor);
    const invalid = [];
    for (const room of descriptor.rooms) {
      const floor = floorMap.get(room.floorId);
      const floorExplicitlyAffected = explicitFloors.has(room.floorId);
      for (const slot of room.slots) {
        let affected = floorExplicitlyAffected;
        if (!affected && section.kind === 'floor') {
          affected = section.colliderParts.some(part => {
            const dx = Math.abs(slot.localPosition[0] - part.center[0]);
            const dy = Math.abs(slot.localPosition[1] - part.center[1]);
            const dz = Math.abs(slot.localPosition[2] - part.center[2]);
            return dx <= part.halfExtents[0] + EPSILON
              && dz <= part.halfExtents[2] + EPSILON
              && dy <= part.halfExtents[1] + 0.5;
          });
        }
        if (!affected && section.kind === 'roof') {
          const topElevation = Math.max(...descriptor.floors.map(candidate => candidate.elevation));
          affected = Math.abs(floor.elevation - topElevation) <= EPSILON;
        }
        if (affected) invalid.push(slot.id);
      }
    }
    return invalid.sort(compareText);
  }

  #resolveInvalidOccupants(state, descriptor) {
    const invalid = new Set(state.invalidSlots);
    const slots = roomSlotIndex(descriptor);
    const floorMap = floorById(descriptor);
    const consequences = [];
    const entries = Object.entries(state.occupancy)
      .filter(([slotId]) => invalid.has(slotId))
      .sort((a, b) => compareText(a[1].soldierKey, b[1].soldierKey));
    for (const [slotId, occupant] of entries) {
      delete state.occupancy[slotId];
      const source = slots.get(slotId);
      const sourceElevation = floorMap.get(source.floorId).elevation;
      const candidates = [...slots.values()]
        .filter(slot => !invalid.has(slot.id)
          && !state.occupancy[slot.id]
          && floorMap.get(slot.floorId).elevation < sourceElevation - EPSILON)
        .sort((a, b) => {
          const da = (a.localPosition[0] - source.localPosition[0]) ** 2
            + (a.localPosition[2] - source.localPosition[2]) ** 2;
          const db = (b.localPosition[0] - source.localPosition[0]) ** 2
            + (b.localPosition[2] - source.localPosition[2]) ** 2;
          return da - db || compareText(a.id, b.id);
        });
      const destination = candidates[0] ?? null;
      if (destination) {
        state.occupancy[destination.id] = { ...occupant };
      }
      const consequence = {
        soldierKey: occupant.soldierKey,
        unitId: occupant.unitId,
        soldierId: occupant.soldierId,
        fromSlotId: slotId,
        toNodeId: destination?.id ?? `${state.id}:exterior-rubble`,
        phase: destination ? 'occupied' : 'outside',
        damage: destination ? 35 : 70,
        ejected: !destination
      };
      consequences.push(consequence);
      this.#event(state, { type: 'occupant_collapse_consequence', ...consequence });
    }
    for (const [nodeId, reservation] of Object.entries(state.reservations)) {
      if (!invalid.has(nodeId)) continue;
      delete state.reservations[nodeId];
      this.#event(state, {
        type: 'reservation_invalidated',
        nodeId,
        soldierKey: reservation.soldierKey
      });
    }
    return consequences;
  }

  #withCollisionChange(state, reason, mutation) {
    const descriptor = this.#descriptor(state);
    const before = sectionColliderIds(state, descriptor);
    const result = mutation();
    const after = sectionColliderIds(state, descriptor);
    const added = setDifference(after, before);
    const removed = setDifference(before, after);
    if (added.length > 0 || removed.length > 0) {
      state.collisionVersion++;
      state.collisionChanges.push({
        version: state.collisionVersion,
        reason,
        added,
        removed
      });
      if (state.collisionChanges.length > COLLISION_CHANGE_LIMIT) state.collisionChanges.shift();
    }
    return result;
  }

  #distanceToSection(point, section) {
    if (!Array.isArray(point)) return 0;
    let closest = Number.POSITIVE_INFINITY;
    for (const part of section.colliderParts) {
      const dx = Math.max(0, Math.abs(point[0] - part.center[0]) - part.halfExtents[0]);
      const dy = Math.max(0, Math.abs(point[1] - part.center[1]) - part.halfExtents[1]);
      const dz = Math.max(0, Math.abs(point[2] - part.center[2]) - part.halfExtents[2]);
      closest = Math.min(closest, Math.hypot(dx, dy, dz));
    }
    return Number.isFinite(closest) ? closest : Number.POSITIVE_INFINITY;
  }

  #event(state, event) {
    state.eventVersion++;
    state.events.push({ ...event, version: state.eventVersion });
    if (state.events.length > EVENT_LIMIT) state.events.shift();
  }

  #exteriorLocation(buildingId, location, reason = null) {
    return {
      buildingId,
      phase: 'outside',
      nodeId: 'outside',
      fromNodeId: null,
      toNodeId: null,
      portalId: null,
      transitElapsed: 0,
      reservedNodeId: null,
      firePortId: null,
      soldierKey: location.soldierKey,
      unitId: location.unitId,
      soldierId: location.soldierId,
      reason
    };
  }

  #state(id) {
    const state = this.buildings.get(String(id));
    if (!state) throw new Error(`Unknown building ${id}`);
    return state;
  }

  #descriptor(state) {
    const descriptor = this.descriptors.get(state.descriptorId);
    if (!descriptor) throw new Error(`Unknown building descriptor ${state.descriptorId}`);
    return descriptor;
  }
}
