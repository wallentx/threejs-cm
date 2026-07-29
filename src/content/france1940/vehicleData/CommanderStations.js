const freezeVector = values => Object.freeze([...values]);

const SOMUA_REFERENCE =
  'https://museedesblindes.fr/les_chars/somua-s35/';
const PANZER_III_FIELD_PHOTO =
  'https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-318-0083-30,_Polen,_Panzer_III_mit_Panzersoldaten.jpg';
const PANZER_III_BLUEPRINT =
  'https://www.the-blueprints.com/blueprints/tanks/ww2-tanks-germany-2/78193/view/sdkfz141_pzkpfwiii_ausfd/';

export const SOMUA_S35_COMMANDER_STATION = Object.freeze({
  vehicleId: 'SOMUA_S35',
  canUnbutton: false,
  cupola: Object.freeze({
    centerTurretLocal: freezeVector([0.02, 0.875, 0]),
    radiusTopMeters: 0.245,
    radiusBottomMeters: 0.30,
    heightMeters: 0.35,
    roofCenterTurretLocal: freezeVector([0.02, 1.045, 0]),
    roofRadiusMeters: 0.225,
    roofThicknessMeters: 0.05,
    dataQuality: [
      'cross-view constrained renderer approximation',
      'original French APX 1 CE cupola was closed and had no top commander hatch'
    ].join('; ')
  }),
  dataQuality: [
    'historical configuration: French-service 1940 SOMUA S35',
    'explicitly unavailable unbuttoned posture',
    'German-service cut-open cupola conversion is outside this vehicle variant'
  ].join('; '),
  referenceUrl: SOMUA_REFERENCE
});

export const PANZER_III_D_COMMANDER_STATION = Object.freeze({
  vehicleId: 'PANZER_III_D',
  canUnbutton: true,
  cupola: Object.freeze({
    centerTurretLocal: freezeVector([0.06, 0.79, -0.22]),
    radiusTopMeters: 0.31,
    radiusBottomMeters: 0.35,
    heightMeters: 0.22,
    dataQuality:
      'cross-view constrained renderer approximation registered to the Panzer III Ausf. D drawing'
  }),
  hatch: Object.freeze({
    id: 'panzer-iii-d-commander-hatch',
    kind: 'TWO_LEAF_CIRCULAR',
    centerTurretLocal: freezeVector([0.06, 0.8975, -0.22]),
    radiusMeters: 0.30,
    thicknessMeters: 0.045,
    splitAxis: 'x',
    hingeAxis: 'z',
    openAngleRadiansBySide: Object.freeze({
      left: -Math.PI * 0.58,
      right: Math.PI * 0.58
    }),
    dataQuality: [
      'variant identity is historical',
      'hinge placement and opening angle are cross-view constrained renderer approximations'
    ].join('; '),
    referenceUrl: PANZER_III_BLUEPRINT
  }),
  exposure: Object.freeze({
    id: 'exposed-commander',
    role: 'COMMANDER',
    center: freezeVector([0, 1.58, 0.12]),
    offset: freezeVector([0.06, 1.10, -0.22]),
    presentationOffset: freezeVector([0, -0.12, 0]),
    halfExtents: freezeVector([0.24, 0.32, 0.20]),
    followsTurret: true,
    headgearId: 'GERMAN_PANZER_PROTECTIVE_BERET_1940',
    capability: Object.freeze({
      id: 'commander-unbuttoned-binoculars',
      rangeMultiplier: 1.55,
      acquisitionTimeMultiplier: 0.56,
      horizontalFovDegrees: 46
    }),
    dataQuality: [
      'role and hatch location are vehicle-specific',
      'exposed hit volume and optical multipliers are gameplay approximations'
    ].join('; '),
    referenceUrl: PANZER_III_FIELD_PHOTO
  }),
  headgear: Object.freeze({
    id: 'GERMAN_PANZER_PROTECTIVE_BERET_1940',
    identity: 'black padded Panzer protective beret',
    dataQuality: [
      'historical 1939-1940 identity',
      'procedural dimensions and material are renderer approximations'
    ].join('; '),
    referenceUrl: PANZER_III_FIELD_PHOTO
  })
});
