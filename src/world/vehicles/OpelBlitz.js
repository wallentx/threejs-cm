import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';

// Opel Blitz 3.6-36 S dimensions in metres. Overall width includes mirrors and
// overall height includes the cargo tilt. The wheel/tyre radius is derived from
// the documented 190-20 tyre rather than treated as an exact body dimension.
const D = Object.freeze({
  length: 6.020,
  width: 2.270,
  height: 2.590,
  wheelbase: 3.600,
  frontAxleZ: 2.190,
  rearAxleZ: -1.410,
  frontTrack: 1.542,
  rearTrack: 1.620,
  tyreWidth: 0.190,
  wheelRadius: 0.444,
  bedLength: 3.500,
  bedWidth: 2.125,
  bedCenterZ: -1.150
});

const BLUEPRINT_CALIBRATION = Object.freeze({
  dimensionSource: Object.freeze({
    title: 'Opel historical commercial-vehicle data, LKW 1899-1996, page 74',
    url: 'https://historisk-opelklub.dk/wp-content/uploads/2012/06/Opel-Data-Leif__LKW_1899-1996.pdf',
    values: Object.freeze({
      overallMillimetres: Object.freeze([6020, 2270, 2590]),
      overallPolicy: 'with mirrors and canvas',
      wheelbaseMillimetres: 3600,
      trackMillimetres: Object.freeze([1542, 1620]),
      bedMillimetres: Object.freeze([3500, 2125, 1430]),
      tyres: '190-20; twin rear tyres'
    }),
    quality: 'historical Opel dimensional table'
  }),
  source: Object.freeze({
    title: 'Opel Blitz 3.6 S 3-ton Kfz. 305 four-view drawing',
    url: 'https://www.the-blueprints.com/blueprints/trucks/opel/43128/view/opel_blitz_36s_3-ton_kfz305/',
    previewUrl: 'https://www.the-blueprints.com/blueprints-depot/trucks/opel/opel-blitz-36s-3-ton-kfz305.png',
    quality: 'variant-specific published elevations; used locally, not redistributed'
  }),
  registration: Object.freeze({
    sourceImagePixels: Object.freeze([785, 535]),
    mirrorX: false,
    views: Object.freeze({
      side: Object.freeze({
        cropPixels: Object.freeze([245, 270, 540, 265]),
        trimmedPixels: Object.freeze([530, 246]),
        fittedAxesMeters: Object.freeze([D.length, D.height])
      }),
      front: Object.freeze({
        cropPixels: Object.freeze([0, 270, 240, 265]),
        trimmedPixels: Object.freeze([201, 246]),
        fittedAxesMeters: Object.freeze([D.width, D.height])
      }),
      top: Object.freeze({
        cropPixels: Object.freeze([235, 10, 550, 230]),
        trimmedPixels: Object.freeze([528, 201]),
        fittedAxesMeters: Object.freeze([D.length, D.width])
      })
    }),
    scalePolicy: 'each published view is independently normalized to its exact historical axes',
    quality: 'three orthographic views registered to the exact overall envelope'
  }),
  datums: Object.freeze({
    rigidEnvelope: Object.freeze({
      value: Object.freeze([D.width, D.height, D.length]),
      quality: 'historical exact, with mirrors and canvas'
    }),
    bed: Object.freeze({
      value: Object.freeze([D.bedWidth, D.bedLength]),
      quality: 'historical exact'
    }),
    wheelbase: Object.freeze({ value: D.wheelbase, quality: 'historical exact' }),
    tracks: Object.freeze({
      value: Object.freeze([D.frontTrack, D.rearTrack]),
      quality: 'historical exact'
    }),
    axleCenters: Object.freeze({
      value: Object.freeze([D.frontAxleZ, D.rearAxleZ]),
      quality: 'side-elevation registration constrained to historical wheelbase'
    }),
    wheelRadius: Object.freeze({
      value: D.wheelRadius,
      quality: 'derived from documented 190-20 tyre designation'
    }),
    bonnetAndCabStations: Object.freeze({
      quality: 'three-view-derived; inferred to nearest centimetre'
    }),
    canvasCrown: Object.freeze({
      quality: 'three-view-derived; constrained to exact overall height'
    })
  }),
  resolvedConflict: Object.freeze({
    previousApproximation: Object.freeze([6.10, 2.26, 2.56]),
    resolution: 'replaced by Opel table dimensions 6.020 x 2.270 x 2.590 m'
  }),
  allowedDivergences: Object.freeze([
    'published views have independent image scaling and are registered per axis',
    'cab corner radii and window openings remain drawing-informed approximations',
    'canvas and spring thicknesses are exaggerated slightly for game-distance readability'
  ])
});

