import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_INFANTRY_DANGER_MAP_POLICY,
  INFANTRY_DANGER_MAP_APPROXIMATION,
  INFANTRY_DANGER_SOURCE_KINDS,
  InfantryDangerMap,
  cloneInfantryDangerMapState,
  restoreInfantryDangerMap
} from '../src/simulation/infantry/InfantryDangerMap.js';

function source(overrides = {}) {
  return {
    sourceId: 'threat-a',
    kind: INFANTRY_DANGER_SOURCE_KINDS.OBSERVED_THREAT,
    position: [0, 0],
    radiusMeters: 10,
    intensity: 0.8,
    confidence: 0.5,
    lifetimeTicks: 10,
    ...overrides
  };
}

function assertNear(actual, expected, epsilon = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

test('overlapping evidence exposes separate factors and bounded combined danger', () => {
  const map = new InfantryDangerMap();
  const mutableThreatPosition = { x: 0, z: 0 };
  map.recordObservedThreat({
    ...source(),
    threatPosition: mutableThreatPosition
  });
  map.recordIncomingImpact({
    sourceId: 'impact-a',
    impactPosition: [2, 9, 0],
    radiusMeters: 8,
    intensity: 0.6,
    confidence: 1,
    lifetimeTicks: 5
  });
  mutableThreatPosition.x = 100;

  const result = map.queryPoint([0, 3, 0]);
  assert.equal(result.known, true);
  assert.deepEqual(
    result.contributions.map(item => item.sourceId),
    ['impact-a', 'threat-a']
  );
  assert.deepEqual(result.factors, {
    exposure: 1,
    recency: 1,
    intensity: 0.8,
    confidence: 1
  });
  assert.equal(result.contributions[0].exposure, 0.75);
  assertNear(result.contributions[0].danger, 0.45);
  assertNear(result.contributions[1].danger, 0.4);
  assert.ok(result.danger > 0.45);
  assert.ok(result.danger <= 1);
  assert.equal(result.approximationLabel, INFANTRY_DANGER_MAP_APPROXIMATION);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.contributions));
});

test('integer-tick decay expires exactly and unknown space is neutral', () => {
  const map = new InfantryDangerMap({ tickDurationSeconds: 0.5 });
  map.recordCasualty({
    sourceId: 'casualty-a',
    casualtyPosition: [0, 0],
    radiusMeters: 5,
    intensity: 0.5,
    confidence: 0.4,
    lifetimeTicks: 4
  });

  assertNear(map.queryPoint([0, 0]).danger, 0.2);
  map.advanceTicks(2);
  const decayed = map.queryPoint([0, 0]);
  assert.equal(decayed.contributions[0].recency, 0.5);
  assertNear(decayed.danger, 0.1);

  assert.deepEqual(map.queryPoint([6, 0]), {
    version: 1,
    approximationLabel: INFANTRY_DANGER_MAP_APPROXIMATION,
    clockTick: 2,
    position: [6, 0],
    known: false,
    factors: {
      exposure: 0,
      recency: 0,
      intensity: 0,
      confidence: 0
    },
    danger: 0,
    contributions: []
  });

  map.advanceTicks(2);
  assert.equal(map.size, 0);
  assert.equal(map.queryPoint([0, 0]).known, false);
  assert.equal(map.queryPoint([0, 0]).danger, 0);
});

test('batch order cannot change bounded retention or spatial results', () => {
  const policy = { capacity: 2 };
  const records = [
    source({
      sourceId: 'low',
      intensity: 0.2,
      confidence: 0.2
    }),
    source({
      sourceId: 'high-b',
      intensity: 0.9,
      confidence: 0.9,
      position: [1, 0]
    }),
    source({
      sourceId: 'high-a',
      intensity: 0.8,
      confidence: 0.9,
      position: [-1, 0]
    })
  ];
  const forward = new InfantryDangerMap(policy);
  const reverse = new InfantryDangerMap(policy);
  forward.recordSources(records);
  reverse.recordSources([...records].reverse());

  assert.deepEqual(reverse.captureState(), forward.captureState());
  assert.deepEqual(
    forward.captureState().sources.map(item => item.sourceId),
    ['high-a', 'high-b']
  );
  assert.deepEqual(reverse.queryPoint([0, 0]), forward.queryPoint([0, 0]));
});

test('ordered route scoring is spatial, factorized, and sample bounded', () => {
  const map = new InfantryDangerMap({
    routeSampleSpacingMeters: 1,
    maxSamplesPerSegment: 5
  });
  map.recordIncomingImpact({
    sourceId: 'near-road',
    impactPosition: [5, 0],
    radiusMeters: 4,
    intensity: 1,
    confidence: 0.75,
    lifetimeTicks: 12
  });

  const scores = map.scoreRouteSegments([
    {
      segmentId: 'safe-first',
      start: [0, 0],
      end: [0, 20]
    },
    {
      segmentId: 'danger-second',
      start: [0, 0],
      end: [10, 0]
    }
  ]);

  assert.deepEqual(
    scores.map(score => [score.segmentId, score.order]),
    [['safe-first', 0], ['danger-second', 1]]
  );
  assert.equal(scores[0].meanDanger, 0);
  assert.equal(scores[0].knownSampleCount, 0);
  assert.equal(scores[0].sampleCount, 5);
  assert.equal(scores[1].sampleCount, 5);
  assert.ok(scores[1].knownSampleCount > 0);
  assert.ok(scores[1].meanDanger > 0);
  assert.equal(scores[1].factors.confidence, 0.75);
  assert.deepEqual(scores[1].sourceIds, ['near-road']);
  assert.ok(Object.isFrozen(scores));
  assert.ok(Object.isFrozen(scores[1].factors));
});

