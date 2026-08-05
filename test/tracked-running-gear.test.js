import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createSomuaS35Mesh,
  createRenaultR35Mesh,
  createRenaultD2Mesh,
  createHotchkissH39Mesh,
  createAMC35Mesh,
  createCharB1BisMesh,
  createPanzerIIMesh,
  createPanzerIIIMesh,
  createPanzer35tMesh,
  createPanzer38tMesh,
  createPanzerIVMesh
} from '../src/world/vehicles/index.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from '../src/world/vehicles/TrackedRunningGear.js';
import {
  bindTrackedRunningGearAnimation
} from '../src/world/vehicles/TrackedRunningGearAnimation.js';

const trackedVehicles = [
  ['SOMUA S35', createSomuaS35Mesh, 9],
  ['Renault R35', createRenaultR35Mesh, 5],
  ['Renault D2', createRenaultD2Mesh, 15],
  ['Hotchkiss H39', createHotchkissH39Mesh, 6],
  ['AMC 35', createAMC35Mesh, 5],
  ['Char B1 bis', createCharB1BisMesh, 16],
  ['Panzer II', createPanzerIIMesh, 5],
  ['Panzer III', createPanzerIIIMesh, 8],
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

test('resolved per-side travel advances links and rotates wheels without simulation feedback', () => {
  const material = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
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
  root.add(gear);
  const binding = bindTrackedRunningGearAnimation(root);
  const leftTrack = gear.getObjectByName('LeftTrackLinks');
  const rightTrack = gear.getObjectByName('RightTrackLinks');
  const leftWheel = gear.getObjectByName('LeftRoadWheel_1');
  const rightWheel = gear.getObjectByName('RightRoadWheel_1');
  const beforeLeftTrack = new THREE.Matrix4();
  const beforeRightTrack = new THREE.Matrix4();
  leftTrack.getMatrixAt(0, beforeLeftTrack);
  rightTrack.getMatrixAt(0, beforeRightTrack);
  const beforeLeftWheel = leftWheel.quaternion.clone();
  const beforeRightWheel = rightWheel.quaternion.clone();

  binding.apply({ leftTrackMeters: 1.2, rightTrackMeters: 0.45 });

  const afterLeftTrack = new THREE.Matrix4();
  const afterRightTrack = new THREE.Matrix4();
  leftTrack.getMatrixAt(0, afterLeftTrack);
  rightTrack.getMatrixAt(0, afterRightTrack);
  assert.notDeepEqual(afterLeftTrack.elements, beforeLeftTrack.elements);
  assert.notDeepEqual(afterRightTrack.elements, beforeRightTrack.elements);
  assert.notDeepEqual(leftWheel.quaternion.toArray(), beforeLeftWheel.toArray());
  assert.notDeepEqual(rightWheel.quaternion.toArray(), beforeRightWheel.toArray());
  assert.notDeepEqual(leftWheel.quaternion.toArray(), rightWheel.quaternion.toArray());
  assert.equal(root.userData.trackMotionBinding.modelVersion, 'track-distance-projection-v1');
});

test('each tracked factory exposes named, vehicle-configured running gear', () => {
  for (const [name, create, wheelsPerSide] of trackedVehicles) {
    const vehicle = create();
    const motionBinding = bindTrackedRunningGearAnimation(vehicle);
    const gear = vehicle.userData.runningGear;
    assert.ok(gear, `${name} must expose running gear`);
    assert.ok(motionBinding, `${name} must expose track-motion presentation`);
    assert.ok(motionBinding.pathBindingCount >= 2);
    assert.ok(motionBinding.wheelBindingCount >= 6);
    assert.equal(gear.userData.articulated, true);
    assert.equal(gear.userData.trackParts.roadWheels.length, wheelsPerSide * 2);
    assert.equal(gear.userData.trackParts.sprockets.length, 2);
    assert.equal(gear.userData.trackParts.idlers.length, 2);
    assert.ok(gear.getObjectByName('LeftTrackLinks'));
    assert.ok(gear.getObjectByName('RightTrackLinks'));
    assert.ok(gear.getObjectByName('LeftTrackCleats'));
    assert.ok(gear.getObjectByName('RightTrackCleats'));
    assert.ok(gear.userData.trackParts.tracks.every(track => track.count >= 18));

    const supportedPath = gear.userData.trackPath;
    assert.ok(supportedPath, `${name} must derive its track from wheel supports`);
    assert.equal(supportedPath.model, 'wheel-supported-quasi-static-v1');
    assert.ok(
      supportedPath.supports.length >= wheelsPerSide + 2,
      `${name} supported path must include its road wheels, sprocket, and idler`
    );
    const proxyLeft = vehicle.getObjectByName('ProxyLeftTrackLinks');
    const proxyRight = vehicle.getObjectByName('ProxyRightTrackLinks');
    const proxyWheels = vehicle.getObjectByName('ProxyRoadWheels');
    assert.ok(proxyLeft, `${name} must preserve a shaped left-track silhouette at far LOD`);
    assert.ok(proxyRight, `${name} must preserve a shaped right-track silhouette at far LOD`);
    assert.equal(gear.userData.runningGearType, 'wheel-supported-quasi-static-track');
    assert.equal(proxyLeft.parent.userData.trackPathConfig, gear.userData.trackPathConfig);
    assert.equal(proxyLeft.geometry.name, 'SupportedProxyTrackLinkGeometry');
    assert.equal(proxyRight.geometry.name, 'SupportedProxyTrackLinkGeometry');
    assert.equal(proxyLeft.userData.trackPathMode, 'wheel-supported-quasi-static-v1');
    assert.ok(proxyLeft.userData.instancePath.every(link => link.position[0] > 0));
    assert.ok(proxyRight.userData.instancePath.every(link => link.position[0] < 0));
    assert.equal(proxyWheels.isInstancedMesh, true);
    assert.equal(proxyWheels.count, wheelsPerSide * 2);

    const detailedLeft = gear.getObjectByName('LeftTrackLinks');
    const detailedWheel = gear.userData.trackParts.roadWheels.at(-1);
    const initialDetailed = new THREE.Matrix4();
    const initialProxy = new THREE.Matrix4();
    const initialProxyWheel = new THREE.Matrix4();
    detailedLeft.getMatrixAt(0, initialDetailed);
    proxyLeft.getMatrixAt(0, initialProxy);
    proxyWheels.getMatrixAt(proxyWheels.count - 1, initialProxyWheel);
    const initialWheel = detailedWheel.quaternion.clone();

    motionBinding.apply({ leftTrackMeters: 0.35, rightTrackMeters: 0.2 });
    const forwardDetailed = new THREE.Matrix4();
    const forwardProxy = new THREE.Matrix4();
    const forwardProxyWheel = new THREE.Matrix4();
    detailedLeft.getMatrixAt(0, forwardDetailed);
    proxyLeft.getMatrixAt(0, forwardProxy);
    proxyWheels.getMatrixAt(proxyWheels.count - 1, forwardProxyWheel);
    assert.notDeepEqual(forwardDetailed.elements, initialDetailed.elements, `${name} detailed links must advance`);
    assert.notDeepEqual(forwardProxy.elements, initialProxy.elements, `${name} proxy links must advance`);
    assert.notDeepEqual(forwardProxyWheel.elements, initialProxyWheel.elements, `${name} proxy wheels must rotate`);
    assert.notDeepEqual(detailedWheel.quaternion.toArray(), initialWheel.toArray(), `${name} detailed wheels must rotate`);

    motionBinding.apply({ leftTrackMeters: 0.35, rightTrackMeters: 0.2 });
    const stoppedDetailed = new THREE.Matrix4();
    const stoppedProxy = new THREE.Matrix4();
    detailedLeft.getMatrixAt(0, stoppedDetailed);
    proxyLeft.getMatrixAt(0, stoppedProxy);
    assert.deepEqual(stoppedDetailed.elements, forwardDetailed.elements, `${name} detailed links must stop with travel`);
    assert.deepEqual(stoppedProxy.elements, forwardProxy.elements, `${name} proxy links must stop with travel`);

    motionBinding.apply({ leftTrackMeters: -0.15, rightTrackMeters: -0.1 });
    const reverseDetailed = new THREE.Matrix4();
    const reverseProxy = new THREE.Matrix4();
    detailedLeft.getMatrixAt(0, reverseDetailed);
    proxyLeft.getMatrixAt(0, reverseProxy);
    assert.notDeepEqual(reverseDetailed.elements, forwardDetailed.elements, `${name} detailed links must reverse`);
    assert.notDeepEqual(reverseProxy.elements, forwardProxy.elements, `${name} proxy links must reverse`);
  }
});
