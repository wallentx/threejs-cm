import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  evaluateVehicleThreatFacing,
  selectPrimaryThreat
} from '../src/simulation/vehicles/VehicleThreatFacing.js';
import { VehicleAI } from '../src/game/VehicleAI.js';
import { GameApp } from '../src/app/GameApp.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { FRANCE_1940_FORMATIONS } from '../src/content/france1940/formations.js';
import { FRANCE_1940_CATALOG_PORTS } from '../src/content/france1940/catalogPorts.js';

function createRealVehicleUnit(vehicleId = 'PANZER_III_D', overrides = {}) {
  const unit = new Unit({
    id: overrides.id ?? 'vehicle_1',
    type: 'vehicle',
    vehicleId,
    faction: 'german',
    position: overrides.position ?? new THREE.Vector3(0, 0, 0),
    rotation: overrides.rotation ?? 0,
    ...overrides
  });
  return unit;
}

function createRealMortarUnit() {
  const formation = FRANCE_1940_FORMATIONS.FRENCH_BRANDT_MLE1935_60MM_TEAM;
  const roster = formation.members.map(member => ({
    ...member,
    weapon: FRANCE_1940_CATALOG_PORTS.weapons.get(member.weaponId).name,
    status: 'OK',
    health: 100
  }));
  return new Unit({
    id: 'mortar_1',
    type: 'infantry_squad',
    faction: 'french',
    position: new THREE.Vector3(6, 0, 0),
    roster,
    crewServedWeapon: formation.crewServedWeapon
  });
}

test('selectPrimaryThreat ranks threat candidates deterministically by target type, distance, and stable ID', () => {
  const unit = { position: new THREE.Vector3(0, 0, 0) };
  const infantry = { id: 'infantry_1', type: 'infantry', position: new THREE.Vector3(5, 0, 5) };
  const tank = { id: 'tank_1', type: 'tank', position: new THREE.Vector3(20, 0, 0) };
  const gun = { id: 'gun_1', type: 'gun', position: new THREE.Vector3(10, 0, 0) };

  // Tank should be prioritized over closer infantry because of higher category score
  const best = selectPrimaryThreat(unit, [infantry, tank, gun]);
  assert.equal(best.id, 'tank_1');

  // Equal category score uses stable ID fallback when scores tie
  const tankA = { id: 'tank_a', type: 'tank', position: new THREE.Vector3(10, 0, 0) };
  const tankB = { id: 'tank_b', type: 'tank', position: new THREE.Vector3(10, 0, 0) };
  const tie = selectPrimaryThreat(unit, [tankB, tankA]);
  assert.equal(tie.id, 'tank_a');

  const frozenContact = selectPrimaryThreat(unit, [{
    id: 'frozen_contact',
    type: 'tank',
    position: [12, 0, 4]
  }]);
  assert.deepEqual(frozenContact.position, [12, 0, 4]);
});

test('GameApp projects every direct frozen contact and real Unit threat classes', () => {
  const observer = createRealVehicleUnit('PANZER_III_D', { id: 'observer' });
  const armor = createRealVehicleUnit('SOMUA_S35', {
    id: 'armor_1',
    faction: 'french',
    position: new THREE.Vector3(100, 0, 100)
  });
  const infantry = new Unit({
    id: 'infantry_1',
    type: 'infantry_squad',
    faction: 'french',
    position: new THREE.Vector3(4, 0, 0)
  });
  const mortar = createRealMortarUnit();
  const radioOnly = new Unit({
    id: 'radio_only',
    type: 'infantry_squad',
    faction: 'french',
    position: new THREE.Vector3(2, 0, 0)
  });
  const contacts = new Map([
    ['armor_1', { targetUnitId: 'armor_1', channel: 'DIRECT', position: [20, 0, 0] }],
    ['infantry_1', { targetUnitId: 'infantry_1', channel: 'DIRECT', position: [4, 0, 0] }],
    ['mortar_1', { targetUnitId: 'mortar_1', channel: 'DIRECT', position: [6, 0, 0] }],
    ['radio_only', { targetUnitId: 'radio_only', channel: 'RADIO', position: [2, 0, 0] }]
  ]);
  const app = Object.create(GameApp.prototype);
  app.spotting = {
    hasDirectObservation: () => true,
    getContactForUnit: (_unit, target) => contacts.get(target.id)
  };

  const projected = app.getDirectVehicleThreatContacts(
    observer,
    [radioOnly, mortar, infantry, armor]
  );
  assert.deepEqual(projected.map(contact => contact.id), [
    'armor_1',
    'infantry_1',
    'mortar_1'
  ]);
  assert.deepEqual(projected.map(contact => contact.threatClass), [
    'armor',
    'infantry',
    'crew-served'
  ]);
  assert.deepEqual(projected[0].position, [20, 0, 0]);
  assert.equal(selectPrimaryThreat(observer, projected).id, 'armor_1');
});

