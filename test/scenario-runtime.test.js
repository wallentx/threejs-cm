import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  instantiateScenarioUnits,
  loadScenario,
  resolveScenarioUnitDefinitions
} from '../src/scenario/ScenarioRuntime.js';
import { Unit } from '../src/game/Unit.js';
import { createFamilyRegistry } from '../src/scenario/FamilyRegistry.js';
import { STONNE_1940_SCENARIO } from '../src/scenarios/france1940/stonne1940.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { createFrance1940Family } from '../src/content/france1940/index.js';
import {
  FRANCE_1940_CATALOG_PORTS
} from '../src/content/france1940/catalogPorts.js';
import {
  FRANCE_1940_VISUAL_FACTORIES
} from '../src/content/france1940/render/index.js';
import {
  FRANCE_1940_PRESENTATION
} from '../src/content/france1940/presentation.js';
import {
  FRANCE_1940_STRUCTURES
} from '../src/content/france1940/structures.js';
import {
  OBSERVATION_EQUIPMENT,
  observerHasEquipment
} from '../src/simulation/observation/ObservationEquipment.js';
import {
  hasOperationalRadioEndpoint
} from '../src/simulation/observation/CommunicationNetwork.js';

const PRODUCTION_FAMILY_REGISTRY = createFamilyRegistry([
  createFrance1940Family()
]);

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

const FRENCH_MEMBER_ORDER = Object.freeze([
  ['squad-leader', 'Chasseur', 'Squad Leader', 'MAS36'],
  ['rifleman-1', 'Chasseur', 'Rifleman', 'MAS36'],
  ['automatic-rifleman', 'Chasseur', 'Automatic Rifleman', 'FM2429'],
  ['rifleman-2', 'Chasseur', 'Rifleman', 'MAS36'],
  ['assistant-gunner', 'Chasseur', 'Assistant Gunner', 'MAS36'],
  ['assistant-leader', 'Chasseur', 'Assistant Leader', 'MAS38']
]);

const FAMILY_FIXTURE = Object.freeze({
  id: 'france-1940',
  factions: Object.freeze({
    french: Object.freeze({
      id: 'french',
      presentationId: 'france_1940_french'
    }),
    german: Object.freeze({
      id: 'german',
      presentationId: 'france_1940_german'
    })
  }),
  presentation: FRANCE_1940_PRESENTATION,
  formations: Object.freeze({
    FRENCH_SECTION: Object.freeze({
      factionId: 'french',
      members: Object.freeze(FRENCH_MEMBER_ORDER.map(([id, namePrefix, role, weaponId]) => Object.freeze({
        id,
        namePrefix,
        role,
        weaponId
      })))
    }),
    GERMAN_SECTION: Object.freeze({
      factionId: 'german',
      members: Object.freeze([
        Object.freeze({
          id: 'squad-leader',
          namePrefix: 'Grenadier',
          role: 'Squad Leader',
          weaponId: 'KAR98K'
        })
      ])
    })
  }),
  catalogs: Object.freeze({
    weapons: Object.freeze({
      MAS36: Object.freeze({ name: 'MAS-36 Rifle' }),
      FM2429: Object.freeze({ name: 'FM 24/29 LMG' }),
      MAS38: Object.freeze({ name: 'MAS-38 SMG' }),
      KAR98K: Object.freeze({ name: 'Kar98k' }),
      MG34: Object.freeze({ name: 'MG 34' })
    }),
    vehicles: Object.freeze({
      SOMUA_S35: Object.freeze({ factionId: 'french', modelId: 'fr_somua' }),
      PANZER_III_D: Object.freeze({ factionId: 'german', modelId: 'ger_panzer3' })
    }),
    structures: Object.freeze({
      GERMAN_MG34_BUNKER: Object.freeze({
        id: 'GERMAN_MG34_BUNKER',
        weaponId: 'MG34'
      })
    })
  })
});

function familyRegistry(family = FAMILY_FIXTURE) {
  return {
    require(id) {
      if (id !== family.id) throw new Error(`Unknown game family ${id}`);
      return family;
    }
  };
}

