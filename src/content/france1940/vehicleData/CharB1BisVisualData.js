function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const exactDimensions = { length: 6.37, width: 2.46, height: 2.79 };

const localBlueprintImagePixels = { width: 1200, height: 1500 };

const sideHorizontalMetersPerPixel = exactDimensions.length / (1091 - 122);
const sideVerticalMetersPerPixel = exactDimensions.height / (503 - 84);
const sideOriginPixels = { x: (122 + 1091) / 2, y: 503 };
const sidePoint = ([x, y]) => ({
  y: (sideOriginPixels.y - y) * sideVerticalMetersPerPixel,
  z: (sideOriginPixels.x - x) * sideHorizontalMetersPerPixel
});

const topHorizontalMetersPerPixel = exactDimensions.length / (1115 - 121);
const topVerticalMetersPerPixel = exactDimensions.width / (926 - 548);
const topOriginPixels = {
  x: (121 + 1115) / 2,
  y: (548 + 926) / 2
};
const topPoint = ([x, y]) => ({
  x: (y - topOriginPixels.y) * topVerticalMetersPerPixel,
  z: (topOriginPixels.x - x) * topHorizontalMetersPerPixel
});

const frontHorizontalMetersPerPixel = exactDimensions.width / (579 - 170);
const frontVerticalMetersPerPixel = exactDimensions.height / (1477 - 1051);
const frontOriginPixels = { x: (170 + 579) / 2, y: 1477 };
const frontPoint = ([x, y]) => ({
  x: (x - frontOriginPixels.x) * frontHorizontalMetersPerPixel,
  y: (frontOriginPixels.y - y) * frontVerticalMetersPerPixel
});

const pointObservation = (sourcePixels, derivedMeters, evidenceStatus) => ({
  coordinateSpace: 'full-image pixels; upper-left origin',
  sourcePixels,
  derivedMeters,
  evidenceStatus
});

const boundsObservation = (boundsPixels, pointConverter, evidenceStatus) => {
  const [left, top, right, bottom] = boundsPixels;
  return {
    coordinateSpace: 'full-image pixels; upper-left origin',
    boundsPixels,
    derivedCornersMeters: {
      topLeft: pointConverter([left, top]),
      bottomRight: pointConverter([right, bottom])
    },
    evidenceStatus
  };
};

