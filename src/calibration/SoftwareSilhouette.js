import * as THREE from 'three';
import {
  createOrthographicFrame,
  viewMetersToCanvas,
  worldToViewMeters
} from './CalibrationMath.js';
import { isEffectivelyVisible } from './CalibrationModel.js';

const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchC = new THREE.Vector3();
const instanceMatrix = new THREE.Matrix4();
const worldMatrix = new THREE.Matrix4();
const RIGID_ENVELOPE_EXCLUDED_ROLES = new Set([
  'flexibleAttachment',
  'surfaceDetail',
  'weaponProjection'
]);

function includePoint(bounds, viewPoint, canvasPoint) {
  bounds.canvas.minX = Math.min(bounds.canvas.minX, canvasPoint.x);
  bounds.canvas.maxX = Math.max(bounds.canvas.maxX, canvasPoint.x);
  bounds.canvas.minY = Math.min(bounds.canvas.minY, canvasPoint.y);
  bounds.canvas.maxY = Math.max(bounds.canvas.maxY, canvasPoint.y);
  bounds.meters.minU = Math.min(bounds.meters.minU, viewPoint.u);
  bounds.meters.maxU = Math.max(bounds.meters.maxU, viewPoint.u);
  bounds.meters.minV = Math.min(bounds.meters.minV, viewPoint.v);
  bounds.meters.maxV = Math.max(bounds.meters.maxV, viewPoint.v);
}

function appendProjectedTriangle(
  path,
  bounds,
  positions,
  ia,
  ib,
  ic,
  matrix,
  view,
  frame,
  width,
  height,
  includeInBounds
) {
  scratchA.fromBufferAttribute(positions, ia).applyMatrix4(matrix);
  scratchB.fromBufferAttribute(positions, ib).applyMatrix4(matrix);
  scratchC.fromBufferAttribute(positions, ic).applyMatrix4(matrix);
  const viewA = worldToViewMeters(scratchA, view);
  const viewB = worldToViewMeters(scratchB, view);
  const viewC = worldToViewMeters(scratchC, view);
  const a = viewMetersToCanvas(viewA, frame, width, height);
  const b = viewMetersToCanvas(viewB, frame, width, height);
  const c = viewMetersToCanvas(viewC, frame, width, height);
  if (includeInBounds) {
    includePoint(bounds, viewA, a);
    includePoint(bounds, viewB, b);
    includePoint(bounds, viewC, c);
  }
  path.push(
    `M${a.x.toFixed(2)},${a.y.toFixed(2)}`
    + `L${b.x.toFixed(2)},${b.y.toFixed(2)}`
    + `L${c.x.toFixed(2)},${c.y.toFixed(2)}Z`
  );
}

function appendMeshTriangles(path, bounds, mesh, root, view, frame, width, height) {
  if (!isEffectivelyVisible(mesh, root.parent)) return 0;
  const geometry = mesh.geometry;
  const positions = geometry?.attributes?.position;
  if (!positions) return 0;
  const index = geometry.index;
  const instanceCount = mesh.isInstancedMesh ? mesh.count : 1;
  const includeInBounds = !RIGID_ENVELOPE_EXCLUDED_ROLES.has(
    mesh.userData.envelopeRole
  );
  let triangleCount = 0;

  for (let instance = 0; instance < instanceCount; instance++) {
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(instance, instanceMatrix);
      worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
    } else {
      worldMatrix.copy(mesh.matrixWorld);
    }
    const elementCount = index?.count ?? positions.count;
    for (let offset = 0; offset < elementCount; offset += 3) {
      appendProjectedTriangle(
        path,
        bounds,
        positions,
        index ? index.getX(offset) : offset,
        index ? index.getX(offset + 1) : offset + 1,
        index ? index.getX(offset + 2) : offset + 2,
        worldMatrix,
        view,
        frame,
        width,
        height,
        includeInBounds
      );
      triangleCount += 1;
    }
  }
  return triangleCount;
}

function completedBounds(bounds, triangleCount) {
  if (!triangleCount) return { canvas: null, meters: null };
  return {
    canvas: {
      minX: bounds.canvas.minX,
      maxX: bounds.canvas.maxX,
      minY: bounds.canvas.minY,
      maxY: bounds.canvas.maxY,
      width: bounds.canvas.maxX - bounds.canvas.minX,
      height: bounds.canvas.maxY - bounds.canvas.minY
    },
    meters: {
      minU: bounds.meters.minU,
      maxU: bounds.meters.maxU,
      minV: bounds.meters.minV,
      maxV: bounds.meters.maxV,
      width: bounds.meters.maxU - bounds.meters.minU,
      height: bounds.meters.maxV - bounds.meters.minV
    }
  };
}

function envelopeRect(dimensions, view, frame, width, height) {
  const horizontal = view === 'side' ? dimensions.length : dimensions.width;
  const minV = view === 'top' ? -dimensions.length * 0.5 : 0;
  const maxV = view === 'top' ? dimensions.length * 0.5 : dimensions.height;
  const topLeft = viewMetersToCanvas(
    { u: -horizontal * 0.5, v: maxV },
    frame,
    width,
    height
  );
  const bottomRight = viewMetersToCanvas(
    { u: horizontal * 0.5, v: minV },
    frame,
    width,
    height
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y
  };
}

export function renderVehicleSilhouetteSvg(root, dimensionsMeters, view, {
  width = 1400,
  height = 900,
  background = '#ffffff',
  silhouette = '#101820',
  showEnvelope = true,
  wireframe = false
} = {}) {
  root.updateMatrixWorld(true);
  const frame = createOrthographicFrame(dimensionsMeters, view, width / height);
  const path = [];
  const bounds = {
    canvas: {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity
    },
    meters: {
      minU: Infinity,
      maxU: -Infinity,
      minV: Infinity,
      maxV: -Infinity
    }
  };
  let triangleCount = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    triangleCount += appendMeshTriangles(
      path,
      bounds,
      object,
      root,
      view,
      frame,
      width,
      height
    );
  });
  const projectedBounds = completedBounds(bounds, triangleCount);
  const envelope = envelopeRect(dimensionsMeters, view, frame, width, height);
  const envelopeMarkup = showEnvelope
    ? `<rect x="${envelope.x.toFixed(2)}" y="${envelope.y.toFixed(2)}" width="${envelope.width.toFixed(2)}" height="${envelope.height.toFixed(2)}" fill="none" stroke="#dc2626" stroke-width="2" stroke-dasharray="10 7"/>`
    : '';
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${background}"/>`,
    `<g fill="${wireframe ? 'none' : silhouette}" stroke="${wireframe ? silhouette : 'none'}" stroke-width="${wireframe ? 0.75 : 0}">${path.map(d => `<path d="${d}"/>`).join('')}</g>`,
    envelopeMarkup,
    '</svg>',
    ''
  ].join('');
  return {
    svg,
    manifest: {
      view,
      width,
      height,
      dimensionsMeters: { ...dimensionsMeters },
      triangleCount,
      projectedBoundsCanvas: projectedBounds.canvas,
      projectedBoundsMeters: projectedBounds.meters,
      frame
    }
  };
}
