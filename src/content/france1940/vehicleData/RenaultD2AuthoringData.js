const deepFreeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const DIMENSIONS_METERS = Object.freeze({
  length: 5.46,
  width: 2.22,
  height: 2.67
});

const SIDE_REGISTRATION = Object.freeze({
  rigidFrontPixelX: 14,
  rigidRearPixelX: 949,
  groundLinePixelY: 561,
  rigidTopPixelY: 77
});
const SIDE_HORIZONTAL_METERS_PER_PIXEL = (
  DIMENSIONS_METERS.length
  / (
    SIDE_REGISTRATION.rigidRearPixelX
    - SIDE_REGISTRATION.rigidFrontPixelX
  )
);
const SIDE_VERTICAL_METERS_PER_PIXEL = (
  DIMENSIONS_METERS.height
  / (
    SIDE_REGISTRATION.groundLinePixelY
    - SIDE_REGISTRATION.rigidTopPixelY
  )
);
const SIDE_ORIGIN_PIXEL_X = (
  SIDE_REGISTRATION.rigidFrontPixelX
  + SIDE_REGISTRATION.rigidRearPixelX
) * 0.5;
const sidePixelToZ = pixelX => (
  (SIDE_ORIGIN_PIXEL_X - pixelX) * SIDE_HORIZONTAL_METERS_PER_PIXEL
);
const sidePixelToY = pixelY => (
  (SIDE_REGISTRATION.groundLinePixelY - pixelY)
  * SIDE_VERTICAL_METERS_PER_PIXEL
);

const registeredSupport = ({
  id,
  kind,
  centerPixels,
  radiusPixels,
  radiusMeters = null,
  pathRadiusMeters = null
}) => Object.freeze({
  id,
  kind,
  centerY: sidePixelToY(centerPixels[1]),
  centerZ: sidePixelToZ(centerPixels[0]),
  radius: radiusMeters ?? (
    radiusPixels
    * (
      SIDE_HORIZONTAL_METERS_PER_PIXEL
      + SIDE_VERTICAL_METERS_PER_PIXEL
    )
    * 0.5
  ),
  ...(pathRadiusMeters == null ? {} : { pathRadius: pathRadiusMeters }),
  sourcePixels: Object.freeze([...centerPixels]),
  sourceRadiusPixels: radiusPixels,
  sourceQuality:
    'LLM-placed circle on the supplied side elevation; requires human datum review'
});

const ROAD_WHEEL_PIXELS = Object.freeze([
  [132, 523], [177, 523], [222, 523], [267, 523], [312, 523],
  [357, 523], [402, 523], [447, 523], [492, 523], [537, 523],
  [582, 523], [627, 523], [672, 523], [717, 523], [762, 523]
]);

const RETURN_ROLLER_PIXELS = Object.freeze([
  [151, 375], [253, 374], [355, 373], [457, 373],
  [559, 373], [661, 373], [763, 374]
]);

const TRACK_PATH = deepFreeze({
  model: 'wheel-supported-quasi-static-v1',
  quality:
    'support positions are LLM-registered from a secondary drawing; mass and tension are renderer approximations',
  driveSprocket: registeredSupport({
    id: 'drive-sprocket',
    kind: 'driveSprocket',
    centerPixels: [834, 410],
    radiusPixels: 49,
    radiusMeters: 0.29
  }),
  idlerWheel: registeredSupport({
    id: 'idler-wheel',
    kind: 'idlerWheel',
    centerPixels: [66, 426],
    radiusPixels: 39,
    radiusMeters: 0.23
  }),
  roadWheels: ROAD_WHEEL_PIXELS.map((centerPixels, index) => registeredSupport({
    id: `road-wheel-${index + 1}`,
    kind: 'roadWheel',
    centerPixels,
    radiusPixels: 19,
    radiusMeters: 0.112,
    pathRadiusMeters: sidePixelToY(centerPixels[1]) - 0.065
  })),
  returnRollers: RETURN_ROLLER_PIXELS.map((centerPixels, index) => registeredSupport({
    id: `return-roller-${index + 1}`,
    kind: 'returnRoller',
    centerPixels,
    radiusPixels: 10,
    radiusMeters: 0.058
  })),
  linkThickness: 0.045,
  cleatHeight: 0.012,
  linearMassKgPerMeter: 44,
  tensionNewtons: 22000,
  gravityMetersPerSecondSquared: 9.80665,
  circleSegments: 40,
  maximumSegmentMeters: 0.065
});

