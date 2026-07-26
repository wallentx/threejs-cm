const WALL_THICKNESS = 0.36;
const HALF_WALL = WALL_THICKNESS / 2;
const FLOOR_HEIGHT = 3.1;

const stages = [
  { id: 'intact', minHealthFraction: 0.7 },
  { id: 'damaged', minHealthFraction: 0.35 },
  { id: 'breached', minHealthFraction: 0.01 },
  { id: 'collapsed', minHealthFraction: 0 }
];

function part(id, center, halfExtents, options = {}) {
  return { id, center, halfExtents, ...options };
}

function slot(id, x, y, z) {
  return { id, localPosition: [x, y, z], capacity: 1 };
}

function aperture(id, center, size, initiallyOpen = true) {
  return { id, center, size, initiallyOpen };
}

function frontWallParts(prefix, y, halfH, doorOpeningId = null) {
  const wallBottom = y - halfH;
  const wallTop = y + halfH;
  const lintelHeight = wallTop - (wallBottom + 2.2);
  const lintelCenterY = wallBottom + 2.2 + lintelHeight * 0.5;
  const lintelHalfH = lintelHeight * 0.5;

  const doorLintelHeight = wallTop - (wallBottom + 2.1);
  const doorLintelCenterY = wallBottom + 2.1 + doorLintelHeight * 0.5;
  const doorLintelHalfH = doorLintelHeight * 0.5;

  const result = [
    // End pieces extend to X = ±6.18 to seal wall corners with side walls
    part(`${prefix}-left-end`, [-5.19, y, 4.5], [0.99, halfH, HALF_WALL]),
    part(`${prefix}-left-inner`, [-1.45, y, 4.5], [0.75, halfH, HALF_WALL]),
    part(`${prefix}-right-inner`, [1.45, y, 4.5], [0.75, halfH, HALF_WALL]),
    part(`${prefix}-right-end`, [5.19, y, 4.5], [0.99, halfH, HALF_WALL]),

    // Left Window: Wall apron below (0.7m), wall lintel above to storey top, window opening in middle (1.5m)
    part(`${prefix}-left-window-apron`, [-3.2, wallBottom + 0.35, 4.5], [1, 0.35, HALF_WALL]),
    part(`${prefix}-left-window-lintel`, [-3.2, lintelCenterY, 4.5], [1, lintelHalfH, HALF_WALL]),
    part(`${prefix}-left-window`, [-3.2, wallBottom + 1.45, 4.5], [1, 0.75, HALF_WALL], {
      openingId: `${prefix}-window-left-aperture`
    }),

    // Right Window: Wall apron below (0.7m), wall lintel above to storey top, window opening in middle (1.5m)
    part(`${prefix}-right-window-apron`, [3.2, wallBottom + 0.35, 4.5], [1, 0.35, HALF_WALL]),
    part(`${prefix}-right-window-lintel`, [3.2, lintelCenterY, 4.5], [1, lintelHalfH, HALF_WALL]),
    part(`${prefix}-right-window`, [3.2, wallBottom + 1.45, 4.5], [1, 0.75, HALF_WALL], {
      openingId: `${prefix}-window-right-aperture`
    })
  ];

  if (doorOpeningId) {
    // Door: Wall lintel above door to storey top, door opening below (2.1m)
    result.push(
      part(`${prefix}-door-lintel`, [0, doorLintelCenterY, 4.5], [0.7, doorLintelHalfH, HALF_WALL]),
      part(`${prefix}-door`, [0, wallBottom + 1.05, 4.5], [0.7, 1.05, HALF_WALL], { openingId: doorOpeningId })
    );
  } else {
    result.push(part(`${prefix}-center`, [0, y, 4.5], [2.2, halfH, HALF_WALL]));
  }
  return result;
}

function shellParts(prefix, y, halfH, doorOpeningId = null, blocks = null) {
  const parts = [
    ...frontWallParts(prefix, y, halfH, doorOpeningId),
    part(`${prefix}-back`, [0, y, -4.5], [6.18, halfH, HALF_WALL]),
    part(`${prefix}-left`, [-6, y, 0], [4.68, halfH, HALF_WALL], { rotationY: Math.PI / 2 }),
    part(`${prefix}-right`, [6, y, 0], [4.68, halfH, HALF_WALL], { rotationY: Math.PI / 2 })
  ];
  return blocks ? parts.map(record => ({ ...record, blocks: [...blocks] })) : parts;
}

/**
 * A renderer-neutral, metre-authored rural French masonry house.
 *
 * Coordinate contract: origin at foundation centre, +Y up, +Z points out of
 * the front façade. Slot and aperture positions are building-local.
 */
