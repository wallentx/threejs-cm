import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  drawTerrainSurfaceLayers,
  FRANCE_1940_TERRAIN_SURFACE_IMPLEMENTATION
} from '../src/content/france1940/render/France1940TerrainSurfaceProvider.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';

function createRecordingContext() {
  const operations = [];
  let fillStyle = null;
  return {
    operations,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value) {
      fillStyle = value;
      operations.push(['fillStyle', value]);
    },
    fillRect(...values) {
      operations.push(['fillRect', ...values]);
    },
    beginPath() {
      operations.push(['beginPath']);
    },
    moveTo(...point) {
      operations.push(['moveTo', ...point]);
    },
    lineTo(...point) {
      operations.push(['lineTo', ...point]);
    },
    closePath() {
      operations.push(['closePath']);
    },
    fill() {
      operations.push(['fill']);
    }
  };
}

function createFakeDocument() {
  const canvases = [];
  return {
    canvases,
    createElement(tagName) {
      assert.equal(tagName, 'canvas');
      const context = createRecordingContext();
      const canvas = {
        width: 0,
        height: 0,
        getContext(kind) {
          assert.equal(kind, '2d');
          return context;
        }
      };
      canvases.push({ canvas, context });
      return canvas;
    }
  };
}

test('surface drawing preserves descriptor order and emits deterministic Canvas paths', () => {
  const context = createRecordingContext();
  drawTerrainSurfaceLayers(context, [
    {
      id: 'legacy-rect',
      kind: 'field',
      color: '#111111',
      rect: [1, 2, 3, 4],
      visualOnly: true
    },
    {
      id: 'ordered-polygon',
      kind: 'road',
      color: '#222222',
      polygon: [[8, 1], [9, 5], [6, 7], [3, 4]],
      visualOnly: true
    },
    {
      id: 'second-legacy-rect',
      kind: 'field',
      color: '#333333',
      rect: [10, 20, 30, 40],
      visualOnly: true
    }
  ]);

  assert.deepEqual(context.operations, [
    ['fillStyle', '#111111'],
    ['fillRect', 1, 2, 3, 4],
    ['fillStyle', '#222222'],
    ['beginPath'],
    ['moveTo', 8, 1],
    ['lineTo', 9, 5],
    ['lineTo', 6, 7],
    ['lineTo', 3, 4],
    ['closePath'],
    ['fill'],
    ['fillStyle', '#333333'],
    ['fillRect', 10, 20, 30, 40]
  ]);
});

test('default Stonne surface creation draws every polygon and disposes all resources once', () => {
  const previousDocument = globalThis.document;
  const hadDocument = Object.hasOwn(globalThis, 'document');
  const fakeDocument = createFakeDocument();
  globalThis.document = fakeDocument;

  try {
    const surfaceSet = FRANCE_1940_TERRAIN_SURFACE_IMPLEMENTATION.create(
      STONNE_1940_MAP.surfaces
    );
    const groundCanvas = fakeDocument.canvases.find(
      ({ canvas }) => (
        canvas.width === STONNE_1940_MAP.surfaces.textureResolution[0]
        && canvas.height === STONNE_1940_MAP.surfaces.textureResolution[1]
      )
    );
    assert.ok(groundCanvas, 'ground texture must use the map texture resolution');

    const operations = groundCanvas.context.operations;
    assert.deepEqual(operations.slice(0, 2), [
      ['fillStyle', STONNE_1940_MAP.surfaces.baseColor],
      ['fillRect', 0, 0, ...STONNE_1940_MAP.surfaces.textureResolution]
    ]);
    assert.deepEqual(
      STONNE_1940_MAP.surfaces.layers.map(layer => [layer.id, layer.color]),
      [
        ['field-northwest', '#b09943'],
        ['field-northwest-detail', '#c0a951'],
        ['field-northeast', '#567a3a'],
        ['field-southwest', '#9e893c'],
        ['field-southwest-detail', '#af9848'],
        ['field-southeast', '#6f8242'],
        ['road-north-south-shoulder', '#806a4d'],
        ['road-north-south', '#92704a']
      ]
    );
    assert.deepEqual(
      operations.slice(2),
      STONNE_1940_MAP.surfaces.layers.flatMap(layer => [
        ['fillStyle', layer.color],
        ['beginPath'],
        ['moveTo', ...layer.polygon[0]],
        ...layer.polygon.slice(1).map(point => ['lineTo', ...point]),
        ['closePath'],
        ['fill']
      ])
    );
    assert.deepEqual(
      operations
        .filter(([operation]) => operation === 'moveTo')
        .map(([, ...point]) => point),
      STONNE_1940_MAP.surfaces.layers.map(layer => layer.polygon[0])
    );
    assert.equal(
      operations.filter(([operation]) => operation === 'beginPath').length,
      STONNE_1940_MAP.surfaces.layers.length
    );
    assert.equal(
      operations.filter(([operation]) => operation === 'closePath').length,
      STONNE_1940_MAP.surfaces.layers.length
    );
    assert.equal(
      operations.filter(([operation]) => operation === 'fill').length,
      STONNE_1940_MAP.surfaces.layers.length
    );

    const resources = [
      ...Object.values(surfaceSet.materials),
      surfaceSet.materials.ground.map,
      surfaceSet.materials.masonry.map,
      surfaceSet.materials.masonry.bumpMap,
      surfaceSet.materials.fenceCard.map
    ];
    assert.ok(resources.every(Boolean));
    assert.equal(surfaceSet.materials.fenceCard.transparent, false);
    assert.equal(surfaceSet.materials.fenceCard.depthWrite, true);
    assert.equal(surfaceSet.materials.fenceCard.alphaTest, 0.5);
    assert.equal(surfaceSet.materials.fenceCard.side, THREE.FrontSide);
    assert.equal(
      surfaceSet.materials.fenceCard.map.name,
      'WoodPicketFenceCutout'
    );
    const disposalCounts = new Map(resources.map(resource => [resource, 0]));
    for (const resource of resources) {
      resource.addEventListener('dispose', () => {
        disposalCounts.set(resource, disposalCounts.get(resource) + 1);
      });
    }

    assert.equal(surfaceSet.dispose(), true);
    assert.equal(surfaceSet.dispose(), false);
    assert.ok(
      [...disposalCounts.values()].every(count => count === 1),
      'every owned texture and material must be disposed exactly once'
    );
  } finally {
    if (hadDocument) globalThis.document = previousDocument;
    else delete globalThis.document;
  }
});
