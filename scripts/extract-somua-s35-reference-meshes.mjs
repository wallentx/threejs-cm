import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const inputPath = path.resolve(
  repositoryRoot,
  process.argv[2] ?? 'reference/s35/french_somua_s35.glb'
);
const outputPath = path.resolve(
  repositoryRoot,
  process.argv[3]
    ?? 'src/content/france1940/vehicleData/SomuaS35ReferenceMeshData.js'
);
const SELECTED_ARMOR_MESHES = Object.freeze({
  turretShell: 'pCylinder95_Turret_blinn_0',
  turretSideDoor: 'pPlane28_Turret_blinn_0',
  rightPortOuter: 'polySurface304_Turret_blinn_0',
  rightPortInset: 'polySurface304_Track_blinn1_0',
  rightPortGlass: 'polySurface304_Mirror_blinn5_0',
  leftPortOuter: 'polySurface305_Turret_blinn_0',
  leftPortInset: 'polySurface305_Track_blinn1_0',
  leftPortGlass: 'polySurface305_Mirror_blinn5_0'
});
const INTERIOR_MATERIAL = 'Interior_blinn3';
const GUN_SOURCE_NODE = 'polySurface300_Turret_blinn_0';
const ENGINE_DECK_SOURCE_NODE = 'polySurface291_Upper_blinn3_0';
const CUPOLA_SOURCE_NODE = 'pCylinder98_Turret_blinn_0';
const CUPOLA_ROOF_SOURCE_NODE = 'pCylinder99_Turret_blinn_0';
const GUN_MANTLET_SPLIT_SOURCE_Z = 1.25;
const TURRET_APERTURE_ARTICULATION = Object.freeze({
  pPlane28_Turret_blinn_0: 'sideDoor',
  polySurface304_Turret_blinn_0: 'rightPortOuter',
  polySurface304_Track_blinn1_0: 'rightPortInset',
  polySurface304_Mirror_blinn5_0: 'rightPortGlass',
  polySurface305_Turret_blinn_0: 'leftPortOuter',
  polySurface305_Track_blinn1_0: 'leftPortInset',
  polySurface305_Mirror_blinn5_0: 'leftPortGlass'
});
const FLEXIBLE_REAR_CHAIN_NODE = 'polySurface168_Track_blinn1_0';
const AERIAL_SOURCE_NODE = 'pCylinder93_Upper_blinn3_0';
const MIXED_TOOLSET_SOURCE_NODE = 'polySurface310_Toolset_blinn5_0';
const EXHAUST_SOURCE_PART = `${MIXED_TOOLSET_SOURCE_NODE}#twin-exhaust`;
const TURRET_VISION_APERTURE_COVERS = Object.freeze([
  Object.freeze({
    id: 'derived_right_vision_aperture_cover',
    apertureNode: 'polySurface304_Mirror_blinn5_0',
    insetNode: 'polySurface304_Track_blinn1_0',
    outerNode: 'polySurface304_Turret_blinn_0'
  }),
  Object.freeze({
    id: 'derived_left_vision_aperture_cover',
    apertureNode: 'polySurface305_Mirror_blinn5_0',
    insetNode: 'polySurface305_Track_blinn1_0',
    outerNode: 'polySurface305_Turret_blinn_0'
  })
]);
const PRESENTATION_EXCLUDED_SOURCE_NODES = new Set([
  FLEXIBLE_REAR_CHAIN_NODE,
  'polySurface286_Bag_blinn_0',
  'polySurface303_Track_blinn1_0',
  'polySurface310_Toolset_blinn5_0',
  'polySurface310_lambert2_0',
  'polySurface180_Net_Parts_blinn_0',
  'polySurface195_Net_Parts_blinn_0',
  'polySurface304_Turret_blinn_0',
  'polySurface304_Track_blinn1_0',
  'polySurface304_Mirror_blinn5_0',
  'polySurface305_Turret_blinn_0',
  'polySurface305_Track_blinn1_0',
  'polySurface305_Mirror_blinn5_0'
]);
const CAPPED_SHELL_SOURCE_NODES = new Set([
  'pCylinder95_Turret_blinn_0',
  'pCylinder96_Turret_blinn_0',
  'pCylinder98_Turret_blinn_0',
  'pCylinder11_Wheel_blinn2_0_1',
  'pPlane11_Chassis_blinn9_0',
  'polySurface211_Door_blinn4_0',
  'polySurface162_Chassis_blinn9_0',
  'polySurface182_Chassis_blinn9_0',
  'polySurface312_Chassis_blinn9_0',
  'polySurface307_Upper_blinn3_0',
  'polySurface303_Turret_blinn_0'
]);
const SOLIDIFIED_OPEN_SOURCE_NODES = new Set([
  'pPlane28_Turret_blinn_0',
  'polySurface162_Chassis_blinn9_0',
  'polySurface312_Chassis_blinn9_0',
  'polySurface307_Upper_blinn3_0',
  'pCylinder24_Wheel_blinn2_0',
  'pCylinder27_Wheel_blinn2_0',
  'pCylinder11_Wheel_blinn2_0',
  'pCylinder11_Wheel_blinn2_0_1',
  'pCylinder9_Wheel_blinn2_0',
  'pCylinder9_Wheel_blinn2_0_1',
  'pCylinder12_Wheel_blinn2_0_1',
  'polySurface233_Wheel_blinn2_0',
  'polySurface234_Wheel_blinn2_0',
  'polySurface312_Wheel_blinn2_0',
  'polySurface134_Wheel_blinn2_0',
  'polySurface152_Wheel_blinn2_0',
  'polySurface112_Wheel_blinn2_0',
  'polySurface112_Wheel_blinn2_0_1',
  'pCylinder95_Turret_blinn_0',
  'pCylinder96_Turret_blinn_0',
  'polySurface300_Turret_blinn_0',
  'polySurface195_blinn4_0',
  'polySurface310_Toolset_blinn5_0',
  'polySurface109_Wheel_blinn2_0',
  'polySurface109_Wheel_blinn2_0_1',
  'polySurface309_Door_blinn4_0',
  'polySurface186_blinn4_0',
  'polySurface187_blinn4_0',
  'polySurface192_blinn4_0',
  'polySurface195_Net_Parts_blinn_0',
  'polySurface291_Upper_blinn3_0',
  'polySurface189_Mirror_blinn5_0',
  'polySurface195_Mirror_blinn5_0',
  'polySurface195_LightWhite_blinn6_0',
  'pCylinder99_Turret_blinn_0',
  'pCylinder5_Wheel_blinn2_0_1',
  'pCylinder10_Wheel_blinn2_0',
  'pCylinder10_Wheel_blinn2_0_1',
  'pCylinder13_Wheel_blinn2_0_1',
  'pCylinder6_Wheel_blinn2_0',
  'pCylinder6_Wheel_blinn2_0_1',
  'pCylinder7_Wheel_blinn2_0',
  'pCylinder7_Wheel_blinn2_0_1',
  'pCylinder8_Wheel_blinn2_0',
  'pCylinder8_Wheel_blinn2_0_1',
  'pCylinder12_Wheel_blinn2_0',
  'pCylinder5_Wheel_blinn2_0',
  'pCylinder13_Wheel_blinn2_0',
  'polySurface129_Wheel_blinn2_0',
  'polySurface151_Wheel_blinn2_0'
]);
const POST_REDUCTION_SOLIDIFIED_SOURCE_NODES = new Set([
  'pCylinder9_Wheel_blinn2_0',
  'pCylinder9_Wheel_blinn2_0_1',
  'pCylinder11_Wheel_blinn2_0',
  'pCylinder12_Wheel_blinn2_0_1',
  'polySurface134_Wheel_blinn2_0',
  'polySurface152_Wheel_blinn2_0',
  'polySurface233_Wheel_blinn2_0',
  'polySurface234_Wheel_blinn2_0',
  'polySurface312_Wheel_blinn2_0',
  'polySurface189_Mirror_blinn5_0',
  'polySurface195_Mirror_blinn5_0',
  'polySurface195_LightWhite_blinn6_0'
]);
const OPEN_SURFACE_THICKNESS_SOURCE_UNITS = 0.015;
const NON_MANIFOLD_SEAM_INSET_SOURCE_UNITS = 0.000025;
const TARGET_ENVELOPE = Object.freeze({ length: 5.38, width: 2.12, height: 2.62 });
const TARGET_TURRET_PIVOT = Object.freeze([0, 1.55, 0.55]);
const VEHICLE_INTERIOR_POINT = new THREE.Vector3(0, 1.15, -0.42);
const modifier = new SimplifyModifier();

