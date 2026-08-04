import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setCalibrationLodVisibility } from '../src/calibration/CalibrationModel.js';
import { createPanzer38tMesh } from '../src/world/vehicles/index.js';
import {
  PANZER_38T_BLUEPRINT_CALIBRATION
} from '../src/world/vehicles/Panzer38t.js';
import { assertClosedConsistentWinding } from './helpers/GeometryTopologyAssertions.js';

const TOLERANCE = 0.002;

function signedVolume(geometry) {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let volume = 0;
  const count = indices?.count ?? positions.count;
  for (let offset = 0; offset < count; offset += 3) {
    a.fromBufferAttribute(positions, indices ? indices.getX(offset) : offset);
    b.fromBufferAttribute(positions, indices ? indices.getX(offset + 1) : offset + 1);
    c.fromBufferAttribute(positions, indices ? indices.getX(offset + 2) : offset + 2);
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  }
  return volume;
}

function visibleRigidBounds(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  root.traverse(object => {
    if (
      !object.isMesh
      || !object.visible
      || ['weaponProjection', 'flexibleAttachment'].includes(object.userData.envelopeRole)
    ) return;
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  return bounds;
}

test('Panzer 38(t) publishes source-backed exact and inferred calibration datums', () => {
  const calibration = PANZER_38T_BLUEPRINT_CALIBRATION;
  assert.deepEqual(calibration.rigidEnvelopeMeters, {
    length: 4.61,
    width: 2.14,
    height: 2.25
  });
  assert.match(calibration.variantScope, /Ausf\. B-D/);
  assert.equal(calibration.imageRegistration.sourceImagePixels.width, 1690);
  assert.deepEqual(calibration.imageRegistration.sideCropPixels, {
    x: 120,
    y: 420,
    width: 650,
    height: 320
  });
  assert.equal(calibration.imageRegistration.mirrorForLocalSideView, false);
  assert.match(calibration.imageRegistration.frontTopStatus, /pending exact/);
  assert.ok(calibration.sources.some(source => (
    source.publisher === 'Vojensky historicky ustav Praha'
    && /official museum/.test(source.quality)
  )));
  assert.ok(calibration.sources.some(source => /Panzer Tracts/.test(source.quality)));
  assert.equal(calibration.datums.trackWidth.value, 0.293);
  assert.match(calibration.datums.trackWidth.quality, /published/);
  assert.match(calibration.datums.roadWheelCentersZ.quality, /approximation/);
  assert.ok(calibration.outlineLandmarks.length >= 6);
});

test('Panzer 38(t) station hulls and faceted turret are closed and outward-wound', () => {
  const vehicle = createPanzer38tMesh();
  const lowerHull = vehicle.getObjectByName('Panzer38t_PrimaryHull');
  const upperHull = vehicle.getObjectByName('Panzer38t_RivetedUpperHull');
  const turret = vehicle.getObjectByName('Panzer38t_ForwardFacetedTurret');
  assert.equal(lowerHull.userData.profileStationCount, 6);
  assert.equal(upperHull.userData.profileStationCount, 7);
  assert.equal(turret.userData.profilePlanPointCount, 10);
  for (const mesh of [
    lowerHull,
    upperHull,
    turret,
    vehicle.getObjectByName('Panzer38t_ProxyPrimaryHull'),
    vehicle.getObjectByName('Panzer38t_ProxyUpperHull'),
    vehicle.getObjectByName('Panzer38t_ProxyTurret')
  ]) {
    assert.equal(mesh.geometry.userData.outwardWindingAudited, true);
    assert.ok(signedVolume(mesh.geometry) > 0, mesh.name);
    assertClosedConsistentWinding(mesh.geometry, mesh.name);
  }
});

test('Panzer 38(t) high, medium, core, and proxy tiers retain the rigid envelope', () => {
  const vehicle = createPanzer38tMesh();
  const expected = PANZER_38T_BLUEPRINT_CALIBRATION.rigidEnvelopeMeters;
  for (const tier of ['high', 'medium', 'core', 'proxy']) {
    setCalibrationLodVisibility(vehicle, tier);
    const bounds = visibleRigidBounds(vehicle);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - expected.width) < TOLERANCE, `${tier} width`);
    assert.ok(Math.abs(size.z - expected.length) < TOLERANCE, `${tier} length`);
    assert.ok(Math.abs(bounds.max.y - expected.height) < TOLERANCE, `${tier} height`);
    assert.ok(Math.abs(bounds.min.y) < TOLERANCE, `${tier} ground`);
  }
});

test('Panzer 38(t) keeps four wheels, two return rollers, and two leaf packs per side', () => {
  const vehicle = createPanzer38tMesh();
  for (const side of ['Right', 'Left']) {
    for (let index = 1; index <= 4; index++) {
      assert.ok(vehicle.getObjectByName(`${side}RoadWheel_${index}`));
    }
    for (let index = 1; index <= 2; index++) {
      assert.equal(
        vehicle.getObjectByName(`Panzer38t_${side}ReturnRoller_${index}`)
          .userData.runningGearPart,
        'return-roller'
      );
      assert.equal(
        vehicle.getObjectByName(`Panzer38t_${side}LeafSpringPack_${index}`)
          .userData.runningGearPart,
        'semi-elliptic-leaf-spring'
      );
    }
  }
  assert.equal(
    vehicle.getObjectByName('Panzer38t_CoreFourWheelSilhouette')
      .userData.wheelsPerSide,
    4
  );
});

test('Panzer 38(t) gun and both MG markers match visible period mount sides', () => {
  const vehicle = createPanzer38tMesh();
  vehicle.updateMatrixWorld(true);
  const mainMuzzle = vehicle.userData.muzzle.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(mainMuzzle.y - 1.71) < 1e-9);
  assert.ok(mainMuzzle.z < PANZER_38T_BLUEPRINT_CALIBRATION.rigidEnvelopeMeters.length / 2);
  assert.equal(vehicle.userData.barrel.userData.envelopeRole, 'weaponProjection');

  const { coax, hull_mg: hullMg } = vehicle.userData.weaponMuzzles;
  assert.equal(coax.userData.mountSide, 'right');
  assert.equal(hullMg.userData.mountSide, 'right');
  assert.ok(coax.getWorldPosition(new THREE.Vector3()).x < 0);
  assert.ok(hullMg.getWorldPosition(new THREE.Vector3()).x < 0);
  assert.equal(vehicle.getObjectByName('Panzer38t_CoaxMG37tHousing').userData.weaponMountId, 'coax');
  assert.equal(vehicle.getObjectByName('Panzer38t_HullMG37tHousing').userData.weaponMountId, 'hull_mg');
});

test('Panzer 38(t) proxy owns hull, running gear, turret, cupola, and gun silhouettes', () => {
  const vehicle = createPanzer38tMesh();
  setCalibrationLodVisibility(vehicle, 'proxy');
  const required = [
    'Panzer38t_ProxyPrimaryHull',
    'Panzer38t_ProxyUpperHull',
    'Panzer38t_ProxyRunningGear',
    'Panzer38t_ProxyTurret',
    'Panzer38t_ProxyCommanderCupola',
    'Panzer38t_ProxyGunBarrel'
  ];
  for (const name of required) {
    const object = vehicle.getObjectByName(name);
    assert.ok(object, name);
    if (object.isMesh) assert.equal(object.visible, true, `${name} visible`);
  }
});
