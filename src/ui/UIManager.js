import * as THREE from 'three';
import { Minimap } from './Minimap.js';
import { getWeapon } from '../game/WeaponCatalog.js';

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

    this.initDOM();
    this.initHotkeys();
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
        // Prevent touch scrolling outside roster grid
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
        { label: 'DEPLOY', action: 'DEPLOY', key: 'D' }
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
        if (!this.canIssueOrders()) {
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
      case 'CANCEL_ACTION':
        this.cancelOrDeselect(false);
        break;
      case 'DESELECT':
        this.game.deselectUnit();
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
  }

  canIssueOrders() {
    return this.game.wego.playMode === 'realtime' || this.game.wego.phase === 'COMMAND_PHASE';
  }

  updateUnitHUD(unit) {
    if (!unit) return;

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
        slot.title = `${s.role} | ${s.state ?? s.status} | Health ${Math.round(s.health ?? 0)} | Suppression ${Math.round(s.suppression ?? 0)}${ammoText ? ` | Ammo ${ammoText}` : ''}`;
        slot.innerHTML = `
          <span>${s.name}<em>${s.role ?? ''} · HP ${Math.round(s.health ?? 0)} · ${s.state ?? s.status}</em></span>
          <strong>${s.weapon ?? ''}${ammoText ? ` · ${ammoText}` : ''}</strong>
        `;
        rosterGrid.appendChild(slot);
      });
    }

    const rifleEl = document.getElementById('ammo-rifle');
    const barEl = document.getElementById('ammo-bar');
    if (unit.vehicleWeapon) {
      const loaded = unit.vehicleWeapon.loadedType?.toUpperCase() ?? 'EMPTY';
      if (rifleEl) rifleEl.innerText = `MAIN GUN: ${loaded}`;
      if (barEl) {
        const ammo = unit.vehicleWeapon.ammunition;
        barEl.innerText = `AP ${ammo.ap} · HE ${ammo.he}${unit.vehicleWeapon.reloadTimer > 0 ? ` · RELOAD ${unit.vehicleWeapon.reloadTimer.toFixed(1)}s` : ''}`;
      }
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
    const nameEl = document.getElementById('unit-name');
    if (nameEl) nameEl.innerText = 'NO UNIT SELECTED';
    const subEl = document.getElementById('unit-sub');
    if (subEl) subEl.innerText = 'Tap a friendly unit';
    const roster = document.getElementById('roster-grid');
    if (roster) roster.innerHTML = '';
    const rifle = document.getElementById('ammo-rifle');
    if (rifle) rifle.innerText = 'RIFLES: --';
    const automatic = document.getElementById('ammo-bar');
    if (automatic) automatic.innerText = 'AUTOMATIC: --';
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

  updateFloatingIcons(units, cameraManager) {
    const overlay = document.getElementById('icon-overlay');
    if (!overlay) return;

    if (!this.showIcons) {
      overlay.innerHTML = '';
      return;
    }

    overlay.innerHTML = '';

    units.forEach(u => {
      if (u.mesh && !u.mesh.visible) return;

      const pos = u.position.clone().add(new THREE.Vector3(0, 3.5, 0));
      pos.project(cameraManager.camera);

      if (pos.z > 1) return;

      const screenX = (pos.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-(pos.y * 0.5) + 0.5) * window.innerHeight;

      const iconDiv = document.createElement('div');
      iconDiv.className = 'unit-floating-icon';
      iconDiv.style.left = `${screenX}px`;
      iconDiv.style.top = `${screenY}px`;

      const isSelected = this.game.selectedUnit && this.game.selectedUnit.id === u.id;
      const isFrench = u.faction === 'french';

      iconDiv.innerHTML = `
        <div class="icon-badge ${isFrench ? 'french' : 'german'} ${isSelected ? 'selected' : ''}">
          ${u.type === 'tank' ? '🛡️' : '⚔️'}
        </div>
        <div class="icon-label">${u.name}</div>
      `;

      iconDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        this.game.selectUnit(u);
      });

      overlay.appendChild(iconDiv);
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

  render(units, cameraManager) {
    this.updateFloatingIcons(units, cameraManager);
    if (this.minimap && this.minimap.render) {
      this.minimap.render(units, cameraManager);
    }
    const now = performance.now();
    if (this.game.selectedUnit && now - this.lastHudUpdate >= 100) {
      this.updateUnitHUD(this.game.selectedUnit);
      this.lastHudUpdate = now;
    }
  }
}
