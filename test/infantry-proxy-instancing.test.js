import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createFrance1940InfantrySquadMesh
} from '../src/content/france1940/render/France1940UnitMeshFactory.js';
import { FRANCE_1940_FORMATIONS } from '../src/content/france1940/formations.js';
import { getWeapon } from '../src/content/france1940/weapons.js';
import { resolveMeshShadowPolicy } from '../src/engine/Renderer.js';
import { Unit } from './helpers/France1940TestUnit.js';

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

function assertMatrixEqual(actual, expected, message) {
  assert.equal(actual.elements.length, expected.elements.length, message);
  for (let index = 0; index < actual.elements.length; index++) {
    assert.ok(
      Math.abs(actual.elements[index] - expected.elements[index]) < 1e-6,
      `${message} at element ${index}: ${actual.elements[index]} != ${expected.elements[index]}`
    );
  }
}

function sourceForBatch(soldier, batch) {
  return soldier.userData.parts.lowProxy.children.find(child =>
    child.isMesh
    && child.userData.proxyComponentKey
      === batch.userData.proxyComponentKey);
}

function expectedSquadLocalMatrix(squad, source) {
  squad.updateWorldMatrix(true, true);
  return new THREE.Matrix4()
    .copy(squad.matrixWorld)
    .invert()
    .multiply(source.matrixWorld);
}

function unitRootFor(object) {
  let current = object;
  while (current && current.userData.unitRoot !== true) current = current.parent;
  return current;
}

function raycastProxyBody(unit) {
  const controller = unit.mesh.userData.infantryProxyInstances;
  const batch = controller.batches.find(candidate =>
    candidate.userData.proxyComponentKey === 'body');
  const instanceMatrix = new THREE.Matrix4();
  batch.getMatrixAt(0, instanceMatrix);
  unit.mesh.updateWorldMatrix(true, true);
  const center = new THREE.Vector3()
    .setFromMatrixPosition(instanceMatrix)
    .applyMatrix4(unit.mesh.matrixWorld);
  const raycaster = new THREE.Raycaster(
    center.clone().add(new THREE.Vector3(0, 0, 5)),
    new THREE.Vector3(0, 0, -1),
    0,
    10
  );
  return raycaster.intersectObject(unit.mesh, true)
    .find(hit => hit.object.isInstancedMesh);
}

test('exact force replaces 1,134 proxy component draws with 198 squad-owned batches', () => {
  const squads = exactInfantryForce();
  const resources = meshResources(squads);
  const batches = resources.meshes.filter(mesh => mesh.isInstancedMesh);
  const sources = resources.meshes.filter(mesh =>
    mesh.userData.proxyInstanceSource === true);

  assert.equal(squads.length, 44);
  assert.equal(batches.length, 198);
  assert.equal(sources.length, 1134);
  assert.equal(
    resources.meshes.filter(mesh => !mesh.isInstancedMesh).length,
    28536
  );
  assert.equal(resources.geometries.size, 5558);
  assert.equal(resources.materials.size, 748);
  assert.equal(
    resources.meshes.filter(mesh =>
      resolveMeshShadowPolicy(mesh, true).castShadow
    ).length,
    4534
  );

  for (const squad of squads) {
    const controller = squad.userData.infantryProxyInstances;
    assert.ok(controller);
    assert.equal(controller.capacity, squad.userData.soldiers.length);
    assert.equal(
      controller.batches.length,
      squad.userData.visualStyle.startsWith('French') ? 5 : 4
    );
  }

  for (const [tier, expectedCount] of Object.entries(EXPECTED_VISIBLE_MESHES)) {
    for (const squad of squads) squad.userData.updateLOD(null, tier);
    assert.equal(
      resources.meshes.filter(mesh => mesh.visible).length,
      expectedCount,
      `${tier} visible drawable count must remain bounded`
    );
  }
  assert.equal(batches.filter(batch => batch.visible).length, 198);
  assert.equal(sources.filter(source => source.visible).length, 0);
});

test('instance matrices reproduce every individual proxy transform after public pose projection', () => {
  const unit = new Unit({
    id: 'proxy-pose-unit',
    faction: 'french',
    position: new THREE.Vector3(12, 0, -7)
  });
  const soldier = unit.mesh.userData.soldiers[0];
  const record = unit.roster[0];
  const controller = unit.mesh.userData.infantryProxyInstances;
  const markerIdentity = {
    weapon: soldier.userData.parts.weapon,
    muzzle: soldier.userData.parts.muzzle,
    supportGrip: soldier.userData.parts.supportGrip,
    triggerGrip: soldier.userData.parts.triggerGrip,
    reloadGrip: soldier.userData.parts.reloadGrip,
    parts: soldier.userData.parts,
    bones: soldier.userData.bones
  };
  const poses = [
    { name: 'standing', state: 'READY', stance: 'STANDING', velocity: [0, 0, 0] },
    { name: 'moving', state: 'MOVING', stance: 'STANDING', velocity: [0, 0, 1.2] },
    { name: 'aim', state: 'AIMING', stance: 'KNEELING', velocity: [0, 0, 0] },
    { name: 'reload', state: 'RELOADING', stance: 'STANDING', velocity: [0, 0, 0], reloadTimer: 0.3 },
    { name: 'prone', state: 'MOVING', stance: 'PRONE', velocity: [0, 0, 0.8] },
    {
      name: 'KIA',
      state: 'CASUALTY',
      stance: 'STANDING',
      status: 'KIA',
      health: 0,
      velocity: [0, 0, 0],
      casualtyFallStartStance: 'STANDING',
      poseTime: 0.4
    }
  ];

  for (let poseIndex = 0; poseIndex < poses.length; poseIndex++) {
    const pose = poses[poseIndex];
    Object.assign(record, {
      state: 'READY',
      stance: 'STANDING',
      status: 'OK',
      health: 100,
      velocity: [0, 0, 0],
      worldPosition: [13 + poseIndex, 0.2, -5 - poseIndex * 0.5],
      facing: 0.35 + poseIndex * 0.12,
      stridePhase: Math.PI / 3,
      poseTime: 0.25,
      recoilTime: 0,
      reloadTimer: 0,
      casualtyFallStartStance: null,
      ...pose
    });
    unit.soldierAI.syncMeshes();
    unit.mesh.updateWorldMatrix(true, true);

    for (const batch of controller.batches) {
      const source = sourceForBatch(soldier, batch);
      assert.ok(source, `${pose.name} requires retained proxy source`);
      const actual = new THREE.Matrix4();
      batch.getMatrixAt(0, actual);
      assertMatrixEqual(
        actual,
        expectedSquadLocalMatrix(unit.mesh, source),
        `${pose.name} ${batch.userData.proxyComponentKey}`
      );
    }
  }

  assert.equal(soldier.userData.parts.weapon, markerIdentity.weapon);
  assert.equal(soldier.userData.parts.muzzle, markerIdentity.muzzle);
  assert.equal(soldier.userData.parts.supportGrip, markerIdentity.supportGrip);
  assert.equal(soldier.userData.parts.triggerGrip, markerIdentity.triggerGrip);
  assert.equal(soldier.userData.parts.reloadGrip, markerIdentity.reloadGrip);
  assert.equal(soldier.userData.parts, markerIdentity.parts);
  assert.equal(soldier.userData.bones, markerIdentity.bones);
  assert.equal(controller.batches.every(batch => batch.count === unit.roster.length), true);
});

