import { createSomuaS35ArmorCollision } from './vehicleData/SomuaS35Shape.js';

function freezeCrew(crew) {
  return Object.freeze(crew.map(member => Object.freeze({ ...member })));
}

function freezeZones(zones) {
  return Object.freeze(Object.fromEntries(
    Object.entries(zones).map(([zone, roles]) => [zone, Object.freeze([...roles])])
  ));
}

function freezeMounts(mounts) {
  return Object.freeze(mounts.map(mount => Object.freeze({
    ...mount,
    crewRoles: Object.freeze([...(mount.crewRoles ?? [])]),
    loaderRoles: Object.freeze([...(mount.loaderRoles ?? mount.crewRoles ?? [])])
  })));
}

const faceZones = part => Object.freeze({
  positiveX: `${part}_side`,
  negativeX: `${part}_side`,
  positiveY: `${part}_top`,
  negativeY: `${part}_bottom`,
  positiveZ: `${part}_front`,
  negativeZ: `${part}_rear`
});

const fallbackZones = part => Object.freeze({
  positiveX: `${part}_side`,
  negativeX: `${part}_side`,
  positiveY: `${part}_side`,
  negativeY: `${part}_side`,
  positiveZ: `${part}_front`,
  negativeZ: `${part}_rear`
});

function freezeArmorVolume(volume) {
  return Object.freeze({
    ...volume,
    center: Object.freeze([...(volume.center ?? [0, 0, 0])]),
    offset: volume.offset ? Object.freeze([...volume.offset]) : undefined,
    halfExtents: volume.halfExtents
      ? Object.freeze([...volume.halfExtents])
      : undefined,
    interiorPoint: volume.interiorPoint
      ? Object.freeze([...volume.interiorPoint])
      : undefined,
    vertices: volume.vertices
      ? Object.freeze(volume.vertices.map(vertex => Object.freeze([...vertex])))
      : undefined,
    plates: volume.plates
      ? Object.freeze(volume.plates.map(plate => Object.freeze({
          ...plate,
          triangles: Object.freeze(
            plate.triangles.map(triangle => Object.freeze([...triangle]))
          )
        })))
      : undefined,
    faceZones: volume.faceZones
      ? Object.freeze({ ...volume.faceZones })
      : undefined,
    fallbackZones: volume.fallbackZones
      ? Object.freeze({ ...volume.fallbackZones })
      : undefined
  });
}

function defaultArmorCollision(vehicle) {
  const { length, width, height } = vehicle.dimensionsMeters;
  const quality = [
    'exact rigid-envelope bounds',
    'model-local named surfaces',
    'hull/turret proportions are gameplay approximations pending per-plate slope authoring'
  ].join('; ');
  if (!vehicle.mainGun) {
    return {
      version: 'named-obb-plates-v1',
      quality,
      volumes: [
        {
          id: 'hull-cab',
          part: 'hull',
          center: [0, height * 0.5, length * 0.30],
          halfExtents: [width * 0.5, height * 0.5, length * 0.20],
          faceZones: faceZones('hull'),
          fallbackZones: fallbackZones('hull')
        },
        {
          id: 'hull-cargo',
          part: 'hull',
          center: [0, height * 0.34, -length * 0.16],
          halfExtents: [width * 0.5, height * 0.34, length * 0.30],
          faceZones: faceZones('hull'),
          fallbackZones: fallbackZones('hull')
        }
      ]
    };
  }

  const hullHeight = height * 0.64;
  const turretHeight = height - hullHeight;
  return {
    version: 'named-obb-plates-v1',
    quality,
    volumes: [
      {
        id: 'hull-primary',
        part: 'hull',
        center: [0, hullHeight * 0.5, 0],
        halfExtents: [width * 0.5, hullHeight * 0.5, length * 0.5],
        faceZones: faceZones('hull'),
        fallbackZones: fallbackZones('hull')
      },
      {
        id: 'turret-primary',
        part: 'turret',
        center: [0, hullHeight + turretHeight * 0.5, length * 0.04],
        halfExtents: [width * 0.32, turretHeight * 0.5, length * 0.18],
        followsTurret: true,
        faceZones: faceZones('turret'),
        fallbackZones: fallbackZones('turret')
      }
    ]
  };
}

function freezeArmorCollision(vehicle) {
  const source = vehicle.armorCollision ?? defaultArmorCollision(vehicle);
  return Object.freeze({
    ...source,
    volumes: Object.freeze(source.volumes.map(freezeArmorVolume))
  });
}

function freezeInternalVolume(volume) {
  return Object.freeze({
    ...volume,
    center: Object.freeze([...(volume.center ?? [0, 0, 0])]),
    offset: volume.offset ? Object.freeze([...volume.offset]) : undefined,
    halfExtents: Object.freeze([...(volume.halfExtents ?? [0, 0, 0])]),
    crewRoles: volume.crewRoles
      ? Object.freeze([...volume.crewRoles])
      : undefined
  });
}

function freezeInternalLayout(vehicle) {
  if (!vehicle.internalLayout) return null;
  return Object.freeze({
    ...vehicle.internalLayout,
    volumes: Object.freeze(vehicle.internalLayout.volumes.map(freezeInternalVolume))
  });
}

