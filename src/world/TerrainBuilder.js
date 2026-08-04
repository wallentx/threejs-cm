import * as THREE from 'three';
import { TERRAIN_SCALE } from './TerrainScale.js';
import { StaticCollisionWorld } from '../simulation/collision/StaticCollisionWorld.js';
import {
  DestructibleLinearObstacleSystem
} from '../simulation/terrain/DestructibleLinearObstacleSystem.js';
import {
  createTerrainSightOccluderSnapshot
} from '../simulation/terrain/TerrainSightOccluderSnapshot.js';

const QUAD_UVS = [
  0, 0,
  1, 0,
  1, 1,
  0, 1
];

// These control only the one-time visual surface tessellation. Terrain height,
// collision, and navigation continue to use getHeightAt() independently.
const RIVER_BANK_X_SUBDIVISIONS = 60;
const RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS = 6;
const RIVER_BANK_SURFACE_OFFSET = 0.03;
const RIVER_BANK_RENDERER_APPROXIMATION =
  'renderer-only bounded terrain samples and surface offset to prevent z-fighting';

function uniqueSortedCoordinates(values) {
  return [...new Set(values.map(value => Number(value.toFixed(9))))]
    .sort((left, right) => left - right);
}

function createRiverBankZCoordinates(river) {
  if (!river) return [];
  const coordinates = [];
  for (const direction of [-1, 1]) {
    const innerZ = river.centerZ
      + direction * river.waterWidth * 0.5;
    const outerZ = river.centerZ
      + direction * river.cutWidth * 0.5;
    for (
      let row = 0;
      row <= RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS;
      row++
    ) {
      coordinates.push(THREE.MathUtils.lerp(
        innerZ,
        outerZ,
        row / RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS
      ));
    }
  }
  return coordinates;
}

function createTerrainGridCoordinates({
  width,
  depth,
  segments,
  additionalZCoordinates = []
}) {
  const xCoordinates = Array.from(
    { length: segments + 1 },
    (_, index) => -width * 0.5 + width * index / segments
  );
  const zCoordinates = uniqueSortedCoordinates([
    ...Array.from(
      { length: segments + 1 },
      (_, index) => -depth * 0.5 + depth * index / segments
    ),
    ...additionalZCoordinates
  ]);
  return { x: xCoordinates, z: zCoordinates };
}

function createTerrainGridGeometry(options) {
  const {
    width,
    depth
  } = options;
  const {
    x: xCoordinates,
    z: zCoordinates
  } = createTerrainGridCoordinates(options);
  const positions = [];
  const uvs = [];
  for (const z of zCoordinates) {
    for (const x of xCoordinates) {
      positions.push(x, 0, z);
      uvs.push((x + width * 0.5) / width, (z + depth * 0.5) / depth);
    }
  }
  const indices = [];
  const columns = xCoordinates.length;
  for (let row = 0; row < zCoordinates.length - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const southWest = row * columns + column;
      const southEast = southWest + 1;
      const northWest = southWest + columns;
      const northEast = northWest + 1;
      indices.push(
        southWest,
        northWest,
        southEast,
        southEast,
        northWest,
        northEast
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.userData.gridCoordinates = {
    x: xCoordinates,
    z: zCoordinates
  };
  return geometry;
}

function findCoordinateInterval(coordinates, value) {
  if (value <= coordinates[0]) return 0;
  const last = coordinates.length - 1;
  if (value >= coordinates[last]) return last - 1;
  let low = 0;
  let high = last;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) * 0.5);
    if (coordinates[middle] <= value) low = middle;
    else high = middle;
  }
  return low;
}

function addQuad(positions, uvs, a, b, c, d, uScale = 1, vScale = 1) {
  for (const point of [a, b, c, a, c, d]) {
    positions.push(point.x, point.y, point.z);
  }
  for (const index of [0, 1, 2, 0, 2, 3]) {
    uvs.push(
      QUAD_UVS[index * 2] * uScale,
      QUAD_UVS[index * 2 + 1] * vScale
    );
  }
}

function addTriangle(positions, uvs, a, b, c) {
  for (const point of [a, b, c]) {
    positions.push(point.x, point.y, point.z);
  }
  uvs.push(0, 0, 1, 0, 0.5, 1);
}

function smoothstep01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function createMeterUvBoxGeometry(width, height, depth, metresPerRepeat) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const uvs = geometry.attributes.uv;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const nx = Math.abs(normals.getX(index));
    const ny = Math.abs(normals.getY(index));
    if (nx > 0.5) {
      uvs.setXY(index, z / metresPerRepeat, y / metresPerRepeat);
    } else if (ny > 0.5) {
      uvs.setXY(index, x / metresPerRepeat, z / metresPerRepeat);
    } else {
      uvs.setXY(index, x / metresPerRepeat, y / metresPerRepeat);
    }
  }
  uvs.needsUpdate = true;
  geometry.userData.metresPerUvRepeat = metresPerRepeat;
  return geometry;
}

/**
 * Builds one closed wall prism. Every footprint corner samples the terrain,
 * so both ends and both faces remain grounded on uneven slopes.
 */
export function createGroundConformingWallGeometry({
  start,
  end,
  height,
  thickness,
  getHeightAt
}) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0)) throw new Error('Wall segment length must be positive');

  const halfThickness = thickness * 0.5;
  const nx = -dz / length * halfThickness;
  const nz = dx / length * halfThickness;
  const groundPoint = (x, z) => new THREE.Vector3(x, getHeightAt(x, z), z);
  const bottomStartLeft = groundPoint(start.x + nx, start.z + nz);
  const bottomStartRight = groundPoint(start.x - nx, start.z - nz);
  const bottomEndRight = groundPoint(end.x - nx, end.z - nz);
  const bottomEndLeft = groundPoint(end.x + nx, end.z + nz);
  const top = (point) => point.clone().add(new THREE.Vector3(0, height, 0));
  const topStartLeft = top(bottomStartLeft);
  const topStartRight = top(bottomStartRight);
  const topEndRight = top(bottomEndRight);
  const topEndLeft = top(bottomEndLeft);

  const positions = [];
  const uvs = [];
  const heightScale = height / 0.3;
  const lengthScale = length / 0.6;
  const thicknessScale = thickness / 0.6;

  addQuad(
    positions, uvs,
    topStartLeft, topEndLeft, topEndRight, topStartRight,
    lengthScale, thicknessScale
  );
  addQuad(
    positions, uvs,
    bottomStartLeft, bottomStartRight, bottomEndRight, bottomEndLeft,
    thicknessScale, lengthScale
  );
  addQuad(
    positions, uvs,
    bottomStartLeft, bottomEndLeft, topEndLeft, topStartLeft,
    lengthScale, heightScale
  );
  addQuad(
    positions, uvs,
    bottomStartRight, topStartRight, topEndRight, bottomEndRight,
    heightScale, lengthScale
  );
  addQuad(
    positions, uvs,
    bottomStartLeft, topStartLeft, topStartRight, bottomStartRight,
    heightScale, thicknessScale
  );
  addQuad(
    positions, uvs,
    bottomEndLeft, bottomEndRight, topEndRight, topEndLeft,
    thicknessScale, heightScale
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.footprintCorners = [
    bottomStartLeft.toArray(),
    bottomStartRight.toArray(),
    bottomEndRight.toArray(),
    bottomEndLeft.toArray()
  ];
  return geometry;
}

/**
 * Builds one indexed vertical ribbon whose lower edge follows the terrain.
 * Material alpha testing supplies the fence openings; collision remains a
 * separate profile-driven series of oriented records.
 */
