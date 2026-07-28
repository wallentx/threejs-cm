import * as THREE from 'three';
import { lateralX } from '../../../world/LocalFrame.js';

// Visual dimensions are metres. Overall lengths are historical nominal values;
// the smaller sectional dimensions are inferred visual proportions.
export const FRANCE_1940_INFANTRY_WEAPON_VISUALS = Object.freeze({
  'MAS-36 Rifle': Object.freeze({
    id: 'mas36',
    designation: 'MAS-36',
    kind: 'rifle',
    overallLength: 1.02,
    stockEnd: 0.43,
    receiverEnd: 0.58,
    handguardEnd: 0.865,
    barrelRadius: 0.012,
    magazine: 'internal',
    definingFeatures: ['dog-leg bolt handle', 'short enclosed internal magazine', 'full wood stock']
  }),
  'FM 24/29 LMG': Object.freeze({
    id: 'fm2429',
    designation: 'FM 24/29',
    kind: 'lmg',
    overallLength: 1.08,
    stockEnd: 0.34,
    receiverEnd: 0.58,
    handguardEnd: 0.75,
    barrelRadius: 0.015,
    magazine: 'top-box',
    definingFeatures: ['top-mounted box magazine', 'pistol grip', 'folding bipod']
  }),
  'MAS-38 SMG': Object.freeze({
    id: 'mas38',
    designation: 'MAS-38',
    kind: 'smg',
    overallLength: 0.63,
    stockEnd: 0.25,
    receiverEnd: 0.47,
    handguardEnd: 0.49,
    barrelRadius: 0.015,
    magazine: 'bottom-box',
    definingFeatures: ['canted receiver profile', 'bottom box magazine', 'wooden stock']
  }),
  Kar98k: Object.freeze({
    id: 'kar98k',
    designation: 'Kar98k',
    kind: 'rifle',
    overallLength: 1.11,
    stockEnd: 0.48,
    receiverEnd: 0.63,
    handguardEnd: 0.87,
    barrelRadius: 0.011,
    magazine: 'internal',
    definingFeatures: ['turned bolt handle', 'internal magazine floorplate', 'full wood stock']
  }),
  'MG34 LMG': Object.freeze({
    id: 'mg34',
    designation: 'MG34',
    kind: 'lmg',
    overallLength: 1.22,
    stockEnd: 0.30,
    receiverEnd: 0.58,
    handguardEnd: 0.91,
    barrelRadius: 0.017,
    magazine: 'side-drum',
    definingFeatures: ['perforated barrel jacket', 'side drum', 'bipod', 'pistol grip']
  }),
  MP40: Object.freeze({
    id: 'mp40',
    designation: 'MP40',
    kind: 'smg',
    overallLength: 0.83,
    stockEnd: 0.28,
    receiverEnd: 0.58,
    handguardEnd: 0.61,
    barrelRadius: 0.012,
    magazine: 'bottom-box',
    definingFeatures: ['folding metal stock', 'bottom box magazine', 'pistol grip']
  })
});

function meshPart(group, geometry, material, name, position) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.userData.lodBand = 'medium';
  group.add(mesh);
  return mesh;
}

function boxPart(group, material, name, width, height, startZ, endZ, y = 0) {
  return meshPart(
    group,
    new THREE.BoxGeometry(width, height, endZ - startZ),
    material,
    name,
    [0, y, (startZ + endZ) * 0.5]
  );
}

function profilePart(group, material, name, shape, width, zOffset, yOffset = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
    curveSegments: 8
  });
  // Shape X is the authored forward coordinate. Center the extrusion depth,
  // then rotate it into the weapon's narrow X width without reflecting faces.
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(0, 0, -zOffset);
  const mesh = meshPart(group, geometry, material, name, [0, yOffset, zOffset]);
  return mesh;
}

function cylinderPart(group, material, name, radius, startZ, endZ, x = 0, y = 0, sides = 8) {
  const geometry = new THREE.CylinderGeometry(radius, radius, endZ - startZ, sides);
  geometry.rotateX(Math.PI / 2);
  return meshPart(group, geometry, material, name, [x, y, (startZ + endZ) * 0.5]);
}

function addBipod(model, spec, metalMaterial) {
  const geometry = new THREE.CylinderGeometry(0.008, 0.009, 0.34, 5);
  for (const side of [-1, 1]) {
    const leg = meshPart(
      model,
      geometry,
      metalMaterial,
      `${spec.designation}_Bipod_${side < 0 ? 'Left' : 'Right'}`,
      [side * 0.055, -0.12, spec.handguardEnd - 0.09]
    );
    leg.rotation.z = side * 0.34;
    leg.rotation.x = 0.1;
  }
}

