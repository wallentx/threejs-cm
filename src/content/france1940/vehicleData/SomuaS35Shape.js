const freezeRecords = records => Object.freeze(
  records.map(record => Object.freeze({ ...record }))
);

// Shared renderer/collision contour. Rear (-Z) to front (+Z), scene metres.
// Values are registered against s35-compare.jpg and the published rigid
// envelope; hidden casting curvature remains a labeled geometric inference.
export const SOMUA_S35_HULL_STATIONS = freezeRecords([
  { z: -2.69, floorHalf: 0.30, floorY: 0.75, lowerHalf: 0.40, lowerY: 0.94, sideHalf: 0.45, shoulderY: 1.10, roofHalf: 0.24, roofY: 1.24 },
  { z: -2.49, floorHalf: 0.62, floorY: 0.49, lowerHalf: 0.78, lowerY: 0.67, sideHalf: 0.82, shoulderY: 1.19, roofHalf: 0.62, roofY: 1.39 },
  { z: -2.14, floorHalf: 0.78, floorY: 0.34, lowerHalf: 0.95, lowerY: 0.55, sideHalf: 0.98, shoulderY: 1.28, roofHalf: 0.78, roofY: 1.47 },
  { z: -1.42, floorHalf: 0.82, floorY: 0.32, lowerHalf: 0.98, lowerY: 0.52, sideHalf: 1.00, shoulderY: 1.34, roofHalf: 0.80, roofY: 1.53 },
  { z: -0.48, floorHalf: 0.83, floorY: 0.32, lowerHalf: 1.00, lowerY: 0.52, sideHalf: 1.02, shoulderY: 1.39, roofHalf: 0.80, roofY: 1.60 },
  { z: 0.42, floorHalf: 0.83, floorY: 0.32, lowerHalf: 1.00, lowerY: 0.52, sideHalf: 1.02, shoulderY: 1.43, roofHalf: 0.78, roofY: 1.67 },
  { z: 1.12, floorHalf: 0.80, floorY: 0.34, lowerHalf: 0.97, lowerY: 0.54, sideHalf: 0.99, shoulderY: 1.40, roofHalf: 0.71, roofY: 1.64 },
  { z: 1.72, floorHalf: 0.75, floorY: 0.38, lowerHalf: 0.91, lowerY: 0.58, sideHalf: 0.94, shoulderY: 1.33, roofHalf: 0.60, roofY: 1.52 },
  { z: 2.18, floorHalf: 0.64, floorY: 0.45, lowerHalf: 0.82, lowerY: 0.63, sideHalf: 0.85, shoulderY: 1.21, roofHalf: 0.43, roofY: 1.36 },
  { z: 2.52, floorHalf: 0.48, floorY: 0.56, lowerHalf: 0.66, lowerY: 0.70, sideHalf: 0.69, shoulderY: 1.05, roofHalf: 0.25, roofY: 1.18 },
  { z: 2.69, floorHalf: 0.25, floorY: 0.73, lowerHalf: 0.35, lowerY: 0.79, sideHalf: 0.38, shoulderY: 0.91, roofHalf: 0.12, roofY: 1.00 }
]);

// Turret-local levels above the ring pivot at [0, 1.55, 0.55].
export const SOMUA_S35_TURRET_STATIONS = freezeRecords([
  { y: 0.00, halfWidth: 0.66, frontZ: 0.75, rearZ: 0.82 },
  { y: 0.30, halfWidth: 0.68, frontZ: 0.78, rearZ: 0.84 },
  { y: 0.58, halfWidth: 0.61, frontZ: 0.69, rearZ: 0.76 },
  { y: 0.72, halfWidth: 0.48, frontZ: 0.52, rearZ: 0.59 }
]);

export const SOMUA_S35_WEAPON_INSTALLATION = Object.freeze({
  main: Object.freeze({
    axisLocalX: 0.04,
    axisLocalY: 0.42,
    barrelBaseLocalZ: 0.78,
    barrelLength: 1.20,
    muzzleLocalZ: 1.98
  }),
  mantlet: Object.freeze({
    centerLocalZ: 0.76,
    depth: 0.17,
    radiusTop: 0.24,
    radiusBottom: 0.28
  }),
  coax: Object.freeze({
    axisLocalX: -0.18,
    axisLocalY: 0.43,
    barrelBaseLocalZ: 0.83,
    barrelLength: 0.46,
    muzzleLocalZ: 1.29,
    mountSide: 'right',
    mantletOverlapMeters: 0.015
  }),
  dataQuality:
    'user visual correction constrained by the registered APX 1 CE turret envelope; coax side is museum-corroborated, while exact mount offsets remain renderer inference'
});

const TURRET_PIVOT = Object.freeze([0, 1.55, 0.55]);
const HULL_RING_SIZE = 8;
const TURRET_SEGMENTS = 20;

