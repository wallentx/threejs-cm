import * as THREE from 'three';

export const VEHICLE_TEXTURE_PACK_ID = 'france-1940-procedural-pbr-v1';
const UV_PROJECTOR_ID = 'dominant-axis-triangle-local-metres-v2';

const TEXTURE_SIZE = 64;
const TEXTURE_PERIOD = TEXTURE_SIZE - 1;
const TAU = Math.PI * 2;
const TEXTURE_BUNDLES = new Map();
const MATERIAL_PROFILES = new Map();

const FAMILY_PALETTES = Object.freeze({
  french: Object.freeze({
    id: 'french-green-ochre-approximation',
    paint: [[61, 75, 42], [113, 91, 47], [67, 54, 34]],
    canvas: [112, 108, 78],
    wood: [91, 70, 43]
  }),
  german: Object.freeze({
    id: 'german-panzer-grey-approximation',
    paint: [[59, 66, 69], [70, 76, 76], [47, 52, 54]],
    canvas: [94, 91, 75],
    wood: [83, 66, 45]
  })
});

const SLOT_SETTINGS = Object.freeze({
  paint: Object.freeze({
    roughness: 0.78,
    metalness: 0.12,
    bumpScale: 0.018,
    metersPerRepeat: 3.2
  }),
  track: Object.freeze({
    roughness: 0.9,
    metalness: 0.34,
    bumpScale: 0.032,
    metersPerRepeat: 0.24
  }),
  rubber: Object.freeze({
    roughness: 0.94,
    metalness: 0.01,
    bumpScale: 0.024,
    metersPerRepeat: 0.2
  }),
  metal: Object.freeze({
    roughness: 0.48,
    metalness: 0.78,
    bumpScale: 0.012,
    metersPerRepeat: 0.32
  }),
  canvas: Object.freeze({
    roughness: 0.94,
    metalness: 0,
    bumpScale: 0.035,
    metersPerRepeat: 0.18
  }),
  wood: Object.freeze({
    roughness: 0.87,
    metalness: 0.02,
    bumpScale: 0.025,
    metersPerRepeat: 0.28
  })
});

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hash2(x, y, seed) {
  let value = Math.imul(x + seed * 17, 374761393)
    ^ Math.imul(y + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function periodicValueNoise(x, y, seed, cellsPerPeriod) {
  const gx = positiveModulo(x, TEXTURE_PERIOD) / TEXTURE_PERIOD * cellsPerPeriod;
  const gy = positiveModulo(y, TEXTURE_PERIOD) / TEXTURE_PERIOD * cellsPerPeriod;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const tx = smoothstep(gx - ix);
  const ty = smoothstep(gy - iy);
  const x0 = positiveModulo(ix, cellsPerPeriod);
  const x1 = positiveModulo(ix + 1, cellsPerPeriod);
  const y0 = positiveModulo(iy, cellsPerPeriod);
  const y1 = positiveModulo(iy + 1, cellsPerPeriod);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function mixColor(a, b, amount) {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount
  ];
}

function materialCause(family, slot, x, y) {
  const palette = FAMILY_PALETTES[family];
  const px = positiveModulo(x, TEXTURE_PERIOD);
  const py = positiveModulo(y, TEXTURE_PERIOD);
  const broad = periodicValueNoise(px, py, family === 'french' ? 41 : 73, 4);
  const medium = periodicValueNoise(px, py, 109, 9);
  const grain = periodicValueNoise(px, py, 173, 21);
  const wear = periodicValueNoise(px, py, 229, 27);
  let color;
  let roughness;
  let height;

  if (slot === 'paint') {
    if (family === 'french') {
      color = broad > 0.67
        ? palette.paint[1]
        : broad < 0.23 ? palette.paint[2] : palette.paint[0];
    } else {
      color = mixColor(palette.paint[0], broad > 0.58 ? palette.paint[1] : palette.paint[2], 0.32);
    }
    const chip = wear > 0.982 && medium > 0.52;
    color = chip ? [48, 47, 42] : color.map(channel => channel * (0.88 + grain * 0.18));
    roughness = chip ? 0.56 : 0.82 + grain * 0.13;
    height = chip ? 0.22 : 0.46 + grain * 0.32;
  } else if (slot === 'track') {
    const mud = smoothstep((broad - 0.35) / 0.42);
    color = mixColor([35, 38, 34], [75, 60, 40], mud);
    roughness = 0.86 + mud * 0.13;
    height = 0.28 + medium * 0.52 + mud * 0.18;
  } else if (slot === 'rubber') {
    color = [27 + grain * 10, 29 + grain * 9, 27 + grain * 7];
    roughness = 0.91 + grain * 0.08;
    height = 0.38 + medium * 0.34;
  } else if (slot === 'metal') {
    const oxidation = smoothstep((broad - 0.55) / 0.38);
    color = mixColor([46, 49, 47], [74, 54, 38], oxidation * 0.46);
    roughness = 0.48 + oxidation * 0.38;
    height = 0.42 + grain * 0.22 + oxidation * 0.16;
  } else if (slot === 'canvas') {
    const warp = Math.pow(
      0.5 + 0.5 * Math.cos(TAU * px * 18 / TEXTURE_PERIOD),
      8
    );
    const weft = Math.pow(
      0.5 + 0.5 * Math.cos(TAU * py * 18 / TEXTURE_PERIOD),
      8
    );
    const weave = (warp + weft) * 0.065;
    color = palette.canvas.map(channel => channel * (0.84 + broad * 0.18 - weave * 0.24));
    roughness = 0.91 + weave * 0.5 + grain * 0.04;
    height = 0.38 + weave * 2.3 + medium * 0.12;
  } else {
    const grainLine = Math.sin(
      TAU * (px * 9 / TEXTURE_PERIOD + (medium - 0.5) * 0.22)
    ) * 0.5 + 0.5;
    color = palette.wood.map(channel => channel * (0.78 + broad * 0.16 + grainLine * 0.12));
    roughness = 0.82 + grainLine * 0.14;
    height = 0.32 + grainLine * 0.45;
  }

  return { color, roughness, height };
}

function makeTexture(family, slot, channel) {
  const settings = SLOT_SETTINGS[slot];
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const cause = materialCause(family, slot, x, y);
      const offset = (y * TEXTURE_SIZE + x) * 4;
      if (channel === 'albedo') {
        data[offset] = clampByte(cause.color[0]);
        data[offset + 1] = clampByte(cause.color[1]);
        data[offset + 2] = clampByte(cause.color[2]);
      } else {
        const value = channel === 'roughness' ? cause.roughness : cause.height;
        const byte = clampByte(value * 255);
        data[offset] = byte;
        data[offset + 1] = byte;
        data[offset + 2] = byte;
      }
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    TEXTURE_SIZE,
    TEXTURE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.name = `${VEHICLE_TEXTURE_PACK_ID}:${family}:${slot}:${channel}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Geometry owns metre density. Shared textures must retain a neutral transform.
  texture.repeat.set(1, 1);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = channel === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.userData = {
    texturePack: VEHICLE_TEXTURE_PACK_ID,
    family,
    slot,
    channel,
    metersPerRepeat: settings.metersPerRepeat,
    deterministic: true
  };
  texture.needsUpdate = true;
  return texture;
}

function getMaterialProfile(family, slot) {
  const key = `${family}:${slot}`;
  if (!MATERIAL_PROFILES.has(key)) {
    MATERIAL_PROFILES.set(key, Object.freeze({
      family,
      slot,
      palette: FAMILY_PALETTES[family].id,
      ...SLOT_SETTINGS[slot]
    }));
  }
  return MATERIAL_PROFILES.get(key);
}

function getTextureBundle(family, slot) {
  const key = `${family}:${slot}`;
  if (!TEXTURE_BUNDLES.has(key)) {
    TEXTURE_BUNDLES.set(key, Object.freeze({
      albedo: makeTexture(family, slot, 'albedo'),
      roughness: makeTexture(family, slot, 'roughness'),
      bump: makeTexture(family, slot, 'bump')
    }));
  }
  return TEXTURE_BUNDLES.get(key);
}

function inferMaterialSlot(material) {
  if (SLOT_SETTINGS[material.userData?.vehicleMaterialSlot]) {
    return material.userData.vehicleMaterialSlot;
  }
  const luminance = material.color
    ? material.color.r * 0.2126 + material.color.g * 0.7152 + material.color.b * 0.0722
    : 0.5;
  const roughness = material.roughness ?? 0.5;
  const metalness = material.metalness ?? 0;

  if (metalness >= 0.65) return 'metal';
  if (roughness >= 0.93) return luminance < 0.2 ? 'rubber' : 'canvas';
  if (roughness >= 0.87) {
    if (luminance < 0.2) return 'track';
    if (material.color.r > material.color.b * 1.25) return 'wood';
    return 'canvas';
  }
  return 'paint';
}

export function setVehicleMaterialSlot(material, slot) {
  if (!SLOT_SETTINGS[slot]) {
    throw new Error(`Unknown vehicle material slot: ${slot}`);
  }
  material.userData = {
    ...material.userData,
    vehicleMaterialSlot: slot,
    materialSlotOwnership: 'authored'
  };
  return material;
}

function configureDetailedMaterial(material, family, slot) {
  const profile = getMaterialProfile(family, slot);
  const textures = getTextureBundle(family, slot);
  material.color.set(0xffffff);
  material.map = textures.albedo;
  material.roughness = profile.roughness;
  material.roughnessMap = textures.roughness;
  material.metalness = profile.metalness;
  material.bumpMap = textures.bump;
  material.bumpScale = profile.bumpScale;
  material.userData = {
    ...material.userData,
    vehicleTexturePack: VEHICLE_TEXTURE_PACK_ID,
    materialSlot: slot,
    materialQuality: 'detailed',
    metersPerRepeat: profile.metersPerRepeat,
    palette: profile.palette,
    sharedTextures: true
  };
  material.needsUpdate = true;
}

function createProxyMaterial(material, family, slot) {
  const profile = getMaterialProfile(family, slot);
  const textures = getTextureBundle(family, slot);
  const proxy = material.clone();
  proxy.name = `${material.name || slot}_proxy`;
  proxy.color.set(0xffffff);
  proxy.map = textures.albedo;
  proxy.roughness = Math.max(profile.roughness, 0.8);
  proxy.roughnessMap = null;
  proxy.metalness = Math.min(profile.metalness, 0.18);
  proxy.bumpMap = null;
  proxy.bumpScale = 0;
  proxy.userData = {
    ...proxy.userData,
    vehicleTexturePack: VEHICLE_TEXTURE_PACK_ID,
    materialSlot: slot,
    materialQuality: 'proxy',
    metersPerRepeat: profile.metersPerRepeat,
    palette: profile.palette,
    sharedTextures: true,
    ownedByVehicleModel: true
  };
  proxy.needsUpdate = true;
  return proxy;
}

function materialList(material) {
  return Array.isArray(material) ? material : [material];
}

function projectDetailedMeshUvs(mesh, family, slot) {
  const source = mesh.geometry;
  const position = source?.getAttribute?.('position');
  if (!position) return;

  const metersPerTile = getMaterialProfile(family, slot).metersPerRepeat;
  const existing = source.userData?.vehicleUvProjection;
  if (existing?.metersPerTile === metersPerTile) return;

  let geometry = source;
  if (source.index || existing) {
    const working = existing ? source.clone() : source;
    geometry = working.index ? working.toNonIndexed() : working;
    geometry.name = source.name;
    geometry.userData = { ...source.userData };
    mesh.geometry = geometry;
    if (working !== source && geometry !== working) working.dispose();
  }
  const positions = geometry.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  const basisCounts = { x: 0, y: 0, z: 0 };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();

  for (let triangle = 0; triangle < positions.count; triangle += 3) {
    a.fromBufferAttribute(positions, triangle);
    b.fromBufferAttribute(positions, triangle + 1);
    c.fromBufferAttribute(positions, triangle + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    faceNormal.crossVectors(ab, ac);
    const nx = Math.abs(faceNormal.x);
    const ny = Math.abs(faceNormal.y);
    const nz = Math.abs(faceNormal.z);
    const basis = ny >= nx && ny >= nz ? 'y' : nx >= nz ? 'x' : 'z';
    basisCounts[basis]++;

    for (let corner = 0; corner < 3; corner++) {
      const index = triangle + corner;
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      let u;
      let v;
      if (basis === 'y') {
        u = x;
        v = z;
      } else if (basis === 'x') {
        u = z;
        v = y;
      } else {
        u = x;
        v = y;
      }
      uv[index * 2] = u / metersPerTile;
      uv[index * 2 + 1] = v / metersPerTile;
    }
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.userData = {
    ...geometry.userData,
    vehicleUvProjection: {
      method: UV_PROJECTOR_ID,
      metersPerTile,
      materialSlot: slot,
      triangleCount: positions.count / 3,
      basisCounts
    }
  };
}

export function applyVehicleMaterialPack(root) {
  if (
    root.userData.vehicleMaterialDiagnostics?.id === VEHICLE_TEXTURE_PACK_ID
    && root.userData.vehicleMaterialDiagnostics?.uvProjection === UV_PROJECTOR_ID
  ) {
    return root.userData.vehicleMaterialDiagnostics;
  }
  const family = root.name.startsWith('fr_') ? 'french' : 'german';
  const materialSlots = new Map();
  const detailedMaterials = new Set();
  let inferenceFallbackCount = 0;

  root.traverse(object => {
    if (!object.isMesh) return;
    for (const material of materialList(object.material)) {
      if (!material?.isMeshStandardMaterial && !material?.isMeshPhysicalMaterial) continue;
      if (!materialSlots.has(material)) {
        const explicitSlot = material.userData?.vehicleMaterialSlot;
        if (!SLOT_SETTINGS[explicitSlot]) inferenceFallbackCount++;
        materialSlots.set(material, inferMaterialSlot(material));
      }
      if (object.userData.lodBand !== 'proxy') detailedMaterials.add(material);
    }
  });

  for (const material of detailedMaterials) {
    configureDetailedMaterial(material, family, materialSlots.get(material));
  }

  const proxyVariants = new Map();
  root.traverse(object => {
    if (!object.isMesh) return;
    const sourceMaterials = materialList(object.material);
    const slots = sourceMaterials.map(material => materialSlots.get(material) ?? inferMaterialSlot(material));
    object.userData.materialSlot = slots.length === 1 ? slots[0] : slots;
    object.userData.materialSlotOwnership = sourceMaterials.every(
      material => material.userData?.materialSlotOwnership === 'authored'
    ) ? 'authored' : 'inferred-fallback';
    object.userData.vehicleTexturePack = VEHICLE_TEXTURE_PACK_ID;

    if (object.userData.lodBand !== 'proxy') {
      projectDetailedMeshUvs(object, family, slots[0]);
      return;
    }
    const proxyMaterials = sourceMaterials.map((material, index) => {
      if (!proxyVariants.has(material)) {
        proxyVariants.set(material, createProxyMaterial(material, family, slots[index]));
      }
      return proxyVariants.get(material);
    });
    object.material = Array.isArray(object.material) ? proxyMaterials : proxyMaterials[0];
    object.userData.materialQuality = 'proxy';
  });

  const slots = [...new Set(materialSlots.values())].sort();
  const diagnostics = Object.freeze({
    id: VEHICLE_TEXTURE_PACK_ID,
    provenance: 'deterministic gameplay approximation; not archival paint matching',
    family,
    palette: FAMILY_PALETTES[family].id,
    resolution: TEXTURE_SIZE,
    slots,
    channels: ['albedo', 'roughness', 'bump'],
    detailedMaterialCount: detailedMaterials.size,
    proxyMaterialCount: proxyVariants.size,
    inferenceFallbackCount,
    uvProjection: UV_PROJECTOR_ID,
    sharedTextureBundles: true
  });
  root.userData.vehicleMaterialDiagnostics = diagnostics;
  return diagnostics;
}

export function getVehicleTextureCacheStats() {
  return Object.freeze({
    textureBundleCount: TEXTURE_BUNDLES.size,
    materialProfileCount: MATERIAL_PROFILES.size,
    textureCount: TEXTURE_BUNDLES.size * 3
  });
}
