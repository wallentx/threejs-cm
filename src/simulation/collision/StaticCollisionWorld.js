const EPSILON = 1e-9;
const CONTACT_EPSILON = 1e-5;
const DEFAULT_ITERATIONS = 4;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeRecord(record) {
  if (!record?.id) throw new Error('Static collider requires a stable id');
  const centerX = finite(record.centerX, (finite(record.minX) + finite(record.maxX)) * 0.5);
  const centerZ = finite(record.centerZ, (finite(record.minZ) + finite(record.maxZ)) * 0.5);
  const halfX = Math.max(
    0,
    finite(record.halfX, Math.abs(finite(record.maxX) - finite(record.minX)) * 0.5)
  );
  const halfZ = Math.max(
    0,
    finite(record.halfZ, Math.abs(finite(record.maxZ) - finite(record.minZ)) * 0.5)
  );
  return {
    ...record,
    id: String(record.id),
    centerX,
    centerZ,
    halfX,
    halfZ,
    rotation: finite(record.rotation),
    enabled: record.enabled !== false,
    blocks: [...(record.blocks ?? ['vehicle', 'infantry'])].sort()
  };
}

function blocksMover(record, moverType) {
  return record.enabled !== false && record.blocks.includes(moverType);
}

function toLocal(record, x, z) {
  const cosine = Math.cos(record.rotation);
  const sine = Math.sin(record.rotation);
  const dx = x - record.centerX;
  const dz = z - record.centerZ;
  return {
    x: cosine * dx - sine * dz,
    z: sine * dx + cosine * dz
  };
}

function vectorToLocal(record, x, z) {
  const cosine = Math.cos(record.rotation);
  const sine = Math.sin(record.rotation);
  return {
    x: cosine * x - sine * z,
    z: sine * x + cosine * z
  };
}

function vectorToWorld(record, x, z) {
  const cosine = Math.cos(record.rotation);
  const sine = Math.sin(record.rotation);
  return {
    x: cosine * x + sine * z,
    z: -sine * x + cosine * z
  };
}

function circlePenetration(position, radius, record) {
  const local = toLocal(record, position.x, position.z);
  const halfX = record.halfX + radius;
  const halfZ = record.halfZ + radius;
  if (local.x < -halfX || local.x > halfX || local.z < -halfZ || local.z > halfZ) {
    return null;
  }

  const faces = [
    { depth: local.x + halfX, x: -1, z: 0 },
    { depth: halfX - local.x, x: 1, z: 0 },
    { depth: local.z + halfZ, x: 0, z: -1 },
    { depth: halfZ - local.z, x: 0, z: 1 }
  ];
  faces.sort((a, b) => a.depth - b.depth);
  const nearest = faces[0];
  const normal = vectorToWorld(record, nearest.x, nearest.z);
  return {
    depth: Math.max(0, nearest.depth),
    normalX: normal.x,
    normalZ: normal.z
  };
}

function sweepCircleAgainstRecord(start, displacement, radius, record) {
  const origin = toLocal(record, start.x, start.z);
  const delta = vectorToLocal(record, displacement.x, displacement.z);
  const halfX = record.halfX + radius;
  const halfZ = record.halfZ + radius;
  let nearTime = 0;
  let farTime = 1;
  let normalX = 0;
  let normalZ = 0;

  for (const axis of [
    { origin: origin.x, delta: delta.x, half: halfX, x: 1, z: 0 },
    { origin: origin.z, delta: delta.z, half: halfZ, x: 0, z: 1 }
  ]) {
    if (Math.abs(axis.delta) <= EPSILON) {
      if (axis.origin < -axis.half || axis.origin > axis.half) return null;
      continue;
    }
    const first = (-axis.half - axis.origin) / axis.delta;
    const second = (axis.half - axis.origin) / axis.delta;
    const axisNear = Math.min(first, second);
    const axisFar = Math.max(first, second);
    if (axisNear > nearTime) {
      nearTime = axisNear;
      const sign = first < second ? -1 : 1;
      normalX = axis.x * sign;
      normalZ = axis.z * sign;
    }
    farTime = Math.min(farTime, axisFar);
    if (nearTime - farTime > EPSILON) return null;
  }

  if (nearTime < -EPSILON || nearTime > 1 + EPSILON || farTime < -EPSILON) return null;
  const normal = vectorToWorld(record, normalX, normalZ);
  if (displacement.x * normal.x + displacement.z * normal.z >= -EPSILON) return null;
  return {
    time: Math.max(0, Math.min(1, nearTime)),
    normalX: normal.x,
    normalZ: normal.z
  };
}

