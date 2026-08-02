import { wrapVehicleYaw, planVehicleKinematicStep } from './VehicleKinematics.js';

function round4(val) {
  return typeof val === 'number' && Number.isFinite(val)
    ? Math.round(val * 10000) / 10000
    : 0;
}

export function selectPrimaryThreat(unit, candidates = []) {
  if (!unit || !Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }
  const uPos = unit.position;
  let bestCandidate = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    if (!candidate) continue;
    const rawPosition = candidate.position
      ?? (candidate.isVector3 || typeof candidate.x === 'number' ? candidate : null);
    const cPos = Array.isArray(rawPosition)
      ? { x: rawPosition[0], y: rawPosition[1] ?? 0, z: rawPosition[2] }
      : rawPosition;
    if (!cPos || !Number.isFinite(cPos.x) || !Number.isFinite(cPos.z)) continue;

    const dx = cPos.x - uPos.x;
    const dz = cPos.z - uPos.z;
    const distSq = dx * dx + dz * dz;
    const dist = Math.sqrt(distSq);

    // Threat scoring: armor/vehicle > gun > infantry; closer > farther
    let categoryScore = 10;
    if (
      candidate.threatClass === 'armor'
      || candidate.type === 'tank'
      || candidate.type === 'vehicle'
      || candidate.vehicleSpec
    ) {
      categoryScore = 100;
    } else if (
      candidate.threatClass === 'crew-served'
      || candidate.type === 'gun'
      || candidate.mortarTeamConfig
    ) {
      categoryScore = 80;
    } else if (
      candidate.threatClass === 'infantry'
      || candidate.type === 'infantry'
      || candidate.type === 'infantry_squad'
      || candidate.soldierAI
    ) {
      categoryScore = 40;
    }

    const distScore = Math.max(0, 500 - dist);
    const totalScore = categoryScore * 100 + distScore;

    const candidateId = candidate.id ?? candidate.unitId ?? 'unknown';
    if (totalScore > bestScore || (totalScore === bestScore && candidateId < (bestCandidate?.id ?? ''))) {
      bestScore = totalScore;
      bestCandidate = {
        id: candidateId,
        position: [round4(cPos.x), round4(cPos.y ?? 0), round4(cPos.z)],
        score: totalScore
      };
    }
  }

  return bestCandidate;
}

