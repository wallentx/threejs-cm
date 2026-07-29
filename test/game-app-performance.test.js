import test from 'node:test';
import assert from 'node:assert/strict';
import { GameApp } from '../src/app/GameApp.js';
import { FixedStepAccumulator } from '../src/simulation/FixedStepAccumulator.js';

test('frame visibility projection is reused until authoritative spotting changes', () => {
  const friendly = {
    id: 'friendly',
    mesh: { visible: false }
  };
  const enemy = {
    id: 'enemy',
    mesh: { visible: true }
  };
  let projectionCalls = 0;
  const game = Object.create(GameApp.prototype);
  game.playerFactionId = 'blue';
  game.units = [friendly, enemy];
  game.visibilityProjection = null;
  game.visibilityProjectionDirty = true;
  game.visibleUnitIdSet = new Set();
  game.spotting = {
    getVisibilityProjection() {
      projectionCalls++;
      return {
        viewerFaction: 'blue',
        visibleUnitIds: projectionCalls === 1
          ? ['friendly']
          : ['enemy'],
        contacts: []
      };
    }
  };

  const first = game.refreshVisibilityProjection();
  const cached = game.refreshVisibilityProjection();
  assert.equal(first, cached);
  assert.equal(projectionCalls, 1);
  assert.equal(friendly.mesh.visible, true);
  assert.equal(enemy.mesh.visible, false);

  game.visibilityProjectionDirty = true;
  const refreshed = game.refreshVisibilityProjection();
  assert.notEqual(refreshed, first);
  assert.equal(projectionCalls, 2);
  assert.equal(friendly.mesh.visible, false);
  assert.equal(enemy.mesh.visible, true);
});

test('authoritative observation samples at deterministic 10 Hz in realtime', () => {
  const calls = [];
  const game = Object.create(GameApp.prototype);
  game.units = [{ id: 'observer' }, { id: 'target' }];
  game.spottingStepper = new FixedStepAccumulator(1 / 10);
  game.visibilityProjectionDirty = false;
  game.spotting = {
    advance(units, delta) {
      calls.push({ units, delta });
    }
  };

  game.advanceSpotting(1 / 30);
  game.advanceSpotting(1 / 30);
  assert.deepEqual(calls, []);
  assert.equal(game.visibilityProjectionDirty, false);

  game.advanceSpotting(1 / 30);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].units, game.units);
  assert.equal(calls[0].delta, 0.1);
  assert.equal(game.spottingStepper.remainderSeconds, 0);
  assert.equal(game.visibilityProjectionDirty, true);
});
