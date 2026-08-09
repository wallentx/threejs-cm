import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const inputPath = path.resolve(
  repositoryRoot,
  process.argv[2] ?? 'reference/low_poly_lebel_1886.glb'
);
const outputPath = path.resolve(
  repositoryRoot,
  process.argv[3]
    ?? 'src/content/france1940/render/LebelM1886M93ReferenceMeshData.js'
);
const REGISTERED_LENGTH_METRES = 1.30;
const PLAIN_NODE = 'Lebel_Rifle_Uncovered';
const SCOPED_NODE = 'Lebel_Rifle_Covered';

const bytes = fs.readFileSync(inputPath);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(buffer, '', resolve, reject);
});
gltf.scene.updateMatrixWorld(true);

function findMesh(root, name) {
  const mesh = root.getObjectByName(name);
  if (!mesh?.isMesh) throw new Error(`Reference mesh not found: ${name}`);
  return mesh;
}

function rootRegistration(root, bodyMeshName) {
  const bounds = new THREE.Box3().setFromObject(root);
  const sourceLength = bounds.getSize(new THREE.Vector3()).z;
  const metresPerSourceUnit = REGISTERED_LENGTH_METRES / sourceLength;
  const rootWorld = root.getWorldPosition(new THREE.Vector3());
  const body = findMesh(root, bodyMeshName);
  const positions = body.geometry.attributes.position;
  const point = new THREE.Vector3();
  let barrelMinY = Infinity;
  let barrelMaxY = -Infinity;
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index).applyMatrix4(body.matrixWorld);
    const z = (bounds.max.z - point.z) * metresPerSourceUnit;
    if (z < 1.24 || z > 1.28) continue;
    const y = (point.y - rootWorld.y) * metresPerSourceUnit;
    barrelMinY = Math.min(barrelMinY, y);
    barrelMaxY = Math.max(barrelMaxY, y);
  }
  if (!Number.isFinite(barrelMinY) || !Number.isFinite(barrelMaxY)) {
    throw new Error(`Unable to derive the ${root.name} bore axis`);
  }
  return {
    bounds,
    rootWorld,
    sourceLength,
    metresPerSourceUnit,
    boreAxisY: (barrelMinY + barrelMaxY) * 0.5,
    sourceBarrelRadius: (barrelMaxY - barrelMinY) * 0.5
  };
}

