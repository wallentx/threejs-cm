import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from './TrackedRunningGear.js';

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// Panzerkampfwagen II Ausf. C rigid dimensions. Weapon projections and aerials
// do not participate in this envelope.
const D = Object.freeze({
  length: 4.81,
  width: 2.22,
  height: 1.99,
  // Shared track helper adds 4%-wide cleats and an outward lower-run offset.
  // These authored inputs make the emitted high-tier belt, not its path
  // centreline, meet the exact 2.22 m width and the ground plane.
  trackCenterX: 0.9332,
  trackWidth: 0.34,
  trackLength: 4.65,
  trackHeight: 0.97,
  trackCenterY: 0.562,
  roadWheelRadius: 0.255,
  roadWheelY: 0.35,
  roadWheelZ: Object.freeze([-1.15, -0.55, 0.05, 0.65, 1.25]),
  returnRollerZ: Object.freeze([-1.18, -0.43, 0.35, 1.10]),
  turretCenterX: 0.17, // +X is vehicle-left.
  turretCenterZ: 0.25,
  turretRingY: 1.43,
  turretBodyHeight: 0.48,
  hatchHeight: 0.08,
  gunAxisY: 0.25,
  gunRootZ: 0.72,
  gunExternalLength: 0.92
});

const BLUEPRINT_CALIBRATION = Object.freeze({
  source: Object.freeze({
    title: 'Sd.Kfz. 121 Pz.Kpfw. II Ausf. C side elevation',
    url: 'https://www.the-blueprints.com/blueprints/tanks/ww2-tanks-germany-2/81805/view/sd_kfz_121_pzkpfwii_ausfc/',
    previewUrl: 'https://www.the-blueprints.com/blueprints-depot/tanks/ww2-tanks-germany-2/sdkfz121-pzkpfwii-ausfc-2-3.png',
    quality: 'variant-specific published side elevation; used locally, not redistributed'
  }),
  reproducibleSecondarySource: Object.freeze({
    title: 'Panzerkampfwagen II Ausf. c side elevation',
    url: 'https://commons.wikimedia.org/wiki/File:Panzer_II_c.svg',
    originalFileUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Panzer_II_c.svg',
    author: 'Marseille77',
    license: 'public domain dedication',
    quality: 'public-domain closely related profile; contour cross-check only'
  }),
  dimensionSource: Object.freeze({
    url: 'https://de.wikipedia.org/wiki/Panzerkampfwagen_II',
    values: '4.81 m x 2.22 m x 1.99 m',
    quality: 'published historical dimensions'
  }),
  registration: Object.freeze({
    sourceImagePixels: Object.freeze([1671, 698]),
    cropPixels: Object.freeze({
      left: 7,
      top: 5,
      right: 8,
      bottom: 9
    }),
    originPixels: Object.freeze([835.5, 688]),
    metersPerPixel: 0.002918,
    mirrorX: false,
    quality: 'measured from Ausf. C preview and registered to exact rigid length/height'
  }),
  datums: Object.freeze({
    rigidEnvelope: Object.freeze({
      value: Object.freeze([D.width, D.height, D.length]),
      quality: 'historical exact'
    }),
    groundLineY: Object.freeze({ value: 0, quality: 'registered elevation datum' }),
    roadWheelCenters: Object.freeze({
      value: Object.freeze(D.roadWheelZ.map(z => Object.freeze([z, D.roadWheelY]))),
      quality: 'profile-derived; inferred to nearest centimetre'
    }),
    driveSprocketCenter: Object.freeze({
      value: Object.freeze([1.93, 0.63]),
      quality: 'profile-derived; inferred'
    }),
    idlerCenter: Object.freeze({
      value: Object.freeze([-1.84, 0.63]),
      quality: 'profile-derived; inferred'
    }),
    turretRingCenter: Object.freeze({
      value: Object.freeze([D.turretCenterZ, D.turretRingY]),
      quality: 'profile-derived; inferred'
    }),
    turretLateralOffset: Object.freeze({
      value: D.turretCenterX,
      quality: 'historical arrangement; magnitude inferred from plan photographs'
    }),
    gunAxis: Object.freeze({
      value: Object.freeze([
        D.turretCenterZ + D.gunRootZ,
        D.turretRingY + D.gunAxisY
      ]),
      quality: 'profile-derived; inferred'
    }),
    gunMuzzleZ: Object.freeze({
      value: D.turretCenterZ + D.gunRootZ + D.gunExternalLength,
      quality: 'profile-derived; inferred'
    })
  }),
  allowedDivergences: Object.freeze([
    'side elevation is authoritative for longitudinal profile',
    'lateral turret offset and plan taper remain photograph-informed approximations',
    'leaf-spring thickness is exaggerated slightly for game-distance readability'
  ])
});

