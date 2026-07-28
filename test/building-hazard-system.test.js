import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDING_HAZARD_APPROXIMATION,
  BuildingHazardSystem,
  normalizeBuildingHazardDefinition
} from '../src/simulation/buildings/BuildingHazardSystem.js';

function policy() {
  return {
    tickDurationSeconds: 0.1,
    maxHeatUnits: 100,
    maxFireIntensityUnits: 40,
    maxSmokeUnits: 100,
    initialFireIntensityUnits: 10,
    fireGrowthUnitsPerTick: 5,
    burningHeatUnitsPerTick: 4,
    fuelBurnUnitsPerTick: 1,
    smokeGenerationUnitsPerTick: 6,
    passiveHeatCoolingUnitsPerTick: 1,
    smokeDissipationUnitsPerTick: 2,
    occupantFireThresholdUnits: 10,
    occupantSmokeThresholdUnits: 5,
    occupantFireDamageUnitsPerTick: 2,
    occupantSmokeExposureUnitsPerTick: 3
  };
}

function definition({
  id = 'hazard-house',
  reverse = false,
  alphaFuelUnits = 8
} = {}) {
  const sections = [
    {
      id: 'alpha',
      combustible: true,
      fuelUnits: alphaFuelUnits,
      ignitionHeatUnits: 20
    },
    {
      id: 'bravo',
      combustible: true,
      fuelUnits: 5,
      ignitionHeatUnits: 15
    },
    {
      id: 'stone',
      combustible: false,
      fuelUnits: 0,
      ignitionHeatUnits: 50
    }
  ];
  const adjacency = [
    {
      id: 'alpha-to-bravo',
      fromSectionId: 'alpha',
      toSectionId: 'bravo',
      heatTransferUnitsPerTick: 7
    },
    {
      id: 'alpha-to-stone',
      fromSectionId: 'alpha',
      toSectionId: 'stone',
      heatTransferUnitsPerTick: 5
    },
    {
      id: 'bravo-to-alpha',
      fromSectionId: 'bravo',
      toSectionId: 'alpha',
      heatTransferUnitsPerTick: 3
    }
  ];
  return {
    id,
    approximation: BUILDING_HAZARD_APPROXIMATION,
    policy: policy(),
    sections: reverse ? [...sections].reverse() : sections,
    adjacency: reverse ? [...adjacency].reverse() : adjacency
  };
}

function acceptedDamage({
  intentId = 'damage-1',
  buildingId = 'hazard-house',
  sectionId = 'alpha',
  heatUnits = 20,
  accepted = true
} = {}) {
  return {
    intentId,
    buildingId,
    sectionId,
    accepted,
    cause: 'resolved_explosive_damage',
    heatUnits
  };
}

function acceptedExtinguish({
  intentId = 'extinguish-1',
  buildingId = 'hazard-house',
  sectionId = 'alpha',
  accepted = true,
  coolingUnits = 100,
  fireSuppressionUnits = 40,
  smokeRemovalUnits = 100
} = {}) {
  return {
    intentId,
    buildingId,
    sectionId,
    accepted,
    cause: 'modeled_suppression_agent',
    coolingUnits,
    fireSuppressionUnits,
    smokeRemovalUnits
  };
}

function createSystem(options = {}, definitionOptions = {}) {
  const system = new BuildingHazardSystem(options);
  system.addBuilding(definition(definitionOptions));
  return system;
}

