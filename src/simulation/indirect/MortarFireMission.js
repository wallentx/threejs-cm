const MODEL_VERSION = 'mortar-fire-mission-v1';
const TIMER_EPSILON_SECONDS = 1e-9;
const MAX_EVENT_HISTORY_LIMIT = 256;

const ACTIVE_PHASES = new Set([
  'REQUESTING',
  'RANGING',
  'AWAITING_RANGING_OBSERVATION',
  'CORRECTING',
  'FIRE_FOR_EFFECT'
]);

const MISSION_PHASES = new Set([
  ...ACTIVE_PHASES,
  'COMPLETE',
  'CANCELLED'
]);

const UNAVAILABLE_OBSERVER_STATUSES = new Set([
  'KIA',
  'DEAD',
  'INCAPACITATED'
]);

export const DEFAULT_MORTAR_FIRE_MISSION_CONFIG = Object.freeze({
  requestDelaySeconds: 2,
  correctionDelaySeconds: 3,
  correctionGain: 0.75,
  eventHistoryLimit: 64,
  timingDataQuality: 'gameplay approximation',
  correctionDataQuality: 'gameplay approximation'
});

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  return value;
}

function requireStableId(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a stable non-empty id`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be boolean`);
  }
  return value;
}

function finitePoint(value, label) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || !value.every(Number.isFinite)
  ) {
    throw new TypeError(`${label} must contain exactly three finite coordinates`);
  }
  return value.slice();
}

function finiteHorizontalVector(value, label) {
  if (
    !Array.isArray(value)
    || value.length !== 2
    || !value.every(Number.isFinite)
  ) {
    throw new TypeError(`${label} must contain exactly two finite coordinates`);
  }
  return value.slice();
}

function clonePlain(value, label = 'mortar fire-mission value') {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${label} numbers must be finite`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      clonePlain(entry, `${label}[${index}]`)
    );
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} must contain only plain records`);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        clonePlain(entry, `${label}.${key}`)
      ])
    );
  }
  throw new TypeError(`${label} must contain only plain serializable values`);
}

function requireApproximationLabel(value, label) {
  if (
    typeof value !== 'string'
    || !value.toLowerCase().includes('gameplay approximation')
  ) {
    throw new TypeError(`${label} must explicitly identify a gameplay approximation`);
  }
  return value;
}

export function validateMortarFireMissionConfig(config) {
  requireRecord(config, 'mortar fire-mission config');
  for (const field of ['requestDelaySeconds', 'correctionDelaySeconds']) {
    if (!Number.isFinite(config[field]) || config[field] <= 0) {
      throw new TypeError(`${field} must be positive simulation seconds`);
    }
  }
  if (
    !Number.isFinite(config.correctionGain)
    || config.correctionGain <= 0
    || config.correctionGain > 1
  ) {
    throw new TypeError('correctionGain must be finite and in (0, 1]');
  }
  if (
    !Number.isSafeInteger(config.eventHistoryLimit)
    || config.eventHistoryLimit <= 0
    || config.eventHistoryLimit > MAX_EVENT_HISTORY_LIMIT
  ) {
    throw new TypeError(
      `eventHistoryLimit must be a safe integer from 1 to ${MAX_EVENT_HISTORY_LIMIT}`
    );
  }
  requireApproximationLabel(
    config.timingDataQuality,
    'timingDataQuality'
  );
  requireApproximationLabel(
    config.correctionDataQuality,
    'correctionDataQuality'
  );
  return config;
}

function validateRequest(request) {
  requireRecord(request, 'mortar fire-mission request');
  requireStableId(request.missionId, 'mortar missionId');
  requireStableId(request.observerId, 'mortar observerId');
  requireStableId(request.teamId, 'mortar teamId');
  requireStableId(request.targetId, 'mortar targetId');
  finitePoint(request.targetPoint, 'mortar targetPoint');
  if (
    !Number.isSafeInteger(request.fireForEffectRounds)
    || request.fireForEffectRounds <= 0
  ) {
    throw new TypeError(
      'mortar fireForEffectRounds must be a positive safe integer'
    );
  }
  return request;
}

