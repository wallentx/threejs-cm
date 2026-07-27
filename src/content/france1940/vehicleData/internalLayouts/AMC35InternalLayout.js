export function createAMC35InternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 4.9,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical three-man crew, APX 2 two-man turret, and rear engine arrangement',
      'driver side and turret/powerpack stations follow the authored blueprint-registered model',
      'crew, mechanism, fuel, and ammunition bounds are gameplay approximations'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.75, 1.82],
        halfExtents: [0.70, 0.27, 0.34],
        dataQuality: 'front sprocket and nose stations model-backed; internal volume is a gameplay approximation'
      },
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [-0.42, 1.25, 0.91],
        halfExtents: [0.39, 0.41, 0.45],
        dataQuality: 'vehicle-right visor and driver bay model-backed; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.78, 1.18, 0.02],
        halfExtents: [0.16, 0.34, 0.63],
        dataQuality: '120-round carried load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.78, 1.18, 0.02],
        halfExtents: [0.16, 0.34, 0.63],
        dataQuality: '120-round carried load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0, 1.60, -0.10],
        halfExtents: [0.58, 0.15, 0.56],
        dataQuality: 'turret-ring datum model-registered; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-gunner-loader',
        kind: 'crew',
        crewRoles: ['GUNNER_LOADER'],
        center: [0, 1.60, -0.10],
        offset: [0.28, 0.36, 0.08],
        halfExtents: [0.28, 0.37, 0.33],
        followsTurret: true,
        dataQuality: 'two-man turret and combined role historical; occupied position is a gameplay approximation'
      },
      {
        id: 'crew-commander',
        kind: 'crew',
        crewRoles: ['COMMANDER'],
        center: [0, 1.60, -0.10],
        offset: [-0.28, 0.40, -0.29],
        halfExtents: [0.28, 0.38, 0.31],
        followsTurret: true,
        dataQuality: 'two-man turret and commander role historical; occupied position is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0, 1.60, -0.10],
        offset: [-0.10, 0.26, 0.42],
        halfExtents: [0.23, 0.19, 0.34],
        followsTurret: true,
        dataQuality: 'gun-axis datum model-registered; volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [0, 1.60, -0.10],
        offset: [0.17, 0.24, 0.43],
        halfExtents: [0.09, 0.09, 0.27],
        followsTurret: true,
        dataQuality: 'coaxial MAC 31 mount historical; lateral placement and volume are gameplay approximations'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0, 1.60, -0.10],
        offset: [-0.43, 0.42, 0.34],
        halfExtents: [0.11, 0.14, 0.17],
        followsTurret: true,
        dataQuality: 'authored APX 2 vision-block stations model-backed; internal volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-left',
        kind: 'component',
        componentId: 'fuel',
        center: [0.76, 1.07, -1.08],
        halfExtents: [0.17, 0.34, 0.43],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-right',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.76, 1.07, -1.08],
        halfExtents: [0.17, 0.34, 0.43],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.05, -1.53],
        halfExtents: [0.76, 0.43, 0.57],
        dataQuality: 'rear engine-deck stations model-backed; internal volume is a gameplay approximation'
      }
    ]
  };
}
