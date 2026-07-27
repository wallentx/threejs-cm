import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import {
  advanceVehicleCrewTaskStep,
  advanceVehicleCrewTaskState,
  captureVehicleCrewTaskState,
  createVehicleCrewTaskState,
  crewmanHasEffectiveVehicleRole,
  effectiveVehicleCrewRole,
  hasEffectiveVehicleCrewRole,
  restoreVehicleCrewTaskState
} from '../src/simulation/vehicles/VehicleCrewTasks.js';

const policy = VEHICLES.PANZER_III_D.crewTaskPolicy;
const replacement = policy.mainGunnerReplacement;

function crewRoster() {
  return [
    { id: 0, role: 'COMMANDER', health: 100, status: 'OK' },
    { id: 1, role: 'GUNNER', health: 0, status: 'KIA' },
    { id: 2, role: 'LOADER', health: 100, status: 'OK' },
    { id: 3, role: 'DRIVER', health: 100, status: 'OK' },
    { id: 4, role: 'RADIO_OPERATOR', health: 100, status: 'OK' }
  ];
}

function makeVehicle(vehicleId, id) {
  return new Unit({
    id,
    faction: 'german',
    type: 'vehicle',
    vehicleId,
    position: new THREE.Vector3()
  });
}

function makeGunnerUnavailable(unit) {
  const gunner = unit.roster.find(crewman => crewman.role === 'GUNNER');
  assert.ok(gunner);
  gunner.health = 0;
  gunner.status = 'KIA';
}

function runCrewTaskCombat(
  partitions,
  targetPosition,
  { includeTimingState = false } = {}
) {
  const panzer = makeVehicle('PANZER_III_D', 'crew_task_partition_panzer');
  const target = makeVehicle('SOMUA_S35', 'crew_task_partition_target');
  target.position.copy(targetPosition);
  target.mesh.position.copy(target.position);
  makeGunnerUnavailable(panzer);
  let shots = 0;
  const context = {
    target,
    combat: {
      fireWeapon() {
        shots++;
        return true;
      }
    }
  };
  for (const delta of partitions) {
    panzer.updateVehicleSystems(delta);
    panzer.updateVehicleCombat(delta, context);
  }
  const result = {
    task: panzer.vehicleCrewTasks,
    turretYaw: panzer.vehicleWeapon.turretYaw,
    aimProgressSeconds: panzer.vehicleWeapon.fireControl.aimProgressSeconds,
    aimPhase: panzer.vehicleWeapon.fireControl.phase,
    feedAmmo: panzer.vehicleWeapon.feedAmmo,
    ammunition: { ...panzer.vehicleWeapon.ammunition },
    roundsFired: panzer.vehicleWeapon.roundsFired,
    isFiring: panzer.vehicleWeapon.isFiring,
    fireState: panzer.vehicleWeapon.fireState,
    shots
  };
  if (includeTimingState) {
    result.reloadTimer = panzer.vehicleWeapon.reloadTimer;
    result.cooldown = panzer.vehicleWeapon.cooldown;
    result.recoilTimer = panzer.vehicleWeapon.recoilTimer;
    result.estimatedRangeMeters =
      panzer.vehicleWeapon.fireControl.estimatedRangeMeters;
    result.rangeErrorMeters = panzer.vehicleWeapon.fireControl.rangeErrorMeters;
  }
  return result;
}

function assertClose(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test('only an explicit policy creates replacement-gunner task state', () => {
  assert.equal(createVehicleCrewTaskState(null), null);
  const state = createVehicleCrewTaskState(policy);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.mainGunnerReplacement));
  assert.deepEqual(state.mainGunnerReplacement, {
    policyId: replacement.id,
    phase: 'IDLE',
    candidateCrewId: null,
    sourceRole: null,
    targetRole: 'GUNNER',
    elapsedSeconds: 0,
    delaySeconds: 12,
    dataQuality: replacement.dataQuality
  });
  assert.match(state.mainGunnerReplacement.dataQuality, /gameplay approximation/i);
});

test('candidate selection is stable across roster insertion order', () => {
  const crew = crewRoster();
  crew.push({ id: 8, role: 'COMMANDER', health: 100, status: 'OK' });
  crew[0].id = 2;
  crew[2].id = 20;
  const forward = advanceVehicleCrewTaskState(
    createVehicleCrewTaskState(policy),
    policy,
    crew,
    0
  );
  const reversed = advanceVehicleCrewTaskState(
    createVehicleCrewTaskState(policy),
    policy,
    [...crew].reverse(),
    0
  );
  assert.equal(forward.mainGunnerReplacement.candidateCrewId, 2);
  assert.deepEqual(reversed, forward);
});

