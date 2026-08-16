import {
  normalizeBuildingDestructionThresholds
} from '../simulation/buildings/BuildingDestructionThresholds.js';

// Plain map-data contract. No renderer, browser, scenario, or runtime imports.

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clonePlain(value, path = 'map', seen = new WeakSet()) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} must contain plain data only`);
  }
  if (seen.has(value)) throw new TypeError(`${path} must not contain cycles`);
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((entry, index) => clonePlain(entry, `${path}[${index}]`, seen));
    seen.delete(value);
    return result;
  }
  if (!isPlainRecord(value)) {
    throw new TypeError(`${path} must contain plain records only`);
  }
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = clonePlain(child, `${path}.${key}`, seen);
  }
  seen.delete(value);
  return result;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function requireRecord(value, path) {
  if (!isPlainRecord(value)) throw new TypeError(`${path} must be a plain record`);
  return value;
}

function requireId(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} requires a non-empty id`);
  }
  return value;
}

function requireFinite(value, path, { positive = false } = {}) {
  if (!Number.isFinite(value) || (positive && value <= 0)) {
    throw new Error(`${path} must be ${positive ? 'positive and ' : ''}finite`);
  }
  return value;
}

function requirePositiveInteger(value, path) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${path} must be a positive integer`);
  }
  return value;
}

function requireColor(value, path) {
  if (
    (typeof value !== 'string' || value.length === 0)
    && (!Number.isInteger(value) || value < 0 || value > 0xffffff)
  ) {
    throw new Error(`${path} must be a color string or 24-bit integer`);
  }
  return value;
}

function validateMaterial(record, path, { transparent = false } = {}) {
  requireRecord(record, path);
  requireColor(record.color, `${path}.color`);
  for (const key of ['roughness', 'metalness']) {
    requireFinite(record[key], `${path}.${key}`);
    if (record[key] < 0 || record[key] > 1) {
      throw new Error(`${path}.${key} must be between 0 and 1`);
    }
  }
  if (transparent) {
    requireFinite(record.opacity, `${path}.opacity`);
    if (record.opacity < 0 || record.opacity > 1) {
      throw new Error(`${path}.opacity must be between 0 and 1`);
    }
  }
}

function validateRiverBankMaterial(record, path) {
  validateMaterial(record, path);
  if (
    typeof record.presentationApproximation !== 'string'
    || record.presentationApproximation.trim().length === 0
  ) {
    throw new Error(`${path}.presentationApproximation requires a non-empty label`);
  }
}

const WALL_PRESENTATION_KINDS = new Set([
  'solid-prism',
  'alpha-tested-card'
]);

function validateWallProfiles(profiles) {
  requireRecord(profiles, 'map.wallProfiles');
  const entries = Object.entries(profiles);
  if (entries.length === 0) {
    throw new Error('map.wallProfiles requires at least one profile');
  }
  for (const [profileId, profile] of entries) {
    const path = `map.wallProfiles.${profileId}`;
    requireRecord(profile, path);
    if (requireId(profile.id, `${path}.id`) !== profileId) {
      throw new Error(`${path}.id must match profile key ${profileId}`);
    }
    if (!WALL_PRESENTATION_KINDS.has(profile.presentationKind)) {
      throw new Error(
        `${path}.presentationKind must be solid-prism or alpha-tested-card`
      );
    }
    requireId(profile.materialRole, `${path}.materialRole`);
    requireId(profile.collisionType, `${path}.collisionType`);
    for (const key of ['height', 'thickness', 'maximumSegmentLength']) {
      requireFinite(profile[key], `${path}.${key}`, { positive: true });
    }
    if (profile.presentationKind === 'solid-prism') {
      for (const key of ['textureRepeatMeters', 'textureRepeatHeightMeters']) {
        if (profile[key] != null) {
          requireFinite(profile[key], `${path}.${key}`, { positive: true });
        }
      }
    }
    if (profile.presentationKind === 'alpha-tested-card') {
      requireFinite(
        profile.textureRepeatMeters,
        `${path}.textureRepeatMeters`,
        { positive: true }
      );
      requireFinite(profile.groundOffset, `${path}.groundOffset`);
      if (profile.groundOffset < 0 || profile.groundOffset > 0.1) {
        throw new Error(`${path}.groundOffset must be between 0 and 0.1 metres`);
      }
      requireRecord(profile.destruction, `${path}.destruction`);
      for (const key of [
        'maxHealth',
        'minimumMovingSpeedMps',
        'heavyVehicleMassTonnes',
        'highImpactSpeedMps',
        'momentumThresholdTonneMps',
        'blastDamageScale'
      ]) {
        requireFinite(
          profile.destruction[key],
          `${path}.destruction.${key}`,
          { positive: key === 'maxHealth' || key === 'blastDamageScale' }
        );
        if (profile.destruction[key] < 0) {
          throw new Error(`${path}.destruction.${key} must not be negative`);
        }
      }
      requireId(
        profile.destruction.dataQuality,
        `${path}.destruction.dataQuality`
      );
    }
    if (!Array.isArray(profile.blocks) || profile.blocks.length === 0) {
      throw new Error(`${path}.blocks must be a non-empty array`);
    }
    for (const [index, moverType] of profile.blocks.entries()) {
      if (!['vehicle', 'infantry'].includes(moverType)) {
        throw new Error(`${path}.blocks[${index}] must be vehicle or infantry`);
      }
    }
    if (typeof profile.occludesSight !== 'boolean') {
      throw new Error(`${path}.occludesSight must be boolean`);
    }
    if (profile.blocksProjectiles != null
        && typeof profile.blocksProjectiles !== 'boolean') {
      throw new Error(`${path}.blocksProjectiles must be boolean`);
    }
    if (
      typeof profile.dataQuality !== 'string'
      || profile.dataQuality.trim().length === 0
    ) {
      throw new Error(`${path}.dataQuality requires a non-empty label`);
    }
  }
  return profiles;
}

function requireTuple(value, length, path) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${path} must contain ${length} values`);
  }
  value.forEach((entry, index) => requireFinite(entry, `${path}[${index}]`));
  return value;
}

