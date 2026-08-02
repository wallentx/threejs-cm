import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVehicleKinematicsState,
  recordResolvedVehicleTravel
} from '../src/simulation/vehicles/VehicleKinematics.js';

const vehicleSpec = {
  id: 'renault-r35',
  mobility: {
    driveType: 'tracked',
    minimumTurnRadiusMeters: 4.5,
    pivotTurnRateRadPerSecond: 0.5,
    trackGaugeMeters: 1.8
  }
};

test('recordResolvedVehicleTravel advances both tracks when healthy', () => {
  const state = createVehicleKinematicsState();
  recordResolvedVehicleTravel(state, {
    vehicleSpec,
    previousYaw: 0,
    nextYaw: 0,
    movedX: 0,
    movedZ: 5
  });

  assert.equal(state.leftTrackMeters, 5);
  assert.equal(state.rightTrackMeters, 5);
});

test('recordResolvedVehicleTravel gates track advancement on damaged side', () => {
  const state = createVehicleKinematicsState();
  const components = {
    leftTrack: { functional: false, health: 0 },
    rightTrack: { functional: true, health: 100 }
  };

  recordResolvedVehicleTravel(state, {
    vehicleSpec,
    previousYaw: 0,
    nextYaw: 0,
    movedX: 0,
    movedZ: 5,
    components
  });

  assert.equal(state.leftTrackMeters, 0, 'Damaged left track must NOT advance');
  assert.equal(state.rightTrackMeters, 5, 'Functional right track must advance');
});

test('recordResolvedVehicleTravel consumes the authoritative aggregate tracks component', () => {
  const state = createVehicleKinematicsState();
  recordResolvedVehicleTravel(state, {
    vehicleSpec,
    previousYaw: 0,
    nextYaw: 0,
    movedX: 0,
    movedZ: 5,
    components: {
      tracks: { operational: false, status: 'DESTROYED', health: 0 }
    }
  });

  assert.equal(state.leftTrackMeters, 0);
  assert.equal(state.rightTrackMeters, 0);
});
