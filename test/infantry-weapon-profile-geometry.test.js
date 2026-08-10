import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createFrance1940InfantryWeaponRig
} from '../src/content/france1940/render/index.js';
import { BERTHIER_M1892_M16_VISUAL_DATA } from '../src/content/france1940/render/BerthierM1892M16VisualData.js';
import {
  LEBEL_M1886_M93_APX1916_VISUAL_DATA,
  LEBEL_M1886_M93_VISUAL_DATA
} from '../src/content/france1940/render/LebelM1886M93VisualData.js';
import { KAR98K_VISUAL_DATA } from '../src/content/france1940/render/Kar98kVisualData.js';
import { LEBEL_M1886_M93_REFERENCE_MESH_DATA } from '../src/content/france1940/render/LebelM1886M93ReferenceMeshData.js';
import { MAS36_VISUAL_DATA } from '../src/content/france1940/render/Mas36VisualData.js';
import { Unit } from './helpers/France1940TestUnit.js';

const TOLERANCE = 1e-6;

const EXPECTED_PROFILE_PARTS = Object.freeze({
  'Berthier Mousqueton Mle 1892 M16': Object.freeze({
    stock: Object.freeze({
      width: BERTHIER_M1892_M16_VISUAL_DATA.widths.stock,
      minZ: 0,
      maxZ: BERTHIER_M1892_M16_VISUAL_DATA.stations.stockNose
    }),
    receiver: Object.freeze({
      width: BERTHIER_M1892_M16_VISUAL_DATA.widths.receiver,
      minZ: BERTHIER_M1892_M16_VISUAL_DATA.stations.receiverStart,
      maxZ: BERTHIER_M1892_M16_VISUAL_DATA.stations.receiverEnd
    }),
    handguard: Object.freeze({
      width: BERTHIER_M1892_M16_VISUAL_DATA.widths.handguard,
      minZ: BERTHIER_M1892_M16_VISUAL_DATA.stations.handguardStart,
      maxZ: BERTHIER_M1892_M16_VISUAL_DATA.stations.handguardEnd
    })
  }),
  'MAS-36 Rifle': Object.freeze({
    stock: Object.freeze({ width: 0.048, minZ: 0, maxZ: MAS36_VISUAL_DATA.stations.stockNose }),
    receiver: Object.freeze({ width: 0.043, minZ: MAS36_VISUAL_DATA.stations.receiverStart, maxZ: MAS36_VISUAL_DATA.stations.receiverEnd }),
    handguard: Object.freeze({ width: 0.038, minZ: MAS36_VISUAL_DATA.stations.receiverEnd, maxZ: MAS36_VISUAL_DATA.stations.handguardEnd })
  }),
  'FM 24/29 LMG': Object.freeze({
    stock: Object.freeze({ width: 0.045, minZ: 0, maxZ: 0.34 }),
    receiver: Object.freeze({ width: 0.048, minZ: 0.34, maxZ: 0.75 }),
    handguard: Object.freeze({ width: 0.045, minZ: 0.58, maxZ: 0.73 })
  }),
  'MAS-38 SMG': Object.freeze({
    stock: Object.freeze({ width: 0.046, minZ: 0, maxZ: 0.20 }),
    receiver: Object.freeze({ width: 0.044, minZ: 0.20, maxZ: 0.40 })
  })
});

function assertNear(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE,
    `${label}: expected ${expected}, received ${actual}`
  );
}

function signedVolume(geometry) {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  const vertexCount = indices ? indices.count : positions.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let volume = 0;

  for (let offset = 0; offset < vertexCount; offset += 3) {
    const ia = indices ? indices.getX(offset) : offset;
    const ib = indices ? indices.getX(offset + 1) : offset + 1;
    const ic = indices ? indices.getX(offset + 2) : offset + 2;
    a.fromBufferAttribute(positions, ia);
    b.fromBufferAttribute(positions, ib);
    c.fromBufferAttribute(positions, ic);
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  }

  return volume;
}

test('authored weapon profiles use narrow X width, forward Z length, and outward faces', () => {
  const materials = {
    wood: new THREE.MeshBasicMaterial(),
    metal: new THREE.MeshBasicMaterial()
  };

  try {
    for (const [weaponName, expectedParts] of Object.entries(EXPECTED_PROFILE_PARTS)) {
      const rig = createFrance1940InfantryWeaponRig(weaponName, materials);
      const parts = rig.userData.weaponModel.userData.parts;
      const model = rig.userData.weaponModel;
      model.removeFromParent();
      model.updateMatrixWorld(true);

      for (const [partName, expected] of Object.entries(expectedParts)) {
        const part = parts[partName];
        assert.ok(part, `${weaponName} must expose ${partName}`);
        const bounds = new THREE.Box3().setFromObject(part);

        assertNear(bounds.min.x, -expected.width / 2, `${weaponName} ${partName} min X`);
        assertNear(bounds.max.x, expected.width / 2, `${weaponName} ${partName} max X`);
        assertNear(bounds.min.z, expected.minZ, `${weaponName} ${partName} min Z`);
        assertNear(bounds.max.z, expected.maxZ, `${weaponName} ${partName} max Z`);
        assert.ok(
          signedVolume(part.geometry) > 0,
          `${weaponName} ${partName} triangles must face outward`
        );
      }

      model.traverse(object => object.geometry?.dispose());
    }
  } finally {
    materials.wood.dispose();
    materials.metal.dispose();
  }
});

