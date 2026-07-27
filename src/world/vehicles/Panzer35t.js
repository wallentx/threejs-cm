import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from './TrackedRunningGear.js';

const MODEL_ID = 'ger_panzer35t';

const DIMENSIONS = Object.freeze({
  length: 4.90,
  width: 2.06,
  height: 2.37
});

// Fixed side-elevation registration against George Bradford's four-view
// drawing. Pixel observations are recorded so later work can reproduce or
// replace this fit instead of accumulating unexplained visual offsets.
const BLUEPRINT_CALIBRATION = Object.freeze({
  version: 'panzer35t-registered-side-v1',
  source: {
    title: 'PzKpfw 35(t) four-view scale drawing',
    author: 'George R. Bradford',
    publishedYear: 1995,
    pageUrl: 'https://www.onwar.com/wwii/tanks/germany/ge049pz35p.html',
    imageUrl: 'https://www.onwar.com/wwii/tanks/germany/ge049pz35.jpg',
    imageSizePixels: [1200, 1500],
    provenance: 'published scale drawing; not an original factory blueprint'
  },
  corroboration: [
    {
      url: 'https://www.bundesarchiv.de/im-archiv-recherchieren/archivgut-recherchieren/nach-themen/technische-zeichnungen-militaerischer-herkunft-bis-1945/',
      use: 'German Federal Archives technical-drawing provenance guidance'
    },
    {
      url: 'https://modelist-konstruktor.com/bronekollekcziya/tank-firmy-shkoda',
      use: 'dimensions, 320 mm track width, 95 mm pitch, running gear, turret ring and gun data'
    }
  ],
  imageRegistration: {
    side: {
      cropPixels: { x: 205, y: 170, width: 810, height: 380 },
      mirrorX: false,
      vehicleFront: 'image-left',
      groundLinePixels: [[208, 535], [1013, 535]],
      rigidEnvelopePixels: { frontX: 225, rearX: 982, topY: 190, groundY: 535 }
    },
    top: {
      cropPixels: { x: 205, y: 585, width: 800, height: 390 },
      mirrorX: false,
      vehicleFront: 'image-left'
    },
    front: {
      cropPixels: { x: 205, y: 1030, width: 390, height: 365 },
      mirrorX: false
    }
  },
  exactDatums: {
    simulationRigidEnvelopeMeters: DIMENSIONS,
    publishedDimensionsMeters: { length: 4.90, width: 2.055, height: 2.37 },
    groundClearanceMeters: 0.35,
    trackWidthMeters: 0.32,
    trackPitchMeters: 0.095,
    turretRingDiameterMeters: 1.267,
    gunCaliberMeters: 0.0372,
    gunTubeLengthMeters: 1.448,
    roadWheelsPerSide: 8,
    returnRollersPerSide: 4,
    driveSprocket: 'rear'
  },
  inferredDatums: {
    sideAxlePixels: {
      frontIdler: [270, 443],
      roadWheels: [
        [379, 491], [442, 491],
        [511, 491], [572, 491],
        [667, 491], [730, 491],
        [802, 491], [860, 491]
      ],
      rearSprocket: [922, 443]
    },
    sideAxleZMeters: {
      frontIdler: 2.11,
      roadWheels: [1.46, 1.05, 0.60, 0.21, -0.40, -0.81, -1.28, -1.65],
      rearSprocket: -2.12
    },
    turretRingCenterMeters: [0, 1.53, 0.18],
    gunAxisMeters: [0.10, 1.82, 1.00],
    note: 'Mechanical centers inferred from registered published elevation; envelope and published dimensions remain exact.'
  },
  coordinatePolicy: '+Y up, +Z forward, -X vehicle right; weapon projection excluded from rigid envelope'
});

const ROAD_WHEEL_Z = Object.freeze([
  1.46, 1.05,
  0.60, 0.21,
  -0.40, -0.81,
  -1.28, -1.65
]);

const RETURN_ROLLER_Z = Object.freeze([1.18, 0.28, -0.66, -1.57]);

