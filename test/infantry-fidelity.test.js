import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { selectNearbyCover } from '../src/game/SoldierAI.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';
import {
  createFrance1940InfantryWeaponRig,
  FRANCE_1940_INFANTRY_WEAPON_VISUALS
} from '../src/content/france1940/render/index.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

const flatTerrain = {
  bocageObstacles: [],
  getHeightAt() {
    return 0;
  }
};

const coverTerrain = {
  bocageObstacles: [{
    id: 'test_wall',
    type: 'stonewall',
    minX: -3,
    maxX: 3,
    minY: 0,
    maxY: 1.1,
    minZ: 1.4,
    maxZ: 1.8,
    height: 1.1
  }],
  getHeightAt() {
    return 0;
  }
};

function makeWeaponMaterials() {
  return {
    wood: new THREE.MeshBasicMaterial({ color: 0x6b4226 }),
    metal: new THREE.MeshBasicMaterial({ color: 0x30332f })
  };
}

function minimumLivingSpacing(unit) {
  const living = unit.soldierAI.getLivingAgents();
  let minimum = Infinity;
  for (let first = 0; first < living.length; first++) {
    for (let second = first + 1; second < living.length; second++) {
      minimum = Math.min(minimum, living[first].position.distanceTo(living[second].position));
    }
  }
  return minimum;
}

test('nine 1940 infantry weapons expose dimensioned semantic silhouettes and true muzzles', () => {
  const expectedFeeds = {
    'Lebel Mle 1886/93': 'tubular',
    'Lebel Mle 1886/93 with APX 1916': 'tubular',
    'Berthier Mousqueton Mle 1892 M16': 'en-bloc',
    'MAS-36 Rifle': 'internal',
    'FM 24/29 LMG': 'top',
    'MAS-38 SMG': 'bottom',
    Kar98k: 'internal',
    'MG34 LMG': 'belt-drum',
    MP40: 'bottom'
  };
  const signatures = new Set();

  for (const [weaponName, spec] of Object.entries(FRANCE_1940_INFANTRY_WEAPON_VISUALS)) {
    const rig = createFrance1940InfantryWeaponRig(weaponName, makeWeaponMaterials());
    const model = rig.userData.weaponModel;
    const parts = model.userData.parts;

    assert.equal(rig.name, 'TwoHandWeaponRig');
    assert.equal(rig.userData.semanticRig, 'two-hand-firearm');
    assert.equal(rig.userData.grips.trigger.name, 'TriggerHandGrip');
    assert.equal(rig.userData.grips.support.name, 'SupportHandGrip');
    assert.equal(rig.userData.grips.reload.name, 'ReloadHandGrip');
    assert.equal(model.parent, rig);
    assert.equal(parts.muzzle.parent, model);
    assert.equal(parts.muzzle.position.z, spec.overallLength);
    assert.equal(model.userData.visualContract.units, 'metres');
    assert.equal(model.userData.visualContract.overallLength, spec.overallLength);
    assert.ok(model.userData.visualContract.definingFeatures.length >= 3);
    assert.equal(parts.magazine.userData.feedType, expectedFeeds[weaponName]);

    for (const semanticPart of ['stock', 'receiver', 'handguard', 'barrel', 'magazine', 'muzzle']) {
      assert.ok(parts[semanticPart], `${weaponName} must expose ${semanticPart}`);
      assert.ok(parts[semanticPart].name, `${weaponName} ${semanticPart} must be named`);
    }
    assert.ok(parts.triggerGuard, `${weaponName} must expose its trigger guard`);
    if (['lebel1886m93', 'lebel1886m93apx1916', 'berthier1892m16', 'mas36', 'kar98k'].includes(spec.id)) {
      assert.ok(parts.boltHandle, `${weaponName} must expose its bolt handle`);
      assert.equal(parts.chargingHandle, null);
    } else {
      assert.ok(parts.chargingHandle, `${weaponName} must expose its charging handle`);
    }
    if (['fm2429', 'mg34', 'mp40', 'mas38'].includes(spec.id)) {
      assert.ok(parts.pistolGrip, `${weaponName} must expose its pistol grip`);
    }

    assert.equal(parts.stock.position.z >= 0, true);
    if (parts.bodyBarrelAssembly) {
      assert.equal(parts.receiver, parts.bodyBarrelAssembly);
      assert.equal(parts.barrel, parts.bodyBarrelAssembly);
      assert.equal(parts.magazine, parts.bodyBarrelAssembly);
      const regions = parts.bodyBarrelAssembly.userData.semanticRegions;
      assert.ok(regions.receiver.startZ < regions.receiver.endZ);
      assert.ok(regions.barrel.startZ < regions.barrel.endZ);
      assert.ok(regions.receiver.endZ > regions.barrel.startZ);
    } else {
      assert.equal(parts.receiver.position.z > parts.stock.position.z, true);
      assert.equal(parts.barrel.position.z > parts.receiver.position.z, true);
    }
    signatures.add([
      spec.overallLength,
      spec.stockEnd,
      spec.receiverEnd,
      spec.handguardEnd,
      expectedFeeds[weaponName],
      spec.optic ?? 'iron'
    ].join(':'));
  }

  assert.equal(signatures.size, 9);
});

