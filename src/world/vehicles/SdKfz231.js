import * as THREE from 'three';
import { lateralX } from '../LocalFrame.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { getVehicleVisualProfile } from './VehicleVisualProfiles.js';

const PROFILE = getVehicleVisualProfile('ger_sdkfz231');

// Sd.Kfz. 231 (6-Rad), not the later 8-Rad vehicle. Rigid dimensions follow
// the published 6-Rad envelope. Weapon projections are modeled separately.
const D = Object.freeze({
  length: 5.57,
  width: 1.82,
  height: 2.25,
  groundClearance: 0.24,
  wheelRadius: 0.43,
  wheelWidth: 0.22,
  frontWheelX: 0.80,
  rearOuterWheelX: 0.80,
  rearInnerWheelX: 0.56,
  // Side-sheet registration, front to rear. These are contour-derived rather
  // than claimed as chassis-manual dimensions because 6-Rad chassis sources
  // disagree about wheelbase.
  axleZ: Object.freeze([1.86, -0.65, -1.59]),
  turretCenterZ: -0.70,
  turretRingY: 1.72,
  gunAxisLocalY: 0.18,
  gunRootLocalZ: 0.78,
  gunExternalLength: 0.88
});

const BLUEPRINT_CALIBRATION = Object.freeze({
  coordinateFrame: '+Y up, +Z forward, metres',
  variant: 'Sd.Kfz. 231 (6-Rad), generic production hull; not Sd.Kfz. 231 (8-Rad)',
  source: Object.freeze({
    title: 'Sd.Kfz. 231 (6-Rad) side, top, front, and rear elevations',
    pageUrl: 'https://commons.wikimedia.org/wiki/File:Sdkfz231(6-Rad)-plan.gif',
    originalFileUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Sdkfz231%286-Rad%29-plan.gif',
    author: 'Spike Rendchen',
    license: 'CC BY-SA 3.0 / GFDL',
    sourceImagePixels: Object.freeze([600, 800]),
    quality: 'multi-view scale drawing; self-published, cross-checked against period photographs'
  }),
  primaryManual: Object.freeze({
    title: 'D 640: Schwerer Panzerspähwagen Sd.Kfz. 231/232',
    url: 'https://www.military-references.com/wp-content/uploads/books/apc/germany/sd-kfz-231-232/Schwerer_Panzerspahwagen_Sd_Kfz_231-232_D_640_1935.pdf',
    date: '1935',
    quality: 'period German military manual; configuration and detail cross-check'
  }),
  dimensionSource: Object.freeze({
    url: 'https://www.panzernet.net/domains/panzernet.net/panzernet/en/auta/2316.php',
    values: '5.57 m x 1.82 m x 2.25 m',
    quality: 'published historical dimensions; consistent across three chassis variants'
  }),
  registration: Object.freeze({
    side: Object.freeze({
      sourceCropPixels: Object.freeze({ left: 17, top: 17, right: 11, bottom: 544 }),
      originPixels: Object.freeze([302.5, 254]),
      groundLineY: 254,
      metersPerPixel: 5.57 / 571,
      rotationDegrees: 0,
      mirrorX: false,
      quality: 'rigid front/rear and ground line registered to 5.57 m envelope'
    }),
    top: Object.freeze({
      sourceCropPixels: Object.freeze({ left: 17, top: 294, right: 11, bottom: 264 }),
      rotationDegrees: 90,
      mirrorX: false,
      quality: 'same multi-view sheet; rotated clockwise to place +Z forward at image top'
    }),
    front: Object.freeze({
      sourceCropPixels: Object.freeze({ left: 42, top: 543, right: 300, bottom: 7 }),
      groundLineY: 790,
      rotationDegrees: 0,
      mirrorX: false,
      quality: 'same multi-view sheet; width constrained to the published 1.82 m rigid envelope'
    })
  }),
  datums: Object.freeze({
    rigidEnvelope: Object.freeze({
      value: Object.freeze([D.width, D.height, D.length]),
      quality: 'historical exact'
    }),
    groundLineY: Object.freeze({ value: 0, quality: 'registered elevation datum' }),
    groundClearance: Object.freeze({
      value: D.groundClearance,
      quality: 'published values vary by chassis; 0.24 m selected for the modeled production form'
    }),
    axleCenters: Object.freeze({
      value: Object.freeze(D.axleZ.map(z => Object.freeze([z, D.wheelRadius]))),
      quality: 'registered side-sheet inference, nearest centimetre'
    }),
    turretRingCenter: Object.freeze({
      value: Object.freeze([D.turretCenterZ, D.turretRingY]),
      quality: 'registered side/top inference'
    }),
    gunAxisRoot: Object.freeze({
      value: Object.freeze([
        D.turretCenterZ + D.gunRootLocalZ,
        D.turretRingY + D.gunAxisLocalY
      ]),
      quality: 'registered side/front inference'
    }),
    gunMuzzleZ: Object.freeze({
      value: D.turretCenterZ + D.gunRootLocalZ + D.gunExternalLength,
      quality: 'registered side-sheet inference'
    })
  }),
  allowedDivergences: Object.freeze([
    'multi-view sheet is a secondary drawing, not a surviving factory body plan',
    'three manufacturers used distinguishable wheel hubs, fenders, and cooling details',
    'modeled form uses Büssing-NAG-like short front fenders and broad production mantlet',
    'small hinges, louvers, and tire tread are simplified by LOD tier'
  ])
});

