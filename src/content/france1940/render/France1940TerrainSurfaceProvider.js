import * as THREE from 'three';

export const FRANCE_1940_TERRAIN_SURFACE_IMPLEMENTATION_ID =
  'france-1940-procedural-terrain-surfaces-v2';

function createCanvas(width, height) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function drawTerrainSurfaceLayers(context, layers) {
  for (const layer of layers) {
    context.fillStyle = layer.color;
    if (Object.hasOwn(layer, 'rect')) {
      context.fillRect(...layer.rect);
      continue;
    }
    context.beginPath();
    context.moveTo(...layer.polygon[0]);
    for (let index = 1; index < layer.polygon.length; index++) {
      context.lineTo(...layer.polygon[index]);
    }
    context.closePath();
    context.fill();
  }
}

function createGroundTexture(surfaces) {
  const [width, height] = surfaces.textureResolution;
  const canvas = createCanvas(width, height);
  const context = canvas?.getContext('2d');
  if (!context) return null;
  context.fillStyle = surfaces.baseColor;
  context.fillRect(0, 0, width, height);
  drawTerrainSurfaceLayers(context, surfaces.layers);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createMasonryTextures() {
  const colorCanvas = createCanvas(256, 128);
  const bumpCanvas = createCanvas(256, 128);
  const context = colorCanvas?.getContext('2d');
  const bumpContext = bumpCanvas?.getContext('2d');
  if (!context || !bumpContext) return { color: null, bump: null };

  context.fillStyle = '#aaa39a';
  context.fillRect(0, 0, colorCanvas.width, colorCanvas.height);
  bumpContext.fillStyle = '#202020';
  bumpContext.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);

  const courseHeight = 32;
  const stoneWidth = 64;
  const colors = ['#77736c', '#8a857c', '#696761', '#918b80'];
  const heights = ['#b8b8b8', '#d0d0d0', '#a8a8a8', '#c4c4c4'];
  for (let row = 0; row < 4; row++) {
    const y = row * courseHeight + 3;
    const offset = row % 2 === 0 ? -stoneWidth * 0.5 : 0;
    for (let column = -1; column < 5; column++) {
      const x = offset + column * stoneWidth + 3;
      const wrappedColumn = (
        (column % colors.length) + colors.length
      ) % colors.length;
      const stoneIndex = (row * 3 + wrappedColumn) % colors.length;
      context.fillStyle = colors[stoneIndex];
      context.fillRect(x, y, stoneWidth - 6, courseHeight - 6);
      bumpContext.fillStyle = heights[stoneIndex];
      bumpContext.fillRect(x, y, stoneWidth - 6, courseHeight - 6);
    }
  }

  const color = new THREE.CanvasTexture(colorCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.wrapS = THREE.RepeatWrapping;
  color.wrapT = THREE.RepeatWrapping;
  color.needsUpdate = true;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.name = 'StoneMasonryBump';
  bump.colorSpace = THREE.NoColorSpace;
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.needsUpdate = true;
  return { color, bump };
}

function createFenceCardTexture() {
  const width = 128;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  const setPixel = (x, y, red, green, blue, alpha) => {
    const offset = (y * width + x) * 4;
    data[offset] = red;
    data[offset + 1] = green;
    data[offset + 2] = blue;
    data[offset + 3] = alpha;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const picketX = x % 32;
      const picketTop = picketX < 8
        ? 4 + Math.abs(picketX - 4)
        : Infinity;
      const picket = picketX < 8 && y >= picketTop;
      const rail = (y >= 21 && y <= 27) || (y >= 43 && y <= 49);
      if (!picket && !rail) {
        setPixel(x, y, 0, 0, 0, 0);
        continue;
      }
      const grain = ((x * 13 + y * 7) % 17) - 8;
      setPixel(
        x,
        y,
        112 + grain,
        82 + Math.round(grain * 0.65),
        47 + Math.round(grain * 0.4),
        255
      );
    }
  }
  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.name = 'WoodPicketFenceCutout';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function markMaterial(material, role) {
  material.userData.terrainSurfaceRole = role;
  material.userData.terrainSurfaceImplementationId =
    FRANCE_1940_TERRAIN_SURFACE_IMPLEMENTATION_ID;
  return material;
}

function createSurfaceSet(surfaces) {
  if (!surfaces || typeof surfaces !== 'object') {
    throw new TypeError('France 1940 terrain surfaces require a map surface record');
  }
  const groundTexture = createGroundTexture(surfaces);
  const masonryTextures = createMasonryTextures();
  const fenceCardTexture = createFenceCardTexture();
  const materials = Object.freeze({
    ground: markMaterial(new THREE.MeshStandardMaterial({
      map: groundTexture,
      color: surfaces.terrainMaterial.color,
      roughness: surfaces.terrainMaterial.roughness,
      metalness: surfaces.terrainMaterial.metalness
    }), 'ground'),
    riverBank: markMaterial(new THREE.MeshStandardMaterial({
      color: surfaces.riverBankMaterial.color,
      roughness: surfaces.riverBankMaterial.roughness,
      metalness: surfaces.riverBankMaterial.metalness
    }), 'river-bank'),
    water: markMaterial(new THREE.MeshStandardMaterial({
      color: surfaces.waterMaterial.color,
      transparent: true,
      opacity: surfaces.waterMaterial.opacity,
      roughness: surfaces.waterMaterial.roughness,
      metalness: surfaces.waterMaterial.metalness
    }), 'water'),
    bridgeRoad: markMaterial(new THREE.MeshStandardMaterial({
      color: surfaces.bridgeRoadMaterial.color,
      roughness: surfaces.bridgeRoadMaterial.roughness,
      metalness: surfaces.bridgeRoadMaterial.metalness
    }), 'bridge-road'),
    masonry: markMaterial(new THREE.MeshStandardMaterial({
      color: masonryTextures.color ? 0xffffff : 0x7d7971,
      map: masonryTextures.color,
      bumpMap: masonryTextures.bump,
      bumpScale: masonryTextures.bump ? 0.045 : 0,
      roughness: 0.96,
      metalness: 0
    }), 'masonry'),
    fenceCard: markMaterial(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: fenceCardTexture,
      alphaTest: 0.5,
      transparent: false,
      depthWrite: true,
      roughness: 0.94,
      metalness: 0,
      side: THREE.FrontSide,
      shadowSide: THREE.FrontSide
    }), 'fence-card'),
    foliageTrunk: markMaterial(
      new THREE.MeshLambertMaterial({ color: '#57534e' }),
      'foliage-trunk'
    ),
    foliageLeaves: markMaterial(
      new THREE.MeshLambertMaterial({ color: '#28723b' }),
      'foliage-leaves'
    ),
    foliageLeavesDark: markMaterial(
      new THREE.MeshLambertMaterial({ color: '#1f5e33' }),
      'foliage-leaves-dark'
    )
  });
  const textures = [
    groundTexture,
    masonryTextures.color,
    masonryTextures.bump,
    fenceCardTexture
  ].filter(Boolean);
  let disposed = false;
  return Object.freeze({
    kind: 'terrain-surface-set',
    materials,
    dispose() {
      if (disposed) return false;
      disposed = true;
      for (const material of Object.values(materials)) material.dispose();
      for (const texture of textures) texture.dispose();
      return true;
    }
  });
}

export const FRANCE_1940_TERRAIN_SURFACE_IMPLEMENTATION = Object.freeze({
  id: FRANCE_1940_TERRAIN_SURFACE_IMPLEMENTATION_ID,
  kind: 'terrain-surface-provider',
  create: createSurfaceSet
});
