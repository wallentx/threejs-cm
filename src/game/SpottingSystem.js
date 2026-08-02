import * as THREE from 'three';
import {
  CONTACT_CHANNEL,
  NEGATIVE_OBSERVATION_APPROXIMATION,
  cloneContact,
  clonePosition,
  createContact,
  decayContact,
  evaluateNegativeObservation,
  getContactUncertaintyRegionSamples,
  preferContact,
  publicContact
} from '../simulation/observation/ContactState.js';
import {
  isLivingObserver
} from '../simulation/observation/ObservationEquipment.js';
import {
  canRelayByRadio,
  canRelayByVoice,
  unitProfile
} from '../simulation/observation/CommunicationNetwork.js';
import {
  COMMUNICATION_RELAY_DELAY_APPROXIMATION,
  CommunicationRelayQueue,
  DEFAULT_COMMUNICATION_RELAY_DELAYS
} from '../simulation/observation/CommunicationRelayQueue.js';
import {
  projectWeaponReportContacts
} from '../simulation/observation/SoundContacts.js';
import {
  beginVisualIdentification,
  decayIdentificationNanoseconds,
  identificationProjection,
  normalizeIdentificationProgress,
  progressIdentificationNanoseconds,
  validateIdentificationProjection
} from '../simulation/observation/IdentificationQuality.js';
import {
  deriveOrientedBoxWorldAabb3D,
  intersectSegmentOrientedBox3D,
  segmentIntersectsWorldAabb3D
} from '../simulation/geometry/OrientedBox.js';
import {
  isBuildingOccupantExposed
} from '../simulation/buildings/BuildingExposure.js';

let _negSampleVec = null;
import {
  validateTerrainSightOccluderSnapshot
} from '../simulation/terrain/TerrainSightOccluderSnapshot.js';
import {
  observerCapabilityFacingYaw,
  pointInsideObserverFov,
  resolveObserverCapabilities
} from '../simulation/observation/ObserverCapabilities.js';

const EXPERIENCE_RANGE_M = Object.freeze({
  Green: 140,
  Regular: 160,
  Veteran: 185,
  Crack: 210,
  Elite: 220
});

const DEFAULT_SETTINGS = Object.freeze({
  baseAcquisitionSeconds: 1.8,
  lostAcquisitionDecayRate: 0.5,
  observationMemorySeconds: 60,
  contactLifetimeSeconds: 60,
  uncertaintyGrowthMps: 0.75,
  soundContactLifetimeSeconds: 12,
  soundUncertaintyGrowthMps: 1.5,
  voiceConfidence: 0.92,
  radioConfidence: 0.86,
  voiceRelayDelaySeconds:
    DEFAULT_COMMUNICATION_RELAY_DELAYS[CONTACT_CHANNEL.VOICE],
  radioRelayDelaySeconds:
    DEFAULT_COMMUNICATION_RELAY_DELAYS[CONTACT_CHANNEL.RADIO],
  relayDelayApproximation: COMMUNICATION_RELAY_DELAY_APPROXIMATION,
  terrainSampleMeters: 2.5
});

const TIME_PRECISION = 1e9;
const PROGRESS_PRECISION = 1e12;
const CLOCK_HALF_NANOSECOND_SECONDS = 0.5 / TIME_PRECISION;
const CLOCK_SUB_NANOSECOND_DRIFT_SECONDS = 1e-15;
const ACQUISITION_PROGRESS_TICKS = BigInt(PROGRESS_PRECISION);
// First-order presentation smoothing only. Direct observation, direct-contact
// generation, identification, relay, and precision targeting use visibleNow.
// Half a second spans several 10 Hz observation samples; a previously acquired
// target also retains this bridge while its current sight path is valid so
// precision reacquisition cannot blink an otherwise visible mesh.
const DIRECT_RENDER_VISIBILITY_GRACE_NANOSECONDS = 500_000_000;
const CANONICAL_SPOTTING_STEP_NANOSECONDS = 100_000_000n;
const CANONICAL_SPOTTING_STEP_SECONDS = 0.1;
const ATTENTION_COLD_CADENCE_TICKS = 5;
// First-order gameplay approximation. Pairs inside this range are kept on the
// full observation path so short-range movement cannot wait on a cold phase.
const ATTENTION_CLOSE_RANGE_METERS = 80;
const ATTENTION_CLOSE_RANGE_APPROXIMATION =
  'gameplay approximation: unit bounds within 80 metres remain urgent';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function canonicalTime(value) {
  return Math.round(finite(value) * TIME_PRECISION) / TIME_PRECISION;
}

function normalizeClockCompensation(value) {
  if (Math.abs(value) <= CLOCK_SUB_NANOSECOND_DRIFT_SECONDS) return 0;
  return Object.is(value, -0) ? 0 : value;
}

function normalizeClockParts({
  timeWholeSeconds,
  timeNanoseconds,
  timeCompensationSeconds
}) {
  if (!Number.isSafeInteger(timeWholeSeconds)
      || !Number.isSafeInteger(timeNanoseconds)
      || !Number.isFinite(timeCompensationSeconds)) {
    throw new RangeError('spotting clock must remain safely representable');
  }
  if (timeCompensationSeconds >= CLOCK_HALF_NANOSECOND_SECONDS) {
    timeNanoseconds++;
    timeCompensationSeconds -= 1 / TIME_PRECISION;
  } else if (timeCompensationSeconds < -CLOCK_HALF_NANOSECOND_SECONDS) {
    timeNanoseconds--;
    timeCompensationSeconds += 1 / TIME_PRECISION;
  }
  timeCompensationSeconds = normalizeClockCompensation(
    timeCompensationSeconds
  );
  const wholeCarry = Math.floor(timeNanoseconds / TIME_PRECISION);
  timeWholeSeconds += wholeCarry;
  timeNanoseconds -= wholeCarry * TIME_PRECISION;
  if (!Number.isSafeInteger(timeWholeSeconds)
      || timeWholeSeconds < 0
      || !Number.isSafeInteger(timeNanoseconds)
      || timeNanoseconds < 0
      || timeNanoseconds >= TIME_PRECISION
      || !Number.isFinite(timeCompensationSeconds)
      || timeCompensationSeconds < -CLOCK_HALF_NANOSECOND_SECONDS
      || timeCompensationSeconds >= CLOCK_HALF_NANOSECOND_SECONDS) {
    throw new RangeError('spotting clock must remain safely representable');
  }
  return {
    timeWholeSeconds,
    timeNanoseconds,
    timeCompensationSeconds
  };
}

function splitClockDelta(deltaSeconds) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError(
      'spotting clock delta must be finite and non-negative'
    );
  }
  const wholeSeconds = Math.trunc(deltaSeconds);
  if (!Number.isSafeInteger(wholeSeconds)) {
    throw new RangeError('spotting clock delta must remain safely representable');
  }
  const fractionalSeconds = deltaSeconds - wholeSeconds;
  const roundedNanoseconds = Math.round(
    fractionalSeconds * TIME_PRECISION
  );
  return normalizeClockParts({
    timeWholeSeconds: wholeSeconds,
    timeNanoseconds: Object.is(roundedNanoseconds, -0)
      ? 0
      : roundedNanoseconds,
    timeCompensationSeconds:
      fractionalSeconds - roundedNanoseconds / TIME_PRECISION
  });
}

function addClockDelta(clock, deltaSeconds) {
  const delta = splitClockDelta(deltaSeconds);
  return normalizeClockParts({
    timeWholeSeconds: clock.timeWholeSeconds + delta.timeWholeSeconds,
    timeNanoseconds: clock.timeNanoseconds + delta.timeNanoseconds,
    timeCompensationSeconds:
      clock.timeCompensationSeconds + delta.timeCompensationSeconds
  });
}

function clockFromAbsoluteSeconds(seconds) {
  return addClockDelta({
    timeWholeSeconds: 0,
    timeNanoseconds: 0,
    timeCompensationSeconds: 0
  }, seconds);
}

function clockTime(clock) {
  const value = canonicalTime(
    clock.timeWholeSeconds
      + clock.timeNanoseconds / TIME_PRECISION
  );
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('spotting clock must remain safely representable');
  }
  return value;
}

function clockAccumulator(clock) {
  const value = clockTime(clock) + clock.timeCompensationSeconds;
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('spotting clock must remain safely representable');
  }
  return value;
}

function clockNanosecondDifference(later, earlier) {
  return BigInt(later.timeWholeSeconds - earlier.timeWholeSeconds)
    * BigInt(TIME_PRECISION)
    + BigInt(later.timeNanoseconds - earlier.timeNanoseconds);
}

function addClockNanoseconds(clock, nanoseconds) {
  if (typeof nanoseconds !== 'bigint' || nanoseconds < 0n) {
    throw new TypeError('spotting nanosecond offset must be non-negative');
  }
  const wholeSeconds = nanoseconds / BigInt(TIME_PRECISION);
  const fractionalNanoseconds = nanoseconds % BigInt(TIME_PRECISION);
  if (wholeSeconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('spotting clock offset must remain safely representable');
  }
  return normalizeClockParts({
    timeWholeSeconds: clock.timeWholeSeconds + Number(wholeSeconds),
    timeNanoseconds:
      clock.timeNanoseconds + Number(fractionalNanoseconds),
    timeCompensationSeconds: clock.timeCompensationSeconds
  });
}

function validateCapturedClock(state) {
  if (!Number.isSafeInteger(state?.timeWholeSeconds)
      || state.timeWholeSeconds < 0
      || !Number.isSafeInteger(state?.timeNanoseconds)
      || state.timeNanoseconds < 0
      || state.timeNanoseconds >= TIME_PRECISION
      || !Number.isFinite(state?.timeCompensationSeconds)
      || state.timeCompensationSeconds
        < -CLOCK_HALF_NANOSECOND_SECONDS
      || state.timeCompensationSeconds
        >= CLOCK_HALF_NANOSECOND_SECONDS
      || (
        state.timeCompensationSeconds !== 0
        && Math.abs(state.timeCompensationSeconds)
          <= CLOCK_SUB_NANOSECOND_DRIFT_SECONDS
      )) {
    throw new TypeError(
      'spotting canonical clock components are invalid'
    );
  }
  const clock = {
    timeWholeSeconds: state?.timeWholeSeconds,
    timeNanoseconds: state?.timeNanoseconds,
    timeCompensationSeconds: Object.is(
      state?.timeCompensationSeconds,
      -0
    )
      ? 0
      : state?.timeCompensationSeconds
  };
  if (state.time !== clockTime(clock)
      || state.timeAccumulator !== clockAccumulator(clock)) {
    throw new TypeError(
      'spotting time projections must match canonical clock components'
    );
  }
  return clock;
}

function acquisitionRequirementNanoseconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new TypeError(
      'spotting acquisition duration must be positive and finite'
    );
  }
  const wholeSeconds = Math.trunc(seconds);
  const nanoseconds = BigInt(wholeSeconds) * BigInt(TIME_PRECISION)
    + BigInt(Math.round((seconds - wholeSeconds) * TIME_PRECISION));
  if (nanoseconds <= 0n
      || nanoseconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      'spotting acquisition duration must remain safely representable'
    );
  }
  return Number(nanoseconds);
}

function acquisitionProjection({
  acquisitionWorkTicks,
  acquisitionWorkRemainder,
  acquisitionRequiredNanoseconds
}) {
  if (acquisitionRequiredNanoseconds === null) {
    return acquisitionWorkTicks / PROGRESS_PRECISION;
  }
  const required = BigInt(acquisitionRequiredNanoseconds);
  const numerator = BigInt(acquisitionWorkTicks) * required
    + BigInt(acquisitionWorkRemainder);
  const roundedTicks = (
    numerator * 2n + required
  ) / (required * 2n);
  return Number(roundedTicks) / PROGRESS_PRECISION;
}