export const FR_HOUSE_12X9_2F = {
  id: 'fr_house_12x9_2f',
  bounds: {
    min: [-6, -0.35, -4.5],
    max: [6, 7.2, 4.5]
  },
  floors: [
    { id: 'ground-floor', elevation: 0, rooms: ['ground-room'] },
    { id: 'upper-floor', elevation: FLOOR_HEIGHT, rooms: ['upper-room'] }
  ],
  rooms: [
    {
      id: 'ground-room',
      floorId: 'ground-floor',
      concealment: 0.72,
      slots: [
        slot('ground-front-left', -3.2, 0.15, 3.65),
        slot('ground-front-right', 3.2, 0.15, 3.65),
        slot('ground-rear-left', -2.2, 0.15, -2.3),
        slot('ground-rear-right', 2.2, 0.15, -2.3)
      ]
    },
    {
      id: 'upper-room',
      floorId: 'upper-floor',
      concealment: 0.78,
      slots: [
        slot('upper-front-left', -3.2, 3.25, 3.65),
        slot('upper-front-right', 3.2, 3.25, 3.65),
        slot('upper-rear-left', -2.2, 3.25, -2.3),
        slot('upper-rear-right', 2.2, 3.25, -2.3)
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
      aperture: aperture('front-door-aperture', [0, 1.05, 4.5], [1.4, 2.1], true),
      transitSeconds: 1.2
    },
    {
      id: 'main-stair',
      kind: 'stair',
      from: 'ground-room',
      to: 'upper-room',
      sectionId: 'upper-floor-structure',
      transitSeconds: 3.8
    }
  ],
  firePorts: [
    {
      id: 'ground-window-left',
      roomId: 'ground-room',
      approachSlotId: 'ground-front-left',
      sectionId: 'ground-shell',
      aperture: aperture('ground-window-left-aperture', [-3.2, 1.45, 4.5], [2, 1.5], true),
      localNormal: [0, 0, 1],
      horizontalArcDeg: 72,
      elevationDeg: 0,
      capacity: 1,
      cover: 0.68
    },
    {
      id: 'ground-window-right',
      roomId: 'ground-room',
      approachSlotId: 'ground-front-right',
      sectionId: 'ground-shell',
      aperture: aperture('ground-window-right-aperture', [3.2, 1.45, 4.5], [2, 1.5], true),
      localNormal: [0, 0, 1],
      horizontalArcDeg: 72,
      elevationDeg: 0,
      capacity: 1,
      cover: 0.68
    },
    {
      id: 'upper-window-left',
      roomId: 'upper-room',
      approachSlotId: 'upper-front-left',
      sectionId: 'upper-shell',
      aperture: aperture('upper-window-left-aperture', [-3.2, 4.55, 4.5], [2, 1.5], true),
      localNormal: [0, 0, 1],
      horizontalArcDeg: 76,
      elevationDeg: -4,
      capacity: 1,
      cover: 0.74
    },
    {
      id: 'upper-window-right',
      roomId: 'upper-room',
      approachSlotId: 'upper-front-right',
      sectionId: 'upper-shell',
      aperture: aperture('upper-window-right-aperture', [3.2, 4.55, 4.5], [2, 1.5], true),
      localNormal: [0, 0, 1],
      horizontalArcDeg: 76,
      elevationDeg: -4,
      capacity: 1,
      cover: 0.74
    }
  ],
  sections: [
    {
      id: 'foundation',
      kind: 'foundation',
      material: 'stone',
      maxHealth: 1200,
      resistanceMm: 650,
      supports: ['ground-floor-structure'],
      colliderParts: [
        part('foundation-slab', [0, -0.2, 0], [6, 0.2, 4.5], { blocks: ['projectile'] })
      ],
      visualStages: stages,
      supportThreshold: 0.5
    },
    {
      id: 'ground-floor-structure',
      kind: 'floor',
      material: 'timber-and-stone',
      maxHealth: 720,
      resistanceMm: 180,
      supports: ['ground-shell'],
      affectedFloorIds: ['ground-floor'],
      colliderParts: [
        part('ground-floor-slab', [0, 0, 0], [5.8, 0.12, 4.3], { blocks: ['projectile'] })
      ],
      visualStages: stages,
      supportThreshold: 0.6
    },
    {
      id: 'ground-shell',
      kind: 'wall',
      material: 'masonry',
      maxHealth: 980,
      resistanceMm: 320,
      supports: ['upper-floor-structure'],
      colliderParts: shellParts('ground', 1.55, 1.55, 'front-door-aperture'),
      visualStages: stages,
      supportThreshold: 0.6,
      breachHealthFraction: 0.55
    },
    {
      id: 'upper-floor-structure',
      kind: 'floor',
      material: 'timber',
      maxHealth: 560,
      resistanceMm: 110,
      supports: ['upper-shell'],
      affectedFloorIds: ['upper-floor'],
      colliderParts: [
        part('upper-floor-slab', [0, FLOOR_HEIGHT, 0], [5.8, 0.12, 4.3], { blocks: ['projectile'] })
      ],
      visualStages: stages,
      supportThreshold: 0.6
    },
    {
      id: 'upper-shell',
      kind: 'wall',
      material: 'masonry',
      maxHealth: 820,
      resistanceMm: 280,
      supports: ['roof'],
      colliderParts: shellParts('upper', FLOOR_HEIGHT + 1.5, 1.5, null, ['projectile']),
      visualStages: stages,
      supportThreshold: 0.6,
      breachHealthFraction: 0.55
    },
    {
      id: 'roof',
      kind: 'roof',
      material: 'timber-and-tile',
      maxHealth: 460,
      resistanceMm: 80,
      supports: [],
      affectedFloorIds: ['upper-floor'],
      colliderParts: [
        part('roof-main', [0, 6.45, 0], [6.15, 0.45, 4.65], { blocks: ['projectile'] })
      ],
      visualStages: stages,
      supportThreshold: 0.6
    }
  ],
  rubble: {
    concealment: 0.58,
    colliderParts: [
      part('rubble-core', [0, 0.45, 0], [5.5, 0.45, 4]),
      part('rubble-front', [0.8, 0.3, 4.2], [3.8, 0.3, 1.15])
    ]
  }
};
