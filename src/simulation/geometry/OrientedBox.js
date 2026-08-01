const EPSILON = 1e-7;
export const ORIENTED_BOX_WORLD_AABB_EPSILON = 1e-7;
const ORIENTATION_ORTHONORMAL_EPSILON = 1e-6;

function component(point, axis) {
  if (Array.isArray(point)) return Number(point[axis]) || 0;
  return Number(point?.[['x', 'y', 'z'][axis]]) || 0;
}

/**
 * Derive a conservative world-space AABB for the exact oriented-box record.
 * A malformed record returns null so broadphase consumers can fail open.
 */
export function deriveOrientedBoxWorldAabb3D(collider) {
  const centerX = collider?.centerX;
  const centerY = collider?.centerY;
  const centerZ = collider?.centerZ;
  const halfWidth = collider?.halfWidth ?? collider?.halfX;
  const halfHeight = collider?.halfHeight;
  const halfDepth = collider?.halfDepth ?? collider?.halfZ;
  if (!Number.isFinite(centerX)
      || !Number.isFinite(centerY)
      || !Number.isFinite(centerZ)
      || !Number.isFinite(halfWidth)
      || !Number.isFinite(halfHeight)
      || !Number.isFinite(halfDepth)
      || halfWidth <= 0
      || halfHeight <= 0
      || halfDepth <= 0) {
    return null;
  }

  let o0;
  let o1;
  let o2;
  let o3;
  let o4;
  let o5;
  let o6;
  let o7;
  let o8;
  if (Array.isArray(collider.orientation)
      && collider.orientation.length === 9) {
    [o0, o1, o2, o3, o4, o5, o6, o7, o8] = collider.orientation;
    if (!Number.isFinite(o0)
        || !Number.isFinite(o1)
        || !Number.isFinite(o2)
        || !Number.isFinite(o3)
        || !Number.isFinite(o4)
        || !Number.isFinite(o5)
        || !Number.isFinite(o6)
        || !Number.isFinite(o7)
        || !Number.isFinite(o8)) {
      return null;
    }
    const column0LengthSquared = o0 * o0 + o3 * o3 + o6 * o6;
    const column1LengthSquared = o1 * o1 + o4 * o4 + o7 * o7;
    const column2LengthSquared = o2 * o2 + o5 * o5 + o8 * o8;
    const column01Dot = o0 * o1 + o3 * o4 + o6 * o7;
    const column02Dot = o0 * o2 + o3 * o5 + o6 * o8;
    const column12Dot = o1 * o2 + o4 * o5 + o7 * o8;
    if (Math.abs(column0LengthSquared - 1) > ORIENTATION_ORTHONORMAL_EPSILON
        || Math.abs(column1LengthSquared - 1) > ORIENTATION_ORTHONORMAL_EPSILON
        || Math.abs(column2LengthSquared - 1) > ORIENTATION_ORTHONORMAL_EPSILON
        || Math.abs(column01Dot) > ORIENTATION_ORTHONORMAL_EPSILON
        || Math.abs(column02Dot) > ORIENTATION_ORTHONORMAL_EPSILON
        || Math.abs(column12Dot) > ORIENTATION_ORTHONORMAL_EPSILON) {
      return null;
    }
  } else {
    const rotation = collider.rotation ?? 0;
    if (!Number.isFinite(rotation)) return null;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    o0 = cosine;
    o1 = 0;
    o2 = sine;
    o3 = 0;
    o4 = 1;
    o5 = 0;
    o6 = -sine;
    o7 = 0;
    o8 = cosine;
  }

  const extentX = Math.abs(o0) * halfWidth
    + Math.abs(o1) * halfHeight
    + Math.abs(o2) * halfDepth;
  const extentY = Math.abs(o3) * halfWidth
    + Math.abs(o4) * halfHeight
    + Math.abs(o5) * halfDepth;
  const extentZ = Math.abs(o6) * halfWidth
    + Math.abs(o7) * halfHeight
    + Math.abs(o8) * halfDepth;
  if (!Number.isFinite(extentX)
      || !Number.isFinite(extentY)
      || !Number.isFinite(extentZ)) {
    return null;
  }
  const padding = ORIENTED_BOX_WORLD_AABB_EPSILON;
  return {
    minX: centerX - extentX - padding,
    maxX: centerX + extentX + padding,
    minY: centerY - extentY - padding,
    maxY: centerY + extentY + padding,
    minZ: centerZ - extentZ - padding,
    maxZ: centerZ + extentZ + padding
  };
}

/**
 * Allocation-free inclusive slab test for a finite world-space segment.
 * Invalid inputs return true so a broadphase caller retains exact testing.
 */
