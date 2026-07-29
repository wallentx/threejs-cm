import {
  OBSERVATION_EQUIPMENT,
  observerHasEquipment
} from './ObservationEquipment.js';

export const OBSERVER_CAPABILITY_MODEL =
  'individual-observer-capability-v1';

export const OBSERVER_CAPABILITY_DATA_QUALITY =
  'gameplay approximation; range and field-of-view multipliers are first-order capability differences, not measured optical performance';

const UNAIDED_INFANTRY = Object.freeze({
  id: 'infantry-unaided',
  kind: 'UNAIDED',
  rangeMultiplier: 1,
  acquisitionTimeMultiplier: 1,
  horizontalFovDegrees: 360,
  facingFrame: 'person',
  directionOffsetRadians: 0,
  eyeHeightOffsetMeters: null,
  dataQuality: OBSERVER_CAPABILITY_DATA_QUALITY
});

const OBSERVING_BINOCULARS = Object.freeze({
  id: 'infantry-observing-binoculars',
  kind: 'BINOCULARS',
  rangeMultiplier: 1.45,
  acquisitionTimeMultiplier: 0.58,
  horizontalFovDegrees: 42,
  facingFrame: 'person',
  directionOffsetRadians: 0,
  eyeHeightOffsetMeters: null,
  dataQuality: OBSERVER_CAPABILITY_DATA_QUALITY
});

const LEGACY_VEHICLE_OBSERVER = Object.freeze({
  id: 'vehicle-legacy-unaided',
  kind: 'UNAIDED',
  rangeMultiplier: 1,
  acquisitionTimeMultiplier: 1,
  horizontalFovDegrees: 360,
  facingFrame: 'hull',
  directionOffsetRadians: 0,
  eyeHeightOffsetMeters: null,
  dataQuality:
    'compatibility approximation for injected vehicle specifications without explicit observation stations'
});

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizedStation(station, opticsStatus) {
  const damaged = station.componentId === 'optics'
    && opticsStatus === 'DAMAGED';
  return Object.freeze({
    id: station.id,
    kind: station.kind,
    rangeMultiplier:
      finite(station.rangeMultiplier, 1) * (damaged ? 0.72 : 1),
    acquisitionTimeMultiplier:
      finite(station.acquisitionTimeMultiplier, 1)
        * (damaged ? 1.45 : 1),
    horizontalFovDegrees: finite(station.horizontalFovDegrees, 90),
    facingFrame: station.facingFrame ?? 'hull',
    directionOffsetRadians: finite(station.directionOffsetRadians, 0),
    eyeHeightOffsetMeters: 0,
    dataQuality: station.dataQuality
      ?? OBSERVER_CAPABILITY_DATA_QUALITY
  });
}

export function resolveObserverCapabilities(
  unit,
  person,
  profile = null
) {
  if (!unit?.vehicleSpec) {
    const capabilities = [UNAIDED_INFANTRY];
    if (
      String(person?.state ?? '').toUpperCase() === 'OBSERVING'
      && observerHasEquipment(
        unit,
        person,
        OBSERVATION_EQUIPMENT.BINOCULARS,
        profile
      )
    ) {
      capabilities.push(OBSERVING_BINOCULARS);
    }
    return capabilities;
  }

  const effectiveRole = typeof unit.getEffectiveCrewRole === 'function'
    ? unit.getEffectiveCrewRole(person)
    : person?.role;
  if (!effectiveRole) return [];
  const equipment = unit.vehicleSpec.observationEquipment;
  if (!Array.isArray(equipment?.stations)) {
    return [LEGACY_VEHICLE_OBSERVER];
  }
  const optics = unit.vehicleComponents?.optics;
  const opticsStatus = optics?.status ?? 'OK';
  const capabilities = (equipment?.stations ?? [])
    .filter(station =>
      station.roles.includes(effectiveRole)
      && !(
        station.componentId === 'optics'
        && optics?.installed
        && !optics.operational
      ))
    .map(station => normalizedStation(station, opticsStatus));

  const unbuttoned = equipment?.unbuttonedCommander;
  if (
    unit.vehicleCrewPosture === 'UNBUTTONED'
    && unbuttoned?.role === effectiveRole
    && observerHasEquipment(
      unit,
      person,
      OBSERVATION_EQUIPMENT.BINOCULARS,
      profile
    )
  ) {
    capabilities.push(Object.freeze({
      id: unbuttoned.capability.id,
      kind: 'BINOCULARS',
      rangeMultiplier: unbuttoned.capability.rangeMultiplier,
      acquisitionTimeMultiplier:
        unbuttoned.capability.acquisitionTimeMultiplier,
      horizontalFovDegrees:
        unbuttoned.capability.horizontalFovDegrees,
      facingFrame: unbuttoned.followsTurret ? 'turret' : 'hull',
      directionOffsetRadians: 0,
      eyeHeightOffsetMeters: 0,
      dataQuality: unbuttoned.dataQuality
    }));
  }
  return capabilities;
}

export function observerCapabilityFacingYaw(unit, person, capability) {
  const frame = capability?.facingFrame;
  const base = frame === 'person'
    ? finite(person?.facing, finite(unit?.rotation, 0))
    : finite(unit?.rotation, 0);
  const turret = frame === 'turret'
    ? finite(unit?.vehicleWeapon?.turretYaw, 0)
    : 0;
  return base + turret + finite(capability?.directionOffsetRadians, 0);
}

export function pointInsideObserverFov(
  observerPosition,
  targetPosition,
  facingYaw,
  horizontalFovDegrees
) {
  const fov = Math.max(1, Math.min(360, finite(horizontalFovDegrees, 360)));
  if (fov >= 359.999) return true;
  const dx = finite(targetPosition?.x) - finite(observerPosition?.x);
  const dz = finite(targetPosition?.z) - finite(observerPosition?.z);
  if (Math.hypot(dx, dz) <= 1e-9) return true;
  const targetYaw = Math.atan2(dx, dz);
  const difference = Math.atan2(
    Math.sin(targetYaw - facingYaw),
    Math.cos(targetYaw - facingYaw)
  );
  return Math.abs(difference) <= fov * Math.PI / 360;
}
