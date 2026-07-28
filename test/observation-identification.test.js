import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTIFICATION_QUALITY_APPROXIMATION,
  IDENTIFICATION_QUALITY_POLICY,
  IDENTIFICATION_TIER,
  beginVisualIdentification,
  decayIdentification,
  deriveIdentificationTier,
  identificationProjection,
  progressIdentification,
  validateIdentificationProjection
} from '../src/simulation/observation/IdentificationQuality.js';
import {
  CONTACT_CHANNEL,
  createContact,
  decayContact,
  preferContact,
  publicContact
} from '../src/simulation/observation/ContactState.js';
import {
  COMMUNICATION_RELAY_DELAY_APPROXIMATION,
  CommunicationRelayQueue
} from '../src/simulation/observation/CommunicationRelayQueue.js';

function partitionedTransition(transition, initial, seconds, frequency) {
  let progress = initial;
  let previousTime = 0;
  const steps = Math.ceil(seconds * frequency);
  for (let index = 1; index <= steps; index++) {
    const nextTime = Math.min(
      seconds,
      Math.round(
        Math.min(seconds, index / frequency) * 1e9
      ) / 1e9
    );
    progress = transition(progress, nextTime - previousTime);
    previousTime = nextTime;
  }
  return progress;
}

function relayReport(overrides = {}) {
  return {
    senderUnitId: 'sender',
    receiverUnitId: 'receiver',
    targetUnitId: 'target',
    sourceSoldierId: 'observer',
    targetSoldierId: null,
    episodeSequence: 1,
    channel: CONTACT_CHANNEL.VOICE,
    confidence: 1,
    identificationProgress:
      IDENTIFICATION_QUALITY_POLICY.acquiredVisualProgress,
    acquiredAt: 2,
    delaySeconds: 1.5,
    dueAt: 3.5,
    position: [4, 0, 8],
    approximationLabel: COMMUNICATION_RELAY_DELAY_APPROXIMATION,
    ...overrides
  };
}

test('identification policy is frozen, bounded, tiered, and explicitly approximate', () => {
  assert.equal(Object.isFrozen(IDENTIFICATION_TIER), true);
  assert.equal(Object.isFrozen(IDENTIFICATION_QUALITY_POLICY), true);
  assert.equal(Object.isFrozen(IDENTIFICATION_QUALITY_POLICY.tiers), true);
  assert.ok(
    IDENTIFICATION_QUALITY_POLICY.tiers.every(Object.isFrozen)
  );
  assert.deepEqual(
    IDENTIFICATION_QUALITY_POLICY.tiers.map(tier => tier.id),
    [
      IDENTIFICATION_TIER.UNIDENTIFIED,
      IDENTIFICATION_TIER.VISUAL_CONTACT,
      IDENTIFICATION_TIER.DEVELOPING,
      IDENTIFICATION_TIER.CONFIRMED
    ]
  );
  assert.equal(deriveIdentificationTier(0), IDENTIFICATION_TIER.UNIDENTIFIED);
  assert.equal(
    deriveIdentificationTier(
      IDENTIFICATION_QUALITY_POLICY.tiers[1].minimumProgress
    ),
    IDENTIFICATION_TIER.VISUAL_CONTACT
  );
  assert.equal(
    deriveIdentificationTier(
      IDENTIFICATION_QUALITY_POLICY.tiers[2].minimumProgress
    ),
    IDENTIFICATION_TIER.DEVELOPING
  );
  assert.equal(
    deriveIdentificationTier(
      IDENTIFICATION_QUALITY_POLICY.tiers[3].minimumProgress
    ),
    IDENTIFICATION_TIER.CONFIRMED
  );

  const acquired = beginVisualIdentification(0);
  assert.equal(
    acquired,
    IDENTIFICATION_QUALITY_POLICY.acquiredVisualProgress
  );
  assert.equal(
    deriveIdentificationTier(acquired),
    IDENTIFICATION_TIER.VISUAL_CONTACT
  );
  assert.equal(
    deriveIdentificationTier(progressIdentification(acquired, 0.999999999)),
    IDENTIFICATION_TIER.VISUAL_CONTACT
  );
  assert.equal(
    deriveIdentificationTier(progressIdentification(acquired, 1)),
    IDENTIFICATION_TIER.DEVELOPING
  );
  assert.equal(
    deriveIdentificationTier(progressIdentification(acquired, 2.199999999)),
    IDENTIFICATION_TIER.DEVELOPING
  );
  assert.equal(
    deriveIdentificationTier(progressIdentification(acquired, 2.2)),
    IDENTIFICATION_TIER.CONFIRMED
  );
  assert.equal(
    progressIdentification(acquired, 100),
    IDENTIFICATION_QUALITY_POLICY.maximumProgress
  );
  assert.equal(
    decayIdentification(acquired, 100),
    IDENTIFICATION_QUALITY_POLICY.minimumProgress
  );
  assert.deepEqual(identificationProjection(acquired), {
    identificationProgress: acquired,
    identificationTier: IDENTIFICATION_TIER.VISUAL_CONTACT,
    identificationApproximationLabel:
      IDENTIFICATION_QUALITY_APPROXIMATION
  });

  for (const invalid of [Number.NaN, Infinity, -0.001, 1.001]) {
    assert.throws(
      () => deriveIdentificationTier(invalid),
      /identificationProgress/
    );
  }
  assert.throws(
    () => progressIdentification(acquired, -0.1),
    /finite and non-negative/
  );
  assert.throws(
    () => decayIdentification(acquired, Infinity),
    /finite and non-negative/
  );
  assert.throws(
    () => validateIdentificationProjection({
      ...identificationProjection(acquired),
      identificationTier: IDENTIFICATION_TIER.CONFIRMED
    }),
    /must match identificationProgress/
  );
});

