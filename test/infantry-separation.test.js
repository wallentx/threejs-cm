import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameApp } from '../src/app/GameApp.js';
import { FixedStepAccumulator } from '../src/simulation/FixedStepAccumulator.js';
import {
  INFANTRY_COLLISION_RADIUS,
  INFANTRY_SEPARATION_MAX_CANDIDATES,
  INFANTRY_SEPARATION_MAX_PASSES,
  INFANTRY_SEPARATION_TOLERANCE,
  InfantrySeparationSystem
} from '../src/simulation/infantry/InfantrySeparationSystem.js';
import {
  StaticCollisionWorld
} from '../src/simulation/collision/StaticCollisionWorld.js';
import { Unit } from './helpers/France1940TestUnit.js';

function makeAgent(id, x, z, overrides = {}) {
  const agent = {
    id,
    isAlive: true,
    status: 'OK',
    position: { x, y: 0, z },
    velocity: { x: 0, y: 0, z: 0 },
    buildingLocation: null,
    vehicleLocation: null,
    record: {},
    syncCount: 0,
    syncRecord() {
      this.syncCount++;
      this.record.worldPosition = [
        this.position.x,
        this.position.y,
        this.position.z
      ];
    },
    ...overrides
  };
  return agent;
}

function makeSquad(id, agents, overrides = {}) {
  return {
    id,
    type: 'infantry_squad',
    faction: 'test',
    position: { x: 0, y: 0, z: 0 },
    waypoints: [],
    currentWaypointIndex: 0,
    soldierAI: {
      agents,
      syncMeshes() {},
      advanceSupportAmmunitionTransfers() {}
    },
    ...overrides
  };
}

function makeTerrain(collisionWorld = new StaticCollisionWorld()) {
  return {
    collisionWorld,
    getMovementHeightAt(x, z) {
      return (x - z) * 0.01;
    },
    getHeightAt(x, z) {
      return (x - z) * 0.01;
    }
  };
}

function sortedPositions(units) {
  return units
    .flatMap(unit => (unit.soldierAI?.agents ?? []).map(agent => ({
      key: JSON.stringify([
        [typeof unit.id, unit.id],
        [typeof agent.id, agent.id]
      ]),
      position: [
        agent.position.x,
        agent.position.y,
        agent.position.z
      ]
    })))
    .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
}

function planarDistance(first, second) {
  return Math.hypot(
    first.position.x - second.position.x,
    first.position.z - second.position.z
  );
}

test('numeric and string stable IDs remain distinct and deterministic', () => {
  const run = reverse => {
    const numericAgent = makeAgent(2, 0, 0);
    const stringAgent = makeAgent('2', 0, 0);
    const numericUnit = makeSquad(1, [numericAgent]);
    const stringUnit = makeSquad('1', [stringAgent]);
    const units = reverse
      ? [stringUnit, numericUnit]
      : [numericUnit, stringUnit];
    const result = new InfantrySeparationSystem().resolve(units, makeTerrain());
    return { units, result };
  };

  const forward = run(false);
  const reversed = run(true);
  assert.equal(forward.result.candidateCount, 2);
  assert.equal(new Set(forward.result.candidateKeys).size, 2);
  assert.deepEqual(forward.result.correctedUnitIds, [1, '1']);
  assert.deepEqual(reversed.result, forward.result);
  assert.deepEqual(sortedPositions(reversed.units), sortedPositions(forward.units));
});

