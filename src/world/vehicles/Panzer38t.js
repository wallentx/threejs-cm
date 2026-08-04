import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from './TrackedRunningGear.js';
import { getVehicleVisualProfile } from './VehicleVisualProfiles.js';

const PROFILE = getVehicleVisualProfile('ger_panzer38t');

// One metre-space table owns the rigid model. The published 4.61 m length is
// the vehicle envelope, not a late scale target. Flexible antenna and weapon
// geometry are explicitly classified outside that rigid envelope.
const PANZER_38T = Object.freeze({
  ...PROFILE.dimensionsMeters,
  hullRearZ: -2.305,
  hullFrontZ: 2.305,
  trackWidth: 0.293,
  trackCenterX: 0.912,
  trackLength: 4.16,
  trackHeight: 1.08,
  trackCenterY: 0.604,
  roadWheelRadius: 0.43,
  roadWheelY: 0.43,
  roadWheelCentersZ: Object.freeze([-1.23, -0.41, 0.41, 1.23]),
  returnRollerRadius: 0.115,
  returnRollerY: 1.015,
  returnRollerCentersZ: Object.freeze([-0.66, 0.66]),
  turretRingY: 1.49,
  turretCenterZ: 0.36,
  gunAxisLocalX: 0.07,
  // 1.71 m published firing height minus the 1.49 m turret-ring datum.
  gunAxisLocalY: 0.22,
  gunMuzzleLocalZ: 1.74,
  cupolaCenterX: 0.31,
  cupolaCenterZ: -0.14
});

// Registered against the E-G multi-view drawing for shared chassis/profile
// proportions, then checked against the Czech museum's surviving LT vz. 38.
// Scenario identity remains an early 1940 Ausf. B-D, hence its hull MG.
const LOWER_HULL_STATIONS = Object.freeze([
  // z, outer half-width, floor half-width, bottom, shoulder, roof half-width, roof
  { z: -2.305, halfWidth: 0.66, floorHalfWidth: 0.48, bottomY: 0.56, shoulderY: 0.86, roofHalfWidth: 0.55, roofY: 0.94 },
  { z: -2.08, halfWidth: 0.94, floorHalfWidth: 0.68, bottomY: 0.45, shoulderY: 0.99, roofHalfWidth: 0.84, roofY: 1.10 },
  { z: -1.72, halfWidth: 0.99, floorHalfWidth: 0.75, bottomY: 0.43, shoulderY: 1.05, roofHalfWidth: 0.88, roofY: 1.14 },
  { z: 1.54, halfWidth: 0.99, floorHalfWidth: 0.75, bottomY: 0.43, shoulderY: 1.05, roofHalfWidth: 0.88, roofY: 1.14 },
  { z: 1.92, halfWidth: 0.92, floorHalfWidth: 0.67, bottomY: 0.47, shoulderY: 0.96, roofHalfWidth: 0.78, roofY: 1.08 },
  { z: 2.305, halfWidth: 0.60, floorHalfWidth: 0.45, bottomY: 0.61, shoulderY: 0.82, roofHalfWidth: 0.48, roofY: 0.91 }
]);

const UPPER_HULL_STATIONS = Object.freeze([
  { z: -1.91, halfWidth: 0.87, floorHalfWidth: 0.78, bottomY: 1.05, shoulderY: 1.35, roofHalfWidth: 0.72, roofY: 1.45 },
  { z: -1.72, halfWidth: 0.91, floorHalfWidth: 0.80, bottomY: 1.06, shoulderY: 1.39, roofHalfWidth: 0.75, roofY: 1.49 },
  { z: -0.72, halfWidth: 0.91, floorHalfWidth: 0.80, bottomY: 1.06, shoulderY: 1.40, roofHalfWidth: 0.75, roofY: 1.50 },
  { z: 0.84, halfWidth: 0.91, floorHalfWidth: 0.80, bottomY: 1.06, shoulderY: 1.42, roofHalfWidth: 0.75, roofY: 1.51 },
  { z: 1.24, halfWidth: 0.89, floorHalfWidth: 0.78, bottomY: 1.05, shoulderY: 1.40, roofHalfWidth: 0.73, roofY: 1.50 },
  { z: 1.48, halfWidth: 0.85, floorHalfWidth: 0.74, bottomY: 1.02, shoulderY: 1.27, roofHalfWidth: 0.69, roofY: 1.38 },
  { z: 1.88, halfWidth: 0.64, floorHalfWidth: 0.57, bottomY: 0.93, shoulderY: 1.05, roofHalfWidth: 0.49, roofY: 1.12 }
]);

