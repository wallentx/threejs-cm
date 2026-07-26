import * as THREE from 'three';

const LOD_DISTANCES = Object.freeze({ high: 0, medium: 42, core: 92, proxy: 180 });
const STAGE_RANK = Object.freeze({ intact: 0, damaged: 1, breached: 2, collapsed: 3 });
const DAMAGE_COLORS = Object.freeze({
  damaged: new THREE.Color('#928675'),
  breached: new THREE.Color('#5f5145')
});

function material(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
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
    roughness: object.material?.roughness ?? null
  };
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
    -hw, 0, hd, 0, height, hd, 0, height, -hd, -hw, 0, -hd,
    hw, 0, -hd, 0, height, -hd, 0, height, hd, hw, 0, hd,
    -hw, 0, hd, hw, 0, hd, 0, height, hd,
    hw, 0, -hd, -hw, 0, -hd, 0, height, -hd
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function terrainFoundation({ centerX, centerZ, width, depth, topY, getHeightAt }) {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const corners = [
    [centerX - hw, centerZ + hd], [centerX + hw, centerZ + hd],
    [centerX + hw, centerZ - hd], [centerX - hw, centerZ - hd]
  ];
  const positions = [];
  const uvs = [];
  const bottom = corners.map(([x, z]) => new THREE.Vector3(x - centerX, getHeightAt(x, z) - topY, z - centerZ));
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
  geometry.userData.worldFootprintCorners = corners.map(([x, z], index) => [x, bottom[index].y + topY, z]);
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

function addOpeningDetail(group, aperture, normal, kind) {
  const [x, y, z] = aperture.center;
  const [width, height] = aperture.size;
  const alongX = Math.abs(normal?.[0] ?? 0) > Math.abs(normal?.[2] ?? 0);
  const depth = 0.07;
  const darkness = meshBox(`HouseOpening:${aperture.id}`, alongX ? depth : width, height, alongX ? width : depth, '#16130f');
  darkness.position.set(x, y, z);
  darkness.userData = { semantic: 'opening', openingId: aperture.id, kind };
  group.add(darkness);
  const frameColor = kind === 'door' ? '#4f3422' : '#ece2c7';
  const frame = new THREE.Group();
  frame.name = `HouseFrame:${aperture.id}`;
  const rail = (label, w, h, d, dx, dy, dz) => {
    const piece = meshBox(label, alongX ? d : w, h, alongX ? w : d, frameColor);
    piece.position.set(x + dx, y + dy, z + dz);
    frame.add(piece);
  };
  const half = width * 0.5;
  if (alongX) {
    rail('OpeningFrameLeft', depth * 2, height + 0.16, depth * 2, 0, 0, -half);
    rail('OpeningFrameRight', depth * 2, height + 0.16, depth * 2, 0, 0, half);
    rail('OpeningFrameTop', depth * 2, 0.12, width + 0.16, 0, height * 0.5, 0);
  } else {
    rail('OpeningFrameLeft', depth * 2, height + 0.16, depth * 2, -half, 0, 0);
    rail('OpeningFrameRight', depth * 2, height + 0.16, depth * 2, half, 0, 0);
    rail('OpeningFrameTop', width + 0.16, 0.12, depth * 2, 0, height * 0.5, 0);
  }
  frame.userData = { semantic: 'opening-frame', openingId: aperture.id, kind };
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
    for (const part of section.colliderParts) {
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
      const opening = part.openingId ? runtime?.openings?.[part.openingId] : null;
      piece.visible = !(opening?.open || opening?.breached || opening?.enabled === false
        || (!opening && descriptor.portals.concat(descriptor.firePorts).some(record => (
          record.aperture?.id === part.openingId && record.aperture?.initiallyOpen
        ))));
      sectionGroup.add(piece);
    }
    sectionGroup.userData.stage = stage;
    sectionGroup.visible = !sectionRuntime?.collapsed;
    group.add(sectionGroup);
    sections.set(section.id, sectionGroup);
  }

  for (const portal of descriptor.portals) {
    if (portal.aperture) addOpeningDetail(group, portal.aperture, portal.localNormal, portal.kind);
  }
  for (const firePort of descriptor.firePorts) addOpeningDetail(group, firePort.aperture, firePort.localNormal, 'window');

  const bounds = descriptor.bounds;
  const width = bounds.max[0] - bounds.min[0];
  const depth = bounds.max[2] - bounds.min[2];
  const roofHeight = Math.max(1.1, (bounds.max[1] - bounds.min[1]) * 0.34);
  const roof = new THREE.Mesh(gabledRoof(width, depth, roofHeight), material('#8f3128'));
  roof.name = 'HouseGabledRoof';
  roof.position.set((bounds.min[0] + bounds.max[0]) * 0.5, bounds.max[1] - roofHeight, (bounds.min[2] + bounds.max[2]) * 0.5);
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.userData = { semantic: 'roof-silhouette', sectionId: descriptor.sections.find(section => section.kind === 'roof')?.id ?? null };
  group.add(roof);

  const stairs = new THREE.Group();
  stairs.name = 'HouseStairs';
  const stairPortal = descriptor.portals.find(portal => portal.kind === 'stair');
  if (stairPortal) {
    const [x, y, z] = stairPortal.aperture?.center ?? [0, 0.2, -1.15];
    const stairHeight = stairPortal.aperture?.size?.[1] ?? 3.1;
    for (let step = 0; step < 7; step++) {
      const stair = meshBox(`Stair:${step}`, 1.05, 0.17, 0.28, '#7c654b');
      stair.position.set(x, y + 0.085 + step * (stairHeight / 7), z + 0.78 - step * 0.24);
      stairs.add(stair);
    }
  }
  group.add(stairs);
  return { group, sections };
}

