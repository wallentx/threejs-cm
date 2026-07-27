const freezeView = view => Object.freeze({
  ...view,
  cropPixels: Object.freeze({ ...view.cropPixels }),
  landmarkPixels: Object.freeze(Object.fromEntries(
    Object.entries(view.landmarkPixels).map(([id, point]) => [
      id,
      Object.freeze([...point])
    ])
  ))
});

// Source-pixel registration for the running gear in the supplied left-facing
// side elevation. The rigid front/rear pixels map to the 4.02 m tail-less
// envelope; Y is measured upward from the registered ground line. Wheel radii
// and the drawn track-link thickness use the same source scale.
const R35_SIDE_TRACK_REGISTRATION = Object.freeze({
  view: 'side',
  rigidFrontPixelX: 49,
  rigidRearPixelX: 2786,
  groundLinePixelY: 1474,
  rigidTopPixelY: 85,
  linkThicknessPixels: 10,
  cleatHeightPixels: 6,
  supports: Object.freeze({
    driveSprocket: Object.freeze({
      id: 'drive-sprocket',
      kind: 'driveSprocket',
      centerPixels: Object.freeze([279, 1047]),
      radiusPixels: 214
    }),
    idlerWheel: Object.freeze({
      id: 'idler-wheel',
      kind: 'idlerWheel',
      centerPixels: Object.freeze([2557, 1160]),
      radiusPixels: 213
    }),
    roadWheels: Object.freeze([
      Object.freeze({ id: 'road-wheel-1', kind: 'roadWheel', centerPixels: Object.freeze([2160, 1328]), radiusPixels: 130 }),
      Object.freeze({ id: 'road-wheel-2', kind: 'roadWheel', centerPixels: Object.freeze([1776, 1328]), radiusPixels: 130 }),
      Object.freeze({ id: 'road-wheel-3', kind: 'roadWheel', centerPixels: Object.freeze([1438, 1328]), radiusPixels: 130 }),
      Object.freeze({ id: 'road-wheel-4', kind: 'roadWheel', centerPixels: Object.freeze([1052, 1328]), radiusPixels: 130 }),
      Object.freeze({ id: 'road-wheel-5', kind: 'roadWheel', centerPixels: Object.freeze([706, 1328]), radiusPixels: 130 })
    ]),
    returnRollers: Object.freeze([
      Object.freeze({ id: 'return-roller-1', kind: 'returnRoller', centerPixels: Object.freeze([2223, 931]), radiusPixels: 56 }),
      Object.freeze({ id: 'return-roller-2', kind: 'returnRoller', centerPixels: Object.freeze([1602, 907]), radiusPixels: 56 }),
      Object.freeze({ id: 'return-roller-3', kind: 'returnRoller', centerPixels: Object.freeze([1014, 909]), radiusPixels: 56 })
    ])
  })
});

const R35_SIDE_METERS_PER_PIXEL = (
  4.02
  / (
    R35_SIDE_TRACK_REGISTRATION.rigidRearPixelX
    - R35_SIDE_TRACK_REGISTRATION.rigidFrontPixelX
  )
);
const R35_SIDE_VERTICAL_METERS_PER_PIXEL = (
  2.13
  / (
    R35_SIDE_TRACK_REGISTRATION.groundLinePixelY
    - R35_SIDE_TRACK_REGISTRATION.rigidTopPixelY
  )
);
const R35_SIDE_ORIGIN_PIXEL_X = (
  R35_SIDE_TRACK_REGISTRATION.rigidFrontPixelX
  + R35_SIDE_TRACK_REGISTRATION.rigidRearPixelX
) * 0.5;

const R35_FRONT_REGISTRATION = Object.freeze({
  view: 'front',
  rigidRightPixelX: 2975,
  rigidLeftPixelX: 4140,
  turretCenterPixelX: 3590,
  cupolaCenterPixelX: 3640,
  cupolaRadiusPixels: 150
});
const R35_FRONT_METERS_PER_PIXEL = (
  1.87
  / (
    R35_FRONT_REGISTRATION.rigidLeftPixelX
    - R35_FRONT_REGISTRATION.rigidRightPixelX
  )
);
const frontPixelToTurretLocalX = pixelX => (
  (pixelX - R35_FRONT_REGISTRATION.turretCenterPixelX)
  * R35_FRONT_METERS_PER_PIXEL
);

