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
  process.argv[2] ?? 'reference/mas38/scene.gltf'
);
const outputPath = path.resolve(
  repositoryRoot,
  process.argv[3]
    ?? 'src/content/france1940/render/Mas38ReferenceMeshData.js'
);
const REGISTERED_LENGTH_METRES = 0.63;
const WOOD_SOURCE_NODE = 'Object_26';

function localResourcePath(uri) {
  const inputDirectory = path.dirname(inputPath);
  const resolved = path.resolve(inputDirectory, decodeURIComponent(uri));
  const relative = path.relative(inputDirectory, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`External glTF resource escapes its reference directory: ${uri}`);
  }
  return resolved;
}

const sourceText = fs.readFileSync(inputPath, 'utf8');
const document = JSON.parse(sourceText);
const externalBuffers = [];
for (const buffer of document.buffers ?? []) {
  if (!buffer.uri || buffer.uri.startsWith('data:')) continue;
  if (/^[a-z][a-z0-9+.-]*:/i.test(buffer.uri)) {
    throw new Error(`Only local glTF buffers are supported: ${buffer.uri}`);
  }
  const bufferPath = localResourcePath(buffer.uri);
  const bytes = fs.readFileSync(bufferPath);
  externalBuffers.push({
    localPath: path.relative(repositoryRoot, bufferPath),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  });
  buffer.uri = `data:application/octet-stream;base64,${bytes.toString('base64')}`;
}

const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(JSON.stringify(document), `${path.dirname(inputPath)}${path.sep}`, resolve, reject);
});
gltf.scene.updateMatrixWorld(true);

const meshes = [];
gltf.scene.traverse(object => {
  if (object.isMesh && object.visible) meshes.push(object);
});
if (meshes.length === 0) throw new Error('The MAS-38 reference contains no visible meshes');

function worldPoint(mesh, vertexIndex, target) {
  target.fromBufferAttribute(mesh.geometry.attributes.position, vertexIndex);
  if (mesh.isSkinnedMesh) mesh.applyBoneTransform(vertexIndex, target);
  return target.applyMatrix4(mesh.matrixWorld);
}

const sourceBounds = new THREE.Box3();
const point = new THREE.Vector3();
for (const mesh of meshes) {
  const positions = mesh.geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    sourceBounds.expandByPoint(worldPoint(mesh, index, point));
  }
}
const sourceLengthUnits = sourceBounds.max.x - sourceBounds.min.x;
const metresPerSourceUnit = REGISTERED_LENGTH_METRES / sourceLengthUnits;

// Sample the unobstructed barrel span before the muzzle sight. Its combined Y
// envelope is a stable bind-pose bore datum and avoids centering on the
// magazine, stock, muzzle sight, or charging handle.
let boreMinY = Infinity;
let boreMaxY = -Infinity;
const boreStartX = sourceBounds.min.x + sourceLengthUnits * 0.715;
const boreEndX = sourceBounds.min.x + sourceLengthUnits * 0.82;
for (const mesh of meshes) {
  const positions = mesh.geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    worldPoint(mesh, index, point);
    if (point.x < boreStartX || point.x > boreEndX) continue;
    boreMinY = Math.min(boreMinY, point.y);
    boreMaxY = Math.max(boreMaxY, point.y);
  }
}
if (!Number.isFinite(boreMinY) || !Number.isFinite(boreMaxY)) {
  throw new Error('Unable to derive the MAS-38 bore axis');
}
const sourceBoreAxisY = (boreMinY + boreMaxY) * 0.5;

const round = value => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
};
const positions = [];
const trianglesBySlot = new Map([['metal', []], ['wood', []]]);
const sourceParts = [];
const normalMatrix = new THREE.Matrix3();
const sourceNormal = new THREE.Vector3();
const faceNormal = new THREE.Vector3();
const edgeA = new THREE.Vector3();
const edgeB = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();

