import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from './TrackedRunningGear.js';

const AMC35_DIMENSIONS = Object.freeze({
  length: 4.55,
  width: 2.24,
  height: 2.30
});

const BLUEPRINT_URL = 'https://commons.wikimedia.org/wiki/File:Renault_Type_ACG_1%2C_AMC_35_-_Mick_Bell.png';
const MUSEUM_URL = 'https://museedesblindes.fr/les_chars/amc-35/';

// Rigid dimensions use the assigned historical envelope. Longitudinal and
// vertical stations below are registered to the Mick Bell 1/76 side elevation.
// The scan was scaled between the rigid hull endpoints and ground/top datums;
// component coordinates are therefore drawing-inferred, not claimed factory
// dimensions.
const AMC35_BLUEPRINT = Object.freeze({
  source: Object.freeze({
    title: 'Renault Type ACG 1, AMC 35 - Mick Bell (1/76 line drawing)',
    url: BLUEPRINT_URL,
    author: 'M. C. Bell',
    date: '1980-04-26',
    license: 'CC BY 4.0',
    quality: 'scale-drawing-inferred'
  }),
  museumSource: Object.freeze({
    title: 'AMC 35 - Musée des Blindés',
    url: MUSEUM_URL,
    confirms: Object.freeze([
      'two-man turret',
      '47 mm cannon',
      '7.5 mm machine gun'
    ])
  }),
  drawingRegistration: Object.freeze({
    imagePixels: Object.freeze({ width: 5100, height: 7014 }),
    sideCropPixels: Object.freeze({ left: 692, top: 656, right: 2441, bottom: 1512 }),
    frontCropPixels: Object.freeze({ left: 2987, top: 692, right: 3989, bottom: 1494 }),
    topCropPixels: Object.freeze({ left: 801, top: 1730, right: 2331, bottom: 2459 }),
    sideFacing: '-imageX maps to +Z',
    groundLinePixelY: 1457,
    rigidFrontPixelX: 907,
    rigidRearPixelX: 2306
  }),
  datumsMeters: Object.freeze({
    groundY: Object.freeze({ value: 0, quality: 'historical-envelope' }),
    frontSprocket: Object.freeze({ x: 0, y: 0.66, z: 1.77, quality: 'drawing-inferred' }),
    rearIdler: Object.freeze({ x: 0, y: 0.58, z: -1.72, quality: 'drawing-inferred' }),
    roadWheelCentersZ: Object.freeze({
      value: Object.freeze([1.15, 0.58, -0.08, -0.70, -1.35]),
      quality: 'drawing-inferred'
    }),
    trackGroundY: Object.freeze({ value: 0, quality: 'drawing-inferred' }),
    hullDeckY: Object.freeze({ value: 1.60, quality: 'drawing-inferred' }),
    turretRing: Object.freeze({ x: 0, y: 1.60, z: -0.10, quality: 'drawing-inferred' }),
    gunAxis: Object.freeze({ x: -0.10, y: 1.86, z: 0.65, quality: 'drawing-inferred' }),
    muzzle: Object.freeze({ x: -0.10, y: 1.86, z: 1.23, quality: 'drawing-inferred' })
  })
});

const LOWER_HULL_STATIONS = Object.freeze([
  { id: 'rear-tip', z: -2.275, width: 1.76, deckWidth: 1.48, bottomY: 0.45, shoulderY: 0.82, topY: 1.08 },
  { id: 'rear-slope', z: -1.93, width: 2.08, deckWidth: 1.90, bottomY: 0.38, shoulderY: 0.69, topY: 1.10 },
  { id: 'rear-bay', z: -1.52, width: 2.10, deckWidth: 1.94, bottomY: 0.38, shoulderY: 0.66, topY: 1.08 },
  { id: 'center', z: -0.08, width: 2.10, deckWidth: 1.94, bottomY: 0.38, shoulderY: 0.67, topY: 1.08 },
  { id: 'front-bay', z: 1.48, width: 2.08, deckWidth: 1.90, bottomY: 0.38, shoulderY: 0.66, topY: 1.08 },
  { id: 'nose-slope', z: 1.93, width: 1.92, deckWidth: 1.64, bottomY: 0.40, shoulderY: 0.79, topY: 1.12 },
  { id: 'nose-tip', z: 2.275, width: 1.54, deckWidth: 1.30, bottomY: 0.67, shoulderY: 0.96, topY: 1.08 }
]);