export function evaluateVehicleThreatFacing({ unit, contacts = [], threatPosition = null, deltaSeconds = 1 / 30 }) {
  if (!unit || (!unit.vehicleSpec && unit.type !== 'tank' && unit.type !== 'vehicle')) {
    return null;
  }

  const dt = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 1 / 30);
  const isDestroyed = Boolean(unit.vehicleDamageState?.destroyed);
  if (isDestroyed) {
    return {
      reason: 'destroyed',
      threatFacingActive: false,
      threatPosition: null,
      targetThreatId: null,
      frontArmorAligned: false,
      isPillbox: true,
      mobilityDisabled: true,
      gunnerAvailable: false,
      driverAvailable: false
    };
  }
  if (unit.vehicleDamageState?.burning || unit.vehicleDamageState?.secondaryExplosion) {
    return {
      reason: 'vehicle-burning-abandoned',
      threatFacingActive: false,
      threatPosition: null,
      targetThreatId: null,
      frontArmorAligned: false,
      isPillbox: true,
      mobilityDisabled: true,
      gunnerAvailable: false,
      driverAvailable: false
    };
  }

  const driverAvailable = typeof unit.hasOperationalDriver === 'function'
    ? unit.hasOperationalDriver()
    : Boolean(unit.vehicleComponents?.driver?.operational !== false);

  // Turret observation/traverse belongs to the living crew role and traverse
  // mechanism, not to main-gun or breech health. A disabled cannon must not
  // prevent the same gunner from laying a surviving coaxial mount.
  const gunnerAvailable = typeof unit.isCrewRoleAlive === 'function'
    ? unit.isCrewRoleAlive(unit.vehicleSpec?.gunnerRoles ?? [])
    : (typeof unit.hasOperationalGunner === 'function'
        ? unit.hasOperationalGunner()
        : Boolean(unit.vehicleComponents?.gunner?.operational !== false));

  const mobilityDisabled = !driverAvailable;
  const isPillbox = mobilityDisabled;

  // Determine threat position & target ID
  let primaryThreat = null;
  if (threatPosition) {
    const tp = threatPosition.isVector3 || typeof threatPosition.x === 'number'
      ? [threatPosition.x, threatPosition.y ?? 0, threatPosition.z]
      : Array.isArray(threatPosition) ? threatPosition : null;
    if (tp) {
      primaryThreat = {
        id: 'explicit-threat',
        position: [round4(tp[0]), round4(tp[1]), round4(tp[2])]
      };
    }
  } else if (Array.isArray(contacts) && contacts.length > 0) {
    primaryThreat = selectPrimaryThreat(unit, contacts);
  } else if (unit.targetPos) {
    primaryThreat = {
      id: 'target-pos',
      position: [round4(unit.targetPos.x), round4(unit.targetPos.y ?? 0), round4(unit.targetPos.z)]
    };
  }

  if (!primaryThreat) {
    return {
      reason: 'idle',
      threatFacingActive: false,
      threatPosition: null,
      targetThreatId: null,
      frontArmorAligned: false,
      isPillbox,
      mobilityDisabled,
      gunnerAvailable,
      driverAvailable
    };
  }

  const tPos = primaryThreat.position;
  const dx = tPos[0] - unit.position.x;
  const dz = tPos[2] - unit.position.z;
  const desiredWorldYaw = Math.atan2(dx, dz);

  const isMoving = Boolean(
    unit.isMoving
    || (
      Array.isArray(unit.waypoints)
      && Number.isInteger(unit.currentWaypointIndex)
      && unit.currentWaypointIndex < unit.waypoints.length
    )
  );
  const hullGunOwnsFacing = Boolean(
    (unit.targetUnit || unit.targetPos)
    && (unit.vehicleSpec?.weaponMounts ?? []).some(mount =>
      mount.kind === 'cannon'
      && mount.traverse === 'hull'
      && mount.targetModes?.includes(unit.targetMode)
    )
  );
  let frontArmorAligned = false;
  let nextHullYaw = unit.rotation;

  // Hull rotation (if stopped and driver operational)
  if (!isPillbox && !isMoving && !hullGunOwnsFacing) {
    if (unit.vehicleSpec?.mobility) {
      const plan = planVehicleKinematicStep({
        vehicleSpec: unit.vehicleSpec,
        currentYaw: unit.rotation,
        desiredYaw: desiredWorldYaw,
        speedMetersPerSecond: 0,
        targetDistanceMeters: 0,
        deltaSeconds: dt
      });
      nextHullYaw = plan.yaw;
    } else {
      const turnRate = unit.hullTurnRate ?? 0.35;
      const hullDiff = wrapVehicleYaw(desiredWorldYaw - unit.rotation);
      const hullStep = Math.sign(hullDiff) * Math.min(Math.abs(hullDiff), turnRate * dt);
      nextHullYaw = wrapVehicleYaw(unit.rotation + hullStep);
    }
  }

  const hullError = Math.abs(wrapVehicleYaw(desiredWorldYaw - nextHullYaw));
  frontArmorAligned = hullError < 0.20;

  // Turret rotation (if vehicle has turret & gunner operational)
  const turretTraverseRate = unit.vehicleSpec?.turretTraverseRadPerSecond
    ?? (unit.turretTraverseRateDegreesPerSecond ? (unit.turretTraverseRateDegreesPerSecond * Math.PI / 180) : null)
    ?? (unit.turretTraverseRate ?? 0.35);

  let nextTurretYaw = unit.vehicleWeapon?.turretYaw ?? unit.turretRotation ?? 0;
  if (gunnerAvailable && turretTraverseRate > 0 && unit.vehicleComponents?.turret_traverse?.operational !== false) {
    const desiredTurretYaw = wrapVehicleYaw(desiredWorldYaw - nextHullYaw);
    const currentTurretYaw = unit.vehicleWeapon?.turretYaw ?? unit.turretRotation ?? 0;
    const turretDiff = wrapVehicleYaw(desiredTurretYaw - currentTurretYaw);
    const turretStep = Math.sign(turretDiff) * Math.min(Math.abs(turretDiff), turretTraverseRate * dt);
    nextTurretYaw = wrapVehicleYaw(currentTurretYaw + turretStep);
  }

  const reason = (isMoving || hullGunOwnsFacing)
    ? 'threat-turret-traverse'
    : (frontArmorAligned ? 'front-armor-aligned' : 'threat-hull-align');

  return {
    reason,
    threatFacingActive: true,
    threatPosition: tPos,
    targetThreatId: primaryThreat.id,
    frontArmorAligned,
    nextHullYaw,
    nextTurretYaw,
    isPillbox,
    mobilityDisabled,
    gunnerAvailable,
    driverAvailable
  };
}