const CAB_STATIONS = Object.freeze([
  { z: 0.42, halfWidth: 0.99, floorY: 0.77, shoulderY: 1.55, roofHalfWidth: 0.75, roofY: 1.90 },
  { z: 0.55, halfWidth: 1.00, floorY: 0.75, shoulderY: 1.57, roofHalfWidth: 0.82, roofY: 1.95 },
  { z: 1.16, halfWidth: 0.99, floorY: 0.75, shoulderY: 1.58, roofHalfWidth: 0.81, roofY: 1.96 },
  { z: 1.40, halfWidth: 0.91, floorY: 0.78, shoulderY: 1.50, roofHalfWidth: 0.70, roofY: 1.84 }
]);

const BONNET_STATIONS = Object.freeze([
  { z: 1.33, halfWidth: 0.76, floorY: 0.78, shoulderY: 1.25, roofHalfWidth: 0.66, roofY: 1.42 },
  { z: 2.36, halfWidth: 0.74, floorY: 0.75, shoulderY: 1.23, roofHalfWidth: 0.65, roofY: 1.38 },
  { z: 2.70, halfWidth: 0.64, floorY: 0.76, shoulderY: 1.20, roofHalfWidth: 0.54, roofY: 1.34 }
]);

function signedVolume(geometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  let volume = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const ia = index ? index.getX(triangle * 3) : triangle * 3;
    const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
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
  geometry.userData.orientationChecked = true;
  return geometry;
}

function stationRing(station) {
  return [
    [-station.halfWidth, station.floorY, station.z],
    [-station.halfWidth, station.shoulderY, station.z],
    [-station.roofHalfWidth, station.roofY, station.z],
    [station.roofHalfWidth, station.roofY, station.z],
    [station.halfWidth, station.shoulderY, station.z],
    [station.halfWidth, station.floorY, station.z]
  ];
}