test('stationary turreted tanks preserve hull heading while laying the turret', () => {
  const unit = createRealVehicleUnit('PANZER_III_D', { rotation: 0 });
  unit.waypoints = [{ position: new THREE.Vector3(0, 0, 5), orderType: 'MOVE' }];
  unit.currentWaypointIndex = unit.waypoints.length;

  const decision = evaluateVehicleThreatFacing({
    unit,
    contacts: [{ id: 'tank_2', type: 'tank', position: [10, 0, 0] }],
    deltaSeconds: 1
  });

  assert.equal(decision.reason, 'threat-turret-traverse');
  assert.equal(decision.nextHullYaw, 0);
  assert.ok(decision.nextTurretYaw > 0);
  assert.equal(unit.rotation, 0, 'renderer-neutral evaluator must not mutate the unit');
});

test('an active movement waypoint preserves path hull yaw while the turret traverses', () => {
  const unit = createRealVehicleUnit('PANZER_III_D', { rotation: 0 });
  unit.waypoints = [{ position: new THREE.Vector3(0, 0, 10), orderType: 'MOVE' }];
  unit.currentWaypointIndex = 0;
  const initialTurretYaw = unit.vehicleWeapon.turretYaw;

  const decision = evaluateVehicleThreatFacing({
    unit,
    contacts: [{ id: 'tank_2', type: 'tank', position: [10, 0, 0] }],
    deltaSeconds: 1
  });

  assert.equal(decision.reason, 'threat-turret-traverse');
  assert.equal(decision.nextHullYaw, 0);
  assert.ok(decision.nextTurretYaw > initialTurretYaw);
  assert.equal(unit.vehicleWeapon.turretYaw, initialTurretYaw);
});

test('threat facing never commandeers the driver and respects the gunner gate', () => {
  const unit = createRealVehicleUnit('PANZER_III_D', { rotation: 0 });
  const threatPos = new THREE.Vector3(10, 0, 0); // East (angle = Math.PI/2)

  // A stopped turreted tank lays its turret without rotating the hull.
  const decision = evaluateVehicleThreatFacing({ unit, threatPosition: threatPos, deltaSeconds: 1.0 });
  assert.equal(decision.threatFacingActive, true);
  assert.equal(decision.nextHullYaw, 0);
  assert.ok(decision.nextTurretYaw > 0, 'Turret intent must step toward threat');

  // Immobilized / Driver knocked out: hull rotation inhibited (pillbox mode)
  const knockedOutDriverUnit = createRealVehicleUnit('PANZER_III_D', { rotation: 0 });
  const driver = knockedOutDriverUnit.roster.find(c => c.role === 'DRIVER');
  if (driver) {
    driver.status = 'KIA';
    driver.health = 0;
  }

  const pillboxDecision = evaluateVehicleThreatFacing({
    unit: knockedOutDriverUnit,
    threatPosition: threatPos,
    deltaSeconds: 1.0
  });
  assert.equal(pillboxDecision.isPillbox, true);
  assert.equal(pillboxDecision.nextHullYaw, 0, 'Hull must not turn without an operational driver');
  assert.ok(pillboxDecision.nextTurretYaw > 0, 'Turret must still traverse toward threat if gunner is alive');
});

