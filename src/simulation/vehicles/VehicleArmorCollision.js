import { intersectSegmentOrientedBox3D } from '../geometry/OrientedBox.js';

const EPSILON = 1e-8;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function rotateLocalXZ(x, z, rotation) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: cosine * x + sine * z,
    z: -sine * x + cosine * z
  };
}

function toLocalVector(vector, rotation) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: finite(vector[0] ?? vector.x) * cosine - finite(vector[2] ?? vector.z) * sine,
    y: finite(vector[1] ?? vector.y),
    z: finite(vector[0] ?? vector.x) * sine + finite(vector[2] ?? vector.z) * cosine
  };
}

function classifyFace(normal, rotation) {
  const local = toLocalVector(normal, rotation);
  const axes = [
    { magnitude: Math.abs(local.x), face: local.x >= 0 ? 'positiveX' : 'negativeX' },
    { magnitude: Math.abs(local.y), face: local.y >= 0 ? 'positiveY' : 'negativeY' },
    { magnitude: Math.abs(local.z), face: local.z >= 0 ? 'positiveZ' : 'negativeZ' }
  ];
  axes.sort((a, b) => b.magnitude - a.magnitude || a.face.localeCompare(b.face));
  return axes[0].face;
}

function worldTransform(unit, volume) {
  const hullRotation = finite(unit.rotation);
  const turretRotation = volume.followsTurret
    ? finite(unit.vehicleWeapon?.turretYaw)
    : 0;
  const rotation = hullRotation + turretRotation + finite(volume.rotation);
  const center = volume.center ?? [0, 0, 0];
  const pivotOffset = rotateLocalXZ(finite(center[0]), finite(center[2]), hullRotation);
  const offset = volume.offset ?? [0, 0, 0];
  const partOffset = rotateLocalXZ(finite(offset[0]), finite(offset[2]), rotation);
  return {
    centerX: finite(unit.position?.x) + pivotOffset.x + partOffset.x,
    centerY: finite(unit.position?.y) + finite(center[1]) + finite(offset[1]),
    centerZ: finite(unit.position?.z) + pivotOffset.z + partOffset.z,
    rotation
  };
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
  ], transform.rotation);
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

function worldNormal(localNormal, rotation) {
  const horizontal = rotateLocalXZ(localNormal[0], localNormal[2], rotation);
  return [horizontal.x, localNormal[1], horizontal.z];
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
        normal: worldNormal(outward, transform.rotation),
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
        normal: worldNormal(outward, transform.rotation),
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
  const face = classifyFace(reverse.normal, collider.rotation);
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
    ], collider.rotation)
  };
}

/**
 * Renderer-neutral swept query against authored model-local armor volumes.
 * Each intersected triangle or box face is a stable named plate.
 */
export function intersectVehicleArmor(start, end, unit) {
  const volumes = unit?.vehicleSpec?.armorCollision?.volumes ?? [];
  let closest = null;
  for (const volume of volumes) {
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
    const face = classifyFace(intersection.normal, collider.rotation);
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
      ], collider.rotation)
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
