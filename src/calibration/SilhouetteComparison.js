import { sourceNormalizedToCanvas } from './CalibrationMath.js';

function checkedDimensions(rgba, width, height, label) {
  if (
    !(rgba instanceof Uint8ClampedArray)
    || !Number.isInteger(width)
    || !Number.isInteger(height)
    || width <= 0
    || height <= 0
    || rgba.length !== width * height * 4
  ) {
    throw new Error(`${label} buffer dimensions do not match`);
  }
}

function canvasSeed(point) {
  const x = Array.isArray(point) ? Number(point[0]) : Number(point?.x);
  const y = Array.isArray(point) ? Number(point[1]) : Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function resolveLineArtMaskCanvasPolicy(
  sourceMask,
  transform,
  imageWidth,
  imageHeight
) {
  const sourceSeeds = Array.isArray(sourceMask?.openRegionSeedPixels)
    ? sourceMask.openRegionSeedPixels
    : [];
  return {
    ...sourceMask,
    openRegionSeeds: sourceSeeds
      .map(canvasSeed)
      .filter(Boolean)
      .map(point => sourceNormalizedToCanvas(
        { x: point.x / imageWidth, y: point.y / imageHeight },
        transform,
        imageWidth,
        imageHeight
      ))
  };
}

function opaqueMask(mask, width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

/**
 * Converts a registered black-on-light technical elevation into a filled
 * silhouette. Exterior flood fill rejects open annotation lines; only closed
 * regions with actual interior area survive.
 */
export function createLineArtSilhouetteMask(rgba, width, height, {
  alphaThreshold = 8,
  luminanceThreshold = 210,
  boundaryDilation = 1,
  minimumInteriorPixels = 1,
  openRegionSeeds = [],
  componentPolicy = 'all'
} = {}) {
  checkedDimensions(rgba, width, height, 'Line-art');
  const pixelCount = width * height;
  const dark = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    if (rgba[offset + 3] <= alphaThreshold) continue;
    const luminance = rgba[offset] * 0.2126
      + rgba[offset + 1] * 0.7152
      + rgba[offset + 2] * 0.0722;
    if (luminance <= luminanceThreshold) dark[index] = 1;
  }

  const boundary = new Uint8Array(dark);
  const radius = Math.max(0, Math.floor(boundaryDilation));
  if (radius > 0) {
    for (let index = 0; index < pixelCount; index += 1) {
      if (!dark[index]) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          boundary[nextY * width + nextX] = 1;
        }
      }
    }
  }

  const exterior = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const enqueueExterior = index => {
    if (boundary[index] || exterior[index]) return;
    exterior[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueueExterior(x);
    enqueueExterior((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueExterior(y * width);
    enqueueExterior(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueueExterior(index - 1);
    if (x + 1 < width) enqueueExterior(index + 1);
    if (y > 0) enqueueExterior(index - width);
    if (y + 1 < height) enqueueExterior(index + width);
  }

  const candidate = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    if (!exterior[index]) candidate[index] = 1;
  }

  // Some elevations draw a ground line beneath an otherwise open vehicle.
  // A source-owned seed identifies that false enclosed region without making
  // the generic extractor aware of any particular drawing or vehicle.
  const openQueue = new Int32Array(pixelCount);
  const openInterior = new Uint8Array(pixelCount);
  const nearestOpenInterior = point => {
    const parsed = canvasSeed(point);
    if (!parsed) return -1;
    const originX = Math.round(parsed.x);
    const originY = Math.round(parsed.y);
    for (let radius = 0; radius <= 8; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = originX + dx;
          const y = originY + dy;
          if (x < 0 || x >= width || y < 0 || y >= height) continue;
          const index = y * width + x;
          if (candidate[index] && !boundary[index]) return index;
        }
      }
    }
    return -1;
  };
  for (const point of openRegionSeeds) {
    const seed = nearestOpenInterior(point);
    if (seed < 0 || !candidate[seed]) continue;
    let openHead = 0;
    let openTail = 0;
    candidate[seed] = 0;
    openInterior[seed] = 1;
    openQueue[openTail++] = seed;
    while (openHead < openTail) {
      const index = openQueue[openHead++];
      const x = index % width;
      const y = Math.floor(index / width);
      const enqueueOpen = next => {
        if (!candidate[next] || boundary[next]) return;
        candidate[next] = 0;
        openInterior[next] = 1;
        openQueue[openTail++] = next;
      };
      if (x > 0) enqueueOpen(index - 1);
      if (x + 1 < width) enqueueOpen(index + 1);
      if (y > 0) enqueueOpen(index - width);
      if (y + 1 < height) enqueueOpen(index + width);
    }
  }

  // Remove a ground stroke that is the only separator between the seeded
  // opening and the real exterior. Hull undersides and inner track edges have
  // vehicle interior on their opposite side, so they remain intact.
  const seamRadius = Math.max(2, radius * 2 + 1);
  for (let index = 0; index < pixelCount; index += 1) {
    if (!candidate[index] || !boundary[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    let touchesOpening = false;
    let touchesExterior = false;
    for (let dy = -seamRadius; dy <= seamRadius; dy += 1) {
      for (let dx = -seamRadius; dx <= seamRadius; dx += 1) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const next = nextY * width + nextX;
        touchesOpening ||= Boolean(openInterior[next]);
        touchesExterior ||= Boolean(exterior[next]);
      }
    }
    if (touchesOpening && touchesExterior) candidate[index] = 0;
  }

  const kept = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);
  const component = new Int32Array(pixelCount);
  const minimumInterior = Math.max(1, Math.floor(minimumInteriorPixels));
  let largestInteriorPixels = -1;
  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (!candidate[seed] || visited[seed]) continue;
    let componentHead = 0;
    let componentTail = 0;
    let interiorPixels = 0;
    component[componentTail++] = seed;
    visited[seed] = 1;
    while (componentHead < componentTail) {
      const index = component[componentHead++];
      if (!boundary[index] && rgba[index * 4 + 3] > alphaThreshold) {
        interiorPixels += 1;
      }
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (!candidate[next] || visited[next]) continue;
          visited[next] = 1;
          component[componentTail++] = next;
        }
      }
    }
    if (interiorPixels < minimumInterior) continue;
    if (componentPolicy === 'largest') {
      if (interiorPixels <= largestInteriorPixels) continue;
      kept.fill(0);
      largestInteriorPixels = interiorPixels;
    }
    for (let offset = 0; offset < componentTail; offset += 1) {
      kept[component[offset]] = 1;
    }
  }
  return opaqueMask(kept, width, height);
}

