const freezeStations = stations => Object.freeze(
  stations.map(station => Object.freeze({ ...station }))
);

const freezeLandmarks = landmarks => Object.freeze(
  landmarks.map(landmark => Object.freeze({
    ...landmark,
    world: Object.freeze([...landmark.world]),
    views: Object.freeze([...landmark.views])
  }))
);

const freezeProfile = profile => Object.freeze({
  ...profile,
  dimensionPolicy: profile.dimensionPolicy
    ?? 'rigid vehicle envelope; excludes weapon projection and flexible aerials',
  dimensionsMeters: Object.freeze({ ...profile.dimensionsMeters }),
  hullStations: freezeStations(profile.hullStations ?? []),
  turretStations: freezeStations(profile.turretStations ?? []),
  calibrationDatums: Object.freeze({ ...(profile.calibrationDatums ?? {}) }),
  calibrationLandmarks: freezeLandmarks(profile.calibrationLandmarks ?? []),
  axleZ: Object.freeze([...(profile.axleZ ?? [])]),
  silhouetteFeatures: Object.freeze([...(profile.silhouetteFeatures ?? [])]),
  references: Object.freeze([...profile.references])
});

export const VEHICLE_VISUAL_PROFILES = Object.freeze({
  fr_somua: freezeProfile({
    designation: 'SOMUA S35',
    dimensionsMeters: { length: 5.38, width: 2.12, height: 2.62 },
    calibrationLandmarks: [
      {
        id: 'road-wheel-rear-center',
        label: 'Rear road-wheel centre',
        world: [0, 0.235, -1.50],
        views: ['side'],
        quality: 'registered illustration inference'
      },
      {
        id: 'road-wheel-front-center',
        label: 'Front road-wheel centre',
        world: [0, 0.235, 1.54],
        views: ['side'],
        quality: 'registered illustration inference'
      },
      {
        id: 'rear-sprocket-center',
        label: 'Rear drive-sprocket centre',
        world: [0, 0.585, -1.99],
        views: ['side'],
        quality: 'registered illustration inference'
      },
      {
        id: 'front-idler-center',
        label: 'Front idler centre',
        world: [0, 0.585, 1.99],
        views: ['side'],
        quality: 'registered illustration inference'
      },
      {
        id: 'turret-ring-center',
        label: 'Turret-ring centre',
        world: [0, 1.55, 0.55],
        views: ['side', 'top'],
        quality: 'registered illustration inference'
      },
      {
        id: 'gun-axis-root',
        label: 'Main-gun axis at mantlet',
        world: [0.04, 2.03, 1.29],
        views: ['side', 'front'],
        quality: 'registered illustration inference'
      },
      {
        id: 'engine-deck-rear',
        label: 'Rear engine-deck line',
        world: [0, 1.60, -2.45],
        views: ['side'],
        quality: 'registered illustration inference'
      }
    ],
    kind: 'tracked',
    hullConstruction: 'cast',
    roadWheelsPerSide: 9,
    silhouetteFeatures: ['rounded cast nose', 'long low engine deck', 'APX 1 CE turret', 'rear-offset cupola'],
    references: [
      'https://www.the-blueprints.com/blueprints/tanks/tanks-s/50770/view/somua_s35/',
      'https://museedesblindes.fr/les_chars/somua-s35/',
      'https://www.govinfo.gov/content/pkg/GOVPUB-W-PURL-gpo119422/pdf/GOVPUB-W-PURL-gpo119422.pdf'
    ],
    dataQuality: 'historical rigid dimensions; user-supplied side elevation registered; front/top cross-checked against a secondary multiview; hidden-side and plan landmarks inferred'
  }),
  fr_renault_r35: freezeProfile({
    designation: 'Renault R35',
    dimensionsMeters: { length: 4.02, width: 1.87, height: 2.13 },
    calibrationLandmarks: [
      {
        id: 'road-wheel-rear-center',
        label: 'Rear road-wheel centre',
        world: [0, 0.245, -1.08],
        views: ['side'],
        quality: 'approximation inferred from registered side raster'
      },
      {
        id: 'road-wheel-front-center',
        label: 'Front road-wheel centre',
        world: [0, 0.245, 1.08],
        views: ['side'],
        quality: 'approximation inferred from registered side raster'
      },
      {
        id: 'turret-ring-center',
        label: 'Turret-ring centre',
        world: [0, 1.35, -0.23],
        views: ['side', 'top'],
        quality: 'registered against the user-supplied side and top elevations'
      },
      {
        id: 'gun-axis-root',
        label: 'Main-gun axis at mantlet',
        world: [-0.16, 1.70, 0.305],
        views: ['side', 'front'],
        quality: 'registered against the user-supplied side and front elevations'
      },
      {
        id: 'upper-track-run',
        label: 'Upper track run',
        world: [0, 1.10, 0],
        views: ['side'],
        quality: 'approximation inferred from registered side raster'
      }
    ],
    kind: 'tracked',
    hullConstruction: 'cast',
    roadWheelsPerSide: 5,
    silhouetteFeatures: ['short rounded cast hull', 'high track run', 'tail-less rear hull', 'APX-R turret'],
    references: [
      'https://www.the-blueprints.com/blueprints/tanks/tanks-r/50737/view/renault_r35/'
    ],
    dataQuality: 'historical tail-less dimensions; side, front, and top registered from a user-supplied secondary four-elevation drawing; hidden casting radii inferred between views'
  }),
  fr_hotchkiss_h39: freezeProfile({
    designation: 'Hotchkiss H39',
    dimensionsMeters: { length: 4.22, width: 1.85, height: 2.15 },
    calibrationLandmarks: [
      {
        id: 'road-wheel-rear-center',
        label: 'Rear paired-bogie wheel centre',
        world: [0, 0.205, -0.94],
        views: ['side'],
        quality: 'registered-profile approximation'
      },
      {
        id: 'road-wheel-front-center',
        label: 'Front paired-bogie wheel centre',
        world: [0, 0.205, 1.30],
        views: ['side'],
        quality: 'registered-profile approximation'
      },
      {
        id: 'turret-ring-center',
        label: 'APX-R turret-ring centre',
        world: [0, 1.38, 0.28],
        views: ['side', 'top'],
        quality: 'profile-registered; ring diameter supported by technical sheet'
      },
      {
        id: 'gun-axis-root',
        label: 'SA 38 gun axis',
        world: [0.10, 1.70, 0.84],
        views: ['side', 'front'],
        quality: 'survivor-photo and side-profile approximation'
      },
      {
        id: 'upper-track-run',
        label: 'Upper track run',
        world: [0, 0.8394, 0],
        views: ['side'],
        quality: 'geometry-derived ground-contact approximation'
      }
    ],
    kind: 'tracked',
    hullConstruction: 'cast',
    roadWheelsPerSide: 6,
    silhouetteFeatures: ['three cast hull sections', 'horizontal suspension bogies', 'raised rear engine deck', 'APX-R turret'],
    references: [
      'https://www.govinfo.gov/content/pkg/GOVPUB-W-PURL-gpo119422/pdf/GOVPUB-W-PURL-gpo119422.pdf',
      'https://museedesblindes.fr/les_chars/hotchkiss-h-39/',
      'https://www.unabcc.org/app/download/8279647/Hotchkiss%2BH35%2B-%2BFiche%2Btechnique.pdf',
      'https://tanks-encyclopedia.com/ww2/france/hotchkiss-h35-h39.php'
    ],
    dataQuality: 'historical dimensions; low-resolution wartime elevations plus survivor-photo fit; H39 front/top partly inferred'
  }),
  fr_amc35: freezeProfile({
    designation: 'AMC 35 (ACG-1)',
    dimensionsMeters: { length: 4.55, width: 2.24, height: 2.30 },
    calibrationLandmarks: [
      {
        id: 'rear-idler-center',
        label: 'Rear idler centre',
        world: [0, 0.58, -1.72],
        views: ['side'],
        quality: 'registered scale-drawing inference'
      },
      {
        id: 'front-sprocket-center',
        label: 'Front sprocket centre',
        world: [0, 0.66, 1.77],
        views: ['side'],
        quality: 'registered scale-drawing inference'
      },
      {
        id: 'road-wheel-rear-center',
        label: 'Rear road-wheel centre',
        world: [0, 0.31, -1.35],
        views: ['side'],
        quality: 'registered scale-drawing inference'
      },
      {
        id: 'road-wheel-front-center',
        label: 'Front road-wheel centre',
        world: [0, 0.31, 1.15],
        views: ['side'],
        quality: 'registered scale-drawing inference'
      },
      {
        id: 'turret-ring-center',
        label: 'APX 2 turret-ring centre',
        world: [0, 1.60, -0.10],
        views: ['side', 'top'],
        quality: 'registered scale-drawing inference'
      },
      {
        id: 'gun-axis-root',
        label: '47 mm SA 35 gun axis',
        world: [-0.10, 1.86, 0.65],
        views: ['side', 'front'],
        quality: 'registered scale-drawing inference'
      }
    ],
    kind: 'tracked',
    hullConstruction: 'riveted',
    roadWheelsPerSide: 5,
    silhouetteFeatures: ['low riveted cavalry hull', 'sloped glacis', 'rear engine deck', 'wide APX 2 turret'],
    references: [
      'https://commons.wikimedia.org/wiki/File:Renault_Type_ACG_1%2C_AMC_35_-_Mick_Bell.png',
      'https://museedesblindes.fr/les_chars/amc-35/'
    ],
    dataQuality: 'historical envelope; registered CC BY 4.0 scale drawing; museum-confirmed armament and crew'
  }),
  fr_panhard178: freezeProfile({
    designation: 'Panhard 178 (AMD 35)',
    dimensionsMeters: { length: 4.79, width: 2.01, height: 2.31 },
    calibrationLandmarks: [
      {
        id: 'rear-axle-center',
        label: 'Rear axle centre',
        world: [0, 0.5335, -1.56],
        views: ['side', 'top'],
        quality: 'published 3.12 m wheelbase'
      },
      {
        id: 'front-axle-center',
        label: 'Front axle centre',
        world: [0, 0.5335, 1.56],
        views: ['side', 'top'],
        quality: 'published 3.12 m wheelbase'
      },
      {
        id: 'left-wheel-center',
        label: 'Left wheel centre / tread',
        world: [0.8685, 0.5335, 0],
        views: ['front'],
        quality: 'published 1.737 m wheel tread and 42-inch tire'
      },
      {
        id: 'right-wheel-center',
        label: 'Right wheel centre / tread',
        world: [-0.8685, 0.5335, 0],
        views: ['front'],
        quality: 'published 1.737 m wheel tread and 42-inch tire'
      },
      {
        id: 'turret-ring-center',
        label: 'APX 3 turret-ring centre',
        world: [0, 1.65, 0.24],
        views: ['side', 'top'],
        quality: 'orthographic-contour inference'
      },
      {
        id: 'gun-axis-root',
        label: '25 mm SA 35 gun axis',
        world: [0.10, 1.92, 1.00],
        views: ['side', 'front'],
        quality: 'orthographic-contour inference'
      }
    ],
    kind: 'armoredCar',
    hullConstruction: 'riveted',
    roadWheelsPerSide: 2,
    silhouetteFeatures: ['low four-wheel hull', 'sloped front and rear', 'rear driving position', 'APX 3 turret'],
    references: [
      'https://warwheels.net/images/Panhard178datasheet.pdf',
      'https://www.the-blueprints.com/blueprints/tanks/tanks-n-p/79810/view/panhard_178_amd_35/',
      'https://imagesdefense.gouv.fr/fr/plan-moyen-de-face-d-une-amd-panhard-178-qui-vient-de-franchir-la-riviere-meuse-en-crue.html'
    ],
    dataQuality: 'historical published data-sheet envelope/running gear; registered side contour; front/top qualitative'
  }),
  fr_laffly_s20tl: freezeProfile({
    designation: 'Laffly S20TL',
    dimensionsMeters: { length: 5.35, width: 2.00, height: 2.00 },
    calibrationLandmarks: [
      {
        id: 'front-axle-center',
        label: 'Front axle centre',
        world: [0, 0.46, 1.55],
        views: ['side', 'top'],
        quality: 'registered 1/76 drawing measurement'
      },
      {
        id: 'middle-axle-center',
        label: 'Middle axle centre',
        world: [0, 0.46, -0.82],
        views: ['side', 'top'],
        quality: 'registered 1/76 drawing measurement'
      },
      {
        id: 'rear-axle-center',
        label: 'Rear axle centre',
        world: [0, 0.46, -1.78],
        views: ['side', 'top'],
        quality: 'registered 1/76 drawing measurement'
      },
      {
        id: 'front-roller-center',
        label: 'Front undulation-roller centre',
        world: [0, 0.22, 2.43],
        views: ['side'],
        quality: 'registered 1/76 drawing measurement'
      },
      {
        id: 'belly-roller-center',
        label: 'Belly undulation-roller centre',
        world: [0, 0.18, 0.36],
        views: ['side'],
        quality: 'registered 1/76 drawing measurement'
      },
      {
        id: 'bonnet-rear-break',
        label: 'Bonnet / cab break',
        world: [0, 1.67, 1.36],
        views: ['side', 'top'],
        quality: 'registered 1/76 drawing measurement'
      },
      {
        id: 'windshield-top',
        label: 'Split-windshield top',
        world: [0, 2.00, 1.38],
        views: ['side', 'front'],
        quality: 'registered drawing; exact height envelope'
      }
    ],
    axleZ: [1.55, -0.82, -1.78],
    wheelRadius: 0.46,
    silhouetteFeatures: ['long bonnet', 'three driven axles', 'front undulation rollers', 'open ten-man troop body'],
    references: [
      'https://commons.wikimedia.org/wiki/File:Laffly_S_20_TL,_Voiture_de_Dragons_Port%C3%A9s,_6%C3%976,_Mechanised_Infantry_-_Mick_Bell.png',
      'https://imagesdefense.gouv.fr/fr/vehicule-tactique-france-1939-1940-laffly-s-20-tl.html',
      'https://commons.wikimedia.org/wiki/File:Laffly_S20TL_(France,_1937)_(4632233751).jpg'
    ],
    dataQuality: 'historical uncovered envelope; registered CC BY 4.0 multi-view drawing; archival and museum photo cross-check'
  }),
  fr_char_b1bis: freezeProfile({
    designation: 'Char B1 bis',
    dimensionsMeters: { length: 6.37, width: 2.46, height: 2.79 },
    calibrationLandmarks: [
      {
        id: 'road-wheel-rear-center',
        label: 'Rear road-wheel centre',
        world: [0, 0.40, -2.25],
        views: ['side'],
        quality: 'orthographic registration approximation'
      },
      {
        id: 'road-wheel-front-center',
        label: 'Front road-wheel centre',
        world: [0, 0.40, 2.25],
        views: ['side'],
        quality: 'orthographic registration approximation'
      },
      {
        id: 'upper-track-run',
        label: 'Upper full-height track run',
        world: [0, 1.525, 0],
        views: ['side'],
        quality: 'geometry-derived from registered wraparound track'
      },
      {
        id: 'turret-ring-center',
        label: 'APX 4 turret-ring centre',
        world: [0, 1.88, 0.95],
        views: ['side', 'top'],
        quality: 'multi-view registration approximation'
      },
      {
        id: 'turret-gun-axis',
        label: '47 mm turret-gun axis',
        world: [0, 2.22, 0.95],
        views: ['side', 'front'],
        quality: 'multi-view registration approximation'
      },
      {
        id: 'hull-gun-axis',
        label: 'Right-side 75 mm hull-gun axis',
        world: [-0.47, 1.31, 2.88],
        views: ['side', 'front'],
        quality: 'historical side; precise centre inferred from front elevation'
      },
      {
        id: 'driver-hood-center',
        label: 'Left-side driver hood',
        world: [0.43, 1.48, 2.30],
        views: ['front', 'top'],
        quality: 'official photograph and multi-view registration'
      }
    ],
    kind: 'tracked',
    hullConstruction: 'cast-and-bolted',
    roadWheelsPerSide: 16,
    silhouetteFeatures: ['full-height track runs', 'right hull 75 mm', 'tall central hull', 'small APX 4 turret'],
    references: [
      'https://www.cheminsdememoire.gouv.fr/sites/default/files/2019-06/char%20B1%20bis.pdf',
      'https://onwar.com/wwii/tanks/france/fr001b1bisp.html',
      'https://imagesdefense.gouv.fr/fr/plan-general-de-trois-quarts-avant-du-char-b1-bis-numero-738-qui-sort-de-l-usine-fcm-de-toulon.html'
    ],
    dataQuality: 'official historical envelope; registered secondary four-view; official 1940 photo cross-check'
  }),
  ger_panzer3: freezeProfile({
    designation: 'Panzerkampfwagen III Ausf. D',
    dimensionsMeters: { length: 5.38, width: 2.91, height: 2.50 },
    calibrationLandmarks: [
      {
        id: 'rear-idler-center',
        label: 'Rear idler centre',
        world: [0, 0.575, -2.33],
        views: ['side'],
        quality: 'registered orthographic drawing inference'
      },
      {
        id: 'front-sprocket-center',
        label: 'Front drive-sprocket centre',
        world: [0, 0.575, 1.94],
        views: ['side'],
        quality: 'registered orthographic drawing inference'
      },
      {
        id: 'road-wheel-rear-center',
        label: 'Rear road-wheel centre',
        world: [0, 0.255, -1.62],
        views: ['side'],
        quality: 'registered orthographic drawing inference'
      },
      {
        id: 'road-wheel-front-center',
        label: 'Front road-wheel centre',
        world: [0, 0.255, 1.08],
        views: ['side'],
        quality: 'registered orthographic drawing inference'
      },
      {
        id: 'turret-ring-center',
        label: 'Turret-ring centre',
        world: [0, 1.58, 0.12],
        views: ['side', 'front', 'top'],
        quality: 'registered side and top drawing inference'
      },
      {
        id: 'gun-axis-root',
        label: '3.7 cm gun axis at mantlet',
        world: [0, 1.90, 1.05],
        views: ['side', 'front'],
        quality: 'registered side and front drawing inference'
      }
    ],
    kind: 'tracked',
    hullConstruction: 'welded',
    roadWheelsPerSide: 8,
    silhouetteFeatures: ['eight small road wheels', 'stepped superstructure', 'three-man turret', 'rear engine deck'],
    references: [
      'https://www.the-blueprints.com/blueprints/tanks/ww2-tanks-germany-2/78193/view/sdkfz141_pzkpfwiii_ausfd/',
      'https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-318-0083-30,_Polen,_Panzer_III_mit_Panzersoldaten.jpg',
      'https://de.wikipedia.org/wiki/Panzerkampfwagen_III'
    ],
    dataQuality: 'historical variant identity; registered secondary side/front/top drawing; repository rigid envelope conflicts with published Ausf. A-D dimensions and remains explicitly labeled'
  }),
  ger_panzer2: freezeProfile({
    designation: 'Panzerkampfwagen II Ausf. C',
    dimensionsMeters: { length: 4.81, width: 2.22, height: 1.99 },
    calibrationLandmarks: [
      {
        id: 'rear-idler-center',
        label: 'Rear idler centre',
        world: [0, 0.63, -1.84],
        views: ['side'],
        quality: 'profile-derived approximation'
      },
      {
        id: 'front-sprocket-center',
        label: 'Front drive-sprocket centre',
        world: [0, 0.63, 1.93],
        views: ['side'],
        quality: 'profile-derived approximation'
      },
      {
        id: 'road-wheel-rear-center',
        label: 'Rear road-wheel centre',
        world: [0, 0.35, -1.15],
        views: ['side'],
        quality: 'registered profile approximation to nearest centimetre'
      },
      {
        id: 'road-wheel-front-center',
        label: 'Front road-wheel centre',
        world: [0, 0.35, 1.25],
        views: ['side'],
        quality: 'registered profile approximation to nearest centimetre'
      },
      {
        id: 'turret-ring-center',
        label: 'Left-offset turret-ring centre',
        world: [0.17, 1.43, 0.25],
        views: ['side', 'front', 'top'],
        quality: 'side registered; lateral offset photograph-informed'
      },
      {
        id: 'gun-axis-root',
        label: '2 cm gun axis at mantlet',
        world: [0.17, 1.68, 0.97],
        views: ['side', 'front'],
        quality: 'registered profile approximation'
      }
    ],
    kind: 'tracked',
    hullConstruction: 'welded',
    roadWheelsPerSide: 5,
    silhouetteFeatures: ['five large road wheels', 'stepped glacis', 'left-offset turret', 'low commander hatch'],
    references: [
      'https://www.the-blueprints.com/blueprints/tanks/ww2-tanks-germany-2/81805/view/sd_kfz_121_pzkpfwii_ausfc/',
      'https://commons.wikimedia.org/wiki/File:Panzer_II_c.svg'
    ],
    dataQuality: 'historical dimensions; registered Ausf. C side elevation; front/top contours photograph-informed'
  }),
  ger_panzer35t: freezeProfile({
    designation: 'Panzerkampfwagen 35(t)',
    dimensionsMeters: { length: 4.90, width: 2.06, height: 2.37 },
    calibrationLandmarks: [
      {
        id: 'road-wheel-rear-center',
        label: 'Rear road-wheel centre',
        world: [0, 0.31, -1.65],
        views: ['side'],
        quality: 'inferred from registered Bradford side elevation'
      },
      {
        id: 'road-wheel-front-center',
        label: 'Front road-wheel centre',
        world: [0, 0.31, 1.46],
        views: ['side'],
        quality: 'inferred from registered Bradford side elevation'
      },
      {
        id: 'turret-ring-center',
        label: 'Turret-ring centre',
        world: [0, 1.53, 0.18],
        views: ['side', 'top'],
        quality: 'registered scale-drawing inference; 1.267 m published ring diameter'
      },
      {
        id: 'gun-axis-root',
        label: '3.7 cm gun axis at mantlet',
        world: [0.10, 1.82, 1.00],
        views: ['side', 'front'],
        quality: 'registered scale-drawing inference'
      }
    ],
    kind: 'tracked',
    hullConstruction: 'riveted',
    roadWheelsPerSide: 8,
    silhouetteFeatures: ['four twin-wheel bogies', 'narrow riveted hull', 'forward turret', 'prominent rear deck'],
    references: [
      'https://www.onwar.com/wwii/tanks/germany/ge049pz35p.html',
      'https://modelist-konstruktor.com/bronekollekcziya/tank-firmy-shkoda'
    ],
    dataQuality: 'historical dimensions; registered published four-view scale drawing; mechanical centers partly inferred'
  }),
  ger_panzer38t: freezeProfile({
    designation: 'Panzerkampfwagen 38(t)',
    dimensionsMeters: { length: 4.61, width: 2.14, height: 2.25 },
    calibrationLandmarks: [
      {
        id: 'road-wheel-rear-center',
        label: 'Rear road-wheel centre',
        world: [0, 0.43, -1.23],
        views: ['side'],
        quality: 'registered side-elevation approximation'
      },
      {
        id: 'road-wheel-front-center',
        label: 'Front road-wheel centre',
        world: [0, 0.43, 1.23],
        views: ['side'],
        quality: 'registered side-elevation approximation'
      },
      {
        id: 'left-track-center',
        label: 'Left track centre',
        world: [0.912, 0.43, 0],
        views: ['front'],
        quality: 'published 293 mm track width and registered front envelope'
      },
      {
        id: 'turret-ring-center',
        label: 'Turret-ring centre',
        world: [0, 1.49, 0.36],
        views: ['side', 'top'],
        quality: 'registered side/top outline approximation'
      },
      {
        id: 'gun-axis-root',
        label: '3.7 cm gun axis at mantlet',
        world: [0.07, 1.71, 0.97],
        views: ['side', 'front'],
        quality: 'published 1.71 m firing height; other coordinates registered'
      }
    ],
    kind: 'tracked',
    hullConstruction: 'riveted',
    roadWheelsPerSide: 4,
    silhouetteFeatures: ['four large road wheels', 'sharply stepped glacis', 'forward turret', 'flat rear engine deck'],
    references: [
      'https://drawingdatabase.com/wp-content/uploads/2015/07/panzerkampfwagen-38t-ausf-e-f-g.png',
      'https://vhu.cz/exhibit/ceskoslovensky-tank-lt-vz-38-na-snimcich-z-konce-60-let/',
      'https://panzerworld.com/pz-kpfw-38-t'
    ],
    dataQuality: 'historical dimensions; registered secondary multi-view drawing; official museum survivor corroboration; top landmarks partly inferred'
  }),
  ger_sdkfz231: freezeProfile({
    designation: 'Sd.Kfz. 231 (6-Rad)',
    dimensionsMeters: { length: 5.57, width: 1.82, height: 2.25 },
    calibrationLandmarks: [
      {
        id: 'front-axle-center',
        label: 'Single front-axle centre',
        world: [0, 0.43, 1.86],
        views: ['side', 'top'],
        quality: 'registered side-sheet inference to nearest centimetre'
      },
      {
        id: 'middle-axle-center',
        label: 'Middle tandem-axle centre',
        world: [0, 0.43, -0.65],
        views: ['side', 'top'],
        quality: 'registered side-sheet inference to nearest centimetre'
      },
      {
        id: 'rear-axle-center',
        label: 'Rear tandem-axle centre',
        world: [0, 0.43, -1.59],
        views: ['side', 'top'],
        quality: 'registered side-sheet inference to nearest centimetre'
      },
      {
        id: 'turret-ring-center',
        label: 'Horseshoe turret-ring centre',
        world: [0, 1.72, -0.70],
        views: ['side', 'top'],
        quality: 'registered side/top inference'
      },
      {
        id: 'gun-axis-root',
        label: '2 cm gun axis at mantlet',
        world: [0, 1.90, 0.08],
        views: ['side', 'front'],
        quality: 'registered side/front inference'
      }
    ],
    axleZ: [1.86, -0.65, -1.59],
    silhouetteFeatures: ['truck-derived armored bonnet', 'single front and tandem rear axles', 'rear fighting body', 'six-sided turret'],
    references: [
      'https://commons.wikimedia.org/wiki/File:Sdkfz231(6-Rad)-plan.gif',
      'https://www.military-references.com/wp-content/uploads/books/apc/germany/sd-kfz-231-232/Schwerer_Panzerspahwagen_Sd_Kfz_231-232_D_640_1935.pdf',
      'https://www.panzernet.net/domains/panzernet.net/panzernet/en/auta/2316.php'
    ],
    dataQuality: 'historical published envelope; registered CC BY-SA multiview scale drawing; period D 640 manual corroboration; rear breadth conflict recorded'
  }),
  ger_opel_blitz: freezeProfile({
    designation: 'Opel Blitz 3.6-36S',
    dimensionsMeters: { length: 6.02, width: 2.27, height: 2.59 },
    calibrationLandmarks: [
      {
        id: 'front-axle-center',
        label: 'Front axle centre',
        world: [0, 0.444, 2.19],
        views: ['side', 'top'],
        quality: 'registered to exact 3.60 m historical wheelbase'
      },
      {
        id: 'rear-axle-center',
        label: 'Twin rear-axle centre',
        world: [0, 0.444, -1.41],
        views: ['side', 'top'],
        quality: 'registered to exact 3.60 m historical wheelbase'
      },
      {
        id: 'left-front-track-center',
        label: 'Left front-tire track centre',
        world: [0.771, 0.444, 2.19],
        views: ['front', 'top'],
        quality: 'historical 1.542 m front track'
      },
      {
        id: 'left-rear-track-center',
        label: 'Left rear dual-tire track centre',
        world: [0.81, 0.444, -1.41],
        views: ['front', 'top'],
        quality: 'historical 1.620 m rear track'
      },
      {
        id: 'canvas-crown',
        label: 'Canvas roof crown',
        world: [0, 2.59, -1.15],
        views: ['side', 'front'],
        quality: 'registered drawing; exact overall-height envelope'
      }
    ],
    kind: 'truck',
    hullConstruction: 'cab-and-bed',
    roadWheelsPerSide: 2,
    silhouetteFeatures: ['long bonnet', 'rounded cab roof', 'single rear axle with dual tires', 'canvas cargo bed'],
    references: [
      'https://historisk-opelklub.dk/wp-content/uploads/2012/06/Opel-Data-Leif__LKW_1899-1996.pdf',
      'https://www.the-blueprints.com/blueprints/trucks/opel/43128/view/opel_blitz_36s_3-ton_kfz305/'
    ],
    dataQuality: 'historical Opel dimensions, wheelbase, tracks, bed, and tire data; registered published four-view drawing'
  }),
  ger_panzer4: freezeProfile({
    designation: 'Panzerkampfwagen IV Ausf. D',
    dimensionsMeters: { length: 5.92, width: 2.84, height: 2.68 },
    calibrationLandmarks: [
      {
        id: 'rear-idler-center',
        label: 'Rear idler centre',
        world: [0, 0.50, -2.42],
        views: ['side'],
        quality: 'registered multi-view approximation'
      },
      {
        id: 'front-sprocket-center',
        label: 'Front drive-sprocket centre',
        world: [0, 0.50, 2.45],
        views: ['side'],
        quality: 'registered multi-view approximation'
      },
      {
        id: 'road-wheel-rear-center',
        label: 'Rear road-wheel centre',
        world: [0, 0.25, -1.62],
        views: ['side'],
        quality: 'registered multi-view approximation'
      },
      {
        id: 'road-wheel-front-center',
        label: 'Front road-wheel centre',
        world: [0, 0.25, 1.90],
        views: ['side'],
        quality: 'registered multi-view approximation'
      },
      {
        id: 'turret-ring-center',
        label: 'Turret-ring centre',
        world: [0, 1.70, -0.12],
        views: ['side', 'top'],
        quality: 'registered multi-view approximation'
      },
      {
        id: 'gun-axis-root',
        label: '7.5 cm KwK 37 axis at mantlet',
        world: [0.06, 2.00, 0.88],
        views: ['side', 'front'],
        quality: 'registered multi-view approximation'
      }
    ],
    kind: 'tracked',
    hullConstruction: 'welded',
    roadWheelsPerSide: 8,
    silhouetteFeatures: ['eight paired road wheels', 'stepped front plate', 'large central turret', 'short KwK 37'],
    references: [
      'https://www.the-blueprints.com/blueprints/tanks/ww2-tanks-germany-2/78204/view/sdkfz161_pzkpfwiv_ausfd/',
      'https://tankmuseum.org/tank-nuts/tank-collection/panzer-iv/',
      'https://www.bild.bundesarchiv.de/dba/en/search/?query=Bild+146-1981-070-15'
    ],
    dataQuality: 'historical dimensions; registered secondary Ausf. D multi-view drawing; museum and primary archival photo corroboration'
  })
});

export function getVehicleVisualProfile(modelId) {
  const profile = VEHICLE_VISUAL_PROFILES[modelId];
  if (!profile) throw new Error(`Unknown vehicle visual profile: ${modelId}`);
  return profile;
}
