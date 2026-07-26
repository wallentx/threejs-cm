import * as THREE from 'three';

// Scene positions, terrain, vehicles, and soldier agents use metres.
export const WORLD_SCALE = Object.freeze({
  units: 'metres',
  standingInfantryHeight: 1.75,
  source: 'gameplay reference; average equipped 1940 infantryman approximation'
});

function isAuthoredMesh(object) {
  return object.isMesh
    && object.userData?.lodBand !== 'proxy'
    && object.userData?.lodBand !== 'ui';
}

/**
 * Return bounds in the parent's coordinate space. This includes the root's
 * authored scale, while excluding UI and far-proxy geometry.
 */
export function getAuthoredMeshBounds(root) {
  root.updateWorldMatrix(true, true);
  const parentInverse = root.parent
    ? new THREE.Matrix4().copy(root.parent.matrixWorld).invert()
    : new THREE.Matrix4();
  const bounds = new THREE.Box3();
  const localBounds = new THREE.Box3();
  const relativeMatrix = new THREE.Matrix4();

  root.traverse(object => {
    if (!isAuthoredMesh(object) || !object.geometry?.getAttribute('position')) return;
    object.geometry.computeBoundingBox();
    localBounds.copy(object.geometry.boundingBox);
    relativeMatrix.multiplyMatrices(parentInverse, object.matrixWorld);
    bounds.union(localBounds.applyMatrix4(relativeMatrix));
  });

  return bounds;
}

/**
 * Normalize a static soldier model once at creation time. Formation offsets,
 * SoldierAI state, and simulation movement coordinates remain unchanged.
 */
export function normalizeInfantryStandingHeight(soldierGroup, targetHeight = WORLD_SCALE.standingInfantryHeight) {
  const authoredBounds = getAuthoredMeshBounds(soldierGroup);
  const authoredHeight = authoredBounds.isEmpty() ? 0 : authoredBounds.max.y - authoredBounds.min.y;
  if (!(authoredHeight > 0)) {
    throw new Error('Cannot normalize infantry without authored mesh bounds');
  }

  const scaleFactor = targetHeight / authoredHeight;
  soldierGroup.scale.multiplyScalar(scaleFactor);
  soldierGroup.updateWorldMatrix(true, true);
  const normalizedBounds = getAuthoredMeshBounds(soldierGroup);
  const normalizedHeight = normalizedBounds.max.y - normalizedBounds.min.y;
  soldierGroup.userData.physicalScale = Object.freeze({
    units: WORLD_SCALE.units,
    reference: 'standingInfantryHeight',
    targetHeight,
    authoredHeight,
    appliedUniformScale: scaleFactor,
    normalizedHeight
  });
  return soldierGroup.userData.physicalScale;
}
