export const THREAT_MEMORY_APPROXIMATION =
  'bounded per-soldier incoming-fire memory gameplay approximation v1';

export const THREAT_MEMORY_CLOCK_PRECISION_SECONDS = 1e-9;

export const DEFAULT_THREAT_MEMORY_POLICY = Object.freeze({
  approximationLabel: THREAT_MEMORY_APPROXIMATION,
  capacity: 4,
  lifetimeSeconds: 12,
  scoreDecay: 'linear-to-zero'
});

const STATE_VERSION = 1;
const MAX_RECORDS = 4;
const CLOCK_DRIFT_ULPS = 8;

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

function clockDriftTolerance(value) {
  return Number.EPSILON * Math.max(1, Math.abs(value)) * CLOCK_DRIFT_ULPS;
}

function normalizeCanonicalClockDrift(value) {
  const nearestTick = Math.round(
    value / THREAT_MEMORY_CLOCK_PRECISION_SECONDS
  ) * THREAT_MEMORY_CLOCK_PRECISION_SECONDS;
  return Math.abs(value - nearestTick) <= clockDriftTolerance(value)
    ? nearestTick
    : value;
}

function isOnCanonicalClockTick(value) {
  const nearestTick = Math.round(
    value / THREAT_MEMORY_CLOCK_PRECISION_SECONDS
  ) * THREAT_MEMORY_CLOCK_PRECISION_SECONDS;
  return Math.abs(value - nearestTick) <= clockDriftTolerance(value);
}

function cloneObservation(record) {
  return {
    eventId: record.eventId,
    threatPosition: [...record.threatPosition],
    impactPosition: [...record.impactPosition],
    intensity: record.intensity,
    observedAtSeconds: record.observedAtSeconds,
    expiresAtSeconds: record.expiresAtSeconds
  };
}

function freezeObservation({
  eventId,
  threatPosition,
  impactPosition,
  intensity,
  observedAtSeconds,
  expiresAtSeconds
}) {
  return Object.freeze({
    eventId: normalizeEventId(eventId),
    threatPosition: normalizePosition(threatPosition, 'threatPosition'),
    impactPosition: normalizePosition(impactPosition, 'impactPosition'),
    intensity: normalizeIntensity(intensity),
    observedAtSeconds,
    expiresAtSeconds
  });
}

function compareRecordIds(left, right) {
  return compareText(eventIdKey(left.eventId), eventIdKey(right.eventId));
}

function currentScore(record, clockSeconds, lifetimeSeconds) {
  const remainingFraction = Math.max(
    0,
    (record.expiresAtSeconds - clockSeconds) / lifetimeSeconds
  );
  return record.intensity * remainingFraction;
}

function compareEvictionCandidates(left, right, clockSeconds, lifetimeSeconds) {
  const scoreDifference = currentScore(
    left,
    clockSeconds,
    lifetimeSeconds
  ) - currentScore(right, clockSeconds, lifetimeSeconds);
  if (scoreDifference !== 0) return scoreDifference;
  if (left.observedAtSeconds !== right.observedAtSeconds) {
    return left.observedAtSeconds - right.observedAtSeconds;
  }
  return compareRecordIds(left, right);
}

function compareStrongestCandidates(left, right, clockSeconds, lifetimeSeconds) {
  const scoreDifference = currentScore(
    right,
    clockSeconds,
    lifetimeSeconds
  ) - currentScore(left, clockSeconds, lifetimeSeconds);
  if (scoreDifference !== 0) return scoreDifference;
  if (left.observedAtSeconds !== right.observedAtSeconds) {
    return right.observedAtSeconds - left.observedAtSeconds;
  }
  return compareRecordIds(left, right);
}

