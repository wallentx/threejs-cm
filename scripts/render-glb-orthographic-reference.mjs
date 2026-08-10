import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFrance1940InfantryWeaponRig } from '../src/content/france1940/render/France1940InfantryWeaponFactory.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const useMeshColors = hasFlag('--mesh-colors');

function runMagick(svg, outputPath) {
  const result = spawnSync('magick', ['svg:-', outputPath], {
    input: Buffer.from(svg),
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.toString('utf8').trim());
  }
}

function semanticColor(name) {
  if (useMeshColors) {
    let hash = 2166136261;
    for (const character of name) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return new THREE.Color().setHSL(
      ((hash >>> 0) % 360) / 360,
      0.58,
      0.48
    );
  }
  if (/stock|handguard/i.test(name)) return new THREE.Color(0x70442f);
  if (/scope/i.test(name)) return new THREE.Color(0x25282b);
  if (/clean|stack/i.test(name)) return new THREE.Color(0x58616a);
  if (/bolt/i.test(name)) return new THREE.Color(0x8a9197);
  if (/sight/i.test(name)) return new THREE.Color(0x444b51);
  if (/trigger/i.test(name)) return new THREE.Color(0x343a40);
  return new THREE.Color(0x596168);
}

function shadeColor(base, normal, cameraDirection) {
  const facing = Math.abs(normal.dot(cameraDirection));
  const light = 0.56 + facing * 0.32 + Math.max(0, normal.y) * 0.12;
  return `#${base.clone().multiplyScalar(light).getHexString()}`;
}

function viewDefinition(view) {
  const definitions = {
    'side-right': {
      viewpoint: 'weapon right (-X), looking toward +X',
      u: point => point.z,
      v: point => point.y,
      depth: point => point.x,
      camera: new THREE.Vector3(-1, 0, 0)
    },
    'side-left': {
      viewpoint: 'weapon left (+X), looking toward -X',
      u: point => 1.3 - point.z,
      v: point => point.y,
      depth: point => -point.x,
      camera: new THREE.Vector3(1, 0, 0)
    },
    top: {
      viewpoint: 'weapon top (+Y), looking down toward -Y',
      u: point => point.z,
      v: point => point.x,
      depth: point => -point.y,
      camera: new THREE.Vector3(0, 1, 0)
    },
    bottom: {
      viewpoint: 'weapon bottom (-Y), looking up toward +Y',
      u: point => point.z,
      v: point => -point.x,
      depth: point => point.y,
      camera: new THREE.Vector3(0, -1, 0)
    },
    front: {
      viewpoint: 'muzzle/front (+Z), looking toward -Z',
      u: point => -point.x,
      v: point => point.y,
      depth: point => -point.z,
      camera: new THREE.Vector3(0, 0, 1)
    },
    rear: {
      viewpoint: 'butt/rear (-Z), looking toward +Z',
      u: point => point.x,
      v: point => point.y,
      depth: point => point.z,
      camera: new THREE.Vector3(0, 0, -1)
    }
  };
  const definition = definitions[view];
  if (!definition) throw new Error(`Unknown orthographic view: ${view}`);
  return definition;
}

function collectTriangles(root, convertPoint) {
  const triangles = [];
  root.traverse(object => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position;
    const indices = object.geometry.index;
    const count = indices ? indices.count : positions.count;
    const source = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    for (let offset = 0; offset < count; offset += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const index = indices ? indices.getX(offset + corner) : offset + corner;
        source[corner].fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
        points[corner].copy(convertPoint(source[corner]));
      }
      const normal = edgeA.subVectors(points[1], points[0])
        .cross(edgeB.subVectors(points[2], points[0]))
        .normalize()
        .clone();
      triangles.push({
        points: points.map(point => point.clone()),
        normal,
        name: object.name,
        color: semanticColor(object.name)
      });
    }
  });
  return triangles;
}

