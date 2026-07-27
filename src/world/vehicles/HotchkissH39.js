import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';
import { getVehicleVisualProfile } from './VehicleVisualProfiles.js';

const PROFILE = getVehicleVisualProfile('fr_hotchkiss_h39');

// One metre-space table owns the rigid silhouette. Published overall length
// excludes the gun projection. Track contact and internal landmark positions
// are inferred from the registered FM 30-42 elevations and survivor photos.
const H39 = Object.freeze({
  ...PROFILE.dimensionsMeters,
  hullRearZ: -2.11,
  hullFrontZ: 2.11,
  turretRingY: 1.38,
  turretCenterZ: 0.28,
  gunAxisLocalY: 0.32,
  gunAxisLocalX: 0.10,
  gunMuzzleLocalZ: 1.74,
  trackWidth: 0.27,
  trackCenterX: 0.7846,
  trackLength: 3.92,
  trackHeight: 0.78,
  // Includes link and cleat depth: detailed tracks touch y=0 without a hidden
  // model-wide scale or post-construction translation.
  trackCenterY: 0.4494,
  roadWheelRadius: 0.205,
  roadWheelCentersZ: Object.freeze([-0.94, -0.66, 0.04, 0.32, 1.02, 1.30])
});

const HULL_STATIONS = Object.freeze([
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
]);

const TURRET_RINGS = Object.freeze([
  // APX-R casting: broad near-vertical lower wall and a short rounded roof.
  { y: -0.03, radiusX: 0.52, radiusZ: 0.53, centerZ: -0.01 },
  { y: 0.05, radiusX: 0.61, radiusZ: 0.61, centerZ: 0.00 },
  { y: 0.38, radiusX: 0.58, radiusZ: 0.57, centerZ: -0.01 },
  { y: 0.50, radiusX: 0.48, radiusZ: 0.49, centerZ: -0.04 },
  { y: 0.55, radiusX: 0.34, radiusZ: 0.34, centerZ: -0.08 }
]);

export const H39_BLUEPRINT_CALIBRATION = Object.freeze({
  coordinateFrame: '+Y up, +Z forward, -X vehicle right',
  rigidEnvelopeMeters: Object.freeze({
    length: H39.length,
    width: H39.width,
    height: H39.height
  }),
  sources: Object.freeze([
    Object.freeze({
      title: 'FM 30-42 Military Intelligence: Identification of Foreign Armored Vehicles',
      publisher: 'United States War Department, 1942',
      page: 37,
      url: 'https://www.govinfo.gov/content/pkg/GOVPUB-W-PURL-gpo119422/pdf/GOVPUB-W-PURL-gpo119422.pdf',
      use: 'wartime side, front, and rear identification elevations',
      quality: 'historical orthographic identification drawing; outline detail is low resolution'
    }),
    Object.freeze({
      title: 'Hotchkiss H39',
      publisher: 'Musee des Blindes, Saumur',
      url: 'https://museedesblindes.fr/les_chars/hotchkiss-h-39/',
      use: 'surviving cast-hull, APX-R turret, driver hood, fender, and running-gear proportions',
      quality: 'official museum survivor photograph; perspective view'
    }),
    Object.freeze({
      title: 'Hotchkiss H35 - Fiche technique',
      publisher: 'Union Nationale de l’Arme Blindee Cavalerie Chars',
      url: 'https://www.unabcc.org/app/download/8279647/Hotchkiss%2BH35%2B-%2BFiche%2Btechnique.pdf',
      use: 'shared Hotchkiss six-wheel three-bogie suspension and 875 mm APX-R turret-ring evidence',
      quality: 'secondary technical sheet; H35 details used only where shared with H39'
    }),
    Object.freeze({
      title: 'Char leger H-39',
      publisher: 'War Drawings',
      url: 'https://www.wardrawings.be/WW2/Files/1-Vehicles/Allies/4-France/01-LightTanks/Hotchkiss-H35/Data/H-39.htm',
      use: 'SA 38 L/33 identity and zero barrel-overhang dimension check',
      quality: 'secondary reference compilation; used to reject unsupported gun overprojection'
    })
  ]),
  datums: Object.freeze({
    groundLineY: Object.freeze({ value: 0, quality: 'exact model contract' }),
    hullRearZ: Object.freeze({ value: H39.hullRearZ, quality: 'exact envelope endpoint' }),
    hullFrontZ: Object.freeze({ value: H39.hullFrontZ, quality: 'exact envelope endpoint' }),
    trackCenterY: Object.freeze({ value: H39.trackCenterY, quality: 'geometry-derived ground-contact approximation' }),
    roadWheelCentersZ: Object.freeze({
      value: H39.roadWheelCentersZ,
      quality: 'registered-profile approximation preserving three visibly paired bogies'
    }),
    turretRing: Object.freeze({
      value: Object.freeze([0, H39.turretRingY, H39.turretCenterZ]),
      quality: 'profile-registered center; ring diameter supported by APX-R technical sheet'
    }),
    gunAxis: Object.freeze({
      value: Object.freeze([
        H39.gunAxisLocalX,
        H39.turretRingY + H39.gunAxisLocalY,
        H39.turretCenterZ
      ]),
      quality: 'survivor-photo and side-profile approximation'
    })
  }),
  outlineLandmarks: Object.freeze([
    'rounded one-piece bow below offset driver hood',
    'three-piece cast hull with raised H39 rear engine casting',
    'six road wheels grouped beneath three horizontal spring bogies',
    'low broad APX-R casting with short roof shoulder and offset rear cupola',
    'SA 38 long-gun identity without extending beyond the 4.22 m rigid hull plan'
  ])
});

