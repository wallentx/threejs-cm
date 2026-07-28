import * as THREE from 'three';

const IDLE_SPEED_THRESHOLD = 0.12;
export const INFANTRY_CASUALTY_FALL_DURATION_SECONDS = 0.75;
const CASUALTY_FALL_CLOCK_TICKS_PER_SECOND = 1_000_000_000;
const DOWN = new THREE.Vector3(0, -1, 0);
const scratchTargetWorld = new THREE.Vector3();
const scratchTargetLocal = new THREE.Vector3();
const scratchShoulder = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchBend = new THREE.Vector3();
const scratchElbow = new THREE.Vector3();
const scratchForearm = new THREE.Vector3();
const scratchInverse = new THREE.Quaternion();

function applyFirstOrderProneCrawlPose(parts, stridePhase) {
  // First-order procedural presentation approximation, driven only by the
  // resolved distance phase rather than an animation clock or pose history.
  const stride = Math.sin(stridePhase ?? 0);
  parts.leftLeg.rotation.x = 0.12 + stride * 0.24;
  parts.rightLeg.rotation.x = -0.12 - stride * 0.24;
  parts.torso.rotation.z = stride * 0.035;
}

function applyFirstOrderWoundedMovePose(parts, stridePhase) {
  // First-order gameplay presentation approximation: a generalized guarded
  // torso cue, driven solely by the resolved distance phase.
  const stride = Math.sin(stridePhase ?? 0);
  parts.torso.rotation.x = -0.055 - stride * 0.018;
  parts.torso.rotation.z = stride * 0.028;
}

function applyFirstOrderSneakPose(mesh, parts, stridePhase) {
  // First-order presentation approximation. Authoritative movement state,
  // stance, and distance phase come from the individual soldier simulation.
  const stride = Math.sin(stridePhase ?? 0);
  mesh.position.y -= 0.08;
  parts.leftLeg.rotation.x = -0.34 + stride * 0.18;
  parts.rightLeg.rotation.x = -0.34 - stride * 0.18;
  parts.torso.rotation.x = -0.08;
  parts.torso.rotation.z = stride * 0.02;
}

function resetArmRigFromGripIk(arm) {
  const rig = arm?.userData.armRig;
  if (!rig) return;
  updateArmLengths(arm, rig.upperLength, rig.lowerLength);
  rig.elbow.quaternion.identity();
  arm.userData.gripBinding = null;
}

const KIA_END_POSES = [
  {
    root: [Math.PI / 2, -0.08, 0.34],
    leftLeg: [0.18, 0, 0.08],
    rightLeg: [-0.28, 0, -0.12],
    leftArm: [0.42, 0, 0.62],
    rightArm: [0.15, 0, -0.38],
    weaponPosition: [0.34, 0.08, 0.18],
    weaponRotation: [-Math.PI / 2, 0, 1.25]
  },
  {
    root: [0, Math.PI / 2, 0.45],
    leftLeg: [-0.45, 0, 0.25],
    rightLeg: [-0.85, 0, -0.15],
    leftArm: [0.7, 0, 0.2],
    rightArm: [0.15, 0, -0.2],
    weaponPosition: [-0.35, 0.1, 0.2],
    weaponRotation: [0, 0, Math.PI / 2]
  },
  {
    root: [0, -Math.PI / 2, 0.45],
    leftLeg: [-0.8, 0, 0.18],
    rightLeg: [-0.38, 0, -0.28],
    leftArm: [0.18, 0, 0.2],
    rightArm: [0.72, 0, -0.18],
    weaponPosition: [0.35, 0.1, 0.2],
    weaponRotation: [0, 0, -Math.PI / 2]
  },
  {
    root: [Math.PI / 2, 0.12, 0.36],
    leftLeg: [0.12, 0, 0.22],
    rightLeg: [-0.12, 0, -0.18],
    leftArm: [0.82, 0, 0.48],
    rightArm: [0.58, 0, -0.52],
    weaponPosition: [0.28, 0.08, 0.16],
    weaponRotation: [-Math.PI / 2, 0, -1.05]
  }
];

function isCasualtyFallStartStance(stance) {
  return stance === 'STANDING'
    || stance === 'KNEELING'
    || stance === 'CROUCHED'
    || stance === 'PRONE';
}

function getKiaEndPose(stableRoll) {
  const variant = stableRoll < -0.2
    ? 0
    : stableRoll < 0
      ? 1
      : stableRoll < 0.2
        ? 2
        : 3;
  return KIA_END_POSES[variant];
}

function setKiaPose(mesh, parts, pose) {
  mesh.rotation.x = pose.root[0];
  mesh.rotation.z = pose.root[1];
  mesh.position.y = pose.root[2];
  parts.leftLeg.rotation.set(...pose.leftLeg);
  parts.rightLeg.rotation.set(...pose.rightLeg);
  parts.leftArm.rotation.set(...pose.leftArm);
  parts.rightArm.rotation.set(...pose.rightArm);
  parts.weapon.position.set(...pose.weaponPosition);
  parts.weapon.rotation.set(...pose.weaponRotation);
}

