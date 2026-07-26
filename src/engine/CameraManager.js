import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraManager {
  constructor(camera, domElement) {
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

    this.followUnit = null;
  }

  setFocusTarget(posVec3) {
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    this.controls.target.copy(posVec3);
    this.camera.position.copy(posVec3).add(offset);
    this.controls.update();
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
    this.controls.update();
  }
}
