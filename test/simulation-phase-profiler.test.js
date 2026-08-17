import test from 'node:test';
import assert from 'node:assert/strict';
import { GameApp } from '../src/app/GameApp.js';
import {
  SIMULATION_PROFILE_PHASES,
  SimulationPhaseProfiler
} from '../src/engine/SimulationPhaseProfiler.js';

function withClock(samples, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let index = 0;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => samples[index++] }
  });
  try {
    callback();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'performance', descriptor);
    else delete globalThis.performance;
  }
}

function recordStep(profiler) {
  profiler.begin();
  for (const phase of SIMULATION_PROFILE_PHASES.slice(0, -1)) {
    profiler.mark(phase);
  }
  profiler.finish(SIMULATION_PROFILE_PHASES.at(-1));
}

test('simulation profiler enable/reset, bounded averages, phase accounting, and frame-step projection are exact', () => {
  const profiler = new SimulationPhaseProfiler(2);
  recordStep(profiler);
  assert.equal(profiler.snapshot().sampleCount, 0, 'disabled profiler must be inert');

  profiler.setEnabled(true);
  withClock([
    0, 1, 2, 3, 4, 5, 6,
    10, 12, 14, 16, 18, 20, 22,
    30, 33, 36, 39, 42, 45, 48
  ], () => {
    recordStep(profiler);
    recordStep(profiler);
    recordStep(profiler);
  });
  profiler.recordFrameSteps(3);
  const snapshot = profiler.snapshot();
  assert.equal(snapshot.sampleCount, 2);
  assert.equal(snapshot.averageStepMs, 15);
  assert.equal(snapshot.lastFrameSteps, 3);
  for (const phase of SIMULATION_PROFILE_PHASES) {
    assert.equal(snapshot.phaseMilliseconds[phase], 2.5);
  }
  assert.equal(
    Object.values(snapshot.phaseMilliseconds).reduce((sum, value) => sum + value, 0),
    snapshot.averageStepMs
  );
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.phaseMilliseconds), true);

  profiler.setEnabled(false);
  profiler.recordFrameSteps(99);
  recordStep(profiler);
  assert.deepEqual(profiler.snapshot(), snapshot);
  profiler.setEnabled(true);
  assert.deepEqual(profiler.snapshot(), {
    sampleCount: 0,
    averageStepMs: 0,
    lastFrameSteps: 0,
    phaseMilliseconds: Object.freeze(Object.fromEntries(
      SIMULATION_PROFILE_PHASES.map(phase => [phase, 0])
    ))
  });
});

test('presentation profiler samples never enter GameApp simulation capture state', () => {
  const profiler = new SimulationPhaseProfiler(2);
  profiler.setEnabled(true);
  withClock([0, 1, 2, 3, 4, 5, 6], () => recordStep(profiler));
  const app = Object.assign(Object.create(GameApp.prototype), {
    randomState: 123,
    objectiveSystem: null,
    enemyObjectivePlanner: null,
    units: [],
    buildingSystem: { captureState: () => ({ buildings: [] }) },
    terrain: { captureDestructibleObstacleState: () => ({ obstacles: [] }) },
    buildingInteraction: { captureState: () => ({ interactions: [] }) },
    spotting: { captureState: () => ({ contacts: [] }) },
    spottingStepper: { remainderSeconds: 0 },
    combat: { captureState: () => ({ projectiles: [] }) },
    support: { captureState: () => ({ missions: [] }) },
    selectedUnit: null,
    selectedUnits: [],
    inspectedUnit: null,
    matchStarted: false,
    simulationPhaseProfiler: profiler
  });
  const captured = app.captureSimulationState();
  assert.equal(captured.simulationPhaseProfiler, undefined);
  assert.equal(captured.performance, undefined);
  assert.equal(JSON.stringify(captured).includes('phaseMilliseconds'), false);
});
