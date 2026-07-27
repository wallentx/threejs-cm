import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';
import { getVehicleVisualProfile } from './VehicleVisualProfiles.js';

const PROFILE = getVehicleVisualProfile('fr_renault_r35');

const R35_BLUEPRINT_FIT = Object.freeze({
  source: Object.freeze({
    title: 'Renault R35',
    url: 'https://www.the-blueprints.com/blueprints/tanks/tanks-r/50737/view/renault_r35/',
    imagePixels: Object.freeze({ width: 705, height: 347 }),
    evidence: 'source-page dimensions; side-elevation raster'
  }),
  outlineLandmarks: Object.freeze([
    Object.freeze({
      id: 'rigid-envelope',
      modelMeters: Object.freeze({ length: 4.02, width: 1.87, height: 2.13 }),
      evidence: 'historical dimensions from vehicle visual profile'
    }),
    Object.freeze({
      id: 'ground-line',
      axis: 'y',
      modelMeters: 0,
      evidence: 'inferred from raster track contact'
    }),
    Object.freeze({
      id: 'upper-track-run',
      axis: 'y',
      modelMeters: 1.10,
      evidence: 'approximation inferred from registered side outline'
    }),
    Object.freeze({
      id: 'turret-ring',
      modelMeters: Object.freeze({ y: 1.36, z: 0.05 }),
      evidence: 'approximation inferred from registered side outline'
    }),
    Object.freeze({
      id: 'main-gun-axis',
      axis: 'y',
      modelMeters: 1.79,
      evidence: 'approximation inferred from registered side outline'
    }),
    Object.freeze({
      id: 'road-wheel-centers',
      axis: 'z',
      modelMeters: Object.freeze([-0.98, -0.54, 0.06, 0.50, 0.95]),
      evidence: 'approximation inferred from five visible wheel centers'
    })
  ])
});

// Metres, +Y up and +Z forward. This factory keeps the visible trench tail
// inside the repository's 4.02 m visual-envelope contract.
const R35 = Object.freeze({
  overallLength: PROFILE.dimensionsMeters.length,
  overallWidth: PROFILE.dimensionsMeters.width,
  overallHeight: PROFILE.dimensionsMeters.height,
  noseZ: 1.85,
  hullRearZ: -1.52,
  tailZ: 1.85 - PROFILE.dimensionsMeters.length,
  trackWidth: 0.29,
  trackCenterX: 0.7842,
  trackLength: 3.42,
  trackHeight: 1.03,
  trackCenterY: 0.55,
  turretCenterZ: 0.05,
  turretDeckY: 1.36,
  turretBodyHeight: 0.63,
  gunX: 0.14,
  gunY: 0.43,
  gunLength: 0.40,
  gunMuzzleZ: 0.95,
  runningGearOffsetZ: 0.075693,
  roadWheelCentersZ: R35_BLUEPRINT_FIT.outlineLandmarks[5].modelMeters
});