function validateAcquisitionCapture(saved) {
  const ticks = saved?.acquisitionWorkTicks;
  const remainder = saved?.acquisitionWorkRemainder;
  const required = saved?.acquisitionRequiredNanoseconds;
  if (!Number.isSafeInteger(ticks)
      || ticks < 0
      || ticks > PROGRESS_PRECISION
      || !Number.isSafeInteger(remainder)
      || remainder < 0
      || (
        required !== null
        && (
          !Number.isSafeInteger(required)
          || required <= 0
          || remainder >= required
        )
      )
      || (required === null && remainder !== 0)
      || (ticks === PROGRESS_PRECISION && remainder !== 0)) {
    throw new TypeError(
      'spotting observation acquisition work state is invalid'
    );
  }
  const acquisition = acquisitionProjection({
    acquisitionWorkTicks: ticks,
    acquisitionWorkRemainder: remainder,
    acquisitionRequiredNanoseconds: required
  });
  if (!Number.isFinite(saved.acquisition)
      || saved.acquisition !== acquisition) {
    throw new TypeError(
      'spotting observation acquisition must match acquisition work state'
    );
  }
  return {
    acquisition,
    acquisitionWorkTicks: ticks,
    acquisitionWorkRemainder: remainder,
    acquisitionRequiredNanoseconds: required
  };
}

function finiteCapturePosition(position) {
  const values = Array.isArray(position)
    ? position
    : [position?.x, position?.y, position?.z];
  return values.length === 3
    && values.every(Number.isFinite);
}

function validateObservationEpisodeCapture(
  saved,
  acquisitionState,
  maximumTime
) {
  if (typeof saved?.visibleNow !== 'boolean'
      || typeof saved?.directEpisodeActive !== 'boolean') {
    throw new TypeError(
      'spotting observation visibility and direct episode flags must be boolean'
    );
  }
  const acquired =
    acquisitionState.acquisitionWorkTicks === PROGRESS_PRECISION;
  if (saved.visibleNow !== acquired) {
    throw new TypeError(
      'spotting observation visibility must match canonical acquisition work'
    );
  }
  if (saved.directEpisodeActive !== saved.visibleNow) {
    throw new TypeError(
      'spotting observation direct episode activity must match visibility'
    );
  }
  if (!Number.isSafeInteger(saved.directEpisodeSequence)
      || saved.directEpisodeSequence < 0) {
    throw new TypeError(
      'spotting observation directEpisodeSequence must be a non-negative safe integer'
    );
  }
  const hasAcquiredAt = saved.directEpisodeAcquiredAt !== null;
  const hasSnapshot = saved.directEpisodeSnapshot !== null;
  if (hasAcquiredAt !== hasSnapshot) {
    throw new TypeError(
      'spotting observation direct episode boundary and snapshot must be present together'
    );
  }
  if (hasAcquiredAt
      && (
        !Number.isFinite(saved.directEpisodeAcquiredAt)
        || saved.directEpisodeAcquiredAt < 0
        || saved.directEpisodeAcquiredAt > maximumTime
        || !finiteCapturePosition(saved.directEpisodeSnapshot?.position)
      )) {
    throw new TypeError(
      'spotting observation direct episode snapshot is invalid'
    );
  }
  if (saved.directEpisodeActive && !hasAcquiredAt) {
    throw new TypeError(
      'spotting active observation requires a direct episode snapshot'
    );
  }
}

function validateVisibilityGraceCapture(saved, maximumTime) {
  const remaining = saved?.visibilityGraceRemainingNanoseconds;
  if (!Number.isSafeInteger(remaining)
      || Object.is(remaining, -0)
      || remaining < 0
      || remaining > DIRECT_RENDER_VISIBILITY_GRACE_NANOSECONDS) {
    throw new TypeError(
      'spotting visibility grace must be bounded integer nanoseconds'
    );
  }
  if (saved.visibleNow
      && remaining !== DIRECT_RENDER_VISIBILITY_GRACE_NANOSECONDS) {
    throw new TypeError(
      'spotting visible observation must carry the full visibility grace'
    );
  }
  if (remaining > 0
      && (
        !Number.isFinite(saved.lastSeenAt)
        || saved.lastSeenAt < 0
        || saved.lastSeenAt > maximumTime
        || !finiteCapturePosition(saved.lastSeenPosition)
        || saved.directEpisodeAcquiredAt === null
        || saved.directEpisodeSnapshot === null
      )) {
    throw new TypeError(
      'spotting visibility grace requires a prior direct observation'
    );
  }
  return remaining;
}

function validateDirectObservationEpisodeCapture(saved, maximumTime) {
  if (typeof saved?.active !== 'boolean'
      || !Number.isSafeInteger(saved?.episodeSequence)
      || saved.episodeSequence < 0
      || !Number.isFinite(saved?.acquiredAt)
      || saved.acquiredAt < 0
      || saved.acquiredAt > maximumTime
      || !finiteCapturePosition(saved?.position)) {
    throw new TypeError(
      'spotting direct observation episode is invalid'
    );
  }
}

function validateDirectEpisodeCoherence(observations, episodes) {
  const visiblePairs = new Set();
  for (const targetMap of observations.values()) {
    for (const observation of targetMap.values()) {
      if (!observation.visibleNow) continue;
      visiblePairs.add(directEpisodeKey(
        observation.observerUnitId,
        observation.targetUnitId
      ));
    }
  }
  for (const key of visiblePairs) {
    if (episodes.get(key)?.active !== true) {
      throw new TypeError(
        'spotting visible observation requires an active direct observation episode'
      );
    }
  }
  for (const [key, episode] of episodes) {
    if (episode.active !== visiblePairs.has(key)) {
      throw new TypeError(
        'spotting direct observation episode activity must match visible observations'
      );
    }
  }
}

function legacyObservationIsAcquired(saved, version) {
  const visible = saved?.visibleNow === true;
  return version >= 3
    ? visible && saved?.directEpisodeActive === true
    : visible;
}

function migrateAcquisitionState(saved, legacyAcquired) {
  const acquisition = Math.max(
    0,
    Math.min(1, finite(saved?.acquisition))
  );
  const ticks = legacyAcquired
    ? PROGRESS_PRECISION
    : Math.min(
        PROGRESS_PRECISION - 1,
        Math.round(acquisition * PROGRESS_PRECISION)
      );
  return {
    acquisition: ticks / PROGRESS_PRECISION,
    acquisitionWorkTicks: ticks,
    acquisitionWorkRemainder: 0,
    acquisitionRequiredNanoseconds:
      ticks > 0 ? TIME_PRECISION : null
  };
}

function advanceAcquisitionWork(observation, requiredInput, deltaNanoseconds) {
  if (typeof deltaNanoseconds !== 'bigint' || deltaNanoseconds < 0n) {
    throw new TypeError('spotting acquisition delta must be non-negative');
  }
  if (observation.acquisitionRequiredNanoseconds === null) {
    observation.acquisitionRequiredNanoseconds = requiredInput;
    observation.acquisitionWorkRemainder = 0;
  } else if (
    observation.acquisitionRequiredNanoseconds !== requiredInput
    && observation.acquisitionWorkTicks < PROGRESS_PRECISION
  ) {
    // Preserve the exact accumulated fraction below one picoprogress tick
    // when current observation conditions change the acquisition duration.
    const previousRequired = BigInt(
      observation.acquisitionRequiredNanoseconds
    );
    const nextRequired = BigInt(requiredInput);
    const rebasedRemainder = (
      BigInt(observation.acquisitionWorkRemainder)
        * nextRequired * 2n
      + previousRequired
    ) / (previousRequired * 2n);
    if (rebasedRemainder >= nextRequired) {
      observation.acquisitionWorkTicks++;
      observation.acquisitionWorkRemainder = 0;
    } else {
      observation.acquisitionWorkRemainder =
        Number(rebasedRemainder);
    }
    observation.acquisitionRequiredNanoseconds = requiredInput;
  }
  const required = BigInt(observation.acquisitionRequiredNanoseconds);
  const previousTicks = BigInt(observation.acquisitionWorkTicks);
  const previousRemainder = BigInt(
    observation.acquisitionWorkRemainder
  );
  const remainingWork = (
    ACQUISITION_PROGRESS_TICKS - previousTicks
  ) * required - previousRemainder;
  const nanosecondsToAcquire = remainingWork <= 0n
    ? 0n
    : (
        remainingWork + ACQUISITION_PROGRESS_TICKS - 1n
      ) / ACQUISITION_PROGRESS_TICKS;
  const accumulatedRemainder = previousRemainder
    + deltaNanoseconds * ACQUISITION_PROGRESS_TICKS;
  const gainedTicks = accumulatedRemainder / required;
  let nextTicks = previousTicks + gainedTicks;
  let nextRemainder = accumulatedRemainder % required;
  if (nextTicks >= ACQUISITION_PROGRESS_TICKS) {
    nextTicks = ACQUISITION_PROGRESS_TICKS;
    nextRemainder = 0n;
  }
  observation.acquisitionWorkTicks = Number(nextTicks);
  observation.acquisitionWorkRemainder = Number(nextRemainder);
  observation.acquisition = acquisitionProjection(observation);
  return {
    visibleNow: nextTicks === ACQUISITION_PROGRESS_TICKS,
    nanosecondsToAcquire
  };
}

function decayAcquisitionWork(
  observation,
  deltaNanoseconds,
  lossTicksPerNanosecond
) {
  const required = observation.acquisitionRequiredNanoseconds;
  if (required === null) {
    const nextTicks = BigInt(observation.acquisitionWorkTicks)
      - deltaNanoseconds * BigInt(lossTicksPerNanosecond);
    observation.acquisitionWorkTicks = Number(
      nextTicks < 0n ? 0n : nextTicks
    );
  } else {
    const requiredBigInt = BigInt(required);
    const currentWork =
      BigInt(observation.acquisitionWorkTicks) * requiredBigInt
      + BigInt(observation.acquisitionWorkRemainder);
    const lostWork = deltaNanoseconds
      * BigInt(lossTicksPerNanosecond)
      * requiredBigInt;
    const nextWork = currentWork > lostWork
      ? currentWork - lostWork
      : 0n;
    observation.acquisitionWorkTicks = Number(
      nextWork / requiredBigInt
    );
    observation.acquisitionWorkRemainder = Number(
      nextWork % requiredBigInt
    );
  }
  if (observation.acquisitionWorkTicks === 0
      && observation.acquisitionWorkRemainder === 0) {
    observation.acquisitionRequiredNanoseconds = null;
  }
  observation.acquisition = acquisitionProjection(observation);
}

function updateVisibilityGrace(
  observation,
  deltaNanoseconds,
  { retainWhileSighted = false } = {}
) {
  if (typeof deltaNanoseconds !== 'bigint' || deltaNanoseconds < 0n) {
    throw new TypeError('spotting visibility grace delta must be non-negative');
  }
  if (observation.visibleNow || retainWhileSighted) {
    observation.visibilityGraceRemainingNanoseconds =
      DIRECT_RENDER_VISIBILITY_GRACE_NANOSECONDS;
    return;
  }
  const remaining = Number.isSafeInteger(
    observation.visibilityGraceRemainingNanoseconds
  )
    ? Math.max(
        0,
        Math.min(
          DIRECT_RENDER_VISIBILITY_GRACE_NANOSECONDS,
          observation.visibilityGraceRemainingNanoseconds
        )
      )
    : 0;
  const remainingBigInt = BigInt(remaining);
  observation.visibilityGraceRemainingNanoseconds =
    remainingBigInt > deltaNanoseconds
      ? Number(remainingBigInt - deltaNanoseconds)
      : 0;
}

