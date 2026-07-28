const STATE_VERSION = 1;
const MAX_CAPACITY = 256;
const MAX_ROUTE_SEGMENTS = 256;
const MAX_SAMPLES_PER_SEGMENT = 257;
const MAX_BATCH_SOURCES = 512;

export const INFANTRY_DANGER_MAP_APPROXIMATION =
  'first-order radial infantry terrain danger-map gameplay approximation v1';

export const INFANTRY_DANGER_SOURCE_KINDS = Object.freeze({
  OBSERVED_THREAT: 'observed-threat',
  INCOMING_IMPACT: 'incoming-impact',
  CASUALTY: 'casualty'
});

const SOURCE_KINDS = new Set(Object.values(INFANTRY_DANGER_SOURCE_KINDS));

export const INFANTRY_DANGER_MAP_MODEL = Object.freeze({
  version: STATE_VERSION,
  approximationLabel: INFANTRY_DANGER_MAP_APPROXIMATION,
  coordinateSpace: 'world X/Z metres',
  timeModel: 'caller-owned canonical integer simulation ticks',
  spatialExposure: 'linear-to-zero inside each source radius',
  temporalRecency: 'linear-to-zero over each source lifetime',
  contribution:
    'exposure times recency times intensity times confidence',
  overlap:
    'bounded independent-complement combination in stable source-ID order',
  routeAggregation: 'uniform bounded point-sample mean and peak'
});

export const DEFAULT_INFANTRY_DANGER_MAP_POLICY = Object.freeze({
  approximationLabel: INFANTRY_DANGER_MAP_APPROXIMATION,
  tickDurationSeconds: 1 / 30,
  capacity: 64,
  routeSampleSpacingMeters: 2,
  maxSamplesPerSegment: 65,
  maxRouteSegments: 128
});

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeNegativeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function normalizeStableId(value, label) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeNegativeZero(value);
  }
  throw new TypeError(`${label} must be a non-empty string or finite number`);
}

function stableIdKey(value, label) {
  const normalized = normalizeStableId(value, label);
  return `${typeof normalized}:${String(normalized)}`;
}

function normalizePosition(value, label) {
  let x;
  let z;
  if (Array.isArray(value)) {
    if (value.length === 2) {
      [x, z] = value;
    } else if (value.length === 3) {
      x = value[0];
      z = value[2];
    } else {
      throw new TypeError(
        `${label} must contain X/Z or X/Y/Z components`
      );
    }
  } else {
    x = value?.x;
    z = value?.z;
  }
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError(`${label} must contain finite X and Z components`);
  }
  return Object.freeze([
    normalizeNegativeZero(x),
    normalizeNegativeZero(z)
  ]);
}

function finiteUnitInterval(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be finite and between 0 and 1`);
  }
  return normalizeNegativeZero(value);
}

function finitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be positive and finite`);
  }
  return value;
}

function safePositiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(
      `${label} must be a positive safe integer no greater than ${maximum}`
    );
  }
  return value;
}

function safeNonNegativeInteger(
  value,
  label,
  maximum = Number.MAX_SAFE_INTEGER
) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(
      `${label} must be a non-negative safe integer no greater than ${maximum}`
    );
  }
  return value;
}

function safeTickSum(left, right, label) {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < left) {
    throw new RangeError(`${label} must remain a non-negative safe integer`);
  }
  return result;
}

function normalizePolicy(policyInput = {}) {
  const policy = {
    ...DEFAULT_INFANTRY_DANGER_MAP_POLICY,
    ...policyInput
  };
  if (policy.approximationLabel !== INFANTRY_DANGER_MAP_APPROXIMATION) {
    throw new TypeError(
      'infantry danger-map policy must retain its approximation label'
    );
  }
  finitePositive(
    policy.tickDurationSeconds,
    'infantry danger-map tickDurationSeconds'
  );
  safePositiveInteger(
    policy.capacity,
    'infantry danger-map capacity',
    MAX_CAPACITY
  );
  finitePositive(
    policy.routeSampleSpacingMeters,
    'infantry danger-map routeSampleSpacingMeters'
  );
  safePositiveInteger(
    policy.maxSamplesPerSegment,
    'infantry danger-map maxSamplesPerSegment',
    MAX_SAMPLES_PER_SEGMENT
  );
  if (policy.maxSamplesPerSegment < 2) {
    throw new RangeError(
      'infantry danger-map maxSamplesPerSegment must be at least 2'
    );
  }
  safePositiveInteger(
    policy.maxRouteSegments,
    'infantry danger-map maxRouteSegments',
    MAX_ROUTE_SEGMENTS
  );
  return Object.freeze({
    approximationLabel: policy.approximationLabel,
    tickDurationSeconds: policy.tickDurationSeconds,
    capacity: policy.capacity,
    routeSampleSpacingMeters: policy.routeSampleSpacingMeters,
    maxSamplesPerSegment: policy.maxSamplesPerSegment,
    maxRouteSegments: policy.maxRouteSegments
  });
}

