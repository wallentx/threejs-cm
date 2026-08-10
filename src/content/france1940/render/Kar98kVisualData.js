const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

const OVERALL_LENGTH_METRES = 1.11;
const SOURCE = Object.freeze({
  width: 5760,
  height: 3240,
  buttX: 53,
  muzzleX: 1910,
  boreY: 700
});
const METRES_PER_PIXEL = OVERALL_LENGTH_METRES / (SOURCE.muzzleX - SOURCE.buttX);
const point = ([x, y]) => Object.freeze({
  sourcePixel: Object.freeze({ x, y }),
  z: (x - SOURCE.buttX) * METRES_PER_PIXEL,
  y: (SOURCE.boreY - y) * METRES_PER_PIXEL
});
const station = x => (x - SOURCE.buttX) * METRES_PER_PIXEL;

const stockPixels = [
  [53, 772], [75, 772], [150, 762], [300, 748], [400, 740],
  [450, 753], [500, 743], [550, 724], [575, 717], [625, 707],
  [700, 704], [720, 706], [720, 793], [675, 793], [625, 798],
  [575, 798], [550, 804], [525, 816], [500, 839], [450, 863],
  [425, 856], [400, 862], [300, 900], [150, 956], [75, 977],
  [53, 977]
];
const handguardPixels = [
  [700, 690], [850, 689], [950, 689], [1050, 690], [1175, 690],
  [1200, 672], [1400, 675], [1510, 684], [1570, 686], [1570, 748],
  [1510, 750], [1400, 757], [1200, 767], [1000, 776],
  [800, 789], [700, 793]
];
const receiverPixels = [
  [575, 717], [600, 693], [625, 686], [700, 686], [750, 690],
  [850, 689], [950, 680], [1050, 680], [1150, 682], [1180, 692],
  [1180, 733], [1050, 738], [900, 745], [725, 750], [575, 750]
];
const magazinePixels = [
  [625, 748], [900, 744], [925, 760], [900, 781], [725, 793],
  [650, 792], [625, 775]
];
const triggerGuardOuterPixels = [
  [575, 750], [585, 790], [595, 820], [610, 838], [625, 846],
  [650, 844], [675, 835], [690, 815], [700, 793], [700, 770]
];
const triggerGuardInnerPixels = [
  [600, 775], [605, 800], [615, 823], [630, 835], [650, 835],
  [670, 827], [682, 810], [685, 790], [675, 775]
];
const triggerPixels = [
  [638, 770], [648, 772], [652, 790], [660, 808], [653, 822],
  [644, 818], [640, 796]
];
const rearSightPixels = [
  [1018, 681], [1028, 668], [1045, 663], [1050, 657], [1075, 664],
  [1148, 664], [1175, 671], [1175, 685]
];
const frontSightPixels = [
  [1832, 685], [1840, 672], [1848, 649], [1875, 647], [1884, 672],
  [1890, 685]
];

const sourceBox = (name, [left, top, right, bottom]) => Object.freeze({
  name,
  sourceBounds: Object.freeze({ left, top, right, bottom }),
  startZ: station(left),
  endZ: station(right),
  topY: point([left, top]).y,
  bottomY: point([left, bottom]).y
});

