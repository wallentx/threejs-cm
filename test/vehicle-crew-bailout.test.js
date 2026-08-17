import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BallisticsSystem } from '../src/game/BallisticsSystem.js';
import { Unit } from './helpers/France1940TestUnit.js';
import {
  advanceVehicleCrewBailoutState,
  applyVehicleCrewBailoutCasualty,
  captureVehicleCrewBailoutState,
  createVehicleCrewBailoutState,
  getActiveVehicleCrewBailoutActors,
  restoreVehicleCrewBailoutState,
  triggerVehicleCrewBailout
} from '../src/simulation/vehicles/VehicleCrewBailout.js';

const POLICY = Object.freeze({
  approximationLabel: 'test policy',
  staggerSeconds: 0.25,
  egressDurationSeconds: 1,
  runSpeedMetersPerSecond: 2
});

const FLAT_TERRAIN = Object.freeze({
  getMovementHeightAt() { return 0; },
  getHeightAt() { return 0; }
});

function makeVehicle(vehicleId = 'HOTCHKISS_H39', id = 'bailout-vehicle') {
  return new Unit({
    id,
    faction: 'french',
    type: 'vehicle',
    vehicleId,
    position: new THREE.Vector3()
  });
}

function plan({ reverseCrew = false, reverseCover = false } = {}) {
  const crew = [
    { id: 'commander', health: 100, status: 'OK' },
    { id: 'driver', health: 100, status: 'OK' },
    { id: 'gunner', health: 0, status: 'KIA' }
  ];
  const coverCandidates = [
    { id: 'cover-a', position: { x: -4, y: 0, z: 0 }, route: [{ x: -2, y: 0, z: 0 }, { x: -4, y: 0, z: 0 }] },
    { id: 'cover-b', position: { x: 4, y: 0, z: 0 }, route: [{ x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] }
  ];
  return {
    reason: 'VEHICLE_FIRE',
    policy: POLICY,
    crew: reverseCrew ? crew.reverse() : crew,
    exits: [
      {
        id: 'hatch',
        hatchPosition: { x: 0, y: 2, z: 0 },
        groundPosition: { x: 0, y: 0, z: 0 }
      }
    ],
    coverCandidates: reverseCover ? coverCandidates.reverse() : coverCandidates,
    fallbackDestinations: []
  };
}

function trigger(options) {
  return triggerVehicleCrewBailout(createVehicleCrewBailoutState(), plan(options));
}

test('bailout uses stable living-crew order, staggered hatch egress, and lazy exposure', () => {
  const forward = trigger();
  const reversed = trigger({ reverseCrew: true, reverseCover: true });
  assert.deepEqual(captureVehicleCrewBailoutState(reversed), captureVehicleCrewBailoutState(forward));
  assert.deepEqual(forward.actors.map(actor => actor.crewId), ['commander', 'driver']);
  assert.deepEqual(forward.actors.map(actor => actor.delaySeconds), [0, 0.25]);
  assert.equal(forward.actors.every(actor => actor.phase === 'WAITING'), true);
  assert.equal(forward.actors.every(actor => actor.exposed === false), true);

  const started = advanceVehicleCrewBailoutState(forward, 0.1);
  const actors = getActiveVehicleCrewBailoutActors(started);
  assert.equal(actors[0].phase, 'EGRESSING');
  assert.equal(actors[0].exposed, true);
  assert.equal(actors[0].mounted, false);
  assert.equal(actors[1].phase, 'WAITING');
  assert.equal(actors[1].exposed, false);
  assert.equal(actors[1].mounted, true);
});

test('whole-step, fine partition, and restored continuation reach byte-equivalent cover state', () => {
  const coarse = advanceVehicleCrewBailoutState(trigger(), 3.5);
  let fine = trigger();
  for (let index = 0; index < 35; index++) {
    fine = advanceVehicleCrewBailoutState(fine, 0.1);
  }
  assert.deepEqual(
    captureVehicleCrewBailoutState(fine),
    captureVehicleCrewBailoutState(coarse)
  );
  assert.equal(coarse.completed, true);
  assert.equal(coarse.actors.every(actor => actor.phase === 'COVER'), true);

  let restored = trigger();
  restored = advanceVehicleCrewBailoutState(restored, 0.65);
  restored = restoreVehicleCrewBailoutState(
    captureVehicleCrewBailoutState(restored)
  );
  restored = advanceVehicleCrewBailoutState(restored, 2.85);
  assert.deepEqual(
    captureVehicleCrewBailoutState(restored),
    captureVehicleCrewBailoutState(coarse)
  );
});

test('waiting and exposed crew remain casualty-eligible and never regain immunity', () => {
  const waiting = trigger();
  const waitingCasualty = applyVehicleCrewBailoutCasualty(waiting, 'driver');
  assert.equal(waitingCasualty.applied, true);
  assert.equal(
    waitingCasualty.state.actors.find(actor => actor.crewId === 'driver').phase,
    'KIA'
  );

  const exposed = advanceVehicleCrewBailoutState(waiting, 0.5);
  assert.equal(
    exposed.actors.find(actor => actor.crewId === 'commander').exposed,
    true
  );
  const exposedCasualty = applyVehicleCrewBailoutCasualty(exposed, 'commander');
  const continued = advanceVehicleCrewBailoutState(exposedCasualty.state, 10);
  assert.equal(
    continued.actors.find(actor => actor.crewId === 'commander').phase,
    'KIA'
  );
  assert.equal(continued.completed, true);
});

test('invalid or exhausted bailout plans reject safely without inventing actors', () => {
  const emptyCrew = triggerVehicleCrewBailout(createVehicleCrewBailoutState(), {
    ...plan(),
    crew: [{ id: 'dead', health: 0, status: 'KIA' }]
  });
  assert.equal(emptyCrew.triggered, false);
  assert.equal(emptyCrew.reason, 'NO_ELIGIBLE_CREW');
  assert.deepEqual(emptyCrew.actors, []);

  const noExit = triggerVehicleCrewBailout(createVehicleCrewBailoutState(), {
    ...plan(),
    exits: []
  });
  assert.equal(noExit.triggered, false);
  assert.equal(noExit.reason, 'NO_EXIT_POINTS');
  assert.deepEqual(noExit.actors, []);
});

test('unit bailout abandons commands, buttons the commander, and lazily creates only actor figures', () => {
  const tank = makeVehicle();
  const target = makeVehicle('SOMUA_S35', 'old-target');
  assert.equal(Object.keys(tank.mesh.userData.vehicleCrewFigures ?? {}).length, 0);
  tank.vehicleCrewPosture = 'UNBUTTONED';
  tank.addWaypoint(new THREE.Vector3(8, 0, 3));
  tank.targetUnit = target;
  tank.targetPos = target.position.clone();
  tank.targetMode = 'TARGET';
  tank.vehicleWeapon.targetUnitId = target.id;
  tank.vehicleWeapon.targetPos = target.position.toArray();
  tank.vehicleWeapon.isFiring = true;

  assert.equal(tank.triggerVehicleCrewBailout('VEHICLE_FIRE', FLAT_TERRAIN), true);
  assert.equal(tank.vehicleCrewPosture, 'BUTTONED');
  assert.equal(tank.canUnbuttonCommander(), false);
  assert.deepEqual(tank.waypoints, []);
  assert.equal(tank.targetUnit, null);
  assert.equal(tank.targetPos, null);
  assert.equal(tank.targetMode, null);
  assert.equal(tank.vehicleWeapon.targetUnitId, null);
  assert.equal(tank.vehicleWeapon.targetPos, null);
  assert.equal(tank.vehicleWeapon.isFiring, false);
  assert.equal(
    Object.keys(tank.mesh.userData.vehicleCrewFigures).length,
    tank.vehicleCrewBailout.actors.length
  );

  const saved = tank.captureState();
  tank.restoreState(saved, new Map([[tank.id, tank], [target.id, target]]));
  assert.equal(
    Object.keys(tank.mesh.userData.vehicleCrewFigures).length,
    tank.vehicleCrewBailout.actors.length,
    'restore must reuse figures instead of duplicating commander exposure'
  );
});

test('fire triggers bailout, while broken morale alone does not, and truck remount stays blocked', () => {
  const burning = makeVehicle('HOTCHKISS_H39', 'burning');
  burning.vehicleDamageState.burning = true;
  burning.updateVehicleSystems(0, FLAT_TERRAIN);
  assert.equal(burning.vehicleCrewBailout.triggered, true);
  assert.equal(burning.vehicleCrewBailout.reason, 'VEHICLE_FIRE');

  const routed = makeVehicle('SOMUA_S35', 'routed');
  routed.morale = 'Broken';
  routed.suppression = 90;
  routed.updateVehicleSystems(0, FLAT_TERRAIN);
  assert.equal(routed.vehicleCrewBailout.triggered, false);
  assert.equal(routed.getMountedCrew().length, routed.getLivingCrew().length);

  const truck = makeVehicle('LAFFLY_S20TL', 'truck');
  assert.equal(truck.triggerVehicleCrewBailout('VEHICLE_FIRE', FLAT_TERRAIN), true);
  assert.deepEqual(truck.remountTransportCrew(), {
    accepted: false,
    reason: 'CREW_BAILOUT_IN_PROGRESS'
  });
  assert.deepEqual(truck.dismountTransportCrew(), {
    accepted: false,
    reason: 'CREW_BAILOUT_IN_PROGRESS'
  });
});

test('swept fire hits exposed bailout bodies and HE damage follows distance falloff', () => {
  const tank = makeVehicle();
  tank.triggerVehicleCrewBailout('VEHICLE_FIRE', FLAT_TERRAIN);
  tank.advanceVehicleCrewBailout(20);
  const actors = tank.getDismountedVehicleCrewTargets();
  assert.equal(actors.length, tank.vehicleCrewBailout.actors.length);

  const sweptTarget = actors[0];
  const ballistics = new BallisticsSystem({
    getUnits: () => [tank]
  });
  const impact = ballistics.detectImpact({
    previousPosition: sweptTarget.position.clone().add(new THREE.Vector3(-2, 1.2, 0)),
    position: sweptTarget.position.clone().add(new THREE.Vector3(2, 1.2, 0)),
    distanceTravelled: 4,
    attacker: { faction: 'german' },
    targetUnit: tank,
    weapon: {},
    velocity: new THREE.Vector3(1, 0, 0)
  });
  assert.equal(impact?.kind, 'dismounted_vehicle_crew');
  assert.equal(String(impact?.agent?.id), String(sweptTarget.id));

  const healthBefore = new Map(tank.roster.map(crewman => [String(crewman.id), crewman.health]));
  const actorDistance = actors[0].position.distanceTo(actors[1].position);
  const casualties = tank.applyDismountedVehicleCrewBlast(
    actors[0].position,
    { explosiveRadius: actorDistance * 0.75, woundDamage: 120 },
    'test_he_blast'
  );
  assert.deepEqual(casualties.map(crewman => String(crewman.id)), [String(actors[0].id)]);
  assert.ok(
    tank.roster.find(crewman => String(crewman.id) === String(actors[0].id)).health
      < healthBefore.get(String(actors[0].id))
  );
  assert.equal(
    tank.roster.find(crewman => String(crewman.id) === String(actors[1].id)).health,
    healthBefore.get(String(actors[1].id))
  );
});