export function createGroundConformingFenceCardGeometry({
  start,
  end,
  height,
  thickness,
  maximumSegmentLength,
  textureRepeatMeters,
  groundOffset = 0,
  getHeightAt
}) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0)) throw new Error('Fence run length must be positive');
  if (!(height > 0) || !(thickness > 0)
      || !(maximumSegmentLength > 0) || !(textureRepeatMeters > 0)) {
    throw new Error('Fence card dimensions must be positive');
  }
  if (typeof getHeightAt !== 'function') {
    throw new TypeError('Fence card requires getHeightAt');
  }

  const segmentCount = Math.ceil(length / maximumSegmentLength);
  const positions = [];
  const uvs = [];
  const indices = [];
  const segmentVertexIndices = Array.from(
    { length: segmentCount },
    () => []
  );
  const groundSamples = [];
  const samples = [];
  const halfThickness = thickness * 0.5;
  const normalX = -dz / length * halfThickness;
  const normalZ = dx / length * halfThickness;
  for (let index = 0; index <= segmentCount; index++) {
    const progress = index / segmentCount;
    const x = start.x + dx * progress;
    const z = start.z + dz * progress;
    const groundY = getHeightAt(x, z);
    const bottomY = groundY + groundOffset;
    const u = length * progress / textureRepeatMeters;
    samples.push({
      leftBottom: new THREE.Vector3(x + normalX, bottomY, z + normalZ),
      rightBottom: new THREE.Vector3(x - normalX, bottomY, z - normalZ),
      leftTop: new THREE.Vector3(x + normalX, bottomY + height, z + normalZ),
      rightTop: new THREE.Vector3(x - normalX, bottomY + height, z - normalZ),
      u
    });
    groundSamples.push([x, groundY, z]);
  }
  const addIndexedQuad = (points, coordinates, segmentIndex) => {
    const base = positions.length / 3;
    for (const point of points) positions.push(point.x, point.y, point.z);
    for (const [u, v] of coordinates) uvs.push(u, v);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    segmentVertexIndices[segmentIndex].push(
      base,
      base + 1,
      base + 2,
      base + 3
    );
  };
  for (let index = 0; index < segmentCount; index++) {
    const from = samples[index];
    const to = samples[index + 1];
    const sideUvs = [
      [from.u, 0],
      [to.u, 0],
      [to.u, 1],
      [from.u, 1]
    ];
    addIndexedQuad(
      [from.leftBottom, to.leftBottom, to.leftTop, from.leftTop],
      sideUvs,
      index
    );
    addIndexedQuad(
      [to.rightBottom, from.rightBottom, from.rightTop, to.rightTop],
      [
        [to.u, 0],
        [from.u, 0],
        [from.u, 1],
        [to.u, 1]
      ],
      index
    );
    // The top samples a picket-only band in the same repeating texture, so
    // every visible top cap aligns with the upright below it while gaps remain
    // true alpha-tested holes.
    addIndexedQuad(
      [from.leftTop, to.leftTop, to.rightTop, from.rightTop],
      [
        [from.u, 0.88],
        [to.u, 0.88],
        [to.u, 0.98],
        [from.u, 0.98]
      ],
      index
    );
  }
  const first = samples[0];
  const last = samples.at(-1);
  const endCapUvs = [[0, 0], [0.06, 0], [0.06, 1], [0, 1]];
  addIndexedQuad(
    [first.rightBottom, first.leftBottom, first.leftTop, first.rightTop],
    endCapUvs,
    0
  );
  addIndexedQuad(
    [last.leftBottom, last.rightBottom, last.rightTop, last.leftTop],
    endCapUvs,
    segmentCount - 1
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.groundSamples = groundSamples;
  geometry.userData.segmentCount = segmentCount;
  geometry.userData.lengthMeters = length;
  geometry.userData.metresPerUvRepeat = textureRepeatMeters;
  geometry.userData.thicknessMeters = thickness;
  geometry.userData.faceBands = ['front', 'back', 'top', 'ends'];
  geometry.userData.presentationKind = 'alpha-tested-card';
  geometry.userData.segmentVertexIndices = segmentVertexIndices;
  geometry.userData.originalPositions = Float32Array.from(positions);
  return geometry;
}