function hullRing(station) {
  return [
    [-station.floorHalf, station.floorY, station.z],
    [-station.lowerHalf, station.lowerY, station.z],
    [-station.sideHalf, station.shoulderY, station.z],
    [-station.roofHalf, station.roofY, station.z],
    [station.roofHalf, station.roofY, station.z],
    [station.sideHalf, station.shoulderY, station.z],
    [station.lowerHalf, station.lowerY, station.z],
    [station.floorHalf, station.floorY, station.z]
  ];
}

function turretRing(station) {
  const points = [];
  for (let segment = 0; segment < TURRET_SEGMENTS; segment++) {
    const angle = segment / TURRET_SEGMENTS * Math.PI * 2;
    const cosine = Math.cos(angle);
    points.push([
      Math.sin(angle) * station.halfWidth,
      station.y,
      cosine * (cosine >= 0 ? station.frontZ : station.rearZ)
    ]);
  }
  return points;
}

function fanTriangles(offset, count, reverse = false) {
  const triangles = [];
  for (let point = 1; point < count - 1; point++) {
    triangles.push(reverse
      ? [offset, offset + point + 1, offset + point]
      : [offset, offset + point, offset + point + 1]);
  }
  return triangles;
}

function faceZones(zone) {
  return {
    positiveX: zone,
    negativeX: zone,
    positiveY: zone,
    negativeY: zone,
    positiveZ: zone,
    negativeZ: zone
  };
}

function fallbackZones(zone) {
  return {
    positiveX: zone,
    negativeX: zone,
    positiveY: zone,
    negativeY: zone,
    positiveZ: zone,
    negativeZ: zone
  };
}

