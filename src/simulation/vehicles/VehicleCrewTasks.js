const MODEL_VERSION = 1;
const PHASES = new Set(['IDLE', 'TRANSFERRING', 'COMPLETE']);
const UNAVAILABLE_STATUSES = new Set(['KIA', 'INCAPACITATED']);
const TIME_EPSILON_SECONDS = 1e-9;

function requirePolicy(policy) {
  const replacement = policy?.mainGunnerReplacement;
  if (
    !replacement
    || typeof replacement.id !== 'string'
    || replacement.id.length === 0
    || typeof replacement.targetRole !== 'string'
    || !Array.isArray(replacement.candidateRoles)
    || replacement.candidateRoles.length === 0
    || !Number.isFinite(replacement.delaySeconds)
    || replacement.delaySeconds <= 0
    || typeof replacement.dataQuality !== 'string'
  ) {
    throw new TypeError('Vehicle crew tasks require a valid main-gunner replacement policy');
  }
  return replacement;
}

function freezeState(replacement, state = {}) {
  const phase = state.phase ?? 'IDLE';
  if (!PHASES.has(phase)) {
    throw new TypeError(`Unknown vehicle crew-task phase ${phase}`);
  }
  const candidateCrewId = state.candidateCrewId ?? null;
  const sourceRole = state.sourceRole ?? null;
  if (phase !== 'IDLE' && (candidateCrewId == null || typeof sourceRole !== 'string')) {
    throw new TypeError(`${phase} vehicle crew task requires a candidate and source role`);
  }
  const elapsedSeconds = Math.max(
    0,
    Math.min(replacement.delaySeconds, Number(state.elapsedSeconds) || 0)
  );
  return Object.freeze({
    modelVersion: MODEL_VERSION,
    mainGunnerReplacement: Object.freeze({
      policyId: replacement.id,
      phase,
      candidateCrewId,
      sourceRole,
      targetRole: replacement.targetRole,
      elapsedSeconds,
      delaySeconds: replacement.delaySeconds,
      dataQuality: replacement.dataQuality
    })
  });
}

function idleState(replacement) {
  return freezeState(replacement);
}

function compareStableCrewIds(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  const leftKey = `${typeof left}:${String(left)}`;
  const rightKey = `${typeof right}:${String(right)}`;
  return leftKey < rightKey ? -1 : (leftKey > rightKey ? 1 : 0);
}

function assertStableCrewIds(crew) {
  const seen = new Set();
  for (const crewman of crew) {
    if (!crewman || !['number', 'string'].includes(typeof crewman.id)) {
      throw new TypeError('Vehicle crew-task candidates require stable string or number ids');
    }
    const key = `${typeof crewman.id}:${String(crewman.id)}`;
    if (seen.has(key)) {
      throw new TypeError(`Duplicate vehicle crew id ${String(crewman.id)}`);
    }
    seen.add(key);
  }
}

export function isCrewmanTaskAvailable(crewman) {
  return Boolean(
    crewman
    && Number(crewman.health) > 0
    && !UNAVAILABLE_STATUSES.has(crewman.status)
    && crewman.vehicleLocation?.phase !== 'DISMOUNTED'
  );
}

function findCandidate(crew, replacement) {
  const rolePriority = new Map(
    replacement.candidateRoles.map((role, index) => [role, index])
  );
  return crew
    .filter(crewman =>
      isCrewmanTaskAvailable(crewman)
      && rolePriority.has(crewman.role)
      && crewman.role !== replacement.targetRole)
    .sort((left, right) =>
      rolePriority.get(left.role) - rolePriority.get(right.role)
      || compareStableCrewIds(left.id, right.id))[0] ?? null;
}

function findCrewmanById(crew, crewId) {
  return crew.find(crewman =>
    typeof crewman.id === typeof crewId
    && crewman.id === crewId) ?? null;
}

export function createVehicleCrewTaskState(policy, savedState = null) {
  if (!policy) return null;
  return savedState
    ? restoreVehicleCrewTaskState(policy, savedState)
    : idleState(requirePolicy(policy));
}

