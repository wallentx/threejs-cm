export const INFANTRY_WITHDRAWAL_APPROXIMATION =
  'first-order individual infantry withdrawal from stable recognized threat evidence';

export const INFANTRY_WITHDRAWAL_POLICY = Object.freeze({
  approximationLabel: INFANTRY_WITHDRAWAL_APPROXIMATION,
  suppressionThreshold: 75,
  casualtyRatioThreshold: 0.33,
  fallbackDistanceMeters: 6,
  maximumCandidates: 16
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
  return Object.freeze([
    Object.is(x, -0) ? 0 : x,
    Object.is(z, -0) ? 0 : z
  ]);
}

function inactive(reason, threatId = null) {
  return Object.freeze({
    approximationLabel: INFANTRY_WITHDRAWAL_APPROXIMATION,
    active: false,
    reason,
    trigger: null,
    threatId,
    goalId: null,
    goalKind: null,
    goal: null,
    destination: null,
    backwardVector: null
  });
}

function precedenceReason(input) {
  if (input.available !== true) return 'unavailable';
  if (input.casualty === true) return 'casualty';
  if (input.surrendered === true) return 'surrendered';
  if (input.buildingTransit === true) return 'building-transit';
  if (input.explicitOrder === true) return 'explicit-order';
  if (input.buddyBound === true) return 'buddy-bound';
  return null;
}

function normalizedCandidate(candidate, index, soldierPosition, backward) {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError(`withdrawal candidate ${index} must be an object`);
  }
  const id = stableId(candidate.id, `withdrawal candidate ${index} id`);
  const goal = position2(candidate.goal, `withdrawal candidate ${index} goal`);
  const destination = position2(
    candidate.destination ?? candidate.goal,
    `withdrawal candidate ${index} destination`
  );
  const score = Number(candidate.score ?? 0);
  if (!Number.isFinite(score)) {
    throw new TypeError(`withdrawal candidate ${index} score must be finite`);
  }
  const travelX = destination[0] - soldierPosition[0];
  const travelZ = destination[1] - soldierPosition[1];
  return {
    id,
    kind: candidate.kind === 'cover' ? 'cover' : 'fallback',
    goal,
    destination,
    score,
    navigable: candidate.navigable === true,
    retreatsFromThreat:
      travelX * backward[0] + travelZ * backward[1] > 1e-6
  };
}

function candidateKey(candidate) {
  return `${typeof candidate.id}:${String(candidate.id)}`;
}

export function evaluateInfantryWithdrawal(input = {}) {
  stableId(input.soldierId, 'withdrawal soldierId');
  const blocked = precedenceReason(input);
  if (blocked) return inactive(blocked);

  const suppression = Number(input.suppression ?? 0);
  const casualtyRatio = Number(input.casualtyRatio ?? 0);
  if (!Number.isFinite(suppression)
      || suppression < 0
      || !Number.isFinite(casualtyRatio)
      || casualtyRatio < 0
      || casualtyRatio > 1) {
    throw new TypeError(
      'withdrawal suppression and casualty ratio must be finite and bounded'
    );
  }
  const trigger = suppression >= INFANTRY_WITHDRAWAL_POLICY.suppressionThreshold
    ? 'high-suppression'
    : casualtyRatio >= INFANTRY_WITHDRAWAL_POLICY.casualtyRatioThreshold
      && input.casualtyResponseActive === true
      ? 'casualty-loss'
      : null;
  if (!trigger) return inactive('pressure-below-threshold');

  let threatId;
  let threatPosition;
  try {
    threatId = stableId(input.threat?.id, 'withdrawal threat id');
    threatPosition = position2(
      input.threat?.position,
      'withdrawal threat position'
    );
  } catch {
    return inactive('no-recognized-threat');
  }
  const soldierPosition = position2(
    input.position,
    'withdrawal soldier position'
  );
  const awayX = soldierPosition[0] - threatPosition[0];
  const awayZ = soldierPosition[1] - threatPosition[1];
  const awayLength = Math.hypot(awayX, awayZ);
  if (awayLength <= 1e-6) {
    return inactive('coincident-threat', threatId);
  }
  const backward = Object.freeze([
    awayX / awayLength,
    awayZ / awayLength
  ]);

  if (!Array.isArray(input.candidates)
      || input.candidates.length > INFANTRY_WITHDRAWAL_POLICY.maximumCandidates) {
    throw new TypeError('withdrawal candidates must be a bounded array');
  }
  const candidates = input.candidates
    .map((candidate, index) =>
      normalizedCandidate(candidate, index, soldierPosition, backward))
    .filter(candidate => candidate.navigable && candidate.retreatsFromThreat)
    .sort((left, right) => {
      const kindDifference = (right.kind === 'cover' ? 1 : 0)
        - (left.kind === 'cover' ? 1 : 0);
      if (kindDifference !== 0) return kindDifference;
      if (left.score !== right.score) return right.score - left.score;
      return candidateKey(left).localeCompare(candidateKey(right));
    });
  const selected = candidates[0];
  if (!selected) return inactive('no-navigable-retreat', threatId);

  return Object.freeze({
    approximationLabel: INFANTRY_WITHDRAWAL_APPROXIMATION,
    active: true,
    reason: selected.kind === 'cover'
      ? 'withdrawal-cover'
      : 'withdrawal-route',
    trigger,
    threatId,
    goalId: selected.id,
    goalKind: selected.kind,
    goal: selected.goal,
    destination: selected.destination,
    backwardVector: backward
  });
}