function positionObject(position) {
  if (!position) return { x: 0, y: 0, z: 0 };
  if (Array.isArray(position)) {
    return {
      x: finite(position[0]),
      y: finite(position[1]),
      z: finite(position[2])
    };
  }
  return {
    x: finite(position.x),
    y: finite(position.y),
    z: finite(position.z)
  };
}

function addHeight(position, height) {
  const result = positionObject(position);
  result.y += height;
  return result;
}

function distance3d(left, right) {
  return Math.hypot(
    right.x - left.x,
    right.y - left.y,
    right.z - left.z
  );
}

function liftedObservationEndpoints(
  fromPosition,
  toPosition,
  options = {}
) {
  const origin = addHeight(
    fromPosition,
    options.fromEyeHeight
      ?? eyeHeight(options.observerStance ?? 'STANDING')
  );
  const target = addHeight(
    toPosition,
    options.toAimHeight
      ?? eyeHeight(options.targetStance ?? 'STANDING') * 0.82
  );
  return {
    origin,
    target,
    dist: distance3d(origin, target)
  };
}

function stanceName(person, unit) {
  return String(person?.stance ?? unit?.stance ?? 'STANDING').toUpperCase();
}

function eyeHeight(stance) {
  if (stance === 'PRONE') return 0.48;
  if (stance === 'KNEELING' || stance === 'CROUCHED') return 1.05;
  return 1.55;
}

function targetAimHeight(unit, person) {
  if (unit?.vehicleSpec) return 1.6;
  if (unit?.structureSpec) return 1.35;
  return eyeHeight(stanceName(person, unit)) * 0.82;
}

function velocityMagnitude(person, unit) {
  const velocity = person?.velocity;
  if (Array.isArray(velocity)) {
    return Math.hypot(
      finite(velocity[0]),
      finite(velocity[1]),
      finite(velocity[2])
    );
  }
  if (velocity) {
    return Math.hypot(finite(velocity.x), finite(velocity.y), finite(velocity.z));
  }
  return Math.abs(finite(unit?.moveSpeed));
}

function stableAttentionIdToken(value) {
  const text = String(value);
  return `${typeof value}:${text.length}:${text}`;
}

function attentionPhase(observerUnitId, observerPersonId, targetUnitId) {
  const source = [observerUnitId, observerPersonId, targetUnitId]
    .map(stableAttentionIdToken)
    .join('|');
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % ATTENTION_COLD_CADENCE_TICKS;
}

function canonicalAttentionTick(
  intervalStartClock,
  intervalEndClock,
  requestedDelta,
  deltaNanoseconds
) {
  const stepNanoseconds = Number(CANONICAL_SPOTTING_STEP_NANOSECONDS);
  if (requestedDelta !== CANONICAL_SPOTTING_STEP_SECONDS
      || deltaNanoseconds !== CANONICAL_SPOTTING_STEP_NANOSECONDS
      || intervalStartClock.timeCompensationSeconds !== 0
      || intervalEndClock.timeCompensationSeconds !== 0
      || intervalStartClock.timeNanoseconds % stepNanoseconds !== 0
      || intervalEndClock.timeNanoseconds % stepNanoseconds !== 0) {
    return null;
  }
  const tick = BigInt(intervalStartClock.timeWholeSeconds)
    * BigInt(TIME_PRECISION / Number(CANONICAL_SPOTTING_STEP_NANOSECONDS))
    + BigInt(intervalStartClock.timeNanoseconds / stepNanoseconds);
  return Number(tick % BigInt(ATTENTION_COLD_CADENCE_TICKS));
}

function unitAttentionFacts(unit) {
  const people = livingPeople(unit);
  const origin = positionObject(unit?.position);
  let extentMeters = 0;
  let moving = Math.abs(finite(unit?.moveSpeed)) > 0.2;
  const firing = finite(unit?.recentFireActivitySeconds) > 0;
  for (const person of people) {
    moving ||= velocityMagnitude(person, unit) > 0.2;
    const position = personPosition(unit, person);
    extentMeters = Math.max(
      extentMeters,
      Math.hypot(position.x - origin.x, position.z - origin.z)
    );
  }
  return { position: origin, extentMeters, moving, firing };
}

function withinAttentionCloseRange(observerFacts, targetFacts) {
  const distance = Math.hypot(
    observerFacts.position.x - targetFacts.position.x,
    observerFacts.position.z - targetFacts.position.z
  );
  return distance <= ATTENTION_CLOSE_RANGE_METERS
    + observerFacts.extentMeters
    + targetFacts.extentMeters;
}

function observationNeedsUrgentAttention(observation) {
  if (!observation) return false;
  return observation.directEpisodeActive === true
    || observation.visibleNow === true
    || (observation.visibilityGraceRemainingNanoseconds ?? 0) > 0
    || (observation.acquisitionWorkTicks ?? 0) > 0
    || (observation.acquisitionWorkRemainder ?? 0) > 0;
}

function observerKey(unitId, soldierId) {
  return `${unitId}\u0000${String(soldierId)}`;
}

function directEpisodeKey(senderUnitId, targetUnitId) {
  return `${typeof senderUnitId}:${JSON.stringify(senderUnitId)}\u0000`
    + `${typeof targetUnitId}:${JSON.stringify(targetUnitId)}`;
}

function cloneAcquisitionSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    position: clonePosition(snapshot.position),
    targetSoldierId: snapshot.targetSoldierId ?? null
  };
}

function cloneObservation(
  observation,
  { projectIdentification = false } = {}
) {
  const cloned = {
    ...observation,
    identificationProgress: normalizeIdentificationProgress(
      observation.identificationProgress ?? 0
    ),
    lastSeenPosition: clonePosition(observation.lastSeenPosition),
    directEpisodeSnapshot: cloneAcquisitionSnapshot(
      observation.directEpisodeSnapshot
    )
  };
  if (projectIdentification) {
    Object.assign(
      cloned,
      identificationProjection(cloned.identificationProgress)
    );
  }
  return cloned;
}

function cloneDirectObservationEpisode(
  episode,
  { projectIdentification = false } = {}
) {
  const cloned = {
    senderUnitId: episode.senderUnitId,
    targetUnitId: episode.targetUnitId,
    episodeSequence: episode.episodeSequence,
    active: episode.active === true,
    acquiredAt: episode.acquiredAt ?? null,
    sourceSoldierId: episode.sourceSoldierId ?? null,
    targetSoldierId: episode.targetSoldierId ?? null,
    position: clonePosition(episode.position),
    confidence: finite(episode.confidence),
    identificationProgress: normalizeIdentificationProgress(
      episode.identificationProgress ?? 0
    )
  };
  if (projectIdentification) {
    Object.assign(
      cloned,
      identificationProjection(cloned.identificationProgress)
    );
  }
  return cloned;
}

function withoutIdentificationProjection(record) {
  const {
    identificationTier: _tier,
    identificationApproximationLabel: _approximation,
    ...authoritative
  } = record;
  return authoritative;
}

function validateContactIdentificationCapture(contact, field, maximumTime) {
  const progress = validateIdentificationProjection(contact, field);
  if (!Number.isFinite(contact.identificationEvaluatedAt)
      || contact.identificationEvaluatedAt < 0) {
    throw new TypeError(
      `${field}.identificationEvaluatedAt must be finite and non-negative`
    );
  }
  if (contact.identificationEvaluatedAt > maximumTime) {
    throw new TypeError(
      `${field}.identificationEvaluatedAt cannot be later than spotting time`
    );
  }
  return progress;
}

function captureContact(contact) {
  const cloned = cloneContact(contact);
  return {
    ...cloned,
    ...identificationProjection(cloned.identificationProgress ?? 0)
  };
}

function personPosition(unit, person) {
  if (person?.worldPosition) return positionObject(person.worldPosition);
  const observerPosition = unit?.getObserverWorldPosition?.(person);
  if (observerPosition) return positionObject(observerPosition);
  const resolved = unit?.getSoldierWorldPosition?.(person?.id);
  return positionObject(resolved ?? unit?.position);
}

function livingPeople(unit) {
  return (unit?.roster ?? []).filter(isLivingObserver);
}

function targetPoints(unit) {
  const people = sortedPeople(unit).filter(person =>
    isBuildingOccupantExposed(person, unit)
  );
  if (unit?.type === 'infantry_squad') {
    return people.map(person => ({
      person,
      position: personPosition(unit, person),
      targetSoldierId: person.id
    }));
  }
  return [{
    person: people[0] ?? null,
    position: positionObject(unit?.position)
  }];
}

function unitCanBeObserved(unit) {
  if (!unit) return false;
  // Vehicle combat effectiveness decides whether it can act, not whether its
  // physical hull can still be seen. Wrecked and abandoned vehicles therefore
  // remain observation targets while the ordinary LOS policy stays authoritative.
  if (unit.vehicleSpec) return true;
  if (unit.type === 'infantry_squad' || unit.structureSpec) {
    return livingPeople(unit).length > 0
      && unit.structureState?.destroyed !== true;
  }
  return unit.isCombatEffective?.() ?? true;
}

