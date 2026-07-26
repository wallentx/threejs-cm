import * as THREE from 'three';

export class TerrainBuilder {
  constructor(scene) {
    this.scene = scene;
    this.width = 240;
    this.depth = 240;
    this.segments = 60;
    this.terrainMesh = null;
    this.heightData = new Float32Array((this.segments + 1) * (this.segments + 1));
    this.bocageObstacles = [];
    this.buildings = [];
  }

  buildScenarioMap() {
    // 1. Terrain Geometry
    const geometry = new THREE.PlaneGeometry(this.width, this.depth, this.segments, this.segments);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      let h = Math.sin(x * 0.025) * 3.5 + Math.cos(z * 0.02) * 2.8;
      if (Math.abs(z - 10) < 12) {
        h -= 3.0;
      }

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

  getHeightAt(x, z) {
    let h = Math.sin(x * 0.025) * 3.5 + Math.cos(z * 0.02) * 2.8;
    if (Math.abs(z - 10) < 12) h -= 3.0;
    return h;
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

    // River Strip (Bright Blue)
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(0, 480, 1024, 64);

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

  buildRiverAndBridge() {
    const waterGeo = new THREE.PlaneGeometry(240, 22);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2f6f91,
      transparent: true,
      opacity: 0.82,
      roughness: 0.22,
      metalness: 0.05
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(0, -1.0, 10);
    this.scene.add(water);

    const stoneMat = new THREE.MeshLambertMaterial({ color: '#78716c' });
    const arch = new THREE.Mesh(new THREE.BoxGeometry(18, 3.5, 26), stoneMat);
    arch.position.set(0, 0.5, 10);
    this.scene.add(arch);
  }

  buildStoneWalls() {
    const wallMat = new THREE.MeshLambertMaterial({ color: '#78716c' });

    const createWallSegment = (x, z, length, isHorizontal) => {
      const wallGeo = new THREE.BoxGeometry(
        isHorizontal ? length : 2.0,
        2.2,
        isHorizontal ? 2.0 : length
      );
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(x, 1.1 + this.getHeightAt(x, z), z);
      this.scene.add(wall);

      this.bocageObstacles.push({
        minX: x - (isHorizontal ? length / 2 : 1.0),
        maxX: x + (isHorizontal ? length / 2 : 1.0),
        minZ: z - (isHorizontal ? 1.0 : length / 2),
        maxZ: z + (isHorizontal ? 1.0 : length / 2),
        height: 2.2,
        type: 'stonewall'
      });
    };

    createWallSegment(-40, 50, 70, true);
    createWallSegment(40, 50, 70, true);
    createWallSegment(-40, -40, 70, true);
    createWallSegment(40, -40, 70, true);
  }

  buildFrenchVillage() {
    const wallMat = new THREE.MeshLambertMaterial({ color: '#f5f5f4' });
    const roofMat = new THREE.MeshLambertMaterial({ color: '#dc2626' });

    const houseGroup = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 14), wallMat);
    walls.position.y = 5.0;
    houseGroup.add(walls);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(13, 7, 4), roofMat);
    roof.position.y = 13.5;
    roof.rotation.y = Math.PI / 4;
    houseGroup.add(roof);

    const hx = 45, hz = 60;
    houseGroup.position.set(hx, this.getHeightAt(hx, hz), hz);
    this.scene.add(houseGroup);

    this.bocageObstacles.push({
      minX: hx - 9, maxX: hx + 9,
      minZ: hz - 7, maxZ: hz + 7,
      height: 13.5,
      type: 'building'
    });
  }

  buildFoliage() {
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#57534e' });
    const leavesMat = new THREE.MeshLambertMaterial({ color: '#16a34a' });

    const treePositions = [
      [-60, 40], [60, -40], [-30, -60], [40, 70], [-70, -70]
    ];

    treePositions.forEach(([x, z]) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 7), trunkMat);
      trunk.position.y = 3.5;
      tree.add(trunk);

      const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(4.5), leavesMat);
      foliage.position.y = 8.0;
      tree.add(foliage);

      tree.position.set(x, this.getHeightAt(x, z), z);
      this.scene.add(tree);
    });
  }

  buildSetupZones() {
    const frZoneGeo = new THREE.PlaneGeometry(160, 40);
    frZoneGeo.rotateX(-Math.PI / 2);
    const frZoneMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.4 });
    const frZone = new THREE.Mesh(frZoneGeo, frZoneMat);
    frZone.position.set(0, 0.25, 80);
    this.scene.add(frZone);

    const gerZoneGeo = new THREE.PlaneGeometry(160, 40);
    gerZoneGeo.rotateX(-Math.PI / 2);
    const gerZoneMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.4 });
    const gerZone = new THREE.Mesh(gerZoneGeo, gerZoneMat);
    gerZone.position.set(0, 0.25, -80);
    this.scene.add(gerZone);
  }
}
