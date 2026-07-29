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
  for (let index = 0; index < 70; index++) {
    combat.createMuzzleFlashEffect(point, {
      kind: 'rifle',
      caliberMm: 7.5
    });
  }

  assert.equal(combat.effects.filter(effect => effect.kind === 'impact').length, 48);
  assert.equal(combat.effects.filter(effect => effect.kind === 'explosion').length, 12);
  assert.equal(combat.effects.filter(effect => effect.kind === 'muzzleFlash').length, 48);
  assert.equal(combat.effectPools.impact.length, 48);
  assert.equal(combat.effectPools.explosion.length, 12);
  assert.equal(combat.effectPools.muzzleFlash.length, 48);
  assert.ok(combat.effectPools.muzzleFlash.every(effect =>
    effect.mesh.isSprite
    && effect.material.isSpriteNodeMaterial
    && !effect.material.isShaderMaterial
  ));
  const explosion = combat.effects.find(effect => effect.kind === 'explosion');
  assert.ok(explosion.mesh.isSprite);
  assert.ok(explosion.mesh.scale.x >= 4.5);
  assert.ok(explosion.mesh.position.y > point.y);
  assert.deepEqual(
    explosion.mesh.userData.authoritativeImpactPosition,
    point.toArray()
  );

  combat.update(1);
  assert.equal(combat.effects.length, 0);
  const priorImpactMesh = combat.effectPools.impact[0].mesh;
  combat.createImpactEffect(point);
  assert.equal(combat.effectPools.impact[0].mesh, priorImpactMesh);
  combat.dispose();
});