function freezeVehicle(vehicle) {
  return Object.freeze({
    ...vehicle,
    crew: freezeCrew(vehicle.crew),
    driverRoles: Object.freeze([...(vehicle.driverRoles ?? ['DRIVER'])]),
    gunnerRoles: Object.freeze([...(vehicle.gunnerRoles ?? [])]),
    loaderRoles: Object.freeze([...(vehicle.loaderRoles ?? [])]),
    mainGun: vehicle.mainGun ? Object.freeze({ ...vehicle.mainGun }) : null,
    ammunition: Object.freeze({ ap: 0, he: 0, ...vehicle.ammunition }),
    movementMps: Object.freeze({ ...vehicle.movementMps }),
    dimensionsMeters: Object.freeze({ ...vehicle.dimensionsMeters }),
    armorMm: Object.freeze({ ...vehicle.armorMm }),
    armorCollision: freezeArmorCollision(vehicle),
    internalLayout: freezeInternalLayout(vehicle),
    zoneCrew: freezeZones(vehicle.zoneCrew),
    weaponMounts: freezeMounts(vehicle.weaponMounts ?? VEHICLE_MACHINE_GUN_MOUNTS[vehicle.id] ?? []),
    communications: Object.freeze({
      radioInstalled: false,
      operatorRoles: Object.freeze([]),
      dataQuality: 'explicitly not installed in the represented vehicle',
      ...(vehicle.communications ?? {}),
      operatorRoles: Object.freeze([...(vehicle.communications?.operatorRoles ?? [])])
    }),
    observationEquipment: Object.freeze({
      binocularRoles: Object.freeze([]),
      dataQuality: 'gameplay approximation',
      ...(vehicle.observationEquipment ?? {}),
      binocularRoles: Object.freeze([...(vehicle.observationEquipment?.binocularRoles ?? [])])
    }),
    dataQuality: Object.freeze({ ...vehicle.dataQuality })
  });
}

const crewman = (role, label) => ({ role, label });
const machineGunMount = (
  id,
  label,
  weaponId,
  crewRoles,
  carriedAmmo,
  dataQuality,
  referenceUrl = null,
  loaderRoles = crewRoles
) => ({
  id,
  label,
  weaponId,
  componentId: id,
  crewRoles,
  loaderRoles,
  carriedAmmo,
  traverse: id === 'coax' ? 'turret' : 'hull',
  dataQuality,
  referenceUrl
});
const armor = (hullFront, hullSide, hullRear, turretFront, turretSide, turretRear) => ({
  hull_front: hullFront,
  hull_side: hullSide,
  hull_rear: hullRear,
  turret_front: turretFront,
  turret_side: turretSide,
  turret_rear: turretRear
});
const SOMUA_S35_ARMOR = armor(40, 40, 35, 40, 40, 40);
const movement = (move, quick, fast, hunt) => ({ MOVE: move, QUICK: quick, FAST: fast, HUNT: hunt });
const communications = (radioInstalled, operatorRoles, dataQuality) => ({
  radioInstalled,
  operatorRoles,
  dataQuality
});
const observationEquipment = binocularRoles => ({
  binocularRoles,
  dataQuality: 'role-based gameplay approximation; no optical precision is asserted'
});

const FRENCH_ARMAMENT_REFERENCE = 'https://www.chars-francais.net/index.php?catid=13&id=2026%3A1935-somua-s-35&view=article';
const GERMAN_ARMAMENT_REFERENCE = 'https://tankmuseum.org/article/live-round-panzer-iii';
const SOMUA_REFERENCE = 'https://museedesblindes.fr/les_chars/somua-s35/';

const SOMUA_S35_INTERNAL_LAYOUT = Object.freeze({
  version: 'model-local-obb-path-v1',
  maxPathMeters: 5.7,
  entryOffsetMeters: 0.015,
  dataQuality: [
    'historical crew roles and rear engine compartment',
    'model-local crew and module bounds are bounded gameplay approximations',
    'not an assertion of exact stowage or anatomical position'
  ].join('; '),
  referenceUrl: SOMUA_REFERENCE,
  volumes: [
    {
      id: 'crew-driver',
      kind: 'crew',
      crewRoles: ['DRIVER'],
      center: [0.34, 1.16, 1.34],
      halfExtents: [0.39, 0.48, 0.43],
      dataQuality: 'role historical; occupied volume is a gameplay approximation'
    },
    {
      id: 'crew-radio-operator',
      kind: 'crew',
      crewRoles: ['RADIO_OPERATOR'],
      center: [-0.34, 1.16, 1.12],
      halfExtents: [0.39, 0.48, 0.48],
      dataQuality: 'role historical; occupied volume is a gameplay approximation'
    },
    {
      id: 'crew-commander-gunner',
      kind: 'crew',
      crewRoles: ['COMMANDER_GUNNER'],
      center: [0, 1.92, 0.38],
      offset: [0, 0.12, -0.04],
      halfExtents: [0.34, 0.48, 0.34],
      followsTurret: true,
      dataQuality: 'one-man turret role historical; occupied volume is a gameplay approximation'
    },
    {
      id: 'module-breech',
      kind: 'component',
      componentId: 'breech',
      center: [0, 1.91, 0.38],
      offset: [0, 0, 0.28],
      halfExtents: [0.25, 0.20, 0.34],
      followsTurret: true,
      dataQuality: 'mount association historical; volume is a gameplay approximation'
    },
    {
      id: 'module-turret-traverse',
      kind: 'component',
      componentId: 'turret_traverse',
      center: [0, 1.60, 0.38],
      halfExtents: [0.52, 0.18, 0.48],
      dataQuality: 'turret-ring location inferred; volume is a gameplay approximation'
    },
    {
      id: 'module-optics',
      kind: 'component',
      componentId: 'optics',
      center: [0, 1.91, 0.38],
      offset: [0.30, 0.18, 0.18],
      halfExtents: [0.12, 0.15, 0.16],
      followsTurret: true,
      dataQuality: 'observation role historical; volume is a gameplay approximation'
    },
    {
      id: 'module-radio',
      kind: 'component',
      componentId: 'radio',
      center: [-0.62, 1.10, 0.82],
      halfExtents: [0.18, 0.34, 0.34],
      dataQuality: 'radio installation historical; volume is a gameplay approximation'
    },
    {
      id: 'module-ammunition-left',
      kind: 'component',
      componentId: 'ammunition',
      center: [0.72, 1.18, 0.20],
      halfExtents: [0.16, 0.39, 0.66],
      dataQuality: 'carried load historical; stowage volume is a gameplay approximation'
    },
    {
      id: 'module-ammunition-right',
      kind: 'component',
      componentId: 'ammunition',
      center: [-0.72, 1.18, 0.20],
      halfExtents: [0.16, 0.39, 0.66],
      dataQuality: 'carried load historical; stowage volume is a gameplay approximation'
    },
    {
      id: 'module-fuel-left',
      kind: 'component',
      componentId: 'fuel',
      center: [0.72, 1.05, -0.84],
      halfExtents: [0.17, 0.38, 0.48],
      dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
    },
    {
      id: 'module-fuel-right',
      kind: 'component',
      componentId: 'fuel',
      center: [-0.72, 1.05, -0.84],
      halfExtents: [0.17, 0.38, 0.48],
      dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
    },
    {
      id: 'module-engine',
      kind: 'component',
      componentId: 'engine',
      center: [0, 1.07, -1.46],
      halfExtents: [0.75, 0.51, 0.61],
      dataQuality: 'rear engine compartment historical; volume is a gameplay approximation'
    },
    {
      id: 'module-transmission',
      kind: 'component',
      componentId: 'transmission',
      center: [0, 0.83, -2.08],
      halfExtents: [0.68, 0.34, 0.30],
      dataQuality: 'rear final-drive association inferred; volume is a gameplay approximation'
    }
  ]
});

