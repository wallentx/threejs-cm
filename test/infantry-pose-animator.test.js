import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { WegoManager } from '../src/game/WegoManager.js';
import {
  INFANTRY_CASUALTY_FALL_DURATION_SECONDS,
  applyInfantrySecondaryPose
} from '../src/world/infantry/InfantryPoseAnimator.js';
import { createFrance1940InfantryWeaponRig } from '../src/content/france1940/render/France1940InfantryWeaponFactory.js';
import {
  FRANCE_1940_CATALOG_PORTS
} from '../src/content/france1940/catalogPorts.js';
import {
  FRANCE_1940_FORMATIONS
} from '../src/content/france1940/formations.js';

const flatTerrain = {
  getHeightAt() {
    return 0;
  }
};

function createProneMover() {
  const unit = new Unit({
    id: 'first_order_prone_crawl',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[0];
  const mesh = unit.mesh.userData.soldiers[0];
  return { unit, agent, mesh };
}

function setPose(agent, {
  stance = 'PRONE',
  state = 'MOVING',
  status = 'OK',
  health = 100,
  speed = 1,
  stridePhase = Math.PI / 2,
  recoilTime = 0
} = {}) {
  Object.assign(agent, { stance, state, status, health, stridePhase, recoilTime });
  agent.velocity.set(0, 0, speed);
  agent.syncRecord();
}

function applyPose(unit, agent, mesh) {
  unit.soldierAI.applyPose(mesh, agent.record);
  mesh.updateWorldMatrix(true, true);
}

function advanceUnit(unit, seconds) {
  unit.update(seconds, flatTerrain);
}

function crawlProjection(mesh) {
  const parts = mesh.userData.parts;
  return {
    activePose: mesh.userData.activePose,
    leftLegX: parts.leftLeg.rotation.x,
    rightLegX: parts.rightLeg.rotation.x,
    torsoZ: parts.torso.rotation.z,
    headY: parts.head.rotation.y
  };
}

function woundedMoveProjection(mesh) {
  const parts = mesh.userData.parts;
  return {
    activePose: mesh.userData.activePose,
    rootLean: mesh.rotation.z,
    torsoX: parts.torso.rotation.x,
    torsoZ: parts.torso.rotation.z
  };
}

function transformProjection(object) {
  return {
    position: object.position.toArray(),
    quaternion: object.quaternion.toArray(),
    scale: object.scale.toArray()
  };
}

function armRigProjection(arm) {
  const rig = arm.userData.armRig;
  const worldHandPosition = rig.hand.getWorldPosition(new THREE.Vector3()).toArray();
  return {
    gripBinding: arm.userData.gripBinding == null
      ? null
      : { ...arm.userData.gripBinding },
    upperLength: rig.upperLength,
    lowerLength: rig.lowerLength,
    shoulder: transformProjection(arm),
    upperArm: transformProjection(rig.upperArm),
    elbow: transformProjection(rig.elbow),
    forearm: transformProjection(rig.forearm),
    hand: transformProjection(rig.hand),
    worldHandPosition
  };
}

function casualtyProjection(mesh) {
  const parts = mesh.userData.parts;
  mesh.updateWorldMatrix(true, true);
  return {
    activePose: mesh.userData.activePose,
    rootPositionY: mesh.position.y,
    rootRotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
    leftLegRotation: [parts.leftLeg.rotation.x, parts.leftLeg.rotation.y, parts.leftLeg.rotation.z],
    rightLegRotation: [parts.rightLeg.rotation.x, parts.rightLeg.rotation.y, parts.rightLeg.rotation.z],
    leftArmRotation: [parts.leftArm.rotation.x, parts.leftArm.rotation.y, parts.leftArm.rotation.z],
    rightArmRotation: [parts.rightArm.rotation.x, parts.rightArm.rotation.y, parts.rightArm.rotation.z],
    weaponPosition: parts.weapon.position.toArray(),
    weaponRotation: [
      parts.weapon.rotation.x,
      parts.weapon.rotation.y,
      parts.weapon.rotation.z
    ],
    activeGripAssignments: parts.weaponRig.userData.activeGripAssignments == null
      ? null
      : { ...parts.weaponRig.userData.activeGripAssignments },
    leftArmRig: armRigProjection(parts.leftArm),
    rightArmRig: armRigProjection(parts.rightArm)
  };
}

function casualtySignatureWithoutRootRoll(projection) {
  return JSON.stringify({
    rootPositionY: projection.rootPositionY,
    rootRotationX: projection.rootRotation[0],
    leftLegRotation: projection.leftLegRotation,
    rightLegRotation: projection.rightLegRotation,
    leftArmRotation: projection.leftArmRotation,
    rightArmRotation: projection.rightArmRotation,
    weaponPosition: projection.weaponPosition,
    weaponRotation: projection.weaponRotation
  });
}

function assertArmRigAtDeterministicBase(armRig, label) {
  assert.equal(
    armRig.upperArm.scale[1],
    armRig.upperLength / 0.62,
    `${label} upper-arm length scale`
  );
  assert.deepEqual(
    armRig.upperArm.position,
    [0, -armRig.upperLength * 0.5, 0],
    `${label} upper-arm position`
  );
  assert.deepEqual(
    armRig.elbow.position,
    [0, -armRig.upperLength, 0],
    `${label} elbow position`
  );
  assert.deepEqual(
    armRig.elbow.quaternion,
    [0, 0, 0, 1],
    `${label} elbow rotation`
  );
  assert.equal(
    armRig.forearm.scale[1],
    armRig.lowerLength / 0.62,
    `${label} forearm length scale`
  );
  assert.deepEqual(
    armRig.forearm.position,
    [0, -armRig.lowerLength * 0.5, 0],
    `${label} forearm position`
  );
  assert.deepEqual(
    armRig.hand.position,
    [0, -armRig.lowerLength, 0],
    `${label} hand position`
  );
  assert.equal(armRig.worldHandPosition.length, 3, `${label} world hand position`);
  assert.ok(
    armRig.worldHandPosition.every(Number.isFinite),
    `${label} world hand position must remain finite`
  );
}

function assertKiaGripMetadataCleared(projection, label) {
  assert.equal(projection.leftArmRig.gripBinding, null, `${label} left grip binding`);
  assert.equal(projection.rightArmRig.gripBinding, null, `${label} right grip binding`);
  assert.equal(projection.activeGripAssignments, null, `${label} grip assignments`);
}

function visibleWorldBounds(root) {
  const bounds = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse(object => {
    if (!object.isMesh || !object.visible) return;
    let ancestor = object.parent;
    while (ancestor && ancestor !== root) {
      if (!ancestor.visible) return;
      ancestor = ancestor.parent;
    }
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  return bounds;
}

test('first-order procedural prone crawl alternates from stride phase through the public SoldierAI pose path', () => {
  const { unit, agent, mesh } = createProneMover();

  setPose(agent, { stridePhase: Math.PI / 2 });
  applyPose(unit, agent, mesh);
  const forward = crawlProjection(mesh);
  assert.equal(forward.activePose, 'crawl');
  assert.equal(forward.headY, 0);
  assert.ok(mesh.userData.parts.headgear.every(item => item.rotation.y === 0));

  applyPose(unit, agent, mesh);
  assert.deepEqual(crawlProjection(mesh), forward);

  setPose(agent, { stridePhase: Math.PI * 1.5 });
  applyPose(unit, agent, mesh);
  const opposite = crawlProjection(mesh);
  assert.equal(opposite.activePose, 'crawl');
  assert.ok(forward.leftLegX > 0 && opposite.leftLegX < 0);
  assert.ok(forward.rightLegX < 0 && opposite.rightLegX > 0);
  assert.ok(forward.torsoZ > 0 && opposite.torsoZ < 0);

  setPose(agent, { stance: 'STANDING' });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'move');
});

test('first-order prone crawl resets cleanly and preserves action and casualty precedence', () => {
  const { unit, agent, mesh } = createProneMover();

  setPose(agent);
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'crawl');

  setPose(agent, { state: 'READY', speed: 0 });
  applyPose(unit, agent, mesh);
  const stationaryProne = crawlProjection(mesh);
  assert.equal(stationaryProne.activePose, 'idle');
  assert.equal(stationaryProne.leftLegX, 0.12);
  assert.equal(stationaryProne.rightLegX, -0.12);
  assert.notEqual(stationaryProne.torsoZ, 0.035);

  setPose(agent, { stridePhase: Math.PI * 1.5 });
  applyPose(unit, agent, mesh);
  const reenteredCrawl = crawlProjection(mesh);
  assert.equal(reenteredCrawl.activePose, 'crawl');
  assert.equal(reenteredCrawl.leftLegX, -0.12);
  assert.equal(reenteredCrawl.rightLegX, 0.12);
  assert.equal(reenteredCrawl.torsoZ, -0.035);
  assert.equal(reenteredCrawl.headY, 0);

  for (const [state, recoilTime, expected] of [
    ['RELOADING', 0, 'reload'],
    ['AIMING', 0, 'aim'],
    ['OBSERVING', 0, 'aim'],
    ['MOVING', 0.08, 'fire']
  ]) {
    setPose(agent, { state, recoilTime });
    applyPose(unit, agent, mesh);
    assert.equal(mesh.userData.activePose, expected);
    assert.equal(mesh.userData.parts.leftLeg.rotation.x, 0.12);
    assert.equal(mesh.userData.parts.rightLeg.rotation.x, -0.12);
  }

  setPose(agent, { status: 'KIA', health: 0 });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'casualty');
  assert.equal(mesh.userData.parts.leftLeg.rotation.x, 0.12);
  assert.equal(mesh.userData.parts.rightLeg.rotation.x, -0.12);

  setPose(agent, { stance: 'STANDING', state: 'READY', speed: 0 });
  applyPose(unit, agent, mesh);
  const ordinaryLiving = crawlProjection(mesh);
  assert.equal(ordinaryLiving.activePose, 'idle');
  assert.ok(ordinaryLiving.leftLegX === 0);
  assert.ok(ordinaryLiving.rightLegX === 0);
  assert.equal(ordinaryLiving.torsoZ, stationaryProne.torsoZ);
  assert.equal(ordinaryLiving.headY, stationaryProne.headY);
});

test('positive-health unavailable prone movers retain ordinary locomotion instead of crawl', () => {
  const { unit, agent, mesh } = createProneMover();

  for (const status of ['INCAPACITATED', 'DEAD']) {
    setPose(agent, { status, health: 100, stridePhase: Math.PI / 2 });
    applyPose(unit, agent, mesh);
    assert.equal(mesh.userData.activePose, 'move');
    assert.equal(mesh.userData.parts.leftLeg.rotation.x, 0.12);
    assert.equal(mesh.userData.parts.rightLeg.rotation.x, -0.12);
  }
});

test('first-order prone crawl retains reachable semantic trigger and support grips at both phases', () => {
  const { unit, agent, mesh } = createProneMover();
  const parts = mesh.userData.parts;

  for (const stridePhase of [Math.PI / 2, Math.PI * 1.5]) {
    setPose(agent, { stridePhase });
    applyPose(unit, agent, mesh);
    assert.equal(mesh.userData.activePose, 'crawl');
    assert.equal(parts.weaponRig.userData.activeGripAssignments.right, 'TriggerHandGrip');
    assert.equal(parts.weaponRig.userData.activeGripAssignments.left, 'SupportHandGrip');
    assert.ok(parts.rightArm.userData.gripBinding.reachable);
    assert.ok(parts.leftArm.userData.gripBinding.reachable);
    assert.ok(parts.rightHand.getWorldPosition(new THREE.Vector3())
      .distanceTo(parts.triggerGrip.getWorldPosition(new THREE.Vector3())) < 1e-4);
    assert.ok(parts.leftHand.getWorldPosition(new THREE.Vector3())
      .distanceTo(parts.supportGrip.getWorldPosition(new THREE.Vector3())) < 1e-4);
  }
});

test('real Unit capture and restore re-project the same first-order prone crawl without pose state', () => {
  const { unit, agent, mesh } = createProneMover();
  setPose(agent, { stridePhase: Math.PI / 2 });
  unit.stance = 'PRONE';
  applyPose(unit, agent, mesh);
  const beforeCapture = crawlProjection(mesh);
  assert.equal(beforeCapture.activePose, 'crawl');
  assert.equal(beforeCapture.leftLegX, 0.36);
  assert.equal(beforeCapture.rightLegX, -0.36);
  assert.equal(beforeCapture.torsoZ, 0.035);
  assert.equal(beforeCapture.headY, 0);
  assert.ok(mesh.userData.parts.headgear.every(item => item.rotation.y === 0));
  const snapshot = unit.captureState();

  setPose(agent, { stance: 'STANDING', speed: 0, stridePhase: 0 });
  applyPose(unit, agent, mesh);
  unit.restoreState(snapshot, new Map([[unit.id, unit]]));

  const restored = crawlProjection(mesh);
  assert.equal(restored.activePose, 'crawl');
  assert.equal(restored.leftLegX, 0.36);
  assert.equal(restored.rightLegX, -0.36);
  assert.equal(restored.torsoZ, 0.035);
  assert.equal(restored.headY, 0);
  assert.ok(mesh.userData.parts.headgear.every(item => item.rotation.y === 0));
  assert.deepEqual(restored, beforeCapture);
  assert.equal(Object.hasOwn(snapshot.roster[0], 'crawlPose'), false);
});

test('first-order wounded gait projects a phase-derived guarded torso cue for each non-prone moving stance', () => {
  const { unit, agent, mesh } = createProneMover();

  for (const stance of ['STANDING', 'KNEELING', 'CROUCHED']) {
    setPose(agent, { stance, status: 'WOUNDED', health: 45, stridePhase: Math.PI / 2 });
    applyPose(unit, agent, mesh);
    const forward = woundedMoveProjection(mesh);
    assert.equal(forward.activePose, 'wounded-move');
    assert.ok(forward.torsoX < 0);
    assert.ok(forward.torsoZ > 0);

    applyPose(unit, agent, mesh);
    assert.deepEqual(woundedMoveProjection(mesh), forward);

    setPose(agent, { stance, status: 'WOUNDED', health: 45, stridePhase: Math.PI * 1.5 });
    applyPose(unit, agent, mesh);
    const opposite = woundedMoveProjection(mesh);
    assert.equal(opposite.activePose, 'wounded-move');
    assert.notEqual(opposite.torsoX, forward.torsoX);
    assert.ok(opposite.torsoZ < 0);
  }

  setPose(agent, { stance: 'STANDING', status: 'OK', health: 100, stridePhase: Math.PI / 2 });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'move');
  assert.equal(mesh.userData.parts.torso.rotation.x, 0);
  assert.equal(mesh.userData.parts.torso.rotation.z, 0);
});

