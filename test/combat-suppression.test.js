import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CombatSystem,
  vehicleImpactSuppression
} from '../src/game/CombatSystem.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

test('HE blast suppresses only infantry within the actual blast radius', () => {
  const attacker = new Unit({
    id: 'blast-attacker',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'CHAR_B1_BIS',
    position: new THREE.Vector3(0, 0, 0)
  });
  const near = new Unit({
    id: 'blast-near',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 3)
  });
  const farFriendly = new Unit({
    id: 'blast-far-friendly',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 200)
  });
  const combat = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    getUnits: () => [attacker, near, farFriendly],
    vfxProvider: TEST_VFX_PROVIDER
  });

  combat.applyBlast(new THREE.Vector3(0, 0, 4), getWeapon('SA35_HE'), attacker);

  assert.ok(near.suppression > 0);
  assert.equal(farFriendly.suppression, 0);
  assert.equal(farFriendly.morale, 'OK');
  combat.dispose();
});

test('stopped small arms do not suppress an enclosed armored vehicle', () => {
  const target = new Unit({
    id: 'small-arms-armor',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'CHAR_B1_BIS'
  });
  assert.equal(vehicleImpactSuppression({
    weapon: getWeapon('MG34_VEHICLE'),
    target,
    penetrated: false
  }), 0);
  assert.equal(vehicleImpactSuppression({
    weapon: getWeapon('KWK36_AP'),
    target,
    penetrated: false
  }), 12);
});

test('small-arms armor impacts emit sparks without an explosion or morale loss', () => {
  const target = new Unit({
    id: 'spark-target',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'CHAR_B1_BIS'
  });
  const attacker = new Unit({
    id: 'spark-attacker',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D'
  });
  const combat = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    getUnits: () => [attacker, target],
    vfxProvider: TEST_VFX_PROVIDER
  });
  combat.ballistics.resolveVehicleImpact = () => ({
    penetrated: false,
    ricocheted: true,
    stopped: false,
    impactSpeed: 700
  });
  combat.applyProjectileContinuation = () => false;
  let sparks = 0;
  let explosions = 0;
  combat.createArmorSparkEffect = () => { sparks++; };
  combat.createExplosionEffect = () => { explosions++; };

  combat.resolveImpact({
    id: 1,
    attacker,
    targetSoldierId: null,
    weapon: getWeapon('MG34_VEHICLE'),
    muzzlePosition: new THREE.Vector3(),
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(0, 0, 700),
    trajectoryPoints: [[0, 0, 0]],
    distanceTravelled: 10,
    targetRangeMeters: 10,
    ricochetCount: 0,
    penetrationCount: 0
  }, {
    kind: 'vehicle',
    unit: target,
    point: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(0, 0, -1)
  });

  assert.equal(target.suppression, 0);
  assert.equal(target.morale, 'OK');
  assert.equal(sparks, 1);
  assert.equal(explosions, 0);
  combat.dispose();
});

test('vehicle crew morale labels do not magically disable intact movement', () => {
  const unit = new Unit({
    id: 'morale-mobile-char',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'CHAR_B1_BIS',
    position: new THREE.Vector3()
  });
  unit.applySuppression(100);
  unit.addWaypoint(new THREE.Vector3(0, 0, 20), 'MOVE');
  unit.update(1 / 30, {
    getHeightAt: () => 0,
    getMovementHeightAt: () => 0
  });
  assert.equal(unit.morale, 'Broken');
  assert.ok(unit.position.z > 0);
});
