import { intersectSegmentOrientedBox3D } from '../geometry/OrientedBox.js';
import {
  inverseTransformDirection,
  isVehicleTurretSeparated,
  transformDirection,
  vehicleVolumeTransform
} from './VehicleTransforms.js';

const EPSILON = 1e-8;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function toLocalVector(vector, orientation) {
  const local = inverseTransformDirection(orientation, vector);
  return { x: local[0], y: local[1], z: local[2] };
}

function classifyFace(normal, orientation) {
  const local = toLocalVector(normal, orientation);
  const axes = [
    { magnitude: Math.abs(local.x), face: local.x >= 0 ? 'positiveX' : 'negativeX' },
    { magnitude: Math.abs(local.y), face: local.y >= 0 ? 'positiveY' : 'negativeY' },
    { magnitude: Math.abs(local.z), face: local.z >= 0 ? 'positiveZ' : 'negativeZ' }
  ];
  axes.sort((a, b) => b.magnitude - a.magnitude || a.face.localeCompare(b.face));
  return axes[0].face;
}

function worldTransform(unit, volume) {
  return vehicleVolumeTransform(unit, volume);
}

function worldCollider(unit, volume) {
  const transform = worldTransform(unit, volume);
  const halfExtents = volume.halfExtents ?? [0, 0, 0];
  return {
    ...transform,
    halfWidth: finite(halfExtents[0]),
    halfHeight: finite(halfExtents[1]),
    halfDepth: finite(halfExtents[2])
  };
}

function vector(value) {
  return [
    finite(value[0] ?? value.x),
    finite(value[1] ?? value.y),
    finite(value[2] ?? value.z)
  ];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalized(value) {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= EPSILON) return null;
  return value.map(component => component / length);
}

function localPoint(point, transform) {
  return toLocalVector([
    point[0] - transform.centerX,
    point[1] - transform.centerY,
    point[2] - transform.centerZ
  ], transform.orientation);
}

function segmentTriangle(start, end, a, b, c) {
  const direction = subtract(end, start);
  const edge1 = subtract(b, a);
  const edge2 = subtract(c, a);
  const p = cross(direction, edge2);
  const determinant = dot(edge1, p);
  if (Math.abs(determinant) <= EPSILON) return null;
  const inverse = 1 / determinant;
  const translated = subtract(start, a);
  const u = dot(translated, p) * inverse;
  if (u < -EPSILON || u > 1 + EPSILON) return null;
  const q = cross(translated, edge1);
  const v = dot(direction, q) * inverse;
  if (v < -EPSILON || u + v > 1 + EPSILON) return null;
  const t = dot(edge2, q) * inverse;
  if (t < -EPSILON || t > 1 + EPSILON) return null;
  return {
    t: Math.max(0, Math.min(1, t)),
    normal: normalized(cross(edge1, edge2))
  };
}

function orientOutward(normal, a, b, c, interiorPoint) {
  if (!normal) return null;
  const center = [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3
  ];
  return dot(normal, subtract(center, interiorPoint)) < 0
    ? normal.map(value => -value)
    : normal;
}

function worldNormal(localNormal, orientation) {
  return transformDirection(orientation, localNormal);
}

function exitArmorMetadata(volume, surface) {
  const exitArmorPolicy = volume.exitArmorPolicy ?? 'opposite_face';
  if (exitArmorPolicy === 'none') {
    return {
      exitArmorPolicy,
      nominalArmorMm: 0,
      thicknessSourceZone: null,
      thicknessDataQuality: [
        surface.thicknessDataQuality,
        'single-resistance auxiliary envelope; far boundary adds no armor resistance'
      ].filter(Boolean).join('; '),
      thicknessReferenceUrl: surface.thicknessReferenceUrl ?? null
    };
  }
  return {
    exitArmorPolicy,
    nominalArmorMm: surface.nominalArmorMm,
    thicknessSourceZone: surface.thicknessSourceZone,
    thicknessDataQuality: surface.thicknessDataQuality ?? null,
    thicknessReferenceUrl: surface.thicknessReferenceUrl ?? null
  };
}

