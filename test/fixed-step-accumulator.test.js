import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FixedStepAccumulator } from '../src/simulation/FixedStepAccumulator.js';
import { Unit } from '../src/game/Unit.js';
import { TerrainBuilder } from '../src/world/TerrainBuilder.js';

function runFrameStream(frameBudgets) {
  const terrain = new TerrainBuilder(new THREE.Scene());
  terrain.addColliderRecord({
    id: 'fixed-step-wall',
    type: 'stonewall',
    centerX: 0,
    centerZ: 0,
    halfX: 8,
    halfZ: 0.3,
    blocks: ['vehicle', 'infantry']
  });
  const unit = new Unit({
    id: 'fixed_step_vehicle',
    faction: 'french',
    type: 'tank',
    position: new THREE.Vector3(-4, 0, -8)
  });
  terrain.registerUnitColliders([unit]);
  unit.addWaypoint(new THREE.Vector3(4, 0, 8), 'FAST');
  const stepper = new FixedStepAccumulator(1 / 30);
  let ticks = 0;
  for (const frameBudget of frameBudgets) {
    stepper.advance(frameBudget, delta => {
      unit.update(delta, terrain);
      ticks++;
    });
  }
  return {
    ticks,
    position: unit.position.toArray(),
    rotation: unit.rotation,
    waypointIndex: unit.currentWaypointIndex,
    remainder: stepper.remainderSeconds
  };
}

test('variable live frame budgets produce the same fixed collision simulation as replay', () => {
  const variable = runFrameStream([
    0.011, 0.022, 0.017, 0.05,
    0.007, 0.013, 0.041, 0.039
  ]);
  const replay = runFrameStream([0.1, 0.1]);

  assert.equal(variable.ticks, 6);
  assert.deepEqual(variable, replay);
});

test('partial frame budget never enters authoritative simulation', () => {
  const stepper = new FixedStepAccumulator(1 / 30);
  const deltas = [];
  stepper.advance(0.02, delta => deltas.push(delta));
  assert.deepEqual(deltas, []);
  stepper.advance(0.02, delta => deltas.push(delta));
  assert.deepEqual(deltas, [1 / 30]);
  assert.ok(stepper.remainderSeconds > 0);
});