test('Char B1 hull-gun target order owns hull facing while autonomous turret intent remains available', () => {
  const unit = createRealVehicleUnit('CHAR_B1_BIS', { rotation: 0 });
  unit.targetMode = 'TARGET_HULL_HE';
  unit.targetUnit = createRealVehicleUnit('PANZER_III_D', {
    id: 'ordered_target',
    position: new THREE.Vector3(0, 0, 30)
  });
  const initialTurretYaw = unit.vehicleWeapon.turretYaw;
  const initialMeshYaw = unit.mesh.userData.turret.rotation.y;

  const decision = evaluateVehicleThreatFacing({
    unit,
    contacts: [{ id: 'side_threat', type: 'tank', position: [20, 0, 0] }],
    deltaSeconds: 1
  });

  assert.equal(decision.reason, 'hull-gun-laying');
  assert.equal(decision.nextHullYaw, 0);
  assert.ok(decision.nextTurretYaw > initialTurretYaw);
  assert.equal(unit.rotation, 0);
  assert.equal(unit.vehicleWeapon.turretYaw, initialTurretYaw);
  assert.equal(unit.mesh.userData.turret.rotation.y, initialMeshYaw);
});

test('VehicleAI coordinator updates live Unit and captures/restores state deterministically', () => {
  const unit = createRealVehicleUnit('PANZER_III_D', { rotation: 0 });
  assert.ok(unit.vehicleAI instanceof VehicleAI, 'Vehicle Unit must instantiate VehicleAI');

  const threatPos = new THREE.Vector3(0, 0, 10); // North (angle = 0)
  unit.vehicleAI.update(1.0, null, { threatPosition: threatPos });

  assert.equal(unit.tacticalDecision.threatFacingActive, true);
  assert.deepEqual(unit.tacticalDecision.threatPosition, [0, 0, 10]);

  const state = unit.captureState();
  assert.ok(state.vehicleAI, 'Unit state must capture vehicleAI');
  state.vehicleAI.tacticalDecision.threatPosition[0] = 99;
  assert.deepEqual(unit.tacticalDecision.threatPosition, [0, 0, 10]);

  const restoredUnit = createRealVehicleUnit('PANZER_III_D', { rotation: 0 });
  restoredUnit.restoreState(state);

  assert.deepEqual(restoredUnit.vehicleAI.captureState(), state.vehicleAI);
  assert.equal(restoredUnit.tacticalDecision.threatFacingActive, true);
});

test('restore immediately projects captured authoritative turret yaw to the mesh', () => {
  const unit = createRealVehicleUnit('PANZER_III_D');
  unit.vehicleWeapon.turretYaw = 0.4;
  unit.syncVehicleWeaponPresentation();
  const state = unit.captureState();

  unit.vehicleWeapon.turretYaw = 1.2;
  unit.syncVehicleWeaponPresentation();
  assert.equal(unit.mesh.userData.turret.rotation.y, 1.2);

  unit.restoreState(state);
  assert.equal(unit.vehicleWeapon.turretYaw, 0.4);
  assert.equal(unit.mesh.userData.turret.rotation.y, 0.4);
});

test('Infantry and structure units do not instantiate or process VehicleAI', () => {
  const squad = new Unit({
    id: 'infantry_squad_1',
    type: 'infantry_squad',
    faction: 'french',
    position: new THREE.Vector3(0, 0, 0)
  });

  assert.equal(squad.vehicleAI, null, 'Infantry squad must not have VehicleAI');
  const captured = squad.captureState();
  assert.equal(captured.vehicleAI, null);
});
