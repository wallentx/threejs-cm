import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BallisticsSystem,
  calculateBuildingProjectileDamage
} from '../src/game/BallisticsSystem.js';
import {
  CombatSystem,
  calculateBuildingBlastDamage
} from '../src/game/CombatSystem.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';
import { BuildingSystem } from '../src/simulation/buildings/BuildingSystem.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

function createBuildingSystem() {
  const system = new BuildingSystem();
  system.registerDescriptor(FR_HOUSE_12X9_2F);
  system.addBuilding({
    id: 'house-1',
    descriptorId: FR_HOUSE_12X9_2F.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  return system;
}

function createInfantryUnit({
  id = 'defenders',
  soldierId = 'rifleman-1',
  position = new THREE.Vector3(0, 0.53, 0),
  health = 100
} = {}) {
  const agent = {
    id: soldierId,
    position,
    health,
    status: 'OK',
    get isAlive() {
      return this.health > 0;
    },
    applyDamage(amount) {
      this.health = Math.max(0, this.health - amount);
      if (this.health <= 0) this.status = 'KIA';
    }
  };
  const unit = {
    id,
    faction: 'german',
    type: 'infantry_squad',
    soldierAI: {
      agents: [agent],
      getLivingAgents: () => agent.isAlive ? [agent] : []
    },
    isCombatEffective: () => agent.isAlive,
    applySoldierDamage(targetId, amount) {
      if (String(targetId) === String(agent.id)) agent.applyDamage(amount);
    },
    applySuppression() {}
  };
  return { unit, agent };
}

function createProjectile({
  weapon = getWeapon('MAS36'),
  attacker = { id: 'attacker', faction: 'french' },
  x = 0,
  y = 1.45,
  startZ = 10,
  endZ = -2,
  speed = weapon.muzzleVelocity
} = {}) {
  return {
    id: 1,
    attacker,
    shooterId: attacker.id,
    mountId: 'individual',
    targetSoldierId: null,
    weapon,
    ammoId: weapon.id,
    muzzlePosition: new THREE.Vector3(x, y, startZ),
    velocity: new THREE.Vector3(0, 0, -speed),
    previousPosition: new THREE.Vector3(x, y, startZ),
    position: new THREE.Vector3(x, y, endZ),
    lifetime: 0.02,
    distanceTravelled: startZ - endZ
  };
}

test('open window permits a swept projectile to reach the occupant', () => {
  const buildingSystem = createBuildingSystem();
  const { unit, agent } = createInfantryUnit({
    position: new THREE.Vector3(-3.2, 0.53, 0)
  });
  const ballistics = new BallisticsSystem({
    buildingSystem,
    getUnits: () => [unit],
    random: () => 0.5
  });

  const hit = ballistics.detectImpact(createProjectile({ x: -3.2 }));
  assert.equal(hit.kind, 'infantry');
  assert.equal(hit.agent, agent);
});

test('wall is the earliest hit before an occupant and a breach permits the later shot', () => {
  const buildingSystem = createBuildingSystem();
  const { unit, agent } = createInfantryUnit({
    position: new THREE.Vector3(-1.45, 0.53, 0)
  });
  const ballistics = new BallisticsSystem({
    buildingSystem,
    getUnits: () => [unit],
    random: () => 0.5
  });
  const breachingWeapon = {
    ...getWeapon('SA35_AP'),
    id: 'TEST_BREACH_AP',
    muzzleVelocity: 1000,
    penetrationMmAt100m: 1000,
    woundDamage: 900
  };
  const firstProjectile = createProjectile({
    weapon: breachingWeapon,
    x: -1.45,
    speed: 1000
  });

  const wallHit = ballistics.detectImpact(firstProjectile);
  assert.equal(wallHit.kind, 'building');
  assert.equal(wallHit.buildingId, 'house-1');
  assert.equal(wallHit.sectionId, 'ground-shell');
  assert.equal(wallHit.colliderPartId, 'ground-left-inner');
  assert.ok(
    wallHit.distance
      < firstProjectile.previousPosition.distanceTo(
        agent.position.clone().add(new THREE.Vector3(0, 0.92, 0))
      )
  );

  const result = ballistics.resolveBuildingImpact(firstProjectile, wallHit);
  assert.equal(result.penetrated, true);
  assert.equal(result.buildingResult.result.breached, true);
  assert.ok(
    !buildingSystem.getCollisionSnapshot('house-1').records
      .some(record => record.partId === 'ground-left-inner')
  );

  const laterHit = ballistics.detectImpact(createProjectile({
    weapon: breachingWeapon,
    x: -1.45,
    speed: 1000
  }));
  assert.equal(laterHit.kind, 'infantry');
  assert.equal(laterHit.agent, agent);
});

test('HE blast damages sections, cascades support collapse, and applies exact occupant consequence', () => {
  const buildingSystem = createBuildingSystem();
  buildingSystem.occupySlot('house-1', {
    slotId: 'upper-front-left',
    soldierKey: 'defenders:rifleman-1',
    unitId: 'defenders',
    soldierId: 'rifleman-1'
  });
  const { unit, agent } = createInfantryUnit();
  const changes = [];
  const consequences = [];
  const combat = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    buildingSystem,
    getUnits: () => [unit],
    onBuildingChanged: change => changes.push(change),
    onOccupantConsequences: records => {
      for (const consequence of records) {
        unit.applySoldierDamage(consequence.soldierId, consequence.damage);
        consequences.push(consequence);
      }
    },
    vfxProvider: TEST_VFX_PROVIDER
  });
  const weapon = {
    ...getWeapon('SA35_HE'),
    explosiveRadius: 1,
    woundDamage: 400
  };
  const center = new THREE.Vector3(0, -0.2, 0);

  assert.equal(calculateBuildingBlastDamage(weapon), 650);
  combat.applyBlast(center, weapon, null);
  combat.applyBlast(center, weapon, null);

  const state = buildingSystem.getBuildingSnapshot('house-1');
  assert.equal(state.sections.foundation.collapsed, true);
  assert.ok(
    Object.values(state.sections).filter(section => section.collapsed).length > 1,
    'foundation loss must cascade through supported sections'
  );
  assert.equal(consequences.length, 1);
  assert.equal(consequences[0].damage, 70);
  assert.equal(agent.health, 30, 'open-air blast is blocked; collapse applies exact core damage once');
  assert.ok(changes.length >= 2);
  assert.ok(changes.at(-1).collisionSnapshot.records.every(record => record.sectionId === 'rubble'));
  combat.dispose();
});

