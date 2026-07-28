import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createFamilyRegistry,
  validateFamilyDefinition
} from '../src/scenario/FamilyRegistry.js';
import { WEAPONS } from '../src/game/WeaponCatalog.js';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import { STRUCTURES } from '../src/game/StructureCatalog.js';
import {
  createFrance1940Family,
  FRANCE_1940_FACTIONS,
  FRANCE_1940_FORMATIONS,
  FRANCE_1940_PRESENTATION,
  FRANCE_1940_STRUCTURES,
  FRANCE_1940_VEHICLES,
  FRANCE_1940_WEAPONS
} from '../src/content/france1940/index.js';

function createFamily() {
  return createFrance1940Family({ vehicles: VEHICLES });
}

test('family registry registers injected family definitions without a singleton', () => {
  const family = createFamily();
  const first = createFamilyRegistry([family]);
  const second = createFamilyRegistry();

  assert.equal(first.has('france-1940'), true);
  assert.equal(first.get('france-1940'), family);
  assert.equal(first.require('france-1940'), family);
  assert.deepEqual(first.list(), [family]);
  assert.equal(Object.isFrozen(first.list()), true);
  assert.equal(second.has('france-1940'), false, 'registries must not share module state');
  assert.equal(second.get('france-1940'), null);
  assert.throws(() => second.require('france-1940'), /unknown family id/);
  assert.throws(() => first.register(family), /duplicate family id/);
});

test('family definition validates catalog and content references', () => {
  const family = createFamily();
  assert.equal(validateFamilyDefinition(family), family);

  const invalidFormation = {
    ...family,
    formations: {
      ...family.formations,
      FRENCH_CHASSEURS_PORTES_SQUAD: {
        ...family.formations.FRENCH_CHASSEURS_PORTES_SQUAD,
        members: [{ ...family.formations.FRENCH_CHASSEURS_PORTES_SQUAD.members[0], weaponId: 'MISSING' }]
      }
    }
  };
  assert.throws(() => validateFamilyDefinition(invalidFormation), /unknown weapon/);

  const invalidVehicle = {
    ...family,
    catalogs: {
      ...family.catalogs,
      vehicles: {
        ...family.catalogs.vehicles,
        SOMUA_S35: {
          ...family.catalogs.vehicles.SOMUA_S35,
          mainGun: { ap: 'MISSING' }
        }
      }
    }
  };
  assert.throws(() => validateFamilyDefinition(invalidVehicle), /mainGun\.ap references unknown weapon/);

  const invalidFaction = {
    ...family,
    factions: {
      ...family.factions,
      french: { ...family.factions.french, presentationId: 'MISSING' }
    }
  };
  assert.throws(() => validateFamilyDefinition(invalidFaction), /unknown presentation/);

  const invalidFormationFaction = {
    ...family,
    formations: {
      ...family.formations,
      FRENCH_CHASSEURS_PORTES_SQUAD: {
        ...family.formations.FRENCH_CHASSEURS_PORTES_SQUAD,
        factionId: 'MISSING'
      }
    }
  };
  assert.throws(() => validateFamilyDefinition(invalidFormationFaction), /unknown faction/);

  const invalidDefaultVehicle = {
    ...family,
    factions: {
      ...family.factions,
      french: { ...family.factions.french, defaultVehicleId: 'MISSING' }
    }
  };
  assert.throws(() => validateFamilyDefinition(invalidDefaultVehicle), /unknown default vehicle/);

  const invalidMount = {
    ...family,
    catalogs: {
      ...family.catalogs,
      vehicles: {
        ...family.catalogs.vehicles,
        SOMUA_S35: {
          ...family.catalogs.vehicles.SOMUA_S35,
          weaponMounts: [{ id: 'coax', weaponId: 'MISSING' }]
        }
      }
    }
  };
  assert.throws(() => validateFamilyDefinition(invalidMount), /mount coax references unknown weapon/);

  const missingStructures = {
    ...family,
    catalogs: {
      ...family.catalogs,
      structures: undefined
    }
  };
  assert.throws(
    () => validateFamilyDefinition(missingStructures),
    /structures must be a record keyed by stable IDs/
  );

  const malformedStructures = {
    ...family,
    catalogs: {
      ...family.catalogs,
      structures: []
    }
  };
  assert.throws(
    () => validateFamilyDefinition(malformedStructures),
    /structures must be a record keyed by stable IDs/
  );

  const invalidStructureWeapon = {
    ...family,
    catalogs: {
      ...family.catalogs,
      structures: {
        ...family.catalogs.structures,
        GERMAN_MG34_BUNKER: {
          ...family.catalogs.structures.GERMAN_MG34_BUNKER,
          weaponId: 'MISSING'
        }
      }
    }
  };
  assert.throws(
    () => validateFamilyDefinition(invalidStructureWeapon),
    /structure GERMAN_MG34_BUNKER references unknown weapon/
  );

  const duplicateVehicleOwner = {
    ...family,
    factions: {
      ...family.factions,
      french: {
        ...family.factions.french,
        vehicleIds: [...family.factions.french.vehicleIds, 'PANZER_III_D']
      }
    }
  };
  assert.throws(() => validateFamilyDefinition(duplicateVehicleOwner), /belongs to multiple factions/);

  const missingVehicleOwner = {
    ...family,
    factions: {
      ...family.factions,
      german: {
        ...family.factions.german,
        vehicleIds: family.factions.german.vehicleIds.filter(id => id !== 'PANZER_IV_D')
      }
    }
  };
  assert.throws(() => validateFamilyDefinition(missingVehicleOwner), /has no faction owner/);

  const unnamedFormationMember = {
    ...family,
    formations: {
      ...family.formations,
      FRENCH_CHASSEURS_PORTES_SQUAD: {
        ...family.formations.FRENCH_CHASSEURS_PORTES_SQUAD,
        namePrefix: undefined,
        members: [{
          ...family.formations.FRENCH_CHASSEURS_PORTES_SQUAD.members[0],
          name: undefined
        }]
      }
    }
  };
  assert.throws(() => validateFamilyDefinition(unnamedFormationMember), /requires a name or namePrefix/);

  const missingMemberId = {
    ...family,
    formations: {
      ...family.formations,
      FRENCH_CHASSEURS_PORTES_SQUAD: {
        ...family.formations.FRENCH_CHASSEURS_PORTES_SQUAD,
        members: [{
          ...family.formations.FRENCH_CHASSEURS_PORTES_SQUAD.members[0],
          id: undefined
        }]
      }
    }
  };
  assert.throws(() => validateFamilyDefinition(missingMemberId), /requires a stable id/);

  const duplicateMemberId = {
    ...family,
    formations: {
      ...family.formations,
      FRENCH_CHASSEURS_PORTES_SQUAD: {
        ...family.formations.FRENCH_CHASSEURS_PORTES_SQUAD,
        members: [
          family.formations.FRENCH_CHASSEURS_PORTES_SQUAD.members[0],
          {
            ...family.formations.FRENCH_CHASSEURS_PORTES_SQUAD.members[1],
            id: family.formations.FRENCH_CHASSEURS_PORTES_SQUAD.members[0].id
          }
        ]
      }
    }
  };
  assert.throws(() => validateFamilyDefinition(duplicateMemberId), /duplicate member id/);
});

