export function createRenaultR35InternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 4.3,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical two-man crew and one-man APX-R turret',
      'driver side follows the authored hood and visor',
      'crew, powertrain, fuel, and stowage bounds are gameplay approximations'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.72, 1.48],
        halfExtents: [0.58, 0.25, 0.30],
        dataQuality: 'front final-drive casting model-backed; internal volume is a gameplay approximation'
      },
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [0.25, 1.12, 0.92],
        halfExtents: [0.36, 0.40, 0.43],
        dataQuality: 'vehicle-left hood/visor position model-backed; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.58, 1.08, 0.02],
        halfExtents: [0.14, 0.31, 0.56],
        dataQuality: '58-round load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.58, 1.08, 0.02],
        halfExtents: [0.14, 0.31, 0.56],
        dataQuality: '58-round load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0, 1.39, 0.05],
        halfExtents: [0.48, 0.13, 0.47],
        dataQuality: 'turret-ring datum model-registered; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-commander-gunner',
        kind: 'crew',
        crewRoles: ['COMMANDER_GUNNER'],
        center: [0, 1.36, 0.05],
        offset: [0, 0.36, -0.05],
        halfExtents: [0.33, 0.38, 0.33],
        followsTurret: true,
        dataQuality: 'one-man turret role historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0, 1.36, 0.05],
        offset: [0.14, 0.28, 0.35],
        halfExtents: [0.20, 0.17, 0.30],
        followsTurret: true,
        dataQuality: 'gun-axis datum model-registered; volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [0, 1.36, 0.05],
        offset: [-0.18, 0.30, 0.36],
        halfExtents: [0.09, 0.09, 0.26],
        followsTurret: true,
        dataQuality: 'rendered right-side mount model-backed; volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0, 1.36, 0.05],
        offset: [0.29, 0.33, 0.26],
        halfExtents: [0.10, 0.13, 0.16],
        followsTurret: true,
        dataQuality: 'commander observation function historical; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.50, 1.02, -0.88],
        halfExtents: [0.16, 0.31, 0.43],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.00, -1.10],
        halfExtents: [0.58, 0.39, 0.48],
        dataQuality: 'rear engine compartment historical; volume is a gameplay approximation'
      }
    ]
  };
}