// Side-elevation link-center path. Unlike a generic capsule it preserves the
// unequal drive-sprocket/idler radii and the short upward-sloping end runs.
// Points wind rear-bottom -> front-bottom -> front-top -> rear-top.
const TRACK_PATH_YZ = Object.freeze([
  Object.freeze([0.075, -1.84]),
  Object.freeze([0.075, 1.57]),
  Object.freeze([0.14, 1.90]),
  Object.freeze([0.35, 2.20]),
  Object.freeze([0.62, 2.31]),
  Object.freeze([0.86, 2.22]),
  Object.freeze([1.045, 2.04]),
  Object.freeze([1.045, -1.72]),
  Object.freeze([0.97, -2.02]),
  Object.freeze([0.78, -2.21]),
  Object.freeze([0.52, -2.19]),
  Object.freeze([0.28, -2.08]),
  Object.freeze([0.10, -1.84])
]);

const LOWER_HULL_STATIONS = Object.freeze([
  { z: -2.405, halfWidth: 0.76, floorY: 0.49, shoulderY: 0.70, roofHalfWidth: 0.77, roofY: 0.82 },
  { z: -2.12, halfWidth: 0.99, floorY: 0.36, shoulderY: 0.80, roofHalfWidth: 0.98, roofY: 0.97 },
  { z: -1.62, halfWidth: 1.02, floorY: 0.32, shoulderY: 0.86, roofHalfWidth: 1.00, roofY: 1.05 },
  { z: 1.50, halfWidth: 1.02, floorY: 0.32, shoulderY: 0.86, roofHalfWidth: 1.00, roofY: 1.09 },
  { z: 1.90, halfWidth: 0.98, floorY: 0.38, shoulderY: 0.82, roofHalfWidth: 0.90, roofY: 0.99 },
  { z: 2.20, halfWidth: 0.90, floorY: 0.48, shoulderY: 0.75, roofHalfWidth: 0.71, roofY: 0.88 },
  { z: 2.405, halfWidth: 0.58, floorY: 0.63, shoulderY: 0.70, roofHalfWidth: 0.45, roofY: 0.79 }
]);

const UPPER_HULL_STATIONS = Object.freeze([
  { z: -2.15, halfWidth: 0.88, floorY: 0.94, shoulderY: 1.14, roofHalfWidth: 0.82, roofY: 1.34 },
  { z: -1.80, halfWidth: 1.01, floorY: 0.95, shoulderY: 1.20, roofHalfWidth: 0.91, roofY: 1.37 },
  { z: -0.72, halfWidth: 1.01, floorY: 1.00, shoulderY: 1.24, roofHalfWidth: 0.88, roofY: 1.43 },
  { z: 0.90, halfWidth: 1.01, floorY: 1.00, shoulderY: 1.24, roofHalfWidth: 0.88, roofY: 1.43 },
  { z: 1.19, halfWidth: 0.96, floorY: 0.98, shoulderY: 1.18, roofHalfWidth: 0.74, roofY: 1.39 },
  { z: 1.43, halfWidth: 0.84, floorY: 0.94, shoulderY: 1.05, roofHalfWidth: 0.58, roofY: 1.17 }
]);