test('definitions require explicit combustible sections, directed adjacency, and approximation labels', () => {
  const normalized = normalizeBuildingHazardDefinition(definition());
  assert.equal(normalized.approximation, 'gameplay_approximation');
  assert.equal(normalized.policy.tickDurationSeconds, 0.1);
  assert.deepEqual(
    normalized.sections.map(section => section.id),
    ['alpha', 'bravo', 'stone']
  );
  assert.deepEqual(
    normalized.adjacency.map(edge => edge.id),
    ['alpha-to-bravo', 'alpha-to-stone', 'bravo-to-alpha']
  );
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.policy));
  assert.ok(Object.isFrozen(normalized.sections));
  assert.ok(normalized.sections.every(Object.isFrozen));
  assert.ok(Object.isFrozen(normalized.adjacency));

  const missingLabel = definition();
  missingLabel.approximation = 'historical';
  assert.throws(
    () => normalizeBuildingHazardDefinition(missingLabel),
    /must be gameplay_approximation/
  );

  const inferredCombustibility = definition();
  delete inferredCombustibility.sections[0].combustible;
  assert.throws(
    () => normalizeBuildingHazardDefinition(inferredCombustibility),
    /combustible is required/
  );

  const nonCombustibleFuel = definition();
  nonCombustibleFuel.sections[2].fuelUnits = 1;
  assert.throws(
    () => normalizeBuildingHazardDefinition(nonCombustibleFuel),
    /must be zero for a non-combustible section/
  );

  const unknownEdge = definition();
  unknownEdge.adjacency[0].toSectionId = 'mesh-inferred-room';
  assert.throws(
    () => normalizeBuildingHazardDefinition(unknownEdge),
    /references an unknown section/
  );

  const duplicatePair = definition();
  duplicatePair.adjacency.push({
    id: 'duplicate-path',
    fromSectionId: 'alpha',
    toSectionId: 'bravo',
    heatTransferUnitsPerTick: 1
  });
  assert.throws(
    () => normalizeBuildingHazardDefinition(duplicatePair),
    /duplicates directed adjacency/
  );
});

test('only accepted authoritative damage intents add heat and ignite combustible fuel', () => {
  const system = createSystem();
  const before = system.captureState();
  const rejected = system.applyDamageIntent(acceptedDamage({
    intentId: 'rejected',
    accepted: false
  }));
  assert.deepEqual(rejected, {
    processed: false,
    reason: 'damage_not_accepted',
    events: []
  });
  assert.deepEqual(system.captureState(), before);

  const applied = system.applyDamageIntent(acceptedDamage());
  assert.equal(applied.processed, true);
  assert.equal(applied.appliedHeatUnits, 20);
  assert.equal(applied.ignited, true);
  assert.deepEqual(
    applied.events.map(event => event.type),
    ['damage_heat_applied', 'section_ignited']
  );
  assert.ok(
    applied.events.every(
      event => event.approximation === BUILDING_HAZARD_APPROXIMATION
    )
  );
  assert.deepEqual(system.getBuildingSnapshot('hazard-house').sections.alpha, {
    heatUnits: 20,
    fireIntensityUnits: 10,
    smokeUnits: 0,
    fuelUnits: 8,
    burning: true,
    burnedOut: false
  });

  const duplicateBefore = system.captureState();
  assert.deepEqual(system.applyDamageIntent(acceptedDamage()), {
    processed: false,
    reason: 'duplicate_intent',
    events: []
  });
  assert.deepEqual(system.captureState(), duplicateBefore);

  const stone = system.applyDamageIntent(acceptedDamage({
    intentId: 'stone-damage',
    sectionId: 'stone',
    heatUnits: 100
  }));
  assert.equal(stone.processed, true);
  assert.equal(stone.ignited, false);
  assert.equal(
    system.getBuildingSnapshot('hazard-house').sections.stone.burning,
    false
  );

  const invalidBefore = system.captureState();
  assert.throws(
    () => system.applyDamageIntent(acceptedDamage({
      intentId: 'bad-section',
      sectionId: 'unknown'
    })),
    /Unknown hazard section/
  );
  assert.deepEqual(system.captureState(), invalidBefore);
});

test('spread uses canonical ticks and stable section IDs independent of input ordering', () => {
  const run = reverse => {
    const system = createSystem({}, { reverse });
    system.applyDamageIntent(acceptedDamage());
    const result = system.advanceTicks('hazard-house', 3);
    return {
      result,
      state: system.captureState()
    };
  };
  const forward = run(false);
  const reversed = run(true);

  assert.deepEqual(forward, reversed);
  assert.deepEqual(
    forward.result.events.map(event => [
      event.type,
      event.sectionId,
      event.tick,
      event.cause,
      event.sourceSectionIds
    ]),
    [[
      'section_ignited',
      'bravo',
      3,
      'adjacent_fire_spread',
      ['alpha']
    ]]
  );
  const snapshot = forward.state.buildings[0];
  assert.equal(snapshot.sections.alpha.burning, true);
  assert.equal(snapshot.sections.bravo.burning, true);
  assert.equal(snapshot.sections.stone.burning, false);
  assert.ok(snapshot.sections.stone.heatUnits > 0);
});