test('first-order wounded gait requires strictly positive health', () => {
  const { unit, agent, mesh } = createProneMover();

  for (const health of [0, -1]) {
    setPose(agent, { stance: 'STANDING', status: 'WOUNDED', health, stridePhase: Math.PI / 2 });
    applyPose(unit, agent, mesh);
    assert.notEqual(mesh.userData.activePose, 'wounded-move');
    assert.equal(mesh.userData.parts.torso.rotation.x, 0);
    assert.equal(mesh.userData.parts.torso.rotation.z, 0);
  }

  setPose(agent, {
    stance: 'STANDING',
    status: 'WOUNDED',
    health: Number.MIN_VALUE,
    stridePhase: Math.PI / 2
  });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'wounded-move');
  assert.notEqual(mesh.userData.parts.torso.rotation.x, 0);
  assert.notEqual(mesh.userData.parts.torso.rotation.z, 0);
});

test('first-order wounded gait resets for stationary, crawl, action, and unavailable transitions', () => {
  const { unit, agent, mesh } = createProneMover();

  setPose(agent, { stance: 'STANDING', status: 'WOUNDED', health: 45 });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'wounded-move');
  const woundLean = mesh.rotation.z;
  assert.notEqual(woundLean, 0);

  setPose(agent, { stance: 'STANDING', status: 'WOUNDED', health: 45, speed: 0 });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'idle');
  assert.equal(mesh.rotation.z, woundLean);
  assert.equal(mesh.userData.parts.torso.rotation.x, 0);
  assert.equal(mesh.userData.parts.torso.rotation.z, 0);

  setPose(agent, { stance: 'PRONE', status: 'WOUNDED', health: 45, stridePhase: Math.PI / 2 });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'crawl');
  assert.equal(mesh.rotation.z, woundLean);
  assert.equal(mesh.userData.parts.torso.rotation.x, 0);
  assert.equal(mesh.userData.parts.torso.rotation.z, 0.035);

  for (const [state, recoilTime, expected] of [
    ['RELOADING', 0, 'reload'],
    ['AIMING', 0, 'aim'],
    ['OBSERVING', 0, 'aim'],
    ['MOVING', 0.08, 'fire']
  ]) {
    setPose(agent, { stance: 'STANDING', state, status: 'WOUNDED', health: 45, recoilTime });
    applyPose(unit, agent, mesh);
    assert.equal(mesh.userData.activePose, expected);
    assert.equal(mesh.rotation.z, woundLean);
    assert.equal(mesh.userData.parts.torso.rotation.x, 0);
    assert.equal(mesh.userData.parts.torso.rotation.z, 0);
  }

  setPose(agent, { stance: 'STANDING', status: 'OK', health: 100 });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'move');
  assert.equal(mesh.rotation.z, 0);

  for (const status of ['INCAPACITATED', 'DEAD']) {
    setPose(agent, { stance: 'STANDING', status, health: 100 });
    applyPose(unit, agent, mesh);
    assert.equal(mesh.userData.activePose, 'move');
    assert.equal(mesh.userData.parts.torso.rotation.x, 0);
    assert.equal(mesh.userData.parts.torso.rotation.z, 0);
  }

  setPose(agent, { stance: 'STANDING', status: 'KIA', health: 0 });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'casualty');
  assert.equal(mesh.userData.parts.torso.rotation.x, 0);
  assert.equal(mesh.userData.parts.torso.rotation.z, 0);
});

