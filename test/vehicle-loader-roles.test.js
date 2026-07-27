import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';

function makeVehicle(vehicleId, faction) {
  return new Unit({
    id: `loader_${vehicleId.toLowerCase()}`,
    faction,
    type: 'vehicle',
    vehicleId,
    position: new THREE.Vector3()
  });
}

function killRole(unit, role) {
  const crewman = unit.roster.find(member => member.role === role);
  assert.ok(crewman, `${unit.vehicleId} must contain ${role}`);
  crewman.health = 0;
  crewman.status = 'KIA';
}

test('separate turret loaders control coax reload while hull gunners retain their own feed task', () => {
  const panzer = makeVehicle('PANZER_III_D', 'german');
  assert.deepEqual(panzer.getVehicleMountSpec('coax').loaderRoles, ['LOADER']);
  assert.deepEqual(panzer.getVehicleMountSpec('hull_mg').loaderRoles, ['RADIO_OPERATOR']);

  panzer.vehicleMounts.coax.feedAmmo = 0;
  panzer.vehicleMounts.hull_mg.feedAmmo = 0;
  killRole(panzer, 'LOADER');

  assert.equal(panzer.isVehicleMountOperational('coax'), true);
  assert.equal(panzer.beginVehicleMountReload('coax'), false);
  assert.equal(panzer.beginVehicleMountReload('hull_mg'), true);
});

test('modeled commander-loader loss blocks Panhard coax reload without inventing gunner loss', () => {
  const panhard = makeVehicle('PANHARD_178', 'french');
  assert.deepEqual(panhard.getVehicleMountSpec('coax').crewRoles, ['GUNNER']);
  assert.deepEqual(panhard.getVehicleMountSpec('coax').loaderRoles, ['COMMANDER']);
  panhard.vehicleMounts.coax.feedAmmo = 0;
  killRole(panhard, 'COMMANDER');

  assert.equal(panhard.isVehicleMountOperational('coax'), true);
  assert.equal(panhard.beginVehicleMountReload('coax'), false);
});
