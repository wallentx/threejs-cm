import * as THREE from 'three';
import { lateralX } from '../LocalFrame.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { getVehicleVisualProfile } from './VehicleVisualProfiles.js';

const PROFILE = getVehicleVisualProfile('fr_panhard178');

const PANHARD_178_SHAPE = Object.freeze({
  // Exact physical values: Haugh, "Wheeled Fighting Vehicle Data Sheets",
  // Panhard 178 sheet, revised 2008. Contour stations below are inferred from
  // the linked orthographic drawing after registering ground, envelope, and
  // both exact axle centers.
  overallLength: PROFILE.dimensionsMeters.length,
  overallWidth: PROFILE.dimensionsMeters.width,
  overallHeight: PROFILE.dimensionsMeters.height,
  wheelbase: 3.12,
  wheelTread: 1.737,
  tireDiameter: 1.067,
  tireWidth: 0.273,
  groundClearance: 0.35,
  axleZ: Object.freeze([-1.56, 1.56]),
  hullBottomY: 0.35,
  turretCenterZ: 0.24,
  turretDeckY: 1.65,
  gunAxisLocalY: 0.27,
  gunMuzzleLocalZ: 2.155,
  // Rear (-Z) to front (+Z). Station contour values are blueprint-inferred,
  // in metres. Extra knots preserve the separate low engine deck, tall crew
  // box, forward driver's hood, and double-ended armored-car shell.
  hullStations: Object.freeze([
    Object.freeze({ z: -2.395, bottomHalfWidth: 0.43, lowerHalfWidth: 0.54, halfWidth: 0.62, lowerY: 0.55, shoulderY: 1.04, roofHalfWidth: 0.40, roofY: 1.20 }),
    Object.freeze({ z: -2.10, bottomHalfWidth: 0.61, lowerHalfWidth: 0.72, halfWidth: 0.82, lowerY: 0.52, shoulderY: 1.25, roofHalfWidth: 0.61, roofY: 1.39 }),
    Object.freeze({ z: -1.72, bottomHalfWidth: 0.70, lowerHalfWidth: 0.78, halfWidth: 0.87, lowerY: 0.49, shoulderY: 1.31, roofHalfWidth: 0.67, roofY: 1.42 }),
    Object.freeze({ z: -0.78, bottomHalfWidth: 0.73, lowerHalfWidth: 0.80, halfWidth: 0.88, lowerY: 0.48, shoulderY: 1.38, roofHalfWidth: 0.69, roofY: 1.43 }),
    Object.freeze({ z: -0.48, bottomHalfWidth: 0.73, lowerHalfWidth: 0.80, halfWidth: 0.88, lowerY: 0.48, shoulderY: 1.48, roofHalfWidth: 0.70, roofY: 1.65 }),
    Object.freeze({ z: 0.82, bottomHalfWidth: 0.73, lowerHalfWidth: 0.80, halfWidth: 0.88, lowerY: 0.48, shoulderY: 1.48, roofHalfWidth: 0.70, roofY: 1.65 }),
    Object.freeze({ z: 1.48, bottomHalfWidth: 0.70, lowerHalfWidth: 0.78, halfWidth: 0.84, lowerY: 0.49, shoulderY: 1.23, roofHalfWidth: 0.57, roofY: 1.29 }),
    Object.freeze({ z: 1.86, bottomHalfWidth: 0.64, lowerHalfWidth: 0.72, halfWidth: 0.79, lowerY: 0.51, shoulderY: 1.13, roofHalfWidth: 0.54, roofY: 1.24 }),
    Object.freeze({ z: 2.395, bottomHalfWidth: 0.41, lowerHalfWidth: 0.49, halfWidth: 0.58, lowerY: 0.56, shoulderY: 0.98, roofHalfWidth: 0.33, roofY: 1.10 })
  ]),
  turretLevels: Object.freeze([
    Object.freeze({ y: 0.06, halfWidth: 0.70, frontZ: 0.72, rearZ: -0.66, frontChamfer: 0.52, rearChamfer: 0.48 }),
    Object.freeze({ y: 0.18, halfWidth: 0.69, frontZ: 0.68, rearZ: -0.64, frontChamfer: 0.51, rearChamfer: 0.47 }),
    Object.freeze({ y: 0.56, halfWidth: 0.54, frontZ: 0.47, rearZ: -0.43, frontChamfer: 0.39, rearChamfer: 0.36 }),
    Object.freeze({ y: 0.59, halfWidth: 0.51, frontZ: 0.43, rearZ: -0.40, frontChamfer: 0.37, rearChamfer: 0.34 })
  ]),
  sourceEvidence: Object.freeze({
    exactDimensionsAndRunningGear: 'https://warwheels.net/images/Panhard178datasheet.pdf',
    orthographicContour: 'https://www.the-blueprints.com/blueprints/tanks/tanks-n-p/79810/view/panhard_178_amd_35/',
    periodFrontReference: 'https://imagesdefense.gouv.fr/fr/plan-moyen-de-face-d-une-amd-panhard-178-qui-vient-de-franchir-la-riviere-meuse-en-crue.html'
  })
});