function triangleMeshIntersection(startInput, endInput, unit, volume) {
  const transform = worldTransform(unit, volume);
  const startWorld = vector(startInput);
  const endWorld = vector(endInput);
  const start = vector(localPoint(startWorld, transform));
  const end = vector(localPoint(endWorld, transform));
  const vertices = volume.vertices ?? [];
  const interior = vector(volume.interiorPoint ?? [0, 0, 0]);
  let closest = null;
  for (const plate of volume.plates ?? []) {
    for (const triangle of plate.triangles ?? []) {
      const a = vertices[triangle[0]];
      const b = vertices[triangle[1]];
      const c = vertices[triangle[2]];
      if (!a || !b || !c) continue;
      const intersection = segmentTriangle(start, end, a, b, c);
      if (!intersection) continue;
      const outward = orientOutward(intersection.normal, a, b, c, interior);
      if (!outward) continue;
      const point = [
        startWorld[0] + (endWorld[0] - startWorld[0]) * intersection.t,
        startWorld[1] + (endWorld[1] - startWorld[1]) * intersection.t,
        startWorld[2] + (endWorld[2] - startWorld[2]) * intersection.t
      ];
      const candidate = {
        t: intersection.t,
        point,
        normal: worldNormal(outward, transform.orientation),
        zone: plate.zone,
        fallbackZone: plate.fallbackZone ?? plate.zone,
        face: plate.id,
        plateId: `${volume.id}:${plate.id}`,
        armorVolumeId: volume.id,
        armorPart: volume.part,
        geometryQuality: volume.geometryQuality,
        localPoint: localPoint(point, transform),
        nominalArmorMm: plate.thicknessMm,
        thicknessSourceZone: plate.thicknessSourceZone ?? plate.fallbackZone ?? plate.zone,
        thicknessDataQuality: plate.thicknessDataQuality ?? null,
        thicknessReferenceUrl: plate.thicknessReferenceUrl ?? null
      };
      if (!closest
          || candidate.t < closest.t - EPSILON
          || (Math.abs(candidate.t - closest.t) <= EPSILON
            && candidate.plateId.localeCompare(closest.plateId) < 0)) {
        closest = candidate;
      }
    }
  }
  return closest;
}

function triangleMeshExit(startInput, endInput, unit, volume) {
  const transform = worldTransform(unit, volume);
  const startWorld = vector(startInput);
  const endWorld = vector(endInput);
  const start = vector(localPoint(startWorld, transform));
  const end = vector(localPoint(endWorld, transform));
  const direction = subtract(end, start);
  const vertices = volume.vertices ?? [];
  const interior = vector(volume.interiorPoint ?? [0, 0, 0]);
  let closest = null;
  for (const plate of volume.plates ?? []) {
    for (const triangle of plate.triangles ?? []) {
      const a = vertices[triangle[0]];
      const b = vertices[triangle[1]];
      const c = vertices[triangle[2]];
      if (!a || !b || !c) continue;
      const intersection = segmentTriangle(start, end, a, b, c);
      if (!intersection || intersection.t <= EPSILON) continue;
      const outward = orientOutward(intersection.normal, a, b, c, interior);
      if (!outward || dot(outward, direction) <= EPSILON) continue;
      const point = [
        startWorld[0] + (endWorld[0] - startWorld[0]) * intersection.t,
        startWorld[1] + (endWorld[1] - startWorld[1]) * intersection.t,
        startWorld[2] + (endWorld[2] - startWorld[2]) * intersection.t
      ];
      const armorMetadata = exitArmorMetadata(volume, {
        nominalArmorMm: plate.thicknessMm,
        thicknessSourceZone: plate.thicknessSourceZone
          ?? plate.fallbackZone
          ?? plate.zone,
        thicknessDataQuality: plate.thicknessDataQuality,
        thicknessReferenceUrl: plate.thicknessReferenceUrl
      });
      const candidate = {
        t: intersection.t,
        point,
        normal: worldNormal(outward, transform.orientation),
        zone: plate.zone,
        fallbackZone: plate.fallbackZone ?? plate.zone,
        face: plate.id,
        plateId: `${volume.id}:${plate.id}`,
        armorVolumeId: volume.id,
        armorPart: volume.part,
        geometryQuality: volume.geometryQuality,
        localPoint: localPoint(point, transform),
        ...armorMetadata
      };
      if (!closest
          || candidate.t < closest.t - EPSILON
          || (Math.abs(candidate.t - closest.t) <= EPSILON
            && candidate.plateId.localeCompare(closest.plateId) < 0)) {
        closest = candidate;
      }
    }
  }
  return closest;
}