// Rear (-Z) to front (+Z). Values were registered against the Commons
// elevation. The shared ring topology retains the coffin-shaped plan,
// double-bevel sides, long sloping bonnet, flat crew roof, and tapered tail.
const HULL_STATIONS = Object.freeze([
  Object.freeze({
    z: -2.785, bottomY: 0.57, bottomHalfWidth: 0.30, lowerY: 0.68,
    lowerHalfWidth: 0.42, shoulderY: 0.82, halfWidth: 0.45,
    roofY: 0.86, roofHalfWidth: 0.32
  }),
  Object.freeze({
    z: -2.48, bottomY: 0.53, bottomHalfWidth: 0.56, lowerY: 0.70,
    lowerHalfWidth: 0.70, shoulderY: 1.15, halfWidth: 0.77,
    roofY: 1.33, roofHalfWidth: 0.59
  }),
  Object.freeze({
    z: -2.16, bottomY: 0.52, bottomHalfWidth: 0.69, lowerY: 0.72,
    lowerHalfWidth: 0.80, shoulderY: 1.40, halfWidth: 0.87,
    roofY: 1.63, roofHalfWidth: 0.69
  }),
  Object.freeze({
    z: -1.72, bottomY: 0.53, bottomHalfWidth: 0.72, lowerY: 0.74,
    lowerHalfWidth: 0.82, shoulderY: 1.47, halfWidth: 0.88,
    roofY: 1.72, roofHalfWidth: 0.70
  }),
  Object.freeze({
    z: -0.55, bottomY: 0.54, bottomHalfWidth: 0.72, lowerY: 0.76,
    lowerHalfWidth: 0.82, shoulderY: 1.48, halfWidth: 0.88,
    roofY: 1.72, roofHalfWidth: 0.70
  }),
  Object.freeze({
    z: 0.30, bottomY: 0.54, bottomHalfWidth: 0.71, lowerY: 0.75,
    lowerHalfWidth: 0.81, shoulderY: 1.43, halfWidth: 0.86,
    roofY: 1.70, roofHalfWidth: 0.66
  }),
  Object.freeze({
    z: 0.52, bottomY: 0.54, bottomHalfWidth: 0.70, lowerY: 0.74,
    lowerHalfWidth: 0.80, shoulderY: 1.34, halfWidth: 0.84,
    roofY: 1.61, roofHalfWidth: 0.62
  }),
  Object.freeze({
    z: 1.18, bottomY: 0.54, bottomHalfWidth: 0.68, lowerY: 0.72,
    lowerHalfWidth: 0.77, shoulderY: 1.16, halfWidth: 0.79,
    roofY: 1.48, roofHalfWidth: 0.56
  }),
  Object.freeze({
    z: 2.20, bottomY: 0.55, bottomHalfWidth: 0.60, lowerY: 0.69,
    lowerHalfWidth: 0.69, shoulderY: 1.01, halfWidth: 0.72,
    roofY: 1.30, roofHalfWidth: 0.45
  }),
  Object.freeze({
    z: 2.58, bottomY: 0.58, bottomHalfWidth: 0.46, lowerY: 0.67,
    lowerHalfWidth: 0.55, shoulderY: 0.85, halfWidth: 0.59,
    roofY: 1.24, roofHalfWidth: 0.36
  }),
  Object.freeze({
    z: 2.785, bottomY: 0.65, bottomHalfWidth: 0.20, lowerY: 0.71,
    lowerHalfWidth: 0.29, shoulderY: 0.82, halfWidth: 0.33,
    roofY: 1.12, roofHalfWidth: 0.25
  })
]);