const LOWER_HULL_STATIONS = Object.freeze([
  { z: -2.42, floorHalf: 0.59, floorY: 0.58, sideHalf: 0.72, shoulderY: 0.88, deckHalf: 0.65, roofY: 1.02 },
  { z: -2.12, floorHalf: 0.72, floorY: 0.54, sideHalf: 0.84, shoulderY: 0.94, deckHalf: 0.76, roofY: 1.10 },
  { z: -1.45, floorHalf: 0.76, floorY: 0.53, sideHalf: 0.87, shoulderY: 0.97, deckHalf: 0.78, roofY: 1.12 },
  { z: 0.85, floorHalf: 0.76, floorY: 0.53, sideHalf: 0.87, shoulderY: 0.97, deckHalf: 0.78, roofY: 1.12 },
  { z: 1.62, floorHalf: 0.72, floorY: 0.55, sideHalf: 0.84, shoulderY: 0.96, deckHalf: 0.74, roofY: 1.18 },
  { z: 2.06, floorHalf: 0.65, floorY: 0.59, sideHalf: 0.76, shoulderY: 0.91, deckHalf: 0.63, roofY: 1.04 },
  { z: 2.42, floorHalf: 0.49, floorY: 0.65, sideHalf: 0.59, shoulderY: 0.83, deckHalf: 0.48, roofY: 0.91 }
]);

const FIGHTING_COMPARTMENT_STATIONS = Object.freeze([
  { z: -0.62, floorHalf: 0.70, floorY: 1.02, sideHalf: 0.76, shoulderY: 1.36, deckHalf: 0.68, roofY: 1.54 },
  { z: 0.92, floorHalf: 0.70, floorY: 1.02, sideHalf: 0.76, shoulderY: 1.36, deckHalf: 0.68, roofY: 1.54 },
  { z: 1.44, floorHalf: 0.66, floorY: 1.00, sideHalf: 0.72, shoulderY: 1.36, deckHalf: 0.62, roofY: 1.54 },
  { z: 1.68, floorHalf: 0.57, floorY: 0.97, sideHalf: 0.62, shoulderY: 1.28, deckHalf: 0.54, roofY: 1.48 }
]);

const ENGINE_DECK_STATIONS = Object.freeze([
  { z: -2.18, floorHalf: 0.64, floorY: 1.00, sideHalf: 0.72, shoulderY: 1.05, deckHalf: 0.64, roofY: 1.09 },
  { z: -1.82, floorHalf: 0.68, floorY: 1.01, sideHalf: 0.76, shoulderY: 1.17, deckHalf: 0.68, roofY: 1.30 },
  { z: -1.24, floorHalf: 0.70, floorY: 1.02, sideHalf: 0.76, shoulderY: 1.34, deckHalf: 0.68, roofY: 1.47 },
  { z: -0.62, floorHalf: 0.70, floorY: 1.02, sideHalf: 0.76, shoulderY: 1.38, deckHalf: 0.68, roofY: 1.53 }
]);

function signedVolume(positions, indices) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  for (let index = 0; index < indices.length; index += 3) {
    a.fromArray(positions, indices[index] * 3);
    b.fromArray(positions, indices[index + 1] * 3);
    c.fromArray(positions, indices[index + 2] * 3);
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume;
}

function orientOutward(positions, indices) {
  if (signedVolume(positions, indices) >= 0) return indices;
  const flipped = [...indices];
  for (let index = 0; index < flipped.length; index += 3) {
    [flipped[index + 1], flipped[index + 2]] = [flipped[index + 2], flipped[index + 1]];
  }
  return flipped;
}

