import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INFANTRY_MARKSMANSHIP_FACTOR_KEYS,
  INFANTRY_MARKSMANSHIP_MODEL_VERSION,
  NEUTRAL_INFANTRY_MARKSMANSHIP_FACTORS,
  createInfantryMarksmanshipIndex,
  createInfantryMarksmanshipProfile,
  createInfantryOpticCapability,
  getInfantryMarksmanshipProfile,
  resolveInfantryMarksmanshipFactors
} from '../src/simulation/infantry/InfantryMarksmanship.js';

const APPROXIMATION =
  'gameplay approximation for deterministic test calibration';

const APX_FIXTURE = Object.freeze({
  id: 'APX_TEST_CAPABILITY',
  factors: Object.freeze({
    observationAcquisitionTimeMultiplier: 0.78,
    observationRangeMultiplier: 1.22,
    aimWorkTimeMultiplier: 0.84,
    rangeEstimationErrorMultiplier: 0.7,
    dispersionMultiplier: 0.82,
    concealmentSignatureMultiplier: 1.04,
    shotAimRetentionMultiplier: 1.08
  }),
  dataQuality: APPROXIMATION
});

const SKILL_FACTORS = Object.freeze({
  observationAcquisitionTimeMultiplier: 0.86,
  observationRangeMultiplier: 1.12,
  aimWorkTimeMultiplier: 0.8,
  rangeEstimationErrorMultiplier: 0.76,
  dispersionMultiplier: 0.72,
  concealmentSignatureMultiplier: 0.81,
  shotAimRetentionMultiplier: 1.1
});

function configuredProfile(soldierId = 'unit-7:marksman') {
  return {
    soldierId,
    opticId: APX_FIXTURE.id,
    skillFactors: SKILL_FACTORS,
    skillDataQuality: APPROXIMATION
  };
}

test('unconfigured soldiers receive exact frozen neutral compatibility factors', () => {
  const index = createInfantryMarksmanshipIndex();
  const factors = resolveInfantryMarksmanshipFactors(
    index,
    'unit-1:rifleman-1'
  );

  assert.strictEqual(factors, NEUTRAL_INFANTRY_MARKSMANSHIP_FACTORS);
  assert.equal(factors.configured, false);
  assert.equal(factors.opticId, null);
  assert.equal(factors.modelVersion, INFANTRY_MARKSMANSHIP_MODEL_VERSION);
  for (const key of INFANTRY_MARKSMANSHIP_FACTOR_KEYS) {
    assert.equal(factors[key], 1, `${key} must preserve current behavior`);
    assert.match(factors.factorDataQuality[key], /gameplay approximation/i);
  }
  assert.equal(Object.isFrozen(factors), true);
  assert.equal(Object.isFrozen(factors.factorDataQuality), true);
});

test('individual skill and injected optic capabilities remain separate and compose per factor', () => {
  const index = createInfantryMarksmanshipIndex({
    profiles: [configuredProfile()],
    opticCapabilities: [APX_FIXTURE]
  });
  const factors = resolveInfantryMarksmanshipFactors(
    index,
    'unit-7:marksman'
  );

  assert.equal(factors.configured, true);
  assert.equal(factors.opticId, APX_FIXTURE.id);
  for (const key of INFANTRY_MARKSMANSHIP_FACTOR_KEYS) {
    assert.equal(factors[key], SKILL_FACTORS[key] * APX_FIXTURE.factors[key]);
    assert.match(factors.factorDataQuality[key], /gameplay approximation/i);
  }
  assert.strictEqual(
    getInfantryMarksmanshipProfile(index, 'unit-7:marksman'),
    index.profilesBySoldierId['unit-7:marksman']
  );
  assert.equal(Object.isFrozen(index), true);
  assert.equal(Object.isFrozen(index.profilesBySoldierId), true);
  assert.equal(Object.isFrozen(factors), true);
  assert.throws(() => {
    factors.dispersionMultiplier = 99;
  }, TypeError);
});

test('the core has no generic sniper scalar and rejects unsupported factor dimensions', () => {
  assert.throws(
    () => createInfantryMarksmanshipProfile({
      soldierId: 'unit-1:sniper',
      sniperBonus: 2
    }),
    /unsupported field sniperBonus/
  );
  assert.throws(
    () => createInfantryMarksmanshipProfile({
      soldierId: 'unit-1:sniper',
      skillFactors: { genericAccuracyMultiplier: 0.5 },
      skillDataQuality: APPROXIMATION
    }),
    /unsupported factor genericAccuracyMultiplier/
  );
});

