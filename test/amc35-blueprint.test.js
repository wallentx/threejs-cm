import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAMC35Mesh } from '../src/world/vehicles/AMC35.js';

function geometrySignedVolume(geometry) {
  const positions = geometry.attributes.position;
  const index = geometry.index;
  let volume = 0;
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, index.getX(offset));
    const b = new THREE.Vector3().fromBufferAttribute(positions, index.getX(offset + 1));
    const c = new THREE.Vector3().fromBufferAttribute(positions, index.getX(offset + 2));
    volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
  }
  return volume;
}

function rigidBounds(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  root.traverse(object => {
    if (!object.isMesh
      || object.userData.lodBand === 'proxy'
      || object.userData.envelopeRole === 'weaponProjection') return;
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  return bounds;
}

test('AMC 35 preserves its exact rigid envelope and reaches the ground', () => {
  const mesh = createAMC35Mesh();
  const bounds = rigidBounds(mesh);
  const size = bounds.getSize(new THREE.Vector3());

  assert.ok(Math.abs(size.z - 4.55) < 1e-3, `length ${size.z}`);
  assert.ok(Math.abs(size.x - 2.24) < 1e-3, `width ${size.x}`);
  assert.ok(Math.abs(bounds.max.y - 2.30) < 1e-3, `height ${bounds.max.y}`);
  assert.ok(Math.abs(bounds.min.y) < 1e-3, `ground contact ${bounds.min.y}`);
  assert.deepEqual(mesh.userData.modelMetadata.dimensionsMeters, {
    length: 4.55,
    width: 2.24,
    height: 2.30
  });
});

test('AMC 35 authored hull and APX 2 turret are closed and outward wound', () => {
  const mesh = createAMC35Mesh();
  const hull = mesh.getObjectByName('AMC35_PrimaryHull');
  const superstructure = mesh.getObjectByName('AMC35_RivetedSuperstructure');
  const turret = mesh.getObjectByName('AMC35_APX2Turret');

  assert.equal(hull.userData.authoredHull, true);
  assert.equal(hull.userData.profileStationCount, 7);
  assert.equal(superstructure.userData.profileStationCount, 6);
  for (const part of [hull, superstructure, turret]) {
    assert.equal(part.geometry.userData.outwardWinding, true, part.name);
    assert.ok(geometrySignedVolume(part.geometry) > 0, `${part.name} signed volume`);
    assert.equal(part.geometry.attributes.uv.count, part.geometry.attributes.position.count);
  }
});

test('AMC 35 exposes blueprint mechanical landmarks and correct five-wheel layout', () => {
  const mesh = createAMC35Mesh();
  const metadata = mesh.userData.modelMetadata;
  const gear = mesh.userData.runningGear;
  const datums = metadata.calibration.datumsMeters;

  assert.equal(metadata.references[0].url.includes('Renault_Type_ACG_1'), true);
  assert.equal(metadata.references[0].license, 'CC BY 4.0');
  assert.equal(metadata.references[1].url, 'https://museedesblindes.fr/les_chars/amc-35/');
  assert.equal(datums.turretRing.quality, 'drawing-inferred');
  assert.equal(datums.roadWheelCentersZ.value.length, 5);
  assert.equal(gear.userData.trackParts.roadWheels.length, 10);
  assert.equal(gear.userData.trackParts.sprockets.length, 2);
  assert.equal(gear.userData.trackParts.idlers.length, 2);

  const leftWheels = gear.userData.trackParts.roadWheels
    .filter(wheel => wheel.userData.semanticSide === 'left')
    .map(wheel => Number(wheel.position.z.toFixed(2)));
  assert.deepEqual(leftWheels, [1.15, 0.58, -0.08, -0.70, -1.35]);
});

test('AMC 35 SA 35 muzzle follows +Z but does not overhang the rigid nose', () => {
  const mesh = createAMC35Mesh();
  const turret = mesh.userData.turret;
  const muzzle = mesh.userData.muzzle;
  const worldMuzzle = muzzle.getWorldPosition(new THREE.Vector3());

  assert.equal(muzzle.userData.forwardAxis, '+Z');
  assert.equal(mesh.userData.barrel.userData.weaponMountId, 'main');
  assert.deepEqual(
    worldMuzzle.toArray().map(value => Number(value.toFixed(2))),
    [-0.10, 1.86, 1.23]
  );
  assert.ok(worldMuzzle.z < 2.275);
  assert.deepEqual(
    turret.position.toArray().map(value => Number(value.toFixed(2))),
    [0, 1.60, -0.10]
  );
});

test('AMC 35 base factory supplies distinct high, medium, core, and proxy tiers', () => {
  const mesh = createAMC35Mesh();
  const bands = new Set();
  mesh.traverse(object => {
    if (object.userData.lodBand) bands.add(object.userData.lodBand);
  });
  assert.deepEqual([...bands].sort(), ['core', 'high', 'medium', 'proxy']);
  assert.ok(mesh.getObjectByName('AMC35_ProxyHull'));
  assert.ok(mesh.getObjectByName('AMC35_ProxySuperstructure'));
  assert.ok(mesh.getObjectByName('AMC35_ProxyTurretRing'));
  assert.ok(mesh.getObjectByName('AMC35_ProxyAPX2'));
  assert.ok(mesh.getObjectByName('AMC35_ProxySA35'));
});
