import * as THREE from 'three';
import {
  RENAULT_R35_VISUAL_DATA
} from '../../content/france1940/vehicleData/RenaultR35VisualData.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from './TrackedRunningGear.js';
import { getVehicleVisualProfile } from './VehicleVisualProfiles.js';

const PROFILE = getVehicleVisualProfile('fr_renault_r35');
const VISUAL = RENAULT_R35_VISUAL_DATA.geometry;

// Metres, +Y up and +Z forward. The registered drawing shows the tail-less
// production configuration: the cast nose and track run own the 4.02 m rigid
// envelope. The optional trench-crossing tail is deliberately not fitted.
const R35 = Object.freeze({
  overallLength: PROFILE.dimensionsMeters.length,
  overallWidth: PROFILE.dimensionsMeters.width,
  overallHeight: PROFILE.dimensionsMeters.height,
  noseZ: PROFILE.dimensionsMeters.length / 2,
  hullRearZ: VISUAL.hullStations[0].z,
  trackWidth: VISUAL.runningGear.trackWidth,
  trackCenterX: VISUAL.runningGear.trackCenterX,
  trackLength: VISUAL.runningGear.trackLength,
  // Legacy envelope arguments remain required by the shared factory, but the
  // R35 track itself uses the source-registered support path below.
  trackHeight: VISUAL.runningGear.trackHeight,
  trackCenterY: VISUAL.runningGear.trackCenterY,
  turretCenterX: VISUAL.turret.centerX,
  turretCenterZ: VISUAL.turret.centerZ,
  turretDeckY: VISUAL.turret.deckY,
  turretBodyHeight: VISUAL.turret.sections.at(-1).y,
  gunX: VISUAL.mainGun.x,
  gunY: VISUAL.mainGun.y,
  gunLength: VISUAL.mainGun.barrelLength,
  gunMuzzleZ: VISUAL.mainGun.muzzleZ,
  coaxX: VISUAL.coax.x,
  coaxY: VISUAL.coax.y,
  runningGearOffsetZ: 0,
  roadWheelCentersZ: VISUAL.runningGear.roadWheelCentersZ
});

const R35_HULL_STATIONS = VISUAL.hullStations;
const R35_PROXY_HULL_STATIONS = Object.freeze(
  VISUAL.proxyHullStationIndices.map(index => R35_HULL_STATIONS[index])
);

function createCastHullGeometry(stations) {
  const ringSize = 10;
  const positions = [];
  const indices = [];

  for (const station of stations) {
    positions.push(
      -station.bottomHalfWidth, station.bottomY, station.z,
      station.bottomHalfWidth, station.bottomY, station.z,
      station.lowerHalfWidth, station.lowerY, station.z,
      station.halfWidth, station.shoulderY, station.z,
      station.upperHalfWidth, station.upperY, station.z,
      station.deckHalfWidth, station.deckY, station.z,
      -station.deckHalfWidth, station.deckY, station.z,
      -station.upperHalfWidth, station.upperY, station.z,
      -station.halfWidth, station.shoulderY, station.z,
      -station.lowerHalfWidth, station.lowerY, station.z
    );
  }

  for (let station = 0; station < stations.length - 1; station++) {
    const current = station * ringSize;
    const next = current + ringSize;
    for (let edge = 0; edge < ringSize; edge++) {
      const following = (edge + 1) % ringSize;
      indices.push(
        current + edge, current + following, next + following,
        current + edge, next + following, next + edge
      );
    }
  }

  for (let edge = 1; edge < ringSize - 1; edge++) {
    indices.push(0, edge + 1, edge);
    const front = (stations.length - 1) * ringSize;
    indices.push(front, front + edge, front + edge + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = 'R35CastHullGeometry';
  return geometry;
}

function createCastTurretGeometry(rings, segments = 12) {
  const positions = [];
  const indices = [];

  for (const ring of rings) {
    for (let segment = 0; segment < segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      const sine = Math.sin(angle);
      const halfLength = sine >= 0
        ? ring.frontLength ?? ring.halfLength
        : ring.rearLength ?? ring.halfLength;
      positions.push(
        Math.cos(angle) * ring.halfWidth,
        ring.y,
        ring.centerZ + sine * halfLength
      );
    }
  }

  for (let ring = 0; ring < rings.length - 1; ring++) {
    const lower = ring * segments;
    const upper = lower + segments;
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      indices.push(
        lower + segment, upper + segment, upper + next,
        lower + segment, upper + next, lower + next
      );
    }
  }

  const bottomCenter = positions.length / 3;
  positions.push(0, rings[0].y, rings[0].centerZ);
  const topCenter = positions.length / 3;
  const topRing = rings[rings.length - 1];
  positions.push(0, topRing.y, topRing.centerZ);
  const topStart = (rings.length - 1) * segments;
  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    indices.push(
      bottomCenter, segment, next,
      topCenter, topStart + next, topStart + segment
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = 'R35APXRCastTurretGeometry';
  return geometry;
}

function createFrontPlateGeometry(
  outline,
  depth,
  name,
  { bevelMeters = 0 } = {}
) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let index = 1; index < outline.length; index++) {
    shape.lineTo(outline[index][0], outline[index][1]);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: bevelMeters > 0,
    bevelSegments: bevelMeters > 0 ? 2 : 0,
    bevelSize: bevelMeters,
    bevelThickness: bevelMeters
  });
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = name;
  return geometry;
}