function registeredTrackSupport(source) {
  const [pixelX, pixelY] = source.centerPixels;
  return Object.freeze({
    id: source.id,
    kind: source.kind,
    centerY: (
      R35_SIDE_TRACK_REGISTRATION.groundLinePixelY - pixelY
    ) * R35_SIDE_VERTICAL_METERS_PER_PIXEL,
    centerZ: (
      R35_SIDE_ORIGIN_PIXEL_X - pixelX
    ) * R35_SIDE_METERS_PER_PIXEL,
    radius: source.radiusPixels * R35_SIDE_METERS_PER_PIXEL,
    sourcePixels: source.centerPixels,
    sourceRadiusPixels: source.radiusPixels,
    registrationQuality:
      'registered directly from the visible support circle in the supplied secondary side elevation'
  });
}

const sidePixelToZ = pixelX => (
  (R35_SIDE_ORIGIN_PIXEL_X - pixelX) * R35_SIDE_METERS_PER_PIXEL
);
const sidePixelToY = pixelY => (
  (
    R35_SIDE_TRACK_REGISTRATION.groundLinePixelY - pixelY
  ) * R35_SIDE_VERTICAL_METERS_PER_PIXEL
);

const R35_TRACK_SUPPORTS = Object.freeze({
  driveSprocket: registeredTrackSupport(
    R35_SIDE_TRACK_REGISTRATION.supports.driveSprocket
  ),
  idlerWheel: registeredTrackSupport(
    R35_SIDE_TRACK_REGISTRATION.supports.idlerWheel
  ),
  roadWheels: Object.freeze(
    R35_SIDE_TRACK_REGISTRATION.supports.roadWheels.map(registeredTrackSupport)
  ),
  returnRollers: Object.freeze(
    R35_SIDE_TRACK_REGISTRATION.supports.returnRollers.map(
      registeredTrackSupport
    )
  )
});

const R35_HULL_SIDE_STATIONS = Object.freeze([
  { pixelX: 2670, deckPixelY: 720, widths: [0.45, 0.58, 0.68, 0.58, 0.42] },
  { pixelX: 2600, deckPixelY: 600, widths: [0.55, 0.66, 0.74, 0.67, 0.56] },
  { pixelX: 2500, deckPixelY: 560, widths: [0.60, 0.70, 0.76, 0.71, 0.64] },
  { pixelX: 2300, deckPixelY: 550, widths: [0.64, 0.73, 0.76, 0.71, 0.65] },
  { pixelX: 2100, deckPixelY: 550, widths: [0.64, 0.73, 0.76, 0.71, 0.65] },
  { pixelX: 1900, deckPixelY: 555, widths: [0.64, 0.73, 0.76, 0.71, 0.65] },
  { pixelX: 1700, deckPixelY: 565, widths: [0.64, 0.73, 0.76, 0.71, 0.65] },
  { pixelX: 1500, deckPixelY: 555, widths: [0.64, 0.73, 0.76, 0.71, 0.65] },
  { pixelX: 1300, deckPixelY: 545, widths: [0.63, 0.72, 0.75, 0.69, 0.63] },
  { pixelX: 1150, deckPixelY: 570, widths: [0.61, 0.71, 0.75, 0.68, 0.59] },
  { pixelX: 1000, deckPixelY: 620, widths: [0.58, 0.69, 0.74, 0.66, 0.57] },
  { pixelX: 850, deckPixelY: 700, widths: [0.52, 0.65, 0.72, 0.64, 0.54] },
  {
    pixelX: 550,
    deckPixelY: 710,
    widths: [0.55, 0.67, 0.72, 0.64, 0.54],
    levels: [0.34, 0.47, 0.88, 1.04]
  },
  {
    pixelX: 342,
    deckPixelY: 828,
    widths: [0.45, 0.61, 0.69, 0.59, 0.47],
    levels: [0.30, 0.40, 0.72, 0.88]
  },
  {
    pixelX: 206,
    deckPixelY: 913,
    widths: [0.38, 0.57, 0.67, 0.55, 0.40],
    levels: [0.31, 0.39, 0.60, 0.76]
  },
  {
    pixelX: 104,
    deckPixelY: 1004,
    widths: [0.31, 0.51, 0.64, 0.49, 0.31],
    levels: [0.39, 0.44, 0.55, 0.66]
  },
  {
    pixelX: 49,
    deckPixelY: 1076,
    widths: [0.23, 0.43, 0.61, 0.43, 0.23],
    levels: [0.51, 0.53, 0.55, 0.58]
  }
].map(source => {
  const [
    bottomHalfWidth,
    lowerHalfWidth,
    halfWidth,
    upperHalfWidth,
    deckHalfWidth
  ] = source.widths;
  const deckY = sidePixelToY(source.deckPixelY);
  const [
    bottomY,
    lowerY,
    shoulderY,
    upperY
  ] = source.levels ?? [
    0.34,
    0.50,
    Math.min(deckY - 0.035, sidePixelToY(750)),
    null
  ];
  return Object.freeze({
    z: sidePixelToZ(source.pixelX),
    bottomHalfWidth,
    bottomY,
    lowerHalfWidth,
    lowerY,
    halfWidth,
    shoulderY,
    upperHalfWidth,
    upperY: upperY ?? shoulderY + (deckY - shoulderY) * 0.58,
    deckHalfWidth,
    deckY,
    sourcePixels: Object.freeze([source.pixelX, source.deckPixelY]),
    inferredSectionLevels: source.levels
      ? Object.freeze([...source.levels])
      : null,
    sourceQuality:
      source.levels
        ? 'forward z and visible upper contour registered from side elevation; track-occluded belly and cross-section widths constrained by front/top elevations and labeled inference'
        : 'z and visible deck height registered from side elevation; hidden belly and cross-section widths constrained by front/top elevations and labeled inference'
  });
}));

