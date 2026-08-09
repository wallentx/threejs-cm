const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

const OVERALL_LENGTH_METRES = 1.30;
const SOURCE_IMAGE_SIZE = Object.freeze([5760, 3240]);
const PLAIN = Object.freeze({ buttX: 91, muzzleX: 2819, boreY: 94 });
const SCOPED = Object.freeze({ buttX: 104, muzzleX: 2832, boreY: 1440 });
const METRES_PER_PIXEL = OVERALL_LENGTH_METRES / (PLAIN.muzzleX - PLAIN.buttX);
const SOURCE_BARREL_RADIUS_PIXELS = 9;
const RENDERER_BARREL_RADIUS_PIXELS = 18;
const point = ([x, y]) => Object.freeze({
  sourcePixel: Object.freeze({ x, y }),
  z: (x - PLAIN.buttX) * METRES_PER_PIXEL,
  y: (PLAIN.boreY - y) * METRES_PER_PIXEL
});
const station = x => (x - PLAIN.buttX) * METRES_PER_PIXEL;

// These landmark traces preserve the pixels read from the supplied illustrated
// sheet. They are a registered modeling reference, not a claim that the sheet
// is an orthographic engineering drawing.
const stockPixels = [
  [91, 174], [150, 187], [250, 180], [350, 173], [450, 167],
  [520, 182], [600, 180], [650, 154], [700, 140], [750, 115],
  [820, 92], [862, 92], [862, 200], [820, 202], [750, 215],
  [650, 247], [550, 284], [450, 321], [350, 357], [250, 389],
  [150, 430], [100, 410]
];
const receiverPixels = [
  [775, 58], [835, 50], [1110, 52], [1159, 61],
  [1159, 192], [865, 202], [800, 172]
];
const rearForearmPixels = [
  [1159, 92], [1616, 92], [1616, 181], [1159, 191]
];
const frontForearmPixels = [
  [1651, 92], [2546, 92], [2546, 164], [1651, 170]
];
const triggerGuardOuterPixels = [
  [735, 170], [900, 170], [910, 210], [880, 245],
  [780, 250], [740, 220]
];
const triggerGuardInnerPixels = [
  [760, 182], [885, 182], [891, 207], [870, 231],
  [790, 235], [760, 214]
];
const triggerPixels = [
  [800, 185], [812, 185], [815, 225], [805, 220]
];
const frontSightPixels = [
  [2735, 78], [2752, 42], [2770, 78]
];

const sourceBox = (name, [left, top, right, bottom]) => Object.freeze({
  name,
  sourceBounds: Object.freeze({ left, top, right, bottom }),
  startZ: station(left),
  endZ: station(right),
  topY: point([left, top]).y,
  bottomY: point([left, bottom]).y
});

const illustratedReference = Object.freeze({
  localPath: 'reference/french-all.png',
  sha256: '91a0c3a8230899a0611326be8337d647d115c0be16b56f3ba816a4c341c408a3',
  format: 'opaque illustrated French weapon sheet supplied by the user',
  imageSize: SOURCE_IMAGE_SIZE,
  scaleEvidence: 'The 2,728 px illustrated butt-to-muzzle span is registered to the published 1.30 m overall length.',
  dimensionReferenceUrl: 'https://www.musee-armee.fr/fileadmin/user_upload/Documents/Support-Visite-Fiches-Objets/Fiches-1914-1918/MA_fiche-objet-Lebel.pdf',
  opticReferenceUrl: 'https://collections.musee-armee.fr/harceler-lennemi-pendant-la-premiere-guerre-mondiale/',
  quality: 'user-supplied illustrated side views; overall length is official-museum sourced; depth and obscured details are cross-view renderer inference'
});