function collectMeshInventory(root, convertPoint) {
  const inventory = [];
  root.traverse(object => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position;
    const bounds = new THREE.Box3();
    const sliceBounds = new Map();
    const sourcePoint = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 1) {
      sourcePoint.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      const point = convertPoint(sourcePoint);
      bounds.expandByPoint(point);
      const sliceStart = Math.floor((point.z + 1e-9) / 0.025) * 0.025;
      let slice = sliceBounds.get(sliceStart);
      if (!slice) {
        slice = { vertexCount: 0, bounds: new THREE.Box3() };
        sliceBounds.set(sliceStart, slice);
      }
      slice.vertexCount += 1;
      slice.bounds.expandByPoint(point);
    }
    const indexCount = object.geometry.index?.count ?? positions.count;
    const triangleCount = indexCount / 3;
    const componentParents = Array.from({ length: triangleCount }, (_, index) => index);
    const find = index => {
      let rootIndex = index;
      while (componentParents[rootIndex] !== rootIndex) rootIndex = componentParents[rootIndex];
      while (componentParents[index] !== index) {
        const next = componentParents[index];
        componentParents[index] = rootIndex;
        index = next;
      }
      return rootIndex;
    };
    const union = (first, second) => {
      const firstRoot = find(first);
      const secondRoot = find(second);
      if (firstRoot !== secondRoot) componentParents[secondRoot] = firstRoot;
    };
    const firstTriangleByPoint = new Map();
    const convertedPoint = new THREE.Vector3();
    const trianglePoints = [];
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const points = [];
      for (let corner = 0; corner < 3; corner += 1) {
        const offset = triangleIndex * 3 + corner;
        const vertexIndex = object.geometry.index?.getX(offset) ?? offset;
        sourcePoint.fromBufferAttribute(positions, vertexIndex).applyMatrix4(object.matrixWorld);
        convertedPoint.copy(convertPoint(sourcePoint));
        points.push(convertedPoint.clone());
        const key = convertedPoint.toArray().map(value => value.toFixed(6)).join(',');
        const priorTriangle = firstTriangleByPoint.get(key);
        if (priorTriangle === undefined) firstTriangleByPoint.set(key, triangleIndex);
        else union(triangleIndex, priorTriangle);
      }
      trianglePoints.push(points);
    }
    const componentMap = new Map();
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const rootIndex = find(triangleIndex);
      let component = componentMap.get(rootIndex);
      if (!component) {
        component = { triangleCount: 0, bounds: new THREE.Box3() };
        componentMap.set(rootIndex, component);
      }
      component.triangleCount += 1;
      for (const point of trianglePoints[triangleIndex]) component.bounds.expandByPoint(point);
    }
    const components = [...componentMap.values()]
      .map(component => ({
        triangleCount: component.triangleCount,
        bounds: {
          min: component.bounds.min.toArray(),
          max: component.bounds.max.toArray(),
          size: component.bounds.getSize(new THREE.Vector3()).toArray()
        }
      }))
      .sort((first, second) => first.bounds.min[2] - second.bounds.min[2]);
    inventory.push({
      name: object.name,
      parentName: object.parent?.name ?? null,
      materialNames: (Array.isArray(object.material) ? object.material : [object.material])
        .map(material => material?.name ?? null),
      groups: object.geometry.groups.map(group => ({ ...group })),
      vertexCount: positions.count,
      triangleCount,
      components,
      zSlices: [...sliceBounds.entries()]
        .sort(([first], [second]) => first - second)
        .map(([startZ, slice]) => ({
          startZ,
          endZ: startZ + 0.025,
          vertexCount: slice.vertexCount,
          bounds: {
            min: slice.bounds.min.toArray(),
            max: slice.bounds.max.toArray(),
            size: slice.bounds.getSize(new THREE.Vector3()).toArray()
          }
        })),
      bounds: {
        min: bounds.min.toArray(),
        max: bounds.max.toArray(),
        size: bounds.getSize(new THREE.Vector3()).toArray()
      }
    });
  });
  return inventory.sort((first, second) => first.bounds.min[2] - second.bounds.min[2]);
}