const TURRET_RINGS = Object.freeze([
  { y: 0.00, halfWidth: 0.72, frontZ: 0.77, rearZ: 0.91 },
  { y: 0.31, halfWidth: 0.69, frontZ: 0.71, rearZ: 0.87 },
  { y: 0.48, halfWidth: 0.60, frontZ: 0.57, rearZ: 0.79 }
]);

function signedVolume(geometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  let volume = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const ia = index ? index.getX(triangle * 3) : triangle * 3;
    const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  }
  return volume;
}

function orientOutward(geometry) {
  if (signedVolume(geometry) < 0) {
    const index = geometry.getIndex();
    for (let offset = 0; offset < index.count; offset += 3) {
      const second = index.getX(offset + 1);
      index.setX(offset + 1, index.getX(offset + 2));
      index.setX(offset + 2, second);
    }
    index.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.signedVolume = signedVolume(geometry);
  geometry.userData.orientationChecked = true;
  return geometry;
}

function hullRing(station) {
  return [
    [-station.halfWidth, station.floorY, station.z],
    [-station.halfWidth, station.shoulderY, station.z],
    [-station.roofHalfWidth, station.roofY, station.z],
    [station.roofHalfWidth, station.roofY, station.z],
    [station.halfWidth, station.shoulderY, station.z],
    [station.halfWidth, station.floorY, station.z]
  ];
}

function createClosedLoftGeometry(stations, name) {
  const rings = stations.map(hullRing);
  const ringSize = rings[0].length;
  const positions = [];
  const uvs = [];
  for (const ring of rings) {
    for (const [x, y, z] of ring) {
      positions.push(x, y, z);
      uvs.push(z, y);
    }
  }
  const indices = [];
  for (let station = 0; station < rings.length - 1; station++) {
    for (let point = 0; point < ringSize; point++) {
      const nextPoint = (point + 1) % ringSize;
      const a = station * ringSize + point;
      const b = station * ringSize + nextPoint;
      const c = (station + 1) * ringSize + nextPoint;
      const d = (station + 1) * ringSize + point;
      indices.push(a, b, c, a, c, d);
    }
  }
  for (let point = 1; point < ringSize - 1; point++) {
    indices.push(0, point + 1, point);
    const front = (rings.length - 1) * ringSize;
    indices.push(front, front + point, front + point + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = name;
  return orientOutward(geometry);
}

function createTurretGeometry(rings, radialSegments, name) {
  const positions = [];
  const uvs = [];
  for (const ring of rings) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const angle = segment / radialSegments * Math.PI * 2;
      const forward = Math.cos(angle);
      const x = Math.sin(angle) * ring.halfWidth;
      const z = forward >= 0
        ? forward * ring.frontZ
        : forward * ring.rearZ;
      positions.push(x, ring.y, z);
      uvs.push(segment / radialSegments, ring.y);
    }
  }
  const indices = [];
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      const a = ring * radialSegments + segment;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + next;
      const d = (ring + 1) * radialSegments + segment;
      indices.push(a, b, c, a, c, d);
    }
  }
  for (let segment = 1; segment < radialSegments - 1; segment++) {
    indices.push(0, segment + 1, segment);
    const top = (rings.length - 1) * radialSegments;
    indices.push(top, top + segment, top + segment + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = name;
  return orientOutward(geometry);
}

function addMesh(parent, geometry, material, name, band, userData = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { lodBand: band, ...userData };
  parent.add(mesh);
  return mesh;
}

function createBeamBetween(start, end, width, height, material, name, band) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const beam = addMesh(
    new THREE.Group(),
    new THREE.BoxGeometry(width, height, length),
    material,
    name,
    band
  );
  beam.position.copy(start).add(end).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(Z_AXIS, direction.normalize());
  return beam;
}

