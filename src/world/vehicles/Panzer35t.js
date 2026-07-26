import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';

export function createPanzer35tMesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'ger_panzer35t';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#3d4447', roughness: 0.74, metalness: 0.15 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#444c50', roughness: 0.72, metalness: 0.15 }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1a1d20', roughness: 0.9 }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#0f1214', metalness: 0.85, roughness: 0.35 }), 'metal');

  // 1. Core Lower & Upper Hull
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.76, 4.5), bodyMat);
  hull.position.y = 0.76;
  hull.castShadow = true;
  hull.userData.lodBand = 'core';
  tankGroup.add(hull);

  const upperHull = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.52, 3.1), bodyMat);
  upperHull.position.set(0, 1.4, -0.1);
  upperHull.castShadow = true;
  upperHull.userData.lodBand = 'core';
  tankGroup.add(upperHull);

  // High detail: visor & lamps & hull MG
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.1), metalMat);
  visor.position.set(-0.4, 1.45, 1.4);
  visor.userData.lodBand = 'high';
  tankGroup.add(visor);

  const hullMG = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), metalMat);
  hullMG.position.set(0.42, 1.42, 1.45);
  hullMG.userData.lodBand = 'high';
  tankGroup.add(hullMG);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.55, 1.15, 2.1);
    lamp.userData.lodBand = 'high';
    tankGroup.add(lamp);
  }

  const runningGear = createTrackedRunningGear({
    id: 'Panzer35tRunningGear', trackMaterial: trackMat, wheelMaterial: turretMat,
    trackCenterX: 0.92, trackWidth: 0.3, beltLength: 4.4, beltHeight: 0.68, centerY: 0.52,
    roadWheelRadius: 0.18, roadWheelCount: 8, roadWheelY: 0.38, roadWheelZStart: -1.6,
    roadWheelSpacing: 0.46, linkPitch: 0.16
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // 3. Core Turret & 3.7 cm KwK 34(t) Gun
  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, 1.68, 0.2);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.62, 10), turretMat);
  turret.position.y = 0.31;
  turret.castShadow = true;
  turret.userData.lodBand = 'core';
  turretGroup.add(turret);

  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.24, 10), turretMat);
  cupola.position.set(0, 0.72, -0.15);
  cupola.userData.lodBand = 'medium';
  turretGroup.add(cupola);

  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10), turretMat);
  hatch.position.set(0, 0.85, -0.15);
  hatch.userData.lodBand = 'high';
  turretGroup.add(hatch);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.65, 8), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.08, 0.32, 1.35);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.lodBand = 'core';
  turretGroup.add(barrel);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'Pz35t_Muzzle';
  muzzle.position.set(0.08, 0.32, 2.15);
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  // 4. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 4.55), bodyMat);
  proxyBody.position.y = 0.98;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  tankGroup.add(proxyGroup);

  tankGroup.userData.modelMetadata = {
    designation: 'Panzerkampfwagen 35(t)',
    dimensionsMeters: { length: 4.90, width: 2.06, height: 2.37 },
    features: ['3.7 cm KwK 34(t)', 'small double road wheels', 'pneumatic steering system', 'four-man crew']
  };

  return tankGroup;
}
