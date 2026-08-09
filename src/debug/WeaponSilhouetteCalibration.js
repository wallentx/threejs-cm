import * as THREE from 'three';

const scratch = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const worldMatrix = new THREE.Matrix4();
const instanceMatrix = new THREE.Matrix4();

function positiveFinite(value, label) {
  const parsed = Number(value);
  if (!(parsed > 0)) throw new Error(`${label} must be positive`);
  return parsed;
}

function finitePoint(point, label) {
  if (!Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value))) {
    throw new Error(`${label} must contain two finite coordinates`);
  }
  return point;
}

function normalizedRegistration(registration) {
  const imageSize = finitePoint(registration?.imageSize, 'Image size');
  const crop = registration?.cropPixels ?? {};
  const left = Number(crop.left);
  const top = Number(crop.top);
  const right = Number(crop.right);
  const bottom = Number(crop.bottom);
  if (![left, top, right, bottom].every(Number.isFinite)) {
    throw new Error('Calibration crop requires finite pixel edges');
  }
  const cropWidth = imageSize[0] - left - right;
  const cropHeight = imageSize[1] - top - bottom;
  if (!(cropWidth > 0 && cropHeight > 0)) throw new Error('Calibration crop is empty');
  const buttPixelX = Number(registration.buttPixelX);
  const muzzlePixelX = Number(registration.muzzlePixelX);
  const barrelAxisPixelY = Number(registration.barrelAxisPixelY);
  if (![buttPixelX, muzzlePixelX, barrelAxisPixelY].every(Number.isFinite)) {
    throw new Error('Calibration landmarks must be finite');
  }
  if (buttPixelX === muzzlePixelX) throw new Error('Calibration butt and muzzle must differ');
  return {
    imageSize,
    crop: { left, top, right, bottom, width: cropWidth, height: cropHeight },
    buttPixelX,
    forwardSign: Math.sign(muzzlePixelX - buttPixelX),
    barrelAxisPixelY,
    metresPerSourcePixel: positiveFinite(
      registration.metresPerSourcePixel,
      'Metres per source pixel'
    )
  };
}

export function projectWeaponSidePointToSource(point, registration) {
  const normalized = normalizedRegistration(registration);
  const sourceX = normalized.buttPixelX
    + normalized.forwardSign * point.z / normalized.metresPerSourcePixel;
  const sourceY = normalized.barrelAxisPixelY - point.y / normalized.metresPerSourcePixel;
  return Object.freeze({ x: sourceX, y: sourceY });
}

function sourceToCanvas(point, normalized, width, height) {
  return {
    x: ((point.x - normalized.crop.left) / normalized.crop.width) * width,
    y: ((point.y - normalized.crop.top) / normalized.crop.height) * height
  };
}

function appendMeshTriangles(triangles, mesh, root, normalized, width, height) {
  if (!mesh.visible || !mesh.geometry?.attributes?.position) return;
  if (mesh.userData.lodBand === 'proxy' || mesh.userData.lodBand === 'ui') return;
  let ancestor = mesh.parent;
  while (ancestor && ancestor !== root.parent) {
    if (!ancestor.visible) return;
    ancestor = ancestor.parent;
  }
  const positions = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const instanceCount = mesh.isInstancedMesh ? mesh.count : 1;
  for (let instance = 0; instance < instanceCount; instance += 1) {
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(instance, instanceMatrix);
      worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
    } else {
      worldMatrix.copy(mesh.matrixWorld);
    }
    const elementCount = index?.count ?? positions.count;
    for (let offset = 0; offset < elementCount; offset += 3) {
      const triangle = scratch.map((point, vertex) => {
        const bufferIndex = index ? index.getX(offset + vertex) : offset + vertex;
        point.fromBufferAttribute(positions, bufferIndex).applyMatrix4(worldMatrix);
        return sourceToCanvas({
          x: normalized.buttPixelX
            + normalized.forwardSign * point.z / normalized.metresPerSourcePixel,
          y: normalized.barrelAxisPixelY - point.y / normalized.metresPerSourcePixel
        }, normalized, width, height);
      });
      triangles.push(triangle.map(point => Object.freeze({ ...point })));
    }
  }
}

