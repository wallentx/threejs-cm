import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CAMERA_GROUND_CLEARANCE,
  CAMERA_HOME_DISTANCE,
  CAMERA_TARGET_GROUND_CLEARANCE,
  CAMERA_UNIT_FOCUS_DISTANCE,
  CameraManager,
  getKeyboardPanOffset
} from '../src/engine/CameraManager.js';

test('WASD camera offsets follow the horizontal view and normalize diagonals', () => {
  const cameraPosition = new THREE.Vector3(0, 20, 20);
  const target = new THREE.Vector3(0, 0, 0);
  const offset = getKeyboardPanOffset({
    pressedKeys: new Set(['KeyW', 'KeyD']),
    cameraPosition,
    target,
    delta: 0.5,
    speed: 20
  });

  assert.ok(Math.abs(offset.length() - 10) < 1e-9);
  assert.ok(offset.x > 0, 'D must pan camera-right');
  assert.ok(offset.z < 0, 'W must pan toward the view target');
  assert.equal(offset.y, 0);
  assert.deepEqual(
    getKeyboardPanOffset({
      pressedKeys: new Set(['KeyW', 'KeyS']),
      cameraPosition,
      target,
      delta: 1,
      speed: 20
    }).toArray(),
    [0, 0, 0]
  );
});

test('Q and E move vertically and share normalized speed with planar input', () => {
  const cameraPosition = new THREE.Vector3(0, 20, 20);
  const target = new THREE.Vector3(0, 0, 0);
  const getOffset = pressedKeys => getKeyboardPanOffset({
    pressedKeys: new Set(pressedKeys),
    cameraPosition,
    target,
    delta: 0.5,
    speed: 20
  });

  assert.deepEqual(getOffset(['KeyQ']).toArray(), [0, 10, 0]);
  assert.deepEqual(getOffset(['KeyE']).toArray(), [0, -10, 0]);
  assert.deepEqual(getOffset(['KeyQ', 'KeyE']).toArray(), [0, 0, 0]);

  const combined = getOffset(['KeyW', 'KeyQ']);
  assert.ok(Math.abs(combined.length() - 10) < 1e-9);
  assert.ok(combined.y > 0, 'Q must move upward');
  assert.ok(combined.z < 0, 'W must retain camera-relative forward movement');
});

test('camera update moves position and target together without changing framing', () => {
  const manager = Object.create(CameraManager.prototype);
  manager.camera = {
    position: new THREE.Vector3(0, 20, 20)
  };
  let updates = 0;
  manager.controls = {
    target: new THREE.Vector3(0, 0, 0),
    update() { updates++; }
  };
  manager.followUnit = { id: 'previous-follow' };
  manager.pressedPanKeys = new Set(['KeyQ']);
  const originalOffset = manager.camera.position.clone()
    .sub(manager.controls.target);

  manager.update(0.25);

  assert.equal(manager.followUnit, null);
  assert.deepEqual(
    manager.camera.position.clone().sub(manager.controls.target).toArray(),
    originalOffset.toArray()
  );
  assert.ok(manager.controls.target.y > 0);
  assert.equal(updates, 1);
});

test('camera and orbit target remain above uneven rendered terrain', () => {
  const manager = Object.create(CameraManager.prototype);
  manager.camera = {
    position: new THREE.Vector3(8, -20, 4)
  };
  let updates = 0;
  manager.controls = {
    target: new THREE.Vector3(2, -10, 6),
    update() { updates++; }
  };
  manager.followUnit = null;
  manager.interactionLocked = false;
  manager.pressedPanKeys = new Set();
  manager.getGroundHeightAt = (x, z) => x * 0.5 - z * 0.25;

  manager.update(0);

  assert.ok(
    Math.abs(
      manager.controls.target.y
        - (manager.getGroundHeightAt(2, 6) + CAMERA_TARGET_GROUND_CLEARANCE)
    ) < 1e-9
  );
  assert.ok(
    Math.abs(
      manager.camera.position.y
        - (manager.getGroundHeightAt(8, 4) + CAMERA_GROUND_CLEARANCE)
    ) < 1e-9
  );
  assert.equal(updates, 2, 'controls must reconcile once after a terrain correction');

  manager.pressedPanKeys.add('KeyE');
  manager.update(1);
  assert.ok(
    manager.controls.target.y
      >= manager.getGroundHeightAt(
        manager.controls.target.x,
        manager.controls.target.z
      ) + CAMERA_TARGET_GROUND_CLEARANCE
  );
  assert.ok(
    manager.camera.position.y
      >= manager.getGroundHeightAt(
        manager.camera.position.x,
        manager.camera.position.z
      ) + CAMERA_GROUND_CLEARANCE
  );
});

