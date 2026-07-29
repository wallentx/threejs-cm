import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DestructibleLinearObstacleSystem,
  calculateLinearObstacleBlastDamage,
  estimateVehicleCrushMassTonnes
} from '../src/simulation/terrain/DestructibleLinearObstacleSystem.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

const POLICY = Object.freeze({
  maxHealth: 100,
  minimumMovingSpeedMps: 0.4,
  heavyVehicleMassTonnes: 8,
  highImpactSpeedMps: 3.3,
  momentumThresholdTonneMps: 12,
  blastDamageScale: 1.2,
  dataQuality: 'test gameplay approximation'
});

function segment(index, startX = index * 2) {
  const id = `fence:run:${index}`;
  const colliderId = `wall:run:${index}`;
  return {
    id,
    colliderId,
    runId: 'run',
    segmentIndex: index,
    start: [startX, 0],
    end: [startX + 2, 0],
    colliderRecord: {
      id: colliderId,
      type: 'fence',
      centerX: startX + 1,
      centerZ: 0,
      halfX: 1,
      halfZ: 0.09,
      rotation: 0,
      blocks: ['vehicle', 'infantry']
    },
    obstacleRecord: {
      id: `run_${index}`,
      type: 'fence',
      occludesSight: false
    },
    policy: POLICY
  };
}

test('vehicle crush thresholds destroy only the contacted fence segment', () => {
  const changed = [];
  const system = new DestructibleLinearObstacleSystem({
    onSegmentChanged: state => changed.push(state)
  });
  for (let index = 0; index < 3; index++) {
    system.registerSegment(segment(index));
  }

  const lightSlow = system.applyVehicleImpact({
    colliderId: 'wall:run:0',
    massTonnes: 2.8,
    speedMetersPerSecond: 3.2,
    vehicleId: 'truck'
  });
  assert.equal(lightSlow.destroyed, false);
  assert.equal(lightSlow.health, 100);
  assert.equal(changed.length, 0);

  const heavySlow = system.applyVehicleImpact({
    colliderId: 'wall:run:1',
    massTonnes: 12,
    speedMetersPerSecond: 0.5,
    vehicleId: 'tank'
  });
  assert.equal(heavySlow.destroyed, true);
  assert.equal(heavySlow.lastCause, 'vehicle:tank');
  assert.equal(system.getSegment('fence:run:0').destroyed, false);
  assert.equal(system.getSegment('fence:run:2').destroyed, false);

  const lightFast = system.applyVehicleImpact({
    colliderId: 'wall:run:2',
    massTonnes: 2.8,
    speedMetersPerSecond: 4,
    vehicleId: 'truck'
  });
  assert.equal(lightFast.destroyed, true);
  assert.deepEqual(
    changed.map(state => state.id),
    ['fence:run:1', 'fence:run:2']
  );
});

test('blast falloff, capture, and restore remain deterministic per segment', () => {
  const system = new DestructibleLinearObstacleSystem();
  for (let index = 0; index < 3; index++) {
    system.registerSegment(segment(index));
  }
  const intact = structuredClone(system.captureState());
  const results = system.applyBlast({
    position: new THREE.Vector3(0.5, 0, 0),
    radiusMeters: 1,
    damageAtCenter: 120
  });

  assert.deepEqual(results.map(result => result.id), ['fence:run:0']);
  assert.equal(system.getSegment('fence:run:0').destroyed, true);
  assert.equal(system.getSegment('fence:run:1').destroyed, false);
  const damaged = structuredClone(system.captureState());

  system.restoreState(intact);
  assert.deepEqual(system.captureState(), intact);
  system.restoreState(damaged);
  assert.deepEqual(system.captureState(), damaged);
});

test('vehicle mass and explosive damage approximations stay explicit and bounded', () => {
  assert.equal(
    estimateVehicleCrushMassTonnes({
      dimensionsMeters: { length: 6.02, width: 2.27, height: 2.59 },
      armorMm: { hull_front: 0 }
    }),
    2.8
  );
  assert.ok(
    estimateVehicleCrushMassTonnes({
      dimensionsMeters: { length: 5.38, width: 2.12, height: 2.62 },
      armorMm: { hull_front: 47 }
    }) >= 8
  );
  assert.equal(calculateLinearObstacleBlastDamage({ explosiveRadius: 0 }), 0);
  assert.ok(calculateLinearObstacleBlastDamage({
    explosiveRadius: 4,
    woundDamage: 80,
    caliberMm: 75
  }) > POLICY.maxHealth);
});

test('combat blast forwards deterministic damage to terrain before building handling', () => {
  const calls = [];
  const combat = new CombatSystem(new THREE.Scene(), {}, () => 0.5, {
    terrain: {
      applyBlastDamageToLinearObstacles: blast => calls.push(blast)
    },
    getUnits: () => [],
    vfxProvider: TEST_VFX_PROVIDER
  });
  const position = new THREE.Vector3(3, 0.2, -5);
  const weapon = {
    explosiveRadius: 3,
    woundDamage: 65,
    caliberMm: 47
  };

  combat.applyBlast(position, weapon, null);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].position, position);
  assert.equal(calls[0].radiusMeters, 3);
  assert.equal(
    calls[0].damageAtCenter,
    calculateLinearObstacleBlastDamage(weapon)
  );
  combat.dispose();
});
