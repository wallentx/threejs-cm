import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPanzer35tMesh } from '../src/world/vehicles/Panzer35t.js';

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

test('Panzer 35(t) keeps its exact rigid envelope and reproducible source registration', () => {
  const vehicle = createPanzer35tMesh();
  const metadata = vehicle.userData.modelMetadata;
  assert.deepEqual(metadata.dimensionsMeters, { length: 4.90, width: 2.06, height: 2.37 });
  assert.match(metadata.blueprintCalibration.source.imageUrl, /ge049pz35\.jpg$/);
  assert.deepEqual(
    metadata.blueprintCalibration.imageRegistration.side.cropPixels,
    { x: 205, y: 170, width: 810, height: 380 }
  );
  assert.equal(metadata.blueprintCalibration.exactDatums.trackWidthMeters, 0.32);
  assert.equal(metadata.blueprintCalibration.exactDatums.turretRingDiameterMeters, 1.267);
  assert.match(metadata.blueprintCalibration.inferredDatums.note, /inferred/);

  const bounds = detailedRigidBounds(vehicle);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.z - 4.90) < 1e-5);
  assert.ok(Math.abs(size.x - 2.06) < 1e-5);
  assert.ok(Math.abs(bounds.max.y - 2.37) < 1e-5);
  assert.ok(bounds.min.y < 0.02, 'closed track must contact the ground plane');
});

test('Panzer 35(t) running gear preserves four twin bogies and rear drive', () => {
  const vehicle = createPanzer35tMesh();
  const runningGear = vehicle.userData.runningGear;
  const parts = runningGear.userData.trackParts;
  assert.equal(parts.roadWheels.length, 16);
  assert.deepEqual(
    parts.roadWheels.slice(0, 8).map(wheel => Number(wheel.position.z.toFixed(2))),
    [1.46, 1.05, 0.60, 0.21, -0.40, -0.81, -1.28, -1.65]
  );
  assert.ok(parts.sprockets.every(wheel => wheel.position.z < 0), 'drive sprockets belong at rear');
  assert.ok(parts.idlers.every(wheel => wheel.position.z > 0), 'idlers belong at front');
  assert.equal(
    vehicle.children.filter(object => /TwinBogie_/.test(object.name)).length,
    8
  );
  assert.equal(
    vehicle.children.filter(object => /ReturnRoller_/.test(object.name)).length,
    8
  );
});

test('Panzer 35(t) authored hull and turret remain closed and outward-wound', () => {
  const vehicle = createPanzer35tMesh();
  for (const name of [
    'Panzer35t_PrimaryHull',
    'Panzer35t_FightingCompartment',
    'Panzer35t_EngineDeck',
    'Panzer35t_RivetedTurret'
  ]) {
    const part = vehicle.getObjectByName(name);
    assert.ok(part, `${name} must exist`);
    assert.ok(signedVolume(part.geometry) > 0, `${name} must face outward`);
    assert.ok(part.geometry.userData.signedVolumeCubicMeters > 0);
  }
});

test('Panzer 35(t) gun and proxy retain articulated silhouette ownership', () => {
  const vehicle = createPanzer35tMesh();
  assert.equal(vehicle.userData.muzzle.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.barrel.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.barrel.userData.envelopeRole, 'weaponProjection');
  assert.equal(vehicle.getObjectByName('Panzer35t_CoaxBallMount').userData.mountSide, 'right');
  assert.equal(vehicle.getObjectByName('Panzer35t_HullMGBallMount').userData.mountSide, 'right');
  assert.ok(vehicle.getObjectByName('ProxyLeftTrackBelt'));
  assert.ok(vehicle.getObjectByName('ProxyRightTrackBelt'));
  assert.equal(vehicle.getObjectByName('ProxyRoadWheels').count, 16);
  assert.ok(
    vehicle.getObjectByName('Panzer35t_ProxyFightingHull'),
    'far LOD must preserve fighting-compartment step'
  );
  assert.ok(
    vehicle.getObjectByName('Panzer35t_ProxyEngineHull'),
    'far LOD must preserve rear engine-deck slope'
  );
});
