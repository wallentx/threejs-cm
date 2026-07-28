import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceMortarFireMission,
  cancelMortarFireMission,
  captureMortarFireMissionState,
  createMortarFireMissionState,
  DEFAULT_MORTAR_FIRE_MISSION_CONFIG,
  getPendingMortarFireMissionShot,
  recordMortarFireMissionShot,
  recordMortarObservedImpact,
  requestMortarFireMission,
  restoreMortarFireMissionState
} from '../src/simulation/indirect/MortarFireMission.js';

const CONFIG = Object.freeze({
  ...DEFAULT_MORTAR_FIRE_MISSION_CONFIG,
  requestDelaySeconds: 1.5,
  correctionDelaySeconds: 2.25,
  correctionGain: 0.75,
  eventHistoryLimit: 32
});

const REQUEST = Object.freeze({
  missionId: 'mission-alpha',
  observerId: 'observer-one',
  teamId: 'mortar-one',
  targetId: 'target-crossroads',
  targetPoint: Object.freeze([100, 0, 60]),
  fireForEffectRounds: 3
});

function operationalContext(overrides = {}) {
  const base = {
    observer: {
      id: REQUEST.observerId,
      health: 100,
      status: 'OK',
      available: true
    },
    team: {
      id: REQUEST.teamId,
      available: true
    },
    target: {
      id: REQUEST.targetId,
      valid: true,
      observable: true
    },
    communications: {
      observerId: REQUEST.observerId,
      teamId: REQUEST.teamId,
      authorized: true,
      operational: true
    },
    trajectory: {
      solutionAvailable: true,
      horizontalRangeMeters: 120,
      minimumRangeMeters: 25,
      maximumRangeMeters: 600
    }
  };
  return {
    observer: { ...base.observer, ...overrides.observer },
    team: { ...base.team, ...overrides.team },
    target: { ...base.target, ...overrides.target },
    communications: {
      ...base.communications,
      ...overrides.communications
    },
    trajectory: { ...base.trajectory, ...overrides.trajectory }
  };
}

function advancePartition(state, totalSeconds, stepSeconds, context) {
  let elapsed = 0;
  while (elapsed < totalSeconds - 1e-12) {
    const delta = Math.min(stepSeconds, totalSeconds - elapsed);
    advanceMortarFireMission(state, CONFIG, delta, context);
    elapsed += delta;
  }
}

function beginMission(stepSeconds = CONFIG.requestDelaySeconds) {
  const state = createMortarFireMissionState(CONFIG);
  const context = operationalContext();
  assert.deepEqual(
    requestMortarFireMission(state, CONFIG, REQUEST, context),
    {
      accepted: true,
      reason: 'ACCEPTED',
      missionId: REQUEST.missionId
    }
  );
  advancePartition(
    state,
    CONFIG.requestDelaySeconds,
    stepSeconds,
    context
  );
  return { state, context };
}

function firePendingShot(state, context) {
  const pending = getPendingMortarFireMissionShot(state);
  assert.ok(pending);
  const result = recordMortarFireMissionShot(
    state,
    CONFIG,
    pending.shotId,
    context
  );
  assert.equal(result.accepted, true);
  return result.shot;
}

