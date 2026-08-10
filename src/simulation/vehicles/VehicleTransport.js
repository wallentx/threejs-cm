const MODEL_VERSION = 'vehicle-transport-v1';
const TRANSFER_EPSILON_SECONDS = 1e-9;
const TRANSFER_ACTIONS = new Set(['EMBARK', 'DISEMBARK']);
const ASSIGNMENT_PHASES = new Set([
  'BOARDING',
  'EMBARKED',
  'DISEMBARKING'
]);
const UNAVAILABLE_STATUSES = new Set([
  'KIA',
  'INCAPACITATED',
  'DEAD',
  'SURRENDERED'
]);

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  return value;
}

function requireStableId(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty stable string`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function positiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be positive and finite`);
  }
  return value;
}

function cloneCargo(cargo = {}) {
  return Object.fromEntries(
    Object.entries(cargo).map(([id, rounds]) => [
      requireStableId(id, 'transport cargo id'),
      nonNegativeInteger(rounds, `transport cargo ${id}`)
    ])
  );
}

function clonePendingTransfer(transfer) {
  if (!transfer) return null;
  requireRecord(transfer, 'transport pending transfer');
  if (!TRANSFER_ACTIONS.has(transfer.action)) {
    throw new TypeError(`unsupported transport action ${transfer.action}`);
  }
  const durationSeconds = positiveNumber(
    transfer.durationSeconds,
    'transport transfer durationSeconds'
  );
  const cloned = {
    action: transfer.action,
    infantryUnitId: requireStableId(
      transfer.infantryUnitId,
      'transport transfer infantryUnitId'
    ),
    elapsedSeconds: Math.max(
      0,
      Math.min(
        durationSeconds,
        Number.isFinite(transfer.elapsedSeconds)
          ? transfer.elapsedSeconds
          : 0
      )
    ),
    durationSeconds
  };
  if (transfer.action === 'EMBARK') {
    cloned.passengerCount = nonNegativeInteger(
      transfer.passengerCount ?? 0,
      'transport transfer passengerCount'
    );
  }
  return cloned;
}

export function validateVehicleTransportSpec(spec) {
  if (!spec) return null;
  requireRecord(spec, 'vehicle transport spec');
  if (!Number.isSafeInteger(spec.passengerCapacity) || spec.passengerCapacity <= 0) {
    throw new TypeError('vehicle transport passengerCapacity must be positive');
  }
  positiveNumber(spec.embarkRadiusMeters, 'vehicle transport embarkRadiusMeters');
  positiveNumber(spec.embarkSeconds, 'vehicle transport embarkSeconds');
  positiveNumber(spec.disembarkSeconds, 'vehicle transport disembarkSeconds');
  if (
    !Array.isArray(spec.disembarkOffsetLocal)
    || spec.disembarkOffsetLocal.length < 3
    || !spec.disembarkOffsetLocal.slice(0, 3).every(Number.isFinite)
  ) {
    throw new TypeError(
      'vehicle transport disembarkOffsetLocal must contain three finite values'
    );
  }
  if (typeof spec.dataQuality !== 'string' || spec.dataQuality.length === 0) {
    throw new TypeError('vehicle transport requires a dataQuality label');
  }
  cloneCargo(spec.initialCargo);
  return spec;
}

export function createVehicleTransportState(spec, saved = null) {
  if (!spec) return null;
  validateVehicleTransportSpec(spec);
  if (saved?.modelVersion && saved.modelVersion !== MODEL_VERSION) {
    throw new TypeError(
      `unsupported vehicle transport version ${saved.modelVersion}`
    );
  }
  const passengerUnitIds = Array.isArray(saved?.passengerUnitIds)
    ? saved.passengerUnitIds.map(id => requireStableId(
        id,
        'vehicle transport passenger unit id'
      ))
    : [];
  if (new Set(passengerUnitIds).size !== passengerUnitIds.length) {
    throw new Error('vehicle transport passenger unit IDs must be unique');
  }
  return {
    modelVersion: MODEL_VERSION,
    passengerUnitIds,
    passengerCountsByUnitId: Object.fromEntries(passengerUnitIds.map(id => [
      id,
      nonNegativeInteger(
        saved?.passengerCountsByUnitId?.[id] ?? 0,
        `vehicle transport passenger count ${id}`
      )
    ])),
    pendingTransfer: clonePendingTransfer(saved?.pendingTransfer),
    cargo: cloneCargo(saved?.cargo ?? spec.initialCargo)
  };
}