test('extinguish intents suppress active fire and fuel exhaustion creates persistent burnout', () => {
  const extinguishedSystem = createSystem();
  extinguishedSystem.applyDamageIntent(acceptedDamage());
  extinguishedSystem.advanceTicks('hazard-house', 1);
  const result = extinguishedSystem.applyExtinguishIntent(
    acceptedExtinguish()
  );
  assert.equal(result.processed, true);
  assert.equal(result.extinguished, true);
  assert.deepEqual(
    result.events.map(event => event.type),
    ['extinguish_applied', 'section_extinguished']
  );
  let alpha = extinguishedSystem
    .getBuildingSnapshot('hazard-house')
    .sections.alpha;
  assert.equal(alpha.burning, false);
  assert.equal(alpha.fireIntensityUnits, 0);
  assert.equal(alpha.heatUnits, 0);
  assert.equal(alpha.smokeUnits, 0);
  extinguishedSystem.advanceTicks('hazard-house', 4);
  alpha = extinguishedSystem
    .getBuildingSnapshot('hazard-house')
    .sections.alpha;
  assert.equal(alpha.burning, false);
  assert.equal(alpha.burnedOut, false);

  const burnoutSystem = createSystem({}, { alphaFuelUnits: 2 });
  burnoutSystem.applyDamageIntent(acceptedDamage());
  const burnout = burnoutSystem.advanceTicks('hazard-house', 2);
  assert.deepEqual(
    burnout.events.map(event => event.type),
    ['section_burned_out']
  );
  const burned = burnoutSystem
    .getBuildingSnapshot('hazard-house')
    .sections.alpha;
  assert.equal(burned.fuelUnits, 0);
  assert.equal(burned.burning, false);
  assert.equal(burned.burnedOut, true);
  assert.equal(burned.fireIntensityUnits, 0);

  burnoutSystem.applyDamageIntent(acceptedDamage({
    intentId: 'post-burnout-damage',
    heatUnits: 100
  }));
  burnoutSystem.advanceTicks('hazard-house', 1);
  assert.equal(
    burnoutSystem.getBuildingSnapshot('hazard-house').sections.alpha.burning,
    false
  );
});

test('occupant hazard outputs are stable intents and never mutate occupant records', () => {
  const system = createSystem();
  system.applyDamageIntent(acceptedDamage());
  const occupants = [
    { occupantId: 'soldier-z', sectionId: 'bravo' },
    { occupantId: 'soldier-a', sectionId: 'alpha' }
  ];
  const before = structuredClone(occupants);
  const result = system.advanceTicks(
    'hazard-house',
    2,
    { occupants }
  );

  assert.deepEqual(occupants, before);
  assert.deepEqual(result.occupantHazardIntents, [
    {
      type: 'building_occupant_hazard',
      intentId: 'hazard-house:hazard:1:soldier-a',
      buildingId: 'hazard-house',
      sectionId: 'alpha',
      occupantId: 'soldier-a',
      tick: 1,
      fireDamageUnits: 2,
      smokeExposureUnits: 0,
      approximation: 'gameplay_approximation'
    },
    {
      type: 'building_occupant_hazard',
      intentId: 'hazard-house:hazard:2:soldier-a',
      buildingId: 'hazard-house',
      sectionId: 'alpha',
      occupantId: 'soldier-a',
      tick: 2,
      fireDamageUnits: 4,
      smokeExposureUnits: 3,
      approximation: 'gameplay_approximation'
    }
  ]);

  const stateBeforeRejection = system.captureState();
  assert.throws(
    () => system.advanceTicks('hazard-house', 1, {
      occupants: [{ occupantId: 'soldier-a', sectionId: 'unknown' }]
    }),
    /references unknown section/
  );
  assert.deepEqual(system.captureState(), stateBeforeRejection);
  assert.throws(
    () => system.advanceTicks('hazard-house', 1, {
      occupants: [
        { occupantId: 'same', sectionId: 'alpha' },
        { occupantId: 'same', sectionId: 'bravo' }
      ]
    }),
    /duplicate occupantId/
  );
  assert.deepEqual(system.captureState(), stateBeforeRejection);
});

