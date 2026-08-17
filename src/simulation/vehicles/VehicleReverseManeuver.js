import { wrapVehicleYaw, planVehicleKinematicStep } from './VehicleKinematics.js';

export function shouldVehicleReverse({ unit, orderType, targetPosition, threatPosition, heavyThreat }) {
  if (!unit || (typeof unit.hasOperationalDriver === 'function' && !unit.hasOperationalDriver())) {
    return false;
  }
  if (unit.vehicleDamageState?.destroyed) return false;

  const type = orderType ?? unit.orderType ?? null;
  if (type === 'REVERSE' || type === 'MOVE_REVERSE') {
    return true;
  }

  // A deliberate forward waypoint owns vehicle motion. Threat-response AI may
  // create its own reverse intent while idle, but a generic heavy-fire flag
  // must not silently reinterpret the player's route as a reverse order.
  if (targetPosition) return false;

  if (heavyThreat || unit.vehicleDamageState?.heavyFire) {
    return true;
  }

  return false;
}

export function planVehicleReverseStep({
  vehicleSpec,
  currentYaw,
  currentPosition,
  targetPosition,
  speedMetersPerSecond = 3.5,
  deltaSeconds = 1 / 30
}) {
  if (!currentPosition || !targetPosition) {
    return {
      yaw: currentYaw,
      yawDelta: 0,
      displacement: { x: 0, z: 0 },
      intendedDistanceMeters: 0,
      translationScale: 0,
      driveType: vehicleSpec?.mobility?.driveType ?? 'tracked',
      isReverse: true
    };
  }

  const dx = targetPosition.x - currentPosition.x;
  const dz = targetPosition.z - currentPosition.z;
  const targetDistance = Math.hypot(dx, dz);

  if (targetDistance < 1e-6) {
    return {
      yaw: currentYaw,
      yawDelta: 0,
      displacement: { x: 0, z: 0 },
      intendedDistanceMeters: 0,
      translationScale: 0,
      driveType: vehicleSpec?.mobility?.driveType ?? 'tracked',
      isReverse: true
    };
  }

  // Desired direction for the rear of the vehicle to face target
  const desiredRearYaw = Math.atan2(dx, dz);
  // Desired direction for the front of the vehicle
  const desiredFrontYaw = wrapVehicleYaw(desiredRearYaw + Math.PI);

  // Reverse speed is typically 50% of forward max speed
  const reverseSpeed = Math.max(0, speedMetersPerSecond * 0.5);

  const forwardPlan = planVehicleKinematicStep({
    vehicleSpec,
    currentYaw,
    desiredYaw: desiredFrontYaw,
    speedMetersPerSecond: reverseSpeed,
    targetDistanceMeters: targetDistance,
    deltaSeconds
  });

  // Because the vehicle moves backward, displacement vector is reversed relative to forward facing
  return {
    modelVersion: forwardPlan.modelVersion,
    dataQuality: forwardPlan.dataQuality,
    yaw: forwardPlan.yaw,
    yawDelta: forwardPlan.yawDelta,
    displacement: {
      x: -forwardPlan.displacement.x,
      z: -forwardPlan.displacement.z
    },
    intendedDistanceMeters: -forwardPlan.intendedDistanceMeters,
    translationScale: forwardPlan.translationScale,
    driveType: forwardPlan.driveType,
    isReverse: true
  };
}