function createClosedStationLoft(stations, name) {
  const rings = stations.map(stationRing);
  const ringSize = rings[0].length;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (const ring of rings) {
    for (const [x, y, z] of ring) {
      positions.push(x, y, z);
      uvs.push(z, y);
    }
  }
  for (let station = 0; station < rings.length - 1; station++) {
    for (let point = 0; point < ringSize; point++) {
      const next = (point + 1) % ringSize;
      const a = station * ringSize + point;
      const b = station * ringSize + next;
      const c = (station + 1) * ringSize + next;
      const d = (station + 1) * ringSize + point;
      indices.push(a, b, c, a, c, d);
    }
  }
  for (let point = 1; point < ringSize - 1; point++) {
    indices.push(0, point + 1, point);
    const front = (rings.length - 1) * ringSize;
    indices.push(front, front + point, front + point + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return orientOutward(geometry);
}

function createCanvasGeometry(width, wallHeight, crownHeight, depth, curveSegments = 6) {
  const halfWidth = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(halfWidth, 0);
  shape.lineTo(halfWidth, wallHeight);
  shape.quadraticCurveTo(halfWidth * 0.72, wallHeight + crownHeight, 0, wallHeight + crownHeight);
  shape.quadraticCurveTo(-halfWidth * 0.72, wallHeight + crownHeight, -halfWidth, wallHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments,
    steps: 1
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function tag(mesh, lodBand, name, envelopeRole = 'rigidBody') {
  mesh.name = name;
  mesh.userData.lodBand = lodBand;
  mesh.userData.envelopeRole = envelopeRole;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addMesh(parent, geometry, material, lodBand, name, envelopeRole) {
  const mesh = tag(new THREE.Mesh(geometry, material), lodBand, name, envelopeRole);
  parent.add(mesh);
  return mesh;
}

function addBox(parent, dimensions, position, material, lodBand, name, envelopeRole) {
  const mesh = addMesh(
    parent,
    new THREE.BoxGeometry(...dimensions),
    material,
    lodBand,
    name,
    envelopeRole
  );
  mesh.position.set(...position);
  return mesh;
}

function addWheel(parent, {
  x,
  z,
  width,
  name,
  tyreMaterial,
  hubMaterial,
  lodBand = 'core',
  radialSegments = 20
}) {
  const wheel = addMesh(
    parent,
    new THREE.CylinderGeometry(D.wheelRadius, D.wheelRadius, width, radialSegments),
    tyreMaterial,
    lodBand,
    name
  );
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(x, D.wheelRadius, z);
  wheel.userData.axleZ = z;
  wheel.userData.tyreWidth = width;

  const hub = addMesh(
    wheel,
    new THREE.CylinderGeometry(D.wheelRadius * 0.43, D.wheelRadius * 0.43, width + 0.006, 16),
    hubMaterial,
    lodBand === 'proxy' ? 'proxy' : 'medium',
    `${name}_SteelDisc`
  );
  hub.userData.envelopeRole = 'surfaceDetail';
  return wheel;
}

function addFender(parent, x, z, material, name) {
  const fender = addMesh(
    parent,
    new THREE.TorusGeometry(D.wheelRadius + 0.075, 0.045, 7, 24, Math.PI),
    material,
    'medium',
    name
  );
  fender.rotation.y = Math.PI / 2;
  fender.position.set(x, D.wheelRadius, z);
  return fender;
}

function addLeafSpring(parent, x, z, leafCount, material, name) {
  const spring = new THREE.Group();
  spring.name = name;
  spring.userData.lodBand = 'high';
  spring.userData.leafCount = leafCount;
  for (let leaf = 0; leaf < leafCount; leaf++) {
    const length = 0.88 - leaf * 0.045;
    addBox(
      spring,
      [0.07, 0.012, length],
      [0, leaf * 0.012, 0],
      material,
      'high',
      `${name}_Leaf_${leaf}`,
      'surfaceDetail'
    );
  }
  spring.position.set(x, 0.66, z);
  parent.add(spring);
  return spring;
}

function makeMaterials() {
  return {
    paint: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#40474a',
      roughness: 0.78,
      metalness: 0.12
    }), 'paint'),
    wood: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#574a38',
      roughness: 0.88,
      metalness: 0.02
    }), 'wood'),
    canvas: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#625f4d',
      roughness: 0.95,
      metalness: 0
    }), 'canvas'),
    rubber: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#17191a',
      roughness: 0.96,
      metalness: 0.01
    }), 'rubber'),
    metal: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#262b2c',
      roughness: 0.48,
      metalness: 0.72
    }), 'metal'),
    glass: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#56666d',
      roughness: 0.24,
      metalness: 0.08
    }), 'metal')
  };
}

function addDetailedRunningGear(root, materials) {
  const runningGear = new THREE.Group();
  runningGear.name = 'OpelBlitz_RunningGear';
  runningGear.userData.lodBand = 'medium';
  runningGear.userData.configuration = '4x2-single-front-twin-rear';
  runningGear.userData.frontTrack = D.frontTrack;
  runningGear.userData.rearTrack = D.rearTrack;
  runningGear.userData.wheelbase = D.wheelbase;

  const frontX = D.frontTrack / 2;
  const rearPairOffset = 0.105;
  for (const side of [-1, 1]) {
    addWheel(runningGear, {
      x: side * frontX,
      z: D.frontAxleZ,
      width: D.tyreWidth,
      name: `OpelBlitz_FrontWheel_${side < 0 ? 'Right' : 'Left'}`,
      tyreMaterial: materials.rubber,
      hubMaterial: materials.paint
    });
    addFender(
      runningGear,
      side * frontX,
      D.frontAxleZ,
      materials.paint,
      `OpelBlitz_FrontFender_${side < 0 ? 'Right' : 'Left'}`
    );

    for (const pair of [-1, 1]) {
      const x = side * (D.rearTrack / 2 + pair * rearPairOffset);
      addWheel(runningGear, {
        x,
        z: D.rearAxleZ,
        width: D.tyreWidth,
        name: `OpelBlitz_RearWheel_${side < 0 ? 'Right' : 'Left'}_${pair < 0 ? 'Inner' : 'Outer'}`,
        tyreMaterial: materials.rubber,
        hubMaterial: materials.paint
      });
    }
    addFender(
      runningGear,
      side * (D.rearTrack / 2),
      D.rearAxleZ,
      materials.paint,
      `OpelBlitz_RearFender_${side < 0 ? 'Right' : 'Left'}`
    );
    addLeafSpring(
      runningGear,
      side * 0.59,
      D.frontAxleZ,
      10,
      materials.metal,
      `OpelBlitz_FrontSpring_${side < 0 ? 'Right' : 'Left'}`
    );
    addLeafSpring(
      runningGear,
      side * 0.59,
      D.rearAxleZ,
      9,
      materials.metal,
      `OpelBlitz_RearSpring_${side < 0 ? 'Right' : 'Left'}`
    );
  }

  addBox(runningGear, [1.47, 0.09, 0.09], [0, 0.54, D.frontAxleZ], materials.metal, 'medium', 'OpelBlitz_FrontAxle');
  addBox(runningGear, [1.62, 0.12, 0.12], [0, 0.54, D.rearAxleZ], materials.metal, 'medium', 'OpelBlitz_RearAxle');
  const driveShaft = addMesh(
    runningGear,
    new THREE.CylinderGeometry(0.035, 0.035, D.wheelbase, 8),
    materials.metal,
    'high',
    'OpelBlitz_DriveShaft',
    'surfaceDetail'
  );
  driveShaft.rotation.x = Math.PI / 2;
  driveShaft.position.set(0, 0.58, (D.frontAxleZ + D.rearAxleZ) / 2);
  root.add(runningGear);
  root.userData.runningGear = runningGear;
}

