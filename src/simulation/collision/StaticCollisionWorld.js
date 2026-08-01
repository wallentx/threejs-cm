const EPSILON = 1e-9;
const CONTACT_EPSILON = 1e-5;
const DEFAULT_ITERATIONS = 4;
const DEFAULT_ROUTE_CLEARANCE = 0.08;
const ROUTE_VERTEX_MARGIN = 1e-3;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeRecord(record) {
  if (!record?.id) throw new Error('Static collider requires a stable id');
  const centerX = finite(record.centerX, (finite(record.minX) + finite(record.maxX)) * 0.5);
  const centerZ = finite(record.centerZ, (finite(record.minZ) + finite(record.maxZ)) * 0.5);
  const halfX = Math.max(
    0,
    finite(
      record.halfX,
      finite(record.halfWidth, Math.abs(finite(record.maxX) - finite(record.minX)) * 0.5)
    )
  );
  const halfZ = Math.max(
    0,
    finite(
      record.halfZ,
      finite(record.halfDepth, Math.abs(finite(record.maxZ) - finite(record.minZ)) * 0.5)
    )
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
  const cosine = record.routeCosine ?? Math.cos(record.rotation);
  const sine = record.routeSine ?? Math.sin(record.rotation);
  const dx = x - record.centerX;
  const dz = z - record.centerZ;
  return {
    x: cosine * dx - sine * dz,
    z: sine * dx + cosine * dz
  };
}

function vectorToLocal(record, x, z) {
  const cosine = record.routeCosine ?? Math.cos(record.rotation);
  const sine = record.routeSine ?? Math.sin(record.rotation);
  return {
    x: cosine * x - sine * z,
    z: sine * x + cosine * z
  };
}

function vectorToWorld(record, x, z) {
  const cosine = record.routeCosine ?? Math.cos(record.rotation);
  const sine = record.routeSine ?? Math.sin(record.rotation);
  return {
    x: cosine * x + sine * z,
    z: -sine * x + cosine * z
  };
}

function pointInsideRecord(point, record, expansion = 0, epsilon = EPSILON) {
  const local = toLocal(record, finite(point.x), finite(point.z));
  return Math.abs(local.x) <= record.halfX + expansion + epsilon
    && Math.abs(local.z) <= record.halfZ + expansion + epsilon;
}

function routeCorner(record, localX, localZ, expansion) {
  const world = vectorToWorld(
    record,
    localX * (record.halfX + expansion + ROUTE_VERTEX_MARGIN),
    localZ * (record.halfZ + expansion + ROUTE_VERTEX_MARGIN)
  );
  return {
    x: record.centerX + world.x,
    z: record.centerZ + world.z
  };
}

function segmentIntersectsRecord(start, end, record, expansion = 0) {
  if (record.routeBounds
      && (Math.max(start.x, end.x) < record.routeBounds.minX
        || Math.min(start.x, end.x) > record.routeBounds.maxX
        || Math.max(start.z, end.z) < record.routeBounds.minZ
        || Math.min(start.z, end.z) > record.routeBounds.maxZ)) {
    return false;
  }
  const localStart = toLocal(record, finite(start.x), finite(start.z));
  const localEnd = toLocal(record, finite(end.x), finite(end.z));
  const delta = {
    x: localEnd.x - localStart.x,
    z: localEnd.z - localStart.z
  };
  let nearTime = 0;
  let farTime = 1;

  for (const axis of [
    { origin: localStart.x, delta: delta.x, half: record.halfX + expansion },
    { origin: localStart.z, delta: delta.z, half: record.halfZ + expansion }
  ]) {
    if (Math.abs(axis.delta) <= EPSILON) {
      if (axis.origin < -axis.half || axis.origin > axis.half) return false;
      continue;
    }
    const first = (-axis.half - axis.origin) / axis.delta;
    const second = (axis.half - axis.origin) / axis.delta;
    nearTime = Math.max(nearTime, Math.min(first, second));
    farTime = Math.min(farTime, Math.max(first, second));
    if (nearTime - farTime > EPSILON) return false;
  }

  return farTime >= -EPSILON && nearTime <= 1 + EPSILON;
}

function compareRouteNodes(a, b) {
  if (a.key === b.key) return 0;
  return a.key < b.key ? -1 : 1;
}

function appendDistinctPoint(points, point) {
  const previous = points[points.length - 1];
  if (previous
      && Math.hypot(previous.x - point.x, previous.z - point.z) <= CONTACT_EPSILON) {
    return;
  }
  points.push({ x: point.x, z: point.z });
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

  getNavigationTarget(
    start,
    goal,
    radius = 0,
    moverType = 'vehicle',
    longitudinalClearance = radius
  ) {
    for (const crossing of this.navigationRecords) {
      if (crossing.type !== 'bridge_crossing'
          || !(crossing.blocks ?? ['vehicle', 'infantry']).includes(moverType)) continue;
      const southEdge = Math.min(crossing.minZ, crossing.maxZ);
      const northEdge = Math.max(crossing.minZ, crossing.maxZ);
      const barrierRecords = (crossing.barrierColliderIds ?? [])
        .map(id => this.colliders.get(String(id)))
        .filter(record => record && blocksMover(record, moverType));
      const barrierSouthEdge = barrierRecords.length > 0
        ? Math.min(...barrierRecords.map(record => record.centerZ - record.halfZ))
        : southEdge;
      const barrierNorthEdge = barrierRecords.length > 0
        ? Math.max(...barrierRecords.map(record => record.centerZ + record.halfZ))
        : northEdge;
      const boundaryRecords = (crossing.boundaryColliderIds ?? [])
        .map(id => this.colliders.get(String(id)))
        .filter(record => record && blocksMover(record, moverType));
      const crossingSouthEdge = boundaryRecords.length > 0
        ? Math.min(
            southEdge,
            ...boundaryRecords.map(record => record.centerZ - record.halfZ)
          )
        : southEdge;
      const crossingNorthEdge = boundaryRecords.length > 0
        ? Math.max(
            northEdge,
            ...boundaryRecords.map(record => record.centerZ + record.halfZ)
          )
        : northEdge;
      const margin = Math.max(0.25, longitudinalClearance + 0.2);
      const northExitZ = crossingNorthEdge + margin;
      const southExitZ = crossingSouthEdge - margin;
      const lateralClearance = crossing.halfOpeningWidth + longitudinalClearance;
      // Route decisions use the actual blocking band, not the bridge's longer
      // visual span. A legal near-bank destination can sit between those two
      // extents and still requires passage through the bridge opening.
      const southToNorth = start.z < barrierSouthEdge && goal.z > barrierNorthEdge;
      const northToSouth = start.z > barrierNorthEdge && goal.z < barrierSouthEdge;
      const continuingNorth = start.z >= southEdge - margin
        && start.z <= barrierNorthEdge + CONTACT_EPSILON
        && goal.z > barrierNorthEdge;
      const continuingSouth = start.z <= northEdge + margin
        && start.z >= barrierSouthEdge - CONTACT_EPSILON
        && goal.z < barrierSouthEdge;
      const northBankTrip = start.z > barrierNorthEdge && goal.z > barrierNorthEdge;
      const southBankTrip = start.z < barrierSouthEdge && goal.z < barrierSouthEdge;

      // A mover whose destination lies on the near bank must first clear the
      // bridge longitudinally, then clear its abutment laterally. This
      // stateless dog-leg prevents immediately steering a long vehicle back
      // into the crossing and oscillating at the exit.
      if (northBankTrip
          && Math.abs(start.x - crossing.centerX) < lateralClearance - CONTACT_EPSILON
          && Math.abs(goal.x - crossing.centerX) >= lateralClearance) {
        if (start.z < northExitZ - CONTACT_EPSILON) {
          return {
            x: crossing.centerX,
            z: northExitZ,
            routed: true,
            crossingId: crossing.id
          };
        }
        return {
          x: goal.x,
          z: northExitZ,
          routed: true,
          crossingId: crossing.id
        };
      }
      if (southBankTrip
          && Math.abs(start.x - crossing.centerX) < lateralClearance - CONTACT_EPSILON
          && Math.abs(goal.x - crossing.centerX) >= lateralClearance) {
        if (start.z > southExitZ + CONTACT_EPSILON) {
          return {
            x: crossing.centerX,
            z: southExitZ,
            routed: true,
            crossingId: crossing.id
          };
        }
        return {
          x: goal.x,
          z: southExitZ,
          routed: true,
          crossingId: crossing.id
        };
      }

      if (southToNorth) {
        const entryZ = southEdge - margin;
        const centered = Math.abs(start.x - crossing.centerX)
          <= Math.max(0.2, crossing.halfOpeningWidth - radius);
        if (!centered || start.z < entryZ - CONTACT_EPSILON) {
          return { x: crossing.centerX, z: entryZ, routed: true, crossingId: crossing.id };
        }
        return {
          x: crossing.centerX,
          z: northExitZ,
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
          z: southExitZ,
          routed: true,
          crossingId: crossing.id
        };
      }
      if (continuingNorth) {
        const exitZ = northExitZ;
        if (start.z < exitZ - CONTACT_EPSILON) {
          return { x: crossing.centerX, z: exitZ, routed: true, crossingId: crossing.id };
        }
        return { x: goal.x, z: goal.z, routed: false, crossingId: null };
      }
      if (continuingSouth) {
        const exitZ = southExitZ;
        if (start.z > exitZ + CONTACT_EPSILON) {
          return { x: crossing.centerX, z: exitZ, routed: true, crossingId: crossing.id };
        }
        return { x: goal.x, z: goal.z, routed: false, crossingId: null };
      }
    }
    return { x: goal.x, z: goal.z, routed: false, crossingId: null };
  }

  /**
   * Returns an ordered X/Z path, including the goal and excluding the start.
   *
   * Bridge stages remain authoritative. Each stage is then routed around the
   * stable static colliders with a deterministic visibility graph whose
   * obstacle bounds are expanded by the mover radius and requested clearance.
   */
  getNavigationPath(start, goal, radius = 0, moverType = 'vehicle', options = {}) {
    const routeStart = { x: finite(start?.x), z: finite(start?.z) };
    const routeGoal = { x: finite(goal?.x), z: finite(goal?.z) };
    const moverRadius = Math.max(0, finite(radius));
    const clearance = Math.max(
      0,
      finite(options.clearance, DEFAULT_ROUTE_CLEARANCE)
    );
    const waypointClearance = Math.max(0, finite(options.waypointClearance));
    const ignored = new Set((options.ignoreColliderIds ?? []).map(String));
    const traversableTypes = new Set(
      (options.traverseColliderTypes ?? []).map(String)
    );
    const stages = [];
    const stagedCrossingIds = new Set();
    let stageStart = routeStart;

    if (options.includeNavigation !== false) {
      const maximumStages = Math.max(4, this.navigationRecords.length * 4 + 2);
      for (let index = 0; index < maximumStages; index++) {
        const target = this.getNavigationTarget(
          stageStart,
          routeGoal,
          moverRadius,
          moverType,
          Math.max(
            moverRadius,
            finite(options.longitudinalClearance, moverRadius)
          )
        );
        if (!target.routed) break;
        if (Math.hypot(target.x - stageStart.x, target.z - stageStart.z) <= CONTACT_EPSILON) {
          break;
        }
        appendDistinctPoint(stages, target);
        if (target.crossingId) stagedCrossingIds.add(String(target.crossingId));
        stageStart = target;
      }
    }
    appendDistinctPoint(stages, routeGoal);

    const lateralClearance = Math.max(
      0,
      finite(options.lateralClearance, clearance)
    );
    const stagedCrossingColliderIds = new Set();
    for (const crossing of this.navigationRecords) {
      if (!stagedCrossingIds.has(crossing.id)) continue;
      if (moverRadius + lateralClearance
          > crossing.halfOpeningWidth + CONTACT_EPSILON) continue;
      for (const colliderId of [
        ...(crossing.barrierColliderIds ?? []),
        ...(crossing.boundaryColliderIds ?? [])
      ]) {
        stagedCrossingColliderIds.add(String(colliderId));
      }
    }
    const records = [...this.colliders.values()]
      .filter(record => (
        blocksMover(record, moverType)
        && !ignored.has(record.id)
        && !traversableTypes.has(record.type)
        && !stagedCrossingColliderIds.has(record.id)
      ))
      .sort((a, b) => a.id.localeCompare(b.id));
    const path = [];
    let segmentStart = routeStart;
    for (const stage of stages) {
      const segmentPath = this.findStaticPath(
        segmentStart,
        stage,
        moverRadius + clearance,
        records,
        waypointClearance
      );
      for (const point of segmentPath) appendDistinctPoint(path, point);
      segmentStart = stage;
    }
    return path;
  }

  findStaticPath(start, goal, expansion, records, waypointClearance = 0) {
    if (Math.hypot(goal.x - start.x, goal.z - start.z) <= CONTACT_EPSILON) {
      return [];
    }
    const routeRecords = records.map(record => {
      const routeCosine = Math.cos(record.rotation);
      const routeSine = Math.sin(record.rotation);
      const halfX = record.halfX + expansion;
      const halfZ = record.halfZ + expansion;
      const worldHalfX = Math.abs(routeCosine) * halfX + Math.abs(routeSine) * halfZ;
      const worldHalfZ = Math.abs(routeSine) * halfX + Math.abs(routeCosine) * halfZ;
      return {
        ...record,
        routeCosine,
        routeSine,
        routeBounds: {
          minX: record.centerX - worldHalfX,
          maxX: record.centerX + worldHalfX,
          minZ: record.centerZ - worldHalfZ,
          maxZ: record.centerZ + worldHalfZ
        }
      };
    });
    const visible = (from, to) => !routeRecords.some(record =>
      segmentIntersectsRecord(from, to, record, expansion)
    );
    if (visible(start, goal)) return [{ x: goal.x, z: goal.z }];

    const nodes = [
      { key: '0:start', x: start.x, z: start.z },
      { key: '1:goal', x: goal.x, z: goal.z }
    ];
    for (const record of routeRecords) {
      for (const [cornerIndex, [localX, localZ]] of [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1]
      ].entries()) {
        const corner = routeCorner(
          record,
          localX,
          localZ,
          expansion + waypointClearance
        );
        if (routeRecords.some(other =>
          other.id !== record.id
          && pointInsideRecord(
            corner,
            other,
            expansion + waypointClearance,
            ROUTE_VERTEX_MARGIN * 2
          )
        )) {
          continue;
        }
        nodes.push({
          key: `2:${record.id}:${cornerIndex}`,
          x: corner.x,
          z: corner.z
        });
      }
    }
    nodes.sort(compareRouteNodes);

    const startIndex = nodes.findIndex(node => node.key === '0:start');
    const goalIndex = nodes.findIndex(node => node.key === '1:goal');
    const distances = new Array(nodes.length).fill(Infinity);
    const previous = new Array(nodes.length).fill(-1);
    const visited = new Array(nodes.length).fill(false);
    distances[startIndex] = 0;

    for (let pass = 0; pass < nodes.length; pass++) {
      let current = -1;
      for (let index = 0; index < nodes.length; index++) {
        if (visited[index] || !Number.isFinite(distances[index])) continue;
        if (current < 0
            || distances[index] < distances[current] - EPSILON
            || (Math.abs(distances[index] - distances[current]) <= EPSILON
              && nodes[index].key < nodes[current].key)) {
          current = index;
        }
      }
      if (current < 0 || current === goalIndex) break;
      visited[current] = true;

      for (let next = 0; next < nodes.length; next++) {
        if (next === current || visited[next] || !visible(nodes[current], nodes[next])) continue;
        const edgeDistance = Math.hypot(
          nodes[next].x - nodes[current].x,
          nodes[next].z - nodes[current].z
        );
        const candidate = distances[current] + edgeDistance;
        const previousKey = previous[next] >= 0 ? nodes[previous[next]].key : null;
        if (candidate < distances[next] - EPSILON
            || (Math.abs(candidate - distances[next]) <= EPSILON
              && (previousKey == null || nodes[current].key < previousKey))) {
          distances[next] = candidate;
          previous[next] = current;
        }
      }
    }

    if (!Number.isFinite(distances[goalIndex])) {
      // Retain collision-safe runtime behavior when no finite static route
      // exists; callers may still stage at the closest reachable boundary.
      return [{ x: goal.x, z: goal.z }];
    }
    const reversed = [];
    for (let index = goalIndex; index !== startIndex; index = previous[index]) {
      if (index < 0) return [{ x: goal.x, z: goal.z }];
      reversed.push({ x: nodes[index].x, z: nodes[index].z });
    }
    return reversed.reverse();
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
    const traversableTypes = new Set(
      (options.traverseColliderTypes ?? []).map(String)
    );
    const transientRecords = (options.transientColliders ?? [])
      .map(normalizeRecord);
    const blockingRecords = [
      ...this.colliders.values(),
      ...transientRecords
    ]
      .filter(record => blocksMover(record, moverType) && !ignored.has(record.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    const traversalRecords = blockingRecords.filter(record =>
      traversableTypes.has(record.type));
    const records = blockingRecords.filter(record =>
      !traversableTypes.has(record.type));
    const resolved = { x: finite(position.x), z: finite(position.z) };
    const contacts = [];
    const traversedColliderIds = [];
    for (const record of traversalRecords) {
      const crossed = offsets.some(offset => sweepCircleAgainstRecord(
        {
          x: resolved.x + offset.x,
          z: resolved.z + offset.z
        },
        displacement,
        radius,
        record
      ));
      if (crossed) traversedColliderIds.push(record.id);
    }

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
      contacts,
      traversedColliderIds
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
