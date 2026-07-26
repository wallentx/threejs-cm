import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';

export function createPanzer38tMesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'ger_panzer38t';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#3b4246', roughness: 0.72, metalness: 0.15 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#42494e', roughness: 0.7, metalness: 0.15 }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1a1d20', roughness: 0.9 }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#0f1214', metalness: 0.85, roughness: 0.35 }), 'metal');

  // 1. Core Lower & Upper Hull
  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.78, 4.3), bodyMat);
  lowerHull.position.y = 0.78;
  lowerHull.castShadow = true;
  lowerHull.userData.lodBand = 'core';
  tankGroup.add(lowerHull);

  const upperHull = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.58, 3.0), bodyMat);
  upperHull.position.set(0, 1.45, -0.1);
  upperHull.castShadow = true;
  upperHull.userData.lodBand = 'core';
  tankGroup.add(upperHull);

  // High detail: driver visor & hull MG & lamps
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.19, 0.1), metalMat);
  visor.position.set(-0.42, 1.5, 1.35);
  visor.userData.lodBand = 'high';
  tankGroup.add(visor);

  const hullMG = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), metalMat);
  hullMG.position.set(0.44, 1.48, 1.4);
  hullMG.userData.lodBand = 'high';
  tankGroup.add(hullMG);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.58, 1.18, 2.05);
    lamp.userData.lodBand = 'high';
    tankGroup.add(lamp);
  }

  const runningGear = createTrackedRunningGear({
    id: 'Panzer38tRunningGear', trackMaterial: trackMat, wheelMaterial: turretMat,
    trackCenterX: 0.96, trackWidth: 0.32, beltLength: 4.2, beltHeight: 0.75, centerY: 0.55,
    roadWheelRadius: 0.38, roadWheelCount: 4, roadWheelY: 0.48, roadWheelZStart: -1.35,
    roadWheelSpacing: 0.9, linkPitch: 0.18
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // 3. Core Turret & 3.7 cm KwK 38(t) Gun
  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, 1.74, 0.18);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.8, 0.62, 10), turretMat);
  turret.position.y = 0.31;
  turret.castShadow = true;
  turret.userData.lodBand = 'core';
  turretGroup.add(turret);

  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.24, 10), turretMat);
  cupola.position.set(0, 0.75, -0.15);
  cupola.userData.lodBand = 'medium';
  turretGroup.add(cupola);

  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10), turretMat);
  hatch.position.set(0, 0.88, -0.15);
  hatch.userData.lodBand = 'high';
  turretGroup.add(hatch);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.7, 8), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.08, 0.32, 1.4);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.lodBand = 'core';
  turretGroup.add(barrel);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'Pz38t_Muzzle';
  muzzle.position.set(0.08, 0.32, 2.2);
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  // 4. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.25, 4.35), bodyMat);
  proxyBody.position.y = 1.02;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  tankGroup.add(proxyGroup);

  tankGroup.userData.modelMetadata = {
    designation: 'Panzerkampfwagen 38(t)',
    dimensionsMeters: { length: 4.61, width: 2.14, height: 2.25 },
    features: ['3.7 cm KwK 38(t)', 'four large road wheels per side', 'riveted plate hull', 'high reliability']
  };

  return tankGroup;
}