function renderView(triangles, {
  view,
  label,
  outputPath,
  zRange = null,
  width = 1600,
  height = 800
}) {
  const definition = viewDefinition(view);
  const visible = triangles.filter(triangle => {
    if (!zRange) return true;
    const centerZ = triangle.points.reduce((sum, point) => sum + point.z, 0) / 3;
    return centerZ >= zRange[0] && centerZ <= zRange[1];
  });
  const projected = visible.map(triangle => ({
    ...triangle,
    projected: triangle.points.map(point => ({
      u: definition.u(point),
      v: definition.v(point)
    })),
    depth: triangle.points.reduce((sum, point) => sum + definition.depth(point), 0) / 3
  // Every depth function above produces a smaller value for the surface nearest
  // its named viewpoint. SVG uses painter order, so emit far faces first and
  // nearest faces last. Reversing this order exposes the opposite side through
  // the model and makes top/front views appear mislabeled.
  })).sort((first, second) => second.depth - first.depth);

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const triangle of projected) {
    for (const point of triangle.projected) {
      minU = Math.min(minU, point.u);
      maxU = Math.max(maxU, point.u);
      minV = Math.min(minV, point.v);
      maxV = Math.max(maxV, point.v);
    }
  }
  const padding = 54;
  const titleHeight = 52;
  const scale = Math.min(
    (width - padding * 2) / Math.max(1e-6, maxU - minU),
    (height - padding * 2 - titleHeight) / Math.max(1e-6, maxV - minV)
  );
  const contentWidth = (maxU - minU) * scale;
  const contentHeight = (maxV - minV) * scale;
  const originX = (width - contentWidth) * 0.5 - minU * scale;
  const originY = titleHeight + (height - titleHeight - contentHeight) * 0.5 + maxV * scale;
  const paths = projected.map(triangle => {
    const points = triangle.projected.map(point => (
      `${(originX + point.u * scale).toFixed(2)},${(originY - point.v * scale).toFixed(2)}`
    )).join(' ');
    return `<polygon points="${points}" fill="${shadeColor(triangle.color, triangle.normal, definition.camera)}" stroke="#17212b" stroke-width="0.55" stroke-linejoin="round"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<rect width="100%" height="100%" fill="#b9cbd9"/>`
    + `<text x="24" y="30" font-family="sans-serif" font-size="20" font-weight="700" fill="#14202b">${label} - ${view}</text>`
    + `<text x="24" y="50" font-family="sans-serif" font-size="14" fill="#263746">viewed from ${definition.viewpoint}</text>`
    + `<g>${paths}</g></svg>`;
  runMagick(svg, outputPath);
  return { view, zRange, triangleCount: projected.length, outputPath };
}

const weaponName = readOption('--weapon', null);
const preserveFrame = hasFlag('--preserve-frame');
let inputPath = null;
let nodeName = readOption('--node', 'Lebel_Rifle_Uncovered');
const outputDirectory = path.resolve(readOption(
  '--output',
  path.join(process.env.TMPDIR || os.tmpdir(), 'threejs-cm-lebel-orthographic')
));
let root;
let sourceLength;
let metresPerSourceUnit;
let convertPoint;
let ownedMaterials = null;
if (weaponName) {
  ownedMaterials = {
    wood: new THREE.MeshBasicMaterial(),
    metal: new THREE.MeshBasicMaterial()
  };
  const rig = createFrance1940InfantryWeaponRig(weaponName, ownedMaterials);
  root = rig.userData.weaponModel;
  root.removeFromParent();
  root.updateMatrixWorld(true);
  nodeName = root.name;
  sourceLength = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).z;
  metresPerSourceUnit = 1;
  convertPoint = point => point.clone();
} else {
  inputPath = path.resolve(readOption('--input', 'reference/low_poly_lebel_1886.glb'));
  const bytes = fs.readFileSync(inputPath);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', resolve, reject);
  });
  root = gltf.scene.getObjectByName(nodeName);
  if (!root) throw new Error(`GLB node not found: ${nodeName}`);
  gltf.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  sourceLength = bounds.getSize(new THREE.Vector3()).z;
  if (preserveFrame) {
    metresPerSourceUnit = 1;
    convertPoint = point => point.clone();
  } else {
    metresPerSourceUnit = 1.30 / sourceLength;
    const nodeWorld = root.getWorldPosition(new THREE.Vector3());
    convertPoint = point => new THREE.Vector3(
      -point.x * metresPerSourceUnit,
      (point.y - nodeWorld.y) * metresPerSourceUnit,
      (bounds.max.z - point.z) * metresPerSourceUnit
    );
  }
}
const triangles = collectTriangles(root, convertPoint);
const meshInventory = collectMeshInventory(root, convertPoint);
fs.mkdirSync(outputDirectory, { recursive: true });
const fileStem = nodeName.replace(/[^a-zA-Z0-9_-]+/g, '_');

const jobs = [];
const addViews = (prefix, views, zRange, width, height) => {
  for (const view of views) jobs.push({ prefix, view, zRange, width, height });
};
if (!hasFlag('--inventory-only')) {
  addViews('full', ['side-right', 'side-left', 'top', 'bottom', 'front', 'rear'], null, 1600, 800);
  if (!hasFlag('--full-only')) {
    addViews('bolt', ['side-right', 'side-left', 'top', 'bottom', 'front', 'rear'], [0.27, 0.69], 1400, 900);
    addViews('muzzle', ['side-right', 'side-left', 'top', 'bottom', 'front', 'rear'], [1.12, 1.30], 1400, 900);
    if (nodeName === 'Lebel_Rifle_Covered' || weaponName?.includes('APX 1916')) {
      addViews('scope', ['side-right', 'side-left', 'top', 'bottom', 'front', 'rear'], [0.30, 0.70], 1400, 900);
    }
  }
}

const results = jobs.map(job => renderView(triangles, {
  ...job,
  label: `${nodeName} ${job.prefix}`,
  outputPath: path.join(outputDirectory, `${fileStem}-${job.prefix}-${job.view}.png`)
}));
const manifest = {
  inputPath,
  weaponName,
  nodeName,
  coordinatePolicy: preserveFrame
    ? 'source world frame preserved'
    : 'weapon frame normalized to a 1.30 metre +Z length',
  sourceLength,
  registeredLengthMetres: preserveFrame ? null : 1.30,
  metresPerSourceUnit,
  triangleCount: triangles.length,
  meshInventory,
  results
};
const manifestPath = path.join(outputDirectory, `${fileStem}-manifest.json`);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ...manifest, manifestPath }, null, 2)}\n`);
root.traverse(object => object.geometry?.dispose());
ownedMaterials?.wood.dispose();
ownedMaterials?.metal.dispose();
