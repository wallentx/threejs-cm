import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameApp } from '../src/app/GameApp.js';
import { Unit } from './helpers/France1940TestUnit.js';

function unit(id, faction = 'blue') {
  return {
    id,
    faction,
    position: new THREE.Vector3(),
    mesh: {
      userData: {
        selectionDisc: { visible: false }
      }
    }
  };
}

test('selection is friendly-only, additive, camera-neutral, and group-command aware', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { body: { dataset: {} } };

  try {
    const first = unit('blue-1');
    const second = unit('blue-2');
    const enemy = unit('red-1', 'red');
    const commandSelections = [];
    const hudSelections = [];
    const cameraFocusIds = [];
    let clearedHud = 0;
    let cameraHomeResets = 0;
    const app = Object.create(GameApp.prototype);
    app.playerFactionId = 'blue';
    app.units = [first, second, enemy];
    app.selectedUnit = null;
    app.selectedUnits = [];
    app.buildingInteraction = {
      getInteriorPresenceCounts() { return {}; }
    };
    app.buildingSystem = {
      getBuildingIds() { return []; }
    };
    app.terrain = {
      setBuildingInteriorPresence() {}
    };
    app.commands = {
      setActiveUnits(units, primary) {
        commandSelections.push({
          ids: units.map(candidate => candidate.id),
          primaryId: primary?.id ?? null
        });
      }
    };
    app.cameraManager = {
      followUnit: first,
      focusTarget(position) {
        this.followUnit = null;
        cameraFocusIds.push(
          app.units.find(candidate => candidate.position === position)?.id
        );
      },
      resetHome() {
        cameraHomeResets++;
      }
    };
    app.ui = {
      updateUnitHUD(selected) {
        hudSelections.push(selected.id);
      },
      clearUnitHUD() {
        clearedHud++;
      },
      renderCommandGrid() {}
    };

    assert.equal(app.selectUnit(first), true);
    assert.deepEqual(app.selectedUnits, [first]);
    assert.equal(app.selectedUnit, first);
    assert.equal(first.mesh.userData.selectionDisc.visible, true);
    assert.equal(second.mesh.userData.selectionDisc.visible, false);
    assert.equal(app.cameraManager.followUnit, null);
    assert.deepEqual(cameraFocusIds, []);

    assert.equal(app.selectUnit(second, { additive: true }), true);
    assert.deepEqual(app.selectedUnits, [first, second]);
    assert.equal(app.selectedUnit, second);
    assert.equal(first.mesh.userData.selectionDisc.visible, true);
    assert.equal(second.mesh.userData.selectionDisc.visible, true);
    assert.equal(document.body.dataset.selectedUnits, 'blue-1,blue-2');
    assert.deepEqual(commandSelections.at(-1), {
      ids: ['blue-1', 'blue-2'],
      primaryId: 'blue-2'
    });

    assert.equal(app.selectUnit(second, { additive: true }), true);
    assert.deepEqual(app.selectedUnits, [first]);
    assert.equal(app.selectedUnit, first);
    assert.equal(second.mesh.userData.selectionDisc.visible, false);

    assert.equal(app.selectUnit(enemy), false);
    assert.deepEqual(app.selectedUnits, [first]);
    assert.deepEqual(hudSelections, ['blue-1', 'blue-2', 'blue-1']);

    assert.equal(app.inspectUnit(enemy), true);
    assert.deepEqual(app.selectedUnits, []);
    assert.equal(app.selectedUnit, null);
    assert.equal(app.inspectedUnit, enemy);
    assert.equal(hudSelections.at(-1), 'red-1');
    assert.deepEqual(cameraFocusIds, []);
    assert.deepEqual(commandSelections.at(-1), {
      ids: [],
      primaryId: null
    });

    enemy.mesh.visible = false;
    assert.equal(app.inspectUnit(enemy), false);
    enemy.mesh.visible = true;

    app.deselectUnit();
    assert.deepEqual(app.selectedUnits, []);
    assert.equal(app.selectedUnit, null);
    assert.equal(first.mesh.userData.selectionDisc.visible, false);
    assert.equal(document.body.dataset.selectedUnit, 'none');
    assert.equal(clearedHud, 2);
    assert.equal(cameraHomeResets, 0);

    app.selectUnit(first, { frameCamera: true });
    assert.deepEqual(cameraFocusIds, ['blue-1']);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('dead or incapacitated units lose controllability and are pruned from selection and overlays', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { body: { dataset: {} } };

  try {
    const livingInfantry = {
      id: 'infantry-live',
      faction: 'blue',
      position: new THREE.Vector3(0, 0, 0),
      currentWaypointIndex: 0,
      waypoints: [{ position: new THREE.Vector3(10, 0, 0), orderType: 'QUICK' }],
      soldierAI: {
        getLivingAgents() {
          return [{ id: 's1', status: 'OK', health: 100 }];
        }
      },
      mesh: { userData: { selectionDisc: { visible: false } } },
      isControllable() { return true; }
    };

    const deadInfantry = {
      id: 'infantry-dead',
      faction: 'blue',
      position: new THREE.Vector3(5, 0, 5),
      currentWaypointIndex: 0,
      waypoints: [{ position: new THREE.Vector3(15, 0, 5), orderType: 'QUICK' }],
      soldierAI: {
        getLivingAgents() {
          return [];
        }
      },
      mesh: { userData: { selectionDisc: { visible: false } } },
      isControllable() { return false; }
    };

    const app = Object.create(GameApp.prototype);
    app.playerFactionId = 'blue';
    app.units = [livingInfantry, deadInfantry];
    app.selectedUnit = null;
    app.selectedUnits = [];
    app.buildingInteraction = { getInteriorPresenceCounts() { return {}; } };
    app.buildingSystem = { getBuildingIds() { return []; } };
    app.terrain = { setBuildingInteriorPresence() {} };
    app.commands = {
      setActiveUnits() {}
    };
    app.cameraManager = { followUnit: null, focusTarget() {} };
    app.ui = { updateUnitHUD() {}, clearUnitHUD() {}, renderCommandGrid() {} };

    // Dead unit cannot be selected
    assert.equal(app.selectUnit(deadInfantry), false);
    assert.deepEqual(app.selectedUnits, []);

    // Living unit selects cleanly
    assert.equal(app.selectUnit(livingInfantry), true);
    assert.deepEqual(app.selectedUnits, [livingInfantry]);

    // Prune test: if living unit becomes uncontrollable (dead), pruneUncontrollableSelections clears selection
    livingInfantry.isControllable = () => false;
    app.pruneUncontrollableSelections();
    assert.deepEqual(app.selectedUnits, []);
    assert.equal(app.selectedUnit, null);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('intact crewless structures remain controllable while destroyed structures do not', () => {
  const bunker = new Unit({
    id: 'bunker-live',
    type: 'bunker',
    faction: 'german',
    position: new THREE.Vector3(0, 0, 0)
  });

  assert.deepEqual(bunker.roster, []);
  assert.equal(bunker.structureState.destroyed, false);
  assert.equal(bunker.isControllable(), true);

  bunker.structureState.destroyed = true;
  assert.equal(bunker.isControllable(), false);
});