function triangleCount(object) {
  let count = 0;
  object.traverse(part => {
    if (!part.isMesh) return;
    count += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
  });
  return count;
}

function verticesInsideBounds(mesh, bounds) {
  const positions = mesh.geometry.attributes.position;
  const point = new THREE.Vector3();
  let count = 0;
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
    if (bounds.containsPoint(point)) count += 1;
  }
  return count;
}

test('Lebel variants preserve GLB topology, receiver-metal bands, matte-silver bolts, and the APX assembly', () => {
  const variants = [
    ['Lebel Mle 1886/93', false, 1562],
    ['Lebel Mle 1886/93 with APX 1916', true, 2012]
  ];

  for (const [weaponName, expectsOptic, expectedTriangleCount] of variants) {
    const materials = {
      wood: new THREE.MeshBasicMaterial(),
      metal: new THREE.MeshBasicMaterial(),
      boltMetal: new THREE.MeshBasicMaterial()
    };
    const rig = createFrance1940InfantryWeaponRig(weaponName, materials);
    const model = rig.userData.weaponModel;
    model.removeFromParent();
    model.updateMatrixWorld(true);

    try {
      const parts = model.userData.parts;
      const expectedVisualData = expectsOptic
        ? LEBEL_M1886_M93_APX1916_VISUAL_DATA
        : LEBEL_M1886_M93_VISUAL_DATA;
      assert.equal(
        model.userData.visualContract.source.sha256,
        '3fe2791ae8cdc83abf6a2fac1b5b9bc6a412da5d9467a9111c26a40eae1e8e88'
      );
      assert.equal(
        expectedVisualData.illustratedReference.sha256,
        '91a0c3a8230899a0611326be8337d647d115c0be16b56f3ba816a4c341c408a3'
      );
      assert.equal(
        model.userData.visualContract.crossViewReference.sha256,
        '3fe2791ae8cdc83abf6a2fac1b5b9bc6a412da5d9467a9111c26a40eae1e8e88'
      );
      assert.deepEqual(
        model.userData.visualContract.crossViewReference.selectedNodes,
        ['Lebel_Rifle_Uncovered', 'Lebel_Rifle_Covered']
      );
      assert.equal(
        model.userData.visualContract.referenceMeshSource.sha256,
        '3fe2791ae8cdc83abf6a2fac1b5b9bc6a412da5d9467a9111c26a40eae1e8e88'
      );
      assert.equal(
        model.userData.weaponLodContract.triangleCounts.high,
        expectedTriangleCount
      );
      assert.deepEqual(
        model.userData.weaponLodContract.distancesMetres,
        { highMax: 4, mediumMax: 18 }
      );
      assert.ok(
        model.userData.weaponLodContract.triangleCounts.medium
          <= expectedTriangleCount * 0.26,
        `${weaponName} medium LOD must use at most 26% of the source topology`
      );
      assert.ok(
        model.userData.weaponLodContract.triangleCounts.core
          <= expectedTriangleCount * 0.11,
        `${weaponName} core LOD must use at most 11% of the source topology`
      );
      for (const [tier, meshes] of Object.entries(model.userData.weaponLodRepresentations)) {
        assert.ok(meshes.length > 0, `${weaponName} ${tier} LOD must own geometry`);
        assert.equal(
          meshes.every(mesh => mesh.userData.weaponLodTier === tier),
          true
        );
        assert.equal(
          meshes.every(mesh => mesh.visible === (tier === 'high')),
          true
        );
      }
      assert.equal(parts.receiver, parts.bodyBarrelAssembly);
      assert.equal(parts.barrel, parts.bodyBarrelAssembly);
      assert.equal(parts.magazine, parts.bodyBarrelAssembly);
      assert.equal(parts.magazine.userData.feedType, 'tubular');
      assert.equal(parts.muzzle.position.z, 1.30);
      assert.equal(Boolean(parts.optic), expectsOptic);
      assert.equal(
        parts.bodyBarrelAssembly.userData.sourceNodeName,
        'Body_Barrel_Lebel_1886_mat_0'
      );
      assert.equal(parts.bodyBarrelAssembly.userData.sourceTriangleCount, 393);
      assert.ok(parts.bodyBarrelAssembly.userData.correctedVertexCount > 0);
      assert.equal(parts.boltBack.userData.sourceTriangleCount, 140);
      assert.equal(parts.boltHandle.userData.sourceTriangleCount, 184);
      assert.equal(parts.boltBack.material, materials.boltMetal);
      assert.equal(parts.boltHandle.material, materials.boltMetal);
      assert.equal(triangleCount(parts.rearSight), 202);
      assert.ok(parts.stackingTube);
      assert.equal(parts.boltHandle.userData.semanticSide, 'right');

      const handguardReference = expectsOptic
        ? LEBEL_M1886_M93_REFERENCE_MESH_DATA.scoped.handguard
        : LEBEL_M1886_M93_REFERENCE_MESH_DATA.plain.handguard;
      assert.deepEqual(handguardReference.materialSlots, ['wood', 'metal']);
      assert.deepEqual(parts.handguard.material, [materials.wood, materials.metal]);
      assert.equal(parts.bodyBarrelAssembly.material, materials.metal);
      assert.deepEqual(
        parts.handguard.geometry.groups,
        handguardReference.groups.map(({ start, count, materialIndex }) => ({
          start,
          count,
          materialIndex
        }))
      );
      assert.equal(
        parts.handguard.geometry.groups.reduce((count, group) => count + group.count, 0),
        parts.handguard.geometry.index.count,
        `${weaponName} handguard material groups must preserve every supplied GLB triangle`
      );
      const receiverMetalGroup = parts.handguard.geometry.groups.find(
        group => group.materialIndex === 1
      );
      assert.ok(receiverMetalGroup, `${weaponName} must expose a receiver-metal furniture-band group`);
      const receiverMetalStations = new Set();
      const handguardPositions = parts.handguard.geometry.attributes.position;
      const handguardIndices = parts.handguard.geometry.index;
      for (
        let offset = receiverMetalGroup.start;
        offset < receiverMetalGroup.start + receiverMetalGroup.count;
        offset += 1
      ) {
        receiverMetalStations.add(
          handguardPositions.getZ(handguardIndices.getX(offset)).toFixed(4)
        );
      }
      assert.deepEqual(
        [...receiverMetalStations].sort(),
        ['0.7214', '0.7365', '1.1599', '1.1784'],
        `${weaponName} receiver metal must remain limited to the two GLB furniture bands`
      );

      const bodyBounds = new THREE.Box3().setFromObject(parts.bodyBarrelAssembly);
      const handguardBounds = new THREE.Box3().setFromObject(parts.handguard);
      const stackingTubeBounds = new THREE.Box3().setFromObject(parts.stackingTube);
      const triggerGuardBounds = new THREE.Box3().setFromObject(parts.triggerGuard);
      const frontSightBounds = new THREE.Box3().setFromObject(parts.frontSight);
      const rearSightMountBounds = new THREE.Box3().setFromObject(parts.rearSightMount);
      const rearSightPostBounds = new THREE.Box3().setFromObject(parts.rearSightPost);
      const boltBackBounds = new THREE.Box3().setFromObject(parts.boltBack);
      const boltHandleBounds = new THREE.Box3().setFromObject(parts.boltHandle);
      const boltReference = LEBEL_M1886_M93_VISUAL_DATA.controls.boltAction;
      assertNear(
        bodyBounds.min.z,
        0.269727,
        `${weaponName} source-topology metal assembly starts at the receiver tang`
      );
      assertNear(
        bodyBounds.max.z,
        1.30,
        `${weaponName} source-topology metal assembly reaches the muzzle`
      );
      assert.deepEqual(
        parts.bodyBarrelAssembly.userData.semanticRegions,
        {
          receiver: { startZ: 0.2697, endZ: 0.5884 },
          barrel: { startZ: 0.5779, endZ: 1.30 },
          tubeMagazine: { startZ: 0.3568, endZ: 1.2581 }
        }
      );
      assert.equal(
        LEBEL_M1886_M93_VISUAL_DATA.controls.barrel.rendererRadiusPixels,
        LEBEL_M1886_M93_VISUAL_DATA.controls.barrel.sourceRadiusPixels * 2
      );
      assertNear(
        parts.bodyBarrelAssembly.userData.rendererCorrection.sourceRadius,
        LEBEL_M1886_M93_REFERENCE_MESH_DATA.source.sourceBarrelRadius,
        `${weaponName} retains the uncorrected GLB barrel radius`
      );
      assertNear(
        parts.bodyBarrelAssembly.userData.rendererCorrection.rendererRadius,
        LEBEL_M1886_M93_VISUAL_DATA.controls.barrel.rendererRadiusMetres,
        `${weaponName} applies the user-reviewed barrel radius separately`
      );
      assertNear(
        triggerGuardBounds.max.x - triggerGuardBounds.min.x,
        LEBEL_M1886_M93_VISUAL_DATA.widths.triggerGuard,
        `${weaponName} GLB-informed trigger-guard width`
      );
      assertNear(
        frontSightBounds.max.x - frontSightBounds.min.x,
        LEBEL_M1886_M93_VISUAL_DATA.widths.frontSight,
        `${weaponName} GLB-informed front-sight width`
      );
      const boltPositions = parts.boltHandle.geometry.attributes.position;
      for (let index = 0; index < boltPositions.count; index += 1) {
        const x = boltPositions.getX(index);
        if (Math.abs(x) <= boltReference.bodyRadius + TOLERANCE) continue;
        assert.ok(
          x < 0,
          `${weaponName} every vertex beyond the central bolt body must project on weapon right (-X)`
        );
      }
      assertNear(
        boltHandleBounds.min.x,
        -boltReference.knobEndOffset,
        `${weaponName} GLB bolt handle and knob right-side reach`
      );
      assertNear(
        boltHandleBounds.min.z,
        boltReference.bodyStartZ,
        `${weaponName} GLB bolt-action start`
      );
      assertNear(
        boltHandleBounds.max.z,
        boltReference.bodyEndZ,
        `${weaponName} GLB bolt-action end`
      );
      assertNear(
        boltBackBounds.min.z,
        boltReference.rearPieceStartZ,
        `${weaponName} GLB-informed tapered cocking-piece start`
      );
      assertNear(
        boltBackBounds.max.z,
        boltReference.rearPieceEndZ,
        `${weaponName} GLB-informed tapered cocking-piece end`
      );
      assert.ok(
        verticesInsideBounds(parts.rearSightMount, bodyBounds) > 0,
        `${weaponName} rear-sight mount must contain source vertices inside the receiver/barrel assembly`
      );
      assert.ok(
        verticesInsideBounds(parts.rearSightPost, rearSightMountBounds) > 0,
        `${weaponName} rear-sight post must contain source vertices inside its mount`
      );
      assert.ok(
        verticesInsideBounds(parts.rearSightLeaf, rearSightPostBounds) > 0,
        `${weaponName} rear-sight leaf must contain source vertices inside its post`
      );
      assertNear(
        stackingTubeBounds.min.z,
        LEBEL_M1886_M93_VISUAL_DATA.controls.stackingTube.startZ,
        `${weaponName} source stacking-tube start`
      );
      assert.ok(
        bodyBounds.containsPoint(
          new THREE.Vector3(...parts.stackingTube.userData.connectionStart)
        ),
        `${weaponName} stacking tube must originate inside the integrated front hardware`
      );
      assert.equal(parts.stackingTube.userData.semanticPart, 'stackingTube');
      assert.equal(
        parts.stackingTube.userData.sourceNodeName,
        'Cleaing_Rod_Lebel_1886_mat_0'
      );
      assertNear(
        stackingTubeBounds.max.z,
        LEBEL_M1886_M93_VISUAL_DATA.controls.stackingTube.endZ,
        `${weaponName} GLB-informed stacking-tube end`
      );
      assert.deepEqual(
        LEBEL_M1886_M93_VISUAL_DATA.controls.boltHandle.illustratedStart.sourcePixel,
        { x: 910, y: 73 }
      );

      if (expectsOptic) {
        assert.equal(parts.optic.userData.opticId, 'APX_1916');
        assert.equal(parts.optic.userData.semanticSide, 'left');
        assert.equal(parts.optic.userData.connectedSourceAssembly, true);
        assert.equal(parts.optic.userData.sourceTriangleCount, 392);
        assert.equal(parts.optic.userData.sourceNodeName, 'Scope_Lebel_1886_mat_0');
        const opticBounds = new THREE.Box3().setFromObject(parts.optic);
        const scopeReference = LEBEL_M1886_M93_APX1916_VISUAL_DATA
          .crossViewReference.normalizedMeasurements.scopeBounds;
        assert.ok(opticBounds.min.x > 0, 'APX 1916 optic must be entirely left of center (+X)');
        assertNear(
          opticBounds.max.x - opticBounds.min.x,
          scopeReference.width,
          'APX 1916 GLB-informed optic width'
        );
        assertNear(
          opticBounds.max.y - opticBounds.min.y,
          scopeReference.height,
          'APX 1916 GLB topology height'
        );
        assertNear(
          opticBounds.max.z - opticBounds.min.z,
          scopeReference.length,
          'APX 1916 GLB topology length'
        );
        assert.ok(
          verticesInsideBounds(parts.optic, bodyBounds) > 0
            || verticesInsideBounds(parts.optic, handguardBounds) > 0,
          'APX 1916 connected mount geometry must seat into the rifle envelope'
        );
      } else {
        assert.equal(parts.optic, null);
      }

      for (const mesh of parts.detailedMeshes) {
        assert.ok(
          signedVolume(mesh.geometry) > 0,
          `${weaponName} ${mesh.name} reference triangles must face outward`
        );
      }
    } finally {
      model.traverse(object => object.geometry?.dispose());
      materials.wood.dispose();
      materials.metal.dispose();
      materials.boltMetal.dispose();
    }
  }
});

