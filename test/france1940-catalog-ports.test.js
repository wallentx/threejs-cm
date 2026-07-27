import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FRANCE_1940_CATALOG_PORTS
} from '../src/content/france1940/catalogPorts.js';
import {
  FRANCE_1940_VEHICLES
} from '../src/content/france1940/vehicles.js';
import {
  FRANCE_1940_WEAPONS
} from '../src/content/france1940/weapons.js';

test('France 1940 catalog ports expose canonical frozen records and lookups', () => {
  assert.equal(FRANCE_1940_CATALOG_PORTS.familyId, 'france-1940');
  assert.equal(FRANCE_1940_CATALOG_PORTS.weapons.records, FRANCE_1940_WEAPONS);
  assert.equal(FRANCE_1940_CATALOG_PORTS.vehicles.records, FRANCE_1940_VEHICLES);
  assert.equal(FRANCE_1940_CATALOG_PORTS.weapons.get('MAS-36 Rifle').id, 'MAS36');
  assert.equal(FRANCE_1940_CATALOG_PORTS.weapons.idFromName('Kar98k'), 'KAR98K');
  assert.equal(FRANCE_1940_CATALOG_PORTS.vehicles.get('SOMUA_S35').modelId, 'fr_somua');
  assert.equal(
    FRANCE_1940_CATALOG_PORTS.vehicles.defaultIdForFaction('german'),
    'PANZER_III_D'
  );
  assert.equal(Object.isFrozen(FRANCE_1940_CATALOG_PORTS), true);
  assert.equal(Object.isFrozen(FRANCE_1940_CATALOG_PORTS.weapons), true);
  assert.equal(Object.isFrozen(FRANCE_1940_CATALOG_PORTS.vehicles), true);
});

test('generic runtime consumers require injected catalogs and Unit owns no family defaults', async () => {
  const paths = [
    '../src/game/Unit.js',
    '../src/game/SoldierAgent.js',
    '../src/game/VehicleSystems.js',
    '../src/game/CombatSystem.js',
    '../src/ui/UIManager.js',
    '../src/app/GameApp.js',
    '../src/main.js'
  ];
  const sources = await Promise.all(paths.map(path => (
    readFile(new URL(path, import.meta.url), 'utf8')
  )));

  for (const source of sources) {
    assert.doesNotMatch(source, /(?:WeaponCatalog|VehicleCatalog)\.js/);
  }
  const unitSource = sources[0];
  assert.match(unitSource, /config\.catalogPorts/);
  assert.match(unitSource, /config\.visualFactories/);
  assert.match(unitSource, /Unit requires a stable id/);
  assert.match(unitSource, /requires a resolved roster/);
  assert.doesNotMatch(
    unitSource,
    /LegacyFrance1940|LEGACY_FRANCE_1940|FRANCE_1940|Math\.random|MAS-36|Kar98k|french|german/
  );
  assert.match(sources[1], /unit\.catalogPorts/);
  assert.match(sources[3], /attacker\?\.catalogPorts/);
  assert.match(sources[4], /unit\.catalogPorts/);
});
