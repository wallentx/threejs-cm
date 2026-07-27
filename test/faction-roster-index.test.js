import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFactionRosterIndex } from '../src/app/FactionRosterIndex.js';

test('faction roster index preserves registered faction and live unit order', () => {
  const units = [
    { id: 'red-1', faction: 'red' },
    { id: 'blue-1', faction: 'blue' },
    { id: 'neutral-1', faction: 'neutral' },
    { id: 'red-2', faction: 'red' }
  ];
  const index = buildFactionRosterIndex(['blue', 'red', 'neutral'], units);

  assert.deepEqual(index.factionOrder, ['blue', 'red', 'neutral']);
  assert.deepEqual(index.unitsFor('red').map(unit => unit.id), ['red-1', 'red-2']);
  assert.deepEqual(
    index.opposingUnitsFor('red').map(unit => unit.id),
    ['blue-1', 'neutral-1']
  );
  assert.equal(index.unitsFor('missing'), null);
  assert.equal(index.opposingUnitsFor('missing'), null);
});

test('faction roster index rejects ambiguous or unregistered ownership', () => {
  assert.throws(
    () => buildFactionRosterIndex(['blue', 'blue'], []),
    /unique faction ids/
  );
  assert.throws(
    () => buildFactionRosterIndex(['blue', 'red'], [{ id: 'other-1', faction: 'other' }]),
    /other-1 has unregistered faction other/
  );
});
