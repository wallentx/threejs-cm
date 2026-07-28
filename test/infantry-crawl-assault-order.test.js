import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { FixedStepAccumulator } from '../src/simulation/FixedStepAccumulator.js';
import {
  InfantryBuddyBounds,
  INFANTRY_BUDDY_BOUND_MODEL
} from '../src/simulation/infantry/InfantryBuddyBounds.js';
import {
  ASSAULT_INFANTRY_MOVEMENT_PROFILE,
  CRAWL_INFANTRY_MOVEMENT_PROFILE,
  getInfantryMovementFormationOffset,
  getInfantryMovementOrderProfile,
  isInfantryOrderMovingFireProhibited,
  SNEAK_INFANTRY_MOVEMENT_PROFILE
} from '../src/simulation/infantry/InfantryMovementOrders.js';
import { WegoManager } from '../src/game/WegoManager.js';

const STEP_SECONDS = 1 / 30;
const flatTerrain = Object.freeze({
  getHeightAt() {
    return 0;
  },
  getMovementHeightAt() {
    return 0;
  }
});

function createSquad(id, faction = 'french', positionZ = 0) {
  return new Unit({
    id,
    faction,
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, positionZ),
    experience: 'Crack'
  });
}

function readyOrder(unit, orderType, destinationZ = 30) {
  unit.addWaypoint(new THREE.Vector3(0, 0, destinationZ), orderType);
  for (const agent of unit.soldierAI.agents) {
    agent.commandWaypoint = 0;
    agent.reactionDelay = 0;
    agent.fireCooldown = 0;
    agent.syncRecord();
  }
}

function roleBySoldier(unit) {
  return new Map(unit.soldierAI.agents.map(agent => [
    agent.id,
    agent.record.tacticalDecision?.boundRole ?? null
  ]));
}

test('CRAWL and ASSAULT are immutable, distinct first-order movement profiles', () => {
  assert.equal(
    getInfantryMovementOrderProfile('CRAWL'),
    CRAWL_INFANTRY_MOVEMENT_PROFILE
  );
  assert.equal(
    getInfantryMovementOrderProfile('ASSAULT'),
    ASSAULT_INFANTRY_MOVEMENT_PROFILE
  );
  for (const profile of [
    CRAWL_INFANTRY_MOVEMENT_PROFILE,
    ASSAULT_INFANTRY_MOVEMENT_PROFILE
  ]) {
    assert.equal(profile.dataQuality, 'gameplay-approximation');
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.individual), true);
    assert.equal(Object.isFrozen(profile.formation), true);
    assert.ok(
      profile.individual.speedMetersPerSecond
        > profile.anchorSpeedMetersPerSecond
    );
  }
  assert.equal(CRAWL_INFANTRY_MOVEMENT_PROFILE.individual.state, 'CRAWLING');
  assert.equal(CRAWL_INFANTRY_MOVEMENT_PROFILE.individual.stance, 'PRONE');
  assert.equal(
    ASSAULT_INFANTRY_MOVEMENT_PROFILE.individual.state,
    'ASSAULTING'
  );
  assert.equal(
    ASSAULT_INFANTRY_MOVEMENT_PROFILE.individual.stance,
    'CROUCHED'
  );
  assert.ok(
    CRAWL_INFANTRY_MOVEMENT_PROFILE.anchorSpeedMetersPerSecond
      < SNEAK_INFANTRY_MOVEMENT_PROFILE.anchorSpeedMetersPerSecond
  );
  assert.ok(
    ASSAULT_INFANTRY_MOVEMENT_PROFILE.anchorSpeedMetersPerSecond
      > SNEAK_INFANTRY_MOVEMENT_PROFILE.anchorSpeedMetersPerSecond
  );
  assert.notDeepEqual(
    getInfantryMovementFormationOffset('CRAWL', 1),
    getInfantryMovementFormationOffset('ASSAULT', 1)
  );
  assert.equal(isInfantryOrderMovingFireProhibited('CRAWLING'), true);
  assert.equal(isInfantryOrderMovingFireProhibited('ASSAULTING'), true);
});

