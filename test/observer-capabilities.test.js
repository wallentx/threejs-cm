import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import {
  FRANCE_1940_FORMATIONS
} from '../src/content/france1940/formations.js';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import {
  pointInsideObserverFov,
  resolveObserverCapabilities
} from '../src/simulation/observation/ObserverCapabilities.js';

test('France 1940 squad leaders own binoculars used only while observing', () => {
  for (const formationId of [
    'FRENCH_CHASSEURS_PORTES_SQUAD',
    'GERMAN_GRENADIER_SQUAD_1940'
  ]) {
    const leader = FRANCE_1940_FORMATIONS[formationId].members[0];
    assert.equal(leader.id, 'squad-leader');
    assert.deepEqual(leader.equipment, ['BINOCULARS']);
    assert.equal(Object.isFrozen(leader.equipment), true);
  }

  const unit = new Unit({
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const leader = unit.roster[0];
  const rifleman = unit.roster[1];

  leader.state = 'READY';
  assert.deepEqual(
    resolveObserverCapabilities(unit, leader).map(capability => capability.kind),
    ['UNAIDED']
  );
  leader.state = 'OBSERVING';
  const leaderCapabilities = resolveObserverCapabilities(unit, leader);
  assert.deepEqual(
    leaderCapabilities.map(capability => capability.kind),
    ['UNAIDED', 'BINOCULARS']
  );
  const binoculars = leaderCapabilities[1];
  assert.ok(binoculars.rangeMultiplier > 1);
  assert.ok(binoculars.acquisitionTimeMultiplier < 1);
  assert.ok(binoculars.horizontalFovDegrees < 90);

  rifleman.state = 'OBSERVING';
  assert.deepEqual(
    resolveObserverCapabilities(unit, rifleman).map(capability => capability.kind),
    ['UNAIDED']
  );
});

test('narrow optical fields of view follow person, hull, and turret facing', () => {
  const origin = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 100);
  const side = new THREE.Vector3(100, 0, 0);
  assert.equal(pointInsideObserverFov(origin, forward, 0, 42), true);
  assert.equal(pointInsideObserverFov(origin, side, 0, 42), false);
  assert.equal(pointInsideObserverFov(origin, side, Math.PI / 2, 42), true);
  assert.equal(pointInsideObserverFov(origin, side, 0, 360), true);
});

test('vehicle crew observe through role-owned stations and damaged optics', () => {
  const panzer = new Unit({
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3()
  });
  const commander = panzer.roster.find(person => person.role === 'COMMANDER');
  const gunner = panzer.roster.find(person => person.role === 'GUNNER');
  const driver = panzer.roster.find(person => person.role === 'DRIVER');

  const driverCapabilities = resolveObserverCapabilities(panzer, driver);
  assert.deepEqual(driverCapabilities.map(item => item.kind), ['VISION_SLOT']);
  assert.equal(driverCapabilities[0].horizontalFovDegrees, 62);

  const gunnerCapabilities = resolveObserverCapabilities(panzer, gunner);
  const sight = gunnerCapabilities.find(item => item.kind === 'GUN_SIGHT');
  assert.equal(sight.horizontalFovDegrees, 24);
  assert.ok(sight.rangeMultiplier > 1);
  assert.equal(sight.facingFrame, 'turret');

  const buttoned = resolveObserverCapabilities(panzer, commander);
  assert.equal(buttoned.some(item => item.kind === 'BINOCULARS'), false);
  assert.equal(panzer.toggleVehicleCommanderPosture(), 'UNBUTTONED');
  const unbuttoned = resolveObserverCapabilities(panzer, commander);
  assert.equal(unbuttoned.some(item => item.kind === 'BINOCULARS'), true);

  panzer.vehicleComponents.optics.status = 'DAMAGED';
  const damagedSight = resolveObserverCapabilities(panzer, gunner)
    .find(item => item.kind === 'GUN_SIGHT');
  assert.ok(damagedSight.rangeMultiplier < sight.rangeMultiplier);
  assert.ok(
    damagedSight.acquisitionTimeMultiplier
      > sight.acquisitionTimeMultiplier
  );

  panzer.vehicleComponents.optics.operational = false;
  assert.equal(
    resolveObserverCapabilities(panzer, gunner)
      .some(item => item.kind === 'GUN_SIGHT'),
    false
  );
});

test('every France 1940 vehicle bundle owns frozen observation stations', () => {
  for (const vehicle of Object.values(VEHICLES)) {
    const equipment = vehicle.observationEquipment;
    assert.equal(Object.isFrozen(equipment), true, vehicle.id);
    assert.ok(equipment.stations.length > 0, vehicle.id);
    assert.equal(Object.isFrozen(equipment.stations), true, vehicle.id);
    for (const station of equipment.stations) {
      assert.equal(Object.isFrozen(station), true, `${vehicle.id}:${station.id}`);
      assert.ok(station.roles.length > 0, `${vehicle.id}:${station.id}`);
      assert.ok(station.rangeMultiplier > 0, `${vehicle.id}:${station.id}`);
      assert.ok(
        station.acquisitionTimeMultiplier > 0,
        `${vehicle.id}:${station.id}`
      );
      assert.ok(
        station.horizontalFovDegrees > 0
          && station.horizontalFovDegrees <= 360,
        `${vehicle.id}:${station.id}`
      );
    }
    if (equipment.unbuttonedCommander) {
      assert.ok(
        equipment.binocularRoles.includes(
          equipment.unbuttonedCommander.role
        ),
        vehicle.id
      );
      assert.equal(
        Object.isFrozen(equipment.unbuttonedCommander.capability),
        true,
        vehicle.id
      );
      assert.equal(
        Object.isFrozen(equipment.unbuttonedCommander.presentationOffset),
        true,
        vehicle.id
      );
    }
  }
});

test('vehicle-specific unbutton policy overrides generic armored fallback', () => {
  assert.equal(
    VEHICLES.SOMUA_S35.observationEquipment.unbuttonedCommander,
    null
  );
  assert.match(
    VEHICLES.SOMUA_S35.observationEquipment.unbuttonedPostureDataQuality,
    /French-service 1940/
  );
  assert.equal(
    VEHICLES.PANZER_III_D.observationEquipment.unbuttonedCommander.headgearId,
    'GERMAN_PANZER_PROTECTIVE_BERET_1940'
  );
  assert.deepEqual(
    VEHICLES.PANZER_III_D.observationEquipment.unbuttonedCommander.center,
    [0, 1.58, 0.12]
  );
  assert.deepEqual(
    VEHICLES.PANZER_III_D.observationEquipment.unbuttonedCommander.offset,
    [0.06, 1.10, -0.22]
  );
  assert.deepEqual(
    VEHICLES.PANZER_III_D.observationEquipment.unbuttonedCommander
      .presentationOffset,
    [0, -0.12, 0]
  );
});
