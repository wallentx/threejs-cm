export const THREAT_MEMORY_APPROXIMATION =
  'bounded per-soldier incoming-fire memory gameplay approximation v1';

export const THREAT_MEMORY_CLOCK_PRECISION_SECONDS = 1e-12;

export const DEFAULT_THREAT_MEMORY_POLICY = Object.freeze({
  approximationLabel: THREAT_MEMORY_APPROXIMATION,
  capacity: 4,
  lifetimeSeconds: 12,
  scoreDecay: 'linear-to-zero'
});

const STATE_VERSION = 2;
const LEGACY_STATE_VERSION = 1;
const MAX_RECORDS = 4;
const CLOCK_PICOSECONDS_PER_SECOND =
  1 / THREAT_MEMORY_CLOCK_PRECISION_SECONDS;
const CLOCK_SUB_PICOSECOND_DRIFT_SECONDS = 1e-14;
const CLOCK_HALF_PICOSECOND_SECONDS =
  THREAT_MEMORY_CLOCK_PRECISION_SECONDS / 2;
const LEGACY_CLOCK_PRECISION_SECONDS = 1e-9;
const LEGACY_CLOCK_DRIFT_ULPS = 8;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function eventIdKey(eventId) {
  return `${String(eventId)}\u0000${typeof eventId}`;
}

function normalizeEventId(value) {
  if (typeof value === 'string') {
    if (value.length === 0) {
      throw new TypeError('threat eventId must be a non-empty stable ID');
    }
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Object.is(value, -0) ? 0 : value;
  }
  throw new TypeError('threat eventId must be a non-empty stable ID');
}

function normalizePosition(value, label) {
  if (Array.isArray(value) && value.length !== 3) {
    throw new TypeError(`${label} must contain exactly three components`);
  }
  const components = (Array.isArray(value)
    ? [value[0], value[1], value[2]]
    : [value?.x, value?.y, value?.z])
    .map(component => Object.is(component, -0) ? 0 : component);
  if (components.some(component => !Number.isFinite(component))) {
    throw new TypeError(`${label} must contain finite x, y, and z components`);
  }
  return Object.freeze(components);
}

function normalizeIntensity(value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError('threat intensity must be finite and non-negative');
  }
  return Object.is(value, -0) ? 0 : value;
}

function normalizePolicy(policyInput = {}) {
  const policy = {
    ...DEFAULT_THREAT_MEMORY_POLICY,
    ...policyInput
  };
  if (policy.approximationLabel !== THREAT_MEMORY_APPROXIMATION) {
    throw new TypeError(
      'threat-memory policy must retain its gameplay-approximation label'
    );
  }
  if (!Number.isSafeInteger(policy.capacity)
      || policy.capacity <= 0
      || policy.capacity > MAX_RECORDS) {
    throw new RangeError(`threat-memory capacity must be between 1 and ${MAX_RECORDS}`);
  }
  if (!Number.isFinite(policy.lifetimeSeconds) || policy.lifetimeSeconds <= 0) {
    throw new RangeError('threat-memory lifetimeSeconds must be positive and finite');
  }
  if (policy.scoreDecay !== DEFAULT_THREAT_MEMORY_POLICY.scoreDecay) {
    throw new TypeError('unsupported threat-memory score-decay policy');
  }
  return Object.freeze(policy);
}

function normalizeSubPicosecond(value) {
  if (Math.abs(value) <= CLOCK_SUB_PICOSECOND_DRIFT_SECONDS) return 0;
  return Object.is(value, -0) ? 0 : value;
}

function legacyClockDriftTolerance(value) {
  return Number.EPSILON
    * Math.max(1, Math.abs(value))
    * LEGACY_CLOCK_DRIFT_ULPS;
}

function normalizeLegacyClockDrift(value) {
  const nearestTick = Math.round(
    value / LEGACY_CLOCK_PRECISION_SECONDS
  ) * LEGACY_CLOCK_PRECISION_SECONDS;
  return Math.abs(value - nearestTick) <= legacyClockDriftTolerance(value)
    ? nearestTick
    : value;
}

function isOnLegacyClockTick(value) {
  const nearestTick = Math.round(
    value / LEGACY_CLOCK_PRECISION_SECONDS
  ) * LEGACY_CLOCK_PRECISION_SECONDS;
  return Math.abs(value - nearestTick) <= legacyClockDriftTolerance(value);
}

