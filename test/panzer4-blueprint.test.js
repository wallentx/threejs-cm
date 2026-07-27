import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  PANZER_IV_D_BLUEPRINT_CALIBRATION,
  createPanzerIVMesh
} from '../src/world/vehicles/PanzerIV.js';

function signedVolume(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  for (let offset = 0; offset < index.count; offset += 3) {
    a.fromBufferAttribute(position, index.getX(offset));
    b.fromBufferAttribute(position, index.getX(offset + 1));
    c.fromBufferAttribute(position, index.getX(offset + 2));
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume;
}

function detailedRigidBounds(vehicle) {
  vehicle.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  vehicle.traverse(object => {
    if (!object.isMesh
      || object.userData.lodBand === 'proxy'
      || object.userData.lodBand === 'ui'
      || ['weaponProjection', 'flexibleAttachment'].includes(object.userData.envelopeRole)) {
      return;
    }
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  return bounds;
}

test('Panzer IV Ausf. D preserves its exact rigid envelope and reproducible registration', () => {
  const vehicle = createPanzerIVMesh();
  const metadata = vehicle.userData.modelMetadata;
  assert.deepEqual(metadata.dimensionsMeters, { length: 5.92, width: 2.84, height: 2.68 });
  assert.equal(metadata.blueprintCalibration, PANZER_IV_D_BLUEPRINT_CALIBRATION);
  assert.match(
    metadata.blueprintCalibration.sources[0].imageUrl,
    /sdkfz161-pzkpfwiv-ausfd-8\.png$/
  );
  assert.deepEqual(
    metadata.blueprintCalibration.imageRegistration.side.cropPixels,
    { x: 20, y: 15, width: 1060, height: 500 }
  );
  assert.match(
    metadata.blueprintCalibration.datums.registeredInferred.quality,
    /not claimed factory measurements/
  );

  const bounds = detailedRigidBounds(vehicle);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.z - 5.92) < 1e-5);
  assert.ok(Math.abs(size.x - 2.84) < 1e-5);
  assert.ok(Math.abs(bounds.max.y - 2.68) < 1e-5);
  assert.ok(bounds.min.y < 0.02, 'closed track must contact the ground plane');
});

test('Panzer IV Ausf. D running gear keeps eight wheels, four bogies, and front drive', () => {
  const vehicle = createPanzerIVMesh();
  const parts = vehicle.userData.runningGear.userData.trackParts;
  assert.equal(parts.roadWheels.length, 16);
  assert.deepEqual(
    parts.roadWheels.slice(0, 8).map(wheel => Number(wheel.position.z.toFixed(2))),
    [1.90, 1.39, 0.88, 0.37, -0.09, -0.61, -1.11, -1.62]
  );
  assert.ok(parts.sprockets.every(wheel => wheel.position.z > 0), 'drive sprockets belong at front');
  assert.ok(parts.idlers.every(wheel => wheel.position.z < 0), 'idlers belong at rear');
  assert.equal(vehicle.children.filter(object => /PanzerIVBogie_/.test(object.name)).length, 8);
  assert.equal(
    vehicle.children.filter(object => /PanzerIVReturnRoller_/.test(object.name)).length,
    8
  );
});

test('Panzer IV Ausf. D authored hull and turret remain closed and outward-wound', () => {
  const vehicle = createPanzerIVMesh();
  for (const name of [
    'PanzerIVD_PrimaryHull',
    'PanzerIVD_SteppedSuperstructure',
    'PanzerIVD_FacetedTurret'
  ]) {
    const part = vehicle.getObjectByName(name);
    assert.ok(part, `${name} must exist`);
    assert.ok(signedVolume(part.geometry) > 0, `${name} must face outward`);
    assert.ok(part.geometry.userData.signedVolumeCubicMeters > 0);
  }
});

test('Panzer IV Ausf. D armament and far proxy preserve silhouette ownership', () => {
  const vehicle = createPanzerIVMesh();
  assert.equal(vehicle.userData.muzzle.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.barrel.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.barrel.userData.envelopeRole, 'weaponProjection');
  assert.equal(vehicle.getObjectByName('coax_barrel').userData.mountSide, 'right');
  assert.equal(vehicle.getObjectByName('PanzerIVD_HullMGBallMount').userData.mountSide, 'right');
  assert.ok(vehicle.getObjectByName('ProxyLeftTrackBelt'));
  assert.ok(vehicle.getObjectByName('ProxyRightTrackBelt'));
  assert.equal(vehicle.getObjectByName('ProxyRoadWheels').count, 16);
  assert.ok(vehicle.getObjectByName('PanzerIVD_ProxyLowerHull'));
  assert.ok(vehicle.getObjectByName('PanzerIVD_ProxySuperstructureHull'));
});