const TURRET_LEVELS = Object.freeze([
  Object.freeze({
    y: 0, halfWidth: 0.61, frontZ: 0.73, rearZ: -0.77,
    frontHalfWidth: 0.46, rearHalfWidth: 0.45
  }),
  Object.freeze({
    y: 0.12, halfWidth: 0.59, frontZ: 0.72, rearZ: -0.74,
    frontHalfWidth: 0.45, rearHalfWidth: 0.43
  }),
  Object.freeze({
    y: 0.43, halfWidth: 0.50, frontZ: 0.56, rearZ: -0.55,
    frontHalfWidth: 0.38, rearHalfWidth: 0.34
  }),
  Object.freeze({
    y: 0.50, halfWidth: 0.46, frontZ: 0.48, rearZ: -0.49,
    frontHalfWidth: 0.34, rearHalfWidth: 0.31
  })
]);

function tag(mesh, lodBand, name, slot = null) {
  mesh.name = name;
  mesh.userData.lodBand = lodBand;
  if (slot) mesh.userData.materialSlot = slot;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function signedVolume(geometry) {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let volume = 0;
  const triangleCount = index ? index.count / 3 : positions.count / 3;
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const ia = index ? index.getX(triangle * 3) : triangle * 3;
    const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
    a.fromBufferAttribute(positions, ia);
    b.fromBufferAttribute(positions, ib);
    c.fromBufferAttribute(positions, ic);
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
  geometry.userData.outwardWinding = true;
  return geometry;
}

function hullRing(station) {
  return [
    [-station.bottomHalfWidth, station.bottomY, station.z],
    [-station.lowerHalfWidth, station.lowerY, station.z],
    [-station.halfWidth, station.shoulderY, station.z],
    [-station.roofHalfWidth, station.roofY, station.z],
    [station.roofHalfWidth, station.roofY, station.z],
    [station.halfWidth, station.shoulderY, station.z],
    [station.lowerHalfWidth, station.lowerY, station.z],
    [station.bottomHalfWidth, station.bottomY, station.z]
  ];
}

function createHullGeometry(stations, name) {
  const rings = stations.map(hullRing);
  const ringSize = rings[0].length;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (const ring of rings) {
    for (const [x, y, z] of ring) {
      positions.push(x, y, z);
      uvs.push(z / D.length + 0.5, y / D.height);
    }
  }
  for (let station = 0; station < rings.length - 1; station++) {
    const current = station * ringSize;
    const next = current + ringSize;
    for (let point = 0; point < ringSize; point++) {
      const following = (point + 1) % ringSize;
      indices.push(
        current + point, next + following, next + point,
        current + point, current + following, next + following
      );
    }
  }
  for (const [offset, reverse] of [[0, true], [(rings.length - 1) * ringSize, false]]) {
    for (let point = 1; point < ringSize - 1; point++) {
      if (reverse) indices.push(offset, offset + point + 1, offset + point);
      else indices.push(offset, offset + point, offset + point + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = name;
  return orientOutward(geometry);
}

function turretRingPoints(level) {
  const frontShoulderZ = level.frontZ - 0.12;
  const rearShoulderZ = level.rearZ + 0.12;
  return [
    [-level.frontHalfWidth, level.frontZ],
    [level.frontHalfWidth, level.frontZ],
    [level.halfWidth, frontShoulderZ],
    [level.halfWidth, rearShoulderZ],
    [level.rearHalfWidth, level.rearZ],
    [-level.rearHalfWidth, level.rearZ],
    [-level.halfWidth, rearShoulderZ],
    [-level.halfWidth, frontShoulderZ]
  ];
}

function createTurretGeometry(levels, name) {
  const ringSize = 8;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (const level of levels) {
    for (const [x, z] of turretRingPoints(level)) {
      positions.push(x, level.y, z);
      uvs.push(z + 0.5, level.y);
    }
  }
  for (let level = 0; level < levels.length - 1; level++) {
    const current = level * ringSize;
    const next = current + ringSize;
    for (let point = 0; point < ringSize; point++) {
      const following = (point + 1) % ringSize;
      indices.push(
        current + point, next + point, next + following,
        current + point, next + following, current + following
      );
    }
  }
  for (let point = 1; point < ringSize - 1; point++) {
    indices.push(0, point + 1, point);
    const roof = (levels.length - 1) * ringSize;
    indices.push(roof, roof + point, roof + point + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = name;
  return orientOutward(geometry);
}

function createWheel(material, x, z, lodBand, name, radialSegments = 20) {
  const wheel = tag(
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        D.wheelRadius,
        D.wheelRadius,
        D.wheelWidth,
        radialSegments
      ),
      material
    ),
    lodBand,
    name,
    'rubber'
  );
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(x, D.wheelRadius, z);
  wheel.userData.axleCenter = [z, D.wheelRadius];
  return wheel;
}

function addDetailedRunningGear(group, rubberMaterial, metalMaterial) {
  const wheels = [];
  const placements = [
    ...[-1, 1].map(side => [side * D.frontWheelX, D.axleZ[0], `Front_${side}`]),
    ...D.axleZ.slice(1).flatMap((z, axleIndex) => [-1, 1].flatMap(side => [
      [side * D.rearOuterWheelX, z, `Rear${axleIndex + 1}_Outer_${side}`],
      [side * D.rearInnerWheelX, z, `Rear${axleIndex + 1}_Inner_${side}`]
    ]))
  ];
  for (const [x, z, id] of placements) {
    const partName = id.includes('_Inner_')
      ? `SdKfz231_6Rad_DualTire_${id}`
      : `SdKfz231_6Rad_Wheel_${id}`;
    const wheel = createWheel(
      rubberMaterial,
      x,
      z,
      'medium',
      partName
    );
    wheel.userData.profileSource = 'registered-side-elevation';
    group.add(wheel);
    wheels.push(wheel);

    if (Math.abs(x) === D.frontWheelX || Math.abs(x) === D.rearOuterWheelX) {
      const hub = tag(
        new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, D.wheelWidth, 12), metalMaterial),
        'high',
        `SdKfz231_6Rad_Hub_${id}`,
        'metal'
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      group.add(hub);
    }
  }
  group.userData.runningGear = {
    axleZ: [...D.axleZ],
    wheels,
    frontTrackMeters: D.frontWheelX * 2,
    rearOuterWidthMeters: D.width
  };
}

function addFender(
  group,
  material,
  side,
  centerZ,
  topLength,
  topY,
  slopeLength,
  name
) {
  const x = side * (D.width * 0.5 - 0.06);
  const top = tag(
    new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.075, topLength), material),
    'medium',
    `${name}_Top_${side}`,
    'paint'
  );
  top.position.set(x, topY, centerZ);
  group.add(top);

  for (const direction of [-1, 1]) {
    const slope = tag(
      new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.075, slopeLength), material),
      'medium',
      `${name}_Slope_${side}_${direction}`,
      'paint'
    );
    slope.rotation.x = direction * 0.80;
    slope.position.set(
      x,
      topY - 0.17,
      centerZ + direction * (topLength * 0.5 + slopeLength * 0.31)
    );
    group.add(slope);
  }
}