// Whole seconds and integer picoseconds carry authoritative elapsed time.
// The fixed sub-picosecond residual uses the unique half-open range
// [-0.5 ps, +0.5 ps), preserving checkpoint continuation without making
// expiry tolerance grow with the absolute simulation clock.
function composeClockSeconds({
  clockWholeSeconds,
  clockPicoseconds,
  clockCompensationSeconds
}) {
  const value = clockWholeSeconds
    + clockPicoseconds * THREAT_MEMORY_CLOCK_PRECISION_SECONDS
    + clockCompensationSeconds;
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      'threat-memory clock must remain finite and representable'
    );
  }
  return value;
}

function cloneClockComponents(clock) {
  return {
    clockWholeSeconds: clock.clockWholeSeconds,
    clockPicoseconds: clock.clockPicoseconds,
    clockCompensationSeconds: clock.clockCompensationSeconds
  };
}

function freezeClockComponents(clock) {
  return Object.freeze(cloneClockComponents(clock));
}

function canonicalClockFromComponents(clock, label) {
  if (!clock || typeof clock !== 'object'
      || !Number.isSafeInteger(clock.clockWholeSeconds)
      || clock.clockWholeSeconds < 0
      || !Number.isSafeInteger(clock.clockPicoseconds)
      || clock.clockPicoseconds < 0
      || clock.clockPicoseconds >= CLOCK_PICOSECONDS_PER_SECOND
      || !Number.isFinite(clock.clockCompensationSeconds)
      || clock.clockCompensationSeconds
        < -CLOCK_HALF_PICOSECOND_SECONDS
      || clock.clockCompensationSeconds
        >= CLOCK_HALF_PICOSECOND_SECONDS
      || (
        clock.clockCompensationSeconds !== 0
        && Math.abs(clock.clockCompensationSeconds)
          <= CLOCK_SUB_PICOSECOND_DRIFT_SECONDS
      )) {
    throw new TypeError(`${label} canonical clock components are invalid`);
  }
  const normalizedClock = {
    clockWholeSeconds: clock.clockWholeSeconds,
    clockPicoseconds: clock.clockPicoseconds,
    clockCompensationSeconds:
      Object.is(clock.clockCompensationSeconds, -0)
        ? 0
        : clock.clockCompensationSeconds
  };
  let clockSeconds;
  try {
    clockSeconds = composeClockSeconds(normalizedClock);
  } catch {
    throw new TypeError(`${label} canonical clock components are invalid`);
  }
  return {
    ...normalizedClock,
    clockSeconds
  };
}

function compareCanonicalClocks(left, right) {
  if (left.clockWholeSeconds !== right.clockWholeSeconds) {
    return left.clockWholeSeconds < right.clockWholeSeconds ? -1 : 1;
  }
  if (left.clockPicoseconds !== right.clockPicoseconds) {
    return left.clockPicoseconds < right.clockPicoseconds ? -1 : 1;
  }
  if (left.clockCompensationSeconds
      !== right.clockCompensationSeconds) {
    return left.clockCompensationSeconds
      < right.clockCompensationSeconds ? -1 : 1;
  }
  return 0;
}

function canonicalClocksEqual(left, right) {
  return compareCanonicalClocks(left, right) === 0;
}

function clockDifferenceSeconds(later, earlier) {
  const difference =
    (later.clockWholeSeconds - earlier.clockWholeSeconds)
    + (
      later.clockPicoseconds - earlier.clockPicoseconds
    ) * THREAT_MEMORY_CLOCK_PRECISION_SECONDS
    + (
      later.clockCompensationSeconds
      - earlier.clockCompensationSeconds
    );
  if (!Number.isFinite(difference)) {
    throw new RangeError(
      'threat-memory clock difference must remain finite'
    );
  }
  return Object.is(difference, -0) ? 0 : difference;
}

