import * as THREE from 'three';
import { lateralX } from '../LocalFrame.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from './TrackedRunningGear.js';

// All dimensions use scene metres. Published overall length excludes weapon
// projection; track cleats own exact width and the cupola hatch owns height.
const B1 = Object.freeze({
  length: 6.37,
  width: 2.46,
  height: 2.79,
  hullRearZ: -3.185,
  hullFrontZ: 3.185,
  trackWidth: 0.45,
  // 0.996 + (0.45 * 1.04 / 2) = 1.230 m exact cleat envelope.
  trackCenterX: 0.996,
  trackLength: 6.18,
  trackHeight: 1.45,
  trackCenterY: 0.80,
  roadWheelRadius: 0.155,
  roadWheelCentersZ: Object.freeze(Array.from(
    { length: 16 },
    (_, index) => -2.25 + index * 0.30
  )),
  turretRingY: 1.88,
  turretCenterZ: 0.95,
  turretGunAxisLocalY: 0.34,
  turretGunMuzzleLocalZ: 1.68,
  hullGunAxis: Object.freeze([lateralX('right', 0.47), 1.31, 2.88]),
  hullGunMuzzleZ: 3.16,
  driverHoodCenterX: lateralX('left', 0.43)
});

// Side outline and cross-section widths registered to the Ken Musgrave
// orthographic plate, with exact endpoints supplied by the official envelope.
const HULL_STATIONS = Object.freeze([
  // z, half width, underside, shoulder, crown, crown half-width
  { z: -3.185, halfWidth: 0.77, bottomY: 0.50, shoulderY: 1.00, topY: 1.08, topHalfWidth: 0.58 },
  { z: -3.04, halfWidth: 1.05, bottomY: 0.25, shoulderY: 1.30, topY: 1.40, topHalfWidth: 0.80 },
  { z: -2.68, halfWidth: 1.10, bottomY: 0.18, shoulderY: 1.44, topY: 1.53, topHalfWidth: 0.86 },
  { z: -1.75, halfWidth: 1.10, bottomY: 0.15, shoulderY: 1.46, topY: 1.55, topHalfWidth: 0.87 },
  { z: -0.70, halfWidth: 1.10, bottomY: 0.15, shoulderY: 1.46, topY: 1.55, topHalfWidth: 0.87 },
  { z: 0.25, halfWidth: 1.10, bottomY: 0.15, shoulderY: 1.46, topY: 1.55, topHalfWidth: 0.87 },
  { z: 1.20, halfWidth: 1.10, bottomY: 0.15, shoulderY: 1.46, topY: 1.55, topHalfWidth: 0.87 },
  { z: 2.05, halfWidth: 1.10, bottomY: 0.17, shoulderY: 1.43, topY: 1.52, topHalfWidth: 0.85 },
  { z: 2.56, halfWidth: 1.08, bottomY: 0.23, shoulderY: 1.31, topY: 1.42, topHalfWidth: 0.75 },
  { z: 2.95, halfWidth: 1.00, bottomY: 0.36, shoulderY: 1.12, topY: 1.22, topHalfWidth: 0.60 },
  { z: 3.185, halfWidth: 0.73, bottomY: 0.58, shoulderY: 0.94, topY: 1.01, topHalfWidth: 0.45 }
]);

const UPPER_HULL_STATIONS = Object.freeze([
  { z: -2.70, halfWidth: 0.76, bottomY: 1.28, shoulderY: 1.52, topY: 1.62, topHalfWidth: 0.61 },
  { z: -2.42, halfWidth: 0.82, bottomY: 1.30, shoulderY: 1.59, topY: 1.68, topHalfWidth: 0.67 },
  { z: -1.55, halfWidth: 0.83, bottomY: 1.30, shoulderY: 1.61, topY: 1.70, topHalfWidth: 0.68 },
  { z: -0.55, halfWidth: 0.84, bottomY: 1.30, shoulderY: 1.65, topY: 1.74, topHalfWidth: 0.69 },
  { z: 0.65, halfWidth: 0.84, bottomY: 1.30, shoulderY: 1.81, topY: 1.91, topHalfWidth: 0.69 },
  { z: 1.55, halfWidth: 0.83, bottomY: 1.29, shoulderY: 1.80, topY: 1.90, topHalfWidth: 0.68 },
  { z: 2.22, halfWidth: 0.79, bottomY: 1.25, shoulderY: 1.70, topY: 1.81, topHalfWidth: 0.63 },
  { z: 2.68, halfWidth: 0.66, bottomY: 1.17, shoulderY: 1.48, topY: 1.59, topHalfWidth: 0.49 }
]);