const SUPERSTRUCTURE_STATIONS = Object.freeze([
  { id: 'engine-tail', z: -2.275, width: 1.76, deckWidth: 1.48, bottomY: 1.04, shoulderY: 1.06, topY: 1.08 },
  { id: 'rear-plate', z: -1.72, width: 2.08, deckWidth: 1.78, bottomY: 1.04, shoulderY: 1.24, topY: 1.53 },
  { id: 'rear-deck', z: -1.38, width: 2.08, deckWidth: 1.78, bottomY: 1.08, shoulderY: 1.26, topY: 1.60 },
  { id: 'turret-bay', z: -0.10, width: 2.06, deckWidth: 1.80, bottomY: 1.10, shoulderY: 1.28, topY: 1.60 },
  { id: 'driver-bay', z: 0.62, width: 2.03, deckWidth: 1.73, bottomY: 1.10, shoulderY: 1.26, topY: 1.56 },
  { id: 'front-glacis', z: 0.90, width: 1.90, deckWidth: 1.46, bottomY: 1.08, shoulderY: 1.19, topY: 1.40 }
]);

const TURRET_OUTLINE = Object.freeze([
  [-0.42, 0.70],
  [0.42, 0.70],
  [0.67, 0.45],
  [0.72, -0.42],
  [0.48, -0.80],
  [-0.48, -0.80],
  [-0.72, -0.42],
  [-0.67, 0.45]
]);

function signedVolume(positions, indices) {
  let volume = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const ia = indices[offset] * 3;
    const ib = indices[offset + 1] * 3;
    const ic = indices[offset + 2] * 3;
    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const cx = positions[ic];
    const cy = positions[ic + 1];
    const cz = positions[ic + 2];
    volume += (
      ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx)
    ) / 6;
  }
  return volume;
}

function orientOutward(positions, indices) {
  if (signedVolume(positions, indices) >= 0) return indices;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const swap = indices[offset + 1];
    indices[offset + 1] = indices[offset + 2];
    indices[offset + 2] = swap;
  }
  return indices;
}

function finishGeometry(name, positions, uvs, indices) {
  orientOutward(positions, indices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = name;
  geometry.userData.outwardWinding = true;
  return geometry;
}

function createHullLoftGeometry(stations, name) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const firstZ = stations[0].z;
  const spanZ = stations.at(-1).z - firstZ;

  for (const station of stations) {
    const halfWidth = station.width / 2;
    const halfDeck = station.deckWidth / 2;
    const halfFloor = halfWidth * 0.86;
    positions.push(
      -halfFloor, station.bottomY, station.z,
      -halfWidth, station.shoulderY, station.z,
      -halfDeck, station.topY, station.z,
      halfDeck, station.topY, station.z,
      halfWidth, station.shoulderY, station.z,
      halfFloor, station.bottomY, station.z
    );
    const v = (station.z - firstZ) / spanZ;
    uvs.push(0.08, v, 0, v, 0.12, v, 0.88, v, 1, v, 0.92, v);
  }

  const ringSize = 6;
  for (let stationIndex = 0; stationIndex < stations.length - 1; stationIndex++) {
    const current = stationIndex * ringSize;
    const next = current + ringSize;
    for (let edge = 0; edge < ringSize; edge++) {
      const a = current + edge;
      const b = current + ((edge + 1) % ringSize);
      const c = next + edge;
      const d = next + ((edge + 1) % ringSize);
      indices.push(a, c, b, b, c, d);
    }
  }

  indices.push(0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5);
  const front = (stations.length - 1) * ringSize;
  indices.push(
    front, front + 2, front + 1,
    front, front + 3, front + 2,
    front, front + 4, front + 3,
    front, front + 5, front + 4
  );
  const geometry = finishGeometry(name, positions, uvs, indices);
  geometry.userData.stationIds = stations.map(station => station.id);
  return geometry;
}

function createTurretGeometry(name, rings) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const pointCount = TURRET_OUTLINE.length;
  const minY = rings[0].y;
  const height = rings.at(-1).y - minY;

  for (const ring of rings) {
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
      const [x, z] = TURRET_OUTLINE[pointIndex];
      positions.push(x * ring.scaleX, ring.y, z * ring.scaleZ);
      uvs.push(pointIndex / pointCount, (ring.y - minY) / height);
    }
  }

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex++) {
    const current = ringIndex * pointCount;
    const next = current + pointCount;
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
      const a = current + pointIndex;
      const b = current + ((pointIndex + 1) % pointCount);
      const c = next + pointIndex;
      const d = next + ((pointIndex + 1) % pointCount);
      indices.push(a, c, b, b, c, d);
    }
  }

  for (let index = 1; index < pointCount - 1; index++) {
    indices.push(0, index, index + 1);
  }
  const roof = (rings.length - 1) * pointCount;
  for (let index = 1; index < pointCount - 1; index++) {
    indices.push(roof, roof + index + 1, roof + index);
  }
  return finishGeometry(name, positions, uvs, indices);
}

