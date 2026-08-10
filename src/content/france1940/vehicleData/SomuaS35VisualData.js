import {
  SOMUA_S35_REFERENCE_REGISTRATION
} from './SomuaS35ReferenceGeometry.js';

const freezeView = view => Object.freeze({
  ...view,
  cropPixels: Object.freeze({ ...view.cropPixels }),
  sourceMask: view.sourceMask ? Object.freeze({ ...view.sourceMask }) : undefined,
  fitLandmarkIds: Object.freeze([...view.fitLandmarkIds]),
  landmarkPixels: Object.freeze(Object.fromEntries(
    Object.entries(view.landmarkPixels).map(([id, point]) => [
      id,
      Object.freeze([...point])
    ])
  ))
});

const LINE_ART_SILHOUETTE_MASK = Object.freeze({
  mode: 'line-art-fill',
  luminanceThreshold: 210,
  boundaryDilation: 1,
  minimumInteriorPixels: 4,
  provenance: 'calibration review policy tuned for the registered black-on-white four-view raster'
});

const endViewSilhouetteMask = openRegionSeedPixels => Object.freeze({
  ...LINE_ART_SILHOUETTE_MASK,
  componentPolicy: 'largest',
  openRegionSeedPixels: Object.freeze([
    Object.freeze([...openRegionSeedPixels])
  ]),
  provenance:
    'largest connected vehicle silhouette with a source-pixel seed removing the false ground-line-enclosed under-hull region'
});

const RIGID_SIDE_FIT = Object.freeze([
  'rigid-front',
  'rigid-rear',
  'ground-origin',
  'vehicle-top'
]);
const RIGID_END_FIT = Object.freeze([
  'vehicle-left',
  'vehicle-right',
  'ground-origin',
  'vehicle-top'
]);

const SIDE_REGISTRATION = Object.freeze({
  rigidFrontPixelX: 104,
  rigidRearPixelX: 3978,
  groundLinePixelY: 2037,
  rigidTopPixelY: 32,
  turretRingPixel: Object.freeze([1640, 770])
});
const SIDE_METERS_PER_PIXEL = 5.38 / (
  SIDE_REGISTRATION.rigidRearPixelX - SIDE_REGISTRATION.rigidFrontPixelX
);
const SIDE_VERTICAL_METERS_PER_PIXEL = 2.62 / (
  SIDE_REGISTRATION.groundLinePixelY - SIDE_REGISTRATION.rigidTopPixelY
);
const SIDE_ORIGIN_PIXEL_X = (
  SIDE_REGISTRATION.rigidFrontPixelX + SIDE_REGISTRATION.rigidRearPixelX
) * 0.5;
const SIDE_ORIGIN_PIXEL = Object.freeze([
  SIDE_ORIGIN_PIXEL_X,
  SIDE_REGISTRATION.groundLinePixelY
]);
const sourceAxisOrigin = ({ horizontal, vertical }) => Object.freeze([
  (horizontal[0][0] + horizontal[1][0]) * 0.5,
  (vertical[0][1] + vertical[1][1]) * 0.5
]);
const sidePixelToZ = pixelX => (
  (SIDE_ORIGIN_PIXEL_X - pixelX) * SIDE_METERS_PER_PIXEL
);
const sidePixelToY = pixelY => (
  (SIDE_REGISTRATION.groundLinePixelY - pixelY)
  * SIDE_VERTICAL_METERS_PER_PIXEL
);
const turretPixelToLocalY = pixelY => (
  (SIDE_REGISTRATION.turretRingPixel[1] - pixelY)
  * (2.62 - 1.55)
  / (
    SIDE_REGISTRATION.turretRingPixel[1]
    - SIDE_REGISTRATION.rigidTopPixelY
  )
);