function addCabAndBonnet(root, materials) {
  const cab = addMesh(
    root,
    createClosedStationLoft(CAB_STATIONS, 'OpelBlitz_CabLoftGeometry'),
    materials.paint,
    'core',
    'OpelBlitz_Cab'
  );
  cab.userData.stationSource = 'registered-front-side-top-elevations';
  root.userData.cab = cab;

  const bonnet = addMesh(
    root,
    createClosedStationLoft(BONNET_STATIONS, 'OpelBlitz_BonnetLoftGeometry'),
    materials.paint,
    'core',
    'OpelBlitz_Bonnet'
  );
  bonnet.userData.stationSource = 'registered-front-side-top-elevations';
  root.userData.bonnet = bonnet;

  addBox(root, [1.18, 0.55, 0.055], [0, 1.07, 2.725], materials.paint, 'core', 'OpelBlitz_RadiatorShell');
  for (let bar = -4; bar <= 4; bar++) {
    addBox(
      root,
      [0.055, 0.46, 0.018],
      [bar * 0.116, 1.07, 2.755],
      materials.metal,
      'high',
      `OpelBlitz_GrilleBar_${bar}`,
      'surfaceDetail'
    );
  }

  for (const side of [-1, 1]) {
    addBox(
      root,
      [0.72, 0.41, 0.018],
      [side * 0.39, 1.59, 1.405],
      materials.glass,
      'high',
      `OpelBlitz_Windscreen_${side < 0 ? 'Right' : 'Left'}`,
      'surfaceDetail'
    );
    addBox(
      root,
      [0.018, 0.43, 0.47],
      [side * 1.005, 1.57, 0.92],
      materials.glass,
      'high',
      `OpelBlitz_SideWindow_${side < 0 ? 'Right' : 'Left'}`,
      'surfaceDetail'
    );
    addBox(
      root,
      [0.018, 0.73, 0.54],
      [side * 1.006, 1.16, 0.79],
      materials.paint,
      'high',
      `OpelBlitz_DoorPanel_${side < 0 ? 'Right' : 'Left'}`,
      'surfaceDetail'
    );
    addBox(
      root,
      [0.17, 0.12, 0.10],
      [side * 0.64, 1.14, 2.74],
      materials.metal,
      'high',
      `OpelBlitz_Headlamp_${side < 0 ? 'Right' : 'Left'}`,
      'surfaceDetail'
    );

    // Mirror pads are the exact overall-width controls; slender arms remain
    // inside the same envelope and are intentionally classed as rigid.
    addBox(
      root,
      [0.13, 0.16, 0.045],
      [side * 1.07, 1.69, 1.12],
      materials.metal,
      'medium',
      `OpelBlitz_Mirror_${side < 0 ? 'Right' : 'Left'}`
    );
  }
}