test('Berthier Mle 1892 M16 consumes the supplied side-elevation landmarks', () => {
  const materials = {
    wood: new THREE.MeshBasicMaterial(),
    metal: new THREE.MeshBasicMaterial()
  };
  const rig = createFrance1940InfantryWeaponRig(
    'Berthier Mousqueton Mle 1892 M16',
    materials
  );
  const model = rig.userData.weaponModel;
  model.removeFromParent();
  model.updateMatrixWorld(true);

  try {
    const parts = model.userData.parts;
    assert.equal(
      model.userData.visualContract.source.sha256,
      '15930b9e997f901b8657bae19594945b735ce42f77e4c5f91efe4dee111fcc46'
    );
    assert.deepEqual(
      model.userData.weaponLodContract.distancesMetres,
      { highMax: 4, mediumMax: 18 }
    );
    assert.equal(model.userData.weaponLodContract.triangleCounts.high, 712);
    assert.ok(
      model.userData.weaponLodContract.triangleCounts.medium <= 712 * 0.6,
      'Berthier medium LOD must use at most 60% of the detailed topology'
    );
    assert.ok(
      model.userData.weaponLodContract.triangleCounts.core <= 712 * 0.27,
      'Berthier core LOD must use at most 27% of the detailed topology'
    );
    for (const [tier, meshes] of Object.entries(model.userData.weaponLodRepresentations)) {
      assert.ok(meshes.length > 0, `Berthier ${tier} LOD must own geometry`);
      assert.equal(
        meshes.every(mesh => mesh.userData.weaponLodTier === tier),
        true
      );
      assert.equal(
        meshes.every(mesh => mesh.visible === (tier === 'high')),
        true
      );
    }
    assert.deepEqual(
      BERTHIER_M1892_M16_VISUAL_DATA.profiles.stock[0].sourcePixel,
      { x: 8, y: 352 }
    );
    assert.equal(parts.magazine.userData.feedType, 'en-bloc');
    assert.equal(parts.muzzle.position.z, 0.945);
    assertNear(
      rig.userData.grips.trigger.position.z,
      BERTHIER_M1892_M16_VISUAL_DATA.visualSpec.triggerGripStation,
      'Berthier trigger grip station'
    );
    assertNear(
      rig.userData.grips.support.position.z,
      BERTHIER_M1892_M16_VISUAL_DATA.visualSpec.supportGripStation,
      'Berthier support grip station'
    );
    assertNear(
      rig.userData.grips.reload.position.z,
      BERTHIER_M1892_M16_VISUAL_DATA.visualSpec.reloadGripStation,
      'Berthier reload grip station'
    );
    assert.ok(parts.upperHandguard);
    assert.ok(parts.forwardUpperHandguard);
    assert.ok(parts.rearSight);
    assert.ok(parts.frontBand);
    assert.ok(parts.stackingRod);
    assert.equal(parts.stackingRod.userData.semanticSide, 'right');
    assert.deepEqual(parts.boltHandle.userData.connectionEnd, [
      parts.boltKnob.position.x,
      BERTHIER_M1892_M16_VISUAL_DATA.controls.boltHandle.end.y,
      BERTHIER_M1892_M16_VISUAL_DATA.controls.boltHandle.end.z
    ]);
    const magazineBounds = new THREE.Box3().setFromObject(parts.magazine);
    const receiverBounds = new THREE.Box3().setFromObject(parts.receiver);
    const barrelBounds = new THREE.Box3().setFromObject(parts.barrel);
    const frontBandBounds = new THREE.Box3().setFromObject(parts.frontBand);
    const forwardUpperHandguardBounds = new THREE.Box3()
      .setFromObject(parts.forwardUpperHandguard);
    const stackingRodBounds = new THREE.Box3().setFromObject(parts.stackingRod);
    const frontSightBounds = new THREE.Box3().setFromObject(parts.frontSight);
    assertNear(
      receiverBounds.max.x - receiverBounds.min.x,
      receiverBounds.max.y - receiverBounds.min.y,
      'Berthier receiver tube circular section'
    );
    assertNear(
      barrelBounds.min.z,
      BERTHIER_M1892_M16_VISUAL_DATA.stations.receiverEnd,
      'Berthier barrel seats at receiver'
    );
    assertNear(
      barrelBounds.max.x - barrelBounds.min.x,
      BERTHIER_M1892_M16_VISUAL_DATA.visualSpec.barrelRadius * 2,
      'Berthier user-reviewed barrel diameter'
    );
    assertNear(
      forwardUpperHandguardBounds.min.z,
      BERTHIER_M1892_M16_VISUAL_DATA.stations.midBandEnd,
      'Berthier forward upper handguard starts after sling band'
    );
    assertNear(
      forwardUpperHandguardBounds.max.z,
      BERTHIER_M1892_M16_VISUAL_DATA.stations.forwardUpperHandguardEnd,
      'Berthier forward upper handguard ends at its corrected source station'
    );
    assert.ok(
      forwardUpperHandguardBounds.max.z
        < BERTHIER_M1892_M16_VISUAL_DATA.stations.frontBandStart,
      'Berthier forward upper handguard must expose barrel before the front band'
    );
    assert.ok(
      stackingRodBounds.max.x < 0,
      'Berthier stacking rod must stay entirely on weapon right (-X)'
    );
    assert.ok(
      frontBandBounds.containsPoint(
        new THREE.Vector3(...parts.stackingRod.userData.connectionStart)
      ),
      'Berthier stacking rod rear centerline must terminate inside the front band'
    );
    assertNear(
      stackingRodBounds.max.z,
      BERTHIER_M1892_M16_VISUAL_DATA.controls.stackingRod.endZ,
      'Berthier stacking rod corrected forward endpoint'
    );
    assertNear(
      frontSightBounds.max.x - frontSightBounds.min.x,
      BERTHIER_M1892_M16_VISUAL_DATA.widths.frontSight,
      'Berthier front sight narrow cross-view width'
    );
    assert.deepEqual(
      BERTHIER_M1892_M16_VISUAL_DATA.profiles.frontSight.map(point => point.sourcePixel),
      [{ x: 1128, y: 248 }, { x: 1135, y: 233 }, { x: 1142, y: 248 }]
    );
    assert.ok(
      BERTHIER_M1892_M16_VISUAL_DATA.profiles.magazine.some(
        point => point.sourcePixel.x === 631 && point.sourcePixel.y === 330
      ),
      'Berthier magazine profile must retain its raised forward corner correction'
    );
    assertNear(
      magazineBounds.min.y,
      Math.min(...BERTHIER_M1892_M16_VISUAL_DATA.profiles.magazine.map(point => point.y)),
      'Berthier registered M16 magazine bottom'
    );
  } finally {
    model.traverse(object => object.geometry?.dispose());
    materials.wood.dispose();
    materials.metal.dispose();
  }
});

