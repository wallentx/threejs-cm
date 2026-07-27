import * as THREE from 'three';
import {
  createAMC35Mesh,
  createCharB1BisMesh,
  createHotchkissH39Mesh,
  createLafflyS20TLMesh,
  createOpelBlitzMesh,
  createPanhard178Mesh,
  createPanzer35tMesh,
  createPanzer38tMesh,
  createPanzerIIMesh,
  createPanzerIIIMesh,
  createPanzerIVMesh,
  createRenaultR35Mesh,
  createSdKfz231Mesh,
  createSomuaS35Mesh
} from './vehicles/index.js';
import { lateralX } from './LocalFrame.js';
import { createInfantryWeaponRig } from './infantry/index.js';
import { normalizeInfantryStandingHeight } from './WorldScale.js';

const VEHICLE_MESH_CREATORS = Object.freeze({
  fr_somua: createSomuaS35Mesh,
  fr_renault_r35: createRenaultR35Mesh,
  fr_hotchkiss_h39: createHotchkissH39Mesh,
  fr_amc35: createAMC35Mesh,
  fr_panhard178: createPanhard178Mesh,
  fr_laffly_s20tl: createLafflyS20TLMesh,
  fr_char_b1bis: createCharB1BisMesh,
  ger_panzer2: createPanzerIIMesh,
  ger_panzer3: createPanzerIIIMesh,
  ger_panzer35t: createPanzer35tMesh,
  ger_panzer38t: createPanzer38tMesh,
  ger_sdkfz231: createSdKfz231Mesh,
  ger_opel_blitz: createOpelBlitzMesh,
  ger_panzer4: createPanzerIVMesh
});

function attachVehicleSelectionDisc(vehicle) {
  const dimensions = vehicle.userData.modelMetadata?.dimensionsMeters;
  const halfWidth = (dimensions?.width ?? 2.2) * 0.5;
  const innerRadius = Math.max(0.8, halfWidth + 0.2);
  const outerRadius = innerRadius + 0.65;
  const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 20);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: vehicle.name.startsWith('fr_') ? 0x3b82f6 : 0xef4444,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35,
    depthWrite: false
  });
  const disc = new THREE.Mesh(geometry, material);
  disc.name = 'SelectionDisc';
  disc.position.y = 0.05;
  disc.userData.lodBand = 'ui';
  disc.visible = false;
  vehicle.add(disc);
  vehicle.userData.selectionDisc = disc;
  return vehicle;
}

