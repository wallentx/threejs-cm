export function createPanzer38tInternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 4.9,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical four-man early Panzer 38(t) crew, front drive, rear engine, radio, and two-man turret arrangement',
      'driver visor, hull/coax MG mounts, turret ring, gun axis, cupola, and engine deck follow the authored model',
      'crew, mechanism, fuel, radio, and ammunition bounds are gameplay approximations'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.75, 1.89],
        halfExtents: [0.66, 0.27, 0.34],
        dataQuality: 'front drive arrangement historical; internal volume is a gameplay approximation'
      },
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [0.39, 1.23, 1.20],
        halfExtents: [0.34, 0.39, 0.42],
        dataQuality: 'vehicle-left driver visor model-backed; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-radio-operator',
        kind: 'crew',
        crewRoles: ['RADIO_OPERATOR'],
        center: [-0.40, 1.24, 1.16],
        halfExtents: [0.34, 0.39, 0.42],
        dataQuality: 'right bow MG and radio-operator role historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-hull-mg',
        kind: 'component',
        componentId: 'hull_mg',
        center: [-0.44, 1.43, 1.39],
        halfExtents: [0.13, 0.14, 0.23],
        dataQuality: 'vehicle-right rendered MG 37(t) housing model-backed; volume is a gameplay approximation'
      },
      {
        id: 'module-radio',
        kind: 'component',
        componentId: 'radio',
        center: [-0.68, 1.20, 0.70],
        halfExtents: [0.18, 0.30, 0.34],
        dataQuality: 'radio installation and operator role historical; position is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.71, 1.16, 0.13],
        halfExtents: [0.14, 0.31, 0.64],
        dataQuality: '90-round main-gun load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.71, 1.16, 0.13],
        halfExtents: [0.14, 0.31, 0.64],
        dataQuality: '90-round main-gun load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0, 1.49, 0.36],
        halfExtents: [0.60, 0.14, 0.64],
        dataQuality: 'turret-ring datum model-registered; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-commander-gunner',
        kind: 'crew',
        crewRoles: ['COMMANDER_GUNNER'],
        center: [0, 1.49, 0.36],
        offset: [0.31, 0.40, -0.10],
        halfExtents: [0.28, 0.37, 0.34],
        followsTurret: true,
        dataQuality: 'left-offset cupola and commander-gunner role historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-loader',
        kind: 'crew',
        crewRoles: ['LOADER'],
        center: [0, 1.49, 0.36],
        offset: [-0.29, 0.36, -0.05],
        halfExtents: [0.28, 0.36, 0.34],
        followsTurret: true,
        dataQuality: 'loader role historical; occupied position is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0, 1.49, 0.36],
        offset: [0.07, 0.22, 0.40],
        halfExtents: [0.23, 0.18, 0.34],
        followsTurret: true,
        dataQuality: '37 mm gun-axis datum model-registered; volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [0, 1.49, 0.36],
        offset: [-0.22, 0.30, 0.39],
        halfExtents: [0.09, 0.09, 0.27],
        followsTurret: true,
        dataQuality: 'vehicle-right rendered coax housing model-backed; volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0, 1.49, 0.36],
        offset: [0.36, 0.44, 0.28],
        halfExtents: [0.11, 0.14, 0.17],
        followsTurret: true,
        dataQuality: 'commander cupola and observation role historical; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-left',
        kind: 'component',
        componentId: 'fuel',
        center: [0.70, 1.04, -0.95],
        halfExtents: [0.15, 0.31, 0.43],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-right',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.70, 1.04, -0.95],
        halfExtents: [0.15, 0.31, 0.43],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.08, -1.38],
        halfExtents: [0.67, 0.39, 0.52],
        dataQuality: 'flat rear engine-deck station model-backed; internal volume is a gameplay approximation'
      }
    ]
  };
}
