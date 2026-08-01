import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { FR_FARMHOUSE_8X6_1F } from '../src/maps/france/FranceFarmhouse8x6_1F.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { TerrainBuilder } from './helpers/France1940TestTerrain.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import {
  applyFrenchHouseVisualState,
  createFrenchHouseVisualAdapter,
  createFrenchHouseVisual,
  disposeFrenchHouseVisual,
  FRENCH_HOUSE_LOD_DISTANCES
} from '../src/world/buildings/FrenchHouse.js';

const STRUCTURE_ADAPTERS = Object.freeze({
  [FR_HOUSE_12X9_2F.id]: createFrenchHouseVisualAdapter(FR_HOUSE_12X9_2F),
  [FR_FARMHOUSE_8X6_1F.id]:
    createFrenchHouseVisualAdapter(FR_FARMHOUSE_8X6_1F)
});

function createTerrain(buildingSystem = new BuildingSystem()) {
  for (const descriptor of [FR_HOUSE_12X9_2F, FR_FARMHOUSE_8X6_1F]) {
    if (!buildingSystem.descriptors.has(descriptor.id)) {
      buildingSystem.registerDescriptor(descriptor);
    }
  }
  return new TerrainBuilder(new THREE.Scene(), {
    mapDescriptor: STONNE_1940_MAP,
    buildingSystem,
    structureAdapters: STRUCTURE_ADAPTERS
  });
}

function roundedBounds(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return {
    minX: Number(box.min.x.toFixed(3)), maxX: Number(box.max.x.toFixed(3)),
    minZ: Number(box.min.z.toFixed(3)), maxZ: Number(box.max.z.toFixed(3)),
    maxY: Number(box.max.y.toFixed(3))
  };
}

test('French house renderer exposes semantic shell sections, openings, stairs, and all LOD tiers', () => {
  const house = createFrenchHouseVisual({
    descriptor: FR_HOUSE_12X9_2F,
    centerX: 0,
    centerZ: 0,
    foundationTopY: 2,
    getHeightAt: () => 1.5
  });
  assert.equal(house.name, 'FrenchVillageHouse');
  assert.equal(house.userData.descriptorId, FR_HOUSE_12X9_2F.id);
  assert.equal(house.getObjectByName('HouseFoundation').geometry.userData.topY, 2);
  assert.ok(house.getObjectByName('HouseStairs').children.length >= 7);
  assert.ok(house.getObjectByName('HouseOpening:front-door-aperture'));
  assert.ok(house.getObjectByName('HouseFrame:upper-window-left-aperture'));
  assert.ok(house.getObjectByName('HouseFrame:ground-rear-window-left-aperture'));
  assert.ok(house.getObjectByName('HouseFrame:upper-rear-window-right-aperture'));
  for (const section of FR_HOUSE_12X9_2F.sections) {
    const group = house.getObjectByName(`BuildingSection:${section.id}`);
    assert.ok(group, `missing semantic visual group for ${section.id}`);
    assert.equal(group.userData.sectionId, section.id);
  }
  const lod = house.getObjectByName('FrenchHouseLOD');
  assert.equal(lod.levels.length, 4);
  assert.deepEqual(lod.levels.map(level => level.distance), Object.values(FRENCH_HOUSE_LOD_DISTANCES));
  const tierBounds = house.userData.lodTiers.map(tier => roundedBounds(tier.group));
  assert.ok(tierBounds.every(bounds => JSON.stringify(bounds) === JSON.stringify(tierBounds[0])),
    'all LOD tiers retain the same exterior footprint and roof height');
  const roofReference = house.userData.lodTiers[0].roof;
  for (const tier of house.userData.lodTiers.slice(1)) {
    assert.deepEqual(tier.roof.position.toArray(), roofReference.position.toArray(),
      `${tier.lod} uses the same roof eaves and ridge origin`);
    assert.deepEqual(
      [...tier.roof.geometry.getAttribute('position').array],
      [...roofReference.geometry.getAttribute('position').array],
      `${tier.lod} uses the same roof pitch and overhang geometry`
    );
  }
  for (const tier of house.userData.lodTiers) {
    for (const partId of ['ground-left-window', 'ground-rear-left-window']) {
      const partName = tier.lod === 'high'
        ? `SectionPart:ground-shell:${partId}`
        : `SectionPart:${tier.lod}:ground-shell:${partId}`;
      const window = tier.group.getObjectByName(partName);
      assert.ok(window, `${tier.lod} retains ${partId} opening segment`);
      assert.equal(
        window.visible,
        false,
        `${tier.lod} does not replace ${partId} with a solid proxy box`
      );
    }
  }
  disposeFrenchHouseVisual(house);
});

