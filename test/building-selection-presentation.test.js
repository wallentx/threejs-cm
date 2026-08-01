import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameApp } from '../src/app/GameApp.js';
import { BuildingInteractionSystem } from '../src/game/BuildingInteractionSystem.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';

function createUnit(id, faction, buildingId = null, {
  phase = 'occupied',
  alive = true
} = {}) {
  const agent = {
    id: `${id}-soldier`,
    isAlive: alive,
    buildingLocation: buildingId ? {
      buildingId,
      phase,
      soldierKey: `${id}:${id}-soldier`
    } : null
  };
  return {
    id,
    faction,
    position: new THREE.Vector3(),
    mesh: { userData: { selectionDisc: { visible: false } } },
    soldierAI: {
      agents: [agent],
      getLivingAgents: () => alive ? [agent] : []
    },
    captureState: () => ({ id }),
    restoreState() {}
  };
}

function createHarness() {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  for (const id of ['house-a', 'house-b']) {
    buildings.addBuilding({
      id,
      descriptorId: FR_HOUSE_12X9_2F.id,
      transform: { position: [0, 0, 0], rotationY: 0 }
    });
  }

  const first = createUnit('blue-a', 'blue', 'house-a');
  const second = createUnit('blue-b', 'blue', 'house-b');
  const enemy = createUnit('red-a', 'red', 'house-a');
  const outside = createUnit('blue-outside', 'blue');
  const units = [first, second, enemy, outside];
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => units
  });
  const projected = new Map();
  const projectionCalls = [];
  const app = Object.create(GameApp.prototype);
  Object.assign(app, {
    playerFactionId: 'blue',
    units,
    selectedUnit: null,
    selectedUnits: [],
    inspectedUnit: null,
    buildingSystem: buildings,
    buildingInteraction: interactions,
    terrain: {
      setBuildingInteriorPresence(buildingId, presence) {
        projected.set(buildingId, presence);
        projectionCalls.push([buildingId, presence]);
      },
      captureDestructibleObstacleState: () => null,
      restoreDestructibleObstacleState() {},
      syncBuildingRuntime() {}
    },
    commands: {
      setActiveUnits() {},
      renderOverlays() {}
    },
    cameraManager: {
      followUnit: null,
      focusTarget() {},
      resetHome() {}
    },
    ui: {
      updateUnitHUD() {},
      clearUnitHUD() {},
      renderCommandGrid() {}
    },
    simulationStepper: { reset() {} },
    spottingStepper: { reset() {}, remainderSeconds: 0, stepSeconds: 0.1 },
    spotting: {
      captureState: () => ({}),
      restoreState() {},
      invalidateBuildingColliders() {}
    },
    combat: { captureState: () => ({}), restoreState() {} },
    support: { captureState: () => ({}), restoreState() {} },
    vehicleDamageEffects: { resetTransient() {} },
    shotTrajectoryOverlay: { clear() {} },
    randomState: 123,
    matchStarted: false
  });
  return {
    app, buildings, interactions, projected, projectionCalls,
    first, second, enemy, outside
  };
}

test('interior presence query filters by stable unit IDs without changing aggregate policy', () => {
  const { interactions } = createHarness();

  assert.deepEqual(interactions.getInteriorPresenceCounts(), {
    'house-a': 2,
    'house-b': 1
  });
  assert.deepEqual(
    interactions.getInteriorPresenceCounts(new Set(['blue-a', 'blue-b'])),
    { 'house-a': 1, 'house-b': 1 }
  );
  assert.deepEqual(
    interactions.getInteriorPresenceCounts(new Set(['blue-b'])),
    { 'house-b': 1 }
  );
  assert.deepEqual(interactions.getInteriorPresenceCounts(new Set()), {});
  assert.deepEqual(
    interactions.getInteriorPresenceCounts(new Set(['blue-outside'])),
    {}
  );
});

test('selection switch, add, toggle, clear, and enemy inspection project only selected friendly interiors', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { body: { dataset: {} } };
  try {
    const {
      app, buildings, projected, first, second, enemy
    } = createHarness();
    const unchangedBuildings = buildings.captureState();

    assert.equal(app.selectUnit(first), true);
    assert.deepEqual(Object.fromEntries(projected), {
      'house-a': 1,
      'house-b': 0
    });

    assert.equal(app.selectUnit(second), true);
    assert.deepEqual(Object.fromEntries(projected), {
      'house-a': 0,
      'house-b': 1
    });

    assert.equal(app.selectUnit(first, { additive: true }), true);
    assert.deepEqual(Object.fromEntries(projected), {
      'house-a': 1,
      'house-b': 1
    });

    assert.equal(app.selectUnit(first, { additive: true }), true);
    assert.deepEqual(Object.fromEntries(projected), {
      'house-a': 0,
      'house-b': 1
    });

    assert.equal(app.inspectUnit(enemy), true);
    assert.deepEqual(Object.fromEntries(projected), {
      'house-a': 0,
      'house-b': 0
    });

    app.deselectUnit();
    assert.deepEqual(Object.fromEntries(projected), {
      'house-a': 0,
      'house-b': 0
    });
    assert.deepEqual(buildings.captureState(), unchangedBuildings);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('capture and restore derive final presentation from restored selection, including no selection', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { body: { dataset: {} } };
  try {
    const {
      app, buildings, projected, projectionCalls, first, second
    } = createHarness();
    const unchangedBuildings = buildings.captureState();

    app.selectUnit(first);
    const selectedSnapshot = app.captureSimulationState();
    app.selectUnit(second);
    projectionCalls.length = 0;
    app.restoreSimulationState(selectedSnapshot);
    assert.deepEqual(app.selectedUnits.map(unit => unit.id), ['blue-a']);
    assert.deepEqual(Object.fromEntries(projected), {
      'house-a': 1,
      'house-b': 0
    });
    assert.deepEqual(projectionCalls, [
      ['house-a', 1],
      ['house-b', 0]
    ], 'restore performs one final projection from restored selection');

    app.deselectUnit();
    const emptySnapshot = app.captureSimulationState();
    app.selectUnit(second);
    projectionCalls.length = 0;
    app.restoreSimulationState(emptySnapshot);
    assert.deepEqual(app.selectedUnits, []);
    assert.deepEqual(Object.fromEntries(projected), {
      'house-a': 0,
      'house-b': 0
    });
    assert.deepEqual(projectionCalls, [
      ['house-a', 0],
      ['house-b', 0]
    ]);
    assert.deepEqual(buildings.captureState(), unchangedBuildings);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
