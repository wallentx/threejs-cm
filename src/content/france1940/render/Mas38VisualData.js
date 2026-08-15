import { MAS38_REFERENCE_MESH_DATA } from './Mas38ReferenceMeshData.js';

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

const OVERALL_LENGTH_METRES = 0.63;
const SOURCE = Object.freeze({
  width: 5760,
  height: 3240,
  buttX: 2323,
  muzzleX: 3580,
  boreY: 1910
});
const METRES_PER_PIXEL = OVERALL_LENGTH_METRES / (SOURCE.muzzleX - SOURCE.buttX);
const ILLUSTRATED_REFERENCE = Object.freeze({
  localPath: 'reference/french-all.png',
  sha256: '91a0c3a8230899a0611326be8337d647d115c0be16b56f3ba816a4c341c408a3',
  format: 'opaque illustrated French small-arms sheet supplied by the user',
  imageSize: [SOURCE.width, SOURCE.height],
  scaleEvidence: 'The isolated 1,257 px butt-to-muzzle span is registered to the accepted 0.63 m overall length.',
  quality: 'legacy right-side silhouette evidence; the complete local glTF now owns cross-view production topology'
});
const point = ([x, y]) => Object.freeze({
  sourcePixel: Object.freeze({ x, y }),
  z: (x - SOURCE.buttX) * METRES_PER_PIXEL,
  y: (SOURCE.boreY - y) * METRES_PER_PIXEL
});
const station = x => (x - SOURCE.buttX) * METRES_PER_PIXEL;

const stockPixels = [
  [2323, 1948], [2330, 1927], [2350, 1924], [2400, 1919],
  [2500, 1915], [2600, 1908], [2700, 1898], [2780, 1892],
  [2820, 1895], [2840, 1880], [2840, 1996], [2780, 2001],
  [2700, 2014], [2600, 2045], [2500, 2093], [2400, 2142],
  [2350, 2154], [2330, 2019]
];
const receiverPixels = [
  [2790, 1895], [2820, 1895], [2840, 1880], [2860, 1869],
  [2900, 1870], [3000, 1871], [3100, 1873], [3160, 1874],
  [3185, 1885], [3185, 1982], [3160, 1989], [3100, 1998],
  [3060, 1995], [3020, 2028], [2980, 2031], [2940, 2035],
  [2900, 2038], [2860, 2010], [2820, 1997], [2790, 1999]
];
const pistolGripPixels = [
  [2845, 2004], [2910, 2000], [2960, 2028], [2940, 2146],
  [2900, 2151], [2860, 2152], [2840, 2150], [2860, 2036]
];
const magazinePixels = [
  [3072, 1988], [3144, 1985], [3185, 2283], [3160, 2288],
  [3120, 2292], [3110, 2285], [3090, 2142], [3075, 2033]
];
const triggerGuardOuterPixels = [
  [2920, 1994], [3045, 1992], [3080, 2010], [3080, 2045],
  [3045, 2078], [2970, 2078], [2930, 2045]
];
const triggerGuardInnerPixels = [
  [2950, 2010], [3035, 2010], [3055, 2022], [3055, 2040],
  [3035, 2058], [2980, 2058], [2955, 2040]
];
const barrelCollarPixels = [
  [3160, 1874], [3200, 1887], [3200, 1924], [3180, 1929],
  [3160, 1929]
];
const frontSightPixels = [
  [3545, 1895], [3548, 1861], [3560, 1861], [3566, 1895],
  [3575, 1898], [3580, 1904], [3580, 1920], [3565, 1929],
  [3545, 1927]
];
const rearSightPixels = [
  [2885, 1870], [2885, 1837], [2893, 1837], [2895, 1870]
];