test('French house disposal releases each unique owned resource exactly once', () => {
  const house = createFrenchHouseVisual({
    descriptor: FR_FARMHOUSE_8X6_1F,
    centerX: 0,
    centerZ: 0,
    foundationTopY: 0,
    getHeightAt: () => 0
  });
  const geometries = new Set();
  const materials = new Set();
  let meshCount = 0;
  house.traverse(object => {
    if (!object.isMesh) return;
    meshCount++;
    geometries.add(object.geometry);
    for (const candidate of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (candidate?.userData?.houseVisualMaterial) materials.add(candidate);
    }
  });
  assert.ok(materials.size < meshCount, 'rubble meshes exercise a shared owned material');

  const disposeCounts = new Map(
    [...geometries, ...materials].map(resource => [resource, 0])
  );
  for (const resource of disposeCounts.keys()) {
    resource.addEventListener('dispose', () => {
      disposeCounts.set(resource, disposeCounts.get(resource) + 1);
    });
  }

  disposeFrenchHouseVisual(house);
  disposeFrenchHouseVisual(house);

  assert.ok(disposeCounts.size > 0);
  assert.ok(
    [...disposeCounts.values()].every(count => count === 1),
    'each unique instance-owned geometry and material emits one dispose event'
  );
  assert.equal(house.userData.houseVisualDisposed, true);
});

test('runtime occupancy stays opaque until an explicit interior projection activates fade', () => {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house-projection', descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const occupied = buildings.occupySlot('house-projection', {
    slotId: 'ground-front-left',
    soldierKey: 'unit-a:soldier-a',
    unitId: 'unit-a',
    soldierId: 'soldier-a'
  });
  assert.equal(occupied.accepted, true);

  const runtime = buildings.getBuildingSnapshot('house-projection');
  assert.equal(Object.keys(runtime.occupancy).length, 1);
  const house = createFrenchHouseVisual({
    descriptor: FR_HOUSE_12X9_2F,
    runtime,
    centerX: 0, centerZ: 0, foundationTopY: 0, getHeightAt: () => 0
  });
  assert.equal(house.userData.interiorPresence, 0);
  assert.equal(house.userData.interiorFadeActive, false);

  applyFrenchHouseVisualState(house, FR_HOUSE_12X9_2F, runtime, {
    interiorPresence: 1
  });
  assert.equal(house.userData.interiorPresence, 1);
  assert.equal(house.userData.interiorFadeActive, true);

  applyFrenchHouseVisualState(house, FR_HOUSE_12X9_2F, runtime);
  assert.equal(house.userData.interiorPresence, 0);
  assert.equal(house.userData.interiorFadeActive, false);
  disposeFrenchHouseVisual(house);
});

