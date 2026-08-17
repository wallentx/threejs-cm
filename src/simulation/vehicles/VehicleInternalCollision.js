import { intersectSegmentOrientedBox3D } from '../geometry/OrientedBox.js';
import {
  inverseTransformDirection,
  isVehicleTurretSeparated,
  vehicleVolumeTransform
} from './VehicleTransforms.js';

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

function worldCollider(unit, volume) {
  const transform = vehicleVolumeTransform(unit, volume);
  const halfExtents = volume.halfExtents ?? [0, 0, 0];
  return {
    ...transform,
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

function distanceToOrientedBox(point, collider) {
  const dx = point[0] - collider.centerX;
  const dy = point[1] - collider.centerY;
  const dz = point[2] - collider.centerZ;
  const local = inverseTransformDirection(
    collider.orientation,
    [dx, dy, dz]
  );
  const outsideX = Math.max(0, Math.abs(local[0]) - collider.halfWidth);
  const outsideY = Math.max(0, Math.abs(local[1]) - collider.halfHeight);
  const outsideZ = Math.max(0, Math.abs(local[2]) - collider.halfDepth);
  return Math.hypot(outsideX, outsideY, outsideZ);
}

const PRESSURE_SHIELDING_PER_VOLUME = 0.82;
const MAX_PRESSURE_SHIELDING_VOLUMES = 2;
const POWERPACK_NEIGHBOR_DISTANCE_METERS = 1.5;
export const MAX_INTERNAL_FRAGMENT_RAYS = 64;

const TURRET_COMPONENT_IDS = new Set([
  'breech',
  'coax',
  'optics',
  'turret_traverse'
]);

function localVolumePoint(volume) {
  return [
    finite(volume?.center?.[0]) + finite(volume?.offset?.[0]),
    finite(volume?.center?.[1]) + finite(volume?.offset?.[1]),
    finite(volume?.center?.[2]) + finite(volume?.offset?.[2])
  ];
}

function distanceBetween(left, right) {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2]
  );
}

function inferredCompartmentId(volume, enginePoints) {
  if (volume?.compartmentId) return String(volume.compartmentId);
  if (volume?.followsTurret || TURRET_COMPONENT_IDS.has(volume?.componentId)) {
    return 'turret';
  }
  if (volume?.componentId === 'engine') return 'powerpack';
  if (['fuel', 'transmission'].includes(volume?.componentId)) {
    const point = localVolumePoint(volume);
    if (enginePoints.some(engine => distanceBetween(point, engine)
        <= POWERPACK_NEIGHBOR_DISTANCE_METERS)) {
      return 'powerpack';
    }
  }
  return 'fighting';
}

function cachedWorldVolumes(unit, layout) {
  const enginePoints = layout.volumes
    .filter(volume => volume.componentId === 'engine')
    .map(localVolumePoint);
  return layout.volumes
    .filter(volume => !(isVehicleTurretSeparated(unit) && volume.followsTurret))
    .map(volume => ({
      volume,
      collider: worldCollider(unit, volume),
      compartmentId: inferredCompartmentId(volume, enginePoints)
    }));
}

function pressureShielding(point, candidate, worldVolumes) {
  const end = [
    candidate.collider.centerX,
    candidate.collider.centerY,
    candidate.collider.centerZ
  ];
  const blockers = [];
  for (const world of worldVolumes) {
    if (
      world.volume.id === candidate.volume.id
      || world.volume.kind !== 'component'
      || distanceToOrientedBox(point, world.collider) <= EPSILON
    ) {
      continue;
    }
    const intersection = intersectSegmentOrientedBox3D(
      point,
      end,
      world.collider
    );
    if (!intersection || intersection.t <= 1e-4 || intersection.t >= 1 - 1e-4) {
      continue;
    }
    blockers.push({
      id: world.volume.id,
      t: intersection.t
    });
  }
  const shieldingVolumeIds = blockers
    .sort((left, right) => left.t - right.t || left.id.localeCompare(right.id))
    .slice(0, MAX_PRESSURE_SHIELDING_VOLUMES)
    .map(blocker => blocker.id);
  return {
    shieldingVolumeIds,
    shieldingFactor: PRESSURE_SHIELDING_PER_VOLUME ** shieldingVolumeIds.length
  };
}


/**
 * Returns model-local crew and module volumes reached by a radial vehicle
 * blast. Each candidate carries a deterministic inferred compartment and up to
 * two intervening component volumes as bounded first-order pressure shielding.
 */