test('family definition rejects stable key/id mismatches', () => {
  const family = createFamily();
  const invalid = {
    ...family,
    formations: {
      ...family.formations,
      FRENCH_CHASSEURS_PORTES_SQUAD: {
        ...family.formations.FRENCH_CHASSEURS_PORTES_SQUAD,
        id: 'WRONG_ID'
      }
    }
  };

  assert.throws(() => validateFamilyDefinition(invalid), /formations key\/id mismatch/);

  const invalidStructure = {
    ...family,
    catalogs: {
      ...family.catalogs,
      structures: {
        ...family.catalogs.structures,
        GERMAN_MG34_BUNKER: {
          ...family.catalogs.structures.GERMAN_MG34_BUNKER,
          id: 'WRONG_ID'
        }
      }
    }
  };
  assert.throws(
    () => validateFamilyDefinition(invalidStructure),
    /structures key\/id mismatch/
  );
});

test('family definition validates explicit support-ammunition allocations', () => {
  const family = createFamily();
  const formation =
    family.formations.FRENCH_CHASSEURS_PORTES_SQUAD;
  const transfer = formation.supportAmmunitionTransfers[0];
  const invalidFamily = replacement => ({
    ...family,
    formations: {
      ...family.formations,
      FRENCH_CHASSEURS_PORTES_SQUAD: {
        ...formation,
        supportAmmunitionTransfers: [replacement]
      }
    }
  });

  assert.throws(
    () => validateFamilyDefinition(invalidFamily({
      ...transfer,
      donorSoldierId: 'missing-donor'
    })),
    /unknown donor/
  );
  assert.throws(
    () => validateFamilyDefinition(invalidFamily({
      ...transfer,
      recipientSoldierId: transfer.donorSoldierId
    })),
    /donor and recipient must differ/
  );
  assert.throws(
    () => validateFamilyDefinition(invalidFamily({
      ...transfer,
      weaponId: 'MAS36'
    })),
    /recipient .* carries FM2429, not MAS36/
  );
  assert.throws(
    () => validateFamilyDefinition(invalidFamily({
      ...transfer,
      carriedRounds: 0
    })),
    /carriedRounds must be a positive integer/
  );
  assert.throws(
    () => validateFamilyDefinition(invalidFamily({
      ...transfer,
      handoffRounds: transfer.carriedRounds + 1
    })),
    /handoffRounds cannot exceed carriedRounds/
  );
  assert.throws(
    () => validateFamilyDefinition(invalidFamily({
      ...transfer,
      rangeMeters: Number.NaN
    })),
    /rangeMeters must be positive and finite/
  );
  assert.throws(
    () => validateFamilyDefinition(invalidFamily({
      ...transfer,
      dataQuality: 'unknown'
    })),
    /requires a historical, sourced, inferred, or approximation label/
  );

  const independent = {
    ...transfer,
    id: 'second-support-feed',
    donorSoldierId: 'rifleman-2',
    recipientSoldierId: 'rifleman-1',
    weaponId: 'MAS36',
    carriedRounds: 5,
    handoffRounds: 5
  };
  const invalidTransfers = transfers => ({
    ...family,
    formations: {
      ...family.formations,
      FRENCH_CHASSEURS_PORTES_SQUAD: {
        ...formation,
        supportAmmunitionTransfers: transfers
      }
    }
  });
  assert.throws(
    () => validateFamilyDefinition(invalidTransfers([
      transfer,
      { ...independent, id: transfer.id }
    ])),
    /duplicate support ammunition transfer id/
  );
  assert.throws(
    () => validateFamilyDefinition(invalidTransfers([
      transfer,
      { ...independent, donorSoldierId: transfer.donorSoldierId }
    ])),
    /multiple support ammunition transfers to donor/
  );
  assert.throws(
    () => validateFamilyDefinition(invalidTransfers([
      transfer,
      {
        ...independent,
        recipientSoldierId: transfer.recipientSoldierId,
        weaponId: transfer.weaponId
      }
    ])),
    /multiple support ammunition transfers to recipient/
  );
  assert.throws(
    () => validateFamilyDefinition(invalidTransfers([
      transfer,
      {
        ...independent,
        donorSoldierId: transfer.recipientSoldierId
      }
    ])),
    /reuses support ammunition endpoint automatic-rifleman/
  );
});

