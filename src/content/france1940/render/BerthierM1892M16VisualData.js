const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

const OVERALL_LENGTH_METRES = 0.945;
const SOURCE = Object.freeze({
  width: 1171,
  height: 682,
  buttX: 8,
  muzzleX: 1159,
  boreY: 256
});
const METRES_PER_PIXEL = OVERALL_LENGTH_METRES / (SOURCE.muzzleX - SOURCE.buttX);
const SOURCE_BARREL_RADIUS_PIXELS = 8;
const RENDERER_BARREL_RADIUS_PIXELS = 9;
const point = ([x, y]) => Object.freeze({
  sourcePixel: Object.freeze({ x, y }),
  z: (x - SOURCE.buttX) * METRES_PER_PIXEL,
  y: (SOURCE.boreY - y) * METRES_PER_PIXEL
});
const station = x => (x - SOURCE.buttX) * METRES_PER_PIXEL;

const rearStockPixels = [
  [8, 352], [40, 344], [100, 333], [200, 314], [260, 304],
  [280, 313], [300, 313], [340, 296], [380, 280], [420, 267],
  [460, 264], [520, 272], [560, 271], [600, 266], [648, 264],
  [648, 307], [600, 319], [560, 328], [520, 336], [480, 340],
  [440, 326], [400, 333], [360, 344], [320, 359], [280, 377],
  [260, 386], [220, 404], [180, 421], [140, 439], [100, 457],
  [60, 474], [40, 480], [8, 357]
];
const handguardPixels = [
  [648, 260], [815, 260], [835, 259], [1015, 259],
  [1015, 290], [900, 291], [835, 292], [815, 295],
  [740, 299], [680, 304], [648, 307]
];
const upperHandguardPixels = [
  [648, 238], [812, 238], [815, 260], [648, 260]
];
const forwardUpperHandguardPixels = [
  [836, 244], [899, 244], [899, 259], [836, 259]
];
const receiverPixels = [
  [389, 241], [467, 238], [648, 239], [648, 286],
  [468, 286], [448, 278], [389, 286]
];
const magazineSourcePixels = [
  [492, 284], [631, 284], [631, 337], [615, 347],
  [535, 379], [516, 378], [500, 365], [492, 347]
];
const magazineProfilePixels = [
  [492, 284], [631, 284], [631, 330], [615, 340],
  [535, 379], [516, 378], [500, 365], [492, 347]
];
const frontSightPixels = [
  [1128, 248], [1135, 233], [1142, 248]
];
const triggerGuardOuterPixels = [
  [389, 322], [472, 322], [472, 347], [464, 361],
  [452, 369], [415, 370], [401, 363], [392, 351]
];
const triggerGuardInnerPixels = [
  [400, 330], [462, 330], [462, 346], [455, 356],
  [445, 362], [418, 362], [407, 356], [400, 347]
];
const triggerPixels = [
  [419, 330], [427, 330], [428, 344], [432, 356],
  [425, 358], [419, 345]
];

const sourceBox = (name, [left, top, right, bottom]) => Object.freeze({
  name,
  sourceBounds: Object.freeze({ left, top, right, bottom }),
  startZ: station(left),
  endZ: station(right),
  topY: point([left, top]).y,
  bottomY: point([left, bottom]).y
});