const HULL_SECTION_SOURCE = Object.freeze([
  { pixelX: 3978, deckPixelY: 1248, widths: [0.24, 0.34, 0.40, 0.32, 0.18], levels: [0.73, 0.80, 0.89, 0.97] },
  { pixelX: 3800, deckPixelY: 1050, widths: [0.43, 0.62, 0.78, 0.70, 0.52], levels: [0.55, 0.68, 0.98, 1.17] },
  { pixelX: 3600, deckPixelY: 905, widths: [0.62, 0.80, 0.94, 0.87, 0.72], levels: [0.36, 0.54, 1.12, 1.37] },
  { pixelX: 3300, deckPixelY: 855, widths: [0.71, 0.89, 0.99, 0.91, 0.79] },
  { pixelX: 3000, deckPixelY: 815, widths: [0.72, 0.90, 1.00, 0.92, 0.80] },
  { pixelX: 2700, deckPixelY: 785, widths: [0.72, 0.90, 1.00, 0.92, 0.80] },
  { pixelX: 2400, deckPixelY: 765, widths: [0.72, 0.90, 1.00, 0.92, 0.79] },
  { pixelX: 2100, deckPixelY: 760, widths: [0.72, 0.90, 1.00, 0.92, 0.79] },
  { pixelX: 1750, deckPixelY: 760, widths: [0.72, 0.90, 1.00, 0.92, 0.78] },
  { pixelX: 1400, deckPixelY: 760, widths: [0.72, 0.90, 1.00, 0.92, 0.77] },
  { pixelX: 1100, deckPixelY: 760, widths: [0.71, 0.89, 0.99, 0.90, 0.75] },
  { pixelX: 800, deckPixelY: 760, widths: [0.68, 0.86, 0.98, 0.88, 0.70] },
  { pixelX: 620, deckPixelY: 1000, widths: [0.62, 0.82, 0.95, 0.82, 0.58], levels: [0.36, 0.55, 1.08, 1.28] },
  { pixelX: 420, deckPixelY: 1095, widths: [0.50, 0.70, 0.84, 0.70, 0.42], levels: [0.43, 0.61, 0.97, 1.13] },
  { pixelX: 260, deckPixelY: 1160, widths: [0.38, 0.54, 0.68, 0.52, 0.28], levels: [0.54, 0.69, 0.91, 1.05] },
  { pixelX: 104, deckPixelY: 1290, widths: [0.20, 0.30, 0.34, 0.24, 0.12], levels: [0.72, 0.78, 0.87, 0.93] }
]);

const SOMUA_HULL_STATIONS = Object.freeze(HULL_SECTION_SOURCE.map(source => {
  const deckY = sidePixelToY(source.deckPixelY);
  const [
    bottomHalfWidth,
    lowerHalfWidth,
    shoulderHalfWidth,
    upperHalfWidth,
    deckHalfWidth
  ] = source.widths;
  const [bottomY, lowerY, shoulderY, upperY] = source.levels ?? [
    0.32,
    0.52,
    Math.min(1.34, deckY - 0.22),
    Math.min(deckY - 0.055, 1.50)
  ];
  return Object.freeze({
    z: sidePixelToZ(source.pixelX),
    bottomHalfWidth,
    bottomY,
    lowerHalfWidth,
    lowerY,
    shoulderHalfWidth,
    shoulderY,
    upperHalfWidth,
    upperY,
    deckHalfWidth,
    deckY,
    sourcePixels: Object.freeze([source.pixelX, source.deckPixelY]),
    sourceQuality: source.levels
      ? 'side position and deck contour registered from source pixels; end casting levels and widths constrained by the matching end elevation'
      : 'side position and deck contour registered from source pixels; hidden cast section widths constrained by top and end elevations'
  });
}));

const TURRET_SECTION_SOURCE = Object.freeze([
  { pixelY: 770, frontPixelX: 925, rearPixelX: 2240, plan: [[0, 0.98], [-0.38, 0.91], [-0.70, 0.58], [-0.76, 0.18], [-0.72, -0.46], [-0.50, -0.78], [0, -0.83]] },
  { pixelY: 675, frontPixelX: 955, rearPixelX: 2210, plan: [[0, 0.95], [-0.42, 0.87], [-0.73, 0.53], [-0.78, 0.12], [-0.72, -0.44], [-0.49, -0.75], [0, -0.79]] },
  { pixelY: 560, frontPixelX: 1020, rearPixelX: 2160, plan: [[0, 0.86], [-0.39, 0.79], [-0.68, 0.47], [-0.72, 0.08], [-0.66, -0.40], [-0.45, -0.68], [0, -0.72]] },
  { pixelY: 440, frontPixelX: 1090, rearPixelX: 2110, plan: [[0, 0.76], [-0.35, 0.70], [-0.61, 0.41], [-0.64, 0.05], [-0.59, -0.35], [-0.40, -0.60], [0, -0.64]] },
  { pixelY: 320, frontPixelX: 1180, rearPixelX: 2050, plan: [[0, 0.64], [-0.30, 0.59], [-0.52, 0.34], [-0.55, 0.03], [-0.51, -0.30], [-0.35, -0.51], [0, -0.55]] },
  { pixelY: 245, frontPixelX: 1260, rearPixelX: 1990, plan: [[0, 0.54], [-0.27, 0.50], [-0.46, 0.29], [-0.48, 0.02], [-0.45, -0.25], [-0.31, -0.44], [0, -0.47]] }
]);

