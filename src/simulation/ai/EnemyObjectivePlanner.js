const MODEL_VERSION = 1;

const DIFFICULTY_POLICY = Object.freeze({
  recruit: Object.freeze({ planLimit: 2, replanIntervalSeconds: 30, delayScale: 1.6 }),
  regular: Object.freeze({ planLimit: Infinity, replanIntervalSeconds: 16, delayScale: 1 }),
  veteran: Object.freeze({ planLimit: Infinity, replanIntervalSeconds: 9, delayScale: 0.55 }),
  crack: Object.freeze({ planLimit: Infinity, replanIntervalSeconds: 5, delayScale: 0.25 })
});

function requireId(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${path} requires a non-empty string`);
  }
  return value;
}

function requirePoint(value, path) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
    throw new TypeError(`${path} must be a finite [x, z] point`);
  }
  return Object.freeze([...value]);
}

function normalizeWaypoint(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be a record`);
  }
  const orders = value.orders ?? {};
  return Object.freeze({
    position: requirePoint(value.position, `${path}.position`),
    orders: Object.freeze({
      armor: orders.armor ?? 'HUNT',
      infantry: orders.infantry ?? 'QUICK',
      transport: orders.transport ?? 'MOVE',
      support: orders.support ?? 'HUNT'
    }),
    pauseSeconds: Number.isFinite(value.pauseSeconds)
      ? Math.max(0, value.pauseSeconds)
      : 0
  });
}

export function normalizeEnemyPlanSet(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new TypeError('enemyPlanSet must be a record');
  }
  if (!Array.isArray(spec.plans) || spec.plans.length < 2) {
    throw new Error('enemyPlanSet requires at least two plans');
  }
  const planIds = new Set();
  const plans = spec.plans.map((plan, planIndex) => {
    const path = `enemyPlanSet.plans[${planIndex}]`;
    const id = requireId(plan?.id, `${path}.id`);
    if (planIds.has(id)) throw new Error(`Duplicate enemy plan ${id}`);
    planIds.add(id);
    if (!Array.isArray(plan.lanes) || plan.lanes.length === 0) {
      throw new Error(`${path}.lanes requires at least one lane`);
    }
    const laneIds = new Set();
    const lanes = plan.lanes.map((lane, laneIndex) => {
      const lanePath = `${path}.lanes[${laneIndex}]`;
      const laneId = requireId(lane?.id, `${lanePath}.id`);
      if (laneIds.has(laneId)) throw new Error(`Duplicate plan lane ${laneId}`);
      laneIds.add(laneId);
      if (!Array.isArray(lane.setupSlots) || lane.setupSlots.length === 0) {
        throw new Error(`${lanePath}.setupSlots requires at least one point`);
      }
      if (!Array.isArray(lane.route) || lane.route.length === 0) {
        throw new Error(`${lanePath}.route requires at least one waypoint`);
      }
      const preferredRoles = lane.preferredRoles ?? [];
      if (!preferredRoles.every(role => (
        ['armor', 'infantry', 'transport', 'support'].includes(role)
      ))) {
        throw new Error(`${lanePath}.preferredRoles contains an unknown role`);
      }
      return Object.freeze({
        id: laneId,
        preferredRoles: Object.freeze([...preferredRoles]),
        setupSlots: Object.freeze(lane.setupSlots.map((point, pointIndex) =>
          requirePoint(point, `${lanePath}.setupSlots[${pointIndex}]`)
        )),
        route: Object.freeze(lane.route.map((waypoint, waypointIndex) =>
          normalizeWaypoint(waypoint, `${lanePath}.route[${waypointIndex}]`)
        )),
        startDelaySeconds: Number.isFinite(lane.startDelaySeconds)
          ? Math.max(0, lane.startDelaySeconds)
          : 0
      });
    });
    return Object.freeze({ id, lanes: Object.freeze(lanes) });
  });
  return Object.freeze({
    id: requireId(spec.id, 'enemyPlanSet.id'),
    factionId: requireId(spec.factionId, 'enemyPlanSet.factionId'),
    dataQuality: requireId(spec.dataQuality, 'enemyPlanSet.dataQuality'),
    plans: Object.freeze(plans)
  });
}

