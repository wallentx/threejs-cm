import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOpelBlitzMesh } from '../src/world/vehicles/OpelBlitz.js';

function collectBounds(root, mode = 'rigid') {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  root.traverse(object => {
    if (!object.isMesh) return;
    const isProxy = object.userData.lodBand === 'proxy';
    if ((mode === 'proxy') !== isProxy) return;
    if (
      mode === 'rigid'
      && ['surfaceDetail', 'flexibleAttachment', 'weaponProjection'].includes(
        object.userData.envelopeRole
      )
    ) return;
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  return bounds;
}

function assertNear(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`
  );
}

test('Opel Blitz emitted detail and proxy hold the documented parked envelope', () => {
  const truck = createOpelBlitzMesh();
  for (const mode of ['rigid', 'proxy']) {
    const bounds = collectBounds(truck, mode);
    const size = bounds.getSize(new THREE.Vector3());
    assertNear(size.z, 6.020, 0.001, `${mode} length`);
    assertNear(size.x, 2.270, 0.001, `${mode} width`);
    assertNear(bounds.min.y, 0, 0.001, `${mode} ground contact`);
    assertNear(bounds.max.y, 2.590, 0.001, `${mode} height`);
  }
  assert.deepEqual(truck.userData.modelMetadata.dimensionsMeters, {
    length: 6.02,
    width: 2.27,
    height: 2.59
  });
  assert.match(truck.userData.modelMetadata.dimensionPolicy, /mirrors and canvas/);
});

test('Opel Blitz calibration records all three views and source confidence', () => {
  const calibration = createOpelBlitzMesh().userData.modelMetadata.blueprintCalibration;
  assert.equal(
    calibration.dimensionSource.url,
    'https://historisk-opelklub.dk/wp-content/uploads/2012/06/Opel-Data-Leif__LKW_1899-1996.pdf'
  );
  assert.equal(
    calibration.source.previewUrl,
    'https://www.the-blueprints.com/blueprints-depot/trucks/opel/opel-blitz-36s-3-ton-kfz305.png'
  );
  assert.deepEqual(calibration.registration.sourceImagePixels, [785, 535]);
  assert.deepEqual(calibration.registration.views.side.trimmedPixels, [530, 246]);
  assert.deepEqual(calibration.registration.views.front.trimmedPixels, [201, 246]);
  assert.deepEqual(calibration.registration.views.top.trimmedPixels, [528, 201]);
  assert.match(calibration.registration.scalePolicy, /independently normalized/);
  assert.equal(calibration.datums.rigidEnvelope.quality, 'historical exact, with mirrors and canvas');
  assert.equal(calibration.datums.wheelbase.quality, 'historical exact');
  assert.match(calibration.datums.bonnetAndCabStations.quality, /inferred/);
  assert.deepEqual(calibration.resolvedConflict.previousApproximation, [6.10, 2.26, 2.56]);
});

test('Opel Blitz running gear is a 4x2 single-front and twin-rear layout', () => {
  const truck = createOpelBlitzMesh();
  const gear = truck.userData.runningGear;
  assert.equal(gear.userData.configuration, '4x2-single-front-twin-rear');
  assertNear(gear.userData.wheelbase, 3.600, 1e-9, 'wheelbase');
  assertNear(gear.userData.frontTrack, 1.542, 1e-9, 'front track');
  assertNear(gear.userData.rearTrack, 1.620, 1e-9, 'rear track');

  const front = gear.children.filter(object => /^OpelBlitz_FrontWheel_/.test(object.name));
  const rear = gear.children.filter(object => /^OpelBlitz_RearWheel_/.test(object.name));
  assert.equal(front.length, 2);
  assert.equal(rear.length, 4);
  assert.deepEqual(
    front.map(wheel => Number(wheel.position.x.toFixed(3))).sort((a, b) => a - b),
    [-0.771, 0.771]
  );
  assert.ok(front.every(wheel => Math.abs(wheel.position.z - 2.190) < 1e-9));
  assert.deepEqual(
    rear.map(wheel => Number(wheel.position.x.toFixed(3))).sort((a, b) => a - b),
    [-0.915, -0.705, 0.705, 0.915]
  );
  assert.ok(rear.every(wheel => Math.abs(wheel.position.z + 1.410) < 1e-9));

  const frontSprings = gear.children.filter(object => /^OpelBlitz_FrontSpring_/.test(object.name));
  const rearSprings = gear.children.filter(object => /^OpelBlitz_RearSpring_/.test(object.name));
  assert.ok(frontSprings.every(spring => spring.userData.leafCount === 10));
  assert.ok(rearSprings.every(spring => spring.userData.leafCount === 9));
});

test('Opel Blitz cab and bonnet are outward-wound registered station lofts', () => {
  const truck = createOpelBlitzMesh();
  for (const part of [truck.userData.cab, truck.userData.bonnet]) {
    assert.ok(part.geometry.userData.orientationChecked);
    assert.ok(part.geometry.userData.signedVolume > 0);
    assert.equal(part.userData.stationSource, 'registered-front-side-top-elevations');
  }

  const cabBounds = new THREE.Box3().setFromObject(truck.userData.cab);
  const bonnetBounds = new THREE.Box3().setFromObject(truck.userData.bonnet);
  assert.ok(cabBounds.max.y < 2.0, 'cab roof remains below the cargo tilt');
  assert.ok(bonnetBounds.max.y < 1.45, 'bonnet keeps the low 3.6-36 S profile');
  assert.ok(bonnetBounds.max.z > cabBounds.max.z, 'bonnet projects forward of cab');
});

test('Opel Blitz bed and shallow canvas crown match the registered cargo body', () => {
  const truck = createOpelBlitzMesh();
  const floor = truck.getObjectByName('OpelBlitz_CargoFloor');
  floor.geometry.computeBoundingBox();
  const floorSize = floor.geometry.boundingBox.getSize(new THREE.Vector3());
  assertNear(floorSize.x, 2.125, 0.001, 'bed width');
  assertNear(floorSize.z, 3.500, 0.001, 'bed length');
  assertNear(floor.position.z, -1.150, 1e-9, 'bed center');

  const canvas = truck.userData.canvas;
  const canvasBounds = new THREE.Box3().setFromObject(canvas);
  assertNear(canvasBounds.max.y, 2.590, 0.001, 'canvas crown height');
  assert.ok(canvas.userData.crownHeight < 0.20, 'canvas has a shallow crown');
  assertNear(canvasBounds.getSize(new THREE.Vector3()).x, 2.125, 0.001, 'canvas width');
});

test('Opel Blitz LOD contract retains defining silhouette and explicit materials', () => {
  const truck = createOpelBlitzMesh();
  const bands = new Set();
  const slots = new Set();
  truck.traverse(object => {
    if (!object.isMesh) return;
    bands.add(object.userData.lodBand);
    slots.add(object.material.userData.vehicleMaterialSlot);
    assert.equal(object.castShadow, true, `${object.name} casts shadows`);
    assert.equal(object.receiveShadow, true, `${object.name} receives shadows`);
  });
  assert.deepEqual([...bands].sort(), ['core', 'high', 'medium', 'proxy']);
  assert.deepEqual([...slots].sort(), ['canvas', 'metal', 'paint', 'rubber', 'wood']);

  const proxy = truck.getObjectByName('Proxy');
  assert.equal(proxy.userData.authored, true);
  for (const name of [
    'OpelBlitz_ProxyBonnet',
    'OpelBlitz_ProxyCab',
    'OpelBlitz_ProxyBed',
    'OpelBlitz_ProxyCanvas',
    'OpelBlitz_ProxyFrontBumper',
    'OpelBlitz_ProxyRearBumper'
  ]) {
    assert.ok(proxy.getObjectByName(name), `${name} survives in far silhouette`);
  }
  assert.equal(
    proxy.children.filter(object => object.name.startsWith('OpelBlitz_ProxyWheel_')).length,
    4
  );
});