function addMp40FoldingStock(model, spec, metalMaterial) {
  const rodGeometry = new THREE.CylinderGeometry(0.006, 0.006, spec.stockEnd, 5);
  rodGeometry.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    meshPart(
      model,
      rodGeometry,
      metalMaterial,
      `MP40_FoldingStock_${side < 0 ? 'Left' : 'Right'}`,
      [side * 0.045, -0.025, spec.stockEnd * 0.5]
    );
  }
  boxPart(model, metalMaterial, 'MP40_ButtPlate', 0.13, 0.018, 0, 0.035, -0.025);
}

function addMagazine(model, spec, metalMaterial) {
  if (spec.magazine === 'internal') {
    const magazine = boxPart(
      model,
      metalMaterial,
      `${spec.designation}_InternalMagazineFloorplate`,
      0.085,
      0.018,
      spec.stockEnd + 0.025,
      spec.receiverEnd - 0.025,
      -0.055
    );
    magazine.userData.feedType = 'internal';
    return magazine;
  }
  if (spec.magazine === 'top-box') {
    const magazine = boxPart(
      model,
      metalMaterial,
      'FM2429_TopMagazine',
      0.085,
      0.18,
      spec.stockEnd + 0.07,
      spec.stockEnd + 0.18,
      0.12
    );
    magazine.rotation.x = -0.08;
    magazine.userData.feedType = 'top';
    return magazine;
  }
  if (spec.magazine === 'side-drum') {
    const geometry = new THREE.CylinderGeometry(0.085, 0.085, 0.055, 14);
    geometry.rotateZ(Math.PI / 2);
    const magazine = meshPart(
      model,
      geometry,
      metalMaterial,
      'MG34_Patronentrommel34',
      [0.075, -0.015, spec.stockEnd + 0.18]
    );
    magazine.userData.feedType = 'side-drum';
    return magazine;
  }
  if (spec.id === 'mas38') {
    const magWell = boxPart(
      model,
      metalMaterial,
      'MAS38_MagWell',
      0.034,
      0.038,
      spec.stockEnd + 0.075,
      spec.stockEnd + 0.135,
      -0.032
    );
    magWell.userData.lodBand = 'high';
  }

  const magWidth = spec.id === 'mas38' ? 0.024 : (spec.id === 'mp40' ? 0.028 : 0.045);
  const magHeight = spec.id === 'mas38' ? 0.16 : (spec.id === 'mp40' ? 0.20 : 0.18);
  const magEndZ = spec.stockEnd + (spec.id === 'mas38' ? 0.125 : 0.15);

  const magazine = boxPart(
    model,
    metalMaterial,
    `${spec.designation}_BoxMagazine`,
    magWidth,
    magHeight,
    spec.stockEnd + 0.08,
    magEndZ,
    spec.id === 'mas38' ? -0.11 : -0.13
  );
  magazine.rotation.x = spec.id === 'mas38' ? 0.22 : -0.03;
  magazine.userData.feedType = 'bottom';
  return magazine;
}

