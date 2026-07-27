import test from 'node:test';
import assert from 'node:assert/strict';
import { Minimap } from '../src/ui/Minimap.js';
import { SpottingSystem } from '../src/game/SpottingSystem.js';
import {
  createWeaponReportEvent
} from '../src/simulation/observation/SoundContacts.js';

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

test('minimap draws a displaced SOUND report without exposing the hidden shooter', () => {
  const canvas = recordingCanvas();
  const friendly = {
    id: 'friendly',
    faction: 'blue',
    type: 'infantry_squad',
    morale: 'OK',
    position: { x: 0, y: 0, z: 0 },
    roster: [{ id: 'listener', status: 'OK', health: 100 }],
    mesh: { visible: true }
  };
  const hiddenEnemy = {
    id: 'hidden-enemy',
    faction: 'red',
    type: 'infantry_squad',
    morale: 'OK',
    position: { x: 20, y: 0, z: -30 },
    roster: [{ id: 'shooter', status: 'OK', health: 100 }],
    mesh: { visible: true }
  };
  const event = createWeaponReportEvent({
    shotSequence: 3,
    sourceUnitId: hiddenEnemy.id,
    sourceFaction: hiddenEnemy.faction,
    weapon: { id: 'test-rifle', kind: 'rifle', caliberMm: 7.92 },
    origin: [hiddenEnemy.position.x, 1.4, hiddenEnemy.position.z]
  });
  const spotting = new SpottingSystem(null, null);
  spotting.recordAuditoryEvent(event, [hiddenEnemy, friendly]);
  const projection = spotting.getVisibilityProjection('blue', [friendly, hiddenEnemy]);
  const soundContact = projection.contacts[0];
  assert.notDeepEqual(soundContact.position, event.origin);
  assert.equal(soundContact.channel, 'SOUND');

  const runtime = {
    mapDimensions: { width: 240, depth: 240 },
    selectedUnit: null,
    getBocageObstacles: () => [],
    getFactionPresentation: factionId => ({
      selectionColor: factionId === 'blue' ? '#3b82f6' : '#ef4444'
    }),
    getVisibilityProjection: () => projection
  };
  const map = new Minimap(canvas, runtime);
  map.render([friendly, hiddenEnemy], null);

  assert.equal(canvas.calls.arcs.length, 1);
  assert.deepEqual(canvas.calls.arcs[0].slice(0, 2), [120, 120]);
  assert.equal(canvas.calls.ellipses.length, 1);
  assert.deepEqual(
    canvas.calls.ellipses[0].slice(0, 2),
    [120 + soundContact.position[0], 120 + soundContact.position[2]]
  );
});
