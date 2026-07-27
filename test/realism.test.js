import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { WEAPONS } from '../src/game/WeaponCatalog.js';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import { BallisticsSystem, resolveArmorPenetration } from '../src/game/BallisticsSystem.js';
import { CombatSystem } from '../src/game/CombatSystem.js';

const flatTerrain = { getHeightAt: () => 0 };
const sound = {
  playGunshot() {},
  playCannon() {},
  playExplosion() {}
};

test('weapon catalog owns real cadence, caliber, magazine, reload, and carried ammunition', () => {
  assert.deepEqual(
    {
      cartridge: WEAPONS.MAS36.cartridge,
      caliber: WEAPONS.MAS36.caliberMm,
      magazine: WEAPONS.MAS36.magazineSize,
      rpm: WEAPONS.MAS36.practicalRPM,
      carried: WEAPONS.MAS36.carriedAmmo
    },
    {
      cartridge: '7.5x54mm French',
      caliber: 7.5,
      magazine: 5,
      rpm: 15,
      carried: 60
    }
  );
  assert.equal(WEAPONS.FM2429.cyclicRPM, 450);
  assert.equal(WEAPONS.MG34.magazineSize, 50);
  assert.equal(WEAPONS.SA35_AP.muzzleVelocity, 660);
});

test('individual soldier consumes own magazine and dead soldier cannot fire', () => {
  const attacker = new Unit({
    id: 'individual_fire',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 0)
  });
  const target = new Unit({
    id: 'individual_target',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 20)
  });
  const agent = attacker.soldierAI.agents[0];
  agent.state = 'READY';
  agent.fireCooldown = 0;
  agent.magazineAmmo = 2;
  agent.reserveAmmo = 0;
  let shots = 0;
  const context = {
    opposingUnits: [target],
    spotting: { checkLOS: (from, to) => ({ clear: true, dist: from.distanceTo(to) }) },
    combat: { fireWeapon: () => { shots++; return true; } },
    random: () => 0.34
  };

  assert.equal(agent.updateCombat(0.1, context), true);
  assert.equal(agent.magazineAmmo, 1);
  assert.equal(agent.roundsFired, 1);
  assert.equal(shots, 1);

  agent.applyDamage(200);
  agent.fireCooldown = 0;
  assert.equal(agent.updateCombat(1, context), false);
  assert.equal(shots, 1);
});