function normalizeKind(value) {
  if (!SOURCE_KINDS.has(value)) {
    throw new TypeError(`unsupported infantry danger source kind ${value}`);
  }
  return value;
}

function freezeSource({
  sourceId,
  kind,
  position,
  radiusMeters,
  intensity,
  confidence,
  observedTick,
  lifetimeTicks,
  expiresTick
}) {
  return Object.freeze({
    sourceId,
    kind,
    position: Object.freeze([...position]),
    radiusMeters,
    intensity,
    confidence,
    observedTick,
    lifetimeTicks,
    expiresTick
  });
}

function normalizeNewSource(source, clockTick, path) {
  if (!source || typeof source !== 'object') {
    throw new TypeError(`${path} must be an object`);
  }
  const sourceId = normalizeStableId(source.sourceId, `${path}.sourceId`);
  const lifetimeTicks = safePositiveInteger(
    source.lifetimeTicks,
    `${path}.lifetimeTicks`
  );
  return freezeSource({
    sourceId,
    kind: normalizeKind(source.kind),
    position: normalizePosition(source.position, `${path}.position`),
    radiusMeters: finitePositive(
      source.radiusMeters,
      `${path}.radiusMeters`
    ),
    intensity: finiteUnitInterval(source.intensity, `${path}.intensity`),
    confidence: finiteUnitInterval(
      source.confidence,
      `${path}.confidence`
    ),
    observedTick: clockTick,
    lifetimeTicks,
    expiresTick: safeTickSum(
      clockTick,
      lifetimeTicks,
      `${path}.expiresTick`
    )
  });
}

function normalizeSavedSource(source, clockTick, path) {
  if (!source || typeof source !== 'object') {
    throw new TypeError(`${path} must be an object`);
  }
  const sourceId = normalizeStableId(source.sourceId, `${path}.sourceId`);
  const observedTick = safeNonNegativeInteger(
    source.observedTick,
    `${path}.observedTick`,
    clockTick
  );
  const lifetimeTicks = safePositiveInteger(
    source.lifetimeTicks,
    `${path}.lifetimeTicks`
  );
  const expiresTick = safePositiveInteger(
    source.expiresTick,
    `${path}.expiresTick`
  );
  if (safeTickSum(
    observedTick,
    lifetimeTicks,
    `${path}.expiresTick`
  ) !== expiresTick) {
    throw new TypeError(
      `${path}.expiresTick must match observedTick plus lifetimeTicks`
    );
  }
  if (expiresTick <= clockTick) {
    throw new TypeError(`${path} must be unexpired at clockTick`);
  }
  return freezeSource({
    sourceId,
    kind: normalizeKind(source.kind),
    position: normalizePosition(source.position, `${path}.position`),
    radiusMeters: finitePositive(
      source.radiusMeters,
      `${path}.radiusMeters`
    ),
    intensity: finiteUnitInterval(source.intensity, `${path}.intensity`),
    confidence: finiteUnitInterval(
      source.confidence,
      `${path}.confidence`
    ),
    observedTick,
    lifetimeTicks,
    expiresTick
  });
}

function compareSourceIds(left, right) {
  return compareText(
    stableIdKey(left.sourceId, 'sourceId'),
    stableIdKey(right.sourceId, 'sourceId')
  );
}

function compareRetentionPriority(left, right) {
  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }
  if (left.intensity !== right.intensity) {
    return right.intensity - left.intensity;
  }
  if (left.observedTick !== right.observedTick) {
    return right.observedTick - left.observedTick;
  }
  return compareSourceIds(left, right);
}

function cloneSource(source) {
  return {
    sourceId: source.sourceId,
    kind: source.kind,
    position: [...source.position],
    radiusMeters: source.radiusMeters,
    intensity: source.intensity,
    confidence: source.confidence,
    observedTick: source.observedTick,
    lifetimeTicks: source.lifetimeTicks,
    expiresTick: source.expiresTick
  };
}