test('explicit interior projection fades and restores the active high, medium, core, and proxy LOD', () => {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house-occupied', descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const house = createFrenchHouseVisual({
    descriptor: FR_HOUSE_12X9_2F,
    runtime: buildings.getBuildingSnapshot('house-occupied'),
    centerX: 0, centerZ: 0, foundationTopY: 0, getHeightAt: () => 0
  });
  const fadeableMeshes = [];
  house.traverse(object => {
    if (!object.isMesh) return;
    const semantic = object.userData?.semantic ?? object.parent?.userData?.semantic;
    if (['building-section-part', 'roof-silhouette', 'opening', 'opening-frame', 'stairs']
      .includes(semantic)) fadeableMeshes.push(object);
  });
  const initialMaterials = fadeableMeshes.map(mesh => mesh.material);
  const lod = house.getObjectByName('FrenchHouseLOD');
  const camera = new THREE.PerspectiveCamera();
  house.updateMatrixWorld(true);
  applyFrenchHouseVisualState(house, FR_HOUSE_12X9_2F, buildings.getBuildingSnapshot('house-occupied'), {
    interiorPresence: 1
  });
  assert.equal(house.userData.interiorFadeActive, true);
  assert.ok(fadeableMeshes.every(mesh => (
    mesh.material.transparent && mesh.material.opacity <= 0.26 && mesh.material.depthWrite === false
  )));
  assert.ok(fadeableMeshes.every((mesh, index) => mesh.material === initialMaterials[index]),
    'fade mutates only this house renderer material instances rather than swapping shared materials');

  for (const [distance, expectedLod] of [
    [20, 'high'],
    [60, 'medium'],
    [120, 'core'],
    [220, 'proxy']
  ]) {
    camera.position.set(0, 0, distance);
    camera.updateMatrixWorld(true);
    lod.update(camera);
    const visibleTiers = house.userData.lodTiers
      .filter(tier => tier.group.visible)
      .map(tier => tier.lod);
    assert.deepEqual(visibleTiers, [expectedLod], `${expectedLod} is the sole tier at ${distance} m`);
    const activeTier = house.userData.lodTiers.find(tier => tier.lod === expectedLod);
    const activeMeshes = [];
    activeTier.group.traverse(object => {
      if (!object.isMesh) return;
      const semantic = object.userData?.semantic ?? object.parent?.userData?.semantic;
      if (['building-section-part', 'roof-silhouette', 'opening', 'opening-frame', 'stairs']
        .includes(semantic)) activeMeshes.push(object);
    });
    assert.ok(activeMeshes.length > 0);
    assert.ok(activeMeshes.every(mesh => (
      mesh.material.transparent
      && mesh.material.opacity <= 0.26
      && mesh.material.depthWrite === false
    )), `${expectedLod} uses the equivalent fade policy`);
  }

  applyFrenchHouseVisualState(house, FR_HOUSE_12X9_2F, buildings.getBuildingSnapshot('house-occupied'), {
    interiorPresence: 0
  });
  assert.equal(house.userData.interiorFadeActive, false);
  assert.ok(fadeableMeshes.every(mesh => (
    mesh.material.transparent === false && mesh.material.opacity === 1 && mesh.material.depthWrite === true
  )));
  assert.ok(fadeableMeshes.every((mesh, index) => mesh.material === initialMaterials[index]));
  disposeFrenchHouseVisual(house);
});

test('door leaves hide when open and appear when closed at every LOD', () => {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house-door',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const house = createFrenchHouseVisual({
    descriptor: FR_HOUSE_12X9_2F,
    runtime: buildings.getBuildingSnapshot('house-door'),
    centerX: 0,
    centerZ: 0,
    foundationTopY: 0,
    getHeightAt: () => 0
  });
  const doorLeaves = [
    house.getObjectByName('HouseOpening:front-door-aperture'),
    ...['medium', 'core', 'proxy'].map(level =>
      house.getObjectByName(`HouseCheapOpening:${level}:front-door-aperture`)
    )
  ];
  assert.ok(doorLeaves.every(Boolean));
  assert.ok(doorLeaves.every(leaf => leaf.visible === false));

  buildings.setOpening('house-door', 'front-door-aperture', false);
  applyFrenchHouseVisualState(
    house,
    FR_HOUSE_12X9_2F,
    buildings.getBuildingSnapshot('house-door')
  );
  assert.ok(doorLeaves.every(leaf => leaf.visible === true));
  disposeFrenchHouseVisual(house);
});