const HULL_SOURCE_STATIONS = Object.freeze([
  {
    pixelX: 924,
    deckPixelY: 361,
    widths: [0.31, 0.46, 0.56, 0.45, 0.32],
    levels: [0.56, 0.72, 0.90, 1.02]
  },
  {
    pixelX: 874,
    deckPixelY: 345,
    widths: [0.50, 0.62, 0.72, 0.64, 0.52],
    levels: [0.54, 0.72, 1.03, 1.14]
  },
  {
    pixelX: 842,
    deckPixelY: 318,
    widths: [0.60, 0.70, 0.78, 0.72, 0.65]
  },
  {
    pixelX: 780,
    deckPixelY: 283,
    widths: [0.67, 0.75, 0.82, 0.77, 0.70]
  },
  {
    pixelX: 725,
    deckPixelY: 251,
    widths: [0.70, 0.78, 0.85, 0.80, 0.74]
  },
  {
    pixelX: 650,
    deckPixelY: 247,
    widths: [0.71, 0.79, 0.86, 0.81, 0.75]
  },
  {
    pixelX: 560,
    deckPixelY: 246,
    widths: [0.71, 0.79, 0.86, 0.81, 0.75]
  },
  {
    pixelX: 470,
    deckPixelY: 246,
    widths: [0.71, 0.79, 0.86, 0.81, 0.75]
  },
  {
    pixelX: 380,
    deckPixelY: 245,
    widths: [0.71, 0.79, 0.86, 0.81, 0.75]
  },
  {
    pixelX: 290,
    deckPixelY: 244,
    widths: [0.70, 0.78, 0.85, 0.80, 0.73]
  },
  {
    pixelX: 210,
    deckPixelY: 245,
    widths: [0.67, 0.76, 0.83, 0.78, 0.70]
  },
  {
    pixelX: 180,
    deckPixelY: 263,
    widths: [0.63, 0.73, 0.81, 0.75, 0.66],
    levels: [0.55, 0.76, 1.28, 1.51]
  },
  {
    pixelX: 150,
    deckPixelY: 300,
    widths: [0.54, 0.68, 0.77, 0.69, 0.57],
    levels: [0.54, 0.72, 1.15, 1.34]
  },
  {
    pixelX: 115,
    deckPixelY: 348,
    widths: [0.42, 0.59, 0.71, 0.61, 0.43],
    levels: [0.52, 0.66, 0.94, 1.08]
  },
  {
    pixelX: 55,
    deckPixelY: 365,
    widths: [0.24, 0.42, 0.61, 0.44, 0.25],
    levels: [0.58, 0.65, 0.88, 1.01]
  },
  {
    pixelX: 14,
    deckPixelY: 357,
    widths: [0.10, 0.24, 0.42, 0.25, 0.10],
    levels: [0.72, 0.77, 0.93, 1.05]
  }
]);

const HULL_STATIONS = HULL_SOURCE_STATIONS.map(source => {
  const deckY = sidePixelToY(source.deckPixelY);
  const [
    bottomHalfWidth,
    lowerHalfWidth,
    halfWidth,
    upperHalfWidth,
    deckHalfWidth
  ] = source.widths.map(width => width * 0.84);
  const [
    bottomY,
    lowerY,
    shoulderY,
    upperY
  ] = source.levels ?? [
    0.54,
    0.74,
    Math.min(1.35, deckY - 0.22),
    Math.min(1.58, deckY - 0.08)
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
    upperY,
    deckHalfWidth,
    deckY,
    sourcePixels: Object.freeze([source.pixelX, source.deckPixelY]),
    sourceQuality:
      'side contour registered; cross-section widths constrained from front/top views and remain LLM inference'
  });
});