function rotateOffset(offset, rotation) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: cosine * finite(offset.x) + sine * finite(offset.z),
    z: -sine * finite(offset.x) + cosine * finite(offset.z)
  };
}

function compareHits(a, b) {
  if (Math.abs(a.time - b.time) > EPSILON) return a.time - b.time;
  if (a.colliderId !== b.colliderId) return a.colliderId < b.colliderId ? -1 : 1;
  return a.offsetIndex - b.offsetIndex;
}

/**
 * Deterministic, renderer-independent static-world collision queries.
 *
 * Colliders are finite oriented rectangles in the X/Z plane. Movement is
 * represented by one circle (infantry) or a fixed-orientation chain of circles
 * (vehicle capsule). No frame clock or random source participates.
 */
export class StaticCollisionWorld {
  constructor(records = [], navigationRecords = []) {
    this.colliders = new Map();
    this.navigationRecords = [];
    this.setRecords(records);
    this.setNavigationRecords(navigationRecords);
  }

  setRecords(records) {
    this.colliders.clear();
    for (const record of records) this.upsertCollider(record);
  }

  setNavigationRecords(records) {
    this.navigationRecords = records
      .map(record => ({ ...record, id: String(record.id) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  upsertCollider(record) {
    const normalized = normalizeRecord(record);
    this.colliders.set(normalized.id, normalized);
    return normalized;
  }

  removeCollider(id) {
    return this.colliders.delete(String(id));
  }

  getCollider(id) {
    return this.colliders.get(String(id)) ?? null;
  }

  getRecords() {
    return [...this.colliders.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(record => ({ ...record, blocks: [...record.blocks] }));
  }

  getNavigationTarget(start, goal, radius = 0, moverType = 'vehicle') {
    for (const crossing of this.navigationRecords) {
      if (crossing.type !== 'bridge_crossing'
          || !(crossing.blocks ?? ['vehicle', 'infantry']).includes(moverType)) continue;
      const southEdge = Math.min(crossing.minZ, crossing.maxZ);
      const northEdge = Math.max(crossing.minZ, crossing.maxZ);
      const margin = Math.max(0.25, radius + 0.2);
      const southToNorth = start.z < southEdge && goal.z > northEdge;
      const northToSouth = start.z > northEdge && goal.z < southEdge;
      const continuingNorth = start.z >= southEdge && start.z <= northEdge + margin
        && goal.z > northEdge;
      const continuingSouth = start.z <= northEdge && start.z >= southEdge - margin
        && goal.z < southEdge;

      if (southToNorth) {
        const entryZ = southEdge - margin;
        const centered = Math.abs(start.x - crossing.centerX)
          <= Math.max(0.2, crossing.halfOpeningWidth - radius);
        if (!centered || start.z < entryZ - CONTACT_EPSILON) {
          return { x: crossing.centerX, z: entryZ, routed: true, crossingId: crossing.id };
        }
        return {
          x: crossing.centerX,
          z: northEdge + margin,
          routed: true,
          crossingId: crossing.id
        };
      }
      if (northToSouth) {
        const entryZ = northEdge + margin;
        const centered = Math.abs(start.x - crossing.centerX)
          <= Math.max(0.2, crossing.halfOpeningWidth - radius);
        if (!centered || start.z > entryZ + CONTACT_EPSILON) {
          return { x: crossing.centerX, z: entryZ, routed: true, crossingId: crossing.id };
        }
        return {
          x: crossing.centerX,
          z: southEdge - margin,
          routed: true,
          crossingId: crossing.id
        };
      }
      if (continuingNorth) {
        const exitZ = northEdge + margin;
        if (start.z < exitZ - CONTACT_EPSILON) {
          return { x: crossing.centerX, z: exitZ, routed: true, crossingId: crossing.id };
        }
        return { x: goal.x, z: goal.z, routed: false, crossingId: null };
      }
      if (continuingSouth) {
        const exitZ = southEdge - margin;
        if (start.z > exitZ + CONTACT_EPSILON) {
          return { x: crossing.centerX, z: exitZ, routed: true, crossingId: crossing.id };
        }
        return { x: goal.x, z: goal.z, routed: false, crossingId: null };
      }
    }
    return { x: goal.x, z: goal.z, routed: false, crossingId: null };
  }

  resolveCircleMotion(position, displacement, radius, options = {}) {
    return this.resolveFootprintMotion(position, displacement, {
      ...options,
      radius,
      offsets: [{ x: 0, z: 0 }],
      rotation: 0
    });
  }

  resolveFootprintMotion(position, displacement, options = {}) {
    const moverType = options.moverType ?? 'vehicle';
    const radius = Math.max(0, finite(options.radius));
    const rotation = finite(options.rotation);
    const offsets = (options.offsets?.length ? options.offsets : [{ x: 0, z: 0 }])
      .map(offset => rotateOffset(offset, rotation));
    const ignored = new Set((options.ignoreColliderIds ?? []).map(String));
    const records = [...this.colliders.values()]
      .filter(record => blocksMover(record, moverType) && !ignored.has(record.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    const resolved = { x: finite(position.x), z: finite(position.z) };
    const contacts = [];

    // Deterministically recover a footprint restored or deployed slightly
    // inside a static obstacle before resolving its requested motion.
    for (let pass = 0; pass < DEFAULT_ITERATIONS; pass++) {
      let best = null;
      for (let offsetIndex = 0; offsetIndex < offsets.length; offsetIndex++) {
        const offset = offsets[offsetIndex];
        const center = { x: resolved.x + offset.x, z: resolved.z + offset.z };
        for (const record of records) {
          const penetration = circlePenetration(center, radius, record);
          if (!penetration || penetration.depth <= CONTACT_EPSILON) continue;
          const candidate = { ...penetration, colliderId: record.id, offsetIndex };
          if (!best || candidate.depth < best.depth - EPSILON
              || (Math.abs(candidate.depth - best.depth) <= EPSILON
                && candidate.colliderId < best.colliderId)) {
            best = candidate;
          }
        }
      }
      if (!best) break;
      resolved.x += best.normalX * (best.depth + CONTACT_EPSILON);
      resolved.z += best.normalZ * (best.depth + CONTACT_EPSILON);
      contacts.push(best);
    }

    let remaining = { x: finite(displacement.x), z: finite(displacement.z) };
    for (let iteration = 0; iteration < (options.maxIterations ?? DEFAULT_ITERATIONS); iteration++) {
      const distance = Math.hypot(remaining.x, remaining.z);
      if (distance <= CONTACT_EPSILON) break;
      const hits = [];
      for (let offsetIndex = 0; offsetIndex < offsets.length; offsetIndex++) {
        const offset = offsets[offsetIndex];
        const center = { x: resolved.x + offset.x, z: resolved.z + offset.z };
        for (const record of records) {
          const hit = sweepCircleAgainstRecord(center, remaining, radius, record);
          if (hit) hits.push({ ...hit, colliderId: record.id, offsetIndex });
        }
      }
      if (hits.length === 0) {
        resolved.x += remaining.x;
        resolved.z += remaining.z;
        remaining = { x: 0, z: 0 };
        break;
      }

      hits.sort(compareHits);
      const hit = hits[0];
      const safeTime = Math.max(0, hit.time - CONTACT_EPSILON / distance);
      resolved.x += remaining.x * safeTime;
      resolved.z += remaining.z * safeTime;
      const remainingScale = Math.max(0, 1 - hit.time);
      remaining.x *= remainingScale;
      remaining.z *= remainingScale;
      const inward = remaining.x * hit.normalX + remaining.z * hit.normalZ;
      if (inward < 0) {
        remaining.x -= hit.normalX * inward;
        remaining.z -= hit.normalZ * inward;
      }
      contacts.push(hit);
    }

    return {
      x: resolved.x,
      z: resolved.z,
      movedX: resolved.x - finite(position.x),
      movedZ: resolved.z - finite(position.z),
      blocked: contacts.length > 0,
      contacts
    };
  }
}

export function createCapsuleOffsets(length, radius) {
  const halfLength = Math.max(radius, finite(length) * 0.5);
  const usableHalfLength = Math.max(0, halfLength - radius);
  if (usableHalfLength <= EPSILON) return [{ x: 0, z: 0 }];
  const spacing = Math.max(radius, radius * 1.5);
  const count = Math.max(2, Math.ceil((usableHalfLength * 2) / spacing) + 1);
  const offsets = [];
  for (let index = 0; index < count; index++) {
    offsets.push({
      x: 0,
      z: -usableHalfLength + (usableHalfLength * 2 * index) / (count - 1)
    });
  }
  return offsets;
}
