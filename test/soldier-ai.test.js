import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { SoldierAgent } from '../src/game/SoldierAgent.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

const flatTerrain = {
  getHeightAt() {
    return 0;
  }
};

test('infantry soldiers react and move independently toward formation slots', () => {
  const unit = new Unit({
    id: 'test_squad',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 0)
  });
  const initialPositions = unit.roster.map(soldier => [...soldier.worldPosition]);

  unit.addWaypoint(new THREE.Vector3(0, 0, 20), 'QUICK');
  for (let step = 0; step < 60; step++) unit.update(1 / 30, flatTerrain);

  const travelled = unit.roster.map((soldier, index) =>
    new THREE.Vector3().fromArray(soldier.worldPosition)
      .distanceTo(new THREE.Vector3().fromArray(initialPositions[index]))
  );
  assert.ok(travelled.every(distance => distance > 0.1));
  assert.ok(new Set(travelled.map(distance => distance.toFixed(2))).size > 2);
  assert.ok(unit.roster.some(soldier => soldier.state === 'MOVING'));
});

test('individual casualties and agent transforms survive snapshot restore', () => {
  const unit = new Unit({
    id: 'casualty_test',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(4, 0, -3)
  });
  const target = unit.roster[2];
  unit.applySoldierHit(target.id, 1, () => 0);
  assert.equal(target.status, 'KIA');
  assert.equal(unit.getLivingSoldiers().length, unit.roster.length - 1);

  const snapshot = unit.captureState();
  unit.roster[0].worldPosition[0] += 12;
  unit.roster[0].status = 'WOUNDED';
  unit.restoreState(snapshot, new Map([[unit.id, unit]]));

  assert.deepEqual(unit.roster[0].worldPosition, snapshot.roster[0].worldPosition);
  assert.equal(unit.roster[0].status, snapshot.roster[0].status);
  assert.equal(unit.roster[2].status, 'KIA');
});

test('infantry model exposes articulated period equipment', () => {
  const unit = new Unit({
    id: 'model_test',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });

  assert.equal(unit.mesh.userData.materialPalette, 'French 1940 khaki and blue-grey');
  assert.equal(unit.mesh.userData.soldiers.length, unit.roster.length);
  for (const soldier of unit.mesh.userData.soldiers) {
    assert.ok(soldier.userData.parts.leftArm);
    assert.ok(soldier.userData.parts.rightLeg);
    assert.ok(soldier.userData.parts.weapon);
    assert.ok(soldier.userData.parts.pack);
  }
});

test('pose reset restores headgear after pinned and wounded states', () => {
  const unit = new Unit({
    id: 'pose_reset',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[0];
  const mesh = unit.mesh.userData.soldiers[0];
  const { head, headgear } = mesh.userData.parts;
  const baseHeadY = head.position.y;
  const baseHeadgearY = headgear.map(item => item.position.y);

  agent.stance = 'PRONE';
  agent.suppression = 60;
  agent.status = 'WOUNDED';
  unit.soldierAI.applyPose(mesh, agent);
  assert.equal(head.position.y, baseHeadY - 0.1);
  assert.deepEqual(
    headgear.map(item => item.position.y),
    baseHeadgearY.map(value => value - 0.1)
  );
  assert.notEqual(mesh.rotation.z, 0);

  agent.stance = 'STANDING';
  agent.suppression = 0;
  agent.status = 'OK';
  unit.soldierAI.applyPose(mesh, agent);
  assert.equal(head.position.y, baseHeadY);
  assert.deepEqual(headgear.map(item => item.position.y), baseHeadgearY);
  assert.equal(mesh.rotation.x, 0);
  assert.equal(mesh.rotation.z, 0);
  assert.equal(mesh.position.y, 0);
});

test('a projectile resolves against its targeted individual soldier', () => {
  const attacker = new Unit({
    id: 'fire_team',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 0)
  });
  const target = new Unit({
    id: 'target_team',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 12)
  });
  const shooter = attacker.roster[0];
  const targetSoldier = target.roster[0];
  const sound = {
    playGunshot() {},
    playCannon() {},
    playExplosion() {}
  };
  const combat = new CombatSystem(new THREE.Scene(), sound, () => 0, {
    vfxProvider: TEST_VFX_PROVIDER
  });

  assert.equal(combat.fireWeapon(attacker, target, target.position, {
    shooter,
    targetSoldier,
    willHit: true
  }), true);
  for (let step = 0; step < 10; step++) combat.update(0.05);

  assert.equal(targetSoldier.status, 'WOUNDED');
  assert.ok(targetSoldier.health < 20);
  assert.equal(combat.telemetry.infantryHits, 1);
});