test('coincident same-squad and cross-squad soldiers separate by stable identity without drift', () => {
  const runCrossSquad = reverse => {
    const first = makeAgent('alpha', 3, -2);
    const second = makeAgent('bravo', 3, -2);
    const units = reverse
      ? [makeSquad('unit-z', [second]), makeSquad('unit-a', [first])]
      : [makeSquad('unit-a', [first]), makeSquad('unit-z', [second])];
    const collisionCalls = [];
    const staticWorld = new StaticCollisionWorld();
    const terrain = makeTerrain({
      resolveCircleMotion(position, displacement, radius, options) {
        collisionCalls.push({ radius, moverType: options.moverType });
        return staticWorld.resolveCircleMotion(
          position,
          displacement,
          radius,
          options
        );
      }
    });
    const result = new InfantrySeparationSystem().resolve(units, terrain);
    return { units, first, second, result, collisionCalls, terrain };
  };

  const forward = runCrossSquad(false);
  const reversed = runCrossSquad(true);
  assert.deepEqual(sortedPositions(reversed.units), sortedPositions(forward.units));
  assert.deepEqual(reversed.result, forward.result);
  assert.ok(
    planarDistance(forward.first, forward.second)
      >= INFANTRY_COLLISION_RADIUS * 2 - INFANTRY_SEPARATION_TOLERANCE
  );
  assert.equal(forward.result.converged, true);
  assert.equal(forward.collisionCalls.length, 4);
  assert.ok(forward.collisionCalls.every(call =>
    call.radius === INFANTRY_COLLISION_RADIUS
      && call.moverType === 'infantry'));
  assert.equal(forward.first.syncCount, 1);
  assert.equal(forward.second.syncCount, 1);

  const settled = sortedPositions(forward.units);
  const secondPass = new InfantrySeparationSystem().resolve(
    forward.units,
    forward.terrain
  );
  assert.deepEqual(sortedPositions(forward.units), settled);
  assert.equal(secondPass.correctionCount, 0);
  assert.deepEqual(secondPass.correctedSoldierKeys, []);

  const sameFirst = makeAgent('one', 0, 0);
  const sameSecond = makeAgent('two', 0.1, 0);
  const sameSquad = makeSquad('same-squad', [sameSecond, sameFirst]);
  const sameResult = new InfantrySeparationSystem().resolve(
    [sameSquad],
    makeTerrain()
  );
  assert.equal(sameResult.converged, true);
  assert.ok(
    planarDistance(sameFirst, sameSecond)
      >= INFANTRY_COLLISION_RADIUS * 2 - INFANTRY_SEPARATION_TOLERANCE
  );
});

test('stable fixed passes resolve or honestly report bounded multi-agent clusters', () => {
  const buildCluster = reverse => {
    const records = [
      ['a', 0, 0],
      ['b', 0.08, 0],
      ['c', 0.04, 0.06],
      ['d', 0.02, -0.04]
    ];
    const agents = new Map(records.map(([id, x, z]) => [
      id,
      makeAgent(id, x, z)
    ]));
    const unitAAgents = [agents.get('a'), agents.get('b')];
    const unitZAgents = [agents.get('c'), agents.get('d')];
    if (reverse) {
      unitAAgents.reverse();
      unitZAgents.reverse();
    }
    const unitA = makeSquad('cluster-a', unitAAgents);
    const unitZ = makeSquad('cluster-z', unitZAgents);
    const units = reverse ? [unitZ, unitA] : [unitA, unitZ];
    const result = new InfantrySeparationSystem().resolve(units, makeTerrain());
    return { units, result };
  };

  const forward = buildCluster(false);
  const reversed = buildCluster(true);
  assert.deepEqual(sortedPositions(reversed.units), sortedPositions(forward.units));
  assert.deepEqual(reversed.result, forward.result);
  assert.equal(
    forward.result.converged,
    forward.result.unresolvedPairCount === 0
  );
  assert.ok(forward.result.passes >= 1);
  assert.ok(forward.result.passes <= INFANTRY_SEPARATION_MAX_PASSES);
  assert.ok(
    forward.result.unresolvedPairs.length
      <= forward.result.unresolvedPairCount
  );
  const finalAgents = forward.units.flatMap(unit => unit.soldierAI.agents);
  for (const entry of sortedPositions(forward.units)) {
    assert.ok(entry.position.every(Number.isFinite));
  }
  if (forward.result.converged) {
    for (let first = 0; first < finalAgents.length; first++) {
      for (let second = first + 1; second < finalAgents.length; second++) {
        assert.ok(
          planarDistance(finalAgents[first], finalAgents[second])
            >= INFANTRY_COLLISION_RADIUS * 2
              - INFANTRY_SEPARATION_TOLERANCE
        );
      }
    }
  }

  const tooMany = Array.from(
    { length: INFANTRY_SEPARATION_MAX_CANDIDATES + 1 },
    (_, index) => makeAgent(`soldier-${index}`, index, 0)
  );
  assert.throws(
    () => new InfantrySeparationSystem().resolve(
      [makeSquad('oversized', tooMany)],
      makeTerrain()
    ),
    /exceeds supported maximum 256/
  );
  assert.deepEqual(
    tooMany.map(agent => agent.position.x),
    tooMany.map((_, index) => index),
    'candidate-bound failure must occur before any position mutation'
  );
});

