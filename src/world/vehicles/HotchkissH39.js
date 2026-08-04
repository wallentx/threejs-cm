import * as THREE from 'three';
import {
  HOTCHKISS_H39_VISUAL_DATA
} from '../../content/france1940/vehicleData/HotchkissH39VisualData.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';
import { getVehicleVisualProfile } from './VehicleVisualProfiles.js';

const PROFILE = getVehicleVisualProfile('fr_hotchkiss_h39');

// Preserve the existing flat renderer view while family-owned visual data
// remains the single owner of every moved value.
const H39 = Object.freeze({
  ...HOTCHKISS_H39_VISUAL_DATA.dimensionsMeters,
  hullRearZ: HOTCHKISS_H39_VISUAL_DATA.geometry.hullRearZ,
  hullFrontZ: HOTCHKISS_H39_VISUAL_DATA.geometry.hullFrontZ,
  turretRingY: HOTCHKISS_H39_VISUAL_DATA.geometry.turret.ringY,
  turretCenterZ: HOTCHKISS_H39_VISUAL_DATA.geometry.turret.centerZ,
  gunAxisLocalY: HOTCHKISS_H39_VISUAL_DATA.geometry.mainGun.axisLocalY,
  gunAxisLocalX: HOTCHKISS_H39_VISUAL_DATA.geometry.mainGun.axisLocalX,
  gunMuzzleLocalZ: HOTCHKISS_H39_VISUAL_DATA.geometry.mainGun.muzzleLocalZ,
  ...HOTCHKISS_H39_VISUAL_DATA.geometry.runningGear
});

const HULL_STATIONS = HOTCHKISS_H39_VISUAL_DATA.geometry.hullStations;
const TURRET_RINGS = HOTCHKISS_H39_VISUAL_DATA.geometry.turret.rings;

export const H39_BLUEPRINT_CALIBRATION =
  HOTCHKISS_H39_VISUAL_DATA.blueprint;

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
    indices.push(rearCenter, ring, following);
    indices.push(frontCenter, frontStart + following, frontStart + ring);
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
    indices.push(bottomCenter, segment, following);
    indices.push(topCenter, topStart + following, topStart + segment);
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
  indices.push(0, 1, 2, 0, 2, 3);
  const end = (stations.length - 1) * 4;
  indices.push(end, end + 2, end + 1, end, end + 3, end + 2);
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
    roadWheelY: H39.roadWheelY,
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
