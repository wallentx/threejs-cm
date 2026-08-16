import {
  intersectSegmentOrientedBox3D
} from '../geometry/OrientedBox.js';
import {
  vehicleVolumeTransform
} from './VehicleTransforms.js';

export const VEHICLE_CREW_EXPOSURE_MODEL =
  'unbuttoned-commander-obb-v1';

export function getUnbuttonedCommander(unit) {
  const record =
    unit?.vehicleSpec?.observationEquipment?.unbuttonedCommander;
  if (
    !record
    || unit?.vehicleCrewPosture !== 'UNBUTTONED'
    || unit?.vehicleCrewBailout?.triggered
  ) return null;
  return (unit.roster ?? []).find(crewman =>
    crewman.health > 0
    && !['KIA', 'INCAPACITATED', 'DEAD'].includes(crewman.status)
    && (
      crewman.vehicleLocation == null
      || crewman.vehicleLocation.phase === 'MOUNTED'
    )
    && (
      typeof unit.getEffectiveCrewRole !== 'function'
      || unit.getEffectiveCrewRole(crewman) === record.role
    )
  ) ?? null;
}

export function getUnbuttonedCommanderWorldPosition(unit) {
  const record =
    unit?.vehicleSpec?.observationEquipment?.unbuttonedCommander;
  if (!record || !getUnbuttonedCommander(unit)) return null;
  const transform = vehicleVolumeTransform(unit, record);
  return {
    x: transform.centerX,
    y: transform.centerY,
    z: transform.centerZ
  };
}

export function intersectExposedVehicleCrew(start, end, unit) {
  const crewman = getUnbuttonedCommander(unit);
  const record =
    unit?.vehicleSpec?.observationEquipment?.unbuttonedCommander;
  if (!crewman || !record) return null;
  const transform = vehicleVolumeTransform(unit, record);
  const hit = intersectSegmentOrientedBox3D(start, end, {
    ...transform,
    halfWidth: record.halfExtents[0],
    halfHeight: record.halfExtents[1],
    halfDepth: record.halfExtents[2]
  });
  if (!hit) return null;
  return {
    ...hit,
    crewman,
    hitVolumeId: record.id,
    modelVersion: VEHICLE_CREW_EXPOSURE_MODEL,
    dataQuality: record.dataQuality
  };
}