function scenarioFixture(units = null) {
  return {
    id: 'scenario-fixture',
    gameFamilyId: 'france-1940',
    units: units ?? [
      {
        id: 'fr_section',
        faction: 'french',
        type: 'infantry_squad',
        formationId: 'FRENCH_SECTION',
        position: [1, 0, 2],
        soldierEquipment: { 'squad-leader': ['BINOCULARS'] }
      },
      {
        id: 'fr_tank',
        faction: 'french',
        type: 'tank',
        vehicleId: 'SOMUA_S35',
        position: [3, 0, 4]
      },
      {
        id: 'ger_bunker',
        faction: 'german',
        type: 'bunker',
        structureId: 'GERMAN_MG34_BUNKER',
        position: [5, 0, 6]
      }
    ]
  };
}

test('Stonne scenario owns roster, startup selection, camera target, and map reference as plain data', () => {
  assert.equal(STONNE_1940_SCENARIO.id, 'stonne-1940');
  assert.equal(STONNE_1940_SCENARIO.gameFamilyId, 'france-1940');
  assert.equal(STONNE_1940_SCENARIO.mapId, STONNE_1940_MAP.id);
  assert.equal(Object.hasOwn(STONNE_1940_SCENARIO, 'deploymentZones'), false);
  assert.equal(STONNE_1940_SCENARIO.units.length, 19);
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
  assert.equal(STONNE_1940_SCENARIO.units.find(unit => unit.id === 'fr_hq').formationId, 'FRENCH_CHASSEURS_PORTES_SQUAD');
  assert.equal(STONNE_1940_SCENARIO.units.find(unit => unit.id === 'fr_sq1').formationId, 'FRENCH_CHASSEURS_PORTES_SQUAD');
  assert.equal(STONNE_1940_SCENARIO.units.find(unit => unit.id === 'ger_sq1').formationId, 'GERMAN_GRENADIER_SQUAD_1940');
  assert.equal(STONNE_1940_SCENARIO.units.find(unit => unit.id === 'fr_tank').vehicleId, 'SOMUA_S35');
  assert.equal(
    STONNE_1940_SCENARIO.units.find(unit => unit.id === 'fr_renault_d2').vehicleId,
    'RENAULT_D2'
  );
  assert.equal(STONNE_1940_SCENARIO.units.find(unit => unit.id === 'ger_tank').vehicleId, 'PANZER_III_D');
});

test('family resolver expands an ordered formation into a fresh authoritative roster', () => {
  const [infantry, vehicle, bunker] = resolveScenarioUnitDefinitions(
    scenarioFixture(),
    familyRegistry()
  );

  assert.deepEqual(
    infantry.roster.map(member => [member.id, member.name, member.role, member.weaponId, member.weapon]),
    [
      ['squad-leader', 'Chasseur 1', 'Squad Leader', 'MAS36', 'MAS-36 Rifle'],
      ['rifleman-1', 'Chasseur 2', 'Rifleman', 'MAS36', 'MAS-36 Rifle'],
      ['automatic-rifleman', 'Chasseur 3', 'Automatic Rifleman', 'FM2429', 'FM 24/29 LMG'],
      ['rifleman-2', 'Chasseur 4', 'Rifleman', 'MAS36', 'MAS-36 Rifle'],
      ['assistant-gunner', 'Chasseur 5', 'Assistant Gunner', 'MAS36', 'MAS-36 Rifle'],
      ['assistant-leader', 'Chasseur 6', 'Assistant Leader', 'MAS38', 'MAS-38 SMG']
    ]
  );
  assert.ok(infantry.roster.every(member => member.status === 'OK' && member.health === 100));
  assert.deepEqual(infantry.soldierEquipment, { 'squad-leader': ['BINOCULARS'] });
  assert.notEqual(infantry.soldierEquipment, scenarioFixture().units[0].soldierEquipment);
  assert.equal(vehicle.vehicleId, 'SOMUA_S35');
  assert.equal(bunker.vehicleId, undefined, 'bunkers validate faction but do not require vehicles');

  const nextResolution = resolveScenarioUnitDefinitions(scenarioFixture(), familyRegistry());
  assert.notEqual(infantry.roster, nextResolution[0].roster);
  infantry.roster[0].health = 1;
  assert.equal(nextResolution[0].roster[0].health, 100);
});

