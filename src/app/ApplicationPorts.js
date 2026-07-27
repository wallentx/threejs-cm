const requireFunction = (value, label) => {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
  return value;
};

const requireRecord = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  return value;
};

const selectedAction = (getSelectedUnit, action) => {
  const unit = getSelectedUnit();
  if (!unit) return null;
  return action(unit);
};

/**
 * Explicit browser-UI boundary. The adapter exposes named queries, commands,
 * and one event subscription without leaking GameApp or subsystem objects.
 */
export function createUIRuntimePort({
  wego,
  commands,
  sound,
  cameraManager,
  shotTrajectoryOverlay,
  mapDimensions,
  factionPresentation,
  playerFactionId,
  getSelectedUnit,
  getVisibilityProjection,
  getBocageObstacles,
  getImpacts,
  selectUnit,
  deselectUnit,
  splitUnit,
  issueBuildingExit
}) {
  requireRecord(wego, 'UI runtime WEGO dependency');
  requireRecord(commands, 'UI runtime command dependency');
  requireRecord(sound, 'UI runtime sound dependency');
  requireRecord(cameraManager, 'UI runtime camera dependency');
  requireRecord(shotTrajectoryOverlay, 'UI runtime trajectory dependency');
  const dimensions = requireRecord(mapDimensions, 'UI runtime map dimensions');
  if (!Number.isFinite(dimensions.width) || dimensions.width <= 0
      || !Number.isFinite(dimensions.depth) || dimensions.depth <= 0) {
    throw new Error('UI runtime map dimensions must be positive');
  }
  const presentations = requireRecord(
    factionPresentation,
    'UI runtime faction presentation'
  );
  if (!presentations[playerFactionId]) {
    throw new Error(`UI runtime requires player faction presentation ${playerFactionId}`);
  }

  for (const [label, value] of Object.entries({
    getSelectedUnit,
    getVisibilityProjection,
    getBocageObstacles,
    getImpacts,
    selectUnit,
    deselectUnit,
    splitUnit,
    issueBuildingExit
  })) {
    requireFunction(value, `UI runtime ${label}`);
  }

  return Object.freeze({
    mapDimensions: Object.freeze({
      width: dimensions.width,
      depth: dimensions.depth
    }),
    playerFactionId,
    get selectedUnit() {
      return getSelectedUnit();
    },
    get commandMode() {
      return commands.activeMode;
    },
    get playMode() {
      return wego.playMode;
    },
    get phase() {
      return wego.phase;
    },
    get isPlaying() {
      return wego.isPlaying;
    },
    canIssueOrders() {
      return wego.playMode === 'realtime' || wego.phase === 'COMMAND_PHASE';
    },
    getFactionPresentation(factionId) {
      return presentations[factionId] ?? null;
    },
    isPlayerFaction(factionId) {
      return factionId === playerFactionId;
    },
    getVisibilityProjection,
    getBocageObstacles,
    getImpacts,
    onBuildingMoveRequested(handler) {
      commands.onBuildingMoveClick = requireFunction(
        handler,
        'UI building-move handler'
      );
    },
    executeTurn() {
      return wego.executeTurn();
    },
    togglePlayPause() {
      return wego.togglePlayPause();
    },
    rewindTurn() {
      return wego.rewindTurn();
    },
    stepTime(seconds) {
      return wego.stepTime(seconds);
    },
    toggleFastSpeed() {
      return wego.toggleFastSpeed();
    },
    seekTime(seconds) {
      return wego.seekTime(seconds);
    },
    setPlayMode(mode) {
      return wego.setPlayMode(mode);
    },
    setPathsVisible(visible) {
      commands.pathLinesGroup.visible = Boolean(visible);
      commands.targetLinesGroup.visible = Boolean(visible);
    },
    selectUnit,
    deselectUnit,
    setCameraHeight(level) {
      return cameraManager.setHeightPreset(level);
    },
    toggleSound() {
      sound.enabled = !sound.enabled;
      return sound.enabled;
    },
    clearShotTrajectory() {
      return shotTrajectoryOverlay.clear();
    },
    toggleShotTrajectory(record) {
      return shotTrajectoryOverlay.toggle(record);
    },
    setCommandMode(mode) {
      return commands.setCommandMode(mode);
    },
    cancelCommandMode() {
      return commands.cancelActiveMode();
    },
    renderCommandOverlays() {
      return commands.renderOverlays();
    },
    addPause(seconds) {
      return selectedAction(getSelectedUnit, unit => {
        unit.addPause(seconds);
        commands.renderOverlays();
        return true;
      });
    },
    clearPaths() {
      return selectedAction(getSelectedUnit, unit => {
        unit.clearWaypoints();
        commands.renderOverlays();
        return true;
      });
    },
    clearTarget() {
      return selectedAction(getSelectedUnit, unit => {
        unit.targetUnit = null;
        unit.targetPos = null;
        commands.renderOverlays();
        return true;
      });
    },
    toggleHiding() {
      return selectedAction(getSelectedUnit, unit => {
        unit.isHiding = !unit.isHiding;
        unit.stance = unit.isHiding ? 'PRONE' : 'STANDING';
        unit.updateStanceVisuals();
        return unit.isHiding;
      });
    },
    toggleDeployment() {
      return selectedAction(getSelectedUnit, unit => {
        unit.isDeployed = !unit.isDeployed;
        unit.stance = unit.isDeployed ? 'KNEELING' : 'STANDING';
        unit.updateStanceVisuals();
        return unit.isDeployed;
      });
    },
    splitSelectedUnit() {
      return selectedAction(getSelectedUnit, splitUnit);
    },
    exitSelectedBuilding() {
      return selectedAction(getSelectedUnit, issueBuildingExit);
    },
    issueBuildingOrder(unit, action, point, buildingId) {
      return commands.onBuildingOrder?.(unit, action, point, buildingId) ?? null;
    }
  });
}

/**
 * Explicit editor mutation port. MapEditor may author presentation geometry,
 * but it cannot retain or reach through the full application object.
 */
export function createMapEditorPort({ terrain, scene, notify }) {
  requireRecord(terrain, 'Map editor terrain dependency');
  requireRecord(scene, 'Map editor scene dependency');
  requireFunction(terrain.getHeightAt, 'Map editor terrain.getHeightAt');
  requireFunction(scene.add, 'Map editor scene.add');
  requireFunction(notify, 'Map editor notify');
  if (!Array.isArray(terrain.bocageObstacles)) {
    throw new TypeError('Map editor terrain requires bocageObstacles');
  }

  return Object.freeze({
    getTerrainHeight(x, z) {
      return terrain.getHeightAt(x, z);
    },
    addBocageObstacle(record) {
      terrain.bocageObstacles.push(record);
    },
    addSceneObject(object) {
      scene.add(object);
    },
    notify
  });
}