test('building impact telemetry and callbacks expose renderer-neutral section results', () => {
  const buildingSystem = createBuildingSystem();
  const changes = [];
  const combat = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    buildingSystem,
    getUnits: () => [],
    onBuildingChanged: change => changes.push(change),
    vfxProvider: TEST_VFX_PROVIDER
  });
  const weapon = {
    ...getWeapon('SA35_AP'),
    id: 'TEST_TELEMETRY_AP',
    muzzleVelocity: 1000,
    penetrationMmAt100m: 1000
  };
  const projectile = createProjectile({ weapon, x: 1.45, speed: 1000 });
  const impact = combat.ballistics.detectImpact(projectile);
  combat.resolveImpact(projectile, impact);

  assert.equal(combat.telemetry.buildingHits, 1);
  assert.equal(combat.telemetry.impacts[0].kind, 'building');
  assert.equal(combat.telemetry.impacts[0].targetId, 'house-1');
  assert.equal(combat.telemetry.impacts[0].sectionId, 'ground-shell');
  assert.equal(combat.telemetry.impacts[0].colliderPartId, 'ground-right-inner');
  assert.equal(combat.telemetry.impacts[0].buildingResult.result.breached, true);
  assert.equal(changes.length, 1);
  assert.doesNotThrow(() => JSON.stringify(combat.captureState()));
  combat.dispose();
});

test('building projectile outcome is deterministic across capture and restore', () => {
  const buildingSystem = createBuildingSystem();
  const ballistics = new BallisticsSystem({ buildingSystem, getUnits: () => [] });
  const weapon = {
    ...getWeapon('SA35_AP'),
    id: 'TEST_ROLLBACK_AP',
    muzzleVelocity: 1000,
    penetrationMmAt100m: 1000
  };
  const saved = buildingSystem.captureState();
  const run = () => {
    const projectile = createProjectile({ weapon, x: -1.45, speed: 1000 });
    const impact = ballistics.detectImpact(projectile);
    const result = ballistics.resolveBuildingImpact(projectile, impact);
    return {
      result,
      state: buildingSystem.captureState(),
      collision: buildingSystem.getCollisionSnapshot('house-1')
    };
  };

  assert.ok(calculateBuildingProjectileDamage(weapon, 1000) <= 480);
  const first = run();
  buildingSystem.restoreState(saved);
  const replay = run();
  assert.deepEqual(replay, first);
});