const TURRET_DECK_Y = 1.75;
const TURRET_CENTER_Z = sidePixelToZ(331);
const TURRET_RINGS = deepFreeze([
  {
    y: 0.055,
    halfWidth: 0.68,
    frontLength: 0.81,
    rearLength: 0.77,
    centerZ: 0,
    sourcePixels: [194, 228, 463]
  },
  {
    y: 0.15,
    halfWidth: 0.69,
    frontLength: 0.80,
    rearLength: 0.79,
    centerZ: 0,
    sourcePixels: [194, 211, 466]
  },
  {
    y: 0.43,
    halfWidth: 0.65,
    frontLength: 0.78,
    rearLength: 0.76,
    centerZ: 0,
    sourcePixels: [198, 160, 461]
  },
  {
    y: 0.70,
    halfWidth: 0.59,
    frontLength: 0.72,
    rearLength: 0.68,
    centerZ: 0.01,
    sourcePixels: [204, 113, 450]
  },
  {
    y: 0.79,
    halfWidth: 0.50,
    frontLength: 0.60,
    rearLength: 0.56,
    centerZ: 0.02,
    sourcePixels: [220, 98, 430]
  }
]);

const MUDGUARD_SOURCE_PIXELS = deepFreeze([
  [14, 352], [112, 333], [210, 337], [420, 342], [650, 342],
  [820, 344], [904, 361], [949, 381], [946, 398], [885, 380],
  [715, 365], [420, 363], [180, 359], [55, 381], [14, 376]
]);

const SUSPENSION_SKIRT_SOURCE_PIXELS = deepFreeze([
  [118, 383], [790, 383], [815, 407], [783, 492],
  [734, 511], [165, 511], [121, 486], [108, 421]
]);

const sourceSideOutline = points => points.map(([pixelX, pixelY]) => Object.freeze([
  sidePixelToZ(pixelX),
  sidePixelToY(pixelY)
]));

const SOURCE_RECORDS = deepFreeze([
  {
    id: 'renault-d2-secondary-orthographic-sheet',
    title: 'Renault D2 Tourelle APX-4 five-view drawing',
    publisher: 'The-Blueprints.com',
    sourcePageUrl:
      'https://www.the-blueprints.com/blueprints-depot/tanks/tanks-r/renault-d2-tourelle-apx-4.png',
    imageUrl:
      'https://www.the-blueprints.com/blueprints-depot/tanks/tanks-r/renault-d2-tourelle-apx-4.png',
    localImageUrl:
      '/assets/blueprints/france1940/renault-d2-tourelle-apx-4.png',
    sha256:
      '93cf038753a8510e80907e2bcadd267da7dc594ddba081c4619bd486a2cc19d9',
    quality:
      'secondary orthographic illustration; useful registration evidence, not a factory drawing',
    limitations:
      'drawing has no dimension marks; raster axes require independent scaling and some hidden contours remain inferred'
  },
  {
    id: 'shd-char-d2-archive-record',
    title: 'Char D2 technical fascicles, archive record AA/206/4/H/2/31',
    publisher: 'Service historique de la Defense',
    sourcePageUrl: 'https://www.servicehistorique.sga.defense.gouv.fr/ark/950463',
    quality:
      'primary archive catalog record; underlying 1932 fascicles were not digitized in this pass',
    limitations:
      'catalog confirms surviving technical documentation but does not expose drawing measurements online'
  },
  {
    id: 'unabcc-renault-d2-technical-sheet',
    title: 'Renault D2 - Fiche technique',
    publisher: 'UNABCC / chars-francais.net compilation',
    sourcePageUrl:
      'https://www.unabcc.org/app/download/8279653/Renault%2BD2%2B-%2BFiche%2Btechnique.pdf',
    quality:
      'secondary technical compilation',
    limitations:
      'used for published envelope, hull height, crew, running-gear count, drive location, and no-tail statement'
  }
]);