function sortedUnits(units) {
  return [...units].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function sortedPeople(unit) {
  return livingPeople(unit).sort((left, right) =>
    String(left.id).localeCompare(String(right.id))
  );
}

function canPerformDirectVisualObservation(unit, person) {
  return Boolean(
    unit?.morale !== 'Broken'
    && isLivingObserver(person)
    && String(person?.status ?? '').toUpperCase() !== 'SURRENDERED'
    && String(person?.state ?? '').toUpperCase() !== 'SURRENDERED'
  );
}

const NEGATIVE_OBSERVATION_TARGET_UNIT = Object.freeze({
  type: 'infantry_squad',
  isHiding: true,
  stance: 'PRONE',
  moveSpeed: 0
});

const NEGATIVE_OBSERVATION_TARGET_PERSON = Object.freeze({
  stance: 'PRONE',
  velocity: Object.freeze([0, 0, 0])
});

function createBuildingColliderRuns(colliders) {
  const runs = [];
  let index = 0;
  while (index < colliders.length) {
    const startIndex = index;
    const buildingId = colliders[index].buildingId;
    let bounds = null;
    let boundsValid = true;
    while (index < colliders.length
        && colliders[index].buildingId === buildingId) {
      const colliderBounds = deriveOrientedBoxWorldAabb3D(colliders[index]);
      if (!colliderBounds) {
        boundsValid = false;
      } else if (boundsValid && bounds === null) {
        bounds = colliderBounds;
      } else if (boundsValid) {
        bounds.minX = Math.min(bounds.minX, colliderBounds.minX);
        bounds.maxX = Math.max(bounds.maxX, colliderBounds.maxX);
        bounds.minY = Math.min(bounds.minY, colliderBounds.minY);
        bounds.maxY = Math.max(bounds.maxY, colliderBounds.maxY);
        bounds.minZ = Math.min(bounds.minZ, colliderBounds.minZ);
        bounds.maxZ = Math.max(bounds.maxZ, colliderBounds.maxZ);
      }
      index++;
    }
    runs.push({
      startIndex,
      endIndex: index,
      bounds: boundsValid ? bounds : null
    });
  }
  return runs;
}

function terrainRecordBounds(record) {
  if (!Number.isFinite(record?.minX)
      || !Number.isFinite(record?.maxX)
      || !Number.isFinite(record?.minZ)
      || !Number.isFinite(record?.maxZ)) {
    return null;
  }
  return {
    minX: Math.min(record.minX, record.maxX),
    maxX: Math.max(record.minX, record.maxX),
    minY: -Number.MAX_VALUE,
    maxY: Number.MAX_VALUE,
    minZ: Math.min(record.minZ, record.maxZ),
    maxZ: Math.max(record.minZ, record.maxZ)
  };
}

function createTerrainOccluderRuns(records) {
  const runs = [];
  let index = 0;
  while (index < records.length) {
    const startIndex = index;
    const runId = records[index].sightRunId ?? null;
    let bounds = null;
    let boundsValid = true;
    do {
      const recordBounds = terrainRecordBounds(records[index]);
      if (!recordBounds) {
        boundsValid = false;
      } else if (boundsValid && bounds === null) {
        bounds = recordBounds;
      } else if (boundsValid) {
        bounds.minX = Math.min(bounds.minX, recordBounds.minX);
        bounds.maxX = Math.max(bounds.maxX, recordBounds.maxX);
        bounds.minZ = Math.min(bounds.minZ, recordBounds.minZ);
        bounds.maxZ = Math.max(bounds.maxZ, recordBounds.maxZ);
      }
      index++;
    } while (runId !== null
      && index < records.length
      && records[index].sightRunId === runId);
    runs.push({
      startIndex,
      endIndex: index,
      bounds: boundsValid ? bounds : null
    });
  }
  return runs;
}

export class SpottingSystem {
  constructor(scene, terrainBuilder, options = {}) {
    // `scene` is retained only to preserve the original construction signature.
    // Authoritative observation state never reads or mutates it.
    this.scene = scene ?? null;
    this.terrain = terrainBuilder ?? null;
    this.buildingSystem = options.buildingSystem ?? null;
    this.buildingColliders = [];
    this.buildingColliderRuns = [];
    this.buildingCollidersDirty = true;
    this.terrainSightSnapshot = null;
    this.terrainSightOccluders = [];
    this.terrainSightRuns = [];
    this.losDiagnostics = {
      buildingBroadphaseTests: 0,
      buildingBroadphaseRejects: 0,
      buildingExactObbTests: 0
    };
    this.terrainLosDiagnostics = {
      terrainSnapshotRefreshes: 0,
      terrainBroadphaseTests: 0,
      terrainBroadphaseRejects: 0,
      terrainExactBoxTests: 0,
      terrainExactBoxTestsAvoided: 0,
      terrainLegacyQueries: 0,
      terrainSnapshotRevision: null,
      terrainOccluderCount: 0,
      terrainRunCount: 0
    };
    this.settings = { ...DEFAULT_SETTINGS, ...(options.settings ?? {}) };
    if (!Number.isFinite(this.settings.voiceRelayDelaySeconds)
        || this.settings.voiceRelayDelaySeconds <= 0) {
      throw new TypeError('voiceRelayDelaySeconds must be positive and finite');
    }
    if (!Number.isFinite(this.settings.radioRelayDelaySeconds)
        || this.settings.radioRelayDelaySeconds <= 0) {
      throw new TypeError('radioRelayDelaySeconds must be positive and finite');
    }
    this.settings.voiceRelayDelaySeconds = canonicalTime(
      this.settings.voiceRelayDelaySeconds
    );
    this.settings.radioRelayDelaySeconds = canonicalTime(
      this.settings.radioRelayDelaySeconds
    );
    if (this.settings.voiceRelayDelaySeconds <= 0
        || this.settings.radioRelayDelaySeconds <= 0) {
      throw new TypeError('relay delays must remain positive at simulation precision');
    }
    this.settings.relayDelayApproximation =
      COMMUNICATION_RELAY_DELAY_APPROXIMATION;
    const lossTicksPerNanosecond =
      this.settings.lostAcquisitionDecayRate
      * PROGRESS_PRECISION / TIME_PRECISION;
    if (!Number.isSafeInteger(lossTicksPerNanosecond)
        || lossTicksPerNanosecond < 0) {
      throw new TypeError(
        'lostAcquisitionDecayRate must resolve to whole acquisition progress ticks per nanosecond'
      );
    }
    this.lossAcquisitionTicksPerNanosecond =
      lossTicksPerNanosecond;
    this.timeWholeSeconds = 0;
    this.timeNanoseconds = 0;
    this.timeCompensationSeconds = 0;
    this.time = 0;
    this.timeAccumulator = 0;
    this.observations = new Map();
    this.directObservationTargetsByUnit = new Map();
    this.precisionIndexedPairCount = 0;
    this.precisionDiagnostics = {
      queries: 0,
      hits: 0,
      observerLookups: 0,
      targetMembershipLookups: 0,
      rebuilds: 0,
      advanceRebuilds: 0,
      restoreRebuilds: 0,
      restoreObservationRowsVisited: 0
    };
    this.attentionDiagnostics = {
      eligibleCandidates: 0,
      urgentCandidates: 0,
      deferredCandidates: 0,
      coldEvaluatedCandidates: 0,
      totalEvaluations: 0,
      failOpenEvaluations: 0,
      canonicalSteps: 0,
      failOpenSteps: 0
    };
    this.directObservationEpisodes = new Map();
    this.relayQueue = new CommunicationRelayQueue();
    this.unitContacts = new Map();
    this.spottingMap = this.unitContacts;
    this.unitProfiles = new Map();
    this.configureUnitProfiles(options.unitProfiles ?? []);
  }

  configureUnitProfiles(profiles) {
    this.unitProfiles.clear();
    for (const profile of profiles ?? []) {
      if (profile?.id) this.unitProfiles.set(profile.id, profile);
    }
  }

  recordAuditoryEvent(event, allUnits) {
    const projections = projectWeaponReportContacts(event, allUnits, this.time);
    for (const projection of projections) {
      let contacts = this.unitContacts.get(projection.listenerUnitId);
      if (!contacts) {
        contacts = new Map();
        this.unitContacts.set(projection.listenerUnitId, contacts);
      }
      contacts.set(
        projection.targetUnitId,
        preferContact(
          contacts.get(projection.targetUnitId),
          projection.contact
        )
      );
    }
    this.spottingMap = this.unitContacts;
    return projections.map(projection => publicContact(projection.contact));
  }

  segmentIntersectsBox(p1Input, p2Input, box) {
    const p1 = positionObject(p1Input);
    const p2 = positionObject(p2Input);
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    let tMin = 0;
    let tMax = 1;

    const clipAxis = (origin, direction, min, max) => {
      if (!Number.isFinite(min) || !Number.isFinite(max)) return true;
      if (Math.abs(direction) < 1e-8) return origin >= min && origin <= max;
      const inv = 1 / direction;
      let near = (min - origin) * inv;
      let far = (max - origin) * inv;
      if (near > far) [near, far] = [far, near];
      tMin = Math.max(tMin, near);
      tMax = Math.min(tMax, far);
      return tMin <= tMax;
    };

    if (!clipAxis(p1.x, dx, box.minX, box.maxX)) return false;
    if (!clipAxis(p1.z, dz, box.minZ, box.maxZ)) return false;

    const terrainHeight = this.terrain?.getHeightAt?.(
      (finite(box.minX) + finite(box.maxX)) * 0.5,
      (finite(box.minZ) + finite(box.maxZ)) * 0.5
    ) ?? 0;
    const bottom = finite(box.minY, terrainHeight);
    const top = Number.isFinite(box.maxY)
      ? box.maxY
      : Number.isFinite(box.height) ? bottom + box.height : Infinity;
    const dy = p2.y - p1.y;
    const yAtNear = p1.y + dy * tMin;
    const yAtFar = p1.y + dy * tMax;
    return Math.min(yAtNear, yAtFar) <= top
      && Math.max(yAtNear, yAtFar) >= bottom;
  }

  checkLOS(fromPosition, toPosition, options = {}) {
    const { origin, target, dist } = liftedObservationEndpoints(
      fromPosition,
      toPosition,
      options
    );

    if (this.buildingCollidersDirty) this.refreshBuildingColliders();
    for (const run of this.buildingColliderRuns) {
      this.losDiagnostics.buildingBroadphaseTests++;
      if (run.bounds
          && !segmentIntersectsWorldAabb3D(origin, target, run.bounds)) {
        this.losDiagnostics.buildingBroadphaseRejects++;
        continue;
      }
      for (let index = run.startIndex; index < run.endIndex; index++) {
        const collider = this.buildingColliders[index];
        this.losDiagnostics.buildingExactObbTests++;
        if (!intersectSegmentOrientedBox3D(origin, target, collider)) continue;
        return {
          clear: false,
          coverType: collider.sectionId === 'rubble' ? 'Building rubble' : 'Building',
          buildingId: collider.buildingId,
          sectionId: collider.sectionId,
          dist
        };
      }
    }

    const snapshotProvider = this.terrain?.getSightOccluderSnapshot;
    if (typeof snapshotProvider === 'function') {
      const snapshot = validateTerrainSightOccluderSnapshot(
        snapshotProvider.call(this.terrain)
      );
      if (snapshot !== this.terrainSightSnapshot
          || snapshot.revision !== this.terrainSightSnapshot?.revision) {
        const runs = createTerrainOccluderRuns(snapshot.records);
        this.terrainSightSnapshot = snapshot;
        this.terrainSightOccluders = snapshot.records;
        this.terrainSightRuns = runs;
        this.terrainLosDiagnostics.terrainSnapshotRefreshes++;
        this.terrainLosDiagnostics.terrainSnapshotRevision = snapshot.revision;
        this.terrainLosDiagnostics.terrainOccluderCount = snapshot.records.length;
        this.terrainLosDiagnostics.terrainRunCount = runs.length;
      }
      for (const run of this.terrainSightRuns) {
        this.terrainLosDiagnostics.terrainBroadphaseTests++;
        if (run.bounds
            && !this.segmentIntersectsBox(origin, target, run.bounds)) {
          this.terrainLosDiagnostics.terrainBroadphaseRejects++;
          this.terrainLosDiagnostics.terrainExactBoxTestsAvoided +=
            run.endIndex - run.startIndex;
          continue;
        }
        for (let index = run.startIndex; index < run.endIndex; index++) {
          const obstacle = this.terrainSightOccluders[index];
          this.terrainLosDiagnostics.terrainExactBoxTests++;
          if (this.segmentIntersectsBox(origin, target, obstacle)) {
            return { clear: false, coverType: obstacle.type ?? 'Obstacle', dist };
          }
        }
      }
    } else {
      this.terrainLosDiagnostics.terrainLegacyQueries++;
      for (const obstacle of this.terrain?.bocageObstacles ?? []) {
        if (obstacle.buildingId) continue;
        if (obstacle.occludesSight === false) continue;
        this.terrainLosDiagnostics.terrainExactBoxTests++;
        if (this.segmentIntersectsBox(origin, target, obstacle)) {
          return { clear: false, coverType: obstacle.type ?? 'Obstacle', dist };
        }
      }
    }

    const getHeightAt = this.terrain?.getHeightAt;
    if (typeof getHeightAt === 'function' && dist > this.settings.terrainSampleMeters * 2) {
      const samples = Math.floor(dist / this.settings.terrainSampleMeters);
      for (let sample = 1; sample < samples; sample++) {
        const t = sample / samples;
        const x = origin.x + (target.x - origin.x) * t;
        const z = origin.z + (target.z - origin.z) * t;
        const rayHeight = origin.y + (target.y - origin.y) * t;
        if (getHeightAt.call(this.terrain, x, z) >= rayHeight - 0.08) {
          return { clear: false, coverType: 'Terrain', dist };
        }
      }
    }

    return { clear: true, coverType: 'Open Ground', dist };
  }

  getLosDiagnostics() {
    return { ...this.losDiagnostics };
  }

  getTerrainLosDiagnostics() {
    return { ...this.terrainLosDiagnostics };
  }

  maximumObservationRange(
    observerUnit,
    targetUnit,
    targetPerson = null,
    capability = null
  ) {
    let range = EXPERIENCE_RANGE_M[observerUnit?.experience] ?? EXPERIENCE_RANGE_M.Regular;
    range *= capability?.rangeMultiplier ?? 1;
    if (targetUnit?.isHiding) range *= 0.55;
    const targetStance = stanceName(targetPerson, targetUnit);
    if (targetStance === 'PRONE') range *= 0.72;
    else if (targetStance === 'KNEELING' || targetStance === 'CROUCHED') range *= 0.88;
    if (velocityMagnitude(targetPerson, targetUnit) > 0.2) range *= 1.08;
    return range;
  }

  getObserverDebugRecords(allUnits) {
    const records = [];
    for (const observerUnit of sortedUnits(allUnits ?? [])) {
      if (observerUnit.morale === 'Broken') continue;
      const profile = unitProfile(observerUnit, this.unitProfiles);
      for (const observer of sortedPeople(observerUnit)) {
        const basePosition = personPosition(observerUnit, observer);
        const observerStance = stanceName(observer, observerUnit);
        const capabilities = resolveObserverCapabilities(
          observerUnit,
          observer,
          profile
        );
        for (const capability of capabilities) {
          const observerHeight = observerUnit.vehicleSpec
            ? (capability.eyeHeightOffsetMeters ?? 0)
            : (capability.eyeHeightOffsetMeters ?? eyeHeight(observerStance));
          records.push({
            id: `${observerUnit.id}:${observer.id}:${capability.id}`,
            observerUnitId: String(observerUnit.id),
            observerPersonId: String(observer.id),
            factionId: observerUnit.faction,
            capabilityId: capability.id,
            capabilityKind: capability.kind,
            position: [
              basePosition.x,
              basePosition.y + observerHeight,
              basePosition.z
            ],
            facingYaw: observerCapabilityFacingYaw(
              observerUnit,
              observer,
              capability
            ),
            horizontalFovDegrees: capability.horizontalFovDegrees,
            nominalRangeMeters:
              (EXPERIENCE_RANGE_M[observerUnit.experience]
                ?? EXPERIENCE_RANGE_M.Regular)
              * capability.rangeMultiplier,
            dataQuality: capability.dataQuality
          });
        }
      }
    }
    return records;
  }

  acquisitionSeconds(
    observerUnit,
    observer,
    targetUnit,
    targetPerson,
    distance,
    capability = null
  ) {
    const maximumRange = this.maximumObservationRange(
      observerUnit,
      targetUnit,
      targetPerson,
      capability
    );
    const normalizedRange = Math.max(0, Math.min(1, distance / Math.max(1, maximumRange)));
    let seconds = this.settings.baseAcquisitionSeconds * (0.75 + normalizedRange * 2.25);

    const observerStance = stanceName(observer, observerUnit);
    if (observerStance === 'PRONE') seconds *= 0.9;
    else if (observerStance === 'KNEELING' || observerStance === 'CROUCHED') seconds *= 0.95;
    if (velocityMagnitude(observer, observerUnit) > 0.2) seconds *= 1.65;
    if ((observer?.suppression ?? observerUnit?.suppression ?? 0) > 20) seconds *= 1.35;

    const targetStance = stanceName(targetPerson, targetUnit);
    if (targetStance === 'PRONE') seconds *= 1.35;
    else if (targetStance === 'KNEELING' || targetStance === 'CROUCHED') seconds *= 1.12;
    if (targetUnit?.isHiding) seconds *= 1.8;
    if (velocityMagnitude(targetPerson, targetUnit) > 0.2) seconds *= 0.72;
    seconds *= capability?.acquisitionTimeMultiplier ?? 1;
    return Math.max(0.2, seconds);
  }

  evaluateObservation(
    observerUnit,
    observer,
    targetUnit,
    capabilityInput = null
  ) {
    const observerPosition = personPosition(observerUnit, observer);
    const observerStance = stanceName(observer, observerUnit);
    const profile = unitProfile(observerUnit, this.unitProfiles);
    const capabilities = Array.isArray(capabilityInput)
      ? capabilityInput
      : resolveObserverCapabilities(observerUnit, observer, profile);
    let best = null;

    for (const capability of capabilities) {
      const facingYaw = observerCapabilityFacingYaw(
        observerUnit,
        observer,
        capability
      );
      for (const target of targetPoints(targetUnit)) {
        if (!pointInsideObserverFov(
          observerPosition,
          target.position,
          facingYaw,
          capability.horizontalFovDegrees
        )) {
          continue;
        }
        const targetStance = stanceName(target.person, targetUnit);
        const maximumRange = this.maximumObservationRange(
          observerUnit,
          targetUnit,
          target.person,
          capability
        );
        const losOptions = {
          observerStance,
          targetStance,
          fromEyeHeight: capability.eyeHeightOffsetMeters
            ?? eyeHeight(observerStance),
          toAimHeight: targetAimHeight(targetUnit, target.person)
        };
        const { dist } = liftedObservationEndpoints(
          observerPosition,
          target.position,
          losOptions
        );
        if (dist > maximumRange) continue;
        const los = this.checkLOS(
          observerPosition,
          target.position,
          losOptions
        );
        if (!los.clear || los.dist > maximumRange) continue;
        const acquisitionSeconds = this.acquisitionSeconds(
          observerUnit,
          observer,
          targetUnit,
          target.person,
          los.dist,
          capability
        );
        if (!best || acquisitionSeconds < best.acquisitionSeconds) {
          best = {
            distance: los.dist,
            acquisitionSeconds,
            targetPosition: target.position,
            targetSoldierId: target.targetSoldierId ?? null,
            observerCapabilityId: capability.id
          };
        }
      }
    }
    return best;
  }

  updateObservation(
    observerUnit,
    observer,
    targetUnit,
    deltaNanoseconds,
    intervalStartClock,
    capabilityInput = null
  ) {
    const key = observerKey(observerUnit.id, observer.id);
    let targetMap = this.observations.get(key);
    if (!targetMap) {
      targetMap = new Map();
      this.observations.set(key, targetMap);
    }
    const existing = targetMap.get(targetUnit.id) ?? {
      observerUnitId: observerUnit.id,
      observerSoldierId: observer.id,
      targetUnitId: targetUnit.id,
      acquisition: 0,
      acquisitionWorkTicks: 0,
      acquisitionWorkRemainder: 0,
      acquisitionRequiredNanoseconds: null,
      visibleNow: false,
      visibilityGraceRemainingNanoseconds: 0,
      lastSeenPosition: null,
      lastSeenTargetSoldierId: null,
      lastSeenAt: null,
      confidence: 0,
      identificationProgress: 0,
      directEpisodeSequence: 0,
      directEpisodeActive: false,
      directEpisodeAcquiredAt: null,
      directEpisodeSnapshot: null
    };
    const previousIdentification = normalizeIdentificationProgress(
      existing.identificationProgress ?? 0
    );
    const wasEpisodeActive = existing.directEpisodeActive === true;
    const hadRenderVisibility =
      existing.visibilityGraceRemainingNanoseconds > 0;
    let acquisitionEvent = null;
    const profile = unitProfile(observerUnit, this.unitProfiles);
    const capabilities = Array.isArray(capabilityInput)
      ? capabilityInput
      : resolveObserverCapabilities(
          observerUnit,
          observer,
          profile
        );
    const evaluation = this.evaluateObservation(
      observerUnit,
      observer,
      targetUnit,
      capabilities
    );

    if (evaluation) {
      const requiredNanoseconds = acquisitionRequirementNanoseconds(
        evaluation.acquisitionSeconds
      );
      const acquisition = advanceAcquisitionWork(
        existing,
        requiredNanoseconds,
        deltaNanoseconds
      );
      existing.visibleNow = acquisition.visibleNow;
      if (existing.visibleNow) {
        let identificationAtAcquisition = previousIdentification;
        let directObservationNanoseconds = deltaNanoseconds;
        let acquisitionBoundaryAt = null;
        if (!wasEpisodeActive) {
          const nanosecondsToAcquire = acquisition.nanosecondsToAcquire
            > deltaNanoseconds
            ? deltaNanoseconds
            : acquisition.nanosecondsToAcquire;
          acquisitionBoundaryAt = clockTime(
            addClockNanoseconds(
              intervalStartClock,
              nanosecondsToAcquire
            )
          );
          identificationAtAcquisition = beginVisualIdentification(
            decayIdentificationNanoseconds(
              previousIdentification,
              nanosecondsToAcquire
            )
          );
          directObservationNanoseconds =
            deltaNanoseconds - nanosecondsToAcquire;
        }
        existing.identificationProgress =
          progressIdentificationNanoseconds(
          identificationAtAcquisition,
          directObservationNanoseconds
        );
        existing.lastSeenPosition = clonePosition(evaluation.targetPosition);
        existing.lastSeenTargetSoldierId = evaluation.targetSoldierId;
        existing.lastSeenAt = this.time;
        existing.confidence = 1;
        if (!wasEpisodeActive) {
          existing.directEpisodeSequence = Math.max(
            0,
            Number.isSafeInteger(existing.directEpisodeSequence)
              ? existing.directEpisodeSequence
              : 0
          ) + 1;
          existing.directEpisodeAcquiredAt = acquisitionBoundaryAt;
          existing.directEpisodeSnapshot = {
            position: clonePosition(evaluation.targetPosition),
            targetSoldierId: evaluation.targetSoldierId ?? null
          };
          acquisitionEvent = {
            senderUnitId: observerUnit.id,
            sourceSoldierId: observer.id,
            targetUnitId: targetUnit.id,
            targetSoldierId: evaluation.targetSoldierId ?? null,
            observerEpisodeSequence: existing.directEpisodeSequence,
            acquiredAt: existing.directEpisodeAcquiredAt,
            position: clonePosition(evaluation.targetPosition),
            confidence: 1,
            identificationProgress: identificationAtAcquisition
          };
        }
        existing.directEpisodeActive = true;
      } else {
        existing.identificationProgress = decayIdentificationNanoseconds(
          previousIdentification,
          deltaNanoseconds
        );
        existing.directEpisodeActive = false;
      }
    } else {
      decayAcquisitionWork(
        existing,
        deltaNanoseconds,
        this.lossAcquisitionTicksPerNanosecond
      );
      existing.visibleNow = false;
      existing.identificationProgress = decayIdentificationNanoseconds(
        previousIdentification,
        deltaNanoseconds
      );
      existing.directEpisodeActive = false;
    }

    updateVisibilityGrace(existing, deltaNanoseconds, {
      retainWhileSighted: Boolean(evaluation && hadRenderVisibility)
    });
    if (!existing.visibleNow && existing.lastSeenAt !== null) {
      const age = Math.max(0, this.time - existing.lastSeenAt);
      existing.confidence = Math.max(0, 1 - age / this.settings.observationMemorySeconds);
    }
    targetMap.set(targetUnit.id, existing);
    return { observation: existing, acquisitionEvent };
  }

  buildDirectContacts(units) {
    const directBySource = new Map();
    for (const unit of units) {
      const contacts = new Map();
      for (const observer of sortedPeople(unit)) {
        const observation = this.observations
          .get(observerKey(unit.id, observer.id));
        for (const state of observation?.values() ?? []) {
          if (!state.visibleNow) continue;
          const candidate = createContact({
            targetUnitId: state.targetUnitId,
            targetSoldierId: state.lastSeenTargetSoldierId ?? null,
            position: state.lastSeenPosition,
            observedAt: state.lastSeenAt,
            updatedAt: this.time,
            sourceUnitId: unit.id,
            sourceSoldierId: observer.id,
            channel: CONTACT_CHANNEL.DIRECT,
            confidence: state.confidence,
            uncertaintyM: 0,
            identificationProgress: state.identificationProgress
          });
          contacts.set(
            state.targetUnitId,
            preferContact(contacts.get(state.targetUnitId), candidate)
          );
        }
      }
      directBySource.set(unit.id, contacts);
    }
    return directBySource;
  }

  rebuildDirectObservationIndexFromContacts(directBySource) {
    const nextIndex = new Map();
    let pairCount = 0;
    for (const [observerUnitId, contacts] of directBySource) {
      if (contacts.size === 0) continue;
      const targetUnitIds = new Set(contacts.keys());
      nextIndex.set(observerUnitId, targetUnitIds);
      pairCount += targetUnitIds.size;
    }
    this.directObservationTargetsByUnit = nextIndex;
    this.precisionIndexedPairCount = pairCount;
    this.precisionDiagnostics.rebuilds++;
    this.precisionDiagnostics.advanceRebuilds++;
  }

  rebuildDirectObservationIndexFromObservations() {
    const nextIndex = new Map();
    let pairCount = 0;
    let rowsVisited = 0;
    for (const targetMap of this.observations.values()) {
      for (const observation of targetMap.values()) {
        rowsVisited++;
        if (observation.visibleNow !== true) continue;
        let targetUnitIds = nextIndex.get(observation.observerUnitId);
        if (!targetUnitIds) {
          targetUnitIds = new Set();
          nextIndex.set(observation.observerUnitId, targetUnitIds);
        }
        const previousSize = targetUnitIds.size;
        targetUnitIds.add(observation.targetUnitId);
        if (targetUnitIds.size !== previousSize) pairCount++;
      }
    }
    this.directObservationTargetsByUnit = nextIndex;
    this.precisionIndexedPairCount = pairCount;
    this.precisionDiagnostics.rebuilds++;
    this.precisionDiagnostics.restoreRebuilds++;
    this.precisionDiagnostics.restoreObservationRowsVisited += rowsVisited;
  }

  updateDirectObservationEpisodes(
    directBySource,
    acquisitionEvents,
    unitIds
  ) {
    const eventsByPair = new Map();
    for (const event of acquisitionEvents) {
      const key = directEpisodeKey(event.senderUnitId, event.targetUnitId);
      if (!eventsByPair.has(key)) eventsByPair.set(key, []);
      eventsByPair.get(key).push(event);
    }
    for (const events of eventsByPair.values()) {
      events.sort((left, right) =>
        left.acquiredAt - right.acquiredAt
        || String(left.sourceSoldierId).localeCompare(String(right.sourceSoldierId))
        || String(left.targetSoldierId ?? '').localeCompare(
          String(right.targetSoldierId ?? '')
        )
      );
    }

    const visiblePairs = new Set();
    const acquiredEpisodes = [];
    for (const [senderUnitId, contacts] of directBySource) {
      const orderedContacts = [...contacts.values()].sort((left, right) =>
        String(left.targetUnitId).localeCompare(String(right.targetUnitId))
      );
      for (const direct of orderedContacts) {
        const key = directEpisodeKey(senderUnitId, direct.targetUnitId);
        visiblePairs.add(key);
        const previous = this.directObservationEpisodes.get(key);
        if (previous?.active) continue;
        const acquisition = eventsByPair.get(key)?.[0] ?? {
          senderUnitId,
          sourceSoldierId: direct.sourceSoldierId,
          targetUnitId: direct.targetUnitId,
          targetSoldierId: direct.targetSoldierId ?? null,
          acquiredAt: direct.observedAt,
          position: direct.position,
          confidence: direct.confidence,
          identificationProgress: direct.identificationProgress
        };
        const episode = {
          senderUnitId,
          targetUnitId: direct.targetUnitId,
          episodeSequence: (previous?.episodeSequence ?? 0) + 1,
          active: true,
          acquiredAt: canonicalTime(acquisition.acquiredAt),
          sourceSoldierId: acquisition.sourceSoldierId,
          targetSoldierId: acquisition.targetSoldierId ?? null,
          position: clonePosition(acquisition.position),
          confidence: Math.max(0, Math.min(1, finite(acquisition.confidence))),
          identificationProgress: normalizeIdentificationProgress(
            acquisition.identificationProgress ?? 0
          )
        };
        this.directObservationEpisodes.set(key, episode);
        acquiredEpisodes.push(cloneDirectObservationEpisode(episode));
      }
    }

    for (const [key, episode] of this.directObservationEpisodes) {
      if (!unitIds.has(episode.senderUnitId)
          || !unitIds.has(episode.targetUnitId)) {
        this.directObservationEpisodes.delete(key);
      } else if (!visiblePairs.has(key) && episode.active) {
        episode.active = false;
      }
    }
    return acquiredEpisodes;
  }

  relayChannel(sender, receiver) {
    const senderProfile = unitProfile(sender, this.unitProfiles);
    const receiverProfile = unitProfile(receiver, this.unitProfiles);
    if (canRelayByVoice(sender, receiver, senderProfile, receiverProfile)) {
      return CONTACT_CHANNEL.VOICE;
    }
    if (canRelayByRadio(sender, receiver, senderProfile, receiverProfile)) {
      return CONTACT_CHANNEL.RADIO;
    }
    return null;
  }

  relayRouteIsValid(report, sender, receiver) {
    const senderProfile = unitProfile(sender, this.unitProfiles);
    const receiverProfile = unitProfile(receiver, this.unitProfiles);
    if (report.channel === CONTACT_CHANNEL.VOICE) {
      return canRelayByVoice(
        sender,
        receiver,
        senderProfile,
        receiverProfile
      );
    }
    if (report.channel === CONTACT_CHANNEL.RADIO) {
      return canRelayByRadio(
        sender,
        receiver,
        senderProfile,
        receiverProfile
      );
    }
    return false;
  }

  relayDelaySeconds(channel) {
    return channel === CONTACT_CHANNEL.VOICE
      ? this.settings.voiceRelayDelaySeconds
      : this.settings.radioRelayDelaySeconds;
  }

  enqueueRelayEpisodes(episodes, units) {
    for (const episode of episodes) {
      const sender = units.find(unit => unit.id === episode.senderUnitId);
      if (!sender) continue;
      for (const receiver of units) {
        if (receiver === sender || receiver.faction !== sender.faction) continue;
        const channel = this.relayChannel(sender, receiver);
        if (!channel) continue;
        const delaySeconds = this.relayDelaySeconds(channel);
        this.relayQueue.enqueue({
          senderUnitId: sender.id,
          receiverUnitId: receiver.id,
          targetUnitId: episode.targetUnitId,
          sourceSoldierId: episode.sourceSoldierId,
          targetSoldierId: episode.targetSoldierId,
          episodeSequence: episode.episodeSequence,
          channel,
          confidence: episode.confidence,
          identificationProgress: episode.identificationProgress,
          acquiredAt: episode.acquiredAt,
          delaySeconds,
          dueAt: canonicalTime(episode.acquiredAt + delaySeconds),
          position: episode.position,
          approximationLabel: this.settings.relayDelayApproximation
        });
      }
    }
  }

  deliverRelayReports(units, nextContacts) {
    const unitsById = new Map(units.map(unit => [unit.id, unit]));
    const unitIds = new Set(unitsById.keys());
    this.relayQueue.pruneMissingUnits(unitIds);
    for (const report of this.relayQueue.pendingReports()) {
      const sender = unitsById.get(report.senderUnitId);
      const receiver = unitsById.get(report.receiverUnitId);
      const target = unitsById.get(report.targetUnitId);
      if (!sender
          || !receiver
          || !target
          || !this.relayRouteIsValid(report, sender, receiver)) {
        this.relayQueue.cancel(report);
        continue;
      }
      if (report.dueAt > this.time + 1e-12) continue;

      const confidenceScale = report.channel === CONTACT_CHANNEL.VOICE
        ? this.settings.voiceConfidence
        : this.settings.radioConfidence;
      const baseContact = createContact({
        targetUnitId: report.targetUnitId,
        targetSoldierId: report.targetSoldierId,
        position: report.position,
        observedAt: report.acquiredAt,
        updatedAt: report.dueAt,
        sourceUnitId: report.senderUnitId,
        sourceSoldierId: report.sourceSoldierId,
        channel: report.channel,
        confidence: report.confidence * confidenceScale,
        uncertaintyM: report.channel === CONTACT_CHANNEL.VOICE ? 1 : 2,
        identificationProgress: report.identificationProgress,
        identificationEvaluatedAt: report.acquiredAt,
        approximationLabel: report.approximationLabel
      });
      const relayed = decayContact(baseContact, this.time, {
        lifetimeSeconds: this.settings.contactLifetimeSeconds,
        uncertaintyGrowthMps: this.settings.uncertaintyGrowthMps
      });
      const receiverContacts = nextContacts.get(receiver.id);
      if (relayed.confidence > 1e-6) {
        receiverContacts.set(
          relayed.targetUnitId,
          preferContact(receiverContacts.get(relayed.targetUnitId), relayed)
        );
      }
      this.relayQueue.markDelivered(report);
    }
  }

  advance(allUnits, deltaSeconds) {
    const requestedDelta = Math.max(0, finite(deltaSeconds));
    const intervalStartClock = {
      timeWholeSeconds: this.timeWholeSeconds,
      timeNanoseconds: this.timeNanoseconds,
      timeCompensationSeconds: this.timeCompensationSeconds
    };
    const nextClock = addClockDelta(
      intervalStartClock,
      requestedDelta
    );
    const deltaNanoseconds = clockNanosecondDifference(
      nextClock,
      intervalStartClock
    );
    this.timeWholeSeconds = nextClock.timeWholeSeconds;
    this.timeNanoseconds = nextClock.timeNanoseconds;
    this.timeCompensationSeconds = nextClock.timeCompensationSeconds;
    this.time = clockTime(nextClock);
    this.timeAccumulator = clockAccumulator(nextClock);
    this.refreshBuildingColliders();
    const units = sortedUnits(allUnits ?? []);
    const unitIds = new Set(units.map(unit => unit.id));
    const liveObserverKeys = new Set();
    const updatedTargetsByObserver = new Map();
    const evaluatedObserversByUnitTarget = new Map();
    const acquisitionEvents = [];
    const attentionTick = canonicalAttentionTick(
      intervalStartClock,
      nextClock,
      requestedDelta,
      deltaNanoseconds
    );
    if (attentionTick === null) this.attentionDiagnostics.failOpenSteps++;
    else this.attentionDiagnostics.canonicalSteps++;
    const unitAttention = new Map(
      units.map(unit => [unit, unitAttentionFacts(unit)])
    );
    for (const targetMap of this.observations.values()) {
      for (const observation of targetMap.values()) {
        if (observation.lastSeenAt !== null) {
          const age = Math.max(0, this.time - observation.lastSeenAt);
          observation.confidence = Math.max(
            0,
            1 - age / this.settings.observationMemorySeconds
          );
        }
      }
    }

    for (const observerUnit of units) {
      if (observerUnit.morale === 'Broken') continue;
      for (const observer of sortedPeople(observerUnit)) {
        if (!canPerformDirectVisualObservation(observerUnit, observer)) {
          continue;
        }
        const profile = unitProfile(observerUnit, this.unitProfiles);
        const capabilities = resolveObserverCapabilities(
          observerUnit,
          observer,
          profile
        );
        const key = observerKey(observerUnit.id, observer.id);
        liveObserverKeys.add(key);
        for (const targetUnit of units) {
          if (targetUnit.faction === observerUnit.faction || !unitCanBeObserved(targetUnit)) continue;
          this.attentionDiagnostics.eligibleCandidates++;
          const existing = this.observations.get(key)?.get(targetUnit.id);
          const urgent = attentionTick !== null && (
            unitAttention.get(observerUnit).moving
            || unitAttention.get(observerUnit).firing
            || unitAttention.get(targetUnit).moving
            || unitAttention.get(targetUnit).firing
            || withinAttentionCloseRange(
              unitAttention.get(observerUnit),
              unitAttention.get(targetUnit)
            )
            || observationNeedsUrgentAttention(existing)
          );
          if (attentionTick !== null && !urgent
              && attentionPhase(observerUnit.id, observer.id, targetUnit.id) !== attentionTick) {
            this.attentionDiagnostics.deferredCandidates++;
            continue;
          }
          if (attentionTick === null) {
            this.attentionDiagnostics.failOpenEvaluations++;
          } else if (urgent) {
            this.attentionDiagnostics.urgentCandidates++;
          } else {
            this.attentionDiagnostics.coldEvaluatedCandidates++;
          }
          this.attentionDiagnostics.totalEvaluations++;
          if (capabilities.length > 0) {
            let targetMap = evaluatedObserversByUnitTarget.get(
              observerUnit.id
            );
            if (!targetMap) {
              targetMap = new Map();
              evaluatedObserversByUnitTarget.set(observerUnit.id, targetMap);
            }
            let evaluatedObservers = targetMap.get(targetUnit.id);
            if (!evaluatedObservers) {
              evaluatedObservers = [];
              targetMap.set(targetUnit.id, evaluatedObservers);
            }
            evaluatedObservers.push({ observer, capabilities });
          }
          if (existing) existing.visibleNow = false;
          const update = this.updateObservation(
            observerUnit,
            observer,
            targetUnit,
            deltaNanoseconds,
            intervalStartClock,
            capabilities
          );
          if (!updatedTargetsByObserver.has(key)) {
            updatedTargetsByObserver.set(key, new Set());
          }
          updatedTargetsByObserver.get(key).add(targetUnit.id);
          if (update.acquisitionEvent) {
            acquisitionEvents.push(update.acquisitionEvent);
          }
        }
      }
    }
    for (const key of this.observations.keys()) {
      if (!liveObserverKeys.has(key)) this.observations.delete(key);
    }
    for (const [key, targetMap] of this.observations) {
      for (const observation of targetMap.values()) {
        if (!updatedTargetsByObserver.get(key)?.has(observation.targetUnitId)) {
          observation.visibleNow = false;
          observation.identificationProgress =
            decayIdentificationNanoseconds(
            observation.identificationProgress ?? 0,
            deltaNanoseconds
          );
          updateVisibilityGrace(observation, deltaNanoseconds);
        }
        if (!observation.visibleNow) observation.directEpisodeActive = false;
      }
    }

    // Direct sources and their acquisition snapshots are complete before any
    // queued recipient delivery, so a relayed contact cannot chain onward.
    const directBySource = this.buildDirectContacts(units);
    const acquiredEpisodes = this.updateDirectObservationEpisodes(
      directBySource,
      acquisitionEvents,
      unitIds
    );

    const nextContacts = new Map();
    for (const unit of units) {
      const contacts = new Map();
      if (livingPeople(unit).length > 0) {
        for (const [targetId, previous] of this.unitContacts.get(unit.id) ?? []) {
          const soundContact = previous.channel === CONTACT_CHANNEL.SOUND;
          let decayed = decayContact(previous, this.time, {
            lifetimeSeconds: soundContact
              ? this.settings.soundContactLifetimeSeconds
              : this.settings.contactLifetimeSeconds,
            uncertaintyGrowthMps: soundContact
              ? this.settings.soundUncertaintyGrowthMps
              : this.settings.uncertaintyGrowthMps
          });
          const hasDirectObservation = Boolean(
            directBySource.get(unit.id)?.get(targetId)
          );
          if (!hasDirectObservation && decayed.confidence > 1e-6) {
            decayed = this.evaluateNegativeObservationForUnit(
              unit,
              decayed,
              evaluatedObserversByUnitTarget
                .get(unit.id)
                ?.get(targetId)
                ?? []
            );
          }
          if (decayed.confidence > 1e-6) contacts.set(targetId, decayed);
        }
      }
      nextContacts.set(unit.id, contacts);
    }

    for (const sender of units) {
      const directContacts = directBySource.get(sender.id);
      if (!directContacts?.size) continue;
      for (const direct of directContacts.values()) {
        const senderContacts = nextContacts.get(sender.id);
        senderContacts.set(
          direct.targetUnitId,
          preferContact(senderContacts.get(direct.targetUnitId), direct)
        );
      }
    }
    this.enqueueRelayEpisodes(acquiredEpisodes, units);
    this.deliverRelayReports(units, nextContacts);
    this.unitContacts = nextContacts;
    this.spottingMap = this.unitContacts;
    this.rebuildDirectObservationIndexFromContacts(directBySource);
    return this;
  }

  evaluateNegativeObservationForUnit(unit, contact, evaluatedObservers = []) {
    if (!unit || !contact || contact.confidence <= 1e-6) {
      return cloneContact(contact);
    }
    if (contact.channel !== CONTACT_CHANNEL.DIRECT
        || !Array.isArray(evaluatedObservers)
        || evaluatedObservers.length === 0) {
      return cloneContact(contact);
    }

    const coveragePlan = getContactUncertaintyRegionSamples(contact);
    const samples = coveragePlan.samples;
    if (samples.length === 0) return cloneContact(contact);

    let clearCount = 0;
    const sampleVec = _negSampleVec ?? (_negSampleVec = new THREE.Vector3());

    for (const sample of samples) {
      const samplePosY = Number.isFinite(sample[1]) && sample[1] !== 0
        ? sample[1]
        : (this.terrain?.getHeightAt?.(sample[0], sample[2]) ?? 0);
      sampleVec.set(sample[0], samplePosY, sample[2]);
      let sampleCovered = false;

      for (const evidence of evaluatedObservers) {
        const observer = evidence.observer;
        if (!canPerformDirectVisualObservation(unit, observer)) continue;
        const observerPosition = personPosition(unit, observer);
        const observerStance = stanceName(observer, unit);
        for (const capability of evidence.capabilities) {
          const facingYaw = observerCapabilityFacingYaw(
            unit,
            observer,
            capability
          );
          if (!pointInsideObserverFov(
            observerPosition,
            sampleVec,
            facingYaw,
            capability.horizontalFovDegrees
          )) {
            continue;
          }
          const maximumRange = this.maximumObservationRange(
            unit,
            NEGATIVE_OBSERVATION_TARGET_UNIT,
            NEGATIVE_OBSERVATION_TARGET_PERSON,
            capability
          );
          const losOptions = {
            observerStance,
            targetStance: 'PRONE',
            fromEyeHeight: capability.eyeHeightOffsetMeters
              ?? eyeHeight(observerStance),
            toAimHeight: eyeHeight('PRONE')
          };
          const { dist } = liftedObservationEndpoints(
            observerPosition,
            sampleVec,
            losOptions
          );
          if (dist > maximumRange) continue;
          const los = this.checkLOS(
            observerPosition,
            sampleVec,
            losOptions
          );
          if (los.clear && los.dist <= maximumRange) {
            sampleCovered = true;
            break;
          }
        }
        if (sampleCovered) break;
      }
      if (sampleCovered) clearCount++;
    }

    const clearCoverageRatio = clearCount / samples.length;
    if (clearCoverageRatio <= 0) return cloneContact(contact);
    return evaluateNegativeObservation(contact, {
      clearCoverageRatio,
      completeCoverage:
        coveragePlan.exactPoint
        && coveragePlan.boundedRegion
        && clearCount === samples.length,
      approximationLabel: NEGATIVE_OBSERVATION_APPROXIMATION
    });
  }

  invalidateBuildingColliders() {
    this.buildingCollidersDirty = true;
  }

  refreshBuildingColliders() {
    if (!this.buildingCollidersDirty) return this.buildingColliders;
    if (!this.buildingSystem) {
      this.buildingColliders = [];
      this.buildingColliderRuns = [];
      this.buildingCollidersDirty = false;
      return this.buildingColliders;
    }
    const buildingIds = this.buildingSystem.getBuildingIds?.()
      ?? (this.buildingSystem.captureState?.().buildings ?? [])
        .map(building => String(building.id))
        .sort();
    const colliders = buildingIds
      .flatMap(buildingId => this.buildingSystem.getCollisionSnapshot(buildingId).records)
      .filter(record => record.blocks?.includes('projectile'))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const runs = createBuildingColliderRuns(colliders);
    this.buildingColliders = colliders;
    this.buildingColliderRuns = runs;
    this.buildingCollidersDirty = false;
    return this.buildingColliders;
  }

  // Compatibility facade for existing callers. Unlike the legacy method this
  // returns a read-only projection and does not make render meshes authoritative.
  updateSpotting(allUnits, viewerFaction = 'french', deltaSeconds = 0) {
    let faction = viewerFaction;
    let delta = deltaSeconds;
    if (typeof viewerFaction === 'number') {
      delta = viewerFaction;
      faction = 'french';
    }
    this.advance(allUnits, delta);
    return this.getVisibilityProjection(faction, allUnits);
  }

  getObservation(observerUnitId, observerSoldierId, targetUnitId) {
    const observation = this.observations
      .get(observerKey(observerUnitId, observerSoldierId))
      ?.get(targetUnitId);
    return observation
      ? cloneObservation(observation, { projectIdentification: true })
      : null;
  }

  hasDirectObservation(observerUnitOrId, targetUnitOrId) {
    const observerUnitId = observerUnitOrId?.id ?? observerUnitOrId;
    const targetUnitId = targetUnitOrId?.id ?? targetUnitOrId;
    this.precisionDiagnostics.queries++;
    this.precisionDiagnostics.observerLookups++;
    const targetUnitIds = this.directObservationTargetsByUnit.get(observerUnitId);
    if (!targetUnitIds) return false;
    this.precisionDiagnostics.targetMembershipLookups++;
    const directlyObserved = targetUnitIds.has(targetUnitId);
    if (directlyObserved) this.precisionDiagnostics.hits++;
    return directlyObserved;
  }

  canPrecisionTarget(observerUnitOrId, targetUnitOrId) {
    return this.hasDirectObservation(observerUnitOrId, targetUnitOrId);
  }

  getPrecisionDiagnostics() {
    return {
      ...this.precisionDiagnostics,
      indexedObserverUnitCount: this.directObservationTargetsByUnit.size,
      indexedPairCount: this.precisionIndexedPairCount
    };
  }

  getAttentionDiagnostics() {
    return {
      ...this.attentionDiagnostics,
      coldCadenceTicks: ATTENTION_COLD_CADENCE_TICKS,
      coldCadenceSeconds:
        ATTENTION_COLD_CADENCE_TICKS
        * Number(CANONICAL_SPOTTING_STEP_NANOSECONDS)
        / TIME_PRECISION,
      maximumInitialLatencySeconds:
        (ATTENTION_COLD_CADENCE_TICKS - 1)
        * Number(CANONICAL_SPOTTING_STEP_NANOSECONDS)
        / TIME_PRECISION,
      closeRangeMeters: ATTENTION_CLOSE_RANGE_METERS,
      closeRangeApproximation: ATTENTION_CLOSE_RANGE_APPROXIMATION
    };
  }

  getContactForUnit(unitOrId, targetUnitOrId) {
    const unitId = unitOrId?.id ?? unitOrId;
    const targetUnitId = targetUnitOrId?.id ?? targetUnitOrId;
    return publicContact(this.unitContacts.get(unitId)?.get(targetUnitId));
  }

  hasContact(unitOrId, targetUnitOrId, minimumConfidence = 0.05) {
    return (this.getContactForUnit(unitOrId, targetUnitOrId)?.confidence ?? 0)
      >= minimumConfidence;
  }

  getFactionContacts(faction, allUnits) {
    const contacts = new Map();
    for (const unit of sortedUnits(allUnits ?? [])) {
      if (unit.faction !== faction) continue;
      for (const contact of this.unitContacts.get(unit.id)?.values() ?? []) {
        contacts.set(
          contact.targetUnitId,
          preferContact(contacts.get(contact.targetUnitId), contact)
        );
      }
    }
    return [...contacts.values()]
      .sort((left, right) => String(left.targetUnitId).localeCompare(String(right.targetUnitId)))
      .map(publicContact);
  }

  getVisibilityProjection(viewerFaction, allUnits) {
    const units = allUnits ?? [];
    const unitFactionById = new Map();
    const targetableUnitIds = new Set();
    const visibleUnitIds = new Set();
    for (const unit of units) {
      unitFactionById.set(unit.id, unit.faction);
      if (unit.faction === viewerFaction) visibleUnitIds.add(unit.id);
      else targetableUnitIds.add(unit.id);
    }
    for (const targetMap of this.observations.values()) {
      for (const observation of targetMap.values()) {
        if (!observation?.visibleNow
            && (observation?.visibilityGraceRemainingNanoseconds ?? 0) <= 0) {
          continue;
        }
        if (
          unitFactionById.get(observation.observerUnitId) === viewerFaction
          && targetableUnitIds.has(observation.targetUnitId)
        ) {
          visibleUnitIds.add(observation.targetUnitId);
        }
      }
    }
    return {
      viewerFaction,
      visibleUnitIds: [...visibleUnitIds].sort(),
      contacts: this.getFactionContacts(viewerFaction, units)
    };
  }

  captureState() {
    const observations = [];
    for (const targetMap of this.observations.values()) {
      for (const observation of targetMap.values()) {
        observations.push(cloneObservation(observation, {
          projectIdentification: true
        }));
      }
    }
    observations.sort((left, right) =>
      `${left.observerUnitId}:${left.observerSoldierId}:${left.targetUnitId}`
        .localeCompare(`${right.observerUnitId}:${right.observerSoldierId}:${right.targetUnitId}`)
    );

    const contacts = [];
    for (const [unitId, targetMap] of this.unitContacts) {
      for (const contact of targetMap.values()) {
        contacts.push({ unitId, contact: captureContact(contact) });
      }
    }
    contacts.sort((left, right) =>
      `${left.unitId}:${left.contact.targetUnitId}`
        .localeCompare(`${right.unitId}:${right.contact.targetUnitId}`)
    );

    const directObservationEpisodes = [
      ...this.directObservationEpisodes.values()
    ]
      .sort((left, right) =>
        directEpisodeKey(left.senderUnitId, left.targetUnitId).localeCompare(
          directEpisodeKey(right.senderUnitId, right.targetUnitId)
        )
      )
      .map(episode => cloneDirectObservationEpisode(episode, {
        projectIdentification: true
      }));
    return {
      version: 5,
      time: this.time,
      timeAccumulator: this.timeAccumulator,
      timeWholeSeconds: this.timeWholeSeconds,
      timeNanoseconds: this.timeNanoseconds,
      timeCompensationSeconds: this.timeCompensationSeconds,
      relayPolicy: {
        approximationLabel: this.settings.relayDelayApproximation,
        voiceDelaySeconds: this.settings.voiceRelayDelaySeconds,
        radioDelaySeconds: this.settings.radioRelayDelaySeconds
      },
      observations,
      directObservationEpisodes,
      relayQueue: this.relayQueue.captureState(),
      contacts
    };
  }

  restoreState(state) {
    const version = state?.version ?? 1;
    if (version !== 1
        && version !== 2
        && version !== 3
        && version !== 4
        && version !== 5) {
      throw new TypeError(`unsupported spotting state version ${version}`);
    }
    let restoredClock;
    if (version >= 4) {
      if (!Number.isFinite(state?.time)
          || state.time < 0
          || !Number.isFinite(state?.timeAccumulator)
          || state.timeAccumulator < 0) {
        throw new TypeError(
          `spotting version ${version} time and timeAccumulator must be finite and non-negative`
        );
      }
      try {
        restoredClock = validateCapturedClock(state);
      } catch (error) {
        if (error instanceof TypeError) throw error;
        throw new TypeError(
          `spotting version ${version} canonical clock components are invalid`
        );
      }
    } else {
      // Versions 1-3 predate canonical clock components. Preserve their
      // migration behavior: an absent/non-finite public time becomes zero,
      // while an explicitly stored v3 accumulator must itself be valid and
      // project to that migrated public time.
      const legacyTime = canonicalTime(
        Math.max(0, finite(state?.time))
      );
      let legacyAccumulator = legacyTime;
      if (version === 3 && state?.timeAccumulator !== undefined) {
        if (!Number.isFinite(state.timeAccumulator)
            || state.timeAccumulator < 0
            || canonicalTime(state.timeAccumulator) !== legacyTime) {
          throw new TypeError(
            'spotting timeAccumulator must be finite, non-negative, and match time'
          );
        }
        legacyAccumulator = state.timeAccumulator;
      }
      restoredClock = clockFromAbsoluteSeconds(legacyAccumulator);
    }
    this.timeWholeSeconds = restoredClock.timeWholeSeconds;
    this.timeNanoseconds = restoredClock.timeNanoseconds;
    this.timeCompensationSeconds =
      restoredClock.timeCompensationSeconds;
    this.time = clockTime(restoredClock);
    this.timeAccumulator = clockAccumulator(restoredClock);
    if (version >= 3) {
      const relayPolicy = state?.relayPolicy ?? {};
      if (relayPolicy.approximationLabel
          !== COMMUNICATION_RELAY_DELAY_APPROXIMATION) {
        throw new TypeError(
          'spotting relay policy must retain the gameplay-approximation label'
        );
      }
      if (!Number.isFinite(relayPolicy.voiceDelaySeconds)
          || relayPolicy.voiceDelaySeconds <= 0
          || !Number.isFinite(relayPolicy.radioDelaySeconds)
          || relayPolicy.radioDelaySeconds <= 0) {
        throw new TypeError('spotting relay policy delays must be positive and finite');
      }
      this.settings.voiceRelayDelaySeconds = canonicalTime(
        relayPolicy.voiceDelaySeconds
      );
      this.settings.radioRelayDelaySeconds = canonicalTime(
        relayPolicy.radioDelaySeconds
      );
      if (this.settings.voiceRelayDelaySeconds <= 0
          || this.settings.radioRelayDelaySeconds <= 0) {
        throw new TypeError(
          'spotting relay policy delays must remain positive at simulation precision'
        );
      }
      this.settings.relayDelayApproximation =
        COMMUNICATION_RELAY_DELAY_APPROXIMATION;
    }
    this.observations = new Map();
    for (const saved of state?.observations ?? []) {
      const legacyAcquired = version >= 4
        ? null
        : legacyObservationIsAcquired(saved, version);
      const identificationProgress = version >= 4
        ? validateIdentificationProjection(
            saved,
            'spotting observation identification'
          )
        : 0;
      const acquisitionState = version >= 4
        ? validateAcquisitionCapture(saved)
        : migrateAcquisitionState(saved, legacyAcquired);
      if (version >= 4) {
        validateObservationEpisodeCapture(
          saved,
          acquisitionState,
          this.time
        );
      }
      const visibilityGraceRemainingNanoseconds = version === 5
        ? validateVisibilityGraceCapture(saved, this.time)
        : (
          version >= 4
            ? saved.visibleNow === true
            : legacyAcquired
        )
          ? DIRECT_RENDER_VISIBILITY_GRACE_NANOSECONDS
          : 0;
      const authoritativeSaved = withoutIdentificationProjection(saved);
      const key = observerKey(saved.observerUnitId, saved.observerSoldierId);
      if (!this.observations.has(key)) this.observations.set(key, new Map());
      const observation = cloneObservation({
        ...authoritativeSaved,
        ...acquisitionState,
        visibleNow: version >= 4
          ? authoritativeSaved.visibleNow
          : legacyAcquired,
        visibilityGraceRemainingNanoseconds,
        identificationProgress,
        directEpisodeSequence: version >= 4
          ? authoritativeSaved.directEpisodeSequence
          : Number.isSafeInteger(
              authoritativeSaved.directEpisodeSequence
            )
          && authoritativeSaved.directEpisodeSequence >= 0
            ? authoritativeSaved.directEpisodeSequence
            : 0,
        directEpisodeActive: version >= 4
          ? authoritativeSaved.directEpisodeActive
          : legacyAcquired,
        directEpisodeAcquiredAt: version >= 3
          ? authoritativeSaved.directEpisodeAcquiredAt ?? null
          : authoritativeSaved.visibleNow
            ? authoritativeSaved.lastSeenAt ?? this.time
            : null,
        directEpisodeSnapshot: version >= 3
          ? authoritativeSaved.directEpisodeSnapshot ?? null
          : authoritativeSaved.visibleNow
            ? {
                position: authoritativeSaved.lastSeenPosition,
                targetSoldierId:
                  authoritativeSaved.lastSeenTargetSoldierId ?? null
              }
            : null
      });
      this.observations.get(key).set(saved.targetUnitId, observation);
    }
    this.directObservationEpisodes = new Map();
    if (version >= 3) {
      for (const saved of state?.directObservationEpisodes ?? []) {
        const identificationProgress = version >= 4
          ? validateIdentificationProjection(
              saved,
              'direct observation episode identification'
          )
          : 0;
        if (version >= 4) {
          validateDirectObservationEpisodeCapture(saved, this.time);
        }
        const episode = cloneDirectObservationEpisode({
          ...withoutIdentificationProjection(saved),
          identificationProgress
        });
        this.directObservationEpisodes.set(
          directEpisodeKey(episode.senderUnitId, episode.targetUnitId),
          episode
        );
      }
      if (version >= 4) {
        validateDirectEpisodeCoherence(
          this.observations,
          this.directObservationEpisodes
        );
      }
    } else {
      for (const targetMap of this.observations.values()) {
        for (const observation of targetMap.values()) {
          if (!observation.visibleNow) continue;
          const key = directEpisodeKey(
            observation.observerUnitId,
            observation.targetUnitId
          );
          const candidate = {
            senderUnitId: observation.observerUnitId,
            targetUnitId: observation.targetUnitId,
            episodeSequence: 0,
            active: true,
            acquiredAt: observation.lastSeenAt ?? this.time,
            sourceSoldierId: observation.observerSoldierId,
            targetSoldierId: observation.lastSeenTargetSoldierId ?? null,
            position: clonePosition(observation.lastSeenPosition),
            confidence: observation.confidence,
            identificationProgress: 0
          };
          const previous = this.directObservationEpisodes.get(key);
          if (!previous
              || String(candidate.sourceSoldierId).localeCompare(
                String(previous.sourceSoldierId)
              ) < 0) {
            this.directObservationEpisodes.set(key, candidate);
          }
        }
      }
    }
    this.relayQueue = new CommunicationRelayQueue();
    if (version >= 3) {
      if (version >= 4 && state?.relayQueue?.version !== 2) {
        throw new TypeError(
          `spotting version ${version} requires communication relay queue version 2`
        );
      }
      this.relayQueue.restoreState(state?.relayQueue);
    }
    this.unitContacts = new Map();
    for (const saved of state?.contacts ?? []) {
      const identificationProgress = version >= 4
        ? validateContactIdentificationCapture(
            saved.contact,
            'spotting contact identification',
            this.time
          )
        : 0;
      const authoritativeContact = withoutIdentificationProjection(
        saved.contact
      );
      if (!this.unitContacts.has(saved.unitId)) this.unitContacts.set(saved.unitId, new Map());
      this.unitContacts.get(saved.unitId).set(
        saved.contact.targetUnitId,
        cloneContact({
          ...authoritativeContact,
          identificationProgress,
          identificationEvaluatedAt: version >= 4
            ? authoritativeContact.identificationEvaluatedAt
            : this.time
        })
      );
    }
    this.spottingMap = this.unitContacts;
    this.rebuildDirectObservationIndexFromObservations();
  }
}
