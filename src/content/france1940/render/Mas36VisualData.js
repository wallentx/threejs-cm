const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

const OVERALL_LENGTH_METRES = 1.02;
const SIDE_REGISTRATION = Object.freeze({
  rasterWidth: 3368,
  rasterHeight: 2382,
  buttX: 499,
  muzzleX: 2814,
  barrelAxisY: 863
});
const METRES_PER_RASTER_PIXEL = OVERALL_LENGTH_METRES
  / (SIDE_REGISTRATION.muzzleX - SIDE_REGISTRATION.buttX);
const STOCK_WIDTH_METRES = 0.048;
const RECEIVER_WIDTH_METRES = 0.043;
const MID_BAND_WIDTH_METRES = 0.048;
const MID_BAND_PROTRUSION_METRES = 0.004;
const SIDE_BLUEPRINT_CROP = Object.freeze({
  left: 480,
  top: 50,
  right: SIDE_REGISTRATION.rasterWidth - 2833,
  bottom: SIDE_REGISTRATION.rasterHeight - 470
});
const SIDE_BLUEPRINT_BARREL_AXIS_Y = 153;
const TOP_BLUEPRINT_CROP = Object.freeze({
  left: 480,
  top: 560,
  right: SIDE_REGISTRATION.rasterWidth - 2833,
  bottom: SIDE_REGISTRATION.rasterHeight - 726
});

const sidePoint = ([x, y]) => Object.freeze({
  sourcePixel: Object.freeze({ x, y }),
  z: (x - SIDE_REGISTRATION.buttX) * METRES_PER_RASTER_PIXEL,
  y: (SIDE_REGISTRATION.barrelAxisY - y) * METRES_PER_RASTER_PIXEL
});

const sideStation = x => (x - SIDE_REGISTRATION.buttX) * METRES_PER_RASTER_PIXEL;
const upperSidePoint = ([x, y]) => Object.freeze({
  sourcePixel: Object.freeze({ x, y }),
  z: (2814 - x) * METRES_PER_RASTER_PIXEL,
  y: (SIDE_BLUEPRINT_BARREL_AXIS_Y - y) * METRES_PER_RASTER_PIXEL
});
const upperSideStation = x => (2814 - x) * METRES_PER_RASTER_PIXEL;

const stockUpperPixels = [
  [499, 995],
  [520, 978],
  [550, 973],
  [700, 952],
  [900, 924],
  [1000, 937],
  [1100, 897],
  [1200, 887],
  [1270, 904]
];
const stockLowerPixels = [
  [1270, 986],
  [1200, 991],
  [1100, 1010],
  [1000, 1075],
  [900, 1093],
  [700, 1178],
  [550, 1241],
  [536, 1242],
  [520, 1231],
  [499, 1117]
];

const receiverPixels = [
  [1768, 117],
  [2148, 117],
  [2148, 262],
  [1768, 262]
];

const triggerGuardSource = Object.freeze({
  centerPixel: Object.freeze([2100, 313]),
  outerPixels: Object.freeze([
    [2034, 279], [2033, 306], [2036, 324], [2046, 337],
    [2054, 341], [2086, 347], [2126, 346], [2133, 341],
    [2142, 332], [2149, 315], [2152, 301], [2142, 284]
  ]),
  innerPixels: Object.freeze([
    [2052, 284], [2046, 288], [2043, 297], [2040, 315],
    [2045, 324], [2054, 332], [2087, 337], [2126, 337],
    [2133, 332], [2140, 319], [2142, 301], [2130, 288]
  ]),
  triggerPixels: Object.freeze([
    [2089, 284], [2092, 288], [2096, 297], [2099, 306],
    [2099, 315], [2095, 324], [2089, 332], [2090, 337],
    [2099, 337], [2102, 332], [2107, 324], [2110, 315],
    [2110, 297], [2109, 288]
  ])
});

