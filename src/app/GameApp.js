import * as THREE from 'three';
import { Renderer } from '../engine/Renderer.js';
import { CameraManager } from '../engine/CameraManager.js';
import { SoundEngine } from '../engine/SoundEngine.js';
import { TerrainBuilder } from '../world/TerrainBuilder.js';
import { VehicleDamageEffects } from '../world/VehicleDamageEffects.js';
import { ShotTrajectoryOverlay } from '../world/debug/ShotTrajectoryOverlay.js';
import { Unit } from '../game/Unit.js';
import {
  CommandSystem,
  isTargetCommandMode
} from '../game/CommandSystem.js';
import { BuildingInteractionSystem } from '../game/BuildingInteractionSystem.js';
import { SpottingSystem } from '../game/SpottingSystem.js';
import { CombatSystem } from '../game/CombatSystem.js';
import { SupportSystem } from '../game/SupportSystem.js';
import { WegoManager } from '../game/WegoManager.js';
import { UIManager } from '../ui/UIManager.js';
import { MapEditor } from '../editor/MapEditor.js';
import { loadScenario } from '../scenario/ScenarioRuntime.js';
import { FixedStepAccumulator } from '../simulation/FixedStepAccumulator.js';
import { BuildingSystem } from '../simulation/buildings/index.js';
import {
  InfantrySeparationSystem
} from '../simulation/infantry/InfantrySeparationSystem.js';
import { buildFactionRosterIndex } from './FactionRosterIndex.js';
import {
  createMapEditorPort,
  createUIRuntimePort
} from './ApplicationPorts.js';

// Unit movement considers ordinary waypoints reached inside this radius. Route
// corners add it to the live formation extent so advancing early cannot cut
// the squad back through the obstacle the corner is intended to clear.
const ENTER_ROUTE_WAYPOINT_TOLERANCE = 0.8;

// Deduplicated Logger to prevent 60 FPS console flooding
let lastLoggedMsg = '';
let lastLogTime = 0;

function log(msg, type = 'info') {
  const now = Date.now();
  if (msg === lastLoggedMsg && now - lastLogTime < 2000) return;
  lastLoggedMsg = msg;
  lastLogTime = now;

  console.log(`[${type.toUpperCase()}] ${msg}`);
  const container = document.getElementById('debug-content');
  if (container) {
    const div = document.createElement('div');
    div.className = `log-entry log-${type}`;
    div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }
}

let errorHandlersInstalled = false;

export function installGameErrorHandlers() {
  if (errorHandlersInstalled) return;
  errorHandlersInstalled = true;
  window.onerror = function(message, source, lineno) {
    log(`Error: ${message} at ${source}:${lineno}`, 'error');
  };
  window.addEventListener('unhandledrejection', function(event) {
    log(`Unhandled Rejection: ${event.reason}`, 'error');
  });
}

