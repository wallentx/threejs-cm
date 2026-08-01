import * as THREE from 'three';
import { BuildingCollapseAnimator } from './BuildingCollapseAnimator.js';

const LOD_DISTANCES = Object.freeze({ high: 0, medium: 42, core: 92, proxy: 180 });
const STAGE_RANK = Object.freeze({ intact: 0, damaged: 1, breached: 2, collapsed: 3 });
const DAMAGE_COLORS = Object.freeze({
  damaged: new THREE.Color('#928675'),
  breached: new THREE.Color('#5f5145')
});

function material(color, roughness = 0.9) {
  // House visuals never borrow global material-library entries. Runtime damage
  // and occupied-building fade are therefore local to this one house instance.
  const result = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    side: THREE.DoubleSide
  });
  result.userData.houseVisualMaterial = true;
  return result;
}

function meshBox(name, width, height, depth, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
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
    object.material.needsUpdate = true;
  });
}

function worstStage(stages) {
  return stages.reduce((worst, stage) => (
    (STAGE_RANK[stage] ?? 0) > (STAGE_RANK[worst] ?? 0) ? stage : worst
  ), 'intact');
}

function gabledRoof(width, depth, height, overhang = 0.42) {
  const hw = width * 0.5 + overhang;
  const hd = depth * 0.5 + overhang;
  const positions = new Float32Array([
    // Left Pitch (2 triangles)
    -hw, 0, hd,   0, height, hd,   0, height, -hd,
    -hw, 0, hd,   0, height, -hd, -hw, 0, -hd,

    // Right Pitch (2 triangles)
    0, height, hd,  hw, 0, hd,   hw, 0, -hd,
    0, height, hd,  hw, 0, -hd,  0, height, -hd,

    // Front Gable (1 triangle)
    -hw, 0, hd,  hw, 0, hd,  0, height, hd,

    // Back Gable (1 triangle)
    hw, 0, -hd,  -hw, 0, -hd,  0, height, -hd,

    // Bottom Eave Cap (2 triangles)
    -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,
    -hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
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
    overhang: 0.42,
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

function addOpeningDetail(group, aperture, normal, kind, sectionId) {
  const [x, y, z] = aperture.center;
  const [width, height] = aperture.size;
  const alongX = Math.abs(normal?.[0] ?? 0) > Math.abs(normal?.[2] ?? 0);
  const depth = 0.07;

  // Door leaf panel (visible only when door is closed) vs Open window pass-through
  if (kind === 'door') {
    const doorLeaf = meshBox(
      `HouseOpening:${aperture.id}`,
      alongX ? depth * 0.8 : width * 0.94,
      height * 0.98,
      alongX ? width * 0.94 : depth * 0.8,
      '#4a3220'
    );
    doorLeaf.position.set(x, y, z);
    doorLeaf.userData = {
      semantic: 'opening', openingId: aperture.id, kind,
      openingSectionId: sectionId
    };
    group.add(doorLeaf);
  }

  // 3D Frame casing trim around open aperture
  const frameColor = kind === 'door' ? '#3d281a' : '#d8cbb5';
  const frame = new THREE.Group();
  frame.name = `HouseFrame:${aperture.id}`;
  const rail = (label, w, h, d, dx, dy, dz) => {
    const piece = meshBox(label, alongX ? d : w, h, alongX ? w : d, frameColor);
    piece.position.set(x + dx, y + dy, z + dz);
    frame.add(piece);
  };
  const half = width * 0.5;
  if (alongX) {
    rail('OpeningFrameLeft', depth * 2, height + 0.12, depth * 2, 0, 0, -half);
    rail('OpeningFrameRight', depth * 2, height + 0.12, depth * 2, 0, 0, half);
    rail('OpeningFrameTop', depth * 2, 0.1, width + 0.12, 0, height * 0.5, 0);
  } else {
    rail('OpeningFrameLeft', depth * 2, height + 0.12, depth * 2, -half, 0, 0);
    rail('OpeningFrameRight', depth * 2, height + 0.12, depth * 2, half, 0, 0);
    rail('OpeningFrameTop', width + 0.12, 0.1, depth * 2, 0, height * 0.5, 0);
    if (kind === 'window') {
      rail('OpeningFrameSill', width + 0.2, 0.08, depth * 2.8, 0, -height * 0.5, 0);
    }
  }
  frame.userData = {
    semantic: 'opening-frame', openingId: aperture.id, kind,
    openingSectionId: sectionId
  };
  group.add(frame);
}

function buildDetailedShell(descriptor, runtime) {
  const group = new THREE.Group();
  group.name = 'FrenchHouseHighLOD';
  const sections = new Map();
  for (const section of descriptor.sections) {
    const sectionGroup = new THREE.Group();
    sectionGroup.name = `BuildingSection:${section.id}`;
    sectionGroup.userData = { semantic: 'building-section', sectionId: section.id, kind: section.kind };
    const sectionRuntime = runtime?.sections?.[section.id];
    const stage = visualStage(section, sectionRuntime);
    // The roof collision volume is a simulation primitive.  Rendering it as
    // a rectangular lid beneath the gable made the close LOD disagree with
    // the other tiers. The authored gable below owns that visible section.
    for (const part of section.kind === 'roof' ? [] : section.colliderParts) {
      const [x, y, z] = part.center;
      const [hx, hy, hz] = part.halfExtents;
      const color = section.kind === 'roof' ? '#8c352b'
        : section.kind === 'floor' ? '#8d765d'
          : section.kind === 'foundation' ? '#7c7568' : '#d8d0bd';
      const piece = meshBox(`SectionPart:${section.id}:${part.id}`, hx * 2, hy * 2, hz * 2, color);
      piece.position.set(x, y, z);
      piece.rotation.y = part.rotationY ?? 0;
      piece.userData = {
        semantic: 'building-section-part', sectionId: section.id, partId: part.id,
        stage, openingId: part.openingId ?? null
      };
      piece.visible = !openingIsOpen(descriptor, runtime, part.openingId);
      sectionGroup.add(piece);
    }
    sectionGroup.userData.stage = stage;
    sectionGroup.visible = !sectionRuntime?.collapsed;
    group.add(sectionGroup);
    sections.set(section.id, sectionGroup);
  }

  for (const portal of descriptor.portals) {
    if (portal.aperture) {
      addOpeningDetail(
        group,
        portal.aperture,
        portal.localNormal,
        portal.kind,
        portal.sectionId ?? null
      );
    }
  }
  for (const firePort of descriptor.firePorts) {
    addOpeningDetail(
      group,
      firePort.aperture,
      firePort.localNormal,
      'window',
      firePort.sectionId ?? null
    );
  }

  const roofProfile = houseRoofProfile(descriptor);
  const roof = new THREE.Mesh(
    gabledRoof(roofProfile.width, roofProfile.depth, roofProfile.height, roofProfile.overhang),
    material('#8f3128')
  );
  roof.name = 'HouseGabledRoof';
  roof.position.set(roofProfile.centerX, roofProfile.centerY, roofProfile.centerZ);
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.userData = {
    semantic: 'roof-silhouette',
    sectionId: descriptor.sections.find(section => section.kind === 'roof')?.id ?? null
  };
  group.add(roof);

  const stairs = new THREE.Group();
  stairs.name = 'HouseStairs';
  stairs.userData = { semantic: 'stairs' };
  const stairPortal = descriptor.portals.find(portal => portal.kind === 'stair');
  if (stairPortal) {
    const [x, y, z] = stairPortal.aperture?.center ?? [0, 0.2, -1.15];
    const stairHeight = stairPortal.aperture?.size?.[1] ?? 3.1;
    for (let step = 0; step < 7; step++) {
      const stair = meshBox(`Stair:${step}`, 1.05, 0.17, 0.28, '#7c654b');
      stair.userData = { semantic: 'stairs' };
      stair.position.set(x, y + 0.085 + step * (stairHeight / 7), z + 0.78 - step * 0.24);
      stairs.add(stair);
    }
  }
  group.add(stairs);
  return { group, sections };
}

function buildCheapShell(descriptor, level, runtime) {
  const bounds = descriptor.bounds;
  const width = bounds.max[0] - bounds.min[0];
  const depth = bounds.max[2] - bounds.min[2];
  const group = new THREE.Group();
  group.name = `FrenchHouse${level[0].toUpperCase()}${level.slice(1)}LOD`;
  const sections = new Map();
  const palette = level === 'proxy'
    ? { wall: '#887f70', floor: '#716350', foundation: '#716c63' }
    : level === 'core'
      ? { wall: '#c8bea7', floor: '#836e55', foundation: '#777164' }
      : { wall: '#d0c5ae', floor: '#8a7359', foundation: '#7d776b' };
  let shell = null;
  for (const section of descriptor.sections) {
    const sectionGroup = new THREE.Group();
    sectionGroup.name = `BuildingSection:${level}:${section.id}`;
    sectionGroup.userData = {
      semantic: 'building-section', sectionId: section.id, kind: section.kind, lod: level
    };
    // Foundation has a terrain-conforming visual at the root. Roof uses the
    // matching gable below. All wall and floor pieces retain the same
    // descriptor footprint and apertures at every distance tier.
    const visibleParts = ['foundation', 'roof'].includes(section.kind) ? [] : section.colliderParts;
    for (const part of visibleParts) {
      const [x, y, z] = part.center;
      const [hx, hy, hz] = part.halfExtents;
      const color = section.kind === 'floor' ? palette.floor : palette.wall;
      const piece = meshBox(
        `SectionPart:${level}:${section.id}:${part.id}`,
        hx * 2,
        hy * 2,
        hz * 2,
        color
      );
      piece.position.set(x, y, z);
      piece.rotation.y = part.rotationY ?? 0;
      piece.visible = !openingIsOpen(descriptor, runtime, part.openingId);
      piece.userData = {
        semantic: 'building-section-part', sectionId: section.id, partId: part.id,
        openingId: part.openingId ?? null, lod: level
      };
      sectionGroup.add(piece);
      if (section.kind === 'wall' && !shell) shell = piece;
    }
    group.add(sectionGroup);
    sections.set(section.id, sectionGroup);
  }
  const addCheapOpening = (aperture, normal, kind, sectionId) => {
    const [x, y, z] = aperture.center;
    const [width, height] = aperture.size;
    const alongX = Math.abs(normal?.[0] ?? 0) > Math.abs(normal?.[2] ?? 0);
    const color = kind === 'door' ? '#4a3220' : '#1f1c18';
    // Offset slightly outward from wall face (wall surface is at z = 4.50 or x = 6.00)
    const offsetX = alongX ? (x > 0 ? 0.01 : -0.01) : 0;
    const offsetZ = alongX ? 0 : (z > 0 ? 0.01 : -0.01);
    const panel = meshBox(
      `HouseCheapOpening:${level}:${aperture.id}`,
      alongX ? 0.02 : width * 0.94,
      height * 0.94,
      alongX ? width * 0.94 : 0.02,
      color
    );
    panel.position.set(x + offsetX, y, z + offsetZ);
    panel.userData = {
      semantic: 'opening',
      openingId: aperture.id,
      kind,
      openingSectionId: sectionId,
      lod: level
    };
    if (kind === 'door') {
      panel.visible = !openingIsOpen(descriptor, runtime, aperture.id);
    }
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
  const roof = new THREE.Mesh(
    gabledRoof(roofProfile.width, roofProfile.depth, roofProfile.height, roofProfile.overhang),
    material('#81332d')
  );
  roof.position.set(roofProfile.centerX, roofProfile.centerY, roofProfile.centerZ);
  roof.name = 'HouseCheapRoof';
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.userData = {
    semantic: 'roof-silhouette',
    sectionId: descriptor.sections.find(section => section.kind === 'roof')?.id ?? null,
    lod: level
  };
  group.add(roof);
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
export function createFrenchHouseVisual({ descriptor, runtime, centerX, centerZ, foundationTopY, getHeightAt }) {
  const root = new THREE.Group();
  root.name = 'FrenchVillageHouse';
  const rotationY = runtime?.transform?.rotationY ?? 0;
  root.position.set(centerX, foundationTopY, centerZ);
  root.rotation.y = rotationY;
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
    material('#777164')
  );
  foundation.name = 'HouseFoundation';
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  root.add(foundation);

  const lod = new THREE.LOD();
  lod.name = 'FrenchHouseLOD';
  const detailed = buildDetailedShell(descriptor, runtime);
  const lodTiers = [{ lod: 'high', group: detailed.group, sections: detailed.sections, roof: detailed.group.getObjectByName('HouseGabledRoof'), shell: null }];
  const cheapShells = [];
  lod.addLevel(detailed.group, LOD_DISTANCES.high);
  for (const [level, distance] of [
    ['medium', LOD_DISTANCES.medium],
    ['core', LOD_DISTANCES.core],
    ['proxy', LOD_DISTANCES.proxy]
  ]) {
    const cheap = buildCheapShell(descriptor, level, runtime);
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
    dimensionsMeters: { width, depth, height: descriptor.bounds.max[1] - descriptor.bounds.min[1] },
    foundation: { topY: foundationTopY, footprintCorners: foundation.geometry.userData.worldFootprintCorners },
    lodDistances: { ...LOD_DISTANCES },
    buildingSections: detailed.sections,
    lodTiers,
    cheapShells,
    detailedRoof: detailed.group.getObjectByName('HouseGabledRoof'),
    rubble
  };
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

  for (const tier of root.userData?.lodTiers ?? []) {
    for (const section of descriptor.sections) {
      const group = tier.sections?.get?.(section.id);
      if (!group) continue;
      const state = runtime.sections?.[section.id];
      const stage = state?.collapsed ? 'collapsed' : visualStage(section, state);
      applyDamageVariant(group, stage);
      for (const piece of group.children) {
        piece.userData.stage = stage;
        if (piece.userData?.semantic === 'building-section-part') {
          // Re-establish the authored baseline before applying this runtime's
          // apertures and breaches. A rewind may otherwise leave a part hidden
          // by a later state even though the restored simulation says intact.
          piece.visible = !openingIsOpen(descriptor, runtime, piece.userData.openingId);
        }
      }
    }
  }

  const sectionStages = descriptor.sections.map(section => {
    const state = runtime.sections?.[section.id];
    return state?.collapsed ? 'collapsed' : visualStage(section, state);
  });
  const roofSection = descriptor.sections.find(section => section.kind === 'roof');
  const roofState = roofSection ? runtime.sections?.[roofSection.id] : null;
  const roofStage = roofState?.collapsed
    ? 'collapsed'
    : (roofSection ? visualStage(roofSection, roofState) : worstStage(sectionStages));
  for (const tier of root.userData?.lodTiers ?? []) {
    if (tier.roof) applyDamageVariant(tier.roof, roofStage);
  }
  const breachedParts = new Set(runtime.breachedColliderPartIds ?? []);
  for (const [openingId, opening] of Object.entries(runtime.openings ?? {})) {
    const detail = root.getObjectByName(`HouseOpening:${openingId}`);
    const frame = root.getObjectByName(`HouseFrame:${openingId}`);
    const sectionCollapsed = opening.sectionId != null
      && runtime.sections?.[opening.sectionId]?.collapsed === true;
    const enabled = opening.enabled !== false && !sectionCollapsed;
    const open = opening.open || opening.breached || opening.enabled === false;
    if (detail) detail.visible = enabled && !open;
    if (frame) frame.visible = enabled && !opening.breached;
    root.traverse(object => {
      if (object.userData?.openingId === openingId
          && object.userData.semantic === 'opening') {
        object.visible = object.userData.kind === 'door'
          ? enabled && !open
          : enabled && !opening.breached;
      }
      if (object.userData?.openingId === openingId
          && object.userData.semantic === 'building-section-part') {
        object.visible = !sectionCollapsed && !open;
      }
    });
  }
  root.traverse(object => {
    if (object.userData?.semantic !== 'building-section-part') return;
    const key = `${object.userData.sectionId}:${object.userData.partId}`;
    if (breachedParts.has(key)) object.visible = false;
  });
  const stairPortal = descriptor.portals.find(portal => portal.kind === 'stair');
  const stairs = root.getObjectByName('HouseStairs');
  if (stairs && stairPortal) {
    stairs.visible = !(runtime.invalidPortals ?? []).includes(stairPortal.id);
  }
  if (root.userData?.rubble) root.userData.rubble.visible = Boolean(runtime.rubbleActive);
  const resolvedPresence = Math.max(0, Number(interiorPresence) || 0);
  const interiorActive = resolvedPresence > 0 && !runtime.rubbleActive;
  root.traverse(object => {
    if (!object.isMesh) return;
    const semantic = object.userData?.semantic ?? object.parent?.userData?.semantic;
    if (!['building-section-part', 'roof-silhouette', 'opening', 'opening-frame', 'stairs'].includes(semantic)) return;
    applyInteriorFade(object, interiorActive);
  });
  root.userData.interiorPresence = resolvedPresence;
  root.userData.interiorFadeActive = interiorActive;
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
  root?.traverse(object => {
    if (!object.isMesh) return;
    if (object.geometry?.dispose) geometries.add(object.geometry);
    const candidates = Array.isArray(object.material) ? object.material : [object.material];
    for (const candidate of candidates) {
      if (candidate?.userData?.houseVisualMaterial && candidate.dispose) {
        materials.add(candidate);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const candidate of materials) candidate.dispose();
}

export { LOD_DISTANCES as FRENCH_HOUSE_LOD_DISTANCES, BuildingCollapseAnimator };
