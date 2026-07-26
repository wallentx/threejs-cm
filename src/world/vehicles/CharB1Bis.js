import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';

export function createCharB1BisMesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'fr_char_b1bis';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#324227', roughness: 0.8, metalness: 0.1 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#3d4f30', roughness: 0.78, metalness: 0.1 }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1e231a', roughness: 0.9 }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#111512', metalness: 0.85, roughness: 0.35 }), 'metal');

  // 1. Core Hull
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.32, 1.25, 6.0), bodyMat);
  hull.position.y = 1.15;
  hull.castShadow = true;
  hull.userData.lodBand = 'core';
  tankGroup.add(hull);

  // 75mm ABS SA 35 Hull Gun Howitzer
  const hullGunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 1.25, 10), metalMat);
  hullGunBarrel.name = 'CharB1_75mm_HullGun';
  hullGunBarrel.rotation.x = Math.PI / 2;
  hullGunBarrel.position.set(0.48, 0.92, 3.1);
  hullGunBarrel.userData.lodBand = 'core';
  hullGunBarrel.userData.mountSide = 'right';
  tankGroup.add(hullGunBarrel);

  // High detail: Radiator louvres & vision slit & headlamp
  const louvre = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 1.4), metalMat);
  louvre.position.set(-1.18, 1.35, -0.6);
  louvre.userData.lodBand = 'high';
  tankGroup.add(louvre);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.12), metalMat);
  visor.position.set(-0.52, 1.62, 2.9);
  visor.userData.lodBand = 'high';
  tankGroup.add(visor);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.72, 1.45, 3.02);
    lamp.userData.lodBand = 'high';
    tankGroup.add(lamp);
  }

  const runningGear = createTrackedRunningGear({
    id: 'CharB1BisRunningGear', trackMaterial: trackMat, wheelMaterial: turretMat,
    trackCenterX: 1.12, trackWidth: 0.42, beltLength: 6.2, beltHeight: 1.55, centerY: 1.05,
    roadWheelRadius: 0.17, roadWheelCount: 16, roadWheelY: 0.44, roadWheelZStart: -2.34,
    roadWheelSpacing: 0.312, sprocketRadius: 0.62, idlerRadius: 0.52, linkPitch: 0.22
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // 3. Core APX 4 Turret & 47mm SA 35 Cannon
  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, 1.88, 0.4);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.82, 0.68, 14), turretMat);
  turret.position.y = 0.34;
  turret.castShadow = true;
  turret.userData.lodBand = 'core';
  turretGroup.add(turret);

  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.26, 10), turretMat);
  cupola.position.set(0, 0.8, -0.15);
  cupola.userData.lodBand = 'medium';
  turretGroup.add(cupola);

  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10), turretMat);
  hatch.position.set(0, 0.94, -0.15);
  hatch.userData.lodBand = 'high';
  turretGroup.add(hatch);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 2.1, 10), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.04, 0.38, 1.75);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.lodBand = 'core';
  turretGroup.add(barrel);

  const coax = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.55, 6), metalMat);
  coax.name = 'coax_barrel';
  coax.rotation.x = Math.PI / 2;
  coax.position.set(-0.18, 0.34, 1.0);
  coax.userData.lodBand = 'high';
  coax.userData.weaponMountId = 'coax';
  turretGroup.add(coax);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'CharB1_Muzzle';
  muzzle.position.set(0.04, 0.38, 2.8);
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  // 4. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(2.45, 1.6, 6.25), bodyMat);
  proxyBody.position.y = 1.25;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  tankGroup.add(proxyGroup);

  tankGroup.userData.modelMetadata = {
    designation: 'Char B1 bis',
    dimensionsMeters: { length: 6.37, width: 2.46, height: 2.79 },
    features: ['75mm ABS SA 35 hull howitzer', '47mm SA 35 APX 4 turret', 'high track envelope', 'Naeder hydraulic steering']
  };

  return tankGroup;
}