function tagMesh(mesh, lodBand, name) {
  mesh.name = name;
  mesh.userData.lodBand = lodBand;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addReturnRollers(parent, material) {
  const centersZ = [1.42, 0.70, -0.08, -0.82, -1.48];
  for (const side of [-1, 1]) {
    for (let index = 0; index < centersZ.length; index++) {
      const roller = tagMesh(new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 0.13, 10),
        material
      ), 'medium', `${side < 0 ? 'Right' : 'Left'}ReturnRoller_${index + 1}`);
      roller.rotation.z = Math.PI / 2;
      roller.position.set(side * 0.935, 0.94, centersZ[index]);
      parent.add(roller);
    }
  }
}

function addSuspensionDetails(parent, bodyMaterial, metalMaterial) {
  const centersZ = AMC35_BLUEPRINT.datumsMeters.roadWheelCentersZ.value;
  for (const side of [-1, 1]) {
    for (let pair = 0; pair < 2; pair++) {
      const first = centersZ[pair * 2];
      const second = centersZ[pair * 2 + 1];
      const bogie = tagMesh(new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.28, Math.abs(first - second) + 0.24),
        bodyMaterial
      ), 'high', `${side < 0 ? 'Right' : 'Left'}BogieFrame_${pair + 1}`);
      bogie.position.set(side * 0.956, 0.59, (first + second) / 2);
      parent.add(bogie);

      const spring = tagMesh(new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.34, 10),
        metalMaterial
      ), 'high', `${side < 0 ? 'Right' : 'Left'}HorizontalSpring_${pair + 1}`);
      spring.rotation.x = Math.PI / 2;
      spring.position.set(side * 1.015, 0.75, (first + second) / 2);
      parent.add(spring);
    }
  }
}

function addHullDetails(parent, bodyMaterial, metalMaterial) {
  const visor = tagMesh(new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.18, 0.06),
    metalMaterial
  ), 'high', 'DriverVisor');
  visor.position.set(-0.42, 1.39, 1.40);
  visor.userData.side = 'right';
  parent.add(visor);

  const louvreGeometry = new THREE.BoxGeometry(0.42, 0.035, 0.055);
  for (let index = 0; index < 7; index++) {
    const louvre = tagMesh(
      new THREE.Mesh(louvreGeometry, metalMaterial),
      'high',
      `EngineDeckLouvre_${index + 1}`
    );
    louvre.position.set(0.48, 1.565, -0.72 - index * 0.105);
    parent.add(louvre);
  }

  for (const side of [-1, 1]) {
    const fender = tagMesh(new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.055, 3.62),
      bodyMaterial
    ), 'core', `${side < 0 ? 'Right' : 'Left'}TrackGuard`);
    fender.position.set(side * 1.045, 1.035, -0.05);
    parent.add(fender);

    const lamp = tagMesh(new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.095, 0.10, 10),
      metalMaterial
    ), 'high', `${side < 0 ? 'Right' : 'Left'}Headlamp`);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.66, 1.17, 1.84);
    parent.add(lamp);
  }
}

function addTurretDetails(turretGroup, turretMaterial, metalMaterial) {
  const mantlet = tagMesh(new THREE.Mesh(
    new THREE.BoxGeometry(0.50, 0.40, 0.16),
    turretMaterial
  ), 'core', 'APX2Mantlet');
  mantlet.position.set(-0.08, 0.30, 0.72);
  turretGroup.add(mantlet);

  const visionPositions = [
    [-0.46, 0.43, 0.52, 0],
    [0.46, 0.43, 0.52, 0],
    [-0.58, 0.43, -0.14, Math.PI / 2],
    [0.58, 0.43, -0.14, Math.PI / 2]
  ];
  for (let index = 0; index < visionPositions.length; index++) {
    const [x, y, z, rotationY] = visionPositions[index];
    const block = tagMesh(new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.13, 0.055),
      metalMaterial
    ), 'high', `APX2VisionBlock_${index + 1}`);
    block.position.set(x, y, z);
    block.rotation.y = rotationY;
    turretGroup.add(block);
  }

  const roofHatch = tagMesh(new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.30, 0.10, 10),
    turretMaterial
  ), 'medium', 'APX2RoofHatch');
  roofHatch.position.set(0, 0.64, -0.18);
  turretGroup.add(roofHatch);

  const hatchCap = tagMesh(new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.03, 10),
    turretMaterial
  ), 'high', 'APX2HatchCap');
  hatchCap.position.set(0, 0.685, -0.18);
  turretGroup.add(hatchCap);
}