test('production resolver conserves and isolates assistant-gunner support feeds', () => {
  const first = resolveScenarioUnitDefinitions(
    STONNE_1940_SCENARIO,
    PRODUCTION_FAMILY_REGISTRY
  );
  const second = resolveScenarioUnitDefinitions(
    STONNE_1940_SCENARIO,
    PRODUCTION_FAMILY_REGISTRY
  );
  for (const [unitId, weaponId, feedRounds] of [
    ['fr_sq1', 'FM2429', 25],
    ['ger_sq1', 'MG34', 50]
  ]) {
    const firstUnit = first.find(unit => unit.id === unitId);
    const secondUnit = second.find(unit => unit.id === unitId);
    const donor = firstUnit.roster.find(member =>
      member.id === 'assistant-gunner');
    const recipient = firstUnit.roster.find(member =>
      member.id === 'automatic-rifleman');
    const weapon =
      PRODUCTION_FAMILY_REGISTRY.require('france-1940')
        .catalogs.weapons[weaponId];

    assert.equal(donor.supportAmmunitionTransfer.weaponId, weaponId);
    assert.equal(
      donor.supportAmmunitionTransfer.remainingRounds,
      feedRounds
    );
    assert.equal(
      recipient.magazineAmmo
        + recipient.reserveAmmo
        + donor.supportAmmunitionTransfer.remainingRounds,
      weapon.carriedAmmo
    );
    const secondDonor = secondUnit.roster.find(member =>
      member.id === 'assistant-gunner');
    assert.notEqual(
      donor.supportAmmunitionTransfer,
      secondDonor.supportAmmunitionTransfer
    );
    donor.supportAmmunitionTransfer.elapsedSeconds = 2;
    assert.equal(secondDonor.supportAmmunitionTransfer.elapsedSeconds, 0);
  }
});

test('formation reordering preserves stable soldier identity and equipment ownership', () => {
  const section = FAMILY_FIXTURE.formations.FRENCH_SECTION;
  const reorderedFamily = {
    ...FAMILY_FIXTURE,
    formations: {
      ...FAMILY_FIXTURE.formations,
      FRENCH_SECTION: {
        ...section,
        members: [
          section.members[2],
          section.members[0],
          ...section.members.slice(3),
          section.members[1]
        ]
      }
    }
  };
  const [resolved] = resolveScenarioUnitDefinitions(
    scenarioFixture([scenarioFixture().units[0]]),
    familyRegistry(reorderedFamily)
  );

  assert.deepEqual(
    resolved.roster.map(member => member.id),
    [
      'automatic-rifleman',
      'squad-leader',
      'rifleman-2',
      'assistant-gunner',
      'assistant-leader',
      'rifleman-1'
    ]
  );
  assert.equal(
    resolved.roster.find(member => member.id === 'squad-leader').role,
    'Squad Leader'
  );
  assert.deepEqual(resolved.soldierEquipment['squad-leader'], ['BINOCULARS']);
});

