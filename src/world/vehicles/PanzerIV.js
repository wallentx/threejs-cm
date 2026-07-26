import * as THREE from 'three';
import { lateralX } from '../LocalFrame.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';

export function createPanzerIVMesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'ger_panzer4';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#41484d', roughness: 0.72, metalness: 0.15 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#485056', roughness: 0.7, metalness: 0.15 }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1a1d20', roughness: 0.9 }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#0f1214', metalness: 0.85, roughness: 0.35 }), 'metal');

  // 1. Core Lower/Upper Hull & Stepped Glacis
  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.78, 5.2), bodyMat);
  lowerHull.position.y = 0.95;
  lowerHull.castShadow = true;
  lowerHull.userData.lodBand = 'core';
  tankGroup.add(lowerHull);

  const upperHull = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.65, 3.6), bodyMat);
  upperHull.position.set(0, 1.62, 0.1);
  upperHull.castShadow = true;
  upperHull.userData.lodBand = 'core';
  tankGroup.add(upperHull);

  const driverGlacis = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.45, 0.75), bodyMat);
  driverGlacis.position.set(0, 1.55, 2.1);
  driverGlacis.rotation.x = -0.22;
  driverGlacis.userData.lodBand = 'core';
  tankGroup.add(driverGlacis);

  // High detail: stepped visor & hull MG ball & headlights
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.1), metalMat);
  visor.position.set(-0.48, 1.68, 2.3);
  visor.userData.lodBand = 'high';
  tankGroup.add(visor);

  const hullMG = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), metalMat);
  hullMG.position.set(0.5, 1.64, 2.35);
  hullMG.userData.lodBand = 'high';
  tankGroup.add(hullMG);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.72, 1.35, 2.5);
    lamp.userData.lodBand = 'high';
    tankGroup.add(lamp);
  }

  const runningGear = createTrackedRunningGear({
    id: 'PanzerIVRunningGear', trackMaterial: trackMat, wheelMaterial: turretMat,
    trackCenterX: 1.25, trackWidth: 0.4, beltLength: 5.4, beltHeight: 0.75, centerY: 0.6,
    roadWheelRadius: 0.23, roadWheelCount: 8, roadWheelY: 0.46, roadWheelZStart: -2.1,
    roadWheelSpacing: 0.6, linkPitch: 0.2
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // 3. Core Turret & Short 7.5 cm KwK 37 L/24 Howitzer
  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, 1.95, 0.3);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.98, 0.75, 8), turretMat);
  turret.position.y = 0.4;
  turret.scale.z = 1.08;
  turret.castShadow = true;
  turret.userData.lodBand = 'core';
  turretGroup.add(turret);

  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.3, 10), turretMat);
  cupola.position.set(0, 0.92, -0.25);
  cupola.userData.lodBand = 'medium';
  turretGroup.add(cupola);

  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10), turretMat);
  hatch.position.set(0, 1.08, -0.25);
  hatch.userData.lodBand = 'high';
  turretGroup.add(hatch);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.45, 10), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.06, 0.42, 1.45);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.lodBand = 'core';
  turretGroup.add(barrel);

  const coax = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.55, 6), metalMat);
  coax.name = 'coax_barrel';
  coax.rotation.x = Math.PI / 2;
  coax.position.set(lateralX('right', 0.25), 0.38, 1.1);
  coax.userData.lodBand = 'high';
  coax.userData.weaponMountId = 'coax';
  turretGroup.add(coax);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'PzIV_Muzzle';
  muzzle.position.set(0.06, 0.42, 2.2);
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  // 4. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.35, 5.5), bodyMat);
  proxyBody.position.y = 1.15;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  tankGroup.add(proxyGroup);

  tankGroup.userData.modelMetadata = {
    designation: 'Panzerkampfwagen IV Ausf. D',
    dimensionsMeters: { length: 5.92, width: 2.84, height: 2.68 },
    features: ['7.5 cm KwK 37 L/24 short howitzer', 'eight road wheels per side', 'five-man crew', 'infantry support tank']
  };

  return tankGroup;
}
