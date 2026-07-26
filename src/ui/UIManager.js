import * as THREE from 'three';
import { Minimap } from './Minimap.js';
import { getWeapon } from '../game/WeaponCatalog.js';
import { buildVehicleStatusView } from './VehicleStatusPresenter.js';

const scratchPos = new THREE.Vector3();
const iconOffset = new THREE.Vector3(0, 3.5, 0);

export class UIManager {
  constructor(game) {
    this.game = game;
    this.activeTab = 'move';
    
    const mapCanvas = document.getElementById('minimap-canvas');
    if (mapCanvas) {
      this.minimap = new Minimap(mapCanvas, game);
    } else {
      this.minimap = { render: () => {} };
    }

    this.showIcons = true;
    this.showPaths = true;
    this.showHUD = true;
    this.lastHudUpdate = 0;
    this.lastImpactId = null;
    this.iconPool = new Map();

    this.initDOM();
    this.initHotkeys();

    if (this.game.commands) {
      this.game.commands.onBuildingMoveClick = (unit, pointVec3, buildingId, orderType) => {
        return this.showFloorSelectorModal(unit, pointVec3, buildingId, orderType);
      };
    }
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
      if (this.game.wego.playMode === 'realtime') this.game.wego.togglePlayPause();
      else this.game.wego.executeTurn();
    });
    this.bindClick('vcr-play', () => this.game.wego.togglePlayPause());
    this.bindClick('vcr-rewind', () => this.game.wego.rewindTurn());
    this.bindClick('vcr-back', () => this.game.wego.stepTime(-5));
    this.bindClick('vcr-next', () => this.game.wego.stepTime(5));
    this.bindClick('vcr-speed', () => this.game.wego.toggleFastSpeed());

    const timeline = document.getElementById('timeline-slider');
    if (timeline) {
      timeline.addEventListener('change', (e) => {
        this.game.wego.seekTime(Number(e.target.value));
      });
    }

    document.querySelectorAll('input[name="playmode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) this.game.wego.setPlayMode(e.target.value);
      });
    });

    this.bindClick('toggle-icons', (e) => {
      this.showIcons = !this.showIcons;
      e.target.classList.toggle('active', this.showIcons);
    });

    this.bindClick('toggle-paths', (e) => {
      this.showPaths = !this.showPaths;
      e.target.classList.toggle('active', this.showPaths);
      if (this.game.commands && this.game.commands.pathLinesGroup) {
        this.game.commands.pathLinesGroup.visible = this.showPaths;
        this.game.commands.targetLinesGroup.visible = this.showPaths;
      }
    });

    this.bindClick('btn-cancel-cmd', () => this.cancelOrDeselect(false));
    this.bindClick('btn-deselect-unit', () => this.game.deselectUnit());

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
      this.game.sound.enabled = !this.game.sound.enabled;
      this.showToast(`Audio ${this.game.sound.enabled ? 'Enabled' : 'Disabled'}`, 'info');
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
        this.game.deselectUnit();
        return;
      }
      if (/^Digit[1-9]$/.test(e.code)) {
        this.game.cameraManager.setHeightPreset(Number(e.code.slice(-1)));
        return;
      }

      if (e.code === 'F5') { e.preventDefault(); this.switchCommandTab('move'); }
      if (e.code === 'F6') { e.preventDefault(); this.switchCommandTab('combat'); }
      if (e.code === 'F7') { e.preventDefault(); this.switchCommandTab('special'); }
      if (e.code === 'F8') { e.preventDefault(); this.switchCommandTab('admin'); }

      if (e.code === 'Space') {
        e.preventDefault();
        if (this.game.wego.phase === 'COMMAND_PHASE') this.game.wego.executeTurn();
        else this.game.wego.togglePlayPause();
      }

      if (e.code === 'KeyF') this.triggerCommand('FAST');
      if (e.code === 'KeyN') this.triggerCommand('QUICK');
      if (e.code === 'KeyJ') this.triggerCommand('HUNT');
      if (e.code === 'KeyT') this.triggerCommand('TARGET');
      if (e.code === 'KeyO') this.triggerCommand('FACE');
      if (e.code === 'KeyH') this.handleDirectAction('HIDE');
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
    const hasSelection = Boolean(this.game.selectedUnit);
    const commandPanel = document.getElementById('panel-commands');
    const rosterPanel = document.getElementById('panel-team-roster');
    for (const panel of [commandPanel, rosterPanel]) {
      if (!panel) continue;
      // Keep the HUD grid stable: empty selection-dependent panels stay in
      // their cells, but their controls/content become non-interactive.
      panel.hidden = false;
      panel.inert = !hasSelection;
      panel.setAttribute('aria-disabled', String(!hasSelection));
      panel.classList.toggle('is-selection-empty', !hasSelection);
    }
    document.body?.classList.toggle('no-unit-selected', !hasSelection);
    if (!hasSelection) return;

    const tabButtons = {
      move: [
        { label: 'FAST', mode: 'MOVE_FAST', key: 'F' },
        { label: 'QUICK', mode: 'MOVE_QUICK', key: 'N' },
        { label: 'MOVE', mode: 'MOVE_MOVE', key: 'O' },
        { label: 'HUNT', mode: 'MOVE_HUNT', key: 'J' },
        { label: 'PAUSE', action: 'PAUSE', key: 'P' },
        { label: 'CLEAR', action: 'CLEAR_PATHS', key: 'C' }
      ],
      combat: [
        { label: 'TARGET', mode: 'TARGET', key: 'T' },
        { label: 'TARGET LIGHT', mode: 'TARGET_LIGHT', key: 'I' },
        { label: 'CLEAR TARGET', action: 'CLEAR_TARGET', key: 'C' },
        { label: 'FACE', mode: 'FACE', key: 'O' }
      ],
      special: [
        { label: 'HIDE', action: 'HIDE', key: 'H' },
        { label: 'DEPLOY', action: 'DEPLOY', key: 'D' },
        ...(this.game.selectedUnit?.soldierAI?.agents.some(
          agent => Boolean(agent.buildingLocation)
        )
          ? [{ label: 'DISMOUNT / EXIT', action: 'EXIT_BUILDING', key: 'E' }]
          : [])
      ],
      admin: [
        { label: 'SPLIT SQUAD', action: 'SPLIT', key: 'S' }
      ]
    };

    const currentBtns = [
      ...(tabButtons[this.activeTab] || []),
      { label: 'CANCEL TOOL', action: 'CANCEL_ACTION', key: 'ESC' },
      { label: 'DESELECT', action: 'DESELECT', key: 'X' }
    ];

    currentBtns.forEach(btnDef => {
      const btn = document.createElement('button');
      btn.className = 'btn-cmd';
      if (btnDef.mode === this.game.commands.activeMode) btn.classList.add('active');
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
          const activeMode = this.game.commands.setCommandMode(btnDef.mode);
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
      this.game.deselectUnit();
      return;
    }
    if (!this.canIssueOrders()) {
      this.showToast('Orders are locked during WEGO action playback', 'warn');
      return;
    }
    const unit = this.game.selectedUnit;
    if (!unit) return;

    switch (action) {
      case 'PAUSE':
        unit.addPause(15);
        this.game.commands.renderOverlays();
        this.showToast('15s Waypoint Pause Added', 'info');
        break;
      case 'CLEAR_PATHS':
        unit.clearWaypoints();
        this.game.commands.renderOverlays();
        this.showToast('Waypoints Cleared', 'info');
        break;
      case 'CLEAR_TARGET':
        unit.targetUnit = null;
        unit.targetPos = null;
        this.game.commands.renderOverlays();
        this.showToast('Target Cleared', 'info');
        break;
      case 'HIDE':
        unit.isHiding = !unit.isHiding;
        unit.stance = unit.isHiding ? 'PRONE' : 'STANDING';
        unit.updateStanceVisuals();
        this.showToast(`Unit Stance: ${unit.isHiding ? 'Hiding (Prone)' : 'Normal'}`, 'info');
        break;
      case 'DEPLOY':
        unit.isDeployed = !unit.isDeployed;
        unit.stance = unit.isDeployed ? 'KNEELING' : 'STANDING';
        unit.updateStanceVisuals();
        this.showToast(`Weapon Team ${unit.isDeployed ? 'Deployed' : 'Packed Up'}`, 'info');
        break;
      case 'SPLIT':
        this.game.splitUnit(unit);
        break;
      case 'EXIT_BUILDING':
        this.game.issueBuildingExit(unit);
        break;
    }
  }

  cancelOrDeselect(deselectWhenIdle = true) {
    const cancelled = this.game.commands.cancelActiveMode();
    if (cancelled) {
      this.renderCommandGrid();
      this.showToast('Command tool cancelled', 'info');
    } else if (deselectWhenIdle) {
      this.game.deselectUnit();
    }
  }

  triggerCommand(commandName) {
    if (!this.canIssueOrders()) return;
    if (commandName === 'FAST') this.game.commands.setCommandMode('MOVE_FAST');
    if (commandName === 'QUICK') this.game.commands.setCommandMode('MOVE_QUICK');
    if (commandName === 'HUNT') this.game.commands.setCommandMode('MOVE_HUNT');
    if (commandName === 'TARGET') this.game.commands.setCommandMode('TARGET');
    if (commandName === 'FACE') this.game.commands.setCommandMode('FACE');
    this.renderCommandGrid();
  }

  canIssueOrders() {
    return this.game.wego.playMode === 'realtime' || this.game.wego.phase === 'COMMAND_PHASE';
  }

  updateUnitHUD(unit) {
    if (!unit) {
      const flagEl = document.getElementById('unit-flag');
      if (flagEl) flagEl.innerText = '⚔️';
      const nameEl = document.getElementById('unit-name');
      if (nameEl) nameEl.innerText = 'NO UNIT SELECTED';
      const subEl = document.getElementById('unit-sub');
      if (subEl) subEl.innerText = 'Tap a friendly unit';
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
    if (flagEl) flagEl.innerText = unit.faction === 'french' ? '🇫🇷' : '🇩🇪';

    const nameEl = document.getElementById('unit-name');
    if (nameEl) nameEl.innerText = unit.name;

    const subEl = document.getElementById('unit-sub');
    if (subEl) subEl.innerText = `${unit.type.toUpperCase()} • ${unit.experience} / Leadership +${unit.leadership}`;

    const moraleFill = document.getElementById('meter-morale');
    const txtMorale = document.getElementById('txt-morale');
    if (moraleFill) moraleFill.style.width = unit.morale === 'OK' ? '100%' : (unit.morale === 'Pinned' ? '50%' : '15%');
    if (txtMorale) txtMorale.innerText = unit.morale;

    const suppFill = document.getElementById('meter-suppression');
    const txtSupp = document.getElementById('txt-suppression');
    if (suppFill) suppFill.style.width = `${unit.suppression}%`;
    if (txtSupp) txtSupp.innerText = unit.suppression > 50 ? 'HIGH' : (unit.suppression > 10 ? 'MED' : 'NONE');

    const rosterGrid = document.getElementById('roster-grid');
    if (rosterGrid) {
      rosterGrid.innerHTML = '';
      unit.roster.forEach(s => {
        const slot = document.createElement('div');
        slot.className = `soldier-slot ${s.status.toLowerCase()}`;
        const weapon = getWeapon(s.weaponId ?? s.weapon);
        const ammoText = weapon
          ? `${s.magazineAmmo ?? 0}/${s.reserveAmmo ?? 0}${s.reloadTimer > 0 ? ` · reload ${s.reloadTimer.toFixed(1)}s` : ''}`
          : '';
        const buildingText = s.buildingLocation
          ? ` · ${s.buildingLocation.phase.toUpperCase()} ${s.buildingLocation.nodeId ?? ''}`
          : '';
        slot.title = `${s.role} | ${s.state ?? s.status}${buildingText} | Health ${Math.round(s.health ?? 0)} | Suppression ${Math.round(s.suppression ?? 0)}${ammoText ? ` | Ammo ${ammoText}` : ''}`;
        slot.innerHTML = `
          <span>${s.name}<em>${s.role ?? ''} · HP ${Math.round(s.health ?? 0)} · ${s.state ?? s.status}${buildingText}</em></span>
          <strong>${s.weapon ?? 'Unarmed'}${ammoText ? ` · ${ammoText}` : ''}</strong>
        `;
        rosterGrid.appendChild(slot);
      });
    }
    this.renderVehicleStatus(unit);

    const rifleEl = document.getElementById('ammo-rifle');
    const barEl = document.getElementById('ammo-bar');
    if (unit.vehicleWeapon) {
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
        .filter(agent => getWeapon(agent.weaponId)?.kind === 'rifle')
        .reduce((sum, agent) => sum + agent.magazineAmmo + agent.reserveAmmo, 0);
      const automaticAmmo = agents
        .filter(agent => ['machine_gun', 'submachine_gun'].includes(getWeapon(agent.weaponId)?.kind))
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
      const condition = view.destroyed ? ' · KNOCKED OUT' : (view.burning ? ' · BURNING' : '');
      header.textContent = `CREW, WEAPONS & SYSTEMS · ${view.health}%${condition}`;
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
        item.textContent = `${mount.label} [${mount.status}]: ${mount.weaponId ?? 'UNARMED'} ${mount.feed}/${mount.reserve}${reload}`;
        item.title = `${mount.label}: ${mount.status}`;
        mountGrid.appendChild(item);
      }
    }
    return view;
  }

  updatePhaseDisplay(phase, turnNum, turnTime) {
    const realtime = this.game.wego?.playMode === 'realtime';
    const badge = document.getElementById('phase-badge');
    if (badge) {
      badge.innerText = realtime
        ? (this.game.wego.isPlaying ? 'REALTIME' : 'REALTIME PAUSED')
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
    if (this.game.wego.playMode === 'realtime') {
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
        ? (this.game.wego.isPlaying ? 'PAUSE' : 'RUN')
        : 'GO!';
    }
    document.body.dataset.playMode = mode;
  }

  updateShotInspector(impacts) {
    const list = document.getElementById('shot-inspector-list');
    if (!list) return;
    const latestId = impacts[impacts.length - 1]?.id ?? null;
    if (latestId === this.lastImpactId && list.childElementCount > 0) return;
    this.lastImpactId = latestId;
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
      entry.className = `shot-record ${record.penetrated === true ? 'penetrated' : ''}`;

      const identity = document.createElement('div');
      identity.className = 'shot-record-title';
      identity.textContent = `#${record.id} ${record.shooterId ?? 'unknown'} -> ${record.targetId ?? record.kind}`;

      const range = Number.isFinite(record.rangeMeters) ? record.rangeMeters.toFixed(1) : '0.0';
      const speed = Number.isFinite(record.impactSpeed) ? record.impactSpeed.toFixed(0) : '0';
      const flightTime = Number.isFinite(record.flightTime) ? record.flightTime.toFixed(3) : '0.000';

      const flight = document.createElement('div');
      flight.textContent = `${record.weaponId || 'gun'}/${record.ammoId || 'ap'} | ${range} m | ${speed} m/s | ${flightTime} s`;

      const vectors = document.createElement('div');
      vectors.className = 'shot-record-vectors';
      const mPos = Array.isArray(record.muzzlePosition) ? record.muzzlePosition.map(v => Number.isFinite(v) ? v.toFixed(1) : '0.0').join(', ') : '0, 0, 0';
      const iPos = Array.isArray(record.impactPosition) ? record.impactPosition.map(v => Number.isFinite(v) ? v.toFixed(1) : '0.0').join(', ') : '0, 0, 0';
      vectors.textContent = `muzzle [${mPos}] | impact [${iPos}]`;

      entry.append(identity, flight, vectors);

      if (record.kind === 'vehicle') {
        const armor = document.createElement('div');
        const outcome = record.penetrated ? 'PENETRATED' : 'STOPPED';
        armor.className = `shot-outcome ${record.penetrated ? 'penetrated' : 'stopped'}`;
        const nominal = Number.isFinite(record.nominalArmorMm) ? record.nominalArmorMm.toFixed(1) : '0.0';
        const effective = Number.isFinite(record.effectiveArmorMm) ? record.effectiveArmorMm.toFixed(1) : '0.0';
        const pen = Number.isFinite(record.penetrationMm) ? record.penetrationMm.toFixed(1) : '0.0';
        const cos = Number.isFinite(record.impactCosine) ? record.impactCosine.toFixed(3) : '1.000';
        armor.textContent = `${record.zone || 'hull'} | armor ${nominal} -> ${effective} mm | pen ${pen} mm | cos ${cos} | ${outcome}`;
        entry.appendChild(armor);

        const crew = document.createElement('div');
        crew.className = 'shot-record-crew';
        const casualty = record.crewResult?.casualty;
        const damagedModules = Object.entries(record.crewResult?.damage ?? {})
          .filter(([, state]) => state !== 'OK')
          .map(([module, state]) => `${module}:${state}`);
        crew.textContent = casualty
          ? `crew ${casualty.role ?? casualty.name}: ${casualty.status} (${Math.round(casualty.health)} HP)`
          : `crew none${damagedModules.length ? ` | ${damagedModules.join(', ')}` : ''}`;
        entry.appendChild(crew);
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

      scratchPos.copy(u.position).add(iconOffset);
      scratchPos.project(cameraManager.camera);

      if (scratchPos.z > 1) return;

      const screenX = (scratchPos.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-(scratchPos.y * 0.5) + 0.5) * window.innerHeight;

      activeIds.add(u.id);

      let iconDiv = this.iconPool.get(u.id);
      if (!iconDiv) {
        iconDiv = document.createElement('div');
        iconDiv.className = 'unit-floating-icon';
        iconDiv.addEventListener('click', (e) => {
          e.stopPropagation();
          this.game.selectUnit(u);
        });
        this.iconPool.set(u.id, iconDiv);
        overlay.appendChild(iconDiv);
      }

      iconDiv.style.left = `${screenX}px`;
      iconDiv.style.top = `${screenY}px`;
      iconDiv.style.display = 'block';

      const isSelected = this.game.selectedUnit && this.game.selectedUnit.id === u.id;
      const isFrench = u.faction === 'french';
      const vehicleStatus = isSelected ? buildVehicleStatusView(u) : null;
      const damagedLabels = vehicleStatus?.damagedComponents
        .slice(0, 3)
        .map(component => `${component.label}:${component.status}`)
        .join(' · ');

      const contentKey = `${isFrench}:${isSelected}:${u.name}:${vehicleStatus ? vehicleStatus.health : 'none'}:${damagedLabels || ''}`;
      if (iconDiv.dataset.contentKey !== contentKey) {
        iconDiv.dataset.contentKey = contentKey;
        iconDiv.innerHTML = `
          <div class="icon-badge ${isFrench ? 'french' : 'german'} ${isSelected ? 'selected' : ''}">
            ${u.vehicleSpec ? '🛡️' : '⚔️'}
          </div>
          <div class="icon-label">${u.name}</div>
          ${vehicleStatus ? `
            <div class="vehicle-floating-health ${vehicleStatus.burning ? 'burning' : ''}">
              <span style="width:${vehicleStatus.health}%"></span>
              <strong>${vehicleStatus.destroyed ? 'KNOCKED OUT' : `${vehicleStatus.health}%`}</strong>
            </div>
            ${damagedLabels ? `<div class="vehicle-floating-damage">${damagedLabels}</div>` : ''}
          ` : ''}
        `;
      }
    });

    this.iconPool.forEach((el, id) => {
      if (!activeIds.has(id)) {
        el.style.display = 'none';
      }
    });
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
    const existing = document.getElementById('building-floor-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'building-floor-modal';
    modal.className = 'building-floor-modal';
    modal.innerHTML = `
      <div class="floor-modal-content">
        <div class="floor-modal-title">Select Target Floor</div>
        <div class="floor-modal-buttons">
          <button id="btn-floor-ground" class="btn-floor">Ground Floor</button>
          <button id="btn-floor-upper" class="btn-floor">Upper Floor</button>
          <button id="btn-floor-cancel" class="btn-floor btn-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#btn-floor-ground')?.addEventListener('click', () => {
      close();
      const result = this.game.commands.onBuildingOrder?.(
        unit, 'ENTER_GROUND', pointVec3, buildingId
      );
      if (result?.accepted) {
        this.game.commands.cancelActiveMode();
        this.renderCommandGrid();
        this.showToast('Ordered to Ground Floor', 'info');
      } else {
        this.showToast(result?.reason ?? 'Unable to enter building', 'warn');
      }
    });
    modal.querySelector('#btn-floor-upper')?.addEventListener('click', () => {
      close();
      const result = this.game.commands.onBuildingOrder?.(
        unit, 'ENTER_UPPER', pointVec3, buildingId
      );
      if (result?.accepted) {
        this.game.commands.cancelActiveMode();
        this.renderCommandGrid();
        this.showToast('Ordered to Upper Floor', 'info');
      } else {
        this.showToast(result?.reason ?? 'Unable to enter building', 'warn');
      }
    });
    modal.querySelector('#btn-floor-cancel')?.addEventListener('click', close);
    return true;
  }

  render(units, cameraManager) {
    this.updateFloatingIcons(units, cameraManager);
    if (this.minimap && this.minimap.render) {
      this.minimap.render(units, cameraManager);
    }
    this.updateShotInspector(this.game.combat?.telemetry?.impacts ?? []);
    const now = performance.now();
    if (this.game.selectedUnit && now - this.lastHudUpdate >= 100) {
      this.updateUnitHUD(this.game.selectedUnit);
      this.lastHudUpdate = now;
    }
  }
}