export function rasterizeSilhouetteTriangles(triangles, width, height) {
  if (!Array.isArray(triangles) || !(width > 0) || !(height > 0)) {
    throw new Error('Silhouette rasterizer requires triangles and positive dimensions');
  }
  const mask = new Uint8Array(width * height);
  const edge = (a, b, x, y) => (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
  for (const triangle of triangles) {
    if (!Array.isArray(triangle) || triangle.length !== 3) continue;
    const minX = Math.max(0, Math.floor(Math.min(...triangle.map(point => point.x))));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(...triangle.map(point => point.x))));
    const minY = Math.max(0, Math.floor(Math.min(...triangle.map(point => point.y))));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(...triangle.map(point => point.y))));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const sampleX = x + 0.5;
        const sampleY = y + 0.5;
        const first = edge(triangle[0], triangle[1], sampleX, sampleY);
        const second = edge(triangle[1], triangle[2], sampleX, sampleY);
        const third = edge(triangle[2], triangle[0], sampleX, sampleY);
        if (!((first < 0 || second < 0 || third < 0)
          && (first > 0 || second > 0 || third > 0))) {
          mask[y * width + x] = 1;
        }
      }
    }
  }
  return opaqueMask(mask, width, height);
}

export function compareSilhouetteMasks(sourceRgba, modelRgba, width, height, {
  alphaThreshold = 8
} = {}) {
  checkedDimensions(sourceRgba, width, height, 'Source silhouette');
  checkedDimensions(modelRgba, width, height, 'Model silhouette');
  const pixels = new Uint8ClampedArray(width * height * 4);
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

export const SILHOUETTE_REVIEW_MODES = Object.freeze([
  'difference',
  'overlay',
  'source',
  'model'
]);

export function resolveSilhouetteReviewOpacity(value, fallback = 0.72) {
  const parsed = typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : NaN;
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(1, parsed))
    : fallback;
}

export function composeSilhouetteReviewPixels(
  sourceRgba,
  modelRgba,
  width,
  height,
  mode = 'difference',
  { alphaThreshold = 8, modelOpacity = 0.72 } = {}
) {
  checkedDimensions(sourceRgba, width, height, 'Source silhouette');
  checkedDimensions(modelRgba, width, height, 'Model silhouette');
  if (!SILHOUETTE_REVIEW_MODES.includes(mode)) {
    throw new Error(`Unknown silhouette review mode: ${mode}`);
  }
  if (mode === 'difference') {
    return compareSilhouetteMasks(sourceRgba, modelRgba, width, height, {
      alphaThreshold
    }).pixels;
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  const safeOpacity = Math.max(0, Math.min(1, Number(modelOpacity)));
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const source = sourceRgba[offset + 3] > alphaThreshold;
    const model = modelRgba[offset + 3] > alphaThreshold;
    let color;
    if (mode === 'source') color = source ? [17, 24, 39, 255] : null;
    else if (mode === 'model') {
      color = model ? [17, 24, 39, Math.round(255 * safeOpacity)] : null;
    } else {
      color = source && model
        ? [17, 24, 39, 245]
        : source
          ? [239, 68, 68, 155]
          : model
            ? [6, 182, 212, Math.round(215 * safeOpacity)]
            : null;
    }
    if (color) pixels.set(color, offset);
  }
  return pixels;
}
