// Pure family scenario data. Runtime and Three.js imports are intentionally absent.
import { STONNE_1940_MAP } from '../../maps/france/stonne.js';

const freezeUnit = unit => Object.freeze({
  experience: 'Regular',
  ...unit,
  position: Object.freeze([...unit.position]),
  communications: Object.freeze({
    commandNetId: `${unit.faction}-stonne`,
    ...(unit.communications ?? {}),
    radioOperatorRoles: Object.freeze([
      ...(unit.communications?.radioOperatorRoles ?? [])
    ]),
    radioOperatorSoldierIds: Object.freeze([
      ...(unit.communications?.radioOperatorSoldierIds ?? [])
    ])
  }),
  soldierEquipment: Object.freeze(Object.fromEntries(
    Object.entries(unit.soldierEquipment ?? {}).map(([soldierId, equipment]) => [
      soldierId,
      Object.freeze([...equipment])
    ])
  ))
});

export const STONNE_1940_SCENARIO = Object.freeze({
  id: 'stonne-1940',
  gameFamilyId: 'france-1940',
  title: 'Battle of Stonne, 1940',
  defaultSeed: 19400516,
  mapId: STONNE_1940_MAP.id,
  communicationNets: Object.freeze([
    Object.freeze({
      id: 'french-stonne',
      faction: 'french',
      dataQuality: 'scenario command-net grouping is a gameplay approximation'
    }),
    Object.freeze({
      id: 'german-stonne',
      faction: 'german',
      dataQuality: 'scenario command-net grouping is a gameplay approximation'
    })
  ]),
  initialSelectionUnitId: 'fr_hq',
  cameraTargetUnitId: 'fr_hq',
  units: Object.freeze([
    freezeUnit({
      id: 'fr_hq',
      name: 'French 3e DLM Platoon HQ',
      faction: 'french',
      type: 'infantry_squad',
      formationId: 'FRENCH_CHASSEURS_PORTES_SQUAD',
      position: [-18, 0, 70],
      rotation: Math.PI,
      experience: 'Veteran',
      leadership: 1,
      communications: {
        radioInstalled: true,
        radioOperatorSoldierIds: ['assistant-leader']
      },
      soldierEquipment: {
        'squad-leader': ['BINOCULARS'],
        'assistant-leader': ['RADIO']
      }
    }),
    freezeUnit({
      id: 'fr_sq1',
      name: 'Chasseurs Portés Squad 1',
      faction: 'french',
      type: 'infantry_squad',
      formationId: 'FRENCH_CHASSEURS_PORTES_SQUAD',
      position: [-42, 0, 70],
      rotation: Math.PI,
      soldierEquipment: { 'squad-leader': ['BINOCULARS'] }
    }),
    freezeUnit({
      id: 'fr_tank',
      name: 'SOMUA S35 (47mm)',
      faction: 'french',
      type: 'tank',
      vehicleId: 'SOMUA_S35',
      position: [6, 0, 70],
      rotation: Math.PI,
      experience: 'Veteran'
    }),
    freezeUnit({
      id: 'ger_sq1',
      name: '1940 Grenadier Squad',
      faction: 'german',
      type: 'infantry_squad',
      formationId: 'GERMAN_GRENADIER_SQUAD_1940',
      position: [42, 0, -70],
      experience: 'Veteran',
      rotation: 0,
      soldierEquipment: { 'squad-leader': ['BINOCULARS'] }
    }),
    freezeUnit({
      id: 'ger_tank',
      name: 'Panzer III Ausf. D',
      faction: 'german',
      type: 'tank',
      vehicleId: 'PANZER_III_D',
      position: [-6, 0, -70],
      rotation: 0
    }),
    freezeUnit({
      id: 'ger_bunker',
      name: 'German MG34 Bunker',
      faction: 'german',
      type: 'bunker',
      structureId: 'GERMAN_MG34_BUNKER',
      position: [18, 0, -70],
      experience: 'Crack',
      rotation: 0
    }),
    freezeUnit({
      id: 'fr_r35',
      name: 'Renault R35',
      faction: 'french',
      type: 'vehicle',
      vehicleId: 'RENAULT_R35',
      position: [-72, 0, 86],
      rotation: Math.PI
    }),
    freezeUnit({
      id: 'fr_h39',
      name: 'Hotchkiss H39',
      faction: 'french',
      type: 'vehicle',
      vehicleId: 'HOTCHKISS_H39',
      position: [-54, 0, 86],
      rotation: Math.PI
    }),
    freezeUnit({
      id: 'fr_amc35',
      name: 'AMC 35 (ACG-1)',
      faction: 'french',
      type: 'vehicle',
      vehicleId: 'AMC_35',
      position: [-36, 0, 86],
      rotation: Math.PI
    }),
    freezeUnit({
      id: 'fr_panhard178',
      name: 'Panhard 178 (AMD 35)',
      faction: 'french',
      type: 'vehicle',
      vehicleId: 'PANHARD_178',
      position: [-12, 0, 86],
      rotation: Math.PI
    }),
    freezeUnit({
      id: 'fr_renault_d2',
      name: 'Renault D2 (provisional blueprint model)',
      faction: 'french',
      type: 'vehicle',
      vehicleId: 'RENAULT_D2',
      position: [12, 0, 86],
      rotation: Math.PI,
      experience: 'Regular'
    }),
    freezeUnit({
      id: 'fr_laffly_s20tl',
      name: 'Laffly S20TL',
      faction: 'french',
      type: 'vehicle',
      vehicleId: 'LAFFLY_S20TL',
      position: [30, 0, 86],
      rotation: Math.PI
    }),
    freezeUnit({
      id: 'fr_char_b1bis',
      name: 'Char B1 bis',
      faction: 'french',
      type: 'vehicle',
      vehicleId: 'CHAR_B1_BIS',
      position: [60, 0, 86],
      rotation: Math.PI,
      experience: 'Veteran'
    }),
    freezeUnit({
      id: 'ger_panzer2',
      name: 'Panzer II Ausf. C',
      faction: 'german',
      type: 'vehicle',
      vehicleId: 'PANZER_II_C',
      position: [72, 0, -86],
      rotation: 0
    }),
    freezeUnit({
      id: 'ger_panzer35t',
      name: 'Panzer 35(t)',
      faction: 'german',
      type: 'vehicle',
      vehicleId: 'PANZER_35T',
      position: [54, 0, -86],
      rotation: 0
    }),
    freezeUnit({
      id: 'ger_panzer38t',
      name: 'Panzer 38(t)',
      faction: 'german',
      type: 'vehicle',
      vehicleId: 'PANZER_38T',
      position: [36, 0, -86],
      rotation: 0
    }),
    freezeUnit({
      id: 'ger_sdkfz231',
      name: 'Sd.Kfz. 231 (6-Rad)',
      faction: 'german',
      type: 'vehicle',
      vehicleId: 'SDKFZ_231',
      position: [12, 0, -86],
      rotation: 0
    }),
    freezeUnit({
      id: 'ger_opel_blitz',
      name: 'Opel Blitz 3.6-36S',
      faction: 'german',
      type: 'vehicle',
      vehicleId: 'OPEL_BLITZ',
      position: [-30, 0, -86],
      rotation: 0
    }),
    freezeUnit({
      id: 'ger_panzer4',
      name: 'Panzer IV Ausf. D',
      faction: 'german',
      type: 'vehicle',
      vehicleId: 'PANZER_IV_D',
      position: [-60, 0, -86],
      experience: 'Veteran',
      rotation: 0
    })
  ])
});
