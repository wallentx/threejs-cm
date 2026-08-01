import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createFrance1940InfantrySquadMesh
} from '../src/content/france1940/render/France1940UnitMeshFactory.js';
import { resolveMeshShadowPolicy } from '../src/engine/Renderer.js';
import { applyInfantrySecondaryPose } from '../src/world/infantry/InfantryPoseAnimator.js';

const CASES = Object.freeze([
  Object.freeze({
    faction: 'french',
    weapon: 'MAS-36 Rifle',
    helmetNames: Object.freeze([
      'FrenchM1926_HelmetDome',
      'FrenchM1926_HelmetBrim',
      'FrenchM1926_HelmetCrest'
    ]),
    highCasterCount: 10,
    distanceCasterCount: 14
  }),
  Object.freeze({
    faction: 'german',
    weapon: 'Kar98k',
    helmetNames: Object.freeze([
      'GermanM35_HelmetDome',
      'GermanM35_HelmetSkirt'
    ]),
    highCasterCount: 9,
    distanceCasterCount: 13
  })
]);

const RETAINED_DISTANCE_COMPONENTS = Object.freeze([
  'pelvis',
  'torso',
  'upper-leg',
  'upper-leg'
]);

function createCase(specification) {
  const squad = createFrance1940InfantrySquadMesh(
    specification.faction,
    [{ id: `${specification.faction}-rifleman`, weapon: specification.weapon }]
  );
  return { squad, soldier: squad.userData.soldiers[0] };
}

function isEffectivelyVisible(object, root) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === root) return true;
  }
  return false;
}

function activeCasters(root) {
  const casters = [];
  root.traverse(object => {
    if (
      object.isMesh
      && isEffectivelyVisible(object, root)
      && resolveMeshShadowPolicy(object, true).castShadow
    ) {
      casters.push(object);
    }
  });
  return casters;
}

function resourceSets(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
    }
  });
  return { geometries, materials };
}

