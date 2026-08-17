const MODEL_VERSION = 1;
const PRESSURE_WINDOW_SECONDS = 8;
const REVERSE_DISTANCE_METERS = 12;
const DISENGAGE_DISTANCE_METERS = 24;
const SUSTAINED_SUPPRESSION_THRESHOLD = 65;
const PHASES = new Set(['ENGAGE', 'REVERSE', 'DISENGAGE', 'BAILOUT']);

function normalizeSeconds(value) {
  return Math.round(Math.max(0, value) * 1e9) / 1e9;
}

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
  return value;
}

function stableId(value, label) {
  if (!['string', 'number'].includes(typeof value) || String(value).length === 0) {
    throw new TypeError(`${label} must be a stable string or number id`);
  }
  return value;
}

function clonePosition(position) {
  if (!Array.isArray(position) || position.length < 3) return null;
  const result = position.slice(0, 3).map(Number);
  return result.every(Number.isFinite) ? result : null;
}

function cloneState(state) {
  return {
    modelVersion: MODEL_VERSION,
    phase: PHASES.has(state?.phase) ? state.phase : 'ENGAGE',
    reason: typeof state?.reason === 'string' ? state.reason : 'no-active-pressure',
    pressureRemainingSeconds: normalizeSeconds(
      Number(state?.pressureRemainingSeconds) || 0
    ),
    impactCount: Math.max(0, Math.trunc(Number(state?.impactCount) || 0)),
    impactVersion: Math.max(0, Math.trunc(Number(state?.impactVersion) || 0)),
    plannedImpactVersion: Math.max(
      0,
      Math.trunc(Number(state?.plannedImpactVersion) || 0)
    ),
    sourceUnitId: state?.sourceUnitId ?? null,
    sourcePosition: clonePosition(state?.sourcePosition),
    lastImpactPosition: clonePosition(state?.lastImpactPosition),
    weaponId: typeof state?.weaponId === 'string' ? state.weaponId : null,
    threatKind: typeof state?.threatKind === 'string' ? state.threatKind : null,
    penetrated: Boolean(state?.penetrated),
    movementTarget: clonePosition(state?.movementTarget),
    movementComplete: Boolean(state?.movementComplete),
    decisionCrewId: state?.decisionCrewId ?? null,
    decisionCrewRole: typeof state?.decisionCrewRole === 'string'
      ? state.decisionCrewRole
      : null
  };
}

export function createVehicleThreatResponseState(savedState = null) {
  if (savedState?.modelVersion != null && savedState.modelVersion !== MODEL_VERSION) {
    throw new TypeError(
      `unsupported vehicle threat-response model version ${savedState.modelVersion}`
    );
  }
  return cloneState(savedState);
}

export function captureVehicleThreatResponseState(state) {
  return cloneState(state);
}

export function recordVehicleIncomingFire(state, report) {
  const current = cloneState(state);
  const sourceUnitId = stableId(report?.sourceUnitId, 'incoming-fire source');
  const sourcePosition = clonePosition(report?.sourcePosition);
  const impactPosition = clonePosition(report?.impactPosition);
  if (!sourcePosition || !impactPosition) {
    throw new TypeError('incoming vehicle fire requires source and impact positions');
  }
  const continuingEpisode = current.pressureRemainingSeconds > 0;
  return {
    ...current,
    pressureRemainingSeconds: PRESSURE_WINDOW_SECONDS,
    impactCount: continuingEpisode ? current.impactCount + 1 : 1,
    impactVersion: current.impactVersion + 1,
    sourceUnitId,
    sourcePosition,
    lastImpactPosition: impactPosition,
    weaponId: typeof report.weaponId === 'string' ? report.weaponId : null,
    threatKind: typeof report.threatKind === 'string' ? report.threatKind : null,
    penetrated: Boolean(report.penetrated),
    movementComplete: false
  };
}

function responseTarget(position, hullYaw, sourcePosition, distanceMeters) {
  let awayX = position[0] - (sourcePosition?.[0] ?? position[0]);
  let awayZ = position[2] - (sourcePosition?.[2] ?? position[2]);
  const awayLength = Math.hypot(awayX, awayZ);
  if (awayLength <= 1e-9) {
    awayX = -Math.sin(hullYaw);
    awayZ = -Math.cos(hullYaw);
  } else {
    awayX /= awayLength;
    awayZ /= awayLength;
  }
  return [
    position[0] + awayX * distanceMeters,
    position[1],
    position[2] + awayZ * distanceMeters
  ];
}