export class GameApp {
  constructor({
    scenario,
    mapDescriptor,
    familyRegistry,
    catalogPorts,
    visualFactories,
    playerFactionId,
    buildingDescriptors = [],
    structureAdapters = {},
    UnitType = Unit
  } = {}) {
    if (!scenario?.id) throw new Error('GameApp requires a scenario');
    if (!mapDescriptor?.id) throw new Error('GameApp requires a map descriptor');
    if (!familyRegistry?.require) throw new Error('GameApp requires a family registry');
    if (!catalogPorts?.familyId) throw new Error('GameApp requires family catalog ports');
    if (!visualFactories?.familyId) throw new Error('GameApp requires family visual factories');
    if (typeof visualFactories.terrainSurfaceProvider?.create !== 'function') {
      throw new Error('GameApp requires a family terrain surface provider');
    }
    if (
      typeof visualFactories.vfxProvider?.createCombatResources !== 'function'
      || typeof visualFactories.vfxProvider?.createVehicleDamageResources !== 'function'
    ) {
      throw new Error('GameApp requires a family battlefield VFX provider');
    }
    if (typeof visualFactories.audioProvider?.createResources !== 'function') {
      throw new Error('GameApp requires a family battlefield audio provider');
    }
    if (typeof playerFactionId !== 'string' || playerFactionId.length === 0) {
      throw new TypeError('GameApp requires playerFactionId');
    }
    if (!Array.isArray(buildingDescriptors)) {
      throw new TypeError('GameApp buildingDescriptors must be an array');
    }
    if (!structureAdapters || typeof structureAdapters !== 'object') {
      throw new TypeError('GameApp structureAdapters must be a record');
    }
    if (typeof UnitType !== 'function') throw new TypeError('GameApp UnitType must be a constructor');
    if (scenario.mapId !== mapDescriptor.id) {
      throw new Error(
        `GameApp scenario ${scenario.id} requires map ${scenario.mapId}, received ${mapDescriptor.id}`
      );
    }
    const family = familyRegistry.require(scenario.gameFamilyId);
    if (!family.factions?.[playerFactionId]) {
      throw new Error(
        `GameApp player faction ${playerFactionId} is not registered by ${scenario.gameFamilyId}`
      );
    }
    for (const [label, dependency] of [
      ['catalog ports', catalogPorts],
      ['visual factories', visualFactories]
    ]) {
      if (dependency.familyId !== scenario.gameFamilyId) {
        throw new Error(
          `GameApp scenario ${scenario.id} requires ${label} for `
          + `${scenario.gameFamilyId}, received ${dependency.familyId}`
        );
      }
    }
    this.scenario = scenario;
    this.mapDescriptor = mapDescriptor;
    this.familyRegistry = familyRegistry;
    this.catalogPorts = catalogPorts;
    this.visualFactories = visualFactories;
    this.playerFactionId = playerFactionId;
    this.factionOrder = Object.keys(family.factions);
    this.factionPresentation = Object.freeze(Object.fromEntries(
      Object.entries(family.factions).map(([factionId, faction]) => [
        factionId,
        family.presentation[faction.presentationId]
      ])
    ));
    this.buildingDescriptors = [...buildingDescriptors];
    this.structureAdapters = structureAdapters;
    this.UnitType = UnitType;

    log('Initializing tactical combat runtime...', 'info');
    document.body.dataset.gameStatus = 'loading';

    const dbgBtn = document.getElementById('btn-debug-toggle');
    if (dbgBtn) {
      dbgBtn.addEventListener('click', () => {
        const el = document.getElementById('debug-log');
        if (el) el.classList.toggle('hidden');
      });
    }

    const clearBtn = document.getElementById('btn-clear-log');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const c = document.getElementById('debug-content');
        if (c) c.innerHTML = '';
      });
    }

    this.ready = this.initialize();
  }

  async initialize() {
    try {
      this.container = document.getElementById('canvas-container');
      if (!this.container) throw new Error('#canvas-container element not found');

      const params = new URLSearchParams(window.location.search);
      this.seed = Number.parseInt(
        params.get('seed') || String(this.scenario.defaultSeed),
        10
      ) >>> 0;
      this.randomState = this.seed || 1;
      this.qualityTier = params.get('quality') === 'low' ? 'low' : 'high';
      this.requestedPlayMode = params.get('mode') === 'realtime' ? 'realtime' : 'wego';
      this.startWithoutSelection = params.get('selected') === 'none';
      this.visualDebugMode = params.get('debug') || 'final';
      this.cameraBookmark = ['near', 'design', 'far'].includes(params.get('camera'))
        ? params.get('camera')
        : 'design';
      this.lastDiagnosticsUpdate = 0;
      this.simulationStepper = new FixedStepAccumulator(1 / 30);

      // 1. Renderer
      log('Creating WebGPU Renderer...', 'info');
      this.renderer = new Renderer(this.container, {
        qualityTier: this.qualityTier,
        debugMode: this.visualDebugMode,
        onDeviceLost: info => {
          const message = `${info.api} rendering device lost: ${info.message}`;
          document.body.dataset.gameStatus = 'error';
          document.body.dataset.gameError = message;
          log(message, 'error');
        }
      });
      await this.renderer.initialize();
      this.scene = this.renderer.scene;
      this.camera = this.renderer.camera;

      // 2. Camera Manager
      log('Creating Camera Manager...', 'info');
      this.cameraManager = new CameraManager(this.camera, this.renderer.domElement);
      this.sound = new SoundEngine({
        audioProvider: this.visualFactories.audioProvider
      });
      window.addEventListener('pagehide', () => this.sound?.dispose(), {
        once: true
      });

      // 3. Terrain Builder
      log('Building scenario terrain...', 'info');
      this.buildingSystem = new BuildingSystem();
      for (const descriptor of this.buildingDescriptors) {
        this.buildingSystem.registerDescriptor(descriptor);
      }
      this.terrain = new TerrainBuilder(this.scene, {
        mapDescriptor: this.mapDescriptor,
        buildingSystem: this.buildingSystem,
        structureAdapters: this.structureAdapters,
        terrainSurfaceProvider: this.visualFactories.terrainSurfaceProvider
      });
      this.terrain.buildScenarioMap();

      // 4. Game Systems
      this.units = [];
      this.movedUnitIds = new Set();
      this.selectedUnit = null;
      this.selectedUnits = [];
      this.matchStarted = false;
      this.infantrySeparation = new InfantrySeparationSystem();
      this.buildingInteraction = new BuildingInteractionSystem({
        buildingSystem: this.buildingSystem,
        getUnits: () => this.units
      });

      log('Setting up Command & Combat Systems...', 'info');
      this.commands = new CommandSystem(this.scene, {
        deploymentZones: this.mapDescriptor.deploymentZones,
        terrain: this.terrain,
        buildingInteraction: this.buildingInteraction,
        isSetupPhase: () => this.wego?.isSetupPhase() ?? false,
        onInvalidDeployment: () => this.ui?.showToast(
          'Entire unit footprint must stay inside its setup area',
          'warn'
        ),
        onBuildingOrder: (unit, action, point, buildingId, orderType) =>
          this.issueBuildingOrder(unit, action, point, buildingId, orderType)
      });
      this.spotting = new SpottingSystem(this.scene, this.terrain, {
        unitProfiles: this.scenario.units,
        buildingSystem: this.buildingSystem
      });
      this.combat = new CombatSystem(this.scene, this.sound, () => this.random(), {
        terrain: this.terrain,
        getUnits: () => this.units,
        onAuditoryEvent: event =>
          this.spotting.recordAuditoryEvent(event, this.units),
        buildingSystem: this.buildingSystem,
        onOccupantConsequences: consequences =>
          this.buildingInteraction.handleOccupantConsequences(consequences),
        onBuildingChanged: ({ buildingId }) => {
          this.terrain.syncBuildingRuntime(buildingId);
          this.spotting.invalidateBuildingColliders();
        },
        vfxProvider: this.visualFactories.vfxProvider
      });
      this.vehicleDamageEffects = new VehicleDamageEffects({
        vfxProvider: this.visualFactories.vfxProvider
      });
      this.shotTrajectoryOverlay = new ShotTrajectoryOverlay(this.scene);
      this.support = new SupportSystem(this.scene, this.combat, () => this.random());
      this.wego = new WegoManager(this);

      // 5. UI & Editor
      log('Creating User Interface...', 'info');
      this.uiRuntimePort = createUIRuntimePort({
        wego: this.wego,
        commands: this.commands,
        sound: this.sound,
        cameraManager: this.cameraManager,
        shotTrajectoryOverlay: this.shotTrajectoryOverlay,
        mapDimensions: this.mapDescriptor.dimensions,
        factionPresentation: this.factionPresentation,
        playerFactionId: this.playerFactionId,
        getSelectedUnit: () => this.selectedUnit,
        getSelectedUnits: () => [...this.selectedUnits],
        getVisibilityProjection: units => this.visibilityProjection
          ?? this.spotting.getVisibilityProjection(this.playerFactionId, units),
        getBocageObstacles: () => this.terrain.bocageObstacles,
        getImpacts: () => this.combat.telemetry.impacts,
        getBuildingFloorIds: buildingId => {
          try {
            return this.buildingSystem
              .getDescriptorForBuilding(buildingId)
              .floors
              .map(floor => floor.id);
          } catch {
            return [];
          }
        },
        selectUnit: (unit, options) => this.selectUnit(unit, options),
        deselectUnit: () => this.deselectUnit(),
        splitUnit: unit => this.splitUnit(unit),
        issueBuildingExit: unit => this.issueBuildingExit(unit)
      });
      this.ui = new UIManager(this.uiRuntimePort);
      this.editor = new MapEditor(createMapEditorPort({
        terrain: this.terrain,
        scene: this.scene,
        notify: (message, type) => this.ui.showToast(message, type)
      }));
      this.wego.setPlayMode(this.requestedPlayMode, { silent: true });

      // 6. Build Scenario
      log('Spawning scenario units...', 'info');
      this.setupScenario(this.scenario);
      const cameraLevels = { near: 2, design: 4, far: 8 };
      this.cameraManager.setHeightPreset(cameraLevels[this.cameraBookmark]);
      this.renderer.configureSceneShadows();
      await this.renderer.prepareScene();
      log(`Game Ready! Spawned ${this.units.length} Units.`, 'info');
      log(`Visuals: ${JSON.stringify(this.renderer.getDiagnostics())}`, 'info');
      log(`Capture manifest: seed=${this.seed}, camera=${this.cameraBookmark}, quality=${this.qualityTier}, debug=${this.visualDebugMode}`, 'info');

      // 7. Interaction Listener
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this.pointerStart = { x: 0, y: 0 };
      this.initInteraction();
      window.__CMBN_GAME__ = this;
      document.body.dataset.gameStatus = 'ready';
      document.body.dataset.deploymentStatus = this.matchStarted ? 'closed' : 'valid';
      document.body.dataset.scenarioId = this.scenario.id;
      document.body.dataset.mapId = this.mapDescriptor.id;
      document.body.dataset.gameFamilyId = this.scenario.gameFamilyId;
      document.body.dataset.rendererBackend = this.renderer.backendName;
      const audioBinding = this.sound.assetBinding;
      document.body.dataset.audioProvider = audioBinding
        ? `${audioBinding.logicalId}:${audioBinding.sourcePackId}:${audioBinding.implementationId}`
        : this.sound.audioProvider.id;
      document.body.dataset.captureManifest = `${this.seed}:${this.cameraBookmark}:${this.qualityTier}:${this.visualDebugMode}:${this.wego.playMode}`;

      // 8. Start Game Loop
      this.timer = new THREE.Timer();
      this.timer.connect(document);
      requestAnimationFrame(timestamp => this.animate(timestamp));

    } catch (err) {
      document.body.dataset.gameStatus = 'error';
      document.body.dataset.gameError = err.message;
      log(`FATAL INIT ERROR: ${err.message}`, 'error');
    }
  }

  setupScenario(scenario) {
    const loaded = loadScenario(scenario, {
      terrain: this.terrain,
      scene: this.scene,
      agentDebug: this.visualDebugMode === 'agents',
      mapDescriptor: this.mapDescriptor,
      familyRegistry: this.familyRegistry,
      catalogPorts: this.catalogPorts,
      visualFactories: this.visualFactories
    });
    this.units = loaded.units;
    this.rebuildFactionIndex();
    this.terrain.registerUnitColliders(this.units);
    if (this.startWithoutSelection || !loaded.initialSelection) this.deselectUnit();
    else this.selectUnit(loaded.initialSelection);
    if (loaded.cameraTarget) this.cameraManager.setFocusTarget(loaded.cameraTarget.position);
  }

  rebuildFactionIndex() {
    this.factionRoster = buildFactionRosterIndex(this.factionOrder, this.units);
  }

  beginMatch() {
    if (this.matchStarted) return;
    this.matchStarted = true;
    this.terrain.removeSetupZones();
    document.body.dataset.deploymentStatus = 'closed';
  }

  issueBuildingOrder(
    unit,
    action,
    point,
    explicitBuildingId = null,
    orderType = 'QUICK'
  ) {
    if (!this.matchStarted) {
      this.ui?.showToast('Building orders unlock when the battle starts', 'warn');
      return { accepted: false, reason: 'match_not_started' };
    }
    const buildingId = explicitBuildingId
      ?? this.buildingInteraction.findBuildingAt(point);
    if (!buildingId) {
      this.ui?.showToast('Tap an enterable building', 'warn');
      return { accepted: false, reason: 'no_building' };
    }
    const floorId = action === 'ENTER_UPPER' ? 'upper-floor' : 'ground-floor';
    const result = this.buildingInteraction.issueEnter(unit, buildingId, floorId);
    if (!result.accepted) {
      this.ui?.showToast(`Cannot enter: ${result.reason.replaceAll('_', ' ')}`, 'warn');
      return result;
    }
    unit.clearWaypoints();
    const formationClearance = Math.max(
      0,
      ...(unit.soldierAI?.getLivingAgents().map(agent =>
        unit.soldierAI.getFormationOffset(agent.index, orderType).length()
      ) ?? [])
    );
    const targetBuildingColliderIds = unit.collisionWorld?.getRecords()
      .filter(record => record.buildingId === buildingId)
      .map(record => record.id) ?? [];
    let routeStart = { x: unit.position.x, z: unit.position.z };
    for (const routePoint of result.approachRoute ?? [result.approachPosition]) {
      const plannedRoute = unit.collisionWorld?.getNavigationPath(
        routeStart,
        { x: routePoint[0], z: routePoint[2] },
        unit.collisionRadius,
        'infantry',
        {
          ignoreColliderIds: targetBuildingColliderIds,
          waypointClearance: ENTER_ROUTE_WAYPOINT_TOLERANCE + formationClearance
        }
      ) ?? [{ x: routePoint[0], z: routePoint[2] }];
      for (const plannedPoint of plannedRoute) {
        unit.addWaypoint(
          new THREE.Vector3(plannedPoint.x, routePoint[1], plannedPoint.z),
          orderType
        );
      }
      routeStart = { x: routePoint[0], z: routePoint[2] };
    }
    this.commands.renderOverlays();
    this.ui?.showToast(
      `${result.assigned.length} soldiers entering ${floorId === 'upper-floor' ? 'upper' : 'ground'} floor`,
      'success'
    );
    return result;
  }

  issueBuildingExit(unit = this.selectedUnit) {
    const result = this.buildingInteraction.issueExit(unit);
    this.ui?.showToast(
      result.accepted
        ? `${result.assigned.length} soldiers exiting building`
        : `Cannot exit: ${result.reason.replaceAll('_', ' ')}`,
      result.accepted ? 'success' : 'warn'
    );
    return result;
  }

  syncBuildingInteriorPresentation() {
    const presenceCounts = this.buildingInteraction.getInteriorPresenceCounts();
    for (const buildingId of this.buildingSystem.getBuildingIds()) {
      this.terrain.setBuildingInteriorPresence(
        buildingId,
        presenceCounts[buildingId] ?? 0
      );
    }
  }

  selectUnits(units, primaryUnit = null) {
    const uniqueUnits = [...new Set((units ?? []).filter(unit =>
      unit
      && unit.faction === this.playerFactionId
      && this.units.includes(unit)
    ))];
    const selectedSet = new Set(uniqueUnits);
    for (const candidate of this.units) {
      const disc = candidate.mesh?.userData.selectionDisc;
      if (disc) disc.visible = selectedSet.has(candidate);
    }
    this.selectedUnits = uniqueUnits;
    this.selectedUnit = selectedSet.has(primaryUnit)
      ? primaryUnit
      : (uniqueUnits.at(-1) ?? null);
    if (globalThis.document?.body) {
      document.body.dataset.selectedUnit = this.selectedUnit?.id ?? 'none';
      document.body.dataset.selectedUnits = uniqueUnits
        .map(unit => unit.id)
        .join(',');
    }
    this.commands.setActiveUnits(uniqueUnits, this.selectedUnit);
    this.cameraManager.followUnit = null;
    if (this.selectedUnit) this.ui.updateUnitHUD(this.selectedUnit);
    else this.ui.clearUnitHUD();
    this.ui.renderCommandGrid();
    return this.selectedUnit;
  }

  selectUnit(unit, { additive = false } = {}) {
    if (
      !unit
      || unit.faction !== this.playerFactionId
      || !this.units.includes(unit)
    ) {
      return false;
    }
    if (!additive) {
      this.selectUnits([unit], unit);
      return true;
    }
    const selected = this.selectedUnits.includes(unit)
      ? this.selectedUnits.filter(candidate => candidate !== unit)
      : [...this.selectedUnits, unit];
    this.selectUnits(selected, selected.includes(unit) ? unit : selected.at(-1));
    return true;
  }

  deselectUnit() {
    this.selectUnits([]);
  }

  splitUnit(unit) {
    if (unit.hasDeployableCrewServedWeapon?.()) {
      this.ui.showToast('Crew-served weapon teams cannot split yet', 'warn');
      return;
    }
    if (unit.type !== 'infantry_squad' || unit.roster.length < 4) {
      this.ui.showToast('Only full infantry squads can split', 'warn');
      return;
    }

    const splitCount = Math.floor(unit.roster.length / 2);
    const splitRoster = unit.roster.splice(unit.roster.length - splitCount, splitCount);
    const splitUnit = new this.UnitType({
      id: `${unit.id}_team_${this.units.length + 1}`,
      name: `${unit.name} Scout Team`,
      faction: unit.faction,
      type: unit.type,
      position: unit.position.clone().add(new THREE.Vector3(2.5, 0, 2.5)),
      experience: unit.experience,
      leadership: Math.max(0, unit.leadership - 1),
      roster: splitRoster,
      hqUnit: unit.hqUnit || unit,
      catalogPorts: unit.catalogPorts,
      visualFactories: unit.visualFactories
    });
    splitUnit.position.y = this.terrain.getHeightAt(splitUnit.position.x, splitUnit.position.z);
    const oldSourceMesh = unit.replaceRoster(unit.roster);
    this.scene.remove(oldSourceMesh);
    this.scene.add(unit.mesh);
    unit.setAgentDebug(this.visualDebugMode === 'agents');

    splitUnit.mesh.position.copy(splitUnit.position);
    splitUnit.setAgentDebug(this.visualDebugMode === 'agents');
    splitUnit.bindCollisionWorld(this.terrain.collisionWorld);

    for (const ammoType of Object.keys(unit.ammo)) {
      const transferred = Math.floor(unit.ammo[ammoType] / 2);
      unit.ammo[ammoType] -= transferred;
      splitUnit.ammo[ammoType] = transferred;
    }

    this.units.push(splitUnit);
    this.rebuildFactionIndex();
    this.scene.add(splitUnit.mesh);
    this.renderer.configureSceneShadows();
    this.selectUnit(splitUnit);
    this.ui.showToast(`Created ${splitUnit.name}`, 'success');
  }

  random() {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 0x100000000;
  }

  captureSimulationState() {
    return {
      randomState: this.randomState,
      units: this.units.map(unit => unit.captureState()),
      buildings: this.buildingSystem.captureState(),
      buildingInteractions: this.buildingInteraction.captureState(),
      spotting: this.spotting.captureState(),
      combat: this.combat.captureState(),
      supportMissions: this.support.captureState(),
      selectedUnitId: this.selectedUnit?.id ?? null,
      selectedUnitIds: this.selectedUnits.map(unit => unit.id),
      matchStarted: this.matchStarted
    };
  }

  restoreSimulationState(state) {
    this.simulationStepper.reset();
    this.randomState = state.randomState >>> 0;
    this.buildingSystem.restoreState(state.buildings);
    const unitMap = new Map(this.units.map(unit => [unit.id, unit]));
    for (const unitState of state.units) {
      unitMap.get(unitState.id)?.restoreState(unitState, unitMap);
    }
    this.buildingInteraction.restoreState(state.buildingInteractions);
    this.syncBuildingInteriorPresentation();
    for (const buildingId of this.buildingSystem.getBuildingIds()) {
      this.terrain.syncBuildingRuntime(buildingId);
    }
    this.spotting.invalidateBuildingColliders();
    this.spotting.restoreState(state.spotting);
    this.combat.restoreState(state.combat, unitMap);
    this.vehicleDamageEffects.resetTransient();
    this.shotTrajectoryOverlay.clear();
    this.support.restoreState(state.supportMissions, unitMap);
    if (state.matchStarted) this.beginMatch();
    const selectedUnits = (state.selectedUnitIds ?? [])
      .map(id => unitMap.get(id))
      .filter(Boolean);
    const selected = state.selectedUnitId ? unitMap.get(state.selectedUnitId) : null;
    if (selectedUnits.length > 0) this.selectUnits(selectedUnits, selected);
    else if (selected) this.selectUnit(selected);
    else this.deselectUnit();
    this.commands.renderOverlays();
  }

  chooseTarget(attacker, opposingUnits) {
    const isTargetable = target => {
      if (!target?.isCombatEffective()) return false;
      if (!this.spotting.canPrecisionTarget(attacker, target)) return false;
      const los = this.spotting.checkLOS(attacker.position, target.position);
      return los.clear && los.dist <= (attacker.vehicleSpec ? 220 : 150);
    };
    if (attacker.targetUnit?.isCombatEffective()
        && this.spotting.canPrecisionTarget(attacker, attacker.targetUnit)) {
      return attacker.targetUnit;
    }
    const trackedTargetId = attacker.vehicleWeapon?.targetUnitId ?? null;
    const trackedTarget = trackedTargetId
      ? opposingUnits.find(target => target.id === trackedTargetId)
      : null;
    if (isTargetable(trackedTarget)) return trackedTarget;
    const visibleTargets = opposingUnits.filter(isTargetable);
    if (visibleTargets.length === 0) return null;
    return visibleTargets[Math.floor(this.random() * visibleTargets.length)];
  }

  hasContact(unit, opposingUnits) {
    return opposingUnits.some(target => this.spotting.hasContact(unit, target));
  }

  simulateStep(delta) {
    this.movedUnitIds.clear();
    this.units.forEach(unit => {
      const previousX = unit.position.x;
      const previousZ = unit.position.z;
      const waypoint = unit.waypoints[unit.currentWaypointIndex];
      const opposingUnits = this.factionRoster.opposingUnitsFor(unit.faction) ?? [];
      const huntStopped = waypoint?.orderType === 'HUNT' && this.hasContact(unit, opposingUnits);
      const hasDirectPrecisionObservation = Boolean(
        unit.targetUnit
        && this.spotting.canPrecisionTarget(unit, unit.targetUnit)
      );
      unit.update(delta, this.terrain, {
        haltMovement: huntStopped,
        hasDirectPrecisionObservation
      });
      if (Math.hypot(unit.position.x - previousX, unit.position.z - previousZ) > 1e-5) {
        this.movedUnitIds.add(unit.id);
      }
    });
    const separation = this.infantrySeparation?.resolve(this.units, this.terrain);
    if (separation?.correctedUnitIds.length > 0) {
      const correctedUnitIds = new Set(separation.correctedUnitIds);
      for (const unit of this.units) {
        if (correctedUnitIds.has(unit.id)) {
          unit.soldierAI?.syncMeshes?.();
        }
      }
    }
    this.buildingInteraction.advance(delta);
    this.syncBuildingInteriorPresentation();
    // Building transit owns door/stair movement after ordinary unit movement.
    // Support-ammunition eligibility must therefore sample the final
    // individual positions for this step, before any combat consumes reserve.
    for (const unit of this.units) {
      unit.soldierAI?.advanceSupportAmmunitionTransfers(delta);
    }
    // Observation is authoritative simulation state. Advance it exactly once,
    // after movement/collision and before any weapon may select a target.
    this.spotting.advance(this.units, delta);
    // Movement consumed the observation snapshot from the start of this step.
    // Reconcile any post-movement loss before combat without moving twice.
    for (const unit of this.units) {
      const hasDirectPrecisionObservation = Boolean(
        unit.targetUnit
        && this.spotting.canPrecisionTarget(unit, unit.targetUnit)
      );
      unit.reconcileBuddyBoundObservation?.(
        hasDirectPrecisionObservation
      );
    }

    const attemptFire = (attacker, opposingUnits) => {
      if (!attacker.isCombatEffective()) return;

      if (attacker.type === 'infantry_squad') {
        attacker.updateMortarCombat?.({
          terrain: this.terrain,
          combat: this.combat,
          random: () => this.random()
        });
        attacker.updateIndividualCombat(delta, {
          opposingUnits,
          spotting: this.spotting,
          combat: this.combat,
          buildingInteraction: this.buildingInteraction,
          random: () => this.random()
        });
        return;
      }

      const target = this.chooseTarget(attacker, opposingUnits);
      if (attacker.vehicleSpec) {
        attacker.updateVehicleCombat(delta, {
          target,
          combat: this.combat,
          shooterMoving: this.movedUnitIds.has(attacker.id),
          targetMoving: Boolean(target && this.movedUnitIds.has(target.id)),
          random: () => this.random()
        });
        return;
      }

      const weapon = this.catalogPorts.weapons.get(attacker.structureSpec?.weaponId);
      if (!weapon) return;
      const baseRate = 0.42;
      const ratePerSecond = attacker.targetMode === 'TARGET_LIGHT' ? baseRate * 0.45 : baseRate;
      const probability = 1 - Math.exp(-ratePerSecond * delta);
      if (this.random() >= probability) return;
      if (target) {
        this.combat.fireWeapon(attacker, target, target.position, {
          weapon,
          muzzlePosition: attacker.getMuzzleWorldPosition()
        });
      } else if (attacker.targetPos) {
        this.combat.fireWeapon(attacker, null, attacker.targetPos, {
          weapon,
          muzzlePosition: attacker.getMuzzleWorldPosition()
        });
      }
    };

    for (const factionId of this.factionOrder) {
      const opposingUnits = this.factionRoster.opposingUnitsFor(factionId) ?? [];
      for (const unit of this.factionRoster.unitsFor(factionId) ?? []) {
        attemptFire(unit, opposingUnits);
      }
    }
    this.combat.update(delta);
    this.support.update(delta);
  }

  simulateToTime(targetTime) {
    const fixedStep = this.simulationStepper.stepSeconds;
    while (this.wego.currentTurnTime + fixedStep <= targetTime + 1e-9) {
      this.simulateStep(fixedStep);
      this.wego.completeSimulationStep(fixedStep, {
        recordSnapshot: false,
        updateUI: false
      });
    }
  }

  initInteraction() {
    const dom = this.renderer.domElement;

    const onPointerDown = (e) => {
      const x = e.clientX ?? e.touches?.[0]?.clientX;
      const y = e.clientY ?? e.touches?.[0]?.clientY;
      this.pointerStart = { x, y };
    };

    const onPointerUp = (e) => {
      const clientX = e.clientX ?? e.changedTouches?.[0]?.clientX;
      const clientY = e.clientY ?? e.changedTouches?.[0]?.clientY;
      if (clientX == null || clientY == null) return;

      const dx = Math.abs(clientX - this.pointerStart.x);
      const dy = Math.abs(clientY - this.pointerStart.y);
      if (dx > 12 || dy > 12) return;

      this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Friendly selection belongs exclusively to the floating badge overlay.
      // During a target command, raycast only visible opposing models so
      // friendly bodies cannot steal a terrain or enemy target click.
      const targetMeshes = isTargetCommandMode(this.commands.activeMode)
        ? this.units
            .filter(unit =>
              unit.faction !== this.playerFactionId
              && unit.mesh
              && unit.mesh.visible)
            .map(unit => unit.mesh)
        : [];
      const targetIntersects = this.raycaster.intersectObjects(
        targetMeshes,
        true
      );

      if (targetIntersects.length > 0) {
        let hitObj = targetIntersects[0].object;
        while (hitObj.parent && hitObj.userData?.unitRoot !== true) {
          hitObj = hitObj.parent;
        }

        const clickedUnit = hitObj.userData?.unitRoot === true
          ? this.units.find(unit => unit.id === hitObj.userData.unitId)
          : null;
        if (clickedUnit && isTargetCommandMode(this.commands.activeMode)) {
          this.commands.handleMapClick(clickedUnit.position, clickedUnit);
          this.ui.renderCommandGrid();
          this.sound.playUIClick();
          return;
        }
      }

      if (this.commands.activeMode?.startsWith('ENTER_')
          || (this.commands.activeMode?.startsWith('MOVE_')
            && this.commands.activeUnit?.type === 'infantry_squad')) {
        const buildingObjects = this.terrain.buildings
          .map(building => building.object)
          .filter(Boolean);
        const buildingIntersects = this.raycaster.intersectObjects(buildingObjects, true);
        if (buildingIntersects.length > 0) {
          const hit = buildingIntersects[0];
          const building = this.terrain.buildings.find(
            candidate => candidate.object === hit.object
              || candidate.object?.getObjectById?.(hit.object.id)
          );
          if (building) {
            this.commands.handleMapClick(hit.point, null, { buildingId: building.id });
            this.ui.renderCommandGrid();
            this.sound.playUIClick();
            return;
          }
        }
      }

      if (this.terrain.terrainMesh) {
        const terrainIntersects = this.raycaster.intersectObject(this.terrain.terrainMesh);
        if (terrainIntersects.length > 0) {
          const pt = terrainIntersects[0].point;
          if (this.commands.activeMode) {
            this.commands.handleMapClick(pt);
            this.ui.renderCommandGrid();
            this.sound.playUIClick();
          } else {
            this.deselectUnit();
          }
        }
      }
    };

    const onContextMenu = (e) => {
      e.preventDefault();
      const cancelled = this.commands.cancelActiveMode();
      if (cancelled) {
        this.ui.renderCommandGrid();
        this.ui.showToast('Command tool cancelled', 'info');
      } else {
        this.deselectUnit();
      }
    };

    dom.addEventListener('mousedown', onPointerDown);
    dom.addEventListener('mouseup', onPointerUp);
    dom.addEventListener('touchstart', onPointerDown, { passive: true });
    dom.addEventListener('touchend', onPointerUp, { passive: true });
    dom.addEventListener('contextmenu', onContextMenu);
  }

  animate(timestamp) {
    try {
      if (this.renderer.deviceLost) return;
      this.timer.update(timestamp);
      const delta = Math.min(this.timer.getDelta(), 0.1);

      const simulationDelta = this.wego.getSimulationDelta(delta);
      if (simulationDelta > 0) {
        this.simulationStepper.advance(simulationDelta, fixedStep => {
          this.simulateStep(fixedStep);
          this.wego.completeSimulationStep(fixedStep);
        });
        if (this.wego.phase !== 'ACTION_PHASE') this.simulationStepper.reset();
      }

      const visibility = this.spotting.getVisibilityProjection(this.playerFactionId, this.units);
      this.visibilityProjection = visibility;
      if (!this.visibleUnitIdSet) this.visibleUnitIdSet = new Set();
      else this.visibleUnitIdSet.clear();
      for (let i = 0; i < visibility.visibleUnitIds.length; i++) {
        this.visibleUnitIdSet.add(visibility.visibleUnitIds[i]);
      }
      for (const unit of this.units) {
        if (unit.mesh) unit.mesh.visible = this.visibleUnitIdSet.has(unit.id);
      }
      this.cameraManager.update(delta);
      const lodCounts = { high: 0, medium: 0, low: 0 };
      for (const unit of this.units) {
        const lod = unit.updateLOD(this.camera.position, this.qualityTier);
        lodCounts[lod]++;
      }
      this.vehicleDamageEffects.update(
        delta,
        this.units,
        this.combat.telemetry.impacts
      );
      this.ui.render(this.units, this.cameraManager);
      this.renderer.render();

      const now = performance.now();
      if (now - this.lastDiagnosticsUpdate >= 1000) {
        const diagnostics = this.renderer.getDiagnostics();
        document.body.dataset.renderStats = `${diagnostics.drawCalls}:${diagnostics.triangles}:${diagnostics.geometries}:${diagnostics.textures}`;
        document.body.dataset.lodStats = `${lodCounts.high}:${lodCounts.medium}:${lodCounts.low}`;
        document.body.dataset.ballisticsStats = `${this.combat.telemetry.shotsFired}:${this.combat.telemetry.infantryHits}:${this.combat.telemetry.vehicleHits}:${this.combat.telemetry.buildingHits}:${this.combat.telemetry.penetrations}:${this.combat.telemetry.ricochets}:${this.combat.telemetry.stops}`;
        this.lastDiagnosticsUpdate = now;
      }
      requestAnimationFrame(nextTimestamp => this.animate(nextTimestamp));
    } catch (err) {
      document.body.dataset.gameStatus = 'error';
      document.body.dataset.gameError = err.message;
      log(`FATAL RENDER ERROR: ${err.message}`, 'error');
    }
  }
}
