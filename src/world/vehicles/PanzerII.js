import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';

export function createPanzerIIMesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'ger_panzer2';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#454d52', roughness: 0.72, metalness: 0.15 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#4a5358', roughness: 0.7, metalness: 0.15 }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1a1d20', roughness: 0.9 }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#0f1214', metalness: 0.85, roughness: 0.35 }), 'metal');

  // 1. Core Hull & Glacis
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.68, 4.4), bodyMat);
  hull.position.y = 0.68;
  hull.castShadow = true;
  hull.userData.lodBand = 'core';
  tankGroup.add(hull);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.42, 0.8), bodyMat);
  glacis.position.set(0, 0.95, 1.7);
  glacis.rotation.x = -0.3;
  glacis.userData.lodBand = 'core';
  tankGroup.add(glacis);

  // High detail: visor & lamps & exhaust
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.1), metalMat);
  visor.position.set(-0.4, 1.08, 1.98);
  visor.userData.lodBand = 'high';
  tankGroup.add(visor);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.62, 0.92, 2.05);
    lamp.userData.lodBand = 'high';
    tankGroup.add(lamp);
  }

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 8), metalMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.72, 0.95, -2.0);
  exhaust.userData.lodBand = 'high';
  tankGroup.add(exhaust);

  const runningGear = createTrackedRunningGear({
    id: 'PanzerIIRunningGear', trackMaterial: trackMat, wheelMaterial: turretMat,
    trackCenterX: 1.05, trackWidth: 0.32, beltLength: 4.3, beltHeight: 0.62, centerY: 0.48,
    roadWheelRadius: 0.27, roadWheelCount: 5, roadWheelY: 0.4, roadWheelZStart: -1.5,
    roadWheelSpacing: 0.75, linkPitch: 0.18
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // 3. Core Offset Turret & 2 cm KwK 30 Autocannon
  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(-0.15, 1.15, 0.2);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.72, 0.55, 10), turretMat);
  turret.position.y = 0.28;
  turret.castShadow = true;
  turret.userData.lodBand = 'core';
  turretGroup.add(turret);

  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 10), turretMat);
  hatch.position.set(0, 0.58, -0.08);
  hatch.userData.lodBand = 'high';
  turretGroup.add(hatch);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.45, 8), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.1, 0.28, 1.1);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.lodBand = 'core';
  turretGroup.add(barrel);

  const coax = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 6), metalMat);
  coax.name = 'coax_barrel';
  coax.rotation.x = Math.PI / 2;
  coax.position.set(-0.12, 0.26, 0.65);
  coax.userData.lodBand = 'high';
  coax.userData.weaponMountId = 'coax';
  turretGroup.add(coax);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'PzII_Muzzle';
  muzzle.position.set(0.1, 0.28, 1.8);
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  // 4. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.05, 4.45), bodyMat);
  proxyBody.position.y = 0.85;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  tankGroup.add(proxyGroup);

  tankGroup.userData.modelMetadata = {
    designation: 'Panzer II Ausf. C',
    dimensionsMeters: { length: 4.81, width: 2.22, height: 1.99 },
    features: ['2 cm KwK 30 autocannon', 'five road wheels per side', 'offset turret', 'three-man crew']
  };

  return tankGroup;
}