function orientGeometryOutward(geometry) {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  let signedVolume = 0;
  for (let offset = 0; offset < indices.count; offset += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(offset));
    const b = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(offset + 1));
    const c = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(offset + 2));
    signedVolume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
  }
  if (signedVolume < 0) {
    for (let offset = 0; offset < indices.count; offset += 3) {
      const b = indices.getX(offset + 1);
      indices.setX(offset + 1, indices.getX(offset + 2));
      indices.setX(offset + 2, b);
    }
    indices.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.outwardWindingAudited = true;
  return geometry;
}

function hullRing(station) {
  const width = station.halfWidth;
  const topEdge = width * station.topWidthRatio;
  const bottomEdge = width * 0.62;
  const lowerShoulder = station.bottomY + (station.shoulderY - station.bottomY) * 0.36;
  return [
    [0, station.topY],
    [topEdge, station.topY],
    [width * 0.92, station.topY - 0.07],
    [width, station.shoulderY],
    [width * 0.94, lowerShoulder],
    [bottomEdge, station.bottomY],
    [0, station.bottomY],
    [-bottomEdge, station.bottomY],
    [-width * 0.94, lowerShoulder],
    [-width, station.shoulderY],
    [-width * 0.92, station.topY - 0.07],
    [-topEdge, station.topY]
  ];
}

