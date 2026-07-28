const GEOMETRY_EPSILON = 1e-9;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export const FOLIAGE_CONCEALMENT_APPROXIMATION =
  'first-order terrain foliage concealment gameplay approximation v1';

export const FOLIAGE_CONCEALMENT_SHAPE = Object.freeze({
  CIRCULAR_CANOPY: 'CIRCULAR_CANOPY',
  ORIENTED_CANOPY: 'ORIENTED_CANOPY'
});

export const FOLIAGE_CONCEALMENT_ROLE = Object.freeze({
  OBSERVER: 'OBSERVER',
  TARGET: 'TARGET',
  OBSERVER_AND_TARGET: 'OBSERVER_AND_TARGET',
  INTERVENING: 'INTERVENING'
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * All numerical values in this policy are first-order gameplay approximations.
 * The positive factor floors are intentional: ordinary foliage degrades a
 * sight line, but never becomes authoritative hard occlusion.
 */
export const FOLIAGE_CONCEALMENT_POLICY = deepFreeze({
  approximationLabel: FOLIAGE_CONCEALMENT_APPROXIMATION,
  interveningExposure: {
    referenceWeightedPathMeters: 6,
    dataQuality: FOLIAGE_CONCEALMENT_APPROXIMATION
  },
  maximumObservationRange: {
    observerPenalty: 0.08,
    targetPenalty: 0.28,
    interveningPenalty: 0.35,
    minimumFactor: 0.35,
    dataQuality: FOLIAGE_CONCEALMENT_APPROXIMATION
  },
  acquisitionTime: {
    observerPenalty: 0.35,
    targetPenalty: 1.1,
    interveningPenalty: 1.4,
    maximumFactor: 4,
    dataQuality: FOLIAGE_CONCEALMENT_APPROXIMATION
  },
  identificationProgress: {
    observerPenalty: 0.15,
    targetPenalty: 0.4,
    interveningPenalty: 0.45,
    minimumFactor: 0.2,
    dataQuality: FOLIAGE_CONCEALMENT_APPROXIMATION
  },
  visibilityQuality: {
    observerPenalty: 0.12,
    targetPenalty: 0.45,
    interveningPenalty: 0.5,
    minimumFactor: 0.15,
    dataQuality: FOLIAGE_CONCEALMENT_APPROXIMATION
  }
});

function requireRecord(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value;
}

function requireFinite(value, field) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${field} must be finite`);
  }
  return value;
}

function requirePositive(value, field) {
  const number = requireFinite(value, field);
  if (number <= 0) throw new TypeError(`${field} must be positive`);
  return number;
}

function requireTuple(value, length, field) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${field} must be a ${length}-element array`);
  }
  return value.map((component, index) =>
    requireFinite(component, `${field}[${index}]`));
}

