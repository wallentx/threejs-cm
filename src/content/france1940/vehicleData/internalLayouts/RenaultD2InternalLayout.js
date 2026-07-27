import {
  RENAULT_D2_VISUAL_DATA
} from '../RenaultD2AuthoringData.js';

const GEOMETRY = RENAULT_D2_VISUAL_DATA.geometry;
const TURRET_CENTER = GEOMETRY.turret.center;

export function createRenaultD2InternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 5.8,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical three-man crew with radio operator and one-man turret',
      'major compartments follow the provisional blueprint-authored hull',
      'crew, powertrain, fuel, and stowage bounds are gameplay approximations'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [0.35, 1.23, 1.58],
        halfExtents: [0.38, 0.43, 0.48],
        dataQuality: 'front driving position historical; occupied side and volume are inferred from provisional blueprint evidence'
      },
      {
        id: 'crew-radio-operator',
        kind: 'crew',
        crewRoles: ['RADIO_OPERATOR'],
        center: [-0.36, 1.18, 0.82],
        halfExtents: [0.38, 0.42, 0.46],
        dataQuality: 'radiotelegraphist role historical; occupied position is a gameplay approximation'
      },
      {
        id: 'module-radio',
        kind: 'component',
        componentId: 'radio',
        center: [-0.62, 1.36, 0.82],
        halfExtents: [0.16, 0.22, 0.27],
        dataQuality: 'radiotelegraphist role historical; radio set position is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.68, 1.14, 0.18],
        halfExtents: [0.16, 0.34, 0.66],
        dataQuality: 'stowage location and volume are gameplay approximations'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.68, 1.14, 0.18],
        halfExtents: [0.16, 0.34, 0.66],
        dataQuality: 'stowage location and volume are gameplay approximations'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [...TURRET_CENTER],
        halfExtents: [0.56, 0.14, 0.56],
        dataQuality: 'turret-ring datum blueprint-registered; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-commander-gunner',
        kind: 'crew',
        crewRoles: ['COMMANDER_GUNNER'],
        center: [...TURRET_CENTER],
        offset: [0, 0.43, -0.04],
        halfExtents: [0.36, 0.42, 0.36],
        followsTurret: true,
        dataQuality: 'one-man turret role historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [...TURRET_CENTER],
        offset: [
          GEOMETRY.mainGun.center[0],
          GEOMETRY.mainGun.center[1],
          0.38
        ],
        halfExtents: [0.22, 0.18, 0.34],
        followsTurret: true,
        dataQuality: 'main-gun datum blueprint-registered; volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [...TURRET_CENTER],
        offset: [
          GEOMETRY.coax.center[0],
          GEOMETRY.coax.center[1],
          0.40
        ],
        halfExtents: [0.09, 0.09, 0.29],
        followsTurret: true,
        dataQuality: 'coax datum blueprint-registered; volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [...TURRET_CENTER],
        offset: [-0.28, 0.41, 0.24],
        halfExtents: [0.11, 0.14, 0.18],
        followsTurret: true,
        dataQuality: 'commander observation function historical; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel',
        kind: 'component',
        componentId: 'fuel',
        center: [0.55, 1.18, -1.30],
        halfExtents: [0.20, 0.36, 0.52],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.15, -1.45],
        halfExtents: [0.68, 0.43, 0.62],
        dataQuality: 'rear engine compartment historical; volume is a gameplay approximation'
      },
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.88, -2.00],
        halfExtents: [0.61, 0.28, 0.32],
        dataQuality: 'rear-drive arrangement historical; internal volume is a gameplay approximation'
      }
    ]
  };
}
