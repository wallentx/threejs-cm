export function createSomuaS35InternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 5.7,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical crew roles and rear engine compartment',
      'model-local crew and module bounds are bounded gameplay approximations',
      'not an assertion of exact stowage or anatomical position'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [0.34, 1.16, 1.34],
        halfExtents: [0.39, 0.48, 0.43],
        dataQuality: 'role historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-radio-operator',
        kind: 'crew',
        crewRoles: ['RADIO_OPERATOR'],
        center: [-0.34, 1.16, 1.12],
        halfExtents: [0.39, 0.48, 0.48],
        dataQuality: 'role historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-commander-gunner',
        kind: 'crew',
        crewRoles: ['COMMANDER_GUNNER'],
        center: [0, 1.92, 0.38],
        offset: [0, 0.12, -0.04],
        halfExtents: [0.34, 0.48, 0.34],
        followsTurret: true,
        dataQuality: 'one-man turret role historical; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-breech',
        kind: 'component',
        componentId: 'breech',
        center: [0, 1.91, 0.38],
        offset: [0, 0, 0.28],
        halfExtents: [0.25, 0.20, 0.34],
        followsTurret: true,
        dataQuality: 'mount association historical; volume is a gameplay approximation'
      },
      {
        id: 'module-turret-traverse',
        kind: 'component',
        componentId: 'turret_traverse',
        center: [0, 1.60, 0.38],
        halfExtents: [0.52, 0.18, 0.48],
        dataQuality: 'turret-ring location inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-optics',
        kind: 'component',
        componentId: 'optics',
        center: [0, 1.91, 0.38],
        offset: [0.30, 0.18, 0.18],
        halfExtents: [0.12, 0.15, 0.16],
        followsTurret: true,
        dataQuality: 'observation role historical; volume is a gameplay approximation'
      },
      {
        id: 'module-radio',
        kind: 'component',
        componentId: 'radio',
        center: [-0.62, 1.10, 0.82],
        halfExtents: [0.18, 0.34, 0.34],
        dataQuality: 'radio installation historical; volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-left',
        kind: 'component',
        componentId: 'ammunition',
        center: [0.72, 1.18, 0.20],
        halfExtents: [0.16, 0.39, 0.66],
        dataQuality: 'carried load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-right',
        kind: 'component',
        componentId: 'ammunition',
        center: [-0.72, 1.18, 0.20],
        halfExtents: [0.16, 0.39, 0.66],
        dataQuality: 'carried load historical; stowage volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-left',
        kind: 'component',
        componentId: 'fuel',
        center: [0.72, 1.05, -0.84],
        halfExtents: [0.17, 0.38, 0.48],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-fuel-right',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.72, 1.05, -0.84],
        halfExtents: [0.17, 0.38, 0.48],
        dataQuality: 'rear powerpack association inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.07, -1.46],
        halfExtents: [0.75, 0.51, 0.61],
        dataQuality: 'rear engine compartment historical; volume is a gameplay approximation'
      },
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.83, -2.08],
        halfExtents: [0.68, 0.34, 0.30],
        dataQuality: 'rear final-drive association inferred; volume is a gameplay approximation'
      }
    ]
  };
}
