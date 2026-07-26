export { BuildingSystem } from './BuildingSystem.js';
export { validateBuildingDescriptor } from './BuildingDescriptor.js';
export { createBuildingState, captureBuildingState, restoreBuildingState } from './BuildingState.js';
export { createPortalGraph, findPortalPath } from './BuildingPortalGraph.js';
export { calculateSectionDamage, distanceToSection } from './BuildingDamage.js';
export {
  buildingSoldierKey,
  compareReservationRequests,
  createRoomSlotIndex,
  normalizeReservationRequest,
  roomForBuildingNode
} from './BuildingOccupancy.js';
export {
  normalizeBuildingTransform,
  localToWorldPoint,
  worldToLocalPoint,
  transformColliderPart
} from './BuildingTransforms.js';
