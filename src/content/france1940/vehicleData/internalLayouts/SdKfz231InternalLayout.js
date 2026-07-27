export function createSdKfz231InternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 5.9,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical four-man crew, front engine, auxiliary rear driving station, radio, and two-man turret arrangement',
      'driver visors, hull stations, axles, turret ring, gun axis, and MG mount follow the authored 6-Rad model',
      'crew, drivetrain, fuel, radio, and ammunition bounds are gameplay approximations'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.02, 1.75],
        halfExtents: [0.55, 0.38, 0.75],
        dataQuality: 'front armored-bonnet stations and radiator louvres model-backed; volume is a gameplay approximation'
      },
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.78, 0.76],
        halfExtents: [0.53, 0.25, 0.42],
        dataQuality: '6x4 drivetrain historical; transmission volume is a gameplay approximation'
      },
      {
        id: 'crew-forward-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [0.31, 1.28, 0.34],
        halfExtents: [0.33, 0.38, 0.38],
        dataQuality: 'vehicle-left front visor model-backed; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-fuel',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.66, 0.91, 1.30],
        halfExtents: [0.16, 0.28, 0.46],
        dataQuality: 'front powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.66, 1.27, -0.70],
        halfExtents: [0.14, 0.32, 0.61],
        dataQuality: '180-round 2 cm load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.66, 1.27, -0.70],
        halfExtents: [0.14, 0.32, 0.61],
        dataQuality: '180-round 2 cm load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0, 1.72, -0.70],
        halfExtents: [0.55, 0.14, 0.60],
        dataQuality: 'turret-ring datum model-registered; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-gunner',
        kind: 'crew',
        crewRoles: ['GUNNER'],
        center: [0, 1.72, -0.70],
        offset: [0.26, 0.31, 0.05],
        halfExtents: [0.27, 0.33, 0.32],
        followsTurret: true,
        dataQuality: 'two-man turret and gunner role historical; occupied position is a gameplay approximation'
      },
      {
        id: 'crew-commander',
        kind: 'crew',
        crewRoles: ['COMMANDER'],
        center: [0, 1.72, -0.70],
        offset: [-0.26, 0.34, -0.24],
        halfExtents: [0.27, 0.34, 0.31],
        followsTurret: true,
        dataQuality: 'two-man turret and commander-loader role historical; occupied position is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0, 1.72, -0.70],
        offset: [0.10, 0.18, 0.41],
        halfExtents: [0.22, 0.17, 0.33],
        followsTurret: true,
        dataQuality: '2 cm gun-axis datum model-registered; volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [0, 1.72, -0.70],
        offset: [-0.12, 0.27, 0.39],
        halfExtents: [0.09, 0.09, 0.26],
        followsTurret: true,
        dataQuality: 'vehicle-right rendered coax mount model-backed; volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0, 1.72, -0.70],
        offset: [0.38, 0.35, 0.28],
        halfExtents: [0.11, 0.13, 0.17],
        followsTurret: true,
        dataQuality: 'commander observation function historical; volume is a gameplay approximation'
      },
      {
        id: 'module-radio',
        kind: 'component',
        componentId: 'radio',
        center: [0.54, 1.18, -1.55],
        halfExtents: [0.18, 0.30, 0.36],
        dataQuality: 'radio installation and rear operator role historical; position is a gameplay approximation'
      },
      {
        id: 'crew-rear-driver-radio',
        kind: 'crew',
        crewRoles: ['REAR_DRIVER_RADIO'],
        center: [0, 1.18, -2.10],
        halfExtents: [0.34, 0.36, 0.33],
        dataQuality: 'rear-facing visor and auxiliary driver-radio role model-backed; occupied volume is a gameplay approximation'
      }
    ]
  };
}