test('terrain publishes segmented movement shell; windows and doors require building interaction', () => {
  const terrain = createTerrain();
  terrain.buildStructures();
  const records = terrain.colliderRecords.filter(record => record.buildingId === 'french_village_house');
  assert.ok(records.length >= 7, 'descriptor wall pieces become individual colliders');
  assert.ok(records.every(record => record.sectionId === 'ground-shell' || record.sectionId === 'upper-shell'));
  assert.equal(terrain.collisionWorld.getCollider('building:french_village_house'), null);
  assert.ok(!records.some(record => record.halfX === 6 && record.halfZ === 4.5), 'no solid footprint blocker');
  assert.ok(records.some(record => record.id.endsWith(':ground-door')), 'door remains a movement blocker');
  assert.ok(records.some(record => record.id.endsWith(':ground-left-window')), 'window remains a movement blocker');

  const throughDoor = terrain.collisionWorld.resolveCircleMotion(
    { x: 45, z: 69 }, { x: 0, z: -8 }, 0.25, { moverType: 'infantry' }
  );
  assert.equal(throughDoor.blocked, true, 'ordinary infantry cannot bypass portal transit through the door');

  const throughWindow = terrain.collisionWorld.resolveCircleMotion(
    { x: 41.8, z: 69 }, { x: 0, z: -8 }, 0.25, { moverType: 'infantry' }
  );
  assert.equal(throughWindow.blocked, true, 'windows remain movement blockers despite projectile/LOS apertures');
});

test('runtime building movement shell cannot bypass open door or window apertures', () => {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  const terrain = createTerrain(buildings);
  terrain.buildStructures();

  const movementRecords = terrain.colliderRecords
    .filter(record => record.buildingId === 'french_village_house');
  assert.equal(
    movementRecords.find(record => record.partId === 'ground-door')?.movementPolicy,
    'portal_transit_required'
  );
  assert.equal(
    movementRecords.find(record => record.partId === 'ground-left-window')?.movementPolicy,
    'fire_port_blocks_movement'
  );

  for (const start of [{ x: 45, z: 69 }, { x: 41.8, z: 69 }]) {
    const result = terrain.collisionWorld.resolveCircleMotion(
      start, { x: 0, z: -8 }, 0.25, { moverType: 'infantry' }
    );
    assert.equal(result.blocked, true);
  }
});

test('building damage changes authored geometry at every LOD and collapse reveals rubble', () => {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house-damage',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const house = createFrenchHouseVisual({
    descriptor: FR_HOUSE_12X9_2F,
    runtime: buildings.getBuildingSnapshot('house-damage'),
    centerX: 0,
    centerZ: 0,
    foundationTopY: 0,
    getHeightAt: () => 0
  });
  const cheapShells = house.userData.cheapShells;
  const intactColors = cheapShells.map(group => group.userData.shell.material.color.getHex());

  buildings.applyProjectileDamage('house-damage', {
    sectionId: 'ground-shell',
    colliderPartId: 'ground-back',
    amount: 650,
    penetrationMm: 400
  });
  applyFrenchHouseVisualState(
    house,
    FR_HOUSE_12X9_2F,
    buildings.getBuildingSnapshot('house-damage')
  );
  assert.equal(house.getObjectByName('BuildingSection:ground-shell').userData.stage, 'breached');
  for (const tier of house.userData.lodTiers) {
    assert.equal(tier.sections.get('ground-shell').userData.stage, 'breached',
      `${tier.lod} independently receives section damage state`);
  }
  assert.equal(
    house.getObjectByName('SectionPart:ground-shell:ground-back').visible,
    false,
    'the authoritative breach removes its exact detailed wall part'
  );
  cheapShells.forEach((group, index) => {
    assert.notEqual(group.userData.shell.material.color.getHex(), intactColors[index]);
    assert.ok(group.userData.shell.scale.y < 1, `${group.userData.lod} LOD has damaged geometry`);
  });

  buildings.applyBlastDamage('house-damage', {
    sectionDamages: [{ sectionId: 'roof', amount: 1000 }]
  });
  applyFrenchHouseVisualState(
    house,
    FR_HOUSE_12X9_2F,
    buildings.getBuildingSnapshot('house-damage')
  );
  assert.equal(house.getObjectByName('HouseGabledRoof').visible, false);
  assert.ok(cheapShells.every(group => group.userData.roof.visible === false));
  for (const tier of house.userData.lodTiers) {
    assert.equal(tier.roof.visible, false, `${tier.lod} independently collapses roof state`);
  }
  const rubble = house.getObjectByName('HouseRubble');
  assert.equal(rubble.visible, true);
  assert.ok(rubble.children.length >= FR_HOUSE_12X9_2F.rubble.colliderParts.length * 6);
});

