import * as THREE from 'three';
import { lateralX } from '../../../world/LocalFrame.js';
import { normalizeInfantryStandingHeight } from '../../../world/WorldScale.js';
import {
  createFrance1940InfantryWeaponRig
} from './France1940InfantryWeaponFactory.js';
import {
  createFrance1940InfantryLodGeometry,
  createInfantryLodMesh
} from './France1940InfantryLodGeometry.js';
import {
  createFrance1940InfantryProxyInstances
} from './France1940InfantryProxyInstances.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function createSculptedTorsoGeometry() {
  // Anatomical human torso loft: Lined up with arm attachment points (shoulder width ~ 0.56m, oval chest/back depth ~ 0.28m)
  const geo = new THREE.CylinderGeometry(0.24, 0.22, 0.72, 16, 8);
  geo.scale(1.08, 1.0, 0.60);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normalizedY = (y + 0.36) / 0.72; // 0 at waist belt, 1 at shoulder line

    // 1. Upper Chest (Pectoral expansion) & Upper Back Curve
    if (normalizedY > 0.45) {
      const chestFactor = Math.sin((normalizedY - 0.45) / 0.55 * Math.PI);
      x *= (1.0 + chestFactor * 0.12);
      // Bring front of chest (+Z) out forward slightly & upper back (-Z) out backward slightly
      if (z > 0) {
        z += chestFactor * 0.038;
      } else {
        z -= chestFactor * 0.026;
      }
    } else {
      const stomachFactor = Math.sin(normalizedY / 0.45 * Math.PI);
      x *= (1.0 - (1.0 - stomachFactor) * 0.08);
      if (z > 0) {
        // Bring front of stomach (+Z) out forward slightly
        z += stomachFactor * 0.028;
      } else {
        z *= (1.0 - (1.0 - stomachFactor) * 0.06);
      }
    }

    // 2. Trapezius slope at neck/shoulder junction
    if (normalizedY > 0.82) {
      const trapFactor = (normalizedY - 0.82) / 0.18;
      x *= (1.0 - trapFactor * 0.14);
    }

    // 3. Flatten front (+Z) and back (-Z) surfaces
    if (Math.abs(z) > 0.05) {
      z *= 0.84;
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

function createCuppedHandGeometry(handedness) {
  // Single organic cupped character hand (curved palm, thumb ridge, and gentle cupped fingers curvature)
  const geo = new THREE.SphereGeometry(0.068, 12, 10);
  geo.scale(0.85, 1.25, 0.65);
  geo.translate(0, -0.04, 0.01);
  const pos = geo.attributes.position;
  const thumbSide = handedness === 'left' ? 1 : -1;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normY = (y + 0.10) / 0.14; // 0 at finger tips, 1 at wrist

    // Gentle inward cupping curve along Z towards finger tips
    if (normY < 0.6) {
      z += Math.sin((0.6 - normY) / 0.6 * Math.PI) * 0.022;
    }

    // Author the thumb ridge on its anatomical side. Keeping separate
    // left/right geometry avoids a negative-scale runtime mirror.
    if (x * thumbSide > 0 && normY > 0.35 && normY < 0.75) {
      x += thumbSide * 0.014;
      z += 0.010;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  geo.name = `${handedness === 'left' ? 'Left' : 'Right'}CuppedHand`;
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

function cylinderBetween(start, end, radius, material, name, lodBand = 'core') {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 8),
    material
  );
  mesh.name = name;
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  mesh.castShadow = true;
  mesh.userData.lodBand = lodBand;
  return mesh;
}

function createBrandtMle1935MortarEquipment(metalMaterial, webbingMaterial) {
  const equipment = new THREE.Group();
  equipment.name = 'BrandtMle1935_60mm_Equipment';
  equipment.position.set(0, 0.03, 0.18);

  const baseplate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.32, 0.045, 12),
    metalMaterial
  );
  baseplate.name = 'MortarBaseplate';
  baseplate.position.y = 0.0225;
  baseplate.scale.z = 0.78;
  baseplate.castShadow = true;
  baseplate.userData.lodBand = 'core';
  equipment.add(baseplate);

  const bipod = new THREE.Group();
  bipod.name = 'MortarBipod';
  bipod.add(
    cylinderBetween(
      [0, 0.4, 0.08],
      [-0.31, 0.03, 0.36],
      0.018,
      metalMaterial,
      'MortarBipodLeft'
    ),
    cylinderBetween(
      [0, 0.4, 0.08],
      [0.31, 0.03, 0.36],
      0.018,
      metalMaterial,
      'MortarBipodRight'
    ),
    cylinderBetween(
      [-0.31, 0.03, 0.36],
      [0.31, 0.03, 0.36],
      0.014,
      metalMaterial,
      'MortarBipodBrace',
      'high'
    )
  );
  equipment.add(bipod);

  const tubePivot = new THREE.Group();
  tubePivot.name = 'MortarTubePivot';
  tubePivot.position.set(0, 0.07, 0);
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.043, 0.82, 12),
    metalMaterial
  );
  tube.name = 'MortarTube';
  tube.position.y = 0.41;
  tube.castShadow = true;
  tube.userData.lodBand = 'core';
  tubePivot.add(tube);

  const muzzleRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.041, 0.008, 6, 12),
    metalMaterial
  );
  muzzleRing.name = 'MortarMuzzleRing';
  muzzleRing.position.y = 0.82;
  muzzleRing.rotation.x = Math.PI / 2;
  muzzleRing.castShadow = true;
  muzzleRing.userData.lodBand = 'high';
  tubePivot.add(muzzleRing);

  const sight = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.075, 0.035),
    webbingMaterial
  );
  sight.name = 'MortarSight';
  sight.position.set(-0.065, 0.5, 0);
  sight.userData.lodBand = 'high';
  tubePivot.add(sight);

  const proxyTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.055, 0.82, 5),
    metalMaterial
  );
  proxyTube.name = 'MortarTubeProxy';
  proxyTube.position.y = 0.41;
  proxyTube.visible = false;
  proxyTube.userData.lodBand = 'proxy';
  tubePivot.add(proxyTube);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'BrandtMle1935_60mm_Muzzle';
  muzzle.position.y = 0.84;
  tubePivot.add(muzzle);
  equipment.add(tubePivot);

  const proxyBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.31, 0.05, 6),
    metalMaterial
  );
  proxyBase.name = 'MortarBaseplateProxy';
  proxyBase.position.y = 0.025;
  proxyBase.scale.z = 0.78;
  proxyBase.visible = false;
  proxyBase.userData.lodBand = 'proxy';
  equipment.add(proxyBase);

  equipment.userData = {
    tubePivot,
    bipod,
    baseplate,
    muzzle,
    coreSilhouette: [baseplate, tube],
    proxySilhouette: [proxyBase, proxyTube],
    selectionFootprint: {
      id: 'brandt-mle1935-60mm-mortar',
      shape: 'circle',
      radiusMeters: 0.48,
      dataQuality: 'renderer footprint approximation'
    },
    visualContract: {
      units: 'metres',
      identity: 'Brandt Mle 1935 60 mm mortar',
      dataQuality: 'renderer approximation; not blueprint calibrated'
    }
  };
  return equipment;
}