export const KAR98K_VISUAL_DATA = deepFreeze({
  id: 'kar98k',
  designation: 'Kar98k',
  source: {
    localPath: 'reference/german-all.png',
    sha256: '7fa2ec50c71ae578085d3b8a6f3ceeca3ad05714fa5d2dd1f531896da26f0d2a',
    format: 'opaque PNG illustrated German small-arms sheet supplied by the user',
    imageSize: [SOURCE.width, SOURCE.height],
    scaleEvidence: 'The isolated 1,857 px butt-to-muzzle span is registered to the published/current canonical 1.11 m overall length.',
    quality: 'clean illustrated right-side elevation; exact overall length is historical nominal, while sectional widths remain cross-view renderer inference'
  },
  sourceMask: {
    mode: 'edge-flood',
    borderColor: '#96917a',
    fuzzPercent: 24
  },
  reviewBlueprint: {
    sourceLabel: 'Kar98k from supplied German small-arms sheet',
    metresPerSourcePixel: METRES_PER_PIXEL,
    views: {
      tl: {
        view: 'side',
        cropPixels: { left: 0, top: 600, right: SOURCE.width - 2100, bottom: SOURCE.height - 1030 },
        planeCenter: [
          0,
          (SOURCE.boreY - (600 + 430 * 0.5)) * METRES_PER_PIXEL,
          OVERALL_LENGTH_METRES * 0.5
        ],
        rotationDegrees: 0,
        mirrorX: false,
        evidence: 'isolated standard Kar98k immediately above the scoped variant; the source depicts the weapon right side'
      }
    },
    unsupportedViews: {
      oppositeSide: 'No independent left-side elevation is present in the supplied sheet.',
      front: 'No assembled front elevation was supplied.',
      top: 'No assembled top elevation was supplied.'
    }
  },
  silhouetteCalibration: {
    side: {
      imageSize: [SOURCE.width, SOURCE.height],
      cropPixels: { left: 0, top: 600, right: SOURCE.width - 2100, bottom: SOURCE.height - 1030 },
      buttPixelX: SOURCE.buttX,
      muzzlePixelX: SOURCE.muzzleX,
      barrelAxisPixelY: SOURCE.boreY,
      componentSeedPixel: [700, 770],
      metresPerSourcePixel: METRES_PER_PIXEL,
      viewDirection: '-X',
      evidence: 'right-facing standard Kar98k component, published/current canonical length, and illustrated bore axis locked before geometry refit'
    }
  },
  visualSpec: {
    id: 'kar98k',
    designation: 'Kar98k',
    kind: 'rifle',
    overallLength: OVERALL_LENGTH_METRES,
    stockEnd: station(720),
    receiverEnd: station(1180),
    handguardEnd: station(1570),
    barrelRadius: 0.0072,
    magazine: 'internal',
    triggerGripStation: station(650),
    supportGripStation: station(1200),
    reloadGripStation: station(900),
    definingFeatures: [
      'full-length profiled wood furniture',
      'right-side turned bolt handle and ejection port',
      'internal five-round magazine floorplate',
      'tangent rear sight and hooded front sight',
      'front band and under-barrel cleaning rod'
    ]
  },
  lodDistances: {
    highMax: 4,
    mediumMax: 18,
    classification: 'renderer distances matched to the accepted rifle LOD policy'
  },
  stations: {
    stockNose: station(720),
    receiverStart: station(575),
    receiverEnd: station(1180),
    handguardStart: station(700),
    handguardEnd: station(1570),
    barrelStart: station(1450),
    rearBandStart: station(1420),
    rearBandEnd: station(1455),
    frontBandStart: station(1570),
    frontBandEnd: station(1680),
    cleaningRodStart: station(1640),
    cleaningRodEnd: station(1880)
  },
  widths: {
    stock: 0.050,
    handguard: 0.040,
    receiver: 0.042,
    magazine: 0.040,
    triggerGuard: 0.012,
    rearBand: 0.047,
    frontBand: 0.050,
    frontSight: 0.024
  },
  sourcePixels: {
    stock: stockPixels,
    handguard: handguardPixels,
    receiver: receiverPixels,
    magazine: magazinePixels,
    triggerGuardOuter: triggerGuardOuterPixels,
    triggerGuardInner: triggerGuardInnerPixels,
    trigger: triggerPixels,
    rearSight: rearSightPixels,
    frontSight: frontSightPixels
  },
  profiles: {
    stock: stockPixels.map(point),
    handguard: handguardPixels.map(point),
    receiver: receiverPixels.map(point),
    magazine: magazinePixels.map(point),
    triggerGuardOuter: triggerGuardOuterPixels.map(point),
    triggerGuardInner: triggerGuardInnerPixels.map(point),
    trigger: triggerPixels.map(point),
    rearSight: rearSightPixels.map(point),
    frontSight: frontSightPixels.map(point)
  },
  controls: {
    boltBody: {
      startZ: station(590),
      endZ: station(1010),
      axisY: point([700, 704]).y,
      radius: 0.012
    },
    boltHandle: {
      start: { x: -0.020, y: point([650, 704]).y, z: station(650) },
      end: { x: -0.056, y: point([650, 735]).y, z: station(650) },
      stemRadius: 0.0045,
      knobRadius: 0.011
    },
    rearSight: sourceBox('TangentRearSight', [1018, 657, 1175, 685]),
    rearBand: sourceBox('RearBand', [1420, 676, 1455, 755]),
    frontBand: sourceBox('FrontBand', [1570, 680, 1680, 749]),
    cleaningRod: {
      startZ: station(1640),
      endZ: station(1880),
      y: point([1700, 732]).y,
      radius: 0.0025
    }
  },
  classification: {
    overallLength: 'historical nominal retained from the canonical weapon visual contract',
    sideProfiles: 'source-registered pixels from the supplied illustration',
    widths: 'cross-view renderer inference pending independent top/front evidence',
    barrelRadius: 'source-constrained renderer approximation',
    boltDepthAndSide: 'historical handedness plus renderer inference'
  }
});