function snapshotSource(source, clockTick, tickDurationSeconds) {
  const ageTicks = clockTick - source.observedTick;
  const remainingTicks = source.expiresTick - clockTick;
  return Object.freeze({
    ...cloneSource(source),
    position: Object.freeze([...source.position]),
    ageTicks,
    ageSeconds: ageTicks * tickDurationSeconds,
    recency: Math.max(0, Math.min(1, remainingTicks / source.lifetimeTicks))
  });
}

function cloneStableId(value) {
  return value;
}

function normalizedSegment(segment, index) {
  if (!segment || typeof segment !== 'object') {
    throw new TypeError(`route segment ${index} must be an object`);
  }
  const segmentId = normalizeStableId(
    segment.segmentId,
    `route segment ${index}.segmentId`
  );
  return Object.freeze({
    segmentId,
    start: normalizePosition(
      segment.start,
      `route segment ${String(segmentId)}.start`
    ),
    end: normalizePosition(
      segment.end,
      `route segment ${String(segmentId)}.end`
    )
  });
}

function frozenFactors({
  exposure = 0,
  recency = 0,
  intensity = 0,
  confidence = 0
} = {}) {
  return Object.freeze({ exposure, recency, intensity, confidence });
}

/**
 * Renderer-neutral, bounded evidence field for infantry route evaluation.
 *
 * The caller owns conversion from its fixed simulation step to integer ticks.
 * This class evaluates points and already-authored route segments; it never
 * creates, selects, or renders a route.
 */
export class InfantryDangerMap {
  constructor(policy = DEFAULT_INFANTRY_DANGER_MAP_POLICY) {
    this.policy = normalizePolicy(policy);
    this.clockTick = 0;
    this.sourcesByKey = new Map();
  }

  get size() {
    return this.sourcesByKey.size;
  }

  advanceTicks(tickCount) {
    safeNonNegativeInteger(tickCount, 'infantry danger-map tickCount');
    if (tickCount > 0) {
      this.clockTick = safeTickSum(
        this.clockTick,
        tickCount,
        'infantry danger-map clockTick'
      );
    }
    this.pruneExpired();
    return this.clockTick;
  }

  pruneExpired() {
    const expiredKeys = [...this.sourcesByKey.entries()]
      .filter(([, source]) => source.expiresTick <= this.clockTick)
      .map(([key]) => key)
      .sort(compareText);
    for (const key of expiredKeys) this.sourcesByKey.delete(key);
    return expiredKeys.length;
  }

  recordObservedThreat({
    threatPosition,
    ...source
  } = {}) {
    return this.recordSource({
      ...source,
      kind: INFANTRY_DANGER_SOURCE_KINDS.OBSERVED_THREAT,
      position: threatPosition
    });
  }

  recordIncomingImpact({
    impactPosition,
    ...source
  } = {}) {
    return this.recordSource({
      ...source,
      kind: INFANTRY_DANGER_SOURCE_KINDS.INCOMING_IMPACT,
      position: impactPosition
    });
  }

  recordCasualty({
    casualtyPosition,
    ...source
  } = {}) {
    return this.recordSource({
      ...source,
      kind: INFANTRY_DANGER_SOURCE_KINDS.CASUALTY,
      position: casualtyPosition
    });
  }

  recordSource(source) {
    const [result = null] = this.recordSources([source]);
    return result;
  }

  recordSources(sources) {
    if (!Array.isArray(sources) || sources.length > MAX_BATCH_SOURCES) {
      throw new TypeError(
        `infantry danger sources must be an array of at most ${MAX_BATCH_SOURCES}`
      );
    }
    const normalized = sources.map((source, index) =>
      normalizeNewSource(source, this.clockTick, `danger source ${index}`));
    const inputKeys = new Set();
    for (const source of normalized) {
      const key = stableIdKey(source.sourceId, 'danger source sourceId');
      if (inputKeys.has(key)) {
        throw new TypeError(
          'infantry danger source batch contains a duplicate sourceId'
        );
      }
      inputKeys.add(key);
    }

    this.pruneExpired();
    const candidates = new Map(this.sourcesByKey);
    for (const source of normalized) {
      candidates.set(
        stableIdKey(source.sourceId, 'danger source sourceId'),
        source
      );
    }
    const retained = [...candidates.values()]
      .sort(compareRetentionPriority)
      .slice(0, this.policy.capacity)
      .sort(compareSourceIds);
    this.sourcesByKey = new Map(retained.map(source => [
      stableIdKey(source.sourceId, 'danger source sourceId'),
      source
    ]));

    return normalized
      .filter(source =>
        this.sourcesByKey.has(
          stableIdKey(source.sourceId, 'danger source sourceId')
        ))
      .sort(compareSourceIds)
      .map(source =>
        snapshotSource(
          this.sourcesByKey.get(
            stableIdKey(source.sourceId, 'danger source sourceId')
          ),
          this.clockTick,
          this.policy.tickDurationSeconds
        ));
  }