test('family validation rejects bad descriptors before any Unit construction', () => {
  let constructions = 0;
  class CountingUnit {
    constructor() {
      constructions += 1;
    }
  }
  const assertRejectedBeforeConstruction = (scenario, registry, pattern) => {
    constructions = 0;
    assert.throws(
      () => instantiateScenarioUnits(scenario, CountingUnit, registry),
      pattern
    );
    assert.equal(constructions, 0);
  };

  assertRejectedBeforeConstruction(
    scenarioFixture(),
    null,
    /requires a family registry/
  );
  assertRejectedBeforeConstruction(
    { ...scenarioFixture(), gameFamilyId: 'unknown-family' },
    familyRegistry(),
    /Unknown game family/
  );
  assertRejectedBeforeConstruction(
    scenarioFixture([{ ...scenarioFixture().units[0], faction: 'unknown' }]),
    familyRegistry(),
    /unknown faction/
  );
  assertRejectedBeforeConstruction(
    scenarioFixture([{ ...scenarioFixture().units[0], formationId: 'UNKNOWN_FORMATION' }]),
    familyRegistry(),
    /unknown formation/
  );
  assertRejectedBeforeConstruction(
    scenarioFixture([{ ...scenarioFixture().units[1], vehicleId: 'UNKNOWN_VEHICLE' }]),
    familyRegistry(),
    /unknown vehicle/
  );
  assertRejectedBeforeConstruction(
    scenarioFixture([{ ...scenarioFixture().units[1], faction: 'german' }]),
    familyRegistry(),
    /belongs to french, not german/
  );
  assertRejectedBeforeConstruction(
    scenarioFixture([{
      ...scenarioFixture().units[2],
      structureId: 'UNKNOWN_STRUCTURE'
    }]),
    familyRegistry(),
    /unknown structure UNKNOWN_STRUCTURE/
  );
  for (const inheritedStructureId of ['toString', 'constructor', '__proto__']) {
    assertRejectedBeforeConstruction(
      scenarioFixture([{
        ...scenarioFixture().units[2],
        structureId: inheritedStructureId
      }]),
      familyRegistry(),
      new RegExp(`unknown structure ${inheritedStructureId}`)
    );
  }
  assertRejectedBeforeConstruction(
    scenarioFixture([{
      ...scenarioFixture().units[0],
      soldierEquipment: { 'squad-leadr': ['BINOCULARS'] }
    }]),
    familyRegistry(),
    /equipment references unknown soldier squad-leadr/
  );
  assertRejectedBeforeConstruction(
    scenarioFixture([{
      ...scenarioFixture().units[0],
      communications: {
        commandNetId: 'french-test',
        radioInstalled: true,
        radioOperatorSoldierIds: ['assistant-leadr']
      }
    }]),
    familyRegistry(),
    /radio references unknown soldier assistant-leadr/
  );
});

test('resolved rosters are isolated and generic Units reject unported construction', () => {
  class MutatingUnit {
    constructor(definition) {
      this.receivedRoster = definition.roster;
      definition.roster[0].health = 7;
    }
  }
  const scenario = scenarioFixture([scenarioFixture().units[0]]);
  const [unit] = instantiateScenarioUnits(scenario, MutatingUnit, familyRegistry());
  assert.equal(unit.receivedRoster.length, 6);
  assert.equal(FAMILY_FIXTURE.formations.FRENCH_SECTION.members[0].weaponId, 'MAS36');
  assert.equal(resolveScenarioUnitDefinitions(scenario, familyRegistry())[0].roster[0].health, 100);

  assert.throws(
    () => instantiateScenarioUnits({
      ...scenario,
      gameFamilyId: undefined,
      units: [{ ...scenario.units[0], formationId: undefined }]
    }),
    /Unit requires weapon, vehicle, and structure catalog ports/
  );
});