const bytes = fs.readFileSync(inputPath);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(buffer, '', resolve, reject);
});
gltf.scene.updateMatrixWorld(true);

function round(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function materialName(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials[0]?.name ?? 'unassigned';
}

function sourceNodeName(mesh) {
  return mesh.userData.sourceNodeName ?? mesh.name;
}

function triangleCount(geometry) {
  return (geometry.index?.count ?? geometry.attributes.position.count) / 3;
}

function extractConnectedComponents(mesh, keepComponent, sourcePartName) {
  const sourcePosition = mesh.geometry.attributes.position;
  const sourceNormal = mesh.geometry.attributes.normal;
  const sourceIndex = mesh.geometry.index;
  const triangleTotal = triangleCount(mesh.geometry);
  const parents = Array.from({ length: triangleTotal }, (_, index) => index);
  const find = index => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const join = (first, second) => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parents[secondRoot] = firstRoot;
  };
  const triangleIndices = [];
  const triangleWorldPoints = [];
  const firstTriangleByPoint = new Map();
  const point = new THREE.Vector3();
  for (let triangle = 0; triangle < triangleTotal; triangle += 1) {
    const indices = [0, 1, 2].map(corner => (
      sourceIndex?.getX(triangle * 3 + corner) ?? triangle * 3 + corner
    ));
    const points = indices.map(index => (
      point.fromBufferAttribute(sourcePosition, index).applyMatrix4(mesh.matrixWorld).clone()
    ));
    triangleIndices.push(indices);
    triangleWorldPoints.push(points);
    for (const worldPoint of points) {
      const key = worldPoint.toArray().map(value => value.toFixed(6)).join(',');
      const prior = firstTriangleByPoint.get(key);
      if (prior === undefined) firstTriangleByPoint.set(key, triangle);
      else join(triangle, prior);
    }
  }
  const components = new Map();
  for (let triangle = 0; triangle < triangleTotal; triangle += 1) {
    const root = find(triangle);
    let component = components.get(root);
    if (!component) {
      component = { triangles: [], bounds: new THREE.Box3() };
      components.set(root, component);
    }
    component.triangles.push(triangle);
    for (const worldPoint of triangleWorldPoints[triangle]) {
      component.bounds.expandByPoint(worldPoint);
    }
  }
  const selected = [...components.values()].filter((component, index) => (
    keepComponent(component, index)
  ));
  if (selected.length === 0) {
    throw new Error(`No source components selected from ${mesh.name}`);
  }
  const positionValues = [];
  const normalValues = [];
  for (const component of selected) {
    for (const triangle of component.triangles) {
      for (const index of triangleIndices[triangle]) {
        positionValues.push(
          sourcePosition.getX(index),
          sourcePosition.getY(index),
          sourcePosition.getZ(index)
        );
        normalValues.push(
          sourceNormal.getX(index),
          sourceNormal.getY(index),
          sourceNormal.getZ(index)
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionValues, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalValues, 3));
  const part = new THREE.Mesh(geometry, mesh.material);
  part.name = sourcePartName;
  part.matrixAutoUpdate = false;
  part.matrix.copy(mesh.matrixWorld);
  part.matrixWorld.copy(mesh.matrixWorld);
  part.userData = {
    sourceNodeName: sourcePartName,
    sourceRegion: 'static',
    sourceArticulation: 'exhaust',
    sourceComponentSelection:
      `${selected.length} connected components retained from ${mesh.name}`
  };
  return part;
}

function selectTwinExhaust(mesh) {
  return extractConnectedComponents(
    mesh,
    component => {
      const size = component.bounds.getSize(new THREE.Vector3());
      const center = component.bounds.getCenter(new THREE.Vector3());
      return size.z > 1.0
        && component.bounds.min.z < -2.5
        && component.bounds.max.z < -1.2
        && Math.abs(center.x) < 0.1;
    },
    EXHAUST_SOURCE_PART
  );
}

function createTurretVisionAperturePresentation(definition) {
  const aperture = gltf.scene.getObjectByName(definition.apertureNode);
  const inset = gltf.scene.getObjectByName(definition.insetNode);
  const outer = gltf.scene.getObjectByName(definition.outerNode);
  if (!aperture?.isMesh || !inset?.isMesh || !outer?.isMesh) {
    throw new Error(`S35 vision aperture source is missing: ${definition.id}`);
  }
  const aperturePosition = aperture.geometry.attributes.position;
  const apertureIndex = aperture.geometry.index;
  const aperturePoints = [];
  for (let index = 0; index < aperturePosition.count; index += 1) {
    aperturePoints.push(
      new THREE.Vector3()
        .fromBufferAttribute(aperturePosition, index)
        .applyMatrix4(aperture.matrixWorld)
    );
  }
  const corner = offset => apertureIndex?.getX(offset) ?? offset;
  const normal = new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(
      aperturePoints[corner(1)],
      aperturePoints[corner(0)]
    ),
    new THREE.Vector3().subVectors(
      aperturePoints[corner(2)],
      aperturePoints[corner(0)]
    )
  ).normalize();
  const apertureCenter = aperturePoints.reduce(
    (sum, point) => sum.add(point),
    new THREE.Vector3()
  ).multiplyScalar(1 / aperturePoints.length);
  if (normal.dot(new THREE.Vector3().subVectors(
    apertureCenter,
    VEHICLE_INTERIOR_POINT
  )) < 0) normal.negate();
  const vertical = new THREE.Vector3(0, 1, 0)
    .addScaledVector(normal, -normal.y)
    .normalize();
  const horizontal = new THREE.Vector3().crossVectors(normal, vertical).normalize();
  const horizontalValues = aperturePoints.map(point => point.dot(horizontal));
  const verticalValues = aperturePoints.map(point => point.dot(vertical));
  const horizontalMin = Math.min(...horizontalValues);
  const horizontalMax = Math.max(...horizontalValues);
  const verticalMin = Math.min(...verticalValues);
  const verticalMax = Math.max(...verticalValues);
  const outerPosition = outer.geometry.attributes.position;
  let exteriorPlane = -Infinity;
  const outerPoint = new THREE.Vector3();
  for (let index = 0; index < outerPosition.count; index += 1) {
    outerPoint.fromBufferAttribute(outerPosition, index).applyMatrix4(outer.matrixWorld);
    exteriorPlane = Math.max(exteriorPlane, outerPoint.dot(normal));
  }
  const margin = 0.012;
  const geometry = new THREE.BoxGeometry(
    OPEN_SURFACE_THICKNESS_SOURCE_UNITS,
    verticalMax - verticalMin + margin * 2,
    horizontalMax - horizontalMin + margin * 2
  );
  geometry.applyMatrix4(new THREE.Matrix4().makeBasis(normal, vertical, horizontal));
  const center = new THREE.Vector3()
    // The authoritative turret shell now caps this boundary at the exterior.
    // Retain the source-bounds closure as a secondary backing plate one source
    // thickness inward, where it cannot z-fight or read as a floating slot.
    .addScaledVector(normal, exteriorPlane - OPEN_SURFACE_THICKNESS_SOURCE_UNITS * 1.5)
    .addScaledVector(vertical, (verticalMin + verticalMax) * 0.5)
    .addScaledVector(horizontal, (horizontalMin + horizontalMax) * 0.5);
  geometry.translate(center.x, center.y, center.z);
  const cover = new THREE.Mesh(geometry, outer.material);
  cover.name = definition.id;
  cover.matrixAutoUpdate = false;
  cover.matrix.identity();
  cover.matrixWorld.identity();
  cover.userData = {
    sourceNodeName: definition.id,
    sourceRegion: 'turret',
    sourceArticulation: 'body',
    presentationDerivation:
      `inset painted backup closure from ${definition.apertureNode} bounds behind ${definition.outerNode}`
  };

  const indicatorGeometry = new THREE.BoxGeometry(
    OPEN_SURFACE_THICKNESS_SOURCE_UNITS * 0.12,
    verticalMax - verticalMin,
    horizontalMax - horizontalMin
  );
  indicatorGeometry.applyMatrix4(
    new THREE.Matrix4().makeBasis(normal, vertical, horizontal)
  );
  const indicatorCenter = new THREE.Vector3()
    .addScaledVector(
      normal,
      exteriorPlane + OPEN_SURFACE_THICKNESS_SOURCE_UNITS * 0.06
    )
    .addScaledVector(vertical, (verticalMin + verticalMax) * 0.5)
    .addScaledVector(horizontal, (horizontalMin + horizontalMax) * 0.5);
  indicatorGeometry.translate(
    indicatorCenter.x,
    indicatorCenter.y,
    indicatorCenter.z
  );
  const indicator = new THREE.Mesh(indicatorGeometry, inset.material);
  indicator.name = `${definition.id}_indicator`;
  indicator.matrixAutoUpdate = false;
  indicator.matrix.identity();
  indicator.matrixWorld.identity();
  indicator.userData = {
    sourceNodeName: indicator.name,
    sourceRegion: 'turret',
    sourceArticulation: definition.id.includes('right')
      ? 'rightPortIndicator'
      : 'leftPortIndicator',
    presentationDerivation:
      `shallow sealed vision-slot indicator from ${definition.apertureNode} bounds and ${definition.insetNode} finish`
  };
  return [cover, indicator];
}

function sourceRegion(mesh) {
  if (mesh.userData.sourceRegion) return mesh.userData.sourceRegion;
  for (let current = mesh; current; current = current.parent) {
    if (current.name === 'Turret_GP') return 'turret';
    if (current.name === 'Upper_GP' || current.name === 'Chassis_GP') return 'static';
  }
  throw new Error(`S35 exterior mesh is outside the known source groups: ${mesh.name}`);
}

function materialSlot(name) {
  if (name === 'Wheel_blinn2') return 'wheel';
  if (name === 'Track_blinn1') return 'track';
  if (name === 'Bag_blinn') return 'canvas';
  if (name === 'lambert2') return 'wood';
  if (name === 'Mirror_blinn5') return 'glass';
  if (name === 'LightWhite_blinn6') return 'light-white';
  if (name === 'LightRed__blinn7') return 'light-red';
  if (name === 'Net_Parts_blinn') return 'net';
  if (name === 'Toolset_blinn5') return 'metal';
  if (name === 'blinn4') return 'paint';
  return 'paint';
}

function lodBand(mesh, region, material) {
  if (mesh.name === GUN_SOURCE_NODE) return 'core';
  if (sourceArticulation(mesh) === 'exhaust') return 'core';
  if (sourceArticulation(mesh) === 'bodyDetail') return 'high';
  if (/PortIndicator$/.test(sourceArticulation(mesh))) return 'medium';
  if (mesh.name === FLEXIBLE_REAR_CHAIN_NODE || mesh.name === AERIAL_SOURCE_NODE) {
    return 'high';
  }
  if (region === 'turret') {
    if (material === 'Mirror_blinn5') return 'high';
    if (material === 'Track_blinn1') return 'medium';
    return 'core';
  }
  if (
    material === 'Chassis_blinn9'
    || material === 'Upper_blinn3'
    || material === 'Wheel_blinn2'
    || material === 'Track_blinn1'
  ) return 'core';
  if (material === 'blinn4') return 'core';
  // Door/closure surfaces fill openings in the core hull shell. Keep a
  // aggressively reduced closure at core/proxy instead of dropping the faces.
  if (material === 'Door_blinn4') return 'core';
  return 'high';
}

function targetVertexRatio(mesh, band, slot) {
  const triangles = triangleCount(mesh.geometry);
  if (triangles <= 24) return 1;
  if (CAPPED_SHELL_SOURCE_NODES.has(sourceNodeName(mesh))) {
    return band === 'proxy' ? 0.60 : 1;
  }
  if (materialName(mesh) === 'blinn4') return band === 'proxy' ? 0.18 : 0.26;
  if (band === 'proxy') {
    if (materialName(mesh) === 'Door_blinn4') return 0.18;
    if (mesh.name === GUN_SOURCE_NODE) return 0.22;
    if (slot === 'track') return 0.035;
    if (slot === 'wheel') return 0.055;
    if (slot === 'paint') return 0.60;
    return 0.18;
  }
  if (materialName(mesh) === 'Door_blinn4') return 0.30;
  if (sourceArticulation(mesh) === 'gun') return 0.52;
  if (slot === 'track') return mesh.name === FLEXIBLE_REAR_CHAIN_NODE ? 0.08 : 0.12;
  if (slot === 'wheel') return 0.17;
  if (slot === 'paint') return band === 'core' ? 1 : 0.30;
  if (slot === 'glass' || slot.startsWith('light-') || slot === 'net') return 1;
  return band === 'high' ? 0.15 : 0.26;
}

function orientTrianglesToSourceNormals(geometry) {
  const position = geometry.attributes.position;
  const sourceNormal = geometry.attributes.normal;
  if (!sourceNormal) {
    throw new Error('S35 extraction requires transformed GLB vertex normals');
  }
  const indexAttribute = geometry.index;
  const indices = indexAttribute
    ? Array.from({ length: indexAttribute.count }, (_, index) => indexAttribute.getX(index))
    : Array.from({ length: position.count }, (_, index) => index);
  const pointA = new THREE.Vector3();
  const pointB = new THREE.Vector3();
  const pointC = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const normalA = new THREE.Vector3();
  const normalB = new THREE.Vector3();
  const normalC = new THREE.Vector3();
  const expectedNormal = new THREE.Vector3();
  let normalMismatchFlipCount = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const ia = indices[offset];
    const ib = indices[offset + 1];
    const ic = indices[offset + 2];
    pointA.fromBufferAttribute(position, ia);
    pointB.fromBufferAttribute(position, ib);
    pointC.fromBufferAttribute(position, ic);
    faceNormal.crossVectors(
      edgeA.subVectors(pointB, pointA),
      edgeB.subVectors(pointC, pointA)
    );
    normalA.fromBufferAttribute(sourceNormal, ia);
    normalB.fromBufferAttribute(sourceNormal, ib);
    normalC.fromBufferAttribute(sourceNormal, ic);
    expectedNormal.copy(normalA).add(normalB).add(normalC);
    if (expectedNormal.lengthSq() < 1e-12 || faceNormal.dot(expectedNormal) >= 0) continue;
    [indices[offset + 1], indices[offset + 2]] = [
      indices[offset + 2],
      indices[offset + 1]
    ];
    normalMismatchFlipCount += 1;
  }
  geometry.setIndex(indices);
  geometry.userData.windingRepair = {
    componentCount: 0,
    consistencyFlipCount: normalMismatchFlipCount,
    outwardComponentFlipCount: 0,
    authority: 'transformed GLB vertex normals'
  };
  return geometry;
}

