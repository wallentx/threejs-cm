import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBehindArmorSpallEvent,
  resolveArmorPerforationEnergy,
  resolveBehindArmorSpallHits,
  resolveInternalPenetrationEnergy
} from '../src/simulation/ballistics/ArmorTerminalEffects.js';

const WEAPON = Object.freeze({
  caliberMm: 37,
  projectileMassKg: 1,
  penetrationVelocityExponent: 1,
  terminalBallistics: { minimumContinuationEnergyJ: 0 }
});

function approximately(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test('zero armor preserves a perforating projectile’s energy, speed, and direction', () => {
  const result = resolveArmorPerforationEnergy({
    weapon: WEAPON,
    velocity: [3, 4, 0],
    penetrationMm: 0,
    effectiveArmorMm: 0,
    penetrated: true
  });

  approximately(result.impactEnergyJ, 12.5);
  approximately(result.plateResidualEnergyJ, result.impactEnergyJ);
  approximately(result.armorEnergySpentJ, 0);
  approximately(result.plateResidualSpeed, result.impactSpeed);
  assert.deepEqual(result.plateResidualVelocity, [3, 4, 0]);
  assert.equal(result.continuationKind, 'penetrator');
  assert.equal(result.continuationReason, 'residual_energy');
});

test('the ballistic-limit boundary exhausts the projectile even when the plate perforates', () => {
  const result = resolveArmorPerforationEnergy({
    weapon: WEAPON,
    velocity: [0, 0, 100],
    penetrationMm: 100,
    effectiveArmorMm: 100,
    penetrated: true
  });

  approximately(result.ballisticLimitSpeed, 100);
  approximately(result.plateResidualEnergyJ, 0);
  approximately(result.armorEnergySpentJ, result.impactEnergyJ);
  assert.equal(result.plateResidualVelocity, null);
  assert.equal(result.continuationKind, 'none');
  assert.equal(result.continuationReason, 'ballistic_limit_exhausted');
  assert.equal(result.terminalEffect, 'perforated_stopped');
});

test('greater effective armor monotonically reduces residual energy and conserves plate energy', () => {
  const results = [0, 25, 50, 75, 100].map(effectiveArmorMm =>
    resolveArmorPerforationEnergy({
      weapon: WEAPON,
      velocity: [0, 0, 200],
      penetrationMm: 100,
      effectiveArmorMm,
      penetrated: true
    })
  );

  for (let index = 1; index < results.length; index++) {
    assert.ok(
      results[index].plateResidualEnergyJ <= results[index - 1].plateResidualEnergyJ,
      `residual energy must not rise from ${index - 1} to ${index}`
    );
  }
  for (const result of results) {
    approximately(
      result.impactEnergyJ,
      result.armorEnergySpentJ + result.plateResidualEnergyJ
    );
  }
  assert.equal(results.at(-1).plateResidualEnergyJ, 0);
});

test('internal absorption depletes ordered volumes, stops in-path, and excludes downstream volumes', () => {
  const result = resolveInternalPenetrationEnergy({
    weapon: WEAPON,
    initialEnergyJ: 1_000,
    impactEnergyJ: 1_000,
    pathHits: [
      {
        id: 'first',
        entryDistanceMeters: 1,
        exitDistanceMeters: 1.1,
        pathLengthMeters: 0.1,
        energyAbsorption: { fixedJ: 200, perMeterJ: 0, damageScaleJ: 100 }
      },
      {
        id: 'terminal',
        entryDistanceMeters: 2,
        exitDistanceMeters: 3,
        pathLengthMeters: 1,
        energyAbsorption: { fixedJ: 900, perMeterJ: 0, damageScaleJ: 100 }
      },
      {
        id: 'downstream',
        entryDistanceMeters: 4,
        exitDistanceMeters: 5,
        pathLengthMeters: 1,
        energyAbsorption: { fixedJ: 1, perMeterJ: 0, damageScaleJ: 1 }
      }
    ]
  });

  assert.deepEqual(result.hits.map(hit => hit.id), ['first', 'terminal']);
  assert.equal(result.hits[0].entryEnergyJ, 1_000);
  assert.equal(result.hits[0].exitEnergyJ, 800);
  assert.equal(result.hits[1].entryEnergyJ, 800);
  assert.equal(result.hits[1].energyDepositedJ, 800);
  assert.equal(result.hits[1].projectileStopped, true);
  assert.equal(result.residualEnergyJ, 0);
  assert.equal(result.internalEnergySpentJ, result.internalInitialEnergyJ);
  approximately(result.terminalDistanceMeters, 2 + 800 / 900);
  assert.equal(result.stoppedInside, true);
});

test('internal severity and absorption provenance are deterministic for identical inputs', () => {
  const input = {
    weapon: WEAPON,
    initialEnergyJ: 2_500,
    impactEnergyJ: 5_000,
    pathHits: [{
      id: 'sight',
      componentId: 'optics',
      entryDistanceMeters: 0.5,
      exitDistanceMeters: 0.8,
      pathLengthMeters: 0.3,
      energyAbsorption: {
        fixedJ: 750,
        perMeterJ: 250,
        damageScaleJ: 500,
        dataQuality: 'fixture-specific measured approximation'
      }
    }]
  };

  const first = resolveInternalPenetrationEnergy(input);
  const replay = resolveInternalPenetrationEnergy(input);
  const hit = first.hits[0];

  assert.deepEqual(replay, first);
  assert.equal(hit.energyModelDataQuality, 'fixture-specific measured approximation');
  approximately(hit.energyDepositedJ, 825);
  approximately(hit.damageSeverity, 1 - Math.exp(-825 / 500));
  assert.ok(hit.damageSeverity > 0 && hit.damageSeverity < 1);
  approximately(hit.entryEnergyRatio, 0.5);
  approximately(hit.exitEnergyRatio, 1_675 / 5_000);
});

test('a below-threshold penetrator deposits all remaining energy and cannot resume', () => {
  const weapon = {
    ...WEAPON,
    terminalBallistics: { minimumContinuationEnergyJ: 250 }
  };
  const result = resolveInternalPenetrationEnergy({
    weapon,
    initialEnergyJ: 200,
    impactEnergyJ: 1_000,
    pathHits: []
  });

  assert.deepEqual(result.hits, []);
  assert.equal(result.stoppedInside, true);
  assert.equal(result.residualEnergyJ, 0);
  assert.equal(result.residualSpeed, 0);
  assert.equal(result.terminalEnergyDepositedJ, 200);
  assert.equal(result.internalEnergySpentJ, 200);
  approximately(
    result.internalInitialEnergyJ,
    result.internalEnergySpentJ + result.residualEnergyJ
  );
});

test('crossing the continuation threshold stops inside the hit and conserves energy', () => {
  const weapon = {
    ...WEAPON,
    terminalBallistics: { minimumContinuationEnergyJ: 200 }
  };
  const result = resolveInternalPenetrationEnergy({
    weapon,
    initialEnergyJ: 1_000,
    impactEnergyJ: 2_000,
    pathHits: [{
      id: 'terminal-threshold',
      entryDistanceMeters: 1,
      exitDistanceMeters: 2,
      pathLengthMeters: 1,
      energyAbsorption: {
        fixedJ: 1_000,
        perMeterJ: 0,
        damageScaleJ: 500
      }
    }]
  });
  const hit = result.hits[0];

  assert.equal(result.stoppedInside, true);
  assert.equal(result.residualEnergyJ, 0);
  assert.equal(result.residualSpeed, 0);
  assert.equal(hit.projectileStopped, true);
  assert.equal(hit.resistanceEnergyDepositedJ, 800);
  assert.equal(hit.terminalEnergyDepositedJ, 200);
  assert.equal(hit.energyDepositedJ, hit.entryEnergyJ);
  assert.equal(hit.exitEnergyJ, 0);
  assert.equal(result.terminalEnergyDepositedJ, 200);
  approximately(result.terminalDistanceMeters, 1.8);
  approximately(
    result.internalInitialEnergyJ,
    result.internalEnergySpentJ + result.residualEnergyJ
  );
});

test('behind-armor spall uses a bounded deterministic cone and conserves its plate-energy share', () => {
  const input = {
    weapon: WEAPON,
    direction: [0, 0, -1],
    armorEnergySpentJ: 100_000,
    nominalArmorMm: 40
  };
  const event = createBehindArmorSpallEvent(input);
  const replay = createBehindArmorSpallEvent(input);

  assert.deepEqual(replay, event);
  assert.equal(event.modelVersion, 'behind-armor-spall-v1');
  assert.equal(event.rayCount, 24);
  assert.equal(event.rays.length, 24);
  assert.ok(event.representedFragmentCount > event.rayCount);
  approximately(
    event.rays.reduce((sum, ray) => sum + ray.energyJ, 0),
    event.totalSpallEnergyJ,
    1e-7
  );
  assert.ok(event.totalSpallEnergyJ <= input.armorEnergySpentJ);
  for (const ray of event.rays) {
    approximately(Math.hypot(...ray.direction), 1, 1e-9);
    assert.ok(ray.direction[2] < 0, 'every spall ray must remain behind the defeated plate');
  }

  const intersections = [
    {
      fragmentIndex: 2,
      id: 'module-engine',
      kind: 'component',
      componentId: 'engine',
      crewRoles: [],
      entryPoint: [0, 1, -1],
      entryDistanceMeters: 1.5,
      layoutVersion: 'test-layout',
      dataQuality: 'test approximation'
    },
    {
      fragmentIndex: 1,
      id: 'crew-driver',
      kind: 'crew',
      componentId: null,
      crewRoles: ['DRIVER'],
      entryPoint: [0, 1, 0],
      entryDistanceMeters: 0.5,
      layoutVersion: 'test-layout',
      dataQuality: 'test approximation'
    },
    {
      fragmentIndex: 0,
      id: 'crew-driver',
      kind: 'crew',
      componentId: null,
      crewRoles: ['DRIVER'],
      entryPoint: [0, 1, 0.1],
      entryDistanceMeters: 0.4,
      layoutVersion: 'test-layout',
      dataQuality: 'test approximation'
    }
  ];
  const resolved = resolveBehindArmorSpallHits({ event, intersections });
  const reordered = resolveBehindArmorSpallHits({
    event,
    intersections: [...intersections].reverse()
  });

  assert.deepEqual(reordered, resolved, 'input traversal order must not alter damage');
  assert.deepEqual(resolved.hits.map(hit => hit.id), ['crew-driver', 'module-engine']);
  assert.equal(resolved.hits[0].fragmentRayCount, 2);
  assert.ok(resolved.hits.every(hit => hit.damageSeverity > 0));
  assert.ok(resolved.energyDepositedJ <= event.totalSpallEnergyJ);
});