function applyFirstOrderKiaFallStartPose(mesh, parts, stance) {
  const weaponRest = parts.weapon.userData.restPosition;
  const weaponRestX = weaponRest?.[0] ?? -0.18;
  mesh.rotation.z = 0;

  if (stance === 'PRONE') {
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0.2;
    parts.leftLeg.rotation.set(0.12, 0, 0);
    parts.rightLeg.rotation.set(-0.12, 0, 0);
    parts.leftArm.rotation.set(0, 0, 0);
    parts.rightArm.rotation.set(0, 0, 0);
    parts.weapon.position.set(0.34, 0.08, 0.18);
    parts.weapon.rotation.set(-Math.PI / 2, 0, 1.25);
    return;
  }

  mesh.rotation.x = 0;
  parts.weapon.position.set(
    weaponRestX,
    weaponRest?.[1] ?? 1.46,
    weaponRest?.[2] ?? 0.06
  );
  parts.weapon.rotation.set(-0.16, 0, 0.08);

  if (stance === 'KNEELING') {
    mesh.position.y = -0.34;
    parts.leftLeg.rotation.set(-1.3, 0, 0);
    parts.rightLeg.rotation.set(-1.3, 0, 0);
    parts.leftArm.rotation.set(-0.96, 0, 0.18);
    parts.rightArm.rotation.set(-0.84, 0, -0.2);
    return;
  }

  if (stance === 'CROUCHED') {
    mesh.position.y = -0.08;
    parts.leftLeg.rotation.set(-0.72, 0, 0);
    parts.rightLeg.rotation.set(-0.46, 0, 0);
    parts.leftArm.rotation.set(-0.9, 0, 0.18);
    parts.rightArm.rotation.set(-0.8, 0, -0.2);
    return;
  }

  mesh.position.y = 0;
  parts.leftLeg.rotation.set(0, 0, 0);
  parts.rightLeg.rotation.set(0, 0, 0);
  parts.leftArm.rotation.set(-0.82, 0, 0.18);
  parts.rightArm.rotation.set(-0.72, 0, -0.2);
}

function lerpEuler(rotation, target, alpha) {
  rotation.x = THREE.MathUtils.lerp(rotation.x, target[0], alpha);
  rotation.y = THREE.MathUtils.lerp(rotation.y, target[1], alpha);
  rotation.z = THREE.MathUtils.lerp(rotation.z, target[2], alpha);
}

function lerpPosition(position, target, alpha) {
  position.x = THREE.MathUtils.lerp(position.x, target[0], alpha);
  position.y = THREE.MathUtils.lerp(position.y, target[1], alpha);
  position.z = THREE.MathUtils.lerp(position.z, target[2], alpha);
}

