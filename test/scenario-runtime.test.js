import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  instantiateScenarioUnits,
  loadScenario
} from '../src/scenario/ScenarioRuntime.js';
import { STONNE_1940_SCENARIO } from '../src/scenarios/france1940/stonne1940.js';

class ScenarioTestUnit {
  constructor(definition) {
    Object.assign(this, definition);
    this.mesh = {
      position: {
        copy: position => {
          this.meshPosition = position.clone();
        }
      },
      userData: {}
    };
    this.debugEnabled = false;
  }

  setAgentDebug(enabled) {
    this.debugEnabled = enabled;
  }
}

test('Stonne scenario owns setup, roster, startup selection, and camera target as plain data', () => {
  assert.equal(STONNE_1940_SCENARIO.id, 'stonne-1940');
  assert.equal(STONNE_1940_SCENARIO.gameFamilyId, 'france-1940');
  assert.equal(STONNE_1940_SCENARIO.units.length, 18);
  assert.equal(
    new Set(STONNE_1940_SCENARIO.units.map(unit => unit.id)).size,
    STONNE_1940_SCENARIO.units.length
  );
  assert.ok(STONNE_1940_SCENARIO.units.every(unit => Array.isArray(unit.position)));
  assert.ok(
    STONNE_1940_SCENARIO.units
      .filter(unit => unit.faction === 'french')
      .every(unit => unit.rotation === Math.PI),
    'French setup zone is north of the battle and must face south (-Z)'
  );
  assert.ok(
    STONNE_1940_SCENARIO.units
      .filter(unit => unit.faction === 'german')
      .every(unit => unit.rotation === 0),
    'German setup zone is south of the battle and must face north (+Z)'
  );
  assert.ok(Object.isFrozen(STONNE_1940_SCENARIO));
  assert.ok(Object.isFrozen(STONNE_1940_SCENARIO.units));
});

test('scenario runtime instantiates, validates, grounds, and indexes units generically', () => {
  const added = [];
  const terrain = { getHeightAt: (x, z) => (x + z) * 0.01 };
  const scene = { add: mesh => added.push(mesh) };
  const loaded = loadScenario(STONNE_1940_SCENARIO, {
    terrain,
    scene,
    agentDebug: true,
    UnitType: ScenarioTestUnit
  });

  assert.equal(loaded.units.length, STONNE_1940_SCENARIO.units.length);
  assert.equal(added.length, loaded.units.length);
  assert.equal(loaded.initialSelection.id, STONNE_1940_SCENARIO.initialSelectionUnitId);
  assert.equal(loaded.cameraTarget.id, STONNE_1940_SCENARIO.cameraTargetUnitId);
  assert.ok(loaded.units.every(unit => unit.debugEnabled));
  assert.ok(loaded.units.every(unit => unit.position.y === terrain.getHeightAt(
    unit.position.x,
    unit.position.z
  )));
});

test('Stonne descriptor instantiates every production Unit model', () => {
  const units = instantiateScenarioUnits(STONNE_1940_SCENARIO);
  assert.equal(units.length, 18);
  assert.equal(units.find(unit => unit.id === 'fr_tank').mesh.name, 'fr_somua');
  assert.equal(units.find(unit => unit.id === 'ger_panzer4').mesh.name, 'ger_panzer4');
  assert.ok(units.every(unit => unit.mesh));
  assert.ok(units.every(unit => unit.mesh.rotation.y === unit.rotation));
});

test('scenario runtime rejects duplicate IDs before constructing units', () => {
  const duplicate = {
    ...STONNE_1940_SCENARIO,
    units: [
      STONNE_1940_SCENARIO.units[0],
      { ...STONNE_1940_SCENARIO.units[1], id: STONNE_1940_SCENARIO.units[0].id }
    ]
  };
  assert.throws(
    () => instantiateScenarioUnits(duplicate, ScenarioTestUnit),
    /duplicate unit id/
  );
});

test('scenario descriptor stays independent from Three.js and runtime modules', async () => {
  const source = await readFile(
    new URL('../src/scenarios/france1940/stonne1940.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /^import\s/m);
  assert.doesNotMatch(source, /THREE|UnitFactory|TerrainBuilder/);
});
