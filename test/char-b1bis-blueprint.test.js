import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CHAR_B1_BIS_BLUEPRINT_CALIBRATION,
  createCharB1BisMesh
} from '../src/world/vehicles/CharB1Bis.js';

function rigidBounds(model) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const objectBounds = new THREE.Box3();
  model.traverse(object => {
    if (!object.isMesh && !object.isInstancedMesh) return;
    if (object.userData.envelopeRole === 'weaponProjection'
        || object.userData.envelopeRole === 'flexibleAttachment'
        || object.userData.lodBand === 'proxy') return;
    objectBounds.setFromObject(object);
    bounds.union(objectBounds);
  });
  return bounds;
}

function assertNear(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`
  );
}

test('Char B1 bis keeps exact official rigid envelope and ground contact', () => {
  const model = createCharB1BisMesh();
  const bounds = rigidBounds(model);
  const size = bounds.getSize(new THREE.Vector3());
  assertNear(size.x, 2.46, 0.025, 'width');
  assertNear(size.y, 2.79, 0.025, 'height');
  assertNear(size.z, 6.37, 0.005, 'length');
  assertNear(bounds.min.y, 0, 0.025, 'ground line');
  assert.deepEqual(
    model.userData.modelMetadata.dimensionsMeters,
    CHAR_B1_BIS_BLUEPRINT_CALIBRATION.rigidEnvelopeMeters
  );
});

test('Char B1 bis preserves full-height sixteen-wheel rear-drive identity', () => {
  const model = createCharB1BisMesh();
  const gear = model.userData.runningGear;
  assert.equal(gear.userData.trackParts.roadWheels.length, 32);
  assert.equal(gear.userData.driveLocation, 'rear');
  assert.match(gear.userData.wheelLayout, /three four-wheel bogies/);
  assert.ok(gear.userData.trackParts.sprockets.every(wheel => wheel.position.z < 0));
  assert.ok(gear.userData.trackParts.idlers.every(wheel => wheel.position.z > 0));
  assert.ok(gear.userData.dimensionsMeters.beltHeight >= 1.44);
});

test('Char B1 bis front asymmetry follows shared local-frame contract', () => {
  const model = createCharB1BisMesh();
  const hood = model.getObjectByName('CharB1Bis_LeftDriverHood');
  const visor = model.getObjectByName('CharB1Bis_DriverVisor');
  const hullGun = model.getObjectByName('CharB1_75mm_HullGun');
  const radiator = model.getObjectByName('CharB1Bis_LeftRadiatorPanel');
  const door = model.getObjectByName('CharB1Bis_RightCrewDoor');
  assert.ok(hood.position.x > 0);
  assert.ok(visor.position.x > 0);
  assert.ok(hullGun.position.x < 0);
  assert.equal(hullGun.userData.mountSide, 'right');
  assert.ok(radiator.position.x > 0);
  assert.equal(radiator.userData.semanticSide, 'left');
  assert.ok(door.position.x < 0);
  assert.equal(door.userData.semanticSide, 'right');
});

test('Char B1 bis hull and turret barrels terminate at exact muzzle markers', () => {
  const model = createCharB1BisMesh();
  for (const [barrel, marker] of [
    [model.userData.barrel, model.userData.muzzle],
    [model.userData.hullBarrel, model.userData.hullMuzzle]
  ]) {
    barrel.geometry.computeBoundingBox();
    assertNear(
      barrel.position.z + barrel.geometry.boundingBox.max.y,
      marker.position.z,
      1e-6,
      `${barrel.name} muzzle`
    );
  }
  assert.equal(model.userData.muzzle.parent, model.userData.turret);
  assert.equal(model.userData.hullMuzzle.parent, model);
});

test('Char B1 bis primary lofts are audited and every LOD has geometry', () => {
  const model = createCharB1BisMesh();
  for (const name of [
    'CharB1Bis_PrimaryHull',
    'CharB1Bis_UpperHull',
    'CharB1Bis_RaisedEngineCover',
    'CharB1Bis_LeftDriverHood',
    'CharB1Bis_APX4Turret',
    'CharB1Bis_ProxyHull',
    'CharB1Bis_ProxyUpperHull',
    'CharB1Bis_ProxyEngineCover',
    'CharB1Bis_ProxyAPX4Turret'
  ]) {
    const mesh = model.getObjectByName(name);
    assert.ok(mesh, `${name} missing`);
    assert.equal(mesh.geometry.userData.outwardWindingAudited, true);
    assert.ok(mesh.geometry.userData.signedVolume > 0);
  }
  const bands = new Set();
  model.traverse(object => {
    if (object.isMesh || object.isInstancedMesh) bands.add(object.userData.lodBand);
  });
  assert.deepEqual(
    [...bands].sort(),
    ['core', 'high', 'medium', 'proxy']
  );
  assert.ok(model.getObjectByName('CharB1Bis_ProxyCupola'));
  assert.ok(model.getObjectByName('CharB1Bis_ProxyCupolaHatch'));
  assert.ok(CHAR_B1_BIS_BLUEPRINT_CALIBRATION.sources.length >= 3);
  assert.match(
    CHAR_B1_BIS_BLUEPRINT_CALIBRATION.datums.roadWheelCentersZ.quality,
    /approximation/
  );
});