function addReturnRollers(parent, material) {
  const group = new THREE.Group();
  group.name = 'ReturnRollers';
  for (const side of [-1, 1]) {
    for (let index = 0; index < D.returnRollerZ.length; index++) {
      const roller = addMesh(
        group,
        new THREE.CylinderGeometry(0.105, 0.105, 0.16, 10),
        material,
        `${side < 0 ? 'Right' : 'Left'}ReturnRoller_${index + 1}`,
        'medium',
        {
          trackPart: 'returnRoller',
          semanticSide: side < 0 ? 'right' : 'left'
        }
      );
      roller.rotation.z = Math.PI / 2;
      roller.position.set(side * 1.025, 0.82, D.returnRollerZ[index]);
    }
  }
  parent.add(group);
  return group;
}

function addLeafSpringSuspension(parent, material) {
  const group = new THREE.Group();
  group.name = 'FiveWheelLeafSpringSuspension';
  for (const side of [-1, 1]) {
    for (let wheel = 0; wheel < D.roadWheelZ.length; wheel++) {
      const z = D.roadWheelZ[wheel];
      const springGroup = new THREE.Group();
      springGroup.name = `${side < 0 ? 'Right' : 'Left'}LeafSpring_${wheel + 1}`;
      for (let leaf = 0; leaf < 4; leaf++) {
        const spread = 0.23 - leaf * 0.022;
        const rise = 0.09 - leaf * 0.012;
        const spring = createBeamBetween(
          new THREE.Vector3(side * 1.055, 0.67 + leaf * 0.018, z - spread),
          new THREE.Vector3(side * 1.055, 0.67 + rise + leaf * 0.018, z + spread),
          0.045,
          0.018,
          material,
          `Leaf_${leaf + 1}`,
          leaf === 0 ? 'medium' : 'high'
        );
        springGroup.add(spring);
      }
      const arm = createBeamBetween(
        new THREE.Vector3(side * 1.045, D.roadWheelY + 0.02, z),
        new THREE.Vector3(side * 1.045, 0.69, z - 0.12),
        0.055,
        0.055,
        material,
        'SuspensionArm',
        'high'
      );
      springGroup.add(arm);
      group.add(springGroup);
    }
  }
  parent.add(group);
  return group;
}

function trackPathSegments() {
  const segments = [];
  let totalLength = 0;
  for (let index = 0; index < TRACK_PATH_YZ.length; index++) {
    const start = TRACK_PATH_YZ[index];
    const end = TRACK_PATH_YZ[(index + 1) % TRACK_PATH_YZ.length];
    const dy = end[0] - start[0];
    const dz = end[1] - start[1];
    const length = Math.hypot(dy, dz);
    segments.push({ start, dy, dz, length, distance: totalLength });
    totalLength += length;
  }
  return { segments, totalLength };
}

const TRACK_PATH = trackPathSegments();

function sampleTrackPath(distance) {
  const wrapped = ((distance % TRACK_PATH.totalLength) + TRACK_PATH.totalLength)
    % TRACK_PATH.totalLength;
  const segment = TRACK_PATH.segments.find(candidate => (
    wrapped <= candidate.distance + candidate.length
  )) ?? TRACK_PATH.segments.at(-1);
  const t = segment.length > 0 ? (wrapped - segment.distance) / segment.length : 0;
  return {
    y: segment.start[0] + segment.dy * t,
    z: segment.start[1] + segment.dz * t,
    dy: segment.dy / segment.length,
    dz: segment.dz / segment.length
  };
}

