import test from 'node:test';
import assert from 'node:assert/strict';
import { Minimap } from '../src/ui/Minimap.js';

function recordingCanvas() {
  const calls = { arcs: [], ellipses: [], fills: [] };
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    fillRect(...args) { calls.fills.push(args); },
    strokeRect() {},
    beginPath() {},
    arc(...args) { calls.arcs.push(args); },
    ellipse(...args) { calls.ellipses.push(args); },
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    setLineDash() {}
  };
  return {
    width: 240,
    height: 240,
    getContext: () => context,
    calls
  };
}

test('minimap draws frozen reported contacts without exposing hidden live units', () => {
  const canvas = recordingCanvas();
  const game = {
    terrain: { bocageObstacles: [] },
    selectedUnit: null,
    visibilityProjection: {
      visibleUnitIds: ['friendly'],
      contacts: [{
        targetUnitId: 'hidden-enemy',
        position: [20, 0, -30],
        channel: 'RADIO',
        confidence: 0.6,
        uncertaintyM: 8
      }]
    }
  };
  const map = new Minimap(canvas, game);
  map.render([
    { id: 'friendly', faction: 'french', position: { x: 0, z: 0 }, mesh: { visible: true } },
    {
      id: 'hidden-enemy',
      faction: 'german',
      position: { x: 95, z: 95 },
      mesh: { visible: true }
    }
  ], null);

  assert.equal(canvas.calls.arcs.length, 1);
  assert.deepEqual(canvas.calls.arcs[0].slice(0, 2), [120, 120]);
  assert.equal(canvas.calls.ellipses.length, 1);
  assert.deepEqual(canvas.calls.ellipses[0].slice(0, 2), [140, 90]);
});

