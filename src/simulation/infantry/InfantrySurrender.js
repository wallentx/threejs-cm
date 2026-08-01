export const INFANTRY_SURRENDER_APPROXIMATION =
  'first-order conservative individual surrender under recognized nearby threat';

export const INFANTRY_SURRENDER_POLICY = Object.freeze({
  approximationLabel: INFANTRY_SURRENDER_APPROXIMATION,
  suppressionThreshold: 82,
  casualtyRatioThreshold: 0.5,
  maximumThreatDistanceMeters: 30
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

function inactive(reason, threatId = null, threatDistanceMeters = null) {
  return Object.freeze({
    approximationLabel: INFANTRY_SURRENDER_APPROXIMATION,
    active: false,
    reason,
    threatId,
    threatDistanceMeters
  });
}

export function evaluateInfantrySurrender(input = {}) {
  stableId(input.soldierId, 'surrender soldierId');
  if (input.alreadySurrendered === true) {
    let retainedThreatId = null;
    try {
      retainedThreatId = stableId(
        input.retainedThreatId,
        'retained surrender threatId'
      );
    } catch {
      // Legacy saves may predate trigger provenance. Retain accepted state;
      // never manufacture new threat evidence during migration.
    }
    return Object.freeze({
      approximationLabel: INFANTRY_SURRENDER_APPROXIMATION,
      active: true,
      reason: 'retained-surrender',
      threatId: retainedThreatId,
      threatDistanceMeters: null
    });
  }
  if (input.living !== true) return inactive('casualty');
  if (input.routed === true) return inactive('routed');
  if (input.buildingTransit === true) return inactive('building-transit');
  if (input.escaping === true) return inactive('escaping');

  const suppression = Number(input.suppression ?? 0);
  const casualtyRatio = Number(input.casualtyRatio ?? 0);
  if (!Number.isFinite(suppression)
      || suppression < 0
      || suppression > 100
      || !Number.isFinite(casualtyRatio)
      || casualtyRatio < 0
      || casualtyRatio > 1) {
    throw new TypeError(
      'surrender suppression and casualty ratio must be finite and bounded'
    );
  }
  if (suppression < INFANTRY_SURRENDER_POLICY.suppressionThreshold) {
    return inactive('suppression-below-threshold');
  }
  if (casualtyRatio < INFANTRY_SURRENDER_POLICY.casualtyRatioThreshold
      || input.leaderNearby === true) {
    return inactive('not-hopelessly-isolated');
  }

  let threatId;
  let threatPosition;
  try {
    threatId = stableId(input.threat?.id, 'surrender threat id');
    threatPosition = position2(input.threat?.position, 'surrender threat position');
  } catch {
    return inactive('no-recognized-threat');
  }
  const position = position2(input.position, 'surrender soldier position');
  const distance = Math.hypot(
    threatPosition[0] - position[0],
    threatPosition[1] - position[1]
  );
  const roundedDistance = Number(distance.toFixed(6));
  if (distance > INFANTRY_SURRENDER_POLICY.maximumThreatDistanceMeters) {
    return inactive('recognized-threat-too-far', threatId, roundedDistance);
  }
  if (input.escapeAssessmentKnown !== true) {
    return inactive('escape-unknown', threatId, roundedDistance);
  }
  if (input.escapeAvailable === true) {
    return inactive('escape-available', threatId, roundedDistance);
  }

  return Object.freeze({
    approximationLabel: INFANTRY_SURRENDER_APPROXIMATION,
    active: true,
    reason: 'hopeless-isolation-under-nearby-threat',
    threatId,
    threatDistanceMeters: roundedDistance
  });
}