export class ThreatMemory {
  constructor(policy = DEFAULT_THREAT_MEMORY_POLICY) {
    this.policy = normalizePolicy(policy);
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
    const observedAtSeconds = this.clockSeconds;
    const observation = freezeObservation({
      eventId: normalizedEventId,
      threatPosition,
      impactPosition,
      intensity,
      observedAtSeconds,
      expiresAtSeconds: normalizeCanonicalClockDrift(
        observedAtSeconds + this.policy.lifetimeSeconds
      )
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
          this.clockSeconds,
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
      const correctedDelta = deltaSeconds - this.clockCompensationSeconds;
      const rawClock = this.clockSeconds + correctedDelta;
      let compensation = (rawClock - this.clockSeconds) - correctedDelta;
      const normalizedClock = normalizeCanonicalClockDrift(rawClock);
      if (isOnCanonicalClockTick(rawClock)) compensation = 0;
      this.clockSeconds = normalizedClock;
      this.clockCompensationSeconds = Object.is(compensation, -0)
        ? 0
        : compensation;
    }
    this.pruneExpired();
    return this.getStrongest();
  }

  pruneExpired() {
    const expired = [...this.recordsById.values()]
      .filter(record => this.clockSeconds >= record.expiresAtSeconds)
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
          this.clockSeconds,
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
      clockCompensationSeconds: this.clockCompensationSeconds,
      records: [...this.recordsById.values()]
        .sort(compareRecordIds)
        .map(cloneObservation)
    };
  }

  restoreState(state) {
    if (!state || typeof state !== 'object') {
      throw new TypeError('threat-memory restore requires a state object');
    }
    if (state.version !== STATE_VERSION) {
      throw new TypeError(`unsupported threat-memory version ${state.version}`);
    }
    const policy = normalizePolicy({
      approximationLabel: state.approximationLabel,
      capacity: state.capacity,
      lifetimeSeconds: state.lifetimeSeconds,
      scoreDecay: state.scoreDecay
    });
    if (!Number.isFinite(state.clockSeconds) || state.clockSeconds < 0) {
      throw new TypeError('threat-memory clockSeconds must be finite and non-negative');
    }
    if (!Number.isFinite(state.clockCompensationSeconds)) {
      throw new TypeError('threat-memory clock compensation must be finite');
    }
    if (!Array.isArray(state.records) || state.records.length > policy.capacity) {
      throw new TypeError('threat-memory records must be a bounded array');
    }

    const clockSeconds = normalizeCanonicalClockDrift(state.clockSeconds);
    if (Math.abs(state.clockCompensationSeconds)
        > clockDriftTolerance(clockSeconds)) {
      throw new TypeError(
        'threat-memory clock compensation exceeds machine-epsilon drift'
      );
    }
    const recordsById = new Map();
    for (const saved of state.records) {
      if (!Number.isFinite(saved?.observedAtSeconds)
          || saved.observedAtSeconds < 0
          || saved.observedAtSeconds > clockSeconds) {
        throw new TypeError(
          'threat-memory observedAtSeconds must be finite and not in the future'
        );
      }
      const expectedExpiry = normalizeCanonicalClockDrift(
        saved.observedAtSeconds + policy.lifetimeSeconds
      );
      if (!Number.isFinite(saved.expiresAtSeconds)
          || Math.abs(saved.expiresAtSeconds - expectedExpiry)
            > clockDriftTolerance(expectedExpiry)) {
        throw new TypeError(
          'threat-memory expiresAtSeconds must match its observation lifetime'
        );
      }
      const observation = freezeObservation({
        ...saved,
        expiresAtSeconds: expectedExpiry
      });
      const key = eventIdKey(observation.eventId);
      if (recordsById.has(key)) {
        throw new TypeError('threat-memory state contains a duplicate eventId');
      }
      if (clockSeconds < observation.expiresAtSeconds) {
        recordsById.set(key, observation);
      }
    }

    this.policy = policy;
    this.clockSeconds = clockSeconds;
    this.clockCompensationSeconds = isOnCanonicalClockTick(clockSeconds)
      ? 0
      : (Object.is(state.clockCompensationSeconds, -0)
          ? 0
          : state.clockCompensationSeconds);
    this.recordsById = recordsById;
    return this;
  }

  #snapshotRecord(record) {
    return {
      ...cloneObservation(record),
      ageSeconds: this.clockSeconds - record.observedAtSeconds,
      score: currentScore(
        record,
        this.clockSeconds,
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