test('dead or incapacitated candidates cannot transfer or operate the gun', () => {
  for (const status of ['KIA', 'INCAPACITATED']) {
    const crew = crewRoster();
    const commander = crew.find(crewman => crewman.role === 'COMMANDER');
    commander.health = status === 'KIA' ? 0 : 100;
    commander.status = status;
    const state = advanceVehicleCrewTaskState(
      createVehicleCrewTaskState(policy),
      policy,
      crew,
      replacement.delaySeconds
    );
    assert.equal(state.mainGunnerReplacement.phase, 'IDLE');
    assert.equal(hasEffectiveVehicleCrewRole(state, crew, ['GUNNER']), false);
  }

  const crew = crewRoster();
  let state = advanceVehicleCrewTaskState(
    createVehicleCrewTaskState(policy),
    policy,
    crew,
    4
  );
  crew[0].status = 'INCAPACITATED';
  state = advanceVehicleCrewTaskState(state, policy, crew, 8);
  assert.equal(state.mainGunnerReplacement.phase, 'IDLE');
  assert.equal(hasEffectiveVehicleCrewRole(state, crew, ['GUNNER']), false);
});

test('main-gunner replacement completes exactly at the configured delay', () => {
  const crew = crewRoster();
  let state = createVehicleCrewTaskState(policy);
  state = advanceVehicleCrewTaskState(state, policy, crew, 11.999);
  assert.equal(state.mainGunnerReplacement.phase, 'TRANSFERRING');
  assert.equal(hasEffectiveVehicleCrewRole(state, crew, ['GUNNER']), false);
  assert.equal(
    crewmanHasEffectiveVehicleRole(crew[0], ['COMMANDER'], state),
    false,
    'the transferring commander must not retain the original task'
  );

  state = advanceVehicleCrewTaskState(state, policy, crew, 0.001);
  assert.equal(state.mainGunnerReplacement.phase, 'COMPLETE');
  assert.equal(state.mainGunnerReplacement.elapsedSeconds, 12);
  assert.equal(hasEffectiveVehicleCrewRole(state, crew, ['GUNNER']), true);
  assert.equal(crewmanHasEffectiveVehicleRole(crew[0], ['COMMANDER'], state), false);
  assert.equal(crewmanHasEffectiveVehicleRole(crew[0], ['GUNNER'], state), true);
});

test('frame partitions produce identical task state and role availability', () => {
  const crew = crewRoster();
  const advance = partitions => partitions.reduce(
    (state, delta) => advanceVehicleCrewTaskState(state, policy, crew, delta),
    createVehicleCrewTaskState(policy)
  );
  const coarse = advance([3, 4, 5]);
  const fine = advance(Array.from({ length: 120 }, () => 0.1));
  assert.deepEqual(fine, coarse);
  assert.equal(hasEffectiveVehicleCrewRole(fine, crew, ['GUNNER']), true);
});

test('third-second and 30/60 Hz partitions complete without accumulated rounding drift', () => {
  const crew = crewRoster();
  const advance = partitions => partitions.reduce(
    (state, delta) => advanceVehicleCrewTaskState(state, policy, crew, delta),
    createVehicleCrewTaskState(policy)
  );
  const expected = advance([replacement.delaySeconds]);
  const thirds = advance(Array.from({ length: 36 }, () => 1 / 3));
  const thirtyHz = advance(Array.from({ length: 360 }, () => 1 / 30));
  const sixtyHz = advance(Array.from({ length: 720 }, () => 1 / 60));

  assert.deepEqual(thirds, expected);
  assert.deepEqual(thirtyHz, expected);
  assert.deepEqual(sixtyHz, expected);
  assert.equal(effectiveVehicleCrewRole(crew[0], sixtyHz), 'GUNNER');
});

test('task-step credit contains only time after the replacement delay', () => {
  const crew = crewRoster();
  const crossing = advanceVehicleCrewTaskStep(
    createVehicleCrewTaskState(policy),
    policy,
    crew,
    replacement.delaySeconds + 0.75
  );
  assert.equal(crossing.state.mainGunnerReplacement.phase, 'COMPLETE');
  assert.equal(crossing.mainGunnerAvailableSeconds, 0.75);

  const exact = advanceVehicleCrewTaskStep(
    createVehicleCrewTaskState(policy),
    policy,
    crew,
    replacement.delaySeconds
  );
  assert.equal(exact.state.mainGunnerReplacement.phase, 'COMPLETE');
  assert.equal(exact.mainGunnerAvailableSeconds, 0);
});

