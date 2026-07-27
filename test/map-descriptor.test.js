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

function useLegacyRect(map, rect = [60, 60, 400, 400]) {
  delete map.surfaces.layers[0].polygon;
  map.surfaces.layers[0].rect = rect;
  return map;
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
  assert.deepEqual(STONNE_1940_MAP.surfaces.riverBankMaterial, {
    color: 0x716b42,
    roughness: 0.98,
    metalness: 0,
    presentationApproximation:
      'renderer-only procedural riverbank material; not historical soil evidence'
  });
  assert.deepEqual(
    STONNE_1940_MAP.wallRuns.map(run => run.id),
    ['north_west', 'north_east', 'south_west', 'south_east']
  );
  assert.equal(STONNE_1940_MAP.structures.length, 1);
  assert.deepEqual(STONNE_1940_MAP.structures[0].position, [45, 60]);
  assert.equal(STONNE_1940_MAP.foliage.length, 5);
  assert.ok(STONNE_1940_MAP.surfaces.layers.every(layer => layer.visualOnly));
  assert.deepEqual(
    STONNE_1940_MAP.surfaces.layers.map(layer => layer.id),
    [
      'field-northwest',
      'field-northeast',
      'field-southwest',
      'road-north-south'
    ]
  );
  assert.ok(
    STONNE_1940_MAP.surfaces.layers.every(
      layer => Object.hasOwn(layer, 'polygon') && !Object.hasOwn(layer, 'rect')
    )
  );
  for (const layer of STONNE_1940_MAP.surfaces.layers) {
    assert.ok(layer.polygon.length > 4, `${layer.id} must have an irregular outline`);
    assert.ok(
      new Set(layer.polygon.map(([u]) => u)).size > 2,
      `${layer.id} must not disguise a rectangle`
    );
    assert.ok(
      new Set(layer.polygon.map(([, v]) => v)).size > 2,
      `${layer.id} must not disguise a rectangle`
    );
  }
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
    [map => { useLegacyRect(map, [60, 60, 2000, 400]); }, /outside texture bounds/],
    [map => { delete map.surfaces.riverBankMaterial; }, /riverBankMaterial/],
    [map => { map.surfaces.riverBankMaterial.color = {}; }, /color string or 24-bit integer/],
    [map => { map.surfaces.riverBankMaterial.roughness = 2; }, /roughness must be between/],
    [map => { map.surfaces.riverBankMaterial.presentationApproximation = ''; }, /presentationApproximation requires/],
    [map => { map.surfaces.riverBankMaterial.presentationApproximation = '   '; }, /presentationApproximation requires/],
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

test('surface layers accept one legacy rectangle or ordered polygon and reject invalid polygons', () => {
  const legacyMap = useLegacyRect(mutableMap());
  const definedLegacyMap = defineMapDescriptor(legacyMap);
  assert.deepEqual(definedLegacyMap.surfaces.layers[0].rect, [60, 60, 400, 400]);
  assert.equal(Object.hasOwn(definedLegacyMap.surfaces.layers[0], 'polygon'), false);

  const reversedMap = mutableMap();
  const reversed = [...reversedMap.surfaces.layers[0].polygon].reverse();
  reversedMap.surfaces.layers[0].polygon = reversed;
  const definedReversedMap = defineMapDescriptor(reversedMap);
  assert.deepEqual(definedReversedMap.surfaces.layers[0].polygon, reversed);
  assertDeepFrozen(definedReversedMap.surfaces.layers[0].polygon);

  const cases = [
    [
      map => { map.surfaces.layers[0].rect = [60, 60, 400, 400]; },
      /exactly one shape/
    ],
    [
      map => { delete map.surfaces.layers[0].polygon; },
      /exactly one shape/
    ],
    [
      map => { map.surfaces.layers[0].polygon = [[0, 0], [10, 0]]; },
      /at least three points/
    ],
    [
      map => { map.surfaces.layers[0].polygon = [[0, 0], [10], [0, 10]]; },
      /must contain 2 values/
    ],
    [
      map => { map.surfaces.layers[0].polygon[0][0] = Infinity; },
      /must be finite/
    ],
    [
      map => { map.surfaces.layers[0].polygon[0][0] = -1; },
      /outside texture bounds/
    ],
    [
      map => {
        map.surfaces.layers[0].polygon[0][1] =
          map.surfaces.textureResolution[1] + 1;
      },
      /outside texture bounds/
    ],
    [
      map => {
        map.surfaces.layers[0].polygon[1] =
          [...map.surfaces.layers[0].polygon[0]];
      },
      /distinct consecutive vertices/
    ],
    [
      map => {
        map.surfaces.layers[0].polygon.push(
          [...map.surfaces.layers[0].polygon[0]]
        );
      },
      /distinct consecutive vertices/
    ],
    [
      map => {
        map.surfaces.layers[0].polygon = [[100, 100], [200, 200], [300, 300]];
      },
      /non-zero area/
    ],
    [
      map => {
        map.surfaces.layers[0].polygon = [
          [100, 100],
          [300, 300],
          [100, 300],
          [300, 100]
        ];
      },
      /must not self-intersect/
    ]
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
