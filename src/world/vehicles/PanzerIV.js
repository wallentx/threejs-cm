import * as THREE from 'three';
import { lateralX } from '../LocalFrame.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from './TrackedRunningGear.js';

const MODEL_ID = 'ger_panzer4';

const PANZER_IV_D = Object.freeze({
  length: 5.92,
  width: 2.84,
  height: 2.68,
  trackWidth: 0.36,
  trackCenterX: 1.2328,
  beltLength: 5.55,
  beltHeight: 1.10,
  beltCenterY: 0.63,
  roadWheelRadius: 0.235,
  roadWheelY: 0.25,
  roadWheelZ: Object.freeze([1.90, 1.39, 0.88, 0.37, -0.09, -0.61, -1.11, -1.62]),
  returnRollerZ: Object.freeze([1.40, 0.45, -0.52, -1.47]),
  frontSprocketZ: 2.45,
  rearIdlerZ: -2.42,
  turretRingY: 1.70,
  turretCenterZ: -0.12,
  gunAxisLocalY: 0.30,
  gunMuzzleLocalZ: 2.12
});

export const PANZER_IV_D_BLUEPRINT_CALIBRATION = Object.freeze({
  version: 'panzer4-ausfd-registered-multiview-v1',
  coordinateFrame: '+Y up, +Z forward, -X vehicle right',
  variantScope: 'Panzerkampfwagen IV Ausf. D, France 1940',
  rigidEnvelopeMeters: Object.freeze({
    length: PANZER_IV_D.length,
    width: PANZER_IV_D.width,
    height: PANZER_IV_D.height
  }),
  sources: Object.freeze([
    Object.freeze({
      title: 'Sd.Kfz. 161 Pz.Kpfw. IV Ausf. D multi-view drawing',
      publisher: 'The-Blueprints.com',
      pageUrl: 'https://www.the-blueprints.com/blueprints/tanks/ww2-tanks-germany-2/78204/view/sdkfz161_pzkpfwiv_ausfd/',
      imageUrl: 'https://www.the-blueprints.com/blueprints-depot/tanks/ww2-tanks-germany-2/sdkfz161-pzkpfwiv-ausfd-8.png',
      use: 'registered side, top, front, running gear, turret, bustle, deck and weapon outlines',
      quality: 'secondary high-resolution orthographic drawing; not a factory production drawing'
    }),
    Object.freeze({
      title: 'Panzer IV collection record',
      publisher: 'The Tank Museum',
      url: 'https://tankmuseum.org/tank-nuts/tank-collection/panzer-iv/',
      use: 'official museum evidence for Ausf. D identity and short-gun origin',
      quality: 'official survivor record; museum vehicle was later up-armored and re-armed'
    }),
    Object.freeze({
      title: 'Frankreich, Panzer IV, Bild 146-1981-070-15',
      publisher: 'Bundesarchiv',
      url: 'https://www.bild.bundesarchiv.de/dba/en/search/?query=Bild+146-1981-070-15',
      use: 'dated 22 June 1940 field silhouette and stowage evidence',
      quality: 'primary archival photograph; perspective view'
    }),
    Object.freeze({
      title: 'Panzer IV Universe technical data',
      publisher: 'Will Phelps',
      url: 'https://panzerivuniverse.phelpscomputerservices.com/Specs.htm',
      use: 'variant and original D 653 manual provenance',
      quality: 'secondary compilation with source annotations'
    })
  ]),
  imageRegistration: Object.freeze({
    sourceImagePixels: Object.freeze({ width: 1116, height: 1556 }),
    side: Object.freeze({
      cropPixels: Object.freeze({ x: 20, y: 15, width: 1060, height: 500 }),
      mirrorX: false,
      vehicleFront: 'image-left',
      rigidDatumPixels: Object.freeze({
        frontX: 42,
        rearX: 1062,
        topY: 29,
        groundY: 499
      }),
      diagnosticOverlay: Object.freeze({
        outputPixels: Object.freeze({ width: 1400, height: 900 }),
        resizedCropPixels: Object.freeze({ width: 970, height: 449 }),
        offsetPixels: Object.freeze([213, 226]),
        artifact: 'screenshots/panzer4-final-overlay.png'
      })
    }),
    top: Object.freeze({
      cropPixels: Object.freeze({ x: 20, y: 520, width: 1060, height: 525 }),
      mirrorX: false,
      vehicleFront: 'image-left'
    }),
    front: Object.freeze({
      cropPixels: Object.freeze({ x: 0, y: 1070, width: 550, height: 480 }),
      mirrorX: false
    }),
    quality: 'side endpoints and height lines registered; front/top retained as reproducible crops and used for plan/front contour fitting'
  }),
  datums: Object.freeze({
    exact: Object.freeze({
      groundLineY: 0,
      rigidHullRearZ: -PANZER_IV_D.length * 0.5,
      rigidHullFrontZ: PANZER_IV_D.length * 0.5,
      rigidHalfWidth: PANZER_IV_D.width * 0.5,
      rigidHeightY: PANZER_IV_D.height,
      roadWheelsPerSide: 8,
      returnRollersPerSide: 4,
      weaponIdentity: '7.5 cm KwK 37 L/24'
    }),
    registeredInferred: Object.freeze({
      trackWidthMeters: PANZER_IV_D.trackWidth,
      roadWheelCentersZ: PANZER_IV_D.roadWheelZ,
      returnRollerCentersZ: PANZER_IV_D.returnRollerZ,
      frontSprocketZ: PANZER_IV_D.frontSprocketZ,
      rearIdlerZ: PANZER_IV_D.rearIdlerZ,
      turretRing: Object.freeze([0, PANZER_IV_D.turretRingY, PANZER_IV_D.turretCenterZ]),
      gunAxis: Object.freeze([
        0.06,
        PANZER_IV_D.turretRingY + PANZER_IV_D.gunAxisLocalY,
        PANZER_IV_D.turretCenterZ + 1.00
      ]),
      quality: 'hand-registered orthographic centers; dimensions are metre-space fits, not claimed factory measurements'
    })
  }),
  allowedDivergences: Object.freeze([
    'loose tools, tow cable, track sag and flexible aerial excluded from exact rigid-envelope ownership',
    'small fasteners simplified below close-inspection LOD',
    'museum survivor not used for later armor or long-gun modifications'
  ])
});