function normalizeCanonicalClockParts({
  clockWholeSeconds,
  clockPicoseconds,
  clockCompensationSeconds
}) {
  if (!Number.isSafeInteger(clockWholeSeconds)
      || !Number.isSafeInteger(clockPicoseconds)
      || !Number.isFinite(clockCompensationSeconds)) {
    throw new RangeError(
      'threat-memory clock must remain finite and representable'
    );
  }

  // Compare the residual directly. Multiplying an exact half-picosecond by
  // 1e12 can round just below 0.5, so the scaled quotient cannot own the tie.
  if (clockCompensationSeconds >= CLOCK_HALF_PICOSECOND_SECONDS) {
    clockPicoseconds++;
    clockCompensationSeconds -= THREAT_MEMORY_CLOCK_PRECISION_SECONDS;
  } else if (
    clockCompensationSeconds < -CLOCK_HALF_PICOSECOND_SECONDS
  ) {
    clockPicoseconds--;
    clockCompensationSeconds += THREAT_MEMORY_CLOCK_PRECISION_SECONDS;
  }
  clockCompensationSeconds = normalizeSubPicosecond(
    clockCompensationSeconds
  );

  const wholeCarry = Math.floor(
    clockPicoseconds / CLOCK_PICOSECONDS_PER_SECOND
  );
  clockWholeSeconds += wholeCarry;
  clockPicoseconds -= wholeCarry * CLOCK_PICOSECONDS_PER_SECOND;

  if (!Number.isSafeInteger(clockWholeSeconds)
      || clockWholeSeconds < 0
      || !Number.isSafeInteger(clockPicoseconds)
      || clockPicoseconds < 0
      || clockPicoseconds >= CLOCK_PICOSECONDS_PER_SECOND
      || !Number.isFinite(clockCompensationSeconds)
      || clockCompensationSeconds
        < -CLOCK_HALF_PICOSECOND_SECONDS
      || clockCompensationSeconds
        >= CLOCK_HALF_PICOSECOND_SECONDS) {
    throw new RangeError(
      'threat-memory clock must remain finite and representable'
    );
  }

  return {
    clockWholeSeconds,
    clockPicoseconds,
    clockCompensationSeconds
  };
}

function splitClockDelta(deltaSeconds) {
  if (!Number.isFinite(deltaSeconds)) {
    throw new RangeError(
      'threat-memory clock delta must be finite and representable'
    );
  }
  const wholeSeconds = Math.trunc(deltaSeconds);
  if (!Number.isSafeInteger(wholeSeconds)) {
    throw new RangeError(
      'threat-memory clock delta must be finite and representable'
    );
  }
  const fractionalSeconds = deltaSeconds - wholeSeconds;
  const roundedPicoseconds = Math.round(
    fractionalSeconds * CLOCK_PICOSECONDS_PER_SECOND
  );
  const clockPicoseconds = Object.is(roundedPicoseconds, -0)
    ? 0
    : roundedPicoseconds;
  const clockCompensationSeconds =
    fractionalSeconds
      - roundedPicoseconds * THREAT_MEMORY_CLOCK_PRECISION_SECONDS;
  return normalizeCanonicalClockParts({
    clockWholeSeconds: wholeSeconds,
    clockPicoseconds,
    clockCompensationSeconds
  });
}

function addCanonicalClock(clock, deltaSeconds) {
  const delta = splitClockDelta(deltaSeconds);
  const nextClock = normalizeCanonicalClockParts({
    clockWholeSeconds:
      clock.clockWholeSeconds + delta.clockWholeSeconds,
    clockPicoseconds:
      clock.clockPicoseconds + delta.clockPicoseconds,
    clockCompensationSeconds:
      clock.clockCompensationSeconds
      + delta.clockCompensationSeconds
  });
  return {
    ...nextClock,
    clockSeconds: composeClockSeconds(nextClock)
  };
}

function clockFromAbsoluteSeconds(clockSeconds) {
  const clock = addCanonicalClock({
    clockWholeSeconds: 0,
    clockPicoseconds: 0,
    clockCompensationSeconds: 0
  }, clockSeconds);
  return clock;
}

function cloneObservation(record, includeCanonicalClocks = true) {
  const clone = {
    eventId: record.eventId,
    threatPosition: [...record.threatPosition],
    impactPosition: [...record.impactPosition],
    intensity: record.intensity,
    observedAtSeconds: record.observedAtSeconds,
    expiresAtSeconds: record.expiresAtSeconds
  };
  if (includeCanonicalClocks) {
    clone.observedClock = cloneClockComponents(record.observedClock);
    clone.expiresClock = cloneClockComponents(record.expiresClock);
  }
  return clone;
}

