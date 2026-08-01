export const INFANTRY_CASUALTY_REACTION_APPROXIMATION =
  'first-order same-unit casualty awareness through terrain sight records; building aperture integration is not yet modeled';

export const INFANTRY_CASUALTY_REACTION_POLICY = Object.freeze({
  approximationLabel: INFANTRY_CASUALTY_REACTION_APPROXIMATION,
  maximumDistanceMeters: 18,
  baseSuppressionShock: 12,
  maxSuppressionShock: 28,
  timerDurationSeconds: 4.5,
  timerTicksPerSecond: 30,
  maxProcessedCasualtyEvents: 16
});

function stableId(value, label) {
  if ((typeof value === 'string' && value.length > 0)
      || (typeof value === 'number' && Number.isFinite(value))) {
    return Object.is(value, -0) ? 0 : value;
  }
  throw new TypeError(`${label} must be a non-empty stable ID`);
}

function position2(value, label) {
  const x = Array.isArray(value) ? value[0] : value?.x;
  const z = Array.isArray(value)
    ? (value.length === 2 ? value[1] : value[2])
    : value?.z;
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError(`${label} must contain finite X and Z components`);
  }
  return [Object.is(x, -0) ? 0 : x, Object.is(z, -0) ? 0 : z];
}

function inactive(reason, eventId = null, casualtyId = null, distanceMeters = null) {
  return Object.freeze({
    approximationLabel: INFANTRY_CASUALTY_REACTION_APPROXIMATION,
    active: false,
    reason,
    eventId,
    casualtyId,
    distanceMeters,
    shock: 0,
    timerSeconds: 0
  });
}

export function appendProcessedCasualtyEvent(ledger, eventId) {
  stableId(eventId, 'processed casualty eventId');
  const current = Array.isArray(ledger) ? ledger : [];
  if (current.includes(eventId)) return [...current];
  return [...current, eventId]
    .slice(-INFANTRY_CASUALTY_REACTION_POLICY.maxProcessedCasualtyEvents);
}

export function evaluateInfantryCasualtyReaction(input = {}) {
  const soldierId = stableId(input.soldierId, 'casualty reaction soldierId');
  const casualtyId = stableId(input.casualtyId, 'casualty reaction casualtyId');
  const eventId = stableId(input.eventId, 'casualty reaction eventId');

  if (soldierId === casualtyId) {
    return inactive('self-casualty', eventId, casualtyId);
  }
  if (input.sameUnit !== true) {
    return inactive('unrelated-unit', eventId, casualtyId);
  }
  if (input.available !== true) {
    return inactive('unavailable', eventId, casualtyId);
  }
  if (input.living !== true) {
    return inactive('casualty', eventId, casualtyId);
  }
  if (input.incapacitated !== false) {
    return inactive('incapacitated', eventId, casualtyId);
  }
  if (input.surrendered !== false) {
    return inactive('surrendered', eventId, casualtyId);
  }
  if (input.awareOfCasualty !== true) {
    return inactive('unaware', eventId, casualtyId);
  }
  if (input.hasLOS !== true) {
    return inactive('occluded', eventId, casualtyId);
  }
  if (input.alreadyProcessed === true) {
    return inactive('already-processed', eventId, casualtyId);
  }

  const [ox, oz] = position2(input.observerPosition, 'observerPosition');
  const [cx, cz] = position2(input.casualtyPosition, 'casualtyPosition');

  const distanceMeters = Math.hypot(ox - cx, oz - cz);
  if (distanceMeters > INFANTRY_CASUALTY_REACTION_POLICY.maximumDistanceMeters) {
    return inactive('out-of-range', eventId, casualtyId, distanceMeters);
  }

  const shock = Math.min(
    INFANTRY_CASUALTY_REACTION_POLICY.maxSuppressionShock,
    Math.max(
      INFANTRY_CASUALTY_REACTION_POLICY.baseSuppressionShock,
      INFANTRY_CASUALTY_REACTION_POLICY.maxSuppressionShock - distanceMeters
    )
  );

  return Object.freeze({
    approximationLabel: INFANTRY_CASUALTY_REACTION_APPROXIMATION,
    active: true,
    reason: 'observed-casualty',
    eventId,
    casualtyId,
    distanceMeters,
    shock,
    timerSeconds: INFANTRY_CASUALTY_REACTION_POLICY.timerDurationSeconds
  });
}
