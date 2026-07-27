import * as THREE from 'three';
import { lateralX } from '../LocalFrame.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from './TrackedRunningGear.js';

const MODEL_ID = 'ger_panzer3';

const PANZER_III_D = Object.freeze({
  length: 5.38,
  width: 2.91,
  height: 2.50,
  trackWidth: 0.36,
  trackCenterX: 1.2678,
  beltLength: 5.18,
  beltHeight: 1.00,
  beltCenterY: 0.575,
  roadWheelRadius: 0.235,
  roadWheelY: 0.255,
  roadWheelZ: Object.freeze([1.08, 0.74, 0.40, 0.06, -0.60, -0.94, -1.28, -1.62]),
  returnRollerZ: Object.freeze([0.83, -0.26, -1.33]),
  frontSprocketZ: 1.94,
  rearIdlerZ: -2.33,
  turretRingY: 1.58,
  turretCenterZ: 0.12,
  gunAxisLocalY: 0.32,
  gunMuzzleLocalZ: 2.34
});

export const PANZER_III_D_BLUEPRINT_CALIBRATION = Object.freeze({
  version: 'panzer3-ausfd-registered-multiview-v1',
  coordinateFrame: '+Y up, +Z forward, -X vehicle right',
  variantScope: 'Panzerkampfwagen III Ausf. D, early eight-wheel suspension',
  source: Object.freeze({
    title: 'Sd.Kfz. 141 Pz.Kpfw. III Ausf. D multi-view drawing',
    publisher: 'The-Blueprints.com',
    pageUrl: 'https://www.the-blueprints.com/blueprints/tanks/ww2-tanks-germany-2/78193/view/sdkfz141_pzkpfwiii_ausfd/',
    imageUrl: 'https://www.the-blueprints.com/blueprints-depot/tanks/ww2-tanks-germany-2/sdkfz141-pzkpfwiii-ausfd-4.png',
    imageSizePixels: Object.freeze([897, 1345]),
    provenance: 'secondary high-resolution orthographic drawing; not a factory production drawing'
  }),
  corroboration: Object.freeze([
    Object.freeze({
      title: 'Polen, Panzer III mit Panzersoldaten, Bild 101I-318-0083-30',
      publisher: 'Bundesarchiv / Wikimedia Commons',
      url: 'https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-318-0083-30,_Polen,_Panzer_III_mit_Panzersoldaten.jpg',
      use: 'dated 1939 field silhouette and early Ausf. D running-gear identity',
      quality: 'primary archival photograph; perspective view'
    }),
    Object.freeze({
      title: 'Panzerkampfwagen III',
      publisher: 'German-language Wikipedia',
      url: 'https://de.wikipedia.org/wiki/Panzerkampfwagen_III',
      use: 'published A-D dimensions and 3.7 cm KwK 36 armament cross-check',
      quality: 'secondary compilation; dimensional disagreement retained below'
    })
  ]),
  imageRegistration: Object.freeze({
    side: Object.freeze({
      cropPixels: Object.freeze({ x: 0, y: 0, width: 897, height: 470 }),
      mirrorX: true,
      vehicleFront: 'image-right before mirror',
      rigidDatumPixels: Object.freeze({
        rearX: 18,
        frontX: 888,
        topY: 91,
        groundY: 445
      }),
      axlePixels: Object.freeze({
        rearIdler: Object.freeze([76, 349]),
        roadWheels: Object.freeze([
          Object.freeze([191, 405]), Object.freeze([246, 405]),
          Object.freeze([301, 405]), Object.freeze([356, 405]),
          Object.freeze([462, 405]), Object.freeze([517, 405]),
          Object.freeze([573, 405]), Object.freeze([628, 405])
        ]),
        frontSprocket: Object.freeze([766, 350]),
        returnRollers: Object.freeze([
          Object.freeze([238, 315]),
          Object.freeze([411, 315]),
          Object.freeze([587, 315])
        ])
      }),
      diagnosticOverlay: 'screenshots/panzer3-side-high-overlay.png'
    }),
    top: Object.freeze({
      cropPixels: Object.freeze({ x: 0, y: 450, width: 897, height: 465 }),
      rotateDegrees: 90,
      mirrorX: false,
      vehicleFront: 'image-right before clockwise rotation',
      diagnosticOverlay: 'screenshots/panzer3-top-high-overlay.png'
    }),
    front: Object.freeze({
      cropPixels: Object.freeze({ x: 0, y: 915, width: 450, height: 430 }),
      mirrorX: false,
      diagnosticOverlay: 'screenshots/panzer3-front-high-overlay.png'
    }),
    scalePolicy: 'each orthographic view independently normalized to the authoritative game envelope',
    quality: 'registered from explicit crops and rigid datums; internal landmarks are hand-fitted'
  }),
  datums: Object.freeze({
    authoritativeGameEnvelope: Object.freeze({
      valueMeters: Object.freeze({
        length: PANZER_III_D.length,
        width: PANZER_III_D.width,
        height: PANZER_III_D.height
      }),
      quality: 'exact repository simulation contract, not claimed as an Ausf. D factory dimension'
    }),
    historicalPublishedEnvelope: Object.freeze({
      valueMeters: Object.freeze({ length: 5.69, width: 2.81, height: 2.54 }),
      quality: 'secondary published A-D dimensions; conflicts with repository simulation contract'
    }),
    roadWheelsPerSide: Object.freeze({ value: 8, quality: 'variant-identifying historical exact' }),
    returnRollersPerSide: Object.freeze({ value: 3, quality: 'variant-identifying historical exact' }),
    weaponIdentity: Object.freeze({ value: '3.7 cm KwK 36 L/45', quality: 'historical exact' }),
    roadWheelCentersZ: Object.freeze({
      valueMeters: PANZER_III_D.roadWheelZ,
      quality: 'inferred from registered orthographic drawing'
    }),
    turretRing: Object.freeze({
      valueMeters: Object.freeze([0, PANZER_III_D.turretRingY, PANZER_III_D.turretCenterZ]),
      quality: 'inferred from registered side and top views'
    }),
    gunAxis: Object.freeze({
      valueMeters: Object.freeze([
        0,
        PANZER_III_D.turretRingY + PANZER_III_D.gunAxisLocalY,
        PANZER_III_D.turretCenterZ + 0.93
      ]),
      quality: 'inferred from registered side and front views'
    })
  }),
  allowedDivergences: Object.freeze([
    'repository 5.38 x 2.91 x 2.50 m rigid envelope retained despite published A-D dimensional disagreement',
    'drawing turret is traversed toward the rear; game model records the fit with turret normalized to forward zero',
    'aerial, tow cable, tools, track sag and weapon projections excluded from rigid-envelope ownership',
    'drawing detail below close LOD simplified; no unsupported factory-level precision is claimed'
  ])
});