function createSidePlateGeometry(outline, depth, name) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let index = 1; index < outline.length; index++) {
    shape.lineTo(outline[index][0], outline[index][1]);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: false
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = name;
  return geometry;
}

function tag(mesh, lodBand, name) {
  mesh.name = name;
  mesh.userData.lodBand = lodBand;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createForwardCylinder(radius, depth, segments, material, name, lodBand) {
  const mesh = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, depth, segments),
    material
  ), lodBand, name);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

const R35_BLUEPRINT_CALIBRATION = Object.freeze({
  source: Object.freeze({
    title: 'Renault R35 four-elevation line drawing',
    url: RENAULT_R35_VISUAL_DATA.blueprint.sourcePageUrl,
    imageUrl: RENAULT_R35_VISUAL_DATA.blueprint.imageUrl,
    imageSizePixels: RENAULT_R35_VISUAL_DATA.blueprint.imagePixels,
    sha256: RENAULT_R35_VISUAL_DATA.blueprint.sha256,
    provenance: RENAULT_R35_VISUAL_DATA.blueprint.provenance,
    limitations: RENAULT_R35_VISUAL_DATA.blueprint.limitations
  }),
  imageRegistration: Object.freeze({
    sourceImagePixels: RENAULT_R35_VISUAL_DATA.blueprint.imagePixels,
    views: RENAULT_R35_VISUAL_DATA.blueprint.views
  }),
  dimensionPolicy: 'rigid tail-less envelope 4.02m x 1.87m x 2.13m',
  geometryAuthority:
    'source-space side, front, and top registration; emitted mesh is not its own reference'
});

