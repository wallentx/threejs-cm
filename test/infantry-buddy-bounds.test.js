import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';
import { GameApp } from '../src/app/GameApp.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { FixedStepAccumulator } from '../src/simulation/FixedStepAccumulator.js';
import { InfantrySeparationSystem } from '../src/simulation/infantry/InfantrySeparationSystem.js';
import {
  INFANTRY_BUDDY_BOUND_MODEL,
  InfantryBuddyBounds
} from '../src/simulation/infantry/InfantryBuddyBounds.js';
import { StaticCollisionWorld } from '../src/simulation/collision/StaticCollisionWorld.js';
import { WegoManager } from '../src/game/WegoManager.js';

const STEP_SECONDS = 1 / 30;

function createTerrain(collisionWorld = null) {
  return {
    bocageObstacles: [],
    collisionWorld,
    getHeightAt() {
      return 0;
    },
    getMovementHeightAt() {
      return 0;
    }
  };
}

function prepareSquad(id, options = {}) {
  const squad = new Unit({
    id,
    faction: options.faction ?? 'french',
    type: 'infantry_squad',
    position: options.position ?? new THREE.Vector3(),
    squadSize: options.squadSize ?? 6,
    ...(options.roster ? { roster: options.roster } : {}),
    experience: options.experience ?? 'Crack'
  });
  for (const agent of squad.soldierAI.agents) {
    agent.reactionDelay = 0;
    agent.fireCooldown = 0;
    agent.syncRecord();
  }
  return squad;
}

function prepareTarget(id = 'buddy-bound-target', positionZ = 24) {
  return prepareSquad(id, {
    faction: 'german',
    squadSize: 2,
    position: new THREE.Vector3(0, 0, positionZ)
  });
}

function activateBounds(squad, target, destinationZ = 40, orderType = 'QUICK') {
  squad.targetUnit = target;
  squad.addWaypoint(new THREE.Vector3(0, 0, destinationZ), orderType);
  for (const agent of squad.soldierAI.agents) {
    agent.commandWaypoint = squad.currentWaypointIndex;
    agent.reactionDelay = 0;
    agent.syncRecord();
  }
}

function updateSquad(
  squad,
  delta,
  terrain,
  hasDirectPrecisionObservation = true
) {
  squad.update(delta, terrain, { hasDirectPrecisionObservation });
}

function roleMap(squad) {
  return new Map(squad.soldierAI.agents.map(agent => [
    agent.id,
    agent.record.tacticalDecision?.boundRole ?? null
  ]));
}

function compactPairState(squad) {
  const state = squad.infantryBuddyBounds.captureState();
  return state.pairs.map(pair => ({
    pairId: pair.pairId,
    memberIds: [...pair.memberIds],
    moverId: pair.moverId,
    covererId: pair.covererId
  }));
}

function combatContext(combat, target, precisionAllowed = true) {
  return {
    opposingUnits: [target],
    spotting: {
      canPrecisionTarget() {
        return precisionAllowed;
      },
      checkLOS(from, to) {
        return {
          clear: true,
          dist: from.distanceTo(to)
        };
      }
    },
    combat,
    buildingInteraction: {
      canFireAt() {
        return true;
      }
    }
  };
}

test('GameApp passes only the current direct precision-observation boolean', () => {
  const target = { id: 'game-app-observed-target' };
  let precisionAllowed = false;
  let receivedOptions = null;
  const unit = {
    id: 'game-app-observer',
    faction: 'french',
    position: { x: 0, z: 0 },
    waypoints: [{ orderType: 'QUICK' }],
    currentWaypointIndex: 0,
    targetUnit: target,
    update(delta, terrain, options) {
      assert.equal(delta, STEP_SECONDS);
      assert.equal(terrain, app.terrain);
      receivedOptions = options;
    },
    soldierAI: null
  };
  const app = Object.assign(Object.create(GameApp.prototype), {
    movedUnitIds: new Set(),
    units: [unit],
    factionOrder: [],
    factionRoster: {
      opposingUnitsFor() {
        return [];
      },
      unitsFor() {
        return [];
      }
    },
    spotting: {
      canPrecisionTarget(observer, observed) {
        assert.equal(observer, unit);
        assert.equal(observed, target);
        return precisionAllowed;
      },
      advance() {}
    },
    infantrySeparation: null,
    buildingInteraction: {
      advance() {}
    },
    syncBuildingInteriorPresentation() {},
    terrain: {},
    combat: {
      update() {}
    },
    support: {
      update() {}
    }
  });

  app.simulateStep(STEP_SECONDS);
  assert.deepEqual(receivedOptions, {
    haltMovement: false,
    hasDirectPrecisionObservation: false
  });
  precisionAllowed = true;
  app.simulateStep(STEP_SECONDS);
  assert.deepEqual(receivedOptions, {
    haltMovement: false,
    hasDirectPrecisionObservation: true
  });
});

