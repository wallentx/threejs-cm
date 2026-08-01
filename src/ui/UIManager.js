import * as THREE from 'three';
import { Minimap } from './Minimap.js';
import { buildVehicleStatusView } from './VehicleStatusPresenter.js';

const scratchPos = new THREE.Vector3();
const iconOffset = new THREE.Vector3(0, 5.5, 0);
const badgeWorldAnchor = new THREE.Vector3();
const badgeCameraPosition = new THREE.Vector3();
const badgeRayDirection = new THREE.Vector3();
const badgeOccluderCenter = new THREE.Vector3();
const badgeOccluderOffset = new THREE.Vector3();
const INFANTRY_ONLY_MOVE_COMMANDS = new Set([
  'SNEAK',
  'CRAWL',
  'ASSAULT'
]);
const ICON_UPDATE_INTERVAL_MS = 1000 / 30;
const MINIMAP_UPDATE_INTERVAL_MS = 100;
const DEBUG_METRICS_UPDATE_INTERVAL_MS = 250;
export const UNIT_BADGE_SCREEN_CLEARANCE_PIXELS = 48;

export function projectUnitBadgeAnchor(
  unit,
  camera,
  viewportHeight,
  projectedAnchor,
  worldAnchor
) {
  if (!(viewportHeight > 0)) {
    throw new Error('Unit badge projection requires positive viewport height');
  }
  projectedAnchor.copy(unit.position).add(iconOffset).project(camera);
  projectedAnchor.y += (
    UNIT_BADGE_SCREEN_CLEARANCE_PIXELS * 2 / viewportHeight
  );
  worldAnchor.copy(projectedAnchor).unproject(camera);
  return projectedAnchor;
}

function readUnitDimensions(unit) {
  const dimensions =
    unit?.mesh?.userData?.modelMetadata?.dimensionsMeters
    ?? unit?.vehicleSpec?.dimensionsMeters
    ?? unit?.structureSpec?.dimensionsMeters
    ?? null;
  if (!dimensions) return null;
  if (![
    Number(dimensions.length),
    Number(dimensions.width),
    Number(dimensions.height)
  ].every(value =>
    Number.isFinite(value) && value > 0)) {
    return null;
  }
  return dimensions;
}

function unitOcclusionSphere(unit) {
  const dimensions = readUnitDimensions(unit);
  badgeOccluderCenter.copy(unit.position);
  if (dimensions) {
    const length = Number(dimensions.length);
    const width = Number(dimensions.width);
    const height = Number(dimensions.height);
    badgeOccluderCenter.y += height * 0.5;
    return Math.hypot(length, width, height) * 0.5;
  }

  let radius = Math.max(1.2, Number(unit.collisionRadius) || 0);
  if (unit.type === 'infantry_squad') {
    for (const agent of unit.soldierAI?.getLivingAgents?.() ?? []) {
      radius = Math.max(
        radius,
        Math.hypot(
          agent.position.x - unit.position.x,
          agent.position.y - unit.position.y,
          agent.position.z - unit.position.z
        ) + 1
      );
    }
    badgeOccluderCenter.y += 0.9;
  }
  return radius;
}

function materialOccludesBadge(material) {
  const materials = Array.isArray(material) ? material : [material];
  return materials.some(candidate =>
    candidate
    && candidate.visible !== false
    && (!candidate.transparent || Number(candidate.opacity ?? 1) > 0.05)
  );
}

function hitUsesVisibleModelGeometry(hit, root) {
  if (
    hit.object?.userData?.lodBand === 'ui'
    || !materialOccludesBadge(hit.object?.material)
  ) {
    return false;
  }
  let object = hit.object;
  while (object) {
    if (object.visible === false) return false;
    if (object === root) return true;
    object = object.parent;
  }
  return false;
}

export function buildRosterMemberPresentation(unit, soldier) {
  const roleLabel = String(soldier?.role ?? soldier?.name ?? 'CREW')
    .replaceAll('_', ' ');
  const health = Math.round(soldier?.health ?? 0);
  const state = soldier?.state ?? soldier?.status;
  return {
    primaryLabel: roleLabel,
    detailPrefix: `HP ${health} · ${state}`,
    roleLabel
  };
}

export class UIManager {
  constructor(runtimePort) {
    this.runtime = runtimePort;
    this.activeTab = 'move';
    
    const mapCanvas = document.getElementById('minimap-canvas');
    if (mapCanvas) {
      this.minimap = new Minimap(mapCanvas, runtimePort);
    } else {
      this.minimap = { render: () => {} };
    }

    this.showIcons = true;
    this.showPaths = true;
    this.showMinimap = true;
    this.showHUD = true;
    this.lastHudUpdate = 0;
    this.lastIconUpdate = Number.NEGATIVE_INFINITY;
    this.lastMinimapUpdate = Number.NEGATIVE_INFINITY;
    this.badgeOcclusionRaycaster = new THREE.Raycaster();
    this.badgeOcclusionHits = [];
    this.lastImpactKey = null;
    this.lastCrewServedCommandKey = null;
    this.iconPool = new Map();
    this.debugPanelVisible = false;
    this.debugToggles = {
      fps: true,
      fieldOfView: false,
      hitboxes: false,
      vehicleComponents: false,
      vehicleCrew: false,
      formationAI: false,
      logs: false,
      shots: false,
      ...this.runtime.getDebugOverlayState()
    };
    this.lastDebugMetricsUpdate = Number.NEGATIVE_INFINITY;

    this.initDOM();
    this.initHotkeys();

    this.runtime.onBuildingMoveRequested((unit, pointVec3, buildingId, orderType) =>
      this.showFloorSelectorModal(unit, pointVec3, buildingId, orderType));
  }

