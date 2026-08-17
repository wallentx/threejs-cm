import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateDistanceCutoffHz,
  calculateDistanceGain,
  calculatePropagationDelaySeconds,
  calculateVoicePriority,
  chooseVariation,
  createAggregationKey,
  resolveEventAcoustics,
  resolveOcclusionAcoustics
} from '../src/engine/audio/BattlefieldAcoustics.js';
import {
  createMapAcousticEnvironmentResolver
} from '../src/engine/audio/MapAcousticEnvironment.js';

test('distance model attenuates and removes high frequencies without muting nearby detail', () => {
  const rifle = resolveEventAcoustics({ category: 'smallArms' });
  const cannon = resolveEventAcoustics({ category: 'cannon' });
  assert.equal(calculateDistanceGain(10, rifle), 1);
  assert.ok(calculateDistanceGain(500, rifle) < calculateDistanceGain(50, rifle));
  assert.ok(calculateDistanceCutoffHz(2000, rifle) < calculateDistanceCutoffHz(50, rifle));
  assert.ok(calculateDistanceGain(3000, cannon) > 0);
  assert.equal(calculateDistanceGain(3000, rifle), 0);
});

test('propagation timing and priority remain renderer-neutral and configurable', () => {
  assert.ok(Math.abs(calculatePropagationDelaySeconds(1000) - 1000 / 343) < 1e-12);
  assert.equal(calculatePropagationDelaySeconds(686, 343), 2);
  assert.throws(() => calculatePropagationDelaySeconds(10, 0), /positive finite/);
  const nearCannon = calculateVoicePriority({ basePriority: 96, perceivedGain: 0.8 });
  const distantRifle = calculateVoicePriority({ basePriority: 58, perceivedGain: 0.02 });
  assert.ok(nearCannon > distantRifle);
  assert.ok(calculateVoicePriority({
    basePriority: 58,
    perceivedGain: 0.5,
    alreadyPlaying: true
  }) > calculateVoicePriority({ basePriority: 58, perceivedGain: 0.5 }));
});

test('variation uses injected presentation randomness and aggregation is spatially stable', () => {
  const event = {
    variation: {
      gain: [0.9, 1.1],
      playbackRate: [0.97, 1.03],
      filterScale: [0.95, 1.05]
    }
  };
  const values = [0, 0.5, 1];
  const variation = chooseVariation(event, () => values.shift());
  assert.deepEqual(variation, { gain: 0.9, playbackRate: 1, filterScale: 1.05 });
  assert.equal(createAggregationKey([179, 0, -1], 180), '0:-1');
  assert.equal(createAggregationKey([180, 0, -1], 180), '1:-1');
});

test('occlusion distinguishes solid/terrain loss from a clear ray', () => {
  assert.deepEqual(resolveOcclusionAcoustics({ clear: true }), {
    occluded: false,
    gain: 1,
    cutoffHz: 20000
  });
  const building = resolveOcclusionAcoustics({ clear: false, coverType: 'Building' });
  const terrain = resolveOcclusionAcoustics({ clear: false, coverType: 'Terrain ridge' });
  assert.equal(building.occluded, true);
  assert.ok(building.cutoffHz < 1000);
  assert.ok(terrain.gain < building.gain);
});

test('map acoustic resolver derives interiors, woodland, streets, village, and field from data', () => {
  const descriptor = {
    id: 'house',
    title: 'House',
    bounds: { min: [-5, 0, -4], max: [5, 7, 4] }
  };
  const mapDescriptor = {
    dimensions: { width: 100, depth: 100 },
    surfaces: {
      textureResolution: [100, 100],
      layers: [{
        kind: 'woodland-floor',
        polygon: [[0, 0], [45, 0], [45, 45], [0, 45]]
      }]
    },
    structures: [
      { id: 'a', descriptorId: 'house', position: [0, 0], rotationY: 0 },
      { id: 'b', descriptorId: 'house', position: [10, 0], attachedRowId: 'row' },
      { id: 'c', descriptorId: 'house', position: [14, 0], attachedRowId: 'row' },
      { id: 'd', descriptorId: 'house', position: [18, 0], attachedRowId: 'row' }
    ]
  };
  const resolve = createMapAcousticEnvironmentResolver({
    mapDescriptor,
    buildingDescriptors: [descriptor]
  });
  assert.equal(resolve([0, 1, 0]).id, 'smallRoom');
  assert.equal(resolve([-30, 1, 30]).id, 'forest');
  assert.equal(resolve([25, 1, 0]).id, 'urbanStreet');
  assert.equal(resolve([45, 1, -45]).id, 'openField');

  const village = createMapAcousticEnvironmentResolver({
    mapDescriptor: {
      ...mapDescriptor,
      structures: mapDescriptor.structures.slice(0, 2),
      surfaces: { ...mapDescriptor.surfaces, layers: [] }
    },
    buildingDescriptors: [descriptor]
  });
  assert.equal(village([25, 1, 0]).id, 'village');
});
