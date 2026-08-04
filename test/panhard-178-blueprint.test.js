import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPanhard178Mesh } from '../src/world/vehicles/index.js';
import { assertClosedConsistentWinding } from './helpers/GeometryTopologyAssertions.js';

const EXPECTED = Object.freeze({
  length: 4.79,
  width: 2.01,
  height: 2.31,
  wheelbase: 3.12,
  wheelTread: 1.737,
  tireDiameter: 1.067,
  turretCenterZ: 0.24,
  turretDeckY: 1.65,
  gunAxisY: 1.92,
  muzzleZ: 2.395
});

function meshSignedVolume(mesh) {
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute('position');
  const indices = geometry.index;
  let volume = 0;
  const triangleCount = indices ? indices.count / 3 : positions.count / 3;

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const ai = indices ? indices.getX(triangle * 3) : triangle * 3;
    const bi = indices ? indices.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const ci = indices ? indices.getX(triangle * 3 + 2) : triangle * 3 + 2;
    const a = new THREE.Vector3().fromBufferAttribute(positions, ai);
    const b = new THREE.Vector3().fromBufferAttribute(positions, bi);
    const c = new THREE.Vector3().fromBufferAttribute(positions, ci);
    volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
  }
  return volume;
}

test('Panhard 178 retains exact published envelope and running-gear datums', () => {
  const vehicle = createPanhard178Mesh();
  vehicle.updateMatrixWorld(true);

  const bounds = new THREE.Box3();
  vehicle.traverse(object => {
    if (!object.isMesh
      || object.userData.lodBand === 'proxy'
      || object.userData.lodBand === 'ui'
      || ['flexibleAttachment', 'weaponProjection'].includes(object.userData.envelopeRole)) return;
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  const measured = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(measured.z - EXPECTED.length) < 0.01);
  assert.ok(Math.abs(measured.x - EXPECTED.width) < 0.01);
  assert.ok(Math.abs(bounds.max.y - EXPECTED.height) < 0.01);
  assert.ok(bounds.min.y < 0.001);

  const wheels = [];
  vehicle.traverse(object => {
    if (object.name.startsWith('Panhard178_Wheel_')) wheels.push(object);
  });
  assert.equal(wheels.length, 4);
  const axleCenters = [...new Set(wheels.map(wheel => wheel.position.z))].sort((a, b) => a - b);
  assert.equal(axleCenters.length, 2);
  assert.ok(Math.abs(axleCenters[1] - axleCenters[0] - EXPECTED.wheelbase) < 1e-9);
  assert.ok(Math.abs(Math.abs(wheels[0].position.x) * 2 - EXPECTED.wheelTread) < 1e-9);
  wheels[0].geometry.computeBoundingBox();
  const wheelDiameter = wheels[0].geometry.boundingBox.getSize(new THREE.Vector3()).x;
  assert.ok(Math.abs(wheelDiameter - EXPECTED.tireDiameter) < 1e-6);
});

test('Panhard 178 blueprint metadata separates exact and inferred landmarks', () => {
  const vehicle = createPanhard178Mesh();
  const calibration = vehicle.userData.blueprintCalibration;
  assert.equal(calibration.coordinateFrame, '+Y up, +Z forward, metres');
  assert.ok(calibration.registration.exact.includes('3.12 m axle-center wheelbase'));
  assert.ok(calibration.registration.inferredFromOrthographic.includes('nine hull stations'));
  assert.match(calibration.sourceEvidence.exactDimensionsAndRunningGear, /^https:\/\//);
  assert.match(calibration.sourceEvidence.orthographicContour, /^https:\/\//);
  assert.match(calibration.sourceEvidence.periodFrontReference, /^https:\/\//);

  const hull = vehicle.getObjectByName('Panhard178_PrimaryHull');
  assert.equal(hull.userData.profileStationCount, 9);
  assert.equal(hull.userData.profileSource, 'registered-orthographic-inference');
  assert.ok(meshSignedVolume(hull) > 0, 'nine-station hull must face outward');
});

test('Panhard 178 APX 3, gun axis, and muzzle use registered profile datums', () => {
  const vehicle = createPanhard178Mesh();
  const turretGroup = vehicle.userData.turret;
  const turret = vehicle.getObjectByName('Panhard178_APX3_Turret');
  const muzzle = vehicle.userData.muzzle;

  assert.ok(Math.abs(turretGroup.position.z - EXPECTED.turretCenterZ) < 1e-9);
  assert.ok(Math.abs(turretGroup.position.y - EXPECTED.turretDeckY) < 1e-9);
  assert.equal(turret.userData.profileRole, 'asymmetric-apx3-shell');
  assert.equal(turret.userData.profileLevelCount, 4);
  assert.ok(meshSignedVolume(turret) > 0, 'APX 3 closed shell must face outward');
  assertClosedConsistentWinding(turret.geometry, turret.name);
  const proxyTurret = vehicle.getObjectByName('AuthoredProxy_Panhard178_APX3_Turret');
  assert.ok(proxyTurret, 'authored APX 3 proxy must exist');
  assertClosedConsistentWinding(proxyTurret.geometry, proxyTurret.name);

  vehicle.updateMatrixWorld(true);
  const muzzleWorld = muzzle.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(muzzleWorld.y - EXPECTED.gunAxisY) < 1e-9);
  assert.ok(Math.abs(muzzleWorld.z - EXPECTED.muzzleZ) < 1e-9);
  assert.equal(vehicle.userData.barrel.userData.profileSource, 'registered-orthographic-inference');
});
