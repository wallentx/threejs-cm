const fs = require('fs');

const path = 'src/content/france1940/render/France1940InfantryWeaponFactory.js';
let code = fs.readFileSync(path, 'utf8');

const bespokeCode = `
function buildMas36(spec, materials) {
  const model = new THREE.Group();
  model.name = \`\${spec.designation}_WeaponModel\`;

  const stockShape = new THREE.Shape();
  stockShape.moveTo(0, -0.01);
  stockShape.lineTo(0.01, -0.12);
  stockShape.lineTo(0.12, -0.12);
  stockShape.bezierCurveTo(0.25, -0.12, 0.28, -0.11, 0.28, -0.07);
  stockShape.lineTo(spec.stockEnd, -0.045);
  stockShape.lineTo(spec.stockEnd, -0.005);
  stockShape.lineTo(0.28, -0.005);
  stockShape.bezierCurveTo(0.15, -0.005, 0.05, -0.025, 0, -0.01);
  const stock = profilePart(model, materials.wood, \`\${spec.designation}_Stock\`, stockShape, 0.042, spec.stockEnd * 0.5, 0);

  const receiverShape = new THREE.Shape();
  receiverShape.moveTo(spec.stockEnd, -0.045);
  receiverShape.lineTo(spec.receiverEnd, -0.045);
  receiverShape.lineTo(spec.receiverEnd, 0.015);
  receiverShape.lineTo(spec.stockEnd, 0.015);
  receiverShape.lineTo(spec.stockEnd, -0.045);
  const receiver = profilePart(model, materials.metal, \`\${spec.designation}_Receiver\`, receiverShape, 0.038, (spec.stockEnd + spec.receiverEnd) * 0.5, 0);

  const handguardShape = new THREE.Shape();
  handguardShape.moveTo(spec.receiverEnd, -0.035);
  handguardShape.lineTo(spec.handguardEnd, -0.015);
  handguardShape.lineTo(spec.handguardEnd, 0.01);
  handguardShape.lineTo(spec.receiverEnd, 0.015);
  handguardShape.lineTo(spec.receiverEnd, -0.035);
  const handguard = profilePart(model, materials.wood, \`\${spec.designation}_Handguard\`, handguardShape, 0.038, (spec.receiverEnd + spec.handguardEnd) * 0.5, 0);

  const barrel = cylinderPart(model, materials.metal, \`\${spec.designation}_Barrel\`, spec.barrelRadius, spec.handguardEnd, spec.overallLength);

  const magazine = boxPart(model, materials.metal, \`\${spec.designation}_InternalMagazineFloorplate\`, 0.04, 0.018, spec.stockEnd + 0.02, spec.receiverEnd - 0.02, -0.045);
  magazine.userData.feedType = 'internal';

  const muzzle = new THREE.Object3D();
  muzzle.name = \`\${spec.designation}_Muzzle\`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const triggerGuardGeometry = new THREE.TorusGeometry(0.025, 0.005, 5, 10);
  triggerGuardGeometry.rotateY(Math.PI / 2);
  const triggerGuard = meshPart(model, triggerGuardGeometry, materials.metal, \`\${spec.designation}_TriggerGuard\`, [0, -0.055, spec.stockEnd + 0.04]);

  const stemGeometry = new THREE.CylinderGeometry(0.004, 0.005, 0.04, 5);
  stemGeometry.rotateX(Math.PI / 2);
  const handleZ = spec.stockEnd + (spec.receiverEnd - spec.stockEnd) * 0.52;
  const boltHandle = meshPart(model, stemGeometry, materials.metal, \`\${spec.designation}_BoltHandle\`, [lateralX('right', 0.03), 0.014, handleZ]);
  boltHandle.rotation.y = 0.3;
  boltHandle.rotation.x = -0.3;
  boltHandle.userData.semanticSide = 'right';

  const boltKnob = meshPart(model, new THREE.SphereGeometry(0.012, 6, 6), materials.metal, \`\${spec.designation}_BoltKnob\`, [lateralX('right', 0.045), 0.0, handleZ + 0.015]);
  boltKnob.userData.semanticSide = 'right';
  boltHandle.userData.knob = boltKnob;

  const frontSight = boxPart(model, materials.metal, \`\${spec.designation}_FrontSight\`, 0.018, 0.045, spec.overallLength - 0.04, spec.overallLength - 0.02, 0.03);
  frontSight.userData.semanticPart = 'frontSight';

  const bayonetTube = cylinderPart(model, materials.metal, \`\${spec.designation}_BayonetTube\`, 0.008, spec.handguardEnd, spec.overallLength - 0.02, 0, -0.015);

  const coreSilhouette = [stock, receiver, handguard, barrel, magazine, bayonetTube];
  for (const part of coreSilhouette) part.userData.lodBand = 'core';

  model.userData.visualContract = { units: 'metres', overallLength: spec.overallLength, definingFeatures: ['exposed bayonet tube', 'forward bent bolt', 'two piece stock'], ...spec };
  model.userData.parts = { stock, receiver, handguard, barrel, magazine, muzzle, frontSight, triggerGuard, boltHandle, chargingHandle: null, coreSilhouette };
  return model;
}

function buildMas38(spec, materials) {
  const model = new THREE.Group();
  model.name = \`\${spec.designation}_WeaponModel\`;

  const stockShape = new THREE.Shape();
  stockShape.moveTo(0, -0.04);
  stockShape.lineTo(0.01, -0.15);
  stockShape.lineTo(0.08, -0.15);
  stockShape.lineTo(spec.stockEnd, -0.07);
  stockShape.lineTo(spec.stockEnd, -0.02);
  stockShape.lineTo(0, -0.04);
  const stock = profilePart(model, materials.wood, \`\${spec.designation}_Stock\`, stockShape, 0.035, spec.stockEnd * 0.5, 0);

  const receiverShape = new THREE.Shape();
  receiverShape.moveTo(spec.stockEnd, -0.04);
  receiverShape.lineTo(spec.receiverEnd, -0.04);
  receiverShape.lineTo(spec.receiverEnd, 0.02);
  receiverShape.lineTo(spec.stockEnd, 0.02);
  receiverShape.lineTo(spec.stockEnd, -0.04);
  const receiver = profilePart(model, materials.metal, \`\${spec.designation}_Receiver\`, receiverShape, 0.032, (spec.stockEnd + spec.receiverEnd) * 0.5, 0);

  const handguard = boxPart(model, materials.metal, \`\${spec.designation}_Handguard\`, 0.032, 0.032, spec.receiverEnd, spec.receiverEnd + 0.05, -0.01);

  const barrel = cylinderPart(model, materials.metal, \`\${spec.designation}_Barrel\`, spec.barrelRadius, spec.receiverEnd + 0.05, spec.overallLength);

  const magWell = boxPart(model, materials.metal, 'MAS38_MagWell', 0.034, 0.038, spec.stockEnd + 0.075, spec.stockEnd + 0.135, -0.032);
  magWell.userData.lodBand = 'high';

  const magazine = boxPart(model, materials.metal, \`\${spec.designation}_BoxMagazine\`, 0.024, 0.16, spec.stockEnd + 0.08, spec.stockEnd + 0.125, -0.11);
  magazine.rotation.x = 0.22;
  magazine.userData.feedType = 'bottom';

  const muzzle = new THREE.Object3D();
  muzzle.name = \`\${spec.designation}_Muzzle\`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const triggerGuardGeometry = new THREE.TorusGeometry(0.025, 0.005, 5, 10);
  triggerGuardGeometry.rotateY(Math.PI / 2);
  const triggerGuard = meshPart(model, triggerGuardGeometry, materials.metal, \`\${spec.designation}_TriggerGuard\`, [0, -0.075, spec.stockEnd + 0.02]);

  const stemGeometry = new THREE.CylinderGeometry(0.004, 0.005, 0.04, 5);
  stemGeometry.rotateX(Math.PI / 2);
  const chargingHandle = meshPart(model, stemGeometry, materials.metal, \`\${spec.designation}_ChargingHandle\`, [lateralX('right', 0.035), 0.01, spec.stockEnd + 0.1]);
  chargingHandle.userData.semanticSide = 'right';

  const frontSight = boxPart(model, materials.metal, \`\${spec.designation}_FrontSight\`, 0.018, 0.045, spec.overallLength - 0.04, spec.overallLength - 0.02, 0.03);
  frontSight.userData.semanticPart = 'frontSight';

  const profileDetail = boxPart(model, materials.metal, 'MAS38_CantedReceiverRib', 0.088, 0.028, spec.stockEnd - 0.015, spec.receiverEnd + 0.045, 0.052);
  profileDetail.rotation.x = -0.11;
  profileDetail.userData.definingFeature = 'canted receiver profile';

  const coreSilhouette = [stock, receiver, handguard, barrel, magazine];
  for (const part of coreSilhouette) part.userData.lodBand = 'core';

  model.userData.visualContract = { units: 'metres', overallLength: spec.overallLength, definingFeatures: ['canted receiver profile', 'angled stock', 'mag well'], ...spec };
  model.userData.parts = { stock, receiver, handguard, barrel, magazine, muzzle, frontSight, triggerGuard, chargingHandle, boltHandle: null, profileDetail, coreSilhouette };
  return model;
}

function buildFm2429(spec, materials) {
  const model = new THREE.Group();
  model.name = \`\${spec.designation}_WeaponModel\`;

  const stockShape = new THREE.Shape();
  stockShape.moveTo(0, 0.01);
  stockShape.lineTo(0, -0.14);
  stockShape.lineTo(0.05, -0.14);
  stockShape.bezierCurveTo(0.15, -0.14, 0.25, -0.07, spec.stockEnd, -0.05);
  stockShape.lineTo(spec.stockEnd, 0.01);
  stockShape.lineTo(0, 0.01);
  const stock = profilePart(model, materials.wood, \`\${spec.designation}_Stock\`, stockShape, 0.045, spec.stockEnd * 0.5, 0);

  const receiverShape = new THREE.Shape();
  receiverShape.moveTo(spec.stockEnd, -0.06);
  receiverShape.lineTo(spec.receiverEnd, -0.06);
  receiverShape.lineTo(spec.receiverEnd, 0.02);
  receiverShape.lineTo(spec.stockEnd, 0.02);
  receiverShape.lineTo(spec.stockEnd, -0.06);
  const receiver = profilePart(model, materials.metal, \`\${spec.designation}_Receiver\`, receiverShape, 0.048, (spec.stockEnd + spec.receiverEnd) * 0.5, 0);

  const handguardShape = new THREE.Shape();
  handguardShape.moveTo(spec.receiverEnd, -0.05);
  handguardShape.lineTo(spec.handguardEnd, -0.015);
  handguardShape.lineTo(spec.handguardEnd, 0.01);
  handguardShape.lineTo(spec.receiverEnd, 0.015);
  handguardShape.lineTo(spec.receiverEnd, -0.05);
  const handguard = profilePart(model, materials.wood, \`\${spec.designation}_Handguard\`, handguardShape, 0.045, (spec.receiverEnd + spec.handguardEnd) * 0.5, 0);

  const barrel = cylinderPart(model, materials.metal, \`\${spec.designation}_Barrel\`, spec.barrelRadius, spec.handguardEnd, spec.overallLength - 0.05);
  
  const flashHider = cylinderPart(model, materials.metal, 'FM2429_FlashHider', spec.barrelRadius * 1.5, spec.overallLength - 0.05, spec.overallLength);

  const magazine = boxPart(model, materials.metal, 'FM2429_TopMagazine', 0.085, 0.18, spec.stockEnd + 0.07, spec.stockEnd + 0.18, 0.12);
  magazine.rotation.x = -0.08;
  magazine.userData.feedType = 'top';

  const muzzle = new THREE.Object3D();
  muzzle.name = \`\${spec.designation}_Muzzle\`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const triggerGuardGeometry = new THREE.TorusGeometry(0.025, 0.005, 5, 10);
  triggerGuardGeometry.rotateY(Math.PI / 2);
  const triggerGuard = meshPart(model, triggerGuardGeometry, materials.metal, \`\${spec.designation}_TriggerGuard\`, [0, -0.055, spec.stockEnd + 0.05]);
  
  const pistolGrip = boxPart(model, materials.wood, \`\${spec.designation}_PistolGrip\`, 0.032, 0.12, 0, 0.04, -0.105);
  pistolGrip.position.z = spec.stockEnd + 0.04;
  pistolGrip.rotation.x = -0.16;

  const stemGeometry = new THREE.CylinderGeometry(0.004, 0.005, 0.04, 5);
  stemGeometry.rotateX(Math.PI / 2);
  const chargingHandle = meshPart(model, stemGeometry, materials.metal, \`\${spec.designation}_ChargingHandle\`, [lateralX('right', 0.038), 0.012, spec.stockEnd + 0.12]);
  chargingHandle.userData.semanticSide = 'right';

  const frontSight = boxPart(model, materials.metal, \`\${spec.designation}_FrontSight\`, 0.018, 0.045, spec.overallLength - 0.09, spec.overallLength - 0.07, 0.03);
  frontSight.userData.semanticPart = 'frontSight';

  const bipodGeometry = new THREE.CylinderGeometry(0.008, 0.009, 0.34, 5);
  for (const side of [-1, 1]) {
    const leg = meshPart(model, bipodGeometry, materials.metal, \`\${spec.designation}_Bipod_\${side < 0 ? 'Left' : 'Right'}\`, [side * 0.02, -0.015, spec.handguardEnd + 0.17]);
    leg.rotation.x = Math.PI / 2;
  }

  const coreSilhouette = [stock, receiver, handguard, barrel, flashHider, magazine];
  for (const part of coreSilhouette) part.userData.lodBand = 'core';

  model.userData.visualContract = { units: 'metres', overallLength: spec.overallLength, definingFeatures: ['top magazine', 'folded bipod', 'flash hider', 'club foot'], ...spec };
  model.userData.parts = { stock, receiver, handguard, barrel, magazine, muzzle, frontSight, triggerGuard, pistolGrip, chargingHandle, boltHandle: null, coreSilhouette };
  return model;
}
`;

// Insert the functions before buildWeaponModel
const buildIdx = code.indexOf('function buildWeaponModel(');
code = code.slice(0, buildIdx) + bespokeCode + '\n' + code.slice(buildIdx);

// Modify buildWeaponModel to dispatch
const dispatcher = `
function buildWeaponModel(spec, materials) {
  if (spec.id === 'mas36') return buildMas36(spec, materials);
  if (spec.id === 'mas38') return buildMas38(spec, materials);
  if (spec.id === 'fm2429') return buildFm2429(spec, materials);
`;
code = code.replace('function buildWeaponModel(spec, materials) {\n', dispatcher);

fs.writeFileSync(path, code);
