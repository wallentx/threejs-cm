import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { TerrainBuilder } from '../src/world/TerrainBuilder.js';
import {
  applyFrenchHouseVisualState,
  createFrenchHouseVisual,
  FRENCH_HOUSE_LOD_DISTANCES
} from '../src/world/buildings/FrenchHouse.js';

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
  for (const section of FR_HOUSE_12X9_2F.sections) {
    const group = house.getObjectByName(`BuildingSection:${section.id}`);
    assert.ok(group, `missing semantic visual group for ${section.id}`);
    assert.equal(group.userData.sectionId, section.id);
  }
  const lod = house.getObjectByName('FrenchHouseLOD');
  assert.equal(lod.levels.length, 4);
  assert.deepEqual(lod.levels.map(level => level.distance), Object.values(FRENCH_HOUSE_LOD_DISTANCES));
});

test('terrain publishes segmented house wall colliders and leaves door/window apertures open', () => {
  const terrain = new TerrainBuilder(new THREE.Scene());
  terrain.buildFrenchVillage();
  const records = terrain.colliderRecords.filter(record => record.buildingId === 'french_village_house');
  assert.ok(records.length >= 7, 'descriptor wall pieces become individual colliders');
  assert.ok(records.every(record => record.sectionId === 'ground-shell' || record.sectionId === 'upper-shell'));
  assert.equal(terrain.collisionWorld.getCollider('building:french_village_house'), null);
  assert.ok(!records.some(record => record.halfX === 6 && record.halfZ === 4.5), 'no solid footprint blocker');
  assert.ok(!records.some(record => record.id.endsWith(':ground-door')), 'open front door has no wall collider');
  assert.ok(!records.some(record => record.id.endsWith(':ground-left-window')), 'open window has no wall collider');

  const throughDoor = terrain.collisionWorld.resolveCircleMotion(
    { x: 45, z: 69 }, { x: 0, z: -8 }, 0.25, { moverType: 'infantry' }
  );
  assert.equal(throughDoor.blocked, false, 'infantry can cross the descriptor door aperture');
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
  const rubble = house.getObjectByName('HouseRubble');
  assert.equal(rubble.visible, true);
  assert.ok(rubble.children.length >= FR_HOUSE_12X9_2F.rubble.colliderParts.length * 6);
});

test('terrain runtime sync replaces only house movement colliders and LOS obstacles', () => {
  const buildings = new BuildingSystem();
  const terrain = new TerrainBuilder(new THREE.Scene(), { buildingSystem: buildings });
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
  terrain.buildFrenchVillage();
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
