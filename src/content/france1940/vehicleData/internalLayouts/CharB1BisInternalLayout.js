export function createCharB1BisInternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 6.5,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical four-man role layout, rear engine and drive, one-man APX 4 turret, and asymmetric hull armament',
      'model-backed stations use the registered Char B1 bis envelope and visible weapon datums',
      'occupied, mechanism, fuel, radio, and stowage bounds are bounded gameplay approximations',
      'the current component contract represents the simulated turret 47 mm breech and does not invent a separate hull 75 mm damage component'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'crew-driver-hull-gunner',
        kind: 'crew',
        crewRoles: ['DRIVER_HULL_GUNNER'],
        center: [0.43, 1.48, 1.88],
        halfExtents: [0.34, 0.46, 0.53],
        dataQuality: 'combined role and vehicle-left driver hood are historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-hull-loader',
        kind: 'crew',
        crewRoles: ['HULL_LOADER'],
        center: [-0.31, 1.30, 1.45],
        halfExtents: [0.34, 0.43, 0.55],
        dataQuality: '75 mm loader role and forward fighting-compartment location are historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-hull-mg',
        kind: 'component',
        componentId: 'hull_mg',
        center: [-0.76, 1.36, 2.25],
        halfExtents: [0.13, 0.13, 0.30],
        dataQuality: 'right-side fixed hull mount association is historical; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-radio-operator',
        kind: 'crew',
        crewRoles: ['RADIO_OPERATOR'],
        center: [0.38, 1.28, -0.62],
        halfExtents: [0.38, 0.43, 0.47],
        dataQuality: 'dedicated radio-operator role and rear fighting-compartment station are historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-radio',
        kind: 'component',
        componentId: 'radio',
        center: [0.73, 1.34, -0.87],
        halfExtents: [0.18, 0.27, 0.34],
        dataQuality: 'radio installation and operator association are historical; equipment volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.86, 1.09, 0.30],
        halfExtents: [0.17, 0.32, 0.78],
        dataQuality: 'mixed carried ammunition is historical; consolidated vehicle-left stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.86, 1.09, 0.30],
        halfExtents: [0.17, 0.32, 0.78],
        dataQuality: 'mixed carried ammunition is historical; consolidated vehicle-right stowage volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0, 1.88, 0.95],
        halfExtents: [0.68, 0.16, 0.73],
        dataQuality: 'turret-ring station is model-backed; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-commander-gunner',
        kind: 'crew',
        crewRoles: ['COMMANDER_GUNNER'],
        center: [0, 1.88, 0.95],
        offset: [0, 0.42, -0.02],
        halfExtents: [0.34, 0.39, 0.38],
        followsTurret: true,
        dataQuality: 'one-man APX 4 turret role is historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0, 1.88, 0.95],
        offset: [0, 0.34, 0.43],
        halfExtents: [0.25, 0.20, 0.40],
        followsTurret: true,
        dataQuality: '47 mm gun-axis station is model-backed; breech volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [0, 1.88, 0.95],
        offset: [-0.24, 0.34, 0.51],
        halfExtents: [0.09, 0.09, 0.28],
        followsTurret: true,
        dataQuality: 'right-side coax association is historical; mechanism volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0, 1.88, 0.95],
        offset: [0.28, 0.42, 0.43],
        halfExtents: [0.11, 0.13, 0.18],
        followsTurret: true,
        dataQuality: 'commander-gunner sight association is historical; equipment volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-left',
        kind: 'component',
        componentId: 'fuel',
        center: [0.91, 1.08, -1.85],
        halfExtents: [0.16, 0.34, 0.58],
        dataQuality: 'rear powerpack association is inferred; fuel volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-right',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.91, 1.08, -1.85],
        halfExtents: [0.16, 0.34, 0.58],
        dataQuality: 'rear powerpack association is inferred; fuel volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.16, -2.12],
        halfExtents: [0.76, 0.48, 0.70],
        dataQuality: 'raised rear engine-cover station is model-backed; powerplant volume is a gameplay approximation'
      },
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.83, -2.68],
        halfExtents: [0.82, 0.31, 0.38],
        dataQuality: 'rear drive-sprocket arrangement is model-backed and historical; transmission volume is a gameplay approximation'
      }
    ]
  };
}
