import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';

export function createRenaultR35Mesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'fr_renault_r35';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#3d4d2d', roughness: 0.8, metalness: 0.1 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#4a5938', roughness: 0.78, metalness: 0.1 }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1e231a', roughness: 0.9 }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#111512', metalness: 0.8, roughness: 0.4 }), 'metal');

  // 1. Core Hull & Glacis
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.75, 3.8), bodyMat);
  hull.name = 'R35_CastHull';
  hull.position.y = 0.72;
  hull.castShadow = true;
  hull.receiveShadow = true;
  hull.userData.lodBand = 'core';
  hull.userData.surfaceRole = 'primary-hull';
  tankGroup.add(hull);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.45, 0.7), bodyMat);
  glacis.position.set(0, 0.98, 1.6);
  glacis.rotation.x = -0.35;
  glacis.userData.lodBand = 'core';
  tankGroup.add(glacis);

  // High detail: driver vision slit & headlamps
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), metalMat);
  visor.position.set(-0.35, 1.1, 1.85);
  visor.userData.lodBand = 'high';
  tankGroup.add(visor);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.5, 0.95, 1.92);
    lamp.userData.lodBand = 'high';
    tankGroup.add(lamp);
  }

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 8), metalMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.6, 1.05, -1.8);
  exhaust.userData.lodBand = 'high';
  tankGroup.add(exhaust);

  const runningGear = createTrackedRunningGear({
    id: 'R35RunningGear', trackMaterial: trackMat, wheelMaterial: turretMat,
    trackCenterX: 0.82, trackWidth: 0.3, beltLength: 3.7, beltHeight: 0.65, centerY: 0.52,
    roadWheelRadius: 0.22, roadWheelCount: 5, roadWheelY: 0.42, roadWheelZStart: -1.3,
    roadWheelSpacing: 0.65, linkPitch: 0.16
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // 3. Core Turret, 37mm SA 18 Gun & High Detail Cupola Hatch
  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  // Enhanced cast hull deck is 1.05-1.08 m high under this ring. Keep turret
  // seated on that deck instead of leaving a visible air gap.
  turretGroup.position.set(0, 1.06, 0.15);
  turretGroup.userData.deckContact = {
    hullName: 'R35_CastHull',
    maxGapMeters: 0.03
  };

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.68, 0.58, 12), turretMat);
  turret.position.y = 0.29;
  turret.castShadow = true;
  turret.userData.lodBand = 'core';
  turretGroup.add(turret);

  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.22, 10), turretMat);
  cupola.position.set(0, 0.68, -0.1);
  cupola.userData.lodBand = 'medium';
  turretGroup.add(cupola);

  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 10), turretMat);
  hatch.position.set(0, 0.8, -0.1);
  hatch.userData.lodBand = 'high';
  turretGroup.add(hatch);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.85, 8), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.32, 0.72);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.lodBand = 'core';
  turretGroup.add(barrel);

  const coax = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 6), metalMat);
  coax.name = 'coax_barrel';
  coax.rotation.x = Math.PI / 2;
  coax.position.set(-0.18, 0.3, 0.55);
  coax.userData.lodBand = 'high';
  coax.userData.weaponMountId = 'coax';
  turretGroup.add(coax);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'R35_Muzzle';
  muzzle.position.set(0, 0.32, 1.15);
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  // 4. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.1, 3.9), bodyMat);
  proxyBody.position.y = 0.9;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  tankGroup.add(proxyGroup);

  tankGroup.userData.modelMetadata = {
    designation: 'Renault R35',
    dimensionsMeters: { length: 4.02, width: 1.87, height: 2.13 },
    features: ['cast rounded hull', 'APX 1 R turret', '37mm SA 18 gun', 'five road wheels per side']
  };

  return tankGroup;
}