export class France1940UnitMeshFactory {
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
    const boltWeaponMat = new THREE.MeshStandardMaterial({
      color: '#8e9692',
      roughness: 0.62,
      metalness: 0.55
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
      leftCuppedHand: createCuppedHandGeometry('left'),
      rightCuppedHand: createCuppedHandGeometry('right'),
      pouch: new THREE.BoxGeometry(0.17, 0.18, 0.11),
      germanPouch: new THREE.BoxGeometry(0.24, 0.18, 0.10),
      pack: new THREE.BoxGeometry(0.44, 0.44, 0.18),
      belt: new THREE.BoxGeometry(0.56, 0.1, 0.34),
      kneeJoint: new THREE.SphereGeometry(0.102, 10, 8),
      shoulderCap: new THREE.SphereGeometry(0.098, 12, 10),
      elbowJoint: new THREE.SphereGeometry(0.088, 10, 8),
      cuff: new THREE.CylinderGeometry(0.082, 0.088, 0.08, 8),
      hair: new THREE.CylinderGeometry(0.162, 0.165, 0.10, 10),
      frenchHelmetEmblem: new THREE.BoxGeometry(0.045, 0.045, 0.025),
      frenchCoatTail: new THREE.BoxGeometry(0.12, 0.32, 0.22),
      germanHelmetSkirt: new THREE.CylinderGeometry(0.25, 0.31, 0.09, 10),
      germanHelmetVent: new THREE.CylinderGeometry(0.015, 0.015, 0.04, 6),
      germanTunicPocket: new THREE.BoxGeometry(0.13, 0.14, 0.05),
      epaulette: new THREE.BoxGeometry(0.12, 0.03, 0.16),
      harness: new THREE.BoxGeometry(0.06, 0.54, 0.02),
      harnessRing: new THREE.TorusGeometry(0.022, 0.005, 5, 8),
      buckle: new THREE.BoxGeometry(0.08, 0.08, 0.04),
      germanGasMaskCanister: new THREE.CylinderGeometry(0.08, 0.08, 0.38, 12),
      frenchGasMaskBag: new THREE.BoxGeometry(0.22, 0.24, 0.12),
      canteen: new THREE.CylinderGeometry(0.075, 0.075, 0.20, 10),
      messTin: new THREE.CylinderGeometry(0.10, 0.10, 0.14, 10),
      blanketRoll: new THREE.CylinderGeometry(0.07, 0.07, 0.52, 10),
      bayonetSheath: new THREE.CylinderGeometry(0.02, 0.015, 0.38, 6),
      blanketRollStrap: new THREE.TorusGeometry(0.074, 0.008, 5, 8),
      germanJackboot: new THREE.CylinderGeometry(0.10, 0.088, 0.38, 8),
      proxyBody: new THREE.CylinderGeometry(0.22, 0.28, 1.25, 5),
      proxyHead: new THREE.SphereGeometry(0.2, 6, 4),
      frenchProxyBrim: new THREE.CylinderGeometry(0.23, 0.23, 0.025, 8),
      frenchProxyCrest: new THREE.BoxGeometry(0.04, 0.07, 0.3),
      germanProxySkirt: new THREE.CylinderGeometry(0.23, 0.27, 0.08, 6),
      proxyWeapon: new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4),
      lod: createFrance1940InfantryLodGeometry(isFrench)
    };
    geometry.shoulderCap.scale(1.04, 1.04, 0.95);
    geometry.germanHelmetVent.rotateZ(Math.PI / 2);
    geometry.canteen.scale(1.0, 1.0, 0.65);
    geometry.messTin.scale(1.2, 1.0, 0.7);
    geometry.blanketRoll.rotateZ(Math.PI / 2);