test('floor damage never leaks into an arbitrary cheap-LOD wall segment', () => {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house-floor-damage',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const house = createFrenchHouseVisual({
    descriptor: FR_HOUSE_12X9_2F,
    runtime: buildings.getBuildingSnapshot('house-floor-damage'),
    centerX: 0,
    centerZ: 0,
    foundationTopY: 0,
    getHeightAt: () => 0
  });
  const wallPieces = house.userData.lodTiers.map(tier => ({
    lod: tier.lod,
    piece: tier.sections.get('ground-shell').children[0]
  }));
  const baselines = wallPieces.map(({ piece }) => ({
    color: piece.material.color.getHex(),
    rotation: piece.rotation.toArray(),
    scale: piece.scale.toArray()
  }));

  buildings.applyBlastDamage('house-floor-damage', {
    sectionDamages: [{ sectionId: 'ground-floor-structure', amount: 240 }]
  });
  applyFrenchHouseVisualState(
    house,
    FR_HOUSE_12X9_2F,
    buildings.getBuildingSnapshot('house-floor-damage')
  );

  wallPieces.forEach(({ lod, piece }, index) => {
    assert.equal(piece.userData.stage, 'intact', `${lod} wall retains its own section stage`);
    assert.equal(piece.material.color.getHex(), baselines[index].color);
    assert.deepEqual(piece.rotation.toArray(), baselines[index].rotation);
    assert.deepEqual(piece.scale.toArray(), baselines[index].scale);
  });
  disposeFrenchHouseVisual(house);
});

test('restoring an intact building state rehydrates all authored visual parts after a breach', () => {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house-rollback',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const intact = buildings.captureState();
  const house = createFrenchHouseVisual({
    descriptor: FR_HOUSE_12X9_2F,
    runtime: buildings.getBuildingSnapshot('house-rollback'),
    centerX: 0,
    centerZ: 0,
    foundationTopY: 0,
    getHeightAt: () => 0
  });

  buildings.applyProjectileDamage('house-rollback', {
    sectionId: 'ground-shell', colliderPartId: 'ground-back', amount: 650, penetrationMm: 400
  });
  applyFrenchHouseVisualState(house, FR_HOUSE_12X9_2F, buildings.getBuildingSnapshot('house-rollback'));
  assert.equal(house.getObjectByName('SectionPart:ground-shell:ground-back').visible, false);

  buildings.restoreState(intact);
  applyFrenchHouseVisualState(house, FR_HOUSE_12X9_2F, buildings.getBuildingSnapshot('house-rollback'));
  for (const section of FR_HOUSE_12X9_2F.sections) {
    const group = house.getObjectByName(`BuildingSection:${section.id}`);
    assert.equal(group.visible, true, `${section.id} group restores`);
    for (const part of section.colliderParts) {
      if (section.kind === 'roof') continue;
      const piece = house.getObjectByName(`SectionPart:${section.id}:${part.id}`);
      assert.equal(piece.visible, !part.openingId, `${section.id}:${part.id} restores authored baseline`);
    }
  }
  assert.equal(house.getObjectByName('HouseGabledRoof').visible, true);
  assert.ok(house.userData.cheapShells.every(group => group.visible && group.userData.shell.visible));
});