const TURRET_PLAN = Object.freeze([
  // Clockwise when viewed from above, +Z is the gun/front.
  Object.freeze([-0.45, 0.58]),
  Object.freeze([0.45, 0.58]),
  Object.freeze([0.65, 0.42]),
  Object.freeze([0.68, -0.62]),
  Object.freeze([0.57, -0.98]),
  Object.freeze([0.37, -1.20]),
  Object.freeze([-0.37, -1.20]),
  Object.freeze([-0.57, -0.98]),
  Object.freeze([-0.68, -0.62]),
  Object.freeze([-0.65, 0.42])
]);

export const PANZER_38T_BLUEPRINT_CALIBRATION = Object.freeze({
  coordinateFrame: '+Y up, +Z forward, -X vehicle right',
  variantScope: 'Panzerkampfwagen 38(t) Ausf. B-D in France, 1940',
  rigidEnvelopeMeters: Object.freeze({
    length: PANZER_38T.length,
    width: PANZER_38T.width,
    height: PANZER_38T.height
  }),
  sources: Object.freeze([
    Object.freeze({
      title: 'PzKpfw 38(t) Ausf. E/F/G multi-view drawing',
      publisher: 'Drawing Database / The-Blueprints.com scan',
      url: 'https://drawingdatabase.com/wp-content/uploads/2015/07/panzerkampfwagen-38t-ausf-e-f-g.png',
      use: 'registered side/front/top chassis, running-gear, deck, and turret outline',
      quality: 'secondary orthographic drawing; later armor variants share the calibrated chassis and principal silhouette'
    }),
    Object.freeze({
      title: 'Ceskoslovensky tank LT vz. 38 na snimcich z konce 60. let',
      publisher: 'Vojensky historicky ustav Praha',
      url: 'https://vhu.cz/exhibit/ceskoslovensky-tank-lt-vz-38-na-snimcich-z-konce-60-let/',
      use: 'official museum survivor evidence for riveted plate layout, running gear, turret, and early hull armament',
      quality: 'official museum archival photographs; perspective views'
    }),
    Object.freeze({
      title: 'Panzerkampfwagen 38 (t)',
      publisher: 'Panzerworld',
      url: 'https://panzerworld.com/pz-kpfw-38-t',
      use: '4.61 x 2.14 x 2.25 m envelope and 3.7 cm / MG 37(t) identities',
      quality: 'secondary technical compilation citing Panzer Tracts No. 18'
    })
  ]),
  imageRegistration: Object.freeze({
    sourceView: 'Ausf. E/F side, front and top elevations',
    sourceImagePixels: Object.freeze({ width: 1690, height: 1090 }),
    sideCropPixels: Object.freeze({ x: 120, y: 420, width: 650, height: 320 }),
    sideDatumPixelsInCrop: Object.freeze({
      rigidFrontX: 25,
      rigidRearX: 622,
      overallHeightTopY: 18,
      groundLineY: 309
    }),
    sideSourcePixelsPerMeter: 129.5,
    diagnosticOverlay: Object.freeze({
      outputPixels: Object.freeze({ width: 1400, height: 900 }),
      sourceScale: 1.564615,
      offsetPixels: Object.freeze([193, 194]),
      artifact: 'screenshots/panzer38t-side-overlay.png'
    }),
    mirrorForLocalSideView: false,
    frontTopStatus: 'front envelope registered; top used qualitatively for turret and deck plan pending exact jig landmark clicks',
    quality: 'side crop registered to rigid endpoints, ground line, and overall-height line; listed pixels are hand-read approximations'
  }),
  datums: Object.freeze({
    groundLineY: Object.freeze({ value: 0, quality: 'exact model contract' }),
    hullRearZ: Object.freeze({ value: PANZER_38T.hullRearZ, quality: 'exact envelope endpoint' }),
    hullFrontZ: Object.freeze({ value: PANZER_38T.hullFrontZ, quality: 'exact envelope endpoint' }),
    trackWidth: Object.freeze({ value: PANZER_38T.trackWidth, quality: 'published 293 mm value' }),
    roadWheelCentersZ: Object.freeze({
      value: PANZER_38T.roadWheelCentersZ,
      quality: 'registered side-elevation approximation'
    }),
    returnRollerCentersZ: Object.freeze({
      value: PANZER_38T.returnRollerCentersZ,
      quality: 'registered side-elevation approximation'
    }),
    turretRing: Object.freeze({
      value: Object.freeze([0, PANZER_38T.turretRingY, PANZER_38T.turretCenterZ]),
      quality: 'registered side/top outline approximation'
    }),
    gunAxis: Object.freeze({
      value: Object.freeze([
        PANZER_38T.gunAxisLocalX,
        PANZER_38T.turretRingY + PANZER_38T.gunAxisLocalY,
        PANZER_38T.turretCenterZ + 0.61
      ]),
      quality: 'published 1.71 m firing height; lateral and longitudinal roots registered from side/front outlines'
    })
  }),
  outlineLandmarks: Object.freeze([
    'four large road wheels nearly filling the track run',
    'two small upper return rollers and paired semi-elliptic leaf springs',
    'front drive sprocket and smaller rear idler',
    'riveted stepped glacis below a long flat rear engine deck',
    'forward faceted turret with left-offset commander cupola',
    '3.7 cm gun, right-side coaxial MG, and right-side hull MG'
  ])
});