function orientGeometryOutward(geometry) {
  const position = geometry.attributes.position;
  const indexAttribute = geometry.index;
  const indices = indexAttribute
    ? Array.from({ length: indexAttribute.count }, (_, index) => indexAttribute.getX(index))
    : Array.from({ length: position.count }, (_, index) => index);
  const triangleCountValue = indices.length / 3;
  const edges = new Map();
  const adjacency = Array.from({ length: triangleCountValue }, () => []);
  for (let triangle = 0; triangle < triangleCountValue; triangle += 1) {
    const offset = triangle * 3;
    for (let edge = 0; edge < 3; edge += 1) {
      const start = indices[offset + edge];
      const end = indices[offset + (edge + 1) % 3];
      const key = start < end ? `${start},${end}` : `${end},${start}`;
      const records = edges.get(key) ?? [];
      records.push({ triangle, direction: start < end ? 1 : -1 });
      edges.set(key, records);
    }
  }
  for (const records of edges.values()) {
    if (records.length !== 2) continue;
    const [first, second] = records;
    const opposite = first.direction !== second.direction;
    adjacency[first.triangle].push({ triangle: second.triangle, opposite });
    adjacency[second.triangle].push({ triangle: first.triangle, opposite });
  }

  const flips = new Array(triangleCountValue);
  const components = [];
  for (let seed = 0; seed < triangleCountValue; seed += 1) {
    if (flips[seed] !== undefined) continue;
    flips[seed] = false;
    const queue = [seed];
    const triangles = [];
    while (queue.length > 0) {
      const triangle = queue.pop();
      triangles.push(triangle);
      for (const neighbor of adjacency[triangle]) {
        const requiredFlip = neighbor.opposite ? flips[triangle] : !flips[triangle];
        if (flips[neighbor.triangle] === undefined) {
          flips[neighbor.triangle] = requiredFlip;
          queue.push(neighbor.triangle);
        }
      }
    }
    components.push(triangles);
  }

  let consistencyFlipCount = 0;
  for (let triangle = 0; triangle < triangleCountValue; triangle += 1) {
    if (!flips[triangle]) continue;
    const offset = triangle * 3;
    [indices[offset + 1], indices[offset + 2]] = [
      indices[offset + 2],
      indices[offset + 1]
    ];
    consistencyFlipCount += 1;
  }

  const pointA = new THREE.Vector3();
  const pointB = new THREE.Vector3();
  const pointC = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const outward = new THREE.Vector3();
  let outwardComponentFlipCount = 0;
  for (const triangles of components) {
    const componentEdges = new Map();
    let signedVolume = 0;
    let vehicleScore = 0;
    for (const triangle of triangles) {
      const offset = triangle * 3;
      pointA.fromBufferAttribute(position, indices[offset]);
      pointB.fromBufferAttribute(position, indices[offset + 1]);
      pointC.fromBufferAttribute(position, indices[offset + 2]);
      normal.crossVectors(
        edgeA.subVectors(pointB, pointA),
        edgeB.subVectors(pointC, pointA)
      );
      centroid.copy(pointA).add(pointB).add(pointC).multiplyScalar(1 / 3);
      signedVolume += pointA.dot(pointB.clone().cross(pointC)) / 6;
      vehicleScore += normal.dot(
        outward.subVectors(centroid, VEHICLE_INTERIOR_POINT)
      );
      for (let edge = 0; edge < 3; edge += 1) {
        const start = indices[offset + edge];
        const end = indices[offset + (edge + 1) % 3];
        const key = start < end ? `${start},${end}` : `${end},${start}`;
        componentEdges.set(key, (componentEdges.get(key) ?? 0) + 1);
      }
    }
    const closed = [...componentEdges.values()].every(count => count === 2);
    if ((closed ? signedVolume : vehicleScore) >= 0) continue;
    for (const triangle of triangles) {
      const offset = triangle * 3;
      [indices[offset + 1], indices[offset + 2]] = [
        indices[offset + 2],
        indices[offset + 1]
      ];
    }
    outwardComponentFlipCount += 1;
  }
  geometry.setIndex(indices);
  geometry.userData.windingRepair = {
    componentCount: components.length,
    consistencyFlipCount,
    outwardComponentFlipCount,
    openComponentAuthority: 'vehicle-interior outward score'
  };
  return geometry;
}

