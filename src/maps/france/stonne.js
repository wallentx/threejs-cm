import { defineMapDescriptor } from '../MapDescriptor.js';
import {
  BRIDGE_BREAKTHROUGH_MISSION
} from './BridgeBreakthroughMission.js';
import {
  FR_ATTACHED_DEEP_INN_8_8X10_2_2F,
  FR_ATTACHED_NARROW_HOUSE_6_8X8_2_2F,
  FR_ATTACHED_RIVER_DEEP_INN_8_8X10_2_2F,
  FR_ATTACHED_RIVER_NARROW_HOUSE_6_8X8_2_2F,
  FR_ATTACHED_TALL_HOUSE_7_4X8_7_3F,
  FR_ATTACHED_WIDE_SHOP_9_6X9_4_2F,
  FR_ATTACHED_WORKSHOP_6_4X7_6_1F
} from './FranceAttachedStreetBuildings.js';

const STRUCTURE_TERRAIN_PAD = Object.freeze({
  footprintMargin: 1.75,
  blendDistance: 4,
  dataQuality:
    'scenario-authored grading approximation derived from each structure footprint'
});

const STREET_HOUSE_DESTRUCTION = Object.freeze({
  approximation: 'gameplay approximation; not historical survey evidence',
  sectionCollapse: Object.freeze([
    Object.freeze({ sectionId: 'ground-shell', atOrBelowHealthFraction: 0.12 }),
    Object.freeze({ sectionId: 'roof', atOrBelowHealthFraction: 0.18 })
  ])
});

const surfacePoint = (x, z) => [
  ((x + 120) / 240) * 1024,
  ((120 - z) / 240) * 1024
];

const EAST_ATTACHED_ROW = Object.freeze([
  Object.freeze({
    id: 'french_village_house',
    descriptor: FR_ATTACHED_RIVER_NARROW_HOUSE_6_8X8_2_2F,
    styleId: 'aisne-limestone'
  }),
  Object.freeze({
    id: 'french_village_cafe',
    descriptor: FR_ATTACHED_WIDE_SHOP_9_6X9_4_2F,
    styleId: 'aisne-weathered-plaster',
    facadeId: 'commercial-cafe-ochre'
  }),
  Object.freeze({
    id: 'french_village_tall_house_east',
    descriptor: FR_ATTACHED_TALL_HOUSE_7_4X8_7_3F,
    styleId: 'ardennes-slate-stone'
  }),
  Object.freeze({
    id: 'french_village_inn_east',
    descriptor: FR_ATTACHED_DEEP_INN_8_8X10_2_2F,
    styleId: 'aisne-weathered-plaster',
    facadeId: 'commercial-inn-blue'
  }),
  Object.freeze({
    id: 'french_village_workshop_east',
    descriptor: FR_ATTACHED_WORKSHOP_6_4X7_6_1F,
    styleId: 'aisne-limestone'
  })
]);

const WEST_ATTACHED_ROW = Object.freeze([
  Object.freeze({
    id: 'french_bridge_house_west',
    descriptor: FR_ATTACHED_RIVER_DEEP_INN_8_8X10_2_2F,
    styleId: 'aisne-limestone'
  }),
  Object.freeze({
    id: 'french_village_pharmacie',
    descriptor: FR_ATTACHED_NARROW_HOUSE_6_8X8_2_2F,
    styleId: 'aisne-weathered-plaster',
    facadeId: 'commercial-pharmacy-green'
  }),
  Object.freeze({
    id: 'french_village_shop_west',
    descriptor: FR_ATTACHED_WIDE_SHOP_9_6X9_4_2F,
    styleId: 'aisne-limestone',
    facadeId: 'commercial-red-fascia'
  }),
  Object.freeze({
    id: 'french_village_tall_house_west',
    descriptor: FR_ATTACHED_TALL_HOUSE_7_4X8_7_3F,
    styleId: 'ardennes-slate-stone'
  }),
  Object.freeze({
    id: 'french_village_workshop_west',
    descriptor: FR_ATTACHED_WORKSHOP_6_4X7_6_1F,
    styleId: 'aisne-weathered-plaster'
  })
]);

