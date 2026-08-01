export const INFANTRY_FIRE_MOVEMENT_MODEL = Object.freeze({
  version: 1,
  coordinatedOrderTypes: Object.freeze(['ASSAULT', 'HUNT']),
  approximationLabel:
    'first-order gameplay approximation for paired infantry fire and movement'
});

const BUILDING_OUTSIDE_PHASES = new Set(['outside', 'approaching']);
const UNAVAILABLE_STATUSES = new Set([
  'INCAPACITATED',
  'DEAD',
  'SURRENDERED'
]);

function finiteNonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function evaluateInfantryFireMovementOrder({
  waypointOrderType = null,
  requestedOrderType = null,
  hasValidDirectTarget = false,
  hasDirectPrecisionObservation = false,
  buildingTransitActive = false,
  nearFinalWaypoint = false
} = {}) {
  const explicitOrder = waypointOrderType === 'ASSAULT'
    || waypointOrderType === 'HUNT';
  const requestedExplicitOrder = requestedOrderType === waypointOrderType;
  const knownTargetQuick = waypointOrderType === 'QUICK'
    && requestedOrderType === 'QUICK'
    && hasValidDirectTarget
    && hasDirectPrecisionObservation;
  const active = !buildingTransitActive
    && ((explicitOrder && requestedExplicitOrder) || knownTargetQuick);

  return Object.freeze({
    active,
    reform: active && nearFinalWaypoint,
    coveringStance: active && explicitOrder ? 'KNEELING' : null,
    approximationLabel: INFANTRY_FIRE_MOVEMENT_MODEL.approximationLabel
  });
}

export function canParticipateInInfantryFireMovement({
  alive = false,
  status = null,
  state = null,
  buildingPhase = null,
  reloadSeconds = 0,
  magazineAmmo = 0,
  suppression = 0,
  moraleTier = null,
  unitMorale = null,
  incomingFireSeconds = 0,
  casualtyResponseSeconds = 0,
  suppressionDelta = 0
} = {}) {
  const outsideBuilding = buildingPhase == null
    || BUILDING_OUTSIDE_PHASES.has(buildingPhase);
  return Boolean(
    alive
    && !UNAVAILABLE_STATUSES.has(status)
    && state !== 'SURRENDERED'
    && outsideBuilding
    && finiteNonNegative(reloadSeconds) === 0
    && finiteNonNegative(magazineAmmo) > 0
    && finiteNonNegative(suppression) < 35
    && !['PINNED', 'ROUTED'].includes(moraleTier)
    && !['Pinned', 'Broken'].includes(unitMorale)
    && finiteNonNegative(incomingFireSeconds) === 0
    && finiteNonNegative(casualtyResponseSeconds) === 0
    && suppressionDelta < 4
  );
}

export function planHaltedHuntMoverGoal({
  active = false,
  orderType = null,
  haltAnchorMovement = false,
  role = null,
  moverStart = null,
  formationGoal = null,
  anchorPosition = null,
  waypointPosition = null,
  maximumAdvanceMeters = 0
} = {}) {
  if (
    !active
    || orderType !== 'HUNT'
    || !haltAnchorMovement
    || role !== 'mover'
    || !Array.isArray(moverStart)
    || moverStart.length !== 2
    || !Array.isArray(formationGoal)
    || formationGoal.length !== 2
    || !Array.isArray(anchorPosition)
    || anchorPosition.length !== 2
    || !Array.isArray(waypointPosition)
    || waypointPosition.length !== 2
    || !Number.isFinite(maximumAdvanceMeters)
    || maximumAdvanceMeters <= 0
  ) {
    return null;
  }
  const coordinates = [
    ...moverStart,
    ...formationGoal,
    ...anchorPosition,
    ...waypointPosition
  ];
  if (!coordinates.every(Number.isFinite)) return null;

  // The squad anchor remains at contact. Advance this formation slot by one
  // local bound toward the ordered waypoint. After both elements reach that
  // fixed contact line, later role swaps cannot walk the squad down the full
  // route behind its halted authoritative anchor.
  const routeDeltaX = waypointPosition[0] - anchorPosition[0];
  const routeDeltaZ = waypointPosition[1] - anchorPosition[1];
  const remainingRouteMeters = Math.hypot(routeDeltaX, routeDeltaZ);
  if (remainingRouteMeters <= 1e-9) {
    return Object.freeze({
      x: formationGoal[0],
      z: formationGoal[1],
      advanceMeters: 0
    });
  }
  const advanceMeters = Math.min(
    maximumAdvanceMeters,
    remainingRouteMeters
  );
  const scale = advanceMeters / remainingRouteMeters;
  return Object.freeze({
    x: formationGoal[0] + routeDeltaX * scale,
    z: formationGoal[1] + routeDeltaZ * scale,
    advanceMeters
  });
}
