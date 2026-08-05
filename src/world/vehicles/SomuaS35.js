import * as THREE from 'three';
import {
  SOMUA_S35_COMMANDER_STATION
} from '../../content/france1940/vehicleData/CommanderStations.js';
import {
  SOMUA_S35_HULL_STATIONS as HULL_STATIONS,
  SOMUA_S35_TURRET_STATIONS as TURRET_STATIONS,
  SOMUA_S35_WEAPON_INSTALLATION as WEAPON_INSTALLATION
} from '../../game/vehicleData/SomuaS35Shape.js';
import { lateralX } from '../LocalFrame.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from './TrackedRunningGear.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';

const MODEL_ID = 'fr_somua';

const S35 = Object.freeze({
  length: 5.38,
  width: 2.12,
  height: 2.62,
  trackWidth: 0.32,
  trackCenterX: 0.8936,
  beltLength: 5.00,
  beltHeight: 1.02,
  beltCenterY: 0.585,
  roadWheelRadius: 0.22,
  roadWheelY: 0.235,
  roadWheelZ: Object.freeze([1.54, 1.16, 0.78, 0.40, 0.02, -0.36, -0.74, -1.12, -1.50]),
  frontIdlerZ: 1.99,
  rearSprocketZ: -1.99,
  returnRollerZ: Object.freeze([0.78, -0.76]),
  turretRingY: 1.55,
  turretCenterZ: 0.55
});

const S35_TRACK_PATH = Object.freeze({
  model: 'wheel-supported-quasi-static-v1',
  quality:
    'support centers are hand-registered illustration landmarks; link mass and static tension are renderer approximations',
  pathRadiusPolicy:
    'renderer pitch radii are derived from visible wheel radii minus the authored link-and-cleat envelope',
  driveSprocket: Object.freeze({
    id: 'rear-drive-sprocket', kind: 'driveSprocket',
    centerY: S35.beltCenterY, centerZ: S35.rearSprocketZ,
    radius: 0.39, pathRadius: 0.354
  }),
  idlerWheel: Object.freeze({
    id: 'front-idler', kind: 'idlerWheel',
    centerY: S35.beltCenterY, centerZ: S35.frontIdlerZ,
    radius: 0.34, pathRadius: 0.304
  }),
  roadWheels: Object.freeze(S35.roadWheelZ.map((centerZ, index) => Object.freeze({
    id: `road-wheel-${index + 1}`, kind: 'roadWheel',
    centerY: S35.roadWheelY, centerZ,
    radius: S35.roadWheelRadius, pathRadius: 0.184
  }))),
  returnRollers: Object.freeze(S35.returnRollerZ.map((centerZ, index) => Object.freeze({
    id: `return-roller-${index + 1}`, kind: 'returnRoller',
    centerY: 0.90, centerZ, radius: 0.09, pathRadius: 0.054
  }))),
  linkThickness: 0.028,
  cleatHeight: 0.008,
  linearMassKgPerMeter: 52,
  tensionNewtons: 21000,
  maximumSegmentMeters: 0.07,
  rendererApproximation:
    'link thickness, cleat height, linear mass, static tension, and gravity sag are presentation-only approximations'
});