test('canonical tick partitions produce identical state, events, and occupant intents', () => {
  const occupants = [{ occupantId: 'soldier-a', sectionId: 'alpha' }];
  const coarse = createSystem();
  const partitioned = createSystem();
  coarse.applyDamageIntent(acceptedDamage());
  partitioned.applyDamageIntent(acceptedDamage());

  const coarseResult = coarse.advanceTicks(
    'hazard-house',
    6,
    { occupants }
  );
  const first = partitioned.advanceTicks(
    'hazard-house',
    2,
    { occupants }
  );
  const second = partitioned.advanceTicks(
    'hazard-house',
    4,
    { occupants }
  );

  assert.deepEqual(coarse.captureState(), partitioned.captureState());
  assert.deepEqual(coarseResult.events, [...first.events, ...second.events]);
  assert.deepEqual(
    coarseResult.occupantHazardIntents,
    [
      ...first.occupantHazardIntents,
      ...second.occupantHazardIntents
    ]
  );
});

test('capture, mutation, restore, and replay are deep and byte-identical', () => {
  const system = createSystem();
  system.applyDamageIntent(acceptedDamage());
  system.advanceTicks('hazard-house', 2);
  const checkpoint = system.captureState();
  const replayInput = {
    occupants: [{ occupantId: 'soldier-a', sectionId: 'alpha' }]
  };
  const firstResult = system.advanceTicks('hazard-house', 4, replayInput);
  const firstFinal = system.captureState();

  const mutableCapture = structuredClone(checkpoint);
  mutableCapture.buildings[0].sections.alpha.heatUnits = 99;
  mutableCapture.buildings[0].processedIntentIds.push('external-mutation');
  assert.deepEqual(system.captureState(), firstFinal);

  const restoredInput = structuredClone(checkpoint);
  system.restoreState(restoredInput);
  restoredInput.buildings[0].sections.alpha.heatUnits = 0;
  restoredInput.buildings[0].events.length = 0;
  assert.deepEqual(system.captureState(), checkpoint);

  const replayResult = system.advanceTicks('hazard-house', 4, replayInput);
  assert.deepEqual(replayResult, firstResult);
  assert.deepEqual(system.captureState(), firstFinal);
});

test('restore rejects corrupt state transactionally and histories remain bounded', () => {
  const system = createSystem({ eventLimit: 3, intentHistoryLimit: 3 });
  system.applyDamageIntent(acceptedDamage());
  system.applyExtinguishIntent(acceptedExtinguish());
  system.applyDamageIntent(acceptedDamage({
    intentId: 'damage-2',
    heatUnits: 20
  }));
  system.applyExtinguishIntent(acceptedExtinguish({
    intentId: 'extinguish-2'
  }));

  const capture = system.captureState();
  assert.equal(capture.buildings[0].events.length, 3);
  assert.equal(capture.buildings[0].processedIntentIds.length, 3);
  assert.deepEqual(capture.buildings[0].processedIntentIds, [
    'extinguish-1',
    'damage-2',
    'extinguish-2'
  ]);
  const eventPage = system.getEvents('hazard-house', 0);
  assert.equal(eventPage.truncated, true);
  assert.equal(eventPage.events.length, 3);
  assert.equal(
    eventPage.events.at(-1).version,
    eventPage.eventVersion
  );

  const corrupt = structuredClone(capture);
  corrupt.buildings[0].sections.alpha.burning = false;
  corrupt.buildings[0].sections.alpha.fireIntensityUnits = 10;
  assert.throws(
    () => system.restoreState(corrupt),
    /fire intensity while not burning/
  );
  assert.deepEqual(system.captureState(), capture);

  const missingSection = structuredClone(capture);
  delete missingSection.buildings[0].sections.bravo;
  assert.throws(
    () => system.restoreState(missingSection),
    /must exactly match the registered definition/
  );
  assert.deepEqual(system.captureState(), capture);

  const wrongVersion = structuredClone(capture);
  wrongVersion.schemaVersion = 999;
  assert.throws(
    () => system.restoreState(wrongVersion),
    /Unsupported building hazard schemaVersion/
  );
  assert.deepEqual(system.captureState(), capture);
});
