import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceMortarTeamState,
  canFireMortar,
  captureMortarTeamState,
  consumeMortarRound,
  createMortarTeamState,
  requestMortarDeployment,
  restoreMortarTeamState,
  solveHighAngleTrajectory
} from '../src/simulation/indirect/MortarTeam.js';

const CONFIG = Object.freeze({
  id: 'brandtmle1935-60mm-team',
  weaponId: 'BRANDT_MLE1935_60MM_HE',
  gunnerSoldierId: 'gunner',
  assistantSoldierId: 'assistant',
  ammunitionBySoldierId: Object.freeze({
    gunner: 2,
    assistant: 2,
    bearer: 4
  }),
  setupSeconds: 5,
  packSeconds: 3,
  reloadSeconds: 4.5,
  minimumRangeMeters: 25,
  maximumRangeMeters: 600,
  elevationDegrees: 65,
  minimumMuzzleVelocity: 18,
  maximumMuzzleVelocity: 75
});

const healthyRoster = () => [
  { id: 'gunner', health: 100, status: 'OK' },
  { id: 'assistant', health: 100, status: 'OK' },
  { id: 'bearer', health: 100, status: 'OK' }
];

function advancePartition(state, totalSeconds, stepSeconds) {
  let elapsed = 0;
  while (elapsed < totalSeconds - 1e-12) {
    const delta = Math.min(stepSeconds, totalSeconds - elapsed);
    advanceMortarTeamState(state, delta);
    elapsed += delta;
  }
}

test('high-angle mortar solution reaches the requested ground point without renderer state', () => {
  const solution = solveHighAngleTrajectory({
    origin: [0, 1.1, 0],
    target: [120, 0, 0],
    elevationDegrees: CONFIG.elevationDegrees,
    minimumMuzzleVelocity: CONFIG.minimumMuzzleVelocity,
    maximumMuzzleVelocity: CONFIG.maximumMuzzleVelocity
  });

  assert.ok(solution);
  assert.equal(solution.modelVersion, 'mortar-high-angle-v1');
  assert.equal(solution.horizontalRangeMeters, 120);
  assert.ok(solution.flightTimeSeconds > 5);
  assert.ok(solution.velocity[1] > 0);

  const [vx, vy, vz] = solution.velocity;
  const t = solution.flightTimeSeconds;
  assert.ok(Math.abs(vx * t - 120) < 1e-7);
  assert.ok(Math.abs(vz * t) < 1e-7);
  assert.ok(Math.abs(1.1 + vy * t - 0.5 * 9.81 * t * t) < 1e-7);
});

test('trajectory solver rejects degenerate, too-slow, and too-fast solutions', () => {
  assert.equal(solveHighAngleTrajectory({
    origin: [0, 0, 0],
    target: [0, 0, 0],
    elevationDegrees: 65,
    minimumMuzzleVelocity: 18,
    maximumMuzzleVelocity: 75
  }), null);
  assert.equal(solveHighAngleTrajectory({
    origin: [0, 1, 0],
    target: [2, 0, 0],
    elevationDegrees: 65,
    minimumMuzzleVelocity: 18,
    maximumMuzzleVelocity: 75
  }), null);
  assert.equal(solveHighAngleTrajectory({
    origin: [0, 1, 0],
    target: [1000, 0, 0],
    elevationDegrees: 65,
    minimumMuzzleVelocity: 18,
    maximumMuzzleVelocity: 75
  }), null);
});

test('deployment setup is deterministic across frame partitions', () => {
  const sixtyHz = createMortarTeamState(CONFIG);
  const thirtyHz = createMortarTeamState(CONFIG);
  requestMortarDeployment(sixtyHz, CONFIG);
  requestMortarDeployment(thirtyHz, CONFIG);

  advancePartition(sixtyHz, 5, 1 / 60);
  advancePartition(thirtyHz, 5, 1 / 30);

  assert.equal(sixtyHz.deploymentState, 'READY');
  assert.deepEqual(captureMortarTeamState(sixtyHz), captureMortarTeamState(thirtyHz));

  requestMortarDeployment(sixtyHz, CONFIG);
  advancePartition(sixtyHz, 3, 1 / 120);
  assert.equal(sixtyHz.deploymentState, 'PACKED');
});