function validateOperationalContext(context) {
  requireRecord(context, 'mortar operational context');
  const observer = requireRecord(context.observer, 'mortar observer context');
  const team = requireRecord(context.team, 'mortar team context');
  const target = requireRecord(context.target, 'mortar target context');
  const communications = requireRecord(
    context.communications,
    'mortar communications context'
  );
  const trajectory = requireRecord(
    context.trajectory,
    'mortar trajectory context'
  );

  requireStableId(observer.id, 'mortar observer context id');
  if (!Number.isFinite(observer.health) || observer.health < 0) {
    throw new TypeError('mortar observer health must be finite and non-negative');
  }
  if (typeof observer.status !== 'string' || observer.status.length === 0) {
    throw new TypeError('mortar observer status must be a non-empty string');
  }
  requireBoolean(observer.available, 'mortar observer available');

  requireStableId(team.id, 'mortar team context id');
  requireBoolean(team.available, 'mortar team available');

  requireStableId(target.id, 'mortar target context id');
  requireBoolean(target.valid, 'mortar target valid');
  requireBoolean(target.observable, 'mortar target observable');

  requireStableId(
    communications.observerId,
    'mortar communications observerId'
  );
  requireStableId(
    communications.teamId,
    'mortar communications teamId'
  );
  requireBoolean(
    communications.authorized,
    'mortar communications authorized'
  );
  requireBoolean(
    communications.operational,
    'mortar communications operational'
  );

  requireBoolean(
    trajectory.solutionAvailable,
    'mortar trajectory solutionAvailable'
  );
  for (const field of [
    'horizontalRangeMeters',
    'minimumRangeMeters',
    'maximumRangeMeters'
  ]) {
    if (!Number.isFinite(trajectory[field]) || trajectory[field] < 0) {
      throw new TypeError(`mortar trajectory ${field} must be finite and non-negative`);
    }
  }
  if (trajectory.maximumRangeMeters <= trajectory.minimumRangeMeters) {
    throw new TypeError(
      'mortar trajectory maximumRangeMeters must exceed minimumRangeMeters'
    );
  }

  return context;
}

function evaluateOperationalGate(context, identities) {
  validateOperationalContext(context);

  if (context.observer.id !== identities.observerId) {
    return 'OBSERVER_ID_MISMATCH';
  }
  if (
    !context.observer.available
    || context.observer.health <= 0
    || UNAVAILABLE_OBSERVER_STATUSES.has(context.observer.status.toUpperCase())
  ) {
    return 'OBSERVER_UNAVAILABLE';
  }
  if (
    context.communications.observerId !== identities.observerId
    || context.communications.teamId !== identities.teamId
  ) {
    return 'COMMUNICATIONS_ROUTE_MISMATCH';
  }
  if (!context.communications.authorized) {
    return 'NOT_AUTHORIZED';
  }
  if (!context.communications.operational) {
    return 'COMMUNICATIONS_BROKEN';
  }
  if (context.target.id !== identities.targetId || !context.target.valid) {
    return 'TARGET_INVALID';
  }
  if (!context.target.observable) {
    return 'TARGET_UNOBSERVABLE';
  }
  if (context.team.id !== identities.teamId || !context.team.available) {
    return 'TEAM_UNAVAILABLE';
  }
  if (!context.trajectory.solutionAvailable) {
    return 'NO_TRAJECTORY_SOLUTION';
  }
  if (
    context.trajectory.horizontalRangeMeters
      < context.trajectory.minimumRangeMeters
    || context.trajectory.horizontalRangeMeters
      > context.trajectory.maximumRangeMeters
  ) {
    return 'OUT_OF_RANGE';
  }
  return null;
}

function missionIdentities(mission) {
  return {
    observerId: mission.observerId,
    teamId: mission.teamId,
    targetId: mission.targetId
  };
}

function phaseOf(state) {
  return state.mission?.phase ?? 'IDLE';
}