export const VEHICLE_MACHINE_GUN_MOUNTS = Object.freeze({
  SOMUA_S35: freezeMounts([
    machineGunMount('coax', 'Coaxial MAC mle 1931', 'MAC31_VEHICLE', ['COMMANDER_GUNNER'], 2550,
      'historical identity, mount, 15 drums, and 2,550-round carried load', FRENCH_ARMAMENT_REFERENCE)
  ]),
  RENAULT_R35: freezeMounts([
    machineGunMount('coax', 'Coaxial MAC mle 1931', 'MAC31_VEHICLE', ['COMMANDER_GUNNER'], 2400,
      'historical identity and mount; carried load is a bounded gameplay approximation')
  ]),
  HOTCHKISS_H39: freezeMounts([
    machineGunMount('coax', 'Coaxial MAC mle 1931', 'MAC31_VEHICLE', ['COMMANDER_GUNNER'], 2400,
      'historical identity and mount; carried load is a bounded gameplay approximation')
  ]),
  AMC_35: freezeMounts([
    machineGunMount('coax', 'Coaxial MAC mle 1931', 'MAC31_VEHICLE', ['GUNNER_LOADER'], 5250,
      'historical identity and mount; carried load is a bounded gameplay approximation')
  ]),
  PANHARD_178: freezeMounts([
    machineGunMount('coax', 'Coaxial MAC mle 1931', 'MAC31_VEHICLE', ['GUNNER'], 3750,
      'historical identity and mount; carried load is a bounded gameplay approximation',
      null, ['COMMANDER'])
  ]),
  LAFFLY_S20TL: freezeMounts([]),
  CHAR_B1_BIS: freezeMounts([
    machineGunMount('coax', 'Coaxial MAC mle 1931', 'MAC31_VEHICLE', ['COMMANDER_GUNNER'], 2400,
      'historical identity and mount; ammunition allocation is a gameplay approximation'),
    machineGunMount('hull_mg', 'Hull MAC mle 1931', 'MAC31_VEHICLE', ['DRIVER_HULL_GUNNER'], 2400,
      'historical identity and fixed hull mount; ammunition allocation is a gameplay approximation',
      null, ['HULL_LOADER'])
  ]),
  PANZER_III_D: freezeMounts([
    machineGunMount('coax', 'Coaxial MG 34', 'MG34_VEHICLE', ['GUNNER'], 2250,
      'historical identity and mount; ammunition allocation is a gameplay approximation',
      GERMAN_ARMAMENT_REFERENCE, ['LOADER']),
    machineGunMount('hull_mg', 'Hull MG 34', 'MG34_VEHICLE', ['RADIO_OPERATOR'], 2175,
      'historical identity, mount, and radio-operator dependency; ammunition allocation is a gameplay approximation',
      GERMAN_ARMAMENT_REFERENCE)
  ]),
  PANZER_II_C: freezeMounts([
    machineGunMount('coax', 'Coaxial MG 34', 'MG34_VEHICLE', ['COMMANDER_GUNNER'], 2250,
      'historical identity and mount; carried load is a bounded gameplay approximation',
      null, ['LOADER_RADIO'])
  ]),
  PANZER_35T: freezeMounts([
    machineGunMount('coax', 'Coaxial MG 37(t)', 'MG37T_VEHICLE', ['COMMANDER_GUNNER'], 1350,
      'historical identity and mount; ammunition allocation is a gameplay approximation',
      null, ['LOADER']),
    machineGunMount('hull_mg', 'Hull MG 37(t)', 'MG37T_VEHICLE', ['RADIO_OPERATOR'], 1350,
      'historical identity and mount; ammunition allocation is a gameplay approximation')
  ]),
  PANZER_38T: freezeMounts([
    machineGunMount('coax', 'Coaxial MG 37(t)', 'MG37T_VEHICLE', ['COMMANDER_GUNNER'], 1350,
      'historical identity and mount; ammunition allocation is a gameplay approximation',
      null, ['LOADER']),
    machineGunMount('hull_mg', 'Hull MG 37(t)', 'MG37T_VEHICLE', ['RADIO_OPERATOR'], 1350,
      'historical identity and mount; ammunition allocation is a gameplay approximation')
  ]),
  SDKFZ_231: freezeMounts([
    machineGunMount('coax', 'Coaxial MG 34', 'MG34_VEHICLE', ['GUNNER'], 2010,
      'historical identity and mount; carried load is a bounded gameplay approximation',
      null, ['COMMANDER'])
  ]),
  OPEL_BLITZ: freezeMounts([]),
  PANZER_IV_D: freezeMounts([
    machineGunMount('coax', 'Coaxial MG 34', 'MG34_VEHICLE', ['GUNNER'], 1350,
      'historical identity and mount; ammunition allocation is a gameplay approximation',
      null, ['LOADER']),
    machineGunMount('hull_mg', 'Hull MG 34', 'MG34_VEHICLE', ['RADIO_OPERATOR'], 1350,
      'historical identity, mount, and radio-operator dependency; ammunition allocation is a gameplay approximation',
      'https://tankmuseum.org/tank-nuts/tank-collection/panzer-iv/')
  ])
});