test('Kar98k consumes its registered sheet profile with connected action and lower-detail LODs', () => {
  const materials = {
    wood: new THREE.MeshBasicMaterial({ side: THREE.FrontSide }),
    metal: new THREE.MeshBasicMaterial({ side: THREE.FrontSide }),
    boltMetal: new THREE.MeshBasicMaterial({ side: THREE.FrontSide })
  };
  const rig = createFrance1940InfantryWeaponRig('Kar98k', materials);
  const model = rig.userData.weaponModel;
  model.removeFromParent();
  model.updateMatrixWorld(true);

  try {
    const parts = model.userData.parts;
    assert.equal(
      model.userData.visualContract.source.sha256,
      '7fa2ec50c71ae578085d3b8a6f3ceeca3ad05714fa5d2dd1f531896da26f0d2a'
    );
    assert.deepEqual(
      KAR98K_VISUAL_DATA.profiles.stock[0].sourcePixel,
      { x: 53, y: 772 }
    );
    assert.deepEqual(
      model.userData.weaponLodContract.distancesMetres,
      { highMax: 4, mediumMax: 18 }
    );
    assert.equal(model.userData.weaponLodContract.triangleCounts.high, 664);
    assert.ok(
      model.userData.weaponLodContract.triangleCounts.medium
        <= model.userData.weaponLodContract.triangleCounts.high * 0.7
    );
    assert.ok(
      model.userData.weaponLodContract.triangleCounts.core
        <= model.userData.weaponLodContract.triangleCounts.high * 0.28
    );
    for (const [tier, meshes] of Object.entries(model.userData.weaponLodRepresentations)) {
      assert.ok(meshes.length > 0, `Kar98k ${tier} LOD must own geometry`);
      assert.equal(meshes.every(mesh => mesh.userData.weaponLodTier === tier), true);
      assert.equal(meshes.every(mesh => mesh.visible === (tier === 'high')), true);
    }

    const stockBounds = new THREE.Box3().setFromObject(parts.stock);
    const handguardBounds = new THREE.Box3().setFromObject(parts.handguard);
    const receiverBounds = new THREE.Box3().setFromObject(parts.receiver);
    const barrelBounds = new THREE.Box3().setFromObject(parts.barrel);
    const frontBandBounds = new THREE.Box3().setFromObject(parts.frontBand);
    assert.ok(receiverBounds.intersectsBox(stockBounds));
    assert.ok(receiverBounds.intersectsBox(handguardBounds));
    assert.ok(barrelBounds.intersectsBox(handguardBounds));
    assert.ok(frontBandBounds.intersectsBox(barrelBounds));
    assert.ok(
      receiverBounds.containsPoint(new THREE.Vector3(...parts.boltHandle.userData.connectionStart)),
      'Kar98k bolt-handle root must terminate inside the receiver envelope'
    );
    assert.equal(parts.boltHandle.userData.semanticSide, 'right');
    assert.equal(parts.ejectionPort.userData.semanticSide, 'right');
    assert.ok(parts.boltHandle.position.x < 0);
    assert.ok(parts.ejectionPort.position.x < 0);
    assert.equal(parts.boltBody.material, materials.boltMetal);
    assert.equal(parts.boltHandle.material, materials.boltMetal);
    assert.equal(parts.magazine.userData.feedType, 'internal');
    assertNear(parts.muzzle.position.z, 1.11, 'Kar98k authoritative muzzle');
    assertNear(
      barrelBounds.max.z,
      parts.muzzle.position.z,
      'Kar98k barrel and muzzle contact'
    );
  } finally {
    model.traverse(object => object.geometry?.dispose());
    materials.wood.dispose();
    materials.metal.dispose();
    materials.boltMetal.dispose();
  }
});

