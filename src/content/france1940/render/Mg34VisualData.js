const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

const OVERALL_LENGTH_METRES = 1.22;
const SOURCE = Object.freeze({
  width: 5760,
  height: 3240,
  buttX: 2066,
  muzzleX: 4198,
  boreY: 1996
});
const METRES_PER_PIXEL = OVERALL_LENGTH_METRES / (SOURCE.muzzleX - SOURCE.buttX);
const point = ([x, y]) => Object.freeze({
  sourcePixel: Object.freeze({ x, y }),
  z: (x - SOURCE.buttX) * METRES_PER_PIXEL,
  y: (SOURCE.boreY - y) * METRES_PER_PIXEL
});
const station = x => (x - SOURCE.buttX) * METRES_PER_PIXEL;

const stockPixels = [
  [2066, 1884], [2090, 1888], [2140, 1918], [2200, 1938],
  [2300, 1946], [2380, 1946], [2405, 1932], [2470, 1930],
  [2470, 2028], [2410, 2028], [2372, 2010], [2320, 2032],
  [2250, 2074], [2180, 2116], [2120, 2138], [2076, 2138],
  [2066, 2100]
];
const receiverPixels = [
  [2380, 1946], [2410, 1930], [2500, 1928], [2560, 1908],
  [2680, 1908], [2760, 1888], [2940, 1888], [2980, 1916],
  [3055, 1918], [3070, 1954], [3140, 1956], [3140, 2036],
  [3000, 2038], [2910, 2032], [2820, 2030], [2750, 2028],
  [2670, 2028], [2600, 2026], [2500, 2026], [2440, 2020],
  [2380, 2010]
];
const pistolGripPixels = [
  [2605, 2024], [2696, 2024], [2744, 2052], [2715, 2140],
  [2690, 2200], [2670, 2226], [2630, 2212], [2594, 2164]
];
const triggerGuardOuterPixels = [
  [2710, 2024], [2838, 2024], [2860, 2050], [2850, 2096],
  [2820, 2126], [2760, 2126], [2720, 2094]
];
const triggerGuardInnerPixels = [
  [2740, 2044], [2818, 2044], [2834, 2060], [2828, 2088],
  [2808, 2104], [2770, 2104], [2746, 2084]
];
const feedCoverPixels = [
  [2500, 1928], [2560, 1908], [2680, 1908], [2760, 1888],
  [2940, 1888], [2980, 1916], [2968, 1974], [2860, 1970],
  [2770, 1976], [2680, 1976], [2580, 1970], [2500, 1970]
];
const muzzleBoosterPixels = [
  [3940, 1950], [3990, 1938], [4055, 1948], [4090, 1966],
  [4150, 1974], [4198, 1980], [4198, 2012], [4150, 2020],
  [4090, 2028], [4055, 2044], [3990, 2052], [3940, 2040]
];