function orientedBoxExit(startInput, endInput, unit, volume) {
  const collider = worldCollider(unit, volume);
  const start = vector(startInput);
  const end = vector(endInput);
  const reverse = intersectSegmentOrientedBox3D(end, start, collider);
  if (!reverse) return null;
  const t = 1 - reverse.t;
  if (t <= EPSILON || t > 1 + EPSILON) return null;
  const face = classifyFace(reverse.normal, collider.orientation);
  const zone = volume.faceZones?.[face] ?? null;
  if (!zone) return null;
  const fallbackZone = volume.fallbackZones?.[face] ?? zone;
  const armorMetadata = exitArmorMetadata(volume, {
    nominalArmorMm: volume.thicknessMm ?? null,
    thicknessSourceZone: volume.thicknessSourceZone ?? fallbackZone,
    thicknessDataQuality: volume.thicknessDataQuality,
    thicknessReferenceUrl: volume.thicknessReferenceUrl
  });
  return {
    t,
    point: reverse.point,
    normal: reverse.normal,
    zone,
    fallbackZone,
    face,
    plateId: `${volume.id}:${face}`,
    armorVolumeId: volume.id,
    armorPart: volume.part,
    geometryQuality: volume.geometryQuality
      ?? unit.vehicleSpec.armorCollision.quality
      ?? 'unspecified',
    ...armorMetadata,
    localPoint: toLocalVector([
      reverse.point[0] - collider.centerX,
      reverse.point[1] - collider.centerY,
      reverse.point[2] - collider.centerZ
    ], collider.orientation)
  };
}

/**
 * Renderer-neutral swept query against authored model-local armor volumes.
 * Each intersected triangle or box face is a stable named plate.
 */
export function intersectVehicleArmor(start, end, unit) {
  const volumes = unit?.vehicleSpec?.armorCollision?.volumes ?? [];
  const turretSeparated = isVehicleTurretSeparated(unit);
  let closest = null;
  for (const volume of volumes) {
    if (turretSeparated && volume.followsTurret) continue;
    if (volume.shape === 'triangle-mesh') {
      const candidate = triangleMeshIntersection(start, end, unit, volume);
      if (candidate && (!closest
          || candidate.t < closest.t - EPSILON
          || (Math.abs(candidate.t - closest.t) <= EPSILON
            && candidate.plateId.localeCompare(closest.plateId) < 0))) {
        closest = candidate;
      }
      continue;
    }
    const collider = worldCollider(unit, volume);
    const intersection = intersectSegmentOrientedBox3D(start, end, collider);
    if (!intersection) continue;
    const face = classifyFace(intersection.normal, collider.orientation);
    const zone = volume.faceZones?.[face] ?? null;
    if (!zone) continue;
    const fallbackZone = volume.fallbackZones?.[face] ?? zone;
    const candidate = {
      t: intersection.t,
      point: intersection.point,
      normal: intersection.normal,
      zone,
      fallbackZone,
      face,
      plateId: `${volume.id}:${face}`,
      armorVolumeId: volume.id,
      armorPart: volume.part,
      geometryQuality: volume.geometryQuality
        ?? unit.vehicleSpec.armorCollision.quality
        ?? 'unspecified',
      nominalArmorMm: volume.thicknessMm ?? null,
      thicknessSourceZone: volume.thicknessSourceZone ?? fallbackZone,
      thicknessDataQuality: volume.thicknessDataQuality ?? null,
      thicknessReferenceUrl: volume.thicknessReferenceUrl ?? null,
      localPoint: toLocalVector([
        intersection.point[0] - collider.centerX,
        intersection.point[1] - collider.centerY,
        intersection.point[2] - collider.centerZ
      ], collider.orientation)
    };
    if (!closest
        || candidate.t < closest.t - EPSILON
        || (Math.abs(candidate.t - closest.t) <= EPSILON
          && candidate.plateId.localeCompare(closest.plateId) < 0)) {
      closest = candidate;
    }
  }
  return closest;
}

function volumeAimBounds(volume) {
  if (volume.halfExtents) {
    return {
      center: [0, 0, 0],
      minimumY: -finite(volume.halfExtents[1]),
      maximumY: finite(volume.halfExtents[1]),
      halfExtents: volume.halfExtents.map(value => finite(value)),
      measure:
        finite(volume.halfExtents[0])
        * finite(volume.halfExtents[1])
        * finite(volume.halfExtents[2])
        * 8
    };
  }
  const vertices = volume.vertices ?? [];
  if (vertices.length === 0) {
    return {
      center: [0, 0, 0],
      minimumY: 0,
      maximumY: 0,
      halfExtents: [0, 0, 0],
      measure: 0
    };
  }
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) {
    for (let axis = 0; axis < 3; axis++) {
      const value = finite(vertex[axis]);
      minimum[axis] = Math.min(minimum[axis], value);
      maximum[axis] = Math.max(maximum[axis], value);
    }
  }
  return {
    center: minimum.map((value, axis) => (value + maximum[axis]) * 0.5),
    minimumY: minimum[1],
    maximumY: maximum[1],
    halfExtents: minimum.map((value, axis) => (maximum[axis] - value) * 0.5),
    measure:
      (maximum[0] - minimum[0])
      * (maximum[1] - minimum[1])
      * (maximum[2] - minimum[2])
  };
}

