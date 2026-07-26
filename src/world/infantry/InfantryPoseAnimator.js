import * as THREE from 'three';

const IDLE_SPEED_THRESHOLD = 0.12;
const DOWN = new THREE.Vector3(0, -1, 0);
const scratchTargetWorld = new THREE.Vector3();
const scratchTargetLocal = new THREE.Vector3();
const scratchShoulder = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchBend = new THREE.Vector3();
const scratchElbow = new THREE.Vector3();
const scratchForearm = new THREE.Vector3();
const scratchInverse = new THREE.Quaternion();

function updateArmLengths(arm, upperLength, lowerLength) {
  const rig = arm?.userData.armRig;
  if (!rig) return;
  rig.upperArm.scale.y = upperLength / 0.62;
  rig.upperArm.position.y = -upperLength * 0.5;
  rig.elbow.position.y = -upperLength;
  rig.forearm.scale.y = lowerLength / 0.62;
  rig.forearm.position.y = -lowerLength * 0.5;
  rig.hand.position.y = -lowerLength;
}

function solveTwoBoneArm(mesh, arm, grip, side) {
  const rig = arm?.userData.armRig;
  if (!rig || !grip) return false;

  mesh.updateWorldMatrix(true, true);
  grip.getWorldPosition(scratchTargetWorld);
  scratchTargetLocal.copy(scratchTargetWorld);
  mesh.worldToLocal(scratchTargetLocal);
  scratchShoulder.copy(arm.position);
  scratchDirection.subVectors(scratchTargetLocal, scratchShoulder);
  const targetDistance = scratchDirection.length();
  if (targetDistance < 1e-5) return false;
  scratchDirection.multiplyScalar(1 / targetDistance);

  const baseUpper = rig.upperLength;
  const baseLower = rig.lowerLength;
  const reachScale = THREE.MathUtils.clamp(
    targetDistance / (baseUpper + baseLower),
    1,
    1.08
  );
  const upperLength = baseUpper * reachScale;
  const lowerLength = baseLower * reachScale;
  if (targetDistance > upperLength + lowerLength + 1e-5) {
    arm.userData.gripBinding = {
      grip: grip.name,
      reachable: false,
      targetDistance,
      reachMeters: upperLength + lowerLength
    };
    return false;
  }
  updateArmLengths(arm, upperLength, lowerLength);

  const clampedDistance = THREE.MathUtils.clamp(
    targetDistance,
    Math.abs(upperLength - lowerLength) + 1e-5,
    upperLength + lowerLength - 1e-5
  );
  const along = (
    upperLength * upperLength
    - lowerLength * lowerLength
    + clampedDistance * clampedDistance
  ) / (2 * clampedDistance);
  const bendHeight = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));

  // Bend elbows down and slightly outward. Projection keeps bend stable when
  // weapon aim changes without introducing seeded/random pose jitter.
  scratchBend.set(side * 0.65, -1, -0.18);
  scratchBend.addScaledVector(scratchDirection, -scratchBend.dot(scratchDirection));
  if (scratchBend.lengthSq() < 1e-8) {
    scratchBend.set(side, 0, 0);
    scratchBend.addScaledVector(scratchDirection, -scratchBend.dot(scratchDirection));
  }
  scratchBend.normalize();
  scratchElbow
    .copy(scratchShoulder)
    .addScaledVector(scratchDirection, along)
    .addScaledVector(scratchBend, bendHeight);

  arm.quaternion.setFromUnitVectors(
    DOWN,
    scratchForearm.subVectors(scratchElbow, scratchShoulder).normalize()
  );
  scratchInverse.copy(arm.quaternion).invert();
  scratchForearm
    .subVectors(scratchTargetLocal, scratchElbow)
    .applyQuaternion(scratchInverse)
    .normalize();
  rig.elbow.quaternion.setFromUnitVectors(DOWN, scratchForearm);

  arm.userData.gripBinding = {
    grip: grip.name,
    reachable: true,
    targetDistance,
    reachMeters: upperLength + lowerLength,
    reachScale
  };
  return true;
}

export function advanceInfantryAnimation(record, deltaSeconds) {
  const dt = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  record.poseTime = (record.poseTime ?? 0) + dt;
}

export function applyInfantrySecondaryPose(mesh, soldier) {
  const parts = mesh.userData.parts;
  if (!parts) return;

  parts.torso.rotation.set(0, 0, 0);
  parts.torso.scale.set(1, 1, 1);
  parts.head.rotation.set(0, 0, 0);
  for (const item of parts.headgear ?? []) item.rotation.set(0, 0, 0);

  const velocity = soldier.velocity ?? [0, 0, 0];
  const speed = velocity.isVector3
    ? velocity.length()
    : Math.hypot(velocity[0], velocity[1], velocity[2]);
  const alive = soldier.status !== 'KIA' && (soldier.health ?? 100) > 0;
  const idle = alive && speed < IDLE_SPEED_THRESHOLD
    && !['RELOADING', 'CASUALTY', 'MOVING', 'ADVANCING'].includes(soldier.state);
  const time = soldier.poseTime ?? 0;
  const phase = (soldier.idlePhase ?? 0) + time;

  if (idle) {
    const breathing = Math.sin(phase * 1.7);
    const weightShift = Math.sin(phase * 0.53 + 0.8);
    const look = Math.sin(phase * 0.31 + 1.4);
    parts.torso.scale.y = 1 + breathing * 0.006;
    parts.torso.rotation.z = weightShift * 0.025;
    parts.head.rotation.y = look * 0.14;
    for (const item of parts.headgear ?? []) item.rotation.y = parts.head.rotation.y;
    parts.leftLeg.rotation.z += weightShift * 0.018;
    parts.rightLeg.rotation.z -= weightShift * 0.018;
    parts.weaponRig.position.y += breathing * 0.006;
    parts.weaponRig.rotation.z += weightShift * 0.008;
  }

  const pose = soldier.status === 'KIA'
    ? 'casualty'
    : soldier.state === 'RELOADING'
      ? 'reload'
      : (soldier.recoilTime ?? 0) > 0
          ? 'fire'
          : ['AIMING', 'OBSERVING'].includes(soldier.state)
              ? 'aim'
              : speed >= IDLE_SPEED_THRESHOLD
                  ? 'move'
                  : 'idle';

  parts.weaponRig.userData.activePose = pose;
  parts.weaponRig.userData.handBindings = {
    trigger: parts.rightHand?.name ?? 'RightHand',
    support: parts.leftHand?.name ?? 'LeftHand'
  };
  mesh.userData.activePose = pose;
}

export function bindInfantryHandsToWeapon(mesh, soldier) {
  const parts = mesh.userData.parts;
  if (!parts || soldier.status === 'KIA') return false;
  const reload = soldier.state === 'RELOADING';
  const internalMagazine = parts.weaponRig.userData.weaponModel
    ?.userData.visualContract?.magazine === 'internal';
  const rightGrip = reload && internalMagazine ? parts.reloadGrip : parts.triggerGrip;
  const leftGrip = reload && !internalMagazine ? parts.reloadGrip : parts.supportGrip;
  const rightBound = solveTwoBoneArm(mesh, parts.rightArm, rightGrip, -1);
  const leftBound = solveTwoBoneArm(mesh, parts.leftArm, leftGrip, 1);
  parts.weaponRig.userData.activeGripAssignments = {
    right: rightGrip?.name ?? null,
    left: leftGrip?.name ?? null
  };
  return rightBound && leftBound;
}