const localBlueprintViews = {
  side: {
    cropPixels: { x: 100, y: 50, width: 1030, height: 470 },
    rotationDegrees: 0,
    mirrorX: false,
    coordinateSpace: 'full-image pixels; upper-left origin',
    rigidBoundsPixels: {
      frontX: 122,
      rearX: 1091,
      topY: 84,
      groundY: 503
    },
    originPixels: sideOriginPixels,
    horizontalMetersPerPixel: sideHorizontalMetersPerPixel,
    verticalMetersPerPixel: sideVerticalMetersPerPixel,
    horizontalAxis: 'source X decreases toward model +Z (vehicle front)',
    verticalAxis: 'source Y decreases toward model +Y',
    landmarkPixels: {
      'rigid-front': [122, 503],
      'rigid-rear': [1091, 503],
      'vehicle-top': [490, 84],
      'ground-origin': [sideOriginPixels.x, 503],
      'upper-track-run': [sideOriginPixels.x, 263],
      'turret-ring-center': [475, 229],
      'turret-gun-axis': [326, 186]
    },
    observations: {
      rigidTop: pointObservation(
        [490, 84],
        sidePoint([490, 84]),
        'source-registered non-antenna rigid top on the APX 4 cupola roof'
      ),
      rigidTrackAndHullBounds: boundsObservation(
        [122, 84, 1091, 503],
        sidePoint,
        'source-registered rigid drawing outline; y=84 is the traced APX 4 cupola roof top and excludes the separate antenna'
      ),
      driveSprocket: {
        ...pointObservation(
          [1009, 382],
          sidePoint([1009, 382]),
          'source-registered visible rear drive-sprocket center, approximately +/- 3 pixels'
        ),
        radiusPixels: 84,
        horizontalRadiusMeters: 84 * sideHorizontalMetersPerPixel,
        status: 'visible drawing measurement; Packet B model datum retained pending track-envelope overlay review'
      },
      idler: {
        ...pointObservation(
          [163, 394],
          sidePoint([163, 394]),
          'source-registered partly visible front idler center, approximately +/- 5 pixels'
        ),
        radiusPixels: 72,
        horizontalRadiusMeters: 72 * sideHorizontalMetersPerPixel,
        status: 'partial circular outline conflicts with the measured outer track nose; Packet B model datum retained'
      },
      rearTensionWheel: {
        coordinateSpace: 'full-image pixels; upper-left origin',
        inferredCenterClaimPixels: [273, 406],
        inferredRadiusClaimPixels: 31,
        evidenceStatus: 'partly occluded small support; cross-view constrained inference rather than a directly registered circle',
        status: 'discarded inference claim only; no point sourcePixels or source-derived metre datum is asserted'
      },
      trackOuterPath: boundsObservation(
        [122, 263, 1091, 503],
        sidePoint,
        'source-registered visible track envelope'
      ),
      turret: boundsObservation(
        [321, 83, 633, 242],
        sidePoint,
        'source-registered APX 4 side outline'
      ),
      cupola: boundsObservation(
        [445, 84, 536, 126],
        sidePoint,
        'source-registered cupola side outline; traced roof-top y=84 excludes the antenna'
      ),
      turretRing: pointObservation(
        [475, 229],
        sidePoint([475, 229]),
        'source-registered approximate APX 4 ring center'
      ),
      driverProjection: boundsObservation(
        [268, 163, 350, 266],
        sidePoint,
        'source-registered side silhouette; visor opening is not resolved'
      ),
      disputedTurret47Gun: {
        sourcePixels: [[206, 186], [326, 186]],
        derivedMeters: [sidePoint([206, 186]), sidePoint([326, 186])],
        muzzle: pointObservation(
          [207, 186],
          sidePoint([207, 186]),
          'source-registered visible muzzle of the APX 4 turret 47 mm SA 35'
        ),
        mantlet: boundsObservation(
          [318, 171, 360, 211],
          sidePoint,
          'source-registered visible APX 4 turret 47 mm mantlet/collar bounds'
        ),
        correctedFeatureIdentity: 'APX 4 turret 47 mm SA 35 gun and mantlet, not the hull 75 mm ABS SA 35',
        status: 'supplied measurement record called these hull 75 mm pixels; retained as an explicitly corrected/disputed turret-gun observation and never used for hull-75 geometry'
      },
      majorHullStations: {
        sourcePixels: [[164, 281], [277, 257], [435, 251], [611, 250], [806, 252], [930, 274], [1012, 300]],
        derivedMeters: [[164, 281], [277, 257], [435, 251], [611, 250], [806, 252], [930, 274], [1012, 300]].map(sidePoint),
        evidenceStatus: 'source-registered visible upper track/hull outline points; not complete cross-sections'
      },
      mudguardOutline: {
        sourcePixels: [[266, 242], [318, 231], [785, 238], [952, 264], [1000, 286]],
        derivedMeters: [[266, 242], [318, 231], [785, 238], [952, 264], [1000, 286]].map(sidePoint),
        evidenceStatus: 'source-registered visible side outline'
      },
      hiddenSupportInference: {
        coordinateSpace: 'full-image pixel ranges retained as discarded inference claims, not source measurements',
        roadSupportCenterRanges: [
          { id: 'bogie-1-wheel-1..4', centerRangeX: [330, 390], centerY: 407 },
          { id: 'bogie-2-wheel-1..4', centerRangeX: [470, 530], centerY: 407 },
          { id: 'bogie-3-wheel-1..4', centerRangeX: [610, 670], centerY: 407 },
          { id: 'forward-independent-wheel-1..3', centerRangeX: [735, 795], centerY: 405 }
        ],
        returnSupportRange: { centerRangeX: [310, 850], centerY: 285, count: 4 },
        status: 'armor hides the centers; these ranges are not attached to emitted supports and cannot be called sourcePixels'
      }
    }
  },
  top: {
    cropPixels: { x: 105, y: 535, width: 1015, height: 420 },
    rotationDegrees: 0,
    mirrorX: false,
    coordinateSpace: 'full-image pixels; upper-left origin',
    rigidBoundsPixels: {
      frontX: 121,
      rearX: 1115,
      rightY: 548,
      leftY: 926
    },
    originPixels: topOriginPixels,
    horizontalMetersPerPixel: topHorizontalMetersPerPixel,
    verticalMetersPerPixel: topVerticalMetersPerPixel,
    horizontalAxis: 'source X decreases toward model +Z (vehicle front)',
    verticalAxis: 'source Y increases toward model +X (vehicle left)',
    landmarkPixels: {
      'rigid-front': [121, topOriginPixels.y],
      'rigid-rear': [1115, topOriginPixels.y],
      'vehicle-left': [topOriginPixels.x, 926],
      'vehicle-right': [topOriginPixels.x, 548],
      'turret-ring-center': [497, 748],
      'driver-hood-center': [(306 + 421) / 2, (668 + 831) / 2]
    },
    observations: {
      rigidBounds: boundsObservation(
        [121, 548, 1115, 926],
        topPoint,
        'source-registered top outline, including track/fender width'
      ),
      turret: boundsObservation(
        [376, 646, 614, 851],
        topPoint,
        'source-registered APX 4 top outline'
      ),
      turretRing: pointObservation(
        [497, 748],
        topPoint([497, 748]),
        'source-registered approximate ring center'
      ),
      driverHood: boundsObservation(
        [306, 668, 421, 831],
        topPoint,
        'source-registered asymmetric driver projection'
      ),
      engineCover: boundsObservation(
        [788, 553, 1108, 915],
        topPoint,
        'source-registered rear engine-cover outline'
      ),
      forwardGunAxis: {
        sourcePixels: [[171, 748], [378, 748]],
        derivedMeters: [topPoint([171, 748]), topPoint([378, 748])],
        status: 'measurement record called this the hull 75 mm axis, but the held raster shows the turret 47 mm projection; not used for hull-gun geometry'
      },
      sourceCenterlineClaim: {
        sourcePixels: [615, 737],
        status: 'drawing centerline claim is offset by asymmetric details; not used to force symmetry'
      }
    }
  },
  front: {
    cropPixels: { x: 155, y: 1010, width: 435, height: 475 },
    rotationDegrees: 0,
    mirrorX: false,
    coordinateSpace: 'full-image pixels; upper-left origin',
    rigidBoundsPixels: {
      rightX: 170,
      leftX: 579,
      topY: 1051,
      groundY: 1477
    },
    originPixels: frontOriginPixels,
    horizontalMetersPerPixel: frontHorizontalMetersPerPixel,
    verticalMetersPerPixel: frontVerticalMetersPerPixel,
    horizontalAxis: 'source X increases toward model +X (vehicle left)',
    verticalAxis: 'source Y decreases toward model +Y',
    landmarkPixels: {
      'vehicle-right': [170, 1477],
      'vehicle-left': [579, 1477],
      'ground-origin': [frontOriginPixels.x, 1477],
      'vehicle-top': [407, 1051]
    },
    observations: {
      rigidTop: pointObservation(
        [407, 1051],
        frontPoint([407, 1051]),
        'source-registered non-antenna rigid top on the APX 4 cupola roof; the antenna is a separate line at x=440'
      ),
      rigidBounds: boundsObservation(
        [170, 1051, 579, 1477],
        frontPoint,
        'source-registered front rigid outline; y=1051 is the traced cupola roof top and excludes the antenna at x=440'
      ),
      hull: boundsObservation(
        [172, 1205, 578, 1477],
        frontPoint,
        'source-registered front hull outline below the turret'
      ),
      turret: boundsObservation(
        [266, 1081, 478, 1217],
        frontPoint,
        'source-registered APX 4 front outline'
      ),
      disputedDriverVisorClaim: boundsObservation(
        [314, 1158, 372, 1192],
        frontPoint,
        'measurement record labels this driver visor, but the held raster places it on the turret face; not used for driver geometry'
      ),
      disputedHullOpeningClaim: boundsObservation(
        [382, 1234, 433, 1281],
        frontPoint,
        'measurement record labels this hull 75 mm opening, but the held raster places it at the rectangular driver projection; not used for the hull-gun collar'
      )
    }
  }
};