function appendEvent(state, config, type, payload = {}) {
  const mission = state.mission;
  const event = {
    sequence: ++state.eventSequence,
    type,
    missionId: mission.missionId,
    observerId: mission.observerId,
    teamId: mission.teamId,
    targetId: mission.targetId,
    phase: mission.phase,
    ...clonePlain(payload, 'mortar event payload')
  };
  state.events.push(event);
  if (state.events.length > config.eventHistoryLimit) {
    state.events.splice(0, state.events.length - config.eventHistoryLimit);
  }
  return clonePlain(event);
}

function correctedAimPoint(mission) {
  return [
    mission.targetPoint[0] + mission.correctionMeters[0],
    mission.targetPoint[1],
    mission.targetPoint[2] + mission.correctionMeters[1]
  ];
}

function createPendingShot(mission, kind) {
  const roundIndex = kind === 'RANGING'
    ? mission.rangingShotsFired + 1
    : mission.fireForEffectShotsFired + 1;
  const segment = kind === 'RANGING' ? 'ranging' : 'effect';
  return {
    missionId: mission.missionId,
    shotId: `${mission.missionId}:${segment}:${roundIndex}`,
    kind,
    roundIndex,
    observerId: mission.observerId,
    teamId: mission.teamId,
    targetId: mission.targetId,
    aimPoint: correctedAimPoint(mission),
    correctionMeters: mission.correctionMeters.slice()
  };
}

function cancelActiveMission(state, config, reason) {
  const mission = state.mission;
  if (!mission || !ACTIVE_PHASES.has(mission.phase)) {
    return {
      cancelled: false,
      reason: 'NO_ACTIVE_MISSION',
      phase: phaseOf(state)
    };
  }
  const previousPhase = mission.phase;
  mission.phase = 'CANCELLED';
  mission.phaseRemainingSeconds = 0;
  mission.pendingShot = null;
  mission.awaitingObservationShotId = null;
  mission.cancellationReason = reason;
  appendEvent(state, config, 'MISSION_CANCELLED', {
    reason,
    previousPhase
  });
  return {
    cancelled: true,
    reason,
    phase: mission.phase
  };
}

export function createMortarFireMissionState(
  config = DEFAULT_MORTAR_FIRE_MISSION_CONFIG
) {
  validateMortarFireMissionConfig(config);
  return {
    version: MODEL_VERSION,
    eventSequence: 0,
    events: [],
    mission: null
  };
}

export function requestMortarFireMission(
  state,
  config,
  request,
  context
) {
  validateMortarFireMissionConfig(config);
  validateMortarFireMissionState(state, config);
  validateRequest(request);

  if (state.mission && ACTIVE_PHASES.has(state.mission.phase)) {
    return {
      accepted: false,
      reason: 'MISSION_ACTIVE',
      missionId: state.mission.missionId
    };
  }

  const rejection = evaluateOperationalGate(context, request);
  if (rejection) {
    return {
      accepted: false,
      reason: rejection,
      missionId: request.missionId
    };
  }

  state.mission = {
    missionId: request.missionId,
    observerId: request.observerId,
    teamId: request.teamId,
    targetId: request.targetId,
    targetPoint: finitePoint(request.targetPoint, 'mortar targetPoint'),
    phase: 'REQUESTING',
    phaseRemainingSeconds: config.requestDelaySeconds,
    fireForEffectRoundsRequested: request.fireForEffectRounds,
    rangingShotsFired: 0,
    fireForEffectShotsFired: 0,
    correctionMeters: [0, 0],
    lastObservedImpactPoint: null,
    lastObservedMissMeters: null,
    lastAppliedCorrectionMeters: null,
    pendingShot: null,
    awaitingObservationShotId: null,
    cancellationReason: null,
    timingDataQuality: config.timingDataQuality,
    correctionDataQuality: config.correctionDataQuality
  };
  appendEvent(state, config, 'MISSION_REQUESTED', {
    fireForEffectRounds: request.fireForEffectRounds,
    targetPoint: state.mission.targetPoint
  });
  return {
    accepted: true,
    reason: 'ACCEPTED',
    missionId: request.missionId
  };
}