test('CRAWL moves each soldier prone, projects the crawl pose, and blocks moving fire', () => {
  const squad = createSquad('crawl-individual');
  const target = createSquad('crawl-target', 'german', 20);
  const agent = squad.soldierAI.agents[0];
  const mesh = squad.mesh.userData.soldiers[0];
  agent.commandWaypoint = 0;
  agent.reactionDelay = 0;
  agent.magazineAmmo = 2;
  agent.reserveAmmo = 0;
  const start = agent.position.clone();

  agent.updateMovement(0.1, flatTerrain, {
    anchorMoving: true,
    goal: agent.position.clone().add(new THREE.Vector3(0, 0, 10)),
    neighbors: squad.soldierAI.agents,
    orderType: 'CRAWL',
    squadPinned: false,
    waypointIndex: 0
  });
  squad.soldierAI.applyPose(mesh, agent.record);

  assert.equal(agent.state, 'CRAWLING');
  assert.equal(agent.stance, 'PRONE');
  assert.ok(agent.position.distanceTo(start) > 0);
  assert.ok(
    agent.velocity.length()
      <= CRAWL_INFANTRY_MOVEMENT_PROFILE.individual.speedMetersPerSecond
  );
  assert.equal(mesh.userData.activePose, 'crawl');

  let shots = 0;
  assert.equal(agent.updateCombat(3, {
    opposingUnits: [target],
    spotting: {
      canPrecisionTarget: () => true,
      checkLOS: (from, to) => ({
        clear: true,
        dist: from.distanceTo(to)
      })
    },
    combat: {
      fireWeapon() {
        shots++;
        return true;
      }
    }
  }), false);
  assert.equal(shots, 0);
  assert.equal(squad.getReadyShooters().includes(agent), false);
});

test('the squad anchor consumes each authoritative movement-profile speed', () => {
  for (const [orderType, profile] of [
    ['CRAWL', CRAWL_INFANTRY_MOVEMENT_PROFILE],
    ['ASSAULT', ASSAULT_INFANTRY_MOVEMENT_PROFILE]
  ]) {
    const squad = createSquad(`anchor-${orderType.toLowerCase()}`);
    readyOrder(squad, orderType, 20);
    for (let step = 0; step < 30; step++) {
      squad.update(STEP_SECONDS, flatTerrain);
    }
    assert.ok(
      Math.abs(
        squad.position.z - profile.anchorSpeedMetersPerSecond
      ) < 1e-9,
      `${orderType} anchor advanced ${squad.position.z}`
    );
    assert.equal(squad.captureState().waypoints[0].orderType, orderType);
  }
});

test('ASSAULT creates target-independent paired bounds with kneeling coverers', () => {
  const squad = createSquad('assault-pairs');
  readyOrder(squad, 'ASSAULT');

  assert.equal(squad.reconcileBuddyBoundObservation(false), false);
  squad.update(STEP_SECONDS, flatTerrain, {
    hasDirectPrecisionObservation: false
  });

  const state = squad.infantryBuddyBounds.captureState();
  assert.equal(state.version, INFANTRY_BUDDY_BOUND_MODEL.version);
  assert.equal(state.mode, 'bounding');
  assert.equal(state.pairs.length, 3);
  const roles = roleBySoldier(squad);
  const movers = squad.soldierAI.agents.filter(
    agent => roles.get(agent.id) === 'mover'
  );
  const coverers = squad.soldierAI.agents.filter(
    agent => roles.get(agent.id) === 'coverer'
  );
  assert.equal(movers.length, 3);
  assert.equal(coverers.length, 3);
  assert.ok(movers.every(agent =>
    ['ASSAULTING', 'BOUNDING'].includes(agent.state)));
  assert.ok(movers.some(agent => agent.velocity.lengthSq() > 0));
  assert.ok(coverers.every(agent =>
    agent.state === 'COVERING'
      && agent.stance === 'KNEELING'
      && agent.velocity.lengthSq() === 0));
  assert.deepEqual(
    squad.getReadyShooters().map(agent => agent.id),
    coverers.map(agent => agent.id)
  );

  assert.equal(squad.reconcileBuddyBoundObservation(false), false);
  assert.equal(squad.infantryBuddyBounds.captureState().mode, 'bounding');
});

