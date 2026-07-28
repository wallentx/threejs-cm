const MODEL_VERSION = 'mortar-team-v1';
const TRAJECTORY_MODEL_VERSION = 'mortar-high-angle-v1';
const GRAVITY_METERS_PER_SECOND_SQUARED = 9.81;
const TRANSITION_EPSILON_SECONDS = 1e-9;
const DEPLOYMENT_STATES = new Set([
  'PACKED',
  'SETTING_UP',
  'READY',
  'PACKING'
]);
const UNAVAILABLE_STATUSES = new Set([
  'KIA',
  'INCAPACITATED',
  'DEAD'
]);

function finitePoint(value, label) {
  const point = value?.toArray?.() ?? value;
  if (
    !Array.isArray(point)
    || point.length < 3
    || !point.slice(0, 3).every(Number.isFinite)
  ) {
    throw new TypeError(`${label} must contain three finite coordinates`);
  }
  return point.slice(0, 3);
}

function positiveFinite(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be positive and finite`);
  }
  return value;
}

function requireStableId(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a stable non-empty id`);
  }
  return value;
}

function ammunitionOwnerIds(config) {
  const allocation = config?.ammunitionBySoldierId;
  if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) {
    throw new TypeError('mortar ammunitionBySoldierId must be a record');
  }
  const ids = Object.keys(allocation);
  if (ids.length === 0) {
    throw new Error('mortar ammunitionBySoldierId requires at least one owner');
  }
  for (const soldierId of ids) {
    requireStableId(soldierId, 'mortar ammunition owner');
    if (!Number.isSafeInteger(allocation[soldierId]) || allocation[soldierId] <= 0) {
      throw new TypeError(
        `mortar ammunition for ${soldierId} must be a positive safe integer`
      );
    }
  }
  return ids;
}

export function validateMortarTeamConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('mortar team config must be a record');
  }
  requireStableId(config.id, 'mortar team id');
  requireStableId(config.weaponId, 'mortar weaponId');
  requireStableId(config.gunnerSoldierId, 'mortar gunnerSoldierId');
  requireStableId(config.assistantSoldierId, 'mortar assistantSoldierId');
  if (config.gunnerSoldierId === config.assistantSoldierId) {
    throw new Error('mortar gunner and assistant must be different soldiers');
  }
  const ownerIds = ammunitionOwnerIds(config);
  if (!ownerIds.includes(config.gunnerSoldierId)) {
    throw new Error('mortar ammunition allocation must include the gunner');
  }
  if (!ownerIds.includes(config.assistantSoldierId)) {
    throw new Error('mortar ammunition allocation must include the assistant');
  }
  positiveFinite(config.setupSeconds, 'mortar setupSeconds');
  positiveFinite(config.packSeconds, 'mortar packSeconds');
  positiveFinite(config.reloadSeconds, 'mortar reloadSeconds');
  positiveFinite(config.minimumRangeMeters, 'mortar minimumRangeMeters');
  positiveFinite(config.maximumRangeMeters, 'mortar maximumRangeMeters');
  if (config.maximumRangeMeters <= config.minimumRangeMeters) {
    throw new Error('mortar maximumRangeMeters must exceed minimumRangeMeters');
  }
  positiveFinite(config.minimumMuzzleVelocity, 'mortar minimumMuzzleVelocity');
  positiveFinite(config.maximumMuzzleVelocity, 'mortar maximumMuzzleVelocity');
  if (config.maximumMuzzleVelocity <= config.minimumMuzzleVelocity) {
    throw new Error(
      'mortar maximumMuzzleVelocity must exceed minimumMuzzleVelocity'
    );
  }
  if (
    !Number.isFinite(config.elevationDegrees)
    || config.elevationDegrees <= 45
    || config.elevationDegrees >= 90
  ) {
    throw new Error('mortar elevationDegrees must be between 45 and 90');
  }
  return config;
}

/**
 * Solve one drag-free high-angle launch. Variable mortar charges are modeled
 * by selecting the speed needed for the configured elevation, then rejecting
 * solutions outside the weapon's allowed charge envelope.
 */