test('owning-section collapse hides detailed frames and every cheap opening card, then rollback restores them', () => {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({
    id: 'house-opening-rollback',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const intact = buildings.captureState();
  const house = createFrenchHouseVisual({
    descriptor: FR_HOUSE_12X9_2F,
    runtime: buildings.getBuildingSnapshot('house-opening-rollback'),
    centerX: 0,
    centerZ: 0,
    foundationTopY: 0,
    getHeightAt: () => 0
  });
  const openingId = 'ground-window-left-aperture';
  const visuals = [
    house.getObjectByName(`HouseFrame:${openingId}`),
    ...['medium', 'core', 'proxy'].map(level =>
      house.getObjectByName(`HouseCheapOpening:${level}:${openingId}`)
    )
  ];
  assert.ok(visuals.every(Boolean));
  assert.ok(visuals.every(object => (
    object.userData.openingSectionId === 'ground-shell'
  )));
  assert.ok(visuals.every(object => object.visible));

  const collapse = buildings.applyBlastDamage('house-opening-rollback', {
    sectionDamages: [{ sectionId: 'ground-shell', amount: 1000 }]
  });
  assert.equal(collapse.results[0].collapsed, true);
  applyFrenchHouseVisualState(
    house,
    FR_HOUSE_12X9_2F,
    buildings.getBuildingSnapshot('house-opening-rollback')
  );
  assert.ok(visuals.every(object => object.visible === false));

  buildings.restoreState(intact);
  applyFrenchHouseVisualState(
    house,
    FR_HOUSE_12X9_2F,
    buildings.getBuildingSnapshot('house-opening-rollback')
  );
  assert.ok(visuals.every(object => object.visible === true));
  disposeFrenchHouseVisual(house);
});

test('terrain runtime sync replaces only house movement colliders and LOS obstacles', () => {
  const buildings = new BuildingSystem();
  const terrain = createTerrain(buildings);
  terrain.addColliderRecord({
    id: 'sentinel:bridge',
    type: 'bridge',
    centerX: 0,
    centerZ: 0,
    halfX: 1,
    halfZ: 1,
    blocks: ['vehicle', 'infantry']
  });
  terrain.bocageObstacles.push({
    id: 'sentinel:los',
    type: 'wall',
    minX: -1,
    maxX: 1,
    minZ: -1,
    maxZ: 1,
    minY: 0,
    maxY: 2,
    height: 2
  });
  terrain.buildStructures();
  const buildingId = 'french_village_house';
  const breachedColliderId = `${buildingId}:ground-shell:ground-back`;
  assert.ok(terrain.collisionWorld.getCollider(breachedColliderId));

  buildings.applyProjectileDamage(buildingId, {
    sectionId: 'ground-shell',
    colliderPartId: 'ground-back',
    amount: 650,
    penetrationMm: 400
  });
  const breachSync = terrain.syncBuildingRuntime(buildingId);
  assert.ok(breachSync);
  assert.equal(terrain.collisionWorld.getCollider(breachedColliderId), null);
  assert.ok(terrain.collisionWorld.getCollider('sentinel:bridge'));
  assert.ok(terrain.bocageObstacles.some(record => record.id === 'sentinel:los'));
  assert.ok(!terrain.bocageObstacles.some(record => record.id === breachedColliderId));

  buildings.applyBlastDamage(buildingId, {
    sectionDamages: [{ sectionId: 'roof', amount: 1000 }]
  });
  const collapseSync = terrain.syncBuildingRuntime(buildingId);
  assert.ok(collapseSync.collision.colliderIds.some(id => id.includes(':rubble:')));
  assert.ok(terrain.colliderRecords.some(record => (
    record.buildingId === buildingId && record.sectionId === 'rubble'
  )));
  assert.ok(terrain.bocageObstacles.some(record => (
    record.buildingId === buildingId && record.type === 'rubble'
  )));
  assert.equal(terrain.buildings[0].object.getObjectByName('HouseRubble').visible, true);
});

test('terrain projects interior presence without republishing collision records', () => {
  const buildings = new BuildingSystem();
  const terrain = createTerrain(buildings);
  terrain.buildStructures();
  const before = terrain.colliderRecords.map(record => record.id).sort();
  const faded = terrain.setBuildingInteriorPresence('french_village_house', 2);
  assert.deepEqual(faded, {
    buildingId: 'french_village_house', interiorPresence: 2, changed: true
  });
  assert.equal(terrain.buildings[0].object.userData.interiorFadeActive, true);
  assert.deepEqual(terrain.colliderRecords.map(record => record.id).sort(), before);
  const restored = terrain.setBuildingInteriorPresence('french_village_house', 0);
  assert.equal(restored.changed, true);
  assert.equal(terrain.buildings[0].object.userData.interiorFadeActive, false);
});
