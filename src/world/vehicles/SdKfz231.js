import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';

export function createSdKfz231Mesh() {
  const carGroup = new THREE.Group();
  carGroup.name = 'ger_sdkfz231';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#3e4549', roughness: 0.72, metalness: 0.15 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#454c50', roughness: 0.7, metalness: 0.15 }), 'paint');
  const rubberMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1a1d20', roughness: 0.95 }), 'rubber');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#0f1214', metalness: 0.85, roughness: 0.35 }), 'metal');

  // 1. Core Hull
  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.75, 5.6), bodyMat);
  lowerHull.position.y = 1.05;
  lowerHull.castShadow = true;
  lowerHull.userData.lodBand = 'core';
  carGroup.add(lowerHull);

  const upperHull = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.62, 3.8), bodyMat);
  upperHull.position.set(0, 1.72, -0.1);
  upperHull.castShadow = true;
  upperHull.userData.lodBand = 'core';
  carGroup.add(upperHull);

  // High detail: driver vision slit & headlights & exhaust
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), metalMat);
  visor.position.set(-0.4, 1.78, 1.75);
  visor.userData.lodBand = 'high';
  carGroup.add(visor);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.65, 1.35, 2.75);
    lamp.userData.lodBand = 'high';
    carGroup.add(lamp);
  }

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.2, 8), metalMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.72, 1.3, -2.6);
  exhaust.userData.lodBand = 'high';
  carGroup.add(exhaust);

  // 2. Medium detail: 8 Large Wheels
  const wheelZ = [-2.1, -0.7, 0.7, 2.1];
  wheelZ.forEach(z => {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.26, 12), rubberMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.05, 0.52, z);
      wheel.castShadow = true;
      wheel.userData.lodBand = 'medium';
      carGroup.add(wheel);
    }
  });

  // 3. Core Turret & 2 cm KwK 30 Autocannon
  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, 2.02, 0.1);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.72, 0.58, 8), turretMat);
  turret.position.y = 0.29;
  turret.castShadow = true;
  turret.userData.lodBand = 'core';
  turretGroup.add(turret);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.5, 8), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.08, 0.29, 1.2);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.lodBand = 'core';
  turretGroup.add(barrel);

  const coax = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 6), metalMat);
  coax.name = 'coax_barrel';
  coax.rotation.x = Math.PI / 2;
  coax.position.set(0.12, 0.27, 0.65);
  coax.userData.lodBand = 'high';
  coax.userData.weaponMountId = 'coax';
  turretGroup.add(coax);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'SdKfz231_Muzzle';
  muzzle.position.set(0.08, 0.29, 1.95);
  turretGroup.add(muzzle);

  carGroup.add(turretGroup);
  carGroup.userData.turret = turretGroup;
  carGroup.userData.barrel = barrel;
  carGroup.userData.muzzle = muzzle;

  // 4. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.35, 5.65), bodyMat);
  proxyBody.position.y = 1.25;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  carGroup.add(proxyGroup);

  carGroup.userData.modelMetadata = {
    designation: 'Sd.Kfz. 231 (8-Rad)',
    dimensionsMeters: { length: 5.85, width: 2.20, height: 2.35 },
    features: ['2 cm KwK 30 autocannon', '8x8 all-wheel drive & steering', 'dual control driver positions', 'high road speed']
  };

  return carGroup;
}