function finalizeGeometry(positions, indices, name, metadata = {}) {
  const outwardIndices = orientOutward(positions, indices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(outwardIndices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = name;
  geometry.userData = {
    ...metadata,
    signedVolumeCubicMeters: signedVolume(positions, outwardIndices)
  };
  return geometry;
}

function createHullLoftGeometry(stations, name) {
  const positions = [];
  const indices = [];
  for (const station of stations) {
    positions.push(
      -station.floorHalf, station.floorY, station.z,
      -station.sideHalf, station.shoulderY, station.z,
      -station.deckHalf, station.roofY, station.z,
      station.deckHalf, station.roofY, station.z,
      station.sideHalf, station.shoulderY, station.z,
      station.floorHalf, station.floorY, station.z
    );
  }

  for (let station = 0; station < stations.length - 1; station++) {
    const current = station * 6;
    const next = current + 6;
    for (let edge = 0; edge < 6; edge++) {
      const a = current + edge;
      const b = current + ((edge + 1) % 6);
      const c = next + edge;
      const d = next + ((edge + 1) % 6);
      indices.push(a, c, b, b, c, d);
    }
  }

  indices.push(0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5);
  const front = (stations.length - 1) * 6;
  indices.push(
    front, front + 2, front + 1,
    front, front + 3, front + 2,
    front, front + 4, front + 3,
    front, front + 5, front + 4
  );

  return finalizeGeometry(positions, indices, name, {
    profileStations: stations.map(station => ({ ...station })),
    authoredHull: true,
    source: BLUEPRINT_CALIBRATION.source.imageUrl
  });
}

function createTurretGeometry() {
  const bottom = [
    [-0.50, -0.84],
    [-0.66, -0.28],
    [-0.66, 0.48],
    [-0.53, 0.82],
    [0.53, 0.82],
    [0.66, 0.48],
    [0.66, -0.28],
    [0.50, -0.84]
  ];
  const top = bottom.map(([x, z]) => [x * 0.84, z * 0.88]);
  const positions = [];
  const indices = [];
  for (const [x, z] of bottom) positions.push(x, 0, z);
  for (const [x, z] of top) positions.push(x, 0.60, z);
  const count = bottom.length;

  for (let edge = 0; edge < count; edge++) {
    const next = (edge + 1) % count;
    indices.push(edge, next, edge + count, next, next + count, edge + count);
  }
  for (let triangle = 1; triangle < count - 1; triangle++) {
    indices.push(0, triangle + 1, triangle);
    indices.push(count, count + triangle, count + triangle + 1);
  }
  return finalizeGeometry(positions, indices, 'Panzer35t_PolygonalTurret', {
    ringDiameterMeters: BLUEPRINT_CALIBRATION.exactDatums.turretRingDiameterMeters,
    source: BLUEPRINT_CALIBRATION.source.imageUrl
  });
}

function mesh(geometry, material, name, band, parent, {
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  envelopeRole = null
} = {}) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.userData.lodBand = band;
  if (envelopeRole) object.userData.envelopeRole = envelopeRole;
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function addRivetLine(parent, material, {
  name,
  from,
  to,
  count,
  band = 'high',
  radius = 0.023
}) {
  const geometry = new THREE.SphereGeometry(radius, 5, 4);
  const rivets = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  for (let index = 0; index < count; index++) {
    const t = count === 1 ? 0.5 : index / (count - 1);
    position.set(
      THREE.MathUtils.lerp(from[0], to[0], t),
      THREE.MathUtils.lerp(from[1], to[1], t),
      THREE.MathUtils.lerp(from[2], to[2], t)
    );
    matrix.makeTranslation(position.x, position.y, position.z);
    rivets.setMatrixAt(index, matrix);
  }
  rivets.instanceMatrix.needsUpdate = true;
  rivets.name = name;
  rivets.userData.lodBand = band;
  rivets.userData.surfaceRole = 'riveted-armor-fasteners';
  rivets.castShadow = true;
  parent.add(rivets);
  return rivets;
}

function repositionRunningGear(runningGear) {
  const { roadWheels, sprockets, idlers } = runningGear.userData.trackParts;
  for (let side = 0; side < 2; side++) {
    for (let index = 0; index < ROAD_WHEEL_Z.length; index++) {
      roadWheels[side * ROAD_WHEEL_Z.length + index].position.z = ROAD_WHEEL_Z[index];
    }
    sprockets[side].position.z = -2.12;
    idlers[side].position.z = 2.11;
  }
  runningGear.userData.blueprintAxleZ = {
    roadWheels: [...ROAD_WHEEL_Z],
    rearSprocket: -2.12,
    frontIdler: 2.11
  };
}

function repositionProxyWheels(proxy) {
  const wheels = proxy.getObjectByName('ProxyRoadWheels');
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, Math.PI / 2)
  );
  const scale = new THREE.Vector3(1, 1, 1);
  let instance = 0;
  for (const side of [-1, 1]) {
    for (const z of ROAD_WHEEL_Z) {
      matrix.compose(new THREE.Vector3(side * 0.88, 0.31, z), quaternion, scale);
      wheels.setMatrixAt(instance++, matrix);
    }
  }
  wheels.instanceMatrix.needsUpdate = true;
  wheels.userData.blueprintAxleZ = [...ROAD_WHEEL_Z];
}