export const VEHICLES = Object.freeze({
  SOMUA_S35: freezeVehicle({
    id: 'SOMUA_S35',
    modelId: 'fr_somua',
    name: 'SOMUA S35',
    dimensionsMeters: { length: 5.38, width: 2.12, height: 2.62 },
    crew: [
      crewman('COMMANDER_GUNNER', 'Commander / Gunner'),
      crewman('DRIVER', 'Driver'),
      crewman('RADIO_OPERATOR', 'Radio Operator')
    ],
    communications: communications(true, ['RADIO_OPERATOR'],
      'historical radio/operator configuration; command-net membership is scenario data'),
    observationEquipment: observationEquipment(['COMMANDER_GUNNER']),
    gunnerRoles: ['COMMANDER_GUNNER'],
    loaderRoles: ['COMMANDER_GUNNER'],
    mainGun: { ap: 'SA35_AP', he: 'SA35_HE' },
    ammunition: { ap: 70, he: 48 },
    movementMps: movement(2.5, 3.5, 5.2, 2.0),
    turretTraverseRadPerSecond: 0.18,
    hitRadius: 2.35,
    armorMm: SOMUA_S35_ARMOR,
    armorCollision: createSomuaS35ArmorCollision(
      SOMUA_S35_ARMOR,
      SOMUA_REFERENCE
    ),
    internalLayout: SOMUA_S35_INTERNAL_LAYOUT,
    zoneCrew: {
      hull_front: ['DRIVER', 'RADIO_OPERATOR'],
      hull_side: ['DRIVER', 'RADIO_OPERATOR', 'COMMANDER_GUNNER'],
      hull_rear: ['RADIO_OPERATOR'],
      turret_front: ['COMMANDER_GUNNER'],
      turret_side: ['COMMANDER_GUNNER'],
      turret_rear: ['COMMANDER_GUNNER']
    },
    dataQuality: {
      crewArmorArmament: 'historical',
      ammunitionSplit: 'gameplay approximation',
      movement: 'gameplay approximation',
      referenceUrl: SOMUA_REFERENCE
    }
  }),
  RENAULT_R35: freezeVehicle({
    id: 'RENAULT_R35',
    modelId: 'fr_renault_r35',
    name: 'Renault R35',
    dimensionsMeters: { length: 4.02, width: 1.87, height: 2.13 },
    crew: [
      crewman('COMMANDER_GUNNER', 'Commander / Gunner / Loader'),
      crewman('DRIVER', 'Driver')
    ],
    communications: communications(false, [],
      'represented as a non-command tank without a radio; command variants require a scenario override'),
    observationEquipment: observationEquipment(['COMMANDER_GUNNER']),
    gunnerRoles: ['COMMANDER_GUNNER'],
    loaderRoles: ['COMMANDER_GUNNER'],
    mainGun: { ap: 'SA18_AP', he: 'SA18_HE' },
    ammunition: { ap: 42, he: 16 },
    movementMps: movement(2.0, 2.8, 4.0, 1.6),
    turretTraverseRadPerSecond: 0.16,
    hitRadius: 2.05,
    armorMm: armor(40, 40, 32, 40, 40, 40),
    zoneCrew: {
      hull_front: ['DRIVER'],
      hull_side: ['DRIVER', 'COMMANDER_GUNNER'],
      hull_rear: ['DRIVER'],
      turret_front: ['COMMANDER_GUNNER'],
      turret_side: ['COMMANDER_GUNNER'],
      turret_rear: ['COMMANDER_GUNNER']
    },
    dataQuality: {
      crewArmorArmament: 'historical',
      ammunitionSplit: 'inferred from 58-round total',
      movement: 'gameplay approximation',
      referenceUrl: 'https://museedesblindes.fr/les_chars/renault-r35/'
    }
  }),
  HOTCHKISS_H39: freezeVehicle({
    id: 'HOTCHKISS_H39',
    modelId: 'fr_hotchkiss_h39',
    name: 'Hotchkiss H39',
    dimensionsMeters: { length: 4.22, width: 1.85, height: 2.15 },
    crew: [
      crewman('COMMANDER_GUNNER', 'Commander / Gunner / Loader'),
      crewman('DRIVER', 'Driver')
    ],
    communications: communications(false, [],
      'represented as a non-command tank without a radio; command variants require a scenario override'),
    observationEquipment: observationEquipment(['COMMANDER_GUNNER']),
    gunnerRoles: ['COMMANDER_GUNNER'],
    loaderRoles: ['COMMANDER_GUNNER'],
    mainGun: { ap: 'SA38_AP', he: 'SA38_HE' },
    ammunition: { ap: 70, he: 30 },
    movementMps: movement(2.8, 3.8, 5.5, 1.9),
    turretTraverseRadPerSecond: 0.17,
    hitRadius: 2.15,
    armorMm: armor(40, 40, 40, 40, 40, 40),
    zoneCrew: {
      hull_front: ['DRIVER'],
      hull_side: ['DRIVER', 'COMMANDER_GUNNER'],
      hull_rear: ['DRIVER'],
      turret_front: ['COMMANDER_GUNNER'],
      turret_side: ['COMMANDER_GUNNER'],
      turret_rear: ['COMMANDER_GUNNER']
    },
    dataQuality: {
      crewArmorArmament: 'historical',
      ammunitionSplit: 'inferred from 100-round total',
      movement: 'gameplay approximation',
      referenceUrl: 'https://museedesblindes.fr/les_chars/hotchkiss-h-39/'
    }
  }),
  AMC_35: freezeVehicle({
    id: 'AMC_35',
    modelId: 'fr_amc35',
    name: 'AMC 35 (ACG-1)',
    dimensionsMeters: { length: 4.55, width: 2.24, height: 2.30 },
    crew: [
      crewman('COMMANDER', 'Commander'),
      crewman('GUNNER_LOADER', 'Gunner / Loader'),
      crewman('DRIVER', 'Driver')
    ],
    communications: communications(false, [],
      'radio fit is not asserted for this represented vehicle; a scenario may explicitly override it'),
    observationEquipment: observationEquipment(['COMMANDER']),
    gunnerRoles: ['GUNNER_LOADER'],
    loaderRoles: ['GUNNER_LOADER'],
    mainGun: { ap: 'SA35_AP', he: 'SA35_HE' },
    ammunition: { ap: 70, he: 50 },
    movementMps: movement(3.0, 4.0, 5.8, 2.0),
    turretTraverseRadPerSecond: 0.2,
    hitRadius: 2.35,
    armorMm: armor(25, 25, 20, 25, 25, 25),
    zoneCrew: {
      hull_front: ['DRIVER'],
      hull_side: ['DRIVER', 'COMMANDER', 'GUNNER_LOADER'],
      hull_rear: ['DRIVER'],
      turret_front: ['COMMANDER', 'GUNNER_LOADER'],
      turret_side: ['COMMANDER', 'GUNNER_LOADER'],
      turret_rear: ['COMMANDER', 'GUNNER_LOADER']
    },
    dataQuality: {
      crewArmorArmament: 'historical',
      ammunitionSplit: 'inferred from 120-round total',
      movement: 'gameplay approximation',
      referenceUrl: 'https://museedesblindes.fr/les_chars/amc-35/'
    }
  }),
  PANHARD_178: freezeVehicle({
    id: 'PANHARD_178',
    modelId: 'fr_panhard178',
    name: 'Panhard 178 (AMD 35)',
    dimensionsMeters: { length: 4.79, width: 2.01, height: 2.31 },
    crew: [
      crewman('COMMANDER', 'Commander'),
      crewman('GUNNER', 'Gunner'),
      crewman('DRIVER', 'Forward Driver'),
      crewman('REAR_DRIVER_RADIO', 'Rear Driver / Radio Operator')
    ],
    communications: communications(true, ['REAR_DRIVER_RADIO'],
      'historical radio/operator configuration; command-net membership is scenario data'),
    observationEquipment: observationEquipment(['COMMANDER']),
    gunnerRoles: ['GUNNER'],
    loaderRoles: ['COMMANDER'],
    mainGun: { ap: 'SA35_25_AP' },
    ammunition: { ap: 150, he: 0 },
    movementMps: movement(3.8, 5.4, 7.5, 2.4),
    turretTraverseRadPerSecond: 0.24,
    hitRadius: 2.5,
    armorMm: armor(20, 15, 15, 20, 15, 15),
    zoneCrew: {
      hull_front: ['DRIVER'],
      hull_side: ['DRIVER', 'REAR_DRIVER_RADIO', 'COMMANDER', 'GUNNER'],
      hull_rear: ['REAR_DRIVER_RADIO'],
      turret_front: ['COMMANDER', 'GUNNER'],
      turret_side: ['COMMANDER', 'GUNNER'],
      turret_rear: ['COMMANDER']
    },
    dataQuality: {
      crewArmorArmament: 'historical',
      ammunitionSplit: 'historical AP-only combat load represented',
      movement: 'gameplay approximation'
    }
  }),
  LAFFLY_S20TL: freezeVehicle({
    id: 'LAFFLY_S20TL',
    modelId: 'fr_laffly_s20tl',
    name: 'Laffly S20TL',
    dimensionsMeters: { length: 5.35, width: 2.00, height: 2.00 },
    crew: [
      crewman('DRIVER', 'Driver'),
      crewman('PASSENGER', 'Vehicle Commander')
    ],
    communications: communications(false, [],
      'radio is not assumed for the represented troop carrier'),
    observationEquipment: observationEquipment([]),
    gunnerRoles: [],
    loaderRoles: [],
    mainGun: null,
    ammunition: { ap: 0, he: 0 },
    movementMps: movement(3.4, 4.8, 7.0, 2.2),
    turretTraverseRadPerSecond: 0,
    hitRadius: 2.8,
    armorMm: armor(0, 0, 0, 0, 0, 0),
    zoneCrew: {
      hull_front: ['DRIVER', 'PASSENGER'],
      hull_side: ['DRIVER', 'PASSENGER'],
      hull_rear: ['PASSENGER'],
      turret_front: [],
      turret_side: [],
      turret_rear: []
    },
    dataQuality: {
      crewArmorArmament: 'historical unarmored 6x6 troop carrier',
      ammunitionSplit: 'not applicable',
      movement: 'gameplay approximation'
    }
  }),
  CHAR_B1_BIS: freezeVehicle({
    id: 'CHAR_B1_BIS',
    modelId: 'fr_char_b1bis',
    name: 'Char B1 bis',
    dimensionsMeters: { length: 6.37, width: 2.46, height: 2.79 },
    crew: [
      crewman('COMMANDER_GUNNER', 'Commander / 47mm Gunner / Loader'),
      crewman('DRIVER_HULL_GUNNER', 'Driver / 75mm Gunner'),
      crewman('HULL_LOADER', '75mm Loader'),
      crewman('RADIO_OPERATOR', 'Radio Operator')
    ],
    communications: communications(true, ['RADIO_OPERATOR'],
      'historical radio/operator configuration; command-net membership is scenario data'),
    observationEquipment: observationEquipment(['COMMANDER_GUNNER']),
    driverRoles: ['DRIVER_HULL_GUNNER'],
    gunnerRoles: ['COMMANDER_GUNNER'],
    loaderRoles: ['COMMANDER_GUNNER'],
    mainGun: { ap: 'SA35_AP', he: 'SA35_HE' },
    ammunition: { ap: 30, he: 20 },
    movementMps: movement(2.2, 3.0, 4.3, 1.7),
    turretTraverseRadPerSecond: 0.16,
    hitRadius: 3.2,
    armorMm: armor(60, 55, 55, 56, 46, 46),
    zoneCrew: {
      hull_front: ['DRIVER_HULL_GUNNER', 'HULL_LOADER'],
      hull_side: ['DRIVER_HULL_GUNNER', 'HULL_LOADER', 'RADIO_OPERATOR', 'COMMANDER_GUNNER'],
      hull_rear: ['RADIO_OPERATOR', 'HULL_LOADER'],
      turret_front: ['COMMANDER_GUNNER'],
      turret_side: ['COMMANDER_GUNNER'],
      turret_rear: ['COMMANDER_GUNNER']
    },
    dataQuality: {
      crewArmorArmament: 'historical; current simulation drives turret 47mm only',
      ammunitionSplit: 'inferred from 50-round 47mm total',
      movement: 'gameplay approximation',
      referenceUrl: 'https://museedesblindes.fr/les_chars/b1-bis/'
    }
  }),
  PANZER_III_D: freezeVehicle({
    id: 'PANZER_III_D',
    modelId: 'ger_panzer3',
    name: 'Panzer III Ausf. D',
    dimensionsMeters: { length: 5.38, width: 2.91, height: 2.50 },
    crew: [
      crewman('COMMANDER', 'Commander'),
      crewman('GUNNER', 'Gunner'),
      crewman('LOADER', 'Loader'),
      crewman('DRIVER', 'Driver'),
      crewman('RADIO_OPERATOR', 'Radio Operator')
    ],
    communications: communications(true, ['RADIO_OPERATOR'],
      'historical radio/operator configuration; command-net membership is scenario data'),
    observationEquipment: observationEquipment(['COMMANDER']),
    gunnerRoles: ['GUNNER'],
    loaderRoles: ['LOADER'],
    mainGun: { ap: 'KWK36_AP', he: 'KWK36_HE' },
    ammunition: { ap: 72, he: 48 },
    movementMps: movement(2.7, 3.8, 5.5, 2.1),
    turretTraverseRadPerSecond: 0.25,
    hitRadius: 2.55,
    armorMm: armor(30, 14.5, 14.5, 30, 14.5, 14.5),
    zoneCrew: {
      hull_front: ['DRIVER', 'RADIO_OPERATOR'],
      hull_side: ['DRIVER', 'RADIO_OPERATOR', 'GUNNER', 'LOADER'],
      hull_rear: ['DRIVER', 'RADIO_OPERATOR'],
      turret_front: ['GUNNER', 'LOADER', 'COMMANDER'],
      turret_side: ['GUNNER', 'LOADER', 'COMMANDER'],
      turret_rear: ['LOADER', 'COMMANDER']
    },
    dataQuality: {
      crewArmorArmament: 'historical',
      ammunitionSplit: 'gameplay approximation',
      movement: 'gameplay approximation'
    }
  }),
  PANZER_II_C: freezeVehicle({
    id: 'PANZER_II_C',
    modelId: 'ger_panzer2',
    name: 'Panzer II Ausf. C',
    dimensionsMeters: { length: 4.81, width: 2.22, height: 1.99 },
    crew: [
      crewman('COMMANDER_GUNNER', 'Commander / Gunner'),
      crewman('LOADER_RADIO', 'Loader / Radio Operator'),
      crewman('DRIVER', 'Driver')
    ],
    communications: communications(true, ['LOADER_RADIO'],
      'historical radio/operator configuration; command-net membership is scenario data'),
    observationEquipment: observationEquipment(['COMMANDER_GUNNER']),
    gunnerRoles: ['COMMANDER_GUNNER'],
    loaderRoles: ['LOADER_RADIO'],
    mainGun: { ap: 'KWK30_AP', he: 'KWK30_HE' },
    ammunition: { ap: 90, he: 90 },
    movementMps: movement(3.0, 4.2, 5.8, 2.2),
    turretTraverseRadPerSecond: 0.28,
    hitRadius: 2.5,
    armorMm: armor(14.5, 14.5, 14.5, 14.5, 14.5, 14.5),
    zoneCrew: {
      hull_front: ['DRIVER', 'LOADER_RADIO'],
      hull_side: ['DRIVER', 'LOADER_RADIO', 'COMMANDER_GUNNER'],
      hull_rear: ['DRIVER', 'LOADER_RADIO'],
      turret_front: ['COMMANDER_GUNNER', 'LOADER_RADIO'],
      turret_side: ['COMMANDER_GUNNER', 'LOADER_RADIO'],
      turret_rear: ['LOADER_RADIO']
    },
    dataQuality: {
      crewArmorArmament: 'historical',
      ammunitionSplit: 'inferred from 180-round total',
      movement: 'gameplay approximation'
    }
  }),
  PANZER_35T: freezeVehicle({
    id: 'PANZER_35T',
    modelId: 'ger_panzer35t',
    name: 'Panzer 35(t)',
    dimensionsMeters: { length: 4.90, width: 2.06, height: 2.37 },
    crew: [
      crewman('COMMANDER_GUNNER', 'Commander / Gunner'),
      crewman('LOADER', 'Loader'),
      crewman('DRIVER', 'Driver'),
      crewman('RADIO_OPERATOR', 'Radio Operator')
    ],
    communications: communications(true, ['RADIO_OPERATOR'],
      'historical radio/operator configuration; command-net membership is scenario data'),
    observationEquipment: observationEquipment(['COMMANDER_GUNNER']),
    gunnerRoles: ['COMMANDER_GUNNER'],
    loaderRoles: ['LOADER'],
    mainGun: { ap: 'KWK34T_AP', he: 'KWK34T_HE' },
    ammunition: { ap: 48, he: 30 },
    movementMps: movement(2.8, 4.0, 5.5, 2.1),
    turretTraverseRadPerSecond: 0.22,
    hitRadius: 2.5,
    armorMm: armor(25, 16, 16, 25, 16, 16),
    zoneCrew: {
      hull_front: ['DRIVER', 'RADIO_OPERATOR'],
      hull_side: ['DRIVER', 'RADIO_OPERATOR', 'COMMANDER_GUNNER', 'LOADER'],
      hull_rear: ['DRIVER', 'RADIO_OPERATOR'],
      turret_front: ['COMMANDER_GUNNER', 'LOADER'],
      turret_side: ['COMMANDER_GUNNER', 'LOADER'],
      turret_rear: ['LOADER']
    },
    dataQuality: {
      crewArmorArmament: 'historical',
      ammunitionSplit: 'inferred from 78-round total',
      movement: 'gameplay approximation'
    }
  }),
  PANZER_38T: freezeVehicle({
    id: 'PANZER_38T',
    modelId: 'ger_panzer38t',
    name: 'Panzer 38(t)',
    dimensionsMeters: { length: 4.61, width: 2.14, height: 2.25 },
    crew: [
      crewman('COMMANDER_GUNNER', 'Commander / Gunner'),
      crewman('LOADER', 'Loader'),
      crewman('DRIVER', 'Driver'),
      crewman('RADIO_OPERATOR', 'Radio Operator')
    ],
    communications: communications(true, ['RADIO_OPERATOR'],
      'historical radio/operator configuration; command-net membership is scenario data'),
    observationEquipment: observationEquipment(['COMMANDER_GUNNER']),
    gunnerRoles: ['COMMANDER_GUNNER'],
    loaderRoles: ['LOADER'],
    mainGun: { ap: 'KWK38T_AP', he: 'KWK38T_HE' },
    ammunition: { ap: 54, he: 36 },
    movementMps: movement(3.0, 4.3, 6.0, 2.2),
    turretTraverseRadPerSecond: 0.23,
    hitRadius: 2.45,
    armorMm: armor(25, 15, 15, 25, 15, 15),
    zoneCrew: {
      hull_front: ['DRIVER', 'RADIO_OPERATOR'],
      hull_side: ['DRIVER', 'RADIO_OPERATOR', 'COMMANDER_GUNNER', 'LOADER'],
      hull_rear: ['DRIVER', 'RADIO_OPERATOR'],
      turret_front: ['COMMANDER_GUNNER', 'LOADER'],
      turret_side: ['COMMANDER_GUNNER', 'LOADER'],
      turret_rear: ['LOADER']
    },
    dataQuality: {
      crewArmorArmament: 'historical early-production armor',
      ammunitionSplit: 'inferred from 90-round total',
      movement: 'gameplay approximation'
    }
  }),
  SDKFZ_231: freezeVehicle({
    id: 'SDKFZ_231',
    modelId: 'ger_sdkfz231',
    name: 'Sd.Kfz. 231 (6-Rad)',
    dimensionsMeters: { length: 5.57, width: 1.82, height: 2.25 },
    crew: [
      crewman('COMMANDER', 'Commander'),
      crewman('GUNNER', 'Gunner'),
      crewman('DRIVER', 'Forward Driver'),
      crewman('REAR_DRIVER_RADIO', 'Rear Driver / Radio Operator')
    ],
    communications: communications(true, ['REAR_DRIVER_RADIO'],
      'historical radio/operator configuration; command-net membership is scenario data'),
    observationEquipment: observationEquipment(['COMMANDER']),
    gunnerRoles: ['GUNNER'],
    loaderRoles: ['COMMANDER'],
    mainGun: { ap: 'KWK30_AP', he: 'KWK30_HE' },
    ammunition: { ap: 90, he: 90 },
    movementMps: movement(4.0, 5.8, 8.0, 2.5),
    turretTraverseRadPerSecond: 0.3,
    hitRadius: 2.85,
    armorMm: armor(14.5, 8, 8, 14.5, 8, 8),
    zoneCrew: {
      hull_front: ['DRIVER'],
      hull_side: ['DRIVER', 'REAR_DRIVER_RADIO', 'COMMANDER', 'GUNNER'],
      hull_rear: ['REAR_DRIVER_RADIO'],
      turret_front: ['COMMANDER', 'GUNNER'],
      turret_side: ['COMMANDER', 'GUNNER'],
      turret_rear: ['COMMANDER']
    },
    dataQuality: {
      crewArmorArmament: 'historical',
      ammunitionSplit: 'inferred from 180-round total',
      movement: 'gameplay approximation'
    }
  }),
  OPEL_BLITZ: freezeVehicle({
    id: 'OPEL_BLITZ',
    modelId: 'ger_opel_blitz',
    name: 'Opel Blitz 3.6-36S',
    dimensionsMeters: { length: 6.02, width: 2.27, height: 2.59 },
    crew: [
      crewman('DRIVER', 'Driver'),
      crewman('PASSENGER', 'Vehicle Commander')
    ],
    communications: communications(false, [],
      'radio is not assumed for the represented general-service truck'),
    observationEquipment: observationEquipment([]),
    gunnerRoles: [],
    loaderRoles: [],
    mainGun: null,
    ammunition: { ap: 0, he: 0 },
    movementMps: movement(3.2, 4.7, 6.5, 2.0),
    turretTraverseRadPerSecond: 0,
    hitRadius: 3.1,
    armorMm: armor(0, 0, 0, 0, 0, 0),
    zoneCrew: {
      hull_front: ['DRIVER', 'PASSENGER'],
      hull_side: ['DRIVER', 'PASSENGER'],
      hull_rear: ['PASSENGER'],
      turret_front: [],
      turret_side: [],
      turret_rear: []
    },
    dataQuality: {
      crewArmorArmament: 'historical unarmored truck',
      ammunitionSplit: 'not applicable',
      movement: 'gameplay approximation'
    }
  }),
  PANZER_IV_D: freezeVehicle({
    id: 'PANZER_IV_D',
    modelId: 'ger_panzer4',
    name: 'Panzer IV Ausf. D',
    dimensionsMeters: { length: 5.92, width: 2.84, height: 2.68 },
    crew: [
      crewman('COMMANDER', 'Commander'),
      crewman('GUNNER', 'Gunner'),
      crewman('LOADER', 'Loader'),
      crewman('DRIVER', 'Driver'),
      crewman('RADIO_OPERATOR', 'Radio Operator')
    ],
    communications: communications(true, ['RADIO_OPERATOR'],
      'historical radio/operator configuration; command-net membership is scenario data'),
    observationEquipment: observationEquipment(['COMMANDER']),
    gunnerRoles: ['GUNNER'],
    loaderRoles: ['LOADER'],
    mainGun: { ap: 'KWK37_AP', he: 'KWK37_HE' },
    ammunition: { ap: 32, he: 48 },
    movementMps: movement(2.8, 4.0, 5.5, 2.0),
    turretTraverseRadPerSecond: 0.24,
    hitRadius: 3.0,
    armorMm: armor(30, 20, 20, 30, 20, 20),
    zoneCrew: {
      hull_front: ['DRIVER', 'RADIO_OPERATOR'],
      hull_side: ['DRIVER', 'RADIO_OPERATOR', 'GUNNER', 'LOADER'],
      hull_rear: ['DRIVER', 'RADIO_OPERATOR'],
      turret_front: ['GUNNER', 'LOADER', 'COMMANDER'],
      turret_side: ['GUNNER', 'LOADER', 'COMMANDER'],
      turret_rear: ['LOADER', 'COMMANDER']
    },
    dataQuality: {
      crewArmorArmament: 'historical',
      ammunitionSplit: 'inferred from 80-round total',
      movement: 'gameplay approximation',
      referenceUrl: 'https://tankmuseum.org/tank-nuts/tank-collection/panzer-iv/'
    }
  })
});

export function vehicleIdForFaction(faction) {
  return faction === 'french' ? 'SOMUA_S35' : 'PANZER_III_D';
}

export function getVehicle(id) {
  return VEHICLES[id] ?? null;
}

export function effectiveArmorMm(nominalArmorMm, impactCosine) {
  return nominalArmorMm / Math.max(0.25, Math.abs(impactCosine));
}

export function penetrationAtVelocity(weapon, velocity) {
  if (!weapon?.penetrationMmAt100m) return 0;
  const ratio = Math.max(0, velocity) / weapon.muzzleVelocity;
  return weapon.penetrationMmAt100m * Math.pow(ratio, weapon.penetrationVelocityExponent ?? 1.35);
}
