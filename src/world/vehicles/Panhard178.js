import * as THREE from 'three';
import { lateralX } from '../LocalFrame.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';

export function createPanhard178Mesh() {
  const carGroup = new THREE.Group();
  carGroup.name = 'fr_panhard178';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#445638', roughness: 0.76, metalness: 0.1 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#4c613e', roughness: 0.74, metalness: 0.1 }), 'paint');
  const rubberMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#2a2e28', roughness: 0.85, metalness: 0.05 }), 'rubber');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#2b332a', metalness: 0.65, roughness: 0.4 }), 'metal');

  // 1. Core Armored Hull (continuous, sealed Y span from 0.45 to 1.84)
  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.88, 4.6), bodyMat);
  lowerHull.position.y = 0.89;
  lowerHull.castShadow = true;
  lowerHull.userData.lodBand = 'core';
  carGroup.add(lowerHull);

  const upperHull = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.64, 4.2), bodyMat);
  upperHull.position.set(0, 1.48, 0.0);
  upperHull.castShadow = true;
  upperHull.userData.lodBand = 'core';
  carGroup.add(upperHull);

  // High detail: headlights & vision slits & exhaust muffler
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.1), metalMat);
  visor.position.set(-0.35, 1.62, 1.45);
  visor.userData.lodBand = 'high';
  carGroup.add(visor);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.55, 1.25, 2.25);
    lamp.userData.lodBand = 'high';
    carGroup.add(lamp);
  }

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 8), metalMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.65, 1.2, -2.1);
  exhaust.userData.lodBand = 'high';
  carGroup.add(exhaust);

  // 2. Medium detail: 4x4 Wheels
  const wheelPositions = [
    [-0.95, 0.55, 1.45],
    [0.95, 0.55, 1.45],
    [-0.95, 0.55, -1.45],
    [0.95, 0.55, -1.45]
  ];
  wheelPositions.forEach((pos) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.28, 14), rubberMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(...pos);
    wheel.castShadow = true;
    wheel.userData.lodBand = 'medium';
    carGroup.add(wheel);
  });

  // 3. Core Turret & 25mm SA 35 Cannon
  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, 1.76, 0.1);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.75, 0.56, 8), turretMat);
  turret.position.y = 0.28;
  turret.castShadow = true;
  turret.userData.lodBand = 'core';
  turretGroup.add(turret);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 1.6, 8), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.12, 0.32, 1.35);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.lodBand = 'core';
  turretGroup.add(barrel);

  const coax = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 6), metalMat);
  coax.name = 'coax_barrel';
  coax.rotation.x = Math.PI / 2;
  coax.position.set(lateralX('left', 0.15), 0.3, 0.7);
  coax.userData.lodBand = 'high';
  coax.userData.weaponMountId = 'coax';
  turretGroup.add(coax);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'Panhard_Muzzle';
  muzzle.position.set(0.12, 0.32, 2.15);
  turretGroup.add(muzzle);

  carGroup.add(turretGroup);
  carGroup.userData.turret = turretGroup;
  carGroup.userData.barrel = barrel;
  carGroup.userData.muzzle = muzzle;

  // 4. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.3, 4.65), bodyMat);
  proxyBody.position.y = 1.15;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  carGroup.add(proxyGroup);

  carGroup.userData.modelMetadata = {
    designation: 'Panhard 178 (AMD 35)',
    dimensionsMeters: { length: 4.79, width: 2.01, height: 2.31 },
    features: ['APX 3 octagonal turret', '25mm SA 35 high-velocity gun', '4x4 all-wheel drive', 'dual driver positions']
  };

  return carGroup;
}
