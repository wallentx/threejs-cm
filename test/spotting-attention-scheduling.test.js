import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpottingSystem } from '../src/game/SpottingSystem.js';

const CANONICAL_STEP_SECONDS = 0.1;

function makeUnit({
  id,
  faction,
  x = 0,
  z = 0,
  morale = 'OK',
  roster = null
}) {
  return {
    id,
    faction,
    type: 'infantry_squad',
    experience: 'Regular',
    morale,
    stance: 'STANDING',
    suppression: 0,
    isHiding: false,
    moveSpeed: 0,
    position: new THREE.Vector3(x, 0, z),
    roster: roster ?? [{
      id: 0,
      role: 'RIFLEMAN',
      status: 'OK',
      health: 100,
      velocity: [0, 0, 0],
      recoilTime: 0
    }]
  };
}

function makeSpotting(settings = {}) {
  return new SpottingSystem(null, { getHeightAt: () => 0 }, {
    settings: {
      baseAcquisitionSeconds: 1,
      terrainSampleMeters: 25,
      ...settings
    }
  });
}

function makeColdPair({ targetId = 'target', distance = 500 } = {}) {
  return [
    makeUnit({ id: 'observer', faction: 'blue' }),
    makeUnit({
      id: targetId,
      faction: 'red',
      x: distance,
      morale: 'Broken'
    })
  ];
}

function advanceCanonical(spotting, units, steps) {
  for (let tick = 0; tick < steps; tick++) {
    spotting.advance(tick % 2 === 0 ? units : [...units].reverse(), CANONICAL_STEP_SECONDS);
  }
}

function observationTargets(spotting) {
  return new Set(spotting.captureState().observations.map(row => row.targetUnitId));
}

test('cold candidates use all five stable phases with at most 0.4 seconds initial delay', () => {
  const observer = makeUnit({ id: 'observer', faction: 'blue' });
  const targets = Array.from({ length: 80 }, (_, index) => makeUnit({
    id: `cold-${index}`,
    faction: 'red',
    x: 500 + index,
    morale: 'Broken'
  }));
  const units = [observer, ...targets];
  const spotting = makeSpotting();
  const firstEvaluationTick = new Map();

  for (let tick = 0; tick < 5; tick++) {
    spotting.advance(tick % 2 === 0 ? units : [...units].reverse(), CANONICAL_STEP_SECONDS);
    const present = observationTargets(spotting);
    for (const target of targets) {
      if (present.has(target.id) && !firstEvaluationTick.has(target.id)) {
        firstEvaluationTick.set(target.id, tick);
      }
    }
  }

  assert.equal(firstEvaluationTick.size, targets.length);
  assert.deepEqual(new Set(firstEvaluationTick.values()), new Set([0, 1, 2, 3, 4]));
  const diagnostics = spotting.getAttentionDiagnostics();
  assert.equal(diagnostics.eligibleCandidates, targets.length * 5);
  assert.equal(diagnostics.coldEvaluatedCandidates, targets.length);
  assert.equal(diagnostics.deferredCandidates, targets.length * 4);
  assert.equal(diagnostics.totalEvaluations, targets.length);
  assert.equal(diagnostics.coldCadenceTicks, 5);
  assert.equal(diagnostics.coldCadenceSeconds, 0.5);
  assert.equal(diagnostics.maximumInitialLatencySeconds, 0.4);

  diagnostics.totalEvaluations = -1;
  assert.equal(spotting.getAttentionDiagnostics().totalEvaluations, targets.length);
});

test('a phased cold evaluation receives one 0.1 second acquisition slice without retroactive credit', () => {
  const units = makeColdPair({ distance: 120 });
  const phased = makeSpotting();
  let first = null;
  for (let tick = 0; tick < 5 && !first; tick++) {
    phased.advance(units, CANONICAL_STEP_SECONDS);
    first = phased.getObservation('observer', 0, 'target');
  }
  assert.ok(first);

  const reference = makeSpotting();
  reference.advance(makeColdPair({ distance: 120 }), 0.100000001);
  const referenceObservation = reference.getObservation('observer', 0, 'target');
  assert.ok(referenceObservation);
  assert.ok(Math.abs(first.acquisition - referenceObservation.acquisition) < 2e-9);
  assert.ok(first.acquisition < 0.2);
});