test('individual fire requires a stationary shooter, LOS, range, aperture permission, and an accepted projectile', () => {
  const attacker = new Unit({
    id: 'guarded_fire',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const target = new Unit({
    id: 'guarded_target',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 20)
  });
  const agent = attacker.soldierAI.agents[0];
  agent.magazineAmmo = 2;
  agent.reserveAmmo = 0;
  let losClear = true;
  let apertureClear = true;
  let acceptsShot = true;
  let calls = 0;
  const context = {
    opposingUnits: [target],
    spotting: {
      checkLOS(from, to) {
        return { clear: losClear, dist: from.distanceTo(to) };
      }
    },
    buildingInteraction: { canFireAt: () => apertureClear },
    combat: {
      fireWeapon() {
        calls++;
        return acceptsShot;
      }
    }
  };

  agent.state = 'MOVING';
  agent.fireCooldown = 0;
  assert.equal(agent.updateCombat(0.1, context), false);

  agent.state = 'READY';
  agent.fireCooldown = 0;
  losClear = false;
  assert.equal(agent.updateCombat(0.1, context), false);

  losClear = true;
  target.soldierAI.agents.forEach(enemy => enemy.position.z = WEAPONS.MAS36.maxRange + 10);
  assert.equal(agent.updateCombat(0.1, context), false);

  target.soldierAI.agents.forEach(enemy => enemy.position.z = 20);
  apertureClear = false;
  assert.equal(agent.updateCombat(0.1, context), false);

  apertureClear = true;
  acceptsShot = false;
  const ammoBefore = agent.magazineAmmo;
  const roundsBefore = agent.roundsFired;
  assert.equal(agent.updateCombat(0.1, context), false);
  assert.equal(calls, 1);
  assert.equal(agent.magazineAmmo, ammoBefore);
  assert.equal(agent.roundsFired, roundsBefore);
});

test('legacy soldier snapshots restore catalog ammunition defaults', () => {
  const unit = new Unit({
    id: 'legacy_ammo_restore',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[0];
  const snapshot = agent.capture();
  delete snapshot.magazineAmmo;
  delete snapshot.reserveAmmo;
  agent.magazineAmmo = 0;
  agent.reserveAmmo = 0;
  agent.restore(snapshot);
  const weapon = WEAPONS[agent.weaponId];
  assert.equal(agent.magazineAmmo, weapon.magazineSize);
  assert.equal(agent.reserveAmmo, weapon.carriedAmmo - weapon.magazineSize);
});

test('automatic infantry cadence is invariant across simulation step sizes', () => {
  const runCadence = steps => {
    const attacker = new Unit({
      id: 'infantry_cadence',
      faction: 'german',
      type: 'infantry_squad',
      position: new THREE.Vector3()
    });
    const target = new Unit({
      id: 'infantry_cadence_target',
      faction: 'french',
      type: 'infantry_squad',
      position: new THREE.Vector3(0, 0, 20)
    });
    const agent = attacker.soldierAI.agents.find(candidate => candidate.weaponId === 'MG34');
    assert.ok(agent);
    agent.fireCooldown = 0;
    agent.magazineAmmo = WEAPONS.MG34.magazineSize;
    agent.reserveAmmo = WEAPONS.MG34.carriedAmmo;
    agent.state = 'READY';
    let shots = 0;
    const combatContext = {
      opposingUnits: [target],
      spotting: {
        checkLOS(from, to) {
          return { clear: true, dist: from.distanceTo(to) };
        }
      },
      combat: { fireWeapon: () => { shots++; return true; } }
    };
    const movementContext = {
      goal: agent.position.clone(),
      neighbors: attacker.soldierAI.agents,
      anchorMoving: false,
      orderType: 'QUICK',
      squadPinned: false,
      waypointIndex: 0
    };

    for (const delta of steps) {
      agent.updateMovement(delta, flatTerrain, movementContext);
      agent.updateCombat(delta, combatContext);
    }
    return {
      shots,
      roundsFired: agent.roundsFired,
      magazineAmmo: agent.magazineAmmo,
      fireCooldown: agent.fireCooldown
    };
  };

  const at10Fps = runCadence(Array.from({ length: 11 }, () => 1 / 10));
  const at30Fps = runCadence(Array.from({ length: 33 }, () => 1 / 30));
  const at60Fps = runCadence(Array.from({ length: 66 }, () => 1 / 60));
  const accelerated = runCadence([0.3, 0.4, 0.4]);

  for (const result of [at30Fps, at60Fps, accelerated]) {
    assert.equal(result.shots, at10Fps.shots);
    assert.equal(result.roundsFired, at10Fps.roundsFired);
    assert.equal(result.magazineAmmo, at10Fps.magazineAmmo);
    assert.ok(Math.abs(result.fireCooldown - at10Fps.fireCooldown) < 1e-6);
  }
});

test('soldier reload time transfers only carried reserve ammunition', () => {
  const unit = new Unit({
    id: 'reload_test',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[0];
  agent.magazineAmmo = 0;
  agent.reserveAmmo = 3;
  assert.equal(agent.startReload(), true);
  assert.equal(agent.reloadTimer, WEAPONS.KAR98K.reloadSeconds);
  agent.reloadTimer = 0.05;
  agent.updateMovement(0.1, flatTerrain, {
    goal: agent.position.clone(),
    neighbors: unit.soldierAI.agents,
    anchorMoving: false,
    orderType: 'QUICK',
    squadPinned: false,
    waypointIndex: 0
  });
  assert.equal(agent.magazineAmmo, 3);
  assert.equal(agent.reserveAmmo, 0);
  assert.equal(agent.reloadTimer, 0);
});

test('ballistics applies gravity and armor slope instead of magic hit damage', () => {
  const ballistics = new BallisticsSystem();
  const projectile = {
    previousPosition: new THREE.Vector3(),
    position: new THREE.Vector3(0, 10, 0),
    velocity: new THREE.Vector3(100, 0, 0),
    weapon: { dragPerSecond: 0 },
    distanceTravelled: 0,
    lifetime: 0
  };
  ballistics.integrate(projectile, 1);
  assert.ok(projectile.position.y < 1);
  assert.equal(resolveArmorPenetration(WEAPONS.KAR98K, 760, 14.5, 1).penetrated, false);
  assert.equal(resolveArmorPenetration(WEAPONS.SA35_AP, 660, 30, 1).penetrated, true);
  assert.equal(resolveArmorPenetration(WEAPONS.SA35_AP, 660, 30, 0.5).penetrated, false);
});

test('vehicle crew layout controls gun, reload, and movement roles', () => {
  const somua = new Unit({
    id: 'crew_s35',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3()
  });
  const panzer = new Unit({
    id: 'crew_pz3',
    faction: 'german',
    type: 'tank',
    position: new THREE.Vector3()
  });
  assert.equal(somua.roster.length, VEHICLES.SOMUA_S35.crew.length);
  assert.equal(panzer.roster.length, VEHICLES.PANZER_III_D.crew.length);
  assert.equal(somua.roster.length, 3);
  assert.equal(panzer.roster.length, 5);

  const somuaGunner = somua.roster.find(crewman => crewman.role === 'COMMANDER_GUNNER');
  somuaGunner.health = 0;
  somuaGunner.status = 'KIA';
  assert.equal(somua.canVehicleFire(), false);
  assert.equal(somua.beginVehicleReload('ap'), false);

  const panzerLoader = panzer.roster.find(crewman => crewman.role === 'LOADER');
  panzerLoader.health = 0;
  panzerLoader.status = 'KIA';
  assert.equal(panzer.canVehicleFire(), true);
  panzer.vehicleWeapon.loadedType = null;
  assert.equal(panzer.beginVehicleReload('ap'), false);

  const driver = panzer.roster.find(crewman => crewman.role === 'DRIVER');
  driver.health = 0;
  driver.status = 'KIA';
  panzer.addWaypoint(new THREE.Vector3(0, 0, 20), 'FAST');
  const before = panzer.position.clone();
  panzer.update(1, flatTerrain);
  assert.ok(panzer.position.equals(before));
});

test('vehicle main gun fires loaded round from modeled muzzle then begins crewed reload', () => {
  const somua = new Unit({
    id: 'vehicle_fire_s35',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3(0, 0, 0)
  });
  const panzer = new Unit({
    id: 'vehicle_target_pz3',
    faction: 'german',
    type: 'tank',
    position: new THREE.Vector3(0, 0, 100)
  });
  let shot = null;
  const fired = somua.updateVehicleCombat(0.1, {
    target: panzer,
    combat: {
      fireWeapon(attacker, target, position, options) {
        shot = { attacker, target, position, options };
        return true;
      }
    }
  });
  assert.equal(fired, true);
  assert.equal(shot.options.weapon.id, 'SA35_AP');
  assert.ok(shot.options.muzzlePosition.distanceTo(somua.getMuzzleWorldPosition()) < 1e-9);
  assert.equal(somua.vehicleWeapon.loadedType, null);
  assert.equal(somua.vehicleWeapon.roundsFired, 1);
  assert.equal(somua.vehicleWeapon.reloadTimer, WEAPONS.SA35_AP.reloadSeconds);
});

test('penetrating turret hit can remove gunner and disable vehicle gun', () => {
  const panzer = new Unit({
    id: 'penetration_pz3',
    faction: 'german',
    type: 'tank',
    position: new THREE.Vector3()
  });
  const result = panzer.applyArmorHit({
    penetrated: true,
    zone: 'turret_front',
    residualRatio: 2,
    weapon: WEAPONS.SA35_AP,
    random: () => 0.34
  });
  assert.equal(result.casualty.role, 'GUNNER');
  assert.equal(result.casualty.status, 'KIA');
  assert.equal(panzer.canVehicleFire(), false);
});

test('projectile starts at visible soldier muzzle and resolves swept hit', () => {
  const attacker = new Unit({
    id: 'muzzle_attacker',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 0)
  });
  const target = new Unit({
    id: 'muzzle_target',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 18)
  });
  const shooter = attacker.soldierAI.agents[0];
  const victim = target.soldierAI.agents[0];
  const scene = new THREE.Scene();
  scene.add(attacker.mesh, target.mesh);
  const combat = new CombatSystem(scene, sound, () => 0, {
    getUnits: () => [attacker, target]
  });
  const muzzle = shooter.getMuzzleWorldPosition();
  assert.equal(combat.fireWeapon(attacker, target, victim.position, {
    shooter,
    targetSoldier: victim,
    weapon: WEAPONS.MAS36,
    muzzlePosition: muzzle,
    dispersionScale: 0
  }), true);
  assert.ok(combat.projectiles[0].position.distanceTo(muzzle) < 1e-9);
  for (let step = 0; step < 30 && combat.projectiles.length > 0; step++) combat.update(1 / 60);
  assert.ok(victim.health < 100);
  assert.equal(combat.telemetry.infantryHits, 1);
  assert.equal(combat.telemetry.impacts.length, 1);
  assert.equal(combat.telemetry.impacts[0].kind, 'infantry');
  assert.equal(combat.telemetry.impacts[0].targetSoldierId, victim.id);
  assert.equal(combat.telemetry.impacts[0].penetrated, null);
});

test('distance LOD switches between authored geometry and low proxy', () => {
  const unit = new Unit({
    id: 'lod_s35',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3()
  });
  unit.updateLOD(new THREE.Vector3(0, 5, 300), 'high');
  let proxyVisible = false;
  let coreVisible = false;
  unit.mesh.traverse(object => {
    if (object.userData.lodBand === 'proxy' && object.visible) proxyVisible = true;
    if (object.userData.lodBand === 'core' && object.visible) coreVisible = true;
  });
  assert.equal(proxyVisible, true);
  assert.equal(coreVisible, false);

  unit.updateLOD(new THREE.Vector3(0, 5, 10), 'high');
  proxyVisible = false;
  coreVisible = false;
  unit.mesh.traverse(object => {
    if (object.userData.lodBand === 'proxy' && object.visible) proxyVisible = true;
    if (object.userData.lodBand === 'core' && object.visible) coreVisible = true;
  });
  assert.equal(proxyVisible, false);
  assert.equal(coreVisible, true);
});

test('infantry LOD never overlaps near geometry with far proxies', () => {
  for (const faction of ['french', 'german']) {
    const unit = new Unit({
      id: `lod_${faction}`,
      faction,
      type: 'infantry_squad',
      position: new THREE.Vector3()
    });
    const countVisible = (band) => {
      let count = 0;
      unit.mesh.traverse(object => {
        if (object.isMesh && object.userData.lodBand === band && object.visible) count++;
      });
      return count;
    };
    const countVisibleNonProxy = () => {
      let count = 0;
      unit.mesh.traverse(object => {
        if (object.isMesh && object.userData.lodBand !== 'proxy'
          && object.userData.lodBand !== 'ui' && object.visible) count++;
      });
      return count;
    };

    assert.equal(countVisible('proxy'), 0);
    unit.updateLOD(new THREE.Vector3(0, 2, 5), 'high');
    assert.equal(unit.currentLOD, 'high');
    assert.equal(countVisible('proxy'), 0);
    assert.ok(countVisible('high') > 0);

    unit.updateLOD(new THREE.Vector3(0, 2, 75), 'high');
    assert.equal(unit.currentLOD, 'medium');
    assert.equal(countVisible('proxy'), 0);
    assert.equal(countVisible('high'), 0);
    assert.ok(countVisibleNonProxy() > 0);

    unit.updateLOD(new THREE.Vector3(0, 2, 100), 'high');
    assert.equal(unit.currentLOD, 'core');
    assert.equal(countVisible('proxy'), 0);
    assert.equal(countVisible('high'), 0);
    assert.equal(countVisible('medium'), 0);
    assert.ok(countVisible('core') > 0);

    unit.updateLOD(new THREE.Vector3(0, 2, 180), 'high');
    assert.equal(unit.currentLOD, 'low');
    assert.ok(countVisible('proxy') > 0);
    assert.equal(countVisibleNonProxy(), 0);
  }
});

test('new move after completed path starts a clean order queue', () => {
  const unit = new Unit({
    id: 'turn_two_orders',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  unit.addWaypoint(new THREE.Vector3(5, 0, 0), 'QUICK');
  unit.currentWaypointIndex = 1;
  unit.addWaypoint(new THREE.Vector3(10, 0, 0), 'HUNT');
  assert.equal(unit.currentWaypointIndex, 0);
  assert.equal(unit.waypoints.length, 1);
  assert.equal(unit.waypoints[0].orderType, 'HUNT');
  assert.deepEqual(unit.waypoints[0].position.toArray(), [10, 0, 0]);
});

test('inspectable shot telemetry records detailed impact fields', () => {
  const attacker = new Unit({
    id: 'telemetry_attacker',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3(0, 0, 0)
  });
  const target = new Unit({
    id: 'telemetry_target',
    faction: 'german',
    type: 'tank',
    position: new THREE.Vector3(0, 0, 80)
  });
  const scene = new THREE.Scene();
  scene.add(attacker.mesh, target.mesh);
  const combat = new CombatSystem(scene, sound, () => 0.5, {
    getUnits: () => [attacker, target]
  });

  combat.fireWeapon(attacker, target, target.position, {
    weapon: WEAPONS.SA35_AP,
    muzzlePosition: attacker.getMuzzleWorldPosition(),
    dispersionScale: 0
  });

  for (let step = 0; step < 40 && combat.projectiles.length > 0; step++) {
    combat.update(1 / 60);
  }

  assert.ok(combat.telemetry.impacts.length > 0);
  const latest = combat.telemetry.impacts[combat.telemetry.impacts.length - 1];
  assert.equal(latest.weaponId, 'SA35_AP');
  assert.equal(latest.shooterId, 'telemetry_attacker');
  assert.equal(latest.targetId, 'telemetry_target');
  assert.ok(latest.rangeMeters > 0);
  assert.ok(latest.impactSpeed > 0);
  assert.equal(latest.kind, 'vehicle');
  assert.ok(latest.zone !== null);
  assert.ok(latest.impactCosine > 0);
  assert.ok(Number.isFinite(latest.impactAngleDegrees));
  assert.ok(latest.effectiveArmorMm > 0);
  assert.ok(latest.penetrationMm >= 0);
  assert.ok(typeof latest.penetrated === 'boolean');
});

test('shot telemetry distinguishes stopped and penetrating armor records', () => {
  const scene = new THREE.Scene();
  const combat = new CombatSystem(scene, sound, () => 0.5);
  const ballistics = new BallisticsSystem({ random: () => 0.5 });
  const makeTarget = (id, armor) => ({
    id,
    faction: 'german',
    type: 'tank',
    position: new THREE.Vector3(),
    rotation: 0,
    vehicleSpec: {
      armorMm: {
        hull_front: armor,
        hull_rear: armor,
        hull_side: armor,
        turret_front: armor,
        turret_rear: armor,
        turret_side: armor
      }
    },
    applyArmorHit(result) {
      return {
        penetrated: result.penetrated,
        casualty: result.penetrated
          ? { id: 1, name: 'Gunner 1', role: 'GUNNER', status: 'WOUNDED', health: 20 }
          : null,
        damage: { hull: 'OK', turret: result.penetrated ? 'DAMAGED' : 'OK', gun: 'OK' }
      };
    }
  });
  const record = (id, weapon, armor) => {
    const target = makeTarget(`target_${id}`, armor);
    const projectile = {
      id,
      shooterId: 'attacker',
      targetSoldierId: null,
      weapon,
      ammoId: weapon.id,
      muzzlePosition: new THREE.Vector3(0, 1.5, -50),
      position: new THREE.Vector3(0, 1.2, 2),
      previousPosition: new THREE.Vector3(0, 1.2, 1),
      velocity: new THREE.Vector3(0, 0, weapon.muzzleVelocity),
      distanceTravelled: 52,
      lifetime: 0.08
    };
    const hit = {
      kind: 'vehicle',
      unit: target,
      point: new THREE.Vector3(0, 1.2, 2)
    };
    const result = ballistics.resolveVehicleImpact(projectile, hit);
    combat.recordImpact(projectile, hit, result);
    return {
      entry: combat.telemetry.impacts[combat.telemetry.impacts.length - 1],
      sourceDamage: result.crewResult.damage
    };
  };

  const { entry: stopped } = record(1, WEAPONS.KAR98K, 35);
  const { entry: penetrated, sourceDamage } = record(2, WEAPONS.SA35_AP, 10);

  assert.equal(stopped.penetrated, false);
  assert.equal(stopped.crewResult.casualty, null);
  assert.equal(penetrated.penetrated, true);
  assert.equal(penetrated.crewResult.casualty.role, 'GUNNER');
  assert.equal(penetrated.crewResult.damage.turret, 'DAMAGED');
  assert.ok(stopped.impactCosine > 0);
  assert.ok(Number.isFinite(stopped.impactAngleDegrees));

  sourceDamage.turret = 'DESTROYED';
  assert.equal(penetrated.crewResult.damage.turret, 'DAMAGED');

  for (let id = 3; id <= 105; id++) record(id, WEAPONS.KAR98K, 35);
  assert.equal(combat.telemetry.impacts.length, 100);
  assert.equal(combat.telemetry.impacts[0].id, 6);
  assert.equal(combat.telemetry.impacts[99].id, 105);
});
