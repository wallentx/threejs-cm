import * as THREE from 'three';
import { TERRAIN_SCALE } from './TerrainScale.js';
import { StaticCollisionWorld } from '../simulation/collision/StaticCollisionWorld.js';
import {
  DestructibleLinearObstacleSystem
} from '../simulation/terrain/DestructibleLinearObstacleSystem.js';
import {
  createTerrainSightOccluderSnapshot
} from '../simulation/terrain/TerrainSightOccluderSnapshot.js';

const QUAD_UVS = [
  0, 0,
  1, 0,
  1, 1,
  0, 1
];

// These control only the one-time visual surface tessellation. Terrain height,
// collision, and navigation continue to use getHeightAt() independently.
const RIVER_BANK_X_SUBDIVISIONS = 60;
const RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS = 6;
const RIVER_BANK_SURFACE_OFFSET = 0.03;
const RIVER_BANK_RENDERER_APPROXIMATION =
  'renderer-only bounded terrain samples and surface offset to prevent z-fighting';
const OOB_EXTENSION_METERS = 550;
const OOB_FADE_START_METERS = 160;

function deterministicFoliageUnit(id, channel) {
  let hash = 2166136261;
  const value = `${id}:${channel}`;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function foliagePresentation(entry) {
  return {
    rotationY: deterministicFoliageUnit(entry.id, 'rotation') * Math.PI * 2,
    scale: 0.88 + deterministicFoliageUnit(entry.id, 'scale') * 0.24
  };
}

function pointInPolygonXZ([x, z], polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++) {
    const [x0, z0] = polygon[index];
    const [x1, z1] = polygon[previous];
    if (
      (z0 > z) !== (z1 > z)
      && x < (x1 - x0) * (z - z0) / (z1 - z0) + x0
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function pointToSegmentDistanceXZ([x, z], [x0, z0], [x1, z1]) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0
    ? THREE.MathUtils.clamp(((x - x0) * dx + (z - z0) * dz) / lengthSq, 0, 1)
    : 0;
  return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
}

function surfaceLayerWorldPolygon(mapDescriptor, layer) {
  const [textureWidth, textureHeight] = mapDescriptor.surfaces.textureResolution;
  const source = layer.polygon ?? (layer.rect
    ? [
        [layer.rect[0], layer.rect[1]],
        [layer.rect[0] + layer.rect[2], layer.rect[1]],
        [layer.rect[0] + layer.rect[2], layer.rect[1] + layer.rect[3]],
        [layer.rect[0], layer.rect[1] + layer.rect[3]]
      ]
    : []);
  return source.map(([textureX, textureY]) => [
    (textureX / textureWidth - 0.5) * mapDescriptor.dimensions.width,
    (0.5 - textureY / textureHeight) * mapDescriptor.dimensions.depth
  ]);
}

function uniqueSortedCoordinates(values) {
  return [...new Set(values.map(value => Number(value.toFixed(9))))]
    .sort((left, right) => left - right);
}

function createRiverBankZCoordinates(river) {
  if (!river) return [];
  const coordinates = [];
  for (const direction of [-1, 1]) {
    const innerZ = river.centerZ
      + direction * river.waterWidth * 0.5;
    const outerZ = river.centerZ
      + direction * river.cutWidth * 0.5;
    for (
      let row = 0;
      row <= RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS;
      row++
    ) {
      coordinates.push(THREE.MathUtils.lerp(
        innerZ,
        outerZ,
        row / RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS
      ));
    }
  }
  return coordinates;
}

function createTerrainGridCoordinates({
  width,
  depth,
  segments,
  additionalZCoordinates = []
}) {
  const xCoordinates = Array.from(
    { length: segments + 1 },
    (_, index) => -width * 0.5 + width * index / segments
  );
  const zCoordinates = uniqueSortedCoordinates([
    ...Array.from(
      { length: segments + 1 },
      (_, index) => -depth * 0.5 + depth * index / segments
    ),
    ...additionalZCoordinates
  ]);
  return { x: xCoordinates, z: zCoordinates };
}

function createTerrainGridGeometry(options) {
  const {
    width,
    depth
  } = options;
  const {
    x: xCoordinates,
    z: zCoordinates
  } = createTerrainGridCoordinates(options);
  const positions = [];
  const uvs = [];
  for (const z of zCoordinates) {
    for (const x of xCoordinates) {
      positions.push(x, 0, z);
      uvs.push((x + width * 0.5) / width, (z + depth * 0.5) / depth);
    }
  }
  const indices = [];
  const columns = xCoordinates.length;
  for (let row = 0; row < zCoordinates.length - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const southWest = row * columns + column;
      const southEast = southWest + 1;
      const northWest = southWest + columns;
      const northEast = northWest + 1;
      indices.push(
        southWest,
        northWest,
        southEast,
        southEast,
        northWest,
        northEast
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.userData.gridCoordinates = {
    x: xCoordinates,
    z: zCoordinates
  };
  return geometry;
}

export function createSurroundingTerrainGeometry({
  width,
  depth,
  xCoordinates,
  zCoordinates,
  getHeightAt,
  river = null,
  bridge = null,
  extensionMeters = 380,
  marginSegments = 16
}) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const outerXMin = -halfWidth - extensionMeters;
  const outerZMin = -halfDepth - extensionMeters;

  const leftX = [];
  for (let i = 0; i < marginSegments; i++) {
    leftX.push(outerXMin + (i / marginSegments) * extensionMeters);
  }
  const rightX = [];
  for (let i = 1; i <= marginSegments; i++) {
    rightX.push(halfWidth + (i / marginSegments) * extensionMeters);
  }
  const allX = [...leftX, ...xCoordinates, ...rightX];

  const bottomZ = [];
  for (let i = 0; i < marginSegments; i++) {
    bottomZ.push(outerZMin + (i / marginSegments) * extensionMeters);
  }
  const topZ = [];
  for (let i = 1; i <= marginSegments; i++) {
    topZ.push(halfDepth + (i / marginSegments) * extensionMeters);
  }
  const allZ = [...bottomZ, ...zCoordinates, ...topZ];

  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  const defaultBaseR = 0.13;
  const defaultBaseG = 0.21;
  const defaultBaseB = 0.06;

  const riverWaterR = 0.08, riverWaterG = 0.16, riverWaterB = 0.24;
  const riverBankR = 0.22, riverBankG = 0.20, riverBankB = 0.12;
  const roadR = 0.26, roadG = 0.23, roadB = 0.16;

  const vertexIndices = new Int32Array(allZ.length * allX.length);
  vertexIndices.fill(-1);

  const lerp = (a, b, t) => a + (b - a) * t;

  let vertexCount = 0;
  for (let row = 0; row < allZ.length; row++) {
    const z = allZ[row];
    for (let col = 0; col < allX.length; col++) {
      const x = allX[col];

      const isStrictInterior = (x > -halfWidth + 0.001 && x < halfWidth - 0.001)
        && (z > -halfDepth + 0.001 && z < halfDepth - 0.001);

      if (isStrictInterior) {
        continue;
      }

      const dx = Math.max(0, Math.abs(x) - halfWidth);
      const dz = Math.max(0, Math.abs(z) - halfDepth);
      const dist = Math.hypot(dx, dz);

      const y = getHeightAt(x, z);
      positions.push(x, y, z);
      uvs.push((x + halfWidth) / width, (z + halfDepth) / depth);

      let baseR = defaultBaseR;
      let baseG = defaultBaseG;
      let baseB = defaultBaseB;

      if (river && Number.isFinite(river.centerZ) && Number.isFinite(river.cutWidth)) {
        const distZ = Math.abs(z - river.centerZ);
        const waterHalf = (river.waterWidth ?? 12) * 0.5;
        const cutHalf = river.cutWidth * 0.5;
        if (distZ <= waterHalf) {
          baseR = riverWaterR;
          baseG = riverWaterG;
          baseB = riverWaterB;
        } else if (distZ <= cutHalf) {
          const bankT = (distZ - waterHalf) / (cutHalf - waterHalf);
          baseR = lerp(riverWaterR, riverBankR, bankT);
          baseG = lerp(riverWaterG, riverBankG, bankT);
          baseB = lerp(riverWaterB, riverBankB, bankT);
        } else if (distZ <= cutHalf + 8) {
          const transT = (distZ - cutHalf) / 8;
          baseR = lerp(riverBankR, defaultBaseR, transT);
          baseG = lerp(riverBankG, defaultBaseG, transT);
          baseB = lerp(riverBankB, defaultBaseB, transT);
        }
      }

      const roadCenterX = bridge?.centerX ?? 0;
      const roadHalfWidth = 5.5;
      const shoulderHalfWidth = 9.0;
      const distX = Math.abs(x - roadCenterX);
      const inRiverBed = river && Math.abs(z - river.centerZ) <= (river.waterWidth ?? 12) * 0.5;
      if (!inRiverBed && distX <= shoulderHalfWidth) {
        if (distX <= roadHalfWidth) {
          baseR = roadR;
          baseG = roadG;
          baseB = roadB;
        } else {
          const roadT = (distX - roadHalfWidth) / (shoulderHalfWidth - roadHalfWidth);
          baseR = lerp(roadR, baseR, roadT);
          baseG = lerp(roadG, baseG, roadT);
          baseB = lerp(roadB, baseB, roadT);
        }
      }

      // Gradual edge transparency: 100% opaque near map (dist <= 160m), smoothly fading to 0% at perimeter (550m)
      const fadeStart = OOB_FADE_START_METERS;
      const fadeEnd = extensionMeters;
      let alpha = 1.0;
      if (dist > fadeStart) {
        const t = Math.min(1.0, (dist - fadeStart) / (fadeEnd - fadeStart));
        alpha = 1.0 - t * t * (3 - 2 * t);
      }

      colors.push(baseR, baseG, baseB, alpha);

      vertexIndices[row * allX.length + col] = vertexCount++;
    }
  }

  for (let row = 0; row < allZ.length - 1; row++) {
    for (let col = 0; col < allX.length - 1; col++) {
      const sw = vertexIndices[row * allX.length + col];
      const se = vertexIndices[row * allX.length + (col + 1)];
      const nw = vertexIndices[(row + 1) * allX.length + col];
      const ne = vertexIndices[(row + 1) * allX.length + (col + 1)];

      if (sw === -1 || se === -1 || nw === -1 || ne === -1) {
        continue;
      }

      indices.push(
        sw,
        nw,
        se,
        se,
        nw,
        ne
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createOobRiverWaterGeometry({
  channelWidth,
  extensionMeters,
  side,
  widthSegments = 24
}) {
  const geometry = new THREE.PlaneGeometry(
    extensionMeters,
    channelWidth,
    widthSegments,
    1
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  const halfExtension = extensionMeters * 0.5;
  for (let index = 0; index < positions.count; index++) {
    const localX = positions.getX(index);
    const outwardDistance = side === 'east'
      ? localX + halfExtension
      : halfExtension - localX;
    const fadeProgress = THREE.MathUtils.clamp(
      (outwardDistance - OOB_FADE_START_METERS)
        / (extensionMeters - OOB_FADE_START_METERS),
      0,
      1
    );
    const alpha = 1 - fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
    colors.push(1, 1, 1, alpha);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createAtmosphericSkyDomeGeometry({
  radius = 1400,
  widthSegments = 32,
  heightSegments = 20
} = {}) {
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  const pos = geometry.attributes.position;
  const colors = [];

  const zenithR = 0.27, zenithG = 0.48, zenithB = 0.62;
  const midR = 0.45, midG = 0.64, midB = 0.73;
  const horizonR = 0.61, horizonG = 0.73, horizonB = 0.76;
  const groundR = 0.55, groundG = 0.66, groundB = 0.69;

  const lerp = (a, b, t) => a + (b - a) * t;

  for (let i = 0; i < pos.count; i++) {
    const yNormalized = pos.getY(i) / radius;

    let r, g, b;
    if (yNormalized >= 0.35) {
      const t = THREE.MathUtils.clamp((yNormalized - 0.35) / 0.65, 0, 1);
      r = lerp(midR, zenithR, t);
      g = lerp(midG, zenithG, t);
      b = lerp(midB, zenithB, t);
    } else if (yNormalized >= 0.0) {
      const t = THREE.MathUtils.clamp(yNormalized / 0.35, 0, 1);
      r = lerp(horizonR, midR, t);
      g = lerp(horizonG, midG, t);
      b = lerp(horizonB, midB, t);
    } else {
      const t = THREE.MathUtils.clamp(-yNormalized / 0.3, 0, 1);
      r = lerp(horizonR, groundR, t);
      g = lerp(horizonG, groundG, t);
      b = lerp(horizonB, groundB, t);
    }
    colors.push(r, g, b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function resolveSkyPanoramaSize(qualityTier = 'high') {
  if (qualityTier === 'ultra') return { width: 4096, height: 2048 };
  if (qualityTier === 'low') return { width: 1024, height: 512 };
  return { width: 2048, height: 1024 };
}

export function createGoogleEarthAtmosphericSkyTexture({
  qualityTier = 'high'
} = {}) {
  if (typeof document === 'undefined') return null;
  const { width: w, height: h } = resolveSkyPanoramaSize(qualityTier);
  const scaleX = w / 4096;
  const scaleY = h / 2048;
  const detailScale = Math.min(scaleX, scaleY);
  const margin = Math.max(32, Math.round(128 * scaleX));
  const totalW = w + margin * 2;

  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = totalW;
  renderCanvas.height = h;
  const ctx = renderCanvas.getContext('2d');
  if (!ctx) return null;

  const horizonY = h * 0.5;

  // 1. Physically-inspired atmospheric Rayleigh scattering sky dome gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0.00, '#1d4873'); // Deep Rayleigh zenith blue
  skyGrad.addColorStop(0.15, '#2e6394'); // High atmosphere
  skyGrad.addColorStop(0.30, '#4b84b3'); // Mid sky
  skyGrad.addColorStop(0.42, '#76a8ce'); // Lower sky atmospheric haze
  skyGrad.addColorStop(0.48, '#a2c6db'); // Sky-horizon boundary haze
  skyGrad.addColorStop(0.50, '#586e50'); // Horizon hill line (matches fog green)
  skyGrad.addColorStop(0.54, '#485e40'); // Upper ground slope
  skyGrad.addColorStop(0.65, '#35482d'); // Lower ground slope
  skyGrad.addColorStop(1.00, '#1c2817'); // Deep ground nadir
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, totalW, h);

  // 2. Solar Mie forward-scatter atmospheric glow (sun at azimuth ~135°, elevation ~35°)
  const sunX = margin + w * 0.38;
  const sunY = h * 0.30;
  const sunGlow = ctx.createRadialGradient(
    sunX,
    sunY,
    Math.max(2, 10 * detailScale),
    sunX,
    sunY,
    900 * detailScale
  );
  sunGlow.addColorStop(0.0, 'rgba(255, 252, 235, 0.45)');
  sunGlow.addColorStop(0.12, 'rgba(255, 245, 210, 0.25)');
  sunGlow.addColorStop(0.40, 'rgba(220, 238, 250, 0.12)');
  sunGlow.addColorStop(1.0, 'rgba(180, 215, 240, 0.0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, totalW, h);

  // 3. High-altitude soft wispy cirrus and gentle scattered cumulus clouds with toroidal wrapping
  const drawSoftCloud = (cx, cy, radiusX, radiusY, opacity) => {
    ctx.save();
    if (ctx.filter !== undefined) {
      ctx.filter = `blur(${Math.max(1.5, 6 * detailScale)}px)`;
    }
    const cloudGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(radiusX, radiusY));
    cloudGrad.addColorStop(0.0, `rgba(255, 255, 255, ${opacity})`);
    cloudGrad.addColorStop(0.45, `rgba(245, 250, 255, ${opacity * 0.6})`);
    cloudGrad.addColorStop(0.80, `rgba(230, 242, 252, ${opacity * 0.2})`);
    cloudGrad.addColorStop(1.0, 'rgba(220, 235, 250, 0.0)');
    ctx.translate(cx, cy);
    ctx.scale(radiusX / Math.max(radiusX, radiusY), radiusY / Math.max(radiusX, radiusY));
    ctx.fillStyle = cloudGrad;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(radiusX, radiusY), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const cloudPuffs = [
    { x: 0.12, y: 0.22, rx: 320, ry: 45, op: 0.18 },
    { x: 0.18, y: 0.21, rx: 240, ry: 38, op: 0.22 },
    { x: 0.25, y: 0.24, rx: 280, ry: 40, op: 0.16 },
    { x: 0.45, y: 0.16, rx: 420, ry: 55, op: 0.20 },
    { x: 0.52, y: 0.18, rx: 310, ry: 42, op: 0.24 },
    { x: 0.68, y: 0.26, rx: 380, ry: 50, op: 0.18 },
    { x: 0.76, y: 0.24, rx: 290, ry: 44, op: 0.22 },
    { x: 0.88, y: 0.20, rx: 350, ry: 48, op: 0.17 },
    { x: 0.94, y: 0.22, rx: 260, ry: 36, op: 0.20 }
  ];
  for (const p of cloudPuffs) {
    const primaryX = margin + p.x * w;
    const radiusX = p.rx * scaleX;
    const radiusY = p.ry * scaleY;
    drawSoftCloud(primaryX, p.y * h, radiusX, radiusY, p.op);
    if (p.x < 0.2) drawSoftCloud(primaryX + w, p.y * h, radiusX, radiusY, p.op);
    if (p.x > 0.8) drawSoftCloud(primaryX - w, p.y * h, radiusX, radiusY, p.op);
  }

  // 4. Multi-tier French Ardennes rolling horizon terrain ridges with seamless periodic wrapping
  const drawDetailedHorizonRidge = (baseY, harmonics, fillStyle, treeNoise = false) => {
    ctx.save();
    if (ctx.filter !== undefined) {
      ctx.filter = `blur(${Math.max(1, 3.5 * detailScale)}px)`;
    }
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= totalW; x += Math.max(1, Math.round(2 * scaleX))) {
      const theta = ((x - margin) / w) * Math.PI * 2;
      let y = baseY;
      for (const { amp, freq, phase = 0 } of harmonics) {
        y += Math.sin(theta * freq + phase) * amp * scaleY;
      }
      if (treeNoise) {
        const microTheta = theta * 64;
        y += (
          Math.sin(microTheta) * 1.6
          + Math.cos(microTheta * 2) * 1.0
        ) * scaleY;
      }
      if (x === 0) ctx.lineTo(0, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(totalW, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // Tier 1: Distant atmospheric haze ridges (~15km) - fully opaque
  drawDetailedHorizonRidge(
    horizonY - 24,
    [
      { amp: 20, freq: 2, phase: 0.2 },
      { amp: 14, freq: 5, phase: 1.8 },
      { amp: 8, freq: 11, phase: 3.1 }
    ],
    '#748f7d'
  );

  // Tier 2: Mid-distance rolling pastoral plateaus (~8km) - fully opaque
  drawDetailedHorizonRidge(
    horizonY - 12,
    [
      { amp: 16, freq: 3, phase: 0.9 },
      { amp: 10, freq: 7, phase: 2.4 },
      { amp: 6, freq: 15, phase: 4.2 }
    ],
    '#607c57'
  );

  // Tier 3: Near horizon rolling hills and tree copses (~3km) - fully opaque
  drawDetailedHorizonRidge(
    horizonY - 4,
    [
      { amp: 12, freq: 4, phase: 1.4 },
      { amp: 7, freq: 8, phase: 0.5 },
      { amp: 4, freq: 18, phase: 2.9 }
    ],
    '#4c6740',
    true
  );

  // Tier 4: Base foreground terrain ridge - fully opaque
  drawDetailedHorizonRidge(
    horizonY + 2,
    [
      { amp: 8, freq: 5, phase: 2.1 },
      { amp: 4, freq: 12, phase: 1.1 }
    ],
    '#3e5534',
    true
  );

  // 5. Transfer seamless center slice to final 4096x2048 canvas
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = w;
  finalCanvas.height = h;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) return null;

  finalCtx.drawImage(renderCanvas, margin, 0, w, h, 0, 0, w, h);
  renderCanvas.width = 1;
  renderCanvas.height = 1;

  const texture = new THREE.Texture(finalCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = qualityTier === 'ultra' ? 8 : qualityTier === 'low' ? 2 : 4;
  texture.needsUpdate = true;
  return texture;
}

export function createCombatMissionSkyPanoramaTexture(options) {
  return createGoogleEarthAtmosphericSkyTexture(options);
}

export function createMapBoundaryRibbonGeometry({
  width,
  depth,
  xCoordinates,
  zCoordinates,
  getHeightAt,
  ribbonWidth = 1.0,
  liftY = 0.04
}) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const positions = [];
  const uvs = [];
  const indices = [];

  const addStrip = (coords, isZAxis, fixedCoord, inwardSign) => {
    const baseIndex = positions.length / 3;
    for (let i = 0; i < coords.length; i++) {
      const val = coords[i];
      const outerX = isZAxis ? fixedCoord : val;
      const outerZ = isZAxis ? val : fixedCoord;
      const innerX = isZAxis ? fixedCoord - inwardSign * ribbonWidth : val;
      const innerZ = isZAxis ? val : fixedCoord - inwardSign * ribbonWidth;

      const outerY = getHeightAt(outerX, outerZ) + liftY;
      const innerY = getHeightAt(innerX, innerZ) + liftY;

      positions.push(outerX, outerY, outerZ);
      uvs.push(i / (coords.length - 1), 0);

      positions.push(innerX, innerY, innerZ);
      uvs.push(i / (coords.length - 1), 1);
    }

    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = baseIndex + i * 2;
      const p1 = baseIndex + i * 2 + 1;
      const p2 = baseIndex + (i + 1) * 2;
      const p3 = baseIndex + (i + 1) * 2 + 1;

      indices.push(p0, p1, p2, p1, p3, p2);
    }
  };

  addStrip(xCoordinates, false, halfDepth, 1);
  addStrip(xCoordinates, false, -halfDepth, -1);
  addStrip(zCoordinates, true, halfWidth, 1);
  addStrip(zCoordinates, true, -halfWidth, -1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function findCoordinateInterval(coordinates, value) {
  if (value <= coordinates[0]) return 0;
  const last = coordinates.length - 1;
  if (value >= coordinates[last]) return last - 1;
  let low = 0;
  let high = last;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) * 0.5);
    if (coordinates[middle] <= value) low = middle;
    else high = middle;
  }
  return low;
}

function addQuad(positions, uvs, a, b, c, d, uScale = 1, vScale = 1) {
  for (const point of [a, b, c, a, c, d]) {
    positions.push(point.x, point.y, point.z);
  }
  for (const index of [0, 1, 2, 0, 2, 3]) {
    uvs.push(
      QUAD_UVS[index * 2] * uScale,
      QUAD_UVS[index * 2 + 1] * vScale
    );
  }
}

function addTriangle(positions, uvs, a, b, c) {
  for (const point of [a, b, c]) {
    positions.push(point.x, point.y, point.z);
  }
  uvs.push(0, 0, 1, 0, 0.5, 1);
}

function smoothstep01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function createMeterUvBoxGeometry(width, height, depth, metresPerRepeat) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const uvs = geometry.attributes.uv;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const nx = Math.abs(normals.getX(index));
    const ny = Math.abs(normals.getY(index));
    if (nx > 0.5) {
      uvs.setXY(index, z / metresPerRepeat, y / metresPerRepeat);
    } else if (ny > 0.5) {
      uvs.setXY(index, x / metresPerRepeat, z / metresPerRepeat);
    } else {
      uvs.setXY(index, x / metresPerRepeat, y / metresPerRepeat);
    }
  }
  uvs.needsUpdate = true;
  geometry.userData.metresPerUvRepeat = metresPerRepeat;
  return geometry;
}

/**
 * Builds one closed wall prism. Every footprint corner samples the terrain,
 * so both ends and both faces remain grounded on uneven slopes.
 */
export function createGroundConformingWallGeometry({
  start,
  end,
  height,
  thickness,
  getHeightAt,
  startFootprint = null,
  endFootprint = null,
  capStart = true,
  capEnd = true,
  textureRepeatMeters = 0.6,
  textureRepeatHeightMeters = 0.3
}) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0)) throw new Error('Wall segment length must be positive');
  if (!(textureRepeatMeters > 0) || !(textureRepeatHeightMeters > 0)) {
    throw new Error('Wall texture repeat dimensions must be positive');
  }

  const halfThickness = thickness * 0.5;
  const nx = -dz / length * halfThickness;
  const nz = dx / length * halfThickness;
  const groundPoint = (x, z) => new THREE.Vector3(x, getHeightAt(x, z), z);
  const bottomStartLeft = groundPoint(
    startFootprint?.left?.x ?? start.x + nx,
    startFootprint?.left?.z ?? start.z + nz
  );
  const bottomStartRight = groundPoint(
    startFootprint?.right?.x ?? start.x - nx,
    startFootprint?.right?.z ?? start.z - nz
  );
  const bottomEndRight = groundPoint(
    endFootprint?.right?.x ?? end.x - nx,
    endFootprint?.right?.z ?? end.z - nz
  );
  const bottomEndLeft = groundPoint(
    endFootprint?.left?.x ?? end.x + nx,
    endFootprint?.left?.z ?? end.z + nz
  );
  const top = (point) => point.clone().add(new THREE.Vector3(0, height, 0));
  const topStartLeft = top(bottomStartLeft);
  const topStartRight = top(bottomStartRight);
  const topEndRight = top(bottomEndRight);
  const topEndLeft = top(bottomEndLeft);

  const positions = [];
  const uvs = [];
  const heightScale = height / textureRepeatHeightMeters;
  const lengthScale = length / textureRepeatMeters;
  const thicknessScale = thickness / textureRepeatMeters;

  addQuad(
    positions, uvs,
    topStartLeft, topEndLeft, topEndRight, topStartRight,
    lengthScale, thicknessScale
  );
  addQuad(
    positions, uvs,
    bottomStartLeft, bottomStartRight, bottomEndRight, bottomEndLeft,
    thicknessScale, lengthScale
  );
  addQuad(
    positions, uvs,
    bottomStartLeft, bottomEndLeft, topEndLeft, topStartLeft,
    lengthScale, heightScale
  );
  addQuad(
    positions, uvs,
    bottomStartRight, topStartRight, topEndRight, bottomEndRight,
    heightScale, lengthScale
  );
  if (capStart) {
    addQuad(
      positions, uvs,
      bottomStartLeft, topStartLeft, topStartRight, bottomStartRight,
      heightScale, thicknessScale
    );
  }
  if (capEnd) {
    addQuad(
      positions, uvs,
      bottomEndLeft, bottomEndRight, topEndRight, topEndLeft,
      thicknessScale, heightScale
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.footprintCorners = [
    bottomStartLeft.toArray(),
    bottomStartRight.toArray(),
    bottomEndRight.toArray(),
    bottomEndLeft.toArray()
  ];
  geometry.userData.caps = { start: capStart, end: capEnd };
  geometry.userData.textureRepeatMeters = {
    horizontal: textureRepeatMeters,
    vertical: textureRepeatHeightMeters
  };
  return geometry;
}

function wallEndpointMatches(point, endpoint) {
  return Math.abs(point[0] - endpoint[0]) <= 1e-6
    && Math.abs(point[1] - endpoint[1]) <= 1e-6;
}

function intersectOffsetLines(originA, directionA, originB, directionB) {
  const denominator = directionA.x * directionB.z - directionA.z * directionB.x;
  if (Math.abs(denominator) <= 1e-6) return null;
  const offsetX = originB.x - originA.x;
  const offsetZ = originB.z - originA.z;
  const distance = (offsetX * directionB.z - offsetZ * directionB.x) / denominator;
  return {
    x: originA.x + directionA.x * distance,
    z: originA.z + directionA.z * distance
  };
}

function resolveWallEndpointFootprint({ run, endpoint, runs, thickness }) {
  const point = endpoint === 'start' ? run.start : run.end;
  const connections = runs.flatMap(candidate => {
    if (candidate.profileId !== run.profileId) {
      return [];
    }
    const matches = [];
    if (wallEndpointMatches(candidate.start, point)) matches.push({ run: candidate, endpoint: 'start' });
    if (wallEndpointMatches(candidate.end, point)) matches.push({ run: candidate, endpoint: 'end' });
    return matches;
  });
  if (connections.length === 3) {
    const directions = connections.map(connection => {
      const other = connection.endpoint === 'start'
        ? connection.run.end
        : connection.run.start;
      const length = Math.hypot(other[0] - point[0], other[1] - point[1]);
      return length > 0
        ? { x: (other[0] - point[0]) / length, z: (other[1] - point[1]) / length }
        : null;
    });
    const hasOpposedPair = directions.some((left, leftIndex) => left
      && directions.some((right, rightIndex) => right
        && rightIndex > leftIndex
        && left.x * right.x + left.z * right.z < -0.999));
    if (!hasOpposedPair) return null;
    const currentDx = run.end[0] - run.start[0];
    const currentDz = run.end[1] - run.start[1];
    const currentLength = Math.hypot(currentDx, currentDz);
    if (!(currentLength > 0)) return null;
    const direction = { x: currentDx / currentLength, z: currentDz / currentLength };
    const away = endpoint === 'start'
      ? direction
      : { x: -direction.x, z: -direction.z };
    const halfThickness = thickness * 0.5;
    const center = {
      x: point[0] + away.x * halfThickness,
      z: point[1] + away.z * halfThickness
    };
    const normal = {
      x: -direction.z * halfThickness,
      z: direction.x * halfThickness
    };
    return {
      kind: 'tee',
      left: { x: center.x + normal.x, z: center.z + normal.z },
      right: { x: center.x - normal.x, z: center.z - normal.z }
    };
  }
  if (connections.length !== 2) return null;
  const neighbor = connections.find(connection => connection.run.id !== run.id);
  if (!neighbor) return null;

  const currentOther = endpoint === 'start' ? run.end : run.start;
  const neighborOther = neighbor.endpoint === 'start' ? neighbor.run.end : neighbor.run.start;
  const intoLength = Math.hypot(point[0] - currentOther[0], point[1] - currentOther[1]);
  const outLength = Math.hypot(neighborOther[0] - point[0], neighborOther[1] - point[1]);
  if (!(intoLength > 0) || !(outLength > 0)) return null;
  const into = {
    x: (point[0] - currentOther[0]) / intoLength,
    z: (point[1] - currentOther[1]) / intoLength
  };
  const out = {
    x: (neighborOther[0] - point[0]) / outLength,
    z: (neighborOther[1] - point[1]) / outLength
  };
  const turn = into.x * out.z - into.z * out.x;
  if (Math.abs(turn) <= 1e-4) return null;

  const halfThickness = thickness * 0.5;
  const intoNormal = { x: -into.z * halfThickness, z: into.x * halfThickness };
  const outNormal = { x: -out.z * halfThickness, z: out.x * halfThickness };
  const origin = { x: point[0], z: point[1] };
  const left = intersectOffsetLines(
    { x: origin.x + intoNormal.x, z: origin.z + intoNormal.z },
    into,
    { x: origin.x + outNormal.x, z: origin.z + outNormal.z },
    out
  );
  const right = intersectOffsetLines(
    { x: origin.x - intoNormal.x, z: origin.z - intoNormal.z },
    into,
    { x: origin.x - outNormal.x, z: origin.z - outNormal.z },
    out
  );
  if (!left || !right) return null;

  // Geometry labels are based on start-to-end direction. At the start point
  // that direction is opposite the incoming tangent used for the mitre.
  return endpoint === 'start'
    ? { kind: 'mitre', left: right, right: left }
    : { kind: 'mitre', left, right };
}

function createGroundConformingTeeJunctionGeometry({
  center,
  directions,
  height,
  thickness,
  textureRepeatMeters = 0.6,
  textureRepeatHeightMeters = 0.3,
  getHeightAt
}) {
  const halfThickness = thickness * 0.5;
  const axis = directions[0];
  const normal = { x: -axis.z, z: axis.x };
  const offsets = [
    [-halfThickness, -halfThickness],
    [halfThickness, -halfThickness],
    [halfThickness, halfThickness],
    [-halfThickness, halfThickness]
  ];
  const bottom = offsets.map(([along, across]) => new THREE.Vector3(
    center.x + axis.x * along + normal.x * across,
    0,
    center.z + axis.z * along + normal.z * across
  )).map(point => point.setY(getHeightAt(point.x, point.z)));
  const top = bottom.map(point => point.clone().setY(point.y + height));
  const positions = [];
  const uvs = [];
  const heightScale = height / textureRepeatHeightMeters;
  const widthScale = thickness / textureRepeatMeters;
  addQuad(positions, uvs, top[0], top[3], top[2], top[1], widthScale, widthScale);
  addQuad(positions, uvs, bottom[0], bottom[1], bottom[2], bottom[3], widthScale, widthScale);
  const outwardNormals = [
    { x: -normal.x, z: -normal.z },
    axis,
    normal,
    { x: -axis.x, z: -axis.z }
  ];
  for (let index = 0; index < 4; index++) {
    const attached = directions.some(direction =>
      direction.x * outwardNormals[index].x
        + direction.z * outwardNormals[index].z > 0.999);
    if (attached) continue;
    const next = (index + 1) % 4;
    addQuad(
      positions,
      uvs,
      bottom[next], bottom[index], top[index], top[next],
      widthScale,
      heightScale
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.presentationOnly = true;
  geometry.userData.junctionKind = 'tee';
  geometry.userData.textureRepeatMeters = {
    horizontal: textureRepeatMeters,
    vertical: textureRepeatHeightMeters
  };
  return geometry;
}

/**
 * Builds one indexed vertical ribbon whose lower edge follows the terrain.
 * Material alpha testing supplies the fence openings; collision remains a
 * separate profile-driven series of oriented records.
 */
export function createGroundConformingFenceCardGeometry({
  start,
  end,
  height,
  thickness,
  maximumSegmentLength,
  textureRepeatMeters,
  groundOffset = 0,
  getHeightAt
}) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0)) throw new Error('Fence run length must be positive');
  if (!(height > 0) || !(thickness > 0)
      || !(maximumSegmentLength > 0) || !(textureRepeatMeters > 0)) {
    throw new Error('Fence card dimensions must be positive');
  }
  if (typeof getHeightAt !== 'function') {
    throw new TypeError('Fence card requires getHeightAt');
  }

  const segmentCount = Math.ceil(length / maximumSegmentLength);
  const positions = [];
  const uvs = [];
  const indices = [];
  const segmentVertexIndices = Array.from(
    { length: segmentCount },
    () => []
  );
  const groundSamples = [];
  const samples = [];
  const halfThickness = thickness * 0.5;
  const normalX = -dz / length * halfThickness;
  const normalZ = dx / length * halfThickness;
  for (let index = 0; index <= segmentCount; index++) {
    const progress = index / segmentCount;
    const x = start.x + dx * progress;
    const z = start.z + dz * progress;
    const groundY = getHeightAt(x, z);
    const bottomY = groundY + groundOffset;
    const u = length * progress / textureRepeatMeters;
    samples.push({
      leftBottom: new THREE.Vector3(x + normalX, bottomY, z + normalZ),
      rightBottom: new THREE.Vector3(x - normalX, bottomY, z - normalZ),
      leftTop: new THREE.Vector3(x + normalX, bottomY + height, z + normalZ),
      rightTop: new THREE.Vector3(x - normalX, bottomY + height, z - normalZ),
      u
    });
    groundSamples.push([x, groundY, z]);
  }
  const addIndexedQuad = (points, coordinates, segmentIndex) => {
    const base = positions.length / 3;
    for (const point of points) positions.push(point.x, point.y, point.z);
    for (const [u, v] of coordinates) uvs.push(u, v);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    segmentVertexIndices[segmentIndex].push(
      base,
      base + 1,
      base + 2,
      base + 3
    );
  };
  for (let index = 0; index < segmentCount; index++) {
    const from = samples[index];
    const to = samples[index + 1];
    const sideUvs = [
      [from.u, 0],
      [to.u, 0],
      [to.u, 1],
      [from.u, 1]
    ];
    addIndexedQuad(
      [from.leftBottom, to.leftBottom, to.leftTop, from.leftTop],
      sideUvs,
      index
    );
    addIndexedQuad(
      [to.rightBottom, from.rightBottom, from.rightTop, to.rightTop],
      [
        [to.u, 0],
        [from.u, 0],
        [from.u, 1],
        [to.u, 1]
      ],
      index
    );
    // The top samples a picket-only band in the same repeating texture, so
    // every visible top cap aligns with the upright below it while gaps remain
    // true alpha-tested holes.
    addIndexedQuad(
      [from.leftTop, to.leftTop, to.rightTop, from.rightTop],
      [
        [from.u, 0.88],
        [to.u, 0.88],
        [to.u, 0.98],
        [from.u, 0.98]
      ],
      index
    );
  }
  const first = samples[0];
  const last = samples.at(-1);
  const endCapUvs = [[0, 0], [0.06, 0], [0.06, 1], [0, 1]];
  addIndexedQuad(
    [first.rightBottom, first.leftBottom, first.leftTop, first.rightTop],
    endCapUvs,
    0
  );
  addIndexedQuad(
    [last.leftBottom, last.rightBottom, last.rightTop, last.leftTop],
    endCapUvs,
    segmentCount - 1
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.groundSamples = groundSamples;
  geometry.userData.segmentCount = segmentCount;
  geometry.userData.lengthMeters = length;
  geometry.userData.metresPerUvRepeat = textureRepeatMeters;
  geometry.userData.thicknessMeters = thickness;
  geometry.userData.faceBands = ['front', 'back', 'top', 'ends'];
  geometry.userData.presentationKind = 'alpha-tested-card';
  geometry.userData.segmentVertexIndices = segmentVertexIndices;
  geometry.userData.originalPositions = Float32Array.from(positions);
  return geometry;
}

function createGabledRoofGeometry(width, depth, height, overhang = 0.45) {
  const halfWidth = width * 0.5 + overhang;
  const halfDepth = depth * 0.5 + overhang;
  const leftFront = new THREE.Vector3(-halfWidth, 0, halfDepth);
  const leftRear = new THREE.Vector3(-halfWidth, 0, -halfDepth);
  const rightFront = new THREE.Vector3(halfWidth, 0, halfDepth);
  const rightRear = new THREE.Vector3(halfWidth, 0, -halfDepth);
  const ridgeFront = new THREE.Vector3(0, height, halfDepth);
  const ridgeRear = new THREE.Vector3(0, height, -halfDepth);
  const positions = [];
  const uvs = [];

  addQuad(positions, uvs, leftFront, ridgeFront, ridgeRear, leftRear);
  addQuad(positions, uvs, rightRear, ridgeRear, ridgeFront, rightFront);
  addTriangle(positions, uvs, leftFront, rightFront, ridgeFront);
  addTriangle(positions, uvs, rightRear, leftRear, ridgeRear);
  addQuad(
    positions, uvs,
    leftRear, rightRear, rightFront, leftFront
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTerrainConformingFoundationGeometry({
  centerX,
  centerZ,
  width,
  depth,
  topY,
  getHeightAt
}) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const worldCorners = [
    [centerX - halfWidth, centerZ + halfDepth],
    [centerX + halfWidth, centerZ + halfDepth],
    [centerX + halfWidth, centerZ - halfDepth],
    [centerX - halfWidth, centerZ - halfDepth]
  ];
  const bottom = worldCorners.map(([x, z]) =>
    new THREE.Vector3(x - centerX, getHeightAt(x, z) - topY, z - centerZ)
  );
  const top = [
    new THREE.Vector3(-halfWidth, 0, halfDepth),
    new THREE.Vector3(halfWidth, 0, halfDepth),
    new THREE.Vector3(halfWidth, 0, -halfDepth),
    new THREE.Vector3(-halfWidth, 0, -halfDepth)
  ];
  const positions = [];
  const uvs = [];
  addQuad(positions, uvs, top[0], top[1], top[2], top[3], width, depth);
  addQuad(positions, uvs, bottom[0], bottom[3], bottom[2], bottom[1], depth, width);
  addQuad(positions, uvs, bottom[0], bottom[1], top[1], top[0], width, 1);
  addQuad(positions, uvs, bottom[1], bottom[2], top[2], top[1], depth, 1);
  addQuad(positions, uvs, bottom[2], bottom[3], top[3], top[2], width, 1);
  addQuad(positions, uvs, bottom[3], bottom[0], top[0], top[3], depth, 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.worldFootprintCorners = worldCorners.map(([x, z], index) => [
    x,
    bottom[index].y + topY,
    z
  ]);
  geometry.userData.topY = topY;
  return geometry;
}

export function createBridgeApproachGeometry({
  halfWidth,
  deckEndZ,
  direction,
  length,
  deckTop,
  getGroundHeightAt,
  widthSubdivisions = 4,
  lengthSubdivisions = 4
}) {
  if (!(halfWidth > 0) || !(length > 0)) {
    throw new Error('Bridge approach dimensions must be positive');
  }
  if (direction !== -1 && direction !== 1) {
    throw new Error('Bridge approach direction must be -1 or 1');
  }
  if (typeof getGroundHeightAt !== 'function') {
    throw new TypeError('Bridge approach requires getGroundHeightAt');
  }
  const positions = [];
  const uvs = [];
  const topPoint = (column, row) => {
    const x = THREE.MathUtils.lerp(
      -halfWidth,
      halfWidth,
      column / widthSubdivisions
    );
    const progress = row / lengthSubdivisions;
    const z = deckEndZ + direction * length * progress;
    const groundY = getGroundHeightAt(x, z);
    return new THREE.Vector3(
      x,
      THREE.MathUtils.lerp(
        deckTop,
        groundY,
        smoothstep01(progress)
      ),
      z
    );
  };
  const groundPoint = (x, z) =>
    new THREE.Vector3(x, getGroundHeightAt(x, z), z);
  const addOrientedQuad = (points, reverse = false, uScale = 1, vScale = 1) => {
    const ordered = reverse ? [...points].reverse() : points;
    addQuad(
      positions,
      uvs,
      ordered[0],
      ordered[1],
      ordered[2],
      ordered[3],
      uScale,
      vScale
    );
  };

  for (let row = 0; row < lengthSubdivisions; row++) {
    for (let column = 0; column < widthSubdivisions; column++) {
      const currentLeft = topPoint(column, row);
      const nextLeft = topPoint(column, row + 1);
      const nextRight = topPoint(column + 1, row + 1);
      const currentRight = topPoint(column + 1, row);
      addOrientedQuad(
        [currentLeft, nextLeft, nextRight, currentRight],
        direction < 0,
        (halfWidth * 2) / TERRAIN_SCALE.bridge.masonryRepeatMeters,
        length / TERRAIN_SCALE.bridge.masonryRepeatMeters
      );
    }
  }

  for (const side of [-1, 1]) {
    for (let row = 0; row < lengthSubdivisions; row++) {
      const x = side * halfWidth;
      const z0 = deckEndZ + direction * length * (
        row / lengthSubdivisions
      );
      const z1 = deckEndZ + direction * length * (
        (row + 1) / lengthSubdivisions
      );
      const base0 = groundPoint(x, z0);
      const base1 = groundPoint(x, z1);
      const top1 = topPoint(side < 0 ? 0 : widthSubdivisions, row + 1);
      const top0 = topPoint(side < 0 ? 0 : widthSubdivisions, row);
      const reverse = side < 0 ? direction < 0 : direction > 0;
      addOrientedQuad(
        [base0, base1, top1, top0],
        reverse,
        length / TERRAIN_SCALE.bridge.masonryRepeatMeters,
        1
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.approach = {
    halfWidth,
    deckEndZ,
    direction,
    length,
    deckTop,
    widthSubdivisions,
    lengthSubdivisions
  };
  return geometry;
}

export class TerrainBuilder {
  constructor(scene, {
    mapDescriptor,
    buildingSystem = null,
    structureAdapters = {},
    terrainSurfaceProvider,
    foliageTemplateProvider = null,
    qualityTier = 'high'
  } = {}) {
    if (!mapDescriptor?.id || !mapDescriptor?.dimensions) {
      throw new Error('TerrainBuilder requires a validated mapDescriptor');
    }
    if (
      !terrainSurfaceProvider
      || typeof terrainSurfaceProvider.create !== 'function'
    ) {
      throw new Error('TerrainBuilder requires an injected terrain surface provider');
    }
    if (
      foliageTemplateProvider != null
      && typeof foliageTemplateProvider.createTemplate !== 'function'
    ) {
      throw new Error('TerrainBuilder foliage template provider requires createTemplate');
    }
    this.scene = scene;
    this.initialSceneChildren = new Set(scene.children);
    this.presentationRoots = new Set();
    this.staticTransformStats = null;
    this.qualityTier = ['low', 'high', 'ultra'].includes(qualityTier)
      ? qualityTier
      : 'high';
    this.mapDescriptor = mapDescriptor;
    const elevation = mapDescriptor.elevation;
    this.openGroundBaseHeight = elevation.baseHeight ?? 0;
    this.openGroundWaves = elevation.waves.map(wave => ({
      useX: wave.axis === 'x',
      useSine: wave.function === 'sin',
      frequency: wave.frequency,
      phase: wave.phase ?? 0,
      amplitude: wave.amplitude
    }));
    const river = mapDescriptor.river;
    this.openGroundFloodplain = river
      && Number.isFinite(river.centerZ)
      && Number.isFinite(river.floodplainRadius)
      ? {
          centerZ: river.centerZ,
          radius: river.floodplainRadius
        }
      : null;
    this.terrainRiverProfile = river
      ? {
          centerZ: river.centerZ,
          waterHalfWidth: river.waterWidth * 0.5,
          cutHalfWidth: river.cutWidth * 0.5,
          inverseBankWidth: 1 / ((river.cutWidth - river.waterWidth) * 0.5),
          bedLevel: river.bedLevel
        }
      : null;
    this.deploymentZoneDefinitions = mapDescriptor.deploymentZones;
    this.width = mapDescriptor.dimensions.width;
    this.depth = mapDescriptor.dimensions.depth;
    this.segments = mapDescriptor.dimensions.segments;
    this.terrainMesh = null;
    this.surroundingTerrainMesh = null;
    this.mapBoundaryRibbonMesh = null;
    this.skyDomeMesh = null;
    this.oobRiverWaterMeshes = [];
    this.oobRiverWaterMaterial = null;
    this.heightData = new Float32Array();
    this.terrainGridCoordinates = createTerrainGridCoordinates({
      width: this.width,
      depth: this.depth,
      segments: this.segments,
      additionalZCoordinates: createRiverBankZCoordinates(mapDescriptor.river)
    });
    this.bocageObstacles = [];
    this.coverObstacleCellSize = 16;
    this.coverObstacleCells = new Map();
    this.sightOccluderRevision = 0;
    this.sightOccluderSnapshot = createTerrainSightOccluderSnapshot(0, []);
    this.sightOccluderPublicationDepth = 0;
    this.sightOccluderPublicationPending = false;
    this.buildings = [];
    this.colliderRecords = [];
    this.navigationRecords = [];
    this.collisionWorld = new StaticCollisionWorld();
    this.bridgeSurface = null;
    this.riverBankStrips = [];
    this.buildingSystem = buildingSystem;
    this.structureAdapters = structureAdapters;
    this.structurePadTargetHeights = new Map();
    const padGroups = new Map();
    for (const structure of mapDescriptor.structures ?? []) {
      if (!structure.terrainPad) continue;
      const groupId = structure.terrainPad.levelGroupId ?? `structure:${structure.id}`;
      const group = padGroups.get(groupId) ?? [];
      group.push(structure);
      padGroups.set(groupId, group);
    }
    for (const group of padGroups.values()) {
      const targetHeight = group.reduce(
        (sum, structure) => sum + this.getRawOpenGroundHeightAt(
          structure.position[0],
          structure.position[1]
        ),
        0
      ) / group.length;
      for (const structure of group) {
        this.structurePadTargetHeights.set(structure.id, targetHeight);
      }
    }
    this.structureTerrainPadCellSize = 16;
    this.structureTerrainPadCells = new Map();
    this.structureTerrainPadRows = new Map();
    this.structureTerrainPads = [];
    for (const structure of mapDescriptor.structures ?? []) {
      const terrainPad = structure.terrainPad;
      if (!terrainPad) continue;
      const descriptor = this.structureAdapters[structure.visualAdapterId]?.descriptor;
      if (!descriptor?.bounds) continue;
      const [centerX, centerZ] = structure.position;
      const rotation = structure.rotationY ?? 0;
      const cosine = Math.cos(rotation);
      const sine = Math.sin(rotation);
      const halfWidth = (
        descriptor.bounds.max[0] - descriptor.bounds.min[0]
      ) * 0.5 + terrainPad.footprintMargin;
      const halfDepth = (
        descriptor.bounds.max[2] - descriptor.bounds.min[2]
      ) * 0.5 + terrainPad.footprintMargin;
      const blendDistance = terrainPad.blendDistance;
      const worldHalfX = Math.abs(cosine) * halfWidth
        + Math.abs(sine) * halfDepth
        + blendDistance;
      const worldHalfZ = Math.abs(sine) * halfWidth
        + Math.abs(cosine) * halfDepth
        + blendDistance;
      const pad = {
        id: structure.id,
        centerX,
        centerZ,
        cosine,
        sine,
        halfWidth,
        halfDepth,
        blendDistance,
        targetHeight: this.structurePadTargetHeights.get(structure.id)
          ?? this.getRawOpenGroundHeightAt(centerX, centerZ)
      };
      this.structureTerrainPads.push(pad);
      const minCellX = Math.floor(
        (centerX - worldHalfX) / this.structureTerrainPadCellSize
      );
      const maxCellX = Math.floor(
        (centerX + worldHalfX) / this.structureTerrainPadCellSize
      );
      const minCellZ = Math.floor(
        (centerZ - worldHalfZ) / this.structureTerrainPadCellSize
      );
      const maxCellZ = Math.floor(
        (centerZ + worldHalfZ) / this.structureTerrainPadCellSize
      );
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
          const key = `${cellX}:${cellZ}`;
          const pads = this.structureTerrainPadCells.get(key) ?? [];
          pads.push(pad);
          this.structureTerrainPadCells.set(key, pads);
          let row = this.structureTerrainPadRows.get(cellZ);
          if (!row) {
            row = new Map();
            this.structureTerrainPadRows.set(cellZ, row);
          }
          row.set(cellX, pads);
        }
      }
    }
    this.terrainSurfaceProvider = terrainSurfaceProvider;
    this.foliageTemplateProvider = foliageTemplateProvider;
    this.surfaceAssets = null;
    this.fenceMeshesByRunId = new Map();
    this.foliageInstances = [];
    this.renderedFoliageEntries = [];
    this.foliageExcludedFeatureIds = [];
    this.foliageReady = Promise.resolve(this.foliageInstances);
    this.destructibleLinearObstacles = new DestructibleLinearObstacleSystem({
      onSegmentChanged: (state, segment) => {
        this.syncDestructibleFenceSegment(state, segment);
      }
    });
  }

  buildScenarioMap() {
    // 1. Terrain Geometry
    const river = this.mapDescriptor.river;
    const geometry = createTerrainGridGeometry({
      width: this.width,
      depth: this.depth,
      segments: this.segments,
      additionalZCoordinates: createRiverBankZCoordinates(river)
    });
    this.terrainGridCoordinates = geometry.userData.gridCoordinates;

    const pos = geometry.attributes.position;
    this.heightData = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.getHeightAt(x, z);

      pos.setY(i, h);
      this.heightData[i] = h;
    }
    geometry.computeVertexNormals();

    // 2. Family-owned surface material
    const surfaceAssets = this.getSurfaceAssets();
    const material = surfaceAssets.materials.ground;

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.name = 'TerrainMesh';
    if (surfaceAssets.assetBinding) {
      this.terrainMesh.userData.assetBindings = {
        terrainSurface: surfaceAssets.assetBinding
      };
    }
    this.scene.add(this.terrainMesh);

    // 3. Out-of-bounds surrounding terrain skirt (de-emphasized background)
    this.buildSurroundingTerrain();

    // 4. Atmospheric sky dome blending into horizon fog
    this.buildSkyDome();

    // 5. Environment Features
    this.buildRiverAndBridge();
    this.buildStoneWalls();
    this.buildStructures();
    this.buildFoliage();
    this.buildSetupZones();

    this.presentationRoots = new Set(
      this.scene.children.filter(object => !this.initialSceneChildren.has(object))
    );

    return this.terrainMesh;
  }

  freezeStaticPresentationTransforms() {
    const reactiveObjects = new Set();
    for (const building of this.buildings) {
      const animator = building.object.userData?.collapseAnimator;
      for (const record of animator?.sectionRecordList ?? []) {
        for (const target of record.targets ?? []) {
          if (target.object) reactiveObjects.add(target.object);
        }
      }
      building.object.traverse(object => {
        if (object.userData?.semantic === 'door-hinge') {
          reactiveObjects.add(object);
        }
      });
    }

    let roots = 0;
    let frozen = 0;
    for (const root of this.presentationRoots) {
      if (root.parent !== this.scene) continue;
      root.updateMatrixWorld(true);
      root.traverse(object => {
        object.updateMatrix();
        object.matrixAutoUpdate = false;
        frozen++;
      });
      root.updateMatrixWorld(true);
      roots++;
    }
    this.staticTransformStats = Object.freeze({
      roots,
      frozen,
      reactive: reactiveObjects.size
    });
    this.scene.userData.staticTransformStats = this.staticTransformStats;
    return this.staticTransformStats;
  }

  buildSurroundingTerrain() {
    const geometry = createSurroundingTerrainGeometry({
      width: this.width,
      depth: this.depth,
      xCoordinates: this.terrainGridCoordinates.x,
      zCoordinates: this.terrainGridCoordinates.z,
      getHeightAt: (x, z) => this.getHeightAt(x, z),
      river: this.mapDescriptor.river,
      bridge: this.mapDescriptor.bridge,
      extensionMeters: OOB_EXTENSION_METERS,
      marginSegments: 48
    });

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      color: 0xffffff,
      roughness: 1.0,
      metalness: 0.0,
      fog: true,
      // Normal transparency preserves the smooth vertex fade. The explicit
      // negative render order places the skirt before every battlefield VFX,
      // while depth testing keeps it behind opaque battlefield geometry.
      depthTest: true,
      depthWrite: false
    });

    this.surroundingTerrainMesh = new THREE.Mesh(geometry, material);
    this.surroundingTerrainMesh.name = 'SurroundingTerrainMesh';
    this.surroundingTerrainMesh.renderOrder = -1000;
    this.surroundingTerrainMesh.userData.renderShadowPolicy = {
      castShadow: false,
      receiveShadow: true
    };
    this.scene.add(this.surroundingTerrainMesh);

    const boundaryGeometry = createMapBoundaryRibbonGeometry({
      width: this.width,
      depth: this.depth,
      xCoordinates: this.terrainGridCoordinates.x,
      zCoordinates: this.terrainGridCoordinates.z,
      getHeightAt: (x, z) => this.getHeightAt(x, z),
      ribbonWidth: 1.2,
      liftY: 0.03
    });

    const boundaryMaterial = new THREE.MeshBasicMaterial({
      color: '#34452a',
      transparent: true,
      opacity: 0.15,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.mapBoundaryRibbonMesh = new THREE.Mesh(boundaryGeometry, boundaryMaterial);
    this.mapBoundaryRibbonMesh.name = 'MapBoundaryRibbonMesh';
    this.mapBoundaryRibbonMesh.renderOrder = -999;
    this.mapBoundaryRibbonMesh.userData.renderShadowPolicy = {
      castShadow: false,
      receiveShadow: false
    };
    this.scene.add(this.mapBoundaryRibbonMesh);

    return this.surroundingTerrainMesh;
  }

  buildSkyDome() {
    const geometry = createAtmosphericSkyDomeGeometry({ radius: 1400 });
    const skyMap = createCombatMissionSkyPanoramaTexture({
      qualityTier: this.qualityTier
    });
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: skyMap,
      vertexColors: skyMap ? false : true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    });
    this.skyDomeMesh = new THREE.Mesh(geometry, material);
    this.skyDomeMesh.name = 'AtmosphericSkyDome';
    this.skyDomeMesh.renderOrder = -2000;
    this.skyDomeMesh.userData.renderShadowPolicy = {
      castShadow: false,
      receiveShadow: false
    };
    this.scene.add(this.skyDomeMesh);
    return this.skyDomeMesh;
  }

  getRawOpenGroundHeightAt(x, z) {
    let rawHeight = this.openGroundBaseHeight;
    for (let index = 0; index < this.openGroundWaves.length; index++) {
      const wave = this.openGroundWaves[index];
      const coordinate = wave.useX ? x : z;
      const angle = coordinate * wave.frequency + wave.phase;
      rawHeight += (wave.useSine ? Math.sin(angle) : Math.cos(angle)) * wave.amplitude;
    }

    const floodplain = this.openGroundFloodplain;
    if (!floodplain) return rawHeight;

    // Natural European river valley floodplain:
    // Terrain naturally flattens and levels out into a broad, gentle meadow near the river
    // rather than creating steep hill crests and canyon-like cuts directly at the water's edge.
    const floodplainRadius = floodplain.radius;
    const distToRiver = Math.abs(z - floodplain.centerZ);
    if (distToRiver >= floodplainRadius) {
      return rawHeight;
    }
    const t = distToRiver / floodplainRadius;
    const smoothT = t * t * (3 - 2 * t);
    const valleyFloorElevation = this.openGroundBaseHeight;
    return THREE.MathUtils.lerp(valleyFloorElevation, rawHeight, smoothT);
  }

  getOpenGroundHeightAt(x, z) {
    let height = this.getRawOpenGroundHeightAt(x, z);
    const cellX = Math.floor(x / this.structureTerrainPadCellSize);
    const cellZ = Math.floor(z / this.structureTerrainPadCellSize);
    const pads = this.structureTerrainPadRows.get(cellZ)?.get(cellX);
    if (!pads) return height;
    for (const pad of pads) {
      const worldDx = x - pad.centerX;
      const worldDz = z - pad.centerZ;
      const dx = Math.abs(pad.cosine * worldDx - pad.sine * worldDz);
      const dz = Math.abs(pad.sine * worldDx + pad.cosine * worldDz);

      const excessX = Math.max(0, dx - pad.halfWidth);
      const excessZ = Math.max(0, dz - pad.halfDepth);
      const distFromPad = Math.hypot(excessX, excessZ);

      if (distFromPad < pad.blendDistance) {
        const t = distFromPad / pad.blendDistance;
        const smoothT = t * t * (3 - 2 * t);
        height = THREE.MathUtils.lerp(pad.targetHeight, height, smoothT);
      }
    }
    return height;
  }

  getHeightAt(x, z) {
    const river = this.terrainRiverProfile;
    const openGround = this.getOpenGroundHeightAt(x, z);
    if (!river) return openGround;
    const distanceFromCenter = Math.abs(z - river.centerZ);
    const waterHalfWidth = river.waterHalfWidth;
    const cutHalfWidth = river.cutHalfWidth;
    if (distanceFromCenter <= waterHalfWidth) return river.bedLevel;
    if (distanceFromCenter >= cutHalfWidth) return openGround;

    const bankProgress = (distanceFromCenter - waterHalfWidth) * river.inverseBankWidth;
    return THREE.MathUtils.lerp(
      river.bedLevel,
      openGround,
      smoothstep01(bankProgress)
    );
  }

  getRenderedTerrainHeightAt(x, z) {
    const xCoordinates = this.terrainGridCoordinates?.x
      ?? Array.from(
        { length: this.segments + 1 },
        (_, index) => -this.width * 0.5
          + this.width * index / this.segments
      );
    const zCoordinates = this.terrainGridCoordinates?.z
      ?? Array.from(
        { length: this.segments + 1 },
        (_, index) => -this.depth * 0.5
          + this.depth * index / this.segments
      );
    const boundedX = THREE.MathUtils.clamp(
      x,
      xCoordinates[0],
      xCoordinates.at(-1)
    );
    const boundedZ = THREE.MathUtils.clamp(
      z,
      zCoordinates[0],
      zCoordinates.at(-1)
    );
    const column = findCoordinateInterval(xCoordinates, boundedX);
    const row = findCoordinateInterval(zCoordinates, boundedZ);
    const x0 = xCoordinates[column];
    const x1 = xCoordinates[column + 1];
    const z0 = zCoordinates[row];
    const z1 = zCoordinates[row + 1];
    const u = THREE.MathUtils.clamp(
      (boundedX - x0) / (x1 - x0),
      0,
      1
    );
    const v = THREE.MathUtils.clamp(
      (boundedZ - z0) / (z1 - z0),
      0,
      1
    );
    const southWest = this.getHeightAt(x0, z0);
    const southEast = this.getHeightAt(x1, z0);
    const northWest = this.getHeightAt(x0, z1);
    const northEast = this.getHeightAt(x1, z1);
    if (u + v <= 1) {
      return southWest
        + u * (southEast - southWest)
        + v * (northWest - southWest);
    }
    return northEast
      + (1 - u) * (northWest - northEast)
      + (1 - v) * (southEast - northEast);
  }

  getMovementHeightAt(x, z) {
    const bridge = this.bridgeSurface;
    if (
      bridge
      && Math.abs(x - bridge.centerX) <= bridge.halfRoadwayWidth
    ) {
      const distanceFromCenter = Math.abs(z - bridge.centerZ);
      if (distanceFromCenter <= bridge.halfSpan) return bridge.deckTop;
      if (
        distanceFromCenter
          <= bridge.halfSpan + bridge.approachLength
      ) {
        const progress = (
          distanceFromCenter - bridge.halfSpan
        ) / bridge.approachLength;
        return THREE.MathUtils.lerp(
          bridge.deckTop,
          this.getHeightAt(x, z),
          smoothstep01(progress)
        );
      }
    }
    return this.getHeightAt(x, z);
  }

  addColliderRecord(record) {
    const normalized = this.collisionWorld.upsertCollider(record);
    const index = this.colliderRecords.findIndex(candidate => candidate.id === normalized.id);
    if (index >= 0) this.colliderRecords[index] = normalized;
    else this.colliderRecords.push(normalized);
    return normalized;
  }

  getProjectileColliderRecords() {
    return this.collisionWorld.getRecords()
      .filter(record => record.blocksProjectiles === true)
      .map(record => ({ ...record, blocks: [...record.blocks] }));
  }

  removeColliderRecord(id) {
    const stableId = String(id);
    this.collisionWorld.removeCollider(stableId);
    this.colliderRecords = this.colliderRecords
      .filter(record => record.id !== stableId);
  }

  publishSightOccluderSnapshot() {
    if (this.sightOccluderPublicationDepth > 0) {
      this.sightOccluderPublicationPending = true;
      return this.sightOccluderSnapshot;
    }
    if (this.sightOccluderRevision >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('terrain sight revision exhausted');
    }
    this.sightOccluderRevision++;
    this.sightOccluderSnapshot = createTerrainSightOccluderSnapshot(
      this.sightOccluderRevision,
      this.bocageObstacles
    );
    this.rebuildCoverObstacleIndex();
    this.sightOccluderPublicationPending = false;
    return this.sightOccluderSnapshot;
  }

  getSightOccluderSnapshot() {
    return this.sightOccluderSnapshot;
  }

  rebuildCoverObstacleIndex() {
    this.coverObstacleCells.clear();
    for (let index = 0; index < this.bocageObstacles.length; index++) {
      const obstacle = this.bocageObstacles[index];
      if (![obstacle.minX, obstacle.maxX, obstacle.minZ, obstacle.maxZ]
        .every(Number.isFinite)) {
        continue;
      }
      const minCellX = Math.floor(obstacle.minX / this.coverObstacleCellSize);
      const maxCellX = Math.floor(obstacle.maxX / this.coverObstacleCellSize);
      const minCellZ = Math.floor(obstacle.minZ / this.coverObstacleCellSize);
      const maxCellZ = Math.floor(obstacle.maxZ / this.coverObstacleCellSize);
      const entry = { index, obstacle };
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
          const key = `${cellX}:${cellZ}`;
          const entries = this.coverObstacleCells.get(key) ?? [];
          entries.push(entry);
          this.coverObstacleCells.set(key, entries);
        }
      }
    }
  }

  queryCoverObstacles(x, z, radius) {
    const extent = Math.max(0, Number(radius) || 0);
    const minX = x - extent;
    const maxX = x + extent;
    const minZ = z - extent;
    const maxZ = z + extent;
    const minCellX = Math.floor(minX / this.coverObstacleCellSize);
    const maxCellX = Math.floor(maxX / this.coverObstacleCellSize);
    const minCellZ = Math.floor(minZ / this.coverObstacleCellSize);
    const maxCellZ = Math.floor(maxZ / this.coverObstacleCellSize);
    const entries = new Map();
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        for (const entry of this.coverObstacleCells.get(`${cellX}:${cellZ}`) ?? []) {
          const obstacle = entry.obstacle;
          if (obstacle.maxX < minX || obstacle.minX > maxX
              || obstacle.maxZ < minZ || obstacle.minZ > maxZ) {
            continue;
          }
          entries.set(entry.index, entry);
        }
      }
    }
    return [...entries.values()]
      .sort((left, right) => left.index - right.index)
      .map(entry => entry.obstacle);
  }

  addBocageObstacle(record) {
    this.bocageObstacles.push(record);
    this.publishSightOccluderSnapshot();
    return record;
  }

  syncDestructibleFenceSegment(state, segment) {
    const mesh = this.fenceMeshesByRunId.get(segment.runId);
    if (mesh) {
      const vertexIndices = mesh.geometry.userData
        .segmentVertexIndices?.[segment.segmentIndex];
      const original = mesh.geometry.userData.originalPositions;
      const positions = mesh.geometry.attributes.position;
      if (vertexIndices && original && positions) {
        for (const vertexIndex of vertexIndices) {
          const offset = vertexIndex * 3;
          if (state.destroyed) {
            const x = original[offset];
            const z = original[offset + 2];
            positions.setXYZ(
              vertexIndex,
              x,
              this.getHeightAt(x, z)
                + (mesh.userData.groundOffset ?? 0),
              z
            );
          } else {
            positions.setXYZ(
              vertexIndex,
              original[offset],
              original[offset + 1],
              original[offset + 2]
            );
          }
        }
        positions.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
      }
    }

    if (state.destroyed) {
      this.removeColliderRecord(segment.colliderId);
      this.bocageObstacles = this.bocageObstacles
        .filter(record => record.id !== segment.obstacleRecord.id);
    } else {
      this.addColliderRecord(segment.colliderRecord);
      if (!this.bocageObstacles.some(
        record => record.id === segment.obstacleRecord.id
      )) {
        this.bocageObstacles.push({ ...segment.obstacleRecord });
      }
    }
    this.publishSightOccluderSnapshot();
  }

  captureDestructibleObstacleState() {
    return this.destructibleLinearObstacles.captureState();
  }

  restoreDestructibleObstacleState(state) {
    this.sightOccluderPublicationDepth++;
    this.sightOccluderPublicationPending = true;
    try {
      return this.destructibleLinearObstacles.restoreState(state);
    } finally {
      this.sightOccluderPublicationDepth--;
      if (this.sightOccluderPublicationDepth === 0
          && this.sightOccluderPublicationPending) {
        this.publishSightOccluderSnapshot();
      }
    }
  }

  applyVehicleImpactToLinearObstacle(impact) {
    return this.destructibleLinearObstacles.applyVehicleImpact(impact);
  }

  applyBlastDamageToLinearObstacles(blast) {
    return this.destructibleLinearObstacles.applyBlast(blast);
  }

  addNavigationRecord(record) {
    const index = this.navigationRecords.findIndex(candidate => candidate.id === record.id);
    if (index >= 0) this.navigationRecords[index] = { ...record };
    else this.navigationRecords.push({ ...record });
    this.collisionWorld.setNavigationRecords(this.navigationRecords);
  }

  registerUnitColliders(units) {
    for (const unit of units ?? []) unit.bindCollisionWorld?.(this.collisionWorld);
  }

  getSurfaceAssets() {
    if (this.surfaceAssets) return this.surfaceAssets;
    const surfaceAssets = this.terrainSurfaceProvider.create(
      this.mapDescriptor.surfaces
    );
    const requiredMaterials = [
      'ground',
      'riverBank',
      'water',
      'bridgeRoad',
      'masonry',
      'sandbag',
      'hedgerow',
      'fenceCard',
      'foliageTrunk',
      'foliageLeaves',
      'foliageLeavesDark'
    ];
    if (
      !surfaceAssets
      || !surfaceAssets.materials
      || typeof surfaceAssets.dispose !== 'function'
    ) {
      throw new TypeError('Terrain surface provider must create materials and dispose');
    }
    for (const role of requiredMaterials) {
      if (!surfaceAssets.materials[role]?.isMaterial) {
        throw new TypeError(`Terrain surface provider requires material ${role}`);
      }
    }
    this.surfaceAssets = surfaceAssets;
    return surfaceAssets;
  }

  createMasonryMaterial() {
    return this.getSurfaceAssets().materials.masonry;
  }

  buildRiverAndBridge() {
    const river = this.mapDescriptor.river;
    const mapBridge = this.mapDescriptor.bridge;
    if (!river || !mapBridge) {
      this.bridgeSurface = null;
      this.riverBankStrips = [];
      return null;
    }
    const bridge = TERRAIN_SCALE.bridge;
    const surfaceMaterials = this.getSurfaceAssets().materials;
    const waterGeo = new THREE.PlaneGeometry(this.width, river.cutWidth);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = surfaceMaterials.water;
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.name = 'RiverWater';
    water.position.set(0, river.waterLevel, river.centerZ);
    water.userData.dimensionsMeters = {
      width: this.width,
      channelWidth: river.cutWidth,
      waterLevel: river.waterLevel,
      bedLevel: river.bedLevel
    };
    this.scene.add(water);

    const oobWaterMaterial = waterMat.clone();
    oobWaterMaterial.name = 'OobRiverWaterMaterial';
    oobWaterMaterial.vertexColors = true;
    oobWaterMaterial.transparent = true;
    oobWaterMaterial.depthTest = true;
    oobWaterMaterial.depthWrite = false;
    this.oobRiverWaterMaterial = oobWaterMaterial;
    this.oobRiverWaterMeshes = ['west', 'east'].map(side => {
      const geometry = createOobRiverWaterGeometry({
        channelWidth: river.cutWidth,
        extensionMeters: OOB_EXTENSION_METERS,
        side
      });
      const continuation = new THREE.Mesh(geometry, oobWaterMaterial);
      continuation.name = `OobRiverWater_${side}`;
      continuation.position.set(
        (side === 'east' ? 1 : -1)
          * (this.width * 0.5 + OOB_EXTENSION_METERS * 0.5),
        river.waterLevel,
        river.centerZ
      );
      continuation.renderOrder = -998;
      continuation.userData = {
        presentationOnly: true,
        continuationOf: 'RiverWater',
        side,
        dimensionsMeters: {
          width: OOB_EXTENSION_METERS,
          channelWidth: river.cutWidth
        }
      };
      this.scene.add(continuation);
      return continuation;
    });

    this.buildRiverBankStrips();

    const stoneMat = this.createMasonryMaterial();
    const roadMat = surfaceMaterials.bridgeRoad;
    const bridgeGroup = new THREE.Group();
    bridgeGroup.name = 'StoneBridge';
    bridgeGroup.userData.mapFeatureId = mapBridge.id;
    const halfSpan = mapBridge.span * 0.5;
    const deckTop = Math.max(
      this.getHeightAt(mapBridge.centerX, mapBridge.centerZ - halfSpan),
      this.getHeightAt(mapBridge.centerX, mapBridge.centerZ + halfSpan),
      this.getHeightAt(mapBridge.centerX, mapBridge.centerZ - halfSpan - mapBridge.approachLength),
      this.getHeightAt(mapBridge.centerX, mapBridge.centerZ + halfSpan + mapBridge.approachLength)
    ) + 0.1;
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(
        bridge.roadwayWidth,
        bridge.deckThickness,
        mapBridge.span
      ),
      roadMat
    );
    deck.name = 'BridgeDeck';
    deck.position.y = deckTop - bridge.deckThickness * 0.5;
    deck.receiveShadow = true;
    bridgeGroup.add(deck);
    const parapetCenterX = (
      bridge.roadwayWidth - bridge.parapetThickness
    ) * 0.5;
    const parapetInnerHalfWidth = parapetCenterX - bridge.parapetThickness * 0.5;
    this.bridgeSurface = {
      centerX: mapBridge.centerX,
      centerZ: mapBridge.centerZ,
      halfRoadwayWidth: parapetInnerHalfWidth,
      halfSpan,
      approachLength: mapBridge.approachLength,
      deckTop
    };

    for (const direction of [-1, 1]) {
      const approach = new THREE.Mesh(
        createBridgeApproachGeometry({
          halfWidth: parapetInnerHalfWidth,
          deckEndZ: direction * halfSpan,
          direction,
          length: mapBridge.approachLength,
          deckTop,
          getGroundHeightAt: (localX, localZ) => this.getHeightAt(
            mapBridge.centerX + localX,
            mapBridge.centerZ + localZ
          )
        }),
        roadMat
      );
      approach.name = 'BridgeApproach';
      approach.receiveShadow = true;
      approach.userData.mapFeatureId = mapBridge.id;
      approach.userData.side = direction < 0 ? 'south' : 'north';
      approach.userData.dataQuality = mapBridge.approachDataQuality;
      bridgeGroup.add(approach);
    }

    const parapetGeometry = createMeterUvBoxGeometry(
      bridge.parapetThickness,
      bridge.parapetHeight,
      mapBridge.span,
      bridge.masonryRepeatMeters
    );
    const bridgeBoundaryColliderIds = [];
    for (const side of [-1, 1]) {
      const parapet = new THREE.Mesh(parapetGeometry, stoneMat);
      parapet.name = 'BridgeParapet';
      parapet.position.set(
        side * (bridge.roadwayWidth - bridge.parapetThickness) * 0.5,
        deckTop + bridge.parapetHeight * 0.5,
        0
      );
      parapet.castShadow = true;
      parapet.receiveShadow = true;
      bridgeGroup.add(parapet);
      const parapetColliderId =
        `bridge:parapet:${side < 0 ? 'west' : 'east'}`;
      bridgeBoundaryColliderIds.push(parapetColliderId);
      this.addColliderRecord({
        id: parapetColliderId,
        type: 'bridge_parapet',
        mapFeatureId: mapBridge.id,
        centerX: mapBridge.centerX + side * parapetCenterX,
        centerZ: mapBridge.centerZ,
        halfX: bridge.parapetThickness * 0.5,
        halfZ: mapBridge.span * 0.5,
        rotation: 0,
        blocks: ['vehicle', 'infantry']
      });
    }

    const abutmentWidth = bridge.parapetThickness * 2;
    const abutmentDepth = 1.2;
    const abutmentGeometry = createMeterUvBoxGeometry(
      abutmentWidth,
      bridge.parapetHeight + 0.35,
      abutmentDepth,
      bridge.masonryRepeatMeters
    );
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const abutment = new THREE.Mesh(abutmentGeometry, stoneMat);
        abutment.name = 'BridgeAbutment';
        abutment.position.set(
          side * (bridge.roadwayWidth - abutmentWidth) * 0.5,
          deckTop + (bridge.parapetHeight + 0.35) * 0.5,
          end * (halfSpan + abutmentDepth * 0.5)
        );
        abutment.castShadow = true;
        abutment.receiveShadow = true;
        bridgeGroup.add(abutment);
        const abutmentColliderId =
          `bridge:abutment:${side < 0 ? 'west' : 'east'}:${end < 0 ? 'south' : 'north'}`;
        bridgeBoundaryColliderIds.push(abutmentColliderId);
        this.addColliderRecord({
          id: abutmentColliderId,
          type: 'bridge_abutment',
          mapFeatureId: mapBridge.id,
          centerX: mapBridge.centerX + abutment.position.x,
          centerZ: mapBridge.centerZ + abutment.position.z,
          halfX: abutmentWidth * 0.5,
          halfZ: abutmentDepth * 0.5,
          rotation: 0,
          blocks: ['vehicle', 'infantry']
        });
      }
    }

    const pierHeight = deckTop - bridge.deckThickness - river.bedLevel;
    const pierGeometry = createMeterUvBoxGeometry(
      bridge.roadwayWidth + 0.5,
      pierHeight,
      0.8,
      bridge.masonryRepeatMeters
    );
    for (const z of [-river.waterWidth * 0.38, river.waterWidth * 0.38]) {
      const pier = new THREE.Mesh(pierGeometry, stoneMat);
      pier.name = 'BridgePier';
      pier.position.set(0, river.bedLevel + pierHeight * 0.5, z);
      pier.castShadow = true;
      pier.receiveShadow = true;
      bridgeGroup.add(pier);
    }
    bridgeGroup.position.set(mapBridge.centerX, 0, mapBridge.centerZ);
    bridgeGroup.userData.dimensionsMeters = {
      width: bridge.roadwayWidth,
      length: mapBridge.span,
      approachLength: mapBridge.approachLength,
      deckTop
    };
    this.scene.add(bridgeGroup);

    const openingHalfWidth = parapetInnerHalfWidth;
    const mapMinX = -this.width * 0.5;
    const mapMaxX = this.width * 0.5;
    const openingMinX = mapBridge.centerX - openingHalfWidth;
    const openingMaxX = mapBridge.centerX + openingHalfWidth;
    const exclusions = [
      {
        side: 'west',
        minX: mapMinX,
        maxX: openingMinX
      },
      {
        side: 'east',
        minX: openingMaxX,
        maxX: mapMaxX
      }
    ];
    const riverExclusionIds = [];
    for (const exclusion of exclusions) {
      const exclusionId = `river:exclusion:${exclusion.side}`;
      riverExclusionIds.push(exclusionId);
      this.addColliderRecord({
        id: exclusionId,
        type: 'river_exclusion',
        mapFeatureId: river.id,
        centerX: (exclusion.minX + exclusion.maxX) * 0.5,
        centerZ: river.centerZ,
        halfX: (exclusion.maxX - exclusion.minX) * 0.5,
        halfZ: river.cutWidth * 0.5,
        rotation: 0,
        blocks: ['vehicle', 'infantry']
      });
    }
    this.addNavigationRecord({
      id: `navigation:${mapBridge.id}`,
      type: 'bridge_crossing',
      mapFeatureId: mapBridge.id,
      centerX: mapBridge.centerX,
      minZ: mapBridge.centerZ - halfSpan,
      maxZ: mapBridge.centerZ + halfSpan,
      halfOpeningWidth: openingHalfWidth,
      barrierColliderIds: riverExclusionIds,
      boundaryColliderIds: bridgeBoundaryColliderIds,
      blocks: ['vehicle', 'infantry']
    });
  }

  buildRiverBankStrips() {
    const river = this.mapDescriptor.river;
    const material = this.getSurfaceAssets().materials.riverBank;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    const halfWaterWidth = river.waterWidth * 0.5;
    const halfCutWidth = river.cutWidth * 0.5;
    const minX = -this.width * 0.5;
    const maxX = this.width * 0.5;
    const createStrip = (side) => {
      const direction = side === 'north' ? 1 : -1;
      const innerZ = river.centerZ + direction * halfWaterWidth;
      const outerZ = river.centerZ + direction * halfCutWidth;
      const minZ = Math.min(innerZ, outerZ);
      const maxZ = Math.max(innerZ, outerZ);
      const positions = [];
      const uvs = [];
      const indices = [];
      for (let row = 0; row <= RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS; row++) {
        const z = THREE.MathUtils.lerp(
          minZ,
          maxZ,
          row / RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS
        );
        for (let column = 0; column <= RIVER_BANK_X_SUBDIVISIONS; column++) {
          const x = THREE.MathUtils.lerp(minX, maxX, column / RIVER_BANK_X_SUBDIVISIONS);
          positions.push(
            x,
            this.getRenderedTerrainHeightAt(x, z)
              + RIVER_BANK_SURFACE_OFFSET,
            z
          );
          uvs.push(
            column / RIVER_BANK_X_SUBDIVISIONS,
            row / RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS
          );
        }
      }
      for (let row = 0; row < RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS; row++) {
        for (let column = 0; column < RIVER_BANK_X_SUBDIVISIONS; column++) {
          const a = row * (RIVER_BANK_X_SUBDIVISIONS + 1) + column;
          const b = a + 1;
          const c = a + RIVER_BANK_X_SUBDIVISIONS + 1;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `RiverBank${side[0].toUpperCase()}${side.slice(1)}`;
      mesh.receiveShadow = true;
      mesh.userData.mapFeatureId = river.id;
      mesh.userData.side = side;
      mesh.userData.materialRole = 'riverBank';
      mesh.userData.worldBounds = { minX, maxX, minZ, maxZ };
      mesh.userData.bankEdges = { innerZ, outerZ };
      mesh.userData.rendererApproximation = {
        label: RIVER_BANK_RENDERER_APPROXIMATION,
        xSubdivisions: RIVER_BANK_X_SUBDIVISIONS,
        crossSlopeSubdivisions: RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS,
        surfaceOffset: RIVER_BANK_SURFACE_OFFSET,
        depthBias: {
          factor: material.polygonOffsetFactor,
          units: material.polygonOffsetUnits
        }
      };
      this.scene.add(mesh);
      return mesh;
    };
    this.riverBankStrips = [createStrip('south'), createStrip('north')];
    return this.riverBankStrips;
  }

  buildStoneWalls() {
    this.stoneWallSegments = [];
    this.fenceCardRuns = [];
    this.wallJunctionMeshes = [];
    this.boundaryMeshes = [];
    this.fenceMeshesByRunId.clear();
    this.destructibleLinearObstacles.clear();
    const allWallRuns = this.mapDescriptor.wallRuns;

    const createWallRun = (run) => {
      const profile = this.mapDescriptor.wallProfiles[run.profileId];
      const material = this.getSurfaceAssets().materials[profile.materialRole];
      if (!material?.isMaterial) {
        throw new Error(
          `Wall profile ${profile.id} requires material ${profile.materialRole}`
        );
      }
      const [startX, startZ] = run.start;
      const [endX, endZ] = run.end;
      const runId = run.id;
      const dx = endX - startX;
      const dz = endZ - startZ;
      const runLength = Math.hypot(dx, dz);
      const segmentCount = Math.ceil(runLength / profile.maximumSegmentLength);

      const addBoundaryRecords = ({
        index,
        start,
        end,
        bounds,
        length
      }) => {
        const obstacleRecord = {
          id: `${runId}_${index}`,
          minX: bounds.min.x,
          maxX: bounds.max.x,
          minY: bounds.min.y,
          maxY: bounds.max.y,
          minZ: bounds.min.z,
          maxZ: bounds.max.z,
          height: profile.height,
          thickness: profile.thickness,
          type: profile.collisionType,
          occludesSight: profile.occludesSight,
          enclosureId: run.enclosureId ?? null,
          adjacentGateId: run.adjacentGateId ?? null,
          sightRunId: runId
        };
        this.bocageObstacles.push(obstacleRecord);
        const colliderRecord = this.addColliderRecord({
          id: `wall:${runId}:${index}`,
          type: profile.collisionType,
          mapFeatureId: runId,
          enclosureId: run.enclosureId ?? null,
          adjacentGateId: run.adjacentGateId ?? null,
          centerX: (start.x + end.x) * 0.5,
          centerY: (bounds.min.y + bounds.max.y) * 0.5,
          centerZ: (start.z + end.z) * 0.5,
          halfX: profile.thickness * 0.5,
          halfHeight: (bounds.max.y - bounds.min.y) * 0.5,
          halfZ: length * 0.5,
          rotation: Math.atan2(end.x - start.x, end.z - start.z),
          blocks: profile.blocks,
          blocksProjectiles: profile.blocksProjectiles === true,
          projectileCoverDataQuality: profile.dataQuality
        });
        return { obstacleRecord, colliderRecord };
      };

      if (profile.presentationKind === 'alpha-tested-card') {
        const start = { x: startX, z: startZ };
        const end = { x: endX, z: endZ };
        const geometry = createGroundConformingFenceCardGeometry({
          start,
          end,
          height: profile.height,
          thickness: profile.thickness,
          maximumSegmentLength: profile.maximumSegmentLength,
          textureRepeatMeters: profile.textureRepeatMeters,
          groundOffset: profile.groundOffset,
          getHeightAt: (x, z) => this.getHeightAt(x, z)
        });
        const fence = new THREE.Mesh(geometry, material);
        fence.name = `FenceCard_${runId}`;
        fence.castShadow = false;
        fence.receiveShadow = true;
        fence.userData.terrainFeature = profile.collisionType;
        fence.userData.runId = runId;
        fence.userData.profileId = profile.id;
        fence.userData.enclosureId = run.enclosureId ?? null;
        fence.userData.boundarySide = run.boundarySide ?? null;
        fence.userData.adjacentGateId = run.adjacentGateId ?? null;
        fence.userData.start = [
          start.x,
          this.getHeightAt(start.x, start.z),
          start.z
        ];
        fence.userData.end = [
          end.x,
          this.getHeightAt(end.x, end.z),
          end.z
        ];
        fence.userData.dimensionsMeters = {
          height: profile.height,
          thickness: profile.thickness,
          length: runLength
        };
        fence.userData.groundOffset = profile.groundOffset;
        fence.userData.rendererApproximation = {
          presentationKind: profile.presentationKind,
          alphaTested: true,
          blendedTransparency: false,
          terrainSamples: geometry.userData.groundSamples.length,
          dataQuality: profile.dataQuality
        };
        this.scene.add(fence);
        this.fenceCardRuns.push(fence);
        this.boundaryMeshes.push(fence);
        this.fenceMeshesByRunId.set(runId, fence);

        for (let index = 0; index < segmentCount; index++) {
          const startT = index / segmentCount;
          const endT = (index + 1) / segmentCount;
          const segmentStart = {
            x: startX + dx * startT,
            z: startZ + dz * startT
          };
          const segmentEnd = {
            x: startX + dx * endT,
            z: startZ + dz * endT
          };
          const bounds = new THREE.Box3();
          for (const vertexIndex of geometry.userData.segmentVertexIndices[index]) {
            bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(
              geometry.attributes.position,
              vertexIndex
            ));
          }
          const records = addBoundaryRecords({
            index,
            start: segmentStart,
            end: segmentEnd,
            bounds,
            length: runLength / segmentCount
          });
          this.destructibleLinearObstacles.registerSegment({
            id: `fence:${runId}:${index}`,
            colliderId: records.colliderRecord.id,
            runId,
            segmentIndex: index,
            start: [segmentStart.x, segmentStart.z],
            end: [segmentEnd.x, segmentEnd.z],
            colliderRecord: records.colliderRecord,
            obstacleRecord: records.obstacleRecord,
            policy: profile.destruction
          });
        }
        return;
      }

      for (let index = 0; index < segmentCount; index++) {
        const startT = index / segmentCount;
        const endT = (index + 1) / segmentCount;
        const start = {
          x: startX + dx * startT,
          z: startZ + dz * startT
        };
        const end = {
          x: startX + dx * endT,
          z: startZ + dz * endT
        };
        const startFootprint = index === 0
          ? resolveWallEndpointFootprint({
              run,
              endpoint: 'start',
              runs: allWallRuns,
              thickness: profile.thickness
            })
          : null;
        const endFootprint = index === segmentCount - 1
          ? resolveWallEndpointFootprint({
              run,
              endpoint: 'end',
              runs: allWallRuns,
              thickness: profile.thickness
            })
          : null;
        const geometry = createGroundConformingWallGeometry({
          start,
          end,
          height: profile.height,
          thickness: profile.thickness,
          getHeightAt: (x, z) => this.getHeightAt(x, z),
          startFootprint,
          endFootprint,
          capStart: index === 0 && !startFootprint,
          capEnd: index === segmentCount - 1 && !endFootprint,
          textureRepeatMeters: profile.textureRepeatMeters,
          textureRepeatHeightMeters: profile.textureRepeatHeightMeters
        });
        let collisionBounds = geometry.boundingBox;
        if (startFootprint || endFootprint) {
          const collisionGeometry = createGroundConformingWallGeometry({
            start,
            end,
            height: profile.height,
            thickness: profile.thickness,
            getHeightAt: (x, z) => this.getHeightAt(x, z)
          });
          collisionBounds = collisionGeometry.boundingBox.clone();
          collisionGeometry.dispose();
        }
        const wall = new THREE.Mesh(geometry, material);
        wall.name = `StoneWall_${runId}_${index}`;
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.userData.terrainFeature = profile.collisionType;
        wall.userData.runId = runId;
        wall.userData.profileId = profile.id;
        wall.userData.enclosureId = run.enclosureId ?? null;
        wall.userData.boundarySide = run.boundarySide ?? null;
        wall.userData.adjacentGateId = run.adjacentGateId ?? null;
        wall.userData.segmentIndex = index;
        wall.userData.cornerJoin = {
          start: Boolean(startFootprint),
          end: Boolean(endFootprint),
          startKind: startFootprint?.kind ?? null,
          endKind: endFootprint?.kind ?? null,
          presentationOnly: true
        };
        wall.userData.start = [start.x, this.getHeightAt(start.x, start.z), start.z];
        wall.userData.end = [end.x, this.getHeightAt(end.x, end.z), end.z];
        wall.userData.dimensionsMeters = {
          height: profile.height,
          thickness: profile.thickness,
          length: runLength / segmentCount
        };
        this.scene.add(wall);
        if (profile.collisionType === 'stonewall') {
          this.stoneWallSegments.push(wall);
        }
        this.boundaryMeshes.push(wall);

        addBoundaryRecords({
          index,
          start,
          end,
          bounds: collisionBounds,
          length: runLength / segmentCount
        });
      }
    };

    for (const run of this.mapDescriptor.wallRuns) createWallRun(run);
    const endpointGroups = new Map();
    for (const run of this.mapDescriptor.wallRuns) {
      const profile = this.mapDescriptor.wallProfiles[run.profileId];
      if (profile.presentationKind !== 'solid-prism') continue;
      for (const [endpoint, point] of [['start', run.start], ['end', run.end]]) {
        const key = `${run.profileId}:${point[0]}:${point[1]}`;
        const group = endpointGroups.get(key) ?? {
          key,
          point,
          profile,
          connections: []
        };
        const other = endpoint === 'start' ? run.end : run.start;
        const length = Math.hypot(other[0] - point[0], other[1] - point[1]);
        if (length > 0) {
          group.connections.push({
            run,
            direction: {
              x: (other[0] - point[0]) / length,
              z: (other[1] - point[1]) / length
            }
          });
        }
        endpointGroups.set(key, group);
      }
    }
    for (const group of [...endpointGroups.values()]
      .sort((left, right) => left.key.localeCompare(right.key))) {
      if (group.connections.length !== 3) continue;
      const directions = group.connections.map(connection => connection.direction);
      const hasOpposedPair = directions.some((left, leftIndex) =>
        directions.some((right, rightIndex) => rightIndex > leftIndex
          && left.x * right.x + left.z * right.z < -0.999));
      if (!hasOpposedPair) continue;
      const material = this.getSurfaceAssets().materials[group.profile.materialRole];
      const geometry = createGroundConformingTeeJunctionGeometry({
        center: { x: group.point[0], z: group.point[1] },
        directions,
        height: group.profile.height,
        thickness: group.profile.thickness,
        textureRepeatMeters: group.profile.textureRepeatMeters,
        textureRepeatHeightMeters: group.profile.textureRepeatHeightMeters,
        getHeightAt: (x, z) => this.getHeightAt(x, z)
      });
      const junction = new THREE.Mesh(geometry, material);
      junction.name = `StoneWallJunction_T_${group.point[0]}_${group.point[1]}`;
      junction.castShadow = true;
      junction.receiveShadow = true;
      junction.userData = {
        semantic: 'wall-junction',
        junctionKind: 'tee',
        profileId: group.profile.id,
        connectedRunIds: group.connections
          .map(connection => connection.run.id)
          .sort((left, right) => String(left).localeCompare(String(right))),
        presentationOnly: true
      };
      this.scene.add(junction);
      this.wallJunctionMeshes.push(junction);
      this.boundaryMeshes.push(junction);
    }
    this.publishSightOccluderSnapshot();
  }

  replaceBuildingCollisionRecords(buildingId, sourceRecords, minimumGroundY, foundationTopY) {
    const previousIds = this.colliderRecords
      .filter(record => record.buildingId === buildingId)
      .map(record => record.id);
    for (const id of previousIds) this.collisionWorld.removeCollider(id);
    this.colliderRecords = this.colliderRecords
      .filter(record => record.buildingId !== buildingId);
    this.bocageObstacles = this.bocageObstacles
      .filter(record => record.buildingId !== buildingId);

    const movementRecords = sourceRecords
      .filter(record => (record.sectionId === 'ground-shell' || record.sectionId === 'rubble')
        && (record.blocks ?? []).some(block => block === 'vehicle' || block === 'infantry'))
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const sourceRecord of movementRecords) {
      const record = {
        ...sourceRecord,
        mapFeatureId: sourceRecord.mapFeatureId ?? buildingId,
        halfX: sourceRecord.halfX ?? sourceRecord.halfWidth,
        halfZ: sourceRecord.halfZ ?? sourceRecord.halfDepth
      };
      this.addColliderRecord(record);
      const cosine = Math.abs(Math.cos(record.rotation ?? 0));
      const sine = Math.abs(Math.sin(record.rotation ?? 0));
      const extentX = cosine * record.halfX + sine * record.halfZ;
      const extentZ = sine * record.halfX + cosine * record.halfZ;
      this.bocageObstacles.push({
        id: record.id,
        buildingId,
        minX: record.centerX - extentX,
        maxX: record.centerX + extentX,
        minZ: record.centerZ - extentZ,
        maxZ: record.centerZ + extentZ,
        minY: record.minY ?? minimumGroundY,
        maxY: record.maxY ?? foundationTopY,
        height: (record.maxY ?? foundationTopY) - (record.minY ?? minimumGroundY),
        type: record.sectionId === 'rubble' ? 'rubble' : 'building',
        sectionId: record.sectionId
      });
    }
    return {
      removedColliderIds: previousIds.sort(),
      colliderIds: movementRecords.map(record => record.id),
      obstacleIds: this.bocageObstacles
        .filter(record => record.buildingId === buildingId)
        .map(record => record.id)
        .sort()
    };
  }

  syncBuildingRuntime(buildingId, { collapseProjection = 'transition' } = {}) {
    if (!this.buildingSystem) return null;
    const building = this.buildings.find(record => record.id === buildingId);
    if (!building) return null;
    const runtime = this.buildingSystem.getBuildingSnapshot(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    building.adapter.applyVisualState(building.object, descriptor, runtime, {
      interiorPresence: building.interiorPresence ?? 0,
      collapseProjection
    });
    building.runtimeSnapshot = runtime;
    const footprintCorners = building.object.userData?.foundation?.footprintCorners ?? [];
    const minimumGroundY = footprintCorners.length > 0
      ? Math.min(...footprintCorners.map(([, y]) => y))
      : building.object.position.y;
    const foundationTopY = building.object.userData?.foundation?.topY
      ?? building.object.position.y;
    const collision = this.replaceBuildingCollisionRecords(
      buildingId,
      this.buildingSystem.getMovementCollisionSnapshot(buildingId).records,
      minimumGroundY,
      foundationTopY
    );
    building.runtimeEventVersion = runtime.eventVersion ?? 0;
    building.runtimeCollisionVersion = runtime.collisionVersion ?? 0;
    return { buildingId, runtime, collision };
  }

  /**
   * Advance renderer-owned building transitions from cached authoritative
   * snapshots. Simulation state, collision, apertures, and occupants are never
   * mutated here.
   */
  updateBuildingPresentation(deltaTime) {
    const dt = Math.max(0, Number(deltaTime) || 0);
    if (dt === 0) return 0;
    let advanced = 0;
    for (let index = 0; index < this.buildings.length; index++) {
      const building = this.buildings[index];
      if (
        !building.runtimeSnapshot
        || !building.adapter.advanceVisualState
        || !building.adapter.hasActiveVisualTransition?.(building.object)
      ) {
        continue;
      }
      building.adapter.advanceVisualState(
        building.object,
        building.runtimeSnapshot,
        dt
      );
      advanced++;
    }
    return advanced;
  }

  /**
   * Presentation-only occupancy projection. BuildingInteractionSystem owns
   * the individual transit state; this method deliberately does not touch
   * collision, LOS, or authoritative building state.
   */
  setBuildingInteriorPresence(buildingId, presence) {
    if (!this.buildingSystem) return null;
    const building = this.buildings.find(record => record.id === buildingId);
    if (!building) return null;
    const nextPresence = Math.max(0, Number(presence) || 0);
    if (building.interiorPresence === nextPresence) return {
      buildingId,
      interiorPresence: nextPresence,
      changed: false
    };
    building.interiorPresence = nextPresence;
    const runtime = building.runtimeSnapshot
      ?? this.buildingSystem.getBuildingSnapshot(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    building.adapter.applyVisualState(building.object, descriptor, runtime, {
      interiorPresence: nextPresence,
      collapseProjection: 'preserve'
    });
    return { buildingId, interiorPresence: nextPresence, changed: true };
  }

  buildStructures() {
    const placements = this.mapDescriptor.structures;
    if (placements.length > 0 && !this.buildingSystem) {
      throw new Error(`Map ${this.mapDescriptor.id} structures require a BuildingSystem`);
    }

    for (const placement of placements) {
      const adapter = this.structureAdapters[placement.visualAdapterId];
      if (!adapter?.descriptor || !adapter?.createVisual || !adapter?.applyVisualState) {
        throw new Error(
          `Map structure ${placement.id} requires visual adapter ${placement.visualAdapterId}`
        );
      }
      if (adapter.descriptor.id !== placement.descriptorId) {
        throw new Error(
          `Map structure ${placement.id} descriptor ${placement.descriptorId} does not match adapter ${adapter.descriptor.id}`
        );
      }

      const descriptor = adapter.descriptor;
      const [centerX, centerZ] = placement.position;
      const rotationY = placement.rotationY ?? 0;
      const cosine = Math.cos(rotationY);
      const sine = Math.sin(rotationY);
      const localCorners = [
        [descriptor.bounds.min[0], descriptor.bounds.max[2]],
        [descriptor.bounds.max[0], descriptor.bounds.max[2]],
        [descriptor.bounds.max[0], descriptor.bounds.min[2]],
        [descriptor.bounds.min[0], descriptor.bounds.min[2]]
      ];
      const groundCorners = localCorners.map(([localX, localZ]) => {
        const x = centerX + localX * cosine + localZ * sine;
        const z = centerZ - localX * sine + localZ * cosine;
        return [x, this.getHeightAt(x, z), z];
      });
      const minimumGroundY = Math.min(...groundCorners.map(([, y]) => y));
      const foundationTopY = Math.max(...groundCorners.map(([, y]) => y))
        + (placement.foundationClearance ?? 0);

      let runtime;
      try {
        runtime = this.buildingSystem.getBuildingSnapshot(placement.id);
      } catch {
        runtime = this.buildingSystem.addBuilding({
          id: placement.id,
          descriptor,
          destructionThresholds: placement.destructionThresholds,
          transform: {
            position: [centerX, foundationTopY, centerZ],
            rotationY
          }
        });
      }
      const object = adapter.createVisual({
        descriptor,
        runtime,
        centerX,
        centerZ,
        foundationTopY,
        getHeightAt: (x, z) => this.getHeightAt(x, z),
        styleId: placement.styleId,
        facadeId: placement.facadeId,
        roofStyleId: placement.roofStyleId
      });
      this.scene.add(object);
      this.buildings.push({
        id: placement.id,
        mapFeatureId: placement.id,
        descriptorId: descriptor.id,
        visualAdapterId: placement.visualAdapterId,
        adapter,
        object,
        interiorPresence: 0,
        runtimeSnapshot: runtime,
        runtimeEventVersion: runtime.eventVersion ?? 0,
        runtimeCollisionVersion: runtime.collisionVersion ?? 0
      });

      // BuildingSystem remains sole topology and aperture authority. Ground
      // movement consumes only its current ground-shell/rubble snapshot.
      this.replaceBuildingCollisionRecords(
        placement.id,
        this.buildingSystem.getMovementCollisionSnapshot(placement.id).records,
        minimumGroundY,
        foundationTopY
      );
    }
  }

  buildFoliage() {
    const treeDimensions = TERRAIN_SCALE.matureTree;
    const surfaceMaterials = this.getSurfaceAssets().materials;
    const trunkMat = surfaceMaterials.foliageTrunk;
    const leavesMat = surfaceMaterials.foliageLeaves;
    const leavesDarkMat = surfaceMaterials.foliageLeavesDark;
    const trunkGeometry = new THREE.CylinderGeometry(
      treeDimensions.trunkRadius * 0.72,
      treeDimensions.trunkRadius,
      treeDimensions.trunkHeight,
      6
    );
    // One shared detail-0 crown has 20 triangles. The previous detail-1 crown
    // had 80; three authored crown placements now submit 75% fewer canopy
    // triangles without adding objects or changing tree datums.
    const foliageGeometry = new THREE.IcosahedronGeometry(
      treeDimensions.canopyRadius,
      0
    );
    const entries = this.getRenderableFoliageEntries();
    if (this.mapDescriptor.foliageRendering?.mode === 'instanced') {
      const mapFeatureIds = entries.map(entry => entry.id);
      const dummy = new THREE.Object3D();
      const buildInstances = ({
        name,
        geometry,
        material,
        localPosition,
        scale = 1
      }) => {
        const mesh = new THREE.InstancedMesh(
          geometry,
          material,
          entries.length
        );
        mesh.name = name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        entries.forEach((entry, index) => {
          const [x, z] = entry.position;
          const groundY = this.getHeightAt(x, z);
          const presentation = foliagePresentation(entry);
          const instanceScale = scale * presentation.scale;
          const cosine = Math.cos(presentation.rotationY);
          const sine = Math.sin(presentation.rotationY);
          const localX = (
            localPosition[0] * cosine + localPosition[2] * sine
          ) * instanceScale;
          const localZ = (
            -localPosition[0] * sine + localPosition[2] * cosine
          ) * instanceScale;
          dummy.position.set(
            x + localX,
            groundY + localPosition[1] * instanceScale,
            z + localZ
          );
          dummy.rotation.set(0, presentation.rotationY, 0);
          dummy.scale.setScalar(instanceScale);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.mapFeatureIds = mapFeatureIds;
        mesh.userData.profileId = 'mature-tree';
        mesh.userData.renderMode = 'instanced';
        mesh.userData.excludedMapFeatureIds = [
          ...this.foliageExcludedFeatureIds
        ];
        mesh.userData.dataQuality =
          this.mapDescriptor.foliageRendering.dataQuality;
        this.scene.add(mesh);
        return mesh;
      };
      const crownBase = treeDimensions.totalHeight
        - treeDimensions.canopyRadius;
      this.foliageInstances = [
        buildInstances({
          name: 'MatureTreeTrunks',
          geometry: trunkGeometry,
          material: trunkMat,
          localPosition: [0, treeDimensions.trunkHeight * 0.5, 0]
        }),
        buildInstances({
          name: 'MatureTreeCrownsPrimary',
          geometry: foliageGeometry,
          material: leavesMat,
          localPosition: [0, crownBase, 0]
        }),
        buildInstances({
          name: 'MatureTreeCrownsWest',
          geometry: foliageGeometry,
          material: leavesDarkMat,
          localPosition: [-1.7, crownBase - 0.7, 0.4],
          scale: 0.72
        }),
        buildInstances({
          name: 'MatureTreeCrownsEast',
          geometry: foliageGeometry,
          material: leavesDarkMat,
          localPosition: [1.55, crownBase - 0.5, -0.5],
          scale: 0.76
        })
      ];
      this.foliageReady = typeof document === 'undefined' || !this.foliageTemplateProvider
        ? Promise.resolve(this.foliageInstances)
        : this.upgradeInstancedFoliageWithTemplate(this.foliageInstances);
      return this.foliageInstances;
    }

    entries.forEach((entry) => {
      const [x, z] = entry.position;
      const tree = new THREE.Group();
      tree.name = 'MatureTree';
      tree.userData.mapFeatureId = entry.id;
      tree.userData.profileId = entry.profileId;
      const trunk = new THREE.Mesh(trunkGeometry, trunkMat);
      trunk.position.y = treeDimensions.trunkHeight * 0.5;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      tree.add(trunk);

      const crownBase = treeDimensions.totalHeight - treeDimensions.canopyRadius;
      const crownPlacements = [
        [0, crownBase, 0, 1],
        [-1.7, crownBase - 0.7, 0.4, 0.72],
        [1.55, crownBase - 0.5, -0.5, 0.76]
      ];
      crownPlacements.forEach(([cx, cy, cz, scale], index) => {
        const foliage = new THREE.Mesh(
          foliageGeometry,
          index === 0 ? leavesMat : leavesDarkMat
        );
        foliage.position.set(cx, cy, cz);
        foliage.scale.setScalar(scale);
        foliage.castShadow = true;
        foliage.receiveShadow = true;
        tree.add(foliage);
      });

      tree.position.set(x, this.getHeightAt(x, z), z);
      tree.userData.dimensionsMeters = {
        height: treeDimensions.totalHeight,
        trunkRadius: treeDimensions.trunkRadius,
        canopyRadius: treeDimensions.canopyRadius
      };
      this.scene.add(tree);
    });
    this.foliageReady = Promise.resolve([]);
  }

  getRenderableFoliageEntries() {
    const roadPolygons = (this.mapDescriptor.surfaces?.layers ?? [])
      .filter(layer => ['road', 'farm-lane', 'bridge-road'].includes(layer.kind))
      .map(layer => ({
        id: layer.id,
        polygon: surfaceLayerWorldPolygon(this.mapDescriptor, layer)
      }))
      .filter(record => record.polygon.length >= 3);
    const exclusions = [];
    const entries = this.mapDescriptor.foliage.filter(entry => {
      const presentation = foliagePresentation(entry);
      const canopyClearance = TERRAIN_SCALE.matureTree.canopyRadius
        * presentation.scale + 0.35;
      for (const structure of this.mapDescriptor.structures ?? []) {
        const descriptor = this.structureAdapters[structure.visualAdapterId]?.descriptor;
        if (!descriptor?.bounds) continue;
        const dx = entry.position[0] - structure.position[0];
        const dz = entry.position[1] - structure.position[1];
        const rotationY = structure.rotationY ?? 0;
        const cosine = Math.cos(rotationY);
        const sine = Math.sin(rotationY);
        const localX = dx * cosine - dz * sine;
        const localZ = dx * sine + dz * cosine;
        const nearestX = THREE.MathUtils.clamp(
          localX,
          descriptor.bounds.min[0],
          descriptor.bounds.max[0]
        );
        const nearestZ = THREE.MathUtils.clamp(
          localZ,
          descriptor.bounds.min[2],
          descriptor.bounds.max[2]
        );
        if (Math.hypot(localX - nearestX, localZ - nearestZ) <= canopyClearance) {
          exclusions.push({ entry, reason: `structure:${structure.id}` });
          return false;
        }
      }

      const roadClearance = TERRAIN_SCALE.matureTree.trunkRadius
        * presentation.scale + 0.5;
      for (const road of roadPolygons) {
        const inRoad = pointInPolygonXZ(entry.position, road.polygon);
        const nearRoad = road.polygon.some((point, index) => (
          pointToSegmentDistanceXZ(
            entry.position,
            point,
            road.polygon[(index + 1) % road.polygon.length]
          ) <= roadClearance
        ));
        if (inRoad || nearRoad) {
          exclusions.push({ entry, reason: `road:${road.id}` });
          return false;
        }
      }
      return true;
    });
    this.renderedFoliageEntries = entries;
    this.foliageExcludedFeatureIds = exclusions.map(({ entry }) => entry.id);
    return entries;
  }

  async upgradeInstancedFoliageWithTemplate(expectedInstances) {
    try {
      const template = await this.foliageTemplateProvider.createTemplate({
        profileId: 'mature-tree',
        seed: 12345
      });
      if (!template) return expectedInstances;
      if (this.foliageInstances !== expectedInstances) {
        template.branchGeometry.dispose();
        template.leafGeometry.dispose();
        return this.foliageInstances;
      }

      const [branches, leaves, ...obsoleteCrowns] = expectedInstances;
      const obsoleteGeometries = new Set(expectedInstances.map(mesh => mesh.geometry));
      for (const mesh of obsoleteCrowns) this.scene.remove(mesh);

      branches.geometry = template.branchGeometry;
      branches.name = 'MatureTreeTemplateBranches';
      branches.userData.generator = template.generator;
      branches.userData.dataQuality = template.dataQuality;
      leaves.geometry = template.leafGeometry;
      leaves.name = 'MatureTreeTemplateLeaves';
      leaves.userData.generator = template.generator;
      leaves.userData.dataQuality = template.dataQuality;
      const dummy = new THREE.Object3D();
      this.renderedFoliageEntries.forEach((entry, index) => {
        const [x, z] = entry.position;
        const presentation = foliagePresentation(entry);
        dummy.position.set(x, this.getHeightAt(x, z), z);
        dummy.rotation.set(0, presentation.rotationY, 0);
        dummy.scale.setScalar(presentation.scale);
        dummy.updateMatrix();
        branches.setMatrixAt(index, dummy.matrix);
        leaves.setMatrixAt(index, dummy.matrix);
      });
      branches.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
      this.foliageInstances = [branches, leaves];

      for (const geometry of obsoleteGeometries) geometry.dispose();
      return this.foliageInstances;
    } catch (error) {
      console.warn('[WARN] EZ-Tree template generation failed; retaining bounded fallback foliage:', error);
      return expectedInstances;
    }
  }

  buildSetupZones() {
    const createZone = (faction, bounds) => {
      const width = bounds.maxX - bounds.minX;
      const depth = bounds.maxZ - bounds.minZ;
      const columns = Math.max(1, Math.ceil(width / (this.width / this.segments)));
      const rows = Math.max(1, Math.ceil(depth / (this.depth / this.segments)));
      const positions = [];
      const uvs = [];
      const indices = [];
      const surfaceOffset = 0.035;
      for (let row = 0; row <= rows; row++) {
        const z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, row / rows);
        for (let column = 0; column <= columns; column++) {
          const x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, column / columns);
          positions.push(
            x,
            this.getRenderedTerrainHeightAt(x, z) + surfaceOffset,
            z
          );
          uvs.push(column / columns, row / rows);
        }
      }
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const a = row * (columns + 1) + column;
          const b = a + 1;
          const c = a + columns + 1;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const material = new THREE.MeshBasicMaterial({
        color: bounds.color ?? 0xffffff,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const zone = new THREE.Mesh(geometry, material);
      zone.name = `${faction}_deployment_zone`;
      // Setup areas are visual-only and must never compete with terrain clicks.
      zone.raycast = () => {};
      zone.userData.deploymentBounds = { ...bounds };
      zone.userData.faction = faction;
      zone.userData.surfaceOffset = surfaceOffset;
      this.scene.add(zone);
      return zone;
    };

    this.deploymentZones = Object.fromEntries(
      Object.entries(this.deploymentZoneDefinitions)
        .map(([faction, bounds]) => [faction, createZone(faction, bounds)])
    );
  }

  removeSetupZones() {
    for (const zone of Object.values(this.deploymentZones ?? {})) {
      zone.visible = false;
      this.scene.remove(zone);
      zone.geometry?.dispose();
      if (Array.isArray(zone.material)) zone.material.forEach(material => material.dispose());
      else zone.material?.dispose();
    }
    this.deploymentZones = {};
  }

  disposeAtmosphere() {
    for (const water of this.oobRiverWaterMeshes) {
      this.scene.remove(water);
      water.geometry?.dispose();
    }
    this.oobRiverWaterMaterial?.dispose();
    this.oobRiverWaterMeshes = [];
    this.oobRiverWaterMaterial = null;
    for (const object of [
      this.surroundingTerrainMesh,
      this.mapBoundaryRibbonMesh,
      this.skyDomeMesh
    ]) {
      if (!object) continue;
      this.scene.remove(object);
      object.geometry?.dispose();
      for (const ownedMaterial of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        ownedMaterial?.map?.dispose?.();
        ownedMaterial?.dispose?.();
      }
    }
    this.surroundingTerrainMesh = null;
    this.mapBoundaryRibbonMesh = null;
    this.skyDomeMesh = null;
  }
}
