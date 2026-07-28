export const IDENTIFICATION_QUALITY_APPROXIMATION =
  'first-order observation certainty gameplay approximation v1';

export const IDENTIFICATION_TIER = Object.freeze({
  UNIDENTIFIED: 'UNIDENTIFIED',
  VISUAL_CONTACT: 'VISUAL_CONTACT',
  DEVELOPING: 'DEVELOPING',
  CONFIRMED: 'CONFIRMED'
});

export const IDENTIFICATION_QUALITY_POLICY = Object.freeze({
  approximationLabel: IDENTIFICATION_QUALITY_APPROXIMATION,
  minimumProgress: 0,
  maximumProgress: 1,
  acquiredVisualProgress: 0.35,
  directProgressPerSecond: 0.25,
  memoryDecayPerSecond: 0.025,
  tiers: Object.freeze([
    Object.freeze({
      id: IDENTIFICATION_TIER.UNIDENTIFIED,
      minimumProgress: 0
    }),
    Object.freeze({
      id: IDENTIFICATION_TIER.VISUAL_CONTACT,
      minimumProgress: 0.25
    }),
    Object.freeze({
      id: IDENTIFICATION_TIER.DEVELOPING,
      minimumProgress: 0.6
    }),
    Object.freeze({
      id: IDENTIFICATION_TIER.CONFIRMED,
      minimumProgress: 0.9
    })
  ])
});

const PROGRESS_PRECISION = 1e12;
const TIME_PRECISION = 1e9;
const DIRECT_PROGRESS_TICKS_PER_NANOSECOND = BigInt(
  IDENTIFICATION_QUALITY_POLICY.directProgressPerSecond
  * PROGRESS_PRECISION / TIME_PRECISION
);
const MEMORY_DECAY_TICKS_PER_NANOSECOND = BigInt(
  IDENTIFICATION_QUALITY_POLICY.memoryDecayPerSecond
  * PROGRESS_PRECISION / TIME_PRECISION
);
const MAX_PROGRESS_TICKS = BigInt(PROGRESS_PRECISION);

// The spotting clock advances in canonical nanoseconds. These two rates map
// each nanosecond to an integer number of picoprogress ticks, so accumulating
// equivalent absolute-time partitions cannot introduce per-step float drift.
export function identificationProgressTicks(value) {
  return Math.round(value * PROGRESS_PRECISION);
}

function progressFromTicks(value) {
  return value / PROGRESS_PRECISION;
}

function nonNegativeSeconds(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be finite and non-negative`);
  }
  return value;
}

function nonNegativeNanoseconds(value, field) {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new TypeError(`${field} must be a non-negative integer`);
    }
    return value;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
  return BigInt(value);
}

export function identificationDurationNanoseconds(
  value,
  field = 'identification duration seconds'
) {
  const seconds = nonNegativeSeconds(value, field);
  const wholeSeconds = Math.trunc(seconds);
  if (!Number.isSafeInteger(wholeSeconds)) {
    throw new TypeError(`${field} must remain safely representable`);
  }
  const fractionalNanoseconds = Math.round(
    (seconds - wholeSeconds) * TIME_PRECISION
  );
  return BigInt(wholeSeconds) * BigInt(TIME_PRECISION)
    + BigInt(fractionalNanoseconds);
}

export function normalizeIdentificationProgress(
  value = IDENTIFICATION_QUALITY_POLICY.minimumProgress,
  field = 'identificationProgress'
) {
  if (!Number.isFinite(value)
      || value < IDENTIFICATION_QUALITY_POLICY.minimumProgress
      || value > IDENTIFICATION_QUALITY_POLICY.maximumProgress) {
    throw new TypeError(`${field} must be finite and between zero and one`);
  }
  return Math.max(
    IDENTIFICATION_QUALITY_POLICY.minimumProgress,
    Math.min(
      IDENTIFICATION_QUALITY_POLICY.maximumProgress,
      progressFromTicks(identificationProgressTicks(value))
    )
  );
}

export function deriveIdentificationTier(progressInput) {
  const progress = normalizeIdentificationProgress(progressInput);
  let tier = IDENTIFICATION_TIER.UNIDENTIFIED;
  for (const candidate of IDENTIFICATION_QUALITY_POLICY.tiers) {
    if (progress < candidate.minimumProgress) break;
    tier = candidate.id;
  }
  return tier;
}

export function identificationProjection(progressInput) {
  const identificationProgress =
    normalizeIdentificationProgress(progressInput);
  return {
    identificationProgress,
    identificationTier: deriveIdentificationTier(identificationProgress),
    identificationApproximationLabel:
      IDENTIFICATION_QUALITY_APPROXIMATION
  };
}

export function validateIdentificationProjection(
  record,
  field = 'identification'
) {
  if (!record || typeof record !== 'object') {
    throw new TypeError(`${field} must be an object`);
  }
  if (!Object.hasOwn(record, 'identificationProgress')) {
    throw new TypeError(`${field}.identificationProgress is required`);
  }
  const projected = identificationProjection(record.identificationProgress);
  if (record.identificationTier !== projected.identificationTier) {
    throw new TypeError(
      `${field}.identificationTier must match identificationProgress`
    );
  }
  if (record.identificationApproximationLabel
      !== IDENTIFICATION_QUALITY_APPROXIMATION) {
    throw new TypeError(
      `${field}.identificationApproximationLabel must match the identification policy`
    );
  }
  return projected.identificationProgress;
}

export function beginVisualIdentification(progressInput = 0) {
  const progress = normalizeIdentificationProgress(progressInput);
  return Math.max(
    progress,
    IDENTIFICATION_QUALITY_POLICY.acquiredVisualProgress
  );
}

export function progressIdentification(progressInput, secondsInput) {
  return progressIdentificationNanoseconds(
    progressInput,
    identificationDurationNanoseconds(
      secondsInput,
      'identification progress seconds'
    )
  );
}

export function progressIdentificationNanoseconds(
  progressInput,
  nanosecondsInput
) {
  const progress = normalizeIdentificationProgress(progressInput);
  const nanoseconds = nonNegativeNanoseconds(
    nanosecondsInput,
    'identification progress nanoseconds'
  );
  const nextTicks = BigInt(identificationProgressTicks(progress))
    + nanoseconds * DIRECT_PROGRESS_TICKS_PER_NANOSECOND;
  return normalizeIdentificationProgress(
    progressFromTicks(
      Number(nextTicks > MAX_PROGRESS_TICKS
        ? MAX_PROGRESS_TICKS
        : nextTicks)
    )
  );
}

export function decayIdentification(progressInput, secondsInput) {
  return decayIdentificationNanoseconds(
    progressInput,
    identificationDurationNanoseconds(
      secondsInput,
      'identification decay seconds'
    )
  );
}

export function decayIdentificationNanoseconds(
  progressInput,
  nanosecondsInput
) {
  const progress = normalizeIdentificationProgress(progressInput);
  const nanoseconds = nonNegativeNanoseconds(
    nanosecondsInput,
    'identification decay nanoseconds'
  );
  const nextTicks = BigInt(identificationProgressTicks(progress))
    - nanoseconds * MEMORY_DECAY_TICKS_PER_NANOSECOND;
  return normalizeIdentificationProgress(
    progressFromTicks(Number(nextTicks < 0n ? 0n : nextTicks))
  );
}