function splitExcessNonManifoldTriangles(geometry) {
  const position = geometry.attributes.position;
  const indexAttribute = geometry.index;
  const indices = indexAttribute
    ? Array.from({ length: indexAttribute.count }, (_, index) => indexAttribute.getX(index))
    : Array.from({ length: position.count }, (_, index) => index);
  const edges = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    for (let edge = 0; edge < 3; edge += 1) {
      const start = indices[offset + edge];
      const end = indices[offset + (edge + 1) % 3];
      const key = start < end ? `${start},${end}` : `${end},${start}`;
      const records = edges.get(key) ?? [];
      records.push(offset);
      edges.set(key, records);
    }
  }
  const positions = Array.from(position.array);
  const duplicateByTriangleAndVertex = new Map();
  let splitTriangleCount = 0;
  for (const records of edges.values()) {
    if (records.length <= 2) continue;
    for (const triangleOffset of records.slice(2)) {
      const triangleVertices = [0, 1, 2].map(corner => indices[triangleOffset + corner]);
      const pointA = new THREE.Vector3().fromBufferAttribute(position, triangleVertices[0]);
      const pointB = new THREE.Vector3().fromBufferAttribute(position, triangleVertices[1]);
      const pointC = new THREE.Vector3().fromBufferAttribute(position, triangleVertices[2]);
      const inset = new THREE.Vector3()
        .subVectors(pointB, pointA)
        .cross(new THREE.Vector3().subVectors(pointC, pointA))
        .normalize()
        .multiplyScalar(-NON_MANIFOLD_SEAM_INSET_SOURCE_UNITS);
      for (let corner = 0; corner < 3; corner += 1) {
        const indexOffset = triangleOffset + corner;
        const sourceVertex = indices[indexOffset];
        const key = `${triangleOffset}:${sourceVertex}`;
        let duplicate = duplicateByTriangleAndVertex.get(key);
        if (duplicate === undefined) {
          duplicate = positions.length / 3;
          positions.push(
            position.getX(sourceVertex) + inset.x,
            position.getY(sourceVertex) + inset.y,
            position.getZ(sourceVertex) + inset.z
          );
          duplicateByTriangleAndVertex.set(key, duplicate);
        }
        indices[indexOffset] = duplicate;
      }
      splitTriangleCount += 1;
    }
  }
  if (splitTriangleCount === 0) return geometry;
  const split = new THREE.BufferGeometry();
  split.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  split.setIndex(indices);
  split.userData.nonManifoldSplit = {
    splitTriangleCount,
    quality:
      `extra faces sharing an already manifold edge receive private vertices and a ${NON_MANIFOLD_SEAM_INSET_SOURCE_UNITS} source-unit inward renderer inset before solidification; source triangles remain unchanged`
  };
  geometry.dispose();
  return split;
}

