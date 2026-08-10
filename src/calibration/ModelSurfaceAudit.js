import * as THREE from 'three';
import { isEffectivelyVisible } from './CalibrationModel.js';

export const MODEL_SURFACE_AUDIT_VIEWS = Object.freeze([
  Object.freeze({ id: 'front-high', direction: Object.freeze([0, 0.28, 1]) }),
  Object.freeze({ id: 'front-left-high', direction: Object.freeze([0.72, 0.32, 1]) }),
  Object.freeze({ id: 'left-high', direction: Object.freeze([1, 0.28, 0]) }),
  Object.freeze({ id: 'rear-left-high', direction: Object.freeze([0.72, 0.32, -1]) }),
  Object.freeze({ id: 'rear-high', direction: Object.freeze([0, 0.28, -1]) }),
  Object.freeze({ id: 'rear-right-high', direction: Object.freeze([-0.72, 0.32, -1]) }),
  Object.freeze({ id: 'right-high', direction: Object.freeze([-1, 0.28, 0]) }),
  Object.freeze({ id: 'front-right-high', direction: Object.freeze([-0.72, 0.32, 1]) }),
  Object.freeze({ id: 'front-left-low', direction: Object.freeze([0.82, -0.12, 1]) }),
  Object.freeze({ id: 'rear-right-low', direction: Object.freeze([-0.82, -0.12, -1]) })
]);

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchC = new THREE.Vector3();
const scratchEdgeA = new THREE.Vector3();
const scratchEdgeB = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchCentroid = new THREE.Vector3();
const scratchInstance = new THREE.Matrix4();
const scratchWorld = new THREE.Matrix4();

export function auditClosedGeometry(geometry, {
  indexStart = 0,
  indexCount = geometry.index?.count ?? geometry.attributes.position?.count ?? 0,
  weldTolerance = 1e-5
} = {}) {
  const position = geometry.attributes?.position;
  if (!position) throw new TypeError('closed-geometry audit requires positions');
  if (indexStart < 0 || indexCount < 0 || indexStart + indexCount > (
    geometry.index?.count ?? position.count
  ) || indexCount % 3 !== 0) {
    throw new RangeError('closed-geometry audit requires a complete triangle range');
  }
  const inverseTolerance = 1 / weldTolerance;
  const weldedByKey = new Map();
  const weldedIndex = sourceIndex => {
    const key = [
      position.getX(sourceIndex),
      position.getY(sourceIndex),
      position.getZ(sourceIndex)
    ].map(value => Math.round(value * inverseTolerance)).join(',');
    let index = weldedByKey.get(key);
    if (index === undefined) {
      index = weldedByKey.size;
      weldedByKey.set(key, index);
    }
    return index;
  };
  const triangleTotal = indexCount / 3;
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
  const edges = new Map();
  const triangleVertices = [];
  for (let triangle = 0; triangle < triangleTotal; triangle += 1) {
    const vertices = [0, 1, 2].map(corner => {
      const offset = indexStart + triangle * 3 + corner;
      const sourceIndex = geometry.index?.getX(offset) ?? offset;
      return weldedIndex(sourceIndex);
    });
    triangleVertices.push(vertices);
    for (let edge = 0; edge < 3; edge += 1) {
      const start = vertices[edge];
      const end = vertices[(edge + 1) % 3];
      const key = start < end ? `${start},${end}` : `${end},${start}`;
      const records = edges.get(key) ?? [];
      records.push(triangle);
      edges.set(key, records);
    }
  }
  for (const records of edges.values()) {
    for (let index = 1; index < records.length; index += 1) {
      join(records[0], records[index]);
    }
  }
  const componentsByRoot = new Map();
  for (let triangle = 0; triangle < triangleTotal; triangle += 1) {
    const root = find(triangle);
    let component = componentsByRoot.get(root);
    if (!component) {
      component = { triangles: 0, vertices: new Set(), edges: new Set() };
      componentsByRoot.set(root, component);
    }
    component.triangles += 1;
    for (const vertex of triangleVertices[triangle]) component.vertices.add(vertex);
  }
  for (const [key, records] of edges) {
    const root = find(records[0]);
    componentsByRoot.get(root)?.edges.add(key);
  }
  const boundaryEdgeCount = [...edges.values()].filter(records => records.length === 1).length;
  const nonManifoldEdgeCount = [...edges.values()].filter(records => records.length > 2).length;
  const closed = boundaryEdgeCount === 0 && nonManifoldEdgeCount === 0;
  const components = [...componentsByRoot.values()].map(component => {
    const eulerCharacteristic = component.vertices.size
      - component.edges.size
      + component.triangles;
    return Object.freeze({
      vertexCount: component.vertices.size,
      edgeCount: component.edges.size,
      triangleCount: component.triangles,
      eulerCharacteristic,
      genus: closed ? Math.max(0, Math.round((2 - eulerCharacteristic) / 2)) : null
    });
  });
  return Object.freeze({
    triangleCount: triangleTotal,
    weldedVertexCount: weldedByKey.size,
    edgeCount: edges.size,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    closed,
    componentCount: components.length,
    genus: closed ? components.reduce((sum, component) => sum + component.genus, 0) : null,
    components: Object.freeze(components)
  });
}