export function advanceVehicleThreatResponse(state, {
  deltaSeconds,
  position,
  hullYaw,
  sourceIdentified,
  mobilityDisabled,
  mainGunEffective,
  mainGunFailureReason,
  coaxCanAddressThreat,
  suppression,
  hasCommandedMovement,
  decisionCrewId,
  decisionCrewRole
}) {
  const current = cloneState(state);
  const delta = finiteNonNegative(deltaSeconds, 'vehicle threat-response delta');
  const vehiclePosition = clonePosition(position);
  if (!vehiclePosition || !Number.isFinite(hullYaw)) {
    throw new TypeError('vehicle threat response requires position and hull yaw');
  }
  const pressureRemainingSeconds = normalizeSeconds(
    current.pressureRemainingSeconds - delta
  );
  let phase = 'ENGAGE';
  let reason = 'no-active-pressure';

  if (pressureRemainingSeconds > 0) {
    if (mobilityDisabled) {
      phase = 'BAILOUT';
      reason = 'mobility-disabled-under-fire';
    } else if (hasCommandedMovement) {
      reason = 'player-movement-order';
    } else if (!sourceIdentified && current.impactCount >= 2) {
      phase = 'REVERSE';
      reason = 'source-unidentified';
    } else if (!sourceIdentified) {
      reason = 'unidentified-fire-observed';
    } else if (!mainGunEffective && !coaxCanAddressThreat) {
      phase = 'DISENGAGE';
      reason = typeof mainGunFailureReason === 'string'
        ? mainGunFailureReason
        : 'main-gun-disabled';
    } else if (
      current.impactCount >= 2
      || suppression >= SUSTAINED_SUPPRESSION_THRESHOLD
    ) {
      phase = 'REVERSE';
      reason = 'sustained-fire-pressure';
    } else {
      reason = 'threat-answerable';
    }
  }

  let movementTarget = current.movementTarget;
  let movementComplete = current.movementComplete;
  let plannedImpactVersion = current.plannedImpactVersion;
  if (phase === 'REVERSE' || phase === 'DISENGAGE') {
    if (
      phase !== current.phase
      || current.impactVersion !== current.plannedImpactVersion
      || !movementTarget
    ) {
      movementTarget = responseTarget(
        vehiclePosition,
        hullYaw,
        current.sourcePosition,
        phase === 'DISENGAGE'
          ? DISENGAGE_DISTANCE_METERS
          : REVERSE_DISTANCE_METERS
      );
      movementComplete = false;
      plannedImpactVersion = current.impactVersion;
    }
  } else {
    movementTarget = null;
    movementComplete = false;
  }

  const nextState = {
    ...current,
    phase,
    reason,
    pressureRemainingSeconds,
    plannedImpactVersion,
    movementTarget,
    movementComplete,
    decisionCrewId: decisionCrewId ?? null,
    decisionCrewRole: decisionCrewRole ?? null
  };
  if (pressureRemainingSeconds <= 0) {
    nextState.impactCount = 0;
    nextState.sourceUnitId = null;
    nextState.sourcePosition = null;
    nextState.lastImpactPosition = null;
    nextState.weaponId = null;
    nextState.threatKind = null;
    nextState.penetrated = false;
  }
  return nextState;
}

export function completeVehicleThreatResponseMovement(state) {
  const current = cloneState(state);
  return {
    ...current,
    movementComplete: true
  };
}

export function vehicleThreatResponseMovementIntent(state) {
  if (
    !['REVERSE', 'DISENGAGE'].includes(state?.phase)
    || state.movementComplete
    || !state.movementTarget
  ) {
    return null;
  }
  return {
    source: 'vehicle-threat-response',
    phase: state.phase,
    orderType: 'REVERSE',
    position: {
      x: state.movementTarget[0],
      y: state.movementTarget[1],
      z: state.movementTarget[2]
    }
  };
}

export const VEHICLE_THREAT_RESPONSE_MODEL = Object.freeze({
  modelVersion: MODEL_VERSION,
  pressureWindowSeconds: PRESSURE_WINDOW_SECONDS,
  reverseDistanceMeters: REVERSE_DISTANCE_METERS,
  disengageDistanceMeters: DISENGAGE_DISTANCE_METERS,
  sustainedSuppressionThreshold: SUSTAINED_SUPPRESSION_THRESHOLD,
  dataQuality: 'GAMEPLAY_APPROXIMATION'
});