test('GameApp clears same-step observation loss before combat', () => {
  const terrain = createTerrain();
  const squad = prepareSquad('buddy-bound-same-step-loss', {
    squadSize: 2
  });
  const target = prepareTarget('buddy-bound-same-step-target');
  activateBounds(squad, target);
  updateSquad(squad, STEP_SECONDS, terrain);
  assert.equal(squad.infantryBuddyBounds.captureState().mode, 'bounding');
  assert.deepEqual(
    [...roleMap(squad).values()].sort(),
    ['coverer', 'mover']
  );

  let precisionAllowed = true;
  let observationPhase = 'before-advance';
  let advanceCalls = 0;
  let preAdvancePrecisionChecks = 0;
  let postAdvancePrecisionChecks = 0;
  let combatPrecisionChecks = 0;
  let combatCalls = 0;
  let acceptedFireAttempts = 0;
  const originalUpdateIndividualCombat =
    squad.updateIndividualCombat.bind(squad);
  squad.updateIndividualCombat = (delta, context) => {
    combatCalls++;
    assert.equal(observationPhase, 'after-advance');
    assert.equal(
      squad.infantryBuddyBounds.captureState().mode,
      'inactive'
    );
    for (const soldier of squad.roster) {
      assert.deepEqual(
        [
          soldier.tacticalDecision.buddyId,
          soldier.tacticalDecision.boundPairId,
          soldier.tacticalDecision.boundRole,
          soldier.tacticalDecision.boundSequence
        ],
        [null, null, null, null]
      );
    }
    const precisionChecksBeforeCombat = postAdvancePrecisionChecks;
    const result = originalUpdateIndividualCombat(delta, context);
    combatPrecisionChecks +=
      postAdvancePrecisionChecks - precisionChecksBeforeCombat;
    return result;
  };

  const ammunitionBefore = squad.roster.map(soldier => [
    soldier.magazineAmmo,
    soldier.reserveAmmo,
    soldier.roundsFired
  ]);
  const app = Object.assign(Object.create(GameApp.prototype), {
    movedUnitIds: new Set(),
    units: [squad],
    factionOrder: ['french'],
    factionRoster: {
      opposingUnitsFor() {
        return [target];
      },
      unitsFor() {
        return [squad];
      }
    },
    spotting: {
      canPrecisionTarget(observer, observed) {
        assert.equal(observer, squad);
        assert.equal(observed, target);
        if (observationPhase === 'before-advance') {
          preAdvancePrecisionChecks++;
        } else {
          postAdvancePrecisionChecks++;
        }
        return precisionAllowed;
      },
      advance(units, delta) {
        assert.equal(units, app.units);
        assert.equal(delta, STEP_SECONDS);
        advanceCalls++;
        precisionAllowed = false;
        observationPhase = 'after-advance';
      },
      checkLOS(from, to) {
        return {
          clear: true,
          dist: from.distanceTo(to)
        };
      }
    },
    infantrySeparation: null,
    buildingInteraction: {
      advance() {},
      canFireAt() {
        return true;
      }
    },
    syncBuildingInteriorPresentation() {},
    terrain,
    combat: {
      fireWeapon() {
        acceptedFireAttempts++;
        return true;
      },
      update() {}
    },
    support: {
      update() {}
    },
    random() {
      return 0.5;
    }
  });

  app.simulateStep(STEP_SECONDS);

  assert.equal(advanceCalls, 1);
  assert.equal(preAdvancePrecisionChecks, 1);
  assert.ok(postAdvancePrecisionChecks > 1);
  assert.ok(combatPrecisionChecks > 0);
  assert.equal(combatCalls, 1);
  assert.equal(acceptedFireAttempts, 0);
  assert.deepEqual(
    squad.roster.map(soldier => [
      soldier.magazineAmmo,
      soldier.reserveAmmo,
      soldier.roundsFired
    ]),
    ammunitionBefore
  );
});

