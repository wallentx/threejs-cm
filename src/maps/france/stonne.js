import { defineMapDescriptor } from '../MapDescriptor.js';

export const STONNE_1940_MAP = defineMapDescriptor({
  id: 'stonne-1940',
  title: 'Bridge',
  description:
    'River crossing with bridge approaches, village walls, farms, and mixed elevation.',
  previewStyle: 'bridge',
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
    riverBankMaterial: {
      color: 0x716b42,
      roughness: 0.98,
      metalness: 0,
      presentationApproximation:
        'renderer-only procedural riverbank material; not historical soil evidence'
    },
    layers: [
      {
        id: 'field-northwest',
        kind: 'field',
        color: '#b09943',
        polygon: [
          [60, 88],
          [185, 60],
          [328, 72],
          [460, 120],
          [444, 268],
          [458, 430],
          [332, 460],
          [180, 448],
          [78, 400],
          [60, 250]
        ],
        visualOnly: true
      },
      {
        id: 'field-northwest-detail',
        kind: 'field-detail',
        color: '#c0a951',
        polygon: [
          [120, 140],
          [230, 105],
          [350, 130],
          [395, 210],
          [365, 310],
          [280, 340],
          [170, 315],
          [105, 240]
        ],
        visualOnly: true
      },
      {
        id: 'field-northeast',
        kind: 'field',
        color: '#567a3a',
        polygon: [
          [582, 60],
          [735, 70],
          [870, 62],
          [958, 110],
          [944, 250],
          [960, 390],
          [900, 460],
          [745, 445],
          [600, 460],
          [560, 350],
          [575, 190]
        ],
        visualOnly: true
      },
      {
        id: 'field-southwest',
        kind: 'field',
        color: '#9e893c',
        polygon: [
          [72, 580],
          [210, 560],
          [345, 575],
          [452, 620],
          [460, 760],
          [430, 930],
          [310, 960],
          [160, 948],
          [60, 890],
          [76, 730]
        ],
        visualOnly: true
      },
      {
        id: 'field-southwest-detail',
        kind: 'field-detail',
        color: '#af9848',
        polygon: [
          [130, 650],
          [235, 610],
          [350, 635],
          [400, 710],
          [375, 835],
          [300, 900],
          [180, 880],
          [105, 805]
        ],
        visualOnly: true
      },
      {
        id: 'field-southeast',
        kind: 'field',
        color: '#6f8242',
        polygon: [
          [585, 575],
          [720, 558],
          [855, 575],
          [950, 625],
          [960, 760],
          [938, 900],
          [850, 960],
          [705, 948],
          [585, 925],
          [560, 805],
          [570, 675]
        ],
        visualOnly: true
      },
      {
        id: 'road-north-south-shoulder',
        kind: 'road-shoulder',
        color: '#806a4d',
        polygon: [
          [458, 0],
          [563, 0],
          [568, 150],
          [557, 310],
          [563, 475],
          [575, 640],
          [566, 820],
          [561, 1024],
          [458, 1024],
          [462, 820],
          [455, 650],
          [459, 480],
          [449, 310],
          [462, 150]
        ],
        visualOnly: true
      },
      {
        id: 'road-north-south',
        kind: 'road',
        color: '#92704a',
        polygon: [
          [477, 0],
          [544, 0],
          [548, 150],
          [537, 310],
          [541, 475],
          [554, 640],
          [547, 820],
          [542, 1024],
          [478, 1024],
          [482, 820],
          [475, 650],
          [479, 480],
          [470, 310],
          [481, 150]
        ],
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
    span: 28,
    approachLength: 4,
    approachDataQuality:
      'scenario-authored renderer and movement approximation; not surveyed bridge approach evidence'
  },
  wallProfiles: {
    'stone-wall': {
      id: 'stone-wall',
      presentationKind: 'solid-prism',
      materialRole: 'masonry',
      collisionType: 'stonewall',
      height: 1.2,
      thickness: 0.65,
      maximumSegmentLength: 4,
      blocks: ['vehicle', 'infantry'],
      occludesSight: true,
      dataQuality:
        'scenario-authored masonry boundary approximation; dimensions are gameplay values'
    },
    'wood-picket-fence': {
      id: 'wood-picket-fence',
      presentationKind: 'alpha-tested-card',
      materialRole: 'fenceCard',
      collisionType: 'fence',
      height: 1.1,
      thickness: 0.18,
      maximumSegmentLength: 2,
      textureRepeatMeters: 2,
      groundOffset: 0.015,
      destruction: {
        maxHealth: 100,
        minimumMovingSpeedMps: 0.4,
        heavyVehicleMassTonnes: 8,
        highImpactSpeedMps: 3.3,
        momentumThresholdTonneMps: 12,
        blastDamageScale: 1.2,
        dataQuality:
          'gameplay approximation for dry rural wood fencing; vehicle thresholds await sourced fence trials'
      },
      blocks: ['vehicle', 'infantry'],
      occludesSight: false,
      dataQuality:
        'scenario-authored rural wood fence and collision approximation; not surveyed Stonne evidence'
    }
  },
  wallRuns: [
    {
      id: 'village_house_rear',
      profileId: 'stone-wall',
      enclosureId: 'village-house-lot',
      boundarySide: 'rear',
      start: [32, 48],
      end: [58, 48]
    },
    {
      id: 'village_house_west',
      profileId: 'stone-wall',
      enclosureId: 'village-house-lot',
      boundarySide: 'west',
      start: [32, 48],
      end: [32, 72]
    },
    {
      id: 'village_house_east',
      profileId: 'stone-wall',
      enclosureId: 'village-house-lot',
      boundarySide: 'east',
      start: [58, 48],
      end: [58, 72]
    },
    {
      id: 'village_house_front_west',
      profileId: 'stone-wall',
      enclosureId: 'village-house-lot',
      boundarySide: 'front',
      adjacentGateId: 'village-house-front-gate',
      start: [32, 72],
      end: [42, 72]
    },
    {
      id: 'village_house_front_east',
      profileId: 'stone-wall',
      enclosureId: 'village-house-lot',
      boundarySide: 'front',
      adjacentGateId: 'village-house-front-gate',
      start: [48, 72],
      end: [58, 72]
    },
    {
      id: 'farmhouse_south',
      profileId: 'wood-picket-fence',
      enclosureId: 'farmhouse-lot',
      boundarySide: 'south',
      start: [-58, 22],
      end: [-32, 22]
    },
    {
      id: 'farmhouse_north',
      profileId: 'wood-picket-fence',
      enclosureId: 'farmhouse-lot',
      boundarySide: 'north',
      start: [-58, 46],
      end: [-32, 46]
    },
    {
      id: 'farmhouse_west',
      profileId: 'wood-picket-fence',
      enclosureId: 'farmhouse-lot',
      boundarySide: 'west',
      start: [-58, 22],
      end: [-58, 46]
    },
    {
      id: 'farmhouse_east_south',
      profileId: 'wood-picket-fence',
      enclosureId: 'farmhouse-lot',
      boundarySide: 'east',
      adjacentGateId: 'farmhouse-east-gate',
      start: [-32, 22],
      end: [-32, 31]
    },
    {
      id: 'farmhouse_east_north',
      profileId: 'wood-picket-fence',
      enclosureId: 'farmhouse-lot',
      boundarySide: 'east',
      adjacentGateId: 'farmhouse-east-gate',
      start: [-32, 37],
      end: [-32, 46]
    }
  ],
  wallEnclosures: [
    {
      id: 'village-house-lot',
      structureId: 'french_village_house',
      kind: 'domestic-lot',
      dataQuality:
        'scenario-authored gameplay approximation; not a surveyed historical Stonne boundary',
      gateOpenings: [
        {
          id: 'village-house-front-gate',
          start: [42, 72],
          end: [48, 72]
        }
      ]
    },
    {
      id: 'farmhouse-lot',
      structureId: 'french_farmhouse_outbuilding',
      kind: 'farmstead-yard',
      dataQuality:
        'scenario-authored gameplay approximation; not a surveyed historical Stonne boundary',
      gateOpenings: [
        {
          id: 'farmhouse-east-gate',
          start: [-32, 31],
          end: [-32, 37]
        }
      ]
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
    },
    {
      id: 'french_farmhouse_outbuilding',
      descriptorId: 'fr_farmhouse_8x6_1f',
      visualAdapterId: 'fr_farmhouse_8x6_1f',
      position: [-45, 34],
      rotationY: Math.PI / 2,
      foundationClearance: 0.12,
      destructionThresholds: {
        approximation: 'gameplay approximation; not historical survey evidence',
        sectionCollapse: [
          { sectionId: 'ground-shell', atOrBelowHealthFraction: 0.12 },
          { sectionId: 'roof', atOrBelowHealthFraction: 0.18 }
        ]
      }
    }
  ],
  foliage: [
    {
      id: 'tree-northwest',
      profileId: 'mature-tree',
      position: [-52, 40],
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
