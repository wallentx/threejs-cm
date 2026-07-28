import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  defineMapDescriptor,
  validateMapDescriptor
} from '../src/maps/MapDescriptor.js';
import { STONNE_1940_MAP } from '../src/maps/france/stonne.js';
import { STONNE_1940_SCENARIO } from '../src/scenarios/france1940/stonne1940.js';

function assertDeepFrozen(value, path = 'map', seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, `${path}.${key}`, seen);
  }
}

function mutableMap() {
  return JSON.parse(JSON.stringify(STONNE_1940_MAP));
}

function useLegacyRect(map, rect = [60, 60, 400, 400]) {
  delete map.surfaces.layers[0].polygon;
  map.surfaces.layers[0].rect = rect;
  return map;
}

const GEOMETRY_EPSILON = 1e-9;
const ROAD_CONTAINMENT_STATION_SPACING = 16;

function orientation(a, b, c) {
  return (
    (b[0] - a[0]) * (c[1] - a[1])
    - (b[1] - a[1]) * (c[0] - a[0])
  );
}

function pointOnSegment(point, start, end) {
  return (
    Math.abs(orientation(start, end, point)) <= GEOMETRY_EPSILON
    && point[0] >= Math.min(start[0], end[0]) - GEOMETRY_EPSILON
    && point[0] <= Math.max(start[0], end[0]) + GEOMETRY_EPSILON
    && point[1] >= Math.min(start[1], end[1]) - GEOMETRY_EPSILON
    && point[1] <= Math.max(start[1], end[1]) + GEOMETRY_EPSILON
  );
}

function segmentsIntersectOrTouch(a, b, c, d) {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  if (
    ((abc > GEOMETRY_EPSILON && abd < -GEOMETRY_EPSILON)
      || (abc < -GEOMETRY_EPSILON && abd > GEOMETRY_EPSILON))
    && ((cda > GEOMETRY_EPSILON && cdb < -GEOMETRY_EPSILON)
      || (cda < -GEOMETRY_EPSILON && cdb > GEOMETRY_EPSILON))
  ) {
    return true;
  }
  return (
    pointOnSegment(c, a, b)
    || pointOnSegment(d, a, b)
    || pointOnSegment(a, c, d)
    || pointOnSegment(b, c, d)
  );
}