const SOMUA_TURRET_STATIONS = Object.freeze(TURRET_SECTION_SOURCE.map(source => {
  const leftHalf = source.plan.map(([x, z]) => Object.freeze([x, z]));
  const rightHalf = source.plan.slice(1, -1).reverse().map(([x, z]) => (
    Object.freeze([-x, z])
  ));
  return Object.freeze({
    y: turretPixelToLocalY(source.pixelY),
    planVertices: Object.freeze([...leftHalf, ...rightHalf]),
    sourcePixels: Object.freeze([
      source.frontPixelX,
      source.pixelY,
      source.rearPixelX
    ]),
    sourceQuality:
      'height and fore/aft extent registered from the side elevation; faceted lateral plan constrained by the rotated top and matching end elevations'
  });
}));

const SOMUA_CUPOLA = Object.freeze({
  centerX: 0.02,
  centerZ: 0,
  baseY: SOMUA_TURRET_STATIONS.at(-1).y,
  drumHeight: 0.16,
  lateralRadius: 0.32,
  longitudinalRadius: 0.40,
  domeHeight: 0.16,
  topY: 1.07,
  sourcePixels: Object.freeze({
    sideBounds: Object.freeze([1285, 32, 1945, 245]),
    frontBounds: Object.freeze([535, 75, 1335, 385]),
    topCenter: Object.freeze([1640, 2900])
  }),
  sourceQuality:
    'longitudinal radius and vertical profile registered from the side view; lateral radius constrained by the front view; hidden curvature inferred'
});

const SOMUA_MANTLET = Object.freeze({
  kind: 'faceted-cast-shield',
  frontZ: 1.05,
  depth: 0.16,
  bevelMeters: 0.015,
  outline: Object.freeze([
    Object.freeze([-0.33, 0.14]),
    Object.freeze([0.27, 0.14]),
    Object.freeze([0.34, 0.22]),
    Object.freeze([0.34, 0.53]),
    Object.freeze([0.25, 0.63]),
    Object.freeze([-0.23, 0.64]),
    Object.freeze([-0.35, 0.52])
  ]),
  sourcePixels: Object.freeze({
    sideBounds: Object.freeze([790, 405, 1010, 750]),
    frontQuality: 'front elevation depicts the turret traversed; width is constrained but not treated as a direct frontal trace'
  }),
  sourceQuality:
    'side silhouette registered directly; transverse outline is cross-view constrained because the end elevation shows a traversed turret'
});