function orientGeometryOutward(geometry) {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let signedVolume = 0;
  for (let offset = 0; offset < indices.count; offset += 3) {
    a.fromBufferAttribute(positions, indices.getX(offset));
    b.fromBufferAttribute(positions, indices.getX(offset + 1));
    c.fromBufferAttribute(positions, indices.getX(offset + 2));
    signedVolume += a.dot(cross.crossVectors(b, c)) / 6;
  }
  if (signedVolume < 0) {
    for (let offset = 0; offset < indices.count; offset += 3) {
      const middle = indices.getX(offset + 1);
      indices.setX(offset + 1, indices.getX(offset + 2));
      indices.setX(offset + 2, middle);
    }
    indices.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.outwardWindingAudited = true;
  return geometry;
}

function stationRing(station) {
  const lowerShoulderY = station.bottomY
    + (station.shoulderY - station.bottomY) * 0.35;
  return [
    [-station.floorHalfWidth, station.bottomY],
    [-station.halfWidth * 0.96, lowerShoulderY],
    [-station.halfWidth, station.shoulderY],
    [-station.roofHalfWidth, station.roofY],
    [station.roofHalfWidth, station.roofY],
    [station.halfWidth, station.shoulderY],
    [station.halfWidth * 0.96, lowerShoulderY],
    [station.floorHalfWidth, station.bottomY]
  ];
}

function createStationLoftGeometry(stations, name) {
  const ringSize = 8;
  const positions = [];
  const uvs = [];
  const indices = [];
  stations.forEach((station, stationIndex) => {
    stationRing(station).forEach(([x, y], ringIndex) => {
      positions.push(x, y, station.z);
      uvs.push(ringIndex / ringSize, stationIndex / (stations.length - 1));
    });
  });
  for (let station = 0; station < stations.length - 1; station++) {
    const current = station * ringSize;
    const next = current + ringSize;
    for (let edge = 0; edge < ringSize; edge++) {
      const following = (edge + 1) % ringSize;
      indices.push(
        current + edge, next + edge, next + following,
        current + edge, next + following, current + following
      );
    }
  }
  const rearCenter = positions.length / 3;
  positions.push(0, (stations[0].bottomY + stations[0].roofY) / 2, stations[0].z);
  uvs.push(0.5, 0);
  const frontCenter = positions.length / 3;
  const last = stations.at(-1);
  positions.push(0, (last.bottomY + last.roofY) / 2, last.z);
  uvs.push(0.5, 1);
  const front = (stations.length - 1) * ringSize;
  for (let edge = 0; edge < ringSize; edge++) {
    const following = (edge + 1) % ringSize;
    indices.push(rearCenter, edge, following);
    indices.push(frontCenter, front + following, front + edge);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = name;
  geometry.userData.semanticStations = stations.map(station => ({ ...station }));
  return orientGeometryOutward(geometry);
}

function createTurretGeometry(segments = TURRET_PLAN.length) {
  const rings = [
    { y: 0, scaleX: 0.94, scaleZ: 0.94, z: 0 },
    { y: 0.08, scaleX: 1, scaleZ: 1, z: 0 },
    { y: 0.55, scaleX: 0.91, scaleZ: 0.48, z: -0.015 },
    { y: 0.65, scaleX: 0.78, scaleZ: 0.42, z: -0.035 }
  ];
  const positions = [];
  const uvs = [];
  const indices = [];
  rings.forEach((ring, ringIndex) => {
    TURRET_PLAN.slice(0, segments).forEach(([x, z], pointIndex) => {
      positions.push(x * ring.scaleX, ring.y, z * ring.scaleZ + ring.z);
      uvs.push(pointIndex / segments, ringIndex / (rings.length - 1));
    });
  });
  for (let ring = 0; ring < rings.length - 1; ring++) {
    const current = ring * segments;
    const next = current + segments;
    for (let point = 0; point < segments; point++) {
      const following = (point + 1) % segments;
      indices.push(
        current + point, next + point, next + following,
        current + point, next + following, current + following
      );
    }
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, rings[0].y, 0);
  uvs.push(0.5, 0);
  const topCenter = positions.length / 3;
  positions.push(0, rings.at(-1).y, rings.at(-1).z);
  uvs.push(0.5, 1);
  const top = (rings.length - 1) * segments;
  for (let point = 0; point < segments; point++) {
    const following = (point + 1) % segments;
    indices.push(bottomCenter, point, following);
    indices.push(topCenter, top + following, top + point);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = 'Panzer38tFacetedTurretLoft';
  geometry.userData.planPointCount = segments;
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

function addReturnRollers(parent, wheelMaterial) {
  for (const side of [-1, 1]) {
    const semanticSide = side < 0 ? 'Right' : 'Left';
    PANZER_38T.returnRollerCentersZ.forEach((z, index) => {
      const roller = makeMesh(
        `Panzer38t_${semanticSide}ReturnRoller_${index + 1}`,
        new THREE.CylinderGeometry(
          PANZER_38T.returnRollerRadius,
          PANZER_38T.returnRollerRadius,
          PANZER_38T.trackWidth * 0.48,
          12
        ),
        wheelMaterial,
        'medium',
        parent
      );
      roller.rotation.z = Math.PI / 2;
      roller.position.set(
        side * (PANZER_38T.trackCenterX + PANZER_38T.trackWidth * 0.07),
        PANZER_38T.returnRollerY,
        z
      );
      roller.userData.runningGearPart = 'return-roller';
      roller.userData.semanticSide = semanticSide.toLowerCase();
    });
  }
}

function addCoreWheelSilhouette(parent, wheelMaterial) {
  const geometry = new THREE.CylinderGeometry(
    PANZER_38T.roadWheelRadius,
    PANZER_38T.roadWheelRadius,
    PANZER_38T.trackWidth * 0.26,
    8
  );
  const wheels = new THREE.InstancedMesh(geometry, wheelMaterial, 8);
  wheels.name = 'Panzer38t_CoreFourWheelSilhouette';
  wheels.userData.lodBand = 'core';
  wheels.userData.runningGearPart = 'core-road-wheel-silhouette';
  wheels.userData.wheelsPerSide = 4;
  wheels.castShadow = true;
  wheels.receiveShadow = true;
  const quaternion = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  const matrix = new THREE.Matrix4();
  let instance = 0;
  for (const side of [-1, 1]) {
    for (const z of PANZER_38T.roadWheelCentersZ) {
      matrix.compose(
        new THREE.Vector3(
          side * (PANZER_38T.trackCenterX - PANZER_38T.trackWidth * 0.16),
          PANZER_38T.roadWheelY,
          z
        ),
        quaternion,
        new THREE.Vector3(1, 1, 1)
      );
      wheels.setMatrixAt(instance++, matrix);
    }
  }
  wheels.instanceMatrix.needsUpdate = true;
  parent.add(wheels);
  return wheels;
}

function addLeafSpringPack(parent, side, centerZ, index, bodyMaterial, metalMaterial) {
  const semanticSide = side < 0 ? 'Right' : 'Left';
  const pack = new THREE.Group();
  pack.name = `Panzer38t_${semanticSide}LeafSpringPack_${index}`;
  pack.position.set(
    side * (PANZER_38T.trackCenterX + PANZER_38T.trackWidth * 0.07),
    0.89,
    centerZ
  );
  pack.userData.lodBand = 'medium';
  pack.userData.runningGearPart = 'semi-elliptic-leaf-spring';
  pack.userData.semanticSide = semanticSide.toLowerCase();
  parent.add(pack);

  for (let leaf = 0; leaf < 5; leaf++) {
    const length = 0.93 - leaf * 0.10;
    const spring = makeMesh(
      `Panzer38t_${semanticSide}Leaf_${index}_${leaf + 1}`,
      new THREE.BoxGeometry(PANZER_38T.trackWidth * 0.18, 0.025, length),
      leaf < 3 ? metalMaterial : bodyMaterial,
      leaf < 3 ? 'medium' : 'high',
      pack
    );
    spring.position.y = leaf * 0.025;
    spring.rotation.x = leaf % 2 === 0 ? 0.035 : -0.035;
    spring.userData.runningGearPart = 'leaf';
  }

  const pivot = makeMesh(
    `Panzer38t_${semanticSide}SpringPivot_${index}`,
    new THREE.CylinderGeometry(0.09, 0.09, PANZER_38T.trackWidth * 0.25, 10),
    bodyMaterial,
    'medium',
    pack
  );
  pivot.rotation.z = Math.PI / 2;
  pivot.userData.runningGearPart = 'spring-pivot';
}

function addRivetRow(parent, material, {
  name, count, start, end, lodBand = 'high', radius = 0.026
}) {
  const geometry = new THREE.SphereGeometry(radius, 6, 4);
  const rivets = new THREE.InstancedMesh(geometry, material, count);
  rivets.name = name;
  rivets.userData.lodBand = lodBand;
  rivets.userData.detailRole = 'rivets';
  rivets.castShadow = true;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  for (let index = 0; index < count; index++) {
    const t = count === 1 ? 0 : index / (count - 1);
    position.set(
      THREE.MathUtils.lerp(start[0], end[0], t),
      THREE.MathUtils.lerp(start[1], end[1], t),
      THREE.MathUtils.lerp(start[2], end[2], t)
    );
    matrix.makeTranslation(position.x, position.y, position.z);
    rivets.setMatrixAt(index, matrix);
  }
  rivets.instanceMatrix.needsUpdate = true;
  parent.add(rivets);
  return rivets;
}

function addProxyModels({
  root,
  proxyGroup,
  lowerHull,
  upperHull,
  turretGroup,
  turret,
  barrel,
  cupola,
  hatch,
  bodyMaterial,
  turretMaterial,
  trackMaterial,
  wheelMaterial
}) {
  const proxyLower = makeMesh(
    'Panzer38t_ProxyPrimaryHull',
    lowerHull.geometry.clone(),
    bodyMaterial,
    'proxy',
    proxyGroup
  );
  proxyLower.visible = false;
  proxyLower.userData.proxySource = 'calibrated-lower-hull';
  const proxyUpper = makeMesh(
    'Panzer38t_ProxyUpperHull',
    upperHull.geometry.clone(),
    bodyMaterial,
    'proxy',
    proxyGroup
  );
  proxyUpper.visible = false;
  proxyUpper.userData.proxySource = 'calibrated-upper-hull';
  for (const side of [-1, 1]) {
    const proxyFender = makeMesh(
      `Panzer38t_Proxy${side < 0 ? 'Right' : 'Left'}TrackGuard`,
      new THREE.BoxGeometry(0.14, 0.045, PANZER_38T.length),
      bodyMaterial,
      'proxy',
      proxyGroup
    );
    proxyFender.position.set(side * (PANZER_38T.width / 2 - 0.07), 1.145, 0);
    proxyFender.visible = false;
    proxyFender.userData.proxySource = 'calibrated-track-guard';
  }

  const proxyRunningGear = createTrackedRunningGearProxy({
    id: 'Panzer38t_ProxyRunningGear',
    trackMaterial,
    wheelMaterial,
    trackCenterX: PANZER_38T.trackCenterX,
    trackWidth: PANZER_38T.trackWidth,
    beltLength: PANZER_38T.trackLength,
    beltHeight: PANZER_38T.trackHeight,
    // Proxy belt has no outward cleat offset, so radius alone reaches ground.
    centerY: PANZER_38T.trackHeight / 2,
    roadWheelRadius: PANZER_38T.roadWheelRadius,
    roadWheelCount: 4
  });
  proxyGroup.add(proxyRunningGear);

  const proxyTurret = makeMesh(
    'Panzer38t_ProxyTurret',
    turret.geometry.clone(),
    turretMaterial,
    'proxy',
    turretGroup
  );
  proxyTurret.visible = false;
  const proxyBarrel = makeMesh(
    'Panzer38t_ProxyGunBarrel',
    barrel.geometry.clone(),
    barrel.material,
    'proxy',
    turretGroup
  );
  proxyBarrel.position.copy(barrel.position);
  proxyBarrel.quaternion.copy(barrel.quaternion);
  proxyBarrel.visible = false;
  proxyBarrel.userData.envelopeRole = 'weaponProjection';
  const proxyCupola = makeMesh(
    'Panzer38t_ProxyCommanderCupola',
    cupola.geometry.clone(),
    turretMaterial,
    'proxy',
    turretGroup
  );
  proxyCupola.position.copy(cupola.position);
  proxyCupola.visible = false;
  const proxyHatch = makeMesh(
    'Panzer38t_ProxyCommanderHatch',
    hatch.geometry.clone(),
    turretMaterial,
    'proxy',
    turretGroup
  );
  proxyHatch.position.copy(hatch.position);
  proxyHatch.visible = false;

  root.userData.proxyTurret = proxyTurret;
  root.userData.proxyBarrel = proxyBarrel;
}

export function createPanzer38tMesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'ger_panzer38t';
  tankGroup.userData.authoredHull = true;

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#3b4246',
    roughness: 0.72,
    metalness: 0.15
  }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#42494e',
    roughness: 0.70,
    metalness: 0.15
  }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#1a1d20',
    roughness: 0.90,
    metalness: 0.22
  }), 'track');
  const wheelMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#30373a',
    roughness: 0.82,
    metalness: 0.14
  }), 'paint');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#0f1214',
    metalness: 0.85,
    roughness: 0.35
  }), 'metal');

  const lowerHull = makeMesh(
    'Panzer38t_PrimaryHull',
    createStationLoftGeometry(LOWER_HULL_STATIONS, 'Panzer38tLowerHullStationLoft'),
    bodyMat,
    'core',
    tankGroup
  );
  lowerHull.userData.authoredHull = true;
  lowerHull.userData.surfaceRole = 'primary-hull';
  lowerHull.userData.profileStationCount = LOWER_HULL_STATIONS.length;

  const upperHull = makeMesh(
    'Panzer38t_RivetedUpperHull',
    createStationLoftGeometry(UPPER_HULL_STATIONS, 'Panzer38tUpperHullStationLoft'),
    bodyMat,
    'core',
    tankGroup
  );
  upperHull.userData.authoredHull = true;
  upperHull.userData.surfaceRole = 'superstructure';
  upperHull.userData.profileStationCount = UPPER_HULL_STATIONS.length;

  // Exact-width guards and exact-length end plates pin the rigid envelope.
  for (const side of [-1, 1]) {
    const semanticSide = side < 0 ? 'Right' : 'Left';
    const fender = makeMesh(
      `Panzer38t_${semanticSide}TrackGuard`,
      new THREE.BoxGeometry(0.14, 0.045, PANZER_38T.length),
      bodyMat,
      'core',
      tankGroup
    );
    fender.position.set(side * (PANZER_38T.width / 2 - 0.07), 1.145, 0);
    fender.userData.surfaceRole = 'track-guard';
  }

  const engineDeck = makeMesh(
    'Panzer38t_FlatRearEngineDeck',
    new THREE.BoxGeometry(1.50, 0.035, 1.12),
    bodyMat,
    'medium',
    tankGroup
  );
  engineDeck.position.set(0, 1.505, -1.24);
  engineDeck.userData.calibrationRole = 'flat-rear-engine-deck';
  for (let index = 0; index < 7; index++) {
    const louvre = makeMesh(
      `Panzer38t_EngineLouvre_${index + 1}`,
      new THREE.BoxGeometry(1.12, 0.018, 0.032),
      metalMat,
      'high',
      tankGroup
    );
    louvre.position.set(0, 1.53, -1.65 + index * 0.13);
  }

  // Early Ausf. B-D front: driver visor on vehicle left, hull MG on right.
  const driverVisor = makeMesh(
    'Panzer38t_DriverVisor',
    new THREE.BoxGeometry(0.38, 0.18, 0.07),
    metalMat,
    'high',
    tankGroup
  );
  driverVisor.position.set(0.39, 1.38, 1.49);
  driverVisor.rotation.x = -0.18;

  const hullMgHousing = makeMesh(
    'Panzer38t_HullMG37tHousing',
    new THREE.SphereGeometry(0.12, 10, 7),
    metalMat,
    'medium',
    tankGroup
  );
  hullMgHousing.position.set(-0.44, 1.48, 1.42);
  hullMgHousing.scale.set(1, 1, 0.58);
  hullMgHousing.userData.weaponMountId = 'hull_mg';
  hullMgHousing.userData.mountSide = 'right';

  for (const side of [-1, 1]) {
    const lamp = makeMesh(
      `Panzer38t_${side < 0 ? 'Right' : 'Left'}Headlamp`,
      new THREE.CylinderGeometry(0.085, 0.085, 0.10, 10),
      metalMat,
      'high',
      tankGroup
    );
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.69, 1.25, 1.78);
  }

  const runningGear = createTrackedRunningGear({
    id: 'Panzer38tRunningGear',
    trackMaterial: trackMat,
    wheelMaterial: wheelMat,
    trackCenterX: PANZER_38T.trackCenterX,
    trackWidth: PANZER_38T.trackWidth,
    beltLength: PANZER_38T.trackLength,
    beltHeight: PANZER_38T.trackHeight,
    centerY: PANZER_38T.trackCenterY,
    roadWheelRadius: PANZER_38T.roadWheelRadius,
    roadWheelCount: 4,
    roadWheelY: PANZER_38T.roadWheelY,
    roadWheelZStart: PANZER_38T.roadWheelCentersZ[0],
    roadWheelSpacing: 0.82,
    sprocketRadius: 0.37,
    idlerRadius: 0.31,
    linkPitch: 0.145
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;
  addCoreWheelSilhouette(tankGroup, wheelMat);
  addReturnRollers(tankGroup, wheelMat);
  for (const side of [-1, 1]) {
    addLeafSpringPack(tankGroup, side, -0.82, 1, bodyMat, metalMat);
    addLeafSpringPack(tankGroup, side, 0.82, 2, bodyMat, metalMat);
  }

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, PANZER_38T.turretRingY, PANZER_38T.turretCenterZ);
  tankGroup.add(turretGroup);

  const turret = makeMesh(
    'Panzer38t_ForwardFacetedTurret',
    createTurretGeometry(),
    turretMat,
    'core',
    turretGroup
  );
  turret.userData.profilePlanPointCount = TURRET_PLAN.length;
  turret.userData.surfaceRole = 'turret-shell';

  const mantlet = makeMesh(
    'Panzer38t_GunMantlet',
    new THREE.BoxGeometry(0.58, 0.34, 0.13),
    turretMat,
    'medium',
    turretGroup
  );
  mantlet.position.set(0.03, PANZER_38T.gunAxisLocalY, 0.61);
  mantlet.rotation.y = -0.04;

  const barrelLength = PANZER_38T.gunMuzzleLocalZ - 0.61;
  const barrel = makeMesh(
    'Panzer38t_37mmKwK38t_Barrel',
    new THREE.CylinderGeometry(0.032, 0.048, barrelLength, 10),
    metalMat,
    'core',
    turretGroup
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(
    PANZER_38T.gunAxisLocalX,
    PANZER_38T.gunAxisLocalY,
    0.61 + barrelLength / 2
  );
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.envelopeRole = 'weaponProjection';
  barrel.userData.weaponMountId = 'main';

  const muzzle = new THREE.Object3D();
  muzzle.name = 'Pz38t_Muzzle';
  muzzle.position.set(
    PANZER_38T.gunAxisLocalX,
    PANZER_38T.gunAxisLocalY,
    PANZER_38T.gunMuzzleLocalZ
  );
  muzzle.userData.weaponMountId = 'main';
  muzzle.userData.forwardAxis = '+Z';
  turretGroup.add(muzzle);

  const coaxHousing = makeMesh(
    'Panzer38t_CoaxMG37tHousing',
    new THREE.SphereGeometry(0.075, 8, 6),
    metalMat,
    'medium',
    turretGroup
  );
  coaxHousing.position.set(-0.22, 0.30, 0.63);
  coaxHousing.scale.set(1, 1, 0.55);
  coaxHousing.userData.weaponMountId = 'coax';
  coaxHousing.userData.mountSide = 'right';

  const cupola = makeMesh(
    'Panzer38t_LeftOffsetCommanderCupola',
    new THREE.CylinderGeometry(0.225, 0.245, 0.18, 10),
    turretMat,
    'core',
    turretGroup
  );
  cupola.position.set(
    PANZER_38T.cupolaCenterX,
    0.67,
    PANZER_38T.cupolaCenterZ
  );
  for (let index = 0; index < 5; index++) {
    const slit = makeMesh(
      `Panzer38t_CupolaVisionSlit_${index + 1}`,
      new THREE.BoxGeometry(0.045, 0.04, 0.018),
      metalMat,
      'high',
      cupola
    );
    const angle = index / 5 * Math.PI * 2;
    slit.position.set(Math.sin(angle) * 0.235, 0, Math.cos(angle) * 0.235);
    slit.rotation.y = angle;
  }
  const hatch = makeMesh(
    'Panzer38t_CommanderHatch',
    new THREE.CylinderGeometry(0.225, 0.225, 0.04, 10),
    turretMat,
    'high',
    turretGroup
  );
  hatch.position.set(
    PANZER_38T.cupolaCenterX,
    0.74,
    PANZER_38T.cupolaCenterZ
  );

  // Rivet rows follow actual plate seams. High tier only.
  for (const side of [-1, 1]) {
    const x = side * 0.915;
    addRivetRow(tankGroup, metalMat, {
      name: `Panzer38t_${side < 0 ? 'Right' : 'Left'}UpperHullRivets`,
      count: 18,
      start: [x, 1.18, -1.66],
      end: [x, 1.18, 1.30]
    });
  }
  addRivetRow(turretGroup, metalMat, {
    name: 'Panzer38t_TurretFrontRivets',
    count: 7,
    start: [-0.43, 0.10, 0.625],
    end: [0.43, 0.10, 0.625],
    radius: 0.022
  });

  const exhaust = makeMesh(
    'Panzer38t_RearExhaust',
    new THREE.CylinderGeometry(0.095, 0.095, 0.92, 10),
    metalMat,
    'high',
    tankGroup
  );
  exhaust.rotation.z = Math.PI / 2;
  exhaust.position.set(0, 1.26, -1.97);

  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  tankGroup.add(proxyGroup);
  addProxyModels({
    root: tankGroup,
    proxyGroup,
    lowerHull,
    upperHull,
    turretGroup,
    turret,
    barrel,
    cupola,
    hatch,
    bodyMaterial: bodyMat,
    turretMaterial: turretMat,
    trackMaterial: trackMat,
    wheelMaterial: wheelMat
  });

  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;
  tankGroup.userData.modelMetadata = {
    designation: PROFILE.designation,
    dimensionsMeters: PANZER_38T_BLUEPRINT_CALIBRATION.rigidEnvelopeMeters,
    features: [...PROFILE.silhouetteFeatures],
    blueprintCalibration: PANZER_38T_BLUEPRINT_CALIBRATION,
    sourceRecords: PANZER_38T_BLUEPRINT_CALIBRATION.sources,
    calibrationDatums: PANZER_38T_BLUEPRINT_CALIBRATION.datums,
    calibrationStatus: 'profile-refitted; exact source landmark clicks pending shared jig registration',
    variantScope: PANZER_38T_BLUEPRINT_CALIBRATION.variantScope,
    lodLevels: ['high', 'medium', 'core', 'proxy'],
    lodModelCount: 4
  };

  return tankGroup;
}
