const DEFAULT_GRAVITY = 9.80665;
const DEFAULT_CIRCLE_SEGMENTS = 32;
const EPSILON = 1e-9;

function finitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a finite positive number`);
  }
  return value;
}

function normalizeSupport(support, fallbackId) {
  if (!support || typeof support !== 'object') {
    throw new TypeError(`track support ${fallbackId} must be an object`);
  }
  const id = typeof support.id === 'string' && support.id
    ? support.id
    : fallbackId;
  if (!Number.isFinite(support.centerY) || !Number.isFinite(support.centerZ)) {
    throw new TypeError(`track support ${id} requires finite centerY and centerZ`);
  }
  const radius = finitePositive(support.radius, `track support ${id} radius`);
  const pathRadius = support.pathRadius == null
    ? radius
    : finitePositive(support.pathRadius, `track support ${id} pathRadius`);
  return Object.freeze({
    id,
    kind: support.kind ?? 'wheel',
    centerY: support.centerY,
    centerZ: support.centerZ,
    radius,
    pathRadius
  });
}

function cross(origin, a, b) {
  return (
    (a.z - origin.z) * (b.y - origin.y)
    - (a.y - origin.y) * (b.z - origin.z)
  );
}

function convexHull(points) {
  const sorted = [...points].sort((left, right) => (
    left.z - right.z
    || left.y - right.y
    || left.supportId.localeCompare(right.supportId)
  ));
  const lower = [];
  for (const point of sorted) {
    while (
      lower.length >= 2
      && cross(lower.at(-2), lower.at(-1), point) <= EPSILON
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index];
    while (
      upper.length >= 2
      && cross(upper.at(-2), upper.at(-1), point) <= EPSILON
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function signedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.z * next.y - next.z * current.y;
  }
  return area * 0.5;
}

function distance(left, right) {
  return Math.hypot(right.y - left.y, right.z - left.z);
}

function addGravitySag(points, {
  gravityMetersPerSecondSquared,
  linearMassKgPerMeter,
  tensionNewtons,
  maximumSegmentMeters,
  verticalMidpoint
}) {
  const result = [];
  const weightPerMeter = linearMassKgPerMeter * gravityMetersPerSecondSquared;
  for (let index = 0; index < points.length; index++) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const length = distance(start, end);
    const segments = Math.max(1, Math.ceil(length / maximumSegmentMeters));
    const upperFreeSpan = (
      start.supportId !== end.supportId
      && start.y >= verticalMidpoint
      && end.y >= verticalMidpoint
    );
    for (let segment = 0; segment < segments; segment++) {
      const t = segment / segments;
      const spanPosition = length * t;
      const sag = upperFreeSpan
        ? (
            weightPerMeter
            * spanPosition
            * (length - spanPosition)
            / (2 * tensionNewtons)
          )
        : 0;
      result.push({
        y: start.y + (end.y - start.y) * t - sag,
        z: start.z + (end.z - start.z) * t,
        supportId: t === 0 ? start.supportId : null,
        span: upperFreeSpan ? `${start.supportId}:${end.supportId}` : null,
        sagMeters: sag
      });
    }
  }
  return result;
}

function pathBounds(points) {
  const bounds = {
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };
  for (const point of points) {
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxY = Math.max(bounds.maxY, point.y);
    bounds.minZ = Math.min(bounds.minZ, point.z);
    bounds.maxZ = Math.max(bounds.maxZ, point.z);
  }
  return Object.freeze(bounds);
}

/**
 * Produces a deterministic quasi-static track centreline from the convex outer
 * support envelope of sprocket, idler, road wheels, and return rollers.
 *
 * Wheel radii are expanded by half the physical link thickness. Unsupported
 * upper spans use the small-deflection chain equation q*x*(L-x)/(2*T), where
 * q is track weight per metre and T is horizontal tension. This is a renderer
 * geometry model, not authoritative suspension or rigid-body simulation.
 */
export function solveSupportedTrackPath({
  driveSprocket,
  idlerWheel,
  roadWheels,
  returnRollers = [],
  linkThickness,
  cleatHeight = 0,
  linearMassKgPerMeter,
  tensionNewtons,
  gravityMetersPerSecondSquared = DEFAULT_GRAVITY,
  circleSegments = DEFAULT_CIRCLE_SEGMENTS,
  maximumSegmentMeters = 0.08
}) {
  finitePositive(linkThickness, 'track linkThickness');
  if (!Number.isFinite(cleatHeight) || cleatHeight < 0) {
    throw new TypeError('track cleatHeight must be a finite non-negative number');
  }
  finitePositive(linearMassKgPerMeter, 'track linearMassKgPerMeter');
  finitePositive(tensionNewtons, 'track tensionNewtons');
  finitePositive(
    gravityMetersPerSecondSquared,
    'track gravityMetersPerSecondSquared'
  );
  finitePositive(maximumSegmentMeters, 'track maximumSegmentMeters');
  if (!Number.isInteger(circleSegments) || circleSegments < 12) {
    throw new TypeError('track circleSegments must be an integer >= 12');
  }
  if (!Array.isArray(roadWheels) || roadWheels.length === 0) {
    throw new TypeError('supported track path requires road wheels');
  }
  if (!Array.isArray(returnRollers)) {
    throw new TypeError('supported track path returnRollers must be an array');
  }

  const supports = [
    normalizeSupport(driveSprocket, 'drive-sprocket'),
    normalizeSupport(idlerWheel, 'idler-wheel'),
    ...roadWheels.map((wheel, index) => normalizeSupport(
      wheel,
      `road-wheel-${index + 1}`
    )),
    ...returnRollers.map((roller, index) => normalizeSupport(
      roller,
      `return-roller-${index + 1}`
    ))
  ];
  const duplicate = supports.find((support, index) => (
    supports.findIndex(candidate => candidate.id === support.id) !== index
  ));
  if (duplicate) {
    throw new Error(`duplicate track support id ${duplicate.id}`);
  }

  const radiusOffset = linkThickness * 0.5;
  const samples = [];
  for (const support of supports) {
    const pathRadius = support.pathRadius + radiusOffset;
    for (let index = 0; index < circleSegments; index++) {
      const angle = (index / circleSegments) * Math.PI * 2;
      samples.push({
        y: support.centerY + Math.sin(angle) * pathRadius,
        z: support.centerZ + Math.cos(angle) * pathRadius,
        supportId: support.id
      });
    }
  }

  let hull = convexHull(samples);
  if (hull.length < 3) {
    throw new Error('track supports did not produce a closed outer path');
  }
  if (signedArea(hull) < 0) hull = hull.reverse();
  const tautBounds = pathBounds(hull);
  const points = addGravitySag(hull, {
    gravityMetersPerSecondSquared,
    linearMassKgPerMeter,
    tensionNewtons,
    maximumSegmentMeters,
    verticalMidpoint: (tautBounds.minY + tautBounds.maxY) * 0.5
  });
  const bounds = pathBounds(points);
  const perimeterMeters = points.reduce((sum, point, index) => (
    sum + distance(point, points[(index + 1) % points.length])
  ), 0);
  const maximumSagMeters = points.reduce(
    (maximum, point) => Math.max(maximum, point.sagMeters),
    0
  );

  return Object.freeze({
    model: 'wheel-supported-quasi-static-v1',
    points: Object.freeze(points.map(point => Object.freeze({ ...point }))),
    supports: Object.freeze(supports),
    bounds,
    perimeterMeters,
    maximumSagMeters,
    inputs: Object.freeze({
      linkThickness,
      cleatHeight,
      linearMassKgPerMeter,
      tensionNewtons,
      gravityMetersPerSecondSquared,
      circleSegments,
      maximumSegmentMeters
    })
  });
}

export function sampleClosedTrackPath(path, requestedPitchMeters) {
  if (!path?.points?.length) {
    throw new TypeError('closed track sampling requires path points');
  }
  finitePositive(requestedPitchMeters, 'track requestedPitchMeters');
  const perimeter = path.points.reduce((sum, point, index) => (
    sum + distance(point, path.points[(index + 1) % path.points.length])
  ), 0);
  const count = Math.max(18, Math.ceil(perimeter / requestedPitchMeters));
  const pitchMeters = perimeter / count;
  const samples = [];
  let segmentIndex = 0;
  let segmentStartDistance = 0;

  for (let index = 0; index < count; index++) {
    const targetDistance = index * pitchMeters;
    while (segmentIndex < path.points.length) {
      const start = path.points[segmentIndex];
      const end = path.points[(segmentIndex + 1) % path.points.length];
      const segmentLength = distance(start, end);
      if (targetDistance <= segmentStartDistance + segmentLength + EPSILON) {
        const t = segmentLength > EPSILON
          ? (targetDistance - segmentStartDistance) / segmentLength
          : 0;
        const tangentY = (end.y - start.y) / Math.max(segmentLength, EPSILON);
        const tangentZ = (end.z - start.z) / Math.max(segmentLength, EPSILON);
        samples.push(Object.freeze({
          distanceMeters: targetDistance,
          y: start.y + (end.y - start.y) * t,
          z: start.z + (end.z - start.z) * t,
          tangentY,
          tangentZ,
          outwardY: -tangentZ,
          outwardZ: tangentY
        }));
        break;
      }
      segmentStartDistance += segmentLength;
      segmentIndex += 1;
    }
  }

  return Object.freeze({
    count,
    pitchMeters,
    perimeterMeters: perimeter,
    samples: Object.freeze(samples)
  });
}
