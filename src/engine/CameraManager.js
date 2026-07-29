import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CAMERA_PAN_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const UP = new THREE.Vector3(0, 1, 0);
export const CAMERA_UNIT_FOCUS_DISTANCE = 40;
export const CAMERA_HOME_DISTANCE = 70;

function isEditableTarget(target) {
  return target?.tagName === 'INPUT'
    || target?.tagName === 'SELECT'
    || target?.tagName === 'TEXTAREA'
    || target?.isContentEditable;
}

export function getKeyboardPanOffset({
  pressedKeys,
  cameraPosition,
  target,
  delta,
  speed
}) {
  const forwardInput = Number(pressedKeys.has('KeyW'))
    - Number(pressedKeys.has('KeyS'));
  const rightInput = Number(pressedKeys.has('KeyD'))
    - Number(pressedKeys.has('KeyA'));
  if (forwardInput === 0 && rightInput === 0) {
    return new THREE.Vector3();
  }
  const forward = new THREE.Vector3()
    .subVectors(target, cameraPosition)
    .setY(0);
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
  else forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, UP).normalize();
  return forward
    .multiplyScalar(forwardInput)
    .addScaledVector(right, rightInput)
    .normalize()
    .multiplyScalar(Math.max(0, delta) * speed);
}

export class CameraManager {
  constructor(camera, domElement, {
    keyboardTarget = globalThis.window
  } = {}) {
    this.camera = camera;
    this.domElement = domElement;

    // Standard Three.js OrbitControls setup
    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below ground level
    this.controls.minDistance = 3.0;
    this.controls.maxDistance = 350.0;

    // Set initial position & target
    this.controls.target.set(0, 0, 10);
    this.camera.position.set(0, 45, 95);
    this.controls.update();
    this.homeTarget = this.controls.target.clone();

    this.followUnit = null;
    this.pressedPanKeys = new Set();
    this.keyboardTarget = keyboardTarget;
    this.onKeyDown = event => {
      if (
        !CAMERA_PAN_KEYS.has(event.code)
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || isEditableTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      this.pressedPanKeys.add(event.code);
    };
    this.onKeyUp = event => {
      if (!CAMERA_PAN_KEYS.has(event.code)) return;
      this.pressedPanKeys.delete(event.code);
    };
    this.onWindowBlur = () => this.pressedPanKeys.clear();
    this.keyboardTarget?.addEventListener?.('keydown', this.onKeyDown);
    this.keyboardTarget?.addEventListener?.('keyup', this.onKeyUp);
    this.keyboardTarget?.addEventListener?.('blur', this.onWindowBlur);
  }

  setFocusTarget(posVec3) {
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    this.controls.target.copy(posVec3);
    this.camera.position.copy(posVec3).add(offset);
    this.controls.update();
  }

  frameTarget(posVec3, distance) {
    const direction = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target);
    if (direction.lengthSq() < 1e-8) direction.set(0, 0.55, 1);
    direction.normalize();
    this.controls.target.copy(posVec3);
    this.camera.position
      .copy(posVec3)
      .addScaledVector(direction, THREE.MathUtils.clamp(
        distance,
        this.controls.minDistance,
        this.controls.maxDistance
      ));
    this.followUnit = null;
    this.controls.update();
  }

  setHomeTarget(posVec3, { frame = false } = {}) {
    this.homeTarget.copy(posVec3);
    if (frame) this.resetHome();
  }

  focusTarget(posVec3) {
    this.frameTarget(posVec3, CAMERA_UNIT_FOCUS_DISTANCE);
  }

  resetHome() {
    this.frameTarget(this.homeTarget, CAMERA_HOME_DISTANCE);
  }

  setHeightPreset(level) {
    this.followUnit = null;
    let dist = 40;
    switch (level) {
      case 1: dist = 8; break;
      case 2: dist = 18; break;
      case 3: dist = 40; break;
      case 4: dist = 70; break;
      case 5: dist = 110; break;
      case 6: dist = 160; break;
      case 7: dist = 220; break;
      case 8: dist = 280; break;
      case 9: dist = 340; break;
    }

    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.controls.update();
  }

  update(delta) {
    if (this.followUnit && this.followUnit.mesh) {
      this.controls.target.lerp(this.followUnit.mesh.position, 0.08);
    }
    const panSpeed = THREE.MathUtils.clamp(
      this.camera.position.distanceTo(this.controls.target) * 0.55,
      18,
      90
    );
    const keyboardOffset = getKeyboardPanOffset({
      pressedKeys: this.pressedPanKeys,
      cameraPosition: this.camera.position,
      target: this.controls.target,
      delta,
      speed: panSpeed
    });
    if (keyboardOffset.lengthSq() > 0) {
      this.followUnit = null;
      this.camera.position.add(keyboardOffset);
      this.controls.target.add(keyboardOffset);
    }
    this.controls.update();
  }

  dispose() {
    this.keyboardTarget?.removeEventListener?.('keydown', this.onKeyDown);
    this.keyboardTarget?.removeEventListener?.('keyup', this.onKeyUp);
    this.keyboardTarget?.removeEventListener?.('blur', this.onWindowBlur);
    this.pressedPanKeys.clear();
    this.controls.dispose();
  }
}
