import * as THREE from 'three';
import { Renderer } from './engine/Renderer.js';
import { CameraManager } from './engine/CameraManager.js';
import { SoundEngine } from './engine/SoundEngine.js';
import { TerrainBuilder } from './world/TerrainBuilder.js';
import { VehicleDamageEffects } from './world/VehicleDamageEffects.js';
import { Unit } from './game/Unit.js';
import { CommandSystem } from './game/CommandSystem.js';
import { BuildingInteractionSystem } from './game/BuildingInteractionSystem.js';
import { SpottingSystem } from './game/SpottingSystem.js';
import { CombatSystem } from './game/CombatSystem.js';
import { getWeapon } from './game/WeaponCatalog.js';
import { SupportSystem } from './game/SupportSystem.js';
import { WegoManager } from './game/WegoManager.js';
import { UIManager } from './ui/UIManager.js';
import { MapEditor } from './editor/MapEditor.js';
import { loadScenario } from './scenario/ScenarioRuntime.js';
import { STONNE_1940_SCENARIO } from './scenarios/france1940/stonne1940.js';
import { FixedStepAccumulator } from './simulation/FixedStepAccumulator.js';
import { BuildingSystem } from './simulation/buildings/index.js';
import { FR_HOUSE_12X9_2F } from './maps/france/FranceHouse12x9_2F.js';

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

window.onerror = function(message, source, lineno, colno, error) {
  log(`Error: ${message} at ${source}:${lineno}`, 'error');
};

window.addEventListener('unhandledrejection', function(e) {
  log(`Unhandled Rejection: ${e.reason}`, 'error');
});