function applyFirstOrderKiaFallPose(mesh, parts, soldier) {
  // First-order gameplay presentation approximation. The captured stance and
  // simulation-owned pose time drive a bounded authored fall into the existing
  // stable-identity end pose; this is not biomechanics or a physics result.
  resetArmRigFromGripIk(parts.leftArm);
  resetArmRigFromGripIk(parts.rightArm);
  parts.weaponRig.userData.activeGripAssignments = null;
  const endPose = getKiaEndPose(mesh.rotation.z);
  const startStance = soldier.casualtyFallStartStance;
  if (!isCasualtyFallStartStance(startStance)) {
    setKiaPose(mesh, parts, endPose);
    return;
  }

  const poseTime = Number.isFinite(soldier.poseTime) ? soldier.poseTime : 0;
  const progress = THREE.MathUtils.clamp(
    poseTime / INFANTRY_CASUALTY_FALL_DURATION_SECONDS,
    0,
    1
  );
  if (progress === 1) {
    setKiaPose(mesh, parts, endPose);
    return;
  }

  applyFirstOrderKiaFallStartPose(mesh, parts, startStance);
  const alpha = THREE.MathUtils.smoothstep(progress, 0, 1);
  let proneSideRollProgress = null;
  if (startStance === 'PRONE' && endPose.root[0] === 0) {
    // Turn the already-horizontal body before rolling onto its side. Blending
    // both Euler axes together would briefly stand a prone casualty upright.
    const turnProgress = Math.min(1, alpha * 2);
    const rollProgress = Math.max(0, alpha * 2 - 1);
    proneSideRollProgress = rollProgress;
    mesh.rotation.z = THREE.MathUtils.lerp(0, endPose.root[1], turnProgress);
    mesh.rotation.x = THREE.MathUtils.lerp(Math.PI / 2, 0, rollProgress);
  } else {
    mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, endPose.root[0], alpha);
    mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, endPose.root[1], alpha);
  }
  mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, endPose.root[2], alpha);
  const stanceDescent = startStance === 'KNEELING'
    ? 0.1
    : startStance === 'CROUCHED'
      ? 0.035
      : startStance === 'STANDING'
        ? 0.04
        : 0;
  mesh.position.y -= Math.sin(Math.PI * progress) * stanceDescent;
  if (proneSideRollProgress != null) {
    mesh.position.y += Math.sin(Math.PI * proneSideRollProgress) * 0.015;
  }
  const limbAlpha = proneSideRollProgress ?? alpha;
  const armAlpha = proneSideRollProgress == null
    ? alpha
    : Math.max(0, proneSideRollProgress * 2 - 1);
  lerpEuler(parts.leftLeg.rotation, endPose.leftLeg, limbAlpha);
  lerpEuler(parts.rightLeg.rotation, endPose.rightLeg, limbAlpha);
  if (startStance === 'KNEELING') {
    // Fold the simple one-segment legs beneath the falling body instead of
    // sweeping them through terrain on the shorter Euler path.
    parts.leftLeg.rotation.x = THREE.MathUtils.lerp(
      -1.3,
      endPose.leftLeg[0] - Math.PI * 2,
      alpha
    );
    parts.rightLeg.rotation.x = THREE.MathUtils.lerp(
      -1.3,
      endPose.rightLeg[0] - Math.PI * 2,
      alpha
    );
  }
  lerpEuler(parts.leftArm.rotation, endPose.leftArm, armAlpha);
  lerpEuler(parts.rightArm.rotation, endPose.rightArm, armAlpha);
  const weaponAlpha = startStance === 'PRONE' && endPose.root[0] === 0
    ? proneSideRollProgress
    : alpha;
  lerpPosition(parts.weapon.position, endPose.weaponPosition, weaponAlpha);
  lerpEuler(parts.weapon.rotation, endPose.weaponRotation, weaponAlpha);
  if (proneSideRollProgress != null) {
    if (endPose.root[1] > 0) {
      parts.weapon.position.x = proneSideRollProgress <= 0.75
        ? 0.34
        : THREE.MathUtils.lerp(
            0.34,
            endPose.weaponPosition[0],
            (proneSideRollProgress - 0.75) * 4
          );
    } else {
      parts.weapon.position.x = proneSideRollProgress <= 0.25
        ? THREE.MathUtils.lerp(0.34, 0, proneSideRollProgress * 4)
        : proneSideRollProgress <= 0.75
          ? 0
          : THREE.MathUtils.lerp(
              0,
              endPose.weaponPosition[0],
              (proneSideRollProgress - 0.75) * 4
            );
    }
  }
}

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
  const nextPoseTime = (record.poseTime ?? 0) + dt;
  record.poseTime = record.status === 'KIA'
    && isCasualtyFallStartStance(record.casualtyFallStartStance)
    ? Math.min(
        INFANTRY_CASUALTY_FALL_DURATION_SECONDS,
        Math.round(nextPoseTime * CASUALTY_FALL_CLOCK_TICKS_PER_SECOND)
          / CASUALTY_FALL_CLOCK_TICKS_PER_SECOND
      )
    : nextPoseTime;
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
  const unavailable = soldier.status === 'KIA'
    || soldier.status === 'INCAPACITATED'
    || soldier.status === 'DEAD';
  const alive = !unavailable && (soldier.health ?? 100) > 0;
  const idle = alive && speed < IDLE_SPEED_THRESHOLD
    && ![
      'RELOADING',
      'CASUALTY',
      'MOVING',
      'SNEAKING',
      'ADVANCING'
    ].includes(soldier.state);
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

  const actionPose = soldier.state === 'RELOADING'
    || (soldier.recoilTime ?? 0) > 0
    || soldier.state === 'AIMING'
    || soldier.state === 'OBSERVING';
  const crawling = alive
    && soldier.stance === 'PRONE'
    && speed >= IDLE_SPEED_THRESHOLD
    && !actionPose;
  const woundedMoving = alive
    && soldier.status === 'WOUNDED'
    && speed >= IDLE_SPEED_THRESHOLD
    && !actionPose
    && (soldier.stance === 'STANDING'
      || soldier.stance === 'KNEELING'
      || soldier.stance === 'CROUCHED');
  const sneaking = alive
    && soldier.state === 'SNEAKING'
    && soldier.stance === 'CROUCHED'
    && speed >= IDLE_SPEED_THRESHOLD
    && !actionPose;
  if (crawling) applyFirstOrderProneCrawlPose(parts, soldier.stridePhase);
  if (sneaking) {
    applyFirstOrderSneakPose(mesh, parts, soldier.stridePhase);
  }
  if (woundedMoving) applyFirstOrderWoundedMovePose(parts, soldier.stridePhase);
  if (soldier.status === 'KIA') applyFirstOrderKiaFallPose(mesh, parts, soldier);

  const pose = soldier.status === 'KIA'
    ? 'casualty'
    : soldier.state === 'RELOADING'
      ? 'reload'
      : (soldier.recoilTime ?? 0) > 0
          ? 'fire'
          : ['AIMING', 'OBSERVING'].includes(soldier.state)
              ? 'aim'
              : speed >= IDLE_SPEED_THRESHOLD
                  ? crawling
                    ? 'crawl'
                    : sneaking
                      ? 'sneak'
                      : woundedMoving
                        ? 'wounded-move'
                        : 'move'
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