test('first-order wounded gait honors overlapping pose precedence', () => {
  const { unit, agent, mesh } = createProneMover();

  for (const [state, recoilTime] of [
    ['RELOADING', 0],
    ['AIMING', 0.08],
    ['OBSERVING', 0.08]
  ]) {
    setPose(agent, { stance: 'STANDING', state, status: 'KIA', health: 0, recoilTime });
    applyPose(unit, agent, mesh);
    assert.equal(mesh.userData.activePose, 'casualty');
    assert.equal(mesh.userData.parts.torso.rotation.x, 0);
    assert.equal(mesh.userData.parts.torso.rotation.z, 0);
  }

  setPose(agent, {
    stance: 'STANDING', state: 'RELOADING', status: 'WOUNDED', health: 45, recoilTime: 0.08
  });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'reload');
  assert.equal(mesh.userData.parts.torso.rotation.x, 0);
  assert.equal(mesh.userData.parts.torso.rotation.z, 0);

  setPose(agent, {
    stance: 'STANDING', state: 'AIMING', status: 'WOUNDED', health: 45, recoilTime: 0.08
  });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'fire');
  assert.equal(mesh.userData.parts.torso.rotation.x, 0);
  assert.equal(mesh.userData.parts.torso.rotation.z, 0);

  setPose(agent, {
    stance: 'STANDING', state: 'AIMING', status: 'WOUNDED', health: 45, recoilTime: 0
  });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'aim');
  assert.equal(mesh.userData.parts.torso.rotation.x, 0);
  assert.equal(mesh.userData.parts.torso.rotation.z, 0);
});