function addBogieSuspension(parent, bodyMaterial, metalMaterial) {
  const twinCenters = [
    (ROAD_WHEEL_Z[0] + ROAD_WHEEL_Z[1]) * 0.5,
    (ROAD_WHEEL_Z[2] + ROAD_WHEEL_Z[3]) * 0.5,
    (ROAD_WHEEL_Z[4] + ROAD_WHEEL_Z[5]) * 0.5,
    (ROAD_WHEEL_Z[6] + ROAD_WHEEL_Z[7]) * 0.5
  ];

  for (const side of [-1, 1]) {
    for (let index = 0; index < twinCenters.length; index++) {
      const z = twinCenters[index];
      mesh(
        new THREE.BoxGeometry(0.08, 0.40, 0.14),
        bodyMaterial,
        `${side < 0 ? 'Right' : 'Left'}TwinBogie_${index + 1}`,
        'medium',
        parent,
        { position: [side * 0.91, 0.57, z], rotation: [side * 0.08, 0, 0] }
      );
      mesh(
        new THREE.BoxGeometry(0.10, 0.08, 0.52),
        metalMaterial,
        `${side < 0 ? 'Right' : 'Left'}BogieBeam_${index + 1}`,
        'high',
        parent,
        { position: [side * 0.93, 0.39, z] }
      );
    }

    for (let set = 0; set < 2; set++) {
      const first = set * 2;
      const z = (twinCenters[first] + twinCenters[first + 1]) * 0.5;
      for (let leaf = 0; leaf < 4; leaf++) {
        mesh(
          new THREE.BoxGeometry(0.055, 0.025, 1.12 - leaf * 0.10),
          metalMaterial,
          `${side < 0 ? 'Right' : 'Left'}LeafSpring_${set + 1}_${leaf + 1}`,
          'high',
          parent,
          { position: [side * 0.94, 0.73 + leaf * 0.026, z] }
        );
      }
    }

    for (let index = 0; index < RETURN_ROLLER_Z.length; index++) {
      mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 0.13, 10),
        bodyMaterial,
        `${side < 0 ? 'Right' : 'Left'}ReturnRoller_${index + 1}`,
        'medium',
        parent,
        {
          position: [side * 0.89, 0.92, RETURN_ROLLER_Z[index]],
          rotation: [0, 0, Math.PI / 2]
        }
      );
    }
  }
}

function cloneProxyPart(source, name, proxyGroup) {
  const proxy = new THREE.Mesh(source.geometry.clone(), source.material);
  proxy.name = name;
  proxy.position.copy(source.position);
  proxy.quaternion.copy(source.quaternion);
  proxy.scale.copy(source.scale);
  proxy.userData.lodBand = 'proxy';
  proxy.userData.proxySource = source.name;
  proxy.visible = false;
  proxy.castShadow = true;
  proxy.receiveShadow = true;
  proxyGroup.add(proxy);
  return proxy;
}