function unitRole(unit) {
  if (unit?.mortarTeamConfig || unit?.type === 'gun') return 'support';
  if (unit?.type === 'infantry_squad') return 'infantry';
  if (unit?.isTransportVehicle?.() || unit?.transportVehicle === true) {
    return 'transport';
  }
  return unit?.vehicleSpec || unit?.vehicle === true ? 'armor' : 'support';
}

function isCombatEffective(unit) {
  return typeof unit?.isCombatEffective === 'function'
    ? unit.isCombatEffective()
    : unit?.combatEffective !== false;
}

function isMobile(unit) {
  return unit?.type !== 'bunker' && unit?.type !== 'structure';
}

function currentPosition(unit) {
  if (Array.isArray(unit?.position)) {
    return [unit.position[0], unit.position[2] ?? unit.position[1]];
  }
  return [unit?.position?.x ?? 0, unit?.position?.z ?? 0];
}

function squaredDistance(left, right) {
  const x = left[0] - right[0];
  const z = left[1] - right[1];
  return x * x + z * z;
}

function cloneAssignment(assignment) {
  return {
    unitId: assignment.unitId,
    role: assignment.role,
    laneId: assignment.laneId,
    setupPosition: [...assignment.setupPosition]
  };
}

function cloneState(state) {
  return {
    modelVersion: MODEL_VERSION,
    planSetId: state.planSetId,
    selectedPlanId: state.selectedPlanId,
    prepared: state.prepared,
    battleStarted: state.battleStarted,
    elapsedSeconds: state.elapsedSeconds,
    replanRemainderSeconds: state.replanRemainderSeconds,
    commandRevision: state.commandRevision,
    assignments: state.assignments.map(cloneAssignment)
  };
}

export class EnemyObjectivePlanner {
  constructor({ planSet, difficultyId = 'regular', random, savedState = null }) {
    this.planSet = normalizeEnemyPlanSet(planSet);
    this.difficultyId = difficultyId;
    this.policy = DIFFICULTY_POLICY[difficultyId];
    if (!this.policy) throw new Error(`Unknown AI difficulty ${difficultyId}`);
    if (typeof random !== 'function') throw new TypeError('AI planner requires injected random');
    this.random = random;
    this.state = {
      modelVersion: MODEL_VERSION,
      planSetId: this.planSet.id,
      selectedPlanId: null,
      prepared: false,
      battleStarted: false,
      elapsedSeconds: 0,
      replanRemainderSeconds: 0,
      commandRevision: 0,
      assignments: []
    };
    if (savedState) this.restoreState(savedState);
  }

  selectedPlan() {
    return this.planSet.plans.find(plan => plan.id === this.state.selectedPlanId) ?? null;
  }

  prepare(units) {
    if (this.state.prepared) return this.getSetupCommands();
    const planCount = Math.min(this.planSet.plans.length, this.policy.planLimit);
    const selectedIndex = Math.min(
      planCount - 1,
      Math.floor(this.random() * planCount)
    );
    const plan = this.planSet.plans[selectedIndex];
    const candidates = units
      .filter(unit => (
        unit?.faction === this.planSet.factionId
        && isMobile(unit)
        && isCombatEffective(unit)
      ))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const laneCounts = new Map(plan.lanes.map(lane => [lane.id, 0]));
    this.state.assignments = candidates.map(unit => {
      const role = unitRole(unit);
      const lane = [...plan.lanes].sort((left, right) => {
        const leftPreferred = left.preferredRoles.includes(role) ? 0 : 1;
        const rightPreferred = right.preferredRoles.includes(role) ? 0 : 1;
        if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
        const countDifference = laneCounts.get(left.id) - laneCounts.get(right.id);
        return countDifference || left.id.localeCompare(right.id);
      })[0];
      const slotIndex = laneCounts.get(lane.id);
      laneCounts.set(lane.id, slotIndex + 1);
      const setupPosition = lane.setupSlots[
        Math.min(slotIndex, lane.setupSlots.length - 1)
      ];
      return {
        unitId: String(unit.id),
        role,
        laneId: lane.id,
        setupPosition: [...setupPosition]
      };
    });
    this.state.selectedPlanId = plan.id;
    this.state.prepared = true;
    return this.getSetupCommands();
  }

