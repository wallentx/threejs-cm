import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';

export function createAMC35Mesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'fr_amc35';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#384729', roughness: 0.78, metalness: 0.12 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#435432', roughness: 0.76, metalness: 0.12 }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1e231a', roughness: 0.9 }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#111512', metalness: 0.85, roughness: 0.35 }), 'metal');

  // 1. Core Hull
  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.82, 4.4), bodyMat);
  lowerHull.position.y = 0.78;
  lowerHull.castShadow = true;
  lowerHull.userData.lodBand = 'core';
  tankGroup.add(lowerHull);

  const upperHull = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.62, 3.2), bodyMat);
  upperHull.position.set(0, 1.45, -0.2);
  upperHull.castShadow = true;
  upperHull.userData.lodBand = 'core';
  tankGroup.add(upperHull);

  // High detail: driver visor & headlamps
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.12), metalMat);
  visor.position.set(-0.42, 1.6, 1.4);
  visor.userData.lodBand = 'high';
  tankGroup.add(visor);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.6, 1.25, 2.15);
    lamp.userData.lodBand = 'high';
    tankGroup.add(lamp);
  }

  const runningGear = createTrackedRunningGear({
    id: 'AMC35RunningGear', trackMaterial: trackMat, wheelMaterial: turretMat,
    trackCenterX: 0.98, trackWidth: 0.34, beltLength: 4.3, beltHeight: 0.72, centerY: 0.56,
    roadWheelRadius: 0.26, roadWheelCount: 5, roadWheelY: 0.45, roadWheelZStart: -1.5,
    roadWheelSpacing: 0.75, linkPitch: 0.18
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // 3. Core Turret & 47mm SA 35 Gun
  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, 1.76, 0.25);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.82, 0.65, 12), turretMat);
  turret.position.y = 0.33;
  turret.castShadow = true;
  turret.userData.lodBand = 'core';
  turretGroup.add(turret);

  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.24, 10), turretMat);
  cupola.position.set(-0.2, 0.75, -0.15);
  cupola.userData.lodBand = 'medium';
  turretGroup.add(cupola);

  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10), turretMat);
  hatch.position.set(-0.2, 0.88, -0.15);
  hatch.userData.lodBand = 'high';
  turretGroup.add(hatch);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.9, 10), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.08, 0.35, 1.45);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.lodBand = 'core';
  turretGroup.add(barrel);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'AMC35_Muzzle';
  muzzle.position.set(0.08, 0.35, 2.4);
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  // 4. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 4.45), bodyMat);
  proxyBody.position.y = 1.05;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  tankGroup.add(proxyGroup);

  tankGroup.userData.modelMetadata = {
    designation: 'AMC 35 (ACG-1)',
    dimensionsMeters: { length: 4.55, width: 2.24, height: 2.30 },
    features: ['APX 2 two-man turret', '47mm SA 35 gun', 'cavalry light tank', 'riveted hull']
  };

  return tankGroup;
}
