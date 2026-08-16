const MODEL_VERSION = 1;

export const MISSION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETE: 'COMPLETE'
});

function requireId(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${path} requires a non-empty string`);
  }
  return value;
}

function requireFinite(value, path, { positive = false } = {}) {
  if (!Number.isFinite(value) || (positive && value <= 0)) {
    throw new TypeError(`${path} must be ${positive ? 'positive and ' : ''}finite`);
  }
  return value;
}

function normalizeZone(zone, path) {
  if (!zone || typeof zone !== 'object' || Array.isArray(zone)) {
    throw new TypeError(`${path} must be a record`);
  }
  const normalized = {};
  for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) {
    normalized[key] = requireFinite(zone[key], `${path}.${key}`);
  }
  if (normalized.minX >= normalized.maxX || normalized.minZ >= normalized.maxZ) {
    throw new Error(`${path} requires increasing bounds`);
  }
  return Object.freeze(normalized);
}

export function normalizeBreakthroughObjective(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new TypeError('objective must be a record');
  }
  if (spec.type !== 'BREAKTHROUGH') {
    throw new Error(`Unsupported objective type ${spec.type ?? 'missing'}`);
  }
  const attackerFactionId = requireId(
    spec.attackerFactionId,
    'objective.attackerFactionId'
  );
  const defenderFactionId = requireId(
    spec.defenderFactionId,
    'objective.defenderFactionId'
  );
  if (attackerFactionId === defenderFactionId) {
    throw new Error('objective factions must be different');
  }
  return Object.freeze({
    id: requireId(spec.id, 'objective.id'),
    type: 'BREAKTHROUGH',
    attackerFactionId,
    defenderFactionId,
    exitZone: normalizeZone(spec.exitZone, 'objective.exitZone'),
    timeLimitSeconds: requireFinite(
      spec.timeLimitSeconds,
      'objective.timeLimitSeconds',
      { positive: true }
    ),
    dataQuality: requireId(spec.dataQuality, 'objective.dataQuality')
  });
}

function unitPosition(unit) {
  const value = unit?.position;
  if (Array.isArray(value)) return { x: value[0], z: value[2] ?? value[1] };
  return { x: value?.x, z: value?.z };
}

function isCombatEffective(unit) {
  if (typeof unit?.isCombatEffective === 'function') {
    return unit.isCombatEffective();
  }
  return unit?.combatEffective !== false;
}

function isMobileForBreakthrough(unit) {
  return unit?.type !== 'bunker' && unit?.type !== 'structure';
}

function isInsideZone(unit, zone) {
  const { x, z } = unitPosition(unit);
  return Number.isFinite(x) && Number.isFinite(z)
    && x >= zone.minX && x <= zone.maxX
    && z >= zone.minZ && z <= zone.maxZ;
}

function cloneState(state) {
  return {
    modelVersion: MODEL_VERSION,
    objectiveId: state.objectiveId,
    elapsedSeconds: state.elapsedSeconds,
    status: state.status,
    winnerFactionId: state.winnerFactionId,
    resolution: state.resolution,
    exitReachedByUnitId: state.exitReachedByUnitId
  };
}

export class ScenarioObjectiveSystem {
  constructor(spec, savedState = null) {
    this.spec = normalizeBreakthroughObjective(spec);
    this.state = {
      modelVersion: MODEL_VERSION,
      objectiveId: this.spec.id,
      elapsedSeconds: 0,
      status: MISSION_STATUS.ACTIVE,
      winnerFactionId: null,
      resolution: null,
      exitReachedByUnitId: null
    };
    if (savedState) this.restoreState(savedState);
  }

  advance(deltaSeconds, units) {
    if (this.state.status !== MISSION_STATUS.ACTIVE) return this.getReport();
    requireFinite(deltaSeconds, 'deltaSeconds');
    if (deltaSeconds < 0) throw new RangeError('deltaSeconds must not be negative');
    if (!Array.isArray(units)) throw new TypeError('units must be an array');

    this.state.elapsedSeconds = Math.min(
      this.spec.timeLimitSeconds,
      this.state.elapsedSeconds + deltaSeconds
    );
    const orderedAttackers = units
      .filter(unit => unit?.faction === this.spec.attackerFactionId)
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const breakthroughUnit = orderedAttackers.find(unit => (
      isCombatEffective(unit)
      && isMobileForBreakthrough(unit)
      && isInsideZone(unit, this.spec.exitZone)
    ));
    if (breakthroughUnit) {
      this.complete(
        this.spec.attackerFactionId,
        'ATTACKER_REACHED_EXIT',
        String(breakthroughUnit.id)
      );
      return this.getReport();
    }

    if (!orderedAttackers.some(isCombatEffective)) {
      this.complete(this.spec.defenderFactionId, 'ATTACKER_ELIMINATED');
      return this.getReport();
    }

    if (this.state.elapsedSeconds >= this.spec.timeLimitSeconds) {
      this.complete(this.spec.defenderFactionId, 'TIME_LIMIT_DEFENDED');
    }
    return this.getReport();
  }

  complete(winnerFactionId, resolution, exitReachedByUnitId = null) {
    this.state.status = MISSION_STATUS.COMPLETE;
    this.state.winnerFactionId = winnerFactionId;
    this.state.resolution = resolution;
    this.state.exitReachedByUnitId = exitReachedByUnitId;
  }

  getReport() {
    return Object.freeze({
      ...cloneState(this.state),
      timeLimitSeconds: this.spec.timeLimitSeconds,
      remainingSeconds: Math.max(
        0,
        this.spec.timeLimitSeconds - this.state.elapsedSeconds
      ),
      attackerFactionId: this.spec.attackerFactionId,
      defenderFactionId: this.spec.defenderFactionId,
      exitZone: this.spec.exitZone
    });
  }

  captureState() {
    return cloneState(this.state);
  }

  restoreState(savedState) {
    if (!savedState || savedState.objectiveId !== this.spec.id) {
      throw new Error(`Objective state must belong to ${this.spec.id}`);
    }
    const elapsedSeconds = requireFinite(
      savedState.elapsedSeconds,
      'objectiveState.elapsedSeconds'
    );
    if (elapsedSeconds < 0 || elapsedSeconds > this.spec.timeLimitSeconds) {
      throw new RangeError('objectiveState.elapsedSeconds lies outside mission time');
    }
    if (!Object.values(MISSION_STATUS).includes(savedState.status)) {
      throw new Error(`Unknown objective status ${savedState.status}`);
    }
    this.state = {
      modelVersion: MODEL_VERSION,
      objectiveId: this.spec.id,
      elapsedSeconds,
      status: savedState.status,
      winnerFactionId: savedState.winnerFactionId ?? null,
      resolution: savedState.resolution ?? null,
      exitReachedByUnitId: savedState.exitReachedByUnitId ?? null
    };
    return this.getReport();
  }
}