function round(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function extractMesh(
  root,
  registration,
  key,
  sourceNodeName,
  materialSlot,
  { metalBandZRanges = [] } = {}
) {
  const mesh = findMesh(root, sourceNodeName);
  const sourcePositions = mesh.geometry.attributes.position;
  const point = new THREE.Vector3();
  const positionValues = [];
  for (let index = 0; index < sourcePositions.count; index += 1) {
    point.fromBufferAttribute(sourcePositions, index).applyMatrix4(mesh.matrixWorld);
    positionValues.push(
      round(-point.x * registration.metresPerSourceUnit),
      round(
        (point.y - registration.rootWorld.y) * registration.metresPerSourceUnit
          - registration.boreAxisY
      ),
      round((registration.bounds.max.z - point.z) * registration.metresPerSourceUnit)
    );
  }
  const indexAttribute = mesh.geometry.index;
  const sourceIndices = indexAttribute
    ? Array.from({ length: indexAttribute.count }, (_, index) => indexAttribute.getX(index))
    : Array.from({ length: sourcePositions.count }, (_, index) => index);
  const materialSlots = metalBandZRanges.length > 0
    ? [materialSlot, 'metal']
    : [materialSlot];
  const trianglesBySlot = new Map(materialSlots.map(slot => [slot, []]));
  for (let offset = 0; offset < sourceIndices.length; offset += 3) {
    const triangle = sourceIndices.slice(offset, offset + 3);
    const zValues = triangle.map(index => positionValues[index * 3 + 2]);
    const slot = metalBandZRanges.some(([startZ, endZ]) => (
      zValues.every(z => z >= startZ && z <= endZ)
    )) ? 'metal' : materialSlot;
    trianglesBySlot.get(slot).push(...triangle);
  }
  const indices = [];
  const groups = [];
  for (const [materialIndex, slot] of materialSlots.entries()) {
    const groupIndices = trianglesBySlot.get(slot);
    if (groupIndices.length === 0) continue;
    groups.push({
      start: indices.length,
      count: groupIndices.length,
      materialIndex,
      materialSlot: slot
    });
    indices.push(...groupIndices);
  }
  const positions = new Float32Array(positionValues);
  const indexValues = new Uint16Array(indices);
  return {
    key,
    sourceNodeName,
    materialSlot,
    materialSlots,
    groups,
    triangleCount: indices.length / 3,
    vertexCount: positions.length / 3,
    indexCount: indexValues.length,
    positionEncoding: 'float32-le-base64',
    positionBase64: Buffer.from(
      positions.buffer,
      positions.byteOffset,
      positions.byteLength
    ).toString('base64'),
    indexEncoding: 'uint16-le-base64',
    indexBase64: Buffer.from(
      indexValues.buffer,
      indexValues.byteOffset,
      indexValues.byteLength
    ).toString('base64')
  };
}

const plainRoot = gltf.scene.getObjectByName(PLAIN_NODE);
const scopedRoot = gltf.scene.getObjectByName(SCOPED_NODE);
if (!plainRoot || !scopedRoot) throw new Error('The two full-length Lebel assemblies are required');
const plainRegistration = rootRegistration(plainRoot, 'Body_Barrel_Lebel_1886_mat_0');
const scopedRegistration = rootRegistration(scopedRoot, 'Body_Barrel_Lebel_1886_mat_0_1');

const sharedDefinitions = [
  ['stock', 'Stock_Lebel_1886_mat_0_4', 'wood'],
  ['bodyBarrelAssembly', 'Body_Barrel_Lebel_1886_mat_0', 'metal'],
  ['triggerGuard', 'Trigger_Guard_Lebel_1886_mat_0_4', 'metal'],
  ['boltBack', 'Bolt_Back_Lebel_1886_mat_0_4', 'metal'],
  ['trigger', 'Trigger_Lebel_1886_mat_0_4', 'metal'],
  ['bolt', 'Bolt_Lebel_1886_mat_0_4', 'metal'],
  ['rearSightMount', 'Rear_Sight_Mount_Lebel_1886_mat_0_4', 'metal'],
  ['rearSightPost', 'Rear_Sight_Post_Lebel_1886_mat_0_4', 'metal'],
  ['rearSightLeaf', 'Rear_Sight_Lebel_1886_mat_0_4', 'metal'],
  ['stackingTube', 'Cleaing_Rod_Lebel_1886_mat_0', 'metal'],
  ['frontSight', 'Front_Sight_Lebel_1886_mat_0', 'metal']
];
const plainDefinitions = [
  ['handguard', 'Handguard_Long_Lebel_1886_mat_0', 'wood', {
    metalBandZRanges: [[0.70, 0.75], [1.14, 1.19]]
  }]
];
const scopedDefinitions = [
  ['handguard', 'Handguard_Rifle_Lebel_1886_mat_0', 'wood', {
    metalBandZRanges: [[0.70, 0.75], [1.14, 1.19]]
  }],
  ['optic', 'Scope_Lebel_1886_mat_0', 'metal']
];
const extractDefinitions = (root, registration, definitions) => Object.fromEntries(
  definitions.map(definition => {
    const mesh = extractMesh(root, registration, ...definition);
    return [mesh.key, mesh];
  })
);
const bundle = {
  source: {
    localPath: path.relative(repositoryRoot, inputPath),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    selectedNodes: [PLAIN_NODE, SCOPED_NODE],
    registeredLengthMetres: REGISTERED_LENGTH_METRES,
    sourceLengthUnits: plainRegistration.sourceLength,
    metresPerSourceUnit: plainRegistration.metresPerSourceUnit,
    sourceBoreAxisY: plainRegistration.boreAxisY,
    sourceBarrelRadius: plainRegistration.sourceBarrelRadius,
    extraction: 'world-transformed, length-normalized, X/Z reoriented into the production weapon contract, and translated to the GLB-derived bore axis; no renderer correction is baked into these source positions'
  },
  shared: extractDefinitions(plainRoot, plainRegistration, sharedDefinitions),
  plain: extractDefinitions(plainRoot, plainRegistration, plainDefinitions),
  scoped: extractDefinitions(scopedRoot, scopedRegistration, scopedDefinitions)
};

function format(value, indent = 0) {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Object.freeze([])';
    const values = value.map(item => typeof item === 'number' ? String(item) : format(item, indent + 2));
    const lines = [];
    for (let index = 0; index < values.length; index += 18) {
      lines.push(`${' '.repeat(indent + 2)}${values.slice(index, index + 18).join(', ')}`);
    }
    return `Object.freeze([\n${lines.join(',\n')}\n${' '.repeat(indent)}])`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => (
      `${' '.repeat(indent + 2)}${JSON.stringify(key)}: ${format(item, indent + 2)}`
    ));
    return `Object.freeze({\n${entries.join(',\n')}\n${' '.repeat(indent)}})`;
  }
  return JSON.stringify(value);
}

const header = '// Generated by scripts/extract-lebel-reference-meshes.mjs.\n'
  + '// Source positions remain immutable GLB-derived evidence; renderer corrections happen in the factory.\n\n';
fs.writeFileSync(
  outputPath,
  `${header}export const LEBEL_M1886_M93_REFERENCE_MESH_DATA = ${format(bundle)};\n`
);
const triangleCount = Object.values(bundle.shared)
  .concat(Object.values(bundle.plain), Object.values(bundle.scoped))
  .reduce((sum, mesh) => sum + mesh.triangleCount, 0);
process.stdout.write(`${JSON.stringify({ outputPath, triangleCount, source: bundle.source }, null, 2)}\n`);
