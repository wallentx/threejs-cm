import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSdKfz231Mesh } from '../src/world/vehicles/SdKfz231.js';

const EXPECTED = Object.freeze({
  length: 5.57,
  width: 1.82,
  height: 2.25,
  axleZ: Object.freeze([1.86, -0.65, -1.59]),
  wheelRadius: 0.43,
  turretCenterZ: -0.70,
  turretRingY: 1.72,
  gunAxisY: 1.90,
  muzzleZ: 0.96
});

function signedVolume(geometry) {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let volume = 0;
  const triangleCount = index ? index.count / 3 : positions.count / 3;
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const ia = index ? index.getX(triangle * 3) : triangle * 3;
    const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
    a.fromBufferAttribute(positions, ia);
    b.fromBufferAttribute(positions, ib);
    c.fromBufferAttribute(positions, ic);
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  }
  return volume;
}

function boundsForBand(root, proxy) {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  root.traverse(object => {
    if (!object.isMesh) return;
    const isProxy = object.userData.lodBand === 'proxy';
    if (isProxy !== proxy) return;
    if (object.userData.envelopeRole === 'weaponProjection') return;
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  return bounds;
}

test('Sd.Kfz. 231 6-Rad detailed and proxy tiers retain the exact rigid envelope', () => {
  const vehicle = createSdKfz231Mesh();
  for (const proxy of [false, true]) {
    const bounds = boundsForBand(vehicle, proxy);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.z - EXPECTED.length) < 1e-3, `${proxy ? 'proxy' : 'detail'} length ${size.z}`);
    assert.ok(Math.abs(size.x - EXPECTED.width) < 1e-3, `${proxy ? 'proxy' : 'detail'} width ${size.x}`);
    assert.ok(Math.abs(bounds.max.y - EXPECTED.height) < 1e-3, `${proxy ? 'proxy' : 'detail'} height ${bounds.max.y}`);
    assert.ok(Math.abs(bounds.min.y) < 1e-3, `${proxy ? 'proxy' : 'detail'} ground ${bounds.min.y}`);
  }
  assert.deepEqual(vehicle.userData.modelMetadata.dimensionsMeters, {
    length: EXPECTED.length,
    width: EXPECTED.width,
    height: EXPECTED.height
  });
});

test('Sd.Kfz. 231 6-Rad uses registered three-axle tandem-dual running gear', () => {
  const vehicle = createSdKfz231Mesh();
  const wheels = vehicle.userData.runningGear.wheels;
  assert.equal(wheels.length, 10, 'single front tires plus tandem dual rear tires');
  assert.deepEqual(vehicle.userData.runningGear.axleZ, EXPECTED.axleZ);
  assert.equal(
    new Set(wheels.map(wheel => Number(wheel.position.z.toFixed(2)))).size,
    3
  );
  assert.equal(
    wheels.filter(wheel => wheel.name.includes('_DualTire_')).length,
    4
  );
  for (const wheel of wheels) {
    wheel.geometry.computeBoundingBox();
    const diameter = wheel.geometry.boundingBox.getSize(new THREE.Vector3()).z;
    assert.ok(Math.abs(diameter - EXPECTED.wheelRadius * 2) < 1e-6);
  }
});

test('Sd.Kfz. 231 6-Rad registered hull and horseshoe turret face outward', () => {
  const vehicle = createSdKfz231Mesh();
  const hull = vehicle.getObjectByName('SdKfz231_6Rad_PrimaryHull');
  const turret = vehicle.getObjectByName('SdKfz231_6Rad_HorseshoeTurret');
  assert.equal(hull.userData.profileStationCount, 11);
  assert.equal(turret.userData.profileLevelCount, 4);
  for (const mesh of [hull, turret]) {
    assert.equal(mesh.geometry.userData.outwardWinding, true, mesh.name);
    assert.ok(signedVolume(mesh.geometry) > 0, `${mesh.name} signed volume`);
    assert.equal(
      mesh.geometry.getAttribute('uv').count,
      mesh.geometry.getAttribute('position').count
    );
  }
});

test('Sd.Kfz. 231 6-Rad turret, gun, coax, and far proxy preserve articulation', () => {
  const vehicle = createSdKfz231Mesh();
  const turret = vehicle.userData.turret;
  const barrel = vehicle.userData.barrel;
  const muzzle = vehicle.userData.muzzle;
  const coax = vehicle.getObjectByName('coax_barrel');
  vehicle.updateWorldMatrix(true, true);
  const muzzleWorld = muzzle.getWorldPosition(new THREE.Vector3());

  assert.deepEqual(
    turret.position.toArray().map(value => Number(value.toFixed(2))),
    [0, EXPECTED.turretRingY, EXPECTED.turretCenterZ]
  );
  assert.ok(Math.abs(muzzleWorld.y - EXPECTED.gunAxisY) < 1e-9);
  assert.ok(Math.abs(muzzleWorld.z - EXPECTED.muzzleZ) < 1e-9);
  assert.equal(muzzle.userData.forwardAxis, '+Z');
  assert.equal(barrel.userData.weaponMountId, 'main');
  assert.equal(coax.userData.mountSide, 'right');
  assert.ok(coax.position.x < muzzle.position.x);
  assert.equal(vehicle.userData.proxyTurret.parent, turret);
  assert.equal(vehicle.userData.proxyBarrel.parent, barrel);

  const bands = new Set();
  vehicle.traverse(object => {
    if (object.userData.lodBand) bands.add(object.userData.lodBand);
  });
  assert.deepEqual([...bands].sort(), ['core', 'high', 'medium', 'proxy']);
});

test('Sd.Kfz. 231 6-Rad calibration metadata records source transforms and uncertainty', () => {
  const calibration = createSdKfz231Mesh().userData.blueprintCalibration;
  assert.equal(calibration.variant.includes('not Sd.Kfz. 231 (8-Rad)'), true);
  assert.equal(calibration.source.author, 'Spike Rendchen');
  assert.equal(calibration.source.license, 'CC BY-SA 3.0 / GFDL');
  assert.deepEqual(calibration.source.sourceImagePixels, [600, 800]);
  assert.deepEqual(calibration.registration.side.originPixels, [302.5, 254]);
  assert.equal(calibration.registration.top.rotationDegrees, 90);
  assert.equal(calibration.datums.rigidEnvelope.quality, 'historical exact');
  assert.match(calibration.datums.axleCenters.quality, /inference/);
  assert.ok(calibration.allowedDivergences.length >= 3);
});