export const SOMUA_S35_BLUEPRINT_CALIBRATION = Object.freeze({
  version: 'somua-s35-registered-multiview-v1',
  coordinateFrame: '+Y up, +Z forward, -X vehicle right',
  variantScope: 'SOMUA S35, French service, 1940',
  rigidEnvelopeMeters: Object.freeze({
    length: S35.length,
    width: S35.width,
    height: S35.height
  }),
  sources: Object.freeze([
    Object.freeze({
      title: 'User-supplied SOMUA S35 comparison sheet',
      artifact: 's35-compare.jpg',
      use: 'registered side silhouette, cast hull breaks, suspension, turret and weapon projection',
      quality: 'orthographic color illustration; provenance not asserted beyond the supplied artifact'
    }),
    Object.freeze({
      title: 'SOMUA S35 multi-view drawing',
      publisher: 'The-Blueprints.com',
      pageUrl: 'https://www.the-blueprints.com/blueprints/tanks/tanks-s/50770/view/somua_s35/',
      use: 'top/front cross-check for plan width, APX turret plan and deck arrangement',
      quality: 'secondary orthographic drawing; not a factory production drawing'
    }),
    Object.freeze({
      title: 'Somua S 35 collection record',
      publisher: 'Musée des Blindés',
      url: 'https://museedesblindes.fr/les_chars/somua-s35/',
      use: 'official museum evidence for vehicle, armament, cast turret and original closed cupola identity',
      quality: 'official survivor record; cupola was later modified by German forces'
    }),
    Object.freeze({
      title: 'TM 30-42, Handbook on the French Military Forces',
      publisher: 'United States War Department',
      url: 'https://www.govinfo.gov/content/pkg/GOVPUB-W-PURL-gpo119422/pdf/GOVPUB-W-PURL-gpo119422.pdf',
      use: 'period technical context and dimensional corroboration',
      quality: 'official wartime intelligence manual'
    })
  ]),
  imageRegistration: Object.freeze({
    sourceImagePixels: Object.freeze({ width: 1335, height: 1377 }),
    side: Object.freeze({
      cropPixels: Object.freeze({ x: 220, y: 55, width: 1065, height: 600 }),
      vehicleFront: 'image-left',
      mirrorX: false,
      rigidDatumPixels: Object.freeze({
        frontX: 238,
        rearX: 1253,
        topY: 84,
        groundY: 634
      }),
      diagnosticOverlay: Object.freeze({
        artifact: 'screenshots/somua-s35-final-overlay.png',
        renderer: 'fixed orthographic software silhouette'
      })
    }),
    multiview: Object.freeze({
      source: 'The-Blueprints.com page listed above',
      use: 'qualitative front/top registration where the supplied raster contains only a side view'
    }),
    quality: 'side rigid endpoints and height lines registered; hidden-side and plan landmarks remain inferred'
  }),
  datums: Object.freeze({
    exact: Object.freeze({
      groundLineY: 0,
      hullRearZ: -S35.length * 0.5,
      hullFrontZ: S35.length * 0.5,
      rigidHalfWidth: S35.width * 0.5,
      rigidHeightY: S35.height,
      roadWheelsPerSide: 9,
      weaponIdentity: '47 mm SA 35'
    }),
    registeredInferred: Object.freeze({
      trackWidthMeters: S35.trackWidth,
      roadWheelCentersZ: S35.roadWheelZ,
      frontIdlerZ: S35.frontIdlerZ,
      rearSprocketZ: S35.rearSprocketZ,
      turretRing: Object.freeze([0, S35.turretRingY, S35.turretCenterZ]),
      gunAxis: Object.freeze([
        WEAPON_INSTALLATION.main.axisLocalX,
        S35.turretRingY + WEAPON_INSTALLATION.main.axisLocalY,
        S35.turretCenterZ + WEAPON_INSTALLATION.mantlet.centerLocalZ
      ]),
      quality: 'hand-registered illustration landmarks; not claimed as factory measurements'
    })
  }),
  allowedDivergences: Object.freeze([
    'tow chains, cable, tools and flexible aerial excluded from exact rigid envelope',
    'suspension castings simplified while preserving the nine-wheel rhythm and open track silhouette',
    'camouflage and markings are material-system approximations, not a specific vehicle restoration'
  ])
});

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

function createCastHullGeometry() {
  const positions = [];
  const indices = [];
  const ringSize = 8;
  for (const station of HULL_STATIONS) {
    positions.push(
      -station.floorHalf, station.floorY, station.z,
      -station.lowerHalf, station.lowerY, station.z,
      -station.sideHalf, station.shoulderY, station.z,
      -station.roofHalf, station.roofY, station.z,
      station.roofHalf, station.roofY, station.z,
      station.sideHalf, station.shoulderY, station.z,
      station.lowerHalf, station.lowerY, station.z,
      station.floorHalf, station.floorY, station.z
    );
  }
  for (let station = 0; station < HULL_STATIONS.length - 1; station++) {
    const current = station * ringSize;
    const next = current + ringSize;
    for (let edge = 0; edge < ringSize; edge++) {
      const following = (edge + 1) % ringSize;
      indices.push(
        current + edge, next + edge, current + following,
        current + following, next + edge, next + following
      );
    }
  }
  for (let triangle = 1; triangle < ringSize - 1; triangle++) {
    indices.push(0, triangle, triangle + 1);
  }
  const front = (HULL_STATIONS.length - 1) * ringSize;
  for (let triangle = 1; triangle < ringSize - 1; triangle++) {
    indices.push(front, front + triangle + 1, front + triangle);
  }
  return geometryFromMeshData(positions, indices, 'S35_CastHullGeometry', {
    authoredHull: true,
    profileStations: HULL_STATIONS.map(station => ({ ...station })),
    source: 's35-compare.jpg'
  });
}