const upperSideBox = (name, [left, top, right, bottom]) => Object.freeze({
  name,
  sourceBounds: Object.freeze({ left, top, right, bottom }),
  startZ: upperSideStation(right),
  endZ: upperSideStation(left),
  topY: (SIDE_BLUEPRINT_BARREL_AXIS_Y - top) * METRES_PER_RASTER_PIXEL,
  bottomY: (SIDE_BLUEPRINT_BARREL_AXIS_Y - bottom) * METRES_PER_RASTER_PIXEL
});

const receiverTopDetails = Object.freeze([
  upperSideBox('ReceiverBridge', [2020, 108, 2147, 121]),
  upperSideBox('RearSightBase', [2114, 96, 2148, 108]),
  upperSideBox('RearSightLeaf', [2130, 83, 2147, 96])
]);

const frontSight = upperSideBox('FrontSight', [774, 90, 811, 128]);

const lowerHandguardPixels = [
  [1545, 856],
  [2032, 858],
  [2065, 859],
  [2504, 861],
  [2504, 933],
  [2065, 941],
  [2032, 942],
  [1545, 967]
];

const upperHandguardPixels = [
  [1545, 819],
  [2032, 823],
  [2065, 825],
  [2504, 833],
  [2504, 857],
  [2065, 855],
  [2032, 855],
  [1545, 852]
];

const midBandWoodPoints = [...lowerHandguardPixels, ...upperHandguardPixels]
  .filter(([x]) => x === 2032 || x === 2065)
  .map(sidePoint);
const midBand = Object.freeze({
  woodBottomY: Math.min(...midBandWoodPoints.map(point => point.y)),
  woodTopY: Math.max(...midBandWoodPoints.map(point => point.y)),
  protrusion: MID_BAND_PROTRUSION_METRES
});
const boltBody = Object.freeze({
  startZ: upperSideStation(2194),
  endZ: upperSideStation(2148),
  radius: RECEIVER_WIDTH_METRES * 0.5,
  y: upperSidePoint([2148, 117]).y - RECEIVER_WIDTH_METRES * 0.5
});

