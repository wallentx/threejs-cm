const EPSILON = 1e-7;

function component(point, axis) {
  if (Array.isArray(point)) return Number(point[axis]) || 0;
  return Number(point?.[['x', 'y', 'z'][axis]]) || 0;
}

/**
 * Renderer-neutral segment query against a Y-axis-oriented 3D box.
 * Returns normalized segment time plus plain world-space point and normal.
 */
export function intersectSegmentOrientedBox3D(start, end, collider) {
  const cosine = Math.cos(collider.rotation ?? 0);
  const sine = Math.sin(collider.rotation ?? 0);
  const center = [
    Number(collider.centerX) || 0,
    Number(collider.centerY) || 0,
    Number(collider.centerZ) || 0
  ];
  const toLocal = point => {
    const x = component(point, 0) - center[0];
    const z = component(point, 2) - center[2];
    return [
      x * cosine - z * sine,
      component(point, 1) - center[1],
      x * sine + z * cosine
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
    normal = [entrySign * cosine, 0, -entrySign * sine];
  } else if (entryAxis === 1) {
    normal = [0, entrySign, 0];
  } else {
    normal = [entrySign * sine, 0, entrySign * cosine];
  }
  return { t, point, normal };
}

