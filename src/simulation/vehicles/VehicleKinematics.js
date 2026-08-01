export const VEHICLE_KINEMATICS_MODEL = 'bounded-steering-v1';

export const VEHICLE_KINEMATICS_DATA_QUALITY = [
  'deterministic first-order gameplay approximation',
  'vehicle-owned minimum turn radius and steering-rate limits',
  'resolved displacement drives track travel; suspension and track slip are not modeled'
].join('; ');

const EPSILON = 1e-9;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function wrapVehicleYaw(angle) {
  return Math.atan2(Math.sin(finite(angle)), Math.cos(finite(angle)));
}

export function createVehicleKinematicsState(saved = null) {
  return {
    modelVersion: VEHICLE_KINEMATICS_MODEL,
    distanceMeters: finite(saved?.distanceMeters),
    leftTrackMeters: finite(saved?.leftTrackMeters),
    rightTrackMeters: finite(saved?.rightTrackMeters)
  };
}

export function captureVehicleKinematicsState(state) {
  return createVehicleKinematicsState(state);
}

function requireMobility(vehicleSpec) {
  const mobility = vehicleSpec?.mobility;
  if (!mobility || !['tracked', 'wheeled'].includes(mobility.driveType)) {
    throw new TypeError(`vehicle ${vehicleSpec?.id ?? 'unknown'} requires tracked or wheeled mobility`);
  }
  if (!(mobility.minimumTurnRadiusMeters > 0)) {
    throw new TypeError(`vehicle ${vehicleSpec.id} requires a positive minimum turn radius`);
  }
  const rate = mobility.driveType === 'tracked'
    ? mobility.pivotTurnRateRadPerSecond
    : mobility.maximumSteerRateRadPerSecond;
  if (!(rate > 0)) {
    throw new TypeError(`vehicle ${vehicleSpec.id} requires a positive steering-rate limit`);
  }
  return mobility;
}

export function planVehicleKinematicStep({
  vehicleSpec,
  currentYaw,
  desiredYaw,
  speedMetersPerSecond,
  targetDistanceMeters,
  deltaSeconds
}) {
  const mobility = requireMobility(vehicleSpec);
  const delta = Math.max(0, finite(deltaSeconds));
  const speed = Math.max(0, finite(speedMetersPerSecond));
  const targetDistance = Math.max(0, finite(targetDistanceMeters));
  const yaw = wrapVehicleYaw(currentYaw);
  const yawError = wrapVehicleYaw(desiredYaw - yaw);
  const radiusRate = speed / mobility.minimumTurnRadiusMeters;
  const configuredRate = mobility.driveType === 'tracked'
    ? mobility.pivotTurnRateRadPerSecond
    : mobility.maximumSteerRateRadPerSecond;
  const turnRate = mobility.driveType === 'tracked'
    ? Math.min(configuredRate, Math.max(configuredRate * 0.28, radiusRate))
    : Math.min(configuredRate, radiusRate);
  const yawStep = clamp(yawError, -turnRate * delta, turnRate * delta);
  const nextYaw = wrapVehicleYaw(yaw + yawStep);
  const alignment = Math.cos(yawError);
  const needsTrackedPivot = mobility.driveType === 'tracked'
    && (
      Math.abs(yawError) > 0.55
      || (
        targetDistance < mobility.minimumTurnRadiusMeters
        && Math.abs(yawError) > 0.35
      )
    );
  const translationScale = mobility.driveType === 'tracked'
    ? (needsTrackedPivot ? 0 : clamp(alignment, 0, 1))
    : clamp(alignment, 0.22, 1);
  const distance = Math.min(targetDistance, speed * delta * translationScale);

  return {
    modelVersion: VEHICLE_KINEMATICS_MODEL,
    dataQuality: VEHICLE_KINEMATICS_DATA_QUALITY,
    yaw: nextYaw,
    yawDelta: yawStep,
    displacement: {
      x: Math.sin(nextYaw) * distance,
      z: Math.cos(nextYaw) * distance
    },
    intendedDistanceMeters: distance,
    translationScale,
    driveType: mobility.driveType
  };
}

export function recordResolvedVehicleTravel(state, {
  vehicleSpec,
  previousYaw,
  nextYaw,
  movedX,
  movedZ
}) {
  if (!state) return null;
  const midpointYaw = wrapVehicleYaw(
    finite(previousYaw) + wrapVehicleYaw(nextYaw - previousYaw) * 0.5
  );
  const forwardDistance =
    finite(movedX) * Math.sin(midpointYaw)
    + finite(movedZ) * Math.cos(midpointYaw);
  state.distanceMeters += forwardDistance;

  if (vehicleSpec?.mobility?.driveType === 'tracked') {
    const gauge = Math.max(
      0.1,
      finite(vehicleSpec.mobility.trackGaugeMeters,
        finite(vehicleSpec.dimensionsMeters?.width, 2) * 0.72)
    );
    const yawDelta = wrapVehicleYaw(nextYaw - previousYaw);
    state.leftTrackMeters += forwardDistance + yawDelta * gauge * 0.5;
    state.rightTrackMeters += forwardDistance - yawDelta * gauge * 0.5;
  }
  return state;
}