test('known-target QUICK pairs expose genuine covering fire while buddies move', () => {
  const terrain = createTerrain();
  const squad = prepareSquad('buddy-bound-live-fire');
  const target = prepareTarget('buddy-bound-live-target');
  activateBounds(squad, target);

  updateSquad(squad, STEP_SECONDS, terrain);
  updateSquad(squad, STEP_SECONDS, terrain);
  const initialRoles = roleMap(squad);
  const movers = squad.soldierAI.agents.filter(agent =>
    initialRoles.get(agent.id) === 'mover');
  const coverers = squad.soldierAI.agents.filter(agent =>
    initialRoles.get(agent.id) === 'coverer');
  assert.equal(movers.length, 3);
  assert.equal(coverers.length, 3);
  assert.ok(movers.every(agent =>
    ['MOVING', 'BOUNDING'].includes(agent.state)));
  assert.ok(movers.some(agent => agent.velocity.lengthSq() > 0));
  assert.ok(coverers.every(agent =>
    agent.state === 'COVERING' && agent.velocity.lengthSq() === 0));
  assert.deepEqual(
    squad.getReadyShooters().map(agent => agent.id),
    coverers.map(agent => agent.id)
  );

  const combat = new CombatSystem(
    new THREE.Scene(),
    {
      playGunshot() {},
      playCannon() {},
      playExplosion() {}
    },
    () => 0.5,
    {
      getUnits: () => [squad, target],
      vfxProvider: TEST_VFX_PROVIDER
    }
  );
  const acceptedShots = [];
  for (let step = 0; step < 180 && acceptedShots.length === 0; step++) {
    updateSquad(squad, STEP_SECONDS, terrain);
    const rolesAtFire = roleMap(squad);
    const projectileCount = combat.projectiles.length;
    const ammunitionBefore = new Map(
      squad.soldierAI.agents.map(agent => [agent.id, agent.magazineAmmo])
    );
    squad.updateIndividualCombat(
      STEP_SECONDS,
      combatContext(combat, target)
    );
    for (const projectile of combat.projectiles.slice(projectileCount)) {
      acceptedShots.push({
        projectile,
        role: rolesAtFire.get(projectile.shooterId),
        ammunitionBefore: ammunitionBefore.get(projectile.shooterId)
      });
    }
  }

  assert.ok(acceptedShots.length > 0, 'a real covering weapon must fire');
  for (const shot of acceptedShots) {
    assert.equal(shot.role, 'coverer');
    const shooter = squad.soldierAI.agents.find(agent =>
      agent.id === shot.projectile.shooterId);
    assert.ok(shooter);
    assert.ok(shooter.magazineAmmo < shot.ammunitionBefore);
    const state = squad.infantryBuddyBounds.captureState();
    const pair = state.pairs.find(candidate =>
      candidate.memberIds.includes(shooter.id));
    const mover = squad.soldierAI.agents.find(agent =>
      agent.id === pair.moverId);
    assert.ok(
      ['MOVING', 'BOUNDING', 'REACTING'].includes(mover.state),
      `${mover.id} must remain the moving buddy while ${shooter.id} fires`
    );
  }
});

test('direct precision-observation loss clears roles and rejects combat fire', () => {
  const terrain = createTerrain();
  const squad = prepareSquad('buddy-bound-observation-loss', {
    squadSize: 2
  });
  const target = prepareTarget('buddy-bound-observation-target');
  activateBounds(squad, target);
  updateSquad(squad, STEP_SECONDS, terrain);
  updateSquad(squad, STEP_SECONDS, terrain);
  assert.equal(squad.infantryBuddyBounds.captureState().mode, 'bounding');
  assert.deepEqual(
    [...roleMap(squad).values()].sort(),
    ['coverer', 'mover']
  );

  const combat = new CombatSystem(
    new THREE.Scene(),
    {
      playGunshot() {},
      playCannon() {},
      playExplosion() {}
    },
    () => 0.5,
    {
      getUnits: () => [squad, target],
      vfxProvider: TEST_VFX_PROVIDER
    }
  );
  const ammunitionBefore = squad.roster.map(soldier =>
    soldier.magazineAmmo + soldier.reserveAmmo);
  const deniedCombat = combatContext(combat, target, false);
  for (let step = 0; step < 120; step++) {
    squad.updateIndividualCombat(STEP_SECONDS, deniedCombat);
  }
  assert.equal(combat.projectiles.length, 0);
  assert.deepEqual(
    squad.roster.map(soldier =>
      soldier.magazineAmmo + soldier.reserveAmmo),
    ammunitionBefore
  );

  updateSquad(squad, 0, terrain, false);
  assert.equal(squad.infantryBuddyBounds.captureState().mode, 'inactive');
  assert.ok(squad.roster.every(soldier =>
    soldier.tacticalDecision.boundRole === null));
});