function solidifyOpenGeometry(geometry, thickness) {
  geometry = splitExcessNonManifoldTriangles(geometry);
  geometry.computeVertexNormals();
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const indexAttribute = geometry.index;
  const sourceIndices = indexAttribute
    ? Array.from({ length: indexAttribute.count }, (_, index) => indexAttribute.getX(index))
    : Array.from({ length: position.count }, (_, index) => index);
  const sourceVertexCount = position.count;
  const positions = Array.from(position.array);
  for (let vertex = 0; vertex < sourceVertexCount; vertex += 1) {
    positions.push(
      position.getX(vertex) - normal.getX(vertex) * thickness,
      position.getY(vertex) - normal.getY(vertex) * thickness,
      position.getZ(vertex) - normal.getZ(vertex) * thickness
    );
  }

  const indices = [...sourceIndices];
  for (let offset = 0; offset < sourceIndices.length; offset += 3) {
    indices.push(
      sourceIndices[offset] + sourceVertexCount,
      sourceIndices[offset + 2] + sourceVertexCount,
      sourceIndices[offset + 1] + sourceVertexCount
    );
  }
  const edges = new Map();
  for (let offset = 0; offset < sourceIndices.length; offset += 3) {
    for (let edge = 0; edge < 3; edge += 1) {
      const start = sourceIndices[offset + edge];
      const end = sourceIndices[offset + (edge + 1) % 3];
      const key = start < end ? `${start},${end}` : `${end},${start}`;
      const records = edges.get(key) ?? [];
      records.push({ start, end });
      edges.set(key, records);
    }
  }
  let boundaryEdgeCount = 0;
  for (const records of edges.values()) {
    if (records.length !== 1) continue;
    const { start, end } = records[0];
    const innerStart = start + sourceVertexCount;
    const innerEnd = end + sourceVertexCount;
    indices.push(start, innerStart, innerEnd, start, innerEnd, end);
    boundaryEdgeCount += 1;
  }

  const solid = new THREE.BufferGeometry();
  solid.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  solid.setIndex(indices);
  const oriented = orientGeometryOutward(solid);
  oriented.userData.solidification = {
    thicknessSourceUnits: thickness,
    sourceVertexCount,
    sourceTriangleCount: sourceIndices.length / 3,
    boundaryEdgeCount,
    quality: 'renderer-only inward thickness closes an open source primitive for FrontSide rendering'
  };
  geometry.dispose();
  return oriented;
}

function capOpenGeometry(geometry, sourceName) {
  const position = geometry.attributes.position;
  const indexAttribute = geometry.index;
  const sourceIndices = indexAttribute
    ? Array.from({ length: indexAttribute.count }, (_, index) => indexAttribute.getX(index))
    : Array.from({ length: position.count }, (_, index) => index);
  const edges = new Map();
  for (let offset = 0; offset < sourceIndices.length; offset += 3) {
    for (let edge = 0; edge < 3; edge += 1) {
      const start = sourceIndices[offset + edge];
      const end = sourceIndices[offset + (edge + 1) % 3];
      const key = start < end ? `${start},${end}` : `${end},${start}`;
      const records = edges.get(key) ?? [];
      records.push({ start, end });
      edges.set(key, records);
    }
  }
  const boundaryEdges = [...edges.values()]
    .filter(records => records.length === 1)
    .map(records => records[0]);
  const outgoing = new Map();
  for (const edge of boundaryEdges) {
    const records = outgoing.get(edge.start) ?? [];
    records.push(edge);
    outgoing.set(edge.start, records);
  }
  const edgeKey = edge => `${edge.start}>${edge.end}`;
  const visited = new Set();
  const loops = [];
  for (const first of boundaryEdges) {
    if (visited.has(edgeKey(first))) continue;
    const loop = [first.start];
    let edge = first;
    while (!visited.has(edgeKey(edge))) {
      visited.add(edgeKey(edge));
      loop.push(edge.end);
      if (edge.end === loop[0]) break;
      const next = (outgoing.get(edge.end) ?? [])
        .find(candidate => !visited.has(edgeKey(candidate)));
      if (!next) break;
      edge = next;
    }
    if (loop.length >= 4 && loop.at(-1) === loop[0]) loops.push(loop.slice(0, -1));
  }
  if (loops.reduce((sum, loop) => sum + loop.length, 0) !== boundaryEdges.length) {
    const solid = solidifyOpenGeometry(
      geometry,
      OPEN_SURFACE_THICKNESS_SOURCE_UNITS
    );
    solid.userData.shellClosure = {
      method: 'inward thickness fallback',
      boundaryEdgeCount: boundaryEdges.length,
      closedLoopCount: loops.length,
      quality:
        `branching ${sourceName} topology cannot be fan-capped without crossing unrelated openings; retained as a closed FrontSide-only volume`
    };
    return solid;
  }
  const positions = Array.from(position.array);
  const indices = [...sourceIndices];
  let addedTriangleCount = 0;
  let spatialLoopCount = 0;
  for (const loop of loops) {
    const points = loop.map(vertex => (
      new THREE.Vector3().fromBufferAttribute(position, vertex)
    ));
    const normal = new THREE.Vector3();
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }
    const dominantAxis = ['x', 'y', 'z'].reduce((best, axis) => (
      Math.abs(normal[axis]) > Math.abs(normal[best]) ? axis : best
    ), 'x');
    const projected = points.map(point => {
      if (dominantAxis === 'x') return new THREE.Vector2(point.z, point.y);
      if (dominantAxis === 'y') return new THREE.Vector2(point.x, point.z);
      return new THREE.Vector2(point.x, point.y);
    });
    let triangles = THREE.ShapeUtils.triangulateShape(projected, []);
    const conflictsWithSourceEdge = triangles.some(triangle => (
      triangle.some((localIndex, edge) => {
        const start = loop[localIndex];
        const end = loop[triangle[(edge + 1) % 3]];
        const key = start < end ? `${start},${end}` : `${end},${start}`;
        return (edges.get(key)?.length ?? 0) > 1;
      })
    ));
    if (triangles.length !== loop.length - 2 || conflictsWithSourceEdge) {
      const remaining = loop.map((vertex, index) => ({ vertex, index }));
      triangles = [];
      while (remaining.length > 3) {
        let bestIndex = -1;
        let bestScore = Infinity;
        for (let index = 0; index < remaining.length; index += 1) {
          const previous = remaining[(index - 1 + remaining.length) % remaining.length];
          const current = remaining[index];
          const next = remaining[(index + 1) % remaining.length];
          const previousPoint = points[previous.index];
          const currentPoint = points[current.index];
          const nextPoint = points[next.index];
          const diagonalStart = previous.vertex;
          const diagonalEnd = next.vertex;
          const diagonalKey = diagonalStart < diagonalEnd
            ? `${diagonalStart},${diagonalEnd}`
            : `${diagonalEnd},${diagonalStart}`;
          if ((edges.get(diagonalKey)?.length ?? 0) > 1) continue;
          const areaSquared = new THREE.Vector3()
            .subVectors(currentPoint, previousPoint)
            .cross(new THREE.Vector3().subVectors(nextPoint, currentPoint))
            .lengthSq();
          if (areaSquared < 1e-16) continue;
          const diagonalSquared = previousPoint.distanceToSquared(nextPoint);
          const score = diagonalSquared + Math.sqrt(areaSquared) * 0.05;
          if (score < bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        }
        if (bestIndex < 0) bestIndex = 0;
        const previous = remaining[(bestIndex - 1 + remaining.length) % remaining.length];
        const current = remaining[bestIndex];
        const next = remaining[(bestIndex + 1) % remaining.length];
        triangles.push([previous.index, current.index, next.index]);
        remaining.splice(bestIndex, 1);
      }
      triangles.push(remaining.map(record => record.index));
      spatialLoopCount += 1;
    }
    for (const triangle of triangles) {
      indices.push(...triangle.map(index => loop[index]));
    }
    addedTriangleCount += triangles.length;
  }
  const capped = new THREE.BufferGeometry();
  capped.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  capped.setIndex(indices);
  const oriented = orientGeometryOutward(capped);
  oriented.userData.shellClosure = {
    method: 'post-reduction boundary-loop triangulation',
    boundaryLoopCount: loops.length,
    spatialLoopCount,
    addedTriangleCount,
    quality:
      'each source boundary is triangulated independently; planar loops use concave polygon triangulation and non-planar loops use a shortest-local-edge advancing front without a shared center fan or inward duplicate shell'
  };
  geometry.dispose();
  return oriented;
}

function worldGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  const sourceNormalRepair = orientTrianglesToSourceNormals(geometry)
    .userData.windingRepair;
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== 'position') geometry.deleteAttribute(attribute);
  }
  geometry.clearGroups();
  const oriented = orientGeometryOutward(mergeVertices(geometry, 1e-5));
  oriented.userData.windingRepair.sourceNormalFlipCount =
    sourceNormalRepair.consistencyFlipCount;
  return oriented;
}

function simplifiedGeometry(mesh, ratio) {
  const sourceGeometry = worldGeometry(mesh);
  const sourceVertexCount = sourceGeometry.attributes.position.count;
  const minimumVertices = Math.min(sourceVertexCount, 12);
  const targetVertices = Math.max(
    minimumVertices,
    Math.round(sourceVertexCount * ratio)
  );
  const sourceName = sourceNodeName(mesh);
  const requiresPostReductionSolidification =
    POST_REDUCTION_SOLIDIFIED_SOURCE_NODES.has(sourceName);
  let geometry = sourceGeometry;
  if (
    SOLIDIFIED_OPEN_SOURCE_NODES.has(sourceName)
    && !CAPPED_SHELL_SOURCE_NODES.has(sourceName)
    && !requiresPostReductionSolidification
  ) {
    geometry = solidifyOpenGeometry(
      sourceGeometry,
      sourceName === ENGINE_DECK_SOURCE_NODE
        ? OPEN_SURFACE_THICKNESS_SOURCE_UNITS * 0.15
        : OPEN_SURFACE_THICKNESS_SOURCE_UNITS
    );
  }
  const removeCount = geometry.attributes.position.count - targetVertices;
  let output = geometry;
  if (removeCount >= 4) {
    output = modifier.modify(geometry, removeCount);
    geometry.dispose();
    output = orientGeometryOutward(output);
  }
  if (requiresPostReductionSolidification) {
    const welded = orientGeometryOutward(mergeVertices(output, 1e-5));
    output.dispose();
    output = welded;
    output = solidifyOpenGeometry(
      output,
      sourceName === ENGINE_DECK_SOURCE_NODE
        ? OPEN_SURFACE_THICKNESS_SOURCE_UNITS * 0.15
      : OPEN_SURFACE_THICKNESS_SOURCE_UNITS
    );
  }
  if (CAPPED_SHELL_SOURCE_NODES.has(sourceName)) {
    const welded = orientGeometryOutward(mergeVertices(output, 1e-5));
    output.dispose();
    output = capOpenGeometry(welded, sourceName);
  }
  const closureAudit = output.userData.shellClosure
    ?? output.userData.solidification
    ?? null;
  if (closureAudit) output.userData.closureAudit = closureAudit;
  return output;
}

function boundsRecord(bounds) {
  return {
    min: bounds.min.toArray().map(round),
    max: bounds.max.toArray().map(round),
    size: bounds.getSize(new THREE.Vector3()).toArray().map(round),
    center: bounds.getCenter(new THREE.Vector3()).toArray().map(round)
  };
}

const sourceExteriorMeshes = [];
const sourceExteriorNodeNames = new Set();
let sourceExteriorTriangleCount = 0;
gltf.scene.traverse(object => {
  if (!object.isMesh || materialName(object) === INTERIOR_MATERIAL) return;
  sourceExteriorNodeNames.add(object.name);
  sourceExteriorTriangleCount += triangleCount(object.geometry);
  if (object.name === MIXED_TOOLSET_SOURCE_NODE) {
    sourceExteriorMeshes.push(selectTwinExhaust(object));
    return;
  }
  if (object.name === GUN_SOURCE_NODE) {
    sourceExteriorMeshes.push(
      splitSourceGunMesh(
        object,
        'mantlet',
        centerZ => centerZ <= GUN_MANTLET_SPLIT_SOURCE_Z
      ),
      splitSourceGunMesh(
        object,
        'gun',
        centerZ => centerZ > GUN_MANTLET_SPLIT_SOURCE_Z
      )
    );
    return;
  }
  sourceExteriorMeshes.push(object);
});
const emittedSourceMeshes = sourceExteriorMeshes.filter(mesh => (
  !PRESENTATION_EXCLUDED_SOURCE_NODES.has(sourceNodeName(mesh))
));
const derivedPresentationMeshes = TURRET_VISION_APERTURE_COVERS.flatMap(
  createTurretVisionAperturePresentation
);
const exteriorMeshes = [...emittedSourceMeshes, ...derivedPresentationMeshes];

const rigidMeshes = exteriorMeshes.filter(mesh => (
  mesh.name !== FLEXIBLE_REAR_CHAIN_NODE
  && mesh.name !== AERIAL_SOURCE_NODE
  && !/PortIndicator$/.test(sourceArticulation(mesh))
  && !['Bag_blinn', 'Toolset_blinn5', 'lambert2'].includes(materialName(mesh))
));
const rigidBounds = new THREE.Box3();
for (const mesh of rigidMeshes) rigidBounds.expandByObject(mesh);