function completeTimedTransition(state, config, context) {
  const mission = state.mission;
  const rejection = evaluateOperationalGate(
    context,
    missionIdentities(mission)
  );
  if (rejection) {
    cancelActiveMission(state, config, rejection);
    return;
  }

  if (mission.phase === 'REQUESTING') {
    mission.phase = 'RANGING';
    mission.phaseRemainingSeconds = 0;
    mission.pendingShot = createPendingShot(mission, 'RANGING');
    appendEvent(state, config, 'RANGING_SHOT_READY', {
      shotId: mission.pendingShot.shotId,
      aimPoint: mission.pendingShot.aimPoint,
      correctionMeters: mission.pendingShot.correctionMeters
    });
    return;
  }

  if (mission.phase === 'CORRECTING') {
    mission.phase = 'FIRE_FOR_EFFECT';
    mission.phaseRemainingSeconds = 0;
    mission.pendingShot = createPendingShot(mission, 'FIRE_FOR_EFFECT');
    appendEvent(state, config, 'FIRE_FOR_EFFECT_SHOT_READY', {
      shotId: mission.pendingShot.shotId,
      roundIndex: mission.pendingShot.roundIndex,
      aimPoint: mission.pendingShot.aimPoint,
      correctionMeters: mission.pendingShot.correctionMeters
    });
  }
}

export function advanceMortarFireMission(
  state,
  config,
  deltaSeconds,
  context
) {
  validateMortarFireMissionConfig(config);
  validateMortarFireMissionState(state, config);
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new TypeError(
      'mortar fire-mission deltaSeconds must be finite simulation seconds'
    );
  }

  const mission = state.mission;
  if (
    !mission
    || !['REQUESTING', 'CORRECTING'].includes(mission.phase)
    || deltaSeconds === 0
  ) {
    return {
      phase: phaseOf(state),
      pendingShot: getPendingMortarFireMissionShot(state)
    };
  }

  if (deltaSeconds + TIMER_EPSILON_SECONDS < mission.phaseRemainingSeconds) {
    mission.phaseRemainingSeconds -= deltaSeconds;
  } else {
    mission.phaseRemainingSeconds = 0;
    completeTimedTransition(state, config, context);
  }

  return {
    phase: phaseOf(state),
    pendingShot: getPendingMortarFireMissionShot(state)
  };
}

export function getPendingMortarFireMissionShot(state) {
  if (!state?.mission?.pendingShot) return null;
  return clonePlain(
    state.mission.pendingShot,
    'mortar pending shot'
  );
}

export function recordMortarFireMissionShot(
  state,
  config,
  shotId,
  context
) {
  validateMortarFireMissionConfig(config);
  validateMortarFireMissionState(state, config);
  requireStableId(shotId, 'mortar fired shotId');

  const mission = state.mission;
  if (
    !mission
    || !['RANGING', 'FIRE_FOR_EFFECT'].includes(mission.phase)
    || !mission.pendingShot
  ) {
    return {
      accepted: false,
      reason: 'NO_PENDING_SHOT',
      shot: null
    };
  }
  if (mission.pendingShot.shotId !== shotId) {
    return {
      accepted: false,
      reason: 'SHOT_ID_MISMATCH',
      shot: null
    };
  }

  const rejection = evaluateOperationalGate(
    context,
    missionIdentities(mission)
  );
  if (rejection) {
    return {
      accepted: false,
      reason: rejection,
      shot: null
    };
  }

  const firedShot = getPendingMortarFireMissionShot(state);
  mission.pendingShot = null;
  if (firedShot.kind === 'RANGING') {
    mission.rangingShotsFired++;
    mission.awaitingObservationShotId = firedShot.shotId;
    mission.phase = 'AWAITING_RANGING_OBSERVATION';
    appendEvent(state, config, 'RANGING_SHOT_FIRED', {
      shotId: firedShot.shotId,
      aimPoint: firedShot.aimPoint
    });
  } else {
    mission.fireForEffectShotsFired++;
    appendEvent(state, config, 'FIRE_FOR_EFFECT_SHOT_FIRED', {
      shotId: firedShot.shotId,
      roundIndex: firedShot.roundIndex,
      aimPoint: firedShot.aimPoint
    });
    if (
      mission.fireForEffectShotsFired
      >= mission.fireForEffectRoundsRequested
    ) {
      mission.phase = 'COMPLETE';
      appendEvent(state, config, 'MISSION_COMPLETED', {
        rangingShotsFired: mission.rangingShotsFired,
        fireForEffectShotsFired: mission.fireForEffectShotsFired
      });
    } else {
      mission.pendingShot = createPendingShot(
        mission,
        'FIRE_FOR_EFFECT'
      );
      appendEvent(state, config, 'FIRE_FOR_EFFECT_SHOT_READY', {
        shotId: mission.pendingShot.shotId,
        roundIndex: mission.pendingShot.roundIndex,
        aimPoint: mission.pendingShot.aimPoint,
        correctionMeters: mission.pendingShot.correctionMeters
      });
    }
  }

  return {
    accepted: true,
    reason: 'FIRED',
    shot: firedShot
  };
}