function refitTrackLinksToBlueprint(runningGear) {
  const position = new THREE.Vector3();
  const cleatPosition = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const cleatOffset = Math.min(0.055, D.trackWidth * 0.16);

  for (const belt of runningGear.userData.trackParts.tracks) {
    const { links, cleats, count } = belt;
    const side = links.userData.side;
    const instancePath = [];
    for (let index = 0; index < count; index++) {
      const path = sampleTrackPath(index / count * TRACK_PATH.totalLength);
      const rotationX = -Math.atan2(path.dy, path.dz);
      position.set(side * D.trackCenterX, path.y, path.z);
      quaternion.setFromAxisAngle(X_AXIS, rotationX);
      matrix.compose(position, quaternion, scale);
      links.setMatrixAt(index, matrix);

      // Right-hand normal for the counter-clockwise Y/Z path points outside.
      cleatPosition.set(
        side * D.trackCenterX,
        path.y - path.dz * cleatOffset,
        path.z + path.dy * cleatOffset
      );
      matrix.compose(cleatPosition, quaternion, scale);
      cleats.setMatrixAt(index, matrix);
      instancePath.push({
        distance: index / count * TRACK_PATH.totalLength,
        position: position.toArray(),
        quaternion: quaternion.toArray()
      });
    }
    links.instanceMatrix.needsUpdate = true;
    cleats.instanceMatrix.needsUpdate = true;
    links.computeBoundingBox();
    links.computeBoundingSphere();
    cleats.computeBoundingBox();
    cleats.computeBoundingSphere();
    links.userData.instancePath = instancePath;
    cleats.userData.instancePath = instancePath;
    links.userData.pathSource = 'registered-Ausf-C-side-elevation';
    cleats.userData.pathSource = 'registered-Ausf-C-side-elevation';
  }
  runningGear.userData.runningGearType = 'blueprint-refit-closed-track-belt';
  runningGear.userData.trackPathYZ = TRACK_PATH_YZ.map(point => [...point]);
}

function addDetailParts(root, upperHull, turretGroup, materials) {
  const { body, turret, metal } = materials;
  for (const side of [-1, 1]) {
    const fender = addMesh(
      root,
      new THREE.BoxGeometry(0.12, 0.055, 4.25),
      body,
      `${side < 0 ? 'Right' : 'Left'}TrackFender`,
      'medium'
    );
    fender.position.set(side * 1.035, 1.075, -0.08);

    const lamp = addMesh(
      root,
      new THREE.CylinderGeometry(0.075, 0.085, 0.11, 10),
      metal,
      `${side < 0 ? 'Right' : 'Left'}Headlamp`,
      'high'
    );
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.70, 1.14, 1.63);
  }

  const driverVisor = addMesh(
    root,
    new THREE.BoxGeometry(0.36, 0.17, 0.075),
    metal,
    'DriverVisor',
    'high'
  );
  driverVisor.position.set(0.38, 1.23, 1.405);
  driverVisor.rotation.x = -0.15;

  const bowVisor = addMesh(
    root,
    new THREE.BoxGeometry(0.27, 0.13, 0.07),
    metal,
    'RadioOperatorVisor',
    'high'
  );
  bowVisor.position.set(-0.43, 1.18, 1.40);
  bowVisor.rotation.x = -0.15;

  const exhaust = addMesh(
    root,
    new THREE.CylinderGeometry(0.075, 0.09, 0.82, 10),
    metal,
    'RightSideExhaust',
    'high'
  );
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(-1.00, 1.16, -1.47);

  for (let index = 0; index < 6; index++) {
    const louvre = addMesh(
      root,
      new THREE.BoxGeometry(1.16, 0.025, 0.055),
      metal,
      `EngineDeckLouvre_${index + 1}`,
      'high'
    );
    louvre.position.set(0, 1.385, -1.12 - index * 0.14);
    louvre.rotation.x = -0.025;
  }

  const turretRing = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.73, 0.73, 0.055, 14),
    turret,
    'TurretRing',
    'medium'
  );
  turretRing.position.y = 0.0275;

  for (const side of [-1, 1]) {
    const visionPort = addMesh(
      turretGroup,
      new THREE.BoxGeometry(0.055, 0.15, 0.26),
      metal,
      `${side < 0 ? 'Right' : 'Left'}TurretVisionPort`,
      'high'
    );
    visionPort.position.set(side * 0.65, 0.28, -0.03);
  }

  upperHull.userData.calibrationRole = 'upper-superstructure-profile';
}

