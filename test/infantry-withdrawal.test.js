import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  evaluateInfantryWithdrawal,
  INFANTRY_WITHDRAWAL_APPROXIMATION
} from '../src/simulation/infantry/InfantryWithdrawal.js';
import { Unit } from './helpers/France1940TestUnit.js';

const baseInput = Object.freeze({
  soldierId: 'soldier-1',
  available: true,
  casualty: false,
  surrendered: false,
  buildingTransit: false,
  explicitOrder: false,
  buddyBound: false,
  suppression: 78,
  casualtyRatio: 0,
  casualtyResponseActive: false,
  position: [0, 0],
  threat: { id: 'projectile-7', position: [0, 20] },
  candidates: [{
    id: 'fallback-a',
    kind: 'fallback',
    score: 0,
    navigable: true,
    goal: [0, -1],
    destination: [0, -6]
  }]
});

function decide(overrides = {}) {
  return evaluateInfantryWithdrawal({ ...baseInput, ...overrides });
}

test('withdrawal requires pressure, stable recognized threat evidence, and a retreating navigable candidate', () => {
  assert.equal(decide({ suppression: 74 }).reason, 'pressure-below-threshold');
  assert.equal(decide({ threat: null }).reason, 'no-recognized-threat');
  assert.equal(
    decide({ threat: { position: [0, 20] } }).reason,
    'no-recognized-threat'
  );
  assert.equal(
    decide({ threat: { id: 'same-point', position: [0, 0] } }).reason,
    'coincident-threat'
  );
  assert.equal(
    decide({ candidates: [{
      id: 'toward-threat',
      navigable: true,
      goal: [0, 1],
      destination: [0, 6]
    }] }).reason,
    'no-navigable-retreat'
  );
  assert.equal(
    decide({ candidates: [{
      id: 'blocked',
      navigable: false,
      goal: [0, -1],
      destination: [0, -6]
    }] }).reason,
    'no-navigable-retreat'
  );

  const decision = decide();
  assert.deepEqual(decision, {
    approximationLabel: INFANTRY_WITHDRAWAL_APPROXIMATION,
    active: true,
    reason: 'withdrawal-route',
    trigger: 'high-suppression',
    threatId: 'projectile-7',
    goalId: 'fallback-a',
    goalKind: 'fallback',
    goal: [0, -1],
    destination: [0, -6],
    backwardVector: [0, -1]
  });
});

test('unavailable state wins and every individual-state blocker prevents withdrawal', () => {
  assert.equal(
    decide({ available: false, surrendered: true, buildingTransit: true }).reason,
    'unavailable'
  );
  for (const [field, reason] of [
    ['casualty', 'casualty'],
    ['surrendered', 'surrendered'],
    ['buildingTransit', 'building-transit'],
    ['explicitOrder', 'explicit-order'],
    ['buddyBound', 'buddy-bound']
  ]) {
    const result = decide({ [field]: true });
    assert.equal(result.active, false, field);
    assert.equal(result.reason, reason, field);
    assert.equal(result.goal, null, field);
  }
});

test('candidate selection is stable under reordered input and prefers cover, score, then stable ID', () => {
  const candidates = [
    {
      id: 'cover-z', kind: 'cover', score: 4, navigable: true,
      goal: [1, -1], destination: [2, -5]
    },
    {
      id: 'cover-a', kind: 'cover', score: 4, navigable: true,
      goal: [-1, -1], destination: [-2, -5]
    },
    {
      id: 'fallback-high', kind: 'fallback', score: 100, navigable: true,
      goal: [0, -2], destination: [0, -8]
    }
  ];
  const forward = decide({ candidates });
  const reverse = decide({ candidates: [...candidates].reverse() });
  assert.deepEqual(reverse, forward);
  assert.equal(forward.goalId, 'cover-a');
  assert.equal(forward.goalKind, 'cover');
  assert.equal(forward.reason, 'withdrawal-cover');
});

function makeCollisionTerrain(routeCalls) {
  return {
    bocageObstacles: [],
    getHeightAt() {
      return 0;
    },
    collisionWorld: {
      getNavigationPath(start, destination, radius, moverType) {
        routeCalls.push({
          start: [start.x, start.z],
          destination: [destination.x, destination.z],
          radius,
          moverType
        });
        return [
          { x: start.x + 0.75, z: start.z - 0.5 },
          { x: destination.x, z: destination.z }
        ];
      },
      getNavigationTarget(_start, goal) {
        return goal;
      },
      resolveCircleMotion(position, displacement) {
        return {
          x: position.x + displacement.x,
          z: position.z + displacement.z,
          contacts: []
        };
      }
    }
  };
}

function makeLiveWithdrawal(id, terrain) {
  const squad = new Unit({
    id,
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = squad.soldierAI.agents[0];
  const threat = new THREE.Vector3(agent.position.x, 0, agent.position.z + 20);
  squad.registerIncomingFire(threat, agent.position, {
    projectileId: 'projectile-live-1',
    radius: 0.5,
    intensity: 1
  });
  agent.suppression = 78;
  agent.record.lastSuppression = 78;
  squad.soldierAI.update(1 / 60, terrain);
  return squad;
}

test('SoldierAI routes selected withdrawal through collision and preserves exact restored fixed-step replay', () => {
  const routeCalls = [];
  const terrain = makeCollisionTerrain(routeCalls);
  const source = makeLiveWithdrawal('live-withdrawal', terrain);
  const sourceDecision = source.roster[0].tacticalDecision;
  assert.equal(sourceDecision.withdrawalActive, true);
  assert.equal(sourceDecision.withdrawalThreatId, 'projectile-live-1');
  assert.match(sourceDecision.withdrawalGoalId, /^fallback:/);
  assert.equal(sourceDecision.withdrawalGoalKind, 'fallback');
  assert.equal(sourceDecision.withdrawalReason, 'withdrawal-route');
  assert.equal(sourceDecision.withdrawalApproximation, INFANTRY_WITHDRAWAL_APPROXIMATION);
  assert.ok(routeCalls.some(call => call.moverType === 'infantry'));
  assert.deepEqual(
    sourceDecision.goal.slice(0, 3).map(value => Number(value.toFixed(6))),
    [
      Number((routeCalls[0].start[0] + 0.75).toFixed(6)),
      0,
      Number((routeCalls[0].start[1] - 0.5).toFixed(6))
    ],
    'decision goal uses collision route waypoint rather than raw six-metre fallback'
  );

  const checkpoint = source.soldierAI.captureState();
  const restored = new Unit({
    id: 'live-withdrawal',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  restored.soldierAI.restoreState(checkpoint);
  for (let step = 0; step < 6; step++) {
    source.soldierAI.update(1 / 60, terrain);
    restored.soldierAI.update(1 / 60, terrain);
  }
  assert.deepEqual(restored.soldierAI.captureState(), source.soldierAI.captureState());
});
