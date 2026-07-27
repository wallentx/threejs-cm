export function createLafflyS20TLInternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 5.7,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical unarmored 6x6 troop-carrier configuration',
      'cab seats, bonnet, body breaks, and axle stations follow the authored multi-view model',
      'crew, engine, transmission, and fuel bounds are gameplay approximations'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.10, 2.03],
        halfExtents: [0.58, 0.37, 0.55],
        dataQuality: 'long tapered bonnet stations model-backed; engine volume is a gameplay approximation'
      },
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.92, 1.28],
        halfExtents: [0.49, 0.23, 0.36],
        dataQuality: '6x6 drivetrain and front axle historical; transmission volume is a gameplay approximation'
      },
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [0.42, 1.37, 0.68],
        halfExtents: [0.33, 0.38, 0.34],
        dataQuality: 'vehicle-left authored driver seat model-backed; occupied volume is a gameplay approximation'
      },
      {
        id: 'crew-vehicle-commander',
        kind: 'crew',
        crewRoles: ['PASSENGER'],
        center: [-0.42, 1.37, 0.68],
        halfExtents: [0.33, 0.38, 0.34],
        dataQuality: 'vehicle-right authored passenger seat model-backed; occupied volume is a gameplay approximation'
      },
      {
        id: 'module-fuel',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.66, 0.72, -0.34],
        halfExtents: [0.18, 0.23, 0.42],
        dataQuality: 'chassis-mounted tank position inferred; volume is a gameplay approximation'
      }
    ]
  };
}