test('static projection prevents wall crossing and reports an impossible overlap', () => {
  for (const type of ['stonewall', 'building']) {
    const blocker = {
      id: `${type}-blocker`,
      type,
      centerX: 0,
      centerZ: 0,
      halfX: 8,
      halfZ: 0.1,
      blocks: ['infantry']
    };
    const first = makeAgent('left', 0, -0.42);
    const second = makeAgent('right', 0, -0.42);
    const wallResult = new InfantrySeparationSystem().resolve(
      [makeSquad(`${type}-squad`, [first, second])],
      makeTerrain(new StaticCollisionWorld([blocker]))
    );
    assert.equal(wallResult.converged, true);
    assert.ok(first.position.z <= -0.42 + INFANTRY_SEPARATION_TOLERANCE);
    assert.ok(second.position.z <= -0.42 + INFANTRY_SEPARATION_TOLERANCE);
    assert.ok(
      planarDistance(first, second)
        >= INFANTRY_COLLISION_RADIUS * 2 - INFANTRY_SEPARATION_TOLERANCE
    );
  }

  const cageRecords = [
    {
      id: 'left',
      centerX: -1,
      centerZ: 0,
      halfX: 0.68,
      halfZ: 2,
      blocks: ['infantry']
    },
    {
      id: 'right',
      centerX: 1,
      centerZ: 0,
      halfX: 0.68,
      halfZ: 2,
      blocks: ['infantry']
    },
    {
      id: 'north',
      centerX: 0,
      centerZ: -1,
      halfX: 2,
      halfZ: 0.68,
      blocks: ['infantry']
    },
    {
      id: 'south',
      centerX: 0,
      centerZ: 1,
      halfX: 2,
      halfZ: 0.68,
      blocks: ['infantry']
    }
  ];
  const runCaged = reverse => {
    const one = makeAgent('one', 0, 0);
    const two = makeAgent('two', 0, 0);
    const agents = reverse ? [two, one] : [one, two];
    const units = [makeSquad('caged', agents)];
    const result = new InfantrySeparationSystem().resolve(
      units,
      makeTerrain(new StaticCollisionWorld(cageRecords))
    );
    return { units, result };
  };
  const caged = runCaged(false);
  const cagedReversed = runCaged(true);
  assert.equal(caged.result.converged, false);
  assert.equal(caged.result.unresolvedPairCount, 1);
  assert.equal(caged.result.unresolvedPairs.length, 1);
  assert.deepEqual(cagedReversed.result, caged.result);
  assert.deepEqual(sortedPositions(cagedReversed.units), sortedPositions(caged.units));
  for (const entry of sortedPositions(caged.units)) {
    assert.ok(
      Math.abs(entry.position[0]) <= INFANTRY_SEPARATION_TOLERANCE
    );
    assert.ok(
      Math.abs(entry.position[2]) <= INFANTRY_SEPARATION_TOLERANCE
    );
  }
});