test('roles swap at the exact six-metre boundary and ignore roster insertion order', () => {
  const terrain = createTerrain();
  const target = prepareTarget('buddy-bound-boundary-target', 60);
  const squad = prepareSquad('buddy-bound-boundary', { squadSize: 2 });
  activateBounds(squad, target, 50);
  updateSquad(squad, 0, terrain);

  const initial = squad.infantryBuddyBounds.captureState();
  const pair = initial.pairs[0];
  const mover = squad.soldierAI.agents.find(agent =>
    agent.id === pair.moverId);
  mover.position.set(
    pair.moverStart[0]
      + INFANTRY_BUDDY_BOUND_MODEL.boundDistanceMeters
      - 0.001,
    0,
    pair.moverStart[1]
  );
  mover.syncRecord();
  updateSquad(squad, 0, terrain);
  assert.equal(
    squad.infantryBuddyBounds.captureState().pairs[0].moverId,
    pair.moverId
  );

  mover.position.x = pair.moverStart[0]
    + INFANTRY_BUDDY_BOUND_MODEL.boundDistanceMeters;
  mover.syncRecord();
  updateSquad(squad, 0, terrain);
  const swapped = squad.infantryBuddyBounds.captureState();
  assert.equal(swapped.pairs[0].moverId, pair.covererId);
  assert.equal(swapped.pairs[0].covererId, pair.moverId);
  assert.equal(swapped.sequence, 1);
  assert.deepEqual(
    [...roleMap(squad).values()].sort(),
    ['coverer', 'mover']
  );

  const goalCoordinator = new InfantryBuddyBounds();
  const goalMembers = [
    { id: 0, x: 0, z: 0, goalX: 0.19, goalZ: 0 },
    { id: 1, x: 0, z: 1, goalX: 0.19, goalZ: 1 }
  ];
  goalCoordinator.update({
    active: true,
    waypointKey: '0:QUICK:0.19:0:0',
    members: goalMembers
  });
  goalCoordinator.update({
    active: true,
    waypointKey: '0:QUICK:0.19:0:0',
    members: goalMembers
  });
  assert.equal(goalCoordinator.captureState().pairs[0].moverId, 0);
  assert.equal(goalCoordinator.captureState().sequence, 0);

  goalMembers[0].x = 0.02;
  goalCoordinator.update({
    active: true,
    waypointKey: '0:QUICK:0.19:0:0',
    members: goalMembers
  });
  assert.equal(goalCoordinator.captureState().pairs[0].moverId, 1);
  assert.equal(goalCoordinator.captureState().sequence, 1);
  goalCoordinator.update({
    active: true,
    waypointKey: '0:QUICK:0.19:0:0',
    members: goalMembers
  });
  assert.equal(goalCoordinator.captureState().sequence, 1);

  const idleAtGoal = new InfantryBuddyBounds();
  const idleMembers = [
    { id: 0, x: 0, z: 0, goalX: 0, goalZ: 0 },
    { id: 1, x: 0, z: 1, goalX: 0, goalZ: 1 }
  ];
  idleAtGoal.update({
    active: true,
    waypointKey: '0:QUICK:0:0:0',
    members: idleMembers
  });
  idleAtGoal.update({
    active: true,
    waypointKey: '0:QUICK:0:0:0',
    members: idleMembers
  });
  assert.equal(idleAtGoal.captureState().sequence, 0);
  assert.equal(idleAtGoal.captureState().pairs[0].moverId, 0);

  const rosterSource = prepareSquad('buddy-bound-roster-source');
  const plainRoster = rosterSource.roster.map(soldier => ({
    id: soldier.id,
    name: soldier.name,
    role: soldier.role,
    weaponId: soldier.weaponId,
    weapon: soldier.weapon,
    status: 'OK',
    health: 100
  }));
  const forward = prepareSquad('buddy-bound-order-stable', {
    roster: plainRoster
  });
  const reversed = prepareSquad('buddy-bound-order-stable', {
    roster: [...plainRoster].reverse()
  });
  const forwardTarget = prepareTarget('buddy-bound-order-target');
  const reversedTarget = prepareTarget('buddy-bound-order-target');
  activateBounds(forward, forwardTarget);
  activateBounds(reversed, reversedTarget);
  updateSquad(forward, 0, terrain);
  updateSquad(reversed, 0, terrain);
  assert.deepEqual(compactPairState(reversed), compactPairState(forward));
});