test('request, ranging, observed correction, fire-for-effect, and completion form one stable-ID lifecycle', () => {
  const { state, context } = beginMission(1 / 60);
  const ranging = getPendingMortarFireMissionShot(state);

  assert.deepEqual(ranging, {
    missionId: REQUEST.missionId,
    shotId: 'mission-alpha:ranging:1',
    kind: 'RANGING',
    roundIndex: 1,
    observerId: REQUEST.observerId,
    teamId: REQUEST.teamId,
    targetId: REQUEST.targetId,
    aimPoint: [100, 0, 60],
    correctionMeters: [0, 0]
  });

  firePendingShot(state, context);
  assert.equal(state.mission.phase, 'AWAITING_RANGING_OBSERVATION');

  const correction = recordMortarObservedImpact(
    state,
    CONFIG,
    {
      shotId: ranging.shotId,
      observerId: REQUEST.observerId,
      observed: true,
      impactPoint: [120, 0, 52]
    },
    context
  );
  assert.deepEqual(correction, {
    accepted: true,
    reason: 'CORRECTION_RECORDED',
    correctionMeters: [-15, 6],
    correctedAimPoint: [85, 0, 66]
  });
  assert.equal(state.mission.phase, 'CORRECTING');
  assert.equal(state.mission.lastObservedMissMeters, Math.hypot(20, 8));

  advancePartition(
    state,
    CONFIG.correctionDelaySeconds,
    1 / 120,
    context
  );
  assert.equal(state.mission.phase, 'FIRE_FOR_EFFECT');

  for (let index = 1; index <= REQUEST.fireForEffectRounds; index++) {
    const shot = firePendingShot(state, context);
    assert.equal(shot.shotId, `mission-alpha:effect:${index}`);
    assert.deepEqual(shot.aimPoint, [85, 0, 66]);
  }

  assert.equal(state.mission.phase, 'COMPLETE');
  assert.equal(state.mission.rangingShotsFired, 1);
  assert.equal(state.mission.fireForEffectShotsFired, 3);
  assert.deepEqual(
    state.events.map(event => event.type),
    [
      'MISSION_REQUESTED',
      'RANGING_SHOT_READY',
      'RANGING_SHOT_FIRED',
      'CORRECTION_RECORDED',
      'FIRE_FOR_EFFECT_SHOT_READY',
      'FIRE_FOR_EFFECT_SHOT_FIRED',
      'FIRE_FOR_EFFECT_SHOT_READY',
      'FIRE_FOR_EFFECT_SHOT_FIRED',
      'FIRE_FOR_EFFECT_SHOT_READY',
      'FIRE_FOR_EFFECT_SHOT_FIRED',
      'MISSION_COMPLETED'
    ]
  );
  assert.deepEqual(
    state.events.map(event => event.sequence),
    Array.from({ length: 11 }, (_, index) => index + 1)
  );
});

test('request coordinates and pending-shot projections never retain caller identity', () => {
  const state = createMortarFireMissionState(CONFIG);
  const context = operationalContext();
  const request = {
    ...REQUEST,
    missionId: 'mission-copy-proof',
    targetPoint: [100, 0, 60]
  };

  requestMortarFireMission(state, CONFIG, request, context);
  request.targetPoint[0] = 900;
  assert.deepEqual(state.mission.targetPoint, [100, 0, 60]);

  advanceMortarFireMission(
    state,
    CONFIG,
    CONFIG.requestDelaySeconds,
    context
  );
  const projection = getPendingMortarFireMissionShot(state);
  projection.aimPoint[0] = 700;
  projection.correctionMeters[0] = 700;
  assert.deepEqual(
    getPendingMortarFireMissionShot(state).aimPoint,
    [100, 0, 60]
  );
  assert.deepEqual(state.mission.correctionMeters, [0, 0]);
});

test('authorization, communications, observer, target, range, solution, and team gates reject explicitly', () => {
  const cases = [
    [
      { observer: { health: 0, status: 'KIA' } },
      'OBSERVER_UNAVAILABLE'
    ],
    [{ observer: { available: false } }, 'OBSERVER_UNAVAILABLE'],
    [{ communications: { authorized: false } }, 'NOT_AUTHORIZED'],
    [{ communications: { operational: false } }, 'COMMUNICATIONS_BROKEN'],
    [{ target: { valid: false } }, 'TARGET_INVALID'],
    [{ target: { observable: false } }, 'TARGET_UNOBSERVABLE'],
    [{ team: { available: false } }, 'TEAM_UNAVAILABLE'],
    [
      { trajectory: { solutionAvailable: false } },
      'NO_TRAJECTORY_SOLUTION'
    ],
    [{ trajectory: { horizontalRangeMeters: 24 } }, 'OUT_OF_RANGE'],
    [{ trajectory: { horizontalRangeMeters: 601 } }, 'OUT_OF_RANGE']
  ];

  for (const [overrides, expectedReason] of cases) {
    const state = createMortarFireMissionState(CONFIG);
    const result = requestMortarFireMission(
      state,
      CONFIG,
      REQUEST,
      operationalContext(overrides)
    );
    assert.deepEqual(result, {
      accepted: false,
      reason: expectedReason,
      missionId: REQUEST.missionId
    });
    assert.equal(state.mission, null);
    assert.deepEqual(state.events, []);
  }
});