export const BERTHIER_M1892_M16_VISUAL_DATA = deepFreeze({
  id: 'berthier1892m16',
  designation: 'Berthier Mousqueton Mle 1892 M16',
  source: {
    localPath: 'reference/berthier_1892_m16.png',
    sha256: '15930b9e997f901b8657bae19594945b735ce42f77e4c5f91efe4dee111fcc46',
    format: 'transparent PNG side-elevation illustration supplied by the user',
    imageSize: [SOURCE.width, SOURCE.height],
    scaleEvidence: 'The 1,151 px butt-to-muzzle span is registered to the published 0.945 m overall length.',
    dimensionReferenceUrl: 'https://museedelaresistanceenligne.org/media.php?expo=0&media=621',
    serviceReferenceUrl: 'https://imagesdefense.gouv.fr/fr/plan-moyen-de-soldats-qui-defilent-mousqueton-modele-1892-sur-l-epaule.html',
    quality: 'user-supplied clean side illustration; overall length is secondary-museum sourced; sectional depths are cross-view constrained inference because no top or front drawing was supplied'
  },
  reviewBlueprint: {
    sourceLabel: 'Berthier Mle 1892 M16 supplied PNG',
    metresPerSourcePixel: METRES_PER_PIXEL,
    views: {
      tl: {
        view: 'side',
        cropPixels: { left: 0, top: 220, right: 0, bottom: SOURCE.height - 495 },
        planeCenter: [
          0,
          (SOURCE.boreY - (220 + (SOURCE.height - 220 - (SOURCE.height - 495)) * 0.5))
            * METRES_PER_PIXEL,
          OVERALL_LENGTH_METRES * 0.5
        ],
        rotationDegrees: 0,
        mirrorX: true,
        evidence: 'clean right-facing side elevation mirrored into the review page +X camera convention'
      }
    },
    unsupportedViews: {
      front: 'No assembled front elevation was supplied.',
      top: 'No assembled top elevation was supplied.'
    }
  },
  silhouetteCalibration: {
    side: {
      imageSize: [SOURCE.width, SOURCE.height],
      cropPixels: { left: 0, top: 220, right: 0, bottom: SOURCE.height - 495 },
      buttPixelX: SOURCE.buttX,
      muzzlePixelX: SOURCE.muzzleX,
      barrelAxisPixelY: SOURCE.boreY,
      componentSeedPixel: [700, 280],
      metresPerSourcePixel: METRES_PER_PIXEL,
      evidence: 'right-facing supplied side elevation with published overall length and illustrated bore axis locked before geometry comparison'
    }
  },
  visualSpec: {
    id: 'berthier1892m16',
    designation: 'Berthier Mousqueton Mle 1892 M16',
    kind: 'rifle',
    overallLength: OVERALL_LENGTH_METRES,
    stockEnd: station(648),
    receiverEnd: station(648),
    handguardEnd: station(1015),
    barrelRadius: RENDERER_BARREL_RADIUS_PIXELS * METRES_PER_PIXEL,
    magazine: 'berthier-m16-en-bloc',
    triggerGripStation: station(430),
    supportGripStation: station(750),
    reloadGripStation: station(560),
    definingFeatures: [
      'short cavalry-artillery carbine proportions',
      'five-round M16 Mannlicher-style magazine extension',
      'downturned bolt handle with spherical knob',
      'two-piece fore-end and upper handguard',
      'front barrel band with right-side stacking rod'
    ]
  },
  lodDistances: {
    highMax: 4,
    mediumMax: 18,
    classification: 'user-requested renderer distances; full weapon detail is reserved for inspection-range cameras'
  },
  stations: {
    stockNose: station(648),
    receiverStart: station(389),
    receiverEnd: station(648),
    handguardStart: station(648),
    handguardEnd: station(1015),
    midBandStart: station(812),
    midBandEnd: station(836),
    forwardUpperHandguardEnd: station(899),
    frontBandStart: station(1013),
    frontBandEnd: station(1038),
    barrelStart: station(648)
  },
  widths: {
    stock: 0.042,
    receiver: 48 * METRES_PER_PIXEL,
    handguard: 0.033,
    upperHandguard: 0.034,
    forwardUpperHandguard: 0.034,
    magazine: 0.034,
    frontSight: 0.008,
    midBand: 0.042,
    frontBand: 0.044
  },
  sourcePixels: {
    rearStock: rearStockPixels,
    handguard: handguardPixels,
    upperHandguard: upperHandguardPixels,
    forwardUpperHandguard: forwardUpperHandguardPixels,
    receiver: receiverPixels,
    magazine: magazineSourcePixels,
    triggerGuardOuter: triggerGuardOuterPixels,
    triggerGuardInner: triggerGuardInnerPixels,
    trigger: triggerPixels,
    frontSight: frontSightPixels
  },
  profiles: {
    stock: rearStockPixels.map(point),
    handguard: handguardPixels.map(point),
    upperHandguard: upperHandguardPixels.map(point),
    forwardUpperHandguard: forwardUpperHandguardPixels.map(point),
    receiver: receiverPixels.map(point),
    magazine: magazineProfilePixels.map(point),
    triggerGuardOuter: triggerGuardOuterPixels.map(point),
    triggerGuardInner: triggerGuardInnerPixels.map(point),
    trigger: triggerPixels.map(point),
    frontSight: frontSightPixels.map(point)
  },
  controls: {
    barrel: {
      sourceRadiusPixels: SOURCE_BARREL_RADIUS_PIXELS,
      rendererRadiusPixels: RENDERER_BARREL_RADIUS_PIXELS,
      sourceRadiusMetres: SOURCE_BARREL_RADIUS_PIXELS * METRES_PER_PIXEL,
      rendererRadiusMetres: RENDERER_BARREL_RADIUS_PIXELS * METRES_PER_PIXEL
    },
    boltHandle: {
      start: point([497, 253]),
      end: point([497, 329]),
      knobCenter: point([497, 335]),
      stemRadius: 0.0045,
      knobRadius: 0.010
    },
    rearSight: sourceBox('RearSight', [708, 226, 783, 239]),
    frontSight: sourceBox('FrontSight', [1128, 233, 1142, 248]),
    midBand: sourceBox('MidBand', [812, 238, 836, 295]),
    frontBand: sourceBox('FrontBand', [1013, 244, 1038, 292]),
    stackingRod: {
      ...sourceBox('StackingRod', [1028, 274, 1110, 282]),
      endZ: station(1095),
      rendererEndSourcePixelX: 1095,
      radius: 0.0035,
      x: -0.0215,
      semanticSide: 'right'
    }
  },
  classification: {
    overallLength: 'secondary museum-published dimension',
    sideProfiles: 'source-registered pixels from the supplied illustration',
    widths: 'user-reviewed cross-view renderer inference pending top/front evidence',
    magazineProfile: 'user-reviewed renderer correction retained separately from supplied source pixels',
    barrelRadius: 'source radius retained; renderer radius increased one source pixel after user review',
    stackingRod: 'source bounds retained; user-reviewed renderer length and right-side placement are cross-view constrained',
    smallHardware: 'source-registered side silhouette with inferred depth'
  }
});