function createCastHullGeometry(stations) {
  const ringSize = 10;
  const positions = [];
  const indices = [];

  for (const station of stations) {
    positions.push(
      -station.bottomHalfWidth, station.bottomY, station.z,
      station.bottomHalfWidth, station.bottomY, station.z,
      station.lowerHalfWidth, station.lowerY, station.z,
      station.halfWidth, station.shoulderY, station.z,
      station.upperHalfWidth, station.upperY, station.z,
      station.deckHalfWidth, station.deckY, station.z,
      -station.deckHalfWidth, station.deckY, station.z,
      -station.upperHalfWidth, station.upperY, station.z,
      -station.halfWidth, station.shoulderY, station.z,
      -station.lowerHalfWidth, station.lowerY, station.z
    );
  }

  for (let station = 0; station < stations.length - 1; station++) {
    const current = station * ringSize;
    const next = current + ringSize;
    for (let edge = 0; edge < ringSize; edge++) {
      const following = (edge + 1) % ringSize;
      indices.push(
        current + edge, current + following, next + following,
        current + edge, next + following, next + edge
      );
    }
  }

  for (let edge = 1; edge < ringSize - 1; edge++) {
    indices.push(0, edge + 1, edge);
    const front = (stations.length - 1) * ringSize;
    indices.push(front, front + edge, front + edge + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = 'R35CastHullGeometry';
  return geometry;
}

function createCastTurretGeometry(rings, segments = 12) {
  const positions = [];
  const indices = [];

  for (const ring of rings) {
    for (let segment = 0; segment < segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      positions.push(
        Math.cos(angle) * ring.halfWidth,
        ring.y,
        ring.centerZ + Math.sin(angle) * ring.halfLength
      );
    }
  }

  for (let ring = 0; ring < rings.length - 1; ring++) {
    const lower = ring * segments;
    const upper = lower + segments;
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      indices.push(
        lower + segment, upper + segment, upper + next,
        lower + segment, upper + next, lower + next
      );
    }
  }

  const bottomCenter = positions.length / 3;
  positions.push(0, rings[0].y, rings[0].centerZ);
  const topCenter = positions.length / 3;
  const topRing = rings[rings.length - 1];
  positions.push(0, topRing.y, topRing.centerZ);
  const topStart = (rings.length - 1) * segments;
  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    indices.push(
      bottomCenter, segment, next,
      topCenter, topStart + next, topStart + segment
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = 'R35APXRCastTurretGeometry';
  return geometry;
}

function createSideProfilePrismGeometry(profile, xMin, xMax, name) {
  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], profile[0][1]);
  for (let index = 1; index < profile.length; index++) {
    shape.lineTo(profile[index][0], profile[index][1]);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: xMax - xMin,
    steps: 1,
    bevelEnabled: false
  });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(xMax, 0, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = name;
  return geometry;
}