const LOWER_HULL_STATIONS = Object.freeze([
  { z: -2.69, floorHalf: 0.66, floorY: 0.58, sideHalf: 0.78, shoulderY: 0.82, deckHalf: 0.65, roofY: 0.94 },
  { z: -2.38, floorHalf: 0.88, floorY: 0.46, sideHalf: 1.10, shoulderY: 1.04, deckHalf: 1.00, roofY: 1.16 },
  { z: -1.72, floorHalf: 0.91, floorY: 0.44, sideHalf: 1.12, shoulderY: 1.07, deckHalf: 1.02, roofY: 1.19 },
  { z: 1.82, floorHalf: 0.91, floorY: 0.44, sideHalf: 1.12, shoulderY: 1.07, deckHalf: 1.02, roofY: 1.19 },
  { z: 2.35, floorHalf: 0.84, floorY: 0.48, sideHalf: 1.05, shoulderY: 1.03, deckHalf: 0.91, roofY: 1.13 },
  { z: 2.69, floorHalf: 0.58, floorY: 0.62, sideHalf: 0.68, shoulderY: 0.82, deckHalf: 0.56, roofY: 0.91 }
]);

const FIGHTING_HULL_STATIONS = Object.freeze([
  { z: -0.72, floorHalf: 0.93, floorY: 1.12, sideHalf: 1.02, shoulderY: 1.43, deckHalf: 0.92, roofY: 1.60 },
  { z: 1.30, floorHalf: 0.93, floorY: 1.12, sideHalf: 1.02, shoulderY: 1.43, deckHalf: 0.92, roofY: 1.60 },
  { z: 1.72, floorHalf: 0.87, floorY: 1.09, sideHalf: 0.97, shoulderY: 1.38, deckHalf: 0.85, roofY: 1.57 },
  { z: 1.94, floorHalf: 0.71, floorY: 1.01, sideHalf: 0.82, shoulderY: 1.23, deckHalf: 0.69, roofY: 1.39 }
]);