test('clear and identical reissue cannot retain a prior bound sequence', () => {
  const terrain = createTerrain();
  const target = prepareTarget('buddy-bound-reissue-target', 60);
  const destination = new THREE.Vector3(0, 0, 50);
  const squad = prepareSquad('buddy-bound-reissue', { squadSize: 2 });
  activateBounds(squad, target, destination.z);
  updateSquad(squad, 0, terrain);

  const initial = squad.infantryBuddyBounds.captureState();
  const initialPair = initial.pairs[0];
  const mover = squad.soldierAI.agents.find(agent =>
    agent.id === initialPair.moverId);
  mover.position.x = initialPair.moverStart[0]
    + INFANTRY_BUDDY_BOUND_MODEL.boundDistanceMeters;
  mover.syncRecord();
  updateSquad(squad, 0, terrain);
  assert.equal(squad.infantryBuddyBounds.captureState().sequence, 1);

  squad.clearWaypoints();
  assert.equal(squad.infantryBuddyBounds.captureState().mode, 'inactive');
  squad.addWaypoint(destination, 'QUICK');
  updateSquad(squad, 0, terrain);
  const reissued = squad.infantryBuddyBounds.captureState();
  assert.equal(reissued.sequence, 0);
  assert.equal(reissued.pairs[0].moverId, initialPair.memberIds[0]);
  assert.deepEqual(
    reissued.pairs[0].moverStart,
    [
      squad.soldierAI.agents.find(agent =>
        agent.id === reissued.pairs[0].moverId).position.x,
      squad.soldierAI.agents.find(agent =>
        agent.id === reissued.pairs[0].moverId).position.z
    ]
  );

  squad.currentWaypointIndex = squad.waypoints.length;
  squad.addWaypoint(destination, 'QUICK');
  assert.equal(squad.infantryBuddyBounds.captureState().mode, 'inactive');
  updateSquad(squad, 0, terrain);
  assert.equal(squad.infantryBuddyBounds.captureState().sequence, 0);

  squad.currentWaypointIndex = 1;
  squad.pruneCompletedWaypoints();
  assert.equal(squad.infantryBuddyBounds.captureState().mode, 'inactive');
});

test('final reform completes the waypoint without retaining bound authority', () => {
  const terrain = createTerrain();
  const squad = prepareSquad('buddy-bound-reform');
  const target = prepareTarget('buddy-bound-reform-target');
  activateBounds(squad, target, 8);

  let sawReform = false;
  for (let step = 0; step < 600 && squad.currentWaypointIndex === 0; step++) {
    updateSquad(squad, STEP_SECONDS, terrain);
    sawReform ||= squad.infantryBuddyBounds.captureState().mode === 'reform';
  }
  assert.equal(sawReform, true);
  assert.equal(squad.currentWaypointIndex, 1);
  updateSquad(squad, STEP_SECONDS, terrain);
  assert.deepEqual(squad.infantryBuddyBounds.captureState(), {
    version: INFANTRY_BUDDY_BOUND_MODEL.version,
    approximationLabel:
      INFANTRY_BUDDY_BOUND_MODEL.approximationLabel,
    activeWaypointKey: null,
    mode: 'inactive',
    sequence: 0,
    pairs: []
  });
  assert.equal(squad.areLivingInfantryAtFormation('QUICK'), true);
});