  getSetupCommands() {
    return this.state.assignments.map(assignment => ({
      type: 'SETUP_POSITION',
      unitId: assignment.unitId,
      position: [...assignment.setupPosition],
      planId: this.state.selectedPlanId,
      laneId: assignment.laneId
    }));
  }

  beginBattle(units) {
    if (!this.state.prepared) this.prepare(units);
    if (this.state.battleStarted) return [];
    this.state.battleStarted = true;
    return this.routeCommands(units, { initial: true });
  }

  advance(deltaSeconds, units, missionReport = null) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError('AI planner deltaSeconds must be finite and non-negative');
    }
    if (!this.state.battleStarted || missionReport?.status === 'COMPLETE') return [];
    this.state.elapsedSeconds += deltaSeconds;
    this.state.replanRemainderSeconds += deltaSeconds;
    if (this.state.replanRemainderSeconds + 1e-9 < this.policy.replanIntervalSeconds) {
      return [];
    }
    this.state.replanRemainderSeconds %= this.policy.replanIntervalSeconds;
    return this.routeCommands(units, { initial: false });
  }

  routeCommands(units, { initial }) {
    const plan = this.selectedPlan();
    if (!plan) return [];
    const unitById = new Map(units.map(unit => [String(unit.id), unit]));
    const commands = [];
    for (const assignment of this.state.assignments) {
      const unit = unitById.get(assignment.unitId);
      if (!unit || !isCombatEffective(unit)) continue;
      const activeWaypointCount = Math.max(
        0,
        (unit.waypoints?.length ?? unit.activeWaypointCount ?? 0)
          - (unit.currentWaypointIndex ?? 0)
      );
      if (!initial && activeWaypointCount > 0) continue;
      const lane = plan.lanes.find(candidate => candidate.id === assignment.laneId);
      if (!lane) continue;
      let route = lane.route;
      if (!initial) {
        const position = currentPosition(unit);
        const closestIndex = route.reduce((bestIndex, waypoint, index) => (
          squaredDistance(position, waypoint.position)
            < squaredDistance(position, route[bestIndex].position)
            ? index
            : bestIndex
        ), 0);
        route = route.slice(Math.min(route.length - 1, closestIndex + 1));
      }
      const startDelaySeconds = initial
        ? lane.startDelaySeconds * this.policy.delayScale
        : 0;
      commands.push({
        type: 'REPLACE_ROUTE',
        unitId: assignment.unitId,
        planId: plan.id,
        laneId: lane.id,
        revision: ++this.state.commandRevision,
        startDelaySeconds,
        waypoints: route.map(waypoint => ({
          position: [...waypoint.position],
          orderType: waypoint.orders[assignment.role],
          pauseSeconds: waypoint.pauseSeconds
        }))
      });
    }
    return commands;
  }

  getDiagnostics() {
    return Object.freeze({
      planSetId: this.planSet.id,
      selectedPlanId: this.state.selectedPlanId,
      difficultyId: this.difficultyId,
      prepared: this.state.prepared,
      battleStarted: this.state.battleStarted,
      assignmentCount: this.state.assignments.length,
      commandRevision: this.state.commandRevision
    });
  }

  captureState() {
    return cloneState(this.state);
  }

  restoreState(savedState) {
    if (!savedState || savedState.planSetId !== this.planSet.id) {
      throw new Error(`AI planner state must belong to ${this.planSet.id}`);
    }
    if (savedState.selectedPlanId != null
        && !this.planSet.plans.some(plan => plan.id === savedState.selectedPlanId)) {
      throw new Error(`Unknown restored AI plan ${savedState.selectedPlanId}`);
    }
    this.state = {
      modelVersion: MODEL_VERSION,
      planSetId: this.planSet.id,
      selectedPlanId: savedState.selectedPlanId ?? null,
      prepared: Boolean(savedState.prepared),
      battleStarted: Boolean(savedState.battleStarted),
      elapsedSeconds: Math.max(0, savedState.elapsedSeconds ?? 0),
      replanRemainderSeconds: Math.max(0, savedState.replanRemainderSeconds ?? 0),
      commandRevision: Math.max(0, savedState.commandRevision ?? 0),
      assignments: (savedState.assignments ?? []).map(cloneAssignment)
    };
    return this.getDiagnostics();
  }
}