test('M93, M16, and Kar98k weapon LODs reserve full detail for inspection range', () => {
  const cases = [
    ['LEBEL_M1886_M93', 'Lebel Mle 1886/93'],
    ['LEBEL_M1886_M93_APX1916', 'Lebel Mle 1886/93 with APX 1916'],
    ['BERTHIER_M1892_M16', 'Berthier Mousqueton Mle 1892 M16'],
    ['KAR98K', 'Kar98k']
  ];
  const cameraByTier = {
    high: new THREE.Vector3(0, 1.2, 2),
    medium: new THREE.Vector3(0, 1.2, 10),
    core: new THREE.Vector3(0, 1.2, 25)
  };

  for (const [weaponId, weapon] of cases) {
    const unit = new Unit({
      id: `weapon_lod_${weaponId.toLowerCase()}`,
      faction: weaponId === 'KAR98K' ? 'german' : 'french',
      type: 'infantry_squad',
      position: new THREE.Vector3(),
      roster: [{
        id: 'rifleman',
        name: 'Rifleman',
        role: 'Rifleman',
        weaponId,
        weapon,
        equipment: [],
        status: 'OK',
        health: 100
      }]
    });
    const soldier = unit.mesh.userData.soldiers[0];
    const { weaponModel, muzzle } = soldier.userData.parts;
    const representations = weaponModel.userData.weaponLodRepresentations;
    soldier.updateWorldMatrix(true, true);
    const authoredMuzzle = muzzle.getWorldPosition(new THREE.Vector3());

    assert.equal(unit.mesh.userData.requiresContinuousLODUpdate, true);
    for (const [expectedTier, camera] of Object.entries(cameraByTier)) {
      assert.equal(unit.updateLOD(camera, 'high'), 'high');
      assert.equal(unit.currentLOD, 'high');
      for (const [tier, meshes] of Object.entries(representations)) {
        assert.equal(
          meshes.every(mesh => mesh.visible === (tier === expectedTier)),
          true,
          `${weapon} ${expectedTier} range must show only its ${tier} representation`
        );
      }
      soldier.updateWorldMatrix(true, true);
      assert.ok(
        muzzle.getWorldPosition(new THREE.Vector3()).distanceTo(authoredMuzzle) < 1e-9,
        `${weapon} LOD switching must preserve the authoritative muzzle marker`
      );
    }
  }
});

