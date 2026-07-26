const DEFAULT_BLOCKS = Object.freeze(['vehicle', 'infantry', 'projectile']);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeBuildingTransform(transform = {}) {
  const position = Array.isArray(transform.position)
    ? transform.position
    : [transform.x, transform.y, transform.z];
  return {
    position: [
      finite(position?.[0]),
      finite(position?.[1]),
      finite(position?.[2])
    ],
    rotationY: finite(transform.rotationY)
  };
}

export function localToWorldPoint(point, transform = {}) {
  const normalized = normalizeBuildingTransform(transform);
  const [px, py, pz] = normalized.position;
  const x = finite(point?.[0]);
  const y = finite(point?.[1]);
  const z = finite(point?.[2]);
  const cosine = Math.cos(normalized.rotationY);
  const sine = Math.sin(normalized.rotationY);
  return [
    px + x * cosine + z * sine,
    py + y,
    pz - x * sine + z * cosine
  ];
}

export function worldToLocalPoint(point, transform = {}) {
  const normalized = normalizeBuildingTransform(transform);
  const x = finite(point?.[0]) - normalized.position[0];
  const y = finite(point?.[1]) - normalized.position[1];
  const z = finite(point?.[2]) - normalized.position[2];
  const cosine = Math.cos(normalized.rotationY);
  const sine = Math.sin(normalized.rotationY);
  return [
    x * cosine - z * sine,
    y,
    x * sine + z * cosine
  ];
}

export function transformColliderPart(part, transform, identity = {}) {
  const center = localToWorldPoint(part.center, transform);
  const halfExtents = part.halfExtents;
  const halfX = halfExtents[0];
  const halfZ = halfExtents[2];
  const normalized = normalizeBuildingTransform(transform);
  return {
    id: identity.id ?? String(part.id),
    buildingId: identity.buildingId ?? null,
    sectionId: identity.sectionId ?? null,
    partId: String(part.id),
    kind: identity.kind ?? 'building',
    type: identity.kind ?? 'building',
    centerX: center[0],
    centerY: center[1],
    centerZ: center[2],
    halfX,
    halfZ,
    halfWidth: halfX,
    halfHeight: halfExtents[1],
    halfDepth: halfZ,
    minY: center[1] - halfExtents[1],
    maxY: center[1] + halfExtents[1],
    rotation: normalized.rotationY + finite(part.rotationY),
    blocks: [...(part.blocks ?? DEFAULT_BLOCKS)]
  };
}
