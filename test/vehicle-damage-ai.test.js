import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { evaluateVehicleDamageBehavior } from '../src/simulation/vehicles/VehicleDamageBehavior.js';
import { VehicleAI } from '../src/game/VehicleAI.js';
import { Unit } from './helpers/France1940TestUnit.js';

function createRealVehicleUnit(vehicleId = 'SOMUA_S35', overrides = {}) {
  const unit = new Unit({
    id: overrides.id ?? 'vehicle_1',
    type: 'vehicle',
    vehicleId,
    faction: 'french',
    position: overrides.position ?? new THREE.Vector3(0, 0, 0),
    rotation: overrides.rotation ?? 0,
    ...overrides
  });
  return unit;
}

test('evaluateVehicleDamageBehavior reads authoritative vehicle components and crew role status', () => {
  const unit = createRealVehicleUnit('SOMUA_S35');
  const behavior = evaluateVehicleDamageBehavior(unit);

  assert.equal(behavior.reason, 'operational');
  assert.equal(behavior.isDestroyed, false);
  assert.equal(behavior.isBurning, false);
  assert.equal(behavior.mobilityDisabled, false);
  assert.equal(behavior.driverAvailable, true);
  assert.equal(behavior.gunnerAvailable, true);
  assert.ok(behavior.activeMountsCount >= 1, 'Operational SOMUA must have active weapon mounts');
});

test('immobilization enters pillbox mode while surviving main and coaxial mounts remain functional', () => {
  const unit = createRealVehicleUnit('SOMUA_S35');

  // Damage tracks (immobilized)
  unit.vehicleComponents.tracks.health = 0;
  unit.vehicleComponents.tracks.operational = false;

  const behavior = evaluateVehicleDamageBehavior(unit);
  assert.equal(behavior.isPillbox, true);
  assert.equal(behavior.mobilityDisabled, true);
  assert.equal(behavior.isDestroyed, false, 'Immobilization must not destroy the vehicle');
  assert.ok(behavior.activeMountsCount >= 1, 'Immobilized tank must keep operational weapon mounts');

  unit.vehicleAI.update(1.0);
  assert.equal(unit.tacticalDecision.isPillbox, true);
});

test('disabled main gun does not destroy vehicle or disable coaxial machine gun', () => {
  const unit = createRealVehicleUnit('SOMUA_S35');

  // Disable main gun component
  unit.vehicleComponents.main_gun.health = 0;
  unit.vehicleComponents.main_gun.operational = false;

  const behavior = evaluateVehicleDamageBehavior(unit);
  assert.equal(behavior.mainGunDisabled, true);
  assert.equal(behavior.isDestroyed, false, 'Disabled main gun must not destroy the vehicle');
  assert.equal(behavior.reason, 'main-gun-disabled');
  assert.equal(behavior.gunnerAvailable, true, 'Main-gun damage must not kill the gunner role');
  assert.ok(behavior.activeMountsCount >= 1, 'Auxiliary/coaxial mounts must remain active when main gun fails');

  const initialTurretYaw = unit.vehicleWeapon.turretYaw;
  unit.vehicleAI.update(1, null, {
    contacts: [{ id: 'enemy_tank', type: 'tank', position: [10, 0, 0] }]
  });
  assert.ok(
    unit.vehicleWeapon.turretYaw > initialTurretYaw,
    'Living gunner must still traverse a surviving coaxial mount'
  );
});

test('authoritative burning state abandons combat intent and clears active mounts', () => {
  const unit = createRealVehicleUnit('SOMUA_S35');
  const target = createRealVehicleUnit('PANZER_III_D', {
    id: 'enemy',
    faction: 'german',
    position: new THREE.Vector3(20, 0, 0)
  });
  unit.targetUnit = target;
  unit.targetPos = target.position.clone();
  unit.vehicleWeapon.isFiring = true;
  unit.vehicleWeapon.targetUnitId = target.id;
  unit.vehicleWeapon.targetPos = target.position.toArray();
  for (const state of Object.values(unit.vehicleMounts)) {
    state.isFiring = true;
    state.targetUnitId = target.id;
    state.targetPos = target.position.toArray();
  }

  unit.vehicleDamageState.burning = true;

  const behavior = evaluateVehicleDamageBehavior(unit);
  assert.equal(behavior.isBurning, true);
  assert.equal(behavior.reason, 'vehicle-burning-abandoned');
  assert.equal(behavior.activeMountsCount, 0, 'Burning vehicle must abandon all active weapon mounts');

  const hullYaw = unit.rotation;
  const turretYaw = unit.vehicleWeapon.turretYaw;
  unit.vehicleAI.update(1.0, null, {
    contacts: [{ id: target.id, type: 'tank', position: [20, 0, 0] }]
  });
  assert.equal(unit.tacticalDecision.isBurning, true);
  assert.equal(unit.rotation, hullYaw);
  assert.equal(unit.vehicleWeapon.turretYaw, turretYaw);
  assert.equal(unit.updateVehicleCombat(1, { target }), false);
  assert.equal(unit.targetUnit, null);
  assert.equal(unit.targetPos, null);
  for (const state of new Set([
    unit.vehicleWeapon,
    ...Object.values(unit.vehicleMounts)
  ])) {
    assert.equal(state.isFiring, false);
    assert.equal(state.targetUnitId, null);
    assert.equal(state.targetPos, null);
    assert.equal(state.fireState, 'VEHICLE_BURNING');
  }
});

test('burning vehicle with intact mobility cannot continue a queued waypoint', () => {
  const unit = createRealVehicleUnit('SOMUA_S35', {
    position: new THREE.Vector3(0, 0, 0)
  });
  unit.addWaypoint(new THREE.Vector3(0, 0, 20), 'MOVE');
  unit.vehicleDamageState.burning = true;
  const before = unit.position.clone();

  unit.update(1, { getHeightAt: () => 0 });

  assert.deepEqual(unit.position.toArray(), before.toArray());
  assert.equal(unit.currentWaypointIndex, 0);
  assert.equal(unit.getVehicleMovementFactor(), 0);
});

test('VehicleAI capture and restore preserve damage behavior decision fields', () => {
  const unit = createRealVehicleUnit('SOMUA_S35');
  unit.vehicleComponents.engine.health = 0;
  unit.vehicleComponents.engine.operational = false;

  unit.vehicleAI.update(1.0);
  const state = unit.captureState();

  const restoredUnit = createRealVehicleUnit('SOMUA_S35');
  restoredUnit.restoreState(state);

  assert.equal(restoredUnit.tacticalDecision.isPillbox, true);
  assert.equal(restoredUnit.tacticalDecision.reason, 'pillbox-mode');
});
