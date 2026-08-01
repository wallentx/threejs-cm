import {
  decayIdentification,
  identificationProgressTicks,
  identificationProjection,
  normalizeIdentificationProgress
} from './IdentificationQuality.js';

export const CONTACT_CHANNEL = Object.freeze({
  DIRECT: 'DIRECT',
  VOICE: 'VOICE',
  RADIO: 'RADIO',
  SOUND: 'SOUND'
});

const CHANNEL_PRIORITY = Object.freeze({
  [CONTACT_CHANNEL.DIRECT]: 4,
  [CONTACT_CHANNEL.VOICE]: 3,
  [CONTACT_CHANNEL.RADIO]: 2,
  [CONTACT_CHANNEL.SOUND]: 1
});

export const NEGATIVE_OBSERVATION_APPROXIMATION =
  'first-order conservative stale-contact area sampling; uncertain regions may downgrade confidence but never prove complete continuous coverage';

export const NEGATIVE_OBSERVATION_POLICY = Object.freeze({
  approximationLabel: NEGATIVE_OBSERVATION_APPROXIMATION,
  exactPointRadiusMeters: 0.5,
  sampleSpacingMeters: 2,
  maximumSampleRadiusMeters: 20,
  maximumSamples: 192,
  downgradeFactor: 0.5
});

export function clonePosition(position) {
  if (!position) return null;
  if (Array.isArray(position)) return [
    Number(position[0]) || 0,
    Number(position[1]) || 0,
    Number(position[2]) || 0
  ];
  return [
    Number(position.x) || 0,
    Number(position.y) || 0,
    Number(position.z) || 0
  ];
}

export function createContact({
  targetUnitId,
  targetSoldierId = null,
  position,
  observedAt,
  updatedAt,
  sourceUnitId,
  sourceSoldierId,
  channel,
  confidence,
  uncertaintyM = 0,
  identificationProgress = 0,
  identificationEvaluatedAt = updatedAt,
  sourceEventId = null,
  reportKind = null,
  approximationLabel = null
}) {
  const boundedConfidence = Math.max(0, Math.min(1, confidence));
  const boundedUncertainty = Math.max(0, uncertaintyM);
  const contact = {
    targetUnitId,
    targetSoldierId,
    position: clonePosition(position),
    observedAt,
    updatedAt,
    sourceUnitId,
    sourceSoldierId,
    channel,
    confidence: boundedConfidence,
    uncertaintyM: boundedUncertainty,
    identificationProgress:
      normalizeIdentificationProgress(identificationProgress),
    identificationEvaluatedAt,
    baseConfidence: boundedConfidence,
    baseUncertaintyM: boundedUncertainty
  };
  if (sourceEventId !== null) contact.sourceEventId = sourceEventId;
  if (reportKind !== null) contact.reportKind = reportKind;
  if (approximationLabel !== null) contact.approximationLabel = approximationLabel;
  return contact;
}

export function cloneContact(contact) {
  if (!contact) return null;
  return {
    ...contact,
    position: clonePosition(contact.position)
  };
}

export function decayContact(contact, now, {
  lifetimeSeconds = 60,
  uncertaintyGrowthMps = 0.75
} = {}) {
  const age = Math.max(0, now - contact.updatedAt);
  const identificationAge = Math.max(
    0,
    now - (contact.identificationEvaluatedAt ?? contact.updatedAt)
  );
  const baseConfidence = contact.baseConfidence ?? contact.confidence;
  const baseUncertaintyM = contact.baseUncertaintyM ?? contact.uncertaintyM;
  return {
    ...cloneContact(contact),
    confidence: Math.max(0, baseConfidence * (1 - age / lifetimeSeconds)),
    uncertaintyM: baseUncertaintyM + age * uncertaintyGrowthMps,
    identificationProgress: decayIdentification(
      contact.identificationProgress ?? 0,
      identificationAge
    ),
    identificationEvaluatedAt: now
  };
}

function lexicalSource(contact) {
  return `${contact.sourceUnitId ?? ''}:${contact.sourceSoldierId ?? ''}`;
}

function lexicalEvent(contact) {
  return String(contact.sourceEventId ?? '');
}