const localBlueprint = {
  id: 'france1940.blueprint.vehicle.fr_char_b1bis.onwar-local-multiview',
  title: 'Char B1-bis scale drawing',
  sourceId: 'onwar-ken-musgrave-local-multiview',
  sourcePageUrl: 'https://onwar.com/wwii/tanks/france/fr001b1bisp.html',
  directImageLocator: 'https://onwar.com/wwii/tanks/france/fr001b1bis.jpg',
  author: 'Ken Musgrave',
  rightsNote: 'OnWar/Ralph Zuljan page copyright applies; external calibration evidence only',
  imagePixels: localBlueprintImagePixels,
  sha256: 'e4e52bad67f44066138824554c5df58952443479ed833dce67a24dd1631f7f61',
  orientation: 'upper-left origin; no EXIF rotation, runtime mirror, or source rotation',
  redistributionStatus: 'external local-only; raster not included',
  localUploadRequired: true,
  corroboratingRearView: {
    cropPixels: { x: 645, y: 1010, width: 485, height: 475 },
    rigidBoundsPixels: { left: 665, top: 1015, right: 1118, bottom: 1478 },
    groundLinePixelY: 1478,
    hullBoundsPixels: [666, 1165, 1118, 1478],
    engineDeckBoundsPixels: [728, 1168, 1050, 1247],
    trackBoundsPixels: [665, 1189, 1118, 1478],
    status: 'corroborating source pixels only; not registered into the side/front/top jig contract'
  },
  unavailableDatums: {
    hull75SideAndTopAxis: 'the measurement record points to the visibly separate APX 4 turret gun in both views',
    hull75FrontCollar: 'the measurement record points to the rectangular driver projection rather than the 75 mm opening',
    driverVisorFront: 'the measurement record points to the turret face; the top driver-hood outline remains usable'
  },
  limitations: [
    'recognition/scale drawing rather than a dimensioned factory blueprint',
    'official 6.37 x 2.46 x 2.79 m dimensions remain authoritative over OnWar text values',
    'side armor hides road-wheel and return-support centers',
    'the supplied measurement record misidentifies the visible turret gun as the hull 75 mm in side/top and swaps front-feature labels; disputed labels are retained but excluded from geometry derivation',
    'source coordinates are review measurements, typically +/- 2 to 5 pixels'
  ],
  views: localBlueprintViews
};