function addFireControls(model, spec, materials) {
  const triggerGuardGeometry = new THREE.TorusGeometry(0.032, 0.006, 5, 10);
  triggerGuardGeometry.rotateY(Math.PI / 2);
  const triggerGuard = meshPart(
    model,
    triggerGuardGeometry,
    materials.metal,
    `${spec.designation}_TriggerGuard`,
    [0, -0.055, Math.max(0.14, spec.stockEnd - 0.018)]
  );

  let pistolGrip = null;
  if (['fm2429', 'mas38', 'mg34', 'mp40'].includes(spec.id)) {
    pistolGrip = meshPart(
      model,
      new THREE.BoxGeometry(0.065, spec.id === 'mp40' ? 0.17 : 0.145, 0.075),
      spec.id === 'mas38' ? materials.wood : materials.metal,
      `${spec.designation}_PistolGrip`,
      [0, -0.105, spec.stockEnd + 0.018]
    );
    pistolGrip.rotation.x = spec.id === 'mas38' ? -0.22 : -0.16;
  }

  let boltHandle = null;
  let chargingHandle = null;
  let ejectionPort = null;
  const handleZ = spec.stockEnd + (spec.receiverEnd - spec.stockEnd) * 0.52;
  const stemGeometry = new THREE.CylinderGeometry(0.007, 0.007, 0.105, 5);
  stemGeometry.rotateZ(Math.PI / 2);
  if (['mas36', 'kar98k'].includes(spec.id)) {
    boltHandle = meshPart(
      model,
      stemGeometry,
      materials.metal,
      `${spec.designation}_BoltHandle`,
      [lateralX('right', 0.07), 0.005, handleZ]
    );
    boltHandle.userData.semanticSide = 'right';
    const boltKnob = meshPart(
      model,
      new THREE.SphereGeometry(0.018, 6, 4),
      materials.metal,
      `${spec.designation}_BoltKnob`,
      [lateralX('right', 0.125), spec.id === 'mas36' ? -0.008 : 0.005, handleZ]
    );
    boltKnob.userData.semanticSide = 'right';
    boltHandle.userData.knob = boltKnob;
    ejectionPort = meshPart(
      model,
      new THREE.BoxGeometry(0.009, 0.026, 0.075),
      materials.metal,
      `${spec.designation}_EjectionPort`,
      [lateralX('right', 0.046), 0.014, handleZ + 0.025]
    );
    ejectionPort.userData.semanticSide = 'right';
  } else {
    const handleSide = ['fm2429', 'mas38', 'mg34'].includes(spec.id) ? 'right' : 'left';
    chargingHandle = meshPart(
      model,
      stemGeometry,
      materials.metal,
      `${spec.designation}_ChargingHandle`,
      [lateralX(handleSide, 0.075), 0.012, handleZ]
    );
    chargingHandle.userData.semanticSide = handleSide;
  }
  return { triggerGuard, pistolGrip, boltHandle, chargingHandle, ejectionPort };
}

