export function createPanzerIIIDInternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 5.8,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical five-man role layout, rear engine, and front transmission arrangement',
      'model-local occupied and stowage bounds are bounded gameplay approximations',
      'not an assertion of exact Ausf. D factory compartment drawings'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.86, 1.98],
        halfExtents: [0.86, 0.32, 0.38],
        dataQuality: 'front-drive arrangement historical; volume is a gameplay approximation'
      },
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [0.48, 1.25, 1.34],
        halfExtents: [0.43, 0.43, 0.47],
        dataQuality: 'role and vehicle-left position historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-radio-operator',
        kind: 'crew',
        crewRoles: ['RADIO_OPERATOR'],
        center: [-0.48, 1.25, 1.34],
        halfExtents: [0.43, 0.43, 0.47],
        dataQuality: 'role and vehicle-right position historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-hull-mg',
        kind: 'component',
        componentId: 'hull_mg',
        center: [-0.50, 1.40, 1.72],
        halfExtents: [0.15, 0.16, 0.24],
        dataQuality: 'radio-operator mount association historical; volume is a gameplay approximation'
      },
      {
        id: 'module-radio',
        kind: 'component',
        componentId: 'radio',
        center: [-0.76, 1.27, 0.91],
        halfExtents: [0.20, 0.30, 0.34],
        dataQuality: 'radio installation and operator role historical; volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.84, 1.26, 0.08],
        halfExtents: [0.18, 0.34, 0.72],
        dataQuality: 'carried load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.84, 1.26, 0.08],
        halfExtents: [0.18, 0.34, 0.72],
        dataQuality: 'carried load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0, 1.62, 0.12],
        halfExtents: [0.68, 0.17, 0.65],
        dataQuality: 'turret-ring datum drawing-registered; mechanism volume is a gameplay approximation'
      },
      {
        id: 'crew-gunner',
        kind: 'crew',
        crewRoles: ['GUNNER'],
        center: [0, 1.58, 0.12],
        offset: [0.36, 0.39, 0.03],
        halfExtents: [0.29, 0.39, 0.32],
        followsTurret: true,
        dataQuality: 'role and gun-side position historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-loader',
        kind: 'crew',
        crewRoles: ['LOADER'],
        center: [0, 1.58, 0.12],
        offset: [-0.36, 0.39, 0.01],
        halfExtents: [0.29, 0.39, 0.34],
        followsTurret: true,
        dataQuality: 'role and gun-side position historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-commander',
        kind: 'crew',
        crewRoles: ['COMMANDER'],
        center: [0, 1.58, 0.12],
        offset: [0, 0.52, -0.43],
        halfExtents: [0.31, 0.38, 0.30],
        followsTurret: true,
        dataQuality: 'three-man turret role historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0, 1.58, 0.12],
        offset: [0, 0.34, 0.43],
        halfExtents: [0.27, 0.22, 0.43],
        followsTurret: true,
        dataQuality: 'gun-axis datum drawing-registered; volume is a gameplay approximation'
      },
      {
        id: 'module-coax',
        kind: 'component',
        componentId: 'coax',
        center: [0, 1.58, 0.12],
        offset: [-0.27, 0.34, 0.57],
        halfExtents: [0.10, 0.10, 0.30],
        followsTurret: true,
        dataQuality: 'right-side coax association source-backed; volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0, 1.58, 0.12],
        offset: [0.37, 0.39, 0.48],
        halfExtents: [0.11, 0.14, 0.18],
        followsTurret: true,
        dataQuality: 'gunner sight association historical; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-left',
        kind: 'component',
        componentId: 'fuel',
        center: [0.90, 1.18, -1.25],
        halfExtents: [0.18, 0.36, 0.52],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-right',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.90, 1.18, -1.25],
        halfExtents: [0.18, 0.36, 0.52],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.12, -1.72],
        halfExtents: [0.90, 0.46, 0.60],
        dataQuality: 'rear engine compartment historical; volume is a gameplay approximation'
      }
    ]
  };
}
