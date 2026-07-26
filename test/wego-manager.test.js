import test from 'node:test';
import assert from 'node:assert/strict';
import { WegoManager } from '../src/game/WegoManager.js';

function createHarness() {
  let stateVersion = 0;
  const restored = [];
  const game = {
    ui: null,
    captureSimulationState() {
      return { version: stateVersion++ };
    },
    restoreSimulationState(state) {
      restored.push(state.version);
    },
    simulateToTime(targetTime) {
      game.wego.currentTurnTime = targetTime;
    },
    beginMatch() {
      game.matchBegun = (game.matchBegun ?? 0) + 1;
    }
  };
  game.wego = new WegoManager(game);
  return { game, wego: game.wego, restored };
}

test('initial setup phase ends permanently when action begins, including realtime', () => {
  const { game, wego } = createHarness();
  assert.equal(wego.isSetupPhase(), true);
  wego.executeTurn();
  assert.equal(wego.isSetupPhase(), false);
  assert.equal(game.matchBegun, 1);
  wego.completeSimulationStep(60);
  assert.equal(wego.isSetupPhase(), false, 'later command turns are not deployment');

  const realtime = createHarness();
  realtime.wego.setPlayMode('realtime');
  assert.equal(realtime.wego.isSetupPhase(), false);
  assert.equal(realtime.game.matchBegun, 1);
});

test('playback speed scales simulation delta and records checkpoints', () => {
  const { wego } = createHarness();
  wego.executeTurn();
  wego.toggleFastSpeed();

  assert.equal(wego.playbackSpeed, 2);
  assert.equal(wego.getSimulationDelta(0.25), 0.5);

  wego.completeSimulationStep(1.1);
  assert.equal(wego.currentTurnTime, 1.1);
  assert.equal(wego.historySnapshots.length, 2);
});

test('rewind restores turn-start state and pauses playback', () => {
  const { wego, restored } = createHarness();
  wego.executeTurn();
  wego.completeSimulationStep(4);

  wego.rewindTurn();

  assert.deepEqual(restored, [0]);
  assert.equal(wego.currentTurnTime, 0);
  assert.equal(wego.phase, 'ACTION_PHASE');
  assert.equal(wego.isPlaying, false);
});

test('WEGO turn stops exactly at sixty simulated seconds', () => {
  const { wego } = createHarness();
  wego.executeTurn();
  wego.completeSimulationStep(60);

  assert.equal(wego.currentTurnTime, 60);
  assert.equal(wego.phase, 'COMMAND_PHASE');
  assert.equal(wego.isPlaying, false);
  assert.equal(wego.turnNumber, 2);
});

test('realtime runs beyond sixty seconds and cleanly returns to WEGO command phase', () => {
  const { wego } = createHarness();
  assert.equal(wego.setPlayMode('realtime'), true);
  assert.equal(wego.playMode, 'realtime');
  assert.equal(wego.phase, 'ACTION_PHASE');
  assert.equal(wego.isPlaying, true);

  wego.completeSimulationStep(75);
  assert.equal(wego.currentTurnTime, 75);
  assert.equal(wego.getSimulationDelta(0.25), 0.25);

  wego.setPlayMode('wego');
  assert.equal(wego.phase, 'COMMAND_PHASE');
  assert.equal(wego.isPlaying, false);
  assert.equal(wego.currentTurnTime, 0);
});

test('turn completion prunes executed orders before next command phase', () => {
  const { game, wego } = createHarness();
  let pruned = 0;
  game.units = [{ pruneCompletedWaypoints() { pruned++; } }];
  wego.executeTurn();
  wego.completeSimulationStep(60);
  assert.equal(pruned, 1);
});
