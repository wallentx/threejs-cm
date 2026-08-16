const MODEL_VERSION = 'vehicle-crew-bailout-v1';
const TIME_EPSILON_SECONDS = 1e-9;
const TERMINAL_PHASES = new Set(['COVER', 'KIA']);
const PHASE_SET = new Set(['WAITING', 'EGRESSING', 'RUNNING', 'COVER', 'KIA']);
const UNAVAILABLE_STATUSES = new Set(['KIA', 'DEAD', 'INCAPACITATED']);
const DISMOUNTED_LOCATION_PHASES = new Set([
  'DISMOUNTED',
  'EGRESSING',
  'RUNNING',
  'COVER'
]);

export const VEHICLE_CREW_BAILOUT_PHASES = Object.freeze({
  WAITING: 'WAITING',
  EGRESSING: 'EGRESSING',
  RUNNING: 'RUNNING',
  COVER: 'COVER',
  KIA: 'KIA'
});

export const VEHICLE_CREW_BAILOUT_APPROXIMATION =
  'first-order deterministic vehicle-crew bailout using timed hatch egress and supplied collision-routed cover paths; hatch contention, panic posture, and return fire are not yet modeled';

export const VEHICLE_CREW_BAILOUT_POLICY = Object.freeze({
  modelVersion: MODEL_VERSION,
  approximationLabel: VEHICLE_CREW_BAILOUT_APPROXIMATION,
  staggerSeconds: 0.35,
  egressDurationSeconds: 1.25,
  runSpeedMetersPerSecond: 3.5
});

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  return value;
}

function stableId(value, label) {
  if (
    !['string', 'number'].includes(typeof value)
    || (typeof value === 'string' && value.length === 0)
    || (typeof value === 'number' && !Number.isSafeInteger(value))
  ) {
    throw new TypeError(`${label} must be a stable string or safe integer`);
  }
  return value;
}

function stableIdKey(value) {
  return `${typeof value}:${String(value)}`;
}

function compareStableIds(left, right) {
  const leftKey = stableIdKey(left);
  const rightKey = stableIdKey(right);
  return leftKey < rightKey ? -1 : (leftKey > rightKey ? 1 : 0);
}

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
  return value;
}

function finitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be positive and finite`);
  }
  return value;
}

function position3(value, label) {
  const source = value?.position ?? value;
  const x = Array.isArray(source) ? source[0] : source?.x;
  const y = Array.isArray(source) ? source[1] : source?.y;
  const z = Array.isArray(source) ? source[2] : source?.z;
  if (![x, y, z].every(Number.isFinite)) {
    throw new TypeError(`${label} must contain finite world-space x, y, and z`);
  }
  return { x, y, z };
}

function clonePosition(position) {
  return { x: position.x, y: position.y, z: position.z };
}

function distanceBetween(left, right) {
  return Math.hypot(
    right.x - left.x,
    right.y - left.y,
    right.z - left.z
  );
}

function interpolatePosition(start, end, progress) {
  const t = Math.max(0, Math.min(1, progress));
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t
  };
}

function normalizePolicy(policy = VEHICLE_CREW_BAILOUT_POLICY) {
  requireRecord(policy, 'vehicle crew bailout policy');
  return {
    approximationLabel: typeof policy.approximationLabel === 'string'
      && policy.approximationLabel.length > 0
      ? policy.approximationLabel
      : VEHICLE_CREW_BAILOUT_APPROXIMATION,
    staggerSeconds: finiteNonNegative(
      policy.staggerSeconds,
      'vehicle crew bailout staggerSeconds'
    ),
    egressDurationSeconds: finitePositive(
      policy.egressDurationSeconds,
      'vehicle crew bailout egressDurationSeconds'
    ),
    runSpeedMetersPerSecond: finitePositive(
      policy.runSpeedMetersPerSecond,
      'vehicle crew bailout runSpeedMetersPerSecond'
    )
  };
}

function isLivingMountedCrewman(crewman) {
  if (!crewman || !(Number(crewman.health) > 0) || crewman.alive === false) return false;
  if (UNAVAILABLE_STATUSES.has(crewman.status)) return false;
  if (crewman.mounted === false || crewman.isMounted === false) return false;
  return !DISMOUNTED_LOCATION_PHASES.has(crewman.vehicleLocation?.phase);
}

function normalizePointRecords(records, label) {
  if (!Array.isArray(records)) {
    throw new TypeError(`${label} must be an array`);
  }
  const seen = new Set();
  return records.map((record, index) => {
    requireRecord(record, `${label}[${index}]`);
    const id = stableId(record.id, `${label}[${index}].id`);
    const key = stableIdKey(id);
    if (seen.has(key)) throw new TypeError(`${label} contains duplicate id ${String(id)}`);
    seen.add(key);
    return {
      id,
      crewId: record.crewId == null
        ? null
        : stableId(record.crewId, `${label}[${index}].crewId`),
      position: position3(record.position ?? record, `${label}[${index}].position`)
    };
  }).sort((left, right) => compareStableIds(left.id, right.id));
}

function normalizeExitRecords(input) {
  if (Array.isArray(input.exits)) {
    const seen = new Set();
    return input.exits.map((record, index) => {
      requireRecord(record, `vehicle crew bailout exits[${index}]`);
      const id = stableId(record.id, `vehicle crew bailout exits[${index}].id`);
      const key = stableIdKey(id);
      if (seen.has(key)) throw new TypeError(`vehicle crew bailout exits contains duplicate id ${String(id)}`);
      seen.add(key);
      return {
        id,
        crewId: record.crewId == null
          ? null
          : stableId(
              record.crewId,
              `vehicle crew bailout exits[${index}].crewId`
            ),
        hatchPosition: position3(
          record.hatchPosition ?? record.hatch,
          `vehicle crew bailout exits[${index}].hatchPosition`
        ),
        groundPosition: position3(
          record.groundPosition ?? record.ground,
          `vehicle crew bailout exits[${index}].groundPosition`
        )
      };
    }).sort((left, right) => compareStableIds(left.id, right.id));
  }

  const hatchPoints = normalizePointRecords(input.hatchPoints ?? [], 'vehicle crew bailout hatchPoints');
  const groundPoints = normalizePointRecords(input.groundPoints ?? [], 'vehicle crew bailout groundPoints');
  if (hatchPoints.length !== groundPoints.length) {
    throw new TypeError('vehicle crew bailout hatchPoints and groundPoints must have equal lengths');
  }
  return hatchPoints.map((hatch, index) => {
    const matchingGround = groundPoints.find(point =>
      stableIdKey(point.id) === stableIdKey(hatch.id)
    ) ?? groundPoints[index];
    return {
      id: hatch.id,
      crewId: hatch.crewId ?? matchingGround.crewId,
      hatchPosition: hatch.position,
      groundPosition: matchingGround.position
    };
  });
}

function normalizeDestinations(records, kind) {
  const label = `vehicle crew bailout ${kind}`;
  if (!Array.isArray(records ?? [])) {
    throw new TypeError(`${label} must be an array`);
  }
  const seen = new Set();
  return (records ?? []).map((record, index) => {
    requireRecord(record, `${label}[${index}]`);
    const id = stableId(record.id, `${label}[${index}].id`);
    const key = stableIdKey(id);
    if (seen.has(key)) throw new TypeError(`${label} contains duplicate id ${String(id)}`);
    seen.add(key);
    const position = position3(record.position ?? record, `${label}[${index}].position`);
    const suppliedRoute = Array.isArray(record.route)
      ? record.route.map((waypoint, routeIndex) => position3(
          waypoint,
          `${label}[${index}].route[${routeIndex}]`
        ))
      : [];
    const route = suppliedRoute.length > 0 ? suppliedRoute : [position];
    const routeEnd = route[route.length - 1];
    if (distanceBetween(routeEnd, position) > TIME_EPSILON_SECONDS) {
      route.push(position);
    }
    return { id, position, route, kind };
  }).sort((left, right) => compareStableIds(left.id, right.id));
}

function uniqueEligibleCrew(crew) {
  if (!Array.isArray(crew)) {
    throw new TypeError('vehicle crew bailout trigger requires a crew roster');
  }
  const seen = new Set();
  const eligible = [];
  for (const crewman of crew) {
    if (!crewman || !['string', 'number'].includes(typeof crewman.id)) {
      throw new TypeError('vehicle crew bailout crew requires stable ids');
    }
    stableId(crewman.id, 'vehicle crew bailout crew id');
    const key = stableIdKey(crewman.id);
    if (seen.has(key)) {
      throw new TypeError(`vehicle crew bailout crew contains duplicate id ${String(crewman.id)}`);
    }
    seen.add(key);
    if (isLivingMountedCrewman(crewman)) eligible.push(crewman);
  }
  return eligible.sort((left, right) => compareStableIds(left.id, right.id));
}

function chooseExit(exits, crewman, actorIndex) {
  const assigned = exits.find(exit =>
    exit.crewId != null
    && stableIdKey(exit.crewId) === stableIdKey(crewman.id)
  );
  return assigned ?? exits[actorIndex % exits.length];
}

function chooseDestination(groundPosition, candidates, claimedIds) {
  const available = candidates.filter(candidate => !claimedIds.has(stableIdKey(candidate.id)));
  if (available.length === 0) return null;
  const selected = available.sort((left, right) =>
    distanceBetween(groundPosition, left.position)
      - distanceBetween(groundPosition, right.position)
    || compareStableIds(left.id, right.id)
  )[0];
  claimedIds.add(stableIdKey(selected.id));
  return selected;
}

function routeDistance(start, routePositions) {
  let totalDistance = 0;
  let segmentStart = start;
  for (const waypoint of routePositions) {
    totalDistance += distanceBetween(segmentStart, waypoint);
    segmentStart = waypoint;
  }
  return totalDistance;
}

function routeProgress(actor) {
  let remainingDistance = actor.phaseElapsedSeconds
    * actor.runSpeedMetersPerSecond;
  let segmentStart = actor.groundPosition;
  for (let routeIndex = 0; routeIndex < actor.routePositions.length; routeIndex++) {
    const waypoint = actor.routePositions[routeIndex];
    const segmentDistance = distanceBetween(segmentStart, waypoint);
    if (segmentDistance <= TIME_EPSILON_SECONDS) {
      segmentStart = waypoint;
      continue;
    }
    if (remainingDistance + TIME_EPSILON_SECONDS < segmentDistance) {
      return {
        position: interpolatePosition(
          segmentStart,
          waypoint,
          remainingDistance / segmentDistance
        ),
        routeIndex
      };
    }
    remainingDistance = Math.max(0, remainingDistance - segmentDistance);
    segmentStart = waypoint;
  }
  return {
    position: clonePosition(actor.destinationPosition),
    routeIndex: actor.routePositions.length
  };
}

function actorPosition(actor) {
  if (actor.phase === 'WAITING') return clonePosition(actor.hatchPosition);
  if (actor.phase === 'EGRESSING') {
    return interpolatePosition(
      actor.hatchPosition,
      actor.groundPosition,
      actor.phaseElapsedSeconds / actor.egressDurationSeconds
    );
  }
  if (actor.phase === 'RUNNING') {
    if (actor.runDurationSeconds <= TIME_EPSILON_SECONDS) {
      return clonePosition(actor.destinationPosition);
    }
    return routeProgress(actor).position;
  }
  return clonePosition(actor.currentPosition);
}

function cloneActor(actor) {
  return {
    crewId: actor.crewId,
    exitId: actor.exitId,
    destinationId: actor.destinationId,
    destinationKind: actor.destinationKind,
    phase: actor.phase,
    exposed: actor.exposed,
    phaseElapsedSeconds: actor.phaseElapsedSeconds,
    delaySeconds: actor.delaySeconds,
    egressDurationSeconds: actor.egressDurationSeconds,
    runDurationSeconds: actor.runDurationSeconds,
    runSpeedMetersPerSecond: actor.runSpeedMetersPerSecond,
    routeIndex: actor.routeIndex,
    routePositions: actor.routePositions.map(clonePosition),
    hatchPosition: clonePosition(actor.hatchPosition),
    groundPosition: clonePosition(actor.groundPosition),
    destinationPosition: clonePosition(actor.destinationPosition),
    previousPosition: clonePosition(actor.previousPosition),
    currentPosition: clonePosition(actor.currentPosition)
  };
}

function completeState(state, actors) {
  return {
    modelVersion: MODEL_VERSION,
    approximationLabel: state.approximationLabel,
    triggered: state.triggered,
    reason: state.reason,
    completed: state.triggered
      && actors.every(actor => TERMINAL_PHASES.has(actor.phase)),
    actors
  };
}

export function createVehicleCrewBailoutState(savedState = null) {
  if (savedState) return restoreVehicleCrewBailoutState(savedState);
  return {
    modelVersion: MODEL_VERSION,
    approximationLabel: VEHICLE_CREW_BAILOUT_APPROXIMATION,
    triggered: false,
    reason: null,
    completed: false,
    actors: []
  };
}

export function triggerVehicleCrewBailout(state, input = {}) {
  const current = state
    ? restoreVehicleCrewBailoutState(state)
    : createVehicleCrewBailoutState();
  if (current.triggered) {
    return { ...current, reason: 'ALREADY_TRIGGERED' };
  }

  const crew = uniqueEligibleCrew(input.crew);
  if (crew.length === 0) {
    return { ...current, reason: 'NO_ELIGIBLE_CREW' };
  }
  const exits = normalizeExitRecords(input);
  if (exits.length === 0) {
    return { ...current, reason: 'NO_EXIT_POINTS' };
  }
  const policy = normalizePolicy(input.policy);
  const coverCandidates = normalizeDestinations(input.coverCandidates, 'coverCandidates');
  const fallbackDestinations = normalizeDestinations(
    input.fallbackDestinations,
    'fallbackDestinations'
  );
  const claimedDestinationIds = new Set();
  const actors = crew.map((crewman, actorIndex) => {
    const exit = chooseExit(exits, crewman, actorIndex);
    const destination = chooseDestination(
      exit.groundPosition,
      coverCandidates,
      claimedDestinationIds
    ) ?? chooseDestination(
      exit.groundPosition,
      fallbackDestinations,
      claimedDestinationIds
    );
    const destinationPosition = destination
      ? destination.position
      : exit.groundPosition;
    const routePositions = destination
      ? destination.route.map(clonePosition)
      : [clonePosition(exit.groundPosition)];
    const runDistanceMeters = routeDistance(
      exit.groundPosition,
      routePositions
    );
    return {
      crewId: crewman.id,
      exitId: exit.id,
      destinationId: destination?.id ?? null,
      destinationKind: destination?.kind ?? 'GROUND_POINT',
      phase: VEHICLE_CREW_BAILOUT_PHASES.WAITING,
      exposed: false,
      phaseElapsedSeconds: 0,
      delaySeconds: actorIndex * policy.staggerSeconds,
      egressDurationSeconds: policy.egressDurationSeconds,
      runDurationSeconds: runDistanceMeters / policy.runSpeedMetersPerSecond,
      runSpeedMetersPerSecond: policy.runSpeedMetersPerSecond,
      routeIndex: 0,
      routePositions,
      hatchPosition: clonePosition(exit.hatchPosition),
      groundPosition: clonePosition(exit.groundPosition),
      destinationPosition: clonePosition(destinationPosition),
      previousPosition: clonePosition(exit.hatchPosition),
      currentPosition: clonePosition(exit.hatchPosition)
    };
  });

  return completeState({
    ...current,
    approximationLabel: policy.approximationLabel,
    triggered: true,
    reason: typeof input.reason === 'string' && input.reason.length > 0
      ? input.reason
      : 'UNSPECIFIED'
  }, actors);
}

function advanceActor(actor, deltaSeconds) {
  const next = cloneActor(actor);
  next.previousPosition = clonePosition(actor.currentPosition);
  if (TERMINAL_PHASES.has(next.phase) || deltaSeconds <= 0) return next;

  let remainingSeconds = deltaSeconds;
  while (remainingSeconds > TIME_EPSILON_SECONDS && !TERMINAL_PHASES.has(next.phase)) {
    const durationSeconds = next.phase === 'WAITING'
      ? next.delaySeconds
      : (next.phase === 'EGRESSING'
          ? next.egressDurationSeconds
          : next.runDurationSeconds);
    const secondsToBoundary = Math.max(0, durationSeconds - next.phaseElapsedSeconds);
    const consumedSeconds = Math.min(remainingSeconds, secondsToBoundary);
    next.phaseElapsedSeconds = Math.min(
      durationSeconds,
      next.phaseElapsedSeconds + consumedSeconds
    );
    remainingSeconds = Math.max(0, remainingSeconds - consumedSeconds);

    if (next.phaseElapsedSeconds + TIME_EPSILON_SECONDS < durationSeconds) break;
    next.phaseElapsedSeconds = durationSeconds;
    if (next.phase === 'WAITING') {
      next.phase = 'EGRESSING';
      next.exposed = true;
      next.phaseElapsedSeconds = 0;
    } else if (next.phase === 'EGRESSING') {
      next.phase = next.runDurationSeconds <= TIME_EPSILON_SECONDS
        ? 'COVER'
        : 'RUNNING';
      next.phaseElapsedSeconds = 0;
      if (next.phase === 'COVER') {
        next.routeIndex = next.routePositions.length;
        next.currentPosition = clonePosition(next.destinationPosition);
      }
    } else {
      next.phase = 'COVER';
      next.phaseElapsedSeconds = next.runDurationSeconds;
      next.routeIndex = next.routePositions.length;
      next.currentPosition = clonePosition(next.destinationPosition);
    }
  }

  if (next.phase === 'WAITING') {
    next.currentPosition = clonePosition(next.hatchPosition);
  } else if (next.phase === 'COVER') {
    next.currentPosition = clonePosition(next.destinationPosition);
  } else {
    const progress = next.phase === 'RUNNING' ? routeProgress(next) : null;
    next.currentPosition = progress?.position ?? actorPosition(next);
    if (progress) next.routeIndex = progress.routeIndex;
  }
  return next;
}

export function advanceVehicleCrewBailoutState(state, deltaSeconds) {
  finiteNonNegative(deltaSeconds, 'vehicle crew bailout deltaSeconds');
  const current = restoreVehicleCrewBailoutState(state);
  if (!current.triggered || current.completed) return current;
  return completeState(
    current,
    current.actors.map(actor => advanceActor(actor, deltaSeconds))
  );
}

export function applyVehicleCrewBailoutCasualty(state, crewId) {
  stableId(crewId, 'vehicle crew bailout casualty crewId');
  const current = restoreVehicleCrewBailoutState(state);
  const key = stableIdKey(crewId);
  let applied = false;
  const actors = current.actors.map(actor => {
    if (stableIdKey(actor.crewId) !== key || actor.phase === 'KIA') return actor;
    applied = true;
    return {
      ...cloneActor(actor),
      phase: 'KIA',
      phaseElapsedSeconds: 0,
      previousPosition: clonePosition(actor.currentPosition),
      currentPosition: clonePosition(actor.currentPosition)
    };
  });
  return {
    state: completeState(current, actors),
    applied,
    reason: applied ? 'CASUALTY_APPLIED' : 'CREW_NOT_ACTIVE'
  };
}

export function getActiveVehicleCrewBailoutActors(state) {
  if (!state) return [];
  const current = restoreVehicleCrewBailoutState(state);
  return current.actors
    .filter(actor => actor.phase !== 'KIA')
    .map(actor => ({
      crewId: actor.crewId,
      phase: actor.phase,
      exposed: actor.exposed,
      phaseElapsedSeconds: actor.phaseElapsedSeconds,
      delaySeconds: actor.delaySeconds,
      mounted: actor.phase === 'WAITING',
      routeIndex: actor.routeIndex,
      currentPosition: clonePosition(actor.currentPosition),
      previousPosition: clonePosition(actor.previousPosition)
    }));
}

export function captureVehicleCrewBailoutState(state) {
  if (!state) return null;
  const current = restoreVehicleCrewBailoutState(state);
  return completeState(current, current.actors.map(actor => ({
    ...cloneActor(actor),
    // Previous position is a fixed-step collision/presentation scratch value,
    // not persistent authority. Normalizing it prevents frame partitioning
    // from changing an otherwise identical rollback snapshot.
    previousPosition: clonePosition(actor.currentPosition)
  })));
}

export function restoreVehicleCrewBailoutState(savedState) {
  requireRecord(savedState, 'vehicle crew bailout saved state');
  if (savedState.modelVersion !== MODEL_VERSION) {
    throw new TypeError(
      `unsupported vehicle crew bailout model version ${savedState.modelVersion}`
    );
  }
  if (!Array.isArray(savedState.actors)) {
    throw new TypeError('vehicle crew bailout saved actors must be an array');
  }
  const seen = new Set();
  const actors = savedState.actors.map((savedActor, index) => {
    requireRecord(savedActor, `vehicle crew bailout saved actors[${index}]`);
    const crewId = stableId(
      savedActor.crewId,
      `vehicle crew bailout saved actors[${index}].crewId`
    );
    const key = stableIdKey(crewId);
    if (seen.has(key)) {
      throw new TypeError(`vehicle crew bailout saved actors contains duplicate crew id ${String(crewId)}`);
    }
    seen.add(key);
    if (!PHASE_SET.has(savedActor.phase)) {
      throw new TypeError(`unknown vehicle crew bailout phase ${savedActor.phase}`);
    }
    if (typeof savedActor.exposed !== 'boolean') {
      throw new TypeError('vehicle crew bailout saved actor exposed must be boolean');
    }
    if (
      (savedActor.phase === 'WAITING' && savedActor.exposed)
      || (
        !['WAITING', 'KIA'].includes(savedActor.phase)
        && !savedActor.exposed
      )
    ) {
      throw new TypeError('vehicle crew bailout saved actor phase/exposure is inconsistent');
    }
    const delaySeconds = finiteNonNegative(
      savedActor.delaySeconds,
      `vehicle crew bailout saved actors[${index}].delaySeconds`
    );
    const egressDurationSeconds = finitePositive(
      savedActor.egressDurationSeconds,
      `vehicle crew bailout saved actors[${index}].egressDurationSeconds`
    );
    const runSpeedMetersPerSecond = finitePositive(
      savedActor.runSpeedMetersPerSecond,
      `vehicle crew bailout saved actors[${index}].runSpeedMetersPerSecond`
    );
    const runDurationSeconds = finiteNonNegative(
      savedActor.runDurationSeconds,
      `vehicle crew bailout saved actors[${index}].runDurationSeconds`
    );
    const phaseDurationSeconds = savedActor.phase === 'WAITING'
      ? delaySeconds
      : (savedActor.phase === 'EGRESSING'
          ? egressDurationSeconds
          : (savedActor.phase === 'RUNNING' ? runDurationSeconds : 0));
    const phaseElapsedSeconds = finiteNonNegative(
      savedActor.phaseElapsedSeconds,
      `vehicle crew bailout saved actors[${index}].phaseElapsedSeconds`
    );
    if (
      !TERMINAL_PHASES.has(savedActor.phase)
      && phaseElapsedSeconds > phaseDurationSeconds + TIME_EPSILON_SECONDS
    ) {
      throw new RangeError('vehicle crew bailout saved phase elapsed time exceeds its duration');
    }
    const routePositions = (
      Array.isArray(savedActor.routePositions)
        ? savedActor.routePositions
        : [savedActor.destinationPosition]
    ).map((waypoint, routeIndex) => position3(
      waypoint,
      `saved bailout routePositions[${routeIndex}]`
    ));
    if (routePositions.length === 0) {
      throw new TypeError('vehicle crew bailout saved routePositions cannot be empty');
    }
    const routeIndex = Number.isSafeInteger(savedActor.routeIndex)
      && savedActor.routeIndex >= 0
      ? savedActor.routeIndex
      : 0;
    if (routeIndex > routePositions.length) {
      throw new RangeError('vehicle crew bailout saved routeIndex exceeds its route');
    }
    return {
      crewId,
      exitId: stableId(savedActor.exitId, `vehicle crew bailout saved actors[${index}].exitId`),
      destinationId: savedActor.destinationId == null
        ? null
        : stableId(
            savedActor.destinationId,
            `vehicle crew bailout saved actors[${index}].destinationId`
          ),
      destinationKind: typeof savedActor.destinationKind === 'string'
        ? savedActor.destinationKind
        : 'GROUND_POINT',
      phase: savedActor.phase,
      exposed: savedActor.exposed === true,
      phaseElapsedSeconds,
      delaySeconds,
      egressDurationSeconds,
      runDurationSeconds,
      runSpeedMetersPerSecond,
      routeIndex,
      routePositions,
      hatchPosition: position3(savedActor.hatchPosition, 'saved bailout hatchPosition'),
      groundPosition: position3(savedActor.groundPosition, 'saved bailout groundPosition'),
      destinationPosition: position3(
        savedActor.destinationPosition,
        'saved bailout destinationPosition'
      ),
      previousPosition: position3(
        savedActor.previousPosition,
        'saved bailout previousPosition'
      ),
      currentPosition: position3(
        savedActor.currentPosition,
        'saved bailout currentPosition'
      )
    };
  }).sort((left, right) => compareStableIds(left.crewId, right.crewId));

  const triggered = Boolean(savedState.triggered);
  if (!triggered && actors.length > 0) {
    throw new TypeError('untriggered vehicle crew bailout state cannot contain actors');
  }
  return completeState({
    approximationLabel: typeof savedState.approximationLabel === 'string'
      ? savedState.approximationLabel
      : VEHICLE_CREW_BAILOUT_APPROXIMATION,
    triggered,
    reason: savedState.reason ?? null
  }, actors);
}