export function recordMortarObservedImpact(
  state,
  config,
  report,
  context
) {
  validateMortarFireMissionConfig(config);
  validateMortarFireMissionState(state, config);
  requireRecord(report, 'mortar observed-impact report');
  requireStableId(report.shotId, 'mortar observed-impact shotId');
  requireStableId(report.observerId, 'mortar observed-impact observerId');
  requireBoolean(report.observed, 'mortar observed-impact observed');
  const impactPoint = finitePoint(
    report.impactPoint,
    'mortar observed-impact point'
  );

  const mission = state.mission;
  if (!mission || mission.phase !== 'AWAITING_RANGING_OBSERVATION') {
    return {
      accepted: false,
      reason: 'NOT_AWAITING_OBSERVATION'
    };
  }
  if (
    report.shotId !== mission.awaitingObservationShotId
    || report.observerId !== mission.observerId
  ) {
    return {
      accepted: false,
      reason: 'OBSERVATION_ID_MISMATCH'
    };
  }
  if (!report.observed) {
    return {
      accepted: false,
      reason: 'IMPACT_UNOBSERVABLE'
    };
  }

  const rejection = evaluateOperationalGate(
    context,
    missionIdentities(mission)
  );
  if (rejection) {
    return {
      accepted: false,
      reason: rejection
    };
  }

  const observedErrorMeters = [
    mission.targetPoint[0] - impactPoint[0],
    mission.targetPoint[2] - impactPoint[2]
  ];
  const appliedCorrectionMeters = observedErrorMeters.map(
    error => error * config.correctionGain
  );
  mission.correctionMeters[0] += appliedCorrectionMeters[0];
  mission.correctionMeters[1] += appliedCorrectionMeters[1];
  mission.lastObservedImpactPoint = impactPoint;
  mission.lastObservedMissMeters = Math.hypot(...observedErrorMeters);
  mission.lastAppliedCorrectionMeters = appliedCorrectionMeters;
  mission.awaitingObservationShotId = null;
  mission.phase = 'CORRECTING';
  mission.phaseRemainingSeconds = config.correctionDelaySeconds;
  appendEvent(state, config, 'CORRECTION_RECORDED', {
    shotId: report.shotId,
    impactPoint,
    observedErrorMeters,
    appliedCorrectionMeters,
    correctionMeters: mission.correctionMeters,
    correctionGain: config.correctionGain,
    dataQuality: config.correctionDataQuality
  });

  return {
    accepted: true,
    reason: 'CORRECTION_RECORDED',
    correctionMeters: mission.correctionMeters.slice(),
    correctedAimPoint: correctedAimPoint(mission)
  };
}

export function cancelMortarFireMission(
  state,
  config,
  reason = 'USER_CANCELLED'
) {
  validateMortarFireMissionConfig(config);
  validateMortarFireMissionState(state, config);
  requireStableId(reason, 'mortar cancellation reason');
  return cancelActiveMission(state, config, reason);
}