test('ASSAULT permits only the current coverer to fire while a buddy moves', () => {
  const squad = createSquad('assault-fire');
  const target = createSquad('assault-fire-target', 'german', 24);
  squad.targetUnit = target;
  readyOrder(squad, 'ASSAULT', 35);
  const acceptedShots = [];
  const combatContext = {
    opposingUnits: [target],
    spotting: {
      canPrecisionTarget: () => true,
      checkLOS: (from, to) => ({
        clear: true,
        dist: from.distanceTo(to)
      })
    },
    buildingInteraction: {
      canFireAt: () => true
    },
    combat: {
      fireWeapon(unit, targetUnit, targetPosition, options) {
        acceptedShots.push({
          shooterId: options.shooter.id,
          role: options.shooter.record.tacticalDecision.boundRole
        });
        return true;
      }
    }
  };

  for (let step = 0; step < 300 && acceptedShots.length === 0; step++) {
    squad.update(STEP_SECONDS, flatTerrain, {
      hasDirectPrecisionObservation: true
    });
    squad.updateIndividualCombat(STEP_SECONDS, combatContext);
  }

  assert.ok(acceptedShots.length > 0, 'an ASSAULT coverer must fire');
  assert.ok(acceptedShots.every(shot => shot.role === 'coverer'));
  const roles = roleBySoldier(squad);
  assert.ok(
    squad.soldierAI.agents
      .filter(agent => roles.get(agent.id) === 'mover')
      .every(agent => agent.roundsFired === 0)
  );
});

test('mid-ASSAULT capture, restore, and replay are byte-identical', () => {
  const squad = createSquad('assault-rollback');
  readyOrder(squad, 'ASSAULT', 40);
  for (let step = 0; step < 75; step++) {
    squad.update(STEP_SECONDS, flatTerrain);
  }
  const snapshot = squad.captureState();

  for (let step = 0; step < 90; step++) {
    squad.update(STEP_SECONDS, flatTerrain);
  }
  const expected = squad.captureState();

  squad.restoreState(snapshot, new Map([[squad.id, squad]]));
  for (let step = 0; step < 90; step++) {
    squad.update(STEP_SECONDS, flatTerrain);
  }
  assert.deepEqual(squad.captureState(), expected);
});

test('legacy QUICK buddy-bound state migrates to the generalized version', () => {
  const coordinator = new InfantryBuddyBounds();
  coordinator.update({
    active: true,
    waypointKey: '0:QUICK:10:0:0',
    members: [
      { id: 'a', x: 0, z: 0, goalX: 10, goalZ: 0 },
      { id: 'b', x: 0, z: 1, goalX: 10, goalZ: 1 }
    ]
  });
  const legacy = coordinator.captureState();
  legacy.version = 1;
  legacy.approximationLabel =
    'first-order gameplay approximation for known-target QUICK buddy bounds';

  const migrated = new InfantryBuddyBounds(legacy).captureState();
  assert.equal(migrated.version, INFANTRY_BUDDY_BOUND_MODEL.version);
  assert.equal(
    migrated.approximationLabel,
    INFANTRY_BUDDY_BOUND_MODEL.approximationLabel
  );
  assert.deepEqual(migrated.pairs, legacy.pairs);
});

function runMode(mode, frameBudgets) {
  const squad = createSquad('assault-mode');
  readyOrder(squad, 'ASSAULT', 45);
  const game = {
    units: [squad],
    captureSimulationState() {
      return squad.captureState();
    },
    restoreSimulationState(state) {
      squad.restoreState(state, new Map([[squad.id, squad]]));
    },
    simulateToTime() {},
    beginMatch() {}
  };
  const wego = new WegoManager(game);
  if (mode === 'realtime') wego.setPlayMode('realtime');
  else wego.executeTurn();
  const fixedStep = new FixedStepAccumulator(STEP_SECONDS);
  for (const budget of frameBudgets) {
    fixedStep.advance(budget, delta => {
      squad.update(
        wego.getSimulationDelta(delta),
        flatTerrain
      );
    });
  }
  return squad.captureState();
}

test('ASSAULT uses the same fixed-step mechanic in WEGO and realtime', () => {
  const variableFrames = [
    0.011, 0.022, 0.017, 0.05,
    0.007, 0.013, 0.041, 0.039
  ];
  const groupedFrames = [0.1, 0.1];
  assert.deepEqual(
    runMode('wego', variableFrames),
    runMode('wego', groupedFrames)
  );
  assert.deepEqual(
    runMode('realtime', variableFrames),
    runMode('wego', groupedFrames)
  );
});