test('first-order wounded gait preserves semantic grips and real Unit capture/restore projection', () => {
  const { unit, agent, mesh } = createProneMover();
  const parts = mesh.userData.parts;

  for (const stridePhase of [Math.PI / 2, Math.PI * 1.5]) {
    setPose(agent, { stance: 'STANDING', status: 'WOUNDED', health: 45, stridePhase });
    applyPose(unit, agent, mesh);
    assert.equal(mesh.userData.activePose, 'wounded-move');
    assert.equal(parts.weaponRig.userData.activeGripAssignments.right, 'TriggerHandGrip');
    assert.equal(parts.weaponRig.userData.activeGripAssignments.left, 'SupportHandGrip');
    assert.ok(parts.rightArm.userData.gripBinding.reachable);
    assert.ok(parts.leftArm.userData.gripBinding.reachable);
    assert.ok(parts.rightHand.getWorldPosition(new THREE.Vector3())
      .distanceTo(parts.triggerGrip.getWorldPosition(new THREE.Vector3())) < 1e-4);
    assert.ok(parts.leftHand.getWorldPosition(new THREE.Vector3())
      .distanceTo(parts.supportGrip.getWorldPosition(new THREE.Vector3())) < 1e-4);
  }

  setPose(agent, { stance: 'STANDING', status: 'WOUNDED', health: 45, stridePhase: Math.PI / 2 });
  applyPose(unit, agent, mesh);
  const beforeCapture = woundedMoveProjection(mesh);
  assert.equal(beforeCapture.activePose, 'wounded-move');
  assert.notEqual(beforeCapture.rootLean, 0);
  assert.notEqual(beforeCapture.torsoX, 0);
  assert.notEqual(beforeCapture.torsoZ, 0);
  const snapshot = unit.captureState();
  setPose(agent, { stance: 'PRONE', status: 'OK', health: 100, speed: 0, stridePhase: 0 });
  applyPose(unit, agent, mesh);
  unit.restoreState(snapshot, new Map([[unit.id, unit]]));

  const restored = woundedMoveProjection(mesh);
  assert.equal(restored.activePose, 'wounded-move');
  assert.equal(restored.rootLean, beforeCapture.rootLean);
  assert.equal(restored.torsoX, beforeCapture.torsoX);
  assert.equal(restored.torsoZ, beforeCapture.torsoZ);
  assert.deepEqual(restored, beforeCapture);
  assert.equal(Object.hasOwn(snapshot.roster[0], 'woundedMovePose'), false);
});