const hullStations = [
  { z: -3.185, halfWidth: 0.76, bottomY: 0.50, shoulderY: 1.00, topY: 1.08, topHalfWidth: 0.56 },
  { z: -3.02, halfWidth: 1.04, bottomY: 0.25, shoulderY: 1.29, topY: 1.39, topHalfWidth: 0.79 },
  { z: -2.62, halfWidth: 1.10, bottomY: 0.18, shoulderY: 1.44, topY: 1.53, topHalfWidth: 0.86 },
  { z: -1.70, halfWidth: 1.10, bottomY: 0.15, shoulderY: 1.46, topY: 1.55, topHalfWidth: 0.87 },
  { z: -0.55, halfWidth: 1.10, bottomY: 0.15, shoulderY: 1.46, topY: 1.55, topHalfWidth: 0.87 },
  { z: 0.60, halfWidth: 1.10, bottomY: 0.15, shoulderY: 1.46, topY: 1.55, topHalfWidth: 0.87 },
  { z: 1.55, halfWidth: 1.10, bottomY: 0.16, shoulderY: 1.45, topY: 1.54, topHalfWidth: 0.86 },
  { z: 2.28, halfWidth: 1.09, bottomY: 0.19, shoulderY: 1.39, topY: 1.48, topHalfWidth: 0.82 },
  { z: 2.70, halfWidth: 1.07, bottomY: 0.27, shoulderY: 1.27, topY: 1.37, topHalfWidth: 0.70 },
  { z: 3.02, halfWidth: 0.96, bottomY: 0.40, shoulderY: 1.08, topY: 1.18, topHalfWidth: 0.57 },
  { z: 3.185, halfWidth: 0.72, bottomY: 0.58, shoulderY: 0.93, topY: 1.01, topHalfWidth: 0.44 }
];

const upperHullStations = [
  { z: -2.70, halfWidth: 0.76, bottomY: 1.28, shoulderY: 1.52, topY: 1.62, topHalfWidth: 0.61 },
  { z: -2.40, halfWidth: 0.82, bottomY: 1.30, shoulderY: 1.59, topY: 1.68, topHalfWidth: 0.67 },
  { z: -1.45, halfWidth: 0.83, bottomY: 1.30, shoulderY: 1.61, topY: 1.70, topHalfWidth: 0.68 },
  { z: -0.30, halfWidth: 0.84, bottomY: 1.30, shoulderY: 1.67, topY: 1.76, topHalfWidth: 0.69 },
  { z: 0.75, halfWidth: 0.84, bottomY: 1.30, shoulderY: 1.81, topY: 1.91, topHalfWidth: 0.69 },
  { z: 1.52, halfWidth: 0.83, bottomY: 1.29, shoulderY: 1.80, topY: 1.90, topHalfWidth: 0.68 },
  { z: 2.20, halfWidth: 0.79, bottomY: 1.25, shoulderY: 1.69, topY: 1.80, topHalfWidth: 0.63 },
  { z: 2.68, halfWidth: 0.66, bottomY: 1.17, shoulderY: 1.48, topY: 1.59, topHalfWidth: 0.49 }
];

const engineCoverStations = [
  { z: -3.00, halfWidth: 0.70, bottomY: 1.56, shoulderY: 1.64, topY: 1.71, topHalfWidth: 0.61 },
  { z: -2.78, halfWidth: 0.75, bottomY: 1.55, shoulderY: 1.73, topY: 1.82, topHalfWidth: 0.66 },
  { z: -1.92, halfWidth: 0.76, bottomY: 1.59, shoulderY: 1.93, topY: 2.03, topHalfWidth: 0.67 },
  { z: -1.72, halfWidth: 0.70, bottomY: 1.59, shoulderY: 1.87, topY: 1.96, topHalfWidth: 0.60 }
];

