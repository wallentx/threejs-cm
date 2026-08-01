export function compareBuildingId(a, b) {
  return String(a).localeCompare(String(b));
}

export function buildingSoldierKey(request) {
  return String(request.soldierKey ?? `${request.unitId}:${request.soldierId}`);
}

export function normalizeReservationRequest(request) {
  if (!Number.isFinite(request.orderSequence)) throw new Error('Reservation orderSequence must be finite');
  if (request.unitId == null || request.soldierId == null) {
    throw new Error('Reservation unitId and soldierId are required');
  }
  return {
    nodeId: String(request.nodeId),
    soldierKey: buildingSoldierKey(request),
    orderSequence: request.orderSequence,
    unitId: String(request.unitId),
    soldierId: String(request.soldierId)
  };
}

export function compareReservationRequests(a, b) {
  return (a.orderSequence - b.orderSequence)
    || compareBuildingId(a.unitId, b.unitId)
    || compareBuildingId(a.soldierId, b.soldierId)
    || compareBuildingId(a.nodeId, b.nodeId);
}

export function isSupportSlot(slot) {
  return Boolean(slot?.isSupport);
}

export const INTERIOR_SUPPORT_POLICY = Object.freeze({
  id: 'first-order-floor-lattice-v1',
  wallInsetMeters: 0.8,
  spacingMeters: 1.25,
  minimumAuthoredSeparationMeters: 1.0,
  standingHeightOffsetMeters: 0.15,
  densitySquareMetersPerSoldier: 1.5625
});

export const INTERIOR_SUPPORT_APPROXIMATION =
  'first-order renderer-neutral floor capacity: a regular inset lattice at '
  + '1.25 metre spacing; room ownership is inferred from the nearest authored '
  + 'room-slot centroid because exact room polygons are not yet in the schema';

const EPSILON = 1e-9;

function axisCandidates(minimum, maximum) {
  const usableMinimum = minimum + INTERIOR_SUPPORT_POLICY.wallInsetMeters;
  const usableMaximum = maximum - INTERIOR_SUPPORT_POLICY.wallInsetMeters;
  const usableLength = usableMaximum - usableMinimum;
  if (usableLength < -EPSILON) return [];
  const count = Math.floor((usableLength + EPSILON)
    / INTERIOR_SUPPORT_POLICY.spacingMeters) + 1;
  const occupiedLength = Math.max(0, count - 1)
    * INTERIOR_SUPPORT_POLICY.spacingMeters;
  const start = (minimum + maximum - occupiedLength) * 0.5;
  return Array.from({ length: count }, (_, index) =>
    start + index * INTERIOR_SUPPORT_POLICY.spacingMeters);
}

function roomSupportAnchor(room) {
  const slots = [...(room?.slots ?? [])]
    .sort((left, right) => compareBuildingId(left.id, right.id));
  const total = slots.reduce((sum, slot) => [
    sum[0] + slot.localPosition[0],
    sum[1] + slot.localPosition[2]
  ], [0, 0]);
  return {
    roomId: String(room.id),
    position: [total[0] / slots.length, total[1] / slots.length]
  };
}

function nearestRoomId(anchors, position) {
  return [...anchors].sort((left, right) => {
    const leftDistance = (left.position[0] - position[0]) ** 2
      + (left.position[1] - position[1]) ** 2;
    const rightDistance = (right.position[0] - position[0]) ** 2
      + (right.position[1] - position[1]) ** 2;
    return leftDistance - rightDistance
      || compareBuildingId(left.roomId, right.roomId);
  })[0]?.roomId ?? null;
}

export function getFloorSupportSlots(descriptor, floorId) {
  const floor = descriptor.floors.find(candidate => candidate.id === floorId);
  if (!floor) return [];
  const floorRoomIds = new Set((floor.rooms ?? []).map(String));
  const rooms = descriptor.rooms
    .filter(room => floorRoomIds.has(String(room.id)))
    .sort((left, right) => compareBuildingId(left.id, right.id));
  if (rooms.length === 0) return [];

  const authoredSlots = rooms
    .flatMap(room => room.slots ?? [])
    .sort((left, right) => compareBuildingId(left.id, right.id));
  const authoredIds = new Set(authoredSlots.map(slot => String(slot.id)));
  const anchors = rooms.map(roomSupportAnchor);
  const xCandidates = axisCandidates(
    descriptor.bounds.min[0],
    descriptor.bounds.max[0]
  );
  const zCandidates = axisCandidates(
    descriptor.bounds.min[2],
    descriptor.bounds.max[2]
  );
  const minimumSeparationSquared =
    INTERIOR_SUPPORT_POLICY.minimumAuthoredSeparationMeters ** 2;
  const slots = [];

  for (let zIndex = 0; zIndex < zCandidates.length; zIndex++) {
    for (let xIndex = 0; xIndex < xCandidates.length; xIndex++) {
      const x = xCandidates[xIndex];
      const z = zCandidates[zIndex];
      const overlapsAuthored = authoredSlots.some(slot => {
        const dx = slot.localPosition[0] - x;
        const dz = slot.localPosition[2] - z;
        return dx * dx + dz * dz < minimumSeparationSquared - EPSILON;
      });
      if (overlapsAuthored) continue;
      const id = `${floor.id}-interior-support-r${zIndex}-c${xIndex}`;
      if (authoredIds.has(id)) continue;
      slots.push({
        id,
        roomId: nearestRoomId(anchors, [x, z]),
        floorId: String(floor.id),
        localPosition: [
          x,
          floor.elevation + INTERIOR_SUPPORT_POLICY.standingHeightOffsetMeters,
          z
        ],
        capacity: 1,
        isSupport: true,
        isGeneratedSupport: true,
        supportPolicyId: INTERIOR_SUPPORT_POLICY.id,
        placementDataQuality: INTERIOR_SUPPORT_APPROXIMATION
      });
    }
  }
  return slots;
}