test('lifting a buried orbit target preserves camera framing when terrain permits', () => {
  const manager = Object.create(CameraManager.prototype);
  manager.camera = {
    position: new THREE.Vector3(0, 12, 20)
  };
  manager.controls = {
    target: new THREE.Vector3(0, -4, 0),
    update() {}
  };
  manager.getGroundHeightAt = () => 3;
  const offset = manager.camera.position.clone().sub(manager.controls.target);

  assert.equal(manager.constrainToTerrain(), true);

  assert.deepEqual(
    manager.camera.position.clone().sub(manager.controls.target).toArray(),
    offset.toArray()
  );
  assert.equal(manager.controls.target.y, 3 + CAMERA_TARGET_GROUND_CLEARANCE);
});

test('camera interaction lock freezes pointer damping and keyboard movement', () => {
  const manager = Object.create(CameraManager.prototype);
  manager.camera = { position: new THREE.Vector3(0, 20, 20) };
  let updates = 0;
  manager.controls = {
    enabled: true,
    target: new THREE.Vector3(0, 0, 0),
    update() { updates++; }
  };
  manager.followUnit = null;
  manager.pressedPanKeys = new Set(['KeyW']);
  const position = manager.camera.position.clone();
  const target = manager.controls.target.clone();

  assert.equal(manager.setInteractionLocked(true), true);
  assert.equal(manager.controls.enabled, false);
  assert.deepEqual([...manager.pressedPanKeys], []);
  manager.update(1);
  assert.deepEqual(manager.camera.position.toArray(), position.toArray());
  assert.deepEqual(manager.controls.target.toArray(), target.toArray());
  assert.equal(updates, 0);

  assert.equal(manager.setInteractionLocked(false), false);
  assert.equal(manager.controls.enabled, true);
  manager.update(0);
  assert.equal(updates, 1);
});

test('unit focus and home reset replace stale orbit distance and target', () => {
  const manager = Object.create(CameraManager.prototype);
  manager.camera = {
    position: new THREE.Vector3(0, 210, 280)
  };
  let updates = 0;
  manager.controls = {
    target: new THREE.Vector3(0, 0, 0),
    minDistance: 3,
    maxDistance: 350,
    update() { updates++; }
  };
  manager.homeTarget = new THREE.Vector3(25, 0, -30);
  manager.followUnit = { id: 'previous-follow' };

  const selectedPosition = new THREE.Vector3(-40, 2, 65);
  manager.focusTarget(selectedPosition);

  assert.deepEqual(manager.controls.target.toArray(), selectedPosition.toArray());
  assert.ok(
    Math.abs(
      manager.camera.position.distanceTo(manager.controls.target)
        - CAMERA_UNIT_FOCUS_DISTANCE
    ) < 1e-9
  );
  assert.equal(manager.followUnit, null);

  manager.resetHome();

  assert.deepEqual(manager.controls.target.toArray(), manager.homeTarget.toArray());
  assert.ok(
    Math.abs(
      manager.camera.position.distanceTo(manager.controls.target)
        - CAMERA_HOME_DISTANCE
    ) < 1e-9
  );
  assert.equal(updates, 2);
});
