import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  getInfantryAimPoint,
  getInfantryHitVolumeRecords,
  INFANTRY_HIT_VOLUME_MODEL_VERSION,
  intersectInfantryHitVolumes
} from '../src/simulation/infantry/InfantryHitVolumes.js';
import { BallisticsSystem } from '../src/game/BallisticsSystem.js';

function lateralSegment(y, z = 0) {
  return [
    new THREE.Vector3(-2, y, z),
    new THREE.Vector3(2, y, z)
  ];
}

test('compound infantry hit volumes cover head and legs instead of one torso sphere', () => {
  const [headStart, headEnd] = lateralSegment(1.76);
  const head = intersectInfantryHitVolumes(headStart, headEnd, {
    position: [0, 0, 0],
    stance: 'STANDING',
    facing: 0
  });
  assert.equal(head.hitVolumeId, 'head');

  const [legStart, legEnd] = lateralSegment(0.12);
  const leg = intersectInfantryHitVolumes(legStart, legEnd, {
    position: [0, 0, 0],
    stance: 'STANDING',
    facing: 0
  });
  assert.equal(leg.hitVolumeId, 'legs');
  assert.equal(head.modelVersion, INFANTRY_HIT_VOLUME_MODEL_VERSION);
});

test('prone collision and aim rotate with authoritative stance and facing', () => {
  const [bodyStart, bodyEnd] = lateralSegment(0.36, 1.18);
  assert.equal(
    intersectInfantryHitVolumes(bodyStart, bodyEnd, {
      position: [0, 0, 0],
      stance: 'PRONE',
      facing: 0
    }).hitVolumeId,
    'torso'
  );
  const [highStart, highEnd] = lateralSegment(1.25, 1.18);
  assert.equal(
    intersectInfantryHitVolumes(highStart, highEnd, {
      position: [0, 0, 0],
      stance: 'PRONE',
      facing: 0
    }),
    null
  );

  const aim = getInfantryAimPoint({
    position: [10, 2, 20],
    stance: 'PRONE',
    facing: Math.PI / 2
  });
  assert.ok(Math.abs(aim.point[0] - 11.18) < 1e-9);
  assert.ok(Math.abs(aim.point[1] - 2.36) < 1e-9);
  assert.ok(Math.abs(aim.point[2] - 20) < 1e-9);
});

test('debug records expose the same stance and facing volumes used for collision', () => {
  const records = getInfantryHitVolumeRecords({
    position: [10, 2, 20],
    stance: 'PRONE',
    facing: Math.PI / 2
  });
  const torso = records.find(record => record.id === 'torso');
  assert.deepEqual(torso.center.map(value => Math.round(value * 100) / 100), [
    11.18,
    2.36,
    20
  ]);
  assert.equal(torso.rotation, Math.PI / 2);
  assert.equal(torso.modelVersion, INFANTRY_HIT_VOLUME_MODEL_VERSION);
});

test('ballistics reports the named stance-aware infantry volume it actually swept', () => {
  const agent = {
    id: 'standing-soldier',
    position: new THREE.Vector3(),
    stance: 'STANDING',
    facing: 0
  };
  const target = {
    id: 'target-squad',
    faction: 'german',
    type: 'infantry_squad',
    isCombatEffective: () => true,
    soldierAI: { getLivingAgents: () => [agent] }
  };
  const [previousPosition, position] = lateralSegment(1.76);
  const impact = new BallisticsSystem({
    getUnits: () => [target]
  }).detectImpact({
    attacker: { id: 'attacker', faction: 'french' },
    previousPosition,
    position,
    velocity: new THREE.Vector3(1, 0, 0),
    weapon: { dragPerSecond: 0 },
    distanceTravelled: 4,
    lifetime: 0
  });

  assert.equal(impact.kind, 'infantry');
  assert.equal(impact.agent.id, agent.id);
  assert.equal(impact.hitVolumeId, 'head');
  assert.equal(
    impact.hitVolumeModelVersion,
    INFANTRY_HIT_VOLUME_MODEL_VERSION
  );
});