function createProxyAssembly(root, materials) {
  const proxy = new THREE.Group();
  proxy.name = 'Proxy';

  const proxyHull = addMesh(
    proxy,
    createClosedLoftGeometry(
      [LOWER_HULL_STATIONS[0], LOWER_HULL_STATIONS[1], LOWER_HULL_STATIONS[3], LOWER_HULL_STATIONS[5], LOWER_HULL_STATIONS[6]],
      'PanzerIICProxyLowerHullGeometry'
    ),
    materials.body,
    'PanzerIICProxyHull',
    'proxy',
    { authoredHull: true }
  );
  proxyHull.visible = false;

  const proxyUpper = addMesh(
    proxy,
    createClosedLoftGeometry(
      [UPPER_HULL_STATIONS[0], UPPER_HULL_STATIONS[1], UPPER_HULL_STATIONS[3], UPPER_HULL_STATIONS[5]],
      'PanzerIICProxyUpperHullGeometry'
    ),
    materials.body,
    'PanzerIICProxySuperstructure',
    'proxy'
  );
  proxyUpper.visible = false;

  const proxyGear = createTrackedRunningGearProxy({
    id: 'PanzerIICRunningGearProxy',
    trackMaterial: materials.track,
    wheelMaterial: materials.turret,
    trackCenterX: 0.94,
    trackWidth: D.trackWidth,
    beltLength: 4.50,
    beltHeight: D.trackHeight,
    centerY: D.trackCenterY,
    roadWheelRadius: D.roadWheelRadius,
    roadWheelCount: 5
  });
  for (const beltName of ['ProxyLeftTrackBelt', 'ProxyRightTrackBelt']) {
    proxyGear.getObjectByName(beltName).position.z = 0.045;
  }
  const proxyWheels = proxyGear.getObjectByName('ProxyRoadWheels');
  const wheelQuaternion = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  const wheelMatrix = new THREE.Matrix4();
  let wheelInstance = 0;
  for (const side of [-1, 1]) {
    for (const z of D.roadWheelZ) {
      wheelMatrix.compose(
        new THREE.Vector3(side * 0.94, D.roadWheelY, z),
        wheelQuaternion,
        new THREE.Vector3(1, 1, 1)
      );
      proxyWheels.setMatrixAt(wheelInstance++, wheelMatrix);
    }
  }
  proxyWheels.instanceMatrix.needsUpdate = true;
  proxyWheels.computeBoundingBox();
  proxyWheels.computeBoundingSphere();
  proxyWheels.userData.positionSource = 'registered-Ausf-C-side-elevation';
  proxy.add(proxyGear);

  const proxyTurret = addMesh(
    proxy,
    createTurretGeometry(TURRET_RINGS, 8, 'PanzerIICProxyTurretGeometry'),
    materials.turret,
    'PanzerIICProxyTurret',
    'proxy'
  );
  proxyTurret.position.set(D.turretCenterX, D.turretRingY, D.turretCenterZ);
  proxyTurret.visible = false;

  const proxyHatch = addMesh(
    proxy,
    new THREE.CylinderGeometry(0.22, 0.23, D.hatchHeight, 8),
    materials.turret,
    'PanzerIICProxyCommanderHatch',
    'proxy'
  );
  proxyHatch.position.set(
    D.turretCenterX + 0.08,
    D.turretRingY + D.turretBodyHeight + D.hatchHeight * 0.5,
    D.turretCenterZ + 0.12
  );
  proxyHatch.visible = false;

  const proxyBarrelGeometry = new THREE.CylinderGeometry(0.025, 0.038, D.gunExternalLength, 6);
  proxyBarrelGeometry.rotateX(Math.PI / 2);
  const proxyBarrel = addMesh(
    proxy,
    proxyBarrelGeometry,
    materials.metal,
    'PanzerIICProxyBarrel',
    'proxy',
    { envelopeRole: 'weaponProjection' }
  );
  proxyBarrel.position.set(
    D.turretCenterX,
    D.turretRingY + D.gunAxisY,
    D.turretCenterZ + D.gunRootZ + D.gunExternalLength * 0.5
  );
  proxyBarrel.visible = false;

  root.add(proxy);
  return { proxy, proxyHull, proxyTurret, proxyBarrel, proxyGear };
}

