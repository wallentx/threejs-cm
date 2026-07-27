import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { getVehicleVisualProfile } from './VehicleVisualProfiles.js';

export const LAFFLY_S20TL_BLUEPRINT_CONTRACT = Object.freeze({
  dimensionsMeters: Object.freeze({ length: 5.35, width: 2.00, height: 2.00 }),
  // Measured as ratios of the rigid 5.35 m envelope on the Mick Bell 1/76
  // multi-view drawing. Positive Z is the bonnet/front of the vehicle.
  axleZ: Object.freeze([1.55, -0.82, -1.78]),
  wheelRadius: 0.46,
  wheelWidth: 0.28,
  frontRoller: Object.freeze({ z: 2.43, y: 0.22, radius: 0.22, x: 0.37, width: 0.16 }),
  bellyRoller: Object.freeze({ z: 0.36, y: 0.18, radius: 0.18, x: 0.47, width: 0.15 }),
  bonnet: Object.freeze({ rearZ: 1.36, frontZ: 2.625 }),
  cab: Object.freeze({ rearZ: -0.40, frontZ: 1.38, sideTopY: 1.75 }),
  troopBody: Object.freeze({ rearZ: -2.675, frontZ: -0.40, wallTopY: 1.75 }),
  windshield: Object.freeze({ centerZ: 1.38, bottomY: 1.65, topY: 2.00, width: 1.70 }),
  sources: Object.freeze([
    Object.freeze({
      title: 'Laffly S 20 TL, Voiture de Dragons Portés, 6×6, Mechanised Infantry',
      author: 'Mick Bell',
      url: 'https://commons.wikimedia.org/wiki/File:Laffly_S_20_TL,_Voiture_de_Dragons_Port%C3%A9s,_6%C3%976,_Mechanised_Infantry_-_Mick_Bell.png',
      sourceType: '1/76 multi-view line drawing',
      license: 'CC BY 4.0',
      use: 'side/front/top silhouette, axle ratios, body breaks, open-top layout'
    }),
    Object.freeze({
      title: 'Véhicule tactique France 1939-1940 : Laffly S 20 TL',
      author: 'ECPAD / Défense, photographer unknown',
      url: 'https://imagesdefense.gouv.fr/fr/vehicule-tactique-france-1939-1940-laffly-s-20-tl.html',
      sourceType: 'archival photograph record, TERRE 11194-G101',
      use: 'period configuration and exposed troop-body cross-check'
    }),
    Object.freeze({
      title: 'Laffly S20TL (France, 1937)',
      author: 'Sergey Rodovnichenko',
      url: 'https://commons.wikimedia.org/wiki/File:Laffly_S20TL_(France,_1937)_(4632233751).jpg',
      sourceType: 'museum photograph',
      license: 'CC BY-SA 2.0',
      use: 'bonnet, grille, fender, lamp, and undulation-roller shape cross-check'
    })
  ])
});