export const MG34_VISUAL_DATA = deepFreeze({
  id: 'mg34',
  designation: 'MG34',
  source: {
    localPath: 'reference/german-all.png',
    sha256: '7fa2ec50c71ae578085d3b8a6f3ceeca3ad05714fa5d2dd1f531896da26f0d2a',
    format: 'opaque illustrated German small-arms sheet supplied by the user',
    imageSize: [SOURCE.width, SOURCE.height],
    scaleEvidence: 'The isolated 2,132 px butt-to-muzzle span is registered to the accepted 1.22 m overall length.',
    quality: 'clean illustrated right-side elevation; the sheet omits an attached ammunition container'
  },
  sourceMask: {
    mode: 'edge-flood',
    borderColor: '#918e79',
    fuzzPercent: 18
  },
  silhouetteCalibration: {
    side: {
      imageSize: [SOURCE.width, SOURCE.height],
      cropPixels: { left: 1800, top: 1550, right: 1460, bottom: 890 },
      buttPixelX: SOURCE.buttX,
      muzzlePixelX: SOURCE.muzzleX,
      barrelAxisPixelY: SOURCE.boreY,
      componentSeedPixel: [2860, 1980],
      metresPerSourcePixel: METRES_PER_PIXEL,
      viewDirection: '-X',
      evidence: 'right-facing MG34 with folded bipod isolated independently from the MG42 beneath it'
    }
  },
  visualSpec: {
    id: 'mg34',
    designation: 'MG34',
    kind: 'lmg',
    overallLength: OVERALL_LENGTH_METRES,
    stockEnd: station(2470),
    receiverEnd: station(3140),
    handguardEnd: station(3940),
    barrelRadius: 0.008,
    magazine: 'belt-drum',
    triggerGripStation: station(2660),
    supportGripStation: station(3220),
    supportGripLateralOffset: 0.024,
    supportGripY: -0.040,
    reloadGripStation: station(2840),
    definingFeatures: [
      'deep waisted wooden stock',
      'rectangular milled receiver and hinged feed cover',
      'perforated cylindrical barrel jacket',
      'folding bipod',
      'left-mounted 50-round Gurttrommel 34 belt container'
    ]
  },
  lodDistances: {
    highMax: 4,
    mediumMax: 18,
    classification: 'renderer distances matched to the accepted firearm LOD policy'
  },
  stations: {
    stockNose: station(2470),
    receiverStart: station(2380),
    receiverEnd: station(3140),
    jacketStart: station(3120),
    jacketEnd: station(3940),
    muzzleBoosterStart: station(3940),
    rearSight: station(3020),
    frontSight: station(3990),
    bipodHinge: station(3850),
    drum: station(2840)
  },
  widths: {
    stock: 0.055,
    receiver: 0.060,
    pistolGrip: 0.038,
    triggerGuard: 0.010,
    feedCover: 0.066,
    jacket: 0.052,
    muzzleBooster: 0.050
  },
  controls: {
    jacketRadius: 0.022,
    jacketHoleRadius: 0.0065,
    jacketHoleStations: [3260, 3340, 3420, 3500, 3580, 3660, 3740, 3820].map(station),
    chargingHandle: {
      start: [-0.025, 0.008, station(2740)],
      end: [-0.060, 0.008, station(2680)],
      radius: 0.006
    },
    muzzleSections: [
      { z: station(3940), radius: 0.024 },
      { z: station(3970), radius: 0.024 },
      { z: station(3990), radius: 0.030 },
      { z: station(4010), radius: 0.030 },
      { z: station(4055), radius: 0.024 },
      { z: station(4080), radius: 0.024 },
      { z: station(4090), radius: 0.017 },
      { z: station(4150), radius: 0.012 },
      { z: OVERALL_LENGTH_METRES, radius: 0.010 }
    ],
    muzzleSectionsLod: [
      { z: station(3940), radius: 0.024 },
      { z: station(3990), radius: 0.030 },
      { z: station(4055), radius: 0.024 },
      { z: station(4090), radius: 0.017 },
      { z: station(4150), radius: 0.012 },
      { z: OVERALL_LENGTH_METRES, radius: 0.010 }
    ],
    bipod: {
      pivotY: -0.018,
      leftRest: [0.035, -0.080, station(3420)],
      rightRest: [-0.035, -0.080, station(3420)],
      radius: 0.006
    },
    rearSight: {
      startZ: station(2920),
      endZ: station(3020),
      centerY: 0.068,
      width: 0.025,
      height: 0.045
    },
    frontSight: {
      startZ: station(3972),
      endZ: station(4000),
      centerY: 0.050,
      width: 0.020,
      height: 0.052
    },
    gurttrommel: {
      center: [0.086, -0.087, station(2840)],
      radius: 0.064,
      height: 0.130,
      lidHeight: 0.006,
      handleHeight: 0.040,
      handleRadius: 0.004,
      operatorFacingRotationX: -Math.PI / 2,
      side: 'left',
      capacity: 50,
      sourceClassification: 'historical cross-view addition omitted from the supplied right-side drawing'
    }
  },
  sourcePixels: {
    stock: stockPixels,
    receiver: receiverPixels,
    pistolGrip: pistolGripPixels,
    triggerGuardOuter: triggerGuardOuterPixels,
    triggerGuardInner: triggerGuardInnerPixels,
    feedCover: feedCoverPixels,
    muzzleBooster: muzzleBoosterPixels
  },
  profiles: {
    stock: stockPixels.map(point),
    receiver: receiverPixels.map(point),
    pistolGrip: pistolGripPixels.map(point),
    triggerGuardOuter: triggerGuardOuterPixels.map(point),
    triggerGuardInner: triggerGuardInnerPixels.map(point),
    feedCover: feedCoverPixels.map(point),
    muzzleBooster: muzzleBoosterPixels.map(point)
  },
  classification: {
    overallLength: 'historical nominal dimension retained from the canonical visual spec',
    sideProfiles: 'source-registered pixels from the supplied German sheet',
    widths: 'user-reviewed cross-view renderer correction after the first six-view MG34 pass',
    feed: '50-round Gurttrommel 34 belt container supported by period/manual evidence and museum collection evidence; absent from the supplied right-side drawing',
    jacketHoles: 'source-registered station pattern with renderer-approximated depth',
    muzzleBooster: 'source-profiled stepped collar and tapered booster, revised after user review of the first smooth approximation',
    bipod: 'equal-length folded legs protected by a measured 3D invariant',
    gurttrommelShape: 'Australian War Memorial object REL31200 shape with a user-reviewed 90-degree rotation about weapon X so the lid faces the operator at -Z'
  },
  references: {
    beltDrumMuseum: 'https://www.awm.gov.au/collection/C1011439',
    periodManual: 'https://lonesentry.com/manuals/german-infantry-weapons/mg34-machine-gun.html'
  }
});