export function preferContact(left, right) {
  if (!left) return cloneContact(right);
  if (!right) return cloneContact(left);
  if (right.observedAt !== left.observedAt) {
    return cloneContact(right.observedAt > left.observedAt ? right : left);
  }
  const rightPriority = CHANNEL_PRIORITY[right.channel] ?? 0;
  const leftPriority = CHANNEL_PRIORITY[left.channel] ?? 0;
  if (rightPriority !== leftPriority) {
    return cloneContact(rightPriority > leftPriority ? right : left);
  }
  if (Math.abs(right.confidence - left.confidence) > 1e-12) {
    return cloneContact(right.confidence > left.confidence ? right : left);
  }
  const rightIdentification = normalizeIdentificationProgress(
    right.identificationProgress ?? 0
  );
  const leftIdentification = normalizeIdentificationProgress(
    left.identificationProgress ?? 0
  );
  const rightIdentificationTicks =
    identificationProgressTicks(rightIdentification);
  const leftIdentificationTicks =
    identificationProgressTicks(leftIdentification);
  if (rightIdentificationTicks !== leftIdentificationTicks) {
    return cloneContact(
      rightIdentificationTicks > leftIdentificationTicks ? right : left
    );
  }
  if (lexicalEvent(right) !== lexicalEvent(left)) {
    return cloneContact(lexicalEvent(right) > lexicalEvent(left) ? right : left);
  }
  return cloneContact(lexicalSource(right) < lexicalSource(left) ? right : left);
}

export function publicContact(contact) {
  if (!contact) return null;
  const {
    baseConfidence: _baseConfidence,
    baseUncertaintyM: _baseUncertaintyM,
    identificationEvaluatedAt: _identificationEvaluatedAt,
    ...publicFields
  } = cloneContact(contact);
  return {
    ...publicFields,
    ...identificationProjection(publicFields.identificationProgress ?? 0)
  };
}

export function getContactUncertaintyRegionSamples(
  contact,
  policy = NEGATIVE_OBSERVATION_POLICY
) {
  if (!contact || !contact.position) {
    return {
      approximationLabel: policy.approximationLabel,
      samples: [],
      exactPoint: false,
      boundedRegion: false
    };
  }
  const [cx, cy, cz] = clonePosition(contact.position);
  const sourceRadius = Math.max(0, contact.uncertaintyM ?? 0);
  const radius = Math.min(
    sourceRadius,
    policy.maximumSampleRadiusMeters
  );
  if (radius < policy.exactPointRadiusMeters) {
    return {
      approximationLabel: policy.approximationLabel,
      samples: [[cx, cy, cz]],
      exactPoint: true,
      boundedRegion: true
    };
  }

  const samples = [[cx, cy, cz]];
  const ringCount = Math.max(
    1,
    Math.ceil(radius / policy.sampleSpacingMeters)
  );
  let boundedRegion = sourceRadius <= policy.maximumSampleRadiusMeters;
  for (let ringIndex = 1; ringIndex <= ringCount; ringIndex++) {
    const ringRadius = radius * ringIndex / ringCount;
    const requestedPoints = Math.max(
      4,
      Math.ceil(
        2 * Math.PI * ringRadius / policy.sampleSpacingMeters
      )
    );
    const available = policy.maximumSamples - samples.length;
    const pointCount = Math.min(requestedPoints, available);
    if (pointCount < requestedPoints) boundedRegion = false;
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
      const angle = 2 * Math.PI * pointIndex / requestedPoints;
      samples.push([
        cx + Math.sin(angle) * ringRadius,
        cy,
        cz + Math.cos(angle) * ringRadius
      ]);
    }
    if (samples.length >= policy.maximumSamples) break;
  }
  return {
    approximationLabel: policy.approximationLabel,
    samples,
    exactPoint: false,
    boundedRegion
  };
}

export function evaluateNegativeObservation(contact, {
  clearCoverageRatio = 0,
  completeCoverage = false,
  approximationLabel = NEGATIVE_OBSERVATION_APPROXIMATION,
  downgradeFactor = NEGATIVE_OBSERVATION_POLICY.downgradeFactor
} = {}) {
  if (!contact || clearCoverageRatio <= 0) {
    return cloneContact(contact);
  }
  if (approximationLabel !== NEGATIVE_OBSERVATION_APPROXIMATION) {
    throw new TypeError(
      'negative observation must retain its approximation label'
    );
  }
  const boundedRatio = Math.max(0, Math.min(1, clearCoverageRatio));
  if (completeCoverage && boundedRatio >= 1) {
    return {
      ...cloneContact(contact),
      confidence: 0,
      revokedByNegativeObservation: true,
      negativeObservationApproximation: approximationLabel
    };
  }
  const baseConfidence = contact.confidence;
  const newConfidence = Math.max(0, baseConfidence * (1 - boundedRatio * downgradeFactor));
  return {
    ...cloneContact(contact),
    confidence: newConfidence,
    downgradedByNegativeObservation: true,
    negativeObservationApproximation: approximationLabel
  };
}