const LOWER_HULL_STATIONS = Object.freeze([
  { z: -2.96, floorHalf: 0.64, floorY: 0.62, sideHalf: 0.76, shoulderY: 0.83, deckHalf: 0.65, roofY: 0.94 },
  { z: -2.56, floorHalf: 0.94, floorY: 0.47, sideHalf: 1.16, shoulderY: 1.08, deckHalf: 1.06, roofY: 1.20 },
  { z: -1.90, floorHalf: 0.96, floorY: 0.45, sideHalf: 1.18, shoulderY: 1.10, deckHalf: 1.08, roofY: 1.22 },
  { z: 1.92, floorHalf: 0.96, floorY: 0.45, sideHalf: 1.18, shoulderY: 1.10, deckHalf: 1.08, roofY: 1.22 },
  { z: 2.50, floorHalf: 0.91, floorY: 0.48, sideHalf: 1.12, shoulderY: 1.05, deckHalf: 1.00, roofY: 1.18 },
  { z: 2.96, floorHalf: 0.61, floorY: 0.62, sideHalf: 0.72, shoulderY: 0.84, deckHalf: 0.61, roofY: 0.92 }
]);

const SUPERSTRUCTURE_STATIONS = Object.freeze([
  { z: -1.78, floorHalf: 0.98, floorY: 1.15, sideHalf: 1.08, shoulderY: 1.55, deckHalf: 0.98, roofY: 1.72 },
  { z: -0.70, floorHalf: 0.98, floorY: 1.16, sideHalf: 1.08, shoulderY: 1.58, deckHalf: 0.98, roofY: 1.75 },
  { z: 1.42, floorHalf: 0.98, floorY: 1.16, sideHalf: 1.08, shoulderY: 1.58, deckHalf: 0.98, roofY: 1.75 },
  { z: 1.94, floorHalf: 0.95, floorY: 1.13, sideHalf: 1.05, shoulderY: 1.55, deckHalf: 0.94, roofY: 1.72 },
  { z: 2.20, floorHalf: 0.79, floorY: 1.03, sideHalf: 0.90, shoulderY: 1.28, deckHalf: 0.77, roofY: 1.42 }
]);