function requireInsideMap([x, z], dimensions, path) {
  const halfWidth = dimensions.width * 0.5;
  const halfDepth = dimensions.depth * 0.5;
  if (x < -halfWidth || x > halfWidth || z < -halfDepth || z > halfDepth) {
    throw new Error(`${path} lies outside map bounds`);
  }
}

function validateDeploymentZones(zones, dimensions) {
  requireRecord(zones, 'map.deploymentZones');
  const halfWidth = dimensions.width * 0.5;
  const halfDepth = dimensions.depth * 0.5;
  for (const [factionId, bounds] of Object.entries(zones)) {
    requireRecord(bounds, `map.deploymentZones.${factionId}`);
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) {
      requireFinite(bounds[key], `map.deploymentZones.${factionId}.${key}`);
    }
    if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) {
      throw new Error(`map.deploymentZones.${factionId} requires increasing bounds`);
    }
    if (
      bounds.minX < -halfWidth || bounds.maxX > halfWidth
      || bounds.minZ < -halfDepth || bounds.maxZ > halfDepth
    ) {
      throw new Error(`map.deploymentZones.${factionId} lies outside map bounds`);
    }
  }
}

function validateConfiguredMission(mission, dimensions, deploymentZones) {
  if (mission == null) return;
  requireRecord(mission, 'map.configuredMission');
  requireId(mission.id, 'map.configuredMission.id');
  const appliesTo = requireRecord(
    mission.appliesTo,
    'map.configuredMission.appliesTo'
  );
  requireId(
    appliesTo.playerFactionId,
    'map.configuredMission.appliesTo.playerFactionId'
  );
  requireId(
    appliesTo.enemyFactionId,
    'map.configuredMission.appliesTo.enemyFactionId'
  );
  const objective = requireRecord(
    mission.objective,
    'map.configuredMission.objective'
  );
  requireId(objective.id, 'map.configuredMission.objective.id');
  if (objective.type !== 'BREAKTHROUGH') {
    throw new Error('map.configuredMission.objective.type must be BREAKTHROUGH');
  }
  requireId(
    objective.attackerFactionId,
    'map.configuredMission.objective.attackerFactionId'
  );
  requireId(
    objective.defenderFactionId,
    'map.configuredMission.objective.defenderFactionId'
  );
  requireFinite(
    objective.timeLimitSeconds,
    'map.configuredMission.objective.timeLimitSeconds',
    { positive: true }
  );
  requireId(objective.dataQuality, 'map.configuredMission.objective.dataQuality');
  const exitZone = requireRecord(
    objective.exitZone,
    'map.configuredMission.objective.exitZone'
  );
  for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) {
    requireFinite(exitZone[key], `map.configuredMission.objective.exitZone.${key}`);
  }
  if (exitZone.minX >= exitZone.maxX || exitZone.minZ >= exitZone.maxZ) {
    throw new Error('map.configuredMission.objective.exitZone requires increasing bounds');
  }
  requireInsideMap(
    [exitZone.minX, exitZone.minZ],
    dimensions,
    'map.configuredMission.objective.exitZone minimum'
  );
  requireInsideMap(
    [exitZone.maxX, exitZone.maxZ],
    dimensions,
    'map.configuredMission.objective.exitZone maximum'
  );

  const planSet = requireRecord(
    mission.enemyPlanSet,
    'map.configuredMission.enemyPlanSet'
  );
  requireId(planSet.id, 'map.configuredMission.enemyPlanSet.id');
  const factionId = requireId(
    planSet.factionId,
    'map.configuredMission.enemyPlanSet.factionId'
  );
  if (factionId !== objective.attackerFactionId) {
    throw new Error('map configured mission AI faction must match objective attacker');
  }
  requireId(planSet.dataQuality, 'map.configuredMission.enemyPlanSet.dataQuality');
  if (!Array.isArray(planSet.plans) || planSet.plans.length < 2) {
    throw new Error('map.configuredMission.enemyPlanSet requires at least two plans');
  }
  const setupZone = deploymentZones[factionId];
  if (!setupZone) {
    throw new Error(`map configured mission requires deployment zone ${factionId}`);
  }
  for (const [planIndex, plan] of planSet.plans.entries()) {
    const planPath = `map.configuredMission.enemyPlanSet.plans[${planIndex}]`;
    requireId(plan.id, `${planPath}.id`);
    if (!Array.isArray(plan.lanes) || plan.lanes.length === 0) {
      throw new Error(`${planPath}.lanes requires at least one lane`);
    }
    for (const [laneIndex, lane] of plan.lanes.entries()) {
      const lanePath = `${planPath}.lanes[${laneIndex}]`;
      requireId(lane.id, `${lanePath}.id`);
      if (!Array.isArray(lane.setupSlots) || lane.setupSlots.length === 0) {
        throw new Error(`${lanePath}.setupSlots requires points`);
      }
      for (const [pointIndex, point] of lane.setupSlots.entries()) {
        requireTuple(point, 2, `${lanePath}.setupSlots[${pointIndex}]`);
        requireInsideMap(point, dimensions, `${lanePath}.setupSlots[${pointIndex}]`);
        if (
          point[0] < setupZone.minX || point[0] > setupZone.maxX
          || point[1] < setupZone.minZ || point[1] > setupZone.maxZ
        ) {
          throw new Error(`${lanePath}.setupSlots[${pointIndex}] lies outside setup zone`);
        }
      }
      if (!Array.isArray(lane.route) || lane.route.length === 0) {
        throw new Error(`${lanePath}.route requires waypoints`);
      }
      for (const [waypointIndex, waypoint] of lane.route.entries()) {
        requireRecord(waypoint, `${lanePath}.route[${waypointIndex}]`);
        const point = requireTuple(
          waypoint.position,
          2,
          `${lanePath}.route[${waypointIndex}].position`
        );
        requireInsideMap(point, dimensions, `${lanePath}.route[${waypointIndex}]`);
      }
    }
  }
}