export function segmentIntersectsWorldAabb3D(start, end, bounds) {
  const startX = Array.isArray(start) ? start[0] : start?.x;
  const startY = Array.isArray(start) ? start[1] : start?.y;
  const startZ = Array.isArray(start) ? start[2] : start?.z;
  const endX = Array.isArray(end) ? end[0] : end?.x;
  const endY = Array.isArray(end) ? end[1] : end?.y;
  const endZ = Array.isArray(end) ? end[2] : end?.z;
  if (!Number.isFinite(startX)
      || !Number.isFinite(startY)
      || !Number.isFinite(startZ)
      || !Number.isFinite(endX)
      || !Number.isFinite(endY)
      || !Number.isFinite(endZ)
      || !Number.isFinite(bounds?.minX)
      || !Number.isFinite(bounds?.maxX)
      || !Number.isFinite(bounds?.minY)
      || !Number.isFinite(bounds?.maxY)
      || !Number.isFinite(bounds?.minZ)
      || !Number.isFinite(bounds?.maxZ)
      || bounds.minX > bounds.maxX
      || bounds.minY > bounds.maxY
      || bounds.minZ > bounds.maxZ) {
    return true;
  }

  const directionX = endX - startX;
  const directionY = endY - startY;
  const directionZ = endZ - startZ;
  let entry = 0;
  let exit = 1;
  for (let axis = 0; axis < 3; axis++) {
    const origin = axis === 0 ? startX : axis === 1 ? startY : startZ;
    const direction = axis === 0
      ? directionX
      : axis === 1 ? directionY : directionZ;
    const minimum = axis === 0
      ? bounds.minX
      : axis === 1 ? bounds.minY : bounds.minZ;
    const maximum = axis === 0
      ? bounds.maxX
      : axis === 1 ? bounds.maxY : bounds.maxZ;
    if (Math.abs(direction) <= 1e-12) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const inverse = 1 / direction;
    let near = (minimum - origin) * inverse;
    let far = (maximum - origin) * inverse;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    if (near > entry) entry = near;
    if (far < exit) exit = far;
    // The exact OBB primitive accepts normalized slab gaps up to EPSILON.
    // Matching that tolerance here is required for a conservative rejection.
    if (entry - exit > EPSILON) return false;
  }
  return exit >= 0 && entry <= 1;
}

/**
 * Renderer-neutral segment query against a Y-axis-oriented 3D box.
 * Returns normalized segment time plus plain world-space point and normal.
 */
export function intersectSegmentOrientedBox3D(start, end, collider) {
  const cosine = Math.cos(collider.rotation ?? 0);
  const sine = Math.sin(collider.rotation ?? 0);
  const orientation = Array.isArray(collider.orientation)
    && collider.orientation.length === 9
    ? collider.orientation
    : [
        cosine, 0, sine,
        0, 1, 0,
        -sine, 0, cosine
      ];
  const center = [
    Number(collider.centerX) || 0,
    Number(collider.centerY) || 0,
    Number(collider.centerZ) || 0
  ];
  const toLocal = point => {
    const x = component(point, 0) - center[0];
    const y = component(point, 1) - center[1];
    const z = component(point, 2) - center[2];
    return [
      orientation[0] * x + orientation[3] * y + orientation[6] * z,
      orientation[1] * x + orientation[4] * y + orientation[7] * z,
      orientation[2] * x + orientation[5] * y + orientation[8] * z
    ];
  };
  const localStart = toLocal(start);
  const localEnd = toLocal(end);
  const direction = localEnd.map((value, axis) => value - localStart[axis]);
  const halfExtents = [
    collider.halfWidth ?? collider.halfX,
    collider.halfHeight,
    collider.halfDepth ?? collider.halfZ
  ];
  let entry = 0;
  let exit = 1;
  let entryAxis = -1;
  let entrySign = 0;

  for (let axis = 0; axis < 3; axis++) {
    const half = halfExtents[axis];
    if (!Number.isFinite(half) || half <= 0) return null;
    if (Math.abs(direction[axis]) <= 1e-12) {
      if (localStart[axis] < -half || localStart[axis] > half) return null;
      continue;
    }
    let near = (-half - localStart[axis]) / direction[axis];
    let far = (half - localStart[axis]) / direction[axis];
    let nearSign = -1;
    if (near > far) {
      [near, far] = [far, near];
      nearSign = 1;
    }
    if (near > entry) {
      entry = near;
      entryAxis = axis;
      entrySign = nearSign;
    }
    exit = Math.min(exit, far);
    if (entry - exit > EPSILON) return null;
  }
  if (exit < 0 || entry > 1) return null;

  const t = Math.max(0, Math.min(1, entry));
  const worldStart = [component(start, 0), component(start, 1), component(start, 2)];
  const worldEnd = [component(end, 0), component(end, 1), component(end, 2)];
  const point = worldStart.map((value, axis) =>
    value + (worldEnd[axis] - value) * t);
  let normal;
  if (entryAxis < 0) {
    const dx = worldStart[0] - worldEnd[0];
    const dy = worldStart[1] - worldEnd[1];
    const dz = worldStart[2] - worldEnd[2];
    const length = Math.hypot(dx, dy, dz) || 1;
    normal = [dx / length, dy / length, dz / length];
  } else if (entryAxis === 0) {
    normal = [
      entrySign * orientation[0],
      entrySign * orientation[3],
      entrySign * orientation[6]
    ];
  } else if (entryAxis === 1) {
    normal = [
      entrySign * orientation[1],
      entrySign * orientation[4],
      entrySign * orientation[7]
    ];
  } else {
    normal = [
      entrySign * orientation[2],
      entrySign * orientation[5],
      entrySign * orientation[8]
    ];
  }
  return { t, point, normal };
}
