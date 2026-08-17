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

const FLAT_TERRAIN = Object.freeze({
  getHeightAt() { return 0; },
  getMovementHeightAt() { return 0; }
});

function recordIncomingCannonFire(unit, overrides = {}) {
  return unit.recordIncomingVehicleFire({
    sourceUnitId: overrides.sourceUnitId ?? 'enemy-armor',
    sourcePosition: overrides.sourcePosition ?? [0, 0, 30],
    impactPosition: overrides.impactPosition ?? [0, 1.2, 1.8],
    weaponId: overrides.weaponId ?? 'KWK30_AP',
    threatKind: overrides.threatKind ?? 'cannon_ap',
    penetrated: overrides.penetrated ?? false
  });
}

function armoredContact(overrides = {}) {
  return {
    id: overrides.id ?? 'enemy-armor',
    type: 'vehicle',
    threatClass: 'armor',
    protectionClass: 'armored_enclosed',
    position: overrides.position ?? [0, 0, 30]
  };
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

test('a player advance remains authoritative after unidentified incoming fire', () => {
  const unit = createRealVehicleUnit('SOMUA_S35');
  const before = unit.position.clone();
  const playerDestination = new THREE.Vector3(0, 0, 40);
  unit.addWaypoint(playerDestination, 'MOVE');
  recordIncomingCannonFire(unit);

  unit.update(1, FLAT_TERRAIN, { contacts: [] });

  assert.equal(unit.tacticalDecision.responsePhase, 'ENGAGE');
  assert.equal(unit.tacticalDecision.responseReason, 'player-movement-order');
  assert.match(unit.tacticalDecision.decisionCrewRole, /COMMANDER/);
  assert.equal(unit.vehicleCrewBailout.triggered, false);
  assert.ok(unit.position.z > before.z, 'the player waypoint must keep moving forward');
  assert.equal(unit.vehicleAI.isReversing, false);
  assert.equal(unit.waypoints.length, 1);
  assert.deepEqual(unit.waypoints[0].position.toArray(), playerDestination.toArray());
  assert.equal(unit.currentWaypointIndex, 0);

  const captured = unit.captureState();
  const restored = createRealVehicleUnit('SOMUA_S35');
  restored.restoreState(captured, new Map([[restored.id, restored]]));
  assert.deepEqual(
    restored.vehicleAI.captureState().threatResponse,
    unit.vehicleAI.captureState().threatResponse
  );
});

test('unidentified fire escalates to reverse only after a repeated impact', () => {
  const unit = createRealVehicleUnit('SOMUA_S35');
  recordIncomingCannonFire(unit);

  unit.update(1, FLAT_TERRAIN, { contacts: [] });

  assert.equal(unit.tacticalDecision.responsePhase, 'ENGAGE');
  assert.equal(unit.tacticalDecision.responseReason, 'unidentified-fire-observed');
  assert.deepEqual(unit.position.toArray(), [0, 0, 0]);

  recordIncomingCannonFire(unit, { impactPosition: [0.2, 1.3, 1.6] });
  unit.update(1, FLAT_TERRAIN, { contacts: [] });

  assert.equal(unit.tacticalDecision.responsePhase, 'REVERSE');
  assert.equal(unit.tacticalDecision.responseReason, 'source-unidentified');
  assert.ok(unit.position.z < 0, 'repeated unresolved fire must create a reverse intent');
});

test('an identified armored threat forces disengagement when the main gun cannot answer', () => {
  for (const failure of ['main-gun-disabled', 'main-ammunition-exhausted']) {
    const unit = createRealVehicleUnit('SOMUA_S35', { id: failure });
    if (failure === 'main-gun-disabled') {
      unit.vehicleComponents.main_gun.health = 0;
      unit.vehicleComponents.main_gun.operational = false;
    } else {
      unit.vehicleWeapon.feedAmmo = 0;
      unit.vehicleWeapon.ammunition = { ap: 0, he: 0 };
    }
    recordIncomingCannonFire(unit);

    unit.update(1, FLAT_TERRAIN, { contacts: [armoredContact()] });

    assert.equal(unit.tacticalDecision.responsePhase, 'DISENGAGE', failure);
    assert.equal(unit.tacticalDecision.responseReason, failure, failure);
    assert.equal(unit.vehicleCrewBailout.triggered, false, failure);
    assert.ok(unit.position.z < 0, `${failure} must produce real reverse movement`);
  }
});

test('repeated identified fire creates pressure reverse without treating it as fear', () => {
  const unit = createRealVehicleUnit('SOMUA_S35');
  recordIncomingCannonFire(unit);
  recordIncomingCannonFire(unit, { impactPosition: [0.2, 1.3, 1.6] });

  unit.update(1, FLAT_TERRAIN, { contacts: [armoredContact()] });

  assert.equal(unit.tacticalDecision.responsePhase, 'REVERSE');
  assert.equal(unit.tacticalDecision.responseReason, 'sustained-fire-pressure');
  assert.equal(unit.vehicleCrewBailout.triggered, false);
});

test('a surviving coax keeps an identified infantry threat answerable', () => {
  const unit = createRealVehicleUnit('SOMUA_S35');
  unit.vehicleComponents.main_gun.health = 0;
  unit.vehicleComponents.main_gun.operational = false;
  recordIncomingCannonFire(unit, { sourceUnitId: 'enemy-infantry' });

  unit.vehicleAI.update(1 / 30, FLAT_TERRAIN, {
    contacts: [{
      id: 'enemy-infantry',
      type: 'infantry_squad',
      threatClass: 'infantry',
      protectionClass: null,
      position: [0, 0, 30]
    }]
  });

  assert.equal(unit.tacticalDecision.responsePhase, 'ENGAGE');
  assert.equal(unit.tacticalDecision.responseReason, 'threat-answerable');
  assert.equal(unit.vehicleCrewBailout.triggered, false);
});

test('immobilization under effective fire triggers bailout but safe immobilization does not', () => {
  const threatened = createRealVehicleUnit('SOMUA_S35', { id: 'threatened' });
  threatened.vehicleComponents.tracks.health = 0;
  threatened.vehicleComponents.tracks.operational = false;
  recordIncomingCannonFire(threatened);
  threatened.update(1 / 30, FLAT_TERRAIN, {
    contacts: [armoredContact()]
  });

  assert.equal(threatened.tacticalDecision.responsePhase, 'BAILOUT');
  assert.equal(threatened.tacticalDecision.responseReason, 'mobility-disabled-under-fire');
  assert.equal(threatened.vehicleCrewBailout.triggered, true);
  assert.equal(threatened.vehicleCrewBailout.reason, 'TACTICAL_IMMOBILIZATION');

  const safe = createRealVehicleUnit('SOMUA_S35', { id: 'safe' });
  safe.vehicleComponents.engine.health = 0;
  safe.vehicleComponents.engine.operational = false;
  safe.update(10, FLAT_TERRAIN, { contacts: [] });

  assert.equal(safe.vehicleCrewBailout.triggered, false);
  assert.equal(safe.getMountedCrew().length, safe.getLivingCrew().length);
});

test('vehicle threat-response time is frame-partition invariant and deeply restored', () => {
  const whole = createRealVehicleUnit('SOMUA_S35', { id: 'whole' });
  const partitioned = createRealVehicleUnit('SOMUA_S35', { id: 'partitioned' });
  recordIncomingCannonFire(whole);
  recordIncomingCannonFire(partitioned);

  whole.vehicleAI.update(2, FLAT_TERRAIN, { contacts: [] });
  for (let step = 0; step < 20; step++) {
    partitioned.vehicleAI.update(0.1, FLAT_TERRAIN, { contacts: [] });
  }

  const wholeResponse = whole.vehicleAI.captureState().threatResponse;
  const partitionedResponse = partitioned.vehicleAI.captureState().threatResponse;
  assert.deepEqual(partitionedResponse, wholeResponse);

  const saved = whole.captureState();
  saved.vehicleAI.threatResponse.sourcePosition[0] = 999;
  assert.notEqual(
    whole.vehicleAI.captureState().threatResponse.sourcePosition[0],
    999,
    'captured response positions must not alias authoritative state'
  );
});
