const WALL_THICKNESS = 0.36;
const HALF_WALL = WALL_THICKNESS * 0.5;
export const ATTACHED_BUILDING_MIN_MASONRY_PIER_METERS = 0.6;

const VISUAL_STAGES = Object.freeze([
  Object.freeze({ id: 'intact', minHealthFraction: 0.72 }),
  Object.freeze({ id: 'damaged', minHealthFraction: 0.4 }),
  Object.freeze({ id: 'breached', minHealthFraction: 0.01 }),
  Object.freeze({ id: 'collapsed', minHealthFraction: 0 })
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function part(id, center, halfExtents, options = {}) {
  return { id, center, halfExtents, ...options };
}

function aperture(id, center, size, initiallyOpen = true) {
  return { id, center, size, initiallyOpen };
}

function slot(id, localPosition) {
  return { id, localPosition, capacity: 1 };
}

function facadeParts({
  prefix,
  width,
  baseY,
  height,
  z,
  openings
}) {
  const parts = [];
  const wallLeft = -width * 0.5;
  const wallRight = width * 0.5;
  const ordered = [...openings].sort((a, b) => a.centerX - b.centerX);
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const gap = current.centerX - current.width * 0.5
      - (previous.centerX + previous.width * 0.5);
    if (gap + 1e-9 < ATTACHED_BUILDING_MIN_MASONRY_PIER_METERS) {
      throw new RangeError(
        `${prefix} openings ${previous.id} and ${current.id} leave only ${gap.toFixed(3)} m; `
        + `attached masonry facades require ${ATTACHED_BUILDING_MIN_MASONRY_PIER_METERS.toFixed(3)} m`
      );
    }
  }
  let cursor = wallLeft;

  for (const opening of ordered) {
    const left = opening.centerX - opening.width * 0.5;
    const right = opening.centerX + opening.width * 0.5;
    if (left > cursor) {
      parts.push(part(
        `${prefix}-pier-${parts.length}`,
        [(cursor + left) * 0.5, baseY + height * 0.5, z],
        [(left - cursor) * 0.5, height * 0.5, HALF_WALL]
      ));
    }
    if (opening.bottom > 0) {
      parts.push(part(
        `${prefix}-${opening.id}-apron`,
        [opening.centerX, baseY + opening.bottom * 0.5, z],
        [opening.width * 0.5, opening.bottom * 0.5, HALF_WALL]
      ));
    }
    const openingTop = opening.bottom + opening.height;
    if (openingTop < height) {
      parts.push(part(
        `${prefix}-${opening.id}-lintel`,
        [opening.centerX, baseY + (openingTop + height) * 0.5, z],
        [opening.width * 0.5, (height - openingTop) * 0.5, HALF_WALL]
      ));
    }
    parts.push(part(
      `${prefix}-${opening.id}-blocker`,
      [opening.centerX, baseY + opening.bottom + opening.height * 0.5, z],
      [opening.width * 0.5, opening.height * 0.5, HALF_WALL],
      { openingId: opening.id }
    ));
    cursor = right;
  }

  if (cursor < wallRight) {
    parts.push(part(
      `${prefix}-pier-${parts.length}`,
      [(cursor + wallRight) * 0.5, baseY + height * 0.5, z],
      [(wallRight - cursor) * 0.5, height * 0.5, HALF_WALL]
    ));
  }
  return parts;
}

function sideFacadeParts({ prefix, depth, baseY, height, x, openings }) {
  return facadeParts({
    prefix,
    width: depth,
    baseY,
    height,
    z: x,
    openings
  }).map(record => ({
    ...record,
    center: [x, record.center[1], record.center[0]],
    rotationY: Math.PI / 2
  }));
}

function storeyNames(index) {
  if (index === 0) return { floor: 'ground-floor', room: 'ground-room', shell: 'ground-shell' };
  if (index === 1) return { floor: 'upper-floor', room: 'upper-room', shell: 'upper-shell' };
  return { floor: `floor-${index + 1}`, room: `room-${index + 1}`, shell: `shell-${index + 1}` };
}

function createAttachedStreetBuilding({
  id,
  width,
  depth,
  storeys,
  storeyHeight,
  roofHeight,
  identity,
  frontWindows,
  rearWindows,
  frontDoorX,
  rearDoorX,
  riverFacingSide = null,
  riverWindows = []
}) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const frontZ = halfDepth - HALF_WALL;
  const rearZ = -frontZ;
  const sideX = halfWidth - HALF_WALL;
  const windowWidth = Math.min(1.08, width * 0.16);
  const windowHeight = 1.05;
  const windowBottom = 1.05;
  const doorWidth = 1.05;
  const doorHeight = 2.08;
  const floors = [];
  const rooms = [];
  const portals = [];
  const firePorts = [];
  const sections = [];

  const names = Array.from({ length: storeys }, (_, index) => storeyNames(index));
  for (let index = 0; index < storeys; index += 1) {
    const current = names[index];
    const elevation = index * storeyHeight;
    const centerY = elevation + storeyHeight * 0.5;
    const frontOpenings = [];
    const rearOpenings = [];
    const sideOpenings = { left: [], right: [] };
    const floorSlots = [];

    for (const face of ['front', 'rear']) {
      const centersByStorey = face === 'front' ? frontWindows : rearWindows;
      const centers = centersByStorey[index] ?? centersByStorey.at(-1) ?? [];
      centers.forEach((centerX, windowIndex) => {
        const openingId = `${current.floor}-${face}-window-${windowIndex + 1}-aperture`;
        const z = face === 'front' ? frontZ : rearZ;
        const normal = face === 'front' ? [0, 0, 1] : [0, 0, -1];
        const slotId = `${current.floor}-${face}-window-${windowIndex + 1}`;
        const opening = {
          id: openingId,
          centerX,
          width: windowWidth,
          bottom: windowBottom,
          height: windowHeight
        };
        (face === 'front' ? frontOpenings : rearOpenings).push(opening);
        floorSlots.push(slot(
          slotId,
          [centerX, elevation + 0.15, face === 'front' ? frontZ - 0.7 : rearZ + 0.7]
        ));
        firePorts.push({
          id: `${current.floor}-${face}-window-${windowIndex + 1}`,
          roomId: current.room,
          approachSlotId: slotId,
          sectionId: current.shell,
          aperture: aperture(
            openingId,
            [centerX, elevation + windowBottom + windowHeight * 0.5, z],
            [windowWidth, windowHeight],
            true
          ),
          localNormal: normal,
          horizontalArcDeg: index === 0 ? 70 : 76,
          elevationDeg: index === 0 ? -1 : -4,
          capacity: 1,
          cover: index === 0 ? 0.68 : 0.74,
          dataQuality: 'scenario gameplay approximation'
        });
      });
    }

    if (riverFacingSide) {
      const sideSign = riverFacingSide === 'left' ? -1 : 1;
      const centers = riverWindows[index] ?? riverWindows.at(-1) ?? [];
      centers.forEach((centerZ, windowIndex) => {
        const openingId = `${current.floor}-river-window-${windowIndex + 1}-aperture`;
        const slotId = `${current.floor}-river-window-${windowIndex + 1}`;
        sideOpenings[riverFacingSide].push({
          id: openingId,
          centerX: centerZ,
          width: Math.min(windowWidth, depth * 0.16),
          bottom: windowBottom,
          height: windowHeight
        });
        floorSlots.push(slot(
          slotId,
          [sideSign * (sideX - 0.7), elevation + 0.15, centerZ]
        ));
        firePorts.push({
          id: `${current.floor}-river-window-${windowIndex + 1}`,
          roomId: current.room,
          approachSlotId: slotId,
          sectionId: current.shell,
          aperture: aperture(
            openingId,
            [sideSign * sideX, elevation + windowBottom + windowHeight * 0.5, centerZ],
            [Math.min(windowWidth, depth * 0.16), windowHeight],
            true
          ),
          localNormal: [sideSign, 0, 0],
          horizontalArcDeg: index === 0 ? 70 : 76,
          elevationDeg: index === 0 ? -1 : -4,
          capacity: 1,
          cover: index === 0 ? 0.68 : 0.74,
          dataQuality: 'scenario gameplay approximation for river-facing end wall'
        });
      });
    }

    if (index === 0) {
      const frontDoorId = 'front-door-aperture';
      const rearDoorId = 'rear-door-aperture';
      frontOpenings.push({
        id: frontDoorId,
        centerX: frontDoorX,
        width: doorWidth,
        bottom: 0,
        height: doorHeight
      });
      rearOpenings.push({
        id: rearDoorId,
        centerX: rearDoorX,
        width: doorWidth,
        bottom: 0,
        height: doorHeight
      });
      portals.push(
        {
          id: 'front-door',
          kind: 'door',
          from: 'outside',
          to: current.room,
          sectionId: current.shell,
          aperture: aperture(frontDoorId, [frontDoorX, doorHeight * 0.5, frontZ], [doorWidth, doorHeight], false),
          localNormal: [0, 0, 1],
          transitSeconds: 1.05,
          dataQuality: 'scenario gameplay approximation'
        },
        {
          id: 'rear-door',
          kind: 'door',
          from: 'outside',
          to: current.room,
          sectionId: current.shell,
          aperture: aperture(rearDoorId, [rearDoorX, doorHeight * 0.5, rearZ], [doorWidth, doorHeight], false),
          localNormal: [0, 0, -1],
          transitSeconds: 1.05,
          dataQuality: 'scenario gameplay approximation'
        }
      );
    } else {
      portals.push({
        id: `stair-to-${current.floor}`,
        kind: 'stair',
        from: names[index - 1].room,
        to: current.room,
        sectionId: `${current.floor}-structure`,
        transitSeconds: 3.4,
        dataQuality: 'scenario gameplay approximation'
      });
    }

    floors.push({ id: current.floor, elevation, rooms: [current.room] });
    rooms.push({
      id: current.room,
      floorId: current.floor,
      concealment: Math.min(0.8, 0.7 + index * 0.04),
      slots: floorSlots,
      dataQuality: 'scenario gameplay approximation'
    });

    const isGround = index === 0;
    const nextSupport = index + 1 < storeys
      ? `${names[index + 1].floor}-structure`
      : 'roof';
    sections.push(
      {
        id: `${current.floor}-structure`,
        kind: 'floor',
        material: isGround ? 'timber-and-stone' : 'timber',
        maxHealth: isGround ? 560 : 470,
        resistanceMm: isGround ? 165 : 105,
        supports: [current.shell],
        affectedFloorIds: [current.floor],
        colliderParts: [part(
          `${current.floor}-slab`,
          [0, elevation, 0],
          [halfWidth - WALL_THICKNESS, 0.11, halfDepth - WALL_THICKNESS],
          { blocks: ['projectile'] }
        )],
        visualStages: VISUAL_STAGES,
        supportThreshold: 0.58,
        dataQuality: 'scenario gameplay approximation'
      },
      {
        id: current.shell,
        kind: 'wall',
        material: 'masonry',
        maxHealth: isGround ? 760 : 650,
        resistanceMm: isGround ? 310 : 275,
        supports: [nextSupport],
        colliderParts: [
          ...facadeParts({
            prefix: `${current.floor}-front`, width, baseY: elevation,
            height: storeyHeight, z: frontZ, openings: frontOpenings
          }),
          ...facadeParts({
            prefix: `${current.floor}-rear`, width, baseY: elevation,
            height: storeyHeight, z: rearZ, openings: rearOpenings
          }),
          ...(riverFacingSide === 'left'
            ? sideFacadeParts({
                prefix: `${current.floor}-river-left`, depth, baseY: elevation,
                height: storeyHeight, x: -sideX, openings: sideOpenings.left
              })
            : [part(
                `${current.floor}-party-wall-left`,
                [-sideX, centerY, 0],
                [halfDepth - HALF_WALL, storeyHeight * 0.5, HALF_WALL],
                { rotationY: Math.PI / 2, partyWallSide: 'left' }
              )]),
          ...(riverFacingSide === 'right'
            ? sideFacadeParts({
                prefix: `${current.floor}-river-right`, depth, baseY: elevation,
                height: storeyHeight, x: sideX, openings: sideOpenings.right
              })
            : [part(
                `${current.floor}-party-wall-right`,
                [sideX, centerY, 0],
                [halfDepth - HALF_WALL, storeyHeight * 0.5, HALF_WALL],
                { rotationY: Math.PI / 2, partyWallSide: 'right' }
              )])
        ].map(record => index === 0 ? record : {
          ...record,
          blocks: record.blocks ?? ['projectile']
        }),
        visualStages: VISUAL_STAGES,
        supportThreshold: 0.58,
        breachHealthFraction: 0.54,
        dataQuality: 'scenario gameplay approximation'
      }
    );
  }

  sections.unshift({
    id: 'foundation',
    kind: 'foundation',
    material: 'stone',
    maxHealth: 980,
    resistanceMm: 590,
    supports: ['ground-floor-structure'],
    colliderParts: [part(
      'foundation-slab',
      [0, -0.16, 0],
      [halfWidth, 0.16, halfDepth],
      { blocks: ['projectile'] }
    )],
    visualStages: VISUAL_STAGES,
    supportThreshold: 0.52,
    dataQuality: 'scenario gameplay approximation'
  });
  sections.push({
    id: 'roof',
    kind: 'roof',
    material: 'timber-and-tile',
    maxHealth: 390 + storeys * 45,
    resistanceMm: 72,
    supports: [],
    affectedFloorIds: [names.at(-1).floor],
    colliderParts: [part(
      'roof-volume',
      [0, storeys * storeyHeight + roofHeight * 0.5, 0],
      [halfWidth, roofHeight * 0.5, halfDepth],
      { blocks: ['projectile'] }
    )],
    visualStages: VISUAL_STAGES,
    supportThreshold: 0.58,
    dataQuality: 'scenario gameplay approximation'
  });

  return deepFreeze({
    id,
    identity,
    bounds: {
      min: [-halfWidth, -0.32, -halfDepth],
      max: [halfWidth, storeys * storeyHeight + roofHeight, halfDepth]
    },
    sharedWallPolicy: {
      sides: ['left', 'right'].filter(side => side !== riverFacingSide),
      openingsPermitted: false,
      description:
        'solid masonry party walls; adjacent placements share the exact footprint boundary'
    },
    roofOverhang: { x: 0.02, z: 0.42 },
    dataQuality: {
      dimensions:
        'scenario-authored 1940 Aisne streetscape approximation from supplied campaign references; not a surveyed surviving building',
      topology:
        'renderer-neutral attached-building gameplay topology with individual rooms, portals, floors, and damage sections',
      partyWalls:
        'scenario-authored shared-boundary construction; no doors or windows in adjoining side walls'
    },
    floors,
    rooms,
    portals,
    firePorts,
    sections,
    rubble: {
      concealment: 0.55,
      colliderParts: [
        part('rubble-core', [0, 0.4, 0], [halfWidth * 0.88, 0.4, halfDepth * 0.86]),
        part('rubble-street', [0, 0.24, halfDepth * 0.86], [halfWidth * 0.68, 0.24, 0.75])
      ]
    }
  });
}

