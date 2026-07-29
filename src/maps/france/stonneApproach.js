import { defineMapDescriptor } from '../MapDescriptor.js';

const REFERENCE_QUALITY =
  'scenario-authored approximation composed from the user-supplied Stonne aerial reference; not georeferenced or surveyed historical terrain';
const FOLIAGE_QUALITY =
  'renderer-only deterministic instancing of authored tree centers; no collision, concealment, or forestry survey authority';

function tree(id, x, z) {
  return {
    id,
    profileId: 'mature-tree',
    position: [x, z],
    visualOnly: true
  };
}

function treeGrid(
  prefix,
  {
    origin,
    columns,
    rows,
    spacing,
    ordered = false
  }
) {
  const entries = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const jitterX = ordered
        ? 0
        : (((row * 3 + column * 5) % 5) - 2) * 0.65;
      const jitterZ = ordered
        ? 0
        : (((row * 7 + column * 2) % 5) - 2) * 0.55;
      entries.push(tree(
        `${prefix}-${row + 1}-${column + 1}`,
        origin[0] + column * spacing[0] + jitterX,
        origin[1] + row * spacing[1] + jitterZ
      ));
    }
  }
  return entries;
}

function treeLine(prefix, start, end, count) {
  return Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 0 : index / (count - 1);
    const offset = (index % 3 - 1) * 0.7;
    return tree(
      `${prefix}-${index + 1}`,
      start[0] + (end[0] - start[0]) * progress + offset,
      start[1] + (end[1] - start[1]) * progress - offset * 0.4
    );
  });
}

const FOLIAGE = [
  ...treeGrid('northwest-wood', {
    origin: [-139, 76],
    columns: 7,
    rows: 5,
    spacing: [9, 9]
  }),
  ...treeGrid('southeast-wood', {
    origin: [78, -116],
    columns: 7,
    rows: 5,
    spacing: [10, 9]
  }),
  ...treeGrid('northeast-wood', {
    origin: [92, 88],
    columns: 6,
    rows: 3,
    spacing: [9, 10]
  }),
  ...treeGrid('west-orchard', {
    origin: [-106, -56],
    columns: 7,
    rows: 4,
    spacing: [10, 10],
    ordered: true
  }),
  ...treeLine('west-field-line', [-142, 18], [-32, 33], 12),
  ...treeLine('northeast-field-line', [30, 44], [142, 82], 12),
  ...treeLine('southeast-field-line', [32, -5], [142, -36], 12)
];

