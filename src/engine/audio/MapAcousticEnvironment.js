import { getAcousticEnvironmentProfile } from './BattlefieldAcoustics.js';

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    const crosses = (yi > y) !== (yj > y)
      && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function toArray3(position) {
  if (Array.isArray(position)) return position;
  if (position?.toArray) return position.toArray();
  return [position?.x ?? 0, position?.y ?? 0, position?.z ?? 0];
}

function insideStructure(position, structure, descriptor) {
  if (!descriptor?.bounds || !Array.isArray(structure?.position)) return false;
  const [x, y, z] = toArray3(position);
  const dx = x - structure.position[0];
  const dz = z - structure.position[1];
  const angle = -(structure.rotationY ?? 0);
  const localX = dx * Math.cos(angle) - dz * Math.sin(angle);
  const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
  const min = descriptor.bounds.min;
  const max = descriptor.bounds.max;
  return localX >= min[0] && localX <= max[0]
    && localZ >= min[2] && localZ <= max[2]
    && y >= min[1] && y <= max[1] + (structure.foundationClearance ?? 0.2);
}

function classifyInterior(structure, descriptor) {
  const identity = `${structure.id} ${structure.descriptorId} ${descriptor.id} ${descriptor.title ?? ''}`
    .toLowerCase();
  if (identity.includes('church') || identity.includes('chapel')) return 'church';
  const width = descriptor.bounds.max[0] - descriptor.bounds.min[0];
  const depth = descriptor.bounds.max[2] - descriptor.bounds.min[2];
  return width * depth > 130 ? 'largeBuilding' : 'smallRoom';
}

export function createMapAcousticEnvironmentResolver({
  mapDescriptor,
  buildingDescriptors = []
} = {}) {
  const descriptorById = new Map(
    buildingDescriptors.map(descriptor => [descriptor.id, descriptor])
  );
  const structures = mapDescriptor?.structures ?? [];
  const layers = mapDescriptor?.surfaces?.layers ?? [];
  const width = mapDescriptor?.dimensions?.width ?? 1;
  const depth = mapDescriptor?.dimensions?.depth ?? 1;
  const [textureWidth, textureHeight] = mapDescriptor?.surfaces?.textureResolution
    ?? [width, depth];

  return position => {
    const [x, y, z] = toArray3(position);
    for (const structure of structures) {
      const descriptor = descriptorById.get(structure.descriptorId);
      if (insideStructure([x, y, z], structure, descriptor)) {
        return getAcousticEnvironmentProfile(classifyInterior(structure, descriptor));
      }
    }

    const pixelX = ((x + width * 0.5) / width) * textureWidth;
    const pixelY = ((depth * 0.5 - z) / depth) * textureHeight;
    for (let index = layers.length - 1; index >= 0; index--) {
      const layer = layers[index];
      if (!Array.isArray(layer.polygon) || !pointInPolygon(pixelX, pixelY, layer.polygon)) {
        continue;
      }
      if (/wood|forest|orchard/.test(String(layer.kind))) {
        return getAcousticEnvironmentProfile('forest');
      }
    }

    let nearby = 0;
    let attached = 0;
    for (const structure of structures) {
      const sx = structure.position?.[0];
      const sz = structure.position?.[1];
      if (!Number.isFinite(sx) || !Number.isFinite(sz)) continue;
      if (Math.hypot(x - sx, z - sz) > 38) continue;
      nearby++;
      if (structure.attachedRowId) attached++;
    }
    if (attached >= 3 || nearby >= 8) {
      return getAcousticEnvironmentProfile('urbanStreet');
    }
    if (nearby >= 2) return getAcousticEnvironmentProfile('village');
    return getAcousticEnvironmentProfile('openField');
  };
}