const R35_MUDGUARD_SOURCE_PIXELS = Object.freeze([
  Object.freeze([49, 820]),
  Object.freeze([220, 755]),
  Object.freeze([500, 740]),
  Object.freeze([2350, 740]),
  Object.freeze([2550, 755]),
  Object.freeze([2700, 790]),
  Object.freeze([2786, 850]),
  Object.freeze([2786, 890]),
  Object.freeze([2670, 865]),
  Object.freeze([2520, 800]),
  Object.freeze([500, 790]),
  Object.freeze([220, 800]),
  Object.freeze([49, 870])
]);
const R35_MUDGUARD_OUTLINE = Object.freeze(
  R35_MUDGUARD_SOURCE_PIXELS.map(([pixelX, pixelY]) => Object.freeze([
    sidePixelToZ(pixelX),
    sidePixelToY(pixelY)
  ]))
);

const R35_SUSPENSION_SOURCE_ASSEMBLIES = Object.freeze([
  Object.freeze({
    id: 'leading-single-wheel',
    outlinePixels: Object.freeze([
      Object.freeze([450, 1230]),
      Object.freeze([500, 1005]),
      Object.freeze([595, 1005]),
      Object.freeze([620, 1120]),
      Object.freeze([790, 1180]),
      Object.freeze([815, 1270]),
      Object.freeze([790, 1350]),
      Object.freeze([730, 1400]),
      Object.freeze([560, 1380]),
      Object.freeze([480, 1320])
    ]),
    springPackBoundsPixels: Object.freeze({
      left: 610,
      right: 810,
      top: 966,
      bottom: 1120
    }),
    springElementCount: 4
  }),
  Object.freeze({
    id: 'forward-paired-bogie',
    outlinePixels: Object.freeze([
      Object.freeze([920, 1285]),
      Object.freeze([980, 1035]),
      Object.freeze([1070, 1000]),
      Object.freeze([1140, 1000]),
      Object.freeze([1165, 1050]),
      Object.freeze([1340, 1050]),
      Object.freeze([1370, 1000]),
      Object.freeze([1435, 1000]),
      Object.freeze([1495, 1285]),
      Object.freeze([1500, 1345]),
      Object.freeze([1430, 1395]),
      Object.freeze([1320, 1380]),
      Object.freeze([1235, 1350]),
      Object.freeze([1150, 1380]),
      Object.freeze([1040, 1400]),
      Object.freeze([955, 1360])
    ]),
    springPackBoundsPixels: Object.freeze({
      left: 1115,
      right: 1350,
      top: 968,
      bottom: 1118
    }),
    springElementCount: 5
  }),
  Object.freeze({
    id: 'rear-paired-bogie',
    outlinePixels: Object.freeze([
      Object.freeze([1645, 1285]),
      Object.freeze([1710, 1035]),
      Object.freeze([1790, 1000]),
      Object.freeze([1860, 1000]),
      Object.freeze([1885, 1050]),
      Object.freeze([2055, 1050]),
      Object.freeze([2080, 1000]),
      Object.freeze([2150, 1000]),
      Object.freeze([2220, 1285]),
      Object.freeze([2210, 1350]),
      Object.freeze([2140, 1400]),
      Object.freeze([2035, 1380]),
      Object.freeze([1965, 1350]),
      Object.freeze([1880, 1380]),
      Object.freeze([1770, 1400]),
      Object.freeze([1680, 1360])
    ]),
    springPackBoundsPixels: Object.freeze({
      left: 1830,
      right: 2065,
      top: 968,
      bottom: 1118
    }),
    springElementCount: 5
  })
]);