function tag(mesh, lodBand, name) {
  mesh.name = name;
  mesh.userData.lodBand = lodBand;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createArmoredHullGeometry(stations) {
  const positions = [];
  const indices = [];
  const ringSize = 8;

  for (const station of stations) {
    const ring = [
      [-station.bottomHalfWidth, station.bottomY ?? PANHARD_178_SHAPE.hullBottomY],
      [-station.lowerHalfWidth, station.lowerY],
      [-station.halfWidth, station.shoulderY],
      [-station.roofHalfWidth, station.roofY],
      [station.roofHalfWidth, station.roofY],
      [station.halfWidth, station.shoulderY],
      [station.lowerHalfWidth, station.lowerY],
      [station.bottomHalfWidth, station.bottomY ?? PANHARD_178_SHAPE.hullBottomY]
    ];
    for (const [x, y] of ring) positions.push(x, y, station.z);
  }

  for (let stationIndex = 0; stationIndex < stations.length - 1; stationIndex++) {
    const current = stationIndex * ringSize;
    const next = current + ringSize;
    for (let edge = 0; edge < ringSize; edge++) {
      const edgeNext = (edge + 1) % ringSize;
      indices.push(
        current + edge, next + edgeNext, next + edge,
        current + edge, current + edgeNext, next + edgeNext
      );
    }
  }

  // Separate end caps preserve the hard armor crease at each sloped end.
  for (const [offset, reverse] of [[0, true], [(stations.length - 1) * ringSize, false]]) {
    for (let edge = 1; edge < ringSize - 1; edge++) {
      if (reverse) indices.push(offset, offset + edge + 1, offset + edge);
      else indices.push(offset, offset + edge, offset + edge + 1);
    }
  }

  // Rings run rear-to-front; reverse every emitted triangle so the closed
  // shell has positive signed volume and outward-facing normals.
  for (let index = 0; index < indices.length; index += 3) {
    [indices[index + 1], indices[index + 2]] = [indices[index + 2], indices[index + 1]];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = 'Panhard178BlueprintHullGeometry';
  return geometry;
}

function signedVolume(positions, indices) {
  let volume = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const ai = indices[offset] * 3;
    const bi = indices[offset + 1] * 3;
    const ci = indices[offset + 2] * 3;
    const ax = positions[ai];
    const ay = positions[ai + 1];
    const az = positions[ai + 2];
    const bx = positions[bi];
    const by = positions[bi + 1];
    const bz = positions[bi + 2];
    const cx = positions[ci];
    const cy = positions[ci + 1];
    const cz = positions[ci + 2];
    volume += (
      ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx)
    ) / 6;
  }
  return volume;
}

