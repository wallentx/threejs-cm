import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { Unit } from '../src/game/Unit.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { SoldierAgent } from '../src/game/SoldierAgent.js';

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
  const combat = new CombatSystem(new THREE.Scene(), sound, () => 0);

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
  }, () => 0);
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
  attacker.updateIndividualCombat(1, {
    opposingUnits: [target],
    spotting,
    combat,
    random: () => 0
  });

  assert.equal(combat.projectiles.length, attacker.roster.length);
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
  assert.ok(names.includes('S35_CastHull'));
  assert.ok(names.includes('S35_EngineDeck'));
  assert.ok(names.filter(name => name.startsWith('S35_RoadWheel_')).length >= 18);
  assert.ok(metadata.features.includes('APX 1 CE one-man turret'));
});

test('right-side camera button strip is absent', async () => {
  const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(markup, /mobile-cam-controls|m-cam-in|m-cam-rot-r/);
});