const ENGINE_DECK_STATIONS = Object.freeze([
  { z: -2.38, floorHalf: 0.91, floorY: 1.08, sideHalf: 0.98, shoulderY: 1.17, deckHalf: 0.88, roofY: 1.25 },
  { z: -1.95, floorHalf: 0.94, floorY: 1.10, sideHalf: 1.01, shoulderY: 1.29, deckHalf: 0.91, roofY: 1.42 },
  { z: -1.26, floorHalf: 0.94, floorY: 1.11, sideHalf: 1.02, shoulderY: 1.40, deckHalf: 0.92, roofY: 1.54 },
  { z: -0.72, floorHalf: 0.93, floorY: 1.12, sideHalf: 1.02, shoulderY: 1.43, deckHalf: 0.92, roofY: 1.60 }
]);

const TURRET_PLAN = Object.freeze([
  [-0.54, -0.84], [-0.75, -0.58], [-0.78, 0.40],
  [-0.62, 0.72], [-0.40, 0.88], [0.40, 0.88],
  [0.62, 0.72], [0.78, 0.40], [0.75, -0.58], [0.54, -0.84]
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
  const outward = [...indices];
  for (let offset = 0; offset < outward.length; offset += 3) {
    [outward[offset + 1], outward[offset + 2]] =
      [outward[offset + 2], outward[offset + 1]];
  }
  return outward;
}

function finalizeGeometry(positions, indices, name, metadata = {}) {
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
  return finalizeGeometry(positions, indices, name, {
    authoredHull: true,
    profileStations: stations.map(station => ({ ...station })),
    source: PANZER_III_D_BLUEPRINT_CALIBRATION.source.imageUrl
  });
}

function createTurretGeometry() {
  const positions = [];
  const indices = [];
  const top = TURRET_PLAN.map(([x, z]) => [x * 0.84, z * 0.89]);
  for (const [x, z] of TURRET_PLAN) positions.push(x, 0, z);
  for (const [x, z] of top) positions.push(x, 0.62, z);
  const count = TURRET_PLAN.length;
  for (let edge = 0; edge < count; edge++) {
    const next = (edge + 1) % count;
    indices.push(edge, next, count + edge, next, count + next, count + edge);
  }
  for (let triangle = 1; triangle < count - 1; triangle++) {
    indices.push(0, triangle + 1, triangle);
    indices.push(count, count + triangle, count + triangle + 1);
  }
  return finalizeGeometry(positions, indices, 'PanzerIIID_EarlyTurretGeometry', {
    registeredPlan: TURRET_PLAN.map(point => [...point]),
    source: PANZER_III_D_BLUEPRINT_CALIBRATION.source.imageUrl
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
    for (let index = 0; index < PANZER_III_D.roadWheelZ.length; index++) {
      roadWheels[side * PANZER_III_D.roadWheelZ.length + index].position.z =
        PANZER_III_D.roadWheelZ[index];
    }
    sprockets[side].position.z = PANZER_III_D.frontSprocketZ;
    idlers[side].position.z = PANZER_III_D.rearIdlerZ;
  }
  runningGear.userData.blueprintAxleZ = {
    roadWheels: [...PANZER_III_D.roadWheelZ],
    frontSprocket: PANZER_III_D.frontSprocketZ,
    rearIdler: PANZER_III_D.rearIdlerZ
  };
}

function repositionProxyWheels(proxy) {
  const wheels = proxy.getObjectByName('ProxyRoadWheels');
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, Math.PI / 2)
  );
  const scale = new THREE.Vector3(1, 1, 1);
  let instance = 0;
  for (const side of [-1, 1]) {
    for (const z of PANZER_III_D.roadWheelZ) {
      matrix.compose(
        new THREE.Vector3(
          side * (PANZER_III_D.trackCenterX + PANZER_III_D.trackWidth * 0.08),
          PANZER_III_D.roadWheelY,
          z
        ),
        rotation,
        scale
      );
      wheels.setMatrixAt(instance++, matrix);
    }
  }
  wheels.instanceMatrix.needsUpdate = true;
  wheels.userData.blueprintAxleZ = [...PANZER_III_D.roadWheelZ];
}