export function createPanzer35tMesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = MODEL_ID;

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#3d4447',
    roughness: 0.78,
    metalness: 0.14
  }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#42494c',
    roughness: 0.76,
    metalness: 0.14
  }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#1a1d20',
    roughness: 0.91,
    metalness: 0.30
  }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#111416',
    metalness: 0.72,
    roughness: 0.42
  }), 'metal');

  const lowerHull = mesh(
    createHullLoftGeometry(LOWER_HULL_STATIONS, 'Panzer35t_LowerHullGeometry'),
    bodyMat,
    'Panzer35t_PrimaryHull',
    'core',
    tankGroup
  );
  lowerHull.userData.authoredHull = true;

  const fightingCompartment = mesh(
    createHullLoftGeometry(
      FIGHTING_COMPARTMENT_STATIONS,
      'Panzer35t_FightingCompartmentGeometry'
    ),
    bodyMat,
    'Panzer35t_FightingCompartment',
    'core',
    tankGroup
  );
  const engineDeck = mesh(
    createHullLoftGeometry(ENGINE_DECK_STATIONS, 'Panzer35t_EngineDeckGeometry'),
    bodyMat,
    'Panzer35t_EngineDeck',
    'core',
    tankGroup
  );

  // Exact 2.06 x 4.90 rigid datum. Thin fenders own the published plan-view
  // envelope while the armored hull remains visibly narrower.
  const fenders = [];
  for (const side of [-1, 1]) {
    fenders.push(mesh(
      new THREE.BoxGeometry(0.27, 0.055, DIMENSIONS.length),
      bodyMat,
      `${side < 0 ? 'Right' : 'Left'}TrackFender`,
      'core',
      tankGroup,
      { position: [side * 0.895, 1.075, 0] }
    ));
  }

  const runningGear = createTrackedRunningGear({
    id: 'Panzer35tRunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: 0.8636,
    trackWidth: 0.32,
    beltLength: 4.58,
    beltHeight: 1.0,
    centerY: 0.58,
    roadWheelRadius: 0.20,
    roadWheelCount: 8,
    roadWheelY: 0.31,
    roadWheelZStart: ROAD_WHEEL_Z[0],
    roadWheelSpacing: 0.48,
    sprocketRadius: 0.31,
    idlerRadius: 0.29,
    linkPitch: 0.095
  });
  repositionRunningGear(runningGear);
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;
  addBogieSuspension(tankGroup, turretMat, metalMat);

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, 1.52, 0.18);
  tankGroup.add(turretGroup);

  const turret = mesh(
    createTurretGeometry(),
    turretMat,
    'Panzer35t_RivetedTurret',
    'core',
    turretGroup
  );

  const mantlet = mesh(
    new THREE.CylinderGeometry(0.19, 0.22, 0.12, 12),
    turretMat,
    'Panzer35t_MainMantlet',
    'medium',
    turretGroup,
    { position: [0.10, 0.30, 0.84], rotation: [Math.PI / 2, 0, 0] }
  );
  mantlet.userData.articulatedPart = 'gun-mantlet';

  const barrelLength = 0.82;
  const barrel = mesh(
    new THREE.CylinderGeometry(0.025, 0.040, barrelLength, 10),
    metalMat,
    'Panzer35t_37mmBarrel',
    'core',
    turretGroup,
    {
      position: [0.10, 0.30, 0.84 + barrelLength * 0.5],
      rotation: [Math.PI / 2, 0, 0],
      envelopeRole: 'weaponProjection'
    }
  );
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.weaponMountId = 'main';
  barrel.userData.externalLengthMeters = barrelLength;
  barrel.userData.historicalTubeLengthMeters = 1.448;

  mesh(
    new THREE.CylinderGeometry(0.055, 0.07, 0.51, 9),
    turretMat,
    'Panzer35t_RecoilCylinder',
    'medium',
    turretGroup,
    {
      position: [0.10, 0.43, 1.095],
      rotation: [Math.PI / 2, 0, 0],
      envelopeRole: 'weaponProjection'
    }
  );
  const muzzleBrake = mesh(
    new THREE.CylinderGeometry(0.046, 0.046, 0.12, 8),
    metalMat,
    'Panzer35t_PepperpotMuzzleBrake',
    'high',
    turretGroup,
    {
      position: [0.10, 0.30, 1.69],
      rotation: [Math.PI / 2, 0, 0],
      envelopeRole: 'weaponProjection'
    }
  );
  muzzleBrake.userData.surfaceRole = 'perforated-muzzle-brake';

  const muzzle = new THREE.Object3D();
  muzzle.name = 'Pz35t_Muzzle';
  muzzle.position.set(0.10, 0.30, 1.75);
  muzzle.userData.forwardAxis = '+Z';
  turretGroup.add(muzzle);

  const coaxBall = mesh(
    new THREE.SphereGeometry(0.105, 10, 7),
    turretMat,
    'Panzer35t_CoaxBallMount',
    'medium',
    turretGroup,
    { position: [-0.22, 0.30, 0.63] }
  );
  coaxBall.userData.weaponMountId = 'coax';
  coaxBall.userData.mountSide = 'right';

  const cupola = mesh(
    new THREE.CylinderGeometry(0.255, 0.285, 0.18, 12),
    turretMat,
    'Panzer35t_CommanderCupola',
    'medium',
    turretGroup,
    { position: [0.08, 0.70, -0.12] }
  );
  cupola.userData.diameterMeters = 0.57;
  const hatch = mesh(
    new THREE.CylinderGeometry(0.245, 0.245, 0.05, 12),
    turretMat,
    'Panzer35t_CupolaHatch',
    'high',
    turretGroup,
    { position: [0.08, 0.825, -0.12] }
  );
  hatch.userData.envelopeDatum = 'published-height-2.37m';

  const driverVisor = mesh(
    new THREE.BoxGeometry(0.39, 0.09, 0.055),
    turretMat,
    'Panzer35t_DriverVisor',
    'high',
    tankGroup,
    { position: [-0.34, 1.37, 1.47] }
  );
  driverVisor.userData.historicalApertureMeters = [0.39, 0.09];
  const radioVisor = mesh(
    new THREE.BoxGeometry(0.15, 0.075, 0.052),
    turretMat,
    'Panzer35t_RadioOperatorVisor',
    'high',
    tankGroup,
    { position: [0.38, 1.37, 1.47] }
  );
  radioVisor.userData.historicalApertureMeters = [0.15, 0.075];

  const hullMgBall = mesh(
    new THREE.SphereGeometry(0.115, 10, 7),
    turretMat,
    'Panzer35t_HullMGBallMount',
    'medium',
    tankGroup,
    { position: [-0.42, 1.42, 1.58] }
  );
  hullMgBall.userData.weaponMountId = 'hull_mg';
  hullMgBall.userData.mountSide = 'right';

  for (const side of [-1, 1]) {
    mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.09, 8),
      metalMat,
      `${side < 0 ? 'Right' : 'Left'}Headlamp`,
      'high',
      tankGroup,
      {
        position: [side * 0.61, 1.18, 2.06],
        rotation: [Math.PI / 2, 0, 0]
      }
    );
  }

  // Engine meshes follow the measured deck slope instead of floating over it.
  for (let index = 0; index < 8; index++) {
    const z = -1.82 + index * 0.14;
    const y = 1.37 + (z + 1.82) * 0.18;
    mesh(
      new THREE.BoxGeometry(1.04, 0.025, 0.055),
      metalMat,
      `Panzer35t_EngineLouvre_${index + 1}`,
      'high',
      tankGroup,
      { position: [0, y, z], rotation: [-0.18, 0, 0] }
    );
  }

  addRivetLine(tankGroup, metalMat, {
    name: 'Panzer35t_LeftHullRivets',
    from: [0.77, 1.36, -0.52],
    to: [0.77, 1.36, 1.40],
    count: 12
  });
  addRivetLine(tankGroup, metalMat, {
    name: 'Panzer35t_RightHullRivets',
    from: [-0.77, 1.36, -0.52],
    to: [-0.77, 1.36, 1.40],
    count: 12
  });
  addRivetLine(turretGroup, metalMat, {
    name: 'Panzer35t_TurretFrontRivets',
    from: [-0.47, 0.50, 0.61],
    to: [0.47, 0.50, 0.61],
    count: 9,
    radius: 0.020
  });

  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  cloneProxyPart(lowerHull, 'Panzer35t_ProxyLowerHull', proxyGroup);
  cloneProxyPart(fightingCompartment, 'Panzer35t_ProxyFightingHull', proxyGroup);
  cloneProxyPart(engineDeck, 'Panzer35t_ProxyEngineHull', proxyGroup);
  for (const [index, fender] of fenders.entries()) {
    cloneProxyPart(fender, `Panzer35t_ProxyFender_${index + 1}`, proxyGroup);
  }

  const proxyRunningGear = createTrackedRunningGearProxy({
    id: 'Panzer35tProxyRunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: 0.8636,
    trackWidth: 0.32,
    beltLength: 4.58,
    beltHeight: 1.0,
    centerY: 0.58,
    roadWheelRadius: 0.20,
    roadWheelCount: 8
  });
  repositionProxyWheels(proxyRunningGear);
  proxyGroup.add(proxyRunningGear);
  tankGroup.add(proxyGroup);

  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;
  tankGroup.userData.authoredHull = lowerHull;
  tankGroup.userData.modelMetadata = {
    designation: 'Panzerkampfwagen 35(t)',
    dimensionsMeters: DIMENSIONS,
    blueprintCalibration: BLUEPRINT_CALIBRATION,
    blueprintFit: {
      views: ['side', 'top', 'front'],
      primaryFitView: 'side',
      rigidEnvelope: 'exact',
      landmarkFit: 'registered published drawing; mechanical centers inferred'
    },
    features: [
      '3.7 cm KwK 34(t) with armored recoil cylinder',
      'eight road wheels in four twin bogies per side',
      'rear drive sprocket and front idler',
      'four return rollers per side',
      'narrow riveted hull',
      'forward polygonal turret',
      'sloped rear engine deck',
      'right-side coaxial and hull machine guns'
    ]
  };

  return tankGroup;
}
