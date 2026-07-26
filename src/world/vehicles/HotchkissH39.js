import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';

export function createHotchkissH39Mesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'fr_hotchkiss_h39';

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#435434', roughness: 0.8, metalness: 0.1 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#4d5e3c', roughness: 0.78, metalness: 0.1 }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1e231a', roughness: 0.9 }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#111512', metalness: 0.8, roughness: 0.4 }), 'metal');

  // 1. Core Cast Hull & Rear Drop
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.78, 4.0), bodyMat);
  hull.name = 'H39_CastHull';
  hull.position.y = 0.75;
  hull.castShadow = true;
  hull.userData.lodBand = 'core';
  hull.userData.surfaceRole = 'primary-hull';
  tankGroup.add(hull);

  const rearDrop = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.35, 1.1), bodyMat);
  rearDrop.position.set(0, 0.85, -1.35);
  rearDrop.rotation.x = 0.22;
  rearDrop.userData.lodBand = 'core';
  tankGroup.add(rearDrop);

  // High detail: visor & lamps & louvres
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.1), metalMat);
  visor.position.set(-0.32, 1.15, 1.95);
  visor.userData.lodBand = 'high';
  tankGroup.add(visor);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.52, 1.0, 2.02);
    lamp.userData.lodBand = 'high';
    tankGroup.add(lamp);
  }

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.95, 8), metalMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.62, 1.1, -1.9);
  exhaust.userData.lodBand = 'high';
  tankGroup.add(exhaust);

  const runningGear = createTrackedRunningGear({
    id: 'H39RunningGear', trackMaterial: trackMat, wheelMaterial: turretMat,
    trackCenterX: 0.81, trackWidth: 0.28, beltLength: 3.85, beltHeight: 0.68, centerY: 0.54,
    roadWheelRadius: 0.21, roadWheelCount: 6, roadWheelY: 0.43, roadWheelZStart: -1.4,
    roadWheelSpacing: 0.56, linkPitch: 0.16
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // 3. Core Turret & 37mm SA 38 Cannon
  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  // Enhanced cast hull deck is about 1.10 m high under this ring.
  turretGroup.position.set(0, 1.10, 0.1);
  turretGroup.userData.deckContact = {
    hullName: 'H39_CastHull',
    maxGapMeters: 0.03
  };

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.69, 0.6, 12), turretMat);
  turret.position.y = 0.3;
  turret.castShadow = true;
  turret.userData.lodBand = 'core';
  turretGroup.add(turret);

  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.29, 0.24, 10), turretMat);
  cupola.position.set(0, 0.7, -0.08);
  cupola.userData.lodBand = 'medium';
  turretGroup.add(cupola);

  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.04, 10), turretMat);
  hatch.position.set(0, 0.82, -0.08);
  hatch.userData.lodBand = 'high';
  turretGroup.add(hatch);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.25, 8), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.32, 0.92);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.lodBand = 'core';
  turretGroup.add(barrel);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'H39_Muzzle';
  muzzle.position.set(0, 0.32, 1.55);
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  // 4. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.15, 4.1), bodyMat);
  proxyBody.position.y = 0.92;
  proxyBody.userData.lodBand = 'proxy';
  proxyBody.visible = false;
  proxyGroup.add(proxyBody);
  tankGroup.add(proxyGroup);

  tankGroup.userData.modelMetadata = {
    designation: 'Hotchkiss H39',
    dimensionsMeters: { length: 4.22, width: 1.85, height: 2.15 },
    features: ['cast sectional hull', '37mm SA 38 gun', 'sloped rear deck drop', 'six road wheels per side']
  };

  return tankGroup;
}