function tag(mesh, lodBand, name) {
  mesh.name = name;
  mesh.userData.lodBand = lodBand;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addBox(parent, dimensions, position, material, lodBand, name) {
  const mesh = tag(
    new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material),
    lodBand,
    name
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function createStationLoftGeometry(stations) {
  const ringSize = 6;
  const positions = [];
  for (const station of stations) {
    const topHalfWidth = station.topHalfWidth ?? station.halfWidth * 0.88;
    positions.push(
      -station.halfWidth, station.bottomY, station.z,
      station.halfWidth, station.bottomY, station.z,
      station.halfWidth, station.shoulderY, station.z,
      topHalfWidth, station.topY, station.z,
      -topHalfWidth, station.topY, station.z,
      -station.halfWidth, station.shoulderY, station.z
    );
  }

  const indices = [];
  for (let stationIndex = 0; stationIndex < stations.length - 1; stationIndex++) {
    const current = stationIndex * ringSize;
    const next = (stationIndex + 1) * ringSize;
    for (let pointIndex = 0; pointIndex < ringSize; pointIndex++) {
      const following = (pointIndex + 1) % ringSize;
      indices.push(
        current + pointIndex,
        current + following,
        next + following,
        current + pointIndex,
        next + following,
        next + pointIndex
      );
    }
  }

  const addCap = (stationIndex, front) => {
    const station = stations[stationIndex];
    const centerIndex = positions.length / 3;
    positions.push(0, (station.bottomY + station.topY) * 0.5, station.z);
    const ringStart = stationIndex * ringSize;
    for (let pointIndex = 0; pointIndex < ringSize; pointIndex++) {
      const following = (pointIndex + 1) % ringSize;
      if (front) {
        indices.push(centerIndex, ringStart + pointIndex, ringStart + following);
      } else {
        indices.push(centerIndex, ringStart + following, ringStart + pointIndex);
      }
    }
  };
  addCap(0, false);
  addCap(stations.length - 1, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.semanticStations = stations.map(station => ({ ...station }));
  return geometry;
}

function addWheel(parent, {
  x,
  z,
  radius,
  width,
  radialSegments,
  lodBand,
  name,
  rubberMaterial,
  metalMaterial,
  addHub = false,
  addTread = false
}) {
  const detailName = name.startsWith('S20TL_Wheel_')
    ? name.replace('S20TL_Wheel_', 'S20TL_WheelDetail_')
    : name;
  const tire = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, radialSegments),
    rubberMaterial
  ), lodBand, name);
  tire.rotation.z = Math.PI / 2;
  tire.position.set(x, radius, z);
  tire.userData.groundContactY = 0;
  tire.userData.axleZ = z;
  parent.add(tire);

  if (addHub) {
    const outerFace = x + Math.sign(x) * (width * 0.5 - 0.0175);
    const hub = tag(new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, 0.035, 12),
      metalMaterial
    ), 'medium', `${detailName}_Hub`);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(outerFace, radius, z);
    parent.add(hub);
  }

  if (addTread) {
    for (let treadIndex = 0; treadIndex < 14; treadIndex++) {
      const angle = treadIndex / 14 * Math.PI * 2;
      const tread = addBox(
        parent,
        [width, 0.035, 0.105],
        [
          x,
          radius + Math.cos(angle) * (radius - 0.075),
          z + Math.sin(angle) * (radius - 0.075)
        ],
        rubberMaterial,
        'high',
        `${detailName}_Tread_${treadIndex}`
      );
      tread.rotation.x = -angle;
    }
  }
  return tire;
}

function addRollerPair(parent, roller, materials, lodBand, segmentCount, prefix, details) {
  for (const side of [-1, 1]) {
    addWheel(parent, {
      x: side * roller.x,
      z: roller.z,
      radius: roller.radius,
      width: roller.width,
      radialSegments: segmentCount,
      lodBand,
      name: `${prefix}_${side < 0 ? 'Right' : 'Left'}`,
      rubberMaterial: materials.rubber,
      metalMaterial: materials.metal,
      addHub: details,
      addTread: false
    });
  }
}

function addMainWheels(parent, contract, materials, lodBand, segmentCount, details) {
  const wheelX = contract.dimensionsMeters.width * 0.5 - contract.wheelWidth * 0.5;
  for (const [axleIndex, axleZ] of contract.axleZ.entries()) {
    for (const side of [-1, 1]) {
      addWheel(parent, {
        x: side * wheelX,
        z: axleZ,
        radius: contract.wheelRadius,
        width: contract.wheelWidth,
        radialSegments: segmentCount,
        lodBand,
        name: lodBand === 'proxy'
          ? `S20TL_ProxyWheel_${axleIndex}_${side < 0 ? 'Right' : 'Left'}`
          : `S20TL_Wheel_${axleIndex}_${side < 0 ? 'Right' : 'Left'}`,
        rubberMaterial: materials.rubber,
        metalMaterial: materials.metal,
        addHub: details,
        addTread: details
      });
    }
  }
}

function addWindshield(parent, contract, materials, lodBand) {
  const width = contract.windshield.width;
  const height = contract.windshield.topY - contract.windshield.bottomY;
  const tilt = 0.08;
  const topFrameHalfDepth = 0.045 * 0.5;
  const centerY = contract.windshield.topY
    - height * 0.5 * Math.cos(tilt)
    - topFrameHalfDepth * Math.sin(tilt);
  const frame = new THREE.Group();
  frame.name = lodBand === 'proxy' ? 'S20TL_ProxyWindshieldFrame' : 'S20TL_WindshieldFrame';
  frame.position.set(0, centerY, contract.windshield.centerZ);
  frame.rotation.x = -tilt;
  parent.add(frame);

  addBox(frame, [width, 0.04, 0.045], [0, height * 0.5 - 0.02, 0], materials.metal, lodBand, `${frame.name}_Top`);
  addBox(frame, [width, 0.04, 0.045], [0, -height * 0.5 + 0.02, 0], materials.metal, lodBand, `${frame.name}_Bottom`);
  for (const x of [-width * 0.5 + 0.02, 0, width * 0.5 - 0.02]) {
    addBox(frame, [0.04, height, 0.045], [x, 0, 0], materials.metal, lodBand, `${frame.name}_Post_${x}`);
  }
  return frame;
}

