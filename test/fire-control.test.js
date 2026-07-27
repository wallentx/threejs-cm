import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  advanceFireControlState,
  calculateAimRequirement,
  calculateRangeEstimate,
  captureFireControlState,
  createFireControlState,
  createFireControlTargetKey
} from '../src/simulation/combat/FireControl.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

const clearSpotting = {
  checkLOS(from, to) {
    return { clear: true, dist: from.distanceTo(to) };
  }
};

function infantryContext(target, fireWeapon) {
  return {
    opposingUnits: [target],
    spotting: clearSpotting,
    combat: { fireWeapon }
  };
}

function createInfantryPair(prefix = 'fire_control') {
  return {
    attacker: new Unit({
      id: `${prefix}_attacker`,
      faction: 'french',
      type: 'infantry_squad',
      position: new THREE.Vector3()
    }),
    target: new Unit({
      id: `${prefix}_target`,
      faction: 'german',
      type: 'infantry_squad',
      position: new THREE.Vector3(0, 0, 40)
    })
  };
}

test('fire-control aim work and range estimate are deterministic and partition independent', () => {
  const weapon = getWeapon('MAS36');
  const targetKey = createFireControlTargetKey({
    targetUnitId: 'target',
    targetSoldierId: 'rifleman'
  });
  const run = steps => {
    const state = createFireControlState();
    let latest = null;
    for (const deltaSeconds of steps) {
      latest = advanceFireControlState(state, {
        deltaSeconds,
        shooterKey: 'squad:rifleman',
        targetKey,
        weapon,
        trueRangeMeters: 180,
        platform: 'infantry',
        experience: 'Regular',
        stance: 'KNEELING'
      });
    }
    return { state: captureFireControlState(state), latest };
  };

  const single = run([2]);
  const partitioned = run(Array.from({ length: 60 }, () => 1 / 30));
  assert.equal(single.latest.ready, true);
  assert.equal(partitioned.latest.ready, true);
  assert.deepEqual(partitioned.state, single.state);
  assert.equal(single.state.phase, 'READY');
  assert.ok(single.state.estimatedRangeMeters > 0);
  assert.notEqual(single.state.estimatedRangeMeters, 180);
});

test('target switch resets aim while suppression and damaged optics lengthen fire control', () => {
  const weapon = getWeapon('SA35_AP');
  const state = createFireControlState();
  const firstTarget = createFireControlTargetKey({ targetUnitId: 'first' });
  const secondTarget = createFireControlTargetKey({ targetUnitId: 'second' });

  advanceFireControlState(state, {
    deltaSeconds: 0.4,
    shooterKey: 'somua:main',
    targetKey: firstTarget,
    weapon,
    trueRangeMeters: 300,
    platform: 'vehicle-main'
  });
  assert.ok(state.aimProgressSeconds > 0);
  const switched = advanceFireControlState(state, {
    deltaSeconds: 0.05,
    shooterKey: 'somua:main',
    targetKey: secondTarget,
    weapon,
    trueRangeMeters: 300,
    platform: 'vehicle-main'
  });
  assert.equal(switched.targetChanged, true);
  assert.ok(state.aimProgressSeconds <= 0.05 + 1e-9);

  const healthy = calculateAimRequirement({
    weapon,
    rangeMeters: 300,
    platform: 'vehicle-main',
    experience: 'Regular',
    opticsStatus: 'OK'
  });
  const degraded = calculateAimRequirement({
    weapon,
    rangeMeters: 300,
    platform: 'vehicle-main',
    experience: 'Regular',
    suppression: 60,
    opticsStatus: 'DAMAGED'
  });
  assert.ok(degraded > healthy * 2);
  const wounded = calculateAimRequirement({
    weapon,
    rangeMeters: 300,
    platform: 'infantry',
    wounded: true
  });
  const unwounded = calculateAimRequirement({
    weapon,
    rangeMeters: 300,
    platform: 'infantry'
  });
  assert.ok(wounded > unwounded);
});

test('range estimation is stable by shooter and target but differs across observers', () => {
  const input = {
    targetKey: 'unit:target:soldier:-',
    weapon: getWeapon('KAR98K'),
    trueRangeMeters: 240,
    aimProgressRatio: 1,
    platform: 'infantry',
    experience: 'Regular'
  };
  const first = calculateRangeEstimate({ ...input, shooterKey: 'observer-a' });
  const replay = calculateRangeEstimate({ ...input, shooterKey: 'observer-a' });
  const other = calculateRangeEstimate({ ...input, shooterKey: 'observer-b' });
  assert.deepEqual(replay, first);
  assert.notEqual(other.rangeErrorMeters, first.rangeErrorMeters);
});

