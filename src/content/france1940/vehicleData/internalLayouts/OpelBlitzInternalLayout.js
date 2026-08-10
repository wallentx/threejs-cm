export function createOpelBlitzInternalLayout(referenceUrl) {
  return {
    version: 'model-local-obb-path-v1',
    maxPathMeters: 6.4,
    entryOffsetMeters: 0.015,
    dataQuality: [
      'historical unarmored Opel Blitz 3.6-36 S general-service truck configuration',
      'bonnet, cab, wheelbase, axle, and cargo-body stations follow the authored registered elevations',
      'seat sides, crew, engine, transmission, fuel, and mixed ammunition-cargo bounds are gameplay approximations'
    ].join('; '),
    referenceUrl,
    volumes: [
      {
        id: 'module-engine',
        kind: 'component',
        componentId: 'engine',
        center: [0, 1.07, 2.02],
        halfExtents: [0.58, 0.34, 0.58],
        dataQuality: 'registered bonnet stations model-backed; engine volume is a gameplay approximation'
      },
      {
        id: 'module-transmission',
        kind: 'component',
        componentId: 'transmission',
        center: [0, 0.79, 1.23],
        halfExtents: [0.50, 0.22, 0.38],
        dataQuality: 'historical 4x2 drivetrain and exact axle stations; transmission volume is a gameplay approximation'
      },
      {
        id: 'crew-driver',
        kind: 'crew',
        crewRoles: ['DRIVER'],
        center: [0.42, 1.38, 0.93],
        halfExtents: [0.35, 0.40, 0.35],
        dataQuality: 'left-hand-drive seat side historical; occupied volume and longitudinal station are gameplay approximations'
      },
      {
        id: 'crew-vehicle-commander',
        kind: 'crew',
        crewRoles: ['PASSENGER'],
        center: [-0.42, 1.38, 0.93],
        halfExtents: [0.35, 0.40, 0.35],
        dataQuality: 'right cab-seat side inferred; occupied volume and longitudinal station are gameplay approximations'
      },
      {
        id: 'module-fuel',
        kind: 'component',
        componentId: 'fuel',
        center: [-0.70, 0.72, -0.18],
        halfExtents: [0.18, 0.22, 0.44],
        dataQuality: 'chassis-mounted tank position inferred; volume is a gameplay approximation'
      },
      {
        id: 'module-ammunition-cargo',
        kind: 'component',
        componentId: 'ammunition',
        center: [0, 1.35, -1.18],
        halfExtents: [0.86, 0.48, 0.92],
        dataQuality: 'bounded mixed supply load in the cargo body is a gameplay approximation authorized for the logistics slice'
      }
    ]
  };
}
