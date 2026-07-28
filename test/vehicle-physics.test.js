import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import {
  advanceVehiclePhysicsState,
  captureVehiclePhysicsState,
  createVehiclePhysicsState,
  sampleVehicleTerrainPose,
  VEHICLE_PHYSICS_MODEL
} from '../src/simulation/vehicles/VehiclePhysics.js';

const DIMENSIONS = Object.freeze({ length: 5, width: 2.4, height: 2.3 });

function slopedTerrain(x, z) {
  return 1 + x * 0.2 + z * 0.3;
}

function createTerrain(getHeightAt = () => 0) {
  return {
    getHeightAt,
    getMovementHeightAt: getHeightAt
  };
}

function advanceCookoff(state, deltas) {
  const position = { x: 0, y: 0, z: 0 };
  for (const deltaSeconds of deltas) {
    advanceVehiclePhysicsState({
      state,
      deltaSeconds,
      position,
      yaw: 0,
      dimensions: DIMENSIONS,
      terrain: createTerrain(),
      damageState: {
        secondaryExplosion: true,
        eventVersion: 7
      },
      hasDetachableTurret: true,
      turretYaw: 0.35
    });
    position.y = state.hull.rideHeight;
  }
  return state;
}

test('vehicle terrain supports derive hull pitch, roll, and ride height from the footprint', () => {
  const pose = sampleVehicleTerrainPose({
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    dimensions: DIMENSIONS,
    terrain: createTerrain(slopedTerrain)
  });

  assert.ok(Math.abs(pose.pitch + Math.atan(0.3)) < 1e-12);
  assert.ok(Math.abs(pose.roll - Math.atan(0.2)) < 1e-12);
  assert.ok(Math.abs(pose.rideHeight - 1) < 1e-12);
  assert.equal(pose.supportLength, DIMENSIONS.length * 0.72);
  assert.equal(pose.supportWidth, DIMENSIONS.width * 0.82);
});

test('ammunition cookoff launches, bounces, and settles a deterministic turret body', () => {
  const coarse = advanceCookoff(
    createVehiclePhysicsState(),
    Array.from({ length: 240 }, () => 1 / 30)
  );
  const fine = advanceCookoff(
    createVehiclePhysicsState(),
    Array.from({ length: 480 }, () => 1 / 60)
  );

  assert.equal(coarse.turret.status, 'SETTLED');
  assert.equal(coarse.turret.bounceCount, 2);
  assert.ok(coarse.turret.offset[0] > 0);
  assert.ok(coarse.turret.offset[2] > 0);
  assert.equal(coarse.turret.baseYaw, 0.35);
  assert.equal(coarse.turret.separationEventVersion, 7);
  assert.deepEqual(coarse, fine);
});

test('captured vehicle physics resumes the same detached-turret trajectory', () => {
  const source = advanceCookoff(
    createVehiclePhysicsState(),
    Array.from({ length: 24 }, () => 1 / 30)
  );
  const restored = createVehiclePhysicsState(captureVehiclePhysicsState(source));

  advanceCookoff(source, Array.from({ length: 90 }, () => 1 / 30));
  advanceCookoff(restored, Array.from({ length: 90 }, () => 1 / 30));

  assert.deepEqual(restored, source);
});

test('Unit capture and restore preserve terrain pose and turret separation authority', () => {
  const terrain = createTerrain(slopedTerrain);
  const source = new Unit({
    id: 'physics_vehicle',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3(0, 0, 0)
  });
  source.vehicleDamageState.secondaryExplosion = true;
  source.vehicleDamageState.destroyed = true;
  source.vehicleDamageState.eventVersion = 4;
  source.update(1 / 30, terrain);

  assert.equal(source.vehiclePhysics.modelVersion, VEHICLE_PHYSICS_MODEL);
  assert.equal(source.vehiclePhysics.turret.status, 'AIRBORNE');
  assert.equal(
    source.vehicleDamageState.events.at(-1).type,
    'turret_separated'
  );
  assert.equal(source.mesh.rotation.order, 'YXZ');
  assert.equal(source.mesh.rotation.x, source.vehiclePhysics.hull.pitch);
  assert.equal(source.mesh.rotation.z, source.vehiclePhysics.hull.roll);

  const captured = source.captureState();
  const restored = new Unit({
    id: 'physics_vehicle',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3()
  });
  restored.restoreState(captured, new Map([[restored.id, restored]]));

  assert.deepEqual(restored.captureState().vehiclePhysics, captured.vehiclePhysics);
  assert.equal(restored.mesh.rotation.x, captured.vehiclePhysics.hull.pitch);
  assert.equal(restored.mesh.rotation.z, captured.vehiclePhysics.hull.roll);
});
