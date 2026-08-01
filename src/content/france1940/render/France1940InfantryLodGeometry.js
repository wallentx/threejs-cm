import * as THREE from 'three';

const INFANTRY_DISTANCE_SHADOW_COMPONENTS = new Set([
  'pelvis',
  'torso',
  'upper-leg'
]);

function scaleGeometry(geometry, x, y, z) {
  geometry.scale(x, y, z);
  geometry.computeVertexNormals();
  return geometry;
}

function createTier({
  radialSegments,
  headWidthSegments,
  headHeightSegments,
  torsoTop,
  torsoBottom,
  torsoHeight,
  pelvis,
  upperArm,
  forearm,
  leg,
  jointRadius,
  lowerLeg,
  boot,
  pack
}) {
  return {
    torso: scaleGeometry(
      new THREE.CylinderGeometry(
        torsoTop,
        torsoBottom,
        torsoHeight,
        radialSegments,
        1
      ),
      1.06,
      1,
      0.61
    ),
    pelvis: new THREE.BoxGeometry(...pelvis),
    head: scaleGeometry(
      new THREE.SphereGeometry(
        headWidthSegments === 8 ? 0.155 : 0.148,
        headWidthSegments,
        headHeightSegments
      ),
      0.94,
      1.08,
      1.02
    ),
    upperArm: new THREE.CylinderGeometry(
      upperArm[0],
      upperArm[1],
      0.62,
      radialSegments,
      1
    ),
    forearm: new THREE.CylinderGeometry(
      forearm[0],
      forearm[1],
      0.62,
      radialSegments,
      1
    ),
    leg: new THREE.CylinderGeometry(
      leg[0],
      leg[1],
      0.62,
      radialSegments,
      1
    ),
    joint: new THREE.SphereGeometry(
      jointRadius,
      radialSegments,
      Math.max(3, Math.floor(radialSegments * 0.625))
    ),
    lowerLeg: new THREE.CylinderGeometry(
      lowerLeg[0],
      lowerLeg[1],
      lowerLeg[2],
      radialSegments,
      1
    ),
    boot: new THREE.BoxGeometry(...boot),
    pack: new THREE.BoxGeometry(...pack)
  };
}

/**
 * Renderer-only, deliberately simplified body geometry for the two authored
 * infantry distance tiers. These shapes share the high model's articulated
 * pivots but are separate meshes: medium is an eight-sided silhouette and core
 * is a six-sided silhouette. Faction helmet and firearm identity remain on the
 * existing authored, pose-critical geometry.
 */
export function createFrance1940InfantryLodGeometry(isFrench) {
  const medium = createTier({
    radialSegments: 8,
    headWidthSegments: 8,
    headHeightSegments: 6,
    torsoTop: 0.218,
    torsoBottom: 0.2,
    torsoHeight: 0.69,
    pelvis: [0.41, 0.18, 0.255],
    upperArm: [0.078, 0.064],
    forearm: [0.067, 0.053],
    leg: [0.071, 0.064],
    jointRadius: 0.084,
    lowerLeg: [0.084, 0.069, 0.31],
    boot: [0.116, 0.075, 0.305],
    pack: [0.4, 0.4, 0.15]
  });
  const core = createTier({
    radialSegments: 6,
    headWidthSegments: 6,
    headHeightSegments: 4,
    torsoTop: 0.205,
    torsoBottom: 0.188,
    torsoHeight: 0.67,
    pelvis: [0.38, 0.17, 0.235],
    upperArm: [0.071, 0.059],
    forearm: [0.06, 0.048],
    leg: [0.065, 0.059],
    jointRadius: 0.073,
    lowerLeg: [0.076, 0.062, 0.29],
    boot: [0.105, 0.065, 0.28],
    pack: [0.36, 0.36, 0.13]
  });

  if (isFrench) {
    medium.coatTail = new THREE.BoxGeometry(0.1, 0.29, 0.19);
    medium.fieldEquipment = new THREE.BoxGeometry(0.19, 0.21, 0.095);
  } else {
    medium.fieldEquipment = new THREE.CylinderGeometry(
      0.068,
      0.068,
      0.34,
      8,
      1
    );
  }

  return { medium, core };
}

export function createInfantryLodMesh(
  geometry,
  material,
  band,
  component,
  name
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  // Distance tiers keep only the existing body-mass and separated-leg
  // silhouette in the shadow pass. The authored helmet and primary weapon
  // remain separate core meshes, so head and weapon identity are retained
  // without submitting every limb joint and equipment detail as a caster.
  mesh.castShadow = INFANTRY_DISTANCE_SHADOW_COMPONENTS.has(component);
  mesh.visible = false;
  mesh.userData.lodBand = band;
  mesh.userData.infantryLodTier = band;
  mesh.userData.lodComponent = component;
  return mesh;
}