test('target, order, transit, queue, and unavailable-member gates are authoritative', () => {
  const terrain = createTerrain();
  const target = prepareTarget('buddy-bound-gates-target');

  const noTarget = prepareSquad('buddy-bound-no-target');
  noTarget.addWaypoint(new THREE.Vector3(0, 0, 30), 'QUICK');
  updateSquad(noTarget, STEP_SECONDS, terrain);
  assert.equal(noTarget.infantryBuddyBounds.captureState().mode, 'inactive');
  assert.ok(noTarget.roster.every(soldier =>
    soldier.tacticalDecision.boundRole === null));

  const wrongOrder = prepareSquad('buddy-bound-wrong-order');
  activateBounds(wrongOrder, target, 30, 'MOVE');
  updateSquad(wrongOrder, STEP_SECONDS, terrain);
  assert.equal(wrongOrder.infantryBuddyBounds.captureState().mode, 'inactive');

  const transit = prepareSquad('buddy-bound-transit');
  activateBounds(transit, target);
  transit.soldierAI.agents[0].buildingLocation = {
    phase: 'transit',
    buildingId: 'test-building'
  };
  transit.soldierAI.agents[0].syncRecord();
  updateSquad(transit, STEP_SECONDS, terrain);
  assert.equal(transit.infantryBuddyBounds.captureState().mode, 'inactive');

  const completed = prepareSquad('buddy-bound-completed');
  activateBounds(completed, target);
  completed.currentWaypointIndex = completed.waypoints.length;
  updateSquad(completed, STEP_SECONDS, terrain);
  assert.equal(completed.infantryBuddyBounds.captureState().mode, 'inactive');

  const targetLoss = prepareSquad('buddy-bound-target-loss');
  const doomedTarget = prepareTarget('buddy-bound-doomed-target');
  activateBounds(targetLoss, doomedTarget);
  updateSquad(targetLoss, STEP_SECONDS, terrain);
  assert.equal(targetLoss.infantryBuddyBounds.captureState().mode, 'bounding');
  for (const agent of doomedTarget.soldierAI.agents) {
    agent.applyDamage(120, 0);
  }
  updateSquad(targetLoss, STEP_SECONDS, terrain);
  assert.equal(targetLoss.infantryBuddyBounds.captureState().mode, 'inactive');
  assert.ok(targetLoss.roster.every(soldier =>
    soldier.tacticalDecision.boundRole === null));

  const unavailable = prepareSquad('buddy-bound-unavailable');
  activateBounds(unavailable, target);
  const agents = unavailable.soldierAI.agents;
  agents[0].applyDamage(120, 0);
  agents[1].status = 'INCAPACITATED';
  agents[1].health = 25;
  agents[1].syncRecord();
  agents[2].reloadTimer = 1;
  agents[2].syncRecord();
  agents[3].suppression = 80;
  agents[3].syncRecord();
  const currentLivingCount = unavailable.soldierAI.getLivingAgents().length;
  for (const agent of agents) {
    agent.record.knownLivingCount = currentLivingCount;
    agent.record.casualtyResponseTimer = 0;
    agent.syncRecord();
  }
  updateSquad(unavailable, STEP_SECONDS, terrain);
  assert.deepEqual(
    unavailable.infantryBuddyBounds.captureState().pairs.map(pair =>
      pair.memberIds),
    [[4, 5]]
  );
  for (const id of [0, 1, 2, 3]) {
    assert.equal(
      unavailable.soldierAI.agents[id].record.tacticalDecision.boundRole,
      null
    );
  }
  assert.equal(agents[5].state, 'COVERING');

  agents[4].record.casualtyResponseTimer = 0;
  agents[4].record.knownLivingCount =
    unavailable.soldierAI.getLivingAgents().length;
  agents[5].reloadTimer = 1;
  agents[5].record.casualtyResponseTimer = 0;
  agents[5].record.knownLivingCount =
    unavailable.soldierAI.getLivingAgents().length;
  agents[4].syncRecord();
  agents[5].syncRecord();
  updateSquad(unavailable, STEP_SECONDS, terrain);
  assert.equal(
    agents[4].record.tacticalDecision.boundRole,
    'unpaired'
  );
  assert.notEqual(agents[4].state, 'COVERING');
  assert.equal(
    unavailable.infantryBuddyBounds.captureState().pairs.length,
    0
  );

  const availableRounds = agents[4].magazineAmmo;
  agents[4].magazineAmmo = 0;
  agents[5].reloadTimer = 0;
  agents[4].syncRecord();
  agents[5].syncRecord();
  updateSquad(unavailable, STEP_SECONDS, terrain);
  assert.equal(agents[4].record.tacticalDecision.boundRole, null);
  assert.equal(agents[5].record.tacticalDecision.boundRole, 'unpaired');

  agents[4].magazineAmmo = availableRounds;
  agents[5].threatMemory.record({
    eventId: 'buddy-bound-recent-threat',
    threatPosition: [0, 0, 30],
    impactPosition: [0, 0, 0],
    intensity: 1
  });
  agents[4].syncRecord();
  agents[5].syncRecord();
  updateSquad(unavailable, STEP_SECONDS, terrain);
  assert.equal(agents[4].record.tacticalDecision.boundRole, 'unpaired');
  assert.equal(agents[5].record.tacticalDecision.boundRole, null);
});

