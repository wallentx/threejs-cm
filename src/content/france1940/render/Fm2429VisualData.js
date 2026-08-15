const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

const OVERALL_LENGTH_METRES = 1.08;
const SOURCE = Object.freeze({
  width: 5760,
  height: 3240,
  buttX: 3425,
  muzzleX: 5701,
  boreY: 1972
});
const METRES_PER_PIXEL = OVERALL_LENGTH_METRES / (SOURCE.muzzleX - SOURCE.buttX);
const point = ([x, y]) => Object.freeze({
  sourcePixel: Object.freeze({ x, y }),
  z: (x - SOURCE.buttX) * METRES_PER_PIXEL,
  y: (SOURCE.boreY - y) * METRES_PER_PIXEL
});
const station = x => (x - SOURCE.buttX) * METRES_PER_PIXEL;

const stockPixels = [
  [3425, 2013], [3440, 1993], [3500, 1984], [3525, 1976], [3575, 1998],
  [3650, 1997], [3725, 1995], [3775, 1995], [3825, 2011], [3875, 1989],
  [3950, 1934], [4025, 1919], [4025, 2089], [3950, 2089],
  [3875, 2107], [3800, 2134], [3725, 2161], [3650, 2206],
  [3575, 2215], [3500, 2244], [3445, 2245]
];
const receiverPixels = [
  [3885, 1978], [3950, 1934], [4025, 1919], [4100, 1913],
  [4175, 1909], [4250, 1904], [4325, 1894], [4400, 1889],
  [4475, 1890], [4550, 1892], [4625, 1894], [4670, 1920],
  [4670, 2053], [4550, 2070], [4400, 2070], [4250, 2072],
  [4100, 2080], [3950, 2089], [3885, 2076]
];
const magazinePixels = [
  [4248, 1907], [4258, 1706], [4270, 1588], [4340, 1597],
  [4400, 1622], [4430, 1634], [4430, 1702], [4420, 1792],
  [4410, 1890], [4405, 1907]
];
const handguardPixels = [
  [4280, 2051], [4350, 2049], [4475, 2050], [4590, 2052],
  [4640, 2070], [4640, 2138], [4590, 2148], [4475, 2150],
  [4350, 2145], [4280, 2132]
];
const barrelJacketPixels = [
  [4620, 1928], [4775, 1925], [4925, 1921], [5075, 1916],
  [5225, 1912], [5305, 1910], [5305, 2024], [5225, 2054],
  [5075, 2054], [4925, 2053], [4775, 2053], [4620, 2050]
];
const flashHiderPixels = [
  [5300, 1910], [5375, 1911], [5420, 1938], [5450, 1948],
  [5525, 1953], [5600, 1945], [5675, 1937], [5701, 1952],
  [5701, 1994], [5675, 2007], [5600, 1998], [5525, 1990],
  [5450, 1993], [5375, 2020], [5300, 2024]
];
const pistolGripPixels = [
  [3970, 2155], [3985, 2074], [4058, 2070], [4070, 2105],
  [4055, 2245], [4050, 2277], [3995, 2268]
];
const triggerGuardOuterPixels = [
  [4045, 2068], [4255, 2068], [4290, 2098], [4280, 2135],
  [4245, 2160], [4110, 2160], [4060, 2130]
];
const triggerGuardInnerPixels = [
  [4082, 2090], [4238, 2090], [4260, 2108], [4250, 2130],
  [4225, 2140], [4120, 2140], [4090, 2120]
];
const rearSightPixels = [
  [4185, 1907], [4185, 1829], [4195, 1829], [4202, 1834],
  [4212, 1864], [4218, 1895]
];
const frontSightPixels = [
  [5285, 1912], [5295, 1908], [5305, 1910], [5305, 1950],
  [5285, 1950]
];
const carryHandlePixels = [
  [4885, 1923], [4890, 1874], [4895, 1861], [4900, 1858],
  [4905, 1858], [4910, 1864], [4915, 1922]
];

