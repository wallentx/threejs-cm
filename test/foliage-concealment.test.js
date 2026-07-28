import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FOLIAGE_CONCEALMENT_APPROXIMATION,
  FOLIAGE_CONCEALMENT_POLICY,
  FOLIAGE_CONCEALMENT_ROLE,
  FOLIAGE_CONCEALMENT_SHAPE,
  defineFoliageConcealmentVolumes,
  deriveFoliageObservationFactors,
  evaluateFoliageConcealment,
  measureFoliageSightSegment,
  validateFoliageConcealmentVolume
} from '../src/simulation/observation/FoliageConcealment.js';

function circular(id, center, {
  radiusMeters = 2,
  halfHeightMeters = 2,
  density = 0.5
} = {}) {
  return {
    id,
    shape: FOLIAGE_CONCEALMENT_SHAPE.CIRCULAR_CANOPY,
    center,
    radiusMeters,
    halfHeightMeters,
    density,
    densityDataQuality: FOLIAGE_CONCEALMENT_APPROXIMATION,
    geometryDataQuality: 'scenario-authored canopy gameplay approximation'
  };
}

function oriented(id, center, {
  halfExtentsMeters = [1, 2, 3],
  rotationYRadians = 0,
  density = 0.5
} = {}) {
  return {
    id,
    shape: FOLIAGE_CONCEALMENT_SHAPE.ORIENTED_CANOPY,
    center,
    halfExtentsMeters,
    rotationYRadians,
    density,
    densityDataQuality: FOLIAGE_CONCEALMENT_APPROXIMATION,
    geometryDataQuality: 'scenario-authored canopy gameplay approximation'
  };
}

test('policy and explicit volume records are approximation-labeled, sorted, and deeply frozen', () => {
  assert.equal(Object.isFrozen(FOLIAGE_CONCEALMENT_POLICY), true);
  for (const record of Object.values(FOLIAGE_CONCEALMENT_POLICY)
    .filter(value => value && typeof value === 'object')) {
    assert.equal(Object.isFrozen(record), true);
    assert.equal(
      record.dataQuality,
      FOLIAGE_CONCEALMENT_APPROXIMATION
    );
  }

  const volumes = defineFoliageConcealmentVolumes([
    oriented('hedgerow-z', [8, 2, 0]),
    circular('canopy-a', [0, 2, 0])
  ]);
  assert.deepEqual(volumes.map(volume => volume.id), [
    'canopy-a',
    'hedgerow-z'
  ]);
  assert.equal(Object.isFrozen(volumes), true);
  assert.equal(Object.isFrozen(volumes[0]), true);
  assert.equal(Object.isFrozen(volumes[0].center), true);
  assert.equal(Object.isFrozen(volumes[1].halfExtentsMeters), true);
  assert.equal(validateFoliageConcealmentVolume(volumes[0]), true);
});

test('volume validation rejects unstable identity, duplicates, implicit geometry, and unlabeled density', () => {
  assert.throws(
    () => defineFoliageConcealmentVolumes([
      circular('duplicate', [0, 0, 0]),
      circular('duplicate', [5, 0, 0])
    ]),
    /duplicated/
  );
  assert.throws(
    () => validateFoliageConcealmentVolume({
      ...circular('bad id', [0, 0, 0])
    }),
    /stable ASCII id/
  );
  assert.throws(
    () => validateFoliageConcealmentVolume({
      ...circular('bad-radius', [0, 0, 0]),
      radiusMeters: 0
    }),
    /radiusMeters must be positive/
  );
  assert.throws(
    () => validateFoliageConcealmentVolume({
      ...oriented('missing-rotation', [0, 0, 0]),
      rotationYRadians: undefined
    }),
    /rotationYRadians must be finite/
  );
  assert.throws(
    () => validateFoliageConcealmentVolume({
      ...circular('bad-density', [0, 0, 0]),
      density: 1.01
    }),
    /at most one/
  );
  assert.throws(
    () => validateFoliageConcealmentVolume({
      ...circular('unlabeled-density', [0, 0, 0]),
      densityDataQuality: 'surveyed'
    }),
    /gameplay approximation/
  );
  assert.throws(
    () => measureFoliageSightSegment({
      observerPosition: [0, Number.NaN, 0],
      targetPosition: [1, 0, 0],
      volumes: []
    }),
    /must be finite/
  );
});

test('a partial circular-canopy crossing reports exact ordered path length without hard occlusion', () => {
  const result = evaluateFoliageConcealment({
    observerPosition: [-4, 2, 0],
    targetPosition: [4, 2, 0],
    volumes: [circular('middle-tree', [0, 2, 0])]
  });

  assert.equal(result.segmentLengthMeters, 8);
  assert.equal(result.blocksLineOfSight, false);
  assert.equal(result.intersections.length, 1);
  assert.deepEqual(
    {
      volumeId: result.intersections[0].volumeId,
      entryT: result.intersections[0].entryT,
      exitT: result.intersections[0].exitT,
      pathLengthMeters: result.intersections[0].pathLengthMeters,
      role: result.intersections[0].role
    },
    {
      volumeId: 'middle-tree',
      entryT: 0.25,
      exitT: 0.75,
      pathLengthMeters: 4,
      role: FOLIAGE_CONCEALMENT_ROLE.INTERVENING
    }
  );
  assert.equal(result.total.unionPathLengthMeters, 4);
  assert.equal(result.total.densityWeightedPathMeters, 2);
  assert.equal(result.intervening.unionPathLengthMeters, 4);
  assert.equal(result.factors.maximumObservationRangeFactor < 1, true);
  assert.equal(result.factors.acquisitionTimeFactor > 1, true);
  assert.equal(result.factors.identificationProgressFactor < 1, true);
  assert.equal(result.factors.visibilityQualityFactor < 1, true);
});

