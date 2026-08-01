import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFrance1940Family,
  FRANCE_1940_BATTLE_SETUP
} from '../src/content/france1940/index.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import {
  BATTLE_SETUP_AI_LEVELS,
  createConfiguredBattleScenario,
  resolveBattleForce,
  validateBattleSetupCatalog
} from '../src/scenario/BattleSetup.js';
import { createFamilyRegistry } from '../src/scenario/FamilyRegistry.js';
import {
  resolveScenarioUnitDefinitions
} from '../src/scenario/ScenarioRuntime.js';
import { renderBattleSetupMarkup } from '../src/ui/BattleSetupScreen.js';

const family = createFrance1940Family();
const familyRegistry = createFamilyRegistry([family]);
const catalog = FRANCE_1940_BATTLE_SETUP;

function packageSelection(factionId) {
  return {
    mode: 'package',
    packageId: catalog.defaultPackageByFaction[factionId],
    counts: {}
  };
}

function createScenario(overrides = {}) {
  return createConfiguredBattleScenario({
    mapDescriptor: STONNE_1940_MAP,
    family,
    catalog,
    playerFactionId: 'french',
    enemyFactionId: 'german',
    playerForceSelection: packageSelection('french'),
    enemyForceSelection: packageSelection('german'),
    enemyAiDifficulty: 'regular',
    ...overrides
  });
}

function assertInsideZone(unit, zone) {
  const [x, , z] = unit.position;
  assert.ok(x >= zone.minX && x <= zone.maxX, `${unit.id} x in zone`);
  assert.ok(z >= zone.minZ && z <= zone.maxZ, `${unit.id} z in zone`);
}

test('France 1940 battle setup catalog resolves registered package contents', () => {
  assert.equal(validateBattleSetupCatalog(catalog, family), catalog);

  const french = resolveBattleForce(
    catalog,
    'french',
    packageSelection('french')
  );
  const german = resolveBattleForce(
    catalog,
    'german',
    packageSelection('german')
  );

  assert.equal(french.totalUnits, 8);
  assert.deepEqual(
    french.entries.map(({ option, count }) => [option.id, count]),
    [
      ['formation:FRENCH_CHASSEURS_PORTES_PLATOON_HQ', 1],
      ['formation:FRENCH_CHASSEURS_PORTES_SQUAD', 2],
      ['formation:FRENCH_BRANDT_MLE1935_60MM_TEAM', 1],
      ['vehicle:SOMUA_S35', 2],
      ['vehicle:PANHARD_178', 1],
      ['vehicle:LAFFLY_S20TL', 1]
    ]
  );
  assert.equal(german.totalUnits, 8);
});

test('configured force packages restore selectable operational HQ units', () => {
  const scenario = createScenario();
  const frenchHq = scenario.units.find(unit =>
    unit.formationId === 'FRENCH_CHASSEURS_PORTES_PLATOON_HQ'
  );
  const germanHq = scenario.units.find(unit =>
    unit.formationId === 'GERMAN_GRENADIER_PLATOON_HQ_1940'
  );

  for (const headquarters of [frenchHq, germanHq]) {
    assert.ok(headquarters);
    assert.equal(headquarters.communications.radioInstalled, true);
    assert.deepEqual(
      headquarters.communications.radioOperatorSoldierIds,
      ['radio-operator']
    );
    assert.deepEqual(
      headquarters.soldierEquipment['radio-operator'],
      ['RADIO']
    );
  }
  assert.equal(scenario.initialSelectionUnitId, frenchHq.id);
  assert.ok(Object.isFrozen(frenchHq.communications.radioOperatorSoldierIds));
});

test('a la carte selection supports ten independent mortar teams', () => {
  const scenario = createScenario({
    playerForceSelection: {
      mode: 'custom',
      counts: {
        'formation:FRENCH_BRANDT_MLE1935_60MM_TEAM': 10
      }
    }
  });
  const playerUnits = scenario.units.filter(unit => unit.faction === 'french');

  assert.equal(playerUnits.length, 10);
  assert.ok(playerUnits.every(unit =>
    unit.formationId === 'FRENCH_BRANDT_MLE1935_60MM_TEAM'
  ));
  assert.equal(new Set(playerUnits.map(unit => unit.id)).size, 10);
  const resolved = resolveScenarioUnitDefinitions(scenario, familyRegistry);
  assert.equal(
    resolved.filter(unit => unit.faction === 'french').length,
    10
  );
  assert.ok(Object.isFrozen(scenario));
  assert.ok(Object.isFrozen(scenario.units));
});