test('scenario construction injects matching family visual factories before Unit creation', () => {
  const received = [];
  class PortAwareUnit {
    constructor(definition) {
      received.push(definition.visualFactories);
    }
  }

  instantiateScenarioUnits(
    scenarioFixture(),
    PortAwareUnit,
    familyRegistry(),
    { visualFactories: FRANCE_1940_VISUAL_FACTORIES }
  );
  assert.equal(received.length, scenarioFixture().units.length);
  assert.ok(received.every(value => value === FRANCE_1940_VISUAL_FACTORIES));

  const assertRejectedBeforeConstruction = (visualFactories, pattern) => {
    received.length = 0;
    assert.throws(
      () => instantiateScenarioUnits(
        scenarioFixture(),
        PortAwareUnit,
        familyRegistry(),
        { visualFactories }
      ),
      pattern
    );
    assert.equal(received.length, 0);
  };

  assertRejectedBeforeConstruction(
    {
      ...FRANCE_1940_VISUAL_FACTORIES,
      familyId: 'different-family'
    },
    /requires visual factories for france-1940, received different-family/
  );
  assertRejectedBeforeConstruction(
    {
      ...FRANCE_1940_VISUAL_FACTORIES,
      factionPresentation: {
        ...FRANCE_1940_VISUAL_FACTORIES.factionPresentation,
        french: {
          ...FRANCE_1940_VISUAL_FACTORIES.factionPresentation.french
        }
      }
    },
    /do not match registered presentation for faction french/
  );
  assertRejectedBeforeConstruction(
    {
      ...FRANCE_1940_VISUAL_FACTORIES,
      infantryMeshes: {}
    },
    /require infantry model french_1940_chasseur/
  );
  assertRejectedBeforeConstruction(
    {
      ...FRANCE_1940_VISUAL_FACTORIES,
      vehicleMeshes: {}
    },
    /require vehicle model fr_somua/
  );
  assertRejectedBeforeConstruction(
    {
      ...FRANCE_1940_VISUAL_FACTORIES,
      structureMeshes: {}
    },
    /require structure model GERMAN_MG34_BUNKER/
  );
});

test('scenario construction injects identity-matched catalog ports before Unit creation', () => {
  const received = [];
  class PortAwareUnit {
    constructor(definition) {
      received.push(definition.catalogPorts);
    }
  }

  instantiateScenarioUnits(
    STONNE_1940_SCENARIO,
    PortAwareUnit,
    PRODUCTION_FAMILY_REGISTRY,
    { catalogPorts: FRANCE_1940_CATALOG_PORTS }
  );
  assert.equal(received.length, STONNE_1940_SCENARIO.units.length);
  assert.ok(received.every(value => value === FRANCE_1940_CATALOG_PORTS));

  received.length = 0;
  assert.throws(
    () => instantiateScenarioUnits(
      STONNE_1940_SCENARIO,
      PortAwareUnit,
      PRODUCTION_FAMILY_REGISTRY,
      {
        catalogPorts: {
          ...FRANCE_1940_CATALOG_PORTS,
          familyId: 'different-family'
        }
      }
    ),
    /requires catalog ports for france-1940, received different-family/
  );
  assert.equal(received.length, 0);

  assert.throws(
    () => instantiateScenarioUnits(
      STONNE_1940_SCENARIO,
      PortAwareUnit,
      PRODUCTION_FAMILY_REGISTRY,
      {
        catalogPorts: {
          ...FRANCE_1940_CATALOG_PORTS,
          structures: undefined
        }
      }
    ),
    /require structures/
  );
  assert.equal(received.length, 0);

  assert.throws(
    () => instantiateScenarioUnits(
      STONNE_1940_SCENARIO,
      PortAwareUnit,
      PRODUCTION_FAMILY_REGISTRY,
      {
        catalogPorts: {
          ...FRANCE_1940_CATALOG_PORTS,
          structures: {
            ...FRANCE_1940_CATALOG_PORTS.structures,
            records: {}
          }
        }
      }
    ),
    /do not match registered structures/
  );
  assert.equal(received.length, 0);

  assert.throws(
    () => instantiateScenarioUnits(
      STONNE_1940_SCENARIO,
      PortAwareUnit,
      PRODUCTION_FAMILY_REGISTRY,
      {
        catalogPorts: {
          ...FRANCE_1940_CATALOG_PORTS,
          structures: {
            ...FRANCE_1940_CATALOG_PORTS.structures,
            get: id => ({
              ...FRANCE_1940_CATALOG_PORTS.structures.get(id)
            })
          }
        }
      }
    ),
    /structures\.get must return registered record/
  );
  assert.equal(received.length, 0);

  assert.throws(
    () => instantiateScenarioUnits(
      STONNE_1940_SCENARIO,
      PortAwareUnit,
      PRODUCTION_FAMILY_REGISTRY,
      {
        catalogPorts: {
          ...FRANCE_1940_CATALOG_PORTS,
          weapons: {
            ...FRANCE_1940_CATALOG_PORTS.weapons,
            records: {}
          }
        }
      }
    ),
    /do not match registered weapons/
  );
  assert.equal(received.length, 0);

  assert.throws(
    () => instantiateScenarioUnits(
      STONNE_1940_SCENARIO,
      PortAwareUnit,
      PRODUCTION_FAMILY_REGISTRY,
      {
        catalogPorts: {
          ...FRANCE_1940_CATALOG_PORTS,
          weapons: {
            ...FRANCE_1940_CATALOG_PORTS.weapons,
            get: id => ({
              ...FRANCE_1940_CATALOG_PORTS.weapons.get(id)
            })
          }
        }
      }
    ),
    /weapons\.get must return registered record/
  );
  assert.equal(received.length, 0);

  assert.throws(
    () => instantiateScenarioUnits(
      STONNE_1940_SCENARIO,
      PortAwareUnit,
      PRODUCTION_FAMILY_REGISTRY,
      {
        catalogPorts: {
          ...FRANCE_1940_CATALOG_PORTS,
          vehicles: {
            ...FRANCE_1940_CATALOG_PORTS.vehicles,
            defaultIdForFaction: () => 'NOT_A_VEHICLE'
          }
        }
      }
    ),
    /defaultIdForFaction returned invalid french vehicle NOT_A_VEHICLE/
  );
  assert.equal(received.length, 0);
});