test('observer, target, and intervening foliage remain distinct effects', () => {
  const result = evaluateFoliageConcealment({
    observerPosition: [0, 2, 0],
    targetPosition: [12, 2, 0],
    volumes: [
      circular('target-cover', [12, 2, 0], {
        radiusMeters: 1,
        density: 0.7
      }),
      circular('observer-cover', [0, 2, 0], {
        radiusMeters: 1,
        density: 0.4
      }),
      circular('intervening-cover', [6, 2, 0], {
        radiusMeters: 1.5,
        density: 0.6
      })
    ]
  });

  assert.deepEqual(result.observer.insideVolumeIds, ['observer-cover']);
  assert.deepEqual(result.target.insideVolumeIds, ['target-cover']);
  assert.deepEqual(result.intervening.volumeIds, ['intervening-cover']);
  assert.equal(result.observer.combinedDensity, 0.4);
  assert.ok(Math.abs(result.target.combinedDensity - 0.7) < 1e-12);
  assert.deepEqual(
    result.intersections.map(hit => [hit.volumeId, hit.role]),
    [
      ['observer-cover', FOLIAGE_CONCEALMENT_ROLE.OBSERVER],
      ['intervening-cover', FOLIAGE_CONCEALMENT_ROLE.INTERVENING],
      ['target-cover', FOLIAGE_CONCEALMENT_ROLE.TARGET]
    ]
  );
  assert.equal(result.factors.observerExposure, 0.4);
  assert.ok(Math.abs(result.factors.targetExposure - 0.7) < 1e-12);
  assert.equal(result.factors.interveningExposure > 0, true);
});

test('overlapping volumes combine physical path once and are invariant to input order', () => {
  const alpha = circular('alpha', [0, 2, 0], { density: 0.5 });
  const bravo = circular('bravo', [0, 2, 0], { density: 0.5 });
  const forward = evaluateFoliageConcealment({
    observerPosition: [-4, 2, 0],
    targetPosition: [4, 2, 0],
    volumes: [bravo, alpha]
  });
  const reordered = evaluateFoliageConcealment({
    observerPosition: [-4, 2, 0],
    targetPosition: [4, 2, 0],
    volumes: [alpha, bravo]
  });

  assert.deepEqual(reordered, forward);
  assert.deepEqual(
    forward.intersections.map(hit => hit.volumeId),
    ['alpha', 'bravo']
  );
  assert.equal(forward.total.summedPathLengthMeters, 8);
  assert.equal(forward.total.unionPathLengthMeters, 4);
  assert.equal(forward.total.densityWeightedPathMeters, 3);
  assert.equal(forward.intervening.densityWeightedPathMeters, 3);
});

test('oriented canopy rotation is measured in three dimensions', () => {
  const measurement = measureFoliageSightSegment({
    observerPosition: [-4, 2, 0],
    targetPosition: [4, 2, 0],
    volumes: [
      oriented('rotated-copse', [0, 2, 0], {
        halfExtentsMeters: [1, 2, 3],
        rotationYRadians: Math.PI / 2
      })
    ]
  });

  assert.equal(measurement.intersections.length, 1);
  assert.ok(
    Math.abs(measurement.intersections[0].pathLengthMeters - 6) < 1e-12
  );
  assert.ok(
    Math.abs(measurement.intersections[0].entryDistanceMeters - 1) < 1e-12
  );
  assert.ok(
    Math.abs(measurement.intersections[0].exitDistanceMeters - 7) < 1e-12
  );
});

test('tangent, vertically separated, and empty sight lines are neutral', () => {
  const volume = circular('canopy', [0, 2, 0], {
    radiusMeters: 1,
    halfHeightMeters: 1
  });
  for (const [observerPosition, targetPosition, volumes] of [
    [[-2, 2, 1], [2, 2, 1], [volume]],
    [[-2, 4, 0], [2, 4, 0], [volume]],
    [[0, 0, 0], [10, 0, 0], []]
  ]) {
    const result = evaluateFoliageConcealment({
      observerPosition,
      targetPosition,
      volumes
    });
    assert.equal(result.intersections.length, 0);
    assert.equal(result.total.unionPathLengthMeters, 0);
    assert.deepEqual(result.factors, {
      approximationLabel: FOLIAGE_CONCEALMENT_APPROXIMATION,
      blocksLineOfSight: false,
      observerExposure: 0,
      targetExposure: 0,
      interveningExposure: 0,
      maximumObservationRangeFactor: 1,
      acquisitionTimeFactor: 1,
      identificationProgressFactor: 1,
      visibilityQualityFactor: 1
    });
  }
});

test('even saturated foliage retains bounded nonzero observation capability', () => {
  const measurement = {
    observer: { combinedDensity: 1 },
    target: { combinedDensity: 1 },
    intervening: { densityWeightedPathMeters: Number.MAX_VALUE }
  };
  const factors = deriveFoliageObservationFactors(measurement);

  assert.equal(factors.blocksLineOfSight, false);
  assert.equal(
    factors.maximumObservationRangeFactor,
    FOLIAGE_CONCEALMENT_POLICY.maximumObservationRange.minimumFactor
  );
  assert.equal(factors.acquisitionTimeFactor > 1, true);
  assert.equal(
    factors.acquisitionTimeFactor
      <= FOLIAGE_CONCEALMENT_POLICY.acquisitionTime.maximumFactor,
    true
  );
  assert.equal(
    factors.identificationProgressFactor,
    FOLIAGE_CONCEALMENT_POLICY.identificationProgress.minimumFactor
  );
  assert.equal(
    factors.visibilityQualityFactor,
    FOLIAGE_CONCEALMENT_POLICY.visibilityQuality.minimumFactor
  );
});