export function getRoomSupportSlots(descriptor, room) {
  if (!room?.floorId) return [];
  return getFloorSupportSlots(descriptor, room.floorId)
    .filter(slot => slot.roomId === String(room.id));
}

function collapsedSectionInvalidatesSlot(descriptor, state, slot) {
  const floor = descriptor.floors.find(candidate =>
    String(candidate.id) === String(slot.floorId));
  if (!floor) return true;
  const topElevation = Math.max(...descriptor.floors.map(candidate =>
    candidate.elevation));
  return descriptor.sections.some(section => {
    if (!state.sections?.[section.id]?.collapsed) return false;
    if ((section.affectedFloorIds ?? []).some(id =>
      String(id) === String(slot.floorId))) return true;
    if (section.kind === 'roof') {
      return Math.abs(floor.elevation - topElevation) <= EPSILON;
    }
    if (section.kind !== 'floor') return false;
    return (section.colliderParts ?? []).some(part => {
      const dx = Math.abs(slot.localPosition[0] - part.center[0]);
      const dy = Math.abs(slot.localPosition[1] - part.center[1]);
      const dz = Math.abs(slot.localPosition[2] - part.center[2]);
      return dx <= part.halfExtents[0] + EPSILON
        && dz <= part.halfExtents[2] + EPSILON
        && dy <= part.halfExtents[1] + 0.5;
    });
  });
}

export function isBuildingSlotInvalid(descriptor, state, slot) {
  if (!slot) return true;
  if ((state?.invalidSlots ?? []).some(id => String(id) === String(slot.id))) {
    return true;
  }
  return Boolean(slot.isGeneratedSupport)
    && collapsedSectionInvalidatesSlot(descriptor, state ?? {}, slot);
}

export function getInvalidSupportSlotIds(
  descriptor,
  state,
  index = createRoomSlotIndex(descriptor)
) {
  return [...index.values()]
    .filter(slot => slot.isGeneratedSupport
      && isBuildingSlotInvalid(descriptor, state, slot))
    .map(slot => String(slot.id))
    .sort(compareBuildingId);
}

export function createRoomSlotIndex(descriptor) {
  const index = new Map();
  const firePortApproachSlotIds = new Set(
    (descriptor.firePorts ?? []).map(port => String(port.approachSlotId))
  );

  const generatedByFloor = new Map(descriptor.floors.map(floor => [
    String(floor.id),
    getFloorSupportSlots(descriptor, floor.id)
  ]));
  for (const room of [...descriptor.rooms]
    .sort((left, right) => compareBuildingId(left.id, right.id))) {
    for (const slot of [...room.slots]
      .sort((left, right) => compareBuildingId(left.id, right.id))) {
      const isWindowSlot = firePortApproachSlotIds.has(String(slot.id));
      index.set(slot.id, {
        ...slot,
        roomId: room.id,
        floorId: room.floorId,
        isSupport: !isWindowSlot,
        isGeneratedSupport: false
      });
    }
    const supportSlots = generatedByFloor.get(String(room.floorId))
      ?.filter(slot => slot.roomId === String(room.id)) ?? [];
    for (const slot of supportSlots) {
      if (!index.has(slot.id)) {
        index.set(slot.id, slot);
      }
    }
  }
  return index;
}

export function getAuthoredWindowSlots(descriptor, floorOrRoomId = null) {
  const index = createRoomSlotIndex(descriptor);
  return [...index.values()].filter(slot =>
    !slot.isSupport && (floorOrRoomId == null || slot.floorId === floorOrRoomId || slot.roomId === floorOrRoomId)
  ).sort((a, b) => compareBuildingId(a.id, b.id));
}

export function getInteriorSupportSlots(descriptor, floorOrRoomId = null) {
  const index = createRoomSlotIndex(descriptor);
  return [...index.values()].filter(slot =>
    slot.isSupport && (floorOrRoomId == null || slot.floorId === floorOrRoomId || slot.roomId === floorOrRoomId)
  ).sort((a, b) => compareBuildingId(a.id, b.id));
}

export function roomForBuildingNode(nodeId, slots) {
  if (nodeId === 'outside') return 'outside';
  return slots.get(nodeId)?.roomId ?? nodeId;
}