function freezeObservation({
  eventId,
  threatPosition,
  impactPosition,
  intensity,
  observedAtSeconds,
  expiresAtSeconds,
  observedClock,
  expiresClock
}) {
  return Object.freeze({
    eventId: normalizeEventId(eventId),
    threatPosition: normalizePosition(threatPosition, 'threatPosition'),
    impactPosition: normalizePosition(impactPosition, 'impactPosition'),
    intensity: normalizeIntensity(intensity),
    observedAtSeconds,
    expiresAtSeconds,
    observedClock: freezeClockComponents(observedClock),
    expiresClock: freezeClockComponents(expiresClock)
  });
}

function compareRecordIds(left, right) {
  return compareText(eventIdKey(left.eventId), eventIdKey(right.eventId));
}

function currentScore(record, clock, lifetimeSeconds) {
  const rawRemainingFraction =
    clockDifferenceSeconds(record.expiresClock, clock) / lifetimeSeconds;
  const remainingFraction = Math.min(
    1,
    Math.max(0, rawRemainingFraction)
  );
  const score = record.intensity * remainingFraction;
  if (!Number.isFinite(score)) {
    throw new RangeError('threat-memory score must remain finite');
  }
  return score;
}

function compareEvictionCandidates(left, right, clock, lifetimeSeconds) {
  const scoreDifference = currentScore(
    left,
    clock,
    lifetimeSeconds
  ) - currentScore(right, clock, lifetimeSeconds);
  if (scoreDifference !== 0) return scoreDifference;
  const recencyDifference = compareCanonicalClocks(
    left.observedClock,
    right.observedClock
  );
  if (recencyDifference !== 0) return recencyDifference;
  return compareRecordIds(left, right);
}

function compareStrongestCandidates(left, right, clock, lifetimeSeconds) {
  const scoreDifference = currentScore(
    right,
    clock,
    lifetimeSeconds
  ) - currentScore(left, clock, lifetimeSeconds);
  if (scoreDifference !== 0) return scoreDifference;
  const recencyDifference = compareCanonicalClocks(
    right.observedClock,
    left.observedClock
  );
  if (recencyDifference !== 0) return recencyDifference;
  return compareRecordIds(left, right);
}

export class ThreatMemory {
  constructor(policy = DEFAULT_THREAT_MEMORY_POLICY) {
    this.policy = normalizePolicy(policy);
    this.clockWholeSeconds = 0;
    this.clockPicoseconds = 0;
    this.clockSeconds = 0;
    this.clockCompensationSeconds = 0;
    this.recordsById = new Map();
  }

  get size() {
    return this.recordsById.size;
  }

  record({ eventId, threatPosition, impactPosition, intensity }) {
    this.pruneExpired();
    const normalizedEventId = normalizeEventId(eventId);
    const observedClock = freezeClockComponents(this);
    const observedAtSeconds = this.clockSeconds;
    let expiryClock;
    try {
      expiryClock = addCanonicalClock(this, this.policy.lifetimeSeconds);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new RangeError(
        'threat-memory expiry must remain finite and representable'
      );
    }
    const expiresAtSeconds = expiryClock.clockSeconds;
    if (compareCanonicalClocks(expiryClock, observedClock) <= 0) {
      throw new RangeError(
        'threat-memory expiry must remain finite and representable'
      );
    }
    const observation = freezeObservation({
      eventId: normalizedEventId,
      threatPosition,
      impactPosition,
      intensity,
      observedAtSeconds,
      expiresAtSeconds,
      observedClock,
      expiresClock: expiryClock
    });
    const key = eventIdKey(normalizedEventId);
    if (this.recordsById.has(key)) {
      this.recordsById.set(key, observation);
      return this.#snapshotRecord(observation);
    }

    const candidates = [...this.recordsById.values(), observation];
    if (candidates.length > this.policy.capacity) {
      candidates.sort((left, right) =>
        compareEvictionCandidates(
          left,
          right,
          this,
          this.policy.lifetimeSeconds
        ));
      const evicted = candidates[0];
      if (eventIdKey(evicted.eventId) === key) return null;
      this.recordsById.delete(eventIdKey(evicted.eventId));
    }
    this.recordsById.set(key, observation);
    return this.#snapshotRecord(observation);
  }

