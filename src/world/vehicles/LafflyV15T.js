import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';

export function createLafflyV15TMesh() {
  const truckGroup = new THREE.Group();
  truckGroup.name = 'fr_laffly_v15t';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#556642', roughness: 0.82, metalness: 0.08 }), 'paint');
  const canvasMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#7a755d', roughness: 0.95 }), 'canvas');
  const rubberMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1c1f1b', roughness: 0.95 }), 'rubber');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#111512', metalness: 0.8 }), 'metal');

  // 1. Core Chassis & Hood & Canvas Top
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.45, 4.2), bodyMat);
  chassis.position.y = 0.65;
  chassis.castShadow = true;
  chassis.userData.lodBand = 'core';
  truckGroup.add(chassis);

  const engineHood = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.48, 1.4), bodyMat);
  engineHood.position.set(0, 1.05, 1.25);
  engineHood.userData.lodBand = 'core';
  truckGroup.add(engineHood);

  const canvasTarpaulin = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.62, 1.8), canvasMat);
  canvasTarpaulin.position.set(0, 1.32, -0.8);
  canvasTarpaulin.userData.lodBand = 'core';
  truckGroup.add(canvasTarpaulin);

  // High detail: windshield frame & headlights & steering wheel
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.05), metalMat);
  windshield.position.set(0, 1.35, 0.55);
  windshield.userData.lodBand = 'high';
  truckGroup.add(windshield);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.45, 0.95, 1.95);
    lamp.userData.lodBand = 'high';
    truckGroup.add(lamp);
  }

  // 2. Medium detail: 4 Main Wheels
  const wheelPositions = [
    [-0.85, 0.48, 1.2],
    [0.85, 0.48, 1.2],
    [-0.85, 0.48, -1.2],
    [0.85, 0.48, -1.2]
  ];
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.24, 12), rubberMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(...pos);
    wheel.castShadow = true;
    wheel.userData.lodBand = 'medium';
    truckGroup.add(wheel);
  });

  // Characteristic Laffly small obstacle undulation wheels under front bumper
  for (const side of [-1, 1]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 10), metalMat);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(side * 0.45, 0.42, 2.05);
    roller.userData.lodBand = 'high';
    truckGroup.add(roller);
  }

  const muzzle = new THREE.Object3D();
  muzzle.name = 'Laffly_Muzzle';
  muzzle.position.set(0, 1.4, 0.2);
  truckGroup.add(muzzle);
  truckGroup.userData.muzzle = muzzle;

  // 3. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.05, 4.25), bodyMat);
  proxyBody.position.y = 0.85;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  truckGroup.add(proxyGroup);

  truckGroup.userData.modelMetadata = {
    designation: 'Laffly V15T',
    dimensionsMeters: { length: 4.35, width: 1.80, height: 1.52 },
    features: ['4x4 artillery tractor', 'front undulation wheels', 'canvas rear cab', 'high cross-country mobility']
  };

  return truckGroup;
}