test('MAS-36 consumes its registered vector landmarks in the rendered silhouette', () => {
  const materials = {
    wood: new THREE.MeshBasicMaterial({ side: THREE.FrontSide }),
    metal: new THREE.MeshBasicMaterial({ side: THREE.FrontSide })
  };
  const rig = createFrance1940InfantryWeaponRig('MAS-36 Rifle', materials);
  const model = rig.userData.weaponModel;
  model.removeFromParent();
  model.updateMatrixWorld(true);

  try {
    const handguard = model.userData.parts.handguard;
    const upperHandguard = model.userData.parts.upperHandguard;
    const barrel = model.userData.parts.barrel;
    const triggerGuard = model.userData.parts.triggerGuard;
    const trigger = model.userData.parts.trigger;
    const ejectionPort = model.userData.parts.ejectionPort;
    const receiverTopDetails = model.userData.parts.receiverTopDetails;
    const frontRing = model.getObjectByName('MAS-36_FrontRing');
    const midRing = model.getObjectByName('MAS-36_MidRing');
    const bayonetTube = model.getObjectByName('MAS-36_BayonetTube');
    const boltBody = model.userData.parts.boltBody;
    const boltHandle = model.userData.parts.boltHandle;
    const boltKnob = boltHandle.userData.knob;
    assert.ok(frontRing);
    assert.ok(midRing);
    assert.ok(bayonetTube);
    assert.ok(boltBody);
    assert.ok(boltKnob);
    assert.ok(upperHandguard);
    assert.ok(trigger);
    assert.equal(receiverTopDetails.length, 3);
    assert.equal(
      model.userData.visualContract.source.sha256,
      'eaa57971f0ec6e076f87ca128d6559ad2d668b2bf840be9900fa1992524d4698'
    );
    assert.deepEqual(
      MAS36_VISUAL_DATA.profiles.stock[0].sourcePixel,
      { x: 499, y: 995 }
    );

    const stockBounds = new THREE.Box3().setFromObject(model.userData.parts.stock);
    const handguardBounds = new THREE.Box3().setFromObject(handguard);
    const upperHandguardBounds = new THREE.Box3().setFromObject(upperHandguard);
    const frontRingBounds = new THREE.Box3().setFromObject(frontRing);
    const midRingBounds = new THREE.Box3().setFromObject(midRing);
    const bayonetBounds = new THREE.Box3().setFromObject(bayonetTube);
    const barrelBounds = new THREE.Box3().setFromObject(barrel);
    const receiverBounds = new THREE.Box3().setFromObject(model.userData.parts.receiver);
    const ejectionPortBounds = new THREE.Box3().setFromObject(ejectionPort);
    const frontSightBounds = new THREE.Box3().setFromObject(model.userData.parts.frontSight);
    const boltBodyBounds = new THREE.Box3().setFromObject(boltBody);
    const boltKnobBounds = new THREE.Box3().setFromObject(boltKnob);
    assertNear(stockBounds.min.z, 0, 'MAS-36 registered butt station');
    assertNear(stockBounds.min.y, -0.1669892008639309, 'MAS-36 registered lower butt sweep');
    assert.ok(
      stockBounds.max.x - stockBounds.min.x > receiverBounds.max.x - receiverBounds.min.x,
      'MAS-36 stock wrist must be wider than the receiver'
    );
    const triggerGuardBounds = new THREE.Box3().setFromObject(triggerGuard);
    const triggerGuardSource = MAS36_VISUAL_DATA.controls.triggerGuard.outer;
    assertNear(triggerGuardBounds.min.z, Math.min(...triggerGuardSource.map(point => point.z)), 'MAS-36 registered trigger-guard start');
    assertNear(triggerGuardBounds.max.z, Math.max(...triggerGuardSource.map(point => point.z)), 'MAS-36 registered trigger-guard end');
    assertNear(triggerGuardBounds.min.y, Math.min(...triggerGuardSource.map(point => point.y)), 'MAS-36 registered trigger-guard bottom');
    assertNear(triggerGuardBounds.max.y, Math.max(...triggerGuardSource.map(point => point.y)), 'MAS-36 registered trigger-guard top');
    assert.ok(
      ejectionPortBounds.max.y <= receiverBounds.max.y,
      'MAS-36 flush ejection-port detail must not enlarge the side silhouette'
    );
    for (const [index, detail] of receiverTopDetails.entries()) {
      const source = MAS36_VISUAL_DATA.controls.receiverTopDetails[index];
      const bounds = new THREE.Box3().setFromObject(detail);
      assertNear(bounds.min.z, source.startZ, `${detail.name} source start`);
      assertNear(bounds.max.z, source.endZ, `${detail.name} source end`);
      assertNear(bounds.min.y, source.bottomY, `${detail.name} source bottom`);
      assertNear(bounds.max.y, source.topY, `${detail.name} source top`);
    }
    const receiverBridgeBounds = new THREE.Box3().setFromObject(receiverTopDetails[0]);
    const rearSightBaseBounds = new THREE.Box3().setFromObject(receiverTopDetails[1]);
    const rearSightLeafBounds = new THREE.Box3().setFromObject(receiverTopDetails[2]);
    assert.ok(
      receiverBridgeBounds.min.y <= receiverBounds.max.y,
      'MAS-36 rear-sight bridge must overlap the receiver roof'
    );
    assertNear(rearSightBaseBounds.min.z, receiverBounds.min.z, 'MAS-36 square receiver stops at rear-sight station');
    assertNear(rearSightLeafBounds.min.y, rearSightBaseBounds.max.y, 'MAS-36 rear-sight leaf seats on its base');
    assertNear(boltBodyBounds.min.z, MAS36_VISUAL_DATA.controls.boltBody.startZ, 'MAS-36 exposed bolt rear station');
    assertNear(boltBodyBounds.max.z, receiverBounds.min.z, 'MAS-36 exposed bolt meets square receiver');
    assertNear(boltBodyBounds.max.x - boltBodyBounds.min.x, boltBodyBounds.max.y - boltBodyBounds.min.y, 'MAS-36 exposed bolt has a circular rear section');
    assert.deepEqual(boltHandle.userData.connectionEnd, boltKnob.position.toArray());
    assert.ok(
      boltKnobBounds.containsPoint(new THREE.Vector3(...boltHandle.userData.connectionEnd)),
      'MAS-36 bolt handle must terminate inside the knob'
    );
    const midBandSpec = MAS36_VISUAL_DATA.controls.midBand;
    assertNear(midRingBounds.min.y, midBandSpec.woodBottomY - midBandSpec.protrusion, 'MAS-36 sling band bottom reveal');
    assertNear(midRingBounds.max.y, midBandSpec.woodTopY + midBandSpec.protrusion, 'MAS-36 sling band top reveal');
    assertNear(midRingBounds.max.x - upperHandguardBounds.max.x, midBandSpec.protrusion, 'MAS-36 sling band right reveal');
    assertNear(upperHandguardBounds.min.x - midRingBounds.min.x, midBandSpec.protrusion, 'MAS-36 sling band left reveal');
    assertNear(frontSightBounds.min.z, MAS36_VISUAL_DATA.controls.frontSight.startZ, 'MAS-36 front-sight source start');
    assertNear(frontSightBounds.max.z, MAS36_VISUAL_DATA.controls.frontSight.endZ, 'MAS-36 front-sight source end');
    assertNear(frontSightBounds.min.y, MAS36_VISUAL_DATA.controls.frontSight.bottomY, 'MAS-36 front-sight source bottom');
    assertNear(frontSightBounds.max.y, MAS36_VISUAL_DATA.controls.frontSight.topY, 'MAS-36 front-sight source top');
    assertNear(barrelBounds.max.x - barrelBounds.min.x, 0.0124, 'MAS-36 registered barrel diameter');
    assertNear(handguardBounds.max.z, frontRingBounds.min.z, 'MAS-36 furniture/front-band seam');
    assertNear(upperHandguardBounds.max.z, frontRingBounds.min.z, 'MAS-36 upper-handguard/front-band seam');
    assertNear(bayonetBounds.min.z, frontRingBounds.min.z, 'MAS-36 bayonet tube front-band origin');
    assertNear(bayonetBounds.max.z, 0.99, 'MAS-36 bayonet tube forward end');

    const raycaster = new THREE.Raycaster();
    for (const z of [0.59, 0.68, 0.78, 0.85]) {
      raycaster.set(new THREE.Vector3(0, 1, z), new THREE.Vector3(0, -1, 0));
      const hit = raycaster.intersectObjects([upperHandguard, handguard], false)[0];
      assert.ok(hit, `MAS-36 handguard needs a closed top at Z=${z}`);
      assert.ok(hit.face.normal.y > 0.99, `MAS-36 handguard top must face outward at Z=${z}`);
    }

    for (const z of [0.60, 0.70, 0.80, 0.85]) {
      raycaster.set(new THREE.Vector3(-1, 0.011, z), new THREE.Vector3(1, 0, 0));
      const hit = raycaster.intersectObjects([upperHandguard, handguard, barrel], false)[0];
      assert.notEqual(hit?.object, barrel, `MAS-36 wood must occlude the barrel crown in side view at Z=${z}`);
    }
  } finally {
    model.traverse(object => object.geometry?.dispose());
    materials.wood.dispose();
    materials.metal.dispose();
  }
});