function hullPlateMesh(armorMm, referenceUrl) {
  const rings = SOMUA_S35_HULL_STATIONS.map(hullRing);
  const vertices = rings.flat();
  const surfaces = [
    { id: 'right-lower-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'right-side-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'right-shoulder-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'roof-deck', zone: 'hull_top', thicknessZone: 'hull_side' },
    { id: 'left-shoulder-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'left-side-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'left-lower-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'belly', zone: 'hull_bottom', thicknessZone: 'hull_side' }
  ];
  const plates = [];
  for (let station = 0; station < rings.length - 1; station++) {
    const current = station * HULL_RING_SIZE;
    const next = current + HULL_RING_SIZE;
    for (let edge = 0; edge < HULL_RING_SIZE; edge++) {
      const following = (edge + 1) % HULL_RING_SIZE;
      const surface = surfaces[edge];
      plates.push({
        id: `${surface.id}-${String(station + 1).padStart(2, '0')}`,
        zone: surface.zone,
        fallbackZone: surface.thicknessZone,
        thicknessMm: surface.zone === 'hull_side' ? armorMm.hull_side : null,
        thicknessSourceZone: surface.thicknessZone,
        thicknessDataQuality: surface.zone === 'hull_side'
          ? 'historical nominal cast-hull zone value; local casting variation unavailable'
          : 'roof/belly thickness unavailable; explicit hull-side fallback',
        thicknessReferenceUrl: referenceUrl,
        triangles: [
          [current + edge, next + edge, current + following],
          [current + following, next + edge, next + following]
        ]
      });
    }
  }
  plates.push({
    id: 'rear-casting',
    zone: 'hull_rear',
    fallbackZone: 'hull_rear',
    thicknessMm: armorMm.hull_rear,
    thicknessSourceZone: 'hull_rear',
    thicknessDataQuality: 'historical nominal cast-hull zone value',
    thicknessReferenceUrl: referenceUrl,
    triangles: fanTriangles(0, HULL_RING_SIZE)
  });
  const front = (rings.length - 1) * HULL_RING_SIZE;
  plates.push({
    id: 'front-cast-nose',
    zone: 'hull_front',
    fallbackZone: 'hull_front',
    thicknessMm: armorMm.hull_front,
    thicknessSourceZone: 'hull_front',
    thicknessDataQuality: 'historical nominal cast-hull zone value',
    thicknessReferenceUrl: referenceUrl,
    triangles: fanTriangles(front, HULL_RING_SIZE, true)
  });
  return {
    id: 'hull-cast-shell',
    part: 'hull',
    shape: 'triangle-mesh',
    exitArmorPolicy: 'opposite_face',
    center: [0, 0, 0],
    interiorPoint: [0, 0.95, 0],
    vertices,
    plates,
    geometryQuality: 'exact shared authored SOMUA hull station mesh; curvature faceted between stations'
  };
}

function turretPlateMesh(armorMm, referenceUrl) {
  const rings = SOMUA_S35_TURRET_STATIONS.map(turretRing);
  const vertices = rings.flat();
  const plates = [];
  for (let level = 0; level < rings.length - 1; level++) {
    const lower = level * TURRET_SEGMENTS;
    const upper = lower + TURRET_SEGMENTS;
    for (let segment = 0; segment < TURRET_SEGMENTS; segment++) {
      const next = (segment + 1) % TURRET_SEGMENTS;
      const midpointAngle = (segment + 0.5) / TURRET_SEGMENTS * Math.PI * 2;
      const forward = Math.cos(midpointAngle);
      const zone = forward > 0.55
        ? 'turret_front'
        : forward < -0.55 ? 'turret_rear' : 'turret_side';
      plates.push({
        id: `${zone.replace('turret_', '')}-casting-${String(level + 1).padStart(2, '0')}-${String(segment + 1).padStart(2, '0')}`,
        zone,
        fallbackZone: zone,
        thicknessMm: armorMm[zone],
        thicknessSourceZone: zone,
        thicknessDataQuality: 'historical nominal APX turret zone value; local casting variation unavailable',
        thicknessReferenceUrl: referenceUrl,
        triangles: [
          [lower + segment, lower + next, upper + segment],
          [lower + next, upper + next, upper + segment]
        ]
      });
    }
  }
  plates.push({
    id: 'turret-bottom',
    zone: 'turret_bottom',
    fallbackZone: 'turret_side',
    thicknessMm: null,
    thicknessSourceZone: 'turret_side',
    thicknessDataQuality: 'turret-bottom thickness unavailable; explicit turret-side fallback',
    thicknessReferenceUrl: referenceUrl,
    triangles: fanTriangles(0, TURRET_SEGMENTS, true)
  });
  const top = (rings.length - 1) * TURRET_SEGMENTS;
  plates.push({
    id: 'turret-roof',
    zone: 'turret_top',
    fallbackZone: 'turret_side',
    thicknessMm: null,
    thicknessSourceZone: 'turret_side',
    thicknessDataQuality: 'turret-roof thickness unavailable; explicit turret-side fallback',
    thicknessReferenceUrl: referenceUrl,
    triangles: fanTriangles(top, TURRET_SEGMENTS)
  });
  return {
    id: 'turret-apx1ce-shell',
    part: 'turret',
    shape: 'triangle-mesh',
    exitArmorPolicy: 'opposite_face',
    center: TURRET_PIVOT,
    interiorPoint: [0, 0.34, 0],
    followsTurret: true,
    vertices,
    plates,
    geometryQuality: 'exact shared authored APX 1 CE station mesh; casting curvature faceted to 20 segments'
  };
}

export function createSomuaS35ArmorCollision(armorMm, referenceUrl) {
  const namedFaces = zone => faceZones(zone);
  const namedFallback = zone => fallbackZones(zone);
  return {
    version: 'named-triangle-plates-v2',
    quality: 'shared renderer/collision station meshes with explicit auxiliary running-gear, mantlet, and cupola volumes',
    volumes: [
      hullPlateMesh(armorMm, referenceUrl),
      turretPlateMesh(armorMm, referenceUrl),
      {
        id: 'gun-mantlet',
        part: 'mantlet',
        exitArmorPolicy: 'none',
        center: TURRET_PIVOT,
        offset: [
          SOMUA_S35_WEAPON_INSTALLATION.main.axisLocalX,
          SOMUA_S35_WEAPON_INSTALLATION.main.axisLocalY,
          SOMUA_S35_WEAPON_INSTALLATION.mantlet.centerLocalZ
        ],
        halfExtents: [
          SOMUA_S35_WEAPON_INSTALLATION.mantlet.radiusBottom,
          SOMUA_S35_WEAPON_INSTALLATION.mantlet.radiusBottom,
          SOMUA_S35_WEAPON_INSTALLATION.mantlet.depth * 0.5
        ],
        followsTurret: true,
        faceZones: namedFaces('mantlet'),
        fallbackZones: namedFallback('turret_front'),
        thicknessMm: armorMm.turret_front,
        thicknessSourceZone: 'turret_front',
        thicknessDataQuality: 'mantlet treated as nominal turret-front thickness; overlap unavailable',
        thicknessReferenceUrl: referenceUrl,
        geometryQuality:
          'authored mantlet envelope shared with the corrected renderer installation'
      },
      {
        id: 'commander-cupola',
        part: 'cupola',
        exitArmorPolicy: 'opposite_face',
        center: TURRET_PIVOT,
        offset: [0.02, 0.875, 0],
        halfExtents: [0.30, 0.175, 0.30],
        followsTurret: true,
        faceZones: namedFaces('cupola'),
        fallbackZones: namedFallback('turret_side'),
        thicknessMm: armorMm.turret_side,
        thicknessSourceZone: 'turret_side',
        thicknessDataQuality: 'cupola thickness unavailable; explicit turret-side fallback',
        thicknessReferenceUrl: referenceUrl,
        geometryQuality: 'authored closed-cupola envelope'
      },
      ...[-1, 1].map(side => {
        const zone = side < 0 ? 'track_right' : 'track_left';
        return {
          id: zone,
          part: 'track',
          exitArmorPolicy: 'none',
          center: [side * 0.8936, 0.585, 0],
          halfExtents: [0.16, 0.51, 2.50],
          faceZones: namedFaces(zone),
          fallbackZones: namedFallback('hull_side'),
          thicknessMm: 20,
          thicknessSourceZone: zone,
          thicknessDataQuality: 'gameplay approximation for variable track-link path thickness',
          thicknessReferenceUrl: referenceUrl,
          geometryQuality: 'exact authored track envelope; individual links not collision-resolved'
        };
      })
    ]
  };
}