function createCastHullGeometry(stations) {
  const ringSize = 12;
  const positions = [];
  const uvs = [];
  const indices = [];

  stations.forEach((station, stationIndex) => {
    hullRing(station).forEach(([x, y], ringIndex) => {
      positions.push(x, y, station.z);
      uvs.push(ringIndex / ringSize, stationIndex / (stations.length - 1));
    });
  });

  for (let station = 0; station < stations.length - 1; station++) {
    const start = station * ringSize;
    const next = (station + 1) * ringSize;
    for (let ring = 0; ring < ringSize; ring++) {
      const following = (ring + 1) % ringSize;
      indices.push(
        start + ring, next + ring, next + following,
        start + ring, next + following, start + following
      );
    }
  }

  const rearCenter = positions.length / 3;
  positions.push(0, (stations[0].bottomY + stations[0].topY) / 2, stations[0].z);
  uvs.push(0.5, 0);
  const frontCenter = positions.length / 3;
  const last = stations.at(-1);
  positions.push(0, (last.bottomY + last.topY) / 2, last.z);
  uvs.push(0.5, 1);
  const frontStart = (stations.length - 1) * ringSize;
  for (let ring = 0; ring < ringSize; ring++) {
    const following = (ring + 1) % ringSize;
    indices.push(rearCenter, following, ring);
    indices.push(frontCenter, frontStart + ring, frontStart + following);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = 'H39CastHullStationLoft';
  geometry.userData.stationCount = stations.length;
  return orientGeometryOutward(geometry);
}

function createTurretGeometry(rings, segments = 16) {
  const positions = [];
  const uvs = [];
  const indices = [];
  rings.forEach((ring, ringIndex) => {
    for (let segment = 0; segment < segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      positions.push(
        Math.sin(angle) * ring.radiusX,
        ring.y,
        ring.centerZ + Math.cos(angle) * ring.radiusZ
      );
      uvs.push(segment / segments, ringIndex / (rings.length - 1));
    }
  });
  for (let ring = 0; ring < rings.length - 1; ring++) {
    const start = ring * segments;
    const next = (ring + 1) * segments;
    for (let segment = 0; segment < segments; segment++) {
      const following = (segment + 1) % segments;
      indices.push(
        start + segment, next + segment, next + following,
        start + segment, next + following, start + following
      );
    }
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, rings[0].y, rings[0].centerZ);
  uvs.push(0.5, 0);
  const topCenter = positions.length / 3;
  const top = rings.at(-1);
  positions.push(0, top.y, top.centerZ);
  uvs.push(0.5, 1);
  const topStart = (rings.length - 1) * segments;
  for (let segment = 0; segment < segments; segment++) {
    const following = (segment + 1) % segments;
    indices.push(bottomCenter, following, segment);
    indices.push(topCenter, topStart + segment, topStart + following);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = 'H39APXRTurretLoft';
  geometry.userData.ringCount = rings.length;
  return orientGeometryOutward(geometry);
}

function createFenderGeometry(side) {
  const stations = [
    { z: -1.96, innerX: 0.68, outerX: 0.79 },
    { z: -1.80, innerX: 0.69, outerX: 0.925 },
    { z: 1.72, innerX: 0.69, outerX: 0.925 },
    { z: 1.94, innerX: 0.64, outerX: 0.80 }
  ];
  const bottomY = 0.825;
  const topY = 0.875;
  const positions = [];
  const uvs = [];
  const indices = [];
  stations.forEach((station, stationIndex) => {
    const inner = side * station.innerX;
    const outer = side * station.outerX;
    [
      [inner, bottomY],
      [outer, bottomY],
      [outer, topY],
      [inner, topY]
    ].forEach(([x, y], ringIndex) => {
      positions.push(x, y, station.z);
      uvs.push(ringIndex / 3, stationIndex / (stations.length - 1));
    });
  });
  for (let station = 0; station < stations.length - 1; station++) {
    const start = station * 4;
    const next = (station + 1) * 4;
    for (let ring = 0; ring < 4; ring++) {
      const following = (ring + 1) % 4;
      indices.push(
        start + ring, next + ring, next + following,
        start + ring, next + following, start + following
      );
    }
  }
  indices.push(0, 2, 1, 0, 3, 2);
  const end = (stations.length - 1) * 4;
  indices.push(end, end + 1, end + 2, end, end + 2, end + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = `H39${side < 0 ? 'Right' : 'Left'}FenderLoft`;
  return orientGeometryOutward(geometry);
}

function makeMesh(name, geometry, material, lodBand, parent) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.lodBand = lodBand;
  parent.add(mesh);
  return mesh;
}

export function createHotchkissH39Mesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'fr_hotchkiss_h39';
  tankGroup.userData.authoredHull = true;

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#435434',
    roughness: 0.8,
    metalness: 0.1
  }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#4d5e3c',
    roughness: 0.78,
    metalness: 0.1
  }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#1e231a',
    roughness: 0.9
  }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#111512',
    metalness: 0.8,
    roughness: 0.4
  }), 'metal');

  const hull = makeMesh(
    'H39_CastHull',
    createCastHullGeometry(HULL_STATIONS),
    bodyMat,
    'core',
    tankGroup
  );
  hull.userData.surfaceRole = 'primary-hull';
  hull.userData.authoredHull = true;
  hull.userData.profileStationCount = HULL_STATIONS.length;
  hull.userData.profileSource = H39_BLUEPRINT_CALIBRATION.sources[0].title;

  for (const side of [-1, 1]) {
    const semanticSide = side < 0 ? 'Right' : 'Left';
    const fender = makeMesh(
      `H39_${semanticSide}TrackGuard`,
      createFenderGeometry(side),
      bodyMat,
      'core',
      tankGroup
    );
    fender.userData.surfaceRole = 'track-guard';

    for (let bogie = 0; bogie < 3; bogie++) {
      const bogieZ = [-0.80, 0.18, 1.16][bogie];
      const suspensionBar = makeMesh(
        `H39_${semanticSide}HorizontalBogie_${bogie + 1}`,
        new THREE.BoxGeometry(0.075, 0.10, 0.68),
        metalMat,
        'medium',
        tankGroup
      );
      suspensionBar.position.set(side * 0.81, 0.54, bogieZ);
      suspensionBar.userData.runningGearPart = 'horizontal-spring-bogie';

      for (const endOffset of [-0.23, 0.23]) {
        const arm = makeMesh(
          `H39_${semanticSide}BogieArm_${bogie + 1}_${endOffset < 0 ? 'Rear' : 'Front'}`,
          new THREE.BoxGeometry(0.07, 0.27, 0.065),
          metalMat,
          'high',
          tankGroup
        );
        arm.position.set(side * 0.81, 0.42, bogieZ + endOffset);
        arm.rotation.x = endOffset < 0 ? -0.36 : 0.36;
        arm.userData.runningGearPart = 'bogie-arm';
      }
    }

    for (const [index, z] of [-0.52, 0.52].entries()) {
      const roller = makeMesh(
        `H39_${semanticSide}ReturnRoller_${index + 1}`,
        new THREE.CylinderGeometry(0.085, 0.085, 0.10, 10),
        turretMat,
        'medium',
        tankGroup
      );
      roller.rotation.z = Math.PI / 2;
      roller.position.set(side * 0.80, 0.79, z);
      roller.userData.runningGearPart = 'return-roller';
    }
  }

  const runningGear = createTrackedRunningGear({
    id: 'H39RunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: H39.trackCenterX,
    trackWidth: H39.trackWidth,
    beltLength: H39.trackLength,
    beltHeight: H39.trackHeight,
    centerY: H39.trackCenterY,
    roadWheelRadius: H39.roadWheelRadius,
    roadWheelCount: PROFILE.roadWheelsPerSide,
    roadWheelY: 0.36,
    roadWheelZStart: H39.roadWheelCentersZ[0],
    roadWheelSpacing: 0.45,
    sprocketRadius: 0.30,
    idlerRadius: 0.28,
    linkPitch: 0.15
  });
  runningGear.userData.trackParts.roadWheels.forEach((wheel, index) => {
    wheel.position.z = H39.roadWheelCentersZ[index % PROFILE.roadWheelsPerSide];
    wheel.userData.profilePositionQuality = 'registered-profile approximation';
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // Right-offset driver hood is a defining front/top landmark. It remains
  // separate from the shared cast hull so its asymmetry survives plan view.
  const driverHood = makeMesh(
    'H39_RightOffsetDriverHood',
    new THREE.BoxGeometry(0.55, 0.22, 0.64, 1, 1, 2),
    bodyMat,
    'core',
    tankGroup
  );
  driverHood.position.set(-0.28, 1.21, 1.08);
  driverHood.rotation.x = -0.18;
  driverHood.userData.semanticSide = 'right';

  const visor = makeMesh(
    'H39_DriverVisor',
    new THREE.BoxGeometry(0.31, 0.13, 0.075),
    metalMat,
    'high',
    tankGroup
  );
  visor.position.set(-0.28, 1.29, 1.40);
  visor.rotation.x = -0.18;

  const engineHatch = makeMesh(
    'H39_RearEngineHatch',
    new THREE.BoxGeometry(0.72, 0.025, 0.62),
    bodyMat,
    'medium',
    tankGroup
  );
  engineHatch.position.set(0.02, 1.258, -1.15);
  engineHatch.rotation.x = 0.035;
  engineHatch.userData.surfaceRole = 'engine-hatch';

  for (let index = 0; index < 5; index++) {
    const louvre = makeMesh(
      `H39_EngineLouvre_${index + 1}`,
      new THREE.BoxGeometry(0.66, 0.025, 0.035),
      metalMat,
      'high',
      tankGroup
    );
    louvre.position.set(0.02, 1.282, -1.33 + index * 0.12);
    louvre.rotation.x = 0.035;
  }

  for (const side of [-1, 1]) {
    const lamp = makeMesh(
      `H39_${side < 0 ? 'Right' : 'Left'}Headlamp`,
      new THREE.CylinderGeometry(0.075, 0.075, 0.09, 10),
      metalMat,
      'high',
      tankGroup
    );
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.56, 0.96, 1.82);
  }

  const exhaust = makeMesh(
    'H39_RearExhaust',
    new THREE.CylinderGeometry(0.075, 0.095, 0.84, 10),
    metalMat,
    'high',
    tankGroup
  );
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.63, 1.04, -1.56);

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, H39.turretRingY, H39.turretCenterZ);
  turretGroup.userData.deckContact = {
    hullName: hull.name,
    maxGapMeters: 0.03
  };

  const turret = makeMesh(
    'H39_APXR_Turret',
    createTurretGeometry(TURRET_RINGS),
    turretMat,
    'core',
    turretGroup
  );
  turret.userData.surfaceRole = 'apxr-cast-turret';
  turret.userData.profileRingCount = TURRET_RINGS.length;

  const mantlet = makeMesh(
    'H39_SA38_Mantlet',
    new THREE.SphereGeometry(1, 12, 8),
    turretMat,
    'core',
    turretGroup
  );
  mantlet.scale.set(0.29, 0.24, 0.15);
  mantlet.position.set(H39.gunAxisLocalX, H39.gunAxisLocalY, 0.54);

  const gunCollar = makeMesh(
    'H39_SA38_Collar',
    new THREE.CylinderGeometry(0.082, 0.105, 0.18, 12),
    turretMat,
    'medium',
    turretGroup
  );
  gunCollar.rotation.x = Math.PI / 2;
  gunCollar.position.set(H39.gunAxisLocalX, H39.gunAxisLocalY, 0.64);

  const barrelLength = H39.gunMuzzleLocalZ - 0.56;
  const barrel = makeMesh(
    'H39_SA38_Barrel',
    new THREE.CylinderGeometry(0.036, 0.052, barrelLength, 12),
    metalMat,
    'core',
    turretGroup
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(
    H39.gunAxisLocalX,
    H39.gunAxisLocalY,
    0.56 + barrelLength / 2
  );
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.envelopeRole = 'weaponProjection';

  const muzzle = new THREE.Object3D();
  muzzle.name = 'H39_Muzzle';
  muzzle.position.set(
    H39.gunAxisLocalX,
    H39.gunAxisLocalY,
    H39.gunMuzzleLocalZ
  );
  muzzle.userData.forwardAxis = '+Z';
  turretGroup.add(muzzle);

  const cupola = makeMesh(
    'H39_CommanderCupola',
    new THREE.CylinderGeometry(0.205, 0.25, 0.20, 12),
    turretMat,
    'core',
    turretGroup
  );
  cupola.scale.y = 0.90;
  cupola.position.set(0, 0.64, -0.13);

  const cupolaDome = makeMesh(
    'H39_CupolaDome',
    new THREE.SphereGeometry(0.20, 12, 6),
    turretMat,
    'medium',
    turretGroup
  );
  cupolaDome.scale.y = 0.30;
  cupolaDome.position.set(0, 0.70, -0.13);

  const hatch = makeMesh(
    'H39_CupolaHatch',
    new THREE.CylinderGeometry(0.17, 0.18, 0.025, 12),
    turretMat,
    'high',
    turretGroup
  );
  hatch.position.set(0, 0.7475, -0.13);

  const rearTurretHatch = makeMesh(
    'H39_TurretRearHatch',
    new THREE.BoxGeometry(0.34, 0.36, 0.035),
    turretMat,
    'high',
    turretGroup
  );
  rearTurretHatch.position.set(0, 0.29, -0.595);
  rearTurretHatch.rotation.x = -0.08;

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  // Enhancer replaces these cheap source proxies with the shared articulated
  // far tier. Keeping them sectioned prevents standalone use from collapsing
  // into a single opaque box.
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyHull = makeMesh(
    'H39_SourceProxyHull',
    createCastHullGeometry(HULL_STATIONS.filter((_, index) => index % 2 === 0 || index === HULL_STATIONS.length - 1)),
    bodyMat,
    'proxy',
    proxyGroup
  );
  proxyHull.visible = false;
  const proxyTurret = makeMesh(
    'H39_SourceProxyTurret',
    createTurretGeometry([TURRET_RINGS[0], TURRET_RINGS[2], TURRET_RINGS.at(-1)], 8),
    turretMat,
    'proxy',
    proxyGroup
  );
  proxyTurret.position.copy(turretGroup.position);
  proxyTurret.visible = false;
  tankGroup.add(proxyGroup);

  tankGroup.userData.modelMetadata = {
    designation: PROFILE.designation,
    dimensionsMeters: PROFILE.dimensionsMeters,
    features: [...PROFILE.silhouetteFeatures, '37 mm SA 38 gun'],
    references: [
      ...PROFILE.references,
      ...H39_BLUEPRINT_CALIBRATION.sources.map(source => source.url)
    ],
    dataQuality: PROFILE.dataQuality,
    blueprintCalibration: H39_BLUEPRINT_CALIBRATION,
    profileStationCount: HULL_STATIONS.length,
    turretRingCount: TURRET_RINGS.length,
    dimensionPolicy: 'rigid hull envelope excludes weapon projection and flexible attachments'
  };

  return tankGroup;
}