export const FR_ATTACHED_NARROW_HOUSE_6_8X8_2_2F = createAttachedStreetBuilding({
  id: 'fr_attached_narrow_house_6_8x8_2_2f',
  width: 6.8,
  depth: 8.2,
  storeys: 2,
  storeyHeight: 2.9,
  roofHeight: 1.9,
  identity: 'narrow two-storey plaster townhouse',
  frontWindows: [[-2.1, 1.65], [-2, 0, 2]],
  rearWindows: [[-1.8, 2.15], [-2, 0, 2]],
  frontDoorX: -0.35,
  rearDoorX: 0.45
});

export const FR_ATTACHED_RIVER_NARROW_HOUSE_6_8X8_2_2F = createAttachedStreetBuilding({
  id: 'fr_attached_river_narrow_house_6_8x8_2_2f',
  width: 6.8,
  depth: 8.2,
  storeys: 2,
  storeyHeight: 2.9,
  roofHeight: 1.9,
  identity: 'river-end narrow two-storey plaster townhouse',
  frontWindows: [[-2.1, 1.65], [-2, 0, 2]],
  rearWindows: [[-1.8, 2.15], [-2, 0, 2]],
  frontDoorX: -0.35,
  rearDoorX: 0.45,
  riverFacingSide: 'left',
  riverWindows: [[-2.2, 0, 2.2], [-2.2, 0, 2.2]]
});