const roadWheels = [
  { id: 'rear-tension-wheel', kind: 'rearTensionWheel', group: 'rear-tension', centerY: 0.29, centerZ: -2.25, radius: 0.18 },
  ...[-1.78, -1.55, -1.32, -1.09].map((centerZ, index) => ({ id: `bogie-1-wheel-${index + 1}`, kind: 'compoundBogieWheel', group: 'bogie-1', centerY: 0.25, centerZ, radius: 0.15 })),
  ...[-0.78, -0.55, -0.32, -0.09].map((centerZ, index) => ({ id: `bogie-2-wheel-${index + 1}`, kind: 'compoundBogieWheel', group: 'bogie-2', centerY: 0.25, centerZ, radius: 0.15 })),
  ...[0.22, 0.45, 0.68, 0.91].map((centerZ, index) => ({ id: `bogie-3-wheel-${index + 1}`, kind: 'compoundBogieWheel', group: 'bogie-3', centerY: 0.25, centerZ, radius: 0.15 })),
  { id: 'forward-independent-wheel-1', kind: 'individuallySprungForwardWheel', group: 'forward-independent', centerY: 0.27, centerZ: 1.25, radius: 0.16 },
  { id: 'forward-independent-wheel-2', kind: 'individuallySprungForwardWheel', group: 'forward-independent', centerY: 0.30, centerZ: 1.52, radius: 0.17 },
  { id: 'forward-independent-wheel-3', kind: 'individuallySprungForwardWheel', group: 'forward-independent', centerY: 0.35, centerZ: 1.80, radius: 0.18 }
].map(wheel => ({
  ...wheel,
  coordinateSpace: 'model metres',
  evidenceSourceIds: ['aubigny-front-oblique', 'senegal-front-running-gear'],
  evidenceQuality: 'photo-constrained cross-view inference; no orthographic support-pixel registration'
}));

const trackPath = {
  model: 'wheel-supported-quasi-static-v1',
  driveSprocket: {
    id: 'rear-drive-sprocket', kind: 'driveSprocket', centerY: 0.67,
    centerZ: -2.58, radius: 0.47, coordinateSpace: 'model metres',
    evidenceSourceIds: ['aubigny-front-oblique', 'senegal-front-running-gear'],
    evidenceQuality: 'photo-constrained cross-view inference; no orthographic support-pixel registration'
  },
  idlerWheel: {
    id: 'front-pulley-idler', kind: 'idlerWheel', centerY: 0.77,
    centerZ: 2.42, radius: 0.52, coordinateSpace: 'model metres',
    evidenceSourceIds: ['aubigny-front-oblique', 'senegal-front-running-gear'],
    evidenceQuality: 'photo-constrained cross-view inference; no orthographic support-pixel registration'
  },
  roadWheels,
  returnRollers: [
    { id: 'upper-return-1', kind: 'returnRoller', centerY: 1.18, centerZ: -1.55, radius: 0.105 },
    { id: 'upper-return-2', kind: 'returnRoller', centerY: 1.22, centerZ: -0.55, radius: 0.105 },
    { id: 'upper-return-3', kind: 'returnRoller', centerY: 1.24, centerZ: 0.50, radius: 0.105 },
    { id: 'upper-return-4', kind: 'returnRoller', centerY: 1.20, centerZ: 1.45, radius: 0.105 }
  ].map(wheel => ({
    ...wheel,
    coordinateSpace: 'model metres',
    evidenceSourceIds: ['aubigny-front-oblique', 'senegal-front-running-gear'],
    evidenceQuality: 'photo-constrained cross-view inference; no orthographic support-pixel registration'
  })),
  linkThickness: 0.055,
  cleatHeight: 0.025,
  linearMassKgPerMeter: 128,
  tensionNewtons: 31000,
  maximumSegmentMeters: 0.075,
  rendererApproximation: 'static tension, linear mass, and gravity sag are presentation-only approximations'
};

