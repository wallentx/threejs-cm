import {
  SOMUA_S35_VISUAL_DATA
} from './SomuaS35VisualData.js';
import {
  SOMUA_S35_REFERENCE_REGISTRATION
} from './SomuaS35ReferenceGeometry.js';

// Shared renderer/collision contour. Rear (-Z) to front (+Z), scene metres.
// Values consume the checked-in four-view source registration and published
// rigid envelope; hidden casting curvature remains a labeled inference.
export const SOMUA_S35_HULL_STATIONS =
  SOMUA_S35_VISUAL_DATA.geometry.hullStations;

// Turret-local levels above the ring pivot at [0, 1.55, 0.55].
export const SOMUA_S35_TURRET_STATIONS =
  SOMUA_S35_VISUAL_DATA.geometry.turret.stations;

export const SOMUA_S35_WEAPON_INSTALLATION = Object.freeze({
  main: Object.freeze({
    axisLocalX: 0.04,
    axisLocalY: 0.42,
    barrelBaseLocalZ: 0.99,
    barrelLength: 1.13,
    muzzleLocalZ: 2.12
  }),
  mantlet: Object.freeze({
    centerLocalZ: 0.97,
    depth: SOMUA_S35_VISUAL_DATA.geometry.turret.mantlet.depth,
    radiusTop: 0.32,
    radiusBottom: 0.35
  }),
  coax: Object.freeze({
    axisLocalX: -0.18,
    axisLocalY: 0.43,
    barrelBaseLocalZ: 1.036,
    barrelLength: 0.46,
    muzzleLocalZ: 1.495,
    mountSide: 'right',
    mantletOverlapMeters: 0.015
  }),
  dataQuality:
    'user visual correction constrained by the registered APX 1 CE turret envelope; coax side is museum-corroborated, while exact mount offsets remain renderer inference'
});

const TURRET_PIVOT = Object.freeze([0, 1.55, 0.55]);
const HULL_RING_SIZE = 10;
const HULL_SOURCE_MAX_HALF_WIDTH = Math.max(...SOMUA_S35_HULL_STATIONS.flatMap(
  station => [
    station.bottomHalfWidth,
    station.lowerHalfWidth,
    station.shoulderHalfWidth,
    station.upperHalfWidth,
    station.deckHalfWidth
  ]
));
const HULL_TRANSVERSE_REGISTRATION_SCALE = (
  SOMUA_S35_VISUAL_DATA.dimensionsMeters.width * 0.5
) / HULL_SOURCE_MAX_HALF_WIDTH;

function hullRing(station) {
  const x = value => value * HULL_TRANSVERSE_REGISTRATION_SCALE;
  return [
    [-x(station.bottomHalfWidth), station.bottomY, station.z],
    [x(station.bottomHalfWidth), station.bottomY, station.z],
    [x(station.lowerHalfWidth), station.lowerY, station.z],
    [x(station.shoulderHalfWidth), station.shoulderY, station.z],
    [x(station.upperHalfWidth), station.upperY, station.z],
    [x(station.deckHalfWidth), station.deckY, station.z],
    [-x(station.deckHalfWidth), station.deckY, station.z],
    [-x(station.upperHalfWidth), station.upperY, station.z],
    [-x(station.shoulderHalfWidth), station.shoulderY, station.z],
    [-x(station.lowerHalfWidth), station.lowerY, station.z]
  ];
}

function signedMeshVolume(positions, indices) {
  let volume = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = positions[indices[offset]];
    const b = positions[indices[offset + 1]];
    const c = positions[indices[offset + 2]];
    volume += (
      a[0] * (b[1] * c[2] - b[2] * c[1])
      + a[1] * (b[2] * c[0] - b[0] * c[2])
      + a[2] * (b[0] * c[1] - b[1] * c[0])
    ) / 6;
  }
  return volume;
}

function closedLoftMeshData(rings) {
  const ringSize = rings[0].length;
  if (rings.length < 2 || ringSize < 3 || rings.some(ring => ring.length !== ringSize)) {
    throw new RangeError('SOMUA closed loft requires at least two equal-size rings');
  }
  const positions = rings.flat();
  const indices = [];
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const current = ring * ringSize;
    const next = current + ringSize;
    for (let edge = 0; edge < ringSize; edge += 1) {
      const following = (edge + 1) % ringSize;
      indices.push(
        current + edge, next + edge, current + following,
        current + following, next + edge, next + following
      );
    }
  }
  indices.push(...fanTriangles(0, ringSize).flat());
  indices.push(...fanTriangles((rings.length - 1) * ringSize, ringSize, true).flat());
  if (signedMeshVolume(positions, indices) < 0) {
    for (let offset = 0; offset < indices.length; offset += 3) {
      [indices[offset + 1], indices[offset + 2]] = [
        indices[offset + 2],
        indices[offset + 1]
      ];
    }
  }
  return { positions, indices, ringSize };
}

export function createSomuaS35HullLoftMeshData({ proxy = false } = {}) {
  const stationIndices = proxy
    ? SOMUA_S35_VISUAL_DATA.geometry.proxyHullStationIndices
    : SOMUA_S35_HULL_STATIONS.map((_, index) => index);
  return closedLoftMeshData(
    stationIndices.map(index => hullRing(SOMUA_S35_HULL_STATIONS[index]))
  );
}

