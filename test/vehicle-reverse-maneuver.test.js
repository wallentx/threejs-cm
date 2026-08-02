import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  shouldVehicleReverse,
  planVehicleReverseStep
} from '../src/simulation/vehicles/VehicleReverseManeuver.js';
import { VehicleAI } from '../src/game/VehicleAI.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { StaticCollisionWorld } from '../src/simulation/collision/StaticCollisionWorld.js';

function createRealVehicleUnit(vehicleId = 'PANZER_III_D', overrides = {}) {
  const unit = new Unit({
    id: overrides.id ?? 'vehicle_1',
    type: 'vehicle',
    vehicleId,
    faction: 'german',
    position: overrides.position ?? new THREE.Vector3(0, 0, 0),
    rotation: overrides.rotation ?? 0,
    collisionWorld: overrides.collisionWorld ?? new StaticCollisionWorld(),
    ...overrides
  });
  return unit;
}

test('shouldVehicleReverse identifies REVERSE order and heavy threat retreat when driver is operational', () => {
  const unit = createRealVehicleUnit();
  assert.equal(shouldVehicleReverse({ unit, orderType: 'REVERSE' }), true);
  assert.equal(shouldVehicleReverse({ unit, heavyThreat: true }), true);
  assert.equal(shouldVehicleReverse({ unit, orderType: 'MOVE' }), false);

  // Driver KIA inhibits reverse maneuver
  const driver = unit.roster.find(c => c.role === 'DRIVER');
  if (driver) {
    driver.status = 'KIA';
    driver.health = 0;
  }
  assert.equal(shouldVehicleReverse({ unit, orderType: 'REVERSE' }), false);
});

test('planVehicleReverseStep produces smooth rearward displacement and orientation toward target', () => {
  const spec = createRealVehicleUnit().vehicleSpec;
  const currentPos = new THREE.Vector3(0, 0, 0);
  const targetPos = new THREE.Vector3(0, 0, -10); // Target is South (rearward if vehicle faces North yaw=0)

  const plan = planVehicleReverseStep({
    vehicleSpec: spec,
    currentYaw: 0,
    currentPosition: currentPos,
    targetPosition: targetPos,
    speedMetersPerSecond: 3.5,
    deltaSeconds: 1.0
  });

  assert.equal(plan.isReverse, true);
  assert.ok(plan.intendedDistanceMeters < 0, 'Intended distance must be negative for reverse motion');
  assert.ok(plan.displacement.z < 0, 'Displacement must move rearward toward target');
});

test('live vehicle Unit under REVERSE order updates position rearward, records signed track travel, and preserves collision', () => {
  const unit = createRealVehicleUnit('PANZER_III_D', {
    position: new THREE.Vector3(0, 0, 0),
    rotation: 0
  });
  unit.addWaypoint(new THREE.Vector3(0, 0, -10), 'REVERSE');

  const mockTerrain = { getHeightAt: () => 0 };
  const initialZ = unit.position.z;

  unit.update(1.0, mockTerrain);

  assert.ok(unit.position.z < initialZ, 'Vehicle position must displace rearward');
  assert.ok(unit.vehicleKinematics.distanceMeters < 0, 'Signed track distance must record negative rearward travel');

  const state = unit.captureState();
  assert.ok(state.vehicleKinematics.distanceMeters < 0, 'Captured state must retain signed track travel');

  const restoredUnit = createRealVehicleUnit('PANZER_III_D', {
    position: new THREE.Vector3(0, 0, 0),
    rotation: 0
  });
  restoredUnit.restoreState(state);

  assert.equal(restoredUnit.vehicleKinematics.distanceMeters, unit.vehicleKinematics.distanceMeters);
});

test('reverse movement steers toward the collision-world route target before the final waypoint', () => {
  const routeTarget = { x: 6, z: -8 };
  const collisionWorld = {
    getNavigationTarget() {
      return routeTarget;
    },
    resolveFootprintMotion(position, displacement) {
      return {
        x: position.x + displacement.x,
        z: position.z + displacement.z,
        movedX: displacement.x,
        movedZ: displacement.z,
        contacts: []
      };
    }
  };
  const unit = createRealVehicleUnit('PANZER_III_D', {
    position: new THREE.Vector3(0, 0, 0),
    rotation: 0,
    collisionWorld
  });
  unit.addWaypoint(new THREE.Vector3(0, 0, -20), 'REVERSE');

  unit.update(0.5, { getHeightAt: () => 0 });

  assert.ok(
    unit.rotation < 0,
    'reverse hull must begin turning toward the routed bend instead of the straight final leg'
  );
});