export const STONNE_APPROACH_1940_MAP = defineMapDescriptor({
  id: 'stonne-approach-1940',
  title: 'Stonne',
  description:
    'Rolling farmland at the Stonne-La Marfee crossroads, with a small hamlet, orchard, wooded high ground, and long field approaches.',
  previewStyle: 'crossroads',
  provenance: {
    source: 'user-supplied Stonne aerial reference image',
    dataQuality: REFERENCE_QUALITY
  },
  dimensions: {
    width: 300,
    depth: 300,
    segments: 72
  },
  elevation: {
    baseHeight: 1.5,
    waves: [
      {
        axis: 'z',
        function: 'sin',
        amplitude: 5.2,
        frequency: 0.011,
        phase: 0.55
      },
      {
        axis: 'x',
        function: 'cos',
        amplitude: 2.6,
        frequency: 0.016,
        phase: -0.35
      },
      {
        axis: 'z',
        function: 'cos',
        amplitude: 1.2,
        frequency: 0.032,
        phase: 0.4
      }
    ]
  },
  surfaces: {
    textureResolution: [1024, 1024],
    baseColor: '#58743d',
    terrainMaterial: {
      color: 0x75865a,
      roughness: 0.96,
      metalness: 0
    },
    riverBankMaterial: {
      color: 0x716b42,
      roughness: 0.98,
      metalness: 0,
      presentationApproximation:
        'unused Bridge-compatible terrain asset slot on this waterless map'
    },
    layers: [
      {
        id: 'northwest-pasture',
        kind: 'pasture',
        color: '#6e824b',
        polygon: [
          [0, 0],
          [390, 0],
          [435, 285],
          [330, 448],
          [0, 420]
        ],
        visualOnly: true
      },
      {
        id: 'northeast-crop',
        kind: 'crop-field',
        color: '#a79a5d',
        polygon: [
          [625, 48],
          [1000, 20],
          [1024, 382],
          [720, 440],
          [610, 280]
        ],
        visualOnly: true
      },
      {
        id: 'east-center-crop',
        kind: 'crop-field',
        color: '#b0a265',
        polygon: [
          [650, 320],
          [1024, 342],
          [1024, 700],
          [650, 640],
          [575, 500]
        ],
        visualOnly: true
      },
      {
        id: 'southwest-crop',
        kind: 'crop-field',
        color: '#8c8350',
        polygon: [
          [0, 650],
          [350, 600],
          [440, 1024],
          [0, 1024]
        ],
        visualOnly: true
      },
      {
        id: 'southeast-pasture',
        kind: 'pasture',
        color: '#617a45',
        polygon: [
          [590, 650],
          [1024, 700],
          [1024, 1024],
          [540, 1024]
        ],
        visualOnly: true
      },
      {
        id: 'northwest-wood-floor',
        kind: 'woodland-floor',
        color: '#354e2d',
        polygon: [
          [20, 40],
          [260, 20],
          [340, 150],
          [285, 310],
          [70, 295]
        ],
        visualOnly: true
      },
      {
        id: 'southeast-wood-floor',
        kind: 'woodland-floor',
        color: '#304a2a',
        polygon: [
          [620, 710],
          [865, 690],
          [950, 850],
          [850, 1010],
          [610, 980],
          [555, 840]
        ],
        visualOnly: true
      },
      {
        id: 'northeast-wood-floor',
        kind: 'woodland-floor',
        color: '#395330',
        polygon: [
          [825, 45],
          [1024, 40],
          [1024, 250],
          [900, 285],
          [790, 170]
        ],
        visualOnly: true
      },
      {
        id: 'west-orchard-floor',
        kind: 'orchard',
        color: '#667a43',
        polygon: [
          [125, 565],
          [365, 550],
          [405, 735],
          [145, 760]
        ],
        visualOnly: true
      },
      {
        id: 'main-road-shoulder',
        kind: 'road-shoulder',
        color: '#75684d',
        polygon: [
          [435, 1024],
          [470, 760],
          [485, 570],
          [478, 500],
          [500, 360],
          [510, 180],
          [510, 0],
          [548, 0],
          [548, 180],
          [535, 360],
          [520, 500],
          [528, 570],
          [510, 760],
          [475, 1024]
        ],
        visualOnly: true
      },
      {
        id: 'east-road-shoulder',
        kind: 'road-shoulder',
        color: '#75684d',
        polygon: [
          [510, 486],
          [650, 535],
          [800, 590],
          [1024, 650],
          [1024, 700],
          [800, 635],
          [650, 580],
          [510, 536]
        ],
        visualOnly: true
      },
      {
        id: 'west-lane-shoulder',
        kind: 'road-shoulder',
        color: '#75684d',
        polygon: [
          [495, 510],
          [350, 568],
          [150, 574],
          [0, 614],
          [0, 652],
          [150, 612],
          [350, 606],
          [505, 550]
        ],
        visualOnly: true
      },
      {
        id: 'main-road',
        kind: 'road',
        color: '#9a7d57',
        polygon: [
          [447, 1024],
          [481, 758],
          [496, 570],
          [490, 502],
          [511, 362],
          [521, 180],
          [521, 0],
          [537, 0],
          [537, 180],
          [524, 358],
          [509, 500],
          [517, 570],
          [499, 760],
          [463, 1024]
        ],
        visualOnly: true
      },
      {
        id: 'east-road',
        kind: 'road',
        color: '#9a7d57',
        polygon: [
          [510, 500],
          [650, 548],
          [800, 602],
          [1024, 664],
          [1024, 686],
          [800, 622],
          [650, 568],
          [510, 524]
        ],
        visualOnly: true
      },
      {
        id: 'west-lane',
        kind: 'farm-lane',
        color: '#897252',
        polygon: [
          [496, 520],
          [350, 580],
          [150, 586],
          [0, 626],
          [0, 640],
          [150, 600],
          [350, 594],
          [502, 538]
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
        'reused Bridge masonry presentation and gameplay dimensions'
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
          'reused Bridge gameplay approximation for dry rural wood fencing'
      },
      blocks: ['vehicle', 'infantry'],
      occludesSight: false,
      dataQuality:
        'reference-guided orchard boundary using reused Bridge fence cards; exact Stonne boundary material unverified'
    }
  },
  wallRuns: [
    {
      id: 'orchard-west',
      profileId: 'wood-picket-fence',
      start: [-118, -66],
      end: [-118, -18]
    },
    {
      id: 'orchard-north',
      profileId: 'wood-picket-fence',
      start: [-118, -18],
      end: [-42, -18]
    },
    {
      id: 'orchard-south',
      profileId: 'wood-picket-fence',
      start: [-118, -66],
      end: [-42, -66]
    },
    {
      id: 'orchard-east-north',
      profileId: 'wood-picket-fence',
      start: [-42, -18],
      end: [-42, -39]
    },
    {
      id: 'orchard-east-south',
      profileId: 'wood-picket-fence',
      start: [-42, -45],
      end: [-42, -66]
    }
  ],
  wallEnclosures: [],
  structures: [
    {
      id: 'stonne-crossroads-house-west',
      descriptorId: 'fr_house_12x9_2f',
      visualAdapterId: 'fr_house_12x9_2f',
      position: [-17, 14],
      rotationY: -0.18,
      foundationClearance: 0.12
    },
    {
      id: 'stonne-crossroads-farm-north',
      descriptorId: 'fr_farmhouse_8x6_1f',
      visualAdapterId: 'fr_farmhouse_8x6_1f',
      position: [15, 13],
      rotationY: 0.42,
      foundationClearance: 0.12
    },
    {
      id: 'stonne-crossroads-farm-southwest',
      descriptorId: 'fr_farmhouse_8x6_1f',
      visualAdapterId: 'fr_farmhouse_8x6_1f',
      position: [-18, -13],
      rotationY: -0.08,
      foundationClearance: 0.12
    },
    {
      id: 'stonne-crossroads-house-east',
      descriptorId: 'fr_house_12x9_2f',
      visualAdapterId: 'fr_house_12x9_2f',
      position: [21, -16],
      rotationY: -0.5,
      foundationClearance: 0.12
    },
    {
      id: 'stonne-west-outbuilding',
      descriptorId: 'fr_farmhouse_8x6_1f',
      visualAdapterId: 'fr_farmhouse_8x6_1f',
      position: [-43, 30],
      rotationY: Math.PI / 2,
      foundationClearance: 0.12
    }
  ],
  foliage: FOLIAGE,
  foliageRendering: {
    mode: 'instanced',
    dataQuality: FOLIAGE_QUALITY
  },
  deploymentZones: {
    french: {
      minX: -80,
      maxX: 80,
      minZ: -140,
      maxZ: -100,
      color: 0x3b82f6
    },
    german: {
      minX: -80,
      maxX: 80,
      minZ: 100,
      maxZ: 140,
      color: 0xef4444
    }
  }
});