export function createRenaultR35Mesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'fr_renault_r35';
  tankGroup.userData.authoredHull = true;

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#3d4d2d', roughness: 0.78, metalness: 0.12
  }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#4a5938', roughness: 0.75, metalness: 0.12
  }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#1e231a', roughness: 0.9
  }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#111512', metalness: 0.82, roughness: 0.38
  }), 'metal');

  // One continuous loft preserves the rear/centre casting, lowers the missing
  // belly, and compiles the rounded final-drive nose into the same surface.
  const hull = tag(new THREE.Mesh(
    createCastHullGeometry(R35_HULL_STATIONS),
    bodyMat
  ), 'core', 'R35_CastHull');
  hull.userData.surfaceRole = 'primary-hull';
  hull.userData.authoredHull = true;
  hull.userData.includesIntegratedNose = true;
  tankGroup.add(hull);

  // The source shows a slit in the cast glacis, not a separate raised hood.
  const visorSlit = tag(new THREE.Mesh(
    new THREE.BoxGeometry(...VISUAL.driverVisor.size),
    metalMat
  ), 'high', 'R35_DriverVisor');
  visorSlit.position.set(...VISUAL.driverVisor.center);
  visorSlit.rotation.x = VISUAL.driverVisor.slopeRadians;
  visorSlit.userData.mountSide = VISUAL.driverVisor.side;
  visorSlit.userData.surfaceRole = 'surfaceDetail';
  visorSlit.userData.envelopeRole = 'surfaceDetail';
  tankGroup.add(visorSlit);

  // Separate fenders leave the track faces visible and hold the narrow French
  // hull between the full 1.87 m outside-track width.
  for (const side of [-1, 1]) {
    const fender = tag(new THREE.Mesh(
      createSidePlateGeometry(
        VISUAL.mudguard.outline,
        VISUAL.mudguard.depth,
        'R35SourceRegisteredMudguardGeometry'
      ),
      bodyMat
    ), 'core', `${side < 0 ? 'Right' : 'Left'}Fender`);
    fender.position.x = side * VISUAL.mudguard.centerX;
    fender.userData.surfaceRole = 'source-registered-mudguard';
    fender.userData.sourceView = 'side';
    tankGroup.add(fender);

    const lamp = tag(new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.10, 8),
      metalMat
    ), 'high', `${side < 0 ? 'Right' : 'Left'}Headlamp`);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.72, 1.16, 1.60);
    tankGroup.add(lamp);
  }

  const exhaust = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.075, 0.94, 8),
    metalMat
  ), 'high', 'R35_LeftExhaust');
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.70, 1.12, -0.94);
  tankGroup.add(exhaust);

  const runningGear = createTrackedRunningGear({
    id: 'R35RunningGear',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: R35.trackCenterX,
    trackWidth: R35.trackWidth,
    beltLength: R35.trackLength,
    beltHeight: R35.trackHeight,
    centerY: R35.trackCenterY,
    roadWheelRadius: VISUAL.runningGear.trackPath.roadWheels[0].radius,
    roadWheelCount: PROFILE.roadWheelsPerSide,
    roadWheelY: VISUAL.runningGear.trackPath.roadWheels[0].centerY,
    roadWheelZStart: R35.roadWheelCentersZ[0] - R35.runningGearOffsetZ,
    roadWheelSpacing: 0.50,
    sprocketRadius: VISUAL.runningGear.trackPath.driveSprocket.radius,
    idlerRadius: VISUAL.runningGear.trackPath.idlerWheel.radius,
    linkPitch: 0.15,
    trackPath: VISUAL.runningGear.trackPath
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // Suspension plates and leaf-spring packs consume the same side-source
  // registration as the wheels. This keeps their silhouettes attached to the
  // mechanical datums instead of floating from hand-authored local offsets.
  const suspension = VISUAL.suspension;
  for (const side of [-1, 1]) {
    for (const assembly of suspension.assemblies) {
      const plate = tag(new THREE.Mesh(
        createSidePlateGeometry(
          assembly.outline,
          suspension.plateDepth,
          `R35_${assembly.id}_PlateGeometry`
        ),
        turretMat
      ), 'medium', `${
        side < 0 ? 'Right' : 'Left'
      }SuspensionPlate_${assembly.id}`);
      plate.position.x = side * suspension.lateralCenterX;
      plate.userData.surfaceRole = 'source-registered-suspension-yoke';
      plate.userData.sourceView = 'side';
      plate.userData.sourceAssemblyId = assembly.id;
      tankGroup.add(plate);

      const springPack = assembly.springPack;
      const elementSpan = springPack.spanZ / springPack.elementCount;
      const elementDepthZ = (
        elementSpan * (1 - suspension.springElementGapRatio)
      );
      for (
        let springIndex = 0;
        springIndex < springPack.elementCount;
        springIndex++
      ) {
        const block = tag(new THREE.Mesh(
          new THREE.BoxGeometry(
            suspension.springDepth,
            springPack.height,
            elementDepthZ
          ),
          metalMat
        ), 'high', `${
          side < 0 ? 'Right' : 'Left'
        }SuspensionSpring_${assembly.id}_${springIndex + 1}`);
        block.position.set(
          side * suspension.lateralCenterX,
          springPack.centerY,
          springPack.centerZ + (
            0.5 - (springIndex + 0.5) / springPack.elementCount
          ) * springPack.spanZ
        );
        block.userData.surfaceRole = 'source-registered-suspension-spring';
        block.userData.sourceView = 'side';
        block.userData.sourceAssemblyId = assembly.id;
        tankGroup.add(block);
      }
    }
  }

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(
    R35.turretCenterX,
    R35.turretDeckY,
    R35.turretCenterZ
  );
  turretGroup.userData.deckContact = {
    hullName: 'R35_CastHull',
    maxGapMeters: 0.03
  };

  // APX-R section loft. Its high cast roof replaces the old generic cone plus
  // oversized separate cupola while retaining deliberate facets.
  const turret = tag(new THREE.Mesh(
    createCastTurretGeometry(VISUAL.turret.sections),
    turretMat
  ), 'core', 'R35_APXR_Turret');
  turretGroup.add(turret);

  // The registered front elevation owns this irregular cast shield and its
  // three circular collars. A generic box or ellipsoid is not source-shaped.
  const mantletData = VISUAL.turret.mantlet;
  const mantlet = tag(new THREE.Mesh(
    createFrontPlateGeometry(
      mantletData.outline,
      mantletData.depth,
      'R35SA18MantletShieldGeometry',
      { bevelMeters: mantletData.bevelMeters }
    ),
    turretMat
  ), 'core', 'R35_SA18_MantletShield');
  mantlet.position.z = mantletData.frontZ - mantletData.depth;
  mantlet.userData.surfaceRole = 'embedded-mantlet-shield';
  mantlet.userData.sourceView = 'front';
  turretGroup.add(mantlet);

  const mainCollar = createForwardCylinder(
    mantletData.mainCollar.radius,
    mantletData.mainCollar.depth,
    14,
    turretMat,
    'R35_SA18_MainCollar',
    'core'
  );
  mainCollar.position.set(
    mantletData.mainCollar.x,
    mantletData.mainCollar.y,
    mantletData.frontZ + mantletData.mainCollar.depth / 2
  );
  mainCollar.userData.mountSide = VISUAL.mainGun.side;
  turretGroup.add(mainCollar);

  const lowerCover = createForwardCylinder(
    mantletData.lowerCover.radius,
    mantletData.lowerCover.depth,
    14,
    turretMat,
    'R35_SA18_LowerCover',
    'medium'
  );
  lowerCover.position.set(
    mantletData.lowerCover.x,
    mantletData.lowerCover.y,
    mantletData.frontZ + mantletData.lowerCover.depth / 2
  );
  lowerCover.userData.mountSide = VISUAL.mainGun.side;
  turretGroup.add(lowerCover);

  const coaxCollar = createForwardCylinder(
    mantletData.coaxCollar.radius,
    mantletData.coaxCollar.depth,
    12,
    turretMat,
    'R35_MAC31_CoaxCollar',
    'medium'
  );
  coaxCollar.position.set(
    mantletData.coaxCollar.x,
    mantletData.coaxCollar.y,
    mantletData.frontZ + mantletData.coaxCollar.depth / 2
  );
  coaxCollar.userData.mountSide = VISUAL.coax.side;
  turretGroup.add(coaxCollar);

  // Shallow roof boss only; APX-R roof height belongs to the cast turret.
  const cupolaData = VISUAL.turret.cupola;
  const cupola = tag(new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    turretMat
  ), 'core', 'R35_APXR_Cupola');
  cupola.position.set(
    cupolaData.centerX,
    cupolaData.baseY,
    cupolaData.centerZ
  );
  cupola.scale.set(cupolaData.radius, cupolaData.height, cupolaData.radius);
  turretGroup.add(cupola);

  const hatchData = VISUAL.turret.hatch;
  const hatch = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(
      hatchData.radius,
      hatchData.radius,
      hatchData.height,
      8
    ),
    turretMat
  ), 'high', 'R35_CupolaHatch');
  hatch.position.set(
    hatchData.centerX,
    hatchData.centerY,
    hatchData.centerZ
  );
  turretGroup.add(hatch);

  const barrelCenterZ = R35.gunMuzzleZ - R35.gunLength / 2;
  const barrel = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.048, R35.gunLength, 8),
    metalMat
  ), 'core', 'R35_SA18_Barrel');
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(R35.gunX, R35.gunY, barrelCenterZ);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.envelopeRole = 'weaponProjection';
  barrel.userData.mountSide = VISUAL.mainGun.side;
  turretGroup.add(barrel);

  const coax = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.02, VISUAL.coax.barrelLength, 7),
    metalMat
  ), 'high', 'coax_barrel');
  coax.rotation.x = Math.PI / 2;
  coax.position.set(
    R35.coaxX,
    R35.coaxY,
    VISUAL.coax.muzzleZ - VISUAL.coax.barrelLength / 2
  );
  coax.userData.weaponMountId = 'coax';
  coax.userData.envelopeRole = 'weaponProjection';
  coax.userData.mountSide = VISUAL.coax.side;
  turretGroup.add(coax);

  const coaxMuzzle = new THREE.Object3D();
  coaxMuzzle.name = 'coax_muzzle';
  coaxMuzzle.position.set(R35.coaxX, R35.coaxY, VISUAL.coax.muzzleZ);
  coaxMuzzle.userData.forwardAxis = '+Z';
  coaxMuzzle.userData.weaponMountId = 'coax';
  coaxMuzzle.userData.mountSide = VISUAL.coax.side;
  coaxMuzzle.userData.placementQuality =
    'blueprint-registered against user-supplied front and side elevations';
  turretGroup.add(coaxMuzzle);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'R35_Muzzle';
  muzzle.position.set(R35.gunX, R35.gunY, R35.gunMuzzleZ);
  muzzle.userData.forwardAxis = '+Z';
  muzzle.userData.weaponMountId = 'main';
  muzzle.userData.mountSide = VISUAL.mainGun.side;
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;
  tankGroup.userData.weaponMuzzles = { coax: coaxMuzzle };

  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(
    createCastHullGeometry(R35_PROXY_HULL_STATIONS),
    bodyMat
  );
  proxyBody.name = 'R35_ProxyCastHull';
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);

  for (const side of [-1, 1]) {
    const proxyMudguard = new THREE.Mesh(
      createSidePlateGeometry(
        VISUAL.mudguard.outline,
        VISUAL.mudguard.depth,
        'R35ProxySourceRegisteredMudguardGeometry'
      ),
      bodyMat
    );
    proxyMudguard.name = `R35_Proxy${
      side < 0 ? 'Right' : 'Left'
    }Mudguard`;
    proxyMudguard.position.x = side * VISUAL.mudguard.centerX;
    proxyMudguard.userData.lodBand = 'proxy';
    proxyMudguard.userData.surfaceRole = 'source-registered-mudguard';
    proxyMudguard.userData.sourceView = 'side';
    proxyMudguard.visible = false;
    proxyGroup.add(proxyMudguard);
  }

  const proxyRunningGear = createTrackedRunningGearProxy({
    id: 'R35SupportedTrackProxy',
    trackMaterial: trackMat,
    wheelMaterial: turretMat,
    trackCenterX: R35.trackCenterX,
    trackWidth: R35.trackWidth,
    beltLength: R35.trackLength,
    beltHeight: R35.trackHeight,
    centerY: R35.trackCenterY,
    roadWheelRadius: VISUAL.runningGear.trackPath.roadWheels[0].radius,
    roadWheelCount: R35.roadWheelCentersZ.length,
    linkPitch: 0.15,
    trackPath: VISUAL.runningGear.trackPath
  });
  proxyGroup.add(proxyRunningGear);

  const proxyTurret = new THREE.Mesh(
    createCastTurretGeometry(
      VISUAL.turret.proxySectionIndices.map(
        index => VISUAL.turret.sections[index]
      ),
      10
    ),
    turretMat
  );
  proxyTurret.name = 'R35_ProxyAPXRTurret';
  proxyTurret.position.set(
    R35.turretCenterX,
    R35.turretDeckY,
    R35.turretCenterZ
  );
  proxyTurret.userData.lodBand = 'proxy';
  proxyTurret.visible = false;
  proxyGroup.add(proxyTurret);

  const proxyRoofBoss = new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2),
    turretMat
  );
  proxyRoofBoss.name = 'R35_ProxyAPXRRoofBoss';
  proxyRoofBoss.position.set(
    R35.turretCenterX + VISUAL.turret.cupola.centerX,
    R35.turretDeckY + VISUAL.turret.cupola.baseY,
    R35.turretCenterZ + VISUAL.turret.cupola.centerZ
  );
  proxyRoofBoss.scale.set(
    VISUAL.turret.cupola.radius,
    R35.overallHeight - R35.turretDeckY - VISUAL.turret.cupola.baseY,
    VISUAL.turret.cupola.radius
  );
  proxyRoofBoss.userData.lodBand = 'proxy';
  proxyRoofBoss.visible = false;
  proxyGroup.add(proxyRoofBoss);
  tankGroup.add(proxyGroup);

  tankGroup.userData.modelMetadata = {
    designation: PROFILE.designation,
    dimensionsMeters: { ...PROFILE.dimensionsMeters },
    features: [...PROFILE.silhouetteFeatures],
    blueprintCalibration: R35_BLUEPRINT_CALIBRATION,
    representedConfiguration: 'tail-less production Renault R35'
  };

  return tankGroup;
}
