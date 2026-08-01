import * as THREE from 'three';
import { lateralX } from '../LocalFrame.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from './TrackedRunningGear.js';
import { CHAR_B1_BIS_VISUAL_DATA } from '../../content/france1940/vehicleData/CharB1BisVisualData.js';

const B1 = CHAR_B1_BIS_VISUAL_DATA;
const HULL_STATIONS = B1.geometry.hullStations;
const UPPER_HULL_STATIONS = B1.geometry.upperHullStations;
const ENGINE_COVER_STATIONS = B1.geometry.engineCoverStations;
const TURRET_RINGS = B1.geometry.turret.rings;
const TURRET = B1.geometry.turret;
const RUNNING_GEAR = B1.geometry.runningGear;
const DIMENSIONS = B1.dimensionsMeters;

export const CHAR_B1_BIS_BLUEPRINT_CALIBRATION = Object.freeze({
  ...B1.calibration,
  sources: B1.sources
});

const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchC = new THREE.Vector3();

function finalizeClosedGeometry(geometry) {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  let signedVolume = 0;
  for (let offset = 0; offset < indices.count; offset += 3) {
    scratchA.fromBufferAttribute(positions, indices.getX(offset));
    scratchB.fromBufferAttribute(positions, indices.getX(offset + 1));
    scratchC.fromBufferAttribute(positions, indices.getX(offset + 2));
    signedVolume += scratchA.dot(scratchB.clone().cross(scratchC)) / 6;
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.outwardWindingAudited = true;
  geometry.userData.signedVolume = signedVolume;
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
    indices.push(rearCenter, ring, following);
    indices.push(frontCenter, frontStart + following, frontStart + ring);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = name;
  geometry.userData.stationCount = stations.length;
  geometry.userData.capNormals = Object.freeze({
    rear: Object.freeze([0, 0, -1]),
    front: Object.freeze([0, 0, 1])
  });
  return finalizeClosedGeometry(geometry);
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
        start + segment, next + following, next + segment,
        start + segment, start + following, next + following
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
  geometry.userData.capNormals = Object.freeze({
    bottom: Object.freeze([0, -1, 0]),
    top: Object.freeze([0, 1, 0])
  });
  return finalizeClosedGeometry(geometry);
}

function createOutlineExtrusionGeometry(outline, depth, name) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const halfDepth = depth * 0.5;
  for (const z of [-halfDepth, halfDepth]) {
    outline.forEach(([x, y]) => {
      positions.push(x, y, z);
      uvs.push(x + 0.5, y + 0.5);
    });
  }
  const ringSize = outline.length;
  for (let index = 0; index < ringSize; index++) {
    const following = (index + 1) % ringSize;
    indices.push(
      index, ringSize + index, ringSize + following,
      index, ringSize + following, following
    );
  }
  const rearCenter = positions.length / 3;
  positions.push(0, 0, -halfDepth);
  uvs.push(0.5, 0.5);
  const frontCenter = positions.length / 3;
  positions.push(0, 0, halfDepth);
  uvs.push(0.5, 0.5);
  for (let index = 0; index < ringSize; index++) {
    const following = (index + 1) % ringSize;
    indices.push(rearCenter, index, following);
    indices.push(frontCenter, ringSize + following, ringSize + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = name;
  geometry.userData.sourceOutline = outline;
  geometry.userData.capNormals = Object.freeze({
    rear: Object.freeze([0, 0, -1]),
    front: Object.freeze([0, 0, 1])
  });
  return finalizeClosedGeometry(geometry);
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
  const driver = B1.geometry.driver;
  const driverHood = makeMesh(
    'CharB1Bis_LeftDriverHood',
    createStationLoft(driver.hoodStations, hullRing, 'CharB1BisDriverHoodLoft'),
    bodyMat,
    'core',
    tankGroup
  );
  driverHood.position.x = driver.centerX;
  driverHood.userData.semanticSide = 'left';
  driverHood.userData.surfaceRole = 'driver-hood';

  const visor = makeMesh(
    'CharB1Bis_DriverVisor',
    createOutlineExtrusionGeometry(
      driver.visor.outline,
      driver.visor.depth,
      'CharB1BisDriverVisorPlate'
    ),
    metalMat,
    'medium',
    tankGroup
  );
  visor.position.fromArray(driver.visor.center);
  visor.rotation.x = -0.12;
  visor.userData.semanticSide = 'left';
  visor.userData.surfaceRole = 'seated-driver-visor';
  visor.userData.evidenceQuality = driver.visor.evidenceQuality;

  const hullGun = B1.geometry.hullGun;
  const mantlet = makeMesh(
    'CharB1Bis_75mmMantlet',
    createOutlineExtrusionGeometry(
      hullGun.collarOutline,
      hullGun.collarDepth,
      'CharB1Bis75mmIrregularCollar'
    ),
    bodyMat,
    'core',
    tankGroup
  );
  mantlet.position.set(hullGun.axis[0], hullGun.axis[1], hullGun.collarCenterZ);
  mantlet.userData.mountSide = 'right';
  mantlet.userData.surfaceRole = 'hull-gun-mantlet';
  mantlet.userData.evidenceQuality = hullGun.evidenceQuality;
  mantlet.userData.outlineKind = 'irregular-photo-constrained';

  const hullGunRearZ = 2.96;
  const hullGunLength = hullGun.muzzleZ - hullGunRearZ;
  const hullGunBarrel = addCylinderBarrel({
    name: 'CharB1_75mm_HullGun',
    radiusFront: 0.075,
    radiusRear: 0.105,
    length: hullGunLength,
    center: new THREE.Vector3(
      hullGun.axis[0],
      hullGun.axis[1],
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
  hullMuzzle.position.set(hullGun.axis[0], hullGun.axis[1], hullGun.muzzleZ);
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
    trackCenterX: RUNNING_GEAR.trackCenterX,
    trackWidth: RUNNING_GEAR.trackWidth,
    beltLength: RUNNING_GEAR.fallbackEnvelope.beltLength,
    beltHeight: RUNNING_GEAR.fallbackEnvelope.beltHeight,
    centerY: RUNNING_GEAR.fallbackEnvelope.centerY,
    roadWheelRadius: 0.15,
    roadWheelCount: RUNNING_GEAR.trackPath.roadWheels.length,
    linkPitch: RUNNING_GEAR.linkPitch * 1.9,
    trackPath: RUNNING_GEAR.trackPath
  });
  tracks.position.y = RUNNING_GEAR.assemblyGroundOffset.y;
  tracks.userData.supportIds = Object.freeze([
    RUNNING_GEAR.trackPath.driveSprocket.id,
    RUNNING_GEAR.trackPath.idlerWheel.id,
    ...RUNNING_GEAR.trackPath.roadWheels.map(wheel => wheel.id),
    ...RUNNING_GEAR.trackPath.returnRollers.map(wheel => wheel.id)
  ]);
  proxy.add(tracks);

  for (const support of [
    RUNNING_GEAR.trackPath.driveSprocket,
    RUNNING_GEAR.trackPath.idlerWheel
  ]) {
    for (const side of [-1, 1]) {
      const wheel = makeMesh(
        support.kind === 'driveSprocket'
          ? `CharB1Bis_Proxy${side < 0 ? 'Right' : 'Left'}RearDriveSprocket`
          : `CharB1Bis_Proxy${side < 0 ? 'Right' : 'Left'}FrontIdlerWheel`,
        new THREE.CylinderGeometry(support.radius, support.radius, RUNNING_GEAR.trackWidth * 0.68, 8),
        turretMat,
        'proxy',
        proxy
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(
        side * RUNNING_GEAR.trackCenterX,
        support.centerY + RUNNING_GEAR.assemblyGroundOffset.y,
        support.centerZ
      );
      wheel.userData.supportId = support.id;
      wheel.visible = false;
    }
  }

  const turret = makeMesh(
    'CharB1Bis_ProxyAPX4Turret',
    createTurretGeometry([TURRET_RINGS[0], TURRET_RINGS[2], TURRET_RINGS[4]], 10),
    turretMat,
    'proxy',
    proxy
  );
  turret.position.set(0, TURRET.ringY, TURRET.centerZ);
  turret.visible = false;

  const cupola = makeMesh(
    'CharB1Bis_ProxyCupola',
    new THREE.CylinderGeometry(0.27, 0.30, 0.24, 8),
    turretMat,
    'proxy',
    proxy
  );
  cupola.position.set(0, TURRET.ringY + 0.755, TURRET.centerZ - 0.12);
  cupola.visible = false;
  const hatch = makeMesh(
    'CharB1Bis_ProxyCupolaHatch',
    new THREE.CylinderGeometry(0.25, 0.25, 0.03, 8),
    turretMat,
    'proxy',
    proxy
  );
  hatch.position.set(0, TURRET.ringY + 0.895, TURRET.centerZ - 0.12);
  hatch.visible = false;

  const barrelLength = TURRET.gunMuzzleLocalZ - 0.70;
  const barrel = addCylinderBarrel({
    name: 'CharB1Bis_Proxy47mmBarrel',
    radiusFront: 0.045,
    radiusRear: 0.065,
    length: barrelLength,
    center: new THREE.Vector3(
      0,
      TURRET.ringY + TURRET.gunAxisLocalY,
      TURRET.centerZ + 0.70 + barrelLength / 2
    ),
    material: metalMat,
    lodBand: 'proxy',
    parent: proxy
  });
  barrel.visible = false;

  const proxyDriver = makeMesh(
    'CharB1Bis_ProxyDriverProjection',
    createStationLoft(B1.geometry.driver.hoodStations, hullRing, 'CharB1BisProxyDriverLoft'),
    bodyMat,
    'proxy',
    proxy
  );
  proxyDriver.position.x = B1.geometry.driver.centerX;
  proxyDriver.visible = false;
  const proxyHullGun = makeMesh(
    'CharB1Bis_Proxy75mmCollar',
    createOutlineExtrusionGeometry(
      B1.geometry.hullGun.collarOutline,
      B1.geometry.hullGun.collarDepth,
      'CharB1BisProxy75mmIrregularCollar'
    ),
    bodyMat,
    'proxy',
    proxy
  );
  proxyHullGun.position.set(
    B1.geometry.hullGun.axis[0],
    B1.geometry.hullGun.axis[1],
    B1.geometry.hullGun.collarCenterZ
  );
  proxyHullGun.visible = false;
  const proxyHullBarrelLength = B1.geometry.hullGun.muzzleZ - 2.96;
  const proxyHullBarrel = addCylinderBarrel({
    name: 'CharB1Bis_Proxy75mmBarrel',
    radiusFront: 0.075,
    radiusRear: 0.105,
    length: proxyHullBarrelLength,
    center: new THREE.Vector3(
      B1.geometry.hullGun.axis[0],
      B1.geometry.hullGun.axis[1],
      2.96 + proxyHullBarrelLength * 0.5
    ),
    material: metalMat,
    lodBand: 'proxy',
    parent: proxy
  });
  proxyHullBarrel.visible = false;
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
  hull.userData.profileSource = B1.evidenceStatus;

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
  upperHull.userData.profileSource = B1.evidenceStatus;

  const engineCover = makeMesh(
    'CharB1Bis_RaisedEngineCover',
    createStationLoft(ENGINE_COVER_STATIONS, hullRing, 'CharB1BisEngineCoverStationLoft'),
    bodyMat,
    'core',
    tankGroup
  );
  engineCover.userData.surfaceRole = 'sloped-rear-engine-cover';
  engineCover.userData.profileStationCount = ENGINE_COVER_STATIONS.length;
  engineCover.userData.profileSource = B1.evidenceStatus;

  const runningGear = createTrackedRunningGear({
    id: 'CharB1BisRunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: RUNNING_GEAR.trackCenterX,
    trackWidth: RUNNING_GEAR.trackWidth,
    beltLength: RUNNING_GEAR.fallbackEnvelope.beltLength,
    beltHeight: RUNNING_GEAR.fallbackEnvelope.beltHeight,
    centerY: RUNNING_GEAR.fallbackEnvelope.centerY,
    roadWheelRadius: 0.15,
    roadWheelCount: RUNNING_GEAR.trackPath.roadWheels.length,
    roadWheelY: 0.37,
    roadWheelZStart: RUNNING_GEAR.trackPath.roadWheels[0].centerZ,
    roadWheelSpacing: 0.23,
    sprocketRadius: RUNNING_GEAR.trackPath.driveSprocket.radius,
    idlerRadius: RUNNING_GEAR.trackPath.idlerWheel.radius,
    linkPitch: RUNNING_GEAR.linkPitch,
    trackPath: RUNNING_GEAR.trackPath
  });
  runningGear.position.y = RUNNING_GEAR.assemblyGroundOffset.y;
  runningGear.userData.driveLocation = 'rear';
  runningGear.userData.wheelLayout = 'three four-wheel bogies (compound) plus three forward independent wheels and one rear tension wheel per side';
  runningGear.userData.supportIds = Object.freeze([
    RUNNING_GEAR.trackPath.driveSprocket.id,
    RUNNING_GEAR.trackPath.idlerWheel.id,
    ...RUNNING_GEAR.trackPath.roadWheels.map(wheel => wheel.id),
    ...RUNNING_GEAR.trackPath.returnRollers.map(wheel => wheel.id)
  ]);
  runningGear.userData.trackParts.roadWheels.forEach((wheel, index) => {
    const support = RUNNING_GEAR.trackPath.roadWheels[
      index % RUNNING_GEAR.trackPath.roadWheels.length
    ];
    wheel.userData.supportId = support.id;
    wheel.userData.suspensionGroup = support.group;
    wheel.userData.supportKind = support.kind;
    wheel.userData.evidenceQuality = support.evidenceQuality;
  });
  runningGear.userData.trackParts.sprockets.forEach(wheel => {
    wheel.userData.supportId = RUNNING_GEAR.trackPath.driveSprocket.id;
  });
  runningGear.userData.trackParts.idlers.forEach(wheel => {
    wheel.userData.supportId = RUNNING_GEAR.trackPath.idlerWheel.id;
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  addSideDetails(tankGroup, bodyMat, metalMat);
  addDriverAndHullArmament(tankGroup, bodyMat, metalMat);

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, TURRET.ringY, TURRET.centerZ);
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
    new THREE.CylinderGeometry(0.275, 0.31, 0.24, 8),
    turretMat,
    'core',
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
  mantlet.position.set(0, TURRET.gunAxisLocalY, 0.70);

  const barrelLength = TURRET.gunMuzzleLocalZ - 0.70;
  const barrel = addCylinderBarrel({
    name: 'CharB1Bis_47mm_SA35',
    radiusFront: 0.045,
    radiusRear: 0.067,
    length: barrelLength,
    center: new THREE.Vector3(
      0,
      TURRET.gunAxisLocalY,
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

  const coaxMuzzle = new THREE.Object3D();
  coaxMuzzle.name = 'CharB1_Coax_Muzzle';
  coaxMuzzle.position.set(lateralX('right', 0.18), 0.34, 1.30);
  coaxMuzzle.userData.weaponMountId = 'coax';
  coaxMuzzle.userData.mountSide = 'right';
  turretGroup.add(coaxMuzzle);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'CharB1_47mm_Muzzle';
  muzzle.position.set(0, TURRET.gunAxisLocalY, TURRET.gunMuzzleLocalZ);
  muzzle.userData.weaponMountId = 'main';
  muzzle.userData.mountSide = 'center';
  turretGroup.add(muzzle);

  turretGroup.userData.deckContact = {
    hullName: hull.name,
    maxGapMeters: 0.04
  };
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;
  tankGroup.userData.weaponMuzzles = Object.freeze({
    coax: coaxMuzzle,
    hull: tankGroup.userData.hullMuzzle
  });

  addProxySilhouette(tankGroup, bodyMat, turretMat, trackMat, metalMat);

  tankGroup.userData.modelMetadata = {
    designation: 'Char B1 bis',
    dimensionsMeters: {
      length: DIMENSIONS.length,
      width: DIMENSIONS.width,
      height: DIMENSIONS.height
    },
    calibration: CHAR_B1_BIS_BLUEPRINT_CALIBRATION,
    visualData: B1,
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
