import { defineMapDescriptor } from '../MapDescriptor.js';

export const STONNE_1940_MAP = defineMapDescriptor({
  id: 'stonne-1940',
  title: 'Stonne, Ardennes',
  dimensions: {
    width: 240,
    depth: 240,
    segments: 60
  },
  elevation: {
    baseHeight: 0,
    waves: [
      { axis: 'x', function: 'sin', amplitude: 3.5, frequency: 0.025, phase: 0 },
      { axis: 'z', function: 'cos', amplitude: 2.8, frequency: 0.02, phase: 0 }
    ]
  },
  surfaces: {
    textureResolution: [1024, 1024],
    baseColor: '#4c6b2f',
    terrainMaterial: {
      color: 0x667b4a,
      roughness: 0.94,
      metalness: 0
    },
    layers: [
      {
        id: 'field-northwest',
        kind: 'field',
        color: '#b09943',
        rect: [60, 60, 400, 400],
        visualOnly: true
      },
      {
        id: 'field-northeast',
        kind: 'field',
        color: '#567a3a',
        rect: [560, 60, 400, 400],
        visualOnly: true
      },
      {
        id: 'field-southwest',
        kind: 'field',
        color: '#9e893c',
        rect: [60, 560, 400, 400],
        visualOnly: true
      },
      {
        id: 'road-north-south',
        kind: 'road',
        color: '#92704a',
        rect: [480, 0, 64, 1024],
        visualOnly: true
      }
    ],
    waterMaterial: {
      color: 0x2f6f91,
      opacity: 0.82,
      roughness: 0.22,
      metalness: 0.05
    },
    bridgeRoadMaterial: {
      color: 0x6f6758,
      roughness: 0.98,
      metalness: 0
    }
  },
  river: {
    id: 'river-main',
    centerZ: 10,
    waterWidth: 12,
    cutWidth: 24,
    waterLevel: -0.9,
    bedLevel: -1.55
  },
  bridge: {
    id: 'stone_bridge',
    profileId: 'stone-masonry-road',
    centerX: 0,
    centerZ: 10,
    span: 28
  },
  wallRuns: [
    {
      id: 'north_west',
      profileId: 'stone-wall',
      start: [-75, 50],
      end: [-5, 50]
    },
    {
      id: 'north_east',
      profileId: 'stone-wall',
      start: [5, 50],
      end: [75, 50]
    },
    {
      id: 'south_west',
      profileId: 'stone-wall',
      start: [-75, -40],
      end: [-5, -40]
    },
    {
      id: 'south_east',
      profileId: 'stone-wall',
      start: [5, -40],
      end: [75, -40]
    }
  ],
  structures: [
    {
      id: 'french_village_house',
      descriptorId: 'fr_house_12x9_2f',
      visualAdapterId: 'fr_house_12x9_2f',
      position: [45, 60],
      rotationY: 0,
      foundationClearance: 0.12
    }
  ],
  foliage: [
    {
      id: 'tree-northwest',
      profileId: 'mature-tree',
      position: [-60, 40],
      visualOnly: true
    },
    {
      id: 'tree-southeast',
      profileId: 'mature-tree',
      position: [60, -40],
      visualOnly: true
    },
    {
      id: 'tree-southwest-inner',
      profileId: 'mature-tree',
      position: [-30, -60],
      visualOnly: true
    },
    {
      id: 'tree-northeast',
      profileId: 'mature-tree',
      position: [40, 70],
      visualOnly: true
    },
    {
      id: 'tree-southwest-outer',
      profileId: 'mature-tree',
      position: [-70, -70],
      visualOnly: true
    }
  ],
  deploymentZones: {
    french: {
      minX: -80,
      maxX: 80,
      minZ: 60,
      maxZ: 100,
      color: 0x3b82f6
    },
    german: {
      minX: -80,
      maxX: 80,
      minZ: -100,
      maxZ: -60,
      color: 0xef4444
    }
  }
});
