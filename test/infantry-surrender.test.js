import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  evaluateInfantrySurrender,
  INFANTRY_SURRENDER_APPROXIMATION
} from '../src/simulation/infantry/InfantrySurrender.js';
import { Unit } from './helpers/France1940TestUnit.js';

const baseInput = Object.freeze({
  soldierId: 'soldier-1',
  alreadySurrendered: false,
  living: true,
  routed: false,
  buildingTransit: false,
  escaping: false,
  suppression: 85,
  casualtyRatio: 0.5,
  leaderNearby: false,
  position: [0, 0],
  threat: { id: 'projectile-1', position: [0, 20] },
  escapeAssessmentKnown: true,
  escapeAvailable: false
});

function decide(overrides = {}) {
  return evaluateInfantrySurrender({ ...baseInput, ...overrides });
}

test('surrender requires hopeless isolation, a nearby stable threat, and known lack of escape', () => {
  assert.equal(decide({ suppression: 81 }).reason, 'suppression-below-threshold');
  assert.equal(decide({ casualtyRatio: 0.49 }).reason, 'not-hopelessly-isolated');
  assert.equal(decide({ leaderNearby: true }).reason, 'not-hopelessly-isolated');
  assert.equal(decide({ threat: null }).reason, 'no-recognized-threat');
  assert.equal(
    decide({ threat: { id: 'far', position: [0, 31] } }).reason,
    'recognized-threat-too-far'
  );
  assert.equal(decide({ escapeAssessmentKnown: false }).reason, 'escape-unknown');
  assert.equal(decide({ escapeAvailable: true }).reason, 'escape-available');

  assert.deepEqual(decide(), {
    approximationLabel: INFANTRY_SURRENDER_APPROXIMATION,
    active: true,
    reason: 'hopeless-isolation-under-nearby-threat',
    threatId: 'projectile-1',
    threatDistanceMeters: 20
  });
});

test('casualty, routed, transit, and active escape precedence reject surrender', () => {
  for (const [overrides, reason] of [
    [{ living: false }, 'casualty'],
    [{ routed: true }, 'routed'],
    [{ buildingTransit: true }, 'building-transit'],
    [{ escaping: true }, 'escaping']
  ]) {
    const decision = decide(overrides);
    assert.equal(decision.active, false);
    assert.equal(decision.reason, reason);
  }
});

test('accepted surrender remains stable without inventing later threat evidence', () => {
  assert.deepEqual(
    decide({
      alreadySurrendered: true,
      retainedThreatId: 'projectile-original',
      living: false,
      routed: true,
      threat: null
    }),
    {
      approximationLabel: INFANTRY_SURRENDER_APPROXIMATION,
      active: true,
      reason: 'retained-surrender',
      threatId: 'projectile-original',
      threatDistanceMeters: null
    }
  );
});

function noEscapeTerrain() {
  return {
    bocageObstacles: [],
    getHeightAt() {
      return 0;
    },
    collisionWorld: {
      getNavigationPath() {
        return [];
      },
      getNavigationTarget(_start, goal) {
        return goal;
      },
      resolveCircleMotion(position) {
        return { x: position.x, z: position.z, contacts: [] };
      }
    }
  };
}

test('real Unit surrender halts combat and reload, projects pose, survives losses, and restores exactly', () => {
  const unit = new Unit({
    id: 'surrender-live',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  const agent = unit.soldierAI.agents[0];
  for (const casualty of unit.soldierAI.agents.slice(3)) {
    casualty.health = 0;
    casualty.status = 'KIA';
    casualty.state = 'CASUALTY';
    casualty.syncRecord();
  }
  for (const survivor of unit.soldierAI.agents.slice(0, 3)) {
    survivor.record.knownLivingCount = 3;
  }
  const threat = new THREE.Vector3(
    agent.position.x,
    0,
    agent.position.z + 20
  );
  unit.registerIncomingFire(threat, agent.position, {
    projectileId: 'projectile-surrender-live',
    radius: 0.5,
    intensity: 1
  });
  agent.suppression = 85;
  agent.record.lastSuppression = 85;
  agent.reloadTimer = 2;
  agent.state = 'RELOADING';
  agent.targetUnitId = 'enemy';
  agent.targetSoldierId = 'enemy-1';
  const healthBefore = agent.health;
  const magazineBefore = agent.magazineAmmo;
  const reserveBefore = agent.reserveAmmo;

  unit.soldierAI.update(1 / 60, noEscapeTerrain());

  const decision = agent.record.tacticalDecision;
  assert.equal(agent.status, 'SURRENDERED');
  assert.equal(agent.state, 'SURRENDERED');
  assert.equal(agent.health, healthBefore);
  assert.equal(agent.reloadTimer, 0);
  assert.equal(agent.magazineAmmo, magazineBefore);
  assert.equal(agent.reserveAmmo, reserveBefore);
  assert.equal(agent.targetUnitId, null);
  assert.equal(agent.targetSoldierId, null);
  assert.equal(decision.surrendered, true);
  assert.equal(decision.surrenderThreatId, 'projectile-surrender-live');
  assert.equal(
    decision.surrenderReason,
    'hopeless-isolation-under-nearby-threat'
  );
  const mesh = unit.mesh.userData.soldiers[0];
  assert.equal(mesh.userData.activePose, 'surrender');
  assert.equal(mesh.userData.parts.weaponRig.userData.activeGripAssignments, null);
  assert.equal(agent.updateCombat(1, {}), false);
  assert.equal(agent.startReload(), false);

  for (const teammate of unit.soldierAI.agents.slice(1, 3)) {
    teammate.health = 0;
    teammate.status = 'KIA';
    teammate.syncRecord();
  }
  agent.applyDamage(200, 100);
  unit.soldierAI.update(1 / 60, noEscapeTerrain());
  assert.equal(agent.status, 'SURRENDERED');
  assert.equal(agent.health, healthBefore);
  assert.equal(agent.record.tacticalDecision.surrenderReason, 'retained-surrender');
  assert.equal(
    agent.record.tacticalDecision.surrenderThreatId,
    'projectile-surrender-live'
  );

  const snapshot = unit.captureState();
  const restored = new Unit({
    id: 'surrender-live',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  restored.restoreState(snapshot, new Map([[restored.id, restored]]));
  assert.deepEqual(restored.captureState(), snapshot);
  assert.equal(restored.mesh.userData.soldiers[0].userData.activePose, 'surrender');
});
