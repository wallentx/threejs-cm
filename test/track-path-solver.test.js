import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RENAULT_R35_VISUAL_DATA
} from '../src/content/france1940/vehicleData/RenaultR35VisualData.js';
import {
  sampleClosedTrackPath,
  solveSupportedTrackPath
} from '../src/world/vehicles/TrackPathSolver.js';
import {
  createRenaultR35Mesh
} from '../src/world/vehicles/RenaultR35.js';

const TRACK = RENAULT_R35_VISUAL_DATA.geometry.runningGear.trackPath;

test('R35 track centreline derives from ten registered wheel and roller supports', () => {
  const path = solveSupportedTrackPath(TRACK);
  assert.equal(path.model, 'wheel-supported-quasi-static-v1');
  assert.equal(path.supports.length, 10);
  assert.deepEqual(
    path.supports.map(support => support.id).sort(),
    [
      'drive-sprocket',
      'idler-wheel',
      'return-roller-1',
      'return-roller-2',
      'return-roller-3',
      'road-wheel-1',
      'road-wheel-2',
      'road-wheel-3',
      'road-wheel-4',
      'road-wheel-5'
    ]
  );
  const registration = TRACK.sourceRegistration;
  const metersPerPixel = 4.02 / (
    registration.rigidRearPixelX - registration.rigidFrontPixelX
  );
  const verticalMetersPerPixel = 2.13 / (
    registration.groundLinePixelY - registration.rigidTopPixelY
  );
  const originPixelX = (
    registration.rigidFrontPixelX + registration.rigidRearPixelX
  ) * 0.5;
  const configuredSupports = [
    TRACK.driveSprocket,
    TRACK.idlerWheel,
    ...TRACK.roadWheels,
    ...TRACK.returnRollers
  ];
  for (const support of configuredSupports) {
    const [pixelX, pixelY] = support.sourcePixels;
    assert.ok(Math.abs(
      support.centerY
      - (registration.groundLinePixelY - pixelY) * verticalMetersPerPixel
    ) < 1e-9);
    assert.ok(Math.abs(
      support.centerZ - (originPixelX - pixelX) * metersPerPixel
    ) < 1e-9);
    assert.ok(Math.abs(
      support.radius - support.sourceRadiusPixels * metersPerPixel
    ) < 1e-9);
  }
  assert.ok(path.bounds.minZ > -2.01);
  assert.ok(path.bounds.maxZ < 2.01);
  assert.ok(path.bounds.minY > 0);
  assert.ok(path.maximumSagMeters > 0);
  assert.ok(path.maximumSagMeters < 0.01);
  assert.ok(
    TRACK.idlerWheel.centerY < TRACK.driveSprocket.centerY,
    'rear idler axle must remain below the front drive sprocket datum'
  );
  assert.ok(
    TRACK.sourceRegistration.supports.idlerWheel.centerPixels[1]
      > TRACK.sourceRegistration.supports.driveSprocket.centerPixels[1],
    'lower rear idler must be visible in source-pixel registration'
  );
});

test('track gravity sag responds deterministically to physical tension', () => {
  const taut = solveSupportedTrackPath(TRACK);
  const loose = solveSupportedTrackPath({
    ...TRACK,
    tensionNewtons: TRACK.tensionNewtons / 2
  });
  const repeated = solveSupportedTrackPath(TRACK);
  assert.deepEqual(repeated, taut);
  assert.ok(loose.maximumSagMeters > taut.maximumSagMeters * 1.9);
  assert.ok(loose.maximumSagMeters < taut.maximumSagMeters * 2.1);
});

test('closed track sampling has normalized tangents and outward normals', () => {
  const path = solveSupportedTrackPath(TRACK);
  const sampled = sampleClosedTrackPath(path, 0.15);
  assert.ok(sampled.count >= 18);
  assert.equal(sampled.samples.length, sampled.count);
  for (const sample of sampled.samples) {
    assert.ok(Math.abs(Math.hypot(
      sample.tangentY,
      sample.tangentZ
    ) - 1) < 1e-9);
    assert.ok(Math.abs(
      sample.tangentY * sample.outwardY
      + sample.tangentZ * sample.outwardZ
    ) < 1e-9);
  }
});

test('R35 detail and proxy tiers consume the same solved support contract', () => {
  const vehicle = createRenaultR35Mesh();
  const detail = vehicle.getObjectByName('R35RunningGear');
  const proxy = vehicle.getObjectByName('R35SupportedTrackProxy');
  assert.equal(
    detail.userData.runningGearType,
    'wheel-supported-quasi-static-track'
  );
  assert.equal(
    proxy.userData.runningGearType,
    'wheel-supported-quasi-static-proxy'
  );
  assert.deepEqual(detail.userData.trackPath, proxy.userData.trackPath);
  assert.equal(detail.userData.trackParts.returnRollers.length, 6);
  assert.equal(
    vehicle.getObjectByName('ProxyLeftTrackLinks').userData.trackPathMode,
    'wheel-supported-quasi-static-v1'
  );
  assert.equal(vehicle.getObjectByName('ProxyLeftTrackBelt'), undefined);
});