function extractArmorMesh(key, sourceNodeName) {
  const mesh = gltf.scene.getObjectByName(sourceNodeName);
  if (!mesh?.isMesh) throw new Error(`Reference mesh not found: ${sourceNodeName}`);
  const geometry = worldGeometry(mesh);
  const positions = new Float32Array(geometry.attributes.position.array);
  const sourceIndices = geometry.index;
  const indices = new Uint32Array(
    sourceIndices
      ? Array.from({ length: sourceIndices.count }, (_, index) => sourceIndices.getX(index))
      : Array.from({ length: positions.length / 3 }, (_, index) => index)
  );
  const bounds = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
  geometry.dispose();
  return encodedGeometry({
    key,
    sourceNodeNames: [sourceNodeName],
    sourceMaterialNames: [materialName(mesh)],
    sourceTriangleCount: triangleCount(mesh.geometry),
    sourceVertexCount: mesh.geometry.attributes.position.count,
    outputPositions: positions,
    outputIndices: indices,
    bounds
  });
}

function bucketKey({ region, articulation, band, slot }) {
  return `${region}_${articulation}_${band}_${slot}`.replaceAll('-', '_');
}

function sourceArticulation(mesh) {
  if (mesh.userData.sourceArticulation) return mesh.userData.sourceArticulation;
  if (TURRET_APERTURE_ARTICULATION[sourceNodeName(mesh)]) {
    return TURRET_APERTURE_ARTICULATION[sourceNodeName(mesh)];
  }
  if (mesh.name === GUN_SOURCE_NODE) return 'gun';
  if (mesh.name === ENGINE_DECK_SOURCE_NODE) return 'engineDeck';
  if (mesh.name === CUPOLA_SOURCE_NODE) return 'cupola';
  if (mesh.name === CUPOLA_ROOF_SOURCE_NODE) return 'cupolaRoof';
  if (
    sourceRegion(mesh) === 'static'
    && ['blinn4', 'Door_blinn4'].includes(materialName(mesh))
  ) return 'bodyDetail';
  return 'body';
}

function splitSourceGunMesh(mesh, articulation, keepTriangle) {
  const sourcePosition = mesh.geometry.attributes.position;
  const sourceNormal = mesh.geometry.attributes.normal;
  const sourceIndex = mesh.geometry.index;
  const positionValues = [];
  const normalValues = [];
  const point = new THREE.Vector3();
  const triangleCountValue = sourceIndex.count / 3;
  for (let triangle = 0; triangle < triangleCountValue; triangle += 1) {
    const sourceIndices = [0, 1, 2].map(corner => (
      sourceIndex.getX(triangle * 3 + corner)
    ));
    let centerZ = 0;
    for (const index of sourceIndices) {
      centerZ += point.fromBufferAttribute(sourcePosition, index)
        .applyMatrix4(mesh.matrixWorld).z / 3;
    }
    if (!keepTriangle(centerZ)) continue;
    for (const index of sourceIndices) {
      positionValues.push(
        sourcePosition.getX(index),
        sourcePosition.getY(index),
        sourcePosition.getZ(index)
      );
      normalValues.push(
        sourceNormal.getX(index),
        sourceNormal.getY(index),
        sourceNormal.getZ(index)
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positionValues, 3)
  );
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(normalValues, 3)
  );
  const part = new THREE.Mesh(geometry, mesh.material);
  part.name = `${mesh.name}__${articulation}`;
  part.matrixAutoUpdate = false;
  part.matrix.copy(mesh.matrixWorld);
  part.matrixWorld.copy(mesh.matrixWorld);
  part.userData = {
    sourceNodeName: mesh.name,
    sourceRegion: 'turret',
    sourceArticulation: articulation,
    sourceSplit:
      `triangle-centroid world Z ${articulation === 'mantlet' ? '<=' : '>'} ${GUN_MANTLET_SPLIT_SOURCE_Z}`
  };
  return part;
}

const buckets = new Map();
function addMeshToBucket(mesh, band) {
  const region = sourceRegion(mesh);
  const material = materialName(mesh);
  const slot = materialSlot(material);
  const articulation = sourceArticulation(mesh);
  const key = bucketKey({ region, articulation, band, slot });
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      key,
      region,
      articulation,
      lodBand: band,
      materialSlot: slot,
      sourceNodeNames: [],
      sourceMaterialNames: new Set(),
      sourceTriangleCount: 0,
      sourceVertexCount: 0,
      windingRepair: {
        componentCount: 0,
        consistencyFlipCount: 0,
        outwardComponentFlipCount: 0
      },
      simplifiedParts: []
    };
    buckets.set(key, bucket);
  }
  const ratio = targetVertexRatio(mesh, band, slot);
  const geometry = simplifiedGeometry(mesh, ratio);
  bucket.sourceNodeNames.push(sourceNodeName(mesh));
  bucket.sourceMaterialNames.add(material);
  bucket.sourceTriangleCount += triangleCount(mesh.geometry);
  bucket.sourceVertexCount += mesh.geometry.attributes.position.count;
  bucket.windingRepair.componentCount +=
    geometry.userData.windingRepair.componentCount;
  bucket.windingRepair.consistencyFlipCount +=
    geometry.userData.windingRepair.consistencyFlipCount;
  bucket.windingRepair.outwardComponentFlipCount +=
    geometry.userData.windingRepair.outwardComponentFlipCount;
  bucket.simplifiedParts.push({
    geometry,
    sourceNodeName: sourceNodeName(mesh),
    closureAudit: geometry.userData.closureAudit ?? null
  });
}

for (const mesh of exteriorMeshes) {
  const region = sourceRegion(mesh);
  const material = materialName(mesh);
  const band = lodBand(mesh, region, material);
  addMeshToBucket(mesh, band);
  if (band === 'core') addMeshToBucket(mesh, 'proxy');
}

function mergeBucket(bucket) {
  const positions = [];
  const indices = [];
  const sourceParts = [];
  const bounds = new THREE.Box3();
  for (const part of bucket.simplifiedParts) {
    const { geometry } = part;
    const position = geometry.attributes.position;
    const offset = positions.length / 3;
    const indexStart = indices.length;
    positions.push(...position.array);
    if (geometry.index) {
      for (let index = 0; index < geometry.index.count; index += 1) {
        indices.push(offset + geometry.index.getX(index));
      }
    } else {
      for (let index = 0; index < position.count; index += 1) indices.push(offset + index);
    }
    sourceParts.push({
      sourceNodeName: part.sourceNodeName,
      indexStart,
      indexCount: indices.length - indexStart,
      closureAudit: part.closureAudit
    });
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox);
    geometry.dispose();
  }
  return encodedGeometry({
    ...bucket,
    sourceMaterialNames: [...bucket.sourceMaterialNames].sort(),
    outputPositions: new Float32Array(positions),
    outputIndices: new Uint32Array(indices),
    sourceParts,
    bounds
  });
}