export function solveHighAngleTrajectory({
  origin,
  target,
  elevationDegrees,
  minimumMuzzleVelocity,
  maximumMuzzleVelocity,
  gravity = GRAVITY_METERS_PER_SECOND_SQUARED
}) {
  const from = finitePoint(origin, 'mortar trajectory origin');
  const to = finitePoint(target, 'mortar trajectory target');
  positiveFinite(gravity, 'mortar trajectory gravity');
  positiveFinite(minimumMuzzleVelocity, 'mortar minimumMuzzleVelocity');
  positiveFinite(maximumMuzzleVelocity, 'mortar maximumMuzzleVelocity');
  if (
    !Number.isFinite(elevationDegrees)
    || elevationDegrees <= 45
    || elevationDegrees >= 90
    || maximumMuzzleVelocity <= minimumMuzzleVelocity
  ) {
    throw new Error('mortar trajectory requires a valid high-angle charge envelope');
  }

  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const horizontalRangeMeters = Math.hypot(dx, dz);
  if (horizontalRangeMeters <= 1e-9) return null;
  const heightDelta = to[1] - from[1];
  const elevationRadians = elevationDegrees * Math.PI / 180;
  const cosine = Math.cos(elevationRadians);
  const tangent = Math.tan(elevationRadians);
  const verticalTerm = horizontalRangeMeters * tangent - heightDelta;
  if (verticalTerm <= 0 || Math.abs(cosine) <= 1e-9) return null;

  const speedSquared = gravity * horizontalRangeMeters * horizontalRangeMeters
    / (2 * cosine * cosine * verticalTerm);
  if (!Number.isFinite(speedSquared) || speedSquared <= 0) return null;
  const speedMetersPerSecond = Math.sqrt(speedSquared);
  if (
    speedMetersPerSecond < minimumMuzzleVelocity - 1e-9
    || speedMetersPerSecond > maximumMuzzleVelocity + 1e-9
  ) {
    return null;
  }

  const horizontalSpeed = speedMetersPerSecond * cosine;
  const flightTimeSeconds = horizontalRangeMeters / horizontalSpeed;
  const directionX = dx / horizontalRangeMeters;
  const directionZ = dz / horizontalRangeMeters;
  return {
    modelVersion: TRAJECTORY_MODEL_VERSION,
    dataQuality:
      'drag-free fixed-elevation variable-charge gameplay approximation',
    horizontalRangeMeters,
    elevationDegrees,
    speedMetersPerSecond,
    flightTimeSeconds,
    velocity: [
      directionX * horizontalSpeed,
      speedMetersPerSecond * Math.sin(elevationRadians),
      directionZ * horizontalSpeed
    ]
  };
}

export function createMortarTeamState(config) {
  validateMortarTeamConfig(config);
  return {
    version: MODEL_VERSION,
    teamId: config.id,
    weaponId: config.weaponId,
    deploymentState: 'PACKED',
    transitionRemainingSeconds: 0,
    reloadRemainingSeconds: 0,
    roundsBySoldierId: Object.fromEntries(
      ammunitionOwnerIds(config).map(soldierId => [
        soldierId,
        config.ammunitionBySoldierId[soldierId]
      ])
    ),
    roundsFired: 0
  };
}

export function requestMortarDeployment(state, config) {
  validateMortarTeamConfig(config);
  validateMortarTeamState(state, config);
  if (state.deploymentState === 'PACKED') {
    state.deploymentState = 'SETTING_UP';
    state.transitionRemainingSeconds = config.setupSeconds;
  } else if (
    state.deploymentState === 'SETTING_UP'
    || state.deploymentState === 'READY'
  ) {
    state.deploymentState = 'PACKING';
    state.transitionRemainingSeconds = config.packSeconds;
  } else {
    state.deploymentState = 'SETTING_UP';
    state.transitionRemainingSeconds = config.setupSeconds;
  }
  return state.deploymentState;
}

export function advanceMortarTeamState(state, deltaSeconds) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new TypeError('mortar deltaSeconds must be finite and non-negative');
  }
  state.reloadRemainingSeconds = Math.max(
    0,
    state.reloadRemainingSeconds - deltaSeconds
  );
  if (!['SETTING_UP', 'PACKING'].includes(state.deploymentState)) return state;

  state.transitionRemainingSeconds = Math.max(
    0,
    state.transitionRemainingSeconds - deltaSeconds
  );
  if (state.transitionRemainingSeconds <= TRANSITION_EPSILON_SECONDS) {
    state.transitionRemainingSeconds = 0;
    state.deploymentState =
      state.deploymentState === 'SETTING_UP' ? 'READY' : 'PACKED';
  }
  return state;
}

function soldierIsAvailable(soldier) {
  return Boolean(
    soldier
    && Number(soldier.health ?? 100) > 0
    && !UNAVAILABLE_STATUSES.has(String(soldier.status ?? 'OK').toUpperCase())
  );
}

function rosterById(roster) {
  if (!Array.isArray(roster)) {
    throw new TypeError('mortar crew roster must be an array');
  }
  return new Map(roster.map(soldier => [String(soldier.id), soldier]));
}

function totalRounds(state) {
  return Object.values(state.roundsBySoldierId)
    .reduce((sum, rounds) => sum + rounds, 0);
}

function accessibleAmmunitionOwner(state, config, rosterMap) {
  return ammunitionOwnerIds(config).find(soldierId =>
    state.roundsBySoldierId[soldierId] > 0
      && soldierIsAvailable(rosterMap.get(String(soldierId)))
  ) ?? null;
}

