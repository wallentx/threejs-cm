import * as THREE from 'three';
import { TERRAIN_SCALE } from './TerrainScale.js';
import { StaticCollisionWorld } from '../simulation/collision/StaticCollisionWorld.js';
import { FR_HOUSE_12X9_2F } from '../maps/france/FranceHouse12x9_2F.js';
import {
  applyFrenchHouseVisualState,
  createFrenchHouseVisual
} from './buildings/FrenchHouse.js';

const QUAD_UVS = [
  0, 0,
  1, 0,
  1, 1,
  0, 1
];

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

export class TerrainBuilder {
  constructor(scene, { deploymentZones = {}, buildingSystem = null } = {}) {
    this.scene = scene;
    this.deploymentZoneDefinitions = deploymentZones;
    this.width = 240;
    this.depth = 240;
    this.segments = 60;
    this.terrainMesh = null;
    this.heightData = new Float32Array((this.segments + 1) * (this.segments + 1));
    this.bocageObstacles = [];
    this.buildings = [];
    this.colliderRecords = [];
    this.navigationRecords = [];
    this.collisionWorld = new StaticCollisionWorld();
    this.bridgeSurface = null;
    this.buildingSystem = buildingSystem;
  }

  buildScenarioMap() {
    // 1. Terrain Geometry
    const geometry = new THREE.PlaneGeometry(this.width, this.depth, this.segments, this.segments);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.getHeightAt(x, z);

      pos.setY(i, h);
      this.heightData[i] = h;
    }
    geometry.computeVertexNormals();

    // 2. High Visibility Ground Material
    const groundTex = this.generateGroundTexture();
    const material = new THREE.MeshStandardMaterial({
      map: groundTex,
      color: 0x667b4a,
      roughness: 0.94,
      metalness: 0.0
    });

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.name = "TerrainMesh";
    this.scene.add(this.terrainMesh);

    // 3. Environment Features
    this.buildRiverAndBridge();
    this.buildStoneWalls();
    this.buildFrenchVillage();
    this.buildFoliage();
    this.buildSetupZones();