test('dead, carried, interior, transit, exiting, vehicle, and structure actors never move', () => {
  const excluded = [
    makeAgent('dead', 20, 20, { isAlive: false, status: 'KIA' }),
    makeAgent('incapacitated', 20, 20, { status: 'INCAPACITATED' }),
    makeAgent('carried', 20, 20, { vehicleLocation: { vehicleId: 'truck' } }),
    makeAgent('occupied', 20, 20, { buildingLocation: { phase: 'occupied' } }),
    makeAgent('transit', 20, 20, { buildingLocation: { phase: 'transit' } }),
    makeAgent('exit-waiting', 20, 20, { buildingLocation: { phase: 'exit-waiting' } }),
    makeAgent('exiting', 20, 20, { buildingLocation: { phase: 'exiting' } })
  ];
  const outside = makeAgent('outside', 0, 0, {
    buildingLocation: { phase: 'outside' }
  });
  const approaching = makeAgent('approaching', 0, 0, {
    buildingLocation: { phase: 'approaching' }
  });
  const vehicleActor = makeAgent('vehicle-actor', 20, 20);
  const structureActor = makeAgent('structure-actor', 20, 20);
  const infantry = makeSquad(
    'eligible-and-excluded',
    [approaching, ...excluded, outside]
  );
  const vehicle = {
    ...makeSquad('vehicle', [vehicleActor]),
    type: 'vehicle'
  };
  const structure = {
    ...makeSquad('structure', [structureActor]),
    type: 'structure'
  };
  const before = new Map(
    [...excluded, vehicleActor, structureActor].map(agent => [
      agent.id,
      structuredClone(agent.position)
    ])
  );

  const result = new InfantrySeparationSystem().resolve(
    [structure, infantry, vehicle],
    makeTerrain()
  );
  assert.equal(result.candidateCount, 2);
  assert.equal(result.converged, true);
  assert.ok(
    planarDistance(outside, approaching)
      >= INFANTRY_COLLISION_RADIUS * 2 - INFANTRY_SEPARATION_TOLERANCE
  );
  for (const agent of [...excluded, vehicleActor, structureActor]) {
    assert.deepEqual(agent.position, before.get(agent.id));
    assert.equal(agent.syncCount, 0);
  }
});

test('fixed-step partitions and real Unit capture/restore replay the same positions', () => {
  const runPartition = frameBudgets => {
    const first = makeAgent('first', 0, 0);
    const second = makeAgent('second', 0, 0);
    const units = [makeSquad('partition', [first, second])];
    const system = new InfantrySeparationSystem();
    const terrain = makeTerrain();
    const stepper = new FixedStepAccumulator(1 / 30);
    let steps = 0;
    for (const frameBudget of frameBudgets) {
      stepper.advance(frameBudget, () => {
        system.resolve(units, terrain);
        steps++;
      });
    }
    return { positions: sortedPositions(units), steps };
  };
  const oneFrame = runPartition([0.1]);
  const splitFrames = runPartition([0.04, 0.01, 0.05]);
  assert.equal(oneFrame.steps, 3);
  assert.equal(splitFrames.steps, 3);
  assert.deepEqual(splitFrames.positions, oneFrame.positions);

  const units = [
    new Unit({
      id: 'rollback-a',
      faction: 'french',
      type: 'infantry_squad',
      position: new THREE.Vector3(-20, 0, 0)
    }),
    new Unit({
      id: 'rollback-b',
      faction: 'german',
      type: 'infantry_squad',
      position: new THREE.Vector3(20, 0, 0)
    })
  ];
  for (const [unitIndex, unit] of units.entries()) {
    for (const [agentIndex, agent] of unit.soldierAI.agents.entries()) {
      agent.position.set(unitIndex * 40 + agentIndex * 2, 0, 0);
      agent.syncRecord();
    }
  }
  units[0].soldierAI.agents[0].position.set(0, 0, 0);
  units[1].soldierAI.agents[0].position.set(0, 0, 0);
  units[0].soldierAI.agents[0].syncRecord();
  units[1].soldierAI.agents[0].syncRecord();
  const snapshots = units.map(unit => unit.captureState());
  const system = new InfantrySeparationSystem();
  const terrain = makeTerrain();
  system.resolve(units, terrain);
  const expected = sortedPositions(units);

  for (const unit of units) {
    for (const agent of unit.soldierAI.agents) {
      agent.position.set(99, 99, 99);
      agent.syncRecord();
    }
  }
  const unitMap = new Map(units.map(unit => [unit.id, unit]));
  units.forEach((unit, index) => unit.restoreState(snapshots[index], unitMap));
  system.resolve(units, terrain);
  assert.deepEqual(sortedPositions(units), expected);
});