function requireQuality(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireStableId(value, field) {
  if (typeof value !== 'string'
      || value !== value.trim()
      || !STABLE_ID_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a stable ASCII id`);
  }
  return value;
}

function compareStableIds(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeVolume(source, field) {
  const record = requireRecord(source, field);
  const id = requireStableId(record.id, `${field}.id`);
  const shape = record.shape;
  if (!Object.values(FOLIAGE_CONCEALMENT_SHAPE).includes(shape)) {
    throw new TypeError(
      `${field}.shape must be CIRCULAR_CANOPY or ORIENTED_CANOPY`
    );
  }
  const center = requireTuple(record.center, 3, `${field}.center`);
  const density = requireFinite(record.density, `${field}.density`);
  if (density <= 0 || density > 1) {
    throw new TypeError(`${field}.density must be greater than zero and at most one`);
  }
  const densityDataQuality = requireQuality(
    record.densityDataQuality,
    `${field}.densityDataQuality`
  );
  if (densityDataQuality !== FOLIAGE_CONCEALMENT_APPROXIMATION) {
    throw new TypeError(
      `${field}.densityDataQuality must label the gameplay approximation`
    );
  }
  const geometryDataQuality = requireQuality(
    record.geometryDataQuality,
    `${field}.geometryDataQuality`
  );

  if (shape === FOLIAGE_CONCEALMENT_SHAPE.CIRCULAR_CANOPY) {
    return {
      id,
      shape,
      center,
      radiusMeters: requirePositive(
        record.radiusMeters,
        `${field}.radiusMeters`
      ),
      halfHeightMeters: requirePositive(
        record.halfHeightMeters,
        `${field}.halfHeightMeters`
      ),
      density,
      densityDataQuality,
      geometryDataQuality
    };
  }

  return {
    id,
    shape,
    center,
    halfExtentsMeters: requireTuple(
      record.halfExtentsMeters,
      3,
      `${field}.halfExtentsMeters`
    ).map((extent, index) =>
      requirePositive(extent, `${field}.halfExtentsMeters[${index}]`)),
    rotationYRadians: requireFinite(
      record.rotationYRadians,
      `${field}.rotationYRadians`
    ),
    density,
    densityDataQuality,
    geometryDataQuality
  };
}

function normalizeVolumes(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('foliage concealment volumes must be an array');
  }
  const normalized = records.map((record, index) =>
    normalizeVolume(record, `foliage concealment volumes[${index}]`));
  normalized.sort((left, right) => compareStableIds(left.id, right.id));
  for (let index = 1; index < normalized.length; index++) {
    if (normalized[index - 1].id === normalized[index].id) {
      throw new TypeError(
        `foliage concealment volume id ${normalized[index].id} is duplicated`
      );
    }
  }
  return normalized;
}

/**
 * Validates one explicit renderer-neutral foliage volume.
 */
export function validateFoliageConcealmentVolume(
  record,
  field = 'foliage concealment volume'
) {
  normalizeVolume(record, field);
  return true;
}

/**
 * Returns canonical immutable volumes in stable-ID order. Trigonometric and
 * segment-projection values remain query-local derived state.
 */
export function defineFoliageConcealmentVolumes(records) {
  return deepFreeze(normalizeVolumes(records));
}

function positionTuple(value, field) {
  if (Array.isArray(value)) return requireTuple(value, 3, field);
  if (value && typeof value === 'object') {
    return [
      requireFinite(value.x, `${field}.x`),
      requireFinite(value.y, `${field}.y`),
      requireFinite(value.z, `${field}.z`)
    ];
  }
  throw new TypeError(`${field} must be a three-element array or x/y/z object`);
}

function interiorMargin(extent) {
  return GEOMETRY_EPSILON * Math.max(1, extent);
}

function strictlyInsideVolume(point, volume) {
  const dx = point[0] - volume.center[0];
  const dy = point[1] - volume.center[1];
  const dz = point[2] - volume.center[2];

  if (volume.shape === FOLIAGE_CONCEALMENT_SHAPE.CIRCULAR_CANOPY) {
    const radialMargin = interiorMargin(volume.radiusMeters);
    const innerRadius = Math.max(0, volume.radiusMeters - radialMargin);
    return dx * dx + dz * dz < innerRadius * innerRadius
      && Math.abs(dy)
        < volume.halfHeightMeters - interiorMargin(volume.halfHeightMeters);
  }

  const cosine = Math.cos(volume.rotationYRadians);
  const sine = Math.sin(volume.rotationYRadians);
  const localX = cosine * dx - sine * dz;
  const localZ = sine * dx + cosine * dz;
  const [halfX, halfY, halfZ] = volume.halfExtentsMeters;
  return Math.abs(localX) < halfX - interiorMargin(halfX)
    && Math.abs(dy) < halfY - interiorMargin(halfY)
    && Math.abs(localZ) < halfZ - interiorMargin(halfZ);
}

function clipSlab(interval, origin, delta, minimum, maximum) {
  const margin = interiorMargin(Math.max(Math.abs(minimum), Math.abs(maximum)));
  if (Math.abs(delta) <= GEOMETRY_EPSILON) {
    if (origin <= minimum + margin || origin >= maximum - margin) return null;
    return interval;
  }
  const first = (minimum - origin) / delta;
  const second = (maximum - origin) / delta;
  const entryT = Math.max(interval.entryT, Math.min(first, second));
  const exitT = Math.min(interval.exitT, Math.max(first, second));
  if (exitT - entryT <= GEOMETRY_EPSILON) return null;
  return { entryT, exitT };
}

function intersectCircularCanopy(start, delta, volume) {
  const localX = start[0] - volume.center[0];
  const localY = start[1] - volume.center[1];
  const localZ = start[2] - volume.center[2];
  const horizontalA = delta[0] * delta[0] + delta[2] * delta[2];
  const radiusSquared = volume.radiusMeters * volume.radiusMeters;
  let interval = { entryT: 0, exitT: 1 };

  if (horizontalA <= GEOMETRY_EPSILON) {
    const radialSquared = localX * localX + localZ * localZ;
    const margin = interiorMargin(radiusSquared);
    if (radialSquared >= radiusSquared - margin) return null;
  } else {
    const horizontalB = 2 * (localX * delta[0] + localZ * delta[2]);
    const horizontalC = localX * localX + localZ * localZ - radiusSquared;
    const discriminant =
      horizontalB * horizontalB - 4 * horizontalA * horizontalC;
    const discriminantTolerance = GEOMETRY_EPSILON * Math.max(
      1,
      horizontalB * horizontalB,
      Math.abs(4 * horizontalA * horizontalC)
    );
    if (discriminant <= discriminantTolerance) return null;
    const root = Math.sqrt(discriminant);
    const first = (-horizontalB - root) / (2 * horizontalA);
    const second = (-horizontalB + root) / (2 * horizontalA);
    interval = {
      entryT: Math.max(0, Math.min(first, second)),
      exitT: Math.min(1, Math.max(first, second))
    };
    if (interval.exitT - interval.entryT <= GEOMETRY_EPSILON) return null;
  }

  return clipSlab(
    interval,
    localY,
    delta[1],
    -volume.halfHeightMeters,
    volume.halfHeightMeters
  );
}

function intersectOrientedCanopy(start, delta, volume) {
  const dx = start[0] - volume.center[0];
  const dy = start[1] - volume.center[1];
  const dz = start[2] - volume.center[2];
  const cosine = Math.cos(volume.rotationYRadians);
  const sine = Math.sin(volume.rotationYRadians);
  const localStart = [
    cosine * dx - sine * dz,
    dy,
    sine * dx + cosine * dz
  ];
  const localDelta = [
    cosine * delta[0] - sine * delta[2],
    delta[1],
    sine * delta[0] + cosine * delta[2]
  ];
  let interval = { entryT: 0, exitT: 1 };
  for (let axis = 0; axis < 3; axis++) {
    const halfExtent = volume.halfExtentsMeters[axis];
    interval = clipSlab(
      interval,
      localStart[axis],
      localDelta[axis],
      -halfExtent,
      halfExtent
    );
    if (!interval) return null;
  }
  return interval;
}

function intersectionRole(observerInside, targetInside) {
  if (observerInside && targetInside) {
    return FOLIAGE_CONCEALMENT_ROLE.OBSERVER_AND_TARGET;
  }
  if (observerInside) return FOLIAGE_CONCEALMENT_ROLE.OBSERVER;
  if (targetInside) return FOLIAGE_CONCEALMENT_ROLE.TARGET;
  return FOLIAGE_CONCEALMENT_ROLE.INTERVENING;
}

function combinedDensity(volumes) {
  let transparentFraction = 1;
  for (const volume of [...volumes].sort((left, right) =>
    compareStableIds(left.id, right.id))) {
    transparentFraction *= 1 - volume.density;
  }
  return Math.max(0, Math.min(1, 1 - transparentFraction));
}

function intervalCoverage(intersections) {
  if (intersections.length === 0) {
    return {
      unionPathLengthMeters: 0,
      densityWeightedPathMeters: 0
    };
  }
  const boundaries = intersections
    .flatMap(intersection => [intersection.entryT, intersection.exitT])
    .sort((left, right) => left - right);
  const distinct = [];
  for (const boundary of boundaries) {
    if (distinct.length === 0
        || Math.abs(boundary - distinct[distinct.length - 1])
          > GEOMETRY_EPSILON) {
      distinct.push(boundary);
    }
  }

  let unionPathLengthMeters = 0;
  let densityWeightedPathMeters = 0;
  for (let index = 1; index < distinct.length; index++) {
    const entryT = distinct[index - 1];
    const exitT = distinct[index];
    if (exitT - entryT <= GEOMETRY_EPSILON) continue;
    const midpoint = (entryT + exitT) * 0.5;
    const active = intersections
      .filter(intersection =>
        intersection.entryT < midpoint && intersection.exitT > midpoint)
      .sort((left, right) =>
        compareStableIds(left.volumeId, right.volumeId));
    if (active.length === 0) continue;
    const pathLengthMeters =
      (exitT - entryT) * intersections[0].segmentLengthMeters;
    unionPathLengthMeters += pathLengthMeters;
    let transparentFraction = 1;
    for (const intersection of active) {
      transparentFraction *= 1 - intersection.density;
    }
    densityWeightedPathMeters +=
      pathLengthMeters * (1 - transparentFraction);
  }
  return { unionPathLengthMeters, densityWeightedPathMeters };
}

function compareIntersections(left, right) {
  if (Math.abs(left.entryDistanceMeters - right.entryDistanceMeters)
      > GEOMETRY_EPSILON) {
    return left.entryDistanceMeters - right.entryDistanceMeters;
  }
  if (Math.abs(left.exitDistanceMeters - right.exitDistanceMeters)
      > GEOMETRY_EPSILON) {
    return left.exitDistanceMeters - right.exitDistanceMeters;
  }
  return compareStableIds(left.volumeId, right.volumeId);
}

/**
 * Measures one three-dimensional observer-to-target sight segment.
 *
 * The returned intersections are ordered by entry distance and stable ID.
 * Overlapping path summaries combine density without double-counting physical
 * distance. No result is authoritative hard occlusion.
 */
export function measureFoliageSightSegment({
  observerPosition,
  targetPosition,
  volumes = []
}) {
  const observer = positionTuple(observerPosition, 'observerPosition');
  const target = positionTuple(targetPosition, 'targetPosition');
  const normalizedVolumes = normalizeVolumes(volumes);
  const delta = [
    target[0] - observer[0],
    target[1] - observer[1],
    target[2] - observer[2]
  ];
  const segmentLengthMeters = Math.hypot(...delta);
  const observerVolumes = normalizedVolumes.filter(volume =>
    strictlyInsideVolume(observer, volume));
  const targetVolumes = normalizedVolumes.filter(volume =>
    strictlyInsideVolume(target, volume));
  const observerIds = new Set(observerVolumes.map(volume => volume.id));
  const targetIds = new Set(targetVolumes.map(volume => volume.id));
  const intersections = [];

  if (segmentLengthMeters > GEOMETRY_EPSILON) {
    for (const volume of normalizedVolumes) {
      const interval =
        volume.shape === FOLIAGE_CONCEALMENT_SHAPE.CIRCULAR_CANOPY
          ? intersectCircularCanopy(observer, delta, volume)
          : intersectOrientedCanopy(observer, delta, volume);
      if (!interval) continue;
      const entryT = Math.max(0, Math.min(1, interval.entryT));
      const exitT = Math.max(0, Math.min(1, interval.exitT));
      const pathLengthMeters = (exitT - entryT) * segmentLengthMeters;
      if (pathLengthMeters <= GEOMETRY_EPSILON) continue;
      const observerInside = observerIds.has(volume.id);
      const targetInside = targetIds.has(volume.id);
      intersections.push({
        volumeId: volume.id,
        shape: volume.shape,
        entryT,
        exitT,
        entryDistanceMeters: entryT * segmentLengthMeters,
        exitDistanceMeters: exitT * segmentLengthMeters,
        pathLengthMeters,
        density: volume.density,
        densityWeightedPathMeters: pathLengthMeters * volume.density,
        observerInside,
        targetInside,
        role: intersectionRole(observerInside, targetInside),
        segmentLengthMeters,
        densityDataQuality: volume.densityDataQuality,
        geometryDataQuality: volume.geometryDataQuality
      });
    }
  }
  intersections.sort(compareIntersections);

  const allCoverage = intervalCoverage(intersections);
  const interveningIntersections = intersections.filter(intersection =>
    intersection.role === FOLIAGE_CONCEALMENT_ROLE.INTERVENING);
  const interveningCoverage = intervalCoverage(interveningIntersections);

  return {
    approximationLabel: FOLIAGE_CONCEALMENT_APPROXIMATION,
    blocksLineOfSight: false,
    segmentLengthMeters,
    intersections,
    observer: {
      insideVolumeIds: observerVolumes.map(volume => volume.id),
      combinedDensity: combinedDensity(observerVolumes)
    },
    target: {
      insideVolumeIds: targetVolumes.map(volume => volume.id),
      combinedDensity: combinedDensity(targetVolumes)
    },
    intervening: {
      volumeIds: interveningIntersections.map(intersection =>
        intersection.volumeId),
      ...interveningCoverage
    },
    total: {
      summedPathLengthMeters: intersections.reduce(
        (sum, intersection) => sum + intersection.pathLengthMeters,
        0
      ),
      ...allCoverage
    }
  };
}

function bounded(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function requireMeasurementFactor(value, field) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${field} must be finite and between zero and one`);
  }
  return value;
}