function addHatch(
  group,
  material,
  side,
  y,
  z,
  width,
  height,
  name
) {
  const hatch = tag(
    new THREE.Mesh(new THREE.BoxGeometry(0.035, height, width), material),
    'high',
    name,
    'paint'
  );
  hatch.position.set(side * 0.885, y, z);
  group.add(hatch);
  return hatch;
}

export function createSdKfz231Mesh() {
  const carGroup = new THREE.Group();
  carGroup.name = 'ger_sdkfz231';
  carGroup.userData.authoredHull = true;
  carGroup.userData.blueprintCalibration = BLUEPRINT_CALIBRATION;

  const bodyMat = setVehicleMaterialSlot(
    new THREE.MeshStandardMaterial({
      color: '#394146',
      roughness: 0.76,
      metalness: 0.12
    }),
    'paint'
  );
  const turretMat = setVehicleMaterialSlot(
    new THREE.MeshStandardMaterial({
      color: '#41494d',
      roughness: 0.73,
      metalness: 0.13
    }),
    'paint'
  );
  const rubberMat = setVehicleMaterialSlot(
    new THREE.MeshStandardMaterial({
      color: '#181b1d',
      roughness: 0.96,
      metalness: 0.01
    }),
    'rubber'
  );
  const metalMat = setVehicleMaterialSlot(
    new THREE.MeshStandardMaterial({
      color: '#15191b',
      metalness: 0.82,
      roughness: 0.38
    }),
    'metal'
  );

  const hull = tag(
    new THREE.Mesh(
      createHullGeometry(HULL_STATIONS, 'SdKfz231RegisteredHullGeometry'),
      bodyMat
    ),
    'core',
    'SdKfz231_6Rad_PrimaryHull',
    'paint'
  );
  hull.userData.authoredHull = true;
  hull.userData.profileStationCount = HULL_STATIONS.length;
  hull.userData.profileSource = 'registered-multi-view-inference';
  carGroup.add(hull);

  addDetailedRunningGear(carGroup, rubberMat, metalMat);
  addFender(carGroup, bodyMat, -1, 1.82, 1.00, 0.94, 0.42, 'SdKfz231_FrontFender');
  addFender(carGroup, bodyMat, 1, 1.82, 1.00, 0.94, 0.42, 'SdKfz231_FrontFender');
  addFender(carGroup, bodyMat, -1, -1.12, 2.12, 0.94, 0.54, 'SdKfz231_TandemFender');
  addFender(carGroup, bodyMat, 1, -1.12, 2.12, 0.94, 0.54, 'SdKfz231_TandemFender');

  const frontVisor = tag(
    new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.055), metalMat),
    'high',
    'SdKfz231_6Rad_FrontDriverVisor',
    'metal'
  );
  frontVisor.position.set(lateralX('left', 0.31), 1.50, 0.53);
  frontVisor.rotation.x = -0.12;
  carGroup.add(frontVisor);

  const rearVisor = tag(
    new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.13, 0.055), metalMat),
    'high',
    'SdKfz231_6Rad_RearDriverVisor',
    'metal'
  );
  rearVisor.position.set(0, 1.30, -2.34);
  rearVisor.rotation.x = 0.28;
  rearVisor.userData.crewRole = 'rear_driver';
  rearVisor.userData.facingAxis = '-Z';
  carGroup.add(rearVisor);

  for (const side of [-1, 1]) {
    addHatch(
      carGroup,
      bodyMat,
      side,
      1.12,
      -0.13,
      0.78,
      0.62,
      `SdKfz231_6Rad_CrewDoor_${side}`
    );
    addHatch(
      carGroup,
      bodyMat,
      side,
      1.16,
      1.77,
      0.98,
      0.32,
      `SdKfz231_6Rad_EngineDoor_${side}`
    );

    const lamp = tag(
      new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.10, 10), metalMat),
      'high',
      `SdKfz231_6Rad_Headlamp_${side}`,
      'metal'
    );
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.52, 1.05, 2.53);
    carGroup.add(lamp);
  }

  // Angled front radiator bars remain high-tier geometry; they follow the
  // sloped armored nose instead of forming a detached black rectangle.
  for (let index = -4; index <= 4; index++) {
    const louver = tag(
      new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 0.36), metalMat),
      'high',
      `SdKfz231_6Rad_RadiatorLouver_${index}`,
      'metal'
    );
    louver.position.set(index * 0.075, 0.88 + Math.abs(index) * 0.004, 2.57);
    louver.rotation.x = -0.55;
    carGroup.add(louver);
  }

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, D.turretRingY, D.turretCenterZ);
  turretGroup.userData.deckContact = {
    hullName: hull.name,
    maxGapMeters: 0.02
  };

  const turretRing = tag(
    new THREE.Mesh(new THREE.CylinderGeometry(0.61, 0.61, 0.055, 16), turretMat),
    'core',
    'SdKfz231_6Rad_TurretRing',
    'paint'
  );
  turretRing.position.y = 0.0275;
  turretGroup.add(turretRing);

  const turret = tag(
    new THREE.Mesh(
      createTurretGeometry(TURRET_LEVELS, 'SdKfz231RegisteredTurretGeometry'),
      turretMat
    ),
    'core',
    'SdKfz231_6Rad_HorseshoeTurret',
    'paint'
  );
  turret.userData.profileLevelCount = TURRET_LEVELS.length;
  turret.userData.profileSource = 'registered-multi-view-inference';
  turretGroup.add(turret);

  const roofHatch = tag(
    new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.48), turretMat),
    'medium',
    'SdKfz231_6Rad_TurretRoofHatch',
    'paint'
  );
  roofHatch.position.set(0, 0.515, -0.05);
  turretGroup.add(roofHatch);

  const mantlet = tag(
    new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.27, 0.13), turretMat),
    'core',
    'SdKfz231_6Rad_BroadMantlet',
    'paint'
  );
  mantlet.position.set(0.03, D.gunAxisLocalY, 0.73);
  turretGroup.add(mantlet);

  const barrel = tag(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.034, D.gunExternalLength, 10),
      metalMat
    ),
    'core',
    'SdKfz231_6Rad_KwK30',
    'metal'
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(
    0.10,
    D.gunAxisLocalY,
    D.gunRootLocalZ + D.gunExternalLength * 0.5
  );
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.weaponMountId = 'main';
  barrel.userData.envelopeRole = 'weaponProjection';
  barrel.userData.profileSource = 'registered-side-elevation';
  turretGroup.add(barrel);

  const coax = tag(
    new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.019, 0.48, 7), metalMat),
    'high',
    'coax_barrel',
    'metal'
  );
  coax.rotation.x = Math.PI / 2;
  coax.position.set(lateralX('right', 0.12), 0.27, 0.66);
  coax.userData.weaponMountId = 'coax';
  coax.userData.mountSide = 'right';
  coax.userData.envelopeRole = 'weaponProjection';
  turretGroup.add(coax);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'SdKfz231_Muzzle';
  muzzle.position.set(
    0.10,
    D.gunAxisLocalY,
    D.gunRootLocalZ + D.gunExternalLength
  );
  muzzle.userData.forwardAxis = '+Z';
  turretGroup.add(muzzle);

  // Far turret remains under the authoritative pivot. Its contour uses the
  // same exact base and roof levels, but only two rings.
  const proxyTurret = tag(
    new THREE.Mesh(
      createTurretGeometry(
        [
          TURRET_LEVELS[0],
          { ...TURRET_LEVELS[TURRET_LEVELS.length - 1], y: 0.53 }
        ],
        'SdKfz231ProxyTurretGeometry'
      ),
      turretMat
    ),
    'proxy',
    'SdKfz231_6Rad_ProxyTurret',
    'paint'
  );
  proxyTurret.visible = false;
  turretGroup.add(proxyTurret);

  // Far barrel inherits both turret yaw and authoritative recoil.
  const proxyBarrel = tag(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.036, D.gunExternalLength, 6),
      metalMat
    ),
    'proxy',
    'SdKfz231_6Rad_ProxyKwK30',
    'metal'
  );
  proxyBarrel.visible = false;
  barrel.add(proxyBarrel);

  carGroup.add(turretGroup);
  carGroup.userData.turret = turretGroup;
  carGroup.userData.barrel = barrel;
  carGroup.userData.muzzle = muzzle;
  carGroup.userData.proxyTurret = proxyTurret;
  carGroup.userData.proxyBarrel = proxyBarrel;

  const proxyHull = tag(
    new THREE.Mesh(
      createHullGeometry(
        [
          HULL_STATIONS[0],
          HULL_STATIONS[2],
          HULL_STATIONS[4],
          HULL_STATIONS[6],
          HULL_STATIONS[8],
          HULL_STATIONS[10]
        ],
        'SdKfz231ProxyHullGeometry'
      ),
      bodyMat
    ),
    'proxy',
    'SdKfz231_6Rad_ProxyHull',
    'paint'
  );
  proxyHull.visible = false;
  carGroup.add(proxyHull);

  const proxyWheelPlacements = [
    ...[-1, 1].map(side => [side * D.frontWheelX, D.axleZ[0]]),
    ...D.axleZ.slice(1).flatMap(z => [-1, 1].map(side => [
      side * D.rearOuterWheelX,
      z
    ]))
  ];
  for (const [index, [x, z]] of proxyWheelPlacements.entries()) {
    const wheel = createWheel(
      rubberMat,
      x,
      z,
      'proxy',
      `SdKfz231_6Rad_ProxyWheel_${index}`,
      8
    );
    wheel.visible = false;
    carGroup.add(wheel);
  }

  carGroup.userData.modelMetadata = {
    designation: PROFILE.designation,
    dimensionsMeters: { length: D.length, width: D.width, height: D.height },
    references: [
      ...PROFILE.references,
      BLUEPRINT_CALIBRATION.source.pageUrl,
      BLUEPRINT_CALIBRATION.primaryManual.url,
      BLUEPRINT_CALIBRATION.dimensionSource.url
    ],
    dataQuality: [
      'historical exact rigid dimensions',
      'registered multi-view secondary drawing',
      'period-manual and photograph cross-check',
      'manufacturer-specific minor fittings inferred'
    ].join('; '),
    blueprintCalibration: BLUEPRINT_CALIBRATION,
    features: [
      '6x4 truck-derived armored chassis',
      'single front axle and tandem dual-tire rear axles',
      'coffin-shaped double-bevel hull',
      'front engine under long sloping armored bonnet',
      'rear fighting compartment and auxiliary driving position',
      'horseshoe-plan turret with 2 cm KwK 30 and right-side coax'
    ]
  };

  return carGroup;
}