function createGabledRoofGeometry(width, depth, height, overhang = 0.45) {
  const halfWidth = width * 0.5 + overhang;
  const halfDepth = depth * 0.5 + overhang;
  const leftFront = new THREE.Vector3(-halfWidth, 0, halfDepth);
  const leftRear = new THREE.Vector3(-halfWidth, 0, -halfDepth);
  const rightFront = new THREE.Vector3(halfWidth, 0, halfDepth);
  const rightRear = new THREE.Vector3(halfWidth, 0, -halfDepth);
  const ridgeFront = new THREE.Vector3(0, height, halfDepth);
  const ridgeRear = new THREE.Vector3(0, height, -halfDepth);
  const positions = [];
  const uvs = [];

  addQuad(positions, uvs, leftFront, ridgeFront, ridgeRear, leftRear);
  addQuad(positions, uvs, rightRear, ridgeRear, ridgeFront, rightFront);
  addTriangle(positions, uvs, leftFront, rightFront, ridgeFront);
  addTriangle(positions, uvs, rightRear, leftRear, ridgeRear);
  addQuad(
    positions, uvs,
    leftRear, rightRear, rightFront, leftFront
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTerrainConformingFoundationGeometry({
  centerX,
  centerZ,
  width,
  depth,
  topY,
  getHeightAt
}) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const worldCorners = [
    [centerX - halfWidth, centerZ + halfDepth],
    [centerX + halfWidth, centerZ + halfDepth],
    [centerX + halfWidth, centerZ - halfDepth],
    [centerX - halfWidth, centerZ - halfDepth]
  ];
  const bottom = worldCorners.map(([x, z]) =>
    new THREE.Vector3(x - centerX, getHeightAt(x, z) - topY, z - centerZ)
  );
  const top = [
    new THREE.Vector3(-halfWidth, 0, halfDepth),
    new THREE.Vector3(halfWidth, 0, halfDepth),
    new THREE.Vector3(halfWidth, 0, -halfDepth),
    new THREE.Vector3(-halfWidth, 0, -halfDepth)
  ];
  const positions = [];
  const uvs = [];
  addQuad(positions, uvs, top[0], top[1], top[2], top[3], width, depth);
  addQuad(positions, uvs, bottom[0], bottom[3], bottom[2], bottom[1], depth, width);
  addQuad(positions, uvs, bottom[0], bottom[1], top[1], top[0], width, 1);
  addQuad(positions, uvs, bottom[1], bottom[2], top[2], top[1], depth, 1);
  addQuad(positions, uvs, bottom[2], bottom[3], top[3], top[2], width, 1);
  addQuad(positions, uvs, bottom[3], bottom[0], top[0], top[3], depth, 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.worldFootprintCorners = worldCorners.map(([x, z], index) => [
    x,
    bottom[index].y + topY,
    z
  ]);
  geometry.userData.topY = topY;
  return geometry;
}

export function createBridgeApproachGeometry({
  halfWidth,
  deckEndZ,
  direction,
  length,
  deckTop,
  getGroundHeightAt,
  widthSubdivisions = 4,
  lengthSubdivisions = 4
}) {
  if (!(halfWidth > 0) || !(length > 0)) {
    throw new Error('Bridge approach dimensions must be positive');
  }
  if (direction !== -1 && direction !== 1) {
    throw new Error('Bridge approach direction must be -1 or 1');
  }
  if (typeof getGroundHeightAt !== 'function') {
    throw new TypeError('Bridge approach requires getGroundHeightAt');
  }
  const positions = [];
  const uvs = [];
  const topPoint = (column, row) => {
    const x = THREE.MathUtils.lerp(
      -halfWidth,
      halfWidth,
      column / widthSubdivisions
    );
    const progress = row / lengthSubdivisions;
    const z = deckEndZ + direction * length * progress;
    const groundY = getGroundHeightAt(x, z);
    return new THREE.Vector3(
      x,
      THREE.MathUtils.lerp(
        deckTop,
        groundY,
        smoothstep01(progress)
      ),
      z
    );
  };
  const groundPoint = (x, z) =>
    new THREE.Vector3(x, getGroundHeightAt(x, z), z);
  const addOrientedQuad = (points, reverse = false, uScale = 1, vScale = 1) => {
    const ordered = reverse ? [...points].reverse() : points;
    addQuad(
      positions,
      uvs,
      ordered[0],
      ordered[1],
      ordered[2],
      ordered[3],
      uScale,
      vScale
    );
  };

  for (let row = 0; row < lengthSubdivisions; row++) {
    for (let column = 0; column < widthSubdivisions; column++) {
      const currentLeft = topPoint(column, row);
      const nextLeft = topPoint(column, row + 1);
      const nextRight = topPoint(column + 1, row + 1);
      const currentRight = topPoint(column + 1, row);
      addOrientedQuad(
        [currentLeft, nextLeft, nextRight, currentRight],
        direction < 0,
        (halfWidth * 2) / TERRAIN_SCALE.bridge.masonryRepeatMeters,
        length / TERRAIN_SCALE.bridge.masonryRepeatMeters
      );
    }
  }

  for (const side of [-1, 1]) {
    for (let row = 0; row < lengthSubdivisions; row++) {
      const x = side * halfWidth;
      const z0 = deckEndZ + direction * length * (
        row / lengthSubdivisions
      );
      const z1 = deckEndZ + direction * length * (
        (row + 1) / lengthSubdivisions
      );
      const base0 = groundPoint(x, z0);
      const base1 = groundPoint(x, z1);
      const top1 = topPoint(side < 0 ? 0 : widthSubdivisions, row + 1);
      const top0 = topPoint(side < 0 ? 0 : widthSubdivisions, row);
      const reverse = side < 0 ? direction < 0 : direction > 0;
      addOrientedQuad(
        [base0, base1, top1, top0],
        reverse,
        length / TERRAIN_SCALE.bridge.masonryRepeatMeters,
        1
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.approach = {
    halfWidth,
    deckEndZ,
    direction,
    length,
    deckTop,
    widthSubdivisions,
    lengthSubdivisions
  };
  return geometry;
}

export class TerrainBuilder {
  constructor(scene, {
    mapDescriptor,
    buildingSystem = null,
    structureAdapters = {},
    terrainSurfaceProvider,
    foliageTemplateProvider = null
  } = {}) {
    if (!mapDescriptor?.id || !mapDescriptor?.dimensions) {
      throw new Error('TerrainBuilder requires a validated mapDescriptor');
    }
    if (
      !terrainSurfaceProvider
      || typeof terrainSurfaceProvider.create !== 'function'
    ) {
      throw new Error('TerrainBuilder requires an injected terrain surface provider');
    }
    if (
      foliageTemplateProvider != null
      && typeof foliageTemplateProvider.createTemplate !== 'function'
    ) {
      throw new Error('TerrainBuilder foliage template provider requires createTemplate');
    }
    this.scene = scene;
    this.mapDescriptor = mapDescriptor;
    this.deploymentZoneDefinitions = mapDescriptor.deploymentZones;
    this.width = mapDescriptor.dimensions.width;
    this.depth = mapDescriptor.dimensions.depth;
    this.segments = mapDescriptor.dimensions.segments;
    this.terrainMesh = null;
    this.heightData = new Float32Array();
    this.terrainGridCoordinates = createTerrainGridCoordinates({
      width: this.width,
      depth: this.depth,
      segments: this.segments,
      additionalZCoordinates: createRiverBankZCoordinates(mapDescriptor.river)
    });
    this.bocageObstacles = [];
    this.sightOccluderRevision = 0;
    this.sightOccluderSnapshot = createTerrainSightOccluderSnapshot(0, []);
    this.sightOccluderPublicationDepth = 0;
    this.sightOccluderPublicationPending = false;
    this.buildings = [];
    this.colliderRecords = [];
    this.navigationRecords = [];
    this.collisionWorld = new StaticCollisionWorld();
    this.bridgeSurface = null;
    this.riverBankStrips = [];
    this.buildingSystem = buildingSystem;
    this.structureAdapters = structureAdapters;
    this.terrainSurfaceProvider = terrainSurfaceProvider;
    this.foliageTemplateProvider = foliageTemplateProvider;
    this.surfaceAssets = null;
    this.fenceMeshesByRunId = new Map();
    this.foliageInstances = [];
    this.foliageReady = Promise.resolve(this.foliageInstances);
    this.destructibleLinearObstacles = new DestructibleLinearObstacleSystem({
      onSegmentChanged: (state, segment) => {
        this.syncDestructibleFenceSegment(state, segment);
      }
    });
  }

  buildScenarioMap() {
    // 1. Terrain Geometry
    const river = this.mapDescriptor.river;
    const geometry = createTerrainGridGeometry({
      width: this.width,
      depth: this.depth,
      segments: this.segments,
      additionalZCoordinates: createRiverBankZCoordinates(river)
    });
    this.terrainGridCoordinates = geometry.userData.gridCoordinates;

    const pos = geometry.attributes.position;
    this.heightData = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.getHeightAt(x, z);

      pos.setY(i, h);
      this.heightData[i] = h;
    }
    geometry.computeVertexNormals();

    // 2. Family-owned surface material
    const surfaceAssets = this.getSurfaceAssets();
    const material = surfaceAssets.materials.ground;

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.name = 'TerrainMesh';
    if (surfaceAssets.assetBinding) {
      this.terrainMesh.userData.assetBindings = {
        terrainSurface: surfaceAssets.assetBinding
      };
    }
    this.scene.add(this.terrainMesh);

    // 3. Environment Features
    this.buildRiverAndBridge();
    this.buildStoneWalls();
    this.buildStructures();
    this.buildFoliage();
    this.buildSetupZones();

    return this.terrainMesh;
  }

  getOpenGroundHeightAt(x, z) {
    const elevation = this.mapDescriptor.elevation;
    return elevation.waves.reduce((height, wave) => {
      const coordinate = wave.axis === 'x' ? x : z;
      const angle = coordinate * wave.frequency + (wave.phase ?? 0);
      const sample = wave.function === 'sin' ? Math.sin(angle) : Math.cos(angle);
      return height + sample * wave.amplitude;
    }, elevation.baseHeight ?? 0);
  }

  getHeightAt(x, z) {
    const river = this.mapDescriptor.river;
    const openGround = this.getOpenGroundHeightAt(x, z);
    if (!river) return openGround;
    const distanceFromCenter = Math.abs(z - river.centerZ);
    const waterHalfWidth = river.waterWidth * 0.5;
    const cutHalfWidth = river.cutWidth * 0.5;
    if (distanceFromCenter <= waterHalfWidth) return river.bedLevel;
    if (distanceFromCenter >= cutHalfWidth) return openGround;

    const bankProgress = (
      distanceFromCenter - waterHalfWidth
    ) / (cutHalfWidth - waterHalfWidth);
    return THREE.MathUtils.lerp(
      river.bedLevel,
      openGround,
      smoothstep01(bankProgress)
    );
  }

  getRenderedTerrainHeightAt(x, z) {
    const xCoordinates = this.terrainGridCoordinates?.x
      ?? Array.from(
        { length: this.segments + 1 },
        (_, index) => -this.width * 0.5
          + this.width * index / this.segments
      );
    const zCoordinates = this.terrainGridCoordinates?.z
      ?? Array.from(
        { length: this.segments + 1 },
        (_, index) => -this.depth * 0.5
          + this.depth * index / this.segments
      );
    const boundedX = THREE.MathUtils.clamp(
      x,
      xCoordinates[0],
      xCoordinates.at(-1)
    );
    const boundedZ = THREE.MathUtils.clamp(
      z,
      zCoordinates[0],
      zCoordinates.at(-1)
    );
    const column = findCoordinateInterval(xCoordinates, boundedX);
    const row = findCoordinateInterval(zCoordinates, boundedZ);
    const x0 = xCoordinates[column];
    const x1 = xCoordinates[column + 1];
    const z0 = zCoordinates[row];
    const z1 = zCoordinates[row + 1];
    const u = THREE.MathUtils.clamp(
      (boundedX - x0) / (x1 - x0),
      0,
      1
    );
    const v = THREE.MathUtils.clamp(
      (boundedZ - z0) / (z1 - z0),
      0,
      1
    );
    const southWest = this.getHeightAt(x0, z0);
    const southEast = this.getHeightAt(x1, z0);
    const northWest = this.getHeightAt(x0, z1);
    const northEast = this.getHeightAt(x1, z1);
    if (u + v <= 1) {
      return southWest
        + u * (southEast - southWest)
        + v * (northWest - southWest);
    }
    return northEast
      + (1 - u) * (northWest - northEast)
      + (1 - v) * (southEast - northEast);
  }

  getMovementHeightAt(x, z) {
    const bridge = this.bridgeSurface;
    if (
      bridge
      && Math.abs(x - bridge.centerX) <= bridge.halfRoadwayWidth
    ) {
      const distanceFromCenter = Math.abs(z - bridge.centerZ);
      if (distanceFromCenter <= bridge.halfSpan) return bridge.deckTop;
      if (
        distanceFromCenter
          <= bridge.halfSpan + bridge.approachLength
      ) {
        const progress = (
          distanceFromCenter - bridge.halfSpan
        ) / bridge.approachLength;
        return THREE.MathUtils.lerp(
          bridge.deckTop,
          this.getHeightAt(x, z),
          smoothstep01(progress)
        );
      }
    }
    return this.getHeightAt(x, z);
  }

  addColliderRecord(record) {
    const normalized = this.collisionWorld.upsertCollider(record);
    const index = this.colliderRecords.findIndex(candidate => candidate.id === normalized.id);
    if (index >= 0) this.colliderRecords[index] = normalized;
    else this.colliderRecords.push(normalized);
    return normalized;
  }

  removeColliderRecord(id) {
    const stableId = String(id);
    this.collisionWorld.removeCollider(stableId);
    this.colliderRecords = this.colliderRecords
      .filter(record => record.id !== stableId);
  }

  publishSightOccluderSnapshot() {
    if (this.sightOccluderPublicationDepth > 0) {
      this.sightOccluderPublicationPending = true;
      return this.sightOccluderSnapshot;
    }
    if (this.sightOccluderRevision >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('terrain sight revision exhausted');
    }
    this.sightOccluderRevision++;
    this.sightOccluderSnapshot = createTerrainSightOccluderSnapshot(
      this.sightOccluderRevision,
      this.bocageObstacles
    );
    this.sightOccluderPublicationPending = false;
    return this.sightOccluderSnapshot;
  }

  getSightOccluderSnapshot() {
    return this.sightOccluderSnapshot;
  }

  addBocageObstacle(record) {
    this.bocageObstacles.push(record);
    this.publishSightOccluderSnapshot();
    return record;
  }

  syncDestructibleFenceSegment(state, segment) {
    const mesh = this.fenceMeshesByRunId.get(segment.runId);
    if (mesh) {
      const vertexIndices = mesh.geometry.userData
        .segmentVertexIndices?.[segment.segmentIndex];
      const original = mesh.geometry.userData.originalPositions;
      const positions = mesh.geometry.attributes.position;
      if (vertexIndices && original && positions) {
        for (const vertexIndex of vertexIndices) {
          const offset = vertexIndex * 3;
          if (state.destroyed) {
            const x = original[offset];
            const z = original[offset + 2];
            positions.setXYZ(
              vertexIndex,
              x,
              this.getHeightAt(x, z)
                + (mesh.userData.groundOffset ?? 0),
              z
            );
          } else {
            positions.setXYZ(
              vertexIndex,
              original[offset],
              original[offset + 1],
              original[offset + 2]
            );
          }
        }
        positions.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
      }
    }

    if (state.destroyed) {
      this.removeColliderRecord(segment.colliderId);
      this.bocageObstacles = this.bocageObstacles
        .filter(record => record.id !== segment.obstacleRecord.id);
    } else {
      this.addColliderRecord(segment.colliderRecord);
      if (!this.bocageObstacles.some(
        record => record.id === segment.obstacleRecord.id
      )) {
        this.bocageObstacles.push({ ...segment.obstacleRecord });
      }
    }
    this.publishSightOccluderSnapshot();
  }

  captureDestructibleObstacleState() {
    return this.destructibleLinearObstacles.captureState();
  }

  restoreDestructibleObstacleState(state) {
    this.sightOccluderPublicationDepth++;
    this.sightOccluderPublicationPending = true;
    try {
      return this.destructibleLinearObstacles.restoreState(state);
    } finally {
      this.sightOccluderPublicationDepth--;
      if (this.sightOccluderPublicationDepth === 0
          && this.sightOccluderPublicationPending) {
        this.publishSightOccluderSnapshot();
      }
    }
  }

  applyVehicleImpactToLinearObstacle(impact) {
    return this.destructibleLinearObstacles.applyVehicleImpact(impact);
  }

  applyBlastDamageToLinearObstacles(blast) {
    return this.destructibleLinearObstacles.applyBlast(blast);
  }

  addNavigationRecord(record) {
    const index = this.navigationRecords.findIndex(candidate => candidate.id === record.id);
    if (index >= 0) this.navigationRecords[index] = { ...record };
    else this.navigationRecords.push({ ...record });
    this.collisionWorld.setNavigationRecords(this.navigationRecords);
  }

  registerUnitColliders(units) {
    for (const unit of units ?? []) unit.bindCollisionWorld?.(this.collisionWorld);
  }

  getSurfaceAssets() {
    if (this.surfaceAssets) return this.surfaceAssets;
    const surfaceAssets = this.terrainSurfaceProvider.create(
      this.mapDescriptor.surfaces
    );
    const requiredMaterials = [
      'ground',
      'riverBank',
      'water',
      'bridgeRoad',
      'masonry',
      'fenceCard',
      'foliageTrunk',
      'foliageLeaves',
      'foliageLeavesDark'
    ];
    if (
      !surfaceAssets
      || !surfaceAssets.materials
      || typeof surfaceAssets.dispose !== 'function'
    ) {
      throw new TypeError('Terrain surface provider must create materials and dispose');
    }
    for (const role of requiredMaterials) {
      if (!surfaceAssets.materials[role]?.isMaterial) {
        throw new TypeError(`Terrain surface provider requires material ${role}`);
      }
    }
    this.surfaceAssets = surfaceAssets;
    return surfaceAssets;
  }

  createMasonryMaterial() {
    return this.getSurfaceAssets().materials.masonry;
  }

  buildRiverAndBridge() {
    const river = this.mapDescriptor.river;
    const mapBridge = this.mapDescriptor.bridge;
    if (!river || !mapBridge) {
      this.bridgeSurface = null;
      this.riverBankStrips = [];
      return null;
    }
    const bridge = TERRAIN_SCALE.bridge;
    const surfaceMaterials = this.getSurfaceAssets().materials;
    const waterGeo = new THREE.PlaneGeometry(this.width, river.waterWidth);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = surfaceMaterials.water;
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.name = 'RiverWater';
    water.position.set(0, river.waterLevel, river.centerZ);
    water.userData.dimensionsMeters = {
      width: this.width,
      channelWidth: river.waterWidth,
      waterLevel: river.waterLevel,
      bedLevel: river.bedLevel
    };
    this.scene.add(water);

    this.buildRiverBankStrips();

    const stoneMat = this.createMasonryMaterial();
    const roadMat = surfaceMaterials.bridgeRoad;
    const bridgeGroup = new THREE.Group();
    bridgeGroup.name = 'StoneBridge';
    bridgeGroup.userData.mapFeatureId = mapBridge.id;
    const halfSpan = mapBridge.span * 0.5;
    const deckTop = Math.max(
      this.getHeightAt(mapBridge.centerX, mapBridge.centerZ - halfSpan),
      this.getHeightAt(mapBridge.centerX, mapBridge.centerZ + halfSpan)
    ) + 0.1;
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(
        bridge.roadwayWidth,
        bridge.deckThickness,
        mapBridge.span
      ),
      roadMat
    );
    deck.name = 'BridgeDeck';
    deck.position.y = deckTop - bridge.deckThickness * 0.5;
    deck.receiveShadow = true;
    bridgeGroup.add(deck);
    const parapetCenterX = (
      bridge.roadwayWidth - bridge.parapetThickness
    ) * 0.5;
    const parapetInnerHalfWidth = parapetCenterX - bridge.parapetThickness * 0.5;
    this.bridgeSurface = {
      centerX: mapBridge.centerX,
      centerZ: mapBridge.centerZ,
      halfRoadwayWidth: parapetInnerHalfWidth,
      halfSpan,
      approachLength: mapBridge.approachLength,
      deckTop
    };

    for (const direction of [-1, 1]) {
      const approach = new THREE.Mesh(
        createBridgeApproachGeometry({
          halfWidth: parapetInnerHalfWidth,
          deckEndZ: direction * halfSpan,
          direction,
          length: mapBridge.approachLength,
          deckTop,
          getGroundHeightAt: (localX, localZ) => this.getHeightAt(
            mapBridge.centerX + localX,
            mapBridge.centerZ + localZ
          )
        }),
        roadMat
      );
      approach.name = 'BridgeApproach';
      approach.receiveShadow = true;
      approach.userData.mapFeatureId = mapBridge.id;
      approach.userData.side = direction < 0 ? 'south' : 'north';
      approach.userData.dataQuality = mapBridge.approachDataQuality;
      bridgeGroup.add(approach);
    }

    const parapetGeometry = createMeterUvBoxGeometry(
      bridge.parapetThickness,
      bridge.parapetHeight,
      mapBridge.span,
      bridge.masonryRepeatMeters
    );
    const bridgeBoundaryColliderIds = [];
    for (const side of [-1, 1]) {
      const parapet = new THREE.Mesh(parapetGeometry, stoneMat);
      parapet.name = 'BridgeParapet';
      parapet.position.set(
        side * (bridge.roadwayWidth - bridge.parapetThickness) * 0.5,
        deckTop + bridge.parapetHeight * 0.5,
        0
      );
      parapet.castShadow = true;
      parapet.receiveShadow = true;
      bridgeGroup.add(parapet);
      const parapetColliderId =
        `bridge:parapet:${side < 0 ? 'west' : 'east'}`;
      bridgeBoundaryColliderIds.push(parapetColliderId);
      this.addColliderRecord({
        id: parapetColliderId,
        type: 'bridge_parapet',
        mapFeatureId: mapBridge.id,
        centerX: mapBridge.centerX + side * parapetCenterX,
        centerZ: mapBridge.centerZ,
        halfX: bridge.parapetThickness * 0.5,
        halfZ: mapBridge.span * 0.5,
        rotation: 0,
        blocks: ['vehicle', 'infantry']
      });
    }

    const abutmentWidth = bridge.parapetThickness * 2;
    const abutmentDepth = 1.2;
    const abutmentGeometry = createMeterUvBoxGeometry(
      abutmentWidth,
      bridge.parapetHeight + 0.35,
      abutmentDepth,
      bridge.masonryRepeatMeters
    );
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const abutment = new THREE.Mesh(abutmentGeometry, stoneMat);
        abutment.name = 'BridgeAbutment';
        abutment.position.set(
          side * (bridge.roadwayWidth - abutmentWidth) * 0.5,
          deckTop + (bridge.parapetHeight + 0.35) * 0.5,
          end * (halfSpan + abutmentDepth * 0.5)
        );
        abutment.castShadow = true;
        abutment.receiveShadow = true;
        bridgeGroup.add(abutment);
        const abutmentColliderId =
          `bridge:abutment:${side < 0 ? 'west' : 'east'}:${end < 0 ? 'south' : 'north'}`;
        bridgeBoundaryColliderIds.push(abutmentColliderId);
        this.addColliderRecord({
          id: abutmentColliderId,
          type: 'bridge_abutment',
          mapFeatureId: mapBridge.id,
          centerX: mapBridge.centerX + abutment.position.x,
          centerZ: mapBridge.centerZ + abutment.position.z,
          halfX: abutmentWidth * 0.5,
          halfZ: abutmentDepth * 0.5,
          rotation: 0,
          blocks: ['vehicle', 'infantry']
        });
      }
    }

    const pierHeight = deckTop - bridge.deckThickness - river.bedLevel;
    const pierGeometry = createMeterUvBoxGeometry(
      bridge.roadwayWidth + 0.5,
      pierHeight,
      0.8,
      bridge.masonryRepeatMeters
    );
    for (const z of [-river.waterWidth * 0.38, river.waterWidth * 0.38]) {
      const pier = new THREE.Mesh(pierGeometry, stoneMat);
      pier.name = 'BridgePier';
      pier.position.set(0, river.bedLevel + pierHeight * 0.5, z);
      pier.castShadow = true;
      pier.receiveShadow = true;
      bridgeGroup.add(pier);
    }
    bridgeGroup.position.set(mapBridge.centerX, 0, mapBridge.centerZ);
    bridgeGroup.userData.dimensionsMeters = {
      width: bridge.roadwayWidth,
      length: mapBridge.span,
      approachLength: mapBridge.approachLength,
      deckTop
    };
    this.scene.add(bridgeGroup);

    const openingHalfWidth = parapetInnerHalfWidth;
    const mapMinX = -this.width * 0.5;
    const mapMaxX = this.width * 0.5;
    const openingMinX = mapBridge.centerX - openingHalfWidth;
    const openingMaxX = mapBridge.centerX + openingHalfWidth;
    const exclusions = [
      {
        side: 'west',
        minX: mapMinX,
        maxX: openingMinX
      },
      {
        side: 'east',
        minX: openingMaxX,
        maxX: mapMaxX
      }
    ];
    const riverExclusionIds = [];
    for (const exclusion of exclusions) {
      const exclusionId = `river:exclusion:${exclusion.side}`;
      riverExclusionIds.push(exclusionId);
      this.addColliderRecord({
        id: exclusionId,
        type: 'river_exclusion',
        mapFeatureId: river.id,
        centerX: (exclusion.minX + exclusion.maxX) * 0.5,
        centerZ: river.centerZ,
        halfX: (exclusion.maxX - exclusion.minX) * 0.5,
        halfZ: river.cutWidth * 0.5,
        rotation: 0,
        blocks: ['vehicle', 'infantry']
      });
    }
    this.addNavigationRecord({
      id: `navigation:${mapBridge.id}`,
      type: 'bridge_crossing',
      mapFeatureId: mapBridge.id,
      centerX: mapBridge.centerX,
      minZ: mapBridge.centerZ - halfSpan,
      maxZ: mapBridge.centerZ + halfSpan,
      halfOpeningWidth: openingHalfWidth,
      barrierColliderIds: riverExclusionIds,
      boundaryColliderIds: bridgeBoundaryColliderIds,
      blocks: ['vehicle', 'infantry']
    });
  }

  buildRiverBankStrips() {
    const river = this.mapDescriptor.river;
    const material = this.getSurfaceAssets().materials.riverBank;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    const halfWaterWidth = river.waterWidth * 0.5;
    const halfCutWidth = river.cutWidth * 0.5;
    const minX = -this.width * 0.5;
    const maxX = this.width * 0.5;
    const createStrip = (side) => {
      const direction = side === 'north' ? 1 : -1;
      const innerZ = river.centerZ + direction * halfWaterWidth;
      const outerZ = river.centerZ + direction * halfCutWidth;
      const minZ = Math.min(innerZ, outerZ);
      const maxZ = Math.max(innerZ, outerZ);
      const positions = [];
      const uvs = [];
      const indices = [];
      for (let row = 0; row <= RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS; row++) {
        const z = THREE.MathUtils.lerp(
          minZ,
          maxZ,
          row / RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS
        );
        for (let column = 0; column <= RIVER_BANK_X_SUBDIVISIONS; column++) {
          const x = THREE.MathUtils.lerp(minX, maxX, column / RIVER_BANK_X_SUBDIVISIONS);
          positions.push(
            x,
            this.getRenderedTerrainHeightAt(x, z)
              + RIVER_BANK_SURFACE_OFFSET,
            z
          );
          uvs.push(
            column / RIVER_BANK_X_SUBDIVISIONS,
            row / RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS
          );
        }
      }
      for (let row = 0; row < RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS; row++) {
        for (let column = 0; column < RIVER_BANK_X_SUBDIVISIONS; column++) {
          const a = row * (RIVER_BANK_X_SUBDIVISIONS + 1) + column;
          const b = a + 1;
          const c = a + RIVER_BANK_X_SUBDIVISIONS + 1;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `RiverBank${side[0].toUpperCase()}${side.slice(1)}`;
      mesh.receiveShadow = true;
      mesh.userData.mapFeatureId = river.id;
      mesh.userData.side = side;
      mesh.userData.materialRole = 'riverBank';
      mesh.userData.worldBounds = { minX, maxX, minZ, maxZ };
      mesh.userData.bankEdges = { innerZ, outerZ };
      mesh.userData.rendererApproximation = {
        label: RIVER_BANK_RENDERER_APPROXIMATION,
        xSubdivisions: RIVER_BANK_X_SUBDIVISIONS,
        crossSlopeSubdivisions: RIVER_BANK_CROSS_SLOPE_SUBDIVISIONS,
        surfaceOffset: RIVER_BANK_SURFACE_OFFSET,
        depthBias: {
          factor: material.polygonOffsetFactor,
          units: material.polygonOffsetUnits
        }
      };
      this.scene.add(mesh);
      return mesh;
    };
    this.riverBankStrips = [createStrip('south'), createStrip('north')];
    return this.riverBankStrips;
  }

  buildStoneWalls() {
    this.stoneWallSegments = [];
    this.fenceCardRuns = [];
    this.boundaryMeshes = [];
    this.fenceMeshesByRunId.clear();
    this.destructibleLinearObstacles.clear();

    const createWallRun = (run) => {
      const profile = this.mapDescriptor.wallProfiles[run.profileId];
      const material = this.getSurfaceAssets().materials[profile.materialRole];
      if (!material?.isMaterial) {
        throw new Error(
          `Wall profile ${profile.id} requires material ${profile.materialRole}`
        );
      }
      const [startX, startZ] = run.start;
      const [endX, endZ] = run.end;
      const runId = run.id;
      const dx = endX - startX;
      const dz = endZ - startZ;
      const runLength = Math.hypot(dx, dz);
      const segmentCount = Math.ceil(runLength / profile.maximumSegmentLength);

      const addBoundaryRecords = ({
        index,
        start,
        end,
        bounds,
        length
      }) => {
        const obstacleRecord = {
          id: `${runId}_${index}`,
          minX: bounds.min.x,
          maxX: bounds.max.x,
          minY: bounds.min.y,
          maxY: bounds.max.y,
          minZ: bounds.min.z,
          maxZ: bounds.max.z,
          height: profile.height,
          thickness: profile.thickness,
          type: profile.collisionType,
          occludesSight: profile.occludesSight,
          enclosureId: run.enclosureId ?? null,
          adjacentGateId: run.adjacentGateId ?? null,
          sightRunId: runId
        };
        this.bocageObstacles.push(obstacleRecord);
        const colliderRecord = this.addColliderRecord({
          id: `wall:${runId}:${index}`,
          type: profile.collisionType,
          mapFeatureId: runId,
          enclosureId: run.enclosureId ?? null,
          adjacentGateId: run.adjacentGateId ?? null,
          centerX: (start.x + end.x) * 0.5,
          centerZ: (start.z + end.z) * 0.5,
          halfX: profile.thickness * 0.5,
          halfZ: length * 0.5,
          rotation: Math.atan2(end.x - start.x, end.z - start.z),
          blocks: profile.blocks
        });
        return { obstacleRecord, colliderRecord };
      };

      if (profile.presentationKind === 'alpha-tested-card') {
        const start = { x: startX, z: startZ };
        const end = { x: endX, z: endZ };
        const geometry = createGroundConformingFenceCardGeometry({
          start,
          end,
          height: profile.height,
          thickness: profile.thickness,
          maximumSegmentLength: profile.maximumSegmentLength,
          textureRepeatMeters: profile.textureRepeatMeters,
          groundOffset: profile.groundOffset,
          getHeightAt: (x, z) => this.getHeightAt(x, z)
        });
        const fence = new THREE.Mesh(geometry, material);
        fence.name = `FenceCard_${runId}`;
        fence.castShadow = false;
        fence.receiveShadow = true;
        fence.userData.terrainFeature = profile.collisionType;
        fence.userData.runId = runId;
        fence.userData.profileId = profile.id;
        fence.userData.enclosureId = run.enclosureId ?? null;
        fence.userData.boundarySide = run.boundarySide ?? null;
        fence.userData.adjacentGateId = run.adjacentGateId ?? null;
        fence.userData.start = [
          start.x,
          this.getHeightAt(start.x, start.z),
          start.z
        ];
        fence.userData.end = [
          end.x,
          this.getHeightAt(end.x, end.z),
          end.z
        ];
        fence.userData.dimensionsMeters = {
          height: profile.height,
          thickness: profile.thickness,
          length: runLength
        };
        fence.userData.groundOffset = profile.groundOffset;
        fence.userData.rendererApproximation = {
          presentationKind: profile.presentationKind,
          alphaTested: true,
          blendedTransparency: false,
          terrainSamples: geometry.userData.groundSamples.length,
          dataQuality: profile.dataQuality
        };
        this.scene.add(fence);
        this.fenceCardRuns.push(fence);
        this.boundaryMeshes.push(fence);
        this.fenceMeshesByRunId.set(runId, fence);

        for (let index = 0; index < segmentCount; index++) {
          const startT = index / segmentCount;
          const endT = (index + 1) / segmentCount;
          const segmentStart = {
            x: startX + dx * startT,
            z: startZ + dz * startT
          };
          const segmentEnd = {
            x: startX + dx * endT,
            z: startZ + dz * endT
          };
          const bounds = new THREE.Box3();
          for (const vertexIndex of geometry.userData.segmentVertexIndices[index]) {
            bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(
              geometry.attributes.position,
              vertexIndex
            ));
          }
          const records = addBoundaryRecords({
            index,
            start: segmentStart,
            end: segmentEnd,
            bounds,
            length: runLength / segmentCount
          });
          this.destructibleLinearObstacles.registerSegment({
            id: `fence:${runId}:${index}`,
            colliderId: records.colliderRecord.id,
            runId,
            segmentIndex: index,
            start: [segmentStart.x, segmentStart.z],
            end: [segmentEnd.x, segmentEnd.z],
            colliderRecord: records.colliderRecord,
            obstacleRecord: records.obstacleRecord,
            policy: profile.destruction
          });
        }
        return;
      }

      for (let index = 0; index < segmentCount; index++) {
        const startT = index / segmentCount;
        const endT = (index + 1) / segmentCount;
        const start = {
          x: startX + dx * startT,
          z: startZ + dz * startT
        };
        const end = {
          x: startX + dx * endT,
          z: startZ + dz * endT
        };
        const geometry = createGroundConformingWallGeometry({
          start,
          end,
          height: profile.height,
          thickness: profile.thickness,
          getHeightAt: (x, z) => this.getHeightAt(x, z)
        });
        const wall = new THREE.Mesh(geometry, material);
        wall.name = `StoneWall_${runId}_${index}`;
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.userData.terrainFeature = 'stonewall';
        wall.userData.runId = runId;
        wall.userData.profileId = profile.id;
        wall.userData.enclosureId = run.enclosureId ?? null;
        wall.userData.boundarySide = run.boundarySide ?? null;
        wall.userData.adjacentGateId = run.adjacentGateId ?? null;
        wall.userData.segmentIndex = index;
        wall.userData.start = [start.x, this.getHeightAt(start.x, start.z), start.z];
        wall.userData.end = [end.x, this.getHeightAt(end.x, end.z), end.z];
        wall.userData.dimensionsMeters = {
          height: profile.height,
          thickness: profile.thickness,
          length: runLength / segmentCount
        };
        this.scene.add(wall);
        this.stoneWallSegments.push(wall);
        this.boundaryMeshes.push(wall);

        addBoundaryRecords({
          index,
          start,
          end,
          bounds: geometry.boundingBox,
          length: runLength / segmentCount
        });
      }
    };

    for (const run of this.mapDescriptor.wallRuns) createWallRun(run);
    this.publishSightOccluderSnapshot();
  }

  replaceBuildingCollisionRecords(buildingId, sourceRecords, minimumGroundY, foundationTopY) {
    const previousIds = this.colliderRecords
      .filter(record => record.buildingId === buildingId)
      .map(record => record.id);
    for (const id of previousIds) this.collisionWorld.removeCollider(id);
    this.colliderRecords = this.colliderRecords
      .filter(record => record.buildingId !== buildingId);
    this.bocageObstacles = this.bocageObstacles
      .filter(record => record.buildingId !== buildingId);

    const movementRecords = sourceRecords
      .filter(record => (record.sectionId === 'ground-shell' || record.sectionId === 'rubble')
        && (record.blocks ?? []).some(block => block === 'vehicle' || block === 'infantry'))
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const sourceRecord of movementRecords) {
      const record = {
        ...sourceRecord,
        mapFeatureId: sourceRecord.mapFeatureId ?? buildingId,
        halfX: sourceRecord.halfX ?? sourceRecord.halfWidth,
        halfZ: sourceRecord.halfZ ?? sourceRecord.halfDepth
      };
      this.addColliderRecord(record);
      const cosine = Math.abs(Math.cos(record.rotation ?? 0));
      const sine = Math.abs(Math.sin(record.rotation ?? 0));
      const extentX = cosine * record.halfX + sine * record.halfZ;
      const extentZ = sine * record.halfX + cosine * record.halfZ;
      this.bocageObstacles.push({
        id: record.id,
        buildingId,
        minX: record.centerX - extentX,
        maxX: record.centerX + extentX,
        minZ: record.centerZ - extentZ,
        maxZ: record.centerZ + extentZ,
        minY: record.minY ?? minimumGroundY,
        maxY: record.maxY ?? foundationTopY,
        height: (record.maxY ?? foundationTopY) - (record.minY ?? minimumGroundY),
        type: record.sectionId === 'rubble' ? 'rubble' : 'building',
        sectionId: record.sectionId
      });
    }
    return {
      removedColliderIds: previousIds.sort(),
      colliderIds: movementRecords.map(record => record.id),
      obstacleIds: this.bocageObstacles
        .filter(record => record.buildingId === buildingId)
        .map(record => record.id)
        .sort()
    };
  }

  syncBuildingRuntime(buildingId, { collapseProjection = 'transition' } = {}) {
    if (!this.buildingSystem) return null;
    const building = this.buildings.find(record => record.id === buildingId);
    if (!building) return null;
    const runtime = this.buildingSystem.getBuildingSnapshot(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    building.adapter.applyVisualState(building.object, descriptor, runtime, {
      interiorPresence: building.interiorPresence ?? 0,
      collapseProjection
    });
    building.runtimeSnapshot = runtime;
    const footprintCorners = building.object.userData?.foundation?.footprintCorners ?? [];
    const minimumGroundY = footprintCorners.length > 0
      ? Math.min(...footprintCorners.map(([, y]) => y))
      : building.object.position.y;
    const foundationTopY = building.object.userData?.foundation?.topY
      ?? building.object.position.y;
    const collision = this.replaceBuildingCollisionRecords(
      buildingId,
      this.buildingSystem.getMovementCollisionSnapshot(buildingId).records,
      minimumGroundY,
      foundationTopY
    );
    building.runtimeEventVersion = runtime.eventVersion ?? 0;
    building.runtimeCollisionVersion = runtime.collisionVersion ?? 0;
    return { buildingId, runtime, collision };
  }

  /**
   * Advance renderer-owned building transitions from cached authoritative
   * snapshots. Simulation state, collision, apertures, and occupants are never
   * mutated here.
   */
  updateBuildingPresentation(deltaTime) {
    const dt = Math.max(0, Number(deltaTime) || 0);
    if (dt === 0) return 0;
    let advanced = 0;
    for (let index = 0; index < this.buildings.length; index++) {
      const building = this.buildings[index];
      if (
        !building.runtimeSnapshot
        || !building.adapter.advanceVisualState
        || !building.adapter.hasActiveVisualTransition?.(building.object)
      ) {
        continue;
      }
      building.adapter.advanceVisualState(
        building.object,
        building.runtimeSnapshot,
        dt
      );
      advanced++;
    }
    return advanced;
  }

  /**
   * Presentation-only occupancy projection. BuildingInteractionSystem owns
   * the individual transit state; this method deliberately does not touch
   * collision, LOS, or authoritative building state.
   */
  setBuildingInteriorPresence(buildingId, presence) {
    if (!this.buildingSystem) return null;
    const building = this.buildings.find(record => record.id === buildingId);
    if (!building) return null;
    const nextPresence = Math.max(0, Number(presence) || 0);
    if (building.interiorPresence === nextPresence) return {
      buildingId,
      interiorPresence: nextPresence,
      changed: false
    };
    building.interiorPresence = nextPresence;
    const runtime = building.runtimeSnapshot
      ?? this.buildingSystem.getBuildingSnapshot(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    building.adapter.applyVisualState(building.object, descriptor, runtime, {
      interiorPresence: nextPresence,
      collapseProjection: 'preserve'
    });
    return { buildingId, interiorPresence: nextPresence, changed: true };
  }

  buildStructures() {
    const placements = this.mapDescriptor.structures;
    if (placements.length > 0 && !this.buildingSystem) {
      throw new Error(`Map ${this.mapDescriptor.id} structures require a BuildingSystem`);
    }

    for (const placement of placements) {
      const adapter = this.structureAdapters[placement.visualAdapterId];
      if (!adapter?.descriptor || !adapter?.createVisual || !adapter?.applyVisualState) {
        throw new Error(
          `Map structure ${placement.id} requires visual adapter ${placement.visualAdapterId}`
        );
      }
      if (adapter.descriptor.id !== placement.descriptorId) {
        throw new Error(
          `Map structure ${placement.id} descriptor ${placement.descriptorId} does not match adapter ${adapter.descriptor.id}`
        );
      }

      const descriptor = adapter.descriptor;
      const [centerX, centerZ] = placement.position;
      const rotationY = placement.rotationY ?? 0;
      const cosine = Math.cos(rotationY);
      const sine = Math.sin(rotationY);
      const localCorners = [
        [descriptor.bounds.min[0], descriptor.bounds.max[2]],
        [descriptor.bounds.max[0], descriptor.bounds.max[2]],
        [descriptor.bounds.max[0], descriptor.bounds.min[2]],
        [descriptor.bounds.min[0], descriptor.bounds.min[2]]
      ];
      const groundCorners = localCorners.map(([localX, localZ]) => {
        const x = centerX + localX * cosine + localZ * sine;
        const z = centerZ - localX * sine + localZ * cosine;
        return [x, this.getHeightAt(x, z), z];
      });
      const minimumGroundY = Math.min(...groundCorners.map(([, y]) => y));
      const foundationTopY = Math.max(...groundCorners.map(([, y]) => y))
        + (placement.foundationClearance ?? 0);

      let runtime;
      try {
        runtime = this.buildingSystem.getBuildingSnapshot(placement.id);
      } catch {
        runtime = this.buildingSystem.addBuilding({
          id: placement.id,
          descriptor,
          destructionThresholds: placement.destructionThresholds,
          transform: {
            position: [centerX, foundationTopY, centerZ],
            rotationY
          }
        });
      }
      const object = adapter.createVisual({
        descriptor,
        runtime,
        centerX,
        centerZ,
        foundationTopY,
        getHeightAt: (x, z) => this.getHeightAt(x, z)
      });
      this.scene.add(object);
      this.buildings.push({
        id: placement.id,
        mapFeatureId: placement.id,
        descriptorId: descriptor.id,
        visualAdapterId: placement.visualAdapterId,
        adapter,
        object,
        interiorPresence: 0,
        runtimeSnapshot: runtime,
        runtimeEventVersion: runtime.eventVersion ?? 0,
        runtimeCollisionVersion: runtime.collisionVersion ?? 0
      });

      // BuildingSystem remains sole topology and aperture authority. Ground
      // movement consumes only its current ground-shell/rubble snapshot.
      this.replaceBuildingCollisionRecords(
        placement.id,
        this.buildingSystem.getMovementCollisionSnapshot(placement.id).records,
        minimumGroundY,
        foundationTopY
      );
    }
  }

  buildFoliage() {
    const treeDimensions = TERRAIN_SCALE.matureTree;
    const surfaceMaterials = this.getSurfaceAssets().materials;
    const trunkMat = surfaceMaterials.foliageTrunk;
    const leavesMat = surfaceMaterials.foliageLeaves;
    const leavesDarkMat = surfaceMaterials.foliageLeavesDark;
    const trunkGeometry = new THREE.CylinderGeometry(
      treeDimensions.trunkRadius * 0.72,
      treeDimensions.trunkRadius,
      treeDimensions.trunkHeight,
      6
    );
    // One shared detail-0 crown has 20 triangles. The previous detail-1 crown
    // had 80; three authored crown placements now submit 75% fewer canopy
    // triangles without adding objects or changing tree datums.
    const foliageGeometry = new THREE.IcosahedronGeometry(
      treeDimensions.canopyRadius,
      0
    );
    if (this.mapDescriptor.foliageRendering?.mode === 'instanced') {
      const entries = this.mapDescriptor.foliage;
      const mapFeatureIds = entries.map(entry => entry.id);
      const dummy = new THREE.Object3D();
      const buildInstances = ({
        name,
        geometry,
        material,
        localPosition,
        scale = 1
      }) => {
        const mesh = new THREE.InstancedMesh(
          geometry,
          material,
          entries.length
        );
        mesh.name = name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        entries.forEach((entry, index) => {
          const [x, z] = entry.position;
          const groundY = this.getHeightAt(x, z);
          dummy.position.set(
            x + localPosition[0],
            groundY + localPosition[1],
            z + localPosition[2]
          );
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.mapFeatureIds = mapFeatureIds;
        mesh.userData.profileId = 'mature-tree';
        mesh.userData.renderMode = 'instanced';
        mesh.userData.dataQuality =
          this.mapDescriptor.foliageRendering.dataQuality;
        this.scene.add(mesh);
        return mesh;
      };
      const crownBase = treeDimensions.totalHeight
        - treeDimensions.canopyRadius;
      this.foliageInstances = [
        buildInstances({
          name: 'MatureTreeTrunks',
          geometry: trunkGeometry,
          material: trunkMat,
          localPosition: [0, treeDimensions.trunkHeight * 0.5, 0]
        }),
        buildInstances({
          name: 'MatureTreeCrownsPrimary',
          geometry: foliageGeometry,
          material: leavesMat,
          localPosition: [0, crownBase, 0]
        }),
        buildInstances({
          name: 'MatureTreeCrownsWest',
          geometry: foliageGeometry,
          material: leavesDarkMat,
          localPosition: [-1.7, crownBase - 0.7, 0.4],
          scale: 0.72
        }),
        buildInstances({
          name: 'MatureTreeCrownsEast',
          geometry: foliageGeometry,
          material: leavesDarkMat,
          localPosition: [1.55, crownBase - 0.5, -0.5],
          scale: 0.76
        })
      ];
      this.foliageReady = typeof document === 'undefined' || !this.foliageTemplateProvider
        ? Promise.resolve(this.foliageInstances)
        : this.upgradeInstancedFoliageWithTemplate(this.foliageInstances);
      return this.foliageInstances;
    }

    this.mapDescriptor.foliage.forEach((entry) => {
      const [x, z] = entry.position;
      const tree = new THREE.Group();
      tree.name = 'MatureTree';
      tree.userData.mapFeatureId = entry.id;
      tree.userData.profileId = entry.profileId;
      const trunk = new THREE.Mesh(trunkGeometry, trunkMat);
      trunk.position.y = treeDimensions.trunkHeight * 0.5;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      tree.add(trunk);

      const crownBase = treeDimensions.totalHeight - treeDimensions.canopyRadius;
      const crownPlacements = [
        [0, crownBase, 0, 1],
        [-1.7, crownBase - 0.7, 0.4, 0.72],
        [1.55, crownBase - 0.5, -0.5, 0.76]
      ];
      crownPlacements.forEach(([cx, cy, cz, scale], index) => {
        const foliage = new THREE.Mesh(
          foliageGeometry,
          index === 0 ? leavesMat : leavesDarkMat
        );
        foliage.position.set(cx, cy, cz);
        foliage.scale.setScalar(scale);
        foliage.castShadow = true;
        foliage.receiveShadow = true;
        tree.add(foliage);
      });

      tree.position.set(x, this.getHeightAt(x, z), z);
      tree.userData.dimensionsMeters = {
        height: treeDimensions.totalHeight,
        trunkRadius: treeDimensions.trunkRadius,
        canopyRadius: treeDimensions.canopyRadius
      };
      this.scene.add(tree);
    });
    this.foliageReady = Promise.resolve([]);
  }

  async upgradeInstancedFoliageWithTemplate(expectedInstances) {
    try {
      const template = await this.foliageTemplateProvider.createTemplate({
        profileId: 'mature-tree',
        seed: 12345
      });
      if (!template) return expectedInstances;
      if (this.foliageInstances !== expectedInstances) {
        template.branchGeometry.dispose();
        template.leafGeometry.dispose();
        return this.foliageInstances;
      }

      const [branches, leaves, ...obsoleteCrowns] = expectedInstances;
      const obsoleteGeometries = new Set(expectedInstances.map(mesh => mesh.geometry));
      for (const mesh of obsoleteCrowns) this.scene.remove(mesh);

      branches.geometry = template.branchGeometry;
      branches.name = 'MatureTreeTemplateBranches';
      branches.userData.generator = template.generator;
      branches.userData.dataQuality = template.dataQuality;
      leaves.geometry = template.leafGeometry;
      leaves.name = 'MatureTreeTemplateLeaves';
      leaves.userData.generator = template.generator;
      leaves.userData.dataQuality = template.dataQuality;
      this.foliageInstances = [branches, leaves];

      for (const geometry of obsoleteGeometries) geometry.dispose();
      return this.foliageInstances;
    } catch (error) {
      console.warn('[WARN] EZ-Tree template generation failed; retaining bounded fallback foliage:', error);
      return expectedInstances;
    }
  }

  buildSetupZones() {
    const createZone = (faction, bounds) => {
      const width = bounds.maxX - bounds.minX;
      const depth = bounds.maxZ - bounds.minZ;
      const columns = Math.max(1, Math.ceil(width / (this.width / this.segments)));
      const rows = Math.max(1, Math.ceil(depth / (this.depth / this.segments)));
      const positions = [];
      const uvs = [];
      const indices = [];
      const surfaceOffset = 0.035;
      for (let row = 0; row <= rows; row++) {
        const z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, row / rows);
        for (let column = 0; column <= columns; column++) {
          const x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, column / columns);
          positions.push(
            x,
            this.getRenderedTerrainHeightAt(x, z) + surfaceOffset,
            z
          );
          uvs.push(column / columns, row / rows);
        }
      }
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const a = row * (columns + 1) + column;
          const b = a + 1;
          const c = a + columns + 1;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const material = new THREE.MeshBasicMaterial({
        color: bounds.color ?? 0xffffff,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const zone = new THREE.Mesh(geometry, material);
      zone.name = `${faction}_deployment_zone`;
      // Setup areas are visual-only and must never compete with terrain clicks.
      zone.raycast = () => {};
      zone.userData.deploymentBounds = { ...bounds };
      zone.userData.faction = faction;
      zone.userData.surfaceOffset = surfaceOffset;
      this.scene.add(zone);
      return zone;
    };

    this.deploymentZones = Object.fromEntries(
      Object.entries(this.deploymentZoneDefinitions)
        .map(([faction, bounds]) => [faction, createZone(faction, bounds)])
    );
  }

  removeSetupZones() {
    for (const zone of Object.values(this.deploymentZones ?? {})) {
      zone.visible = false;
      this.scene.remove(zone);
      zone.geometry?.dispose();
      if (Array.isArray(zone.material)) zone.material.forEach(material => material.dispose());
      else zone.material?.dispose();
    }
    this.deploymentZones = {};
  }
}