test('infantry exposes two-bone arms, avoids deep weapon clipping, and binds both hands in every active pose', () => {
  const units = ['french', 'german'].map(faction => new Unit({
    id: `pose_clearance_${faction}`,
    faction,
    type: 'infantry_squad',
    position: new THREE.Vector3()
  }));
  const poses = [
    { state: 'READY', velocity: [0, 0, 0], recoilTime: 0, reloadTimer: 0, expected: 'idle' },
    { state: 'OBSERVING', velocity: [0, 0, 0], recoilTime: 0, expected: 'aim' },
    { state: 'AIMING', velocity: [0, 0, 0], recoilTime: 0, expected: 'aim' },
    { state: 'AIMING', velocity: [0, 0, 0], recoilTime: 0.08, expected: 'fire' },
    { state: 'RELOADING', velocity: [0, 0, 0], recoilTime: 0, reloadTimer: 1, expected: 'reload' },
    { state: 'MOVING', velocity: [1.5, 0, 0], recoilTime: 0, expected: 'move' }
  ];

  for (const unit of units) {
    unit.roster.forEach((soldier, index) => {
      const mesh = unit.mesh.userData.soldiers[index];
      const parts = mesh.userData.parts;
      for (const boneName of ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'head']) {
        assert.ok(mesh.userData.bones[boneName]);
        assert.ok(mesh.userData.bones[boneName].name);
      }
      assert.equal(parts.weaponRig.userData.handBindings.trigger, 'RightHand');
      assert.equal(parts.weaponRig.userData.handBindings.support, 'LeftHand');

      for (const pose of poses) {
        Object.assign(soldier, { reloadTimer: 0, ...pose });
        unit.soldierAI.applyPose(mesh, soldier);
        mesh.updateWorldMatrix(true, true);
        const torsoBounds = new THREE.Box3().setFromObject(parts.torso);
        const weaponBounds = new THREE.Box3().setFromObject(parts.weaponModel);
        assert.equal(mesh.userData.activePose, pose.expected);
        assert.ok(
          Math.abs(parts.weaponRig.position.x - parts.rightArm.position.x)
            < Math.abs(parts.weaponRig.position.x - parts.leftArm.position.x),
          `${soldier.weapon} ${pose.expected} stock must remain closer to right shoulder`
        );
        assert.equal(parts.weaponRig.userData.handBindings.trigger, 'RightHand');
        assert.equal(parts.weaponRig.userData.handBindings.support, 'LeftHand');
        assert.ok(
          weaponBounds.min.z >= (torsoBounds.min.z + torsoBounds.max.z) * 0.5 - 0.025,
          `${soldier.weapon} ${pose.expected} butt may touch shoulder but cannot pass through torso`
        );

        const assignments = parts.weaponRig.userData.activeGripAssignments;
        const leftGrip = assignments.left === 'ReloadHandGrip'
          ? parts.reloadGrip
          : parts.supportGrip;
        const rightGrip = assignments.right === 'ReloadHandGrip'
          ? parts.reloadGrip
          : parts.triggerGrip;
        assert.ok(
          parts.leftHand.getWorldPosition(new THREE.Vector3())
            .distanceTo(leftGrip.getWorldPosition(new THREE.Vector3())) < 1e-4,
          `${soldier.weapon} ${pose.expected} support hand must meet ${assignments.left}`
        );
        assert.ok(
          parts.rightHand.getWorldPosition(new THREE.Vector3())
            .distanceTo(rightGrip.getWorldPosition(new THREE.Vector3())) < 1e-4,
          `${soldier.weapon} ${pose.expected} trigger hand must meet ${assignments.right}`
        );
        assert.ok(parts.leftArm.userData.gripBinding.reachable);
        assert.ok(parts.rightArm.userData.gripBinding.reachable);
        assert.ok(parts.leftArm.userData.gripBinding.reachScale <= 1.08);
        assert.ok(parts.rightArm.userData.gripBinding.reachScale <= 1.08);
      }
    });
  }
});