function visibleBounds(root) {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  root.traverse(object => {
    if (!object.isMesh || !isEffectivelyVisible(object, root)) return;
    object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return bounds;
}

function matrixSnapshot(objects) {
  return objects.map(object => {
    object.updateWorldMatrix(true, false);
    return object.matrixWorld.elements.map(value => Number(value.toFixed(9)));
  });
}

test('medium and core retain the exact faction-neutral infantry shadow silhouette', () => {
  for (const specification of CASES) {
    const { squad, soldier } = createCase(specification);

    for (const tier of ['medium', 'core']) {
      squad.userData.updateLOD(null, tier);
      const replacement = soldier.userData.lodRepresentations[tier];
      assert.deepEqual(
        replacement
          .filter(mesh => resolveMeshShadowPolicy(mesh, true).castShadow)
          .map(mesh => mesh.userData.lodComponent)
          .sort(),
        [...RETAINED_DISTANCE_COMPONENTS].sort(),
        `${specification.faction} ${tier} must keep only the reviewed body silhouette`
      );

      const casters = activeCasters(soldier);
      assert.equal(casters.length, specification.distanceCasterCount);
      assert.equal(
        specification.helmetNames.every(name =>
          casters.some(mesh => mesh.name === name)
        ),
        true,
        `${specification.faction} ${tier} must retain helmet identity`
      );
      assert.equal(
        casters.filter(mesh => mesh.userData.lodComponent === 'upper-leg').length,
        2,
        `${specification.faction} ${tier} must retain separated leg silhouettes`
      );
      assert.equal(
        casters.some(mesh => mesh.parent === soldier.userData.parts.weaponModel),
        true,
        `${specification.faction} ${tier} must retain the carried weapon outline`
      );
    }
  }
});

test('shadow ownership never changes visible LOD output, high policy, or zero-shadow proxy policy', () => {
  for (const specification of CASES) {
    const { squad, soldier } = createCase(specification);
    const replacementCounts = Object.fromEntries(
      ['medium', 'core'].map(tier => [
        tier,
        soldier.userData.lodRepresentations[tier].length
      ])
    );

    squad.userData.updateLOD(null, 'high');
    assert.equal(activeCasters(soldier).length, specification.highCasterCount);

    const boundsByTier = {};
    for (const tier of ['medium', 'core']) {
      squad.userData.updateLOD(null, tier);
      assert.equal(
        soldier.userData.lodRepresentations[tier]
          .filter(mesh => isEffectivelyVisible(mesh, soldier)).length,
        replacementCounts[tier],
        `${tier} must keep every authored visible component`
      );
      boundsByTier[tier] = visibleBounds(soldier).clone();
    }

    squad.userData.updateLOD(null, 'proxy');
    assert.equal(activeCasters(squad).length, 0);
    assert.equal(
      squad.userData.infantryProxyInstances.batches.every(batch =>
        batch.castShadow === false
      ),
      true
    );

    for (const tier of ['medium', 'core']) {
      squad.userData.updateLOD(null, tier);
      const repeated = visibleBounds(soldier);
      assert.equal(repeated.min.distanceTo(boundsByTier[tier].min), 0);
      assert.equal(repeated.max.distanceTo(boundsByTier[tier].max), 0);
    }
  }
});

test('standing, prone, and KIA projection move the retained distance-tier casters deterministically', () => {
  const poseStates = [
    {
      status: 'OK', health: 100, state: 'IDLE', stance: 'STANDING',
      velocity: [0, 0, 0], poseTime: 0, idlePhase: 0, stridePhase: 0
    },
    {
      status: 'OK', health: 100, state: 'MOVING', stance: 'PRONE',
      velocity: [0, 0, 0.5], poseTime: 0, idlePhase: 0, stridePhase: 1.2
    },
    {
      status: 'KIA', health: 0, state: 'CASUALTY', stance: 'STANDING',
      velocity: [0, 0, 0], poseTime: 2, idlePhase: 0, stridePhase: 0
    }
  ];

  for (const specification of CASES) {
    const snapshots = [];
    for (const poseState of poseStates) {
      const { squad, soldier } = createCase(specification);
      squad.userData.updateLOD(null, 'core');
      applyInfantrySecondaryPose(soldier, poseState);
      const casters = activeCasters(soldier);
      assert.equal(casters.length, specification.distanceCasterCount);
      assert.equal(casters.every(mesh => mesh.matrixWorld.elements.every(Number.isFinite)), true);
      snapshots.push(matrixSnapshot(casters));
    }
    assert.notDeepEqual(snapshots[0], snapshots[1]);
    assert.notDeepEqual(snapshots[0], snapshots[2]);
    assert.deepEqual(snapshots, poseStates.map(poseState => {
      const { squad, soldier } = createCase(specification);
      squad.userData.updateLOD(null, 'core');
      applyInfantrySecondaryPose(soldier, poseState);
      return matrixSnapshot(activeCasters(soldier));
    }));
  }
});

test('repeated LOD updates preserve pooled resources, ownership, and disposal isolation', () => {
  const first = createFrance1940InfantrySquadMesh('french', [
    { id: 'first-a', weapon: 'MAS-36 Rifle' },
    { id: 'first-b', weapon: 'FM 24/29 LMG' }
  ]);
  const second = createFrance1940InfantrySquadMesh('french', [
    { id: 'second-a', weapon: 'MAS-36 Rifle' },
    { id: 'second-b', weapon: 'FM 24/29 LMG' }
  ]);
  const firstResources = resourceSets(first);
  const secondResources = resourceSets(second);

  for (let index = 0; index < 100; index++) {
    first.userData.updateLOD(null, ['high', 'medium', 'core', 'proxy'][index % 4]);
  }
  const repeatedResources = resourceSets(first);
  assert.deepEqual(repeatedResources.geometries, firstResources.geometries);
  assert.deepEqual(repeatedResources.materials, firstResources.materials);
  assert.equal(first.userData.soldiers.length, 2);
  assert.notEqual(first.userData.soldiers[0], first.userData.soldiers[1]);

  let crossSquadDisposals = 0;
  for (const resource of [
    ...secondResources.geometries,
    ...secondResources.materials
  ]) {
    resource.addEventListener('dispose', () => { crossSquadDisposals++; });
  }
  for (const geometry of firstResources.geometries) geometry.dispose();
  for (const material of firstResources.materials) material.dispose();
  assert.equal(crossSquadDisposals, 0);
});
