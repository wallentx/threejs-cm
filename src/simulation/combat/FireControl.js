const AIM_EPSILON = 1e-9;
const FIRE_CONTROL_MODEL_VERSION = 'deterministic-fire-control-v1';

const EXPERIENCE_FACTORS = Object.freeze({
  Green: 1.35,
  Regular: 1,
  Veteran: 0.82,
  Crack: 0.7
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNonNegative(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function hash01(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

function positionComponent(position, key, index) {
  if (Array.isArray(position)) return position[index];
  return position?.[key];
}

function quantizeCoordinate(value) {
  return Math.round((Number(value) || 0) * 4) / 4;
}

function baseAimSeconds(weapon, platform) {
  if (platform === 'vehicle-main') {
    if ((weapon?.caliberMm ?? 0) >= 60) return 1.45;
    if ((weapon?.caliberMm ?? 0) >= 25) return 1.15;
    return weapon?.burstSize > 1 ? 0.72 : 0.92;
  }
  if (platform === 'vehicle-mount') return 0.52;
  if (weapon?.kind === 'submachine_gun') return 0.34;
  if (weapon?.kind === 'machine_gun') return 0.74;
  if (weapon?.kind?.startsWith('cannon')) return 0.82;
  return 0.62;
}

function stanceFactor(stance, platform) {
  if (platform !== 'infantry') return 1;
  if (stance === 'PRONE') return 0.88;
  if (stance === 'KNEELING' || stance === 'CROUCHED') return 0.94;
  return 1.06;
}

function opticsFactor(status, platform) {
  if (platform === 'infantry') return 1;
  if (status === 'DESTROYED') return 2.4;
  if (status === 'DAMAGED') return 1.65;
  return 1;
}

function rangeErrorBase(platform) {
  if (platform === 'vehicle-main') return 0.025;
  if (platform === 'vehicle-mount') return 0.045;
  return 0.065;
}

export function createFireControlState(saved = null) {
  const targetKey = typeof saved?.targetKey === 'string' && saved.targetKey.length > 0
    ? saved.targetKey
    : null;
  return {
    modelVersion: FIRE_CONTROL_MODEL_VERSION,
    targetKey,
    phase: typeof saved?.phase === 'string'
      ? saved.phase
      : (targetKey ? 'AIMING' : 'IDLE'),
    aimProgressSeconds: finiteNonNegative(saved?.aimProgressSeconds),
    aimRequiredSeconds: finiteNonNegative(saved?.aimRequiredSeconds),
    estimatedRangeMeters: Number.isFinite(saved?.estimatedRangeMeters)
      ? Math.max(0, saved.estimatedRangeMeters)
      : null,
    rangeErrorMeters: Number.isFinite(saved?.rangeErrorMeters)
      ? saved.rangeErrorMeters
      : null
  };
}

export function captureFireControlState(state) {
  return createFireControlState(state);
}

export function resetFireControlState(state, phase = 'IDLE') {
  Object.assign(state, {
    modelVersion: FIRE_CONTROL_MODEL_VERSION,
    targetKey: null,
    phase,
    aimProgressSeconds: 0,
    aimRequiredSeconds: 0,
    estimatedRangeMeters: null,
    rangeErrorMeters: null
  });
  return state;
}

export function createFireControlTargetKey({
  targetUnitId = null,
  targetSoldierId = null,
  targetPosition = null
} = {}) {
  if (targetUnitId != null) {
    return `unit:${String(targetUnitId)}:soldier:${targetSoldierId == null ? '-' : String(targetSoldierId)}`;
  }
  if (!targetPosition) return null;
  return [
    'point',
    quantizeCoordinate(positionComponent(targetPosition, 'x', 0)),
    quantizeCoordinate(positionComponent(targetPosition, 'y', 1)),
    quantizeCoordinate(positionComponent(targetPosition, 'z', 2))
  ].join(':');
}

export function calculateAimRequirement({
  weapon,
  rangeMeters,
  platform = 'infantry',
  experience = 'Regular',
  stance = 'STANDING',
  suppression = 0,
  wounded = false,
  targetMoving = false,
  opticsStatus = 'OK'
} = {}) {
  if (!weapon) throw new TypeError('calculateAimRequirement requires a weapon');
  const range = finiteNonNegative(rangeMeters);
  const maxRange = Math.max(1, finiteNonNegative(weapon.maxRange, 1));
  const rangeRatio = clamp(range / maxRange, 0, 2);
  const rangeFactor = 0.65 + Math.sqrt(rangeRatio) * 0.75;
  const experienceFactor = EXPERIENCE_FACTORS[experience] ?? EXPERIENCE_FACTORS.Regular;
  const suppressionFactor = 1 + clamp(suppression, 0, 100) / 100 * 1.15;
  const targetMotionFactor = targetMoving ? 1.18 : 1;
  const woundedFactor = wounded ? 1.3 : 1;
  return clamp(
    baseAimSeconds(weapon, platform)
      * rangeFactor
      * experienceFactor
      * stanceFactor(stance, platform)
      * suppressionFactor
      * targetMotionFactor
      * woundedFactor
      * opticsFactor(opticsStatus, platform),
    0.18,
    8
  );
}

export function calculateRangeEstimate({
  shooterKey,
  targetKey,
  weapon,
  trueRangeMeters,
  aimProgressRatio = 0,
  platform = 'infantry',
  experience = 'Regular',
  suppression = 0,
  targetMoving = false,
  opticsStatus = 'OK'
} = {}) {
  if (!weapon) throw new TypeError('calculateRangeEstimate requires a weapon');
  const trueRange = finiteNonNegative(trueRangeMeters);
  if (trueRange === 0) return { estimatedRangeMeters: 0, rangeErrorMeters: 0 };
  const maxRange = Math.max(1, finiteNonNegative(weapon.maxRange, 1));
  const rangeRatio = clamp(trueRange / maxRange, 0, 2);
  const experienceFactor = EXPERIENCE_FACTORS[experience] ?? EXPERIENCE_FACTORS.Regular;
  const suppressionFactor = 1 + clamp(suppression, 0, 100) / 100;
  const targetMotionFactor = targetMoving ? 1.2 : 1;
  const opticalFactor = opticsFactor(opticsStatus, platform);
  const errorFraction = clamp(
    rangeErrorBase(platform)
      * (0.65 + rangeRatio)
      * experienceFactor
      * suppressionFactor
      * targetMotionFactor
      * Math.sqrt(opticalFactor),
    0.006,
    0.35
  );
  const convergence = 1 - clamp(aimProgressRatio, 0, 1) * 0.45;
  const signedVariation = hash01(
    `${String(shooterKey)}|${String(targetKey)}|${weapon.id ?? weapon.kind ?? 'weapon'}|range`
  ) * 2 - 1;
  const rangeErrorMeters = trueRange * errorFraction * convergence * signedVariation;
  return {
    estimatedRangeMeters: Math.max(0, trueRange + rangeErrorMeters),
    rangeErrorMeters
  };
}

export function advanceFireControlState(state, {
  deltaSeconds,
  shooterKey,
  targetKey,
  weapon,
  trueRangeMeters,
  platform = 'infantry',
  experience = 'Regular',
  stance = 'STANDING',
  suppression = 0,
  wounded = false,
  targetMoving = false,
  opticsStatus = 'OK',
  canAim = true,
  blockedPhase = 'SLEWING'
} = {}) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('advanceFireControlState requires mutable state');
  }
  if (!targetKey || !weapon) {
    resetFireControlState(state);
    return {
      ready: false,
      becameReady: false,
      targetChanged: false,
      overshootSeconds: 0,
      dispersionScale: 1
    };
  }

  const elapsed = finiteNonNegative(deltaSeconds);
  const targetChanged = state.targetKey !== targetKey;
  const previousRequired = finiteNonNegative(state.aimRequiredSeconds);
  const wasReady = !targetChanged
    && previousRequired > 0
    && finiteNonNegative(state.aimProgressSeconds) + AIM_EPSILON >= previousRequired;
  if (targetChanged) {
    state.targetKey = targetKey;
    state.aimProgressSeconds = 0;
    state.phase = 'ACQUIRING';
  }

  state.modelVersion = FIRE_CONTROL_MODEL_VERSION;
  state.aimRequiredSeconds = calculateAimRequirement({
    weapon,
    rangeMeters: trueRangeMeters,
    platform,
    experience,
    stance,
    suppression,
    wounded,
    targetMoving,
    opticsStatus
  });

  let rawProgress = finiteNonNegative(state.aimProgressSeconds);
  if (!canAim) {
    state.aimProgressSeconds = Math.max(
      0,
      rawProgress - elapsed * 0.5
    );
    state.phase = blockedPhase;
  } else {
    rawProgress += elapsed;
    state.aimProgressSeconds = Math.min(state.aimRequiredSeconds, rawProgress);
    state.phase = rawProgress + AIM_EPSILON >= state.aimRequiredSeconds
      ? 'READY'
      : 'AIMING';
  }

  const aimProgressRatio = state.aimRequiredSeconds > 0
    ? state.aimProgressSeconds / state.aimRequiredSeconds
    : 0;
  const estimate = calculateRangeEstimate({
    shooterKey,
    targetKey,
    weapon,
    trueRangeMeters,
    aimProgressRatio,
    platform,
    experience,
    suppression,
    targetMoving,
    opticsStatus
  });
  state.estimatedRangeMeters = estimate.estimatedRangeMeters;
  state.rangeErrorMeters = estimate.rangeErrorMeters;

  const ready = canAim
    && state.aimProgressSeconds + AIM_EPSILON >= state.aimRequiredSeconds;
  const becameReady = ready && !wasReady;
  const overshootSeconds = becameReady
    ? Math.max(0, rawProgress - state.aimRequiredSeconds)
    : 0;
  const relativeRangeError = Math.abs(state.rangeErrorMeters ?? 0)
    / Math.max(1, finiteNonNegative(trueRangeMeters, 1));

  return {
    ready,
    becameReady,
    targetChanged,
    overshootSeconds: Math.min(elapsed, overshootSeconds),
    dispersionScale: 1 + clamp(relativeRangeError * 1.8, 0, 0.6)
  };
}

export function recordFireControlShot(state, weapon, {
  platform = 'infantry',
  burstComplete = true
} = {}) {
  if (!state?.targetKey || !(state.aimRequiredSeconds > 0)) return state;
  if (!burstComplete) {
    state.phase = 'TRACKING';
    return state;
  }
  const retention = platform === 'vehicle-main'
    ? 0.62
    : platform === 'vehicle-mount'
      ? 0.94
      : weapon?.kind === 'rifle'
        ? 0.72
        : 0.9;
  state.aimProgressSeconds = state.aimRequiredSeconds * retention;
  state.phase = 'TRACKING';
  return state;
}

export { FIRE_CONTROL_MODEL_VERSION };