test('Unit rejects a catalog port whose structure lookup changes after validation', () => {
  let lookupCount = 0;
  const changingStructurePort = Object.freeze({
    records: FRANCE_1940_STRUCTURES,
    get: id => {
      lookupCount += 1;
      const canonical = FRANCE_1940_STRUCTURES[id] ?? null;
      return lookupCount <= 1 || !canonical
        ? canonical
        : Object.freeze({ ...canonical });
    }
  });
  const received = [];
  class ConstructingUnit extends Unit {
    constructor(definition) {
      super(definition);
      received.push(this);
    }
  }

  assert.throws(
    () => instantiateScenarioUnits(
      scenarioFixture([scenarioFixture().units[2]]),
      ConstructingUnit,
      PRODUCTION_FAMILY_REGISTRY,
      {
        catalogPorts: Object.freeze({
          ...FRANCE_1940_CATALOG_PORTS,
          structures: changingStructurePort
        }),
        visualFactories: FRANCE_1940_VISUAL_FACTORIES
      }
    ),
    /requires canonical structure GERMAN_MG34_BUNKER/
  );
  assert.equal(received.length, 0);
});

test('generic Unit resolves a valid custom structure only through its injected port', () => {
  const canonicalFamily = createFrance1940Family();
  const customStructure = Object.freeze({
    ...FRANCE_1940_STRUCTURES.GERMAN_MG34_BUNKER,
    id: 'CUSTOM_PORT_BUNKER',
    name: 'Injected custom-port bunker'
  });
  const customStructures = Object.freeze({
    CUSTOM_PORT_BUNKER: customStructure
  });
  const customFamily = Object.freeze({
    ...canonicalFamily,
    catalogs: Object.freeze({
      ...canonicalFamily.catalogs,
      structures: customStructures
    })
  });
  const customCatalogPorts = Object.freeze({
    ...FRANCE_1940_CATALOG_PORTS,
    structures: Object.freeze({
      records: customStructures,
      get: id => customStructures[id] ?? null
    })
  });
  const customVisualFactories = Object.freeze({
    ...FRANCE_1940_VISUAL_FACTORIES,
    structureMeshes: Object.freeze({
      ...FRANCE_1940_VISUAL_FACTORIES.structureMeshes,
      CUSTOM_PORT_BUNKER:
        FRANCE_1940_VISUAL_FACTORIES.structureMeshes.GERMAN_MG34_BUNKER
    })
  });
  const customScenario = scenarioFixture([{
    ...scenarioFixture().units[2],
    structureId: 'CUSTOM_PORT_BUNKER'
  }]);

  const [bunker] = instantiateScenarioUnits(
    customScenario,
    undefined,
    createFamilyRegistry([customFamily]),
    {
      catalogPorts: customCatalogPorts,
      visualFactories: customVisualFactories
    }
  );

  assert.equal(bunker.structureSpec, customStructure);
  assert.equal(bunker.catalogPorts, customCatalogPorts);
  assert.equal(bunker.mesh.name, 'ger_Bunker');
});