export function captureVehicleTransportState(state) {
  if (!state) return null;
  return {
    modelVersion: MODEL_VERSION,
    passengerUnitIds: [...state.passengerUnitIds],
    passengerCountsByUnitId: { ...state.passengerCountsByUnitId },
    pendingTransfer: state.pendingTransfer
      ? { ...state.pendingTransfer }
      : null,
    cargo: { ...state.cargo }
  };
}

export function restoreInfantryTransportAssignment(saved) {
  if (!saved) return null;
  requireRecord(saved, 'infantry transport assignment');
  if (saved.modelVersion && saved.modelVersion !== MODEL_VERSION) {
    throw new TypeError(
      `unsupported infantry transport version ${saved.modelVersion}`
    );
  }
  if (!ASSIGNMENT_PHASES.has(saved.phase)) {
    throw new TypeError(`unsupported infantry transport phase ${saved.phase}`);
  }
  return {
    modelVersion: MODEL_VERSION,
    vehicleId: requireStableId(
      saved.vehicleId,
      'infantry transport vehicleId'
    ),
    phase: saved.phase
  };
}

export function captureInfantryTransportAssignment(assignment) {
  return assignment ? { ...assignment, modelVersion: MODEL_VERSION } : null;
}

export function availableTransportSeats(state, spec, passengerCounts) {
  validateVehicleTransportSpec(spec);
  const occupied = state.passengerUnitIds.reduce(
    (sum, unitId) => sum + nonNegativeInteger(
      passengerCounts?.[unitId]
        ?? state.passengerCountsByUnitId?.[unitId]
        ?? 0,
      `passenger count for ${unitId}`
    ),
    0
  );
  return Math.max(0, spec.passengerCapacity - occupied);
}

export function beginTransportTransfer(state, spec, {
  action,
  infantryUnitId,
  passengerCount = 0,
  passengerCounts = {},
  distanceMeters,
  vehicleOperational = true,
  infantryAvailable = true
}) {
  if (!state || !spec) return { accepted: false, reason: 'NOT_A_TRANSPORT' };
  if (!TRANSFER_ACTIONS.has(action)) {
    return { accepted: false, reason: 'INVALID_ACTION' };
  }
  if (state.pendingTransfer) {
    return { accepted: false, reason: 'TRANSFER_IN_PROGRESS' };
  }
  if (!vehicleOperational) {
    return { accepted: false, reason: 'VEHICLE_INOPERABLE' };
  }
  if (!infantryAvailable) {
    return { accepted: false, reason: 'INFANTRY_UNAVAILABLE' };
  }
  if (!Number.isFinite(distanceMeters) || distanceMeters > spec.embarkRadiusMeters) {
    return { accepted: false, reason: 'OUT_OF_RANGE' };
  }
  requireStableId(infantryUnitId, 'transport infantryUnitId');
  if (action === 'EMBARK') {
    if (state.passengerUnitIds.includes(infantryUnitId)) {
      return { accepted: false, reason: 'ALREADY_EMBARKED' };
    }
    if (
      !Number.isSafeInteger(passengerCount)
      || passengerCount <= 0
      || passengerCount > availableTransportSeats(
        state,
        spec,
        passengerCounts
      )
    ) {
      return { accepted: false, reason: 'CAPACITY' };
    }
  } else if (!state.passengerUnitIds.includes(infantryUnitId)) {
    return { accepted: false, reason: 'NOT_EMBARKED' };
  }
  state.pendingTransfer = {
    action,
    infantryUnitId,
    elapsedSeconds: 0,
    durationSeconds: action === 'EMBARK'
      ? spec.embarkSeconds
      : spec.disembarkSeconds
  };
  if (action === 'EMBARK') {
    state.pendingTransfer.passengerCount = passengerCount;
  }
  return {
    accepted: true,
    reason: null,
    assignment: {
      modelVersion: MODEL_VERSION,
      vehicleId: null,
      phase: action === 'EMBARK' ? 'BOARDING' : 'DISEMBARKING'
    }
  };
}

export function cancelTransportTransfer(state) {
  if (!state?.pendingTransfer) return null;
  const cancelled = { ...state.pendingTransfer };
  state.pendingTransfer = null;
  return cancelled;
}