export const FR_ATTACHED_WIDE_SHOP_9_6X9_4_2F = createAttachedStreetBuilding({
  id: 'fr_attached_wide_shop_9_6x9_4_2f',
  width: 9.6,
  depth: 9.4,
  storeys: 2,
  storeyHeight: 3.15,
  roofHeight: 2.2,
  identity: 'wide two-storey village shop',
  frontWindows: [[-3.5, 0.3, 3.2], [-3.2, 0, 3.2]],
  rearWindows: [[-3.2, -0.5, 3.5], [-3.2, 0, 3.2]],
  frontDoorX: -1.65,
  rearDoorX: 1.8
});

export const FR_ATTACHED_TALL_HOUSE_7_4X8_7_3F = createAttachedStreetBuilding({
  id: 'fr_attached_tall_house_7_4x8_7_3f',
  width: 7.4,
  depth: 8.7,
  storeys: 3,
  storeyHeight: 2.85,
  roofHeight: 2.05,
  identity: 'tall narrow three-storey townhouse',
  frontWindows: [[-2.2, 2.15], [-2.2, 0, 2.2], [-2.2, 0, 2.2]],
  rearWindows: [[-2.6, 2.1], [-2.2, 0, 2.2], [-2.2, 0, 2.2]],
  frontDoorX: 0,
  rearDoorX: -0.9
});