export class UnitFactory {
  static createInfantrySquadMesh(faction = 'french', rosterOrCount = 6) {
    const roster = Array.isArray(rosterOrCount) ? rosterOrCount : [];
    const squadCount = Array.isArray(rosterOrCount) ? rosterOrCount.length : rosterOrCount;
    const squadGroup = new THREE.Group();
    squadGroup.name = `Squad_${faction}`;

    const isFrench = faction === 'french';
    const uniformMat = new THREE.MeshStandardMaterial({
      color: isFrench ? '#77745d' : '#596052',
      roughness: 0.92,
      metalness: 0
    });
    const trouserMat = new THREE.MeshStandardMaterial({
      color: isFrench ? '#6c6853' : '#67645a',
      roughness: 0.95
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: '#c58d69', roughness: 0.88 });
    const helmetMat = new THREE.MeshStandardMaterial({
      color: isFrench ? '#52616a' : '#3f463e',
      roughness: 0.72,
      metalness: 0.16
    });
    const leatherMat = new THREE.MeshStandardMaterial({ color: '#4b3425', roughness: 0.82 });
    const webbingMat = new THREE.MeshStandardMaterial({
      color: isFrench ? '#8a815f' : '#6f6449',
      roughness: 0.94
    });
    const woodMat = new THREE.MeshStandardMaterial({ color: '#5b3823', roughness: 0.72 });
    const weaponMat = new THREE.MeshStandardMaterial({
      color: '#242722',
      roughness: 0.48,
      metalness: 0.62
    });
    const proxyUniformMat = new THREE.MeshStandardMaterial({
      color: isFrench ? '#6f715b' : '#555d50',
      roughness: 1
    });

    const discGeo = new THREE.RingGeometry(0.5, 2.2, 16);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color: isFrench ? 0x3b82f6 : 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.32,
      depthWrite: false
    });
    const baseDisc = new THREE.Mesh(discGeo, discMat);
    baseDisc.position.y = 0.05;
    baseDisc.userData.lodBand = 'ui';
    squadGroup.add(baseDisc);

    const geometry = {
      torso: new THREE.CylinderGeometry(0.25, 0.34, 0.72, 7),
      pelvis: new THREE.BoxGeometry(0.48, 0.2, 0.3),
      head: new THREE.SphereGeometry(0.18, 8, 6),
      limb: new THREE.CylinderGeometry(0.075, 0.095, 0.62, 6),
      hand: new THREE.SphereGeometry(0.085, 6, 5),
      boot: new THREE.BoxGeometry(0.17, 0.16, 0.32),
      pouch: new THREE.BoxGeometry(0.17, 0.18, 0.11),
      pack: new THREE.BoxGeometry(0.48, 0.48, 0.18),
      belt: new THREE.BoxGeometry(0.62, 0.1, 0.38)
    };

    const createPivotedLimb = (material, length, radiusScale = 1) => {
      const pivot = new THREE.Group();
      const limb = new THREE.Mesh(geometry.limb, material);
      limb.scale.set(radiusScale, length / 0.62, radiusScale);
      limb.position.y = -length * 0.5;
      limb.castShadow = true;
      pivot.add(limb);
      return pivot;
    };

    const createTwoBoneArm = (material, skinMaterial) => {
      const upperLength = 0.42;
      const lowerLength = 0.42;
      const shoulder = new THREE.Group();
      const upperArm = new THREE.Mesh(geometry.limb, material);
      upperArm.name = 'UpperArm';
      upperArm.scale.set(1, upperLength / 0.62, 1);
      upperArm.position.y = -upperLength * 0.5;
      upperArm.castShadow = true;
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.name = 'Elbow';
      elbow.position.y = -upperLength;
      shoulder.add(elbow);

      const forearm = new THREE.Mesh(geometry.limb, material);
      forearm.name = 'Forearm';
      forearm.scale.set(0.86, lowerLength / 0.62, 0.86);
      forearm.position.y = -lowerLength * 0.5;
      forearm.castShadow = true;
      elbow.add(forearm);

      const hand = new THREE.Mesh(geometry.hand, skinMaterial);
      hand.name = 'Hand';
      hand.position.y = -lowerLength;
      elbow.add(hand);

      shoulder.userData.armRig = {
        upperArm,
        elbow,
        forearm,
        hand,
        upperLength,
        lowerLength
      };
      return shoulder;
    };

    const formationOffset = (index) => {
      const row = Math.floor(index / 3);
      const column = index % 3;
      return new THREE.Vector3((column - 1) * 1.35, 0, (row - 0.5) * 1.7);
    };

    const soldiers = [];

    for (let i = 0; i < squadCount; i++) {
      const soldierGroup = new THREE.Group();
      soldierGroup.name = `Soldier_${i}`;
      const weaponName = roster[i]?.weapon
        ?? (isFrench
          ? (i === 2 ? 'FM 24/29 LMG' : 'MAS-36 Rifle')
          : (i === 2 ? 'MG34 LMG' : 'Kar98k'));
      const pelvis = new THREE.Mesh(geometry.pelvis, uniformMat);
      pelvis.name = 'Pelvis';
      pelvis.position.y = 0.89;
      pelvis.castShadow = true;
      soldierGroup.add(pelvis);

      const torso = new THREE.Mesh(geometry.torso, uniformMat);
      torso.name = 'Torso';
      torso.position.y = 1.29;
      torso.castShadow = true;
      soldierGroup.add(torso);

      const belt = new THREE.Mesh(geometry.belt, leatherMat);
      belt.position.set(0, 1.0, 0);
      soldierGroup.add(belt);

      const head = new THREE.Mesh(geometry.head, skinMat);
      head.name = 'Head';
      head.position.y = 1.82;
      head.userData.restY = head.position.y;
      head.castShadow = true;
      soldierGroup.add(head);

      const helmetGeo = new THREE.SphereGeometry(
        isFrench ? 0.235 : 0.25,
        10,
        6,
        0,
        Math.PI * 2,
        0,
        isFrench ? Math.PI / 2.05 : Math.PI / 1.82
      );
      const helmet = new THREE.Mesh(helmetGeo, helmetMat);
      helmet.name = isFrench ? 'FrenchM1926_HelmetDome' : 'GermanM35_HelmetDome';
      helmet.scale.set(isFrench ? 1.0 : 1.08, 0.76, isFrench ? 1.12 : 1.18);
      helmet.position.y = 1.91;
      helmet.userData.restY = helmet.position.y;
      helmet.userData.surfaceRole = 'helmet-shell';
      helmet.castShadow = true;
      soldierGroup.add(helmet);
      const headgear = [helmet];

      if (isFrench) {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.025, 12), helmetMat);
        brim.name = 'FrenchM1926_HelmetBrim';
        brim.scale.z = 1.15;
        brim.position.y = 1.89;
        brim.userData.restY = brim.position.y;
        brim.userData.surfaceRole = 'helmet-brim';
        soldierGroup.add(brim);
        headgear.push(brim);
        const crestGeo = new THREE.BoxGeometry(0.045, 0.075, 0.38);
        const crest = new THREE.Mesh(crestGeo, helmetMat);
        crest.name = 'FrenchM1926_HelmetCrest';
        crest.position.set(0, 2.095, -0.015);
        crest.userData.restY = crest.position.y;
        crest.userData.surfaceRole = 'helmet-crest';
        soldierGroup.add(crest);
        headgear.push(crest);
      } else {
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.31, 0.09, 10), helmetMat);
        skirt.name = 'GermanM35_HelmetSkirt';
        skirt.scale.z = 1.12;
        skirt.position.y = 1.87;
        skirt.userData.restY = skirt.position.y;
        skirt.userData.surfaceRole = 'helmet-skirt';
        soldierGroup.add(skirt);
        headgear.push(skirt);
      }

      const leftHip = createPivotedLimb(trouserMat, 0.68, 1.08);
      leftHip.name = 'LeftLeg';
      leftHip.position.set(lateralX('left', 0.14), 0.83, 0);
      soldierGroup.add(leftHip);
      const leftBoot = new THREE.Mesh(geometry.boot, leatherMat);
      leftBoot.position.set(0, -0.69, 0.08);
      leftHip.add(leftBoot);

      const rightHip = createPivotedLimb(trouserMat, 0.68, 1.08);
      rightHip.name = 'RightLeg';
      rightHip.position.set(lateralX('right', 0.14), 0.83, 0);
      soldierGroup.add(rightHip);
      const rightBoot = new THREE.Mesh(geometry.boot, leatherMat);
      rightBoot.position.set(0, -0.69, 0.08);
      rightHip.add(rightBoot);

      const leftArm = createTwoBoneArm(uniformMat, skinMat);
      leftArm.name = 'LeftArm';
      leftArm.position.set(lateralX('left', 0.3), 1.52, 0);
      leftArm.userData.anatomicalSide = 'left';
      leftArm.rotation.x = -0.82;
      leftArm.rotation.z = 0.18;
      soldierGroup.add(leftArm);

      const rightArm = createTwoBoneArm(uniformMat, skinMat);
      rightArm.name = 'RightArm';
      rightArm.position.set(lateralX('right', 0.3), 1.52, 0);
      rightArm.userData.anatomicalSide = 'right';
      rightArm.rotation.x = -0.72;
      rightArm.rotation.z = -0.2;
      soldierGroup.add(rightArm);

      const leftHand = leftArm.userData.armRig.hand;
      leftHand.name = 'LeftHand';
      const rightHand = rightArm.userData.armRig.hand;
      rightHand.name = 'RightHand';

      const pack = new THREE.Mesh(geometry.pack, webbingMat);
      pack.position.set(0, 1.28, -0.27);
      pack.castShadow = true;
      soldierGroup.add(pack);

      const leftPouch = new THREE.Mesh(geometry.pouch, webbingMat);
      leftPouch.position.set(-0.23, 1.0, 0.2);
      soldierGroup.add(leftPouch);
      const rightPouch = leftPouch.clone();
      rightPouch.position.x = 0.23;
      soldierGroup.add(rightPouch);

      const weapon = createInfantryWeaponRig(weaponName, {
        wood: woodMat,
        metal: weaponMat
      });
      const weaponModel = weapon.userData.weaponModel;
      const muzzle = weapon.userData.muzzle;
      weapon.userData.handBindings = {
        trigger: rightHand.name,
        support: leftHand.name
      };
      soldierGroup.add(weapon);

      // Authored Far Proxy for Infantry with faction-accurate helmet silhouette & proxy weapon
      const lowProxy = new THREE.Group();
      lowProxy.name = 'LowDetailProxy';

      const proxyBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 1.25, 5),
        proxyUniformMat
      );
      proxyBody.position.y = 0.82;
      proxyBody.userData.lodBand = 'proxy';

      const proxyHead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), helmetMat);
      proxyHead.name = isFrench ? 'FrenchProxyHelmetDome' : 'GermanProxyHelmetDome';
      proxyHead.position.y = 1.55;
      proxyHead.userData.lodBand = 'proxy';
      proxyHead.userData.surfaceRole = 'helmet-proxy';

      if (isFrench) {
        const proxyBrim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.23, 0.23, 0.025, 8),
          helmetMat
        );
        proxyBrim.name = 'FrenchProxyHelmetBrim';
        proxyBrim.scale.z = 1.15;
        proxyBrim.position.set(0, 1.53, 0);
        proxyBrim.userData.lodBand = 'proxy';
        proxyBrim.userData.surfaceRole = 'helmet-proxy';
        lowProxy.add(proxyBrim);
        const proxyCrest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.3), helmetMat);
        proxyCrest.name = 'FrenchProxyHelmetCrest';
        proxyCrest.position.set(0, 1.76, 0);
        proxyCrest.userData.lodBand = 'proxy';
        proxyCrest.userData.surfaceRole = 'helmet-proxy';
        lowProxy.add(proxyCrest);
      } else {
        const proxySkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.27, 0.08, 6), helmetMat);
        proxySkirt.name = 'GermanProxyHelmetSkirt';
        proxySkirt.position.set(0, 1.52, 0);
        proxySkirt.userData.lodBand = 'proxy';
        proxySkirt.userData.surfaceRole = 'helmet-proxy';
        lowProxy.add(proxySkirt);
      }

      const proxyWeapon = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), weaponMat);
      proxyWeapon.rotation.x = Math.PI / 2;
      proxyWeapon.position.set(0.15, 1.2, 0.25);
      proxyWeapon.userData.lodBand = 'proxy';
      lowProxy.add(proxyWeapon);

      lowProxy.add(proxyBody, proxyHead);
      lowProxy.traverse(object => {
        if (object.isMesh) object.visible = false;
      });
      soldierGroup.add(lowProxy);

      soldierGroup.traverse(object => {
        if (object.isMesh && !object.userData.lodBand) object.userData.lodBand = 'core';
      });
      for (const headgearPart of headgear) {
        headgearPart.userData.lodBand = 'core';
      }
      for (const detail of [pack, leftPouch, rightPouch, leftHand, rightHand]) {
        detail.userData.lodBand = 'high';
      }

      const slotOffset = formationOffset(i);
      soldierGroup.position.copy(slotOffset);
      soldierGroup.userData.slotOffset = slotOffset.toArray();
      soldierGroup.userData.weaponName = weaponName;
      soldierGroup.userData.bones = {
        leftShoulder: leftArm,
        rightShoulder: rightArm,
        leftHip,
        rightHip,
        head
      };
      soldierGroup.userData.parts = {
        torso,
        head,
        helmet,
        headgear,
        leftArm,
        rightArm,
        leftLeg: leftHip,
        rightLeg: rightHip,
        weapon,
        weaponRig: weapon,
        weaponModel,
        muzzle,
        triggerGrip: weapon.userData.grips.trigger,
        supportGrip: weapon.userData.grips.support,
        reloadGrip: weapon.userData.grips.reload,
        leftHand,
        rightHand,
        pack
      };

      normalizeInfantryStandingHeight(soldierGroup);

      squadGroup.add(soldierGroup);
      soldiers.push(soldierGroup);
    }

    squadGroup.userData.soldiers = soldiers;
    squadGroup.userData.selectionDisc = baseDisc;
    squadGroup.userData.materialPalette = isFrench ? 'French 1940 khaki and blue-grey' : 'German feldgrau';
    return squadGroup;
  }

  static createTankMesh(type = 'fr_somua') {
    const creator = VEHICLE_MESH_CREATORS[type];
    if (!creator) throw new Error(`Unknown vehicle model: ${type}`);
    return attachVehicleSelectionDisc(creator());
  }

  static createBunkerMesh() {
    const group = new THREE.Group();
    group.name = 'ger_Bunker';
    const concMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: '#1e293b' });
    const intact = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.6, 5.5), concMat);
    base.position.y = 1.3;
    base.castShadow = true;
    intact.add(base);
    const embrasure = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.52, 0.12), woodMat);
    embrasure.position.set(0, 1.5, 2.77);
    intact.add(embrasure);
    group.add(intact);

    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4), woodMat);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0, 1.5, 2.7);
    group.add(gun);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 1.5, 3.4);
    group.add(muzzle);
    group.userData.muzzle = muzzle;

    const ruin = new THREE.Group();
    const rubbleMat = new THREE.MeshStandardMaterial({ color: '#302c27', roughness: 1 });
    for (const [x, z, y, sx, sy, sz] of [
      [-1.8, 0.8, 0.34, 2.7, 0.65, 1.1], [1.35, -0.6, 0.27, 2.1, 0.54, 1.7],
      [0.2, 1.9, 0.2, 1.9, 0.4, 0.9], [-0.6, -1.7, 0.18, 1.4, 0.36, 1.2]
    ]) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), rubbleMat);
      block.position.set(x, y, z);
      block.rotation.set(0.17 * x, 0.28 * z, 0.13 * z);
      block.castShadow = true;
      ruin.add(block);
    }
    ruin.visible = false;
    group.add(ruin);
    group.userData.structureDamageParts = {
      intact,
      ruin,
      gun,
      materials: [concMat, woodMat]
    };

    return group;
  }
}
