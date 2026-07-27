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

function registerFeatureId(ids, record, path) {
  const id = requireId(record?.id, path);
  if (ids.has(id)) throw new Error(`map contains duplicate feature id ${id}`);
  ids.add(id);
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
    const [x, y, width, height] = requireTuple(layer.rect, 4, `${path}.rect`);
    if (x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new Error(`${path}.rect requires non-negative origin and positive size`);
    }
    if (x + width > textureResolution[0] || y + height > textureResolution[1]) {
      throw new Error(`${path}.rect lies outside texture bounds`);
    }
    if (layer.visualOnly !== true) {
      throw new Error(`${path} must explicitly declare visualOnly`);
    }
  });

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
  requireId(bridge.profileId, 'map.bridge.profileId');
  requireInsideMap([bridge.centerX, bridge.centerZ], dimensions, 'map.bridge');
  if (bridge.centerZ !== river.centerZ) {
    throw new Error('map.bridge.centerZ must align with map.river.centerZ');
  }
  if (bridge.span <= river.cutWidth) {
    throw new Error('map.bridge.span must exceed the river cut width');
  }
  if (Math.abs(bridge.centerZ) + bridge.span * 0.5 > dimensions.depth * 0.5) {
    throw new Error('map.bridge span lies outside map bounds');
  }

  if (!Array.isArray(map.wallRuns)) throw new Error('map.wallRuns must be an array');
  map.wallRuns.forEach((wall, index) => {
    requireRecord(wall, `map.wallRuns[${index}]`);
    registerFeatureId(ids, wall, `map.wallRuns[${index}]`);
    requireId(wall.profileId, `map.wallRuns[${index}].profileId`);
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

  validateDeploymentZones(map.deploymentZones, dimensions);
  return map;
}

export function defineMapDescriptor(source) {
  const map = clonePlain(source);
  validateMapDescriptor(map);
  return deepFreeze(map);
}