test('SoldierAgent static movement consumes the shared collision radius', () => {
  const unit = new Unit({
    id: 'shared-radius',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3()
  });
  assert.equal(unit.collisionRadius, INFANTRY_COLLISION_RADIUS);
  const agent = unit.soldierAI.agents[0];
  const radii = [];
  const terrain = {
    getHeightAt() {
      return 0;
    },
    getMovementHeightAt() {
      return 0;
    },
    collisionWorld: {
      getNavigationTarget(_start, goal) {
        return goal;
      },
      resolveCircleMotion(position, displacement, radius, options) {
        radii.push({ radius, moverType: options.moverType });
        return {
          x: position.x + displacement.x,
          z: position.z + displacement.z,
          movedX: displacement.x,
          movedZ: displacement.z,
          contacts: []
        };
      }
    }
  };
  agent.updateMovement(0, terrain, {
    goal: agent.position.clone(),
    neighbors: unit.soldierAI.agents,
    anchorMoving: false,
    orderType: 'QUICK',
    squadPinned: false,
    waypointIndex: 0
  });
  assert.deepEqual(radii, [{
    radius: INFANTRY_COLLISION_RADIUS,
    moverType: 'infantry'
  }]);
});

test('GameApp simulateStep resolves after all units and before building transit', () => {
  const events = [];
  const first = makeAgent('first', 0, 0);
  const second = makeAgent('second', 0, 0);
  const makeRuntimeSquad = (id, agent) => {
    const unit = makeSquad(id, [agent]);
    const typedId = `${typeof id}:${id}`;
    unit.update = () => events.push(`unit:${typedId}`);
    unit.soldierAI.syncMeshes = () => events.push(`mesh:${typedId}`);
    unit.soldierAI.advanceSupportAmmunitionTransfers = () => {
      events.push(`ammo:${typedId}`);
    };
    return unit;
  };
  const firstUnit = makeRuntimeSquad(1, first);
  const secondUnit = makeRuntimeSquad(2, second);
  const stringCollisionUnit = makeRuntimeSquad(
    '1',
    makeAgent('excluded', 10, 10, { isAlive: false, status: 'KIA' })
  );
  const system = new InfantrySeparationSystem();
  const terrain = makeTerrain();
  const simulation = {
    movedUnitIds: new Set(),
    units: [stringCollisionUnit, secondUnit, firstUnit],
    terrain,
    infantrySeparation: {
      resolve(units, runtimeTerrain) {
        assert.deepEqual(events, [
          'unit:string:1',
          'unit:number:2',
          'unit:number:1'
        ]);
        events.push('separation');
        return system.resolve(units, runtimeTerrain);
      }
    },
    factionRoster: {
      opposingUnitsFor() {
        return [];
      },
      unitsFor() {
        return [];
      }
    },
    hasContact() {
      return false;
    },
    buildingInteraction: {
      advance() {
        assert.ok(
          planarDistance(first, second)
            >= INFANTRY_COLLISION_RADIUS * 2
              - INFANTRY_SEPARATION_TOLERANCE
        );
        events.push('building');
        first.position.x = 4;
        first.syncRecord();
      }
    },
    syncBuildingInteriorPresentation() {
      events.push('interior-sync');
    },
    spotting: {
      advance() {
        assert.equal(first.position.x, 4);
        events.push('spotting');
      }
    },
    factionOrder: [],
    combat: {
      update() {
        events.push('combat');
      }
    },
    support: {
      update() {
        events.push('support');
      }
    }
  };

  GameApp.prototype.simulateStep.call(simulation, 1 / 30);

  assert.deepEqual(events, [
    'unit:string:1',
    'unit:number:2',
    'unit:number:1',
    'separation',
    'mesh:number:2',
    'mesh:number:1',
    'building',
    'interior-sync',
    'ammo:string:1',
    'ammo:number:2',
    'ammo:number:1',
    'spotting',
    'combat',
    'support'
  ]);
});
