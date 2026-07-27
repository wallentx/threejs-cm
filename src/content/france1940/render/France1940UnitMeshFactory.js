import * as THREE from 'three';
import { lateralX } from '../../../world/LocalFrame.js';
import { normalizeInfantryStandingHeight } from '../../../world/WorldScale.js';
import {
  createFrance1940InfantryWeaponRig
} from './France1940InfantryWeaponFactory.js';

function createSculptedTorsoGeometry() {
  // Anatomical human torso loft: Flattened front chest & back (oval cross-section X:Z ratio ~ 2:1), broad shoulders, trapezius slope, & tapered waist
  const geo = new THREE.CylinderGeometry(0.36, 0.30, 0.72, 16, 8);
  // Flatten depth (Z) relative to width (X) for flat front chest & back
  geo.scale(1.22, 1.0, 0.58);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normalizedY = (y + 0.36) / 0.72; // 0 at waist belt, 1 at shoulder line

    // 1. Upper Chest (Pectoral expansion) & Lower Waist Taper
    if (normalizedY > 0.45) {
      const chestFactor = Math.sin((normalizedY - 0.45) / 0.55 * Math.PI);
      x *= (1.0 + chestFactor * 0.22);
    } else {
      const waistFactor = Math.cos(normalizedY / 0.45 * (Math.PI / 2));
      x *= (1.0 - waistFactor * 0.12);
      z *= (1.0 - waistFactor * 0.08);
    }

    // 2. Trapezius slope at neck/shoulder junction
    if (normalizedY > 0.82) {
      const trapFactor = (normalizedY - 0.82) / 0.18;
      x *= (1.0 - trapFactor * 0.16);
    }

    // 3. Flatten front (+Z) and back (-Z) surfaces
    if (Math.abs(z) > 0.05) {
      z *= 0.82;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

function createSculptedBootGeometry() {
  // Contoured 1940 military boot loft (low-profile instep slope, long sleek foot profile, tapered toe cap, arch & heel counter)
  const geo = new THREE.BoxGeometry(0.13, 0.09, 0.34, 4, 4, 8);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normZ = (z + 0.17) / 0.34; // 0 at heel, 1 at toe tip

    // 1. Sleek Low-Profile Instep & Shaft Slope
    if (normZ < 0.40) {
      // Ankle shaft to midfoot instep slope
      y += (0.40 - normZ) * 0.035;
    } else if (normZ > 0.70) {
      // Taper toe cap (bout rapporté) down and in
      const toeFactor = (normZ - 0.70) / 0.30;
      y -= toeFactor * 0.025;
      x *= (1.0 - toeFactor * 0.28);
    }

    // 2. Instep Arch Undercut at bottom sole (y < 0)
    if (y < 0 && normZ > 0.30 && normZ < 0.65) {
      const archFactor = Math.sin((normZ - 0.30) / 0.35 * Math.PI);
      y += archFactor * 0.018;
      x *= (1.0 - archFactor * 0.12);
    }

    // 3. Curved Heel Counter (contrefort)
    if (normZ < 0.20) {
      const heelFactor = (0.20 - normZ) / 0.20;
      x *= (1.0 - heelFactor * 0.18);
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

function createSculptedLimbGeometry(radiusTop, radiusMiddle, radiusBottom, length = 0.62) {
  // Multi-section anatomical limb geometry (bicep/tricep or quadricep/calf bulge)
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 12, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const normalizedY = (y + length * 0.5) / length; // 0 at bottom, 1 at top
    let bulge = 1.0;
    if (normalizedY > 0.3 && normalizedY < 0.8) {
      // Anatomical muscle bulge in middle section
      bulge = 1.0 + Math.sin((normalizedY - 0.3) / 0.5 * Math.PI) * (radiusMiddle / radiusTop - 1.0);
    }
    pos.setX(i, pos.getX(i) * bulge);
    pos.setZ(i, pos.getZ(i) * bulge);
  }
  geo.computeVertexNormals();
  return geo;
}

function createCuppedHandGeometry() {
  // Single organic cupped character hand (curved palm, thumb ridge, and gentle cupped fingers curvature)
  const geo = new THREE.SphereGeometry(0.068, 12, 10);
  geo.scale(0.85, 1.25, 0.65);
  geo.translate(0, -0.04, 0.01);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normY = (y + 0.10) / 0.14; // 0 at finger tips, 1 at wrist

    // Gentle inward cupping curve along Z towards finger tips
    if (normY < 0.6) {
      z += Math.sin((0.6 - normY) / 0.6 * Math.PI) * 0.022;
    }

    // Opposable thumb ridge on inner side
    if (x < 0 && normY > 0.35 && normY < 0.75) {
      x -= 0.014;
      z += 0.010;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

function createFrenchAdrianHelmetGeometry() {
  // French M1926 Adrian Helmet Dome: Smooth continuous dome & rear neck guard (couvre-nuque) with zero slope kink
  const geo = new THREE.SphereGeometry(0.21, 18, 16, 0, Math.PI * 2, 0, Math.PI / 1.92);
  geo.scale(0.88, 0.90, 1.12);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Smooth continuous C1 transition for rear neck guard slope (no sharp step at z = 0)
    const normZ = z / 0.23; // -1 at rear, +1 at front
    if (normZ < 0) {
      const rearFactor = Math.abs(normZ);
      const smoothRear = rearFactor * rearFactor * (3 - 2 * rearFactor); // Smoothstep
      y -= smoothRear * 0.052;
      z -= smoothRear * 0.028;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

function createFrenchAdrianBrimGeometry() {
  // 360° Adrian Helmet Brim: Smooth continuous flange ring matching exact dome slope transition
  const geo = new THREE.CylinderGeometry(0.188, 0.245, 0.038, 18);
  geo.scale(0.90, 1.0, 1.15);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normZ = z / 0.23;
    if (normZ < 0) {
      const rearFactor = Math.abs(normZ);
      const smoothRear = rearFactor * rearFactor * (3 - 2 * rearFactor);
      y -= smoothRear * 0.052;
      z -= smoothRear * 0.028;
    } else {
      const frontFactor = Math.min(1.0, normZ);
      const smoothFront = frontFactor * frontFactor * (3 - 2 * frontFactor);
      y -= smoothFront * 0.018;
      z += smoothFront * 0.022;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

function createAdrianCrestGeometry() {
  // Curved M1926 Adrian comb/crest (cimier) that contours smoothly over top dome from front to back
  const shape = new THREE.Shape();
  const segments = 16;
  shape.moveTo(-0.15, 0.005);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const z = -0.15 + t * 0.30;
    const y = 0.005 + Math.sin(t * Math.PI) * 0.058;
    shape.lineTo(z, y);
  }
  shape.lineTo(0.15, 0.0);
  shape.lineTo(-0.15, 0.0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: 0.038,
    bevelEnabled: false
  });
  geo.rotateY(Math.PI / 2);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function createGermanStahlhelmGeometry() {
  // German M35/M40 Stahlhelm: Deep protective dome with flared side/rear Nackenschutz skirt & front visor (ZERO GAP)
  const geo = new THREE.SphereGeometry(0.165, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.70);
  geo.scale(1.05, 1.0, 1.18);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normY = (y + 0.08) / 0.24;

    if (normY < 0.4) {
      const skirtFactor = (0.4 - normY) / 0.4;
      x *= (1.0 + skirtFactor * 0.18);
      if (z < 0) {
        z -= skirtFactor * 0.055;
        y -= skirtFactor * 0.035;
      } else {
        z += skirtFactor * 0.025;
        y -= skirtFactor * 0.015;
      }
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

function createCharacterHeadGeometry() {
  // Clean, smooth 3D human head geometry (skull, brow, nose bridge, jawline, ears) - NO beard shelf/block
  const geo = new THREE.SphereGeometry(0.165, 16, 14);
  geo.scale(0.94, 1.12, 1.05);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normY = (y + 0.18) / 0.36; // 0 at neck base, 1 at crown

    // 1. Clean Jawline Tapering (NO forward beard protrusion)
    if (normY < 0.45) {
      const chinTaper = 0.82 + normY * 0.40;
      x *= chinTaper;
      z *= (0.88 + normY * 0.27);
    }

    // 2. Nose Bridge Contour
    if (z > 0.08 && normY > 0.42 && normY < 0.62 && Math.abs(x) < 0.04) {
      z += 0.038 * Math.cos((normY - 0.52) / 0.10 * (Math.PI / 2)) * (1.0 - Math.abs(x) / 0.04);
    }

    // 3. Brow Ridge
    if (z > 0.07 && normY > 0.58 && normY < 0.68 && Math.abs(x) < 0.09) {
      z += 0.016 * Math.cos((normY - 0.63) / 0.05 * (Math.PI / 2));
    }

    // 4. Ear Contours on Sides
    if (Math.abs(x) > 0.12 && normY > 0.45 && normY < 0.65 && z > -0.05 && z < 0.05) {
      x += (x > 0 ? 0.014 : -0.014);
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

class France1940UnitMeshFactory {
  static createInfantrySquadMesh(
    faction = 'french',
    rosterOrCount = 6,
    selectionColor = 0x3b82f6
  ) {
    const roster = Array.isArray(rosterOrCount) ? rosterOrCount : [];
    const squadCount = Array.isArray(rosterOrCount) ? rosterOrCount.length : rosterOrCount;
    const squadGroup = new THREE.Group();
    const isFrench = faction === 'french' || faction === 'fr' || faction === 'French';
    squadGroup.userData.visualStyle = isFrench ? 'French 1940 khaki and blue-grey' : 'German 1940 feldgrau';
    squadGroup.userData.materialPalette = isFrench ? 'French 1940 khaki and blue-grey' : 'German 1940 feldgrau';
    const uniformMat = new THREE.MeshStandardMaterial({
      color: isFrench ? '#726c50' : '#4d5849',
      roughness: 0.88,
      metalness: 0
    });
    const germanCollarMat = new THREE.MeshStandardMaterial({
      color: '#273428',
      roughness: 0.85
    });
    const trouserMat = new THREE.MeshStandardMaterial({
      color: isFrench ? '#68634d' : '#44423c',
      roughness: 0.92
    });
    const putteeMat = new THREE.MeshStandardMaterial({
      color: '#585444',
      roughness: 0.95
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: '#c58d69',
      roughness: 0.78
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: '#38281d',
      roughness: 0.92
    });
    const helmetMat = new THREE.MeshStandardMaterial({
      color: isFrench ? '#465560' : '#333a32',
      roughness: 0.65,
      metalness: 0.22
    });
    const leatherMat = new THREE.MeshStandardMaterial({ color: '#2d241e', roughness: 0.82 });
    const blackLeatherMat = new THREE.MeshStandardMaterial({ color: '#1a1816', roughness: 0.75 });
    const webbingMat = new THREE.MeshStandardMaterial({
      color: isFrench ? '#857b5c' : '#5c5443',
      roughness: 0.92
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#b89645',
      metalness: 0.82,
      roughness: 0.35
    });
    const metalGearMat = new THREE.MeshStandardMaterial({
      color: '#3b433d',
      metalness: 0.72,
      roughness: 0.45
    });
    const canteenCoverMat = new THREE.MeshStandardMaterial({
      color: '#524b3a',
      roughness: 0.95
    });
    const blanketRollMat = new THREE.MeshStandardMaterial({
      color: '#5e5a48',
      roughness: 0.95
    });
    const buckleMat = new THREE.MeshStandardMaterial({
      color: '#70756e',
      metalness: 0.85,
      roughness: 0.30
    });

    const woodMat = new THREE.MeshStandardMaterial({ color: '#4a2f1b', roughness: 0.72 });
    const weaponMat = new THREE.MeshStandardMaterial({
      color: '#212421',
      roughness: 0.48,
      metalness: 0.65
    });
    const proxyUniformMat = new THREE.MeshStandardMaterial({
      color: isFrench ? '#6a6b57' : '#525a4d',
      roughness: 1
    });

    const discGeo = new THREE.RingGeometry(0.5, 2.2, 16);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color: selectionColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.32,
      depthWrite: false
    });
    const baseDisc = new THREE.Mesh(discGeo, discMat);
    baseDisc.position.y = 0.05;
    baseDisc.userData.lodBand = 'ui';
    squadGroup.add(baseDisc);
    squadGroup.userData.selectionDisc = baseDisc;

    const geometry = {
      torso: createSculptedTorsoGeometry(),
      pelvis: new THREE.BoxGeometry(0.44, 0.20, 0.28),
      head: createCharacterHeadGeometry(),
      frenchHelmet: createFrenchAdrianHelmetGeometry(),
      frenchBrim: createFrenchAdrianBrimGeometry(),
      adrianCrest: createAdrianCrestGeometry(),
      germanHelmet: createGermanStahlhelmGeometry(),
      collar: new THREE.CylinderGeometry(0.115, 0.135, 0.16, 10),
      button: new THREE.SphereGeometry(0.022, 6, 6),
      limb: createSculptedLimbGeometry(0.075, 0.098, 0.072, 0.62),
      armUpper: createSculptedLimbGeometry(0.088, 0.096, 0.076, 0.62),
      armLower: createSculptedLimbGeometry(0.076, 0.084, 0.062, 0.62),
      gaiter: createSculptedLimbGeometry(0.095, 0.108, 0.078, 0.32),
      boot: createSculptedBootGeometry(),
      cuppedHand: createCuppedHandGeometry(),
      pouch: new THREE.BoxGeometry(0.17, 0.18, 0.11),
      germanPouch: new THREE.BoxGeometry(0.24, 0.18, 0.10),
      pack: new THREE.BoxGeometry(0.44, 0.44, 0.18),
      belt: new THREE.BoxGeometry(0.56, 0.1, 0.34)
    };

    const createPivotedLimb = (material, length, radiusScale = 1) => {
      const pivot = new THREE.Group();
      const limb = new THREE.Mesh(geometry.limb, material);
      limb.scale.set(radiusScale, length / 0.62, radiusScale);
      limb.position.y = -length * 0.5;
      limb.castShadow = true;
      pivot.add(limb);

      // Smooth spherical knee joint
      const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.102, 10, 8), material);
      kneeJoint.name = 'KneeJoint';
      kneeJoint.position.set(0, -length * 0.5, 0);
      kneeJoint.castShadow = true;
      pivot.add(kneeJoint);
      return pivot;
    };

    const createTwoBoneArm = (material, skinMaterial) => {
      const upperLength = 0.42;
      const lowerLength = 0.42;
      const shoulder = new THREE.Group();

      // Smooth Deltoid Shoulder Cap (Blends upper torso into upper arm seamlessly)
      const deltoidGeo = new THREE.SphereGeometry(0.118, 12, 10);
      deltoidGeo.scale(1.15, 1.10, 1.0);
      const shoulderCap = new THREE.Mesh(deltoidGeo, material);
      shoulderCap.name = 'ShoulderCap';
      shoulderCap.position.set(0, -0.02, 0);
      shoulderCap.castShadow = true;
      shoulder.add(shoulderCap);

      const upperArm = new THREE.Mesh(geometry.armUpper, material);
      upperArm.name = 'UpperArm';
      upperArm.scale.set(1, upperLength / 0.62, 1);
      upperArm.position.y = -upperLength * 0.5;
      upperArm.castShadow = true;
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.name = 'Elbow';
      elbow.position.y = -upperLength;
      shoulder.add(elbow);

      // Smooth spherical elbow joint connecting upper arm and forearm seamlessly
      const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 8), material);
      elbowJoint.name = 'ElbowJoint';
      elbowJoint.position.set(0, 0, 0);
      elbowJoint.castShadow = true;
      elbow.add(elbowJoint);

      const forearm = new THREE.Mesh(geometry.armLower, material);
      forearm.name = 'Forearm';
      forearm.scale.set(0.86, lowerLength / 0.62, 0.86);
      forearm.position.y = -lowerLength * 0.5;
      forearm.castShadow = true;
      elbow.add(forearm);

      // Sleeve Cuff
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.088, 0.08, 8), material);
      cuff.position.y = -lowerLength + 0.04;
      elbow.add(cuff);

      // Single Organic Cupped Character Hand
      const hand = new THREE.Mesh(geometry.cuppedHand, skinMaterial);
      hand.name = 'Hand';
      hand.position.set(0, -lowerLength, 0);
      hand.castShadow = true;
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

      const belt = new THREE.Mesh(geometry.belt, isFrench ? leatherMat : blackLeatherMat);
      belt.position.set(0, 1.0, 0);
      soldierGroup.add(belt);

      // Single Continuous Sculpted Human Head Geometry (Ready for Texturing)
      const headGroup = new THREE.Group();
      headGroup.name = 'Head';
      headGroup.position.y = 1.82;
      headGroup.userData.restY = headGroup.position.y;
      headGroup.castShadow = true;

      const headMesh = new THREE.Mesh(geometry.head, skinMat);
      headMesh.name = 'HeadMesh';
      headMesh.castShadow = true;
      headGroup.add(headMesh);

      // Hair Cap under Helmet
      const hairGeo = new THREE.CylinderGeometry(0.162, 0.165, 0.10, 10);
      const hair = new THREE.Mesh(hairGeo, hairMat);
      hair.position.set(0, 0.04, -0.02);
      hair.userData.lodBand = 'high';
      headGroup.add(hair);

      const neckCollar = new THREE.Mesh(geometry.collar, isFrench ? uniformMat : germanCollarMat);
      neckCollar.name = 'UniformCollar';
      neckCollar.position.set(0, -0.14, 0.01);
      headGroup.add(neckCollar);

      soldierGroup.add(headGroup);
      const head = headGroup;

      let headgear;
      let helmet;

      if (isFrench) {
        helmet = new THREE.Mesh(geometry.frenchHelmet, helmetMat);
        helmet.name = 'FrenchM1926_HelmetDome';
        helmet.position.set(0, 1.935, 0);
        helmet.userData.restY = helmet.position.y;
        helmet.userData.surfaceRole = 'helmet-shell';
        helmet.userData.lodBand = 'core';
        helmet.castShadow = true;
        soldierGroup.add(helmet);
        headgear = [helmet];

        // 360° Metal Brim (Custom-sculpted to follow dome & rear neck guard contour - ZERO GAP)
        const brim = new THREE.Mesh(geometry.frenchBrim, helmetMat);
        brim.name = 'FrenchM1926_HelmetBrim';
        brim.position.set(0, 1.935, 0);
        brim.userData.restY = brim.position.y;
        brim.userData.surfaceRole = 'helmet-brim';
        brim.userData.lodBand = 'core';
        brim.castShadow = true;
        soldierGroup.add(brim);
        headgear.push(brim);

        // Sleek Comb Crest Running Down the Middle (Flush against dome contour)
        const crest = new THREE.Mesh(geometry.adrianCrest, helmetMat);
        crest.name = 'FrenchM1926_HelmetCrest';
        crest.position.set(0, 2.052, -0.018);
        crest.rotation.x = -0.16;
        crest.userData.restY = crest.position.y;
        crest.userData.surfaceRole = 'helmet-crest';
        crest.userData.lodBand = 'core';
        crest.castShadow = true;
        soldierGroup.add(crest);
        headgear.push(crest);

        // Front Infantry Emblem Badge
        const emblemGeo = new THREE.BoxGeometry(0.045, 0.045, 0.025);
        const emblem = new THREE.Mesh(emblemGeo, helmetMat);
        emblem.name = 'FrenchM1926_HelmetEmblem';
        emblem.position.set(0, 1.96, 0.245);
        emblem.rotation.x = -0.25;
        emblem.userData.lodBand = 'high';
        soldierGroup.add(emblem);

        // French M1935 Capote (Greatcoat) folded coat tails (pans de capote)
        const tailGeo = new THREE.BoxGeometry(0.12, 0.32, 0.22);
        const leftTail = new THREE.Mesh(tailGeo, uniformMat);
        leftTail.position.set(-0.24, 0.85, 0.02);
        leftTail.rotation.z = -0.15;
        leftTail.castShadow = true;
        soldierGroup.add(leftTail);
        const rightTail = leftTail.clone();
        rightTail.position.x = 0.24;
        rightTail.rotation.z = 0.15;
        soldierGroup.add(rightTail);

        // Double-breasted coat buttons
        for (let b = 0; b < 3; b++) {
          const yPos = 1.15 + b * 0.11;
          const bLeft = new THREE.Mesh(geometry.button, brassMat);
          bLeft.position.set(-0.08, yPos, 0.18);
          bLeft.userData.lodBand = 'high';
          soldierGroup.add(bLeft);

          const bRight = new THREE.Mesh(geometry.button, brassMat);
          bRight.position.set(0.08, yPos, 0.18);
          bRight.userData.lodBand = 'high';
          soldierGroup.add(bRight);
        }
      } else {
        helmet = new THREE.Mesh(geometry.germanHelmet, helmetMat);
        helmet.name = 'GermanM35_HelmetDome';
        helmet.position.set(0, 1.93, 0);
        helmet.userData.restY = helmet.position.y;
        helmet.userData.surfaceRole = 'helmet-shell';
        helmet.userData.lodBand = 'core';
        helmet.castShadow = true;
        soldierGroup.add(helmet);
        headgear = [helmet];

        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.31, 0.09, 10), helmetMat);
        skirt.name = 'GermanM35_HelmetSkirt';
        skirt.scale.z = 1.12;
        skirt.position.set(0, 1.87, 0);
        skirt.userData.restY = skirt.position.y;
        skirt.userData.surfaceRole = 'helmet-skirt';
        skirt.userData.lodBand = 'core';
        skirt.castShadow = true;
        soldierGroup.add(skirt);
        headgear.push(skirt);

        // German Helmet Lugs / Vents
        const ventGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.04, 6);
        ventGeo.rotateZ(Math.PI / 2);
        const leftVent = new THREE.Mesh(ventGeo, helmetMat);
        leftVent.position.set(-0.25, 1.93, 0.04);
        leftVent.userData.lodBand = 'high';
        soldierGroup.add(leftVent);
        const rightVent = leftVent.clone();
        rightVent.position.x = 0.25;
        rightVent.userData.lodBand = 'high';
        soldierGroup.add(rightVent);

        // German Tunic Cargo Pockets
        const pocketGeo = new THREE.BoxGeometry(0.13, 0.14, 0.05);
        const pTopLeft = new THREE.Mesh(pocketGeo, uniformMat);
        pTopLeft.position.set(-0.14, 1.35, 0.16);
        pTopLeft.userData.lodBand = 'high';
        soldierGroup.add(pTopLeft);
        const pTopRight = pTopLeft.clone();
        pTopRight.position.x = 0.14;
        pTopRight.userData.lodBand = 'high';
        soldierGroup.add(pTopRight);

        const pBotLeft = new THREE.Mesh(pocketGeo, uniformMat);
        pBotLeft.position.set(-0.14, 1.08, 0.16);
        pBotLeft.userData.lodBand = 'high';
        soldierGroup.add(pBotLeft);
        const pBotRight = pBotLeft.clone();
        pBotRight.position.x = 0.14;
        pBotRight.userData.lodBand = 'high';
        soldierGroup.add(pBotRight);

        // Center button fly
        for (let b = 0; b < 4; b++) {
          const btn = new THREE.Mesh(geometry.button, metalGearMat);
          btn.position.set(0, 1.08 + b * 0.09, 0.19);
          btn.userData.lodBand = 'high';
          soldierGroup.add(btn);
        }
      }

      // Epaulettes / Shoulder Straps
      const epauletteGeo = new THREE.BoxGeometry(0.12, 0.03, 0.16);
      const leftEpaulette = new THREE.Mesh(epauletteGeo, isFrench ? uniformMat : germanCollarMat);
      leftEpaulette.position.set(-0.22, 1.55, 0);
      leftEpaulette.rotation.z = 0.1;
      soldierGroup.add(leftEpaulette);
      const rightEpaulette = leftEpaulette.clone();
      rightEpaulette.position.x = 0.22;
      rightEpaulette.rotation.z = -0.1;
      soldierGroup.add(rightEpaulette);

      // Leather Y-Straps / Harness
      const harnessGeo = new THREE.BoxGeometry(0.06, 0.54, 0.02);
      const leftHarness = new THREE.Mesh(harnessGeo, isFrench ? leatherMat : blackLeatherMat);
      leftHarness.position.set(-0.12, 1.25, 0.02);
      leftHarness.rotation.z = -0.12;
      soldierGroup.add(leftHarness);

      const rightHarness = leftHarness.clone();
      rightHarness.position.x = 0.12;
      rightHarness.rotation.z = 0.12;
      soldierGroup.add(rightHarness);

      // Y-Strap Metal D-Rings on Chest
      const dRingGeo = new THREE.TorusGeometry(0.022, 0.005, 5, 8);
      const leftDRing = new THREE.Mesh(dRingGeo, buckleMat);
      leftDRing.position.set(-0.12, 1.38, 0.14);
      leftDRing.userData.lodBand = 'high';
      soldierGroup.add(leftDRing);
      const rightDRing = leftDRing.clone();
      rightDRing.position.x = 0.12;
      rightDRing.userData.lodBand = 'high';
      soldierGroup.add(rightDRing);

      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), buckleMat);
      buckle.position.set(0, 1.0, 0.20);
      buckle.userData.lodBand = 'high';
      soldierGroup.add(buckle);

      // Faction Field Equipment
      if (!isFrench) {
        // German Gas Mask Canister (Gasmaskenbüchse M30/M38)
        const canGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.38, 12);
        const canister = new THREE.Mesh(canGeo, metalGearMat);
        canister.name = 'GermanGasMaskCanister';
        canister.position.set(-0.18, 1.08, -0.22);
        canister.rotation.set(0.3, 0, -0.45);
        canister.castShadow = true;
        canister.userData.lodBand = 'high';
        soldierGroup.add(canister);
      } else {
        // French ANP 31 Gas Mask Bag
        const gasBagGeo = new THREE.BoxGeometry(0.22, 0.24, 0.12);
        const gasBag = new THREE.Mesh(gasBagGeo, webbingMat);
        gasBag.name = 'FrenchANP31_GasMaskBag';
        gasBag.position.set(0.24, 0.96, 0.06);
        gasBag.rotation.z = -0.15;
        gasBag.castShadow = true;
        gasBag.userData.lodBand = 'high';
        soldierGroup.add(gasBag);
      }

      // Canteen (French Bidon / German Feldflasche)
      const canteenGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.20, 10);
      canteenGeo.scale(1.0, 1.0, 0.65);
      const canteen = new THREE.Mesh(canteenGeo, canteenCoverMat);
      canteen.name = isFrench ? 'FrenchBidon2L' : 'GermanFeldflasche';
      canteen.position.set(isFrench ? -0.25 : 0.22, 0.98, -0.12);
      canteen.castShadow = true;
      canteen.userData.lodBand = 'high';
      soldierGroup.add(canteen);

      // Mess Tin & Rolled Blanket on Pack
      const messTinGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.14, 10);
      messTinGeo.scale(1.2, 1.0, 0.7);
      const messTin = new THREE.Mesh(messTinGeo, metalGearMat);
      messTin.name = 'MessTin';
      messTin.position.set(0, 1.28, -0.37);
      messTin.userData.lodBand = 'high';
      soldierGroup.add(messTin);

      const rollGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.52, 10);
      rollGeo.rotateZ(Math.PI / 2);
      const blanketRoll = new THREE.Mesh(rollGeo, blanketRollMat);
      blanketRoll.name = 'BlanketRoll';
      blanketRoll.position.set(0, 1.54, -0.27);
      blanketRoll.castShadow = true;
      blanketRoll.userData.lodBand = 'high';
      soldierGroup.add(blanketRoll);

      // Bayonet Scabbard
      const sheathGeo = new THREE.CylinderGeometry(0.02, 0.015, 0.38, 6);
      const sheath = new THREE.Mesh(sheathGeo, metalGearMat);
      sheath.position.set(-0.27, 0.88, -0.04);
      sheath.rotation.z = 0.2;
      sheath.userData.lodBand = 'high';
      soldierGroup.add(sheath);

      // Blanket Roll Leather Securing Straps
      const rollStrapGeo = new THREE.TorusGeometry(0.074, 0.008, 5, 8);
      for (const strapX of [-0.16, 0.16]) {
        const rStrap = new THREE.Mesh(rollStrapGeo, leatherMat);
        rStrap.position.set(strapX, 0, 0);
        rStrap.rotation.y = Math.PI / 2;
        blanketRoll.add(rStrap);
      }

      const leftHip = createPivotedLimb(trouserMat, 0.68, 1.08);
      leftHip.name = 'LeftLeg';
      leftHip.position.set(lateralX('left', 0.14), 0.83, 0);
      soldierGroup.add(leftHip);

      if (isFrench) {
        const leftGaiter = new THREE.Mesh(geometry.gaiter, putteeMat);
        leftGaiter.position.set(0, -0.42, 0);
        leftHip.add(leftGaiter);

        const leftBoot = new THREE.Mesh(geometry.boot, leatherMat);
        leftBoot.position.set(0, -0.73, 0.06);
        leftHip.add(leftBoot);
      } else {
        const leftJackboot = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.088, 0.38, 8), blackLeatherMat);
        leftJackboot.position.set(0, -0.40, 0);
        leftHip.add(leftJackboot);

        const leftBoot = new THREE.Mesh(geometry.boot, blackLeatherMat);
        leftBoot.position.set(0, -0.73, 0.06);
        leftHip.add(leftBoot);
      }

      const rightHip = createPivotedLimb(trouserMat, 0.68, 1.08);
      rightHip.name = 'RightLeg';
      rightHip.position.set(lateralX('right', 0.14), 0.83, 0);
      soldierGroup.add(rightHip);

      if (isFrench) {
        const rightGaiter = new THREE.Mesh(geometry.gaiter, putteeMat);
        rightGaiter.position.set(0, -0.42, 0);
        rightHip.add(rightGaiter);

        const rightBoot = new THREE.Mesh(geometry.boot, leatherMat);
        rightBoot.position.set(0, -0.73, 0.06);
        rightHip.add(rightBoot);
      } else {
        const rightJackboot = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.088, 0.38, 8), blackLeatherMat);
        rightJackboot.position.set(0, -0.40, 0);
        rightHip.add(rightJackboot);

        const rightBoot = new THREE.Mesh(geometry.boot, blackLeatherMat);
        rightBoot.position.set(0, -0.73, 0.06);
        rightHip.add(rightBoot);
      }

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
      pack.name = 'Pack';
      pack.position.set(0, 1.28, -0.27);
      pack.castShadow = true;
      soldierGroup.add(pack);

      let leftPouch;
      let rightPouch;
      if (isFrench) {
        leftPouch = new THREE.Mesh(geometry.pouch, leatherMat);
        leftPouch.position.set(-0.22, 0.98, 0.19);
        soldierGroup.add(leftPouch);
        rightPouch = leftPouch.clone();
        rightPouch.position.x = 0.22;
        soldierGroup.add(rightPouch);
      } else {
        leftPouch = new THREE.Mesh(geometry.germanPouch, blackLeatherMat);
        leftPouch.position.set(-0.22, 0.98, 0.19);
        soldierGroup.add(leftPouch);
        rightPouch = leftPouch.clone();
        rightPouch.position.x = 0.22;
        soldierGroup.add(rightPouch);
      }

      const weapon = createFrance1940InfantryWeaponRig(weaponName, {
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
        if (object.isMesh) {
          object.material = object.material.clone();
          if (!object.userData.lodBand) {
            object.userData.lodBand = 'high';
          }
        }
      });

      soldierGroup.position.copy(formationOffset(i));
      soldierGroup.userData.slotOffset = formationOffset(i).toArray();
      soldierGroup.userData.physicalScale = { units: 'metres', appliedUniformScale: 1.0 };
      soldierGroup.userData.visualStyle = isFrench ? 'French 1940 khaki and blue-grey' : 'German 1940 feldgrau';
      soldierGroup.userData.weaponName = weaponName;
      soldierGroup.userData.standingHeight = normalizeInfantryStandingHeight(soldierGroup);
      soldierGroup.userData.parts = {
        torso,
        head,
        helmet,
        headgear,
        leftLeg: leftHip,
        rightLeg: rightHip,
        leftArm,
        rightArm,
        leftHand,
        rightHand,
        weapon,
        weaponRig: weapon,
        weaponModel,
        muzzle,
        supportGrip: weapon.userData.grips?.support || weapon.userData.supportGrip,
        triggerGrip: weapon.userData.grips?.trigger || weapon.userData.triggerGrip,
        reloadGrip: weapon.userData.grips?.reload || weapon.userData.reloadGrip,
        pack,
        leftPouch,
        rightPouch,
        lowProxy
      };
      soldierGroup.userData.bones = {
        leftShoulder: leftArm,
        rightShoulder: rightArm,
        leftHip,
        rightHip,
        head
      };

      squadGroup.add(soldierGroup);
    }

    squadGroup.userData.soldiers = squadGroup.children.filter(c => c.name.startsWith('Soldier_'));

    squadGroup.userData.updateLOD = (cameraPosition, targetLOD) => {
      const band = targetLOD;
      squadGroup.traverse(object => {
        if (!object.isMesh || !object.userData.lodBand) return;
        const role = object.userData.lodBand;
        if (band === 'proxy' || band === 'low') {
          object.visible = role === 'proxy';
        } else {
          object.visible = role !== 'proxy';
        }
      });
    };

    return squadGroup;
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

export function createFrance1940InfantrySquadMesh(
  factionId,
  roster,
  selectionColor
) {
  return France1940UnitMeshFactory.createInfantrySquadMesh(
    factionId,
    roster,
    selectionColor
  );
}

export function createFrance1940BunkerMesh() {
  return France1940UnitMeshFactory.createBunkerMesh();
}