function validatePendingShot(shot, mission) {
  requireRecord(shot, 'mortar pending shot');
  for (const [field, expected] of [
    ['missionId', mission.missionId],
    ['observerId', mission.observerId],
    ['teamId', mission.teamId],
    ['targetId', mission.targetId]
  ]) {
    if (shot[field] !== expected) {
      throw new Error(`mortar pending shot ${field} must match its mission`);
    }
  }
  requireStableId(shot.shotId, 'mortar pending shotId');
  if (!['RANGING', 'FIRE_FOR_EFFECT'].includes(shot.kind)) {
    throw new Error(`invalid mortar pending shot kind ${shot.kind}`);
  }
  if (!Number.isSafeInteger(shot.roundIndex) || shot.roundIndex <= 0) {
    throw new TypeError('mortar pending shot roundIndex must be positive');
  }
  finitePoint(shot.aimPoint, 'mortar pending shot aimPoint');
  finiteHorizontalVector(
    shot.correctionMeters,
    'mortar pending shot correctionMeters'
  );
}

function validateMission(mission) {
  requireRecord(mission, 'mortar mission state');
  for (const field of ['missionId', 'observerId', 'teamId', 'targetId']) {
    requireStableId(mission[field], `mortar mission ${field}`);
  }
  finitePoint(mission.targetPoint, 'mortar mission targetPoint');
  if (!MISSION_PHASES.has(mission.phase)) {
    throw new Error(`invalid mortar mission phase ${mission.phase}`);
  }
  if (
    !Number.isFinite(mission.phaseRemainingSeconds)
    || mission.phaseRemainingSeconds < 0
  ) {
    throw new TypeError(
      'mortar mission phaseRemainingSeconds must be finite and non-negative'
    );
  }
  if (
    !Number.isSafeInteger(mission.fireForEffectRoundsRequested)
    || mission.fireForEffectRoundsRequested <= 0
  ) {
    throw new TypeError(
      'mortar mission requested rounds must be a positive safe integer'
    );
  }
  for (const field of ['rangingShotsFired', 'fireForEffectShotsFired']) {
    if (!Number.isSafeInteger(mission[field]) || mission[field] < 0) {
      throw new TypeError(`mortar mission ${field} must be non-negative`);
    }
  }
  if (
    mission.fireForEffectShotsFired
    > mission.fireForEffectRoundsRequested
  ) {
    throw new Error('mortar mission fired more effect rounds than requested');
  }
  finiteHorizontalVector(
    mission.correctionMeters,
    'mortar mission correctionMeters'
  );
  if (mission.lastObservedImpactPoint !== null) {
    finitePoint(
      mission.lastObservedImpactPoint,
      'mortar mission lastObservedImpactPoint'
    );
  }
  if (
    mission.lastObservedMissMeters !== null
    && (
      !Number.isFinite(mission.lastObservedMissMeters)
      || mission.lastObservedMissMeters < 0
    )
  ) {
    throw new TypeError(
      'mortar mission lastObservedMissMeters must be finite and non-negative'
    );
  }
  if (mission.lastAppliedCorrectionMeters !== null) {
    finiteHorizontalVector(
      mission.lastAppliedCorrectionMeters,
      'mortar mission lastAppliedCorrectionMeters'
    );
  }
  if (mission.pendingShot !== null) {
    validatePendingShot(mission.pendingShot, mission);
  }
  if (mission.awaitingObservationShotId !== null) {
    requireStableId(
      mission.awaitingObservationShotId,
      'mortar mission awaitingObservationShotId'
    );
  }
  if (mission.cancellationReason !== null) {
    requireStableId(
      mission.cancellationReason,
      'mortar mission cancellationReason'
    );
  }
  requireApproximationLabel(
    mission.timingDataQuality,
    'mortar mission timingDataQuality'
  );
  requireApproximationLabel(
    mission.correctionDataQuality,
    'mortar mission correctionDataQuality'
  );

  const timed = ['REQUESTING', 'CORRECTING'].includes(mission.phase);
  if (timed && mission.phaseRemainingSeconds <= 0) {
    throw new Error(`mortar ${mission.phase} phase requires remaining time`);
  }
  if (!timed && mission.phaseRemainingSeconds !== 0) {
    throw new Error(`mortar ${mission.phase} phase cannot retain transition time`);
  }
  if (
    mission.phase === 'RANGING'
    && mission.pendingShot?.kind !== 'RANGING'
  ) {
    throw new Error('mortar RANGING phase requires one ranging shot');
  }
  if (
    mission.phase === 'FIRE_FOR_EFFECT'
    && mission.pendingShot?.kind !== 'FIRE_FOR_EFFECT'
  ) {
    throw new Error('mortar FIRE_FOR_EFFECT phase requires one effect shot');
  }
  if (
    mission.phase === 'AWAITING_RANGING_OBSERVATION'
    && (
      mission.pendingShot !== null
      || mission.awaitingObservationShotId === null
    )
  ) {
    throw new Error(
      'mortar observation phase requires exactly one fired ranging shot id'
    );
  }
  if (
    !['RANGING', 'FIRE_FOR_EFFECT'].includes(mission.phase)
    && mission.pendingShot !== null
  ) {
    throw new Error(`mortar ${mission.phase} phase cannot retain a pending shot`);
  }
  if (
    mission.phase !== 'AWAITING_RANGING_OBSERVATION'
    && mission.awaitingObservationShotId !== null
  ) {
    throw new Error(
      `mortar ${mission.phase} phase cannot await a ranging observation`
    );
  }
  if (mission.phase === 'COMPLETE') {
    if (
      mission.fireForEffectShotsFired
      !== mission.fireForEffectRoundsRequested
    ) {
      throw new Error('completed mortar mission must fire every requested round');
    }
  }
  if (
    mission.phase === 'CANCELLED'
    && mission.cancellationReason === null
  ) {
    throw new Error('cancelled mortar mission requires a reason');
  }
}