test('configured forces deploy in faction zones and face each other', () => {
  const scenario = createScenario();
  const frenchUnits = scenario.units.filter(unit => unit.faction === 'french');
  const germanUnits = scenario.units.filter(unit => unit.faction === 'german');

  for (const unit of frenchUnits) {
    assertInsideZone(unit, STONNE_1940_MAP.deploymentZones.french);
    assert.ok(Math.abs(unit.rotation - Math.PI) < 1e-12);
  }
  for (const unit of germanUnits) {
    assertInsideZone(unit, STONNE_1940_MAP.deploymentZones.german);
    assert.ok(Math.abs(unit.rotation) < 1e-12);
  }

  const reversed = createScenario({
    playerFactionId: 'german',
    enemyFactionId: 'french',
    playerForceSelection: packageSelection('german'),
    enemyForceSelection: packageSelection('french')
  });
  assert.equal(reversed.playerFactionId, 'german');
  assert.equal(reversed.initialSelectionUnitId.startsWith('german-'), true);
  assert.ok(
    reversed.units
      .filter(unit => unit.faction === 'german')
      .every(unit => Math.abs(unit.rotation) < 1e-12)
  );
});

test('enemy difficulty applies existing deterministic soft factors', () => {
  const expected = {
    recruit: ['Green', -1],
    regular: ['Regular', 0],
    veteran: ['Veteran', 1],
    crack: ['Crack', 2]
  };

  for (const [difficultyId, [experience, leadership]] of Object.entries(expected)) {
    const scenario = createScenario({ enemyAiDifficulty: difficultyId });
    const enemy = scenario.units.filter(unit => unit.faction === 'german');
    const friendly = scenario.units.filter(unit => unit.faction === 'french');
    assert.equal(scenario.ai.difficultyId, difficultyId);
    assert.ok(enemy.every(unit =>
      unit.experience === experience && unit.leadership === leadership
    ));
    assert.ok(friendly.every(unit =>
      unit.experience === 'Regular' && unit.leadership === 0
    ));
  }
});

test('battle setup rejects illegal force combinations and counts', () => {
  assert.throws(
    () => createScenario({
      enemyFactionId: 'french',
      enemyForceSelection: packageSelection('french')
    }),
    /countries must be different/
  );
  assert.throws(
    () => resolveBattleForce(catalog, 'french', {
      mode: 'custom',
      counts: {}
    }),
    /requires at least one unit/
  );
  assert.throws(
    () => resolveBattleForce(catalog, 'french', {
      mode: 'custom',
      counts: { 'formation:GERMAN_GRENADIER_SQUAD_1940': 1 }
    }),
    /unavailable to french/
  );
  assert.throws(
    () => resolveBattleForce(catalog, 'french', {
      mode: 'custom',
      counts: { 'formation:FRENCH_CHASSEURS_PORTES_SQUAD': 21 }
    }),
    /exceeds 20/
  );
  assert.throws(
    () => createScenario({ enemyAiDifficulty: 'omniscient' }),
    /Unknown enemy AI difficulty/
  );
});

test('setup markup exposes Bridge, both selection modes, current AI, and launch', () => {
  const state = {
    step: 4,
    mapId: STONNE_1940_MAP.id,
    playerFactionId: 'french',
    enemyFactionId: 'german',
    enemyAiDifficulty: 'regular',
    playerForce: packageSelection('french'),
    enemyForce: packageSelection('german')
  };
  const markup = renderBattleSetupMarkup({
    maps: [{
      id: STONNE_1940_MAP.id,
      title: STONNE_1940_MAP.title
    }],
    catalog,
    aiLevels: BATTLE_SETUP_AI_LEVELS,
    state
  });

  assert.match(markup, />Bridge</);
  assert.match(markup, /Armored Cavalry Division - Forward Detachment/);
  assert.match(markup, /Regular \(Current\)/);
  assert.match(markup, /Start Battle/);

  const forceMarkup = renderBattleSetupMarkup({
    maps: [{
      id: STONNE_1940_MAP.id,
      title: STONNE_1940_MAP.title
    }],
    catalog,
    aiLevels: BATTLE_SETUP_AI_LEVELS,
    state: { ...state, step: 1 }
  });
  assert.match(forceMarkup, /Formation/);
  assert.match(forceMarkup, /A la carte/);
  assert.match(forceMarkup, /Country/);
});

test('initial setup header stays neutral and omits the numbered step bubbles', () => {
  const markup = renderBattleSetupMarkup({
    maps: [{
      id: STONNE_1940_MAP.id,
      title: STONNE_1940_MAP.title
    }],
    catalog,
    aiLevels: BATTLE_SETUP_AI_LEVELS,
    state: {
      step: 0,
      mapId: STONNE_1940_MAP.id,
      playerFactionId: 'french',
      enemyFactionId: 'german',
      enemyAiDifficulty: 'regular',
      playerForce: packageSelection('french'),
      enemyForce: packageSelection('german')
    }
  });

  assert.match(
    markup,
    /Choose a battlefield, configure both forces, and review the mission\./
  );
  assert.doesNotMatch(markup, /class="setup-matchup"/);
  assert.doesNotMatch(markup, /class="setup-steps"/);
  assert.doesNotMatch(markup, /🇫🇷 French\s*<\/span>\s*<b>VS<\/b>/);
});