function createApx3TurretGeometry(levels) {
  const positions = [];
  const indices = [];
  const ringSize = 8;

  for (const level of levels) {
    const frontShoulderZ = level.frontZ - 0.13;
    const rearShoulderZ = level.rearZ + 0.12;
    const ring = [
      [-level.frontChamfer, level.frontZ],
      [level.frontChamfer, level.frontZ],
      [level.halfWidth, frontShoulderZ],
      [level.halfWidth, rearShoulderZ],
      [level.rearChamfer, level.rearZ],
      [-level.rearChamfer, level.rearZ],
      [-level.halfWidth, rearShoulderZ],
      [-level.halfWidth, frontShoulderZ]
    ];
    for (const [x, z] of ring) positions.push(x, level.y, z);
  }

  for (let level = 0; level < levels.length - 1; level++) {
    const current = level * ringSize;
    const next = current + ringSize;
    for (let edge = 0; edge < ringSize; edge++) {
      const following = (edge + 1) % ringSize;
      indices.push(
        current + edge, next + edge, next + following,
        current + edge, next + following, current + following
      );
    }
  }

  for (let edge = 1; edge < ringSize - 1; edge++) {
    indices.push(0, edge, edge + 1);
    const roof = (levels.length - 1) * ringSize;
    indices.push(roof, roof + edge + 1, roof + edge);
  }

  if (signedVolume(positions, indices) < 0) {
    for (let offset = 0; offset < indices.length; offset += 3) {
      [indices[offset + 1], indices[offset + 2]] = [indices[offset + 2], indices[offset + 1]];
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = 'Panhard178Apx3BlueprintTurretGeometry';
  geometry.userData.orientationAudit = {
    signedVolumeCubicMeters: signedVolume(positions, indices),
    outwardWinding: true
  };
  return geometry;
}

export function createPanhard178Mesh() {
  const carGroup = new THREE.Group();
  carGroup.name = 'fr_panhard178';
  carGroup.userData.authoredHull = true;
  carGroup.userData.blueprintCalibration = {
    coordinateFrame: '+Y up, +Z forward, metres',
    registration: {
      exact: [
        '4.79 m rigid envelope',
        '2.01 m outside-tire width',
        '2.31 m rigid height',
        '3.12 m axle-center wheelbase',
        '1.737 m wheel tread',
        '42x9 tire size',
        '0.35 m ground clearance'
      ],
      inferredFromOrthographic: [
        'nine hull stations',
        'crew-roof and engine-deck break',
        'turret-ring longitudinal center',
        'APX 3 front/rear roof slopes',
        'driver-hood and fender profiles',
        'main-gun projection'
      ]
    },
    sourceEvidence: { ...PANHARD_178_SHAPE.sourceEvidence }
  };

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#445638', roughness: 0.76, metalness: 0.1 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#4c613e', roughness: 0.74, metalness: 0.1 }), 'paint');
  const rubberMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#20241f', roughness: 0.92, metalness: 0.02 }), 'rubber');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#202720', metalness: 0.65, roughness: 0.42 }), 'metal');

  const hull = tag(
    new THREE.Mesh(createArmoredHullGeometry(PANHARD_178_SHAPE.hullStations), bodyMat),
    'core',
    'Panhard178_PrimaryHull'
  );
  hull.userData.authoredHull = true;
  hull.userData.profileStationCount = PANHARD_178_SHAPE.hullStations.length;
  hull.userData.profileSource = 'registered-orthographic-inference';
  carGroup.add(hull);

  // Shallow deck plates make the turret base read as an APX 3 installation,
  // while leaving the sloped front and rear shell visible in profile.
  const fightingDeck = tag(
    new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.055, 1.34), bodyMat),
    'core',
    'Panhard178_FightingDeck'
  );
  fightingDeck.position.set(0, PANHARD_178_SHAPE.turretDeckY - 0.0275, 0.22);
  carGroup.add(fightingDeck);

  const rearEngineDeck = tag(
    new THREE.Mesh(new THREE.BoxGeometry(1.31, 0.055, 1.20), bodyMat),
    'medium',
    'Panhard178_RearEngineDeck'
  );
  rearEngineDeck.position.set(0, 1.435, -1.37);
  rearEngineDeck.rotation.x = -0.018;
  carGroup.add(rearEngineDeck);

  const driverHood = tag(
    new THREE.Mesh(
      createArmoredHullGeometry([
        {
          z: 0.82, bottomY: 1.43, bottomHalfWidth: 0.57, lowerHalfWidth: 0.60,
          halfWidth: 0.62, lowerY: 1.48, shoulderY: 1.56,
          roofHalfWidth: 0.54, roofY: 1.65
        },
        {
          z: 1.35, bottomY: 1.35, bottomHalfWidth: 0.54, lowerHalfWidth: 0.56,
          halfWidth: 0.58, lowerY: 1.38, shoulderY: 1.50,
          roofHalfWidth: 0.49, roofY: 1.65
        },
        {
          z: 1.72, bottomY: 1.28, bottomHalfWidth: 0.50, lowerHalfWidth: 0.52,
          halfWidth: 0.54, lowerY: 1.31, shoulderY: 1.43,
          roofHalfWidth: 0.40, roofY: 1.50
        }
      ]),
      bodyMat
    ),
    'core',
    'Panhard178_ForwardDriverHood'
  );
  driverHood.userData.profileRole = 'forward-driver-hood';
  carGroup.add(driverHood);

  const wheelRadius = PANHARD_178_SHAPE.tireDiameter / 2;
  const wheelX = PANHARD_178_SHAPE.wheelTread / 2;
  for (const z of PANHARD_178_SHAPE.axleZ) {
    for (const side of [-1, 1]) {
      const wheel = tag(new THREE.Mesh(
        new THREE.CylinderGeometry(wheelRadius, wheelRadius, PANHARD_178_SHAPE.tireWidth, 20),
        rubberMat
      ), 'core', `Panhard178_Wheel_${side}_${z}`);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * wheelX, wheelRadius, z);
      carGroup.add(wheel);

      const hub = tag(
        new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.22, 12), metalMat),
        'high',
        `Panhard178_Hub_${side}_${z}`
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      carGroup.add(hub);

      for (let segment = 0; segment < 7; segment++) {
        const angle = Math.PI * (0.12 + 0.76 * (segment + 0.5) / 7);
        const fenderRadius = wheelRadius + 0.075;
        const fender = tag(
          new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.065, 0.30), bodyMat),
          'medium',
          `Panhard178_Fender_${side}_${z}_${segment}`
        );
        fender.position.set(
          side * 0.925,
          wheelRadius + Math.sin(angle) * fenderRadius,
          z + Math.cos(angle) * fenderRadius
        );
        fender.rotation.x = Math.PI / 2 - angle;
        carGroup.add(fender);
      }
    }
  }

  // The rear-facing driving station is a defining identity feature. In the
  // shared frame +X is vehicle-left, matching the documented left-rear seat.
  const frontVisor = tag(
    new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.055), metalMat),
    'high',
    'Panhard178_FrontDriverVisor'
  );
  frontVisor.position.set(lateralX('left', 0.29), 1.46, 1.715);
  frontVisor.rotation.x = -0.20;
  carGroup.add(frontVisor);

  const rearVisor = tag(
    new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.055), metalMat),
    'high',
    'Panhard178_RearDriverVisor'
  );
  rearVisor.position.set(lateralX('left', 0.30), 1.28, -2.08);
  rearVisor.rotation.x = 0.24;
  rearVisor.userData.crewRole = 'rear_driver';
  rearVisor.userData.facingAxis = '-Z';
  carGroup.add(rearVisor);

  for (const side of [-1, 1]) {
    const door = tag(
      new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.62, 0.78), bodyMat),
      'high',
      `Panhard178_SideDoor_${side}`
    );
    door.position.set(side * 0.892, 1.12, -0.15);
    door.rotation.z = side * 0.015;
    carGroup.add(door);

    const lamp = tag(
      new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.10, 10), metalMat),
      'high',
      `Panhard178_Headlamp_${side}`
    );
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.51, 0.96, 2.30);
    carGroup.add(lamp);
  }

  for (const x of [-0.38, -0.19, 0, 0.19, 0.38]) {
    const louver = tag(
      new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.46), metalMat),
      'high',
      `Panhard178_EngineLouver_${x}`
    );
    louver.position.set(x, 1.485, -1.37);
    carGroup.add(louver);
  }

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(
    0,
    PANHARD_178_SHAPE.turretDeckY,
    PANHARD_178_SHAPE.turretCenterZ
  );
  turretGroup.userData.deckContact = {
    hullName: 'Panhard178_PrimaryHull',
    maxGapMeters: 0.02
  };

  const turretRing = tag(
    new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.70, 0.07, 16), turretMat),
    'core',
    'Panhard178_APX3_TurretRing'
  );
  turretRing.position.y = 0.035;
  turretGroup.add(turretRing);

  const turret = tag(
    new THREE.Mesh(
      createApx3TurretGeometry(PANHARD_178_SHAPE.turretLevels),
      turretMat
    ),
    'core',
    'Panhard178_APX3_Turret'
  );
  turret.userData.profileRole = 'asymmetric-apx3-shell';
  turret.userData.profileLevelCount = PANHARD_178_SHAPE.turretLevels.length;
  turretGroup.add(turret);

  const turretRoof = tag(
    new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.035, 0.54), turretMat),
    'medium',
    'Panhard178_APX3_Roof'
  );
  turretRoof.position.set(0, 0.6075, 0.00);
  turretGroup.add(turretRoof);

  const roofHatch = tag(
    new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.045, 0.50), turretMat),
    'medium',
    'Panhard178_APX3_RoofHatch'
  );
  roofHatch.position.set(-0.10, 0.6375, -0.05);
  roofHatch.rotation.z = -0.025;
  turretGroup.add(roofHatch);

  const mantlet = tag(
    new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.27, 0.16), turretMat),
    'core',
    'Panhard178_APX3_Mantlet'
  );
  mantlet.position.set(0.05, PANHARD_178_SHAPE.gunAxisLocalY, 0.69);
  turretGroup.add(mantlet);

  const gunLength = PANHARD_178_SHAPE.gunMuzzleLocalZ - 0.76;
  const barrel = tag(
    new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.040, gunLength, 10), metalMat),
    'core',
    'Panhard178_SA35_25mm'
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(
    0.10,
    PANHARD_178_SHAPE.gunAxisLocalY,
    0.76 + gunLength / 2
  );
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.envelopeRole = 'weaponProjection';
  barrel.userData.profileSource = 'registered-orthographic-inference';
  turretGroup.add(barrel);

  const coax = tag(
    new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.020, 0.50, 7), metalMat),
    'high',
    'coax_barrel'
  );
  coax.rotation.x = Math.PI / 2;
  coax.position.set(lateralX('left', 0.15), 0.235, 0.72);
  coax.userData.weaponMountId = 'coax';
  coax.userData.mountSide = 'left';
  coax.userData.envelopeRole = 'weaponProjection';
  turretGroup.add(coax);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'Panhard_Muzzle';
  muzzle.position.set(
    0.10,
    PANHARD_178_SHAPE.gunAxisLocalY,
    PANHARD_178_SHAPE.gunMuzzleLocalZ
  );
  muzzle.userData.forwardAxis = '+Z';
  turretGroup.add(muzzle);

  carGroup.add(turretGroup);
  carGroup.userData.turret = turretGroup;
  carGroup.userData.barrel = barrel;
  carGroup.userData.muzzle = muzzle;

  const antenna = tag(
    new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.50, 6), metalMat),
    'high',
    'Panhard178_RadioAntenna'
  );
  antenna.position.set(lateralX('right', 0.52), 1.55, 1.72);
  antenna.rotation.z = -0.025;
  antenna.rotation.x = 0.10;
  antenna.userData.envelopeRole = 'flexibleAttachment';
  carGroup.add(antenna);

  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyHull = tag(
    new THREE.Mesh(new THREE.BoxGeometry(1.72, 1.02, 4.24), bodyMat),
    'proxy',
    'Panhard178_ProxyHull'
  );
  proxyHull.position.y = 0.92;
  proxyHull.visible = false;
  proxyGroup.add(proxyHull);
  carGroup.add(proxyGroup);

  carGroup.userData.modelMetadata = {
    designation: PROFILE.designation,
    dimensionsMeters: PROFILE.dimensionsMeters,
    references: [
      ...PROFILE.references,
      ...Object.values(PANHARD_178_SHAPE.sourceEvidence)
    ],
    dataQuality: PROFILE.dataQuality,
    blueprintCalibration: carGroup.userData.blueprintCalibration,
    features: [
      'APX 3 two-man asymmetric octagonal turret',
      '25 mm SA 35 gun',
      '4x4 all-wheel drive',
      'left-rear auxiliary driving position',
      'low tapered rear engine deck',
      'raised forward driver hood'
    ]
  };

  return carGroup;
}