    const createPivotedLimb = (material, length, radiusScale = 1) => {
      const pivot = new THREE.Group();
      const limb = new THREE.Mesh(geometry.limb, material);
      limb.name = 'LegHighDetail';
      limb.scale.set(radiusScale, length / 0.62, radiusScale);
      limb.position.y = -length * 0.5;
      limb.castShadow = true;
      pivot.add(limb);

      // Smooth spherical knee joint
      const kneeJoint = new THREE.Mesh(geometry.kneeJoint, material);
      kneeJoint.name = 'KneeJoint';
      kneeJoint.position.set(0, -length * 0.5, 0);
      kneeJoint.castShadow = true;
      pivot.add(kneeJoint);

      for (const band of ['medium', 'core']) {
        const tier = geometry.lod[band];
        const tierLimb = createInfantryLodMesh(
          tier.leg,
          material,
          band,
          'upper-leg',
          `${band === 'medium' ? 'Medium' : 'Core'}LegSilhouette`
        );
        tierLimb.scale.set(radiusScale, length / 0.62, radiusScale);
        tierLimb.position.y = -length * 0.5;
        pivot.add(tierLimb);

        const tierJoint = createInfantryLodMesh(
          tier.joint,
          material,
          band,
          'knee',
          `${band === 'medium' ? 'Medium' : 'Core'}KneeSilhouette`
        );
        tierJoint.scale.setScalar(radiusScale);
        tierJoint.position.set(0, -length * 0.5, 0);
        pivot.add(tierJoint);
      }
      return pivot;
    };

