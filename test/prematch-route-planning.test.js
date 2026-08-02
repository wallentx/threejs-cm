import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CommandSystem } from '../src/game/CommandSystem.js';
import { Unit } from './helpers/France1940TestUnit.js';

function createUnit(faction = 'german', position = new THREE.Vector3(10, 0, 10)) {
  return new Unit({
    id: 'unit_1',
    type: 'infantry_squad',
    faction,
    position
  });
}

test('prematch setup phase immediately repositions unit for in-zone destinations', () => {
  const scene = new THREE.Scene();
  const unit = createUnit('german', new THREE.Vector3(10, 0, 10));
  let setupActive = true;

  const deploymentZones = {
    german: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 }
  };

  const commands = new CommandSystem(scene, {
    deploymentZones,
    isSetupPhase: () => setupActive
  });

  commands.setActiveUnit(unit);
  commands.setCommandMode('MOVE_MOVE');

  // In-zone click at (15, 0, 15)
  const inZoneTarget = new THREE.Vector3(15, 0, 15);
  const handled = commands.handleMapClick(inZoneTarget);

  assert.equal(handled, true);
  assert.equal(unit.position.x, 15);
  assert.equal(unit.position.z, 15);
  assert.equal(unit.waypoints.length, 0, 'In-zone setup click must immediately reposition unit without queuing waypoints');
});

test('prematch setup phase queues visible round-start orders for out-of-zone destinations', () => {
  const scene = new THREE.Scene();
  const unit = createUnit('german', new THREE.Vector3(10, 0, 10));
  let setupActive = true;

  const deploymentZones = {
    german: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 }
  };

  const commands = new CommandSystem(scene, {
    deploymentZones,
    isSetupPhase: () => setupActive
  });

  commands.setActiveUnit(unit);
  commands.setCommandMode('MOVE_FAST');

  // Out-of-zone click at (50, 0, 50)
  const outOfZoneTarget = new THREE.Vector3(50, 0, 50);
  const handled = commands.handleMapClick(outOfZoneTarget);

  assert.equal(handled, true);
  assert.equal(unit.position.x, 10, 'Out-of-zone click must NOT immediately move unit position');
  assert.ok(unit.waypoints.length >= 1, 'Out-of-zone click must queue visible round-start waypoints');
  assert.equal(unit.waypoints.at(-1).orderType, 'FAST', 'Queued order must preserve FAST order type through start');
});