test('close, moving, firing, and partially acquired pairs remain on the full 10 Hz path', () => {
  const cases = [
    {
      name: 'close',
      setup: () => makeColdPair({ distance: 20 })
    },
    {
      name: 'moving',
      setup: () => {
        const units = makeColdPair({ distance: 120 });
        units[0].roster[0].velocity = [1, 0, 0];
        return units;
      }
    },
    {
      name: 'recently firing',
      setup: () => {
        const units = makeColdPair({ distance: 120 });
        units[0].recentFireActivitySeconds = 0.2;
        return units;
      }
    },
    {
      name: 'moving target',
      setup: () => {
        const units = makeColdPair({ distance: 120 });
        units[1].roster[0].velocity = [1, 0, 0];
        return units;
      }
    },
    {
      name: 'recently firing target',
      setup: () => {
        const units = makeColdPair({ distance: 120 });
        units[1].recentFireActivitySeconds = 0.2;
        return units;
      }
    },
    {
      name: 'partial',
      setup: spotting => {
        const units = makeColdPair({ distance: 120 });
        for (let tick = 0; tick < 5
            && !spotting.getObservation('observer', 0, 'target'); tick++) {
          spotting.advance(units, CANONICAL_STEP_SECONDS);
        }
        assert.ok(spotting.getObservation('observer', 0, 'target').acquisition > 0);
        return units;
      }
    }
  ];

  for (const scenario of cases) {
    const spotting = makeSpotting();
    const units = scenario.setup(spotting);
    const before = spotting.getAttentionDiagnostics();
    advanceCanonical(spotting, units, 5);
    const after = spotting.getAttentionDiagnostics();
    assert.equal(after.totalEvaluations - before.totalEvaluations, 5, scenario.name);
    assert.equal(after.urgentCandidates - before.urgentCandidates, 5, scenario.name);
    assert.equal(after.deferredCandidates - before.deferredCandidates, 0, scenario.name);
  }
});

test('direct and grace-retained pairs stay at 10 Hz and an engaged target does not blink', () => {
  const directUnits = makeColdPair({ distance: 120 });
  const direct = makeSpotting({ baseAcquisitionSeconds: 0.2 });
  direct.advance(directUnits, 1);
  assert.equal(direct.getObservation('observer', 0, 'target').visibleNow, true);
  const beforeDirect = direct.getAttentionDiagnostics();
  for (let tick = 0; tick < 5; tick++) {
    direct.advance(directUnits, CANONICAL_STEP_SECONDS);
    assert.equal(direct.getObservation('observer', 0, 'target').visibleNow, true);
  }
  const afterDirect = direct.getAttentionDiagnostics();
  assert.equal(afterDirect.totalEvaluations - beforeDirect.totalEvaluations, 5);
  assert.equal(afterDirect.urgentCandidates - beforeDirect.urgentCandidates, 5);

  const graceUnits = makeColdPair({ distance: 120 });
  const grace = makeSpotting({
    baseAcquisitionSeconds: 0.2,
    lostAcquisitionDecayRate: 10
  });
  grace.advance(graceUnits, 1);
  graceUnits[1].position.x = 500;
  const beforeGrace = grace.getAttentionDiagnostics();
  grace.advance(graceUnits, CANONICAL_STEP_SECONDS);
  const missed = grace.getObservation('observer', 0, 'target');
  assert.equal(missed.acquisition, 0);
  assert.equal(missed.directEpisodeActive, false);
  assert.ok(missed.visibilityGraceRemainingNanoseconds > 0);
  advanceCanonical(grace, graceUnits, 4);
  const afterGrace = grace.getAttentionDiagnostics();
  assert.equal(afterGrace.totalEvaluations - beforeGrace.totalEvaluations, 5);
  assert.equal(afterGrace.urgentCandidates - beforeGrace.urgentCandidates, 5);
  assert.equal(grace.getObservation('observer', 0, 'target').visibilityGraceRemainingNanoseconds, 0);
});

