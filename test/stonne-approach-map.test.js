import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  FRANCE_1940_BATTLE_SETUP,
  createFrance1940Family
} from '../src/content/france1940/index.js';
import {
  FRANCE_1940_MAPS,
  STONNE_APPROACH_1940_MAP
} from '../src/maps/france/index.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import {
  FR_FARMHOUSE_8X6_1F
} from '../src/maps/france/FranceFarmhouse8x6_1F.js';
import {
  createConfiguredBattleScenario
} from '../src/scenario/BattleSetup.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { TerrainBuilder } from './helpers/France1940TestTerrain.js';
import {
  createFrenchHouseVisualAdapter
} from '../src/world/buildings/FrenchHouse.js';

const family = createFrance1940Family();
const structureAdapters = Object.freeze({
  [FR_HOUSE_12X9_2F.id]:
    createFrenchHouseVisualAdapter(FR_HOUSE_12X9_2F),
  [FR_FARMHOUSE_8X6_1F.id]:
    createFrenchHouseVisualAdapter(FR_FARMHOUSE_8X6_1F)
});

function defaultForce(factionId) {
  return {
    mode: 'package',
    packageId:
      FRANCE_1940_BATTLE_SETUP.defaultPackageByFaction[factionId],
    counts: {}
  };
}

function createTerrain() {
  const buildingSystem = new BuildingSystem();
  buildingSystem.registerDescriptor(FR_HOUSE_12X9_2F);
  buildingSystem.registerDescriptor(FR_FARMHOUSE_8X6_1F);
  const scene = new THREE.Scene();
  const terrain = new TerrainBuilder(scene, {
    mapDescriptor: STONNE_APPROACH_1940_MAP,
    buildingSystem,
    structureAdapters
  });
  terrain.buildScenarioMap();
  return { buildingSystem, scene, terrain };
}

test('France 1940 map registry offers distinct Bridge and Stonne maps', () => {
  assert.deepEqual(
    FRANCE_1940_MAPS.map(map => [map.id, map.title]),
    [
      ['stonne-1940', 'Bridge'],
      ['stonne-approach-1940', 'Stonne']
    ]
  );
  assert.equal(new Set(FRANCE_1940_MAPS.map(map => map.id)).size, 2);
});

test('Stonne owns reference-guided rural terrain without fake river features', () => {
  const map = STONNE_APPROACH_1940_MAP;
  assert.equal(map.title, 'Stonne');
  assert.equal(map.dimensions.width, 300);
  assert.equal(map.dimensions.depth, 300);
  assert.equal(Object.hasOwn(map, 'river'), false);
  assert.equal(Object.hasOwn(map, 'bridge'), false);
  assert.match(map.provenance.dataQuality, /not georeferenced or surveyed/);
  assert.deepEqual(
    map.surfaces.layers
      .filter(layer => layer.kind === 'road')
      .map(layer => layer.id),
    ['main-road', 'east-road']
  );
  assert.ok(map.surfaces.layers.some(layer => layer.kind === 'farm-lane'));
  assert.equal(map.structures.length, 5);
  assert.equal(map.foliage.length, 152);
  assert.equal(map.foliageRendering.mode, 'instanced');
  assert.ok(Object.isFrozen(map));
  assert.ok(Object.isFrozen(map.foliage));
});

test('Stonne builds rolling ground, five buildings, and four foliage instances', () => {
  const { buildingSystem, scene, terrain } = createTerrain();
  assert.equal(scene.getObjectByName('RiverWater'), undefined);
  assert.equal(scene.getObjectByName('StoneBridge'), undefined);
  assert.equal(terrain.bridgeSurface, null);
  assert.equal(
    terrain.colliderRecords.some(record => record.type === 'river_exclusion'),
    false
  );
  assert.equal(buildingSystem.getBuildingIds().length, 5);

  const foliageInstances = [
    'MatureTreeTrunks',
    'MatureTreeCrownsPrimary',
    'MatureTreeCrownsWest',
    'MatureTreeCrownsEast'
  ].map(name => scene.getObjectByName(name));
  assert.ok(foliageInstances.every(mesh => mesh?.isInstancedMesh));
  assert.ok(foliageInstances.every(mesh => mesh.count === 152));
  const submittedTriangles = foliageInstances.reduce((sum, mesh) => {
    const triangleCount = mesh.geometry.getIndex()
      ? mesh.geometry.getIndex().count / 3
      : mesh.geometry.getAttribute('position').count / 3;
    return sum + triangleCount * mesh.count;
  }, 0);
  assert.ok(
    submittedTriangles <= 100 * 152,
    `expected no more than 100 submitted triangles per tree, received ${
      submittedTriangles / 152
    }`
  );
  assert.equal(scene.getObjectByName('MatureTree'), undefined);

  const samples = [
    terrain.getHeightAt(-120, -120),
    terrain.getHeightAt(0, 0),
    terrain.getHeightAt(120, 120)
  ];
  assert.ok(Math.max(...samples) - Math.min(...samples) > 3);
});

test('configured forces fit Stonne deployment bands and face the crossroads', () => {
  const scenario = createConfiguredBattleScenario({
    mapDescriptor: STONNE_APPROACH_1940_MAP,
    family,
    catalog: FRANCE_1940_BATTLE_SETUP,
    playerFactionId: 'french',
    enemyFactionId: 'german',
    playerForceSelection: defaultForce('french'),
    enemyForceSelection: defaultForce('german'),
    enemyAiDifficulty: 'regular'
  });
  const french = scenario.units.filter(unit => unit.faction === 'french');
  const german = scenario.units.filter(unit => unit.faction === 'german');

  assert.ok(french.every(unit => (
    unit.position[2] >= -140
    && unit.position[2] <= -100
    && Math.abs(unit.rotation) < 1e-12
  )));
  assert.ok(german.every(unit => (
    unit.position[2] >= 100
    && unit.position[2] <= 140
    && Math.abs(unit.rotation - Math.PI) < 1e-12
  )));
});
