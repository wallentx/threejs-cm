import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createMapEditorPort,
  createUIRuntimePort
} from '../src/app/ApplicationPorts.js';

function runtimeHarness() {
  const calls = [];
  const unit = {
    id: 'blue-1',
    isHiding: false,
    holdFire: false,
    isDeployed: false,
    stance: 'STANDING',
    targetUnit: { id: 'red-1' },
    targetPos: { x: 1, z: 2 },
    targetAimIntent: { point: [1, 0, 2] },
    targetMode: 'TARGET',
    addPause: seconds => calls.push(['pause', seconds]),
    clearWaypoints: () => calls.push(['clear-paths']),
    clearTargetOrder() {
      this.targetUnit = null;
      this.targetPos = null;
      this.targetAimIntent = null;
      this.targetMode = null;
      calls.push(['clear-target']);
      return true;
    },
    updateStanceVisuals: () => calls.push(['stance']),
    toggleCrewServedDeployment() {
      this.isDeployed = true;
      this.stance = 'KNEELING';
      calls.push(['mortar-deployment', 'SETTING_UP']);
      return 'SETTING_UP';
    },
    toggleVehicleCommanderPosture() {
      calls.push(['commander-posture', 'UNBUTTONED']);
      return 'UNBUTTONED';
    },
    toggleHoldFire() {
      this.holdFire = !this.holdFire;
      calls.push(['hold-fire', this.holdFire]);
      return this.holdFire;
    },
    dismountTransportCrew() {
      calls.push(['crew-dismount', this.id]);
      return { accepted: true };
    },
    remountTransportCrew() {
      calls.push(['crew-remount', this.id]);
      return { accepted: true };
    }
  };
  let selectedUnit = unit;
  let selectedUnits = [unit];
  const buildingFloorIds = ['ground-floor', 'upper-floor'];
  const wego = {
    playMode: 'wego',
    phase: 'COMMAND_PHASE',
    isPlaying: false,
    executeTurn: () => calls.push(['execute']),
    togglePlayPause: () => calls.push(['toggle-play']),
    rewindTurn: () => calls.push(['rewind']),
    stepTime: seconds => calls.push(['step', seconds]),
    toggleFastSpeed: () => calls.push(['speed']),
    seekTime: seconds => calls.push(['seek', seconds]),
    setPlayMode: mode => {
      wego.playMode = mode;
      calls.push(['mode', mode]);
    }
  };
  const commands = {
    activeMode: null,
    pathLinesGroup: { visible: true },
    targetLinesGroup: { visible: true },
    setCommandMode(mode) {
      this.activeMode = mode;
      calls.push(['command', mode]);
      return mode;
    },
    cancelActiveMode() {
      const previous = this.activeMode;
      this.activeMode = null;
      calls.push(['cancel', previous]);
      return previous;
    },
    renderOverlays: () => calls.push(['overlays']),
    onBuildingOrder: (...args) => {
      calls.push(['building-order', ...args]);
      return { accepted: true };
    }
  };
  const sound = { enabled: true };
  const port = createUIRuntimePort({
    wego,
    commands,
    sound,
    cameraManager: {
      setHeightPreset: level => calls.push(['camera', level])
    },
    shotTrajectoryOverlay: {
      clear: () => calls.push(['trajectory-clear']),
      toggle: record => calls.push(['trajectory-toggle', record.id])
    },
    mapDimensions: { width: 300, depth: 180 },
    factionPresentation: {
      blue: { flagGlyph: 'B', selectionColor: '#1122ff' },
      red: { flagGlyph: 'R', selectionColor: '#ff2211' }
    },
    playerFactionId: 'blue',
    getSelectedUnit: () => selectedUnit,
    getSelectedUnits: () => selectedUnits,
    getDisplayedUnit: () => selectedUnit,
    getVisibilityProjection: () => ({ visibleUnitIds: ['blue-1'], contacts: [] }),
    getBocageObstacles: () => [{ id: 'hedge-1' }],
    getImpacts: () => [{ id: 9 }],
    getDebugDiagnostics: () => ({
      frame: { fps: 60 },
      renderer: { drawCalls: 12 },
      overlays: { hitboxes: 3 },
      lod: { high: 2, medium: 1, low: 4 }
    }),
    getDebugOverlayState: () => ({ hitboxes: false }),
    getHoveredUnitId: () => 'blue-1',
    setDebugOverlayEnabled: (name, enabled) => {
      calls.push(['debug-overlay', name, enabled]);
      return enabled;
    },
    getBuildingFloorIds: buildingId =>
      buildingId === 'house-1' ? buildingFloorIds : [],
    selectUnit: (next, { additive = false } = {}) => {
      selectedUnits = additive
        ? [...selectedUnits, next]
        : [next];
      selectedUnit = next;
    },
    inspectUnit: next => {
      selectedUnits = [];
      selectedUnit = next;
      calls.push(['inspect', next.id]);
    },
    deselectUnit: () => {
      selectedUnit = null;
      selectedUnits = [];
    },
    splitUnit: selected => calls.push(['split', selected.id]),
    issueBuildingExit: selected => calls.push(['exit', selected.id]),
    requestTransportMount: selected => {
      calls.push(['mount', selected.id]);
      return { accepted: true };
    },
    requestTransportDismount: selected => {
      calls.push(['dismount', selected.id]);
      return { accepted: true };
    },
    resupplyFromTransport: selected => {
      calls.push(['resupply', selected.id]);
      return { accepted: true };
    }
  });
  return { port, unit, wego, commands, sound, calls, getSelected: () => selectedUnit };
}