test('stable IDs make reordered units and rosters mode-independent', () => {
  const observerRoster = [
    { id: 'b', role: 'RIFLEMAN', status: 'OK', health: 100, velocity: [0, 0, 0] },
    { id: 'a', role: 'RIFLEMAN', status: 'OK', health: 100, velocity: [0, 0, 0] }
  ];
  const realtimeUnits = [
    makeUnit({ id: 'observer', faction: 'blue', roster: observerRoster }),
    makeUnit({ id: 'target', faction: 'red', x: 120, morale: 'Broken' })
  ];
  const wegoUnits = [
    makeUnit({ id: 'target', faction: 'red', x: 120, morale: 'Broken' }),
    makeUnit({ id: 'observer', faction: 'blue', roster: [...observerRoster].reverse() })
  ];
  const realtime = makeSpotting();
  const wego = makeSpotting();

  advanceCanonical(realtime, realtimeUnits, 9);
  advanceCanonical(wego, wegoUnits, 9);

  assert.deepEqual(wego.captureState(), realtime.captureState());
  assert.deepEqual(wego.getAttentionDiagnostics(), realtime.getAttentionDiagnostics());
});

test('capture and restore reproduce the derived schedule at every phase offset', () => {
  for (let offset = 0; offset < 5; offset++) {
    const units = makeColdPair();
    const uninterrupted = makeSpotting();
    advanceCanonical(uninterrupted, units, offset);
    const restored = makeSpotting();
    restored.restoreState(uninterrupted.captureState());

    advanceCanonical(uninterrupted, units, 7);
    advanceCanonical(restored, [...units].reverse(), 7);
    assert.deepEqual(restored.captureState(), uninterrupted.captureState(), `offset ${offset}`);
  }
});

test('whole-step, 30 Hz, and 60 Hz public advances fail open to full evaluation', () => {
  const variants = [1, 30, 60].map(frequency => {
    const spotting = makeSpotting();
    const units = makeColdPair();
    for (let step = 0; step < frequency; step++) {
      spotting.advance(units, 1 / frequency);
    }
    return spotting;
  });

  assert.deepEqual(variants[1].captureState(), variants[0].captureState());
  assert.deepEqual(variants[2].captureState(), variants[0].captureState());
  assert.equal(variants[0].getAttentionDiagnostics().totalEvaluations, 1);
  assert.equal(variants[1].getAttentionDiagnostics().totalEvaluations, 30);
  assert.equal(variants[2].getAttentionDiagnostics().totalEvaluations, 60);
  assert.equal(variants[0].getAttentionDiagnostics().failOpenEvaluations, 1);
  assert.equal(variants[1].getAttentionDiagnostics().failOpenEvaluations, 30);
  assert.equal(variants[2].getAttentionDiagnostics().failOpenEvaluations, 60);
});

test('sub-nanosecond neighboring deltas and compensated boundaries fail open', () => {
  const exact = makeSpotting();
  exact.advance(makeColdPair(), CANONICAL_STEP_SECONDS);
  assert.equal(exact.getAttentionDiagnostics().canonicalSteps, 1);
  assert.equal(exact.getAttentionDiagnostics().failOpenSteps, 0);

  for (const neighboringDelta of [0.1000000004, 0.0999999996]) {
    const spotting = makeSpotting();
    const units = makeColdPair();
    spotting.advance(units, neighboringDelta);
    assert.equal(
      spotting.getAttentionDiagnostics().failOpenSteps,
      1,
      `initial ${neighboringDelta}`
    );
    assert.equal(spotting.getAttentionDiagnostics().failOpenEvaluations, 1);

    spotting.advance(units, CANONICAL_STEP_SECONDS);
    assert.equal(
      spotting.getAttentionDiagnostics().failOpenSteps,
      2,
      `compensated start after ${neighboringDelta}`
    );
    assert.equal(spotting.getAttentionDiagnostics().failOpenEvaluations, 2);
  }
});

test('casualty, Broken, and removed observers still clean up scheduled observation rows', () => {
  for (const disposition of ['casualty', 'Broken', 'removed']) {
    const units = makeColdPair({ distance: 60 });
    const spotting = makeSpotting();
    spotting.advance(units, 1);
    assert.equal(spotting.captureState().observations.length, 1);

    if (disposition === 'casualty') units[0].roster[0].health = 0;
    if (disposition === 'Broken') units[0].morale = 'Broken';
    const nextUnits = disposition === 'removed' ? [units[1]] : units;
    spotting.advance(nextUnits, CANONICAL_STEP_SECONDS);
    assert.equal(spotting.captureState().observations.length, 0, disposition);
  }
});
