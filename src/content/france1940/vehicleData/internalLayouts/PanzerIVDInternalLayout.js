export function createPanzerIVDInternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 6.0,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical five-man role layout, rear engine, front transmission, three-man turret, and separate bow and coaxial machine guns',
      'model-backed stations use the registered Panzer IV Ausf. D envelope, turret ring, weapon mounts, and engine deck',
      'occupied, mechanism, fuel, radio, and stowage bounds are bounded gameplay approximations',
      'not an assertion of exact Ausf. D factory compartment drawings'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.84, 2.28],
        halfExtents: [0.92, 0.33, 0.38],
        dataQuality: 'front drive-sprocket arrangement is model-backed and historical; transmission volume is a gameplay approximation'
      },
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [0.48, 1.34, 1.72],
        halfExtents: [0.43, 0.43, 0.48],
        dataQuality: 'role and vehicle-left visor station are model-backed and historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-radio-operator',
        kind: 'crew',
        crewRoles: ['RADIO_OPERATOR'],
        center: [-0.48, 1.34, 1.72],
        halfExtents: [0.43, 0.43, 0.48],
        dataQuality: 'role and vehicle-right bow station are historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-hull-mg',
        kind: 'component',
        componentId: 'hull_mg',
        center: [-0.50, 1.52, 2.02],
        halfExtents: [0.15, 0.15, 0.27],
        dataQuality: 'right-side ball-mount station is model-backed; mechanism volume is a gameplay approximation'
      },
      {
        id: 'module-radio',
        kind: 'component',
        componentId: 'radio',
        center: [-0.82, 1.31, 1.03],
        halfExtents: [0.20, 0.29, 0.34],
        dataQuality: 'radio installation and operator role are historical; equipment volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.96, 1.22, 0.15],
        halfExtents: [0.19, 0.35, 0.77],
        dataQuality: '80-round carried load is historical; vehicle-left stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.96, 1.22, 0.15],
        halfExtents: [0.19, 0.35, 0.77],
        dataQuality: '80-round carried load is historical; vehicle-right stowage volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0, 1.70, -0.12],
        halfExtents: [0.79, 0.17, 0.77],
        dataQuality: 'turret-ring station is model-backed; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-gunner',
        kind: 'crew',
        crewRoles: ['GUNNER'],
        center: [0, 1.70, -0.12],
        offset: [0.40, 0.40, 0.07],
        halfExtents: [0.31, 0.40, 0.35],
        followsTurret: true,
        dataQuality: 'three-man turret role and gun-side position are historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-loader',
        kind: 'crew',
        crewRoles: ['LOADER'],
        center: [0, 1.70, -0.12],
        offset: [-0.40, 0.40, 0.03],
        halfExtents: [0.31, 0.40, 0.36],
        followsTurret: true,
        dataQuality: 'three-man turret role and loader-side position are historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-commander',
        kind: 'crew',
        crewRoles: ['COMMANDER'],
        center: [0, 1.70, -0.12],
        offset: [0.08, 0.53, -0.43],
        halfExtents: [0.33, 0.39, 0.31],
        followsTurret: true,
        dataQuality: 'three-man turret role and cupola station are model-backed and historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0, 1.70, -0.12],
        offset: [0.06, 0.30, 0.48],
        halfExtents: [0.31, 0.23, 0.46],
        followsTurret: true,
        dataQuality: '7.5 cm gun-axis station is model-backed; breech volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [0, 1.70, -0.12],
        offset: [-0.25, 0.38, 0.55],
        halfExtents: [0.10, 0.10, 0.30],
        followsTurret: true,
        dataQuality: 'right-side coax station is model-backed; mechanism volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0, 1.70, -0.12],
        offset: [0.43, 0.40, 0.50],
        halfExtents: [0.11, 0.14, 0.19],
        followsTurret: true,
        dataQuality: 'gunner sight association is historical; equipment volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-left',
        kind: 'component',
        componentId: 'fuel',
        center: [0.99, 1.17, -1.35],
        halfExtents: [0.18, 0.36, 0.57],
        dataQuality: 'rear powerpack association is inferred; fuel volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-right',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.99, 1.17, -1.35],
        halfExtents: [0.18, 0.36, 0.57],
        dataQuality: 'rear powerpack association is inferred; fuel volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.14, -1.78],
        halfExtents: [0.94, 0.48, 0.67],
        dataQuality: 'rear engine-grille station is model-backed; powerplant volume is a gameplay approximation'
      }
    ]
  };
}