export const FM2429_VISUAL_DATA = deepFreeze({
  id: 'fm2429',
  designation: 'FM 24/29',
  source: {
    localPath: 'reference/french-all.png',
    sha256: '91a0c3a8230899a0611326be8337d647d115c0be16b56f3ba816a4c341c408a3',
    format: 'opaque illustrated French small-arms sheet supplied by the user',
    imageSize: [SOURCE.width, SOURCE.height],
    scaleEvidence: 'The isolated 2,276 px butt-to-muzzle span is registered to the accepted 1.08 m overall length.',
    quality: 'clean illustrated right-side elevation labeled Mle 1924 M 29; sectional widths remain cross-view renderer inference'
  },
  sourceMask: {
    mode: 'edge-flood',
    borderColor: '#96917a',
    fuzzPercent: 24
  },
  silhouetteCalibration: {
    side: {
      imageSize: [SOURCE.width, SOURCE.height],
      cropPixels: { left: 3200, top: 1200, right: 0, bottom: 940 },
      buttPixelX: SOURCE.buttX,
      muzzlePixelX: SOURCE.muzzleX,
      barrelAxisPixelY: SOURCE.boreY,
      componentSeedPixel: [4300, 2000],
      metresPerSourcePixel: METRES_PER_PIXEL,
      viewDirection: '-X',
      evidence: 'right-facing sheet component explicitly labeled Mle 1924 M 29, isolated independently from adjacent weapons'
    }
  },
  visualSpec: {
    id: 'fm2429',
    designation: 'FM 24/29',
    kind: 'lmg',
    overallLength: OVERALL_LENGTH_METRES,
    stockEnd: station(4025),
    receiverEnd: station(4670),
    handguardEnd: station(5305),
    barrelRadius: 0.008,
    magazine: 'top-box',
    triggerGripStation: station(4030),
    supportGripStation: station(4510),
    reloadGripStation: station(4335),
    definingFeatures: [
      'top-mounted 25-round box magazine',
      'club-foot wooden stock and pistol grip',
      'rectangular lower handguard',
      'folding muzzle bipod and perforated conical flash hider'
    ]
  },
  lodDistances: {
    highMax: 4,
    mediumMax: 18,
    classification: 'renderer distances matched to the accepted firearm LOD policy'
  },
  stations: {
    stockNose: station(4025),
    receiverStart: station(3885),
    receiverEnd: station(4670),
    magazineStart: station(4248),
    magazineEnd: station(4430),
    handguardStart: station(4280),
    handguardEnd: station(4640),
    barrelJacketStart: station(4620),
    barrelJacketEnd: station(5305),
    flashHiderStart: station(5300),
    bipodPivot: station(5290),
    bipodRestEnd: station(4740)
  },
  widths: {
    stock: 0.055,
    receiver: 0.060,
    magazine: 0.052,
    handguard: 0.050,
    barrelJacket: 0.052,
    flashHider: 0.035,
    pistolGrip: 0.038,
    triggerGuard: 0.014,
    rearSight: 0.026,
    frontSight: 0.022
  },
  sourcePixels: {
    stock: stockPixels,
    receiver: receiverPixels,
    magazine: magazinePixels,
    handguard: handguardPixels,
    barrelJacket: barrelJacketPixels,
    flashHider: flashHiderPixels,
    pistolGrip: pistolGripPixels,
    triggerGuardOuter: triggerGuardOuterPixels,
    triggerGuardInner: triggerGuardInnerPixels,
    rearSight: rearSightPixels,
    frontSight: frontSightPixels,
    carryHandle: carryHandlePixels
  },
  profiles: {
    stock: stockPixels.map(point),
    receiver: receiverPixels.map(point),
    magazine: magazinePixels.map(point),
    handguard: handguardPixels.map(point),
    barrelJacket: barrelJacketPixels.map(point),
    flashHider: flashHiderPixels.map(point),
    pistolGrip: pistolGripPixels.map(point),
    triggerGuardOuter: triggerGuardOuterPixels.map(point),
    triggerGuardInner: triggerGuardInnerPixels.map(point),
    rearSight: rearSightPixels.map(point),
    frontSight: frontSightPixels.map(point),
    carryHandle: carryHandlePixels.map(point)
  },
  controls: {
    chargingHandle: {
      start: [-0.018, point([4100, 1913]).y, station(4100)],
      end: [-0.055, point([4100, 1935]).y, station(4100)],
      radius: 0.0045,
      semanticSide: 'right'
    },
    bipod: {
      pivotY: point([5290, 2020]).y,
      restY: point([4900, 2048]).y,
      radius: 0.0045
    }
  },
  classification: {
    overallLength: 'historical nominal already canonical in the project',
    sideProfiles: 'source-registered pixels from the user-supplied illustration',
    widths: 'cross-view renderer inference',
    bipodDepth: 'renderer approximation constrained to the illustrated folded side position'
  }
});