const R35_SUSPENSION_ASSEMBLIES = Object.freeze(
  R35_SUSPENSION_SOURCE_ASSEMBLIES.map(source => {
    const bounds = source.springPackBoundsPixels;
    return Object.freeze({
      id: source.id,
      outline: Object.freeze(
        source.outlinePixels.map(([pixelX, pixelY]) => Object.freeze([
          sidePixelToZ(pixelX),
          sidePixelToY(pixelY)
        ]))
      ),
      springPack: Object.freeze({
        centerY: (
          sidePixelToY(bounds.top) + sidePixelToY(bounds.bottom)
        ) * 0.5,
        centerZ: (
          sidePixelToZ(bounds.left) + sidePixelToZ(bounds.right)
        ) * 0.5,
        height: sidePixelToY(bounds.top) - sidePixelToY(bounds.bottom),
        spanZ: sidePixelToZ(bounds.left) - sidePixelToZ(bounds.right),
        elementCount: source.springElementCount,
        sourceBoundsPixels: bounds
      }),
      sourceOutlinePixels: source.outlinePixels,
      sourceQuality:
        'visible side-plate contour and spring-pack bounds traced from the supplied secondary side elevation'
    });
  })
);

const R35_TURRET_SIDE_SECTIONS = Object.freeze([
  { pixelY: 555, frontPixelX: 1150, rearPixelX: 2000, halfWidth: 0.50 },
  { pixelY: 503, frontPixelX: 1150, rearPixelX: 1930, halfWidth: 0.56 },
  { pixelY: 450, frontPixelX: 1170, rearPixelX: 1900, halfWidth: 0.55 },
  { pixelY: 400, frontPixelX: 1200, rearPixelX: 1870, halfWidth: 0.53 },
  { pixelY: 350, frontPixelX: 1230, rearPixelX: 1840, halfWidth: 0.50 },
  { pixelY: 300, frontPixelX: 1260, rearPixelX: 1810, halfWidth: 0.47 },
  { pixelY: 250, frontPixelX: 1290, rearPixelX: 1780, halfWidth: 0.43 },
  { pixelY: 198, frontPixelX: 1340, rearPixelX: 1740, halfWidth: 0.38 }
]);
const R35_TURRET_DECK_Y = sidePixelToY(
  R35_TURRET_SIDE_SECTIONS[0].pixelY
);
const R35_TURRET_CENTER_Z = (
  sidePixelToZ(R35_TURRET_SIDE_SECTIONS[0].frontPixelX)
  + sidePixelToZ(R35_TURRET_SIDE_SECTIONS[0].rearPixelX)
) * 0.5;
const R35_TURRET_SECTIONS = Object.freeze(
  R35_TURRET_SIDE_SECTIONS.map(source => {
    const frontZ = sidePixelToZ(source.frontPixelX);
    const rearZ = sidePixelToZ(source.rearPixelX);
    const centerZ = (frontZ + rearZ) * 0.5;
    return Object.freeze({
      y: sidePixelToY(source.pixelY) - R35_TURRET_DECK_Y,
      halfWidth: source.halfWidth,
      frontLength: frontZ - centerZ,
      rearLength: centerZ - rearZ,
      centerZ: centerZ - R35_TURRET_CENTER_Z,
      sourcePixels: Object.freeze([
        source.frontPixelX,
        source.pixelY,
        source.rearPixelX
      ]),
      sourceQuality:
        'side height and fore/aft outline registered from side elevation; lateral half-width constrained by front/top elevations'
    });
  })
);

