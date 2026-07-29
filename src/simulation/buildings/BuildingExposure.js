const ATTACKING_STATES = new Set([
  'AIMING',
  'FIRING',
  'RELOADING'
]);

function readBuildingLocation(person) {
  return person?.buildingLocation ?? person?.record?.buildingLocation ?? null;
}

function readState(person) {
  return String(person?.state ?? person?.record?.state ?? '').toUpperCase();
}

function readTargetUnitId(person) {
  return person?.targetUnitId ?? person?.record?.targetUnitId ?? null;
}

/**
 * First-order building exposure policy.
 *
 * An occupied soldier is concealed by the building until using an enabled
 * firing position to attack. This controls target acquisition only. Building
 * apertures, sections, penetration, blast, and occupant damage remain owned by
 * their existing authoritative systems.
 */
export function isBuildingOccupantExposed(person, unit = null) {
  const location = readBuildingLocation(person);
  if (!location || location.phase !== 'occupied') return true;
  if (!location.firePortId) return false;

  return readTargetUnitId(person) != null
    || ATTACKING_STATES.has(readState(person))
    || unit?.targetUnit != null
    || unit?.targetPos != null;
}