/**
 * Projects measured exposure into bounded observation modifiers. These
 * modifiers are derived per query and need no capture/restore state.
 */
export function deriveFoliageObservationFactors(measurement) {
  requireRecord(measurement, 'foliage concealment measurement');
  const observerExposure = requireMeasurementFactor(
    measurement.observer?.combinedDensity,
    'foliage concealment measurement observer density'
  );
  const targetExposure = requireMeasurementFactor(
    measurement.target?.combinedDensity,
    'foliage concealment measurement target density'
  );
  const interveningPath =
    measurement.intervening?.densityWeightedPathMeters;
  if (!Number.isFinite(interveningPath) || interveningPath < 0) {
    throw new TypeError(
      'foliage concealment measurement intervening path must be finite and non-negative'
    );
  }
  const referencePath =
    FOLIAGE_CONCEALMENT_POLICY.interveningExposure
      .referenceWeightedPathMeters;
  const interveningExposure = interveningPath <= 0
    ? 0
    : interveningPath / (referencePath + interveningPath);

  const range = FOLIAGE_CONCEALMENT_POLICY.maximumObservationRange;
  const acquisition = FOLIAGE_CONCEALMENT_POLICY.acquisitionTime;
  const identification = FOLIAGE_CONCEALMENT_POLICY.identificationProgress;
  const visibility = FOLIAGE_CONCEALMENT_POLICY.visibilityQuality;
  const maximumObservationRangeFactor = bounded(
    1 - observerExposure * range.observerPenalty
      - targetExposure * range.targetPenalty
      - interveningExposure * range.interveningPenalty,
    range.minimumFactor,
    1
  );
  const acquisitionTimeFactor = bounded(
    1 + observerExposure * acquisition.observerPenalty
      + targetExposure * acquisition.targetPenalty
      + interveningExposure * acquisition.interveningPenalty,
    1,
    acquisition.maximumFactor
  );
  const identificationProgressFactor = bounded(
    1 - observerExposure * identification.observerPenalty
      - targetExposure * identification.targetPenalty
      - interveningExposure * identification.interveningPenalty,
    identification.minimumFactor,
    1
  );
  const visibilityQualityFactor = bounded(
    1 - observerExposure * visibility.observerPenalty
      - targetExposure * visibility.targetPenalty
      - interveningExposure * visibility.interveningPenalty,
    visibility.minimumFactor,
    1
  );

  return {
    approximationLabel: FOLIAGE_CONCEALMENT_APPROXIMATION,
    blocksLineOfSight: false,
    observerExposure,
    targetExposure,
    interveningExposure,
    maximumObservationRangeFactor,
    acquisitionTimeFactor,
    identificationProgressFactor,
    visibilityQualityFactor
  };
}

/**
 * Convenience entry point for SpottingSystem or another observation adapter.
 */
export function evaluateFoliageConcealment(input) {
  const measurement = measureFoliageSightSegment(input);
  return {
    ...measurement,
    factors: deriveFoliageObservationFactors(measurement)
  };
}