test('scenario runtime instantiates, validates, grounds, and indexes units generically', () => {
  const added = [];
  const terrain = { getHeightAt: (x, z) => (x + z) * 0.01 };
  const scene = { add: mesh => added.push(mesh) };
  const loaded = loadScenario(STONNE_1940_SCENARIO, {
    terrain,
    scene,
    agentDebug: true,
    UnitType: ScenarioTestUnit,
    mapDescriptor: STONNE_1940_MAP,
    familyRegistry: PRODUCTION_FAMILY_REGISTRY,
    catalogPorts: FRANCE_1940_CATALOG_PORTS,
    visualFactories: FRANCE_1940_VISUAL_FACTORIES
  });

  assert.equal(loaded.units.length, STONNE_1940_SCENARIO.units.length);
  assert.equal(added.length, loaded.units.length);
  assert.equal(loaded.initialSelection.id, STONNE_1940_SCENARIO.initialSelectionUnitId);
  assert.equal(loaded.cameraTarget.id, STONNE_1940_SCENARIO.cameraTargetUnitId);
  assert.ok(loaded.units.every(unit => unit.debugEnabled));
  assert.ok(
    loaded.units.every(unit => unit.visualFactories === FRANCE_1940_VISUAL_FACTORIES)
  );
  assert.ok(loaded.units.every(unit => unit.catalogPorts === FRANCE_1940_CATALOG_PORTS));
  assert.equal(loaded.mapDescriptor, STONNE_1940_MAP);
  assert.ok(loaded.units.every(unit => unit.position.y === terrain.getHeightAt(
    unit.position.x,
    unit.position.z
  )));
});

