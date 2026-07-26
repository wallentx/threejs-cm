import * as THREE from 'three';

// Visual dimensions are metres. Overall lengths are historical nominal values;
// the smaller sectional dimensions are inferred visual proportions.
export const INFANTRY_WEAPON_VISUALS = Object.freeze({
  'MAS-36 Rifle': Object.freeze({
    id: 'mas36',
    designation: 'MAS-36',
    kind: 'rifle',
    overallLength: 1.02,
    stockEnd: 0.43,
    receiverEnd: 0.58,
    handguardEnd: 0.78,
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
    barrelRadius: 0.012,
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
  const magazine = boxPart(
    model,
    metalMaterial,
    `${spec.designation}_BoxMagazine`,
    spec.id === 'mp40' ? 0.055 : 0.065,
    spec.id === 'mp40' ? 0.22 : 0.19,
    spec.stockEnd + 0.08,
    spec.stockEnd + 0.15,
    -0.13
  );
  magazine.rotation.x = spec.id === 'mas38' ? 0.09 : -0.03;
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
      [0.07, 0.005, handleZ]
    );
    boltHandle.userData.semanticSide = 'right';
    const boltKnob = meshPart(
      model,
      new THREE.SphereGeometry(0.018, 6, 4),
      materials.metal,
      `${spec.designation}_BoltKnob`,
      [0.125, spec.id === 'mas36' ? -0.008 : 0.005, handleZ]
    );
    boltKnob.userData.semanticSide = 'right';
    boltHandle.userData.knob = boltKnob;
    ejectionPort = meshPart(
      model,
      new THREE.BoxGeometry(0.009, 0.026, 0.075),
      materials.metal,
      `${spec.designation}_EjectionPort`,
      [0.046, 0.014, handleZ + 0.025]
    );
    ejectionPort.userData.semanticSide = 'right';
  } else {
    const handleSide = ['fm2429', 'mas38', 'mg34'].includes(spec.id) ? 1 : -1;
    chargingHandle = meshPart(
      model,
      stemGeometry,
      materials.metal,
      `${spec.designation}_ChargingHandle`,
      [handleSide * 0.075, 0.012, handleZ]
    );
    chargingHandle.userData.semanticSide = handleSide > 0 ? 'right' : 'left';
  }
  return { triggerGuard, pistolGrip, boltHandle, chargingHandle, ejectionPort };
}

function buildWeaponModel(spec, materials) {
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

  const receiver = boxPart(
    model,
    materials.metal,
    `${spec.designation}_Receiver`,
    spec.kind === 'lmg' ? 0.105 : 0.08,
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
    profileDetail.rotation.x = -0.1;
    profileDetail.userData.definingFeature = 'canted receiver profile';
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

export function createInfantryWeaponRig(weaponName, materials) {
  const spec = INFANTRY_WEAPON_VISUALS[weaponName] ?? INFANTRY_WEAPON_VISUALS['MAS-36 Rifle'];
  const rig = new THREE.Group();
  rig.name = 'TwoHandWeaponRig';

  const weapon = buildWeaponModel(spec, materials);
  rig.add(weapon);

  const triggerGrip = new THREE.Object3D();
  triggerGrip.name = 'TriggerHandGrip';
  triggerGrip.position.set(0.045, -0.035, Math.max(0.16, spec.stockEnd - 0.025));
  rig.add(triggerGrip);

  const supportGrip = new THREE.Object3D();
  supportGrip.name = 'SupportHandGrip';
  supportGrip.position.set(
    -0.045,
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
  // +X is the model's right side. Seat the butt visibly into the right
  // shoulder so the pose reads as right-handed from normal tactical cameras.
  rig.position.set(0.18, 1.46, 0.06);
  rig.rotation.set(-0.14, 0, -0.07);
  rig.userData.restPosition = rig.position.toArray();
  rig.userData.restRotation = rig.rotation.toArray();
  rig.userData.weaponName = weaponName;
  rig.userData.weaponModel = weapon;
  rig.userData.muzzle = weapon.userData.parts.muzzle;
  rig.userData.grips = { trigger: triggerGrip, support: supportGrip, reload: reloadGrip };
  rig.userData.semanticRig = 'two-hand-firearm';
  rig.userData.handedness = {
    firingHand: 'right',
    triggerSide: '+X',
    supportHand: 'left'
  };
  return rig;
}