function addCargoBody(root, materials) {
  addBox(
    root,
    [D.bedWidth, 0.14, D.bedLength],
    [0, 0.91, D.bedCenterZ],
    materials.wood,
    'core',
    'OpelBlitz_CargoFloor'
  );
  for (const side of [-1, 1]) {
    addBox(
      root,
      [0.065, 0.50, D.bedLength],
      [side * (D.bedWidth / 2 - 0.0325), 1.22, D.bedCenterZ],
      materials.wood,
      'core',
      `OpelBlitz_BedSide_${side < 0 ? 'Right' : 'Left'}`
    );
    addBox(
      root,
      [0.11, 0.09, 3.18],
      [side * 0.91, 0.75, D.bedCenterZ],
      materials.metal,
      'medium',
      `OpelBlitz_BedRail_${side < 0 ? 'Right' : 'Left'}`
    );
    for (let slat = 0; slat < 4; slat++) {
      addBox(
        root,
        [0.018, 0.025, D.bedLength - 0.10],
        [side * (D.bedWidth / 2 + 0.004), 1.05 + slat * 0.13, D.bedCenterZ],
        materials.metal,
        'high',
        `OpelBlitz_BedSlat_${side < 0 ? 'Right' : 'Left'}_${slat}`,
        'surfaceDetail'
      );
    }
  }
  addBox(
    root,
    [D.bedWidth, 0.50, 0.065],
    [0, 1.22, D.bedCenterZ - D.bedLength / 2 + 0.0325],
    materials.wood,
    'core',
    'OpelBlitz_Tailgate'
  );

  const canvasBaseY = 1.46;
  const canvasWallHeight = 0.96;
  const canvasCrownHeight = D.height - canvasBaseY - canvasWallHeight;
  const canvas = addMesh(
    root,
    createCanvasGeometry(
      D.bedWidth,
      canvasWallHeight,
      canvasCrownHeight,
      D.bedLength,
      8
    ),
    materials.canvas,
    'core',
    'OpelBlitz_CanvasTilt'
  );
  canvas.position.set(0, canvasBaseY, D.bedCenterZ);
  canvas.userData.crownHeight = canvasCrownHeight;
  canvas.userData.rigidTopY = D.height;
  root.userData.canvas = canvas;

  for (const z of [-2.70, -2.00, -1.30, -0.60, 0.10, 0.50]) {
    for (const side of [-1, 1]) {
      addBox(
        root,
        [0.035, 0.98, 0.035],
        [side * 1.035, 1.95, z],
        materials.metal,
        'medium',
        `OpelBlitz_CanvasHoopPost_${side < 0 ? 'Right' : 'Left'}_${z}`
      );
    }
    addBox(
      root,
      [2.07, 0.035, 0.035],
      [0, 2.42, z],
      materials.metal,
      'medium',
      `OpelBlitz_CanvasHoopCrossbar_${z}`
    );
  }
}

function addChassis(root, materials) {
  for (const side of [-1, 1]) {
    addBox(
      root,
      [0.12, 0.19, 5.48],
      [side * 0.54, 0.68, -0.04],
      materials.metal,
      'core',
      `OpelBlitz_ChassisRail_${side < 0 ? 'Right' : 'Left'}`
    );
    addBox(
      root,
      [0.18, 0.09, 0.90],
      [side * 0.90, 0.78, 1.36],
      materials.metal,
      'medium',
      `OpelBlitz_RunningBoard_${side < 0 ? 'Right' : 'Left'}`
    );
  }
  for (const z of [-2.35, -1.41, -0.30, 0.80, 2.19]) {
    addBox(root, [1.20, 0.10, 0.10], [0, 0.68, z], materials.metal, 'medium', `OpelBlitz_Crossmember_${z}`);
  }
  addBox(root, [1.74, 0.12, 0.04], [0, 0.59, 2.99], materials.metal, 'core', 'OpelBlitz_FrontBumper');
  addBox(root, [1.72, 0.12, 0.04], [0, 0.59, -2.99], materials.metal, 'core', 'OpelBlitz_RearBumper');
}