function buildMas36(spec, materials) {
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;

  const stockEnd = spec.stockEnd;
  const receiverEnd = spec.receiverEnd;
  const realHandguardEnd = spec.handguardEnd;
  const frontRingStart = realHandguardEnd;
  const frontRingEnd = frontRingStart + 0.03;

  // 1. Rear stock from the buttplate to the authored stock-end station.
  const stockShape = new THREE.Shape();
  stockShape.moveTo(0, -0.105);
  stockShape.bezierCurveTo(0.10, -0.105, 0.22, -0.055, stockEnd, -0.04);
  stockShape.lineTo(stockEnd, 0.01);
  stockShape.bezierCurveTo(0.22, 0.005, 0.10, 0.01, 0, 0.01);
  stockShape.lineTo(0, -0.105);
  const stock = profilePart(model, materials.wood, `${spec.designation}_Stock`, stockShape, 0.042, stockEnd * 0.5, 0);

  // 2. Receiver between the authored stock and receiver stations.
  const receiverShape = new THREE.Shape();
  receiverShape.moveTo(stockEnd, -0.04);
  receiverShape.lineTo(receiverEnd, -0.04);
  receiverShape.lineTo(receiverEnd, 0.015);
  receiverShape.lineTo(stockEnd, 0.015);
  receiverShape.lineTo(stockEnd, -0.04);
  const receiver = profilePart(model, materials.metal, `${spec.designation}_Receiver`, receiverShape, 0.045, (stockEnd + receiverEnd) * 0.5, 0);

  // Internal magazine floorplate under receiver
  const magazine = boxPart(model, materials.metal, `${spec.designation}_InternalMagazineFloorplate`, 0.036, 0.015, stockEnd + 0.02, receiverEnd - 0.02, -0.045);
  magazine.userData.feedType = 'internal';

  // Trigger guard
  const triggerGuardGeometry = new THREE.TorusGeometry(0.022, 0.004, 6, 12);
  triggerGuardGeometry.rotateY(Math.PI / 2);
  const triggerGuard = meshPart(model, triggerGuardGeometry, materials.metal, `${spec.designation}_TriggerGuard`, [0, -0.05, stockEnd + 0.05]);

  // Dog-leg bolt handle (characteristic forward-angled bolt handle on right side)
  const stemGeometry = new THREE.CylinderGeometry(0.004, 0.005, 0.045, 6);
  stemGeometry.rotateX(Math.PI / 2);
  const boltHandle = meshPart(model, stemGeometry, materials.metal, `${spec.designation}_BoltHandle`, [lateralX('right', 0.028), 0.005, stockEnd + 0.06]);
  boltHandle.rotation.y = 0.4;
  boltHandle.rotation.x = -0.3;
  boltHandle.userData.semanticSide = 'right';

  // 3. Wooden forend / handguard, ending inside the front sight band.
  const handguardShape = new THREE.Shape();
  handguardShape.moveTo(receiverEnd, -0.038);
  handguardShape.lineTo(realHandguardEnd, -0.022);
  handguardShape.lineTo(realHandguardEnd, 0.016);
  handguardShape.lineTo(receiverEnd, 0.016);
  handguardShape.lineTo(receiverEnd, -0.038);
  const handguard = profilePart(model, materials.wood, `${spec.designation}_Handguard`, handguardShape, 0.038, (receiverEnd + realHandguardEnd) * 0.5, 0);

  // Ejection port on right side
  const ejectionPort = meshPart(model, new THREE.BoxGeometry(0.009, 0.026, 0.075), materials.metal, `${spec.designation}_EjectionPort`, [lateralX('right', 0.016), 0.02, stockEnd + 0.095]);
  ejectionPort.userData.semanticSide = 'right';

  // 4. Barrel from the receiver to the historical overall length.
  const barrel = cylinderPart(model, materials.metal, `${spec.designation}_Barrel`, spec.barrelRadius, receiverEnd, spec.overallLength);

  // 5. Metal Barrel Bands (Mid Ring and Front Cap) - made wider/thicker than wood furniture (width 0.048 / 0.046 vs wood 0.038)
  const midRing = boxPart(model, materials.metal, `${spec.designation}_MidRing`, 0.048, 0.050, 0.67, 0.69, -0.006);

  // Front cap metal band meeting the end of the wooden furniture.
  const frontRing = boxPart(model, materials.metal, `${spec.designation}_FrontRing`, 0.046, 0.044, frontRingStart, frontRingEnd, -0.005);

  // Front Sight Hood (solid hollow cylinder tube with inner & outer faces, 2.4cm diameter, 3cm length)
  const hoodShape = new THREE.Shape();
  hoodShape.absarc(0, 0, 0.012, 0, Math.PI * 2, false);
  const holePath = new THREE.Path();
  holePath.absarc(0, 0, 0.009, 0, Math.PI * 2, true);
  hoodShape.holes.push(holePath);
  const hoodGeo = new THREE.ExtrudeGeometry(hoodShape, { depth: 0.030, bevelEnabled: false });
  hoodGeo.translate(0, 0, -0.015);
  const frontSight = meshPart(model, hoodGeo, materials.metal, `${spec.designation}_FrontSight`, [0, 0.018, (frontRingStart + frontRingEnd) * 0.5]);
  frontSight.userData.semanticPart = 'frontSight';

  // Reversed-bayonet storage tube emerging forward from the front band.
  const bayonetTube = cylinderPart(model, materials.metal, `${spec.designation}_BayonetTube`, 0.006, frontRingStart, spec.overallLength - 0.03, 0, -0.022);

  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const coreSilhouette = [stock, receiver, handguard, barrel, bayonetTube];
  for (const part of coreSilhouette) part.userData.lodBand = 'core';

  model.userData.visualContract = { units: 'metres', overallLength: spec.overallLength, definingFeatures: ['dog-leg bolt handle', 'exposed bayonet tube', 'two piece stock', 'barrel band'], ...spec };
  model.userData.parts = { stock, receiver, handguard, barrel, magazine, muzzle, frontSight, triggerGuard, boltHandle, ejectionPort, chargingHandle: null, coreSilhouette };
  return model;
}

