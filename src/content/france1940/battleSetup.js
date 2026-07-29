import { FRANCE_1940_FACTIONS } from './factions.js';
import { FRANCE_1940_FORMATIONS } from './formations.js';
import { FRANCE_1940_STRUCTURES } from './structures.js';
import { FRANCE_1940_VEHICLES } from './vehicles.js';

const SETUP_DATA_QUALITY =
  'game-scale force-selection package; names and counts are scenario design choices, not complete historical divisional TO&E';

function freezeEntries(entries) {
  return Object.freeze(entries.map(entry => Object.freeze({ ...entry })));
}

function formationOption(formation) {
  return Object.freeze({
    id: `formation:${formation.id}`,
    factionId: formation.factionId,
    kind: 'formation',
    recordId: formation.id,
    name: formation.name,
    description: `${formation.members.length} individual soldiers`,
    dataQuality: formation.dataQuality
  });
}

function vehicleOption(factionId, vehicle) {
  return Object.freeze({
    id: `vehicle:${vehicle.id}`,
    factionId,
    kind: 'vehicle',
    recordId: vehicle.id,
    name: vehicle.name,
    description: `${vehicle.crew.length}-crew vehicle`,
    dataQuality: vehicle.dataQuality?.crewArmorArmament
      ?? 'historical vehicle identity with gameplay-scale availability'
  });
}

const UNIT_OPTIONS = Object.freeze({
  ...Object.fromEntries(
    Object.values(FRANCE_1940_FORMATIONS)
      .map(formation => {
        const option = formationOption(formation);
        return [option.id, option];
      })
  ),
  ...Object.fromEntries(
    Object.values(FRANCE_1940_FACTIONS)
      .flatMap(faction => faction.vehicleIds.map(vehicleId => {
        const option = vehicleOption(
          faction.id,
          FRANCE_1940_VEHICLES[vehicleId]
        );
        return [option.id, option];
      }))
  ),
  'structure:GERMAN_MG34_BUNKER': Object.freeze({
    id: 'structure:GERMAN_MG34_BUNKER',
    factionId: 'german',
    kind: 'structure',
    recordId: 'GERMAN_MG34_BUNKER',
    name: FRANCE_1940_STRUCTURES.GERMAN_MG34_BUNKER.name,
    description: 'Static fortified MG position',
    dataQuality: FRANCE_1940_STRUCTURES.GERMAN_MG34_BUNKER.dataQuality
  })
});

function forcePackage(id, factionId, name, description, entries) {
  return Object.freeze({
    id,
    factionId,
    name,
    description,
    entries: freezeEntries(entries),
    dataQuality: SETUP_DATA_QUALITY
  });
}

export const FRANCE_1940_FORCE_PACKAGES = Object.freeze({
  'fr-armored-cavalry': forcePackage(
    'fr-armored-cavalry',
    'french',
    'Armored Cavalry Division - Forward Detachment',
    'Mobile combined-arms group scaled to the Bridge battlefield.',
    [
      { optionId: 'formation:FRENCH_CHASSEURS_PORTES_PLATOON_HQ', count: 1 },
      { optionId: 'formation:FRENCH_CHASSEURS_PORTES_SQUAD', count: 2 },
      { optionId: 'formation:FRENCH_BRANDT_MLE1935_60MM_TEAM', count: 1 },
      { optionId: 'vehicle:SOMUA_S35', count: 2 },
      { optionId: 'vehicle:PANHARD_178', count: 1 },
      { optionId: 'vehicle:LAFFLY_S20TL', count: 1 }
    ]
  ),
  'fr-light-tank-group': forcePackage(
    'fr-light-tank-group',
    'french',
    'Light Tank Group',
    'Mixed light tanks with mounted infantry support.',
    [
      { optionId: 'formation:FRENCH_CHASSEURS_PORTES_PLATOON_HQ', count: 1 },
      { optionId: 'formation:FRENCH_CHASSEURS_PORTES_SQUAD', count: 1 },
      { optionId: 'vehicle:RENAULT_R35', count: 2 },
      { optionId: 'vehicle:HOTCHKISS_H39', count: 2 },
      { optionId: 'vehicle:AMC_35', count: 1 }
    ]
  ),
  'fr-infantry-support': forcePackage(
    'fr-infantry-support',
    'french',
    'Infantry Support Group',
    'Infantry and mortars backed by one heavy breakthrough tank.',
    [
      { optionId: 'formation:FRENCH_CHASSEURS_PORTES_PLATOON_HQ', count: 1 },
      { optionId: 'formation:FRENCH_CHASSEURS_PORTES_SQUAD', count: 3 },
      { optionId: 'formation:FRENCH_BRANDT_MLE1935_60MM_TEAM', count: 2 },
      { optionId: 'vehicle:CHAR_B1_BIS', count: 1 }
    ]
  ),
  'ger-panzer-detachment': forcePackage(
    'ger-panzer-detachment',
    'german',
    'Panzer Division - Forward Detachment',
    'Mixed panzer group with grenadier support.',
    [
      { optionId: 'formation:GERMAN_GRENADIER_PLATOON_HQ_1940', count: 1 },
      { optionId: 'formation:GERMAN_GRENADIER_SQUAD_1940', count: 2 },
      { optionId: 'vehicle:PANZER_III_D', count: 2 },
      { optionId: 'vehicle:PANZER_II_C', count: 2 },
      { optionId: 'vehicle:PANZER_IV_D', count: 1 }
    ]
  ),
  'ger-recon-detachment': forcePackage(
    'ger-recon-detachment',
    'german',
    'Reconnaissance Detachment',
    'Armored cars, trucks, and grenadiers.',
    [
      { optionId: 'formation:GERMAN_GRENADIER_PLATOON_HQ_1940', count: 1 },
      { optionId: 'formation:GERMAN_GRENADIER_SQUAD_1940', count: 2 },
      { optionId: 'vehicle:SDKFZ_231', count: 2 },
      { optionId: 'vehicle:OPEL_BLITZ', count: 2 }
    ]
  ),
  'ger-strongpoint': forcePackage(
    'ger-strongpoint',
    'german',
    'Defensive Strongpoint',
    'Grenadiers and bunkers with one mobile reserve tank.',
    [
      { optionId: 'formation:GERMAN_GRENADIER_PLATOON_HQ_1940', count: 1 },
      { optionId: 'formation:GERMAN_GRENADIER_SQUAD_1940', count: 2 },
      { optionId: 'structure:GERMAN_MG34_BUNKER', count: 2 },
      { optionId: 'vehicle:PANZER_35T', count: 1 }
    ]
  )
});

export const FRANCE_1940_BATTLE_SETUP = Object.freeze({
  id: 'france-1940-battle-setup',
  gameFamilyId: 'france-1940',
  countries: Object.freeze({
    french: Object.freeze({
      id: 'french',
      name: 'France',
      flagGlyph: '🇫🇷'
    }),
    german: Object.freeze({
      id: 'german',
      name: 'Germany',
      flagGlyph: '🇩🇪'
    })
  }),
  unitOptions: UNIT_OPTIONS,
  forcePackages: FRANCE_1940_FORCE_PACKAGES,
  defaultPackageByFaction: Object.freeze({
    french: 'fr-armored-cavalry',
    german: 'ger-panzer-detachment'
  }),
  maximumUnitsPerSide: 39,
  maximumCountPerOption: 20,
  dataQuality: SETUP_DATA_QUALITY
});