/**
 * Canonical renderer-owned data for the represented tail-less Renault R35.
 *
 * Geometry values are authored in metres from the registered orthographic
 * sheet. Pixel registrations retain the source-space evidence separately from
 * the emitted mesh, so calibration compares the model to the drawing rather
 * than to a previous model capture.
 */
export const RENAULT_R35_VISUAL_DATA = Object.freeze({
  schemaVersion: 1,
  modelId: 'fr_renault_r35',
  coordinateFrame: '+Y up, +Z forward, vehicle right -X, metres',
  dimensionsMeters: Object.freeze({
    length: 4.02,
    width: 1.87,
    height: 2.13
  }),
  blueprint: Object.freeze({
    id: 'france1940.blueprint.vehicle.fr_renault_r35.multiview',
    imageUrl: '/assets/blueprints/france1940/renault-r-35-2.png',
    originalFileName: 'renault-r-35-2.png',
    sourcePageUrl:
      'https://www.the-blueprints.com/blueprints/tanks/tanks-r/50737/view/renault_r35/',
    sha256: '11ef1ab07dcfc0672016c5ebad845894c5750d056c682419fb5177b033ba8df5',
    imagePixels: Object.freeze({ width: 4351, height: 3096 }),
    provenance:
      'user-supplied four-elevation line drawing; source pixels registered independently per view',
    limitations:
      'secondary drawing rather than a factory drawing; hidden casting radii remain inferred between visible elevations',
    views: Object.freeze({
      side: freezeView({
        cropPixels: { x: 20, y: 65, width: 2800, height: 1435 },
        rotationDegrees: 0,
        mirrorX: false,
        landmarkPixels: {
          'rigid-front': [49, 1474],
          'rigid-rear': [2786, 1474],
          'ground-origin': [1417.5, 1474],
          'vehicle-top': [1330, 85],
          'turret-ring-center': [1472, 535],
          'gun-axis-root': [1140, 300]
        }
      }),
      top: freezeView({
        cropPixels: { x: 48, y: 1715, width: 2645, height: 1365 },
        rotationDegrees: -90,
        mirrorX: false,
        landmarkPixels: {
          'rigid-front': [52, 2398],
          'rigid-rear': [2690, 2398],
          'vehicle-left': [1371, 3055],
          'vehicle-right': [1371, 1742],
          'turret-ring-center': [1540, 2398]
        }
      }),
      front: freezeView({
        cropPixels: { x: 2900, y: 45, width: 1350, height: 1435 },
        rotationDegrees: 0,
        mirrorX: false,
        landmarkPixels: {
          'vehicle-left': [4140, 1460],
          'vehicle-right': [2975, 1460],
          'ground-origin': [3558, 1460],
          'vehicle-top': [3558, 76],
          'turret-ring-center': [3590, 505],
          'gun-axis-root': [3500, 330]
        }
      })
    })
  }),
  geometry: Object.freeze({
    sideSourceRegistration: Object.freeze({
      view: 'side',
      horizontalMetersPerPixel: R35_SIDE_METERS_PER_PIXEL,
      verticalMetersPerPixel: R35_SIDE_VERTICAL_METERS_PER_PIXEL,
      originPixelX: R35_SIDE_ORIGIN_PIXEL_X,
      groundLinePixelY: R35_SIDE_TRACK_REGISTRATION.groundLinePixelY,
      hullDeckStations: Object.freeze(
        R35_HULL_SIDE_STATIONS.map(station => station.sourcePixels)
      ),
      mudguardOutlinePixels: R35_MUDGUARD_SOURCE_PIXELS,
      suspensionAssemblies: Object.freeze(
        R35_SUSPENSION_SOURCE_ASSEMBLIES.map(assembly => Object.freeze({
          id: assembly.id,
          outlinePixels: assembly.outlinePixels,
          springPackBoundsPixels: assembly.springPackBoundsPixels,
          springElementCount: assembly.springElementCount
        }))
      ),
      turretSectionsPixels: Object.freeze(
        R35_TURRET_SECTIONS.map(section => section.sourcePixels)
      )
    }),
    frontSourceRegistration: Object.freeze({
      ...R35_FRONT_REGISTRATION,
      horizontalMetersPerPixel: R35_FRONT_METERS_PER_PIXEL
    }),
    hullStations: R35_HULL_SIDE_STATIONS,
    proxyHullStationIndices: Object.freeze([
      0, 2, 4, 6, 8, 10, 11, 12, 13, 14, 15, 16
    ]),
    mudguard: Object.freeze({
      centerX: 0.79,
      depth: 0.24,
      outline: R35_MUDGUARD_OUTLINE,
      sourcePixels: R35_MUDGUARD_SOURCE_PIXELS,
      sourceQuality:
        'side outline registered directly; lateral depth constrained by front/top elevations'
    }),
    suspension: Object.freeze({
      lateralCenterX: 0.895,
      plateDepth: 0.055,
      springDepth: 0.07,
      springElementGapRatio: 0.08,
      assemblies: R35_SUSPENSION_ASSEMBLIES,
      sourceQuality:
        'side plate contours and leaf-spring pack bounds registered directly; plate thickness and transverse depth are inferred'
    }),
    turret: Object.freeze({
      centerX: 0.00,
      centerZ: R35_TURRET_CENTER_Z,
      deckY: R35_TURRET_DECK_Y,
      sections: R35_TURRET_SECTIONS,
      proxySectionIndices: Object.freeze([0, 2, 4, 6, 7]),
      mantlet: Object.freeze({
        kind: 'asymmetric-cast-shield-with-cylindrical-collars',
        frontZ: 0.535,
        depth: 0.045,
        bevelMeters: 0.012,
        outline: Object.freeze([
          Object.freeze([-0.42, 0.10]),
          Object.freeze([0.34, 0.10]),
          Object.freeze([0.40, 0.16]),
          Object.freeze([0.40, 0.43]),
          Object.freeze([0.33, 0.50]),
          Object.freeze([-0.32, 0.50]),
          Object.freeze([-0.42, 0.41])
        ]),
        mainCollar: Object.freeze({
          x: -0.16, y: 0.35, radius: 0.135, depth: 0.105
        }),
        lowerCover: Object.freeze({
          x: -0.16, y: 0.17, radius: 0.145, depth: 0.055
        }),
        coaxCollar: Object.freeze({
          x: 0.20, y: 0.29, radius: 0.072, depth: 0.095
        })
      }),
      cupola: Object.freeze({
        kind: 'source-registered-cast-dome',
        centerX: frontPixelToTurretLocalX(
          R35_FRONT_REGISTRATION.cupolaCenterPixelX
        ),
        baseY: R35_TURRET_SECTIONS.at(-1).y,
        centerZ: sidePixelToZ(1540) - R35_TURRET_CENTER_Z,
        radius: (
          R35_FRONT_REGISTRATION.cupolaRadiusPixels
          * R35_FRONT_METERS_PER_PIXEL
        ),
        height: sidePixelToY(90) - sidePixelToY(198),
        sourcePixels: Object.freeze({
          base: Object.freeze([1340, 198, 1740]),
          top: Object.freeze([1540, 90]),
          frontCenter: Object.freeze([
            R35_FRONT_REGISTRATION.cupolaCenterPixelX,
            160
          ]),
          frontRadius: R35_FRONT_REGISTRATION.cupolaRadiusPixels
        })
      }),
      hatch: Object.freeze({
        centerX: frontPixelToTurretLocalX(
          R35_FRONT_REGISTRATION.cupolaCenterPixelX
        ),
        centerY: (
          sidePixelToY(90)
          - R35_TURRET_DECK_Y
          + (sidePixelToY(85) - sidePixelToY(90)) * 0.5
        ),
        centerZ: sidePixelToZ(1540) - R35_TURRET_CENTER_Z,
        radius: 0.105,
        height: sidePixelToY(85) - sidePixelToY(90),
        sourcePixels: Object.freeze({
          base: Object.freeze([1540, 90]),
          top: Object.freeze([1540, 85])
        })
      })
    }),
    driverVisor: Object.freeze({
      side: 'left',
      center: Object.freeze([0.23, sidePixelToY(635), sidePixelToZ(875)]),
      size: Object.freeze([0.24, 0.035, 0.026]),
      slopeRadians: -1.02,
      sourcePixels: Object.freeze([875, 635])
    }),
    mainGun: Object.freeze({
      side: 'right',
      x: -0.16,
      y: sidePixelToY(300) - R35_TURRET_DECK_Y,
      barrelLength: 0.40,
      muzzleZ: 0.95
    }),
    coax: Object.freeze({
      side: 'left',
      x: 0.20,
      y: 0.29,
      barrelLength: 0.48,
      muzzleZ: 0.80
    }),
    runningGear: Object.freeze({
      trackWidth: 0.29,
      trackCenterX: 0.7842,
      trackLength: 4.02,
      trackHeight: 0.97,
      trackCenterY: 0.485,
      roadWheelCentersZ: Object.freeze(
        R35_TRACK_SUPPORTS.roadWheels.map(wheel => wheel.centerZ)
      ),
      trackPath: Object.freeze({
        model: 'wheel-supported-quasi-static-v1',
        quality:
          'all wheel/roller centers and radii plus link thickness registered from the supplied side elevation; track mass and static tension are labeled renderer approximations',
        sourceRegistration: R35_SIDE_TRACK_REGISTRATION,
        driveSprocket: R35_TRACK_SUPPORTS.driveSprocket,
        idlerWheel: R35_TRACK_SUPPORTS.idlerWheel,
        roadWheels: R35_TRACK_SUPPORTS.roadWheels,
        returnRollers: R35_TRACK_SUPPORTS.returnRollers,
        linkThickness: (
          R35_SIDE_TRACK_REGISTRATION.linkThicknessPixels
          * R35_SIDE_METERS_PER_PIXEL
        ),
        cleatHeight: (
          R35_SIDE_TRACK_REGISTRATION.cleatHeightPixels
          * R35_SIDE_METERS_PER_PIXEL
        ),
        linearMassKgPerMeter: 38,
        tensionNewtons: 18000,
        gravityMetersPerSecondSquared: 9.80665,
        circleSegments: 36,
        maximumSegmentMeters: 0.065
      })
    })
  }),
  validation: Object.freeze({
    requiredBlueprintViews: Object.freeze(['side', 'front', 'top']),
    requiredLodBands: Object.freeze(['high', 'medium', 'core', 'proxy']),
    requiredParts: Object.freeze([
      'R35_CastHull',
      'R35_DriverVisor',
      'R35_APXR_Turret',
      'R35_SA18_MantletShield',
      'R35_SA18_MainCollar',
      'R35_SA18_Barrel',
      'R35_ProxyCastHull',
      'R35_ProxyRightMudguard',
      'R35_ProxyLeftMudguard'
    ]),
    forbiddenParts: Object.freeze([
      'R35_DriverHood',
      'R35_CastNose',
      'R35_SA18_Mantlet'
    ]),
    closedParts: Object.freeze([
      'R35_CastHull',
      'R35_APXR_Turret',
      'R35_SA18_MantletShield'
    ]),
    mountSides: Object.freeze({
      main: 'right',
      coax: 'left'
    }),
    sourceMechanics: Object.freeze({
      sourceToleranceMeters: 1e-9,
      hullStations: Object.freeze({
        minimumCount: 17,
        requireStrictAscendingZ: true
      }),
      turret: Object.freeze({
        objectName: 'Turret',
        positionToleranceMeters: 0.001
      }),
      sideProfile: Object.freeze({
        minimumHullStations: 17,
        terminalHullPixelX: R35_SIDE_TRACK_REGISTRATION.rigidFrontPixelX,
        minimumMudguardPoints: 12,
        minimumSuspensionAssemblies: 3,
        minimumTurretSections: 8
      }),
      frontProfile: Object.freeze({
        requireRegisteredCupola: true
      }),
      track: Object.freeze({
        detailObjectName: 'R35RunningGear',
        proxyObjectName: 'R35SupportedTrackProxy',
        expectedModel: 'wheel-supported-quasi-static-v1',
        minimumSupportCount: 10,
        maximumSagMeters: 0.01,
        sourceRegistrationToleranceMeters: 1e-9
      })
    })
  })
});