test('UI runtime port exposes explicit queries and delegates named commands', () => {
  const { port, unit, wego, commands, sound, calls, getSelected } = runtimeHarness();

  assert.equal(port.selectedUnit, unit);
  assert.deepEqual(port.selectedUnits, [unit]);
  assert.equal(port.playerFactionId, 'blue');
  assert.equal(port.isPlayerFaction('blue'), true);
  assert.equal(port.getFactionPresentation('red').flagGlyph, 'R');
  assert.deepEqual(port.mapDimensions, { width: 300, depth: 180 });
  assert.deepEqual(port.getImpacts(), [{ id: 9 }]);
  assert.equal(port.hoveredUnitId, 'blue-1');
  assert.deepEqual(port.getDebugDiagnostics().lod, {
    high: 2,
    medium: 1,
    low: 4
  });
  assert.equal(port.setDebugOverlayEnabled('hitboxes', true), true);
  const floorIds = port.getBuildingFloorIds('house-1');
  assert.deepEqual(floorIds, ['ground-floor', 'upper-floor']);
  floorIds.pop();
  assert.deepEqual(port.getBuildingFloorIds('house-1'), [
    'ground-floor',
    'upper-floor'
  ]);
  assert.equal(port.canIssueOrders(), true);

  port.executeTurn();
  port.stepTime(-5);
  port.setCommandMode('TARGET');
  port.setPathsVisible(false);
  port.setCameraHeight(4);
  port.clearShotTrajectory();
  port.toggleShotTrajectory({ id: 9 });
  assert.equal(port.toggleSound(), false);
  assert.equal(sound.enabled, false);
  assert.equal(commands.pathLinesGroup.visible, false);
  assert.equal(commands.targetLinesGroup.visible, false);
  assert.deepEqual(calls.slice(1, 7), [
    ['execute'],
    ['step', -5],
    ['command', 'TARGET'],
    ['camera', 4],
    ['trajectory-clear'],
    ['trajectory-toggle', 9]
  ]);

  wego.phase = 'ACTION_PHASE';
  assert.equal(port.canIssueOrders(), false);
  wego.playMode = 'realtime';
  assert.equal(port.canIssueOrders(), true);

  port.deselectUnit();
  assert.equal(getSelected(), null);
});