    const createTwoBoneArm = (
      material,
      skinMaterial,
      { handedness }
    ) => {
      const upperLength = 0.42;
      const lowerLength = 0.42;
      const shoulder = new THREE.Group();

      // Smooth Deltoid Shoulder Cap (Blends upper torso into upper arm seamlessly)
      const shoulderCap = new THREE.Mesh(geometry.shoulderCap, material);
      shoulderCap.name = 'ShoulderCap';
      shoulderCap.position.set(0, -0.02, 0);
      shoulderCap.castShadow = true;
      shoulder.add(shoulderCap);

      const upperArm = new THREE.Group();
      upperArm.name = 'UpperArm';
      upperArm.scale.set(1, upperLength / 0.62, 1);
      upperArm.position.y = -upperLength * 0.5;
      shoulder.add(upperArm);

      const upperArmHigh = new THREE.Mesh(geometry.armUpper, material);
      upperArmHigh.name = 'UpperArmHighDetail';
      upperArmHigh.castShadow = true;
      upperArm.add(upperArmHigh);

      const elbow = new THREE.Group();
      elbow.name = 'Elbow';
      elbow.position.y = -upperLength;
      shoulder.add(elbow);

      // Smooth spherical elbow joint connecting upper arm and forearm seamlessly
      const elbowJoint = new THREE.Mesh(geometry.elbowJoint, material);
      elbowJoint.name = 'ElbowJoint';
      elbowJoint.position.set(0, 0, 0);
      elbowJoint.castShadow = true;
      elbow.add(elbowJoint);

      const forearm = new THREE.Group();
      forearm.name = 'Forearm';
      forearm.scale.set(0.86, lowerLength / 0.62, 0.86);
      forearm.position.y = -lowerLength * 0.5;
      elbow.add(forearm);

      const forearmHigh = new THREE.Mesh(geometry.armLower, material);
      forearmHigh.name = 'ForearmHighDetail';
      forearmHigh.castShadow = true;
      forearm.add(forearmHigh);

      for (const band of ['medium', 'core']) {
        const tier = geometry.lod[band];
        const title = band === 'medium' ? 'Medium' : 'Core';
        const shoulderSilhouette = createInfantryLodMesh(
          tier.joint,
          material,
          band,
          'shoulder',
          `${title}ShoulderSilhouette`
        );
        shoulderSilhouette.scale.setScalar(band === 'medium' ? 0.94 : 0.82);
        shoulderSilhouette.position.set(0, -0.02, 0);
        shoulder.add(shoulderSilhouette);

        const upperSilhouette = createInfantryLodMesh(
          tier.upperArm,
          material,
          band,
          'upper-arm',
          `${title}UpperArmSilhouette`
        );
        upperArm.add(upperSilhouette);

        const elbowSilhouette = createInfantryLodMesh(
          tier.joint,
          material,
          band,
          'elbow',
          `${title}ElbowSilhouette`
        );
        elbowSilhouette.scale.setScalar(band === 'medium' ? 0.88 : 0.78);
        elbow.add(elbowSilhouette);

        const forearmSilhouette = createInfantryLodMesh(
          tier.forearm,
          material,
          band,
          'forearm',
          `${title}ForearmSilhouette`
        );
        forearm.add(forearmSilhouette);
      }

      // Sleeve Cuff
      const cuff = new THREE.Mesh(geometry.cuff, material);
      cuff.position.y = -lowerLength + 0.04;
      elbow.add(cuff);

      // Single Organic Cupped Character Hand
      const handGeometry = handedness === 'left'
        ? geometry.leftCuppedHand
        : geometry.rightCuppedHand;
      const hand = new THREE.Mesh(handGeometry, skinMaterial);
      hand.name = 'Hand';
      hand.position.set(0, -lowerLength, 0);
      hand.castShadow = true;
      hand.userData.lodBand = 'core';
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

    const addLodLowerLeg = (
      hip,
      lowerLegMaterial,
      bootMaterial,
      side
    ) => {
      for (const band of ['medium', 'core']) {
        const tier = geometry.lod[band];
        const title = band === 'medium' ? 'Medium' : 'Core';
        const lowerLeg = createInfantryLodMesh(
          tier.lowerLeg,
          lowerLegMaterial,
          band,
          'lower-leg',
          `${title}${side}LowerLegSilhouette`
        );
        lowerLeg.position.set(0, band === 'medium' ? -0.42 : -0.43, 0);
        hip.add(lowerLeg);

        const boot = createInfantryLodMesh(
          tier.boot,
          bootMaterial,
          band,
          'boot',
          `${title}${side}BootSilhouette`
        );
        boot.position.set(0, -0.73, 0.06);
        hip.add(boot);
      }
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

      for (const band of ['medium', 'core']) {
        const title = band === 'medium' ? 'Medium' : 'Core';
        const pelvisSilhouette = createInfantryLodMesh(
          geometry.lod[band].pelvis,
          uniformMat,
          band,
          'pelvis',
          `${title}PelvisSilhouette`
        );
        pelvisSilhouette.position.y = 0.89;
        soldierGroup.add(pelvisSilhouette);
      }

      const torso = new THREE.Group();
      torso.name = 'TorsoPosePivot';
      torso.position.y = 1.29;
      const torsoHigh = new THREE.Mesh(geometry.torso, uniformMat);
      torsoHigh.name = 'Torso';
      torsoHigh.castShadow = true;
      torso.add(torsoHigh);
      for (const band of ['medium', 'core']) {
        const title = band === 'medium' ? 'Medium' : 'Core';
        torso.add(createInfantryLodMesh(
          geometry.lod[band].torso,
          uniformMat,
          band,
          'torso',
          `${title}TorsoSilhouette`
        ));
      }
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
      for (const band of ['medium', 'core']) {
        const title = band === 'medium' ? 'Medium' : 'Core';
        headGroup.add(createInfantryLodMesh(
          geometry.lod[band].head,
          skinMat,
          band,
          'head',
          `${title}HeadSilhouette`
        ));
      }

      // Hair Cap under Helmet
      const hair = new THREE.Mesh(geometry.hair, hairMat);
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
        const emblem = new THREE.Mesh(geometry.frenchHelmetEmblem, helmetMat);
        emblem.name = 'FrenchM1926_HelmetEmblem';
        emblem.position.set(0, 1.96, 0.245);
        emblem.rotation.x = -0.25;
        emblem.userData.lodBand = 'high';
        soldierGroup.add(emblem);

        // French M1935 Capote (Greatcoat) folded coat tails (pans de capote)
        const leftTail = new THREE.Mesh(geometry.frenchCoatTail, uniformMat);
        leftTail.position.set(-0.24, 0.85, 0.02);
        leftTail.rotation.z = -0.15;
        leftTail.castShadow = true;
        soldierGroup.add(leftTail);
        const rightTail = leftTail.clone();
        rightTail.position.x = 0.24;
        rightTail.rotation.z = 0.15;
        soldierGroup.add(rightTail);

        // Double-breasted coat buttons (Embedded halfway into coat fabric at x = +-0.08)
        const frenchBtnZ = [0.122, 0.126, 0.128];
        for (let b = 0; b < 3; b++) {
          const yPos = 1.15 + b * 0.11;
          const zPos = frenchBtnZ[b];
          const bLeft = new THREE.Mesh(geometry.button, brassMat);
          bLeft.position.set(-0.08, yPos, zPos);
          bLeft.userData.lodBand = 'high';
          soldierGroup.add(bLeft);

          const bRight = new THREE.Mesh(geometry.button, brassMat);
          bRight.position.set(0.08, yPos, zPos);
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

        const skirt = new THREE.Mesh(geometry.germanHelmetSkirt, helmetMat);
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
        const leftVent = new THREE.Mesh(geometry.germanHelmetVent, helmetMat);
        leftVent.position.set(-0.25, 1.93, 0.04);
        leftVent.userData.lodBand = 'high';
        soldierGroup.add(leftVent);
        const rightVent = leftVent.clone();
        rightVent.position.x = 0.25;
        rightVent.userData.lodBand = 'high';
        soldierGroup.add(rightVent);

        // German Tunic Cargo Pockets
        const pTopLeft = new THREE.Mesh(geometry.germanTunicPocket, uniformMat);
        pTopLeft.position.set(-0.14, 1.35, 0.16);
        pTopLeft.userData.lodBand = 'high';
        soldierGroup.add(pTopLeft);
        const pTopRight = pTopLeft.clone();
        pTopRight.position.x = 0.14;
        pTopRight.userData.lodBand = 'high';
        soldierGroup.add(pTopRight);

        const pBotLeft = new THREE.Mesh(geometry.germanTunicPocket, uniformMat);
        pBotLeft.position.set(-0.14, 1.08, 0.16);
        pBotLeft.userData.lodBand = 'high';
        soldierGroup.add(pBotLeft);
        const pBotRight = pBotLeft.clone();
        pBotRight.position.x = 0.14;
        pBotRight.userData.lodBand = 'high';
        soldierGroup.add(pBotRight);

        // Center button fly (Embedded halfway into tunic fabric)
        const germanBtnZ = [0.138, 0.148, 0.173, 0.198];
        for (let b = 0; b < 4; b++) {
          const btn = new THREE.Mesh(geometry.button, metalGearMat);
          btn.position.set(0, 1.08 + b * 0.09, germanBtnZ[b]);
          btn.userData.lodBand = 'high';
          soldierGroup.add(btn);
        }
      }

      // Epaulettes / Shoulder Straps
      const leftEpaulette = new THREE.Mesh(geometry.epaulette, isFrench ? uniformMat : germanCollarMat);
      leftEpaulette.position.set(-0.22, 1.55, 0);
      leftEpaulette.rotation.z = 0.1;
      soldierGroup.add(leftEpaulette);
      const rightEpaulette = leftEpaulette.clone();
      rightEpaulette.position.x = 0.22;
      rightEpaulette.rotation.z = -0.1;
      soldierGroup.add(rightEpaulette);

      // Leather Y-Straps / Harness
      const leftHarness = new THREE.Mesh(geometry.harness, isFrench ? leatherMat : blackLeatherMat);
      leftHarness.position.set(-0.12, 1.25, 0.02);
      leftHarness.rotation.z = -0.12;
      soldierGroup.add(leftHarness);

      const rightHarness = leftHarness.clone();
      rightHarness.position.x = 0.12;
      rightHarness.rotation.z = 0.12;
      soldierGroup.add(rightHarness);

      // Y-Strap Metal D-Rings on Chest
      const leftDRing = new THREE.Mesh(geometry.harnessRing, buckleMat);
      leftDRing.position.set(-0.12, 1.38, 0.14);
      leftDRing.userData.lodBand = 'high';
      soldierGroup.add(leftDRing);
      const rightDRing = leftDRing.clone();
      rightDRing.position.x = 0.12;
      rightDRing.userData.lodBand = 'high';
      soldierGroup.add(rightDRing);

      const buckle = new THREE.Mesh(geometry.buckle, buckleMat);
      buckle.position.set(0, 1.0, 0.20);
      buckle.userData.lodBand = 'high';
      soldierGroup.add(buckle);

      // Faction Field Equipment
      if (!isFrench) {
        // German Gas Mask Canister (Gasmaskenbüchse M30/M38)
        const canister = new THREE.Mesh(geometry.germanGasMaskCanister, metalGearMat);
        canister.name = 'GermanGasMaskCanister';
        canister.position.set(-0.18, 1.08, -0.22);
        canister.rotation.set(0.3, 0, -0.45);
        canister.castShadow = true;
        canister.userData.lodBand = 'high';
        soldierGroup.add(canister);
      } else {
        // French ANP 31 Gas Mask Bag
        const gasBag = new THREE.Mesh(geometry.frenchGasMaskBag, webbingMat);
        gasBag.name = 'FrenchANP31_GasMaskBag';
        gasBag.position.set(0.24, 0.96, 0.06);
        gasBag.rotation.z = -0.15;
        gasBag.castShadow = true;
        gasBag.userData.lodBand = 'high';
        soldierGroup.add(gasBag);
      }

      // Canteen (French Bidon / German Feldflasche)
      const canteen = new THREE.Mesh(geometry.canteen, canteenCoverMat);
      canteen.name = isFrench ? 'FrenchBidon2L' : 'GermanFeldflasche';
      canteen.position.set(isFrench ? -0.25 : 0.22, 0.98, -0.12);
      canteen.castShadow = true;
      canteen.userData.lodBand = 'high';
      soldierGroup.add(canteen);

      // Mess Tin & Rolled Blanket on Pack
      const messTin = new THREE.Mesh(geometry.messTin, metalGearMat);
      messTin.name = 'MessTin';
      messTin.position.set(0, 1.28, -0.37);
      messTin.userData.lodBand = 'high';
      soldierGroup.add(messTin);

      const blanketRoll = new THREE.Mesh(geometry.blanketRoll, blanketRollMat);
      blanketRoll.name = 'BlanketRoll';
      blanketRoll.position.set(0, 1.54, -0.27);
      blanketRoll.castShadow = true;
      blanketRoll.userData.lodBand = 'high';
      soldierGroup.add(blanketRoll);

      // Bayonet Scabbard
      const sheath = new THREE.Mesh(geometry.bayonetSheath, metalGearMat);
      sheath.position.set(-0.27, 0.88, -0.04);
      sheath.rotation.z = 0.2;
      sheath.userData.lodBand = 'high';
      soldierGroup.add(sheath);

      // Blanket Roll Leather Securing Straps
      for (const strapX of [-0.16, 0.16]) {
        const rStrap = new THREE.Mesh(geometry.blanketRollStrap, leatherMat);
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
        const leftJackboot = new THREE.Mesh(geometry.germanJackboot, blackLeatherMat);
        leftJackboot.position.set(0, -0.40, 0);
        leftHip.add(leftJackboot);

        const leftBoot = new THREE.Mesh(geometry.boot, blackLeatherMat);
        leftBoot.position.set(0, -0.73, 0.06);
        leftHip.add(leftBoot);
      }
      addLodLowerLeg(
        leftHip,
        isFrench ? putteeMat : blackLeatherMat,
        isFrench ? leatherMat : blackLeatherMat,
        'Left'
      );

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
        const rightJackboot = new THREE.Mesh(geometry.germanJackboot, blackLeatherMat);
        rightJackboot.position.set(0, -0.40, 0);
        rightHip.add(rightJackboot);

        const rightBoot = new THREE.Mesh(geometry.boot, blackLeatherMat);
        rightBoot.position.set(0, -0.73, 0.06);
        rightHip.add(rightBoot);
      }
      addLodLowerLeg(
        rightHip,
        isFrench ? putteeMat : blackLeatherMat,
        isFrench ? leatherMat : blackLeatherMat,
        'Right'
      );

      const leftArm = createTwoBoneArm(uniformMat, skinMat, {
        handedness: 'left'
      });
      leftArm.name = 'LeftArm';
      leftArm.position.set(lateralX('left', 0.28), 1.52, 0);
      leftArm.userData.anatomicalSide = 'left';
      leftArm.rotation.x = -0.82;
      leftArm.rotation.z = 0.18;
      soldierGroup.add(leftArm);

      const rightArm = createTwoBoneArm(uniformMat, skinMat, {
        handedness: 'right'
      });
      rightArm.name = 'RightArm';
      rightArm.position.set(lateralX('right', 0.28), 1.52, 0);
      rightArm.userData.anatomicalSide = 'right';
      rightArm.rotation.x = -0.72;
      rightArm.rotation.z = -0.2;
      soldierGroup.add(rightArm);

      const leftHand = leftArm.userData.armRig.hand;
      leftHand.name = 'LeftHand';
      // Cup the support palm up and inward around the underside of the fore-end.
      leftHand.rotation.y = Math.PI / 2;

      const rightHand = rightArm.userData.armRig.hand;
      rightHand.name = 'RightHand';
      // Turn the firing palm inward from the weapon's right side while the arm
      // solver carries the fingers forward along the trigger and receiver.
      rightHand.rotation.y = -Math.PI / 2;

      const pack = new THREE.Mesh(geometry.pack, webbingMat);
      pack.name = 'Pack';
      pack.position.set(0, 1.28, -0.222);
      pack.castShadow = true;
      soldierGroup.add(pack);
      for (const band of ['medium', 'core']) {
        const title = band === 'medium' ? 'Medium' : 'Core';
        const packSilhouette = createInfantryLodMesh(
          geometry.lod[band].pack,
          webbingMat,
          band,
          'pack',
          `${title}PackSilhouette`
        );
        packSilhouette.position.set(0, 1.28, -0.215);
        soldierGroup.add(packSilhouette);
      }

      if (isFrench) {
        for (const [side, x, rotationZ] of [
          ['Left', -0.22, -0.14],
          ['Right', 0.22, 0.14]
        ]) {
          const coatTail = createInfantryLodMesh(
            geometry.lod.medium.coatTail,
            uniformMat,
            'medium',
            'coat-tail',
            `MediumFrench${side}CoatTailSilhouette`
          );
          coatTail.position.set(x, 0.85, 0.02);
          coatTail.rotation.z = rotationZ;
          soldierGroup.add(coatTail);
        }
        const gasBag = createInfantryLodMesh(
          geometry.lod.medium.fieldEquipment,
          webbingMat,
          'medium',
          'field-equipment',
          'MediumFrenchANP31Silhouette'
        );
        gasBag.position.set(0.23, 0.96, 0.055);
        gasBag.rotation.z = -0.15;
        soldierGroup.add(gasBag);
      } else {
        const gasCanister = createInfantryLodMesh(
          geometry.lod.medium.fieldEquipment,
          metalGearMat,
          'medium',
          'field-equipment',
          'MediumGermanGasMaskCanisterSilhouette'
        );
        gasCanister.position.set(-0.18, 1.08, -0.215);
        gasCanister.rotation.set(0.3, 0, -0.45);
        soldierGroup.add(gasCanister);
      }

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
        metal: weaponMat,
        boltMetal: boltWeaponMat
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
        geometry.proxyBody,
        proxyUniformMat
      );
      proxyBody.position.y = 0.82;
      proxyBody.userData.lodBand = 'proxy';
      proxyBody.userData.proxyComponentKey = 'body';