  bindClick(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  initDOM() {
    document.querySelectorAll('.cmd-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        this.switchCommandTab(tab);
      });
    });

    this.bindClick('btn-go', () => {
      if (this.runtime.playMode === 'realtime') this.runtime.togglePlayPause();
      else this.runtime.executeTurn();
    });
    this.bindClick('vcr-play', () => this.runtime.togglePlayPause());
    this.bindClick('vcr-rewind', () => this.runtime.rewindTurn());
    this.bindClick('vcr-back', () => this.runtime.stepTime(-5));
    this.bindClick('vcr-next', () => this.runtime.stepTime(5));
    this.bindClick('vcr-speed', () => this.runtime.toggleFastSpeed());

    const timeline = document.getElementById('timeline-slider');
    if (timeline) {
      timeline.addEventListener('change', (e) => {
        this.runtime.seekTime(Number(e.target.value));
      });
    }

    document.querySelectorAll('input[name="playmode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) this.runtime.setPlayMode(e.target.value);
      });
    });

    this.bindClick('toggle-icons', (e) => {
      this.showIcons = !this.showIcons;
      e.target.classList.toggle('active', this.showIcons);
    });

    this.bindClick('toggle-paths', (e) => {
      this.showPaths = !this.showPaths;
      e.target.classList.toggle('active', this.showPaths);
      this.runtime.setPathsVisible(this.showPaths);
    });
    this.bindClick('btn-map-toggle', (event) =>
      this.toggleMinimap(event.currentTarget));
    this.bindClick('btn-debug-toggle', event =>
      this.toggleDebugPanel(event.currentTarget));

    const debugToggleBindings = {
      'debug-toggle-fps': 'fps',
      'debug-toggle-fov': 'fieldOfView',
      'debug-toggle-hitboxes': 'hitboxes',
      'debug-toggle-components': 'vehicleComponents',
      'debug-toggle-crew': 'vehicleCrew',
      'debug-toggle-formation': 'formationAI',
      'debug-toggle-logs': 'logs',
      'debug-toggle-shots': 'shots'
    };
    for (const [elementId, toggleName] of Object.entries(debugToggleBindings)) {
      const toggleButton = document.getElementById(elementId);
      toggleButton?.classList.toggle('active', this.debugToggles[toggleName]);
      toggleButton?.setAttribute(
        'aria-pressed',
        String(this.debugToggles[toggleName])
      );
      this.bindClick(elementId, event => this.setDebugToggle(
        toggleName,
        !this.debugToggles[toggleName],
        event.currentTarget
      ));
    }

    this.bindClick('btn-cancel-cmd', () => this.cancelOrDeselect(false));
    this.bindClick('btn-deselect-unit', () => this.runtime.deselectUnit());

    // Fullscreen Toggle
    this.bindClick('btn-fullscreen', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          this.showToast('Fullscreen request denied', 'warn');
        });
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    });

    this.bindClick('btn-hud-toggle', () => {
      this.showHUD = !this.showHUD;
      const hudBox = document.getElementById('hud-panel');
      if (hudBox) hudBox.style.display = this.showHUD ? 'grid' : 'none';
      this.showToast(`HUD Panel ${this.showHUD ? 'Visible' : 'Hidden'}`, 'info');
    });

    this.bindClick('btn-sound-toggle', () => {
      const enabled = this.runtime.toggleSound();
      this.showToast(`Audio ${enabled ? 'Enabled' : 'Disabled'}`, 'info');
    });
    this.bindClick('btn-clear-shot-trajectory', () => {
      this.runtime.clearShotTrajectory();
    });

    // Lock UI touch events so dragging over UI doesn't scroll/zoom page
    const uiContainer = document.getElementById('ui-container');
    if (uiContainer) {
      uiContainer.addEventListener('touchmove', (e) => {
        if (!e.target.closest('.roster-grid') && !e.target.closest('#hud-panel')) {
          e.preventDefault();
        }
      }, { passive: false });
    }

    this.renderCommandGrid();
  }

  toggleDebugPanel(button = document.getElementById('btn-debug-toggle')) {
    this.debugPanelVisible = !this.debugPanelVisible;
    document.getElementById('debug-log')?.classList.toggle(
      'hidden',
      !this.debugPanelVisible
    );
    button?.classList.toggle('active', this.debugPanelVisible);
    button?.setAttribute('aria-expanded', String(this.debugPanelVisible));
    if (this.debugPanelVisible) {
      this.lastDebugMetricsUpdate = Number.NEGATIVE_INFINITY;
      this.renderDebugMetrics(this.runtime.getDebugDiagnostics(), 0);
    }
    return this.debugPanelVisible;
  }

  setDebugToggle(name, enabled, button = null) {
    if (!(name in this.debugToggles)) {
      throw new Error(`Unknown debug toggle ${name}`);
    }
    const active = Boolean(enabled);
    this.debugToggles[name] = active;
    button?.classList.toggle('active', active);
    button?.setAttribute('aria-pressed', String(active));

    if (name === 'fps') {
      document.getElementById('debug-performance')?.classList.toggle(
        'hidden',
        !active
      );
      document.getElementById('debug-renderer-detail')?.classList.toggle(
        'hidden',
        !active
      );
    } else if (name === 'logs' || name === 'shots') {
      const sectionId = name === 'logs'
        ? 'debug-console-section'
        : 'shot-inspector';
      document.getElementById(sectionId)?.classList.toggle('hidden', !active);
    } else {
      this.runtime.setDebugOverlayEnabled(name, active);
    }
    return active;
  }

  renderDebugMetrics(diagnostics, timestamp) {
    if (
      !this.debugPanelVisible
      || !this.debugToggles.fps
      || !diagnostics
      || timestamp - this.lastDebugMetricsUpdate
        < DEBUG_METRICS_UPDATE_INTERVAL_MS
    ) {
      return false;
    }
    this.lastDebugMetricsUpdate = timestamp;
    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    const compact = value => Number.isFinite(value)
      ? new Intl.NumberFormat(undefined, {
          notation: 'compact',
          maximumFractionDigits: 1
        }).format(value)
      : '--';
    const frame = diagnostics.frame ?? {};
    const renderer = diagnostics.renderer ?? {};
    const lod = diagnostics.lod ?? {};
    setText('debug-fps', Number.isFinite(frame.fps) ? frame.fps.toFixed(0) : '--');
    setText(
      'debug-frame-average',
      Number.isFinite(frame.averageFrameMs)
        ? `${frame.averageFrameMs.toFixed(1)} ms`
        : '-- ms'
    );
    setText(
      'debug-frame-p95',
      Number.isFinite(frame.p95FrameMs)
        ? `${frame.p95FrameMs.toFixed(1)} ms`
        : '-- ms'
    );
    setText('debug-draw-calls', compact(renderer.drawCalls));
    setText('debug-triangles', compact(renderer.triangles));
    setText(
      'debug-lod-counts',
      `${lod.high ?? 0}/${lod.medium ?? 0}/${lod.core ?? 0}/${lod.low ?? 0}`
    );
    setText(
      'debug-renderer-detail',
      `${renderer.backend ?? renderer.backendName ?? 'unknown'} · ${renderer.qualityTier ?? 'unknown'} @ ${renderer.pixelRatio ?? '?'}x · ${renderer.geometries ?? 0} geometries · ${renderer.textures ?? 0} textures`
    );
    return true;
  }

  toggleMinimap(button = document.getElementById('btn-map-toggle')) {
    this.showMinimap = !this.showMinimap;
    document.body.classList.toggle(
      'tactical-map-hidden',
      !this.showMinimap
    );
    button?.classList.toggle('active', this.showMinimap);
    button?.setAttribute('aria-pressed', String(this.showMinimap));
    this.showToast(
      `Tactical Map ${this.showMinimap ? 'Visible' : 'Hidden'}`,
      'info'
    );
    return this.showMinimap;
  }

  initHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;

      if (e.code === 'Escape') {
        e.preventDefault();
        this.cancelOrDeselect();
        return;
      }
      if (e.code === 'KeyX') {
        e.preventDefault();
        this.runtime.deselectUnit();
        return;
      }
      if (/^Digit[1-9]$/.test(e.code)) {
        this.runtime.setCameraHeight(Number(e.code.slice(-1)));
        return;
      }

      if (e.code === 'F5') { e.preventDefault(); this.switchCommandTab('move'); }
      if (e.code === 'F6') { e.preventDefault(); this.switchCommandTab('combat'); }
      if (e.code === 'F7') { e.preventDefault(); this.switchCommandTab('special'); }
      if (e.code === 'F8') { e.preventDefault(); this.switchCommandTab('admin'); }

      if (e.code === 'Space') {
        e.preventDefault();
        if (this.runtime.phase === 'COMMAND_PHASE') this.runtime.executeTurn();
        else this.runtime.togglePlayPause();
      }

      if (e.code === 'KeyF') this.triggerCommand('FAST');
      if (e.code === 'KeyN') this.triggerCommand('QUICK');
      if (e.code === 'KeyJ') this.triggerCommand('HUNT');
      if (e.code === 'KeyK') this.triggerCommand('SNEAK');
      if (e.code === 'KeyL') this.triggerCommand('CRAWL');
      if (e.code === 'KeyU') this.triggerCommand('ASSAULT');
      if (e.code === 'KeyT') this.triggerCommand('TARGET');
      if (e.code === 'KeyA') this.triggerCommand('TARGET_AP');
      if (e.code === 'KeyG') this.triggerCommand('TARGET_MG');
      if (e.code === 'KeyY') this.triggerCommand('TARGET_HULL_HE');
      if (e.code === 'KeyO') this.triggerCommand('FACE');
      if (e.code === 'KeyH') this.handleDirectAction('HIDE');
      if (
        e.code === 'KeyB'
        && (
          this.runtime.selectedUnit?.canUnbuttonCommander?.()
          || this.runtime.selectedUnit?.vehicleCrewPosture === 'UNBUTTONED'
        )
      ) {
        e.preventDefault();
        this.handleDirectAction('TOGGLE_COMMANDER_POSTURE');
      }
      if (
        e.code === 'KeyD'
        && this.runtime.selectedUnit?.hasDeployableCrewServedWeapon?.()
      ) {
        e.preventDefault();
        this.handleDirectAction('DEPLOY');
      }
      if (e.code === 'KeyE') {
        const selectedUnit = this.runtime.selectedUnit;
        if (selectedUnit?.vehicleSpec?.mainGun?.he) {
          e.preventDefault();
          this.triggerCommand('TARGET_HE');
          return;
        }
        const eligible = selectedUnit?.type === 'infantry_squad'
          && selectedUnit.soldierAI?.agents?.some(
            agent => Boolean(agent.buildingLocation)
          );
        if (eligible && this.canIssueOrders()) {
          e.preventDefault();
          this.handleDirectAction('EXIT_BUILDING');
        }
      }
    });
  }

  switchCommandTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.cmd-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    this.renderCommandGrid();
  }

  renderCommandGrid() {
    const grid = document.getElementById('command-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const hasSelection = Boolean(this.runtime.selectedUnit);
    const hasDisplayedUnit = Boolean(
      this.runtime.displayedUnit ?? this.runtime.selectedUnit
    );
    const commandPanel = document.getElementById('panel-commands');
    const rosterPanel = document.getElementById('panel-team-roster');
    for (const [panel, active] of [
      [commandPanel, hasSelection],
      [rosterPanel, hasDisplayedUnit]
    ]) {
      if (!panel) continue;
      // Keep the HUD grid stable: empty selection-dependent panels stay in
      // their cells, but their controls/content become non-interactive.
      panel.hidden = false;
      panel.inert = !active;
      panel.setAttribute('aria-disabled', String(!active));
      panel.classList.toggle('is-selection-empty', !active);
    }
    document.body?.classList.toggle('no-unit-selected', !hasSelection);
    if (!hasSelection) return;

    const selectedVehicle = this.runtime.selectedUnit?.vehicleSpec ?? null;
    const mortarTargetCommands = this.runtime.selectedUnit?.mortarTeamConfig
      ? [
          { label: 'TARGET HE', mode: 'MORTAR_HE', key: 'E' },
          ...(this.runtime.selectedUnit.mortarTeamConfig.smokeWeaponId
            ? [{ label: 'TARGET SMOKE', mode: 'MORTAR_SMOKE', key: 'S' }]
            : [])
        ]
      : null;
    const vehicleTargetCommands = selectedVehicle
      ? [
          ...(selectedVehicle.mainGun || selectedVehicle.weaponMounts?.length
            ? [{ label: 'TARGET AUTO', mode: 'TARGET', key: 'T' }]
            : []),
          ...(selectedVehicle.mainGun?.ap
            ? [{ label: 'TARGET AP', mode: 'TARGET_AP', key: 'A' }]
            : []),
          ...(selectedVehicle.mainGun?.he
            ? [{ label: 'TARGET HE', mode: 'TARGET_HE', key: 'E' }]
            : []),
          ...(selectedVehicle.weaponMounts?.some(mount => mount.kind !== 'cannon')
            ? [{ label: 'TARGET MG', mode: 'TARGET_MG', key: 'G' }]
            : []),
          ...(selectedVehicle.weaponMounts?.some(
            mount => mount.targetModes?.includes('TARGET_HULL_HE')
          )
            ? [{ label: 'TARGET HULL HE', mode: 'TARGET_HULL_HE', key: 'Y' }]
            : []),
          ...(selectedVehicle.weaponMounts?.some(
            mount => mount.targetModes?.includes('TARGET_HULL_APHE')
          )
            ? [{ label: 'TARGET HULL APHE', mode: 'TARGET_HULL_APHE', key: '' }]
            : [])
        ]
      : null;
    const tabButtons = {
      move: [
        { label: 'FAST', mode: 'MOVE_FAST', key: 'F' },
        { label: 'QUICK', mode: 'MOVE_QUICK', key: 'N' },
        { label: 'MOVE', mode: 'MOVE_MOVE', key: 'O' },
        { label: 'HUNT', mode: 'MOVE_HUNT', key: 'J' },
        ...(this.runtime.selectedUnit?.type === 'infantry_squad'
          ? [
              { label: 'SNEAK', mode: 'MOVE_SNEAK', key: 'K' },
              { label: 'CRAWL', mode: 'MOVE_CRAWL', key: 'L' },
              { label: 'ASSAULT', mode: 'MOVE_ASSAULT', key: 'U' }
            ]
          : []),
        { label: 'PAUSE', action: 'PAUSE', key: 'P' },
        { label: 'CLEAR', action: 'CLEAR_PATHS', key: 'C' }
      ],
      combat: [
        ...(mortarTargetCommands ?? vehicleTargetCommands ?? [
          { label: 'TARGET', mode: 'TARGET', key: 'T' },
          { label: 'TARGET LIGHT', mode: 'TARGET_LIGHT', key: 'I' }
        ]),
        { label: 'CLEAR TARGET', action: 'CLEAR_TARGET', key: 'C' },
        { label: 'FACE', mode: 'FACE', key: 'O' }
      ],
      special: [
        {
          label: this.runtime.selectedUnit?.holdFire
            ? 'FREE FIRE'
            : 'HOLD FIRE',
          action: 'TOGGLE_HOLD_FIRE',
          key: 'F'
        },
        { label: 'HIDE', action: 'HIDE', key: 'H' },
        ...(
          this.runtime.selectedUnit?.canUnbuttonCommander?.()
          || this.runtime.selectedUnit?.vehicleCrewPosture === 'UNBUTTONED'
            ? [{
                label: this.runtime.selectedUnit.vehicleCrewPosture === 'UNBUTTONED'
                  ? 'BUTTON UP'
                  : 'UNBUTTON',
                action: 'TOGGLE_COMMANDER_POSTURE',
                key: 'B'
              }]
            : []
        ),
        ...(this.runtime.selectedUnit?.hasDeployableCrewServedWeapon?.()
          ? [{
              label: ['READY', 'SETTING_UP'].includes(
                this.runtime.selectedUnit.mortarTeamState?.deploymentState
              )
                ? 'PACK MORTAR'
                : 'DEPLOY MORTAR',
              action: 'DEPLOY',
              key: 'D'
            }]
          : []),
        ...(this.runtime.selectedUnit?.soldierAI?.agents.some(
          agent => Boolean(agent.buildingLocation)
        )
          ? [{ label: 'DISMOUNT / EXIT', action: 'EXIT_BUILDING', key: 'E' }]
          : [])
      ],
      admin: this.runtime.selectedUnit?.hasDeployableCrewServedWeapon?.()
        ? []
        : [{ label: 'SPLIT SQUAD', action: 'SPLIT', key: 'S' }]
    };

    const currentBtns = tabButtons[this.activeTab] || [];

    currentBtns.forEach(btnDef => {
      const btn = document.createElement('button');
      btn.className = 'btn-cmd';
      if (btnDef.mode === this.runtime.commandMode) btn.classList.add('active');
      btn.innerHTML = `
        <span class="cmd-hotkey">${btnDef.key || ''}</span>
        <span class="cmd-label">${btnDef.label}</span>
      `;

      btn.addEventListener('click', () => {
        if (!['CANCEL_ACTION', 'DESELECT'].includes(btnDef.action) && !this.canIssueOrders()) {
          this.showToast('Orders are locked during WEGO action playback', 'warn');
          return;
        }
        if (btnDef.mode) {
          const activeMode = this.runtime.setCommandMode(btnDef.mode);
          this.renderCommandGrid();
          this.showToast(
            activeMode ? `Order: ${btnDef.label} (Tap map/target)` : 'Command tool cancelled',
            'info'
          );
        } else if (btnDef.action) {
          this.handleDirectAction(btnDef.action);
        }
      });

      grid.appendChild(btn);
    });
  }

  handleDirectAction(action) {
    if (action === 'CANCEL_ACTION') {
      this.cancelOrDeselect(false);
      return;
    }
    if (action === 'DESELECT') {
      this.runtime.deselectUnit();
      return;
    }
    if (!this.canIssueOrders()) {
      this.showToast('Orders are locked during WEGO action playback', 'warn');
      return;
    }
    const unit = this.runtime.selectedUnit;
    if (!unit) return;

    switch (action) {
      case 'PAUSE':
        this.runtime.addPause(15);
        this.showToast('15s Waypoint Pause Added', 'info');
        break;
      case 'CLEAR_PATHS':
        this.runtime.clearPaths();
        this.showToast('Waypoints Cleared', 'info');
        break;
      case 'CLEAR_TARGET':
        this.runtime.clearTarget();
        this.showToast('Target Cleared', 'info');
        break;
      case 'HIDE': {
        const hiding = this.runtime.toggleHiding();
        this.showToast(`Unit Stance: ${hiding ? 'Hiding (Prone)' : 'Normal'}`, 'info');
        break;
      }
      case 'TOGGLE_HOLD_FIRE': {
        const holdFire = this.runtime.toggleHoldFire();
        if (holdFire != null) {
          this.showToast(
            holdFire ? 'Unit holding fire' : 'Unit free to engage',
            holdFire ? 'warn' : 'info'
          );
          this.renderCommandGrid();
        }
        break;
      }
      case 'TOGGLE_COMMANDER_POSTURE': {
        const posture = this.runtime.toggleVehicleCommanderPosture();
        if (posture) {
          this.showToast(
            posture === 'UNBUTTONED'
              ? 'Commander unbuttoned: improved observation, exposed to fire'
              : 'Commander buttoned up',
            posture === 'UNBUTTONED' ? 'warn' : 'info'
          );
          this.renderCommandGrid();
        }
        break;
      }
      case 'DEPLOY': {
        const deploymentState = this.runtime.toggleDeployment();
        const deploymentMessages = {
          SETTING_UP: 'Mortar setup started',
          READY: 'Mortar ready',
          PACKING: 'Mortar pack-up started',
          PACKED: 'Mortar packed'
        };
        if (deploymentState) {
          this.showToast(
            deploymentMessages[deploymentState]
              ?? `Mortar: ${deploymentState}`,
            'info'
          );
          this.renderCommandGrid();
        }
        break;
      }
      case 'SPLIT':
        this.runtime.splitSelectedUnit();
        break;
      case 'EXIT_BUILDING':
        this.runtime.exitSelectedBuilding();
        break;
    }
  }

  cancelOrDeselect(deselectWhenIdle = true) {
    const cancelled = this.runtime.cancelCommandMode();
    if (cancelled) {
      this.renderCommandGrid();
      this.showToast('Command tool cancelled', 'info');
    } else if (deselectWhenIdle) {
      this.runtime.deselectUnit();
    }
  }

  triggerCommand(commandName) {
    if (!this.canIssueOrders()) return;
    if (INFANTRY_ONLY_MOVE_COMMANDS.has(commandName)
        && this.runtime.selectedUnit?.type !== 'infantry_squad') return;
    if (commandName === 'FAST') this.runtime.setCommandMode('MOVE_FAST');
    if (commandName === 'QUICK') this.runtime.setCommandMode('MOVE_QUICK');
    if (commandName === 'HUNT') this.runtime.setCommandMode('MOVE_HUNT');
    if (commandName === 'SNEAK') this.runtime.setCommandMode('MOVE_SNEAK');
    if (commandName === 'CRAWL') this.runtime.setCommandMode('MOVE_CRAWL');
    if (commandName === 'ASSAULT') this.runtime.setCommandMode('MOVE_ASSAULT');
    if (commandName === 'TARGET') this.runtime.setCommandMode('TARGET');
    if (
      commandName === 'TARGET_AP'
      && this.runtime.selectedUnit?.vehicleSpec?.mainGun?.ap
    ) {
      this.runtime.setCommandMode('TARGET_AP');
    }
    if (
      commandName === 'TARGET_HE'
      && this.runtime.selectedUnit?.vehicleSpec?.mainGun?.he
    ) {
      this.runtime.setCommandMode('TARGET_HE');
    }
    if (
      commandName === 'TARGET_MG'
      && this.runtime.selectedUnit?.vehicleSpec?.weaponMounts?.some(
        mount => mount.kind !== 'cannon'
      )
    ) {
      this.runtime.setCommandMode('TARGET_MG');
    }
    if (
      commandName === 'TARGET_HULL_HE'
      && this.runtime.selectedUnit?.vehicleSpec?.weaponMounts?.some(
        mount => mount.targetModes?.includes('TARGET_HULL_HE')
      )
    ) {
      this.runtime.setCommandMode('TARGET_HULL_HE');
    }
    if (
      commandName === 'TARGET_HULL_APHE'
      && this.runtime.selectedUnit?.vehicleSpec?.weaponMounts?.some(
        mount => mount.targetModes?.includes('TARGET_HULL_APHE')
      )
    ) {
      this.runtime.setCommandMode('TARGET_HULL_APHE');
    }
    if (commandName === 'FACE') this.runtime.setCommandMode('FACE');
    this.renderCommandGrid();
  }

  canIssueOrders() {
    return this.runtime.canIssueOrders();
  }

  updateUnitHUD(unit) {
    if (!unit) {
      const flagEl = document.getElementById('unit-flag');
      if (flagEl) flagEl.innerText = '⚔️';
      const nameEl = document.getElementById('unit-name');
      if (nameEl) nameEl.innerText = 'NO UNIT SELECTED';
      const subEl = document.getElementById('unit-sub');
      if (subEl) subEl.innerText = 'Click a unit badge';
      const rosterGrid = document.getElementById('roster-grid');
      if (rosterGrid) rosterGrid.innerHTML = '';
      const rifleEl = document.getElementById('ammo-rifle');
      if (rifleEl) rifleEl.innerText = 'RIFLES: --';
      const barEl = document.getElementById('ammo-bar');
      if (barEl) barEl.innerText = 'AUTOMATIC: --';
      this.renderVehicleStatus(null);
      return;
    }

    const flagEl = document.getElementById('unit-flag');
    if (flagEl) {
      flagEl.innerText = this.runtime.getFactionPresentation(unit.faction)?.flagGlyph ?? '⚔️';
    }

    const nameEl = document.getElementById('unit-name');
    if (nameEl) nameEl.innerText = unit.name;

    const subEl = document.getElementById('unit-sub');
    if (subEl) {
      const selectionCount = Math.max(
        1,
        this.runtime.selectedUnits?.length ?? 1
      );
      const selectionPrefix = selectionCount > 1
        ? `${selectionCount} UNITS SELECTED · PRIMARY · `
        : '';
      subEl.innerText = `${selectionPrefix}${unit.type.toUpperCase()} • ${unit.experience} / Leadership +${unit.leadership}`;
    }

    const moraleFill = document.getElementById('meter-morale');
    const txtMorale = document.getElementById('txt-morale');
    if (moraleFill) moraleFill.style.width = unit.morale === 'OK' ? '100%' : (unit.morale === 'Pinned' ? '50%' : '15%');
    if (txtMorale) txtMorale.innerText = unit.morale;

    const suppFill = document.getElementById('meter-suppression');
    const txtSupp = document.getElementById('txt-suppression');
    if (suppFill) suppFill.style.width = `${unit.suppression}%`;
    if (txtSupp) txtSupp.innerText = unit.suppression > 50 ? 'HIGH' : (unit.suppression > 10 ? 'MED' : 'NONE');

    const rosterGrid = document.getElementById('roster-grid');
    const weaponLookup = unit.catalogPorts.weapons.get;
    if (rosterGrid) {
      rosterGrid.innerHTML = '';
      unit.roster.forEach(s => {
        const slot = document.createElement('div');
        slot.className = `soldier-slot ${s.status.toLowerCase()}`;
        const weapon = weaponLookup(s.weaponId ?? s.weapon);
        const ammoText = weapon
          ? `${s.magazineAmmo ?? 0}/${s.reserveAmmo ?? 0}${s.reloadTimer > 0 ? ` · reload ${s.reloadTimer.toFixed(1)}s` : ''}`
          : '';
        const buildingText = s.buildingLocation
          ? ` · ${s.buildingLocation.phase.toUpperCase()} ${s.buildingLocation.nodeId ?? ''}`
          : '';
        const aimRequired = s.fireControl?.aimRequiredSeconds ?? 0;
        const aimText = aimRequired > 0
          ? ` · AIM ${Math.round(
              Math.min(1, (s.fireControl.aimProgressSeconds ?? 0) / aimRequired) * 100
            )}% @ ${Math.round(s.fireControl.estimatedRangeMeters ?? 0)}m`
          : '';
        const member = buildRosterMemberPresentation(unit, s);
        const detailLabel = `${member.detailPrefix}${buildingText}${aimText}`;
        slot.title = `${s.name} | ${member.roleLabel} | ${s.state ?? s.status}${buildingText}${aimText} | Health ${Math.round(s.health ?? 0)} | Suppression ${Math.round(s.suppression ?? 0)}${ammoText ? ` | Ammo ${ammoText}` : ''}`;
        slot.innerHTML = `
          <span><b>${member.primaryLabel}</b><em>${detailLabel}</em></span>
          <strong>${s.weapon ?? 'Unarmed'}${ammoText ? ` · ${ammoText}` : ''}</strong>
        `;
        rosterGrid.appendChild(slot);
      });
    }
    this.renderVehicleStatus(unit);

    const rifleEl = document.getElementById('ammo-rifle');
    const barEl = document.getElementById('ammo-bar');
    if (unit.mortarTeamState) {
      const mortarRounds = Object.values(
        unit.mortarTeamState.roundsBySoldierId
      ).reduce((sum, rounds) => sum + rounds, 0);
      if (rifleEl) {
        rifleEl.innerText =
          `MORTAR: ${unit.mortarTeamState.deploymentState.replaceAll('_', ' ')}`;
      }
      if (barEl) {
        barEl.innerText =
          `60MM HE: ${mortarRounds}`
          + (
            unit.mortarTeamState.reloadRemainingSeconds > 0
              ? ` · LOAD ${unit.mortarTeamState.reloadRemainingSeconds.toFixed(1)}s`
              : ''
          );
      }
    } else if (unit.vehicleWeapon) {
      const loaded = unit.vehicleWeapon.loadedType?.toUpperCase() ?? 'EMPTY';
      const feed = unit.vehicleWeapon.feedAmmo ?? (unit.vehicleWeapon.loadedType ? 1 : 0);
      if (rifleEl) rifleEl.innerText = `MAIN GUN: ${loaded} · FEED ${feed}`;
      if (barEl) {
        const ammo = unit.vehicleWeapon.ammunition;
        barEl.innerText = `AP ${ammo.ap ?? 0} · HE ${ammo.he ?? 0}${unit.vehicleWeapon.reloadTimer > 0 ? ` · RELOAD ${unit.vehicleWeapon.reloadTimer.toFixed(1)}s` : ''}`;
      }
    } else if (unit.vehicleSpec) {
      if (rifleEl) rifleEl.innerText = 'MAIN GUN: UNARMED';
      if (barEl) barEl.innerText = 'AMMUNITION: NONE';
    } else {
      const agents = unit.soldierAI?.agents ?? [];
      const rifleAmmo = agents
        .filter(agent => weaponLookup(agent.weaponId)?.kind === 'rifle')
        .reduce((sum, agent) => sum + agent.magazineAmmo + agent.reserveAmmo, 0);
      const automaticAmmo = agents
        .filter(agent => (
          ['machine_gun', 'submachine_gun'].includes(weaponLookup(agent.weaponId)?.kind)
        ))
        .reduce((sum, agent) => sum + agent.magazineAmmo + agent.reserveAmmo, 0);
      if (rifleEl) rifleEl.innerText = `RIFLES: ${rifleAmmo}`;
      if (barEl) barEl.innerText = `AUTOMATIC: ${automaticAmmo}`;
    }
  }

  clearUnitHUD() {
    this.updateUnitHUD(null);
  }

  renderVehicleStatus(unit) {
    const root = document.getElementById('vehicle-status');
    const componentGrid = document.getElementById('vehicle-system-grid');
    const mountGrid = document.getElementById('vehicle-mount-grid');
    const header = document.getElementById('selection-roster-header');
    const view = buildVehicleStatusView(unit);

    if (!view) {
      if (root) {
        root.hidden = true;
        root.classList.remove('burning', 'destroyed');
      }
      if (componentGrid) componentGrid.replaceChildren();
      if (mountGrid) mountGrid.replaceChildren();
      if (header) header.textContent = 'SQUAD ROSTER & WEAPONS';
      return null;
    }

    if (root) {
      root.hidden = false;
      root.classList.toggle('burning', view.burning);
      root.classList.toggle('destroyed', view.destroyed);
    }
    if (header) {
      const condition = [
        view.destroyed ? 'KNOCKED OUT' : (view.burning ? 'BURNING' : null),
        view.crewPosture === 'UNBUTTONED' ? 'UNBUTTONED' : null
      ].filter(Boolean);
      header.textContent = `CREW, WEAPONS & SYSTEMS${
        condition.length > 0 ? ` · ${condition.join(' · ')}` : ''
      }`;
    }

    if (componentGrid) {
      componentGrid.replaceChildren();
      for (const component of view.components) {
        const item = document.createElement('div');
        item.className = `vehicle-system ${component.status.toLowerCase()}`;
        item.style.setProperty('--system-health', `${component.health}%`);
        item.title = `${component.label}: ${component.status} (${Math.round(component.health)}% health)`;

        const label = document.createElement('strong');
        label.textContent = component.label;
        const status = document.createElement('span');
        status.textContent = `${component.status} ${Math.round(component.health)}%`;
        item.append(label, status);
        componentGrid.appendChild(item);
      }
    }

    if (mountGrid) {
      mountGrid.replaceChildren();
      for (const mount of view.mounts) {
        const item = document.createElement('div');
        item.className = `vehicle-mount ${mount.operational ? '' : 'disabled'}`.trim();
        const reload = mount.reloadTimer > 0 ? ` RLD ${mount.reloadTimer.toFixed(1)}s` : '';
        const aim = mount.aimProgressRatio == null
          ? ''
          : ` AIM ${Math.round(mount.aimProgressRatio * 100)}% @ ${Math.round(mount.estimatedRangeMeters ?? 0)}m`;
        item.textContent = `${mount.label} [${mount.status}]: ${mount.weaponId ?? 'UNARMED'} ${mount.feed}/${mount.reserve}${reload}${aim}`;
        item.title = `${mount.label}: ${mount.status}${aim}`;
        mountGrid.appendChild(item);
      }
    }
    return view;
  }

  updatePhaseDisplay(phase, turnNum, turnTime) {
    const realtime = this.runtime.playMode === 'realtime';
    const badge = document.getElementById('phase-badge');
    if (badge) {
      badge.innerText = realtime
        ? (this.runtime.isPlaying ? 'REALTIME' : 'REALTIME PAUSED')
        : (phase === 'COMMAND_PHASE' ? 'COMMAND PHASE' : 'ACTION PHASE');
      badge.className = `phase-badge ${realtime || phase === 'ACTION_PHASE' ? 'action-phase' : 'command-phase'}`;
    }

    const formatTime = (sec) => {
      const total = Math.max(0, Math.floor(sec));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const timerEl = document.getElementById('turn-timer');
    if (timerEl) {
      timerEl.innerText = realtime
        ? `LIVE [${formatTime(turnTime)}]`
        : `TURN ${turnNum} [${formatTime(turnTime)}]`;
    }

    const timeDispEl = document.getElementById('time-display');
    if (timeDispEl) {
      timeDispEl.innerText = realtime
        ? `${formatTime(turnTime)} LIVE`
        : `${formatTime(turnTime)} / 01:00`;
    }

    const slider = document.getElementById('timeline-slider');
    if (slider) slider.value = realtime ? turnTime % 60 : turnTime;
  }

  updatePlaybackDisplay(isPlaying, playbackSpeed) {
    const play = document.getElementById('vcr-play');
    if (play) {
      play.classList.toggle('active', isPlaying);
      play.title = isPlaying ? 'Pause' : 'Play';
    }
    const speed = document.getElementById('vcr-speed');
    if (speed) speed.innerText = `${playbackSpeed}x`;
    if (this.runtime.playMode === 'realtime') {
      const goText = document.querySelector('#btn-go .go-text');
      if (goText) goText.innerText = isPlaying ? 'PAUSE' : 'RUN';
    }
  }

  updatePlayModeDisplay(mode) {
    const realtime = mode === 'realtime';
    document.querySelectorAll('input[name="playmode"]').forEach(radio => {
      radio.checked = radio.value === mode;
      radio.closest('label')?.classList.toggle('active', radio.checked);
    });
    for (const id of ['vcr-rewind', 'vcr-back', 'vcr-next']) {
      const button = document.getElementById(id);
      if (button) button.disabled = realtime;
    }
    const slider = document.getElementById('timeline-slider');
    if (slider) slider.disabled = realtime;
    const goText = document.querySelector('#btn-go .go-text');
    if (goText) {
      goText.innerText = realtime
        ? (this.runtime.isPlaying ? 'PAUSE' : 'RUN')
        : 'GO!';
    }
    document.body.dataset.playMode = mode;
  }

  updateShotInspector(impacts) {
    const list = document.getElementById('shot-inspector-list');
    if (!list) return;
    const latest = impacts[impacts.length - 1] ?? null;
    const latestKey = latest
      ? `${impacts.length}:${latest.impactId ?? latest.id}:${latest.ricochetCount ?? 0}:${latest.impactPosition?.join(',') ?? ''}`
      : 'empty';
    if (latestKey === this.lastImpactKey && list.childElementCount > 0) return;
    this.lastImpactKey = latestKey;
    list.replaceChildren();

    if (impacts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'shot-empty';
      empty.textContent = 'No resolved impacts yet.';
      list.appendChild(empty);
      return;
    }

    for (const record of impacts.slice(-5).reverse()) {
      const entry = document.createElement('article');
      entry.className = [
        'shot-record',
        record.penetrated === true ? 'penetrated' : '',
        record.ricocheted === true ? 'ricocheted' : ''
      ].filter(Boolean).join(' ');
      entry.tabIndex = 0;
      entry.setAttribute('role', 'button');
      entry.title = 'Select or clear this trajectory in the 3D view';
      const toggleTrajectory = () => this.runtime.toggleShotTrajectory(record);
      entry.addEventListener('click', toggleTrajectory);
      entry.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleTrajectory();
      });

      const identity = document.createElement('div');
      identity.className = 'shot-record-title';
      identity.textContent = `shot #${record.id} / impact #${record.impactId ?? record.id} ${record.shooterId ?? 'unknown'} -> ${record.targetId ?? record.kind}`;

      const range = Number.isFinite(record.rangeMeters) ? record.rangeMeters.toFixed(1) : '0.0';
      const speed = Number.isFinite(record.impactSpeed) ? record.impactSpeed.toFixed(0) : '0';
      const flightTime = Number.isFinite(record.flightTime) ? record.flightTime.toFixed(3) : '0.000';

      const flight = document.createElement('div');
      const estimatedRange = Number.isFinite(record.estimatedRangeMeters)
        ? ` | sight ${record.estimatedRangeMeters.toFixed(1)} m`
        : '';
      flight.textContent = `${record.weaponId || 'gun'}/${record.ammoId || 'ap'} | ${range} m${estimatedRange} | ${speed} m/s | ${flightTime} s`;

      const vectors = document.createElement('div');
      vectors.className = 'shot-record-vectors';
      const mPos = Array.isArray(record.muzzlePosition) ? record.muzzlePosition.map(v => Number.isFinite(v) ? v.toFixed(1) : '0.0').join(', ') : '0, 0, 0';
      const iPos = Array.isArray(record.impactPosition) ? record.impactPosition.map(v => Number.isFinite(v) ? v.toFixed(1) : '0.0').join(', ') : '0, 0, 0';
      vectors.textContent = `muzzle [${mPos}] | impact [${iPos}]`;

      entry.append(identity, flight, vectors);

      if (record.kind === 'vehicle') {
        const armor = document.createElement('div');
        const explosive = record.explosiveEffect;
        const outcome = explosive
          ? 'DETONATED'
          : (record.penetrated
              ? 'PENETRATED'
              : (record.ricocheted ? 'RICOCHET' : 'STOPPED'));
        const outcomeClass = explosive
          ? (explosive.interiorExposed ? 'penetrated' : 'stopped')
          : (record.penetrated ? 'penetrated' : (record.ricocheted ? 'ricocheted' : 'stopped'));
        armor.className = `shot-outcome ${
          outcomeClass
        }`;
        const nominal = Number.isFinite(record.nominalArmorMm) ? record.nominalArmorMm.toFixed(1) : '0.0';
        const effective = Number.isFinite(record.effectiveArmorMm) ? record.effectiveArmorMm.toFixed(1) : '0.0';
        const pen = Number.isFinite(record.penetrationMm) ? record.penetrationMm.toFixed(1) : '0.0';
        const cos = Number.isFinite(record.impactCosine) ? record.impactCosine.toFixed(3) : '1.000';
        const angle = Number.isFinite(record.impactAngleDegrees)
          ? record.impactAngleDegrees.toFixed(1)
          : '0.0';
        armor.textContent = `${record.zone || 'hull'} | armor ${nominal} -> ${effective} mm | pen ${pen} mm | angle ${angle} deg | cos ${cos} | ${outcome}`;
        entry.appendChild(armor);

        if (record.ricocheted) {
          const rebound = document.createElement('div');
          rebound.className = 'shot-record-ricochet';
          const postSpeed = Number.isFinite(record.postImpactSpeed)
            ? record.postImpactSpeed.toFixed(0)
            : '0';
          const retained = Number.isFinite(record.retainedEnergyRatio)
            ? `${(record.retainedEnergyRatio * 100).toFixed(0)}%`
            : '--';
          rebound.textContent = `rebound ${postSpeed} m/s | energy ${retained} | deflection #${record.ricochetCount ?? 1} | ${record.ricochetReason ?? 'deflected'}`;
          entry.appendChild(rebound);
        }

        if (explosive) {
          const blast = document.createElement('div');
          blast.className = 'shot-record-energy';
          const radius = Number.isFinite(explosive.internalRadiusMeters)
            ? explosive.internalRadiusMeters.toFixed(2)
            : '--';
          const affectedCrewRoles = explosive.crewIntents?.length ?? 0;
          const affectedModules = explosive.componentIntents?.length ?? 0;
          blast.textContent = `blast ${explosive.protectionResult} | internal radius ${radius} m | coupling ${(100 * (explosive.coupling ?? 0)).toFixed(0)}% | crew roles ${affectedCrewRoles} | modules ${affectedModules} | ${explosive.modelVersion}`;
          entry.appendChild(blast);
        } else if (record.penetrated) {
          const energy = document.createElement('div');
          energy.className = 'shot-record-energy';
          const formatEnergy = value => Number.isFinite(value)
            ? `${(value / 1000).toFixed(1)} kJ`
            : '--';
          const finalSpeed = record.exitResult?.residualSpeed
            ?? (Array.isArray(record.residualVelocity)
              ? Math.hypot(...record.residualVelocity)
              : record.postImpactSpeed);
          const exitPlate = record.exitResult?.plateId
            ?? record.exitResult?.armorVolumeId
            ?? record.exitResult?.zone;
          const exitIdentity = exitPlate ? ` | exit ${exitPlate}` : '';
          energy.textContent = `energy entry ${formatEnergy(record.impactEnergyJ)} -> after entry ${formatEnergy(record.plateResidualEnergyJ)} | inside -${formatEnergy(record.internalEnergySpentJ)} | pre-exit ${formatEnergy(record.preExitResidualEnergyJ)} | exit armor -${formatEnergy(record.exitArmorEnergySpentJ)}${exitIdentity} | residual ${formatEnergy(record.residualEnergyJ)} / ${Number.isFinite(finalSpeed) ? `${finalSpeed.toFixed(0)} m/s` : '--'} | ${record.continuationReason ?? 'stopped'}`;
          entry.appendChild(energy);
        }

        const crew = document.createElement('div');
        crew.className = 'shot-record-crew';
        const casualties = record.crewResult?.casualties?.length
          ? record.crewResult.casualties
          : (record.crewResult?.casualty ? [record.crewResult.casualty] : []);
        const damagedModules = Object.entries(record.crewResult?.damage ?? {})
          .filter(([, state]) => state !== 'OK')
          .map(([module, state]) => `${module}:${state}`);
        const directComponents = record.crewResult?.components
          ?.map(component => `${component.id}:${component.status ?? Math.round(component.health)}`)
          ?? [];
        crew.textContent = casualties.length
          ? `crew ${casualties.map(casualty =>
              `${casualty.role ?? casualty.name}: ${casualty.status} (${Math.round(casualty.health)} HP)`
            ).join(', ')}`
          : `crew none${damagedModules.length ? ` | ${damagedModules.join(', ')}` : ''}`;
        if (directComponents.length) crew.textContent += ` | modules ${directComponents.join(', ')}`;
        entry.appendChild(crew);

        if (record.internalPathHits?.length) {
          const path = document.createElement('div');
          path.className = 'shot-record-internal-path';
          path.textContent = `inside ${record.internalPathHits.map(hit => {
            const distance = Number.isFinite(hit.entryDistanceMeters)
              ? hit.entryDistanceMeters.toFixed(2)
              : '--';
            return `${hit.id}@${distance}m`;
          }).join(' -> ')}`;
          entry.appendChild(path);
        }
      }

      if (record.kind === 'building') {
        const section = record.buildingResult?.result ?? {};
        const outcome = section.collapsed
          ? 'COLLAPSED'
          : (section.breached
              ? 'BREACHED'
              : (record.penetrated ? 'PENETRATED' : 'CHIPPED'));
        const structure = document.createElement('div');
        structure.className = `shot-outcome ${record.penetrated ? 'penetrated' : 'stopped'}`;
        structure.textContent = `${record.sectionId}/${record.colliderPartId} | resistance ${record.nominalArmorMm?.toFixed(0) ?? '--'} mm | pen ${record.penetrationMm?.toFixed(1) ?? '--'} mm | ${outcome}${section.stage ? ` | ${section.stage}` : ''}`;
        entry.appendChild(structure);
      }

      list.appendChild(entry);
    }
  }

  updateFloatingIcons(units, cameraManager) {
    const overlay = document.getElementById('icon-overlay');
    if (!overlay) return;

    if (!this.showIcons) {
      this.iconPool.forEach(el => { el.style.display = 'none'; });
      return;
    }

    const activeIds = new Set();

    units.forEach(u => {
      if (u.mesh && !u.mesh.visible) return;

      projectUnitBadgeAnchor(
        u,
        cameraManager.camera,
        window.innerHeight,
        scratchPos,
        badgeWorldAnchor
      );

      if (scratchPos.z > 1) return;

      const screenX = (scratchPos.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-(scratchPos.y * 0.5) + 0.5) * window.innerHeight;

      activeIds.add(u.id);

      let iconDiv = this.iconPool.get(u.id);
      if (!iconDiv) {
        iconDiv = document.createElement('div');
        iconDiv.className = 'unit-floating-icon';
        this.iconPool.set(u.id, iconDiv);
        overlay.appendChild(iconDiv);
      }

      iconDiv.style.left = `${screenX}px`;
      iconDiv.style.top = `${screenY}px`;
      iconDiv.style.display = 'block';
      iconDiv.style.visibility = this.isBadgeOccluded(
        u,
        units,
        cameraManager.camera,
        badgeWorldAnchor
      )
        ? 'hidden'
        : 'visible';

      const displayedUnit =
        this.runtime.displayedUnit ?? this.runtime.selectedUnit;
      const isSelected = displayedUnit?.id === u.id;
      const isHovered = this.runtime.hoveredUnitId === u.id;
      const isPlayer = this.runtime.isPlayerFaction(u.faction);
      const presentation = this.runtime.getFactionPresentation(u.faction);
      const vehicleStatus = isSelected ? buildVehicleStatusView(u) : null;
      const damagedLabels = vehicleStatus?.damagedComponents
        .slice(0, 3)
        .map(component => `${component.label}:${component.status}`)
        .join(' · ');

      const contentKey = `${u.faction}:${presentation?.selectionColor}:${isPlayer}:${isSelected}:${isHovered}:${u.name}:${vehicleStatus?.destroyed ?? false}:${vehicleStatus?.burning ?? false}:${damagedLabels || ''}`;
      if (iconDiv.dataset.contentKey !== contentKey) {
        iconDiv.dataset.contentKey = contentKey;
        iconDiv.innerHTML = `
          ${isPlayer
            ? `<button type="button" class="icon-badge faction friendly ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}" aria-label="Select ${u.name}">
                ${u.vehicleSpec ? '🛡️' : '⚔️'}
              </button>`
            : `<button type="button" class="icon-badge faction hostile ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}" aria-label="Inspect ${u.name}">
                ${u.vehicleSpec ? '🛡️' : '⚔️'}
              </button>`}
          <div class="icon-details">
            <div class="icon-label">${u.name}</div>
            ${vehicleStatus ? `
              ${vehicleStatus.destroyed
                ? '<div class="vehicle-floating-condition destroyed">KNOCKED OUT</div>'
                : (vehicleStatus.burning
                    ? '<div class="vehicle-floating-condition burning">BURNING</div>'
                    : '')}
              ${damagedLabels ? `<div class="vehicle-floating-damage">${damagedLabels}</div>` : ''}
            ` : ''}
          </div>
        `;
        const badge = iconDiv.querySelector('.icon-badge');
        badge?.style.setProperty(
          '--faction-color',
          presentation?.selectionColor ?? '#64748b'
        );
        badge?.addEventListener?.('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const options = {
            additive: event.shiftKey || event.ctrlKey || event.metaKey,
            frameCamera: (event.detail ?? 1) >= 2
          };
          if (this.runtime.isPlayerFaction(u.faction)) {
            this.runtime.selectUnit(u, options);
          } else {
            this.runtime.inspectUnit(u, { frameCamera: options.frameCamera });
          }
        });
      }
      const badge = iconDiv.querySelector('.icon-badge');
      if (badge) badge.style.pointerEvents = this.runtime.commandMode ? 'none' : 'auto';
    });

    this.iconPool.forEach((el, id) => {
      if (!activeIds.has(id)) {
        el.style.display = 'none';
      }
    });
  }

  isBadgeOccluded(owner, units, camera, anchor) {
    if (!camera || !anchor?.isVector3) return false;
    const raycaster =
      this.badgeOcclusionRaycaster
      ??= new THREE.Raycaster();
    camera.getWorldPosition(badgeCameraPosition);
    badgeRayDirection.subVectors(anchor, badgeCameraPosition);
    const anchorDistance = badgeRayDirection.length();
    if (anchorDistance <= 0.05) return false;
    badgeRayDirection.divideScalar(anchorDistance);
    raycaster.set(badgeCameraPosition, badgeRayDirection);
    raycaster.near = 0;
    raycaster.far = anchorDistance - 0.05;

    for (const candidate of units) {
      if (
        candidate === owner
        || !candidate?.mesh
        || candidate.mesh.visible === false
      ) {
        continue;
      }
      const radius = unitOcclusionSphere(candidate);
      const distanceAlongRay = badgeRayDirection.dot(
        badgeOccluderOffset.subVectors(
          badgeOccluderCenter,
          badgeCameraPosition
        )
      );
      if (
        distanceAlongRay <= 0
        || distanceAlongRay >= anchorDistance
      ) {
        continue;
      }
      const closestDistanceSquared =
        raycaster.ray.distanceSqToPoint(badgeOccluderCenter);
      if (closestDistanceSquared > radius * radius) continue;
      const hits = this.badgeOcclusionHits ??= [];
      hits.length = 0;
      raycaster.intersectObject(candidate.mesh, true, hits);
      for (const hit of hits) {
        if (hitUsesVisibleModelGeometry(hit, candidate.mesh)) {
          return true;
        }
      }
    }
    return false;
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3500);
  }

  showFloorSelectorModal(unit, pointVec3, buildingId, orderType = 'MOVE') {
    const choices = this.runtime.getBuildingFloorIds(buildingId)
      .map(floorId => ({
        floorId,
        ...(floorId === 'ground-floor'
          ? {
              action: 'ENTER_GROUND',
              buttonId: 'btn-floor-ground',
              label: 'Ground Floor',
              toast: 'Ordered to Ground Floor'
            }
          : floorId === 'upper-floor'
            ? {
                action: 'ENTER_UPPER',
                buttonId: 'btn-floor-upper',
                label: 'Upper Floor',
                toast: 'Ordered to Upper Floor'
              }
            : {})
      }))
      .filter(choice => choice.action);
    if (choices.length === 0) {
      this.showToast('Building has no enterable floors', 'warn');
      return false;
    }

    const existing = document.getElementById('building-floor-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'building-floor-modal';
    modal.className = 'building-floor-modal';
    modal.innerHTML = `
      <div class="floor-modal-content">
        <div class="floor-modal-title">Select Target Floor</div>
        <div class="floor-modal-buttons">
          ${choices.map(choice => `
            <button id="${choice.buttonId}" class="btn-floor">${choice.label}</button>
          `).join('')}
          <button id="btn-floor-cancel" class="btn-floor btn-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    for (const choice of choices) {
      modal.querySelector(`#${choice.buttonId}`)?.addEventListener('click', () => {
        close();
        const result = this.runtime.issueBuildingOrder(
          unit, choice.action, pointVec3, buildingId, orderType
        );
        if (result?.accepted) {
          this.runtime.cancelCommandMode();
          this.renderCommandGrid();
          this.showToast(choice.toast, 'info');
        } else {
          this.showToast(result?.reason ?? 'Unable to enter building', 'warn');
        }
      });
    }
    modal.querySelector('#btn-floor-cancel')?.addEventListener('click', close);
    return true;
  }

  render(units, cameraManager, now = performance.now()) {
    if (
      !Number.isFinite(this.lastIconUpdate)
      || now - this.lastIconUpdate >= ICON_UPDATE_INTERVAL_MS
    ) {
      this.updateFloatingIcons(units, cameraManager);
      this.lastIconUpdate = now;
    }
    if (
      this.showMinimap
      && this.minimap
      && this.minimap.render
      && (
        !Number.isFinite(this.lastMinimapUpdate)
        || now - this.lastMinimapUpdate >= MINIMAP_UPDATE_INTERVAL_MS
      )
    ) {
      this.minimap.render(units, cameraManager);
      this.lastMinimapUpdate = now;
    }
    this.updateShotInspector(this.runtime.getImpacts());
    const crewServedCommandKey = this.runtime.selectedUnit?.mortarTeamState
      ? `${this.runtime.selectedUnit.id}:${
          this.runtime.selectedUnit.mortarTeamState.deploymentState
        }`
      : null;
    if (crewServedCommandKey !== this.lastCrewServedCommandKey) {
      this.lastCrewServedCommandKey = crewServedCommandKey;
      this.renderCommandGrid();
    }
    const displayedUnit =
      this.runtime.displayedUnit ?? this.runtime.selectedUnit;
    if (displayedUnit && now - this.lastHudUpdate >= 100) {
      this.updateUnitHUD(displayedUnit);
      this.lastHudUpdate = now;
    }
  }
}