const crossViewReference = Object.freeze({
  localPath: 'reference/low_poly_lebel_1886.glb',
  sha256: '3fe2791ae8cdc83abf6a2fac1b5b9bc6a412da5d9467a9111c26a40eae1e8e88',
  format: 'user-supplied low-poly GLB containing six arranged Lebel variants',
  selectedNodes: Object.freeze(['Lebel_Rifle_Uncovered', 'Lebel_Rifle_Covered']),
  registration: Object.freeze({
    sourceLengthUnits: 24.190829277038574,
    registeredLengthMetres: OVERALL_LENGTH_METRES,
    metresPerSourceUnit: OVERALL_LENGTH_METRES / 24.190829277038574,
    evidence: 'only the bottom two full-length rifle assemblies were normalized to the official 1.30 m length; the four shorter assemblies and loose cartridges were excluded'
  }),
  dimensionReferenceUrl: illustratedReference.dimensionReferenceUrl,
  opticReferenceUrl: illustratedReference.opticReferenceUrl,
  normalizedMeasurements: Object.freeze({
    stockWidth: 0.035222,
    forearmWidth: 0.03155,
    centralMetalEnvelopeWidth: 0.029816,
    triggerGuardWidth: 0.014884,
    rearSightWidth: 0.01563,
    frontSightWidth: 0.00448,
    boltAction: Object.freeze({
      rearPieceStartZ: 0.336262,
      rearPieceEndZ: 0.405295,
      rearPieceStartRadius: 0.011716,
      rearPieceEndRadius: 0.01039,
      bodyStartZ: 0.389544,
      bodyEndZ: 0.504484,
      bodyRadius: 0.009966,
      axisY: 0.00011,
      handleCenterZ: 0.42201,
      handleStemEndOffset: 0.04325,
      knobEndOffset: 0.058903,
      knobRadius: 0.011089,
      topRibWidth: 0.01323,
      topRibBottomY: 0.00776,
      topRibTopY: 0.01784,
      topRibStartZ: 0.34178,
      topRibEndZ: 0.40351
    }),
    stackingTube: Object.freeze({
      startZ: 1.176902,
      endZ: 1.233242,
      centerY: -0.0275595,
      radius: 0.003956
    }),
    scopeBounds: Object.freeze({
      width: 0.036926,
      height: 0.055887,
      length: 0.310209,
      startZ: 0.340866,
      endZ: 0.651075,
      minY: -0.011628,
      maxY: 0.044259,
      lateralCenterOffset: 0.031909
    })
  }),
  quality: 'primary production-geometry reference supplied by the user; normalized to the official 1.30 m length, with original topology retained and explicit renderer corrections stored separately; not a canonical historical-dimension source'
});

const legacyIllustrationMask = Object.freeze({
  mode: 'edge-flood',
  borderColor: '#96917a',
  fuzzPercent: 24,
  evidence: 'renderer-only isolation settings measured from the supplied sheet background; source pixels remain unchanged'
});

const plainRegistration = Object.freeze({
  imageSize: SOURCE_IMAGE_SIZE,
  cropPixels: Object.freeze({ left: 0, top: 0, right: 2760, bottom: 2720 }),
  buttPixelX: PLAIN.buttX,
  muzzlePixelX: PLAIN.muzzleX,
  barrelAxisPixelY: PLAIN.boreY,
  componentSeedPixel: Object.freeze([1800, 130]),
  metresPerSourcePixel: METRES_PER_PIXEL,
  evidence: 'upper-left right-facing Lebel side illustration registered to the published overall length and illustrated bore axis'
});

const scopedRegistration = Object.freeze({
  imageSize: SOURCE_IMAGE_SIZE,
  cropPixels: Object.freeze({ left: 0, top: 1200, right: 2760, bottom: 1480 }),
  buttPixelX: SCOPED.buttX,
  muzzlePixelX: SCOPED.muzzleX,
  barrelAxisPixelY: SCOPED.boreY,
  componentSeedPixel: Object.freeze([1800, 1480]),
  metresPerSourcePixel: OVERALL_LENGTH_METRES / (SCOPED.muzzleX - SCOPED.buttX),
  evidence: 'lower right-facing scoped Lebel illustration registered independently to the same published overall length'
});