export const MAS38_VISUAL_DATA = deepFreeze({
  id: 'mas38',
  designation: 'MAS-38',
  source: MAS38_REFERENCE_MESH_DATA.source,
  referenceMeshSource: MAS38_REFERENCE_MESH_DATA.source,
  crossViewReference: MAS38_REFERENCE_MESH_DATA.source,
  illustratedReference: ILLUSTRATED_REFERENCE,
  sourceMask: {
    mode: 'edge-flood',
    borderColor: '#96917a',
    fuzzPercent: 15
  },
  silhouetteCalibration: {
    side: {
      imageSize: [SOURCE.width, SOURCE.height],
      cropPixels: { left: 2100, top: 1600, right: 1960, bottom: 790 },
      buttPixelX: SOURCE.buttX,
      muzzlePixelX: SOURCE.muzzleX,
      barrelAxisPixelY: SOURCE.boreY,
      componentSeedPixel: [2800, 1950],
      metresPerSourcePixel: METRES_PER_PIXEL,
      viewDirection: '-X',
      evidence: 'right-facing MAS-38 component isolated independently from the FM 24/29 and adjacent long guns'
    }
  },
  visualSpec: {
    id: 'mas38',
    designation: 'MAS-38',
    kind: 'smg',
    overallLength: OVERALL_LENGTH_METRES,
    stockEnd: station(2840),
    receiverEnd: station(3185),
    handguardEnd: station(3200),
    barrelRadius: 0.0085,
    barrelStartY: point([3200, 1906]).y,
    barrelEndY: point([3580, 1910]).y,
    magazine: 'bottom-box',
    triggerGripStation: station(2900),
    supportGripStation: station(3160),
    supportGripLateralOffset: 0.070,
    supportGripY: -0.070,
    reloadGripStation: station(3140),
    definingFeatures: [
      'deep tapered wooden stock',
      'sloped compact receiver',
      'separate rearward pistol grip',
      'long forward-canted bottom magazine',
      'right-side cocking knob and protected muzzle sight'
    ]
  },
  lodDistances: {
    highMax: 4,
    mediumMax: 18,
    classification: 'renderer distances matched to the accepted firearm LOD policy'
  },
  stations: {
    stockNose: station(2840),
    receiverStart: station(2790),
    receiverEnd: station(3185),
    magazineStart: station(3072),
    magazineEnd: station(3185),
    barrelStart: station(3180),
    collarStart: station(3160),
    collarEnd: station(3200),
    rearSightStart: station(2885),
    rearSightEnd: station(2895),
    frontSightStart: station(3545)
  },
  widths: {
    stock: 0.048,
    receiver: 0.045,
    pistolGrip: 0.038,
    magazine: 0.030,
    triggerGuard: 0.012,
    barrelCollar: 0.040,
    rearSight: 0.018,
    frontSight: 0.020
  },
  sourcePixels: {
    stock: stockPixels,
    receiver: receiverPixels,
    pistolGrip: pistolGripPixels,
    magazine: magazinePixels,
    triggerGuardOuter: triggerGuardOuterPixels,
    triggerGuardInner: triggerGuardInnerPixels,
    barrelCollar: barrelCollarPixels,
    rearSight: rearSightPixels,
    frontSight: frontSightPixels
  },
  profiles: {
    stock: stockPixels.map(point),
    receiver: receiverPixels.map(point),
    pistolGrip: pistolGripPixels.map(point),
    magazine: magazinePixels.map(point),
    triggerGuardOuter: triggerGuardOuterPixels.map(point),
    triggerGuardInner: triggerGuardInnerPixels.map(point),
    barrelCollar: barrelCollarPixels.map(point),
    rearSight: rearSightPixels.map(point),
    frontSight: frontSightPixels.map(point)
  },
  controls: {
    magazineBody: {
      visibleTopCenter: point([3106, 1987]),
      visibleBottomCenter: point([3148, 2287]),
      crossViewDepth: 0.036,
      insertionDepth: 0.014,
      rollRadians: 0
    },
    foldingMagazineHousingExtension: {
      startZ: station(3180),
      endZ: station(3240),
      centerY: point([3210, 1978]).y,
      radius: 0.0015
    },
    cockingHandle: {
      start: [-0.018, point([3040, 1930]).y, station(3040)],
      end: [-0.052, point([3040, 1930]).y, station(3040)],
      stemRadius: 0.004,
      knobRadius: 0.012,
      semanticSide: 'right'
    },
    dustCover: {
      startZ: station(2880),
      endZ: station(3070),
      centerY: point([2980, 1915]).y,
      height: 0.030,
      width: 0.006
    }
  },
  classification: {
    overallLength: 'historical nominal already canonical in the project',
    sideProfiles: 'source-registered pixels from the user-supplied illustration',
    widths: 'cross-view renderer inference',
    actionDepth: 'renderer approximation constrained to the verified right side',
    magazineCrossView: 'user-reviewed renderer correction: zero-roll box section with the source side cant retained',
    magazineInsertion: 'user-reviewed renderer correction extending only the hidden feed end into the receiver',
    foldingMagazineHousingExtension: 'source-registered side profile with its receiver attachment preserved',
    supportGrip: 'renderer approximation placing the wrist outside and below the narrow front receiver'
  }
});