function pointInsidePolygonStrict(point, polygon) {
  for (let index = 0; index < polygon.length; index++) {
    if (pointOnSegment(point, polygon[index], polygon[(index + 1) % polygon.length])) {
      return false;
    }
  }
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const [currentU, currentV] = polygon[index];
    const [previousU, previousV] = polygon[previous];
    if (
      (currentV > point[1]) !== (previousV > point[1])
      && point[0] < (
        (previousU - currentU) * (point[1] - currentV)
        / (previousV - currentV)
        + currentU
      )
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonStrictlyContains(parent, child) {
  if (!child.every(point => pointInsidePolygonStrict(point, parent))) return false;
  for (let childIndex = 0; childIndex < child.length; childIndex++) {
    const childStart = child[childIndex];
    const childEnd = child[(childIndex + 1) % child.length];
    for (let parentIndex = 0; parentIndex < parent.length; parentIndex++) {
      if (
        segmentsIntersectOrTouch(
          childStart,
          childEnd,
          parent[parentIndex],
          parent[(parentIndex + 1) % parent.length]
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

function nonCollinearTurns(polygon) {
  return polygon.filter((point, index) => (
    Math.abs(orientation(
      polygon[(index + polygon.length - 1) % polygon.length],
      point,
      polygon[(index + 1) % polygon.length]
    )) > GEOMETRY_EPSILON
  ));
}

function isSubdividedRectangle(polygon) {
  const turns = nonCollinearTurns(polygon);
  if (turns.length !== 4) return false;
  const sides = turns.map((point, index) => {
    const next = turns[(index + 1) % turns.length];
    return [next[0] - point[0], next[1] - point[1]];
  });
  const lengths = sides.map(([u, v]) => Math.hypot(u, v));
  if (lengths.some(length => length <= GEOMETRY_EPSILON)) return false;
  const approximatelyZero = (value, scale) => (
    Math.abs(value) <= GEOMETRY_EPSILON * Math.max(1, scale)
  );
  const adjacentSidesArePerpendicular = sides.every((side, index) => {
    const next = sides[(index + 1) % sides.length];
    return approximatelyZero(
      side[0] * next[0] + side[1] * next[1],
      lengths[index] * lengths[(index + 1) % lengths.length]
    );
  });
  const oppositeSidesAreParallel = [0, 1].every(index => {
    const oppositeIndex = index + 2;
    return approximatelyZero(
      sides[index][0] * sides[oppositeIndex][1]
        - sides[index][1] * sides[oppositeIndex][0],
      lengths[index] * lengths[oppositeIndex]
    );
  });
  return adjacentSidesArePerpendicular && oppositeSidesAreParallel;
}

function horizontalBoundaryIntersections(polygon, stationV) {
  const intersections = [];
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (Math.abs(start[1] - end[1]) <= GEOMETRY_EPSILON) {
      if (Math.abs(stationV - start[1]) <= GEOMETRY_EPSILON) {
        intersections.push(start[0], end[0]);
      }
      continue;
    }
    if (
      stationV < Math.min(start[1], end[1]) - GEOMETRY_EPSILON
      || stationV > Math.max(start[1], end[1]) + GEOMETRY_EPSILON
    ) {
      continue;
    }
    const progress = (stationV - start[1]) / (end[1] - start[1]);
    if (progress >= -GEOMETRY_EPSILON && progress <= 1 + GEOMETRY_EPSILON) {
      intersections.push(start[0] + progress * (end[0] - start[0]));
    }
  }
  intersections.sort((a, b) => a - b);
  return intersections.filter((value, index) => (
    index === 0 || Math.abs(value - intersections[index - 1]) > GEOMETRY_EPSILON
  ));
}

function measureLongitudinalContainment(inner, outer) {
  const innerV = inner.map(([, v]) => v);
  const outerV = outer.map(([, v]) => v);
  const minV = Math.max(Math.min(...innerV), Math.min(...outerV));
  const maxV = Math.min(Math.max(...innerV), Math.max(...outerV));
  const breakpoints = [...new Set([
    minV,
    maxV,
    ...innerV.filter(v => v >= minV && v <= maxV),
    ...outerV.filter(v => v >= minV && v <= maxV)
  ])].sort((a, b) => a - b);
  const stations = new Set(breakpoints);
  // Both contours are piecewise linear and must have exactly two intersections.
  // Breakpoints plus each interval midpoint cover every boundary-segment pairing;
  // fixed stations add stable margin evidence across the full map texture.
  for (let index = 1; index < breakpoints.length; index++) {
    stations.add((breakpoints[index - 1] + breakpoints[index]) * 0.5);
  }
  for (
    let stationV = minV;
    stationV <= maxV;
    stationV += ROAD_CONTAINMENT_STATION_SPACING
  ) {
    stations.add(Math.min(stationV, maxV));
  }
  stations.add(maxV);

  const samples = [...stations].sort((a, b) => a - b).map(stationV => {
    const innerIntersections = horizontalBoundaryIntersections(inner, stationV);
    const outerIntersections = horizontalBoundaryIntersections(outer, stationV);
    assert.equal(
      innerIntersections.length,
      2,
      `inner road must have two boundary intersections at v=${stationV}`
    );
    assert.equal(
      outerIntersections.length,
      2,
      `outer shoulder must have two boundary intersections at v=${stationV}`
    );
    return {
      stationV,
      leftMargin: innerIntersections[0] - outerIntersections[0],
      rightMargin: outerIntersections[1] - innerIntersections[1]
    };
  });
  const leftMinimum = samples.reduce((minimum, sample) => (
    sample.leftMargin < minimum.leftMargin ? sample : minimum
  ));
  const rightMinimum = samples.reduce((minimum, sample) => (
    sample.rightMargin < minimum.rightMargin ? sample : minimum
  ));
  return {
    stationCount: samples.length,
    leftMargin: leftMinimum.leftMargin,
    leftMarginStationV: leftMinimum.stationV,
    rightMargin: rightMinimum.rightMargin,
    rightMarginStationV: rightMinimum.stationV,
    samples
  };
}

test('Stonne map owns immutable terrain, surface, feature, structure, and deployment records', () => {
  assert.equal(STONNE_1940_MAP.id, 'stonne-1940');
  assert.deepEqual(STONNE_1940_MAP.dimensions, {
    width: 240,
    depth: 240,
    segments: 60
  });
  assert.equal(STONNE_1940_MAP.elevation.waves.length, 2);
  assert.equal(STONNE_1940_MAP.river.centerZ, 10);
  assert.equal(STONNE_1940_MAP.river.waterWidth, 12);
  assert.equal(STONNE_1940_MAP.river.cutWidth, 24);
  assert.equal(STONNE_1940_MAP.bridge.span, 28);
  assert.equal(STONNE_1940_MAP.bridge.approachLength, 4);
  assert.match(
    STONNE_1940_MAP.bridge.approachDataQuality,
    /approximation/
  );
  assert.deepEqual(STONNE_1940_MAP.surfaces.riverBankMaterial, {
    color: 0x716b42,
    roughness: 0.98,
    metalness: 0,
    presentationApproximation:
      'renderer-only procedural riverbank material; not historical soil evidence'
  });
  assert.deepEqual(
    STONNE_1940_MAP.wallRuns.map(run => run.id),
    [
      'village_house_rear',
      'village_house_west',
      'village_house_east',
      'village_house_front_west',
      'village_house_front_east',
      'farmhouse_south',
      'farmhouse_north',
      'farmhouse_west',
      'farmhouse_east_south',
      'farmhouse_east_north'
    ]
  );
  assert.deepEqual(
    STONNE_1940_MAP.wallEnclosures.map(enclosure => ({
      id: enclosure.id,
      structureId: enclosure.structureId,
      gateIds: enclosure.gateOpenings.map(gate => gate.id)
    })),
    [
      {
        id: 'village-house-lot',
        structureId: 'french_village_house',
        gateIds: ['village-house-front-gate']
      },
      {
        id: 'farmhouse-lot',
        structureId: 'french_farmhouse_outbuilding',
        gateIds: ['farmhouse-east-gate']
      }
    ]
  );
  assert.ok(
    STONNE_1940_MAP.wallEnclosures.every(
      enclosure => enclosure.dataQuality.includes('not a surveyed historical Stonne boundary')
    )
  );
  assert.equal(STONNE_1940_MAP.structures.length, 2);
  assert.deepEqual(STONNE_1940_MAP.structures[0].position, [45, 60]);
  assert.deepEqual(STONNE_1940_MAP.structures[1], {
    id: 'french_farmhouse_outbuilding',
    descriptorId: 'fr_farmhouse_8x6_1f',
    visualAdapterId: 'fr_farmhouse_8x6_1f',
    position: [-45, 34],
    rotationY: Math.PI / 2,
    foundationClearance: 0.12,
    destructionThresholds: {
      approximation: 'gameplay approximation; not historical survey evidence',
      sectionCollapse: [
        { sectionId: 'ground-shell', atOrBelowHealthFraction: 0.12 },
        { sectionId: 'roof', atOrBelowHealthFraction: 0.18 }
      ]
    }
  });
  assert.equal(Object.isFrozen(STONNE_1940_MAP.structures[1]), true);
  assert.equal(STONNE_1940_MAP.foliage.length, 5);
  assert.ok(STONNE_1940_MAP.surfaces.layers.every(layer => layer.visualOnly));
  assert.deepEqual(
    STONNE_1940_MAP.surfaces.layers.map(layer => layer.id),
    [
      'field-northwest',
      'field-northwest-detail',
      'field-northeast',
      'field-southwest',
      'field-southwest-detail',
      'field-southeast',
      'road-north-south-shoulder',
      'road-north-south'
    ]
  );
  assert.deepEqual(
    STONNE_1940_MAP.surfaces.layers.map(({ id, kind, color }) => ({
      id,
      kind,
      color
    })),
    [
      { id: 'field-northwest', kind: 'field', color: '#b09943' },
      {
        id: 'field-northwest-detail',
        kind: 'field-detail',
        color: '#c0a951'
      },
      { id: 'field-northeast', kind: 'field', color: '#567a3a' },
      { id: 'field-southwest', kind: 'field', color: '#9e893c' },
      {
        id: 'field-southwest-detail',
        kind: 'field-detail',
        color: '#af9848'
      },
      { id: 'field-southeast', kind: 'field', color: '#6f8242' },
      {
        id: 'road-north-south-shoulder',
        kind: 'road-shoulder',
        color: '#806a4d'
      },
      { id: 'road-north-south', kind: 'road', color: '#92704a' }
    ]
  );
  assert.ok(
    STONNE_1940_MAP.surfaces.layers.every(
      layer => Object.hasOwn(layer, 'polygon') && !Object.hasOwn(layer, 'rect')
    )
  );
  for (const layer of STONNE_1940_MAP.surfaces.layers) {
    assert.ok(layer.polygon.length > 4, `${layer.id} must have an irregular outline`);
    assert.equal(
      isSubdividedRectangle(layer.polygon),
      false,
      `${layer.id} must not be a subdivided rectangle at any orientation`
    );
  }
  const fieldDetails = STONNE_1940_MAP.surfaces.layers.filter(
    layer => layer.kind === 'field-detail'
  );
  assert.equal(fieldDetails.length, 2);
  const southeastField = STONNE_1940_MAP.surfaces.layers.find(
    layer => layer.id === 'field-southeast'
  );
  assert.ok(southeastField.polygon.every(([u, v]) => u > 512 && v > 512));
  const roadIndex = STONNE_1940_MAP.surfaces.layers.findIndex(
    layer => layer.id === 'road-north-south'
  );
  const road = STONNE_1940_MAP.surfaces.layers[roadIndex];
  const shoulder = STONNE_1940_MAP.surfaces.layers[roadIndex - 1];
  assert.equal(shoulder.id, 'road-north-south-shoulder');
  const roadContainment = measureLongitudinalContainment(
    road.polygon,
    shoulder.polygon
  );
  assert.equal(roadContainment.stationCount, 77);
  assert.deepEqual(
    {
      leftMargin: roadContainment.leftMargin,
      leftMarginStationV: roadContainment.leftMarginStationV,
      rightMargin: roadContainment.rightMargin,
      rightMarginStationV: roadContainment.rightMarginStationV
    },
    {
      leftMargin: 19,
      leftMarginStationV: 0,
      rightMargin: 19,
      rightMarginStationV: 0
    }
  );
  const layersById = new Map(
    STONNE_1940_MAP.surfaces.layers.map(layer => [layer.id, layer])
  );
  const detailParents = {
    'field-northwest-detail': 'field-northwest',
    'field-southwest-detail': 'field-southwest'
  };
  assert.deepEqual(fieldDetails.map(layer => layer.id), Object.keys(detailParents));
  for (const [detailId, parentId] of Object.entries(detailParents)) {
    assert.equal(
      polygonStrictlyContains(
        layersById.get(parentId).polygon,
        layersById.get(detailId).polygon
      ),
      true,
      `${detailId} must remain strictly inset within ${parentId}`
    );
  }
  assert.ok(STONNE_1940_MAP.foliage.every(entry => entry.visualOnly));
  assert.deepEqual(Object.keys(STONNE_1940_MAP.deploymentZones), ['french', 'german']);
  assertDeepFrozen(STONNE_1940_MAP);
});

test('surface geometry checks reject shapes accepted by the former weak heuristics', () => {
  const subdividedRectangle = [
    [0, 0],
    [4, 0],
    [10, 0],
    [10, 5],
    [10, 10],
    [6, 10],
    [0, 10],
    [0, 4]
  ];
  assert.ok(subdividedRectangle.length > 4);
  assert.ok(new Set(subdividedRectangle.map(([u]) => u)).size > 2);
  assert.ok(new Set(subdividedRectangle.map(([, v]) => v)).size > 2);
  assert.equal(nonCollinearTurns(subdividedRectangle).length, 4);
  assert.equal(isSubdividedRectangle(subdividedRectangle), true);

  const rotatedSubdividedRectangle = [
    [0, -4],
    [2, -2],
    [4, 0],
    [2, 2],
    [0, 4],
    [-2, 2],
    [-4, 0],
    [-2, -2]
  ];
  const formerAxisAlignedGate = rotatedSubdividedRectangle.every(
    (point, index) => {
      const next = rotatedSubdividedRectangle[
        (index + 1) % rotatedSubdividedRectangle.length
      ];
      return point[0] === next[0] || point[1] === next[1];
    }
  );
  assert.equal(formerAxisAlignedGate, false);
  assert.equal(nonCollinearTurns(rotatedSubdividedRectangle).length, 4);
  assert.equal(isSubdividedRectangle(rotatedSubdividedRectangle), true);

  const genuinelyIrregularQuadrilateral = [
    [0, 0],
    [6, 1],
    [4, 6],
    [-1, 4]
  ];
  assert.equal(nonCollinearTurns(genuinelyIrregularQuadrilateral).length, 4);
  assert.equal(isSubdividedRectangle(genuinelyIrregularQuadrilateral), false);

  const adversarialRoad = [
    [4, 0],
    [6, 0],
    [6, 4],
    [6, 10],
    [4, 10],
    [4, 6]
  ];
  const globallyWiderButPinchedShoulder = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 6],
    [5, 5],
    [0, 4]
  ];
  assert.ok(
    Math.min(...globallyWiderButPinchedShoulder.map(([u]) => u))
      < Math.min(...adversarialRoad.map(([u]) => u))
  );
  assert.ok(
    Math.max(...globallyWiderButPinchedShoulder.map(([u]) => u))
      > Math.max(...adversarialRoad.map(([u]) => u))
  );
  const pinchedContainment = measureLongitudinalContainment(
    adversarialRoad,
    globallyWiderButPinchedShoulder
  );
  assert.ok(pinchedContainment.leftMargin < 0);

  const parentField = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const escapingFieldDetail = [
    [2, 2],
    [8, 1],
    [12, 5],
    [8, 9],
    [3, 8],
    [1, 5]
  ];
  assert.ok(escapingFieldDetail.length > 4);
  assert.ok(new Set(escapingFieldDetail.map(([u]) => u)).size > 2);
  assert.ok(new Set(escapingFieldDetail.map(([, v]) => v)).size > 2);
  assert.equal(polygonStrictlyContains(parentField, escapingFieldDetail), false);

  const concaveParentField = [
    [0, 0],
    [10, 0],
    [10, 10],
    [7, 10],
    [7, 3],
    [3, 3],
    [3, 10],
    [0, 10]
  ];
  const vertexInsideButEdgeEscapes = [
    [1, 8],
    [2, 4],
    [8, 4],
    [9, 8],
    [8, 2],
    [2, 2]
  ];
  assert.equal(
    vertexInsideButEdgeEscapes.every(
      point => pointInsidePolygonStrict(point, concaveParentField)
    ),
    true
  );
  const childEdgeCrossesParent = vertexInsideButEdgeEscapes.some(
    (childStart, childIndex) => {
      const childEnd = vertexInsideButEdgeEscapes[
        (childIndex + 1) % vertexInsideButEdgeEscapes.length
      ];
      return concaveParentField.some((parentStart, parentIndex) => (
        segmentsIntersectOrTouch(
          childStart,
          childEnd,
          parentStart,
          concaveParentField[(parentIndex + 1) % concaveParentField.length]
        )
      ));
    }
  );
  assert.equal(childEdgeCrossesParent, true);
  assert.equal(
    polygonStrictlyContains(concaveParentField, vertexInsideButEdgeEscapes),
    false
  );
});

test('scenario references the selected map while the map solely owns deployment zones', () => {
  assert.equal(STONNE_1940_SCENARIO.mapId, STONNE_1940_MAP.id);
  assert.equal(Object.hasOwn(STONNE_1940_SCENARIO, 'deploymentZones'), false);
  assert.ok(STONNE_1940_MAP.deploymentZones.french);
  assert.ok(STONNE_1940_MAP.deploymentZones.german);
});

test('map definition clones plain input before deep freezing it', () => {
  const source = mutableMap();
  source.id = 'cloned-map';
  const defined = defineMapDescriptor(source);
  source.wallRuns[0].start[0] = -1;
  source.wallEnclosures[0].gateOpenings[0].start[0] = -1;
  source.deploymentZones.french.minX = -1;

  assert.equal(defined.wallRuns[0].start[0], 32);
  assert.equal(defined.wallEnclosures[0].gateOpenings[0].start[0], 42);
  assert.equal(defined.deploymentZones.french.minX, -80);
  assertDeepFrozen(defined);
});

test('map validation rejects malformed extents, duplicate IDs, bad features, and invalid zones', () => {
  const cases = [
    [map => { map.dimensions.width = 0; }, /dimensions\.width/],
    [map => { map.surfaces.textureResolution[0] = 1.5; }, /positive integer/],
    [map => { map.surfaces.layers[0].visualOnly = false; }, /explicitly declare visualOnly/],
    [map => { useLegacyRect(map, [60, 60, 2000, 400]); }, /outside texture bounds/],
    [map => { delete map.surfaces.riverBankMaterial; }, /riverBankMaterial/],
    [map => { map.surfaces.riverBankMaterial.color = {}; }, /color string or 24-bit integer/],
    [map => { map.surfaces.riverBankMaterial.roughness = 2; }, /roughness must be between/],
    [map => { map.surfaces.riverBankMaterial.presentationApproximation = ''; }, /presentationApproximation requires/],
    [map => { map.surfaces.riverBankMaterial.presentationApproximation = '   '; }, /presentationApproximation requires/],
    [map => { map.surfaces.waterMaterial.opacity = 2; }, /opacity must be between/],
    [map => { map.elevation.waves[0].axis = 'y'; }, /axis must be x or z/],
    [map => { map.bridge.id = map.river.id; }, /duplicate feature id/],
    [map => { map.bridge.centerZ += 1; }, /must align/],
    [map => { map.bridge.span = map.river.cutWidth; }, /span must exceed/],
    [map => { map.bridge.approachLength = 0; }, /approachLength/],
    [map => { map.bridge.approachDataQuality = ''; }, /approachDataQuality/],
    [map => { map.wallRuns[0].end = [...map.wallRuns[0].start]; }, /distinct endpoints/],
    [map => { map.structures[0].descriptorId = ''; }, /descriptorId requires/],
    [map => { map.wallEnclosures = {}; }, /wallEnclosures must be an array/],
    [map => { map.wallEnclosures[0].structureId = 'missing'; }, /unknown structure/],
    [map => { map.wallEnclosures[0].dataQuality = ''; }, /dataQuality requires/],
    [map => { map.wallEnclosures[0].gateOpenings = []; }, /gateOpenings must be a non-empty array/],
    [map => {
      map.wallEnclosures[0].gateOpenings[0].end =
        [...map.wallEnclosures[0].gateOpenings[0].start];
    }, /gateOpenings\[0\] requires distinct endpoints/],
    [map => { map.wallRuns[0].enclosureId = 'missing'; }, /unknown enclosure/],
    [map => {
      map.wallRuns[0].adjacentGateId = 'farmhouse-east-gate';
    }, /gate outside enclosure/],
    [map => { map.foliage[0].visualOnly = false; }, /explicitly declare visualOnly/],
    [map => { map.deploymentZones.french.maxZ = 200; }, /outside map bounds/]
  ];

  for (const [mutate, pattern] of cases) {
    const map = mutableMap();
    mutate(map);
    assert.throws(() => validateMapDescriptor(map), pattern);
  }
});

test('surface layers accept one legacy rectangle or ordered polygon and reject invalid polygons', () => {
  const legacyMap = useLegacyRect(mutableMap());
  const definedLegacyMap = defineMapDescriptor(legacyMap);
  assert.deepEqual(definedLegacyMap.surfaces.layers[0].rect, [60, 60, 400, 400]);
  assert.equal(Object.hasOwn(definedLegacyMap.surfaces.layers[0], 'polygon'), false);

  const reversedMap = mutableMap();
  const reversed = [...reversedMap.surfaces.layers[0].polygon].reverse();
  reversedMap.surfaces.layers[0].polygon = reversed;
  const definedReversedMap = defineMapDescriptor(reversedMap);
  assert.deepEqual(definedReversedMap.surfaces.layers[0].polygon, reversed);
  assertDeepFrozen(definedReversedMap.surfaces.layers[0].polygon);

  const cases = [
    [
      map => { map.surfaces.layers[0].rect = [60, 60, 400, 400]; },
      /exactly one shape/
    ],
    [
      map => { delete map.surfaces.layers[0].polygon; },
      /exactly one shape/
    ],
    [
      map => { map.surfaces.layers[0].polygon = [[0, 0], [10, 0]]; },
      /at least three points/
    ],
    [
      map => { map.surfaces.layers[0].polygon = [[0, 0], [10], [0, 10]]; },
      /must contain 2 values/
    ],
    [
      map => { map.surfaces.layers[0].polygon[0][0] = Infinity; },
      /must be finite/
    ],
    [
      map => { map.surfaces.layers[0].polygon[0][0] = -1; },
      /outside texture bounds/
    ],
    [
      map => {
        map.surfaces.layers[0].polygon[0][1] =
          map.surfaces.textureResolution[1] + 1;
      },
      /outside texture bounds/
    ],
    [
      map => {
        map.surfaces.layers[0].polygon[1] =
          [...map.surfaces.layers[0].polygon[0]];
      },
      /distinct consecutive vertices/
    ],
    [
      map => {
        map.surfaces.layers[0].polygon.push(
          [...map.surfaces.layers[0].polygon[0]]
        );
      },
      /distinct consecutive vertices/
    ],
    [
      map => {
        map.surfaces.layers[0].polygon = [[100, 100], [200, 200], [300, 300]];
      },
      /non-zero area/
    ],
    [
      map => {
        map.surfaces.layers[0].polygon = [
          [100, 100],
          [300, 300],
          [100, 300],
          [300, 100]
        ];
      },
      /must not self-intersect/
    ]
  ];

  for (const [mutate, pattern] of cases) {
    const map = mutableMap();
    mutate(map);
    assert.throws(() => validateMapDescriptor(map), pattern);
  }
});

test('map data and generic terrain builder keep concrete runtime dependencies one-way', async () => {
  const [schemaSource, stonneSource, terrainSource] = await Promise.all([
    readFile(new URL('../src/maps/MapDescriptor.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/maps/france/stonne.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/TerrainBuilder.js', import.meta.url), 'utf8')
  ]);

  for (const source of [schemaSource, stonneSource]) {
    assert.doesNotMatch(source, /\b(?:THREE|document|window|HTMLElement)\b/);
    assert.doesNotMatch(source, /^import\s.+?from\s+['"].*\/(?:game|world|ui|main)\//m);
  }
  assert.doesNotMatch(terrainSource, /stonne|FR_HOUSE_12X9_2F|FrenchHouse/);
  assert.doesNotMatch(terrainSource, /createWallRun\(-75|treePositions|hx = 45|hz = 60/);
});
