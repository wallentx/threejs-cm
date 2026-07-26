import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createRenaultR35Mesh,
  createHotchkissH39Mesh,
  createAMC35Mesh,
  createCharB1BisMesh,
  createPanzerIIMesh,
  createPanzer35tMesh,
  createPanzer38tMesh,
  createPanzerIVMesh
} from '../src/world/vehicles/index.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from '../src/world/vehicles/TrackedRunningGear.js';

const trackedVehicles = [
  ['Renault R35', createRenaultR35Mesh, 5],
  ['Hotchkiss H39', createHotchkissH39Mesh, 6],
  ['AMC 35', createAMC35Mesh, 5],
  ['Char B1 bis', createCharB1BisMesh, 16],
  ['Panzer II', createPanzerIIMesh, 5],
  ['Panzer 35(t)', createPanzer35tMesh, 8],
  ['Panzer 38(t)', createPanzer38tMesh, 4],
  ['Panzer IV', createPanzerIVMesh, 8]
];

test('tracked running gear forms a closed core belt with high-detail cleats', () => {
  const material = new THREE.MeshStandardMaterial();
  const gear = createTrackedRunningGear({
    trackMaterial: material,
    wheelMaterial: material,
    trackCenterX: 1,
    trackWidth: 0.32,
    beltLength: 4,
    beltHeight: 0.7,
    centerY: 0.6,
    roadWheelRadius: 0.24,
    roadWheelCount: 5,
    roadWheelZStart: -1.3,
    roadWheelSpacing: 0.65
  });
  const parts = gear.userData.trackParts;
  assert.equal(gear.userData.runningGearType, 'closed-track-belt');
  assert.deepEqual(gear.userData.lodBands, ['core', 'medium', 'high']);
  assert.equal(parts.sprockets.length, 2);
  assert.equal(parts.idlers.length, 2);
  assert.equal(parts.roadWheels.length, 10);
  assert.equal(parts.tracks.length, 2);
  const rightTrack = gear.getObjectByName('RightTrackLinks');
  const leftTrack = gear.getObjectByName('LeftTrackLinks');
  assert.equal(rightTrack.userData.semanticSide, 'right');
  assert.equal(leftTrack.userData.semanticSide, 'left');
  assert.ok(rightTrack.userData.instancePath.every(link => link.position[0] < 0));
  assert.ok(leftTrack.userData.instancePath.every(link => link.position[0] > 0));
  assert.ok(gear.getObjectByName('RightDriveSprocket').position.x < 0);
  assert.ok(gear.getObjectByName('LeftDriveSprocket').position.x > 0);
  const matrix = new THREE.Matrix4();
  const linkPosition = new THREE.Vector3();
  const cleatPosition = new THREE.Vector3();
  for (const side of parts.tracks) {
    assert.ok(side.count >= 18);
    assert.equal(side.links.isInstancedMesh, true);
    assert.equal(side.cleats.isInstancedMesh, true);
    assert.equal(side.links.count, side.count);
    assert.equal(side.cleats.count, side.count);
    assert.equal(side.links.userData.lodBand, 'core');
    assert.equal(side.cleats.userData.lodBand, 'high');
    assert.equal(side.links.geometry.name, 'TrackLinkGeometry');
    for (let index = 0; index < side.count; index++) {
      side.links.getMatrixAt(index, matrix);
      linkPosition.setFromMatrixPosition(matrix);
      side.cleats.getMatrixAt(index, matrix);
      cleatPosition.setFromMatrixPosition(matrix);
      const linkRadius = Math.hypot(linkPosition.y - 0.6, linkPosition.z);
      const cleatRadius = Math.hypot(cleatPosition.y - 0.6, cleatPosition.z);
      assert.ok(
        cleatRadius > linkRadius,
        `cleat ${index} must sit on the outside of the closed belt`
      );
    }
  }
});

test('far track proxy keeps an open running-gear silhouette instead of an opaque slab', () => {
  const material = new THREE.MeshStandardMaterial();
  const proxy = createTrackedRunningGearProxy({
    trackMaterial: material,
    wheelMaterial: material,
    trackCenterX: 1,
    trackWidth: 0.32,
    beltLength: 4,
    beltHeight: 0.7,
    centerY: 0.6,
    roadWheelCount: 5
  });
  proxy.updateMatrixWorld(true);
  const belt = proxy.getObjectByName('ProxyLeftTrackBelt');
  const rightBelt = proxy.getObjectByName('ProxyRightTrackBelt');
  assert.ok(belt.position.x > 0);
  assert.ok(rightBelt.position.x < 0);
  assert.equal(belt.userData.semanticSide, 'left');
  assert.equal(rightBelt.userData.semanticSide, 'right');
  belt.visible = true;

  const throughOpening = new THREE.Raycaster(
    new THREE.Vector3(-5, 0.6, 0),
    new THREE.Vector3(1, 0, 0)
  ).intersectObject(belt, false);
  const throughTopBand = new THREE.Raycaster(
    new THREE.Vector3(-5, 0.91, 0),
    new THREE.Vector3(1, 0, 0)
  ).intersectObject(belt, false);

  assert.equal(throughOpening.length, 0);
  assert.ok(throughTopBand.length > 0);
});

test('each tracked factory exposes named, vehicle-configured running gear', () => {
  for (const [name, create, wheelsPerSide] of trackedVehicles) {
    const vehicle = create();
    const gear = vehicle.userData.runningGear;
    assert.ok(gear, `${name} must expose running gear`);
    assert.equal(gear.userData.articulated, true);
    assert.equal(gear.userData.trackParts.roadWheels.length, wheelsPerSide * 2);
    assert.equal(gear.userData.trackParts.sprockets.length, 2);
    assert.equal(gear.userData.trackParts.idlers.length, 2);
    assert.ok(gear.getObjectByName('LeftTrackLinks'));
    assert.ok(gear.getObjectByName('RightTrackLinks'));
    assert.ok(gear.getObjectByName('LeftTrackCleats'));
    assert.ok(gear.getObjectByName('RightTrackCleats'));
    assert.ok(gear.userData.trackParts.tracks.every(track => track.count >= 18));

    const proxyLeft = vehicle.getObjectByName('ProxyLeftTrackBelt');
    const proxyRight = vehicle.getObjectByName('ProxyRightTrackBelt');
    const proxyWheels = vehicle.getObjectByName('ProxyRoadWheels');
    assert.ok(proxyLeft, `${name} must preserve a shaped left-track silhouette at far LOD`);
    assert.ok(proxyRight, `${name} must preserve a shaped right-track silhouette at far LOD`);
    assert.equal(proxyLeft.geometry.name, 'ProxyTrackBeltGeometry');
    assert.equal(proxyRight.geometry.name, 'ProxyTrackBeltGeometry');
    assert.equal(proxyLeft.geometry.userData.closedTrackBelt, true);
    assert.equal(proxyRight.geometry.userData.closedTrackBelt, true);
    assert.ok(proxyLeft.position.x > 0, `${name} left track must use +X`);
    assert.ok(proxyRight.position.x < 0, `${name} right track must use -X`);
    assert.notEqual(proxyLeft.geometry.type, 'BoxGeometry');
    assert.notEqual(proxyRight.geometry.type, 'BoxGeometry');
    assert.equal(proxyWheels.isInstancedMesh, true);
    assert.equal(proxyWheels.count, wheelsPerSide * 2);
  }
});
