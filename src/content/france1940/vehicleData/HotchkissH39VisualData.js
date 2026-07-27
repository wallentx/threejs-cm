const deepFreeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const H39_DIMENSIONS_METERS = deepFreeze({
  length: 4.22,
  width: 1.85,
  height: 2.15
});

const H39_GEOMETRY = deepFreeze({
  hullRearZ: -2.11,
  hullFrontZ: 2.11,
  hullStations: [
    // z, half-width, underside, crown, upper-side shoulder, crown edge
    { z: -2.11, halfWidth: 0.60, bottomY: 0.58, topY: 0.88, shoulderY: 0.74, topWidthRatio: 0.62 },
    { z: -1.93, halfWidth: 0.76, bottomY: 0.53, topY: 1.04, shoulderY: 0.84, topWidthRatio: 0.68 },
    { z: -1.55, halfWidth: 0.84, bottomY: 0.76, topY: 1.28, shoulderY: 1.01, topWidthRatio: 0.74 },
    { z: -0.88, halfWidth: 0.865, bottomY: 0.81, topY: 1.34, shoulderY: 1.07, topWidthRatio: 0.77 },
    { z: -0.28, halfWidth: 0.87, bottomY: 0.83, topY: 1.38, shoulderY: 1.10, topWidthRatio: 0.76 },
    { z: 0.28, halfWidth: 0.87, bottomY: 0.83, topY: 1.39, shoulderY: 1.11, topWidthRatio: 0.75 },
    { z: 0.74, halfWidth: 0.855, bottomY: 0.81, topY: 1.34, shoulderY: 1.08, topWidthRatio: 0.73 },
    { z: 1.22, halfWidth: 0.82, bottomY: 0.77, topY: 1.24, shoulderY: 1.03, topWidthRatio: 0.69 },
    { z: 1.67, halfWidth: 0.74, bottomY: 0.62, topY: 0.98, shoulderY: 0.83, topWidthRatio: 0.63 },
    { z: 2.00, halfWidth: 0.59, bottomY: 0.53, topY: 0.79, shoulderY: 0.69, topWidthRatio: 0.55 },
    { z: 2.11, halfWidth: 0.45, bottomY: 0.59, topY: 0.70, shoulderY: 0.65, topWidthRatio: 0.50 }
  ],
  runningGear: {
    trackWidth: 0.27,
    trackCenterX: 0.7846,
    trackLength: 3.92,
    trackHeight: 0.78,
    // Includes link and cleat depth so the current detailed tracks touch y=0.
    trackCenterY: 0.4494,
    roadWheelRadius: 0.205,
    roadWheelCentersZ: [-0.94, -0.66, 0.04, 0.32, 1.02, 1.30],
    model: 'legacy-capsule-v1',
    quality:
      'current renderer approximation pending vehicle-owned support-point migration; not blueprint-calibration evidence'
  },
  turret: {
    ringY: 1.38,
    centerZ: 0.28,
    rings: [
      // APX-R casting: broad near-vertical lower wall and a short rounded roof.
      { y: -0.03, radiusX: 0.52, radiusZ: 0.53, centerZ: -0.01 },
      { y: 0.05, radiusX: 0.61, radiusZ: 0.61, centerZ: 0.00 },
      { y: 0.38, radiusX: 0.58, radiusZ: 0.57, centerZ: -0.01 },
      { y: 0.50, radiusX: 0.48, radiusZ: 0.49, centerZ: -0.04 },
      { y: 0.55, radiusX: 0.34, radiusZ: 0.34, centerZ: -0.08 }
    ]
  },
  mainGun: {
    axisLocalY: 0.32,
    axisLocalX: 0.10,
    muzzleLocalZ: 1.74
  }
});