test('public infantry casualties project at least three grounded first-order static end poses', () => {
  const unit = new Unit({
    id: 'first_order_casualty_variants',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const signatures = new Set();

  for (const soldier of [...unit.roster]) {
    const result = unit.applySoldierHit(soldier.id, 1, () => 0);
    assert.equal(result.status, 'KIA');
    advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS);
    const index = unit.roster.findIndex(candidate => candidate.id === soldier.id);
    const mesh = unit.mesh.userData.soldiers[index];
    const projection = casualtyProjection(mesh);
    signatures.add(casualtySignatureWithoutRootRoll(projection));
    assert.equal(projection.activePose, 'casualty');

    const casualtyBounds = visibleWorldBounds(mesh);
    const weaponBounds = visibleWorldBounds(mesh.userData.parts.weaponModel);
    assert.ok(
      casualtyBounds.min.y >= -0.12 && casualtyBounds.min.y <= 0.16,
      `casualty ${soldier.id} must remain ground-adjacent`
    );
    assert.ok(
      weaponBounds.min.y >= -0.03 && weaponBounds.min.y <= 0.18,
      `casualty ${soldier.id} weapon must rest near the ground`
    );
    assert.ok(
      weaponBounds.max.y <= 0.36,
      `casualty ${soldier.id} weapon must not float above the casualty`
    );
  }

  assert.ok(
    signatures.size >= 3,
    `expected at least three non-roll casualty signatures, received ${signatures.size}`
  );
});

test('first-order static KIA end poses reapply byte-stably for matching stable identity', () => {
  const createCasualty = () => new Unit({
    id: 'stable_casualty_identity',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const first = createCasualty();
  const soldierId = first.roster[3].id;
  first.applySoldierHit(soldierId, 1, () => 0);
  advanceUnit(first, INFANTRY_CASUALTY_FALL_DURATION_SECONDS);
  const firstMesh = first.mesh.userData.soldiers[3];
  const projected = casualtyProjection(firstMesh);

  first.soldierAI.applyPose(firstMesh, first.roster[3]);
  assert.deepEqual(casualtyProjection(firstMesh), projected);

  const matching = createCasualty();
  matching.applySoldierHit(soldierId, 1, () => 0);
  advanceUnit(matching, INFANTRY_CASUALTY_FALL_DURATION_SECONDS);
  assert.deepEqual(casualtyProjection(matching.mesh.userData.soldiers[3]), projected);
});

test('public living action and locomotion poses cannot leak nested arm IK into KIA', () => {
  const transitions = [
    ['idle', {
      stance: 'STANDING',
      state: 'READY',
      status: 'OK',
      health: 100,
      speed: 0,
      recoilTime: 0
    }],
    ['aim', {
      stance: 'STANDING',
      state: 'AIMING',
      status: 'OK',
      health: 100,
      speed: 0,
      recoilTime: 0
    }],
    ['reload', {
      stance: 'STANDING',
      state: 'RELOADING',
      status: 'OK',
      health: 100,
      speed: 0,
      recoilTime: 0
    }],
    ['crawl', {
      stance: 'PRONE',
      state: 'MOVING',
      status: 'OK',
      health: 100,
      speed: 1,
      recoilTime: 0
    }],
    ['wounded-move', {
      stance: 'STANDING',
      state: 'MOVING',
      status: 'WOUNDED',
      health: 45,
      speed: 1,
      recoilTime: 0
    }]
  ];
  let expectedKiaBytes = null;

  for (const [expectedLivingPose, livingPose] of transitions) {
    const unit = new Unit({
      id: 'casualty_ik_reset_identity',
      faction: 'french',
      type: 'infantry_squad',
      position: new THREE.Vector3()
    });
    const agent = unit.soldierAI.agents[0];
    const mesh = unit.mesh.userData.soldiers[0];
    setPose(agent, livingPose);
    applyPose(unit, agent, mesh);
    const living = casualtyProjection(mesh);
    assert.equal(living.activePose, expectedLivingPose);
    assert.notEqual(living.leftArmRig.gripBinding, null);
    assert.notEqual(living.rightArmRig.gripBinding, null);
    assert.notEqual(living.activeGripAssignments, null);
    assert.ok(
      [living.leftArmRig, living.rightArmRig].some((armRig) =>
        armRig.elbow.quaternion.some((value, index) =>
          value !== [0, 0, 0, 1][index]
        )
      ),
      `${expectedLivingPose} must exercise nested living arm IK`
    );

    const result = unit.applySoldierHit(agent.id, 1, () => 0);
    assert.equal(result.status, 'KIA');
    advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS);
    const kia = casualtyProjection(mesh);
    assert.equal(kia.activePose, 'casualty');
    assertKiaGripMetadataCleared(kia, `${expectedLivingPose} -> KIA`);
    assertArmRigAtDeterministicBase(kia.leftArmRig, `${expectedLivingPose} left`);
    assertArmRigAtDeterministicBase(kia.rightArmRig, `${expectedLivingPose} right`);
    assert.notDeepEqual(kia.leftArmRig.worldHandPosition, living.leftArmRig.worldHandPosition);
    assert.notDeepEqual(kia.rightArmRig.worldHandPosition, living.rightArmRig.worldHandPosition);

    const kiaBytes = JSON.stringify(kia);
    expectedKiaBytes ??= kiaBytes;
    assert.equal(
      kiaBytes,
      expectedKiaBytes,
      `${expectedLivingPose} -> KIA must reproduce the full nested projection byte-exactly`
    );
  }
});

test('KIA variation retains precedence while unavailable and living states remain unvaried', () => {
  const { unit, agent, mesh } = createProneMover();
  setPose(agent, {
    stance: 'PRONE',
    state: 'MOVING',
    status: 'KIA',
    health: 0,
    speed: 1,
    recoilTime: 0
  });
  applyPose(unit, agent, mesh);
  const projected = casualtyProjection(mesh);
  assert.equal(projected.activePose, 'casualty');

  for (const [state, stance, speed, recoilTime, health] of [
    ['RELOADING', 'STANDING', 1, 0.08, 0],
    ['AIMING', 'PRONE', 1, 0.08, 0],
    ['OBSERVING', 'PRONE', 1, 0, 0],
    ['MOVING', 'STANDING', 1, 0, 45]
  ]) {
    setPose(agent, { state, stance, status: 'KIA', health, speed, recoilTime });
    applyPose(unit, agent, mesh);
    assert.deepEqual(casualtyProjection(mesh), projected);
  }

  setPose(agent, {
    stance: 'STANDING',
    state: 'MOVING',
    status: 'WOUNDED',
    health: 45,
    speed: 1
  });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'wounded-move');
  setPose(agent, { status: 'KIA', health: 0 });
  applyPose(unit, agent, mesh);
  assert.deepEqual(casualtyProjection(mesh), projected);

  for (const status of ['INCAPACITATED', 'DEAD']) {
    setPose(agent, {
      stance: 'STANDING',
      state: 'READY',
      status,
      health: 100,
      speed: 0,
      recoilTime: 0
    });
    applyPose(unit, agent, mesh);
    const unavailable = casualtyProjection(mesh);
    assert.notEqual(unavailable.activePose, 'casualty');
    assert.equal(unavailable.rootPositionY, 0);
    assert.ok(unavailable.rootRotation.every((value) => Math.abs(value) === 0));
    assert.ok(unavailable.leftLegRotation.every((value) => Math.abs(value) === 0));
    assert.ok(unavailable.rightLegRotation.every((value) => Math.abs(value) === 0));
    assert.notDeepEqual(unavailable.weaponPosition, projected.weaponPosition);
  }
});

test('real Unit rollback and replay re-project the exact final KIA pose with its transition scalar', () => {
  const unit = new Unit({
    id: 'rollback_casualty_identity',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[4];
  const mesh = unit.mesh.userData.soldiers[4];
  setPose(agent, {
    stance: 'STANDING',
    state: 'READY',
    status: 'OK',
    health: 100,
    speed: 0,
    recoilTime: 0
  });
  applyPose(unit, agent, mesh);
  const livingProjection = casualtyProjection(mesh);
  const livingSnapshot = unit.captureState();

  unit.applySoldierHit(agent.id, 1, () => 0);
  advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS);
  const casualty = casualtyProjection(mesh);
  const casualtyBytes = JSON.stringify(casualty);
  const casualtySnapshot = unit.captureState();
  assert.equal(casualty.activePose, 'casualty');
  assertKiaGripMetadataCleared(casualty, 'initial KIA');
  assert.equal(casualtySnapshot.roster[4].casualtyFallStartStance, 'STANDING');
  assert.equal(
    casualtySnapshot.roster[4].poseTime,
    INFANTRY_CASUALTY_FALL_DURATION_SECONDS
  );
  for (const key of ['casualtyPose', 'casualtyVariant', 'fallPose', 'fallProgress']) {
    assert.equal(Object.hasOwn(casualtySnapshot.roster[4], key), false);
  }

  unit.restoreState(livingSnapshot, new Map([[unit.id, unit]]));
  assert.deepEqual(casualtyProjection(mesh), livingProjection);

  setPose(agent, {
    stance: 'STANDING',
    state: 'RELOADING',
    status: 'OK',
    health: 100,
    speed: 0,
    recoilTime: 0
  });
  applyPose(unit, agent, mesh);
  assert.equal(mesh.userData.activePose, 'reload');
  const reloadProjection = casualtyProjection(mesh);
  assert.notEqual(reloadProjection.leftArmRig.gripBinding, null);
  assert.notEqual(reloadProjection.rightArmRig.gripBinding, null);
  assert.notEqual(reloadProjection.activeGripAssignments, null);
  assert.notEqual(JSON.stringify(reloadProjection), casualtyBytes);

  unit.restoreState(casualtySnapshot, new Map([[unit.id, unit]]));
  const restoredCasualty = casualtyProjection(mesh);
  assertKiaGripMetadataCleared(restoredCasualty, 'restored KIA');
  assert.equal(
    JSON.stringify(restoredCasualty),
    casualtyBytes,
    'restoring the same KIA snapshot after action IK must reproduce every nested transform byte-exactly'
  );

  unit.restoreState(livingSnapshot, new Map([[unit.id, unit]]));
  unit.applySoldierHit(agent.id, 1, () => 0);
  advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS);
  const replayedCasualty = casualtyProjection(mesh);
  assertKiaGripMetadataCleared(replayedCasualty, 'replayed KIA');
  assert.equal(JSON.stringify(replayedCasualty), casualtyBytes);
});

test('public positive-health damage resets the shared pose clock once and clamps a distinct KIA fall', () => {
  const unit = new Unit({
    id: 'public_casualty_fall',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[0];
  const mesh = unit.mesh.userData.soldiers[0];
  setPose(agent, {
    stance: 'STANDING',
    state: 'AIMING',
    status: 'OK',
    health: 100,
    speed: 0
  });
  agent.record.poseTime = 12.5;
  applyPose(unit, agent, mesh);

  const result = unit.applySoldierDamage(agent.id, 200, 0);
  assert.equal(result.status, 'KIA');
  assert.equal(agent.record.poseTime, 0);
  assert.equal(agent.record.casualtyFallStartStance, 'STANDING');
  assert.equal(agent.casualtyFallStartStance, 'STANDING');
  const immediate = casualtyProjection(mesh);
  assert.equal(immediate.activePose, 'casualty');
  assertKiaGripMetadataCleared(immediate, 'immediate fall');

  advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 2);
  const middle = casualtyProjection(mesh);
  assert.equal(agent.record.poseTime, INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 2);
  assert.equal(middle.activePose, 'casualty');
  assert.notDeepEqual(middle, immediate);

  const timeBeforeRepeatedDamage = agent.record.poseTime;
  agent.applyDamage(200, 100);
  assert.equal(agent.record.poseTime, timeBeforeRepeatedDamage);
  assert.equal(agent.record.casualtyFallStartStance, 'STANDING');

  advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 2);
  const completed = casualtyProjection(mesh);
  assert.equal(agent.record.poseTime, INFANTRY_CASUALTY_FALL_DURATION_SECONDS);
  assert.notDeepEqual(completed, middle);

  advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS * 4);
  assert.equal(agent.record.poseTime, INFANTRY_CASUALTY_FALL_DURATION_SECONDS);
  assert.deepEqual(casualtyProjection(mesh), completed);
  assert.equal(
    unit.captureState().roster[0].casualtyFallStartStance,
    'STANDING'
  );
});

