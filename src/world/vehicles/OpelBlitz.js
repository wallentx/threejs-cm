import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';

export function createOpelBlitzMesh() {
  const truckGroup = new THREE.Group();
  truckGroup.name = 'ger_opel_blitz';

  const cabMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#3d4447', roughness: 0.74, metalness: 0.15 }), 'paint');
  const bedMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#524b3b', roughness: 0.9 }), 'wood');
  const canvasMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#666152', roughness: 0.95 }), 'canvas');
  const rubberMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1a1d20', roughness: 0.95 }), 'rubber');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#0f1214', metalness: 0.85, roughness: 0.35 }), 'metal');

  // 1. Core Chassis & Cab & Cargo Bed
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.45, 5.8), cabMat);
  chassis.position.y = 0.75;
  chassis.castShadow = true;
  chassis.userData.lodBand = 'core';
  truckGroup.add(chassis);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.15, 1.4), cabMat);
  cab.position.set(0, 1.55, 1.6);
  cab.castShadow = true;
  cab.userData.lodBand = 'core';
  truckGroup.add(cab);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.65, 1.4), cabMat);
  hood.position.set(0, 1.25, 2.7);
  hood.castShadow = true;
  hood.userData.lodBand = 'core';
  truckGroup.add(hood);

  const cargoBed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.65, 3.6), bedMat);
  cargoBed.position.set(0, 1.3, -1.0);
  cargoBed.castShadow = true;
  cargoBed.userData.lodBand = 'core';
  truckGroup.add(cargoBed);

  const canvasCover = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.95, 3.65), canvasMat);
  canvasCover.position.set(0, 2.08, -1.0);
  canvasCover.castShadow = true;
  canvasCover.userData.lodBand = 'core';
  truckGroup.add(canvasCover);

  // High detail: Radiator grille & headlights & bumper
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 0.08), metalMat);
  grille.position.set(0, 1.2, 3.42);
  grille.userData.lodBand = 'high';
  truckGroup.add(grille);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.62, 1.18, 3.44);
    lamp.userData.lodBand = 'high';
    truckGroup.add(lamp);
  }

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 0.12), metalMat);
  bumper.position.set(0, 0.62, 3.45);
  bumper.userData.lodBand = 'high';
  truckGroup.add(bumper);

  // 2. Medium detail: Wheels
  const wheelPositions = [
    [-0.98, 0.52, 2.3],
    [0.98, 0.52, 2.3],
    [-0.98, 0.52, -1.5],
    [0.98, 0.52, -1.5]
  ];
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.28, 12), rubberMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(...pos);
    wheel.castShadow = true;
    wheel.userData.lodBand = 'medium';
    truckGroup.add(wheel);
  });

  const muzzle = new THREE.Object3D();
  muzzle.name = 'OpelBlitz_Muzzle';
  muzzle.position.set(0, 1.8, 0);
  truckGroup.add(muzzle);
  truckGroup.userData.muzzle = muzzle;

  // 3. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.85, 6.0), cabMat);
  proxyBody.position.y = 1.35;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  truckGroup.add(proxyGroup);

  truckGroup.userData.modelMetadata = {
    designation: 'Opel Blitz 3.6-36S',
    dimensionsMeters: { length: 6.10, width: 2.26, height: 2.56 },
    features: ['3-ton 4x2 military truck', 'wooden cargo bed', 'canvas tarpaulin cover', 'standard Wehrmacht transport']
  };

  return truckGroup;
}