const H39_BLUEPRINT = deepFreeze({
  coordinateFrame: '+Y up, +Z forward, -X vehicle right',
  rigidEnvelopeMeters: H39_DIMENSIONS_METERS,
  sources: [
    {
      title: 'FM 30-42 Military Intelligence: Identification of Foreign Armored Vehicles',
      publisher: 'United States War Department, 1942',
      page: 37,
      url: 'https://www.govinfo.gov/content/pkg/GOVPUB-W-PURL-gpo119422/pdf/GOVPUB-W-PURL-gpo119422.pdf',
      use: 'wartime side, front, and rear identification elevations',
      quality: 'historical orthographic identification drawing; outline detail is low resolution'
    },
    {
      title: 'Hotchkiss H39',
      publisher: 'Musee des Blindes, Saumur',
      url: 'https://museedesblindes.fr/les_chars/hotchkiss-h-39/',
      use: 'surviving cast-hull, APX-R turret, driver hood, fender, and running-gear proportions',
      quality: 'official museum survivor photograph; perspective view'
    },
    {
      title: 'Hotchkiss H35 - Fiche technique',
      publisher: 'Union Nationale de l’Arme Blindee Cavalerie Chars',
      url: 'https://www.unabcc.org/app/download/8279647/Hotchkiss%2BH35%2B-%2BFiche%2Btechnique.pdf',
      use: 'shared Hotchkiss six-wheel three-bogie suspension and 875 mm APX-R turret-ring evidence',
      quality: 'secondary technical sheet; H35 details used only where shared with H39'
    },
    {
      title: 'Char leger H-39',
      publisher: 'War Drawings',
      url: 'https://www.wardrawings.be/WW2/Files/1-Vehicles/Allies/4-France/01-LightTanks/Hotchkiss-H35/Data/H-39.htm',
      use: 'SA 38 L/33 identity and zero barrel-overhang dimension check',
      quality: 'secondary reference compilation; used to reject unsupported gun overprojection'
    }
  ],
  datums: {
    groundLineY: { value: 0, quality: 'exact model contract' },
    hullRearZ: {
      value: H39_GEOMETRY.hullRearZ,
      quality: 'exact envelope endpoint'
    },
    hullFrontZ: {
      value: H39_GEOMETRY.hullFrontZ,
      quality: 'exact envelope endpoint'
    },
    trackCenterY: {
      value: H39_GEOMETRY.runningGear.trackCenterY,
      quality: 'geometry-derived ground-contact approximation'
    },
    roadWheelCentersZ: {
      value: H39_GEOMETRY.runningGear.roadWheelCentersZ,
      quality: 'registered-profile approximation preserving three visibly paired bogies'
    },
    turretRing: {
      value: [
        0,
        H39_GEOMETRY.turret.ringY,
        H39_GEOMETRY.turret.centerZ
      ],
      quality: 'profile-registered center; ring diameter supported by APX-R technical sheet'
    },
    gunAxis: {
      value: [
        H39_GEOMETRY.mainGun.axisLocalX,
        H39_GEOMETRY.turret.ringY + H39_GEOMETRY.mainGun.axisLocalY,
        H39_GEOMETRY.turret.centerZ
      ],
      quality: 'survivor-photo and side-profile approximation'
    }
  },
  outlineLandmarks: [
    'rounded one-piece bow below offset driver hood',
    'three-piece cast hull with raised H39 rear engine casting',
    'six road wheels grouped beneath three horizontal spring bogies',
    'low broad APX-R casting with short roof shoulder and offset rear cupola',
    'SA 38 long-gun identity without extending beyond the 4.22 m rigid hull plan'
  ],
  registrationStatus:
    'URL and provenance only; no accepted pixel-registered raster'
});

/**
 * Family-owned renderer parameters and provenance for the current H39 model.
 *
 * This extraction records the existing metre-space output. The URL-backed
 * sources are not accepted pixel registrations, and the legacy track envelope
 * remains a renderer approximation until a separately reviewed support-point
 * migration.
 */
export const HOTCHKISS_H39_VISUAL_DATA = deepFreeze({
  schemaVersion: 1,
  modelId: 'fr_hotchkiss_h39',
  coordinateFrame: '+Y up, +Z forward, vehicle right -X, metres',
  dimensionsMeters: H39_DIMENSIONS_METERS,
  geometry: H39_GEOMETRY,
  blueprint: H39_BLUEPRINT,
  validation: {
    requiredLodBands: ['high', 'medium', 'core', 'proxy']
  }
});
