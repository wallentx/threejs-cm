import { intersectSegmentOrientedBox3D } from '../geometry/OrientedBox.js';

const EPSILON = 1e-8;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function vector(value) {
  return [
    finite(value?.[0] ?? value?.x),
    finite(value?.[1] ?? value?.y),
    finite(value?.[2] ?? value?.z)
  ];
}

function rotateLocalXZ(x, z, rotation) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: cosine * x + sine * z,
    z: -sine * x + cosine * z
  };
}

function worldCollider(unit, volume) {
  const hullRotation = finite(unit?.rotation);
  const turretRotation = volume.followsTurret
    ? finite(unit?.vehicleWeapon?.turretYaw)
    : 0;
  const rotation = hullRotation + turretRotation + finite(volume.rotation);
  const center = volume.center ?? [0, 0, 0];
  const pivotOffset = rotateLocalXZ(finite(center[0]), finite(center[2]), hullRotation);
  const offset = volume.offset ?? [0, 0, 0];
  const partOffset = rotateLocalXZ(finite(offset[0]), finite(offset[2]), rotation);
  const halfExtents = volume.halfExtents ?? [0, 0, 0];
  return {
    centerX: finite(unit?.position?.x) + pivotOffset.x + partOffset.x,
    centerY: finite(unit?.position?.y) + finite(center[1]) + finite(offset[1]),
    centerZ: finite(unit?.position?.z) + pivotOffset.z + partOffset.z,
    rotation,
    halfWidth: finite(halfExtents[0]),
    halfHeight: finite(halfExtents[1]),
    halfDepth: finite(halfExtents[2])
  };
}

function pointAlong(start, direction, distance) {
  return [
    start[0] + direction[0] * distance,
    start[1] + direction[1] * distance,
    start[2] + direction[2] * distance
  ];
}

/**
 * Traces a successful penetration through immutable model-local crew/module
 * bounds. Geometry remains renderer-neutral and results use stable catalog IDs.
 */
export function traceVehicleInternalPath({
  unit,
  impactPoint,
  direction,
  maxDistanceMeters = null
}) {
  const layout = unit?.vehicleSpec?.internalLayout;
  if (!layout?.volumes?.length) return [];

  const origin = vector(impactPoint);
  const incoming = vector(direction);
  const magnitude = Math.hypot(...incoming);
  if (magnitude <= EPSILON) return [];
  const normalized = incoming.map(component => component / magnitude);
  const entryOffset = Math.max(0, finite(layout.entryOffsetMeters, 0.01));
  const requestedDistance = maxDistanceMeters == null
    ? finite(layout.maxPathMeters, 0)
    : finite(maxDistanceMeters, finite(layout.maxPathMeters, 0));
  const maxDistance = Math.max(
    entryOffset,
    requestedDistance
  );
  if (maxDistance <= entryOffset + EPSILON) return [];

  const start = pointAlong(origin, normalized, entryOffset);
  const end = pointAlong(origin, normalized, maxDistance);
  const segmentLength = maxDistance - entryOffset;
  const hits = [];

  for (const volume of layout.volumes) {
    const collider = worldCollider(unit, volume);
    const entry = intersectSegmentOrientedBox3D(start, end, collider);
    if (!entry) continue;
    const reverseEntry = intersectSegmentOrientedBox3D(end, start, collider);
    const entryDistanceMeters = entryOffset + entry.t * segmentLength;
    const exitDistanceMeters = reverseEntry
      ? entryOffset + (1 - reverseEntry.t) * segmentLength
      : entryDistanceMeters;
    hits.push({
      id: volume.id,
      kind: volume.kind,
      componentId: volume.componentId ?? null,
      crewRoles: volume.crewRoles ? [...volume.crewRoles] : [],
      entryPoint: [...entry.point],
      exitPoint: reverseEntry ? [...reverseEntry.point] : [...entry.point],
      entryDistanceMeters,
      exitDistanceMeters: Math.max(entryDistanceMeters, exitDistanceMeters),
      pathLengthMeters: Math.max(0, exitDistanceMeters - entryDistanceMeters),
      followsTurret: Boolean(volume.followsTurret),
      dataQuality: volume.dataQuality ?? layout.dataQuality ?? 'unspecified',
      layoutVersion: layout.version,
      layoutDataQuality: layout.dataQuality,
      referenceUrl: volume.referenceUrl ?? layout.referenceUrl ?? null
    });
  }

  return hits.sort((a, b) =>
    a.entryDistanceMeters - b.entryDistanceMeters
      || a.id.localeCompare(b.id));
}