const ENGINE_COVER_STATIONS = Object.freeze([
  { z: -3.00, halfWidth: 0.70, bottomY: 1.56, shoulderY: 1.64, topY: 1.71, topHalfWidth: 0.61 },
  { z: -2.78, halfWidth: 0.75, bottomY: 1.57, shoulderY: 1.73, topY: 1.82, topHalfWidth: 0.66 },
  { z: -1.92, halfWidth: 0.76, bottomY: 1.59, shoulderY: 1.93, topY: 2.03, topHalfWidth: 0.67 },
  { z: -1.72, halfWidth: 0.70, bottomY: 1.59, shoulderY: 1.87, topY: 1.96, topHalfWidth: 0.60 }
]);

const TURRET_RINGS = Object.freeze([
  // APX4 casting: broad lower race, rounded shoulder, slightly pulled-in rear.
  { y: 0.00, radiusX: 0.68, radiusZ: 0.95, centerZ: 0.00 },
  { y: 0.08, radiusX: 0.72, radiusZ: 1.00, centerZ: 0.01 },
  { y: 0.35, radiusX: 0.67, radiusZ: 0.92, centerZ: -0.01 },
  { y: 0.52, radiusX: 0.55, radiusZ: 0.80, centerZ: -0.05 },
  { y: 0.60, radiusX: 0.37, radiusZ: 0.58, centerZ: -0.09 }
]);

export const CHAR_B1_BIS_BLUEPRINT_CALIBRATION = Object.freeze({
  coordinateFrame: '+Y up, +Z forward, -X vehicle right',
  rigidEnvelopeMeters: Object.freeze({
    length: B1.length,
    width: B1.width,
    height: B1.height
  }),
  sources: Object.freeze([
    Object.freeze({
      title: 'Le char B1 bis',
      publisher: 'Chemins de memoire / Ministere des Armees',
      url: 'https://www.cheminsdememoire.gouv.fr/sites/default/files/2019-06/char%20B1%20bis.pdf',
      use: 'official 6.37 x 2.46 x 2.79 m envelope, armament, crew, and mass',
      quality: 'official museum collection sheet; dimensions treated as historical facts'
    }),
    Object.freeze({
      title: 'Char B1-bis four-view scale drawing',
      author: 'Ken Musgrave',
      publisher: 'OnWar',
      url: 'https://onwar.com/wwii/tanks/france/fr001b1bisp.html',
      imageUrl: 'https://onwar.com/wwii/tanks/france/fr001b1bis.jpg',
      use: 'side, front, rear, and top outline registration',
      quality: 'secondary orthographic drawing; proportions checked against official envelope'
    }),
    Object.freeze({
      title: 'Char B1 bis no. 738 factory photograph',
      publisher: 'ECPAD ImagesDefense',
      url: 'https://imagesdefense.gouv.fr/fr/plan-general-de-trois-quarts-avant-du-char-b1-bis-numero-738-qui-sort-de-l-usine-fcm-de-toulon.html',
      use: 'front asymmetry, driver hood, hull-gun mantlet, APX4 casting, and track envelope',
      quality: 'official 1940 photograph; perspective reference'
    }),
    Object.freeze({
      title: '1930 Char B1 technical description',
      publisher: 'Chars francais',
      url: 'https://www.chars-francais.net/index.php/engins-blindes/chars?catid=13&id=1789%3A1930-char-b1&view=article',
      use: 'shared B-series suspension architecture and right-side hull armament layout',
      quality: 'secondary transcription; suspension statement cross-checked against period photographs'
    })
  ]),
  datums: Object.freeze({
    groundLineY: Object.freeze({ value: 0, quality: 'exact model contract' }),
    hullRearZ: Object.freeze({ value: B1.hullRearZ, quality: 'exact official envelope endpoint' }),
    hullFrontZ: Object.freeze({ value: B1.hullFrontZ, quality: 'exact official envelope endpoint' }),
    trackCenterX: Object.freeze({
      value: B1.trackCenterX,
      quality: 'geometry-derived from exact 2.46 m width and documented 0.45 m track'
    }),
    roadWheelCentersZ: Object.freeze({
      value: B1.roadWheelCentersZ,
      quality: 'orthographic registration approximation preserving sixteen-wheel identity'
    }),
    turretRing: Object.freeze({
      value: Object.freeze([0, B1.turretRingY, B1.turretCenterZ]),
      quality: 'multi-view registration approximation'
    }),
    turretGunAxis: Object.freeze({
      value: Object.freeze([
        0,
        B1.turretRingY + B1.turretGunAxisLocalY,
        B1.turretCenterZ
      ]),
      quality: 'multi-view registration approximation'
    }),
    hullGunAxis: Object.freeze({
      value: B1.hullGunAxis,
      quality: 'right-side placement historical; precise center inferred from front elevation'
    })
  }),
  outlineLandmarks: Object.freeze([
    'full-height wraparound track run surrounding sixteen small road wheels',
    'near-vertical side armor with sloping short bow and rounded rear return',
    'driver hood on vehicle left and 75 mm mantlet on vehicle right',
    'right-side crew door and left-side armored radiator louvres',
    'compact rounded APX4 turret forward of hull center with rear-offset cupola'
  ])
});