function addFender(parent, wheelZ, x, materials, name) {
  const fender = tag(new THREE.Mesh(
    new THREE.TorusGeometry(0.555, 0.035, 6, 22, Math.PI),
    materials.paint
  ), 'medium', name);
  fender.rotation.y = -Math.PI / 2;
  fender.position.set(x, LAFFLY_S20TL_BLUEPRINT_CONTRACT.wheelRadius, wheelZ);
  parent.add(fender);
}

function addDetailedBody(parent, contract, materials) {
  addBox(parent, [1.54, 0.18, 4.88], [0, 0.66, -0.04], materials.metal, 'core', 'S20TL_Chassis');

  const bonnetStations = [
    { z: contract.bonnet.rearZ, halfWidth: 0.78, bottomY: 0.76, shoulderY: 1.56, topY: 1.67, topHalfWidth: 0.70 },
    { z: 1.62, halfWidth: 0.74, bottomY: 0.74, shoulderY: 1.49, topY: 1.61, topHalfWidth: 0.67 },
    { z: 2.38, halfWidth: 0.62, bottomY: 0.71, shoulderY: 1.39, topY: 1.51, topHalfWidth: 0.55 },
    { z: contract.bonnet.frontZ, halfWidth: 0.57, bottomY: 0.70, shoulderY: 1.36, topY: 1.48, topHalfWidth: 0.50 }
  ];
  const bonnet = tag(
    new THREE.Mesh(createStationLoftGeometry(bonnetStations), materials.paint),
    'core',
    'S20TL_LongTaperedBonnet'
  );
  bonnet.userData.calibrationRole = 'semantic station loft';
  parent.add(bonnet);

  // Cab panels stop below the windshield. No roof or canvas spans the cab.
  const bodyBottomY = 0.86;
  const cabPanelHeight = contract.cab.sideTopY - bodyBottomY;
  const cabPanelCenterY = bodyBottomY + cabPanelHeight * 0.5;
  const troopPanelHeight = contract.troopBody.wallTopY - bodyBottomY;
  const troopPanelCenterY = bodyBottomY + troopPanelHeight * 0.5;
  for (const side of [-1, 1]) {
    addBox(parent, [0.065, cabPanelHeight, 0.78], [side * 0.795, cabPanelCenterY, 0.98], materials.paint, 'core', `S20TL_CabFrontPanel_${side}`);
    addBox(parent, [0.065, cabPanelHeight, 1.00], [side * 0.88, cabPanelCenterY, 0.10], materials.paint, 'core', `S20TL_CabRearPanel_${side}`);
    addBox(parent, [0.08, troopPanelHeight, 2.24], [side * 0.91, troopPanelCenterY, -1.52], materials.paint, 'core', `S20TL_TroopSide_${side}`);
    addBox(parent, [0.035, 0.46, 0.90], [side * 0.952, 1.27, -1.02], materials.metal, 'high', `S20TL_TroopInsetFront_${side}`);
    addBox(parent, [0.035, 0.46, 0.90], [side * 0.952, 1.27, -2.00], materials.metal, 'high', `S20TL_TroopInsetRear_${side}`);

    addBox(parent, [0.44, 0.10, 1.85], [side * 0.62, 1.08, -1.52], materials.seat, 'medium', `S20TL_TroopBench_${side}`);
    addBox(parent, [0.12, 0.28, 1.85], [side * 0.80, 0.95, -1.52], materials.seat, 'high', `S20TL_TroopBenchBack_${side}`);
    addBox(parent, [0.18, 0.08, 1.08], [side * 0.83, 0.76, 0.66], materials.metal, 'medium', `S20TL_RunningBoard_${side}`);

    addFender(parent, contract.axleZ[0], side * 0.91, materials, `S20TL_FrontFender_${side}`);
    addFender(parent, contract.axleZ[1], side * 0.91, materials, `S20TL_MiddleFender_${side}`);
    addFender(parent, contract.axleZ[2], side * 0.91, materials, `S20TL_RearFender_${side}`);
  }

  addBox(parent, [1.76, 0.12, 1.67], [0, 0.82, 0.46], materials.paint, 'core', 'S20TL_CabFloor');
  addBox(parent, [1.82, 0.14, 2.20], [0, 0.84, -1.52], materials.paint, 'core', 'S20TL_TroopFloor');
  addBox(parent, [1.82, troopPanelHeight, 0.05], [0, troopPanelCenterY, -2.65], materials.paint, 'core', 'S20TL_Tailgate');
  addBox(parent, [1.82, troopPanelHeight, 0.055], [0, troopPanelCenterY, -0.43], materials.paint, 'core', 'S20TL_TroopBulkhead');

  addBox(parent, [0.68, 0.12, 0.48], [0.42, 1.08, 0.68], materials.seat, 'medium', 'S20TL_DriverSeat');
  addBox(parent, [0.68, 0.12, 0.48], [-0.42, 1.08, 0.68], materials.seat, 'medium', 'S20TL_CabPassengerSeat');
  addWindshield(parent, contract, materials, 'core');

  // Radiator shell, vertical grille, lamps, bonnet louvres, tow hooks, and
  // wheel hardware carry close-range identity without changing the envelope.
  addBox(parent, [1.12, 0.62, 0.05], [0, 1.17, 2.65], materials.metal, 'core', 'S20TL_RadiatorGrille');
  for (let barIndex = -5; barIndex <= 5; barIndex++) {
    addBox(parent, [0.035, 0.52, 0.004], [barIndex * 0.085, 1.17, 2.672], materials.paint, 'high', `S20TL_GrilleBar_${barIndex}`);
  }
  for (const side of [-1, 1]) {
    const lamp = tag(new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.13, 12),
      materials.metal
    ), 'medium', `S20TL_Headlamp_${side}`);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.63, 1.16, 2.50);
    parent.add(lamp);

    for (let louvreIndex = 0; louvreIndex < 9; louvreIndex++) {
      const louvre = addBox(
        parent,
        [0.018, 0.23, 0.025],
        [side * 0.746, 1.22, 1.58 + louvreIndex * 0.085],
        materials.metal,
        'high',
        `S20TL_BonnetLouvre_${side}_${louvreIndex}`
      );
      louvre.rotation.x = -0.08;
    }
  }

  const steeringWheel = tag(new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.018, 6, 16),
    materials.metal
  ), 'high', 'S20TL_SteeringWheel');
  steeringWheel.rotation.x = Math.PI * 0.43;
  steeringWheel.position.set(0.42, 1.31, 0.99);
  parent.add(steeringWheel);

  addMainWheels(parent, contract, materials, 'core', 20, true);
  addRollerPair(parent, contract.frontRoller, materials, 'core', 16, 'S20TL_FrontUndulationRoller', true);
  addRollerPair(parent, contract.bellyRoller, materials, 'core', 14, 'S20TL_BellyUndulationRoller', true);
}

