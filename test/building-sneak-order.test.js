import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameApp } from '../src/app/GameApp.js';
import { Unit as TestUnit } from './helpers/France1940TestUnit.js';
import {
  SNEAK_INFANTRY_MOVEMENT_PROFILE
} from '../src/simulation/infantry/InfantryMovementOrders.js';

for (const orderType of ['SNEAK', 'CRAWL', 'ASSAULT']) {
test(`${orderType} keeps its movement profile through a building approach`, () => {
  const formationOrders = [];
  const waypoints = [];
  const unit = {
    position: new THREE.Vector3(0, 0, -8),
    collisionRadius: 0.32,
    collisionWorld: {
      getRecords: () => [{ id: 'house-wall', buildingId: 'house' }],
      getNavigationPath(start, goal, radius, moverType, options) {
        assert.deepEqual(start, { x: 0, z: -8 });
        assert.deepEqual(goal, { x: 2, z: -1 });
        assert.equal(radius, 0.32);
        assert.equal(moverType, 'infantry');
        assert.deepEqual(options.ignoreColliderIds, ['house-wall']);
        return [{ x: 1, z: -4 }, goal];
      }
    },
    soldierAI: {
      getLivingAgents: () => [{ index: 0 }, { index: 1 }],
      getFormationOffset(index, orderType) {
        formationOrders.push(orderType);
        return new THREE.Vector3(index * 0.4, 0, -index);
      }
    },
    clearWaypoints() {
      waypoints.length = 0;
    },
    addWaypoint(position, orderType) {
      waypoints.push({ position: position.toArray(), orderType });
    }
  };
  const app = {
    matchStarted: true,
    buildingInteraction: {
      issueEnter() {
        return {
          accepted: true,
          assigned: ['squad:soldier-0', 'squad:soldier-1'],
          approachPosition: [2, 0, -1],
          approachRoute: [[2, 0, -1]]
        };
      }
    },
    commands: { renderOverlays() {} },
    ui: { showToast() {} }
  };

  const result = GameApp.prototype.issueBuildingOrder.call(
    app,
    unit,
    'ENTER_GROUND',
    new THREE.Vector3(2, 0, -1),
    'house',
    orderType
  );

  assert.equal(result.accepted, true);
  assert.deepEqual(formationOrders, [orderType, orderType]);
  assert.deepEqual(waypoints, [
    { position: [1, 0, -4], orderType },
    { position: [2, 0, -1], orderType }
  ]);
});
}

test('the squad anchor advances at the authoritative SNEAK profile speed', () => {
  const unit = new TestUnit({
    id: 'sneak-anchor',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  unit.addWaypoint(new THREE.Vector3(0, 0, 20), 'SNEAK');
  const terrain = {
    getHeightAt: () => 0,
    getMovementHeightAt: () => 0
  };

  for (let step = 0; step < 30; step++) unit.update(1 / 30, terrain);

  assert.ok(
    Math.abs(
      unit.position.z
        - SNEAK_INFANTRY_MOVEMENT_PROFILE.anchorSpeedMetersPerSecond
    ) < 1e-9
  );
  assert.equal(unit.captureState().waypoints[0].orderType, 'SNEAK');
});