function registerFeatureId(ids, record, path) {
  const id = requireId(record?.id, path);
  if (ids.has(id)) throw new Error(`map contains duplicate feature id ${id}`);
  ids.add(id);
}

function validateSurfaceRect(rect, textureResolution, path) {
  const [x, y, width, height] = requireTuple(rect, 4, path);
  if (x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new Error(`${path} requires non-negative origin and positive size`);
  }
  if (x + width > textureResolution[0] || y + height > textureResolution[1]) {
    throw new Error(`${path} lies outside texture bounds`);
  }
}

function pointsEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function orientation(a, b, c) {
  return (
    (b[0] - a[0]) * (c[1] - a[1])
    - (b[1] - a[1]) * (c[0] - a[0])
  );
}

function pointLiesOnSegment(point, start, end) {
  return (
    orientation(start, end, point) === 0
    && point[0] >= Math.min(start[0], end[0])
    && point[0] <= Math.max(start[0], end[0])
    && point[1] >= Math.min(start[1], end[1])
    && point[1] <= Math.max(start[1], end[1])
  );
}

function segmentsIntersect(a, b, c, d) {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  if (
    ((abc > 0 && abd < 0) || (abc < 0 && abd > 0))
    && ((cda > 0 && cdb < 0) || (cda < 0 && cdb > 0))
  ) {
    return true;
  }
  return (
    (abc === 0 && pointLiesOnSegment(c, a, b))
    || (abd === 0 && pointLiesOnSegment(d, a, b))
    || (cda === 0 && pointLiesOnSegment(a, c, d))
    || (cdb === 0 && pointLiesOnSegment(b, c, d))
  );
}

