export function createPanhard178InternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 5.1,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical four-man crew, APX 3 two-man turret, radio, and dual driving stations',
      'driver, turret-ring, gun-axis, and rear engine stations follow the authored blueprint-registered model',
      'crew, drivetrain, radio, fuel, and ammunition bounds are gameplay approximations'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.76, 1.88],
        halfExtents: [0.62, 0.28, 0.36],
        dataQuality: 'front axle and all-wheel drivetrain historical; transmission volume is a gameplay approximation'
      },
      {
        id: 'crew-forward-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [0.29, 1.22, 1.38],
        halfExtents: [0.34, 0.39, 0.38],
        dataQuality: 'vehicle-left forward visor model-backed; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.68, 1.17, 0.22],
        halfExtents: [0.14, 0.32, 0.61],
        dataQuality: '150-round AP load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.68, 1.17, 0.22],
        halfExtents: [0.14, 0.32, 0.61],
        dataQuality: '150-round AP load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0, 1.65, 0.24],
        halfExtents: [0.61, 0.14, 0.59],
        dataQuality: 'APX 3 turret-ring datum model-registered; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-gunner',
        kind: 'crew',
        crewRoles: ['GUNNER'],
        center: [0, 1.65, 0.24],
        offset: [0.28, 0.36, 0.05],
        halfExtents: [0.28, 0.37, 0.33],
        followsTurret: true,
        dataQuality: 'two-man turret and gunner role historical; occupied position is a gameplay approximation'
      },
      {
        id: 'crew-commander',
        kind: 'crew',
        crewRoles: ['COMMANDER'],
        center: [0, 1.65, 0.24],
        offset: [-0.28, 0.40, -0.27],
        halfExtents: [0.28, 0.38, 0.31],
        followsTurret: true,
        dataQuality: 'two-man turret and commander-loader role historical; occupied position is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0, 1.65, 0.24],
        offset: [0.10, 0.27, 0.40],
        halfExtents: [0.22, 0.18, 0.31],
        followsTurret: true,
        dataQuality: '25 mm gun-axis datum model-registered; volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [0, 1.65, 0.24],
        offset: [0.15, 0.235, 0.40],
        halfExtents: [0.09, 0.09, 0.27],
        followsTurret: true,
        dataQuality: 'vehicle-left rendered coax mount model-backed; volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0, 1.65, 0.24],
        offset: [-0.38, 0.42, 0.31],
        halfExtents: [0.11, 0.14, 0.17],
        followsTurret: true,
        dataQuality: 'commander observation function historical; volume is a gameplay approximation'
      },
      {
        id: 'module-radio',
        kind: 'component',
        componentId: 'radio',
        center: [0.60, 1.19, -1.18],
        halfExtents: [0.17, 0.31, 0.34],
        dataQuality: 'radio installation and rear operator role historical; internal position is a gameplay approximation'
      },
      {
        id: 'module-fuel-right',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.62, 1.02, -1.18],
        halfExtents: [0.16, 0.31, 0.43],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 0.96, -1.33],
        halfExtents: [0.55, 0.39, 0.49],
        dataQuality: 'rear engine-deck station model-backed; internal volume is a gameplay approximation'
      },
      {
        id: 'crew-rear-driver-radio',
        kind: 'crew',
        crewRoles: ['REAR_DRIVER_RADIO'],
        center: [0.30, 1.16, -1.88],
        halfExtents: [0.33, 0.36, 0.31],
        dataQuality: 'vehicle-left rear visor and rear-facing role model-backed; occupied volume is a gameplay approximation'
      }
    ]
  };
}
