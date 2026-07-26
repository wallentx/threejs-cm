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

export function createRoomSlotIndex(descriptor) {
  const index = new Map();
  for (const room of descriptor.rooms) {
    for (const slot of room.slots) {
      index.set(slot.id, { ...slot, roomId: room.id, floorId: room.floorId });
    }
  }
  return index;
}

export function roomForBuildingNode(nodeId, slots) {
  if (nodeId === 'outside') return 'outside';
  return slots.get(nodeId)?.roomId ?? nodeId;
}