function buildMas38(spec, materials) {
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;

  const stockEnd = 0.20;
  const receiverEnd = 0.40;

  // 1. Stock Profile: Realistic curved buttstock
  const stockShape = new THREE.Shape();
  stockShape.moveTo(0, -0.105); // Bottom of buttplate
  stockShape.bezierCurveTo(0.05, -0.105, 0.12, -0.050, stockEnd, -0.040); // Smooth concave bottom line to receiver
  stockShape.lineTo(stockEnd, 0.020); // Front of stock at receiver top
  stockShape.bezierCurveTo(0.12, 0.020, 0.05, 0.015, 0, 0.015); // Slightly convex top line to buttplate
  stockShape.lineTo(0, -0.105);

  const stock = profilePart(model, materials.wood, `${spec.designation}_Stock`, stockShape, 0.046, stockEnd * 0.5, 0);

  // 2. Metal Receiver Box (Z = 0.20 to 0.40)
  const receiverShape = new THREE.Shape();
  receiverShape.moveTo(stockEnd, -0.040);
  receiverShape.lineTo(receiverEnd, -0.040);
  receiverShape.lineTo(receiverEnd, 0.025);
  receiverShape.lineTo(stockEnd, 0.025);
  receiverShape.lineTo(stockEnd, -0.040);
  const receiver = profilePart(model, materials.metal, `${spec.designation}_Receiver`, receiverShape, 0.044, (stockEnd + receiverEnd) * 0.5, 0);

  // Receiver collar / handguard shroud
  const handguard = boxPart(model, materials.metal, `${spec.designation}_Handguard`, 0.040, 0.040, receiverEnd - 0.025, receiverEnd + 0.01, -0.005);

  // Cocking handle ring/knob on right side of receiver
  const cockingRing = cylinderPart(model, materials.metal, 'MAS38_CockingKnob', 0.018, stockEnd + 0.10, stockEnd + 0.13, lateralX('right', 0.024), -0.005);
  cockingRing.rotation.z = Math.PI / 2;
  cockingRing.userData.semanticSide = 'right';

  // 3. Pistol Grip (Wood, sitting under rear of receiver, angled BACKWARD towards stock)
  const pistolGrip = boxPart(model, materials.wood, `${spec.designation}_PistolGrip`, 0.034, 0.11, stockEnd + 0.03, stockEnd + 0.08, -0.085);
  pistolGrip.rotation.x = 0.22; // Positive rotation angles bottom BACKWARD toward stock!

  // 4. Trigger Guard & Trigger (Z = 0.24 to 0.28)
  const triggerGuardGeometry = new THREE.TorusGeometry(0.022, 0.004, 6, 12);
  triggerGuardGeometry.rotateY(Math.PI / 2);
  const triggerGuard = meshPart(model, triggerGuardGeometry, materials.metal, `${spec.designation}_TriggerGuard`, [0, -0.050, stockEnd + 0.06]);

  // 5. Box Magazine (Metal, further forward near the end of the receiver Z = 0.32 to 0.38, angled slightly outward/forward)
  const magazine = boxPart(model, materials.metal, `${spec.designation}_BoxMagazine`, 0.030, 0.17, receiverEnd - 0.08, receiverEnd - 0.025, -0.125);
  magazine.rotation.x = -0.12; // Angled forward/outward
  magazine.rotation.z = -0.05; // Slightly canted outward
  magazine.userData.feedType = 'bottom';

  // 6. Barrel (Z = 0.40 to 0.63, robust 3.0cm outer diameter!)
  const barrel = cylinderPart(model, materials.metal, `${spec.designation}_Barrel`, spec.barrelRadius, receiverEnd, spec.overallLength);

  // 7. Sights
  // Rear Sight (on receiver at Z = 0.38)
  const rearSight = boxPart(model, materials.metal, `${spec.designation}_RearSight`, 0.016, 0.018, receiverEnd - 0.035, receiverEnd - 0.01, 0.032);

  // Front Sight Post (near muzzle at Z = 0.60)
  const frontSight = boxPart(model, materials.metal, `${spec.designation}_FrontSight`, 0.016, 0.035, spec.overallLength - 0.05, spec.overallLength - 0.02, 0.028);
  frontSight.userData.semanticPart = 'frontSight';

  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const coreSilhouette = [stock, receiver, barrel, magazine, pistolGrip];
  for (const part of coreSilhouette) part.userData.lodBand = 'core';

  model.userData.visualContract = { units: 'metres', overallLength: spec.overallLength, definingFeatures: ['canted receiver', 'bottom box magazine', 'curved wood stock', 'pistol grip'], ...spec };
  model.userData.parts = { stock, receiver, handguard, barrel, magazine, muzzle, frontSight, triggerGuard, pistolGrip, chargingHandle: cockingRing, boltHandle: null, coreSilhouette };
  return model;
}

