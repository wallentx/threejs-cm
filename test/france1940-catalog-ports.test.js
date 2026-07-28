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
  FRANCE_1940_STRUCTURES,
  getStructure
} from '../src/content/france1940/structures.js';
import {
  FRANCE_1940_WEAPONS
} from '../src/content/france1940/weapons.js';
import {
  STRUCTURES,
  getStructure as getCompatibilityStructure
} from '../src/game/StructureCatalog.js';

test('France 1940 catalog ports expose canonical frozen records and lookups', () => {
  assert.equal(FRANCE_1940_CATALOG_PORTS.familyId, 'france-1940');
  assert.equal(FRANCE_1940_CATALOG_PORTS.weapons.records, FRANCE_1940_WEAPONS);
  assert.equal(FRANCE_1940_CATALOG_PORTS.vehicles.records, FRANCE_1940_VEHICLES);
  assert.equal(FRANCE_1940_CATALOG_PORTS.structures.records, FRANCE_1940_STRUCTURES);
  assert.equal(FRANCE_1940_CATALOG_PORTS.weapons.get('MAS-36 Rifle').id, 'MAS36');
  assert.equal(FRANCE_1940_CATALOG_PORTS.weapons.idFromName('Kar98k'), 'KAR98K');
  assert.equal(FRANCE_1940_CATALOG_PORTS.vehicles.get('SOMUA_S35').modelId, 'fr_somua');
  assert.equal(
    FRANCE_1940_CATALOG_PORTS.vehicles.defaultIdForFaction('german'),
    'PANZER_III_D'
  );
  assert.equal(
    FRANCE_1940_CATALOG_PORTS.structures.get('GERMAN_MG34_BUNKER'),
    FRANCE_1940_STRUCTURES.GERMAN_MG34_BUNKER
  );
  assert.equal(Object.isFrozen(FRANCE_1940_CATALOG_PORTS), true);
  assert.equal(Object.isFrozen(FRANCE_1940_CATALOG_PORTS.weapons), true);
  assert.equal(Object.isFrozen(FRANCE_1940_CATALOG_PORTS.vehicles), true);
  assert.equal(Object.isFrozen(FRANCE_1940_CATALOG_PORTS.structures), true);
});

test('France 1940 structure catalog preserves the bunker record and strict identity', () => {
  const bunker = FRANCE_1940_STRUCTURES.GERMAN_MG34_BUNKER;

  assert.equal(STRUCTURES, FRANCE_1940_STRUCTURES);
  assert.equal(getStructure('GERMAN_MG34_BUNKER'), bunker);
  assert.equal(getCompatibilityStructure('GERMAN_MG34_BUNKER'), bunker);
  assert.equal(getStructure('UNKNOWN_STRUCTURE'), null);
  assert.equal(getStructure(null), null);
  for (const inheritedId of ['toString', 'constructor', '__proto__']) {
    assert.equal(getStructure(inheritedId), null);
    assert.equal(getCompatibilityStructure(inheritedId), null);
    assert.equal(FRANCE_1940_CATALOG_PORTS.structures.get(inheritedId), null);
  }
  assert.deepEqual(bunker, {
    hitRadius: 3.5,
    height: 2.6,
    health: 440,
    armorMm: 42,
    id: 'GERMAN_MG34_BUNKER',
    name: 'German MG34 bunker',
    weaponId: 'MG34',
    dataQuality: 'gameplay approximation: hit volume, reinforced-concrete resistance, and collapse threshold require scenario-specific source data',
    dimensionsMeters: {
      width: 6.5,
      depth: 5.5
    },
    destroyedFootprintMeters: {
      width: 5.6,
      depth: 4.8
    }
  });
  assert.equal(Object.isFrozen(FRANCE_1940_STRUCTURES), true);
  assert.equal(Object.isFrozen(bunker), true);
  assert.equal(Object.isFrozen(bunker.dimensionsMeters), true);
  assert.equal(Object.isFrozen(bunker.destroyedFootprintMeters), true);
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
    assert.doesNotMatch(
      source,
      /(?:WeaponCatalog|VehicleCatalog|StructureCatalog)\.js/
    );
  }
  const unitSource = sources[0];
  assert.match(unitSource, /config\.catalogPorts/);
  assert.match(unitSource, /this\.catalogPorts\.structures\.get/);
  assert.match(unitSource, /config\.visualFactories/);
  assert.match(unitSource, /Unit requires a stable id/);
  assert.match(unitSource, /requires a resolved roster/);
  assert.doesNotMatch(
    unitSource,
    /content\/france1940|LegacyFrance1940|LEGACY_FRANCE_1940|FRANCE_1940|Math\.random|MAS-36|Kar98k|french|german/
  );
  assert.match(sources[1], /unit\.catalogPorts/);
  assert.match(sources[3], /attacker\?\.catalogPorts/);
  assert.match(sources[4], /unit\.catalogPorts/);
});