export function queryVehicleInternalBlastCandidates({
  unit,
  impactPoint,
  radiusMeters
}) {
  const layout = unit?.vehicleSpec?.internalLayout;
  const radius = Math.max(0, finite(radiusMeters));
  if (!layout?.volumes?.length || radius <= EPSILON) return [];

  const point = vector(impactPoint);
  const worldVolumes = cachedWorldVolumes(unit, layout);
  const candidates = [];
  for (const world of worldVolumes) {
    const { volume, collider, compartmentId } = world;
    const distanceMeters = distanceToOrientedBox(point, collider);
    if (distanceMeters > radius + EPSILON) continue;
    const shielding = pressureShielding(point, world, worldVolumes);
    candidates.push({
      id: volume.id,
      kind: volume.kind,
      componentId: volume.componentId ?? null,
      crewRoles: volume.crewRoles ? [...volume.crewRoles] : [],
      distanceMeters,
      followsTurret: Boolean(volume.followsTurret),
      compartmentId,
      compartmentDataQuality:
        volume.compartmentDataQuality
        ?? 'inferred from turret ownership and proximity to the modeled engine volume',
      shieldingVolumeIds: shielding.shieldingVolumeIds,
      shieldingFactor: shielding.shieldingFactor,
      shieldingDataQuality:
        'bounded first-order attenuation through at most two intervening modeled component volumes',
      dataQuality: volume.dataQuality ?? layout.dataQuality ?? 'unspecified',
      layoutVersion: layout.version,
      layoutDataQuality: layout.dataQuality,
      referenceUrl: volume.referenceUrl ?? layout.referenceUrl ?? null
    });
  }

  return candidates.sort((a, b) =>
    a.distanceMeters - b.distanceMeters
      || a.id.localeCompare(b.id));
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
    if (isVehicleTurretSeparated(unit) && volume.followsTurret) continue;
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
      referenceUrl: volume.referenceUrl ?? layout.referenceUrl ?? null,
      energyAbsorption: volume.energyAbsorption
        ? { ...volume.energyAbsorption }
        : null
    });
  }

  return hits.sort((a, b) =>
    a.entryDistanceMeters - b.entryDistanceMeters
      || a.id.localeCompare(b.id));
}


/**
 * Traces a bounded batch of representative internal fragments. World-space
 * volume transforms are cached once for the event, and every ray terminates at
 * its nearest crew/module volume rather than becoming a persistent projectile.
 */
export function traceVehicleInternalFragmentBatch({
  unit,
  impactPoint,
  fragments,
  maxDistanceMeters = null
}) {
  const layout = unit?.vehicleSpec?.internalLayout;
  if (!layout?.volumes?.length || !Array.isArray(fragments)) return [];

  const origin = vector(impactPoint);
  const entryOffset = Math.max(0, finite(layout.entryOffsetMeters, 0.01));
  const requestedDistance = maxDistanceMeters == null
    ? finite(layout.maxPathMeters, 0)
    : finite(maxDistanceMeters, finite(layout.maxPathMeters, 0));
  const maxDistance = Math.max(entryOffset, requestedDistance);
  if (maxDistance <= entryOffset + EPSILON) return [];

  const worldVolumes = cachedWorldVolumes(unit, layout);
  const orderedFragments = [...fragments]
    .sort((left, right) =>
      finite(left?.index) - finite(right?.index))
    .slice(0, MAX_INTERNAL_FRAGMENT_RAYS);
  const hits = [];

  for (const fragment of orderedFragments) {
    const incoming = vector(fragment?.direction);
    const magnitude = Math.hypot(...incoming);
    if (magnitude <= EPSILON) continue;
    const normalizedDirection = incoming.map(component => component / magnitude);
    const start = pointAlong(origin, normalizedDirection, entryOffset);
    const end = pointAlong(origin, normalizedDirection, maxDistance);
    const segmentLength = maxDistance - entryOffset;
    let closest = null;

    for (const world of worldVolumes) {
      const intersection = intersectSegmentOrientedBox3D(
        start,
        end,
        world.collider
      );
      if (!intersection) continue;
      if (
        closest
        && intersection.t > closest.intersection.t + EPSILON
      ) {
        continue;
      }
      if (
        closest
        && Math.abs(intersection.t - closest.intersection.t) <= EPSILON
        && String(world.volume.id).localeCompare(String(closest.world.volume.id)) >= 0
      ) {
        continue;
      }
      closest = { world, intersection };
    }

    if (!closest) continue;
    const { volume } = closest.world;
    const entryDistanceMeters =
      entryOffset + closest.intersection.t * segmentLength;
    hits.push({
      fragmentIndex: finite(fragment.index),
      fragmentEnergyJ: Math.max(0, finite(fragment.energyJ)),
      representedFragments: Math.max(
        1,
        Math.floor(finite(fragment.representedFragments, 1))
      ),
      direction: [...normalizedDirection],
      id: volume.id,
      kind: volume.kind,
      componentId: volume.componentId ?? null,
      crewRoles: volume.crewRoles ? [...volume.crewRoles] : [],
      entryPoint: [...closest.intersection.point],
      entryDistanceMeters,
      followsTurret: Boolean(volume.followsTurret),
      compartmentId: closest.world.compartmentId,
      dataQuality: volume.dataQuality ?? layout.dataQuality ?? 'unspecified',
      layoutVersion: layout.version,
      layoutDataQuality: layout.dataQuality,
      referenceUrl: volume.referenceUrl ?? layout.referenceUrl ?? null,
      energyAbsorption: volume.energyAbsorption
        ? { ...volume.energyAbsorption }
        : null
    });
  }

  return hits.sort((left, right) =>
    left.fragmentIndex - right.fragmentIndex
      || left.entryDistanceMeters - right.entryDistanceMeters
      || left.id.localeCompare(right.id));
}