export function collectWeaponSideSilhouetteTriangles(root, registration, {
  width = 1600,
  height = null
} = {}) {
  const normalized = normalizedRegistration(registration);
  const outputWidth = Math.round(positiveFinite(width, 'Calibration width'));
  const outputHeight = height === null
    ? Math.max(1, Math.round(outputWidth * normalized.crop.height / normalized.crop.width))
    : Math.round(positiveFinite(height, 'Calibration height'));
  root.updateMatrixWorld(true);
  const triangles = [];
  root.traverse(object => {
    if (object.isMesh) {
      appendMeshTriangles(triangles, object, root, normalized, outputWidth, outputHeight);
    }
  });
  return Object.freeze({
    width: outputWidth,
    height: outputHeight,
    crop: Object.freeze({ ...normalized.crop }),
    triangles: Object.freeze(triangles)
  });
}

export function isolateConnectedAlphaComponent(
  rgba,
  width,
  height,
  seedX,
  seedY,
  alphaThreshold = 8
) {
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
    throw new Error('RGBA buffer dimensions do not match');
  }
  const x = Math.max(0, Math.min(width - 1, Math.round(seedX)));
  const y = Math.max(0, Math.min(height - 1, Math.round(seedY)));
  const seedIndex = y * width + x;
  if (rgba[seedIndex * 4 + 3] <= alphaThreshold) {
    throw new Error('Silhouette component seed is transparent');
  }
  const kept = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = seedIndex;
  kept[seedIndex] = 1;
  while (head < tail) {
    const index = queue[head++];
    const currentX = index % width;
    const currentY = Math.floor(index / width);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nextX = currentX + dx;
        const nextY = currentY + dy;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (kept[next] || rgba[next * 4 + 3] <= alphaThreshold) continue;
        kept[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  for (let index = 0; index < kept.length; index += 1) {
    if (kept[index]) continue;
    const offset = index * 4;
    rgba[offset] = 0;
    rgba[offset + 1] = 0;
    rgba[offset + 2] = 0;
    rgba[offset + 3] = 0;
  }
  return tail;
}

export function compareWeaponSilhouetteMasks(sourceRgba, modelRgba, width, height, {
  alphaThreshold = 8
} = {}) {
  const expectedLength = width * height * 4;
  if (
    !(sourceRgba instanceof Uint8ClampedArray)
    || !(modelRgba instanceof Uint8ClampedArray)
    || sourceRgba.length !== expectedLength
    || modelRgba.length !== expectedLength
  ) throw new Error('Silhouette comparison buffers do not match');
  const pixels = new Uint8ClampedArray(expectedLength);
  let sourcePixels = 0;
  let modelPixels = 0;
  let overlapPixels = 0;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const source = sourceRgba[offset + 3] > alphaThreshold;
    const model = modelRgba[offset + 3] > alphaThreshold;
    if (source) sourcePixels += 1;
    if (model) modelPixels += 1;
    if (source && model) overlapPixels += 1;
    const color = source && model
      ? [17, 24, 39, 255]
      : source
        ? [239, 68, 68, 235]
        : model
          ? [6, 182, 212, 235]
          : [0, 0, 0, 0];
    pixels.set(color, offset);
  }
  const unionPixels = sourcePixels + modelPixels - overlapPixels;
  return Object.freeze({
    pixels,
    sourcePixels,
    modelPixels,
    overlapPixels,
    sourceOnlyPixels: sourcePixels - overlapPixels,
    modelOnlyPixels: modelPixels - overlapPixels,
    unionPixels,
    iou: unionPixels > 0 ? overlapPixels / unionPixels : 1
  });
}