function addLeafSpringSuspension(parent, bodyMaterial, metalMaterial) {
  for (const side of [-1, 1]) {
    for (let pair = 0; pair < 4; pair++) {
      const first = pair * 2;
      const z = (
        PANZER_III_D.roadWheelZ[first] + PANZER_III_D.roadWheelZ[first + 1]
      ) * 0.5;
      addMesh(
        parent,
        new THREE.BoxGeometry(0.085, 0.31, 0.15),
        bodyMaterial,
        `${side < 0 ? 'Right' : 'Left'}PanzerIIIBogie_${pair + 1}`,
        'medium',
        { position: [side * 1.29, 0.51, z] }
      );
      for (let leaf = 0; leaf < 4; leaf++) {
        addMesh(
          parent,
          new THREE.BoxGeometry(0.052, 0.022, 0.68 - leaf * 0.065),
          metalMaterial,
          `${side < 0 ? 'Right' : 'Left'}PanzerIIILeafSpring_${pair + 1}_${leaf + 1}`,
          'high',
          { position: [side * 1.31, 0.67 + leaf * 0.024, z] }
        );
      }
    }
    for (let index = 0; index < PANZER_III_D.returnRollerZ.length; index++) {
      addMesh(
        parent,
        new THREE.CylinderGeometry(0.105, 0.105, 0.145, 10),
        bodyMaterial,
        `${side < 0 ? 'Right' : 'Left'}PanzerIIIReturnRoller_${index + 1}`,
        'medium',
        {
          position: [side * 1.285, 0.91, PANZER_III_D.returnRollerZ[index]],
          rotation: [0, 0, Math.PI / 2]
        }
      );
    }
  }
}

function cloneProxyPart(source, name, parent) {
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
  parent.add(proxy);
  return proxy;
}