class Game {
  constructor() {
    log('Initializing CMBN 1940 WebGPU Game...', 'info');
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

      this.scenario = STONNE_1940_SCENARIO;
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
      this.sound = new SoundEngine();

      // 3. Terrain Builder
      log('Building Ardennes 1940 Terrain Map...', 'info');
      this.buildingSystem = new BuildingSystem();
      this.buildingSystem.registerDescriptor(FR_HOUSE_12X9_2F);
      this.terrain = new TerrainBuilder(this.scene, {
        deploymentZones: this.scenario.deploymentZones,
        buildingSystem: this.buildingSystem
      });
      this.terrain.buildScenarioMap();

      // 4. Game Systems
      this.units = [];
      this.selectedUnit = null;
      this.matchStarted = false;
      this.buildingInteraction = new BuildingInteractionSystem({
        buildingSystem: this.buildingSystem,
        getUnits: () => this.units
      });

      log('Setting up Command & Combat Systems...', 'info');
      this.commands = new CommandSystem(this.scene, {
        deploymentZones: this.scenario.deploymentZones,
        terrain: this.terrain,
        isSetupPhase: () => this.wego?.isSetupPhase() ?? false,
        onInvalidDeployment: () => this.ui?.showToast(
          'Entire unit footprint must stay inside its setup area',
          'warn'
        ),
        onBuildingOrder: (unit, action, point, buildingId) =>
          this.issueBuildingOrder(unit, action, point, buildingId)
      });
      this.spotting = new SpottingSystem(this.scene, this.terrain, {
        unitProfiles: this.scenario.units,
        buildingSystem: this.buildingSystem
      });
      this.combat = new CombatSystem(this.scene, this.sound, () => this.random(), {
        terrain: this.terrain,
        getUnits: () => this.units,
        buildingSystem: this.buildingSystem,
        onOccupantConsequences: consequences =>
          this.buildingInteraction.handleOccupantConsequences(consequences),
        onBuildingChanged: ({ buildingId }) => {
          this.terrain.syncBuildingRuntime(buildingId);
          this.spotting.invalidateBuildingColliders();
        }
      });
      this.vehicleDamageEffects = new VehicleDamageEffects();
      this.support = new SupportSystem(this.scene, this.combat, () => this.random());
      this.wego = new WegoManager(this);

      // 5. UI & Editor
      log('Creating User Interface...', 'info');
      this.ui = new UIManager(this);
      this.editor = new MapEditor(this);
      this.wego.setPlayMode(this.requestedPlayMode, { silent: true });

      // 6. Build Scenario
      log('Spawning 1940 French & German Units...', 'info');
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
      document.body.dataset.gameFamilyId = this.scenario.gameFamilyId;
      document.body.dataset.rendererBackend = this.renderer.backendName;
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
      agentDebug: this.visualDebugMode === 'agents'
    });
    this.units = loaded.units;
    this.terrain.registerUnitColliders(this.units);
    if (this.startWithoutSelection || !loaded.initialSelection) this.deselectUnit();
    else this.selectUnit(loaded.initialSelection);
    if (loaded.cameraTarget) this.cameraManager.setFocusTarget(loaded.cameraTarget.position);
  }

  beginMatch() {
    if (this.matchStarted) return;
    this.matchStarted = true;
    this.terrain.removeSetupZones();
    document.body.dataset.deploymentStatus = 'closed';
  }

  issueBuildingOrder(unit, action, point, explicitBuildingId = null) {
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
        unit.soldierAI.getFormationOffset(agent.index, 'QUICK').length()
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
          'QUICK'
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

  selectUnit(unit) {
    for (const candidate of this.units) {
      const disc = candidate.mesh?.userData.selectionDisc;
      if (disc) disc.visible = candidate === unit;
    }
    this.selectedUnit = unit;
    document.body.dataset.selectedUnit = unit.id;
    this.commands.setActiveUnit(unit);
    this.ui.updateUnitHUD(unit);
    this.ui.renderCommandGrid();
    this.cameraManager.followUnit = unit;
  }

  deselectUnit() {
    if (this.selectedUnit?.mesh?.userData.selectionDisc) {
      this.selectedUnit.mesh.userData.selectionDisc.visible = false;
    }
    this.selectedUnit = null;
    document.body.dataset.selectedUnit = 'none';
    this.commands.clearActiveUnit();
    this.cameraManager.followUnit = null;
    this.ui.clearUnitHUD();
    this.ui.renderCommandGrid();
  }

  splitUnit(unit) {
    if (unit.type !== 'infantry_squad' || unit.roster.length < 4) {
      this.ui.showToast('Only full infantry squads can split', 'warn');
      return;
    }

    const splitCount = Math.floor(unit.roster.length / 2);
    const splitRoster = unit.roster.splice(unit.roster.length - splitCount, splitCount);
    const splitUnit = new Unit({
      id: `${unit.id}_team_${this.units.length + 1}`,
      name: `${unit.name} Scout Team`,
      faction: unit.faction,
      type: unit.type,
      position: unit.position.clone().add(new THREE.Vector3(2.5, 0, 2.5)),
      experience: unit.experience,
      leadership: Math.max(0, unit.leadership - 1),
      squadSize: splitCount,
      hqUnit: unit.hqUnit || unit
    });
    splitUnit.position.y = this.terrain.getHeightAt(splitUnit.position.x, splitUnit.position.z);
    const oldSourceMesh = unit.replaceRoster(unit.roster);
    this.scene.remove(oldSourceMesh);
    this.scene.add(unit.mesh);
    unit.setAgentDebug(this.visualDebugMode === 'agents');

    splitUnit.replaceRoster(splitRoster);
    splitUnit.mesh.position.copy(splitUnit.position);
    splitUnit.setAgentDebug(this.visualDebugMode === 'agents');
    splitUnit.bindCollisionWorld(this.terrain.collisionWorld);

    for (const ammoType of Object.keys(unit.ammo)) {
      const transferred = Math.floor(unit.ammo[ammoType] / 2);
      unit.ammo[ammoType] -= transferred;
      splitUnit.ammo[ammoType] = transferred;
    }

    this.units.push(splitUnit);
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
    this.support.restoreState(state.supportMissions, unitMap);
    if (state.matchStarted) this.beginMatch();
    const selected = state.selectedUnitId ? unitMap.get(state.selectedUnitId) : null;
    if (selected) this.selectUnit(selected);
    this.commands.renderOverlays();
  }

  chooseTarget(attacker, opposingUnits) {
    if (attacker.targetUnit?.isCombatEffective()
        && this.spotting.canPrecisionTarget(attacker, attacker.targetUnit)) {
      return attacker.targetUnit;
    }
    const visibleTargets = opposingUnits.filter(target => {
      if (!target.isCombatEffective()) return false;
      if (!this.spotting.canPrecisionTarget(attacker, target)) return false;
      const los = this.spotting.checkLOS(attacker.position, target.position);
      return los.clear && los.dist <= (attacker.vehicleSpec ? 220 : 150);
    });
    if (visibleTargets.length === 0) return null;
    return visibleTargets[Math.floor(this.random() * visibleTargets.length)];
  }

  hasContact(unit, opposingUnits) {
    return opposingUnits.some(target => this.spotting.hasContact(unit, target));
  }

  simulateStep(delta) {
    const frenchUnits = this.units.filter(unit => unit.faction === 'french');
    const germanUnits = this.units.filter(unit => unit.faction === 'german');
    this.units.forEach(unit => {
      const waypoint = unit.waypoints[unit.currentWaypointIndex];
      const opposingUnits = unit.faction === 'french' ? germanUnits : frenchUnits;
      const huntStopped = waypoint?.orderType === 'HUNT' && this.hasContact(unit, opposingUnits);
      unit.update(delta, this.terrain, { haltMovement: huntStopped });
    });
    this.buildingInteraction.advance(delta);
    this.syncBuildingInteriorPresentation();
    // Observation is authoritative simulation state. Advance it exactly once,
    // after movement/collision and before any weapon may select a target.
    this.spotting.advance(this.units, delta);

    const attemptFire = (attacker, opposingUnits) => {
      if (!attacker.isCombatEffective()) return;

      if (attacker.type === 'infantry_squad') {
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
          random: () => this.random()
        });
        return;
      }

      const baseRate = 0.42;
      const ratePerSecond = attacker.targetMode === 'TARGET_LIGHT' ? baseRate * 0.45 : baseRate;
      const probability = 1 - Math.exp(-ratePerSecond * delta);
      if (this.random() >= probability) return;
      if (target) {
        this.combat.fireWeapon(attacker, target, target.position, {
          weapon: getWeapon('MG34'),
          muzzlePosition: attacker.getMuzzleWorldPosition()
        });
      } else if (attacker.targetPos) {
        this.combat.fireWeapon(attacker, null, attacker.targetPos, {
          weapon: getWeapon('MG34'),
          muzzlePosition: attacker.getMuzzleWorldPosition()
        });
      }
    };

    frenchUnits.forEach(unit => attemptFire(unit, germanUnits));
    germanUnits.forEach(unit => attemptFire(unit, frenchUnits));
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

      const unitMeshes = this.units.filter(u => u.mesh && u.mesh.visible).map(u => u.mesh);
      const unitIntersects = this.raycaster.intersectObjects(unitMeshes, true);

      if (unitIntersects.length > 0) {
        let hitObj = unitIntersects[0].object;
        while (hitObj.parent && !hitObj.name.startsWith('Squad_') && !hitObj.name.startsWith('fr_') && !hitObj.name.startsWith('ger_')) {
          hitObj = hitObj.parent;
        }

        const clickedUnit = this.units.find(u => u.mesh === hitObj || (u.mesh && u.mesh.children.includes(hitObj)));
        if (clickedUnit) {
          if (clickedUnit.faction === 'french') {
            this.selectUnit(clickedUnit);
            this.sound.playUIClick();
            return;
          } else if (this.commands.activeMode === 'TARGET' || this.commands.activeMode === 'TARGET_LIGHT') {
            this.commands.handleMapClick(clickedUnit.position, clickedUnit);
            this.ui.renderCommandGrid();
            this.sound.playUIClick();
            return;
          }
        }
      }

      if (this.commands.activeMode?.startsWith('ENTER_')) {
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

      const visibility = this.spotting.getVisibilityProjection('french', this.units);
      this.visibilityProjection = visibility;
      const visibleUnitIds = new Set(visibility.visibleUnitIds);
      for (const unit of this.units) {
        if (unit.mesh) unit.mesh.visible = visibleUnitIds.has(unit.id);
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
        document.body.dataset.ballisticsStats = `${this.combat.telemetry.shotsFired}:${this.combat.telemetry.infantryHits}:${this.combat.telemetry.vehicleHits}:${this.combat.telemetry.buildingHits}:${this.combat.telemetry.penetrations}`;
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

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
