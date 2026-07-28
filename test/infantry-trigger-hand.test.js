import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';

const WEAPONS = [
  ['MAS36', 'MAS-36 Rifle', 'french'],
  ['FM2429', 'FM 24/29 LMG', 'french'],
  ['MAS38', 'MAS-38 SMG', 'french'],
  ['KAR98K', 'Kar98k', 'german'],
  ['MG34', 'MG34 LMG', 'german'],
  ['MP40', 'MP40', 'german']
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

function createOneSoldierUnit(weaponId, weaponName, faction) {
  return new Unit({
    id: `hand-grip-${weaponId}`,
    faction,
    type: 'infantry_squad',
    position: new THREE.Vector3(),
    roster: [{
      id: `soldier-${weaponId}`,
      name: `Hand test ${weaponName}`,
      role: 'Rifleman',
      weaponId,
      weapon: weaponName,
      status: 'OK',
      health: 100
    }]
  });
}

function assertVectorExact(actual, expected, message) {
  assert.deepEqual(actual.toArray(), expected.toArray(), message);
}

test('all infantry use separately authored hands without mirrored transforms', () => {
  for (const [weaponId, weaponName, faction] of WEAPONS) {
    const unit = createOneSoldierUnit(weaponId, weaponName, faction);

    try {
      const mesh = unit.mesh.userData.soldiers[0];
      const parts = mesh.userData.parts;
      const leftRig = parts.leftArm.userData.armRig;
      const rightRig = parts.rightArm.userData.armRig;

      assert.equal(leftRig.upperLength, 0.42);
      assert.equal(leftRig.lowerLength, 0.42);
      assert.equal(rightRig.upperLength, 0.42);
      assert.equal(rightRig.lowerLength, 0.42);
      assert.notEqual(
        parts.leftHand.geometry,
        parts.rightHand.geometry,
        `${weaponName} must use separately authored left- and right-hand geometry`
      );
      assert.ok(
        parts.leftHand.scale.toArray().every(value => value > 0),
        `${weaponName} left hand cannot use a runtime mirror`
      );
      assert.ok(
        parts.rightHand.scale.toArray().every(value => value > 0),
        `${weaponName} right hand cannot use a runtime mirror`
      );

      parts.leftHand.geometry.computeBoundingBox();
      parts.rightHand.geometry.computeBoundingBox();
      assert.ok(
        parts.leftHand.geometry.boundingBox.max.x
          > Math.abs(parts.leftHand.geometry.boundingBox.min.x),
        `${weaponName} left thumb ridge must be authored on +X`
      );
      assert.ok(
        Math.abs(parts.rightHand.geometry.boundingBox.min.x)
          > parts.rightHand.geometry.boundingBox.max.x,
        `${weaponName} right thumb ridge must be authored on -X`
      );
    } finally {
      disposeObject(unit.mesh);
    }
  }
});

test('production poses keep both hands on lower, correctly oriented weapon grips', () => {
  for (const [weaponId, weaponName, faction] of WEAPONS) {
    const unit = createOneSoldierUnit(
      weaponId,
      weaponName,
      faction,
    );

    try {
      const soldier = unit.roster[0];
      const mesh = unit.mesh.userData.soldiers[0];
      const parts = mesh.userData.parts;
      const weaponParts = parts.weaponModel.userData.parts;
      const triggerGuard = weaponParts.triggerGuard;
      triggerGuard.geometry.computeBoundingBox();
      const expectedTriggerY = weaponParts.pistolGrip
        ? weaponParts.pistolGrip.position.y
        : triggerGuard.position.y + triggerGuard.geometry.boundingBox.min.y;
      assert.equal(parts.triggerGrip.position.x, -0.045);
      assert.equal(
        parts.triggerGrip.position.y,
        expectedTriggerY,
        `${weaponName} firing wrist must sit below its visible firing control`
      );

      for (const state of ['READY', 'AIMING', 'RELOADING']) {
        Object.assign(soldier, {
          health: 100,
          status: 'OK',
          stance: 'STANDING',
          state,
          poseTime: 0,
          idlePhase: 0,
          stridePhase: 0,
          recoilTime: 0,
          reloadTimer: 0,
          velocity: [0, 0, 0]
        });
        unit.soldierAI.applyPose(mesh, soldier);
        mesh.updateWorldMatrix(true, true);

        assert.equal(parts.rightArm.userData.gripBinding.reachable, true);
        assert.equal(parts.leftArm.userData.gripBinding.reachable, true);
        const assignments = parts.weaponRig.userData.activeGripAssignments;
        const rightGrip = assignments.right === 'ReloadHandGrip'
          ? parts.reloadGrip
          : parts.triggerGrip;
        const leftGrip = assignments.left === 'ReloadHandGrip'
          ? parts.reloadGrip
          : parts.supportGrip;
        assert.ok(
          parts.rightHand.getWorldPosition(new THREE.Vector3())
            .distanceTo(rightGrip.getWorldPosition(new THREE.Vector3())) < 1e-4,
          `${weaponName} ${state} right wrist must remain on ${assignments.right}`
        );
        assert.ok(
          parts.leftHand.getWorldPosition(new THREE.Vector3())
            .distanceTo(leftGrip.getWorldPosition(new THREE.Vector3())) < 1e-4,
          `${weaponName} ${state} left wrist must remain on ${assignments.left}`
        );

        if (assignments.right === 'TriggerHandGrip') {
          const palm = directionInFrame(
            parts.rightHand,
            new THREE.Vector3(0, 0, -1),
            parts.weaponRig
          );
          assert.ok(palm.x > 0.65, `${weaponName} ${state} right palm must face inward`);

          if (state !== 'RELOADING') {
            const fingers = directionInFrame(
              parts.rightHand,
              new THREE.Vector3(0, -1, 0),
              parts.weaponRig
            );
            assert.ok(fingers.x > 0.40, `${weaponName} ${state} firing fingers must curl inward`);
            assert.ok(fingers.z > 0.45, `${weaponName} ${state} trigger finger must point forward`);

            const grip = pointInFrame(parts.triggerGrip, new THREE.Vector3(), parts.weaponRig);
            const fingertips = pointInFrame(
              parts.rightHand,
              new THREE.Vector3(0, -0.08, 0),
              parts.weaponRig
            );
            assert.ok(
              fingertips.x > grip.x + 0.03,
              `${weaponName} ${state} firing fingertips must reach inward`
            );
            assert.ok(
              fingertips.z > grip.z + 0.03,
              `${weaponName} ${state} firing fingertips must reach along the receiver`
            );
          }
        }

        if (assignments.left === 'SupportHandGrip') {
          const palm = directionInFrame(
            parts.leftHand,
            new THREE.Vector3(0, 0, -1),
            parts.weaponRig
          );
          const fingers = directionInFrame(
            parts.leftHand,
            new THREE.Vector3(0, -1, 0),
            parts.weaponRig
          );
          assert.ok(palm.x < -0.30, `${weaponName} ${state} left palm must face inward`);
          assert.ok(
            palm.y > (state === 'RELOADING' ? 0.30 : 0.45),
            `${weaponName} ${state} left palm must cup the fore-end`
          );
          assert.ok(fingers.x < -0.40, `${weaponName} ${state} support fingers must curl inward`);
          assert.ok(fingers.z > 0.45, `${weaponName} ${state} support fingers must wrap forward`);
        }

        const firstWeaponPosition = parts.weaponRig.position.clone();
        const firstWeaponQuaternion = parts.weaponRig.quaternion.clone();
        const firstLeftWrist = parts.leftHand.getWorldPosition(new THREE.Vector3());
        const firstRightWrist = parts.rightHand.getWorldPosition(new THREE.Vector3());
        unit.soldierAI.applyPose(mesh, soldier);
        mesh.updateWorldMatrix(true, true);
        assertVectorExact(
          parts.weaponRig.position,
          firstWeaponPosition,
          `${weaponName} ${state} weapon position must be idempotent`
        );
        assertVectorExact(
          parts.weaponRig.quaternion,
          firstWeaponQuaternion,
          `${weaponName} ${state} weapon rotation must be idempotent`
        );
        assertVectorExact(
          parts.leftHand.getWorldPosition(new THREE.Vector3()),
          firstLeftWrist,
          `${weaponName} ${state} left wrist must be idempotent`
        );
        assertVectorExact(
          parts.rightHand.getWorldPosition(new THREE.Vector3()),
          firstRightWrist,
          `${weaponName} ${state} right wrist must be idempotent`
        );
      }
    } finally {
      disposeObject(unit.mesh);
    }
  }
});
