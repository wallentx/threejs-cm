export function createPanzerIICInternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 5.1,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical three-man crew, front drive, rear engine, radio, and two-man turret arrangement',
      'driver visor, turret offset, ring, gun axis, sprocket, and engine-deck stations follow the authored Ausf. C model',
      'crew, mechanism, fuel, radio, and ammunition bounds are gameplay approximations'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.72, 1.93],
        halfExtents: [0.69, 0.27, 0.35],
        dataQuality: 'front drive-sprocket datum model-registered; internal volume is a gameplay approximation'
      },
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [0.38, 1.16, 1.12],
        halfExtents: [0.35, 0.38, 0.42],
        dataQuality: 'vehicle-left driver visor model-backed; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-radio',
        kind: 'component',
        componentId: 'radio',
        center: [-0.72, 1.14, 0.67],
        halfExtents: [0.18, 0.29, 0.34],
        dataQuality: 'radio installation and loader-radio role historical; position is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.80, 1.12, 0.02],
        halfExtents: [0.15, 0.31, 0.64],
        dataQuality: '180-round 2 cm load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.80, 1.12, 0.02],
        halfExtents: [0.15, 0.31, 0.64],
        dataQuality: '180-round 2 cm load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0.17, 1.43, 0.25],
        halfExtents: [0.60, 0.13, 0.59],
        dataQuality: 'left-offset turret-ring datum model-registered; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-commander-gunner',
        kind: 'crew',
        crewRoles: ['COMMANDER_GUNNER'],
        center: [0.17, 1.43, 0.25],
        offset: [0.22, 0.30, 0.08],
        halfExtents: [0.28, 0.33, 0.32],
        followsTurret: true,
        dataQuality: 'commander-gunner role historical; occupied turret position is a gameplay approximation'
      },
      {
        id: 'crew-loader-radio',
        kind: 'crew',
        crewRoles: ['LOADER_RADIO'],
        center: [0.17, 1.43, 0.25],
        offset: [-0.28, 0.27, -0.18],
        halfExtents: [0.28, 0.32, 0.32],
        followsTurret: true,
        dataQuality: 'loader-radio role historical; occupied turret position is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0.17, 1.43, 0.25],
        offset: [0.02, 0.25, 0.43],
        halfExtents: [0.22, 0.17, 0.33],
        followsTurret: true,
        dataQuality: '2 cm gun-axis datum model-registered; volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [0.17, 1.43, 0.25],
        offset: [-0.12, 0.26, 0.39],
        halfExtents: [0.09, 0.09, 0.27],
        followsTurret: true,
        dataQuality: 'vehicle-right rendered coax mount model-backed; volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0.17, 1.43, 0.25],
        offset: [0.45, 0.32, 0.27],
        halfExtents: [0.11, 0.13, 0.17],
        followsTurret: true,
        dataQuality: 'commander observation function historical; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-left',
        kind: 'component',
        componentId: 'fuel',
        center: [0.78, 1.02, -0.93],
        halfExtents: [0.16, 0.31, 0.43],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-right',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.78, 1.02, -0.93],
        halfExtents: [0.16, 0.31, 0.43],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.03, -1.47],
        halfExtents: [0.73, 0.36, 0.51],
        dataQuality: 'rear engine-deck louvre stations model-backed; internal volume is a gameplay approximation'
      }
    ]
  };
}