test('each infantryman owns autonomous movement, health, and attack state', () => {
  const attacker = new Unit({
    id: 'autonomous_attackers',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 0)
  });
  const target = new Unit({
    id: 'autonomous_targets',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 16)
  });
  const combat = new CombatSystem(new THREE.Scene(), {
    playGunshot() {},
    playCannon() {},
    playExplosion() {}
  }, () => 0, {
    vfxProvider: TEST_VFX_PROVIDER
  });
  const spotting = {
    checkLOS(from, to) {
      return { clear: true, dist: from.distanceTo(to) };
    }
  };

  assert.ok(attacker.soldierAI.agents.every(agent => agent instanceof SoldierAgent));
  attacker.soldierAI.agents.forEach(agent => {
    agent.fireCooldown = 0;
    agent.state = 'OBSERVING';
  });
  attacker.updateIndividualCombat(0.1, {
    opposingUnits: [target],
    spotting,
    combat,
    random: () => 0
  });
  assert.equal(combat.projectiles.length, 0);
  attacker.updateIndividualCombat(2, {
    opposingUnits: [target],
    spotting,
    combat,
    random: () => 0
  });

  assert.ok(combat.projectiles.length >= attacker.roster.length);
  assert.equal(new Set(combat.projectiles.map(projectile => projectile.shooterId)).size, attacker.roster.length);
  assert.ok(attacker.soldierAI.agents.every(agent => agent.targetUnitId === target.id));
});

test('French tank model carries SOMUA S35 dimensions and defining assemblies', () => {
  const tank = new Unit({
    id: 's35_model',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3()
  });
  const metadata = tank.mesh.userData.modelMetadata;
  const names = [];
  tank.mesh.traverse(object => names.push(object.name));

  assert.equal(metadata.designation, 'SOMUA S35');
  assert.equal(metadata.dimensionsMeters.length, 5.38);
  assert.equal(metadata.dimensionsMeters.width, 2.12);
  assert.ok(names.includes('S35_CastPrimaryHull'));
  assert.ok(names.includes('S35_SlopingEngineDeck'));
  assert.equal(names.filter(name => /S35RoadWheel_/.test(name)).length, 18);
  assert.ok(metadata.features.some(feature => feature.includes('APX 1 CE one-man turret')));
});

test('SOMUA S35 cast hull end caps face outward', () => {
  const tank = new Unit({
    id: 's35_winding',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3()
  });
  const hull = tank.mesh.getObjectByName('S35_CastPrimaryHull');
  assert.ok(hull);
  assert.ok(hull.geometry.userData.signedVolumeCubicMeters > 0);
  const positions = hull.geometry.attributes.position;
  const indices = hull.geometry.index;
  const stationCount = hull.geometry.userData.profileStations.length;
  const ringSize = 8;
  const sideIndexCount = (stationCount - 1) * ringSize * 2 * 3;
  const capTriangleCount = ringSize - 2;
  const vertexIndex = offset => indices?.getX(offset) ?? offset;

  for (const [cap, expectedSign] of [['rear', -1], ['front', 1]]) {
    const capOffset = sideIndexCount + (cap === 'front' ? capTriangleCount * 3 : 0);
    for (let triangle = 0; triangle < capTriangleCount; triangle++) {
      const offset = capOffset + triangle * 3;
      const a = new THREE.Vector3().fromBufferAttribute(positions, vertexIndex(offset));
      const b = new THREE.Vector3().fromBufferAttribute(positions, vertexIndex(offset + 1));
      const c = new THREE.Vector3().fromBufferAttribute(positions, vertexIndex(offset + 2));
      const normal = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a)
      );
      assert.ok(
        Math.sign(normal.z) === expectedSign,
        `S35 ${cap} cap triangle ${triangle} must face outward`
      );
    }
  }
});