test('reload cadence and ammunition consumption are fixed-step partition independent', () => {
  const simulate = stepSeconds => {
    const state = createMortarTeamState(CONFIG);
    const roster = healthyRoster();
    requestMortarDeployment(state, CONFIG);
    advanceMortarTeamState(state, 5);
    let elapsed = 0;
    while (elapsed < 13.5 - 1e-12) {
      if (canFireMortar(state, CONFIG, roster, 100).ready) {
        consumeMortarRound(state, CONFIG, roster);
      }
      const delta = Math.min(stepSeconds, 13.5 - elapsed);
      advanceMortarTeamState(state, delta);
      elapsed += delta;
    }
    if (canFireMortar(state, CONFIG, roster, 100).ready) {
      consumeMortarRound(state, CONFIG, roster);
    }
    return captureMortarTeamState(state);
  };

  const sixtyHz = simulate(1 / 60);
  const oneTwentyHz = simulate(1 / 120);
  assert.equal(sixtyHz.roundsFired, 4);
  assert.deepEqual(sixtyHz, oneTwentyHz);
});

test('gunner, assistant, accessible ammunition, setup, and range all gate fire', () => {
  const state = createMortarTeamState(CONFIG);
  const roster = healthyRoster();

  assert.equal(canFireMortar(state, CONFIG, roster, 100).reason, 'NOT_DEPLOYED');
  requestMortarDeployment(state, CONFIG);
  advanceMortarTeamState(state, 5);
  assert.equal(canFireMortar(state, CONFIG, roster, 24).reason, 'TOO_CLOSE');
  assert.equal(canFireMortar(state, CONFIG, roster, 601).reason, 'OUT_OF_RANGE');
  assert.equal(canFireMortar(state, CONFIG, roster, 100).ready, true);

  roster[0].health = 0;
  roster[0].status = 'KIA';
  assert.equal(canFireMortar(state, CONFIG, roster, 100).reason, 'NO_GUNNER');
  roster[0].health = 100;
  roster[0].status = 'OK';
  roster[1].health = 0;
  roster[1].status = 'KIA';
  assert.equal(canFireMortar(state, CONFIG, roster, 100).reason, 'NO_ASSISTANT');
});

test('rounds remain owned by stable soldiers and only living carriers feed the mortar', () => {
  const state = createMortarTeamState(CONFIG);
  const roster = healthyRoster();
  requestMortarDeployment(state, CONFIG);
  advanceMortarTeamState(state, 5);

  assert.deepEqual(consumeMortarRound(state, CONFIG, roster), {
    accepted: true,
    ownerSoldierId: 'gunner',
    roundsRemaining: 7
  });
  assert.equal(state.roundsBySoldierId.gunner, 1);
  assert.equal(state.reloadRemainingSeconds, 4.5);
  assert.equal(canFireMortar(state, CONFIG, roster, 100).reason, 'RELOADING');

  advanceMortarTeamState(state, 4.5);
  assert.equal(consumeMortarRound(state, CONFIG, roster).ownerSoldierId, 'gunner');
  assert.equal(state.roundsBySoldierId.gunner, 0);

  advanceMortarTeamState(state, 4.5);
  assert.equal(consumeMortarRound(state, CONFIG, roster).ownerSoldierId, 'assistant');
  advanceMortarTeamState(state, 4.5);
  assert.equal(consumeMortarRound(state, CONFIG, roster).ownerSoldierId, 'assistant');
  advanceMortarTeamState(state, 4.5);
  roster[2].health = 0;
  roster[2].status = 'KIA';
  assert.equal(
    canFireMortar(state, CONFIG, roster, 100).reason,
    'AMMUNITION_INACCESSIBLE'
  );
  assert.equal(
    state.roundsBySoldierId.bearer,
    4,
    'casualty-owned rounds are conserved'
  );
});

test('capture and restore are deep, validated, and replay the same next round owner', () => {
  const state = createMortarTeamState(CONFIG);
  requestMortarDeployment(state, CONFIG);
  advanceMortarTeamState(state, 5);
  const roster = healthyRoster();
  consumeMortarRound(state, CONFIG, roster);
  advanceMortarTeamState(state, 2.25);

  const snapshot = captureMortarTeamState(state);
  state.roundsBySoldierId.gunner = 0;
  state.reloadRemainingSeconds = 0;
  state.deploymentState = 'PACKED';
  const restored = restoreMortarTeamState(CONFIG, snapshot);

  assert.deepEqual(captureMortarTeamState(restored), snapshot);
  restored.roundsBySoldierId.gunner = 0;
  assert.equal(snapshot.roundsBySoldierId.gunner, 1);
  assert.throws(
    () => restoreMortarTeamState(CONFIG, {
      ...snapshot,
      weaponId: 'WRONG'
    }),
    /weaponId/
  );
});
