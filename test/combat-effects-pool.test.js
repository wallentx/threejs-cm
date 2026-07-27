import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

test('combat impact and explosion visuals stay within reusable bounded pools', () => {
  const scene = new THREE.Scene();
  const combat = new CombatSystem(scene, {}, () => 0.5, {
    vfxProvider: TEST_VFX_PROVIDER
  });
  const point = new THREE.Vector3(2, 0.4, -3);

  for (let index = 0; index < 96; index++) combat.createImpactEffect(point, 0xffaa33);
  for (let index = 0; index < 28; index++) combat.createExplosionEffect(point, 1);

  assert.equal(combat.effects.filter(effect => effect.kind === 'impact').length, 48);
  assert.equal(combat.effects.filter(effect => effect.kind === 'explosion').length, 12);
  assert.equal(combat.effectPools.impact.length, 48);
  assert.equal(combat.effectPools.explosion.length, 12);

  combat.update(1);
  assert.equal(combat.effects.length, 0);
  const priorImpactMesh = combat.effectPools.impact[0].mesh;
  combat.createImpactEffect(point);
  assert.equal(combat.effectPools.impact[0].mesh, priorImpactMesh);
  combat.dispose();
});