export const FR_ATTACHED_DEEP_INN_8_8X10_2_2F = createAttachedStreetBuilding({
  id: 'fr_attached_deep_inn_8_8x10_2_2f',
  width: 8.8,
  depth: 10.2,
  storeys: 2,
  storeyHeight: 3.25,
  roofHeight: 2.35,
  identity: 'deep two-storey village inn',
  frontWindows: [[-3, -0.2, 3.2], [-3, 0, 3]],
  rearWindows: [[-2.7, 2.6], [-2.8, 0, 2.8]],
  frontDoorX: 1.5,
  rearDoorX: -1
});

export const FR_ATTACHED_RIVER_DEEP_INN_8_8X10_2_2F = createAttachedStreetBuilding({
  id: 'fr_attached_river_deep_inn_8_8x10_2_2f',
  width: 8.8,
  depth: 10.2,
  storeys: 2,
  storeyHeight: 3.25,
  roofHeight: 2.35,
  identity: 'river-end deep two-storey village inn',
  frontWindows: [[-3, -0.2, 3.2], [-3, 0, 3]],
  rearWindows: [[-2.7, 2.6], [-2.8, 0, 2.8]],
  frontDoorX: 1.5,
  rearDoorX: -1,
  riverFacingSide: 'right',
  riverWindows: [[-3, 0, 3], [-3, 0, 3]]
});

export const FR_ATTACHED_WORKSHOP_6_4X7_6_1F = createAttachedStreetBuilding({
  id: 'fr_attached_workshop_6_4x7_6_1f',
  width: 6.4,
  depth: 7.6,
  storeys: 1,
  storeyHeight: 3,
  roofHeight: 1.8,
  identity: 'low attached workshop',
  frontWindows: [[-2, 1.9]],
  rearWindows: [[-2.2, 1.6]],
  frontDoorX: 0.25,
  rearDoorX: -0.5
});

export const FRANCE_ATTACHED_STREET_BUILDING_DESCRIPTORS = Object.freeze([
  FR_ATTACHED_NARROW_HOUSE_6_8X8_2_2F,
  FR_ATTACHED_RIVER_NARROW_HOUSE_6_8X8_2_2F,
  FR_ATTACHED_WIDE_SHOP_9_6X9_4_2F,
  FR_ATTACHED_TALL_HOUSE_7_4X8_7_3F,
  FR_ATTACHED_DEEP_INN_8_8X10_2_2F,
  FR_ATTACHED_RIVER_DEEP_INN_8_8X10_2_2F,
  FR_ATTACHED_WORKSHOP_6_4X7_6_1F
]);