function createProxyGroup(bodyMaterial, turretMaterial, trackMaterial, metalMaterial) {
  const proxy = new THREE.Group();
  proxy.name = 'Proxy';

  const hull = tagMesh(new THREE.Mesh(
    createHullLoftGeometry([
      LOWER_HULL_STATIONS[0],
      LOWER_HULL_STATIONS[1],
      LOWER_HULL_STATIONS[3],
      LOWER_HULL_STATIONS[5],
      LOWER_HULL_STATIONS[6]
    ], 'AMC35_ProxyHullGeometry'),
    bodyMaterial
  ), 'proxy', 'AMC35_ProxyHull');
  hull.visible = false;
  proxy.add(hull);

  const superstructure = tagMesh(new THREE.Mesh(
    createHullLoftGeometry([
      SUPERSTRUCTURE_STATIONS[0],
      SUPERSTRUCTURE_STATIONS[2],
      SUPERSTRUCTURE_STATIONS[4],
      SUPERSTRUCTURE_STATIONS[5]
    ], 'AMC35_ProxySuperstructureGeometry'),
    bodyMaterial
  ), 'proxy', 'AMC35_ProxySuperstructure');
  superstructure.visible = false;
  proxy.add(superstructure);

  const turretRing = tagMesh(new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.66, 0.08, 8),
    turretMaterial
  ), 'proxy', 'AMC35_ProxyTurretRing');
  turretRing.position.set(0, 1.58, -0.10);
  turretRing.visible = false;
  proxy.add(turretRing);

  proxy.add(createTrackedRunningGearProxy({
    id: 'AMC35BlueprintRunningGearProxy',
    trackMaterial,
    wheelMaterial: turretMaterial,
    trackCenterX: 0.9016,
    trackWidth: 0.42,
    beltLength: 4.25,
    beltHeight: 1.00,
    centerY: 0.5762,
    roadWheelRadius: 0.255,
    roadWheelCount: 5
  }));

  const turret = tagMesh(new THREE.Mesh(
    createTurretGeometry('AMC35_ProxyAPX2Geometry', [
      { y: 0, scaleX: 0.94, scaleZ: 0.94 },
      { y: 0.62, scaleX: 0.75, scaleZ: 0.74 }
    ]),
    turretMaterial
  ), 'proxy', 'AMC35_ProxyAPX2');
  turret.position.set(0, 1.60, -0.10);
  turret.visible = false;
  proxy.add(turret);

  const gun = tagMesh(new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.065, 0.72, 6),
    metalMaterial
  ), 'proxy', 'AMC35_ProxySA35');
  gun.rotation.x = Math.PI / 2;
  gun.position.set(-0.10, 1.86, 0.87);
  gun.userData.envelopeRole = 'weaponProjection';
  gun.visible = false;
  proxy.add(gun);
  return proxy;
}