const ROAD_WHEEL_PIXEL_X = Object.freeze(Array.from({ length: 9 }, (_, index) => (
  790 + (3295 - 790) * index / 8
)));
const registeredSupport = ({
  id,
  kind,
  pixelX,
  pixelY,
  radiusPixels,
  radiusQuality
}) => Object.freeze({
  id,
  kind,
  centerY: sidePixelToY(pixelY),
  centerZ: sidePixelToZ(pixelX),
  radius: radiusPixels * SIDE_VERTICAL_METERS_PER_PIXEL,
  sourcePixels: Object.freeze([pixelX, pixelY]),
  sourceRadiusPixels: radiusPixels,
  sourceQuality: radiusQuality
});
const SOMUA_TRACK_SUPPORTS = Object.freeze({
  driveSprocket: registeredSupport({
    id: 'rear-drive-sprocket',
    kind: 'driveSprocket',
    pixelX: 3595,
    pixelY: 1658,
    radiusPixels: 270,
    radiusQuality: 'center registered from the visible rear drive sprocket; radius traced from the secondary side elevation'
  }),
  idlerWheel: registeredSupport({
    id: 'front-idler',
    kind: 'idlerWheel',
    pixelX: 326,
    pixelY: 1665,
    radiusPixels: 235,
    radiusQuality: 'center registered from the visible front idler; radius traced from the secondary side elevation'
  }),
  roadWheels: Object.freeze(ROAD_WHEEL_PIXEL_X.map((pixelX, index) => (
    registeredSupport({
      id: `road-wheel-${index + 1}`,
      kind: 'roadWheel',
      pixelX,
      pixelY: 1905,
      radiusPixels: 132,
      radiusQuality: 'first and last centers are direct source landmarks; intervening centers follow the visible equal-pitch nine-wheel rhythm; radius is traced from the side elevation'
    })
  ))),
  returnRollers: Object.freeze([
    registeredSupport({
      id: 'return-roller-1', kind: 'returnRoller',
      pixelX: 1680, pixelY: 1460, radiusPixels: 61,
      radiusQuality: 'visible return-roller circle registered from the side elevation'
    }),
    registeredSupport({
      id: 'return-roller-2', kind: 'returnRoller',
      pixelX: 2860, pixelY: 1460, radiusPixels: 61,
      radiusQuality: 'visible return-roller circle registered from the side elevation'
    })
  ])
});

/**
 * Immutable source registration for the user-supplied four-elevation drawing.
 * The source is a secondary raster illustration, so horizontal and vertical
 * axes are fitted independently to the published rigid envelope. Component
 * pixels remain evidence; they are not measurements copied from the renderer.
 */
