const PORTAL_KINDS = new Set(['door', 'stair']);
const SECTION_KINDS = new Set(['foundation', 'wall', 'floor', 'roof']);

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid building descriptor: ${message}`);
}

function finiteVector(value, length, label) {
  assert(Array.isArray(value) && value.length === length, `${label} must have ${length} values`);
  for (const component of value) assert(Number.isFinite(component), `${label} must be finite`);
}

function uniqueIds(records, label) {
  const ids = new Set();
  for (const record of records) {
    assert(record && typeof record.id === 'string' && record.id.length > 0, `${label} id is required`);
    assert(!ids.has(record.id), `duplicate ${label} id ${record.id}`);
    ids.add(record.id);
  }
  return ids;
}

function validateSupportGraph(sections, sectionIds) {
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(sections.map(section => [section.id, section]));
  const visit = id => {
    if (visiting.has(id)) throw new Error(`Invalid building descriptor: support graph cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const supportedId of byId.get(id).supports ?? []) {
      assert(sectionIds.has(supportedId), `section ${id} supports unknown section ${supportedId}`);
      visit(supportedId);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const section of sections) visit(section.id);
}

export function validateBuildingDescriptor(descriptor) {
  assert(descriptor && typeof descriptor === 'object', 'descriptor is required');
  assert(typeof descriptor.id === 'string' && descriptor.id.length > 0, 'id is required');
  finiteVector(descriptor.bounds?.min, 3, 'bounds.min');
  finiteVector(descriptor.bounds?.max, 3, 'bounds.max');
  for (let axis = 0; axis < 3; axis++) {
    assert(descriptor.bounds.max[axis] > descriptor.bounds.min[axis], `bounds axis ${axis} is empty`);
  }

  assert(Array.isArray(descriptor.floors) && descriptor.floors.length > 0, 'floors are required');
  assert(Array.isArray(descriptor.rooms) && descriptor.rooms.length > 0, 'rooms are required');
  assert(Array.isArray(descriptor.portals), 'portals are required');
  assert(Array.isArray(descriptor.firePorts), 'firePorts are required');
  assert(Array.isArray(descriptor.sections) && descriptor.sections.length > 0, 'sections are required');

  const floorIds = uniqueIds(descriptor.floors, 'floor');
  const roomIds = uniqueIds(descriptor.rooms, 'room');
  const portalIds = uniqueIds(descriptor.portals, 'portal');
  const firePortIds = uniqueIds(descriptor.firePorts, 'fire port');
  const sectionIds = uniqueIds(descriptor.sections, 'section');
  const slotIds = new Set();
  const apertureIds = new Set();

  for (const floor of descriptor.floors) {
    assert(Number.isFinite(floor.elevation), `floor ${floor.id} elevation must be finite`);
    assert(Array.isArray(floor.rooms) && floor.rooms.length > 0, `floor ${floor.id} rooms are required`);
    for (const roomId of floor.rooms) assert(roomIds.has(roomId), `floor ${floor.id} has unknown room ${roomId}`);
  }
  for (const room of descriptor.rooms) {
    assert(floorIds.has(room.floorId), `room ${room.id} has unknown floor ${room.floorId}`);
    assert(Number.isFinite(room.concealment) && room.concealment >= 0, `room ${room.id} concealment is invalid`);
    assert(Array.isArray(room.slots) && room.slots.length > 0, `room ${room.id} slots are required`);
    for (const slot of room.slots) {
      assert(typeof slot.id === 'string' && slot.id.length > 0, `room ${room.id} slot id is required`);
      assert(!slotIds.has(slot.id), `duplicate slot id ${slot.id}`);
      slotIds.add(slot.id);
      finiteVector(slot.localPosition, 3, `slot ${slot.id} localPosition`);
      assert(slot.capacity === 1, `slot ${slot.id} capacity must be 1 in the current runtime`);
    }
  }

  for (const portal of descriptor.portals) {
    assert(PORTAL_KINDS.has(portal.kind), `portal ${portal.id} kind is invalid`);
    assert(portal.from === 'outside' || roomIds.has(portal.from), `portal ${portal.id} from is invalid`);
    assert(portal.to === 'outside' || roomIds.has(portal.to), `portal ${portal.id} to is invalid`);
    assert(portal.from !== portal.to, `portal ${portal.id} endpoints must differ`);
    assert(Number.isFinite(portal.transitSeconds) && portal.transitSeconds > 0, `portal ${portal.id} transitSeconds is invalid`);
    if (portal.sectionId != null) assert(sectionIds.has(portal.sectionId), `portal ${portal.id} section is invalid`);
    if (portal.aperture) {
      assert(typeof portal.aperture.id === 'string', `portal ${portal.id} aperture id is required`);
      assert(!apertureIds.has(portal.aperture.id), `duplicate aperture id ${portal.aperture.id}`);
      apertureIds.add(portal.aperture.id);
      finiteVector(portal.aperture.center, 3, `portal ${portal.id} aperture center`);
      finiteVector(portal.aperture.size, 2, `portal ${portal.id} aperture size`);
    }
  }

  for (const firePort of descriptor.firePorts) {
    assert(roomIds.has(firePort.roomId), `fire port ${firePort.id} room is invalid`);
    assert(slotIds.has(firePort.approachSlotId), `fire port ${firePort.id} slot is invalid`);
    assert(sectionIds.has(firePort.sectionId), `fire port ${firePort.id} section is invalid`);
    finiteVector(firePort.localNormal, 3, `fire port ${firePort.id} localNormal`);
    assert(Number.isFinite(firePort.horizontalArcDeg) && firePort.horizontalArcDeg > 0, `fire port ${firePort.id} arc is invalid`);
    assert(Number.isFinite(firePort.elevationDeg), `fire port ${firePort.id} elevation is invalid`);
    assert(Number.isInteger(firePort.capacity) && firePort.capacity > 0, `fire port ${firePort.id} capacity is invalid`);
    assert(Number.isFinite(firePort.cover) && firePort.cover >= 0, `fire port ${firePort.id} cover is invalid`);
    assert(firePort.aperture && typeof firePort.aperture.id === 'string', `fire port ${firePort.id} aperture is required`);
    assert(!apertureIds.has(firePort.aperture.id), `duplicate aperture id ${firePort.aperture.id}`);
    apertureIds.add(firePort.aperture.id);
    finiteVector(firePort.aperture.center, 3, `fire port ${firePort.id} aperture center`);
    finiteVector(firePort.aperture.size, 2, `fire port ${firePort.id} aperture size`);
  }

  for (const section of descriptor.sections) {
    assert(SECTION_KINDS.has(section.kind), `section ${section.id} kind is invalid`);
    assert(typeof section.material === 'string' && section.material.length > 0, `section ${section.id} material is required`);
    assert(Number.isFinite(section.maxHealth) && section.maxHealth > 0, `section ${section.id} maxHealth is invalid`);
    assert(Number.isFinite(section.resistanceMm) && section.resistanceMm >= 0, `section ${section.id} resistanceMm is invalid`);
    assert(Array.isArray(section.supports), `section ${section.id} supports are required`);
    assert(Array.isArray(section.colliderParts), `section ${section.id} colliderParts are required`);
    assert(Array.isArray(section.visualStages) && section.visualStages.length > 0, `section ${section.id} visualStages are required`);
    if (section.supportThreshold != null) {
      assert(section.supportThreshold >= 0 && section.supportThreshold <= 1, `section ${section.id} supportThreshold is invalid`);
    }
    const partIds = uniqueIds(section.colliderParts, `collider part in ${section.id}`);
    for (const part of section.colliderParts) {
      finiteVector(part.center, 3, `collider part ${part.id} center`);
      finiteVector(part.halfExtents, 3, `collider part ${part.id} halfExtents`);
      assert(part.halfExtents.every(value => value > 0), `collider part ${part.id} halfExtents must be positive`);
      if (part.openingId != null) {
        assert(apertureIds.has(part.openingId), `collider part ${part.id} opening is invalid`);
      }
    }
    assert(partIds.size === section.colliderParts.length, `section ${section.id} collider part ids must be unique`);
    const stageIds = uniqueIds(section.visualStages, `visual stage in ${section.id}`);
    for (const stage of section.visualStages) {
      assert(Number.isFinite(stage.minHealthFraction)
        && stage.minHealthFraction >= 0 && stage.minHealthFraction <= 1,
      `visual stage ${stage.id} threshold is invalid`);
    }
    assert(stageIds.size === section.visualStages.length, `section ${section.id} visual stage ids must be unique`);
  }
  validateSupportGraph(descriptor.sections, sectionIds);
  assert(descriptor.rubble && Array.isArray(descriptor.rubble.colliderParts), 'rubble colliderParts are required');
  assert(Number.isFinite(descriptor.rubble.concealment) && descriptor.rubble.concealment >= 0, 'rubble concealment is invalid');
  for (const part of descriptor.rubble.colliderParts) {
    assert(typeof part.id === 'string' && part.id.length > 0, 'rubble collider part id is required');
    finiteVector(part.center, 3, `rubble collider part ${part.id} center`);
    finiteVector(part.halfExtents, 3, `rubble collider part ${part.id} halfExtents`);
  }

  // Isolated floors and rooms are valid data, but a tactical building must have
  // a route from outside to every room.
  const reached = new Set(['outside']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const portal of descriptor.portals) {
      if (reached.has(portal.from) && !reached.has(portal.to)) {
        reached.add(portal.to);
        changed = true;
      } else if (reached.has(portal.to) && !reached.has(portal.from)) {
        reached.add(portal.from);
        changed = true;
      }
    }
  }
  for (const roomId of roomIds) assert(reached.has(roomId), `room ${roomId} is unreachable from outside`);
  assert(portalIds.size === descriptor.portals.length, 'portal ids must be unique');
  assert(firePortIds.size === descriptor.firePorts.length, 'fire port ids must be unique');
  return descriptor;
}