test('public damage leaves positive-health unavailable soldiers out of the animated KIA transition', () => {
  for (const status of ['INCAPACITATED', 'DEAD']) {
    const unit = new Unit({
      id: `public_casualty_unavailable_${status.toLowerCase()}`,
      faction: 'french',
      type: 'infantry_squad',
      position: new THREE.Vector3()
    });
    const agent = unit.soldierAI.agents[0];
    const mesh = unit.mesh.userData.soldiers[0];
    setPose(agent, {
      stance: 'KNEELING',
      state: 'READY',
      status,
      health: 100,
      speed: 0
    });
    agent.record.poseTime = 0.3;
    applyPose(unit, agent, mesh);
    const before = casualtyProjection(mesh);

    const result = unit.applySoldierDamage(agent.id, 200, 42);
    assert.equal(result.status, status);
    assert.equal(agent.status, status);
    assert.equal(agent.health, 100);
    assert.equal(agent.suppression, 0);
    assert.equal(agent.record.poseTime, 0.3);
    assert.equal(agent.casualtyFallStartStance, null);
    assert.equal(
      Object.hasOwn(agent.record, 'casualtyFallStartStance'),
      false
    );
    assert.deepEqual(casualtyProjection(mesh), before);
  }

  const unit = new Unit({
    id: 'public_casualty_wounded_available',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[0];
  setPose(agent, {
    stance: 'KNEELING',
    state: 'PINNED',
    status: 'WOUNDED',
    health: 45,
    speed: 0
  });
  const result = unit.applySoldierDamage(agent.id, 100, 0);
  assert.equal(result.status, 'KIA');
  assert.equal(agent.health, 0);
  assert.equal(agent.record.poseTime, 0);
  assert.equal(agent.record.casualtyFallStartStance, 'KNEELING');
});

test('authored KIA fall starts stay low and terrain-adjacent for every living stance', () => {
  for (const stance of ['STANDING', 'KNEELING', 'CROUCHED', 'PRONE']) {
    const unit = new Unit({
      id: `casualty_fall_grounding_${stance.toLowerCase()}`,
      faction: 'french',
      type: 'infantry_squad',
      position: new THREE.Vector3()
    });
    const agent = unit.soldierAI.agents[0];
    const mesh = unit.mesh.userData.soldiers[0];
    setPose(agent, {
      stance,
      state: 'READY',
      status: 'OK',
      health: 100,
      speed: 0
    });
    applyPose(unit, agent, mesh);
    const livingProjection = casualtyProjection(mesh);
    const livingBounds = visibleWorldBounds(mesh);

    unit.applySoldierDamage(agent.id, 200, 0);
    assert.equal(agent.record.casualtyFallStartStance, stance);
    const immediateProjection = casualtyProjection(mesh);
    const immediateBounds = visibleWorldBounds(mesh);
    assert.ok(
      immediateProjection.rootPositionY <= livingProjection.rootPositionY + 1e-12,
      `${stance} immediate root must not rise from its living stance`
    );
    assert.ok(
      immediateBounds.max.y <= livingBounds.max.y + 1e-12,
      `${stance} immediate visible bounds must not rise from the living pose`
    );
    assert.ok(
      immediateBounds.min.y >= -0.120001,
      `${stance} immediate visible bounds must remain terrain-clear`
    );

    const sampledBounds = [];
    for (let sample = 0; sample <= 4; sample++) {
      const projection = casualtyProjection(mesh);
      assert.equal(projection.activePose, 'casualty');
      const bounds = visibleWorldBounds(mesh);
      sampledBounds.push(bounds);
      assert.ok(
        bounds.min.y >= -0.120001,
        `${stance} sample ${sample} must not materially penetrate terrain`
      );
      if (sample < 4) {
        advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 4);
      }
    }
    const topEnvelope = Math.max(
      livingBounds.max.y,
      sampledBounds.at(-1).max.y
    );
    for (const [sample, bounds] of sampledBounds.entries()) {
      assert.ok(
        bounds.max.y <= topEnvelope + 0.040001,
        `${stance} sample ${sample} must not overshoot its living/final height envelope`
      );
    }
  }
});

test('legacy and unavailable KIA inputs bypass the fall while living restore removes its marker', () => {
  const unit = new Unit({
    id: 'casualty_fall_legacy',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[2];
  const mesh = unit.mesh.userData.soldiers[2];
  setPose(agent, {
    stance: 'CROUCHED',
    state: 'READY',
    status: 'OK',
    health: 100,
    speed: 0
  });
  const livingProjection = casualtyProjection(mesh);
  const livingSnapshot = unit.captureState();

  unit.applySoldierDamage(agent.id, 200, 0);
  advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS);
  const acceptedFinalPose = casualtyProjection(mesh);

  unit.restoreState(livingSnapshot, new Map([[unit.id, unit]]));
  assert.equal(agent.casualtyFallStartStance, null);
  assert.equal(Object.hasOwn(agent.record, 'casualtyFallStartStance'), false);
  assert.deepEqual(casualtyProjection(mesh), livingProjection);

  for (const status of ['INCAPACITATED', 'DEAD']) {
    setPose(agent, {
      stance: 'STANDING',
      state: 'READY',
      status,
      health: 0,
      speed: 0
    });
    agent.record.poseTime = 0;
    applyPose(unit, agent, mesh);
    assert.notEqual(mesh.userData.activePose, 'casualty');
    assert.equal(Object.hasOwn(agent.record, 'casualtyFallStartStance'), false);
  }

  setPose(agent, {
    stance: 'PRONE',
    state: 'CASUALTY',
    status: 'KIA',
    health: 0,
    speed: 0
  });
  agent.record.poseTime = 0;
  applyPose(unit, agent, mesh);
  assert.equal(Object.hasOwn(agent.record, 'casualtyFallStartStance'), false);
  assert.deepEqual(casualtyProjection(mesh), acceptedFinalPose);
});

test('mid-fall capture restore and equivalent fixed-step partitions are byte-exact', () => {
  const unit = new Unit({
    id: 'casualty_fall_partition',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[3];
  const mesh = unit.mesh.userData.soldiers[3];
  setPose(agent, {
    stance: 'KNEELING',
    state: 'READY',
    status: 'OK',
    health: 100,
    speed: 0
  });
  unit.applySoldierDamage(agent.id, 200, 0);
  advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 4);
  const midSnapshot = unit.captureState();
  const midProjection = casualtyProjection(mesh);
  assert.equal(
    midSnapshot.roster[3].poseTime,
    INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 4
  );

  advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 2);
  unit.restoreState(midSnapshot, new Map([[unit.id, unit]]));
  assert.deepEqual(casualtyProjection(mesh), midProjection);
  assert.deepEqual(unit.captureState(), midSnapshot);

  advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 8);
  advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 8);
  const partitionedProjection = casualtyProjection(mesh);
  const partitionedRoster = unit.captureState().roster[3];

  unit.restoreState(midSnapshot, new Map([[unit.id, unit]]));
  advanceUnit(unit, INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 4);
  assert.deepEqual(casualtyProjection(mesh), partitionedProjection);
  assert.deepEqual(unit.captureState().roster[3], partitionedRoster);

  unit.restoreState(midSnapshot, new Map([[unit.id, unit]]));
  advanceUnit(unit, 0.1);
  advanceUnit(unit, 0.1);
  advanceUnit(unit, 0.1);
  const decimalPartitionedTime = agent.record.poseTime;
  const decimalPartitionedProjection = casualtyProjection(mesh);

  unit.restoreState(midSnapshot, new Map([[unit.id, unit]]));
  advanceUnit(unit, 0.3);
  assert.equal(agent.record.poseTime, decimalPartitionedTime);
  assert.deepEqual(casualtyProjection(mesh), decimalPartitionedProjection);
});

