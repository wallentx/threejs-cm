import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { BallisticsSystem } from '../src/game/BallisticsSystem.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';
import {
  FRANCE_1940_STRUCTURES
} from '../src/content/france1940/structures.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

function makeBunker() {
  return new Unit({
    id: 'bunker',
    name: 'MG bunker',
    faction: 'german',
    type: 'bunker',
    structureId: 'GERMAN_MG34_BUNKER',
    position: new THREE.Vector3(0, 0, 0)
  });
}

function makeProjectile(weapon, attacker) {
  return {
    attacker,
    weapon,
    velocity: new THREE.Vector3(0, 0, 650),
    previousPosition: new THREE.Vector3(0, 1.3, -9),
    position: new THREE.Vector3(0, 1.3, 9)
  };
}

test('live bunker retains its injected canonical record outside rollback state', () => {
  const bunker = makeBunker();
  const snapshot = bunker.captureState();

  assert.equal(
    bunker.structureSpec,
    FRANCE_1940_STRUCTURES.GERMAN_MG34_BUNKER
  );
  assert.equal(Object.hasOwn(snapshot, 'structureSpec'), false);
  bunker.restoreState(snapshot, new Map([[bunker.id, bunker]]));
  assert.equal(
    bunker.structureSpec,
    FRANCE_1940_STRUCTURES.GERMAN_MG34_BUNKER
  );
});

test('swept projectiles hit bunker structure and respect concrete resistance', () => {
  const attacker = new Unit({ id: 'attacker', faction: 'french', type: 'infantry_squad', position: new THREE.Vector3(0, 0, -10) });
  const bunker = makeBunker();
  const ballistics = new BallisticsSystem({ getUnits: () => [attacker, bunker], random: () => 0.5 });
  const projectile = makeProjectile(getWeapon('SA35_AP'), attacker);
  const hit = ballistics.detectImpact(projectile);
  assert.equal(hit.kind, 'structure');
  const result = ballistics.resolveStructureImpact(projectile, hit);
  assert.equal(result.penetrated, false, '47mm AP must respect bunker concrete resistance in first pass');
  assert.ok(bunker.structureState.health < bunker.structureState.maxHealth);
});

test('bunker damage state survives capture and restore', () => {
  const bunker = makeBunker();
  const initial = bunker.captureState();
  const weapon = getWeapon('SA35_HE');
  bunker.applyStructureHit({ penetrated: true, weapon, zone: 'front' });
  bunker.applyStructureBlast(bunker.position, weapon);
  const damaged = bunker.captureState();
  assert.ok(damaged.structureState.health < initial.structureState.health);
  bunker.restoreState(initial, new Map([[bunker.id, bunker]]));
  assert.deepEqual(bunker.captureState().structureState, initial.structureState);
});

test('an emitted structure shot owns a simulation-time recent-fire marker through restore', () => {
  const bunker = makeBunker();
  const target = new Unit({
    id: 'structure-target',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 40)
  });
  const combat = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    vfxProvider: TEST_VFX_PROVIDER
  });
  const weapon = getWeapon(bunker.structureSpec.weaponId);

  assert.equal(combat.fireWeapon(bunker, null, null, { weapon }), false);
  assert.equal(bunker.recentFireActivitySeconds, 0);
  assert.equal(combat.fireWeapon(bunker, target, target.position, {
    weapon,
    muzzlePosition: bunker.getMuzzleWorldPosition()
  }), true);
  assert.ok(bunker.recentFireActivitySeconds > 0);

  const firedState = bunker.captureState();
  bunker.update(0.05, { getHeightAt: () => 0 });
  assert.ok(bunker.recentFireActivitySeconds < firedState.recentFireActivitySeconds);
  bunker.restoreState(firedState, new Map([
    [bunker.id, bunker],
    [target.id, target]
  ]));
  assert.equal(
    bunker.recentFireActivitySeconds,
    firedState.recentFireActivitySeconds
  );
  bunker.update(firedState.recentFireActivitySeconds, { getHeightAt: () => 0 });
  assert.equal(bunker.recentFireActivitySeconds, 0);
});

test('destroyed bunker stops firing and swaps intact model for rubble', () => {
  const bunker = makeBunker();
  const weapon = getWeapon('SA35_HE');
  while (!bunker.structureState.destroyed) {
    bunker.applyStructureHit({ penetrated: true, weapon, zone: 'front' });
  }
  assert.equal(bunker.isCombatEffective(), false);
  assert.equal(bunker.mesh.userData.structureDamageParts.ruin.visible, true);
  assert.equal(bunker.mesh.userData.structureDamageParts.gun.visible, false);
});