test('right-side camera button strip is absent', async () => {
  const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(markup, /mobile-cam-controls|m-cam-in|m-cam-rot-r/);
});

test('pixeltruppen recover from pinned state across morale tiers out of fire', () => {
  const squad = new Unit({
    id: 'recovery_squad',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 0)
  });
  const agent = squad.soldierAI.agents[0];
  agent.suppression = 85;
  agent.record.lastSuppression = 85;
  agent.record.incomingFireTimer = 0;

  // Initial update: PINNED
  squad.soldierAI.update(0.1, flatTerrain);
  assert.equal(agent.moraleTier, 'PINNED');
  assert.equal(agent.state, 'PINNED');
  assert.equal(agent.stance, 'PRONE');

  // Step 1: Recover to TAKING_COVER (suppression 55 - 75)
  for (let i = 0; i < 6; i++) squad.soldierAI.update(0.1, flatTerrain);
  assert.equal(agent.moraleTier, 'TAKING_COVER');
  assert.equal(agent.stance, 'PRONE');

  // Step 2: Recover to DUCKING (suppression 35 - 55)
  for (let i = 0; i < 7; i++) squad.soldierAI.update(0.1, flatTerrain);
  assert.equal(agent.moraleTier, 'DUCKING');

  // Step 3: Recover to CAUTIOUS (suppression 15 - 35)
  for (let i = 0; i < 8; i++) squad.soldierAI.update(0.1, flatTerrain);
  assert.equal(agent.moraleTier, 'CAUTIOUS');
  assert.equal(agent.stance, 'KNEELING');

  // Step 4: Full recovery to READY (suppression < 15)
  for (let i = 0; i < 14; i++) squad.soldierAI.update(0.1, flatTerrain);
  assert.equal(agent.moraleTier, 'READY');
  assert.equal(agent.suppression, 0);
});

test('unit-level pinned morale holds every living soldier prone', () => {
  const squad = new Unit({
    id: 'squad_pin',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  squad.morale = 'Pinned';
  for (const agent of squad.soldierAI.agents) agent.suppression = 0;
  squad.soldierAI.update(0.1, flatTerrain);
  for (const agent of squad.soldierAI.agents) {
    assert.equal(agent.moraleTier, 'PINNED');
    assert.equal(agent.state, 'PINNED');
    assert.equal(agent.stance, 'PRONE');
  }
});

test('morale tiers grant distinct postures and automated reactions', () => {
  const squad = new Unit({
    id: 'tier_squad',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 0)
  });
  const agent = squad.soldierAI.agents[0];

  // Tier 1: READY
  agent.suppression = 5;
  squad.soldierAI.update(0.1, flatTerrain);
  assert.equal(agent.moraleTier, 'READY');

  // Tier 2: CAUTIOUS
  agent.suppression = 25;
  squad.soldierAI.update(0.1, flatTerrain);
  assert.equal(agent.moraleTier, 'CAUTIOUS');
  assert.equal(agent.stance, 'KNEELING');

  // Tier 3: DUCKING
  agent.suppression = 45;
  squad.soldierAI.update(0.1, flatTerrain);
  assert.equal(agent.moraleTier, 'DUCKING');

  // Tier 4: TAKING_COVER
  agent.suppression = 65;
  squad.soldierAI.update(0.1, flatTerrain);
  assert.equal(agent.moraleTier, 'TAKING_COVER');

  // Tier 5: PINNED
  agent.suppression = 80;
  squad.soldierAI.update(0.1, flatTerrain);
  assert.equal(agent.moraleTier, 'PINNED');
  assert.equal(agent.stance, 'PRONE');

  // Tier 6: ROUTED
  agent.suppression = 95;
  squad.soldierAI.update(0.1, flatTerrain);
  assert.equal(agent.moraleTier, 'ROUTED');
  assert.equal(agent.state, 'FLEEING');
});