export const CHAR_B1_BIS_VISUAL_DATA = deepFreeze({
  schemaVersion: 1,
  modelId: 'fr_char_b1bis',
  coordinateFrame: '+Y up, +Z forward, vehicle right -X, metres',
  dimensionsMeters: exactDimensions,
  blueprint: localBlueprint,
  evidenceStatus: 'local-only side/front/top drawing registration plus photo-backed cross-view inference; factory blueprint calibration unavailable',
  conflicts: [
    'official rigid width 2.46 m versus secondary 2.58 m reports; this model retains 2.46 m',
    'track width reported as both 450 mm and 500 mm; renderer retains 450 mm pending primary resolution'
  ],
  sources: [
    {
      id: 'onwar-ken-musgrave-local-multiview',
      sourceType: 'external-local-only-multiview-drawing',
      title: 'Char B1-bis scale drawing',
      creator: 'Ken Musgrave',
      publisher: 'OnWar / Ralph Zuljan',
      pageUrl: localBlueprint.sourcePageUrl,
      directImageLocator: localBlueprint.directImageLocator,
      imagePixels: localBlueprint.imagePixels,
      sha256: localBlueprint.sha256,
      redistributionStatus: localBlueprint.redistributionStatus,
      use: 'registered side, front, and top source pixels loaded by the user at runtime; no raster bytes are included',
      provenanceStatus: 'exact B1-bis drawing identity; source-registered secondary drawing, not published mechanical dimensions'
    },
    {
      id: 'official-rigid-dimensions',
      sourceType: 'published-dimensions',
      title: 'Le Char B 1 bis',
      publisher: 'Ministère des Armées / Chemins de mémoire',
      pageUrl: 'https://www.cheminsdememoire.gouv.fr/sites/default/files/2019-06/char%20B1%20bis.pdf',
      use: 'exact published 6.37 x 2.46 x 2.79 m rigid envelope',
      provenanceStatus: 'official published dimensions; exact historical data; PDF not redistributed'
    },
    {
      id: 'acr-maintenance-notice',
      sourceType: 'mechanical-provenance',
      title: 'B1 bis maintenance notice suspension figure',
      creator: 'Ateliers de Construction de Rueil',
      locatorUrl: 'https://tanks-encyclopedia.com/ww2/france/char-b1-bis/',
      use: 'period-notice identity for three four-wheel compound bogies, three individually sprung forward wheels, and one rear tension wheel',
      provenanceStatus: 'period maintenance-notice identity reported by a secondary description; primary scan not redistributed or treated as pixel registration'
    },
    {
      id: 'aubigny-front-oblique', title: 'Juin 1940, Aubigny-sur-Nère, Char B1 bis', creator: 'André Lecolinet',
      license: 'CC0 1.0', pageUrl: 'https://commons.wikimedia.org/wiki/File:Juin_1940%2C_Aubigny-sur-N%C3%A8re%2C_Char_B1_bis.jpg',
      originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/0f/Juin_1940%2C_Aubigny-sur-N%C3%A8re%2C_Char_B1_bis.jpg',
      originalPixels: { width: 3344, height: 2357 }, originalSha256: 'd7239130b0d1895ffd489a48a20593e918c7659ea16e2034f76a3934adf0b2b2',
      crop: { x: 200, y: 500, width: 3000, height: 1800 }, cropPath: '/assets/references/france1940/char-b1bis-aubigny-front.png',
      cropSha256: '5240e3c65954d76c3e6479b0945335f77b016027d3bd59ca57d21bbff8b3b942',
      observedPixels: {
        coordinateSpace: 'original-image pixels',
        cropRectangle: [200, 500, 3000, 1800]
      },
      quality: 'wartime perspective photograph; feature and ratio evidence only'
    },
    {
      id: 'senegal-front-running-gear', title: 'B1 bis Senegal at Saint-Simon, May 1940', creator: 'PhotosNormandie',
      license: 'CC BY-SA 2.0', pageUrl: 'https://commons.wikimedia.org/wiki/File:P003072_B1_bis_Senegal_in_Saint-Simon%2C_Aisne%2C_May_1940_%285407522168%29.jpg',
      originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/31/P003072_B1_bis_Senegal_in_Saint-Simon%2C_Aisne%2C_May_1940_%285407522168%29.jpg',
      originalPixels: { width: 3547, height: 2480 }, originalSha256: 'cdbc25342b146b9c78dfa497091afd070dd1320989c20e945af3ad99958a7c26',
      crop: { x: 0, y: 350, width: 2300, height: 1900 }, cropPath: '/assets/references/france1940/char-b1bis-senegal-running-gear.png',
      cropSha256: 'e749e1b0ea56f08e61b1eb79b0d0fa94625b79c940b6f7647a9f1d4c45c1153e',
      observedPixels: {
        coordinateSpace: 'original-image pixels',
        driverVisorBounds: [1030, 710, 1315, 1045],
        hullGunOpeningBounds: [735, 980, 1045, 1450]
      },
      quality: 'wartime perspective photograph; front asymmetry and track-link evidence only'
    },
    {
      id: 'rhone-front-quarter', title: 'Char B1 bis Rhone at Musee des Blindes', creator: 'Alan Wilson / HawkeyeUK',
      license: 'CC BY-SA 2.0', pageUrl: 'https://commons.wikimedia.org/wiki/File:Char_B1_bis_%E2%80%9CRh%C3%B4ne%E2%80%9D_at_Mus%C3%A9e_des_Blind%C3%A9s%2C_Saumur%2C_France_%2853317132533%29.jpg',
      originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/10/Char_B1_bis_%E2%80%9CRh%C3%B4ne%E2%80%9D_at_Mus%C3%A9e_des_Blind%C3%A9s%2C_Saumur%2C_France_%2853317132533%29.jpg',
      originalPixels: { width: 5270, height: 3513 }, originalSha256: 'd8d3038aff58fae6c965d41c73f3fde94b1b98b72841e815517a825de3fd6fae',
      crop: { x: 1700, y: 650, width: 2800, height: 2200 }, cropPath: '/assets/references/france1940/char-b1bis-rhone-front-quarter.png',
      cropSha256: '4c89330784527b80d87921c8ddec063030e23c21dda9a595eb4fda4b477a00b7',
      observedPixels: {
        coordinateSpace: 'original-image pixels',
        driverVisorBounds: [3750, 1370, 4180, 1730],
        hullGunOutline: [[2920, 1720], [3370, 1650], [3650, 1840], [3660, 2200], [3380, 2390], [3020, 2260], [2860, 1980]]
      },
      quality: 'surviving-vehicle perspective photograph; driver, hull-gun collar, and track identity evidence only'
    },
    {
      id: 'apx4-side', title: 'Tourelle APX4 - B1 bis 216 Anjou', creator: 'Le Petit Chat',
      license: 'CC BY-SA 4.0', pageUrl: 'https://commons.wikimedia.org/wiki/File:Tourelle_APX4_-_B1_bis_216_Anjou.png',
      originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/db/Tourelle_APX4_-_B1_bis_216_Anjou.png',
      originalPixels: { width: 544, height: 221 }, originalSha256: 'fb5ef75daff96495282c5f6af22bdd9c6ac59a124234e21703ad2a1572b318d9',
      crop: { x: 0, y: 0, width: 544, height: 221 }, cropPath: '/assets/references/france1940/char-b1bis-apx4-side.png',
      cropSha256: '5ecbfd245f5cfd4291110123b661ce0095c048e784005f34a859282ffa7225eb',
      observedPixels: {
        coordinateSpace: 'original-image pixels',
        outlineBounds: [17, 22, 526, 207],
        gunAxis: [420, 130, 526, 130]
      },
      quality: 'licensed secondary side drawing; APX 4 silhouette corroboration only'
    }
  ],
  geometry: {
    hullStations,
    upperHullStations,
    engineCoverStations,
    driver: {
      centerX: 0.43,
      hoodStations: [
        { z: 1.48, halfWidth: 0.36, bottomY: 1.57, shoulderY: 1.82, topY: 1.95, topHalfWidth: 0.27 },
        { z: 1.92, halfWidth: 0.38, bottomY: 1.52, shoulderY: 1.86, topY: 2.00, topHalfWidth: 0.29 },
        { z: 2.20, halfWidth: 0.31, bottomY: 1.40, shoulderY: 1.75, topY: 1.90, topHalfWidth: 0.21 }
      ],
      visor: { center: [0.43, 1.77, 2.18], depth: 0.065, outline: [[-0.22, 0.07], [0.22, 0.07], [0.20, -0.07], [-0.20, -0.07]], evidenceQuality: 'cross-view constrained inference from retained photo pixels' }
    },
    hullGun: {
      axis: [-0.47, 1.31, 2.88], muzzleZ: 3.16, collarCenterZ: 3.00, collarDepth: 0.16,
      collarOutline: [[-0.15, 0.30], [0.10, 0.31], [0.27, 0.20], [0.29, -0.06], [0.17, -0.24], [-0.07, -0.29], [-0.23, -0.13], [-0.29, 0.19]],
      evidenceQuality: 'irregular outline cross-view constrained from Senegal and Rhone photographs'
    },
    runningGear: {
      trackCenterX: 0.996,
      trackWidth: 0.45,
      linkPitch: 0.165,
      assemblyGroundOffset: {
        y: -0.02,
        evidenceQuality: 'renderer approximation that seats the shared support-solved track geometry on the exact ground contract'
      },
      fallbackEnvelope: { beltLength: 6.18, beltHeight: 1.45, centerY: 0.80 },
      trackPath,
      localDrawingObservations: {
        sourceId: localBlueprint.sourceId,
        driveSprocket: localBlueprint.views.side.observations.driveSprocket,
        idler: localBlueprint.views.side.observations.idler,
        trackOuterPath: localBlueprint.views.side.observations.trackOuterPath,
        retainedGeometryStatus: 'Packet B support centers remain model-metre cross-view inference because the visible drawing measurements do not close against the official rigid track envelope without an overlay decision'
      }
    },
    turret: {
      centerX: 0, deckY: 1.88, ringY: 1.88, centerZ: 0.95,
      gunAxisLocalY: 0.34, gunMuzzleLocalZ: 1.68,
      rings: [
        { y: 0.00, radiusX: 0.68, radiusZ: 0.95, centerZ: 0.00 },
        { y: 0.08, radiusX: 0.72, radiusZ: 1.00, centerZ: 0.01 },
        { y: 0.35, radiusX: 0.67, radiusZ: 0.92, centerZ: -0.01 },
        { y: 0.52, radiusX: 0.55, radiusZ: 0.80, centerZ: -0.05 },
        { y: 0.60, radiusX: 0.37, radiusZ: 0.58, centerZ: -0.09 }
      ]
    }
  },
  lod: { requiredBands: ['high', 'medium', 'core', 'proxy'], proxyUsesSharedTrackPath: true },
  validation: {
    inapplicableChecks: {
      blueprintRegistration: 'registered source is local-only and intentionally has no runtime image URL; deterministic raster validation requires user upload'
    },
    requiredLodBands: ['high', 'medium', 'core', 'proxy'],
    requiredParts: [
      'CharB1Bis_PrimaryHull',
      'CharB1Bis_UpperHull',
      'CharB1Bis_RaisedEngineCover',
      'CharB1Bis_LeftDriverHood',
      'CharB1Bis_DriverVisor',
      'CharB1Bis_75mmMantlet',
      'CharB1_75mm_HullGun',
      'CharB1_75mm_Muzzle',
      'CharB1Bis_APX4Turret',
      'CharB1Bis_APX4Cupola',
      'CharB1Bis_47mm_SA35',
      'CharB1_47mm_Muzzle',
      'coax_barrel',
      'CharB1_Coax_Muzzle',
      'CharB1BisRunningGear',
      'CharB1Bis_ProxyHull',
      'CharB1Bis_ProxyUpperHull',
      'CharB1Bis_ProxyDriverProjection',
      'CharB1Bis_Proxy75mmCollar',
      'CharB1Bis_ProxyAPX4Turret',
      'CharB1Bis_ProxyCupola',
      'CharB1Bis_Proxy47mmBarrel',
      'CharB1BisAuthoredRunningGearProxy'
    ],
    forbiddenParts: ['ProxyLeftTrackBelt', 'ProxyRightTrackBelt'],
    closedParts: [
      'CharB1Bis_PrimaryHull',
      'CharB1Bis_UpperHull',
      'CharB1Bis_RaisedEngineCover',
      'CharB1Bis_LeftDriverHood',
      'CharB1Bis_DriverVisor',
      'CharB1Bis_75mmMantlet',
      'CharB1Bis_APX4Turret',
      'CharB1Bis_ProxyHull',
      'CharB1Bis_ProxyUpperHull',
      'CharB1Bis_ProxyEngineCover',
      'CharB1Bis_ProxyDriverProjection',
      'CharB1Bis_Proxy75mmCollar',
      'CharB1Bis_ProxyAPX4Turret'
    ],
    mountSides: { main: 'center', coax: 'right' },
    sourceMechanics: {
      hullStations: { minimumCount: 11, requireStrictAscendingZ: true },
      turret: { objectName: 'Turret', positionToleranceMeters: 1e-9 },
      track: {
        detailObjectName: 'CharB1BisRunningGear',
        proxyObjectName: 'CharB1BisAuthoredRunningGearProxy',
        expectedModel: 'wheel-supported-quasi-static-v1',
        minimumSupportCount: 22,
        maximumSagMeters: 0.02
      }
    }
  },
  calibration: {
    coordinateFrame: '+Y up, +Z forward, -X vehicle right',
    rigidEnvelopeMeters: exactDimensions,
    registrationStatus: 'side/front/top transforms registered to an external local-only raster; raster availability requires user upload',
    imageRegistration: {
      sourceId: localBlueprint.sourceId,
      sourceImagePixels: localBlueprint.imagePixels,
      sourceSha256: localBlueprint.sha256,
      redistributionStatus: localBlueprint.redistributionStatus,
      localUploadRequired: true,
      views: localBlueprint.views
    },
    datums: {
      groundLineY: { value: 0, quality: 'exact model contract' },
      hullRearZ: { value: -3.185, quality: 'exact official envelope endpoint' },
      hullFrontZ: { value: 3.185, quality: 'exact official envelope endpoint' },
      trackCenterX: { value: 0.996, quality: 'geometry-derived from official width plus renderer 450 mm track choice' },
      roadWheelCentersZ: { value: roadWheels.map(wheel => wheel.centerZ), quality: 'cross-view constrained inference' },
      turretRing: { value: [0, 1.88, 0.95], quality: 'cross-view constrained inference' },
      turretGunAxis: { value: [0, 2.22, 0.95], quality: 'cross-view constrained inference' },
      hullGunAxis: { value: [-0.47, 1.31, 2.88], quality: 'right-side placement historical; precise center cross-view inferred' }
    },
    outlineLandmarks: [
      'full-height wraparound track around compound sixteen-wheel support identity',
      'driver projection on vehicle left and irregular 75 mm armored collar on vehicle right',
      'compact APX 4 turret with rear-offset cupola'
    ]
  }
});
