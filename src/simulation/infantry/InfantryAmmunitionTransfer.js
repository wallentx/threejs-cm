const MODEL_VERSION = 1;
const TIME_EPSILON_SECONDS = 1e-9;
const UNAVAILABLE_STATUSES = new Set(['KIA', 'INCAPACITATED']);

function requireStableId(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty stable string`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function requirePositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be positive and finite`);
  }
  return value;
}

function requireConfiguration(configuration) {
  if (!configuration || typeof configuration !== 'object') {
    throw new TypeError('infantry ammunition transfer requires a configuration');
  }
  const carriedRounds = requirePositiveInteger(
    configuration.carriedRounds,
    'infantry ammunition transfer carriedRounds'
  );
  const handoffRounds = requirePositiveInteger(
    configuration.handoffRounds,
    'infantry ammunition transfer handoffRounds'
  );
  if (handoffRounds > carriedRounds) {
    throw new RangeError(
      'infantry ammunition transfer handoffRounds cannot exceed carriedRounds'
    );
  }
  if (
    typeof configuration.dataQuality !== 'string'
    || configuration.dataQuality.length === 0
  ) {
    throw new TypeError(
      'infantry ammunition transfer requires a dataQuality label'
    );
  }
  return {
    id: requireStableId(configuration.id, 'infantry ammunition transfer id'),
    donorSoldierId: requireStableId(
      configuration.donorSoldierId,
      'infantry ammunition transfer donorSoldierId'
    ),
    recipientSoldierId: requireStableId(
      configuration.recipientSoldierId,
      'infantry ammunition transfer recipientSoldierId'
    ),
    weaponId: requireStableId(
      configuration.weaponId,
      'infantry ammunition transfer weaponId'
    ),
    carriedRounds,
    handoffRounds,
    rangeMeters: requirePositiveNumber(
      configuration.rangeMeters,
      'infantry ammunition transfer rangeMeters'
    ),
    delaySeconds: requirePositiveNumber(
      configuration.delaySeconds,
      'infantry ammunition transfer delaySeconds'
    ),
    dataQuality: configuration.dataQuality
  };
}

function freezeState(configuration, state = {}) {
  const remainingRounds = Math.max(
    0,
    Math.min(
      configuration.carriedRounds,
      Number.isSafeInteger(state.remainingRounds)
        ? state.remainingRounds
        : configuration.carriedRounds
    )
  );
  const elapsedSeconds = remainingRounds === 0
    ? configuration.delaySeconds
    : Math.max(
        0,
        Math.min(
          configuration.delaySeconds,
          Number.isFinite(state.elapsedSeconds) ? state.elapsedSeconds : 0
        )
      );
  const phase = remainingRounds === 0
    ? 'COMPLETE'
    : (elapsedSeconds > 0 ? 'TRANSFERRING' : 'READY');
  return Object.freeze({
    modelVersion: MODEL_VERSION,
    ...configuration,
    remainingRounds,
    phase,
    elapsedSeconds
  });
}

function isParticipantAvailable(participant) {
  return Boolean(
    participant
    && Number(participant.health) > 0
    && !UNAVAILABLE_STATUSES.has(participant.status)
  );
}

function participantsAreEligible(state, donor, recipient, distanceMeters) {
  return Boolean(
    isParticipantAvailable(donor)
    && isParticipantAvailable(recipient)
    && donor.id === state.donorSoldierId
    && recipient.id === state.recipientSoldierId
    && recipient.weaponId === state.weaponId
    && Number.isFinite(distanceMeters)
    && distanceMeters <= state.rangeMeters
  );
}

export function createInfantryAmmunitionTransferState(configuration) {
  return freezeState(requireConfiguration(configuration));
}

export function captureInfantryAmmunitionTransferState(state) {
  if (!state) return null;
  return { ...state };
}

export function restoreInfantryAmmunitionTransferState(savedState) {
  if (!savedState) return null;
  if (savedState.modelVersion !== MODEL_VERSION) {
    throw new TypeError(
      `unsupported infantry ammunition transfer version ${savedState.modelVersion}`
    );
  }
  return freezeState(requireConfiguration(savedState), savedState);
}

export function advanceInfantryAmmunitionTransfer(
  stateInput,
  { donor, recipient, distanceMeters } = {},
  deltaSeconds
) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError(
      'infantry ammunition transfer deltaSeconds must be finite and non-negative'
    );
  }
  const state = restoreInfantryAmmunitionTransferState(stateInput);
  if (!state || state.remainingRounds === 0) {
    return Object.freeze({ state, transferRounds: 0 });
  }
  if (!participantsAreEligible(state, donor, recipient, distanceMeters)) {
    return Object.freeze({
      state: freezeState(state, {
        remainingRounds: state.remainingRounds,
        elapsedSeconds: 0
      }),
      transferRounds: 0
    });
  }

  let remainingRounds = state.remainingRounds;
  let elapsedSeconds = state.elapsedSeconds + deltaSeconds;
  let transferRounds = 0;
  while (
    remainingRounds > 0
    && elapsedSeconds + TIME_EPSILON_SECONDS >= state.delaySeconds
  ) {
    const transferred = Math.min(state.handoffRounds, remainingRounds);
    transferRounds += transferred;
    remainingRounds -= transferred;
    elapsedSeconds = Math.max(0, elapsedSeconds - state.delaySeconds);
  }
  return Object.freeze({
    state: freezeState(state, {
      remainingRounds,
      elapsedSeconds: remainingRounds === 0
        ? state.delaySeconds
        : elapsedSeconds
    }),
    transferRounds
  });
}
