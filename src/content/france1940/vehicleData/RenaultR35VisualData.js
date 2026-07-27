const freezeObjectArray = values => Object.freeze(
  values.map(value => Object.freeze({ ...value }))
);

const freezeView = view => Object.freeze({
  ...view,
  cropPixels: Object.freeze({ ...view.cropPixels }),
  landmarkPixels: Object.freeze(Object.fromEntries(
    Object.entries(view.landmarkPixels).map(([id, point]) => [
      id,
      Object.freeze([...point])
    ])
  ))
});

/**
 * Canonical renderer-owned data for the represented tail-less Renault R35.
 *
 * Geometry values are authored in metres from the registered orthographic
 * sheet. Pixel registrations retain the source-space evidence separately from
 * the emitted mesh, so calibration compares the model to the drawing rather
 * than to a previous model capture.
 */
export const RENAULT_R35_VISUAL_DATA = Object.freeze({
  schemaVersion: 1,
  modelId: 'fr_renault_r35',
  coordinateFrame: '+Y up, +Z forward, vehicle right -X, metres',
  dimensionsMeters: Object.freeze({
    length: 4.02,
    width: 1.87,
    height: 2.13
  }),
  blueprint: Object.freeze({
    id: 'france1940.blueprint.vehicle.fr_renault_r35.multiview',
    imageUrl: '/assets/blueprints/france1940/renault-r-35-2.png',
    originalFileName: 'renault-r-35-2.png',
    sourcePageUrl:
      'https://www.the-blueprints.com/blueprints/tanks/tanks-r/50737/view/renault_r35/',
    sha256: '11ef1ab07dcfc0672016c5ebad845894c5750d056c682419fb5177b033ba8df5',
    imagePixels: Object.freeze({ width: 4351, height: 3096 }),
    provenance:
      'user-supplied four-elevation line drawing; source pixels registered independently per view',
    limitations:
      'secondary drawing rather than a factory drawing; hidden casting radii remain inferred between visible elevations',
    views: Object.freeze({
      side: freezeView({
        cropPixels: { x: 20, y: 65, width: 2640, height: 1435 },
        rotationDegrees: 0,
        mirrorX: false,
        landmarkPixels: {
          'rigid-front': [52, 1474],
          'rigid-rear': [2608, 1474],
          'ground-origin': [1330, 1474],
          'vehicle-top': [1330, 85],
          'turret-ring-center': [1472, 535],
          'gun-axis-root': [1152, 390]
        }
      }),
      top: freezeView({
        cropPixels: { x: 48, y: 1715, width: 2645, height: 1365 },
        rotationDegrees: -90,
        mirrorX: false,
        landmarkPixels: {
          'rigid-front': [52, 2398],
          'rigid-rear': [2690, 2398],
          'vehicle-left': [1371, 3055],
          'vehicle-right': [1371, 1742],
          'turret-ring-center': [1540, 2398]
        }
      }),
      front: freezeView({
        cropPixels: { x: 2660, y: 45, width: 1500, height: 1435 },
        rotationDegrees: 0,
        mirrorX: false,
        landmarkPixels: {
          'vehicle-left': [4035, 1460],
          'vehicle-right': [2788, 1460],
          'ground-origin': [3412, 1460],
          'vehicle-top': [3412, 76],
          'gun-axis-root': [3190, 380]
        }
      })
    })
  }),
  geometry: Object.freeze({
    hullStations: freezeObjectArray([
      {
        z: -1.74, bottomHalfWidth: 0.50, bottomY: 0.40,
        lowerHalfWidth: 0.65, lowerY: 0.56,
        halfWidth: 0.72, shoulderY: 0.96,
        upperHalfWidth: 0.67, upperY: 1.18,
        deckHalfWidth: 0.57, deckY: 1.31
      },
      {
        z: -1.30, bottomHalfWidth: 0.58, bottomY: 0.37,
        lowerHalfWidth: 0.69, lowerY: 0.53,
        halfWidth: 0.75, shoulderY: 0.98,
        upperHalfWidth: 0.70, upperY: 1.20,
        deckHalfWidth: 0.63, deckY: 1.34
      },
      {
        z: -0.74, bottomHalfWidth: 0.62, bottomY: 0.35,
        lowerHalfWidth: 0.71, lowerY: 0.51,
        halfWidth: 0.76, shoulderY: 0.99,
        upperHalfWidth: 0.71, upperY: 1.21,
        deckHalfWidth: 0.65, deckY: 1.35
      },
      {
        z: -0.18, bottomHalfWidth: 0.64, bottomY: 0.34,
        lowerHalfWidth: 0.73, lowerY: 0.50,
        halfWidth: 0.76, shoulderY: 1.00,
        upperHalfWidth: 0.71, upperY: 1.21,
        deckHalfWidth: 0.65, deckY: 1.35
      },
      {
        z: 0.38, bottomHalfWidth: 0.64, bottomY: 0.34,
        lowerHalfWidth: 0.73, lowerY: 0.50,
        halfWidth: 0.76, shoulderY: 0.99,
        upperHalfWidth: 0.70, upperY: 1.20,
        deckHalfWidth: 0.64, deckY: 1.34
      },
      {
        z: 0.88, bottomHalfWidth: 0.61, bottomY: 0.35,
        lowerHalfWidth: 0.71, lowerY: 0.50,
        halfWidth: 0.75, shoulderY: 0.96,
        upperHalfWidth: 0.68, upperY: 1.15,
        deckHalfWidth: 0.61, deckY: 1.29
      },
      {
        z: 1.28, bottomHalfWidth: 0.55, bottomY: 0.34,
        lowerHalfWidth: 0.67, lowerY: 0.47,
        halfWidth: 0.72, shoulderY: 0.88,
        upperHalfWidth: 0.64, upperY: 1.04,
        deckHalfWidth: 0.54, deckY: 1.17
      },
      {
        z: 1.58, bottomHalfWidth: 0.45, bottomY: 0.30,
        lowerHalfWidth: 0.61, lowerY: 0.40,
        halfWidth: 0.69, shoulderY: 0.72,
        upperHalfWidth: 0.59, upperY: 0.88,
        deckHalfWidth: 0.47, deckY: 0.99
      },
      {
        z: 1.78, bottomHalfWidth: 0.38, bottomY: 0.31,
        lowerHalfWidth: 0.57, lowerY: 0.39,
        halfWidth: 0.67, shoulderY: 0.60,
        upperHalfWidth: 0.55, upperY: 0.76,
        deckHalfWidth: 0.40, deckY: 0.86
      },
      {
        z: 1.93, bottomHalfWidth: 0.31, bottomY: 0.39,
        lowerHalfWidth: 0.51, lowerY: 0.44,
        halfWidth: 0.64, shoulderY: 0.55,
        upperHalfWidth: 0.49, upperY: 0.66,
        deckHalfWidth: 0.31, deckY: 0.72
      },
      {
        z: 2.01, bottomHalfWidth: 0.23, bottomY: 0.51,
        lowerHalfWidth: 0.43, lowerY: 0.53,
        halfWidth: 0.61, shoulderY: 0.55,
        upperHalfWidth: 0.43, upperY: 0.58,
        deckHalfWidth: 0.23, deckY: 0.61
      }
    ]),
    proxyHullStationIndices: Object.freeze([0, 3, 6, 8, 10]),
    turret: Object.freeze({
      centerZ: -0.23,
      deckY: 1.35,
      sections: freezeObjectArray([
        {
          y: 0.00, halfWidth: 0.50, frontLength: 0.54,
          rearLength: 0.72, centerZ: 0.00
        },
        {
          y: 0.07, halfWidth: 0.56, frontLength: 0.56,
          rearLength: 0.70, centerZ: 0.00
        },
        {
          y: 0.24, halfWidth: 0.53, frontLength: 0.53,
          rearLength: 0.66, centerZ: -0.01
        },
        {
          y: 0.44, halfWidth: 0.47, frontLength: 0.47,
          rearLength: 0.56, centerZ: -0.03
        },
        {
          y: 0.62, halfWidth: 0.38, frontLength: 0.38,
          rearLength: 0.43, centerZ: -0.05
        }
      ]),
      mantlet: Object.freeze({
        kind: 'asymmetric-cast-shield-with-cylindrical-collars',
        frontZ: 0.535,
        depth: 0.075,
        outline: Object.freeze([
          Object.freeze([-0.42, 0.10]),
          Object.freeze([0.34, 0.10]),
          Object.freeze([0.40, 0.16]),
          Object.freeze([0.40, 0.43]),
          Object.freeze([0.33, 0.50]),
          Object.freeze([-0.32, 0.50]),
          Object.freeze([-0.42, 0.41])
        ]),
        mainCollar: Object.freeze({
          x: -0.16, y: 0.35, radius: 0.135, depth: 0.105
        }),
        lowerCover: Object.freeze({
          x: -0.16, y: 0.17, radius: 0.145, depth: 0.055
        }),
        coaxCollar: Object.freeze({
          x: 0.20, y: 0.29, radius: 0.072, depth: 0.095
        })
      }),
      cupola: Object.freeze({
        kind: 'shallow-cast-dome',
        centerX: -0.04,
        baseY: 0.61,
        centerZ: -0.10,
        radius: 0.245,
        height: 0.17
      }),
      hatch: Object.freeze({
        centerX: -0.04,
        centerY: 0.7675,
        centerZ: -0.08,
        radius: 0.105,
        height: 0.025
      })
    }),
    driverVisor: Object.freeze({
      side: 'left',
      center: Object.freeze([0.23, 1.365, 0.69]),
      size: Object.freeze([0.24, 0.035, 0.026]),
      slopeRadians: -1.02
    }),
    mainGun: Object.freeze({
      side: 'right',
      x: -0.16,
      y: 0.35,
      barrelLength: 0.40,
      muzzleZ: 0.95
    }),
    coax: Object.freeze({
      side: 'left',
      x: 0.20,
      y: 0.29,
      barrelLength: 0.48,
      muzzleZ: 0.80
    }),
    runningGear: Object.freeze({
      trackWidth: 0.29,
      trackCenterX: 0.7842,
      trackLength: 3.89,
      trackHeight: 0.9724,
      trackCenterY: 0.55,
      roadWheelCentersZ: Object.freeze([-1.08, -0.54, 0.00, 0.54, 1.08])
    })
  }),
  validation: Object.freeze({
    requiredBlueprintViews: Object.freeze(['side', 'front', 'top']),
    requiredLodBands: Object.freeze(['high', 'medium', 'core', 'proxy']),
    requiredParts: Object.freeze([
      'R35_CastHull',
      'R35_DriverVisor',
      'R35_APXR_Turret',
      'R35_SA18_MantletShield',
      'R35_SA18_MainCollar',
      'R35_SA18_Barrel',
      'R35_ProxyCastHull'
    ]),
    forbiddenParts: Object.freeze([
      'R35_DriverHood',
      'R35_CastNose',
      'R35_SA18_Mantlet'
    ]),
    closedParts: Object.freeze([
      'R35_CastHull',
      'R35_APXR_Turret',
      'R35_SA18_MantletShield'
    ]),
    mountSides: Object.freeze({
      main: 'right',
      coax: 'left'
    })
  })
});