function edgeFunction(a, b, x, y) {
  return (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
}

function rasterizeTriangle(mask, width, height, a, b, c) {
  const area = edgeFunction(a, b, c.x, c.y);
  if (Math.abs(area) < 1e-8) return;
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = edgeFunction(b, c, px, py);
      const w1 = edgeFunction(c, a, px, py);
      const w2 = edgeFunction(a, b, px, py);
      if (
        (area > 0 && w0 >= 0 && w1 >= 0 && w2 >= 0)
        || (area < 0 && w0 <= 0 && w1 <= 0 && w2 <= 0)
      ) mask[y * width + x] = 1;
    }
  }
}

function rasterizeDiagnosticTriangle(
  rgba,
  depthBuffer,
  ownerBuffer,
  width,
  height,
  a,
  b,
  c,
  color,
  owner
) {
  const area = edgeFunction(a, b, c.x, c.y);
  if (Math.abs(area) < 1e-8) return;
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = edgeFunction(b, c, px, py);
      const w1 = edgeFunction(c, a, px, py);
      const w2 = edgeFunction(a, b, px, py);
      if (
        !((area > 0 && w0 >= 0 && w1 >= 0 && w2 >= 0)
          || (area < 0 && w0 <= 0 && w1 <= 0 && w2 <= 0))
      ) continue;
      const depth = (w0 * a.depth + w1 * b.depth + w2 * c.depth) / area;
      const index = y * width + x;
      if (depth <= depthBuffer[index]) continue;
      depthBuffer[index] = depth;
      ownerBuffer[index] = owner;
      const pixel = index * 4;
      rgba[pixel] = color[0];
      rgba[pixel + 1] = color[1];
      rgba[pixel + 2] = color[2];
      rgba[pixel + 3] = 255;
    }
  }
}

function cameraFrame(direction, dimensions, width, height) {
  const towardCamera = new THREE.Vector3(...direction).normalize();
  const right = new THREE.Vector3().crossVectors(WORLD_UP, towardCamera);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  else right.normalize();
  const up = new THREE.Vector3().crossVectors(towardCamera, right).normalize();
  const target = new THREE.Vector3(0, dimensions.height * 0.5, 0);
  const radius = Math.hypot(dimensions.width, dimensions.height, dimensions.length) * 0.56;
  const aspect = width / height;
  return {
    towardCamera,
    right,
    up,
    target,
    halfWidth: radius * Math.max(1, aspect),
    halfHeight: radius * Math.max(1, 1 / aspect)
  };
}

function project(point, frame, width, height) {
  scratchA.subVectors(point, frame.target);
  return {
    x: (scratchA.dot(frame.right) / frame.halfWidth * 0.5 + 0.5) * width,
    y: (0.5 - scratchA.dot(frame.up) / frame.halfHeight * 0.5) * height,
    depth: scratchA.dot(frame.towardCamera)
  };
}