export function createSomuaS35TurretLoftMeshData({ proxy = false } = {}) {
  const stationIndices = proxy
    ? SOMUA_S35_VISUAL_DATA.geometry.turret.proxyStationIndices
    : SOMUA_S35_TURRET_STATIONS.map((_, index) => index);
  return closedLoftMeshData(stationIndices.map(index => {
    const station = SOMUA_S35_TURRET_STATIONS[index];
    return station.planVertices.map(([x, z]) => [x, station.y, z]);
  }));
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
  const vertices = createSomuaS35HullLoftMeshData().positions;
  const surfaces = [
    { id: 'belly', zone: 'hull_bottom', thicknessZone: 'hull_side' },
    { id: 'left-lower-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'left-side-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'left-shoulder-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'left-upper-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'roof-deck', zone: 'hull_top', thicknessZone: 'hull_side' },
    { id: 'right-upper-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'right-shoulder-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'right-side-casting', zone: 'hull_side', thicknessZone: 'hull_side' },
    { id: 'right-lower-casting', zone: 'hull_side', thicknessZone: 'hull_side' }
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
    geometryQuality: 'source-owned ten-point cast-hull station mesh shared with rendering; hidden curvature faceted between registered stations'
  };
}

function turretPlateMesh(armorMm, referenceUrl) {
  const reference = createSomuaS35TurretLoftMeshData();
  const vertices = reference.positions;
  const zValues = vertices.map(vertex => vertex[2]);
  const frontZ = Math.max(...zValues);
  const rearZ = Math.min(...zValues);
  const trianglesByZone = new Map([
    ['turret_front', []],
    ['turret_side', []],
    ['turret_rear', []],
    ['turret_top', []],
    ['turret_bottom', []]
  ]);
  for (let offset = 0; offset < reference.indices.length; offset += 3) {
    const triangle = reference.indices.slice(offset, offset + 3);
    const [a, b, c] = triangle.map(index => vertices[index]);
    const edgeA = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const edgeB = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normalY = edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2];
    const normalLength = Math.hypot(
      edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
      normalY,
      edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0]
    );
    const verticalFacing = normalLength > 0 ? normalY / normalLength : 0;
    const centerZ = (a[2] + b[2] + c[2]) / 3;
    let zone = 'turret_side';
    if (verticalFacing > 0.55) zone = 'turret_top';
    else if (verticalFacing < -0.55) zone = 'turret_bottom';
    else if (centerZ > frontZ * 0.55) zone = 'turret_front';
    else if (centerZ < rearZ * 0.55) zone = 'turret_rear';
    trianglesByZone.get(zone).push(triangle);
  }
  const plates = [...trianglesByZone.entries()]
    .filter(([, triangles]) => triangles.length > 0)
    .map(([zone, triangles]) => {
      const hasHistoricalThickness = !['turret_top', 'turret_bottom'].includes(zone);
      const thicknessZone = hasHistoricalThickness ? zone : 'turret_side';
      return {
        id: `glb-${zone.replace('turret_', '')}-casting`,
        zone,
        fallbackZone: thicknessZone,
        thicknessMm: hasHistoricalThickness ? armorMm[zone] : null,
        thicknessSourceZone: thicknessZone,
        thicknessDataQuality: hasHistoricalThickness
          ? 'historical nominal APX turret zone value; local casting variation unavailable'
          : `${zone.replace('turret_', '')} thickness unavailable; explicit turret-side fallback`,
        thicknessReferenceUrl: referenceUrl,
        triangles
      };
    });
  return {
    id: 'turret-apx1ce-shell',
    part: 'turret',
    shape: 'triangle-mesh',
    exitArmorPolicy: 'opposite_face',
    center: TURRET_PIVOT,
    interiorPoint: [0, 0.40, 0.075],
    followsTurret: true,
    vertices,
    plates,
    sourceNodeName: 'registered-four-view-apx1ce-closed-loft',
    sourceSha256: SOMUA_S35_REFERENCE_REGISTRATION.source.sha256,
    sourceLicense: SOMUA_S35_REFERENCE_REGISTRATION.source.license,
    geometryQuality: 'closed four-view station loft shared exactly with rendering; no decimation, shell thickening, or boundary-loop fan caps'
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
        offset: [
          SOMUA_S35_VISUAL_DATA.geometry.turret.cupola.centerX,
          (
            SOMUA_S35_VISUAL_DATA.geometry.turret.cupola.baseY
            + SOMUA_S35_VISUAL_DATA.geometry.turret.cupola.topY
          ) * 0.5,
          SOMUA_S35_VISUAL_DATA.geometry.turret.cupola.centerZ
        ],
        halfExtents: [
          SOMUA_S35_VISUAL_DATA.geometry.turret.cupola.lateralRadius,
          (
            SOMUA_S35_VISUAL_DATA.geometry.turret.cupola.topY
            - SOMUA_S35_VISUAL_DATA.geometry.turret.cupola.baseY
          ) * 0.5,
          SOMUA_S35_VISUAL_DATA.geometry.turret.cupola.longitudinalRadius
        ],
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
