import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameApp } from '../src/app/GameApp.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import {
  advanceTransportTransfer,
  availableTransportSeats,
  beginTransportTransfer,
  captureVehicleTransportState,
  createVehicleTransportState
} from '../src/simulation/vehicles/VehicleTransport.js';

function makeTruck(vehicleId = 'LAFFLY_S20TL', id = 'truck') {
  return new Unit({
    id,
    faction: vehicleId === 'OPEL_BLITZ' ? 'german' : 'french',
    type: 'vehicle',
    vehicleId,
    position: new THREE.Vector3()
  });
}

function makeInfantry(id = 'squad', position = new THREE.Vector3(0, 0, 2)) {
  return new Unit({
    id,
    faction: 'french',
    type: 'infantry_squad',
    formationId: 'FRENCH_CHASSEURS_PORTES_SQUAD',
    position
  });
}

function makeApp(units) {
  return Object.assign(Object.create(GameApp.prototype), {
    units,
    selectedUnit: units[0] ?? null,
    commands: { renderOverlays() {} },
    terrain: {
      getMovementHeightAt() { return 0; },
      getHeightAt() { return 0; }
    }
  });
}

test('truck transport records own bounded passenger and cargo state', () => {
  for (const vehicleId of ['LAFFLY_S20TL', 'OPEL_BLITZ']) {
    const spec = VEHICLES[vehicleId];
    const truck = makeTruck(vehicleId, vehicleId.toLowerCase());
    assert.ok(spec.transport.passengerCapacity >= 10);
    assert.match(spec.transport.dataQuality, /gameplay approximation/);
    assert.equal(truck.vehicleTransportState.passengerUnitIds.length, 0);
    assert.deepEqual(
      truck.vehicleTransportState.cargo,
      spec.transport.initialCargo
    );
    assert.equal(truck.vehicleComponents.ammunition.installed, true);
    assert.equal(truck.hasOperationalDriver(), true);
    assert.ok(truck.roster.some(crewman => crewman.role === 'DRIVER'));
    assert.ok(truck.roster.some(crewman => crewman.role === 'PASSENGER'));
  }
});

test('timed transfer is frame-partition invariant and enforces personnel capacity', () => {
  const spec = VEHICLES.LAFFLY_S20TL.transport;
  const coarse = createVehicleTransportState(spec);
  const fine = createVehicleTransportState(spec);
  for (const state of [coarse, fine]) {
    const result = beginTransportTransfer(state, spec, {
      action: 'EMBARK',
      infantryUnitId: 'squad-a',
      passengerCount: 6,
      passengerCounts: {},
      distanceMeters: 2
    });
    assert.equal(result.accepted, true);
  }
  for (let step = 0; step < 4; step++) advanceTransportTransfer(coarse, 1);
  for (let step = 0; step < 40; step++) advanceTransportTransfer(fine, 0.1);
  assert.deepEqual(captureVehicleTransportState(fine), captureVehicleTransportState(coarse));
  assert.deepEqual(coarse.passengerUnitIds, ['squad-a']);
  assert.equal(availableTransportSeats(coarse, spec, { 'squad-a': 6 }), 4);

  const overflow = beginTransportTransfer(coarse, spec, {
    action: 'EMBARK',
    infantryUnitId: 'squad-b',
    passengerCount: 5,
    passengerCounts: { 'squad-a': 6 },
    distanceMeters: 2
  });
  assert.deepEqual(overflow, { accepted: false, reason: 'CAPACITY' });
});

test('infantry mount, ride, dismount, remount, and restore authoritative transport state', () => {
  const infantry = makeInfantry();
  const truck = makeTruck();
  const app = makeApp([infantry, truck]);

  const mount = app.requestTransportMount(infantry);
  assert.equal(mount.accepted, true);
  assert.equal(infantry.transportAssignment.phase, 'BOARDING');
  app.advanceVehicleTransports(2);
  assert.equal(infantry.transportAssignment.phase, 'BOARDING');
  app.advanceVehicleTransports(2);
  assert.equal(infantry.transportAssignment.phase, 'EMBARKED');
  assert.deepEqual(truck.vehicleTransportState.passengerUnitIds, [infantry.id]);
  assert.equal(infantry.isCombatEffective(), false);
  assert.ok(infantry.soldierAI.agents.every(agent =>
    agent.vehicleLocation?.vehicleId === truck.id));

  truck.position.set(12, 0, 8);
  truck.mesh.position.copy(truck.position);
  app.advanceVehicleTransports(0);
  assert.ok(infantry.position.distanceTo(truck.position) < 4);

  const savedTruck = truck.captureState();
  const savedInfantry = infantry.captureState();
  truck.vehicleTransportState.passengerUnitIds.length = 0;
  infantry.transportAssignment = null;
  truck.restoreState(savedTruck, new Map([[truck.id, truck], [infantry.id, infantry]]));
  infantry.restoreState(savedInfantry, new Map([[truck.id, truck], [infantry.id, infantry]]));
  app.advanceVehicleTransports(0);
  assert.equal(infantry.transportAssignment.phase, 'EMBARKED');
  assert.deepEqual(truck.vehicleTransportState.passengerUnitIds, [infantry.id]);

  const dismount = app.requestTransportDismount(infantry);
  assert.equal(dismount.accepted, true);
  app.advanceVehicleTransports(3);
  assert.equal(infantry.transportAssignment, null);
  assert.deepEqual(truck.vehicleTransportState.passengerUnitIds, []);
  assert.ok(infantry.soldierAI.agents.every(agent => !agent.vehicleLocation));
  assert.equal(infantry.isCombatEffective(), true);

  assert.equal(app.requestTransportMount(infantry).accepted, true);
  app.advanceVehicleTransports(4);
  assert.equal(infantry.transportAssignment.phase, 'EMBARKED');
});

