import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFrance1940InfantrySquadMesh } from '../src/content/france1940/render/France1940UnitMeshFactory.js';
import { FRANCE_1940_FORMATIONS } from '../src/content/france1940/formations.js';
import { getWeapon } from '../src/content/france1940/weapons.js';
import { resolveMeshShadowPolicy } from '../src/engine/Renderer.js';
import { applyInfantrySecondaryPose } from '../src/world/infantry/InfantryPoseAnimator.js';

const FORCE = Object.freeze([
  Object.freeze(['french', 'FRENCH_CHASSEURS_PORTES_PLATOON_HQ', 2]),
  Object.freeze(['french', 'FRENCH_CHASSEURS_PORTES_SQUAD', 20]),
  Object.freeze(['german', 'GERMAN_GRENADIER_PLATOON_HQ_1940', 2]),
  Object.freeze(['german', 'GERMAN_GRENADIER_SQUAD_1940', 20])
]);

const EXPECTED_VISIBLE_MESHES = Object.freeze({
  high: 16818,
  medium: 9636,
  core: 7602,
  proxy: 242
});

function renderRoster(formationId) {
  return FRANCE_1940_FORMATIONS[formationId].members.map(member => ({
    id: member.id,
    weapon: getWeapon(member.weaponId).name,
    crewServedRole: member.crewServedRole
  }));
}

function exactInfantryForce() {
  return FORCE.flatMap(([faction, formationId, count]) =>
    Array.from({ length: count }, () =>
      createFrance1940InfantrySquadMesh(
        faction,
        renderRoster(formationId)
      ))
  );
}

function meshResources(roots) {
  const meshes = [];
  const geometries = new Set();
  const materials = new Set();
  for (const root of roots) {
    root.traverse(object => {
      if (!object.isMesh) return;
      meshes.push(object);
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(material);
      }
    });
  }
  return { meshes, geometries, materials };
}

function materialSnapshot(material) {
  return Object.freeze({
    type: material.type,
    color: material.color?.getHex() ?? null,
    roughness: material.roughness ?? null,
    metalness: material.metalness ?? null,
    side: material.side,
    transparent: material.transparent,
    opacity: material.opacity,
    depthWrite: material.depthWrite
  });
}

function transformSnapshot(object) {
  return {
    position: object.position.toArray(),
    rotation: object.rotation.toArray(),
    scale: object.scale.toArray()
  };
}

test('exact 252-soldier force pools squad-owned render resources without changing mesh, LOD, or shadow contracts', () => {
  const squads = exactInfantryForce();
  const soldiers = squads.flatMap(squad => squad.userData.soldiers);
  const resources = meshResources(squads);

  assert.equal(squads.length, 44);
  assert.equal(soldiers.length, 252);
  assert.equal(
    resources.meshes.filter(mesh => !mesh.isInstancedMesh).length,
    28536
  );
  assert.equal(
    resources.meshes.filter(mesh => mesh.isInstancedMesh).length,
    198
  );
  assert.ok(
    resources.geometries.size <= 5558,
    `expected at most 5,558 geometries, received ${resources.geometries.size}`
  );
  assert.ok(
    resources.materials.size <= 748,
    `expected at most 748 materials, received ${resources.materials.size}`
  );
  assert.equal(
    resources.meshes.filter(mesh =>
      resolveMeshShadowPolicy(mesh, true).castShadow
    ).length,
    4534
  );

  for (const [tier, expectedCount] of Object.entries(EXPECTED_VISIBLE_MESHES)) {
    for (const squad of squads) squad.userData.updateLOD(null, tier);
    assert.equal(
      resources.meshes.filter(mesh => mesh.visible).length,
      expectedCount,
      `${tier} visible mesh count must remain output-neutral`
    );
  }
});

test('pooling preserves within-squad sharing, cross-squad isolation, markers, poses, and selection materials', () => {
  const firstSquad = createFrance1940InfantrySquadMesh(
    'french',
    renderRoster('FRENCH_CHASSEURS_PORTES_SQUAD')
  );
  const secondSquad = createFrance1940InfantrySquadMesh(
    'french',
    renderRoster('FRENCH_CHASSEURS_PORTES_SQUAD')
  );
  const [first, second] = firstSquad.userData.soldiers;
  const firstParts = first.userData.parts;
  const secondParts = second.userData.parts;

  const firstKnee = firstParts.leftLeg.getObjectByName('KneeJoint');
  const secondKnee = secondParts.leftLeg.getObjectByName('KneeJoint');
  assert.equal(firstKnee.geometry, secondKnee.geometry);
  assert.equal(firstKnee.material, secondKnee.material);

  for (const key of ['weapon', 'muzzle', 'supportGrip', 'triggerGrip', 'reloadGrip']) {
    assert.ok(firstParts[key], `first soldier requires ${key}`);
    assert.ok(secondParts[key], `second soldier requires ${key}`);
    assert.notEqual(firstParts[key], secondParts[key], `${key} remains individual`);
  }
  assert.notEqual(first.userData.parts, second.userData.parts);
  assert.notEqual(first.userData.bones, second.userData.bones);

  const otherBefore = {
    root: transformSnapshot(second),
    torso: transformSnapshot(secondParts.torso),
    leftLeg: transformSnapshot(secondParts.leftLeg),
    weapon: transformSnapshot(secondParts.weapon)
  };
  applyInfantrySecondaryPose(first, {
    status: 'KIA',
    health: 0,
    state: 'CASUALTY',
    stance: 'STANDING',
    velocity: [0, 0, 0],
    poseTime: 2,
    idlePhase: 0,
    stridePhase: 0
  });
  assert.deepEqual({
    root: transformSnapshot(second),
    torso: transformSnapshot(secondParts.torso),
    leftLeg: transformSnapshot(secondParts.leftLeg),
    weapon: transformSnapshot(secondParts.weapon)
  }, otherBefore);

  const bodyMaterial = firstKnee.material;
  const bodyBefore = materialSnapshot(bodyMaterial);
  const selectionMaterial = firstSquad.userData.selectionDisc.material;
  assert.notEqual(selectionMaterial, bodyMaterial);
  selectionMaterial.color.setHex(0xff00ff);
  firstSquad.userData.updateLOD(null, 'medium');
  firstSquad.userData.updateLOD(null, 'core');
  assert.deepEqual(materialSnapshot(bodyMaterial), bodyBefore);

  const firstResources = meshResources([firstSquad]);
  const secondResources = meshResources([secondSquad]);
  for (const geometry of firstResources.geometries) {
    assert.equal(secondResources.geometries.has(geometry), false);
  }
  for (const material of firstResources.materials) {
    assert.equal(secondResources.materials.has(material), false);
  }

  let secondDisposals = 0;
  for (const resource of [
    ...secondResources.geometries,
    ...secondResources.materials
  ]) {
    resource.addEventListener('dispose', () => { secondDisposals++; });
  }
  for (const geometry of firstResources.geometries) geometry.dispose();
  for (const material of firstResources.materials) material.dispose();
  assert.equal(secondDisposals, 0);
});