  advance(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError(
        'threat-memory deltaSeconds must be finite and non-negative'
      );
    }
    if (deltaSeconds > 0) {
      const nextClock = addCanonicalClock(this, deltaSeconds);
      this.clockWholeSeconds = nextClock.clockWholeSeconds;
      this.clockPicoseconds = nextClock.clockPicoseconds;
      this.clockSeconds = nextClock.clockSeconds;
      this.clockCompensationSeconds =
        nextClock.clockCompensationSeconds;
    }
    this.pruneExpired();
    return this.getStrongest();
  }

  pruneExpired() {
    const expired = [...this.recordsById.values()]
      .filter(record =>
        compareCanonicalClocks(this, record.expiresClock) >= 0)
      .sort(compareRecordIds);
    for (const record of expired) {
      this.recordsById.delete(eventIdKey(record.eventId));
    }
    return expired.length;
  }

  getStrongest() {
    this.pruneExpired();
    const [strongest] = [...this.recordsById.values()]
      .sort((left, right) =>
        compareStrongestCandidates(
          left,
          right,
          this,
          this.policy.lifetimeSeconds
        ));
    return strongest ? this.#snapshotRecord(strongest) : null;
  }

  snapshot() {
    this.pruneExpired();
    const records = [...this.recordsById.values()]
      .sort(compareRecordIds)
      .map(record => this.#snapshotRecord(record));
    const strongest = this.getStrongest();
    return {
      version: STATE_VERSION,
      approximationLabel: this.policy.approximationLabel,
      capacity: this.policy.capacity,
      lifetimeSeconds: this.policy.lifetimeSeconds,
      scoreDecay: this.policy.scoreDecay,
      clockSeconds: this.clockSeconds,
      records,
      strongest
    };
  }

  captureState() {
    this.pruneExpired();
    return {
      version: STATE_VERSION,
      approximationLabel: this.policy.approximationLabel,
      capacity: this.policy.capacity,
      lifetimeSeconds: this.policy.lifetimeSeconds,
      scoreDecay: this.policy.scoreDecay,
      clockSeconds: this.clockSeconds,
      clockWholeSeconds: this.clockWholeSeconds,
      clockPicoseconds: this.clockPicoseconds,
      clockCompensationSeconds: this.clockCompensationSeconds,
      records: [...this.recordsById.values()]
        .sort(compareRecordIds)
        .map(record => cloneObservation(record, true))
    };
  }

  restoreState(state) {
    if (!state || typeof state !== 'object') {
      throw new TypeError('threat-memory restore requires a state object');
    }
    if (![LEGACY_STATE_VERSION, STATE_VERSION].includes(state.version)) {
      throw new TypeError(`unsupported threat-memory version ${state.version}`);
    }
    const policy = normalizePolicy({
      approximationLabel: state.approximationLabel,
      capacity: state.capacity,
      lifetimeSeconds: state.lifetimeSeconds,
      scoreDecay: state.scoreDecay
    });
    if (!Array.isArray(state.records) || state.records.length > policy.capacity) {
      throw new TypeError('threat-memory records must be a bounded array');
    }

    let clock;
    let legacyClockCompensationSeconds = 0;
    let legacyClockSeconds = 0;
    if (state.version === STATE_VERSION) {
      clock = canonicalClockFromComponents(state, 'threat-memory');
      if (!Object.is(state.clockSeconds, clock.clockSeconds)) {
        throw new TypeError(
          'threat-memory clockSeconds must match its canonical components'
        );
      }
    } else {
      if (!Number.isFinite(state.clockSeconds)
          || state.clockSeconds < 0
          || !Number.isFinite(state.clockCompensationSeconds)) {
        throw new TypeError(
          'legacy threat-memory clock must be finite and non-negative'
        );
      }
      legacyClockSeconds = normalizeLegacyClockDrift(
        state.clockSeconds
      );
      const legacyCompensationBound =
        legacyClockDriftTolerance(legacyClockSeconds);
      if (Math.abs(state.clockCompensationSeconds)
          > legacyCompensationBound) {
        throw new TypeError(
          'legacy threat-memory clock compensation exceeds machine-epsilon drift'
        );
      }
      legacyClockCompensationSeconds =
        isOnLegacyClockTick(legacyClockSeconds)
          ? 0
          : Object.is(state.clockCompensationSeconds, -0)
          ? 0
          : state.clockCompensationSeconds;
      try {
        clock = addCanonicalClock(
          clockFromAbsoluteSeconds(legacyClockSeconds),
          -legacyClockCompensationSeconds
        );
      } catch {
        throw new TypeError(
          'legacy threat-memory clock must be finite and representable'
        );
      }
    }
    const { clockSeconds } = clock;
    const recordsById = new Map();
    for (const saved of state.records) {
      if (!Number.isFinite(saved?.observedAtSeconds)
          || saved.observedAtSeconds < 0
          || (
            state.version === STATE_VERSION
              ? false
              : saved.observedAtSeconds > legacyClockSeconds
          )) {
        throw new TypeError(
          'threat-memory observedAtSeconds must be finite and not in the future'
        );
      }
      let observedClock;
      let expiresClock;
      if (state.version === STATE_VERSION) {
        observedClock = canonicalClockFromComponents(
          saved.observedClock,
          'threat-memory observation'
        );
        expiresClock = canonicalClockFromComponents(
          saved.expiresClock,
          'threat-memory expiry'
        );
        if (!Object.is(
          saved.observedAtSeconds,
          observedClock.clockSeconds
        )) {
          throw new TypeError(
            'threat-memory observedAtSeconds must match its canonical components'
          );
        }
        if (!Object.is(
          saved.expiresAtSeconds,
          expiresClock.clockSeconds
        )) {
          throw new TypeError(
            'threat-memory expiresAtSeconds must match its canonical components'
          );
        }
      } else {
        let legacyObservedClock;
        let legacyExpectedExpiry;
        try {
          legacyObservedClock = clockFromAbsoluteSeconds(
            saved.observedAtSeconds
          );
          legacyExpectedExpiry = normalizeLegacyClockDrift(
            saved.observedAtSeconds + policy.lifetimeSeconds
          );
          observedClock = legacyObservedClock;
          if (compareCanonicalClocks(observedClock, clock) > 0
              && clockDifferenceSeconds(observedClock, clock)
                <= legacyClockDriftTolerance(legacyClockSeconds)) {
            observedClock = clock;
          }
          expiresClock = addCanonicalClock(
            observedClock,
            policy.lifetimeSeconds
          );
        } catch {
          throw new TypeError(
            'threat-memory expiresAtSeconds must be finite and representable'
          );
        }
        if (!Number.isFinite(saved.expiresAtSeconds)
            || Math.abs(
              saved.expiresAtSeconds
              - legacyExpectedExpiry
            ) > legacyClockDriftTolerance(legacyExpectedExpiry)) {
          throw new TypeError(
            'threat-memory expiresAtSeconds must match its observation lifetime'
          );
        }
      }
      let expectedExpiryClock;
      try {
        expectedExpiryClock = addCanonicalClock(
          observedClock,
          policy.lifetimeSeconds
        );
      } catch {
        throw new TypeError(
          'threat-memory expiresAtSeconds must be finite and representable'
        );
      }
      if (compareCanonicalClocks(observedClock, clock) > 0) {
        throw new TypeError(
          'threat-memory observedAtSeconds must be finite and not in the future'
        );
      }
      if (compareCanonicalClocks(expiresClock, observedClock) <= 0
          || !canonicalClocksEqual(expiresClock, expectedExpiryClock)) {
        throw new TypeError(
          'threat-memory expiresAtSeconds must match its observation lifetime'
        );
      }
      const observation = freezeObservation({
        ...saved,
        observedAtSeconds: observedClock.clockSeconds,
        expiresAtSeconds: expiresClock.clockSeconds,
        observedClock,
        expiresClock
      });
      const key = eventIdKey(observation.eventId);
      if (recordsById.has(key)) {
        throw new TypeError('threat-memory state contains a duplicate eventId');
      }
      if (compareCanonicalClocks(clock, observation.expiresClock) < 0) {
        recordsById.set(key, observation);
      }
    }

    this.policy = policy;
    this.clockWholeSeconds = clock.clockWholeSeconds;
    this.clockPicoseconds = clock.clockPicoseconds;
    this.clockSeconds = clockSeconds;
    this.clockCompensationSeconds = clock.clockCompensationSeconds;
    this.recordsById = recordsById;
    return this;
  }

  #snapshotRecord(record) {
    return {
      ...cloneObservation(record, false),
      ageSeconds: clockDifferenceSeconds(this, record.observedClock),
      score: currentScore(
        record,
        this,
        this.policy.lifetimeSeconds
      )
    };
  }
}

export function restoreThreatMemory(savedState) {
  const memory = new ThreatMemory();
  if (savedState !== undefined && savedState !== null) {
    memory.restoreState(savedState);
  }
  return memory;
}

export function cloneThreatMemoryState(savedState) {
  if (savedState === undefined || savedState === null) return null;
  return restoreThreatMemory(savedState).captureState();
}