test('unknown optic references fail closed while no-optic profiles remain neutral by default', () => {
  assert.throws(
    () => createInfantryMarksmanshipIndex({
      profiles: [{
        soldierId: 'unit-1:marksman',
        opticId: 'UNREGISTERED_OPTIC'
      }]
    }),
    /references unknown optic UNREGISTERED_OPTIC/
  );
  assert.throws(
    () => createInfantryMarksmanshipIndex({
      profiles: [{
        soldierId: 'unit-1:marksman',
        opticId: 'toString'
      }]
    }),
    /references unknown optic toString/
  );

  const index = createInfantryMarksmanshipIndex({
    profiles: [{ soldierId: 'unit-1:rifleman' }]
  });
  const factors = resolveInfantryMarksmanshipFactors(
    index,
    'unit-1:rifleman'
  );
  assert.equal(factors.configured, true);
  assert.equal(factors.opticId, null);
  for (const key of INFANTRY_MARKSMANSHIP_FACTOR_KEYS) {
    assert.equal(factors[key], 1);
  }
});

test('invalid IDs, factors, duplicates, and unlabeled approximations are rejected', () => {
  assert.throws(
    () => createInfantryMarksmanshipProfile({ soldierId: '   ' }),
    /stable string ID/
  );
  assert.throws(
    () => createInfantryOpticCapability({
      id: 'optic',
      factors: { dispersionMultiplier: 0 },
      dataQuality: APPROXIMATION
    }),
    /dispersionMultiplier must be finite and greater than zero/
  );
  assert.throws(
    () => createInfantryOpticCapability({
      id: 'optic',
      factors: { dispersionMultiplier: 0.8 },
      dataQuality: 'historical'
    }),
    /gameplay approximations/
  );
  assert.throws(
    () => createInfantryMarksmanshipIndex({
      profiles: [
        { soldierId: 'unit-1:rifleman' },
        { soldierId: 'unit-1:rifleman' }
      ]
    }),
    /duplicate infantry marksmanship profile/
  );
  assert.throws(
    () => createInfantryMarksmanshipIndex({
      opticCapabilities: [APX_FIXTURE, APX_FIXTURE]
    }),
    /duplicate infantry optic capability/
  );
});

test('resolution is pure and stable under input and query order without frame-owned state', () => {
  const profiles = [
    configuredProfile('unit-b:marksman'),
    {
      soldierId: 'unit-a:observer',
      skillFactors: {
        observationAcquisitionTimeMultiplier: 0.9,
        observationRangeMultiplier: 1.1
      },
      skillDataQuality: APPROXIMATION
    }
  ];
  const unusedOptic = {
    id: 'IRON_TEST_CAPABILITY',
    factors: {},
    dataQuality: APPROXIMATION
  };
  const first = createInfantryMarksmanshipIndex({
    profiles,
    opticCapabilities: [APX_FIXTURE, unusedOptic]
  });
  const reordered = createInfantryMarksmanshipIndex({
    profiles: [...profiles].reverse(),
    opticCapabilities: [unusedOptic, APX_FIXTURE]
  });

  assert.deepEqual(reordered, first);
  assert.deepEqual(first.soldierIds, [
    'unit-a:observer',
    'unit-b:marksman'
  ]);
  assert.deepEqual(first.opticIds, [
    'APX_TEST_CAPABILITY',
    'IRON_TEST_CAPABILITY'
  ]);

  const before = structuredClone(first);
  const oneStep = resolveInfantryMarksmanshipFactors(
    first,
    'unit-b:marksman'
  );
  for (let step = 0; step < 60; step++) {
    resolveInfantryMarksmanshipFactors(first, 'unit-a:observer');
    assert.strictEqual(
      resolveInfantryMarksmanshipFactors(first, 'unit-b:marksman'),
      oneStep
    );
  }
  assert.deepEqual(first, before);
  assert.deepEqual(
    resolveInfantryMarksmanshipFactors(reordered, 'unit-b:marksman'),
    oneStep
  );
});
