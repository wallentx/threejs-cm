import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPanzerIIMesh } from '../src/world/vehicles/PanzerII.js';

function rigidBounds(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  root.traverse(object => {
    if (
      !object.isMesh
      || object.userData.lodBand === 'proxy'
      || object.userData.lodBand === 'ui'
      || ['flexibleAttachment', 'weaponProjection'].includes(object.userData.envelopeRole)
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

test('Panzer II Ausf. C emitted geometry holds the registered rigid envelope', () => {
  const vehicle = createPanzerIIMesh();
  const bounds = rigidBounds(vehicle);
  const size = bounds.getSize(new THREE.Vector3());

  assertNear(size.z, 4.81, 0.001, 'rigid length');
  assertNear(size.x, 2.22, 0.006, 'rigid width');
  assertNear(bounds.min.y, 0, 0.002, 'ground contact');
  assertNear(bounds.max.y, 1.99, 0.001, 'rigid height');
  assert.deepEqual(vehicle.userData.modelMetadata.dimensionsMeters, {
    length: 4.81,
    width: 2.22,
    height: 1.99
  });
  assert.match(vehicle.userData.modelMetadata.dimensionPolicy, /excludes weapon projection/);
});

test('Panzer II calibration metadata distinguishes exact dimensions from inferred profile datums', () => {
  const vehicle = createPanzerIIMesh();
  const calibration = vehicle.userData.modelMetadata.blueprintCalibration;

  assert.equal(
    calibration.source.previewUrl,
    'https://www.the-blueprints.com/blueprints-depot/tanks/ww2-tanks-germany-2/sdkfz121-pzkpfwii-ausfc-2-3.png'
  );
  assert.equal(
    calibration.reproducibleSecondarySource.license,
    'public domain dedication'
  );
  assert.deepEqual(calibration.registration.sourceImagePixels, [1671, 698]);
  assert.equal(calibration.registration.mirrorX, false);
  assert.match(calibration.registration.quality, /registered to exact rigid length\/height/);
  assert.equal(calibration.datums.rigidEnvelope.quality, 'historical exact');
  assert.match(calibration.datums.roadWheelCenters.quality, /inferred/);
  assert.match(calibration.datums.turretLateralOffset.quality, /inferred/);
  assert.match(calibration.datums.gunAxis.quality, /inferred/);
});

test('Panzer II uses the five-wheel leaf-spring layout from the registered side elevation', () => {
  const vehicle = createPanzerIIMesh();
  const gear = vehicle.userData.runningGear;
  const parts = gear.userData.trackParts;
  const expectedZ = [-1.15, -0.55, 0.05, 0.65, 1.25];
  const leftWheels = parts.roadWheels
    .filter(wheel => wheel.userData.semanticSide === 'left')
    .sort((a, b) => a.position.z - b.position.z);

  assert.equal(leftWheels.length, 5);
  assert.deepEqual(leftWheels.map(wheel => Number(wheel.position.z.toFixed(2))), expectedZ);
  assert.ok(leftWheels.every(wheel => Math.abs(wheel.position.y - 0.35) < 1e-9));
  assert.ok(parts.sprockets.every(wheel => Math.abs(wheel.position.z - 1.93) < 1e-9));
  assert.ok(parts.idlers.every(wheel => Math.abs(wheel.position.z + 1.84) < 1e-9));
  assert.equal(gear.userData.runningGearType, 'blueprint-refit-closed-track-belt');
  assert.ok(parts.tracks.every(track => (
    track.links.userData.pathSource === 'registered-Ausf-C-side-elevation'
  )));

  const suspension = vehicle.userData.leafSpringSuspension;
  assert.equal(suspension.children.length, 10);
  assert.ok(suspension.children.every(spring => spring.children.length === 5));
  assert.equal(vehicle.userData.returnRollers.children.length, 8);
  assert.equal(vehicle.userData.modelMetadata.runningGear.roadWheelsPerSide, 5);
  assert.equal(vehicle.userData.modelMetadata.runningGear.returnRollersPerSide, 4);
});

test('Panzer II turret is seated, vehicle-left offset, outward-wound, and weapon-aligned', () => {
  const vehicle = createPanzerIIMesh();
  const turretGroup = vehicle.userData.turret;
  const turret = vehicle.userData.turretShell;
  const upperHull = vehicle.getObjectByName('PanzerIIC_SteppedSuperstructure');
  upperHull.geometry.computeBoundingBox();
  turret.geometry.computeBoundingBox();

  assert.ok(turretGroup.position.x > 0, '+X is vehicle-left');
  assertNear(turretGroup.position.y, upperHull.geometry.boundingBox.max.y, 1e-6, 'turret seat');
  assertNear(turret.geometry.boundingBox.min.y, 0, 1e-6, 'turret local floor');
  assert.ok(turret.geometry.userData.orientationChecked);
  assert.ok(turret.geometry.userData.signedVolume > 0);
  assert.ok(vehicle.userData.hull.geometry.userData.signedVolume > 0);

  const muzzle = vehicle.userData.muzzle;
  const coax = turretGroup.getObjectByName('coax_barrel');
  assert.equal(muzzle.parent, turretGroup);
  assertNear(muzzle.position.z, 1.64, 1e-9, 'main muzzle local Z');
  assert.ok(coax.position.x < muzzle.position.x, 'right-side coax uses -X');
  assert.equal(coax.userData.mountSide, 'right');
  assert.equal(coax.userData.weaponMountId, 'coax');
  assert.equal(vehicle.userData.barrel.userData.weaponIdentity, '2 cm KwK 30 L/55');
});

test('Panzer II proxy retains hull, five-wheel tracks, turret, and gun silhouette', () => {
  const vehicle = createPanzerIIMesh();
  const proxy = vehicle.getObjectByName('Proxy');
  const proxyMeshes = [];
  proxy.traverse(object => {
    if (object.isMesh && object.userData.lodBand === 'proxy') proxyMeshes.push(object);
  });

  assert.ok(proxy.getObjectByName('PanzerIICProxyHull'));
  assert.ok(proxy.getObjectByName('PanzerIICProxySuperstructure'));
  assert.ok(proxy.getObjectByName('PanzerIICProxyTurret'));
  assert.ok(proxy.getObjectByName('PanzerIICProxyBarrel'));
  assert.equal(proxy.getObjectByName('ProxyRoadWheels').userData.wheelsPerSide, 5);
  assert.ok(proxy.getObjectByName('ProxyLeftTrackBelt'));
  assert.ok(proxy.getObjectByName('ProxyRightTrackBelt'));
  assert.ok(proxyMeshes.length >= 7);
  assert.ok(proxyMeshes.every(mesh => mesh.visible === false));
});