function validateSurfacePolygon(polygon, textureResolution, path) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    throw new Error(`${path} must contain at least three points`);
  }
  polygon.forEach((point, index) => {
    const [u, v] = requireTuple(point, 2, `${path}[${index}]`);
    if (u < 0 || u > textureResolution[0] || v < 0 || v > textureResolution[1]) {
      throw new Error(`${path}[${index}] lies outside texture bounds`);
    }
    const next = polygon[(index + 1) % polygon.length];
    if (Array.isArray(next) && pointsEqual(point, next)) {
      throw new Error(`${path} requires distinct consecutive vertices`);
    }
  });

  for (let first = 0; first < polygon.length; first++) {
    const firstNext = (first + 1) % polygon.length;
    for (let second = first + 1; second < polygon.length; second++) {
      const secondNext = (second + 1) % polygon.length;
      const adjacent = (
        firstNext === second
        || secondNext === first
      );
      if (
        !adjacent
        && segmentsIntersect(
          polygon[first],
          polygon[firstNext],
          polygon[second],
          polygon[secondNext]
        )
      ) {
        throw new Error(`${path} must not self-intersect`);
      }
    }
  }

  const doubledArea = polygon.reduce((area, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (doubledArea === 0) throw new Error(`${path} must have non-zero area`);
}

function validateSurfaceShape(layer, textureResolution, path) {
  const hasRect = Object.hasOwn(layer, 'rect');
  const hasPolygon = Object.hasOwn(layer, 'polygon');
  if (hasRect === hasPolygon) {
    throw new Error(`${path} must declare exactly one shape: rect or polygon`);
  }
  if (hasRect) {
    validateSurfaceRect(layer.rect, textureResolution, `${path}.rect`);
  } else {
    validateSurfacePolygon(layer.polygon, textureResolution, `${path}.polygon`);
  }
}

export function validateMapDescriptor(map) {
  requireRecord(map, 'map');
  requireId(map.id, 'map');

  const dimensions = requireRecord(map.dimensions, 'map.dimensions');
  requireFinite(dimensions.width, 'map.dimensions.width', { positive: true });
  requireFinite(dimensions.depth, 'map.dimensions.depth', { positive: true });
  requirePositiveInteger(dimensions.segments, 'map.dimensions.segments');

  const elevation = requireRecord(map.elevation, 'map.elevation');
  requireFinite(elevation.baseHeight ?? 0, 'map.elevation.baseHeight');
  if (!Array.isArray(elevation.waves) || elevation.waves.length === 0) {
    throw new Error('map.elevation.waves requires at least one wave');
  }
  elevation.waves.forEach((wave, index) => {
    requireRecord(wave, `map.elevation.waves[${index}]`);
    if (!['x', 'z'].includes(wave.axis)) {
      throw new Error(`map.elevation.waves[${index}].axis must be x or z`);
    }
    if (!['sin', 'cos'].includes(wave.function)) {
      throw new Error(`map.elevation.waves[${index}].function must be sin or cos`);
    }
    requireFinite(wave.amplitude, `map.elevation.waves[${index}].amplitude`);
    requireFinite(wave.frequency, `map.elevation.waves[${index}].frequency`);
    requireFinite(wave.phase ?? 0, `map.elevation.waves[${index}].phase`);
  });

  const ids = new Set();
  const surfaces = requireRecord(map.surfaces, 'map.surfaces');
  const textureResolution = requireTuple(
    surfaces.textureResolution,
    2,
    'map.surfaces.textureResolution'
  );
  textureResolution.forEach((value, index) => {
    requirePositiveInteger(value, `map.surfaces.textureResolution[${index}]`);
  });
  requireColor(surfaces.baseColor, 'map.surfaces.baseColor');
  validateMaterial(surfaces.terrainMaterial, 'map.surfaces.terrainMaterial');
  validateRiverBankMaterial(surfaces.riverBankMaterial, 'map.surfaces.riverBankMaterial');
  validateMaterial(surfaces.waterMaterial, 'map.surfaces.waterMaterial', {
    transparent: true
  });
  validateMaterial(surfaces.bridgeRoadMaterial, 'map.surfaces.bridgeRoadMaterial');
  if (!Array.isArray(surfaces.layers)) throw new Error('map.surfaces.layers must be an array');
  surfaces.layers.forEach((layer, index) => {
    const path = `map.surfaces.layers[${index}]`;
    requireRecord(layer, path);
    registerFeatureId(ids, layer, path);
    requireId(layer.kind, `${path}.kind`);
    requireColor(layer.color, `${path}.color`);
    validateSurfaceShape(layer, textureResolution, path);
    if (layer.visualOnly !== true) {
      throw new Error(`${path} must explicitly declare visualOnly`);
    }
  });

  const hasRiver = map.river != null;
  const hasBridge = map.bridge != null;
  if (hasRiver !== hasBridge) {
    throw new Error('map.river and map.bridge must either both exist or both be omitted');
  }
  if (hasRiver) {
    const river = requireRecord(map.river, 'map.river');
    registerFeatureId(ids, river, 'map.river');
    requireFinite(river.centerZ, 'map.river.centerZ');
    for (const key of ['waterWidth', 'cutWidth']) {
      requireFinite(river[key], `map.river.${key}`, { positive: true });
    }
    if (river.cutWidth <= river.waterWidth) {
      throw new Error('map.river.cutWidth must exceed waterWidth');
    }
    requireFinite(river.waterLevel, 'map.river.waterLevel');
    requireFinite(river.bedLevel, 'map.river.bedLevel');
    if (river.floodplainRadius != null) {
      requireFinite(
        river.floodplainRadius,
        'map.river.floodplainRadius',
        { positive: true }
      );
    }
    if (river.bedLevel >= river.waterLevel) {
      throw new Error('map.river.bedLevel must be below waterLevel');
    }
    if (Math.abs(river.centerZ) + river.cutWidth * 0.5 > dimensions.depth * 0.5) {
      throw new Error('map.river lies outside map bounds');
    }

    const bridge = requireRecord(map.bridge, 'map.bridge');
    registerFeatureId(ids, bridge, 'map.bridge');
    requireFinite(bridge.centerX, 'map.bridge.centerX');
    requireFinite(bridge.centerZ, 'map.bridge.centerZ');
    requireFinite(bridge.span, 'map.bridge.span', { positive: true });
    requireFinite(
      bridge.approachLength,
      'map.bridge.approachLength',
      { positive: true }
    );
    if (
      typeof bridge.approachDataQuality !== 'string'
      || bridge.approachDataQuality.trim().length === 0
    ) {
      throw new Error(
        'map.bridge.approachDataQuality requires a non-empty label'
      );
    }
    requireId(bridge.profileId, 'map.bridge.profileId');
    requireInsideMap([bridge.centerX, bridge.centerZ], dimensions, 'map.bridge');
    if (bridge.centerZ !== river.centerZ) {
      throw new Error('map.bridge.centerZ must align with map.river.centerZ');
    }
    if (bridge.span <= river.cutWidth) {
      throw new Error('map.bridge.span must exceed the river cut width');
    }
    if (
      Math.abs(bridge.centerZ)
        + bridge.span * 0.5
        + bridge.approachLength
        > dimensions.depth * 0.5
    ) {
      throw new Error('map.bridge span and approaches lie outside map bounds');
    }
  }

  if (!Array.isArray(map.wallRuns)) throw new Error('map.wallRuns must be an array');
  const wallProfiles = validateWallProfiles(map.wallProfiles);
  map.wallRuns.forEach((wall, index) => {
    requireRecord(wall, `map.wallRuns[${index}]`);
    registerFeatureId(ids, wall, `map.wallRuns[${index}]`);
    const profileId = requireId(wall.profileId, `map.wallRuns[${index}].profileId`);
    if (!wallProfiles[profileId]) {
      throw new Error(
        `map.wallRuns[${index}].profileId references unknown profile ${profileId}`
      );
    }
    const start = requireTuple(wall.start, 2, `map.wallRuns[${index}].start`);
    const end = requireTuple(wall.end, 2, `map.wallRuns[${index}].end`);
    requireInsideMap(start, dimensions, `map.wallRuns[${index}].start`);
    requireInsideMap(end, dimensions, `map.wallRuns[${index}].end`);
    if (start[0] === end[0] && start[1] === end[1]) {
      throw new Error(`map.wallRuns[${index}] requires distinct endpoints`);
    }
  });

  if (!Array.isArray(map.structures)) throw new Error('map.structures must be an array');
  map.structures.forEach((structure, index) => {
    requireRecord(structure, `map.structures[${index}]`);
    registerFeatureId(ids, structure, `map.structures[${index}]`);
    requireId(structure.descriptorId, `map.structures[${index}].descriptorId`);
    requireId(structure.visualAdapterId, `map.structures[${index}].visualAdapterId`);
    if (structure.styleId != null) {
      requireId(structure.styleId, `map.structures[${index}].styleId`);
    }
    if (structure.facadeId != null) {
      requireId(structure.facadeId, `map.structures[${index}].facadeId`);
    }
    if (structure.roofStyleId != null) {
      requireId(structure.roofStyleId, `map.structures[${index}].roofStyleId`);
    }
    if (structure.attachedRowId != null) {
      requireId(structure.attachedRowId, `map.structures[${index}].attachedRowId`);
      if (!Number.isInteger(structure.attachedOrder) || structure.attachedOrder < 0) {
        throw new Error(
          `map.structures[${index}].attachedOrder must be a non-negative integer`
        );
      }
    } else if (structure.attachedOrder != null) {
      throw new Error(
        `map.structures[${index}].attachedOrder requires attachedRowId`
      );
    }
    if (structure.terrainPad != null) {
      requireRecord(structure.terrainPad, `map.structures[${index}].terrainPad`);
      requireFinite(
        structure.terrainPad.footprintMargin,
        `map.structures[${index}].terrainPad.footprintMargin`
      );
      if (structure.terrainPad.footprintMargin < 0) {
        throw new Error(
          `map.structures[${index}].terrainPad.footprintMargin must not be negative`
        );
      }
      requireFinite(
        structure.terrainPad.blendDistance,
        `map.structures[${index}].terrainPad.blendDistance`,
        { positive: true }
      );
      requireId(
        structure.terrainPad.dataQuality,
        `map.structures[${index}].terrainPad.dataQuality`
      );
      if (structure.terrainPad.levelGroupId != null) {
        requireId(
          structure.terrainPad.levelGroupId,
          `map.structures[${index}].terrainPad.levelGroupId`
        );
      }
    }
    requireInsideMap(
      requireTuple(structure.position, 2, `map.structures[${index}].position`),
      dimensions,
      `map.structures[${index}].position`
    );
    requireFinite(structure.rotationY ?? 0, `map.structures[${index}].rotationY`);
    requireFinite(
      structure.foundationClearance ?? 0,
      `map.structures[${index}].foundationClearance`
    );
    normalizeBuildingDestructionThresholds(structure.destructionThresholds, {
      path: `map.structures[${index}].destructionThresholds`
    });
  });

  const structureIds = new Set(map.structures.map(structure => structure.id));
  const wallEnclosures = map.wallEnclosures ?? [];
  if (!Array.isArray(wallEnclosures)) {
    throw new Error('map.wallEnclosures must be an array');
  }
  const enclosureIds = new Set();
  const gateIdsByEnclosure = new Map();
  wallEnclosures.forEach((enclosure, enclosureIndex) => {
    const path = `map.wallEnclosures[${enclosureIndex}]`;
    requireRecord(enclosure, path);
    registerFeatureId(ids, enclosure, path);
    enclosureIds.add(enclosure.id);
    requireId(enclosure.structureId, `${path}.structureId`);
    if (!structureIds.has(enclosure.structureId)) {
      throw new Error(`${path}.structureId references unknown structure ${enclosure.structureId}`);
    }
    requireId(enclosure.kind, `${path}.kind`);
    if (
      typeof enclosure.dataQuality !== 'string'
      || enclosure.dataQuality.trim().length === 0
    ) {
      throw new Error(`${path}.dataQuality requires a non-empty label`);
    }
    if (!Array.isArray(enclosure.gateOpenings) || enclosure.gateOpenings.length === 0) {
      throw new Error(`${path}.gateOpenings must be a non-empty array`);
    }
    const gateIds = new Set();
    enclosure.gateOpenings.forEach((gate, gateIndex) => {
      const gatePath = `${path}.gateOpenings[${gateIndex}]`;
      requireRecord(gate, gatePath);
      registerFeatureId(ids, gate, gatePath);
      gateIds.add(gate.id);
      const start = requireTuple(gate.start, 2, `${gatePath}.start`);
      const end = requireTuple(gate.end, 2, `${gatePath}.end`);
      requireInsideMap(start, dimensions, `${gatePath}.start`);
      requireInsideMap(end, dimensions, `${gatePath}.end`);
      if (start[0] === end[0] && start[1] === end[1]) {
        throw new Error(`${gatePath} requires distinct endpoints`);
      }
    });
    gateIdsByEnclosure.set(enclosure.id, gateIds);
  });
  map.wallRuns.forEach((wall, wallIndex) => {
    const path = `map.wallRuns[${wallIndex}]`;
    if (wallEnclosures.length === 0) return;
    if (wall.enclosureId != null) {
      requireId(wall.enclosureId, `${path}.enclosureId`);
      if (!enclosureIds.has(wall.enclosureId)) {
        throw new Error(`${path}.enclosureId references unknown enclosure ${wall.enclosureId}`);
      }
      requireId(wall.boundarySide, `${path}.boundarySide`);
      if (wall.adjacentGateId != null) {
        requireId(wall.adjacentGateId, `${path}.adjacentGateId`);
        if (!gateIdsByEnclosure.get(wall.enclosureId)?.has(wall.adjacentGateId)) {
          throw new Error(
            `${path}.adjacentGateId references a gate outside enclosure ${wall.enclosureId}`
          );
        }
      }
    }
  });

  if (!Array.isArray(map.foliage)) throw new Error('map.foliage must be an array');
  map.foliage.forEach((entry, index) => {
    requireRecord(entry, `map.foliage[${index}]`);
    registerFeatureId(ids, entry, `map.foliage[${index}]`);
    requireId(entry.profileId, `map.foliage[${index}].profileId`);
    requireInsideMap(
      requireTuple(entry.position, 2, `map.foliage[${index}].position`),
      dimensions,
      `map.foliage[${index}].position`
    );
    if (entry.visualOnly !== true) {
      throw new Error(`map.foliage[${index}] must explicitly declare visualOnly`);
    }
  });
  if (map.foliageRendering != null) {
    const rendering = requireRecord(
      map.foliageRendering,
      'map.foliageRendering'
    );
    if (!['individual', 'instanced'].includes(rendering.mode)) {
      throw new Error(
        'map.foliageRendering.mode must be individual or instanced'
      );
    }
    requireId(rendering.dataQuality, 'map.foliageRendering.dataQuality');
  }

  validateDeploymentZones(map.deploymentZones, dimensions);
  validateConfiguredMission(
    map.configuredMission,
    dimensions,
    map.deploymentZones
  );
  return map;
}

export function defineMapDescriptor(source) {
  const map = clonePlain(source);
  validateMapDescriptor(map);
  return deepFreeze(map);
}
