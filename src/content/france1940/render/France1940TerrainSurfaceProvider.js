import * as THREE from 'three';

export const FRANCE_1940_TERRAIN_SURFACE_IMPLEMENTATION_ID =
  'france-1940-procedural-terrain-surfaces-v1';

function createCanvas(width, height) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createGroundTexture(surfaces) {
  const [width, height] = surfaces.textureResolution;
  const canvas = createCanvas(width, height);
  const context = canvas?.getContext('2d');
  if (!context) return null;
  context.fillStyle = surfaces.baseColor;
  context.fillRect(0, 0, width, height);
  for (const layer of surfaces.layers) {
    context.fillStyle = layer.color;
    context.fillRect(...layer.rect);
  }
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
  const materials = Object.freeze({
    ground: markMaterial(new THREE.MeshStandardMaterial({
      map: groundTexture,
      color: surfaces.terrainMaterial.color,
      roughness: surfaces.terrainMaterial.roughness,
      metalness: surfaces.terrainMaterial.metalness
    }), 'ground'),
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
    masonryTextures.bump
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