function addProxyBody(parent, contract, materials) {
  addBox(parent, [1.50, 0.18, 4.86], [0, 0.66, -0.04], materials.metal, 'proxy', 'S20TL_ProxyChassis');

  const bonnet = tag(new THREE.Mesh(createStationLoftGeometry([
    { z: contract.bonnet.rearZ, halfWidth: 0.78, bottomY: 0.76, shoulderY: 1.56, topY: 1.67, topHalfWidth: 0.70 },
    { z: 2.38, halfWidth: 0.62, bottomY: 0.71, shoulderY: 1.39, topY: 1.51, topHalfWidth: 0.55 },
    { z: contract.bonnet.frontZ, halfWidth: 0.57, bottomY: 0.70, shoulderY: 1.36, topY: 1.48, topHalfWidth: 0.50 }
  ]), materials.paint), 'proxy', 'S20TL_ProxyBonnet');
  parent.add(bonnet);

  const bodyBottomY = 0.86;
  const cabPanelHeight = contract.cab.sideTopY - bodyBottomY;
  const cabPanelCenterY = bodyBottomY + cabPanelHeight * 0.5;
  const troopPanelHeight = contract.troopBody.wallTopY - bodyBottomY;
  const troopPanelCenterY = bodyBottomY + troopPanelHeight * 0.5;
  for (const side of [-1, 1]) {
    addBox(parent, [0.07, cabPanelHeight, 1.70], [side * 0.84, cabPanelCenterY, 0.47], materials.paint, 'proxy', `S20TL_ProxyCabSide_${side}`);
    addBox(parent, [0.08, troopPanelHeight, 2.24], [side * 0.91, troopPanelCenterY, -1.52], materials.paint, 'proxy', `S20TL_ProxyTroopSide_${side}`);
  }
  addBox(parent, [1.76, 0.12, 1.67], [0, 0.82, 0.46], materials.paint, 'proxy', 'S20TL_ProxyCabFloor');
  addBox(parent, [1.82, 0.14, 2.20], [0, 0.84, -1.52], materials.paint, 'proxy', 'S20TL_ProxyTroopFloor');
  addBox(parent, [1.82, troopPanelHeight, 0.05], [0, troopPanelCenterY, -2.65], materials.paint, 'proxy', 'S20TL_ProxyTailgate');
  addBox(parent, [1.12, 0.62, 0.05], [0, 1.17, 2.65], materials.metal, 'proxy', 'S20TL_ProxyRadiatorGrille');
  addWindshield(parent, contract, materials, 'proxy');
  addMainWheels(parent, contract, materials, 'proxy', 10, false);
  addRollerPair(parent, contract.frontRoller, materials, 'proxy', 8, 'S20TL_ProxyFrontRoller', false);
  addRollerPair(parent, contract.bellyRoller, materials, 'proxy', 8, 'S20TL_ProxyBellyRoller', false);
}

