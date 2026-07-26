export class WegoManager {
  constructor(game) {
    this.game = game;
    this.playMode = 'wego'; // 'wego' or 'realtime'
    this.phase = 'COMMAND_PHASE'; // 'COMMAND_PHASE' or 'ACTION_PHASE'
    
    this.turnNumber = 1;
    this.turnDuration = 60.0; // 60 seconds per turn in CMBN
    this.currentTurnTime = 0.0;
    this.isPlaying = false;
    this.playbackSpeed = 1.0;
    this.matchStarted = false;

    this.historySnapshots = [];
    this.turnStartSnapshot = null;
    this.nextSnapshotTime = 1.0;
  }

  setPlayMode(mode, options = {}) {
    if (!['wego', 'realtime'].includes(mode)) return false;
    const { silent = false } = options;
    const changed = this.playMode !== mode;
    this.playMode = mode;
    if (mode === 'realtime') {
      this.beginMatch();
      this.phase = 'ACTION_PHASE';
      this.isPlaying = true;
      if (changed) this.currentTurnTime = 0;
      this.turnStartSnapshot = null;
      this.historySnapshots = [];
      this.nextSnapshotTime = 1;
    } else if (changed) {
      this.phase = 'COMMAND_PHASE';
      this.isPlaying = false;
      this.currentTurnTime = 0;
      this.turnStartSnapshot = null;
      this.historySnapshots = [];
      this.nextSnapshotTime = 1;
    }
    this.game.commands?.setCommandMode(null);
    this.updateDisplay();
    if (!silent && changed) {
      this.game.ui?.showToast(
        mode === 'realtime'
          ? 'Realtime active: simulation running and orders unlocked'
          : 'WEGO active: issue orders, then press GO',
        'info'
      );
    }
    return true;
  }

  executeTurn() {
    if (this.playMode === 'realtime') {
      this.phase = 'ACTION_PHASE';
      this.isPlaying = true;
      this.updateDisplay();
      return;
    }
    if (this.phase === 'ACTION_PHASE' && this.playMode === 'wego') return;

    this.beginMatch();
    this.phase = 'ACTION_PHASE';
    this.currentTurnTime = 0.0;
    this.isPlaying = true;
    this.game.commands?.setCommandMode(null);
    this.turnStartSnapshot = this.game.captureSimulationState();
    this.historySnapshots = [{ time: 0, state: this.turnStartSnapshot }];
    this.nextSnapshotTime = 1.0;

    if (this.game.ui) {
      this.game.ui.updatePhaseDisplay(this.phase, this.turnNumber, this.currentTurnTime);
      this.game.ui.showToast(`Turn ${this.turnNumber} Action Phase Initiated!`, 'info');
    }
  }

  beginMatch() {
    if (this.matchStarted) return false;
    this.matchStarted = true;
    this.game.beginMatch?.();
    return true;
  }

  isSetupPhase() {
    return !this.matchStarted && this.playMode === 'wego' && this.phase === 'COMMAND_PHASE';
  }

  togglePlayPause() {
    if (this.phase === 'COMMAND_PHASE' && this.playMode === 'wego') {
      this.executeTurn();
      return;
    }
    this.isPlaying = !this.isPlaying;
    this.updateDisplay();
  }

  rewindTurn() {
    this.seekTime(0);
  }

  stepTime(seconds) {
    this.seekTime(this.currentTurnTime + seconds);
  }

  toggleFastSpeed() {
    if (this.playbackSpeed === 1.0) this.playbackSpeed = 2.0;
    else if (this.playbackSpeed === 2.0) this.playbackSpeed = 4.0;
    else this.playbackSpeed = 1.0;
    this.updateDisplay();
  }

  getSimulationDelta(delta) {
    if (this.phase !== 'ACTION_PHASE' || !this.isPlaying) return 0;
    const effectiveDelta = Math.max(0, delta) * this.playbackSpeed;
    if (this.playMode !== 'wego') return effectiveDelta;
    return Math.min(effectiveDelta, Math.max(0, this.turnDuration - this.currentTurnTime));
  }

  completeSimulationStep(delta, options = {}) {
    if (delta <= 0) return;
    const { recordSnapshot = true, updateUI = true } = options;
    if (this.playMode === 'realtime') {
      this.currentTurnTime += delta;
      if (updateUI) this.updateDisplay();
      return;
    }
    this.currentTurnTime = Math.min(this.turnDuration, this.currentTurnTime + delta);

    if (recordSnapshot && this.playMode === 'wego' && this.currentTurnTime >= this.nextSnapshotTime) {
      this.historySnapshots.push({
        time: this.currentTurnTime,
        state: this.game.captureSimulationState()
      });
      this.nextSnapshotTime = Math.floor(this.currentTurnTime) + 1;
    }

    if (this.playMode === 'wego' && this.currentTurnTime >= this.turnDuration) {
      this.currentTurnTime = this.turnDuration;
      this.phase = 'COMMAND_PHASE';
      this.isPlaying = false;
      this.turnNumber++;
      for (const unit of this.game.units ?? []) unit.pruneCompletedWaypoints?.();
      this.game.commands?.cancelActiveMode?.();
      this.game.commands?.renderOverlays?.();
      if (this.game.ui) {
        this.game.ui.updatePhaseDisplay(this.phase, this.turnNumber, 0);
        this.game.ui.showToast(`Turn ${this.turnNumber} Command Phase Ready!`, 'success');
      }
      return;
    }

    if (updateUI) this.updateDisplay();
  }

  seekTime(requestedTime) {
    if (this.playMode !== 'wego' || !this.turnStartSnapshot) return;
    const targetTime = Math.max(0, Math.min(this.turnDuration, requestedTime));
    const snapshot = [...this.historySnapshots]
      .reverse()
      .find(entry => entry.time <= targetTime) ?? this.historySnapshots[0];

    this.isPlaying = false;
    this.phase = 'ACTION_PHASE';
    this.game.restoreSimulationState(snapshot.state);
    this.currentTurnTime = snapshot.time;
    this.game.simulateToTime(targetTime);
    this.isPlaying = false;
    this.updateDisplay();
  }

  updateDisplay() {
    if (!this.game.ui) return;
    this.game.ui.updatePhaseDisplay(this.phase, this.turnNumber, this.currentTurnTime);
    this.game.ui.updatePlaybackDisplay?.(this.isPlaying, this.playbackSpeed);
    this.game.ui.updatePlayModeDisplay?.(this.playMode);
  }
}