test('WEGO rewind/replay and realtime consume the same casualty-fall simulation time', () => {
  function createModeHarness(mode) {
    const unit = new Unit({
      id: 'casualty_fall_mode_identity',
      faction: 'french',
      type: 'infantry_squad',
      position: new THREE.Vector3()
    });
    const agent = unit.soldierAI.agents[1];
    const mesh = unit.mesh.userData.soldiers[1];
    unit.stance = 'CROUCHED';
    setPose(agent, {
      stance: 'CROUCHED',
      state: 'READY',
      status: 'OK',
      health: 100,
      speed: 0
    });
    const game = {
      units: [unit],
      commands: {
        setCommandMode() {}
      },
      captureSimulationState() {
        return unit.captureState();
      },
      restoreSimulationState(state) {
        unit.restoreState(state, new Map([[unit.id, unit]]));
      },
      simulateToTime(targetTime) {
        const remaining = targetTime - game.wego.currentTurnTime;
        if (remaining > 0) advanceUnit(unit, remaining);
        game.wego.currentTurnTime = targetTime;
      }
    };
    game.wego = new WegoManager(game);
    if (mode === 'realtime') game.wego.setPlayMode('realtime', { silent: true });
    else game.wego.executeTurn();
    return { unit, agent, mesh, wego: game.wego };
  }

  function stepMode(harness, seconds) {
    const elapsed = harness.wego.getSimulationDelta(seconds);
    advanceUnit(harness.unit, elapsed);
    harness.wego.completeSimulationStep(elapsed, {
      recordSnapshot: false,
      updateUI: false
    });
  }

  const wegoHarness = createModeHarness('wego');
  const realtimeHarness = createModeHarness('realtime');
  for (const harness of [wegoHarness, realtimeHarness]) {
    harness.unit.applySoldierDamage(harness.agent.id, 200, 0);
    stepMode(harness, INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 2);
  }

  assert.equal(
    wegoHarness.agent.record.poseTime,
    realtimeHarness.agent.record.poseTime
  );
  const expectedMidProjection = casualtyProjection(realtimeHarness.mesh);
  assert.deepEqual(casualtyProjection(wegoHarness.mesh), expectedMidProjection);

  wegoHarness.wego.rewindTurn();
  assert.equal(wegoHarness.agent.status, 'OK');
  assert.equal(wegoHarness.agent.casualtyFallStartStance, null);
  assert.equal(
    Object.hasOwn(wegoHarness.agent.record, 'casualtyFallStartStance'),
    false
  );
  wegoHarness.wego.togglePlayPause();
  wegoHarness.unit.applySoldierDamage(wegoHarness.agent.id, 200, 0);
  stepMode(wegoHarness, INFANTRY_CASUALTY_FALL_DURATION_SECONDS / 2);
  assert.deepEqual(casualtyProjection(wegoHarness.mesh), expectedMidProjection);
});

test('FM 24/29 and MG34 bipods deploy only for live prone weapon actions and reset exactly', () => {
  const materials = {
    metal: new THREE.MeshBasicMaterial(),
    wood: new THREE.MeshBasicMaterial()
  };
  try {
    for (const weaponName of ['FM 24/29 LMG', 'MG34 LMG']) {
      const rig = createFrance1940InfantryWeaponRig(weaponName, materials);
      const weaponModel = rig.userData.weaponModel;
      const bipod = weaponModel.userData.parts.bipod;
      assert.ok(bipod?.left && bipod?.right, `${weaponName} bipod parts`);
      assert.equal(bipod.left.userData.lodBand, 'core');
      assert.equal(bipod.right.userData.lodBand, 'core');
      assert.ok(weaponModel.userData.parts.coreSilhouette.includes(bipod.left));
      assert.ok(weaponModel.userData.parts.coreSilhouette.includes(bipod.right));

      const mesh = new THREE.Group();
      mesh.userData.parts = {
        torso: new THREE.Group(),
        head: new THREE.Group(),
        leftLeg: new THREE.Group(),
        rightLeg: new THREE.Group(),
        weaponRig: rig
      };
      const folded = {
        leftPosition: [...bipod.left.userData.bipodRestPosition],
        leftRotation: [...bipod.left.userData.bipodRestRotation],
        rightPosition: [...bipod.right.userData.bipodRestPosition],
        rightRotation: [...bipod.right.userData.bipodRestRotation]
      };
      const soldier = {
        stance: 'PRONE',
        state: 'AIMING',
        status: 'OK',
        health: 100,
        velocity: [0, 0, 0],
        reloadTimer: 0,
        recoilTime: 0
      };

      applyInfantrySecondaryPose(mesh, soldier);
      assert.equal(weaponModel.userData.bipodDeployment, 'deployed');
      assert.ok(bipod.left.rotation.z < folded.leftRotation[2]);
      assert.ok(bipod.right.rotation.z > folded.rightRotation[2]);

      soldier.state = 'MOVING';
      soldier.velocity[0] = 1;
      applyInfantrySecondaryPose(mesh, soldier);
      assert.equal(weaponModel.userData.bipodDeployment, 'folded');
      assert.deepEqual(bipod.left.position.toArray(), folded.leftPosition);
      assert.deepEqual(
        [bipod.left.rotation.x, bipod.left.rotation.y, bipod.left.rotation.z],
        folded.leftRotation
      );
      assert.deepEqual(bipod.right.position.toArray(), folded.rightPosition);
      assert.deepEqual(
        [bipod.right.rotation.x, bipod.right.rotation.y, bipod.right.rotation.z],
        folded.rightRotation
      );

      soldier.state = 'PINNED';
      soldier.velocity[0] = 0;
      applyInfantrySecondaryPose(mesh, soldier);
      assert.equal(weaponModel.userData.bipodDeployment, 'folded');
      soldier.state = 'RELOADING';
      soldier.reloadTimer = 1;
      applyInfantrySecondaryPose(mesh, soldier);
      assert.equal(weaponModel.userData.bipodDeployment, 'deployed');
      soldier.health = 0;
      soldier.status = 'INCAPACITATED';
      applyInfantrySecondaryPose(mesh, soldier);
      assert.equal(weaponModel.userData.bipodDeployment, 'folded');

      rig.traverse(object => object.geometry?.dispose());
    }
  } finally {
    materials.metal.dispose();
    materials.wood.dispose();
  }
});