const TURRET_PLAN = Object.freeze([
  [-0.72, -0.94],
  [-0.94, -0.58],
  [-0.96, 0.44],
  [-0.80, 0.84],
  [-0.56, 0.98],
  [0.56, 0.98],
  [0.80, 0.84],
  [0.96, 0.44],
  [0.94, -0.58],
  [0.72, -0.94]
]);

function signedVolume(positions, indices) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    a.fromArray(positions, indices[offset] * 3);
    b.fromArray(positions, indices[offset + 1] * 3);
    c.fromArray(positions, indices[offset + 2] * 3);
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume;
}

function orientOutward(positions, indices) {
  if (signedVolume(positions, indices) >= 0) return indices;
  const result = [...indices];
  for (let offset = 0; offset < result.length; offset += 3) {
    [result[offset + 1], result[offset + 2]] = [result[offset + 2], result[offset + 1]];
  }
  return result;
}

function geometryFromMeshData(positions, indices, name, metadata = {}) {
  const outward = orientOutward(positions, indices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(outward);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = name;
  geometry.userData = {
    ...metadata,
    signedVolumeCubicMeters: signedVolume(positions, outward)
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
  return geometryFromMeshData(positions, indices, name, {
    authoredHull: true,
    profileStations: stations.map(station => ({ ...station })),
    source: PANZER_IV_D_BLUEPRINT_CALIBRATION.sources[0].imageUrl
  });
}

function createTurretGeometry() {
  const positions = [];
  const indices = [];
  const topPlan = TURRET_PLAN.map(([x, z]) => [x * 0.86, z * 0.90]);
  for (const [x, z] of TURRET_PLAN) positions.push(x, 0, z);
  for (const [x, z] of topPlan) positions.push(x, 0.65, z);
  const count = TURRET_PLAN.length;
  for (let edge = 0; edge < count; edge++) {
    const next = (edge + 1) % count;
    indices.push(edge, next, count + edge, next, count + next, count + edge);
  }
  for (let triangle = 1; triangle < count - 1; triangle++) {
    indices.push(0, triangle + 1, triangle);
    indices.push(count, count + triangle, count + triangle + 1);
  }
  return geometryFromMeshData(positions, indices, 'PanzerIVD_FacetedTurretGeometry', {
    registeredPlan: TURRET_PLAN.map(point => [...point]),
    source: PANZER_IV_D_BLUEPRINT_CALIBRATION.sources[0].imageUrl
  });
}

function addMesh(parent, geometry, material, name, lodBand, {
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  envelopeRole = null
} = {}) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.userData.lodBand = lodBand;
  if (envelopeRole) object.userData.envelopeRole = envelopeRole;
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function repositionRunningGear(runningGear) {
  const { roadWheels, sprockets, idlers } = runningGear.userData.trackParts;
  for (let side = 0; side < 2; side++) {
    for (let index = 0; index < PANZER_IV_D.roadWheelZ.length; index++) {
      roadWheels[side * PANZER_IV_D.roadWheelZ.length + index].position.z =
        PANZER_IV_D.roadWheelZ[index];
    }
    sprockets[side].position.z = PANZER_IV_D.frontSprocketZ;
    idlers[side].position.z = PANZER_IV_D.rearIdlerZ;
  }
  runningGear.userData.blueprintAxleZ = {
    roadWheels: [...PANZER_IV_D.roadWheelZ],
    frontSprocket: PANZER_IV_D.frontSprocketZ,
    rearIdler: PANZER_IV_D.rearIdlerZ
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
    for (const z of PANZER_IV_D.roadWheelZ) {
      matrix.compose(
        new THREE.Vector3(side * 1.252, PANZER_IV_D.roadWheelY, z),
        quaternion,
        scale
      );
      wheels.setMatrixAt(instance++, matrix);
    }
  }
  wheels.instanceMatrix.needsUpdate = true;
  wheels.userData.blueprintAxleZ = [...PANZER_IV_D.roadWheelZ];
}

function addSuspension(parent, bodyMaterial, metalMaterial) {
  const pairCenters = [];
  for (let pair = 0; pair < 4; pair++) {
    pairCenters.push(
      (PANZER_IV_D.roadWheelZ[pair * 2] + PANZER_IV_D.roadWheelZ[pair * 2 + 1]) * 0.5
    );
  }
  for (const side of [-1, 1]) {
    for (let pair = 0; pair < pairCenters.length; pair++) {
      const z = pairCenters[pair];
      addMesh(
        parent,
        new THREE.BoxGeometry(0.09, 0.34, 0.16),
        bodyMaterial,
        `${side < 0 ? 'Right' : 'Left'}PanzerIVBogie_${pair + 1}`,
        'medium',
        { position: [side * 1.255, 0.50, z] }
      );
      for (let leaf = 0; leaf < 3; leaf++) {
        addMesh(
          parent,
          new THREE.BoxGeometry(0.055, 0.023, 0.62 - leaf * 0.07),
          metalMaterial,
          `${side < 0 ? 'Right' : 'Left'}PanzerIVLeaf_${pair + 1}_${leaf + 1}`,
          'high',
          { position: [side * 1.275, 0.67 + leaf * 0.025, z] }
        );
      }
    }
    for (let index = 0; index < PANZER_IV_D.returnRollerZ.length; index++) {
      addMesh(
        parent,
        new THREE.CylinderGeometry(0.105, 0.105, 0.15, 10),
        bodyMaterial,
        `${side < 0 ? 'Right' : 'Left'}PanzerIVReturnRoller_${index + 1}`,
        'medium',
        {
          position: [side * 1.245, 0.92, PANZER_IV_D.returnRollerZ[index]],
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
  proxy.visible = false;
  proxy.castShadow = true;
  proxy.receiveShadow = true;
  proxy.userData.lodBand = 'proxy';
  proxy.userData.proxySource = source.name;
  proxyGroup.add(proxy);
  return proxy;
}

export function createPanzerIVMesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = MODEL_ID;

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#41484d',
    roughness: 0.76,
    metalness: 0.14
  }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#485056',
    roughness: 0.74,
    metalness: 0.14
  }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#1a1d20',
    roughness: 0.91,
    metalness: 0.30
  }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#111416',
    metalness: 0.74,
    roughness: 0.42
  }), 'metal');

  const lowerHull = addMesh(
    tankGroup,
    createHullLoftGeometry(LOWER_HULL_STATIONS, 'PanzerIVD_LowerHullGeometry'),
    bodyMat,
    'PanzerIVD_PrimaryHull',
    'core'
  );
  lowerHull.userData.authoredHull = true;
  const superstructure = addMesh(
    tankGroup,
    createHullLoftGeometry(SUPERSTRUCTURE_STATIONS, 'PanzerIVD_SuperstructureGeometry'),
    bodyMat,
    'PanzerIVD_SteppedSuperstructure',
    'core'
  );

  const fenders = [];
  for (const side of [-1, 1]) {
    fenders.push(addMesh(
      tankGroup,
      new THREE.BoxGeometry(0.37, 0.055, 5.35),
      bodyMat,
      `${side < 0 ? 'Right' : 'Left'}PanzerIVFender`,
      'core',
      { position: [side * 1.235, 1.205, 0.25] }
    ));
  }

  const runningGear = createTrackedRunningGear({
    id: 'PanzerIVRunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: PANZER_IV_D.trackCenterX,
    trackWidth: PANZER_IV_D.trackWidth,
    beltLength: PANZER_IV_D.beltLength,
    beltHeight: PANZER_IV_D.beltHeight,
    centerY: PANZER_IV_D.beltCenterY,
    roadWheelRadius: PANZER_IV_D.roadWheelRadius,
    roadWheelCount: 8,
    roadWheelY: PANZER_IV_D.roadWheelY,
    roadWheelZStart: PANZER_IV_D.roadWheelZ[0],
    roadWheelSpacing: 0.51,
    sprocketRadius: 0.41,
    idlerRadius: 0.36,
    linkPitch: 0.12
  });
  repositionRunningGear(runningGear);
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;
  addSuspension(tankGroup, turretMat, metalMat);

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, PANZER_IV_D.turretRingY, PANZER_IV_D.turretCenterZ);
  tankGroup.add(turretGroup);

  const turret = addMesh(
    turretGroup,
    createTurretGeometry(),
    turretMat,
    'PanzerIVD_FacetedTurret',
    'core'
  );
  turret.userData.articulatedPart = 'turret-shell';

  const bustle = addMesh(
    turretGroup,
    new THREE.BoxGeometry(1.60, 0.52, 0.68),
    turretMat,
    'PanzerIVD_RearTurretBustle',
    'core',
    { position: [0, 0.32, -1.18], rotation: [-0.06, 0, 0] }
  );
  bustle.userData.registeredOutlinePart = 'rear-bustle';

  const mantlet = addMesh(
    turretGroup,
    new THREE.BoxGeometry(0.82, 0.46, 0.16),
    turretMat,
    'PanzerIVD_BoxMantlet',
    'medium',
    { position: [0.06, PANZER_IV_D.gunAxisLocalY, 1.02] }
  );
  mantlet.userData.articulatedPart = 'gun-mantlet';

  const barrelLength = 1.08;
  const barrel = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.065, 0.085, barrelLength, 10),
    metalMat,
    'PanzerIVD_KwK37Barrel',
    'core',
    {
      position: [0.06, PANZER_IV_D.gunAxisLocalY, 1.04 + barrelLength * 0.5],
      rotation: [Math.PI / 2, 0, 0],
      envelopeRole: 'weaponProjection'
    }
  );
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.weaponMountId = 'main';
  barrel.userData.weaponIdentity = '7.5 cm KwK 37 L/24';
  barrel.userData.externalLengthMeters = barrelLength;

  for (const [index, spec] of [
    { radius: 0.105, length: 0.18, z: 1.14 },
    { radius: 0.088, length: 0.20, z: 1.30 }
  ].entries()) {
    addMesh(
      turretGroup,
      new THREE.CylinderGeometry(spec.radius * 0.88, spec.radius, spec.length, 10),
      metalMat,
      `PanzerIVD_GunCollar_${index + 1}`,
      'medium',
      {
        position: [0.06, PANZER_IV_D.gunAxisLocalY, spec.z],
        rotation: [Math.PI / 2, 0, 0],
        envelopeRole: 'weaponProjection'
      }
    );
  }

  const coaxLength = 0.43;
  const coax = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.014, 0.020, coaxLength, 7),
    metalMat,
    'coax_barrel',
    'high',
    {
      position: [lateralX('right', 0.25), 0.38, 1.38 - coaxLength * 0.5],
      rotation: [Math.PI / 2, 0, 0],
      envelopeRole: 'weaponProjection'
    }
  );
  coax.userData.weaponMountId = 'coax';
  coax.userData.mountSide = 'right';

  const muzzle = new THREE.Object3D();
  muzzle.name = 'PzIV_Muzzle';
  muzzle.position.set(0.06, PANZER_IV_D.gunAxisLocalY, PANZER_IV_D.gunMuzzleLocalZ);
  muzzle.userData.forwardAxis = '+Z';
  turretGroup.add(muzzle);

  const cupola = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.34, 0.38, 0.24, 12),
    turretMat,
    'PanzerIVD_CommanderCupola',
    'medium',
    { position: [0.08, 0.82, -0.25] }
  );
  cupola.userData.registeredOutlinePart = 'commander-cupola';
  const hatch = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.33, 0.33, 0.05, 12),
    turretMat,
    'PanzerIVD_CupolaHatch',
    'high',
    { position: [0.08, 0.955, -0.25] }
  );
  hatch.userData.envelopeDatum = 'published-height-2.68m';

  const driverVisor = addMesh(
    tankGroup,
    new THREE.BoxGeometry(0.42, 0.18, 0.075),
    turretMat,
    'PanzerIVD_DriverVisor',
    'high',
    { position: [0.48, 1.58, 2.12] }
  );
  driverVisor.userData.mountSide = 'left';
  const hullMgBall = addMesh(
    tankGroup,
    new THREE.SphereGeometry(0.075, 10, 7),
    turretMat,
    'PanzerIVD_HullMGBallMount',
    'medium',
    { position: [lateralX('right', 0.50), 1.58, 2.15] }
  );
  hullMgBall.userData.weaponMountId = 'hull_mg';
  hullMgBall.userData.mountSide = 'right';

  for (const side of [-1, 1]) {
    addMesh(
      tankGroup,
      new THREE.CylinderGeometry(0.085, 0.085, 0.10, 8),
      metalMat,
      `${side < 0 ? 'Right' : 'Left'}PanzerIVHeadlamp`,
      'high',
      {
        position: [side * 0.83, 1.39, 2.45],
        rotation: [Math.PI / 2, 0, 0]
      }
    );
  }

  // Ausf. D rear deck: two banks of grilles, plus the conspicuous spare wheel.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 5; index++) {
      addMesh(
        tankGroup,
        new THREE.BoxGeometry(0.48, 0.026, 0.085),
        metalMat,
        `${side < 0 ? 'Right' : 'Left'}PanzerIVEngineGrille_${index + 1}`,
        'high',
        { position: [side * 0.60, 1.78, -1.22 - index * 0.13] }
      );
    }
  }
  addMesh(
    tankGroup,
    new THREE.TorusGeometry(0.32, 0.07, 8, 16),
    metalMat,
    'PanzerIVD_DeckSpareWheel',
    'medium',
    { position: [-0.73, 1.87, -1.67], rotation: [0, Math.PI / 2, 0] }
  );

  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  cloneProxyPart(lowerHull, 'PanzerIVD_ProxyLowerHull', proxyGroup);
  cloneProxyPart(superstructure, 'PanzerIVD_ProxySuperstructureHull', proxyGroup);
  for (const [index, fender] of fenders.entries()) {
    cloneProxyPart(fender, `PanzerIVD_ProxyFender_${index + 1}`, proxyGroup);
  }
  const proxyRunningGear = createTrackedRunningGearProxy({
    id: 'PanzerIVDProxyRunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: PANZER_IV_D.trackCenterX,
    trackWidth: PANZER_IV_D.trackWidth,
    beltLength: PANZER_IV_D.beltLength,
    beltHeight: PANZER_IV_D.beltHeight,
    centerY: PANZER_IV_D.beltCenterY,
    roadWheelRadius: PANZER_IV_D.roadWheelRadius,
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
    designation: 'Panzerkampfwagen IV Ausf. D',
    dimensionsMeters: {
      length: PANZER_IV_D.length,
      width: PANZER_IV_D.width,
      height: PANZER_IV_D.height
    },
    blueprintCalibration: PANZER_IV_D_BLUEPRINT_CALIBRATION,
    blueprintFit: {
      views: ['side', 'front', 'top'],
      primaryFitView: 'side',
      rigidEnvelope: 'exact',
      landmarkFit: 'registered published orthographic drawing; mechanical centers inferred'
    },
    features: [
      '7.5 cm KwK 37 L/24 short howitzer',
      'eight road wheels in four paired bogies per side',
      'four return rollers per side',
      'front drive sprocket and rear idler',
      'stepped driver front',
      'large faceted turret with rear bustle',
      'right-side coaxial and hull machine guns',
      'five-man crew'
    ]
  };

  return tankGroup;
}
