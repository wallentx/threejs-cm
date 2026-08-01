import * as THREE from 'three';

function proxySourcesForSoldier(soldier) {
  const lowProxy = soldier?.userData?.parts?.lowProxy;
  if (!lowProxy) {
    throw new Error('Infantry proxy instancing requires each soldier low proxy');
  }
  return lowProxy.children.filter(child =>
    child.isMesh
    && child.userData.lodBand === 'proxy'
    && typeof child.userData.proxyComponentKey === 'string');
}

function matrixDiffers(matrix, buffer, offset) {
  for (let index = 0; index < 16; index++) {
    if (Math.fround(matrix.elements[index]) !== buffer[offset + index]) {
      return true;
    }
  }
  return false;
}

export function createFrance1940InfantryProxyInstances(squad, soldiers) {
  if (!squad?.add || !Array.isArray(soldiers) || soldiers.length === 0) {
    throw new TypeError(
      'Infantry proxy instancing requires a squad and individual soldiers'
    );
  }

  const capacity = soldiers.length;
  const firstSources = proxySourcesForSoldier(soldiers[0]);
  const sourcesByComponent = firstSources.map(() => new Array(capacity));
  const lowProxies = new Array(capacity);

  for (let soldierIndex = 0; soldierIndex < capacity; soldierIndex++) {
    const soldier = soldiers[soldierIndex];
    const lowProxy = soldier.userData.parts.lowProxy;
    const sources = proxySourcesForSoldier(soldier);
    if (sources.length !== firstSources.length) {
      throw new Error('Infantry proxy component count must match within a squad');
    }
    lowProxies[soldierIndex] = lowProxy;
    for (let componentIndex = 0; componentIndex < sources.length; componentIndex++) {
      const source = sources[componentIndex];
      const template = firstSources[componentIndex];
      if (
        source.userData.proxyComponentKey
          !== template.userData.proxyComponentKey
        || source.geometry !== template.geometry
        || source.material !== template.material
      ) {
        throw new Error(
          'Infantry proxy components must share squad-owned geometry and material'
        );
      }
      source.userData.proxyInstanceSource = true;
      source.visible = false;
      sourcesByComponent[componentIndex][soldierIndex] = source;
    }
  }

  const batches = firstSources.map((source, componentIndex) => {
    const batch = new THREE.InstancedMesh(
      source.geometry,
      source.material,
      capacity
    );
    batch.name = `InfantryProxyInstances_${source.userData.proxyComponentKey}`;
    batch.castShadow = false;
    batch.receiveShadow = false;
    batch.visible = false;
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.userData.lodBand = 'proxy';
    batch.userData.proxyInstancedBatch = true;
    batch.userData.proxyComponentKey = source.userData.proxyComponentKey;
    batch.userData.proxyComponentIndex = componentIndex;
    if (source.userData.surfaceRole) {
      batch.userData.surfaceRole = source.userData.surfaceRole;
    }
    squad.add(batch);
    return batch;
  });

  const soldierProxyMatrices = Array.from(
    { length: capacity },
    () => new THREE.Matrix4()
  );
  const instanceMatrix = new THREE.Matrix4();

  const sync = (requestedCount = capacity) => {
    const activeCount = Math.max(
      0,
      Math.min(
        capacity,
        Number.isFinite(requestedCount) ? Math.floor(requestedCount) : capacity
      )
    );

    for (let soldierIndex = 0; soldierIndex < activeCount; soldierIndex++) {
      const soldier = soldiers[soldierIndex];
      const lowProxy = lowProxies[soldierIndex];
      soldier.updateMatrix();
      lowProxy.updateMatrix();
      soldierProxyMatrices[soldierIndex].multiplyMatrices(
        soldier.matrix,
        lowProxy.matrix
      );
    }

    for (let componentIndex = 0; componentIndex < batches.length; componentIndex++) {
      const batch = batches[componentIndex];
      const sources = sourcesByComponent[componentIndex];
      let changed = batch.count !== activeCount;
      batch.count = activeCount;

      for (let soldierIndex = 0; soldierIndex < activeCount; soldierIndex++) {
        const source = sources[soldierIndex];
        source.updateMatrix();
        instanceMatrix.multiplyMatrices(
          soldierProxyMatrices[soldierIndex],
          source.matrix
        );
        if (
          matrixDiffers(
            instanceMatrix,
            batch.instanceMatrix.array,
            soldierIndex * 16
          )
        ) {
          batch.setMatrixAt(soldierIndex, instanceMatrix);
          changed = true;
        }
      }

      if (changed) {
        batch.instanceMatrix.needsUpdate = true;
        batch.computeBoundingBox();
        batch.computeBoundingSphere();
      }
    }
  };

  const controller = Object.freeze({
    capacity,
    batches: Object.freeze(batches),
    sync
  });
  sync(capacity);
  return controller;
}
