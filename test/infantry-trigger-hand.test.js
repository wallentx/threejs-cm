import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  France1940UnitMeshFactory
} from '../src/content/france1940/render/France1940UnitMeshFactory.js';
import {
  applyInfantrySecondaryPose,
  bindInfantryHandsToWeapon
} from '../src/world/infantry/InfantryPoseAnimator.js';

const WEAPONS = [
  ['MAS-36 Rifle', 'french'],
  ['FM 24/29 LMG', 'french'],
  ['MAS-38 SMG', 'french'],
  ['Kar98k', 'german'],
  ['MG34 LMG', 'german'],
  ['MP40', 'german']
];

function directionInFrame(object, localDirection, frame) {
  const origin = object.getWorldPosition(new THREE.Vector3());
  const endpoint = object.localToWorld(localDirection.clone());
  const inverseFrame = frame.getWorldQuaternion(new THREE.Quaternion()).invert();
  return endpoint.sub(origin).normalize().applyQuaternion(inverseFrame);
}

function pointInFrame(object, localPoint, frame) {
  const point = object.localToWorld(localPoint.clone());
  return frame.worldToLocal(point);
}

function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material)) {
      for (const material of object.material) materials.add(material);
    } else if (object.material) {
      materials.add(object.material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

test('all firing hands sit right of the trigger and turn their palms inward', () => {
  for (const [weaponName, faction] of WEAPONS) {
    const squad = France1940UnitMeshFactory.createInfantrySquadMesh(
      faction,
      [{ weapon: weaponName }]
    );

    try {
      const mesh = squad.children.find(child => child.name.startsWith('Soldier_'));
      const parts = mesh.userData.parts;
      const soldier = {
        id: `trigger-hand-${weaponName}`,
        weaponName,
        health: 100,
        status: 'READY',
        stance: 'STANDING',
        state: 'OBSERVING',
        poseTime: 0,
        idlePhase: 0,
        velocity: [0, 0, 0]
      };

      applyInfantrySecondaryPose(mesh, soldier);
      assert.equal(bindInfantryHandsToWeapon(mesh, soldier), true);
      mesh.updateWorldMatrix(true, true);

      assert.equal(parts.triggerGrip.position.x, -0.045);
      assert.ok(
        parts.rightHand.getWorldPosition(new THREE.Vector3())
          .distanceTo(parts.triggerGrip.getWorldPosition(new THREE.Vector3())) < 1e-4,
        `${weaponName} right wrist must remain bound to its trigger grip`
      );

      const palm = directionInFrame(
        parts.rightHand,
        new THREE.Vector3(0, 0, -1),
        parts.weaponRig
      );
      const fingers = directionInFrame(
        parts.rightHand,
        new THREE.Vector3(0, -1, 0),
        parts.weaponRig
      );
      assert.ok(palm.x > 0.70, `${weaponName} right palm must face inward toward +X`);
      assert.ok(fingers.x > 0.45, `${weaponName} fingers must curl inward from the right`);
      assert.ok(fingers.z > 0.50, `${weaponName} trigger finger must point forward`);

      const grip = pointInFrame(parts.triggerGrip, new THREE.Vector3(), parts.weaponRig);
      const fingertips = pointInFrame(
        parts.rightHand,
        new THREE.Vector3(0, -0.08, 0),
        parts.weaponRig
      );
      assert.ok(
        fingertips.x > grip.x + 0.03,
        `${weaponName} fingertips must reach inward from the wrist`
      );
      assert.ok(
        fingertips.z > grip.z + 0.035,
        `${weaponName} fingertips must reach along the trigger/receiver`
      );
    } finally {
      disposeObject(squad);
    }
  }
});