test('gates are checked again before release and before acknowledging a real shot', () => {
  const state = createMortarFireMissionState(CONFIG);
  const context = operationalContext();
  requestMortarFireMission(state, CONFIG, REQUEST, context);

  advanceMortarFireMission(
    state,
    CONFIG,
    CONFIG.requestDelaySeconds,
    operationalContext({
      communications: { operational: false }
    })
  );
  assert.equal(state.mission.phase, 'CANCELLED');
  assert.equal(state.mission.cancellationReason, 'COMMUNICATIONS_BROKEN');

  const restarted = beginMission();
  const pending = getPendingMortarFireMissionShot(restarted.state);
  const rejected = recordMortarFireMissionShot(
    restarted.state,
    CONFIG,
    pending.shotId,
    operationalContext({ team: { available: false } })
  );
  assert.deepEqual(rejected, {
    accepted: false,
    reason: 'TEAM_UNAVAILABLE',
    shot: null
  });
  assert.deepEqual(
    getPendingMortarFireMissionShot(restarted.state),
    pending,
    'a rejected integration acknowledgement does not invent a fired round'
  );
});

test('unobserved or mismatched reports cannot create correction state', () => {
  const { state, context } = beginMission();
  const ranging = firePendingShot(state, context);

  assert.deepEqual(
    recordMortarObservedImpact(
      state,
      CONFIG,
      {
        shotId: ranging.shotId,
        observerId: REQUEST.observerId,
        observed: false,
        impactPoint: [102, 0, 60]
      },
      context
    ),
    { accepted: false, reason: 'IMPACT_UNOBSERVABLE' }
  );
  assert.deepEqual(
    recordMortarObservedImpact(
      state,
      CONFIG,
      {
        shotId: 'another-shot',
        observerId: REQUEST.observerId,
        observed: true,
        impactPoint: [102, 0, 60]
      },
      context
    ),
    { accepted: false, reason: 'OBSERVATION_ID_MISMATCH' }
  );
  assert.equal(state.mission.phase, 'AWAITING_RANGING_OBSERVATION');
  assert.deepEqual(state.mission.correctionMeters, [0, 0]);
});

test('fixed-step partitions and replay produce byte-equivalent mission state', () => {
  const simulate = stepSeconds => {
    const { state, context } = beginMission(stepSeconds);
    const ranging = firePendingShot(state, context);
    recordMortarObservedImpact(
      state,
      CONFIG,
      {
        shotId: ranging.shotId,
        observerId: REQUEST.observerId,
        observed: true,
        impactPoint: [112, 0, 64]
      },
      context
    );
    advancePartition(
      state,
      CONFIG.correctionDelaySeconds,
      stepSeconds,
      context
    );
    while (state.mission.phase === 'FIRE_FOR_EFFECT') {
      firePendingShot(state, context);
    }
    return captureMortarFireMissionState(state);
  };

  assert.deepEqual(simulate(1 / 60), simulate(1 / 120));
});