export function advanceTransportTransfer(state, deltaSeconds) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new TypeError(
      'transport deltaSeconds must be finite and non-negative'
    );
  }
  const transfer = state?.pendingTransfer;
  if (!transfer) return null;
  transfer.elapsedSeconds = Math.min(
    transfer.durationSeconds,
    transfer.elapsedSeconds + deltaSeconds
  );
  if (
    transfer.elapsedSeconds + TRANSFER_EPSILON_SECONDS
      < transfer.durationSeconds
  ) {
    return null;
  }
  if (transfer.action === 'EMBARK') {
    state.passengerUnitIds.push(transfer.infantryUnitId);
    state.passengerCountsByUnitId[transfer.infantryUnitId] =
      transfer.passengerCount;
  } else {
    state.passengerUnitIds = state.passengerUnitIds.filter(
      id => id !== transfer.infantryUnitId
    );
    delete state.passengerCountsByUnitId[transfer.infantryUnitId];
  }
  state.pendingTransfer = null;
  return { ...transfer, elapsedSeconds: transfer.durationSeconds };
}

function isAvailableAgent(agent) {
  return Boolean(
    agent
    && Number(agent.health) > 0
    && !UNAVAILABLE_STATUSES.has(
      String(agent.status ?? agent.state ?? '').toUpperCase()
    )
  );
}

function stableAgentOrder(agents) {
  return [...(agents ?? [])].sort((left, right) =>
    String(left.id).localeCompare(String(right.id))
  );
}

function transferRounds(cargo, cargoId, requested) {
  const available = cargo[cargoId] ?? 0;
  const transferred = Math.min(available, Math.max(0, requested));
  cargo[cargoId] = available - transferred;
  return transferred;
}

export function resupplyInfantryFromTransport({
  state,
  agents,
  weaponLookup,
  mortarTeamState = null,
  mortarTeamConfig = null
}) {
  if (!state) return { accepted: false, reason: 'NOT_A_TRANSPORT' };
  if (typeof weaponLookup !== 'function') {
    throw new TypeError('transport resupply requires weaponLookup');
  }
  const summary = {
    accepted: true,
    smallArmsRounds: 0,
    machineGunRounds: 0,
    mortarBombs60mm: 0,
    grenadeCount: 0,
    recipientSoldierIds: []
  };
  for (const agent of stableAgentOrder(agents)) {
    if (!isAvailableAgent(agent)) continue;
    const weapon = weaponLookup(agent.weaponId);
    if (!weapon || !Number.isSafeInteger(weapon.carriedAmmo)) continue;
    const cargoId = weapon.kind === 'machine_gun'
      ? 'machineGunRounds'
      : 'smallArmsRounds';
    const currentRounds = Math.max(
      0,
      (agent.magazineAmmo ?? 0) + (agent.reserveAmmo ?? 0)
    );
    const transferred = transferRounds(
      state.cargo,
      cargoId,
      Math.max(0, weapon.carriedAmmo - currentRounds)
    );
    if (transferred > 0) {
      agent.reserveAmmo = (agent.reserveAmmo ?? 0) + transferred;
      summary[cargoId] += transferred;
      summary.recipientSoldierIds.push(String(agent.id));
    }
    const support = agent.supportAmmunitionTransfer;
    if (support && support.remainingRounds < support.carriedRounds) {
      const supportTransferred = transferRounds(
        state.cargo,
        'machineGunRounds',
        support.carriedRounds - support.remainingRounds
      );
      if (supportTransferred > 0) {
        support.remainingRounds += supportTransferred;
        summary.machineGunRounds += supportTransferred;
        if (!summary.recipientSoldierIds.includes(String(agent.id))) {
          summary.recipientSoldierIds.push(String(agent.id));
        }
      }
    }
  }

  if (mortarTeamState && mortarTeamConfig?.ammunitionBySoldierId) {
    for (const soldierId of Object.keys(
      mortarTeamConfig.ammunitionBySoldierId
    ).sort()) {
      const target = mortarTeamConfig.ammunitionBySoldierId[soldierId];
      const current = mortarTeamState.roundsBySoldierId[soldierId] ?? 0;
      const transferred = transferRounds(
        state.cargo,
        'mortarBombs60mm',
        Math.max(0, target - current)
      );
      if (transferred > 0) {
        mortarTeamState.roundsBySoldierId[soldierId] = current + transferred;
        summary.mortarBombs60mm += transferred;
        if (!summary.recipientSoldierIds.includes(String(soldierId))) {
          summary.recipientSoldierIds.push(String(soldierId));
        }
      }
    }
  }
  return summary;
}

export function destroyTransportCargo(state) {
  if (!state) return 0;
  let destroyed = 0;
  for (const cargoId of Object.keys(state.cargo).sort()) {
    destroyed += state.cargo[cargoId];
    state.cargo[cargoId] = 0;
  }
  return destroyed;
}

export { MODEL_VERSION as VEHICLE_TRANSPORT_MODEL_VERSION };