    return this.terrainMesh;
  }

  getOpenGroundHeightAt(x, z) {
    return Math.sin(x * 0.025) * 3.5 + Math.cos(z * 0.02) * 2.8;
  }

  getHeightAt(x, z) {
    const river = TERRAIN_SCALE.river;
    const openGround = this.getOpenGroundHeightAt(x, z);
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

  getMovementHeightAt(x, z) {
    const bridge = this.bridgeSurface;
    if (bridge
        && Math.abs(x - bridge.centerX) <= bridge.halfRoadwayWidth
        && Math.abs(z - bridge.centerZ) <= bridge.halfSpan) {
      return bridge.deckTop;
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

  addNavigationRecord(record) {
    const index = this.navigationRecords.findIndex(candidate => candidate.id === record.id);
    if (index >= 0) this.navigationRecords[index] = { ...record };
    else this.navigationRecords.push({ ...record });
    this.collisionWorld.setNavigationRecords(this.navigationRecords);
  }

  registerUnitColliders(units) {
    for (const unit of units ?? []) unit.bindCollisionWorld?.(this.collisionWorld);
  }

  generateGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Base French Grass
    ctx.fillStyle = '#4c6b2f';
    ctx.fillRect(0, 0, 1024, 1024);

    // Wheat Fields
    ctx.fillStyle = '#b09943';
    ctx.fillRect(60, 60, 400, 400);

    ctx.fillStyle = '#567a3a';
    ctx.fillRect(560, 60, 400, 400);

    ctx.fillStyle = '#9e893c';
    ctx.fillRect(60, 560, 400, 400);

    // Dirt Road (Brown)
    ctx.fillStyle = '#92704a';
    ctx.fillRect(480, 0, 64, 1024);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  createMasonryMaterial() {
    if (this.masonryMaterial) return this.masonryMaterial;
    let masonryTexture = null;
    let masonryBumpTexture = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const bumpCanvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      bumpCanvas.width = canvas.width;
      bumpCanvas.height = canvas.height;
      const ctx = canvas.getContext('2d');
      const bumpCtx = bumpCanvas.getContext('2d');
      ctx.fillStyle = '#aaa39a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      bumpCtx.fillStyle = '#202020';
      bumpCtx.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);

      // Four exact courses/columns keep RepeatWrapping seamless.
      const courseHeight = 32;
      const stoneWidth = 64;
      const colors = ['#77736c', '#8a857c', '#696761', '#918b80'];
      const heights = ['#b8b8b8', '#d0d0d0', '#a8a8a8', '#c4c4c4'];
      for (let row = 0; row < 4; row++) {
        const y = row * courseHeight + 3;
        const offset = row % 2 === 0 ? -stoneWidth * 0.5 : 0;
        for (let column = -1; column < 5; column++) {
          const x = offset + column * stoneWidth + 3;
          const wrappedColumn = (
            (column % colors.length) + colors.length
          ) % colors.length;
          const stoneIndex = (row * 3 + wrappedColumn) % colors.length;
          ctx.fillStyle = colors[stoneIndex];
          ctx.fillRect(x, y, stoneWidth - 6, courseHeight - 6);
          bumpCtx.fillStyle = heights[stoneIndex];
          bumpCtx.fillRect(x, y, stoneWidth - 6, courseHeight - 6);
        }
      }

      masonryTexture = new THREE.CanvasTexture(canvas);
      masonryTexture.colorSpace = THREE.SRGBColorSpace;
      masonryTexture.wrapS = THREE.RepeatWrapping;
      masonryTexture.wrapT = THREE.RepeatWrapping;
      masonryTexture.needsUpdate = true;

      // Color and scalar data need different color-space declarations.
      masonryBumpTexture = new THREE.CanvasTexture(bumpCanvas);
      masonryBumpTexture.name = 'StoneMasonryBump';
      masonryBumpTexture.colorSpace = THREE.NoColorSpace;
      masonryBumpTexture.wrapS = THREE.RepeatWrapping;
      masonryBumpTexture.wrapT = THREE.RepeatWrapping;
      masonryBumpTexture.needsUpdate = true;
    }

    this.masonryMaterial = new THREE.MeshStandardMaterial({
      color: masonryTexture ? 0xffffff : 0x7d7971,
      map: masonryTexture,
      bumpMap: masonryBumpTexture,
      bumpScale: masonryBumpTexture ? 0.045 : 0,
      roughness: 0.96,
      metalness: 0
    });
    return this.masonryMaterial;
  }

  buildRiverAndBridge() {
    const { river, bridge } = TERRAIN_SCALE;
    const waterGeo = new THREE.PlaneGeometry(this.width, river.waterWidth);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2f6f91,
      transparent: true,
      opacity: 0.82,
      roughness: 0.22,
      metalness: 0.05
    });
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

    const stoneMat = this.createMasonryMaterial();
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x6f6758,
      roughness: 0.98,
      metalness: 0
    });
    const bridgeGroup = new THREE.Group();
    bridgeGroup.name = 'StoneBridge';
    const halfSpan = river.bridgeSpan * 0.5;
    const deckTop = Math.max(
      this.getHeightAt(0, river.centerZ - halfSpan),
      this.getHeightAt(0, river.centerZ + halfSpan)
    ) + 0.1;
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(
        bridge.roadwayWidth,
        bridge.deckThickness,
        river.bridgeSpan
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
      centerX: 0,
      centerZ: river.centerZ,
      halfRoadwayWidth: parapetInnerHalfWidth,
      halfSpan,
      deckTop
    };

    const parapetGeometry = createMeterUvBoxGeometry(
      bridge.parapetThickness,
      bridge.parapetHeight,
      river.bridgeSpan,
      bridge.masonryRepeatMeters
    );
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
      this.addColliderRecord({
        id: `bridge:parapet:${side < 0 ? 'west' : 'east'}`,
        type: 'bridge_parapet',
        centerX: side * parapetCenterX,
        centerZ: river.centerZ,
        halfX: bridge.parapetThickness * 0.5,
        halfZ: river.bridgeSpan * 0.5,
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
        this.addColliderRecord({
          id: `bridge:abutment:${side < 0 ? 'west' : 'east'}:${end < 0 ? 'south' : 'north'}`,
          type: 'bridge_abutment',
          centerX: abutment.position.x,
          centerZ: river.centerZ + abutment.position.z,
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
    bridgeGroup.position.z = river.centerZ;
    bridgeGroup.userData.dimensionsMeters = {
      width: bridge.roadwayWidth,
      length: river.bridgeSpan,
      deckTop
    };
    this.scene.add(bridgeGroup);

    const mapHalfWidth = this.width * 0.5;
    const openingHalfWidth = parapetInnerHalfWidth;
    const exclusionHalfWidth = (mapHalfWidth - openingHalfWidth) * 0.5;
    const riverExclusionIds = [];
    for (const side of [-1, 1]) {
      const exclusionId = `river:exclusion:${side < 0 ? 'west' : 'east'}`;
      riverExclusionIds.push(exclusionId);
      this.addColliderRecord({
        id: exclusionId,
        type: 'river_exclusion',
        centerX: side * (openingHalfWidth + exclusionHalfWidth),
        centerZ: river.centerZ,
        halfX: exclusionHalfWidth,
        halfZ: river.cutWidth * 0.5,
        rotation: 0,
        blocks: ['vehicle', 'infantry']
      });
    }
    this.addNavigationRecord({
      id: 'navigation:stone_bridge',
      type: 'bridge_crossing',
      centerX: 0,
      minZ: river.centerZ - halfSpan,
      maxZ: river.centerZ + halfSpan,
      halfOpeningWidth: openingHalfWidth,
      barrierColliderIds: riverExclusionIds,
      blocks: ['vehicle', 'infantry']
    });
  }

  buildStoneWalls() {
    const dimensions = TERRAIN_SCALE.stoneWall;
    const wallMaterial = this.createMasonryMaterial();
    this.stoneWallSegments = [];

    const createWallRun = (startX, startZ, endX, endZ, runId) => {
      const dx = endX - startX;
      const dz = endZ - startZ;
      const runLength = Math.hypot(dx, dz);
      const segmentCount = Math.ceil(runLength / dimensions.maximumSegmentLength);

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
          height: dimensions.height,
          thickness: dimensions.thickness,
          getHeightAt: (x, z) => this.getHeightAt(x, z)
        });
        const wall = new THREE.Mesh(geometry, wallMaterial);
        wall.name = `StoneWall_${runId}_${index}`;
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.userData.terrainFeature = 'stonewall';
        wall.userData.runId = runId;
        wall.userData.segmentIndex = index;
        wall.userData.start = [start.x, this.getHeightAt(start.x, start.z), start.z];
        wall.userData.end = [end.x, this.getHeightAt(end.x, end.z), end.z];
        wall.userData.dimensionsMeters = {
          height: dimensions.height,
          thickness: dimensions.thickness,
          length: runLength / segmentCount
        };
        this.scene.add(wall);
        this.stoneWallSegments.push(wall);

        const box = geometry.boundingBox;
        this.bocageObstacles.push({
          id: `${runId}_${index}`,
          minX: box.min.x,
          maxX: box.max.x,
          minY: box.min.y,
          maxY: box.max.y,
          minZ: box.min.z,
          maxZ: box.max.z,
          height: dimensions.height,
          type: 'stonewall'
        });
        this.addColliderRecord({
          id: `wall:${runId}:${index}`,
          type: 'stonewall',
          centerX: (start.x + end.x) * 0.5,
          centerZ: (start.z + end.z) * 0.5,
          halfX: dimensions.thickness * 0.5,
          halfZ: (runLength / segmentCount) * 0.5,
          rotation: Math.atan2(end.x - start.x, end.z - start.z),
          blocks: ['vehicle', 'infantry']
        });
      }
    };

    createWallRun(-75, 50, -5, 50, 'north_west');
    createWallRun(5, 50, 75, 50, 'north_east');
    createWallRun(-75, -40, -5, -40, 'south_west');
    createWallRun(5, -40, 75, -40, 'south_east');
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

  syncBuildingRuntime(buildingId) {
    if (!this.buildingSystem) return null;
    const building = this.buildings.find(record => record.id === buildingId);
    if (!building) return null;
    const runtime = this.buildingSystem.getBuildingSnapshot(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    applyFrenchHouseVisualState(building.object, descriptor, runtime, {
      interiorPresence: building.interiorPresence ?? 0
    });
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
    const runtime = this.buildingSystem.getBuildingSnapshot(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding(buildingId);
    applyFrenchHouseVisualState(building.object, descriptor, runtime, {
      interiorPresence: nextPresence
    });
    return { buildingId, interiorPresence: nextPresence, changed: true };
  }

  buildFrenchVillage() {
    const descriptor = FR_HOUSE_12X9_2F;
    const hx = 45;
    const hz = 60;
    const width = descriptor.bounds.max[0] - descriptor.bounds.min[0];
    const depth = descriptor.bounds.max[2] - descriptor.bounds.min[2];
    const halfWidth = width * 0.5;
    const halfDepth = depth * 0.5;
    const groundCorners = [
      [hx - halfWidth, hz + halfDepth],
      [hx + halfWidth, hz + halfDepth],
      [hx + halfWidth, hz - halfDepth],
      [hx - halfWidth, hz - halfDepth]
    ].map(([x, z]) => [x, this.getHeightAt(x, z), z]);
    const minimumGroundY = Math.min(...groundCorners.map(([, y]) => y));
    const foundationTopY = Math.max(...groundCorners.map(([, y]) => y)) + 0.12;
    const buildingId = 'french_village_house';
    let runtime = null;
    if (this.buildingSystem) {
      try {
        runtime = this.buildingSystem.getBuildingSnapshot(buildingId);
      } catch {
        runtime = this.buildingSystem.addBuilding({
          id: buildingId,
          descriptor,
          transform: { position: [hx, foundationTopY, hz], rotationY: 0 }
        });
      }
    }
    const houseGroup = createFrenchHouseVisual({
      descriptor,
      runtime,
      centerX: hx,
      centerZ: hz,
      foundationTopY,
      getHeightAt: (x, z) => this.getHeightAt(x, z)
    });
    this.scene.add(houseGroup);
    this.buildings.push({
      id: buildingId,
      descriptorId: descriptor.id,
      object: houseGroup,
      interiorPresence: 0,
      runtimeEventVersion: runtime?.eventVersion ?? 0,
      runtimeCollisionVersion: runtime?.collisionVersion ?? 0
    });

    // StaticCollisionWorld is intentionally X/Z-only. Publishing upper-storey
    // walls here would turn them into a ground-level invisible blocker. Full
    // 3D projectile/spotting queries consume the complete BuildingSystem
    // snapshot; ground movement consumes only the ground shell.
    const records = runtime && this.buildingSystem
      ? this.buildingSystem.getMovementCollisionSnapshot(buildingId).records
      : descriptor.sections
        .filter(section => section.kind === 'wall')
        .flatMap(section => section.colliderParts
          .map(part => ({
            id: `building:${buildingId}:${section.id}:${part.id}`,
            type: 'building',
            buildingId,
            sectionId: section.id,
            centerX: hx + part.center[0],
            centerZ: hz + part.center[2],
            minY: foundationTopY + part.center[1] - part.halfExtents[1],
            maxY: foundationTopY + part.center[1] + part.halfExtents[1],
            halfX: part.halfExtents[0],
            halfZ: part.halfExtents[2],
            rotation: part.rotationY ?? 0,
            // All facade apertures remain physical movement blockers. Door
            // transit is applied by BuildingInteractionSystem, never normal
            // collision-based pathing. Projectiles/LOS use BuildingSystem's
            // separate aperture-aware collision snapshot.
            blocks: ['vehicle', 'infantry'],
            movementPolicy: part.openingId ? 'portal_or_fire_port_required' : 'structural'
          })));
    this.replaceBuildingCollisionRecords(
      buildingId,
      records,
      minimumGroundY,
      foundationTopY
    );
  }

  buildFoliage() {
    const treeDimensions = TERRAIN_SCALE.matureTree;
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#57534e' });
    const leavesMat = new THREE.MeshLambertMaterial({ color: '#28723b' });
    const leavesDarkMat = new THREE.MeshLambertMaterial({ color: '#1f5e33' });
    const trunkGeometry = new THREE.CylinderGeometry(
      treeDimensions.trunkRadius * 0.72,
      treeDimensions.trunkRadius,
      treeDimensions.trunkHeight,
      8
    );
    const foliageGeometry = new THREE.IcosahedronGeometry(treeDimensions.canopyRadius, 1);

    const treePositions = [
      [-60, 40], [60, -40], [-30, -60], [40, 70], [-70, -70]
    ];

    treePositions.forEach(([x, z]) => {
      const tree = new THREE.Group();
      tree.name = 'MatureTree';
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
          positions.push(x, this.getHeightAt(x, z) + surfaceOffset, z);
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