function addAuthoredProxy(root, materials) {
  const proxy = new THREE.Group();
  proxy.name = 'Proxy';
  proxy.userData.authored = true;
  proxy.userData.lodBand = 'proxy';

  const proxyPart = (dimensions, position, material, name) => {
    const mesh = addBox(proxy, dimensions, position, material, 'proxy', name);
    mesh.visible = false;
    return mesh;
  };
  proxyPart([1.20, 0.18, 5.44], [0, 0.68, -0.03], materials.metal, 'OpelBlitz_ProxyChassis');
  const proxyBonnet = addMesh(
    proxy,
    createClosedStationLoft(BONNET_STATIONS, 'OpelBlitz_ProxyBonnetLoftGeometry'),
    materials.paint,
    'proxy',
    'OpelBlitz_ProxyBonnet'
  );
  proxyBonnet.visible = false;
  const proxyCab = addMesh(
    proxy,
    createClosedStationLoft(CAB_STATIONS, 'OpelBlitz_ProxyCabLoftGeometry'),
    materials.paint,
    'proxy',
    'OpelBlitz_ProxyCab'
  );
  proxyCab.visible = false;
  proxyPart([D.bedWidth, 0.50, D.bedLength], [0, 1.20, D.bedCenterZ], materials.wood, 'OpelBlitz_ProxyBed');

  const canvasBaseY = 1.46;
  const proxyCanvas = addMesh(
    proxy,
    createCanvasGeometry(D.bedWidth, 0.96, 0.17, D.bedLength, 3),
    materials.canvas,
    'proxy',
    'OpelBlitz_ProxyCanvas'
  );
  proxyCanvas.position.set(0, canvasBaseY, D.bedCenterZ);
  proxyCanvas.visible = false;

  for (const side of [-1, 1]) {
    for (const [z, x] of [
      [D.frontAxleZ, side * D.frontTrack / 2],
      [D.rearAxleZ, side * D.rearTrack / 2]
    ]) {
      addWheel(proxy, {
        x,
        z,
        width: z === D.frontAxleZ ? D.tyreWidth : D.tyreWidth * 2.1,
        name: `OpelBlitz_ProxyWheel_${side}_${z}`,
        tyreMaterial: materials.rubber,
        hubMaterial: materials.paint,
        lodBand: 'proxy',
        radialSegments: 12
      }).visible = false;
    }
    proxyPart(
      [0.13, 0.16, 0.045],
      [side * 1.07, 1.69, 1.12],
      materials.metal,
      `OpelBlitz_ProxyMirror_${side}`
    );
  }
  proxyPart([1.74, 0.12, 0.04], [0, 0.59, 2.99], materials.metal, 'OpelBlitz_ProxyFrontBumper');
  proxyPart([1.72, 0.12, 0.04], [0, 0.59, -2.99], materials.metal, 'OpelBlitz_ProxyRearBumper');
  root.add(proxy);
}

export function createOpelBlitzMesh() {
  const truck = new THREE.Group();
  truck.name = 'ger_opel_blitz';
  truck.userData.authoredHull = true;
  truck.userData.authoredProxy = true;
  truck.userData.vehicleKind = 'truck';
  const materials = makeMaterials();

  addChassis(truck, materials);
  addDetailedRunningGear(truck, materials);
  addCabAndBonnet(truck, materials);
  addCargoBody(truck, materials);
  addAuthoredProxy(truck, materials);

  const hardpoint = new THREE.Object3D();
  hardpoint.name = 'OpelBlitz_UnarmedHardpoint';
  hardpoint.position.set(0, 1.55, 0);
  truck.add(hardpoint);
  truck.userData.muzzle = hardpoint;

  truck.userData.modelMetadata = {
    designation: 'Opel Blitz 3.6-36 S',
    dimensionsMeters: {
      length: D.length,
      width: D.width,
      height: D.height
    },
    dimensionPolicy: 'overall rigid parked envelope includes mirrors and canvas',
    blueprintCalibration: BLUEPRINT_CALIBRATION,
    runningGear: {
      layout: '4x2',
      frontTyresPerSide: 1,
      rearTyresPerSide: 2,
      wheelbaseMeters: D.wheelbase,
      frontTrackMeters: D.frontTrack,
      rearTrackMeters: D.rearTrack,
      frontSpringLeaves: 10,
      rearSpringLeaves: 9
    },
    cargoBed: {
      lengthMeters: D.bedLength,
      widthMeters: D.bedWidth,
      centerZ: D.bedCenterZ
    },
    dataQuality: 'historical dimensions with drawing-derived body stations'
  };

  return truck;
}