test('UI runtime port owns direct selected-unit mutations and building event binding', () => {
  const { port, unit, commands, calls } = runtimeHarness();
  let buildingMove = null;
  port.onBuildingMoveRequested((...args) => {
    buildingMove = args;
    return true;
  });
  assert.equal(commands.onBuildingMoveClick(unit, { x: 1 }, 'house-1', 'QUICK'), true);
  assert.deepEqual(buildingMove, [unit, { x: 1 }, 'house-1', 'QUICK']);

  port.addPause(15);
  port.clearPaths();
  port.clearTarget();
  assert.equal(port.toggleHiding(), true);
  assert.equal(port.toggleHoldFire(), true);
  assert.equal(port.toggleDeployment(), 'SETTING_UP');
  assert.equal(port.toggleVehicleCommanderPosture(), 'UNBUTTONED');
  assert.deepEqual(calls.at(-1), ['commander-posture', 'UNBUTTONED']);
  port.splitSelectedUnit();
  port.exitSelectedBuilding();
  assert.deepEqual(port.mountSelectedUnit(), { accepted: true });
  assert.deepEqual(port.dismountSelectedUnit(), { accepted: true });
  assert.deepEqual(port.resupplySelectedUnit(), { accepted: true });
  assert.deepEqual(port.dismountSelectedTransportCrew(), { accepted: true });
  assert.deepEqual(port.remountSelectedTransportCrew(), { accepted: true });
  assert.deepEqual(port.issueBuildingOrder(
    unit,
    'ENTER_UPPER',
    { x: 2 },
    'house-1',
    'SNEAK'
  ), {
    accepted: true
  });
  assert.ok(calls.some(call =>
    call[0] === 'building-order'
      && call[1] === unit
      && call[2] === 'ENTER_UPPER'
      && call[4] === 'house-1'
      && call[5] === 'SNEAK'
  ));

  assert.equal(unit.targetUnit, null);
  assert.equal(unit.targetPos, null);
  assert.equal(unit.targetAimIntent, null);
  assert.equal(unit.targetMode, null);
  assert.equal(unit.isHiding, true);
  assert.equal(unit.holdFire, true);
  assert.equal(unit.isDeployed, true);
  assert.equal(unit.stance, 'KNEELING');
  assert.ok(calls.some(call => call[0] === 'split' && call[1] === unit.id));
  assert.ok(calls.some(call => call[0] === 'exit' && call[1] === unit.id));
  for (const action of [
    'mount',
    'dismount',
    'resupply',
    'crew-dismount',
    'crew-remount'
  ]) {
    assert.ok(calls.some(call => call[0] === action && call[1] === unit.id));
  }
});

test('map editor port limits authoring to explicit terrain, scene, and notification actions', () => {
  const obstacles = [];
  const terrainCalls = [];
  const objects = [];
  const notices = [];
  const port = createMapEditorPort({
    terrain: {
      bocageObstacles: obstacles,
      addBocageObstacle: obstacle => {
        terrainCalls.push(obstacle);
        obstacles.push(obstacle);
      },
      getHeightAt: (x, z) => x - z
    },
    scene: {
      add: object => objects.push(object)
    },
    notify: (...notice) => notices.push(notice)
  });
  const obstacle = { id: 'hedge-1' };
  const object = { id: 'mesh-1' };

  assert.equal(port.getTerrainHeight(8, 3), 5);
  port.addBocageObstacle(obstacle);
  port.addSceneObject(object);
  port.notify('placed', 'info');
  assert.deepEqual(obstacles, [obstacle]);
  assert.deepEqual(terrainCalls, [obstacle]);
  assert.deepEqual(objects, [object]);
  assert.deepEqual(notices, [['placed', 'info']]);
});

test('UI and editor clients retain explicit ports without concrete GameApp or faction assumptions', async () => {
  const sources = await Promise.all([
    readFile(new URL('../src/ui/UIManager.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/Minimap.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/editor/MapEditor.js', import.meta.url), 'utf8')
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /\bthis\.game\b|new GameApp|from ['"].*GameApp/);
  }
  for (const source of sources.slice(0, 2)) {
    assert.doesNotMatch(
      source,
      /['"](?:french|german)['"]|🇫🇷|🇩🇪/
    );
  }
});