export function createPanzerIIIMesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = MODEL_ID;

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#40484d',
    roughness: 0.77,
    metalness: 0.14
  }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#475055',
    roughness: 0.75,
    metalness: 0.14
  }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#191d20',
    roughness: 0.91,
    metalness: 0.31
  }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#111416',
    roughness: 0.42,
    metalness: 0.74
  }), 'metal');

  const lowerHull = addMesh(
    tankGroup,
    createHullLoftGeometry(LOWER_HULL_STATIONS, 'PanzerIIID_LowerHullGeometry'),
    bodyMat,
    'PanzerIIID_PrimaryHull',
    'core'
  );
  lowerHull.userData.authoredHull = true;

  const fightingHull = addMesh(
    tankGroup,
    createHullLoftGeometry(FIGHTING_HULL_STATIONS, 'PanzerIIID_FightingHullGeometry'),
    bodyMat,
    'PanzerIIID_SteppedFightingHull',
    'core'
  );

  const engineDeck = addMesh(
    tankGroup,
    createHullLoftGeometry(ENGINE_DECK_STATIONS, 'PanzerIIID_EngineDeckGeometry'),
    bodyMat,
    'PzIII_EngineDeck',
    'core'
  );
  engineDeck.userData.surfaceRole = 'rear-hull-deck';
  engineDeck.userData.calibrationRole = 'stepped-sloping-engine-deck';

  const fenders = [];
  for (const side of [-1, 1]) {
    fenders.push(addMesh(
      tankGroup,
      new THREE.BoxGeometry(0.30, 0.052, 5.10),
      bodyMat,
      `${side < 0 ? 'Right' : 'Left'}PanzerIIIFender`,
      'core',
      { position: [side * 1.28, 1.18, 0.10] }
    ));
  }

  const runningGear = createTrackedRunningGear({
    id: 'PanzerIIIRunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: PANZER_III_D.trackCenterX,
    trackWidth: PANZER_III_D.trackWidth,
    beltLength: PANZER_III_D.beltLength,
    beltHeight: PANZER_III_D.beltHeight,
    centerY: PANZER_III_D.beltCenterY,
    roadWheelRadius: PANZER_III_D.roadWheelRadius,
    roadWheelCount: 8,
    roadWheelY: PANZER_III_D.roadWheelY,
    roadWheelZStart: PANZER_III_D.roadWheelZ[0],
    roadWheelSpacing: 0.47,
    sprocketRadius: 0.39,
    idlerRadius: 0.36,
    linkPitch: 0.12
  });
  repositionRunningGear(runningGear);
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;
  addLeafSpringSuspension(tankGroup, turretMat, metalMat);

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, PANZER_III_D.turretRingY, PANZER_III_D.turretCenterZ);
  tankGroup.add(turretGroup);

  const turret = addMesh(
    turretGroup,
    createTurretGeometry(),
    turretMat,
    'PanzerIIID_ThreeManTurret',
    'core'
  );
  turret.userData.articulatedPart = 'turret-shell';
  turret.userData.crewCapacity = 3;

  const bustle = addMesh(
    turretGroup,
    new THREE.BoxGeometry(1.02, 0.46, 0.48),
    turretMat,
    'PanzerIIID_TurretBustle',
    'core',
    { position: [0, 0.29, -0.94], rotation: [-0.05, 0, 0] }
  );
  bustle.userData.registeredOutlinePart = 'early-rear-bustle';

  const mantlet = addMesh(
    turretGroup,
    new THREE.BoxGeometry(0.70, 0.42, 0.15),
    turretMat,
    'PanzerIIID_BoxMantlet',
    'medium',
    { position: [0, PANZER_III_D.gunAxisLocalY, 0.93] }
  );
  mantlet.userData.articulatedPart = 'gun-mantlet';

  const barrelLength = 1.34;
  const barrel = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.027, 0.052, barrelLength, 10),
    metalMat,
    'PanzerIIID_KwK36Barrel',
    'core',
    {
      position: [0, PANZER_III_D.gunAxisLocalY, 0.98 + barrelLength * 0.5],
      rotation: [Math.PI / 2, 0, 0],
      envelopeRole: 'weaponProjection'
    }
  );
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.weaponMountId = 'main';
  barrel.userData.weaponIdentity = '3.7 cm KwK 36 L/45';
  barrel.userData.externalLengthMeters = barrelLength;

  const muzzle = new THREE.Object3D();
  muzzle.name = 'PzIII_Muzzle';
  muzzle.position.set(0, PANZER_III_D.gunAxisLocalY, PANZER_III_D.gunMuzzleLocalZ);
  muzzle.userData.forwardAxis = '+Z';
  turretGroup.add(muzzle);

  const coaxLength = 0.46;
  const coax = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.014, 0.020, coaxLength, 7),
    metalMat,
    'coax_barrel',
    'high',
    {
      position: [lateralX('right', 0.22), 0.30, 1.15],
      rotation: [Math.PI / 2, 0, 0],
      envelopeRole: 'weaponProjection'
    }
  );
  coax.userData.weaponMountId = 'coax';
  coax.userData.mountSide = 'right';
  coax.userData.weaponIdentity = 'MG 34';
  coax.userData.placementQuality = 'blueprint-registered orthographic drawing';
  coax.userData.referenceUrl = PANZER_III_D_BLUEPRINT_CALIBRATION.source.pageUrl;
  const coaxMuzzle = new THREE.Object3D();
  coaxMuzzle.name = 'coax_muzzle';
  coaxMuzzle.position.set(lateralX('right', 0.22), 0.30, 1.38);
  coaxMuzzle.userData = {
    weaponMountId: 'coax',
    forwardAxis: '+Z',
    envelopeRole: 'weaponProjection',
    mountSide: 'right',
    placementQuality: 'blueprint-registered orthographic drawing',
    referenceUrl: PANZER_III_D_BLUEPRINT_CALIBRATION.source.pageUrl
  };
  turretGroup.add(coaxMuzzle);

  const cupola = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.31, 0.35, 0.22, 12),
    turretMat,
    'PanzerIIID_CommanderCupola',
    'medium',
    { position: [0.06, 0.79, -0.22] }
  );
  cupola.userData.envelopeDatum = 'authoritative-height-2.50m';
  addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.30, 0.30, 0.045, 12),
    turretMat,
    'PanzerIIID_CupolaHatch',
    'high',
    { position: [0.06, 0.8975, -0.22] }
  );

  const driverVisor = addMesh(
    tankGroup,
    new THREE.BoxGeometry(0.40, 0.17, 0.07),
    turretMat,
    'PanzerIIID_DriverVisor',
    'high',
    { position: [0.43, 1.45, 1.91] }
  );
  driverVisor.userData.mountSide = 'left';

  const hullMgBall = addMesh(
    tankGroup,
    new THREE.SphereGeometry(0.083, 10, 7),
    turretMat,
    'PanzerIIID_HullMGBallMount',
    'medium',
    { position: [lateralX('right', 0.48), 1.45, 1.91] }
  );
  hullMgBall.userData.weaponMountId = 'hull_mg';
  hullMgBall.userData.mountSide = 'right';
  hullMgBall.userData.weaponIdentity = 'MG 34';
  hullMgBall.userData.placementQuality = 'blueprint-registered orthographic drawing';
  hullMgBall.userData.referenceUrl = PANZER_III_D_BLUEPRINT_CALIBRATION.source.pageUrl;
  const hullMgLength = 0.34;
  const hullMg = addMesh(
    tankGroup,
    new THREE.CylinderGeometry(0.014, 0.020, hullMgLength, 7),
    metalMat,
    'hull_mg_barrel',
    'high',
    {
      position: [lateralX('right', 0.48), 1.45, 1.91 + hullMgLength * 0.5],
      rotation: [Math.PI / 2, 0, 0],
      envelopeRole: 'weaponProjection'
    }
  );
  hullMg.userData = {
    ...hullMg.userData,
    weaponMountId: 'hull_mg',
    weaponIdentity: 'MG 34',
    mountSide: 'right',
    placementQuality: 'blueprint-registered orthographic drawing',
    referenceUrl: PANZER_III_D_BLUEPRINT_CALIBRATION.source.pageUrl
  };
  const hullMgMuzzle = new THREE.Object3D();
  hullMgMuzzle.name = 'hull_mg_muzzle';
  hullMgMuzzle.position.set(lateralX('right', 0.48), 1.45, 1.91 + hullMgLength);
  hullMgMuzzle.userData = {
    weaponMountId: 'hull_mg',
    forwardAxis: '+Z',
    envelopeRole: 'weaponProjection',
    mountSide: 'right',
    placementQuality: 'blueprint-registered orthographic drawing',
    referenceUrl: PANZER_III_D_BLUEPRINT_CALIBRATION.source.pageUrl
  };
  tankGroup.add(hullMgMuzzle);

  for (const side of [-1, 1]) {
    addMesh(
      tankGroup,
      new THREE.CylinderGeometry(0.08, 0.08, 0.09, 8),
      metalMat,
      `${side < 0 ? 'Right' : 'Left'}PanzerIIIHeadlamp`,
      'high',
      {
        position: [side * 0.86, 1.31, 2.25],
        rotation: [Math.PI / 2, 0, 0]
      }
    );
  }

  for (const side of [-1, 1]) {
    for (let index = 0; index < 6; index++) {
      const z = -2.08 + index * 0.17;
      const y = 1.38 + (z + 2.08) * 0.17;
      addMesh(
        tankGroup,
        new THREE.BoxGeometry(0.60, 0.025, 0.085),
        metalMat,
        `${side < 0 ? 'Right' : 'Left'}PanzerIIIEngineLouvre_${index + 1}`,
        'high',
        {
          position: [side * 0.49, y, z],
          rotation: [-0.17, 0, 0]
        }
      );
    }
  }

  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  cloneProxyPart(lowerHull, 'PanzerIIID_ProxyLowerHull', proxyGroup);
  cloneProxyPart(fightingHull, 'PanzerIIID_ProxyFightingHull', proxyGroup);
  cloneProxyPart(engineDeck, 'PanzerIIID_ProxyEngineDeck', proxyGroup);
  for (const [index, fender] of fenders.entries()) {
    cloneProxyPart(fender, `PanzerIIID_ProxyFender_${index + 1}`, proxyGroup);
  }

  const proxyRunningGear = createTrackedRunningGearProxy({
    id: 'PanzerIIIDProxyRunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: PANZER_III_D.trackCenterX,
    trackWidth: PANZER_III_D.trackWidth,
    beltLength: PANZER_III_D.beltLength,
    beltHeight: PANZER_III_D.beltHeight,
    centerY: PANZER_III_D.beltCenterY,
    roadWheelRadius: PANZER_III_D.roadWheelRadius,
    roadWheelCount: 8
  });
  repositionProxyWheels(proxyRunningGear);
  proxyGroup.add(proxyRunningGear);
  tankGroup.add(proxyGroup);

  const proxyTurret = cloneProxyPart(turret, 'PanzerIIID_ProxyTurret', turretGroup);
  proxyTurret.position.set(0, 0, 0);
  const proxyBarrel = new THREE.Mesh(barrel.geometry.clone(), barrel.material);
  proxyBarrel.name = 'PanzerIIID_ProxyBarrel';
  proxyBarrel.visible = false;
  proxyBarrel.castShadow = true;
  proxyBarrel.userData.lodBand = 'proxy';
  proxyBarrel.userData.proxySource = barrel.name;
  barrel.add(proxyBarrel);

  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;
  tankGroup.userData.weaponMuzzles = {
    coax: coaxMuzzle,
    hull_mg: hullMgMuzzle
  };
  tankGroup.userData.authoredHull = lowerHull;
  tankGroup.userData.proxyTurret = proxyTurret;
  tankGroup.userData.proxyBarrel = proxyBarrel;
  tankGroup.userData.modelMetadata = {
    designation: 'Panzerkampfwagen III Ausf. D',
    dimensionsMeters: {
      length: PANZER_III_D.length,
      width: PANZER_III_D.width,
      height: PANZER_III_D.height
    },
    blueprintCalibration: PANZER_III_D_BLUEPRINT_CALIBRATION,
    blueprintFit: {
      views: ['side', 'front', 'top'],
      primaryFitView: 'side',
      rigidEnvelope: 'exact repository contract',
      landmarkFit: 'registered secondary orthographic drawing; internal centers inferred'
    },
    features: [
      '3.7 cm KwK 36 L/45',
      'eight small road wheels in four leaf-sprung pairs per side',
      'three return rollers per side',
      'front drive sprocket and rear idler',
      'stepped rear engine deck',
      'early three-man turret and commander cupola',
      'right-side coaxial and hull MG 34 projections',
      'five-man crew'
    ]
  };

  return tankGroup;
}