const visualSpec = Object.freeze({
  id: 'lebel1886m93',
  designation: 'Lebel Mle 1886/93',
  kind: 'rifle',
  overallLength: OVERALL_LENGTH_METRES,
  stockEnd: station(1159),
  receiverEnd: station(1159),
  handguardEnd: station(2546),
  barrelRadius: RENDERER_BARREL_RADIUS_PIXELS * METRES_PER_PIXEL,
  magazine: 'tubular',
  triggerGripStation: station(820),
  supportGripStation: station(1900),
  reloadGripStation: station(1080),
  definingFeatures: Object.freeze([
    'eight-round tube magazine beneath the barrel',
    'long two-piece wooden fore-end',
    'right-side horizontal bolt handle with faceted terminal knob',
    'full-length 1.30 metre infantry-rifle silhouette'
  ])
});

const baseData = {
  source: crossViewReference,
  illustratedReference,
  crossViewReference,
  legacyIllustrationMask,
  visualSpec,
  lodDistances: {
    highMax: 4,
    mediumMax: 18,
    classification: 'user-requested renderer distances; full reference topology is reserved for inspection-range cameras'
  },
  stations: {
    receiverStart: station(775),
    receiverEnd: station(1159),
    rearForearmStart: station(1159),
    rearForearmEnd: station(1616),
    frontForearmStart: station(1651),
    frontForearmEnd: station(2546),
    midBandStart: station(1614),
    midBandEnd: station(1652),
    frontBandStart: station(2545),
    frontBandEnd: station(2598),
    tubeStart: station(1150),
    tubeEnd: station(2700)
  },
  widths: {
    stock: crossViewReference.normalizedMeasurements.stockWidth,
    receiver: crossViewReference.normalizedMeasurements.centralMetalEnvelopeWidth,
    rearForearm: crossViewReference.normalizedMeasurements.forearmWidth,
    frontForearm: crossViewReference.normalizedMeasurements.forearmWidth,
    triggerGuard: crossViewReference.normalizedMeasurements.triggerGuardWidth,
    rearSight: crossViewReference.normalizedMeasurements.rearSightWidth,
    midBand: 0.036,
    frontBand: 0.036,
    frontSight: crossViewReference.normalizedMeasurements.frontSightWidth
  },
  sourcePixels: {
    stock: stockPixels,
    receiver: receiverPixels,
    rearForearm: rearForearmPixels,
    frontForearm: frontForearmPixels,
    triggerGuardOuter: triggerGuardOuterPixels,
    triggerGuardInner: triggerGuardInnerPixels,
    trigger: triggerPixels,
    frontSight: frontSightPixels
  },
  profiles: {
    stock: stockPixels.map(point),
    receiver: receiverPixels.map(point),
    rearForearm: rearForearmPixels.map(point),
    frontForearm: frontForearmPixels.map(point),
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
    rearSight: sourceBox('RearSight', [1320, 42, 1490, 73]),
    midBand: sourceBox('MidBand', [1614, 69, 1652, 194]),
    frontBand: sourceBox('FrontBand', [2545, 70, 2598, 170]),
    tube: {
      startZ: station(1150),
      endZ: crossViewReference.normalizedMeasurements.stackingTube.startZ,
      y: point([1150, 152]).y,
      radius: 0.006
    },
    stackingTube: {
      ...crossViewReference.normalizedMeasurements.stackingTube,
      sourceNodeName: 'Cleaing_Rod_Lebel_1886_mat_0',
      semanticPart: 'stackingTube',
      evidence: 'user identified the short exposed lower tube in the GLB orthographic views as the stacking tube; it is modeled separately from the eight-round magazine tube'
    },
    boltAction: {
      ...crossViewReference.normalizedMeasurements.boltAction,
      evidence: 'normalized from right, left, top, bottom, front, and rear orthographic projections of the bottom full-length GLB rifle'
    },
    boltHandle: {
      illustratedStart: point([910, 73]),
      illustratedEnd: point([910, 155]),
      illustratedKnobCenter: point([910, 163]),
      centerY: crossViewReference.normalizedMeasurements.boltAction.axisY,
      centerZ: crossViewReference.normalizedMeasurements.boltAction.handleCenterZ,
      stemStartOffset: 0.008,
      stemEndOffset: 0.046,
      stemRadius: 0.0048,
      knobStartOffset: crossViewReference.normalizedMeasurements.boltAction.handleStemEndOffset,
      knobEndOffset: crossViewReference.normalizedMeasurements.boltAction.knobEndOffset,
      knobRadius: crossViewReference.normalizedMeasurements.boltAction.knobRadius
    },
    optic: {
      startZ: (780 - SCOPED.buttX) * scopedRegistration.metresPerSourcePixel,
      endZ: (1460 - SCOPED.buttX) * scopedRegistration.metresPerSourcePixel,
      centerY: (SCOPED.boreY - 1340) * scopedRegistration.metresPerSourcePixel,
      tubeRadius: 0.013,
      objectiveRadius: crossViewReference.normalizedMeasurements.scopeBounds.width * 0.5,
      ocularRadius: 0.01615,
      semanticSide: 'left',
      lateralOffset: crossViewReference.normalizedMeasurements.scopeBounds.lateralCenterOffset,
      mountWidth: crossViewReference.normalizedMeasurements.scopeBounds.width,
      mountStations: Object.freeze([
        (900 - SCOPED.buttX) * scopedRegistration.metresPerSourcePixel,
        (1280 - SCOPED.buttX) * scopedRegistration.metresPerSourcePixel
      ])
    }
  },
  classification: {
    overallLength: 'official museum-published dimension',
    productionTopology: 'normalized bottom full-length GLB assemblies directly own production geometry; no runtime GLB loader is used',
    illustratedProfiles: 'superseded geometry evidence retained only as an immutable legacy record; the illustrated sheet no longer controls Lebel shape, placement, optic location, or calibration',
    widths: 'direct normalized dimensions of the production GLB topology; still non-canonical historical evidence',
    barrelRadius: 'source radius retained; renderer radius doubled after user review because the initial barrel was visibly too thin',
    magazineAndStackingTube: 'official eight-round magazine identity remains authoritative; production topology and the separate user-identified stacking tube come directly from the normalized GLB',
    boltAction: 'direct normalized GLB topology; no reconstructed primitives remain',
    optic: 'official museum identity with mount, body topology, lateral offset, longitudinal placement, and vertical placement taken directly from the normalized scoped GLB assembly',
    smallHardware: 'direct normalized GLB topology'
  }
};

export const LEBEL_M1886_M93_VISUAL_DATA = deepFreeze({
  id: 'lebel1886m93',
  designation: 'Lebel Mle 1886/93',
  ...baseData,
  legacyIllustrationCalibration: { side: plainRegistration }
});

export const LEBEL_M1886_M93_APX1916_VISUAL_DATA = deepFreeze({
  id: 'lebel1886m93apx1916',
  designation: 'Lebel Mle 1886/93 with APX 1916',
  ...baseData,
  legacyIllustrationMask: {
    ...legacyIllustrationMask,
    fuzzPercent: 10,
    evidence: 'variant-specific renderer-only edge flood preserves the lighter scoped-rifle stock while removing the supplied sheet background'
  },
  visualSpec: {
    ...visualSpec,
    id: 'lebel1886m93apx1916',
    designation: 'Lebel Mle 1886/93 with APX 1916',
    optic: 'apx1916',
    definingFeatures: [
      ...visualSpec.definingFeatures,
      'APX 1916 telescopic sight with two receiver mounts'
    ]
  },
  legacyIllustrationCalibration: { side: scopedRegistration }
});
