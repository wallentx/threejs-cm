import * as THREE from 'three';
import { Minimap } from './Minimap.js';
import { buildVehicleStatusView } from './VehicleStatusPresenter.js';

const scratchPos = new THREE.Vector3();
const iconOffset = new THREE.Vector3(0, 3.5, 0);

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
    this.showHUD = true;
    this.lastHudUpdate = 0;
    this.lastImpactKey = null;
    this.iconPool = new Map();

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
    const hasSelection = Boolean(this.runtime.selectedUnit);
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
        ...(this.runtime.selectedUnit?.soldierAI?.agents.some(
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
      case 'DEPLOY': {
        const deployed = this.runtime.toggleDeployment();
        this.showToast(`Weapon Team ${deployed ? 'Deployed' : 'Packed Up'}`, 'info');
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
    if (commandName === 'FAST') this.runtime.setCommandMode('MOVE_FAST');
    if (commandName === 'QUICK') this.runtime.setCommandMode('MOVE_QUICK');
    if (commandName === 'HUNT') this.runtime.setCommandMode('MOVE_HUNT');
    if (commandName === 'TARGET') this.runtime.setCommandMode('TARGET');
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
    if (flagEl) {
      flagEl.innerText = this.runtime.getFactionPresentation(unit.faction)?.flagGlyph ?? '⚔️';
    }

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
        slot.title = `${s.role} | ${s.state ?? s.status}${buildingText}${aimText} | Health ${Math.round(s.health ?? 0)} | Suppression ${Math.round(s.suppression ?? 0)}${ammoText ? ` | Ammo ${ammoText}` : ''}`;
        slot.innerHTML = `
          <span>${s.name}<em>${s.role ?? ''} · HP ${Math.round(s.health ?? 0)} · ${s.state ?? s.status}${buildingText}${aimText}</em></span>
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
          this.runtime.selectUnit(u);
        });
        this.iconPool.set(u.id, iconDiv);
        overlay.appendChild(iconDiv);
      }

      iconDiv.style.left = `${screenX}px`;
      iconDiv.style.top = `${screenY}px`;
      iconDiv.style.display = 'block';

      const isSelected = this.runtime.selectedUnit?.id === u.id;
      const isPlayer = this.runtime.isPlayerFaction(u.faction);
      const presentation = this.runtime.getFactionPresentation(u.faction);
      const vehicleStatus = isSelected ? buildVehicleStatusView(u) : null;
      const damagedLabels = vehicleStatus?.damagedComponents
        .slice(0, 3)
        .map(component => `${component.label}:${component.status}`)
        .join(' · ');

      const contentKey = `${u.faction}:${presentation?.selectionColor}:${isPlayer}:${isSelected}:${u.name}:${vehicleStatus ? vehicleStatus.health : 'none'}:${damagedLabels || ''}`;
      if (iconDiv.dataset.contentKey !== contentKey) {
        iconDiv.dataset.contentKey = contentKey;
        iconDiv.innerHTML = `
          <div class="icon-badge faction ${isPlayer ? 'friendly' : 'hostile'} ${isSelected ? 'selected' : ''}">
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
        iconDiv.querySelector('.icon-badge')?.style.setProperty(
          '--faction-color',
          presentation?.selectionColor ?? '#64748b'
        );
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
      const result = this.runtime.issueBuildingOrder(
        unit, 'ENTER_GROUND', pointVec3, buildingId
      );
      if (result?.accepted) {
        this.runtime.cancelCommandMode();
        this.renderCommandGrid();
        this.showToast('Ordered to Ground Floor', 'info');
      } else {
        this.showToast(result?.reason ?? 'Unable to enter building', 'warn');
      }
    });
    modal.querySelector('#btn-floor-upper')?.addEventListener('click', () => {
      close();
      const result = this.runtime.issueBuildingOrder(
        unit, 'ENTER_UPPER', pointVec3, buildingId
      );
      if (result?.accepted) {
        this.runtime.cancelCommandMode();
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
    this.updateShotInspector(this.runtime.getImpacts());
    const now = performance.now();
    if (this.runtime.selectedUnit && now - this.lastHudUpdate >= 100) {
      this.updateUnitHUD(this.runtime.selectedUnit);
      this.lastHudUpdate = now;
    }
  }
}