for (const mesh of meshes.sort((first, second) => first.name.localeCompare(second.name))) {
  const sourcePositions = mesh.geometry.attributes.position;
  const sourceNormals = mesh.geometry.attributes.normal;
  const vertexOffset = positions.length / 3;
  normalMatrix.getNormalMatrix(mesh.matrixWorld);
  for (let index = 0; index < sourcePositions.count; index += 1) {
    worldPoint(mesh, index, point);
    positions.push(
      round(-point.z * metresPerSourceUnit),
      round((point.y - sourceBoreAxisY) * metresPerSourceUnit),
      round((point.x - sourceBounds.min.x) * metresPerSourceUnit)
    );
  }
  const sourceIndices = mesh.geometry.index;
  const indexCount = sourceIndices?.count ?? sourcePositions.count;
  const slot = mesh.name === WOOD_SOURCE_NODE ? 'wood' : 'metal';
  const targetIndices = trianglesBySlot.get(slot);
  const partStart = targetIndices.length;
  for (let offset = 0; offset < indexCount; offset += 3) {
    const triangle = [0, 1, 2].map(corner => (
      sourceIndices?.getX(offset + corner) ?? offset + corner
    ));
    worldPoint(mesh, triangle[0], a);
    worldPoint(mesh, triangle[1], b);
    worldPoint(mesh, triangle[2], c);
    faceNormal.crossVectors(edgeA.subVectors(b, a), edgeB.subVectors(c, a));
    if (sourceNormals) {
      sourceNormal.set(0, 0, 0);
      for (const vertexIndex of triangle) {
        point.fromBufferAttribute(sourceNormals, vertexIndex).applyMatrix3(normalMatrix).normalize();
        sourceNormal.add(point);
      }
      if (faceNormal.dot(sourceNormal) < 0) [triangle[1], triangle[2]] = [triangle[2], triangle[1]];
    }
    targetIndices.push(...triangle.map(index => index + vertexOffset));
  }
  sourceParts.push({
    sourceNodeName: mesh.name,
    sourceMaterialName: mesh.material?.name ?? null,
    materialSlot: slot,
    vertexStart: vertexOffset,
    vertexCount: sourcePositions.count,
    triangleCount: indexCount / 3,
    materialIndexStart: partStart,
    materialIndexCount: targetIndices.length - partStart
  });
}

const materialSlots = ['metal', 'wood'];
const indices = [];
const groups = [];
for (const [materialIndex, materialSlot] of materialSlots.entries()) {
  const groupIndices = trianglesBySlot.get(materialSlot);
  groups.push({
    start: indices.length,
    count: groupIndices.length,
    materialIndex,
    materialSlot
  });
  indices.push(...groupIndices);
}
const positionValues = new Float32Array(positions);
const indexValues = new Uint16Array(indices);
const bundle = {
  source: {
    localPath: path.relative(repositoryRoot, inputPath),
    sha256: crypto.createHash('sha256').update(sourceText).digest('hex'),
    externalBuffers,
    license: document.asset?.extras?.license ?? null,
    author: document.asset?.extras?.author ?? null,
    sourceUrl: document.asset?.extras?.source ?? null,
    selectedNodes: meshes.map(mesh => mesh.name).sort(),
    registeredLengthMetres: REGISTERED_LENGTH_METRES,
    sourceLengthUnits,
    metresPerSourceUnit,
    sourceBoreAxisY,
    extraction: 'complete visible bind-pose assembly; skinned vertices world-transformed; source +X registered to project +Z; source +Y registered to project +Y; source +Z registered to project -X so the charging handle remains on weapon right; triangle winding reconciled to source normals; no runtime GLTF loader'
  },
  assembly: {
    key: 'assembly',
    sourceNodeName: 'Sketchfab_Scene',
    materialSlots,
    groups,
    sourceParts,
    triangleCount: indexValues.length / 3,
    vertexCount: positionValues.length / 3,
    indexCount: indexValues.length,
    positionEncoding: 'float32-le-base64',
    positionBase64: Buffer.from(positionValues.buffer).toString('base64'),
    indexEncoding: 'uint16-le-base64',
    indexBase64: Buffer.from(indexValues.buffer).toString('base64')
  }
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

const header = '// Generated by scripts/extract-mas38-reference-meshes.mjs.\n'
  + '// Source positions remain immutable glTF-derived evidence; the runtime does not load the source asset.\n\n';
fs.writeFileSync(
  outputPath,
  `${header}export const MAS38_REFERENCE_MESH_DATA = ${format(bundle)};\n`
);
process.stdout.write(`${JSON.stringify({ outputPath, source: bundle.source, triangleCount: bundle.assembly.triangleCount }, null, 2)}\n`);