      const proxyHead = new THREE.Mesh(geometry.proxyHead, helmetMat);
      proxyHead.name = isFrench ? 'FrenchProxyHelmetDome' : 'GermanProxyHelmetDome';
      proxyHead.position.y = 1.55;
      proxyHead.userData.lodBand = 'proxy';
      proxyHead.userData.proxyComponentKey = 'head';
      proxyHead.userData.surfaceRole = 'helmet-proxy';

      if (isFrench) {
        const proxyBrim = new THREE.Mesh(
          geometry.frenchProxyBrim,
          helmetMat
        );
        proxyBrim.name = 'FrenchProxyHelmetBrim';
        proxyBrim.scale.z = 1.15;
        proxyBrim.position.set(0, 1.53, 0);
        proxyBrim.userData.lodBand = 'proxy';
        proxyBrim.userData.proxyComponentKey = 'helmet-brim';
        proxyBrim.userData.surfaceRole = 'helmet-proxy';
        lowProxy.add(proxyBrim);
        const proxyCrest = new THREE.Mesh(geometry.frenchProxyCrest, helmetMat);
        proxyCrest.name = 'FrenchProxyHelmetCrest';
        proxyCrest.position.set(0, 1.76, 0);
        proxyCrest.userData.lodBand = 'proxy';
        proxyCrest.userData.proxyComponentKey = 'helmet-crest';
        proxyCrest.userData.surfaceRole = 'helmet-proxy';
        lowProxy.add(proxyCrest);
      } else {
        const proxySkirt = new THREE.Mesh(geometry.germanProxySkirt, helmetMat);
        proxySkirt.name = 'GermanProxyHelmetSkirt';
        proxySkirt.position.set(0, 1.52, 0);
        proxySkirt.userData.lodBand = 'proxy';
        proxySkirt.userData.proxyComponentKey = 'helmet-skirt';
        proxySkirt.userData.surfaceRole = 'helmet-proxy';
        lowProxy.add(proxySkirt);
      }