test('real Unit combat credits no transfer time and only post-delay time across partitions', () => {
  const exactCoarse = runCrewTaskCombat([12], new THREE.Vector3(0, 0, 40));
  const exactSixtyHz = runCrewTaskCombat(
    Array.from({ length: 720 }, () => 1 / 60),
    new THREE.Vector3(0, 0, 40)
  );
  assert.deepEqual(exactSixtyHz, exactCoarse);
  assert.equal(exactCoarse.aimProgressSeconds, 0);
  assert.equal(exactCoarse.turretYaw, 0);
  assert.equal(exactCoarse.shots, 0);

  const aimingCoarse = runCrewTaskCombat([12.5], new THREE.Vector3(0, 0, 40));
  const aimingSixtyHz = runCrewTaskCombat(
    Array.from({ length: 750 }, () => 1 / 60),
    new THREE.Vector3(0, 0, 40)
  );
  assert.deepEqual(aimingSixtyHz.task, aimingCoarse.task);
  assertClose(aimingSixtyHz.aimProgressSeconds, aimingCoarse.aimProgressSeconds);
  assertClose(aimingCoarse.aimProgressSeconds, 0.5);
  assert.equal(aimingSixtyHz.aimPhase, aimingCoarse.aimPhase);
  assert.equal(aimingSixtyHz.feedAmmo, aimingCoarse.feedAmmo);
  assert.deepEqual(aimingSixtyHz.ammunition, aimingCoarse.ammunition);
  assert.equal(aimingSixtyHz.roundsFired, aimingCoarse.roundsFired);
  assert.equal(aimingSixtyHz.shots, aimingCoarse.shots);
  assert.equal(aimingCoarse.shots, 0);

  const traverseCoarse = runCrewTaskCombat([13], new THREE.Vector3(40, 0, 0));
  const traverseSixtyHz = runCrewTaskCombat(
    Array.from({ length: 780 }, () => 1 / 60),
    new THREE.Vector3(40, 0, 0)
  );
  assertClose(traverseSixtyHz.turretYaw, traverseCoarse.turretYaw);
  assertClose(traverseCoarse.turretYaw, 0.25);
  assert.equal(traverseSixtyHz.aimProgressSeconds, traverseCoarse.aimProgressSeconds);
  assert.equal(traverseSixtyHz.feedAmmo, traverseCoarse.feedAmmo);
  assert.deepEqual(traverseSixtyHz.ammunition, traverseCoarse.ammunition);
  assert.equal(traverseSixtyHz.roundsFired, traverseCoarse.roundsFired);
  assert.equal(traverseSixtyHz.shots, traverseCoarse.shots);
  assert.equal(traverseCoarse.shots, 0);

  const firingCoarse = runCrewTaskCombat(
    [20],
    new THREE.Vector3(0, 0, 40),
    { includeTimingState: true }
  );
  const firingSixtyHz = runCrewTaskCombat(
    Array.from({ length: 1200 }, () => 1 / 60),
    new THREE.Vector3(0, 0, 40),
    { includeTimingState: true }
  );
  assert.deepEqual(
    firingCoarse,
    firingSixtyHz,
    'post-delay aim, fire, reload, and follow-up fire must survive coarse partitioning'
  );
  assert.equal(firingCoarse.shots, 2);

  const nonIntegralTotalSeconds = 12.97;
  const fullStepCount = 778;
  const postDelayFullStepCount =
    fullStepCount - replacement.delaySeconds * 60;
  const remainderSeconds =
    (nonIntegralTotalSeconds - replacement.delaySeconds)
    - postDelayFullStepCount / 60;
  const remainderCoarse = runCrewTaskCombat(
    [nonIntegralTotalSeconds],
    new THREE.Vector3(0, 0, 40),
    { includeTimingState: true }
  );
  const remainderPartitioned = runCrewTaskCombat(
    [
      ...Array.from({ length: fullStepCount }, () => 1 / 60),
      remainderSeconds
    ],
    new THREE.Vector3(0, 0, 40),
    { includeTimingState: true }
  );
  assert.deepEqual(
    remainderCoarse,
    remainderPartitioned,
    'catch-up must preserve canonical 1/60 steps plus a final remainder'
  );
});

test('capture and restore deep-copy transferring and completed task state', () => {
  const crew = crewRoster();
  const transferring = advanceVehicleCrewTaskState(
    createVehicleCrewTaskState(policy),
    policy,
    crew,
    5
  );
  const captured = captureVehicleCrewTaskState(transferring);
  const restored = restoreVehicleCrewTaskState(policy, captured);
  assert.deepEqual(restored, transferring);
  assert.notEqual(restored, transferring);
  assert.notEqual(restored.mainGunnerReplacement, transferring.mainGunnerReplacement);

  captured.mainGunnerReplacement.elapsedSeconds = 0;
  assert.equal(restored.mainGunnerReplacement.elapsedSeconds, 5);

  const continued = advanceVehicleCrewTaskState(restored, policy, crew, 7);
  const replayed = advanceVehicleCrewTaskState(transferring, policy, crew, 7);
  assert.deepEqual(replayed, continued);
  const completedCapture = captureVehicleCrewTaskState(continued);
  const completedRestore = restoreVehicleCrewTaskState(policy, completedCapture);
  assert.deepEqual(completedRestore, continued);
  assert.notEqual(completedRestore.mainGunnerReplacement, continued.mainGunnerReplacement);
});