function createMaterials() {
  return {
    paint: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#556642',
      roughness: 0.82,
      metalness: 0.08
    }), 'paint'),
    rubber: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#1c1f1b',
      roughness: 0.95
    }), 'rubber'),
    metal: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#111512',
      roughness: 0.42,
      metalness: 0.78
    }), 'metal'),
    seat: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#5d5947',
      roughness: 0.94
    }), 'canvas')
  };
}

export function createLafflyS20TLMesh() {
  const profile = getVehicleVisualProfile('fr_laffly_s20tl');
  const contract = LAFFLY_S20TL_BLUEPRINT_CONTRACT;
  const truckGroup = new THREE.Group();
  truckGroup.name = 'fr_laffly_s20tl';
  truckGroup.userData.authoredHull = true;
  truckGroup.userData.openTop = true;
  truckGroup.userData.canvasTop = false;

  const materials = createMaterials();
  addDetailedBody(truckGroup, contract, materials);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'S20TL_UnarmedHardpoint';
  muzzle.position.set(0, 1.30, -0.30);
  truckGroup.add(muzzle);
  truckGroup.userData.muzzle = muzzle;

  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  addProxyBody(proxyGroup, contract, materials);
  proxyGroup.traverse(object => {
    if (object.isMesh) object.visible = false;
  });
  truckGroup.add(proxyGroup);

  truckGroup.userData.modelMetadata = {
    designation: profile.designation,
    dimensionsMeters: profile.dimensionsMeters,
    references: profile.references,
    dataQuality: profile.dataQuality,
    features: [
      '6x6 troop carrier',
      'three driven axles',
      'front and belly undulation rollers',
      'long tapered bonnet',
      'open ten-man troop body',
      'roofless cab and troop compartment'
    ],
    blueprintContract: contract,
    visualContract: {
      identity: ['long bonnet', 'three widely spaced axles', 'two undulation-roller pairs', 'open high-sided rear body'],
      silhouette: ['low tapering bonnet', 'upright split windscreen', 'roofless cab', 'open rectangular troop body'],
      invariants: ['5.35 x 2.00 x 2.00 m rigid envelope', 'all wheels touch y=0', 'no canvas top at any LOD'],
      lodPolicy: {
        core: 'rigid body, open-top silhouette, main wheels, both undulation-roller pairs',
        medium: 'fenders, benches, hubs, lamps, running boards',
        high: 'glazing, grille, louvres, tread blocks, interior controls',
        proxy: 'low-cost but mechanically complete open-top silhouette'
      }
    },
    calibrationDatums: {
      factual: {
        rigidEnvelopeMeters: contract.dimensionsMeters,
        configuration: 'uncovered Voiture de Dragons Portés, 6x6'
      },
      drawingMeasured: {
        axleZ: contract.axleZ,
        bonnetBreakZ: contract.bonnet.rearZ,
        troopBodyFrontZ: contract.troopBody.frontZ,
        troopBodyRearZ: contract.troopBody.rearZ,
        windshieldTopY: contract.windshield.topY
      },
      photoInferred: {
        bonnetSectionWidths: 'estimated from drawing plan view and museum oblique photograph',
        panelThicknesses: 'game-geometry approximation',
        wheelAndRollerWidths: 'photo-derived approximation'
      }
    },
    sourceRecords: contract.sources
  };

  return truckGroup;
}