export function advanceVehicleCrewTaskStep(state, policy, crew, deltaSeconds) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('Vehicle crew-task deltaSeconds must be finite and non-negative');
  }
  if (!policy) {
    return Object.freeze({
      state: null,
      mainGunnerAvailableSeconds: deltaSeconds
    });
  }
  const replacement = requirePolicy(policy);
  if (!Array.isArray(crew)) {
    throw new TypeError('Vehicle crew-task advancement requires a crew roster');
  }
  assertStableCrewIds(crew);

  const current = state
    ? restoreVehicleCrewTaskState(policy, state)
    : idleState(replacement);
  const currentTask = current.mainGunnerReplacement;
  const originalGunnerAvailable = crew.some(crewman =>
    crewman.role === replacement.targetRole
    && isCrewmanTaskAvailable(crewman));
  if (originalGunnerAvailable) {
    return Object.freeze({
      state: idleState(replacement),
      mainGunnerAvailableSeconds: deltaSeconds
    });
  }

  let candidate = currentTask.phase === 'IDLE'
    ? null
    : findCrewmanById(crew, currentTask.candidateCrewId);
  if (
    !isCrewmanTaskAvailable(candidate)
    || candidate.role !== currentTask.sourceRole
    || !replacement.candidateRoles.includes(candidate.role)
  ) {
    candidate = findCandidate(crew, replacement);
  }
  if (!candidate) {
    return Object.freeze({
      state: idleState(replacement),
      mainGunnerAvailableSeconds: 0
    });
  }

  if (
    currentTask.phase === 'COMPLETE'
    && candidate.id === currentTask.candidateCrewId
  ) {
    return Object.freeze({
      state: freezeState(replacement, currentTask),
      mainGunnerAvailableSeconds: deltaSeconds
    });
  }

  const continuing = currentTask.phase === 'TRANSFERRING'
    && candidate.id === currentTask.candidateCrewId;
  const previousElapsedSeconds = continuing ? currentTask.elapsedSeconds : 0;
  const elapsedSeconds = previousElapsedSeconds + deltaSeconds;
  const complete = elapsedSeconds + TIME_EPSILON_SECONDS >= replacement.delaySeconds;
  const stateAfterStep = freezeState(replacement, {
    phase: complete ? 'COMPLETE' : 'TRANSFERRING',
    candidateCrewId: candidate.id,
    sourceRole: candidate.role,
    elapsedSeconds: complete ? replacement.delaySeconds : elapsedSeconds
  });
  const availableSeconds = complete
    ? Math.max(0, deltaSeconds - (replacement.delaySeconds - previousElapsedSeconds))
    : 0;
  return Object.freeze({
    state: stateAfterStep,
    mainGunnerAvailableSeconds: availableSeconds <= TIME_EPSILON_SECONDS
      ? 0
      : availableSeconds
  });
}

export function advanceVehicleCrewTaskState(state, policy, crew, deltaSeconds) {
  return advanceVehicleCrewTaskStep(state, policy, crew, deltaSeconds).state;
}

export function effectiveVehicleCrewRole(crewman, state) {
  if (!isCrewmanTaskAvailable(crewman)) return null;
  const task = state?.mainGunnerReplacement;
  if (!task || task.phase === 'IDLE' || crewman.id !== task.candidateCrewId) {
    return crewman.role;
  }
  if (task.phase === 'TRANSFERRING') return null;
  return task.targetRole;
}

export function crewmanHasEffectiveVehicleRole(crewman, roles, state) {
  if (!Array.isArray(roles)) return false;
  const effectiveRole = effectiveVehicleCrewRole(crewman, state);
  return effectiveRole != null && roles.includes(effectiveRole);
}

export function hasEffectiveVehicleCrewRole(state, crew, roles) {
  return Array.isArray(crew)
    && crew.some(crewman => crewmanHasEffectiveVehicleRole(crewman, roles, state));
}

export function captureVehicleCrewTaskState(state) {
  if (!state) return null;
  return {
    modelVersion: state.modelVersion,
    mainGunnerReplacement: { ...state.mainGunnerReplacement }
  };
}

export function restoreVehicleCrewTaskState(policy, savedState) {
  if (!policy) return null;
  const replacement = requirePolicy(policy);
  if (!savedState) return idleState(replacement);
  if (savedState.modelVersion !== MODEL_VERSION) {
    throw new TypeError(`Unsupported vehicle crew-task model version ${savedState.modelVersion}`);
  }
  const saved = savedState.mainGunnerReplacement;
  if (!saved || saved.policyId !== replacement.id) {
    throw new TypeError('Vehicle crew-task state does not match the catalog policy');
  }
  return freezeState(replacement, saved);
}