test('capture and restore are deep and replay the same next correction event and shot ID', () => {
  const { state, context } = beginMission();
  const ranging = firePendingShot(state, context);
  recordMortarObservedImpact(
    state,
    CONFIG,
    {
      shotId: ranging.shotId,
      observerId: REQUEST.observerId,
      observed: true,
      impactPoint: [104, 0, 54]
    },
    context
  );
  advanceMortarFireMission(state, CONFIG, 0.75, context);

  const snapshot = captureMortarFireMissionState(state);
  state.mission.targetPoint[0] = 999;
  state.mission.correctionMeters[0] = 999;
  state.events[0].targetPoint[0] = 999;

  const restored = restoreMortarFireMissionState(CONFIG, snapshot);
  assert.deepEqual(captureMortarFireMissionState(restored), snapshot);
  advanceMortarFireMission(
    restored,
    CONFIG,
    CONFIG.correctionDelaySeconds - 0.75,
    context
  );
  assert.equal(
    getPendingMortarFireMissionShot(restored).shotId,
    'mission-alpha:effect:1'
  );
  assert.deepEqual(
    getPendingMortarFireMissionShot(restored).aimPoint,
    [97, 0, 64.5]
  );

  const replay = restoreMortarFireMissionState(CONFIG, snapshot);
  advanceMortarFireMission(
    replay,
    CONFIG,
    CONFIG.correctionDelaySeconds - 0.75,
    context
  );
  assert.deepEqual(
    captureMortarFireMissionState(restored),
    captureMortarFireMissionState(replay)
  );
  assert.throws(
    () => restoreMortarFireMissionState(CONFIG, {
      ...snapshot,
      mission: {
        ...snapshot.mission,
        observerId: ''
      }
    }),
    /observerId/
  );
});

test('event history remains bounded while its stable sequence stays monotonic', () => {
  const boundedConfig = Object.freeze({
    ...CONFIG,
    eventHistoryLimit: 4
  });
  const state = createMortarFireMissionState(boundedConfig);
  const context = operationalContext();

  requestMortarFireMission(state, boundedConfig, REQUEST, context);
  advanceMortarFireMission(
    state,
    boundedConfig,
    boundedConfig.requestDelaySeconds,
    context
  );
  const ranging = getPendingMortarFireMissionShot(state);
  recordMortarFireMissionShot(
    state,
    boundedConfig,
    ranging.shotId,
    context
  );
  recordMortarObservedImpact(
    state,
    boundedConfig,
    {
      shotId: ranging.shotId,
      observerId: REQUEST.observerId,
      observed: true,
      impactPoint: [100, 0, 60]
    },
    context
  );
  advanceMortarFireMission(
    state,
    boundedConfig,
    boundedConfig.correctionDelaySeconds,
    context
  );
  while (state.mission.phase === 'FIRE_FOR_EFFECT') {
    const shot = getPendingMortarFireMissionShot(state);
    recordMortarFireMissionShot(
      state,
      boundedConfig,
      shot.shotId,
      context
    );
  }

  assert.equal(state.events.length, 4);
  assert.equal(state.eventSequence, 11);
  assert.deepEqual(
    state.events.map(event => event.sequence),
    [8, 9, 10, 11]
  );
});

test('cancellation clears pending fire without losing its reason or prior ordered events', () => {
  const { state } = beginMission();
  const result = cancelMortarFireMission(
    state,
    CONFIG,
    'OBSERVER_ORDERED_CANCEL'
  );

  assert.deepEqual(result, {
    cancelled: true,
    reason: 'OBSERVER_ORDERED_CANCEL',
    phase: 'CANCELLED'
  });
  assert.equal(state.mission.pendingShot, null);
  assert.equal(state.mission.cancellationReason, 'OBSERVER_ORDERED_CANCEL');
  assert.equal(state.events.at(-1).type, 'MISSION_CANCELLED');
  assert.deepEqual(
    cancelMortarFireMission(state, CONFIG),
    {
      cancelled: false,
      reason: 'NO_ACTIVE_MISSION',
      phase: 'CANCELLED'
    }
  );
});