test('individual infantry must acquire a target before firing and rollback preserves aim work', () => {
  const { attacker, target } = createInfantryPair('infantry_aim');
  const agent = attacker.soldierAI.agents[0];
  agent.state = 'READY';
  agent.fireCooldown = 0;
  let shots = 0;
  const liveContext = infantryContext(target, () => {
    shots++;
    return true;
  });

  assert.equal(agent.updateCombat(0.05, liveContext), false);
  assert.equal(shots, 0);
  assert.equal(agent.fireControl.phase, 'AIMING');
  assert.ok(agent.fireControl.aimProgressSeconds > 0);

  const snapshot = attacker.captureState();
  const restored = new Unit({
    id: attacker.id,
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  restored.restoreState(snapshot, new Map([
    [restored.id, restored],
    [target.id, target]
  ]));
  const restoredAgent = restored.soldierAI.agents[0];
  assert.deepEqual(restoredAgent.fireControl, agent.fireControl);
  assert.notEqual(restoredAgent.fireControl, agent.fireControl);

  let restoredShots = 0;
  let sourceShotStep = null;
  let restoredShotStep = null;
  for (let step = 0; step < 120; step++) {
    if (sourceShotStep == null && agent.updateCombat(1 / 30, liveContext)) {
      sourceShotStep = step;
    }
    if (restoredShotStep == null && restoredAgent.updateCombat(
      1 / 30,
      infantryContext(target, () => {
        restoredShots++;
        return true;
      })
    )) {
      restoredShotStep = step;
    }
    if (sourceShotStep != null && restoredShotStep != null) break;
  }
  assert.equal(restoredShotStep, sourceShotStep);
  assert.equal(shots, 1);
  assert.equal(restoredShots, 1);
});

test('vehicle main and auxiliary weapons acquire targets independently', () => {
  const vehicle = new Unit({
    id: 'vehicle_aim',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3()
  });
  const target = new Unit({
    id: 'vehicle_aim_target',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 35)
  });
  const mountIds = [];
  const context = {
    target,
    combat: {
      fireWeapon(attacker, targetUnit, targetPosition, options) {
        mountIds.push(options.mountId);
        return true;
      }
    }
  };

  assert.equal(vehicle.updateVehicleCombat(0.2, {
    ...context,
    shooterMoving: true
  }), false);
  assert.equal(vehicle.vehicleWeapon.fireControl.phase, 'MOVING');
  assert.equal(vehicle.vehicleWeapon.fireControl.aimProgressSeconds, 0);

  assert.equal(vehicle.updateVehicleCombat(0.05, context), false);
  assert.equal(mountIds.length, 0);
  assert.equal(vehicle.vehicleWeapon.fireControl.phase, 'AIMING');
  assert.equal(vehicle.vehicleMounts.coax.fireControl.phase, 'AIMING');

  for (let step = 0; step < 120
      && (!mountIds.includes('main') || !mountIds.includes('hull_mg')); step++) {
    vehicle.updateVehicleSystems(1 / 30);
    vehicle.updateVehicleCombat(1 / 30, context);
  }
  assert.ok(mountIds.includes('main'));
  assert.ok(mountIds.includes('hull_mg'));
  assert.ok(vehicle.vehicleWeapon.fireControl.estimatedRangeMeters > 0);
  assert.ok(vehicle.vehicleMounts.hull_mg.fireControl.estimatedRangeMeters > 0);
});

test('estimated range changes physical holdover and survives projectile rollback', () => {
  const attacker = new Unit({
    id: 'holdover_attacker',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const scene = new THREE.Scene();
  const combat = new CombatSystem(scene, {}, () => 0, {
    vfxProvider: TEST_VFX_PROVIDER
  });
  const targetPos = new THREE.Vector3(0, 0, 300);
  const weapon = getWeapon('MAS36');
  assert.equal(combat.fireWeapon(attacker, null, targetPos, {
    weapon,
    dispersionScale: 0,
    estimatedRangeMeters: 360,
    rangeErrorMeters: 60,
    aimRequiredSeconds: 1.2,
    fireControlModelVersion: 'deterministic-fire-control-v1'
  }), true);
  const projectile = combat.projectiles[0];
  assert.equal(projectile.estimatedRangeMeters, 360);
  assert.equal(projectile.rangeErrorMeters, 60);
  assert.ok(projectile.velocity.y > 0);

  const captured = combat.captureState();
  combat.restoreState(captured, new Map([[attacker.id, attacker]]));
  assert.deepEqual(combat.captureState(), captured);
  combat.recordImpact(combat.projectiles[0], {
    kind: 'terrain',
    point: combat.projectiles[0].position.clone(),
    unit: null
  });
  assert.equal(combat.telemetry.impacts[0].estimatedRangeMeters, 360);
  assert.equal(
    combat.telemetry.impacts[0].fireControlModelVersion,
    'deterministic-fire-control-v1'
  );
  combat.reset();
});
