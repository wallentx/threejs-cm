import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EnemyObjectivePlanner } from '../src/simulation/ai/EnemyObjectivePlanner.js';
import { GameApp } from '../src/app/GameApp.js';

const planSet = Object.freeze({
  id: 'bridge-plans',
  factionId: 'german',
  dataQuality: 'scenario-authored gameplay plans',
  plans: Object.freeze([
    Object.freeze({
      id: 'center',
      lanes: Object.freeze([
        Object.freeze({
          id: 'road',
          preferredRoles: Object.freeze(['armor']),
          setupSlots: Object.freeze([Object.freeze([0, -90])]),
          startDelaySeconds: 2,
          route: Object.freeze([
            Object.freeze({ position: Object.freeze([0, 0]), orders: { armor: 'HUNT' } }),
            Object.freeze({ position: Object.freeze([0, 110]), orders: { armor: 'FAST' } })
          ])
        }),
        Object.freeze({
          id: 'west',
          preferredRoles: Object.freeze(['infantry']),
          setupSlots: Object.freeze([Object.freeze([-30, -90])]),
          route: Object.freeze([
            Object.freeze({ position: Object.freeze([-10, 0]), orders: { infantry: 'QUICK' } }),
            Object.freeze({ position: Object.freeze([0, 110]), orders: { infantry: 'ASSAULT' } })
          ])
        })
      ])
    }),
    Object.freeze({
      id: 'flank',
      lanes: Object.freeze([
        Object.freeze({
          id: 'east',
          preferredRoles: Object.freeze(['armor', 'infantry']),
          setupSlots: Object.freeze([Object.freeze([30, -90])]),
          route: Object.freeze([
            Object.freeze({ position: Object.freeze([8, 0]), orders: {} }),
            Object.freeze({ position: Object.freeze([0, 110]), orders: {} })
          ])
        })
      ])
    })
  ])
});

function unit(id, type, extra = {}) {
  return {
    id,
    faction: 'german',
    type,
    position: { x: 0, z: -90 },
    vehicleSpec: extra.vehicleSpec ?? null,
    waypoints: [],
    currentWaypointIndex: 0,
    isCombatEffective: () => true
  };
}

test('planner selects a seeded plan, assigns combined-arms lanes, and varies by seed', () => {
  const units = [
    unit('armor', 'tank', { vehicleSpec: {} }),
    unit('infantry', 'infantry_squad')
  ];
  const center = new EnemyObjectivePlanner({
    planSet,
    difficultyId: 'regular',
    random: () => 0.1
  });
  const setup = center.prepare(units);
  assert.equal(center.getDiagnostics().selectedPlanId, 'center');
  assert.deepEqual(setup.map(command => [command.unitId, command.laneId]), [
    ['armor', 'road'],
    ['infantry', 'west']
  ]);
  const routes = center.beginBattle(units);
  assert.deepEqual(routes.map(command => command.waypoints[0].orderType), [
    'HUNT',
    'QUICK'
  ]);

  const flank = new EnemyObjectivePlanner({
    planSet,
    difficultyId: 'regular',
    random: () => 0.9
  });
  flank.prepare(units);
  assert.equal(flank.getDiagnostics().selectedPlanId, 'flank');
});

test('difficulty changes coordination delay and deterministic replan cadence', () => {
  const armor = unit('armor', 'tank', { vehicleSpec: {} });
  const recruit = new EnemyObjectivePlanner({
    planSet,
    difficultyId: 'recruit',
    random: () => 0
  });
  recruit.prepare([armor]);
  assert.equal(recruit.beginBattle([armor])[0].startDelaySeconds, 3.2);
  assert.deepEqual(recruit.advance(29.9, [armor]), []);
  assert.equal(recruit.advance(0.1, [armor]).length, 1);

  const crack = new EnemyObjectivePlanner({
    planSet,
    difficultyId: 'crack',
    random: () => 0
  });
  crack.prepare([armor]);
  assert.equal(crack.beginBattle([armor])[0].startDelaySeconds, 0.5);
  assert.equal(crack.advance(5, [armor]).length, 1);
});

test('planner capture and restore preserves selected plan and assignments', () => {
  const units = [unit('armor', 'tank', { vehicleSpec: {} })];
  const planner = new EnemyObjectivePlanner({
    planSet,
    difficultyId: 'regular',
    random: () => 0.1
  });
  planner.prepare(units);
  planner.beginBattle(units);
  planner.advance(3.25, units);
  const snapshot = planner.captureState();

  const restored = new EnemyObjectivePlanner({
    planSet,
    difficultyId: 'regular',
    random: () => {
      throw new Error('restore must not draw a new plan');
    },
    savedState: snapshot
  });
  assert.deepEqual(restored.captureState(), snapshot);
});

test('runtime route composition pathfinds each leg from the previously staged waypoint', () => {
  const starts = [];
  const unit = {
    position: new THREE.Vector3(0, 0, 0),
    collisionRadius: 1,
    collisionOffsets: [],
    vehicleSpec: null,
    waypoints: [],
    collisionWorld: {
      getNavigationPath(start, destination) {
        starts.push([start.x, start.z]);
        return [{ x: destination.x, z: destination.z }];
      }
    },
    addWaypoint(position, orderType, pauseSeconds) {
      this.waypoints.push({ position: position.clone(), orderType, pauseSeconds });
    }
  };
  const app = {
    terrain: {
      getMovementHeightAt: () => 0,
      getHeightAt: () => 0
    }
  };
  GameApp.prototype.addEnemyRouteWaypoint.call(app, unit, [10, 0], 'HUNT');
  GameApp.prototype.addEnemyRouteWaypoint.call(app, unit, [20, 5], 'FAST');
  assert.deepEqual(starts, [[0, 0], [10, 0]]);
  assert.deepEqual(
    unit.waypoints.map(waypoint => waypoint.position.toArray()),
    [[10, 0, 0], [20, 0, 5]]
  );
});