export const MAS36_VISUAL_DATA = deepFreeze({
  id: 'mas36',
  designation: 'MAS-36',
  source: {
    localPath: 'reference/mas36-bp/Fusil modele 1936.svg',
    sha256: 'eaa57971f0ec6e076f87ca128d6559ad2d668b2bf840be9900fa1992524d4698',
    format: 'SVG vector sheet exported from the same layered artwork as the R14 DXF',
    sourceViewBox: { width: 841.89, height: 595.275 },
    registrationRaster: SIDE_REGISTRATION,
    scaleEvidence: 'The 2,315 px butt-to-muzzle span is registered to the published 1.02 m overall length; drawing sheet ruler is marked 1:5.',
    quality: 'source-registered vector silhouette; drawing authorship and factory-drawing status are not established'
  },
  reviewBlueprint: {
    sourceLabel: 'MAS-36 supplied SVG',
    metresPerSourcePixel: METRES_PER_RASTER_PIXEL,
    views: {
      tl: {
        view: 'side',
        cropPixels: SIDE_BLUEPRINT_CROP,
        planeCenter: [
          0,
          (SIDE_BLUEPRINT_BARREL_AXIS_Y
            - (SIDE_BLUEPRINT_CROP.top
              + (SIDE_REGISTRATION.rasterHeight
                - SIDE_BLUEPRINT_CROP.top
                - SIDE_BLUEPRINT_CROP.bottom) * 0.5)) * METRES_PER_RASTER_PIXEL,
          OVERALL_LENGTH_METRES * 0.5
        ],
        rotationDegrees: 0,
        mirrorX: false,
        evidence: 'clean assembled left-facing side elevation in the upper sheet, registered directly to the +X camera view; exploded lower-sheet drawings are excluded'
      },
      tr: {
        view: 'top',
        cropPixels: TOP_BLUEPRINT_CROP,
        planeCenter: [0, 0, OVERALL_LENGTH_METRES * 0.5],
        rotationDegrees: -90,
        mirrorX: false,
        evidence: 'complete top elevation rotated into the +Y camera view'
      }
    },
    unsupportedViews: {
      front: 'The sheet has component end views but no assembled front elevation.'
    }
  },
  silhouetteCalibration: {
    side: {
      imageSize: [SIDE_REGISTRATION.rasterWidth, SIDE_REGISTRATION.rasterHeight],
      cropPixels: {
        left: 480,
        top: 40,
        right: SIDE_REGISTRATION.rasterWidth - 2833,
        bottom: SIDE_REGISTRATION.rasterHeight - 560
      },
      buttPixelX: 2814,
      muzzlePixelX: 499,
      barrelAxisPixelY: 153,
      componentSeedPixel: [1000, 150],
      metresPerSourcePixel: METRES_PER_RASTER_PIXEL,
      evidence: 'assembled upper side elevation; published 1.02 m span and bore axis are locked before geometry comparison'
    }
  },
  visualSpec: {
    id: 'mas36',
    designation: 'MAS-36',
    kind: 'rifle',
    overallLength: OVERALL_LENGTH_METRES,
    stockEnd: sideStation(1270),
    receiverEnd: sideStation(1545),
    handguardEnd: sideStation(2504),
    barrelRadius: 0.0062,
    magazine: 'internal',
    definingFeatures: [
      'dog-leg bolt handle',
      'short enclosed internal magazine',
      'two-piece fore-end and upper handguard',
      'stored spike bayonet tube'
    ]
  },
  stations: {
    receiverStart: upperSideStation(2148),
    stockNose: sideStation(1270),
    receiverEnd: upperSideStation(1768),
    receiverTangEnd: sideStation(1297),
    midBandStart: sideStation(2032),
    midBandEnd: sideStation(2065),
    handguardEnd: sideStation(2504),
    frontBandStart: sideStation(2504),
    frontBandEnd: sideStation(2565),
    bayonetTubeEnd: 0.99
  },
  widths: {
    stock: STOCK_WIDTH_METRES,
    receiver: RECEIVER_WIDTH_METRES,
    lowerHandguard: 0.038,
    upperHandguard: 0.040,
    midBand: MID_BAND_WIDTH_METRES,
    frontBand: 0.046
  },
  sourcePixels: {
    stockUpper: stockUpperPixels,
    stockLower: stockLowerPixels,
    receiver: receiverPixels,
    lowerHandguard: lowerHandguardPixels,
    upperHandguard: upperHandguardPixels,
    triggerGuard: triggerGuardSource
  },
  controls: {
    triggerGuard: {
      sourcePixel: triggerGuardSource.centerPixel,
      z: upperSideStation(triggerGuardSource.centerPixel[0]),
      y: (SIDE_BLUEPRINT_BARREL_AXIS_Y - triggerGuardSource.centerPixel[1])
        * METRES_PER_RASTER_PIXEL,
      outer: triggerGuardSource.outerPixels.map(upperSidePoint),
      inner: triggerGuardSource.innerPixels.map(upperSidePoint),
      trigger: triggerGuardSource.triggerPixels.map(upperSidePoint)
    },
    receiverTopDetails,
    frontSight,
    midBand,
    boltBody
  },
  profiles: {
    stock: [...stockUpperPixels, ...stockLowerPixels].map(sidePoint),
    receiver: receiverPixels.map(upperSidePoint),
    lowerHandguard: lowerHandguardPixels.map(sidePoint),
    upperHandguard: upperHandguardPixels.map(sidePoint)
  },
  classification: {
    overallLength: 'historical published dimension',
    profilePoints: 'source-registered pixels from the supplied vector sheet; receiver, rear sight, and trigger guard use the assembled upper side elevation',
    widths: 'source-registered top-view inference; stock wrist is authored wider than the receiver and the sling band uses an even 4 mm perimeter reveal',
    barrelRadius: 'source-registered top-view inference',
    bayonetTubeEnd: 'renderer approximation constrained by the side view'
  }
});