  queryPoint(position) {
    const normalizedPosition = normalizePosition(
      position,
      'infantry danger-map query point'
    );
    this.pruneExpired();
    return this.#queryNormalizedPoint(normalizedPosition);
  }

  scoreRouteSegments(segments) {
    if (!Array.isArray(segments)
        || segments.length > this.policy.maxRouteSegments) {
      throw new TypeError(
        'route segments must be a bounded ordered array'
      );
    }
    const normalized = segments.map(normalizedSegment);
    const segmentKeys = new Set();
    for (const segment of normalized) {
      const key = stableIdKey(segment.segmentId, 'route segment segmentId');
      if (segmentKeys.has(key)) {
        throw new TypeError('route segments contain a duplicate segmentId');
      }
      segmentKeys.add(key);
    }
    this.pruneExpired();

    return Object.freeze(normalized.map((segment, order) => {
      const deltaX = segment.end[0] - segment.start[0];
      const deltaZ = segment.end[1] - segment.start[1];
      const lengthMeters = Math.hypot(deltaX, deltaZ);
      const intervalCount = lengthMeters === 0
        ? 0
        : Math.min(
            this.policy.maxSamplesPerSegment - 1,
            Math.max(
              1,
              Math.ceil(
                lengthMeters / this.policy.routeSampleSpacingMeters
              )
            )
          );
      const sampleCount = intervalCount + 1;
      let knownSampleCount = 0;
      let dangerSum = 0;
      let peakDanger = 0;
      let exposureSum = 0;
      let recencySum = 0;
      let intensitySum = 0;
      let confidenceSum = 0;
      const sourceIdsByKey = new Map();

      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
        const ratio = intervalCount === 0
          ? 0
          : sampleIndex / intervalCount;
        const result = this.#queryNormalizedPoint([
          segment.start[0] + deltaX * ratio,
          segment.start[1] + deltaZ * ratio
        ]);
        if (result.known) knownSampleCount++;
        dangerSum += result.danger;
        peakDanger = Math.max(peakDanger, result.danger);
        exposureSum += result.factors.exposure;
        recencySum += result.factors.recency;
        intensitySum += result.factors.intensity;
        confidenceSum += result.factors.confidence;
        for (const contribution of result.contributions) {
          sourceIdsByKey.set(
            stableIdKey(contribution.sourceId, 'danger contribution sourceId'),
            contribution.sourceId
          );
        }
      }

      return Object.freeze({
        segmentId: cloneStableId(segment.segmentId),
        order,
        start: Object.freeze([...segment.start]),
        end: Object.freeze([...segment.end]),
        lengthMeters,
        sampleCount,
        knownSampleCount,
        factors: frozenFactors({
          exposure: exposureSum / sampleCount,
          recency: knownSampleCount > 0
            ? recencySum / knownSampleCount
            : 0,
          intensity: knownSampleCount > 0
            ? intensitySum / knownSampleCount
            : 0,
          confidence: knownSampleCount > 0
            ? confidenceSum / knownSampleCount
            : 0
        }),
        meanDanger: dangerSum / sampleCount,
        peakDanger,
        sourceIds: Object.freeze(
          [...sourceIdsByKey.entries()]
            .sort(([left], [right]) => compareText(left, right))
            .map(([, sourceId]) => cloneStableId(sourceId))
        )
      });
    }));
  }

  captureState() {
    this.pruneExpired();
    return {
      version: STATE_VERSION,
      approximationLabel: this.policy.approximationLabel,
      tickDurationSeconds: this.policy.tickDurationSeconds,
      capacity: this.policy.capacity,
      routeSampleSpacingMeters: this.policy.routeSampleSpacingMeters,
      maxSamplesPerSegment: this.policy.maxSamplesPerSegment,
      maxRouteSegments: this.policy.maxRouteSegments,
      clockTick: this.clockTick,
      sources: [...this.sourcesByKey.values()]
        .sort(compareSourceIds)
        .map(cloneSource)
    };
  }

  restoreState(savedState) {
    if (!savedState || typeof savedState !== 'object') {
      throw new TypeError('infantry danger-map restore requires a state object');
    }
    if (savedState.version !== STATE_VERSION) {
      throw new TypeError(
        `unsupported infantry danger-map version ${savedState.version}`
      );
    }
    const policy = normalizePolicy({
      approximationLabel: savedState.approximationLabel,
      tickDurationSeconds: savedState.tickDurationSeconds,
      capacity: savedState.capacity,
      routeSampleSpacingMeters: savedState.routeSampleSpacingMeters,
      maxSamplesPerSegment: savedState.maxSamplesPerSegment,
      maxRouteSegments: savedState.maxRouteSegments
    });
    const clockTick = safeNonNegativeInteger(
      savedState.clockTick,
      'infantry danger-map clockTick'
    );
    if (!Array.isArray(savedState.sources)
        || savedState.sources.length > policy.capacity) {
      throw new TypeError(
        'infantry danger-map sources must be a bounded array'
      );
    }
    const sources = savedState.sources.map((source, index) =>
      normalizeSavedSource(
        source,
        clockTick,
        `infantry danger-map source ${index}`
      ));
    const sourcesByKey = new Map();
    for (const source of sources) {
      const key = stableIdKey(source.sourceId, 'danger source sourceId');
      if (sourcesByKey.has(key)) {
        throw new TypeError(
          'infantry danger-map state contains a duplicate sourceId'
        );
      }
      sourcesByKey.set(key, source);
    }

    this.policy = policy;
    this.clockTick = clockTick;
    this.sourcesByKey = new Map(
      [...sourcesByKey.entries()].sort(([left], [right]) =>
        compareText(left, right))
    );
    return this;
  }

  #queryNormalizedPoint(position) {
    const contributions = [];
    let remainingSafety = 1;
    let peakExposure = 0;
    let peakRecency = 0;
    let peakIntensity = 0;
    let peakConfidence = 0;

    for (const source of [...this.sourcesByKey.values()]
      .sort(compareSourceIds)) {
      const distanceMeters = Math.hypot(
        position[0] - source.position[0],
        position[1] - source.position[1]
      );
      const exposure = Math.max(
        0,
        Math.min(1, 1 - distanceMeters / source.radiusMeters)
      );
      if (exposure <= 0) continue;
      const recency = Math.max(
        0,
        Math.min(
          1,
          (source.expiresTick - this.clockTick) / source.lifetimeTicks
        )
      );
      if (recency <= 0) continue;
      const danger =
        exposure * recency * source.intensity * source.confidence;
      remainingSafety *= 1 - danger;
      peakExposure = Math.max(peakExposure, exposure);
      peakRecency = Math.max(peakRecency, recency);
      peakIntensity = Math.max(peakIntensity, source.intensity);
      peakConfidence = Math.max(peakConfidence, source.confidence);
      contributions.push(Object.freeze({
        sourceId: cloneStableId(source.sourceId),
        kind: source.kind,
        position: Object.freeze([...source.position]),
        distanceMeters,
        exposure,
        recency,
        intensity: source.intensity,
        confidence: source.confidence,
        danger
      }));
    }

    const danger = contributions.length > 0
      ? Math.max(0, Math.min(1, 1 - remainingSafety))
      : 0;
    return Object.freeze({
      version: STATE_VERSION,
      approximationLabel: INFANTRY_DANGER_MAP_APPROXIMATION,
      clockTick: this.clockTick,
      position: Object.freeze([...position]),
      known: contributions.length > 0,
      factors: frozenFactors({
        exposure: peakExposure,
        recency: peakRecency,
        intensity: peakIntensity,
        confidence: peakConfidence
      }),
      danger,
      contributions: Object.freeze(contributions)
    });
  }
}

export function restoreInfantryDangerMap(savedState) {
  const dangerMap = new InfantryDangerMap();
  if (savedState !== undefined && savedState !== null) {
    dangerMap.restoreState(savedState);
  }
  return dangerMap;
}

export function cloneInfantryDangerMapState(savedState) {
  if (savedState === undefined || savedState === null) return null;
  return restoreInfantryDangerMap(savedState).captureState();
}