test('Unit blocks main-gun traverse, aim, and fire until replacement completes', () => {
  const panzer = makeVehicle('PANZER_III_D', 'crew_task_panzer');
  const target = makeVehicle('SOMUA_S35', 'crew_task_target');
  target.position.set(40, 0, 0);
  target.mesh.position.copy(target.position);
  makeGunnerUnavailable(panzer);

  let shots = 0;
  const context = {
    target,
    combat: {
      fireWeapon() {
        shots++;
        return true;
      }
    }
  };
  assert.equal(panzer.hasOperationalGunner(), false);
  assert.equal(panzer.updateVehicleCombat(5, context), false);
  assert.equal(panzer.vehicleWeapon.turretYaw, 0);
  assert.equal(shots, 0);

  panzer.updateVehicleSystems(11.999);
  assert.equal(panzer.hasOperationalGunner(), false);
  assert.equal(panzer.updateVehicleCombat(5, context), false);
  assert.equal(panzer.vehicleWeapon.turretYaw, 0);
  assert.equal(shots, 0);

  panzer.updateVehicleSystems(0.001);
  assert.equal(panzer.hasOperationalGunner(), true);
  assert.equal(panzer.isCrewRoleAlive(['COMMANDER']), false);
  assert.equal(panzer.getEffectiveCrewRole(panzer.roster[0]), 'GUNNER');
  assert.equal(
    panzer.isVehicleMountOperational('coax'),
    false,
    'the main-gun task must not silently reassign the coax mount'
  );
  assert.equal(
    panzer.updateVehicleCombat(20, context),
    false,
    'the exact completion step must not credit transfer time to the main gun'
  );
  assert.equal(panzer.vehicleWeapon.turretYaw, 0);
  assert.equal(shots, 0);
  panzer.updateVehicleSystems(20);
  assert.equal(panzer.updateVehicleCombat(20, context), true);
  assert.notEqual(panzer.vehicleWeapon.turretYaw, 0);
  assert.equal(shots, 1);
});

test('Unit capture and restore continue the same transfer without shared state', () => {
  const source = makeVehicle('PANZER_III_D', 'crew_task_rollback');
  makeGunnerUnavailable(source);
  source.updateVehicleSystems(5);
  const captured = source.captureState();

  const restored = makeVehicle('PANZER_III_D', 'crew_task_rollback');
  restored.restoreState(captured, new Map([[restored.id, restored]]));
  assert.deepEqual(restored.vehicleCrewTasks, source.vehicleCrewTasks);
  assert.notEqual(restored.vehicleCrewTasks, source.vehicleCrewTasks);
  assert.notEqual(
    restored.vehicleCrewTasks.mainGunnerReplacement,
    source.vehicleCrewTasks.mainGunnerReplacement
  );

  captured.vehicleCrewTasks.mainGunnerReplacement.elapsedSeconds = 0;
  assert.equal(restored.vehicleCrewTasks.mainGunnerReplacement.elapsedSeconds, 5);
  source.updateVehicleSystems(7);
  restored.updateVehicleSystems(7);
  assert.deepEqual(restored.vehicleCrewTasks, source.vehicleCrewTasks);
  assert.equal(restored.hasOperationalGunner(), true);

  const completed = restored.captureState();
  const completedRestore = makeVehicle('PANZER_III_D', 'crew_task_rollback');
  completedRestore.restoreState(completed, new Map([[completedRestore.id, completedRestore]]));
  assert.deepEqual(completedRestore.vehicleCrewTasks, restored.vehicleCrewTasks);
  assert.equal(completedRestore.hasOperationalGunner(), true);
});

test('vehicles without policy keep exact gunner, loader, and driver behavior', () => {
  const panzerIV = makeVehicle('PANZER_IV_D', 'crew_task_no_fallback');
  assert.equal(panzerIV.vehicleCrewTasks, null);
  makeGunnerUnavailable(panzerIV);
  panzerIV.updateVehicleSystems(120);
  assert.equal(panzerIV.hasOperationalGunner(), false);
  assert.equal(panzerIV.hasOperationalLoader(), true);
  assert.equal(panzerIV.hasOperationalDriver(), true);

  panzerIV.roster.find(crewman => crewman.role === 'LOADER').status = 'KIA';
  panzerIV.roster.find(crewman => crewman.role === 'LOADER').health = 0;
  panzerIV.roster.find(crewman => crewman.role === 'DRIVER').status = 'KIA';
  panzerIV.roster.find(crewman => crewman.role === 'DRIVER').health = 0;
  assert.equal(panzerIV.hasOperationalLoader(), false);
  assert.equal(panzerIV.hasOperationalDriver(), false);
});