function tag(mesh, lodBand, name) {
  mesh.name = name;
  mesh.userData.lodBand = lodBand;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createRenaultR35Mesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'fr_renault_r35';
  tankGroup.userData.authoredHull = true;

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#3d4d2d', roughness: 0.78, metalness: 0.12
  }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#4a5938', roughness: 0.75, metalness: 0.12
  }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#1e231a', roughness: 0.9
  }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#111512', metalness: 0.82, roughness: 0.38
  }), 'metal');

  // The ring stations preserve the R35's three-piece cast character: a
  // pinched engine rear, broad central shoulders, and a low rounded nose.
  // Extra lower/upper shoulder controls avoid the old triangular front view.
  const hull = tag(new THREE.Mesh(createCastHullGeometry([
    {
      z: R35.hullRearZ, bottomHalfWidth: 0.48, bottomY: 0.66,
      lowerHalfWidth: 0.62, lowerY: 0.76,
      halfWidth: 0.71, shoulderY: 1.00,
      upperHalfWidth: 0.66, upperY: 1.20,
      deckHalfWidth: 0.55, deckY: 1.32
    },
    {
      z: -1.28, bottomHalfWidth: 0.57, bottomY: 0.62,
      lowerHalfWidth: 0.68, lowerY: 0.75,
      halfWidth: 0.75, shoulderY: 1.01,
      upperHalfWidth: 0.69, upperY: 1.22,
      deckHalfWidth: 0.62, deckY: 1.35
    },
    {
      z: -0.72, bottomHalfWidth: 0.61, bottomY: 0.60,
      lowerHalfWidth: 0.70, lowerY: 0.74,
      halfWidth: 0.755, shoulderY: 1.02,
      upperHalfWidth: 0.70, upperY: 1.23,
      deckHalfWidth: 0.64, deckY: 1.36
    },
    {
      z: -0.08, bottomHalfWidth: 0.63, bottomY: 0.59,
      lowerHalfWidth: 0.72, lowerY: 0.74,
      halfWidth: 0.76, shoulderY: 1.02,
      upperHalfWidth: 0.70, upperY: 1.23,
      deckHalfWidth: 0.64, deckY: 1.36
    },
    {
      z: 0.56, bottomHalfWidth: 0.63, bottomY: 0.59,
      lowerHalfWidth: 0.71, lowerY: 0.73,
      halfWidth: 0.75, shoulderY: 1.01,
      upperHalfWidth: 0.68, upperY: 1.21,
      deckHalfWidth: 0.61, deckY: 1.34
    },
    {
      z: 1.10, bottomHalfWidth: 0.58, bottomY: 0.62,
      lowerHalfWidth: 0.67, lowerY: 0.74,
      halfWidth: 0.70, shoulderY: 0.96,
      upperHalfWidth: 0.62, upperY: 1.14,
      deckHalfWidth: 0.51, deckY: 1.25
    },
    {
      z: 1.42, bottomHalfWidth: 0.52, bottomY: 0.65,
      lowerHalfWidth: 0.62, lowerY: 0.75,
      halfWidth: 0.64, shoulderY: 0.86,
      upperHalfWidth: 0.53, upperY: 0.98,
      deckHalfWidth: 0.39, deckY: 1.05
    },
    {
      z: 1.64, bottomHalfWidth: 0.43, bottomY: 0.66,
      lowerHalfWidth: 0.54, lowerY: 0.72,
      halfWidth: 0.57, shoulderY: 0.74,
      upperHalfWidth: 0.45, upperY: 0.83,
      deckHalfWidth: 0.31, deckY: 0.88
    }
  ]), bodyMat), 'core', 'R35_CastHull');
  hull.userData.surfaceRole = 'primary-hull';
  hull.userData.authoredHull = true;
  tankGroup.add(hull);

  // Transverse cylindrical nose is the recognizable cast final-drive cover
  // and establishes the forward end of the non-weapon envelope.
  const castNose = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(0.30, 0.30, 1.22, 18),
    bodyMat
  ), 'core', 'R35_CastNose');
  castNose.rotation.z = Math.PI / 2;
  castNose.position.set(0, 0.55, R35.noseZ - 0.30);
  tankGroup.add(castNose);

  const driverHood = tag(new THREE.Mesh(
    createSideProfilePrismGeometry([
      [0.68, 1.35],
      [0.76, 1.52],
      [1.13, 1.54],
      [1.36, 1.34],
      [1.38, 1.28],
      [0.70, 1.28]
    ], 0.03, 0.47, 'R35DriverHoodGeometry'),
    bodyMat
  ), 'core', 'R35_DriverHood');
  tankGroup.add(driverHood);

  const visorSlit = tag(new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.055, 0.07),
    metalMat
  ), 'high', 'R35_DriverVisor');
  visorSlit.position.set(0.25, 1.42, 1.29);
  visorSlit.rotation.x = -0.72;
  tankGroup.add(visorSlit);

  // Separate fenders leave the track faces visible and hold the narrow French
  // hull between the full 1.87 m outside-track width.
  for (const side of [-1, 1]) {
    const fender = tag(new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.045, 3.24),
      bodyMat
    ), 'core', `${side < 0 ? 'Right' : 'Left'}Fender`);
    fender.position.set(side * 0.79, 1.10, 0.08);
    tankGroup.add(fender);

    const lamp = tag(new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.10, 8),
      metalMat
    ), 'high', `${side < 0 ? 'Right' : 'Left'}Headlamp`);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.72, 1.16, 1.60);
    tankGroup.add(lamp);
  }

  const exhaust = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.075, 0.94, 8),
    metalMat
  ), 'high', 'R35_LeftExhaust');
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.70, 1.12, -0.94);
  tankGroup.add(exhaust);

  // The tail arms start at the cast rear and slope down toward the transverse
  // roller. The roller owns the exact rear endpoint of the 4.02 m envelope.
  for (const side of [-0.39, 0.39]) {
    const tailArm = tag(new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.10, 0.58),
      metalMat
    ), 'medium', `${side < 0 ? 'Right' : 'Left'}TrenchTailArm`);
    tailArm.position.set(side, 1.00, -1.80);
    tailArm.rotation.x = -0.12;
    tankGroup.add(tailArm);
  }
  const tailRoller = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.84, 10),
    metalMat
  ), 'medium', 'R35_TrenchTailRoller');
  tailRoller.rotation.z = Math.PI / 2;
  tailRoller.position.set(0, 0.95, R35.tailZ + 0.05);
  tankGroup.add(tailRoller);

  const runningGear = createTrackedRunningGear({
    id: 'R35RunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: R35.trackCenterX,
    trackWidth: R35.trackWidth,
    beltLength: R35.trackLength,
    beltHeight: R35.trackHeight,
    centerY: R35.trackCenterY,
    roadWheelRadius: 0.205,
    roadWheelCount: PROFILE.roadWheelsPerSide,
    roadWheelY: 0.245,
    roadWheelZStart: R35.roadWheelCentersZ[0] - R35.runningGearOffsetZ,
    roadWheelSpacing: 0.50,
    sprocketRadius: 0.39,
    idlerRadius: 0.36,
    linkPitch: 0.15
  });
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    for (let wheelIndex = 0; wheelIndex < R35.roadWheelCentersZ.length; wheelIndex++) {
      const wheel = runningGear.userData.trackParts.roadWheels[
        sideIndex * R35.roadWheelCentersZ.length + wheelIndex
      ];
      wheel.position.z = R35.roadWheelCentersZ[wheelIndex] - R35.runningGearOffsetZ;
    }
  }
  // Link geometry extends slightly beyond its path centreline; this offset
  // keeps the complete detailed silhouette on the exact 4.02 m contract.
  runningGear.position.z = R35.runningGearOffsetZ;
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // Visible paired suspension beams preserve the R35's compact bogie rhythm.
  for (const side of [-1, 1]) {
    for (const [index, centerZ] of [-0.76, 0.28, 0.73].entries()) {
      const beam = tag(new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.16, index === 0 ? 0.57 : 0.48),
        turretMat
      ), 'medium', `${side < 0 ? 'Right' : 'Left'}BogieBeam_${index + 1}`);
      beam.position.set(side * 0.90, 0.60, centerZ);
      beam.rotation.x = index === 1 ? -0.10 : 0.08;
      tankGroup.add(beam);
    }
  }

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, R35.turretDeckY, R35.turretCenterZ);
  turretGroup.userData.deckContact = {
    hullName: 'R35_CastHull',
    maxGapMeters: 0.03
  };

  // APX-R section loft. Its high cast roof replaces the old generic cone plus
  // oversized separate cupola while retaining deliberate facets.
  const turret = tag(new THREE.Mesh(
    createCastTurretGeometry([
      { y: 0.00, halfWidth: 0.50, halfLength: 0.52, centerZ: 0.00 },
      { y: 0.08, halfWidth: 0.57, halfLength: 0.57, centerZ: 0.00 },
      { y: 0.25, halfWidth: 0.53, halfLength: 0.53, centerZ: -0.01 },
      { y: 0.46, halfWidth: 0.45, halfLength: 0.46, centerZ: -0.03 },
      { y: R35.turretBodyHeight, halfWidth: 0.34, halfLength: 0.35, centerZ: -0.05 }
    ]),
    turretMat
  ), 'core', 'R35_APXR_Turret');
  turretGroup.add(turret);

  const mantlet = tag(new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.27, 0.16),
    turretMat
  ), 'core', 'R35_SA18_Mantlet');
  mantlet.position.set(R35.gunX, R35.gunY, 0.55);
  turretGroup.add(mantlet);

  // Shallow roof boss only; APX-R roof height belongs to the cast turret.
  const cupola = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.24, 0.10, 10),
    turretMat
  ), 'medium', 'R35_APXR_Cupola');
  cupola.position.set(-0.04, 0.68, -0.10);
  turretGroup.add(cupola);

  const hatch = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(0.215, 0.215, 0.04, 8),
    turretMat
  ), 'high', 'R35_CupolaHatch');
  hatch.position.set(
    -0.04,
    R35.overallHeight - R35.turretDeckY - 0.02,
    -0.08
  );
  turretGroup.add(hatch);

  const barrelCenterZ = R35.gunMuzzleZ - R35.gunLength / 2;
  const barrel = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.048, R35.gunLength, 8),
    metalMat
  ), 'core', 'R35_SA18_Barrel');
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(R35.gunX, R35.gunY, barrelCenterZ);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.envelopeRole = 'weaponProjection';
  turretGroup.add(barrel);

  const coax = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.02, 0.48, 7),
    metalMat
  ), 'high', 'coax_barrel');
  coax.rotation.x = Math.PI / 2;
  coax.position.set(-0.18, 0.30, 0.80 - 0.24);
  coax.userData.weaponMountId = 'coax';
  coax.userData.envelopeRole = 'weaponProjection';
  turretGroup.add(coax);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'R35_Muzzle';
  muzzle.position.set(R35.gunX, R35.gunY, R35.gunMuzzleZ);
  muzzle.userData.forwardAxis = '+Z';
  muzzle.userData.weaponMountId = 'main';
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(
    createCastHullGeometry([
      {
        z: R35.hullRearZ, bottomHalfWidth: 0.48, bottomY: 0.66,
        lowerHalfWidth: 0.62, lowerY: 0.76,
        halfWidth: 0.71, shoulderY: 1.00,
        upperHalfWidth: 0.66, upperY: 1.20,
        deckHalfWidth: 0.55, deckY: 1.32
      },
      {
        z: -0.08, bottomHalfWidth: 0.63, bottomY: 0.59,
        lowerHalfWidth: 0.72, lowerY: 0.74,
        halfWidth: 0.76, shoulderY: 1.02,
        upperHalfWidth: 0.70, upperY: 1.23,
        deckHalfWidth: 0.64, deckY: 1.36
      },
      {
        z: 1.64, bottomHalfWidth: 0.43, bottomY: 0.66,
        lowerHalfWidth: 0.54, lowerY: 0.72,
        halfWidth: 0.57, shoulderY: 0.74,
        upperHalfWidth: 0.45, upperY: 0.83,
        deckHalfWidth: 0.31, deckY: 0.88
      }
    ]),
    bodyMat
  );
  proxyBody.name = 'R35_ProxyCastHull';
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);

  const proxyTurret = new THREE.Mesh(
    createCastTurretGeometry([
      { y: 0.00, halfWidth: 0.50, halfLength: 0.52, centerZ: 0.00 },
      { y: 0.08, halfWidth: 0.57, halfLength: 0.57, centerZ: 0.00 },
      { y: 0.82, halfWidth: 0.34, halfLength: 0.35, centerZ: -0.05 }
    ], 8),
    turretMat
  );
  proxyTurret.name = 'R35_ProxyAPXRTurret';
  proxyTurret.position.set(0, R35.turretDeckY, R35.turretCenterZ);
  proxyTurret.userData.lodBand = 'proxy';
  proxyTurret.visible = false;
  proxyGroup.add(proxyTurret);
  tankGroup.add(proxyGroup);

  tankGroup.userData.modelMetadata = {
    designation: PROFILE.designation,
    dimensionsMeters: { ...PROFILE.dimensionsMeters },
    features: [...PROFILE.silhouetteFeatures],
    blueprintFit: R35_BLUEPRINT_FIT
  };

  return tankGroup;
}