test('idle breathing, look, and weight shift depend on simulation seconds rather than frame count', () => {
  const sixtyHz = new Unit({
    id: 'deterministic_idle',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const thirtyHz = new Unit({
    id: 'deterministic_idle',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });

  for (let frame = 0; frame < 60; frame++) sixtyHz.update(1 / 60, flatTerrain);
  for (let frame = 0; frame < 30; frame++) thirtyHz.update(1 / 30, flatTerrain);

  const first = sixtyHz.mesh.userData.soldiers[0].userData.parts;
  const second = thirtyHz.mesh.userData.soldiers[0].userData.parts;
  assert.ok(Math.abs(sixtyHz.roster[0].poseTime - 1) < 1e-12);
  assert.ok(Math.abs(thirtyHz.roster[0].poseTime - 1) < 1e-12);
  assert.ok(Math.abs(first.torso.scale.y - second.torso.scale.y) < 1e-12);
  assert.ok(Math.abs(first.torso.rotation.z - second.torso.rotation.z) < 1e-12);
  assert.ok(Math.abs(first.head.rotation.y - second.head.rotation.y) < 1e-12);
});

test('incoming fire selects nearby shielding cover with an inspectable deterministic score', () => {
  const unit = new Unit({
    id: 'cover_reaction',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[0];
  const threat = new THREE.Vector3(0, 0, 12);
  const directChoice = selectNearbyCover(agent, coverTerrain, threat, unit.soldierAI.agents);

  assert.equal(directChoice.obstacleId, 'test_wall');
  assert.equal(directChoice.side, 'north');
  assert.equal(directChoice.shielded, true);

  agent.suppression = 12;
  unit.soldierAI.update(1 / 30, coverTerrain, { threatPosition: threat });
  const decision = agent.record.tacticalDecision;
  assert.equal(decision.reason, 'incoming-fire-cover');
  assert.equal(decision.coverId, 'test_wall');
  assert.equal(decision.shielded, true);
  assert.ok(Number.isFinite(decision.coverScore));
  assert.deepEqual(decision.goal, directChoice.position.toArray());
  assert.ok(['REACTING', 'MOVING'].includes(agent.state));
});

test('projectile impacts signal nearby soldiers independently using source and impact direction', () => {
  const unit = new Unit({
    id: 'near_miss_reaction',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agents = unit.soldierAI.agents;
  agents[0].position.set(0, 0, 0);
  agents[1].position.set(3, 0, 0);
  agents.at(-1).position.set(20, 0, 0);
  for (const agent of agents) agent.syncRecord();

  const combat = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    getUnits: () => [unit],
    vfxProvider: TEST_VFX_PROVIDER
  });
  const weapon = getWeapon('MAS36');
  const projectile = {
    id: 17,
    attacker: { id: 'shooter', position: new THREE.Vector3(0, 0, 12) },
    muzzlePosition: new THREE.Vector3(0, 1.2, 12),
    weapon
  };
  combat.notifyNearbyInfantry(projectile, {
    kind: 'terrain',
    point: new THREE.Vector3(0, 0, 0)
  });

  assert.ok(agents[0].record.incomingFireTimer > agents[1].record.incomingFireTimer);
  assert.equal(agents.at(-1).record.incomingFireTimer, 0);
  assert.deepEqual(agents[0].record.incomingThreatPosition, [0, 1.2, 12]);
  assert.deepEqual(agents[0].record.incomingImpactPosition, [0, 0, 0]);
  assert.notEqual(agents[0].suppression, agents[1].suppression);

  unit.soldierAI.update(1 / 30, coverTerrain);
  assert.equal(agents[0].record.tacticalDecision.reason, 'incoming-fire-cover');
  assert.deepEqual(agents[0].record.tacticalDecision.threatPosition, [0, 1.2, 12]);
});

test('individual spacing and casualty response change movement goals without random wandering', () => {
  const crowded = new Unit({
    id: 'spacing_reaction',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  crowded.soldierAI.agents.forEach((agent, index) => {
    agent.position.set(index * 0.05, 0, 0);
    agent.reactionDelay = 0;
    agent.syncRecord();
  });
  const initialSpacing = minimumLivingSpacing(crowded);
  crowded.soldierAI.update(1 / 30, flatTerrain);
  assert.ok(crowded.roster.some(soldier => soldier.tacticalDecision.reason === 'spacing-clearance'));
  for (let step = 0; step < 45; step++) crowded.soldierAI.update(1 / 30, flatTerrain);
  assert.ok(minimumLivingSpacing(crowded) > initialSpacing);

  const casualty = new Unit({
    id: 'casualty_reaction',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  casualty.soldierAI.agents[0].applyDamage(120, 0);
  casualty.soldierAI.update(1 / 30, coverTerrain, {
    threatPosition: new THREE.Vector3(0, 0, 12)
  });
  for (const survivor of casualty.soldierAI.getLivingAgents()) {
    assert.equal(survivor.record.tacticalDecision.reason, 'casualty-response-cover');
    assert.ok(survivor.record.casualtyResponseTimer > 0);
  }
});

test('animation and explainable tactical reaction state survive roster capture and restore', () => {
  const unit = new Unit({
    id: 'reaction_snapshot',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[0];
  unit.registerIncomingFire(
    new THREE.Vector3(0, 1.2, 12),
    new THREE.Vector3(0, 0, 0),
    { radius: 8, intensity: 1 }
  );
  unit.soldierAI.update(0.05, coverTerrain, {
    threatPosition: new THREE.Vector3(0, 0, 12)
  });
  const snapshot = unit.captureState();
  const expected = JSON.parse(JSON.stringify(snapshot.roster[0]));

  agent.record.poseTime = 99;
  agent.record.incomingFireTimer = 0;
  agent.record.incomingThreatPosition[0] = 99;
  agent.record.tacticalDecision = { reason: 'mutated' };
  unit.restoreState(snapshot, new Map([[unit.id, unit]]));

  assert.equal(unit.roster[0].poseTime, expected.poseTime);
  assert.equal(unit.roster[0].incomingFireTimer, expected.incomingFireTimer);
  assert.deepEqual(unit.roster[0].incomingThreatPosition, expected.incomingThreatPosition);
  assert.deepEqual(unit.roster[0].incomingImpactPosition, expected.incomingImpactPosition);
  assert.deepEqual(unit.roster[0].tacticalDecision, expected.tacticalDecision);
  unit.soldierAI.update(0.05, coverTerrain);
  assert.deepEqual(snapshot.roster[0], expected, 'restored live state must not alias rewind snapshot');
});