function encodedGeometry(record) {
  return {
    key: record.key,
    region: record.region,
    articulation: record.articulation,
    lodBand: record.lodBand,
    materialSlot: record.materialSlot,
    sourceNodeNames: record.sourceNodeNames,
    sourceMaterialNames: record.sourceMaterialNames,
    sourceParts: record.sourceParts,
    bounds: boundsRecord(record.bounds),
    sourceTriangleCount: record.sourceTriangleCount,
    sourceVertexCount: record.sourceVertexCount,
    windingRepair: record.windingRepair,
    triangleCount: record.outputIndices.length / 3,
    vertexCount: record.outputPositions.length / 3,
    indexCount: record.outputIndices.length,
    positionEncoding: 'float32-le-base64',
    positionBase64: Buffer.from(
      record.outputPositions.buffer,
      record.outputPositions.byteOffset,
      record.outputPositions.byteLength
    ).toString('base64'),
    indexEncoding: 'uint32-le-base64',
    indexBase64: Buffer.from(
      record.outputIndices.buffer,
      record.outputIndices.byteOffset,
      record.outputIndices.byteLength
    ).toString('base64')
  };
}

const assemblies = Object.fromEntries(
  [...buckets.values()]
    .sort((first, second) => first.key.localeCompare(second.key))
    .map(bucket => [bucket.key, mergeBucket(bucket)])
);
const armorMeshes = Object.fromEntries(
  Object.entries(SELECTED_ARMOR_MESHES).map(([key, sourceNodeName]) => (
    [key, extractArmorMesh(key, sourceNodeName)]
  ))
);
const gunAssembly = Object.values(assemblies).find(record => record.articulation === 'gun');
if (!gunAssembly) throw new Error('S35 source gun assembly was not extracted');
const emittedRigidBounds = new THREE.Box3();
for (const assembly of Object.values(assemblies)) {
  if (
    assembly.lodBand === 'proxy'
    || assembly.articulation === 'gun'
    || [
      'static_body_high_canvas',
      'static_body_high_paint',
      'static_body_high_track'
    ].includes(assembly.key)
  ) continue;
  emittedRigidBounds.expandByPoint(new THREE.Vector3(...assembly.bounds.min));
  emittedRigidBounds.expandByPoint(new THREE.Vector3(...assembly.bounds.max));
}

function sourceGunMuzzle() {
  const mesh = gltf.scene.getObjectByName(GUN_SOURCE_NODE);
  const position = mesh.geometry.attributes.position;
  const point = new THREE.Vector3();
  const vertices = [];
  let maximumZ = -Infinity;
  for (let index = 0; index < position.count; index += 1) {
    const vertex = point.fromBufferAttribute(position, index)
      .applyMatrix4(mesh.matrixWorld)
      .clone();
    vertices.push(vertex);
    maximumZ = Math.max(maximumZ, vertex.z);
  }
  const muzzleVertices = vertices.filter(vertex => vertex.z >= maximumZ - 0.001);
  return Object.freeze([
    round(muzzleVertices.reduce((sum, vertex) => sum + vertex.x, 0)
      / muzzleVertices.length),
    round(muzzleVertices.reduce((sum, vertex) => sum + vertex.y, 0)
      / muzzleVertices.length),
    round(maximumZ)
  ]);
}

const bundle = {
  source: {
    localPath: path.relative(repositoryRoot, inputPath),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    title: 'French Somua S35',
    author: 'Basic Hsu',
    sourceUrl: 'https://sketchfab.com/3d-models/french-somua-s35-6b977d2580144118bc4850cc5044f883',
    license: 'CC-BY-4.0',
    selectedRoot: 'Model_GP',
    selectedNodes: Object.values(SELECTED_ARMOR_MESHES),
    exteriorNodeCount: sourceExteriorNodeNames.size,
    emittedSourceNodeCount: new Set(emittedSourceMeshes.map(sourceNodeName)).size,
    derivedPresentationNodeCount: derivedPresentationMeshes.length,
    excludedInteriorNodeCount: 4,
    excludedPresentationNodeCount: PRESENTATION_EXCLUDED_SOURCE_NODES.size,
    excludedPresentationNodes: [...PRESENTATION_EXCLUDED_SOURCE_NODES].sort(),
    exteriorSourceTriangleCount: sourceExteriorTriangleCount,
    partiallyRetainedSourceNodes: Object.freeze({
      [MIXED_TOOLSET_SOURCE_NODE]: Object.freeze({
        retainedPart: EXHAUST_SOURCE_PART,
        policy:
          'retain only the two source-connected longitudinal exhaust components; omit disconnected tools and fasteners'
      })
    }),
    emittedTriangleCount: Object.values(assemblies).reduce(
      (sum, record) => sum + record.triangleCount,
      0
    ),
    coordinateFrame: '+Y up, +Z forward, vehicle right -X',
    rigidSourceBounds: boundsRecord(rigidBounds),
    emittedRigidSourceBounds: boundsRecord(emittedRigidBounds),
    targetRigidEnvelopeMeters: TARGET_ENVELOPE,
    targetTurretPivot: TARGET_TURRET_PIVOT,
    solidifiedOpenSourceNodes: [...SOLIDIFIED_OPEN_SOURCE_NODES]
      .filter(name => (
        !PRESENTATION_EXCLUDED_SOURCE_NODES.has(name)
        && !CAPPED_SHELL_SOURCE_NODES.has(name)
      ))
      .sort(),
    cappedShellSourceNodes: [...CAPPED_SHELL_SOURCE_NODES].sort(),
    solidificationThicknessSourceUnits: OPEN_SURFACE_THICKNESS_SOURCE_UNITS,
    extraction:
      'all exterior source meshes are world-transformed; source-normal mismatches are repaired before reduction; primary GLB hull and turret surfaces are reduced only where required by the runtime LOD, welded, and then closed one boundary loop at a time without center fans; floating tool, chain, net, canvas, dark turret insert, and layered vision-port presentation meshes are omitted; each turret vision aperture receives one flush source-bounds-derived painted solid cover; audited Chassis, Upper, turret insert, and cupola openings are closed after reduction so simplification cannot reopen them; output is partitioned by articulation, material, and cumulative runtime LOD; four Interior_blinn3 primitives are excluded'
  },
  meshes: armorMeshes,
  assemblies,
  derived: {
    sourceGunMuzzle: sourceGunMuzzle(),
    derivation:
      'main-gun marker averages X/Y across source vertices within 1 mm of the isolated gun assembly forward-most +Z tip'
  }
};

function format(value, indent = 0) {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Object.freeze([])';
    return `Object.freeze([${value.map(item => format(item, indent + 2)).join(', ')}])`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => (
      `${' '.repeat(indent + 2)}${JSON.stringify(key)}: ${format(item, indent + 2)}`
    ));
    return `Object.freeze({\n${entries.join(',\n')}\n${' '.repeat(indent)}})`;
  }
  return JSON.stringify(value);
}

const header = '// Generated by scripts/extract-somua-s35-reference-meshes.mjs.\n'
  + '// Source positions remain immutable GLB-derived evidence; registration happens in the factory.\n\n';
fs.writeFileSync(
  outputPath,
  `${header}export const SOMUA_S35_REFERENCE_MESH_DATA = ${format(bundle)};\n`
);
process.stdout.write(`${JSON.stringify({
  outputPath,
  source: bundle.source,
  assemblies: Object.fromEntries(Object.entries(assemblies).map(([key, record]) => [
    key,
    {
      sourceNodes: record.sourceNodeNames.length,
      sourceTriangles: record.sourceTriangleCount,
      emittedTriangles: record.triangleCount,
      vertices: record.vertexCount,
      windingRepair: record.windingRepair
    }
  ]))
}, null, 2)}\n`);