test('static collision and post-movement separation remain downstream authority', () => {
  const wall = {
    id: 'buddy-bound-wall',
    type: 'stonewall',
    centerX: 0,
    centerZ: 0,
    halfX: 20,
    halfZ: 0.2,
    blocks: ['infantry']
  };
  const collisionWorld = new StaticCollisionWorld([wall]);
  const terrain = createTerrain(collisionWorld);
  const squad = prepareSquad('buddy-bound-collision', {
    squadSize: 2,
    position: new THREE.Vector3(0, 0, -5)
  });
  const target = prepareTarget('buddy-bound-collision-target', 20);
  squad.bindCollisionWorld(collisionWorld);
  activateBounds(squad, target, 10);
  for (let step = 0; step < 180; step++) {
    updateSquad(squad, STEP_SECONDS, terrain);
  }
  for (const agent of squad.soldierAI.getLivingAgents()) {
    assert.ok(
      agent.position.z <= -wall.halfZ - squad.collisionRadius + 1e-4,
      `${agent.id} crossed the static wall at ${agent.position.z}`
    );
  }

  const [first, second] = squad.soldierAI.agents;
  first.position.set(0, 0, -1);
  second.position.copy(first.position);
  first.syncRecord();
  second.syncRecord();
  const separation = new InfantrySeparationSystem().resolve([squad], terrain);
  assert.ok(separation.correctedSoldierKeys.length > 0);
  assert.ok(
    first.position.distanceTo(second.position)
      >= squad.collisionRadius * 2 - 0.00002
  );
  assert.ok(first.position.z < -wall.halfZ - squad.collisionRadius);
  assert.ok(second.position.z < -wall.halfZ - squad.collisionRadius);
});

test('mid-bound capture restores deeply and replays byte-identically', () => {
  const terrain = createTerrain();
  const squad = prepareSquad('buddy-bound-replay');
  const target = prepareTarget('buddy-bound-replay-target', 50);
  activateBounds(squad, target, 45);
  for (let step = 0; step < 45; step++) {
    updateSquad(squad, STEP_SECONDS, terrain);
  }

  const snapshot = squad.captureState();
  const capturedStart =
    snapshot.infantryBuddyBounds.pairs[0].moverStart[0];
  squad.infantryBuddyBounds.state.pairs[0].moverStart[0] += 99;
  assert.equal(
    snapshot.infantryBuddyBounds.pairs[0].moverStart[0],
    capturedStart,
    'capture must not alias live coordinator state'
  );
  squad.restoreState(snapshot, new Map([
    [squad.id, squad],
    [target.id, target]
  ]));
  assert.deepEqual(squad.captureState(), snapshot);

  const unavailableSubset = structuredClone(snapshot);
  unavailableSubset.infantryBuddyBounds.pairs =
    unavailableSubset.infantryBuddyBounds.pairs.slice(0, 1);
  squad.restoreState(unavailableSubset, new Map([
    [squad.id, squad],
    [target.id, target]
  ]));
  assert.equal(
    squad.infantryBuddyBounds.captureState().pairs.length,
    1
  );
  squad.restoreState(snapshot, new Map([
    [squad.id, squad],
    [target.id, target]
  ]));

  for (let step = 0; step < 75; step++) {
    updateSquad(squad, STEP_SECONDS, terrain);
  }
  const expected = squad.captureState();
  squad.restoreState(snapshot, new Map([
    [squad.id, squad],
    [target.id, target]
  ]));
  for (let step = 0; step < 75; step++) {
    updateSquad(squad, STEP_SECONDS, terrain);
  }
  assert.deepEqual(squad.captureState(), expected);

  const legacyNull = structuredClone(snapshot);
  legacyNull.infantryBuddyBounds = null;
  squad.restoreState(legacyNull, new Map([
    [squad.id, squad],
    [target.id, target]
  ]));
  assert.equal(squad.infantryBuddyBounds.captureState().mode, 'inactive');

  const legacyMissing = structuredClone(snapshot);
  delete legacyMissing.infantryBuddyBounds;
  squad.restoreState(legacyMissing, new Map([
    [squad.id, squad],
    [target.id, target]
  ]));
  assert.equal(squad.infantryBuddyBounds.captureState().mode, 'inactive');

  const absentCoordinator = new InfantryBuddyBounds();
  absentCoordinator.update({
    active: true,
    waypointKey: snapshot.infantryBuddyBounds.activeWaypointKey,
    members: [
      { id: snapshot.roster[0].id, x: 0, z: 0, goalX: 10, goalZ: 0 },
      {
        id: 'absent-restored-soldier',
        x: 0,
        z: 1,
        goalX: 10,
        goalZ: 1
      }
    ]
  });
  const absentMember = structuredClone(snapshot);
  absentMember.infantryBuddyBounds = absentCoordinator.captureState();
  const beforeRejectedRestore = squad.captureState();
  assert.throws(
    () => squad.restoreState(absentMember, new Map([
      [squad.id, squad],
      [target.id, target]
    ])),
    /absent from restored roster/
  );
  assert.deepEqual(squad.captureState(), beforeRejectedRestore);

  const invalid = structuredClone(snapshot);
  invalid.infantryBuddyBounds.version =
    INFANTRY_BUDDY_BOUND_MODEL.version + 1;
  assert.throws(
    () => squad.restoreState(invalid, new Map([
      [squad.id, squad],
      [target.id, target]
    ])),
    /unsupported buddy-bound version/
  );
});

