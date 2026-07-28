import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createFrance1940InfantryWeaponRig
} from '../src/content/france1940/render/index.js';

const TOLERANCE = 1e-6;

const EXPECTED_PROFILE_PARTS = Object.freeze({
  'MAS-36 Rifle': Object.freeze({
    stock: Object.freeze({ width: 0.042, minZ: 0, maxZ: 0.43 }),
    receiver: Object.freeze({ width: 0.045, minZ: 0.43, maxZ: 0.58 }),
    handguard: Object.freeze({ width: 0.038, minZ: 0.58, maxZ: 0.865 })
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

test('MAS-36 furniture reaches its front band and keeps a closed top above the forward bayonet tube', () => {
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
    const barrel = model.userData.parts.barrel;
    const frontRing = model.getObjectByName('MAS-36_FrontRing');
    const bayonetTube = model.getObjectByName('MAS-36_BayonetTube');
    assert.ok(frontRing);
    assert.ok(bayonetTube);

    const handguardBounds = new THREE.Box3().setFromObject(handguard);
    const frontRingBounds = new THREE.Box3().setFromObject(frontRing);
    const bayonetBounds = new THREE.Box3().setFromObject(bayonetTube);
    assertNear(handguardBounds.max.z, frontRingBounds.min.z, 'MAS-36 furniture/front-band seam');
    assertNear(bayonetBounds.min.z, frontRingBounds.min.z, 'MAS-36 bayonet tube front-band origin');
    assertNear(bayonetBounds.max.z, 0.99, 'MAS-36 bayonet tube forward end');

    const raycaster = new THREE.Raycaster();
    for (const z of [0.59, 0.68, 0.78, 0.85]) {
      raycaster.set(new THREE.Vector3(0, 1, z), new THREE.Vector3(0, -1, 0));
      const hit = raycaster.intersectObject(handguard, false)[0];
      assert.ok(hit, `MAS-36 handguard needs a closed top at Z=${z}`);
      assert.ok(hit.face.normal.y > 0.99, `MAS-36 handguard top must face outward at Z=${z}`);
    }

    for (const z of [0.60, 0.70, 0.80, 0.85]) {
      raycaster.set(new THREE.Vector3(-1, 0.011, z), new THREE.Vector3(1, 0, 0));
      const hit = raycaster.intersectObjects([handguard, barrel], false)[0];
      assert.equal(
        hit?.object,
        handguard,
        `MAS-36 wood must occlude the barrel crown in side view at Z=${z}`
      );
    }
  } finally {
    model.traverse(object => object.geometry?.dispose());
    materials.wood.dispose();
    materials.metal.dispose();
  }
});
