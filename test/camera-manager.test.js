import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
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
  manager.pressedPanKeys = new Set(['KeyA']);
  const originalOffset = manager.camera.position.clone()
    .sub(manager.controls.target);

  manager.update(0.25);

  assert.equal(manager.followUnit, null);
  assert.deepEqual(
    manager.camera.position.clone().sub(manager.controls.target).toArray(),
    originalOffset.toArray()
  );
  assert.ok(manager.controls.target.x < 0);
  assert.equal(updates, 1);
});