function runFixedFrameStream(frameBudgets, mode = 'wego') {
  const terrain = createTerrain();
  const squad = prepareSquad('buddy-bound-fixed-step');
  const target = prepareTarget('buddy-bound-fixed-target', 50);
  activateBounds(squad, target, 45);
  const game = {
    units: [squad],
    captureSimulationState() {
      return squad.captureState();
    },
    restoreSimulationState(state) {
      squad.restoreState(state, new Map([
        [squad.id, squad],
        [target.id, target]
      ]));
    },
    simulateToTime() {},
    beginMatch() {}
  };
  const wego = new WegoManager(game);
  if (mode === 'realtime') wego.setPlayMode('realtime');
  else wego.executeTurn();
  const stepper = new FixedStepAccumulator(STEP_SECONDS);
  let steps = 0;
  for (const budget of frameBudgets) {
    stepper.advance(budget, delta => {
      updateSquad(
        squad,
        wego.getSimulationDelta(delta),
        terrain
      );
      steps++;
    });
  }
  return {
    steps,
    state: squad.captureState()
  };
}

test('outer-frame partitions and WEGO/realtime use the same Unit update mechanic', () => {
  const variable = runFixedFrameStream([
    0.011, 0.022, 0.017, 0.05,
    0.007, 0.013, 0.041, 0.039
  ]);
  const grouped = runFixedFrameStream([0.1, 0.1]);
  assert.deepEqual(variable, grouped);
  assert.deepEqual(
    runFixedFrameStream([0.1, 0.1], 'realtime'),
    grouped
  );
});

test('plain coordinator restore rejects forged role and duplicate-member state', () => {
  const coordinator = new InfantryBuddyBounds();
  const members = [
    { id: 0, x: 0, z: 0, goalX: 10, goalZ: 0 },
    { id: '0', x: 0, z: 1, goalX: 10, goalZ: 1 }
  ];
  coordinator.update({
    active: true,
    waypointKey: '0:QUICK:10:0:0',
    members
  });
  const state = coordinator.captureState();
  assert.deepEqual(state.pairs[0].memberIds, [0, '0']);

  const forged = structuredClone(state);
  forged.pairs[0].covererId = forged.pairs[0].moverId;
  assert.throws(
    () => new InfantryBuddyBounds(forged),
    /invalid roles/
  );

  const duplicate = structuredClone(state);
  duplicate.pairs.push(structuredClone(duplicate.pairs[0]));
  assert.throws(
    () => new InfantryBuddyBounds(duplicate),
    /repeats a member|invalid pair ID/
  );
});
