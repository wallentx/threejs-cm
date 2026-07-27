export function createPanzer35tInternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 5.2,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical four-man crew, rear drive, rear engine, radio, and two-man turret arrangement',
      'driver/radio visors, rear sprocket, turret ring, gun axis, MG mounts, and engine deck follow the authored model',
      'crew, mechanism, fuel, radio, and ammunition bounds are gameplay approximations'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [-0.34, 1.20, 1.13],
        halfExtents: [0.34, 0.39, 0.43],
        dataQuality: 'vehicle-right driver visor model-backed; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-radio-operator',
        kind: 'crew',
        crewRoles: ['RADIO_OPERATOR'],
        center: [0.38, 1.20, 1.10],
        halfExtents: [0.34, 0.39, 0.43],
        dataQuality: 'vehicle-left radio-operator visor model-backed; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-hull-mg',
        kind: 'component',
        componentId: 'hull_mg',
        center: [-0.42, 1.38, 1.45],
        halfExtents: [0.13, 0.14, 0.23],
        dataQuality: 'vehicle-right rendered ball mount model-backed; internal volume is a gameplay approximation'
      },
      {
        id: 'module-radio',
        kind: 'component',
        componentId: 'radio',
        center: [0.65, 1.18, 0.70],
        halfExtents: [0.18, 0.30, 0.34],
        dataQuality: 'radio installation and operator role historical; position is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.66, 1.16, 0.12],
        halfExtents: [0.14, 0.31, 0.64],
        dataQuality: '78-round main-gun load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.66, 1.16, 0.12],
        halfExtents: [0.14, 0.31, 0.64],
        dataQuality: '78-round main-gun load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0, 1.52, 0.18],
        halfExtents: [0.59, 0.14, 0.60],
        dataQuality: '1.267 m turret-ring datum source-backed; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-commander-gunner',
        kind: 'crew',
        crewRoles: ['COMMANDER_GUNNER'],
        center: [0, 1.52, 0.18],
        offset: [0.27, 0.39, 0.05],
        halfExtents: [0.28, 0.37, 0.33],
        followsTurret: true,
        dataQuality: 'commander-gunner role historical; occupied position is a gameplay approximation'
      },
      {
        id: 'crew-loader',
        kind: 'crew',
        crewRoles: ['LOADER'],
        center: [0, 1.52, 0.18],
        offset: [-0.28, 0.36, -0.16],
        halfExtents: [0.28, 0.36, 0.33],
        followsTurret: true,
        dataQuality: 'loader role historical; occupied position is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0, 1.52, 0.18],
        offset: [0.10, 0.30, 0.42],
        halfExtents: [0.23, 0.18, 0.34],
        followsTurret: true,
        dataQuality: '37.2 mm gun-axis datum model-registered; volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [0, 1.52, 0.18],
        offset: [-0.22, 0.30, 0.39],
        halfExtents: [0.09, 0.09, 0.27],
        followsTurret: true,
        dataQuality: 'vehicle-right rendered coax mount model-backed; volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0, 1.52, 0.18],
        offset: [0.42, 0.42, 0.30],
        halfExtents: [0.11, 0.14, 0.17],
        followsTurret: true,
        dataQuality: 'commander cupola and observation role historical; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-left',
        kind: 'component',
        componentId: 'fuel',
        center: [0.65, 1.04, -1.03],
        halfExtents: [0.15, 0.31, 0.43],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-right',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.65, 1.04, -1.03],
        halfExtents: [0.15, 0.31, 0.43],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.08, -1.48],
        halfExtents: [0.63, 0.38, 0.50],
        dataQuality: 'sloped rear engine-deck stations model-backed; internal volume is a gameplay approximation'
      },
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.78, -2.06],
        halfExtents: [0.60, 0.27, 0.33],
        dataQuality: 'rear drive-sprocket datum model-registered; internal volume is a gameplay approximation'
      }
    ]
  };
}
