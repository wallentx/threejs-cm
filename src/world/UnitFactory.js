import * as THREE from 'three';

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
      belt: new THREE.BoxGeometry(0.62, 0.1, 0.38),
      rifleStock: new THREE.BoxGeometry(0.085, 0.11, 0.78),
      barrel: new THREE.CylinderGeometry(0.026, 0.026, 0.72, 6),
      magazine: new THREE.BoxGeometry(0.16, 0.22, 0.08)
    };
    geometry.barrel.rotateX(Math.PI / 2);

    const createPivotedLimb = (material, length, radiusScale = 1) => {
      const pivot = new THREE.Group();
      const limb = new THREE.Mesh(geometry.limb, material);
      limb.scale.set(radiusScale, length / 0.62, radiusScale);
      limb.position.y = -length * 0.5;
      limb.castShadow = true;
      pivot.add(limb);
      return pivot;
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
      const isLMG = /FM 24\/29|MG34/.test(weaponName);
      const isSMG = /MAS-38|MP40/.test(weaponName);

      const pelvis = new THREE.Mesh(geometry.pelvis, uniformMat);
      pelvis.position.y = 0.89;
      pelvis.castShadow = true;
      soldierGroup.add(pelvis);

      const torso = new THREE.Mesh(geometry.torso, uniformMat);
      torso.position.y = 1.29;
      torso.castShadow = true;
      soldierGroup.add(torso);

      const belt = new THREE.Mesh(geometry.belt, leatherMat);
      belt.position.set(0, 1.0, 0);
      soldierGroup.add(belt);

      const head = new THREE.Mesh(geometry.head, skinMat);
      head.position.y = 1.82;
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
      helmet.scale.set(isFrench ? 1.0 : 1.08, 0.76, isFrench ? 1.12 : 1.18);
      helmet.position.y = 1.91;
      helmet.castShadow = true;
      soldierGroup.add(helmet);

      if (isFrench) {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.025, 12), helmetMat);
        brim.scale.z = 1.15;
        brim.position.y = 1.89;
        soldierGroup.add(brim);
        const crestGeo = new THREE.BoxGeometry(0.045, 0.075, 0.38);
        const crest = new THREE.Mesh(crestGeo, helmetMat);
        crest.position.set(0, 2.095, -0.015);
        soldierGroup.add(crest);
      } else {
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.31, 0.09, 10), helmetMat);
        skirt.scale.z = 1.12;
        skirt.position.y = 1.87;
        soldierGroup.add(skirt);
      }

      const leftHip = createPivotedLimb(trouserMat, 0.68, 1.08);
      leftHip.name = 'LeftLeg';
      leftHip.position.set(-0.14, 0.83, 0);
      soldierGroup.add(leftHip);
      const leftBoot = new THREE.Mesh(geometry.boot, leatherMat);
      leftBoot.position.set(0, -0.69, 0.08);
      leftHip.add(leftBoot);

      const rightHip = createPivotedLimb(trouserMat, 0.68, 1.08);
      rightHip.name = 'RightLeg';
      rightHip.position.set(0.14, 0.83, 0);
      soldierGroup.add(rightHip);
      const rightBoot = new THREE.Mesh(geometry.boot, leatherMat);
      rightBoot.position.set(0, -0.69, 0.08);
      rightHip.add(rightBoot);

      const leftArm = createPivotedLimb(uniformMat, 0.58);
      leftArm.name = 'LeftArm';
      leftArm.position.set(-0.3, 1.52, 0);
      leftArm.rotation.x = -0.82;
      leftArm.rotation.z = -0.18;
      soldierGroup.add(leftArm);

      const rightArm = createPivotedLimb(uniformMat, 0.58);
      rightArm.name = 'RightArm';
      rightArm.position.set(0.3, 1.52, 0);
      rightArm.rotation.x = -0.72;
      rightArm.rotation.z = 0.2;
      soldierGroup.add(rightArm);

      const leftHand = new THREE.Mesh(geometry.hand, skinMat);
      leftHand.position.y = -0.6;
      leftArm.add(leftHand);
      const rightHand = leftHand.clone();
      rightArm.add(rightHand);

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

      const weapon = new THREE.Group();
      weapon.name = weaponName;
      const stock = new THREE.Mesh(geometry.rifleStock, isSMG ? weaponMat : woodMat);
      stock.scale.z = isLMG ? 1.12 : (isSMG ? 0.72 : 1);
      weapon.add(stock);
      const barrel = new THREE.Mesh(geometry.barrel, weaponMat);
      barrel.position.z = isLMG ? 0.73 : (isSMG ? 0.52 : 0.66);
      barrel.scale.y = isLMG ? 1.15 : (isSMG ? 0.58 : 1);
      weapon.add(barrel);
      const muzzle = new THREE.Object3D();
      muzzle.name = 'Muzzle';
      muzzle.position.set(0, 0, isLMG ? 1.13 : (isSMG ? 0.74 : 1.03));
      weapon.add(muzzle);
      if (isLMG || isSMG) {
        const magazine = new THREE.Mesh(geometry.magazine, weaponMat);
        magazine.position.set(
          isLMG && isFrench ? 0 : 0.08,
          isLMG && isFrench ? 0.16 : -0.12,
          isLMG ? 0.12 : 0.08
        );
        magazine.rotation.z = isLMG && isFrench ? Math.PI / 2 : -0.2;
        weapon.add(magazine);
      }
      if (isLMG) {
        const bipodGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5);
        for (const side of [-1, 1]) {
          const bipod = new THREE.Mesh(bipodGeo, weaponMat);
          bipod.position.set(side * 0.09, -0.15, 0.5);
          bipod.rotation.z = side * 0.42;
          weapon.add(bipod);
        }
      }
      weapon.position.set(0.15, 1.36, 0.35);
      weapon.userData.restPosition = weapon.position.toArray();
      weapon.rotation.x = -0.16;
      weapon.rotation.z = -0.08;
      weapon.traverse(object => {
        if (object.isMesh) {
          object.castShadow = true;
          object.userData.lodBand = 'medium';
        }
      });
      soldierGroup.add(weapon);

      const lowProxy = new THREE.Group();
      lowProxy.name = 'LowDetailProxy';
      const proxyBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.23, 0.3, 1.25, 5),
        proxyUniformMat
      );
      proxyBody.position.y = 0.82;
      proxyBody.userData.lodBand = 'proxy';
      const proxyHead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 5, 4), helmetMat);
      proxyHead.position.y = 1.55;
      proxyHead.userData.lodBand = 'proxy';
      lowProxy.add(proxyBody, proxyHead);
      proxyBody.visible = false;
      proxyHead.visible = false;
      soldierGroup.add(lowProxy);

      soldierGroup.traverse(object => {
        if (object.isMesh && !object.userData.lodBand) object.userData.lodBand = 'core';
      });
      for (const detail of [helmet, pack, leftPouch, rightPouch, leftHand, rightHand]) {
        detail.userData.lodBand = 'high';
      }

      const slotOffset = formationOffset(i);
      soldierGroup.position.copy(slotOffset);
      soldierGroup.userData.slotOffset = slotOffset.toArray();
      soldierGroup.userData.weaponName = weaponName;
      soldierGroup.userData.parts = {
        torso,
        head,
        helmet,
        leftArm,
        rightArm,
        leftLeg: leftHip,
        rightLeg: rightHip,
        weapon,
        muzzle,
        pack
      };

      squadGroup.add(soldierGroup);
      soldiers.push(soldierGroup);
    }

    squadGroup.userData.soldiers = soldiers;
    squadGroup.userData.selectionDisc = baseDisc;
    squadGroup.userData.materialPalette = isFrench ? 'French 1940 khaki and blue-grey' : 'German feldgrau';
    return squadGroup;
  }

  static createTankMesh(type = 'fr_somua') {
    const tankGroup = new THREE.Group();
    tankGroup.name = type;

    const isFrench = type === 'fr_somua';
    const bodyMat = new THREE.MeshStandardMaterial({
      color: isFrench ? '#15803d' : '#475569', // Bold French Army Green vs German Dunkelgrau
      roughness: 0.5,
      metalness: 0.3
    });
    const trackMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.9 });
    const metalDetailMat = new THREE.MeshStandardMaterial({ color: '#020617', metalness: 0.9 });

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
      const castGreen = new THREE.MeshStandardMaterial({ color: '#4f5b32', roughness: 0.78, metalness: 0.08 });
      const castOchre = new THREE.MeshStandardMaterial({ color: '#8b7446', roughness: 0.82, metalness: 0.06 });
      const darkGreen = new THREE.MeshStandardMaterial({ color: '#303d29', roughness: 0.86, metalness: 0.08 });
      const rubberMat = new THREE.MeshStandardMaterial({ color: '#20231f', roughness: 0.96 });

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
      hullIndices.push(0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4);
      const last = (hullSections.length - 1) * ringSize;
      hullIndices.push(last, last + 1, last + 2, last, last + 2, last + 3, last, last + 3, last + 4, last, last + 4, last + 5);
      const hullGeo = new THREE.BufferGeometry();
      hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(hullVertices, 3));
      hullGeo.setIndex(hullIndices);
      hullGeo.computeVertexNormals();
      const hull = addPart(hullGeo, castGreen, 'S35_CastHull', [0, 0, 0]);

      for (const side of [-1, 1]) {
        addPart(
          new THREE.BoxGeometry(S35.trackWidth, 0.82, 4.48),
          trackMat,
          side < 0 ? 'S35_LeftTrack' : 'S35_RightTrack',
          [side * 0.9, 0.58, -0.02]
        );
        addPart(
          new THREE.BoxGeometry(0.11, 0.62, 4.18),
          darkGreen,
          'S35_SuspensionSkirt',
          [side * 0.99, 0.88, -0.05]
        );

        const wheelZ = [-1.58, -1.22, -0.86, -0.5, -0.14, 0.22, 0.58, 0.94, 1.3];
        for (let index = 0; index < wheelZ.length; index++) {
          addPart(
            new THREE.CylinderGeometry(S35.roadWheelRadius, S35.roadWheelRadius, 0.12, 12),
            index % 2 ? castOchre : darkGreen,
            `S35_RoadWheel_${side}_${index}`,
            [side * 1.0, 0.5, wheelZ[index]],
            [0, 0, Math.PI / 2]
          );
        }
        for (const [z, radius] of [[-1.92, 0.36], [1.77, 0.38]]) {
          addPart(
            new THREE.CylinderGeometry(radius, radius, 0.13, 14),
            darkGreen,
            'S35_DriveWheel',
            [side * 1.0, 0.61, z],
            [0, 0, Math.PI / 2]
          );
        }
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
      turretGroup.add(coax);

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
      addPart(new THREE.BoxGeometry(0.34, 0.28, 0.14), darkGreen, 'S35_DriverVisor', [-0.35, 1.35, 2.02], [-0.15, 0, 0]);
      for (const side of [-1, 1]) {
        addPart(new THREE.CylinderGeometry(0.11, 0.11, 0.13, 10), new THREE.MeshStandardMaterial({
          color: '#d8c78b',
          emissive: '#6a5b28',
          emissiveIntensity: 0.15,
          roughness: 0.5
        }), 'S35_Headlamp', [side * 0.52, 1.12, 2.22], [Math.PI / 2, 0, 0]);
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
      const rubberMat = new THREE.MeshStandardMaterial({ color: '#20231f', roughness: 0.96 });
      const dunkelgrau = new THREE.MeshStandardMaterial({ color: '#3f4547', roughness: 0.76, metalness: 0.12 });
      const edgeMat = new THREE.MeshStandardMaterial({ color: '#2e3335', roughness: 0.82, metalness: 0.16 });

      for (const side of [-1, 1]) {
        addPart(
          new THREE.BoxGeometry(0.38, 0.72, 4.92),
          trackMat,
          side < 0 ? 'PzIII_LeftTrack' : 'PzIII_RightTrack',
          [side * 1.25, 0.57, -0.03]
        );
        addPart(
          new THREE.BoxGeometry(0.18, 0.08, 5.02),
          dunkelgrau,
          'PzIII_Fender',
          [side * 1.2, 1.03, -0.02]
        );
        const wheelZ = [-1.62, -0.97, -0.32, 0.33, 0.98, 1.63];
        for (let index = 0; index < wheelZ.length; index++) {
          addPart(
            new THREE.CylinderGeometry(0.34, 0.34, 0.14, 12),
            rubberMat,
            `PzIII_RoadWheel_${side}_${index}`,
            [side * 1.31, 0.48, wheelZ[index]],
            [0, 0, Math.PI / 2]
          );
        }
        for (const z of [-1.05, 0, 1.05]) {
          addPart(
            new THREE.CylinderGeometry(0.17, 0.17, 0.13, 10),
            edgeMat,
            `PzIII_ReturnRoller_${side}`,
            [side * 1.31, 0.92, z],
            [0, 0, Math.PI / 2]
          );
        }
        for (const [z, radius] of [[-2.05, 0.42], [2.05, 0.4]]) {
          addPart(
            new THREE.CylinderGeometry(radius, radius, 0.16, 14),
            edgeMat,
            'PzIII_DriveOrIdler',
            [side * 1.31, 0.58, z],
            [0, 0, Math.PI / 2]
          );
        }
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
      addPart(new THREE.BoxGeometry(2.3, 0.12, 1.42), dunkelgrau, 'PzIII_EngineDeck', [0, 1.95, -1.42]);
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
      addPart(coaxGeo, metalDetailMat, 'PzIII_MG34_Coax', [-0.27, 0.36, 1.18], null, turretGroup);
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

      addPart(new THREE.BoxGeometry(0.36, 0.19, 0.1), edgeMat, 'PzIII_DriverVisor', [-0.47, 1.67, 2.03]);
      addPart(new THREE.SphereGeometry(0.13, 8, 6), edgeMat, 'PzIII_HullMG_Ball', [0.5, 1.62, 2.08]);
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
    const proxyGroup = new THREE.Group();
    proxyGroup.name = 'TankLowDetailProxy';
    const proxyHull = new THREE.Mesh(new THREE.BoxGeometry(2.45, 1.25, 4.65), bodyMat);
    proxyHull.position.y = 1.05;
    proxyHull.userData.lodBand = 'proxy';
    const proxyTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.82, 0.72, 6), bodyMat);
    proxyTurret.position.set(0, 2.0, 0.25);
    proxyTurret.userData.lodBand = 'proxy';
    proxyGroup.add(proxyHull, proxyTurret);
    proxyHull.visible = false;
    proxyTurret.visible = false;
    tankGroup.add(proxyGroup);

    return tankGroup;
  }

  static createBunkerMesh() {
    const group = new THREE.Group();
    const concMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: '#1e293b' });

    const base = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.6, 5.5), concMat);
    base.position.y = 1.3;
    base.castShadow = true;
    group.add(base);

    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4), woodMat);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0, 1.5, 2.7);
    group.add(gun);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 1.5, 3.4);
    group.add(muzzle);
    group.userData.muzzle = muzzle;

    return group;
  }
}