export const RENAULT_D2_AUTHORING_DATA = deepFreeze({
  schemaVersion: 1,
  type: 'parametric-vehicle-authoring-v1',
  modelId: 'fr_renault_d2',
  designation: 'Renault D2',
  meshPrefix: 'D2',
  representedConfiguration:
    'tail-less production vehicle; source filename says APX-4 while the technical sheet identifies an APX 1 turret',
  coordinateFrame: '+Y up, +Z forward, vehicle right -X, metres',
  dimensionsMeters: DIMENSIONS_METERS,
  publishedData: {
    hullHeightMeters: 1.755,
    combatMassTonnes: 20,
    crew: 3,
    roadWheelsPerSide: 15,
    driveLocation: 'rear',
    idlerLocation: 'front',
    trenchTail: false,
    armament:
      '47 mm SA 34 for series 1; 47 mm SA 35 for series 2; coaxial 7.5 mm machine gun',
    evidenceQuality: 'secondary technical compilation pending primary manual transcription'
  },
  blueprint: {
    imagePixels: { width: 1573, height: 2133 },
    sourceRecords: SOURCE_RECORDS,
    selectedSourceId: SOURCE_RECORDS[0].id,
    views: {
      side: {
        label: 'left-facing left-side elevation',
        cropPixels: { x: 8, y: 64, width: 950, height: 506 },
        rigidRegistration: {
          ...SIDE_REGISTRATION,
          horizontalMetersPerPixel: SIDE_HORIZONTAL_METERS_PER_PIXEL,
          verticalMetersPerPixel: SIDE_VERTICAL_METERS_PER_PIXEL,
          originPixelX: SIDE_ORIGIN_PIXEL_X
        },
        landmarks: {
          'rigid-front': [14, 561],
          'rigid-rear': [949, 561],
          'ground-origin': [SIDE_ORIGIN_PIXEL_X, 561],
          'vehicle-top': [350, 77],
          'turret-ring-center': [331, 228],
          'gun-axis-root': [195, 179]
        },
        componentPolygons: {
          runningGear: [
            [14, 352], [902, 351], [949, 384], [880, 541],
            [110, 558], [20, 493]
          ],
          hull: [
            [112, 348], [180, 260], [207, 244], [719, 246],
            [858, 315], [870, 352], [804, 378], [118, 378]
          ],
          turret: [
            [194, 228], [198, 115], [245, 88], [398, 90],
            [452, 118], [466, 208], [448, 229]
          ],
          mantletAndGun: [
            [65, 172], [65, 186], [190, 188], [212, 214],
            [216, 137], [193, 167]
          ],
          engineCooling: [
            [563, 275], [771, 278], [771, 329], [565, 330]
          ]
        },
        circles: [
          {
            id: 'drive-sprocket',
            kind: 'driveSprocket',
            centerPixels: [834, 410],
            radiusPixels: 49
          },
          {
            id: 'idler-wheel',
            kind: 'idlerWheel',
            centerPixels: [66, 426],
            radiusPixels: 39
          },
          ...ROAD_WHEEL_PIXELS.map((centerPixels, index) => ({
            id: `road-wheel-${index + 1}`,
            kind: 'roadWheel',
            centerPixels,
            radiusPixels: 19
          })),
          ...RETURN_ROLLER_PIXELS.map((centerPixels, index) => ({
            id: `return-roller-${index + 1}`,
            kind: 'returnRoller',
            centerPixels,
            radiusPixels: 10
          }))
        ]
      },
      oppositeSide: {
        label: 'right-facing right-side elevation',
        cropPixels: { x: 626, y: 432, width: 929, height: 497 },
        registrationStatus:
          'split and retained as asymmetric review evidence; metre registration not yet accepted'
      },
      front: {
        label: 'front elevation',
        cropPixels: { x: 182, y: 1162, width: 440, height: 505 },
        rigidRegistration: {
          rigidRightPixelX: 222,
          rigidLeftPixelX: 590,
          groundLinePixelY: 1654,
          rigidTopPixelY: 1194,
          horizontalMetersPerPixel: DIMENSIONS_METERS.width / (590 - 222),
          verticalMetersPerPixel: DIMENSIONS_METERS.height / (1654 - 1194),
          originPixelX: 406
        },
        landmarks: {
          'vehicle-right': [222, 1654],
          'vehicle-left': [590, 1654],
          'ground-origin': [406, 1654],
          'vehicle-top': [408, 1194],
          'turret-ring-center': [407, 1363],
          'main-gun-axis': [337, 1308],
          'coax-axis': [425, 1312]
        },
        componentPolygons: {
          tracks: [
            [222, 1429], [290, 1412], [296, 1654], [222, 1654],
            [590, 1654], [584, 1412], [520, 1429]
          ],
          hull: [
            [275, 1435], [307, 1368], [506, 1368], [540, 1435],
            [528, 1570], [285, 1570]
          ],
          turret: [
            [291, 1364], [312, 1265], [360, 1232], [470, 1234],
            [512, 1270], [522, 1364]
          ],
          mantlet: [
            [307, 1274], [455, 1275], [455, 1362], [307, 1362]
          ]
        }
      },
      rear: {
        label: 'rear elevation',
        cropPixels: { x: 1100, y: 1160, width: 433, height: 510 },
        registrationStatus:
          'split and retained for cooling-deck and rear-width review; metre registration not yet accepted'
      },
      top: {
        label: 'top elevation, vehicle front at image left',
        cropPixels: { x: 396, y: 1734, width: 904, height: 395 },
        rigidRegistration: {
          rigidFrontPixelX: 408,
          rigidRearPixelX: 1289,
          rigidRightPixelY: 1746,
          rigidLeftPixelY: 2120,
          longitudinalMetersPerPixel: DIMENSIONS_METERS.length / (1289 - 408),
          lateralMetersPerPixel: DIMENSIONS_METERS.width / (2120 - 1746),
          originPixelX: 848.5,
          originPixelY: 1933
        },
        landmarks: {
          'rigid-front': [408, 1933],
          'rigid-rear': [1289, 1933],
          'vehicle-right': [848.5, 1746],
          'vehicle-left': [848.5, 2120],
          'turret-ring-center': [694, 1934],
          'gun-axis-root': [529, 1993]
        },
        componentPolygons: {
          tracksAndMudguards: [
            [408, 1746], [1289, 1748], [1289, 2120], [408, 2117]
          ],
          hull: [
            [494, 1840], [1178, 1840], [1243, 1880], [1240, 2042],
            [1168, 2080], [495, 2074], [449, 2014], [449, 1892]
          ],
          turret: [
            [544, 1851], [790, 1848], [851, 1927], [794, 2015],
            [550, 2013], [504, 1936]
          ],
          engineDeck: [
            [875, 1844], [1245, 1850], [1242, 2078], [870, 2076]
          ]
        }
      }
    },
    extractionReview:
      'view rectangles, component polygons, circles, and landmarks are an LLM first pass and intentionally editable data'
  },
  geometry: {
    hull: {
      kind: 'symmetric-section-loft',
      stations: HULL_STATIONS,
      proxyStationIndices: [0, 2, 4, 6, 8, 10, 11, 12, 13, 14, 15],
      sourceQuality:
        'side deck contour registered; transverse rings inferred from front/top silhouettes'
    },
    turret: {
      kind: 'asymmetric-elliptic-section-loft',
      center: [0, TURRET_DECK_Y, TURRET_CENTER_Z],
      rings: TURRET_RINGS,
      proxyRingIndices: [0, 2, 4],
      segments: 18,
      sourceQuality:
        'side/front/top constrained LLM loft; exact APX variant remains unresolved',
      cupola: {
        center: [0.02, 0, 0.03],
        radius: 0.33,
        height: DIMENSIONS_METERS.height - TURRET_DECK_Y - 0.79,
        rings: [
          {
            y: 0.79,
            halfWidth: 0.31,
            frontLength: 0.29,
            rearLength: 0.28,
            centerZ: 0
          },
          {
            y: 0.85,
            halfWidth: 0.31,
            frontLength: 0.28,
            rearLength: 0.27,
            centerZ: 0
          },
          {
            y: 0.90,
            halfWidth: 0.24,
            frontLength: 0.22,
            rearLength: 0.21,
            centerZ: 0
          },
          {
            y: 0.92,
            halfWidth: 0.14,
            frontLength: 0.13,
            rearLength: 0.13,
            centerZ: 0
          }
        ],
        sourcePixels: {
          sideBase: [350, 98],
          sideTop: [350, 77],
          frontCenter: [408, 1212]
        }
      },
      mantlet: {
        kind: 'source-shaped-extruded-front-plate',
        frontZ: 0.84,
        depth: 0.09,
        bevelMeters: 0.014,
        outline: [
          [-0.62, 0.13], [0.55, 0.13], [0.63, 0.22],
          [0.62, 0.57], [0.51, 0.67], [-0.49, 0.67],
          [-0.63, 0.54]
        ],
        sourceQuality:
          'outline traced from front elevation; depth inferred from side elevation'
      }
    },
    mainGun: {
      designation: '47 mm SA 35 visual placeholder',
      mountSide: 'right',
      center: [-0.24, 0.42, 0.83],
      barrelLength: 0.79,
      muzzleLocalZ: 1.62,
      radius: 0.034,
      sourcePixels: {
        sideRoot: [196, 179],
        sideMuzzle: [65, 179],
        frontAxis: [337, 1308]
      }
    },
    coax: {
      designation: '7.5 mm MAC 31 visual placeholder',
      mountSide: 'left',
      center: [0.29, 0.39, 0.86],
      barrelLength: 0.44,
      muzzleLocalZ: 1.30,
      radius: 0.012,
      sourcePixels: {
        frontAxis: [425, 1312]
      }
    },
    mudguard: {
      centerX: 0.99,
      depth: 0.15,
      outline: sourceSideOutline(MUDGUARD_SOURCE_PIXELS),
      sourcePixels: MUDGUARD_SOURCE_PIXELS
    },
    suspensionSkirt: {
      centerX: 0.955,
      depth: 0.075,
      outline: sourceSideOutline(SUSPENSION_SKIRT_SOURCE_PIXELS),
      sourcePixels: SUSPENSION_SKIRT_SOURCE_PIXELS,
      sourceQuality:
        'visible side plate traced from the side elevation; openings and thickness inferred'
    },
    runningGear: {
      trackCenterX: 0.99,
      trackWidth: 0.24,
      beltLength: DIMENSIONS_METERS.length,
      beltHeight: 1.20,
      centerY: 0.61,
      roadWheelRadius: 0.112,
      roadWheelCount: 15,
    linkPitch: 0.08,
      trackPath: TRACK_PATH
    },
    details: {
      driverVisor: {
        side: 'left',
        center: [0.45, 1.57, sidePixelToZ(172)],
        size: [0.28, 0.035, 0.035],
        rotationX: -0.68,
        sourcePixels: [172, 277]
      },
      engineGrille: {
        side: 'left',
        center: [0.82, 1.54, sidePixelToZ(666)],
        size: [0.035, 0.42, 1.12],
        slatCount: 19,
        sourceBoundsPixels: [563, 275, 771, 330]
      },
      antenna: {
        side: 'left',
        base: [0.72, 1.82, sidePixelToZ(572)],
        height: 1.34,
        radius: 0.008,
        envelopeRole: 'flexibleAttachment',
        sourcePixels: {
          base: [572, 233],
          topClipped: [572, 0]
        }
      }
    }
  },
  lodPolicy: {
    bands: ['high', 'medium', 'core', 'proxy'],
    high: 'radiator slats, visor, antenna, hatches, hubs, and track cleats',
    medium: 'wheels, return rollers, mantlet collars, and cupola',
    core: 'source-defining hull, turret, mantlet, gun, skirts, mudguards, and supported tracks',
    proxy: 'reduced station lofts and reduced supported-track sampling'
  },
  validation: {
    requiredViews: ['side', 'front', 'top'],
    requiredLodBands: ['high', 'medium', 'core', 'proxy'],
    requiredParts: [
      'D2_PrimaryHull',
      'D2_Turret',
      'D2_Mantlet',
      'D2_MainGun',
      'D2_MainMuzzle',
      'D2_SuspensionSkirt_Left',
      'D2_SuspensionSkirt_Right',
      'D2_ProxyHull',
      'D2_ProxyTurret'
    ],
    closedParts: [
      'D2_PrimaryHull',
      'D2_Turret',
      'D2_Mantlet',
      'D2_ProxyHull',
      'D2_ProxyTurret'
    ],
    acceptedToleranceMeters: 0.04,
    acceptanceStatus:
      'authoring proof only; requires human review of landmarks and overlay before production registration'
  }
});

// Canonical visual-bundle name. The authoring name remains exported because
// the same immutable data drives artifact generation and runtime rendering.
export const RENAULT_D2_VISUAL_DATA = RENAULT_D2_AUTHORING_DATA;