const DIAGNOSTIC_SLOT_COLORS = Object.freeze({
  paint: Object.freeze([104, 119, 70]),
  wheel: Object.freeze([91, 104, 63]),
  track: Object.freeze([48, 52, 50]),
  metal: Object.freeze([72, 77, 75]),
  canvas: Object.freeze([119, 111, 77]),
  wood: Object.freeze([104, 80, 57]),
  glass: Object.freeze([117, 151, 157]),
  net: Object.freeze([59, 69, 48]),
  'light-white': Object.freeze([225, 215, 181]),
  'light-red': Object.freeze([145, 45, 36])
});

export function renderModelSurfaceDiagnostic(root, dimensions, view, {
  width = 256,
  height = 256
} = {}) {
  const frame = cameraFrame(view.direction, dimensions, width, height);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const depthBuffer = new Float64Array(width * height);
  const ownerBuffer = new Array(width * height).fill(null);
  depthBuffer.fill(-Infinity);
  for (let index = 0; index < width * height; index += 1) {
    const pixel = index * 4;
    rgba[pixel] = 84;
    rgba[pixel + 1] = 112;
    rgba[pixel + 2] = 135;
    rgba[pixel + 3] = 255;
  }
  const lightDirection = new THREE.Vector3(0.45, 0.82, 0.35).normalize();
  let triangleCount = 0;
  visitTriangles(root, (mesh, sourcePart, a, b, c) => {
    scratchNormal.crossVectors(
      scratchEdgeA.subVectors(b, a),
      scratchEdgeB.subVectors(c, a)
    );
    if (scratchNormal.dot(frame.towardCamera) <= 0) return;
    triangleCount += 1;
    scratchNormal.normalize();
    const slot = mesh.userData.sourceMaterialSlot
      ?? mesh.material?.userData?.vehicleMaterialSlot
      ?? 'metal';
    const base = DIAGNOSTIC_SLOT_COLORS[slot] ?? DIAGNOSTIC_SLOT_COLORS.metal;
    const light = 0.48
      + Math.max(0, scratchNormal.dot(lightDirection)) * 0.42
      + Math.max(0, scratchNormal.dot(frame.towardCamera)) * 0.10;
    const color = base.map(channel => Math.min(255, Math.round(channel * light)));
    const owner = sourcePart
      ? `${mesh.userData.sourceAssemblyKey ?? mesh.name}:${sourcePart.sourceNodeName}`
      : mesh.userData.sourceAssemblyKey ?? mesh.name;
    rasterizeDiagnosticTriangle(
      rgba,
      depthBuffer,
      ownerBuffer,
      width,
      height,
      project(a, frame, width, height),
      project(b, frame, width, height),
      project(c, frame, width, height),
      color,
      owner
    );
  });
  return Object.freeze({
    view: view.id,
    width,
    height,
    triangleCount,
    rgba,
    owners: Object.freeze(ownerBuffer)
  });
}

function sourcePartForOffset(mesh, offset) {
  const parts = mesh.userData.sourceParts ?? mesh.geometry?.userData?.sourceParts;
  if (!Array.isArray(parts)) return null;
  let low = 0;
  let high = parts.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const part = parts[middle];
    if (offset < part.indexStart) high = middle - 1;
    else if (offset >= part.indexStart + part.indexCount) low = middle + 1;
    else return part;
  }
  return null;
}

function visitTriangles(root, callback) {
  root.updateMatrixWorld(true);
  root.traverse(mesh => {
    if (!mesh.isMesh || !isEffectivelyVisible(mesh, root.parent)) return;
    const position = mesh.geometry?.attributes?.position;
    if (!position) return;
    const index = mesh.geometry.index;
    const instanceCount = mesh.isInstancedMesh ? mesh.count : 1;
    for (let instance = 0; instance < instanceCount; instance += 1) {
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(instance, scratchInstance);
        scratchWorld.multiplyMatrices(mesh.matrixWorld, scratchInstance);
      } else scratchWorld.copy(mesh.matrixWorld);
      const elementCount = index?.count ?? position.count;
      for (let offset = 0; offset < elementCount; offset += 3) {
        scratchA.fromBufferAttribute(position, index ? index.getX(offset) : offset)
          .applyMatrix4(scratchWorld);
        scratchB.fromBufferAttribute(position, index ? index.getX(offset + 1) : offset + 1)
          .applyMatrix4(scratchWorld);
        scratchC.fromBufferAttribute(position, index ? index.getX(offset + 2) : offset + 2)
          .applyMatrix4(scratchWorld);
        callback(mesh, sourcePartForOffset(mesh, offset), scratchA, scratchB, scratchC);
      }
    }
  });
}