      const proxyWeapon = new THREE.Mesh(geometry.proxyWeapon, weaponMat);
      proxyWeapon.rotation.x = Math.PI / 2;
      proxyWeapon.position.set(0.15, 1.2, 0.25);
      proxyWeapon.userData.lodBand = 'proxy';
      proxyWeapon.userData.proxyComponentKey = 'weapon';
      lowProxy.add(proxyWeapon);

      lowProxy.add(proxyBody, proxyHead);
      lowProxy.traverse(object => {
        if (object.isMesh) object.visible = false;
      });
      soldierGroup.add(lowProxy);

      soldierGroup.traverse(object => {
        if (object.isMesh) {
          if (!object.userData.lodBand) {
            object.userData.lodBand = 'high';
          }
        }
      });
      soldierGroup.userData.lodRepresentations = {
        medium: [],
        core: []
      };
      soldierGroup.traverse(object => {
        const tier = object.userData.infantryLodTier;
        if (object.isMesh && soldierGroup.userData.lodRepresentations[tier]) {
          soldierGroup.userData.lodRepresentations[tier].push(object);
        }
      });
      soldierGroup.userData.lodModelContract = Object.freeze({
        tiers: Object.freeze(['high', 'medium', 'core', 'proxy']),
        high: 'authored France 1940 soldier',
        medium: 'derived articulated eight-sided silhouette',
        core: 'derived articulated six-sided silhouette',
        sharedPoseCriticalGeometry: Object.freeze([
          'helmet',
          'weapon-core-silhouette',
          'hands-and-grip-markers'
        ])
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

    if (
      roster.some(member =>
        ['gunner', 'assistant'].includes(member.crewServedRole)
      )
    ) {
      const mortarEquipment = createBrandtMle1935MortarEquipment(
        metalGearMat,
        webbingMat
      );
      squadGroup.add(mortarEquipment);
      squadGroup.userData.mortarEquipment = mortarEquipment;
      squadGroup.userData.mortarMuzzle =
        mortarEquipment.userData.muzzle;
      squadGroup.userData.selectionEquipment = [mortarEquipment];
    }

    squadGroup.userData.soldiers = squadGroup.children.filter(c => c.name.startsWith('Soldier_'));
    squadGroup.userData.infantryProxyInstances =
      createFrance1940InfantryProxyInstances(
        squadGroup,
        squadGroup.userData.soldiers
      );

    const weaponLodWorldPosition = new THREE.Vector3();
    const weaponLodTierByModel = new WeakMap();
    const soldiersWithWeaponLods = squadGroup.userData.soldiers.filter(
      soldier => soldier.userData.parts.weaponModel.userData.weaponLodContract
    );
    squadGroup.userData.requiresContinuousLODUpdate =
      soldiersWithWeaponLods.length > 0;

    squadGroup.userData.updateLOD = (cameraPosition, targetLOD = 'high') => {
      const band = targetLOD === 'low' ? 'proxy' : targetLOD;
      for (const soldier of soldiersWithWeaponLods) {
        const weaponModel = soldier.userData.parts.weaponModel;
        const contract = weaponModel.userData.weaponLodContract;
        let weaponTier = band;
        if (band === 'proxy') {
          weaponTier = null;
        } else if (cameraPosition) {
          weaponModel.getWorldPosition(weaponLodWorldPosition);
          const distance = cameraPosition.distanceTo(weaponLodWorldPosition);
          weaponTier = distance < contract.distancesMetres.highMax
            ? 'high'
            : (distance < contract.distancesMetres.mediumMax ? 'medium' : 'core');
          if (band === 'medium' && weaponTier === 'high') weaponTier = 'medium';
          if (band === 'core') weaponTier = 'core';
        }
        if (weaponLodTierByModel.get(weaponModel) === weaponTier) continue;
        weaponLodTierByModel.set(weaponModel, weaponTier);
        weaponModel.traverse(object => {
          if (!object.isMesh || !object.userData.weaponLodTier) return;
          object.visible = object.userData.weaponLodTier === weaponTier;
        });
      }
      squadGroup.traverse(object => {
        if (!object.isMesh || !object.userData.lodBand) return;
        if (object.userData.proxyInstanceSource === true) {
          object.visible = false;
          return;
        }
        if (object.userData.weaponLodTier) return;
        const role = object.userData.lodBand;
        if (role === 'ui') return;
        const replacementTier = object.userData.infantryLodTier;
        if (replacementTier) {
          object.visible = replacementTier === band;
        } else if (band === 'proxy') {
          object.visible = role === 'proxy';
        } else if (band === 'core') {
          object.visible = role === 'core';
        } else if (band === 'medium') {
          object.visible = role !== 'high' && role !== 'proxy';
        } else {
          object.visible = role !== 'proxy';
        }
      });
      return band;
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