const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchC = new THREE.Vector3();

function orientGeometryOutward(geometry) {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  let signedVolume = 0;
  for (let offset = 0; offset < indices.count; offset += 3) {
    scratchA.fromBufferAttribute(positions, indices.getX(offset));
    scratchB.fromBufferAttribute(positions, indices.getX(offset + 1));
    scratchC.fromBufferAttribute(positions, indices.getX(offset + 2));
    signedVolume += scratchA.dot(scratchB.clone().cross(scratchC)) / 6;
  }
  if (signedVolume < 0) {
    for (let offset = 0; offset < indices.count; offset += 3) {
      const second = indices.getX(offset + 1);
      indices.setX(offset + 1, indices.getX(offset + 2));
      indices.setX(offset + 2, second);
    }
    indices.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.outwardWindingAudited = true;
  geometry.userData.signedVolume = Math.abs(signedVolume);
  return geometry;
}

function hullRing(station) {
  const lowerHalfWidth = station.halfWidth * 0.78;
  return [
    [0, station.topY],
    [station.topHalfWidth, station.topY],
    [station.halfWidth, station.shoulderY],
    [station.halfWidth, station.bottomY + 0.16],
    [lowerHalfWidth, station.bottomY],
    [0, station.bottomY],
    [-lowerHalfWidth, station.bottomY],
    [-station.halfWidth, station.bottomY + 0.16],
    [-station.halfWidth, station.shoulderY],
    [-station.topHalfWidth, station.topY]
  ];
}

function createStationLoft(stations, ringBuilder, name) {
  const ringSize = ringBuilder(stations[0]).length;
  const positions = [];
  const uvs = [];
  const indices = [];
  stations.forEach((station, stationIndex) => {
    ringBuilder(station).forEach(([x, y], ringIndex) => {
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
  const rear = stations[0];
  positions.push(0, (rear.bottomY + rear.topY) / 2, rear.z);
  uvs.push(0.5, 0);
  const frontCenter = positions.length / 3;
  const front = stations.at(-1);
  positions.push(0, (front.bottomY + front.topY) / 2, front.z);
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
  geometry.name = name;
  geometry.userData.stationCount = stations.length;
  return orientGeometryOutward(geometry);
}

function createTurretGeometry(rings, segments = 8) {
  const positions = [];
  const uvs = [];
  const indices = [];
  rings.forEach((ring, ringIndex) => {
    for (let segment = 0; segment < segments; segment++) {
      const angle = (segment + 0.5) / segments * Math.PI * 2;
      const frontBias = Math.max(0, Math.cos(angle)) * 0.045;
      positions.push(
        Math.sin(angle) * ring.radiusX,
        ring.y,
        ring.centerZ + Math.cos(angle) * ring.radiusZ + frontBias
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
  geometry.name = 'CharB1BisAPX4TurretLoft';
  geometry.userData.ringCount = rings.length;
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

function addCylinderBarrel({
  name,
  radiusFront,
  radiusRear,
  length,
  center,
  material,
  lodBand,
  parent,
  envelopeRole = 'weaponProjection'
}) {
  const barrel = makeMesh(
    name,
    new THREE.CylinderGeometry(radiusFront, radiusRear, length, 12),
    material,
    lodBand,
    parent
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.copy(center);
  barrel.userData.envelopeRole = envelopeRole;
  barrel.userData.restZ = center.z;
  return barrel;
}

function addSideDetails(tankGroup, bodyMat, metalMat) {
  // Left radiator intake. Large vertical slats are a defining side-view cue.
  const radiator = makeMesh(
    'CharB1Bis_LeftRadiatorPanel',
    new THREE.BoxGeometry(0.055, 0.88, 1.36),
    bodyMat,
    'medium',
    tankGroup
  );
  radiator.position.set(lateralX('left', 1.105), 1.31, -0.76);
  radiator.userData.semanticSide = 'left';
  radiator.userData.surfaceRole = 'armored-radiator-intake';
  for (let index = 0; index < 8; index++) {
    const slat = makeMesh(
      `CharB1Bis_LeftRadiatorLouvre_${index + 1}`,
      new THREE.BoxGeometry(0.025, 0.055, 1.22),
      metalMat,
      'high',
      tankGroup
    );
    slat.position.set(lateralX('left', 1.139), 0.99 + index * 0.105, -0.76);
    slat.userData.semanticSide = 'left';
  }

  // Right crew door: recessed dark inset plus visible hinge blocks.
  const door = makeMesh(
    'CharB1Bis_RightCrewDoor',
    new THREE.BoxGeometry(0.035, 0.93, 0.80),
    bodyMat,
    'medium',
    tankGroup
  );
  door.position.set(lateralX('right', 1.112), 1.18, -0.15);
  door.userData.semanticSide = 'right';
  door.userData.surfaceRole = 'crew-door';
  for (const zOffset of [-0.29, 0.29]) {
    const hinge = makeMesh(
      `CharB1Bis_RightCrewDoorHinge_${zOffset < 0 ? 'Rear' : 'Front'}`,
      new THREE.BoxGeometry(0.05, 0.10, 0.11),
      metalMat,
      'high',
      tankGroup
    );
    hinge.position.set(lateralX('right', 1.145), 1.35, door.position.z + zOffset);
    hinge.userData.semanticSide = 'right';
  }

  // Visible bogie spring towers above the sixteen small wheel centers.
  for (const side of [-1, 1]) {
    const semanticSide = side < 0 ? 'Right' : 'Left';
    for (let bogie = 0; bogie < 3; bogie++) {
      const z = [-1.35, 0, 1.35][bogie];
      const spring = makeMesh(
        `CharB1Bis_${semanticSide}VerticalSpring_${bogie + 1}`,
        new THREE.CylinderGeometry(0.095, 0.095, 0.47, 8),
        metalMat,
        'high',
        tankGroup
      );
      spring.position.set(side * 1.125, 0.88, z);
      spring.userData.runningGearPart = 'vertical-bogie-spring';
    }
  }
}

function addDriverAndHullArmament(tankGroup, bodyMat, metalMat) {
  const hoodStations = [
    { z: 1.55, halfWidth: 0.36, bottomY: 1.66, shoulderY: 1.91, topY: 2.03, topHalfWidth: 0.27 },
    { z: 2.00, halfWidth: 0.38, bottomY: 1.55, shoulderY: 1.94, topY: 2.11, topHalfWidth: 0.29 },
    { z: 2.15, halfWidth: 0.30, bottomY: 1.44, shoulderY: 1.82, topY: 1.95, topHalfWidth: 0.20 }
  ];
  const driverHood = makeMesh(
    'CharB1Bis_LeftDriverHood',
    createStationLoft(hoodStations, hullRing, 'CharB1BisDriverHoodLoft'),
    bodyMat,
    'core',
    tankGroup
  );
  driverHood.position.x = B1.driverHoodCenterX;
  driverHood.userData.semanticSide = 'left';
  driverHood.userData.surfaceRole = 'driver-hood';

  const visor = makeMesh(
    'CharB1Bis_DriverVisor',
    new THREE.BoxGeometry(0.43, 0.20, 0.09),
    metalMat,
    'medium',
    tankGroup
  );
  visor.position.set(B1.driverHoodCenterX, 1.90, 2.16);
  visor.userData.semanticSide = 'left';

  const mantlet = makeMesh(
    'CharB1Bis_75mmMantlet',
    new THREE.CylinderGeometry(0.29, 0.32, 0.22, 14),
    bodyMat,
    'core',
    tankGroup
  );
  mantlet.rotation.x = Math.PI / 2;
  mantlet.position.set(B1.hullGunAxis[0], B1.hullGunAxis[1], 3.02);
  mantlet.userData.mountSide = 'right';
  mantlet.userData.surfaceRole = 'hull-gun-mantlet';

  const hullGunRearZ = 2.92;
  const hullGunLength = B1.hullGunMuzzleZ - hullGunRearZ;
  const hullGunBarrel = addCylinderBarrel({
    name: 'CharB1_75mm_HullGun',
    radiusFront: 0.075,
    radiusRear: 0.105,
    length: hullGunLength,
    center: new THREE.Vector3(
      B1.hullGunAxis[0],
      B1.hullGunAxis[1],
      hullGunRearZ + hullGunLength / 2
    ),
    material: metalMat,
    lodBand: 'core',
    parent: tankGroup
  });
  hullGunBarrel.userData.mountSide = 'right';
  hullGunBarrel.userData.weaponMountId = 'hull_main';

  const hullMuzzle = new THREE.Object3D();
  hullMuzzle.name = 'CharB1_75mm_Muzzle';
  hullMuzzle.position.set(B1.hullGunAxis[0], B1.hullGunAxis[1], B1.hullGunMuzzleZ);
  hullMuzzle.userData.weaponMountId = 'hull_main';
  hullMuzzle.userData.mountSide = 'right';
  tankGroup.add(hullMuzzle);
  tankGroup.userData.hullBarrel = hullGunBarrel;
  tankGroup.userData.hullMuzzle = hullMuzzle;
}

function addProxySilhouette(tankGroup, bodyMat, turretMat, trackMat, metalMat) {
  const proxy = new THREE.Group();
  proxy.name = 'CharB1BisAuthoredProxy';
  const hull = makeMesh(
    'CharB1Bis_ProxyHull',
    createStationLoft(
      HULL_STATIONS.filter((_, index) => [0, 2, 5, 8, 10].includes(index)),
      hullRing,
      'CharB1BisProxyHullLoft'
    ),
    bodyMat,
    'proxy',
    proxy
  );
  hull.visible = false;

  const upperHull = makeMesh(
    'CharB1Bis_ProxyUpperHull',
    createStationLoft(
      UPPER_HULL_STATIONS.filter((_, index) => [0, 2, 4, 6, 7].includes(index)),
      hullRing,
      'CharB1BisProxyUpperHullLoft'
    ),
    bodyMat,
    'proxy',
    proxy
  );
  upperHull.visible = false;

  const engineCover = makeMesh(
    'CharB1Bis_ProxyEngineCover',
    createStationLoft(
      [ENGINE_COVER_STATIONS[0], ENGINE_COVER_STATIONS[1], ENGINE_COVER_STATIONS[2], ENGINE_COVER_STATIONS[3]],
      hullRing,
      'CharB1BisProxyEngineCoverLoft'
    ),
    bodyMat,
    'proxy',
    proxy
  );
  engineCover.visible = false;

  const tracks = createTrackedRunningGearProxy({
    id: 'CharB1BisAuthoredRunningGearProxy',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: B1.trackCenterX,
    trackWidth: B1.trackWidth,
    beltLength: B1.trackLength,
    beltHeight: B1.trackHeight,
    centerY: B1.trackCenterY,
    roadWheelRadius: 0.16,
    roadWheelCount: 16
  });
  proxy.add(tracks);

  const turret = makeMesh(
    'CharB1Bis_ProxyAPX4Turret',
    createTurretGeometry([TURRET_RINGS[0], TURRET_RINGS[2], TURRET_RINGS[4]], 10),
    turretMat,
    'proxy',
    proxy
  );
  turret.position.set(0, B1.turretRingY, B1.turretCenterZ);
  turret.visible = false;

  const cupola = makeMesh(
    'CharB1Bis_ProxyCupola',
    new THREE.CylinderGeometry(0.27, 0.30, 0.24, 8),
    turretMat,
    'proxy',
    proxy
  );
  cupola.position.set(0, B1.turretRingY + 0.755, B1.turretCenterZ - 0.12);
  cupola.visible = false;
  const hatch = makeMesh(
    'CharB1Bis_ProxyCupolaHatch',
    new THREE.CylinderGeometry(0.25, 0.25, 0.03, 8),
    turretMat,
    'proxy',
    proxy
  );
  hatch.position.set(0, B1.turretRingY + 0.895, B1.turretCenterZ - 0.12);
  hatch.visible = false;

  const barrelLength = B1.turretGunMuzzleLocalZ - 0.70;
  const barrel = addCylinderBarrel({
    name: 'CharB1Bis_Proxy47mmBarrel',
    radiusFront: 0.045,
    radiusRear: 0.065,
    length: barrelLength,
    center: new THREE.Vector3(
      0,
      B1.turretRingY + B1.turretGunAxisLocalY,
      B1.turretCenterZ + 0.70 + barrelLength / 2
    ),
    material: metalMat,
    lodBand: 'proxy',
    parent: proxy
  });
  barrel.visible = false;
  tankGroup.add(proxy);
  tankGroup.userData.authoredProxy = proxy;
}

export function createCharB1BisMesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'fr_char_b1bis';
  tankGroup.userData.authoredHull = true;

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#39472b',
    roughness: 0.82,
    metalness: 0.08
  }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#435333',
    roughness: 0.80,
    metalness: 0.08
  }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#20251c',
    roughness: 0.92,
    metalness: 0.22
  }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#141815',
    metalness: 0.72,
    roughness: 0.42
  }), 'metal');

  const hull = makeMesh(
    'CharB1Bis_PrimaryHull',
    createStationLoft(HULL_STATIONS, hullRing, 'CharB1BisHullStationLoft'),
    bodyMat,
    'core',
    tankGroup
  );
  hull.userData.authoredHull = true;
  hull.userData.surfaceRole = 'primary-hull';
  hull.userData.profileStationCount = HULL_STATIONS.length;
  hull.userData.profileSource = CHAR_B1_BIS_BLUEPRINT_CALIBRATION.sources[1].title;

  const upperHull = makeMesh(
    'CharB1Bis_UpperHull',
    createStationLoft(UPPER_HULL_STATIONS, hullRing, 'CharB1BisUpperHullStationLoft'),
    bodyMat,
    'core',
    tankGroup
  );
  upperHull.userData.authoredHull = true;
  upperHull.userData.surfaceRole = 'raised-central-hull';
  upperHull.userData.profileStationCount = UPPER_HULL_STATIONS.length;
  upperHull.userData.profileSource = CHAR_B1_BIS_BLUEPRINT_CALIBRATION.sources[1].title;

  const engineCover = makeMesh(
    'CharB1Bis_RaisedEngineCover',
    createStationLoft(ENGINE_COVER_STATIONS, hullRing, 'CharB1BisEngineCoverStationLoft'),
    bodyMat,
    'core',
    tankGroup
  );
  engineCover.userData.surfaceRole = 'sloped-rear-engine-cover';
  engineCover.userData.profileStationCount = ENGINE_COVER_STATIONS.length;
  engineCover.userData.profileSource = CHAR_B1_BIS_BLUEPRINT_CALIBRATION.sources[1].title;

  const runningGear = createTrackedRunningGear({
    id: 'CharB1BisRunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: B1.trackCenterX,
    trackWidth: B1.trackWidth,
    beltLength: B1.trackLength,
    beltHeight: B1.trackHeight,
    centerY: B1.trackCenterY,
    roadWheelRadius: B1.roadWheelRadius,
    roadWheelCount: B1.roadWheelCentersZ.length,
    roadWheelY: 0.40,
    roadWheelZStart: B1.roadWheelCentersZ[0],
    roadWheelSpacing: 0.30,
    sprocketRadius: 0.49,
    idlerRadius: 0.45,
    linkPitch: 0.20
  });
  // Shared gear defaults to a front drive sprocket; B-series drive is at rear.
  for (const sprocket of runningGear.userData.trackParts.sprockets) {
    sprocket.position.z = -2.15;
  }
  for (const idler of runningGear.userData.trackParts.idlers) {
    idler.position.z = 2.17;
  }
  runningGear.userData.driveLocation = 'rear';
  runningGear.userData.wheelLayout = 'three four-wheel bogies plus four auxiliary rollers per side';
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  addSideDetails(tankGroup, bodyMat, metalMat);
  addDriverAndHullArmament(tankGroup, bodyMat, metalMat);

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, B1.turretRingY, B1.turretCenterZ);
  tankGroup.add(turretGroup);

  const turret = makeMesh(
    'CharB1Bis_APX4Turret',
    createTurretGeometry(TURRET_RINGS),
    turretMat,
    'core',
    turretGroup
  );
  turret.userData.surfaceRole = 'apx4-cast-turret';

  const cupola = makeMesh(
    'CharB1Bis_APX4Cupola',
    new THREE.CylinderGeometry(0.275, 0.31, 0.24, 12),
    turretMat,
    'medium',
    turretGroup
  );
  cupola.position.set(0, 0.755, -0.12);
  cupola.userData.surfaceRole = 'rear-offset-cupola';

  const hatch = makeMesh(
    'CharB1Bis_CupolaHatch',
    new THREE.CylinderGeometry(0.255, 0.255, 0.03, 12),
    turretMat,
    'high',
    turretGroup
  );
  hatch.position.set(0, 0.895, -0.12);

  const mantlet = makeMesh(
    'CharB1Bis_47mmMantlet',
    new THREE.CylinderGeometry(0.19, 0.22, 0.20, 12),
    turretMat,
    'medium',
    turretGroup
  );
  mantlet.rotation.x = Math.PI / 2;
  mantlet.position.set(0, B1.turretGunAxisLocalY, 0.70);

  const barrelLength = B1.turretGunMuzzleLocalZ - 0.70;
  const barrel = addCylinderBarrel({
    name: 'CharB1Bis_47mm_SA35',
    radiusFront: 0.045,
    radiusRear: 0.067,
    length: barrelLength,
    center: new THREE.Vector3(
      0,
      B1.turretGunAxisLocalY,
      0.70 + barrelLength / 2
    ),
    material: metalMat,
    lodBand: 'core',
    parent: turretGroup
  });
  barrel.userData.weaponMountId = 'main';

  const coax = addCylinderBarrel({
    name: 'coax_barrel',
    radiusFront: 0.014,
    radiusRear: 0.020,
    length: 0.62,
    center: new THREE.Vector3(lateralX('right', 0.18), 0.34, 0.99),
    material: metalMat,
    lodBand: 'high',
    parent: turretGroup
  });
  coax.userData.weaponMountId = 'coax';
  coax.userData.mountSide = 'right';
  coax.userData.placementQuality = 'historical front-arrangement evidence';

  const muzzle = new THREE.Object3D();
  muzzle.name = 'CharB1_47mm_Muzzle';
  muzzle.position.set(0, B1.turretGunAxisLocalY, B1.turretGunMuzzleLocalZ);
  muzzle.userData.weaponMountId = 'main';
  turretGroup.add(muzzle);

  turretGroup.userData.deckContact = {
    hullName: hull.name,
    maxGapMeters: 0.04
  };
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  addProxySilhouette(tankGroup, bodyMat, turretMat, trackMat, metalMat);

  tankGroup.userData.modelMetadata = {
    designation: 'Char B1 bis',
    dimensionsMeters: {
      length: B1.length,
      width: B1.width,
      height: B1.height
    },
    calibration: CHAR_B1_BIS_BLUEPRINT_CALIBRATION,
    features: [
      '75 mm ABS SA 35 right-side hull howitzer',
      '47 mm SA 35 in compact APX4 turret',
      'full-height wraparound tracks',
      'sixteen-wheel B-series suspension',
      'left driver hood and right crew door',
      'left armored radiator louvres',
      'Naeder hydraulic steering'
    ],
    lodLevels: ['high', 'medium', 'core', 'proxy']
  };

  return tankGroup;
}