test('truck cargo replenishes individual weapon reserves and conserves rounds', () => {
  const infantry = makeInfantry();
  const truck = makeTruck();
  const app = makeApp([infantry, truck]);
  for (const agent of infantry.soldierAI.agents) {
    agent.magazineAmmo = 0;
    agent.reserveAmmo = 0;
    if (agent.supportAmmunitionTransfer) {
      agent.supportAmmunitionTransfer.remainingRounds = 0;
    }
    agent.syncRecord();
  }
  infantry.refreshAmmoSummary();
  const cargoBefore = Object.values(truck.vehicleTransportState.cargo)
    .reduce((sum, rounds) => sum + rounds, 0);
  const infantryBefore = infantry.soldierAI.agents.reduce(
    (sum, agent) => sum + agent.magazineAmmo + agent.reserveAmmo
      + (agent.supportAmmunitionTransfer?.remainingRounds ?? 0),
    0
  );

  const result = app.resupplyUnitFromTransport(infantry);
  assert.equal(result.accepted, true);
  assert.ok(result.smallArmsRounds > 0);
  assert.ok(result.machineGunRounds > 0);
  assert.deepEqual(
    result.recipientSoldierIds,
    [...result.recipientSoldierIds].sort()
  );
  const cargoAfter = Object.values(truck.vehicleTransportState.cargo)
    .reduce((sum, rounds) => sum + rounds, 0);
  const infantryAfter = infantry.soldierAI.agents.reduce(
    (sum, agent) => sum + agent.magazineAmmo + agent.reserveAmmo
      + (agent.supportAmmunitionTransfer?.remainingRounds ?? 0),
    0
  );
  assert.equal(cargoBefore - cargoAfter, infantryAfter - infantryBefore);
  assert.equal(truck.vehicleTransportState.cargo.grenades, 24);
});

test('secondary explosion kills every embarked passenger and destroys cargo', () => {
  const infantry = makeInfantry();
  const truck = makeTruck();
  const app = makeApp([infantry, truck]);
  assert.equal(app.requestTransportMount(infantry).accepted, true);
  app.advanceVehicleTransports(4);
  truck.vehicleDamageState.secondaryExplosion = true;
  truck.destroyVehicleAmmunitionStores();
  app.advanceVehicleTransports(0);
  assert.ok(infantry.soldierAI.agents.every(agent => agent.health === 0));
  assert.deepEqual(truck.vehicleTransportState.passengerUnitIds, []);
  assert.ok(Object.values(truck.vehicleTransportState.cargo)
    .every(rounds => rounds === 0));
});

test('truck driver and vehicle commander dismount, disable movement, restore, and remount', () => {
  const truck = makeTruck();
  const dismount = truck.dismountTransportCrew();
  assert.equal(dismount.accepted, true);
  assert.equal(dismount.crewIds.length, 2);
  assert.equal(truck.hasDismountedTransportCrew(), true);
  assert.equal(truck.hasOperationalDriver(), false);
  assert.equal(truck.getVehicleMovementFactor(), 0);
  assert.ok(truck.roster.every(crewman =>
    crewman.vehicleLocation?.phase === 'DISMOUNTED'));
  assert.ok(Object.values(truck.mesh.userData.transportCrewFigures)
    .every(figure => figure.visible));

  const saved = truck.captureState();
  truck.remountTransportCrew();
  truck.restoreState(saved, new Map([[truck.id, truck]]));
  assert.equal(truck.hasDismountedTransportCrew(), true);
  assert.equal(truck.hasOperationalDriver(), false);

  const remount = truck.remountTransportCrew();
  assert.equal(remount.accepted, true);
  assert.equal(truck.hasDismountedTransportCrew(), false);
  assert.equal(truck.hasOperationalDriver(), true);
  assert.ok(truck.roster.every(crewman => !crewman.vehicleLocation));
  assert.ok(Object.values(truck.mesh.userData.transportCrewFigures)
    .every(figure => !figure.visible));
});

test('dismounted truck crew are outside internal hits and cookoff consequences', () => {
  const truck = makeTruck();
  truck.dismountTransportCrew();
  truck.vehicleDamageState.secondaryExplosion = true;
  truck.applyVehicleCookoffConsequences();
  assert.ok(truck.roster.every(crewman => crewman.health === 100));
  assert.ok(truck.roster.every(crewman => crewman.status === 'OK'));
});
