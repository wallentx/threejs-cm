import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { BallisticsSystem } from '../src/game/BallisticsSystem.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';

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
