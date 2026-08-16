import * as THREE from 'three';
import { BuildingCollapseAnimator } from './BuildingCollapseAnimator.js';

const LOD_DISTANCES = Object.freeze({ high: 0, medium: 42, core: 92, proxy: 180 });
const STAGE_RANK = Object.freeze({ intact: 0, damaged: 1, breached: 2, collapsed: 3 });
const HOUSE_WALL_TEXTURE_METERS = Object.freeze({
  limestone: 1.8,
  plaster: 6.4,
  timber: 2.4
});
const DAMAGE_COLORS = Object.freeze({
  damaged: new THREE.Color('#928675'),
  breached: new THREE.Color('#5f5145')
});
const GEOMETRY_VARIANTS = new WeakMap();
const WALL_EXTERIOR_ENVELOPES = new WeakMap();

function patternNoise(x, y, seed) {
  let value = Math.imul(x + 1, 374761393)
    ^ Math.imul(y + 1, 668265263)
    ^ Math.imul(seed + 1, 2246822519);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function createHouseSurfaceTexture(styleId, kind) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const seed = [...`${styleId}:${kind}`].reduce(
    (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0,
    2166136261
  );
  const limestone = styleId === 'aisne-limestone';
  const timber = styleId === 'rustic-barn-timber';
  const slate = styleId === 'ardennes-slate-stone';
  const wallPattern = limestone ? 'limestone-courses'
    : timber ? 'vertical-timber-boards'
      : 'seamless-weathered-plaster';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const noise = patternNoise(x, y, seed);
      let shade = 226 + Math.round((noise - 0.5) * 22);
      if (kind === 'window') {
        const textureCenter = (size - 1) * 0.5;
        const mullion = Math.abs(x - textureCenter) <= 1
          || Math.abs(y - textureCenter) <= 1;
        shade = mullion
          ? 220
          : 142 + Math.round((noise - 0.5) * 18);
      } else if (kind === 'roof') {
        const row = Math.floor(y / 7);
        const seamX = (x + (row % 2) * 4) % 8;
        if (y % 7 === 0) shade -= slate ? 44 : 34;
        if (seamX === 0 && y % 7 > 0) shade -= slate ? 25 : 18;
        if (!slate && noise > 0.82) shade += 14;
      } else if (timber) {
        const boardWidth = 8;
        const boardX = x % boardWidth;
        const boardIndex = Math.floor(x / boardWidth);
        const boardTone = ((boardIndex * 5 + seed) % 9) - 4;
        const grain = Math.sin(y * 0.62 + boardIndex * 1.7)
          + Math.sin(y * 0.19 + boardIndex * 0.83) * 0.55;
        shade = 194 + boardTone * 3 + Math.round(grain * 5);
        if (boardX === 0 || boardX === boardWidth - 1) shade -= 42;
        const knotY = (boardIndex * 19 + seed) % size;
        if (Math.abs(y - knotY) <= 1 && Math.abs(boardX - boardWidth * 0.5) <= 2) {
          shade -= 24;
        }
      } else if (limestone) {
        const course = Math.floor(y / 8);
        const joint = (x + (course % 2) * 8) % 16;
        if (y % 8 === 0) shade -= 35;
        if (joint === 0) shade -= 27;
        if (noise > 0.9) shade -= 18;
      } else {
        const angleX = Math.PI * 2 * x / size;
        const angleY = Math.PI * 2 * y / size;
        const broadStain = Math.sin(angleX + seed % 7)
          * Math.cos(angleY * 2 + seed % 11) * 2.2
          + Math.sin(angleX * 3 - angleY + seed % 5) * 1.4;
        shade = 222 + Math.round(broadStain + (noise - 0.5) * 4);
      }
      const offset = (y * size + x) * 4;
      const clamped = THREE.MathUtils.clamp(shade, 120, 255);
      data[offset] = clamped;
      data[offset + 1] = clamped;
      data[offset + 2] = clamped;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = `FrenchHouseSurface:${styleId}:${kind}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const repeat = kind === 'roof' ? 2 : 1;
  texture.repeat.set(repeat, repeat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.userData.wallPattern = kind === 'wall' ? wallPattern : null;
  texture.userData.metersPerTile = kind === 'wall'
    ? limestone ? HOUSE_WALL_TEXTURE_METERS.limestone
      : timber ? HOUSE_WALL_TEXTURE_METERS.timber
        : HOUSE_WALL_TEXTURE_METERS.plaster
    : null;
  texture.needsUpdate = true;
  return texture;
}

function material(color, roughness = 0.9, surfaceMap = null) {
  // House visuals never borrow global material-library entries. Runtime damage
  // and occupied-building fade are therefore local to this one house instance.
  const result = new THREE.MeshStandardMaterial({
    color,
    map: surfaceMap,
    roughness,
    metalness: 0,
    side: THREE.FrontSide,
    // Every authored box already has outward-wound exterior and room-facing
    // surfaces. Back-face rendering only doubles hidden fragment work.
    shadowSide: THREE.FrontSide
  });
  result.userData.houseVisualMaterial = true;
  return result;
}

function meshBox(name, width, height, depth, color, surfaceMap = null) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material(color, 0.9, surfaceMap)
  );
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function wallExteriorEnvelope(descriptor) {
  const cached = WALL_EXTERIOR_ENVELOPES.get(descriptor);
  if (cached) return cached;
  const envelope = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };
  for (const section of descriptor.sections) {
    if (section.kind !== 'wall') continue;
    for (const part of section.colliderParts) {
      const [halfWidth, , halfDepth] = part.halfExtents;
      const rotationY = part.rotationY ?? 0;
      const cosine = Math.cos(rotationY);
      const sine = Math.sin(rotationY);
      for (const localX of [-halfWidth, halfWidth]) {
        for (const localZ of [-halfDepth, halfDepth]) {
          const x = part.center[0] + localX * cosine + localZ * sine;
          const z = part.center[2] - localX * sine + localZ * cosine;
          envelope.minX = Math.min(envelope.minX, x);
          envelope.maxX = Math.max(envelope.maxX, x);
          envelope.minZ = Math.min(envelope.minZ, z);
          envelope.maxZ = Math.max(envelope.maxZ, z);
        }
      }
    }
  }
  WALL_EXTERIOR_ENVELOPES.set(descriptor, envelope);
  return envelope;
}

function exteriorCornerExtension(part, descriptor, sign) {
  const [halfWidth, , halfDepth] = part.halfExtents;
  const rotationY = part.rotationY ?? 0;
  const tangentX = Math.cos(rotationY) * sign;
  const tangentZ = -Math.sin(rotationY) * sign;
  const endpointX = part.center[0] + halfWidth * tangentX;
  const endpointZ = part.center[2] + halfWidth * tangentZ;
  const envelope = wallExteriorEnvelope(descriptor);
  const alongX = Math.abs(tangentX) >= Math.abs(tangentZ);
  const direction = alongX ? tangentX : tangentZ;
  const endpoint = alongX ? endpointX : endpointZ;
  const target = alongX
    ? (direction > 0 ? envelope.maxX : envelope.minX)
    : (direction > 0 ? envelope.maxZ : envelope.minZ);
  const extension = (target - endpoint) / direction;
  const maximumCornerGap = halfDepth * 2 + 0.02;
  return extension >= -1e-6 && extension <= maximumCornerGap
    ? Math.max(0, extension)
    : 0;
}

function createExteriorWallFaceGeometry(part, descriptor) {
  const [halfWidth, halfHeight, halfDepth] = part.halfExtents;
  const rotationY = part.rotationY ?? 0;
  const centerX = (descriptor.bounds.min[0] + descriptor.bounds.max[0]) * 0.5;
  const centerZ = (descriptor.bounds.min[2] + descriptor.bounds.max[2]) * 0.5;
  const outwardX = part.center[0] - centerX;
  const outwardZ = part.center[2] - centerZ;
  const positiveLocalZWorldX = Math.sin(rotationY);
  const positiveLocalZWorldZ = Math.cos(rotationY);
  const faceSign = positiveLocalZWorldX * outwardX
      + positiveLocalZWorldZ * outwardZ >= 0
    ? 1
    : -1;
  const leftExtension = exteriorCornerExtension(part, descriptor, -1);
  const rightExtension = exteriorCornerExtension(part, descriptor, 1);
  const left = -halfWidth - leftExtension;
  const right = halfWidth + rightExtension;
  const z = faceSign * halfDepth;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    left, -halfHeight, z,
    right, -halfHeight, z,
    right, halfHeight, z,
    left, halfHeight, z
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    1, 1,
    0, 1
  ], 2));
  geometry.setIndex(faceSign > 0
    ? [0, 1, 2, 0, 2, 3]
    : [0, 2, 1, 0, 3, 2]);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.presentationRole = 'closed-building-exterior-face';
  geometry.userData.cornerExtensions = { left: leftExtension, right: rightExtension };
  return geometry;
}

function registerGeometryVariants(mesh, exterior, interior) {
  GEOMETRY_VARIANTS.set(mesh, { exterior, interior });
  mesh.geometry = exterior;
}

function setInteriorGeometryVisible(mesh, visible) {
  const batchedParts = mesh.userData?.batchedSectionParts;
  if (batchedParts) {
    if (mesh.userData.interiorGeometryVisible === visible) return;
    for (const part of batchedParts) {
      mesh.setGeometryAt(
        part.geometryId,
        visible ? part.interiorGeometry : part.exteriorGeometry
      );
    }
    mesh.userData.interiorGeometryVisible = visible;
    return;
  }
  const variants = GEOMETRY_VARIANTS.get(mesh);
  if (!variants) return;
  mesh.geometry = visible ? variants.interior : variants.exterior;
}

function batchSectionParts(sectionGroup, section, level) {
  const pieces = sectionGroup.children.filter(object => object.isMesh);
  if (pieces.length < 2) return pieces[0] ?? null;
  const records = pieces.map(piece => {
    piece.updateMatrix();
    const variants = GEOMETRY_VARIANTS.get(piece);
    const exteriorGeometry = variants?.exterior ?? piece.geometry;
    const interiorGeometry = variants?.interior ?? piece.geometry;
    const exteriorVertices = exteriorGeometry.getAttribute('position').count;
    const interiorVertices = interiorGeometry.getAttribute('position').count;
    const exteriorIndices = exteriorGeometry.index?.count ?? exteriorVertices;
    const interiorIndices = interiorGeometry.index?.count ?? interiorVertices;
    return {
      piece,
      exteriorGeometry,
      interiorGeometry,
      reservedVertices: Math.max(exteriorVertices, interiorVertices),
      reservedIndices: Math.max(exteriorIndices, interiorIndices)
    };
  });
  const batch = new THREE.BatchedMesh(
    records.length,
    records.reduce((sum, record) => sum + record.reservedVertices, 0),
    records.reduce((sum, record) => sum + record.reservedIndices, 0),
    records[0].piece.material
  );
  batch.name = `SectionPartsBatch:${level}:${section.id}`;
  batch.castShadow = records.some(record => record.piece.castShadow);
  batch.receiveShadow = records.some(record => record.piece.receiveShadow);
  batch.userData = {
    semantic: 'building-section-part',
    sectionId: section.id,
    lod: level,
    interiorOnly: section.kind === 'floor',
    batchedSectionParts: [],
    interiorGeometryVisible: false
  };
  for (const record of records) {
    const geometryId = batch.addGeometry(
      record.exteriorGeometry,
      record.reservedVertices,
      record.reservedIndices
    );
    const instanceId = batch.addInstance(geometryId);
    batch.setMatrixAt(instanceId, record.piece.matrix);
    batch.setVisibleAt(instanceId, record.piece.visible);
    batch.userData.batchedSectionParts.push({
      instanceId,
      geometryId,
      partId: record.piece.userData.partId,
      openingId: record.piece.userData.openingId,
      exteriorGeometry: record.exteriorGeometry,
      interiorGeometry: record.interiorGeometry
    });
  }
  for (let index = 1; index < records.length; index++) {
    records[index].piece.material.dispose();
  }
  sectionGroup.clear();
  sectionGroup.add(batch);
  batch.computeBoundingBox();
  batch.computeBoundingSphere();
  return batch;
}

function applyContinuousFacadeUV(mesh, part, descriptor, metersPerTile) {
  const positions = mesh.geometry.getAttribute('position');
  const normals = mesh.geometry.getAttribute('normal');
  const uvs = mesh.geometry.getAttribute('uv');
  if (!positions || !normals || !uvs) return;

  const [centerX, centerY, centerZ] = part.center;
  const rotationY = part.rotationY ?? 0;
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  const [minX, minY, minZ] = descriptor.bounds.min;

  for (let index = 0; index < positions.count; index++) {
    const localX = positions.getX(index);
    const localZ = positions.getZ(index);
    const x = localX * cosine + localZ * sine + centerX;
    const y = positions.getY(index) + centerY;
    const z = -localX * sine + localZ * cosine + centerZ;
    const localNormalX = normals.getX(index);
    const localNormalZ = normals.getZ(index);
    const normalX = localNormalX * cosine + localNormalZ * sine;
    const normalZ = -localNormalX * sine + localNormalZ * cosine;

    if (Math.abs(normals.getY(index)) > Math.max(Math.abs(normalX), Math.abs(normalZ))) {
      uvs.setXY(
        index,
        (x - minX) / metersPerTile,
        (z - minZ) / metersPerTile
      );
    } else if (Math.abs(normalZ) >= Math.abs(normalX)) {
      uvs.setXY(
        index,
        (x - minX) / metersPerTile,
        (y - minY) / metersPerTile
      );
    } else {
      uvs.setXY(
        index,
        (z - minZ) / metersPerTile,
        (y - minY) / metersPerTile
      );
    }
  }
  uvs.needsUpdate = true;
  mesh.geometry.userData.facadeUvSpace = {
    boundsMin: [...descriptor.bounds.min],
    boundsMax: [...descriptor.bounds.max],
    metersPerTile
  };
}

function createDoorLeaf({
  name,
  aperture,
  normal,
  sectionId,
  color,
  thickness,
  lod = 'high',
  offsetX = 0,
  offsetZ = 0
}) {
  const [x, y, z] = aperture.center;
  const [width, height] = aperture.size;
  const alongX = Math.abs(normal?.[0] ?? 0) > Math.abs(normal?.[2] ?? 0);
  const hinge = new THREE.Group();
  hinge.name = `HouseDoorHinge:${lod}:${aperture.id}`;
  hinge.position.set(
    x + offsetX + (alongX ? 0 : -width * 0.5),
    y,
    z + offsetZ + (alongX ? -width * 0.5 : 0)
  );
  const leaf = meshBox(
    name,
    alongX ? thickness : width,
    height * 0.99,
    alongX ? width : thickness,
    color
  );
  leaf.position.set(
    alongX ? 0 : width * 0.5,
    0,
    alongX ? width * 0.5 : 0
  );
  leaf.userData = {
    semantic: 'opening', openingId: aperture.id, kind: 'door',
    openingSectionId: sectionId, lod
  };
  hinge.userData = {
    semantic: 'door-hinge',
    openingId: aperture.id,
    openingSectionId: sectionId,
    lod,
    closedRotationY: 0,
    openRotationY: (alongX
      ? -Math.sign(normal?.[0] || 1)
      : Math.sign(normal?.[2] || 1)) * Math.PI * 0.5
  };
  hinge.add(leaf);
  return hinge;
}

function stableFraction(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function cacheBaseTransform(object) {
  if (object.userData.baseTransform) return;
  object.userData.baseTransform = {
    position: object.position.toArray(),
    rotation: object.rotation.toArray(),
    scale: object.scale.toArray(),
    color: object.material?.color?.getHex?.() ?? null,
    roughness: object.material?.roughness ?? null,
    opacity: object.material?.opacity ?? 1,
    transparent: object.material?.transparent ?? false,
    depthWrite: object.material?.depthWrite ?? true,
    renderOrder: object.renderOrder ?? 0
  };
}

function applyInteriorFade(object, active) {
  if (!object?.isMesh || !object.material) return;
  cacheBaseTransform(object);
  const base = object.userData.baseTransform;
  object.material.opacity = active ? Math.min(base.opacity, 0.26) : base.opacity;
  object.material.transparent = active || base.transparent;
  // Opaque soldiers must remain visible through a faded shell. Keeping this
  // false also avoids a wall depth-write obscuring an interior firing pose.
  object.material.depthWrite = active ? false : base.depthWrite;
  object.renderOrder = active ? 2 : base.renderOrder;
  object.material.needsUpdate = true;
}

function applyDamageVariant(group, stage) {
  const rank = STAGE_RANK[stage] ?? 0;
  group.userData.stage = stage;
  group.visible = rank < STAGE_RANK.collapsed;
  group.traverse(object => {
    if (!object.isMesh) return;
    cacheBaseTransform(object);
    const base = object.userData.baseTransform;
    object.position.fromArray(base.position);
    object.rotation.fromArray(base.rotation);
    object.scale.fromArray(base.scale);
    if (base.color != null) object.material.color.setHex(base.color);
    if (base.roughness != null) object.material.roughness = base.roughness;
    if (rank === STAGE_RANK.damaged) {
      const direction = stableFraction(object.name) < 0.5 ? -1 : 1;
      object.rotation.z += direction * 0.018;
      object.scale.y *= 0.97;
      object.material.color.lerp(DAMAGE_COLORS.damaged, 0.34);
      object.material.roughness = 1;
    } else if (rank === STAGE_RANK.breached) {
      const direction = stableFraction(object.name) < 0.5 ? -1 : 1;
      object.rotation.z += direction * (0.035 + stableFraction(`${object.name}:tilt`) * 0.035);
      object.position.y -= 0.05 + stableFraction(`${object.name}:drop`) * 0.12;
      object.scale.set(base.scale[0] * 0.9, base.scale[1] * 0.82, base.scale[2] * 0.92);
      object.material.color.lerp(DAMAGE_COLORS.breached, 0.62);
      object.material.roughness = 1;
    }
    object.updateMatrix();
    object.material.needsUpdate = true;
  });
}

function worstStage(stages) {
  return stages.reduce((worst, stage) => (
    (STAGE_RANK[stage] ?? 0) > (STAGE_RANK[worst] ?? 0) ? stage : worst
  ), 'intact');
}

function appendSoffitRing(positions, outerHalfWidth, outerHalfDepth, width, depth) {
  const innerHalfWidth = width * 0.5;
  const innerHalfDepth = depth * 0.5;
  const quad = (...points) => {
    for (const point of [points[0], points[1], points[2], points[0], points[2], points[3]]) {
      positions.push(...point);
    }
  };
  const outerFrontLeft = [-outerHalfWidth, 0, outerHalfDepth];
  const outerFrontRight = [outerHalfWidth, 0, outerHalfDepth];
  const outerBackRight = [outerHalfWidth, 0, -outerHalfDepth];
  const outerBackLeft = [-outerHalfWidth, 0, -outerHalfDepth];
  const innerFrontLeft = [-innerHalfWidth, 0, innerHalfDepth];
  const innerFrontRight = [innerHalfWidth, 0, innerHalfDepth];
  const innerBackRight = [innerHalfWidth, 0, -innerHalfDepth];
  const innerBackLeft = [-innerHalfWidth, 0, -innerHalfDepth];

  // Downward winding retains only the soffit visible beyond the wall envelope.
  quad(outerFrontLeft, innerFrontLeft, innerFrontRight, outerFrontRight);
  quad(outerBackLeft, outerBackRight, innerBackRight, innerBackLeft);
  quad(outerBackLeft, innerBackLeft, innerFrontLeft, outerFrontLeft);
  quad(outerFrontRight, innerFrontRight, innerBackRight, outerBackRight);
}

function gabledRoof(width, depth, height, overhang = 0.42, includeUnderside = true) {
  const overhangX = typeof overhang === 'number' ? overhang : overhang.x;
  const overhangZ = typeof overhang === 'number' ? overhang : overhang.z;
  const hw = width * 0.5 + overhangX;
  const hd = depth * 0.5 + overhangZ;
  const positions = [
    // Left Pitch (2 triangles)
    -hw, 0, hd,   0, height, hd,   0, height, -hd,
    -hw, 0, hd,   0, height, -hd, -hw, 0, -hd,

    // Right Pitch (2 triangles)
    0, height, hd,  hw, 0, hd,   hw, 0, -hd,
    0, height, hd,  hw, 0, -hd,  0, height, -hd,

    // Front Gable (1 triangle)
    -hw, 0, hd,  hw, 0, hd,  0, height, hd,

    // Back Gable (1 triangle)
    hw, 0, -hd,  -hw, 0, -hd,  0, height, -hd
  ];
  if (includeUnderside) {
    positions.push(
      -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,
      -hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd
    );
  } else {
    appendSoffitRing(positions, hw, hd, width, depth);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function hippedRoof(width, depth, height, overhang = 0.42, includeUnderside = true) {
  const overhangX = typeof overhang === 'number' ? overhang : overhang.x;
  const overhangZ = typeof overhang === 'number' ? overhang : overhang.z;
  const halfWidth = width * 0.5 + overhangX;
  const halfDepth = depth * 0.5 + overhangZ;
  const positions = [];
  const triangle = (...points) => {
    for (const point of points) positions.push(...point);
  };
  const quad = (a, b, c, d) => {
    triangle(a, b, c);
    triangle(a, c, d);
  };
  const frontLeft = [-halfWidth, 0, halfDepth];
  const frontRight = [halfWidth, 0, halfDepth];
  const backRight = [halfWidth, 0, -halfDepth];
  const backLeft = [-halfWidth, 0, -halfDepth];
  if (width >= depth) {
    const ridgeHalf = Math.max(0, (width - depth) * 0.5);
    const ridgeLeft = [-ridgeHalf, height, 0];
    const ridgeRight = [ridgeHalf, height, 0];
    quad(frontLeft, frontRight, ridgeRight, ridgeLeft);
    quad(backRight, backLeft, ridgeLeft, ridgeRight);
    triangle(backLeft, frontLeft, ridgeLeft);
    triangle(frontRight, backRight, ridgeRight);
  } else {
    const ridgeHalf = Math.max(0, (depth - width) * 0.5);
    const ridgeFront = [0, height, ridgeHalf];
    const ridgeBack = [0, height, -ridgeHalf];
    triangle(frontLeft, frontRight, ridgeFront);
    triangle(backRight, backLeft, ridgeBack);
    quad(frontRight, backRight, ridgeBack, ridgeFront);
    quad(backLeft, frontLeft, ridgeFront, ridgeBack);
  }
  if (includeUnderside) {
    quad(backLeft, backRight, frontRight, frontLeft);
  } else {
    appendSoffitRing(positions, halfWidth, halfDepth, width, depth);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function createRoofGeometry(profile, roofStyleId, includeUnderside = true) {
  const factory = roofStyleId === 'hipped' ? hippedRoof : gabledRoof;
  return factory(
    profile.width,
    profile.depth,
    profile.height,
    profile.overhang,
    includeUnderside
  );
}

// Shared across every LOD. Tier detail may change, but the roof pitch, eaves,
// overhang and ridge cannot: those are the house's long-distance identity.
function houseRoofProfile(descriptor) {
  const bounds = descriptor.bounds;
  const width = bounds.max[0] - bounds.min[0];
  const depth = bounds.max[2] - bounds.min[2];
  let wallTopY = 0;
  for (const section of descriptor.sections) {
    if (section.kind === 'roof') continue;
    for (const part of section.colliderParts) {
      const topY = part.center[1] + part.halfExtents[1];
      if (topY > wallTopY) wallTopY = topY;
    }
  }
  if (wallTopY === 0) wallTopY = bounds.max[1] * 0.7;
  const height = Math.max(1.8, Math.min(3.2, (bounds.max[1] - bounds.min[1]) * 0.35));
  return {
    width,
    depth,
    height,
    overhang: descriptor.roofOverhang ?? 0.42,
    centerX: (bounds.min[0] + bounds.max[0]) * 0.5,
    centerY: wallTopY,
    centerZ: (bounds.min[2] + bounds.max[2]) * 0.5
  };
}

function terrainFoundation({
  centerX,
  centerZ,
  width,
  depth,
  topY,
  getHeightAt,
  rotationY = 0
}) {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const localCorners = [
    [-hw, hd], [hw, hd],
    [hw, -hd], [-hw, -hd]
  ];
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  const worldCorners = localCorners.map(([localX, localZ]) => [
    centerX + localX * cosine + localZ * sine,
    centerZ - localX * sine + localZ * cosine
  ]);
  const positions = [];
  const uvs = [];
  const bottom = localCorners.map(([localX, localZ], index) => {
    const [worldX, worldZ] = worldCorners[index];
    return new THREE.Vector3(
      localX,
      getHeightAt(worldX, worldZ) - topY,
      localZ
    );
  });
  const top = bottom.map(point => point.clone().setY(0));
  const quad = (a, b, c, d) => {
    for (const point of [a, b, c, a, c, d]) positions.push(point.x, point.y, point.z);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };
  quad(top[0], top[1], top[2], top[3]);
  quad(bottom[0], bottom[3], bottom[2], bottom[1]);
  for (let i = 0; i < 4; i++) quad(bottom[i], bottom[(i + 1) % 4], top[(i + 1) % 4], top[i]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.userData.worldFootprintCorners = worldCorners.map(
    ([worldX, worldZ], index) => [
      worldX,
      bottom[index].y + topY,
      worldZ
    ]
  );
  geometry.userData.topY = topY;
  return geometry;
}

function visualStage(section, runtime) {
  const fraction = (runtime?.health ?? section.maxHealth) / section.maxHealth;
  return [...section.visualStages]
    .sort((a, b) => b.minHealthFraction - a.minHealthFraction || a.id.localeCompare(b.id))
    .find(stage => fraction >= stage.minHealthFraction)?.id
    ?? section.visualStages.at(-1)?.id;
}

function isInitiallyOpen(descriptor, openingId) {
  if (!openingId) return false;
  return descriptor.portals.concat(descriptor.firePorts).some(record => (
    record.aperture?.id === openingId && record.aperture.initiallyOpen
  ));
}

function openingIsOpen(descriptor, runtime, openingId) {
  if (!openingId) return false;
  const opening = runtime?.openings?.[openingId];
  if (!opening) return isInitiallyOpen(descriptor, openingId);
  return opening.open || opening.breached || opening.enabled === false;
}

function openingKind(descriptor, openingId) {
  if (!openingId) return null;
  const portal = descriptor.portals.find(record => record.aperture?.id === openingId);
  if (portal) return portal.kind;
  return descriptor.firePorts.some(record => record.aperture?.id === openingId)
    ? 'window'
    : null;
}

function sectionPartIsVisible(descriptor, runtime, openingId) {
  if (!openingId) return true;
  // Door collider parts remain authoritative in BuildingSystem, but the brown
  // timber leaf is their presentation. Rendering the wall-colored collider
  // card would hide that leaf whenever the door is closed.
  if (openingKind(descriptor, openingId) === 'door') return false;
  return !openingIsOpen(descriptor, runtime, openingId);
}

export const HOUSE_PALETTES = Object.freeze({
  'village-buff': {
    wall: '#b9ad96',
    wallProxy: '#766f63',
    wallCore: '#a39782',
    roof: '#6f4035',
    foundation: '#746d62',
    plinth: '#827b6e',
    floor: '#8d765d',
    doorFrame: '#3d281a',
    doorPanel: '#4a3220',
    windowFrame: '#d0c6b2',
    windowPanel: '#596966',
    shutters: '#4b5b4e'
  },
  'ardennes-slate-stone': {
    wall: '#8e8678',
    wallProxy: '#5c574f',
    wallCore: '#776f63',
    roof: '#383b3e',
    foundation: '#615b52',
    plinth: '#686158',
    floor: '#685d4f',
    doorFrame: '#2c221a',
    doorPanel: '#36291e',
    windowFrame: '#c4baa7',
    windowPanel: '#566469',
    shutters: '#41484b'
  },
  'rustic-barn-timber': {
    wall: '#786b58',
    wallProxy: '#50473b',
    wallCore: '#695c4b',
    roof: '#51483e',
    foundation: '#4f473d',
    plinth: '#5b5246',
    floor: '#5a4f40',
    doorFrame: '#2d2319',
    doorPanel: '#382b1f',
    windowFrame: '#524536',
    windowPanel: '#625b4f',
    shutters: '#423528'
  },
  'aisne-weathered-plaster': {
    wall: '#b1aa9d',
    wallProxy: '#777168',
    wallCore: '#999185',
    roof: '#4b4845',
    foundation: '#777167',
    plinth: '#726c63',
    floor: '#7d6f60',
    doorFrame: '#4a3828',
    doorPanel: '#513923',
    windowFrame: '#d6cdbc',
    windowPanel: '#5e6c69',
    shutters: '#66675d'
  },
  'aisne-limestone': {
    wall: '#a39a88',
    wallProxy: '#6e675c',
    wallCore: '#8b8273',
    roof: '#58473f',
    foundation: '#746d61',
    plinth: '#7d7568',
    floor: '#766858',
    doorFrame: '#433324',
    doorPanel: '#4b3320',
    windowFrame: '#d2c7b1',
    windowPanel: '#586966',
    shutters: '#4c5a50'
  }
});

function createExteriorPlinthGeometry(width, height, depth, {
  extendStart = false,
  extendEnd = false
} = {}) {
  const halfWidth = width * 0.5;
  const innerStart = -halfWidth;
  const innerEnd = halfWidth;
  const outerStart = innerStart - (extendStart ? depth : 0);
  const outerEnd = innerEnd + (extendEnd ? depth : 0);
  const positions = [
    // Exterior vertical face, outward-wound toward local +Z.
    outerStart, 0, depth,
    outerEnd, 0, depth,
    outerEnd, height, depth,
    outerStart, height, depth,
    // Mitered top ledge, upward-wound. The inner and bottom faces do not exist.
    innerStart, height, 0,
    outerStart, height, depth,
    outerEnd, height, depth,
    innerEnd, height, 0
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 0, 1, 1, 1, 1, 0
  ], 2));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7
  ]);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.presentationRole = 'exterior-plinth-open-shell';
  return geometry;
}

function addHistoricPlinth(group, descriptor, palette, lod) {
  if (!group) return;
  const minX = descriptor.bounds.min[0];
  const maxX = descriptor.bounds.max[0];
  const minZ = descriptor.bounds.min[2];
  const maxZ = descriptor.bounds.max[2];
  const height = 0.58;
  const depth = 0.055;
  const doorsForFace = (axis, sign) => descriptor.portals.filter(portal => {
    if (portal.kind !== 'door' || !portal.aperture) return false;
    const normal = portal.localNormal ?? [0, 0, 0];
    return Math.abs(normal[axis]) > 0.5 && Math.sign(normal[axis]) === sign;
  });
  const add = ({
    name,
    segmentStart,
    segmentEnd,
    axis,
    fixed,
    rotationY,
    touchesFacadeStart,
    touchesFacadeEnd
  }) => {
    const width = segmentEnd - segmentStart;
    if (width <= 0.05) return;
    const tangentDirection = axis === 2 ? Math.cos(rotationY) : -Math.sin(rotationY);
    const piece = new THREE.Mesh(
      createExteriorPlinthGeometry(width, height, depth, {
        extendStart: tangentDirection > 0 ? touchesFacadeStart : touchesFacadeEnd,
        extendEnd: tangentDirection > 0 ? touchesFacadeEnd : touchesFacadeStart
      }),
      material(palette.plinth)
    );
    const midpoint = (segmentStart + segmentEnd) * 0.5;
    piece.position.set(axis === 2 ? midpoint : fixed, 0, axis === 2 ? fixed : midpoint);
    piece.rotation.y = rotationY;
    piece.castShadow = true;
    piece.receiveShadow = false;
    piece.userData = {
      semantic: 'facade-detail',
      presentationRole: 'exterior-plinth-open-shell',
      lod
    };
    group.add(piece);
  };
  const addFacade = ({ face, axis, sign, start, end, fixed, rotationY }) => {
    const intervals = doorsForFace(axis, sign)
      .map(portal => {
        const coordinate = portal.aperture.center[axis === 2 ? 0 : 2];
        const halfWidth = portal.aperture.size[0] * 0.5;
        return [
          THREE.MathUtils.clamp(coordinate - halfWidth, start, end),
          THREE.MathUtils.clamp(coordinate + halfWidth, start, end)
        ];
      })
      .sort((left, right) => left[0] - right[0]);
    let cursor = start;
    let segment = 0;
    for (const [doorMin, doorMax] of intervals) {
      if (doorMin > cursor) {
        add({
          name: `HouseStonePlinth:${lod}:${face}-${segment++}`,
          segmentStart: cursor,
          segmentEnd: doorMin,
          axis,
          fixed,
          rotationY,
          touchesFacadeStart: Math.abs(cursor - start) < 1e-6,
          touchesFacadeEnd: false
        });
      }
      cursor = Math.max(cursor, doorMax);
    }
    if (cursor < end) {
      add({
        name: `HouseStonePlinth:${lod}:${face}-${segment}`,
        segmentStart: cursor,
        segmentEnd: end,
        axis,
        fixed,
        rotationY,
        touchesFacadeStart: Math.abs(cursor - start) < 1e-6,
        touchesFacadeEnd: true
      });
    }
  };
  addFacade({ face: 'front', axis: 2, sign: 1, start: minX, end: maxX, fixed: maxZ, rotationY: 0 });
  addFacade({ face: 'rear', axis: 2, sign: -1, start: minX, end: maxX, fixed: minZ, rotationY: Math.PI });
  addFacade({ face: 'left', axis: 0, sign: -1, start: minZ, end: maxZ, fixed: minX, rotationY: -Math.PI * 0.5 });
  addFacade({ face: 'right', axis: 0, sign: 1, start: minZ, end: maxZ, fixed: maxX, rotationY: Math.PI * 0.5 });
}

function addOpeningDetail(
  group,
  descriptor,
  aperture,
  normal,
  kind,
  sectionId,
  palette = HOUSE_PALETTES['village-buff'],
  windowSurfaceMap = null
) {
  const [x, y, z] = aperture.center;
  const [width, height] = aperture.size;
  const alongX = Math.abs(normal?.[0] ?? 0) > Math.abs(normal?.[2] ?? 0);
  const depth = 0.07;
  const wallSection = descriptor.sections.find(section => section.id === sectionId);
  const openingPart = wallSection?.colliderParts?.find(part => part.openingId === aperture.id);
  const wallHalfThickness = openingPart?.halfExtents?.[2] ?? 0.18;
  const normalX = normal?.[0] ?? 0;
  const normalZ = normal?.[2] ?? 0;

  // Brown timber leaf remains rendered while its hinge projects open/closed state.
  if (kind === 'door') {
    const leafThickness = depth * 0.8;
    const leafOffset = Math.max(0, wallHalfThickness - leafThickness * 0.5 + 0.002);
    group.add(createDoorLeaf({
      name: `HouseOpening:${aperture.id}`,
      aperture,
      normal,
      sectionId,
      color: palette.doorPanel,
      thickness: leafThickness,
      offsetX: normalX * leafOffset,
      offsetZ: normalZ * leafOffset
    }));
  } else {
    const panelDepth = depth * 0.45;
    const offset = Math.max(0, wallHalfThickness - panelDepth * 0.5 - 0.004);
    const panel = meshBox(
      `HouseWindowOccluder:${aperture.id}`,
      alongX ? panelDepth : width,
      height,
      alongX ? width : panelDepth,
      palette.windowPanel,
      windowSurfaceMap
    );
    panel.position.set(
      x + normalX * offset,
      y,
      z + normalZ * offset
    );
    panel.userData = {
      semantic: 'window-occluder',
      openingId: aperture.id,
      kind: 'window',
      openingSectionId: sectionId,
      lod: 'high'
    };
    group.add(panel);
  }

  // 3D Frame casing trim and authentic French shutters around open aperture
  const frameColor = kind === 'door' ? palette.doorFrame : palette.windowFrame;
  const frame = new THREE.Group();
  frame.name = `HouseFrame:${aperture.id}`;
  const rail = (label, w, h, d, dx, dy, dz, customColor = frameColor) => {
    const piece = meshBox(label, alongX ? d : w, h, alongX ? w : d, customColor);
    const exteriorOffset = wallHalfThickness + d * 0.5 + 0.002;
    piece.position.set(
      x + dx + normalX * exteriorOffset,
      y + dy,
      z + dz + normalZ * exteriorOffset
    );
    frame.add(piece);
  };
  const half = width * 0.5;
  if (alongX) {
    rail('OpeningFrameLeft', depth * 2, height + 0.12, depth * 2, 0, 0, -half);
    rail('OpeningFrameRight', depth * 2, height + 0.12, depth * 2, 0, 0, half);
    rail('OpeningFrameTop', width + 0.12, 0.1, depth * 2, 0, height * 0.5, 0);
    if (kind === 'window') {
      rail('OpeningFrameSill', width + 0.22, 0.09, depth * 2.8, 0, -height * 0.5 - 0.02, 0, palette.foundation);
    }
    if (kind === 'window' && aperture.shutters === true) {
      const shutterW = width * 0.45;
      rail('OpeningShutterLeft', shutterW, height * 0.96, depth * 1.5, 0, 0, -half - shutterW * 0.5 - 0.03, palette.shutters);
      rail('OpeningShutterRight', shutterW, height * 0.96, depth * 1.5, 0, 0, half + shutterW * 0.5 + 0.03, palette.shutters);
    }
  } else {
    rail('OpeningFrameLeft', depth * 2, height + 0.12, depth * 2, -half, 0, 0);
    rail('OpeningFrameRight', depth * 2, height + 0.12, depth * 2, half, 0, 0);
    rail('OpeningFrameTop', width + 0.12, 0.1, depth * 2, 0, height * 0.5, 0);
    if (kind === 'window') {
      rail('OpeningFrameSill', width + 0.22, 0.09, depth * 2.8, 0, -height * 0.5 - 0.02, 0, palette.foundation);
    }
    if (kind === 'window' && aperture.shutters === true) {
      const shutterW = width * 0.45;
      rail('OpeningShutterLeft', shutterW, height * 0.96, depth * 1.5, -half - shutterW * 0.5 - 0.03, 0, 0, palette.shutters);
      rail('OpeningShutterRight', shutterW, height * 0.96, depth * 1.5, half + shutterW * 0.5 + 0.03, 0, 0, palette.shutters);
    }
  }
  frame.userData = {
    semantic: 'opening-frame', openingId: aperture.id, kind,
    openingSectionId: sectionId
  };
  group.add(frame);
}

const HOUSE_FACADES = Object.freeze({
  'commercial-red-fascia': Object.freeze({
    board: '#6d1c1c',
    trim: '#481515'
  }),
  'commercial-cafe-ochre': Object.freeze({
    board: '#76613f',
    trim: '#443724'
  }),
  'commercial-pharmacy-green': Object.freeze({
    board: '#3d5747',
    trim: '#24362c'
  }),
  'commercial-inn-blue': Object.freeze({
    board: '#455866',
    trim: '#27343d'
  })
});

function addCommercialFacade(group, descriptor, facadeId, lod = 'high') {
  if (facadeId == null) return null;
  const facade = HOUSE_FACADES[facadeId];
  if (!facade) throw new Error(`Unknown French house facade ${facadeId}`);
  const storefront = new THREE.Group();
  storefront.name = `HouseStorefrontSign:${lod}`;
  const fasciaBoard = meshBox(
    `StorefrontFascia:${lod}`,
    3.8,
    0.55,
    0.12,
    facade.board
  );
  fasciaBoard.position.set(0, 2.55, descriptor.bounds.max[2] + 0.06);
  storefront.add(fasciaBoard);

  const awningTrim = meshBox(
    `StorefrontAwningTrim:${lod}`,
    4.0,
    0.08,
    0.32,
    facade.trim
  );
  awningTrim.position.set(0, 2.85, descriptor.bounds.max[2] + 0.16);
  storefront.add(awningTrim);
  storefront.userData = {
    semantic: 'storefront-facade',
    facadeId,
    lod
  };
  group.add(storefront);
  return storefront;
}

function buildDetailedShell(
  descriptor,
  runtime,
  palette = HOUSE_PALETTES['village-buff'],
  facadeId = null,
  roofStyleId = 'gabled',
  surfaceMaps = null
) {
  const group = new THREE.Group();
  group.name = 'FrenchHouseHighLOD';
  const sections = new Map();
  for (const section of descriptor.sections) {
    const sectionGroup = new THREE.Group();
    sectionGroup.name = `BuildingSection:${section.id}`;
    sectionGroup.userData = {
      semantic: 'building-section',
      sectionId: section.id,
      kind: section.kind,
      interiorOnly: section.kind === 'floor'
    };
    const sectionRuntime = runtime?.sections?.[section.id];
    const stage = visualStage(section, sectionRuntime);
    for (const part of section.kind === 'roof' ? [] : section.colliderParts) {
      const [x, y, z] = part.center;
      const [hx, hy, hz] = part.halfExtents;
      const color = section.kind === 'roof' ? palette.roof
        : section.kind === 'floor' ? palette.floor
          : section.kind === 'foundation' ? palette.foundation : palette.wall;
      const piece = meshBox(
        `SectionPart:${section.id}:${part.id}`,
        hx * 2,
        hy * 2,
        hz * 2,
        color,
        section.kind === 'wall' ? surfaceMaps?.wall : null
      );
      // The 290 m directional shadow atlas cannot resolve a wall face and its
      // own caster depth closely enough to avoid diagonal PCF sampling bands.
      // Walls still cast onto terrain and nearby objects; direct and
      // hemisphere lighting continue to shade each facade orientation.
      if (section.kind === 'wall') piece.receiveShadow = false;
      piece.position.set(x, y, z);
      piece.rotation.y = part.rotationY ?? 0;
      if (section.kind === 'wall') {
        const interiorGeometry = piece.geometry;
        applyContinuousFacadeUV(
          piece,
          part,
          descriptor,
          surfaceMaps?.wall?.userData?.metersPerTile ?? HOUSE_WALL_TEXTURE_METERS.plaster
        );
        const exteriorGeometry = createExteriorWallFaceGeometry(part, descriptor);
        piece.geometry = exteriorGeometry;
        applyContinuousFacadeUV(
          piece,
          part,
          descriptor,
          surfaceMaps?.wall?.userData?.metersPerTile ?? HOUSE_WALL_TEXTURE_METERS.plaster
        );
        registerGeometryVariants(piece, exteriorGeometry, interiorGeometry);
      }
      piece.userData = {
        semantic: 'building-section-part', sectionId: section.id, partId: part.id,
        stage, openingId: part.openingId ?? null,
        interiorOnly: section.kind === 'floor'
      };
      piece.visible = sectionPartIsVisible(descriptor, runtime, part.openingId);
      sectionGroup.add(piece);
    }
    sectionGroup.userData.stage = stage;
    sectionGroup.visible = section.kind !== 'floor' && !sectionRuntime?.collapsed;
    group.add(sectionGroup);
    sections.set(section.id, sectionGroup);
  }
  const exteriorSection = descriptor.sections.find(section => section.kind === 'wall');
  addHistoricPlinth(
    exteriorSection ? sections.get(exteriorSection.id) : group,
    descriptor,
    palette,
    'high'
  );

  for (const portal of descriptor.portals) {
    if (portal.aperture) {
      addOpeningDetail(
        group,
        descriptor,
        portal.aperture,
        portal.localNormal,
        portal.kind,
        portal.sectionId ?? null,
        palette,
        surfaceMaps?.window
      );
    }
  }
  for (const firePort of descriptor.firePorts) {
    addOpeningDetail(
      group,
      descriptor,
      firePort.aperture,
      firePort.localNormal,
      'window',
      firePort.sectionId ?? null,
      palette,
      surfaceMaps?.window
    );
  }

  const roofProfile = houseRoofProfile(descriptor);
  const exteriorRoofGeometry = createRoofGeometry(roofProfile, roofStyleId, false);
  const interiorRoofGeometry = createRoofGeometry(roofProfile, roofStyleId, true);
  const roof = new THREE.Mesh(
    exteriorRoofGeometry,
    material(palette.roof, 0.96, surfaceMaps?.roof)
  );
  registerGeometryVariants(roof, exteriorRoofGeometry, interiorRoofGeometry);
  roof.name = roofStyleId === 'hipped' ? 'HouseHippedRoof' : 'HouseGabledRoof';
  roof.position.set(roofProfile.centerX, roofProfile.centerY, roofProfile.centerZ);
  roof.castShadow = true;
  roof.receiveShadow = false;
  roof.userData = {
    semantic: 'roof-silhouette',
    sectionId: descriptor.sections.find(section => section.kind === 'roof')?.id ?? null
  };
  group.add(roof);

  addCommercialFacade(group, descriptor, facadeId, 'high');

  const stairs = new THREE.Group();
  stairs.name = 'HouseStairs';
  stairs.userData = { semantic: 'stairs', interiorOnly: true };
  stairs.visible = false;
  const stairPortal = descriptor.portals.find(portal => portal.kind === 'stair');
  if (stairPortal) {
    const [x, y, z] = stairPortal.aperture?.center ?? [0, 0.2, -1.15];
    const stairHeight = stairPortal.aperture?.size?.[1] ?? 3.1;
    for (let step = 0; step < 7; step++) {
      const stair = meshBox(`Stair:${step}`, 1.05, 0.17, 0.28, '#7c654b');
      stair.userData = { semantic: 'stairs', interiorOnly: true };
      stair.position.set(x, y + 0.085 + step * (stairHeight / 7), z + 0.78 - step * 0.24);
      stairs.add(stair);
    }
  }
  group.add(stairs);
  return { group, sections, roof };
}

function buildCheapShell(
  descriptor,
  level,
  runtime,
  palette = HOUSE_PALETTES['village-buff'],
  facadeId = null,
  roofStyleId = 'gabled',
  surfaceMaps = null
) {
  const bounds = descriptor.bounds;
  const width = bounds.max[0] - bounds.min[0];
  const depth = bounds.max[2] - bounds.min[2];
  const group = new THREE.Group();
  group.name = `FrenchHouse${level[0].toUpperCase()}${level.slice(1)}LOD`;
  const sections = new Map();
  const lodWallColor = level === 'proxy'
    ? palette.wallProxy
    : level === 'core'
      ? palette.wallCore
      : palette.wall;
  let shell = null;
  for (const section of descriptor.sections) {
    const sectionGroup = new THREE.Group();
    sectionGroup.name = `BuildingSection:${level}:${section.id}`;
    sectionGroup.userData = {
      semantic: 'building-section', sectionId: section.id, kind: section.kind,
      lod: level, interiorOnly: section.kind === 'floor'
    };
    // Foundation has a terrain-conforming visual at the root. Roof uses the
    // matching gable below. All wall and floor pieces retain the same
    // descriptor footprint and apertures at every distance tier.
    const visibleParts = ['foundation', 'roof'].includes(section.kind) ? [] : section.colliderParts;
    for (const part of visibleParts) {
      const [x, y, z] = part.center;
      const [hx, hy, hz] = part.halfExtents;
      const color = section.kind === 'floor' ? palette.floor : lodWallColor;
      const piece = meshBox(
        `SectionPart:${level}:${section.id}:${part.id}`,
        hx * 2,
        hy * 2,
        hz * 2,
        color,
        section.kind === 'wall' ? surfaceMaps?.wall : null
      );
      if (section.kind === 'wall') piece.receiveShadow = false;
      piece.position.set(x, y, z);
      piece.rotation.y = part.rotationY ?? 0;
      if (section.kind === 'wall') {
        const interiorGeometry = piece.geometry;
        applyContinuousFacadeUV(
          piece,
          part,
          descriptor,
          surfaceMaps?.wall?.userData?.metersPerTile ?? HOUSE_WALL_TEXTURE_METERS.plaster
        );
        const exteriorGeometry = createExteriorWallFaceGeometry(part, descriptor);
        piece.geometry = exteriorGeometry;
        applyContinuousFacadeUV(
          piece,
          part,
          descriptor,
          surfaceMaps?.wall?.userData?.metersPerTile ?? HOUSE_WALL_TEXTURE_METERS.plaster
        );
        registerGeometryVariants(piece, exteriorGeometry, interiorGeometry);
      }
      piece.visible = sectionPartIsVisible(descriptor, runtime, part.openingId);
      piece.userData = {
        semantic: 'building-section-part', sectionId: section.id, partId: part.id,
        openingId: part.openingId ?? null, lod: level,
        interiorOnly: section.kind === 'floor'
      };
      sectionGroup.add(piece);
    }
    const sectionParts = batchSectionParts(sectionGroup, section, level);
    if (section.kind === 'wall' && !shell) shell = sectionParts;
    sectionGroup.visible = section.kind !== 'floor';
    group.add(sectionGroup);
    sections.set(section.id, sectionGroup);
  }
  const exteriorSection = descriptor.sections.find(section => section.kind === 'wall');
  addHistoricPlinth(
    exteriorSection ? sections.get(exteriorSection.id) : group,
    descriptor,
    palette,
    level
  );
  const addCheapOpening = (aperture, normal, kind, sectionId) => {
    const [x, y, z] = aperture.center;
    const [width, height] = aperture.size;
    const alongX = Math.abs(normal?.[0] ?? 0) > Math.abs(normal?.[2] ?? 0);
    const color = kind === 'door' ? palette.doorPanel : palette.windowPanel;
    const wallSection = descriptor.sections.find(section => section.id === sectionId);
    const openingPart = wallSection?.colliderParts?.find(part => part.openingId === aperture.id);
    const wallHalfThickness = openingPart?.halfExtents?.[2] ?? 0.18;
    const normalX = normal?.[0] ?? 0;
    const normalZ = normal?.[2] ?? 0;
    const panelDepth = 0.02;
    const surfaceOffset = Math.max(0, wallHalfThickness - panelDepth * 0.5 - 0.002);
    const offsetX = normalX * surfaceOffset;
    const offsetZ = normalZ * surfaceOffset;
    const panelOverlap = kind === 'window' ? 0.08 : 0;
    const panel = kind === 'door'
      ? createDoorLeaf({
          name: `HouseCheapOpening:${level}:${aperture.id}`,
          aperture,
          normal,
          sectionId,
          color,
          thickness: panelDepth,
          lod: level,
          offsetX,
          offsetZ
        })
      : meshBox(
          `HouseCheapOpening:${level}:${aperture.id}`,
          alongX ? panelDepth : width + panelOverlap,
          height + panelOverlap,
          alongX ? width + panelOverlap : panelDepth,
          color,
          surfaceMaps?.window
        );
    if (kind !== 'door') panel.position.set(x + offsetX, y, z + offsetZ);
    panel.userData = {
      ...panel.userData,
      semantic: kind === 'door' ? 'door-hinge' : 'window-occluder',
      openingId: aperture.id,
      kind,
      openingSectionId: sectionId,
      lod: level
    };
    group.add(panel);
  };
  for (const portal of descriptor.portals) {
    if (portal.aperture) {
      addCheapOpening(
        portal.aperture,
        portal.localNormal,
        portal.kind,
        portal.sectionId ?? null
      );
    }
  }
  for (const firePort of descriptor.firePorts) {
    addCheapOpening(
      firePort.aperture,
      firePort.localNormal,
      'window',
      firePort.sectionId ?? null
    );
  }

  const roofProfile = houseRoofProfile(descriptor);
  const exteriorRoofGeometry = createRoofGeometry(roofProfile, roofStyleId, false);
  const interiorRoofGeometry = createRoofGeometry(roofProfile, roofStyleId, true);
  const roof = new THREE.Mesh(
    exteriorRoofGeometry,
    material(palette.roof, 0.96, surfaceMaps?.roof)
  );
  registerGeometryVariants(roof, exteriorRoofGeometry, interiorRoofGeometry);
  roof.position.set(roofProfile.centerX, roofProfile.centerY, roofProfile.centerZ);
  roof.name = 'HouseCheapRoof';
  roof.castShadow = true;
  roof.receiveShadow = false;
  roof.userData = {
    semantic: 'roof-silhouette',
    sectionId: descriptor.sections.find(section => section.kind === 'roof')?.id ?? null,
    lod: level
  };
  group.add(roof);
  addCommercialFacade(group, descriptor, facadeId, level);
  group.userData = { semantic: 'building-lod', lod: level, shell, roof, sections };
  return { group, sections, roof, shell };
}

function buildRubble(descriptor) {
  const group = new THREE.Group();
  group.name = 'HouseRubble';
  group.userData = { semantic: 'building-rubble' };
  const rubbleMaterial = material('#75695a', 1);
  let debrisIndex = 0;
  for (const part of descriptor.rubble.colliderParts) {
    const [cx, cy, cz] = part.center;
    const [hx, hy, hz] = part.halfExtents;
    for (let index = 0; index < 6; index++) {
      const key = `${part.id}:${index}`;
      const debris = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), rubbleMaterial);
      debris.name = `HouseRubbleDebris:${debrisIndex++}`;
      debris.position.set(
        cx + (stableFraction(`${key}:x`) * 2 - 1) * hx * 0.86,
        Math.max(0.12, cy - hy + stableFraction(`${key}:y`) * hy * 1.45),
        cz + (stableFraction(`${key}:z`) * 2 - 1) * hz * 0.86
      );
      debris.rotation.set(
        stableFraction(`${key}:rx`) * Math.PI,
        stableFraction(`${key}:ry`) * Math.PI,
        stableFraction(`${key}:rz`) * Math.PI
      );
      const scale = 0.45 + stableFraction(`${key}:scale`) * 0.8;
      debris.scale.set(
        scale * (0.8 + stableFraction(`${key}:sx`) * 0.7),
        scale * (0.45 + stableFraction(`${key}:sy`) * 0.45),
        scale * (0.8 + stableFraction(`${key}:sz`) * 0.7)
      );
      debris.castShadow = true;
      debris.receiveShadow = true;
      debris.userData = { semantic: 'rubble-debris', rubblePartId: part.id };
      group.add(debris);
    }
  }
  group.visible = false;
  return group;
}

/**
 * Renderer-only descriptor adapter.  Simulation owns section health/openings;
 * callers update this object through applyFrenchHouseVisualState().
 */
export function createFrenchHouseVisual({
  descriptor,
  runtime,
  centerX,
  centerZ,
  foundationTopY,
  getHeightAt,
  styleId = 'village-buff',
  facadeId = null,
  roofStyleId = 'gabled'
}) {
  const root = new THREE.Group();
  root.name = 'FrenchVillageHouse';
  const rotationY = runtime?.transform?.rotationY ?? 0;
  root.position.set(centerX, foundationTopY, centerZ);
  root.rotation.y = rotationY;
  const palette = HOUSE_PALETTES[styleId] ?? HOUSE_PALETTES['village-buff'];
  const surfaceMaps = {
    wall: createHouseSurfaceTexture(styleId, 'wall'),
    roof: createHouseSurfaceTexture(styleId, 'roof'),
    window: createHouseSurfaceTexture(styleId, 'window')
  };
  const width = descriptor.bounds.max[0] - descriptor.bounds.min[0];
  const depth = descriptor.bounds.max[2] - descriptor.bounds.min[2];
  const foundationWidth = width + 0.36;
  const foundationDepth = depth + 0.36;
  const foundation = new THREE.Mesh(
    terrainFoundation({
      centerX,
      centerZ,
      width: foundationWidth,
      depth: foundationDepth,
      topY: foundationTopY,
      getHeightAt,
      rotationY
    }),
    material(palette.foundation)
  );
  foundation.name = 'HouseFoundation';
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  root.add(foundation);

  const lod = new THREE.LOD();
  lod.name = 'FrenchHouseLOD';
  const detailed = buildDetailedShell(
    descriptor,
    runtime,
    palette,
    facadeId,
    roofStyleId,
    surfaceMaps
  );
  const lodTiers = [{
    lod: 'high',
    group: detailed.group,
    sections: detailed.sections,
    roof: detailed.roof,
    shell: null
  }];
  const cheapShells = [];
  lod.addLevel(detailed.group, LOD_DISTANCES.high);
  for (const [level, distance] of [
    ['medium', LOD_DISTANCES.medium],
    ['core', LOD_DISTANCES.core],
    ['proxy', LOD_DISTANCES.proxy]
  ]) {
    const cheap = buildCheapShell(
      descriptor,
      level,
      runtime,
      palette,
      facadeId,
      roofStyleId,
      surfaceMaps
    );
    cheapShells.push(cheap.group);
    lodTiers.push({ lod: level, ...cheap });
    lod.addLevel(cheap.group, distance);
  }
  root.add(lod);
  const rubble = buildRubble(descriptor);
  root.add(rubble);
  root.userData = {
    descriptor,
    descriptorId: descriptor.id,
    buildingId: runtime?.id ?? null,
    facadeId,
    roofStyleId,
    dimensionsMeters: { width, depth, height: descriptor.bounds.max[1] - descriptor.bounds.min[1] },
    foundation: { topY: foundationTopY, footprintCorners: foundation.geometry.userData.worldFootprintCorners },
    lodDistances: { ...LOD_DISTANCES },
    buildingSections: detailed.sections,
    lodTiers,
    cheapShells,
    detailedRoof: detailed.roof,
    rubble
  };
  root.userData.ownedSurfaceTextures = Object.values(surfaceMaps);
  root.userData.collapseAnimator = new BuildingCollapseAnimator(root);
  if (runtime) {
    applyFrenchHouseVisualState(root, descriptor, runtime, {
      collapseProjection: 'restore'
    });
  }
  return root;
}

export function applyFrenchHouseVisualState(root, descriptor, runtime, {
  interiorPresence = 0,
  collapseProjection = 'transition'
} = {}) {
  if (!root || !descriptor || !runtime) return;
  if (!root.userData) root.userData = {};
  if (!root.userData.descriptor) root.userData.descriptor = descriptor;
  if (!root.userData.collapseAnimator) {
    root.userData.collapseAnimator = new BuildingCollapseAnimator(root);
  }
  const resolvedPresence = Math.max(0, Number(interiorPresence) || 0);
  const interiorActive = resolvedPresence > 0 && !runtime.rubbleActive;
  const breachedParts = new Set(runtime.breachedColliderPartIds ?? []);
  const sectionStages = descriptor.sections.map(section => {
    const state = runtime.sections?.[section.id];
    return state?.collapsed ? 'collapsed' : visualStage(section, state);
  });
  const roofSection = descriptor.sections.find(section => section.kind === 'roof');
  const roofState = roofSection ? runtime.sections?.[roofSection.id] : null;
  const roofStage = roofState?.collapsed
    ? 'collapsed'
    : (roofSection ? visualStage(roofSection, roofState) : worstStage(sectionStages));
  const damageExposesInterior = breachedParts.size > 0
    || STAGE_RANK[roofStage] >= STAGE_RANK.breached
    || descriptor.sections.some(section => {
      if (section.kind !== 'wall') return false;
      const state = runtime.sections?.[section.id];
      const stage = state?.collapsed ? 'collapsed' : visualStage(section, state);
      return STAGE_RANK[stage] >= STAGE_RANK.breached;
    });
  const interiorGeometryVisible = !runtime.rubbleActive
    && (interiorActive || damageExposesInterior);

  for (const tier of root.userData?.lodTiers ?? []) {
    for (const section of descriptor.sections) {
      const group = tier.sections?.get?.(section.id);
      if (!group) continue;
      const state = runtime.sections?.[section.id];
      const stage = state?.collapsed ? 'collapsed' : visualStage(section, state);
      applyDamageVariant(group, stage);
      if (section.kind === 'floor') {
        group.visible = interiorGeometryVisible && !state?.collapsed;
      }
      for (const piece of group.children) {
        if (section.kind === 'wall') {
          setInteriorGeometryVisible(piece, interiorGeometryVisible);
        }
        piece.userData.stage = stage;
        if (piece.userData?.batchedSectionParts) {
          for (const part of piece.userData.batchedSectionParts) {
            const breached = breachedParts.has(
              `${section.id}:${part.partId}`
            );
            piece.setVisibleAt(
              part.instanceId,
              !breached && sectionPartIsVisible(
                descriptor,
                runtime,
                part.openingId
              )
            );
          }
          continue;
        }
        if (piece.userData?.semantic === 'building-section-part') {
          // Re-establish the authored baseline before applying this runtime's
          // apertures and breaches. A rewind may otherwise leave a part hidden
          // by a later state even though the restored simulation says intact.
          piece.visible = sectionPartIsVisible(
            descriptor,
            runtime,
            piece.userData.openingId
          );
        }
      }
    }
  }

  for (const tier of root.userData?.lodTiers ?? []) {
    if (!tier.roof) continue;
    applyDamageVariant(tier.roof, roofStage);
    setInteriorGeometryVisible(tier.roof, interiorGeometryVisible);
  }
  for (const [openingId, opening] of Object.entries(runtime.openings ?? {})) {
    const detail = root.getObjectByName(`HouseOpening:${openingId}`);
    const frame = root.getObjectByName(`HouseFrame:${openingId}`);
    const sectionCollapsed = opening.sectionId != null
      && runtime.sections?.[opening.sectionId]?.collapsed === true;
    const enabled = opening.enabled !== false && !sectionCollapsed;
    const open = opening.open || opening.breached || opening.enabled === false;
    if (detail) detail.visible = enabled && !opening.breached;
    if (frame) frame.visible = enabled && !opening.breached;
    root.traverse(object => {
      if (object.userData?.openingId === openingId
          && object.userData.semantic === 'door-hinge') {
        object.visible = enabled && !opening.breached;
        object.rotation.y = open
          ? object.userData.openRotationY
          : object.userData.closedRotationY;
        object.updateMatrix();
      }
      if (object.userData?.openingId === openingId
          && object.userData.semantic === 'opening') {
        object.visible = enabled && !opening.breached;
      }
      if (object.userData?.openingId === openingId
          && object.userData.semantic === 'window-occluder') {
        object.visible = enabled && !opening.breached && !interiorActive;
      }
      if (object.userData?.openingId === openingId
          && object.userData.semantic === 'building-section-part') {
        object.visible = !sectionCollapsed
          && openingKind(descriptor, openingId) !== 'door'
          && !open;
      }
    });
  }
  root.traverse(object => {
    if (object.userData?.semantic !== 'building-section-part') return;
    if (object.userData?.batchedSectionParts) return;
    const key = `${object.userData.sectionId}:${object.userData.partId}`;
    if (breachedParts.has(key)) object.visible = false;
  });
  const stairPortal = descriptor.portals.find(portal => portal.kind === 'stair');
  const stairs = root.getObjectByName('HouseStairs');
  if (stairs) {
    stairs.visible = Boolean(
      interiorGeometryVisible
      && stairPortal
      && !(runtime.invalidPortals ?? []).includes(stairPortal.id)
    );
  }
  if (root.userData?.rubble) root.userData.rubble.visible = Boolean(runtime.rubbleActive);
  root.traverse(object => {
    if (!object.isMesh) return;
    const semantic = object.userData?.semantic ?? object.parent?.userData?.semantic;
    if (![
      'building-section-part',
      'facade-detail',
      'roof-silhouette',
      'opening',
      'opening-frame',
      'door-hinge',
      'stairs'
    ].includes(semantic)) return;
    applyInteriorFade(object, interiorActive);
  });
  root.userData.interiorPresence = resolvedPresence;
  root.userData.interiorFadeActive = interiorActive;
  root.userData.interiorGeometryVisible = interiorGeometryVisible;
  root.userData.damageExposesInterior = damageExposesInterior;
  root.userData.runtimeEventVersion = runtime.eventVersion ?? 0;
  root.userData.runtimeCollisionVersion = runtime.collisionVersion ?? 0;
  root.userData.collapseAnimator.project(runtime, collapseProjection);
}

/** Advance renderer-owned collapse motion from an already cached snapshot. */
export function advanceFrenchHouseVisualState(root, runtime, deltaTime) {
  root?.userData?.collapseAnimator?.advance(runtime, deltaTime);
}

export function hasActiveFrenchHouseVisualTransition(root) {
  return root?.userData?.collapseAnimator?.hasActiveTransitions?.() === true;
}

/**
 * Composition helper for TerrainBuilder's generic structure port. The caller
 * supplies the authoritative renderer-neutral descriptor; this module supplies
 * presentation functions only.
 */
export function createFrenchHouseVisualAdapter(descriptor) {
  if (!descriptor?.id) throw new Error('French house visual adapter requires a descriptor');
  return Object.freeze({
    descriptor,
    createVisual: createFrenchHouseVisual,
    applyVisualState: applyFrenchHouseVisualState,
    advanceVisualState: advanceFrenchHouseVisualState,
    hasActiveVisualTransition: hasActiveFrenchHouseVisualTransition
  });
}

/** Dispose only renderer-owned resources created by createFrenchHouseVisual(). */
export function disposeFrenchHouseVisual(root) {
  if (!root || root.userData?.houseVisualDisposed) return;
  root.userData.houseVisualDisposed = true;
  if (root.userData?.collapseAnimator) {
    root.userData.collapseAnimator.dispose();
    delete root.userData.collapseAnimator;
  }
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set(root.userData?.ownedSurfaceTextures ?? []);
  root?.traverse(object => {
    if (!object.isMesh) return;
    if (object.geometry?.dispose) geometries.add(object.geometry);
    const geometryVariants = GEOMETRY_VARIANTS.get(object);
    if (geometryVariants) {
      if (geometryVariants.exterior?.dispose) geometries.add(geometryVariants.exterior);
      if (geometryVariants.interior?.dispose) geometries.add(geometryVariants.interior);
      GEOMETRY_VARIANTS.delete(object);
    }
    const candidates = Array.isArray(object.material) ? object.material : [object.material];
    for (const candidate of candidates) {
      if (candidate?.userData?.houseVisualMaterial && candidate.dispose) {
        materials.add(candidate);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const candidate of materials) candidate.dispose();
  for (const texture of textures) texture.dispose();
  delete root.userData.ownedSurfaceTextures;
}

export { LOD_DISTANCES as FRENCH_HOUSE_LOD_DISTANCES, BuildingCollapseAnimator };
