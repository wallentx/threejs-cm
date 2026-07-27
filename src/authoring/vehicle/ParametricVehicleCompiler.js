import * as THREE from 'three';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from '../../world/vehicles/TrackedRunningGear.js';
import {
  setVehicleMaterialSlot
} from '../../world/vehicles/VehicleMaterialLibrary.js';

const finitePositive = (value, label) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a finite positive number`);
  }
  return value;
};

const finiteVector = (value, length, label) => {
  if (
    !Array.isArray(value)
    || value.length !== length
    || value.some(component => !Number.isFinite(component))
  ) {
    throw new TypeError(`${label} must contain ${length} finite numbers`);
  }
  return value;
};

const dictionary = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
};

function validateAscending(values, label) {
  for (let index = 1; index < values.length; index++) {
    if (!(values[index] > values[index - 1])) {
      throw new Error(`${label} must be strictly ascending`);
    }
  }
}

function validateStation(station, index) {
  dictionary(station, `hull station ${index}`);
  for (const key of [
    'z',
    'bottomHalfWidth',
    'bottomY',
    'lowerHalfWidth',
    'lowerY',
    'halfWidth',
    'shoulderY',
    'upperHalfWidth',
    'upperY',
    'deckHalfWidth',
    'deckY'
  ]) {
    if (!Number.isFinite(station[key])) {
      throw new TypeError(`hull station ${index}.${key} must be finite`);
    }
  }
  for (const key of [
    'bottomHalfWidth',
    'lowerHalfWidth',
    'halfWidth',
    'upperHalfWidth',
    'deckHalfWidth'
  ]) {
    finitePositive(station[key], `hull station ${index}.${key}`);
  }
  validateAscending(
    [
      station.bottomY,
      station.lowerY,
      station.shoulderY,
      station.upperY,
      station.deckY
    ],
    `hull station ${index} levels`
  );
}

function validateIndices(indices, length, label) {
  if (!Array.isArray(indices) || indices.length < 2) {
    throw new TypeError(`${label} requires at least two indices`);
  }
  const seen = new Set();
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= length) {
      throw new RangeError(`${label} contains invalid index ${index}`);
    }
    if (seen.has(index)) throw new Error(`${label} contains duplicate index ${index}`);
    seen.add(index);
  }
  validateAscending(indices, label);
}

export function validateParametricVehicleDefinition(definition) {
  dictionary(definition, 'parametric vehicle definition');
  if (definition.type !== 'parametric-vehicle-authoring-v1') {
    throw new Error('unsupported parametric vehicle definition type');
  }
  if (typeof definition.modelId !== 'string' || definition.modelId.length === 0) {
    throw new TypeError('parametric vehicle definition requires modelId');
  }
  if (typeof definition.designation !== 'string' || definition.designation.length === 0) {
    throw new TypeError('parametric vehicle definition requires designation');
  }
  if (
    typeof definition.meshPrefix !== 'string'
    || !/^[A-Za-z][A-Za-z0-9_]*$/.test(definition.meshPrefix)
  ) {
    throw new TypeError('parametric vehicle definition requires a stable meshPrefix');
  }
  const dimensions = dictionary(definition.dimensionsMeters, 'dimensionsMeters');
  finitePositive(dimensions.length, 'dimensionsMeters.length');
  finitePositive(dimensions.width, 'dimensionsMeters.width');
  finitePositive(dimensions.height, 'dimensionsMeters.height');

  const geometry = dictionary(definition.geometry, 'geometry');
  const hull = dictionary(geometry.hull, 'geometry.hull');
  if (!Array.isArray(hull.stations) || hull.stations.length < 4) {
    throw new TypeError('geometry.hull.stations requires at least four stations');
  }
  hull.stations.forEach(validateStation);
  validateAscending(hull.stations.map(station => station.z), 'hull station z');
  validateIndices(
    hull.proxyStationIndices,
    hull.stations.length,
    'geometry.hull.proxyStationIndices'
  );

  const turret = dictionary(geometry.turret, 'geometry.turret');
  finiteVector(turret.center, 3, 'geometry.turret.center');
  if (!Array.isArray(turret.rings) || turret.rings.length < 3) {
    throw new TypeError('geometry.turret.rings requires at least three rings');
  }
  validateAscending(turret.rings.map(ring => ring.y), 'turret ring y');
  for (const [index, ring] of turret.rings.entries()) {
    finitePositive(ring.halfWidth, `turret ring ${index}.halfWidth`);
    finitePositive(ring.frontLength, `turret ring ${index}.frontLength`);
    finitePositive(ring.rearLength, `turret ring ${index}.rearLength`);
    if (!Number.isFinite(ring.centerZ)) {
      throw new TypeError(`turret ring ${index}.centerZ must be finite`);
    }
  }
  validateIndices(
    turret.proxyRingIndices,
    turret.rings.length,
    'geometry.turret.proxyRingIndices'
  );
  if (!Number.isInteger(turret.segments) || turret.segments < 8) {
    throw new TypeError('geometry.turret.segments must be an integer >= 8');
  }
  finiteVector(turret.cupola.center, 3, 'geometry.turret.cupola.center');
  finitePositive(turret.cupola.radius, 'geometry.turret.cupola.radius');
  finitePositive(turret.cupola.height, 'geometry.turret.cupola.height');
  if (!Array.isArray(turret.cupola.rings) || turret.cupola.rings.length < 3) {
    throw new TypeError('geometry.turret.cupola.rings requires at least three rings');
  }
  validateAscending(
    turret.cupola.rings.map(ring => ring.y),
    'cupola ring y'
  );
  if (!Array.isArray(turret.mantlet.outline) || turret.mantlet.outline.length < 3) {
    throw new TypeError('geometry.turret.mantlet.outline requires at least three points');
  }
  turret.mantlet.outline.forEach((point, index) => {
    finiteVector(point, 2, `geometry.turret.mantlet.outline[${index}]`);
  });
  finitePositive(turret.mantlet.depth, 'geometry.turret.mantlet.depth');

  for (const [label, weapon] of [
    ['mainGun', geometry.mainGun],
    ['coax', geometry.coax]
  ]) {
    dictionary(weapon, `geometry.${label}`);
    finiteVector(weapon.center, 3, `geometry.${label}.center`);
    finitePositive(weapon.barrelLength, `geometry.${label}.barrelLength`);
    finitePositive(weapon.radius, `geometry.${label}.radius`);
    if (!(weapon.muzzleLocalZ > weapon.center[2])) {
      throw new Error(`geometry.${label}.muzzleLocalZ must be forward of its root`);
    }
    if (Math.abs(
      (weapon.muzzleLocalZ - weapon.center[2]) - weapon.barrelLength
    ) > 1e-6) {
      throw new Error(`geometry.${label}.barrelLength diverges from root/muzzle datums`);
    }
  }

  for (const label of ['mudguard', 'suspensionSkirt']) {
    const plate = dictionary(geometry[label], `geometry.${label}`);
    finitePositive(plate.centerX, `geometry.${label}.centerX`);
    finitePositive(plate.depth, `geometry.${label}.depth`);
    if (!Array.isArray(plate.outline) || plate.outline.length < 3) {
      throw new TypeError(`geometry.${label}.outline requires at least three points`);
    }
    plate.outline.forEach((point, index) => {
      finiteVector(point, 2, `geometry.${label}.outline[${index}]`);
    });
  }

  const gear = dictionary(geometry.runningGear, 'geometry.runningGear');
  for (const key of [
    'trackCenterX',
    'trackWidth',
    'beltLength',
    'beltHeight',
    'centerY',
    'roadWheelRadius',
    'linkPitch'
  ]) {
    finitePositive(gear[key], `geometry.runningGear.${key}`);
  }
  if (!Number.isInteger(gear.roadWheelCount) || gear.roadWheelCount < 1) {
    throw new TypeError('geometry.runningGear.roadWheelCount must be positive integer');
  }
  if (gear.trackPath.roadWheels.length !== gear.roadWheelCount) {
    throw new Error('running-gear roadWheelCount does not match track support data');
  }

  const requiredBands = definition.validation?.requiredLodBands;
  if (
    !Array.isArray(requiredBands)
    || ['high', 'medium', 'core', 'proxy'].some(band => !requiredBands.includes(band))
  ) {
    throw new Error('definition must require high, medium, core, and proxy LOD bands');
  }
  return definition;
}

export function signedGeometryVolume(geometry) {
  const positions = geometry?.attributes?.position;
  const index = geometry?.index;
  if (!positions) return 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let volume = 0;
  const elementCount = index?.count ?? positions.count;
  for (let offset = 0; offset < elementCount; offset += 3) {
    a.fromBufferAttribute(positions, index ? index.getX(offset) : offset);
    b.fromBufferAttribute(
      positions,
      index ? index.getX(offset + 1) : offset + 1
    );
    c.fromBufferAttribute(
      positions,
      index ? index.getX(offset + 2) : offset + 2
    );
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  }
  return volume;
}

function reverseTriangleWinding(geometry) {
  if (!geometry.index) {
    geometry.setIndex(Array.from(
      { length: geometry.attributes.position.count },
      (_, index) => index
    ));
  }
  const index = geometry.index;
  for (let offset = 0; offset < index.count; offset += 3) {
    const second = index.getX(offset + 1);
    index.setX(offset + 1, index.getX(offset + 2));
    index.setX(offset + 2, second);
  }
  index.needsUpdate = true;
}

function finalizeClosedGeometry(geometry, name) {
  let volume = signedGeometryVolume(geometry);
  if (volume < 0) {
    reverseTriangleWinding(geometry);
    volume = signedGeometryVolume(geometry);
  }
  if (!(volume > 1e-8)) {
    throw new Error(`${name} is degenerate or has inconsistent closed winding`);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = name;
  geometry.userData.closed = true;
  geometry.userData.outwardWindingAudited = true;
  geometry.userData.signedVolume = volume;
  return geometry;
}

function createHullRing(station) {
  return [
    [-station.bottomHalfWidth, station.bottomY],
    [station.bottomHalfWidth, station.bottomY],
    [station.lowerHalfWidth, station.lowerY],
    [station.halfWidth, station.shoulderY],
    [station.upperHalfWidth, station.upperY],
    [station.deckHalfWidth, station.deckY],
    [-station.deckHalfWidth, station.deckY],
    [-station.upperHalfWidth, station.upperY],
    [-station.halfWidth, station.shoulderY],
    [-station.lowerHalfWidth, station.lowerY]
  ];
}

export function createSectionLoftGeometry(stations, name = 'SectionLoftGeometry') {
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new TypeError('section loft requires at least two stations');
  }
  const rings = stations.map(createHullRing);
  const ringSize = rings[0].length;
  if (rings.some(ring => ring.length !== ringSize)) {
    throw new Error('section loft rings must use equal vertex counts');
  }
  const positions = [];
  const indices = [];
  for (let stationIndex = 0; stationIndex < stations.length; stationIndex++) {
    const station = stations[stationIndex];
    for (const [x, y] of rings[stationIndex]) positions.push(x, y, station.z);
  }
  for (let stationIndex = 0; stationIndex < stations.length - 1; stationIndex++) {
    const current = stationIndex * ringSize;
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
    const end = (stations.length - 1) * ringSize;
    indices.push(end, end + edge, end + edge + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.userData.semanticStations = stations.map(station => ({
    z: station.z,
    sourcePixels: station.sourcePixels ?? null
  }));
  return finalizeClosedGeometry(geometry, name);
}

export function createEllipticRingLoftGeometry(
  rings,
  segments,
  name = 'EllipticRingLoftGeometry'
) {
  const positions = [];
  const indices = [];
  for (const ring of rings) {
    for (let segment = 0; segment < segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      const sine = Math.sin(angle);
      const halfLength = sine >= 0 ? ring.frontLength : ring.rearLength;
      positions.push(
        Math.cos(angle) * ring.halfWidth,
        ring.y,
        ring.centerZ + sine * halfLength
      );
    }
  }
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex++) {
    const lower = ringIndex * segments;
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
  const topRing = rings.at(-1);
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
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.userData.semanticRings = rings.map(ring => ({
    y: ring.y,
    sourcePixels: ring.sourcePixels ?? null
  }));
  return finalizeClosedGeometry(geometry, name);
}

function createShape(outline) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let index = 1; index < outline.length; index++) {
    shape.lineTo(outline[index][0], outline[index][1]);
  }
  shape.closePath();
  return shape;
}

function createFrontPlateGeometry(outline, depth, bevelMeters, name) {
  const geometry = new THREE.ExtrudeGeometry(createShape(outline), {
    depth,
    steps: 1,
    bevelEnabled: bevelMeters > 0,
    bevelSegments: bevelMeters > 0 ? 2 : 0,
    bevelSize: bevelMeters,
    bevelThickness: bevelMeters
  });
  return finalizeClosedGeometry(geometry, name);
}

function createSidePlateGeometry(outline, depth, name) {
  const geometry = new THREE.ExtrudeGeometry(createShape(outline), {
    depth,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 1
  });
  geometry.translate(0, 0, -depth * 0.5);
  geometry.rotateY(-Math.PI * 0.5);
  return finalizeClosedGeometry(geometry, name);
}

function tag(mesh, lodBand, name) {
  mesh.name = name;
  mesh.userData.lodBand = lodBand;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (lodBand === 'proxy') mesh.visible = false;
  return mesh;
}

function forwardCylinder({
  radius,
  length,
  material,
  name,
  lodBand,
  center
}) {
  const mesh = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.18, length, 12),
    material
  ), lodBand, name);
  mesh.rotation.x = Math.PI * 0.5;
  mesh.position.set(...center);
  return mesh;
}

export function createDefaultParametricVehicleMaterials() {
  return Object.freeze({
    paint: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#52613a',
      roughness: 0.78,
      metalness: 0.12
    }), 'paint'),
    secondaryPaint: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#465433',
      roughness: 0.8,
      metalness: 0.1
    }), 'paint'),
    track: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#2c3029',
      roughness: 0.9,
      metalness: 0.28
    }), 'track'),
    metal: setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: '#202420',
      roughness: 0.48,
      metalness: 0.76
    }), 'metal')
  });
}

function addBilateralSidePlate({
  root,
  data,
  geometryName,
  partName,
  material,
  lodBand
}) {
  for (const side of [-1, 1]) {
    const semanticSide = side < 0 ? 'Right' : 'Left';
    const mesh = tag(new THREE.Mesh(
      createSidePlateGeometry(data.outline, data.depth, geometryName),
      material
    ), lodBand, `${partName}_${semanticSide}`);
    mesh.position.x = side * data.centerX;
    mesh.userData.semanticSide = semanticSide.toLowerCase();
    mesh.userData.sourcePixels = data.sourcePixels;
    root.add(mesh);
  }
}

function addEngineGrille(root, data, materials, prefix) {
  const grille = tag(new THREE.Mesh(
    new THREE.BoxGeometry(...data.size),
    materials.metal
  ), 'high', `${prefix}_LeftEngineGrille`);
  grille.position.set(...data.center);
  grille.userData.semanticSide = data.side;
  root.add(grille);

  const spanZ = data.size[2] * 0.94;
  for (let index = 0; index < data.slatCount; index++) {
    const slat = tag(new THREE.Mesh(
      new THREE.BoxGeometry(0.018, data.size[1] * 0.88, 0.018),
      materials.secondaryPaint
    ), 'high', `${prefix}_EngineGrilleSlat_${index + 1}`);
    slat.position.set(
      data.center[0] + 0.026,
      data.center[1],
      data.center[2] + (
        (index / (data.slatCount - 1)) - 0.5
      ) * spanZ
    );
    root.add(slat);
  }
}

function addAntenna(root, data, material, prefix) {
  const antenna = tag(new THREE.Mesh(
    new THREE.CylinderGeometry(data.radius, data.radius, data.height, 6),
    material
  ), 'high', `${prefix}_LeftAntenna`);
  antenna.position.set(
    data.base[0],
    data.base[1] + data.height * 0.5,
    data.base[2]
  );
  antenna.userData.semanticSide = data.side;
  antenna.userData.envelopeRole = data.envelopeRole;
  root.add(antenna);
}

export function createParametricVehicleMesh(
  definition,
  { materials = createDefaultParametricVehicleMaterials() } = {}
) {
  validateParametricVehicleDefinition(definition);
  const geometry = definition.geometry;
  const prefix = definition.meshPrefix;
  const root = new THREE.Group();
  root.name = definition.modelId;

  const primaryHull = tag(new THREE.Mesh(
    createSectionLoftGeometry(
      geometry.hull.stations,
      `${definition.designation}PrimaryHullGeometry`
    ),
    materials.paint
  ), 'core', `${prefix}_PrimaryHull`);
  primaryHull.userData.parametricRole = 'hull-station-loft';
  primaryHull.userData.authoredHull = true;
  root.add(primaryHull);

  const proxyHullStations = geometry.hull.proxyStationIndices.map(
    index => geometry.hull.stations[index]
  );
  const proxyHull = tag(new THREE.Mesh(
    createSectionLoftGeometry(
      proxyHullStations,
      `${definition.designation}ProxyHullGeometry`
    ),
    materials.paint
  ), 'proxy', `${prefix}_ProxyHull`);
  proxyHull.userData.parametricRole = 'reduced-hull-station-loft';
  root.add(proxyHull);

  addBilateralSidePlate({
    root,
    data: geometry.mudguard,
    geometryName: `${prefix}SourceRegisteredMudguardGeometry`,
    partName: `${prefix}_Mudguard`,
    material: materials.secondaryPaint,
    lodBand: 'core'
  });
  addBilateralSidePlate({
    root,
    data: geometry.suspensionSkirt,
    geometryName: `${prefix}SourceRegisteredSuspensionSkirtGeometry`,
    partName: `${prefix}_SuspensionSkirt`,
    material: materials.secondaryPaint,
    lodBand: 'core'
  });
  addBilateralSidePlate({
    root,
    data: geometry.mudguard,
    geometryName: `${prefix}ProxyMudguardGeometry`,
    partName: `${prefix}_ProxyMudguard`,
    material: materials.secondaryPaint,
    lodBand: 'proxy'
  });
  addBilateralSidePlate({
    root,
    data: geometry.suspensionSkirt,
    geometryName: `${prefix}ProxySuspensionSkirtGeometry`,
    partName: `${prefix}_ProxySuspensionSkirt`,
    material: materials.secondaryPaint,
    lodBand: 'proxy'
  });

  const gear = geometry.runningGear;
  const runningGear = createTrackedRunningGear({
    id: `${prefix}_RunningGear`,
    trackMaterial: materials.track,
    wheelMaterial: materials.secondaryPaint,
    trackCenterX: gear.trackCenterX,
    trackWidth: gear.trackWidth,
    beltLength: gear.beltLength,
    beltHeight: gear.beltHeight,
    centerY: gear.centerY,
    roadWheelRadius: gear.roadWheelRadius,
    roadWheelCount: gear.roadWheelCount,
    roadWheelZStart: gear.trackPath.roadWheels[0].centerZ,
    roadWheelSpacing: 0.28,
    linkPitch: gear.linkPitch,
    trackPath: gear.trackPath
  });
  root.add(runningGear);

  const proxyGear = createTrackedRunningGearProxy({
    id: `${prefix}_ProxyRunningGear`,
    trackMaterial: materials.track,
    wheelMaterial: materials.secondaryPaint,
    trackCenterX: gear.trackCenterX,
    trackWidth: gear.trackWidth,
    beltLength: gear.beltLength,
    beltHeight: gear.beltHeight,
    centerY: gear.centerY,
    roadWheelRadius: gear.roadWheelRadius,
    roadWheelCount: gear.roadWheelCount,
    linkPitch: gear.linkPitch * 1.85,
    trackPath: gear.trackPath
  });
  root.add(proxyGear);

  const turretGroup = new THREE.Group();
  turretGroup.name = `${prefix}_TurretMount`;
  turretGroup.position.set(...geometry.turret.center);
  turretGroup.userData.articulated = true;
  root.add(turretGroup);

  const turret = tag(new THREE.Mesh(
    createEllipticRingLoftGeometry(
      geometry.turret.rings,
      geometry.turret.segments,
      `${definition.designation}TurretGeometry`
    ),
    materials.secondaryPaint
  ), 'core', `${prefix}_Turret`);
  turret.userData.parametricRole = 'turret-ring-loft';
  turretGroup.add(turret);

  const proxyTurretRings = geometry.turret.proxyRingIndices.map(
    index => geometry.turret.rings[index]
  );
  const proxyTurret = tag(new THREE.Mesh(
    createEllipticRingLoftGeometry(
      proxyTurretRings,
      10,
      `${definition.designation}ProxyTurretGeometry`
    ),
    materials.secondaryPaint
  ), 'proxy', `${prefix}_ProxyTurret`);
  proxyTurret.userData.parametricRole = 'reduced-turret-ring-loft';
  turretGroup.add(proxyTurret);

  const mantletData = geometry.turret.mantlet;
  const mantlet = tag(new THREE.Mesh(
    createFrontPlateGeometry(
      mantletData.outline,
      mantletData.depth,
      mantletData.bevelMeters,
      `${definition.designation}MantletGeometry`
    ),
    materials.secondaryPaint
  ), 'core', `${prefix}_Mantlet`);
  mantlet.position.z = mantletData.frontZ - mantletData.depth;
  mantlet.userData.parametricRole = mantletData.kind;
  turretGroup.add(mantlet);
  const proxyMantlet = tag(new THREE.Mesh(
    createFrontPlateGeometry(
      mantletData.outline,
      mantletData.depth,
      0,
      `${definition.designation}ProxyMantletGeometry`
    ),
    materials.secondaryPaint
  ), 'proxy', `${prefix}_ProxyMantlet`);
  proxyMantlet.position.z = mantlet.position.z;
  proxyMantlet.userData.parametricRole = mantletData.kind;
  turretGroup.add(proxyMantlet);

  const cupolaData = geometry.turret.cupola;
  const cupola = tag(new THREE.Mesh(
    createEllipticRingLoftGeometry(
      cupolaData.rings,
      14,
      `${definition.designation}CupolaGeometry`
    ),
    materials.secondaryPaint
  ), 'core', `${prefix}_Cupola`);
  cupola.position.set(...cupolaData.center);
  turretGroup.add(cupola);
  const proxyCupola = tag(new THREE.Mesh(
    createEllipticRingLoftGeometry(
      [
        cupolaData.rings[0],
        cupolaData.rings[2],
        cupolaData.rings[3]
      ],
      8,
      `${definition.designation}ProxyCupolaGeometry`
    ),
    materials.secondaryPaint
  ), 'proxy', `${prefix}_ProxyCupola`);
  proxyCupola.position.copy(cupola.position);
  turretGroup.add(proxyCupola);

  const mainGun = geometry.mainGun;
  const mainBarrel = forwardCylinder({
    radius: mainGun.radius,
    length: mainGun.barrelLength,
    material: materials.metal,
    name: `${prefix}_MainGun`,
    lodBand: 'core',
    center: [
      mainGun.center[0],
      mainGun.center[1],
      (mainGun.center[2] + mainGun.muzzleLocalZ) * 0.5
    ]
  });
  mainBarrel.userData.mountSide = mainGun.mountSide;
  mainBarrel.userData.weaponMountId = 'main';
  mainBarrel.userData.envelopeRole = 'weaponProjection';
  turretGroup.add(mainBarrel);
  const proxyBarrel = forwardCylinder({
    radius: mainGun.radius * 1.08,
    length: mainGun.barrelLength,
    material: materials.metal,
    name: `${prefix}_ProxyMainGun`,
    lodBand: 'proxy',
    center: [
      mainGun.center[0],
      mainGun.center[1],
      (mainGun.center[2] + mainGun.muzzleLocalZ) * 0.5
    ]
  });
  proxyBarrel.userData.mountSide = mainGun.mountSide;
  proxyBarrel.userData.envelopeRole = 'weaponProjection';
  turretGroup.add(proxyBarrel);

  const muzzle = new THREE.Object3D();
  muzzle.name = `${prefix}_MainMuzzle`;
  muzzle.position.set(
    mainGun.center[0],
    mainGun.center[1],
    mainGun.muzzleLocalZ
  );
  muzzle.userData.markerRole = 'muzzle';
  muzzle.userData.weaponMountId = 'main';
  muzzle.userData.forwardAxis = '+Z';
  muzzle.userData.mountSide = mainGun.mountSide;
  turretGroup.add(muzzle);

  const coaxData = geometry.coax;
  const coax = forwardCylinder({
    radius: coaxData.radius,
    length: coaxData.barrelLength,
    material: materials.metal,
    name: `${prefix}_CoaxGun`,
    lodBand: 'high',
    center: [
      coaxData.center[0],
      coaxData.center[1],
      (coaxData.center[2] + coaxData.muzzleLocalZ) * 0.5
    ]
  });
  coax.userData.mountSide = coaxData.mountSide;
  coax.userData.weaponMountId = 'coax';
  coax.userData.envelopeRole = 'weaponProjection';
  turretGroup.add(coax);

  const coaxMuzzle = new THREE.Object3D();
  coaxMuzzle.name = `${prefix}_CoaxMuzzle`;
  coaxMuzzle.position.set(
    coaxData.center[0],
    coaxData.center[1],
    coaxData.muzzleLocalZ
  );
  coaxMuzzle.userData.markerRole = 'muzzle';
  coaxMuzzle.userData.weaponMountId = 'coax';
  coaxMuzzle.userData.forwardAxis = '+Z';
  coaxMuzzle.userData.mountSide = coaxData.mountSide;
  coaxMuzzle.userData.placementQuality =
    'blueprint-registered provisional authoring datum';
  turretGroup.add(coaxMuzzle);

  const visorData = geometry.details.driverVisor;
  const visor = tag(new THREE.Mesh(
    new THREE.BoxGeometry(...visorData.size),
    materials.metal
  ), 'high', `${prefix}_DriverVisor`);
  visor.position.set(...visorData.center);
  visor.rotation.x = visorData.rotationX;
  visor.userData.semanticSide = visorData.side;
  root.add(visor);

  addEngineGrille(root, geometry.details.engineGrille, materials, prefix);
  addAntenna(root, geometry.details.antenna, materials.metal, prefix);

  root.userData.modelMetadata = {
    type: definition.type,
    modelId: definition.modelId,
    designation: definition.designation,
    dimensionsMeters: { ...definition.dimensionsMeters },
    coordinateFrame: definition.coordinateFrame,
    representedConfiguration: definition.representedConfiguration,
    blueprintCalibration: definition.blueprint,
    blueprintSourceIds: definition.blueprint.sourceRecords.map(source => source.id),
    authoringStatus: definition.validation.acceptanceStatus
  };
  root.userData.authoredHull = true;
  root.userData.parametricDefinition = definition;
  root.userData.runningGear = runningGear;
  root.userData.proxyRunningGear = proxyGear;
  root.userData.turret = turretGroup;
  root.userData.barrel = mainBarrel;
  root.userData.muzzle = muzzle;
  root.userData.coax = coax;
  root.userData.coaxMuzzle = coaxMuzzle;
  root.userData.weaponMuzzles = { coax: coaxMuzzle };
  return root;
}