export function auditModelSurfaceCoverage(root, dimensions, view, {
  width = 192,
  height = 192
} = {}) {
  const frame = cameraFrame(view.direction, dimensions, width, height);
  const frontMask = new Uint8Array(width * height);
  const twoSidedMask = new Uint8Array(width * height);
  const backfaceMasks = new Map();
  let triangleCount = 0;
  let backFacingTriangleCount = 0;
  visitTriangles(root, (mesh, sourcePart, a, b, c) => {
    triangleCount += 1;
    scratchNormal.crossVectors(
      scratchEdgeA.subVectors(b, a),
      scratchEdgeB.subVectors(c, a)
    );
    scratchCentroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const facing = scratchNormal.dot(frame.towardCamera);
    const pa = project(a, frame, width, height);
    const pb = project(b, frame, width, height);
    const pc = project(c, frame, width, height);
    rasterizeTriangle(twoSidedMask, width, height, pa, pb, pc);
    if (facing > 0) {
      rasterizeTriangle(frontMask, width, height, pa, pb, pc);
    } else {
      backFacingTriangleCount += 1;
      const assemblyKey = mesh.userData.sourceAssemblyKey ?? mesh.name ?? 'unnamed';
      const key = sourcePart
        ? `${assemblyKey}:${sourcePart.sourceNodeName}`
        : assemblyKey;
      let mask = backfaceMasks.get(key);
      if (!mask) {
        mask = new Uint8Array(width * height);
        backfaceMasks.set(key, mask);
      }
      rasterizeTriangle(mask, width, height, pa, pb, pc);
    }
  });
  let frontPixelCount = 0;
  let twoSidedPixelCount = 0;
  let doubleOnlyPixelCount = 0;
  const doubleOnlyMask = new Uint8Array(width * height);
  for (let index = 0; index < frontMask.length; index += 1) {
    frontPixelCount += frontMask[index];
    twoSidedPixelCount += twoSidedMask[index];
    if (twoSidedMask[index] && !frontMask[index]) {
      doubleOnlyMask[index] = 1;
      doubleOnlyPixelCount += 1;
    }
  }
  const assemblyLeaks = [...backfaceMasks.entries()].map(([key, mask]) => [
    key,
    mask.reduce((sum, value, index) => (
      sum + (value && doubleOnlyMask[index] ? 1 : 0)
    ), 0)
  ]).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
  return Object.freeze({
    view: view.id,
    width,
    height,
    triangleCount,
    backFacingTriangleCount,
    frontPixelCount,
    twoSidedPixelCount,
    doubleOnlyPixelCount,
    doubleOnlyRatio: twoSidedPixelCount > 0
      ? doubleOnlyPixelCount / twoSidedPixelCount
      : 0,
    frontMask,
    doubleOnlyMask,
    assemblyLeaks: Object.freeze(assemblyLeaks)
  });
}

export function surfaceAuditRgba(audit) {
  const rgba = new Uint8ClampedArray(audit.width * audit.height * 4);
  for (let index = 0; index < audit.frontMask.length; index += 1) {
    const pixel = index * 4;
    if (audit.doubleOnlyMask[index]) {
      rgba[pixel] = 0;
      rgba[pixel + 1] = 255;
      rgba[pixel + 2] = 255;
    } else if (audit.frontMask[index]) {
      rgba[pixel] = 215;
      rgba[pixel + 1] = 222;
      rgba[pixel + 2] = 203;
    } else {
      rgba[pixel] = 255;
      rgba[pixel + 1] = 0;
      rgba[pixel + 2] = 255;
    }
    rgba[pixel + 3] = 255;
  }
  return rgba;
}
