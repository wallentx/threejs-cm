export function createHotchkissH39InternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 4.5,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical two-man crew and one-man APX-R turret',
      'driver side follows the authored right-offset hood and visor',
      'crew, powertrain, fuel, and stowage bounds are gameplay approximations'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.73, 1.65],
        halfExtents: [0.60, 0.25, 0.31],
        dataQuality: 'front drive arrangement historical; volume is a gameplay approximation'
      },
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [-0.28, 1.12, 1.08],
        halfExtents: [0.36, 0.41, 0.43],
        dataQuality: 'vehicle-right hood/visor position model-backed; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.60, 1.10, 0.05],
        halfExtents: [0.15, 0.31, 0.58],
        dataQuality: '100-round load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.60, 1.10, 0.05],
        halfExtents: [0.15, 0.31, 0.58],
        dataQuality: '100-round load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0, 1.41, 0.28],
        halfExtents: [0.50, 0.13, 0.49],
        dataQuality: 'turret-ring datum model-registered; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-commander-gunner',
        kind: 'crew',
        crewRoles: ['COMMANDER_GUNNER'],
        center: [0, 1.38, 0.28],
        offset: [0, 0.36, -0.05],
        halfExtents: [0.33, 0.38, 0.33],
        followsTurret: true,
        dataQuality: 'one-man turret role historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0, 1.38, 0.28],
        offset: [0.10, 0.30, 0.35],
        halfExtents: [0.20, 0.17, 0.34],
        followsTurret: true,
        dataQuality: 'gun-axis datum model-registered; volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [0, 1.38, 0.28],
        offset: [-0.20, 0.28, 0.38],
        halfExtents: [0.09, 0.09, 0.28],
        followsTurret: true,
        dataQuality: 'verified right-side mount model-backed; volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0, 1.38, 0.28],
        offset: [0.29, 0.34, 0.26],
        halfExtents: [0.10, 0.13, 0.16],
        followsTurret: true,
        dataQuality: 'commander observation function historical; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel',
        kind: 'component',
        componentId: 'fuel',
        center: [0.54, 1.08, -1.12],
        halfExtents: [0.17, 0.33, 0.46],
        dataQuality: 'raised rear powerpack association model-backed; volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.08, -1.42],
        halfExtents: [0.63, 0.41, 0.54],
        dataQuality: 'rear engine compartment historical; volume is a gameplay approximation'
      }
    ]
  };
}