function createApxTurretGeometry() {
  const segments = 20;
  const positions = [];
  const indices = [];
  for (const station of TURRET_STATIONS) {
    for (let segment = 0; segment < segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      const cosine = Math.cos(angle);
      positions.push(
        Math.sin(angle) * station.halfWidth,
        station.y,
        cosine * (cosine >= 0 ? station.frontZ : station.rearZ)
      );
    }
  }
  for (let ring = 0; ring < TURRET_STATIONS.length - 1; ring++) {
    const lower = ring * segments;
    const upper = lower + segments;
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      indices.push(
        lower + segment, lower + next, upper + segment,
        lower + next, upper + next, upper + segment
      );
    }
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, TURRET_STATIONS[0].y, 0);
  const topCenter = positions.length / 3;
  positions.push(0, TURRET_STATIONS.at(-1).y, 0);
  const topRing = (TURRET_STATIONS.length - 1) * segments;
  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    indices.push(bottomCenter, next, segment);
    indices.push(topCenter, topRing + segment, topRing + next);
  }
  return geometryFromMeshData(positions, indices, 'S35_APX1CETurretGeometry', {
    registeredStations: TURRET_STATIONS.map(station => ({ ...station })),
    source: 's35-compare.jpg'
  });
}

function addMesh(parent, geometry, material, name, lodBand, {
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  envelopeRole = null
} = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.userData.lodBand = lodBand;
  if (envelopeRole) mesh.userData.envelopeRole = envelopeRole;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function labelRunningGear(runningGear) {
  const { roadWheels, sprockets, idlers } = runningGear.userData.trackParts;
  for (let side = 0; side < 2; side++) {
    for (let index = 0; index < S35.roadWheelZ.length; index++) {
      const wheel = roadWheels[side * S35.roadWheelZ.length + index];
      wheel.name = `${side === 0 ? 'Right' : 'Left'}S35RoadWheel_${index + 1}`;
    }
    sprockets[side].name = `${side === 0 ? 'Right' : 'Left'}S35RearDriveSprocket`;
    idlers[side].name = `${side === 0 ? 'Right' : 'Left'}S35FrontIdler`;
  }
  runningGear.userData.blueprintAxleZ = {
    roadWheels: [...S35.roadWheelZ],
    rearSprocket: S35.rearSprocketZ,
    frontIdler: S35.frontIdlerZ
  };
}

function cloneProxyMesh(source, name, parent) {
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

function addSuspensionDetails(root, bodyMaterial, metalMaterial) {
  for (const side of [-1, 1]) {
    for (let panel = 0; panel < 4; panel++) {
      const centerZ = 1.23 - panel * 0.83;
      const cover = addMesh(
        root,
        new THREE.BoxGeometry(0.075, 0.43, 0.76),
        bodyMaterial,
        `${side < 0 ? 'Right' : 'Left'}S35SuspensionCover_${panel + 1}`,
        'medium',
        { position: [side * 1.012, 0.67, centerZ] }
      );
      cover.userData.registeredOutlinePart = 'cast-suspension-cover';
      for (let bolt = 0; bolt < 3; bolt++) {
        addMesh(
          root,
          new THREE.CylinderGeometry(0.025, 0.025, 0.022, 7),
          metalMaterial,
          `${side < 0 ? 'Right' : 'Left'}S35CoverBolt_${panel + 1}_${bolt + 1}`,
          'high',
          {
            position: [side * 1.048, 0.60, centerZ - 0.22 + bolt * 0.22],
            rotation: [0, 0, Math.PI / 2]
          }
        );
      }
    }
  }
}

export function createSomuaS35Mesh() {
  const root = new THREE.Group();
  root.name = MODEL_ID;

  const castGreen = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#4f5b32',
    roughness: 0.82,
    metalness: 0.07
  }), 'paint');
  const castOchre = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#806b43',
    roughness: 0.84,
    metalness: 0.06
  }), 'paint');
  const darkGreen = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#303d29',
    roughness: 0.86,
    metalness: 0.08
  }), 'paint');
  const trackMaterial = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#1b2020',
    roughness: 0.92,
    metalness: 0.28
  }), 'track');
  const metalMaterial = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#141817',
    roughness: 0.46,
    metalness: 0.72
  }), 'metal');

  const hull = addMesh(
    root,
    createCastHullGeometry(),
    castGreen,
    'S35_CastPrimaryHull',
    'core'
  );
  hull.userData.authoredHull = true;

  const runningGear = createTrackedRunningGear({
    id: 'S35RunningGear',
    trackMaterial,
    wheelMaterial: castOchre,
    trackCenterX: S35.trackCenterX,
    trackWidth: S35.trackWidth,
    beltLength: S35.beltLength,
    beltHeight: S35.beltHeight,
    centerY: S35.beltCenterY,
    roadWheelRadius: S35.roadWheelRadius,
    roadWheelCount: 9,
    roadWheelY: S35.roadWheelY,
    roadWheelZStart: S35.roadWheelZ[0],
    roadWheelSpacing: -0.38,
    sprocketRadius: 0.39,
    idlerRadius: 0.34,
    linkPitch: 0.135,
    trackPath: S35_TRACK_PATH
  });
  labelRunningGear(runningGear);
  root.add(runningGear);
  root.userData.runningGear = runningGear;
  addSuspensionDetails(root, darkGreen, metalMaterial);

  for (const side of [-1, 1]) {
    addMesh(
      root,
      new THREE.BoxGeometry(0.14, 0.055, 4.72),
      darkGreen,
      `${side < 0 ? 'Right' : 'Left'}S35HullJoinFlange`,
      'medium',
      { position: [side * 0.985, 1.04, -0.02] }
    );
  }

  // Source-registered renderer inference: the deck's lower rear/front edges
  // follow the interpolated cast-hull roof instead of hovering above it.
  const engineDeckCenterY = 1.532;
  const engineDeckRotationX = -0.10;
  const engineDeck = addMesh(
    root,
    new THREE.BoxGeometry(1.45, 0.055, 2.10),
    castOchre,
    'S35_SlopingEngineDeck',
    'medium',
    {
      position: [0, engineDeckCenterY, -1.40],
      rotation: [engineDeckRotationX, 0, 0]
    }
  );
  engineDeck.userData.registeredOutlinePart = 'long-low-rear-engine-deck';
  engineDeck.userData.contactSurface = 'S35_CastPrimaryHull';
  for (let index = 0; index < 8; index++) {
    addMesh(
      root,
      new THREE.BoxGeometry(1.08, 0.025, 0.055),
      metalMaterial,
      `S35_EngineLouvre_${index + 1}`,
      'high',
      {
        position: [0, engineDeckCenterY + 0.08 - index * 0.018, -0.58 - index * 0.22],
        rotation: [engineDeckRotationX, 0, 0]
      }
    );
  }

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, S35.turretRingY, S35.turretCenterZ);
  root.add(turretGroup);

  const turret = addMesh(
    turretGroup,
    createApxTurretGeometry(),
    castOchre,
    'S35_APX1CE_TurretBody',
    'core'
  );
  turret.userData.articulatedPart = 'turret-shell';
  const dome = addMesh(
    turretGroup,
    new THREE.SphereGeometry(0.51, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    castOchre,
    'S35_APX1CE_TurretDome',
    'medium',
    { position: [0, 0.70, -0.04] }
  );
  dome.scale.set(1, 0.24, 1.08);

  const mantlet = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(
      WEAPON_INSTALLATION.mantlet.radiusTop,
      WEAPON_INSTALLATION.mantlet.radiusBottom,
      WEAPON_INSTALLATION.mantlet.depth,
      12
    ),
    darkGreen,
    'S35_SA35_Mantlet',
    'core',
    {
      position: [
        WEAPON_INSTALLATION.main.axisLocalX,
        WEAPON_INSTALLATION.main.axisLocalY,
        WEAPON_INSTALLATION.mantlet.centerLocalZ
      ],
      rotation: [Math.PI / 2, 0, 0]
    }
  );
  mantlet.userData.articulatedPart = 'gun-mantlet';
  mantlet.userData.placementQuality = WEAPON_INSTALLATION.dataQuality;

  const barrelLength = WEAPON_INSTALLATION.main.barrelLength;
  const barrel = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.038, 0.055, barrelLength, 10),
    metalMaterial,
    'S35_SA35_Barrel',
    'core',
    {
      position: [
        WEAPON_INSTALLATION.main.axisLocalX,
        WEAPON_INSTALLATION.main.axisLocalY,
        WEAPON_INSTALLATION.main.barrelBaseLocalZ + barrelLength * 0.5
      ],
      rotation: [Math.PI / 2, 0, 0],
      envelopeRole: 'weaponProjection'
    }
  );
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.forwardAxis = '+Z';
  barrel.userData.weaponMountId = 'main';
  barrel.userData.weaponIdentity = '47 mm SA 35';

  const muzzle = new THREE.Object3D();
  muzzle.name = 'S35_SA35_Muzzle';
  muzzle.position.set(
    WEAPON_INSTALLATION.main.axisLocalX,
    WEAPON_INSTALLATION.main.axisLocalY,
    WEAPON_INSTALLATION.main.muzzleLocalZ
  );
  muzzle.userData.forwardAxis = '+Z';
  muzzle.userData.envelopeRole = 'weaponProjection';
  turretGroup.add(muzzle);

  const coaxLength = WEAPON_INSTALLATION.coax.barrelLength;
  const coax = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.014, 0.022, coaxLength, 7),
    metalMaterial,
    'S35_MAC31_Coax',
    'high',
    {
      position: [
        WEAPON_INSTALLATION.coax.axisLocalX,
        WEAPON_INSTALLATION.coax.axisLocalY,
        WEAPON_INSTALLATION.coax.barrelBaseLocalZ + coaxLength * 0.5
      ],
      rotation: [Math.PI / 2, 0, 0],
      envelopeRole: 'weaponProjection'
    }
  );
  coax.userData.weaponMountId = 'coax';
  coax.userData.mountSide = WEAPON_INSTALLATION.coax.mountSide;
  coax.userData.placementQuality = WEAPON_INSTALLATION.dataQuality;
  coax.userData.referenceUrl = 'https://museedesblindes.fr/les_chars/somua-s35/';
  const coaxMuzzle = new THREE.Object3D();
  coaxMuzzle.name = 'coax_muzzle';
  coaxMuzzle.position.set(
    WEAPON_INSTALLATION.coax.axisLocalX,
    WEAPON_INSTALLATION.coax.axisLocalY,
    WEAPON_INSTALLATION.coax.muzzleLocalZ
  );
  coaxMuzzle.userData = {
    weaponMountId: 'coax',
    forwardAxis: '+Z',
    envelopeRole: 'weaponProjection',
    mountSide: WEAPON_INSTALLATION.coax.mountSide,
    placementQuality: WEAPON_INSTALLATION.dataQuality,
    referenceUrl: 'https://museedesblindes.fr/les_chars/somua-s35/'
  };
  turretGroup.add(coaxMuzzle);

  const cupolaData = SOMUA_S35_COMMANDER_STATION.cupola;
  const cupola = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(
      cupolaData.radiusTopMeters,
      cupolaData.radiusBottomMeters,
      cupolaData.heightMeters,
      12
    ),
    darkGreen,
    'S35_ClosedObservationCupola',
    'core',
    { position: cupolaData.centerTurretLocal }
  );
  cupola.userData.historicalState = 'original closed French cupola';
  cupola.userData.dataQuality = SOMUA_S35_COMMANDER_STATION.dataQuality;
  const cupolaRoof = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(
      cupolaData.roofRadiusMeters,
      cupolaData.roofRadiusMeters,
      cupolaData.roofThicknessMeters,
      12
    ),
    castOchre,
    'S35_ClosedCupolaRoof',
    'core',
    { position: cupolaData.roofCenterTurretLocal }
  );
  cupolaRoof.userData.envelopeDatum = 'published-height-2.62m';
  cupolaRoof.userData.historicalState =
    'fixed roof on original French hatchless cupola';

  const driverVisor = addMesh(
    root,
    new THREE.BoxGeometry(0.35, 0.23, 0.12),
    darkGreen,
    'S35_DriverVisor',
    'high',
    {
      position: [lateralX('left', 0.34), 1.38, 1.78],
      rotation: [-0.18, 0, 0]
    }
  );
  driverVisor.userData.mountSide = 'left';
  for (const side of [-1, 1]) {
    addMesh(
      root,
      new THREE.CylinderGeometry(0.09, 0.09, 0.11, 10),
      metalMaterial,
      `${side < 0 ? 'Right' : 'Left'}S35Headlamp`,
      'high',
      {
        position: [side * 0.52, 1.15, 2.12],
        rotation: [Math.PI / 2, 0, 0]
      }
    );
  }
  addMesh(
    root,
    new THREE.CylinderGeometry(0.09, 0.12, 0.92, 8),
    metalMaterial,
    'S35_RearExhaust',
    'medium',
    { position: [0.73, 1.17, -2.05], rotation: [Math.PI / 2, 0, 0] }
  );

  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  cloneProxyMesh(hull, 'S35_ProxyCastHull', proxyGroup);
  const proxyRunningGear = createTrackedRunningGearProxy({
    id: 'S35RunningGearProxy',
    trackMaterial,
    wheelMaterial: castOchre,
    trackCenterX: S35.trackCenterX,
    trackWidth: S35.trackWidth,
    beltLength: S35.beltLength,
    beltHeight: S35.beltHeight,
    centerY: S35.beltCenterY,
    roadWheelRadius: S35.roadWheelRadius,
    roadWheelCount: 9,
    linkPitch: 0.27,
    trackPath: S35_TRACK_PATH
  });
  proxyGroup.add(proxyRunningGear);
  root.add(proxyGroup);
  const proxyTurret = cloneProxyMesh(turret, 'S35_ProxyAPXTurret', turretGroup);
  const proxyMantlet = cloneProxyMesh(
    mantlet,
    'S35_ProxySA35Mantlet',
    turretGroup
  );
  const proxyBarrel = cloneProxyMesh(barrel, 'S35_ProxySA35Barrel', turretGroup);
  const proxyCupola = cloneProxyMesh(
    cupola,
    'S35_ProxyClosedObservationCupola',
    turretGroup
  );
  const proxyCupolaRoof = cloneProxyMesh(
    cupolaRoof,
    'S35_ProxyClosedCupolaRoof',
    turretGroup
  );

  root.userData.turret = turretGroup;
  root.userData.barrel = barrel;
  root.userData.muzzle = muzzle;
  root.userData.weaponMuzzles = { coax: coaxMuzzle };
  root.userData.authoredHull = hull;
  root.userData.proxyTurret = proxyTurret;
  root.userData.proxyMantlet = proxyMantlet;
  root.userData.proxyBarrel = proxyBarrel;
  root.userData.proxyCupola = proxyCupola;
  root.userData.proxyCupolaRoof = proxyCupolaRoof;
  root.userData.commanderStation = SOMUA_S35_COMMANDER_STATION;
  root.userData.commanderHatches = [];
  root.userData.modelMetadata = {
    designation: 'SOMUA S35',
    dimensionsMeters: {
      length: S35.length,
      width: S35.width,
      height: S35.height
    },
    dimensionPolicy: 'rigid vehicle envelope; excludes weapon projection and flexible attachments',
    blueprintCalibration: SOMUA_S35_BLUEPRINT_CALIBRATION,
    blueprintFit: {
      views: ['side', 'front', 'top'],
      primaryFitView: 'side',
      rigidEnvelope: 'exact',
      landmarkFit: 'registered supplied side illustration; front/top cross-checked against secondary multiview'
    },
    features: [
      'continuous three-piece cast hull silhouette',
      'long low sloping engine deck',
      'nine small road wheels per side',
      'rear drive sprocket and front idler',
      'APX 1 CE one-man turret and original closed observation cupola',
      '47 mm SA 35 main gun and right-side MAC 31 coaxial machine gun',
      'three-man crew'
    ]
  };

  return root;
}
