import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSION_STATUS,
  ScenarioObjectiveSystem
} from '../src/simulation/objectives/ScenarioObjectiveSystem.js';

const SPEC = Object.freeze({
  id: 'bridge-breakthrough',
  type: 'BREAKTHROUGH',
  attackerFactionId: 'german',
  defenderFactionId: 'french',
  exitZone: Object.freeze({ minX: -8, maxX: 8, minZ: 108, maxZ: 120 }),
  timeLimitSeconds: 900,
  dataQuality: 'gameplay objective approximation'
});

function unit(id, faction, x, z, options = {}) {
  return {
    id,
    faction,
    type: options.type ?? 'tank',
    position: { x, z },
    isCombatEffective: () => options.combatEffective ?? true
  };
}

test('breakthrough resolves stable attacker exit and defender elimination wins', () => {
  const mission = new ScenarioObjectiveSystem(SPEC);
  const units = [
    unit('ger-b', 'german', 0, 0),
    unit('ger-a', 'german', 0, 110),
    unit('fr-a', 'french', 0, 80)
  ];
  const breakthrough = mission.advance(1 / 30, units);
  assert.equal(breakthrough.status, MISSION_STATUS.COMPLETE);
  assert.equal(breakthrough.winnerFactionId, 'german');
  assert.equal(breakthrough.resolution, 'ATTACKER_REACHED_EXIT');
  assert.equal(breakthrough.exitReachedByUnitId, 'ger-a');

  const defense = new ScenarioObjectiveSystem(SPEC);
  const eliminated = defense.advance(0, [
    unit('ger-a', 'german', 0, 0, { combatEffective: false }),
    unit('fr-a', 'french', 0, 80)
  ]);
  assert.equal(eliminated.winnerFactionId, 'french');
  assert.equal(eliminated.resolution, 'ATTACKER_ELIMINATED');
});

test('static attackers cannot exit and time defense is frame-partition invariant', () => {
  const simulate = deltas => {
    const mission = new ScenarioObjectiveSystem({
      ...SPEC,
      timeLimitSeconds: 2
    });
    const units = [
      unit('ger-bunker', 'german', 0, 112, { type: 'bunker' }),
      unit('fr-a', 'french', 0, 80)
    ];
    for (const delta of deltas) mission.advance(delta, units);
    return mission.captureState();
  };
  assert.deepEqual(simulate([0.5, 0.5, 0.5, 0.5]), simulate([1, 1]));
  const state = simulate([2]);
  assert.equal(state.winnerFactionId, 'french');
  assert.equal(state.resolution, 'TIME_LIMIT_DEFENDED');
});

test('objective capture and restore resumes the exact authoritative clock', () => {
  const units = [unit('ger-a', 'german', 0, 0)];
  const original = new ScenarioObjectiveSystem(SPEC);
  original.advance(47.25, units);
  const snapshot = original.captureState();
  original.advance(10, units);

  const restored = new ScenarioObjectiveSystem(SPEC, snapshot);
  assert.deepEqual(restored.captureState(), snapshot);
  assert.equal(restored.advance(2.75, units).elapsedSeconds, 50);
});