function createPoseMortarUnit() {
  const formation =
    FRANCE_1940_FORMATIONS.FRENCH_BRANDT_MLE1935_60MM_TEAM;
  const roster = formation.members.map(member => {
    const weapon = FRANCE_1940_CATALOG_PORTS.weapons.get(member.weaponId);
    return {
      ...member,
      weapon: weapon.name,
      status: 'OK',
      health: 100
    };
  });
  return new Unit({
    id: 'mortar_pose_team',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(),
    roster,
    crewServedWeapon: formation.crewServedWeapon
  });
}

function advancePoseMortar(unit, seconds, step = 1 / 30) {
  for (let elapsed = 0; elapsed < seconds - 1e-12;) {
    const delta = Math.min(step, seconds - elapsed);
    unit.update(delta, flatTerrain);
    elapsed += delta;
  }
}

test('real mortar state drives operator setup pack ready aim fire and reload poses', () => {
  const unit = createPoseMortarUnit();
  const equipment = unit.mesh.userData.mortarEquipment;
  const gunnerMesh = unit.mesh.userData.soldiers.find(
    mesh => mesh.userData.soldierId === 'mortar-gunner'
  );
  const assistantMesh = unit.mesh.userData.soldiers.find(
    mesh => mesh.userData.soldierId === 'mortar-assistant'
  );
  const gunnerPose = gunnerMesh.userData.mortarOperatorPose;
  const assistantPose = assistantMesh.userData.mortarOperatorPose;
  assert.ok(equipment);
  assert.equal(unit.mesh.userData.mortarMuzzle, equipment.userData.muzzle);
  assert.notEqual(gunnerMesh.userData.parts.muzzle, equipment.userData.muzzle);
  assert.equal(gunnerPose.action, 'packed');
  assert.equal(gunnerMesh.userData.parts.weaponRig.visible, true);
  for (const soldier of unit.roster) {
    assert.equal(Object.hasOwn(soldier, 'mortarTeamState'), false);
    assert.equal(Object.hasOwn(soldier, 'deploymentState'), false);
    assert.equal(Object.hasOwn(soldier, 'isDeployed'), false);
  }

  const contextIdentity = gunnerPose;
  const equipmentChildren = equipment.children.length;
  assert.equal(unit.toggleCrewServedDeployment(), 'SETTING_UP');
  assert.equal(gunnerPose.action, 'setup');
  assert.equal(gunnerMesh.userData.activePose, 'mortar-setup');
  assert.equal(gunnerMesh.userData.parts.weaponRig.visible, false);
  assert.equal(gunnerMesh.userData.parts.weaponRig.userData.activeGripAssignments, null);
  advancePoseMortar(unit, 5);
  assert.equal(unit.mortarTeamState.deploymentState, 'READY');
  assert.equal(gunnerPose.action, 'ready');
  assert.equal(gunnerMesh.userData.activePose, 'mortar-ready');

  assert.equal(
    unit.setMortarTargetOrder(new THREE.Vector3(0, 0, 100), 'MORTAR_HE'),
    true
  );
  unit.mortarTargetOrder.firstRoundDelayRemainingSeconds = 0;
  unit.syncMortarVisuals();
  unit.soldierAI.syncMeshes();
  assert.equal(gunnerPose.action, 'aim');
  assert.equal(gunnerMesh.userData.activePose, 'mortar-aim');
  const aimSnapshot = unit.captureState();
  assert.equal(
    aimSnapshot.roster.some(soldier => 'mortarOperatorPose' in soldier),
    false
  );

  assert.equal(unit.updateMortarCombat({
    terrain: flatTerrain,
    combat: { fireWeapon: () => true },
    random: () => 0
  }), true);
  unit.soldierAI.syncMeshes();
  assert.equal(gunnerPose.action, 'fire');
  assert.equal(gunnerMesh.userData.activePose, 'mortar-fire');
  assert.ok(unit.mortarTeamState.reloadRemainingSeconds > 0);
  advancePoseMortar(unit, 0.2);
  assert.equal(assistantPose.action, 'reload');
  assert.equal(assistantMesh.userData.activePose, 'mortar-reload');

  unit.applySoldierDamage('mortar-gunner', 200, 0);
  assert.equal(gunnerMesh.userData.activePose, 'casualty');
  unit.restoreState(aimSnapshot, new Map([[unit.id, unit]]));
  assert.equal(gunnerMesh.userData.activePose, 'mortar-aim');
  assert.equal(gunnerPose.firePulseRemainingSeconds, 0);

  assert.equal(unit.toggleCrewServedDeployment(), 'PACKING');
  assert.equal(gunnerPose.action, 'pack');
  assert.equal(gunnerMesh.userData.activePose, 'mortar-pack');
  advancePoseMortar(unit, 3);
  assert.equal(unit.mortarTeamState.deploymentState, 'PACKED');
  assert.equal(gunnerPose.action, 'packed');
  assert.equal(gunnerMesh.userData.parts.weaponRig.visible, true);
  assert.equal(gunnerMesh.userData.activePose.startsWith('mortar-'), false);

  for (let index = 0; index < 25; index++) unit.syncMortarVisuals();
  assert.equal(gunnerMesh.userData.mortarOperatorPose, contextIdentity);
  assert.equal(equipment.children.length, equipmentChildren);
});