export function createAMC35Mesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'fr_amc35';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#384729',
    roughness: 0.78,
    metalness: 0.12
  }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#435432',
    roughness: 0.76,
    metalness: 0.12
  }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#1e231a',
    roughness: 0.9
  }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#111512',
    metalness: 0.85,
    roughness: 0.35
  }), 'metal');

  const lowerHull = tagMesh(new THREE.Mesh(
    createHullLoftGeometry(LOWER_HULL_STATIONS, 'AMC35_LowerHullGeometry'),
    bodyMat
  ), 'core', 'AMC35_PrimaryHull');
  lowerHull.userData.authoredHull = true;
  lowerHull.userData.profileSource = BLUEPRINT_URL;
  lowerHull.userData.profileStationCount = LOWER_HULL_STATIONS.length;
  tankGroup.add(lowerHull);
  tankGroup.userData.authoredHull = true;

  const superstructure = tagMesh(new THREE.Mesh(
    createHullLoftGeometry(SUPERSTRUCTURE_STATIONS, 'AMC35_SuperstructureGeometry'),
    bodyMat
  ), 'core', 'AMC35_RivetedSuperstructure');
  superstructure.userData.profileSource = BLUEPRINT_URL;
  superstructure.userData.profileStationCount = SUPERSTRUCTURE_STATIONS.length;
  tankGroup.add(superstructure);

  const runningGear = createTrackedRunningGear({
    id: 'AMC35RunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: 0.9016,
    trackWidth: 0.42,
    beltLength: 4.25,
    beltHeight: 1.00,
    centerY: 0.5762,
    roadWheelRadius: 0.255,
    roadWheelCount: 5,
    roadWheelY: 0.31,
    roadWheelZStart: 1.15,
    roadWheelSpacing: -0.625,
    sprocketRadius: 0.43,
    idlerRadius: 0.36,
    linkPitch: 0.15
  });
  runningGear.userData.blueprintDatums = AMC35_BLUEPRINT.datumsMeters;
  const wheelDatums = AMC35_BLUEPRINT.datumsMeters.roadWheelCentersZ.value;
  for (let index = 0; index < runningGear.userData.trackParts.roadWheels.length; index++) {
    runningGear.userData.trackParts.roadWheels[index].position.z = wheelDatums[index % wheelDatums.length];
  }
  for (const sprocket of runningGear.userData.trackParts.sprockets) {
    sprocket.position.y = AMC35_BLUEPRINT.datumsMeters.frontSprocket.y;
    sprocket.position.z = AMC35_BLUEPRINT.datumsMeters.frontSprocket.z;
  }
  for (const idler of runningGear.userData.trackParts.idlers) {
    idler.position.y = AMC35_BLUEPRINT.datumsMeters.rearIdler.y;
    idler.position.z = AMC35_BLUEPRINT.datumsMeters.rearIdler.z;
  }
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;
  addReturnRollers(tankGroup, turretMat);
  addSuspensionDetails(tankGroup, bodyMat, metalMat);
  addHullDetails(tankGroup, bodyMat, metalMat);

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, 1.60, -0.10);
  turretGroup.userData.articulated = true;
  turretGroup.userData.turretType = 'APX 2';
  turretGroup.userData.blueprintDatum = AMC35_BLUEPRINT.datumsMeters.turretRing;

  const turret = tagMesh(new THREE.Mesh(
    createTurretGeometry('AMC35_APX2TurretGeometry', [
      { y: 0, scaleX: 0.94, scaleZ: 0.94 },
      { y: 0.08, scaleX: 1.0, scaleZ: 1.0 },
      { y: 0.56, scaleX: 0.82, scaleZ: 0.80 },
      { y: 0.64, scaleX: 0.72, scaleZ: 0.70 }
    ]),
    turretMat
  ), 'core', 'AMC35_APX2Turret');
  turret.userData.profileSource = BLUEPRINT_URL;
  turret.userData.turretCrew = 2;
  turretGroup.add(turret);
  addTurretDetails(turretGroup, turretMat, metalMat);

  const barrel = tagMesh(new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.067, 0.72, 10),
    metalMat
  ), 'core', 'AMC35_SA35Barrel');
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(-0.10, 0.26, 0.95);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.weaponMountId = 'main';
  barrel.userData.envelopeRole = 'weaponProjection';
  barrel.userData.blueprintDatum = AMC35_BLUEPRINT.datumsMeters.gunAxis;
  turretGroup.add(barrel);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'AMC35_Muzzle';
  muzzle.position.set(-0.10, 0.26, 1.33);
  muzzle.userData.forwardAxis = '+Z';
  muzzle.userData.weaponMountId = 'main';
  muzzle.userData.blueprintDatum = AMC35_BLUEPRINT.datumsMeters.muzzle;
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  tankGroup.add(createProxyGroup(bodyMat, turretMat, trackMat, metalMat));

  tankGroup.userData.modelMetadata = {
    designation: 'AMC 35 (ACG-1)',
    dimensionsMeters: { ...AMC35_DIMENSIONS },
    frame: { up: '+Y', forward: '+Z', units: 'metres' },
    construction: 'riveted and bolted armored hull',
    features: [
      'faceted APX 2 two-man turret',
      '47 mm SA 35 gun',
      'five road wheels per side',
      'front drive sprocket and rear idler',
      'horizontal-cylinder suspension'
    ],
    references: [AMC35_BLUEPRINT.source, AMC35_BLUEPRINT.museumSource],
    calibration: AMC35_BLUEPRINT,
    dataQuality: {
      dimensions: 'assigned historical envelope',
      armamentAndCrew: 'museum-confirmed',
      contoursAndMechanicalDatums: 'drawing-inferred'
    },
    lodLevels: ['high', 'medium', 'core', 'proxy'],
    lodModelCount: 4
  };

  return tankGroup;
}