test('integer fixed-point policy transitions are byte-identical at 30 Hz, 60 Hz, and whole-step boundaries', () => {
  const acquired = beginVisualIdentification(0);
  const progressSeconds = 2.123456789;
  const wholeProgress = progressIdentification(acquired, progressSeconds);
  assert.equal(
    partitionedTransition(
      progressIdentification,
      acquired,
      progressSeconds,
      30
    ),
    wholeProgress
  );
  assert.equal(
    partitionedTransition(
      progressIdentification,
      acquired,
      progressSeconds,
      60
    ),
    wholeProgress
  );
  assert.equal(
    deriveIdentificationTier(wholeProgress),
    IDENTIFICATION_TIER.DEVELOPING
  );

  const decaySeconds = 7.987654321;
  const wholeDecay = decayIdentification(wholeProgress, decaySeconds);
  assert.equal(
    partitionedTransition(
      decayIdentification,
      wholeProgress,
      decaySeconds,
      30
    ),
    wholeDecay
  );
  assert.equal(
    partitionedTransition(
      decayIdentification,
      wholeProgress,
      decaySeconds,
      60
    ),
    wholeDecay
  );
});

test('contacts derive public tiers, decay without moving, and use quality only after existing precedence', () => {
  const common = {
    targetUnitId: 'target',
    position: [3, 0, 7],
    observedAt: 5,
    updatedAt: 5,
    sourceUnitId: 'observer',
    sourceSoldierId: 'one',
    confidence: 0.8,
    uncertaintyM: 2
  };
  const unidentified = createContact({
    ...common,
    channel: CONTACT_CHANNEL.SOUND
  });
  assert.equal(unidentified.identificationProgress, 0);
  assert.equal(
    publicContact(unidentified).identificationTier,
    IDENTIFICATION_TIER.UNIDENTIFIED
  );

  const visual = createContact({
    ...common,
    channel: CONTACT_CHANNEL.VOICE,
    identificationProgress: beginVisualIdentification(0)
  });
  const stronger = createContact({
    ...visual,
    identificationProgress: progressIdentification(
      visual.identificationProgress,
      2
    )
  });
  assert.equal(
    preferContact(visual, stronger).identificationProgress,
    stronger.identificationProgress
  );

  const higherChannel = createContact({
    ...unidentified,
    channel: CONTACT_CHANNEL.DIRECT,
    confidence: 0.1
  });
  assert.equal(
    preferContact(stronger, higherChannel).channel,
    CONTACT_CHANNEL.DIRECT,
    'channel precedence must remain ahead of identification'
  );
  const higherConfidence = createContact({
    ...visual,
    confidence: 0.81,
    identificationProgress: 0
  });
  assert.equal(
    preferContact(stronger, higherConfidence).confidence,
    0.81,
    'confidence precedence must remain ahead of identification'
  );
  const zeroQuality = createContact({
    ...visual,
    identificationProgress: 0,
    sourceEventId: 'same'
  });
  const oneTickQuality = createContact({
    ...zeroQuality,
    identificationProgress: 1e-12
  });
  assert.equal(
    preferContact(zeroQuality, oneTickQuality).identificationProgress,
    1e-12
  );
  assert.equal(
    preferContact(oneTickQuality, zeroQuality).identificationProgress,
    1e-12,
    'one canonical progress tick must win in either argument order'
  );

  const decayed = decayContact(stronger, 9);
  assert.deepEqual(decayed.position, stronger.position);
  assert.ok(
    decayed.identificationProgress < stronger.identificationProgress
  );
  const projected = publicContact(decayed);
  assert.equal(
    projected.identificationTier,
    deriveIdentificationTier(projected.identificationProgress)
  );
  assert.equal(
    projected.identificationApproximationLabel,
    IDENTIFICATION_QUALITY_APPROXIMATION
  );
  assert.equal(
    Object.hasOwn(projected, 'identificationEvaluatedAt'),
    false
  );
  projected.position[0] = 999;
  assert.equal(decayed.position[0], 3);
});