test('Stonne descriptor instantiates every production Unit model', () => {
  const units = instantiateScenarioUnits(
    STONNE_1940_SCENARIO,
    undefined,
    PRODUCTION_FAMILY_REGISTRY,
    {
      catalogPorts: FRANCE_1940_CATALOG_PORTS,
      visualFactories: FRANCE_1940_VISUAL_FACTORIES
    }
  );
  assert.equal(units.length, 19);
  const frenchTank = units.find(unit => unit.id === 'fr_tank');
  const germanTank = units.find(unit => unit.id === 'ger_panzer4');
  const frenchInfantry = units.find(unit => unit.id === 'fr_hq');
  const germanInfantry = units.find(unit => unit.id === 'ger_sq1');
  const bunker = units.find(unit => unit.structureSpec);
  assert.equal(
    bunker.structureSpec,
    FRANCE_1940_STRUCTURES.GERMAN_MG34_BUNKER
  );
  assert.equal(frenchTank.mesh.name, 'fr_somua');
  assert.equal(germanTank.mesh.name, 'ger_panzer4');
  assert.equal(
    frenchTank.mesh.userData.selectionDisc.material.color.getHexString(),
    '3b82f6'
  );
  assert.equal(
    germanTank.mesh.userData.selectionDisc.material.color.getHexString(),
    'ef4444'
  );
  assert.equal(
    frenchInfantry.mesh.userData.selectionDisc.material.color.getHexString(),
    '3b82f6'
  );
  assert.equal(
    germanInfantry.mesh.userData.selectionDisc.material.color.getHexString(),
    'ef4444'
  );
  assert.equal(bunker.mesh.name, 'ger_Bunker');
  assert.deepEqual(
    frenchInfantry.roster.map(member => member.name),
    ['Chasseur 1', 'Chasseur 2', 'Chasseur 3', 'Chasseur 4', 'Chasseur 5', 'Chasseur 6']
  );
  assert.deepEqual(
    frenchInfantry.roster.map(member => member.id),
    [
      'squad-leader',
      'rifleman-1',
      'automatic-rifleman',
      'rifleman-2',
      'assistant-gunner',
      'assistant-leader'
    ]
  );
  assert.deepEqual(
    germanInfantry.roster.map(member => member.weaponId),
    ['KAR98K', 'KAR98K', 'MG34', 'KAR98K', 'KAR98K', 'MP40']
  );
  const headquarters = units.find(unit => unit.id === 'fr_hq');
  const headquartersProfile = STONNE_1940_SCENARIO.units.find(unit => unit.id === 'fr_hq');
  const squadLeader = headquarters.roster.find(member => member.id === 'squad-leader');
  assert.equal(
    observerHasEquipment(
      headquarters,
      squadLeader,
      OBSERVATION_EQUIPMENT.BINOCULARS,
      headquartersProfile
    ),
    true
  );
  assert.equal(hasOperationalRadioEndpoint(headquarters, headquartersProfile), true);
  const reorderedSnapshot = headquarters.soldierAI.captureRoster().reverse();
  reorderedSnapshot.find(member => member.id === 'squad-leader').health = 17;
  headquarters.soldierAI.restoreRoster(reorderedSnapshot);
  assert.equal(
    headquarters.roster.find(member => member.id === 'squad-leader').health,
    17,
    'rollback state follows stable member identity rather than array position'
  );
  assert.deepEqual(
    headquarters.roster.map(member => member.id),
    [
      'squad-leader',
      'rifleman-1',
      'automatic-rifleman',
      'rifleman-2',
      'assistant-gunner',
      'assistant-leader'
    ]
  );
  assert.ok(units.every(unit => unit.mesh));
  assert.ok(units.every(unit => unit.mesh.rotation.y === unit.rotation));
  assert.ok(units.every(unit => unit.mesh.userData.unitRoot === true));
  assert.ok(units.every(unit => unit.mesh.userData.unitId === unit.id));
});

test('production family ownership rejects cross-faction Stonne vehicles before construction', () => {
  let constructions = 0;
  class CountingUnit {
    constructor() {
      constructions += 1;
    }
  }
  const frenchVehicle = STONNE_1940_SCENARIO.units.find(unit => unit.id === 'fr_tank');
  const invalid = {
    ...STONNE_1940_SCENARIO,
    units: [{ ...frenchVehicle, faction: 'german' }]
  };

  assert.throws(
    () => instantiateScenarioUnits(invalid, CountingUnit, PRODUCTION_FAMILY_REGISTRY),
    /vehicle SOMUA_S35 does not belong to german/
  );
  assert.equal(constructions, 0);
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

test('scenario runtime rejects missing and mismatched maps before constructing units', () => {
  let constructions = 0;
  class CountingUnit extends ScenarioTestUnit {
    constructor(definition) {
      super(definition);
      constructions += 1;
    }
  }
  const options = {
    terrain: { getHeightAt: () => 0 },
    scene: { add() {} },
    UnitType: CountingUnit,
    familyRegistry: PRODUCTION_FAMILY_REGISTRY
  };

  assert.throws(
    () => loadScenario(STONNE_1940_SCENARIO, options),
    /requires map descriptor stonne-1940/
  );
  assert.equal(constructions, 0);
  assert.throws(
    () => loadScenario(STONNE_1940_SCENARIO, {
      ...options,
      mapDescriptor: { ...STONNE_1940_MAP, id: 'wrong-map' }
    }),
    /requires map stonne-1940, received wrong-map/
  );
  assert.equal(constructions, 0);
});

test('scenario descriptor stays independent from Three.js and runtime modules', async () => {
  const source = await readFile(
    new URL('../src/scenarios/france1940/stonne1940.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /THREE|UnitFactory|TerrainBuilder/);
  assert.match(source, /STONNE_1940_MAP/);
});
