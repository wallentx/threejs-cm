import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { selectNearbyCover } from '../src/game/SoldierAI.js';
import {
  getInfantryMovementFormationOffset,
  getInfantryMovementOrderProfile,
  isInfantryOrderMovingFireProhibited,
  SNEAK_INFANTRY_MOVEMENT_PROFILE
} from '../src/simulation/infantry/InfantryMovementOrders.js';

const flatTerrain = Object.freeze({
  getHeightAt() {
    return 0;
  }
});

const coverTerrain = Object.freeze({
  bocageObstacles: Object.freeze([Object.freeze({
    id: 'sneak-test-wall',
    type: 'stonewall',
    minX: -3,
    maxX: 3,
    minZ: 1.4,
    maxZ: 1.8
  })]),
  getHeightAt() {
    return 0;
  }
});

function movementContext(agent, unit, overrides = {}) {
  return {
    anchorMoving: true,
    goal: agent.position.clone().add(new THREE.Vector3(0, 0, 20)),
    neighbors: unit.soldierAI.agents,
    orderType: 'SNEAK',
    squadPinned: false,
    waypointIndex: 0,
    ...overrides
  };
}

function createSquad(id = 'sneak-squad') {
  return new Unit({
    id,
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
}

test('SNEAK remains a frozen first-order profile distinct from CRAWL and ASSAULT', () => {
  assert.equal(
    getInfantryMovementOrderProfile('SNEAK'),
    SNEAK_INFANTRY_MOVEMENT_PROFILE
  );
  assert.equal(SNEAK_INFANTRY_MOVEMENT_PROFILE.id, 'SNEAK');
  assert.equal(
    SNEAK_INFANTRY_MOVEMENT_PROFILE.dataQuality,
    'gameplay-approximation'
  );
  assert.equal(SNEAK_INFANTRY_MOVEMENT_PROFILE.individual.state, 'SNEAKING');
  assert.equal(SNEAK_INFANTRY_MOVEMENT_PROFILE.individual.stance, 'CROUCHED');
  assert.equal(
    SNEAK_INFANTRY_MOVEMENT_PROFILE.individual.movingFireAllowed,
    false
  );
  assert.ok(
    SNEAK_INFANTRY_MOVEMENT_PROFILE.individual.speedMetersPerSecond
      > SNEAK_INFANTRY_MOVEMENT_PROFILE.anchorSpeedMetersPerSecond
  );
  assert.equal(
    SNEAK_INFANTRY_MOVEMENT_PROFILE.formation.type,
    'STAGGERED_FILE'
  );
  assert.ok(Object.isFrozen(SNEAK_INFANTRY_MOVEMENT_PROFILE));
  assert.ok(Object.isFrozen(SNEAK_INFANTRY_MOVEMENT_PROFILE.individual));
  assert.ok(Object.isFrozen(SNEAK_INFANTRY_MOVEMENT_PROFILE.formation));
  assert.notEqual(
    getInfantryMovementOrderProfile('CRAWL'),
    SNEAK_INFANTRY_MOVEMENT_PROFILE
  );
  assert.notEqual(
    getInfantryMovementOrderProfile('ASSAULT'),
    SNEAK_INFANTRY_MOVEMENT_PROFILE
  );
  assert.notDeepEqual(
    getInfantryMovementFormationOffset('CRAWL', 0),
    getInfantryMovementFormationOffset('SNEAK', 0)
  );
  assert.notDeepEqual(
    getInfantryMovementFormationOffset('ASSAULT', 0),
    getInfantryMovementFormationOffset('SNEAK', 0)
  );
  assert.equal(isInfantryOrderMovingFireProhibited('SNEAKING'), true);
  assert.equal(isInfantryOrderMovingFireProhibited('CRAWLING'), true);
  assert.equal(isInfantryOrderMovingFireProhibited('ASSAULTING'), true);
  assert.equal(isInfantryOrderMovingFireProhibited('READY'), false);
});

test('SNEAK gives each ready soldier a slow crouched state and staggered-file slot', () => {
  const unit = createSquad('sneak-individuals');
  const agent = unit.soldierAI.agents[0];
  agent.commandWaypoint = 0;
  agent.reactionDelay = 0;
  agent.pace = 1;
  const start = agent.position.clone();

  agent.updateMovement(0.1, flatTerrain, movementContext(agent, unit));

  assert.equal(agent.state, 'SNEAKING');
  assert.equal(agent.stance, 'CROUCHED');
  assert.ok(agent.position.distanceTo(start) > 0);
  assert.ok(
    agent.velocity.length()
      <= SNEAK_INFANTRY_MOVEMENT_PROFILE.individual.speedMetersPerSecond
  );

  const slots = unit.soldierAI.agents.map((candidate, index) =>
    unit.soldierAI.getFormationOffset(index, 'SNEAK').toArray()
  );
  assert.deepEqual(slots[0], [-0.45, 0, 0]);
  assert.deepEqual(slots[1], [0.45, 0, -1.05]);
  assert.deepEqual(slots[2], [-0.45, 0, -2.1]);
  assert.equal(new Set(slots.map(slot => slot.join(':'))).size, slots.length);
  assert.ok(slots.every((slot, index) =>
    slot[0] === (index % 2 === 0 ? -0.45 : 0.45)
      && slot[2] === -index * 1.05
  ));
});

test('SNEAK prohibits fire while moving but permits normal fire after stopping', () => {
  const attacker = createSquad('sneak-fire');
  const target = new Unit({
    id: 'sneak-fire-target',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 20)
  });
  const agent = attacker.soldierAI.agents[0];
  agent.commandWaypoint = 0;
  agent.reactionDelay = 0;
  agent.pace = 1;
  agent.fireCooldown = 0;
  agent.magazineAmmo = 2;
  agent.reserveAmmo = 0;
  let shots = 0;
  const combatContext = {
    opposingUnits: [target],
    spotting: {
      checkLOS(from, to) {
        return { clear: true, dist: from.distanceTo(to) };
      }
    },
    combat: {
      fireWeapon() {
        shots++;
        return true;
      }
    }
  };

  agent.updateMovement(0.1, flatTerrain, movementContext(agent, attacker));
  assert.equal(agent.state, 'SNEAKING');
  assert.equal(agent.updateCombat(2, combatContext), false);
  assert.equal(shots, 0);

  agent.updateMovement(1, flatTerrain, movementContext(agent, attacker, {
    anchorMoving: false,
    goal: agent.position.clone()
  }));
  assert.equal(agent.state, 'SNEAKING');
  assert.equal(agent.updateCombat(2, combatContext), false);
  assert.equal(shots, 0);
  for (let step = 0; step < 8 && agent.state === 'SNEAKING'; step++) {
    agent.updateMovement(0.1, flatTerrain, movementContext(agent, attacker, {
      anchorMoving: false,
      goal: agent.position.clone()
    }));
  }
  assert.equal(agent.state, 'OBSERVING');
  assert.equal(agent.stance, 'CROUCHED');
  assert.equal(agent.updateCombat(0.1, combatContext), false);
  assert.equal(agent.state, 'AIMING');
  assert.equal(agent.updateCombat(2, combatContext), true);
  assert.equal(shots, 1);
});

test('casualty, unavailable, building, and morale reactions outrank SNEAK', () => {
  const unit = createSquad('sneak-precedence');
  const [casualty, unavailable, occupant, pinned] = unit.soldierAI.agents;

  casualty.applyDamage(200);
  casualty.updateMovement(
    0.1,
    flatTerrain,
    movementContext(casualty, unit)
  );
  assert.equal(casualty.state, 'CASUALTY');
  assert.equal(casualty.velocity.lengthSq(), 0);

  unavailable.status = 'INCAPACITATED';
  unavailable.health = 100;
  unavailable.updateMovement(
    0.1,
    flatTerrain,
    movementContext(unavailable, unit)
  );
  assert.equal(unavailable.state, 'CASUALTY');
  assert.equal(unavailable.velocity.lengthSq(), 0);
  assert.equal(unavailable.updateCombat(2, {
    opposingUnits: [],
    spotting: { checkLOS: () => ({ clear: true, dist: 1 }) },
    combat: { fireWeapon: () => assert.fail('incapacitated soldier fired') }
  }), false);

  occupant.state = 'READY';
  occupant.velocity.set(1, 0, 0);
  occupant.buildingLocation = { phase: 'occupied' };
  occupant.updateMovement(
    0.1,
    flatTerrain,
    movementContext(occupant, unit)
  );
  assert.equal(occupant.state, 'READY');
  assert.equal(occupant.velocity.lengthSq(), 0);

  pinned.suppression = 80;
  pinned.reactionDelay = 0;
  pinned.updateMovement(0.1, flatTerrain, movementContext(pinned, unit));
  assert.equal(pinned.state, 'PINNED');
  assert.equal(pinned.stance, 'PRONE');
});

test('incoming-fire cover selection outranks the SNEAK formation goal', () => {
  const unit = createSquad('sneak-threat-precedence');
  const agent = unit.soldierAI.agents[0];
  const threat = new THREE.Vector3(0, 0, 12);
  const expectedCover = selectNearbyCover(
    agent,
    coverTerrain,
    threat,
    unit.soldierAI.agents
  );
  assert.ok(expectedCover);
  agent.suppression = 12;
  Object.assign(agent.record, {
    incomingFireTimer: 2,
    incomingThreatPosition: threat.toArray(),
    lastSuppression: 12
  });

  unit.soldierAI.update(1 / 30, coverTerrain, {
    anchorMoving: true,
    orderType: 'SNEAK',
    threatPosition: threat
  });

  assert.equal(agent.record.tacticalDecision.reason, 'incoming-fire-cover');
  assert.equal(agent.record.tacticalDecision.coverId, 'sneak-test-wall');
  assert.deepEqual(
    agent.record.tacticalDecision.goal,
    expectedCover.position.toArray()
  );
  assert.notDeepEqual(
    agent.record.tacticalDecision.goal,
    unit.soldierAI.getFormationOffset(agent.index, 'SNEAK').toArray()
  );
  assert.equal(agent.stance, 'CROUCHED');
});

test('positive-health unavailable soldiers neither move nor stall SNEAK completion', () => {
  const unit = createSquad('sneak-unavailable-completion');
  const unavailable = unit.soldierAI.agents[1];
  unavailable.status = 'INCAPACITATED';
  unavailable.health = 100;
  unavailable.syncRecord();
  const unavailableStart = unavailable.position.clone();
  unit.addWaypoint(new THREE.Vector3(0, 0, 6), 'SNEAK');

  let steps = 0;
  while (steps < 3000 && unit.currentWaypointIndex < unit.waypoints.length) {
    unit.update(1 / 30, flatTerrain);
    steps++;
  }

  assert.equal(unavailable.position.distanceTo(unavailableStart), 0);
  assert.equal(unavailable.state, 'CASUALTY');
  assert.equal(unit.currentWaypointIndex, unit.waypoints.length);
  assert.equal(unit.waypoints[0].reached, true);
});

test('SNEAK uses existing captured state and projects a distinct crouched pose', () => {
  const unit = createSquad('sneak-rollback');
  const agent = unit.soldierAI.agents[0];
  const mesh = unit.mesh.userData.soldiers[0];
  agent.commandWaypoint = 0;
  agent.reactionDelay = 0;
  agent.pace = 1;
  agent.updateMovement(0.1, flatTerrain, movementContext(agent, unit));
  unit.soldierAI.applyPose(mesh, agent.record);

  assert.equal(mesh.userData.activePose, 'sneak');
  assert.ok(mesh.position.y < 0);
  const captured = agent.capture();
  assert.equal(captured.state, 'SNEAKING');
  assert.equal(captured.stance, 'CROUCHED');
  assert.equal(Object.hasOwn(captured, 'sneakState'), false);
  assert.equal(Object.hasOwn(captured, 'movementOrderProfile'), false);

  agent.state = 'READY';
  agent.stance = 'STANDING';
  agent.velocity.set(0, 0, 0);
  agent.restore(captured);
  assert.equal(agent.state, 'SNEAKING');
  assert.equal(agent.stance, 'CROUCHED');
  assert.deepEqual(agent.velocity.toArray(), captured.velocity);
  assert.deepEqual(agent.capture(), captured);
});