function validateEvents(state, config) {
  if (!Array.isArray(state.events)) {
    throw new TypeError('mortar fire-mission events must be an array');
  }
  if (state.events.length > config.eventHistoryLimit) {
    throw new Error('mortar fire-mission event history exceeds its bound');
  }
  let previousSequence = 0;
  for (const event of state.events) {
    requireRecord(event, 'mortar fire-mission event');
    if (
      !Number.isSafeInteger(event.sequence)
      || event.sequence <= previousSequence
      || event.sequence > state.eventSequence
    ) {
      throw new Error('mortar fire-mission event sequences must be ordered');
    }
    previousSequence = event.sequence;
    requireStableId(event.type, 'mortar fire-mission event type');
    for (const field of [
      'missionId',
      'observerId',
      'teamId',
      'targetId'
    ]) {
      requireStableId(event[field], `mortar fire-mission event ${field}`);
    }
    if (!MISSION_PHASES.has(event.phase)) {
      throw new Error(`invalid mortar fire-mission event phase ${event.phase}`);
    }
    clonePlain(event, 'mortar fire-mission event');
  }
}

export function validateMortarFireMissionState(state, config) {
  validateMortarFireMissionConfig(config);
  requireRecord(state, 'mortar fire-mission state');
  if (state.version !== MODEL_VERSION) {
    throw new Error(`unsupported mortar fire-mission version ${state.version}`);
  }
  if (!Number.isSafeInteger(state.eventSequence) || state.eventSequence < 0) {
    throw new TypeError(
      'mortar fire-mission eventSequence must be non-negative'
    );
  }
  if (state.mission !== null) validateMission(state.mission);
  validateEvents(state, config);
  return state;
}

export function captureMortarFireMissionState(state) {
  if (!state || typeof state !== 'object') return null;
  return clonePlain(state, 'mortar fire-mission state');
}

export function restoreMortarFireMissionState(config, snapshot) {
  validateMortarFireMissionConfig(config);
  const restored = captureMortarFireMissionState(snapshot);
  validateMortarFireMissionState(restored, config);
  return restored;
}

export const MORTAR_FIRE_MISSION_MODEL_VERSION = MODEL_VERSION;
