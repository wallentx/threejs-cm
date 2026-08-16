import * as THREE from 'three';

export const FRANCE_1940_TERRAIN_SURFACE_IMPLEMENTATION_ID =
  'france-1940-procedural-terrain-surfaces-v4';

const EZ_TREE_OAK_LEAF_TEXTURE_URL = new URL(
  '../../../../node_modules/@dgreenheck/ez-tree/src/lib/assets/leaves/oak_color.png',
  import.meta.url
).href;

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

  context.fillStyle = '#615c54';
  context.fillRect(0, 0, colorCanvas.width, colorCanvas.height);
  bumpContext.fillStyle = '#282828';
  bumpContext.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);

  const courseHeight = 32;
  const stoneWidths = [44, 38, 52, 40, 47, 35];
  const colors = ['#827d73', '#979084', '#716e67', '#8b857a', '#68665f', '#a19a8c'];
  const heights = ['#b8b8b8', '#d0d0d0', '#a8a8a8', '#c4c4c4', '#a0a0a0', '#d7d7d7'];
  const traceStone = (target, x, y, width, height, seed) => {
    const topJitter = (seed % 3) - 1;
    const sideJitter = ((seed * 5) % 3) - 1;
    target.beginPath();
    target.moveTo(x + 2, y + height * 0.48 + sideJitter);
    target.lineTo(x + 5 + topJitter, y + 4);
    target.lineTo(x + width * 0.42, y + 2 + topJitter);
    target.lineTo(x + width - 6, y + 4 - topJitter);
    target.lineTo(x + width - 2, y + height * 0.5 - sideJitter);
    target.lineTo(x + width - 6, y + height - 4);
    target.lineTo(x + width * 0.48, y + height - 2 - topJitter);
    target.lineTo(x + 5, y + height - 5 + topJitter);
    target.closePath();
  };
  for (let row = 0; row < 4; row++) {
    const y = row * courseHeight;
    const offset = row % 2 === 0 ? 0 : -stoneWidths.at(-1) * 0.5;
    let cursor = 0;
    for (let column = 0; column < stoneWidths.length; column++) {
      const width = stoneWidths[column];
      const stoneIndex = (row * 3 + column) % colors.length;
      for (const wrap of [-colorCanvas.width, 0, colorCanvas.width]) {
        const x = cursor + offset + wrap;
        traceStone(context, x, y, width, courseHeight, row * 11 + column);
        context.fillStyle = colors[stoneIndex];
        context.fill();
        context.strokeStyle = '#514d47';
        context.lineWidth = 2;
        context.stroke();
        traceStone(bumpContext, x, y, width, courseHeight, row * 11 + column);
        bumpContext.fillStyle = heights[stoneIndex];
        bumpContext.fill();
        bumpContext.strokeStyle = '#303030';
        bumpContext.lineWidth = 2;
        bumpContext.stroke();
      }
      cursor += width;
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

function createSandbagTexture() {
  const width = 128;
  const height = 64;
  const canvas = createCanvas(width, height);
  const context = canvas?.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#554d3f';
  context.fillRect(0, 0, width, height);
  const courseH = 16;
  const bagW = 32;
  const colors = ['#998d75', '#887d66', '#a1957c', '#7e745e'];
  const traceBag = (x, y) => {
    context.beginPath();
    context.moveTo(x + 2, y + courseH * 0.5);
    context.quadraticCurveTo(x + 4, y + 2, x + 9, y + 1);
    context.quadraticCurveTo(x + bagW * 0.5, y - 1, x + bagW - 8, y + 2);
    context.quadraticCurveTo(x + bagW - 2, y + 4, x + bagW - 2, y + courseH * 0.5);
    context.quadraticCurveTo(x + bagW - 3, y + courseH - 3, x + bagW - 9, y + courseH - 2);
    context.quadraticCurveTo(x + bagW * 0.5, y + courseH + 1, x + 8, y + courseH - 2);
    context.quadraticCurveTo(x + 3, y + courseH - 3, x + 2, y + courseH * 0.5);
    context.closePath();
  };
  for (let r = 0; r < 4; r++) {
    const y = r * courseH;
    const offset = r % 2 === 0 ? -bagW * 0.5 : 0;
    for (let c = -1; c < 5; c++) {
      const x = offset + c * bagW;
      traceBag(x, y);
      context.fillStyle = colors[(r * 2 + Math.abs(c)) % colors.length];
      context.fill();
      context.strokeStyle = '#5c5443';
      context.lineWidth = 1.4;
      context.stroke();
      context.save();
      traceBag(x, y);
      context.clip();
      context.strokeStyle = 'rgba(55, 48, 38, 0.18)';
      context.lineWidth = 0.5;
      for (let weaveX = x + 3; weaveX < x + bagW - 2; weaveX += 3) {
        context.beginPath();
        context.moveTo(weaveX, y + 1);
        context.lineTo(weaveX, y + courseH - 1);
        context.stroke();
      }
      for (let weaveY = y + 3; weaveY < y + courseH - 1; weaveY += 3) {
        context.beginPath();
        context.moveTo(x + 2, weaveY);
        context.lineTo(x + bagW - 2, weaveY);
        context.stroke();
      }
      context.restore();
      context.strokeStyle = '#514938';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x + bagW - 7, y + 3);
      context.lineTo(x + bagW - 7, y + courseH - 3);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'SandbagBurlap';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createHedgerowTexture() {
  const width = 256;
  const height = 256;
  const canvas = createCanvas(width, height);
  const ctx = canvas?.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#264319';
  ctx.fillRect(0, 0, 256, 256);

  const foliageColors = [
    '#1b3312', '#264319', '#345722', '#416a2a', '#4f7d33', '#2f4f1d', '#5a8c3c'
  ];
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const rad = 3 + Math.random() * 7;
    ctx.fillStyle = foliageColors[(Math.random() * foliageColors.length) | 0];
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  const imgData = ctx.getImageData(0, 0, 256, 256);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = ((Math.random() - 0.5) * 16) | 0;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'ProceduralHedgerowDenseFoliage';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createFoliageLeafTexture() {
  const canLoadImage = typeof Image !== 'undefined'
    && typeof document?.createElementNS === 'function';
  const texture = canLoadImage
    ? new THREE.TextureLoader().load(EZ_TREE_OAK_LEAF_TEXTURE_URL)
    : new THREE.Texture();
  texture.name = 'EzTreeOakLeafCutout';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.premultiplyAlpha = true;
  texture.userData.source = '@dgreenheck/ez-tree oak_color.png';
  texture.userData.license = 'MIT';
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
  const sandbagTexture = createSandbagTexture();
  const hedgerowTexture = createHedgerowTexture();
  const foliageLeafTexture = createFoliageLeafTexture();
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
    sandbag: markMaterial(new THREE.MeshStandardMaterial({
      map: sandbagTexture,
      bumpMap: sandbagTexture,
      bumpScale: 0.06,
      roughness: 0.94,
      metalness: 0.01,
      side: THREE.FrontSide
    }), 'sandbag'),
    hedgerow: markMaterial(new THREE.MeshStandardMaterial({
      color: '#4e7a33',
      map: hedgerowTexture,
      bumpMap: hedgerowTexture,
      bumpScale: 0.04,
      roughness: 0.95,
      metalness: 0.02,
      side: THREE.DoubleSide,
      shadowSide: THREE.DoubleSide,
      dithering: true
    }), 'hedgerow'),
    fenceCard: markMaterial(
      new THREE.MeshStandardMaterial({
        map: fenceCardTexture,
        alphaTest: 0.48,
        transparent: false,
        depthWrite: true,
        roughness: 0.9,
        metalness: 0.02,
        side: THREE.FrontSide,
        shadowSide: THREE.FrontSide,
        alphaToCoverage: true,
        dithering: true
      }),
      'fence-card'
    ),
    foliageTrunk: markMaterial(
      new THREE.MeshStandardMaterial({
        color: '#6b543e',
        roughness: 0.96,
        metalness: 0.02
      }),
      'foliage-trunk'
    ),
    foliageLeaves: markMaterial(
      new THREE.MeshStandardMaterial({
        color: '#d5e0c6',
        map: foliageLeafTexture,
        alphaTest: 0.42,
        transparent: false,
        depthWrite: true,
        roughness: 0.92,
        metalness: 0,
        side: THREE.DoubleSide,
        shadowSide: THREE.DoubleSide,
        alphaToCoverage: true,
        dithering: true
      }),
      'foliage-leaves'
    ),
    foliageLeavesDark: markMaterial(
      new THREE.MeshStandardMaterial({
        color: '#aabf99',
        map: foliageLeafTexture,
        alphaTest: 0.42,
        transparent: false,
        depthWrite: true,
        roughness: 0.94,
        metalness: 0,
        side: THREE.DoubleSide,
        shadowSide: THREE.DoubleSide,
        alphaToCoverage: true,
        dithering: true
      }),
      'foliage-leaves-dark'
    )
  });
  const textures = [
    groundTexture,
    masonryTextures.color,
    masonryTextures.bump,
    fenceCardTexture,
    sandbagTexture,
    hedgerowTexture,
    foliageLeafTexture
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
