import * as THREE from 'three';
import {
  createAMC35Mesh,
  createCharB1BisMesh,
  createHotchkissH39Mesh,
  createLafflyV15TMesh,
  createOpelBlitzMesh,
  createPanhard178Mesh,
  createPanzer35tMesh,
  createPanzer38tMesh,
  createPanzerIIMesh,
  createPanzerIVMesh,
  createRenaultR35Mesh,
  createSdKfz231Mesh
} from './vehicles/index.js';
import { lateralX } from './LocalFrame.js';
import {
  applyVehicleMaterialPack,
  setVehicleMaterialSlot
} from './vehicles/VehicleMaterialLibrary.js';
import {
  createTrackedRunningGear,
  createTrackedRunningGearProxy
} from './vehicles/TrackedRunningGear.js';
import { createInfantryWeaponRig } from './infantry/index.js';
import { normalizeInfantryStandingHeight } from './WorldScale.js';

const VEHICLE_MESH_CREATORS = Object.freeze({
  fr_renault_r35: createRenaultR35Mesh,
  fr_hotchkiss_h39: createHotchkissH39Mesh,
  fr_amc35: createAMC35Mesh,
  fr_panhard178: createPanhard178Mesh,
  fr_laffly_v15t: createLafflyV15TMesh,
  fr_char_b1bis: createCharB1BisMesh,
  ger_panzer2: createPanzerIIMesh,
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
    if (creator) return attachVehicleSelectionDisc(creator());

    const tankGroup = new THREE.Group();
    tankGroup.name = type;

    const isFrench = type === 'fr_somua';
    const bodyMat = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
      color: isFrench ? '#15803d' : '#475569',
      roughness: 0.5,
      metalness: 0.3
    }), 'paint');
    const trackMat = setVehicleMaterialSlot(
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.9 }),
      'track'
    );
    const metalDetailMat = setVehicleMaterialSlot(
      new THREE.MeshStandardMaterial({ color: '#020617', metalness: 0.9 }),
      'metal'
    );

    // Base disc indicator
    const discGeo = new THREE.RingGeometry(1.0, 3.2, 16);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color: isFrench ? 0x3b82f6 : 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35
    });
    const baseDisc = new THREE.Mesh(discGeo, discMat);
    baseDisc.position.y = 0.05;
    baseDisc.userData.lodBand = 'ui';
    tankGroup.add(baseDisc);
    tankGroup.userData.selectionDisc = baseDisc;

    if (isFrench) {
      const S35 = {
        length: 5.38,
        width: 2.12,
        height: 2.62,
        trackWidth: 0.32,
        roadWheelRadius: 0.255
      };
      const castGreen = setVehicleMaterialSlot(
        new THREE.MeshStandardMaterial({ color: '#4f5b32', roughness: 0.78, metalness: 0.08 }),
        'paint'
      );
      const castOchre = setVehicleMaterialSlot(
        new THREE.MeshStandardMaterial({ color: '#8b7446', roughness: 0.82, metalness: 0.06 }),
        'paint'
      );
      const darkGreen = setVehicleMaterialSlot(
        new THREE.MeshStandardMaterial({ color: '#303d29', roughness: 0.86, metalness: 0.08 }),
        'paint'
      );

      const addPart = (geometry, material, name, position, rotation = null) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.position.set(...position);
        if (rotation) mesh.rotation.set(...rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        tankGroup.add(mesh);
        return mesh;
      };

      const hullSections = [
        { z: -2.32, w: 0.83, shoulder: 1.28, topW: 0.66, top: 1.67, bottom: 0.48 },
        { z: -1.78, w: 0.98, shoulder: 1.42, topW: 0.76, top: 1.78, bottom: 0.42 },
        { z: 0.82, w: 0.98, shoulder: 1.42, topW: 0.72, top: 1.78, bottom: 0.42 },
        { z: 1.72, w: 0.92, shoulder: 1.24, topW: 0.48, top: 1.52, bottom: 0.46 },
        { z: 2.36, w: 0.54, shoulder: 0.94, topW: 0.22, top: 1.18, bottom: 0.52 }
      ];
      const ring = section => [
        [-section.w, section.bottom, section.z],
        [-section.w, section.shoulder, section.z],
        [-section.topW, section.top, section.z],
        [section.topW, section.top, section.z],
        [section.w, section.shoulder, section.z],
        [section.w, section.bottom, section.z]
      ];
      const hullVertices = hullSections.flatMap(section => ring(section).flat());
      const hullIndices = [];
      const ringSize = 6;
      for (let section = 0; section < hullSections.length - 1; section++) {
        for (let side = 0; side < ringSize; side++) {
          const next = (side + 1) % ringSize;
          const a = section * ringSize + side;
          const b = section * ringSize + next;
          const c = (section + 1) * ringSize + side;
          const d = (section + 1) * ringSize + next;
          hullIndices.push(a, c, b, b, c, d);
        }
      }
      hullIndices.push(0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5);
      const last = (hullSections.length - 1) * ringSize;
      hullIndices.push(
        last, last + 2, last + 1,
        last, last + 3, last + 2,
        last, last + 4, last + 3,
        last, last + 5, last + 4
      );
      const hullGeo = new THREE.BufferGeometry();
      hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(hullVertices, 3));
      hullGeo.setIndex(hullIndices);
      hullGeo.computeVertexNormals();
      const hull = addPart(hullGeo, castGreen, 'S35_CastHull', [0, 0, 0]);

      const runningGear = createTrackedRunningGear({
        id: 'S35RunningGear', trackMaterial: trackMat, wheelMaterial: castOchre,
        trackCenterX: 0.9, trackWidth: S35.trackWidth, beltLength: 4.48, beltHeight: 0.82,
        centerY: 0.76, roadWheelRadius: S35.roadWheelRadius, roadWheelCount: 9,
        roadWheelY: 0.50, roadWheelZStart: -1.58, roadWheelSpacing: 0.36, linkPitch: 0.16
      });
      tankGroup.add(runningGear);
      tankGroup.userData.runningGear = runningGear;
      runningGear.userData.trackParts.roadWheels.forEach((wheel, index) => {
        const side = index < 9 ? -1 : 1;
        wheel.name = `S35_RoadWheel_${side}_${index % 9}`;
      });
      for (const side of [-1, 1]) {
        addPart(
          new THREE.BoxGeometry(0.11, 0.62, 4.18),
          darkGreen,
          'S35_SuspensionSkirt',
          [side * 0.99, 0.88, -0.05]
        );

      }

      addPart(new THREE.BoxGeometry(1.46, 0.12, 1.26), castOchre, 'S35_EngineDeck', [0, 1.82, -1.28]);
      for (let z = -1.7; z <= -0.86; z += 0.21) {
        addPart(new THREE.BoxGeometry(1.08, 0.035, 0.06), metalDetailMat, 'S35_EngineLouvre', [0, 1.9, z]);
      }
      addPart(new THREE.BoxGeometry(1.94, 0.07, 4.15), darkGreen, 'S35_HullJoinSeam', [0, 1.05, -0.08]);

      const turretGroup = new THREE.Group();
      turretGroup.name = 'Turret';
      turretGroup.position.set(0, 1.62, 0.3);

      const turretGeo = new THREE.CylinderGeometry(0.53, 0.71, 0.64, 14);
      const turret = new THREE.Mesh(turretGeo, castOchre);
      turret.name = 'S35_APX1_TurretBody';
      turret.position.y = 0.32;
      turret.castShadow = true;
      turretGroup.add(turret);
      const turretDome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), castOchre);
      turretDome.name = 'S35_APX1_TurretDome';
      turretDome.scale.set(1, 0.35, 1.05);
      turretDome.position.y = 0.62;
      turretDome.castShadow = true;
      turretGroup.add(turretDome);

      const mantlet = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.18, 10), darkGreen);
      mantlet.name = 'S35_Mantlet';
      mantlet.rotation.x = Math.PI / 2;
      mantlet.position.set(0.03, 0.4, 0.7);
      turretGroup.add(mantlet);

      const barrelGeo = new THREE.CylinderGeometry(0.055, 0.075, 2.12, 10);
      barrelGeo.rotateX(Math.PI / 2);
      const barrel = new THREE.Mesh(barrelGeo, metalDetailMat);
      barrel.name = 'S35_SA35_Barrel';
      barrel.position.set(0.03, 0.42, 1.75);
      barrel.castShadow = true;
      turretGroup.add(barrel);
      barrel.userData.restZ = barrel.position.z;
      const muzzle = new THREE.Object3D();
      muzzle.name = 'S35_SA35_Muzzle';
      muzzle.position.set(0.03, 0.42, 2.82);
      turretGroup.add(muzzle);

      const coax = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.72, 7), metalDetailMat);
      coax.name = 'S35_MAC31_Coax';
      coax.geometry.rotateX(Math.PI / 2);
      coax.position.set(-0.19, 0.38, 1.0);
      coax.userData.weaponMountId = 'coax';
      coax.userData.mountSide = 'right';
      coax.userData.placementQuality = 'blueprint-confirmed front arrangement';
      coax.userData.referenceUrl =
        'https://www.the-blueprints.com/blueprints/tanks/tanks-s/50770/view/somua_s35/';
      turretGroup.add(coax);
      const coaxMuzzle = new THREE.Object3D();
      coaxMuzzle.name = 'coax_muzzle';
      coaxMuzzle.position.set(-0.19, 0.38, 1.36);
      coaxMuzzle.userData = {
        weaponMountId: 'coax',
        forwardAxis: '+Z',
        mountSide: 'right',
        placementQuality: 'blueprint-confirmed front arrangement',
        referenceUrl:
          'https://www.the-blueprints.com/blueprints/tanks/tanks-s/50770/view/somua_s35/'
      };
      turretGroup.add(coaxMuzzle);

      const cupolaGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.26, 10);
      const cupola = new THREE.Mesh(cupolaGeo, darkGreen);
      cupola.name = 'S35_Cupola';
      cupola.position.set(0, 0.78, -0.17);
      turretGroup.add(cupola);
      const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.055, 10), castOchre);
      hatch.name = 'S35_CupolaHatch';
      hatch.position.set(0, 0.95, -0.17);
      turretGroup.add(hatch);

      tankGroup.add(turretGroup);
      tankGroup.userData.turret = turretGroup;
      tankGroup.userData.muzzle = muzzle;
      tankGroup.userData.barrel = barrel;
      tankGroup.userData.weaponMuzzles = { coax: coaxMuzzle };
      addPart(
        new THREE.BoxGeometry(0.34, 0.28, 0.14),
        darkGreen,
        'S35_DriverVisor',
        [lateralX('left', 0.35), 1.35, 2.02],
        [-0.15, 0, 0]
      );
      for (const side of [-1, 1]) {
        addPart(new THREE.CylinderGeometry(0.11, 0.11, 0.13, 10), setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
          color: '#d8c78b',
          emissive: '#6a5b28',
          emissiveIntensity: 0.15,
          roughness: 0.5
        }), 'metal'), 'S35_Headlamp', [side * 0.52, 1.12, 2.22], [Math.PI / 2, 0, 0]);
      }
      addPart(new THREE.CylinderGeometry(0.1, 0.13, 1.05, 8), metalDetailMat, 'S35_Exhaust', [0.7, 1.2, -2.22], [Math.PI / 2, 0, 0]);
      tankGroup.userData.modelMetadata = {
        designation: 'SOMUA S35',
        dimensionsMeters: S35,
        features: ['cast sectional hull', 'APX 1 CE one-man turret', '47mm SA 35', 'nine road wheels per side']
      };
    } else {
      const addPart = (geometry, material, name, position, rotation = null, parent = tankGroup) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.position.set(...position);
        if (rotation) mesh.rotation.set(...rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
      };
      const rubberMat = setVehicleMaterialSlot(
        new THREE.MeshStandardMaterial({ color: '#20231f', roughness: 0.96 }),
        'rubber'
      );
      const dunkelgrau = setVehicleMaterialSlot(
        new THREE.MeshStandardMaterial({ color: '#3f4547', roughness: 0.76, metalness: 0.12 }),
        'paint'
      );
      const edgeMat = setVehicleMaterialSlot(
        new THREE.MeshStandardMaterial({ color: '#2e3335', roughness: 0.82, metalness: 0.16 }),
        'metal'
      );

      const runningGear = createTrackedRunningGear({
        id: 'PzIIIRunningGear', trackMaterial: trackMat, wheelMaterial: rubberMat,
        trackCenterX: 1.25, trackWidth: 0.38, beltLength: 4.92, beltHeight: 0.72,
        centerY: 0.76, roadWheelRadius: 0.34, roadWheelCount: 6,
        roadWheelY: 0.48, roadWheelZStart: -1.62, roadWheelSpacing: 0.65, linkPitch: 0.18
      });
      tankGroup.add(runningGear);
      tankGroup.userData.runningGear = runningGear;
      for (const side of [-1, 1]) {
        addPart(
          new THREE.BoxGeometry(0.18, 0.08, 5.02),
          dunkelgrau,
          'PzIII_Fender',
          [side * 1.2, 1.03, -0.02]
        );
      }

      addPart(new THREE.BoxGeometry(2.42, 0.72, 4.38), dunkelgrau, 'PzIII_LowerHull', [0, 0.98, -0.02]);
      addPart(new THREE.BoxGeometry(2.22, 0.62, 2.95), bodyMat, 'PzIII_UpperHull', [0, 1.6, 0.12]);
      addPart(
        new THREE.BoxGeometry(2.28, 0.42, 1.0),
        bodyMat,
        'PzIII_FrontGlacis',
        [0, 1.48, 1.82],
        [-0.25, 0, 0]
      );
      const engineDeck = addPart(
        new THREE.BoxGeometry(2.3, 0.12, 1.42),
        dunkelgrau,
        'PzIII_EngineDeck',
        [0, 1.95, -1.42]
      );
      engineDeck.userData.lodBand = 'core';
      engineDeck.userData.surfaceRole = 'rear-hull-deck';
      for (let z = -1.75; z <= -1.05; z += 0.22) {
        addPart(new THREE.BoxGeometry(1.42, 0.035, 0.07), edgeMat, 'PzIII_EngineLouvre', [0, 2.03, z]);
      }

      const turretGroup = new THREE.Group();
      turretGroup.name = 'Turret';
      turretGroup.position.set(0, 1.86, 0.34);
      const turret = addPart(
        new THREE.CylinderGeometry(0.76, 0.92, 0.78, 8),
        bodyMat,
        'PzIII_TurretBody',
        [0, 0.4, 0],
        null,
        turretGroup
      );
      turret.scale.z = 1.08;
      addPart(
        new THREE.BoxGeometry(1.18, 0.5, 0.18),
        edgeMat,
        'PzIII_GunMantlet',
        [0, 0.38, 0.91],
        null,
        turretGroup
      );
      const barrelGeo = new THREE.CylinderGeometry(0.045, 0.065, 2.18, 10);
      barrelGeo.rotateX(Math.PI / 2);
      const barrel = addPart(
        barrelGeo,
        metalDetailMat,
        'PzIII_KwK36_Barrel',
        [0.08, 0.4, 1.96],
        null,
        turretGroup
      );
      barrel.userData.restZ = barrel.position.z;
      const coaxGeo = new THREE.CylinderGeometry(0.016, 0.02, 0.62, 7);
      coaxGeo.rotateX(Math.PI / 2);
      const coax = addPart(
        coaxGeo,
        metalDetailMat,
        'PzIII_MG34_Coax',
        [lateralX('right', 0.27), 0.36, 1.18],
        null,
        turretGroup
      );
      coax.userData.weaponMountId = 'coax';
      coax.userData.mountSide = 'right';
      coax.userData.placementQuality = 'historical visual reference';
      const coaxMuzzle = new THREE.Object3D();
      coaxMuzzle.name = 'coax_muzzle';
      coaxMuzzle.position.set(lateralX('right', 0.27), 0.36, 1.49);
      coaxMuzzle.userData = {
        weaponMountId: 'coax',
        forwardAxis: '+Z',
        mountSide: 'right',
        placementQuality: 'historical visual reference'
      };
      turretGroup.add(coaxMuzzle);
      addPart(
        new THREE.CylinderGeometry(0.3, 0.36, 0.28, 10),
        edgeMat,
        'PzIII_CommanderCupola',
        [0, 0.9, -0.22],
        null,
        turretGroup
      );
      const muzzle = new THREE.Object3D();
      muzzle.name = 'PzIII_KwK36_Muzzle';
      muzzle.position.set(0.08, 0.4, 3.05);
      turretGroup.add(muzzle);
      tankGroup.add(turretGroup);
      tankGroup.userData.turret = turretGroup;
      tankGroup.userData.muzzle = muzzle;
      tankGroup.userData.barrel = barrel;

      addPart(
        new THREE.BoxGeometry(0.36, 0.19, 0.1),
        edgeMat,
        'PzIII_DriverVisor',
        [lateralX('left', 0.47), 1.67, 2.03]
      );
      addPart(
        new THREE.SphereGeometry(0.13, 8, 6),
        edgeMat,
        'PzIII_HullMG_Ball',
        [lateralX('right', 0.5), 1.62, 2.08]
      );
      const hullMgGeo = new THREE.CylinderGeometry(0.018, 0.024, 0.42, 7);
      hullMgGeo.rotateX(Math.PI / 2);
      addPart(
        hullMgGeo,
        metalDetailMat,
        'PzIII_MG34_Hull',
        [lateralX('right', 0.5), 1.62, 2.28]
      );
      const hullMgMuzzle = new THREE.Object3D();
      hullMgMuzzle.name = 'hull_mg_muzzle';
      hullMgMuzzle.position.set(lateralX('right', 0.5), 1.62, 2.49);
      hullMgMuzzle.userData = { weaponMountId: 'hull_mg', forwardAxis: '+Z' };
      tankGroup.add(hullMgMuzzle);
      tankGroup.userData.weaponMuzzles = { coax: coaxMuzzle, hull_mg: hullMgMuzzle };
      tankGroup.userData.modelMetadata = {
        designation: 'Panzer III Ausf. D',
        dimensionsMeters: { length: 5.38, width: 2.91, height: 2.5 },
        features: ['six road wheels per side', 'three return rollers', '3.7cm KwK 36', 'five-man crew']
      };
    }

    tankGroup.traverse(object => {
      if (!object.isMesh || object.userData.lodBand) return;
      if (/Louvre|Headlamp|Exhaust|Visor|Cupola|Hatch|Coax|HullMG|JoinSeam/.test(object.name)) {
        object.userData.lodBand = 'high';
      } else if (/Wheel|Roller|Fender|Skirt|Drive|Idler|EngineDeck/.test(object.name)) {
        object.userData.lodBand = 'medium';
      } else {
        object.userData.lodBand = 'core';
      }
    });

    // Authored Far Proxy for Tanks with hull, turret, and main gun barrel silhouette
    const proxyGroup = new THREE.Group();
    proxyGroup.name = 'TankLowDetailProxy';

    const proxyHull = new THREE.Mesh(new THREE.BoxGeometry(isFrench ? 2.12 : 2.45, 1.25, isFrench ? 5.2 : 4.8), bodyMat);
    proxyHull.position.y = 1.05;
    proxyHull.userData.lodBand = 'proxy';

    const proxyTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 0.68, 8), bodyMat);
    proxyTurret.position.set(0, 1.95, 0.25);
    proxyTurret.userData.lodBand = 'proxy';

    const proxyBarrelGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.8, 6);
    proxyBarrelGeo.rotateX(Math.PI / 2);
    const proxyBarrel = new THREE.Mesh(proxyBarrelGeo, metalDetailMat);
    proxyBarrel.position.set(0, 1.95, 1.5);
    proxyBarrel.userData.lodBand = 'proxy';

    const proxyGearConfig = isFrench
      ? {
          trackCenterX: 1.15,
          trackWidth: 0.34,
          beltLength: 4.98,
          beltHeight: 0.82,
          centerY: 0.7,
          roadWheelRadius: 0.26,
          roadWheelCount: 9
        }
      : {
          trackCenterX: 1.25,
          trackWidth: 0.38,
          beltLength: 4.92,
          beltHeight: 0.72,
          centerY: 0.76,
          roadWheelRadius: 0.34,
          roadWheelCount: 6
        };
    const proxyRunningGear = createTrackedRunningGearProxy({
      id: isFrench ? 'S35RunningGearProxy' : 'PzIIIRunningGearProxy',
      trackMaterial: trackMat,
      wheelMaterial: trackMat,
      ...proxyGearConfig
    });
    const detailedTurret = tankGroup.userData.turret;
    const detailedBarrel = tankGroup.userData.barrel;
    proxyTurret.position.sub(detailedTurret.position);
    detailedTurret.add(proxyTurret);
    proxyBarrel.position.set(0, 0, 0);
    // Both legacy barrel geometries already point down local +Z.
    proxyBarrel.rotation.set(0, 0, 0);
    detailedBarrel.add(proxyBarrel);
    tankGroup.userData.proxyTurret = proxyTurret;
    tankGroup.userData.proxyBarrel = proxyBarrel;
    proxyGroup.add(proxyHull, proxyRunningGear);
    proxyHull.visible = false;
    proxyTurret.visible = false;
    proxyBarrel.visible = false;
    tankGroup.add(proxyGroup);

    const materialPack = applyVehicleMaterialPack(tankGroup);
    tankGroup.userData.modelMetadata = {
      ...tankGroup.userData.modelMetadata,
      materialPack,
      materialSlots: materialPack.slots,
      lodLevels: ['high', 'medium', 'core', 'proxy'],
      lodModelCount: 4
    };

    return tankGroup;
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