test('relay queue freezes identification, deep-copies snapshots, migrates v1, and rejects malformed v2', () => {
  const queue = new CommunicationRelayQueue();
  const input = relayReport();
  assert.equal(queue.enqueue(input), true);
  input.identificationProgress = 1;
  input.position[0] = 999;

  const captured = queue.captureState();
  assert.equal(captured.version, 2);
  assert.equal(
    captured.pendingReports[0].identificationProgress,
    IDENTIFICATION_QUALITY_POLICY.acquiredVisualProgress
  );
  assert.equal(
    captured.pendingReports[0].identificationTier,
    IDENTIFICATION_TIER.VISUAL_CONTACT
  );
  assert.deepEqual(captured.pendingReports[0].position, [4, 0, 8]);
  captured.pendingReports[0].position[0] = 777;
  assert.deepEqual(queue.pendingReports()[0].position, [4, 0, 8]);

  const legacy = {
    version: 1,
    pendingReports: [{
      ...relayReport(),
      identificationProgress: undefined
    }],
    deliveredEpisodeWatermarks: []
  };
  delete legacy.pendingReports[0].identificationProgress;
  const migrated = new CommunicationRelayQueue();
  migrated.restoreState(legacy);
  const migratedCapture = migrated.captureState();
  assert.equal(migratedCapture.version, 2);
  assert.equal(migratedCapture.pendingReports[0].identificationProgress, 0);
  assert.equal(
    migratedCapture.pendingReports[0].identificationTier,
    IDENTIFICATION_TIER.UNIDENTIFIED
  );

  for (const invalidProgress of [Number.NaN, Infinity, -0.1, 1.1]) {
    const invalid = queue.captureState();
    invalid.pendingReports[0].identificationProgress = invalidProgress;
    assert.throws(
      () => new CommunicationRelayQueue().restoreState(invalid),
      /identificationProgress/
    );
  }
  const inconsistent = queue.captureState();
  inconsistent.pendingReports[0].identificationTier =
    IDENTIFICATION_TIER.CONFIRMED;
  assert.throws(
    () => new CommunicationRelayQueue().restoreState(inconsistent),
    /identificationTier/
  );
  const overlappingV2 = queue.captureState();
  overlappingV2.deliveredEpisodeWatermarks.push({
    senderUnitId: overlappingV2.pendingReports[0].senderUnitId,
    receiverUnitId: overlappingV2.pendingReports[0].receiverUnitId,
    targetUnitId: overlappingV2.pendingReports[0].targetUnitId,
    channel: overlappingV2.pendingReports[0].channel,
    episodeSequence:
      overlappingV2.pendingReports[0].episodeSequence
  });
  assert.throws(
    () => new CommunicationRelayQueue().restoreState(overlappingV2),
    /same route and episode/
  );
  const overlappingV1 = structuredClone(overlappingV2);
  overlappingV1.version = 1;
  delete overlappingV1.pendingReports[0].identificationProgress;
  delete overlappingV1.pendingReports[0].identificationTier;
  delete overlappingV1.pendingReports[0]
    .identificationApproximationLabel;
  const migratedOverlap = new CommunicationRelayQueue();
  migratedOverlap.restoreState(overlappingV1);
  assert.equal(
    migratedOverlap.captureState().pendingReports.length,
    0,
    'version 1 retains the legacy stale-pending migration'
  );
  assert.throws(
    () => new CommunicationRelayQueue().restoreState({ version: 3 }),
    /unsupported communication relay queue version 3/
  );
});
