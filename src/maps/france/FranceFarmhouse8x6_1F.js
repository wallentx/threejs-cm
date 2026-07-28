const WALL_THICKNESS = 0.32;
const HALF_WALL = WALL_THICKNESS * 0.5;
const WALL_HEIGHT = 2.7;
const FRONT_Z = 3 - HALF_WALL;
const REAR_Z = -FRONT_Z;
const SIDE_X = 4 - HALF_WALL;

const VISUAL_STAGES = [
  { id: 'intact', minHealthFraction: 0.72 },
  { id: 'damaged', minHealthFraction: 0.4 },
  { id: 'breached', minHealthFraction: 0.01 },
  { id: 'collapsed', minHealthFraction: 0 }
];

function part(id, center, halfExtents, options = {}) {
  return { id, center, halfExtents, ...options };
}

function slot(id, localPosition, dataQuality = null) {
  return {
    id,
    localPosition,
    capacity: 1,
    ...(dataQuality ? { dataQuality } : {})
  };
}

function aperture(id, center, size) {
  return { id, center, size, initiallyOpen: true };
}

function frontWallParts() {
  const windowBottom = 0.85;
  const windowTop = 2.05;
  const windowCenterY = (windowBottom + windowTop) * 0.5;
  const windowHalfHeight = (windowTop - windowBottom) * 0.5;
  const windowHalfWidth = 0.625;
  const lintelCenterY = (windowTop + WALL_HEIGHT) * 0.5;
  const lintelHalfHeight = (WALL_HEIGHT - windowTop) * 0.5;
  const doorHalfWidth = 0.55;
  const doorHeight = 2.05;

  return [
    part('front-left-end', [-3.5125, WALL_HEIGHT * 0.5, FRONT_Z], [0.4875, WALL_HEIGHT * 0.5, HALF_WALL]),
    part('front-left-inner', [-1.1625, WALL_HEIGHT * 0.5, FRONT_Z], [0.6125, WALL_HEIGHT * 0.5, HALF_WALL]),
    part('front-right-inner', [1.1625, WALL_HEIGHT * 0.5, FRONT_Z], [0.6125, WALL_HEIGHT * 0.5, HALF_WALL]),
    part('front-right-end', [3.5125, WALL_HEIGHT * 0.5, FRONT_Z], [0.4875, WALL_HEIGHT * 0.5, HALF_WALL]),
    part('front-left-window-apron', [-2.4, windowBottom * 0.5, FRONT_Z], [windowHalfWidth, windowBottom * 0.5, HALF_WALL]),
    part('front-left-window-lintel', [-2.4, lintelCenterY, FRONT_Z], [windowHalfWidth, lintelHalfHeight, HALF_WALL]),
    part('front-left-window', [-2.4, windowCenterY, FRONT_Z], [windowHalfWidth, windowHalfHeight, HALF_WALL], {
      openingId: 'front-left-window-aperture'
    }),
    part('front-right-window-apron', [2.4, windowBottom * 0.5, FRONT_Z], [windowHalfWidth, windowBottom * 0.5, HALF_WALL]),
    part('front-right-window-lintel', [2.4, lintelCenterY, FRONT_Z], [windowHalfWidth, lintelHalfHeight, HALF_WALL]),
    part('front-right-window', [2.4, windowCenterY, FRONT_Z], [windowHalfWidth, windowHalfHeight, HALF_WALL], {
      openingId: 'front-right-window-aperture'
    }),
    part('front-door-lintel', [0, (doorHeight + WALL_HEIGHT) * 0.5, FRONT_Z], [
      doorHalfWidth,
      (WALL_HEIGHT - doorHeight) * 0.5,
      HALF_WALL
    ]),
    part('front-door', [0, doorHeight * 0.5, FRONT_Z], [doorHalfWidth, doorHeight * 0.5, HALF_WALL], {
      openingId: 'front-door-aperture'
    })
  ];
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Compact renderer-neutral farmhouse authored in scene metres.
 *
 * Coordinate contract: the foundation centre is the origin, +Y is up, and
 * +Z points out through the front facade. This is scenario-authored tactical
 * data, not a survey of a surviving Stonne building.
 */
export const FR_FARMHOUSE_8X6_1F = deepFreeze({
  id: 'fr_farmhouse_8x6_1f',
  bounds: {
    min: [-4, -0.32, -3],
    max: [4, 4.5, 3]
  },
  dataQuality: {
    dimensions: 'scenario gameplay approximation; not a historical Stonne building survey',
    damageThresholds: 'gameplay approximation for deterministic structural damage',
    materials: 'scenario presentation and resistance approximation',
    concealment: 'gameplay approximation for one compact masonry room',
    transitTiming: 'gameplay approximation for individual front-door transit'
  },
  floors: [
    {
      id: 'ground-floor',
      elevation: 0,
      rooms: ['ground-room']
    }
  ],
  rooms: [
    {
      id: 'ground-room',
      floorId: 'ground-floor',
      concealment: 0.67,
      concealmentDataQuality: 'gameplay approximation',
      slots: [
        slot('ground-front-left', [-2.4, 0.15, 2.25]),
        slot('ground-front-right', [2.4, 0.15, 2.25]),
        slot('ground-rear-interior', [0, 0.15, -1.8]),
        slot(
          'ground-middle-left',
          [-1.6, 0.15, 0.2],
          'gameplay approximation for individual interior spacing'
        ),
        slot(
          'ground-middle-right',
          [1.6, 0.15, 0.2],
          'gameplay approximation for individual interior spacing'
        ),
        slot(
          'ground-rear-left',
          [-2.2, 0.15, -1.8],
          'gameplay approximation for individual interior spacing'
        )
      ]
    }
  ],
  portals: [
    {
      id: 'front-door',
      kind: 'door',
      from: 'outside',
      to: 'ground-room',
      sectionId: 'ground-shell',
      aperture: aperture('front-door-aperture', [0, 1.025, FRONT_Z], [1.1, 2.05]),
      localNormal: [0, 0, 1],
      transitSeconds: 1,
      transitTimingDataQuality: 'gameplay approximation'
    }
  ],
  firePorts: [
    {
      id: 'front-window-left',
      roomId: 'ground-room',
      approachSlotId: 'ground-front-left',
      sectionId: 'ground-shell',
      aperture: aperture('front-left-window-aperture', [-2.4, 1.45, FRONT_Z], [1.25, 1.2]),
      localNormal: [0, 0, 1],
      horizontalArcDeg: 68,
      elevationDeg: -2,
      capacity: 1,
      cover: 0.64,
      coverDataQuality: 'gameplay approximation'
    },
    {
      id: 'front-window-right',
      roomId: 'ground-room',
      approachSlotId: 'ground-front-right',
      sectionId: 'ground-shell',
      aperture: aperture('front-right-window-aperture', [2.4, 1.45, FRONT_Z], [1.25, 1.2]),
      localNormal: [0, 0, 1],
      horizontalArcDeg: 68,
      elevationDeg: -2,
      capacity: 1,
      cover: 0.64,
      coverDataQuality: 'gameplay approximation'
    }
  ],
  sections: [
    {
      id: 'foundation',
      kind: 'foundation',
      material: 'stone',
      materialDataQuality: 'scenario resistance approximation',
      maxHealth: 760,
      resistanceMm: 520,
      damageDataQuality: 'gameplay approximation',
      supports: ['ground-floor-structure'],
      colliderParts: [
        part('foundation-slab', [0, -0.16, 0], [4, 0.16, 3], {
          blocks: ['projectile']
        })
      ],
      visualStages: VISUAL_STAGES,
      supportThreshold: 0.55
    },
    {
      id: 'ground-floor-structure',
      kind: 'floor',
      material: 'timber-and-stone',
      materialDataQuality: 'scenario resistance approximation',
      maxHealth: 430,
      resistanceMm: 145,
      damageDataQuality: 'gameplay approximation',
      supports: ['ground-shell'],
      affectedFloorIds: ['ground-floor'],
      colliderParts: [
        part('ground-floor-slab', [0, 0, 0], [3.8, 0.1, 2.8], {
          blocks: ['projectile']
        })
      ],
      visualStages: VISUAL_STAGES,
      supportThreshold: 0.58
    },
    {
      id: 'ground-shell',
      kind: 'wall',
      material: 'masonry',
      materialDataQuality: 'scenario resistance approximation',
      maxHealth: 640,
      resistanceMm: 270,
      damageDataQuality: 'gameplay approximation',
      supports: ['roof'],
      colliderParts: [
        ...frontWallParts(),
        part('rear-wall', [0, WALL_HEIGHT * 0.5, REAR_Z], [4, WALL_HEIGHT * 0.5, HALF_WALL]),
        part('left-wall', [-SIDE_X, WALL_HEIGHT * 0.5, 0], [FRONT_Z, WALL_HEIGHT * 0.5, HALF_WALL], {
          rotationY: Math.PI / 2
        }),
        part('right-wall', [SIDE_X, WALL_HEIGHT * 0.5, 0], [FRONT_Z, WALL_HEIGHT * 0.5, HALF_WALL], {
          rotationY: Math.PI / 2
        })
      ],
      visualStages: VISUAL_STAGES,
      supportThreshold: 0.58,
      breachHealthFraction: 0.52
    },
    {
      id: 'roof',
      kind: 'roof',
      material: 'timber-and-tile',
      materialDataQuality: 'scenario presentation and resistance approximation',
      maxHealth: 310,
      resistanceMm: 65,
      damageDataQuality: 'gameplay approximation',
      supports: [],
      affectedFloorIds: ['ground-floor'],
      colliderParts: [
        part('roof-volume', [0, 3.35, 0], [4, 0.55, 3], {
          blocks: ['projectile']
        })
      ],
      visualStages: VISUAL_STAGES,
      supportThreshold: 0.58
    }
  ],
  rubble: {
    concealment: 0.5,
    concealmentDataQuality: 'gameplay approximation',
    colliderParts: [
      part('rubble-core', [0, 0.38, 0], [3.55, 0.38, 2.55]),
      part('rubble-front', [-0.45, 0.24, 2.65], [2.45, 0.24, 0.65])
    ]
  }
});