function buildCheapShell(descriptor, level) {
  const bounds = descriptor.bounds;
  const width = bounds.max[0] - bounds.min[0];
  const depth = bounds.max[2] - bounds.min[2];
  const height = bounds.max[1] - bounds.min[1];
  const group = new THREE.Group();
  group.name = `FrenchHouse${level[0].toUpperCase()}${level.slice(1)}LOD`;
  const shell = meshBox('HouseSilhouette', width, height * 0.68, depth, level === 'proxy' ? '#7e7768' : '#c9bea7');
  shell.position.y = bounds.min[1] + height * 0.34;
  shell.userData = { semantic: 'cheap-shell' };
  group.add(shell);
  const roof = new THREE.Mesh(gabledRoof(width, depth, Math.max(0.9, height * 0.32)), material('#81332d'));
  roof.position.y = bounds.min[1] + height * 0.68;
  roof.name = 'HouseCheapRoof';
  roof.userData = { semantic: 'cheap-roof' };
  group.add(roof);
  group.userData = { semantic: 'building-lod', lod: level, shell, roof };
  return group;
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
  root.position.set(centerX, foundationTopY, centerZ);
  root.rotation.y = runtime?.transform?.rotationY ?? 0;
  const width = descriptor.bounds.max[0] - descriptor.bounds.min[0];
  const depth = descriptor.bounds.max[2] - descriptor.bounds.min[2];
  const foundation = new THREE.Mesh(
    terrainFoundation({ centerX, centerZ, width, depth, topY: foundationTopY, getHeightAt }),
    material('#777164')
  );
  foundation.name = 'HouseFoundation';
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  root.add(foundation);

  const lod = new THREE.LOD();
  lod.name = 'FrenchHouseLOD';
  const detailed = buildDetailedShell(descriptor, runtime);
  const cheapShells = [];
  lod.addLevel(detailed.group, LOD_DISTANCES.high);
  for (const [level, distance] of [
    ['medium', LOD_DISTANCES.medium],
    ['core', LOD_DISTANCES.core],
    ['proxy', LOD_DISTANCES.proxy]
  ]) {
    const cheap = buildCheapShell(descriptor, level);
    cheapShells.push(cheap);
    lod.addLevel(cheap, distance);
  }
  root.add(lod);
  const rubble = buildRubble(descriptor);
  root.add(rubble);
  root.userData = {
    descriptorId: descriptor.id,
    buildingId: runtime?.id ?? null,
    dimensionsMeters: { width, depth, height: descriptor.bounds.max[1] - descriptor.bounds.min[1] },
    foundation: { topY: foundationTopY, footprintCorners: foundation.geometry.userData.worldFootprintCorners },
    lodDistances: { ...LOD_DISTANCES },
    buildingSections: detailed.sections,
    cheapShells,
    detailedRoof: detailed.group.getObjectByName('HouseGabledRoof'),
    rubble
  };
  applyFrenchHouseVisualState(root, descriptor, runtime);
  return root;
}

export function applyFrenchHouseVisualState(root, descriptor, runtime) {
  if (!root || !descriptor || !runtime) return;
  const sections = root.userData?.buildingSections;
  for (const section of descriptor.sections) {
    const group = sections?.get?.(section.id);
    if (!group) continue;
    const state = runtime.sections?.[section.id];
    const stage = state?.collapsed ? 'collapsed' : visualStage(section, state);
    applyDamageVariant(group, stage);
    for (const piece of group.children) piece.userData.stage = stage;
  }
  const sectionStages = descriptor.sections.map(section => {
    const state = runtime.sections?.[section.id];
    return state?.collapsed ? 'collapsed' : visualStage(section, state);
  });
  const shellStages = descriptor.sections
    .filter(section => section.kind !== 'roof')
    .map(section => {
      const state = runtime.sections?.[section.id];
      return state?.collapsed ? 'collapsed' : visualStage(section, state);
    });
  const roofSection = descriptor.sections.find(section => section.kind === 'roof');
  const roofState = roofSection ? runtime.sections?.[roofSection.id] : null;
  const roofStage = roofState?.collapsed
    ? 'collapsed'
    : (roofSection ? visualStage(roofSection, roofState) : worstStage(sectionStages));
  const shellStage = worstStage(shellStages);
  const detailedRoof = root.userData?.detailedRoof;
  if (detailedRoof) applyDamageVariant(detailedRoof, roofStage);
  for (const cheap of root.userData?.cheapShells ?? []) {
    applyDamageVariant(cheap.userData.shell, shellStage);
    applyDamageVariant(cheap.userData.roof, roofStage);
    cheap.visible = cheap.userData.shell.visible || cheap.userData.roof.visible;
  }
  const breachedParts = new Set(runtime.breachedColliderPartIds ?? []);
  for (const [openingId, opening] of Object.entries(runtime.openings ?? {})) {
    const detail = root.getObjectByName(`HouseOpening:${openingId}`);
    const frame = root.getObjectByName(`HouseFrame:${openingId}`);
    const open = opening.open || opening.breached || opening.enabled === false;
    if (detail) detail.visible = opening.enabled !== false && open;
    if (frame) frame.visible = !opening.breached && opening.enabled !== false;
    root.traverse(object => {
      if (object.userData?.openingId === openingId
          && object.userData.semantic === 'building-section-part') object.visible = !open;
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
  root.userData.runtimeEventVersion = runtime.eventVersion ?? 0;
  root.userData.runtimeCollisionVersion = runtime.collisionVersion ?? 0;
}

export { LOD_DISTANCES as FRENCH_HOUSE_LOD_DISTANCES };