function buildFm2429(spec, materials) {
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;

  const stockShape = new THREE.Shape();
  stockShape.moveTo(0, 0.01);
  stockShape.lineTo(0, -0.14);
  stockShape.lineTo(0.05, -0.14);
  stockShape.bezierCurveTo(0.15, -0.14, 0.25, -0.07, spec.stockEnd, -0.05);
  stockShape.lineTo(spec.stockEnd, 0.01);
  stockShape.lineTo(0, 0.01);
  const stock = profilePart(model, materials.wood, `${spec.designation}_Stock`, stockShape, 0.045, spec.stockEnd * 0.5, 0);

  const receiverShape = new THREE.Shape();
  receiverShape.moveTo(spec.stockEnd, -0.04);
  receiverShape.lineTo(spec.handguardEnd, -0.04);
  receiverShape.lineTo(spec.handguardEnd, 0.02);
  receiverShape.lineTo(spec.stockEnd, 0.02);
  receiverShape.lineTo(spec.stockEnd, -0.04);
  const receiver = profilePart(model, materials.metal, `${spec.designation}_Receiver`, receiverShape, 0.048, (spec.stockEnd + spec.handguardEnd) * 0.5, 0);

  const handguardShape = new THREE.Shape();
  handguardShape.moveTo(spec.receiverEnd, -0.08);
  handguardShape.lineTo(spec.handguardEnd - 0.02, -0.08);
  handguardShape.lineTo(spec.handguardEnd - 0.02, -0.04);
  handguardShape.lineTo(spec.receiverEnd, -0.04);
  handguardShape.lineTo(spec.receiverEnd, -0.08);
  const handguard = profilePart(model, materials.wood, `${spec.designation}_Handguard`, handguardShape, 0.045, (spec.receiverEnd + spec.handguardEnd - 0.02) * 0.5, 0);

  const barrel = cylinderPart(model, materials.metal, `${spec.designation}_Barrel`, spec.barrelRadius, spec.handguardEnd, spec.overallLength);

  const gasTube = cylinderPart(model, materials.metal, 'FM2429_GasTube', 0.008, spec.handguardEnd, spec.overallLength - 0.09, 0, -0.025);

  const flashHiderGeometry = new THREE.CylinderGeometry(0.018, spec.barrelRadius, 0.06, 8);
  flashHiderGeometry.rotateX(Math.PI / 2);
  const flashHider = meshPart(model, flashHiderGeometry, materials.metal, 'FM2429_FlashHider', [0, 0, spec.overallLength - 0.03]);

  const magazine = boxPart(model, materials.metal, 'FM2429_TopMagazine', 0.03, 0.16, spec.stockEnd + 0.07, spec.stockEnd + 0.18, 0.10);
  magazine.rotation.x = -0.08;
  magazine.userData.feedType = 'top';

  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const triggerGuardGeometry = new THREE.TorusGeometry(0.025, 0.005, 5, 10);
  triggerGuardGeometry.rotateY(Math.PI / 2);
  const triggerGuard = meshPart(model, triggerGuardGeometry, materials.metal, `${spec.designation}_TriggerGuard`, [0, -0.055, spec.stockEnd + 0.05]);

  const pistolGrip = boxPart(model, materials.wood, `${spec.designation}_PistolGrip`, 0.032, 0.12, 0, 0.04, -0.105);
  pistolGrip.position.z = spec.stockEnd + 0.04;
  pistolGrip.rotation.x = -0.16;

  const stemGeometry = new THREE.CylinderGeometry(0.004, 0.005, 0.04, 5);
  stemGeometry.rotateX(Math.PI / 2);
  const chargingHandle = meshPart(model, stemGeometry, materials.metal, `${spec.designation}_ChargingHandle`, [lateralX('right', 0.038), 0.012, spec.stockEnd + 0.12]);
  chargingHandle.userData.semanticSide = 'right';

  const frontSight = boxPart(model, materials.metal, `${spec.designation}_FrontSight`, 0.018, 0.045, spec.overallLength - 0.09, spec.overallLength - 0.07, 0.03);
  frontSight.userData.semanticPart = 'frontSight';

  const bipodGeometry = new THREE.CylinderGeometry(0.008, 0.009, 0.34, 5);
  for (const side of [-1, 1]) {
    const leg = meshPart(model, bipodGeometry, materials.metal, `${spec.designation}_Bipod_${side < 0 ? 'Left' : 'Right'}`, [side * 0.02, -0.015, spec.overallLength - 0.08 - 0.17]);
    leg.rotation.x = Math.PI / 2;
  }

  const coreSilhouette = [stock, receiver, handguard, barrel, gasTube, flashHider, magazine, pistolGrip];
  for (const part of coreSilhouette) part.userData.lodBand = 'core';

  model.userData.visualContract = { units: 'metres', overallLength: spec.overallLength, definingFeatures: ['top magazine', 'folded bipod', 'cone flash hider', 'club foot', 'gas tube'], ...spec };
  model.userData.parts = { stock, receiver, handguard, barrel, magazine, muzzle, frontSight, triggerGuard, pistolGrip, chargingHandle, boltHandle: null, coreSilhouette };
  return model;
}