export function canFireMortar(state, config, roster, horizontalRangeMeters) {
  validateMortarTeamConfig(config);
  validateMortarTeamState(state, config);
  const members = rosterById(roster);
  if (state.deploymentState !== 'READY') {
    return { ready: false, reason: 'NOT_DEPLOYED' };
  }
  if (!soldierIsAvailable(members.get(String(config.gunnerSoldierId)))) {
    return { ready: false, reason: 'NO_GUNNER' };
  }
  if (!soldierIsAvailable(members.get(String(config.assistantSoldierId)))) {
    return { ready: false, reason: 'NO_ASSISTANT' };
  }
  if (state.reloadRemainingSeconds > TRANSITION_EPSILON_SECONDS) {
    return { ready: false, reason: 'RELOADING' };
  }
  if (!Number.isFinite(horizontalRangeMeters)) {
    return { ready: false, reason: 'NO_TARGET' };
  }
  if (horizontalRangeMeters < config.minimumRangeMeters) {
    return { ready: false, reason: 'TOO_CLOSE' };
  }
  if (horizontalRangeMeters > config.maximumRangeMeters) {
    return { ready: false, reason: 'OUT_OF_RANGE' };
  }
  if (!accessibleAmmunitionOwner(state, config, members)) {
    return {
      ready: false,
      reason: totalRounds(state) > 0 ? 'AMMUNITION_INACCESSIBLE' : 'OUT_OF_AMMUNITION'
    };
  }
  return { ready: true, reason: 'READY' };
}

export function consumeMortarRound(state, config, roster) {
  validateMortarTeamConfig(config);
  validateMortarTeamState(state, config);
  const members = rosterById(roster);
  const basicReadiness = canFireMortar(
    state,
    config,
    roster,
    config.minimumRangeMeters
  );
  if (!basicReadiness.ready) {
    return {
      accepted: false,
      reason: basicReadiness.reason,
      ownerSoldierId: null,
      roundsRemaining: totalRounds(state)
    };
  }
  const ownerSoldierId = accessibleAmmunitionOwner(
    state,
    config,
    members
  );
  state.roundsBySoldierId[ownerSoldierId]--;
  state.roundsFired++;
  state.reloadRemainingSeconds = config.reloadSeconds;
  return {
    accepted: true,
    ownerSoldierId,
    roundsRemaining: totalRounds(state)
  };
}

export function captureMortarTeamState(state) {
  if (!state || typeof state !== 'object') return null;
  return {
    version: state.version,
    teamId: state.teamId,
    weaponId: state.weaponId,
    deploymentState: state.deploymentState,
    transitionRemainingSeconds: state.transitionRemainingSeconds,
    reloadRemainingSeconds: state.reloadRemainingSeconds,
    roundsBySoldierId: { ...state.roundsBySoldierId },
    roundsFired: state.roundsFired
  };
}

export function validateMortarTeamState(state, config) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('mortar team state must be a record');
  }
  if (state.version !== MODEL_VERSION) {
    throw new Error(`unsupported mortar team state version ${state.version}`);
  }
  if (state.teamId !== config.id) {
    throw new Error(`mortar teamId must match ${config.id}`);
  }
  if (state.weaponId !== config.weaponId) {
    throw new Error(`mortar weaponId must match ${config.weaponId}`);
  }
  if (!DEPLOYMENT_STATES.has(state.deploymentState)) {
    throw new Error(`invalid mortar deploymentState ${state.deploymentState}`);
  }
  for (const field of [
    'transitionRemainingSeconds',
    'reloadRemainingSeconds'
  ]) {
    if (!Number.isFinite(state[field]) || state[field] < 0) {
      throw new TypeError(`mortar ${field} must be finite and non-negative`);
    }
  }
  if (!Number.isSafeInteger(state.roundsFired) || state.roundsFired < 0) {
    throw new TypeError('mortar roundsFired must be a non-negative safe integer');
  }
  const ownerIds = ammunitionOwnerIds(config);
  if (
    !state.roundsBySoldierId
    || typeof state.roundsBySoldierId !== 'object'
    || Array.isArray(state.roundsBySoldierId)
    || Object.keys(state.roundsBySoldierId).length !== ownerIds.length
  ) {
    throw new TypeError('mortar roundsBySoldierId must match the configured owners');
  }
  for (const soldierId of ownerIds) {
    const rounds = state.roundsBySoldierId[soldierId];
    if (
      !Number.isSafeInteger(rounds)
      || rounds < 0
      || rounds > config.ammunitionBySoldierId[soldierId]
    ) {
      throw new TypeError(`invalid mortar ammunition state for ${soldierId}`);
    }
  }
  return state;
}

export function restoreMortarTeamState(config, snapshot) {
  validateMortarTeamConfig(config);
  const restored = captureMortarTeamState(snapshot);
  validateMortarTeamState(restored, config);
  return restored;
}

export const MORTAR_TEAM_MODEL_VERSION = MODEL_VERSION;
export const MORTAR_TRAJECTORY_MODEL_VERSION = TRAJECTORY_MODEL_VERSION;
