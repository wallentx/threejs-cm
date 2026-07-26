import * as THREE from 'three';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';
import { createTrackedRunningGear } from './TrackedRunningGear.js';

export function createRenaultR35Mesh() {
  const tankGroup = new THREE.Group();
  tankGroup.name = 'fr_renault_r35';
  tankGroup.userData.authoredHull = true;

  const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#3d4d2d', roughness: 0.78, metalness: 0.12 }), 'paint');
  const turretMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#4a5938', roughness: 0.75, metalness: 0.12 }), 'paint');
  const trackMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#1e231a', roughness: 0.9 }), 'track');
  const metalMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({ color: '#111512', metalness: 0.82, roughness: 0.38 }), 'metal');

  // ==========================================
  // 1. Authored Renault R35 Cast Hull & Glacis
  // ==========================================

  // Lower hull tub
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.54, 3.2), bodyMat);
  hull.name = 'R35_CastHull';
  hull.position.set(0, 0.60, 0);
  hull.castShadow = true;
  hull.receiveShadow = true;
  hull.userData.lodBand = 'core';
  hull.userData.surfaceRole = 'primary-hull';
  hull.userData.authoredHull = true;
  tankGroup.add(hull);

  // Rounded front cast nose lip
  const castNose = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.38, 16), bodyMat);
  castNose.rotation.z = Math.PI / 2;
  castNose.position.set(0, 0.48, 1.55);
  castNose.userData.lodBand = 'core';
  tankGroup.add(castNose);

  // Sloped cast glacis plate
  const upperGlacis = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.24, 0.95), bodyMat);
  upperGlacis.position.set(0, 0.72, 1.15);
  upperGlacis.rotation.x = -0.38;
  upperGlacis.userData.lodBand = 'core';
  tankGroup.add(upperGlacis);

  // Raised Driver's Visor Compartment (tank's RIGHT side, matching reference photo/render)
  const driverCompartment = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.38), bodyMat);
  driverCompartment.position.set(0.26, 0.84, 1.25);
  driverCompartment.rotation.x = -0.36;
  driverCompartment.userData.lodBand = 'core';
  tankGroup.add(driverCompartment);

  const visorSlit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.08), metalMat);
  visorSlit.position.set(0.26, 0.88, 1.38);
  visorSlit.rotation.x = -0.36;
  visorSlit.userData.lodBand = 'high';
  tankGroup.add(visorSlit);

  // Front Towing Shackles on Cast Nose
  for (const side of [-0.45, 0.45]) {
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 10), metalMat);
    shackle.position.set(side, 0.44, 1.60);
    shackle.userData.lodBand = 'high';
    tankGroup.add(shackle);
  }

  // Front Curved Fenders over Drive Sprockets
  for (const side of [-1, 1]) {
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.04, 0.85), bodyMat);
    fender.position.set(side * 0.76, 0.72, 1.50);
    fender.userData.lodBand = 'core';
    tankGroup.add(fender);

    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 8), metalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.74, 0.80, 1.62);
    lamp.userData.lodBand = 'high';
    tankGroup.add(lamp);
  }

  // Exhaust Pipe along Left Rear Fender
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 8), metalMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(-0.70, 0.86, -1.1);
  exhaust.userData.lodBand = 'high';
  tankGroup.add(exhaust);

  // Rear Trench Tail Skid Assembly
  for (const side of [-0.40, 0.40]) {
    const tailArm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.10, 0.75), metalMat);
    tailArm.position.set(side, 0.54, -2.0);
    tailArm.rotation.x = -0.22;
    tailArm.userData.lodBand = 'medium';
    tankGroup.add(tailArm);
  }
  const tailCrossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.82, 8), metalMat);
  tailCrossbar.rotation.z = Math.PI / 2;
  tailCrossbar.position.set(0, 0.44, -2.33);
  tailCrossbar.userData.lodBand = 'medium';
  tankGroup.add(tailCrossbar);

  // Tracked Running Gear (5 road wheels per side)
  const runningGear = createTrackedRunningGear({
    id: 'R35RunningGear', trackMaterial: trackMat, wheelMaterial: turretMat,
    trackCenterX: 0.76, trackWidth: 0.28, beltLength: 3.5, beltHeight: 0.60, centerY: 0.48,
    roadWheelRadius: 0.20, roadWheelCount: 5, roadWheelY: 0.38, roadWheelZStart: -1.20,
    roadWheelSpacing: 0.60, linkPitch: 0.16
  });
  tankGroup.add(runningGear);
  tankGroup.userData.runningGear = runningGear;

  // ==========================================
  // 2. Authored APX-R Cast Faceted Turret & Armament
  // ==========================================

  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(0, 0.90, 0.08);
  turretGroup.userData.deckContact = {
    hullName: 'R35_CastHull',
    maxGapMeters: 0.03
  };

  // Authentic 8-Faceted APX-R Cast Turret
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.66, 0.58, 8), turretMat);
  turret.position.y = 0.29;
  turret.rotation.y = Math.PI / 8;
  turret.castShadow = true;
  turret.userData.lodBand = 'core';
  turretGroup.add(turret);

  // Armored 37mm Gun Mantlet Block
  const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.14), turretMat);
  mantlet.position.set(0.14, 0.29, 0.60);
  mantlet.userData.lodBand = 'core';
  turretGroup.add(mantlet);

  // Low APX-R Observation Cupola
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.22, 8), turretMat);
  cupola.position.set(0, 0.68, -0.08);
  cupola.userData.lodBand = 'medium';
  turretGroup.add(cupola);

  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 8), turretMat);
  hatch.position.set(0, 0.80, -0.08);
  hatch.userData.lodBand = 'high';
  turretGroup.add(hatch);

  // 37mm SA 18 Main Gun (tank's RIGHT side)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.85, 8), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.14, 0.29, 0.70);
  barrel.userData.restZ = barrel.position.z;
  barrel.userData.lodBand = 'core';
  turretGroup.add(barrel);

  // Coax 7.5mm MAC 31 MG (tank's LEFT side)
  const coax = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 6), metalMat);
  coax.name = 'coax_barrel';
  coax.rotation.x = Math.PI / 2;
  coax.position.set(-0.18, 0.27, 0.54);
  coax.userData.lodBand = 'high';
  coax.userData.weaponMountId = 'coax';
  turretGroup.add(coax);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'R35_Muzzle';
  muzzle.position.set(0.14, 0.29, 1.12);
  turretGroup.add(muzzle);

  tankGroup.add(turretGroup);
  tankGroup.userData.turret = turretGroup;
  tankGroup.userData.barrel = barrel;
  tankGroup.userData.muzzle = muzzle;

  // 3. Proxy LOD
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'Proxy';
  const proxyBody = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.05, 3.7), bodyMat);
  proxyBody.position.y = 0.85;
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