function createAttachedStreetRow({ rowId, side, startZ, buildings }) {
  const east = side === 'east';
  const roadEdgeX = 10.5;
  let cursorZ = startZ;
  return buildings.map((building, attachedOrder) => {
    const width = building.descriptor.bounds.max[0] - building.descriptor.bounds.min[0];
    const depth = building.descriptor.bounds.max[2] - building.descriptor.bounds.min[2];
    const centerZ = cursorZ + width * 0.5;
    cursorZ += width;
    return {
      id: building.id,
      descriptorId: building.descriptor.id,
      visualAdapterId: building.descriptor.id,
      styleId: building.styleId,
      ...(building.facadeId ? { facadeId: building.facadeId } : {}),
      roofStyleId: 'gabled',
      attachedRowId: rowId,
      attachedOrder,
      terrainPad: {
        ...STRUCTURE_TERRAIN_PAD,
        levelGroupId: rowId
      },
      position: [
        (east ? 1 : -1) * (roadEdgeX + depth * 0.5),
        centerZ
      ],
      rotationY: east ? -Math.PI / 2 : Math.PI / 2,
      foundationClearance: 0.12,
      destructionThresholds: STREET_HOUSE_DESTRUCTION
    };
  });
}

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
      },
      {
        id: 'village-west-rear-lane',
        kind: 'farm-lane',
        color: '#806b4d',
        polygon: [
          surfacePoint(-34, 14),
          surfacePoint(-27, 18),
          surfacePoint(-25, 43),
          surfacePoint(-28, 70),
          surfacePoint(-25, 100),
          surfacePoint(-34, 103),
          surfacePoint(-37, 72),
          surfacePoint(-34, 45)
        ],
        visualOnly: true
      },
      {
        id: 'village-east-rear-lane',
        kind: 'farm-lane',
        color: '#806b4d',
        polygon: [
          surfacePoint(27, 17),
          surfacePoint(35, 14),
          surfacePoint(34, 43),
          surfacePoint(38, 70),
          surfacePoint(34, 103),
          surfacePoint(25, 100),
          surfacePoint(28, 69),
          surfacePoint(25, 43)
        ],
        visualOnly: true
      },
      {
        id: 'village-rear-cross-lane',
        kind: 'farm-lane',
        color: '#786448',
        polygon: [
          surfacePoint(-36, 58),
          surfacePoint(-18, 55),
          surfacePoint(0, 58),
          surfacePoint(19, 56),
          surfacePoint(37, 60),
          surfacePoint(37, 67),
          surfacePoint(18, 64),
          surfacePoint(0, 66),
          surfacePoint(-18, 63),
          surfacePoint(-36, 66)
        ],
        visualOnly: true
      },
      {
        id: 'french-east-kitchen-garden',
        kind: 'garden',
        color: '#68583a',
        polygon: [
          surfacePoint(55, 44),
          surfacePoint(66, 42),
          surfacePoint(68, 58),
          surfacePoint(55, 61)
        ],
        visualOnly: true
      },
      {
        id: 'german-riverbank-dirt-road',
        kind: 'farm-lane',
        color: '#795f3f',
        polygon: [
          surfacePoint(-108, -11),
          surfacePoint(-78, -10),
          surfacePoint(-48, -12.5),
          surfacePoint(-16, -10.5),
          surfacePoint(17, -12.5),
          surfacePoint(49, -10),
          surfacePoint(79, -12),
          surfacePoint(108, -10.5),
          surfacePoint(108, -18.5),
          surfacePoint(79, -20),
          surfacePoint(49, -18),
          surfacePoint(17, -20.5),
          surfacePoint(-16, -18.5),
          surfacePoint(-48, -20.5),
          surfacePoint(-78, -18),
          surfacePoint(-108, -19)
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
    bedLevel: -1.55,
    floodplainRadius: 45
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
      textureRepeatMeters: 1.6,
      textureRepeatHeightMeters: 0.8,
      blocks: ['vehicle', 'infantry'],
      occludesSight: true,
      dataQuality:
        'scenario-authored masonry boundary approximation; dimensions are gameplay values'
    },
    'cobblestone-bank-wall': {
      id: 'cobblestone-bank-wall',
      presentationKind: 'solid-prism',
      materialRole: 'masonry',
      collisionType: 'stonewall',
      height: 0.9,
      thickness: 0.55,
      maximumSegmentLength: 3,
      textureRepeatMeters: 1.6,
      textureRepeatHeightMeters: 0.8,
      blocks: ['vehicle', 'infantry'],
      occludesSight: false,
      dataQuality:
        'scenario-authored low cobblestone riverbank wall with a bridge-road opening; not a surveyed surviving wall'
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
    },
    'hedgerow': {
      id: 'hedgerow',
      presentationKind: 'solid-prism',
      materialRole: 'hedgerow',
      collisionType: 'hedgerow',
      height: 1.45,
      thickness: 0.95,
      maximumSegmentLength: 4,
      blocks: ['vehicle', 'infantry'],
      occludesSight: true,
      dataQuality:
        'scenario-authored rural hedgerow boundary approximation; dense sight and movement obstacle'
    },
    'sandbag-wall': {
      id: 'sandbag-wall',
      presentationKind: 'solid-prism',
      materialRole: 'sandbag',
      collisionType: 'sandbag',
      height: 0.85,
      thickness: 0.65,
      maximumSegmentLength: 2.5,
      textureRepeatMeters: 1.6,
      textureRepeatHeightMeters: 0.64,
      blocks: ['vehicle', 'infantry'],
      blocksProjectiles: true,
      occludesSight: false,
      dataQuality:
        'scenario-authored sandbag revetment; waist-high defensive ballistic cover'
    },
    'timber-log-pile': {
      id: 'timber-log-pile',
      presentationKind: 'solid-prism',
      materialRole: 'foliageTrunk',
      collisionType: 'timber-log-pile',
      height: 0.95,
      thickness: 1.1,
      maximumSegmentLength: 3,
      blocks: ['vehicle', 'infantry'],
      blocksProjectiles: true,
      occludesSight: false,
      dataQuality:
        'scenario-authored timber log stack; waist-high ballistic cover'
    }
  },
  wallRuns: [
    {
      id: 'french_bank_cobblestone_west',
      profileId: 'cobblestone-bank-wall',
      start: [-32, 24],
      end: [-3.5, 24]
    },
    {
      id: 'french_bank_cobblestone_east',
      profileId: 'cobblestone-bank-wall',
      start: [3.5, 24],
      end: [82, 24]
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
    },
    {
      id: 'east_kitchen_garden_south',
      profileId: 'wood-picket-fence',
      start: [55, 44],
      end: [66, 42]
    },
    {
      id: 'east_kitchen_garden_east',
      profileId: 'wood-picket-fence',
      start: [66, 42],
      end: [68, 58]
    },
    {
      id: 'east_kitchen_garden_north',
      profileId: 'wood-picket-fence',
      start: [68, 58],
      end: [55, 61]
    },
    {
      id: 'east_kitchen_garden_west_south',
      profileId: 'wood-picket-fence',
      start: [55, 44],
      end: [55, 50]
    },
    {
      id: 'east_kitchen_garden_west_north',
      profileId: 'wood-picket-fence',
      start: [55, 54],
      end: [55, 61]
    },
    {
      id: 'german_riverbank_bushes_southwest_outer',
      profileId: 'hedgerow',
      start: [-96, -7],
      end: [-86, -7.5]
    },
    {
      id: 'german_riverbank_bushes_southwest_inner',
      profileId: 'hedgerow',
      start: [-63, -7],
      end: [-54, -8]
    },
    {
      id: 'german_riverbank_bushes_southeast_inner',
      profileId: 'hedgerow',
      start: [24, -7.5],
      end: [34, -7]
    },
    {
      id: 'german_riverbank_bushes_southeast_outer',
      profileId: 'hedgerow',
      start: [72, -8],
      end: [82, -7]
    },
    {
      id: 'german_riverbank_bushes_northwest_outer',
      profileId: 'hedgerow',
      start: [-104, -24],
      end: [-95, -25]
    },
    {
      id: 'german_riverbank_bushes_northwest_inner',
      profileId: 'hedgerow',
      start: [-72, -25],
      end: [-62, -24]
    },
    {
      id: 'german_riverbank_bushes_northeast_inner',
      profileId: 'hedgerow',
      start: [48, -25],
      end: [58, -24]
    },
    {
      id: 'german_riverbank_bushes_northeast_outer',
      profileId: 'hedgerow',
      start: [88, -24],
      end: [99, -25]
    },
    {
      id: 'north_mill_road_south',
      profileId: 'stone-wall',
      enclosureId: 'north-mill-compound',
      boundarySide: 'west',
      adjacentGateId: 'north-mill-road-gate',
      start: [12, -23],
      end: [12, -29]
    },
    {
      id: 'north_mill_road_north',
      profileId: 'stone-wall',
      enclosureId: 'north-mill-compound',
      boundarySide: 'west',
      adjacentGateId: 'north-mill-road-gate',
      start: [12, -35],
      end: [12, -45]
    },
    {
      id: 'north_mill_south',
      profileId: 'stone-wall',
      enclosureId: 'north-mill-compound',
      boundarySide: 'south',
      start: [12, -23],
      end: [34, -23]
    },
    {
      id: 'north_mill_north',
      profileId: 'stone-wall',
      enclosureId: 'north-mill-compound',
      boundarySide: 'north',
      start: [12, -45],
      end: [34, -45]
    },
    {
      id: 'north_mill_east',
      profileId: 'stone-wall',
      enclosureId: 'north-mill-compound',
      boundarySide: 'east',
      start: [34, -45],
      end: [34, -23]
    },
    {
      id: 'north_pasture_south',
      profileId: 'wood-picket-fence',
      enclosureId: 'north-pasture-lot',
      boundarySide: 'south',
      start: [-46, -23],
      end: [-20, -23]
    },
    {
      id: 'north_pasture_east_south',
      profileId: 'wood-picket-fence',
      enclosureId: 'north-pasture-lot',
      boundarySide: 'east',
      adjacentGateId: 'north-pasture-gate',
      start: [-20, -23],
      end: [-20, -31]
    },
    {
      id: 'north_pasture_east_north',
      profileId: 'wood-picket-fence',
      enclosureId: 'north-pasture-lot',
      boundarySide: 'east',
      adjacentGateId: 'north-pasture-gate',
      start: [-20, -37],
      end: [-20, -49]
    },
    {
      id: 'north_pasture_north',
      profileId: 'wood-picket-fence',
      enclosureId: 'north-pasture-lot',
      boundarySide: 'north',
      start: [-46, -49],
      end: [-20, -49]
    },
    {
      id: 'north_pasture_west',
      profileId: 'wood-picket-fence',
      enclosureId: 'north-pasture-lot',
      boundarySide: 'west',
      start: [-46, -49],
      end: [-46, -23]
    },
    {
      id: 'pasture_west_hedgerow_south',
      profileId: 'hedgerow',
      start: [-58, -23],
      end: [-58, -39]
    },
    {
      id: 'pasture_west_hedgerow_north',
      profileId: 'hedgerow',
      start: [-58, -39],
      end: [-58, -55]
    },
    {
      id: 'pasture_north_hedgerow_west',
      profileId: 'hedgerow',
      start: [-58, -55],
      end: [-39, -55]
    },
    {
      id: 'pasture_north_hedgerow_east',
      profileId: 'hedgerow',
      start: [-39, -55],
      end: [-20, -55]
    },
    {
      id: 'orchard_east_hedgerow_north',
      profileId: 'hedgerow',
      start: [34, -23],
      end: [34, -36]
    },
    {
      id: 'orchard_east_hedgerow_south',
      profileId: 'hedgerow',
      start: [34, -36],
      end: [34, -49]
    },
    {
      id: 'pasture_barn_log_pile',
      profileId: 'timber-log-pile',
      start: [-22, -33],
      end: [-17, -33]
    },
    {
      id: 'north_mill_lane_log_pile',
      profileId: 'timber-log-pile',
      start: [8, -45],
      end: [13, -45]
    },
    {
      id: 'village_west_forward_ambush',
      profileId: 'sandbag-wall',
      start: [-24, 76],
      end: [-15, 76]
    },
    {
      id: 'village_east_forward_ambush',
      profileId: 'sandbag-wall',
      start: [15, 77],
      end: [24, 77]
    },
    {
      id: 'village_west_rear_log_cover',
      profileId: 'timber-log-pile',
      start: [-48, 79],
      end: [-39, 79]
    },
    {
      id: 'village_east_rear_log_cover',
      profileId: 'timber-log-pile',
      start: [39, 81],
      end: [48, 81]
    }
  ],
  wallEnclosures: [
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
    },
    {
      id: 'north-mill-compound',
      structureId: 'french_north_mill',
      kind: 'riverside-mill-compound',
      dataQuality:
        'scenario-authored gameplay approximation; not a surveyed historical Stonne boundary',
      gateOpenings: [
        {
          id: 'north-mill-road-gate',
          start: [12, -35],
          end: [12, -29]
        }
      ]
    },
    {
      id: 'north-pasture-lot',
      structureId: 'french_north_barn',
      kind: 'meadow-pasture',
      dataQuality:
        'scenario-authored gameplay approximation; not a surveyed historical Stonne boundary',
      gateOpenings: [
        {
          id: 'north-pasture-gate',
          start: [-20, -37],
          end: [-20, -31]
        }
      ]
    }
  ],
  structures: [
    ...createAttachedStreetRow({
      rowId: 'village-east-attached-row',
      side: 'east',
      startZ: 30,
      buildings: EAST_ATTACHED_ROW
    }),
    ...createAttachedStreetRow({
      rowId: 'village-west-attached-row',
      side: 'west',
      startZ: 31.4,
      buildings: WEST_ATTACHED_ROW
    }),
    {
      id: 'french_east_residence_river',
      descriptorId: 'fr_house_12x9_2f',
      visualAdapterId: 'fr_house_12x9_2f',
      styleId: 'aisne-weathered-plaster',
      terrainPad: STRUCTURE_TERRAIN_PAD,
      position: [48, 38],
      rotationY: Math.PI / 2,
      foundationClearance: 0.12,
      destructionThresholds: STREET_HOUSE_DESTRUCTION
    },
    {
      id: 'french_east_residence_garden',
      descriptorId: 'fr_farmhouse_8x6_1f',
      visualAdapterId: 'fr_farmhouse_8x6_1f',
      styleId: 'aisne-limestone',
      terrainPad: STRUCTURE_TERRAIN_PAD,
      position: [74, 55],
      rotationY: 0,
      foundationClearance: 0.12,
      destructionThresholds: STREET_HOUSE_DESTRUCTION
    },
    {
      id: 'french_east_residence_rear',
      descriptorId: 'fr_house_12x9_2f',
      visualAdapterId: 'fr_house_12x9_2f',
      styleId: 'ardennes-slate-stone',
      terrainPad: STRUCTURE_TERRAIN_PAD,
      position: [55, 82],
      rotationY: Math.PI / 2,
      foundationClearance: 0.12,
      destructionThresholds: STREET_HOUSE_DESTRUCTION
    },
    {
      id: 'french_farmhouse_outbuilding',
      descriptorId: 'fr_farmhouse_8x6_1f',
      visualAdapterId: 'fr_farmhouse_8x6_1f',
      styleId: 'rustic-barn-timber',
      terrainPad: STRUCTURE_TERRAIN_PAD,
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
    },
    {
      id: 'french_north_mill',
      descriptorId: 'fr_house_12x9_2f',
      visualAdapterId: 'fr_house_12x9_2f',
      styleId: 'ardennes-slate-stone',
      terrainPad: STRUCTURE_TERRAIN_PAD,
      position: [23, -34],
      rotationY: Math.PI / 2,
      foundationClearance: 0.12,
      destructionThresholds: {
        approximation: 'gameplay approximation; not historical survey evidence',
        sectionCollapse: [
          { sectionId: 'ground-shell', atOrBelowHealthFraction: 0.12 },
          { sectionId: 'roof', atOrBelowHealthFraction: 0.18 }
        ]
      }
    },
    {
      id: 'french_north_barn',
      descriptorId: 'fr_farmhouse_8x6_1f',
      visualAdapterId: 'fr_farmhouse_8x6_1f',
      styleId: 'rustic-barn-timber',
      terrainPad: STRUCTURE_TERRAIN_PAD,
      position: [-33, -36],
      rotationY: -Math.PI / 2,
      foundationClearance: 0.12,
      destructionThresholds: {
        approximation: 'gameplay approximation; not historical survey evidence',
        sectionCollapse: [
          { sectionId: 'ground-shell', atOrBelowHealthFraction: 0.12 },
          { sectionId: 'roof', atOrBelowHealthFraction: 0.18 }
        ]
      }
    },
    {
      id: 'french_north_shed',
      descriptorId: 'fr_farmhouse_8x6_1f',
      visualAdapterId: 'fr_farmhouse_8x6_1f',
      styleId: 'rustic-barn-timber',
      terrainPad: STRUCTURE_TERRAIN_PAD,
      position: [48, -42],
      rotationY: -Math.PI / 2,
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
      position: [22, 32],
      visualOnly: true
    },
    {
      id: 'tree-southwest-outer',
      profileId: 'mature-tree',
      position: [-70, -70],
      visualOnly: true
    },
    {
      id: 'tree-north-mill-orchard',
      profileId: 'mature-tree',
      position: [28, -39],
      visualOnly: true
    },
    {
      id: 'tree-north-roadside',
      profileId: 'mature-tree',
      position: [6, -39],
      visualOnly: true
    },
    {
      id: 'tree-north-pasture-creek',
      profileId: 'mature-tree',
      position: [-40, -25],
      visualOnly: true
    },
    {
      id: 'tree-north-pasture-barn',
      profileId: 'mature-tree',
      position: [-42, -45],
      visualOnly: true
    },
    {
      id: 'tree-french-east-river-yard',
      profileId: 'mature-tree',
      position: [68, 33],
      visualOnly: true
    },
    {
      id: 'tree-french-east-garden-south',
      profileId: 'mature-tree',
      position: [60, 48],
      visualOnly: true
    },
    {
      id: 'tree-french-east-garden-north',
      profileId: 'mature-tree',
      position: [62, 56],
      visualOnly: true
    },
    {
      id: 'tree-french-east-orchard-outer',
      profileId: 'mature-tree',
      position: [92, 48],
      visualOnly: true
    },
    {
      id: 'tree-french-east-rear-yard',
      profileId: 'mature-tree',
      position: [78, 78],
      visualOnly: true
    },
    {
      id: 'tree-french-east-rear-field',
      profileId: 'mature-tree',
      position: [92, 92],
      visualOnly: true
    },
    {
      id: 'tree-french-west-river-yard',
      profileId: 'mature-tree',
      position: [-76, 34],
      visualOnly: true
    },
    {
      id: 'tree-french-west-farm-lane',
      profileId: 'mature-tree',
      position: [-72, 52],
      visualOnly: true
    },
    {
      id: 'tree-french-west-middle-field',
      profileId: 'mature-tree',
      position: [-86, 66],
      visualOnly: true
    },
    {
      id: 'tree-french-west-rear-yard',
      profileId: 'mature-tree',
      position: [-66, 78],
      visualOnly: true
    },
    {
      id: 'tree-french-west-rear-field',
      profileId: 'mature-tree',
      position: [-48, 94],
      visualOnly: true
    },
    {
      id: 'tree-german-road-river-west-outer',
      profileId: 'mature-tree',
      position: [-90, -4],
      visualOnly: true
    },
    {
      id: 'tree-german-road-river-west-inner',
      profileId: 'mature-tree',
      position: [-42, -5],
      visualOnly: true
    },
    {
      id: 'tree-german-road-river-east-inner',
      profileId: 'mature-tree',
      position: [43, -4],
      visualOnly: true
    },
    {
      id: 'tree-german-road-river-east-outer',
      profileId: 'mature-tree',
      position: [91, -5],
      visualOnly: true
    },
    {
      id: 'tree-german-road-north-west-outer',
      profileId: 'mature-tree',
      position: [-86, -29],
      visualOnly: true
    },
    {
      id: 'tree-german-road-north-west-inner',
      profileId: 'mature-tree',
      position: [-54, -27],
      visualOnly: true
    },
    {
      id: 'tree-german-road-north-east-inner',
      profileId: 'mature-tree',
      position: [58, -29],
      visualOnly: true
    },
    {
      id: 'tree-german-road-north-east-outer',
      profileId: 'mature-tree',
      position: [94, -28],
      visualOnly: true
    }
  ],
  foliageRendering: {
    mode: 'instanced',
    dataQuality:
      'renderer-only deterministic EZ-Tree instancing of authored tree centers; no collision, concealment, or forestry survey authority'
  },
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
  },
  configuredMission: BRIDGE_BREAKTHROUGH_MISSION
});