test('capacity, route count, and route samples stay bounded', () => {
  const map = new InfantryDangerMap({
    capacity: 2,
    maxRouteSegments: 2,
    maxSamplesPerSegment: 3,
    routeSampleSpacingMeters: 0.1
  });
  map.recordSources([
    source({ sourceId: 'a', confidence: 0.1 }),
    source({ sourceId: 'b', confidence: 0.5 }),
    source({ sourceId: 'c', confidence: 1 })
  ]);
  assert.equal(map.size, 2);
  assert.deepEqual(
    map.captureState().sources.map(item => item.sourceId),
    ['b', 'c']
  );
  assert.equal(
    map.scoreRouteSegments([{
      segmentId: 'long',
      start: [0, 0],
      end: [1000, 0]
    }])[0].sampleCount,
    3
  );
  assert.throws(
    () => map.scoreRouteSegments([
      { segmentId: 'a', start: [0, 0], end: [1, 0] },
      { segmentId: 'b', start: [0, 0], end: [1, 0] },
      { segmentId: 'c', start: [0, 0], end: [1, 0] }
    ]),
    /bounded ordered array/
  );
});

test('capture is deep and integer-tick partitions replay identically', () => {
  const sourceMap = new InfantryDangerMap();
  sourceMap.recordSources([
    source(),
    source({
      sourceId: 7,
      kind: INFANTRY_DANGER_SOURCE_KINDS.CASUALTY,
      position: [4, 0],
      confidence: 0.7,
      lifetimeTicks: 20
    })
  ]);
  sourceMap.advanceTicks(3);
  const checkpoint = sourceMap.captureState();
  const cloned = cloneInfantryDangerMapState(checkpoint);
  assert.deepEqual(cloned, checkpoint);
  cloned.sources[0].position[0] = 999;
  assert.notEqual(sourceMap.captureState().sources[0].position[0], 999);

  const whole = restoreInfantryDangerMap(checkpoint);
  const partitioned = restoreInfantryDangerMap(checkpoint);
  whole.advanceTicks(6);
  partitioned.advanceTicks(1);
  partitioned.advanceTicks(2);
  partitioned.advanceTicks(3);

  const segments = [{
    segmentId: 'route',
    start: [-2, 0],
    end: [8, 0]
  }];
  assert.deepEqual(partitioned.captureState(), whole.captureState());
  assert.deepEqual(
    partitioned.scoreRouteSegments(segments),
    whole.scoreRouteSegments(segments)
  );

  const expected = whole.captureState();
  whole.recordCasualty({
    sourceId: 'later',
    casualtyPosition: [20, 0],
    radiusMeters: 3,
    intensity: 1,
    confidence: 1,
    lifetimeTicks: 3
  });
  whole.restoreState(expected);
  assert.deepEqual(whole.captureState(), expected);
});

test('source wrappers retain semantic kinds without retaining caller objects', () => {
  const map = new InfantryDangerMap();
  const casualtyPosition = [3, 1, 4];
  map.recordObservedThreat({
    ...source({ sourceId: 'observed' }),
    threatPosition: [1, 2]
  });
  map.recordIncomingImpact({
    ...source({ sourceId: 'impact' }),
    impactPosition: [2, 3]
  });
  map.recordCasualty({
    ...source({ sourceId: 'casualty' }),
    casualtyPosition
  });
  casualtyPosition[0] = 100;

  assert.deepEqual(
    map.captureState().sources.map(item => [item.sourceId, item.kind]),
    [
      ['casualty', INFANTRY_DANGER_SOURCE_KINDS.CASUALTY],
      ['impact', INFANTRY_DANGER_SOURCE_KINDS.INCOMING_IMPACT],
      ['observed', INFANTRY_DANGER_SOURCE_KINDS.OBSERVED_THREAT]
    ]
  );
  assert.deepEqual(
    map.captureState().sources
      .find(item => item.sourceId === 'casualty').position,
    [3, 4]
  );
});

test('invalid inputs and corrupt restore are rejected atomically', () => {
  assert.throws(
    () => new InfantryDangerMap({
      approximationLabel: 'unlabeled',
      capacity: 1
    }),
    /approximation label/
  );
  assert.throws(
    () => new InfantryDangerMap({ capacity: 0 }),
    /positive safe integer/
  );
  assert.equal(DEFAULT_INFANTRY_DANGER_MAP_POLICY.capacity, 64);

  const map = new InfantryDangerMap();
  map.recordSource(source());
  const before = map.captureState();
  for (const invalid of [
    source({ sourceId: '' }),
    source({ kind: 'guess' }),
    source({ position: [0] }),
    source({ radiusMeters: 0 }),
    source({ intensity: 1.1 }),
    source({ confidence: -0.1 }),
    source({ lifetimeTicks: 0 })
  ]) {
    assert.throws(() => map.recordSource(invalid));
    assert.deepEqual(map.captureState(), before);
  }
  assert.throws(
    () => map.recordSources([
      source({ sourceId: 'duplicate' }),
      source({ sourceId: 'duplicate' })
    ]),
    /duplicate sourceId/
  );
  assert.deepEqual(map.captureState(), before);
  assert.throws(
    () => map.scoreRouteSegments([
      { segmentId: 'same', start: [0, 0], end: [1, 0] },
      { segmentId: 'same', start: [1, 0], end: [2, 0] }
    ]),
    /duplicate segmentId/
  );
  assert.throws(() => map.advanceTicks(0.5), /safe integer/);

  const corrupt = structuredClone(before);
  corrupt.sources[0].expiresTick++;
  assert.throws(
    () => map.restoreState(corrupt),
    /must match observedTick/
  );
  assert.deepEqual(map.captureState(), before);
});
