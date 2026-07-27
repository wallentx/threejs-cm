import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  defineMapDescriptor,
  validateMapDescriptor
} from '../src/maps/MapDescriptor.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { STONNE_1940_SCENARIO } from '../src/scenarios/france1940/stonne1940.js';

function assertDeepFrozen(value, path = 'map', seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, `${path}.${key}`, seen);
  }
}

function mutableMap() {
  return JSON.parse(JSON.stringify(STONNE_1940_MAP));
}

test('Stonne map owns immutable terrain, surface, feature, structure, and deployment records', () => {
  assert.equal(STONNE_1940_MAP.id, 'stonne-1940');
  assert.deepEqual(STONNE_1940_MAP.dimensions, {
    width: 240,
    depth: 240,
    segments: 60
  });
  assert.equal(STONNE_1940_MAP.elevation.waves.length, 2);
  assert.equal(STONNE_1940_MAP.river.centerZ, 10);
  assert.equal(STONNE_1940_MAP.river.waterWidth, 12);
  assert.equal(STONNE_1940_MAP.river.cutWidth, 24);
  assert.equal(STONNE_1940_MAP.bridge.span, 28);
  assert.deepEqual(
    STONNE_1940_MAP.wallRuns.map(run => run.id),
    ['north_west', 'north_east', 'south_west', 'south_east']
  );
  assert.equal(STONNE_1940_MAP.structures.length, 1);
  assert.deepEqual(STONNE_1940_MAP.structures[0].position, [45, 60]);
  assert.equal(STONNE_1940_MAP.foliage.length, 5);
  assert.ok(STONNE_1940_MAP.surfaces.layers.every(layer => layer.visualOnly));
  assert.ok(STONNE_1940_MAP.foliage.every(entry => entry.visualOnly));
  assert.deepEqual(Object.keys(STONNE_1940_MAP.deploymentZones), ['french', 'german']);
  assertDeepFrozen(STONNE_1940_MAP);
});

test('scenario references the selected map while the map solely owns deployment zones', () => {
  assert.equal(STONNE_1940_SCENARIO.mapId, STONNE_1940_MAP.id);
  assert.equal(Object.hasOwn(STONNE_1940_SCENARIO, 'deploymentZones'), false);
  assert.ok(STONNE_1940_MAP.deploymentZones.french);
  assert.ok(STONNE_1940_MAP.deploymentZones.german);
});

test('map definition clones plain input before deep freezing it', () => {
  const source = mutableMap();
  source.id = 'cloned-map';
  const defined = defineMapDescriptor(source);
  source.wallRuns[0].start[0] = -1;
  source.deploymentZones.french.minX = -1;

  assert.equal(defined.wallRuns[0].start[0], -75);
  assert.equal(defined.deploymentZones.french.minX, -80);
  assertDeepFrozen(defined);
});

test('map validation rejects malformed extents, duplicate IDs, bad features, and invalid zones', () => {
  const cases = [
    [map => { map.dimensions.width = 0; }, /dimensions\.width/],
    [map => { map.surfaces.textureResolution[0] = 1.5; }, /positive integer/],
    [map => { map.surfaces.layers[0].visualOnly = false; }, /explicitly declare visualOnly/],
    [map => { map.surfaces.layers[0].rect[2] = 2000; }, /outside texture bounds/],
    [map => { map.surfaces.waterMaterial.opacity = 2; }, /opacity must be between/],
    [map => { map.elevation.waves[0].axis = 'y'; }, /axis must be x or z/],
    [map => { map.bridge.id = map.river.id; }, /duplicate feature id/],
    [map => { map.bridge.centerZ += 1; }, /must align/],
    [map => { map.bridge.span = map.river.cutWidth; }, /span must exceed/],
    [map => { map.wallRuns[0].end = [...map.wallRuns[0].start]; }, /distinct endpoints/],
    [map => { map.structures[0].descriptorId = ''; }, /descriptorId requires/],
    [map => { map.foliage[0].visualOnly = false; }, /explicitly declare visualOnly/],
    [map => { map.deploymentZones.french.maxZ = 200; }, /outside map bounds/]
  ];

  for (const [mutate, pattern] of cases) {
    const map = mutableMap();
    mutate(map);
    assert.throws(() => validateMapDescriptor(map), pattern);
  }
});

test('map data and generic terrain builder keep concrete runtime dependencies one-way', async () => {
  const [schemaSource, stonneSource, terrainSource] = await Promise.all([
    readFile(new URL('../src/maps/MapDescriptor.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/maps/france/stonne.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/TerrainBuilder.js', import.meta.url), 'utf8')
  ]);

  for (const source of [schemaSource, stonneSource]) {
    assert.doesNotMatch(source, /\b(?:THREE|document|window|HTMLElement)\b/);
    assert.doesNotMatch(source, /^import\s.+?from\s+['"].*\/(?:game|world|ui|main)\//m);
  }
  assert.doesNotMatch(terrainSource, /stonne|FR_HOUSE_12X9_2F|FrenchHouse/);
  assert.doesNotMatch(terrainSource, /createWallRun\(-75|treePositions|hx = 45|hz = 60/);
});