export function createPanzerIIMesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'ger_panzer2';

  const materials = {
    body: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#454d52',
      roughness: 0.72,
      metalness: 0.15
    }), 'paint'),
    turret: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#4a5358',
      roughness: 0.70,
      metalness: 0.15
    }), 'paint'),
    track: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#1a1d20',
      roughness: 0.90,
      metalness: 0.18
    }), 'track'),
    metal: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#0f1214',
      metalness: 0.85,
      roughness: 0.35
    }), 'metal')
  };

  const lowerHull = addMesh(
    tankGroup,
    createClosedLoftGeometry(LOWER_HULL_STATIONS, 'PanzerIICLowerHullGeometry'),
    materials.body,
    'PanzerIIC_PrimaryHull',
    'core',
    {
      authoredHull: true,
      calibrationRole: 'rigid-lower-hull',
      stationCount: LOWER_HULL_STATIONS.length
    }
  );

  const upperHull = addMesh(
    tankGroup,
    createClosedLoftGeometry(UPPER_HULL_STATIONS, 'PanzerIICUpperHullGeometry'),
    materials.body,
    'PanzerIIC_SteppedSuperstructure',
    'core',
    {
      calibrationRole: 'stepped-upper-hull',
      stationCount: UPPER_HULL_STATIONS.length
    }
  );

  const runningGear = createTrackedRunningGear({
    id: 'PanzerIIRunningGear',
    trackMaterial: materials.track,
    wheelMaterial: materials.turret,
    trackCenterX: D.trackCenterX,
    trackWidth: D.trackWidth,
    beltLength: D.trackLength,
    beltHeight: D.trackHeight,
    centerY: D.trackCenterY,
    roadWheelRadius: D.roadWheelRadius,
    roadWheelCount: 5,
    roadWheelY: D.roadWheelY,
    roadWheelZStart: D.roadWheelZ[0],
    roadWheelSpacing: D.roadWheelZ[1] - D.roadWheelZ[0],
    sprocketRadius: 0.39,
    idlerRadius: 0.39,
    linkPitch: 0.15
  });
  refitTrackLinksToBlueprint(runningGear);
  for (const sprocket of runningGear.userData.trackParts.sprockets) {
    sprocket.position.y = 0.63;
    sprocket.position.z = 1.93;
  }
  for (const idler of runningGear.userData.trackParts.idlers) {
    idler.position.y = 0.63;
    idler.position.z = -1.84;
  }
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;
  runningGear.userData.calibrationDatums = {
    roadWheelZ: [...D.roadWheelZ],
    roadWheelY: D.roadWheelY,
    driveSprocketZ: 1.93,
    idlerZ: -1.84,
    quality: 'profile-derived; inferred'
  };
  tankGroup.userData.returnRollers = addReturnRollers(tankGroup, materials.turret);
  tankGroup.userData.leafSpringSuspension = addLeafSpringSuspension(tankGroup, materials.metal);

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(D.turretCenterX, D.turretRingY, D.turretCenterZ);
  const turret = addMesh(
    turretGroup,
    createTurretGeometry(TURRET_RINGS, 14, 'PanzerIICTurretGeometry'),
    materials.turret,
    'PanzerIIC_TurretShell',
    'core',
    {
      calibrationRole: 'left-offset-turret',
      stationCount: TURRET_RINGS.length
    }
  );

  const mantlet = addMesh(
    turretGroup,
    new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0.35, Math.PI * 0.65),
    materials.turret,
    'PanzerIIC_RoundedMantlet',
    'medium'
  );
  mantlet.scale.set(0.84, 1, 0.72);
  mantlet.rotation.x = Math.PI / 2;
  mantlet.position.set(-0.02, D.gunAxisY, 0.70);

  const hatch = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.22, 0.23, D.hatchHeight, 12),
    materials.turret,
    'PanzerIIC_LowCommanderHatch',
    'medium',
    { calibrationRole: 'height-datum' }
  );
  hatch.position.set(0.08, D.turretBodyHeight + D.hatchHeight * 0.5, 0.12);

  const barrelGeometry = new THREE.CylinderGeometry(
    0.024,
    0.038,
    D.gunExternalLength,
    10
  );
  barrelGeometry.rotateX(Math.PI / 2);
  const barrel = addMesh(
    turretGroup,
    barrelGeometry,
    materials.metal,
    'PanzerIIC_2cmKwK30Barrel',
    'core',
    {
      restZ: D.gunRootZ + D.gunExternalLength * 0.5,
      envelopeRole: 'weaponProjection',
      weaponIdentity: '2 cm KwK 30 L/55'
    }
  );
  barrel.position.set(
    0.02,
    D.gunAxisY,
    D.gunRootZ + D.gunExternalLength * 0.5
  );

  const muzzleCollar = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.045, 0.045, 0.10, 10),
    materials.metal,
    'PanzerIIC_MuzzleCollar',
    'high',
    { envelopeRole: 'weaponProjection' }
  );
  muzzleCollar.rotation.x = Math.PI / 2;
  muzzleCollar.position.set(0.02, D.gunAxisY, D.gunRootZ + D.gunExternalLength - 0.04);

  // Shared local-frame rule: vehicle-right is -X. The MG34 is right of the
  // cannon and its rendered barrel ends exactly at the enhancer-owned marker.
  const coax = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.014, 0.020, 0.52, 8),
    materials.metal,
    'coax_barrel',
    'high',
    {
      weaponMountId: 'coax',
      mountSide: 'right',
      envelopeRole: 'weaponProjection'
    }
  );
  coax.rotation.x = Math.PI / 2;
  coax.position.set(-0.12, 0.26, 0.64);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'PzII_Muzzle';
  muzzle.position.set(0.02, D.gunAxisY, D.gunRootZ + D.gunExternalLength);
  muzzle.userData = {
    calibrationRole: 'main-gun-muzzle',
    weaponIdentity: '2 cm KwK 30 L/55'
  };
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;
  tankGroup.userData.turretShell = turret;
  tankGroup.userData.hull = lowerHull;

  addDetailParts(tankGroup, upperHull, turretGroup, materials);
  const proxy = createProxyAssembly(tankGroup, materials);
  tankGroup.userData.proxyTurret = proxy.proxyTurret;
  tankGroup.userData.proxyBarrel = proxy.proxyBarrel;

  tankGroup.userData.modelMetadata = {
    designation: 'Panzerkampfwagen II Ausf. C',
    dimensionsMeters: { length: D.length, width: D.width, height: D.height },
    dimensionPolicy: 'rigid vehicle envelope; excludes weapon projection and flexible aerials',
    blueprintCalibration: BLUEPRINT_CALIBRATION,
    construction: 'welded stepped plate hull',
    runningGear: {
      type: 'five independent road wheels with quarter-elliptic leaf springs',
      roadWheelsPerSide: 5,
      returnRollersPerSide: 4
    },
    turretOffset: {
      axis: '+X vehicle-left',
      meters: D.turretCenterX
    },
    weapons: {
      main: '2 cm KwK 30 L/55',
      coaxial: '7.92 mm MG34'
    },
    features: [
      'five road wheels per side',
      'quarter-elliptic leaf springs',
      'stepped glacis and superstructure',
      'left-offset turret',
      '2 cm KwK 30 with right-side coaxial MG34',
      'three-man crew'
    ],
    lodLevels: ['high', 'medium', 'core', 'proxy'],
    calibrationVersion: 'panzer2-ausfc-side-profile-v1'
  };
  tankGroup.userData.calibrationDatums = {
    dimensions: { ...D },
    lowerHullStations: LOWER_HULL_STATIONS.map(station => ({ ...station })),
    upperHullStations: UPPER_HULL_STATIONS.map(station => ({ ...station })),
    turretRings: TURRET_RINGS.map(ring => ({ ...ring }))
  };

  return tankGroup;
}