test('France 1940 owns canonical frozen catalogs and ignores obsolete adapters', () => {
  const weapons = {
    TEST_RIFLE: { id: 'TEST_RIFLE' }
  };
  const vehicles = {
    TEST_VEHICLE: { id: 'TEST_VEHICLE', mainGun: { ap: 'TEST_RIFLE' }, weaponMounts: [] }
  };
  const structures = {
    TEST_STRUCTURE: { id: 'TEST_STRUCTURE', weaponId: 'TEST_RIFLE' }
  };
  const family = createFrance1940Family({ weapons, vehicles, structures });

  assert.equal(Object.isFrozen(family), true);
  assert.equal(Object.isFrozen(family.catalogs), true);
  assert.equal(Object.isFrozen(FRANCE_1940_FACTIONS), true);
  assert.equal(Object.isFrozen(FRANCE_1940_FORMATIONS), true);
  assert.equal(Object.isFrozen(FRANCE_1940_PRESENTATION), true);
  assert.equal(Object.isFrozen(FRANCE_1940_FACTIONS.french.vehicleIds), true);
  assert.equal(family.catalogs.weapons, FRANCE_1940_WEAPONS);
  assert.equal(family.catalogs.weapons, WEAPONS, 'legacy shim must preserve catalog identity');
  assert.equal(family.catalogs.vehicles, FRANCE_1940_VEHICLES);
  assert.equal(family.catalogs.vehicles, VEHICLES, 'legacy shim must preserve catalog identity');
  assert.equal(family.catalogs.structures, FRANCE_1940_STRUCTURES);
  assert.equal(
    family.catalogs.structures,
    STRUCTURES,
    'legacy shim must preserve catalog identity'
  );
  assert.notEqual(family.catalogs.weapons, weapons, 'surplus transitional weapon injection is ignored');
  assert.notEqual(family.catalogs.vehicles, vehicles, 'surplus transitional vehicle injection is ignored');
  assert.notEqual(
    family.catalogs.structures,
    structures,
    'surplus transitional structure injection is ignored'
  );
  assert.equal(Object.isFrozen(weapons), false);
  assert.equal(Object.isFrozen(vehicles), false);
  assert.equal(Object.isFrozen(structures), false);
  assert.equal(weapons.TEST_RIFLE.id, 'TEST_RIFLE');
  assert.equal(vehicles.TEST_VEHICLE.id, 'TEST_VEHICLE');
  assert.equal(structures.TEST_STRUCTURE.id, 'TEST_STRUCTURE');
});

test('family registry and France content stay renderer and runtime independent', async () => {
  const sources = await Promise.all([
    '../src/scenario/FamilyRegistry.js',
    '../src/content/france1940/factions.js',
    '../src/content/france1940/formations.js',
    '../src/content/france1940/presentation.js',
    '../src/content/france1940/weapons.js',
    '../src/content/france1940/vehicles.js',
    '../src/content/france1940/structures.js',
    '../src/content/france1940/catalogPorts.js',
    '../src/content/france1940/index.js'
  ].map(path => readFile(new URL(path, import.meta.url), 'utf8')));

  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /^import\s.+?from\s+['"](?:three|.*\/(?:game|world|ui|main))(?:\/|['"])/m
    );
    assert.doesNotMatch(source, /\b(?:document|window|HTMLElement)\b/);
  }
});