function buildWeaponModel(spec, materials) {
  if (spec.id === 'mas36') return buildMas36(spec, materials);
  if (spec.id === 'mas38') return buildMas38(spec, materials);
  if (spec.id === 'fm2429') return buildFm2429(spec, materials);
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;

  let stock;
  if (spec.id === 'mp40') {
    addMp40FoldingStock(model, spec, materials.metal);
    stock = model.getObjectByName('MP40_ButtPlate');
  } else {
    stock = boxPart(
      model,
      materials.wood,
      `${spec.designation}_Stock`,
      spec.kind === 'lmg' ? 0.105 : 0.09,
      spec.kind === 'smg' ? 0.105 : 0.115,
      0,
      spec.stockEnd,
      spec.id === 'mas38' ? -0.018 : 0
    );
    const butt = boxPart(
      model,
      materials.wood,
      `${spec.designation}_Butt`,
      spec.kind === 'lmg' ? 0.15 : 0.13,
      spec.kind === 'smg' ? 0.14 : 0.17,
      0,
      Math.min(0.12, spec.stockEnd),
      spec.id === 'mas38' ? -0.025 : -0.015
    );
    butt.rotation.x = spec.id === 'mas38' ? -0.05 : 0.03;
  }

  const receiverWidth = spec.kind === 'lmg' ? 0.105 : (spec.id === 'mas38' ? 0.048 : (spec.id === 'mp40' ? 0.052 : 0.08));
  const receiver = boxPart(
    model,
    materials.metal,
    `${spec.designation}_Receiver`,
    receiverWidth,
    spec.kind === 'lmg' ? 0.1 : 0.075,
    spec.stockEnd,
    spec.receiverEnd,
    spec.id === 'mas38' ? 0.018 : 0
  );
  const handguard = boxPart(
    model,
    spec.id === 'mg34' || spec.id === 'mp40' ? materials.metal : materials.wood,
    `${spec.designation}_Handguard`,
    spec.kind === 'lmg' ? 0.085 : 0.065,
    spec.kind === 'lmg' ? 0.075 : 0.065,
    spec.receiverEnd,
    spec.handguardEnd,
    0
  );
  let profileDetail = null;
  if (spec.id === 'mas38') {
    profileDetail = boxPart(
      model,
      materials.metal,
      'MAS38_CantedReceiverRib',
      0.088,
      0.028,
      spec.stockEnd - 0.015,
      spec.receiverEnd + 0.045,
      0.052
    );
    profileDetail.rotation.x = -0.11;
    profileDetail.userData.definingFeature = 'canted receiver profile';

    // MAS-38 Top Rear Sight Ramp
    const sightRamp = boxPart(
      model,
      materials.metal,
      'MAS38_RearSightRamp',
      0.035,
      0.035,
      spec.stockEnd + 0.04,
      spec.stockEnd + 0.12,
      0.068
    );
    sightRamp.userData.lodBand = 'high';

    // MAS-38 Right-Side Spring Dust Cover over Ejection Port
    const dustCover = boxPart(
      model,
      materials.metal,
      'MAS38_DustCover',
      0.018,
      0.032,
      spec.stockEnd + 0.12,
      spec.receiverEnd - 0.02,
      0.018
    );
    dustCover.position.x = lateralX('right', 0.044);
    dustCover.userData.lodBand = 'high';
  }
  const barrel = cylinderPart(
    model,
    materials.metal,
    `${spec.designation}_Barrel`,
    spec.barrelRadius,
    spec.handguardEnd,
    spec.overallLength
  );

  if (spec.id === 'mg34') {
    const jacket = cylinderPart(
      model,
      materials.metal,
      'MG34_PerforatedBarrelJacket',
      0.035,
      spec.receiverEnd,
      spec.handguardEnd,
      0,
      0,
      10
    );
    jacket.userData.perforatedJacket = true;
  }
  if (spec.id === 'fm2429' || spec.id === 'mg34') addBipod(model, spec, materials.metal);

  const magazine = addMagazine(model, spec, materials.metal);
  const fireControls = addFireControls(model, spec, materials);
  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const frontSight = boxPart(
    model,
    materials.metal,
    `${spec.designation}_FrontSight`,
    0.018,
    0.045,
    spec.overallLength - 0.055,
    spec.overallLength - 0.035,
    0.03
  );
  frontSight.userData.semanticPart = 'frontSight';

  if (spec.id === 'mas38') {
    for (const side of [-1, 1]) {
      const ear = boxPart(
        model,
        materials.metal,
        `MAS38_FrontSightEar_${side < 0 ? 'Left' : 'Right'}`,
        0.008,
        0.055,
        spec.overallLength - 0.055,
        spec.overallLength - 0.035,
        0.032
      );
      ear.position.x = side * 0.018;
      ear.userData.lodBand = 'high';
    }
  }

  // Keep one coherent firearm silhouette through the core infantry tier.
  // Detail controls can disappear at distance, but the stock/receiver/feed/
  // barrel chain must still reach the authoritative muzzle marker.
  const coreSilhouette = [stock, receiver, handguard, barrel, magazine];
  if (spec.id === 'mp40') {
    model.traverse(object => {
      if (object.isMesh && /^MP40_(FoldingStock|ButtPlate)/.test(object.name)) {
        coreSilhouette.push(object);
      }
    });
  }
  if (spec.id === 'mg34') {
    coreSilhouette.push(model.getObjectByName('MG34_PerforatedBarrelJacket'));
  }
  for (const part of coreSilhouette) {
    if (part?.isMesh) part.userData.lodBand = 'core';
  }

  model.userData.visualContract = {
    units: 'metres',
    sourceQuality: {
      overallLength: 'historical nominal',
      sectionalDimensions: 'inferred visual proportion'
    },
    ...spec
  };
  model.userData.parts = {
    stock,
    receiver,
    handguard,
    barrel,
    magazine,
    muzzle,
    frontSight,
    profileDetail,
    coreSilhouette: coreSilhouette.filter(Boolean),
    ...fireControls
  };
  return model;
}

