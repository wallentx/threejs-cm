import * as THREE from 'three';
import { Renderer } from './engine/Renderer.js';
import { CameraManager } from './engine/CameraManager.js';
import { SoundEngine } from './engine/SoundEngine.js';
import { TerrainBuilder } from './world/TerrainBuilder.js';
import { VehicleDamageEffects } from './world/VehicleDamageEffects.js';
import { Unit } from './game/Unit.js';
import { CommandSystem } from './game/CommandSystem.js';
import { SpottingSystem } from './game/SpottingSystem.js';
import { CombatSystem } from './game/CombatSystem.js';
import { getWeapon } from './game/WeaponCatalog.js';
import { SupportSystem } from './game/SupportSystem.js';
import { WegoManager } from './game/WegoManager.js';
import { UIManager } from './ui/UIManager.js';
import { MapEditor } from './editor/MapEditor.js';
import { loadScenario } from './scenario/ScenarioRuntime.js';
import { STONNE_1940_SCENARIO } from './scenarios/france1940/stonne1940.js';

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
    log('Initializing CMBN 1940 WebGL Game...', 'info');

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

      // 1. Renderer
      log('Creating WebGL Renderer...', 'info');
      this.renderer = new Renderer(this.container, {
        qualityTier: this.qualityTier,
        debugMode: this.visualDebugMode
      });
      this.scene = this.renderer.scene;
      this.camera = this.renderer.camera;

      // 2. Camera Manager
      log('Creating Camera Manager...', 'info');
      this.cameraManager = new CameraManager(this.camera, this.renderer.webglRenderer.domElement);
      this.sound = new SoundEngine();

      // 3. Terrain Builder
      log('Building Ardennes 1940 Terrain Map...', 'info');
      this.terrain = new TerrainBuilder(this.scene, {
        deploymentZones: this.scenario.deploymentZones
      });
      this.terrain.buildScenarioMap();

      // 4. Game Systems
      this.units = [];
      this.selectedUnit = null;
      this.matchStarted = false;

      log('Setting up Command & Combat Systems...', 'info');
      this.commands = new CommandSystem(this.scene, {
        deploymentZones: this.scenario.deploymentZones,
        terrain: this.terrain,
        isSetupPhase: () => this.wego?.isSetupPhase() ?? false,
        onInvalidDeployment: () => this.ui?.showToast(
          'Entire unit footprint must stay inside its setup area',
          'warn'
        )
      });
      this.spotting = new SpottingSystem(this.scene, this.terrain);
      this.combat = new CombatSystem(this.scene, this.sound, () => this.random(), {
        terrain: this.terrain,
        getUnits: () => this.units
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
      document.body.dataset.captureManifest = `${this.seed}:${this.cameraBookmark}:${this.qualityTier}:${this.visualDebugMode}:${this.wego.playMode}`;

      // 8. Start Game Loop
      this.clock = new THREE.Clock();
      this.animate();

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
      combat: this.combat.captureState(),
      supportMissions: this.support.captureState(),
      selectedUnitId: this.selectedUnit?.id ?? null,
      matchStarted: this.matchStarted
    };
  }

  restoreSimulationState(state) {
    this.randomState = state.randomState >>> 0;
    const unitMap = new Map(this.units.map(unit => [unit.id, unit]));
    for (const unitState of state.units) {
      unitMap.get(unitState.id)?.restoreState(unitState, unitMap);
    }
    this.combat.restoreState(state.combat, unitMap);
    this.vehicleDamageEffects.resetTransient();
    this.support.restoreState(state.supportMissions, unitMap);
    if (state.matchStarted) this.beginMatch();
    const selected = state.selectedUnitId ? unitMap.get(state.selectedUnitId) : null;
    if (selected) this.selectUnit(selected);
    this.commands.renderOverlays();
  }

  chooseTarget(attacker, opposingUnits) {
    if (attacker.targetUnit?.isCombatEffective() && attacker.targetUnit.mesh?.visible !== false) {
      return attacker.targetUnit;
    }
    const visibleTargets = opposingUnits.filter(target => {
      if (!target.isCombatEffective()) return false;
      const los = this.spotting.checkLOS(attacker.position, target.position);
      return los.clear && los.dist <= (attacker.vehicleSpec ? 220 : 150);
    });
    if (visibleTargets.length === 0) return null;
    return visibleTargets[Math.floor(this.random() * visibleTargets.length)];
  }

  hasContact(unit, opposingUnits, range = 135) {
    return opposingUnits.some(target => {
      const los = this.spotting.checkLOS(unit.position, target.position);
      return los.clear && los.dist <= range;
    });
  }

  simulateStep(delta) {
    const frenchUnits = this.units.filter(unit => unit.faction === 'french');
    const germanUnits = this.units.filter(unit => unit.faction === 'german');
    this.spotting.updateSpotting(this.units);
    this.units.forEach(unit => {
      const waypoint = unit.waypoints[unit.currentWaypointIndex];
      const opposingUnits = unit.faction === 'french' ? germanUnits : frenchUnits;
      const huntStopped = waypoint?.orderType === 'HUNT' && this.hasContact(unit, opposingUnits);
      unit.update(delta, this.terrain, { haltMovement: huntStopped });
    });
    this.spotting.updateSpotting(this.units);

    const attemptFire = (attacker, opposingUnits) => {
      if (!attacker.isCombatEffective()) return;

      if (attacker.type === 'infantry_squad') {
        attacker.updateIndividualCombat(delta, {
          opposingUnits,
          spotting: this.spotting,
          combat: this.combat,
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
    const fixedStep = 1 / 30;
    while (this.wego.currentTurnTime + 1e-6 < targetTime) {
      const delta = Math.min(fixedStep, targetTime - this.wego.currentTurnTime);
      this.simulateStep(delta);
      this.wego.completeSimulationStep(delta, {
        recordSnapshot: false,
        updateUI: false
      });
    }
  }

  initInteraction() {
    const dom = this.renderer.webglRenderer.domElement;

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

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);

    const simulationDelta = this.wego.getSimulationDelta(delta);
    if (simulationDelta > 0) {
      this.simulateStep(simulationDelta);
      this.wego.completeSimulationStep(simulationDelta);
    }

    this.spotting.updateSpotting(this.units);
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
      document.body.dataset.ballisticsStats = `${this.combat.telemetry.shotsFired}:${this.combat.telemetry.infantryHits}:${this.combat.telemetry.vehicleHits}:${this.combat.telemetry.penetrations}`;
      this.lastDiagnosticsUpdate = now;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
