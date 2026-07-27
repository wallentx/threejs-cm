import { lodBandsForTier } from './CalibrationMath.js';

export function detachNestedProxyMeshes(root) {
  root.updateMatrixWorld(true);
  const nested = [];
  root.traverse(object => {
    if (!object.isMesh || object.userData.lodBand !== 'proxy') return;
    let ancestor = object.parent;
    while (ancestor && ancestor !== root) {
      if (ancestor.isMesh) {
        nested.push(object);
        break;
      }
      ancestor = ancestor.parent;
    }
  });
  for (const proxy of nested) root.attach(proxy);
  return nested.length;
}

export function setCalibrationLodVisibility(root, tier) {
  const visibleBands = lodBandsForTier(tier);
  root.traverse(object => {
    if (!object.isMesh) return;
    const band = object.userData.lodBand;
    object.visible = band === 'ui' ? false : !band || visibleBands.has(band);
  });
}

export function isEffectivelyVisible(object, stopAt = null) {
  let current = object;
  while (current && current !== stopAt) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}