export function createFrance1940InfantryWeaponRig(weaponName, materials) {
  const spec = FRANCE_1940_INFANTRY_WEAPON_VISUALS[weaponName]
    ?? FRANCE_1940_INFANTRY_WEAPON_VISUALS['MAS-36 Rifle'];
  const rig = new THREE.Group();
  rig.name = 'TwoHandWeaponRig';

  const weapon = buildWeaponModel(spec, materials);
  rig.add(weapon);

  const hasPistolGrip = ['fm2429', 'mas38', 'mg34', 'mp40'].includes(spec.id);
  const triggerGrip = new THREE.Object3D();
  triggerGrip.name = 'TriggerHandGrip';
  triggerGrip.position.set(
    lateralX('right', 0.045),
    hasPistolGrip ? -0.08 : -0.035,
    hasPistolGrip ? spec.stockEnd + 0.02 : Math.max(0.16, spec.stockEnd - 0.025)
  );
  rig.add(triggerGrip);

  const supportGrip = new THREE.Object3D();
  supportGrip.name = 'SupportHandGrip';
  supportGrip.position.set(
    lateralX('left', 0.025),
    -0.03,
    spec.receiverEnd + (spec.handguardEnd - spec.receiverEnd) * 0.25
  );
  rig.add(supportGrip);

  const reloadGrip = new THREE.Object3D();
  reloadGrip.name = 'ReloadHandGrip';
  const reloadZ = spec.magazine === 'internal'
    ? spec.stockEnd + (spec.receiverEnd - spec.stockEnd) * 0.72
    : spec.stockEnd + 0.13;
  const reloadY = spec.magazine === 'top-box'
    ? 0.16
    : spec.magazine === 'bottom-box'
      ? -0.17
      : 0.015;
  reloadGrip.position.set(spec.magazine === 'side-drum' ? 0.12 : -0.055, reloadY, reloadZ);
  rig.add(reloadGrip);

  // Butt starts just ahead of the firing shoulder. Long-gun support grips
  // remain inside a physically plausible two-segment arm reach.
  // With +Z forward, -X is the model's right side. Seat the butt into the right
  // shoulder so the pose reads as right-handed from normal tactical cameras.
  rig.position.set(lateralX('right', 0.18), 1.46, 0.06);
  rig.rotation.set(-0.14, 0, 0.07);
  rig.userData.restPosition = rig.position.toArray();
  rig.userData.restRotation = rig.rotation.toArray();
  rig.userData.weaponName = weaponName;
  rig.userData.weaponModel = weapon;
  rig.userData.muzzle = weapon.userData.parts.muzzle;
  rig.userData.grips = { trigger: triggerGrip, support: supportGrip, reload: reloadGrip };
  rig.userData.semanticRig = 'two-hand-firearm';
  rig.userData.handedness = {
    firingHand: 'right',
    triggerSide: '-X',
    supportHand: 'left'
  };
  return rig;
}
