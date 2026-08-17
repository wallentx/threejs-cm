import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';

function makeVehicle(id, faction, vehicleId) {
  return new Unit({
    id,
    faction,
    type: 'vehicle',
    vehicleId,
    position: new THREE.Vector3()
  });
}

function softTarget(id = 'target') {
  const soldier = {
    id: `${id}-soldier`,
    health: 100,
    stance: 'STANDING',
    position: new THREE.Vector3(20, 0, 0)
  };
  return {
    id,
    type: 'infantry_squad',
    position: soldier.position,
    soldierAI: { getLivingAgents: () => [soldier] },
    isCombatEffective: () => true
  };
}

function aimMount(unit, target, mountId, mountAmmoTypes = {}) {
  unit.targetUnit = target;
  unit.targetPos = target.position.clone();
  unit.targetMode = mountId === 'hull_main' ? 'TARGET_HULL_HE' : 'TARGET_MG';
  unit.updateVehicleMountedWeaponCombat(
    { combat: { fireWeapon: () => false } },
    {
      target,
      mountIds: [mountId],
      mountAmmoTypes,
      targetMoving: false,
      shooterMoving: false,
      allowPointTarget: true,
      deltaSeconds: 0.1,
      occupiedCrewRoles: []
    }
  );
  return unit.vehicleMounts[mountId];
}

test('alignment status distinguishes turret traverse, whole-hull slew, and fixed out-of-arc mounts', () => {
  const target = softTarget();

  const panzerTurret = makeVehicle('panzer-turret', 'german', 'PANZER_III_D');
  const turretState = aimMount(panzerTurret, target, 'coax');
  assert.equal(turretState.fireControl.phase, 'TRAVERSING');
  assert.equal(turretState.fireState, 'TRAVERSING');
  assert.equal(panzerTurret.rotation, 0);

  const panzerHull = makeVehicle('panzer-hull', 'german', 'PANZER_III_D');
  const fixedState = aimMount(panzerHull, target, 'hull_mg');
  assert.equal(fixedState.fireControl.phase, 'OUT OF ARC');
  assert.equal(fixedState.fireState, 'OUT OF ARC');
  assert.equal(panzerHull.rotation, 0);

  const char = makeVehicle('char', 'french', 'CHAR_B1_BIS');
  const hullState = aimMount(char, target, 'hull_main', { hull_main: 'he' });
  assert.equal(hullState.fireControl.phase, 'SLEWING');
  assert.equal(hullState.fireState, 'SLEWING');
  assert.ok(Math.abs(char.rotation - 0.007) < 1e-12);
  assert.equal(char.mesh.rotation.y, char.rotation);
});

test('main-gun traverse accumulates at the authored rate and reports exact interruption causes', () => {
  const panzer = makeVehicle('panzer', 'german', 'PANZER_III_D');
  const target = softTarget();
  panzer.targetUnit = target;
  panzer.targetPos = target.position.clone();
  panzer.targetMode = 'TARGET_AP';
  const initialYaw = panzer.vehicleWeapon.turretYaw;
  panzer.updateVehicleCombat(0.25, {
    target,
    targetMoving: false,
    shooterMoving: false,
    combat: { fireWeapon: () => false }
  });
  const expectedYaw = panzer.vehicleSpec.turretTraverseRadPerSecond * 0.25;
  assert.ok(Math.abs(panzer.vehicleWeapon.turretYaw - (initialYaw + expectedYaw)) < 1e-12);
  assert.equal(panzer.mesh.userData.turret.rotation.y, panzer.vehicleWeapon.turretYaw);
  assert.equal(panzer.vehicleWeapon.fireControl.phase, 'TRAVERSING');

  panzer.vehicleComponents.main_gun.operational = false;
  assert.equal(panzer.getVehicleMainGunBlockedPhase({
    remainingTurretYawError: 1,
    shooterMoving: false,
    mainGunnerDelta: 0.1
  }), 'GUN DISABLED');
  panzer.vehicleComponents.main_gun.operational = true;
  panzer.vehicleComponents.turret_traverse.operational = false;
  assert.equal(panzer.getVehicleMainGunBlockedPhase({
    remainingTurretYawError: 1,
    shooterMoving: false,
    mainGunnerDelta: 0.1
  }), 'TRAVERSE DISABLED');
  panzer.vehicleComponents.turret_traverse.operational = true;

  const gunner = panzer.roster.find(crewman =>
    panzer.vehicleSpec.gunnerRoles.includes(crewman.role));
  gunner.health = 0;
  gunner.status = 'KIA';
  assert.equal(panzer.getVehicleMainGunBlockedPhase({
    remainingTurretYawError: 1,
    shooterMoving: false,
    mainGunnerDelta: 0.1
  }), 'NO GUNNER');
  gunner.health = 100;
  gunner.status = 'OK';
  assert.equal(panzer.getVehicleMainGunBlockedPhase({
    remainingTurretYawError: 1,
    shooterMoving: true,
    mainGunnerDelta: 0.1
  }), 'MOVING');
  assert.equal(panzer.getVehicleMainGunBlockedPhase({
    remainingTurretYawError: 1,
    shooterMoving: false,
    mainGunnerDelta: 0
  }), 'CREW BUSY');
});