test('far proxy raycasts retain distinct unit roots, selection discs, bounds, and zero shadows', () => {
  const first = new Unit({
    id: 'proxy-selection-first',
    faction: 'french',
    position: new THREE.Vector3(0, 0, 0)
  });
  const second = new Unit({
    id: 'proxy-selection-second',
    faction: 'french',
    position: new THREE.Vector3(30, 0, 0)
  });
  for (const unit of [first, second]) {
    unit.mesh.position.copy(unit.position);
    unit.mesh.userData.updateLOD(null, 'proxy');
    unit.soldierAI.syncMeshes();
    const hit = raycastProxyBody(unit);
    assert.ok(hit, `${unit.id} requires an instanced proxy ray hit`);
    assert.equal(unitRootFor(hit.object), unit.mesh);
    assert.equal(hit.object.castShadow, false);
    assert.equal(resolveMeshShadowPolicy(hit.object, true).castShadow, false);

    const soldier = unit.mesh.userData.soldiers[0];
    const bodyBatch = unit.mesh.userData.infantryProxyInstances.batches.find(
      batch => batch.userData.proxyComponentKey === 'body'
    );
    const bodySource = sourceForBatch(soldier, bodyBatch);
    const actual = new THREE.Matrix4();
    bodyBatch.getMatrixAt(0, actual);
    assertMatrixEqual(
      actual,
      expectedSquadLocalMatrix(unit.mesh, bodySource),
      `${unit.id} body bounds transform`
    );
  }

  assert.notEqual(first.mesh.userData.selectionDisc, second.mesh.userData.selectionDisc);
  assert.notEqual(
    first.mesh.userData.selectionDisc.material,
    second.mesh.userData.selectionDisc.material
  );
  assert.notEqual(
    first.mesh.userData.soldiers[0].userData.parts.muzzle,
    second.mesh.userData.soldiers[0].userData.parts.muzzle
  );
});

test('proxy synchronization reuses fixed buffers and preserves cross-squad disposal isolation', () => {
  const first = createFrance1940InfantrySquadMesh(
    'german',
    renderRoster('GERMAN_GRENADIER_SQUAD_1940')
  );
  const second = createFrance1940InfantrySquadMesh(
    'german',
    renderRoster('GERMAN_GRENADIER_SQUAD_1940')
  );
  const firstController = first.userData.infantryProxyInstances;
  const secondController = second.userData.infantryProxyInstances;
  const firstResources = meshResources([first]);
  const secondResources = meshResources([second]);
  const arrays = firstController.batches.map(batch => batch.instanceMatrix.array);
  const versions = firstController.batches.map(batch => batch.instanceMatrix.version);
  const objectCount = [];
  first.traverse(object => objectCount.push(object));

  for (let iteration = 0; iteration < 100; iteration++) {
    firstController.sync(first.userData.soldiers.length);
  }
  assert.deepEqual(
    firstController.batches.map(batch => batch.instanceMatrix.array),
    arrays
  );
  assert.deepEqual(
    firstController.batches.map(batch => batch.instanceMatrix.version),
    versions
  );
  const afterObjects = [];
  first.traverse(object => afterObjects.push(object));
  assert.equal(afterObjects.length, objectCount.length);
  assert.deepEqual(
    [meshResources([first]).geometries.size, meshResources([first]).materials.size],
    [firstResources.geometries.size, firstResources.materials.size]
  );

  first.userData.soldiers[0].position.x += 0.5;
  firstController.sync(first.userData.soldiers.length);
  assert.deepEqual(
    firstController.batches.map(batch => batch.instanceMatrix.array),
    arrays
  );
  assert.equal(
    firstController.batches.every((batch, index) =>
      batch.instanceMatrix.version === versions[index] + 1),
    true
  );

  for (const geometry of firstResources.geometries) {
    assert.equal(secondResources.geometries.has(geometry), false);
  }
  for (const material of firstResources.materials) {
    assert.equal(secondResources.materials.has(material), false);
  }
  assert.notEqual(firstController.batches[0], secondController.batches[0]);

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