export const SOMUA_S35_VISUAL_DATA = Object.freeze({
  schemaVersion: 1,
  modelId: 'fr_somua',
  coordinateFrame: '+Y up, +Z forward, vehicle right -X, metres',
  dimensionsMeters: Object.freeze({
    length: 5.38,
    width: 2.12,
    height: 2.62
  }),
  blueprint: Object.freeze({
    id: 'france1940.blueprint.vehicle.fr_somua.multiview',
    imageUrl: '/assets/blueprints/france1940/s35-4view.webp',
    originalFileName: 's35-4view.webp',
    sourcePageUrl:
      'https://www.the-blueprints.com/blueprints/tanks/tanks-s/50770/view/somua_s35/',
    sha256: '6a9e9268b514039429e7d0a84485f3773a1d230edad1532f32266a785332909d',
    imagePixels: Object.freeze({ width: 4168, height: 6036 }),
    provenance:
      'user-supplied four-elevation line drawing; source pixels registered independently per view',
    limitations:
      'secondary raster drawing rather than a factory drawing; no bottom or opposite-side elevation, incomplete hidden edges, and cast-surface depth between visible contours remains inferred',
    registrationPolicy:
      'published rigid dimensions own scale; source horizontal and vertical axes fit independently; component landmarks never participate in the rigid fit',
    views: Object.freeze({
      side: freezeView({
        cropPixels: { x: 20, y: 0, width: 4125, height: 2052 },
        sourceMask: LINE_ART_SILHOUETTE_MASK,
        rotationDegrees: 0,
        mirrorX: false,
        fitLandmarkIds: RIGID_SIDE_FIT,
        landmarkPixels: {
          'rigid-front': [104, 2037],
          'rigid-rear': [3978, 2037],
          'ground-origin': SIDE_ORIGIN_PIXEL,
          'vehicle-top': [2041, 32],
          'road-wheel-front-center': [790, 1905],
          'road-wheel-rear-center': [3295, 1905],
          'front-idler-center': [326, 1665],
          'rear-sprocket-center': [3595, 1658],
          'turret-ring-center': [1640, 770],
          'gun-axis-root': [820, 565],
          'engine-deck-rear': [3805, 810]
        }
      }),
      top: freezeView({
        cropPixels: { x: 35, y: 2000, width: 4100, height: 1810 },
        sourceMask: LINE_ART_SILHOUETTE_MASK,
        rotationDegrees: 90,
        mirrorX: false,
        fitLandmarkIds: [
          'rigid-front',
          'rigid-rear',
          'vehicle-left',
          'vehicle-right'
        ],
        landmarkPixels: (() => {
          const rigidFront = [112, 2900];
          const rigidRear = [4055, 2900];
          const vehicleLeft = [2084, 3717];
          const vehicleRight = [2084, 2075];
          return {
            'rigid-front': rigidFront,
            'rigid-rear': rigidRear,
            'vehicle-left': vehicleLeft,
            'vehicle-right': vehicleRight,
            'ground-origin': sourceAxisOrigin({
              horizontal: [vehicleLeft, vehicleRight],
              vertical: [rigidFront, rigidRear]
            }),
            'turret-ring-center': [1640, 2900]
          };
        })()
      }),
      front: freezeView({
        cropPixels: { x: 55, y: 3880, width: 1870, height: 2150 },
        sourceMask: endViewSilhouetteMask([947.5, 5850]),
        rotationDegrees: 0,
        mirrorX: false,
        fitLandmarkIds: RIGID_END_FIT,
        landmarkPixels: (() => {
          const vehicleLeft = [1775, 6020];
          const vehicleRight = [120, 6020];
          return {
            'vehicle-left': vehicleLeft,
            'vehicle-right': vehicleRight,
            'ground-origin': sourceAxisOrigin({
              horizontal: [vehicleLeft, vehicleRight],
              vertical: [vehicleLeft, vehicleRight]
            }),
            'vehicle-top': [947.5, 3955],
            'turret-ring-center': [947.5, 4740],
            'gun-axis-root': [670, 4525]
          };
        })()
      }),
      rear: freezeView({
        cropPixels: { x: 2290, y: 3930, width: 1840, height: 2090 },
        sourceMask: endViewSilhouetteMask([3267.5, 5850]),
        rotationDegrees: 0,
        mirrorX: false,
        fitLandmarkIds: RIGID_END_FIT,
        landmarkPixels: (() => {
          const vehicleLeft = [2470, 6020];
          const vehicleRight = [4065, 6020];
          return {
            'vehicle-left': vehicleLeft,
            'vehicle-right': vehicleRight,
            'ground-origin': sourceAxisOrigin({
              horizontal: [vehicleLeft, vehicleRight],
              vertical: [vehicleLeft, vehicleRight]
            }),
            'vehicle-top': [3267.5, 3990],
            'turret-ring-center': [3267.5, 4740]
          };
        })()
      })
    })
  }),
  reference3d: SOMUA_S35_REFERENCE_REGISTRATION,
  geometry: Object.freeze({
    sideSourceRegistration: Object.freeze({
      ...SIDE_REGISTRATION,
      horizontalMetersPerPixel: SIDE_METERS_PER_PIXEL,
      verticalMetersPerPixel: SIDE_VERTICAL_METERS_PER_PIXEL,
      hullSectionPixels: Object.freeze(
        HULL_SECTION_SOURCE.map(source => Object.freeze([
          source.pixelX,
          source.deckPixelY
        ]))
      ),
      turretSectionPixels: Object.freeze(
        TURRET_SECTION_SOURCE.map(source => Object.freeze([
          source.frontPixelX,
          source.pixelY,
          source.rearPixelX
        ]))
      )
    }),
    hullStations: SOMUA_HULL_STATIONS,
    proxyHullStationIndices: Object.freeze([
      0, 1, 2, 4, 6, 8, 10, 11, 12, 13, 14, 15
    ]),
    turret: Object.freeze({
      stations: SOMUA_TURRET_STATIONS,
      proxyStationIndices: Object.freeze([0, 1, 3, 5]),
      cupola: SOMUA_CUPOLA,
      mantlet: SOMUA_MANTLET
    }),
    runningGear: Object.freeze({
      trackCenterX: 0.8936,
      trackWidth: 0.32,
      trackLength: 5.38,
      supports: SOMUA_TRACK_SUPPORTS,
      sourceQuality:
        'support centers and visible radii are source-registered; link thickness, static tension, and hidden contact geometry remain renderer approximations'
    })
  }),
  evidenceStatus:
    'four-view registration retains rigid-dimension and collision evidence; sealed GLB-derived hull and turret assemblies own production rendering, while exact render/collision surface reconciliation remains pending',
  validation: Object.freeze({
    requiredBlueprintViews: Object.freeze(['side', 'front', 'rear', 'top']),
    requiredLodBands: Object.freeze(['high', 'medium', 'core', 'proxy'])
  })
});