/**
 * Returns a stable renderer-neutral center-mass point. Its horizontal datum
 * comes from the largest authored hull volume and its height from the complete
 * non-track armor envelope, so fire control aims through the same geometry that
 * projectile collision will query instead of guessing from rendered height.
 */
export function getVehicleArmorAimPoint(unit) {
  const volumes = unit?.vehicleSpec?.armorCollision?.volumes ?? [];
  const activeVolumes = isVehicleTurretSeparated(unit)
    ? volumes.filter(volume => !volume.followsTurret)
    : volumes;
  const hullVolumes = activeVolumes.filter(volume => volume.part === 'hull');
  const candidates = (hullVolumes.length > 0 ? hullVolumes : activeVolumes)
    .map(volume => ({ volume, bounds: volumeAimBounds(volume) }))
    .sort((left, right) =>
      right.bounds.measure - left.bounds.measure
      || String(left.volume.id).localeCompare(String(right.volume.id)));
  const selected = candidates[0];
  if (!selected) return null;
  const transform = worldTransform(unit, selected.volume);
  const verticalVolumes = activeVolumes
    .filter(volume => volume.part !== 'track')
    .map(volume => {
      const bounds = volumeAimBounds(volume);
      const volumeTransform = worldTransform(unit, volume);
      const centerOffset = transformDirection(
        volumeTransform.orientation,
        bounds.center
      );
      const half = bounds.halfExtents;
      const verticalExtent =
        Math.abs(volumeTransform.orientation[3]) * half[0]
        + Math.abs(volumeTransform.orientation[4]) * half[1]
        + Math.abs(volumeTransform.orientation[5]) * half[2];
      const centerY = volumeTransform.centerY + centerOffset[1];
      return {
        minimumY: centerY - verticalExtent,
        maximumY: centerY + verticalExtent
      };
    });
  const minimumY = Math.min(
    ...verticalVolumes.map(bounds => bounds.minimumY)
  );
  const maximumY = Math.max(
    ...verticalVolumes.map(bounds => bounds.maximumY)
  );
  const localCenter = selected.bounds.center;
  const worldCenterOffset = transformDirection(
    transform.orientation,
    localCenter
  );
  return {
    point: [
      transform.centerX + worldCenterOffset[0],
      Number.isFinite(minimumY) && Number.isFinite(maximumY)
        ? (minimumY + maximumY) * 0.5
        : transform.centerY + worldCenterOffset[1],
      transform.centerZ + worldCenterOffset[2]
    ],
    armorVolumeId: selected.volume.id,
    modelVersion: 'authored-armor-center-mass-v1',
    dataQuality:
      selected.volume.geometryQuality
      ?? unit.vehicleSpec.armorCollision.quality
      ?? 'unspecified'
  };
}

/**
 * Finds the outward plate reached after a projectile has entered one named
 * armor volume. Unlike the ordinary segment query, an OBB start-inside result
 * resolves its far face instead of returning t=0 at the entry point.
 */
export function traceVehicleArmorExit({
  unit,
  armorVolumeId,
  entryPoint,
  direction,
  maxDistanceMeters = null
}) {
  const volume = unit?.vehicleSpec?.armorCollision?.volumes
    ?.find(candidate => candidate.id === armorVolumeId);
  if (!volume) return null;
  const origin = vector(entryPoint);
  const incoming = vector(direction);
  const magnitude = Math.hypot(...incoming);
  if (magnitude <= EPSILON) return null;
  const normalizedDirection = incoming.map(component => component / magnitude);
  const dimensions = unit.vehicleSpec?.dimensionsMeters ?? {};
  const fallbackDistance = Math.hypot(
    finite(dimensions.length, 4),
    finite(dimensions.width),
    finite(dimensions.height)
  ) + 0.5;
  const maximum = Math.max(
    0.05,
    maxDistanceMeters == null
      ? fallbackDistance
      : finite(maxDistanceMeters, fallbackDistance)
  );
  const epsilon = 1e-4;
  const start = origin.map(
    (component, axis) => component + normalizedDirection[axis] * epsilon
  );
  const end = origin.map(
    (component, axis) => component + normalizedDirection[axis] * maximum
  );
  const exit = volume.shape === 'triangle-mesh'
    ? triangleMeshExit(start, end, unit, volume)
    : orientedBoxExit(start, end, unit, volume);
  if (!exit) return null;
  const point = vector(exit.point);
  return {
    ...exit,
    point,
    normal: vector(exit.normal),
    distanceMeters: Math.hypot(
      point[0] - origin[0],
      point[1] - origin[1],
      point[2] - origin[2]
    )
  };
}
